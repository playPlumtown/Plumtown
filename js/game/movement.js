/* ============================================================
   LifeSim — Movement & Pathfinding
   Grid BFS pathfinding so the Sim walks tile-by-tile to objects
   (the signature Sims feel) instead of teleporting.
   Attaches to window.LifeSim.Movement.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function inBounds(state, x, y) {
    const { w, h } = state.lot.size;
    return x >= 0 && y >= 0 && x < w && y < h;
  }

  function tileAt(state, x, y) {
    if (!state.lot.tiles || !state.lot.tiles[y]) return null;
    return state.lot.tiles[y][x];
  }

  // A tile is walkable when it's in bounds and not occupied by furniture.
  function isWalkable(state, x, y) {
    return inBounds(state, x, y) && !tileAt(state, x, y);
  }

  // Breadth-first path from start to goal over 4-neighbours.
  // Returns waypoints AFTER start up to and including goal, or null if
  // the goal is unreachable. Returns [] when already on the goal.
  function findPath(state, start, goal) {
    if (start.x === goal.x && start.y === goal.y) return [];
    if (!isWalkable(state, goal.x, goal.y)) return null;
    const { w, h } = state.lot.size;
    const key = (x, y) => y * w + x;
    const visited = new Uint8Array(w * h);
    const prev = new Int32Array(w * h).fill(-1);
    const startK = key(start.x, start.y);
    visited[startK] = 1;
    let head = 0;
    const q = [start];
    let found = false;
    while (head < q.length) {
      const cur = q[head++];
      if (cur.x === goal.x && cur.y === goal.y) { found = true; break; }
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DIRS[d][0];
        const ny = cur.y + DIRS[d][1];
        if (!isWalkable(state, nx, ny)) continue;
        const k = key(nx, ny);
        if (visited[k]) continue;
        visited[k] = 1;
        prev[k] = key(cur.x, cur.y);
        q.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;
    const path = [];
    let ck = key(goal.x, goal.y);
    while (ck !== startK) {
      path.push({ x: ck % w, y: Math.floor(ck / w) });
      ck = prev[ck];
      if (ck < 0) return null;
    }
    path.reverse();
    return path;
  }

  // All walkable tiles orthogonally adjacent to a furniture footprint —
  // the spots a Sim can stand to use the object.
  function adjacentTiles(state, f) {
    const out = [];
    const seen = {};
    for (let yy = 0; yy < f.size.h; yy++) {
      for (let xx = 0; xx < f.size.w; xx++) {
        const bx = f.x + xx, by = f.y + yy;
        for (let d = 0; d < 4; d++) {
          const ax = bx + DIRS[d][0];
          const ay = by + DIRS[d][1];
          const k = ax + ',' + ay;
          if (seen[k]) continue;
          seen[k] = 1;
          const inside = ax >= f.x && ax < f.x + f.size.w && ay >= f.y && ay < f.y + f.size.h;
          if (!inside && isWalkable(state, ax, ay)) out.push({ x: ax, y: ay });
        }
      }
    }
    return out;
  }

  // Best stand-tile to use a furniture from a given origin (shortest path).
  function useTileFor(state, furniture, from) {
    const cands = adjacentTiles(state, furniture);
    if (!cands.length) return null;
    if (!from) return cands[0];
    let best = null, bestLen = Infinity;
    for (const c of cands) {
      const p = findPath(state, from, c);
      if (p == null) continue;
      const len = p.length;
      if (len < bestLen) { bestLen = len; best = c; }
    }
    return best;
  }

  // Resolve a complete route to a furniture: { tile, path } or null.
  function routeToFurniture(state, sim, furniture) {
    const tile = useTileFor(state, furniture, sim.tile);
    if (!tile) return null;
    const path = findPath(state, sim.tile, tile);
    if (path == null) return null;
    return { tile, path };
  }

  // Path to an arbitrary tile (or nearest walkable to it). null if blocked.
  function routeToTile(state, sim, tx, ty) {
    let goal = { x: tx, y: ty };
    if (!isWalkable(state, goal.x, goal.y)) {
      const nw = nearestWalkable(state, tx, ty);
      if (!nw) return null;
      goal = nw;
    }
    return findPath(state, sim.tile, goal);
  }

  // Cheapest walking cost from a sim to a furniture's use-tile (for autonomy
  // picking the *nearest* provider). Infinity if unreachable.
  function pathCostToFurniture(state, sim, furniture) {
    const tile = useTileFor(state, furniture, sim.tile);
    if (!tile) return Infinity;
    const p = findPath(state, sim.tile, tile);
    return p == null ? Infinity : p.length;
  }

  // BFS outward from (x,y) to the closest walkable tile (used when a Sim's
  // tile gets built over). Returns {x,y} or null.
  function nearestWalkable(state, x, y) {
    if (isWalkable(state, x, y)) return { x, y };
    const { w, h } = state.lot.size;
    const key = (px, py) => py * w + px;
    const visited = new Uint8Array(w * h);
    const q = [{ x, y }];
    visited[key(x, y)] = 1;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DIRS[d][0];
        const ny = cur.y + DIRS[d][1];
        if (!inBounds(state, nx, ny)) continue;
        const k = key(nx, ny);
        if (visited[k]) continue;
        visited[k] = 1;
        if (isWalkable(state, nx, ny)) return { x: nx, y: ny };
        q.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  // A sensible idle/spawn tile near the centre of the lot.
  function spawnTile(state) {
    const cx = Math.floor(state.lot.size.w / 2);
    const cy = Math.floor(state.lot.size.h / 2);
    return nearestWalkable(state, cx, cy) || { x: 0, y: 0 };
  }

  // Make sure the Sim is standing somewhere valid (e.g. after a build edit).
  function ensureSimTile(state, sim) {
    if (!sim.tile || !isWalkable(state, sim.tile.x, sim.tile.y)) {
      const t = sim.tile ? nearestWalkable(state, sim.tile.x, sim.tile.y) : spawnTile(state);
      const safe = t || spawnTile(state);
      sim.tile = { x: safe.x, y: safe.y };
      sim.px = safe.x;
      sim.py = safe.y;
      sim.path = [];
    }
  }

  function facingFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  LS.Movement = {
    isWalkable,
    inBounds,
    findPath,
    adjacentTiles,
    useTileFor,
    routeToFurniture,
    routeToTile,
    pathCostToFurniture,
    nearestWalkable,
    spawnTile,
    ensureSimTile,
    facingFromDelta
  };
})();
