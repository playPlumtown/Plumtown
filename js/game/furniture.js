/* ============================================================
   LifeSim — Furniture art
   Draws each piece of furniture as a small top-down SVG so a
   stove looks like a stove, a bed like a bed, etc. — instead of
   a flat emoji. Falls back to the emoji for anything unmapped,
   and a `sprite` image (if set on the item) overrides everything.
   Attaches to window.LifeSim.Furniture.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  // tiny SVG primitive helpers
  const r = (x, y, w, h, rx, f, ex) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${f}"${ex || ''}/>`;
  const c = (cx, cy, rad, f, ex) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${f}"${ex || ''}/>`;
  const e = (cx, cy, rx, ry, f) => `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${f}"/>`;
  const ln = (x1, y1, x2, y2, col, w) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;

  // colour palette
  const P = {
    wood: '#9a6a40', woodD: '#6e4a2c', woodL: '#b98a5c',
    metal: '#aab0bd', metalD: '#787f8c', steel: '#c7ccd6',
    white: '#eef2f7', whiteD: '#cfd6e0',
    dark: '#3a3a4e', darkD: '#272736',
    screen: '#16263a', glow: '#3a9bd8',
    water: '#4fb8e6', waterD: '#2f93c4',
    green: '#5bbf73', greenD: '#3f8f54', soil: '#5a3f2a',
    fab: '#6f7fae', fabD: '#56638c', fabA: '#8a9ad0',
    warm: '#ff9a4a', warmD: '#e07628', red: '#e2574c',
    porc: '#eef3f8', porcD: '#d2dae4',
    gold: '#e8c34a', felt: '#2f8f5a'
  };

  // item id → shape key (falls back to category, then emoji)
  const MAP = {
    bed_single: 'bed', bed_double: 'bed', bunk: 'bed', kingbed: 'bed',
    sofa: 'sofa', loveseat: 'sofa',
    armchair: 'chair', recliner: 'chair', beanbag: 'beanbag',
    dining: 'table', desk: 'table', workbench: 'table',
    fridge: 'fridge', stove: 'stove', grill: 'stove',
    microwave: 'appliance', coffee: 'appliance', juicer: 'appliance', sewing: 'appliance',
    toilet: 'toilet', shower: 'shower', bathtub: 'tub', sink: 'sink', doublesink: 'sink',
    tv: 'tv', pc: 'computer', bookshelf: 'bookshelf',
    games: 'console', arcade: 'arcade', pooltable: 'pool', dartboard: 'dartboard', chess: 'chess',
    easel: 'easel', piano: 'piano', guitar: 'guitar', weights: 'weights', treadmill: 'treadmill',
    garden: 'garden', telescope: 'telescope',
    plant: 'plant', rug: 'rug', lamp: 'lamp', fireplace: 'fireplace', aquarium: 'aquarium',
    painting: 'wallart', mirror: 'wallart', window: 'wallart', statue: 'statue', chandelier: 'chandelier'
  };

  // every shape draws within a W×H box
  const DRAW = {
    bed(W, H) {
      const m = 3, iw = W - 2 * m, ih = H - 2 * m;
      const vertical = H >= W;
      let s = r(m, m, iw, ih, 5, P.woodD);
      s += r(m + 2.5, m + 2.5, iw - 5, ih - 5, 4, P.white);
      if (vertical) {
        s += r(m + 4, m + 4, iw - 8, ih * 0.26, 3, P.whiteD);          // pillow
        s += r(m + 3, m + 3 + ih * 0.30, iw - 6, ih - ih * 0.30 - 6, 4, P.fab); // blanket
        s += r(m + 3, m + 3 + ih * 0.30, iw - 6, 5, 2, P.fabA);
      } else {
        s += r(m + 4, m + 4, iw * 0.26, ih - 8, 3, P.whiteD);
        s += r(m + 3 + iw * 0.30, m + 3, iw - iw * 0.30 - 6, ih - 6, 4, P.fab);
      }
      return s;
    },
    sofa(W, H) {
      const m = 3, iw = W - 2 * m, ih = H - 2 * m;
      let s = r(m, m, iw, ih, 7, P.fabD);
      s += r(m, m, iw, ih * 0.34, 6, P.fab);                        // backrest
      s += r(m, m + ih * 0.18, 6, ih * 0.78, 3, P.fabD);           // arm L
      s += r(W - m - 6, m + ih * 0.18, 6, ih * 0.78, 3, P.fabD);   // arm R
      const cw = (iw - 18) / 2;
      s += r(m + 7, m + ih * 0.40, cw, ih * 0.5, 4, P.fabA);
      s += r(m + 11 + cw, m + ih * 0.40, cw, ih * 0.5, 4, P.fabA);
      return s;
    },
    chair(W, H) {
      const m = 4, iw = W - 2 * m, ih = H - 2 * m;
      let s = r(m, m, iw, ih, 7, P.fabD);
      s += r(m, m, iw, ih * 0.3, 6, P.fab);
      s += r(m, m + ih * 0.2, 5, ih * 0.7, 3, P.fabD);
      s += r(W - m - 5, m + ih * 0.2, 5, ih * 0.7, 3, P.fabD);
      s += r(m + 6, m + ih * 0.4, iw - 12, ih * 0.5, 4, P.fabA);
      return s;
    },
    beanbag(W, H) {
      let s = e(W / 2, H / 2, W * 0.42, H * 0.42, P.fabD);
      s += e(W / 2, H * 0.46, W * 0.3, H * 0.28, P.fabA);
      return s;
    },
    table(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 5, P.woodD);
      s += r(m + 2, m + 2, W - 2 * m - 4, H - 2 * m - 4, 4, P.wood);
      s += r(m + 5, m + 5, W - 2 * m - 10, H - 2 * m - 10, 3, P.woodL, ' opacity="0.5"');
      return s;
    },
    fridge(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, P.steel);
      s += ln(m + 2, m + H * 0.42, W - m - 2, m + H * 0.42, P.metalD, 1.5); // freezer split
      s += r(W - m - 6, m + 4, 2.5, H * 0.3, 1, P.metalD);                  // handle top
      s += r(W - m - 6, m + H * 0.5, 2.5, H * 0.3, 1, P.metalD);            // handle bottom
      return s;
    },
    stove(W, H) {
      const m = 4, iw = W - 2 * m, ih = H - 2 * m;
      let s = r(m, m, iw, ih, 4, P.dark);
      const bx = m + iw * 0.28, by = m + ih * 0.30, dx = iw * 0.42, dy = ih * 0.40, rad = Math.min(iw, ih) * 0.13;
      s += c(bx, by, rad, P.metalD) + c(bx + dx, by, rad, P.metalD);
      s += c(bx, by + dy, rad, P.metalD) + c(bx + dx, by + dy, rad, P.metalD);
      s += c(bx, by, rad * 0.5, P.warm) + c(bx + dx, by + dy, rad * 0.5, P.warm);
      return s;
    },
    appliance(W, H) {
      const m = 5;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, P.metalD);
      s += r(m + 3, m + 3, (W - 2 * m) * 0.62, H - 2 * m - 6, 3, P.screen);
      s += r(W - m - 7, m + 4, 3, H - 2 * m - 8, 1.5, P.steel);
      return s;
    },
    toilet(W, H) {
      const m = 5;
      let s = r(W * 0.22, m, W * 0.56, H * 0.28, 3, P.porcD);     // tank
      s += e(W / 2, H * 0.62, W * 0.3, H * 0.3, P.porc);          // bowl
      s += e(W / 2, H * 0.62, W * 0.2, H * 0.2, P.porcD);
      return s;
    },
    shower(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, '#bcd6e6');
      s += r(m, m, W - 2 * m, H - 2 * m, 4, '#9cc3da', ' opacity="0.5"');
      s += c(W * 0.74, H * 0.26, 4, P.steel);                     // head
      for (let i = 0; i < 3; i++) s += ln(W * 0.74, H * 0.30, W * (0.6 + i * 0.07), H * 0.6, P.water, 1.4);
      s += e(W / 2, H * 0.72, W * 0.16, H * 0.1, P.metalD);       // drain
      return s;
    },
    tub(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 9, P.porcD);
      s += r(m + 3, m + 3, W - 2 * m - 6, H - 2 * m - 6, 7, P.water);
      s += c(m + 7, H / 2, 2.5, P.steel);
      return s;
    },
    sink(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, P.porcD);
      s += e(W / 2, H * 0.56, W * 0.28, H * 0.28, P.porc);
      s += r(W / 2 - 1.5, m + 2, 3, H * 0.18, 1, P.metal);        // faucet
      return s;
    },
    tv(W, H) {
      const m = 3;
      let s = r(m, H * 0.5, W - 2 * m, H * 0.42, 3, P.darkD);     // stand
      s += r(m + 2, m, W - 2 * m - 4, H * 0.5, 3, P.dark);        // screen frame
      s += r(m + 4, m + 2, W - 2 * m - 8, H * 0.5 - 4, 2, P.screen);
      s += r(m + 6, m + 4, (W - 2 * m - 12) * 0.5, H * 0.5 - 8, 1, P.glow, ' opacity="0.6"');
      return s;
    },
    computer(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H * 0.5, 2, P.dark);             // monitor
      s += r(m + 2, m + 2, W - 2 * m - 4, H * 0.5 - 4, 1, P.screen);
      s += r(m + 3, m + 3, W * 0.4, H * 0.5 - 6, 1, P.glow, ' opacity="0.5"');
      s += r(m, H * 0.62, W - 2 * m, H * 0.3, 2, P.metalD);       // keyboard
      return s;
    },
    bookshelf(W, H) {
      const m = 3;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, P.woodD);
      const rows = H > W ? 3 : 2, rh = (H - 2 * m) / rows;
      const cols = ['#c0563f', '#d8a23a', '#4f8fb0', '#5bbf73', '#a36fc0', '#e07628'];
      for (let row = 0; row < rows; row++) {
        let x = m + 3;
        let i = row;
        while (x < W - m - 4) {
          const bw = 2.6 + (i % 3);
          s += r(x, m + 3 + row * rh, bw, rh - 5, 0.5, cols[i % cols.length]);
          x += bw + 0.8; i++;
        }
      }
      return s;
    },
    console(W, H) {
      const m = 6;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, P.darkD);
      s += c(W * 0.5, H * 0.5, Math.min(W, H) * 0.12, P.glow);
      s += r(W * 0.3, H * 0.7, W * 0.4, 3, 1.5, P.metalD);
      return s;
    },
    arcade(W, H) {
      const m = 5;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, '#5a3fa0');
      s += r(m + 3, m + 3, W - 2 * m - 6, H * 0.4, 2, P.screen);
      s += r(m + 4, m + H * 0.5, W - 2 * m - 8, H * 0.3, 2, P.darkD);
      s += c(W * 0.4, H * 0.66, 2.5, P.red) + c(W * 0.6, H * 0.66, 2.5, P.gold);
      return s;
    },
    pool(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 5, '#6b4a2e');
      s += r(m + 4, m + 4, W - 2 * m - 8, H - 2 * m - 8, 4, P.felt);
      const pk = [[m + 5, m + 5], [W - m - 5, m + 5], [m + 5, H - m - 5], [W - m - 5, H - m - 5], [W / 2, m + 5], [W / 2, H - m - 5]];
      pk.forEach((p) => s += c(p[0], p[1], 2.2, '#1a1a22'));
      s += c(W * 0.5, H * 0.5, 2, P.white) + c(W * 0.4, H * 0.4, 2, '#e2c14a');
      return s;
    },
    dartboard(W, H) {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
      let s = c(cx, cy, R, '#222');
      s += c(cx, cy, R * 0.8, '#d8c9a0') + c(cx, cy, R * 0.55, '#c0563f');
      s += c(cx, cy, R * 0.32, '#d8c9a0') + c(cx, cy, R * 0.12, P.greenD) + c(cx, cy, R * 0.05, P.red);
      return s;
    },
    chess(W, H) {
      const m = 5, n = 4, sz = (Math.min(W, H) - 2 * m) / n;
      let s = r(m, m, n * sz, n * sz, 2, '#d8c9a0');
      for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) if ((xx + yy) % 2) s += r(m + xx * sz, m + yy * sz, sz, sz, 0, '#6e4a2c');
      return s;
    },
    easel(W, H) {
      const m = 5;
      let s = `<polygon points="${W * 0.5},${m} ${m},${H - m} ${W - m},${H - m}" fill="${P.woodD}"/>`;
      s += r(W * 0.22, H * 0.2, W * 0.56, H * 0.5, 2, P.white);
      s += r(W * 0.3, H * 0.3, W * 0.18, H * 0.18, 1, P.warm) + r(W * 0.5, H * 0.4, W * 0.16, H * 0.16, 1, P.water);
      return s;
    },
    piano(W, H) {
      const m = 3;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, '#1c1c26');
      const horiz = W >= H;
      const keysX = m + 3, keysY = horiz ? H * 0.55 : m + 3;
      const kw = horiz ? (W - 2 * m - 6) : W * 0.4;
      const kh = horiz ? H * 0.32 : (H - 2 * m - 6);
      s += r(keysX, keysY, kw, kh, 1, P.white);
      const num = 10;
      for (let i = 1; i < num; i++) s += horiz ? ln(keysX + (kw / num) * i, keysY, keysX + (kw / num) * i, keysY + kh, '#888', 0.6) : ln(keysX, keysY + (kh / num) * i, keysX + kw, keysY + (kh / num) * i, '#888', 0.6);
      return s;
    },
    guitar(W, H) {
      let s = e(W * 0.5, H * 0.66, W * 0.26, H * 0.26, '#b9702f');
      s += e(W * 0.5, H * 0.66, W * 0.1, H * 0.1, '#3a2412');
      s += r(W * 0.45, H * 0.1, W * 0.1, H * 0.5, 2, '#6e4a2c');
      return s;
    },
    weights(W, H) {
      const m = 4;
      let s = r(m, H * 0.32, W - 2 * m, H * 0.36, 4, P.dark);     // bench
      s += ln(W * 0.2, m + 2, W * 0.2, H - m - 2, P.metalD, 3);   // bar
      s += c(W * 0.2, m + 4, 4, P.darkD) + c(W * 0.2, H - m - 4, 4, P.darkD);
      return s;
    },
    treadmill(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 4, P.darkD);
      s += r(m + 3, m + 3, W - 2 * m - 6, (H - 2 * m) * 0.6, 2, P.metalD); // belt
      for (let i = 1; i < 5; i++) s += ln(m + 3, m + 3 + (H - 2 * m) * 0.6 / 5 * i, W - m - 3, m + 3 + (H - 2 * m) * 0.6 / 5 * i, '#555', 0.8);
      s += r(m + 4, H - m - 7, W - 2 * m - 8, 4, 1, P.steel);     // console
      return s;
    },
    garden(W, H) {
      const m = 4;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, P.woodD);
      s += r(m + 2, m + 2, W - 2 * m - 4, H - 2 * m - 4, 2, P.soil);
      for (let i = 0; i < 6; i++) { const x = m + 6 + (i % 3) * (W - 2 * m - 12) / 2; const y = m + 6 + Math.floor(i / 3) * (H - 2 * m - 12) / 1; s += c(x, y, 2.5, P.green) + c(x, y - 2, 1.8, P.greenD); }
      return s;
    },
    telescope(W, H) {
      let s = `<polygon points="${W * 0.5},${H * 0.4} ${W * 0.25},${H - 4} ${W * 0.75},${H - 4}" fill="${P.metalD}"/>`;
      s += r(W * 0.42, H * 0.12, W * 0.36, H * 0.22, 3, P.dark, ' transform="rotate(35 ' + (W * 0.6).toFixed(1) + ' ' + (H * 0.23).toFixed(1) + ')"');
      return s;
    },
    plant(W, H) {
      const cx = W / 2;
      let s = `<polygon points="${cx - W * 0.16},${H * 0.6} ${cx + W * 0.16},${H * 0.6} ${cx + W * 0.12},${H - 4} ${cx - W * 0.12},${H - 4}" fill="#b9702f"/>`;
      s += c(cx, H * 0.42, W * 0.2, P.green) + c(cx - W * 0.14, H * 0.5, W * 0.13, P.greenD) + c(cx + W * 0.14, H * 0.5, W * 0.13, P.greenD) + c(cx, H * 0.3, W * 0.13, '#6fcf85');
      return s;
    },
    rug(W, H) {
      const m = 3;
      let s = r(m, m, W - 2 * m, H - 2 * m, 5, P.fabD);
      s += r(m + 4, m + 4, W - 2 * m - 8, H - 2 * m - 8, 4, 'none') + `<rect x="${m + 4}" y="${m + 4}" width="${W - 2 * m - 8}" height="${H - 2 * m - 8}" rx="4" fill="none" stroke="${P.fabA}" stroke-width="2"/>`;
      s += e(W / 2, H / 2, W * 0.16, H * 0.16, P.fabA);
      return s;
    },
    lamp(W, H) {
      let s = c(W / 2, H / 2, Math.min(W, H) * 0.34, P.gold, ' opacity="0.55"');
      s += c(W / 2, H / 2, Math.min(W, H) * 0.2, '#fff3c4');
      s += c(W / 2, H / 2, Math.min(W, H) * 0.07, P.metalD);
      return s;
    },
    fireplace(W, H) {
      const m = 3;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, '#5a4030');
      s += r(m + 4, m + 4, W - 2 * m - 8, H - 2 * m - 8, 2, '#221814');
      s += `<polygon points="${W * 0.5},${H * 0.35} ${W * 0.38},${H - 7} ${W * 0.62},${H - 7}" fill="${P.warm}"/>`;
      s += `<polygon points="${W * 0.5},${H * 0.5} ${W * 0.43},${H - 7} ${W * 0.57},${H - 7}" fill="${P.gold}"/>`;
      return s;
    },
    aquarium(W, H) {
      const m = 3;
      let s = r(m, m, W - 2 * m, H - 2 * m, 3, P.metalD);
      s += r(m + 3, m + 3, W - 2 * m - 6, H - 2 * m - 6, 2, P.water);
      s += c(W * 0.4, H * 0.5, 2.5, P.warm) + c(W * 0.62, H * 0.6, 2, '#ffd24a');
      s += c(W * 0.55, H * 0.4, 1.4, '#fff', ' opacity="0.7"');
      return s;
    },
    wallart(W, H) {
      const m = Math.min(W, H) * 0.18;
      let s = r(m, m, W - 2 * m, H - 2 * m, 2, P.gold);
      s += r(m + 2, m + 2, W - 2 * m - 4, H - 2 * m - 4, 1, '#bcd2e0');
      s += `<polygon points="${m + 4},${H - m - 4} ${W * 0.45},${H * 0.5} ${W - m - 4},${H - m - 4}" fill="#8fb98a"/>`;
      return s;
    },
    statue(W, H) {
      let s = r(W * 0.32, H * 0.74, W * 0.36, H * 0.2, 2, P.metalD);
      s += c(W / 2, H * 0.4, Math.min(W, H) * 0.18, P.steel);
      s += r(W * 0.42, H * 0.5, W * 0.16, H * 0.3, 3, P.steel);
      return s;
    },
    chandelier(W, H) {
      let s = c(W / 2, H / 2, Math.min(W, H) * 0.36, P.gold, ' opacity="0.4"');
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.3;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s += c(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 2.4, '#fff3c4'); }
      s += c(cx, cy, 3, P.gold);
      return s;
    }
  };

  function shapeFor(item) { return MAP[item.id] || MAP[item.cat] || null; }

  function svg(item) {
    const shape = shapeFor(item);
    const fn = shape && DRAW[shape];
    if (!fn) return null;
    const w = (item.size && item.size.w) || 1;
    const h = (item.size && item.size.h) || 1;
    const W = Math.round(w * 44), H = Math.round(h * 44);
    return `<svg class="furn-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${fn(W, H)}</svg>`;
  }

  function isDrawn(item) { return !!(item && (item.sprite || shapeFor(item))); }

  // An open door set into a wall gap. o='h' (horizontal wall) or 'v' (vertical).
  function door(o, wallCol) {
    const woodL = '#b98a5c', knob = '#e8c34a';
    let s;
    if (o === 'v') {
      s = r(9, 0, 26, 6, 1, wallCol) + r(9, 38, 26, 6, 1, wallCol) +
        `<g transform="rotate(42 22 6)">` + r(19.5, 6, 5, 29, 1.5, woodL) + c(22, 32, 1.6, knob) + `</g>` +
        `<path d="M22 6 A29 29 0 0 0 22 35" fill="none" stroke="${woodL}" stroke-width="0.9" stroke-dasharray="2 2" opacity="0.4"/>`;
    } else {
      s = r(0, 9, 6, 26, 1, wallCol) + r(38, 9, 6, 26, 1, wallCol) +
        `<g transform="rotate(42 6 22)">` + r(6, 19.5, 29, 5, 1.5, woodL) + c(32, 22, 1.6, knob) + `</g>` +
        `<path d="M6 22 A29 29 0 0 1 35 22" fill="none" stroke="${woodL}" stroke-width="0.9" stroke-dasharray="2 2" opacity="0.4"/>`;
    }
    return `<svg class="door-svg" viewBox="0 0 44 44" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  LS.Furniture = { svg, shapeFor, isDrawn, door };
})();
