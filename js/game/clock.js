/* ============================================================
   LifeSim — Time, Clock & Game Loop
   Advances time, decays needs, ages moodlets, and drives the Sim:
   every targeted action walks the Sim tile-by-tile (pathfinding)
   to the object, then performs it. Adds free-will autonomy and
   idle wandering. Attaches to window.LifeSim.Clock.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Real-time milliseconds per in-game minute at each speed
  const SPEED_MS = {
    0: Infinity,  // paused
    1: 1000,      // normal: 1s = 1 in-game min
    2: 500,       // fast
    3: 200        // ultra
  };

  const WORK_START = 9;   // 9 AM
  const WORK_END = 17;    // 5 PM
  const DAY_LENGTH = 24;  // hours
  const MINUTES_PER_DAY = DAY_LENGTH * 60;
  const WALK_TILES_PER_MIN = 4; // walking speed (tiles per in-game minute)

  let state = null;
  let sim = null;
  let lastTick = 0;
  let acc = 0;
  let rafId = null;
  let onTickCb = null;
  let onEventCb = null;
  let lastTickEmit = 0;
  let idleMs = 0;
  let presentNpcs = []; // NPCs currently roaming the active lot
  const TICK_EMIT_MS = 50; // throttle UI updates (~20fps; CSS smooths walking)

  function setPresentNpcs(list) { presentNpcs = list || []; }

  function dayPhase(hour) {
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  function formatTime(t) {
    const h = String(t.hour).padStart(2, '0');
    const m = String(t.minute).padStart(2, '0');
    return `${h}:${m}`;
  }

  function format12(t) {
    let h = t.hour % 12; if (h === 0) h = 12;
    const ampm = t.hour < 12 ? 'AM' : 'PM';
    return `${h}:${String(t.minute).padStart(2, '0')} ${ampm}`;
  }

  function speed(n) {
    if (state) state.time.speed = n;
  }

  function isPaused() {
    return !state || state.time.speed === 0;
  }

  // Advance time by a number of in-game minutes (decay, moodlets, events).
  function advance(minutes) {
    if (!state || !sim) return;
    let { hour, minute, day } = state.time;
    const beforeHour = hour;
    const beforeDay = day;

    minute += minutes;
    while (minute >= 60) { minute -= 60; hour++; }
    while (hour >= DAY_LENGTH) { hour -= DAY_LENGTH; day++; }

    state.time.minute = minute;
    state.time.hour = hour;
    state.time.day = day;
    state.time.dayPhase = dayPhase(hour);

    LS.Needs.decay(sim, minutes);
    if (LS.Emotions) LS.Emotions.tick(sim, minutes);
    LS.Build.applyPassives(sim, state);

    if (hour !== beforeHour) onHourRollover(beforeHour, hour);
    if (day !== beforeDay) onDayRollover(beforeDay, day);
  }

  function onHourRollover(prevHour, newHour) {
    if (newHour === WORK_START) tryWork();
    // gentle overnight energy drift while not actively sleeping
    if ((newHour >= 22 || newHour < 6) && (!sim.action || sim.action.kind !== 'use')) {
      LS.Needs.satisfy(sim, 'energy', 3);
    }
  }

  function onDayRollover(prevDay, newDay) {
    if (sim.career) LS.Needs.satisfy(sim, 'energy', 8);
    LS.Relationships.decayAll(sim, newDay);
    if (LS.Life) {
      LS.Life.onDay(state, sim, newDay).forEach((e) => fireEvent({ type: 'life', life: e }));
    }
    checkLifeMilestones();
    fireEvent({ type: 'newday', day: newDay });
  }

  // ---------------- WORK ----------------

  function tryWork() {
    if (!sim.career) return;
    const res = LS.Careers.work(sim, state.time.day);
    if (res.ok) {
      fireEvent({ type: 'work', ...res });
      if (LS.Skills.canPromote(sim)) {
        const promo = LS.Careers.promote(sim);
        if (promo.ok) {
          if (LS.Emotions) LS.Emotions.add(sim, 'successful');
          fireEvent({ type: 'promotion', ...promo });
          LS.Economy.earn(state, sim, 40, `Promotion: ${promo.title}`);
          checkQuest('first_promo', 1);
          checkLifeMilestones();
        }
      }
    } else if (res.msg !== 'Already worked today') {
      fireEvent({ type: 'workfail', msg: res.msg });
    }
  }

  // ---------------- LIFE MILESTONES (one-time LSC) ----------------

  function checkLifeMilestones() {
    if (!sim) return;
    LS.SKILLS.forEach((k) => {
      if (sim.skills[k].level >= LS.Skills.MAX_LEVEL) {
        const r = LS.Economy.rewardMilestoneOnce(state, sim, 'skill_maxed', 'Mastered ' + LS.SKILL_META[k].label, 'skill_' + k);
        if (r.amount > 0) fireEvent({ type: 'milestone', label: 'Mastered ' + LS.SKILL_META[k].label, amount: r.amount });
        checkQuest('skill_master', 1);
      }
    });
    if (sim.career) {
      const c = LS.CAREERS[sim.career.track];
      if (sim.career.level >= c.levels.length - 1) {
        const r = LS.Economy.rewardMilestoneOnce(state, sim, 'career_top', 'Topped the ' + c.label + ' career', 'career_top');
        if (r.amount > 0) fireEvent({ type: 'milestone', label: 'Career peak: ' + c.label, amount: r.amount });
        checkQuest('career_star', 1);
      }
    }
    const asp = LS.aspirationStatus(sim);
    if (asp.done && !sim.aspirationDone) {
      sim.aspirationDone = true;
      const r = LS.Economy.rewardMilestoneOnce(state, sim, 'aspiration_done', 'Fulfilled aspiration: ' + asp.label, 'aspiration');
      fireEvent({ type: 'aspiration', label: asp.label, amount: r.amount });
      checkQuest('dream_big', 1);
    }
  }

  // ---------------- AUTONOMY (free will) ----------------

  function autonomy() {
    const crit = LS.Needs.criticalNeeds(sim, 22);
    if (!crit.length) return false;
    crit.sort((a, b) => a.value - b.value);
    for (const c of crit) {
      let best = null, bestCost = Infinity;
      state.lot.furniture.forEach((f) => {
        if (!f.passive && f.effect && (c.need in f.effect)) {
          const cost = LS.Movement.pathCostToFurniture(state, sim, f);
          if (cost < bestCost) { bestCost = cost; best = f; }
        }
      });
      if (best && bestCost !== Infinity) {
        queueAction({
          id: 'auto_' + c.need,
          label: 'Auto: ' + LS.NEED_META[c.need].label,
          icon: LS.NEED_META[c.need].icon,
          duration: autoDuration(c.need),
          target: best.uid,
          kind: 'use',
          auto: true,
          skipToMorning: c.need === 'energy' && (state.time.hour >= 21 || state.time.hour < 6)
        });
        return true;
      }
    }
    return false;
  }

  function autoDuration(need) {
    if (need === 'energy') return 150;
    if (need === 'hunger') return 35;
    if (need === 'bladder') return 12;
    if (need === 'hygiene') return 22;
    return 30;
  }

  // ---------------- ACTION QUEUE ----------------

  function queueAction(action) {
    if (!sim) return;
    action.phase = null;
    action.elapsed = 0;
    sim.actionQueue.push(action);
    if (!sim.action) nextAction();
  }

  function clearQueue() {
    if (!sim) return;
    sim.actionQueue = [];
  }

  // Remove a queued action by index (UI cancel). Index 0 means the active one.
  function cancelAction(index) {
    if (!sim) return;
    if (index === 0) {
      if (sim.action && sim.action.kind === 'social' && sim.action.npcId) {
        const npc = state.npcs.find((n) => n.id === sim.action.npcId);
        if (npc) npc._busy = false;
      }
      sim.action = null;
      sim.path = [];
      sim.moving = false;
      nextAction();
    } else {
      sim.actionQueue.splice(index - 1, 1);
    }
  }

  function nextAction() {
    if (!sim) return;
    sim.action = sim.actionQueue.shift() || null;
    if (!sim.action) { sim.moving = false; return; }
    const a = sim.action;
    a.elapsed = 0;
    a.startedAt = Date.now();
    sim.path = [];
    if (a.kind === 'social' && a.npcId) {
      const npc = state.npcs.find((n) => n.id === a.npcId);
      if (npc) {
        npc._busy = true; npc.path = []; npc.moving = false; // wait for the player
        const pseudo = { x: npc.tile.x, y: npc.tile.y, size: { w: 1, h: 1 } };
        const tile = LS.Movement.useTileFor(state, pseudo, sim.tile) || npc.tile;
        const path = LS.Movement.findPath(state, sim.tile, tile);
        if (path && path.length) { a.phase = 'walking'; a.standTile = tile; sim.path = path.slice(); sim.moving = true; }
        else { a.phase = 'using'; }
      } else { a.phase = 'using'; }
    } else if (a.target) {
      const f = LS.Build.getInstance(state, a.target);
      if (f) {
        const route = LS.Movement.routeToFurniture(state, sim, f);
        if (route && route.path && route.path.length) {
          a.phase = 'walking';
          a.standTile = route.tile;
          sim.path = route.path.slice();
          sim.moving = true;
        } else if (route) {
          // already standing on an adjacent tile → use in place
          a.standTile = route.tile;
          a.phase = 'using';
        } else {
          // object is walled off / unreachable → abandon and move on
          sim.action = null;
          sim.moving = false;
          fireEvent({ type: 'actionfail', action: a, reason: 'unreachable' });
          nextAction();
          return;
        }
      } else {
        a.phase = 'using';
      }
    } else {
      a.phase = 'using';
    }
    fireEvent({ type: 'actionstart', action: a });
  }

  // Move the Sim along sim.path. Returns true when the path is exhausted.
  function moveAlongPath(minutes) {
    let budget = WALK_TILES_PER_MIN * minutes;
    let guard = 0;
    while (budget > 1e-6 && sim.path.length && guard++ < 64) {
      const wp = sim.path[0];
      const dx = wp.x - sim.px;
      const dy = wp.y - sim.py;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) { sim.path.shift(); continue; }
      sim.facing = LS.Movement.facingFromDelta(dx, dy);
      if (dist <= budget) {
        sim.px = wp.x; sim.py = wp.y;
        sim.tile = { x: wp.x, y: wp.y };
        sim.path.shift();
        budget -= dist;
      } else {
        sim.px += (dx / dist) * budget;
        sim.py += (dy / dist) * budget;
        budget = 0;
      }
    }
    sim.moving = sim.path.length > 0;
    return sim.path.length === 0;
  }

  // Generic path-follow for any agent (sim or npc) with tile/px/py/path.
  function moveAgentAlong(a, minutes, mul) {
    let budget = WALK_TILES_PER_MIN * (mul || 1) * minutes;
    let guard = 0;
    if (!a.path) a.path = [];
    while (budget > 1e-6 && a.path.length && guard++ < 64) {
      const wp = a.path[0];
      const dx = wp.x - a.px, dy = wp.y - a.py;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) { a.path.shift(); continue; }
      a.facing = LS.Movement.facingFromDelta(dx, dy);
      if (dist <= budget) {
        a.px = wp.x; a.py = wp.y; a.tile = { x: wp.x, y: wp.y };
        a.path.shift(); budget -= dist;
      } else {
        a.px += (dx / dist) * budget; a.py += (dy / dist) * budget; budget = 0;
      }
    }
    a.moving = a.path.length > 0;
    return a.path.length === 0;
  }

  // Pick a usable (non-decor) object the NPC can reach.
  function pickNpcObject(npc) {
    const usable = state.lot.furniture.filter((f) => !f.passive && f.mood);
    if (!usable.length) return null;
    for (let i = 0; i < 5; i++) {
      const f = usable[Math.floor(Math.random() * usable.length)];
      if (LS.Movement.pathCostToFurniture(state, npc, f) !== Infinity) return f;
    }
    return null;
  }

  // Present NPCs live their own little lives: wander, then walk to an object
  // and actually use it (sit / lie / cook…) for a while, then move on.
  function tickNpcs(realMs) {
    if (!presentNpcs.length) return;
    const msPerMin = SPEED_MS[state.time.speed];
    if (!isFinite(msPerMin)) return;
    const minutes = realMs / msPerMin;
    presentNpcs.forEach((npc) => {
      if (npc._busy) { npc.moving = false; return; } // chatting with the player

      if (npc.act) {
        if (npc.act.phase === 'walking') {
          if (!LS.Build.getInstance(state, npc.act.target)) { npc.act = null; npc.path = []; }
          else if (moveAgentAlong(npc, minutes, 0.8)) {
            npc.act.phase = 'using'; npc.act.elapsed = 0; npc.moving = false;
            const f = LS.Build.getInstance(state, npc.act.target);
            if (f) npc.facing = LS.Movement.facingFromDelta((f.x + f.size.w / 2) - npc.px, (f.y + f.size.h / 2) - npc.py);
          }
          return;
        }
        if (npc.act.phase === 'using') {
          if (!LS.Build.getInstance(state, npc.act.target)) { npc.act = null; npc._idle = 0; npc.moving = false; return; }
          npc.act.elapsed += minutes;
          if (npc.act.elapsed >= npc.act.duration) { npc.act = null; npc._idle = 0; }
          return;
        }
      }

      if (npc.path && npc.path.length) { moveAgentAlong(npc, minutes, 0.8); return; }
      npc.moving = false;
      npc._idle = (npc._idle || 0) + realMs;
      if (npc._idle < 1500 + (npc._jitter || 0)) return;
      npc._idle = 0; npc._jitter = Math.random() * 1800;

      // 60% of the time, go use an object; otherwise wander
      if (Math.random() < 0.6) {
        const obj = pickNpcObject(npc);
        if (obj) {
          const tile = LS.Movement.useTileFor(state, obj, npc.tile);
          if (tile) {
            const path = LS.Movement.findPath(state, npc.tile, tile);
            npc.act = { target: obj.uid, phase: (path && path.length) ? 'walking' : 'using', elapsed: 0, duration: 25 + Math.random() * 45, mood: obj.mood };
            npc.path = (path && path.length) ? path.slice() : [];
            npc.moving = npc.path.length > 0;
            return;
          }
        }
      }
      const w = state.lot.size.w, h = state.lot.size.h;
      const tx = Math.max(0, Math.min(w - 1, npc.tile.x + (Math.floor(Math.random() * 7) - 3)));
      const ty = Math.max(0, Math.min(h - 1, npc.tile.y + (Math.floor(Math.random() * 7) - 3)));
      const goal = LS.Movement.nearestWalkable(state, tx, ty);
      if (goal) {
        const p = LS.Movement.findPath(state, npc.tile, goal);
        if (p && p.length) { npc.path = p.slice(); npc.moving = true; }
      }
    });
  }

  function beginUsing(action) {
    action.phase = 'using';
    action.elapsed = 0;
    action.startedAt = Date.now();
    sim.moving = false;
    // face the object or person being used
    if (action.kind === 'social' && action.npcId) {
      const npc = state.npcs.find((n) => n.id === action.npcId);
      if (npc) {
        sim.facing = LS.Movement.facingFromDelta(npc.px - sim.px, npc.py - sim.py);
        npc.facing = LS.Movement.facingFromDelta(sim.px - npc.px, sim.py - npc.py); // face back
      }
    } else {
      const f = action.target && LS.Build.getInstance(state, action.target);
      if (f) {
        const cx = f.x + f.size.w / 2;
        const cy = f.y + f.size.h / 2;
        sim.facing = LS.Movement.facingFromDelta(cx - sim.px, cy - sim.py);
      }
    }
    fireEvent({ type: 'using', action });
  }

  // Per-frame Sim update (walking + using + idle), real-time based.
  function tickSim(realMs) {
    if (!sim || isPaused()) return;
    const msPerMin = SPEED_MS[state.time.speed];
    if (!isFinite(msPerMin)) return;
    const minutes = realMs / msPerMin;

    if (sim.action && sim.action.phase === 'walking') {
      // re-route if the path got blocked by a build edit
      if (sim.path.length && !LS.Movement.isWalkable(state, sim.path[0].x, sim.path[0].y) &&
          !(sim.path[0].x === Math.round(sim.px) && sim.path[0].y === Math.round(sim.py))) {
        reroute();
      }
      if (moveAlongPath(minutes)) beginUsing(sim.action);
    } else if (sim.action && sim.action.phase === 'using') {
      sim.action.elapsed += minutes;
      if (sim.action.elapsed >= sim.action.duration) {
        const done = sim.action;
        completeAction(done);
        nextAction();
      }
    } else if (!sim.action) {
      idleStep(minutes, realMs);
    }
  }

  function reroute() {
    const a = sim.action;
    if (!a || !a.target) return;
    const f = LS.Build.getInstance(state, a.target);
    if (!f) { sim.path = []; return; }
    const route = LS.Movement.routeToFurniture(state, sim, f);
    sim.path = route && route.path ? route.path.slice() : [];
  }

  function idleStep(minutes, realMs) {
    // finishing a wander walk
    if (sim.path.length) { moveAlongPath(minutes); return; }
    sim.moving = false;
    idleMs += realMs;
    if (idleMs < 2200) return;
    idleMs = 0;
    if (state.player.settings.freeWill && autonomy()) return;
    // occasional idle wander so the Sim feels alive
    if (Math.random() < 0.5) {
      const w = state.lot.size.w, h = state.lot.size.h;
      const tx = Math.max(0, Math.min(w - 1, sim.tile.x + (Math.floor(Math.random() * 7) - 3)));
      const ty = Math.max(0, Math.min(h - 1, sim.tile.y + (Math.floor(Math.random() * 7) - 3)));
      const goal = LS.Movement.nearestWalkable(state, tx, ty);
      if (goal) {
        const p = LS.Movement.findPath(state, sim.tile, goal);
        if (p && p.length) { sim.path = p.slice(); sim.moving = true; }
      }
    }
  }

  function completeAction(action) {
    if (!sim) return;
    if (action.kind === 'use' && action.target) {
      const placed = LS.Build.getInstance(state, action.target);
      if (placed) {
        const res = LS.Build.useEffect(sim, placed);
        if (action.skipToMorning) {
          LS.Needs.satisfy(sim, 'energy', 100);
          if (state.time.hour >= 20 || state.time.hour < 7) skipTo(7);
        }
        fireEvent({
          type: 'actiondone',
          action,
          skill: res && res.skill,
          msg: `${sim.name} used the ${placed.name}`
        });
        if (placed.cat === 'food') checkQuest('first_meal', 1);
        if (placed.mood === 'rest' && sim.needs.energy >= 95) checkQuest('well_rested', 1);
        if (res && res.skill) {
          const sk = LS.Skills.level(sim, res.skill);
          checkQuest('skill_lvl3', sk);
        }
        checkLifeMilestones();
      }
    } else if (action.kind === 'job') {
      const res = LS.Careers.work(sim, state.time.day);
      fireEvent({ type: res.ok ? 'work' : 'workfail', ...res });
      if (res.ok) {
        checkQuest('get_hired', 1);
        if (LS.Skills.canPromote(sim)) {
          const promo = LS.Careers.promote(sim);
          if (promo.ok) {
            if (LS.Emotions) LS.Emotions.add(sim, 'successful');
            fireEvent({ type: 'promotion', ...promo });
            LS.Economy.earn(state, sim, 40, `Promotion: ${promo.title}`);
            checkQuest('first_promo', 1);
          }
        }
        checkLifeMilestones();
      }
    } else if (action.kind === 'social') {
      const npc = state.npcs.find((n) => n.id === action.npcId);
      const res = LS.Relationships.interact(sim, action.npcId, action.interactionId, state);
      if (npc) { npc._busy = false; npc._idle = 9999; } // free them, let them move again
      fireEvent({ type: 'social', res, npcId: action.npcId });
    } else if (action.kind === 'practice') {
      if (action.skill) {
        const up = LS.Skills.gainXP(sim, action.skill, 30);
        if (LS.Emotions) {
          const creative = ['painting', 'writing', 'music', 'creativity'].indexOf(action.skill) !== -1;
          const logical = ['logic', 'programming', 'handiness'].indexOf(action.skill) !== -1;
          LS.Emotions.add(sim, creative ? 'inspired' : logical ? 'focused' : 'pumped');
        }
        LS.Needs.satisfy(sim, 'fun', 6);
        fireEvent({ type: 'actiondone', action, ...up, msg: `${sim.name} practiced ${LS.SKILL_META[action.skill].label}` });
        if (up.leveledUp) {
          fireEvent({ type: 'skillup', skill: action.skill, level: up.newLevel });
          checkQuest('skill_lvl3', up.newLevel);
          checkLifeMilestones();
        }
      }
    } else {
      fireEvent({ type: 'actiondone', action, msg: action.label });
    }
    sim.action = null;
  }

  // ---------------- QUESTS ----------------

  function checkQuest(questId, progressValue) {
    const q = state.quests.find((x) => x.id === questId);
    if (!q || q.done) return;
    q.progress = Math.max(q.progress, progressValue);
    if (q.progress >= q.target) {
      q.done = true;
      state.stats.questsCompleted++;
      LS.Economy.earn(state, sim, q.reward, `Quest: ${q.title}`);
      // Mirror to the server-verified redeemable pool (no-op when offline).
      try { if (LS.P2E && LS.P2E.claim) LS.P2E.claim('quest', q.id); } catch (e) { /* */ }
      fireEvent({ type: 'quest', quest: q });
    }
  }

  function notifyQuest(questId, value) {
    checkQuest(questId, value);
  }

  // ---------------- EVENT BUS ----------------

  function fireEvent(ev) {
    if (onEventCb) onEventCb(ev);
    if (onTickCb) lastTickEmit = 0; // force a refresh on the next frame
  }

  // ---------------- LOOP ----------------

  function loop(ts) {
    if (!lastTick) lastTick = ts;
    const dt = Math.min(ts - lastTick, 250); // clamp big gaps (tab switch)
    lastTick = ts;

    if (!isPaused()) {
      acc += dt;
      const msPerMin = SPEED_MS[state.time.speed];
      let steps = 0;
      while (acc >= msPerMin && steps++ < 600) {
        acc -= msPerMin;
        advance(1);
      }
      tickSim(dt);
      tickNpcs(dt);
    }

    if (onTickCb && (ts - lastTickEmit) >= TICK_EMIT_MS) {
      lastTickEmit = ts;
      onTickCb();
    }

    rafId = requestAnimationFrame(loop);
  }

  function start(s, activeSim, onTick, onEvent) {
    state = s;
    sim = activeSim;
    onTickCb = onTick;
    onEventCb = onEvent;
    LS.Build.ensureLot(state);
    LS.Relationships.ensureNPCs(state);
    LS.Movement.ensureSimTile(state, sim);
    sim.px = sim.tile.x;
    sim.py = sim.tile.y;
    sim.path = [];
    sim.moving = false;
    if (state.time.speed === 0) state.time.speed = 1;
    lastTick = 0;
    acc = 0;
    idleMs = 0;
    if (LS.Emotions) LS.Emotions.recompute(sim);
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Skip time forward to a target hour (used by "sleep till morning").
  function skipTo(targetHour) {
    if (!state) return;
    let mins;
    const { hour, minute } = state.time;
    if (targetHour <= hour) {
      mins = (DAY_LENGTH - hour) * 60 - minute + targetHour * 60;
    } else {
      mins = (targetHour - hour) * 60 - minute;
    }
    if (mins > 0) advance(mins);
  }

  LS.Clock = {
    SPEED_MS,
    WORK_START,
    WORK_END,
    DAY_LENGTH,
    WALK_TILES_PER_MIN,
    start,
    stop,
    speed,
    isPaused,
    advance,
    skipTo,
    formatTime,
    format12,
    dayPhase,
    queueAction,
    clearQueue,
    cancelAction,
    nextAction,
    notifyQuest,
    checkQuest,
    checkLifeMilestones,
    setPresentNpcs
  };
})();
