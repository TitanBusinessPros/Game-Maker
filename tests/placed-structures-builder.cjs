const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const html = source.replace(/onAuthStateChanged\(auth, \(user\) => \{\r?\n  if \(user\) loadExistingMap\(\);/,
  `window.__placementTest = { addTurretRow, addMissileUnitRow, collectMapStructures,
    buildMapDoc, loadExistingMap, mapStructures, renderStructureEditor,
    showExistingAsset,
    setUser(user) { currentUser = user; } };
onAuthStateChanged(auth, (user) => {
  if (user) loadExistingMap();`);
assert.ok(html.includes('window.__placementTest ='), 'builder test hook must be installed');
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
    await page.waitForFunction(() => window.__placementTest);
    await page.evaluate(async () => {
      document.querySelector('main').style.display = 'block';
      document.getElementById('mapSize').value = 'large';
      const t = window.__placementTest;
      if ([...document.getElementById('structureType').options].some(option => option.value === 'building:missileSilo')) {
        throw Error('Artless Missile Silo was offered for placement');
      }
      const turret = t.addTurretRow({ name: 'Flak' });
      const launcher = t.addMissileUnitRow({ name: 'Rocket' });
      t.showExistingAsset('airBaseImage', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==');
      t.renderStructureEditor();
      const map = document.getElementById('structurePlacementMap');
      const rect = map.getBoundingClientRect();
      const place = (x, y) => map.dispatchEvent(new MouseEvent('click', { bubbles: true,
        clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y }));
      const select = (kind, id) => { document.getElementById('structureType').value = `${kind}:${id}`; };
      document.querySelectorAll('#structurePlayers button')[0].click();
      select('building', 'airBase');
      place(.5, .5);
      if (t.mapStructures.length !== 1) throw Error('Building was not placed');
      document.querySelectorAll('#structurePlayers button')[1].click();
      select('turret', turret.dataset.placementId);
      place(.5 + 400 / 10880, .5);
      if (t.mapStructures.length !== 1 || document.getElementById('structureWarning').hidden) throw Error('Enemy inside 500 was allowed');
      place(.5 + 600 / 10880, .5);
      if (t.mapStructures.length !== 2) throw Error('Enemy outside 500 was rejected');
      select('launcher', launcher.dataset.placementId);
      document.querySelectorAll('#structurePlayers button')[0].click();
      place(.5 + 900 / 10880, .5);
      if (t.mapStructures.length !== 2) throw Error('Enemy launcher inside turret exclusion was allowed');
      place(.5 - 600 / 10880, .5);
      if (t.mapStructures.length !== 3) throw Error('Friendly launcher was rejected');
      const gold = document.getElementById('goldPlacementWidget');
      gold.dataset.mode = 'map';
      gold.dataset.points = JSON.stringify([{ x: .8, y: .8 }]);
      select('turret', turret.dataset.placementId);
      place(.8, .8);
      if (t.mapStructures.length !== 3) throw Error('Turret was allowed on a shared mining deposit');
      t.setUser({ uid: 'test-owner' });
      const doc = await t.buildMapDoc('draft');
      if (doc.placedStructures.length !== 3 || doc.gunTurrets[0].placementId !== turret.dataset.placementId ||
          doc.missileUnits[0].placementId !== launcher.dataset.placementId) throw Error('Saved document omitted placement identity');
      t.mapStructures.push({ kind: 'building', buildingKey: 'missileSilo', playerKey: t.mapStructures[0].playerKey, x: .1, y: .9 });
      t.renderStructureEditor();
      if (document.getElementById('removeUnconfiguredStructures').hidden) throw Error('Old artless placement was not flagged');
      let artlessRejected = false;
      try { t.collectMapStructures(); } catch { artlessRejected = true; }
      if (!artlessRejected) throw Error('Artless placement was saved');
      document.getElementById('removeUnconfiguredStructures').click();
      if (t.mapStructures.length !== 3) throw Error('Cleanup removed valid placements');
      window.__savedMap = doc;
      await t.loadExistingMap();
      if (t.collectMapStructures().length !== 3) throw Error('Reload lost placements');
      if (!t.collectMapStructures().some(p => p.kind === 'turret' && p.factionId === 1)) throw Error('Reload lost turret owner');
      const restored = [...document.querySelectorAll('#turretList .unit-row')]
        .find(row => row.dataset.placementId === turret.dataset.placementId);
      if (!restored) throw Error('Reload lost turret identity');
      restored.remove();
      let rejected = false;
      try { t.collectMapStructures(); } catch { rejected = true; }
      if (!rejected) throw Error('Removed turret type must invalidate placements');
    });
    assert.deepEqual(errors, []);
    console.log('PASS builder enforces enemy 500-unit spacing and saves/restores owned structures, turrets, and launchers');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
