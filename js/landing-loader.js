/* ============================================================
   Plumtown — site loading / splash screen
   Shows the branded splash while the landing page loads, fills the
   progress bar, then fades away automatically. No click needed.
   ============================================================ */
(function () {
  'use strict';
  const loader = document.querySelector('#plumLoader');
  const fill = document.querySelector('#plBarFill');
  if (!loader) return;

  let pct = 0, loaded = false, done = false;
  if (document.readyState === 'complete') loaded = true;
  else window.addEventListener('load', () => { loaded = true; });

  function dismiss() {
    if (done) return; done = true;
    loader.classList.add('gone');
    setTimeout(() => { loader.style.display = 'none'; }, 600);
  }

  function tick() {
    pct = Math.min(100, pct + (pct < 70 ? 9 : 3) + Math.random() * 5);
    if (fill) fill.style.width = pct + '%';
    if (pct >= 100 && loaded) return dismiss();
    setTimeout(tick, 80);
  }
  setTimeout(tick, 150);
  setTimeout(dismiss, 6000); // safety: never trap the user
})();
