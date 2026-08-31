/* =============================================
   SELEKCIAKI 2026 — MAIN SCRIPT v2
   Logo organic float + 3D Coverflow Carousel
   ============================================= */

/* ================================================
   AUDIO SYSTEM — odtwarzanie dźwięków UI
   .wav w wywołaniach mapujemy na .mp3 (10× mniejsze pliki),
   a wszystkie SFX preloadujemy chwilę po starcie — bez tego
   pierwsze kliknięcie na tablecie/telefonie czekało na pobranie
   i dekodowanie dźwięku (wyraźny lag).
   ================================================ */
const _sfxCache = {};
const _sfxSrc = (file) => `assets/sound/${file.replace(/\.wav$/i, '.mp3')}`;
function playSound(file, volume = 1.0, delayMs = 0) {
  const play = () => {
    if (!_sfxCache[file]) {
      _sfxCache[file] = new Audio(_sfxSrc(file));
      _sfxCache[file].preload = 'auto';
    }
    const a = _sfxCache[file].cloneNode();
    a.volume = Math.min(1, Math.max(0, volume));
    a.play().catch(() => {});
  };
  delayMs > 0 ? setTimeout(play, delayMs) : play();
}
/* Preload wszystkich SFX ~1 s po załadowaniu (nie blokuje first paint) */
window.addEventListener('load', () => {
  setTimeout(() => {
    ['plum_sound_v1.wav', 'click_sound_v1.wav', 'whoosh_v3.wav',
     'wyroznienie_sound_v1.wav', 'blum_sound_v1.wav'].forEach((f) => {
      if (!_sfxCache[f]) {
        _sfxCache[f] = new Audio(_sfxSrc(f));
        _sfxCache[f].preload = 'auto';
        _sfxCache[f].load();
      }
    });
  }, 1000);
});

document.addEventListener('DOMContentLoaded', () => {

  /* ================================================
     1. NAVBAR — scroll state
     ================================================ */
  const navbar = document.getElementById('navbar');
  new IntersectionObserver(
    ([e]) => navbar.classList.toggle('scrolled', !e.isIntersecting),
    { threshold: 0.1 }
  ).observe(document.getElementById('hero'));

  /* Mobile hamburger */
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.getElementById('nav-links');
  hamburger?.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks?.querySelectorAll('.nav-link').forEach(l =>
    l.addEventListener('click', () => navLinks.classList.remove('open'))
  );

  /* ================================================
     2. SCROLL DOTS — active state
     ================================================ */
  const dots = document.querySelectorAll('.scroll-dot');
  const dotObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting)
        dots.forEach(d => d.classList.toggle('scroll-dot--active', d.dataset.section === e.target.id));
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  document.querySelectorAll('.section[id]').forEach(s => dotObserver.observe(s));

  if (typeof gsap === 'undefined') {
    // bez gsap nie będzie intra — odsłoń hero natychmiast
    document.documentElement.classList.remove('js-intro');
    return;
  }

  /* ================================================
     3. GSAP — organic float animation for logo
     ================================================ */
  /* Pływanie całego logo-nav jako jednej bryły */
  const floatTweens = {};

  function startFloat(id) {
    if (id !== 'logo-nav') return;
    floatTweens[id] = gsap.to('#logo-nav', {
      y: -9, x: 0.5, rotation: 0.45,
      duration: 3.8,
      delay: floatTweens[id] ? 0 : 0,
      repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
  }
  /* ================================================
     3b. INTRO — wirujące złożenie znaku przy starcie.
     Elementy logo wlatują zza ekranu (wielkie i rozmyte),
     zbiegają się do centrum, a że kontener równocześnie
     WIRUJE i zmniejsza się — tory rysują spiralę. Po
     osadzeniu znak robi mikro-pop, a napis ŚWIAT SELEKT
     opada z góry. Towarzyszy temu whoosh (jeśli przeglądarka
     pozwoli na dźwięk bez wcześniejszej interakcji).
     ================================================ */
  if (!document.documentElement.classList.contains('js-intro')) {
    startFloat('logo-nav'); // reduced-motion / brak intra — od razu float
  } else {
    const introNav  = document.getElementById('logo-nav');
    const introImgs = gsap.utils.toArray('.logo-img');
    const introArc  = document.querySelector('.hero-arc');
    const introTag  = document.querySelector('.hero-tagline');
    const introScr  = document.querySelector('.hero-scroll');
    introNav.style.pointerEvents = 'none'; // bez hoverów w trakcie intra

    /* Kierunki rozrzutu (równomiernie wokół znaku) — pozycje liczone
       w układzie WIRUJĄCEGO rodzica, więc zbieganie = spirala */
    const introDist = Math.max(window.innerWidth, window.innerHeight) * 0.55;
    const introAng  = [235, 20, 105, 170, 320, 65];

    const introTl = gsap.timeline({
      delay: 0.2,
      onComplete: () => {
        gsap.set([introNav, ...introImgs, introArc, introTag, introScr],
                 { clearProps: 'transform,opacity,filter' });
        introNav.style.pointerEvents = '';
        document.documentElement.classList.remove('js-intro');
        startFloat('logo-nav');
      }
    });

    introTl
      .set(introNav, { rotation: -150, scale: 1.5, transformOrigin: '50% 50%' })
      .set(introImgs, {
        opacity: 0,
        scale: 2.4,
        filter: 'blur(16px)',
        x: (i) => Math.cos(introAng[i] * Math.PI / 180) * introDist,
        y: (i) => Math.sin(introAng[i] * Math.PI / 180) * introDist,
      })
      .set([introArc, introTag, introScr], { opacity: 0 })
      .set(introArc, { y: -Math.round(window.innerHeight * 0.55) })
      .call(() => playSound('intro-whoosh.mp3', 0.75))
      /* zbieganie elementów (rozmycie schodzi w locie) */
      .to(introImgs, {
        x: 0, y: 0, scale: 1, opacity: 1, filter: 'blur(0px)',
        duration: 1.55, stagger: 0.07, ease: 'power4.inOut'
      }, 0.05)
      /* równoległy obrót + zejście do docelowej wielkości */
      .to(introNav, { rotation: 0, scale: 1, duration: 1.9, ease: 'power3.inOut' }, 0)
      /* osadzenie: mikro-pop znaku */
      .to(introNav, { scale: 1.045, duration: 0.16, ease: 'power2.out' }, 1.78)
      .to(introNav, { scale: 1, duration: 0.55, ease: 'elastic.out(1.2, 0.4)' }, 1.94)
      /* napis opada w momencie osadzenia znaku */
      .to(introArc, { y: 0, opacity: 1, duration: 0.75, ease: 'back.out(1.5)' }, 1.8)
      .to([introTag, introScr], { opacity: 1, duration: 0.7, ease: 'power2.out' }, 2.1);
  }

  /* ================================================
     4. LOGO — hover + click interaction (all 6 elements)
     ================================================ */
  const hoverCfg = {
    'leaf-1': { dx:  0,  dy: -5  },  /* subtle — background element */
    'arm-1':  { dx: 12,  dy: -14 },
    'arm-2':  { dx: 12,  dy:  12 },
    'arm-3':  { dx: -12, dy:  10 },
    'leaf-2': { dx: 10,  dy: -12 },
    'leaf-3': { dx: 10,  dy:  14 },
  };

  const labelWrap = document.getElementById('logo-label');
  const labelText = document.getElementById('logo-label-text');

  /* Wszystkie obrazy logo + bazowe z-index (arms na froncie) */
  const allImgs = document.querySelectorAll('.logo-img');
  const baseZ   = { 'arm-1-img': 3, 'arm-2-img': 3, 'arm-3-img': 3 };

  function resetAllImgs() {
    allImgs.forEach(i => {
      gsap.killTweensOf(i);
      gsap.to(i, {
        opacity: 1, scale: 1,
        zIndex: baseZ[i.id] ?? 1,
        filter: 'brightness(1) saturate(1)',
        duration: 0.38, ease: 'power2.inOut', overwrite: 'auto',
      });
    });
  }

  function applyHover(hoveredImg) {
    allImgs.forEach(i => {
      gsap.killTweensOf(i);
      if (i === hoveredImg) {
        gsap.to(i, {
          scale: 1.18, zIndex: 6,
          filter: 'brightness(1.35) saturate(1.5)',
          opacity: 1,
          duration: 0.30, ease: 'back.out(1.4)', overwrite: 'auto',
        });
      } else {
        gsap.to(i, {
          opacity: 0.42, scale: 1,
          zIndex: baseZ[i.id] ?? 1,
          filter: 'brightness(1) saturate(1)',
          duration: 0.22, ease: 'power2.out', overwrite: 'auto',
        });
      }
    });
  }

  /* Reset gdy kursor opuszcza cały obszar logo-nav */
  document.getElementById('logo-nav').addEventListener('mouseleave', () => {
    resetAllImgs();
    if (labelWrap) labelWrap.classList.remove('visible');
  });

  document.querySelectorAll('.logo-el').forEach(el => {
    const id    = el.id;
    const label = el.dataset.label || '';
    const img   = el.dataset.img ? document.getElementById(el.dataset.img) : null;

    el.addEventListener('mouseenter', (e) => {
      /* leaf-1 pokrywa cały canvas — pomijamy gdy kursor jest nad wyższą strefą */
      if (id === 'leaf-1') {
        const top = document.elementFromPoint(e.clientX, e.clientY);
        if (top && top !== el && top.classList.contains('logo-el')) return;
      }
      if (img) applyHover(img);
      if (labelText) labelText.textContent = label;
      if (labelWrap) labelWrap.classList.add('visible');
      playSound('plum_sound_v1.wav', 0.7);
    });

    /* mouseleave elementu — NIE resetujemy tu; zajmuje się logo-nav mouseleave
       lub następny mouseenter na innym elemencie */
    el.addEventListener('mouseleave', () => {
      if (labelWrap) labelWrap.classList.remove('visible');
    });

    el.addEventListener('click', () => {
      playSound('click_sound_v1.wav', 0.8);
      const t = document.getElementById(el.dataset.target);
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    });

    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  /* ================================================
     4b. LOGO — touch (mobile): przeciągnięcie palcem = podgląd
     (jak hover myszką), dotknięcie już podświetlonego segmentu
     po raz drugi = potwierdzenie (jak klik)
     ================================================ */
  (function () {
    const logoNav = document.getElementById('logo-nav');
    if (!logoNav) return;

    let armedEl = null;   // segment aktualnie "podświetlony" (odpowiednik :hover)
    let dragged = false;

    function elFromPoint(x, y) {
      const top = document.elementFromPoint(x, y);
      return top ? top.closest('.logo-el') : null;
    }

    function previewEl(el) {
      if (!el || el === armedEl) return;
      armedEl = el;
      const img = el.dataset.img ? document.getElementById(el.dataset.img) : null;
      if (img) applyHover(img);
      if (labelText) labelText.textContent = el.dataset.label || '';
      if (labelWrap) labelWrap.classList.add('visible');
      playSound('plum_sound_v1.wav', 0.7);
    }

    function confirmEl(el) {
      playSound('click_sound_v1.wav', 0.8);
      const t = document.getElementById(el.dataset.target);
      if (t) t.scrollIntoView({ behavior: 'smooth' });
      armedEl = null;
      resetAllImgs();
      if (labelWrap) labelWrap.classList.remove('visible');
    }

    logoNav.addEventListener('touchstart', () => { dragged = false; }, { passive: true });

    logoNav.addEventListener('touchmove', e => {
      dragged = true;
      const t = e.touches[0];
      previewEl(elFromPoint(t.clientX, t.clientY));
    }, { passive: true });

    logoNav.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const el = elFromPoint(t.clientX, t.clientY);
      if (!el) { dragged = false; return; }

      e.preventDefault(); // blokuje "ghost click" po dotyku
      if (!dragged && el === armedEl) {
        confirmEl(el);       // drugie dotknięcie tego samego segmentu → wejdź
      } else {
        previewEl(el);       // pierwsze dotknięcie / przeciągnięcie → tylko podgląd
      }
      dragged = false;
    }, { passive: false });
  })();

  /* ================================================
     5. 3D COVERFLOW CAROUSEL
     ================================================ */

  /* Position config per offset from active center (index -2 to +2) */
  const POS = [
    { x: -680, z: -180, ry:  58, s: 0.60, o: 0.30 }, // −2
    { x: -355, z:  -85, ry:  42, s: 0.82, o: 0.70 }, // −1
    { x:    0, z:    0, ry:   0, s: 1.00, o: 1.00 }, //  0  active
    { x:  355, z:  -85, ry: -42, s: 0.82, o: 0.70 }, // +1
    { x:  680, z: -180, ry: -58, s: 0.60, o: 0.30 }, // +2
  ];

  class Carousel3D {
    constructor(wrapEl) {
      this.wrap   = wrapEl;
      this.stage  = wrapEl.querySelector('.c3d-stage');
      this.cards  = [...wrapEl.querySelectorAll('.card-3d')];
      this.n      = this.cards.length;
      this.active = Math.floor(this.n / 2);

      // Detect dot colour mode from controls class
      const ctrl = wrapEl.querySelector('.c3d-controls');
      this.dotClass = ctrl?.classList.contains('c3d-controls--light') ? 'cdot--light'
                    : ctrl?.classList.contains('c3d-controls--dark')  ? 'cdot--dark'
                    : '';

      // Compute per-instance POS based on actual card width (supports different sizes per carousel)
      const cardW = this.cards[0]?.offsetWidth || 300;
      const s = cardW / 300;
      this._pos = [
        { x: -820*s, z: -180, ry:  58, s: 0.60, o: 0.30 },
        { x: -460*s, z:  -85, ry:  42, s: 0.82, o: 0.70 },
        { x:      0, z:    0, ry:   0, s: 1.00, o: 1.00 },
        { x:  460*s, z:  -85, ry: -42, s: 0.82, o: 0.70 },
        { x:  820*s, z: -180, ry: -58, s: 0.60, o: 0.30 },
      ];

      this._buildDots();
      this._buildControls();
      this._place(false);

      // Subtle stage parallax on mouse move
      const section = wrapEl.closest('.section');
      if (section) {
        section.addEventListener('mousemove', e => {
          const r  = section.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const mx = (e.clientX - cx) / (r.width / 2); // -1 to +1
          gsap.to(this.stage, { x: mx * 18, duration: 0.9, ease: 'power1.out' });
        });
        section.addEventListener('mouseleave', () =>
          gsap.to(this.stage, { x: 0, duration: 0.9, ease: 'power2.out' })
        );
      }
    }

    _buildDots() {
      const container = this.wrap.querySelector('.c3d-dots');
      if (!container) return;
      this.dots = [];
      for (let i = 0; i < this.n; i++) {
        const d = document.createElement('span');
        d.className = `cdot ${this.dotClass}`;
        if (i === this.active) d.classList.add('cdot--active');
        d.addEventListener('click', () => this.goTo(i));
        container.appendChild(d);
        this.dots.push(d);
      }
    }

    _buildControls() {
      const prev = this.wrap.querySelector('.c3d-btn--prev');
      const next = this.wrap.querySelector('.c3d-btn--next');
      prev?.addEventListener('click', () => this.goTo(this.active - 1));
      next?.addEventListener('click', () => this.goTo(this.active + 1));
      this._updateBtns(prev, next);
      this._prevBtn = prev; this._nextBtn = next;
    }

    _updateBtns(prev, next) {
      if (prev) prev.disabled = this.active === 0;
      if (next) next.disabled = this.active === this.n - 1;
    }

    _posFor(offset) {
      const c = Math.max(-2, Math.min(2, offset));
      return this._pos[c + 2];
    }

    _place(animate = true) {
      const dur = animate ? 0.52 : 0;
      this.cards.forEach((card, i) => {
        const off     = i - this.active;
        const p       = this._posFor(off);
        const hidden  = Math.abs(off) > 2;
        const zIdx    = 10 - Math.abs(off);

        const props = {
          x: p.x, z: p.z, rotateY: p.ry,
          scale: p.s,
          opacity: hidden ? 0 : p.o,
          zIndex: zIdx,
          duration: dur,
          ease: animate ? 'power2.out' : 'none',
        };

        animate ? gsap.to(card, props) : gsap.set(card, props);

        card.dataset.active       = off === 0 ? 'true' : 'false';
        card.style.pointerEvents  = Math.abs(off) <= 2 ? 'auto' : 'none';
      });

      // Update dots
      this.dots?.forEach((d, i) => {
        d.classList.toggle('cdot--active', i === this.active);
      });

      this._updateBtns(this._prevBtn, this._nextBtn);
    }

    goTo(idx) {
      const clamped = Math.max(0, Math.min(this.n - 1, idx));
      if (clamped === this.active) return;
      this.active = clamped;
      this._place(true);
      playSound('whoosh_v3.wav', 0.55);
    }

    bindHover() {
      this.cards.forEach((card, i) => {
        card.addEventListener('mouseenter', () => {
          if (i !== this.active) this.goTo(i);
        });
      });
    }

    /* ---- swajp touch (mobile) ---- */
    _bindTouch() {
      let sx = 0;
      this.stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      this.stage.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 40) this.goTo(this.active + (dx < 0 ? 1 : -1));
      });
    }
  }

  /* Init all carousels */
  document.querySelectorAll('.c3d-wrap').forEach(wrap => {
    const c = new Carousel3D(wrap);
    c.bindHover();
    c._bindTouch();
  });

  /* ================================================
     6. VIDEO MODAL
     ================================================ */
  const modal        = document.getElementById('video-modal');
  const modalFrame   = document.getElementById('modal-frame');
  const modalClose   = document.getElementById('modal-close');
  const modalOverlay = document.getElementById('modal-overlay');

  function openModal(vid) {
    modalFrame.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&rel=0"
      allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.setAttribute('hidden', '');
    modalFrame.innerHTML = '';
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.film-play-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      playSound('plum_sound_v1.wav', 0.75);
      playSound('wyroznienie_sound_v1.wav', 0.7, 90);
      openModal(btn.dataset.vid);
    })
  );
  modalClose?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ================================================
     7. SEGREGACJA — BIN CAROUSEL + DETAIL MODE
     ================================================ */

  /* Kolejność: niebieski, żółty, zielony, brązowy, czarny */
  const BIN_DATA = [
    {
      id: 'blue', name: 'Papier', accentBg: '#071a3e', accentLight: '#4da6ff',
      ok: ['Gazety i czasopisma','Kartony i pudełka','Zeszyty i notatniki','Torby papierowe','Katalogi i ulotki','Zadrukowane kartki','Koperty bez okienek','Papierowe woreczki','Książki i broszury','Opakowania tekturowe','Rolki po ręcznikach','Tektury faliste','Prospekty i foldery','Papier pakowy'],
      no: ['Papier tłusty i natłuszczony','Kalka techniczna','Papier powlekany folią','Paragony kasowe (termiczne)','Mokry i zabrudzony papier','Kartony po pizzy','Chusteczki higieniczne','Papierowe ręczniki po użyciu']
    },
    {
      id: 'yellow', name: 'Metale i tworzywa', accentBg: '#7a3d00', accentLight: '#ff9a00',
      ok: ['Butelki PET po napojach','Plastikowe pojemniki po jedzeniu','Puszki aluminiowe','Puszki stalowe po konserwach','Folie i worki plastikowe','Kartony Tetra Pak (czyste)','Plastikowe kapsle i nakrętki','Tuby plastikowe (puste)','Wiadra plastikowe','Pojemniki po kosmetykach','Metalowe pokrywki słoików','Aluminiowe folie (czyste)','Butelki plastikowe po szamponie','Plastikowe tacki (czyste)','Metalowe spinacze i druty'],
      no: ['Brudne opakowania z resztkami jedzenia','Styropian budowlany','Folie po mięsie z resztkami','Opakowania po farbach i lakierach','Rury i kształtowniki PVC','Opony i gumy','Baterie i akumulatory']
    },
    {
      id: 'green', name: 'Szkło', accentBg: '#001a09', accentLight: '#4cda80',
      ok: ['Butelki szklane bezbarwne','Butelki szklane kolorowe','Słoiki po dżemach i konfiturach','Flakony po perfumach (puste)','Szklane pojemniki po kremach','Butelki po syropach (puste)','Szklane opakowania po miodzie','Szklane opakowania po musztardzie'],
      no: ['Ceramika i porcelana','Żarówki wszystkich typów','Kryształy i szkło kryształowe','Lustra i szyby okienne','Szyby samochodowe','Szkło zbrojone i hartowane','Naczynia żaroodporne']
    },
    {
      id: 'brown', name: 'Bioodpady', accentBg: '#1a0900', accentLight: '#c97a4a',
      ok: ['Obierki owoców','Obierki warzyw','Resztki owoców i warzyw','Fusy po kawie','Fusy i torebki po herbacie','Skorupki jajek','Skoszona trawa','Liście i gałązki','Kwiaty i rośliny doniczkowe'],
      no: ['Mięso, ryby i kości','Nabiał i sery','Oleje i tłuszcze kuchenne','Leki i suplementy','Odchody zwierząt','Opakowania plastikowe','Popiół z węgla i miału','Ziemia']
    },
    {
      id: 'black', name: 'Zmieszane', accentBg: '#0a0a0a', accentLight: '#8fa0a8',
      ok: ['Brudne opakowania plastikowe','Zanieczyszczone opakowania papierowe','Ceramika i porcelana','Guma i przedmioty gumowe','Przedmioty ze skóry naturalnej','Zepsute zabawki (bez baterii)','Styropian zanieczyszczony','Pieluchy jednorazowe','Chusteczki nawilżane','Artykuły higieniczne','Niedopałki papierosów','Zabrudzone szmaty i ścierki','Gąbki kuchenne','Tapety i okładziny','Brudne opakowania wielomateriałowe'],
      no: ['Odpady niebezpieczne (→ PSZOK!)','Baterie i akumulatory (→ PSZOK!)','Farby, lakiery i kleje','Leki przeterminowane (→ apteka)','Chemikalia i środki ochrony roślin','Żarówki energooszczędne (CFL)','Opony (→ PSZOK!)','Elektrosprzęt (→ PSZOK!)']
    }
  ];

  /* Coverflow — szersze odstępy pod większe kosze 320px */
  const BIN_POS = [
    { x: -680, z: -260, ry:  64, rz:  15, s: 0.50, o: 0.20 },
    { x: -330, z: -105, ry:  44, rz:   8, s: 0.75, o: 0.60 },
    { x:    0, z:    0, ry:   0, rz:   0, s: 1.00, o: 1.00 },
    { x:  330, z: -105, ry: -44, rz:  -8, s: 0.75, o: 0.60 },
    { x:  680, z: -260, ry: -64, rz: -15, s: 0.50, o: 0.20 },
  ];

  /* Normalizacja WIZUALNEJ wysokości koszy (PNG mają różne marginesy —
     zielony rysowany był ~39% wyżej niż niebieski przy tej samej szerokości).
     Współczynniki wyliczone ze skanu kanału alpha każdego webp
     (wysokość_zawartości / szerokość_canvasu, cel = 1.45):
     blue 1.285 | yellow 1.552 | green 1.789 | brown 1.673 | black 1.429 */
  const BIN_SCALE = [1.13, 0.93, 0.81, 0.87, 1.01];

  class BinCarousel {
    constructor() {
      this.stage    = document.getElementById('bin-stage');
      this.cards    = [...document.querySelectorAll('.bin-card')];
      this.n        = this.cards.length;
      this.active   = 1;
      this.isDetail = false;
      this._levTw   = [];
      this.hint     = document.getElementById('bin-hint');
      this.detail   = document.getElementById('bin-detail');
      this.detHead  = document.getElementById('bin-detail-head');
      this.detOk    = document.getElementById('bin-detail-ok');
      this.detNo    = document.getElementById('bin-detail-no');
      this.controls = document.getElementById('bin-controls');
      this.seg      = document.getElementById('segregacja');

      this.voiceBtn      = null;
      this.voiceAudio    = null;
      this._voiceOn      = false;
      this._voiceTimeout = null;
      this._svgOn  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
      this._svgOff = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

      if (!this.stage) return;

      this._buildDots();
      this._bindControls();
      this._bindTouch();
      this._bindSectionClick();
      this._place(false);
      this._colorBin(this.active, false);
      this._initVoiceBtn();
    }

    /* Pliki audio — indeks = indeks karty; null = brak nagrania */
    get _voiceFiles() {
      return [
        null,
        null,
        null,
        null,
        'assets/sound/glos_Kosz_czarny_odpady_zmieszane.mp3',
      ];
    }

    /* ---- przycisk głosu — w panelu tekstowym ---- */
    _initVoiceBtn() {
      if (!this.detail) return;
      const content = this.detail.querySelector('.bin-detail__content');
      if (!content) return;

      const btn = document.createElement('button');
      btn.className = 'bin-voice-btn';
      btn.setAttribute('aria-label', 'Kontrola dźwięku narracji');
      btn.innerHTML = `<span class="bvb-icon">${this._svgOff}</span><span class="bvb-label">Włącz głos</span>`;
      btn.style.display = 'none';
      content.appendChild(btn);

      this.voiceBtn = btn;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleVoice();
      });
    }

    _toggleVoice() {
      if (!this.voiceAudio || !this.voiceBtn) return;
      const iconEl  = this.voiceBtn.querySelector('.bvb-icon');
      const labelEl = this.voiceBtn.querySelector('.bvb-label');
      if (this._voiceOn) {
        this.voiceAudio.pause();
        this._voiceOn = false;
        iconEl.innerHTML    = this._svgOff;
        labelEl.textContent = 'Włącz głos';
      } else {
        this.voiceAudio.play().catch(() => {});
        this._voiceOn = true;
        iconEl.innerHTML    = this._svgOn;
        labelEl.textContent = 'Wyłącz głos';
      }
    }

    /* ---- buduje kropki ---- */
    _buildDots() {
      const wrap = document.getElementById('bin-dots');
      if (!wrap) return;
      this.dots = [];
      for (let i = 0; i < this.n; i++) {
        const d = document.createElement('span');
        d.className = 'bdot' + (i === this.active ? ' active' : '');
        d.addEventListener('click', () => { if (!this.isDetail) this.goTo(i); });
        wrap.appendChild(d);
        this.dots.push(d);
      }
    }

    /* ---- binduje kliknięcia strzałek i kart ---- */
    _bindControls() {
      document.getElementById('bin-prev')?.addEventListener('click', () => {
        if (!this.isDetail) this.goTo(this.active - 1);
      });
      document.getElementById('bin-next')?.addEventListener('click', () => {
        if (!this.isDetail) this.goTo(this.active + 1);
      });

      this.cards.forEach((c, i) => {
        /* hover → przesuń do środka */
        c.addEventListener('mouseenter', () => {
          if (!this.isDetail && i !== this.active) this.goTo(i);
        });
        /* klik */
        c.addEventListener('click', e => {
          e.stopPropagation();
          if (this.isDetail) {
            this.exitDetail();
          } else if (i === this.active) {
            this.enterDetail();
          } else {
            this.goTo(i);
          }
        });
        c.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (this.isDetail) this.exitDetail();
            else if (i === this.active) this.enterDetail();
            else this.goTo(i);
          }
        });
      });
    }

    /* ---- swajp touch ---- */
    _bindTouch() {
      let sx = 0;
      this.stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      this.stage.addEventListener('touchend',   e => {
        if (this.isDetail) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 40) this.goTo(this.active + (dx < 0 ? 1 : -1));
      });
    }

    /* ---- klik w sekcję NIE cofa z detalu — tylko kliknięcie kosza ---- */
    _bindSectionClick() {}

    /* ---- ustaw pozycje coverflow ---- */
    _posFor(off) { return BIN_POS[Math.max(-2, Math.min(2, off)) + 2]; }

    _place(animate) {
      const dur = animate ? 0.5 : 0;
      // Skala odstępów względem realnej szerokości kosza (baza 320px) —
      // po powiększeniu koszy rozjazd rośnie proporcjonalnie, bez nachodzenia
      const s = (this.cards[0]?.offsetWidth || 320) / 320;
      this.cards.forEach((card, i) => {
        const off = i - this.active;
        const p   = this._posFor(off);
        const cfg = {
          x: p.x * s, y: 0, z: p.z, rotateY: p.ry, rotateZ: p.rz,
          scale: p.s * BIN_SCALE[i], // wyrównana wizualna wysokość koszy
          opacity: Math.abs(off) > 2 ? 0 : p.o,
          zIndex: 10 - Math.abs(off),
          duration: dur, ease: animate ? 'power2.out' : 'none'
        };
        animate ? gsap.to(card, cfg) : gsap.set(card, cfg);
        card.dataset.active      = off === 0 ? 'true' : 'false';
        card.style.pointerEvents = Math.abs(off) <= 2 ? 'auto' : 'none';
      });
      if (this.dots) this.dots.forEach((d, i) => d.classList.toggle('active', i === this.active));
      const prev = document.getElementById('bin-prev');
      const next = document.getElementById('bin-next');
      if (prev) prev.disabled = this.active === 0;
      if (next) next.disabled = this.active === this.n - 1;
    }

    /* ---- zmień aktywny kosz ---- */
    goTo(idx) {
      const i = Math.max(0, Math.min(this.n - 1, idx));
      if (i === this.active) return;
      this.active = i;
      this._place(true);
      this._colorBin(i, true);
      playSound('whoosh_v3.wav', 0.65);
    }

    /* ---- kolor tła + akcent tytułu ---- */
    _colorBin(idx, animate) {
      const bin = BIN_DATA[idx];
      if (this.seg) gsap.to(this.seg, { backgroundColor: bin.accentBg, duration: animate ? 0.65 : 0, ease: 'power2.out' });
      const title    = document.getElementById('seg-title');
      const titleImg = document.getElementById('seg-title-blue');
      // Swap przez opacity (nie display) — oba tytuły zostają w layoucie,
      // dzięki czemu fitText może je zmierzyć i zrównać rozmiarem
      if (idx === 0) {
        if (title)    { title.style.opacity = '0'; }
        if (titleImg) { titleImg.classList.add('visible'); }
      } else {
        if (title)    { title.style.opacity = '1'; title.style.color = bin.accentLight; }
        if (titleImg) { titleImg.classList.remove('visible'); }
      }
      if (this.hint) this.hint.textContent = 'Kliknij środkowy pojemnik, aby zobaczyć szczegóły';
    }

    /* ============================================
       TRYB DETALU — wejście
       ============================================ */
    enterDetail() {
      if (this.isDetail) return;
      this.isDetail = true;
      playSound('plum_sound_v1.wav', 0.75);
      playSound('wyroznienie_sound_v1.wav', 0.7, 90);

      /* Głos — uruchom z 1s opóźnieniem jeśli istnieje plik dla tego kosza */
      const voiceFile = this._voiceFiles[this.active];
      if (voiceFile && this.voiceBtn) {
        this.voiceAudio = new Audio(voiceFile);
        this.voiceBtn.style.display = '';
        this._voiceTimeout = setTimeout(() => {
          if (!this.isDetail) return;
          this.voiceAudio.play().catch(() => {});
          this._voiceOn = true;
          this.voiceBtn.querySelector('.bvb-icon').innerHTML    = this._svgOn;
          this.voiceBtn.querySelector('.bvb-label').textContent = 'Wyłącz głos';
        }, 1000);
      } else if (this.voiceBtn) {
        this.voiceBtn.style.display = 'none';
      }

      const bin = BIN_DATA[this.active];
      const seg = this.seg;

      /* Wypełnij panel */
      this._fillPanel(bin);

      /* Ukryj inne karty */
      this.cards.forEach((c, i) => {
        if (i !== this.active) {
          gsap.to(c, { opacity: 0, scale: 0.55, duration: 0.35, ease: 'power2.in' });
          c.style.pointerEvents = 'none';
        }
      });

      /* Przesuń aktywny kosz — układ zależy od szerokości ekranu */
      const secW     = seg ? seg.offsetWidth  : window.innerWidth;
      const secH     = seg ? seg.offsetHeight : window.innerHeight;
      const isMobile = window.innerWidth <= 640;

      /* Skala detalu × normalizacja — każdy kosz w detalu ma tę samą
         wizualną wysokość (wcześniej zielony wychodził dużo większy) */
      const detScale = BIN_SCALE[this.active];

      if (isMobile) {
        /* Mobile: kosz przesuwa się ku górze i maleje — tekst zajmuje dolną część */
        gsap.to(this.cards[this.active], {
          x: 0, y: -(secH * 0.32), rotateY: 0, rotateZ: 0, scale: 0.55 * detScale,
          duration: 0.5, ease: 'power2.out'
        });
      } else {
        /* Desktop: kosz w lewo i powiększony */
        const targetX = -(secW * 0.27);
        gsap.to(this.cards[this.active], {
          x: targetX, y: 0, rotateY: 0, rotateZ: 0, scale: 1.4 * detScale,
          duration: 0.6, ease: 'power2.out'
        });
        /* Subtelna lewitacja tylko na desktopie */
        this._levTw = [
          gsap.to(this.cards[this.active], { y: -14, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
          gsap.to(this.cards[this.active], { rotateZ: 2.5, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' })
        ];
      }

      /* Ukryj kontrolki i hint */
      gsap.to([this.controls, this.hint], { opacity: 0, y: 10, duration: 0.3 });
      gsap.to(document.getElementById('seg-header'), { opacity: 0, duration: 0.3 });

      /* Pokaż panel */
      this.detail.classList.add('is-visible');
      this.detail.removeAttribute('aria-hidden');
      gsap.fromTo(this.detail, { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 0.5, delay: 0.25, ease: 'power2.out' });

      if (seg) seg.classList.add('is-detail');
    }

    /* ============================================
       TRYB DETALU — wyjście
       ============================================ */
    exitDetail() {
      if (!this.isDetail) return;
      this.isDetail = false;

      /* Zatrzymaj narrację */
      clearTimeout(this._voiceTimeout);
      this._voiceTimeout = null;
      if (this.voiceAudio) {
        this.voiceAudio.pause();
        this.voiceAudio.currentTime = 0;
        this.voiceAudio = null;
      }
      this._voiceOn = false;
      if (this.voiceBtn) {
        this.voiceBtn.style.display = 'none';
        this.voiceBtn.querySelector('.bvb-icon').innerHTML    = this._svgOff;
        this.voiceBtn.querySelector('.bvb-label').textContent = 'Włącz głos';
      }

      /* Zatrzymaj lewitację i resetuj y/rotateZ */
      this._levTw.forEach(t => t.kill());
      this._levTw = [];
      gsap.set(this.cards[this.active], { y: 0, rotateZ: 0 });

      /* Przywróć pointer events na wszystkich kartach */
      this.cards.forEach(c => { c.style.pointerEvents = ''; });

      /* Ukryj panel */
      gsap.to(this.detail, {
        opacity: 0, x: 50, duration: 0.3, ease: 'power2.in',
        onComplete: () => {
          this.detail.classList.remove('is-visible');
          this.detail.setAttribute('aria-hidden', 'true');
          gsap.set(this.detail, { clearProps: 'x,opacity' });
        }
      });

      /* Przywróć karuzelę */
      this._place(true);

      /* Przywróć kontrolki i hint */
      gsap.to([this.controls, this.hint], { opacity: 1, y: 0, duration: 0.4, delay: 0.2 });
      gsap.to(document.getElementById('seg-header'), { opacity: 1, duration: 0.4, delay: 0.2 });

      if (this.seg) this.seg.classList.remove('is-detail');
    }

    /* ---- wypełnia listy w panelu ---- */
    _fillPanel(bin) {
      if (this.detHead) this.detHead.textContent = bin.name;
      if (this.detOk)   this.detOk.innerHTML  = bin.ok.map(t => `<li>${t}</li>`).join('');
      if (this.detNo)   this.detNo.innerHTML  = bin.no.map(t => `<li>${t}</li>`).join('');
    }
  }

  if (document.getElementById('bin-stage')) new BinCarousel();

  /* ============================================================
     KNOW CAROUSEL — Baza wiedzy
     4 karty ikon, klik → tryb detalu (karta w lewo, panel w prawo)
     ============================================================ */
  const KNOW_DATA = [
    {
      id: 'olejomaty', title: 'Olejomaty', link: 'baza-wiedzy/olejomaty.html',
      text: '<p>Olejomat to innowacyjne, inteligentne urządzenie służące do bezpiecznej i ekologicznej zbiórki zużytego oleju spożywczego (UCO) od mieszkańców. Maszyna nie tylko bezpłatnie wydaje specjalne, bezpieczne butelki na zlewki z patelni, ale również automatycznie waży oddany w nich tłuszcz. Dzięki integracji z dedykowaną aplikacją mobilną, za każdą zdaną butelkę użytkownicy otrzymują punkty, które mogą wymienić na atrakcyjne nagrody, w tym sadzonki roślin w ramach akcji „Olej zdasz, drzewko masz!”. Korzystanie z olejomatów chroni domową kanalizację przed awariami, zapobiega zanieczyszczaniu rzek i pozwala przetworzyć kuchenny odpad w czyste, ekologiczne biopaliwo. To najprostszy krok, by zamienić codzienny problem w realny zysk dla środowiska i lokalnej społeczności.</p>'
    },
    {
      id: 'pszok', title: 'PSZOK', link: 'baza-wiedzy/pszok.html',
      text: '<p>PSZOK (Punkt Selektywnego Zbierania Odpadów Komunalnych) to bezpieczna przystań dla wszystkich problematycznych odpadów z Twojego domu. Punkt ten przyjmuje m.in. zepsuty sprzęt elektroniczny, stare meble, zużyte opony, resztki farb, przeterminowane leki, a od 2025 roku również wysłużoną odzież i tekstylia. Korzystanie z tego miejsca jest w pełni bezpłatne, ponieważ jego koszty pokrywa Twoja comiesięczna opłata za wywóz śmieci. Dostarczając tam samodzielnie swoje kłopotliwe odpady, chronisz środowisko przed uwalnianiem toksyn i zapobiegasz powstawaniu nielegalnych, dzikich wysypisk. To najprostszy, legalny sposób, by pozbyć się domowych rupieci, zmieniając je w cenne surowce wtórne dla nowej, zrównoważonej gospodarki.</p>'
    },
    {
      id: 'goz', title: 'GOZ', link: 'baza-wiedzy/goz.html',
      text: '<p>Gospodarka Obiegu Zamkniętego (GOZ) to innowacyjny i proekologiczny model rozwoju, który ostatecznie odchodzi od niszczącego podejścia „kup, zużyj, wyrzuć”. Jej nadrzędnym celem jest projektowanie i wykorzystywanie produktów w taki sposób, aby maksymalnie wydłużyć ich życie, a po jego zakończeniu w całości odzyskać ukryte w nich surowce do stworzenia nowych dóbr. Model ten naśladuje naturalne ekosystemy przyrody, w których nic się nie marnuje, a to, co dla jednego jest „odpadem”, staje się cennym zasobem dla kogoś innego. Wdrażanie GOZ w codziennym życiu opiera się na prostych zasadach: umiarze w zakupach, współdzieleniu sprzętów, naprawianiu zamiast wyrzucania oraz bezbłędnej segregacji resztek. To kluczowa zmiana myślenia, która pozwala chronić wyczerpujące się zasoby naturalne Ziemi, ograniczyć zanieczyszczenia klimatu i zapewnić bezpieczną przyszłość kolejnym pokoleniom.</p>'
    },
    {
      id: 'klimat', title: 'Odpady a klimat', link: 'baza-wiedzy/klimat.html',
      text: '<p>Czy wiesz, że zawartość Twojego kosza na śmieci ma bezpośredni wpływ na rosnące temperatury i gwałtowne zmiany pogody na świecie? Niesegregowane, organiczne resztki gnijące pod zwałami wysypisk uwalniają metan – gaz cieplarniany działający dziesiątki razy silniej od dwutlenku węgla. Z kolei każde wyrzucone przedwcześnie ubranie wymusza wytworzenie nowego, emitując ogromne ilości zanieczyszczeń w fabrykach. Poniższy artykuł objaśnia, jak ukryte mechanizmy w gospodarce odpadami potęgują efekt cieplarniany. Sprawdź, jak w prosty sposób – poprzez świadomą segregację i rozsądne zakupy – możesz ostudzić gorączkę naszej planety.</p>'
    },
  ];

  const KNOW_POS = [
    { x: -1200, z: -100, ry:  40, s: 0.68, o: 0.00 }, // −2 (ukryta)
    { x:  -600, z:  -55, ry:  28, s: 0.86, o: 0.75 }, // −1
    { x:     0, z:    0, ry:   0, s: 1.00, o: 1.00 }, //  0 aktywna
    { x:   600, z:  -55, ry: -28, s: 0.86, o: 0.75 }, // +1
    { x:  1200, z: -100, ry: -40, s: 0.68, o: 0.00 }, // +2 (ukryta)
  ];

  class KnowCarousel {
    constructor() {
      this.stage    = document.getElementById('know-stage');
      this.cards    = [...this.stage.querySelectorAll('.know-card')];
      this.n        = this.cards.length;
      this.active   = 1; // start z drugą kartą (PSZOK), żeby widać lewą i prawą
      this.isDetail = false;
      this._levTw   = [];

      this.detail    = document.getElementById('know-detail');
      this.detTitle  = document.getElementById('know-detail-title');
      this.detBody   = document.getElementById('know-detail-body');
      this.backBtn   = document.getElementById('know-detail-back');
      this.controls  = document.getElementById('know-controls');
      this.hint      = document.getElementById('know-hint');
      this.header    = document.getElementById('know-header');

      this._buildDots();
      this._place(false);
      this._bindEvents();
    }

    _buildDots() {
      const container = document.getElementById('know-dots');
      if (!container) return;
      this.dots = [];
      for (let i = 0; i < this.n; i++) {
        const d = document.createElement('span');
        d.className = 'cdot cdot--dark';
        if (i === this.active) d.classList.add('cdot--active');
        d.addEventListener('click', () => { if (!this.isDetail) this.goTo(i); });
        container.appendChild(d);
        this.dots.push(d);
      }
    }

    _posFor(offset) {
      const c = Math.max(-2, Math.min(2, offset));
      return KNOW_POS[c + 2];
    }

    _place(animate = true) {
      const dur = animate ? 0.48 : 0;
      this.cards.forEach((card, i) => {
        const off    = i - this.active;
        const p      = this._posFor(off);
        const hidden = Math.abs(off) > 2;
        const props  = {
          x: p.x, z: p.z, rotateY: p.ry,
          scale: p.s,
          opacity: hidden ? 0 : p.o,
          zIndex: 10 - Math.abs(off),
          duration: dur,
          ease: animate ? 'power2.out' : 'none',
        };
        animate ? gsap.to(card, props) : gsap.set(card, props);
        card.dataset.active      = off === 0 ? 'true' : 'false';
        card.style.pointerEvents = Math.abs(off) <= 2 ? 'auto' : 'none';
      });
      this.dots?.forEach((d, i) => d.classList.toggle('cdot--active', i === this.active));
      if (this.prevBtn) this.prevBtn.disabled = this.active === 0;
      if (this.nextBtn) this.nextBtn.disabled = this.active === this.n - 1;
    }

    goTo(idx) {
      const clamped = Math.max(0, Math.min(this.n - 1, idx));
      if (clamped === this.active) return;
      this.active = clamped;
      this._place(true);
      playSound('whoosh_v3.wav', 0.55);
    }

    _bindEvents() {
      // Strzałki nawigacji
      this.prevBtn = this.stage.closest('.know-carousel-area').querySelector('.know-btn-prev');
      this.nextBtn = this.stage.closest('.know-carousel-area').querySelector('.know-btn-next');
      this.prevBtn?.addEventListener('click', () => { if (!this.isDetail) this.goTo(this.active - 1); });
      this.nextBtn?.addEventListener('click', () => { if (!this.isDetail) this.goTo(this.active + 1); });

      // Klik na kartę → goTo lub detail
      this.cards.forEach((card, i) => {
        card.addEventListener('click', () => {
          if (this.isDetail) return;
          if (i !== this.active) { this.goTo(i); return; }
          this.enterDetail(i);
        });
        card.addEventListener('mouseenter', () => {
          if (!this.isDetail && i !== this.active) this.goTo(i);
        });
      });

      // Przycisk "Wróć"
      this.backBtn?.addEventListener('click', () => this.exitDetail());

      // Swajp touch (mobile)
      let sx = 0;
      this.stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      this.stage.addEventListener('touchend', e => {
        if (this.isDetail) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 40) this.goTo(this.active + (dx < 0 ? 1 : -1));
      });
    }

    enterDetail(idx) {
      if (this.isDetail) return;
      this.isDetail = true;
      playSound('plum_sound_v1.wav', 0.75);
      playSound('wyroznienie_sound_v1.wav', 0.7, 90);

      const data = KNOW_DATA[idx];
      if (this.detTitle) this.detTitle.textContent = data.title;
      if (this.detBody) {
        this.detBody.innerHTML = data.text
          ? data.text + `<a class="know-detail__more" href="${data.link || '#'}">Dowiedz się więcej…</a>`
          : '<p class="know-detail__placeholder">Treść zostanie wkrótce uzupełniona.</p>'
            + `<a class="know-detail__more" href="${data.link || '#'}">Dowiedz się więcej…</a>`;
      }

      // Klik na aktywną grafikę w trybie detalu → powrót do karuzeli
      this.cards[this.active].classList.add('is-detail-active');
      this._detailClickHandler = () => this.exitDetail();
      this.cards[this.active].addEventListener('click', this._detailClickHandler);

      // Ukryj pozostałe karty
      this.cards.forEach((c, i) => {
        if (i !== this.active) {
          gsap.to(c, { opacity: 0, scale: 0.6, duration: 0.3, ease: 'power2.in' });
          c.style.pointerEvents = 'none';
        }
      });

      // Ukryj kontrolki i hint
      gsap.to([this.controls, this.hint], { opacity: 0, y: 8, duration: 0.25 });
      gsap.to(this.header, { opacity: 0, duration: 0.25 });

      const isMobile = window.innerWidth <= 640;

      if (isMobile) {
        /* Mobile: grafika jedzie ku górze bez pomniejszania, tekst tuż poniżej */
        const sec  = document.getElementById('baza-wiedzy');
        const secH = sec ? sec.offsetHeight : window.innerHeight;
        gsap.to(this.cards[this.active], {
          x: 0, y: -(secH * 0.18), rotateY: 0, rotateZ: 0, scale: 1.0,
          duration: 0.5, ease: 'power2.out',
          onComplete: () => {
            /* Ustaw panel tekstu tuż pod grafiką (relative do know-wrap) */
            const wrapEl = document.getElementById('know-wrap');
            if (wrapEl) {
              const cardRect = this.cards[this.active].getBoundingClientRect();
              const wrapRect = wrapEl.getBoundingClientRect();
              const topPx    = Math.max(cardRect.bottom - wrapRect.top + 12, 0);
              this.detail.style.top = topPx + 'px';
            }
          }
        });

        this.detail.removeAttribute('aria-hidden');
        gsap.fromTo(this.detail, { opacity: 0 }, { opacity: 1, duration: 0.35, delay: 0.5, ease: 'power2.out' });
      } else {
        /* Desktop: grafika jedzie w lewo, tekst po prawej */
        const dataKnow = this.cards[this.active].dataset.know;
        const xRatio   = dataKnow === 'pszok' ? 0.24 : 0.15;
        const scaleVal = dataKnow === 'pszok' ? 0.85 : 1.1;

        // Wyrównanie tekstu: ta sama wysokość dla wszystkich kart (niezależnie
        // od rozmiaru/skali grafiki danej karty — np. PSZOK jest niższy i szerszy)
        const stageEl = document.getElementById('know-stage');
        const wrapEl  = document.getElementById('know-wrap');
        if (stageEl && wrapEl) {
          const stageRect = stageEl.getBoundingClientRect();
          const wrapRect  = wrapEl.getBoundingClientRect();
          const stageTopFromWrap = stageRect.top - wrapRect.top;
          // Stała karta referencyjna (Olejomaty) — każda karta ma inną bazową
          // wysokość w CSS, więc żeby tekst zawsze startował na tej samej
          // wysokości, liczymy zawsze względem tej samej, jednej karty.
          // Jeśli akurat jest aktywna, odejmujemy bonus +40px z CSS (data-active).
          const oleoCard = this.cards.find(c => c.dataset.know === 'olejomaty') || this.cards[this.active];
          let refH = oleoCard.offsetHeight;
          if (oleoCard.dataset.active === 'true') refH -= 40;
          const visibleCardH = refH * 1.1;
          const cardTopFromStage = Math.max(0, (stageRect.height - visibleCardH) / 2);
          const textTop = Math.round(stageTopFromWrap + cardTopFromStage);
          this.detail.style.paddingTop = Math.max(20, textTop) + 'px';
        }

        const wrap = document.getElementById('know-wrap');
        const secW = wrap ? wrap.offsetWidth : window.innerWidth;
        gsap.to(this.cards[this.active], {
          x: -(secW * xRatio), y: 0, rotateY: 0, rotateZ: 0, scale: scaleVal,
          duration: 0.55, ease: 'power2.out'
        });

        // Subtelna lewitacja tylko na desktopie
        this._levTw = [
          gsap.to(this.cards[this.active], { y: -12, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
          gsap.to(this.cards[this.active], { rotateZ: 1.5, duration: 3.0, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
        ];

        this.detail.removeAttribute('aria-hidden');
        gsap.fromTo(this.detail,
          { opacity: 0, x: 60 },
          { opacity: 1, x: 0, duration: 0.5, delay: 0.25, ease: 'power2.out' }
        );
      }
    }

    exitDetail() {
      if (!this.isDetail) return;
      this.isDetail = false;

      // Usuń handler klik-powrót z aktywnej grafiki
      if (this._detailClickHandler) {
        this.cards[this.active].removeEventListener('click', this._detailClickHandler);
        this._detailClickHandler = null;
      }
      this.cards[this.active].classList.remove('is-detail-active');
      this.detail.style.paddingTop = '';
      this.detail.style.top = '';  // wyczyść mobilne dynamiczne pozycjonowanie

      // Zatrzymaj lewitację
      this._levTw.forEach(t => t.kill());
      this._levTw = [];
      gsap.set(this.cards[this.active], { y: 0, rotateZ: 0 });

      // Ukryj panel
      gsap.to(this.detail, {
        opacity: 0, x: 60, duration: 0.3, ease: 'power2.in',
        onComplete: () => {
          this.detail.setAttribute('aria-hidden', 'true');
          gsap.set(this.detail, { clearProps: 'x,opacity' });
        }
      });

      // Przywróć karuzelę
      this._place(true);

      // Przywróć kontrolki i header
      gsap.to([this.controls, this.hint], { opacity: 1, y: 0, duration: 0.4, delay: 0.2 });
      gsap.to(this.header, { opacity: 1, duration: 0.4, delay: 0.2 });
    }
  }

  if (document.getElementById('know-stage')) new KnowCarousel();

  /* (Dawna animacja wejścia "O projekcie" usunięta — sekcja przebudowana
     na scrollytelling; nowe animacje na końcu pliku.) */

  /* ================================================
     MAPA GMIN — pixel-perfect hover detection
     ================================================ */
  const opMap        = document.getElementById('op-map');
  const opMapImg     = document.getElementById('op-map-img');
  const gminaTooltip = document.getElementById('gmina-tooltip');
  const gminaImgs    = [...document.querySelectorAll('.gmina-img')];

  if (opMap && opMapImg && gminaImgs.length) {

    /* --- Dane PSZOK i Olejomat dla każdej gminy --- */
    const GMINA_INFO = {
      'Gmina Buk':                   { pszok: 'Buk, ul. Przemysłowa 10 (ZGK)', oleo: 'ul. Przemysłowa 10 (ZGK)' },
      'Gmina Opalenica':             { pszok: 'Troszczyn, teren oczyszczalni', oleo: 'ul. 3 Maja 22' },
      'Gmina Stęszew':               { pszok: 'Witobel, teren oczyszczalni ścieków', oleo: 'ul. Poznańska 11' },
      'Gmina Zbąszyń':               { pszok: 'Zbąszyń, ul. Topolowa 31a (ZUK)', oleo: 'ul. Mostowa 10, przy SP' },
      'Gmina Dopiewo':               { pszok: 'Dopiewo, ul. Trzcielińska, oczyszczalnia', oleo: 'Dąbrówka, ul. Malinowa 41' },
      'Gmina Czempiń':               { pszok: 'Piotrowo Pierwsze 26/27, zakład recyklingu', oleo: 'Kościańskie Przedmieście 2b' },
      'Gmina Komorniki':             { pszok: 'Plewiska, ul. Kolejowa', oleo: 'Plewiska, ul. Kolejowa (PSZOK)' },
      'Gmina Grodzisk Wielkopolski': { pszok: 'Grodzisk Wlkp, ul. Kościańska', oleo: 'ul. Kościańska 32 (PSZOK)' },
      'Gmina Kościan':               { displayName: 'Gmina Wiejska Kościan\nGmina Miejska Kościan', pszok: 'Bonikowo, teren dawnego składowiska', oleo: 'ul. Bernardyńska 2' },
      'Miasto Puszczykowo':          { pszok: 'Puszczykowo, ul. Nadwarciańska (EKO-RONDO)', oleo: 'ul. Nadwarciańska 11b (PSZOK)' },
      'Gmina Brodnica':   { pszok: 'Brodnica, ul. Krótka 7 (dawna oczyszczalnia)', oleo: null, nearest: ['Kościan — ul. Bernardyńska 2', 'Czempiń — Kościańskie Przedmieście 2b'] },
      'Gmina Dolsk':      { pszok: 'Dolsk, ul. Kruczyn 9 (ZUK)', oleo: null, nearest: ['Kościan — ul. Bernardyńska 2', 'Czempiń — Kościańskie Przedmieście 2b'] },
      'Gmina Duszniki':   { pszok: 'Podrzewie, ul. Sportowa 17', oleo: null, nearest: ['Buk — ul. Przemysłowa 10', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Granowo':    { pszok: 'Granowo, ul. Komunalna (przy oczyszczalni)', oleo: null, nearest: ['Grodzisk Wlkp — ul. Kościańska 32', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Kamieniec':  { pszok: 'Plastowo', oleo: null, nearest: ['Grodzisk Wlkp — ul. Kościańska 32', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Kaźmierz':   { pszok: 'Kaźmierz, ul. Leśna (ZUK)', oleo: null, nearest: ['Buk — ul. Przemysłowa 10', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Kuślin':     { pszok: 'Podrzewie, ul. Sportowa 17 (PSZOK Duszniki)', oleo: null, nearest: ['Zbąszyń — ul. Mostowa 10', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Rakoniewice':{ pszok: 'Goździn, teren dawnego składowiska', oleo: null, nearest: ['Grodzisk Wlkp — ul. Kościańska 32', 'Opalenica — ul. 3 Maja 22'] },
      'Gmina Wielichowo': { pszok: 'Wielichowo Wieś, dawna hydrofornia', oleo: null, nearest: ['Grodzisk Wlkp — ul. Kościańska 32', 'Opalenica — ul. 3 Maja 22'] },
    };

    /* Na mobile treść PSZOK/Olejomat pojawia się w miejscu opisu
       "Czym jest świat SELEKT?" zamiast w dymku przy palcu — dymek
       przy dotyku zasłaniałby akurat oglądany region mapy.
       Osobny panel (nie nadpisywanie .op-text) — żeby nie niszczyć
       oryginalnych akapitów i ich animacji wejścia (GSAP) */
    const opContent    = document.querySelector('.op-content');
    const opTextGmina  = document.getElementById('op-text-gmina');
    /* Panel zamiast dymka na KAŻDYM urządzeniu dotykowym (telefon I tablet) —
       dymek przy palcu był nieużywalny na tabletach */
    const isMobileMap  = () => window.innerWidth <= 640 ||
      window.matchMedia('(pointer: coarse)').matches;

    function buildGminaInfo(found) {
      const d = GMINA_INFO[found.name] || {};
      const oleoLabel = d.oleo ? 'Olejomat' : 'Najbliższe olejomaty';
      const oleoVal   = d.oleo ? d.oleo : (d.nearest || []).join('<br>');
      const displayName = d.displayName ? d.displayName.split('\n').join('<br>') : found.name;
      return { displayName, pszok: d.pszok || '—', oleoLabel, oleoVal: oleoVal || '—' };
    }

    function showGminaInOpText(found) {
      if (!opTextGmina || !opContent) return;
      const info = buildGminaInfo(found);
      opTextGmina.innerHTML =
        `<span class="op-text-gmina__name">${info.displayName}</span>
         <div class="op-info-block"><span class="op-info-label">PSZOK</span><span class="op-info-value">${info.pszok}</span></div>
         <div class="op-info-block"><span class="op-info-label">${info.oleoLabel}</span><span class="op-info-value">${info.oleoVal}</span></div>`;
      opContent.classList.add('op-content--gmina-active');
    }

    function restoreOpText() {
      opContent?.classList.remove('op-content--gmina-active');
    }

    /* --- Offscreen canvas do detekcji — 1/6 rozdzielczości oryginału --- */
    /* PNG oryginał: 4169×3321; canvas detekcji: 695×554 */
    const HIT_W = 695, HIT_H = 554;
    const hitData = [];

    function loadHitCanvas(imgEl) {
      return new Promise(resolve => {
        const c   = document.createElement('canvas');
        c.width   = HIT_W; c.height = HIT_H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const draw = () => {
          ctx.drawImage(imgEl, 0, 0, HIT_W, HIT_H);
          resolve({ el: imgEl, ctx, name: imgEl.dataset.name });
        };
        if (imgEl.complete) draw();
        else imgEl.addEventListener('load', draw, { once: true });
      });
    }

    /* Progresywnie — mapa reaguje od PIERWSZEJ załadowanej gminy.
       (Promise.all czekał na wszystkie 19 PNG — na tablecie przez długie
       sekundy mapa wyglądała na martwą/zawieszoną) */
    gminaImgs.map(loadHitCanvas).forEach(p => p.then(r => hitData.push(r)));

    let currentHit = null;

    /* Przelicz pozycję kursora z uwzględnieniem object-fit:contain letterboxing */
    function getCursorFraction(e) {
      const cR  = opMap.getBoundingClientRect();
      const cW  = cR.width, cH = cR.height;
      const iAR = HIT_W / HIT_H;           // aspect ratio PNG (4169/3321)
      const cAR = cW / cH;
      let imgW, imgH, offX, offY;
      if (cAR > iAR) {
        imgH = cH; imgW = imgH * iAR;
        offX = (cW - imgW) / 2; offY = 0;
      } else {
        imgW = cW; imgH = imgW / iAR;
        offX = 0; offY = (cH - imgH) / 2;
      }
      const fx = (e.clientX - cR.left - offX) / imgW;
      const fy = (e.clientY - cR.top  - offY) / imgH;
      return { fx, fy, valid: fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 };
    }

    /* Wspólna logika hover — używana zarówno przez mysz (mousemove),
       jak i przez dotyk (touchmove) na urządzeniach mobilnych */
    function updateGminaHover(clientX, clientY) {
      if (!hitData.length) return;

      const { fx, fy, valid } = getCursorFraction({ clientX, clientY });
      if (!valid) {
        clearGminaHover();
        return;
      }

      const px = Math.round(fx * HIT_W);
      const py = Math.round(fy * HIT_H);

      let found = null;
      for (const hd of hitData) {
        try {
          const d = hd.ctx.getImageData(px, py, 1, 1).data;
          if (d[3] > 128) { found = hd; break; }
        } catch (_) {}
      }

      if (found !== currentHit) {
        if (currentHit) currentHit.el.classList.remove('gmina-hovered');
        gminaImgs.forEach(img => img.classList.toggle('gmina-dimmed', !!found && img !== found.el));
        currentHit = found;

        if (isMobileMap()) {
          /* Mobile: info wyświetla się w miejscu opisu, bez dymku przy palcu */
          if (found) {
            found.el.classList.add('gmina-hovered');
            showGminaInOpText(found);
            playSound('blum_sound_v1.wav', 0.6);
          } else {
            restoreOpText();
          }
        } else {
          /* Desktop: pływający dymek przy kursorze */
          if (found) {
            found.el.classList.add('gmina-hovered');
            const info = buildGminaInfo(found);
            gminaTooltip.innerHTML =
              `<span class="gtt-name">${info.displayName}</span>` +
              `<div class="gtt-row"><span class="gtt-label">PSZOK</span><span class="gtt-value">${info.pszok}</span></div>` +
              `<div class="gtt-row"><span class="gtt-label">${info.oleoLabel}</span><span class="gtt-value">${info.oleoVal}</span></div>`;
            gminaTooltip.classList.add('visible');
            playSound('blum_sound_v1.wav', 0.6);
          } else {
            gminaTooltip.classList.remove('visible');
          }
        }
      }

      if (found && !isMobileMap()) {
        const cR   = opMap.getBoundingClientRect();
        const mx   = clientX - cR.left;
        const my   = clientY - cR.top;
        const gap  = 22;
        const tipW = 240;
        /* Pokaż po prawej kursora; jeśli nie ma miejsca — po lewej */
        if (mx + gap + tipW < cR.width) {
          gminaTooltip.style.left = (mx + gap) + 'px';
        } else {
          gminaTooltip.style.left = Math.max(0, mx - gap - tipW) + 'px';
        }
        gminaTooltip.style.top = my + 'px';
      }
    }

    function clearGminaHover() {
      if (currentHit) { currentHit.el.classList.remove('gmina-hovered'); currentHit = null; }
      gminaImgs.forEach(img => img.classList.remove('gmina-dimmed'));
      gminaTooltip.classList.remove('visible');
      restoreOpText();
    }

    opMap.addEventListener('mousemove', (e) => updateGminaHover(e.clientX, e.clientY));
    opMap.addEventListener('mouseleave', clearGminaHover);

    /* Dotyk (mobile) — przeciągnięcie palcem unosi gminę pod palcem,
       tak jak najechanie myszką na PC */
    opMap.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      updateGminaHover(t.clientX, t.clientY);
    }, { passive: true });

    opMap.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      updateGminaHover(t.clientX, t.clientY);
    }, { passive: true });

    opMap.addEventListener('touchend', clearGminaHover);
  }

  /* ================================================
     O PROJEKCIE — SCROLLYTELLING
     Aurora (gradient reagujący na scroll + kursor/palec),
     reveal wielkich linii, liczniki z doliczaniem
     ================================================ */
  const opSection = document.getElementById('o-projekcie');
  if (opSection && opSection.classList.contains('op-scrolly')) {
    const opReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const opStories = [...opSection.querySelectorAll('.op-story')];
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    /* ── Dopasowanie wielkich linii do pełnej szerokości ekranu (.op-fit) —
       działa też poza sekcją (np. tytuł Strefy edukacji); data-fit-cap
       pozwala per-element ograniczyć maksymalny rozmiar ── */
    const opFitEls = [...document.querySelectorAll('.op-fit')];
    const opRange = document.createRange();
    const fitOpLines = () => {
      // górny limit: krótkie słowa nie mogą urosnąć w nieskończoność (byłyby za wysokie)
      const capBase = window.innerWidth < 700 ? 999 : 240;
      opFitEls.forEach((el) => {
        const cap = parseFloat(el.dataset.fitCap) || capBase;
        // el ma width:100% → jego clientWidth = szerokość CONTENT-boxa rodzica
        // (clientWidth rodzica zawierałby padding → font wychodziłby poza ekran)
        const parentW = el.clientWidth;
        if (!parentW) return;
        // realna szerokość tekstu przy 100px (Range działa też na flex-items)
        el.style.fontSize = '100px';
        opRange.selectNodeContents(el);
        const textW = opRange.getBoundingClientRect().width;
        if (textW > 0) {
          const size = Math.min(cap, Math.max(26, 100 * (parentW / textW) * 0.98));
          el.style.fontSize = size.toFixed(1) + 'px';
        }
      });
    };
    fitOpLines();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitOpLines);
    let opFitTO;
    window.addEventListener('resize', () => {
      clearTimeout(opFitTO);
      opFitTO = setTimeout(() => {
        fitOpLines();
        if (opEarthStarted) { opEarthResize(); opEarthDraw(); }
      }, 150);
    }, { passive: true });

    /* ── Lead (ekran 1): podział na słowa — odsłaniane kolejno scrollem ── */
    const opLead = document.getElementById('op-lead');
    let opLeadWords = [];
    if (opLead && !opReduce) {
      const words = opLead.textContent.trim().split(/\s+/);
      opLead.innerHTML = words.map((w) => '<span class="w">' + w + '</span>').join(' ');
      opLeadWords = [...opLead.querySelectorAll('.w')];
    }

    /* ── Przepływ 3D: postęp fali (--fl) liczony z pozycji bloku ── */
    const opFlood = document.getElementById('op-flood');

    /* ── Ziemia sterowana scrollem: sekwencja klatek na canvasie.
       Scroll wybiera klatkę (obrót w obu kierunkach) + skaluje:
       mikro → pełna wysokość ekranu → mikro. ── */
    const opEarthCanvas = document.getElementById('op-flood-canvas');
    const OP_EARTH_N = 75;
    let opEarthCtx = null;
    let opEarthFrames = [];
    let opEarthStarted = false;
    let opEarthFl = 0;
    const opEarthResize = () => {
      if (!opEarthCanvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      opEarthCanvas.width  = Math.round(window.innerWidth * dpr);
      opEarthCanvas.height = Math.round(window.innerHeight * dpr);
    };
    const opEarthDraw = () => {
      if (!opEarthCtx) return;
      const W = opEarthCanvas.width, Hc = opEarthCanvas.height;
      opEarthCtx.clearRect(0, 0, W, Hc);
      const fl = clamp01(opEarthFl);
      const size = Math.min(Hc, W * 0.92) * Math.sin(Math.PI * fl); // zoom in/out
      if (size < 3) return;
      const idx = Math.min(OP_EARTH_N - 1, Math.round(fl * (OP_EARTH_N - 1)));
      // najbliższa ZAŁADOWANA klatka — brak mrugania, nim dociągną się wszystkie
      let im = null;
      for (let d = 0; d < OP_EARTH_N && !im; d++) {
        const a = opEarthFrames[idx - d], b = opEarthFrames[idx + d];
        if (a && a.complete && a.naturalWidth) im = a;
        else if (b && b.complete && b.naturalWidth) im = b;
      }
      if (!im) return;
      opEarthCtx.globalAlpha = Math.min(1, fl * 6, (1 - fl) * 6);
      opEarthCtx.drawImage(im, (W - size) / 2, (Hc - size) / 2, size, size);
      opEarthCtx.globalAlpha = 1;
    };
    const opEarthLoad = () => {
      if (opEarthStarted || !opEarthCanvas) return;
      opEarthStarted = true;
      opEarthCtx = opEarthCanvas.getContext('2d');
      opEarthResize();
      for (let i = 0; i < OP_EARTH_N; i++) {
        const im = new Image();
        im.src = 'assets/images/o-projekcie/ziemia-seq/ziemia-' +
                 String(i).padStart(3, '0') + '.webp';
        im.onload = opEarthDraw; // dorysuj, gdy klatka spłynie
        opEarthFrames.push(im);
      }
    };

    /* ── Składanie mapy gmin: rozsypka → całość przy dojeździe bloku ── */
    const opMapWrap = opSection.querySelector('.op-layout--map');
    const opAsmMap  = document.getElementById('op-map');

    /* ── Aurora (--op-p) + MORPH bloków (--vis / --exit) sterowane scrollem ── */
    if (!opReduce) {
      let opTick = false;
      const opUpdate = () => {
        const r = opSection.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        const p = total > 0 ? clamp01(-r.top / total) : 0;
        opSection.style.setProperty('--op-p', p.toFixed(4));

        // MORPH: dla każdego bloku licz --vis (widoczność/ostrość) i --exit (wyjście w górę).
        // Tekst pozostaje w pełni czytelny w szerokim pasie środka; morph tylko na krawędziach.
        const H = window.innerHeight;
        opStories.forEach((s) => {
          const b = s.getBoundingClientRect();
          const center = b.top + b.height / 2;
          const d = (center - H / 2) / (H / 2); // 0 = środek, <0 = powyżej środka
          const vis = clamp01(1 - Math.max(0, Math.abs(d) - 0.55) / 0.6);
          const exit = clamp01((-d - 0.2) / 0.8);
          s.style.setProperty('--vis', vis.toFixed(3));
          s.style.setProperty('--exit', exit.toFixed(3));
        });

        // Lead: liczba „zapalonych" słów rośnie, gdy blok wjeżdża w ekran
        if (opLeadWords.length) {
          const lr = opLead.getBoundingClientRect();
          const lp = clamp01((H * 0.92 - lr.top) / (H * 0.62));
          const lit = Math.round(lp * opLeadWords.length);
          opLeadWords.forEach((w, i) => w.classList.toggle('on', i < lit));
        }

        // Ziemia: 0 = jeszcze niewidoczna (koniec banera o surowcach),
        // 0.5 = pełna wysokość ekranu, 1 = zniknęła. Scroll steruje
        // klatką obrotu i skalą — w obu kierunkach.
        if (opFlood) {
          const fr = opFlood.getBoundingClientRect();
          const fp = clamp01((H - fr.top) / (fr.height + H));
          opFlood.style.setProperty('--fl', fp.toFixed(4));
          if (fr.top < H * 2 && fr.bottom > -H) opEarthLoad(); // preload z wyprzedzeniem
          if (opEarthCanvas && opEarthStarted) {
            // fake-sticky: canvas dociągany do viewportu w tej samej pętli rAF
            const vt = Math.max(0, Math.min(-fr.top, fr.height - H));
            opEarthCanvas.style.transform = 'translateY(' + vt.toFixed(1) + 'px)';
            opEarthFl = fp;
            opEarthDraw();
          }
        }

        // Składanie mapy: gdy tytuł "Sprawdź swoją gminę" zbliża się do środka,
        // gminy wlatują zza krawędzi (rozmyte) i domykają się w całość, gdy blok
        // dojedzie do góry ekranu. Po złożeniu klasa znika → hover/touch bez zmian.
        if (opMapWrap && opAsmMap) {
          const mr = opMapWrap.getBoundingClientRect();
          const mp = clamp01((H * 0.55 - mr.top) / (H * 0.55));
          const asm = Math.pow(1 - mp, 1.35); // ease-out: końcówka domyka się miękko
          opAsmMap.style.setProperty('--asm', asm.toFixed(4));
          opAsmMap.style.setProperty('--asmf', clamp01((asm - 0.7) / 0.3).toFixed(4));
          opAsmMap.classList.toggle('op-map--assembling', mp < 0.999);
        }
        opTick = false;
      };
      window.addEventListener('scroll', () => {
        if (!opTick) { opTick = true; requestAnimationFrame(opUpdate); }
      }, { passive: true });
      opUpdate();

      /* --op-mx / --op-my: pozycja kursora lub palca (-1..1) → poświata podąża */
      opSection.addEventListener('pointermove', (e) => {
        opSection.style.setProperty('--op-mx', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        opSection.style.setProperty('--op-my', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      }, { passive: true });
    } else {
      // reduced motion — pełna ostrość i widoczność
      opStories.forEach((s) => { s.style.setProperty('--vis', '1'); s.style.setProperty('--exit', '0'); });
    }

    /* Reveal tekstu i kart (jednorazowo) */
    if (opReduce || !('IntersectionObserver' in window)) {
      opStories.forEach((s) => s.classList.add('in'));
    } else {
      const sio = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('in'); sio.unobserve(en.target); }
        });
      }, { threshold: 0.2 });
      opStories.forEach((s) => sio.observe(s));
    }

    /* Liczniki z doliczaniem (format pl-PL) */
    const opNums = opSection.querySelectorAll('.op-num__val');
    const opFinal = (el) => (el.dataset.prefix || '') +
      parseInt(el.dataset.count, 10).toLocaleString('pl-PL');
    const opRunCount = (el) => {
      const target = parseInt(el.dataset.count, 10);
      const prefix = el.dataset.prefix || '';
      const t0 = performance.now(), dur = 1400;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = prefix + Math.round(target * eased).toLocaleString('pl-PL');
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (opReduce || !('IntersectionObserver' in window)) {
      opNums.forEach(el => { el.textContent = opFinal(el); });
    } else {
      const nio = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) { opRunCount(en.target); nio.unobserve(en.target); }
        });
      }, { threshold: 0.6 });
      opNums.forEach(el => nio.observe(el));
    }
  }

});
