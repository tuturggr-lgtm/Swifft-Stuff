/* ============================================================
   Swifft Stuff — menu.js
   The main menu: soul cursor, Undertale dialogue panels, a working
   options screen, credits, synth UI blips and the lobby soundtrack
   (which can also be dragged straight onto the page).

   Keys
     up / down        move the soul
     Z / enter / space  confirm
     left / right     adjust the highlighted option
     X / esc          back
     1..5             jump straight to a menu entry
     M                music on/off        P  pause the city
     H                hide the UI         F  fullscreen
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const screenEl = $('#screen');
  const canvas = $('#city');
  const ui = $('#ui');
  const list = $('#list');
  const panel = $('#panel');
  const textEl = $('#text');
  const optionsEl = $('#options');
  const creditsEl = $('#credits');
  const toastEl = $('#toast');
  const gate = $('#gate');
  const musicEl = $('#music');
  const musicTitle = $('#song');            // nb: not .title span -- that grabs the equaliser
  const musicState = $('#music .state');
  const eqEls = [].slice.call(document.querySelectorAll('#music .eq i'));

  const audio = createAudio();
  const art = createArt((w, h) => document.createElement('canvas'));
  const city = createCity((w, h) => document.createElement('canvas'), art, {
    speed: 30,
    litChance: 0.34,
    tallChance: 0.16,
    seed: 20261008,
    deferBuild: true              // bake after the first paint, not before it
  });

  /* ------------------------------------------------------------
     canvas sizing — integer pixel scale, composition anchored to
     the bottom of the screen so the city never gets cropped.
     ------------------------------------------------------------ */
  let K = 2, VW = 640, VH = 480;

  function fit() {
    const W = Math.max(320, window.innerWidth | 0);
    const H = Math.max(240, window.innerHeight | 0);
    K = Math.max(1, Math.min(4, Math.round(H / 400)));   // integer => crisp pixels
    canvas.width = W;
    canvas.height = H;
    VW = Math.ceil(W / K);
    VH = Math.ceil(H / K);
    city.resize(VW, VH);                   // (the baked scene anchors its own bottom edge)
    if (!screenEl.classList.contains('ready')) {
      screenEl.classList.add('ready');     // fade the freshly baked city in
    }
    // integer UI unit => the pixel font stays sharp. 6 on a 720p window.
    const u = Math.max(4, Math.min(10, Math.round(Math.min(W / 2.0, H) / 128)));
    document.documentElement.style.setProperty('--u', (u % 2 ? u + 1 : u) + 'px');
  }

  /* ------------------------------------------------------------
     the soul cursor sprite
     ------------------------------------------------------------ */
  const heartURL = () => art.makeHeart(2, '#ff2b2b', '#c01717', '#ff9b9b').toDataURL('image/png');
  document.documentElement.style.setProperty('--heart-img', 'url(' + heartURL() + ')');

  /* ------------------------------------------------------------
     menu contents
     ------------------------------------------------------------ */
  const MENU = [
    {
      id: 'start', label: 'START', hint: 'begin the ride',
      desc: '* Take the long way home.\n* The city only ever scrolls forwards — the sky stays put and watches.',
      act() {
        flash();
        dip(520);
        city.burst(2.4, 1.4);
        toast('THE RIDE ISN\u2019T FINISHED YET', 'the menu, the city and the music all work.\nwhen the game is ready, this is where it will start.\n(drag an mp3 anywhere to change the song)');
        audio.sfx.confirm();
      }
    },
    {
      id: 'continue', label: 'CONTINUE', hint: 'load a save',
      desc: '* Load a SAVE file.\n* There isn\u2019t one yet. The city remembers nothing between visits.',
      act() {
        audio.sfx.deny();
        say('* No SAVE file found.\n* (The city kept its memories to itself.)');
        shake();
      }
    },
    {
      id: 'options', label: 'OPTIONS', hint: 'tune the ride',
      desc: '* Volume, city speed, and the little screen effects.',
      act() { openOptions(); }
    },
    {
      id: 'credits', label: 'CREDITS', hint: 'who made this',
      desc: '* Everyone who helped build a city that never stops.',
      act() { openCredits(); }
    },
    {
      id: 'quit', label: 'QUIT', hint: 'leave',
      desc: '* Leave the city.\n* You\u2019ll be back. Everyone comes back to the lobby.',
      act() {
        audio.sfx.deny();
        shake();
        say('* You can\u2019t quit now.\n* Your soul is still holding the door open.');
      }
    }
  ];

  let index = 0;
  let mode = 'menu';        // menu | options | credits | locked
  let started = false;
  let paused = false;

  /* build the list */
  const itemEls = MENU.map((entry, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.setAttribute('role', 'option');
    li.dataset.i = i;
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = String(i + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = entry.label;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = '— ' + entry.hint;
    li.append(no, label, hint);
    li.addEventListener('mouseenter', () => { if (mode === 'menu') select(i, true); });
    li.addEventListener('click', () => { if (mode === 'menu') { select(i, true); confirm(); } });
    list.appendChild(li);
    return li;
  });

  /* ------------------------------------------------------------
     text: Undertale-style typewriter
     ------------------------------------------------------------ */
  let typeTimer = null, typedFull = '', typedAt = 0;

  function say(str) {
    clearTimeout(typeTimer);
    typedFull = str;
    typedAt = 0;
    textEl.textContent = '';
    panel.classList.remove('no-caret');
    const step = () => {
      if (typedAt >= typedFull.length) { clearTimeout(typeTimer); return; }
      const chunk = typedFull.slice(typedAt, typedAt + 1);
      textEl.textContent += chunk;
      typedAt++;
      if (chunk !== ' ' && chunk !== '\n' && typedAt % 3 === 0) audio.sfx.type();
      const delay = chunk === '\n' ? 90 : (chunk === '.' || chunk === ',') ? 110 : 15;
      typeTimer = setTimeout(step, delay);
    };
    step();
  }

  function select(i, force) {
    const n = MENU.length;
    index = ((i % n) + n) % n;
    itemEls.forEach((el, k) => {
      el.classList.toggle('selected', k === index);
      el.setAttribute('aria-selected', k === index ? 'true' : 'false');
    });
    if (started) {
      if (force) audio.sfx.move();
      if (mode === 'menu') say(MENU[index].desc);
    }
  }

  function confirm() {
    if (mode === 'menu') { MENU[index].act(); }
  }

  /* ------------------------------------------------------------
     little presentation helpers
     ------------------------------------------------------------ */
  function toast(title, body, ms) {
    toastEl.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = title;
    toastEl.appendChild(t);
    if (body) {
      const b = document.createElement('div');
      b.className = 'dim';
      b.textContent = body;
      toastEl.appendChild(b);
    }
    toastEl.classList.add('shown');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('shown'), ms || 2600);
  }
  function flash() {
    const f = $('#flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
  function dip(ms) {
    const f = $('#fade');
    f.classList.add('go');
    setTimeout(() => f.classList.remove('go'), ms || 480);
  }
  function shake() {
    screenEl.classList.remove('shake');
    void screenEl.offsetWidth;
    screenEl.classList.add('shake');
  }

  /* ------------------------------------------------------------
     OPTIONS
     ------------------------------------------------------------ */
  const segCount = 20;
  function segRow(parent, label, value) {
    const row = document.createElement('div');
    row.className = 'opt';
    const n = document.createElement('span'); n.className = 'name'; n.textContent = label;
    const seg = document.createElement('div'); seg.className = 'seg';
    for (let i = 0; i < segCount; i++) seg.appendChild(document.createElement('i'));
    const val = document.createElement('span'); val.className = 'val'; val.textContent = value;
    row.append(n, seg, val);
    parent.appendChild(row);
    return { row, seg, val, set(v) {
      for (let i = 0; i < segCount; i++) seg.children[i].classList.toggle('on', (i + 1) / segCount <= v + 0.001);
      val.textContent = Math.round(v * 100) + '%';
    } };
  }
  function toggleRow(parent, label) {
    const row = document.createElement('div');
    row.className = 'opt toggle';
    const n = document.createElement('span'); n.className = 'name'; n.textContent = label;
    const val = document.createElement('span'); val.className = 'val';
    const spacer = document.createElement('span'); spacer.style.flex = '1';
    row.append(n, spacer, val);
    parent.appendChild(row);
    return { row, val, set(v) { val.textContent = v ? 'ON' : 'OFF'; } };
  }

  const OPT = [];
  const optList = $('#options .opt-list');
  let opts = {
    volume: 0.65, speed: 1, scanlines: true, vignette: true, bloom: true
  };

  const volRow = segRow(optList, 'MUSIC VOLUME', '');
  volRow.set(opts.volume);
  OPT.push({ kind: 'slider', name: 'vol', row: volRow.row, view: volRow,
    desc: '* Music volume.\n* \u201cVideo Game Lobby (feat. Dashie)\u201d lives in assets/audio/.',
    get: () => opts.volume, set: (v) => { opts.volume = Math.min(1, Math.max(0, v)); volRow.set(opts.volume); audio.setVolume(opts.volume); } });

  const spdRow = segRow(optList, 'CITY SPEED', '');
  const speedFromLevel = (l) => l <= 0 ? 0 : l / 6;
  const levelFromSpeed = (s) => s <= 0 ? 0 : Math.round(s * 6);
  OPT.push({ kind: 'slider', name: 'speed', row: spdRow.row, view: spdRow,
    desc: '* How fast the city slides past.\n* At zero the buildings hold still and wait for you.',
    get: () => levelFromSpeed(opts.speed) / 12,
    set: (v) => {
      const lvl = Math.round(v * 12);
      opts.speed = speedFromLevel(lvl);
      city.cfg.speed = 30 * opts.speed;
      for (let i = 0; i < segCount; i++) spdRow.seg.children[i].classList.toggle('on', (i + 1) / segCount <= v + 0.001);
      spdRow.val.textContent = opts.speed === 0 ? 'PAUSED' : '\u00d7' + opts.speed.toFixed(1);
    } });

  const spdPaint = OPT[OPT.length - 1].set;      // paints segments + the x1.0 label
  const skyRow = toggleRow(optList, 'SKY');
  skyRow.set(true);
  skyRow.row.classList.add('locked');
  OPT.push({ kind: 'locked', name: 'sky', row: skyRow.row, view: skyRow,
    desc: '* STATIC. Always static.\n* The city moves. The sky don\u2019t move. That\u2019s the rule.',
    get: () => 1, set: () => 1 });

  const scanRow = toggleRow(optList, 'CRT SCANLINES');
  scanRow.set(true);
  OPT.push({ kind: 'toggle', name: 'scan', row: scanRow.row, view: scanRow,
    desc: '* A cheap scanline overlay. Purely for the vibe.',
    get: () => opts.scanlines ? 1 : 0,
    set: (v) => { opts.scanlines = !!Math.round(v); scanRow.set(opts.scanlines); screenEl.classList.toggle('scanlines', opts.scanlines); } });

  const vigRow = toggleRow(optList, 'VIGNETTE');
  vigRow.set(true);
  OPT.push({ kind: 'toggle', name: 'vig', row: vigRow.row, view: vigRow,
    desc: '* Darkened corners, like a CRT that has seen things.',
    get: () => opts.vignette ? 1 : 0,
    set: (v) => { opts.vignette = !!Math.round(v); vigRow.set(opts.vignette); screenEl.classList.toggle('vignette', opts.vignette); } });

  const bloomRow = toggleRow(optList, 'COLOUR BOOST');
  bloomRow.set(true);
  OPT.push({ kind: 'toggle', name: 'bloom', row: bloomRow.row, view: bloomRow,
    desc: '* A small saturation lift on the city canvas.\n* Off is the raw pixels.',
    get: () => opts.bloom ? 1 : 0,
    set: (v) => { opts.bloom = !!Math.round(v); bloomRow.set(opts.bloom); screenEl.classList.toggle('bloom', opts.bloom); } });

  const backRow = document.createElement('div');
  backRow.className = 'opt';
  backRow.innerHTML = '<span class="name">BACK</span><span style="flex:1"></span><span class="val">ESC</span>';
  optList.appendChild(backRow);
  OPT.push({ kind: 'back', name: 'back', row: backRow,
    desc: '* Back to the menu.',
    get: () => 1, set: () => 1 });

  spdPaint(levelFromSpeed(opts.speed) / 12);     // initial label/segments

  let optIndex = 0;
  function paintOptions() {
    OPT.forEach((o, i) => o.row.classList.toggle('sel', i === optIndex));
    say(OPT[optIndex].desc);
  }
  function openOptions() {
    mode = 'options';
    optionsEl.classList.add('shown');
    audio.sfx.open();
    optIndex = 0;
    paintOptions();
  }
  function closeOptions() {
    mode = 'menu';
    optionsEl.classList.remove('shown');
    audio.sfx.back();
    say(MENU[index].desc);
  }
  function adjust(dir) {
    const o = OPT[optIndex];
    if (o.kind === 'slider') {
      const v = Math.max(0, Math.min(1, o.get() + dir * 0.05));
      o.set(v);
      audio.sfx.move();
    } else if (o.kind === 'toggle') {
      o.set(o.get() ? 0 : 1);
      audio.sfx.move();
    } else if (o.kind === 'locked') {
      audio.sfx.deny();
    }
  }

  /* ------------------------------------------------------------
     CREDITS
     ------------------------------------------------------------ */
  function openCredits() {
    mode = 'credits';
    creditsEl.classList.add('shown');
    audio.sfx.open();
    say('* Scroll down, the people who built the neon.');
  }
  function closeCredits() {
    mode = 'menu';
    creditsEl.classList.remove('shown');
    audio.sfx.back();
    say(MENU[index].desc);
  }

  /* ------------------------------------------------------------
     input
     ------------------------------------------------------------ */
  function anyKey(e) {
    if (!started) {
      begin();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function move(dir) {
    if (mode === 'options') {
      optIndex = (optIndex + dir + OPT.length) % OPT.length;
      audio.sfx.move();
      paintOptions();
      return;
    }
    if (mode !== 'menu') return;
    select(index + dir, true);
  }

  window.addEventListener('keydown', (e) => {
    if (anyKey(e)) return;
    const k = e.key;
    const low = String(k).toLowerCase();          // 'ArrowDown' -> 'arrowdown', ' ' -> ' '

    if (low === 'h') { ui.classList.toggle('hidden'); audio.sfx.heart(); return; }
    if (low === 'm') { audio.toggleMusic(); audio.sfx.heart(); return; }
    if (low === 'f') {
      // wrapped: a sandboxed iframe (e.g. a live preview) may refuse this
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          const p = el.requestFullscreen();
          if (p && p.catch) p.catch(() => toast('FULLSCREEN BLOCKED', 'the browser said no', 1600));
        } else if (document.exitFullscreen) {
          const p = document.exitFullscreen();
          if (p && p.catch) p.catch(() => {});
        }
      } catch (e) { toast('FULLSCREEN BLOCKED', 'the browser said no', 1600); }
      return;
    }
    if (low === 'p') {
      paused = !paused;
      toast(paused ? 'THE CITY HOLDS ITS BREATH' : 'THE CITY ROLLS ON', paused ? '' : '', 1400);
      audio.sfx.heart();
      return;
    }
    if (k >= '1' && k <= '5' && mode === 'menu') { select(parseInt(k, 10) - 1, true); return; }

    if (low === 'escape' || low === 'x' || low === 'backspace') {
      if (mode === 'options') closeOptions();
      else if (mode === 'credits') closeCredits();
      else audio.sfx.back();
      return;
    }
    if (low === 'arrowup' || low === 'w') { move(-1); e.preventDefault(); return; }
    if (low === 'arrowdown' || low === 's') { move(1); e.preventDefault(); return; }
    if (low === 'arrowleft' || low === 'a') { if (mode === 'options') adjust(-1); else audio.sfx.type(); return; }
    if (low === 'arrowright' || low === 'd') { if (mode === 'options') adjust(1); else audio.sfx.type(); return; }
    if (low === 'z' || low === 'enter' || low === ' ') {
      if (mode === 'options') {
        const o = OPT[optIndex];
        if (o.kind === 'back') closeOptions();
        else if (o.kind === 'toggle') { o.set(o.get() ? 0 : 1); audio.sfx.confirm(); }
        else if (o.kind === 'locked') { audio.sfx.deny(); }
        else audio.sfx.confirm();
      } else if (mode === 'credits') {
        closeCredits();
      } else {
        confirm();
      }
      e.preventDefault();
      return;
    }
    if (low === 'shift' || low === 'control' || low === 'alt' || low === 'meta') return;
  });

  /* click anywhere outside the boxes acts as confirm / dismiss */
  screenEl.addEventListener('click', (e) => {
    if (!started) { begin(); return; }
    if (e.target.closest('#options') || e.target.closest('#credits') || e.target.closest('.hud')) return;
    if (mode === 'credits') closeCredits();
  });

  /* ------------------------------------------------------------
     drag & drop a track onto the page
     ------------------------------------------------------------ */
  const veil = $('#drop-veil');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![].some.call(e.dataTransfer.types || [], t => t === 'Files')) return;
    dragDepth++;
    veil.classList.add('shown');
  });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) veil.classList.remove('shown'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    veil.classList.remove('shown');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (!started) begin();
    if (/audio\//.test(file.type) || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
      audio.loadExternal(file);
      paintMusic();
      toast('NOW PLAYING', file.name.replace(/\.[^.]+$/, ''), 2600);
      audio.sfx.confirm();
    } else {
      toast('THAT\u2019S NOT MUSIC', 'needs an mp3 / wav / ogg', 2200);
      audio.sfx.deny();
    }
  });

  /* ------------------------------------------------------------
     music chip
     ------------------------------------------------------------ */
  function paintMusic() {
    musicTitle.textContent = audio.trackName;
    if (audio.state === 'missing') {
      musicEl.classList.add('missing');
      musicEl.classList.remove('paused');
      musicState.textContent = 'drop the mp3 into assets/audio/';
    } else if (audio.state === 'external') {
      musicEl.classList.remove('missing', 'paused');
      musicState.textContent = 'YOU DROPPED THIS IN';
    } else if (audio.playing) {
      musicEl.classList.remove('missing', 'paused');
      musicState.textContent = 'NOW PLAYING';
    } else {
      musicEl.classList.remove('missing');
      musicEl.classList.add('paused');
      musicState.textContent = started ? 'PAUSED  (M)' : 'WAITING';
    }
  }
  musicEl.addEventListener('click', () => { audio.toggleMusic(); paintMusic(); });
  audio.onChange = paintMusic;

  /* ------------------------------------------------------------
     intro / first gesture
     ------------------------------------------------------------ */
  function begin() {
    if (started) return;
    started = true;
    audio.init();
    audio.playMusic(2.2);
    paintMusic();
    gate.classList.add('gone');
    screenEl.classList.add('go');
    buildTitle();
    setTimeout(() => {
      say('* You are standing in a city that never stops moving.\n* The sky, however, refuses to budge.');
    }, 350);
    setTimeout(() => {
      if (mode === 'menu') say(MENU[index].desc);
    }, 5200);
  }

  function buildTitle() {
    const t = $('#title');
    const txt = t.dataset.text || t.textContent.trim();
    t.dataset.text = txt;
    t.textContent = '';
    [].forEach.call(txt, (ch, i) => {
      const s = document.createElement('span');
      s.className = 'ch' + (ch === ' ' ? ' space' : '');
      s.textContent = ch === ' ' ? '' : ch;
      s.style.animationDelay = (i * 55) + 'ms';
      t.appendChild(s);
      if (ch !== ' ' && audio.state !== 'missing') {
        // tiny percussive tick per letter, only if the audio graph is live
        if (i % 2 === 0) setTimeout(() => audio.sfx.type(), i * 55);
      }
    });
  }

  window.addEventListener('resize', () => { clearTimeout(window.__fitT); window.__fitT = setTimeout(fit, 120); });

  /* ------------------------------------------------------------
     the loop
     ------------------------------------------------------------ */
  let last = performance.now(), eqT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    city.update(dt, { paused: paused || opts.speed === 0 });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    city.draw(ctx, now / 1000);
    // equaliser
    eqT += dt;
    if (eqT > 0.07) {
      eqT = 0;
      const lv = audio.levels(eqEls.length);
      for (let i = 0; i < eqEls.length; i++) eqEls[i].style.height = Math.round(10 + lv[i] * 90) + '%';
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ */
  select(0, false);
  paintMusic();
  // let the page paint the gate first, then bake the city (it takes ~0.2s)
  requestAnimationFrame(() => {
    fit();
    spdPaint(levelFromSpeed(opts.speed) / 12);
    volRow.set(opts.volume);
    audio.setVolume(opts.volume);
    requestAnimationFrame(frame);
  });
  window.SWIFFT = { city, audio, art, MENU, options: opts, say, toast };
})();
