/* ============================================================
   Verify your P2E payout setup BEFORE going live.
   Uses the real server/solana.js with YOUR environment, so it tests
   exactly what production will do — treasury key parsing, RPC
   connectivity, balance, and (if funded) a tiny real transfer.

   Usage (from server/):
     # devnet dry-run with a throwaway recipient:
     P2E_SOLANA_NETWORK=devnet P2E_TREASURY_SECRET=... node scripts/verify-payout.js

     # send to a specific address:
     node scripts/verify-payout.js <recipientAddress> [lamports]

   On Windows PowerShell, set vars first:
     $env:P2E_SOLANA_NETWORK="devnet"; $env:P2E_TREASURY_SECRET="..."; node scripts/verify-payout.js
   ============================================================ */
'use strict';

const path = require('path');
const solana = require(path.join(__dirname, '..', 'solana.js'));

(async () => {
  console.log('network        :', solana.NETWORK);
  console.log('reward asset   :', solana.REWARD_ASSET);
  console.log('libs available :', solana.available() ? 'yes' : 'NO (run `npm install` and set P2E_TREASURY_SECRET)');
  if (!solana.available()) {
    if (solana.loadError) console.log('load error     :', solana.loadError.message);
    process.exit(1);
  }
  console.log('treasury       :', solana.treasuryAddress());

  if (solana.REWARD_ASSET === 'SOL') {
    const lamports = await solana.treasuryBalanceLamports();
    console.log('treasury bal   :', lamports / 1e9, 'SOL');
    if (lamports === 0) {
      console.log('\n⚠ Treasury is empty. Fund', solana.treasuryAddress());
      if (solana.NETWORK !== 'mainnet-beta') console.log('  Devnet test SOL: https://faucet.solana.com');
      console.log('  Then re-run this script to confirm a live transfer.');
      process.exit(0);
    }
  }

  const recipient = process.argv[2];
  const amount = Number(process.argv[3]) || (solana.REWARD_ASSET === 'USDC' ? 1000 : 1000000); // 0.001 SOL / 0.001 USDC
  if (!recipient) {
    if (solana.NETWORK === 'mainnet-beta') {
      console.log('\nRefusing to auto-generate a mainnet recipient. Pass a real address:');
      console.log('  node scripts/verify-payout.js <yourWalletAddress>');
      process.exit(0);
    }
    console.log('\nNo recipient given — generating a throwaway devnet address to test the transfer.');
  }
  const to = recipient || require('@solana/web3.js').Keypair.generate().publicKey.toBase58();

  console.log('\nsending', amount, 'base units to', to, '…');
  const res = await solana.payout(to, amount);
  console.log('result         :', JSON.stringify(res));
  if (res.ok) {
    console.log('explorer       :', solana.explorerTx(res.signature));
    console.log('\n✓ PAYOUT PATH WORKS. You are ready to fund + flip to mainnet when you choose.');
  } else {
    console.log('\n✗ Payout failed:', res.error, res.detail || '');
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
