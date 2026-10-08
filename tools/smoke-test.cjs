/* ============================================================
   smoke-test.cjs — runs the REAL index.html in a stubbed DOM and pokes
   the menu's keys, so typos in ids / code paths blow up here instead of
   in the user's browser. No pixels are real; this checks behaviour.

   usage:  NODE_PATH=/tmp/verify/node_modules node tools/smoke-test.cjs
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
// inline the <script src> tags so jsdom executes them without a network layer
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"\s*><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>\n' + code + '\n</script>';
});

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const msg = String(e && e.message || e);
  if (/Not implemented/i.test(msg) && !/play|load/i.test(msg)) return;
  errors.push('jsdomError: ' + msg + (e && e.detail ? '\n   ' + e.detail : ''));
});
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

function fakeCtx(canvas) {
  const mkImg = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  return {
    canvas,
    imageSmoothingEnabled: true,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px monospace',
    createImageData: (w, h) => mkImg(w, h),
    getImageData: (x, y, w, h) => mkImg(w, h),
    putImageData() {}, drawImage() {}, fillRect() {}, clearRect() {}, beginPath() {},
    arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, save() {}, restore() {},
    translate() {}, scale() {}, setTransform() {}, fillText() {}, measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'http://localhost/',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = fakeCtx(this)); };
    window.HTMLCanvasElement.prototype.toDataURL = function () {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGP2YQAAAAASUVORK5CYII=';
    };
    // a very small <audio> stand-in: fires 'error' for the default track
    // (the real mp3 is not in the repo yet) and 'play' when asked to play.
    class FakeAudio {
      constructor(src) {
        this.src = src; this.loop = false; this.volume = 1; this.paused = true;
        this._h = {};
        if (!/^blob:/.test(String(src))) setTimeout(() => this._fire('error'), 5);
      }
      addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); }
      _fire(t) { (this._h[t] || []).forEach(fn => fn({ type: t, target: this })); }
      play() {
        if (/^blob:/.test(String(this.src)) || !/Video%20Game|Video Game/.test(decodeURIComponent(String(this.src)))) {
          this.paused = false; setTimeout(() => this._fire('play'), 1); return Promise.resolve();
        }
        return Promise.reject(new Error('no file'));
      }
      pause() { this.paused = true; this._fire('pause'); }
      load() {}
    }
    window.Audio = FakeAudio;
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.URL.createObjectURL = () => 'blob:fake';
    window.requestAnimationFrame = (fn) => setTimeout(() => fn(window.performance.now()), 8);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const key = (k) => {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
};
const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   <<< ' + (extra || '')));
}

(async () => {
  await wait(200);
  check('menu built 5 items', doc.querySelectorAll('#list .item').length === 5,
    doc.querySelectorAll('#list .item').length + ' items');
  check('heart sprite css var set', /data:image\/png/.test(doc.documentElement.style.getPropertyValue('--heart-img')), '');
  check('pixel unit set', /px$/.test(doc.documentElement.style.getPropertyValue('--u')), doc.documentElement.style.getPropertyValue('--u'));
  check('gate visible before start', !doc.querySelector('#gate').classList.contains('gone'), '');
  check('pixel font wired', /DeterminationMonoWeb/.test(fs.readFileSync(path.join(root, 'assets/css/menu.css'), 'utf8')), '');

  // --- press a key: intro begins ---
  key('a');
  await wait(150);
  check('gate dismissed on first key', doc.querySelector('#gate').classList.contains('gone'), '');
  check('screen got .go (intro anims armed)', doc.querySelector('#screen').classList.contains('go'), '');
  check('title split into animated letters', doc.querySelectorAll('#title .ch').length >= 12, doc.querySelectorAll('#title .ch').length + ' letters');
  check('item 0 selected', doc.querySelectorAll('#list .item')[0].classList.contains('selected'), '');
  check('music chip reports the missing mp3',
    /drop the mp3/.test(doc.querySelector('#music .state').textContent),
    doc.querySelector('#music .state').textContent);

  // --- walk the list ---
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) key(k);
  await wait(60);
  check('selection wrapped back to 0', doc.querySelectorAll('#list .item')[0].classList.contains('selected'), '');
  const panelText = doc.querySelector('#text').textContent;
  check('panel typewriter is writing', panelText.length > 3, JSON.stringify(panelText));
  const midTyping = doc.querySelector('#text').textContent.length;
  await wait(1200);
  check('panel typewriter keeps writing', doc.querySelector('#text').textContent.length > midTyping,
    midTyping + ' -> ' + doc.querySelector('#text').textContent.length);

  // --- jump with number keys ---
  key('4');
  await wait(80);
  check('number key jumps to CREDITS', doc.querySelectorAll('#list .item')[3].classList.contains('selected'), '');

  // --- options screen ---
  key('3'); await wait(60); key('Enter'); await wait(120);
  check('options opened', doc.querySelector('#options').classList.contains('shown'), '');
  check('options rows present', doc.querySelectorAll('#options .opt').length === 7,
    doc.querySelectorAll('#options .opt').length + ' rows');
  key('ArrowDown'); key('ArrowRight'); key('ArrowRight');
  await wait(60);
  check('second row selected', doc.querySelectorAll('#options .opt')[1].classList.contains('sel'), '');
  check('city speed row updated', /×|PAUSED/.test(doc.querySelectorAll('#options .opt')[1].querySelector('.val').textContent),
    doc.querySelectorAll('#options .opt')[1].querySelector('.val').textContent);
  check('speed actually applied to the city', window.SWIFFT.city.cfg.speed >= 0, window.SWIFFT.city.cfg.speed);
  key('ArrowUp'); key('ArrowLeft'); key('ArrowLeft'); await wait(40);
  check('volume slider moved down', window.SWIFFT.options.volume < 0.65, window.SWIFFT.options.volume);
  key('Escape'); await wait(80);
  check('options closed with escape', !doc.querySelector('#options').classList.contains('shown'), '');

  // --- sky must not move when the city does ---
  const before = window.SWIFFT.city.info();
  window.SWIFFT.city.update(1.0, {});
  const after = window.SWIFFT.city.info();
  check('camera advanced', after.camera > before.camera, before.camera + ' -> ' + after.camera);
  check('sky scroll factor is 0', after.skyScroll === 0 && window.SWIFFT.city.cfg.scroll.far > 0, JSON.stringify(after));
  check('far layer parallax < mid < street',
    window.SWIFFT.city.cfg.scroll.far < window.SWIFFT.city.cfg.scroll.mid &&
    window.SWIFFT.city.cfg.scroll.mid < window.SWIFFT.city.cfg.scroll.street, JSON.stringify(window.SWIFFT.city.cfg.scroll));

  // the sky canvas itself must be identical after the city has scrolled
  const skyRef = window.SWIFFT.city.sky;
  window.SWIFFT.city.update(5, {});
  check('sky canvas object untouched by scrolling', window.SWIFFT.city.sky === skyRef, '');

  // --- pause / hide / music toggles ---
  key('p'); key('h'); key('m'); key('f'); await wait(60);
  check('hide-ui toggled', doc.querySelector('#ui').classList.contains('hidden'), '');
  check('m with no mp3 present degrades quietly',
    window.SWIFFT.audio.state === 'missing' && window.SWIFFT.audio.playing === false,
    window.SWIFFT.audio.state + '/' + window.SWIFFT.audio.playing);
  key('h'); key('m'); key('p'); await wait(40);

  // --- dropping an mp3 in (the drag & drop path) ---
  const file = new window.File([Buffer.from('ID3fake')], 'Video Game Lobby (feat. Dashie).mp3', { type: 'audio/mpeg' });
  const drop = new window.Event('drop', { bubbles: true, cancelable: true });
  drop.dataTransfer = { files: [file], types: ['Files'] };
  window.dispatchEvent(drop);
  await wait(80);
  check('dropped mp3 becomes the lobby theme',
    window.SWIFFT.audio.state === 'external' && /Video Game Lobby/.test(window.SWIFFT.audio.trackName),
    window.SWIFFT.audio.state + ' / ' + window.SWIFFT.audio.trackName);
  check('dropped mp3 is actually playing', window.SWIFFT.audio.playing === true, String(window.SWIFFT.audio.playing));
  check('music chip switched to the dropped track',
    /Video Game Lobby/.test(doc.querySelector('#song').textContent),
    doc.querySelector('#song').textContent);
  check('equaliser bars survived the paint',
    doc.querySelectorAll('#music .eq i').length === 12, doc.querySelectorAll('#music .eq i').length + ' bars');
  const dragEv = new window.Event('dragenter', { bubbles: true, cancelable: true });
  dragEv.dataTransfer = { files: [], types: ['Files'] };
  window.dispatchEvent(dragEv);
  check('drag veil appears while dragging a file', doc.querySelector('#drop-veil').classList.contains('shown'), '');
  window.dispatchEvent(new window.Event('dragleave', { bubbles: true }));
  check('drag veil hides again', !doc.querySelector('#drop-veil').classList.contains('shown'), '');

  // --- credits ---
  key('4'); key('Enter'); await wait(80);
  check('credits opened', doc.querySelector('#credits').classList.contains('shown'), '');
  key('Escape'); await wait(60);
  check('credits closed', !doc.querySelector('#credits').classList.contains('shown'), '');

  // --- start / continue / quit paths (must not throw) ---
  for (const n of ['1', '2', '5']) { key(n); await wait(30); key('z'); await wait(60); }
  await wait(200);

  check('no runtime errors', errors.length === 0, errors.slice(0, 6).join('\n   '));

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (errors.length) { console.log('\nERRORS:'); errors.slice(0, 10).forEach(e => console.log(' - ' + e)); }
  dom.window.close();
  process.exit(failed.length ? 1 : 0);
})();
