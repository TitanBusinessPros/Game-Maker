const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { launch, pageOptions } = require('./browser-config.cjs');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const exporter = html.slice(html.indexOf('async function inlineUrlsAsDataUris('), html.indexOf('async function downloadStandaloneGame('));
  const gif = fs.readFileSync(path.join(__dirname, 'fixtures/disposal-2.gif'));
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.end('<!doctype html><title>Export test</title>'); return; }
    if (req.url !== '/cors-denied.gif') res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/missing.gif') { res.writeHead(404); res.end('Missing'); return; }
    res.setHeader('Content-Type', 'image/gif');
    res.end(req.url === '/empty.gif' ? Buffer.alloc(0) : gif);
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  let browser;
  try {
    const port = server.address().port;
    browser = await launch();
    const page = await browser.newPage(pageOptions);
    await page.goto(`http://localhost:${port}/`);
    await page.addScriptTag({ content: exporter });
    const asset = `http://127.0.0.1:${port}/character.gif`;
    const result = await page.evaluate(url => inlineUrlsAsDataUris({ units: [{ imageUrl: url }], miningUnit: { image: url } }), asset);
    assert.equal(result.units[0].imageUrl, 'data:image/gif;base64,' + gif.toString('base64'));
    assert.equal(result.miningUnit.image, result.units[0].imageUrl);
    console.log('PASS cross-origin GIF embedded unchanged in nested map configuration');
    for (const file of ['missing.gif', 'cors-denied.gif', 'empty.gif']) {
      const error = await page.evaluate(async url => {
        try { await inlineUrlsAsDataUris({image:url}); return null; }
        catch (error) { return error.message; }
      }, `http://127.0.0.1:${port}/${file}`);
      assert.match(error, /asset\(s\) could not be downloaded/);
      console.log('PASS export stops instead of retaining broken URL: ' + file);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
