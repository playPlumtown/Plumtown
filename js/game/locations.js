/* ============================================================
   LifeSim — Locations / Sim Town
   The Sim can travel from home to community venues (gym, park,
   cafe, library, mall, club). Each venue is a prefab lot the Sim
   walks around and uses, just like home. Only home is editable.
   Attaches to window.LifeSim.Locations.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // Venue definitions. `layout` is a list of catalog item ids + positions
  // that get instantiated for free each visit. floorHex/wallHex tint the lot.
  const VENUES = {
    gym: {
      name: 'FitZone Gym', icon: '🏋️', desc: 'Train Fitness & Athletics, then shower.',
      size: { w: 10, h: 8 }, floorHex: '#5f636e', wallHex: '#26304f', spawn: { x: 5, y: 6 }, travel: 35,
      mx: 41, my: 13, color: '#18d4ff', tags: ['fitness'],
      layout: [
        { id: 'treadmill', x: 1, y: 1 }, { id: 'treadmill', x: 2, y: 1 },
        { id: 'weights', x: 4, y: 1 }, { id: 'weights', x: 7, y: 1 },
        { id: 'juicer', x: 8, y: 4 }, { id: 'shower', x: 1, y: 6 }, { id: 'toilet', x: 8, y: 6 }
      ]
    },
    park: {
      name: 'Willow Park', icon: '🌳', desc: 'Relax, have Fun and meet people outdoors.',
      size: { w: 11, h: 8 }, floorHex: '#3f7d4f', wallHex: '#2c5a3a', spawn: { x: 5, y: 6 }, travel: 30,
      mx: 13, my: 72, color: '#2ee6a6', tags: ['fun', 'social'],
      layout: [
        { id: 'armchair', x: 1, y: 1 }, { id: 'armchair', x: 9, y: 1 },
        { id: 'garden', x: 4, y: 1 }, { id: 'plant', x: 2, y: 4 }, { id: 'plant', x: 8, y: 4 },
        { id: 'dartboard', x: 6, y: 6 }, { id: 'loveseat', x: 3, y: 6 }
      ]
    },
    cafe: {
      name: 'The Daily Grind', icon: '☕', desc: 'Coffee, food and good company.',
      size: { w: 9, h: 7 }, floorHex: '#8a5a3a', wallHex: '#5a3640', spawn: { x: 4, y: 5 }, travel: 25,
      mx: 43, my: 77, color: '#ffb454', tags: ['food', 'social'],
      layout: [
        { id: 'coffee', x: 1, y: 1 }, { id: 'fridge', x: 2, y: 1 }, { id: 'grill', x: 3, y: 1 },
        { id: 'dining', x: 4, y: 3 }, { id: 'dining', x: 1, y: 5 }, { id: 'toilet', x: 7, y: 5 }
      ]
    },
    library: {
      name: 'City Library', icon: '📚', desc: 'Study Logic, Writing and Programming.',
      size: { w: 10, h: 7 }, floorHex: '#6b5436', wallHex: '#43455a', spawn: { x: 5, y: 6 }, travel: 30,
      mx: 73, my: 16, color: '#b65cff', tags: ['logic', 'writing'],
      layout: [
        { id: 'bookshelf', x: 1, y: 1 }, { id: 'bookshelf', x: 3, y: 1 }, { id: 'bookshelf', x: 5, y: 1 },
        { id: 'desk', x: 2, y: 3 }, { id: 'desk', x: 6, y: 3 }, { id: 'pc', x: 8, y: 1 }, { id: 'chess', x: 8, y: 5 }
      ]
    },
    mall: {
      name: 'Maple Mall', icon: '🛍️', desc: 'Window-shop — open the Shop to buy furniture.',
      size: { w: 10, h: 7 }, floorHex: '#cfd4e0', wallHex: '#43455a', spawn: { x: 5, y: 6 }, travel: 30, shop: true,
      mx: 72, my: 75, color: '#00e0c6', tags: ['fun'],
      layout: [
        { id: 'sofa', x: 1, y: 1 }, { id: 'tv', x: 4, y: 1 }, { id: 'easel', x: 7, y: 1 },
        { id: 'piano', x: 1, y: 4 }, { id: 'arcade', x: 8, y: 4 }
      ]
    },
    club: {
      name: 'Neon Club', icon: '🪩', desc: 'Dance, games and Charisma.',
      size: { w: 9, h: 7 }, floorHex: '#2a2440', wallHex: '#3a2550', spawn: { x: 4, y: 5 }, travel: 35,
      mx: 85, my: 45, color: '#ff5c9d', tags: ['fun', 'social'],
      layout: [
        { id: 'games', x: 1, y: 1 }, { id: 'arcade', x: 3, y: 1 }, { id: 'pooltable', x: 6, y: 1 },
        { id: 'loveseat', x: 1, y: 4 }, { id: 'dartboard', x: 7, y: 4 }
      ]
    },
    school: {
      name: 'Sim Academy', icon: '🏫', desc: 'Study Logic, Writing & Charisma.',
      size: { w: 10, h: 7 }, floorHex: '#cdd2dc', wallHex: '#2e3a52', spawn: { x: 5, y: 6 }, travel: 30,
      mx: 55, my: 30, color: '#ffb454', tags: ['logic', 'charisma'],
      layout: [
        { id: 'bookshelf', x: 1, y: 1 }, { id: 'bookshelf', x: 3, y: 1 }, { id: 'bookshelf', x: 5, y: 1 },
        { id: 'desk', x: 2, y: 3 }, { id: 'desk', x: 6, y: 3 }, { id: 'pc', x: 8, y: 1 }, { id: 'chess', x: 8, y: 4 }
      ]
    },
    hospital: {
      name: 'Sim General', icon: '🏥', desc: 'Rest, recover and freshen up.',
      size: { w: 10, h: 7 }, floorHex: '#e2e8ea', wallHex: '#3a4a55', spawn: { x: 5, y: 6 }, travel: 35,
      mx: 60, my: 60, color: '#5cffa6', tags: ['energy', 'hygiene'],
      layout: [
        { id: 'bed_single', x: 1, y: 1 }, { id: 'bed_single', x: 3, y: 1 }, { id: 'bed_single', x: 5, y: 1 },
        { id: 'doublesink', x: 7, y: 1 }, { id: 'plant', x: 1, y: 5 }, { id: 'plant', x: 8, y: 5 }, { id: 'toilet', x: 9, y: 1 }
      ]
    },
    restaurant: {
      name: 'Bella Notte', icon: '🍽️', desc: 'Fine dining and great conversation.',
      size: { w: 9, h: 7 }, floorHex: '#6b4630', wallHex: '#4a2d28', spawn: { x: 4, y: 6 }, travel: 30,
      mx: 28, my: 44, color: '#ff8a5c', tags: ['food', 'social'],
      layout: [
        { id: 'grill', x: 1, y: 1 }, { id: 'fridge', x: 2, y: 1 }, { id: 'coffee', x: 3, y: 1 },
        { id: 'dining', x: 5, y: 2 }, { id: 'dining', x: 5, y: 4 }, { id: 'dining', x: 1, y: 4 }
      ]
    },
    beach: {
      name: 'Sunset Beach', icon: '🏖️', desc: 'Sun, fun and a relaxing day out.',
      size: { w: 11, h: 8 }, floorHex: '#d8c08a', wallHex: '#3a6a8a', spawn: { x: 5, y: 6 }, travel: 40,
      mx: 90, my: 86, color: '#18d4ff', tags: ['fun', 'social'],
      layout: [
        { id: 'armchair', x: 1, y: 1 }, { id: 'armchair', x: 9, y: 1 }, { id: 'loveseat', x: 4, y: 1 },
        { id: 'dartboard', x: 7, y: 5 }, { id: 'plant', x: 1, y: 5 }, { id: 'garden', x: 4, y: 6 }
      ]
    }
  };

  // Build a transient lot object for a venue (furniture placed for free).
  function makeLot(venueId) {
    const v = VENUES[venueId];
    if (!v) return null;
    const lot = {
      size: { w: v.size.w, h: v.size.h },
      tiles: [], furniture: [], value: 0,
      floor: 'venue', floorHex: v.floorHex, wallHex: v.wallHex,
      walls: [], venue: venueId
    };
    for (let y = 0; y < v.size.h; y++) {
      const row = [];
      for (let x = 0; x < v.size.w; x++) row.push(null);
      lot.tiles.push(row);
    }
    const tmp = { lot };
    (v.layout || []).forEach((it) => {
      const item = LS.Build.byId(it.id);
      if (item && LS.Build.canPlace(tmp, item, it.x, it.y)) LS.Build.placeItem(tmp, item, it.x, it.y);
    });
    lot.value = 0; // venue furniture isn't part of the player's home value
    return lot;
  }

  function spawnFor(venueId) {
    const v = VENUES[venueId];
    return v ? { x: v.spawn.x, y: v.spawn.y } : { x: 1, y: 1 };
  }

  function info(venueId) { return VENUES[venueId] || null; }

  // List for the Town UI (home first, then venues).
  function list() {
    const out = [{ id: 'home', name: 'Home', icon: '🏠', desc: 'Your house — build, sleep, live.', travel: 0, mx: 13, my: 18, color: '#7c5cff' }];
    Object.keys(VENUES).forEach((id) => out.push(Object.assign({ id }, VENUES[id])));
    return out;
  }

  LS.Locations = { VENUES, makeLot, spawnFor, info, list };
})();
