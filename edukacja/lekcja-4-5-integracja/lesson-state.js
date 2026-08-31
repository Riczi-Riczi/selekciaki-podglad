/* ═══════════════════════════════════════════════════════════════════
   LK45-INT — CENTRALNY STAN LEKCJI (K01–K18)
   Strona integracyjna. Własne, jednoznaczne klucze storage — NIE dotyka
   `lk45_letters`, `lk45_agent_no` ani kluczy prototypów.

   Rozdzielone gałęzie stanu (wymóg promptu):
     visitedBlocks          — odwiedzone obowiązkowe klocki narracyjne
     completedInteractions  — realnie ukończone interakcje (K07, K09, K13, K14…)
     checkpointLetters      — P/S/Z/O/K (dopiero po wpisaniu litery przez ucznia)
     audioMode              — read | both  (Etap A3: „Słucham" usunięty)
     finalUnlocked          — wynik podwójnego warunku, nigdy „na skróty”

   Zasada: samo wejście w viewport ≠ ukończenie gry. Sekcja narracyjna może
   zostać oznaczona jako odwiedzona po stabilnej obecności w widoku; interakcje
   wymagają prawdziwego zdarzenia ukończenia.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const NS = (window.LK45I = window.LK45I || {});

  /* ── tryb podglądu ── */
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "1";

  /* ── klucze storage (nowe, oddzielne dla obu trybów) ── */
  const KEY_NORMAL  = "lk45int_state_v1";
  const KEY_PREVIEW = "lk45int_preview_state_v1";
  const KEY_AUDIO   = "lk45int_audio_mode";   // sessionStorage — wspólne urządzenie szkolne

  /* Litera ↔ klocek. Kolejność pól postępu = kolejność w lekcji. */
  const LETTERS = [
    { letter: "P", block: "k04", label: "Agent śledczy w kanalizacji" },
    { letter: "S", block: "k06", label: "Przeszukanie kuchni" },
    { letter: "Z", block: "k08", label: "Złap zużyty olej" },
    { letter: "O", block: "k15", label: "Obsłuż PSZOK" },
    { letter: "K", block: "k16", label: "Drugie życie materiałów" },
  ];

  /* Obowiązkowa ścieżka do finału: wszystkie klocki K01–K16.
     Klocki narracyjne zaliczamy obecnością, interakcyjne — zdarzeniem. */
  const REQUIRED_BLOCKS = [
    "k01","k02","k03","k04","k05","k06","k07","k08",
    "k09","k10","k11","k12","k13","k14","k15","k16",
  ];
  /* Klocki, których NIE wolno zaliczyć samym scrollem */
  const REQUIRED_INTERACTIONS = ["k04","k06","k07","k08","k09","k13","k14","k15","k16"];

  const emptyState = () => ({
    visitedBlocks: [],
    completedInteractions: [],
    lettersReady: [],                       // litery odblokowane do wpisania
    checkpointLetters: { P:false, S:false, Z:false, O:false, K:false },
    audioMode: "read",
    finalUnlocked: false,
    /* Etap 6A: stempel „SPRAWA ZAMKNIĘTA" na tablicy. Warunek jest
       DWUCZĘŚCIOWY — komplet dowodów (finalUnlocked) ORAZ domknięcie
       finału w Tropie 9. Starsze zapisy dostają wartość domyślną,
       bo load() scala je z emptyState(). */
    caseClosed: false,
  });

  const store = PREVIEW ? window.sessionStorage : window.localStorage;
  const KEY   = PREVIEW ? KEY_PREVIEW : KEY_NORMAL;

  function load() {
    try {
      const raw = store.getItem(KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const stan = Object.assign(emptyState(), parsed, {
        checkpointLetters: Object.assign(emptyState().checkpointLetters,
          parsed.checkpointLetters || {}),
      });
      /* Etap A3 — MIGRACJA TRYBU. Zostały dwa tryby: „Czytam" i „Czytam
         i słucham". Uczeń, który miał zapisane „Słucham", dostaje tryb
         najbliższy jego wyborowi (z dźwiękiem), a nie ciszę. Postęp
         pozostaje nietknięty — normalizujemy WYŁĄCZNIE to jedno pole. */
      if (stan.audioMode === "listen") stan.audioMode = "both";
      if (stan.audioMode !== "read" && stan.audioMode !== "both") stan.audioMode = "read";
      return stan;
    } catch (e) { return emptyState(); }   // uszkodzony wpis nie może wywrócić lekcji
  }

  const state = load();

  /* tryb audio żyje w sessionStorage niezależnie od reszty stanu */
  try {
    /* Etap A3: ten magazyn też normalizujemy — inaczej zapisane „Słucham"
       wracałoby po każdym odświeżeniu i cicho unieważniało migrację
       ze snapshotu stanu. */
    const m = window.sessionStorage.getItem(KEY_AUDIO);
    if (m === "read" || m === "both") state.audioMode = m;
    else if (m === "listen") {
      state.audioMode = "both";
      window.sessionStorage.setItem(KEY_AUDIO, "both");
    }
 } catch (e) { /* prywatny tryb przeglądarki */ }

  function persist() {
    try { store.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota/prywatny */ }
  }

  /* Migracja trybu (Etap A3) zapisuje się OD RAZU. Bez tego stary zapis
     „listen" siedziałby w magazynie aż do pierwszej zmiany ustawienia —
     działałoby dobrze, ale stan na dysku kłamałby o tym, co widzi uczeń. */
  try {
    const raw = store.getItem(KEY);
    if (raw && JSON.parse(raw).audioMode !== state.audioMode) persist();
  } catch (e) { /* uszkodzony wpis obsłuży load() przy następnym wejściu */ }

  /* ── nasłuch zmian ── */
  const listeners = new Set();
  function emit() {
    listeners.forEach(fn => { try { fn(snapshot()); } catch (e) { console.warn(e); } });
  }
  function snapshot() {
    return {
      preview: PREVIEW,
      visitedBlocks: state.visitedBlocks.slice(),
      completedInteractions: state.completedInteractions.slice(),
      lettersReady: state.lettersReady.slice(),
      checkpointLetters: Object.assign({}, state.checkpointLetters),
      audioMode: state.audioMode,
      finalUnlocked: state.finalUnlocked,
      caseClosed: state.caseClosed,
      lettersCount: LETTERS.filter(l => state.checkpointLetters[l.letter]).length,
    };
  }

  /* ═══ API ═══ */

  function visit(blockId) {
    if (!blockId || state.visitedBlocks.includes(blockId)) return;
    state.visitedBlocks.push(blockId);
    persist(); recheckFinal(); emit();
  }

  /** Ukończenie interakcji — TYLKO z prawdziwego zdarzenia modułu/gry. */
  function completeInteraction(blockId) {
    if (!blockId || state.completedInteractions.includes(blockId)) return false;
    state.completedInteractions.push(blockId);
    if (!state.visitedBlocks.includes(blockId)) state.visitedBlocks.push(blockId);
    persist(); recheckFinal(); emit();
    return true;
  }

  /** Gra pokazała literę → pole postępu staje się aktywnym polem wpisania. */
  function unlockLetterEntry(letter) {
    const def = LETTERS.find(l => l.letter === letter);
    if (!def) return false;
    if (state.checkpointLetters[letter]) return false;      // już zaliczona
    if (!state.lettersReady.includes(letter)) state.lettersReady.push(letter);
    persist(); emit();
    return true;
  }

  /** Uczeń wpisuje literę. Zwraca 'ok' | 'wrong' | 'locked' | 'done'. */
  function submitLetter(letter, typed) {
    const def = LETTERS.find(l => l.letter === letter);
    if (!def) return "locked";
    if (state.checkpointLetters[letter]) return "done";
    if (!state.lettersReady.includes(letter)) return "locked";
    if (String(typed || "").trim().toUpperCase() !== letter) return "wrong";
    state.checkpointLetters[letter] = true;
    state.lettersReady = state.lettersReady.filter(l => l !== letter);
    if (!state.completedInteractions.includes(def.block)) {
      state.completedInteractions.push(def.block);
    }
    if (!state.visitedBlocks.includes(def.block)) state.visitedBlocks.push(def.block);
    persist(); recheckFinal(); emit();
    return "ok";
  }

  function setAudioMode(mode) {
    if (!["read","both"].includes(mode)) return;   /* Etap A3: dwa tryby */
    state.audioMode = mode;
    try { window.sessionStorage.setItem(KEY_AUDIO, mode); } catch (e) { /* ignore */ }
    persist(); emit();
  }

  /** PODWÓJNY warunek finału: 5× ✓ ORAZ przejście obowiązkowej ścieżki.
      Sama znajomość hasła PSZOK nigdy nie wystarczy — liter nie da się
      „wpisać z głowy”, bo pole otwiera dopiero zdarzenie ukończenia gry. */
  function recheckFinal() {
    const allLetters = LETTERS.every(l => state.checkpointLetters[l.letter]);
    const allVisited = REQUIRED_BLOCKS.every(b => state.visitedBlocks.includes(b));
    const allInter   = REQUIRED_INTERACTIONS.every(b => state.completedInteractions.includes(b));
    const unlocked   = allLetters && allVisited && allInter;
    if (unlocked !== state.finalUnlocked) { state.finalUnlocked = unlocked; persist(); }
    return unlocked;
  }

  /** Czego jeszcze brakuje do finału — do komunikatu w terminalu. */
  function missingForFinal() {
    return {
      letters: LETTERS.filter(l => !state.checkpointLetters[l.letter]).map(l => l.letter),
      blocks:  REQUIRED_BLOCKS.filter(b => !state.visitedBlocks.includes(b)),
      interactions: REQUIRED_INTERACTIONS.filter(b => !state.completedInteractions.includes(b)),
    };
  }

  /** Reset — wyłącznie w trybie podglądu (wymóg promptu). */
  function reset() {
    if (!PREVIEW) return false;
    Object.assign(state, emptyState());
    try { store.removeItem(KEY); } catch (e) { /* ignore */ }
    try { window.sessionStorage.removeItem(KEY_AUDIO); } catch (e) { /* ignore */ }
    emit();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════
     OBSERWATOR WIDOCZNOŚCI (wspólny dla całej strony)
     Świadomie NIE opieramy się wyłącznie na IntersectionObserver:
     w części środowisk (karta w tle, okno bez kompozycji klatek) IO nie
     raportuje wcale, a wtedy leniwe iframe nigdy by się nie wczytały,
     klocki nie zostałyby zaliczone i finał byłby nie do odblokowania.
     Jeden rejestr + jeden listener scroll/resize liczony z geometrii
     działa deterministycznie i taniej niż kilkanaście osobnych IO.
     ═══════════════════════════════════════════════════════════ */
  const watched = [];
  let ticking = false, lastTs = 0, rafId = 0, timerId = 0;

  function evaluate(ts) {
    ticking = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (timerId) { clearTimeout(timerId); timerId = 0; }
    const now = typeof ts === "number" ? ts : performance.now();
    const dt = lastTs ? Math.min(now - lastTs, 200) : 0;
    lastTs = now;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    /* `bd-on` pojawia się dopiero, gdy silnik tablicy wstanie — a on sam
       waży swoje i na wolnym łączu dojeżdża po modułach. Do tego czasu
       obowiązuje `bd-booting` z `<head>`: strona jest zasłonięta, żeby
       stara lekcja nie mignęła, więc dla ucznia i tak nic nie jest
       widoczne. Stara lekcja (`?legacy=1`) zdejmuje ten znacznik od razu
       przy starcie, zanim obserwatory zdążą się policzyć. */
    const wTablicy = (document.body && document.body.classList.contains("bd-on")) ||
      document.documentElement.classList.contains("bd-booting");

    for (let i = watched.length - 1; i >= 0; i--) {
      const w = watched[i];
      if (!w.el.isConnected) { watched.splice(i, 1); continue; }
      /* TABLICA: w kadrze jest WYŁĄCZNIE to, co siedzi w otwartym rozdziale.
         Warunek zerowej geometrii (niżej) załatwia to dopiero wtedy, gdy
         `<main>` jest już schowany arkuszem tablicy — a arkusz na wolnym
         łączu dojeżdża po module. W tej szczelinie wystarczyło kręcić
         kółkiem, żeby obudzić obserwatory cudzych klocków: ruszała
         sekwencja zlewu i moduły Genially (pomiar zimnego wejścia na
         Fast 3G: 29 klatek ≈ 1,7 MB + ok. 0,4 MB modułów), a `window.load`
         nie miał kiedy wypaść. Rozstrzyga o tym `wTablicy` wyżej — oparty
         na znacznikach obecnych od pierwszej klatki, nie na arkuszu. */
      if (wTablicy && !w.el.closest(".bd-chapterlay")) {
        w.dwelt = 0;
        if (w.inside) {
          w.inside = false;
          try { w.onLeave && w.onLeave(w.el); } catch (e) { console.warn(e); }
        }
        continue;
      }
      const r = w.el.getBoundingClientRect();
      /* ZEROWA GEOMETRIA = element nie jest rozłożony (blok w ukrytym
         `<main>` trybu tablicy, `display:none`, jeszcze niezbudowany).
         Taki prostokąt to 0,0,0,0, a więc przechodził test `near` przy
         KAŻDYM marginesie (0 < vh+m oraz 0 > −m). Skutkiem było leniwe
         doładowywanie gier i sekwencji spoza kadru, a przy grach Genially
         — otwieranie pola litery, zanim uczeń w ogóle zobaczył grę
         (usterka N2, raport 56). Obserwatory z `ratio` były na to odporne
         z natury (dzielą przez wysokość); ten warunek zamyka lukę dla
         obserwatorów opartych na samym marginesie. Element traktujemy jak
         każdy inny „poza kadrem": zerujemy odliczanie i zamykamy pobyt. */
      if (!r.width && !r.height) {
        w.dwelt = 0;
        if (w.inside) {
          w.inside = false;
          try { w.onLeave && w.onLeave(w.el); } catch (e) { console.warn(e); }
        }
        continue;
      }
      const near = r.top < vh + w.margin && r.bottom > -w.margin;
      let ok = near;
      /* WYGASZONY = poza kadrem (Etap A2). Sceny w crossfadzie mają pełną
         geometrię przy `opacity: 0` — uczeń ich nie widzi, ale prostokąt
         mówił „jestem w kadrze". Skutkiem była gra K07, która przy samym
         wejściu w Trop 5 raportowała 83% widoczności i uciszała narrację
         sceny Olejomatu, choć leżała pod nią niewidoczna. Styl liczymy
         dopiero, gdy geometria mówi „blisko" — czyli rzadko. */
      if (ok) {
        /* `checkVisibility` liczy także PRZODKÓW — a wygaszona bywa cała
           scena, nie sam element (K07 leży w wygaszonej scenie crossfade'u).
           Starsze przeglądarki bez tego API sprawdzają przynajmniej sam
           element; zachowanie jest wtedy takie jak przed tą poprawką. */
        if (typeof w.el.checkVisibility === "function") {
          if (!w.el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) ok = false;
        } else {
          const cs = getComputedStyle(w.el);
          if (cs.visibility === "hidden" || +cs.opacity === 0) ok = false;
        }
      }
      if (ok && w.ratio > 0) {
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        const ref = Math.min(r.height || 1, vh);
        ok = ref > 0 && (visible / ref) >= w.ratio;
      }
      if (ok) {
        w.dwelt += dt;
        if (!w.inside && w.dwelt >= w.dwell) {
          w.inside = true;
          try { w.onEnter && w.onEnter(w.el); } catch (e) { console.warn(e); }
          if (w.once) { watched.splice(i, 1); continue; }
        }
      } else {
        w.dwelt = 0;
        if (w.inside) {
          w.inside = false;
          try { w.onLeave && w.onLeave(w.el); } catch (e) { console.warn(e); }
        }
      }
    }
    /* pętla trwa tylko dopóki ktoś odlicza czas stabilnej obecności —
       poza tym czekamy na zdarzenie scroll/resize (zero pracy w spoczynku) */
    if (watched.some(w => w.dwell > 0 && w.dwelt > 0 && !w.inside)) schedule();
  }

  /* rAF + strażnik czasowy: w części środowisk (karta w tle, okno bez
     kompozycji klatek) rAF nie tyka wcale — wtedy pracę wykonuje timeout.
     Ten, który zadziała pierwszy, kasuje drugi. */
  function schedule() {
    if (ticking) return;
    ticking = true;
    rafId = requestAnimationFrame(evaluate);
    timerId = setTimeout(evaluate, 200);
  }

  function watch(el, opts) {
    if (!el) return;
    watched.push({
      el,
      ratio:  opts.ratio  || 0,
      margin: opts.margin || 0,
      dwell:  opts.dwell  || 0,
      once:   !!opts.once,
      onEnter: opts.onEnter,
      onLeave: opts.onLeave,
      inside: false, dwelt: 0,
    });
    schedule();
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  NS.util = { watch };

  /** Domknięcie sprawy: stempel na tablicy. Zapala się TYLKO razem
      z kompletem dowodów, więc samo dojście do finału nie wystarczy.
      Idempotentne — powtórne wywołanie nie emituje zmiany. */
  function closeCase() {
    if (state.caseClosed) return false;
    if (!recheckFinal()) return false;
    state.caseClosed = true;
    persist(); emit();
    return true;
  }

  NS.state = {
    PREVIEW, LETTERS, REQUIRED_BLOCKS, REQUIRED_INTERACTIONS,
    get: snapshot,
    visit, completeInteraction, unlockLetterEntry, submitLetter,
    setAudioMode, recheckFinal, missingForFinal, reset, closeCase,
    isCompleted: (b) => state.completedInteractions.includes(b),
    isVisited:   (b) => state.visitedBlocks.includes(b),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
