const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const cfg = { name: 'Movement regression', mapSize: 'large', player: { name: 'Player' },
  computers: [{ name: 'Enemy' }], airUnits: [{ name: 'Troop', hp: 100, attack: 10, range: 80, speed: 10 }] };
let html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
html = html.replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`);
html = html.replace('  window.__GM_DEBUG = {', `
  window.__movementTest = { spawnUnit, issueMoveOrder, runMoveOrder, chaseTowardTarget,
    findPathAround, update, MOVE_PX_PER_SPEED, get workerReady() { return !!chasePathWorker; },
    clear() { units.length = 0; } };
  window.__GM_DEBUG = {`);

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://movement.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://movement.test/');
    await page.waitForFunction(() => window.__movementTest);
    const reports = await page.evaluate(() => {
      const t = window.__movementTest, d = window.__GM_DEBUG;
      const check = (value, message) => { if (!value) throw Error(message); };
      t.clear();
      d.factions[0].x = 2000; d.factions[0].y = 2000;
      d.factions[1].x = 4000; d.factions[1].y = 4000;
      const start = { x: 1750, y: 2000 }, goal = { x: 2250, y: 2000 };
      const route = t.findPathAround(start.x, start.y, goal.x, goal.y);
      check(route.length > 2, 'Scenario must route around the solid home base');
      const points = [start, ...route];
      const lengths = route.map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
      const total = lengths.reduce((a, b) => a + b, 0);
      function positionAt(distance) {
        for (let i = 0; i < lengths.length; i++) {
          if (distance <= lengths[i]) {
            const ratio = distance / lengths[i];
            return { x: points[i].x + (points[i+1].x-points[i].x)*ratio,
              y: points[i].y + (points[i+1].y-points[i].y)*ratio };
          }
          distance -= lengths[i];
        }
        return goal;
      }
      for (const mode of ['move', 'chase']) for (const speed of [1, 10, 50]) for (const fps of [30, 60, 144]) {
        const u = t.spawnUnit(0, 0, start.x, start.y);
        u.speed = speed;
        const sp = speed * t.MOVE_PX_PER_SPEED;
        if (mode === 'move') t.issueMoveOrder(u, goal.x, goal.y);
        let elapsed = 0;
        for (let frame = 0; elapsed * sp < total; frame++) {
          // Include an occasional long frame and verify no travel is lost.
          const dt = frame % 71 === 70 ? 0.2 : 1 / fps;
          elapsed += dt;
          u._isMoving = false;
          if (mode === 'move') t.runMoveOrder(u, dt);
          else t.chaseTowardTarget(u, goal.x, goal.y, sp, dt);
          const expected = positionAt(elapsed * sp);
          check(Math.hypot(u.x-expected.x, u.y-expected.y) < 0.01,
            `${mode}, speed ${speed}, ${fps} FPS, frame ${frame}: travel slowed or paused at a waypoint`);
          check(u._isMoving, `${mode}: moving animation stopped during travel`);
          check(Math.hypot(u.x-2000, u.y-2000) >= 65, 'Troop crossed solid base');
        }
        if (mode === 'move') check(!u.orderType, 'Move completes on the arrival frame');
      }
      return ['PASS continuous movement and chasing around a solid base at 30/60/144 FPS and three speeds',
        'PASS long frames, waypoint turns, walking animation, exact arrival and collision clearance'];
    });
    reports.forEach(report => console.log(report));
    await page.click('#startMatchBtn');
    const started = await page.evaluate(() => {
      const t = window.__movementTest, d = window.__GM_DEBUG;
      t.clear();
      d.factions[0].x = 2000; d.factions[0].y = 2000;
      d.factions[1].x = 2250; d.factions[1].y = 2000;
      const u = t.spawnUnit(0, 0, 1750, 2000);
      u.target = d.factions[1]; u.orderType = 'attack';
      t.combatTroop = u;
      t.update(1 / 60);
      return { workerReady: t.workerReady, requested: !!u._chaseWorkerJob };
    });
    assert.deepEqual(started, { workerReady: true, requested: true });
    await page.waitForFunction(() => window.__movementTest.combatTroop._chaseWaypoints?.length > 2);
    const followed = await page.evaluate(() => {
      const t = window.__movementTest, u = t.combatTroop;
      for (let frame = 0; frame < 360; frame++) {
        t.update(1 / 60);
        if (Math.hypot(u.x - 2000, u.y - 2000) < 65) throw Error('Worker route crossed solid base');
      }
      return { x: u.x, y: u.y };
    });
    assert(followed.x > 2000, 'Worker route must carry the combat troop around the base');
    console.log('PASS combat route is calculated in the worker and delivered around a solid base');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
