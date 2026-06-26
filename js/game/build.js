/* ============================================================
   LifeSim — Build & Buy System
   Furniture catalog, placement on a grid lot, sell, lot value.
   Furniture provides need bonuses (e.g., bed → energy).
   Attaches to window.LifeSim.Build.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Furniture catalog. category: needs it satisfies when used.
  // effects are applied when the Sim USES the object via an action.
  const CATALOG = [
    // Beds
    { id: 'bed_single',  name: 'Single Bed',     icon: '🛏️', cat: 'bed',     cost: 250, size: {w:1,h:2}, effect: { energy: 85 }, mood: 'rest' },
    { id: 'bed_double',  name: 'Double Bed',     icon: '🛏️', cat: 'bed',     cost: 480, size: {w:2,h:2}, effect: { energy: 95, comfort: 15 }, mood: 'rest' },
    // Food
    { id: 'fridge',      name: 'Refrigerator',   icon: '🧊', cat: 'food',    cost: 300, size: {w:1,h:1}, effect: { hunger: 40 }, mood: 'cook' },
    { id: 'stove',       name: 'Stove',          icon: '🔥', cat: 'food',    cost: 420, size: {w:1,h:1}, effect: { hunger: 70 }, mood: 'cook', skill: 'cooking' },
    { id: 'microwave',   name: 'Microwave',      icon: '🍲', cat: 'food',    cost: 150, size: {w:1,h:1}, effect: { hunger: 50 }, mood: 'cook' },
    // Bathroom
    { id: 'toilet',      name: 'Toilet',         icon: '🚽', cat: 'bath',    cost: 180, size: {w:1,h:1}, effect: { bladder: 90 }, mood: 'toilet' },
    { id: 'shower',      name: 'Shower',         icon: '🚿', cat: 'bath',    cost: 350, size: {w:1,h:1}, effect: { hygiene: 85 }, mood: 'shower' },
    { id: 'sink',        name: 'Sink',           icon: '🚰', cat: 'bath',    cost: 120, size: {w:1,h:1}, effect: { hygiene: 30, bladder: 20 }, mood: 'wash' },
    // Comfort / social
    { id: 'sofa',        name: 'Sofa',           icon: '🛋️', cat: 'comfort', cost: 280, size: {w:2,h:1}, effect: { comfort: 35, energy: 15 }, mood: 'relax' },
    { id: 'armchair',    name: 'Armchair',       icon: '🪑', cat: 'comfort', cost: 140, size: {w:1,h:1}, effect: { comfort: 28 }, mood: 'relax' },
    // Fun
    { id: 'tv',          name: 'Television',     icon: '📺', cat: 'fun',     cost: 320, size: {w:2,h:1}, effect: { fun: 55, comfort: 10 }, mood: 'tv' },
    { id: 'pc',          name: 'Computer',       icon: '🖥️', cat: 'fun',     cost: 600, size: {w:1,h:1}, effect: { fun: 45 }, mood: 'pc', skill: 'programming' },
    { id: 'games',       name: 'Game Console',   icon: '🎮', cat: 'fun',     cost: 400, size: {w:1,h:1}, effect: { fun: 65, social: 10 }, mood: 'play' },
    { id: 'bookshelf',   name: 'Bookshelf',      icon: '📚', cat: 'fun',     cost: 200, size: {w:2,h:1}, effect: { fun: 30 }, mood: 'read', skill: 'logic' },
    // Skill objects
    { id: 'easel',       name: 'Easel',          icon: '🎨', cat: 'skill',   cost: 250, size: {w:1,h:1}, effect: { fun: 20 }, mood: 'paint', skill: 'painting' },
    { id: 'piano',       name: 'Piano',          icon: '🎹', cat: 'skill',   cost: 800, size: {w:2,h:1}, effect: { fun: 30 }, mood: 'music', skill: 'music' },
    { id: 'treadmill',   name: 'Treadmill',      icon: '🏃', cat: 'skill',   cost: 450, size: {w:1,h:1}, effect: { fun: 10 }, mood: 'workout', skill: 'fitness' },
    { id: 'desk',        name: 'Writing Desk',   icon: '🖊️', cat: 'skill',   cost: 220, size: {w:2,h:1}, effect: { fun: 15 }, mood: 'write', skill: 'writing' },
    // Decor (room need)
    { id: 'plant',       name: 'Houseplant',     icon: '🪴', cat: 'decor',   cost: 60,  size: {w:1,h:1}, effect: { room: 12 }, mood: 'decor', passive: true },
    { id: 'painting',    name: 'Painting',       icon: '🖼️', cat: 'decor',   cost: 120, size: {w:1,h:1}, effect: { room: 14 }, mood: 'decor', passive: true },
    { id: 'lamp',        name: 'Floor Lamp',     icon: '💡', cat: 'decor',   cost: 50,  size: {w:1,h:1}, effect: { room: 8 }, mood: 'decor', passive: true },
    { id: 'rug',         name: 'Rug',            icon: '🟫', cat: 'decor',   cost: 90,  size: {w:2,h:2}, effect: { room: 16, comfort: 6 }, mood: 'decor', passive: true },
    { id: 'fireplace',   name: 'Fireplace',      icon: '🔥', cat: 'decor',   cost: 340, size: {w:2,h:1}, effect: { room: 20, comfort: 10 }, mood: 'decor', passive: true },
    { id: 'aquarium',    name: 'Aquarium',       icon: '🐠', cat: 'decor',   cost: 280, size: {w:2,h:1}, effect: { room: 18, fun: 8 }, mood: 'decor', passive: true },
    // More kitchen
    { id: 'coffee',      name: 'Coffee Maker',   icon: '☕', cat: 'food',    cost: 130, size: {w:1,h:1}, effect: { energy: 35, hunger: 10 }, mood: 'coffee' },
    { id: 'dining',      name: 'Dining Table',   icon: '🍽️', cat: 'food',    cost: 240, size: {w:2,h:1}, effect: { hunger: 35, comfort: 12, social: 8 }, mood: 'cook' },
    // More bathroom
    { id: 'bathtub',     name: 'Bathtub',        icon: '🛁', cat: 'bath',    cost: 420, size: {w:2,h:1}, effect: { hygiene: 95, comfort: 18 }, mood: 'shower' },
    // More comfort
    { id: 'recliner',    name: 'Recliner',       icon: '💺', cat: 'comfort', cost: 220, size: {w:1,h:1}, effect: { comfort: 40, energy: 18 }, mood: 'relax' },
    // More fun
    { id: 'chess',       name: 'Chess Table',    icon: '♟️', cat: 'fun',     cost: 180, size: {w:1,h:1}, effect: { fun: 30, social: 8 }, mood: 'read', skill: 'logic' },
    { id: 'dartboard',   name: 'Dartboard',      icon: '🎯', cat: 'fun',     cost: 150, size: {w:1,h:1}, effect: { fun: 38 }, mood: 'play' },
    // More skill
    { id: 'guitar',      name: 'Guitar',         icon: '🎸', cat: 'skill',   cost: 320, size: {w:1,h:1}, effect: { fun: 28 }, mood: 'music', skill: 'music' },
    { id: 'weights',     name: 'Weight Bench',   icon: '🏋️', cat: 'skill',   cost: 380, size: {w:2,h:1}, effect: { fun: 8 }, mood: 'workout', skill: 'fitness' },
    { id: 'workbench',   name: 'Workbench',      icon: '🛠️', cat: 'skill',   cost: 300, size: {w:2,h:1}, effect: { fun: 12 }, mood: 'tinker', skill: 'handiness' },
    { id: 'garden',      name: 'Garden Planter', icon: '🌻', cat: 'skill',   cost: 160, size: {w:2,h:1}, effect: { fun: 14, room: 8 }, mood: 'garden', skill: 'gardening' },
    // --- extra furniture (more variety) ---
    { id: 'bunk',        name: 'Bunk Bed',       icon: '🛌', cat: 'bed',     cost: 360, size: {w:1,h:2}, effect: { energy: 88 }, mood: 'rest' },
    { id: 'kingbed',     name: 'King Bed',       icon: '🛏️', cat: 'bed',     cost: 700, size: {w:2,h:2}, effect: { energy: 100, comfort: 25 }, mood: 'rest' },
    { id: 'juicer',      name: 'Juice Bar',      icon: '🥤', cat: 'food',    cost: 200, size: {w:1,h:1}, effect: { hunger: 30, fun: 10 }, mood: 'cook' },
    { id: 'grill',       name: 'BBQ Grill',      icon: '🍖', cat: 'food',    cost: 280, size: {w:1,h:1}, effect: { hunger: 75 }, mood: 'cook', skill: 'cooking' },
    { id: 'doublesink',  name: 'Double Sink',    icon: '🚰', cat: 'bath',    cost: 190, size: {w:2,h:1}, effect: { hygiene: 40, bladder: 25 }, mood: 'wash' },
    { id: 'loveseat',    name: 'Loveseat',       icon: '🛋️', cat: 'comfort', cost: 200, size: {w:2,h:1}, effect: { comfort: 32, social: 6 }, mood: 'relax' },
    { id: 'beanbag',     name: 'Bean Bag',       icon: '🟣', cat: 'comfort', cost: 90,  size: {w:1,h:1}, effect: { comfort: 22, fun: 8 }, mood: 'relax' },
    { id: 'arcade',      name: 'Arcade Machine', icon: '🕹️', cat: 'fun',     cost: 520, size: {w:1,h:1}, effect: { fun: 70 }, mood: 'play' },
    { id: 'pooltable',   name: 'Pool Table',     icon: '🎱', cat: 'fun',     cost: 480, size: {w:2,h:2}, effect: { fun: 50, social: 12 }, mood: 'play' },
    { id: 'telescope',   name: 'Telescope',      icon: '🔭', cat: 'skill',   cost: 340, size: {w:1,h:1}, effect: { fun: 18 }, mood: 'read', skill: 'logic' },
    { id: 'sewing',      name: 'Sewing Machine', icon: '🧵', cat: 'skill',   cost: 240, size: {w:1,h:1}, effect: { fun: 12 }, mood: 'tinker', skill: 'creativity' },
    { id: 'mirror',      name: 'Wall Mirror',    icon: '🪞', cat: 'decor',   cost: 110, size: {w:1,h:1}, effect: { room: 12 }, mood: 'decor', passive: true },
    { id: 'statue',      name: 'Marble Statue',  icon: '🗿', cat: 'decor',   cost: 260, size: {w:1,h:1}, effect: { room: 22 }, mood: 'decor', passive: true },
    { id: 'window',      name: 'Bay Window',     icon: '🪟', cat: 'decor',   cost: 180, size: {w:2,h:1}, effect: { room: 16 }, mood: 'decor', passive: true },
    { id: 'chandelier',  name: 'Chandelier',     icon: '💎', cat: 'decor',   cost: 320, size: {w:1,h:1}, effect: { room: 24 }, mood: 'decor', passive: true }
  ];

  // OPTIONAL: drop-in spritemap art. Set a `sprite` URL on any catalog item
  // above (e.g. sprite: 'assets/sprites/bed.png') and the renderer will use it
  // instead of the emoji — no code changes needed. See assets/sprites/README.

  const CATEGORIES = {
    bed:     { label: 'Beds & Sleep',  icon: '🛏️' },
    food:    { label: 'Kitchen',       icon: '🍳' },
    bath:    { label: 'Bathroom',      icon: '🚿' },
    comfort: { label: 'Comfort',       icon: '🛋️' },
    fun:     { label: 'Entertainment', icon: '🎮' },
    skill:   { label: 'Skill Building',icon: '📈' },
    decor:   { label: 'Decor',         icon: '🪴' }
  };

  function byId(id) {
    return CATALOG.find((c) => c.id === id);
  }

  // Initialize an empty lot tile grid (marking any interior walls as blocked)
  function initLot(state) {
    const { w, h } = state.lot.size;
    state.lot.tiles = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(null);
      state.lot.tiles.push(row);
    }
    (state.lot.walls || []).forEach((wll) => {
      if (state.lot.tiles[wll.y] && wll.x < w) state.lot.tiles[wll.y][wll.x] = 'WALL';
    });
    state.lot.furniture = [];
    state.lot.value = 0;
  }

  function ensureLot(state) {
    if (!state.lot.tiles || !state.lot.tiles.length) initLot(state);
    // stamp interior walls onto any empty tile (handles saves made before
    // walls existed, without disturbing already-placed furniture)
    (state.lot.walls || []).forEach((wll) => {
      const row = state.lot.tiles[wll.y];
      if (row && wll.x < row.length && row[wll.x] == null) row[wll.x] = 'WALL';
    });
  }

  // Check whether an item fits at (x,y) without overlap
  function canPlace(state, item, x, y) {
    const { w, h } = item.size;
    const grid = state.lot.tiles;
    if (y + h > grid.length) return false;
    if (x + w > grid[0].length) return false;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (grid[y + yy][x + xx]) return false;
      }
    }
    return true;
  }

  // Instantiate a placed furniture object and stamp it onto the grid.
  function placeItem(state, item, x, y) {
    const placed = {
      uid: LS.uid(),
      id: item.id,
      name: item.name,
      icon: item.icon,
      sprite: item.sprite || null,   // optional spritemap URL (drop-in art)
      cat: item.cat,
      cost: item.cost,
      size: { ...item.size },
      effect: item.effect ? { ...item.effect } : null,
      mood: item.mood || null,
      skill: item.skill || null,
      passive: !!item.passive,
      x, y
    };
    for (let yy = 0; yy < item.size.h; yy++) {
      for (let xx = 0; xx < item.size.w; xx++) {
        state.lot.tiles[y + yy][x + xx] = placed.uid;
      }
    }
    state.lot.furniture.push(placed);
    state.lot.value += item.cost;
    return placed;
  }

  // Buy & place an item directly (charges the Sim).
  function buy(state, sim, itemId, x, y) {
    ensureLot(state);
    const item = byId(itemId);
    if (!item) return { ok: false, msg: 'Unknown item' };
    if (sim.money < item.cost) return { ok: false, msg: 'Not enough Plumbucks' };
    if (!canPlace(state, item, x, y)) return { ok: false, msg: 'Cannot place there' };
    sim.money -= item.cost;
    const placed = placeItem(state, item, x, y);
    return { ok: true, msg: `Bought ${item.name} for ₱${item.cost}`, placed };
  }

  // Shop: buy an item into the player's inventory (to place later in Build).
  function buyToInventory(state, sim, itemId) {
    const item = byId(itemId);
    if (!item) return { ok: false, msg: 'Unknown item' };
    if (sim.money < item.cost) return { ok: false, msg: 'Not enough Plumbucks' };
    sim.money -= item.cost;
    if (!Array.isArray(state.inventory)) state.inventory = [];
    state.inventory.push(item.id);
    return { ok: true, msg: `Bought ${item.name} for ₱${item.cost}`, item };
  }

  // Build: place an item the player already owns (consumes one from inventory).
  function placeFromInventory(state, sim, itemId, x, y) {
    ensureLot(state);
    if (!Array.isArray(state.inventory)) state.inventory = [];
    const idx = state.inventory.indexOf(itemId);
    if (idx < 0) return { ok: false, msg: "You don't own that item" };
    const item = byId(itemId);
    if (!canPlace(state, item, x, y)) return { ok: false, msg: 'Cannot place there' };
    const placed = placeItem(state, item, x, y);
    state.inventory.splice(idx, 1);
    return { ok: true, msg: `Placed ${item.name}`, placed };
  }

  // Sell an item (half refund)
  function sell(state, sim, placedUid) {
    ensureLot(state);
    const idx = state.lot.furniture.findIndex((f) => f.uid === placedUid);
    if (idx < 0) return { ok: false, msg: 'Item not found' };
    const placed = state.lot.furniture[idx];
    const refund = Math.floor(placed.cost / 2);
    sim.money += refund;
    // clear tiles
    for (let yy = 0; yy < placed.size.h; yy++) {
      for (let xx = 0; xx < placed.size.w; xx++) {
        if (state.lot.tiles[placed.y + yy]) {
          state.lot.tiles[placed.y + yy][placed.x + xx] = null;
        }
      }
    }
    state.lot.furniture.splice(idx, 1);
    state.lot.value -= placed.cost;
    return { ok: true, msg: `Sold ${placed.name} for $${refund}`, refund };
  }

  // Find a furniture instance by uid
  function getInstance(state, uid) {
    return state.lot.furniture.find((f) => f.uid === uid);
  }

  // Total decor/style "environment" bonus that the lot passively provides.
  function envBonus(state) {
    let bonus = 30; // a base liveable amount
    state.lot.furniture.forEach((f) => {
      if (f.passive && f.effect && f.effect.room) bonus += f.effect.room;
    });
    const fs = LS.FLOOR_STYLES[state.lot.floor];
    const ws = LS.WALL_STYLES[state.lot.wall];
    if (fs) bonus += fs.envBonus * 2;
    if (ws) bonus += ws.envBonus * 2;
    return LS.clamp(bonus, 0, 100);
  }

  // Apply passive decor + style bonuses to the Room/Environment need.
  function applyPassives(sim, state) {
    const target = envBonus(state);
    // gradually nudge room need toward the environment cap
    sim.needs.room = LS.clamp(sim.needs.room + (target - sim.needs.room) * 0.02);
    // a beautifully decorated home is a small mood lift — granted on the
    // threshold crossing so its TTL can actually decay (no per-minute refresh)
    if (LS.Emotions) {
      const homey = target >= 75;
      if (homey && !sim._homey) LS.Emotions.add(sim, 'homey');
      else if (!homey && sim._homey) LS.Emotions.remove(sim, 'homey');
      sim._homey = homey;
    }
    LS.Needs.recomputeMood(sim);
  }

  // Moodlet granted by using each kind of object.
  const MOOD_MOODLET = {
    rest: 'rested', cook: 'satisfied', coffee: 'pumped', shower: 'clean',
    toilet: 'relieved', wash: 'clean', relax: 'comfy', tv: 'playful',
    pc: 'focused', play: 'playful', read: 'focused', paint: 'inspired',
    music: 'inspired', workout: 'pumped', write: 'inspired', tinker: 'focused',
    garden: 'comfy'
  };

  // Use a furniture object (returns effect to be applied by action system)
  function useEffect(sim, placed) {
    if (!placed.effect) return null;
    for (const k in placed.effect) {
      LS.Needs.satisfy(sim, k, placed.effect[k]);
    }
    // gain skill XP if the object trains a skill
    if (placed.skill) {
      LS.Skills.gainXP(sim, placed.skill, 14);
    }
    // emotional payoff from the activity
    if (LS.Emotions && placed.mood && MOOD_MOODLET[placed.mood]) {
      LS.Emotions.add(sim, MOOD_MOODLET[placed.mood]);
    }
    LS.Needs.recomputeMood(sim);
    return { applied: true, skill: placed.skill || null };
  }

  // ---- Floor & wall styling (cosmetic + small environment boost) ----
  function setFloor(state, sim, key) {
    const fs = LS.FLOOR_STYLES[key];
    if (!fs) return { ok: false, msg: 'Unknown floor' };
    if (state.lot.floor === key) return { ok: false, msg: 'Already applied' };
    if (sim.money < fs.cost) return { ok: false, msg: 'Not enough Plumbucks' };
    sim.money -= fs.cost;
    state.lot.floor = key;
    state.lot.value += fs.cost;
    return { ok: true, msg: `Flooring: ${fs.label}` };
  }

  function setWall(state, sim, key) {
    const ws = LS.WALL_STYLES[key];
    if (!ws) return { ok: false, msg: 'Unknown wall' };
    if (state.lot.wall === key) return { ok: false, msg: 'Already applied' };
    if (sim.money < ws.cost) return { ok: false, msg: 'Not enough Plumbucks' };
    sim.money -= ws.cost;
    state.lot.wall = key;
    state.lot.value += ws.cost;
    return { ok: true, msg: `Walls: ${ws.label}` };
  }

  // Toggle an interior wall at (x,y): add one on an empty tile, or remove an
  // existing wall. Furniture tiles can't become walls. Lets players carve rooms.
  function toggleWall(state, x, y) {
    ensureLot(state);
    if (!Array.isArray(state.lot.walls)) state.lot.walls = [];
    const row = state.lot.tiles[y];
    if (!row || x < 0 || x >= row.length) return { ok: false, msg: 'Out of bounds' };
    const cur = row[x];
    if (cur === 'WALL') {
      row[x] = null;
      state.lot.walls = state.lot.walls.filter((w) => !(w.x === x && w.y === y));
      return { ok: true, added: false };
    }
    if (cur) return { ok: false, msg: 'Tile is occupied' };
    row[x] = 'WALL';
    state.lot.walls.push({ x, y });
    return { ok: true, added: true };
  }

  function doorAt(state, x, y) {
    return (state.lot.doors || []).find((d) => d.x === x && d.y === y) || null;
  }

  // Toggle a door at (x,y). Cutting a door through a wall removes that wall
  // (doors are walkable). Removing a door leaves an open gap.
  function toggleDoor(state, x, y) {
    ensureLot(state);
    if (!Array.isArray(state.lot.doors)) state.lot.doors = [];
    if (doorAt(state, x, y)) {
      state.lot.doors = state.lot.doors.filter((d) => !(d.x === x && d.y === y));
      return { ok: true, added: false };
    }
    const row = state.lot.tiles[y];
    if (!row || x < 0 || x >= row.length) return { ok: false, msg: 'Out of bounds' };
    if (row[x] && row[x] !== 'WALL') return { ok: false, msg: 'Tile is occupied' };
    const isWall = (xx, yy) => state.lot.tiles[yy] && state.lot.tiles[yy][xx] === 'WALL';
    let o = 'h';
    if (isWall(x - 1, y) || isWall(x + 1, y)) o = 'h';
    else if (isWall(x, y - 1) || isWall(x, y + 1)) o = 'v';
    if (row[x] === 'WALL') {
      row[x] = null;
      state.lot.walls = (state.lot.walls || []).filter((w) => !(w.x === x && w.y === y));
    }
    state.lot.doors.push({ x, y, o });
    return { ok: true, added: true };
  }

  // Move an existing piece of furniture to a new origin (build mode).
  function move(state, placedUid, nx, ny) {
    ensureLot(state);
    const f = getInstance(state, placedUid);
    if (!f) return { ok: false, msg: 'Item not found' };
    // temporarily clear its tiles so it doesn't block itself
    for (let yy = 0; yy < f.size.h; yy++) {
      for (let xx = 0; xx < f.size.w; xx++) {
        if (state.lot.tiles[f.y + yy]) state.lot.tiles[f.y + yy][f.x + xx] = null;
      }
    }
    if (!canPlace(state, f, nx, ny)) {
      // restore original tiles
      for (let yy = 0; yy < f.size.h; yy++) {
        for (let xx = 0; xx < f.size.w; xx++) {
          state.lot.tiles[f.y + yy][f.x + xx] = f.uid;
        }
      }
      return { ok: false, msg: 'Cannot move there' };
    }
    f.x = nx; f.y = ny;
    for (let yy = 0; yy < f.size.h; yy++) {
      for (let xx = 0; xx < f.size.w; xx++) {
        state.lot.tiles[ny + yy][nx + xx] = f.uid;
      }
    }
    return { ok: true, msg: `Moved ${f.name}` };
  }

  // Group catalog by category for the buy menu
  function catalogByCategory() {
    const out = {};
    for (const k in CATEGORIES) out[k] = [];
    CATALOG.forEach((item) => {
      if (out[item.cat]) out[item.cat].push(item);
    });
    return out;
  }

  LS.Build = {
    CATALOG,
    CATEGORIES,
    byId,
    ensureLot,
    initLot,
    canPlace,
    buy,
    buyToInventory,
    placeFromInventory,
    placeItem,
    toggleWall,
    toggleDoor,
    doorAt,
    sell,
    move,
    getInstance,
    applyPassives,
    envBonus,
    useEffect,
    setFloor,
    setWall,
    catalogByCategory
  };
})();