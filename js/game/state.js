/* ============================================================
   LifeSim — Core Game State Engine
   Central model: player, sims, needs, skills, careers,
   relationships, inventory, lot, economy, time, quests.
   Persists to localStorage. Exposes window.LifeSim.
   ============================================================ */

(function () {
  'use strict';

  // ---------------- CONSTANTS / DATA DEFINITIONS ----------------

  const NEEDS = [
    'hunger', 'energy', 'bladder', 'hygiene',
    'social', 'fun', 'comfort', 'room'
  ];

  const NEED_META = {
    hunger:  { label: 'Hunger',  icon: '🍔', color: '#ff8a5c', decay: 0.55 },
    energy:  { label: 'Energy',  icon: '⚡', color: '#ffe14a', decay: 0.45 },
    bladder: { label: 'Bladder', icon: '🚽', color: '#5cc8ff', decay: 0.50 },
    hygiene: { label: 'Hygiene', icon: '🚿', color: '#5ce0ff', decay: 0.35 },
    social:  { label: 'Social',  icon: '💬', color: '#ff5c9d', decay: 0.30 },
    fun:     { label: 'Fun',     icon: '🎮', color: '#b65cff', decay: 0.40 },
    comfort: { label: 'Comfort', icon: '🛋️', color: '#5cffa6', decay: 0.20 },
    room:    { label: 'Room',    icon: '🪴', color: '#ffcf5c', decay: 0.15 }
  };

  const SKILLS = [
    'cooking', 'handiness', 'logic', 'creativity',
    'charisma', 'fitness', 'programming', 'gardening',
    'writing', 'painting', 'music', 'athletic'
  ];

  const SKILL_META = {
    cooking:     { label: 'Cooking',     icon: '🍳', career: 'culinary' },
    handiness:   { label: 'Handiness',   icon: '🔧', career: 'trades' },
    logic:       { label: 'Logic',       icon: '🧩', career: 'science' },
    creativity:  { label: 'Creativity',  icon: '🎨', career: 'design' },
    charisma:    { label: 'Charisma',    icon: '🗣️', career: 'business' },
    fitness:     { label: 'Fitness',     icon: '💪', career: 'athletic' },
    programming: { label: 'Programming', icon: '💻', career: 'tech' },
    gardening:   { label: 'Gardening',   icon: '🌱', career: 'culinary' },
    writing:     { label: 'Writing',     icon: '✍️', career: 'writing' },
    painting:    { label: 'Painting',    icon: '🖼️', career: 'design' },
    music:       { label: 'Music',       icon: '🎵', career: 'music' },
    athletic:    { label: 'Athletic',    icon: '🏃', career: 'athletic' }
  };

  const CAREERS = {
    culinary: {
      label: 'Culinary', icon: '🍳', reqSkill: 'cooking',
      levels: [
        { title: 'Dishwasher',    salary: 40 },
        { title: 'Prep Cook',     salary: 70 },
        { title: 'Line Cook',     salary: 110 },
        { title: 'Sous Chef',     salary: 170 },
        { title: 'Head Chef',     salary: 250 },
        { title: 'Celebrity Chef', salary: 380 }
      ]
    },
    tech: {
      label: 'Tech', icon: '💻', reqSkill: 'programming',
      levels: [
        { title: 'Junior Dev',     salary: 60 },
        { title: 'Developer',      salary: 100 },
        { title: 'Senior Dev',     salary: 160 },
        { title: 'Tech Lead',      salary: 240 },
        { title: 'Architect',      salary: 340 },
        { title: 'CTO',            salary: 500 }
      ]
    },
    science: {
      label: 'Science', icon: '🔬', reqSkill: 'logic',
      levels: [
        { title: 'Lab Assistant',  salary: 55 },
        { title: 'Researcher',     salary: 90 },
        { title: 'Scientist',      salary: 140 },
        { title: 'Lead Scientist', salary: 210 },
        { title: 'Director',       salary: 300 },
        { title: 'Nobel Laureate', salary: 450 }
      ]
    },
    business: {
      label: 'Business', icon: '💼', reqSkill: 'charisma',
      levels: [
        { title: 'Intern',          salary: 45 },
        { title: 'Associate',       salary: 80 },
        { title: 'Manager',         salary: 130 },
        { title: 'Director',        salary: 200 },
        { title: 'VP',              salary: 300 },
        { title: 'CEO',             salary: 480 }
      ]
    },
    athletic: {
      label: 'Athletic', icon: '🏆', reqSkill: 'fitness',
      levels: [
        { title: 'Amateur',     salary: 35 },
        { title: 'Minor League', salary: 75 },
        { title: 'Pro Athlete', salary: 150 },
        { title: 'All-Star',    salary: 250 },
        { title: 'MVP',         salary: 380 },
        { title: 'Hall of Famer', salary: 550 }
      ]
    },
    design: {
      label: 'Design', icon: '🎨', reqSkill: 'creativity',
      levels: [
        { title: 'Junior Designer', salary: 50 },
        { title: 'Designer',        salary: 85 },
        { title: 'Senior Designer', salary: 135 },
        { title: 'Art Director',    salary: 210 },
        { title: 'Creative Dir.',   salary: 310 },
        { title: 'Design Legend',   salary: 460 }
      ]
    },
    music: {
      label: 'Music', icon: '🎵', reqSkill: 'music',
      levels: [
        { title: 'Busker',         salary: 30 },
        { title: 'Session Musician', salary: 65 },
        { title: 'Recording Artist', salary: 120 },
        { title: 'Star',           salary: 200 },
        { title: 'Superstar',      salary: 320 },
        { title: 'Icon',           salary: 500 }
      ]
    },
    writing: {
      label: 'Writing', icon: '✍️', reqSkill: 'writing',
      levels: [
        { title: 'Blogger',      salary: 40 },
        { title: 'Freelancer',   salary: 70 },
        { title: 'Journalist',   salary: 110 },
        { title: 'Author',       salary: 170 },
        { title: 'Bestseller',   salary: 260 },
        { title: 'Literary Icon', salary: 400 }
      ]
    },
    trades: {
      label: 'Trades', icon: '🔧', reqSkill: 'handiness',
      levels: [
        { title: 'Apprentice',   salary: 45 },
        { title: 'Journeyman',   salary: 80 },
        { title: 'Tradesperson', salary: 125 },
        { title: 'Contractor',   salary: 190 },
        { title: 'Master',       salary: 280 },
        { title: 'Business Owner', salary: 420 }
      ]
    },
    medical: {
      label: 'Medical', icon: '⚕️', reqSkill: 'logic',
      levels: [
        { title: 'Med Student',   salary: 50 },
        { title: 'Intern',        salary: 85 },
        { title: 'Resident',      salary: 135 },
        { title: 'Doctor',        salary: 210 },
        { title: 'Surgeon',       salary: 320 },
        { title: 'Chief of Staff', salary: 500 }
      ]
    }
  };

  const ASPIRATIONS = {
    wealth:     { label: 'Wealth',     icon: '💰', desc: 'Earn ₱15,000 over a lifetime', reward: 500, goal: 15000 },
    knowledge:  { label: 'Knowledge',  icon: '📚', desc: 'Reach 40 total skill levels',   reward: 500, goal: 40 },
    family:     { label: 'Family',     icon: '❤️', desc: 'Find a partner & 3 close friends', reward: 500, goal: 4 },
    creativity: { label: 'Creativity', icon: '🎨', desc: 'Reach 25 creative skill levels', reward: 500, goal: 25 },
    athletic:   { label: 'Athletic',   icon: '🏆', desc: 'Reach 18 athletic skill levels', reward: 500, goal: 18 }
  };

  const TRAITS = [
    'Ambitious', 'Lazy', 'Genius', 'Clumsy', 'Romantic',
    'Loner', 'Outgoing', 'Neat', 'Slob', 'Creative',
    'Active', 'Glutton', 'Bookworm', 'Hot-Headed', 'Cheerful'
  ];

  const SKIN_TONES = ['#f5d6b5', '#e8b88f', '#c98e63', '#a06b41', '#74481f', '#4a2c10'];
  const OUTFIT_COLORS = ['#7c5cff', '#00e0c6', '#ff5c7c', '#ffb454', '#5cffa6', '#5cc8ff'];
  const HAIR_COLORS = ['#1c1410', '#5a3a22', '#8a5a2b', '#c9962f', '#d94f4f', '#5c6bc0', '#e8e8e8'];

  // Emotional states (Sims-style). Picked by emotions.js from needs + moodlets.
  const EMOTION_META = {
    ecstatic:      { label: 'Ecstatic',      icon: '🤩', color: '#2ee6a6', tone: 'good' },
    happy:         { label: 'Happy',         icon: '😊', color: '#5cffa6', tone: 'good' },
    energized:     { label: 'Energized',     icon: '⚡', color: '#ffe14a', tone: 'good' },
    confident:     { label: 'Confident',     icon: '😎', color: '#18d4ff', tone: 'good' },
    focused:       { label: 'Focused',       icon: '🧐', color: '#5cc8ff', tone: 'good' },
    inspired:      { label: 'Inspired',      icon: '🎨', color: '#b65cff', tone: 'good' },
    flirty:        { label: 'Flirty',        icon: '😍', color: '#ff5c9d', tone: 'good' },
    playful:       { label: 'Playful',       icon: '😄', color: '#ffb454', tone: 'good' },
    fine:          { label: 'Fine',          icon: '🙂', color: '#ffcf5c', tone: 'neutral' },
    bored:         { label: 'Bored',         icon: '😐', color: '#9c9cbb', tone: 'bad' },
    uncomfortable: { label: 'Uncomfortable', icon: '😖', color: '#ffb454', tone: 'bad' },
    tense:         { label: 'Tense',         icon: '😣', color: '#ff8a5c', tone: 'bad' },
    exhausted:     { label: 'Exhausted',     icon: '🥱', color: '#a06bff', tone: 'bad' },
    sad:           { label: 'Sad',           icon: '😢', color: '#5c8cff', tone: 'bad' },
    angry:         { label: 'Angry',         icon: '😡', color: '#ff2e5c', tone: 'bad' },
    embarrassed:   { label: 'Embarrassed',   icon: '😳', color: '#ff5c7c', tone: 'bad' }
  };

  // Build-mode cosmetic surfaces. Each adds a little to the Room/Environment need
  // and to home value (envBonus), and tints the lot visually (color).
  // ft/wt = [col,row] of the fill tile in the LimeZu Room_Builder sheets
  // (floors.png 15×40, walls.png 32×40 at 16px). color = fallback if art absent.
  const FLOOR_STYLES = {
    wood:    { label: 'Oak Wood',    color: '#caa472', cost: 0,  envBonus: 0, ft: [1, 34] },
    walnut:  { label: 'Walnut',      color: '#8a5a3a', cost: 240, envBonus: 4, ft: [13, 26] },
    tile:    { label: 'Marble Tile', color: '#dfe3ec', cost: 360, envBonus: 6, ft: [9, 32] },
    concrete:{ label: 'Concrete',    color: '#8d8f98', cost: 180, envBonus: 2, ft: [13, 17] },
    rug:     { label: 'Plush Carpet',color: '#7c5cff', cost: 300, envBonus: 7, ft: [9, 20] },
    checker: { label: 'Checkerboard',color: '#2a2a3a', cost: 320, envBonus: 5, ft: [13, 4] }
  };
  const WALL_STYLES = {
    warm:    { label: 'Warm Plaster', color: '#c9b89a', cost: 0,  envBonus: 0, wt: [1, 7] },
    navy:    { label: 'Deep Navy',    color: '#3a4a78', cost: 200, envBonus: 4, wt: [23, 8] },
    brick:   { label: 'Exposed Brick',color: '#a8744f', cost: 280, envBonus: 6, wt: [1, 17] },
    mint:    { label: 'Mint',         color: '#3a8a78', cost: 220, envBonus: 5, wt: [23, 13] },
    panel:   { label: 'Wood Panel',   color: '#7a5a3c', cost: 260, envBonus: 5, wt: [12, 19] },
    gallery: { label: 'Gallery White',color: '#d8dae4', cost: 240, envBonus: 4, wt: [1, 4] }
  };

  // Interior wall tiles for the home lot (12x10). They divide the lot into
  // four rooms — Bedroom (TL), Kitchen (TR), Bathroom (BL), Living (BR) —
  // joined by doorways at (2,5),(9,5) (horizontal) and (6,2),(6,8) (vertical).
  const HOME_WALLS = [
    { x: 0, y: 5 }, { x: 1, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
    { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 },
    { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 3 }, { x: 6, y: 4 },
    { x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 9 }
  ];

  const HOME_ROOMS = [
    { x: 0, y: 0, w: 6, h: 5, label: 'Bedroom' },
    { x: 7, y: 0, w: 5, h: 5, label: 'Kitchen' },
    { x: 0, y: 6, w: 6, h: 4, label: 'Bathroom' },
    { x: 7, y: 6, w: 5, h: 4, label: 'Living Room' }
  ];

  // Doors sit in the wall gaps. o='h' → door in a horizontal wall (you pass
  // up/down through it); o='v' → door in a vertical wall (pass left/right).
  const HOME_DOORS = [
    { x: 2, y: 5, o: 'h' }, // Bedroom ↔ Bathroom
    { x: 9, y: 5, o: 'h' }, // Kitchen ↔ Living Room
    { x: 6, y: 2, o: 'v' }, // Bedroom ↔ Kitchen
    { x: 6, y: 8, o: 'v' }  // Bathroom ↔ Living Room
  ];

  // ---------------- HELPERS ----------------

  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const nowISO = () => new Date().toISOString();

  function makeNeeds() {
    const o = {};
    NEEDS.forEach((n) => (o[n] = 80));
    return o;
  }

  function makeSkills() {
    const o = {};
    SKILLS.forEach((s) => (o[s] = { level: 0, xp: 0 }));
    return o;
  }

  // ---------------- FACTORIES ----------------

  function createSim(opts = {}) {
    const sim = {
      id: uid(),
      name: opts.name || 'New Sim',
      gender: opts.gender || 'nb',
      aspiration: opts.aspiration || 'wealth',
      skinTone: opts.skinTone || SKIN_TONES[0],
      outfitColor: opts.outfitColor || OUTFIT_COLORS[0],
      hairColor: opts.hairColor || HAIR_COLORS[0],
      traits: opts.traits || [],
      needs: makeNeeds(),
      skills: makeSkills(),
      career: null,           // { track, level, performance, daysWorked }
      age: 24,
      mood: 80,
      emotion: 'fine',        // dominant emotion (see EMOTION_META)
      moodlets: [],           // [{ id, label, icon, tone, mood, ttl }]
      money: 500,
      totalEarned: 0,         // lifetime simoleons earned (aspiration: wealth)
      xp: 0,
      level: 1,
      aspirationDone: false,
      milestones: {},         // dedupe flags for one-time LSC rewards
      // life & family
      bornDay: 1,             // game-day this Sim's life began (for aging)
      lifeStage: 'young',     // young | adult | elder
      partner: null,          // { npcId, name, married, skinTone, hairColor, outfitColor }
      children: [],           // [{ id, name, traits, colors, bornDay, stage }]
      createdAt: nowISO(),
      // runtime (rebuilt by hydrateSim on load)
      action: null,           // current action object { phase:'walking'|'using', ... }
      actionQueue: [],
      tile: { x: 6, y: 5 },   // logical grid tile
      px: 6, py: 5,           // fractional tile position for smooth rendering
      facing: 'down',
      moving: false,
      path: [],               // remaining waypoints [{x,y}]
      relationships: []       // { id, name, type, tier, score }
    };
    return sim;
  }

  // Fill in any runtime fields missing from an older save so the engine
  // never trips over undefined positions/moodlets.
  function hydrateSim(sim) {
    if (!sim) return sim;
    if (sim.tile == null) sim.tile = { x: 6, y: 5 };
    if (sim.px == null) sim.px = sim.tile.x;
    if (sim.py == null) sim.py = sim.tile.y;
    if (sim.facing == null) sim.facing = 'down';
    if (sim.moving == null) sim.moving = false;
    if (!Array.isArray(sim.path)) sim.path = [];
    if (!Array.isArray(sim.actionQueue)) sim.actionQueue = [];
    if (!Array.isArray(sim.moodlets)) sim.moodlets = [];
    if (!Array.isArray(sim.relationships)) sim.relationships = [];
    if (sim.emotion == null) sim.emotion = 'fine';
    if (sim.totalEarned == null) sim.totalEarned = 0;
    if (sim.milestones == null) sim.milestones = {};
    if (sim.hairColor == null) sim.hairColor = HAIR_COLORS[0];
    if (sim.aspirationDone == null) sim.aspirationDone = false;
    if (sim.bornDay == null) sim.bornDay = 1;
    if (sim.lifeStage == null) sim.lifeStage = 'young';
    if (sim.partner === undefined) sim.partner = null;
    if (!Array.isArray(sim.children)) sim.children = [];
    // reconcile needs/skills against the canonical lists so a save written
    // before a need/skill existed can never crash the engine
    if (!sim.needs || typeof sim.needs !== 'object') sim.needs = makeNeeds();
    NEEDS.forEach((n) => { if (typeof sim.needs[n] !== 'number') sim.needs[n] = 80; });
    if (!sim.skills || typeof sim.skills !== 'object') sim.skills = makeSkills();
    SKILLS.forEach((k) => { if (!sim.skills[k] || typeof sim.skills[k].level !== 'number') sim.skills[k] = { level: 0, xp: 0 }; });
    sim.action = null; // never resume mid-action across reloads
    return sim;
  }

  // Lifetime-aspiration progress (0..1) + completion check. Reads other
  // subsystems lazily so it works regardless of script load order.
  function aspirationStatus(sim) {
    const asp = ASPIRATIONS[sim.aspiration] || ASPIRATIONS.wealth;
    let cur = 0;
    const Skills = window.LifeSim.Skills;
    const Rel = window.LifeSim.Relationships;
    if (sim.aspiration === 'wealth') {
      cur = sim.totalEarned || 0;
    } else if (sim.aspiration === 'knowledge') {
      cur = Skills ? Skills.totalPoints(sim) : 0;
    } else if (sim.aspiration === 'family') {
      const friends = Rel ? Rel.friendCount(sim) : 0;
      const partner = Rel ? (Rel.hasPartner(sim) ? 1 : 0) : 0;
      cur = Math.min(3, friends) + partner; // up to 4
    } else if (sim.aspiration === 'creativity') {
      const keys = ['creativity', 'painting', 'writing', 'music'];
      cur = keys.reduce((s, k) => s + (sim.skills[k] ? sim.skills[k].level : 0), 0);
    } else if (sim.aspiration === 'athletic') {
      const keys = ['fitness', 'athletic'];
      cur = keys.reduce((s, k) => s + (sim.skills[k] ? sim.skills[k].level : 0), 0);
    }
    const progress = clamp(cur / asp.goal, 0, 1);
    return { progress, cur, goal: asp.goal, done: progress >= 1, label: asp.label, desc: asp.desc, icon: asp.icon };
  }

  function createNPC(name, traitHint) {
    const sim = createSim({
      name,
      aspiration: Object.keys(ASPIRATIONS)[Math.floor(Math.random() * 5)],
      gender: ['male', 'female', 'nb'][Math.floor(Math.random() * 3)],
      skinTone: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      outfitColor: OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)],
      traits: [TRAITS[Math.floor(Math.random() * TRAITS.length)]]
    });
    sim.isNPC = true;
    return sim;
  }

  // ---------------- GAME STATE ----------------

  const DEFAULT_STATE = {
    version: 2,
    player: {
      name: 'Player',
      level: 1,
      xp: 0,
      lsc: 0,
      wallet: '',
      settings: { autosave: true, sound: true, freeWill: true },
      dailyClaimedAt: null,
      lastSeen: nowISO()
    },
    sims: [],
    activeSimId: null,
    npcs: [],
    location: 'home',    // current place: 'home' or a venue id (see locations.js)
    inventory: [],       // furniture item ids the player owns but hasn't placed
    lot: {
      size: { w: 12, h: 10 },
      tiles: [],         // grid of furniture uid | 'WALL' | null
      furniture: [],
      value: 0,
      floor: 'wood',
      wall: 'warm',
      // interior walls split the home into 4 rooms, joined by doors
      walls: HOME_WALLS,
      doors: HOME_DOORS
    },
    time: {
      day: 1,
      hour: 8,
      minute: 0,
      speed: 1,          // 0 paused, 1 normal, 2 fast, 3 ultra
      dayPhase: 'morning'
    },
    economy: {
      lscPriceUSD: 0.042,
      totalEarned: 0,
      transactions: []
    },
    quests: [],
    activity: [],
    stats: {
      questsCompleted: 0
    }
  };

  // ---------------- STORAGE ----------------

  const STORAGE_KEY = 'lifesim_save_v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      // shallow-merge to be resilient to new fields
      const merged = Object.assign(structuredClone(DEFAULT_STATE), parsed, {
        player: Object.assign({}, DEFAULT_STATE.player, parsed.player || {}, {
          settings: Object.assign({}, DEFAULT_STATE.player.settings, (parsed.player && parsed.player.settings) || {})
        }),
        time: Object.assign({}, DEFAULT_STATE.time, parsed.time || {}),
        economy: Object.assign({}, DEFAULT_STATE.economy, parsed.economy || {}),
        lot: Object.assign({}, DEFAULT_STATE.lot, parsed.lot || {}),
        stats: Object.assign({}, DEFAULT_STATE.stats, parsed.stats || {})
      });
      // always start a session at home, with a valid inventory
      merged.location = 'home';
      if (!Array.isArray(merged.inventory)) merged.inventory = [];
      if (!merged.lot.walls) merged.lot.walls = HOME_WALLS;
      if (!merged.lot.doors) merged.lot.doors = HOME_DOORS;
      // hydrate runtime fields on every sim from older saves
      (merged.sims || []).forEach(hydrateSim);
      (merged.npcs || []).forEach(hydrateSim);
      // backfill quests added since this save was created (keep saved progress)
      const defs = defaultQuests();
      const existing = Array.isArray(merged.quests) ? merged.quests : [];
      const byId = {};
      existing.forEach((q) => (byId[q.id] = q));
      merged.quests = defs.map((d) => byId[d.id] || d)
        .concat(existing.filter((q) => !defs.some((d) => d.id === q.id)));
      return merged;
    } catch (e) {
      console.warn('LifeSim: failed to load save', e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('LifeSim: failed to save', e);
      return false;
    }
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return structuredClone(DEFAULT_STATE);
  }

  // ---------------- QUEST DEFS ----------------

  function defaultQuests() {
    return [
      { id: 'first_meal',   title: 'First Meal',    desc: 'Cook any dish',         icon: '🍳', reward: 30, target: 1, progress: 0, done: false },
      { id: 'get_hired',    title: 'Get Hired',     desc: 'Join any career',       icon: '💼', reward: 60, target: 1, progress: 0, done: false },
      { id: 'well_rested',  title: 'Well Rested',   desc: 'Sleep until Energy full', icon: '🛏️', reward: 25, target: 1, progress: 0, done: false },
      { id: 'skill_lvl3',   title: 'Dabbler',       desc: 'Reach skill level 3',   icon: '📈', reward: 75, target: 3, progress: 0, done: false },
      { id: 'make_friend',  title: 'Friendly',      desc: 'Reach 50 relationship',  icon: '👥', reward: 50, target: 1, progress: 0, done: false },
      { id: 'first_promo',  title: 'Climber',       desc: 'Get promoted once',     icon: '⬆️', reward: 90, target: 1, progress: 0, done: false },
      { id: 'home_owner',   title: 'Home Owner',    desc: 'Place 5 furniture items', icon: '🏠', reward: 120, target: 5, progress: 0, done: false },
      { id: 'rich',         title: 'Starter Funds', desc: 'Save ₱1000',            icon: '💵', reward: 40, target: 1000, progress: 0, done: false },
      { id: 'feel_good',    title: 'Good Vibes',    desc: 'Reach a positive emotion', icon: '😊', reward: 35, target: 1, progress: 0, done: false },
      { id: 'designer',     title: 'Interior Designer', desc: 'Style a floor & wall', icon: '🪟', reward: 45, target: 2, progress: 0, done: false },
      { id: 'skill_master', title: 'Skill Master',      desc: 'Max out any skill',          icon: '🎓', reward: 150, target: 1, progress: 0, done: false },
      { id: 'career_star',  title: 'Top of the Ladder', desc: 'Reach the top of a career',   icon: '👑', reward: 200, target: 1, progress: 0, done: false },
      { id: 'dream_big',    title: 'Dream Big',         desc: 'Fulfil a lifetime aspiration', icon: '🌟', reward: 250, target: 1, progress: 0, done: false }
    ];
  }

  // ---------------- PUBLIC API ----------------

  const LifeSim = {
    // data
    NEEDS, NEED_META, SKILLS, SKILL_META, CAREERS, ASPIRATIONS, TRAITS,
    SKIN_TONES, OUTFIT_COLORS, HAIR_COLORS, EMOTION_META, FLOOR_STYLES, WALL_STYLES,
    HOME_WALLS, HOME_ROOMS, HOME_DOORS,
    // factories
    createSim, createNPC, hydrateSim,
    // persistence
    load, save, reset,
    // defaults
    DEFAULT_STATE, defaultQuests,
    // helpers
    uid, clamp, nowISO, aspirationStatus
  };

  window.LifeSim = LifeSim;
})();