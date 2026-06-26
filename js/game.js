/* ============================================================
   LifeSim — Game Controller (v3)
   Builds DOM once, updates values per tick. The Sim walks the
   lot via pathfinding (clock.js), so the renderer just maps the
   Sim's fractional tile position (px,py) to pixels each frame.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  const params = new URLSearchParams(location.search);
  const visitId = params.get('visit');
  const visiting = !!visitId;

  // state/sim are filled in by boot() (visiting fetches the world async)
  let state, simId, sim;

  // ---- Lot geometry (TILE/OX/OY are recomputed each render to fill the view) ----
  let TILE = 56;
  const WALL = 12;
  const PAD = 14;
  let OX = PAD + WALL; // floor origin x within lot-view (centered)
  let OY = PAD + WALL;

  // Size & centre the lot so it fills the available container.
  function computeLayout(container, w, h) {
    const availW = (container && container.clientWidth) || 760;
    const availH = (container && container.clientHeight) || 480;
    const usableW = availW - 2 * (PAD + WALL) - 6;
    const usableH = availH - 2 * (PAD + WALL) - 6;
    let t = Math.floor(Math.min(usableW / w, usableH / h));
    t = Math.max(38, Math.min(98, t));
    const fw = w * t, fh = h * t;
    const ox = Math.max(PAD + WALL, Math.floor((availW - fw) / 2));
    const oy = Math.max(PAD + WALL, Math.floor((availH - fh) / 2));
    return { t, ox, oy };
  }

  // refs to DOM nodes we update frequently (created once)
  let needsBars = {}, needVals = {};
  let moodRingEl, emotionLabelEl, moodLabelEl, moodletStripEl;
  let topMoneyEl, topLscEl, clockDayEl, clockTimeEl, clockPhaseEl;
  let trayCurEl, trayQueueEl;
  let simTokenEl, dayNightEl, plumbobEl, thoughtEl, actionRingEl, ringProgEl, ringIconEl;
  let objEls = {};
  let miniQuestEls = [];
  let aspirationCardEl, eventLogEl;
  let buildSel = null;
  let buildTool = 'place';
  let moveSel = null;
  let quickActions = [];
  let shopCat = 'all';
  let homeLot = null; // the persistent home lot (state.lot points here when home)
  let presentNpcs = []; // [{ npc, el }] — NPCs roaming the current lot
  let presentLotKey = null;

  function fx(name) { if (LS.FX && state.player.settings.sound) LS.FX.play(name); }

  // ---------------- ENSURE A SIM ----------------
  // The player should ALWAYS spawn into a living world. If they arrive with
  // no Sim, create a default one and drop them straight in (no dead-end).
  function ensureSim() {
    if (sim) return;
    sim = LS.createSim({
      name: 'New Sim',
      aspiration: 'wealth',
      traits: ['Cheerful', 'Ambitious', 'Creative']
    });
    sim.bornDay = state.time.day;
    state.sims.push(sim);
    state.activeSimId = sim.id;
    simId = sim.id;
    LS.save(state);
  }

  // ---------------- HELPERS ----------------
  function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast ' + type), 2600);
  }

  function rewardBurst(amount, label) {
    const b = $('#rewardBurst');
    b.innerHTML = '+' + amount + ' PLUM<small>' + esc(label) + '</small>';
    b.classList.add('show');
    if (LS.FX) LS.FX.confetti(window.innerWidth / 2, window.innerHeight * 0.32, 110);
    clearTimeout(rewardBurst._t);
    rewardBurst._t = setTimeout(() => b.classList.remove('show'), 1900);
  }

  function logEvent(icon, text, cls) {
    cls = cls || '';
    const row = document.createElement('div');
    row.className = 'event-row ' + cls;
    row.innerHTML = '<span class="ev-ic">' + icon + '</span><div class="ev-txt">' + text + '<small>' + LS.Clock.format12(state.time) + '</small></div>';
    eventLogEl.prepend(row);
    while (eventLogEl.children.length > 30) eventLogEl.lastChild.remove();
  }

  function save() {
    if (visiting) return; // read-only when viewing another player's home
    state.activeSimId = sim ? sim.id : null;
    // never persist a transient venue lot as the home — swap home back in
    const atVenue = state.location !== 'home';
    let curLot, curLoc;
    if (atVenue) { curLot = state.lot; curLoc = state.location; state.lot = homeLot; state.location = 'home'; }
    LS.save(state);
    if (atVenue) { state.lot = curLot; state.location = curLoc; }
  }

  function esc(s) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, (c) => map[c]);
  }

  function num(n) { return Math.round(n).toLocaleString(); }

  // ---------------- STARTER HOME ----------------
  function giveStarterHome() {
    LS.Build.ensureLot(state);
    if (state.lot.furniture.length > 0) return;
    const starters = [
      // Bedroom (top-left)
      { id: 'bed_single', x: 1, y: 1 }, { id: 'plant', x: 4, y: 1 },
      // Kitchen (top-right)
      { id: 'fridge', x: 7, y: 0 }, { id: 'stove', x: 8, y: 0 }, { id: 'dining', x: 9, y: 2 }, { id: 'coffee', x: 7, y: 2 },
      // Bathroom (bottom-left)
      { id: 'toilet', x: 1, y: 7 }, { id: 'shower', x: 2, y: 7 }, { id: 'sink', x: 4, y: 7 },
      // Living room (bottom-right)
      { id: 'sofa', x: 7, y: 7 }, { id: 'tv', x: 7, y: 9 }, { id: 'recliner', x: 10, y: 7 }
    ];
    const budget = sim.money;
    // grant temporary funds so every starter piece places regardless of price…
    sim.money = 1e9;
    starters.forEach((s) => LS.Build.buy(state, sim, s.id, s.x, s.y));
    // …then restore the Sim's real wallet — the starter home is a gift.
    sim.money = budget;
    state.lot.value = state.lot.furniture.reduce((a, f) => a + f.cost, 0);
  }

  // ---------------- EVENT HANDLER ----------------
  function onEvent(ev) {
    if (!sim) return;
    switch (ev.type) {
      case 'work':
        if (ev.ok) { logEvent('💼', '<b>' + esc(sim.name) + '</b> worked & earned ₱' + ev.pay, 'work'); fx('coin'); }
        break;
      case 'workfail':
        logEvent('⚠️', esc(ev.msg), 'warn');
        break;
      case 'promotion':
        logEvent('⬆️', '<b>Promoted!</b> ' + esc(ev.title), 'promotion');
        toast('Promoted to ' + ev.title + '!', 'success');
        rewardBurst(40, 'Promotion bonus'); fx('levelup');
        break;
      case 'quest':
        logEvent('🏆', 'Quest complete: <b>' + esc(ev.quest.title) + '</b> (+' + ev.quest.reward + ' PLUM)', 'quest');
        toast('Quest done: ' + ev.quest.title + ' (+' + ev.quest.reward + ' PLUM)', 'success');
        rewardBurst(ev.quest.reward, ev.quest.title); fx('reward');
        break;
      case 'milestone':
        logEvent('🌟', '<b>' + esc(ev.label) + '</b> (+' + ev.amount + ' PLUM)', 'promotion');
        toast(ev.label + ' (+' + ev.amount + ' PLUM)', 'success');
        rewardBurst(ev.amount, ev.label); fx('reward');
        break;
      case 'aspiration':
        logEvent('✨', '<b>Aspiration fulfilled:</b> ' + esc(ev.label) + ' (+' + ev.amount + ' PLUM)', 'quest');
        toast('Lifetime aspiration complete! +' + ev.amount + ' PLUM', 'success');
        rewardBurst(ev.amount, 'Aspiration: ' + ev.label); fx('reward');
        break;
      case 'skillup':
        logEvent('📈', '<b>' + LS.SKILL_META[ev.skill].label + '</b> reached level ' + ev.level);
        fx('levelup');
        break;
      case 'using':
        fx(soundForAction(ev.action));
        break;
      case 'actionfail':
        if (ev.reason === 'unreachable') toast("Can't reach that — clear a path to it.", 'error');
        break;
      case 'social':
        if (ev.res && ev.res.ok) {
          logEvent('💬', esc(ev.res.msg));
          fx('social');
          if (ev.res.score >= 50) LS.Clock.notifyQuest('make_friend', 1);
          if (ev.res.score >= 90) {
            const rp = LS.Economy.rewardMilestoneOnce(state, sim, 'partner', 'Found a partner', 'partner');
            if (rp.amount > 0) { rewardBurst(rp.amount, 'Found a Partner!'); fx('reward'); }
          } else if (ev.res.score >= 50) {
            const rf = LS.Economy.rewardMilestoneOnce(state, sim, 'first_friend', 'Made a friend', 'first_friend');
            if (rf.amount > 0) { rewardBurst(rf.amount, 'New Friend!'); fx('reward'); }
          }
          LS.Clock.checkLifeMilestones();
          if ($('#stage-social').classList.contains('active')) renderSocial();
          save();
        } else if (ev.res) {
          logEvent('⚠️', esc(ev.res.msg), 'warn');
        }
        break;
      case 'life': {
        const e = ev.life;
        if (e.type === 'stage') {
          logEvent(e.icon, '<b>' + esc(sim.name) + '</b> is now a <b>' + esc(e.label) + '</b>', 'promotion');
          toast('🎂 Birthday! Your Sim is now a ' + e.label, 'success');
          if (LS.Emotions) LS.Emotions.add(sim, 'successful');
          if (LS.FX) LS.FX.confetti(); fx('levelup');
        } else if (e.type === 'childstage') {
          logEvent(e.icon, '<b>' + esc(e.name) + '</b> grew into a ' + esc(e.label));
        } else if (e.type === 'grownup') {
          logEvent('🎓', '<b>' + esc(e.name) + '</b> grew up — now playable from the dashboard!', 'quest');
          toast('🎓 ' + e.name + ' grew up! Play them from the dashboard.', 'success');
          if (LS.FX) { LS.FX.confetti(); fx('reward'); }
        } else if (e.type === 'death') {
          handleDeath();
        }
        break;
      }
      case 'actiondone':
        if (ev.msg) logEvent('✓', esc(ev.msg));
        break;
      case 'newday':
        logEvent('🌅', 'Day ' + ev.day + ' begins');
        if (state.player.settings.autosave) save();
        break;
    }
  }

  function soundForAction(action) {
    if (!action) return 'select';
    if (action.skipToMorning) return 'sleep';
    const f = action.target && LS.Build.getInstance(state, action.target);
    if (f) {
      if (f.mood === 'rest') return 'sleep';
      if (f.cat === 'food') return 'select';
    }
    return 'select';
  }

  // Old age: control passes to an heir if there is one, else a new life begins.
  function handleDeath() {
    const heir = state.sims.find((s) => s.id !== sim.id);
    state.sims = state.sims.filter((s) => s.id !== sim.id);
    state.activeSimId = heir ? heir.id : null;
    if (state.location !== 'home') { state.lot = homeLot; state.location = 'home'; }
    LS.save(state);
    LS.Clock.speed(0);
    logEvent('🕊️', '<b>' + esc(sim.name) + '</b> passed away of old age. ' + (heir ? 'Life continues with <b>' + esc(heir.name) + '</b>.' : 'A new life begins.'), 'warn');
    toast(esc(sim.name) + ' has passed away…', 'error');
    setTimeout(() => { location.reload(); }, 2800);
  }

  // ================================================================
  // BUILD PHASE (once)
  // ================================================================
  function buildAll() {
    buildTop();
    buildNeeds();
    buildQuickActions();
    buildToggles();
    buildRightPanel();
    buildTray();
    buildLot();
  }

  function avatarMarkup(s) {
    return '<div class="sa-hair" style="background:' + s.hairColor + '"></div>' +
           '<div class="sa-head" style="background:' + s.skinTone + '"></div>' +
           '<div class="sa-body" style="background:' + s.outfitColor + '"></div>';
  }

  function buildTop() {
    topMoneyEl = $('#topMoney');
    topLscEl = $('#topLSC');
    clockDayEl = $('#clockDay');
    clockTimeEl = $('#clockTime');
    clockPhaseEl = $('#clockPhase');
    const av = $('#topAvatar');
    av.innerHTML = avatarMarkup(sim);
    av.style.borderColor = sim.outfitColor;
    $('#topSimName').textContent = sim.name;
    $$('.spd-btn').forEach((b) => {
      b.addEventListener('click', () => { LS.Clock.speed(+b.dataset.spd); fx('click'); updateTop(); });
    });
    const sb = $('#soundBtn');
    sb.textContent = state.player.settings.sound ? '🔊' : '🔈';
    sb.addEventListener('click', () => {
      state.player.settings.sound = !state.player.settings.sound;
      if (LS.FX) LS.FX.setSound(state.player.settings.sound);
      sb.textContent = state.player.settings.sound ? '🔊' : '🔈';
      if (state.player.settings.sound) fx('select');
      save();
    });
  }

  function buildNeeds() {
    moodRingEl = $('#moodRing');
    emotionLabelEl = $('#emotionLabel');
    moodLabelEl = $('#moodLabel');
    moodletStripEl = $('#moodletStrip');
    const list = $('#needsList');
    list.innerHTML = '';
    LS.NEEDS.forEach((n) => {
      const meta = LS.NEED_META[n];
      const row = document.createElement('div');
      row.className = 'need-row';
      row.title = meta.label;
      row.innerHTML =
        '<span class="need-ic">' + meta.icon + '</span>' +
        '<div class="need-bar"><span></span></div>' +
        '<span class="need-val">0</span>';
      list.appendChild(row);
      needsBars[n] = row.querySelector('.need-bar span');
      needVals[n] = row.querySelector('.need-val');
    });
  }

  function buildQuickActions() {
    const wrap = $('#quickActions');
    const actions = [
      { id: 'sleep', label: 'Sleep', icon: '🛏️', fn: doSleep },
      { id: 'eat', label: 'Eat', icon: '🍔', fn: doEat },
      { id: 'shower', label: 'Shower', icon: '🚿', fn: doShower },
      { id: 'toilet', label: 'Toilet', icon: '🚽', fn: doToilet },
      { id: 'fun', label: 'Have Fun', icon: '🎮', fn: doFun },
      { id: 'work', label: 'Work', icon: '💼', fn: doWorkNow }
    ];
    wrap.innerHTML = '';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'qa-btn';
      btn.innerHTML = '<span class="qa-ic">' + a.icon + '</span>' + a.label;
      btn.addEventListener('click', () => { fx('click'); a.fn(); });
      wrap.appendChild(btn);
      a.el = btn;
    });
    quickActions = actions;
  }

  function buildToggles() {
    const fw = $('#freeWillBtn');
    fw.classList.toggle('active', !!state.player.settings.freeWill);
    fw.textContent = '🧠 Free Will: ' + (state.player.settings.freeWill ? 'On' : 'Off');
    fw.addEventListener('click', () => {
      state.player.settings.freeWill = !state.player.settings.freeWill;
      fw.classList.toggle('active', state.player.settings.freeWill);
      fw.textContent = '🧠 Free Will: ' + (state.player.settings.freeWill ? 'On' : 'Off');
      fx('select'); save();
    });
  }

  function buildRightPanel() {
    eventLogEl = $('#eventLog');
    aspirationCardEl = $('#aspirationCard');
    const ci = LS.Careers.info(sim);
    $('#simCardBig').innerHTML =
      '<div class="sim-avatar" style="border-color:' + sim.outfitColor + '">' + avatarMarkup(sim) + '</div>' +
      '<div class="scb-info">' +
        '<b>' + esc(sim.name) + '</b>' +
        '<small>Age ' + sim.age + ' · ' + (ci ? ci.title : 'Unemployed') + '</small>' +
        '<div class="scb-tags">' +
          '<span class="tag">' + LS.ASPIRATIONS[sim.aspiration].icon + ' ' + LS.ASPIRATIONS[sim.aspiration].label + '</span>' +
          sim.traits.slice(0, 3).map((t) => '<span class="tag">' + t + '</span>').join('') +
        '</div>' +
      '</div>';

    const mq = $('#miniQuests');
    mq.innerHTML = '';
    miniQuestEls = [];
    state.quests.slice(0, 6).forEach((q) => {
      const el = document.createElement('div');
      el.className = 'mini-quest' + (q.done ? ' done' : '');
      el.title = q.desc;
      el.innerHTML =
        '<span class="mq-ic">' + q.icon + '</span>' +
        '<div class="mq-body"><b>' + esc(q.title) + '</b><div class="mq-bar"><span></span></div></div>' +
        '<span class="mq-rew"></span>';
      mq.appendChild(el);
      miniQuestEls.push({ el, quest: q, bar: el.querySelector('.mq-bar span'), txt: el.querySelector('.mq-rew') });
    });
  }

  function buildTray() {
    trayCurEl = $('#trayCurrent');
    trayQueueEl = $('#trayQueue');
  }

  function floorColor() {
    if (state.lot.floorHex) return state.lot.floorHex;
    const f = LS.FLOOR_STYLES[state.lot.floor];
    return f ? f.color : '#caa472';
  }
  function wallColor() {
    if (state.lot.wallHex) return state.lot.wallHex;
    const w = LS.WALL_STYLES[state.lot.wall];
    return w ? w.color : '#3a3550';
  }
  // LimeZu Room_Builder sheets: sample one fill tile and tile it across the area.
  const FLOORS_SHEET = '/assets/limezu/room/floors.png';
  const WALLS_SHEET = '/assets/limezu/room/walls.png';
  function tileBG(sheet, cols, rows, coord, t) {
    if (!coord) return null;
    const c = coord[0], r = coord[1];
    return 'background-image:url(' + sheet + ');background-repeat:repeat;' +
      'background-size:' + (cols * t) + 'px ' + (rows * t) + 'px;' +
      'background-position:-' + (c * t) + 'px -' + (r * t) + 'px;image-rendering:pixelated';
  }
  function floorTileBG(t) {
    if (state.lot.floorHex) return null;
    const f = LS.FLOOR_STYLES[state.lot.floor];
    return f && f.ft ? tileBG(FLOORS_SHEET, 15, 40, f.ft, t) : null;
  }
  function wallTileBG(t) {
    if (state.lot.wallHex) return null;
    const w = LS.WALL_STYLES[state.lot.wall];
    return w && w.wt ? tileBG(WALLS_SHEET, 32, 40, w.wt, t) : null;
  }
  // ---- LimeZu animated character (16×32 frames, 4-direction + walk cycle) ----
  const CHAR_SHEETS = 12;           // /assets/limezu/char/char01..12.png
  const CHAR_FW = 16, CHAR_FH = 32, CHAR_SW = 896, CHAR_SH = 656;
  // facing -> idle frame + 6-frame walk cycle as [col,row] into the sheet
  const CHAR_ANIM = {
    down:  { idle: [0, 0], walk: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]], flip: false },
    up:    { idle: [0, 4], walk: [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4]], flip: false },
    left:  { idle: [0, 5], walk: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]], flip: false },
    right: { idle: [0, 5], walk: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]], flip: true }
  };
  let frameCounter = 0;
  function charScale() { return TILE / 16; }   // 1 source tile -> 1 lot tile
  function charSheetFor(a, b, c) {
    const s = String(a) + '|' + String(b) + '|' + String(c);
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return '/assets/limezu/char/char' + String((h % CHAR_SHEETS) + 1).padStart(2, '0') + '.png';
  }
  // The Sim figure: one pixel-art sprite div whose background-position is the frame.
  function simBodyHTML(skin, hair, outfit) {
    const S = charScale();
    return '<div class="limezu-char" style="width:' + (CHAR_FW * S) + 'px;height:' + (CHAR_FH * S) +
      'px;background-image:url(' + charSheetFor(skin, hair, outfit) + ');background-size:' +
      (CHAR_SW * S) + 'px ' + (CHAR_SH * S) + 'px"></div>';
  }

  // Drive a Sim sprite's frame from facing + walk state (called each tick).
  function setCharFrame(el, facing, walking) {
    const ch = el._char || (el._char = el.querySelector('.limezu-char'));
    if (!ch) return;
    const a = CHAR_ANIM[facing] || CHAR_ANIM.down;
    const cell = walking ? a.walk[Math.floor(frameCounter / 5) % a.walk.length] : a.idle;
    const key = facing + (walking ? 'w' : 'i') + cell[0] + ',' + cell[1];
    if (el._cframe !== key) {
      const S = charScale();
      ch.style.backgroundPosition = (-(cell[0] * CHAR_FW * S)) + 'px ' + (-(cell[1] * CHAR_FH * S)) + 'px';
      el._cframe = key;
    }
    if (el._cflip !== a.flip) { ch.classList.toggle('flip', a.flip); el._cflip = a.flip; }
  }

  // LimeZu pixel-art sprite (bottom-anchored, native size, ¾ view) if one is
  // mapped for this item; otherwise null (falls back to vector/emoji).
  function limezuSprite(f) { return (LS.SPRITES && LS.SPRITES[f.id]) || null; }
  function spriteImgHTML(f, t) {
    const s = limezuSprite(f); if (!s) return null;
    t = t || TILE;
    return '<img class="limezu-sprite" src="' + s.src + '" draggable="false" ' +
      'style="width:' + (s.w * t) + 'px;height:' + (s.h * t) + 'px">';
  }
  function objInner(f) {
    let ic = spriteImgHTML(f);
    if (!ic) {
      if (f.sprite) {
        ic = '<span class="obj-sprite" style="background-image:url(' + f.sprite + ')"></span>';
      } else {
        const svg = LS.Furniture && LS.Furniture.svg(f);
        ic = svg || '<span class="obj-ic">' + f.icon + '</span>';
      }
    }
    return ic + '<div class="obj-tooltip">' + esc(f.name) + '</div>';
  }
  function objClass(base, f) {
    if (limezuSprite(f)) return base + ' limezu';
    return base + (LS.Furniture && LS.Furniture.isDrawn(f) ? ' drawn' : '');
  }

  // ---- Present NPCs (the living world) ----
  function locationSeed() {
    const s = String(state.location || 'home');
    let n = 0; for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % 997;
    return n;
  }
  function pickTownies(count, exclude) {
    const pool = state.npcs.filter((n) => exclude.indexOf(n) < 0);
    const seed = locationSeed();
    const chosen = [];
    for (let i = 0; i < pool.length && chosen.length < count; i++) {
      const n = pool[(i + seed) % pool.length];
      if (chosen.indexOf(n) < 0) chosen.push(n);
    }
    return chosen;
  }
  function assignPresentNpcs() {
    LS.Relationships.ensureNPCs(state);
    const w = state.lot.size.w, h = state.lot.size.h;
    let idx = 0;
    const place = (agent) => {
      const i = idx++;
      const t = LS.Movement.nearestWalkable(state, (2 + i * 3) % w, (2 + i * 2) % h) || LS.Movement.spawnTile(state);
      agent.tile = { x: t.x, y: t.y }; agent.px = t.x; agent.py = t.y;
      agent.path = []; agent.moving = false; agent._busy = false; agent._idle = i * 350; agent.act = null;
    };
    const entries = [];
    if (state.location === 'home') {
      if (sim.partner) {
        const pnpc = state.npcs.find((n) => n.id === sim.partner.npcId);
        if (pnpc) { place(pnpc); entries.push({ agent: pnpc, kind: 'partner', npc: pnpc }); }
      }
      (sim.children || []).forEach((c) => { place(c); entries.push({ agent: c, kind: 'child', child: c }); });
      pickTownies(1, entries.map((e) => e.npc).filter(Boolean)).forEach((npc) => { place(npc); entries.push({ agent: npc, kind: 'npc', npc: npc }); });
    } else {
      pickTownies(3, []).forEach((npc) => { place(npc); entries.push({ agent: npc, kind: 'npc', npc: npc }); });
    }
    presentNpcs = entries;
    LS.Clock.setPresentNpcs(entries.map((e) => e.agent));
  }
  function ensurePresentNpcs() {
    if (presentNpcs.length && presentLotKey === state.location) return;
    assignPresentNpcs();
    presentLotKey = state.location;
  }

  function buildLot() {
    LS.Build.ensureLot(state);
    LS.Movement.ensureSimTile(state, sim);
    ensurePresentNpcs();
    const view = $('#lotView');
    const w = state.lot.size.w, h = state.lot.size.h;
    const L = computeLayout(view, w, h);
    TILE = L.t; OX = L.ox; OY = L.oy;
    const fw = w * TILE, fh = h * TILE;
    view.innerHTML = '';
    objEls = {};
    const frag = document.createDocumentFragment();

    // walls (dollhouse frame) behind floor
    const walls = document.createElement('div');
    walls.className = 'house-walls';
    walls.style.cssText = 'left:' + (OX - WALL) + 'px;top:' + (OY - WALL) + 'px;width:' + (fw + WALL * 2) + 'px;height:' + (fh + WALL * 2) + 'px;background:' + wallColor();
    frag.appendChild(walls);

    // floor — flat colour base (fallback / underlay)
    const floor = document.createElement('div');
    floor.className = 'house-floor';
    floor.style.cssText = 'left:' + OX + 'px;top:' + OY + 'px;width:' + fw + 'px;height:' + fh + 'px;--floor:' + floorColor();
    frag.appendChild(floor);

    // LimeZu floor: one tile div per cell (each cell clips to a single 16px tile)
    const fbg = floorTileBG(TILE);
    if (fbg) {
      const fcells = document.createElement('div');
      fcells.className = 'floor-tiles';
      fcells.style.cssText = 'left:' + OX + 'px;top:' + OY + 'px;width:' + fw + 'px;height:' + fh + 'px';
      let cellHTML = '';
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          cellHTML += '<i style="left:' + (xx * TILE) + 'px;top:' + (yy * TILE) + 'px;width:' + TILE + 'px;height:' + TILE + 'px;' + fbg + '"></i>';
        }
      }
      fcells.innerHTML = cellHTML;
      frag.appendChild(fcells);
    }

    // floor tile grid lines (subtle, on top of the texture)
    const grid = document.createElement('div');
    grid.className = 'floor-grid';
    grid.style.cssText = 'left:' + OX + 'px;top:' + OY + 'px;width:' + fw + 'px;height:' + fh + 'px;background-size:' + TILE + 'px ' + TILE + 'px';
    frag.appendChild(grid);

    // interior walls (block movement, define rooms) — LimeZu wall tile
    const wbg = wallTileBG(TILE);
    (state.lot.walls || []).forEach((wll) => {
      const el = document.createElement('div');
      el.className = 'wall-tile' + (wbg ? ' tiled' : '');
      el.style.cssText = 'left:' + (OX + wll.x * TILE) + 'px;top:' + (OY + wll.y * TILE) + 'px;width:' + TILE + 'px;height:' + TILE + 'px;' + (wbg || ('background:' + wallColor()));
      frag.appendChild(el);
    });

    // doors (walkable openings in the walls)
    (state.lot.doors || []).forEach((d) => {
      const el = document.createElement('div');
      el.className = 'door-tile';
      el.style.cssText = 'left:' + (OX + d.x * TILE) + 'px;top:' + (OY + d.y * TILE) + 'px;width:' + TILE + 'px;height:' + TILE + 'px';
      el.innerHTML = (LS.Furniture && LS.Furniture.door) ? LS.Furniture.door(d.o, wallColor()) : '';
      frag.appendChild(el);
    });

    // windows on the outer walls (home only, decorative)
    if (state.location === 'home') {
      const addWin = (x, y, ww, hh, vert) => {
        const el = document.createElement('div');
        el.className = 'window-pane' + (vert ? ' v' : '');
        el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + ww + 'px;height:' + hh + 'px';
        frag.appendChild(el);
      };
      [0.2, 0.5, 0.8].forEach((p) => addWin(OX + fw * p - fw * 0.07, OY - WALL + 1, fw * 0.14, WALL - 2, false));
      [0.32, 0.7].forEach((p) => {
        addWin(OX - WALL + 1, OY + fh * p - fh * 0.07, WALL - 2, fh * 0.14, true);
        addWin(OX + fw + 1, OY + fh * p - fh * 0.07, WALL - 2, fh * 0.14, true);
      });
    }

    // room labels (home only)
    if (state.location === 'home' && LS.HOME_ROOMS) {
      LS.HOME_ROOMS.forEach((r) => {
        const lbl = document.createElement('div');
        lbl.className = 'room-label';
        lbl.textContent = r.label;
        lbl.style.cssText = 'left:' + (OX + r.x * TILE + 6) + 'px;top:' + (OY + r.y * TILE + 4) + 'px';
        frag.appendChild(lbl);
      });
    }

    // day/night lighting overlay (covers floor)
    dayNightEl = document.createElement('div');
    dayNightEl.className = 'daynight';
    dayNightEl.style.cssText = 'left:' + OX + 'px;top:' + OY + 'px;width:' + fw + 'px;height:' + fh + 'px';
    frag.appendChild(dayNightEl);

    // furniture
    state.lot.furniture.forEach((f) => {
      const el = document.createElement('div');
      el.className = objClass('lot-obj', f);
      el.style.cssText = objStyle(f);
      el.innerHTML = objInner(f);
      el.addEventListener('click', (e) => { showInteractPopup(e, f); });
      frag.appendChild(el);
      objEls[f.uid] = el;
    });

    // Sim token
    const tok = document.createElement('div');
    tok.className = 'sim-token';
    tok.innerHTML =
      '<div class="plumbob" id="plumbob"></div>' +
      '<div class="sim-nametag" id="nametag">' + esc(sim.name) + '</div>' +
      '<div class="thought-bubble" id="thoughtBubble"></div>' +
      '<div class="action-ring" id="actionRing" style="display:none">' +
        '<svg viewBox="0 0 36 36"><circle class="bg-circle" cx="18" cy="18" r="15"/><circle class="prog-circle" cx="18" cy="18" r="15" stroke-dasharray="94.2" stroke-dashoffset="94.2"/></svg>' +
        '<div class="act-icon" id="actionRingIcon">⏳</div>' +
      '</div>' +
      '<div class="act-bubble"></div>' +
      '<div class="fx-emit"></div>' +
      simBodyHTML(sim.skinTone, sim.hairColor, sim.outfitColor);
    frag.appendChild(tok);
    simTokenEl = tok;

    // present Sims (partner, children, townies) walking around
    presentNpcs.forEach((p) => {
      const a = p.agent;
      const first = (a.name || 'Sim').split(' ')[0];
      const tag = p.kind === 'partner' ? '💍 ' + first : p.kind === 'child' ? '🧒 ' + first : first;
      const el = document.createElement('div');
      el.className = 'sim-token npc-token face-down' + (p.kind === 'child' ? ' child-token' : '') + (p.kind === 'partner' ? ' partner-token' : '');
      el.innerHTML =
        '<div class="sim-nametag npc">' + esc(tag) + '</div>' +
        '<div class="act-bubble"></div>' +
        '<div class="fx-emit"></div>' +
        simBodyHTML(a.skinTone, a.hairColor, a.outfitColor);
      if (p.npc) el.addEventListener('click', (e) => { showNpcMenu(e, p.npc); });
      else el.addEventListener('click', () => { toast(esc(a.name) + ' · ' + LS.Life.childStageMeta(p.child.stage).label); });
      frag.appendChild(el);
      p.el = el;
    });

    // location badge (top-left of the lot)
    const loc = state.location === 'home'
      ? { icon: '🏠', name: 'Home' }
      : (LS.Locations.info(state.location) || { icon: '📍', name: state.location });
    const locEl = document.createElement('div');
    locEl.className = 'loc-badge';
    locEl.innerHTML = loc.icon + ' ' + esc(loc.name);
    frag.appendChild(locEl);

    view.appendChild(frag);
    view.style.minWidth = '';
    view.style.minHeight = '';
    plumbobEl = $('#plumbob', view);
    thoughtEl = $('#thoughtBubble', view);
    actionRingEl = $('#actionRing', view);
    ringProgEl = view.querySelector('.prog-circle');
    ringIconEl = $('#actionRingIcon', view);
  }

  function objStyle(f, t, ox, oy) {
    t = t || TILE; ox = (ox == null ? OX : ox); oy = (oy == null ? OY : oy);
    // depth-sort: items lower on the lot (larger y) draw over those behind, so a
    // tall sprite's overhang correctly occludes the furniture above it.
    const z = (f.y + f.size.h) * 10;
    return 'left:' + (ox + f.x * t + 2) + 'px;top:' + (oy + f.y * t + 2) + 'px;width:' + (f.size.w * t - 4) + 'px;height:' + (f.size.h * t - 4) + 'px;z-index:' + z;
  }

  // ================================================================
  // UPDATE PHASE (per tick — lightweight)
  // ================================================================
  function updateAll() {
    if (!sim) return;
    updateTop();
    updateNeeds();
    updateMoodlets();
    updateQuickActions();
    updateRightPanel();
    updateAspiration();
    updateTray();
    updateLot();
  }

  function updateTop() {
    topMoneyEl.textContent = num(sim.money);
    topLscEl.textContent = num(state.player.lsc);
    clockDayEl.textContent = 'Day ' + state.time.day;
    clockTimeEl.textContent = LS.Clock.format12(state.time);
    clockPhaseEl.textContent = state.time.dayPhase.charAt(0).toUpperCase() + state.time.dayPhase.slice(1);
    $$('.spd-btn').forEach((b) => b.classList.toggle('active', +b.dataset.spd === state.time.speed));
    const small = $('#topSimCareer');
    const ci = LS.Careers.info(sim);
    if (small) small.textContent = ci ? ci.title : 'Unemployed';
    // track the "Save ₱1000" quest against the wallet
    LS.Clock.notifyQuest('rich', sim.money);
  }

  function updateNeeds() {
    const emeta = LS.Emotions.meta(sim);
    emotionLabelEl.textContent = emeta.icon + ' ' + emeta.label;
    emotionLabelEl.style.color = emeta.color;
    moodLabelEl.textContent = 'Mood ' + Math.round(sim.mood);
    moodRingEl.style.background = 'conic-gradient(' + emeta.color + ' ' + sim.mood + '%, rgba(255,255,255,0.08) ' + sim.mood + '%)';
    LS.NEEDS.forEach((n) => {
      const meta = LS.NEED_META[n];
      const v = Math.round(sim.needs[n]);
      const color = v < 20 ? '#ff5c7c' : v < 40 ? '#ffb454' : meta.color;
      needsBars[n].style.width = v + '%';
      needsBars[n].style.background = color;
      needVals[n].textContent = v;
    });
    // quest: reached a positive emotion
    if (emeta.tone === 'good') LS.Clock.notifyQuest('feel_good', 1);
  }

  let lastMoodletSig = '';
  function updateMoodlets() {
    const ms = sim.moodlets || [];
    const sig = ms.map((m) => m.id + Math.ceil(m.ttl / 30)).join('|');
    if (sig === lastMoodletSig) return; // avoid rebuilding every frame
    lastMoodletSig = sig;
    if (!ms.length) {
      moodletStripEl.innerHTML = '<span class="moodlet-empty">Feeling steady.</span>';
      return;
    }
    moodletStripEl.innerHTML = ms.map((m) => {
      const pct = m.ttl0 ? Math.max(0, Math.min(100, (m.ttl / m.ttl0) * 100)) : 100;
      const sign = m.mood > 0 ? '+' : '';
      return '<div class="moodlet ' + (m.tone || 'neutral') + '" title="' + esc(m.label) + ' (' + sign + m.mood + ' mood)">' +
        '<span class="ml-ic">' + m.icon + '</span>' +
        '<div class="ml-info"><b>' + esc(m.label) + '</b><div class="ml-bar"><span style="width:' + pct + '%"></span></div></div>' +
      '</div>';
    }).join('');
  }

  function updateQuickActions() {
    quickActions.forEach((a) => {
      let cond = true;
      if (a.id === 'sleep') cond = hasCat('bed');
      else if (a.id === 'eat') cond = hasCat('food');
      else if (a.id === 'shower') cond = hasCat('bath');
      else if (a.id === 'toilet') cond = state.lot.furniture.some((f) => f.mood === 'toilet' || (f.effect && f.effect.bladder));
      else if (a.id === 'fun') cond = hasCat('fun') || hasCat('comfort');
      else if (a.id === 'work') cond = !!sim.career;
      a.el.disabled = !cond;
    });
  }

  function updateRightPanel() {
    const small = $('#simCardBig .scb-info small');
    if (small) {
      const ci = LS.Careers.info(sim);
      small.textContent = 'Age ' + sim.age + ' · ' + (ci ? ci.title : 'Unemployed');
    }
    miniQuestEls.forEach((m) => {
      const pct = Math.min(100, Math.round((m.quest.progress / m.quest.target) * 100));
      m.bar.style.width = pct + '%';
      m.txt.textContent = m.quest.done ? '✓' : '+' + m.quest.reward;
      m.el.classList.toggle('done', m.quest.done);
    });
  }

  let lastAspSig = '';
  function updateAspiration() {
    if (!aspirationCardEl) return;
    const a = LS.aspirationStatus(sim);
    const sig = a.label + ':' + Math.round(a.cur) + ':' + a.done;
    if (sig === lastAspSig) return;
    lastAspSig = sig;
    const pct = Math.round(a.progress * 100);
    aspirationCardEl.innerHTML =
      '<div class="asp-head"><span class="asp-ic">' + a.icon + '</span><div><b>' + a.label + '</b><small>' + esc(a.desc) + '</small></div></div>' +
      '<div class="asp-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="asp-foot"><span>' + Math.round(a.cur) + ' / ' + a.goal + '</span><span>' + (a.done ? '✓ Fulfilled' : '+500 PLUM') + '</span></div>';
  }

  let lastTraySig = '';
  function updateTray() {
    const a = sim.action;
    const sig = (a ? a.id + ':' + a.phase : 'none') + '|' + sim.actionQueue.map((q) => q.id).join(',');
    if (sig !== lastTraySig) { lastTraySig = sig; renderTray(); }
    if (a && a.phase === 'using') {
      const bar = trayCurEl.querySelector('.cur-bar span');
      if (bar) bar.style.width = Math.min(100, (a.elapsed / a.duration) * 100) + '%';
    }
  }

  function renderTray() {
    if (sim.action) {
      const phase = sim.action.phase === 'walking' ? 'Walking to' : 'Doing';
      const cls = sim.action.phase === 'walking' ? 'walking' : '';
      trayCurEl.innerHTML = '<span class="cur-ic">' + (sim.action.icon || '⏳') + '</span>' +
        '<div class="cur-info"><span class="cur-label">' + phase + ' ' + esc(sim.action.label) + '</span>' +
        '<div class="cur-bar ' + cls + '"><span style="width:' + (cls ? 100 : 0) + '%"></span></div></div>' +
        '<button class="cur-cancel" title="Cancel">✕</button>';
      const cancel = trayCurEl.querySelector('.cur-cancel');
      if (cancel) cancel.addEventListener('click', () => { LS.Clock.cancelAction(0); fx('select'); });
    } else {
      trayCurEl.innerHTML = '<span class="tray-empty">Click furniture to interact, or use Quick Actions →</span>';
    }
    trayQueueEl.innerHTML = sim.actionQueue.slice(0, 6).map((a, i) =>
      '<button class="q-chip" data-i="' + (i + 1) + '" title="Click to cancel">' + (a.icon || '⏳') + ' ' + esc(a.label) + ' ✕</button>'
    ).join('');
    $$('.q-chip', trayQueueEl).forEach((c) => {
      c.addEventListener('click', () => { LS.Clock.cancelAction(+c.dataset.i); fx('select'); });
    });
  }

  // ---- live world render ----
  function tileCenterPx(px, py) {
    return { x: OX + (px + 0.5) * TILE, y: OY + (py + 0.5) * TILE };
  }

  // How a Sim visibly performs each kind of activity.
  const POSE = {
    rest:    { pose: 'lie',   icon: '😴', fx: '💤' },
    relax:   { pose: 'sit',   icon: '🛋️', fx: '' },
    toilet:  { pose: 'sit',   icon: '🚽', fx: '' },
    shower:  { pose: 'stand', icon: '🚿', fx: '💧' },
    wash:    { pose: 'stand', icon: '🧼', fx: '💧' },
    cook:    { pose: 'stand', icon: '🍳', fx: '♨️' },
    coffee:  { pose: 'stand', icon: '☕', fx: '' },
    tv:      { pose: 'sit',   icon: '📺', fx: '' },
    pc:      { pose: 'sit',   icon: '💻', fx: '' },
    play:    { pose: 'sit',   icon: '🎮', fx: '' },
    read:    { pose: 'sit',   icon: '📖', fx: '' },
    paint:   { pose: 'stand', icon: '🎨', fx: '✨' },
    music:   { pose: 'stand', icon: '🎵', fx: '🎶' },
    write:   { pose: 'sit',   icon: '✍️', fx: '' },
    workout: { pose: 'stand', icon: '💪', fx: '💦' },
    tinker:  { pose: 'stand', icon: '🔧', fx: '' },
    garden:  { pose: 'stand', icon: '🌱', fx: '' }
  };

  // Position + posture a Sim token. While using an object it sits/lies ON it
  // and shows an activity bubble + particles so it's clearly *performing*.
  function applyPose(el, targetObj, mood, isUsing, moving, facing, px, py) {
    const info = (isUsing && mood) ? (POSE[mood] || { pose: 'stand', icon: '✨', fx: '' }) : null;
    const pose = info ? info.pose : 'stand';
    // sit/lie render ON the object's centre; otherwise at the agent's tile
    let c;
    if (info && (pose === 'sit' || pose === 'lie') && targetObj) {
      c = tileCenterPx(targetObj.x + (targetObj.size.w - 1) / 2, targetObj.y + (targetObj.size.h - 1) / 2);
    } else {
      c = tileCenterPx(px, py);
    }
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    // guarded writes — only touch the DOM when something actually changed
    if (el._pose !== pose) { el.classList.remove('pose-sit', 'pose-lie', 'pose-stand'); el.classList.add('pose-' + pose); el._pose = pose; }
    const posing = !!isUsing;
    if (el._posing !== posing) { el.classList.toggle('posing', posing); el._posing = posing; }
    const walk = !!moving && !isUsing;
    if (el._walk !== walk) { el.classList.toggle('walking', walk); el._walk = walk; }
    const fc = facing || 'down';
    if (el._face !== fc) { el.classList.remove('face-up', 'face-down', 'face-left', 'face-right'); el.classList.add('face-' + fc); el._face = fc; }
    setCharFrame(el, fc, walk);
    const ab = el._ab || (el._ab = el.querySelector('.act-bubble'));
    if (ab) {
      const icon = info ? info.icon : '';
      if (el._abIcon !== icon) { ab.textContent = icon; ab.style.display = icon ? 'flex' : 'none'; el._abIcon = icon; }
    }
    const fe = el._fe || (el._fe = el.querySelector('.fx-emit'));
    if (fe) {
      const fxv = (info && info.fx) ? info.fx : '';
      if (el._feFx !== fxv) { fe.textContent = fxv; fe.style.display = fxv ? 'block' : 'none'; el._feFx = fxv; }
    }
  }

  function updateLot() {
    if (!simTokenEl) return;
    frameCounter++;   // drives the Sim walk-cycle animation

    // player Sim — pose & position (sits/lies ON an object while using it)
    let pTarget = null, pMood = null, pUsing = false;
    if (sim.action && sim.action.phase === 'using' && sim.action.target) {
      pTarget = LS.Build.getInstance(state, sim.action.target);
      pMood = pTarget ? pTarget.mood : null; pUsing = !!pTarget;
    }
    applyPose(simTokenEl, pTarget, pMood, pUsing, sim.moving, sim.facing, sim.px, sim.py);

    // present Sims (partner / children / townies) — they perform activities too
    presentNpcs.forEach((p) => {
      if (!p.el) return;
      const a = p.agent;
      let mood = null, target = null, using = false;
      if (a.act && a.act.phase === 'using') {
        target = LS.Build.getInstance(state, a.act.target);
        mood = a.act.mood; using = !!target;
      }
      applyPose(p.el, target, mood, using, a.moving, a.facing, a.px, a.py);
    });

    // plumbob reflects emotion
    if (plumbobEl) {
      const emeta = LS.Emotions.meta(sim);
      plumbobEl.style.background = emeta.color;
      plumbobEl.style.boxShadow = '0 0 10px ' + emeta.color;
    }

    // day/night lighting
    if (dayNightEl) dayNightEl.style.background = nightTint(state.time.hour, state.time.minute);

    // highlight the object in use
    const usingUid = (sim.action && sim.action.phase === 'using' && sim.action.target) ? sim.action.target : null;
    Object.keys(objEls).forEach((uid) => objEls[uid].classList.toggle('used', uid === usingUid));

    // thought bubble — what the Sim wants (idle) or is heading to (walking)
    if (thoughtEl) {
      if (sim.action && sim.action.phase === 'walking') {
        thoughtEl.textContent = sim.action.icon || '💭';
        thoughtEl.style.display = 'flex';
        thoughtEl.classList.remove('urgent');
      } else if (!sim.action) {
        const crit = LS.Needs.criticalNeeds(sim, 25);
        if (crit.length) {
          const lowest = crit.sort((a, b) => a.value - b.value)[0];
          thoughtEl.textContent = lowest.meta.icon;
          thoughtEl.style.display = 'flex';
          thoughtEl.classList.toggle('urgent', lowest.value < 15);
        } else {
          thoughtEl.style.display = 'none';
        }
      } else {
        thoughtEl.style.display = 'none'; // using → the activity bubble shows
      }
    }

    // action progress ring (only while using)
    if (actionRingEl && ringProgEl) {
      if (sim.action && sim.action.phase === 'using') {
        actionRingEl.style.display = 'block';
        const pct = Math.min(1, sim.action.elapsed / sim.action.duration);
        ringProgEl.style.strokeDashoffset = (94.2 * (1 - pct)).toString();
        if (ringIconEl) ringIconEl.textContent = ''; // icon shown by the activity bubble
      } else {
        actionRingEl.style.display = 'none';
      }
    }
  }

  // Lighting tint by time of day (rgba string).
  function nightTint(hour, minute) {
    const t = hour + minute / 60;
    let a = 0;          // darkness alpha
    let col = '10,14,40';
    if (t >= 21 || t < 5) { a = 0.5; }                       // deep night
    else if (t >= 19) { a = 0.34; col = '40,20,60'; }        // dusk
    else if (t >= 17) { a = 0.16; col = '70,40,30'; }        // golden hour
    else if (t < 7) { a = 0.28; col = '30,40,80'; }          // dawn
    else if (t < 9) { a = 0.1; col = '60,60,40'; }           // morning
    return 'rgba(' + col + ',' + a + ')';
  }

  // ================================================================
  // FURNITURE / ACTION HELPERS
  // ================================================================
  function hasCat(cat) { return state.lot.furniture.some((f) => f.cat === cat); }

  function nearestByCat(cat) {
    let best = null, bestCost = Infinity;
    state.lot.furniture.forEach((f) => {
      if (f.cat === cat) {
        const c = LS.Movement.pathCostToFurniture(state, sim, f);
        if (c < bestCost) { bestCost = c; best = f; }
      }
    });
    return best;
  }
  function nearestByPredicate(pred) {
    let best = null, bestCost = Infinity;
    state.lot.furniture.forEach((f) => {
      if (pred(f)) {
        const c = LS.Movement.pathCostToFurniture(state, sim, f);
        if (c < bestCost) { bestCost = c; best = f; }
      }
    });
    return best;
  }

  function queueUse(uid, label, icon, duration, extra) {
    LS.Clock.queueAction(Object.assign({ id: 'use_' + uid, label, icon, duration, target: uid, kind: 'use' }, extra || {}));
  }

  function doSleep() {
    const bed = nearestByCat('bed');
    if (!bed) { toast('Buy a bed first!', 'error'); fx('error'); return; }
    const night = state.time.hour >= 20 || state.time.hour < 7;
    queueUse(bed.uid, 'Sleep', '😴', 180, { skipToMorning: night });
    toast('Heading to bed…');
  }
  function doEat() {
    const food = nearestByCat('food');
    if (!food) { toast('Buy a fridge/stove first!', 'error'); fx('error'); return; }
    queueUse(food.uid, 'Cook & Eat', '🍽️', 35);
  }
  function doShower() {
    const bath = nearestByPredicate((f) => f.mood === 'shower');
    if (!bath) { toast('Buy a shower or bathtub first!', 'error'); fx('error'); return; }
    queueUse(bath.uid, 'Freshen up', '🚿', 22);
  }
  function doToilet() {
    const t = nearestByPredicate((f) => f.mood === 'toilet' || (f.effect && f.effect.bladder));
    if (!t) { toast('Buy a toilet first!', 'error'); fx('error'); return; }
    queueUse(t.uid, 'Use Toilet', '🚽', 10);
  }
  function doFun() {
    const f = nearestByPredicate((x) => x.effect && x.effect.fun) || nearestByCat('fun') || nearestByCat('comfort');
    if (!f) { toast('Buy something fun first!', 'error'); fx('error'); return; }
    queueUse(f.uid, 'Have Fun', '🎉', 45);
  }
  function doWorkNow() {
    if (!sim.career) { toast('Get a job first (Career tab)!', 'error'); fx('error'); return; }
    LS.Clock.queueAction({ id: 'work_manual', label: 'Go to Work', icon: '💼', duration: 60, kind: 'job' });
    toast('Heading to work…');
  }

  // ================================================================
  // INTERACT POPUP
  // ================================================================
  function showInteractPopup(e, f) {
    if (visiting) { toast(f.name, ''); return; }
    const pop = $('#interactPopup');
    const actions = [];
    actions.push({ label: 'Use ' + f.name, icon: f.icon, fn: () => queueUse(f.uid, 'Use ' + f.name, f.icon, 30) });
    if (f.cat === 'bed') {
      actions.push({ label: 'Nap (1 hr)', icon: '💤', fn: () => queueUse(f.uid, 'Nap', '💤', 60) });
      actions.push({ label: 'Sleep till morning', icon: '😴', fn: () => queueUse(f.uid, 'Sleep', '😴', 180, { skipToMorning: state.time.hour >= 20 || state.time.hour < 7 }) });
    }
    if (f.cat === 'food') {
      actions.push({ label: 'Cook & Eat', icon: '🍽️', fn: () => queueUse(f.uid, 'Cook & Eat', '🍽️', 40) });
    }
    if (f.skill) {
      actions.push({ label: 'Practice ' + LS.SKILL_META[f.skill].label, icon: '📈', fn: () => queueUse(f.uid, 'Practice ' + LS.SKILL_META[f.skill].label, '📈', 45) });
    }
    pop.innerHTML = '<div class="ip-title">' + esc(f.name) + '</div>';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'ip-btn';
      btn.innerHTML = a.icon + ' ' + esc(a.label);
      btn.addEventListener('click', () => { fx('select'); a.fn(); pop.classList.remove('open'); });
      pop.appendChild(btn);
    });
    pop.classList.add('open');
    // The popup is position:fixed, so place it in viewport coordinates
    // (getBoundingClientRect is already viewport-relative).
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 210));
    const top = Math.min(rect.bottom + 4, window.innerHeight - 160);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    e.stopPropagation();
  }
  document.addEventListener('click', () => $('#interactPopup').classList.remove('open'));

  // In-world social: click an NPC → menu of (unlocked) interactions
  function showNpcMenu(e, npc) {
    if (visiting) { toast(npc.name, ''); return; }
    const pop = $('#interactPopup');
    const r = sim.relationships.find((x) => x.id === npc.id);
    const score = r ? r.score : 0;
    const tier = r ? (r.tier || LS.Relationships.tier(score).label) : 'Stranger';
    const acts = LS.Relationships.INTERACTIONS;
    pop.innerHTML = '<div class="ip-title">' + esc(npc.name) + ' · ' + tier + ' ' + Math.round(score) + '/100</div>';
    Object.keys(acts).forEach((k) => {
      const a = acts[k];
      const locked = score < a.reqScore || (a.cost && sim.money < a.cost);
      const btn = document.createElement('button');
      btn.className = 'ip-btn' + (locked ? ' locked' : '');
      btn.innerHTML = a.icon + ' ' + a.label + (a.cost ? ' (₱' + a.cost + ')' : '') + (score < a.reqScore ? ' 🔒' : '');
      if (locked) btn.disabled = true;
      else btn.addEventListener('click', () => { fx('select'); queueSocial(npc.id, k); pop.classList.remove('open'); });
      pop.appendChild(btn);
    });

    // Family actions
    const addFam = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'ip-btn fam';
      b.innerHTML = label;
      b.addEventListener('click', () => { fn(); pop.classList.remove('open'); });
      pop.appendChild(b);
    };
    const isPartner = sim.partner && sim.partner.npcId === npc.id;
    if (score >= 90 && !sim.partner) {
      addFam('💕 Ask to Move In', () => {
        LS.Life.moveIn(sim, npc);
        toast('💕 ' + npc.name.split(' ')[0] + ' moved in with you!', 'success');
        fx('reward'); if (LS.FX) LS.FX.confetti();
        presentLotKey = null; save(); if (state.location === 'home') buildLot();
        if ($('#stage-social').classList.contains('active')) renderSocial();
      });
    }
    if (isPartner) {
      if (!sim.partner.married) {
        addFam('💍 Propose Marriage', () => {
          LS.Life.marry(sim);
          toast('💍 You got married!', 'success');
          fx('reward'); if (LS.FX) LS.FX.confetti(); save();
          if ($('#stage-social').classList.contains('active')) renderSocial();
        });
      }
      addFam('👶 Try for Baby', () => {
        const r = LS.Life.tryForBaby(sim, state);
        toast(r.ok ? '👶 Welcome, ' + r.child.name.split(' ')[0] + '!' : r.msg, r.ok ? 'success' : 'error');
        if (r.ok) { fx('reward'); if (LS.FX) LS.FX.confetti(); presentLotKey = null; save(); if (state.location === 'home') buildLot(); if ($('#stage-social').classList.contains('active')) renderSocial(); }
      });
    }
    pop.classList.add('open');
    const rect = e.currentTarget.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 220)) + 'px';
    pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 300) + 'px';
    e.stopPropagation();
  }
  function queueSocial(npcId, interactionId) {
    const a = LS.Relationships.INTERACTIONS[interactionId];
    LS.Clock.queueAction({ id: 'social_' + npcId + '_' + interactionId, label: a.label, icon: a.icon, duration: 18, kind: 'social', npcId: npcId, interactionId: interactionId });
    toast('Walking over to ' + a.label.toLowerCase() + '…');
  }

  // ================================================================
  // MODE SWITCH
  // ================================================================
  function switchMode(mode) {
    fx('click');
    $$('.mode-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    $$('.stage-view').forEach((v) => v.classList.remove('active'));
    $('#stage-' + mode).classList.add('active');
    if (mode === 'live') buildLot();         // refit world to current size
    else if (mode === 'build') renderBuild();
    else if (mode === 'shop') renderShop();
    else if (mode === 'town') renderTown();
    else if (mode === 'career') renderCareer();
    else if (mode === 'social') renderSocial();
    else if (mode === 'skills') renderSkills();
  }

  // ================================================================
  // BUILD MODE
  // ================================================================
  function renderBuild() {
    LS.Build.ensureLot(state);
    const atHome = state.location === 'home';
    const itemsWrap = $('#buildItems');

    if (!atHome) {
      const v = LS.Locations.info(state.location) || { name: state.location };
      $('#buildValue').textContent = 'Visiting ' + v.name;
      $('#invCount').textContent = '';
      itemsWrap.style.display = '';
      itemsWrap.innerHTML = '<div class="build-empty">🏠 You can only build & decorate at <b>Home</b>.<br/><button class="btn btn-primary btn-sm" id="goHomeBuild">Go Home</button></div>';
      const gh = $('#goHomeBuild'); if (gh) gh.addEventListener('click', () => travelTo('home'));
      $('#floorRow').innerHTML = ''; $('#wallRow').innerHTML = '';
      $('#buildHint').textContent = 'Travel home to build.';
      renderBuildLot();
      return;
    }

    $('#buildValue').textContent = 'Home value: ₱' + num(state.lot.value);
    $$('#buildTools .tool-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === buildTool);
      b.onclick = () => { buildTool = b.dataset.tool; moveSel = null; buildSel = null; setHint(); renderBuild(); fx('click'); };
    });

    if (buildTool === 'place') {
      itemsWrap.style.display = '';
      const inv = state.inventory || [];
      const counts = {};
      inv.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
      $('#invCount').textContent = inv.length ? '(' + inv.length + ')' : '';
      const ids = Object.keys(counts);
      if (!ids.length) {
        itemsWrap.innerHTML = '<div class="build-empty">No furniture owned yet.<br/><button class="btn btn-primary btn-sm" id="goShop">🛒 Open Shop</button></div>';
        const gs = $('#goShop'); if (gs) gs.addEventListener('click', () => switchMode('shop'));
      } else {
        itemsWrap.innerHTML = ids.map((id) => {
          const it = LS.Build.byId(id);
          return '<div class="build-item ' + (buildSel === id ? 'selected' : '') + '" data-id="' + id + '" title="' + esc(it.name) + '">' +
            '<div class="bi-ic">' + it.icon + '</div><span class="bi-name">' + esc(it.name) + '</span>' +
            '<span class="bi-cost">×' + counts[id] + '</span></div>';
        }).join('');
        $$('#buildItems .build-item').forEach((el) => {
          el.addEventListener('click', () => { buildSel = el.dataset.id; setHint(); renderBuild(); fx('select'); });
        });
      }
    } else {
      itemsWrap.style.display = 'none';
      $('#invCount').textContent = '';
    }

    renderSurfaces();
    renderBuildLot();
    setHint();
  }

  function setHint() {
    const hint = $('#buildHint');
    if (buildTool === 'place') {
      hint.textContent = buildSel ? 'Selected: ' + LS.Build.byId(buildSel).name + '. Click a tile to place.' : 'Pick an owned item, then click a tile. Buy more in the Shop.';
    } else if (buildTool === 'wall') {
      hint.textContent = 'Click empty tiles to add walls, or click a wall to erase it — carve your own rooms.';
    } else if (buildTool === 'door') {
      hint.textContent = 'Click a wall to cut a door into it, or click a door to remove it.';
    } else if (buildTool === 'move') {
      hint.textContent = moveSel ? 'Now click an empty tile to drop it.' : 'Click a piece of furniture to pick it up.';
    } else {
      hint.textContent = 'Click furniture to sell it for half its value.';
    }
  }

  function renderSurfaces() {
    const fr = $('#floorRow');
    fr.innerHTML = Object.keys(LS.FLOOR_STYLES).map((k) => {
      const s = LS.FLOOR_STYLES[k];
      return '<button class="swatch ' + (state.lot.floor === k ? 'active' : '') + '" data-floor="' + k + '" title="' + esc(s.label) + (s.cost ? ' — ₱' + s.cost : '') + '" style="background:' + s.color + '"></button>';
    }).join('');
    $$('#floorRow .swatch').forEach((b) => b.addEventListener('click', () => applySurface('floor', b.dataset.floor)));

    const wr = $('#wallRow');
    wr.innerHTML = Object.keys(LS.WALL_STYLES).map((k) => {
      const s = LS.WALL_STYLES[k];
      return '<button class="swatch ' + (state.lot.wall === k ? 'active' : '') + '" data-wall="' + k + '" title="' + esc(s.label) + (s.cost ? ' — ₱' + s.cost : '') + '" style="background:' + s.color + '"></button>';
    }).join('');
    $$('#wallRow .swatch').forEach((b) => b.addEventListener('click', () => applySurface('wall', b.dataset.wall)));
  }

  function applySurface(kind, key) {
    const res = kind === 'floor' ? LS.Build.setFloor(state, sim, key) : LS.Build.setWall(state, sim, key);
    toast(res.msg, res.ok ? 'success' : 'error');
    if (res.ok) {
      fx('place');
      const styled = (state.lot.floor !== 'wood' ? 1 : 0) + (state.lot.wall !== 'warm' ? 1 : 0);
      LS.Clock.notifyQuest('designer', styled);
      save();
      renderBuild();
      buildLot();
      updateTop();
    } else { fx('error'); }
  }

  function renderBuildLot() {
    const lot = $('#buildLot');
    const w = state.lot.size.w, h = state.lot.size.h;
    const L = computeLayout(lot, w, h);
    const t = L.t, ox = L.ox, oy = L.oy;
    const fw = w * t, fh = h * t;
    lot.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'house-walls';
    frame.style.cssText = 'left:' + (ox - WALL) + 'px;top:' + (oy - WALL) + 'px;width:' + (fw + WALL * 2) + 'px;height:' + (fh + WALL * 2) + 'px;background:' + wallColor();
    lot.appendChild(frame);
    const floor = document.createElement('div');
    floor.className = 'house-floor';
    floor.style.cssText = 'left:' + ox + 'px;top:' + oy + 'px;width:' + fw + 'px;height:' + fh + 'px;--floor:' + floorColor();
    lot.appendChild(floor);

    const frag = document.createDocumentFragment();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tl = document.createElement('div');
        tl.className = 'b-tile';
        tl.style.cssText = 'left:' + (ox + x * t) + 'px;top:' + (oy + y * t) + 'px;width:' + t + 'px;height:' + t + 'px';
        tl.dataset.x = x; tl.dataset.y = y;
        tl.addEventListener('mouseenter', () => onBuildHover(x, y));
        tl.addEventListener('click', () => onBuildClick(x, y));
        frag.appendChild(tl);
      }
    }
    (state.lot.walls || []).forEach((wll) => {
      const el = document.createElement('div');
      el.className = 'wall-tile';
      el.style.cssText = 'left:' + (ox + wll.x * t) + 'px;top:' + (oy + wll.y * t) + 'px;width:' + t + 'px;height:' + t + 'px;background:' + wallColor();
      frag.appendChild(el);
    });
    (state.lot.doors || []).forEach((d) => {
      const el = document.createElement('div');
      el.className = 'door-tile';
      el.style.cssText = 'left:' + (ox + d.x * t) + 'px;top:' + (oy + d.y * t) + 'px;width:' + t + 'px;height:' + t + 'px';
      el.innerHTML = (LS.Furniture && LS.Furniture.door) ? LS.Furniture.door(d.o, wallColor()) : '';
      frag.appendChild(el);
    });
    if (state.location === 'home' && LS.HOME_ROOMS) {
      LS.HOME_ROOMS.forEach((r) => {
        const lbl = document.createElement('div');
        lbl.className = 'room-label';
        lbl.textContent = r.label;
        lbl.style.cssText = 'left:' + (ox + r.x * t + 6) + 'px;top:' + (oy + r.y * t + 4) + 'px';
        frag.appendChild(lbl);
      });
    }
    state.lot.furniture.forEach((f) => {
      const el = document.createElement('div');
      el.className = objClass('b-obj' + (moveSel === f.uid ? ' picked' : ''), f);
      el.style.cssText = objStyle(f, t, ox, oy) + ';font-size:22px';
      el.innerHTML = spriteImgHTML(f, t)
        || (f.sprite
          ? '<span class="obj-sprite" style="background-image:url(' + f.sprite + ')"></span>'
          : ((LS.Furniture && LS.Furniture.svg(f)) || f.icon));
      el.title = f.name + (buildTool === 'sell' ? ' — sell for ₱' + Math.floor(f.cost / 2) : buildTool === 'move' ? ' — click to pick up' : '');
      el.addEventListener('click', (e) => { e.stopPropagation(); onObjClick(f); });
      frag.appendChild(el);
    });
    lot.appendChild(frag);
    lot.style.minWidth = '';
    lot.style.minHeight = '';
  }

  function onObjClick(f) {
    if (state.location !== 'home') { toast('Go home to edit furniture.', 'error'); return; }
    if (buildTool === 'sell') {
      const refund = Math.floor(f.cost / 2);
      LS.Build.sell(state, sim, f.uid);
      fx('coin');
      afterBuildChange();
      toast('Sold ' + f.name + ' for ₱' + refund, 'success');
    } else if (buildTool === 'move') {
      moveSel = (moveSel === f.uid) ? null : f.uid;
      setHint();
      renderBuildLot();
      fx('select');
    }
  }

  function onBuildHover(x, y) {
    if (state.location !== 'home') return;
    $$('.b-tile.hover, .b-tile.bad').forEach((t) => t.classList.remove('hover', 'bad'));
    if (buildTool === 'wall' || buildTool === 'door') {
      const t = $('.b-tile[data-x="' + x + '"][data-y="' + y + '"]');
      const occ = state.lot.tiles[y] ? state.lot.tiles[y][x] : 'X';
      const door = LS.Build.doorAt(state, x, y);
      if (t) t.classList.add((occ === null || occ === 'WALL' || door) ? 'hover' : 'bad');
      return;
    }
    let item = null;
    if (buildTool === 'place' && buildSel) item = LS.Build.byId(buildSel);
    else if (buildTool === 'move' && moveSel) item = LS.Build.getInstance(state, moveSel);
    if (!item) return;
    let ok;
    if (buildTool === 'move' && moveSel) {
      // temporarily ignore the moving object's own tiles
      ok = canPlaceIgnoring(item, x, y, moveSel);
    } else {
      ok = LS.Build.canPlace(state, item, x, y);
    }
    for (let yy = 0; yy < item.size.h; yy++) {
      for (let xx = 0; xx < item.size.w; xx++) {
        const t = $('.b-tile[data-x="' + (x + xx) + '"][data-y="' + (y + yy) + '"]');
        if (t) t.classList.add(ok ? 'hover' : 'bad');
      }
    }
  }

  function canPlaceIgnoring(item, x, y, ignoreUid) {
    const { w, h } = item.size;
    const grid = state.lot.tiles;
    if (y + h > grid.length || x + w > grid[0].length) return false;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const occ = grid[y + yy][x + xx];
        if (occ && occ !== ignoreUid) return false;
      }
    }
    return true;
  }

  function onBuildClick(x, y) {
    if (state.location !== 'home') return;
    if (buildTool === 'place' && buildSel) {
      const res = LS.Build.placeFromInventory(state, sim, buildSel, x, y);
      if (res.ok) {
        fx('place');
        if ((state.inventory || []).indexOf(buildSel) < 0) buildSel = null; // last one placed
        afterBuildChange();
        toast(res.msg, 'success');
        LS.Clock.notifyQuest('home_owner', state.lot.furniture.length);
        if (state.lot.furniture.length >= 5) {
          const r = LS.Economy.rewardMilestoneOnce(state, sim, 'home_built', 'Furnished a home', 'home_built');
          if (r.amount > 0) { rewardBurst(r.amount, 'Home Built!'); fx('reward'); }
        }
      } else { toast(res.msg, 'error'); fx('error'); }
    } else if (buildTool === 'wall') {
      const res = LS.Build.toggleWall(state, x, y);
      if (res.ok) { fx('place'); afterBuildChange(); }
      else { toast(res.msg, 'error'); fx('error'); }
    } else if (buildTool === 'door') {
      const res = LS.Build.toggleDoor(state, x, y);
      if (res.ok) { fx('place'); afterBuildChange(); }
      else { toast(res.msg, 'error'); fx('error'); }
    } else if (buildTool === 'move' && moveSel) {
      const res = LS.Build.move(state, moveSel, x, y);
      toast(res.msg, res.ok ? 'success' : 'error');
      if (res.ok) { fx('place'); moveSel = null; afterBuildChange(); }
      else { fx('error'); }
    }
  }

  function afterBuildChange() {
    state.lot.value = state.lot.furniture.reduce((a, f) => a + f.cost, 0) + surfaceValue();
    LS.Movement.ensureSimTile(state, sim);
    save();
    renderBuild();
    buildLot();
    updateTop();
  }
  function surfaceValue() {
    const f = LS.FLOOR_STYLES[state.lot.floor];
    const w = LS.WALL_STYLES[state.lot.wall];
    return (f ? f.cost : 0) + (w ? w.cost : 0);
  }

  // ================================================================
  // SHOP MODE
  // ================================================================
  function effectSummary(i) {
    const parts = [];
    if (i.effect) {
      Object.keys(i.effect).forEach((k) => {
        const m = LS.NEED_META[k];
        if (m) parts.push(m.icon + '+' + i.effect[k]);
      });
    }
    if (i.skill) parts.push('📈 ' + LS.SKILL_META[i.skill].label);
    return parts.join('  ');
  }

  function renderShop() {
    $('#shopMoney').textContent = '₱' + num(sim.money);
    const cats = LS.Build.CATEGORIES;
    $('#shopCats').innerHTML =
      '<button class="cat-btn ' + (shopCat === 'all' ? 'active' : '') + '" data-cat="all">🛒 All</button>' +
      Object.keys(cats).map((k) => '<button class="cat-btn ' + (k === shopCat ? 'active' : '') + '" data-cat="' + k + '">' + cats[k].icon + ' ' + cats[k].label + '</button>').join('');
    $$('#shopCats .cat-btn').forEach((b) => b.addEventListener('click', () => { shopCat = b.dataset.cat; renderShop(); fx('click'); }));

    const items = LS.Build.CATALOG.filter((i) => shopCat === 'all' || i.cat === shopCat);
    $('#shopGrid').innerHTML = items.map((i) =>
      '<div class="shop-card ' + (sim.money < i.cost ? 'cant' : '') + '">' +
        '<div class="shop-ic">' + i.icon + '</div>' +
        '<div class="shop-info"><b>' + esc(i.name) + '</b><small>' + cats[i.cat].label + '</small><div class="shop-eff">' + effectSummary(i) + '</div></div>' +
        '<button class="shop-buy" data-id="' + i.id + '">₱' + i.cost + '</button>' +
      '</div>'
    ).join('');
    $$('#shopGrid .shop-buy').forEach((b) => b.addEventListener('click', () => {
      const res = LS.Build.buyToInventory(state, sim, b.dataset.id);
      toast(res.msg, res.ok ? 'success' : 'error');
      if (res.ok) { fx('coin'); save(); renderShop(); updateTop(); }
      else fx('error');
    }));
  }

  // ================================================================
  // TOWN MODE + TRAVEL
  // ================================================================
  function renderTown() {
    const wrap = $('#townWrap');
    const venues = LS.Locations.list();
    const buildings = venues.map((v) => {
      const here = state.location === v.id;
      return '<button class="map-lot ' + (here ? 'here' : '') + '" data-id="' + v.id + '" ' +
        'style="left:' + v.mx + '%;top:' + v.my + '%;--roof:' + (v.color || '#7c5cff') + '" ' +
        'title="' + esc(v.name) + (v.travel ? ' — 🚶 ' + v.travel + ' min' : '') + '">' +
        '<span class="ml-roof">' + v.icon + '</span>' +
        '<span class="ml-name">' + esc(v.name) + '</span>' +
        (here ? '<span class="ml-here">📍 Here</span>' : (v.travel ? '<span class="ml-travel">🚶 ' + v.travel + 'm</span>' : '')) +
      '</button>';
    }).join('');
    wrap.innerHTML =
      '<div class="town-head"><h2>🗺️ Sim Town</h2><p>Your neighborhood. Click a building to send your Sim there — trips cost in-game time.</p></div>' +
      '<div class="town-map" id="townMap">' +
        '<div class="road road-main"></div>' +
        '<div class="road road-top"></div>' +
        '<div class="road road-bottom"></div>' +
        '<div class="road road-left"></div>' +
        '<div class="road road-right"></div>' +
        '<div class="map-deco t1">🌲</div><div class="map-deco t2">🌲</div><div class="map-deco t3">🌳</div>' +
        '<div class="map-deco t4">🌊</div><div class="map-deco t5">🌲</div>' +
        buildings +
      '</div>';
    $$('.map-lot', wrap).forEach((b) => b.addEventListener('click', () => travelTo(b.dataset.id)));
  }

  function travelTo(venueId) {
    if (venueId === state.location) { switchMode('live'); return; }
    const map = $('#townMap');
    const venues = LS.Locations.list();
    const fromV = venues.find((v) => v.id === state.location);
    const toV = venues.find((v) => v.id === venueId);
    if (map && fromV && toV) {
      map.querySelectorAll('.traveler').forEach((t) => t.remove());
      map.classList.add('travelling');
      const m = document.createElement('div');
      m.className = 'traveler';
      m.textContent = '🚶';
      m.style.left = fromV.mx + '%'; m.style.top = fromV.my + '%';
      map.appendChild(m);
      void m.offsetWidth; // reflow so the transition animates
      m.style.left = toV.mx + '%'; m.style.top = toV.my + '%';
      fx('select');
      setTimeout(() => doTravel(venueId), 1150);
      return;
    }
    doTravel(venueId);
  }

  function doTravel(venueId) {
    // stop whatever the Sim was doing
    LS.Clock.clearQueue();
    sim.action = null; sim.path = []; sim.moving = false;

    let info;
    if (venueId === 'home') {
      state.lot = homeLot;
      state.location = 'home';
      info = { name: 'Home', travel: 20 };
      const sp = LS.Movement.spawnTile(state);
      sim.tile = { x: sp.x, y: sp.y };
    } else {
      const lot = LS.Locations.makeLot(venueId);
      if (!lot) { toast('Unknown place', 'error'); return; }
      state.lot = lot;
      state.location = venueId;
      info = LS.Locations.info(venueId);
      const sp = LS.Locations.spawnFor(venueId);
      sim.tile = { x: sp.x, y: sp.y };
    }
    sim.px = sim.tile.x; sim.py = sim.tile.y; sim.path = [];
    LS.Movement.ensureSimTile(state, sim);
    if (info.travel) LS.Clock.advance(info.travel); // travel costs time

    switchMode('live'); // re-renders the new lot, fitted to the view
    updateAll();        // refresh clock/needs/panels immediately on arrival
    toast('Arrived at ' + (info.name || venueId), 'success');
    logEvent('🚶', 'Traveled to <b>' + esc(info.name || venueId) + '</b>');
    fx('select');
    save();
  }

  // ================================================================
  // CAREER MODE
  // ================================================================
  function renderCareer() {
    const wrap = $('#careerWrap');
    const ci = LS.Careers.info(sim);
    let html = '';
    if (ci) {
      html += '<div class="career-current">' +
        '<div class="cc-head"><div class="cc-ic">' + ci.icon + '</div>' +
          '<div class="cc-info"><b>' + ci.title + '</b><small>' + ci.trackLabel + ' · Level ' + (ci.level + 1) + '/' + LS.CAREERS[ci.track].levels.length + '</small></div></div>' +
        '<div class="cc-stats">' +
          '<div class="cc-stat"><small>Salary</small><b>₱' + ci.salary + '</b></div>' +
          '<div class="cc-stat"><small>Performance</small><b>' + Math.round(ci.performance) + '%</b></div>' +
          '<div class="cc-stat"><small>Days Worked</small><b>' + ci.daysWorked + '</b></div></div>' +
        '<div class="cc-stats" style="margin-top:10px">' +
          '<div class="cc-stat"><small>' + LS.SKILL_META[ci.reqSkill].label + '</small><b>Lvl ' + ci.reqSkillLevel + '</b></div>' +
          '<div class="cc-stat"><small>Next</small><b>' + (ci.nextTitle || '—') + '</b></div>' +
          '<div class="cc-stat"><small>Next Salary</small><b>' + (ci.nextSalary ? '₱' + ci.nextSalary : '—') + '</b></div></div>' +
        '<div class="cc-actions">' +
          '<button class="btn btn-primary" onclick="window._gameWork()">Work Now</button>' +
          '<button class="btn ' + (ci.canPromote ? 'btn-primary' : 'btn-ghost') + '" ' + (ci.canPromote ? '' : 'disabled') + ' onclick="window._gamePromote()">Promote</button>' +
          '<button class="btn btn-danger" onclick="window._gameQuit()">Quit Job</button></div></div>';
    } else {
      html += '<div class="career-current"><p style="color:var(--text-dim)">You\'re unemployed. Pick a career below to get hired — raise its skill to climb the ladder.</p></div>';
    }
    const list = LS.Careers.list(sim);
    html += '<h3 class="career-h">Available Careers</h3><div class="career-list">' + list.map((c) =>
      '<div class="career-card ' + (c.current ? 'current' : '') + ' ' + (!c.eligible ? 'cant' : '') + '" data-track="' + c.track + '">' +
        '<div class="ccard-ic">' + c.icon + '</div><b>' + c.label + '</b>' +
        '<small>Skill: ' + c.reqSkillLabel + '</small><br/><small>Top: ' + c.topTitle + ' (₱' + c.topSalary + ')</small>' +
        (c.current ? '<small style="color:var(--accent);display:block;margin-top:4px">Current</small>' : '') +
      '</div>'
    ).join('') + '</div>';
    wrap.innerHTML = html;
    $$('.career-card', wrap).forEach((card) => {
      card.addEventListener('click', () => {
        if (card.classList.contains('cant') || card.classList.contains('current')) return;
        const res = LS.Careers.join(sim, card.dataset.track);
        toast(res.msg, res.ok ? 'success' : 'error');
        if (res.ok) { fx('select'); LS.Clock.notifyQuest('get_hired', 1); save(); renderCareer(); updateTop(); }
        else fx('error');
      });
    });
  }

  window._gameWork = doWorkNow;
  window._gamePromote = function () {
    const res = LS.Careers.promote(sim);
    toast(res.msg, res.ok ? 'success' : 'error');
    if (res.ok) {
      if (LS.Emotions) LS.Emotions.add(sim, 'successful');
      LS.Economy.earn(state, sim, 40, 'Promotion: ' + res.title);
      LS.Clock.notifyQuest('first_promo', 1);
      LS.Clock.checkLifeMilestones();
      fx('levelup'); rewardBurst(40, 'Promotion!');
      save(); renderCareer(); updateTop();
    } else fx('error');
  };
  window._gameQuit = function () {
    if (!confirm('Quit your job?')) return;
    const res = LS.Careers.quit(sim);
    toast(res.msg); save(); renderCareer(); updateTop();
  };

  // ================================================================
  // SOCIAL MODE
  // ================================================================
  function householdHtml() {
    const sp = LS.Life.stageProgress(sim, state.time.day);
    const sm = LS.Life.stageMeta(sp.stage);
    let h = '<div class="household"><div class="hh-self">' +
      '<span class="hh-ic">' + sm.icon + '</span>' +
      '<div class="hh-self-info"><b>' + esc(sim.name) + '</b><small>' + sm.label + ' · age ' + sim.age + '</small>' +
      '<div class="hh-bar" title="Progress to next life stage"><span style="width:' + Math.round(sp.progress * 100) + '%"></span></div></div></div>';
    if (sim.partner) {
      const p = sim.partner;
      h += '<div class="hh-partner">' +
        '<div class="npc-avatar" style="border-color:' + p.outfitColor + '"><div class="na-hair" style="background:' + p.hairColor + '"></div><div class="na-head" style="background:' + p.skinTone + '"></div><div class="na-body" style="background:' + p.outfitColor + '"></div></div>' +
        '<div class="hh-partner-info"><b>' + esc(p.name) + '</b><small>' + (p.married ? '💍 Married' : '💕 Moved in') + '</small></div>' +
        '<div class="hh-actions">' + (!p.married ? '<button class="btn btn-sm btn-primary" id="hhMarry">💍 Marry</button>' : '') + '<button class="btn btn-sm btn-ghost" id="hhBaby">👶 Baby</button></div></div>';
    } else {
      h += '<div class="hh-hint">No partner yet — reach <b>Partner</b> (90+) with someone below, then “Move In”.</div>';
    }
    if ((sim.children || []).length) {
      h += '<div class="hh-kids">' + sim.children.map((c) => {
        const cm = LS.Life.childStageMeta(c.stage);
        return '<div class="hh-kid"><span>' + cm.icon + '</span><b>' + esc(c.name.split(' ')[0]) + '</b><small>' + cm.label + '</small></div>';
      }).join('') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderSocial() {
    LS.Relationships.ensureNPCs(state);
    const wrap = $('#socialWrap');
    const acts = LS.Relationships.INTERACTIONS;
    const list = state.npcs.map((npc) => {
      const r = sim.relationships.find((x) => x.id === npc.id);
      const score = r ? r.score : 0;
      const tier = r ? (r.tier || LS.Relationships.tier(score).label) : 'Stranger';
      const isRomance = r && r.type === 'romance';
      const canMoveIn = score >= 90 && !sim.partner;
      return '<div class="npc-card">' +
        '<div class="npc-avatar" style="border-color:' + npc.outfitColor + '">' +
          '<div class="na-hair" style="background:' + npc.hairColor + '"></div>' +
          '<div class="na-head" style="background:' + npc.skinTone + '"></div>' +
          '<div class="na-body" style="background:' + npc.outfitColor + '"></div></div>' +
        '<div class="npc-info"><b>' + esc(npc.name) + '</b>' +
          '<small>' + (isRomance ? '💗 ' : '') + tier + ' · ' + Math.round(score) + '/100</small>' +
          '<div class="rel-bar"><span style="width:' + score + '%"></span></div></div>' +
        '<div class="npc-actions">' +
          Object.keys(acts).map((k) => {
            const a = acts[k];
            const locked = score < a.reqScore;
            return '<button class="npc-act" title="' + a.label + (locked ? ' (locked)' : '') + (a.cost ? ' ₱' + a.cost : '') + '" data-npc="' + npc.id + '" data-act="' + k + '" ' + (locked ? 'disabled' : '') + '>' + a.icon + '</button>';
          }).join('') +
          (canMoveIn ? '<button class="npc-act movein" title="Ask to Move In" data-movein="' + npc.id + '">💕</button>' : '') +
        '</div></div>';
    }).join('');
    wrap.innerHTML = householdHtml() + '<div class="side-title" style="margin-top:4px">People in town</div>' + list;

    const mb = $('#hhMarry');
    if (mb) mb.addEventListener('click', () => { LS.Life.marry(sim); toast('💍 You got married!', 'success'); fx('reward'); if (LS.FX) LS.FX.confetti(); save(); renderSocial(); });
    const bb = $('#hhBaby');
    if (bb) bb.addEventListener('click', () => {
      const r = LS.Life.tryForBaby(sim, state);
      toast(r.ok ? '👶 Welcome, ' + r.child.name.split(' ')[0] + '!' : r.msg, r.ok ? 'success' : 'error');
      if (r.ok) { fx('reward'); if (LS.FX) LS.FX.confetti(); presentLotKey = null; save(); if (state.location === 'home') buildLot(); renderSocial(); }
    });
    $$('.npc-act.movein', wrap).forEach((btn) => btn.addEventListener('click', () => {
      const npc = state.npcs.find((n) => n.id === btn.dataset.movein);
      if (!npc) return;
      LS.Life.moveIn(sim, npc);
      toast('💕 ' + npc.name.split(' ')[0] + ' moved in with you!', 'success');
      fx('reward'); if (LS.FX) LS.FX.confetti();
      presentLotKey = null; save(); if (state.location === 'home') buildLot(); renderSocial();
    }));
    $$('.npc-act:not(.movein)', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = LS.Relationships.interact(sim, btn.dataset.npc, btn.dataset.act, state);
        toast(res.msg, res.ok ? 'success' : 'error');
        if (res.ok) {
          fx('social');
          if (res.score >= 50) LS.Clock.notifyQuest('make_friend', 1);
          if (res.score >= 90) {
            const r = LS.Economy.rewardMilestoneOnce(state, sim, 'partner', 'Found a partner', 'partner');
            if (r.amount > 0) { rewardBurst(r.amount, 'Found a Partner!'); fx('reward'); }
          } else if (res.score >= 50) {
            const r = LS.Economy.rewardMilestoneOnce(state, sim, 'first_friend', 'Made a friend', 'first_friend');
            if (r.amount > 0) { rewardBurst(r.amount, 'New Friend!'); fx('reward'); }
          }
          LS.Clock.checkLifeMilestones();
          save(); renderSocial(); updateTop();
        } else fx('error');
      });
    });
  }

  // ================================================================
  // SKILLS MODE
  // ================================================================
  function renderSkills() {
    const wrap = $('#skillsWrap');
    wrap.innerHTML = LS.SKILLS.map((k) => {
      const meta = LS.SKILL_META[k];
      const s = sim.skills[k];
      const prog = LS.Skills.progress(sim, k);
      const dots = Array.from({ length: 10 }, (_, i) => '<span class="skill-dot ' + (i < s.level ? 'on' : '') + '"></span>').join('');
      return '<div class="skill-card">' +
        '<div class="skill-head"><div class="skill-ic">' + meta.icon + '</div>' +
          '<div><b>' + meta.label + '</b><small>' + LS.Skills.rankLabel(s.level) + ' · ' + LS.CAREERS[meta.career].label + '</small></div></div>' +
        '<div class="skill-level">Lv ' + s.level + '/10<div class="skill-dots">' + dots + '</div></div>' +
        '<div class="skill-xp"><span style="width:' + (prog * 100) + '%"></span></div>' +
        '<button class="skill-practice" data-skill="' + k + '">📈 Practice (30 min)</button></div>';
    }).join('');
    $$('.skill-practice', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        const sk = btn.dataset.skill;
        LS.Clock.queueAction({ id: 'practice_' + sk, label: 'Practice ' + LS.SKILL_META[sk].label, icon: '📈', duration: 30, kind: 'practice', skill: sk });
        toast('Practicing ' + LS.SKILL_META[sk].label + '…'); fx('select');
      });
    });
  }

  // ================================================================
  // INIT
  // ================================================================
  function setupVisitMode() {
    document.body.classList.add('visiting');
    // only the Live view makes sense when visiting someone else's home
    $$('.mode-tab').forEach((t) => { if (t.dataset.mode !== 'live') t.style.display = 'none'; });
    const host = (state.player && state.player.name) || (sim && sim.name) || 'Player';
    const stage = $('#stage-live');
    if (stage) {
      const banner = document.createElement('div');
      banner.className = 'visit-banner';
      banner.innerHTML = "👋 You're visiting <b>" + esc(host) + "</b>'s home" +
        '<a href="dashboard.html" class="btn btn-ghost btn-sm">← Leave</a>';
      stage.insertBefore(banner, stage.firstChild);
    }
    toast("Visiting " + host + "'s home — look around!", 'success');
  }

  function init() {
    if (visiting) {
      if (!sim) { location.href = 'dashboard.html'; return; }
    } else {
      ensureSim();
    }
    if (LS.FX) LS.FX.setSound(state.player.settings.sound);

    if (!visiting) giveStarterHome();
    homeLot = state.lot; // remember the persistent home lot for travel/save
    buildAll();

    $$('.mode-tab').forEach((t) => t.addEventListener('click', () => switchMode(t.dataset.mode)));
    if (visiting) setupVisitMode();

    setInterval(() => { if (state.player.settings.autosave) save(); }, 15000);
    window.addEventListener('beforeunload', save);

    // re-fit the world when the window resizes
    let _resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeT);
      _resizeT = setTimeout(() => {
        if ($('#stage-live').classList.contains('active')) buildLot();
        else if ($('#stage-build').classList.contains('active')) renderBuildLot();
      }, 150);
    });

    LS.Clock.start(state, sim, updateAll, onEvent);

    updateAll();
    // re-fit once the flex layout has fully settled
    setTimeout(() => { if ($('#stage-live').classList.contains('active')) buildLot(); }, 90);
    logEvent('🎮', 'Loaded <b>' + esc(sim.name) + '</b>');
    logEvent('🏠', 'Starter home furnished — click furniture to interact!');
    toast('Welcome! Your Sim walks to objects — click furniture or use Quick Actions.', 'success');
  }

  async function boot() {
    if (visiting) {
      let world = null;
      try { world = await LS.Cloud.getWorld(visitId); } catch (e) { world = null; }
      if (!world) { location.href = 'dashboard.html'; return; }
      state = world;
      if (!state.quests || !state.quests.length) state.quests = LS.defaultQuests();
      if (!state.player) state.player = structuredClone(LS.DEFAULT_STATE.player);
      if (!state.player.settings) state.player.settings = { sound: true, freeWill: true };
      state.player.settings.freeWill = true; // host lives autonomously while you watch
      sim = (state.sims && (state.sims.find((s) => s.id === state.activeSimId) || state.sims[0])) || null;
    } else {
      state = LS.load();
      if (!state.quests || !state.quests.length) state.quests = LS.defaultQuests();
      simId = params.get('sim') || state.activeSimId;
      sim = state.sims.find((s) => s.id === simId) || state.sims[0];
    }
    init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
