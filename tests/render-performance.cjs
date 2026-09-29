const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');
const cfg = { name: 'Rendering regression', mapSize: 'large', player: { name: 'Player' },
  computers: [{ name: 'Enemy' }], mapGradient: { start: '#0b1b35', end: '#294765' },
  airUnits: [{ name: 'Troop', hp: 100, attack: 10, range: 80, speed: 10 }] };
let html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
html = html.replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`);
html = html.replace('  window.__GM_DEBUG = {', `
  window.__renderTest = { render, drawMapGradient, resizeCanvasOnly, canvas, gradientCanvas,
    bounds: { worldMinX, worldMinY, worldMaxX, worldMaxY, worldW, worldH } };
  window.__GM_DEBUG = {`);
(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://render.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://render.test/');
    await page.waitForFunction(() => window.__renderTest);
    const results = await page.evaluate(() => {
      const t = window.__renderTest, d = window.__GM_DEBUG, b = t.bounds;
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const original = CanvasRenderingContext2D.prototype.createLinearGradient;
      let paints = 0;
      CanvasRenderingContext2D.prototype.createLinearGradient = function(...args) {
        if (this.canvas === t.gradientCanvas) paints++;
        return original.apply(this, args);
      };
      d.camera.x += 1;
      t.drawMapGradient();
      for (let i = 0; i < 120; i++) t.drawMapGradient();
      check(paints === 1, 'A stationary view must rasterize the gradient only once');
      const cases = [
        { x: (b.worldMinX+b.worldMaxX)/2, y: (b.worldMinY+b.worldMaxY)/2, zoom: 0.2, width: 900, height: 600 },
        { x: b.worldMinX, y: b.worldMinY, zoom: 1, width: 900, height: 600 },
        { x: b.worldMaxX, y: b.worldMaxY, zoom: 2, width: 640, height: 480 },
      ];
      for (const view of cases) {
        Object.assign(d.camera, { x:view.x, y:view.y, zoom:view.zoom });
        t.canvas.width = view.width; t.canvas.height = view.height;
        const before = paints;
        t.drawMapGradient();
        check(paints === before+1, 'Pan/zoom/resize must refresh the cached view');
        check(t.gradientCanvas.width === view.width && t.gradientCanvas.height === view.height, 'Cache stays viewport-sized');
        const ref = document.createElement('canvas'); ref.width=view.width; ref.height=view.height;
        const ctx = ref.getContext('2d');
        ctx.fillStyle='#06121f'; ctx.fillRect(0,0,ref.width,ref.height);
        ctx.setTransform(view.zoom,0,0,view.zoom,ref.width/2-view.x*view.zoom,ref.height/2-view.y*view.zoom);
        const gradient=ctx.createLinearGradient(b.worldMinX,b.worldMinY,b.worldMaxX,b.worldMaxY);
        gradient.addColorStop(0,'#0b1b35');gradient.addColorStop(1,'#294765');
        ctx.fillStyle=gradient;ctx.fillRect(b.worldMinX,b.worldMinY,b.worldW,b.worldH);
        const expected=ctx.getImageData(0,0,ref.width,ref.height).data;
        const actual=t.canvas.getContext('2d').getImageData(0,0,ref.width,ref.height).data;
        for (let i=0;i<expected.length;i++) check(Math.abs(expected[i]-actual[i])<=1, 'Cached background must preserve the original gradient pixels');
      }
      t.render();
      const observer = new MutationObserver(()=>{});
      for (const id of ['topbar','sidePanel']) observer.observe(document.getElementById(id), {subtree:true,childList:true,attributes:true,characterData:true});
      for (let i=0;i<120;i++) t.render();
      const mutations=observer.takeRecords();
      check(mutations.length===0, 'Unchanged controls must not mutate each frame: '+mutations.length);
      const hud=document.getElementById('hudRow'), previous=hud.textContent;
      d.factions[0].resources.gold += 100;
      d.factions[0].hp -= 50;
      t.render();
      check(hud.textContent!==previous && hud.textContent.includes(String(Math.round(d.factions[0].hp))), 'Resources and HP still update immediately');
      observer.disconnect();
      CanvasRenderingContext2D.prototype.createLinearGradient=original;
      return ['PASS background cache reuse, camera/zoom/resize invalidation and original gradient pixels',
        'PASS 120 unchanged frames produce zero interface mutations; resources and HP remain live'];
    });
    results.forEach(result=>console.log(result));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
