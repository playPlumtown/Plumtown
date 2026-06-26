/* ============================================================
   LifeSim — Community backend
   A tiny zero-dependency HTTP API for the shared world: players
   register, publish their house, and anyone can list/visit
   everyone's houses.

   Storage:
     • If DATABASE_URL is set  → PostgreSQL (persistent; use this on Railway).
     • Otherwise               → in-memory (great for local dev, not persistent).

   Run locally:  node server/index.js           (in-memory, port 3001)
   On Railway:   add a PostgreSQL plugin (sets DATABASE_URL) and deploy.
   ============================================================ */

'use strict';

const http = require('http');
const crypto = require('crypto');
const economy = require('./economy');   // zero-dep reward rules (always present)
const solana = require('./solana');     // lazy Solana adapter (self-guards if libs absent)

const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL || '';
const ONLINE_WINDOW_MS = 3 * 60 * 1000; // "online" = seen in last 3 min
const uid = () => crypto.randomBytes(9).toString('hex');
const key = () => crypto.randomBytes(24).toString('hex');

/* ---------------- storage ---------------- */

function memoryStore() {
  const players = new Map(); // id -> { id, name, apiKey, summary, world, lastSeen }
  const messages = [];       // global neighbourhood chat: { id, playerId, name, text, at }
  return {
    async init() {},
    async createPlayer(name) {
      const id = uid(), apiKey = key();
      players.set(id, { id, name: name, apiKey, summary: { name }, world: null, lastSeen: Date.now() });
      return { id, apiKey, name };
    },
    async byKey(apiKey) {
      for (const p of players.values()) if (p.apiKey === apiKey) return p;
      return null;
    },
    async saveWorld(id, summary, world) {
      const p = players.get(id); if (!p) return;
      p.summary = summary || p.summary; p.world = world; p.lastSeen = Date.now();
    },
    async touch(id) { const p = players.get(id); if (p) p.lastSeen = Date.now(); },
    async list() {
      return Array.from(players.values())
        .filter((p) => p.world) // only players who've published a house
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 200)
        .map((p) => Object.assign({ id: p.id, name: p.name, lastSeen: p.lastSeen, online: Date.now() - p.lastSeen < ONLINE_WINDOW_MS }, p.summary));
    },
    async getWorld(id) { const p = players.get(id); return p ? p.world : null; },
    // ---- P2E reward ledger ----
    async getRewards(id) {
      const p = players.get(id); if (!p) return null;
      if (!p.rewards) p.rewards = economy.blankRewards();
      return p.rewards;
    },
    async saveRewards(id, rewards) { const p = players.get(id); if (p) p.rewards = rewards; },
    async addPayout(id, payout) {
      const p = players.get(id); if (!p) return;
      if (!p.payouts) p.payouts = [];
      p.payouts.unshift(payout); if (p.payouts.length > 100) p.payouts.length = 100;
    },
    async listPayouts(id) { const p = players.get(id); return (p && p.payouts) ? p.payouts : []; },
    // ---- neighbourhood chat ----
    async addMessage(playerId, name, text) {
      const m = { id: uid(), playerId, name, text, at: Date.now() };
      messages.push(m); if (messages.length > 200) messages.splice(0, messages.length - 200);
      return m;
    },
    async listMessages(limit) { return messages.slice(-(limit || 50)); }
  };
}

function pgStore() {
  // pg is only required when DATABASE_URL is set (installed on Railway).
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS players (
        id text PRIMARY KEY, name text, api_key text UNIQUE,
        summary jsonb, world jsonb, last_seen timestamptz DEFAULT now())`);
      // P2E ledger — additive migration so existing deploys upgrade cleanly.
      await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS rewards jsonb');
      await pool.query(`CREATE TABLE IF NOT EXISTS payouts (
        id text PRIMARY KEY, player_id text, asset text, credits numeric,
        base numeric, signature text, status text, created_at timestamptz DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS messages (
        id text PRIMARY KEY, player_id text, name text, body text, created_at timestamptz DEFAULT now())`);
    },
    async createPlayer(name) {
      const id = uid(), apiKey = key();
      await pool.query('INSERT INTO players(id,name,api_key,summary) VALUES($1,$2,$3,$4)', [id, name, apiKey, { name }]);
      return { id, apiKey, name };
    },
    async byKey(apiKey) {
      const r = await pool.query('SELECT id,name,api_key FROM players WHERE api_key=$1', [apiKey]);
      return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name, apiKey } : null;
    },
    async saveWorld(id, summary, world) {
      await pool.query('UPDATE players SET summary=$2, world=$3, last_seen=now() WHERE id=$1', [id, summary, world]);
    },
    async touch(id) { await pool.query('UPDATE players SET last_seen=now() WHERE id=$1', [id]); },
    async list() {
      const r = await pool.query('SELECT id,name,summary,last_seen FROM players WHERE world IS NOT NULL ORDER BY last_seen DESC LIMIT 200');
      return r.rows.map((row) => {
        const seen = new Date(row.last_seen).getTime();
        return Object.assign({ id: row.id, name: row.name, lastSeen: seen, online: Date.now() - seen < ONLINE_WINDOW_MS }, row.summary || {});
      });
    },
    async getWorld(id) {
      const r = await pool.query('SELECT world FROM players WHERE id=$1', [id]);
      return r.rows[0] ? r.rows[0].world : null;
    },
    // ---- P2E reward ledger ----
    async getRewards(id) {
      const r = await pool.query('SELECT rewards FROM players WHERE id=$1', [id]);
      if (!r.rows[0]) return null;
      return r.rows[0].rewards || economy.blankRewards();
    },
    async saveRewards(id, rewards) {
      await pool.query('UPDATE players SET rewards=$2 WHERE id=$1', [id, rewards]);
    },
    async addPayout(id, payout) {
      await pool.query(
        'INSERT INTO payouts(id,player_id,asset,credits,base,signature,status) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [payout.id, id, payout.asset, payout.credits, payout.base, payout.signature || '', payout.status]);
    },
    async listPayouts(id) {
      const r = await pool.query(
        'SELECT id,asset,credits,base,signature,status,created_at FROM payouts WHERE player_id=$1 ORDER BY created_at DESC LIMIT 50', [id]);
      return r.rows.map((row) => ({
        id: row.id, asset: row.asset, credits: Number(row.credits), base: Number(row.base),
        signature: row.signature, status: row.status, at: new Date(row.created_at).toISOString()
      }));
    },
    // ---- neighbourhood chat ----
    async addMessage(playerId, name, text) {
      const id = uid();
      await pool.query('INSERT INTO messages(id,player_id,name,body) VALUES($1,$2,$3,$4)', [id, playerId, name, text]);
      return { id, playerId, name, text, at: Date.now() };
    },
    async listMessages(limit) {
      const r = await pool.query('SELECT id,player_id,name,body,created_at FROM messages ORDER BY created_at DESC LIMIT $1', [limit || 50]);
      return r.rows.map((row) => ({ id: row.id, playerId: row.player_id, name: row.name, text: row.body, at: new Date(row.created_at).getTime() })).reverse();
    }
  };
}

const db = DATABASE_URL ? pgStore() : memoryStore();

/* ---------------- http helpers ---------------- */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function send(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { resolve({}); } });
  });
}

/* ---------------- P2E helpers ---------------- */

// Per-player lock so two withdraw requests can't both pass the balance
// check and double-spend. Held only for the duration of one payout.
const withdrawLocks = new Set();

// The exact message a player signs to prove wallet ownership. The client
// MUST reproduce this string byte-for-byte (see js/game/p2e.js).
function walletLinkMessage(address, playerId) {
  return 'LifeSim wallet verification\n\nAddress: ' + address +
         '\nPlayer: ' + playerId +
         '\n\nSign to prove you control this wallet. This is a free signature — no transaction, no fee.';
}

// Rules + network state for the UI (no secrets).
function p2eConfig() {
  const cfg = economy.publicConfig();
  cfg.network = solana.NETWORK;
  cfg.rewardAsset = solana.REWARD_ASSET;
  cfg.treasury = solana.available() ? solana.treasuryAddress() : '';
  cfg.payoutsLive = cfg.payoutsEnabled && solana.available();
  return cfg;
}

// A player's standing, with internal bookkeeping (the `credited` map) stripped.
function publicRewards(r, now) {
  now = now || Date.now();
  const today = economy.dayStamp(now);
  const dailyReady = !r.dailyAt || (now - r.dailyAt) >= 24 * 3600 * 1000;
  return {
    balance: Math.floor(r.balance || 0),
    lifetimeEarned: Math.floor(r.lifetimeEarned || 0),
    wallet: r.wallet || '',
    walletVerified: !!r.walletVerified,
    dailyReady,
    nextDailyInMs: dailyReady ? 0 : (24 * 3600 * 1000 - (now - r.dailyAt)),
    earnedToday: r.earnDay === today ? (r.earnedToday || 0) : 0,
    withdrawnToday: r.withdrawDay === today ? (r.withdrawnToday || 0) : 0
  };
}

/* ---------------- routes ---------------- */

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  try {
    if (path === '/api/health') return send(res, 200, { ok: true, store: DATABASE_URL ? 'postgres' : 'memory' });

    if (path === '/api/register' && req.method === 'POST') {
      const b = await body(req);
      const name = String(b.name || '').trim().slice(0, 24) || 'Player';
      const p = await db.createPlayer(name);
      return send(res, 200, p);
    }

    if (path === '/api/players' && req.method === 'GET') {
      return send(res, 200, { players: await db.list() });
    }

    if (path.startsWith('/api/world/') && req.method === 'GET') {
      const id = decodeURIComponent(path.slice('/api/world/'.length));
      const world = await db.getWorld(id);
      if (!world) return send(res, 404, { error: 'not found' });
      return send(res, 200, { world });
    }

    if (path === '/api/world' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      await db.saveWorld(me.id, b.summary || null, b.world || null);
      return send(res, 200, { ok: true });
    }

    if (path === '/api/heartbeat' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (me) await db.touch(me.id);
      return send(res, 200, { ok: !!me });
    }

    /* ============ P2E (real Solana rewards) ============ */

    // Public rules + network state (drives the dashboard UI).
    if (path === '/api/p2e/config' && req.method === 'GET') {
      return send(res, 200, p2eConfig());
    }

    // A player's redeemable standing + payout history.
    if (path === '/api/rewards' && req.method === 'GET') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const r = await db.getRewards(me.id);
      return send(res, 200, {
        rewards: publicRewards(r), config: p2eConfig(), payouts: await db.listPayouts(me.id)
      });
    }

    // Report a verified achievement; the SERVER decides what it's worth.
    if (path === '/api/rewards/claim' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const kind = String(b.kind || ''), key = String(b.key || ''), tag = b.tag ? String(b.tag) : '';
      const r = await db.getRewards(me.id);
      const now = Date.now();
      const plan = economy.planCredit(r, kind, key, tag, now);
      if (!plan.ok) return send(res, 200, { ok: false, reason: plan.reason, rewards: publicRewards(r, now) });
      // Apply the plan.
      r.balance = (r.balance || 0) + plan.amount;
      r.lifetimeEarned = (r.lifetimeEarned || 0) + plan.amount;
      r.earnedToday = (r.earnDay === plan.today ? (r.earnedToday || 0) : 0) + plan.amount;
      r.earnDay = plan.today;
      if (kind === 'daily') r.dailyAt = now;
      else { if (!r.credited) r.credited = {}; r.credited[plan.creditKey] = now; }
      await db.saveRewards(me.id, r);
      return send(res, 200, { ok: true, credited: plan.amount, rewards: publicRewards(r, now) });
    }

    // Link a wallet (non-custodial) after proving ownership by signature.
    if (path === '/api/wallet/link' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const address = String(b.address || '');
      if (!solana.isValidAddress(address)) return send(res, 200, { ok: false, reason: 'bad_address' });
      let verified = false;
      if (solana.canVerify()) {
        const msg = walletLinkMessage(address, me.id);
        if (!solana.verifyWalletSignature(address, msg, String(b.signature || '')))
          return send(res, 200, { ok: false, reason: 'bad_signature' });
        verified = true;
      }
      const r = await db.getRewards(me.id);
      r.wallet = address; r.walletAt = Date.now(); r.walletVerified = verified;
      await db.saveRewards(me.id, r);
      return send(res, 200, { ok: true, wallet: address, verified });
    }

    if (path === '/api/wallet/unlink' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const r = await db.getRewards(me.id);
      r.wallet = ''; r.walletVerified = false;
      await db.saveRewards(me.id, r);
      return send(res, 200, { ok: true });
    }

    // Cash out redeemable credits → real SOL/USDC from the treasury.
    if (path === '/api/withdraw' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      if (withdrawLocks.has(me.id)) return send(res, 200, { ok: false, reason: 'in_progress' });

      const b = await body(req);
      const requested = Number(b.amount) || 0;
      const r = await db.getRewards(me.id);
      const now = Date.now();
      const plan = economy.planWithdraw(r, requested, now);
      if (!plan.ok) return send(res, 200, { ok: false, reason: plan.reason, detail: plan, rewards: publicRewards(r, now) });
      if (!solana.available()) return send(res, 200, { ok: false, reason: 'payouts_unavailable', rewards: publicRewards(r, now) });

      withdrawLocks.add(me.id);
      try {
        // Debit FIRST, then pay. If the send fails we refund. This favours
        // the treasury over the player in the rare crash-mid-send window.
        r.balance -= plan.grossCredits;
        r.withdrawnToday = (r.withdrawDay === plan.today ? (r.withdrawnToday || 0) : 0) + plan.grossCredits;
        r.withdrawDay = plan.today;
        r.lastWithdrawAt = now;
        await db.saveRewards(me.id, r);

        const result = await solana.payout(r.wallet, plan.base);
        const pid = uid();
        if (!result.ok) {
          r.balance += plan.grossCredits;                  // refund
          r.withdrawnToday = Math.max(0, (r.withdrawnToday || 0) - plan.grossCredits);
          await db.saveRewards(me.id, r);
          await db.addPayout(me.id, { id: pid, asset: solana.REWARD_ASSET, credits: plan.grossCredits, base: plan.base, signature: '', status: 'failed:' + result.error });
          return send(res, 200, { ok: false, reason: result.error || 'send_failed', rewards: publicRewards(r, now) });
        }
        await db.addPayout(me.id, { id: pid, asset: solana.REWARD_ASSET, credits: plan.grossCredits, base: plan.base, signature: result.signature, status: 'sent' });
        return send(res, 200, {
          ok: true, signature: result.signature, explorer: solana.explorerTx(result.signature),
          asset: solana.REWARD_ASSET, base: plan.base, credits: plan.grossCredits, fee: plan.feeCredits,
          rewards: publicRewards(r, now)
        });
      } finally {
        withdrawLocks.delete(me.id);
      }
    }

    if (path === '/api/chat' && req.method === 'GET') {
      const limit = Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 50);
      return send(res, 200, { messages: await db.listMessages(limit) });
    }
    if (path === '/api/chat' && req.method === 'POST') {
      const me = await db.byKey(req.headers['x-api-key']);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      if (!text) return send(res, 200, { ok: false, reason: 'empty' });
      const m = await db.addMessage(me.id, me.name, text);
      return send(res, 200, { ok: true, message: m });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server error' });
  }
});

db.init().then(() => {
  server.listen(PORT, () => console.log('LifeSim community API on :' + PORT + ' (' + (DATABASE_URL ? 'postgres' : 'in-memory') + ')'));
}).catch((e) => { console.error('init failed', e); process.exit(1); });
