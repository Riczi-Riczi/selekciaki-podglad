/* ═══════════════════════════════════════════════════════════════
   K16 — Drugie życie materiałów (prototyp)
   Czysty JS, bez zależności. Prototyp NIE zapisuje litery do
   produkcyjnego localStorage — po ukończeniu emituje `k16:completed`.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const IMG = '../../../assets/images/lekcja45/16-drugie-zycie-materialow/webp/';

  /* Sześć zatwierdzonych par. Jedna tablica konfiguracyjna — HTML rund
     nie jest duplikowany, karty powstają z tych danych. */
  const ROUNDS = [
    {
      id: 'pet',
      inputSrc: 'wejscie-butelka-pet.webp',
      inputName: 'butelka PET',
      outputSrc: 'wyjscie-bluza-polarowa.webp',
      outputName: 'bluza polarowa',
      why: 'Z przetworzonego PET powstają włókna, a z nich tkanina na bluzy polarowe.',
      hint: 'Poszukaj produktu wykonanego z włókien powstających z przetworzonego tworzywa.'
    },
    {
      id: 'alu',
      inputSrc: 'wejscie-aluminium.webp',
      inputName: 'puszki aluminiowe',
      outputSrc: 'wyjscie-rama-rowerowa.webp',
      outputName: 'aluminiowa rama rowerowa',
      why: 'Aluminium można przetapiać wiele razy bez utraty właściwości.',
      hint: 'Metal można wielokrotnie przetapiać i ponownie wykorzystywać.'
    },
    {
      id: 'papier',
      inputSrc: 'wejscie-papier-tektura.webp',
      inputName: 'papier i tektura',
      outputSrc: 'wyjscie-wytlaczanka-jajka.webp',
      outputName: 'wytłaczanka do jajek',
      why: 'Z masy papierowej formuje się nowe opakowania, na przykład wytłaczanki.',
      hint: 'Pomyśl o nowym opakowaniu wykonanym z masy papierowej.'
    },
    {
      id: 'szklo',
      inputSrc: 'wejscie-butelka-sloik-szklany.webp',
      inputName: 'szkło opakowaniowe',
      outputSrc: 'wyjscie-butelka-sloik-szklany.webp',
      outputName: 'nowa butelka lub słoik',
      why: 'Szkło opakowaniowe przetapia się i formuje z niego kolejne opakowania.',
      hint: 'Szkło opakowaniowe może wrócić jako kolejne szklane opakowanie.'
    },
    {
      id: 'bio',
      inputSrc: 'wejscie-bioodpady.webp',
      inputName: 'bioodpady i odpady zielone',
      outputSrc: 'wyjscie-kompost.webp',
      outputName: 'kompost',
      why: 'Resztki roślinne rozkładają się i tworzą materiał poprawiający glebę.',
      hint: 'Resztki roślinne mogą zmienić się w materiał poprawiający glebę.'
    },
    {
      id: 'opona',
      inputSrc: 'wejscie-zuzyta-opona.webp',
      inputName: 'zużyte opony',
      outputSrc: 'wyjscie-nawierzchnia-sportowa.webp',
      outputName: 'nawierzchnia sportowa',
      why: 'Rozdrobniona guma z opon trafia do elastycznych nawierzchni boisk.',
      hint: 'Gumę z opon można wykorzystać w elastycznej powierzchni.'
    }
  ];

  const STAGES = ['ROZDZIELANIE', 'OCZYSZCZANIE', 'PRZETWARZANIE'];

  /* ── elementy ── */
  const $ = id => document.getElementById(id);
  const machine   = $('k16-machine');
  const screenTxt = $('k16-screen');
  const lamps     = [...document.querySelectorAll('.k16-lamp')];
  const inWrap    = $('k16-input-wrap');
  const inImg     = $('k16-input-img');
  const outWrap   = $('k16-output-wrap');
  const outImg    = $('k16-output-img');
  /* podpis odpadu pod lewą taśmą — sama nazwa, bez miniatury */
  const inputName = $('k16-input-name');
  const cardsBox  = $('k16-cards');
  const feedback  = $('k16-feedback');
  const btnNext   = $('k16-next');
  const btnSave   = $('k16-save');
  const roundNo   = $('k16-round');
  const dotsBox   = $('k16-dots');
  const diag      = $('k16-diag');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── AUDIO (prototyp) ─────────────────────────────────────────
     Efekty domyślnie WŁĄCZONE, ale przy załadowaniu strony nic nie gra —
     pierwszy dźwięk pojawia się dopiero po interakcji ucznia (sfxPlay
     wywoływane wyłącznie z obsługi odpowiedzi). Przycisk wycisza
     natychmiast; ustawienie nie jest zapisywane (żadnego localStorage
     w prototypie — przy integracji nadpisze je globalny system lekcji).
     Brak lub błąd pliku MP3 nigdy nie zatrzymuje gry. Dźwięki są
     doklejone do istniejącej osi czasu — nie zmieniają logiki rund.
     Uwaga: reduced-motion NIE wycisza dźwięków; robi to tylko przycisk. */
  const SFX_BASE = '../../../assets/images/lekcja45/16-drugie-zycie-materialow/sfx/';
  const SFX_DEF = {
    wjazd:     ['sfx-wjazd-odpadu.mp3',       0.45],
    loop:      ['sfx-praca-maszyny-loop.mp3', 0.28],
    wyjazd:    ['sfx-wyjazd-produktu.mp3',    0.45],
    poprawna:  ['sfx-odpowiedz-poprawna.mp3', 0.55],
    negatywna: ['sfx-odpowiedz-negatywna.mp3', 0.45]
  };
  const sfx = {};
  let soundOn = true;    /* domyślnie włączone; nic nie gra bez interakcji */
  let fadeTimer = null;

  function sfxGet(name) {
    if (!sfx[name]) {
      const a = new Audio(SFX_BASE + SFX_DEF[name][0]);
      a.preload = 'auto';
      a.volume = SFX_DEF[name][1];
      if (name === 'loop') a.loop = true;
      a.addEventListener('error', () => { /* cicho: gra działa bez audio */ });
      sfx[name] = a;
    }
    return sfx[name];
  }
  function sfxPlay(name) {
    if (!soundOn) return;
    try {
      const a = sfxGet(name);
      if (name === 'loop') { clearTimeout(fadeTimer); a.volume = SFX_DEF.loop[1]; }
      /* reset od zera: szybkie ponowne kliknięcie restartuje efekt,
         a jedna instancja Audio wyklucza równoległe kopie */
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* nigdy nie blokujemy gry */ }
  }
  function sfxStopLoop(fade) {
    const a = sfx.loop;
    if (!a || a.paused) return;
    clearTimeout(fadeTimer);
    if (fade) {
      /* fade-out ~150 ms w 5 krokach */
      let v = a.volume;
      const stepDown = () => {
        v -= SFX_DEF.loop[1] / 5;
        if (v <= 0.01) { a.pause(); a.currentTime = 0; a.volume = SFX_DEF.loop[1]; }
        else { a.volume = v; fadeTimer = setTimeout(stepDown, 30); }
      };
      stepDown();
    } else { a.pause(); a.currentTime = 0; }
  }
  function sfxStopAll() {
    clearTimeout(fadeTimer);
    Object.values(sfx).forEach(a => { try { a.pause(); a.currentTime = 0; } catch (e) {} });
    if (sfx.loop) sfx.loop.volume = SFX_DEF.loop[1];
  }

  const btnSound = document.getElementById('k16-sound');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      soundOn = !soundOn;
      btnSound.setAttribute('aria-pressed', String(soundOn));
      btnSound.textContent = soundOn ? 'Dźwięk: włączony' : 'Dźwięk: wyłączony';
      /* wyłączenie ucisza natychmiast; włączenie NICZEGO nie odtwarza —
         dźwięki wracają dopiero przy następnej interakcji */
      if (!soundOn) sfxStopAll();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sfxStopLoop(false);
  });

  /* ── stan gry ── */
  let order = [];        /* kolejność rund (losowana przy starcie) */
  let idx = 0;           /* indeks w `order` */
  let solved = 0;
  let locked = false;    /* blokada na czas animacji maszyny */
  let timers = [];

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  /* ── ładowanie: tylko bieżąca i następna runda ── */
  const loaded = new Set();
  function preloadRound(k) {
    const r = ROUNDS[order[k]];
    if (!r) return;
    /* wejście + poprawne wyjście rundy; dystraktory to wyjścia innych rund,
       więc i tak są w puli — dociągamy je razem z rundą, w której wystąpią */
    [r.inputSrc, r.outputSrc].forEach(src => {
      if (loaded.has(src)) return;
      loaded.add(src);
      const im = new Image();
      im.src = IMG + src;
    });
  }

  function fallback(img, label) {
    img.addEventListener('error', () => {
      img.style.visibility = 'hidden';
      diag.hidden = false;
      diag.textContent = 'Nie udało się wczytać grafiki: ' + label +
        ' (' + img.getAttribute('src') + '). Gra działa dalej — pozostaje opis tekstowy.';
    }, { once: true });
  }

  /* ── ETYKIETY: hover 150 ms, long-press 350 ms, focus-visible ──
     Wolniejsze czytanie nie jest karane: etykieta znika dopiero przy
     opuszczeniu obiektu, wciśnięciu lub rozpoczęciu przeciągania. */
  function bindLabel(card) {
    let hoverT = null, pressT = null, sx = 0, sy = 0, dragging = false;
    const show = () => card.classList.add('is-labelled');
    const hide = () => {
      card.classList.remove('is-labelled');
      clearTimeout(hoverT); clearTimeout(pressT);
    };

    card.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverT);
      hoverT = setTimeout(show, 150);
    });
    card.addEventListener('pointerleave', hide);
    card.addEventListener('pointercancel', hide);

    card.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') { hide(); return; }
      sx = e.clientX; sy = e.clientY; dragging = false;
      clearTimeout(pressT);
      pressT = setTimeout(() => { if (!dragging) show(); }, 350);
    });
    card.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse' || dragging) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { dragging = true; hide(); }
    });
    card.addEventListener('pointerup', hide);
    card.addEventListener('dragstart', hide);

    /* etykieta przy nawigacji klawiaturą; gdy przeglądarka nie zna
       :focus-visible, pokazujemy ją zawsze — lepiej za dużo niż wcale */
    card.addEventListener('focus', () => {
      let keyboard = true;
      try { keyboard = card.matches(':focus-visible'); } catch (e) { keyboard = true; }
      if (keyboard) show();
    });
    card.addEventListener('blur', hide);
  }

  /* ── budowa kart odpowiedzi ── */
  function buildCards(round) {
    cardsBox.innerHTML = '';
    /* dwa dystraktory z produktów pozostałych par */
    const others = shuffle(ROUNDS.filter(r => r.id !== round.id)).slice(0, 2);
    const opts = shuffle([round, ...others]);

    opts.forEach(o => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'k16-card';
      card.dataset.id = o.id;
      card.setAttribute('aria-label', o.outputName);

      const img = document.createElement('img');
      img.className = 'k16-card__img';
      img.src = IMG + o.outputSrc;
      img.alt = '';
      fallback(img, o.outputName);

      const lbl = document.createElement('span');
      lbl.className = 'k16-card__lbl';
      lbl.textContent = o.outputName;

      const mark = document.createElement('span');
      mark.className = 'k16-card__mark';
      mark.setAttribute('aria-hidden', 'true');

      card.append(img, lbl, mark);
      bindLabel(card);
      card.addEventListener('click', () => choose(card, o, round));
      cardsBox.appendChild(card);
    });
  }

  /* ── kropki postępu ── */
  function paintDots() {
    dotsBox.innerHTML = '';
    for (let i = 0; i < ROUNDS.length; i++) {
      const d = document.createElement('i');
      if (i < solved) d.className = 'is-done';
      else if (i === idx) d.className = 'is-now';
      dotsBox.appendChild(d);
    }
  }

  /* ── runda ── */
  function startRound() {
    clearTimers();
    sfxStopAll();   /* nowa runda nie dziedziczy dźwięków poprzedniej */
    locked = false;
    const round = ROUNDS[order[idx]];

    roundNo.textContent = idx + 1;
    paintDots();
    feedback.textContent = '';
    feedback.className = 'k16-feedback';
    btnNext.hidden = true;
    btnSave.hidden = true;
    machine.dataset.state = 'idle';
    screenTxt.textContent = 'GOTOWA';
    lamps.forEach(l => l.classList.remove('is-on'));

    /* reset taśm */
    outWrap.className = 'k16-obj k16-obj--out';
    outImg.removeAttribute('src');
    inWrap.className = 'k16-obj k16-obj--in';
    inImg.src = IMG + round.inputSrc;
    inImg.alt = '';
    fallback(inImg, round.inputName);

    if (inputName) inputName.textContent = round.inputName;

    buildCards(round);
    preloadRound(idx + 1);

    /* materiał wjeżdża na lewą taśmę */
    later(() => inWrap.classList.add('is-ready'), 60);
  }

  /* ── wybór odpowiedzi ── */
  function choose(card, opt, round) {
    if (locked) return;

    if (opt.id !== round.id) {
      sfxPlay('negatywna');   /* jedna instancja: ponowny klik restartuje od zera */
      card.classList.add('is-wrong');
      card.querySelector('.k16-card__mark').textContent = '✕';
      feedback.className = 'k16-feedback is-err';
      feedback.textContent = round.hint;
      /* zła odpowiedź nie blokuje kolejnej próby */
      later(() => card.classList.remove('is-wrong'), 900);
      return;
    }

    /* poprawnie — pełen cykl maszyny uruchamia się dokładnie raz */
    locked = true;
    card.classList.add('is-correct');
    card.querySelector('.k16-card__mark').textContent = '✓';
    [...cardsBox.children].forEach(c => {
      c.disabled = true;
      if (c !== card) c.classList.add('is-dimmed');
    });
    feedback.className = 'k16-feedback is-ok';
    feedback.textContent = 'Dobrze! Maszyna zaczyna pracę…';
    sfxPlay('poprawna');

    const step = reduce ? 620 : 900;

    /* 1. materiał znika pod lewym przedsionkiem */
    inWrap.classList.remove('is-ready');
    inWrap.classList.add('is-gone');
    machine.dataset.state = 'work';
    /* dźwięki doklejone do istniejącej osi czasu (bez zmiany logiki):
       wjazd tuż po sygnale sukcesu, pętla gdy maszyna widocznie pracuje */
    later(() => sfxPlay('wjazd'), 150);
    later(() => sfxPlay('loop'), 520);

    /* 2. etapy: ROZDZIELANIE → OCZYSZCZANIE → PRZETWARZANIE */
    STAGES.forEach((s, i) => {
      later(() => {
        screenTxt.textContent = s;
        lamps.forEach((l, k) => l.classList.toggle('is-on', k <= i));
      }, 520 + i * step);
    });

    /* pętla maszyny cichnie (fade ~150 ms) tuż PRZED wyjazdem produktu */
    later(() => sfxStopLoop(true), 520 + STAGES.length * step - 180);

    /* 3. produkt wyjeżdża spod prawego przedsionka */
    later(() => {
      sfxPlay('wyjazd');
      screenTxt.textContent = 'GOTOWE';
      lamps.forEach(l => l.classList.add('is-on'));
      machine.dataset.state = 'done';
      outImg.src = IMG + round.outputSrc;
      outImg.alt = '';
      fallback(outImg, round.outputName);
      outWrap.classList.add('is-out');
    }, 520 + STAGES.length * step);

    /* 4. wyjaśnienie i przejście dalej */
    later(() => {
      solved++;
      paintDots();
      feedback.className = 'k16-feedback is-ok';
      feedback.innerHTML = '<b>' + round.inputName + ' → ' + round.outputName + '.</b> ' + round.why;

      if (solved >= ROUNDS.length) {
        feedback.innerHTML += '<br>Materiały dopasowane. Ostatni trop to litera K.';
        btnSave.hidden = false;
        btnSave.focus();
      } else {
        btnNext.hidden = false;
        btnNext.focus();
      }
    }, 520 + STAGES.length * step + (reduce ? 400 : 900));
  }

  /* ── sterowanie ── */
  btnNext.addEventListener('click', () => {
    if (idx < ROUNDS.length - 1) { idx++; startRound(); }
  });

  btnSave.addEventListener('click', () => {
    btnSave.disabled = true;
    btnSave.textContent = 'Litera K przekazana ✓';
    /* Kontrakt integracyjny: prototyp NIE zapisuje do localStorage. */
    document.dispatchEvent(new CustomEvent('k16:completed', {
      detail: { letter: 'K', completedRounds: solved, totalRounds: ROUNDS.length }
    }));
  });

  /* ── start ── */
  function init() {
    order = shuffle(ROUNDS.map((_, i) => i));
    idx = 0; solved = 0;
    preloadRound(0);
    startRound();
  }

  init();

  /* podgląd dla integracji i testów */
  window.K16 = {
    get round() { return idx + 1; },
    get solved() { return solved; },
    get current() { return ROUNDS[order[idx]]; },
    restart: init
  };
})();
