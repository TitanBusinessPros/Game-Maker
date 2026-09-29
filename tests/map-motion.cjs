const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const playSource = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const builderSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const builderHtml = builderSource.replace(/onAuthStateChanged\(auth, \(user\) => \{\r?\n  if \(user\) loadExistingMap\(\);/,
  `window.__motionBuilder = { buildMapDoc, loadExistingMap, setUser() { currentUser = { uid: 'test-builder' }; } };
onAuthStateChanged(auth, (user) => {
  if (user) loadExistingMap();`);
assert.ok(builderHtml.includes('window.__motionBuilder ='));
const stubExports = [
  'initializeApp', 'getAnalytics', 'getAuth', 'getFirestore', 'getStorage', 'getFunctions',
  'getDownloadURL', 'uploadBytes', 'setDoc', 'getDocs', 'query', 'where',
  'serverTimestamp', 'deleteDoc', 'runTransaction', 'signInWithCredential', 'ref',
];
const firebaseStub = `const noop=()=>({});
${stubExports.map(name => `export const ${name}=noop;`).join('\n')}
export const isSupported=()=>Promise.resolve(false);
export const onAuthStateChanged=()=>{};
export const GoogleAuthProvider=class {};
export const collection=()=>({});
export const doc=()=>({id:'test-map'});
export const getDoc=async()=>({exists:()=>true,data:()=>({name:'Saved motion',status:'draft',mapMotion:'rain',player:{name:'Blue'},computers:[{name:'Red'}]})});
export const httpsCallable=()=>async()=>({});`;
function playHtml(motion) {
  const cfg = { name: 'Motion regression', mapSize: 'small', mapMotion: motion,
    player: { name: 'Blue' }, computers: [{ name: 'Red' }] };
  return playSource
    .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`)
    .replace('  window.__GM_DEBUG = {', `
      window.__motionTest = { drawMapMotion, get motion() { return mapMotion; }, setTime(value) { elapsed = value; } };
      window.__GM_DEBUG = {`);
}

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://motion.test') return route.fulfill({ contentType: 'text/html', body: playHtml(url.searchParams.get('motion')) });
      if (url.origin === 'http://builder-motion.test') return route.fulfill({ contentType: 'text/html', body: builderHtml });
      if (url.hostname === 'www.gstatic.com') return route.fulfill({ contentType: 'text/javascript', body: firebaseStub });
      return route.abort();
    });
    for (const motion of ['none', 'ocean', 'rain', 'snow']) {
      await page.goto(`http://motion.test/?motion=${motion}`);
      await page.waitForFunction(() => window.__motionTest);
      const result = await page.evaluate(() => {
        const t = window.__motionTest;
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        function frame(time) {
          t.setTime(time);
          ctx.fillStyle = '#06121f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          t.drawMapMotion();
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const first = frame(0);
        const second = frame(8);
        let changed = 0;
        for (let i = 0; i < first.length; i += 4) {
          if (first[i] !== second[i] || first[i + 1] !== second[i + 1] || first[i + 2] !== second[i + 2]) changed++;
        }
        return { motion: t.motion, changed };
      });
      assert.equal(result.motion, motion);
      if (motion === 'none') assert.equal(result.changed, 0, 'Still background must stay still');
      else assert.ok(result.changed > 100, `${motion} did not visibly animate: ${result.changed} pixels changed`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS still background and three distinct animated map modes');
    await page.goto('http://builder-motion.test/');
    await page.waitForFunction(() => window.__motionBuilder);
    const savedMotion = await page.evaluate(async () => {
      window.__motionBuilder.setUser();
      document.getElementById('mapMotion').value = 'ocean';
      return (await window.__motionBuilder.buildMapDoc('draft')).mapMotion;
    });
    assert.equal(savedMotion, 'ocean');
    const loadedMotion = await page.evaluate(async () => {
      await window.__motionBuilder.loadExistingMap();
      return document.getElementById('mapMotion').value;
    });
    assert.equal(loadedMotion, 'rain');
    assert.deepEqual(errors, []);
    console.log('PASS builder saves and restores the selected map motion');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
