/* ============================================================
   Plumtown — generative cozy background music (Web Audio)
   A warm, loungey jazz loop (à la a life-sim build mode), made
   entirely from oscillators so there are NO audio files and no
   copyright. Soft pads + walking bass + a gentle in-key melody,
   through a lowpass + delay for a cosy room feel.
   Exposes LS.Music.{start, stop, toggle, isOn}. Must be started
   from a user gesture (browsers block autoplay) — the loading
   screen's "Enter" button does that.
   ============================================================ */
(function () {
  'use strict';
  const LS = window.LifeSim || (window.LifeSim = {});

  let ctx, master, filter, on = false, timer = null, step = 0;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // All chords are diatonic to C major, so anything from the C-major
  // melody pool sounds consonant over them. (root bass, chord voicing)
  const CHORDS = [
    { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
    { bass: 43, notes: [55, 59, 62, 65] }, // G7
    { bass: 36, notes: [48, 52, 55, 59] }, // Cmaj7
    { bass: 45, notes: [57, 60, 64, 67] }  // Am7
  ];
  const MELODY = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]; // C major, C4–E5
  const BAR = 2.1; // seconds per chord

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2300; filter.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    // simple feedback delay → "room"
    const delay = ctx.createDelay(); delay.delayTime.value = 0.33;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    filter.connect(master);
    filter.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
  }

  function voice(f, t, dur, type, peak) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.3, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(filter);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function bar() {
    if (!on) { timer = null; return; }
    const c = CHORDS[step % CHORDS.length]; step++;
    const t0 = ctx.currentTime + 0.06;
    // soft sustained pad
    c.notes.forEach((n) => voice(freq(n), t0, BAR * 1.02, 'triangle', 0.045));
    // walking-ish bass on beats 1 & 3
    voice(freq(c.bass), t0, BAR * 0.5, 'sine', 0.16);
    voice(freq(c.bass + 7), t0 + BAR * 0.5, BAR * 0.45, 'sine', 0.12);
    // gentle melody — a few in-key plucks, syncopated, with rests for space
    const slot = BAR / 4;
    for (let b = 0; b < 4; b++) {
      if (Math.random() < 0.6) {
        const n = MELODY[Math.floor(Math.random() * MELODY.length)];
        const off = Math.random() < 0.3 ? slot * 0.5 : 0;
        voice(freq(n), t0 + b * slot + off, slot * 0.85, 'sine', 0.06);
      }
    }
    timer = setTimeout(bar, BAR * 1000);
  }

  function start() {
    ensure(); if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    on = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(0.34, now + 1.2);
    if (!timer) bar();
    return true;
  }
  function stop() {
    on = false;
    if (ctx) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    }
  }
  function toggle() { if (on) stop(); else start(); return on; }
  function isOn() { return on; }

  LS.Music = { start, stop, toggle, isOn };

  /* ---- in-game wiring: 🎵 toggle + autostart on first interaction ---- */
  function wire() {
    const mbtn = document.querySelector('#musicBtn');
    function sync() {
      if (!mbtn) return;
      const o = isOn();
      mbtn.textContent = o ? '🎵' : '🔇';
      mbtn.classList.toggle('on', o);
      mbtn.title = o ? 'Music on — click to mute' : 'Music off — click to play';
    }
    if (mbtn) mbtn.addEventListener('click', () => { toggle(); sync(); });
    function autostart(e) {
      document.removeEventListener('pointerdown', autostart);
      document.removeEventListener('keydown', autostart);
      if (e && e.target && e.target.closest && e.target.closest('#musicBtn')) return; // the button handles itself
      start(); sync();
    }
    document.addEventListener('pointerdown', autostart);
    document.addEventListener('keydown', autostart);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
