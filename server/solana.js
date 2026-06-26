/* ============================================================
   LifeSim — Solana payout adapter (SERVER ONLY)
   Sends real SOL / USDC from the operator's TREASURY wallet to a
   player's connected wallet. The treasury secret key lives only here,
   read from an environment variable — it must NEVER reach the client
   or a public repo (see .gitignore / .env.example).

   Everything is lazy-loaded: if @solana/web3.js isn't installed (e.g.
   a community-only deploy) this module reports `available:false` and
   the API gracefully refuses payouts instead of crashing.

   Defaults to Solana MAINNET. Real payouts only fire once you fund the
   treasury and flip the master switch (after your own legal/security review):
     P2E_SOLANA_NETWORK=mainnet-beta   (default)
     P2E_PAYOUTS_ENABLED=true
   ============================================================ */

'use strict';

const env = process.env;

let web3 = null, splToken = null, nacl = null, bs58 = null;
let loadError = null;
try {
  web3 = require('@solana/web3.js');
  bs58 = require('bs58');
  if (bs58 && bs58.default) bs58 = bs58.default; // bs58 v5+ ships ESM → funcs live on .default
  nacl = require('tweetnacl');
  if (nacl && nacl.default) nacl = nacl.default;
  try { splToken = require('@solana/spl-token'); } catch (e) { splToken = null; } // only needed for USDC
} catch (e) {
  loadError = e;
}

const NETWORK = env.P2E_SOLANA_NETWORK || 'mainnet-beta'; // mainnet-beta | devnet | testnet
const REWARD_ASSET = (env.P2E_REWARD_ASSET || 'SOL').toUpperCase() === 'USDC' ? 'USDC' : 'SOL';
const USDC_MINT = env.P2E_REWARD_MINT || (
  NETWORK === 'mainnet-beta'
    ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // mainnet USDC
    : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'   // devnet USDC (circle test)
);

/* ---------------- treasury keypair (private!) ---------------- */

function loadTreasury() {
  const raw = (env.P2E_TREASURY_SECRET || '').trim();
  if (!raw || !web3) return null;
  try {
    let bytes;
    if (raw[0] === '[') {
      bytes = Uint8Array.from(JSON.parse(raw));        // solana-keygen json array
    } else {
      bytes = bs58.decode(raw);                        // Phantom base58 export
    }
    return web3.Keypair.fromSecretKey(bytes);
  } catch (e) {
    loadError = e;
    return null;
  }
}

let _treasury = null;
function treasury() { if (!_treasury) _treasury = loadTreasury(); return _treasury; }

let _conn = null;
function connection() {
  if (!_conn) {
    const url = env.P2E_SOLANA_RPC_URL || web3.clusterApiUrl(NETWORK);
    _conn = new web3.Connection(url, 'confirmed');
  }
  return _conn;
}

function available() { return !!(web3 && treasury()); }
function canVerify() { return !!(web3 && nacl && bs58); } // signature checks need no treasury
function treasuryAddress() { const t = treasury(); return t ? t.publicKey.toBase58() : ''; }

function explorerTx(sig) {
  const cluster = NETWORK === 'mainnet-beta' ? '' : ('?cluster=' + NETWORK);
  return 'https://explorer.solana.com/tx/' + sig + cluster;
}

/* ---------------- ownership proof ---------------- */
// Verify a player actually controls the wallet they're linking by
// checking an ed25519 signature over our challenge message. This
// protects the *player* from paying out to a wrong/typo'd address.
function verifyWalletSignature(address, message, signatureB58) {
  if (!web3 || !nacl || !bs58) return false;
  try {
    const pub = new web3.PublicKey(address).toBytes();
    const msg = new TextEncoder().encode(message);
    const sig = bs58.decode(signatureB58);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch (e) {
    return false;
  }
}

function isValidAddress(address) {
  if (!web3) return false;
  try { new web3.PublicKey(address); return true; } catch (e) { return false; }
}

/* ---------------- balance guard ---------------- */
async function treasuryBalanceLamports() {
  const t = treasury(); if (!t) return 0;
  return connection().getBalance(t.publicKey);
}

/* ---------------- payouts ---------------- */
// Send `base` units (lamports for SOL, micro-USDC for USDC) to `toAddress`.
// Returns { ok, signature } or { ok:false, error }.
async function payout(toAddress, base) {
  if (!available()) return { ok: false, error: 'payouts_unavailable' };
  if (!isValidAddress(toAddress)) return { ok: false, error: 'bad_address' };
  if (!Number.isInteger(base) || base <= 0) return { ok: false, error: 'bad_amount' };
  try {
    return REWARD_ASSET === 'USDC'
      ? await payoutUSDC(toAddress, base)
      : await payoutSOL(toAddress, base);
  } catch (e) {
    return { ok: false, error: 'send_failed', detail: String(e && e.message || e) };
  }
}

async function payoutSOL(toAddress, lamports) {
  const t = treasury(), conn = connection();
  // Keep a small rent/fee buffer so we never strand the treasury.
  const bal = await conn.getBalance(t.publicKey);
  if (bal < lamports + 5000) return { ok: false, error: 'treasury_insufficient' };

  const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
    fromPubkey: t.publicKey,
    toPubkey: new web3.PublicKey(toAddress),
    lamports
  }));
  const sig = await web3.sendAndConfirmTransaction(conn, tx, [t], {
    commitment: 'confirmed', maxRetries: 3
  });
  return { ok: true, signature: sig };
}

async function payoutUSDC(toAddress, microUsdc) {
  if (!splToken) return { ok: false, error: 'spl_token_missing' };
  const t = treasury(), conn = connection();
  const mint = new web3.PublicKey(USDC_MINT);
  const owner = new web3.PublicKey(toAddress);

  const fromAta = await splToken.getOrCreateAssociatedTokenAccount(conn, t, mint, t.publicKey);
  if (Number(fromAta.amount) < microUsdc) return { ok: false, error: 'treasury_insufficient' };
  const toAta = await splToken.getOrCreateAssociatedTokenAccount(conn, t, mint, owner);

  const tx = new web3.Transaction().add(splToken.createTransferInstruction(
    fromAta.address, toAta.address, t.publicKey, microUsdc
  ));
  const sig = await web3.sendAndConfirmTransaction(conn, tx, [t], {
    commitment: 'confirmed', maxRetries: 3
  });
  return { ok: true, signature: sig };
}

module.exports = {
  available, canVerify, loadError, NETWORK, REWARD_ASSET, USDC_MINT,
  treasuryAddress, treasuryBalanceLamports,
  verifyWalletSignature, isValidAddress,
  payout, explorerTx
};
