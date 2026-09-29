const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const art = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const cfg = {
  name: 'Placed structures', mapSize: 'large', player: { name: 'Blue' }, computers: [{ name: 'Red' }],
  airBase: { name: 'Air Base', hp: 2000, cost: 150, image: art, allowedFactions: [1] },
  missileSilo: { name: 'Missile Silo', hp: 2000, cost: 150, image: art },
  airUnits: [{ name: 'Jet', hp: 100, attack: 10, range: 80, speed: 10, prodTime: 1, costs: { gold: 1 } }],
  gunTurrets: [{ placementId: 'flak', name: 'Flak', hp: 300, attack: 20, range: 500, autoAttack: true }],
  missileUnits: [{ placementId: 'rocket', name: 'Rocket', hp: 300, attack: 30, missileSpeed: 4 }],
  placedStructures: [
    { kind: 'building', buildingKey: 'airBase', factionId: 0, x: .5, y: .5 },
    { kind: 'building', buildingKey: 'airBase', factionId: 0, x: .6, y: .5 },
    { kind: 'building', buildingKey: 'missileSilo', factionId: 0, x: .4, y: .5 },
    { kind: 'building', buildingKey: 'warFactory', factionId: 0, x: .1, y: .9 },
    { kind: 'launcher', placementId: 'rocket', factionId: 0, x: .42, y: .5 },
    { kind: 'turret', placementId: 'flak', factionId: 1, x: .7, y: .5 },
    { kind: 'turret', placementId: 'flak', factionId: 1, x: .501, y: .5 },
  ],
};
const source = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const html = source
  .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`)
  .replace('  window.__GM_DEBUG = {', `window.__placementGameTest = { startProduction, advanceProduction, applyDamageToTarget, serializeState };
  window.__GM_DEBUG = {`);

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://placed.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://placed.test/');
    await page.waitForFunction(() => window.__placementGameTest);
    await page.click('#startMatchBtn');
    const saved = await page.evaluate(() => {
      const d = window.__GM_DEBUG, t = window.__placementGameTest;
      const player = d.factions[0], buildings = d.units.filter(u => u.isGatedBuilding && u.buildingKey === 'airBase');
      if (buildings.length !== 2 || !player.built.airBase) throw Error('Map-placed producers did not unlock');
      if (d.units.some(u => u.isGatedBuilding && u.buildingKey === 'warFactory')) throw Error('Artless placed building became a placeholder');
      if (d.units.filter(u => u.isTurret).length !== 1) throw Error('Turret placement or 500-unit exclusion failed');
      if (d.units.filter(u => u.isMissileLauncher).length !== 1 || !player.built.missileSilo) throw Error('Silo/launcher placement failed');
      const button = document.getElementById('unitBtn-0');
      if (!button || button.disabled) throw Error('Placed producer did not unlock its unit without Research Facility');
      if (!t.startProduction(player, 0)) throw Error('Placed producer could not queue unit');
      t.advanceProduction(player, 2);
      const first = d.units.find(u => !u.isGatedBuilding && !u.isTurret && !u.isMissileLauncher && !u.isMiner);
      if (!first || Math.hypot(first.x - buildings[0].x, first.y - buildings[0].y) > 200) throw Error('Unit did not spawn by placed producer');
      if (!t.startProduction(player, 0)) throw Error('Second production failed');
      t.advanceProduction(player, 2);
      const second = d.units.filter(u => !u.isGatedBuilding && !u.isTurret && !u.isMissileLauncher && !u.isMiner).at(-1);
      if (!second || Math.hypot(second.x - buildings[1].x, second.y - buildings[1].y) > 200) throw Error('Second producer was not used');
      if (!t.startProduction(player, 0)) throw Error('Third production failed');
      t.applyDamageToTarget(buildings[0], buildings[0].hp + 1, 1);
      if (!player.built.airBase || !player.buildQueue.airBase.length) throw Error('One destroyed producer disabled a surviving copy');
      t.advanceProduction(player, 2);
      const third = d.units.filter(u => !u.isGatedBuilding && !u.isTurret && !u.isMissileLauncher && !u.isMiner).at(-1);
      if (!third || Math.hypot(third.x - buildings[1].x, third.y - buildings[1].y) > 200) throw Error('Surviving producer did not spawn unit');
      const state = t.serializeState();
      if (!state.units.some(u => u.isGatedBuilding && u.mapPlaced && u.x === buildings[1].x)) throw Error('Save omitted placed building location');
      return state;
    });
    await page.reload();
    await page.waitForFunction(() => window.__placementGameTest);
    await page.locator('#loadInput').setInputFiles({ name: 'structures.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await page.waitForFunction(() => !document.getElementById('teamSelectScreen').classList.contains('show'));
    const resumed = await page.evaluate(() => ({
      buildings: window.__GM_DEBUG.units.filter(u => u.isGatedBuilding && u.buildingKey === 'airBase').length,
      turrets: window.__GM_DEBUG.units.filter(u => u.isTurret).length,
      launchers: window.__GM_DEBUG.units.filter(u => u.isMissileLauncher).length,
      ready: !document.getElementById('unitBtn-0').disabled,
    }));
    assert.deepEqual(resumed, { buildings: 1, turrets: 1, launchers: 1, ready: true });
    assert.deepEqual(errors, []);
    console.log('PASS match starts with owned placed defenses and production; surviving duplicate keeps production; save reload has no duplicates');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
