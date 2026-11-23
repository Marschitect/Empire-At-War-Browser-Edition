// Hovering an own hero's top-bar portrait opens its encyclopedia popup, tactical and galactic.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openGame } from './megfs.mjs';
const mod = process.argv.indexOf('--mod');
const archive = openGame(fileURLToPath(new URL('../../Star Wars Empire at War', import.meta.url)), mod < 0 ? [] : [process.argv[mod + 1]]);
globalThis.fetch = async input => {
  const path = String(input);
  if (path.startsWith('api/find?q=')) {
    const re = new RegExp(decodeURIComponent(path.slice(11)), 'i');
    return new Response(JSON.stringify([...archive.index.keys()].filter(n => re.test(n))));
  }
  const key = archive.resolve(decodeURIComponent(path.replace(/^asset\//, ''))),
    data = key && archive.read(key);
  return new Response(data ? new Uint8Array(data) : null, { status: data ? 200 : 404 });
};
// Just enough DOM for the hero row: divs that keep children, and four <i> parts from innerHTML.
class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.style = { setProperty() {} };
    this.attrs = {};
    const set = new Set();
    this.classList = { add: c => set.add(c), remove: c => set.delete(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)), contains: c => set.has(c) };
  }
  set innerHTML(html) {
    this.replaceChildren(...[...html.matchAll(/<i\b/g)].map(() => new Node('i')));
    if (this.children[3]) this.children[3].appendChild(new Node('b'));
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get lastChild() {
    return this.children.at(-1) || null;
  }
  get isConnected() {
    return !!this.parent?.isConnected;
  }
  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  replaceChildren(...c) {
    for (const o of this.children) o.parent = null;
    this.children = [];
    c.forEach(n => this.appendChild(n));
  }
  contains(n) {
    for (; n; n = n.parent) if (n === this) return true;
    return false;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getContext() {
    return { putImageData() {}, drawImage() {} };
  }
}
globalThis.ImageData = class {
  constructor(data, width, height) {
    Object.assign(this, { data, width, height });
  }
};
const { db, loadGameData } = await import('../public/js/gamedata.js');
await loadGameData();
const { loadIcons } = await import('../public/js/icons.js');
const { CommandBar } = await import('../public/js/game/hud.js');
const { GalacticBar } = await import('../public/js/game/galactichud.js');
const { GalacticGame } = await import('../public/js/game/galactic.js');
globalThis.document = { createElement: tag => new Node(tag) };
await loadIcons();

const hero = [...db.types.values()].find(t => t.bool('Is_Named_Hero') && t.str('Icon_Name')),
  team = [...db.types.values()].find(t => t.list('Company_Units').some(n => db.type(n)?.bool('Is_Named_Hero')));
assert(hero && team, 'Data has a named hero and a hero company');
const rect = { x: 0, y: 0, w: 40, h: 40 },
  meshes = new Map([['HERO_SLOT_GOOD00', { origin: { x: 20, y: 20 }, rect }]]);
const bar = (proto, extra) => {
  const b = Object.create(proto);
  const root = new Node('div');
  Object.defineProperty(root, 'isConnected', { value: true });
  const el = root.appendChild(new Node('div'));
  const played = [];
  Object.assign(b, {
    heroShells: { good: { meshes, tex: null } },
    heroBars: { good: { el, sig: '' } },
    player: { id: 0 },
    comp: () => ({ num: (_, d) => d, val: k => k }),
    tex: () => '',
    played,
    ...extra
  });
  b.game = { audio: { play: s => played.push(s) }, ...extra.game };
  return b;
};
const slotOf = b => b.heroBars.good.el.children.find(d => d._h);

// Tactical: the portrait feeds the same tooltip target as build and reinforcement icons.
{
  const b = bar(CommandBar.prototype, { tipTarget: null, world: { cantBuild: () => '' } });
  const shown = [];
  b.showInfo = (type, o) => shown.push([type, o]);
  const e = { id: 7, player: b.player, healthFrac: 1 };
  b.heroRow('good', [{ e, type: hero }]);
  const d = slotOf(b);
  assert(d.onmouseenter && d.onmouseleave, 'Own hero portrait reacts to hover');
  d.onmouseenter();
  assert.deepEqual(b.played, ['Mouse_Over_SFX']);
  assert(b.tipTarget, 'Hover arms the encyclopedia');
  b.tipTarget.show();
  assert.equal(shown[0][0], hero, 'Popup describes the hovered hero');
  d.onmouseleave();
  assert.equal(b.tipTarget, null, 'Leaving the portrait drops the popup');
  d.onmouseenter();
  b.heroRow('good', [{ e: { ...e, id: 8 }, type: hero }]);
  assert.equal(b.tipTarget, null, 'A portrait rebuilt under the cursor drops its popup');
  b.heroRow('good', [{ e: { id: 9, player: { id: 1 }, healthFrac: 1 }, type: hero }]);
  assert.equal(slotOf(b).onmouseenter, undefined, 'Allied portraits stay inert as before');
}

// Galactic: the portrait hands its unit to the galactic tooltip gate.
{
  const game = {};
  const b = bar(GalacticBar.prototype, { game });
  b.heroRow('good', [{ e: { id: 1, player: b.player, healthFrac: 1 }, type: hero, tip: team }]);
  const d = slotOf(b);
  d.onmouseenter();
  assert.equal(b.game.heroTip?.slot, d);
  const calls = [];
  const fake = Object.assign(Object.create(GalacticGame.prototype), b.game, {
    galacticLog: { encyclopedia: { showType: (t, droid) => calls.push([t, droid]) } },
    tips: { update() {}, hover: t => calls.push(t) }
  });
  fake.corruptionTip();
  const target = calls[0];
  assert(target?.show, 'Galactic tooltip gate gets the hero portrait');
  target.show();
  assert.deepEqual(calls[1], [team, false], 'Galactic popup shows the hero unit as the planet overview does');
  d.onmouseleave();
  assert.equal(b.game.heroTip, null);
  b.heroRow('good', [{ e: { id: 2, player: b.player, healthFrac: 1 }, type: hero, tip: team }]);
  slotOf(b).onmouseenter();
  b.heroRow('good', []);
  assert.equal(b.game.heroTip, null, 'A hero leaving the bar drops its popup');
}
console.log('hero tooltip ok');
