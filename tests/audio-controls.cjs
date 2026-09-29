const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../play.html'), 'utf8');
const state = html.slice(html.indexOf('  const sounds = {'), html.indexOf("  document.getElementById('mapTitleLabel').textContent"));
const start = html.indexOf("  document.getElementById('musicBtn').addEventListener");
const controls = html.slice(start, html.indexOf('  // ---------------------------------------------------------------------', start));
const created = [];
class Audio {
  constructor(url) { this.url = url; this.paused = true; this.events = {}; created.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
  addEventListener(event, callback) { this.events[event] = callback; }
}
const buttons = Object.fromEntries(['musicBtn', 'sfxBtn'].map(id => [id, {
  addEventListener(event, callback) { this[event] = callback; },
  setAttribute(name, value) { this[name] = value; },
}]));
const context = vm.createContext({
  Audio, cfg: { sounds: { music: 'music.mp3' } }, player: { id: 0 },
  factionOf: id => ({ 0: {}, 1: {}, 2: { isMapOnly: true } })[id],
  fogOn: false,
  loadAudio: url => url ? new Audio(url) : null,
  document: { getElementById: id => buttons[id] },
});
vm.runInContext(state + controls, context);
const music = created[0];
context.playSfx('attack.mp3');
assert.equal(created.length, 1, 'effects initially off');
buttons.musicBtn.click();
assert.equal(music.paused, false);
assert.equal(music.loop, true);
context.playSfx('attack.mp3');
assert.equal(created.length, 1, 'music enabled with effects muted');
buttons.sfxBtn.click();
context.playUnitSound({ factionId: 1, weaponSound: 'enemy.mp3' });
assert.equal(created.length, 1, 'opponent custom sounds remain silent');
context.playUnitSound({ factionId: 2, weaponSound: 'defender.mp3' });
assert.equal(created.at(-1).url, 'defender.mp3', 'base-free defender sounds play');
context.playUnitSound({ factionId: 0, weaponSound: 'weapon.mp3' });
const effect = created.at(-1);
assert.equal(effect.paused, false);
buttons.musicBtn.click();
assert.equal(music.paused, true);
assert.equal(effect.paused, false, 'music mute leaves effects playing');
buttons.musicBtn.click();
buttons.sfxBtn.click();
assert.equal(effect.paused, true, 'effects mute stops current sounds');
assert.equal(music.paused, false, 'effects mute leaves music playing');
assert.equal(buttons.musicBtn.textContent, 'Music: On');
assert.equal(buttons.sfxBtn.textContent, 'Effects: Off');
assert.equal(buttons.musicBtn['aria-pressed'], 'true');
assert.equal(buttons.sfxBtn['aria-pressed'], 'false');
context.playSfx('endgame.mp3');
assert.equal(created.at(-1), effect, 'future effects stay muted');
buttons.sfxBtn.click();
context.playSfx('attack.mp3');
const completed = created.at(-1);
completed.events.ended();
assert.equal(vm.runInContext('activeSfx.size', context), 0, 'completed audio released');
assert.match(html, /id="musicBtn"[^>]*aria-pressed="false"/);
assert.match(html, /id="sfxBtn"[^>]*aria-pressed="false"/);
assert.ok(!html.includes('soundOn'));
console.log('PASS independent music/effects controls, immediate mute, custom sounds, cleanup and accessible state');
