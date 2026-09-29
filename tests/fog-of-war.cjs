const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const cfg = {
  name: 'Fog regression', mapSize: 'small', gameStyle: 'turnbased', fogOfWar: true,
  player: { name: 'Blue' }, computers: [{ name: 'Red' }],
  airUnits: [{ name: 'Scout Jet', hp: 100, attack: 5, range: 50, speed: 10 }],
};
const source = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const html = source
  .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`)
  .replace('  window.__GM_DEBUG = {', `
    window.__fogTest = {
      spawnUnit, render, sightSources, inSight, exploredMaps, serializeState, handleClick,
      worldMinX, worldMinY, worldW, worldH,
      setViewer(id) { activeIdx = id; activeFaction = factions[id]; },
    };
    window.__GM_DEBUG = {`);

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://fog.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://fog.test/');
    await page.waitForFunction(() => window.__fogTest);
    await page.click('#startMatchBtn');
    const result = await page.evaluate(() => {
      const t = window.__fogTest, d = window.__GM_DEBUG;
      const [own, enemy] = d.factions;
      const canvas = document.getElementById('canvas');
      const minimap = document.getElementById('minimap');
      const ctx = canvas.getContext('2d'), mini = minimap.getContext('2d');
      function worldPixel(x, y) {
        d.camera.x = x; d.camera.y = y; t.render();
        return [...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data];
      }
      const sources = t.sightSources();
      if (t.inSight(enemy.x, enemy.y, sources)) throw Error('Enemy base visible at match start');
      if (!t.inSight(own.x + 100, own.y, sources) || t.inSight(own.x + 101, own.y, sources)) {
        throw Error('Base sight radius is not exactly 100 world units');
      }
      const hidden = worldPixel(enemy.x, enemy.y);
      if (hidden[0] !== 1 || hidden[1] !== 5 || hidden[2] !== 11) throw Error(`Unexplored main map leaked: ${hidden}`);
      const scout = t.spawnUnit(own.id, 0, own.x, own.y);
      scout.selected = true;
      const rect = canvas.getBoundingClientRect();
      t.handleClick({ clientX: rect.left + canvas.width / 2, clientY: rect.top + canvas.height / 2 });
      if (scout.target === enemy || scout.orderType === 'attack') throw Error('Hidden enemy base accepted an attack click');
      scout.selected = false;
      scout.moveTarget = null; scout.orderType = null;
      const dx = enemy.x - own.x, dy = enemy.y - own.y;
      const distance = Math.hypot(dx, dy);
      scout.x = enemy.x - dx / distance * 90;
      scout.y = enemy.y - dy / distance * 90;
      if (!t.inSight(enemy.x, enemy.y, t.sightSources())) throw Error('100-unit scout sight did not reach enemy');
      const revealed = worldPixel(enemy.x, enemy.y);
      if (revealed[0] === 1 && revealed[1] === 5 && revealed[2] === 11) throw Error('Discovered base stayed black');
      const miniPoint = { x: Math.round((enemy.x - t.worldMinX) * 180 / t.worldW), y: Math.round((enemy.y - t.worldMinY) * 180 / t.worldH) };
      const marker = [...mini.getImageData(miniPoint.x, miniPoint.y, 1, 1).data];
      scout.x = own.x; scout.y = own.y;
      const remembered = worldPixel(enemy.x, enemy.y);
      if (remembered[0] === 1 && remembered[1] === 5 && remembered[2] === 11) throw Error('Explored terrain was forgotten');
      if (t.inSight(enemy.x, enemy.y, t.sightSources())) throw Error('Enemy stayed visible after scout left');
      const oldMarker = [...mini.getImageData(miniPoint.x, miniPoint.y, 1, 1).data];
      if (marker.join() === oldMarker.join()) throw Error('Enemy minimap marker remained outside current sight');
      t.setViewer(enemy.id);
      const enemyView = worldPixel(own.x, own.y);
      if (enemyView[0] !== 1 || enemyView[1] !== 5 || enemyView[2] !== 11) throw Error('Exploration leaked across opposing players');
      t.setViewer(own.id);
      const enemyTeam = enemy.team;
      enemy.team = own.team;
      if (!t.inSight(enemy.x, enemy.y, t.sightSources())) throw Error('Allied units and bases did not share sight');
      enemy.team = enemyTeam;
      const saved = t.serializeState();
      if (!saved.exploredMaps?.[own.id]?.startsWith('data:image/png;base64,')) throw Error('Exploration missing from save');
      return { saved, hidden, revealed, remembered, enemyMapPoint: {
        x: Math.round((enemy.x - t.worldMinX) * 512 / t.worldW),
        y: Math.round((enemy.y - t.worldMinY) * 512 / t.worldH),
      } };
    });
    assert.deepEqual(errors, []);
    console.log('PASS unexplored world, 100-unit discovery, minimap markers, hidden clicks, terrain memory, player separation');
    await page.reload();
    await page.waitForFunction(() => window.__fogTest);
    await page.locator('#loadInput').setInputFiles({ name: 'fog.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.saved)) });
    await page.waitForFunction(() => window.__GM_DEBUG.units.length > 0);
    const restored = await page.evaluate(({ x, y }) => {
      const { exploredMaps } = window.__fogTest;
      const pixel = exploredMaps[0].getContext('2d').getImageData(x, y, 1, 1).data;
      return pixel[3];
    }, result.enemyMapPoint);
    assert.ok(restored > 0, 'Save/load lost explored terrain');
    assert.deepEqual(errors, []);
    console.log('PASS explored terrain survives save/load');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
