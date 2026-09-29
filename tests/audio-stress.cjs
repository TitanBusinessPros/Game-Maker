const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch } = require('./browser-config.cjs');
const html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const state = html.slice(html.indexOf('  const sounds = {'), html.indexOf("  document.getElementById('mapTitleLabel').textContent"));
const start = html.indexOf("  document.getElementById('musicBtn').addEventListener");
const controls = html.slice(start, html.indexOf('  // ---------------------------------------------------------------------', start));
// A real, quiet PCM tone, embedded exactly like sounds in a downloaded game.
const wav = Buffer.alloc(44 + 16000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(16000, 40);
for (let i = 0; i < 8000; i++) wav.writeInt16LE(Math.round(100 * Math.sin(i * Math.PI * 2 * 440 / 8000)), 44 + i * 2);
const url = 'data:audio/wav;base64,' + wav.toString('base64');
(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="musicBtn">Music</button><button id="sfxBtn">Effects</button>');
    await page.addScriptTag({ content: `
      const cfg = {sounds: {music: ${JSON.stringify(url)}}};
      const loadAudio = url => new Audio(url), player = {id: 0};
      let fetchCount = 0;
      const originalFetch = window.fetch;
      window.fetch = (...args) => { fetchCount++; return originalFetch(...args); };
      ${state}\n${controls}
      window.testSound = ${JSON.stringify(url)};
    ` });
    await page.click('#musicBtn');
    await page.click('#sfxBtn');
    await page.evaluate(() => {
      window.decodeCount = 0;
      const decode = sfxContext.decodeAudioData.bind(sfxContext);
      sfxContext.decodeAudioData = (...args) => { decodeCount++; return decode(...args); };
    });
    for (let round = 0; round < 4; round++) {
      const result = await page.evaluate(async () => {
        await Promise.all(Array.from({length: 200}, () => playSfx(testSound)));
        return { voices: activeSfxSources.size, fallback: activeSfx.size, fetchCount, decodeCount, state: sfxContext.state, music: !sounds.music.paused };
      });
      assert.equal(result.voices, 200);
      assert.equal(result.fallback, 0);
      assert.equal(result.fetchCount, 1);
      assert.equal(result.decodeCount, 1);
      assert.equal(result.state, 'running');
      assert.equal(result.music, true);
      await page.waitForFunction(() => activeSfxSources.size === 0);
    }
    console.log('PASS 800 effects in repeated 200-voice bursts, one decode/download, cleanup and continuous music');
    await page.evaluate(() => Promise.all(Array.from({length: 50}, () => playSfx(testSound))));
    await page.click('#sfxBtn');
    assert.deepEqual(await page.evaluate(() => ({voices: activeSfxSources.size, music: !sounds.music.paused})), { voices: 0, music: true });
    await page.click('#sfxBtn');
    await page.evaluate(async () => {
      const fetchSaved = window.fetch;
      let release;
      window.fetch = () => new Promise(resolve => { release = resolve; });
      const delayed = playSfx(testSound + '#delayed');
      document.getElementById('sfxBtn').click();
      document.getElementById('sfxBtn').click();
      window.fetch = fetchSaved;
      release(await fetchSaved(testSound));
      await delayed;
    });
    assert.equal(await page.evaluate(() => activeSfxSources.size), 0);
    await page.evaluate(async () => { await sfxContext.suspend(); await playSfx(testSound); });
    assert.equal(await page.evaluate(() => sfxContext.state), 'running');
    console.log('PASS immediate mute, cancellation of pending sounds and recovery from suspended audio');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
