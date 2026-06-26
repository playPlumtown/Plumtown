/* ============================================================
   LifeSim — Careers System
   Hiring, daily work, performance, promotions, pay.
   Attaches to window.LifeSim.Careers.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Join a career track at entry level
  function join(sim, track) {
    const c = LS.CAREERS[track];
    if (!c) return { ok: false, msg: 'Unknown career' };
    if (sim.career && sim.career.track === track) return { ok: false, msg: 'Already in this career' };
    if (!LS.Skills.canJoinCareer(sim, track)) return { ok: false, msg: 'Need more skill first' };
    sim.career = {
      track,
      level: 0,
      performance: 50,
      daysWorked: 0,
      lastWorkDay: -1
    };
    return { ok: true, msg: `Hired as ${c.levels[0].title} (${c.label})` };
  }

  function quit(sim) {
    if (!sim.career) return { ok: false, msg: 'Not employed' };
    const c = LS.CAREERS[sim.career.track];
    sim.career = null;
    return { ok: true, msg: `Quit ${c.label}` };
  }

  // Work a shift (called by clock at work time). Returns payout & events.
  // `gameDay` is the current in-game day number, to prevent double-working.
  function work(sim, gameDay) {
    if (!sim.career) return { ok: false, msg: 'Unemployed' };
    if (sim.career.lastWorkDay === gameDay) return { ok: false, msg: 'Already worked today' };
    if (sim.mood < 25) return { ok: false, msg: 'Too miserable to work' };
    if (sim.needs.energy < 20) return { ok: false, msg: 'Too exhausted to work' };

    const c = LS.CAREERS[sim.career.track];
    const lvl = sim.career.level;
    const baseSalary = c.levels[lvl].salary;

    // performance delta based on mood + emotion + skill + traits
    const sk = LS.Skills.level(sim, c.reqSkill);
    const emoMod = LS.Emotions ? LS.Emotions.performanceMod(sim) : 1;
    let perfDelta = (sim.mood - 50) * 0.18 + (sk - lvl) * 6;
    perfDelta *= emoMod;
    if (sim.traits.includes('Ambitious')) perfDelta += 6;
    if (sim.traits.includes('Lazy')) perfDelta -= 5;
    sim.career.performance = LS.clamp(sim.career.performance + perfDelta, 0, 100);
    sim.career.daysWorked++;
    sim.career.lastWorkDay = gameDay;

    // pay (mood & performance & emotion scaled)
    const payMult = (0.7 + (sim.career.performance / 100) * 0.6) * emoMod;
    const pay = Math.round(baseSalary * payMult);
    sim.money += pay;
    sim.totalEarned = (sim.totalEarned || 0) + pay;

    // small skill XP from working
    LS.Skills.gainXP(sim, c.reqSkill, 12 + sk * 2);

    // consume energy/fun/hunger like a workday
    LS.Needs.satisfy(sim, 'energy', -25);
    LS.Needs.satisfy(sim, 'fun', -15);
    LS.Needs.satisfy(sim, 'hunger', -15);
    LS.Needs.satisfy(sim, 'social', 10);
    if (LS.Emotions) LS.Emotions.add(sim, 'productive');
    LS.Needs.recomputeMood(sim);

    return {
      ok: true,
      msg: `Worked as ${c.levels[lvl].title}`,
      pay,
      performance: sim.career.performance,
      skillGained: c.reqSkill
    };
  }

  // Attempt promotion
  function promote(sim) {
    if (!sim.career) return { ok: false, msg: 'Unemployed' };
    if (!LS.Skills.canPromote(sim)) {
      return { ok: false, msg: 'Not ready for promotion (need skill, performance & mood)' };
    }
    const c = LS.CAREERS[sim.career.track];
    const nextIdx = sim.career.level + 1;
    if (nextIdx >= c.levels.length) return { ok: false, msg: 'Already at top level' };
    sim.career.level = nextIdx;
    sim.career.performance = 40; // reset for new level
    return {
      ok: true,
      msg: `Promoted to ${c.levels[nextIdx].title}!`,
      newLevel: nextIdx,
      title: c.levels[nextIdx].title
    };
  }

  // Info bundle for UI
  function info(sim) {
    if (!sim.career) return null;
    const c = LS.CAREERS[sim.career.track];
    const lvl = sim.career.level;
    const lvlInfo = c.levels[lvl];
    const next = c.levels[lvl + 1] || null;
    const req = LS.Skills.level(sim, c.reqSkill);
    return {
      track: sim.career.track,
      trackLabel: c.label,
      icon: c.icon,
      title: lvlInfo.title,
      salary: lvlInfo.salary,
      level: lvl,
      performance: sim.career.performance,
      daysWorked: sim.career.daysWorked,
      reqSkill: c.reqSkill,
      reqSkillLevel: req,
      nextTitle: next ? next.title : null,
      nextSalary: next ? next.salary : null,
      canPromote: LS.Skills.canPromote(sim),
      isMaxed: !next
    };
  }

  // List all careers with current eligibility
  function list(sim) {
    return Object.keys(LS.CAREERS).map((track) => {
      const c = LS.CAREERS[track];
      return {
        track,
        label: c.label,
        icon: c.icon,
        reqSkill: c.reqSkill,
        reqSkillLabel: LS.SKILL_META[c.reqSkill].label,
        maxLevel: c.levels.length,
        topTitle: c.levels[c.levels.length - 1].title,
        topSalary: c.levels[c.levels.length - 1].salary,
        eligible: LS.Skills.canJoinCareer(sim, track),
        current: sim.career && sim.career.track === track
      };
    });
  }

  LS.Careers = { join, quit, work, promote, info, list };
})();