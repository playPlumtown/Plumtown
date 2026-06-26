/* ============================================================
   LifeSim — Economy & Rewards System
   $LSC minting on milestones, player XP/levels, withdrawal ledger.
   Attaches to window.LifeSim.Economy.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // XP needed for player level L → L+1
  function xpForLevel(level) {
    return 100 + level * 50;
  }

  function playerLevelInfo(state) {
    let xp = state.player.xp;
    let lvl = state.player.level;
    while (xp >= xpForLevel(lvl)) {
      xp -= xpForLevel(lvl);
      lvl++;
    }
    return { level: lvl, xp, needed: xpForLevel(lvl), progress: xp / xpForLevel(lvl) };
  }

  function addPlayerXP(state, amount) {
    const before = state.player.level;
    state.player.xp += amount;
    const info = playerLevelInfo(state);
    state.player.level = info.level;
    state.player.xp = info.xp;
    return { leveledUp: info.level > before, level: info.level };
  }

  // Internal: record a transaction
  function addTx(state, type, amount, note) {
    state.economy.transactions.unshift({
      id: LS.uid(), type, amount, note, at: LS.nowISO()
    });
    if (state.economy.transactions.length > 50) state.economy.transactions.length = 50;
  }

  // Mint $LSC reward to the player for an in-game milestone.
  // Also grants player XP.
  function earn(state, sim, amount, note) {
    amount = Math.max(0, Math.round(amount));
    if (amount <= 0) return { amount: 0 };
    state.player.lsc += amount;
    state.economy.totalEarned += amount;
    addTx(state, 'earn', amount, note);
    // activity log
    state.activity.unshift({ icon: '💰', text: `Earned ${amount} PLUM — ${note}`, at: LS.nowISO() });
    if (state.activity.length > 30) state.activity.length = 30;
    // small XP for player
    addPlayerXP(state, Math.ceil(amount / 5));
    // sim also gets a tiny bit of XP
    if (sim) sim.xp += Math.ceil(amount / 8);
    return { amount, note };
  }

  // Spend PLUM (e.g., on premium — kept minimal, no pay-to-win)
  function spend(state, amount, note) {
    if (state.player.lsc < amount) return { ok: false, msg: 'Not enough PLUM' };
    state.player.lsc -= amount;
    addTx(state, 'spend', amount, note);
    state.activity.unshift({ icon: '🛒', text: `Spent ${amount} PLUM — ${note}`, at: LS.nowISO() });
    if (state.activity.length > 30) state.activity.length = 30;
    return { ok: true };
  }

  // Withdraw PLUM to an external wallet
  function withdraw(state, amount, walletAddr) {
    if (state.player.lsc < amount) return { ok: false, msg: 'Not enough PLUM' };
    if (!walletAddr) return { ok: false, msg: 'No wallet address set' };
    state.player.lsc -= amount;
    addTx(state, 'withdraw', amount, `Withdrawn to ${walletAddr.slice(0, 8)}…`);
    state.activity.unshift({ icon: '📤', text: `Withdrew ${amount} PLUM`, at: LS.nowISO() });
    if (state.activity.length > 30) state.activity.length = 30;
    return { ok: true, amount, walletAddr };
  }

  // USD valuation
  function toUSD(state, lsc) {
    return lsc * state.economy.lscPriceUSD;
  }

  // Milestone reward schedule (for aspiration tracking etc.)
  const MILESTONES = {
    skill_maxed:    100,  // per maxed skill
    promotion:      40,   // per promotion
    first_friend:   50,
    partner:        150,
    home_built:     250,  // first 5 furniture
    career_top:     500,  // reaching top career level
    aspiration_done: 500
  };

  function rewardMilestone(state, sim, key, note) {
    const amt = MILESTONES[key] || 0;
    if (amt) return earn(state, sim, amt, note || key);
    return { amount: 0 };
  }

  // Pay a one-time milestone exactly once per Sim. Use a stable `tag`
  // (defaults to the milestone key) so repeats are deduplicated.
  function rewardMilestoneOnce(state, sim, key, note, tag) {
    if (!sim) return { amount: 0, already: true };
    if (!sim.milestones) sim.milestones = {};
    const t = tag || key;
    if (sim.milestones[t]) return { amount: 0, already: true };
    const res = rewardMilestone(state, sim, key, note);
    if (res.amount > 0) {
      sim.milestones[t] = true;
      // Mirror this verified milestone to the server-side redeemable pool.
      // key picks the reward; t dedups the instance. No-op offline.
      try { if (LS.P2E && LS.P2E.claim) LS.P2E.claim('milestone', key, t); } catch (e) { /* */ }
    }
    return res;
  }

  LS.Economy = {
    xpForLevel,
    playerLevelInfo,
    addPlayerXP,
    earn,
    spend,
    withdraw,
    toUSD,
    MILESTONES,
    rewardMilestone,
    rewardMilestoneOnce
  };
})();