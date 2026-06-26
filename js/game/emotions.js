/* ============================================================
   LifeSim — Emotions & Moodlets
   A Sims-style emotional layer on top of raw needs. Events grant
   timed moodlets that nudge mood and bias the dominant emotion,
   which in turn affects work performance and learning speed.
   Attaches to window.LifeSim.Emotions.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Preset moodlets. `mood` is a flat modifier added to the Sim's mood while
  // active; `ttl` is its lifetime in in-game minutes; `emotion` (optional)
  // biases the dominant emotion; `tone` colours the UI chip.
  const MOODLETS = {
    rested:     { label: 'Well Rested',   icon: '😌', tone: 'good', mood: 8,  ttl: 300, emotion: 'energized', priority: 6 },
    satisfied:  { label: 'Satisfied',     icon: '😋', tone: 'good', mood: 6,  ttl: 240, emotion: 'happy' },
    clean:      { label: 'Feeling Clean', icon: '✨', tone: 'good', mood: 5,  ttl: 240, emotion: 'happy' },
    relieved:   { label: 'Relieved',      icon: '😮‍💨', tone: 'good', mood: 3, ttl: 120 },
    productive: { label: 'Productive',    icon: '💼', tone: 'good', mood: 6,  ttl: 240, emotion: 'confident' },
    successful: { label: 'Successful!',   icon: '🏆', tone: 'good', mood: 14, ttl: 600, emotion: 'confident', priority: 10 },
    flirty:     { label: 'Flirty',        icon: '😍', tone: 'good', mood: 8,  ttl: 220, emotion: 'flirty', priority: 7 },
    loved:      { label: 'Loved',         icon: '💞', tone: 'good', mood: 12, ttl: 480, emotion: 'happy', priority: 8 },
    inspired:   { label: 'Inspired',      icon: '🎨', tone: 'good', mood: 8,  ttl: 280, emotion: 'inspired', priority: 7 },
    focused:    { label: 'Focused',       icon: '🧐', tone: 'good', mood: 6,  ttl: 220, emotion: 'focused' },
    pumped:     { label: 'Pumped',        icon: '💪', tone: 'good', mood: 7,  ttl: 220, emotion: 'energized' },
    playful:    { label: 'Having Fun',    icon: '😄', tone: 'good', mood: 6,  ttl: 180, emotion: 'playful' },
    comfy:      { label: 'Comfortable',   icon: '🛋️', tone: 'good', mood: 4,  ttl: 160 },
    social:     { label: 'Social Bee',    icon: '💬', tone: 'good', mood: 5,  ttl: 200 },
    homey:      { label: 'Lovely Decor',  icon: '🪴', tone: 'good', mood: 4,  ttl: 240 },
    embarrassed:{ label: 'Embarrassed',   icon: '😳', tone: 'bad',  mood: -8, ttl: 160, emotion: 'embarrassed', priority: 8 },
    cranky:     { label: 'Cranky',        icon: '😠', tone: 'bad',  mood: -6, ttl: 160, emotion: 'angry' },
    drained:    { label: 'Drained',       icon: '🥱', tone: 'bad',  mood: -7, ttl: 200, emotion: 'exhausted', priority: 7 },
    lonely:     { label: 'Lonely',        icon: '😔', tone: 'bad',  mood: -6, ttl: 260, emotion: 'sad' },
    starving:   { label: 'Starving',      icon: '🍽️', tone: 'bad',  mood: -7, ttl: 120, emotion: 'uncomfortable' },
    stressed:   { label: 'Stressed Out',  icon: '😣', tone: 'bad',  mood: -6, ttl: 180, emotion: 'tense' }
  };

  // Add (or refresh) a moodlet on a Sim. `key` is a MOODLETS id, or pass a
  // full object to define a custom one. Same-id moodlets refresh rather than
  // stack so they never pile up unboundedly.
  function add(sim, key, override) {
    if (!sim.moodlets) sim.moodlets = [];
    let def;
    let id;
    if (typeof key === 'string') {
      def = MOODLETS[key];
      id = key;
      if (!def) return null;
    } else {
      def = key;
      id = key.id || ('m_' + (key.label || 'x'));
    }
    const m = Object.assign({ id }, def, override || {});
    m.ttl0 = m.ttl; // remember original lifetime for UI bars
    const existing = sim.moodlets.find((x) => x.id === id);
    if (existing) {
      Object.assign(existing, m);
    } else {
      sim.moodlets.push(m);
      // keep the list bounded — drop the weakest if too many
      if (sim.moodlets.length > 8) {
        sim.moodlets.sort((a, b) => Math.abs(b.mood) - Math.abs(a.mood));
        sim.moodlets.length = 8;
      }
    }
    return m;
  }

  function remove(sim, id) {
    if (!sim.moodlets) return;
    sim.moodlets = sim.moodlets.filter((m) => m.id !== id);
  }

  // Age moodlets by elapsed in-game minutes, dropping expired ones.
  function tick(sim, minutes) {
    if (!sim.moodlets || !sim.moodlets.length) return;
    let changed = false;
    sim.moodlets = sim.moodlets.filter((m) => {
      m.ttl -= minutes;
      if (m.ttl <= 0) { changed = true; return false; }
      return true;
    });
    if (changed) LS.Needs.recomputeMood(sim);
  }

  // Net mood delta from all active moodlets (clamped so it can't dominate).
  function moodletModifier(sim) {
    if (!sim.moodlets || !sim.moodlets.length) return 0;
    let sum = 0;
    sim.moodlets.forEach((m) => (sum += (m.mood || 0)));
    return LS.clamp(sum, -30, 30);
  }

  // Choose the dominant emotion from needs + active moodlets + mood.
  function recompute(sim) {
    const n = sim.needs;

    // strongest emotion-bearing moodlet
    let forced = null, forcedMag = 0;
    (sim.moodlets || []).forEach((m) => {
      if (!m.emotion) return;
      const mag = Math.abs(m.mood || 0) + (m.priority || 0);
      if (mag > forcedMag) { forcedMag = mag; forced = m.emotion; }
    });

    // urgent physical states override mild moodlets
    let urgent = null;
    if (n.energy < 14) urgent = 'exhausted';
    else if (n.bladder < 13 || n.hygiene < 13) urgent = 'uncomfortable';
    else if (n.hunger < 15) urgent = 'uncomfortable';

    let emotion;
    if (urgent && forcedMag < 12) {
      emotion = urgent;
    } else if (forced) {
      emotion = forced;
    } else if (n.fun < 22) {
      emotion = 'bored';
    } else if (n.social < 18) {
      emotion = 'sad';
    } else if (n.comfort < 20) {
      emotion = 'uncomfortable';
    } else if (sim.mood >= 86) {
      emotion = 'ecstatic';
    } else if (sim.mood >= 70) {
      emotion = 'happy';
    } else if (sim.mood < 28) {
      emotion = 'tense';
    } else {
      emotion = 'fine';
    }
    sim.emotion = emotion;
    return emotion;
  }

  function meta(sim) {
    return LS.EMOTION_META[sim.emotion] || LS.EMOTION_META.fine;
  }

  // Performance / learning multiplier from the current emotion.
  function performanceMod(sim) {
    const tone = meta(sim).tone;
    if (tone === 'good') return 1.15;
    if (tone === 'bad') return 0.8;
    return 1;
  }

  LS.Emotions = {
    MOODLETS,
    add,
    remove,
    tick,
    moodletModifier,
    recompute,
    meta,
    performanceMod
  };
})();
