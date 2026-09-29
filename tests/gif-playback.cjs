const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, pageOptions } = require('./browser-config.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'play.html'), 'utf8');
  const bundle = html.match(/<!-- GIF PLAYER START -->\s*<script>([\s\S]*?)<\/script>/)[1];
  const loader = html.slice(html.indexOf('const imageCache = new Map();'), html.indexOf('function loadAudio(url)'));
  const drawUnit = html.slice(html.indexOf('  function drawUnit(u) {'), html.indexOf('    const pct = Math.max(0, u.hp / u.maxHp);', html.indexOf('  function drawUnit(u) {'))) + '\n}';
  const browser = await launch();
  try {
    const page = await browser.newPage(pageOptions);
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/expected.json')));
    await page.route('https://gif-test.local/**', async route => {
      if (route.request().url().endsWith('/asset')) {
        await route.fulfill({ contentType: 'image/gif', body: fs.readFileSync(path.join(__dirname, 'fixtures/disposal-2.gif')) });
      } else await route.fulfill({ contentType: 'text/html', body: '<canvas id="output" width="24" height="24"></canvas>' });
    });
    await page.goto('https://gif-test.local/');
    await page.addScriptTag({ content: `window.ImageDecoder = undefined; let clock = 0; performance.now = () => clock; ${bundle}\n${loader}
      const canvas = document.getElementById('output'), ctx = canvas.getContext('2d');
      const toScreen = () => ({x:12,y:12}), unitVisualSize = () => 24;
      const camera = {zoom:1}, UNIT_BOBBING_ENABLED = false;
      function fittedSize(img, size) { return {w:size, h:size}; }
      ${drawUnit}
      async function pixelHash(canvas) {
        const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        const hash = await crypto.subtle.digest('SHA-256', pixels);
        return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
      }
      window.testGif = async (url, times, unit) => {
        clock = 0;
        const img = await loadImage(url);
        if (!img._gmAnimation) throw Error('GIF was loaded as a still image');
        const hashes = [];
        for (const time of times) {
          clock = time;
          if (unit) {
            ctx.clearRect(0,0,24,24);
            drawUnit({img, id:1, rotateToFace:false});
            hashes.push(await pixelHash(canvas));
          } else hashes.push(await pixelHash(img._gmAnimation.frameAt(clock)));
        }
        return hashes;
      };` });
    for (const [name, data] of Object.entries(expected)) {
      const uri = 'data:image/gif;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures', name)).toString('base64');
      const sequence = [...data.frames, {time:data.duration, hash:data.frames[0].hash}, {...data.frames.at(-1),time:data.duration+data.frames.at(-1).time}];
      const actual = await page.evaluate(({uri,sequence}) => testGif(uri, sequence.map(f=>f.time), false), {uri,sequence});
      assert.deepEqual(actual, sequence.map(f=>f.hash), name + ' frame pixels, timing, loop and skipped-frame composition');
      console.log('PASS ' + name + ': ' + data.frames.length + ' frames match Pillow reference pixels');
    }
    const unitFrames = expected['disposal-2.gif'].frames;
    const actual = await page.evaluate(times => testGif('https://gif-test.local/asset', times, true), unitFrames.map(f=>f.time));
    assert.deepEqual(actual, unitFrames.map(f=>f.hash));
    console.log('PASS actual game drawUnit: animated pixels from extensionless URL, ImageDecoder disabled');
    // An exported HTML includes the same embedded decoder and data-URI assets.
    await page.route('**/*', route => route.abort());
    const uri = 'data:application/octet-stream;base64,' + fs.readFileSync(path.join(__dirname,'fixtures/disposal-3.gif')).toString('base64');
    const offline = await page.evaluate(({uri,times}) => testGif(uri,times,true), {uri,times:expected['disposal-3.gif'].frames.map(f=>f.time)});
    assert.deepEqual(offline, expected['disposal-3.gif'].frames.map(f=>f.hash));
    console.log('PASS offline game drawUnit: embedded GIF with generic MIME type, all network requests blocked');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
