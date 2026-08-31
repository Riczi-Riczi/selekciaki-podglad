/* =============================================
   MODUŁ (roboczy): Diagram — gdzie wylewamy olej
   JEDNA ciągła scena: kropla → diagram (scrub klatek, pin) →
   w TYM SAMYM miejscu wjeżdżają karty → scroll zablokowany
   (Lenis.stop), dopóki wszystkie karty nie zostaną odkryte.
   Dodatkowo: lupka na odkrytej karcie powiększa ją na środek
   ekranu (opcjonalne, nie wymagane do odblokowania scrolla).
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  /* Wąski ekran: radialne karty wokół diagramu zachodziłyby na siebie
     i pin 100vh nie da się pogodzić ze stackowanym layoutem — telefon
     dostaje tę samą prostą, zawsze widoczną wersję co reduced-motion. */
  const isNarrow = window.matchMedia('(max-width: 860px)').matches;
  const motionOn = hasGsap && !reduceMotion && !isNarrow;

  /* lenis/gateActive żyją na poziomie modułu (nie tylko w gałęzi motion),
     żeby lightbox mógł bezpiecznie blokować/odblokowywać scroll w KAŻDYM
     trybie, także tam gdzie Lenis w ogóle nie istnieje */
  let lenis = null;
  let gateActive = false;

  function lockScroll() {
    if (lenis) lenis.stop();
    else document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (gateActive) return; // brama (nieodkryte karty) ma pierwszeństwo
    if (lenis) lenis.start();
    else document.body.style.overflow = '';
  }

  /* ================================
     KARTY — flip zawsze aktywny, niezależnie od trybu
     ================================ */
  const cards = [...document.querySelectorAll('.mdo-card')];
  const TOTAL = cards.length;
  const flipped = new Set();
  const progressEl = document.getElementById('mdo-progress');
  let onAllFlippedCb = null;

  function updateProgress() {
    if (progressEl) progressEl.textContent = `${flipped.size} / ${TOTAL} odkrytych`;
  }

  function flipCard(card) {
    if (card.classList.contains('is-flipped')) return;
    card.classList.add('is-flipped');
    flipped.add(card.dataset.card);
    updateProgress();
    if (flipped.size === TOTAL && onAllFlippedCb) onAllFlippedCb();
  }

  cards.forEach(card => {
    card.addEventListener('click', () => flipCard(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(card); }
    });
  });

  /* ================================
     LUPKA — powiększenie odkrytej karty na środek ekranu.
     Opcjonalne: NIE jest wymagane do odblokowania scrolla —
     wystarczy samo odwrócenie karty (flipCard powyżej).
     ================================ */
  (() => {
    const lightbox = document.getElementById('mdo-lightbox');
    const backdrop = document.getElementById('mdo-lightbox-backdrop');
    const panel = document.getElementById('mdo-lightbox-panel');
    const closeBtn = document.getElementById('mdo-lightbox-close');
    const imgEl = document.getElementById('mdo-lightbox-img');
    if (!lightbox) return;

    let sourceCard = null;
    const canAnimate = hasGsap && !reduceMotion;
    const DUR = canAnimate ? 0.45 : 0;

    function targetRect() {
      const w = Math.min(640, window.innerWidth * 0.9);
      const h = Math.min(window.innerHeight * 0.82, 760);
      return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2, width: w, height: h };
    }

    function openZoom(card) {
      const back = card.querySelector('.mdo-card__face--back img');
      const rect = card.getBoundingClientRect();
      const pastel = getComputedStyle(card).getPropertyValue('--mdo-pastel').trim() || '#eee';
      sourceCard = card;

      imgEl.src = back.src;
      imgEl.alt = back.alt;
      panel.style.background = pastel;
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      lockScroll();

      const start = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: 16 };
      const end = targetRect();
      if (canAnimate) {
        gsap.killTweensOf([panel, backdrop]);
        gsap.set(panel, start);
        gsap.set(backdrop, { opacity: 0 });
        gsap.to(backdrop, { opacity: 1, duration: DUR });
        gsap.to(panel, { ...end, borderRadius: 20, duration: DUR, ease: 'power3.out' });
      } else {
        Object.assign(panel.style, { left: end.left + 'px', top: end.top + 'px', width: end.width + 'px', height: end.height + 'px' });
        backdrop.style.opacity = 1;
      }
      closeBtn.focus();
    }

    function closeZoom() {
      if (!sourceCard) return;
      const rect = sourceCard.getBoundingClientRect();
      const back = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: 16 };
      const finish = () => {
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        panel.removeAttribute('style'); // czysci tez background ustawiony w openZoom
        sourceCard = null;
        unlockScroll();
      };
      if (canAnimate) {
        gsap.killTweensOf([panel, backdrop]);
        gsap.to(backdrop, { opacity: 0, duration: DUR });
        gsap.to(panel, { ...back, duration: DUR, ease: 'power3.in', onComplete: finish });
      } else {
        finish();
      }
    }

    cards.forEach(card => {
      const zoomBtn = card.querySelector('.mdo-card__zoom');
      if (!zoomBtn) return;
      zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // nie odwracaj karty ponownie
        openZoom(card);
      });
    });
    backdrop.addEventListener('click', closeZoom);
    closeBtn.addEventListener('click', closeZoom);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('is-open')) closeZoom();
    });
  })();

  /* ================================
     PROSTY TRYB (mobile / reduced-motion / brak GSAP):
     wszystko widoczne od razu, bez pinu i bez blokady
     ================================ */
  if (!motionOn) {
    document.getElementById('mdo-cards')?.classList.add('is-revealed');
    updateProgress();
    if (progressEl) progressEl.classList.add('is-visible');
    return;
  }

  document.body.classList.add('mdo-motion');
  gsap.registerPlugin(ScrollTrigger);

  /* ── Lenis ── */
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.1 });
    window._lenis = lenis;
    document.documentElement.style.scrollBehavior = 'auto';
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.addEventListener('refresh', () => lenis.resize());
  }

  /* ── Silnik klatek (formowanie diagramu) ── */
  const scene = document.getElementById('mdo-scene');
  const canvas = document.getElementById('mdo-canvas');
  const ctx = canvas.getContext('2d');
  const N = 48; // klatki 0-47: cała animacja formowania
  const frames = [];
  let started = false, lastP = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resizeCanvas = () => {
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };
  const draw = (p) => {
    lastP = p;
    if (!frames.length) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const idx = Math.round(Math.min(1, Math.max(0, p)) * (N - 1));
    let im = null;
    for (let d = 0; d < N && !im; d++) {
      const a = frames[idx - d], b = frames[idx + d];
      if (a && a.complete && a.naturalWidth) im = a;
      else if (b && b.complete && b.naturalWidth) im = b;
    }
    if (im) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
  };
  const loadFrames = () => {
    if (started) return;
    started = true;
    resizeCanvas();
    for (let i = 0; i < N; i++) {
      const im = new Image();
      im.src = '../assets/images/lekcja45/diagram-olej/anim-seq/frame-' + String(i).padStart(3, '0') + '.webp';
      im.onload = () => draw(lastP);
      frames.push(im);
    }
  };
  loadFrames(); // scena jest od razu w pierwszym ekranie — ładuj bez zwłoki
  window.addEventListener('resize', () => { resizeCanvas(); draw(lastP); }, { passive: true });

  /* ── Karty + blokada scrolla ── */
  const nudgeEl = document.getElementById('mdo-nudge');
  const cardsWrap = document.getElementById('mdo-cards');
  let gateCompleted = false;
  let cardsRevealed = false;
  let nudgeTimer = null;

  function showNudge() {
    if (!nudgeEl) return;
    nudgeEl.classList.add('is-visible');
    cards.forEach(c => {
      if (!c.classList.contains('is-flipped')) {
        c.classList.remove('mdo-glow');
        void c.offsetWidth;
        c.classList.add('mdo-glow');
      }
    });
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => nudgeEl.classList.remove('is-visible'), 1800);
  }

  function revealCards() {
    cardsRevealed = true;
    cardsWrap.classList.add('is-revealed');
    gsap.from(cards, {
      opacity: 0, scale: 0.7, y: 18, duration: 0.55, stagger: 0.07, ease: 'back.out(1.6)'
    });
    if (progressEl) progressEl.classList.add('is-visible');
  }

  onAllFlippedCb = () => {
    gateCompleted = true;
    if (gateActive) {
      gateActive = false;
      lenis && lenis.start();
      if (nudgeEl) nudgeEl.classList.remove('is-visible');
    }
  };

  ScrollTrigger.create({
    trigger: scene, pin: true, scrub: true, end: '+=120%',
    onUpdate: self => {
      draw(self.progress);
      if (!cardsRevealed && self.progress >= 0.999) {
        revealCards();
        if (!gateCompleted) { gateActive = true; lockScroll(); }
      }
    }
  });

  const tryBlock = (e) => {
    if (!gateActive) return;
    e.preventDefault();
    showNudge();
  };
  window.addEventListener('wheel', tryBlock, { passive: false });
  window.addEventListener('touchmove', tryBlock, { passive: false });

  updateProgress();

});
