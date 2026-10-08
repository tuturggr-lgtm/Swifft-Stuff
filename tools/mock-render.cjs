/* ============================================================
   mock-render.cjs — draws an approximation of the LIVE menu screen
   (same city engine, same art, the real Determination Mono font,
   same u-based sizes as menu.css) so the composition can be checked
   without a browser. Not pixel-identical to the DOM, but close enough
   to judge scale, spacing and readability.

   usage: NODE_PATH=/tmp/verify/node_modules node tools/mock-render.cjs [out.png] [W] [H]
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { createArt } = require(path.join(__dirname, '..', 'assets', 'js', 'art.js'));
const { createCity } = require(path.join(__dirname, '..', 'assets', 'js', 'city.js'));

const out = process.argv[2] || '/tmp/preview/menu-mock.png';
const W = parseInt(process.argv[3] || '1280', 10);
const H = parseInt(process.argv[4] || '720', 10);

const FONT_FILE = process.env.DTM_TTF || '/tmp/font/DeterminationMono.ttf';
if (fs.existsSync(FONT_FILE)) GlobalFonts.registerFromPath(FONT_FILE, 'Determination Mono Web');
const FONT = "'Determination Mono Web', monospace";

const art = createArt((w, h) => createCanvas(w, h));
const K = Math.max(1, Math.min(4, Math.round(H / 400)));
const VW = Math.ceil(W / K), VH = Math.ceil(H / K);
// same even-rounding of the pixel unit as menu.js
const u = (function () {
  const b = Math.max(4, Math.min(10, Math.round(Math.min(W / 2.0, H) / 128)));
  return b % 2 ? b + 1 : b;
})();

const city = createCity((w, h) => createCanvas(w, h), art, { speed: 30, seed: 20261008 });
city.resize(VW, VH);
city.camera = Number(process.env.CAM || 0);

const c = createCanvas(W, H);
const x = c.getContext('2d');
x.imageSmoothingEnabled = false;
x.setTransform(K, 0, 0, K, 0, 0);
city.draw(x, Number(process.env.T || 3.4));
x.setTransform(1, 0, 0, 1, 0, 0);

/* ---------- helpers that mirror the css ---------- */
const BONE = '#f7f7f7', DIM = '#bdbdbd', FAINT = '#8a8a8a', SOUL = '#ff2b2b', GOLD = '#ffd23f';
function text(str, px, color, align) {
  x.font = px + 'px ' + FONT;
  x.fillStyle = color;
  x.textBaseline = 'alphabetic';
  if (align) x.textAlign = align;
}
const measure = (str, px) => { x.font = px + 'px ' + FONT; return x.measureText(str).width; };

function box(px, py, w, h, fill, stroke, line) {
  line = line || 3;
  x.fillStyle = fill;
  x.fillRect(px, py, w, h);
  x.strokeStyle = stroke;
  x.lineWidth = line;
  x.strokeRect(px + line / 2, py + line / 2, w - line, h - line);
}
function bloom(px, py, r, col, a) {
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, col.replace('rgb', 'rgba').replace(')', ',' + a + ')'));
  g.addColorStop(1, col.replace('rgb', 'rgba').replace(')', ',0)'));
  x.fillStyle = g;
  x.beginPath(); x.arc(px, py, r, 0, 6.2832); x.fill();
}

/* ---------- text blur helper (text-shadow approximation) ---------- */
function shadowText(str, cx, cy, px, col, ls, align) {
  const total = measure(str, px) + ls * (str.length - 1);
  let sx = align === 'center' ? cx - total / 2 : cx;
  for (const ch of str) {
    x.font = px + 'px ' + FONT;
    x.fillStyle = 'rgba(0,0,0,0.85)';
    x.textAlign = 'left';
    x.fillText(ch, sx + u * 0.5, cy + u * 0.5);
    x.fillStyle = col;
    x.fillText(ch, sx, cy);
    sx += measure(ch, px) + ls;
  }
  return total;
}

/* ================= the screen ================= */

const padX = 3 * u, padY = 2 * u;
const titlePx = 8 * u, itemPx = 4 * u, panelPx = 3 * u, subPx = 2.2 * u;

/* --- top bar --- */
const hudPx = 2 * u;
const hud1 = 'SWIFFT STUFF';
const keys = '\u2191 \u2193 move   |   Z select   |   M music   |   H hide ui';
const h1w = Math.max(measure(hud1, hudPx), measure(keys, hudPx)) + 1.1 * u * 2 + 3;
const h1h = hudPx * 1.35 * 2 + 0.7 * u * 2 + 3;
box(padX, padY, h1w, h1h, 'rgba(0,0,0,0.62)', 'rgba(247,247,247,0.82)');
text(hud1, hudPx, BONE); x.textAlign = 'left';
x.fillText(hud1, padX + 1.1 * u, padY + 0.7 * u + hudPx);
x.fillText(keys, padX + 1.1 * u, padY + 0.7 * u + hudPx * 2.35);

const mTitle = 'Video Game Lobby (feat. Dashie)';
const musW = 0.5 * u * 12 + 10 * 2 + measure(mTitle, hudPx) + 1.1 * u * 2 + 3 + 1.4 * u;
const musH = h1h;
const musX = W - padX - musW, musY = padY;
box(musX, musY, musW, musH, 'rgba(0,0,0,0.62)', 'rgba(247,247,247,0.82)');
x.textAlign = 'left';
text('NOW PLAYING', 1.6 * u, FAINT);
x.fillText('NOW PLAYING', musX + 1.1 * u, musY + 0.7 * u + 1.6 * u);
// eq bars
const eqX = musX + 1.1 * u;
const eqTop = musY + 0.7 * u + 1.6 * u + 0.5 * u;
for (let i = 0; i < 12; i++) {
  const lv = 0.2 + 0.8 * Math.abs(Math.sin(i * 1.7 + 0.4));
  x.fillStyle = BONE;
  x.fillRect(eqX + i * (0.5 * u + 2), eqTop + 2.2 * u * (1 - lv), 0.5 * u, 2.2 * u * lv);
}
text(mTitle, hudPx, BONE);
x.fillText(mTitle, eqX + 12 * (0.5 * u + 2) + 0.7 * u, eqTop + 2.2 * u - 0.2 * u);
text('NOW PLAYING', 1.6 * u, GOLD);
x.fillText('NOW PLAYING', eqX, eqTop + 2.2 * u + 1.9 * u);

/* --- the hero title --- */
const heroTop = padY + h1h + 1.5 * u;
const titleY = heroTop + 1.5 * u + titlePx * 0.82;
bannerGlow(titleY);
function bannerGlow(ty) {
  bloom(W / 2, ty - titlePx * 0.35, titlePx * 4.2, 'rgb(120,190,255)', 0.10);
  bloom(W / 2, ty - titlePx * 0.35, titlePx * 7.5, 'rgb(255,111,216)', 0.05);
}
shadowText('SWIFFT STUFF', W / 2, titleY, titlePx, BONE, u * 0.32, 'center');

const subY = titleY + titlePx * 0.42 + subPx * 1.6;
x.textAlign = 'center';
text('an endless city \u2665 a sky that holds still', subPx, DIM);
x.fillText('an endless city \u2665 a sky that holds still', W / 2, subY);

/* --- the menu --- */
const items = [['01', 'START'], ['02', 'CONTINUE'], ['03', 'OPTIONS'], ['04', 'CREDITS'], ['05', 'QUIT']];
const hints = ['begin the ride', 'load a save', 'tune the ride', 'who made this', 'leave'];
const selected = Number(process.env.SEL || '2');
let my = subY + 0.8 * u + 3 * u + itemPx * 1.15;
const itemH = itemPx * 1.15 + 0.25 * u * 2;
const gap = 0.5 * u;
const widest = Math.max.apply(null, items.map((it, i) => measure(it[1], itemPx) + measure('\u2014 ' + hints[i], 2 * u) + 6.6 * u));
const menuX = W / 2 - widest / 2;
for (let i = 0; i < items.length; i++) {
  const y = my + i * (itemH + gap);
  const sel = i === selected;
  const col = sel ? GOLD : DIM;
  x.textAlign = 'left';
  text(items[i][0], 2.2 * u, sel ? SOUL : '#4e4e5e');
  x.fillText(items[i][0], menuX, y + itemPx * 0.86);
  const jitter = sel ? u * 0.6 : 0;
  shadowText(items[i][1], menuX + 5.2 * u + jitter, y + itemPx * 0.86, itemPx, col, u * 0.14, 'left');
  text('\u2014 ' + hints[i], 2 * u, sel ? '#8c7a3a' : '#56566a');
  x.fillText('\u2014 ' + hints[i], menuX + 5.2 * u + jitter + measure(items[i][1], itemPx) + 1.2 * u, y + itemPx * 0.86);
  if (sel) {                                    // the soul
    const hx = menuX + 1.0 * u, hy = y + itemH / 2 - 1.36 * u;
    drawHeart(hx, hy, u * 3.4 / 15);
    bloom(hx + 1.7 * u, hy + 1.36 * u, 1.4 * u, 'rgb(255,43,43)', 0.35);
  }
}
my += items.length * (itemH + gap);

/* --- the dialogue panel --- */
const panelW = Math.min(118 * u, W * 0.92);
const panelX = W / 2 - panelW / 2;
const panelY = H - padY - 1.9 * u * 1.6 - 0.4 * u - 1.5 * u - 11 * u;
box(panelX, panelY, panelW, 11 * u, 'rgba(0,0,0,0.86)', '#ffffff');
x.textAlign = 'left';
const line = '* Take the long way home.';
const line2 = '* The city only ever scrolls forwards \u2014 the sky stays put and watches.';
text(line, panelPx, BONE);
x.fillText(line, panelX + 1.6 * u, panelY + 1.3 * u + 3 * u);
text(line2, panelPx, BONE);
x.fillText(line2, panelX + 1.6 * u, panelY + 1.3 * u + 3 * u + 3 * u * 1.5);
text('\u25bc', 2.4 * u, BONE);
x.textAlign = 'right';
x.fillText('\u25bc', panelX + panelW - 1.6 * u, panelY + 11 * u - 1.3 * u);

/* --- hints --- */
const hintY = H - padY;
x.textAlign = 'center';
text('1-5 jump     Z confirm     X back     P pause city     F fullscreen', 1.9 * u, FAINT);
x.fillText('1-5 jump     Z confirm     X back     P pause city     F fullscreen', W / 2, hintY - 0.4 * u);
text('sky: static', 1.9 * u, SOUL);
x.fillText('sky: static', W / 2 + measure('1-5 jump     Z confirm     X back     P pause city     F fullscreen', 1.9 * u) / 2 + 2.2 * u + measure('sky: static', 1.9 * u) / 2, hintY - 0.4 * u);

/* --- scanlines + vignette --- */
x.fillStyle = 'rgba(0,0,0,0.22)';
for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
const vg = x.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.28, W / 2, H * 0.46, Math.max(W, H) * 0.72);
vg.addColorStop(0, 'rgba(0,0,0,0)');
vg.addColorStop(0.72, 'rgba(0,0,0,0.42)');
vg.addColorStop(1, 'rgba(0,0,0,0.72)');
x.fillStyle = vg;
x.fillRect(0, 0, W, H);

/* ---------- the soul sprite ---------- */
function drawHeart(px, py, scale) {
  const rows = [
    '...XXX...XXX...', '..XXXXXXXXXXX..', '.XXXXXXXXXXXXX.', '.XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXX.', '.XXXXXXXXXXXXX.', '..XXXXXXXXXXX..', '...XXXXXXXXX...',
    '....XXXXXXX....', '.....XXXXX.....', '......XXX......', '.......X.......'
  ];
  for (let ry = 0; ry < rows.length; ry++) {
    for (let rx = 0; rx < 15; rx++) {
      if (rows[ry][rx] !== 'X') continue;
      const on = (a, b) => b >= 0 && b < rows.length && a >= 0 && a < 15 && rows[b][a] === 'X';
      const rim = !on(rx + 1, ry) || !on(rx, ry + 1) || ry >= rows.length - 2;
      const shine = (ry === 2 || ry === 3) && rx >= 3 && rx <= 4;
      x.fillStyle = shine ? '#ff9b9b' : (rim ? '#c01717' : '#ff2b2b');
      x.fillRect(Math.round(px + rx * scale), Math.round(py + ry * scale), Math.ceil(scale), Math.ceil(scale));
    }
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote ' + out + '  (' + W + 'x' + H + ', u=' + u + ', scale=' + K + ', view=' + VW + 'x' + VH + ')');
