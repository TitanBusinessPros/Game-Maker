const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const builderSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const builderHtml = builderSource.replace(/onAuthStateChanged\(auth, \(user\) => \{\r?\n  if \(user\) loadExistingMap\(\);/,
  `window.__mapOnlyBuilderTest = { addAirUnitRow, addMapOnlyFaction, buildMapDoc, loadExistingMap, showExistingAsset, collectDefenderPlacements, defenderPlacements,
    setUser(user) { currentUser = user; } };
onAuthStateChanged(auth, (user) => {
  if (user) loadExistingMap();`);
assert.ok(builderHtml.includes('window.__mapOnlyBuilderTest ='));
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
export const getDoc=async()=>({exists:()=>!!window.__savedMap,data:()=>window.__savedMap});
export const httpsCallable=()=>async()=>({});`;
const playSource = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const cfg = {
  name: 'Base-free enemies', mapSize: 'small', gameStyle: 'turnbased',
  player: { name: 'Blue' }, computers: [{ name: 'Red' }],
  airUnits: [{ placementId: 'existing-guard', name: 'Existing Guard', hp: 90, attack: 15, range: 60, speed: 3 }],
  mapOnlyFactions: [{ key: 'forest', name: 'Forest Guardians', color: '#8855aa', units: [
    { placementId: 'custom-guard', name: 'Ent', hp: 220, attack: 30, range: 90, speed: 4,
      weapon: 'poison', weaponSound: 'https://assets.test/ent.mp3', allowedFactions: [] },
  ] }],
  areaDefenders: [
    { placementId: 'existing-guard', factionId: 2, x: 0.4, y: 0.5, range: 300 },
    { placementId: 'custom-guard', factionId: 2, x: 0.6, y: 0.5, range: 650 },
  ],
};
function makePlayHtml(gameCfg) { return playSource
  .replace('<script type="module">', () => `<script>window.GM_INLINE_CONFIG=${JSON.stringify(gameCfg)};</script><script type="module">`)
  .replace('  window.__GM_DEBUG = {', `
    window.__mapOnlyGameTest = { unitDefs, spawnUnit, updateSimulation, serializeState, advanceTurn,
      get gameOver() { return gameOver; }, canFactionProduce };
    window.__GM_DEBUG = {`); }
const soloCfg = { ...cfg, computers: [], areaDefenders: [
  { placementId: 'custom-guard', factionId: 1, x: 0.6, y: 0.5, range: 650 },
] };

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url === 'http://map-only-builder.test/') return route.fulfill({ contentType: 'text/html', body: builderHtml });
      if (url === 'http://map-only-game.test/') return route.fulfill({ contentType: 'text/html', body: makePlayHtml(cfg) });
      if (url === 'http://map-only-solo.test/') return route.fulfill({ contentType: 'text/html', body: makePlayHtml(soloCfg) });
      if (url.startsWith('https://www.gstatic.com/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: firebaseStub });
      return route.abort();
    });
    await page.goto('http://map-only-builder.test/');
    await page.waitForFunction(() => window.__mapOnlyBuilderTest);
    const builderResult = await page.evaluate(async () => {
      document.querySelector('main').style.display = 'block';
      const t = window.__mapOnlyBuilderTest;
      const existing = t.addAirUnitRow({ name: 'Scout', hp: 90, attack: 10, range: 60, speed: 5 });
      document.getElementById('addMapOnlyFactionBtn').click();
      const faction = document.querySelector('#mapOnlyFactionList .map-only-faction');
      if (!faction) throw Error('Add base-free faction button did not create an editor');
      faction.querySelector('.map-only-name').value = 'Forest Guardians';
      faction.querySelector('.map-only-color').value = '#8855aa';
      faction.querySelector('.add-map-only-unit').click();
      const custom = faction.querySelector('.map-only-unit-list > .unit-row');
      custom.querySelector('.u-name').value = 'Ent';
      custom.querySelector('.u-hp').value = '220';
      custom.querySelector('.u-attack').value = '30';
      custom.querySelector('.u-range').value = '90';
      custom.querySelector('.u-speed').value = '4';
      custom.querySelector('.u-weapon').value = 'poison';
      if (!custom.querySelector(`[data-slot="${custom.dataset.unitId}_weapon_sound"]`)) throw Error('Custom attack sound picker missing');
      const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K1sAAAAASUVORK5CYII=';
      t.showExistingAsset(custom.dataset.unitId, imageUrl);
      t.showExistingAsset(`${custom.dataset.unitId}_weapon_sound`, 'https://assets.test/ent.mp3');
      const owner = [...document.querySelectorAll('#defenderPlayers button')].find(button => button.textContent.includes('Forest Guardians'));
      if (!owner) throw Error('Base-free faction was not available as a defender owner');
      owner.click();
      const map = document.getElementById('defenderPlacementMap');
      const rect = map.getBoundingClientRect();
      function place(type, x, range) {
        document.getElementById('defenderUnitType').value = type;
        document.getElementById('defenderRange').value = range;
        map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * 0.5 }));
      }
      place(existing.dataset.placementId, 0.4, 300);
      place(custom.dataset.placementId, 0.6, 650);
      if (t.defenderPlacements.length !== 2) throw Error('Existing and custom defenders were not placed');
      const references = [...document.querySelectorAll('#structurePlacementMap .ref-defender')];
      if (references.length !== 2 || !references.every(marker => marker.title.includes('Forest Guardians'))) {
        throw Error('Other placement previews did not identify the base-free guards');
      }
      t.setUser({ uid: 'test-owner' });
      const saved = await t.buildMapDoc('draft');
      if (saved.mapOnlyFactions.length !== 1 || saved.mapOnlyFactions[0].name !== 'Forest Guardians') throw Error('Faction was not saved');
      if (saved.mapOnlyFactions[0].units[0].hp !== 220 || saved.mapOnlyFactions[0].units[0].weapon !== 'poison') throw Error('Custom stats were not saved');
      if (saved.mapOnlyFactions[0].units[0].imageUrl !== imageUrl || saved.mapOnlyFactions[0].units[0].weaponSound !== 'https://assets.test/ent.mp3') throw Error('Custom art or sound was not saved');
      if (!saved.areaDefenders.every(point => point.factionId === 2)) throw Error('Defender owner did not use the base-free faction');
      window.__savedMap = saved;
      await t.loadExistingMap();
      if (document.querySelector('.map-only-name')?.value !== 'Forest Guardians' || t.defenderPlacements.length !== 2) throw Error('Reload lost faction or placements');
      if (!document.querySelector('.map-only-unit-list > .unit-row[data-placement-id="' + custom.dataset.placementId + '"]')) throw Error('Reload lost custom unit identity');
      window.__savedMap = { ...saved, computers: [], areaDefenders: [
        { ...saved.areaDefenders[1], factionId: 1 },
      ] };
      await t.loadExistingMap();
      if (document.querySelectorAll('#computerPlayersList .computer-row').length !== 0 ||
          t.collectDefenderPlacements()[0]?.factionId !== 1) throw Error('Solo base-free enemy map did not reload');
      return { ranges: saved.areaDefenders.map(point => point.range), factionCount: saved.mapOnlyFactions.length };
    });
    assert.deepEqual(builderResult.ranges, [300, 650]);
    assert.deepEqual(errors, []);
    console.log('PASS builder creates, places, saves, and reloads a named base-free faction and custom unit');

    await page.goto('http://map-only-game.test/');
    await page.waitForFunction(() => window.__mapOnlyGameTest);
    assert.equal(await page.locator('#allyList .allyRow').count(), 2, 'Base-free faction must not get a player turn');
    await page.click('#startMatchBtn');
    const gameResult = await page.evaluate(() => {
      const t = window.__mapOnlyGameTest, d = window.__GM_DEBUG;
      const faction = d.factions[2];
      if (!faction?.isMapOnly || faction.isFactionHome || faction.hp !== 0 || faction.name !== 'Forest Guardians') throw Error('Base-free faction gained a base');
      const guards = d.units.filter(unit => unit.factionId === faction.id && unit.defendPost);
      if (guards.length !== 2 || guards[0].defendPost.range !== 300 || guards[1].defendPost.range !== 650) throw Error('Placed guards were not spawned');
      const saved = t.serializeState();
      const ent = guards.find(unit => unit.hp === 220);
      if (!ent || ent.weapon !== 'poison' || ent.attack !== 30 || ent.range !== 90 || ent.weaponSound !== 'https://assets.test/ent.mp3') throw Error('Custom combat stats or attack sound were not used');
      if (t.canFactionProduce(t.unitDefs[ent.defIndex], 0)) throw Error('Map-only unit became producible at a base');
      const intruder = t.spawnUnit(0, 0, ent.defendPost.x + 120, ent.defendPost.y);
      t.updateSimulation(1 / 30);
      if (ent.target !== intruder) throw Error('Base-free defender did not engage on another player turn');
      ent.attackedThisTurn = true;
      t.advanceTurn();
      if (ent.attackedThisTurn || d.activeFaction.id === faction.id) throw Error('Base-free defender received a player turn or stayed locked');
      intruder.alive = false; intruder.hp = 0;
      for (let i = 0; i < 120; i++) t.updateSimulation(1 / 30);
      if (Math.hypot(ent.x - ent.defendPost.x, ent.y - ent.defendPost.y) > 5) throw Error('Defender did not return to its post');
      d.factions[1].hp = 0;
      t.updateSimulation(0);
      if (t.gameOver) throw Error('Match ended while base-free enemies survived');
      guards.forEach(unit => { unit.alive = false; unit.hp = 0; });
      t.updateSimulation(0);
      if (!t.gameOver) throw Error('Match did not end after base-free enemies were cleared');
      return { factionId: faction.id, guards: guards.length, saved };
    });
    assert.equal(gameResult.factionId, 2);
    assert.equal(gameResult.guards, 2);
    assert.deepEqual(errors, []);
    console.log('PASS base-free guards fight, return, have no base or turn, and count toward victory');
    await page.reload();
    await page.waitForFunction(() => window.__mapOnlyGameTest);
    await page.locator('#loadInput').setInputFiles({ name: 'base-free.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(gameResult.saved)) });
    await page.waitForFunction(() => window.__GM_DEBUG.units.filter(unit => unit.factionId === 2 && unit.defendPost).length === 2);
    assert.equal(await page.evaluate(() => window.__GM_DEBUG.factions[2].isMapOnly), true);
    assert.deepEqual(errors, []);
    console.log('PASS saved games restore base-free factions and their guards');
    await page.goto('http://map-only-solo.test/');
    await page.waitForFunction(() => window.__mapOnlyGameTest);
    assert.equal(await page.locator('#allyList .allyRow').count(), 1);
    await page.click('#startMatchBtn');
    const solo = await page.evaluate(() => ({ started: !document.getElementById('teamSelectScreen').classList.contains('show'),
      guards: window.__GM_DEBUG.units.filter(unit => unit.factionId === 1 && unit.defendPost).length }));
    assert.deepEqual(solo, { started: true, guards: 1 });
    assert.deepEqual(errors, []);
    console.log('PASS a base-free faction can be the only opposing faction');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
