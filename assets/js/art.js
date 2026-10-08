/* ============================================================
   Swifft Stuff — art.js
   Procedural pixel-art generators (works in the browser AND in node,
   so the exact same drawings can be rendered headless for preview).
   Everything is baked into small offscreen canvases at 1x game
   resolution, then blitted with smoothing OFF => crisp pixels.
   ============================================================ */
(function (global) {
  'use strict';

  /* 4x4 ordered dither — the secret sauce for retro gradients  */
  const BAYER = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(h) {
    let s = String(h).trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const mixRgb = (a, b, t) => lerpRgb(a, b, clamp(t, 0, 1));
  const rndInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  /* default night-city palette — every colour is overridable */
  const PAL = {
    skyTop:    '#04061a',
    skyUpper:  '#0a1030',
    skyMid:    '#151f4e',
    skyLow:    '#27336b',
    horizon:   '#454f86',
    haze:      '#5b5f9e',
    star:      '#e6edff',
    starDim:   '#8fa4dd',
    moon:      '#f4f6df',
    moonShade: '#c9cfae',
    backFar:   '#080c20',
    backMid:   '#0e1430',
    backWin:   '#222b56',
    backGround:'#060917',
    buildA:    '#1b2246',
    buildB:    '#232c56',
    buildC:    '#151b3a',
    outline:   '#070913',
    winDim:    '#2a3157',
    winLit:    '#ffcf6b',
    winLit2:   '#ffe6a8',
    winLit3:   '#ffb04a',
    neonA:     '#ff6fd8',
    neonB:     '#6ff0ff',
    neonC:     '#ff5d5d',
    neonD:     '#a8ff6f',
    sidewalk:  '#1d2239',
    sidewalkHi:'#2b3152',
    curb:      '#171c33',
    road:      '#0d1020',
    roadLine:  '#2b3158',
    lamp:      '#ffe9a8'
  };

  function createArt(createCanvas) {
    function mk(w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      const c = createCanvas(w, h);
      c.width = w; c.height = h;              // (re)set => clears
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      return c;
    }
    function ctxOf(c) {
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      return x;
    }

    /* ---------- low level pixel helpers (crisp, no anti-aliasing) ---------- */

    // dithered vertical gradient written straight into an ImageData buffer
    function ditherGradient(buf, W, H, stops, y0, y1, levels) {
      levels = levels || 16;
      const step = 255 / (levels - 1);
      for (let y = y0; y < y1; y++) {
        const t = H > 1 ? (y - y0) / (y1 - y0 - 1) : 0;
        let i = 0;
        while (i < stops.length - 2 && t > stops[i + 1].p) i++;
        const s0 = stops[i], s1 = stops[i + 1] || stops[i];
        const k = (t - s0.p) / Math.max(1e-6, (s1.p - s0.p));
        const col = lerpRgb(s0.c, s1.c, clamp(k, 0, 1));
        for (let x = 0; x < W; x++) {
          const th = (BAYER[y & 3][x & 3] + 0.5) / 16;
          const o = (y * W + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const v = col[ch];
            const q = Math.round(v / step) * step;
            const err = (v - q) / step;
            let out = q;
            if (err > 0 && th < err) out = q + step;
            else if (err < 0 && th < -err) out = q - step;
            buf[o + ch] = clamp(out, 0, 255);
          }
          buf[o + 3] = 255;
        }
      }
    }

    function plot(buf, W, H, x, y, rgb, alpha) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      if (alpha >= 1) {
        buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = 255;
        return;
      }
      const a = clamp(alpha, 0, 1);
      // bayer-dithered alpha so glows stay retro instead of smooth
      const th = (BAYER[y & 3][x & 3] + 0.5) / 16;
      if (th > a) return;
      buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = 255;
    }

    // soft round glow, dithered into a few discrete steps
    function makeGlow(size, color, strength) {
      const c = mk(size, size), x = ctxOf(c);
      const img = x.createImageData(size, size), d = img.data;
      const rgb = hexToRgb(color);
      const R = size / 2;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const dx = (px + 0.5) - R, dy = (py + 0.5) - R;
          const dist = Math.sqrt(dx * dx + dy * dy) / R;
          if (dist > 1) continue;
          const a = Math.pow(1 - dist, 2.2) * (strength == null ? 1 : strength);
          plot(d, size, size, px, py, rgb, a);
        }
      }
      x.putImageData(img, 0, 0);
      return c;
    }

    /* =========================================================
       SKY — completely static (the sky does NOT scroll)
       ========================================================= */
    function makeSky(W, H, pal, seed, opt) {
      opt = opt || {};
      const rng = mulberry32(seed == null ? 1337 : seed);
      const c = mk(W, H), x = ctxOf(c);
      const img = x.createImageData(W, H), d = img.data;
      const hy = Math.max(40, Math.min(H, Math.round(opt.horizonY == null ? H : opt.horizonY)));

      ditherGradient(d, W, H, [
        { p: 0.00, c: hexToRgb(pal.skyTop) },
        { p: 0.38, c: hexToRgb(pal.skyUpper) },
        { p: 0.68, c: hexToRgb(pal.skyMid) },
        { p: 0.88, c: hexToRgb(pal.skyLow) },
        { p: 1.00, c: hexToRgb(pal.horizon) }
      ], 0, hy);
      // everything below the horizon is filled with the horizon colour (hidden by the skyline)
      for (let y = hy; y < H; y++) {
        for (let px = 0; px < W; px++) plot(d, W, H, px, y, hexToRgb(pal.horizon), 1);
      }

      const hazeRgb = hexToRgb(pal.haze);

      // ---- stars ----
      const starCount = opt.stars == null ? Math.round(W * hy / 1750) : opt.stars;
      const sRgb = hexToRgb(pal.star), sDim = hexToRgb(pal.starDim);
      const band = Math.max(1, Math.round(hy * 0.74));
      for (let i = 0; i < starCount; i++) {
        const sx = rndInt(rng, 0, W - 1);
        const sy = rndInt(rng, 0, band);
        const bright = rng();
        const col = bright > 0.72 ? sRgb : mixRgb(sDim, sRgb, rng() * 0.7);
        const fade = 1 - Math.pow(sy / band, 1.6) * 0.75;         // thin out near the glow
        const a = (0.45 + bright * 0.55) * fade;
        if (a <= 0.12) continue;
        plot(d, W, H, sx, sy, col, 1);
        if (bright > 0.9) {                                        // the showy ones get a flare
          plot(d, W, H, sx - 1, sy, col, a * 0.5);
          plot(d, W, H, sx + 1, sy, col, a * 0.5);
          plot(d, W, H, sx, sy - 1, col, a * 0.5);
          plot(d, W, H, sx, sy + 1, col, a * 0.5);
        }
      }

      // ---- moon ----
      if (opt.moon !== false) {
        const R = opt.moonR || Math.max(9, Math.round(W * 0.032));
        const mx = Math.round(W * (opt.moonX == null ? 0.76 : opt.moonX));
        const my = Math.round(hy * (opt.moonY == null ? 0.26 : opt.moonY));
        const mRgb = hexToRgb(pal.moon), mShade = hexToRgb(pal.moonShade), halo = hazeRgb;
        const HR = R * 3.4;
        for (let py = Math.floor(my - HR); py <= Math.ceil(my + HR); py++) {
          for (let px = Math.floor(mx - HR); px <= Math.ceil(mx + HR); px++) {
            const dx = px - mx, dy = py - my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > HR) continue;
            if (dist <= R) {
              const lx = px - mx, ly = py - my;
              let col = mRgb;
              if (R - dist < 1.2) col = mixRgb(mRgb, halo, 0.35);
              const craterA = (lx + R * 0.32) ** 2 + (ly + R * 0.30) ** 2 < (R * 0.26) ** 2;
              const craterB = (lx - R * 0.30) ** 2 + (ly + R * 0.42) ** 2 < (R * 0.17) ** 2;
              const craterC = (lx - R * 0.12) ** 2 + (ly - R * 0.40) ** 2 < (R * 0.20) ** 2;
              if (craterA || craterB || craterC) col = mixRgb(mShade, mRgb, dist / R * 0.5);
              plot(d, W, H, px, py, col, 1);
            } else {
              plot(d, W, H, px, py, halo, Math.pow(1 - (dist - R) / (HR - R), 2.4) * 0.42);
            }
          }
        }
      }

      // ---- warm rind sitting on the horizon ----
      const rind = Math.min(30, Math.round(hy * 0.14));
      for (let y = Math.max(0, hy - rind); y < hy; y++) {
        const t = (y - (hy - rind)) / rind;
        for (let px = 0; px < W; px++) plot(d, W, H, px, y, hazeRgb, 0.10 + t * 0.32);
      }

      x.putImageData(img, 0, 0);
      return c;
    }

    /* =========================================================
       BACK TIER — distant skyline silhouette
       ========================================================= */
    function makeBackTier(tileW, H, pal, seed, opt) {
      opt = opt || {};
      const rng = mulberry32(seed);
      const c = mk(tileW, H), x = ctxOf(c);
      const baseline = opt.baseline == null ? Math.round(H * 0.545) : opt.baseline;
      const far = hexToRgb(pal.backFar), mid = hexToRgb(pal.backMid);
      const plane = hexToRgb(pal.backGround), winRgb = hexToRgb(pal.backWin);

      const meta = { beacons: [], anim: [], lamps: [] };
      const img = x.createImageData(tileW, H), d = img.data;
      // dark plane under the horizon
      for (let y = baseline; y < H; y++) {
        for (let px = 0; px < tileW; px++) plot(d, tileW, H, px, y, plane, 1);
      }
      x.putImageData(img, 0, 0);

      // pixel-perfect silhouettes
      const img2 = x.getImageData(0, 0, tileW, H), dd = img2.data;
      const tops = new Array(tileW).fill(H);
      let px2 = rndInt(rng, 0, 6);
      while (px2 < tileW) {
        const w = rndInt(rng, opt.minW || 16, opt.maxW || 52);
        const rr = rng();
        const h = rr < 0.30 ? rndInt(rng, 8, 22)                          // low far blocks
                : rr < 0.90 ? rndInt(rng, opt.minH || 18, opt.maxH || 74)
                : rndInt(rng, (opt.maxH || 74) + 8, (opt.maxH || 74) + 26); // lone distant spire
        const top = baseline - h;
        const col = rng() > 0.5 ? far : mid;
        for (let bx = px2; bx < Math.min(tileW, px2 + w); bx++) {
          for (let by = top; by < Math.min(H, baseline); by++) {
            plot(dd, tileW, H, bx, by, col, 1);
          }
          tops[bx] = Math.min(tops[bx], top);
        }
        // rooftop light / antenna
        if (rng() > 0.72) {
          const ax = px2 + Math.floor(w / 2);
          const ah = rndInt(rng, 3, 12);
          for (let by = top - ah; by < top; by++) plot(dd, tileW, H, ax, by, col, 1);
          if (rng() < 0.45) meta.beacons.push({ x: ax, y: top - ah - 1, phase: rng(), dim: true });
        }
        // sparse far windows
        for (let by = top + 3; by < baseline - 2; by += 3) {
          for (let bx = px2 + 2; bx < Math.min(tileW, px2 + w - 2); bx += 3) {
            if (rng() < 0.07) plot(dd, tileW, H, bx, by, winRgb, 0.85);
          }
        }
        px2 += w + rndInt(rng, 1, 5);
      }

      // atmospheric haze hanging over the skyline
      const haze = hexToRgb(pal.haze);
      for (let bx = 0; bx < tileW; bx++) {
        const top = tops[bx];
        for (let by = Math.max(0, top - 26); by < H; by++) {
          // 1) washed-out haze above the rooftops  2) sinking into the ground plane
          const above = clamp(1 - (top - by) / 26, 0, 1);
          if (by < top) plot(dd, tileW, H, bx, by, haze, 0.32 * above + 0.04);
          else plot(dd, tileW, H, bx, by, haze, 0.055);
        }
      }
      x.putImageData(img2, 0, 0);
      return { canvas: c, meta };
    }

    /* =========================================================
       MAIN TIER — the buildings you actually drive past
       ========================================================= */
    function makeMainTier(tileW, H, pal, seed, opt) {
      opt = opt || {};
      const rng = mulberry32(seed);
      const c = mk(tileW, H), x = ctxOf(c);
      const baseY = opt.baseY == null ? Math.round(H * 0.625) : opt.baseY;
      const walkH = opt.walkH == null ? 16 : opt.walkH;
      const meta = { beacons: [], anim: [], lamps: [], glows: [] };

      const OUT = hexToRgb(pal.outline);
      const fills = [
        hexToRgb(pal.buildA), hexToRgb(pal.buildB), hexToRgb(pal.buildC),
        mixRgb(hexToRgb(pal.buildB), [90, 60, 130], 0.16),   // violet cast
        mixRgb(hexToRgb(pal.buildA), [40, 90, 110], 0.18),   // teal cast
        mixRgb(hexToRgb(pal.buildC), [140, 90, 60], 0.13)    // brick cast
      ];
      const litCols = [hexToRgb(pal.winLit), hexToRgb(pal.winLit2), hexToRgb(pal.winLit3)];
      const neons = [hexToRgb(pal.neonA), hexToRgb(pal.neonB), hexToRgb(pal.neonC), hexToRgb(pal.neonD)];
      const img = x.createImageData(tileW, H), d = img.data;
      const R = (px, py, col, a) => plot(d, tileW, H, px, py, col, a);
      const rect = (px, py, w, h, col, a) => {
        for (let yy = py; yy < py + h; yy++) for (let xx = px; xx < px + w; xx++) R(xx, yy, col, a == null ? 1 : a);
      };

      // full-width sidewalk band (+ its shadow line) so the tier never shows a hole
      const walk = hexToRgb(pal.sidewalk), walkHi = hexToRgb(pal.sidewalkHi), curb = hexToRgb(pal.curb);
      for (let y = baseY; y < H; y++) {
        for (let px = 0; px < tileW; px++) R(px, y, y === baseY ? walkHi : walk, 1);
      }
      for (let px = 0; px < tileW; px++) {
        if (px % 16 === 0) rect(px, baseY + 2, 1, walkH - 2, curb, 1);
      }
      rect(0, baseY + walkH - 1, tileW, 1, curb, 1);
      rect(0, baseY + walkH, tileW, H - baseY - walkH, hexToRgb(pal.road), 1);

      // buildings
      let cursor = rndInt(rng, 2, 14);
      const lampSpots = [];
      while (cursor < tileW - 8) {
        const w = rndInt(rng, opt.minW || 34, opt.maxW || 78);
        if (cursor + w > tileW - 4) break;
        const roll = rng();
        const tallChance = opt.tallChance == null ? 0.14 : opt.tallChance;
        let h;
        if (roll < (opt.lowChance == null ? 0.18 : opt.lowChance)) {
          h = rndInt(rng, opt.lowMin || 20, opt.lowMax || 38);          // corner store / low-rise
        } else if (roll < (opt.lowChance == null ? 0.18 : opt.lowChance) + tallChance) {
          h = rndInt(rng, (opt.maxH || 108) + 16, (opt.maxH || 108) + 66); // proper tower
        } else {
          h = rndInt(rng, opt.minH || 42, opt.maxH || 108);
        }
        const top = baseY - h;
        const body = pick(rng, fills);
        // unlit glass is tinted FROM the wall colour, so no building ever goes blank
        const dimCol = mixRgb(body, [255, 255, 255], 0.13);
        const bx = cursor;

        // outline + body
        rect(bx - 1, top - 1, w + 2, h + 1, OUT, 1);
        rect(bx, top, w, h, body, 1);

        // art-deco setbacks: stack two narrower slices on the shoulders
        if (rng() < 0.20 && w > 48) {
          const s1w = Math.round(w * 0.74), s1h = rndInt(rng, 5, 11);
          const s2w = Math.round(w * 0.46), s2h = rndInt(rng, 4, 9);
          const s1x = bx + Math.round((w - s1w) / 2), s2x = bx + Math.round((w - s2w) / 2);
          rect(s1x - 1, top - s1h - 1, s1w + 2, s1h + 1, OUT, 1);
          rect(s1x, top - s1h, s1w, s1h, body, 1);
          rect(s2x - 1, top - s1h - s2h - 1, s2w + 2, s2h + 1, OUT, 1);
          rect(s2x, top - s1h - s2h, s2w, s2h, mixRgb(body, [255, 255, 255], 0.07), 1);
          rect(bx, top, 1, h, mixRgb(body, [255, 255, 255], 0.10), 1);
          rect(bx + w - 1, top, 1, h, mixRgb(body, [0, 0, 0], 0.35), 1);
          // crown light on the tip
          rect(s2x + Math.round(s2w / 2) - 1, top - s1h - s2h - 4, 2, 4, OUT, 1);
          meta.beacons.push({ x: s2x + Math.round(s2w / 2), y: top - s1h - s2h - 5, phase: rng() });
        }
        // left highlight / right shade for a little volume
        rect(bx, top, 1, h, mixRgb(body, [255, 255, 255], 0.10), 1);
        rect(bx + w - 1, top, 1, h, mixRgb(body, [0, 0, 0], 0.35), 1);

        // setbacks / rooftop clutter
        const roofRoll = (h < 44) ? 0.6 : rng();
        if (roofRoll > 0.72) {                                  // little penthouse
          const pw = Math.max(8, Math.round(w * 0.42)), ph = rndInt(rng, 6, 13);
          const px2 = bx + Math.floor((w - pw) / 2);
          rect(px2 - 1, top - ph - 1, pw + 2, ph + 1, OUT, 1);
          rect(px2, top - ph, pw, ph, mixRgb(body, [255, 255, 255], 0.06), 1);
          for (let i = 0; i < 3; i++) {
            if (rng() < 0.45) {
              const wx = px2 + 1 + i * Math.max(2, Math.floor(pw / 3.4));
              rect(wx, top - ph + 3, 2, 3, rng() < 0.5 ? pick(rng, litCols) : dimCol, 1);
            }
          }
        } else if (roofRoll > 0.55) {                           // water tower
          const tw = rndInt(rng, 7, 11), th = rndInt(rng, 7, 10);
          const tx = bx + Math.floor(w / 2 - tw / 2);
          rect(tx - 1, top - th - 4, tw + 2, th + 2, OUT, 1);
          rect(tx, top - th - 3, tw, th, mixRgb(body, [0, 0, 0], 0.18), 1);
          rect(tx + 1, top - 2, 1, 2, OUT, 1); rect(tx + tw - 2, top - 2, 1, 2, OUT, 1);
        } else if (roofRoll > 0.42) {                           // AC boxes
          const n = rndInt(rng, 1, 2);
          for (let i = 0; i < n; i++) {
            const aw = rndInt(rng, 6, 12), ax = bx + rndInt(rng, 2, Math.max(2, w - aw - 2));
            rect(ax - 1, top - 5, aw + 2, 5, OUT, 1);
            rect(ax, top - 4, aw, 4, mixRgb(body, [255, 255, 255], 0.14), 1);
          }
        }
        // antenna + blinking beacon
        if (h > (opt.maxH || 108) * 0.62 && rng() < 0.75) {
          const ax = bx + Math.floor(w * (0.25 + rng() * 0.5));
          const ah = rndInt(rng, 8, 26);
          rect(ax, top - ah, 1, ah, OUT, 1);
          meta.beacons.push({ x: ax, y: top - ah - 1, phase: rng() });
        }

        // windows
        const winW = 4, winH = 5, gapX = 3, gapY = 3;
        const margin = 4;
        const cols = Math.max(1, Math.floor((w - margin * 2 + gapX) / (winW + gapX)));
        const rows = Math.max(1, Math.floor((h - margin * 2 - 24 + gapY) / (winH + gapY)));
        const offX = bx + Math.floor((w - (cols * (winW + gapX) - gapX)) / 2);
        const litChance = opt.litChance == null ? 0.34 : opt.litChance;
        const officeFloors = rng() < 0.18 ? rndInt(rng, 1, 2) : 0;
        const officeRow = officeFloors ? rndInt(rng, 0, Math.max(0, rows - officeFloors)) : -99;
        for (let ry = 0; ry < rows; ry++) {
          for (let rx = 0; rx < cols; rx++) {
            const wx = offX + rx * (winW + gapX);
            const wy = top + margin + 2 + ry * (winH + gapY);
            const isOffice = ry >= officeRow && ry < officeRow + officeFloors;
            const lit = isOffice || rng() < litChance;
            if (lit) {
              let col = pick(rng, litCols);
              if (rng() < 0.22) col = mixRgb(col, body, 0.35);      // a dimmer bulb upstairs
              rect(wx, wy, winW, winH, col, 1);
              if (rng() < 0.4) rect(wx, wy + winH - 1, winW, 1, mixRgb(col, [0, 0, 0], 0.35), 1);
              if (rng() < 0.25) rect(wx, wy, 1, winH, mixRgb(col, [0, 0, 0], 0.25), 1);   // blind pulled half down
            } else {
              rect(wx, wy, winW, winH, dimCol, 1);
              if (rng() < 0.05) { // this one is going to flick on and off forever
                meta.anim.push({ x: wx, y: wy, w: winW, h: winH, col: pick(rng, litCols), phase: rng(), speed: 0.05 + rng() * 0.12 });
              }
            }
          }
        }

        // ground floor: door + shop window with a warm spill
        const doorW = 7, doorH = 12;
        const doorX = bx + Math.floor(w / 2 - doorW / 2);
        rect(doorX, baseY - doorH, doorW, doorH, OUT, 1);
        rect(doorX + 1, baseY - doorH + 2, doorW - 2, doorH - 2, mixRgb(pick(rng, litCols), [0, 0, 0], 0.45), 1);
        if (w > 46) {
          const sw = Math.min(20, w - doorW - 12);
          const sx = rng() < 0.5 ? bx + 4 : bx + w - sw - 4;
          const sy = baseY - 15;
          rect(sx - 1, sy - 1, sw + 2, 16, OUT, 1);
          rect(sx, sy, sw, 14, mixRgb(pick(rng, litCols), [255, 255, 255], 0.10), 1);
          for (let gx = sx + 2; gx < sx + sw - 1; gx += 3) rect(gx, sy, 1, 14, OUT, 1);
          meta.glows.push({ x: sx + sw / 2, y: baseY - 6, r: 15, col: pal.winLit2, a: 0.22 });
          // warm pool the shop window throws onto the pavement
          const poolR = sw * 0.75, poolC = sx + sw / 2;
          for (let py = baseY; py < baseY + 13; py++) {
            const t = (py - baseY) / 13;
            const halfW = poolR * (1.25 - t * 0.7);
            for (let px3 = Math.round(poolC - halfW); px3 <= poolC + halfW; px3++) {
              const edge = 1 - Math.abs(px3 - poolC) / Math.max(1, halfW);
              plot(d, tileW, H, px3, py, hexToRgb(pal.winLit2), (1 - t) * edge * 0.40);
            }
          }
        }

        // neon sign on some buildings
        if (w > 40 && rng() < 0.34) {
          const col = pick(rng, neons);
          const vertical = rng() < 0.5;
          const sx2 = bx + rndInt(rng, 3, Math.max(3, w - 18));
          const sy2 = top + rndInt(rng, 6, Math.max(6, h - 26));
          if (vertical) {
            const sh = rndInt(rng, 14, 26);
            rect(sx2 - 1, sy2 - 1, 6, sh + 2, OUT, 1);
            rect(sx2, sy2, 4, sh, col, 1);
            for (let i = 0; i < 3; i++) rect(sx2, sy2 + 3 + i * Math.floor(sh / 3.2), 4, 2, [0, 0, 0], 1);
            meta.glows.push({ x: sx2 + 2, y: sy2 + sh / 2, r: 27, col, a: 0.30 });
          } else {
            const sw2 = rndInt(rng, 14, 30);
            rect(sx2 - 1, sy2 - 1, sw2 + 2, 9, OUT, 1);
            rect(sx2, sy2, sw2, 7, col, 1);
            for (let i = 0; i < 2; i++) rect(sx2 + 3 + i * Math.floor(sw2 / 2.4), sy2 + 2, 2, 3, [0, 0, 0], 1);
            meta.glows.push({ x: sx2 + sw2 / 2, y: sy2 + 3, r: 28, col, a: 0.28 });
          }
        }

        cursor += w + rndInt(rng, 3, 16);
        if (cursor > tileW - 26) break;
        // street lamp in the gap
        if (rng() < 0.75 && cursor + 6 < tileW - 6) {
          const lx = cursor + 2;
          rect(lx, baseY - 30, 1, 30, OUT, 1);
          rect(lx - 4, baseY - 30, 5, 2, OUT, 1);
          rect(lx - 4, baseY - 29, 4, 1, hexToRgb(pal.lamp), 1);
          const poolC = lx - 2;
          for (let py = baseY; py < baseY + 12; py++) {
            const t = (py - baseY) / 12, halfW = 11 * (1.2 - t * 0.7);
            for (let px3 = Math.round(poolC - halfW); px3 <= poolC + halfW; px3++) {
              const edge = 1 - Math.abs(px3 - poolC) / Math.max(1, halfW);
              plot(d, tileW, H, px3, py, hexToRgb(pal.lamp), (1 - t) * edge * 0.34);
            }
          }
          meta.lamps.push({ x: poolC, y: baseY - 29, r: 30, phase: rng() });
          cursor += 12;
        }
      }

      // bake the glows
      x.putImageData(img, 0, 0);
      const glowCache = {};
      for (const g of meta.glows) {
        const key = g.col + '|' + g.r;
        if (!glowCache[key]) glowCache[key] = makeGlow(g.r * 2, g.col, 1);
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = clamp(g.a, 0, 1);
        x.drawImage(glowCache[key], Math.round(g.x - g.r), Math.round(g.y - g.r));
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
      }
      meta.glows = [];
      return { canvas: c, meta };
    }

    /* =========================================================
       GROUND TIER — sidewalk + asphalt rushing past
       ========================================================= */
    function makeGroundTier(tileW, H, pal, seed, opt) {
      opt = opt || {};
      const rng = mulberry32(seed);
      const c = mk(tileW, H), x = ctxOf(c);
      const topY = opt.topY == null ? Math.round(H * 0.63) : opt.topY;
      const img = x.createImageData(tileW, H), d = img.data;
      const road = hexToRgb(pal.road), line = hexToRgb(pal.roadLine), curb = hexToRgb(pal.curb);

      for (let y = topY; y < H; y++) {
        for (let px = 0; px < tileW; px++) plot(d, tileW, H, px, y, road, 1);
      }
      // curb lip + a paving-joint rhythm so the motion reads clearly
      const walk2 = hexToRgb(pal.sidewalk), walkHi2 = hexToRgb(pal.sidewalkHi);
      for (let px = 0; px < tileW; px++) {
        plot(d, tileW, H, px, topY - 5, curb, 1);
        plot(d, tileW, H, px, topY - 4, walkHi2, 1);
        plot(d, tileW, H, px, topY - 3, walk2, 1);
        plot(d, tileW, H, px, topY - 2, walk2, 1);
        plot(d, tileW, H, px, topY - 1, curb, 1);
        plot(d, tileW, H, px, topY, curb, 1);
        plot(d, tileW, H, px, topY + 1, hexToRgb(pal.road), 1);
        if (px % 24 === 6) {
          plot(d, tileW, H, px, topY - 4, curb, 1);
          plot(d, tileW, H, px, topY - 3, curb, 1);
        }
      }
      // dashed centre line (chunky, retro) + its worn twin further out
      const dashOn = 22, dashOff = 26;
      for (let px = 8; px < tileW; px += dashOn + dashOff) {
        for (let i = 0; i < dashOn && px + i < tileW; i++) {
          for (let y = topY + 22; y < topY + 26; y++) plot(d, tileW, H, px + i, y, line, 1);
          for (let y = topY + 54; y < topY + 57; y++) plot(d, tileW, H, px + i + dashOff, y, line, 0.5);
        }
      }
      // wet-asphalt reflections: long vertical smears of far city light
      const smearCols = [hexToRgb(pal.winLit), hexToRgb(pal.neonA), hexToRgb(pal.neonB), hexToRgb(pal.haze)];
      for (let i = 0; i < Math.round(tileW / 90); i++) {
        const sx0 = rndInt(rng, 6, tileW - 12), sw0 = rndInt(rng, 3, 9);
        const col = pick(rng, smearCols);
        const len = rndInt(rng, 14, 40), top = topY + rndInt(rng, 4, 20);
        for (let yy = top; yy < Math.min(H, top + len); yy++) {
          const t = (yy - top) / len;
          for (let xx = sx0; xx < sx0 + sw0; xx++) {
            const edge = 1 - Math.abs((xx - sx0) / sw0 - 0.5) * 2;
            plot(d, tileW, H, xx, yy, col, (1 - t) * edge * 0.20);
          }
        }
      }

      // road grime
      for (let i = 0; i < Math.round(tileW * 0.9); i++) {
        const px = rndInt(rng, 0, tileW - 1), py = rndInt(rng, topY + 3, H - 1);
        plot(d, tileW, H, px, py, mixRgb(road, [255, 255, 255], 0.5), 0.16 + rng() * 0.2);
      }
      // manholes / drains
      const n = rndInt(rng, 1, 3);
      for (let i = 0; i < n; i++) {
        const px = rndInt(rng, 4, tileW - 12), py = rndInt(rng, topY + 6, (opt.fadeY || H) - 14);
        const w = 9, h = 4;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++)
          plot(d, tileW, H, px + xx, py + yy, mixRgb(road, [255, 255, 255], 0.22), 1);
      }
      // dithered falloff into the dark where the UI lives
      const fadeY = opt.fadeY == null ? topY + 46 : opt.fadeY;
      if (fadeY < H) {
        for (let y = fadeY; y < H; y++) {
          const t = clamp((y - fadeY) / Math.max(1, (H - fadeY) * 0.8), 0, 1);
          const dark = Math.pow(t, 0.85);
          if (dark <= 0.01) continue;
          for (let px = 0; px < tileW; px++) {
            const th = (BAYER[y & 3][px & 3] + 0.5) / 16;
            if (th < dark) {
              const o = (y * tileW + px) * 4;
              d[o] = 4; d[o + 1] = 5; d[o + 2] = 12; d[o + 3] = 255;
            }
          }
        }
      }
      x.putImageData(img, 0, 0);
      return { canvas: c, meta: { beacons: [], anim: [], lamps: [] } };
    }

    /* =========================================================
       SOUL / HEART cursor  (15 x 12 pixel heart)
       ========================================================= */
    const HEART_ROWS = [
      '...XXX...XXX...',
      '..XXXXXXXXXXX..',
      '.XXXXXXXXXXXXX.',
      '.XXXXXXXXXXXXX.',
      '.XXXXXXXXXXXXX.',
      '.XXXXXXXXXXXXX.',
      '..XXXXXXXXXXX..',
      '...XXXXXXXXX...',
      '....XXXXXXX....',
      '.....XXXXX.....',
      '......XXX......',
      '.......X.......'
    ];
    function makeHeart(scale, color, shade, shine) {
      scale = Math.max(1, Math.round(scale || 1));
      const W = 15, H = HEART_ROWS.length;
      const c = mk(W * scale, H * scale), x = ctxOf(c);
      const fill = color || '#ff2b2b', dark = shade || '#c01717', hi = shine || '#ff9b9b';
      const on = (rx, ry) => ry >= 0 && ry < H && rx >= 0 && rx < W && HEART_ROWS[ry][rx] === 'X';
      for (let ry = 0; ry < H; ry++) {
        for (let rx = 0; rx < W; rx++) {
          if (!on(rx, ry)) continue;
          // shade only the bottom + right rim so the soul keeps its clean silhouette
          const rim = !on(rx + 1, ry) || !on(rx, ry + 1) || ry >= H - 2;
          const shine = (ry === 2 || ry === 3) && rx >= 3 && rx <= 4;
          x.fillStyle = shine ? hi : (rim ? dark : fill);
          x.fillRect(rx * scale, ry * scale, scale, scale);
        }
      }
      return c;
    }

    return {
      PAL, BAYER, mulberry32, hexToRgb, mixRgb, clamp, lerp,
      makeGlow, makeSky, makeBackTier, makeMainTier, makeGroundTier, makeHeart
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createArt, PAL, mulberry32, hexToRgb };
  else global.createArt = createArt;
})(typeof window !== 'undefined' ? window : globalThis);
