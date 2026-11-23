// A ship whose hull overlaps an asteroid field edge, or whose searches all run out, still gets a route and moves.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { openGame } from './megfs.mjs';
let gameDir = fileURLToPath(new URL('../../Star Wars Empire at War', import.meta.url));
for (let up = new URL('../../../', import.meta.url); !existsSync(gameDir) && up.pathname.split('/').length > 3; up = new URL('../', up))
  gameDir = fileURLToPath(new URL('Star Wars Empire at War', up));
if (!existsSync(gameDir)) {
  console.log('space crowded move: game folder not found, skipped');
  process.exit(0);
}
const archive = openGame(gameDir, []);
globalThis.fetch = async input => {
  const path = String(input);
  if (path.startsWith('api/find?q=')) {
    const pattern = new RegExp(decodeURIComponent(path.slice(11)), 'i');
    return new Response(JSON.stringify([...archive.index.keys()].filter(name => pattern.test(name))));
  }
  const key = archive.resolve(decodeURIComponent(path.replace(/^asset\//, '').split('?')[0])),
    bytes = key && archive.read(key);
  return new Response(bytes ? new Uint8Array(bytes) : null, { status: bytes ? 200 : 404 });
};
const THREE = await import('../public/vendor/three/build/three.module.js');
const { db, loadGameData } = await import('../public/js/gamedata.js');
await loadGameData();
const S = await import('../public/js/game/sim.js');
const { loadMap } = await import('../public/js/ted.js');
const { seedSim } = await import('../public/js/game/simrandom.js');

const MAP_NAME = '_MP_SPACE_POLUS.TED',
  shipType = db.type('Star_Destroyer'),
  STEP = 1 / 30;
if (!shipType || ![...archive.index.keys()].some(name => name.endsWith(MAP_NAME))) {
  console.log('space crowded move: map or ship missing, skipped');
  process.exit(0);
}
const map = await loadMap(MAP_NAME);
const nothing = new Proxy(function () {}, { get: (target, key) => (key === Symbol.toPrimitive ? () => 0 : nothing), apply: () => undefined });
const field = (x, y, r) => ({ x, y, r, asteroid: true, nebula: false, ion: false, radar: true });

async function setup(lockstep) {
  S.resetEntityIds();
  seedSim(3);
  const world = new S.World({ scene: new THREE.Scene(), fx: nothing, audio: nothing, map });
  world.modelOpts = { headless: true };
  world.artReady = () => true;
  world.onEvent = () => {};
  world.fog = false;
  if (lockstep) await world.paths.deterministic();
  const empire = world.addPlayer(new S.Player(0, world.addTeam(new S.Team(0, 'Empire')), { credits: 1e6, human: true }));
  const ship = world.spawn(shipType, empire, 0, 0, 0);
  // models are not loaded headlessly: give the hull a capital ship's size
  ship.extBox = [450, 220];
  ship.pathExt = null;
  assert(ship.asteroidDamage, 'asteroids are a hazard for this ship');
  const reach = world.paths.ext(ship).r;
  world.fields.length = 0;
  // the hull reaches into this field although the ship's centre is outside it
  world.fields.push(field(1500 + reach * 0.5, 0, 1500));
  world.fields.push(field(-2500, 2500, 800), field(-2500, -2500, 800));
  for (let i = 0; i < 3; i++) world.update(STEP);
  return { world, ship, goal: { x: -4000, y: 0 } };
}

{
  const { world, ship, goal } = await setup(false);
  world.paths.sync();
  const route = world.paths.detour(ship, goal.x, goal.y);
  assert(route && route.length, 'the detour finds a way out although the hull overlaps a field edge');
}

async function fly(lockstep) {
  const { world, ship, goal } = await setup(lockstep);
  // every engine search fails, as when the obstacles use up the search budget
  world.paths.engineFind = () => [];
  world.paths.findOnce = function () {
    this.statesUsed = 1;
    return [];
  };
  ship.setOrder({ kind: 'move', x: goal.x, y: goal.y });
  const x0 = ship.x,
    y0 = ship.y;
  let idle = 0;
  for (let t = 0; t < 40; t += STEP) {
    world.update(STEP);
    if (ship.order.kind === 'move' && ship.speed < 1) idle += STEP;
  }
  const moved = Math.hypot(ship.x - x0, ship.y - y0);
  console.log((lockstep ? 'lockstep' : 'single player') + ': moved ' + Math.round(moved) + ', idle ' + idle.toFixed(1) + ' s');
  assert(moved > 1000, 'the ship moves toward its goal');
  assert(Math.hypot(ship.x - goal.x, ship.y - goal.y) < Math.hypot(x0 - goal.x, y0 - goal.y) - 1000, 'the ship gets closer');
  assert(!world.inHazard(ship), 'the straight legs stay out of the fields');
  return { x: ship.x, y: ship.y, heading: ship.heading };
}
await fly(false);
const a = await fly(true),
  b = await fly(true);
assert.deepEqual(a, b, 'lockstep moves the same way every time');
console.log('space crowded move ok');
process.exit(0);
