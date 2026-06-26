/* ============================================================
   LifeSim — Relationships System
   NPC management, social interactions, friendship/romance tiers.
   Attaches to window.LifeSim.Relationships.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Relationship type thresholds (by score 0-100)
  const TIERS = [
    { min: 0,  label: 'Acquaintance', type: 'neutral' },
    { min: 20, label: 'Friend',        type: 'friend' },
    { min: 50, label: 'Good Friend',   type: 'friend' },
    { min: 70, label: 'Close Friend',  type: 'friend' },
    { min: 80, label: 'Romantic Interest', type: 'romance' },
    { min: 90, label: 'Partner',       type: 'romance' }
  ];

  function tier(score) {
    let t = TIERS[0];
    for (const x of TIERS) if (score >= x.min) t = x;
    return t;
  }

  const NPC_NAMES = [
    'Mia Chen', 'Noah Patel', 'Ava Rossi', 'Liam Bauer', 'Zoe Nakamura',
    'Ethan Clarke', 'Layla Khan', 'Oscar Moreno', 'Iris Lindqvist', 'Kai Okafor',
    'Nora Vasquez', 'Felix Brun', 'Maya Santos', 'Theo Walsh', 'Lena Park'
  ];

  // Ensure the world has some NPCs to meet
  function ensureNPCs(state, count = 6) {
    while (state.npcs.length < count) {
      const name = NPC_NAMES[state.npcs.length % NPC_NAMES.length] + ' ' + (10 + state.npcs.length);
      state.npcs.push(LS.createNPC(name));
    }
    return state.npcs;
  }

  // Find or create a relationship record on the sim
  function getRecord(sim, npcId, state) {
    let r = sim.relationships.find((x) => x.id === npcId);
    if (!r) {
      const npc = state.npcs.find((n) => n.id === npcId);
      r = {
        id: npcId,
        name: npc ? npc.name : 'Stranger',
        type: 'neutral',
        tier: TIERS[0].label,
        score: 0,
        interactions: 0,
        lastDay: state.time ? state.time.day : 1,
        metAt: LS.nowISO()
      };
      sim.relationships.push(r);
    }
    return r;
  }

  // Social interaction definitions
  const INTERACTIONS = {
    chat:      { label: 'Chat',         icon: '💬', gain: 4,  fun: 6,  social: 12, reqScore: 0 },
    joke:      { label: 'Tell Joke',    icon: '😄', gain: 7,  fun: 10, social: 10, reqScore: 0, charisma: true },
    compliment:{ label: 'Compliment',   icon: '✨', gain: 6,  fun: 4,  social: 9,  reqScore: 0, charisma: true },
    deep:      { label: 'Deep Talk',    icon: '🧠', gain: 9,  fun: 2,  social: 11, reqScore: 25 },
    gift:      { label: 'Give Gift',    icon: '🎁', gain: 14, fun: 6,  social: 8,  reqScore: 10, cost: 30 },
    flirt:     { label: 'Flirt',        icon: '💘', gain: 8,  fun: 8,  social: 9,  reqScore: 40, romance: true },
    hug:       { label: 'Hug',          icon: '🤗', gain: 5,  fun: 5,  social: 7,  reqScore: 30 },
    confess:   { label: 'Confess Love', icon: '❤️', gain: 18, fun: 6,  social: 8,  reqScore: 75, romance: true }
  };

  function interact(sim, npcId, interactionId, state) {
    const def = INTERACTIONS[interactionId];
    if (!def) return { ok: false, msg: 'Unknown interaction' };
    const r = getRecord(sim, npcId, state);
    if (r.score < def.reqScore) return { ok: false, msg: 'Relationship not high enough' };
    if (def.cost && sim.money < def.cost) return { ok: false, msg: 'Not enough money' };

    // charisma bonus
    let gain = def.gain;
    if (def.charisma) {
      const ch = LS.Skills.level(sim, 'charisma');
      gain += ch * 0.8;
    }
    // mood affects outcome
    if (sim.mood >= 70) gain *= 1.2;
    else if (sim.mood < 30) gain *= 0.5;
    // Romantic trait boosts romance interactions
    if (def.romance && sim.traits.includes('Romantic')) gain *= 1.3;
    // small chance of a flop if low mood
    const flop = sim.mood < 25 && Math.random() < 0.3;
    if (flop) gain = -Math.abs(gain) * 0.5;

    r.score = LS.clamp(r.score + gain, 0, 100);
    r.interactions++;
    if (state.time) r.lastDay = state.time.day;

    // update tier
    const t = tier(r.score);
    r.type = t.type;
    r.tier = t.label;

    // need effects on the sim
    LS.Needs.satisfy(sim, 'fun', def.fun);
    LS.Needs.satisfy(sim, 'social', def.social);

    // emotional fallout
    if (LS.Emotions) {
      if (flop) LS.Emotions.add(sim, 'embarrassed');
      else if (def.romance) LS.Emotions.add(sim, r.score >= 90 ? 'loved' : 'flirty');
      else LS.Emotions.add(sim, 'social');
    }
    LS.Needs.recomputeMood(sim);

    if (def.cost) sim.money -= def.cost;

    // charisma xp
    if (def.charisma) LS.Skills.gainXP(sim, 'charisma', 6);

    return {
      ok: true,
      msg: flop ? `That didn't go well with ${r.name}…` : `${def.label} with ${r.name} (+${Math.round(gain)})`,
      gain: Math.round(gain),
      score: r.score,
      tier: t.label,
      type: t.type
    };
  }

  // Relationships cool off if neglected. Called on day rollover.
  // Bonds you've invested in (higher tier) decay slower.
  function decayAll(sim, currentDay) {
    (sim.relationships || []).forEach((r) => {
      const idle = currentDay - (r.lastDay || currentDay);
      if (idle <= 1) return;
      const rate = r.score >= 70 ? 1.2 : r.score >= 40 ? 2.0 : 2.8;
      r.score = LS.clamp(r.score - rate * (idle - 1), 0, 100);
      const t = tier(r.score);
      r.type = t.type;
      r.tier = t.label;
      r.lastDay = currentDay;
    });
  }

  // Build a UI list of relationships for a sim
  function list(sim) {
    return sim.relationships.map((r) => ({
      id: r.id,
      name: r.name,
      score: r.score,
      tier: tier(r.score).label,
      type: tier(r.score).type,
      interactions: r.interactions
    }));
  }

  // Count friends (score >= 50)
  function friendCount(sim) {
    return sim.relationships.filter((r) => r.score >= 50).length;
  }

  // Has any romantic partner?
  function hasPartner(sim) {
    return sim.relationships.some((r) => r.score >= 90 && r.type === 'romance');
  }

  LS.Relationships = {
    TIERS,
    tier,
    ensureNPCs,
    getRecord,
    INTERACTIONS,
    interact,
    decayAll,
    list,
    friendCount,
    hasPartner,
    NPC_NAMES
  };
})();