/* ============================================================
   Swifft Stuff — audio.js
   * Undertale-flavoured UI blips, synthesised with WebAudio
     (no sample files needed, so the menu always has its voice).
   * "Video Game Lobby (feat. Dashie)" — the lobby theme. The file
     is expected at  assets/audio/Video Game Lobby (feat. Dashie).mp3
     and can also be dropped straight onto the page.
   * Everything is unlock-gated behind the first user gesture, as
     browsers demand.
   ============================================================ */
(function (global) {
  'use strict';

  const TRACK = 'assets/audio/Video Game Lobby (feat. Dashie).mp3';
  const TRACK_ALT = ['assets/audio/video game lobby (feat. dashie).mp3',
    'assets/audio/Video Game Lobby (feat. Dashie).ogg',
    'assets/audio/video-game-lobby.mp3'];

  function createAudio() {
    const A = {
      ctx: null, master: null, sfxGain: null, musicGain: null,
      analyser: null, freq: null,
      el: null, sourceNode: null, wired: false, external: false,
      ready: false, missing: false, playing: false,
      volume: 0.65, muted: false,
      trackName: 'Video Game Lobby (feat. Dashie)',
      state: 'idle',       // idle | loading | playing | paused | missing | external
      onChange: null
    };

    function emit() { if (A.onChange) A.onChange(A.state); }

    function ensureCtx() {
      if (A.ctx) return A.ctx;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 1;
      A.master.connect(A.ctx.destination);
      A.sfxGain = A.ctx.createGain();
      A.sfxGain.gain.value = 0.5;
      A.sfxGain.connect(A.master);
      A.musicGain = A.ctx.createGain();
      A.musicGain.gain.value = 0.0001;
      A.analyser = A.ctx.createAnalyser();
      A.analyser.fftSize = 128;
      A.analyser.smoothingTimeConstant = 0.75;
      A.freq = new Uint8Array(A.analyser.frequencyBinCount);
      A.musicGain.connect(A.analyser);
      A.analyser.connect(A.master);
      return A.ctx;
    }

    /* ---------------- blips ---------------- */
    function tone(freq, dur, type, gain, when, slideTo) {
      const ctx = ensureCtx();
      if (!ctx || A.muted) return;
      const t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain == null ? 0.22 : gain, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(A.sfxGain);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }

    A.sfx = {
      move()    { tone(660, 0.055, 'square', 0.20); tone(990, 0.045, 'square', 0.12, 0.03); },
      confirm() { tone(523, 0.06, 'square', 0.20); tone(784, 0.07, 'square', 0.18, 0.05); tone(1046, 0.10, 'square', 0.16, 0.10); },
      back()    { tone(494, 0.06, 'square', 0.18); tone(370, 0.09, 'square', 0.16, 0.05); },
      deny()    { tone(180, 0.16, 'square', 0.20); tone(140, 0.22, 'square', 0.16, 0.14); },
      type()    { tone(320 + Math.random() * 40, 0.018, 'square', 0.055); },
      heart()   { tone(1200, 0.04, 'triangle', 0.12); tone(1600, 0.05, 'triangle', 0.08, 0.04); },
      open()    { tone(420, 0.05, 'square', 0.16); tone(630, 0.07, 'square', 0.14, 0.05); tone(840, 0.09, 'square', 0.10, 0.10); }
    };

    /* ---------------- music ---------------- */
    // bookkeeping for whichever <audio> element is the current theme
    function wireElement(el) {
      el.loop = true;
      el.preload = 'auto';
      el.addEventListener('error', () => {
        if (A.state === 'external') return;
        A.missing = true; A.playing = false; A.state = 'missing'; emit();
      });
      el.addEventListener('canplaythrough', () => {
        A.ready = true;
        if (!A.missing) { A.state = A.playing ? 'playing' : 'idle'; emit(); }
      });
      el.addEventListener('playing', () => { A.playing = true; emit(); });
      el.addEventListener('play', () => {
        A.playing = true;
        if (!A.missing) A.state = A.external ? 'external' : 'playing';
        emit();
      });
      el.addEventListener('pause', () => {
        A.playing = false;
        if (A.state !== 'missing' && A.state !== 'external') A.state = 'paused';
        emit();
      });
      el.addEventListener('ended', () => { A.playing = false; emit(); });
      return el;
    }

    function connectGraph(el) {                 // route the element through the analyser
      const ctx = A.ctx;
      if (!ctx || A.wired) return;
      try {
        A.sourceNode = ctx.createMediaElementSource(el);
        A.sourceNode.connect(A.musicGain);
        A.wired = true;                       // else it would be heard twice
      } catch (e) { A.wired = false; }
    }

    A.init = function () {
      const ctx = ensureCtx();          // gesture-gated by the caller
      if (ctx && ctx.state === 'suspended') ctx.resume();

      if (!A.el) {
        const el = wireElement(new global.Audio(TRACK));
        el.crossOrigin = 'anonymous';
        A.el = el;
      }
      connectGraph(A.el);
      return A;
    };

    A.playMusic = function (fade) {
      A.init();
      if (!A.el || A.external) {
        if (A.el) { const p = A.el.play(); if (p && p.catch) p.catch(() => {}); }
        return;
      }
      const target = A.muted ? 0.0001 : Math.max(0.0001, A.volume);
      const ctx = A.ctx;
      const p = A.el.play();
      if (p && p.catch) p.catch(() => { /* autoplay blocked / file missing */ });
      if (ctx && A.musicGain) {
        const now = ctx.currentTime;
        A.musicGain.gain.cancelScheduledValues(now);
        A.musicGain.gain.setValueAtTime(Math.max(0.0001, A.musicGain.gain.value), now);
        A.musicGain.gain.exponentialRampToValueAtTime(target, now + (fade == null ? 1.6 : fade));
      }
    };

    A.pauseMusic = function () {
      if (!A.el) return;
      if (A.ctx && A.musicGain) {
        const now = A.ctx.currentTime;
        A.musicGain.gain.cancelScheduledValues(now);
        A.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      }
      setTimeout(() => { if (A.el && !A.playing) return; if (A.el) A.el.pause(); }, 380);
    };

    A.toggleMusic = function () { if (A.playing) A.pauseMusic(); else A.playMusic(0.5); };

    A.setVolume = function (v) {
      A.volume = Math.max(0, Math.min(1, v));
      if (A.ctx && A.musicGain && A.playing) {
        A.musicGain.gain.setTargetAtTime(A.muted ? 0.0001 : Math.max(0.0001, A.volume), A.ctx.currentTime, 0.05);
      }
      if (A.el) A.el.volume = 1;   // gain is handled in the graph
      emit();
    };

    A.setMuted = function (m) {
      A.muted = !!m;
      if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 1, A.ctx.currentTime, 0.02);
      emit();
    };

    /* drop an mp3 anywhere on the page -> it becomes the lobby theme */
    A.loadExternal = function (blobOrFile) {
      A.init();
      if (A.sourceNode) { try { A.sourceNode.disconnect(); } catch (e) {} }
      if (A.el) { try { A.el.pause(); } catch (e) {} }
      A.wired = false; A.missing = false; A.ready = true; A.external = true;
      A.playing = false;
      const el = wireElement(new global.Audio(URL.createObjectURL(blobOrFile)));
      A.el = el;
      A.trackName = String(blobOrFile.name || 'dropped track').replace(/\.[^.]+$/, '');
      connectGraph(el);
      if (!A.wired) el.volume = A.muted ? 0 : A.volume;   // no analyser: fade by hand
      if (A.ctx && A.musicGain) {
        A.musicGain.gain.cancelScheduledValues(A.ctx.currentTime);
        A.musicGain.gain.setValueAtTime(Math.max(0.0001, A.muted ? 0.0001 : A.volume), A.ctx.currentTime);
      }
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      A.state = 'external';
      emit();
      return true;
    };

    /* normalised 0..1 bars for the little equaliser */
    A.levels = function (n) {
      const out = new Array(n).fill(0);
      if (A.analyser && A.freq && !A.missing && A.playing) {
        A.analyser.getByteFrequencyData(A.freq);
        for (let i = 0; i < n; i++) {
          const k = Math.floor(Math.pow(i / n, 1.25) * (A.freq.length * 0.7));
          let sum = 0, c = 0;
          for (let j = k; j < Math.min(A.freq.length, k + 3); j++) { sum += A.freq[j]; c++; }
          out[i] = Math.min(1, (sum / Math.max(1, c)) / 190);
        }
      } else {
        // no analyser (or music missing): a gentle synthetic shimmer so the UI still breathes
        const t = performance.now() / 1000;
        for (let i = 0; i < n; i++) out[i] = 0.10 + 0.09 * (0.5 + 0.5 * Math.sin(t * 2 + i * 0.8));
      }
      return out;
    };

    A.TRACK = TRACK;
    A.TRACK_ALT = TRACK_ALT;
    return A;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createAudio, TRACK };
  else global.createAudio = createAudio;
})(typeof window !== 'undefined' ? window : globalThis);
