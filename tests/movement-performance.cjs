// Profile the full game with the artwork/configuration from a downloaded map.
// Usage: node tests/movement-performance.cjs downloaded-game.html [--trace] [--battle]
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./browser-config.cjs');
const saved = fs.readFileSync(process.argv[2], 'utf8');
const config = JSON.parse(saved.match(/window.GM_INLINE_CONFIG = (.*?);<\/script>/s)[1]);
let html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8').replace(/\r\n/g, '\n');
html = html.replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(config).replace(/</g, '\\u003c')};</script><script type="module">`);
html = html.replace('  let last = performance.now();', `
  const metrics = window.__metrics = { frames: [], sections: {}, syncCalls: 0, mutations: 0, resizes: 0,
    currentPathMs: 0, currentPathCalls: 0, currentUpdateMs: 0 };
  for (const name of ['update', 'render', 'renderHud', 'updateProductionStatus', 'syncStructureObstacles', 'buildPathGraph', 'pathNeighbors', 'findPathAround']) {
    const original = eval(name);
    eval(name + ' = function(...args) { const start = performance.now(); try { return original(...args); } finally { const duration = performance.now() - start; (metrics.sections[name] ||= []).push(duration); if (name === "findPathAround") { metrics.currentPathMs += duration; metrics.currentPathCalls++; } if (name === "update") metrics.currentUpdateMs = duration; } }');
  }
  const observe = new MutationObserver(records => metrics.mutations += records.length);
  observe.observe(document.getElementById('topbar'), {subtree:true, childList:true, attributes:true, characterData:true});
  observe.observe(document.getElementById('sidePanel'), {subtree:true, childList:true, attributes:true, characterData:true});
  const oldResize = resizeCanvasOnly;
  resizeCanvasOnly = () => { metrics.resizes++; oldResize(); };
  window.__scenario = count => {
    units.length = 0;
    const battle = ${process.argv.includes('--battle')};
    for (const f of factions) {
      f._aiTimer = battle ? 0 : 10000;
      for (const key in f.buildQueue) f.buildQueue[key] = [];
      if (battle) {
        for (const key in f.resources) f.resources[key] = 10000;
        for (const b of GATED_BUILDINGS.filter(b => canFactionUseBuilding(b, f.id)).slice(0, 5)) {
          f.built[b.key] = true; spawnGatedBuildingEntity(f, b.key);
        }
      }
    }
    const index = Math.max(0, unitImages.findIndex(img => img?._gmAnimation));
    camera.x = player.x; camera.y = player.y + 500;
    for (let i=0; i<count; i++) {
      const faction = battle ? factions[i % factions.length] : player;
      const u = spawnUnit(faction.id, index, faction.x - 300 + i % 10 * 25, faction.y + 300 + Math.floor(i/10)*25);
      if (faction === player) issueMoveOrder(u, u.x + 3000, u.y);
    }
    metrics.frames = []; metrics.sections = {}; metrics.mutations = metrics.resizes = 0; metrics.previous = 0;
  };
  let last = performance.now();`);
html = html.replace('    update(dt);\n    render();', `
    metrics.currentPathMs = metrics.currentPathCalls = metrics.currentUpdateMs = 0;
    const startFrame = performance.now();
    update(dt); render();
    metrics.frames.push({ gap: now - (metrics.previous || now), work: performance.now() - startFrame,
      update: metrics.currentUpdateMs, path: metrics.currentPathMs, pathCalls: metrics.currentPathCalls,
      transports: units.filter(u => u.alive && u.transportCapacity).length });
    metrics.previous = now;`);

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => console.error(error));
    await page.route('**/*', route => route.request().url() === 'http://profile.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://profile.test/');
    await page.waitForFunction(() => window.__scenario, null, { timeout: 60000 });
    await page.click('#startMatchBtn');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (const count of process.argv.includes('--trace') ? [1] : process.argv.includes('--battle') ? [32] : [1, 100]) {
      await page.evaluate(count => window.__scenario(count), count);
      const before = (await cdp.send('Performance.getMetrics')).metrics;
      const events = [];
      const collect = data => events.push(...data.value);
      if (process.argv.includes('--trace')) {
        cdp.on('Tracing.dataCollected', collect);
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
      }
      await page.waitForTimeout(process.argv.includes('--battle') ? 20000 : 6000);
      if (process.argv.includes('--trace')) {
        const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        await done;
        cdp.off('Tracing.dataCollected', collect);
        const main = events.find(e => e.name === 'thread_name' && e.args.name === 'CrRendererMain');
        const sums = {};
        for (const e of events) if (e.ph === 'X' && e.tid === main?.tid && e.pid === main?.pid) {
          const v = sums[e.name] ||= {totalMs:0,maxMs:0,count:0}; v.totalMs += e.dur/1000; v.maxMs = Math.max(v.maxMs,e.dur/1000); v.count++;
        }
        console.log('TRACE ' + JSON.stringify(Object.entries(sums).sort((a,b)=>b[1].totalMs-a[1].totalMs).slice(0,25)));
      }
      const after = (await cdp.send('Performance.getMetrics')).metrics;
      const report = await page.evaluate(() => {
        const m = window.__metrics;
        const stats = values => {
          values = values.slice().sort((a,b) => a-b);
          return {n:values.length, mean:values.reduce((a,b)=>a+b,0)/values.length,
            p95:values[Math.floor(values.length*.95)], max:values.at(-1)};
        };
        const worstGapIndex = m.frames.reduce((best, frame, i) => frame.gap > m.frames[best].gap ? i : best, 1);
        const worstWork = m.frames.reduce((best, frame) => frame.work > best.work ? frame : best, m.frames[0]);
        return {gap:stats(m.frames.slice(1).map(f=>f.gap)),work:stats(m.frames.map(f=>f.work)),
          worstGapPreviousFrame:m.frames[worstGapIndex-1], worstWorkFrame:worstWork,
          framesOver50ms:m.frames.filter(f=>f.gap>50.5).length,
          sections:Object.fromEntries(Object.entries(m.sections).map(([k,v])=>[k,stats(v)])),
          mutations:m.mutations,resizes:m.resizes};
      });
      const perf = Object.fromEntries(after.filter(m=>/Duration|Count/.test(m.name)).map(m=>[m.name,m.value-(before.find(b=>b.name===m.name)?.value||0)]));
      console.log(JSON.stringify({map:config.name,count,...report,perf}));
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode=1;});
