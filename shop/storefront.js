// Preserve referral attribution when entering a collection or featured product.
(() => {
  const agent = new URLSearchParams(location.search).get('a');
  if (!agent) return;
  document.querySelectorAll('[data-collection-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.href);
    url.searchParams.set('a', agent);
    link.href = url.pathname + url.search + url.hash;
  });
})();

// Rotating collection edit. No timer runs while hidden, off screen or paused.
(() => {
  const hero = document.querySelector('.hero-carousel');
  if (!hero) return;
  const slides = [...hero.querySelectorAll('[data-hero-slide]')];
  const dots = [...hero.querySelectorAll('[data-hero-index]')];
  const play = hero.querySelector('.hero-play');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Keeps rotating on phones: a tap, swipe or dot only holds the slide for a while (HOLD), then rotation resumes.
  // Only the Pause button stops it for good. With Reduce Motion the slides still change, just without animation.
  const EVERY = 6500, EVERY_REDUCED = 9000, HOLD = 12000;
  let current = 0, timer, paused = false, holdUntil = 0, hovered = false, visible = true, pointer;
  function schedule() {
    clearTimeout(timer);
    play.textContent = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', paused ? 'Start automatic slides' : 'Pause automatic slides');
    play.hidden = false;
    if (paused || hovered || !visible || document.hidden) return;
    const wait = Math.max(reduced.matches ? EVERY_REDUCED : EVERY, holdUntil - Date.now());
    timer = setTimeout(() => show(current + 1), wait);
  }
  function hold() { holdUntil = Date.now() + HOLD; }
  function show(index, manual = false) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      dots[i].setAttribute('aria-current', String(active));
    });
    hero.querySelector('.hero-counter').textContent = `0${current + 1} / 0${slides.length}`;
    if (manual) {
      hold();
      hero.querySelector('.hero-announcement').textContent = slides[current].getAttribute('aria-label');
    }
    schedule();
  }
  slides.forEach(slide => { slide.hidden = false; });
  hero.classList.add('hero-ready');
  hero.querySelector('.hero-navigation').hidden = false;
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i, true)));
  hero.querySelector('[data-hero-prev]').addEventListener('click', () => show(current - 1, true));
  hero.querySelector('[data-hero-next]').addEventListener('click', () => show(current + 1, true));
  play.addEventListener('click', () => { paused = !paused; holdUntil = 0; schedule(); });
  // Hover pauses only for a real mouse: phones fire mouseenter on tap and never send mouseleave.
  hero.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
  hero.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovered = false; schedule(); } });
  hero.addEventListener('focusin', event => { if (event.target !== play && event.target.matches(':focus-visible')) { hold(); schedule(); } });
  hero.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    // Keep keyboard focus on persistent controls, never inside an outgoing slide.
    if (!event.target.closest('.hero-navigation')) return;
    event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1), true);
  });
  hero.addEventListener('pointerdown', event => {
    pointer = event.pointerType === 'touch' && !event.target.closest('a,button')
      ? { x: event.clientX, y: event.clientY } : null;
  });
  hero.addEventListener('pointerup', event => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = null;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) show(current + (dx < 0 ? 1 : -1), true);
  });
  hero.addEventListener('pointercancel', () => { pointer = null; });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, { threshold: .15 }).observe(hero);
  }
  // Start on a random slide each visit so returning customers see something different first.
  show(Math.floor(Math.random() * slides.length));

  // Reveal only below-the-fold editorial sections; catalogue items remain immediate.
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        entry.target.classList.remove('reveal-pending');
        observer.unobserve(entry.target);
      }
    }), { threshold: .08 });
    document.querySelectorAll('.collection-intro,.collection-links,.ordering').forEach(section => {
      if (section.getBoundingClientRect().top > window.innerHeight) {
        section.classList.add('reveal-ready', 'reveal-pending'); observer.observe(section);
      }
    });
  }
})();
