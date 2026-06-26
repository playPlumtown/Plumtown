/* ============================================================
   LifeSim — Skills System
   XP gain, leveling, trait bonuses, skill-based gating.
   Attaches to window.LifeSim.Skills.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;
  const SKILL_META = LS.SKILL_META;

  const MAX_LEVEL = 10;

  // XP required to go from level L to L+1 (curve)
  function xpForLevel(level) {
    return Math.round(100 * Math.pow(1.35, level));
  }

  // Trait skill-learn multipliers
  const TRAIT_LEARN_MOD = {
    Genius: { logic: 1.5, programming: 1.3 },
    Creative: { creativity: 1.5, painting: 1.4, writing: 1.3, music: 1.2 },
    Active: { fitness: 1.4, athletic: 1.4 },
    Bookworm: { writing: 1.4, logic: 1.2 },
    Clumsy: { handiness: 0.7, athletic: 0.8 },
    Ambitious: {} // global handled separately
  };

  // Skills that benefit from specific emotions (Sims-style synergy)
  const EMOTION_SKILL_BONUS = {
    inspired: ['creativity', 'painting', 'writing', 'music'],
    focused:  ['logic', 'programming', 'handiness'],
    energized:['fitness', 'athletic']
  };

  function learnMod(sim, skill) {
    let mod = 1;
    (sim.traits || []).forEach((t) => {
      const m = TRAIT_LEARN_MOD[t];
      if (m && m[skill]) mod *= m[skill];
    });
    if (sim.traits.includes('Ambitious')) mod *= 1.15;
    // mood affects learning efficiency
    if (sim.mood >= 75) mod *= 1.2;
    else if (sim.mood < 30) mod *= 0.6;
    // the right emotion supercharges the matching skill
    const bonusList = EMOTION_SKILL_BONUS[sim.emotion];
    if (bonusList && bonusList.indexOf(skill) !== -1) mod *= 1.25;
    return mod;
  }

  // Add XP to a skill; returns { leveledUp, newLevel, skill }
  function gainXP(sim, skill, amount) {
    const s = sim.skills[skill];
    if (!s) return null;
    const before = s.level;
    amount *= learnMod(sim, skill);
    s.xp += amount;

    // level up
    while (s.level < MAX_LEVEL && s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
    }
    if (s.level >= MAX_LEVEL) {
      s.level = MAX_LEVEL;
      s.xp = 0;
    }
    const leveledUp = s.level > before;
    return { leveledUp, newLevel: s.level, skill, before, amount };
  }

  function level(sim, skill) {
    return sim.skills[skill] ? sim.skills[skill].level : 0;
  }

  // The "best" skill for a career track requirement
  function careerSkillFor(track) {
    const c = LS.CAREERS[track];
    return c ? c.reqSkill : null;
  }

  // Is sim eligible to be hired at entry level for a career?
  function canJoinCareer(sim, track) {
    const c = LS.CAREERS[track];
    if (!c) return false;
    const req = c.reqSkill;
    // entry level requires skill level >= 0 (always), but some need level 1
    return level(sim, req) >= 0;
  }

  // Promotion eligibility: skill level must be >= career level index
  function canPromote(sim) {
    if (!sim.career) return false;
    const c = LS.CAREERS[sim.career.track];
    const nextIdx = sim.career.level + 1;
    if (nextIdx >= c.levels.length) return false; // maxed
    const req = level(sim, c.reqSkill);
    // require skill level >= next career index, plus decent performance & mood
    return req >= nextIdx && sim.career.performance >= 60 && sim.mood >= 45;
  }

  // Progress to next level as a fraction (for UI bars)
  function progress(sim, skill) {
    const s = sim.skills[skill];
    if (!s) return 0;
    if (s.level >= MAX_LEVEL) return 1;
    return s.xp / xpForLevel(s.level);
  }

  // Total skill points across all skills (aspiration metric)
  function totalPoints(sim) {
    let sum = 0;
    LS.SKILLS.forEach((k) => (sum += sim.skills[k].level));
    return sum;
  }

  // Number of maxed skills
  function maxedCount(sim) {
    return LS.SKILLS.filter((k) => sim.skills[k].level >= MAX_LEVEL).length;
  }

  // Friendly descriptor
  function rankLabel(lvl) {
    if (lvl >= 10) return 'Master';
    if (lvl >= 7) return 'Expert';
    if (lvl >= 4) return 'Skilled';
    if (lvl >= 2) return 'Novice';
    if (lvl >= 1) return 'Beginner';
    return 'Untrained';
  }

  LS.Skills = {
    MAX_LEVEL,
    xpForLevel,
    gainXP,
    level,
    progress,
    canJoinCareer,
    canPromote,
    careerSkillFor,
    totalPoints,
    maxedCount,
    rankLabel,
    learnMod
  };
})();