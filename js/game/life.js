/* ============================================================
   LifeSim — Life Stages & Family
   Sims age through life stages, can move in / marry a partner,
   have children who grow up into new playable Sims, and pass on
   of old age (control then continues with an heir). Generations.
   Attaches to window.LifeSim.Life.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Days-lived thresholds for the active Sim's life stages.
  const STAGE_DAYS = { adult: 12, elder: 24, death: 40 };

  const STAGES = {
    young: { label: 'Young Adult', icon: '🧑', next: STAGE_DAYS.adult },
    adult: { label: 'Adult',       icon: '🧔', next: STAGE_DAYS.elder },
    elder: { label: 'Elder',       icon: '🧓', next: STAGE_DAYS.death }
  };

  // Children grow through these by days-since-born.
  const CHILD_STAGES = [
    { key: 'baby',    label: 'Baby',        icon: '👶', until: 2 },
    { key: 'toddler', label: 'Toddler',     icon: '🧸', until: 5 },
    { key: 'child',   label: 'Child',       icon: '🧒', until: 9 },
    { key: 'teen',    label: 'Teen',        icon: '🧑', until: 13 },
    { key: 'grown',   label: 'Young Adult', icon: '🧑', until: Infinity }
  ];

  const CHILD_NAMES = ['Alex', 'Sam', 'Robin', 'Jamie', 'Riley', 'Quinn', 'Avery', 'Rowan', 'Sky', 'Max', 'Nova', 'Eli', 'Mia', 'Leo', 'Ivy', 'Theo'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function daysLived(sim, day) { return Math.max(0, (day || 1) - (sim.bornDay || 1)); }

  function stageFor(dl) {
    if (dl >= STAGE_DAYS.elder) return 'elder';
    if (dl >= STAGE_DAYS.adult) return 'adult';
    return 'young';
  }
  function stageMeta(key) { return STAGES[key] || STAGES.young; }

  function childStage(ageDays) {
    for (const s of CHILD_STAGES) if (ageDays < s.until) return s;
    return CHILD_STAGES[CHILD_STAGES.length - 1];
  }
  function childStageMeta(key) {
    return CHILD_STAGES.find((s) => s.key === key) || CHILD_STAGES[0];
  }

  // Progress toward the next life stage (0..1), for UI bars.
  function stageProgress(sim, day) {
    const dl = daysLived(sim, day);
    const st = stageFor(dl);
    if (st === 'young') return { stage: st, progress: Math.min(1, dl / STAGE_DAYS.adult), daysLived: dl };
    if (st === 'adult') return { stage: st, progress: Math.min(1, (dl - STAGE_DAYS.adult) / (STAGE_DAYS.elder - STAGE_DAYS.adult)), daysLived: dl };
    return { stage: st, progress: Math.min(1, (dl - STAGE_DAYS.elder) / (STAGE_DAYS.death - STAGE_DAYS.elder)), daysLived: dl };
  }

  // ---- Relationships → household ----
  function moveIn(sim, npc) {
    sim.partner = {
      npcId: npc.id, name: npc.name, married: false,
      skinTone: npc.skinTone, hairColor: npc.hairColor, outfitColor: npc.outfitColor,
      traits: (npc.traits || []).slice(0, 2)
    };
    return sim.partner;
  }
  function marry(sim) {
    if (!sim.partner) return { ok: false, msg: 'No partner to marry' };
    if (sim.partner.married) return { ok: false, msg: 'Already married' };
    sim.partner.married = true;
    return { ok: true, partner: sim.partner };
  }
  function hasPartner(sim) { return !!sim.partner; }

  function tryForBaby(sim, state) {
    if (!sim.partner) return { ok: false, msg: 'You need a partner first — reach Partner, then Move In.' };
    if ((sim.children || []).length >= 6) return { ok: false, msg: 'Your household is full!' };
    const p = sim.partner;
    const traits = [];
    const t1 = pick((sim.traits && sim.traits.length) ? sim.traits : LS.TRAITS);
    const t2 = pick((p.traits && p.traits.length) ? p.traits : LS.TRAITS);
    [t1, t2].forEach((t) => { if (traits.indexOf(t) < 0) traits.push(t); });
    const surname = sim.name.split(' ').slice(1).join(' ') || '';
    const child = {
      id: LS.uid(),
      name: (pick(CHILD_NAMES) + (surname ? ' ' + surname : '')).trim(),
      traits: traits,
      skinTone: Math.random() < 0.5 ? sim.skinTone : p.skinTone,
      hairColor: Math.random() < 0.5 ? sim.hairColor : p.hairColor,
      outfitColor: pick(LS.OUTFIT_COLORS),
      bornDay: state.time.day,
      stage: 'baby',
      graduated: false
    };
    if (!sim.children) sim.children = [];
    sim.children.push(child);
    return { ok: true, child: child };
  }

  // Called on each day rollover; returns a list of life events to surface.
  function onDay(state, sim, newDay) {
    const events = [];

    const dl = daysLived(sim, newDay);
    sim.age = 24 + dl;
    const st = stageFor(dl);
    if (st !== sim.lifeStage) {
      sim.lifeStage = st;
      events.push({ type: 'stage', stage: st, label: stageMeta(st).label, icon: stageMeta(st).icon });
    }

    (sim.children || []).forEach((c) => {
      const cs = childStage(newDay - c.bornDay);
      if (cs.key !== c.stage) {
        c.stage = cs.key;
        events.push({ type: 'childstage', name: c.name, label: cs.label, icon: cs.icon });
        if (cs.key === 'grown' && !c.graduated) {
          c.graduated = true;
          const ns = LS.createSim({
            name: c.name,
            traits: (c.traits || []).slice(0, 3),
            skinTone: c.skinTone, hairColor: c.hairColor, outfitColor: c.outfitColor,
            aspiration: pick(Object.keys(LS.ASPIRATIONS))
          });
          ns.bornDay = newDay;
          state.sims.push(ns);
          events.push({ type: 'grownup', name: c.name, simId: ns.id });
        }
      }
    });

    if (dl >= STAGE_DAYS.death && !sim._dead) {
      sim._dead = true;
      events.push({ type: 'death' });
    }
    return events;
  }

  LS.Life = {
    STAGE_DAYS, STAGES, CHILD_STAGES,
    daysLived, stageFor, stageMeta, stageProgress,
    childStage, childStageMeta,
    moveIn, marry, hasPartner, tryForBaby,
    onDay
  };
})();
