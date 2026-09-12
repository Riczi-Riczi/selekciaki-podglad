/* ═══════════════════════════════════════════════════════════════════
   LK45-INT — CENTRALNY STAN LEKCJI (K01–K18)
   Strona integracyjna. Własne, jednoznaczne klucze storage — NIE dotyka
   `lk45_letters`, `lk45_agent_no` ani kluczy prototypów.

   Rozdzielone gałęzie stanu (wymóg promptu):
     visitedBlocks          — odwiedzone obowiązkowe klocki narracyjne
     completedInteractions  — realnie ukończone interakcje (K07, K09, K13, K14…)
     checkpointLetters      — O/B/I/E/G (tablica: `awardLetter` po wygranej;
                              ?legacy=1: `submitLetter` po wpisaniu przez ucznia)
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

  /* Litera ↔ klocek. Kolejność pól postępu = kolejność w lekcji.

     ETAP H: hasłem lekcji jest OBIEG, nie PSZOK. Powód jest merytoryczny —
     „PSZOK" to nazwa punktu zbiórki, którą Trop 7 tłumaczy jako skrót
     (Punkt Selektywnej Zbiórki Odpadów Komunalnych). To samo słowo w roli
     hasła kazało uczniowi trzymać w głowie dwa różne znaczenia naraz.
     „OBIEG" nazywa to, czego lekcja uczy, i nie koliduje z niczym. */
  const LETTERS = [
    { letter: "O", block: "k04", label: "Agent śledczy w kanalizacji" },
    { letter: "B", block: "k06", label: "Przeszukanie kuchni" },
    { letter: "I", block: "k08", label: "Złap zużyty olej" },
    { letter: "E", block: "k15", label: "Obsłuż PSZOK" },
    { letter: "G", block: "k16", label: "Drugie życie materiałów" },
  ];

  /* Stare hasło → nowe, PO KLOCKACH. Uczeń, który zaczął lekcję na wydaniu
     05, ma w przeglądarce litery P/S/Z/O/K; gdyby scalić je wprost, „O"
     znaczyłoby co innego niż znaczyło (dawniej PSZOK, dziś Rurociąg) i
     postęp byłby przekłamany. Mapujemy więc przez klocek, który literę
     przyznał — to jedyne odwzorowanie, które nie gubi ani nie zmyśla
     ukończonej gry. */
  const STARE_LITERY = { P: "O", S: "B", Z: "I", O: "E", K: "G" };
  const WERSJA_HASLA = 2;

  /* Obowiązkowa ścieżka do finału: wszystkie klocki K01–K16.
     Klocki narracyjne zaliczamy obecnością, interakcyjne — zdarzeniem. */
  const REQUIRED_BLOCKS = [
    "k01","k02","k03","k04","k05","k06","k07","k08",
    "k09","k10","k11","k12","k13","k14","k15","k16",
  ];
  /* Klocki, których NIE wolno zaliczyć samym scrollem */
  const REQUIRED_INTERACTIONS = ["k04","k06","k07","k08","k09","k13","k14","k15","k16"];

  /* ═══ ETAP P (A04): IDENTYFIKATOR → NAZWA ZADANIA → TROP ═══════════
     Terminal mówił dotąd „niedokończone zadania: K07, K09" — kodem, który
     poza kodem źródłowym nic nie znaczy. Uczeń klas 4–5 nie ma jak
     odgadnąć, do czego wrócić, a słowo „klocek" jest wewnętrzną nazwą
     redakcyjną i nie ma prawa pojawić się w interfejsie.

     Ta mapa jest JEDYNYM źródłem nazw zadań: czyta z niej terminal
     (obie odmiany lekcji), panel „Zadanie czeka" na stronie tropu
     i przycisk „Kontynuuj" na tablicy. `trop` wskazuje rozdział tablicy,
     `nr` — numer tropu widoczny dla ucznia. */
  const ZADANIA = {
    k01: { nazwa: "Otwarcie sprawy",             trop: "p01", nr: 1 },
    k02: { nazwa: "Nagranie: początek sprawy",   trop: "p02", nr: 2 },
    k03: { nazwa: "Odprawa",                     trop: "p02", nr: 2 },
    k04: { nazwa: "Agent śledczy w kanalizacji", trop: "p03", nr: 3 },
    k05: { nazwa: "Odkryty dowód: olej w rurze", trop: "p03", nr: 3 },
    k06: { nazwa: "Przeszukanie kuchni",         trop: "p04", nr: 4 },
    k07: { nazwa: "Ułóż drogę butelki",          trop: "p05", nr: 5 },
    k08: { nazwa: "Złap zużyty olej",            trop: "p04", nr: 4 },
    k09: { nazwa: "Co może trafić do butelki?",  trop: "p05", nr: 5 },
    k10: { nazwa: "Olej rusza w dalszą drogę",   trop: "p05", nr: 5 },
    k11: { nazwa: "Skala problemu",              trop: "p06", nr: 6 },
    k12: { nazwa: "Ślady w lesie",               trop: "p06", nr: 6 },
    k13: { nazwa: "Co kryje się za skrótem?",    trop: "p07", nr: 7 },
    k14: { nazwa: "Spacer po PSZOK",             trop: "p07", nr: 7 },
    k15: { nazwa: "Obsłuż PSZOK",                trop: "p07", nr: 7 },
    k16: { nazwa: "Drugie życie materiałów",     trop: "p08", nr: 8 },
  };

  const emptyState = () => ({
    visitedBlocks: [],
    completedInteractions: [],
    lettersReady: [],                       // litery odblokowane do wpisania
    checkpointLetters: { O:false, B:false, I:false, E:false, G:false },
    hasloV: WERSJA_HASLA,                   // Etap H — znacznik wersji hasła
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
      /* ETAP H — MIGRACJA HASŁA. Zapis sprzed zmiany nie ma `hasloV`, więc
         przepisujemy jego litery przez klocki (patrz STARE_LITERY). Robimy
         to PRZED scaleniem, żeby stare klucze nie weszły do stanu: nowy
         zestaw nie zawiera S, Z ani K, a „O" znaczy dziś inny klocek. */
      if (parsed && parsed.hasloV !== WERSJA_HASLA) {
        const stareCL = parsed.checkpointLetters || {};
        const noweCL = {};
        Object.keys(STARE_LITERY).forEach((stara) => {
          if (stareCL[stara]) noweCL[STARE_LITERY[stara]] = true;
        });
        parsed.checkpointLetters = noweCL;
        parsed.lettersReady = (parsed.lettersReady || [])
          .map((l) => STARE_LITERY[l] || l)
          .filter((l) => LETTERS.some((d) => d.letter === l));
        parsed.hasloV = WERSJA_HASLA;
      }
      const stan = Object.assign(emptyState(), parsed, {
        checkpointLetters: Object.assign(emptyState().checkpointLetters,
          parsed.checkpointLetters || {}),
      });
      /* ETAP P (A14) — TRYB AUDIO NIE DZIEDZICZY SIĘ MIĘDZY SESJAMI.
         Tu była ta jedna ścieżka, którą „Czytam i słucham" wracało w nowej
         karcie: `Object.assign` wyżej brał `audioMode` ze snapshotu
         w localStorage, więc wybór sprzed tygodnia obowiązywał ucznia,
         który dopiero siadł do lekcji — a przy wspólnym komputerze
         szkolnym był to wybór KOGOŚ INNEGO. Każda sesja karty zaczyna
         więc od „Czytam"; jedynym magazynem wyboru jest sessionStorage
         (niżej), a `persist()` tego pola już nie zapisuje.
         Migracja „Słucham" → „Czytam i słucham" (Etap A3) dotyczy odtąd
         wyłącznie zapisu sesyjnego. */
      stan.audioMode = "read";
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
    try {
      /* ETAP P (A14): `audioMode` NIE trafia do pamięci trwałej. Gdyby
         trafiał, `load()` musiałby go tam co wejście ignorować — a jeden
         przeoczony `Object.assign` przywróciłby usterkę. Prościej i
         pewniej: pole po prostu nie istnieje na dysku. */
      const doZapisu = Object.assign({}, state);
      delete doZapisu.audioMode;
      store.setItem(KEY, JSON.stringify(doZapisu));
    } catch (e) { /* quota/prywatny */ }
  }

  /* Migracje zapisują się OD RAZU. Bez tego stary zapis siedziałby
     w magazynie aż do pierwszej zmiany stanu — działałoby dobrze, ale stan
     na dysku kłamałby o tym, co widzi uczeń. Dotyczy: hasła (Etap H) oraz
     usunięcia pola `audioMode` z zapisu (Etap P, A14). */
  try {
    const raw = store.getItem(KEY);
    const zapisany = raw ? JSON.parse(raw) : null;
    if (zapisany && (zapisany.hasloV !== WERSJA_HASLA
                     || Object.prototype.hasOwnProperty.call(zapisany, "audioMode"))) persist();
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

  /** Litera przyznana ZDARZENIEM GRY (Etap S1.A — tryb tablicy).
      Robi dokładnie to, co udane `submitLetter`, tylko bez kroku wpisywania:
      uczeń nic nie przepisuje, bo w nowej belce nie ma pól. Idempotentna —
      powtórne wygrane niczego nie zmieniają.

      ŚWIADOMA KONSEKWENCJA. Dotąd `recheckFinal` żądał liter ORAZ ukończonych
      interakcji, a litery dało się zdobyć wyłącznie przepisując je z ekranu
      gry. Teraz literę przyznaje to samo zdarzenie, które zalicza klocek,
      więc człon „pięć ✓" jest implikowany przez człon interakcji i warunek
      finału faktycznie staje się POJEDYNCZY. Finał nie robi się łatwiejszy:
      zostają k07, k09, k13, k14 i komplet odwiedzonych klocków, których żadna
      litera nie pokrywa. Znika natomiast bariera „uczeń zna hasło OBIEG,
      ale gry nie przeszedł" — bo tej pilnowało właśnie wpisywanie.

      Wariant `?legacy=1` tej drogi nie używa: tam nadal działa `submitLetter`. */
  function awardLetter(letter) {
    const def = LETTERS.find(l => l.letter === letter);
    if (!def) return false;
    if (state.checkpointLetters[letter]) return false;      // już zdobyta
    state.checkpointLetters[letter] = true;
    state.lettersReady = state.lettersReady.filter(l => l !== letter);
    if (!state.completedInteractions.includes(def.block)) {
      state.completedInteractions.push(def.block);
    }
    if (!state.visitedBlocks.includes(def.block)) state.visitedBlocks.push(def.block);
    persist(); recheckFinal(); emit();
    return true;                                            // true = zdobyta TERAZ
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

  /** Warunek finału: 5× ✓ ORAZ przejście obowiązkowej ścieżki.
      W wariancie `?legacy=1` te dwa człony są niezależne — litery wpisuje
      uczeń, więc sama znajomość hasła OBIEG nie wystarczy. W trybie tablicy
      (Etap S1.A) litery przyznaje `awardLetter` na zdarzenie gry, więc człon
      liter jest implikowany przez człon interakcji; realną bramą zostają
      k07, k09, k13, k14 i komplet odwiedzonych klocków. Kod jest wspólny —
      różni się tylko droga, którą litera wpada do `checkpointLetters`. */
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

  /** ETAP P (A04): czego uczniowi brakuje — NAZWAMI ZADAŃ, nie kodami.
      Jedna lista bez powtórzeń, w kolejności lekcji: klocek, któremu
      brakuje i litery, i zaliczenia, jest przecież jednym zadaniem.
      `powod` mówi, czego zabrakło — terminal go dziś nie pokazuje, ale
      bez niego nie da się odróżnić „nie zaczął" od „nie skończył". */
  function zadaniaDoZrobienia() {
    const m = missingForFinal();
    const brakiLiter = m.letters.map((L) =>
      (LETTERS.find((x) => x.letter === L) || {}).block).filter(Boolean);
    const wszystkie = REQUIRED_BLOCKS.filter((b) =>
      brakiLiter.indexOf(b) >= 0 || m.interactions.indexOf(b) >= 0 || m.blocks.indexOf(b) >= 0);
    return wszystkie.map((b) => {
      const z = ZADANIA[b] || {};
      return {
        id: b,
        nazwa: z.nazwa || b.toUpperCase(),
        trop: z.trop || null,
        nr: z.nr || null,
        powod: brakiLiter.indexOf(b) >= 0 ? "litera"
             : m.interactions.indexOf(b) >= 0 ? "zadanie" : "obejrzenie",
      };
    });
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

  /** ETAP P (A02): „Zacznij od nowa" — świadome wyczyszczenie WSZYSTKIEGO.
      Różni się od `reset()` tym, że działa w normalnym trybie: skoro postęp
      przeżywa zamknięcie przeglądarki, uczeń (albo kolejna klasa przy tym
      samym komputerze) musi mieć jak zacząć od czystej tablicy. Kasujemy
      litery, zaliczenia, odwiedziny i tryb audio; stany tropów tablicy
      wynikają z tego stanu, więc znikają razem z nim. Potwierdzenie należy
      do interfejsu — tutaj jest już wyłącznie wykonanie. */
  function resetAll() {
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
    PREVIEW, LETTERS, REQUIRED_BLOCKS, REQUIRED_INTERACTIONS, ZADANIA,
    get: snapshot,
    visit, completeInteraction, unlockLetterEntry, submitLetter, awardLetter,
    setAudioMode, recheckFinal, missingForFinal, zadaniaDoZrobienia,
    reset, resetAll, closeCase,
    isCompleted: (b) => state.completedInteractions.includes(b),
    isVisited:   (b) => state.visitedBlocks.includes(b),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
