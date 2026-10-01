const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');

const playSource = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const producerSource = fs.readFileSync(path.join(__dirname, '../producer.html'), 'utf8');
const buildSource = producerSource.slice(producerSource.indexOf('function buildFinalHtml(DATA) {'), producerSource.indexOf('\ncompileBtn.addEventListener', producerSource.indexOf('function buildFinalHtml(DATA) {')));
const buildFinalHtml = vm.runInNewContext(`${buildSource}\nbuildFinalHtml`, {
  escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])),
});
const cfg = { name: 'Mobile test', mapSize: 'small', player: { name: 'Blue' }, computers: [{ name: 'Red' }] };
const stageHtml = playSource.replace('<script type="module">', () =>
  `<script>window.GM_INLINE_CONFIG=${JSON.stringify(cfg)};</script><script type="module">`);
const exportedHtml = buildFinalHtml({ title: 'Mobile game', stages: [{ name: 'Stage one', htmlB64: Buffer.from(stageHtml).toString('base64'), art: null }], introArt: null, outroArt: null });

(async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://mobile-export.test/', (route) => route.fulfill({ contentType: 'text/html', body: exportedHtml }));
    await page.goto('http://mobile-export.test/');
    await page.getByText('Start Game').click();
    await page.getByText('Start Stage').click();
    const frame = page.frameLocator('#stageFrame');
    await frame.locator('#teamSelectScreen.show').waitFor();
    await frame.locator('#startMatchBtn').click();
    await frame.locator('#teamSelectScreen.show').waitFor({ state: 'hidden' });
    assert.match(await frame.locator('#tab-help').innerText(), /Drag one finger/);

    const input = async (type, x, y) => frame.locator('#canvas').evaluate((canvas, args) => {
      const touch = new Touch({ identifier: 1, target: canvas, clientX: args.x, clientY: args.y });
      const touches = args.type === 'touchend' ? [] : [touch];
      canvas.dispatchEvent(new TouchEvent(args.type, { bubbles: true, cancelable: true,
        touches, targetTouches: touches, changedTouches: [touch] }));
    }, { type, x, y });
    const state = () => frame.locator('#canvas').evaluate(() => ({
      x: window.__GM_DEBUG.camera.x, y: window.__GM_DEBUG.camera.y,
      box: document.getElementById('dragBox').style.display,
    }));
    const beforePan = await state();
    await input('touchstart', 190, 520);
    await input('touchmove', 260, 520);
    await input('touchend', 260, 520);
    const afterPan = await state();
    assert.notEqual(afterPan.x, beforePan.x, 'One-finger drag should pan the camera');
    assert.equal(afterPan.box, 'none', 'Panning must not open a troop box');

    await input('touchstart', 190, 520);
    await frame.locator('#dragBox').waitFor({ state: 'visible', timeout: 1500 });
    await input('touchmove', 250, 580);
    const duringHold = await state();
    assert.equal(duringHold.x, afterPan.x, 'Hold and drag must not pan');
    await input('touchend', 250, 580);
    assert.equal((await state()).box, 'none');

    await page.evaluate(() => history.back());
    await page.locator('#exitPrompt:not(.hidden)').waitFor({ timeout: 2000 });
    await page.getByText('Keep playing').click();
    assert.equal(await page.locator('#exitPrompt').getAttribute('class'), 'hidden');
    assert.equal(await page.locator('#playScreen').getAttribute('class'), 'screen');
    await page.evaluate(() => window.postMessage({ type: 'gm-stage-complete' }, '*'));
    await page.locator('#continuePrompt:not(.hidden)').waitFor();
    await page.locator('#continueBtn').click();
    await page.locator('#outroScreen:not(.hidden)').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS produced mobile game pans, holds to select, confirms Back, and advances stages');

    const single = await context.newPage();
    await single.route('http://mobile-export.test/direct', (route) => route.fulfill({ contentType: 'text/html', body: stageHtml }));
    await single.goto('http://mobile-export.test/direct');
    await single.locator('#teamSelectScreen.show').waitFor();
    await single.evaluate(() => history.back());
    await single.locator('#exitConfirm[open]').waitFor();
    await single.locator('#cancelExitBtn').click();
    assert.equal(await single.locator('#exitConfirm').getAttribute('open'), null);
    await single.evaluate(() => history.back());
    await single.locator('#exitConfirm[open]').waitFor();
    await single.locator('#confirmExitBtn').click();
    await single.waitForURL('about:blank');
    console.log('PASS single-stage download confirms Back');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
