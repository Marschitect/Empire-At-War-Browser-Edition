import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openGame } from './megfs.mjs';
const archive = openGame(fileURLToPath(new URL('../../Star Wars Empire at War', import.meta.url)));
globalThis.fetch = async input => {
  const path = String(input);
  const key = archive.resolve(decodeURIComponent(path.replace(/^asset\//, '').split('?')[0])),
    bytes = key && archive.read(key);
  return new Response(bytes || null, { status: bytes ? 200 : 404 });
};
const { db, loadGameData } = await import('../public/js/gamedata.js');
await loadGameData();
const { loadMap } = await import('../public/js/ted.js');
const { LandWorld, LandSquad, landUnit } = await import('../public/js/game/land.js');
const { executeLand } = await import('../public/js/game/landcommands.js');
const { ARMED_ORDERS, radarToWorld, worldToRadar, radarOrderPoint, radarPress } = await import('../public/js/game/landminimap.js');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// The radar transform on campaign and skirmish land maps, checked against the mapping LandUI.drawRadar paints with.
let maps = 0;
for (const name of ['_Land_Planet_Bestine_02.ted', '_LAND_PLANET_MUSTAFAR_01.TED', '_MP_LAND_TATOOINE.TED']) {
  let map;
  try {
    map = await loadMap(name);
  } catch {
    continue;
  }
  if (!map?.terrain) continue;
  maps++;
  const lo = map.playMin,
    hi = map.playMax,
    W = 220,
    H = 220,
    X = x => ((x - lo[0]) / (hi[0] - lo[0])) * W,
    Y = y => (1 - (y - lo[1]) / (hi[1] - lo[1])) * H;
  assert.ok(hi[0] > lo[0] && hi[1] > lo[1], name + ' has a playable rectangle');
  const world = Object.assign(Object.create(LandWorld.prototype), { map });
  for (const [fx, fy] of [
    [0, 0],
    [1, 1],
    [0.5, 0.5],
    [0.25, 0.9],
    [0.99, 0.01]
  ]) {
    const p = radarToWorld(map, fx, fy);
    assert.ok(near(X(p.x), fx * W, 1e-6) && near(Y(p.y), fy * H, 1e-6), name + ' press lands under the cursor');
    const back = worldToRadar(map, p.x, p.y);
    assert.ok(near(back.fx, fx, 1e-9) && near(back.fy, fy, 1e-9), name + ' round trip');
    const o = radarOrderPoint(map, fx, fy);
    assert.ok(world.inPlay(o.x, o.y), name + ' order point is inside the play area');
    assert.ok(Math.abs(o.x - p.x) <= 1 && Math.abs(o.y - p.y) <= 1, name + ' order point stays within a unit of the press');
  }
  const top = radarToWorld(map, 0.5, 0),
    left = radarToWorld(map, 0, 0.5);
  assert.ok(near(top.y, hi[1]) && near(left.x, lo[0]), name + ' top of the radar is +y, left is -x');
  const out = radarOrderPoint(map, -3, 7);
  assert.ok(world.inPlay(out.x, out.y), name + ' a press dragged off the radar still clamps into play');
}
console.log(maps ? `radar transform checked on ${maps} land maps` : 'no land maps available headlessly; using a synthetic map only');
{
  const map = { playMin: [200, 400], playMax: [3000, 1800] };
  const p = radarToWorld(map, 0.25, 0.75);
  assert.deepEqual(p, { x: 900, y: 750 });
  assert.deepEqual(worldToRadar(map, 900, 750), { fx: 0.25, fy: 0.75 });
}

// Which button does what, mirroring the battlefield.
assert.deepEqual(radarPress(0, { armed: null }), { look: true });
assert.deepEqual(radarPress(2, { armed: null }), { order: true, mode: '', disarm: false });
assert.deepEqual(radarPress(2, { armed: 'attackmove' }), { order: true, mode: 'attackmove', disarm: false });
assert.deepEqual(radarPress(2, { armed: 'guard' }), { order: true, mode: 'guard', disarm: true });
assert.deepEqual(radarPress(2, { armed: 'bombing' }), { cancel: true });
assert.deepEqual(radarPress(2, { armed: null, placing: {} }), { cancel: true });
assert.deepEqual(radarPress(2, { armed: 'move', aiming: {} }), { cancel: true });
assert.deepEqual(radarPress(0, { armed: 'waypoint' }), { order: true, mode: 'waypoint', disarm: false });
assert.deepEqual(radarPress(0, { armed: 'orbital' }), { look: true });
assert.deepEqual(radarPress(1, { armed: null }), {});
for (const m of ARMED_ORDERS) assert.ok(radarPress(2, { armed: m }).order);

// A radar order is an ordinary land move command: the selected squad is sent to the pressed spot.
{
  const map = { playMin: [0, 0], playMax: [4000, 4000] };
  const orders = [];
  const world = Object.assign(Object.create(LandWorld.prototype), { map, team: [0, 1], time: 1, units: [], squads: [] });
  world.order = (q, x, y) => orders.push({ q, x, y });
  const type = db.type('Stormtrooper');
  const squad = new LandSquad(world, type, 0);
  const base = { type, side: 0, squad, x: 100, y: 100, z: 0, heading: 0, health: 100, maxHealth: 100 };
  const unit = landUnit({ ...base, dead: false, inside: false, path: [] });
  squad.members.push(unit);
  world.units.push(unit);
  if (!world.squads.includes(squad)) world.squads.push(squad);
  assert.ok(squad.isMobile, 'test squad can move');
  const g = radarOrderPoint(map, 0.75, 0.25);
  assert.deepEqual(g, { x: 3000, y: 3000 });
  executeLand({ world, factions: [] }, 0, { c: 'move', u: [squad.id], mode: '', t: 0, x: g.x, y: g.y });
  assert.equal(orders.length, 1);
  assert.deepEqual([orders[0].x, orders[0].y], [3000, 3000]);
  executeLand({ world, factions: [] }, 0, { c: 'move', u: [squad.id], mode: 'attackmove', t: 0, x: g.x, y: g.y });
  assert.deepEqual([squad.march.x, squad.march.y], [3000, 3000]);
  // Another side cannot order it.
  executeLand({ world, factions: [] }, 1, { c: 'move', u: [squad.id], mode: '', t: 0, x: 1, y: 1 });
  assert.equal(orders.length, 2);
}
console.log('land minimap ok');
