# Spritemap / custom art — drop-in guide

The renderer already supports custom art with **zero code changes**. Furniture
falls back to an emoji until you give it a `sprite` image.

## Add art to a furniture item

1. Drop a PNG (transparent background works best) in this folder, e.g.
   `assets/sprites/bed.png`.
2. Open `js/game/build.js`, find the item in `CATALOG`, and add a `sprite` field:

   ```js
   { id: 'bed_single', name: 'Single Bed', icon: '🛏️', cat: 'bed', cost: 250,
     size: {w:1,h:2}, effect: { energy: 85 }, mood: 'rest',
     sprite: 'assets/sprites/bed.png' },   // <-- add this
   ```

3. Reload. The object now renders your image (scaled to its tile footprint)
   instead of the emoji, in both Live and Build modes.

`size: {w, h}` controls how many tiles the object covers, so draw the art at
that aspect ratio (e.g. a `{w:2,h:1}` sofa wants a ~2:1 image).

## Sim character art (optional, later)

The Sim is currently drawn with CSS (hair / head / torso / eyes, with walk-bob
and facing). To swap in a character spritesheet you'd render frames into
`.sim-body` in `js/game.js` (`buildLot`) keyed off `sim.facing` and
`sim.moving`. The movement/positioning is already frame-accurate, so a
4-direction walk sheet would slot straight in.
