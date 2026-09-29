const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(script.replace(/^import\s+[\s\S]*?\s+from\s+"[^"]+";/gm, ''));
}
console.log('PASS builder script syntax');
const uploads = html.slice(html.indexOf('let uploadProgress = null;'), html.indexOf('// Combat units: a repeatable'));
const save = html.slice(html.indexOf('let saveInProgress = false;'), html.indexOf("saveDraftBtn.addEventListener('click'"));
const png = (name = 'character.png', size = 100, type = 'image/png') => new File(
  [Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(Math.max(0, size - 8))])], name, { type });
const jpeg = (name = 'character.jpg') => new File([Buffer.from([255,216,255,217])], name, { type: 'image/jpeg' });
const gif = (name = 'character.gif') => new File([Buffer.from('GIF89a')], name, { type: 'image/gif' });
const tick = () => new Promise(resolve => setImmediate(resolve));
assert.doesNotMatch(html, /accept="image\/\*"/);
const libraryGifCode = html.slice(html.indexOf('function isLibraryGif('), html.indexOf('// Sprites/homeworld'));
const gifContext = vm.createContext({ decodeURIComponent });
vm.runInContext(libraryGifCode, gifContext);
assert.equal(gifContext.isLibraryGif({ path: 'library/units/old.gif' }), true);
assert.equal(gifContext.isLibraryGif({ mimeType: 'image/gif' }), true);
assert.equal(gifContext.isLibraryGif({ path: 'library/units/still.png' }), false);
assert.match(html, /isLibraryGif\(it\) \? '<span class="gif-mark"/);
const adminHtml = fs.readFileSync(require('node:path').join(__dirname, '../admin.html'), 'utf8');
const renderAdmin = adminHtml.slice(adminHtml.indexOf('function renderItemGrid('), adminHtml.indexOf('// Pure rendering step'));
const element = tag => ({ tag, children: [], appendChild(child) { this.children.push(child); }, addEventListener() {}, setAttribute(key, value) { this[key] = value; } });
const adminContext = vm.createContext({ document: { createElement: element }, Image: class {} });
vm.runInContext(renderAdmin, adminContext);
const adminContainer = element('section');
adminContext.renderItemGrid(adminContainer, [{ type: 'image', path: 'library/units/old.gif', name: 'Old', url: 'old-url' },
  { type: 'image', mimeType: 'image/gif', name: 'New', url: 'new-url' },
  { type: 'image', path: 'library/units/still.png', name: 'Still', url: 'still-url' }]);
assert.deepEqual(adminContainer.children[0].children.map(card => card.children.some(child => child.className === 'gif-mark')), [true, true, false]);
console.log('PASS admin and builder library identify GIFs with a circled G');
function harness(files) {
  const slots = Object.fromEntries(Object.entries(files).map(([key, file]) => {
    const input = { files: file ? [file] : [], accept: /sound/i.test(key) ? 'audio/*' : 'image/png,image/jpeg', set value(value) { if (value === '') this.files = []; } };
    const status = { textContent: '' };
    return [key, { input, status, querySelector: q => q.includes('input') ? input : status }];
  }));
  const buttons = { saveDraftBtn: {}, saveFinalBtn: {} };
  const computerList = { rows: [], querySelectorAll: () => computerList.rows };
  const calls = [], writes = [], timers = [];
  const ctx = vm.createContext({
    console: { error() {} }, File, Blob,
    document: {
      querySelector(q) { const slot = slots[q.match(/data-slot="([^"]+)"/)[1]]; return q.includes(' input') ? slot.input : slot; },
      getElementById: key => buttons[key],
    },
    existingAssetUrls: {}, currentUser: { uid: 'test-user' }, currentMapId: 'test-map',
    computerList, MAX_COMPUTER_PLAYERS: 5,
    storage: {}, db: {}, spriteSettingsForSlot: () => null,
    createImageBitmap: () => { throw new Error('Compression is optional in this harness'); },
    storageRef: (_, path) => path,
    uploadBytes: async (ref, file, metadata) => { calls.push({ ref, file, metadata }); },
    getDownloadURL: async ref => 'https://assets.test/' + ref,
    setSaveStatus: message => { ctx.status = message; },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    doc: () => 'map-document', setDoc: async (_, value) => writes.push(value),
    refreshMyMaps() {}, checklistGaps: () => [],
  });
  vm.runInContext(uploads + '\n' + save, ctx);
  ctx.buildMapDoc = async status => ({ status, assets: await ctx.uploadSlotsWithLimit(Object.keys(slots)) });
  return { ctx, slots, calls, writes, timers, buttons, computerList };
}
(async () => {
  const overLimit = harness({});
  overLimit.computerList.rows = Array(6).fill({});
  await overLimit.ctx.saveMap('draft');
  await overLimit.ctx.saveMap('complete');
  assert.equal(overLimit.writes.length, 0);
  assert.match(overLimit.ctx.status, /exceeds 6 players/);
  console.log('PASS older maps over six players cannot be saved without removing extras');
  const keys = ['miningUnitImage', 'unit_1', 'airunit_1', 'warunit_1', 'infunit_1', 'heliunit_1', 'navyunit_1', 'medic_1', 'cleric_1', 'turret_1', 'missile_1', 'missile_1_missile', 'missilebattery_1'];
  const h = harness(Object.fromEntries(keys.map(key => [key, png(key + '.png')])));
  await h.ctx.saveMap('complete');
  assert.equal(h.writes.length, 1);
  assert.equal(Object.keys(h.writes[0].assets).length, keys.length);
  for (const call of h.calls) assert.equal(call.file.type, 'image/png');
  await h.ctx.saveMap('draft');
  assert.equal(h.calls.length, keys.length, 'second save reuses uploaded images');
  console.log('PASS all character categories save PNGs and reuse successful uploads');

  const slow = harness({ a: png(), b: png(), c: png() });
  const pending = [];
  slow.ctx.uploadBytes = (ref, file) => new Promise((resolve, reject) => pending.push({ ref, resolve, reject }));
  const saving = slow.ctx.saveMap('draft');
  await tick();
  assert.equal(pending.length, 2);
  // Advance past the former cutoff without waiting 90 real seconds.
  for (const timer of slow.timers.filter(t => t.delay <= 90000)) timer.fn();
  await tick();
  assert.equal(slow.buttons.saveDraftBtn.disabled, true);
  pending[0].reject(new Error('connection interrupted'));
  await tick();
  assert.equal(slow.buttons.saveDraftBtn.disabled, true, 'wait for other active upload');
  await slow.ctx.saveMap('draft');
  assert.equal(pending.length, 2, 'no overlapping save or queued upload after failure');
  pending[1].resolve();
  await saving;
  assert.equal(slow.writes.length, 0);
  assert.equal(slow.buttons.saveDraftBtn.disabled, false);
  assert.match(slow.ctx.status, /connection interrupted/);
  assert.equal(slow.slots.b.input.files.length, 0);
  const retried = [];
  slow.ctx.uploadBytes = async ref => retried.push(ref);
  await slow.ctx.saveMap('draft');
  assert.equal(slow.writes.length, 1);
  assert.equal(retried.length, 2);
  console.log('PASS slow transfers, concurrency, failure cleanup and retry without duplicate uploads');

  const large = harness({ a: png('large.png', 15 * 1024 * 1024) });
  await large.ctx.saveMap('draft');
  assert.equal(large.calls.length, 0);
  assert.match(large.ctx.status, /smaller than 15 MB/);
  assert.equal(large.slots.a.input.files.length, 1);
  console.log('PASS oversized PNG rejected clearly before network upload');

  for (const file of [gif(), new File([Buffer.from('GIF89a')], 'hidden.png', { type: 'image/png' }),
    new File([Buffer.from('GIF89a')], 'hidden.jpg', { type: 'image/jpeg' })]) {
    const blocked = harness({ a: file });
    await blocked.ctx.saveMap('draft');
    assert.equal(blocked.calls.length, 0);
    assert.equal(blocked.writes.length, 0);
    assert.match(blocked.ctx.status, /PNG or JPEG/);
  }
  const allowed = harness({ a: jpeg(), b: png('no-mime.png', 100, '') });
  await allowed.ctx.saveMap('draft');
  assert.equal(allowed.calls.length, 2);
  assert.equal(allowed.writes.length, 1);
  const audio = harness({ soundMusic: new File([Buffer.from('ID3')], 'music.mp3', { type: 'audio/mpeg' }) });
  await audio.ctx.saveMap('draft');
  assert.equal(audio.calls.length, 1);
  console.log('PASS GIFs and disguised GIFs rejected; JPEG, PNG and audio upload');

  const producerHtml = fs.readFileSync(require('node:path').join(__dirname, '../producer.html'), 'utf8');
  assert.doesNotMatch(producerHtml, /accept="image\/\*"/);
  const producerValidation = producerHtml.slice(producerHtml.indexOf('async function validateCoverImage('), producerHtml.indexOf('function wireImageSlot('));
  const producerContext = vm.createContext({ Uint8Array });
  vm.runInContext(producerValidation, producerContext);
  await producerContext.validateCoverImage(png());
  await producerContext.validateCoverImage(jpeg());
  await assert.rejects(producerContext.validateCoverImage(gif()), /PNG or JPEG/);
  await assert.rejects(producerContext.validateCoverImage(new File([Buffer.from('GIF89a')], 'fake.png', { type: 'image/png' })), /valid PNG or JPEG/);
  console.log('PASS Game Producer cover art accepts PNG/JPEG and rejects GIF bytes');

  const changed = harness({ a: png('old.png') });
  let finish;
  changed.ctx.uploadBytes = () => new Promise(resolve => { finish = resolve; });
  const changeSave = changed.ctx.saveMap('draft');
  await tick();
  const replacement = png('new.png');
  changed.slots.a.input.files = [replacement];
  finish();
  await changeSave;
  assert.equal(changed.slots.a.input.files[0], replacement);
  assert.equal(changed.writes.length, 0);
  assert.match(changed.ctx.status, /selection.*changed/);
  console.log('PASS replacing an image during save does not lose the new selection');
})().catch(error => { console.error(error); process.exitCode = 1; });
