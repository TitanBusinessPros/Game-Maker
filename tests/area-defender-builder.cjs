const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const html = source.replace(/onAuthStateChanged\(auth, \(user\) => \{\r?\n  if \(user\) loadExistingMap\(\);/,
  `window.__defenderBuilderTest = { addAirUnitRow, renderDefenderEditor, collectDefenderPlacements, buildMapDoc, loadExistingMap, defenderPlacements,
    setUser(user) { currentUser = user; } };
onAuthStateChanged(auth, (user) => {
  if (user) loadExistingMap();`);
assert.ok(html.includes('window.__defenderBuilderTest ='), 'builder test hook must be installed');
const stubExports = [
  'initializeApp', 'getAnalytics', 'getAuth', 'getFirestore', 'getStorage', 'getFunctions',
  'getDownloadURL', 'uploadBytes', 'setDoc', 'getDocs', 'query', 'where',
  'serverTimestamp', 'deleteDoc', 'runTransaction', 'signInWithCredential', 'ref',
];
const firebaseStub = `const noop=()=>({});\n${stubExports.map(name => `export const ${name}=noop;`).join('\n')}
  export const isSupported=()=>Promise.resolve(false);
  export const onAuthStateChanged=()=>{};
  export const GoogleAuthProvider=class {};
  export const collection=()=>({});
  export const doc=()=>({id:'test-map'});
  export const getDoc=async()=>({exists:()=>!!window.__savedMap,data:()=>window.__savedMap});
  export const httpsCallable=()=>async()=>({});`;

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'http://builder.test/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.startsWith('https://www.gstatic.com/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: firebaseStub });
      return route.abort();
    });
    await page.goto('http://builder.test/');
    await page.waitForFunction(() => window.__defenderBuilderTest);
    const result = await page.evaluate(async () => {
      document.querySelector('main').style.display = 'block';
      const t = window.__defenderBuilderTest;
      const row = t.addAirUnitRow({ name: 'Guardian', hp: 150, attack: 25, range: 60, speed: 3 });
      t.renderDefenderEditor();
      document.querySelectorAll('#defenderPlayers button')[1].click();
      document.getElementById('defenderRange').value = '350';
      const map = document.getElementById('defenderPlacementMap');
      const rect = map.getBoundingClientRect();
      map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
      const placed = t.collectDefenderPlacements();
      if (placed.length !== 1 || placed[0].placementId !== row.dataset.placementId) throw Error('Troop selection did not persist');
      if (placed[0].factionId !== 1 || placed[0].range !== 350) throw Error('Player or range did not persist');
      if (Math.abs(placed[0].x - 0.5) > 0.01 || Math.abs(placed[0].y - 0.5) > 0.01) throw Error('Placement coordinates were wrong');
      if (document.querySelectorAll('.defender-marker').length !== 1) throw Error('Placed defender marker missing');
      t.setUser({ uid: 'test-owner' });
      const mapDoc = await t.buildMapDoc('draft');
      if (mapDoc.areaDefenders.length !== 1 || mapDoc.areaDefenders[0].placementId !== row.dataset.placementId) {
        throw Error('Saved map document omitted placed defender');
      }
      window.__savedMap = mapDoc;
      await t.loadExistingMap();
      if (t.collectDefenderPlacements()[0]?.placementId !== row.dataset.placementId) {
        throw Error('Reloaded map lost defender troop identity');
      }
      const restoredRow = [...document.querySelectorAll('#airUnitList .unit-row')]
        .find(candidate => candidate.dataset.placementId === row.dataset.placementId);
      if (!restoredRow) throw Error('Reloaded troop lost its placement ID');
      restoredRow.remove();
      t.renderDefenderEditor();
      let rejected = false;
      try { t.collectDefenderPlacements(); } catch { rejected = true; }
      if (!rejected) throw Error('Removing a troop must invalidate its placed defenders');
      return placed[0];
    });
    assert.equal(result.factionId, 1);
    assert.deepEqual(errors, []);
    console.log('PASS bottom builder section assigns existing troops to players, saves range/position and catches removed troop');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
