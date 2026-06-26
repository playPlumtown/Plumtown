/* Functional test of LifeSim game systems (Node, no DOM) */
const fs = require('fs');
const path = require('path');

// Minimal browser shims
global.window = {};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
global.structuredClone = (o) => JSON.parse(JSON.stringify(o));
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.document = { addEventListener() {}, createElement: () => ({ style:{}, addEventListener(){} }), querySelector: () => null, querySelectorAll: () => [] };
global.Date = Date;

// Load all modules in order (each attaches to window.LifeSim)
const base = 'c:/Users/Vigan/OneDrive/Desktop/github-projects/Sims/js';
['game/state.js','game/needs.js','game/skills.js','game/careers.js','game/relationships.js','game/build.js','game/economy.js','game/movement.js','game/cloud.js','game/emotions.js','game/locations.js','game/life.js','game/clock.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(base, f), 'utf8');
  new Function(code).call(global);
});

const LS = global.window.LifeSim;
let pass = 0, fail = 0;
function assert(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('\n=== LifeSim Functional Tests ===\n');

// 1. State + factories
console.log('[State]');
let state = LS.load();
assert(state.player.lsc === 0, 'fresh state starts with 0 LSC');
assert(Array.isArray(LS.NEEDS) && LS.NEEDS.length === 8, '8 needs defined');
assert(Object.keys(LS.CAREERS).length === 10, '10 careers defined');
assert(Object.keys(LS.SKILL_META).length === 12, '12 skills defined');

// 2. Sim creation
console.log('[Sim]');
let sim = LS.createSim({ name: 'Test', aspiration: 'wealth', traits: ['Ambitious','Active'] });
assert(sim.needs.hunger === 80, 'sim starts at 80 hunger');
assert(sim.skills.cooking.level === 0, 'sim starts at cooking 0');
assert(sim.mood === 80, 'sim mood initialized at 80');
assert(sim.money === 500, 'sim starts with $500');

// 3. Needs system
console.log('[Needs]');
LS.Needs.decay(sim, 60); // 1 in-game hour
assert(sim.needs.hunger < 80, 'hunger decays over time');
sim.needs.hunger = 90; // set close to cap
LS.Needs.satisfy(sim, 'hunger', 50);
assert(sim.needs.hunger === 100, 'hunger capped at 100');
LS.Needs.recomputeMood(sim);
assert(typeof sim.mood === 'number' && sim.mood > 0, 'mood recomputed');
const crit = LS.Needs.criticalNeeds(sim, 20);
assert(Array.isArray(crit), 'criticalNeeds returns array');
const ml = LS.Needs.moodLabel(sim);
assert(typeof ml.label === 'string', 'moodLabel returns label');

// 4. Skills system
console.log('[Skills]');
const before = sim.skills.programming.level;
LS.Skills.gainXP(sim, 'programming', 500);
assert(sim.skills.programming.level > before, 'skill levels up with XP');
assert(LS.Skills.canJoinCareer(sim, 'tech') === true, 'can join tech career');
assert(typeof LS.Skills.progress(sim, 'programming') === 'number', 'skill progress is number');

// 5. Careers system
console.log('[Careers]');
let j = LS.Careers.join(sim, 'tech');
assert(j.ok === true, 'join tech career succeeds');
assert(sim.career !== null, 'sim has career after join');
const ci = LS.Careers.info(sim);
assert(ci.title === 'Junior Dev', 'starts as Junior Dev');
assert(ci.salary === 60, 'Junior Dev salary is 60');
// work requires energy/mood; set needs good
sim.needs.energy = 90; sim.mood = 80; LS.Needs.recomputeMood(sim);
const w = LS.Careers.work(sim, 1);
assert(w.ok === true, 'work succeeds when healthy');
assert(sim.money > 500, 'earned money from work');
const w2 = LS.Careers.work(sim, 1);
assert(w2.ok === false, 'cannot work twice same day');
const list = LS.Careers.list(sim);
assert(list.length === 10, 'lists 10 careers');

// 6. Relationships
console.log('[Relationships]');
LS.Relationships.ensureNPCs(state, 3);
assert(state.npcs.length >= 3, 'NPCs created');
const npc = state.npcs[0];
const r1 = LS.Relationships.interact(sim, npc.id, 'chat', state);
assert(r1.ok === true, 'chat interaction succeeds');
assert(r1.score >= 0, 'relationship score after chat');
const r2 = LS.Relationships.interact(sim, npc.id, 'flirt', state);
assert(r2.ok === false, 'flirt locked at low score');
const tiers = LS.Relationships.list(sim);
assert(Array.isArray(tiers), 'relationship list works');

// 7. Build system
console.log('[Build]');
LS.Build.ensureLot(state);
assert(state.lot.tiles.length === 10, 'lot grid has 10 rows');
const b1 = LS.Build.buy(state, sim, 'bed_single', 0, 0);
assert(b1.ok === true, 'buy single bed succeeds');
assert(sim.money < 500, 'money reduced after buy');
assert(state.lot.furniture.length === 1, 'furniture count = 1');
const b2 = LS.Build.buy(state, sim, 'bed_single', 0, 0);
assert(b2.ok === false, 'cannot place on occupied tile');
const s1 = LS.Build.sell(state, sim, state.lot.furniture[0].uid);
assert(s1.ok === true, 'sell furniture succeeds');
assert(state.lot.furniture.length === 0, 'furniture removed after sell');

// 8. Economy
console.log('[Economy]');
const balBefore = state.player.lsc;
LS.Economy.earn(state, sim, 100, 'test reward');
assert(state.player.lsc === balBefore + 100, 'earn adds LSC');
assert(state.economy.totalEarned >= 100, 'totalEarned tracked');
assert(state.economy.transactions.length > 0, 'transaction recorded');
const lvl = LS.Economy.playerLevelInfo(state);
assert(lvl.level >= 1, 'player level info returns level');
LS.Economy.spend(state, 50, 'test spend');
assert(state.player.lsc === balBefore + 50, 'spend reduces LSC');

// 9. Clock (manual advance, no rAF loop)
console.log('[Clock]');
state.time.speed = 1;
state.time.day = 1; state.time.hour = 8; state.time.minute = 0;
LS.Clock.start(state, sim, () => {}, () => {});
LS.Clock.speed(2);
assert(state.time.speed === 2, 'clock speed set to 2');
LS.Clock.advance(60);
assert(state.time.hour === 9, 'advance 60min moves hour to 9');
LS.Clock.stop();

// 10. Persistence
console.log('[Persistence]');
LS.save(state);
const reloaded = LS.load();
assert(reloaded.player.lsc === state.player.lsc, 'save/load round-trips LSC');
assert(reloaded.sims !== undefined, 'save/load round-trips sims array');

// 11. Movement & pathfinding
console.log('[Movement]');
let mstate = LS.load();
LS.Build.ensureLot(mstate);
let msim = LS.createSim({ name: 'Walker' });
msim.tile = { x: 0, y: 0 }; msim.px = 0; msim.py = 0;
assert(LS.Movement.isWalkable(mstate, 0, 0) === true, 'empty tile is walkable');
const p = LS.Movement.findPath(mstate, { x: 0, y: 0 }, { x: 4, y: 3 });
assert(Array.isArray(p) && p.length === 7, 'BFS path length is manhattan distance (7)');
assert(p[p.length - 1].x === 4 && p[p.length - 1].y === 3, 'path ends at goal');
LS.Build.buy(mstate, msim, 'bed_single', 2, 2); // 1x2 footprint at (2,2),(2,3)
assert(LS.Movement.isWalkable(mstate, 2, 2) === false, 'furniture tile blocks walking');
const ut = LS.Movement.useTileFor(mstate, mstate.lot.furniture[0], { x: 0, y: 0 });
assert(ut && LS.Movement.isWalkable(mstate, ut.x, ut.y), 'use-tile is a walkable neighbour');
const route = LS.Movement.routeToFurniture(mstate, msim, mstate.lot.furniture[0]);
assert(route && Array.isArray(route.path), 'routeToFurniture returns a path');
// wall off a goal to prove unreachable returns null
let blocked = LS.load(); LS.Build.ensureLot(blocked);
for (let x = 0; x < blocked.lot.size.w; x++) blocked.lot.tiles[1][x] = 'wall';
const np = LS.Movement.findPath(blocked, { x: 0, y: 0 }, { x: 0, y: 5 });
assert(np === null, 'unreachable goal returns null');
const nw = LS.Movement.nearestWalkable(mstate, 2, 2);
assert(nw && LS.Movement.isWalkable(mstate, nw.x, nw.y), 'nearestWalkable finds an open tile');

// 12. Emotions & moodlets
console.log('[Emotions]');
let esim = LS.createSim({ name: 'Emo' });
LS.Emotions.add(esim, 'successful');
assert(esim.moodlets.length === 1, 'moodlet added');
const moodBefore = esim.mood;
LS.Needs.recomputeMood(esim);
assert(esim.mood >= moodBefore, 'positive moodlet raises mood');
LS.Emotions.add(esim, 'successful'); // refresh, not stack
assert(esim.moodlets.length === 1, 'same moodlet refreshes (no stack)');
LS.Emotions.tick(esim, 10000); // expire everything
assert(esim.moodlets.length === 0, 'moodlets expire after ttl');
esim.needs.energy = 5; LS.Needs.recomputeMood(esim);
assert(esim.emotion === 'exhausted', 'very low energy → exhausted emotion');
esim.needs.energy = 90; esim.needs.fun = 90; esim.needs.social = 90; esim.needs.comfort = 90;
esim.needs.hunger = 95; esim.needs.bladder = 95; esim.needs.hygiene = 95; esim.needs.room = 90;
LS.Emotions.add(esim, 'inspired'); LS.Needs.recomputeMood(esim);
assert(esim.emotion === 'inspired', 'inspired moodlet drives emotion when needs are met');
assert(typeof LS.Emotions.performanceMod(esim) === 'number', 'performanceMod returns a number');

// 13. Bug fixes & milestones
console.log('[Fixes]');
let fstate = LS.load(); LS.Relationships.ensureNPCs(fstate, 2);
let fsim = LS.createSim({ name: 'Fixer' }); fsim.skills.charisma.level = 5;
const fr = LS.Relationships.interact(fsim, fstate.npcs[0].id, 'chat', fstate);
assert(typeof fsim.relationships[0].tier === 'string', 'relationship record has a tier label (not undefined)');
// milestone one-time payment
let ostate = LS.load(); let osim = LS.createSim({ name: 'Once' });
const m1 = LS.Economy.rewardMilestoneOnce(ostate, osim, 'partner', 'Partner', 'partner');
const m2 = LS.Economy.rewardMilestoneOnce(ostate, osim, 'partner', 'Partner', 'partner');
assert(m1.amount === 150 && m2.amount === 0, 'one-time milestone pays exactly once');
// aspiration status
let asim = LS.createSim({ name: 'Asp', aspiration: 'knowledge' });
const as = LS.aspirationStatus(asim);
assert(as && typeof as.progress === 'number' && as.goal === 40, 'aspirationStatus computes progress toward goal');
// floor/wall styling
let bstate = LS.load(); let bsim = LS.createSim({ name: 'Deco' }); bsim.money = 5000;
const sf = LS.Build.setFloor(bstate, bsim, 'tile');
assert(sf.ok && bstate.lot.floor === 'tile', 'setFloor applies a floor style');
const sw = LS.Build.setWall(bstate, bsim, 'brick');
assert(sw.ok && bstate.lot.wall === 'brick', 'setWall applies a wall style');

// 14. Rooms, walls, inventory/shop, town
console.log('[World]');
let wstate = LS.load();
LS.Build.ensureLot(wstate);
assert(wstate.lot.walls && wstate.lot.walls.length > 0, 'home lot has interior walls');
const wt = wstate.lot.walls[0];
assert(LS.Movement.isWalkable(wstate, wt.x, wt.y) === false, 'wall tile blocks movement');
const roomPath = LS.Movement.findPath(wstate, { x: 1, y: 1 }, { x: 10, y: 8 });
assert(Array.isArray(roomPath) && roomPath.length > 0, 'Sim can path between rooms via doorways');

let istate = LS.load();
let isim = LS.createSim({ name: 'Shopper' }); isim.money = 1000;
const bb = LS.Build.buyToInventory(istate, isim, 'sofa');
assert(bb.ok && istate.inventory.length === 1 && isim.money < 1000, 'shop: buy adds to inventory and charges');
LS.Build.ensureLot(istate);
const pf = LS.Build.placeFromInventory(istate, isim, 'sofa', 0, 0);
assert(pf.ok && istate.inventory.length === 0 && istate.lot.furniture.length === 1, 'build: place consumes an owned item');
const pf2 = LS.Build.placeFromInventory(istate, isim, 'sofa', 3, 0);
assert(pf2.ok === false, "cannot place an item you don't own");

const venues = LS.Locations.list();
assert(venues.length >= 6 && venues[0].id === 'home', 'town lists home + venues');
const gymLot = LS.Locations.makeLot('gym');
assert(gymLot && gymLot.furniture.length > 0 && gymLot.venue === 'gym', 'venue lot is built with furniture');
const gsp = LS.Locations.spawnFor('gym');
assert(LS.Movement.isWalkable({ lot: gymLot }, gsp.x, gsp.y), 'venue spawn tile is walkable');

// 15. Build-your-own walls
console.log('[Walls]');
let tstate = LS.load(); LS.Build.ensureLot(tstate);
const tw1 = LS.Build.toggleWall(tstate, 3, 3);
assert(tw1.ok && tw1.added && tstate.lot.tiles[3][3] === 'WALL', 'wall tool adds a wall');
assert(LS.Movement.isWalkable(tstate, 3, 3) === false, 'added wall blocks movement');
const tw2 = LS.Build.toggleWall(tstate, 3, 3);
assert(tw2.ok && !tw2.added && tstate.lot.tiles[3][3] === null, 'wall tool erases a wall');
// cannot wall over furniture
let fstate2 = LS.load(); let fsim2 = LS.createSim({ name: 'B' }); fsim2.money = 9999;
LS.Build.buy(fstate2, fsim2, 'fridge', 2, 2);
const tw3 = LS.Build.toggleWall(fstate2, 2, 2);
assert(tw3.ok === false, 'cannot place a wall on furniture');
// doors
let dstate = LS.load(); LS.Build.ensureLot(dstate);
assert((dstate.lot.doors || []).length >= 4, 'home has default doors in its rooms');
const dwt = dstate.lot.walls[0];
const dd = LS.Build.toggleDoor(dstate, dwt.x, dwt.y);
assert(dd.ok && dd.added && dstate.lot.tiles[dwt.y][dwt.x] === null, 'door tool cuts a door through a wall');
assert(LS.Movement.isWalkable(dstate, dwt.x, dwt.y) === true, 'a door tile is walkable');
const dd2 = LS.Build.toggleDoor(dstate, dwt.x, dwt.y);
assert(dd2.ok && !dd2.added && LS.Build.doorAt(dstate, dwt.x, dwt.y) === null, 'door tool removes a door');

// 16. Life stages & family
console.log('[Life]');
let lstate = LS.load();
let lsim = LS.createSim({ name: 'Parent One', traits: ['Cheerful'] });
lstate.sims = [lsim]; lstate.activeSimId = lsim.id; lsim.bornDay = lstate.time.day;
LS.Relationships.ensureNPCs(lstate, 3);
const pnpc = lstate.npcs[0];
assert(LS.Life.stageFor(0) === 'young' && LS.Life.stageFor(13) === 'adult' && LS.Life.stageFor(30) === 'elder', 'life stages map from days lived');
LS.Life.moveIn(lsim, pnpc);
assert(lsim.partner && lsim.partner.npcId === pnpc.id, 'move in sets a partner');
const mr = LS.Life.marry(lsim);
assert(mr.ok && lsim.partner.married === true, 'marry sets married');
const baby = LS.Life.tryForBaby(lsim, lstate);
assert(baby.ok && lsim.children.length === 1 && baby.child.stage === 'baby', 'try for baby adds a child');
lsim.children[0].bornDay = 1;
const beforeSims = lstate.sims.length;
const lifeEvents = LS.Life.onDay(lstate, lsim, 15);
assert(lstate.sims.length === beforeSims + 1, 'a grown child becomes a new playable Sim');
assert(lifeEvents.some((e) => e.type === 'grownup'), 'grown-up life event fired');

// 17. Community / cloud (multiplayer foundation)
console.log('[Community]');
LS.Cloud.ensureSeeded(true);
const players = LS.Cloud.listPlayersLocal();
assert(players.length >= 9 && players[0].isYou === true, 'community lists you + neighbours');
const aNpc = players.find((p) => !p.isYou);
const npcWorld = LS.Cloud.getWorldLocal(aNpc.id);
assert(npcWorld && npcWorld.lot && npcWorld.lot.furniture.length > 0, 'a neighbour has a furnished house');
assert(npcWorld.sims && npcWorld.sims.length === 1, 'a neighbour has a Sim');
assert(typeof LS.Cloud.housePreviewHTML(npcWorld, 120) === 'string', 'house preview returns HTML');
assert(LS.Cloud.isRemote() === false, 'offline mode when no backend configured');
const cw1 = LS.Cloud.getWorldLocal(aNpc.id), cw2 = LS.Cloud.getWorldLocal(players[2].id);
assert(JSON.stringify(cw1.lot.furniture) !== JSON.stringify(cw2.lot.furniture), 'different players have different houses');

// 18. P2E economy — SERVER-authoritative reward rules (the money-critical logic)
console.log('[P2E]');
(function () {
process.env.P2E_PAYOUTS_ENABLED = 'true';
process.env.P2E_CREDITS_PER_UNIT = '100000';
process.env.P2E_MIN_WITHDRAW = '2000';
process.env.P2E_DAILY_WITHDRAW_CAP = '20000';
process.env.P2E_WITHDRAW_COOLDOWN_MS = '60000';
process.env.P2E_DAILY_EARN_CAP = '1500';
process.env.P2E_DAILY_REWARD = '50';
const P2 = require('./server/economy.js');
const NOW = 1750000000000;
function applyCredit(r, plan, kind, now) {
  r.balance += plan.amount; r.lifetimeEarned += plan.amount;
  r.earnedToday = (r.earnDay === plan.today ? (r.earnedToday || 0) : 0) + plan.amount; r.earnDay = plan.today;
  if (kind === 'daily') r.dailyAt = now;
  else { r.credited = r.credited || {}; r.credited[plan.creditKey] = now; }
}

let rw = P2.blankRewards();
let pc = P2.planCredit(rw, 'daily', '', '', NOW);
assert(pc.ok && pc.amount === 50, 'daily login mints 50 credits');
applyCredit(rw, pc, 'daily', NOW);
let pc2 = P2.planCredit(rw, 'daily', '', '', NOW + 1000);
assert(!pc2.ok && pc2.reason === 'daily_not_ready', 'daily login gated to once / 24h');
let pc3 = P2.planCredit(rw, 'daily', '', '', NOW + 24 * 3600 * 1000 + 1);
assert(pc3.ok, 'daily login available again after 24h');

let q = P2.planCredit(rw, 'quest', 'first_meal', '', NOW);
assert(q.ok && q.amount === 30, 'quest first_meal worth 30 credits');
applyCredit(rw, q, 'quest', NOW);
let qd = P2.planCredit(rw, 'quest', 'first_meal', '', NOW);
assert(!qd.ok && qd.reason === 'already_credited', 'a quest pays exactly once');
let bogus = P2.planCredit(rw, 'quest', 'not_a_quest', '', NOW);
assert(!bogus.ok && bogus.reason === 'no_reward', 'unknown/forged events are worth nothing (anti-drain)');

let r2 = P2.blankRewards();
let m1 = P2.planCredit(r2, 'milestone', 'skill_maxed', 'skill_cooking', NOW);
assert(m1.ok && m1.amount === 100, 'milestone skill_maxed worth 100');
applyCredit(r2, m1, 'milestone', NOW);
let m1b = P2.planCredit(r2, 'milestone', 'skill_maxed', 'skill_cooking', NOW);
assert(!m1b.ok, 'the same milestone instance pays once');
let m2 = P2.planCredit(r2, 'milestone', 'skill_maxed', 'skill_logic', NOW);
assert(m2.ok && m2.amount === 100, 'a different milestone instance still pays (tag-dedup)');

let r3 = P2.blankRewards(); r3.earnDay = P2.dayStamp(NOW); r3.earnedToday = 1480;
let capped = P2.planCredit(r3, 'milestone', 'home_built', 'home_built', NOW);
assert(capped.ok && capped.amount === 20, 'per-day earn cap clamps the credited amount');

assert(P2.creditsToBase(100000) === 1e9, '100000 credits = 1 SOL (1e9 lamports)');

let wr = P2.blankRewards();
let wNo = P2.planWithdraw(wr, 0, NOW);
assert(!wNo.ok && wNo.reason === 'no_wallet', 'cannot withdraw without a linked wallet');
wr.wallet = 'SoMeWaLLeTAddre55'; wr.balance = 1000;
let wMin = P2.planWithdraw(wr, 0, NOW);
assert(!wMin.ok && wMin.reason === 'below_min', 'a sub-minimum withdrawal is rejected');
wr.balance = 5000;
let wOk = P2.planWithdraw(wr, 0, NOW);
assert(wOk.ok && wOk.base === P2.creditsToBase(5000), 'a valid withdrawal computes on-chain base units');
wr.balance = 999999;
let wCap = P2.planWithdraw(wr, 0, NOW);
assert(wCap.ok && wCap.grossCredits === 20000, 'withdrawal is clamped to the daily cap');
wr.lastWithdrawAt = NOW;
let wCool = P2.planWithdraw(wr, 0, NOW + 1000);
assert(!wCool.ok && wCool.reason === 'cooldown', 'withdrawals respect the cooldown window');
})();

console.log('\n=== Results: ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail ? 1 : 0);