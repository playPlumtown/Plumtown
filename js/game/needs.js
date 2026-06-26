/* ============================================================
   LifeSim — Needs System
   Decays needs over time, computes mood, handles need actions.
   Attaches to window.LifeSim.Needs.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;
  const NEED_META = LS.NEED_META;

  // Trait modifiers on decay rates (multiplier)
  const TRAIT_DECAY_MOD = {
    Lazy:      { energy: 0.7, fitness: 1.2 },
    Active:    { energy: 1.3, fitness: 0.8 },
    Glutton:   { hunger: 1.4 },
    Neat:      { hygiene: 0.6, room: 0.5 },
    Slob:      { hygiene: 1.5, room: 1.4 },
    Loner:     { social: 0.6 },
    Outgoing:  { social: 1.3 },
    Bookworm:  { fun: 0.8 },
    Cheerful:  { social: 0.85 }
  };

  function traitMods(sim) {
    // returns merged decay multipliers for this sim's traits
    const mods = {};
    (sim.traits || []).forEach((t) => {
      const m = TRAIT_DECAY_MOD[t];
      if (m) for (const k in m) mods[k] = (mods[k] || 1) * m[k];
    });
    return mods;
  }

  // Decay all needs by a time delta (in in-game minutes)
  function decay(sim, minutes) {
    const mods = traitMods(sim);
    NEED_META && 0; // noop guard
    LS.NEEDS.forEach((n) => {
      const base = NEED_META[n].decay;          // per in-game minute
      const mult = mods[n] || 1;
      sim.needs[n] = LS.clamp(sim.needs[n] - base * mult * minutes);
    });
    // Low energy accelerates other decays slightly (exhaustion spiral)
    if (sim.needs.energy < 15) {
      LS.NEEDS.forEach((n) => {
        if (n !== 'energy') sim.needs[n] = LS.clamp(sim.needs[n] - 0.05 * minutes);
      });
    }
    recomputeMood(sim);
  }

  // Compute mood 0-100 from needs (weighted average) + trait nudges
  function recomputeMood(sim) {
    const weights = {
      hunger: 1.3, energy: 1.3, bladder: 1.0, hygiene: 0.8,
      social: 0.9, fun: 0.9, comfort: 0.7, room: 0.6
    };
    let sum = 0, wsum = 0;
    LS.NEEDS.forEach((n) => {
      const w = weights[n] || 1;
      sum += sim.needs[n] * w;
      wsum += w;
    });
    let mood = sum / wsum;
    // trait nudges
    if (sim.traits.includes('Cheerful')) mood += 6;
    if (sim.traits.includes('Hot-Headed')) mood -= 6;
    if (sim.traits.includes('Ambitious') && (!sim.career || sim.career.level === 0)) mood -= 5;
    // moodlets layer on top of raw-need mood
    if (LS.Emotions) mood += LS.Emotions.moodletModifier(sim);
    sim.mood = LS.clamp(mood);
    // refresh the dominant emotion to match the new mood/needs
    if (LS.Emotions) LS.Emotions.recompute(sim);
    return sim.mood;
  }

  // Satisfy a need (with optional delta and cap)
  function satisfy(sim, need, amount) {
    sim.needs[need] = LS.clamp(sim.needs[need] + amount, 0, 100);
    recomputeMood(sim);
  }

  // Returns the lowest need(s), useful for autonomy AI
  function lowestNeed(sim) {
    let min = 101, key = null;
    LS.NEEDS.forEach((n) => {
      if (sim.needs[n] < min) { min = sim.needs[n]; key = n; }
    });
    return { need: key, value: min };
  }

  // Critical-need warnings (for UI)
  function criticalNeeds(sim, threshold = 20) {
    return LS.NEEDS.filter((n) => sim.needs[n] < threshold).map((n) => ({
      need: n, value: sim.needs[n], meta: NEED_META[n]
    }));
  }

  // Mood descriptor for UI
  function moodLabel(sim) {
    const m = sim.mood;
    if (m >= 85) return { label: 'Ecstatic', color: '#2ee6a6' };
    if (m >= 70) return { label: 'Happy', color: '#5cffa6' };
    if (m >= 50) return { label: 'Fine', color: '#ffcf5c' };
    if (m >= 30) return { label: 'Stressed', color: '#ffb454' };
    if (m >= 15) return { label: 'Miserable', color: '#ff5c7c' };
    return { label: 'Critical', color: '#ff2e5c' };
  }

  // Apply a generic need-action effect from an action definition
  // actionDef.effects: { hunger: +20, energy: -10, ... }
  function applyEffects(sim, effects) {
    if (!effects) return;
    for (const k in effects) {
      if (k in sim.needs) satisfy(sim, k, effects[k]);
    }
    recomputeMood(sim);
  }

  // Expose
  LS.Needs = {
    decay,
    recomputeMood,
    satisfy,
    lowestNeed,
    criticalNeeds,
    moodLabel,
    applyEffects,
    traitMods
  };
})();