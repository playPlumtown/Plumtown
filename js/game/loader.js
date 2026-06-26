/* ============================================================
   Plumtown — loading / splash screen controller
   Animates the progress bar, enables the "Enter Plumtown" button
   once the page is ready, and on click: starts the music (this is
   the user gesture browsers require for audio) and fades the
   splash away to reveal the already-booted game. Also wires the
   in-game 🎵 music toggle.
   ============================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const loader = $('#plumLoader');
  const fill = $('#plBarFill');
  const enter = $('#plEnter');
  const mbtn = $('#musicBtn');
  if (!loader) return;

  let pct = 0, loaded = false;
  if (document.readyState === 'complete') loaded = true;
  else window.addEventListener('load', () => { loaded = true; });

  function tick() {
    pct = Math.min(100, pct + (pct < 70 ? 7 : 2) + Math.random() * 4);
    if (fill) fill.style.width = pct + '%';
    if (pct >= 100 && loaded) return ready();
    setTimeout(tick, 90);
  }
  function ready() {
    if (!enter) return;
    enter.disabled = false;
    enter.textContent = '▶ Enter Plumtown';
    enter.classList.add('ready');
  }
  setTimeout(tick, 200);

  function dismiss() {
    loader.classList.add('gone');
    setTimeout(() => { loader.style.display = 'none'; }, 600);
  }

  function music() { return window.LifeSim && window.LifeSim.Music; }
  function syncBtn() {
    if (!mbtn || !music()) return;
    const on = music().isOn();
    mbtn.textContent = on ? '🎵' : '🔇';
    mbtn.title = on ? 'Music on — click to mute' : 'Music off — click to play';
    mbtn.classList.toggle('on', on);
  }

  if (enter) enter.addEventListener('click', () => {
    if (enter.disabled) return;
    try { if (music()) music().start(); } catch (e) { /* */ }
    syncBtn();
    dismiss();
  });

  if (mbtn) mbtn.addEventListener('click', () => {
    try { if (music()) music().toggle(); } catch (e) { /* */ }
    syncBtn();
  });
  syncBtn();
})();
