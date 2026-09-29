// Usage: node tests/gif-performance.cjs <downloaded-game.html> [old-decoder.js]
// Uses the map's own art and units in the full game, with network disabled.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, pageOptions } = require('./browser-config.cjs');

(async () => {
  const saved = fs.readFileSync(process.argv[2], 'utf8');
  const config = JSON.parse(saved.match(/window.GM_INLINE_CONFIG = (.*?);<\/script>/s)[1]);
  const template = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8').replace(/\r\n/g, '\n');
  const browser = await launch();
  const reports = [];
  try {
    const scenarios = process.argv[3] ? ['previous-1', 'cached-1', 'cached-100'] : ['cached-1', 'cached-100'];
    for (const scenario of scenarios) {
      let html = template;
      if (scenario.startsWith('previous')) html = html.replace(/<!-- GIF PLAYER START -->[\s\S]*?<!-- GIF PLAYER END -->/, () => '<script>' + fs.readFileSync(process.argv[3], 'utf8') + '</script>');
      html = html.replace('<script type="module">', () => '<script>window.GM_INLINE_CONFIG = ' + JSON.stringify(config).replace(/</g, '\\u003c') + ';</script><script type="module">');
      html = html.replace('  let last = performance.now();', `
        window.__profile = { frames: [], gaps: [], gif: [], units: 0, active: false, spawned: [] };
        window.__addGifUnits = count => {
          const index = unitImages.findIndex(image => image?._gmAnimation);
          if (index < 0) throw Error('No animated GIF character in this map');
          const animation = unitImages[index]._gmAnimation;
          const original = animation.frameAt.bind(animation);
          animation.frameAt = now => { const begin = performance.now(); const frame = original(now); if(window.__profile.active) window.__profile.gif.push(performance.now()-begin); return frame; };
          for(let i=0;i<count;i++) {
            spawnUnit(player.id,index,player.x + (i%10)*35-150,player.y+Math.floor(i/10)*35-150);
            const unit = units[units.length-1];
            window.__profile.spawned.push(unit);
            unit._testStart = {x:unit.x,y:unit.y};
            issueMoveOrder(unit,unit.x+150,unit.y+100);
          }
          window.__profile.units=count;
          window.__profile.cacheBytes=animation.cacheBytes || null;
          window.__profile.active = true;
        };
        let last = performance.now();`);
      html = html.replace('    update(dt);\n    render();', `
        const measureStart=performance.now();
        update(dt); render();
        if(window.__profile.active) {window.__profile.frames.push(performance.now()-measureStart);window.__profile.gaps.push(now-(window.__previousNow||now));}
        window.__previousNow=now;`);
      const page = await browser.newPage(pageOptions);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => route.request().url() === 'http://offline-game.test/'
        ? route.fulfill({ contentType:'text/html',body:html }) : route.abort());
      await page.goto('http://offline-game.test/');
      await page.waitForFunction(() => typeof window.__addGifUnits === 'function');
      await page.click('#startMatchBtn');
      await page.waitForFunction(() => !document.getElementById('teamSelectScreen').classList.contains('show'));
      await page.evaluate(count => window.__addGifUnits(count), scenario.endsWith('-100') ? 100 : 1);
      await new Promise(resolve => setTimeout(resolve, 6000));
      const report = await page.evaluate(() => {
        const p=window.__profile;
        const stat = values => {values=values.slice(5).sort((a,b)=>a-b);return {samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values[Math.floor(values.length*.95)]};};
        return {units:p.units,cacheBytes:p.cacheBytes,gameWork:stat(p.frames),frameGap:stat(p.gaps),gifLookup:stat(p.gif),movedUnits:p.spawned.filter(u=>Math.hypot(u.x-u._testStart.x,u.y-u._testStart.y)>1).length};
      });
      assert.deepEqual(errors, [], 'No game script errors');
      assert(report.gameWork.samples > 0, 'Full game loop must be measured');
      assert(report.gifLookup.samples > 0, 'GIF must actually be visible and drawn');
      assert(report.movedUnits > 0, 'Movement commands must work during animation');
      if (!scenario.startsWith('previous')) assert(report.gifLookup.p95Ms < 2, 'Cached animation lookup must stay below 2ms');
      reports.push({scenario,...report});
      console.log(JSON.stringify({scenario,...report}));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
