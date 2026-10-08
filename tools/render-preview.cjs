/* Headless scene renderer: bakes the exact same city the browser makes and
   writes PNGs, so the art can be eyeballed without a browser.

   usage: NODE_PATH=<dir with @napi-rs/canvas> node tools/render-preview.cjs [outdir] [scene|tiles] [W] [H]
*/
const path = require('path');
const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
const { createArt } = require(path.join(__dirname, '..', 'assets', 'js', 'art.js'));
const { createCity } = require(path.join(__dirname, '..', 'assets', 'js', 'city.js'));

const outDir = process.argv[2] || '/tmp/preview';
const mode = process.argv[3] || 'scene';
const W = parseInt(process.argv[4] || '1280', 10);
const H = parseInt(process.argv[5] || '720', 10);
fs.mkdirSync(outDir, { recursive: true });

// exactly the browser's pixel scale + virtual viewport maths
const K = Math.max(1, Math.min(4, Math.round(H / 400)));
const VW = Math.ceil(W / K), VH = Math.ceil(H / K);

const art = createArt((w, h) => createCanvas(w, h));
const city = createCity((w, h) => createCanvas(w, h), art, { speed: 30 });
city.resize(VW, VH);

function shot(camera, time, file) {
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  city.camera = camera;
  x.setTransform(K, 0, 0, K, 0, 0);
  city.draw(x, time);
  x.setTransform(1, 0, 0, 1, 0, 0);
  fs.writeFileSync(path.join(outDir, file), c.toBuffer('image/png'));
  console.log('wrote', file, '(' + W + 'x' + H + ', camera ' + camera + ', t ' + time + ')');
}

if (mode === 'tiles') {
  const rows = [];
  for (const L of city.layers) for (const t of L.tiles) rows.push(t);
  const strip = createCanvas(1200, rows.length * 480);
  const s = strip.getContext('2d');
  s.imageSmoothingEnabled = false;
  rows.forEach((t, i) => s.drawImage(t.canvas, 0, i * 480));
  fs.writeFileSync(path.join(outDir, 'tiles.png'), strip.toBuffer('image/png'));
  console.log('wrote tiles.png (' + rows.length + ' tiles)');
} else {
  shot(0, 0, 'scene-a.png');
  shot(1337, 6.5, 'scene-b.png');
  shot(7777, 21.25, 'scene-c.png');
}
