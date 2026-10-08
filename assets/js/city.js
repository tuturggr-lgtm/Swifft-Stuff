/* ============================================================
   Swifft Stuff — city.js
   The scrolling parallax city. Shared by the browser game and the
   headless preview renderer so both build the exact same scene.

   Depth model (parallax = world pixels travelled per camera pixel):
     sky     0.00   <- THE SKY DOES NOT MOVE. on purpose.
     far     0.08   distant skyline
     mid     0.55   the buildings you drift past
     street  1.00   asphalt + lane markings

   The art is baked on a fixed 640 x 480 composition ("COMP_H").
   Any viewport is drawn by translating the composition so its bottom
   edge sits on the bottom of the screen, and the sky is generated to
   fill whatever space that leaves above. So the city never crops and
   the sky never scrolls.
   ============================================================ */
(function (global) {
  'use strict';

  const COMP_W = 640, COMP_H = 480;

  function createCity(createCanvas, art, initial) {
    const cfg = Object.assign({
      speed: 30,                 // world px/sec at parallax 1.0
      speedMul: 1,
      scroll: { far: 0.08, mid: 0.55, street: 1.0 },
      seed: 20261008,
      stars: null,
      moon: true, moonR: null, moonX: 0.76, moonY: 0.26,
      litChance: 0.34, tallChance: 0.16, lowChance: 0.18,
      layout: { skyH: 262, baseY: 312, walkH: 16, streetTop: 328, fadeY: 356 },
      palette: null,
      deferBuild: false           // true => wait for the first resize() (used to paint the page first)
    }, initial || {});

    let VW = COMP_W, VH = COMP_H, time = 0;
    let pal = Object.assign({}, art.PAL, cfg.palette || {});
    let sky = null;
    let camera = 0, speedMul = 1, targetSpeedMul = 1, burstT = 0, burstSpeed = null;
    const glowCache = {};

    const layers = [
      { name: 'far',    tiles: [], scroll: cfg.scroll.far,    beacons: [], anim: [], lamps: [] },
      { name: 'mid',    tiles: [], scroll: cfg.scroll.mid,    beacons: [], anim: [], lamps: [] },
      { name: 'street', tiles: [], scroll: cfg.scroll.street, beacons: [], anim: [], lamps: [] }
    ];

    function haloSprite(radius, col) {
      const key = radius + '|' + col;
      if (!glowCache[key]) glowCache[key] = art.makeGlow(radius * 2, col, 1);
      return glowCache[key];
    }

    // Where the baked 640x480 composition lands on screen. The skyline is
    // pushed down so the horizon sits around 65% of the window height: the
    // menu floats over the still sky, the city scrolls along the bottom.
    function computeYOff() {
      return Math.max(VH - COMP_H, Math.round(VH * 0.65) - cfg.layout.skyH);
    }

    function build() {
      const L = cfg.layout;
      const yOff = computeYOff();
      const horizon = yOff + L.skyH;
      sky = art.makeSky(VW, VH, pal, cfg.seed + 1, {
        stars: cfg.stars, moon: cfg.moon, moonR: cfg.moonR,
        moonX: cfg.moonX, moonY: cfg.moonY, horizonY: horizon
      });

      const seed = cfg.seed;
      layers[0].tiles = [0, 1, 2, 3].map(i => art.makeBackTier(400, COMP_H, pal, seed + 4000 + i * 7, {
        baseline: L.skyH, minW: 18, maxW: 54, minH: 18, maxH: 74
      }));
      layers[1].tiles = [0, 1, 2, 3].map(i => art.makeMainTier(480, COMP_H, pal, seed + 9000 + i * 13, {
        baseY: L.baseY, walkH: L.walkH, minW: 34, maxW: 82, minH: 44, maxH: 112,
        litChance: cfg.litChance, tallChance: cfg.tallChance, lowChance: cfg.lowChance
      }));
      layers[2].tiles = [0, 1, 2].map(i => art.makeGroundTier(480, COMP_H, pal, seed + 2000 + i * 31, {
        topY: L.streetTop, fadeY: L.fadeY
      }));

      for (const L2 of layers) {
        L2.scroll = cfg.scroll[L2.name];
        L2.beacons = []; L2.anim = []; L2.lamps = [];
        L2.tiles.forEach((t) => {
          (t.meta.beacons || []).forEach(b => L2.beacons.push(b));
          (t.meta.anim || []).forEach(a => L2.anim.push(a));
          (t.meta.lamps || []).forEach(l => L2.lamps.push(l));
        });
      }
    }

    function resize(w, h) { VW = Math.max(160, w | 0); VH = Math.max(160, h | 0); build(); }
    function setConfig(patch) {
      const rebuild = ['seed', 'stars', 'moon', 'moonR', 'moonX', 'moonY', 'litChance',
        'tallChance', 'lowChance', 'palette'].some(k => k in patch);
      if ('palette' in patch) pal = Object.assign({}, art.PAL, patch.palette || {});
      if (patch.scroll) Object.assign(cfg.scroll, patch.scroll);
      if (patch.layout) Object.assign(cfg.layout, patch.layout);
      Object.assign(cfg, patch);
      if (rebuild) build();
    }
    function update(dt, live) {
      live = live || {};
      time = live.time == null ? time + dt : live.time;
      if (live.paused) { speedMul = 0; return; }
      targetSpeedMul = live.speedMul == null ? 1 : live.speedMul;
      speedMul += (targetSpeedMul - speedMul) * Math.min(1, dt * 4.0);
      if (burstT > 0) {
        burstT -= dt;
        if (burstT <= 0 && burstSpeed != null) { cfg.speed = burstSpeed; burstSpeed = null; }
      }
      camera += cfg.speed * speedMul * dt;
    }
    // quick "the city rushes" moment: multiply the scroll speed, then put it back
    function burst(mult, seconds) {
      if (burstT <= 0) burstSpeed = cfg.speed;
      cfg.speed = burstSpeed * mult;
      burstT = seconds;
    }

    function drawLayer(ctx, L, t) {
      const tiles = L.tiles;
      if (!tiles.length) return;
      const tileW = tiles[0].canvas.width;
      const off = Math.round(camera * L.scroll);
      const first = Math.floor(off / tileW);
      for (let i = first; i * tileW < off + VW; i++) {
        const tile = tiles[((i % tiles.length) + tiles.length) % tiles.length];
        const dx = i * tileW - off;
        ctx.drawImage(tile.canvas, dx, 0);
        const m = tile.meta;
        if (!m) continue;

        if (m.anim) {                                  // windows turning on / off
          for (let k = 0; k < m.anim.length; k++) {
            const a = m.anim[k];
            if (((t * a.speed + a.phase) % 1) > 0.55) {
              ctx.fillStyle = a.col;
              ctx.fillRect(dx + a.x, a.y, a.w, a.h);
            }
          }
        }
        if (m.beacons) {                               // aircraft-warning blinkers
          for (let k = 0; k < m.beacons.length; k++) {
            const b = m.beacons[k];
            const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + b.phase * 6.283));
            ctx.globalAlpha = pulse;
            ctx.fillStyle = b.dim ? '#8c3143' : '#ff5a5a';
            ctx.fillRect(dx + b.x, b.y, 1, 1);
            if (!b.dim && pulse > 0.7) {
              ctx.fillStyle = 'rgba(255,90,90,0.55)';
              ctx.fillRect(dx + b.x - 1, b.y, 1, 1);
              ctx.fillRect(dx + b.x + 1, b.y, 1, 1);
              ctx.fillRect(dx + b.x, b.y - 1, 1, 1);
            }
            ctx.globalAlpha = 1;
          }
        }
        if (m.lamps && L.name === 'mid') {              // street lamps breathing
          for (let k = 0; k < m.lamps.length; k++) {
            const l = m.lamps[k];
            const f = 0.55 + 0.45 * Math.sin(t * 2.2 + l.phase * 6.283);
            const r = 13 + Math.round(f * 3);
            const sp = haloSprite(r, pal.lamp);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.20 + 0.16 * f;
            ctx.drawImage(sp, Math.round(dx + l.x - r), l.y - r);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
    }

    function draw(ctx, t) {
      if (!sky) return;                       // nothing baked yet
      t = t == null ? time : t;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sky, 0, 0);                       // the sky: never offset. it does not move.
      ctx.save();
      ctx.translate(0, computeYOff());
      drawLayer(ctx, layers[0], t);
      drawLayer(ctx, layers[1], t);
      drawLayer(ctx, layers[2], t);
      ctx.restore();
    }

    if (!cfg.deferBuild) build();

    return {
      COMP_W, COMP_H, cfg, layout: cfg.layout,
      get built() { return !!sky; },
      get camera() { return camera; }, set camera(v) { camera = v; },
      get width() { return VW; }, get height() { return VH; },
      get size() { return { W: VW, H: VH }; },
      get time() { return time; },
      get layers() { return layers; },
      get sky() { return sky; },
      get yOff() { return computeYOff(); },
      resize, build, setConfig, update, draw, burst,
      setPalette(p) { pal = Object.assign({}, art.PAL, p || {}); build(); },
      info() {
        return { camera: Math.round(camera), speed: cfg.speed, scroll: Object.assign({}, cfg.scroll), seed: cfg.seed, skyScroll: 0 };
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createCity, COMP_W, COMP_H };
  else global.createCity = createCity;
})(typeof window !== 'undefined' ? window : globalThis);
