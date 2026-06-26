/* ============================================================
   LifeSim — FX: WebAudio blips + confetti particles
   Tiny, dependency-free juice. Respects the sound setting.
   Attaches to window.LifeSim.FX.
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;

  let ctx = null;
  let soundOn = true;

  function ac() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function setSound(on) { soundOn = !!on; }
  function isOn() { return soundOn; }

  // A short shaped tone.
  function tone(freq, dur, type, gain, when) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    click:   () => tone(420, 0.08, 'triangle', 0.06),
    place:   () => { tone(300, 0.08, 'square', 0.05); tone(460, 0.1, 'square', 0.05, 0.04); },
    select:  () => tone(560, 0.07, 'sine', 0.06),
    error:   () => { tone(180, 0.16, 'sawtooth', 0.06); },
    coin:    () => { tone(880, 0.08, 'square', 0.06); tone(1180, 0.12, 'square', 0.06, 0.07); },
    reward:  () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, i * 0.08)); },
    levelup: () => { [392, 523, 659, 880].forEach((f, i) => tone(f, 0.18, 'sine', 0.07, i * 0.07)); },
    social:  () => { tone(640, 0.09, 'sine', 0.05); tone(820, 0.09, 'sine', 0.05, 0.06); },
    sleep:   () => { tone(330, 0.3, 'sine', 0.05); tone(247, 0.4, 'sine', 0.04, 0.12); }
  };

  function play(name) {
    if (!soundOn) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const c = ac();
    if (c && c.state === 'suspended') c.resume();
    try { fn(); } catch (e) { /* ignore audio errors */ }
  }

  // ---- Confetti ----
  let canvas = null, cctx = null, parts = [], raf = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.getElementById('confetti');
    if (!canvas) return;
    cctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  const COLORS = ['#7c5cff', '#00e0c6', '#ff5c9d', '#ffb454', '#2ee6a6', '#18d4ff'];

  function confetti(x, y, count) {
    ensureCanvas();
    if (!cctx) return;
    x = x == null ? window.innerWidth / 2 : x;
    y = y == null ? window.innerHeight * 0.32 : y;
    const n = count || 90;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 5,
        size: 4 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1
      });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }

  function step() {
    if (!cctx) { raf = null; return; }
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.vy += 0.22;          // gravity
      p.vx *= 0.99;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.012;
      cctx.save();
      cctx.globalAlpha = Math.max(0, p.life);
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.color;
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cctx.restore();
    });
    parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 40);
    if (parts.length) {
      raf = requestAnimationFrame(step);
    } else {
      cctx.clearRect(0, 0, canvas.width, canvas.height);
      raf = null;
    }
  }

  LS.FX = { play, confetti, setSound, isOn };
})();
