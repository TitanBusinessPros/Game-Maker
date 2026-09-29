const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const source = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
function gameHtml(config) {
  return source
    .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(config)};</script><script type="module">`)
    .replace('  window.__GM_DEBUG = {', `
      window.__resourceTest = { extraDeposits, defenseBlocksMining, setPlacingTurret, tryPlaceTurret,
        setPlacingMissile, tryPlaceMissileLauncher, produceMiner, runMoveOrder };
      window.__GM_DEBUG = {`);
}
async function openGame(browser, config) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const html = gameHtml(config);
  await page.route('**/*', route => route.request().url() === 'http://game.test/'
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.goto('http://game.test/');
  await page.waitForFunction(() => window.__resourceTest);
  return { page, errors };
}

(async () => {
  const browser = await launch();
  try {
    const crowded = await openGame(browser, {
      name: 'Crowded resource sites', mapSize: 'tiny', player: { name: 'Player' },
      computers: Array.from({ length: 5 }, (_, i) => ({ name: `CPU ${i + 1}` })),
      resources: [{ id: 'ore', name: 'Ore' }, { id: 'oil', name: 'Oil' }],
    });
    const positions = await crowded.page.evaluate(() => {
      const d = window.__GM_DEBUG, t = window.__resourceTest;
      return {
        factions: d.factions.map(f => ({ x: f.x, y: f.y })),
        buildings: d.GATED_BUILDINGS.map(b => ({ x: b.offsetX, y: b.offsetY })),
        deposits: d.deposits.concat(t.extraDeposits).map(p => ({ x: p.x, y: p.y })),
      };
    });
    assert.equal(positions.deposits.length, 18);
    for (const deposit of positions.deposits) {
      for (const base of positions.factions) {
        assert.ok(Math.hypot(deposit.x - base.x, deposit.y - base.y) >= 103,
          'deposit clears every Home Base and a miner');
        for (const building of positions.buildings) {
          assert.ok(Math.hypot(deposit.x - base.x - building.x, deposit.y - base.y - building.y) >= 86,
            'deposit clears every planned structure and a miner');
        }
      }
    }
    const minersReach = await crowded.page.evaluate(() => {
      const d = window.__GM_DEBUG, t = window.__resourceTest;
      return d.factions.map(f => {
        if (!t.produceMiner(f)) return false;
        const miner = d.units.at(-1);
        const deposit = d.deposits.find(p => p.factionId === f.id);
        for (let i = 0; i < 350 && miner.orderType; i++) t.runMoveOrder(miner, 0.1);
        return Math.hypot(miner.x - deposit.x, miner.y - deposit.y) < 80;
      });
    });
    assert.ok(minersReach.every(Boolean), 'every faction can mine its default Gold deposit');
    assert.deepEqual(crowded.errors, []);
    await crowded.page.close();
    console.log('PASS default resources clear base and structure sites on a crowded tiny map');

    const worldSize = 2 * (420 * 12 + 400);
    const shared = await openGame(browser, {
      name: 'Shared mining zone', mapSize: 'large', player: { name: 'Player' },
      computers: [{ name: 'Enemy' }],
      resource: { placement: { mode: 'map', points: [{ x: 0.5, y: 1000 / worldSize }] } },
      gunTurrets: [{ name: 'Cannon', hp: 300, attack: 100, range: 500, cost: 100 }],
      missileUnits: [{ name: 'Launcher', hp: 300, attack: 100, cost: 100 }],
    });
    const result = await shared.page.evaluate(() => {
      const d = window.__GM_DEBUG, t = window.__resourceTest;
      const player = d.factions[0];
      player.resources.gold = 1000;
      const near = { x: player.x, y: player.y + 300 };
      const far = { x: player.x, y: player.y - 300 };
      const before = player.resources.gold;
      const deposit = d.deposits[0];
      const insideBuffer = t.defenseBlocksMining(player.id, deposit.x + 679.9, deposit.y, 500);
      const outsideBuffer = t.defenseBlocksMining(player.id, deposit.x + 680, deposit.y, 500);
      t.setPlacingTurret({ factionId: player.id, defIndex: 0 });
      t.tryPlaceTurret(near);
      const denied = { count: d.units.length, gold: player.resources.gold, stillPlacing: !!d.placingTurret };
      t.tryPlaceTurret(far);
      player.built.missileSilo = true;
      const beforeMissile = player.resources.gold;
      t.setPlacingMissile({ factionId: player.id, defIndex: 0 });
      t.tryPlaceMissileLauncher(near);
      return {
        denied, before, after: player.resources.gold,
        turrets: d.units.filter(u => u.isTurret).map(u => ({ x: u.x, y: u.y })),
        clearAfter: !d.placingTurret, expectedFar: far, insideBuffer, outsideBuffer,
        missileDenied: { count: d.units.filter(u => u.isMissileLauncher).length,
          gold: player.resources.gold, before: beforeMissile, stillPlacing: !!d.placingMissile },
      };
    });
    assert.deepEqual(result.denied, { count: 0, gold: result.before, stillPlacing: true });
    assert.equal(result.turrets.length, 1);
    assert.deepEqual(result.turrets[0], result.expectedFar);
    assert.equal(result.after, result.before - 100);
    assert.equal(result.clearAfter, true);
    assert.equal(result.insideBuffer, true);
    assert.equal(result.outsideBuffer, false);
    assert.deepEqual(result.missileDenied, { count: 0, gold: result.after,
      before: result.after, stillPlacing: true });
    assert.deepEqual(shared.errors, []);
    console.log('PASS unsafe turret/launcher is denied without charge; safe turret is placed and charged');

    const oldPoint = await openGame(browser, {
      name: 'Legacy overlapping point', mapSize: 'large', player: { name: 'Player' },
      computers: [{ name: 'Enemy' }],
      resource: { placement: { mode: 'map', points: [{ x: (worldSize / 2 + 330) / worldSize, y: 400 / worldSize }] } },
    });
    const moved = await oldPoint.page.evaluate(() => {
      const d = window.__GM_DEBUG, deposit = d.deposits[0], base = d.factions[0];
      return Math.hypot(deposit.x - base.x - 330, deposit.y - base.y);
    });
    assert.ok(moved >= 86, 'older point is moved clear of the Missile Battery site');
    assert.deepEqual(oldPoint.errors, []);
    console.log('PASS older map points overlapping a planned structure move to a clear site');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
