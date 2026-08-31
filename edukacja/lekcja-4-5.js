/* =============================================
   E-LEKCJA KLASY 4–5 — reżyseria scrollytellingu v6
   Wzór: Sowieso (korytarze poziome) + Remote Rituals (rozdziały)
   Litery P-S-Z-O-K, hasło, dyplom, karty, dowody, planeta
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  const HASLO = 'PSZOK';
  const KEY_LETTERS = 'lk45_letters';
  const KEY_AGENT   = 'lk45_agent_no';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  const motionOn = hasGsap && !reduceMotion;

  /* ================================
     1. AKTA SPRAWY — pasek liter
     ================================ */
  const slots = [...document.querySelectorAll('.case-letter')];

  function getLetters() {
    return localStorage.getItem(KEY_LETTERS) || '';
  }

  function renderLetters() {
    const collected = getLetters();
    slots.forEach((slot, i) => {
      if (i < collected.length) {
        slot.textContent = collected[i];
        slot.classList.add('is-collected');
      } else {
        slot.textContent = '?';
        slot.classList.remove('is-collected');
      }
    });
  }

  function markButtonsSaved() {
    const collected = getLetters();
    document.querySelectorAll('.letter-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.slot, 10);
      if (idx < collected.length) {
        btn.classList.add('is-saved');
        btn.disabled = true;
        btn.textContent = `✓ Litera ${btn.dataset.letter} w aktach sprawy`;
      }
    });
  }

  document.querySelectorAll('.letter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const collected = getLetters();
      const idx = parseInt(btn.dataset.slot, 10);
      if (idx !== collected.length) {
        if (idx < collected.length) return;
        btn.textContent = 'Najpierw rozwiąż poprzednie zagadki! 🔍';
        setTimeout(() => { btn.textContent = '🗂 Zapisz literę w aktach sprawy'; }, 1800);
        return;
      }
      localStorage.setItem(KEY_LETTERS, collected + btn.dataset.letter);
      renderLetters();
      markButtonsSaved();
    });
  });

  renderLetters();
  markButtonsSaved();

  /* ================================
     2. HASŁO — odblokowanie finału (reveal kołem od kłódki)
     ================================ */
  const form  = document.getElementById('password-form');
  const input = document.getElementById('password-input');
  const msg   = document.getElementById('password-msg');
  const final = document.getElementById('final-content');

  function unlockFinal(scroll) {
    final.hidden = false;
    final.querySelectorAll('.screen').forEach(s => s.classList.add('is-visible'));
    if (motionOn) {
      gsap.fromTo(final,
        { clipPath: 'circle(0% at 50% 0%)' },
        { clipPath: 'circle(150% at 50% 0%)', duration: 1.2, ease: 'power2.out',
          onComplete: () => { final.style.clipPath = ''; } });
    }
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    if (scroll) {
      if (window._lenis) window._lenis.scrollTo(final, { offset: -20 });
      else final.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (input.value || '').trim().toUpperCase();
    if (val === HASLO) {
      msg.textContent = '✅ Kod poprawny! Akta sprawy otwarte…';
      msg.className = 'password-msg is-success';
      unlockFinal(true);
    } else {
      msg.textContent = 'To nie ten kod. Sprawdź litery w aktach sprawy (prawy górny róg)!';
      msg.className = 'password-msg is-error';
      input.classList.add('is-wrong');
      setTimeout(() => input.classList.remove('is-wrong'), 700);
    }
  });

  /* ================================
     3. DYPLOM (imię + nazwisko wymagane, klasa opcjonalna)
     ================================ */
  const diplomaBtn   = document.getElementById('diploma-btn');
  const diplomaCard  = document.getElementById('diploma-card');
  const nameInput    = document.getElementById('agent-name');
  const surnameInput = document.getElementById('agent-surname');
  const classInput   = document.getElementById('agent-class');

  function agentNumber() {
    let no = localStorage.getItem(KEY_AGENT);
    if (!no) {
      no = '#' + String(Math.floor(1000 + Math.random() * 9000));
      localStorage.setItem(KEY_AGENT, no);
    }
    return no;
  }

  diplomaBtn?.addEventListener('click', () => {
    const name    = (nameInput.value || '').trim();
    const surname = (surnameInput?.value || '').trim();
    const klasa   = (classInput?.value || '').trim();
    if (!name)    { nameInput.focus();    nameInput.placeholder = 'Podaj imię, Agencie!'; return; }
    if (!surname) { surnameInput?.focus(); if (surnameInput) surnameInput.placeholder = 'Podaj nazwisko!'; return; }
    document.getElementById('diploma-name').textContent = `${name} ${surname}`;
    const classEl = document.getElementById('diploma-class');
    if (classEl) { classEl.textContent = klasa ? `Klasa ${klasa}` : ''; classEl.hidden = !klasa; }
    document.getElementById('diploma-number').textContent = agentNumber();
    document.getElementById('diploma-date').textContent =
      new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    diplomaCard.hidden = false;
  });

  document.getElementById('print-btn')?.addEventListener('click', () => window.print());

  /* ================================
     3b. KARTY ODWRACANE — klik/tap/klawiatura
     ================================ */
  document.querySelectorAll('.flip-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('is-flipped'));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('is-flipped');
      }
    });
  });

  /* ================================
     3c. DOWODY — ładowanie stanów (grafiki opcjonalne klienta
     dołączają automatycznie, gdy pojawią się w folderze)
     ================================ */
  const evidences = [...document.querySelectorAll('.evidence')];
  const evidenceReady = Promise.all(evidences.map(ev => new Promise(res => {
    const imgs = [...ev.querySelectorAll('.evidence__state')];
    /* stany muszą sprobować się załadować od razu — lazy poza ekranem
       nigdy nie wystartuje i loader czekałby w nieskończoność */
    imgs.forEach(i => { i.loading = 'eager'; });
    let pending = imgs.length || 1;
    const finish = () => {
      if (--pending > 0) return;
      imgs.forEach(i => { if (!i.naturalWidth) i.remove(); });
      let states = [...ev.querySelectorAll('.evidence__state')];
      if (ev.classList.contains('evidence--single') && states.length > 1) {
        states.slice(1).forEach(i => i.remove());
        states = states.slice(0, 1);
      }
      if (states.length === 0) {
        ev.classList.add('is-empty');
      } else {
        states.forEach((s, i) => s.classList.toggle('is-on', i === 0));
        const fb = ev.dataset.fallback && document.getElementById(ev.dataset.fallback);
        if (fb) fb.style.display = 'none';
      }
      ev._states = states;
      res(ev);
    };
    if (!imgs.length) { finish(); return; }
    imgs.forEach(i => {
      if (i.complete) finish();
      else {
        i.addEventListener('load',  finish, { once: true });
        i.addEventListener('error', finish, { once: true });
      }
    });
  })));

  /* ================================
     4. REŻYSERIA SCROLLA
     ================================ */
  const screens = document.querySelectorAll('.screen');

  if (!motionOn) {
    /* Wersja spokojna: pionowy stos, wszystko widoczne (IO-fade jeśli można) */

    /* K14: kontroler spaceru w ogóle nie startuje w tej gałęzi, więc obrazy
       stacji czekałyby w data-src bez końca (noscript nie pomoże — JS działa).
       Przywracamy src od razu; stos stoi w normalnym przepływie, więc
       loading="lazy" z HTML dalej ogranicza pobieranie do okolic viewportu. */
    document.querySelectorAll('.pszok-journey .pj-station__visual > img:not([src])')
      .forEach(img => { if (img.dataset.src) img.setAttribute('src', img.dataset.src); });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      screens.forEach(s => s.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { threshold: 0.15 });
      screens.forEach(s => io.observe(s));
    }
  } else {
    gsap.registerPlugin(ScrollTrigger);
    const hasSplit = typeof SplitText !== 'undefined';
    const hasDraw  = typeof DrawSVGPlugin !== 'undefined';
    if (hasSplit) gsap.registerPlugin(SplitText);
    if (hasDraw)  gsap.registerPlugin(DrawSVGPlugin);
    document.body.classList.add('lk-gsap', 'js-rails', 'js-motion');

    /* ── SMOOTH INERTIA SCROLL (Lenis) ── */
    let lenis = null;
    if (typeof Lenis !== 'undefined') {
      lenis = new Lenis({ duration: 1.1 });
      window._lenis = lenis;
      /* natywne smooth-scroll dogładzałoby każdy krok Lenisa → walka animacji */
      document.documentElement.style.scrollBehavior = 'auto';
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      /* pin-spacery wydłużają dokument PO starcie Lenisa — bez tego Lenis
         trzyma stary limit i nie pozwala doscrollować do końca strony */
      ScrollTrigger.addEventListener('refresh', () => lenis.resize());
    }
    ScrollTrigger.config({ ignoreMobileResize: true });
    /* kotwice przez Lenis (płynny dojazd, poprawny offset przy pinach) */
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href.length < 2) return;
        const t = document.querySelector(href);
        if (!t) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(t, { offset: 0 });
        else t.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* ── KORYTARZE POZIOME (pin + scrub) ── */
    document.querySelectorAll('.rail').forEach(rail => {
      const track = rail.querySelector('.rail__track');
      const nowEl = rail.querySelector('.rail__now');
      const panels = rail.querySelectorAll('.rail__panel').length;
      const threadPath = rail.querySelector('.thread__path');
      const getDist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tween = gsap.to(track, {
        x: () => -getDist(),
        ease: 'none',
        scrollTrigger: {
          trigger: rail,
          pin: true,
          /* Lenis już wygładza scroll — scrub 1:1, inaczej podwójne
             wygładzanie daje efekt gumy (opóźnienie + doganianie) */
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          end: () => '+=' + Math.max(getDist(), window.innerHeight * 0.5),
          onUpdate: self => {
            if (nowEl && panels > 1) {
              nowEl.textContent = Math.min(panels, Math.round(self.progress * (panels - 1)) + 1);
            }
            if (threadPath && hasDraw) {
              gsap.set(threadPath, { drawSVG: (self.progress * 100) + '%' });
            }
          }
        }
      });
      rail._tween = tween;
    });

    /* ── [ANIM: SPACER-PSZOK] K14 — SPACER PO PSZOK-u (14 stacji) ──
       Trzy warstwy: .pj__background (tło) → .pj__world (droga, kontenery,
       odpady, dekoracje) → .pj__ui (teksty, licznik, nota, skip). Tylko świat
       dostaje skalę kamery i pełną paralaksę; UI zostaje nieruchome.

       Przypięcie robi CSS (`position: sticky`), więc NIE tworzymy tu pinu
       ScrollTriggera — ten trigger tylko czyta postęp i nie wchodzi
       w kolejność pin-spacerów pozostałych scen lekcji.

       Manifest niżej opisuje wyłącznie CHOREOGRAFIĘ. Treść stacji i ścieżki
       obrazów żyją w HTML (wymóg: pełna lekcja czytelna bez JS). */
    (() => {
      const section = document.getElementById('rail-pszok');
      if (!section || !section.classList.contains('pszok-journey')) return;

      const stage = section.querySelector('.pj__stage');
      const worldInner = section.querySelector('.pj__world-inner');
      const roadPath = section.querySelector('.pj__road-path');
      const uiTexts = section.querySelector('.pj__texts');
      const stationEls = [...section.querySelectorAll('.pj-station')];
      if (!stage || !worldInner || !roadPath || !uiTexts) return;
      if (stationEls.length !== 14) return;

      const A = '../assets/images/lekcja45/14-spacer-pszok/dekoracje/webp/';

      /* Cienie górek odpadów. Ciemniejsze frakcje zyskują na delikatnej białej
         poświacie odcinającej je od tła; jasne (styropian, opakowania leków)
         przeciwnie — biały glow je zjada, więc dostają miękki, chłodny cień
         konturujący. Kolor cienia dobrany do tła sceny, nie czysta czerń. */
      const SH_DEFAULT = 'drop-shadow(0 0 18px rgba(255,255,255,0.7)) drop-shadow(0 16px 26px rgba(0,0,0,0.2))';
      const SH_LIGHT   = 'drop-shadow(0 2px 3px rgba(58,66,74,0.34)) drop-shadow(0 10px 18px rgba(48,56,64,0.26))';
      const SH_MEDS    = 'drop-shadow(0 2px 3px rgba(74,64,92,0.34)) drop-shadow(0 10px 18px rgba(62,54,80,0.26))';

      /* route       — wariant linii środkowej trasy (klucz w ROUTES)
         lane        — przesunięcie od osi drogi w wielokrotności jej szerokości
         cw/ww       — rozmiar prezentacyjny kontenera i górki odpadów w vw
         visualY     — wysokość środka zestawu w fazie prezentacji (0..1 sceny)
         visualScale — mnożnik rozmiaru zestawu (dla nietypowych renderów)
         textY       — wysokość środka bloku tekstu (0..1 sceny)
         Dolny margines zestawu i tak pilnuje clampBottom() na podstawie
         rzeczywistych wymiarów po załadowaniu obrazów — wartości niżej są
         punktem wyjścia, nie twardą gwarancją. */
      const PSZOK_STATIONS = [
        { id: 'zielone-bio', route: 'right',  lane:  0.78, tint: '#B9D96A', cw: 34, ww: 27, visualY: 0.60, textY: 0.58 },
        { id: 'gruz',        route: 'left',   lane: -0.78, tint: '#ADB5B8', cw: 34, ww: 27, visualY: 0.60, textY: 0.58 },
        /* wysoka górka opon wystaje mocno ponad kontener — środek wyżej */
        { id: 'opony',       route: 'sCurve', lane:  0.76, tint: '#ADB5B8', cw: 34, ww: 26, visualY: 0.58, textY: 0.57 },
        { id: 'papier',      route: 'left',   lane: -0.80, tint: '#62B9E5', cw: 33, ww: 26, visualY: 0.60, textY: 0.58 },
        /* zielony klapowy ma inne kadrowanie renderu (proporcja 1,34 zamiast
           1,69) — węższa wartość cw wyrównuje jego wysokość do reszty */
        { id: 'szklo',       route: 'right',  lane:  0.80, tint: '#62B9E5', cw: 27, ww: 26, visualY: 0.60, textY: 0.58 },
        { id: 'tworzywa',    route: 'sInv',   lane: -0.76, tint: '#62B9E5', cw: 33, ww: 27, visualY: 0.60, textY: 0.58 },
        /* gabaryty: duży zestaw mebli ponad kontenerem */
        { id: 'gabaryty',    route: 'right',  lane:  0.78, tint: '#8E9BD9', cw: 34, ww: 27, visualY: 0.58, textY: 0.57 },
        /* pojemnik tekstylny jest wąski i wysoki */
        { id: 'tekstylia',   route: 'left',   lane: -0.72, tint: '#8E9BD9', cw: 14, ww: 26, visualY: 0.62, textY: 0.59 },
        { id: 'styropian',   route: 'wide',   lane:  0.76, tint: '#8E9BD9', cw: 33, ww: 22, visualY: 0.60, textY: 0.58,
          wasteShadow: SH_LIGHT },
        /* leki: jasne opakowania na jasnym tle — szaro-fioletowy cień zamiast
           białej poświaty, inaczej blistry i pudełka zlewają się z poświatą */
        { id: 'leki',        route: 'left',   lane: -0.70, tint: '#E59189', cw: 18, ww: 21, visualY: 0.60, textY: 0.58,
          wasteShadow: SH_MEDS },
        /* baterie: górka bardzo wysoka względem małego kontenera */
        { id: 'baterie',     route: 'sCurve', lane:  0.74, tint: '#CE8BA6', cw: 25, ww: 24, visualY: 0.58, textY: 0.57 },
        { id: 'chemikalia',  route: 'left',   lane: -0.72, tint: '#9B8ACB', cw: 19, ww: 24, visualY: 0.60, textY: 0.58 },
        /* elektroodpady: wysoki stos AGD */
        { id: 'elektro',     route: 'sInv',   lane:  0.78, tint: '#7FA5DE', cw: 34, ww: 27, visualY: 0.58, textY: 0.57 },
        /* pawilon niesie czytelny napis „Drugie życie odpadów", więc przygasa
           słabiej niż zwykły kontener — inaczej przekaz znika razem z bryłą */
        { id: 'drugie-zycie',route: 'wide',   lane: -0.74, tint: '#8DCE68', cw: 36, ww: 27, visualY: 0.58, textY: 0.57, dim: 0.62 }
      ];

      const N = PSZOK_STATIONS.length;

      /* ── TEMPO ──────────────────────────────────────────────────────
         SPAN = viewportów scrolla na jedną stację. Wartość dobrana testem
         kółka myszy, nie samym rachunkiem: przy 1,24 całe minięcie kamery
         mieściło się w mniej niż jednym obrocie kółka. */
      const SPAN = 2.35;
      const INTRO = 1 / (N * SPAN + 1);   /* pierwszy ekran = wstęp, bez stacji */
      section.style.setProperty('--pj-span', SPAN);

      /* Fazy lokalnego postępu stacji. Okno czytania to 28% odcinka —
         tekst nie znika zaraz po pełnym pojawieniu się. */
      const PH = {
        far:   0.08,   /* 0.00–0.08 obiekt daleko w głębi          */
        near:  0.30,   /* 0.08–0.30 stopniowe zbliżenie            */
        hold:  0.40,   /* 0.30–0.40 zatrzymanie kontenera          */
        rev:   0.58,   /* 0.40–0.58 ujawnienie frakcji             */
        read:  0.86,   /* 0.58–0.86 okno czytania (28%)            */
        hide:  0.92,   /* 0.86–0.92 schowanie odpadów              */
        pass:  0.92    /* 0.92–1.00 minięcie kamery                */
      };

      /* Amplitudy paralaksy (px). Świat przesuwa wrapper .pj__world-inner
         o PAR_WORLD, a obiekt dokłada PAR_OBJ — sumują się, więc PAR_OBJ jest
         różnicą do docelowych ~11 px, nie pełną wartością. */
      const PAR_WORLD = 7;
      const PAR_OBJ = 4;

      const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
      const cl11 = v => v < -1 ? -1 : v > 1 ? 1 : v;
      const lerp = (a, b, t) => a + (b - a) * t;
      const outCubic = t => 1 - Math.pow(1 - t, 3);
      const inCubic = t => t * t * t;
      const inOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const seg = (v, a, b) => cl01((v - a) / (b - a));

      const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const mixHex = (h1, h2, t) => {
        const a = hex(h1), b = hex(h2);
        return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
      };
      const softMix = (h1, h2, t) => {
        const c1 = hex(h1), c2 = hex(h2);
        const m = [0, 1, 2].map(k => lerp(c1[k], c2[k], t));
        return `rgb(${m.map(v => Math.round(lerp(v, 255, 0.72))).join(',')})`;
      };

      /* ══ GEOMETRIA TRASY ═══════════════════════════════════════════════
         Jeden układ współrzędnych dla wszystkiego: znormalizowany 0..1
         w obu osiach. Mnożnik ×1000 daje jednostki viewBox SVG, mnożnik
         ×W/×H daje piksele stage'a. Nigdzie nie mieszamy px, vw i jednostek
         SVG w jednym wyrażeniu.

         ORIENTACJA PARAMETRU t:
           t = 0  → najbliżej kamery (dolna krawędź kadru)
           t = 1  → punkt zaniku (góra kadru, ~34% wysokości)
         Obiekt nadjeżdżający z oddali ku kamerze idzie więc od DUŻEGO t
         do MAŁEGO, a przy mijaniu kamery t schodzi poniżej zera. */
      const VAN_Y = 0.34;
      /* Dolna część trasy (przy kamerze) jest niemal prosta — jak w referencji
         droga wije się dopiero w głębi, bliżej punktu zaniku. Zakręt robi
         głównie drugi punkt kontrolny (środkowa strefa wysokości). */
      const ROUTES = {
        left:   [[0.52, 1.10], [0.47, 0.74], [0.26, 0.52], [0.47, VAN_Y]],
        right:  [[0.48, 1.10], [0.53, 0.74], [0.74, 0.52], [0.53, VAN_Y]],
        sCurve: [[0.46, 1.10], [0.62, 0.76], [0.30, 0.50], [0.50, VAN_Y]],
        sInv:   [[0.54, 1.10], [0.38, 0.76], [0.70, 0.50], [0.50, VAN_Y]],
        wide:   [[0.50, 1.18], [0.49, 0.72], [0.56, 0.50], [0.50, VAN_Y]]
      };

      const ROAD_W_CAM = 0.66;    /* szerokość drogi przy kamerze (66% kadru) */
      const ROAD_W_VAN = 0.014;   /* przy punkcie zaniku (~14 px na 1000)     */

      /* wykładnik 1.7 — łagodniejsza perspektywa niż kwadratowa; przy 2.2
         szerokość spadała tak szybko, że wstęga czytała się jak sierp */
      const roadWidthAt = t => ROAD_W_VAN + (ROAD_W_CAM - ROAD_W_VAN) * Math.pow(1 - t, 1.7);
      /* skala obiektu wynika z szerokości drogi w danym miejscu (perspektywa),
         wykładnik 0.45 łagodzi ją do zakresu czytelnego na ekranie */
      const perspScaleAt = t => Math.pow(roadWidthAt(t) / ROAD_W_CAM, 0.45);

      const bez = (c, u) => {
        const v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
        return [c[0][0] * b0 + c[1][0] * b1 + c[2][0] * b2 + c[3][0] * b3,
                c[0][1] * b0 + c[1][1] * b1 + c[2][1] * b2 + c[3][1] * b3];
      };
      const bezD = (c, u) => {
        const v = 1 - u, d0 = 3 * v * v, d1 = 6 * v * u, d2 = 3 * u * u;
        return [d0 * (c[1][0] - c[0][0]) + d1 * (c[2][0] - c[1][0]) + d2 * (c[3][0] - c[2][0]),
                d0 * (c[1][1] - c[0][1]) + d1 * (c[2][1] - c[1][1]) + d2 * (c[3][1] - c[2][1])];
      };

      /* Punkt na trasie wraz z lokalnym układem odniesienia.
         laneOffset: 0 = oś drogi, ±0.5 = krawędzie jezdni, |x|>0.5 = pobocze.

         WAŻNE: przesunięcie pasa liczymy POZIOMO (wzdłuż osi X), nie wzdłuż
         normalnej krzywej. W rzucie perspektywicznym droga rozszerza się
         w poziomie ekranu; offset po normalnej przy mocnym zakręcie zawijał
         wstęgę w samoprzecinający się sierp. Normalna zostaje w wyniku —
         służy dekoracjom do orientacji, nie do budowy wstęgi. */
      function getRoutePoint(ctrl, t, laneOffset) {
        const u = cl01(t);
        const P = bez(ctrl, u), D = bezD(ctrl, u);
        const len = Math.hypot(D[0], D[1]) || 1;
        const tangentX = D[0] / len, tangentY = D[1] / len;
        let x = P[0], y = P[1];
        /* poza końcami krzywej przedłużamy trasę stycznie — dzięki temu
           obiekt płynnie wyjeżdża za kamerę (t < 0) bez skoku */
        if (t < 0) { x += tangentX * t * 0.95; y += tangentY * t * 0.95; }
        else if (t > 1) { x += tangentX * (t - 1) * 0.4; y += tangentY * (t - 1) * 0.4; }
        const normalX = -tangentY, normalY = tangentX;
        const perspectiveWidth = roadWidthAt(t);
        return {
          x: x + (laneOffset || 0) * perspectiveWidth, y,
          tangentX, tangentY, normalX, normalY,
          perspectiveWidth, perspectiveScale: perspScaleAt(t)
        };
      }

      /* Wstęga drogi: lewa krawędź w górę, prawa w dół, zamknięcie. */
      const ROAD_SAMPLES = 36;
      function buildRoadPath(ctrl) {
        let d = 'M';
        for (let i = 0; i <= ROAD_SAMPLES; i++) {
          const pt = getRoutePoint(ctrl, i / ROAD_SAMPLES, -0.5);
          d += (i ? 'L' : '') + (pt.x * 1000).toFixed(1) + ',' + (pt.y * 1000).toFixed(1);
        }
        for (let i = ROAD_SAMPLES; i >= 0; i--) {
          const pt = getRoutePoint(ctrl, i / ROAD_SAMPLES, 0.5);
          d += 'L' + (pt.x * 1000).toFixed(1) + ',' + (pt.y * 1000).toFixed(1);
        }
        return d + 'Z';
      }

      /* Punkty kontrolne aktywne przy danym postępie. Trasa zmienia kształt
         WYŁĄCZNIE w oknie przejścia — podczas czytania stoi nieruchomo. */
      function routeCtrlAt(i, p) {
        const cur = ROUTES[PSZOK_STATIONS[i].route];
        if (p <= PH.pass || i >= N - 1) return cur;
        const nxt = ROUTES[PSZOK_STATIONS[i + 1].route];
        const u = inOutCubic(seg(p, PH.pass, 1));
        return cur.map((pt, k) => [lerp(pt[0], nxt[k][0], u), lerp(pt[1], nxt[k][1], u)]);
      }

      /* Położenie obiektu stacji na trasie w funkcji postępu.
         Uwaga na kierunek: od T_FAR (oddal) do T_PAST (za kamerą). */
      const T_FAR = 0.95, T_PRESENT = 0.42, T_PAST = -0.07;
      function stationT(p) {
        if (p <= PH.far) return T_FAR;
        if (p <= PH.near) return lerp(T_FAR, T_PRESENT, inOutCubic(seg(p, PH.far, PH.near)));
        if (p <= PH.pass) return T_PRESENT;          /* prezentacja i czytanie — bez ruchu */
        return lerp(T_PRESENT, T_PAST, inCubic(seg(p, PH.pass, 1)));
      }

      /* ── DOLNY MARGINES ZESTAWU ──────────────────────────────────────
         W fazach HOLD/REVEAL/READ dolna krawędź kontenera wraz z górką musi
         trzymać odstęp od podstawy sceny. Zamiast jednej stałej dla
         wszystkich stacji mierzymy rzeczywisty zasięg po załadowaniu obrazów
         (kontener i górka mają różne proporcje i różnie wystają).
         Pomiar robimy raz na stację i po każdym resize. */
      const bottomGuard = () => Math.max(48, H * 0.06);

      function measureStation(s) {
        const imgs = [s.cont, s.waste].filter(im => im && im.getAttribute('src') && im.naturalWidth);
        if (!imgs.length) return false;
        const prevV = s.visual.style.transform, prevW = s.waste ? s.waste.style.transform : null;
        /* neutralny transform: czysta geometria bez skali i przesunięć */
        s.visual.style.transform = 'translate(-50%,-50%)';
        if (s.waste) s.waste.style.transform = 'translate(-50%,-50%) scale(1)';
        const vr = s.visual.getBoundingClientRect();
        const mid = vr.top + vr.height / 2;
        let bottom = vr.bottom, top = vr.top;
        if (s.waste && s.waste.naturalWidth) {
          const wr = s.waste.getBoundingClientRect();
          bottom = Math.max(bottom, wr.bottom);
          top = Math.min(top, wr.top);
        }
        s.halfDown = bottom - mid;   /* od środka zestawu do jego dolnej krawędzi */
        s.halfUp = mid - top;
        s.visual.style.transform = prevV;
        if (s.waste && prevW !== null) s.waste.style.transform = prevW;
        s.measured = true;
        return true;
      }

      /* Ogranicza środek zestawu tak, by przy danej skali dolna krawędź
         nie zeszła poniżej marginesu. Zwraca y znormalizowane. */
      function clampBottom(s, y, scale) {
        if (!s.measured || !H) return y;
        const maxY = (H - bottomGuard() - s.halfDown * scale) / H;
        const minY = (s.halfUp * scale * 0.55) / H;   /* nie chowaj zestawu za górną krawędź */
        return Math.max(minY, Math.min(y, maxY));
      }

      /* Skala kamery świata. Łagodna — mocne powiększenie robi obiekt. */
      const CAM_PASS = 1.22;
      function camScaleAt(p) {
        if (p <= PH.near) return lerp(0.95, 1, outCubic(seg(p, 0, PH.near)));
        if (p <= PH.pass) return 1;
        return lerp(1, CAM_PASS, inCubic(seg(p, PH.pass, 1)));
      }

      /* KONTROLA ILOCZYNU SKAL.
         Obiekt skaluje się perspektywą trasy, świat dokłada skalę kamery.
         Widz widzi iloczyn obu, więc ograniczamy właśnie iloczyn: końcowy
         efekt kontenera nie przekroczy PASS_MAX × stanu prezentacyjnego. */
      const PASS_MAX = 1.75;
      const PRESENT_PERSP = perspScaleAt(T_PRESENT);
      function objScale(t, cam) {
        const rel = perspScaleAt(t) / PRESENT_PERSP;
        return Math.min(rel * cam, PASS_MAX) / cam;
      }

      /* ── kontrolowane ładowanie: bieżąca i dwie następne stacje ── */
      const shelved = new WeakMap();
      const shelve = img => {
        if (!img || !img.getAttribute('src')) return;
        shelved.set(img, img.getAttribute('src'));
        img.removeAttribute('src');
      };
      const unshelve = img => {
        if (!img || img.getAttribute('src')) return;
        const s = shelved.get(img) || img.dataset.src;
        if (s) img.setAttribute('src', s);
      };
      const imgsOf = i => [...stationEls[i].querySelectorAll('.pj-station__visual > img')];
      /* w scenie ładowaniem sterujemy sami — `loading="lazy"` tylko przeszkadza
         (obraz z nadanym src czekałby na intersection, którego pin nie zgłasza) */
      const ensureLoaded = i => {
        for (let k = i; k <= i + 2 && k < N; k++) {
          imgsOf(k).forEach(img => { img.loading = 'eager'; unshelve(img); });
        }
      };

      /* Start ładowania assetów spaceru — wywoływany dopiero przy zbliżaniu
         się do modułu, żeby nic z K14 nie leciało przy starcie lekcji. */
      let assetsPrimed = false;
      const primeJourneyAssets = () => {
        if (assetsPrimed) return;
        assetsPrimed = true;
        ensureLoaded(0);
      };

      /* ── stacje ── */
      const st = stationEls.map((el, i) => ({
        el,
        visual: el.querySelector('.pj-station__visual'),
        cont: el.querySelector('.pj-station__container'),
        waste: el.querySelector('.pj-station__waste'),
        text: el.querySelector('.pj-station__text'),
        no: el.querySelector('.pj-station__no'),
        cfg: PSZOK_STATIONS[i],
        live: false
      }));

      st.forEach(s => {
        const right = s.cfg.lane > 0;
        s.el.style.setProperty('--pj-cw', s.cfg.cw + 'vw');
        if (s.waste) {
          s.el.style.setProperty('--pj-ww', s.cfg.ww + 'vw');
          s.waste.style.setProperty('--pj-waste-shadow', s.cfg.wasteShadow || SH_DEFAULT);
        }
        if (s.text) s.text.style.setProperty('--pj-text-x', right ? '25%' : '75%');
        s.sideSign = right ? 1 : -1;
      });

      let W = 0, H = 0;
      const measure = () => { W = stage.clientWidth; H = stage.clientHeight; };
      measure();

      const setLive = (s, on) => {
        if (s.live === on) return;
        s.live = on;
        s.el.classList.toggle('is-live', on);
        /* tekst żyje w warstwie UI, poza stacją — visibility stacji go nie
           obejmuje, więc przy wygaszeniu stacji gasimy go jawnie */
        if (!on && s.text) s.text.style.opacity = '0';
      };

      /* paralaksa kursora — wygładzana, zerowana po wyjściu */
      let pxNow = 0, pyNow = 0, pxTo = 0, pyTo = 0;

      function renderStation(s, p, cam) {
        const ctrl = routeCtrlAt(st.indexOf(s), p);
        const t = stationT(p);
        const pt = getRoutePoint(ctrl, t, s.cfg.lane);
        const scale = objScale(t, cam) * (s.cfg.visualScale || 1);

        const rev = outCubic(seg(p, PH.hold, PH.rev));
        const hid = seg(p, PH.read, PH.hide);
        const show = rev * (1 - hid);
        const pass = seg(p, PH.pass, 1);

        /* opacity: wyłania się z mgły oddali, gaśnie dopiero pod koniec mijania */
        const appear = cl01(seg(p, 0, PH.near) * 2.2);
        const alpha = lerp(0.16, 1, appear) * (1 - seg(pass, 0.55, 1));
        /* blur tylko w oddali i na samym końcu minięcia */
        const blur = lerp(9, 0, cl01(seg(p, PH.far * 0.4, PH.near) * 1.25)) + seg(pass, 0.45, 1) * 9;

        if (!s.measured && p > PH.far) measureStation(s);

        /* Wysokość: na trasie w fazach ruchu, a w oknie prezentacji dociągana
           do visualY z manifestu i pilnowana clampem dolnego marginesu.
           W fazie PASS puszczamy obiekt — może wyjść poza kadr. */
        let y = pt.y;
        const settle = cl01(seg(p, PH.near * 0.55, PH.hold));   /* 0 → 1 dojazd do kompozycji */
        const release = seg(p, PH.pass, 1);                      /* 1 → wypuszczenie w PASS   */
        if (settle > 0 && release < 1) {
          const target = clampBottom(s, s.cfg.visualY || 0.60, scale);
          const k = settle * (1 - release);
          y = lerp(pt.y, target, k);
        }

        const pdx = pxNow * PAR_OBJ, pdy = pyNow * PAR_OBJ;
        s.visual.style.transform =
          `translate3d(${(pt.x * W + pdx).toFixed(1)}px,${(y * H + pdy).toFixed(1)}px,0)` +
          ` translate(-50%,-50%) scale(${scale.toFixed(4)})`;
        s.visual.style.opacity = alpha.toFixed(3);
        s.visual.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : '';

        s.cont.style.opacity = lerp(1, s.cfg.dim || 0.42, show).toFixed(3);

        if (s.waste) {
          const ws = lerp(0.08, 1, rev) * lerp(1, 0.08, hid);
          const wy = lerp(9, -7, rev);
          s.waste.style.transform =
            `translate(-50%,-50%) translate3d(0,${wy.toFixed(2)}%,0) scale(${ws.toFixed(4)})`;
          s.waste.style.opacity = (cl01(rev * 1.45) * (1 - hid)).toFixed(3);
        }

        if (s.text) {
          /* tekst wchodzi razem z górką i schodzi dopiero po oknie czytania */
          const tIn = outCubic(seg(p, PH.hold, PH.rev));
          const tOut = seg(p, PH.read, PH.hide);
          s.text.style.opacity = (tIn * (1 - tOut)).toFixed(3);
          /* wyrównanie wysokością do zestawu: bierzemy faktyczną pozycję
             zestawu w tej klatce, więc środki tekstu i grafiki nie rozjeżdżają
             się nawet po clampie dolnego marginesu */
          const tyBase = (s.cfg.textY != null ? s.cfg.textY : (s.cfg.visualY || 0.60));
          const ty = lerp(tyBase, y, 0.5) * H;
          s.text.style.top = ty.toFixed(1) + 'px';
          s.text.style.transform =
            `translate(-50%,-50%) translate3d(0,${(lerp(18, 0, tIn) - tOut * 14).toFixed(1)}px,0)`;
        }
      }

      /* ── główny render ── */
      let lastIdx = -1, lastP = 0, lastRoadKey = '';
      function render(P) {
        lastP = P;
        const t = cl01((P - INTRO) / (1 - INTRO)) * N;
        const i = Math.min(N - 1, Math.floor(t));
        const p = t - i;

        if (P > 0) primeJourneyAssets();
        if (i !== lastIdx) { lastIdx = i; if (assetsPrimed) ensureLoaded(i); }

        const cam = camScaleAt(p);
        const ctrl = routeCtrlAt(i, p);

        /* droga — przebudowa tylko gdy kształt faktycznie się zmienił */
        const key = i + '|' + (p > PH.pass ? Math.round(seg(p, PH.pass, 1) * 60) : 'hold');
        if (key !== lastRoadKey) {
          lastRoadKey = key;
          roadPath.setAttribute('d', buildRoadPath(ctrl));
        }

        /* kamera świata + tło */
        worldInner.style.setProperty('--pj-cam', cam.toFixed(4));
        section.style.setProperty('--pj-bg-scale', (1 + (cam - 1) * 0.22).toFixed(4));

        st.forEach((s, k) => {
          const isNext = k === i + 1 && p > 0.88;
          const on = k === i || isNext;
          setLive(s, on);
          if (s.no) s.no.classList.toggle('is-current', k === i);
          if (on) renderStation(s, k === i ? p : p - 1, cam);
        });

        const cfg = PSZOK_STATIONS[i];
        const nxt = PSZOK_STATIONS[Math.min(N - 1, i + 1)];
        const bt = seg(p, PH.pass, 1);
        section.style.setProperty('--pj-tint', mixHex(cfg.tint, nxt.tint, bt));
        section.style.setProperty('--pj-tint-soft', softMix(cfg.tint, nxt.tint, bt));
      }

      /* ── włączamy scenę tylko na szerokich ekranach i przy dozwolonym ruchu ── */
      const mm = gsap.matchMedia();

      /* Wariant bez sceny: stacje stoją w normalnym przepływie, więc natywne
         loading="lazy" działa poprawnie i wystarczy podstawić data-src. */
      mm.add('(max-width: 900px), (prefers-reduced-motion: reduce)', () => {
        st.forEach((s, i) => imgsOf(i).forEach(unshelve));
      });

      mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
        document.body.classList.add('js-pj');

        /* numer i tekst przenosimy do warstwy UI — nie mogą dziedziczyć
           skali kamery ani paralaksy świata */
        st.forEach(s => {
          if (s.no) uiTexts.appendChild(s.no);
          if (s.text) uiTexts.appendChild(s.text);
        });
        measure();

        const trig = ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true,
          /* ten trigger powstaje przed pinami sceny procesu i planety, a piny
             dokładają pin-spacery przesuwające dokument. Ujemny priorytet
             odsuwa nasze przeliczenie na koniec rundy refreshu. */
          refreshPriority: -1,
          onRefresh: () => { measure(); lastRoadKey = ''; },
          onToggle: self => {
            document.body.classList.toggle('pj-live', self.isActive);
            if (self.isActive) startParallax(); else stopParallax();
          },
          onUpdate: self => render(self.progress)
        });
        const primer = ScrollTrigger.create({
          trigger: section, start: 'top bottom+=60%', once: true, onEnter: primeJourneyAssets
        });

        /* ── PARALAKSA KURSORA ──
           Bez własnej pętli renderującej: dopinamy się do tickera GSAP
           i tylko na czas, gdy scena jest aktywna. */
        const fine = window.matchMedia('(pointer: fine)').matches;
        let ticking = false, resetTween = null;
        const applyParallax = () => {
          section.style.setProperty('--pj-px', pxNow.toFixed(4));
          section.style.setProperty('--pj-py', pyNow.toFixed(4));
          render(lastP);   /* obiekty mają własną głębię — przerysowujemy je */
        };
        const onMove = e => {
          if (resetTween) { resetTween.kill(); resetTween = null; }   /* przerwij powrót */
          const r = stage.getBoundingClientRect();
          pxTo = cl11(((e.clientX - r.left) / r.width - 0.5) * 2);
          pyTo = cl11(((e.clientY - r.top) / r.height - 0.5) * 2);
        };
        const onLeave = () => { pxTo = 0; pyTo = 0; };
        const tick = () => {
          const dx = pxTo - pxNow, dy = pyTo - pyNow;
          if (Math.abs(dx) < 0.0009 && Math.abs(dy) < 0.0009) return;
          pxNow += dx * 0.075;
          pyNow += dy * 0.075;
          applyParallax();
        };
        function startParallax() {
          if (!fine || ticking) return;
          ticking = true;
          if (resetTween) { resetTween.kill(); resetTween = null; }
          window.addEventListener('mousemove', onMove, { passive: true });
          window.addEventListener('blur', onLeave);
          stage.addEventListener('mouseleave', onLeave);
          gsap.ticker.add(tick);
        }
        function stopParallax() {
          if (!ticking) return;
          ticking = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('blur', onLeave);
          stage.removeEventListener('mouseleave', onLeave);
          gsap.ticker.remove(tick);
          pxTo = pyTo = 0;
          if (resetTween) resetTween.kill();
          /* powrót OBU osi; każda klatka aktualizuje zmienne i przerysowuje
             obiekty, a na końcu zerujemy dokładnie */
          const from = { x: pxNow, y: pyNow };
          resetTween = gsap.to(from, {
            x: 0, y: 0, duration: 0.4, ease: 'power2.out',
            onUpdate: () => { pxNow = from.x; pyNow = from.y; applyParallax(); },
            onComplete: () => { pxNow = pyNow = 0; applyParallax(); resetTween = null; }
          });
        }

        render(0);

        return () => {
          trig.kill();
          primer.kill();
          stopParallax();
          if (resetTween) { resetTween.kill(); resetTween = null; }
          pxNow = pyNow = pxTo = pyTo = 0;
          document.body.classList.remove('js-pj', 'pj-live');
          section.style.removeProperty('--pj-px');
          section.style.removeProperty('--pj-py');
          /* teksty i numery wracają na swoje miejsce w stacjach */
          st.forEach((s, i) => {
            if (s.no) s.el.insertBefore(s.no, s.el.firstChild);
            if (s.text) s.el.appendChild(s.text);
            imgsOf(i).forEach(unshelve);
            setLive(s, false);
            s.visual.style.cssText = '';
            if (s.text) s.text.style.cssText = '';
            s.cont.style.opacity = '';
            if (s.waste) s.waste.style.cssText = '';
          });
          lastIdx = -1; lastRoadKey = '';
        };
      });
    })();

    /* KAŻDY doładowany obraz przesuwa layout (szerokość torów, wysokości
       sekcji) → triggery trzymają stare pozycje i tła/animacje strzelają
       w złych miejscach. Po każdym doładowaniu przelicz zakresy (debounce) */
    let imgRefreshT;
    document.querySelectorAll('img').forEach(im => {
      if (!im.complete) im.addEventListener('load', () => {
        clearTimeout(imgRefreshT);
        imgRefreshT = setTimeout(() => ScrollTrigger.refresh(), 200);
      }, { once: true });
    });

    /* ── SILNIK SEKWENCJI KLATEK (klatka wypełnia canvas) ──
       F0/F1 zawężają scroll do klatek z treścią — klatki brzegowe bywają
       puste (wjazd/zanik) i scrub pokazywałby pusty kadr. */
    const frameCanvas = (canvas, srcFor, N, F0, F1) => {
      const ctx = canvas.getContext('2d');
      const frames = [];
      let started = false, lastP = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const resize = () => {
        canvas.width  = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);
      };
      const draw = (p) => {
        lastP = p;
        if (!frames.length) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const idx = F0 + Math.round(Math.min(1, Math.max(0, p)) * (F1 - F0));
        let im = null;
        for (let d = 0; d < N && !im; d++) {
          const a = frames[idx - d], b = frames[idx + d];
          if (a && a.complete && a.naturalWidth) im = a;
          else if (b && b.complete && b.naturalWidth) im = b;
        }
        if (im) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      };
      const load = () => {
        if (started) return;
        started = true;
        resize();
        for (let i = 0; i < N; i++) {
          const im = new Image();
          im.src = srcFor(String(i).padStart(3, '0'));
          im.onload = () => draw(lastP);
          frames.push(im);
        }
      };
      const kickoff = () => {
        if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 5000 });
        else setTimeout(load, 3000);
      };
      if (document.readyState === 'complete') kickoff();
      else window.addEventListener('load', kickoff, { once: true });
      window.addEventListener('resize', () => { if (started) { resize(); draw(lastP); } }, { passive: true });
      return draw;
    };

    /* ── [ANIM: PROCES] SCENA PROCESU (A5): schemat patelnia → biopaliwo
       (pin + klatki). Piny tworzymy w kolejności dokumentu:
       korytarze → proces → planeta ── */
    (() => {
      const scene = document.getElementById('scena-proces');
      const canvas = document.getElementById('proces-canvas');
      if (!scene || !canvas) return;
      const draw = frameCanvas(canvas,
        n => '../assets/images/lekcja45/proces-seq/proces-' + n + '.webp', 92, 0, 91);
      ScrollTrigger.create({
        trigger: scene, pin: true, scrub: true, end: '+=160%',
        onUpdate: self => draw(self.progress)
      });
    })();

    /* ── [ANIM: ZIEMIA] SCENA PLANETY — klatki Ziemi (canvas, pin, zoom in-out).
       UWAGA: musi powstać tu, zaraz po korytarzach — ScrollTrigger odświeża
       triggery w kolejności utworzenia, więc WSZYSTKIE piny muszą istnieć,
       zanim powstaną triggery liczone od pozycji w dokumencie ── */
    (() => {
      const scene = document.getElementById('scena-planeta');
      const canvas = document.getElementById('planet-canvas');
      if (!scene || !canvas) return;
      const ctx = canvas.getContext('2d');
      const N = 75;
      const frames = [];
      let started = false;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const resize = () => {
        canvas.width  = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);
      };
      const load = () => {
        if (started) return;
        started = true;
        resize();
        for (let i = 0; i < N; i++) {
          const im = new Image();
          im.src = '../assets/images/o-projekcie/ziemia-seq/ziemia-' + String(i).padStart(3, '0') + '.webp';
          im.onload = () => draw(lastP);
          frames.push(im);
        }
      };
      let lastP = 0;
      const draw = (p) => {
        lastP = p;
        if (!frames.length) return;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const idx = Math.min(N - 1, Math.round(p * (N - 1)));
        let im = null;
        for (let d = 0; d < N && !im; d++) {
          const a = frames[idx - d], b = frames[idx + d];
          if (a && a.complete && a.naturalWidth) im = a;
          else if (b && b.complete && b.naturalWidth) im = b;
        }
        if (!im) return;
        const size = Math.min(H, W * 0.92) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, p))));
        if (size < 4) return;
        ctx.globalAlpha = Math.min(1, p * 5, (1 - p) * 5 + 0.35);
        ctx.drawImage(im, (W - size) / 2, (H - size) / 2, size, size);
        ctx.globalAlpha = 1;
      };
      /* preload klatek po załadowaniu strony, w czasie bezczynności —
         scena planety to gwarantowany punkt liniowej opowieści, a warunkowe
         triggery (ScrollTrigger/IO) zawodziły przy pinach i skokach */
      const kickoff = () => {
        if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 4000 });
        else setTimeout(load, 2500);
      };
      if (document.readyState === 'complete') kickoff();
      else window.addEventListener('load', kickoff, { once: true });
      ScrollTrigger.create({
        trigger: scene, pin: true, scrub: true, end: '+=170%',
        onUpdate: self => draw(self.progress)
      });
      window.addEventListener('resize', () => { if (started) { resize(); draw(lastP); } }, { passive: true });
    })();

    /* ── [ANIM: BUTELKA-C3] ANIMACJA BUTELKI przy C3 (klatki + zoom scrollem, jak Ziemia) ── */
    (() => {
      const canvas = document.getElementById('butelka-canvas');
      if (!canvas) return;
      const draw = frameCanvas(canvas,
        n => '../assets/images/lekcja45/butelka-seq/butelka-' + n + '.webp', 91, 3, 87);
      /* Opóźnienie: klatki lecą dopiero w ŚRODKOWEJ tercji czytania tekstu —
         start gdy tytuł ~1/3 wjechał, koniec gdy tekst ~2/3 swojej wysokości.
         Kotwiczymy do kolumny z tekstem, nie do całego bloku. */
      const anchor = document.querySelector('#blok-c3 .story--split__text')
                  || document.getElementById('blok-c3');
      /* subtelny zoom (butelka i tak duża) — dojeżdża tuż przed startem klatek */
      gsap.fromTo(canvas, { scale: 0.9 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: anchor, start: 'top 62%', end: 'top 38%', scrub: true }
      });
      ScrollTrigger.create({
        trigger: anchor, start: 'top 62%', end: 'bottom 30%', scrub: true,
        onUpdate: self => draw(self.progress)
      });
    })();

    /* ── [ANIM: ZLEW] ANIMACJA ZLEWU w korytarzu A1 — klatki sterowane scrollem POZIOMYM
       (postęp liczony przez containerAnimation korytarza, nie zakresem
       pionowym: panel jedzie w bok, więc pionowe start/end tu nie działa) ── */
    (() => {
      const canvas = document.getElementById('zlew-canvas');
      const panel  = document.getElementById('blok-a1');
      if (!canvas || !panel) return;
      const draw = frameCanvas(canvas,
        n => '../assets/images/lekcja45/zlew-seq/zlew-' + n + '.webp', 71, 0, 70);
      const rail = panel.closest('.rail');
      const cfg = { trigger: panel, scrub: true, onUpdate: self => draw(self.progress) };
      if (rail && rail._tween) {
        /* Panel przejeżdża ekran od left=100% do left=-100%. Animacja gra
           w środkowej tercji tej drogi: start w 1/3 (left 33%), koniec w 2/3
           (left -33% = right 67%). Panel wycentrowany (left 0) wypada wtedy
           dokładnie w połowie animacji — czyli na kadrze z zalanymi rurami. */
        cfg.containerAnimation = rail._tween;
        cfg.start = 'left 33%';
        cfg.end   = 'right 67%';
      } else {
        cfg.start = 'top 75%';
        cfg.end   = 'bottom 35%';
      }
      ScrollTrigger.create(cfg);
    })();

    /* ── [ANIM: STADION] ANIMACJA STADIONU w korytarzu A2b (×45 — skala 42 mln ton) ── */
    (() => {
      const canvas = document.getElementById('stadion-canvas');
      const panel  = document.getElementById('blok-a2b');
      if (!canvas || !panel) return;
      const draw = frameCanvas(canvas,
        n => '../assets/images/lekcja45/stadion-seq/stadion-' + n + '.webp', 48, 0, 47);
      const rail = panel.closest('.rail');
      const cfg = { trigger: panel, scrub: true, onUpdate: self => draw(self.progress) };
      if (rail && rail._tween) {
        /* jak przy zlewie: środkowa tercja przejazdu — w centrum leje się
           olej, przy 2/3 stadion wypełniony po dach */
        cfg.containerAnimation = rail._tween;
        cfg.start = 'left 33%';
        cfg.end   = 'right 67%';
      } else {
        cfg.start = 'top 75%';
        cfg.end   = 'bottom 35%';
      }
      ScrollTrigger.create(cfg);
    })();

    /* ── MORFING TŁA (data-bg → body) — po pinach, żeby zakresy
       uwzględniały spacery ── */
    document.querySelectorAll('section[data-bg], div[data-bg]').forEach(sec => {
      /* pinowane sceny pomijamy — sąsiedzi mają ten sam kolor tła */
      if (sec.classList.contains('rail') || sec.classList.contains('planet-scene')
          || sec.classList.contains('anim-scene')) return;
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: self => { if (self.isActive) document.body.dataset.bg = sec.dataset.bg; }
      });
    });

    /* pomocnik: trigger świadomy korytarza (containerAnimation) */
    const stFor = (el, cfg) => {
      const rail = el.closest('.rail');
      if (rail && rail._tween) {
        return Object.assign({
          trigger: el.closest('.rail__panel') || el,
          containerAnimation: rail._tween,
          start: 'left 78%'
        }, cfg || {});
      }
      return Object.assign({ trigger: el, start: 'top 80%' }, cfg || {});
    };

    /* ── NIĆ ŚLEDZTWA poza korytarzami (część B problem) ── */
    if (hasDraw) {
      document.querySelectorAll('.act:not(.rail) .thread__path').forEach(p => {
        gsap.fromTo(p, { drawSVG: '0%' }, {
          drawSVG: '100%', ease: 'none',
          scrollTrigger: { trigger: p.closest('.act'), start: 'top 60%', end: 'bottom 60%', scrub: true }
        });
      });
    }

    /* ── EKRANY GIER — wjazd z boku + wnętrze linijka po linijce ── */
    screens.forEach(screen => {
      if (screen.closest('#final-content')) return;
      const fromX = Math.random() > 0.5 ? 90 : -90;
      gsap.fromTo(screen,
        { x: fromX, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7, ease: 'power2.out',
          scrollTrigger: { trigger: screen, start: 'top 82%' } });
      const parts = screen.querySelectorAll('h3, p, .genially-frame, .letter-btn');
      if (parts.length) {
        gsap.from(parts, {
          y: 26, opacity: 0, duration: 0.55, stagger: 0.14, ease: 'power2.out',
          scrollTrigger: { trigger: screen, start: 'top 75%' }
        });
      }
    });

    /* ── WIELKA TYPOGRAFIA — SplitText: maski linii ── */
    const initText = () => {
      document.querySelectorAll('.big-line, .mega-line').forEach(line => {
        if (line.closest('#final-content')) return;
        if (hasSplit) {
          const split = new SplitText(line, { type: 'lines', mask: 'lines' });
          gsap.from(split.lines, {
            yPercent: 115, duration: 0.85, ease: 'power3.out', stagger: 0.09,
            scrollTrigger: stFor(line)
          });
        } else {
          gsap.from(line, { y: 60, opacity: 0, duration: 0.7, ease: 'power3.out',
            scrollTrigger: stFor(line) });
        }
      });
      /* przerywniki — litera po literze */
      document.querySelectorAll('.interlude__word').forEach(w => {
        if (hasSplit) {
          const split = new SplitText(w, { type: 'chars' });
          gsap.from(split.chars, {
            yPercent: 130, opacity: 0, rotation: 8, stagger: 0.05, duration: 0.7,
            ease: 'back.out(1.6)',
            scrollTrigger: { trigger: w.closest('.interlude'), start: 'top 70%' }
          });
        }
      });
      ScrollTrigger.refresh();
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(initText);
    else initText();

    /* ── TREŚCI POMOCNICZE (sub-text, grafiki, chipy) ── */
    document.querySelectorAll('.story, .rail__panel, .interlude').forEach(block => {
      if (block.closest('#final-content')) return;
      const subs = block.querySelectorAll('.sub-text, .img-note, .story-cta, .video-slot, .genially-frame, .password-form, .diploma-form, .mega-sub, .blk-img, .split-img, .flip-grid, .flip-hint, .interlude__kicker, .interlude__sub, .zone-no, .flip-card--zone');
      if (!subs.length) return;
      gsap.from(subs, {
        y: 34, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out',
        scrollTrigger: stFor(block, { start: block.closest('.rail') ? 'left 70%' : 'top 72%' })
      });
    });

    /* ── GIGANTYCZNE LICZBY — skala + doliczanie (też w korytarzach) ── */
    document.querySelectorAll('.big-num').forEach(num => {
      gsap.from(num, {
        scale: 0.55, opacity: 0, duration: 0.7, ease: 'power2.out',
        transformOrigin: 'left bottom',
        scrollTrigger: stFor(num)
      });
      const target = parseInt(num.dataset.count, 10);
      if (!isNaN(target)) {
        const unit = num.querySelector('.big-num__unit');
        const unitHTML = unit ? unit.outerHTML : '';
        const counter = { v: 0 };
        gsap.to(counter, {
          v: target, duration: 1.4, ease: 'power1.out',
          scrollTrigger: stFor(num, { start: num.closest('.rail') ? 'left 70%' : 'top 80%' }),
          onUpdate: () => {
            num.innerHTML = Math.round(counter.v).toLocaleString('pl-PL') + unitHTML;
          }
        });
      }
    });

    /* ── DOWODY — zoom pod lupą + przejścia stanów scrubem ── */
    evidenceReady.then(() => {
      document.querySelectorAll('.evidence:not(.is-empty)').forEach(ev => {
        const states = ev._states || [];
        const zoom = ev.classList.contains('evidence--zoom');
        const inRail = !!ev.closest('.rail');
        const trig = stFor(ev, inRail
          ? { start: 'left 85%', end: 'right 55%', scrub: true }
          : { start: 'top 85%', end: 'top 20%', scrub: true });
        const tl = gsap.timeline({ scrollTrigger: trig });
        if (zoom) {
          tl.fromTo(ev.querySelector('.evidence__stage'),
            { scale: 0.45 }, { scale: 1, ease: 'none', duration: 1 }, 0);
        }
        for (let i = 1; i < states.length; i++) {
          tl.to(states[i - 1], { opacity: 0, duration: 0.8, ease: 'none' }, 0.35 + (i - 1) * 0.8)
            .to(states[i],     { opacity: 1, duration: 0.8, ease: 'none' }, '<');
        }
      });
      ScrollTrigger.refresh();
    });

    /* ── ZWROTY AKCJI — reveal rosnącym kołem światła ── */
    document.querySelectorAll('.reveal-block').forEach(b => {
      gsap.fromTo(b,
        { clipPath: 'circle(9% at 50% 36%)' },
        { clipPath: 'circle(130% at 50% 36%)', ease: 'none',
          scrollTrigger: { trigger: b, start: 'top 82%', end: 'top 22%', scrub: true } });
    });

    /* ── [ANIM: BUTELKA-WLOT] WIELKA BUTELKA wpada do Olejomatu (scrub od
       prawego rogu). UWAGA: to NIE jest sekwencja klatek — pojedynczy
       statyczny PNG (butelka_olejomat_3D.png) animowany transformem GSAP
       (x/y/scale/rotation/opacity). Podmiana na prawdziwą animację klatkową:
       dostarcz MOV z alpha, podepnij przez frameCanvas() jak ANIM: ZLEW ── */
    (() => {
      const sec  = document.getElementById('czesc-a2');
      const bott = document.getElementById('butelka-fly');
      const oleo = sec && sec.querySelector('#blok-a4 .blk-img');
      if (!sec || !bott || !oleo) return;
      /* cel: otwór wlotu Olejomatu (górna część grafiki maszyny) */
      const target = (axis) => {
        const o = oleo.getBoundingClientRect(), s = sec.getBoundingClientRect();
        return axis === 'x'
          ? (o.left - s.left) + o.width * 0.5 - bott.offsetWidth / 2
          : (o.top  - s.top)  + o.height * 0.06 - bott.offsetHeight / 2;
      };
      gsap.timeline({
        scrollTrigger: {
          trigger: '#blok-a4', start: 'top 75%', end: 'bottom 55%',
          scrub: true, invalidateOnRefresh: true
        }
      })
      .fromTo(bott,
        { x: () => sec.clientWidth - bott.offsetWidth * 0.55,
          y: () => -bott.offsetHeight * 0.25,
          scale: 1, rotation: 26, opacity: 1 },
        { x: () => target('x'), y: () => target('y'),
          scale: 0.1, rotation: -8, ease: 'power1.inOut', duration: 0.9 })
      .to(bott, { opacity: 0, scale: 0.05, duration: 0.1, ease: 'none' });
    })();

    /* ── LISTWA ROZDZIAŁÓW + PASEK POSTĘPU ── */
    document.querySelectorAll('.ch-dot').forEach(dot => {
      const target = document.querySelector(dot.getAttribute('href'));
      if (!target) return;
      ScrollTrigger.create({
        trigger: target, start: 'top 55%', end: 'bottom 55%',
        onToggle: self => dot.classList.toggle('is-active', self.isActive)
      });
    });
    gsap.to('#scroll-progress', {
      scaleX: 1, ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.3 }
    });

    /* ── NAKLEJKI, FLYERY, DEKORACJE ── */
    document.querySelectorAll('.act-chip').forEach(chip => {
      gsap.from(chip, {
        scale: 0, rotation: -30, opacity: 0, duration: 0.55, ease: 'back.out(2)',
        scrollTrigger: stFor(chip, { start: chip.closest('.rail') ? 'left 85%' : 'top 85%' })
      });
    });
    document.querySelectorAll('.flyer').forEach(f => {
      const act = f.closest('.act');
      gsap.fromTo(f, { rotation: -14 }, {
        x: () => window.innerWidth * 1.45, rotation: 18, ease: 'none',
        scrollTrigger: { trigger: act, start: 'top 75%', end: 'bottom 40%', scrub: 1 }
      });
    });
    document.querySelectorAll('.deco').forEach(deco => {
      gsap.to(deco, {
        y: -70, rotationY: 14, ease: 'none',
        scrollTrigger: { trigger: deco.closest('.act, .interlude'), start: 'top bottom', end: 'bottom top', scrub: 1.2 }
      });
    });

    /* ── MAGNETYCZNE PRZYCISKI (tylko precyzyjny kursor) ── */
    if (window.matchMedia('(pointer: fine)').matches) {
      document.querySelectorAll('.btn-lk').forEach(btn => {
        const xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3' });
        const yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3' });
        btn.addEventListener('mousemove', (e) => {
          const r = btn.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
          yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
        });
        btn.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
      });
    }
  }

  /* ================================
     5. RESET (tryb testowy)
     ================================ */
  document.getElementById('reset-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem(KEY_LETTERS);
    localStorage.removeItem(KEY_AGENT);
    window.location.reload();
  });

});
