/* ============================================================
   LifeSim — Cloud / Community (data layer)
   The "multiplayer" layer: a shared neighbourhood of players, each
   with their own house, that you can browse and visit.

     • If window.LIFESIM_CONFIG.cloudApi is set → REAL shared world
       (talks to the backend in /server). Everyone who joins sees
       the same players and can visit each other's real houses.
     • Otherwise → offline single-player with a SIMULATED community
       (locally generated neighbours), so the UI works with no server.

   The UI only calls listPlayers()/getWorld()/publish()/signIn(), so
   switching modes never touches the dashboard or game.
   Attaches to window.LifeSim.Cloud.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;
  const COMMUNITY_KEY = 'lifesim_community_v1'; // local simulated neighbours
  const IDENTITY_KEY = 'lifesim_identity_v1';   // {id, apiKey, name} for remote

  function apiBase() {
    const c = window.LIFESIM_CONFIG;
    return (c && c.cloudApi) ? String(c.cloudApi).replace(/\/+$/, '') : '';
  }
  function isRemote() { return !!apiBase(); }

  const NEIGHBOR_NAMES = [
    'Mia Chen', 'Noah Patel', 'Ava Rossi', 'Liam Bauer', 'Zoe Nakamura',
    'Ethan Clarke', 'Layla Khan', 'Oscar Moreno', 'Iris Lindqvist', 'Kai Okafor',
    'Nora Vasquez', 'Felix Brun', 'Maya Santos', 'Theo Walsh', 'Lena Park', 'Diego Marín'
  ];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ri = (n) => Math.floor(Math.random() * n);

  // ---- identity (remote) ----
  function me() { try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || null; } catch (e) { return null; } }
  function setMe(v) { try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(v)); } catch (e) { /* */ } }
  function signOut() { try { localStorage.removeItem(IDENTITY_KEY); } catch (e) { /* */ } }

  // ---- snapshots ----
  function activeSim(world) {
    if (!world.sims || !world.sims.length) return null;
    return world.sims.find((s) => s.id === world.activeSimId) || world.sims[0];
  }
  function houseOf(lot) {
    if (!lot) return null;
    return {
      size: lot.size, floor: lot.floor, wall: lot.wall, walls: lot.walls || [],
      furniture: (lot.furniture || []).map((f) => ({ x: f.x, y: f.y, size: f.size, cat: f.cat, id: f.id }))
    };
  }
  // Compact, render-everything snapshot of a world (for publishing / visiting).
  function worldSnapshot(state) {
    const sim = activeSim(state);
    return {
      player: { name: state.player.name, level: state.player.level },
      lot: state.lot,
      sims: sim ? [sim] : [],
      npcs: [],
      activeSimId: sim ? sim.id : null,
      time: state.time
    };
  }
  function summaryOf(state) {
    const sim = activeSim(state);
    return {
      name: state.player.name,
      sim: sim ? { skinTone: sim.skinTone, hairColor: sim.hairColor, outfitColor: sim.outfitColor } : null,
      houseValue: state.lot ? (state.lot.value || 0) : 0,
      furniture: state.lot ? (state.lot.furniture || []).length : 0,
      level: state.player.level || 1,
      house: houseOf(state.lot)
    };
  }

  /* ================= LOCAL (simulated) ================= */

  function readStore() { try { return JSON.parse(localStorage.getItem(COMMUNITY_KEY)) || null; } catch (e) { return null; } }
  function writeStore(o) { try { localStorage.setItem(COMMUNITY_KEY, JSON.stringify(o)); } catch (e) { /* */ } }

  function generateNeighborWorld(name) {
    const st = structuredClone(LS.DEFAULT_STATE);
    st.player = Object.assign({}, st.player, { name: name });
    const sim = LS.createSim({
      name: name, skinTone: pick(LS.SKIN_TONES), hairColor: pick(LS.HAIR_COLORS), outfitColor: pick(LS.OUTFIT_COLORS),
      traits: [pick(LS.TRAITS), pick(LS.TRAITS)].filter((v, i, a) => a.indexOf(v) === i),
      aspiration: pick(Object.keys(LS.ASPIRATIONS))
    });
    sim.money = 1000 + ri(6000);
    st.sims = [sim]; st.activeSimId = sim.id;
    st.lot.floor = pick(Object.keys(LS.FLOOR_STYLES));
    st.lot.wall = pick(Object.keys(LS.WALL_STYLES));
    LS.Build.ensureLot(st);
    const catalog = LS.Build.CATALOG;
    const count = 9 + ri(7);
    for (let i = 0; i < count; i++) {
      const item = pick(catalog);
      for (let t = 0; t < 10; t++) {
        const x = ri(st.lot.size.w - item.size.w + 1), y = ri(st.lot.size.h - item.size.h + 1);
        if (LS.Build.canPlace(st, item, x, y)) { LS.Build.placeItem(st, item, x, y); break; }
      }
    }
    LS.Movement.ensureSimTile(st, sim); sim.px = sim.tile.x; sim.py = sim.tile.y;
    return st;
  }

  function ensureSeeded(force) {
    let store = readStore();
    if (store && store.players && store.players.length && !force) return store;
    const names = NEIGHBOR_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    store = { players: names.map((n) => ({ id: 'npc_' + LS.uid(), world: generateNeighborWorld(n) })) };
    writeStore(store);
    return store;
  }
  function selfWorld() { return LS.load(); }

  function localSummary(id, state, isYou) {
    const s = summaryOf(state);
    return Object.assign({ id: id, isYou: !!isYou, online: isYou ? true : Math.random() < 0.6 }, s);
  }
  function listPlayersLocal() {
    const store = ensureSeeded();
    const out = [localSummary('you', selfWorld(), true)];
    store.players.forEach((p) => out.push(localSummary(p.id, p.world, false)));
    return out;
  }
  function getWorldLocal(id) {
    if (id === 'you') return selfWorld();
    const store = ensureSeeded();
    const p = store.players.find((x) => x.id === id);
    return p ? p.world : null;
  }

  /* ================= REMOTE (real backend) ================= */

  function apiUrl(path) { return apiBase() + '/api' + path; }
  async function apiGet(path) {
    const r = await fetch(apiUrl(path));
    if (!r.ok) throw new Error('GET ' + path + ' ' + r.status);
    return r.json();
  }
  async function apiPost(path, body, auth) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && me()) headers['x-api-key'] = me().apiKey;
    const r = await fetch(apiUrl(path), { method: 'POST', headers, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error('POST ' + path + ' ' + r.status);
    return r.json();
  }

  // ---- public, mode-agnostic API (all async) ----

  async function signIn(name) {
    if (!isRemote()) return null;
    const r = await apiPost('/register', { name: name });
    const ident = { id: r.id, apiKey: r.apiKey, name: r.name };
    setMe(ident);
    await publish(selfWorld()); // put your house on the shared map straight away
    return ident;
  }

  async function publish(state) {
    if (!isRemote() || !me()) return false;
    try {
      await apiPost('/world', { summary: summaryOf(state), world: worldSnapshot(state) }, true);
      return true;
    } catch (e) { return false; }
  }

  async function listPlayers() {
    if (!isRemote()) return listPlayersLocal();
    const data = await apiGet('/players');
    const myId = me() && me().id;
    return (data.players || []).map((p) => Object.assign({}, p, { isYou: p.id === myId }));
  }

  async function getWorld(id) {
    if (id === 'you') return selfWorld();
    if (!isRemote()) return getWorldLocal(id);
    try { const data = await apiGet('/world/' + encodeURIComponent(id)); return data.world; }
    catch (e) { return null; }
  }

  async function heartbeat() { if (isRemote() && me()) { try { await apiPost('/heartbeat', {}, true); } catch (e) { /* */ } } }

  /* ---- house preview (sync) — accepts a world, a summary, or a lot ---- */
  function housePreviewHTML(src, px) {
    px = px || 150;
    const lot = (src && src.lot) ? src.lot : (src && src.house) ? src.house : src;
    if (!lot || !lot.size) return '';
    const W = lot.size.w, H = lot.size.h;
    const cell = Math.floor(Math.min(px / W, (px * 0.66) / H));
    const fw = W * cell, fh = H * cell;
    const floorCol = (LS.FLOOR_STYLES[lot.floor] && LS.FLOOR_STYLES[lot.floor].color) || '#caa472';
    const wallCol = (LS.WALL_STYLES[lot.wall] && LS.WALL_STYLES[lot.wall].color) || '#3a3550';
    let inner = '';
    (lot.walls || []).forEach((w) => {
      inner += '<div style="position:absolute;left:' + (w.x * cell) + 'px;top:' + (w.y * cell) + 'px;width:' + cell + 'px;height:' + cell + 'px;background:' + wallCol + '"></div>';
    });
    (lot.furniture || []).forEach((f) => {
      const sp = (LS.SPRITES && f.id) ? LS.SPRITES[f.id] : null;
      if (sp) {
        const sw = sp.w * cell, sh = sp.h * cell;
        const left = f.x * cell + (f.size.w * cell - sw) / 2;
        const top = (f.y + f.size.h) * cell - sh;
        inner += '<img src="' + sp.src + '" style="position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + sw + 'px;height:' + sh + 'px;image-rendering:pixelated">';
      } else {
        inner += '<div style="position:absolute;left:' + (f.x * cell + 1) + 'px;top:' + (f.y * cell + 1) + 'px;width:' + (f.size.w * cell - 2) + 'px;height:' + (f.size.h * cell - 2) + 'px;background:' + catColor(f.cat) + ';border-radius:2px"></div>';
      }
    });
    return '<div class="house-preview" style="width:' + fw + 'px;height:' + fh + 'px;background:' + floorCol + '">' + inner + '</div>';
  }
  function catColor(cat) {
    return ({ bed: '#7c8cff', food: '#ff8a5c', bath: '#5cd0ff', comfort: '#5cffa6', fun: '#b65cff', skill: '#ffcf5c', decor: '#2ee6a6' })[cat] || '#9aa0ad';
  }

  /* ---- neighbourhood chat (real backend, or local demo when offline) ---- */
  const CHAT_KEY = 'lifesim_chat_v1';
  function readChatLocal() { try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || null; } catch (e) { return null; } }
  function writeChatLocal(a) { try { localStorage.setItem(CHAT_KEY, JSON.stringify(a.slice(-100))); } catch (e) { /* */ } }
  function seedChat() {
    const now = Date.now();
    return [
      { id: LS.uid(), name: 'Mia Chen',   text: 'anyone else grinding cooking today? 🍳', at: now - 720000 },
      { id: LS.uid(), name: 'Kai Okafor', text: 'gm plumtown ☀️', at: now - 540000 },
      { id: LS.uid(), name: 'Noah Patel', text: 'just got promoted to Engineer III, lets gooo', at: now - 300000 },
      { id: LS.uid(), name: 'Ava Rossi',  text: 'selling my old sofa cheap — come visit 🛋️', at: now - 120000 }
    ];
  }
  function chatLocal() { let a = readChatLocal(); if (!a) { a = seedChat(); writeChatLocal(a); } return a; }

  async function getChat(limit) {
    if (!isRemote()) return chatLocal();
    try { const d = await apiGet('/chat?limit=' + (limit || 50)); return d.messages || []; }
    catch (e) { return []; }
  }
  async function sendChat(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!text) return null;
    if (!isRemote() || !me()) {
      const a = chatLocal();
      const m = { id: LS.uid(), name: (selfWorld().player.name || 'You'), text: text, at: Date.now(), isYou: true };
      a.push(m); writeChatLocal(a); return m;
    }
    try { const r = await apiPost('/chat', { text: text }, true); return r.message || null; }
    catch (e) { return null; }
  }

  LS.Cloud = {
    isRemote, me, signIn, signOut, publish, heartbeat,
    listPlayers, getWorld,                 // async, mode-agnostic
    sendChat, getChat,                     // neighbourhood chat
    listPlayersLocal, getWorldLocal, ensureSeeded, selfWorld, generateNeighborWorld, // local/test
    housePreviewHTML, summaryOf, worldSnapshot
  };
})();
