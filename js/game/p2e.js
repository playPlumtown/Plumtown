/* ============================================================
   LifeSim — P2E client (non-custodial Solana)
   The browser half of real play-to-earn:
     • connect a Phantom / Solflare wallet (the user keeps custody —
       we never see a private key),
     • prove ownership with a free signed message,
     • report verified achievements and withdraw earned credits as
       real SOL/USDC.

   ALL value decisions are made server-side (see server/economy.js).
   This module never decides what anything is worth; it just relays.
   Attaches to window.LifeSim.P2E.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  /* ---- backend plumbing (shares the Cloud identity / base URL) ---- */
  function apiBase() {
    const c = window.LIFESIM_CONFIG;
    return (c && c.cloudApi) ? String(c.cloudApi).replace(/\/+$/, '') : '';
  }
  function isRemote() { return !!apiBase(); }
  function me() { return LS.Cloud && LS.Cloud.me ? LS.Cloud.me() : null; }
  // Real payouts need a deployed backend AND a signed-in identity.
  function isLive() { return isRemote() && !!me(); }

  async function apiGet(path) {
    const headers = {};
    if (me()) headers['x-api-key'] = me().apiKey;
    const r = await fetch(apiBase() + '/api' + path, { headers });
    if (!r.ok) throw new Error('GET ' + path + ' ' + r.status);
    return r.json();
  }
  async function apiPost(path, bodyObj) {
    const headers = { 'Content-Type': 'application/json' };
    if (me()) headers['x-api-key'] = me().apiKey;
    const r = await fetch(apiBase() + '/api' + path, {
      method: 'POST', headers, body: JSON.stringify(bodyObj || {})
    });
    if (!r.ok) throw new Error('POST ' + path + ' ' + r.status);
    return r.json();
  }

  /* ---- wallet provider (Phantom / Solflare injected) ---- */
  function provider() {
    if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    if (window.solflare && window.solflare.isSolflare) return window.solflare;
    if (window.solana) return window.solana; // any injected Solana wallet
    return null;
  }
  function walletInstalled() { return !!provider(); }

  let _pubkey = '';
  function connectedAddress() { return _pubkey; }

  async function connect() {
    const p = provider();
    if (!p) {
      const e = new Error('no_wallet');
      e.userMessage = 'No Solana wallet found. Install Phantom (phantom.app) to connect.';
      throw e;
    }
    const res = await p.connect();
    _pubkey = (res && res.publicKey ? res.publicKey : p.publicKey).toString();
    return _pubkey;
  }
  async function disconnect() {
    const p = provider();
    try { if (p && p.disconnect) await p.disconnect(); } catch (e) { /* */ }
    _pubkey = '';
  }

  // base58 (no deps) — encode a signature for the server to verify.
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes) {
    const digits = [0];
    for (let i = 0; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let str = '';
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1';
    for (let i = digits.length - 1; i >= 0; i--) str += B58[digits[i]];
    return str;
  }

  // EXACT same string the server reconstructs (server/index.js walletLinkMessage).
  function linkMessage(address) {
    const id = me() ? me().id : '';
    return 'LifeSim wallet verification\n\nAddress: ' + address +
           '\nPlayer: ' + id +
           '\n\nSign to prove you control this wallet. This is a free signature — no transaction, no fee.';
  }

  async function signMessage(message) {
    const p = provider();
    const encoded = new TextEncoder().encode(message);
    const out = await p.signMessage(encoded, 'utf8');
    const sig = out.signature || out; // Phantom → {signature}; some wallets → bytes
    return b58encode(sig);
  }

  /* ---- high-level flows ---- */

  // Connect wallet + prove ownership + register it server-side.
  async function linkWallet() {
    const address = await connect();
    const signature = await signMessage(linkMessage(address));
    const res = await apiPost('/wallet/link', { address, signature });
    if (!res.ok) {
      const e = new Error(res.reason || 'link_failed');
      e.reason = res.reason;
      throw e;
    }
    return res; // { ok, wallet, verified }
  }

  async function unlinkWallet() {
    await disconnect();
    if (isLive()) { try { return await apiPost('/wallet/unlink', {}); } catch (e) { /* */ } }
    return { ok: true };
  }

  async function config() { return isRemote() ? apiGet('/p2e/config') : null; }
  async function rewards() { return isLive() ? apiGet('/rewards') : null; }

  // Report a verified achievement so the server can mint redeemable credits.
  // kind: 'daily' | 'quest' | 'milestone'. `key` selects the reward amount;
  // optional `tag` distinguishes repeatable-key instances (e.g. each maxed
  // skill) for one-time dedup. Safe to call offline (no-op) — the server
  // enforces all caps and one-time rules.
  async function claim(kind, key, tag) {
    if (!isLive()) return { ok: false, reason: 'offline' };
    try { return await apiPost('/rewards/claim', { kind, key: key || '', tag: tag || '' }); }
    catch (e) { return { ok: false, reason: 'network' }; }
  }

  // Cash out. amount in credits, or 0/undefined for "max allowed".
  async function withdraw(amount) {
    if (!isLive()) { const e = new Error('offline'); e.reason = 'offline'; throw e; }
    const res = await apiPost('/withdraw', { amount: amount || 0 });
    if (!res.ok) { const e = new Error(res.reason || 'withdraw_failed'); e.reason = res.reason; e.data = res; throw e; }
    return res; // { ok, signature, explorer, asset, base, credits, fee, rewards }
  }

  // Convert credits → display amount in the payout asset.
  function creditsToAsset(credits, cfg) {
    if (!cfg || !cfg.creditsPerUnit) return 0;
    return credits / cfg.creditsPerUnit;
  }

  LS.P2E = {
    isRemote, isLive, walletInstalled, provider,
    connect, disconnect, connectedAddress,
    linkWallet, unlinkWallet,
    config, rewards, claim, withdraw,
    creditsToAsset, linkMessage
  };
})();
