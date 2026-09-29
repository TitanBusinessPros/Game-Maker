const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const html = source.replace(/onAuthStateChanged\(auth, \(user\) => \{\r?\n  if \(user\) loadExistingMap\(\);/,
  `window.__previewTest = { addAirUnitRow, addTurretRow, mapStructures, defenderPlacements, refreshAllPlacementPreviews, showExistingAsset };
onAuthStateChanged(auth, (user) => {
  if (user) loadExistingMap();`);
assert.ok(html.includes('window.__previewTest ='));
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
  export const getDoc=async()=>({exists:()=>false});
  export const httpsCallable=()=>async()=>({});`;

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'http://preview.test/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.startsWith('https://www.gstatic.com/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: firebaseStub });
      return route.abort();
    });
    await page.goto('http://preview.test/');
    await page.waitForFunction(() => window.__previewTest);
    const turretId = await page.evaluate(() => {
      document.querySelector('main').style.display = 'block';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('mapSize').value = 'large';
      window.__previewTest.addAirUnitRow({ name: 'Guard' });
      window.__previewTest.showExistingAsset('heliFacilityImage', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==');
      const turret = window.__previewTest.addTurretRow({ name: 'Flak' });
      window.__previewTest.refreshAllPlacementPreviews();
      return turret.dataset.placementId;
    });
    await page.locator('#structurePlayers button').first().click();
    await page.locator('#structureType').selectOption(`turret:${turretId}`);
    const structureMap = page.locator('#structurePlacementMap');
    await structureMap.scrollIntoViewIfNeeded();
    const structureRect = await structureMap.boundingBox();
    const clickAt = async (rect, x, y) => page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y);
    await clickAt(structureRect, .5, .5);
    await clickAt(structureRect, .5 + 70 / 10880, .5);
    const closeStructures = await page.evaluate(() => ({ count: window.__previewTest.mapStructures.length,
      warning: document.getElementById('structureWarning').textContent,
      selected: document.querySelector('#structurePlayers [aria-pressed="true"]')?.textContent }));
    assert.equal(closeStructures.count, 2,
      `a real click inside the first marker must place a physically clear friendly turret nearby: ${JSON.stringify(closeStructures)}`);
    await page.locator('#structurePlayers button').nth(1).click();
    await clickAt(structureRect, .5 + 100 / 10880, .5);
    assert.equal(await page.evaluate(() => window.__previewTest.mapStructures.length), 2,
      'enemy turret still needs 500 world units of clearance');
    await page.locator('#structureType').selectOption('building:helicopterFacility');
    await structureMap.scrollIntoViewIfNeeded();
    await clickAt(await structureMap.boundingBox(), .75, .5);
    assert.equal(await page.locator('#structurePlacementMap .kind-building .marker-initials').textContent(), 'HF');
    assert.equal(await page.locator('#structurePlacementMap .kind-building .marker-owner').textContent(), '2');
    assert.equal(await page.locator('#defenderPlacementMap .ref-building .marker-initials').textContent(), 'HF');
    await page.locator('#heliFacilityName').fill('Sky Hangar');
    assert.equal(await page.locator('#structurePlacementMap .kind-building .marker-initials').textContent(), 'SH');
    assert.equal(await page.locator('#defenderPlacementMap .ref-building .marker-initials').textContent(), 'SH');
    await page.locator('#turretList .u-name').first().fill('Flak Cannon');
    assert.equal(await page.locator('#structurePlacementMap .kind-turret .marker-initials').first().textContent(), 'FC');
    assert.equal(await page.locator('#defenderPlacementMap .ref-turret .marker-initials').first().textContent(), 'FC');

    await page.locator('#defenderPlayers button').nth(1).click();
    await page.locator('#defenderPlacementMap').scrollIntoViewIfNeeded();
    const defenderRect = await page.locator('#defenderPlacementMap').boundingBox();
    await clickAt(defenderRect, .5, .6);
    await clickAt(defenderRect, .5 + 70 / 10880, .6);
    assert.equal(await page.evaluate(() => window.__previewTest.defenderPlacements.length), 2,
      'troops can be placed close to their own markers');

    await page.locator('#goldPlacementWidget input[value="map"]').check();
    await page.locator('#goldPlacementWidget .placement-canvas-wrap').scrollIntoViewIfNeeded();
    const goldRect = await page.locator('#goldPlacementWidget .placement-canvas-wrap').boundingBox();
    await clickAt(goldRect, .8, .8);
    assert.equal(await page.locator('#defenderPlacementMap .ref-resource').textContent(), 'GM');
    await page.locator('#resourceName').fill('Crystal Ore');
    assert.equal(await page.locator('#defenderPlacementMap .ref-resource').textContent(), 'CO');
    const markers = await page.evaluate(() => ({
      defenderTurrets: document.querySelectorAll('#defenderPlacementMap .ref-turret').length,
      defenderResources: document.querySelectorAll('#defenderPlacementMap .ref-resource').length,
      structureTroops: document.querySelectorAll('#structurePlacementMap .ref-defender').length,
      structureResources: document.querySelectorAll('#structurePlacementMap .ref-resource').length,
      resourceTroops: document.querySelectorAll('#goldPlacementWidget .ref-defender').length,
      resourceTurrets: document.querySelectorAll('#goldPlacementWidget .ref-turret').length,
      giantRings: document.querySelectorAll('.defender-range-ring').length,
      enemyOwner: document.querySelector('#structurePlacementMap .ref-defender')?.title,
    }));
    assert.equal(markers.defenderTurrets, 2);
    assert.equal(markers.defenderResources, 1);
    assert.equal(markers.structureTroops, 2);
    assert.equal(markers.structureResources, 1);
    assert.equal(markers.resourceTroops, 2);
    assert.equal(markers.resourceTurrets, 2);
    assert.equal(markers.giantRings, 0);
    assert.match(markers.enemyOwner, /Player 2/);
    await page.locator('#goldPlacementWidget .placement-point-list button').first().click();
    assert.equal(await page.locator('#defenderPlacementMap .ref-resource').count(), 0,
      'removing an individual resource updates the other previews');
    assert.deepEqual(errors, []);
    console.log('PASS all map previews show other owned features; close real-pointer placement works without giant rings');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
