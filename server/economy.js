/* ============================================================
   LifeSim — P2E economy (SERVER-AUTHORITATIVE)
   The single source of truth for how much real value a player can
   earn and withdraw. The browser is never trusted with these
   numbers — the client only *reports* that an achievement happened;
   this module decides what (if anything) it is worth and enforces
   every cap.

   Two currencies, kept deliberately separate so the loop is honest:
     • $LSC  — the in-game soft currency (display/spend). NOT money.
     • Reward credits ("RC") — a capped, server-verified pool that
       converts to real SOL/USDC on withdrawal. Only a *curated* set
       of verified achievements mint RC, so the treasury can never be
       drained by a cheating client: the lifetime total any account
       can mint is bounded and known.

   Zero dependencies on purpose — pure functions + config so the
   community backend still runs even without the Solana libs installed.
   ============================================================ */

'use strict';

const env = process.env;
const numEnv = (k, d) => { const v = Number(env[k]); return Number.isFinite(v) && v >= 0 ? v : d; };
const boolEnv = (k, d) => { const v = env[k]; return v == null ? d : /^(1|true|yes|on)$/i.test(v); };

/* ----------------------------------------------------------------
   Config — every number here is overridable by an env var so the
   operator tunes the economy without code changes. Defaults are
   deliberately conservative.
   ---------------------------------------------------------------- */
const CONFIG = {
  // Master kill-switch. Real payouts stay OFF until you explicitly
  // flip this — so deploying never silently sends money.
  payoutsEnabled: boolEnv('P2E_PAYOUTS_ENABLED', false),

  // Which asset withdrawals are paid in.
  rewardAsset: (env.P2E_REWARD_ASSET || 'SOL').toUpperCase() === 'USDC' ? 'USDC' : 'SOL',

  // Conversion: how many reward credits (RC) equal one whole unit of
  // the payout asset. 100000 RC = 1 SOL  →  1 RC ≈ 0.00001 SOL.
  creditsPerUnit: numEnv('P2E_CREDITS_PER_UNIT', 100000),

  // Withdrawal rails.
  minWithdrawCredits: numEnv('P2E_MIN_WITHDRAW', 2000),     // floor to cash out
  dailyWithdrawCap:   numEnv('P2E_DAILY_WITHDRAW_CAP', 20000), // RC / 24h
  withdrawCooldownMs: numEnv('P2E_WITHDRAW_COOLDOWN_MS', 60 * 1000),
  withdrawFeeCredits: numEnv('P2E_WITHDRAW_FEE', 0),         // RC kept by treasury per cashout

  // Faucet caps.
  dailyRewardCredits: numEnv('P2E_DAILY_REWARD', 50),       // login bonus / 24h
  dailyEarnCap:       numEnv('P2E_DAILY_EARN_CAP', 1500),   // max RC minted / 24h (all sources)
};

/* ----------------------------------------------------------------
   Reward schedule — the ONLY events that mint redeemable credits.
   Unknown keys are worth 0. One-time events mint once per account;
   "daily" is the single recurring faucet (24h-gated).
   Mirrors the client's quest/milestone values so the UX is honest.
   ---------------------------------------------------------------- */
const QUEST_RC = {
  first_meal: 30, get_hired: 60, well_rested: 25, skill_lvl3: 75, make_friend: 50,
  first_promo: 90, home_owner: 120, rich: 40, feel_good: 35, designer: 45
};
const MILESTONE_RC = {
  skill_maxed: 100, promotion: 40, first_friend: 50, partner: 150,
  home_built: 250, career_top: 500, aspiration_done: 500
};

// What is a reported achievement worth? (kind, key) → credits.
function eventReward(kind, key) {
  if (kind === 'daily') return CONFIG.dailyRewardCredits;
  if (kind === 'quest') return QUEST_RC[key] || 0;
  if (kind === 'milestone') return MILESTONE_RC[key] || 0;
  return 0;
}

/* ----------------------------------------------------------------
   Pure ledger helpers. A `rewards` record looks like:
     { balance, lifetimeEarned, credited:{key:ts}, dailyAt,
       earnedToday, earnDay, wallet, walletAt,
       withdrawnToday, withdrawDay, lastWithdrawAt }
   ---------------------------------------------------------------- */
function blankRewards() {
  return {
    balance: 0, lifetimeEarned: 0, credited: {}, dailyAt: 0,
    earnedToday: 0, earnDay: '', wallet: '', walletAt: 0,
    withdrawnToday: 0, withdrawDay: '', lastWithdrawAt: 0
  };
}

function dayStamp(now) {
  return new Date(now).toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

// Stable identity for one-time crediting. The reward *amount* is looked
// up by `key` (the schedule), but dedup is by `tag` when given — so e.g.
// every distinct maxed skill (key 'skill_maxed', tag 'skill_handiness')
// credits once, while unknown/forged tags still pay 0.
function creditKey(kind, key, tag) {
  return kind + ':' + String(tag || key || '');
}

// Decide whether a reported achievement may mint credits, and how many
// (after applying the per-day earn cap). Pure — returns a plan; the
// caller mutates storage. Never throws.
function planCredit(rewards, kind, key, tag, now) {
  const r = rewards || blankRewards();
  const today = dayStamp(now);
  const earnedToday = r.earnDay === today ? (r.earnedToday || 0) : 0;

  if (kind === 'daily') {
    // 24h gate on the login bonus.
    if (r.dailyAt && now - r.dailyAt < 24 * 3600 * 1000) {
      return { ok: false, amount: 0, reason: 'daily_not_ready' };
    }
  } else {
    // One-time events: a given (kind, tag) pays exactly once per account.
    const ck = creditKey(kind, key, tag);
    if (r.credited && r.credited[ck]) {
      return { ok: false, amount: 0, reason: 'already_credited' };
    }
  }

  let amount = eventReward(kind, key);
  if (amount <= 0) return { ok: false, amount: 0, reason: 'no_reward' };

  // Per-day earn cap across all sources.
  const room = Math.max(0, CONFIG.dailyEarnCap - earnedToday);
  amount = Math.min(amount, room);
  if (amount <= 0) return { ok: false, amount: 0, reason: 'daily_cap' };

  return { ok: true, amount, today, kind, key, tag, creditKey: creditKey(kind, key, tag) };
}

// Validate a withdrawal request against balance + rails. Pure.
// `requested` is in credits; 0/undefined means "withdraw the max allowed".
function planWithdraw(rewards, requested, now) {
  const r = rewards || blankRewards();
  if (!r.wallet) return { ok: false, reason: 'no_wallet' };
  if (!CONFIG.payoutsEnabled) return { ok: false, reason: 'payouts_disabled' };

  if (CONFIG.withdrawCooldownMs && r.lastWithdrawAt &&
      now - r.lastWithdrawAt < CONFIG.withdrawCooldownMs) {
    return { ok: false, reason: 'cooldown',
      retryInMs: CONFIG.withdrawCooldownMs - (now - r.lastWithdrawAt) };
  }

  const today = dayStamp(now);
  const usedToday = r.withdrawDay === today ? (r.withdrawnToday || 0) : 0;
  const dailyRoom = Math.max(0, CONFIG.dailyWithdrawCap - usedToday);

  // How much can leave the account right now?
  let amount = requested && requested > 0 ? Math.min(requested, r.balance) : r.balance;
  amount = Math.min(amount, dailyRoom);
  amount = Math.floor(amount);

  if (amount < CONFIG.minWithdrawCredits) {
    return { ok: false, reason: 'below_min', min: CONFIG.minWithdrawCredits,
      available: Math.min(Math.floor(r.balance), dailyRoom) };
  }

  const fee = Math.min(CONFIG.withdrawFeeCredits, amount);
  const netCredits = amount - fee;            // credits actually converted to chain value
  const lamportsOrUnits = creditsToBase(netCredits);
  if (lamportsOrUnits <= 0) return { ok: false, reason: 'dust' };

  return { ok: true, today, grossCredits: amount, feeCredits: fee,
    netCredits, base: lamportsOrUnits };
}

// Convert reward credits → on-chain base units (lamports for SOL,
// 1e6 micro-USDC for USDC). Integer.
function creditsToBase(credits) {
  const decimals = CONFIG.rewardAsset === 'USDC' ? 6 : 9; // SOL = 9 (lamports)
  const whole = credits / CONFIG.creditsPerUnit;          // in SOL/USDC
  return Math.floor(whole * Math.pow(10, decimals));
}

// Public snapshot of the rules + a player's standing (for the UI).
function publicConfig() {
  return {
    rewardAsset: CONFIG.rewardAsset,
    creditsPerUnit: CONFIG.creditsPerUnit,
    minWithdraw: CONFIG.minWithdrawCredits,
    dailyWithdrawCap: CONFIG.dailyWithdrawCap,
    dailyReward: CONFIG.dailyRewardCredits,
    dailyEarnCap: CONFIG.dailyEarnCap,
    withdrawFee: CONFIG.withdrawFeeCredits,
    withdrawCooldownMs: CONFIG.withdrawCooldownMs,
    payoutsEnabled: CONFIG.payoutsEnabled
  };
}

module.exports = {
  CONFIG, QUEST_RC, MILESTONE_RC,
  blankRewards, dayStamp, eventReward, creditKey,
  planCredit, planWithdraw, creditsToBase, publicConfig
};
