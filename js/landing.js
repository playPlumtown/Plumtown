/* ============================================================
   LifeSim — Landing Page Interactions
   Scroll reveal, navbar state, parallax hero cards
   ============================================================ */

(function () {
  'use strict';

  // --- Navbar scroll state ---
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (window.scrollY > 24) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Reveal on scroll ---
  const revealTargets = document.querySelectorAll(
    '.feature-card, .step, .tl-item, .faq-item, .token-panel, .section-head, .cta-band, .split > div'
  );
  revealTargets.forEach((el) => el.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('in'));
  }

  // --- Hero card subtle parallax ---
  const heroVisual = document.querySelector('.hero-visual');
  const floatCards = document.querySelectorAll('.float-card');
  if (heroVisual && floatCards.length) {
    heroVisual.addEventListener('mousemove', (e) => {
      const r = heroVisual.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      floatCards.forEach((card, i) => {
        const depth = (i + 1) * 8;
        card.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
      });
    });
    heroVisual.addEventListener('mouseleave', () => {
      floatCards.forEach((card) => (card.style.transform = ''));
    });
  }

  // --- Smooth anchor offset (for fixed navbar) ---
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length > 1) {
        const el = document.querySelector(id);
        if (el) {
          e.preventDefault();
          const top = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });

  // --- Live-feel stat counter ---
  const stats = document.querySelectorAll('.hero-stats strong');
  stats.forEach((node) => {
    const raw = node.textContent.trim();
    const match = raw.match(/^([\d,.]+)(.*)$/);
    if (!match) return;
    const target = parseFloat(match[1].replace(/,/g, ''));
    const suffix = match[2];
    let cur = 0;
    const steps = 60;
    const inc = target / steps;
    const fmt = (n) => {
      if (target >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (target >= 1000) return Math.round(n / 1000) + 'K';
      return Number.isInteger(target) ? Math.round(n) : n.toFixed(1);
    };
    const tick = () => {
      cur += inc;
      if (cur >= target) {
        node.textContent = match[1] + suffix;
      } else {
        node.textContent = fmt(cur) + suffix;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
})();