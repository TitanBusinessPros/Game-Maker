const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');
const categories = ['airUnits', 'warUnits', 'infantryUnits', 'heliUnits', 'navyUnits', 'fieldHospitalUnits', 'missileBatteryUnits', 'clericUnits'];
const cfg = { name: 'Structure regression', mapSize: 'large', player: {name:'Player'}, computers:[{name:'Enemy'}],
  obstacles: [{size:10,placement:{mode:'map',points:[{x:0.95,y:0.95}]}}],
  ...Object.fromEntries(categories.map(key => [key, [{name:key,hp:100,attack:10,range:80,speed:10,cost:1,prodTime:1}]])) };
let html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
html = html.replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`);
html = html.replace('  window.__GM_DEBUG = {', `
  window.__test = { startProduction, advanceProduction, productionBuilding, spawnGatedBuildingEntity,
    spawnUnit, produceMiner, findSpawnPoint, issueMoveOrder, runMoveOrder, chaseTowardTarget,
    syncStructureObstacles, moveAlongClearSegment, distanceToTarget, unitDefs, unitVisualSize,
    bounds: {worldMinX, worldMaxX, worldMinY, worldMaxY},
    clear() { units.length = 0; }, terrainObstacleCount, serializeState,
  };
  window.__GM_DEBUG = {`);
(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url() === 'http://game.test/'
      ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
    await page.goto('http://game.test/');
    await page.waitForFunction(() => window.__test);
    const reports = await page.evaluate(() => {
      const t = window.__test, d = window.__GM_DEBUG, f = d.factions[0], enemy = d.factions[1];
      const reports = [];
      const check = (value, message) => { if (!value) throw Error(message); };
      const cx = 2000, cy = 2000;
      f.x = cx-600; f.y = cy; enemy.x = cx+600; enemy.y = cy;
      for (let index = 0; index < t.unitDefs.length; index++) {
        t.clear();
        const key = t.unitDefs[index].buildingKey;
        f.built[key] = true;
        f.buildQueue[key] = [];
        check(!t.startProduction(f, index), `${key} cannot queue with stale built flag`);
        const building = t.spawnGatedBuildingEntity(f, key);
        building.x = cx; building.y = cy;
        check(t.startProduction(f, index), `${key} queues at living building`);
        t.advanceProduction(f, 2);
        const troop = d.units.find(u => !u.isGatedBuilding);
        check(troop && Math.hypot(troop.x-cx, troop.y-cy) < 200, `${key} spawns beside own building`);
        check(Math.hypot(troop.x-cx, troop.y-cy) > t.unitVisualSize(building)/2 + 20, 'spawn outside building');
        check(t.startProduction(f, index), 'second queue');
        building.alive = false; building.hp = 0;
        t.advanceProduction(f, 2);
        check(d.units.filter(u => !u.isGatedBuilding).length === 1 && !f.buildQueue[key].length, 'destroyed building cancels queue');
        check(!t.startProduction(f,index), 'dead producer rejects production');
      }
      reports.push('PASS every troop category spawns at its living producer; missing/destroyed producers block production');
      t.clear();
      const building = t.spawnGatedBuildingEntity(f, t.unitDefs[0].buildingKey);
      building.x = cx; building.y = cy;
      const troop = t.spawnUnit(f.id, 0, cx-250, cy);
      t.issueMoveOrder(troop, cx+250, cy);
      for (let i=0; i<500 && troop.orderType; i++) {
        t.runMoveOrder(troop, 0.02);
        check(Math.hypot(troop.x-cx,troop.y-cy) >= t.unitVisualSize(building)/2+20-0.1, 'route enters building');
      }
      check(Math.hypot(troop.x-cx-250,troop.y-cy) < 5, 'route reaches other side of building');
      troop.x=cx-250; troop.y=cy;
      t.moveAlongClearSegment(troop,cx+250,cy,500);
      check(troop.x < cx, 'high-speed movement cannot tunnel through structure');
      building.alive=false;
      t.syncStructureObstacles();
      troop.x=cx-250; troop.y=cy;
      t.issueMoveOrder(troop,cx+250,cy);
      building.alive=true;
      for(let i=0;i<500 && troop.orderType;i++) t.runMoveOrder(troop,0.02);
      check(Math.hypot(troop.x-cx-250,troop.y-cy)<5,'route replans when new structure appears');
      t.issueMoveOrder(troop,cx,cy);
      for(let i=0;i<500 && troop.orderType;i++) t.runMoveOrder(troop,0.02);
      check(!troop.orderType && Math.hypot(troop.x-cx,troop.y-cy)>48,'clicking building stops outside it');
      reports.push('PASS routes around structures, fast movement, new building replanning and inside-building destinations');
      building.alive=false;
      troop.x=f.x-250;troop.y=f.y;
      t.issueMoveOrder(troop,f.x+250,f.y);
      for(let i=0;i<500 && troop.orderType;i++) {
        t.runMoveOrder(troop,0.02);
        check(Math.hypot(troop.x-f.x,troop.y-f.y)>=65-0.1,'route enters home base');
      }
      check(Math.hypot(troop.x-(f.x+250),troop.y-f.y)<5,'home base route completes');
      check(t.produceMiner(f),'miner spawns at base');
      const miner=d.units.at(-1);
      check(Math.hypot(miner.x-f.x,miner.y-f.y)>65,'miner spawns outside base');
      f.hp=0;
      check(!t.produceMiner(f),'no miner without base');
      reports.push('PASS home base collision and mining spawn requirements');
      f.hp=2000;
      building.alive=true;building.hp=2000;
      const key=building.buildingKey;
      check(t.startProduction(f,0),'queue before capture');
      building.factionId=enemy.id;
      t.advanceProduction(f,2);
      check(!f.buildQueue[key].length && !t.startProduction(f,0),'captured building no longer produces for old owner');
      check(t.startProduction(enemy,0),'captured producer works for new owner');
      t.advanceProduction(enemy,2);
      check(d.units.at(-1).factionId===enemy.id && Math.hypot(d.units.at(-1).x-cx,d.units.at(-1).y-cy)<200,'captured producer spawns at its real location');
      reports.push('PASS captured building ownership and actual spawn location');
      troop.x=cx-250;troop.y=cy;
      for(let i=0;i<300;i++) t.chaseTowardTarget(troop,cx,cy,200,0.02);
      check(t.distanceToTarget(troop,building)<10,'short-range attacks can approach structure edge');
      check(Math.hypot(troop.x-cx,troop.y-cy)>=48,'combat approach remains outside structure');
      const terrain=d.obstacles[0], savedTerrain={...terrain};
      terrain.x=cx;terrain.y=cy;terrain.radius=20000;
      check(t.startProduction(enemy,0),'queue with blocked exit');
      const before=d.units.length;
      t.advanceProduction(enemy,2);
      check(d.units.length===before && enemy.buildQueue[key].length===1,'blocked production stays queued');
      Object.assign(terrain,savedTerrain);
      t.advanceProduction(enemy,0.1);
      check(d.units.length===before+1 && !enemy.buildQueue[key].length,'cleared exit releases finished troop');
      reports.push('PASS close-range structure approach and blocked-exit production retention');
      return reports;
    });
    reports.forEach(line => console.log(line));
    const saved = await page.evaluate(() => window.__test.serializeState());
    await page.setInputFiles('#loadInput', {name:'match.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(() => !document.getElementById('teamSelectScreen').classList.contains('show'));
    const captured = await page.evaluate(() => window.__GM_DEBUG.units.find(u => u.isGatedBuilding && u.factionId === 1));
    assert.equal(captured.x, 2000);
    assert.equal(captured.y, 2000);
    console.log('PASS full saved-game reload preserves captured building location');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
