const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const cfg = {
  name: 'Area defenders', mapSize: 'large', player: { name: 'Blue' },
  computers: [{ name: 'Red' }],
  airUnits: [{ placementId: 'test-guard', name: 'Guard', hp: 100, attack: 20, range: 40, speed: 8 }],
  areaDefenders: [
    { placementId: 'test-guard', factionId: 0, range: 300, x: 0.5, y: 0.5 },
    { placementId: 'test-guard', factionId: 1, range: 100, x: 0.1, y: 0.1 },
  ],
};
const source = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const html = source
  .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`)
  .replace('  window.__GM_DEBUG = {', `
    window.__areaTest = { spawnUnit, areaDefenderTick, serializeState };
    window.__GM_DEBUG = {`);

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://area.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://area.test/');
    await page.waitForFunction(() => window.__areaTest);
    await page.click('#startMatchBtn');
    const result = await page.evaluate(() => {
      const { units } = window.__GM_DEBUG;
      const { spawnUnit, areaDefenderTick, serializeState } = window.__areaTest;
      const guard = units.find(u => u.defendPost && u.factionId === 0);
      const enemyGuard = units.find(u => u.defendPost && u.factionId === 1);
      if (!guard || !enemyGuard) throw Error('Both players must receive their placed defender');
      if (guard.defendPost.range !== 300 || enemyGuard.defendPost.range !== 100) throw Error('Wrong patrol radius');
      const post = { ...guard.defendPost };
      const outside = spawnUnit(1, 0, post.x + 400, post.y);
      for (let i = 0; i < 20; i++) areaDefenderTick(guard, 1 / 30);
      if (guard.target || Math.hypot(guard.x - post.x, guard.y - post.y) > 1) throw Error('Guard left post for out-of-range enemy');
      outside.alive = false;
      const retreating = spawnUnit(1, 0, post.x + 220, post.y);
      for (let i = 0; i < 20; i++) areaDefenderTick(guard, 1 / 30);
      if (Math.hypot(guard.x - post.x, guard.y - post.y) < 10) throw Error('Guard did not pursue intruder');
      retreating.x = post.x + 400;
      for (let i = 0; i < 100; i++) areaDefenderTick(guard, 1 / 30);
      if (guard.target || Math.hypot(guard.x - post.x, guard.y - post.y) > 3 || !retreating.alive) {
        throw Error('Guard did not disengage when intruder left patrol radius');
      }
      retreating.alive = false;
      const intruder = spawnUnit(1, 0, post.x + 220, post.y);
      intruder.hp = 5;
      let moved = false;
      for (let i = 0; i < 200 && intruder.alive; i++) {
        areaDefenderTick(guard, 1 / 30);
        if (Math.hypot(guard.x - post.x, guard.y - post.y) > 10) moved = true;
      }
      if (!moved || intruder.alive) throw Error('Guard did not pursue and eliminate enemy inside patrol radius');
      for (let i = 0; i < 200 && Math.hypot(guard.x - post.x, guard.y - post.y) > 3; i++) areaDefenderTick(guard, 1 / 30);
      if (Math.hypot(guard.x - post.x, guard.y - post.y) > 3) throw Error('Guard did not return to post');
      const saved = serializeState();
      if (!saved.units.some(u => u.defendPost?.range === 300)) throw Error('Save omitted defender post');
      return { saved, count: units.filter(u => u.defendPost && u.alive).length };
    });
    assert.equal(result.count, 2);
    console.log('PASS player-owned defenders patrol 100–1000 range, ignore distant enemies, kill intruders and return');
    await page.reload();
    await page.waitForFunction(() => window.__areaTest);
    await page.locator('#loadInput').setInputFiles({ name: 'defenders.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.saved)) });
    await page.waitForFunction(() => window.__GM_DEBUG.units.some(u => u.defendPost));
    const resumed = await page.evaluate(() => window.__GM_DEBUG.units.filter(u => u.defendPost && u.alive).map(u => ({ owner: u.factionId, range: u.defendPost.range })));
    assert.deepEqual(resumed.sort((a, b) => a.owner - b.owner), [{ owner: 0, range: 300 }, { owner: 1, range: 100 }]);
    assert.deepEqual(errors, []);
    console.log('PASS save-game loading restores defenders without spawning duplicates');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
