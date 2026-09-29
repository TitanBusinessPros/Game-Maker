const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launch, pageOptions } = require('./browser-config.cjs');
(async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ ...pageOptions, offline: true });
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(process.argv[2]).href);
    await page.waitForSelector('#teamSelectScreen.show');
    await page.click('#startMatchBtn');
    await page.waitForFunction(() => !document.getElementById('teamSelectScreen').classList.contains('show'));
    assert.deepEqual(errors, []);
    assert.deepEqual(network, [], 'Downloaded game must not request internet resources');
    console.log('PASS actual downloaded file opens and starts a match offline with no network requests');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
