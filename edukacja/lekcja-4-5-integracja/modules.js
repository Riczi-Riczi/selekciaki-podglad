/* ═══════════════════════════════════════════════════════════════════
   LK45-INT — MODUŁY KLOCKÓW
   • rejestr komponentów DO UZUPEŁNIENIA (+ symulacja w ?preview=1)
   • most same-origin do prototypów K07 / K08 / K16 (iframe, leniwy)
   • K09 „Kuchenna stacja kontroli”
   • K13 rozwijanie skrótu P–S–Z–O–K
   • sekwencje klatkowe K05 / K10 / K11 i przemiana K12
   Wszystko w czystym JS — sekwencje nie zależą od GSAP (brak biblioteki
   nie może ukryć treści ani zablokować przejścia).
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const NS = (window.LK45I = window.LK45I || {});
  const S  = NS.state;
  const IMG = "../assets/images/lekcja45/";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ═══════════════════════════════════════════════════════════
     1. REJESTR PLACEHOLDERÓW
     Klucz = data-ph w HTML. Rejestr zasila etykiety, listę w raporcie
     i (w preview) kontrolki symulacji punktów kontrolnych.
     ═══════════════════════════════════════════════════════════ */
  const PLACEHOLDERS = {
    "k01-tlo":      { block:"K01", material:"przyciemnione tło z kadru filmu", format:"WebP 1920×1080", folder:"site/assets/images/lekcja45/01-start/" },
    "k02-film":     { block:"K02", material:"film otwierający YouTube",        format:"URL / ID filmu",  folder:"konfiguracja klocka K02" },
    "k02-transkrypcja": { block:"K02", material:"transkrypcja filmu otwierającego", format:"tekst", folder:"konfiguracja klocka K02" },
    "k03-teczka":   { block:"K03", material:"teczka akt / terminal 3D",        format:"WebP z alfą ~1200 px", folder:"site/assets/images/lekcja45/03-odprawa/" },
    /* K04 i K06: gry Genially osadzone 05.08.2026 (patrz initGenially);
       K04 = 6a60646fa4b38d2b26bd3b8a (1:1), K06 = 6974e6d97536a1341bf562c0 (16:9,
       użytkownik będzie ją jeszcze edytował pod tym samym adresem) */
    "k10-pojazd":   { block:"K10", material:"pojazd odbierający olej (opcjonalny symbol)", format:"WebP z alfą", folder:"site/assets/images/lekcja45/10-dalsza-droga-oleju/" },
    "k12-las":      { block:"K12", material:"zoptymalizowane klatki lasu (64–72 WebP)",  format:"WebP 1600 px", folder:"site/assets/images/lekcja45/12-las-przed-po/" },
    "k15-gra":      { block:"K15", material:"gra „Obsłuż PSZOK”",              format:"kod gry + assety", folder:"site/edukacja/gry/pszok/", checkpoint:"O" },
    "k17-terminal": { block:"K17", material:"terminal 3D",                     format:"WebP z alfą", folder:"site/assets/images/lekcja45/17-terminal-final/" },
    "k17-film":     { block:"K17", material:"film finałowy YouTube",           format:"URL / ID filmu", folder:"konfiguracja klocka K17" },
    "k18-detektyw": { block:"K18", material:"postać Eko-Detektywa 3D",         format:"WebP z alfą, pionowa", folder:"site/assets/images/lekcja45/18-dyplom-final/" },
    "k18-dyplom":   { block:"K18", material:"szablon dyplomu",                 format:"PNG/SVG master", folder:"site/assets/images/lekcja45/18-dyplom-final/" },
  };

  function initPlaceholders() {
    document.querySelectorAll("[data-ph]").forEach(node => {
      const key = node.dataset.ph;
      const meta = PLACEHOLDERS[key];
      if (!meta) return;
      const label = node.querySelector(".ph__meta");
      if (label && !label.textContent.trim()) {
        label.textContent = `${meta.block} • ${meta.material}`;
      }
      node.setAttribute("role", "img");
      node.setAttribute("aria-label",
        `Materiał do uzupełnienia: ${meta.material} (klocek ${meta.block}).`);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     2. PUNKTY KONTROLNE BEZ MATERIAŁU (K04, K06, K15)
     Tryb normalny: brak gry = brak litery, koniec dyskusji.
     ?preview=1: każdy placeholder ma WŁASNY przycisk symulacji —
     nie ma jednego „odblokuj wszystko”.
     ═══════════════════════════════════════════════════════════ */
  function initPreviewSimulators() {
    if (!S.PREVIEW) return;
    document.querySelectorAll("[data-simulate]").forEach(btn => {
      const block  = btn.dataset.simulate;              // np. "k04"
      const letter = btn.dataset.simulateLetter || "";  // np. "P"
      btn.hidden = false;
      btn.addEventListener("click", () => {
        S.completeInteraction(block);
        if (letter) S.unlockLetterEntry(letter);
        btn.disabled = true;
        btn.textContent = letter
          ? `Zasymulowano ukończenie — wpisz literę ${letter} w postępie`
          : "Zasymulowano ukończenie";
        NS.ui && NS.ui.announce(letter
          ? `Zasymulowano ukończenie klocka ${block.toUpperCase()}. Pole litery ${letter} jest gotowe do wpisania.`
          : `Zasymulowano ukończenie klocka ${block.toUpperCase()}.`);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     2b. GRY GENIALLY (K04, K06) — iframe zewnętrzny (cross-origin)
     Genially nie wysyła zdarzenia ukończenia do strony. Zgodnie
     z dokumentem 09: ekran końcowy gry pokazuje uczniowi literę,
     a uczeń wpisuje ją w aktywne pole postępu. Dlatego pole litery
     otwiera się z chwilą ZAŁADOWANIA gry (nie samym scrollem) —
     weryfikacją pozostaje znajomość litery z ekranu końcowego,
     a finał i tak chroni podwójna blokada pełnej ścieżki.
     ═══════════════════════════════════════════════════════════ */
  function initGenially() {
    document.querySelectorAll("[data-genially]").forEach(wrap => {
      const id     = wrap.dataset.genially;          // k04 | k06
      const letter = wrap.dataset.letter || "";
      const frame  = wrap.querySelector("iframe");
      const status = wrap.querySelector(".genially__status");
      if (!frame) return;

      const setStatus = (t) => { if (status) status.textContent = t; };

      frame.addEventListener("load", () => {
        if (!frame.src) return;                       // ignoruj pusty start
        wrap.classList.remove("is-loading");
        wrap.classList.add("is-ready");
        setStatus(letter
          ? "Gra gotowa. Po jej ukończeniu wpisz zdobytą literę w polu postępu śledztwa."
          : "Gra gotowa.");
        if (letter) S.unlockLetterEntry(letter);
      });
      frame.addEventListener("error", () => {
        wrap.classList.remove("is-loading");
        setStatus("Nie udało się wczytać gry. Użyj linku awaryjnego pod oknem.");
      });

      /* Leniwe ładowanie zewnętrznego materiału.
         BEZ `once` (N2.1): przy wyjściu z tropu silnik tablicy zdejmuje
         `src`, żeby gra nie grała dalej w ukrytym `<main>` — obserwator
         musi więc przetrwać i doczytać ją ponownie przy powrocie.
         Wielokrotne wejścia są bezpieczne: `onEnter` odpala tylko przy
         przejściu z „poza kadrem" do „w kadrze", a strażnik `!frame.src`
         i tak blokuje drugie ładowanie tej samej ramki. */
      NS.util.watch(wrap, {
        margin: 600,
        onEnter: () => {
          if (frame.dataset.src && !frame.src) {
            wrap.classList.add("is-loading");
            setStatus("Wczytywanie gry…");
            frame.src = frame.dataset.src;
          }
        },
      });
      /* Aktywna gra ucisza narrację strony — ale TYLKO dopóki jest w kadrze.
         Etap A2: bez `onLeave` blokada zapadała przy pierwszym pokazaniu się
         ramki i nikt jej nie zdejmował (zdejmuje ją wyłącznie panel albo
         zmiana trybu), więc w tropach z grą narracja kolejnych scen milczała
         do końca lekcji. Pomiar: wejście w Trop 5 ustawiało blokadę po
         451 ms, zanim uczeń cokolwiek zrobił. */
      NS.util.watch(wrap, {
        ratio: 0.45, dwell: 600,
        onEnter: () => NS.audio.suspend("Narracja wstrzymana — pracuje gra.", wrap),
        onLeave: () => NS.audio.resumeAllowed(),
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     3. MOST DO PROTOTYPÓW (K07, K08, K16) — same-origin iframe
     Iframe chroni zaakceptowany CSS/mechanikę prototypów przed regresją.
     • ładowanie leniwe (dopiero przy zbliżaniu się do sekcji);
     • listener podpinany PO `load`, dokładnie raz na załadowanie;
     • K16 emituje zdarzenie na `document` (bez bubbles) — słuchamy
       na contentWindow ORAZ contentDocument;
     • wysokość dopasowywana do treści → brak drugiego paska przewijania;
     • stan ładowania, błąd i link do otwarcia modułu osobno.
     ═══════════════════════════════════════════════════════════ */
  const FRAMES = {
    /* K06 (Etap A5): gra „Latarka w kuchni" w miejsce materiału Genially.
       Emituje wyłącznie na `window` z `bubbles: true`, więc nasłuch na
       contentWindow i contentDocument daje JEDNO wywołanie (kontrakt
       w README gry). Litera S przychodzi teraz po ukończeniu, a nie —
       jak w wariancie Genially — przy samym załadowaniu ramki. */
    k06: { event:"k06:completed", letter:"S",  title:"Przeszukanie kuchni", root:"#game" },
    /* K07 niesie dodatkowo klipy głosowe kart (Etap A4): `clipEvent` mówi,
       na co nasłuchiwać, `clips` mapuje numer kroku na nagranie. Numeracja
       plików = prawidłowa kolejność drogi butelki, ale karty na ekranie są
       tasowane, więc trafiamy po ID kroku, nigdy po pozycji. */
    k07: { event:"k07:completed", letter:null, title:"Droga butelki",
      clipEvent:"k07:card",
      clips: {
        1: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/01-rejestracja-w-aplikacji.mp3",
        2: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/02-odbior-pustej-butelki.mp3",
        3: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/03-zabranie-butelki-do-domu.mp3",
        4: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/04-przelanie-ostygnietego-oleju.mp3",
        5: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/05-zakrecenie-butelki.mp3",
        6: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/06-oddanie-butelki-do-olejomatu.mp3",
      } },
    k08: { event:"k08:completed", letter:"Z",  title:"Złap zużyty olej" },
    k16: { event:"k16:completed", letter:"K",  title:"Drugie życie materiałów" },
  };

  /* ═══════════════════════════════════════════════════════════
     ETAP 4C — GRA „OBSŁUŻ PSZOK" (K15)

     Gra nie emituje zdarzeń DOM jak K07/K08/K16 — komunikuje się przez
     `postMessage`. Jej kontrakt (README gry):
       { type:'pszok:completed', letter:'O', score, stats, laterCount }
         — dokładnie raz na cykl życia strony, tylko w ramce, tylko
           w trybie podstawowym (scenariusz diagnostyczny go nie wysyła);
       { type:'pszok:return-to-lesson' } — przycisk „WRÓĆ DO LEKCJI".

     Literę przyznaje LEKCJA — gra nie dotyka `localStorage`. Wzorzec
     zaliczenia jest ten sam co przy literze Z po naprawie N1:
     `unlockLetterEntry` wołane przy KAŻDEJ wygranej (jest idempotentne),
     a `completeInteraction` rozstrzyga, czy to pierwsze zaliczenie.
     ═══════════════════════════════════════════════════════════ */
  function initGraPszok() {
    const wrap = document.querySelector("[data-frame-pszok]");
    if (!wrap) return;
    const frame = wrap.querySelector("iframe");
    const sekcja = wrap.closest("section") || document;
    const statusEl = sekcja.querySelector(".frame__status");
    const poGrze = sekcja.querySelector("#k15-po");
    if (!frame) return;

    const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

    /* leniwe ładowanie przy zbliżeniu (wzorzec K08) */
    const zaladuj = () => {
      if (frame.dataset.src && !frame.src) {
        wrap.classList.add("is-loading");
        setStatus("Wczytywanie gry…");
        frame.src = frame.dataset.src;
      }
    };
    /* Obserwator NIE jest jednorazowy: przy wyjściu z tropu silnik rozdziału
       zdejmuje `src` (wzorzec N2.1), więc przy powrocie ramka musi doczytać
       się od nowa. Z `once: true` obserwator znikał po pierwszym wejściu
       i gra zostawała pusta (zmierzone: po powrocie brak src i brak canvasu). */
    NS.util.watch(wrap, { margin: 600, onEnter: zaladuj });
    frame.addEventListener("load", () => {
      wrap.classList.remove("is-loading");
      wrap.classList.add("is-ready");
      setStatus("Gra gotowa.");
    });
    frame.addEventListener("error", () => {
      wrap.classList.remove("is-loading");
      wrap.classList.add("is-error");
      setStatus("Nie udało się wczytać gry. Otwórz ją w nowej karcie — literę O wpiszesz po powrocie.");
    });

    /* aktywna gra wycisza narrację (wzorzec K08); wyjście z kadru zdejmuje
       blokadę — patrz uzasadnienie przy ramkach modułów (Etap A2) */
    NS.util.watch(wrap, {
      ratio: 0.45, dwell: 600,
      onEnter: () => NS.audio.suspend("Narracja wstrzymana — pracuje gra.", wrap),
      onLeave: () => NS.audio.resumeAllowed(),
    });

    /* ── WĄSKI PION: PODPOWIEDŹ O OBRÓCENIU ──
       Gra ma płótno 1600 × 1000 i `Scale.FIT`, więc w pionowej kolumnie
       telefonu kurczy się do ~19% (zmierzone: strefa upuszczenia 36 px
       przy 390 px szerokości okna). Podpowiedź pokazujemy, gdy kadr jest
       węższy niż 60% tego, co dałby ekran w poziomie. Gry nie blokujemy. */
    const obrot = sekcja.querySelector("#pszok-obrot");
    const przeliczObrot = () => {
      if (!obrot) return;
      const dotyk = window.matchMedia("(pointer: coarse)").matches;
      const pion = window.innerHeight > window.innerWidth;
      const wPoziomie = Math.max(window.innerWidth, window.innerHeight);
      const szer = frame.getBoundingClientRect().width;
      obrot.hidden = !(dotyk && pion && szer < 0.6 * wPoziomie);
    };
    przeliczObrot();
    window.addEventListener("resize", przeliczObrot);
    window.addEventListener("orientationchange", przeliczObrot);

    /* ── PEŁNY EKRAN ──
       Tylko na dotyku i tylko gdy Fullscreen API realnie obsługuje
       ELEMENTY (iOS Safari udostępnia je wyłącznie dla wideo — tam
       przycisku nie pokazujemy i zostaje sama podpowiedź o obrocie).
       Wejście i wyjście nie ruszają ramki, więc gra nie traci stanu,
       a nasłuch `pszok:completed` wisi na oknie lekcji — działa dalej. */
    const kadr = sekcja.querySelector("#pszok-kadr");
    const btnPelny = sekcja.querySelector("#pszok-pelny-ekran");
    const zadaj = kadr && (kadr.requestFullscreen || kadr.webkitRequestFullscreen);
    if (btnPelny && kadr && zadaj && document.fullscreenEnabled !== false
        && window.matchMedia("(pointer: coarse)").matches) {
      btnPelny.hidden = false;
      btnPelny.addEventListener("click", () => {
        const wPelnym = document.fullscreenElement || document.webkitFullscreenElement;
        if (wPelnym) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          zadaj.call(kadr).catch(() => { btnPelny.hidden = true; });
        }
      });
      const naZmiane = () => {
        const wPelnym = !!(document.fullscreenElement || document.webkitFullscreenElement);
        btnPelny.textContent = wPelnym ? "Zamknij pełny ekran" : "Pełny ekran";
        przeliczObrot();
      };
      document.addEventListener("fullscreenchange", naZmiane);
      document.addEventListener("webkitfullscreenchange", naZmiane);
    }

    window.addEventListener("message", (e) => {
      /* 1. wyłącznie z NASZEJ ramki, 2. wyłącznie znane typy */
      if (!frame.contentWindow || e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;

      if (d.type === "pszok:completed") {
        const noweZaliczenie = S.completeInteraction("k15");
        S.unlockLetterEntry("O");                 /* przy KAŻDEJ wygranej */
        if (poGrze) poGrze.hidden = false;
        setStatus("Gra ukończona. Wpisz literę O w polu postępu śledztwa.");
        if (!noweZaliczenie) return;              /* ogłoszenie i przewinięcie raz */
        NS.ui && NS.ui.announce("Obsłuż PSZOK: ukończone. Pole litery O czeka na wpisanie.");
        NS.ui && NS.ui.flashProgress();
        wrap.dispatchEvent(new CustomEvent("k15:pierwsza-wygrana", { bubbles: true }));
        return;
      }

      if (d.type === "pszok:return-to-lesson") {
        if (poGrze) poGrze.hidden = false;
        wrap.dispatchEvent(new CustomEvent("k15:powrot", { bubbles: true }));
      }
    });
  }

  function initFrames() {
    document.querySelectorAll("[data-frame]").forEach(wrap => {
      const id   = wrap.dataset.frame;               // k07 | k08 | k16
      const cfg  = FRAMES[id];
      const frame = wrap.querySelector("iframe");
      /* status leży poza .frame (pod ramką) — szukamy w obrębie całej sekcji */
      const statusEl = (wrap.closest("section") || document).querySelector(".frame__status");
      if (!cfg || !frame) return;

      let bound = false;           // osłona przed podwójnym listenerem
      let loadedOnce = false;

      const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

      function bindBridge() {
        let win, doc;
        try { win = frame.contentWindow; doc = frame.contentDocument; }
        catch (e) { setStatus("Moduł działa, ale strona nie może odczytać jego wyniku."); return; }
        if (!win || !doc) return;

        if (!bound) {
          bound = true;
          const onDone = (ev) => {
            /* W trybie tablicy (body.bd-on) zaliczenie obsługuje silnik
               rozdziału (board-stage.js) — jedno źródło nasłuchu, żeby to
               samo zdarzenie nie było przetwarzane dwa razy. W ?legacy=1
               klasa nie występuje i ścieżka działa jak dotąd. */
            if (document.body.classList.contains("bd-on")) return;
            /* Zaliczenie liczy się dokładnie raz, ale POLE LITERY musi się
               otwierać przy każdej wygranej: `completedInteractions` żyje
               w localStorage, więc przy powtórnym przejściu modułu strażnik
               przerywał przed `unlockLetterEntry` i litera nie odblokowywała
               się już nigdy (naprawa N1). `unlockLetterEntry` jest
               idempotentne — litery już wpisanej nie otworzy ponownie. */
            const noweZaliczenie = S.completeInteraction(id);
            if (cfg.letter) S.unlockLetterEntry(cfg.letter);
            setStatus(cfg.letter
              ? `Moduł ukończony. Wpisz literę ${cfg.letter} w polu postępu śledztwa.`
              : "Moduł ukończony.");
            if (!noweZaliczenie) return;               /* ogłoszenie tylko raz */
            NS.ui && NS.ui.announce(cfg.letter
              ? `${cfg.title}: ukończone. Pole litery ${cfg.letter} czeka na wpisanie.`
              : `${cfg.title}: ukończone.`);
            NS.ui && NS.ui.flashProgress();
          };
          /* K07/K08 → window (bubbles), K16 → document (bez bubbles) */
          win.addEventListener(cfg.event, onDone);
          doc.addEventListener(cfg.event, onDone);

          /* Klipy głosowe kart K07 w starej lekcji (Etap A4). W tablicy tę
             samą robotę wykonuje silnik rozdziału, więc tu — jak przy
             zaliczeniu — pilnuje nas strażnik `bd-on`: jedno źródło
             odtwarzania, żeby jedno kliknięcie nie uruchomiło dwóch nagrań.
             Bramka trybu i ścieżki są wspólne z tablicą. */
          if (cfg.clips) {
            const onCard = (ev) => {
              if (document.body.classList.contains("bd-on")) return;
              const d = ev && ev.detail;
              const src = d && cfg.clips[d.id];
              if (!src || !NS.audio || !NS.audio.playClip) return;
              if (S.get().audioMode !== "both") return;
              NS.audio.playClip(src, "Karta: " + (d.label || ""));
            };
            win.addEventListener(cfg.clipEvent, onCard);
            doc.addEventListener(cfg.clipEvent, onCard);
          }
        }

      }

      /* Dopasowanie wysokości ramki.
         Prototypy to pełne strony z `min-height:100vh`, więc naiwny pomiar
         `scrollHeight` narasta w nieskończoność: każde powiększenie ramki
         powiększa 100vh, a to znowu scrollHeight. Dlatego najpierw ściskamy
         ramkę (100 px), żeby zmierzyć samą treść, a potem iterujemy 2 razy —
         layout prototypów zależy od wysokości okna (np. szerokość planszy
         K07), więc druga iteracja domyka wynik. Twardy limit chroni przed
         patologią, a wewnętrzny scroll pozostaje ostatecznym zabezpieczeniem. */
      /* Czy w ramce naprawdę siedzi moduł? Sprawdzamy tylko tam, gdzie
         konfiguracja podaje `root` — pozostałe moduły zachowują dotychczasowe
         zachowanie. Brak dostępu do dokumentu traktujemy jak sukces: przy
         same-origin się nie zdarza, a fałszywy alarm byłby gorszy od ciszy. */
      function modulJest() {
        if (!cfg.root) return true;
        try {
          const doc = frame.contentDocument;
          return !doc || !!doc.querySelector(cfg.root);
        } catch (e) { return true; }
      }

      const H_MIN = 520, H_MAX = 2000;
      function measure(doc) {
        return Math.max(
          doc.documentElement ? doc.documentElement.scrollHeight : 0,
          doc.body ? doc.body.scrollHeight : 0);
      }
      function fitHeight() {
        /* W trybie tablicy wysokość ramki prowadzi silnik rozdziału
           (kadr = ekran minus pasek nawigacyjny) — pomiar względem
           window.innerHeight wprowadzałby drugi pasek przewijania. */
        if (document.body.classList.contains("bd-on")) return;
        try {
          const doc = frame.contentDocument;
          if (!doc || !doc.documentElement) return;
          /* Prototypy to pełne strony z `min-height:100vh`, więc mierzenie
             treści przy ściśniętej ramce zawsze zwróciłoby jej własną
             wysokość. Zaczynamy od wysokości EKRANU rodzica (prototypy są
             projektowane tak, by mieścić się w jednym widoku) i powiększamy
             ramkę tylko wtedy, gdy treść naprawdę wystaje — wtedy rośnie
             ramka, a nie pojawia się drugi pasek przewijania. */
          let h = Math.min(Math.max(Math.round(window.innerHeight * 0.86), H_MIN), 900);
          frame.style.height = h + "px";
          for (let i = 0; i < 2; i++) {
            const sh = measure(doc);
            if (sh <= h + 4) break;                        // mieści się
            h = Math.min(sh, H_MAX);
            frame.style.height = h + "px";
          }
        } catch (e) { /* cross-origin nie wystąpi, ale nie ryzykujemy */ }
      }

      frame.addEventListener("load", () => {
        loadedOnce = true;
        wrap.classList.remove("is-loading");
        /* AWARIA PRZY SAME-ORIGIN (Etap A5): zdarzenie `error` na ramce jest
           przy własnym serwerze prawie zawsze nieme — serwer oddaje stronę
           błędu, więc ramka „wczytuje się" poprawnie i tylko nie ma w niej
           modułu. Dla K06 to nie kosmetyka: gra jest jedynym przejściem do
           sceny K08, więc uczeń bez komunikatu utknąłby w kuchni. */
        if (!modulJest()) {
          wrap.classList.add("is-error");
          setStatus(cfg.letter
            ? "Nie udało się wczytać gry. Otwórz ją w nowej karcie linkiem pod oknem — "
              + `po powrocie literę ${cfg.letter} wpisz samodzielnie w polu postępu śledztwa.`
            : "Nie udało się wczytać modułu. Otwórz go w nowej karcie linkiem pod oknem.");
          return;
        }
        wrap.classList.add("is-ready");
        setStatus("Moduł gotowy.");
        bindBridge();
        fitHeight();
        setTimeout(fitHeight, 600);      // po dociągnięciu grafik
      });

      frame.addEventListener("error", () => {
        wrap.classList.remove("is-loading");
        wrap.classList.add("is-error");
        setStatus("Nie udało się wczytać modułu. Otwórz go w nowej karcie.");
      });

      /* leniwe ładowanie — moduł doczytuje się przy wejściu w scenę.
         W trybie tablicy (body.bd-on) ładowanie prowadzi silnik rozdziału
         (board-stage), który dokleja parametr trybu osadzenia ?embed=board —
         ta ścieżka musi wtedy milczeć, żeby wyścig nie wgrał modułu bez
         parametru. W ?legacy=1 działa jak dotąd. */
      const load = () => {
        if (document.body.classList.contains("bd-on")) return;
        if (frame.dataset.src && !frame.src) {
          wrap.classList.add("is-loading");
          setStatus("Wczytywanie modułu…");
          frame.src = frame.dataset.src;
        }
      };
      /* Etap 5B: `once: true` USUNIĘTE dla wszystkich trzech ramek.
         Tryb tablicy zdejmuje `src` przy wyjściu z tropu (wzorzec N2.1),
         więc jednorazowy obserwator znikał po pierwszym wejściu i moduł
         zostawał pusty po powrocie — dokładnie ta usterka, którą złapaliśmy
         w grze PSZOK (etap 4C). Sam `load` jest bezpieczny do powtarzania:
         wychodzi natychmiast, gdy ramka już ma `src`. */
      NS.util.watch(wrap, { margin: 600, onEnter: load });

      /* aktywna gra ucisza narrację strony; wyjście z kadru zdejmuje blokadę
         (Etap A2 — inaczej narracja milczy do końca lekcji) */
      NS.util.watch(wrap, {
        ratio: 0.45, dwell: 600,
        onEnter: () => NS.audio.suspend("Narracja wstrzymana — pracuje moduł gry.", wrap),
        onLeave: () => NS.audio.resumeAllowed(),
      });

      /* ═══ N4-L — MOST STEROWANIA DLA GRY „ZŁAP KROPLE OLEJU" ═══
         Gra żyje w ramce, więc sama widzi tylko zdarzenia z jej wnętrza:
         mysz poza ramką i klawiatura bez kliknięcia w planszę do niej nie
         docierały. Lekcja przekazuje więc jedno i drugie komunikatami,
         które gra już rozumie (kontrakt w jej README):
           { type: "k08:pointer", xRatio }              — pozycja myszy
           { type: "k08:key", key, down }               — ArrowLeft/Right
         `xRatio` liczymy względem szerokości RAMKI i podajemy bez obcinania
         — clamp jest po stronie gry, dzięki czemu ruch poza ramką dalej
         prowadzi butelkę do krawędzi.
         Most milczy, gdy scena nie jest widoczna albo moduł się nie wczytał. */
      if (id === "k08") {
        let widoczna = false;
        const wyslij = (dane) => {
          if (!loadedOnce) return;
          try { frame.contentWindow.postMessage(dane, "*"); } catch (e) { /* ramka znikła */ }
        };
        const aktywna = () => widoczna && loadedOnce && !!frame.contentWindow;

        NS.util.watch(wrap, {
          ratio: 0.25,
          onEnter: () => { widoczna = true; },
          onLeave: () => {
            widoczna = false;
            /* wychodząc, zwalniamy klawisze — inaczej butelka jechałaby dalej */
            ["ArrowLeft", "ArrowRight"].forEach((key) => wyslij({ type: "k08:key", key, down: false }));
          },
        });

        /* pozycja myszy z CAŁEGO okna, dławiona do jednej klatki */
        let rafRuch = 0, ostatniX = 0;
        const onRuch = (e) => {
          if (!aktywna()) return;
          ostatniX = e.clientX;
          if (rafRuch) return;
          rafRuch = requestAnimationFrame(() => {
            rafRuch = 0;
            const r = frame.getBoundingClientRect();
            if (r.width < 1) return;
            wyslij({ type: "k08:pointer", xRatio: (ostatniX - r.left) / r.width });
          });
        };
        window.addEventListener("pointermove", onRuch, { passive: true });

        /* strzałki: przekazujemy do gry i NIE pozwalamy im przewijać strony
           — ale wyłącznie wtedy, gdy gra jest na ekranie. Poza sceną
           strzałki działają normalnie. */
        const onKlawisz = (e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          if (!aktywna()) return;
          if (e.repeat && e.type === "keydown") { e.preventDefault(); return; }
          e.preventDefault();
          wyslij({ type: "k08:key", key: e.key, down: e.type === "keydown" });
        };
        window.addEventListener("keydown", onKlawisz);
        window.addEventListener("keyup", onKlawisz);
      }

      /* ═══ MOST STEROWANIA DLA GRY „LATARKA W KUCHNI" (Etap A5) ═══
         Ten sam problem co w K08 — mysz poza ramką i klawiatura bez
         kliknięcia w kadr nie docierają do gry — ale latarka chodzi po
         DWÓCH osiach, więc most podaje `xRatio` i `yRatio` oraz cztery
         strzałki zamiast dwóch (kontrakt w README gry).
         Proporcje liczymy względem prostokąta RAMKI i nie obcinamy —
         clamp jest po stronie gry, dzięki czemu kursor wyprowadzony poza
         kadr trzyma latarkę przy krawędzi, zamiast ją gubić.
         Most milczy, gdy jego ramka jest poza kadrem: w Tropie 4 stoją
         obok siebie dwie gry i strzałki nie mogą sterować obiema naraz. */
      if (id === "k06") {
        let widoczna = false;
        const KLAWISZE = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
        const wyslij = (dane) => {
          if (!loadedOnce) return;
          try { frame.contentWindow.postMessage(dane, "*"); } catch (e) { /* ramka znikła */ }
        };
        const aktywna = () => widoczna && loadedOnce && !!frame.contentWindow;

        NS.util.watch(wrap, {
          ratio: 0.25,
          onEnter: () => { widoczna = true; },
          onLeave: () => {
            widoczna = false;
            /* wychodząc, zwalniamy wszystkie kierunki — inaczej światło
               jechałoby dalej po opuszczeniu sceny */
            KLAWISZE.forEach((key) => wyslij({ type: "k06:key", key, down: false }));
          },
        });

        let rafRuch = 0, ostatniX = 0, ostatniY = 0;
        const onRuch = (e) => {
          if (!aktywna()) return;
          ostatniX = e.clientX; ostatniY = e.clientY;
          if (rafRuch) return;
          rafRuch = requestAnimationFrame(() => {
            rafRuch = 0;
            const r = frame.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            wyslij({ type: "k06:pointer",
              xRatio: (ostatniX - r.left) / r.width,
              yRatio: (ostatniY - r.top) / r.height });
          });
        };
        window.addEventListener("pointermove", onRuch, { passive: true });

        const onKlawiszK06 = (e) => {
          if (KLAWISZE.indexOf(e.key) < 0) return;
          if (!aktywna()) return;
          if (e.repeat && e.type === "keydown") { e.preventDefault(); return; }
          e.preventDefault();
          wyslij({ type: "k06:key", key: e.key, down: e.type === "keydown" });
        };
        window.addEventListener("keydown", onKlawiszK06);
        window.addEventListener("keyup", onKlawiszK06);
      }

      window.addEventListener("resize", () => { if (loadedOnce) fitHeight(); });

      /* przejście na tryb „Czytam" zatrzymuje grające nagranie polecenia
         K07; pozostałe zmiany trybu niczego nie uruchamiają (Etap 2B.1) */
    });
  }

  /* ═══════════════════════════════════════════════════════════
     4. K09 — KUCHENNA STACJA KONTROLI
     11 luźnych obiektów; sterowanie: przeciąganie, przyciski tekstowe,
     klawiatura (strzałki + Enter). Błędny obiekt skierowany do butelki
     wraca z wyjaśnieniem i musi trafić na podstawkę „Nie do Olejomatu”.
     ═══════════════════════════════════════════════════════════ */
  /* Model gry (Etap 2D): jedna lista dla OBU prezentacji — legacy i tablicy.
     `ok` decyduje o kierunku, `yes` to potwierdzenie po trafnej decyzji
     (każdy produkt tłumaczy się inaczej, bez powtarzanej formuły),
     `why` — wyjaśnienie przy produktach spoza zbiórki, `fat` włącza
     rozwinięcie o bezpiecznym postępowaniu z tłuszczami stałymi. */
  const K09_ITEMS = [
    { file:"zuzyty-olej-po-smazeniu.webp",        name:"Zużyty olej po smażeniu", ok:true,
      yes:"Tak — to klasyczny zużyty olej spożywczy. Po wystudzeniu przelewamy go do zielonej butelki." },
    { file:"olej-silnikowy.webp",                 name:"Olej silnikowy", ok:false,
      why:"Olej silnikowy to odpad niebezpieczny. Nie wolno mieszać go z olejem jadalnym." },
    { file:"olej-z-zalewy.webp",                  name:"Olej z zalewy, np. po sardynkach", ok:true,
      yes:"Tak — olej z zalewy to też tłuszcz spożywczy. Odcedź go od resztek ryby i warzyw." },
    { file:"woda-z-detergentem.webp",             name:"Woda z detergentem", ok:false,
      why:"Woda i detergent zanieczyszczają zebrany olej i utrudniają jego dalsze wykorzystanie." },
    { file:"przeterminowany-olej-roslinny.webp",  name:"Przeterminowany olej roślinny", ok:true,
      yes:"Tak — przeterminowany olej nadaje się do zbiórki. Nie musi być świeży, musi być spożywczy." },
    { file:"paliwo.webp",                         name:"Paliwo", ok:false,
      why:"Paliwo jest łatwopalne i niebezpieczne. Nie trafia do butelki Olejomatu." },
    { file:"zjelczale-maslo-inne-tluszcze.webp",  name:"Masło, smalec lub margaryna", ok:true, fat:true,
      yes:"Tak — to tłuszcz spożywczy. Roztop go z pomocą osoby dorosłej, przestudź i przelej do butelki, gdy jest jeszcze płynny, ale nie gorący." },
    { file:"smar-do-lanczucha.webp",              name:"Smar do łańcucha", ok:false,
      why:"To smar techniczny, a nie tłuszcz spożywczy." },
    { file:"oliwa-bez-domieszek.webp",            name:"Przeterminowana oliwa bez domieszek", ok:true,
      yes:"Tak — czysta oliwa bez dodatków to olej spożywczy jak każdy inny." },
    { file:"smar-do-maszyn.webp",                 name:"Smar do maszyn", ok:false,
      why:"Smary maszynowe to chemia techniczna — oddaj je w punkcie zbiórki takich odpadów." },
    { file:"zup-sosow.webp",                      name:"Zupy, sosy i majonezy", ok:false,
      why:"To resztki jedzenia, a nie czysty tłuszcz. Zabrudziłyby zebrany olej." },
  ];
  /* liczba produktów do zbiórki — po nich butelka jest wizualnie pełna */
  const K09_DO_ZBIORKI = K09_ITEMS.filter((i) => i.ok).length;
  /* Plateau po TRAFNEJ decyzji (Aneks A raportu 52): tyle czasu wyjaśnienie
     „Tak — …”/„✓ …” zostaje na scenie, zanim wejdzie kolejny produkt.
     To czas na CZYTANIE, nie animacja — obowiązuje też przy ograniczonym
     ruchu. Błędna decyzja (faza mustReject) nie korzysta z plateau: jej
     wyjaśnienie i tak stoi do chwili odesłania produktu. */
  const K09_PLATEAU_MS = 1800;

  function initK09() {
    const root = document.getElementById("k09-game");
    if (!root) return;

    const stage   = root.querySelector(".k09__object");
    const nameEl  = root.querySelector(".k09__name");
    const fbEl    = root.querySelector(".k09__feedback");
    const fill    = root.querySelector(".k09__fill-bar");
    const counter = root.querySelector(".k09__counter");
    const btnOk   = root.querySelector('[data-k09="bottle"]');
    const btnNo   = root.querySelector('[data-k09="reject"]');
    const zoneOk  = root.querySelector(".k09__zone--bottle");
    const zoneNo  = root.querySelector(".k09__zone--reject");
    const doneBox = root.querySelector(".k09__done");
    /* hooki wariantu tablicy — w legacy po prostu ukryte przez CSS,
       więc kontroler nie musi wiedzieć, w którym trybie działa */
    const olej    = root.querySelector(".k09s__olej");
    const wiecej  = root.querySelector(".k09__wiecej");
    const klatka  = root.querySelector(".k09sc__klatka");
    const scenaBut = root.querySelector(".k09sc--bottle");

    let queue = K09_ITEMS.slice();
    let idx = 0;
    let resolved = 0;            // ocenione produkty (0..11)
    let zebrane = 0;             // produkty, które trafiły do butelki (0..5)
    let mustReject = false;      // błędny obiekt czeka na odesłanie na podstawkę
    let plateau = false;         // okno czytania po trafnej decyzji — decyzje wstrzymane
    let finished = false;
    const rm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function current() { return queue[idx]; }

    /* Poziom oleju w butelce = główny wskaźnik postępu (wariant tablicy).
       Geometria korpusu w kadrze 732×882 (Etap 2D.1): od y=425 tuż pod lejkiem
       do y=864 przy dnie — te same liczby, którymi opisana jest maska
       `#k09-korpus` w HTML, więc olej nigdy nie wychodzi poza szkło.

       Tu i TYLKO tu ustawiamy `--k09-zebrane`: prezentacja postępu ma jedno
       źródło prawdy, a nie dwa rozjeżdżające się liczniki. */
    function poziomButelki() {
      const p = Math.min(1, zebrane / K09_DO_ZBIORKI);
      root.style.setProperty("--k09-zebrane", p.toFixed(3));
      root.classList.toggle("is-pelna", p >= 1);
      if (!olej) return;
      const DNO = 864, GORA = 425;
      const h = Math.round((DNO - GORA) * p);
      olej.setAttribute("height", h);
      olej.setAttribute("y", DNO - h);
    }

    /* ═══ FINAŁ: zakręcanie butelki, 38 klatek po 80 ms (3,04 s) ═══
       Jeden przebieg, bez pętli. Świadomie NIE korzystamy z `frameSequence`:
       tamten silnik przewija klatki scrollem, a tutaj animacja jest skutkiem
       decyzji ucznia i ma iść w stałym tempie niezależnie od pozycji strony.

       Sekwencja jest OZDOBĄ. Zaliczenie klocka, komunikat i zdarzenie
       `k09:completed` lecą w `finish()` przed uruchomieniem animacji, więc
       ani wolne łącze, ani brak plików nie mogą zatrzymać śledztwa. */
    const KLATEK = 38;
    const KLATKA_MS = 80;
    const klatkaSrc = (i) => IMG + "09-stacja-kontroli/butelka-zakrecanie-seq/" +
      "butelka-zakrecanie-" + String(i).padStart(3, "0") + ".webp" +
      (NS.assetVersion || "");
    /* brak | ladowanie | gotowe | blad */
    let klatkiStan = "brak";
    let klatkiCzeka = null;      // finał czekający na rozstrzygnięcie próbki
    const pula = [];             // referencje trzymają obrazy w pamięci

    /* Czy warstwa klatek jest w ogóle rysowana? Pytamy o scenę, nie o tryb —
       kontroler pozostaje jeden i nie wie, czy działa na tablicy, czy w
       starej lekcji (tam `.k09sc` jest ukryta, więc nic nie pobieramy). */
    const rysowana = () => !!scenaBut && (scenaBut.checkVisibility
      ? scenaBut.checkVisibility({ checkVisibilityCSS: true })
      : scenaBut.getClientRects().length > 0);

    function rozstrzygnij(stan) {
      klatkiStan = stan;
      const cb = klatkiCzeka;
      klatkiCzeka = null;
      if (cb) cb(stan === "gotowe");
    }

    function preloadKlatki() {
      if (klatkiStan !== "brak" || !klatka || !rysowana()) return;
      klatkiStan = "ladowanie";
      /* Przy ograniczonym ruchu finał to jedna nieruchoma klatka końcowa —
         pobieranie pozostałych 37 plików (~0,9 MB) byłoby czystą stratą. */
      const tylkoKoncowa = rm();
      const pierwsza = tylkoKoncowa ? KLATEK - 1 : 0;
      /* ta jedna klatka rozstrzyga o dostępności całej sekwencji */
      const probe = new Image();
      probe.onload = () => {
        pula.push(probe);
        if (!tylkoKoncowa) {
          for (let i = 1; i < KLATEK; i++) {
            const im = new Image();
            im.src = klatkaSrc(i);
            pula.push(im);
          }
        }
        rozstrzygnij("gotowe");
      };
      probe.onerror = () => rozstrzygnij("blad");
      probe.src = klatkaSrc(pierwsza);
    }

    /* Choreografia finału (K5.2) — czysta prezentacja. Klasę wpina JEDNA
       funkcja, wywoływana na KAŻDEJ ścieżce zakończenia (pełna sekwencja,
       ograniczony ruch, brak lub błąd klatek). Dzięki temu kompozycja
       końcowa nigdy nie zależy od tego, czy media dojechały. */
    function kompozycjaFinalu() { root.classList.add("is-finalscena"); }

    function zagrajFinal() {
      /* brak warstwy klatek albo pewny brak sekwencji → od razu kompozycja
         (finał świetlny gra niezależnie, na klasie `is-zakrecona`) */
      if (!klatka || !rysowana() || klatkiStan === "blad") { kompozycjaFinalu(); return; }
      if (klatkiStan === "brak") preloadKlatki();
      if (klatkiStan === "ladowanie") {
        /* preload jeszcze w drodze — animacja dołączy, gdy będzie gotowa,
           a gdy się nie uda, wchodzi sama kompozycja */
        klatkiCzeka = (ok) => { if (ok) zagrajFinal(); else kompozycjaFinalu(); };
        return;
      }
      root.classList.add("is-finalfilm");
      /* Ograniczony ruch — a także sytuacja, w której w pamięci wylądowała
         wyłącznie klatka końcowa: pokazujemy sam efekt końcowy, bez ruchu. */
      if (rm() || pula.length < KLATEK) {
        klatka.src = klatkaSrc(KLATEK - 1);
        kompozycjaFinalu();
        return;
      }
      /* Klatki liczymy z zegara, nie z licznika tyknięć: przy zadławionej
         karcie albo wolnym renderze animacja skraca się, zamiast wlec. */
      const start = performance.now();
      let ostatnia = -1;
      const krok = (t) => {
        const i = Math.min(KLATEK - 1, Math.floor((t - start) / KLATKA_MS));
        if (i !== ostatnia) { ostatnia = i; klatka.src = klatkaSrc(i); }
        if (i < KLATEK - 1) requestAnimationFrame(krok);
        else kompozycjaFinalu();      /* przejazd dopiero po ostatniej klatce */
      };
      klatka.src = klatkaSrc(0);
      requestAnimationFrame(krok);
    }

    function render() {
      plateau = false;                 /* nowy produkt na scenie — decyzje otwarte */
      const it = current();
      if (!it) return;
      stage.innerHTML = "";
      const img = document.createElement("img");
      img.className = "k09__img";
      /* kopie produkcyjne (Etap 2D): 366 KB zamiast 7,43 MB masterów */
      img.src = IMG + "co-trafia-do-olejomatu/opt/" + it.file;
      img.alt = "";
      /* Bez tego przeglądarka porywa gest do NATYWNEGO przeciągania obrazka
         (HTML5 drag) i ubija nasz swipe pointercancelem po pierwszym ruchu —
         przeciąganie produktu myszą nie działało w ogóle (usterka z KROKU 6). */
      img.draggable = false;
      img.addEventListener("error", () => {
        /* brak obiektu nie przerywa interakcji — placeholder w jego miejscu */
        stage.classList.add("is-missing");
        img.remove();
      }, { once: true });
      stage.appendChild(img);
      stage.classList.remove("is-missing");
      stage.classList.toggle("is-fat", !!it.fat);
      nameEl.textContent = it.name;
      counter.textContent = `Sprawdzono ${resolved} z ${K09_ITEMS.length}`;
      if (wiecej) wiecej.hidden = true;
      /* Wyjaśnienie dotyczy PRZED chwilą ocenionego produktu — przy wejściu
         nowego znika, żeby nie wisiało pod kolejnym obiektem i nie uczyło
         błędu (korekta K4.1). Czyszczona jest tylko prezentacja; logika
         decyzji i `mustReject` bez zmian, więc komunikat „skieruj do strefy"
         dla bieżącego produktu pojawia się i zostaje normalnie. */
      feedback("");
      root.querySelector(".k09__stagearea").setAttribute("aria-label",
        `Produkt do oceny: ${it.name}. Wybierz „Do butelki” albo „Nie do butelki”.`);
    }

    function feedback(msg, kind) {
      fbEl.textContent = msg;
      fbEl.className = "k09__feedback" + (kind ? " is-" + kind : "");
    }

    /* krótki błysk całej sceny po trafnej decyzji (bez wpływu na układ) */
    function blysk(kind) {
      if (rm()) return;
      root.classList.add("is-" + kind);
      setTimeout(() => root.classList.remove("is-" + kind), 620);
    }

    function advance() {
      resolved++;
      mustReject = false;
      fill.style.width = Math.round(resolved / K09_ITEMS.length * 100) + "%";
      counter.textContent = `Sprawdzono ${resolved} z ${K09_ITEMS.length}`;
      /* Przedostatni produkt (10 z 11): sekwencja finału ma być w pamięci,
         zanim zapadnie ostatnia decyzja — inaczej butelka zakręcałaby się
         dopiero po chwili ciszy. */
      if (resolved >= K09_ITEMS.length - 1) preloadKlatki();
      /* Ostatnia decyzja: finał wchodzi OD RAZU — plateau go nie dotyczy,
         a zaliczenie w finish() jest natychmiastowe. */
      if (resolved >= K09_ITEMS.length) { finish(); return; }
      idx++;
      /* Plateau (Aneks A raportu 52): wyjaśnienie trafnej decyzji zostaje
         na scenie K09_PLATEAU_MS, dopiero potem render czyści komunikat
         (kontrakt K4.1 bez zmian) i wpuszcza kolejny produkt. W oknie
         plateau `choose` nie przyjmuje decyzji — patrz strażnik niżej. */
      plateau = true;
      setTimeout(render, K09_PLATEAU_MS);
    }

    function finish() {
      if (finished) return;
      finished = true;
      stage.innerHTML = "";
      nameEl.textContent = "";
      counter.textContent = `Sprawdzono ${K09_ITEMS.length} z ${K09_ITEMS.length}`;
      btnOk.disabled = true; btnNo.disabled = true;
      if (wiecej) wiecej.hidden = true;
      doneBox.hidden = false;
      /* korek wpada na szyjkę i butelka rusza w stronę Olejomatu.
         Zdanie „Gotowe…" niesie panel podsumowania — tu potwierdzamy sam
         ruch, żeby ten sam komunikat nie pojawił się dwa razy pod rząd. */
      root.classList.add("is-zakrecona");
      /* Twarde spacje sklejają zdanie w trzy nierozrywalne całości:
         „Butelka zakręcona.” / „Może jechać” / „do Olejomatu.”. Dzięki temu
         finał na desktopie łamie się dokładnie na trzech wersach (szerokość
         pudełka ustawia arkusz tablicy) — bez wstawiania <br> i bez drugiej
         kopii tekstu. Czytnik ekranu dostaje nadal jedno zdanie, bo NBSP
         czyta się jak zwykłą spację. */
      feedback("Butelka\u00A0zakręcona. Może\u00A0jechać do\u00A0Olejomatu.", "ok");
      S.completeInteraction("k09");
      NS.ui && NS.ui.announce(
        "Stacja kontroli ukończona. Butelka jest pełna i zakręcona.");
      /* sygnał dla silnika rozdziału (P05): odsłona finału tropu.
         Zdarzenie jest dodatkiem — zaliczenie niesie lesson-state. */
      try {
        root.dispatchEvent(new CustomEvent("k09:completed", { bubbles: true }));
      } catch (e) { /* zdarzenie opcjonalne */ }
      /* dopiero teraz obraz: klocek jest już zaliczony i ogłoszony, więc
         animacja nie ma jak wstrzymać przejścia do finału tropu */
      zagrajFinal();
    }

    function choose(target) {          // 'bottle' | 'reject'
      if (finished) return;
      /* Strażnik plateau: w oknie czytania kolejka już wskazuje NASTĘPNY,
         jeszcze niewidoczny produkt — przyjęcie decyzji (przycisk, grafika,
         Enter, swipe) oceniłoby obiekt, którego uczeń nie widzi. Ignorujemy
         wejście do chwili renderu; komunikat na scenie zostaje nietknięty. */
      if (plateau) return;
      const it = current();
      if (!it) return;

      if (target === "bottle") {
        if (mustReject) {
          feedback("Już wiemy, że ten produkt nie trafia do butelki. Skieruj go do strefy „Nie do butelki”.", "err");
          return;
        }
        if (it.ok) {
          stage.classList.add("is-pouring");
          setTimeout(() => stage.classList.remove("is-pouring"), 620);
          zebrane++;
          poziomButelki();
          blysk("ok");
          feedback(it.yes || `✓ ${it.name} — trafia do butelki.`, "ok");
          /* tłuszcze stałe: pełna informacja o bezpiecznym postępowaniu */
          if (it.fat && wiecej) wiecej.hidden = false;
          advance();
        } else {
          mustReject = true;
          stage.classList.add("is-rejected");
          setTimeout(() => stage.classList.remove("is-rejected"), 520);
          blysk("err");
          feedback(`✕ ${it.why} Skieruj produkt do strefy „Nie do butelki”.`, "err");
        }
        return;
      }

      /* target === 'reject' */
      if (!it.ok) {
        blysk("ok");
        feedback(`✓ ${it.why || it.name + " nie trafia do butelki."}`, "ok");
        advance();
      } else {
        blysk("err");
        feedback(`✕ ${it.name} to tłuszcz spożywczy — właśnie taki zbieramy do zielonej butelki.`, "err");
      }
    }

    btnOk.addEventListener("click", () => choose("bottle"));
    btnNo.addEventListener("click", () => choose("reject"));

    /* klawiatura: strzałki wybierają stronę, Enter zatwierdza */
    let armed = null;
    const area = root.querySelector(".k09__stagearea");
    area.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft")  { armed = "bottle"; zoneOk.classList.add("is-armed"); zoneNo.classList.remove("is-armed"); e.preventDefault(); }
      if (e.key === "ArrowRight") { armed = "reject"; zoneNo.classList.add("is-armed"); zoneOk.classList.remove("is-armed"); e.preventDefault(); }
      if (e.key === "Enter" || e.key === " ") {
        if (armed) { choose(armed); armed = null; zoneOk.classList.remove("is-armed"); zoneNo.classList.remove("is-armed"); e.preventDefault(); }
      }
    });

    /* przeciąganie i swipe (pointer) — równorzędna, nieobowiązkowa ścieżka */
    let dragging = false, startX = 0, dx = 0;
    area.addEventListener("pointerdown", (e) => {
      if (finished) return;
      dragging = true; startX = e.clientX; dx = 0;
      area.setPointerCapture(e.pointerId);
      stage.classList.add("is-dragging");
    });
    area.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      stage.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
      zoneOk.classList.toggle("is-armed", dx < -40);
      zoneNo.classList.toggle("is-armed", dx > 40);
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("is-dragging");
      stage.style.transform = "";
      zoneOk.classList.remove("is-armed"); zoneNo.classList.remove("is-armed");
      if (dx < -60) choose("bottle");
      else if (dx > 60) choose("reject");
      dx = 0;
    };
    area.addEventListener("pointerup", endDrag);
    area.addEventListener("pointercancel", endDrag);

    poziomButelki();
    render();
  }

  /* ═══════════════════════════════════════════════════════════
     5. K13 — ROZWIJANIE SKRÓTU P–S–Z–O–K
     Prawdziwe przyciski, kolejno. Po piątym: pełna nazwa + definicja.
     Nie przyznaje litery — wizualnie oddzielone od kodu śledztwa.
     ═══════════════════════════════════════════════════════════ */
  const K13_WORDS = ["Punkt","Selektywnego","Zbierania","Odpadów","Komunalnych"];

  function initK13() {
    const root = document.getElementById("k13-expand");
    if (!root) return;
    const btns = Array.from(root.querySelectorAll(".k13__letter"));
    const reveal = root.querySelector(".k13__reveal");
    const hint = root.querySelector(".k13__hint");
    let next = 0;

    btns.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        if (i !== next) {
          hint.textContent = `Najpierw rozwiń literę ${btns[next].dataset.letter}.`;
          return;
        }
        btn.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        btn.querySelector(".k13__word").textContent = K13_WORDS[i];
        btn.disabled = true;
        next++;
        hint.textContent = next < btns.length
          ? `Rozwiń literę ${btns[next].dataset.letter}.`
          : "";
        if (next === btns.length) {
          reveal.hidden = false;
          root.classList.add("is-complete");
          S.completeInteraction("k13");
          NS.ui && NS.ui.announce(
            "PSZOK to Punkt Selektywnego Zbierania Odpadów Komunalnych.");
          /* jedno nagranie po rozwinięciu całości — nie pięć osobnych */
          const scene = root.closest("[data-audio-src]");
          if (scene && NS.audio.autoOn()) { NS.audio.loadScene(scene); NS.audio.play(true); }
        }
      });
    });
    hint.textContent = "Rozwiń literę P.";
  }

  /* ═══════════════════════════════════════════════════════════
     6. SEKWENCJE KLATKOWE (K05, K10, K11) i PRZEMIANA (K12)
     Silnik bez GSAP: postęp liczony z pozycji przypiętej sceny.
     reduced-motion / brak obrazów → statyczne etapy w kolejności.
     ═══════════════════════════════════════════════════════════ */
  /* Indeksy klatek w kolejności „najpierw rzadko, potem gęściej”:
     0, 8, 16… → 4, 12, 20… → 2, 6, 10… → reszta. */
  function kolejnoscPobierania(n) {
    const kolejka = [], mam = new Set();
    for (let krok = 8; krok >= 1; krok = krok >> 1) {
      for (let i = 0; i < n; i += krok) {
        if (!mam.has(i)) { mam.add(i); kolejka.push(i); }
      }
    }
    for (let i = 0; i < n; i++) if (!mam.has(i)) { mam.add(i); kolejka.push(i); }
    return kolejka;
  }

  function frameSequence(opts) {
    const root = document.getElementById(opts.id);
    if (!root) return;
    /* Etap 3B: scena K12 ma własny układ (kadr i stage pod innymi klasami),
       więc selektory są opcjonalne. Domyślnie — jak dotąd — `.seq__*`. */
    const img   = root.querySelector(opts.frameSel || ".seq__frame");
    const stage = root.querySelector(opts.stageSel || ".seq__stage");
    const steps = Array.from(root.querySelectorAll(".seq__step"));
    const fallback = root.querySelector(".seq__fallback");
    if (!img || !stage) return;

    const frames = [];
    let loaded = false, failed = false, raf = 0;
    /* 3C.1 — STRAŻNIK KOLEJNOŚCI KLATEK.
       `wantedFrame` to indeks klatki, na którą wskazuje scroll W TEJ CHWILI.
       Przy szybkim scrubie kilka obrazów pobiera się równolegle i klatka
       starsza potrafi skończyć pobieranie PO nowszej. Bez tego strażnika jej
       `load` podstawiłby stary kadr i obraz cofałby się w tył. `wired`
       pilnuje, żeby każda klatka dostała nasłuch tylko raz. */
    let wantedFrame = -1;
    const wired = new Set();

    const srcOf = (i) => opts.dir + opts.prefix +
      String(i).padStart(opts.pad || 3, "0") + ".webp";

    function showStatic() {
      root.classList.add("is-static");
      if (fallback) fallback.hidden = false;
      steps.forEach(s => s.classList.add("is-on"));
      /* scena z własnym wariantem statycznym (K12) domyka go sama —
         wywołanie jest opcjonalne, więc pozostałe sceny nic nie tracą */
      if (typeof opts.onStatic === "function") opts.onStatic();
    }

    /* 3C.1 — `is-ready` znaczy „kadr MA CO POKAZAĆ", a nie „src jest
       ustawiony". Ta klasa zdejmuje z <img> placeholder (CSS), więc
       ustawiona w chwili podstawienia `src` odsłaniałaby na wolnym łączu
       pusty prostokąt z altem — dokładnie usterkę 3C.1 a. */
    function pokazPierwszaKlatke() {
      /* 3C.3.3: NIE nadpisujemy `wantedFrame` — uczeń mógł już przewinąć
         w głąb sceny i to jego pozycja rozstrzyga, którą klatkę pokazać. */
      if (img.getAttribute("src")) { root.classList.add("is-ready"); return; }
      img.setAttribute("src", srcOf(0));
      if (img.complete && img.naturalWidth) { root.classList.add("is-ready"); return; }
      img.addEventListener("load", () => root.classList.add("is-ready"), { once: true });
    }

    /* 3C.3.3 — SCENA REAGUJE NA DOJECHANIE MEDIÓW.
       Dotąd po dojechaniu klatki kadr aktualizował się TYLKO wtedy, gdy była
       to dokładnie ta, której chciał scroll. Przy pierwszym, zimnym wejściu
       wyglądało to jak scena zepsuta: uczeń przewijał, a las stał na klatce
       zerowej, bo docelowa dojeżdżała jako jedna z ostatnich. Teraz KAŻDA
       dojeżdżająca klatka odświeża kadr. */
    let pierwszaPokazana = false;
    function poDojechaniu() {
      if (ileWLocie > 0) ileWLocie--;
      if (!pierwszaPokazana) { pierwszaPokazana = true; pokazPierwszaKlatke(); }
      if (wantedFrame >= 0) setFrame(wantedFrame);
      dozlec();
    }

    /* Zamawianie PARTIAMI, nie wszystkiego naraz. Gdy zlecaliśmy 64 klatki
       w jednej chwili, kolejka przeglądarki była ustalona zanim uczeń zdążył
       gdziekolwiek przewinąć — i klatka, której naprawdę potrzebował, czekała
       na końcu. Teraz kolejka jest krótka, a klatkę spod palca dociągamy
       natychmiast (`zamow`), z wysokim priorytetem. */
    const kolejkaPobrania = [];
    let ileWLocie = 0;
    const PARTIA = 10;

    function zamow(i, pilne) {
      const im = frames[i];
      if (!im || im.src) return;
      if (pilne && "fetchPriority" in im) im.fetchPriority = "high";
      ileWLocie++;
      im.src = srcOf(i);
    }

    function dozlec() {
      while (ileWLocie < PARTIA && kolejkaPobrania.length) {
        const i = kolejkaPobrania.shift();
        if (frames[i] && !frames[i].src) zamow(i, false);
      }
    }

    function zlecPobieranie() {
      /* najpierw okolica miejsca, w którym uczeń jest, potem rzadki rozstaw
         po całej sekwencji (szybki zgrubny scrub), na końcu reszta */
      const start = wantedFrame >= 0 ? wantedFrame : 0;
      const wokol = [start];
      const mam = new Set([start]);
      for (let d = 1; d < opts.count; d++) {
        for (const k of [start - d, start + d]) {
          if (k >= 0 && k < opts.count && !mam.has(k)) { mam.add(k); wokol.push(k); }
        }
      }
      const widziane = new Set();
      wokol.slice(0, 4).concat(kolejnoscPobierania(opts.count), wokol).forEach((i) => {
        if (widziane.has(i)) return;
        widziane.add(i);
        kolejkaPobrania.push(i);
      });
      dozlec();
    }

    function preload() {
      if (loaded || failed) return;
      loaded = true;
      /* Obrazy tworzymy i zlecamy OD RAZU. Wcześniej czekaliśmy na próbną
         klatkę i dopiero po jej dojechaniu zamawialiśmy resztę — na wolnym
         łączu kosztowało to kilka sekund, w których scena stała martwa. */
      for (let i = 0; i < opts.count; i++) frames[i] = new Image();
      frames.forEach((im) => {
        im.addEventListener("load", poDojechaniu, { once: true });
      });
      /* brak pierwszej klatki = sekwencji nie ma; wtedy wariant statyczny */
      frames[0].addEventListener("error", () => { failed = true; showStatic(); }, { once: true });
      /* NAJPIERW licz pozycję, POTEM zamawiaj: kolejność pobierania zależy od
         tego, gdzie uczeń już jest. Odwrotnie zamawialiśmy od klatki zerowej,
         bo `wantedFrame` był jeszcze nieznany — i przy zimnym wejściu w głąb
         sceny las dojeżdżał od początku sekwencji zamiast stamtąd, gdzie
         uczeń patrzył. */
      /* Pierwsza klatka dostaje `src` NATYCHMIAST — inaczej kadr stoi pusty,
         dopóki cokolwiek nie dojedzie, a na wolnym łączu to kilkanaście
         sekund. Klasę `is-ready` (czyli zdjęcie placeholdera) nadal dodaje
         dopiero zdarzenie `load`. */
      pokazPierwszaKlatke();
      update();
      zlecPobieranie();
    }

    /* 3C.1 — kadr zmienia się WYŁĄCZNIE na klatkę już pobraną.
       Poprzednio `src` przestawiał się na ślepo, licząc na cache HTTP:
       gdy klatki jeszcze nie było, <img> gasił poprzedni obraz i kadr
       migotał (na Fast 3G pusty przez 100% klatek renderowania — pomiar
       w raporcie 59). Teraz niegotowa klatka zostawia ostatni dobry kadr
       i podstawia się dopiero po załadowaniu — o ile scroll nadal jej chce. */
    const gotowa = (i) => {
      const im = frames[i];
      return !!(im && im.complete && im.naturalWidth);
    };

    /* Najbliższa POBRANA klatka nie dalsza niż docelowa. Dzięki temu na
       wolnym łączu kadr nadal podąża za scrollem (zgrubnie, ale płynnie),
       a kolejność pozostaje monotoniczna: przy scrollu w przód nigdy nie
       cofniemy się poniżej wcześniej pokazanej klatki. */
    function najblizszaGotowa(i) {
      for (let k = i; k >= 0; k--) if (gotowa(k)) return k;
      return -1;
    }

    function setFrame(n) {
      const i = clamp(Math.round(n), 0, opts.count - 1);
      wantedFrame = i;
      if (!frames.length) return;           /* przed preloadem nie ruszamy kadru */
      const pokaz = gotowa(i) ? i : najblizszaGotowa(i);
      if (pokaz >= 0) {
        const src = srcOf(pokaz);
        if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      }
      /* 3C.3.3: klatkę spod palca zamawiamy NATYCHMIAST i z wysokim
         priorytetem, nawet jeśli w kolejce stała daleko. Nasłuch na jej
         dojechanie mają wszystkie klatki (`poDojechaniu`). */
      if (!gotowa(i) && frames[i] && !frames[i].src) zamow(i, true);
    }

    /* 3C.2 — MAPOWANIE ODPORNE NA CHOWANY PASEK ADRESU.
       Postęp liczył się wprost z `r.height - window.innerHeight`. Obie
       wartości zmieniają się, gdy przeglądarka telefonu chowa albo pokazuje
       pasek adresu — a że runway ma wysokość `(100svh - belka) * 4,6`,
       różnica 60 px rosła do 276 px. Zmierzone skutki przy NIETKNIĘTYM
       scrollu: postęp spadał z 0,280 na 0,174, a las cofał się z klatki 035
       na 022 (raport 60 §1). Dlatego mianownik liczymy RAZ i odświeżamy
       wyłącznie przy zmianie SZEROKOŚCI okna — czyli przy obrocie albo
       realnym resize.
       Sam mianownik to jednak za mało: przy zmianie wysokości okna rosną
       RÓWNIEŻ sekcje powyżej (każdy runway liczy się w svh), więc scena
       zjeżdża w dół przy nietkniętym scrollu i jej licznik się cofa.
       Dlatego przy każdej zmianie rozmiaru okna PRZYSZPILAMY bieżący
       postęp: dobieramy przesunięcie tak, żeby wyszedł dokładnie ten sam.
       Uczeń nie ruszył palcem — scena nie ma prawa drgnąć. */
    let mianownik = 0, szerokoscOkna = 0, offsetPostepu = 0, ostatniPostep = 0;
    let przyszpilPostep = false, rodzicPrzyPomiarze = null;

    function progress() {
      const r = root.getBoundingClientRect();
      if (r.height < 1) return ostatniPostep;      /* blok w ukrytym <main> */
      const surowy = -r.top;
      const w = window.innerWidth;
      /* 3C.2.1 — blok WĘDRUJE: z ukrytego `<main>` na stronę tropu i z
         powrotem. Mianownik zapamiętany przed przeprowadzką opisuje zupełnie
         inną geometrię, więc scena zostawałaby głucha na przewijanie —
         i to zależnie od tego, czy uczeń zdążył scrollować przed
         przeniesieniem bloku, czyli LOSOWO. Zmiana rodzica zeruje pomiar. */
      if (root.parentElement !== rodzicPrzyPomiarze) {
        rodzicPrzyPomiarze = root.parentElement;
        mianownik = 0; offsetPostepu = 0; ostatniPostep = 0;
      }
      if (!mianownik) {
        const t = r.height - window.innerHeight;
        if (t <= 0) return 0;
        mianownik = t;
        szerokoscOkna = w;
      } else if (przyszpilPostep) {
        przyszpilPostep = false;
        /* mianownik przeliczamy TYLKO przy realnej zmianie szerokości
           (obrót, resize okna) — nigdy z powodu samej wysokości */
        if (w !== szerokoscOkna) {
          const t = r.height - window.innerHeight;
          if (t > 0) { mianownik = t; szerokoscOkna = w; }
        }
        offsetPostepu = surowy - ostatniPostep * mianownik;
      }
      ostatniPostep = clamp((surowy - offsetPostepu) / mianownik, 0, 1);
      return ostatniPostep;
    }

    function update() {
      raf = 0;
      if (failed) return;
      const p = progress();
      /* Etap 3A: opcjonalny KONIEC SCRUBU. Domyślnie klatki rozkładają się
         na całej drodze sekcji i nic się nie zmienia. Gdy scena potrzebuje
         plateau na ostatniej klatce przed dalszą częścią (K11: pełny
         stadion, a potem ekran analityczny), podaje próg mniejszy od 1
         i klatki kończą się w tym punkcie. Jedno mapowanie dla obu
         prezentacji — bez drugiego silnika. */
      /* 3C.3.3: scena może podać WŁASNE mapowanie postępu na klatkę — K12
         używa tego, żeby po odkryciu śladów odtworzyć sekwencję WSTECZ
         (sprzątanie lasu) bez ani jednej nowej grafiki. Bez tej opcji
         mapowanie jest takie jak dotąd, więc pozostałe sceny nic nie tracą. */
      const pk = typeof opts.mapFrame === "function"
        ? clamp(opts.mapFrame(p), 0, 1)
        : (opts.scrubEnd ? clamp(p / opts.scrubEnd, 0, 1) : p);
      setFrame(pk * (opts.count - 1));
      /* etapy tekstowe */
      let active = null;
      steps.forEach((s) => {
        const from = parseFloat(s.dataset.from || "0");
        const to   = parseFloat(s.dataset.to || "1");
        const on = p >= from && p < to;
        s.classList.toggle("is-on", on);
        if (on) active = s;
      });
      /* audio etapowe (K05: trzy krótkie nagrania zamiast jednego długiego).
         Zmiana etapu zatrzymuje poprzednie nagranie; szybki scroll nie tworzy
         kolejki, bo liczy się wyłącznie etap aktualny. */
      if (active && active.dataset.audioManual !== undefined && active !== root._audioStep) {
        root._audioStep = active;
        if (NS.audio) {
          NS.audio.loadScene(active);
          if (NS.audio.autoOn() && !NS.audio.isSuspended()) NS.audio.play(true);
        }
      }
      if (typeof opts.onProgress === "function") opts.onProgress(p, root);
    }

    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }

    if (reduceMotion) {
      /* bez scrubbingu: statyczne etapy w prawidłowej kolejności */
      showStatic();
      const probe = new Image();
      probe.onload = () => { frames[0] = probe; pokazPierwszaKlatke(); };
      probe.onerror = () => { failed = true; };
      probe.src = srcOf(0);
      if (typeof opts.onProgress === "function") opts.onProgress(1, root);
      return;
    }

    /* 3C.3.3 — scena budzi się przy KAŻDYM wejściu w pole widzenia, nie
       tylko przy pierwszym. `once` sprawiał, że po powrocie z tablicy
       (blok wraca do ukrytego `<main>` i z powrotem) nikt już nie
       przeliczał stanu; `preload` i tak wychodzi wcześnie, gdy zrobił swoje. */
    NS.util.watch(root, { margin: 800, onEnter: () => { preload(); onScroll(); } });

    /* Gdy karta wraca z tła, przeglądarka mogła wstrzymać dekodowanie —
       przeliczamy scenę, zamiast czekać na ruch scrolla. */
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) onScroll();
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    /* 3C.2: zmiana rozmiaru okna przyszpila postęp (patrz `progress`).
       `visualViewport` łapie to, czego zwykły `resize` na telefonie nie
       zgłasza — chowanie i pokazywanie paska adresu. */
    const naZmianeOkna = () => { przyszpilPostep = true; onScroll(); };
    window.addEventListener("resize", naZmianeOkna);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", naZmianeOkna);
    }
  }

  function initSequences() {
    /* K05 — zlew i rury: 71 klatek, trzy etapy 0–20 / 21–50 / 51–70 */
    frameSequence({
      id: "k05-seq", dir: IMG + "zlew-seq/", prefix: "zlew-", count: 71, pad: 3,
    });

    /* K10 — dalsza droga oleju. NOWA seria (91 klatek, bez napisów wtopionych
       w grafikę): patelnia → butelka → Olejomat → oczyszczanie → biopaliwo
       i punkty w aplikacji → zielona kropla. Mastery numerowane od 001,
       produkcja od 000. Hasła są teraz krokami HTML, nie częścią obrazu. */
    frameSequence({
      id: "k10-seq", dir: IMG + "proces-seq-v2/", prefix: "proces-", count: 91, pad: 3,
    });

    /* K11 — stadion: 48 klatek scrubu, potem faza analityczna.
       Etap 3C.1: zamiast 41 bezkształtnych kwadracików — 41 MINIATUR
       stadionu. Korekta 3C.1.1: miniatury są rastrowe, wycięte z klatek
       000 i 047 tej samej sekwencji i podane JEDNYM plikiem WebP jako tło
       CSS (dwa stany w jednym obrazku) — jedno żądanie sieciowe na całą
       siatkę. Rysowana sylwetka SVG czytała się przy 24 px jako owal.
       Grupowanie 10+10+10+10+1 — uczeń liczy grupami, nie sztuka po sztuce. */
    const mult  = document.getElementById("k11-multiplier");
    const grid  = document.getElementById("k11-grid");
    const final = document.getElementById("k11-final");
    const K11_GRUPY = [10, 10, 10, 10, 1];
    const K11_ILE = K11_GRUPY.reduce((a, b) => a + b, 0);   /* 41 */
    /* Licznik rusza PO crossfadzie do ekranu analitycznego (0.70 w trybie
       tablicy) i dobija do kompletu przed końcem sekcji, żeby na komunikat
       finalny został realny kawałek drogi. Jedno mapowanie dla obu
       prezentacji — w legacy zmienia się tylko moment startu. */
    const K11_OD = 0.66, K11_DO = 0.88;
    let sylwetki = null;

    function zbudujSylwetki() {
      if (sylwetki || !grid) return;
      sylwetki = [];
      const frag = document.createDocumentFragment();
      K11_GRUPY.forEach((ile, gi) => {
        if (gi) {
          const plus = document.createElement("span");
          plus.className = "k11__plus";
          plus.textContent = "+";
          frag.appendChild(plus);
        }
        const grupa = document.createElement("span");
        grupa.className = "k11__grupa";
        const pole = document.createElement("span");
        pole.className = "k11__pole";
        for (let i = 0; i < ile; i++) {
          /* Korekta 3C.1.1: miniatura to tło CSS z jednego pliku WebP
             (dwa stany w jednym obrazku), więc element jest pustym
             `<span>` — bez rysowania SVG na 41 węzłach. */
          const s = document.createElement("span");
          s.className = "k11__stad";
          pole.appendChild(s);
          sylwetki.push(s);
        }
        const podpis = document.createElement("span");
        podpis.className = "k11__grupa-podpis";
        podpis.textContent = String(ile);
        grupa.appendChild(pole);
        grupa.appendChild(podpis);
        frag.appendChild(grupa);
      });
      grid.appendChild(frag);
    }

    frameSequence({
      id: "k11-seq", dir: IMG + "stadion-seq/", prefix: "stadion-", count: 48, pad: 3,
      /* stadion jest PEŁNY na 62% drogi; reszta to plateau i — w trybie
         tablicy — ekran analityczny wchodzący crossfadem przy 70% */
      scrubEnd: 0.62,
      onProgress(p) {
        if (!mult || !grid) return;
        /* siatka powstaje od razu (wygaszona), żeby układ nie skakał
           w chwili, gdy licznik rusza */
        zbudujSylwetki();
        const t = clamp((p - K11_OD) / (K11_DO - K11_OD), 0, 1);
        const ile = Math.round(t * K11_ILE);
        mult.textContent = "×" + ile;
        sylwetki.forEach((s, i) => s.classList.toggle("is-on", i < ile));
        /* Komunikat finalny WYŁĄCZNIE po skompletowaniu 41 sylwetek.
           Wcześniej zdanie „≈41 kubaturami" stało w tekście od połowy
           sceny i przeczyło licznikowi, który pokazywał dopiero ×17
           (sprzeczność przejściowa zgłoszona przez użytkownika). */
        /* Korekta 3C.3.2: dopiero komplet ×41 odsłania skrót „przejdź niżej" */
        document.getElementById("k11-seq").classList.toggle("is-policzone", ile >= K11_ILE);
        if (final) {
          const komplet = ile >= K11_ILE;
          final.classList.toggle("is-on", komplet);
          /* licznik ×N oddaje pole dużym liczbom — hierarchia, nie dwie
             konkurujące „41" obok siebie */
          if (final.parentNode) final.parentNode.classList.toggle("is-final", komplet);
        }
      },
    });

    /* K12 — las: przemiana i skaner.
       Przemianę niesie ta sama sekwencja klatek co pozostałe sceny —
       `frameSequence` z własnym `scrubEnd`, żeby po domknięciu przemiany
       zostało miejsce na skaner. Obrazy przed/po zostają jako wariant
       statyczny (reduced motion, brak klatek).

       ETAP 3C.2 — skaner przebudowany na trzy warstwy: świat (kadr + lupa
       + pinezki, transformowany razem przy przybliżeniu na telefonie),
       nieruchomy interfejs (licznik i karta opisu poza dioramą) oraz
       statyczna lista w DOM dla czytnika ekranu. */
    const k12 = document.getElementById("k12-scene");
    if (k12) {
      /* Teksty kart — jeden obiektyw: co ten odpad robi lasowi.
         Bez nazywania miejsca odbioru: to odpowiedź Tropu 7. */
      const OBIEKTY = [
        { nazwa: "Fotel",
          tekst: "Porzucony w lesie zajmuje dużo miejsca i niszczy rośliny pod sobą." },
        { nazwa: "Gruz",
          tekst: "Przysypuje leśną ściółkę i utrudnia roślinom wzrost." },
        { nazwa: "Beczka z chemikaliami",
          tekst: "Jej zawartość może wsiąknąć w ziemię i pozostać tam przez lata." },
        { nazwa: "Puszka po farbie",
          tekst: "Resztki farby mogą zanieczyścić glebę i wodę." },
        /* Korekta 3C.2.1: „elektroodpad" wypadł — lupa celowała w pustak,
           a rozpoznawalnego elektroodpadu w renderze przy tej skali nie ma.
           Worki są duże i jednoznaczne. */
        /* Zasada redakcyjna (5A): w treściach lekcji nigdy „śmieci" —
           zawsze „odpady". Nazwa musi się zgadzać z kartą, listą statyczną
           i etykietą pineski, bo uczeń widzi wszystkie trzy. */
        { nazwa: "Worki pełne odpadów",
          tekst: "Rozdarte przez zwierzęta rozsypują się po całym lesie." },
      ];

      const piny      = Array.from(k12.querySelectorAll(".k12__pin"));
      const mapkaPiny = Array.from(k12.querySelectorAll(".k12__mapka-pin"));
      /* Transformujemy WNĘTRZE ramki, nie samą ramkę: `overflow` przycina
         dzieci, więc element skalowany musi siedzieć WEWNĄTRZ kontenera
         z przycięciem. Przy skalowaniu `.k12__swiat` powiększona diorama
         wychodziła poza swoje pudełko i nakrywała tytuł sceny. */
      const swiat     = k12.querySelector(".k12__images");
      const lupa      = k12.querySelector("#k12-lupa");
      const licznik   = k12.querySelector("#k12-licznik");
      const karta     = k12.querySelector("#k12-karta");
      const kNazwa    = karta && karta.querySelector(".k12__karta-nazwa");
      const kTekst    = karta && karta.querySelector(".k12__karta-tekst");
      const q      = k12.querySelector(".k12__question");
      const fakt   = k12.querySelector("#k12-fakt");
      const fakt2  = k12.querySelector("#k12-fakt2");
      const statyk = k12.querySelector(".k12__static");

      /* pełna wiedza od razu: statyczne przed/po, komplet pinezek, lista,
         oba zdania i pytanie — bez zależności od scrolla */
      const pokazWszystko = () => {
        k12.classList.add("is-static");
        if (statyk) statyk.hidden = false;
        piny.forEach((m) => m.classList.add("is-on"));
        mapkaPiny.forEach((m) => m.classList.add("is-on"));
        /* 3C.3: finał bez ruchu — obie ciężarówki stoją obok siebie.
           3C.3.1: przy ograniczonym ruchu BRAMKA NIE OBOWIĄZUJE — cały finał
           i wszystkie opisy są dostępne od razu, bez klikania.
           3C.3.3: las pokazujemy CZYSTY, bo taki jest stan po sprzątaniu. */
        const kadr = k12.querySelector(".k12__frame");
        if (kadr) kadr.setAttribute("src", IMG + "las-seq/las-000.webp");
        const f = k12.querySelector("#k12-final");
        const t = k12.querySelector("#k12-tiry");
        const zap = k12.querySelector("#k12-zaproszenie");
        if (f) f.hidden = false;
        if (t) t.classList.add("is-on");
        if (zap) zap.hidden = true;
        [fakt, fakt2, q, k12.querySelector("#k12-podpis"),
         k12.querySelector("#k12-pyt-pigulka")]
          .forEach((n) => n && n.classList.add("is-on"));
      };

      /* Przybliżenie działa TYLKO na telefonie i transformuje CAŁY świat,
         więc lupa i pinezki jadą razem z obrazem — celownik nie ma jak
         odjechać od obiektu. Punktem zaczepienia skali jest sam obiekt,
         dzięki czemu zostaje w kadrze, a rozjeżdża się otoczenie. */
      const ZOOM = 1.8;
      const naTelefonie = () =>
        window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

      function ustawSwiat(i) {
        if (!swiat) return;
        if (i < 0 || !naTelefonie()) {
          swiat.style.transform = "";
          swiat.style.transformOrigin = "";
          k12.classList.remove("is-zoom");
          return;
        }
        const p = piny[i];
        swiat.style.transformOrigin = parseFloat(p.style.left) + "% " + parseFloat(p.style.top) + "%";
        swiat.style.transform = "scale(" + ZOOM + ")";
        k12.classList.add("is-zoom");
      }

      function ustawLupe(i) {
        if (!lupa) return;
        if (i < 0) { lupa.classList.remove("is-on"); return; }
        lupa.style.left = piny[i].style.left;
        lupa.style.top  = piny[i].style.top;
        lupa.classList.add("is-on");
      }

      /* mapowanie faz sceny; `p` przychodzi z silnika sekwencji, więc
         skaner i przemiana liczą się z tej samej geometrii */
      /* ETAP 3C.3 — FINAŁ.
         Po skompletowaniu pięciu śladów las wraca do pełnego kadru, chwilę
         stoi, a potem dołem przejeżdżają dwie ciężarówki: najpierw ta
         z znalezionymi śladami, za nią druga. Nad nimi licznik przeskakuje
         z 1 na „2+", a po przejeździe wchodzi komunikat z liczbą. */
      const tiry    = k12.querySelector("#k12-tiry");
      const finalEl = k12.querySelector("#k12-final");
      /* Panel zamknięcia tropu wchodzi w TYM SAMYM kadrze co las. Szukamy go
         PRZY KAŻDYM przeliczeniu faz, a nie raz przy starcie: w trybie
         tablicy wstrzykuje go okablowanie tropu, już po inicjalizacji
         modułów, a w legacy nie ma go wcale. */
      const panel = () => k12.querySelector(".k12__panel");
      const zapros  = k12.querySelector("#k12-zaproszenie");
      const brama   = k12.querySelector("#k12-brama");
      const podpis  = k12.querySelector("#k12-podpis");
      const pytPig  = k12.querySelector("#k12-pyt-pigulka");
      /* Brak assetu nie może zablokować finału: gdy obraz nie wczyta się,
         warstwa pojazdów znika, a komunikat, zdania i pytanie idą swoim
         trybem (wzorzec „media nie decydują o zaliczeniu" z K09). */
      if (tiry) {
        Array.from(tiry.querySelectorAll(".k12__tir")).forEach((im) => {
          im.addEventListener("error", () => { tiry.hidden = true; }, { once: true });
        });
      }

      /* KOREKTA 3C.3.1 — ŚLADY ODKRYWA UCZEŃ, NIE SCROLL.
         Przewijanie prowadzi wyłącznie przemianę lasu. Fazę śladów uczeń
         przechodzi klikając pinezki (mysz, dotyk, klawiatura, czytnik),
         a sekcja finału odsłania się dopiero po skompletowaniu piątki.
         Postęp przewijania steruje potem samym finałem: przejazdem
         ciężarówek i wchodzeniem kolejnych linii tekstu. */
      const FAZA = {
        slady: 0.42,         /* przemiana domknięta — dopiero teraz pinezki */
        zaproszenie: 0.44,
        brama: 0.52,         /* dalej niż tu bez kompletu = podpowiedź */
        /* KOREKTA 3C.3.3 — SPRZĄTANIE. Po odkryciu wszystkich pięciu śladów
           dalszy scroll odtwarza tę samą sekwencję WSTECZ: las wraca do
           czystego. Zero nowych grafik — te same 64 klatki, tylko w drugą
           stronę. Pinezki gasną w miarę znikania odpadów. */
        sprzatOd: 0.53, sprzatDo: 0.66,
        tir1: 0.68, tir2: 0.71,      /* wjazd — wywożą to, co sprzątnięto */
        postoj: 0.76,                /* obie stoją — czas na tytuł i podpis */
        wyjazd: 0.84,                /* ruszają dalej w prawo */
        podpis: 0.74, pytPig: 0.79, fakt2: 0.82, pytanie: 0.86,
        zanik: 0.89, panel: 0.91,    /* las gaśnie, panel wchodzi wierszami */
      };
      const jazda = (p, od, dlugosc) => clamp((p - od) / dlugosc, 0, 1);

      /* Korekta 3C.3.2 — PRZEJAZD TRÓJFAZOWY.
         Wjazd → postój obok siebie → wyjazd. Zwracamy pozycję 0…1, gdzie
         0 to lewa krawędź kadru, a 1 prawa; postój to płaski odcinek
         w środku, żeby uczeń zdążył przeczytać tytuł i podpis. */
      function przejazd(p, od, postojOd, wyjazdOd, meta) {
        const wjazd = clamp((p - od) / (postojOd - od), 0, 1);
        if (p < wyjazdOd) return wjazd * meta;             /* wjazd + postój */
        const dalej = clamp((p - wyjazdOd) / 0.07, 0, 1);
        return meta + dalej * (1 - meta);                  /* wyjazd */
      }
      const odkryte = new Set();
      let aktywny = -2;
      let ostatnieSprzatanie = -1;

      function odswiezLicznik() {
        if (!licznik) return;
        licznik.innerHTML = "Ślad <b>" + odkryte.size + "</b> z " + OBIEKTY.length;
      }

      /* Pokazuje kartę wybranego śladu i zapisuje go jako odkryty. */
      function zastosujSlad(i, odKliku) {
        if (i >= 0 && odKliku) odkryte.add(i);
        if (i !== aktywny) {
          aktywny = i;
          piny.forEach((el, n) => {
            el.classList.toggle("is-on", odkryte.has(n));
            el.classList.toggle("is-scan", n === i);
            el.setAttribute("aria-pressed", odkryte.has(n) ? "true" : "false");
          });
          mapkaPiny.forEach((el, n) => {
            el.classList.toggle("is-on", odkryte.has(n));
            el.classList.toggle("is-scan", n === i);
          });
          ustawLupe(i);
          ustawSwiat(i);
          k12.classList.toggle("is-skan", i >= 0);
          if (karta) {
            const o = OBIEKTY[i];
            if (o) { kNazwa.textContent = o.nazwa; kTekst.textContent = o.tekst; }
            karta.classList.toggle("is-on", i >= 0);
          }
        }
        odswiezLicznik();
        /* jeśli podpowiedź już wisi, ma liczyć to, co realnie zostało */
        if (k12.classList.contains("is-braknie")) podpowiedz();
        sprawdzBrame();
      }

      /* BRAMKA: finał odsłania się po piątym odkrytym śladzie — i zostaje
         odsłonięty, także po powrocie do wcześniejszej części sceny. */
      function sprawdzBrame() {
        const komplet = odkryte.size >= OBIEKTY.length;
        k12.classList.toggle("is-komplet", komplet);
        if (komplet && finalEl && finalEl.hidden) {
          finalEl.hidden = false;
          if (brama) brama.textContent = "";
          k12.classList.remove("is-braknie");
        }
        if (komplet && zapros) zapros.hidden = true;
        return komplet;
      }

      /* Podpowiedź zamiast cichej ściany: nieodkryte pinezki pulsują,
         a pod kadrem staje zdanie z liczbą brakujących śladów. */
      function podpowiedz() {
        const brak = OBIEKTY.length - odkryte.size;
        if (brak <= 0) return;
        k12.classList.add("is-braknie");
        if (brama) {
          brama.textContent = brak === 1
            ? "Został jeszcze 1 ślad — kliknij go na ilustracji."
            : (brak < 5
              ? "Zostały jeszcze " + brak + " ślady — kliknij je na ilustracji."
              : "Kliknij ślady na ilustracji, żeby przejść dalej.");
        }
      }

      const wybierz = (i) => { zastosujSlad(i, true); k12.classList.add("is-rozwinieta"); };
      piny.forEach((el, i) => { el.addEventListener("click", () => wybierz(i)); });
      Array.from(k12.querySelectorAll(".k12__lista button")).forEach((btn, i) => {
        btn.addEventListener("click", () => wybierz(i));
      });

      /* linie finału wchodzą pojedynczo, odwracalnie */
      const linia = (el, p, prog) => { if (el) el.classList.toggle("is-on", p > prog); };

      const fazy = (p) => {
        /* Korekta 3C.3.2: pinezki wchodzą DOPIERO po domknięciu przemiany.
           Znikają też z kolejności Tab — inaczej dałoby się domknąć bramkę,
           zanim las w ogóle się zaśmieci. */
        const sladyDostepne = p >= FAZA.slady;
        k12.classList.toggle("is-slady", sladyDostepne);
        piny.forEach((el) => { el.tabIndex = sladyDostepne ? 0 : -1; });
        if (zapros && !odkryte.size) zapros.hidden = !sladyDostepne;

        const komplet = sprawdzBrame();
        if (!komplet) {
          /* uczeń przewija dalej, a ślady nieodkryte — mówimy mu o tym */
          if (p > FAZA.brama) {
            podpowiedz();
          } else {
            k12.classList.remove("is-braknie");
            if (brama) brama.textContent = "";
          }
          return;
        }

        /* ── SPRZĄTANIE (3C.3.3) ──
           Sekwencja cofa się do czystego lasu (mapowanie klatek robi to
           w silniku), a pinezki gasną w tym samym tempie — odpad znika
           z obrazu, więc znika też jego znacznik. */
        const sprzat = clamp((p - FAZA.sprzatOd) / (FAZA.sprzatDo - FAZA.sprzatOd), 0, 1);
        k12.classList.toggle("is-sprzatanie", sprzat > 0 && sprzat < 1);
        k12.classList.toggle("is-czysto", sprzat >= 1);
        if (sprzat !== ostatnieSprzatanie) {
          ostatnieSprzatanie = sprzat;
          const zostalo = Math.ceil((1 - sprzat) * OBIEKTY.length);
          piny.forEach((el, i) => el.classList.toggle("is-zgaszony", i >= zostalo));
          mapkaPiny.forEach((el, i) => el.classList.toggle("is-zgaszony", i >= zostalo));
        }

        /* ── FINAŁ (po bramce) ── */
        k12.classList.toggle("is-final", p > FAZA.brama);
        /* karta zwija się, gdy rusza sprzątanie — opis właśnie przeczytany,
           a miejsce jest potrzebne pojazdom i liczbom */
        if (p <= FAZA.brama || p >= FAZA.sprzatOd) k12.classList.remove("is-rozwinieta");
        if (p > FAZA.brama) ustawSwiat(-1);
        else if (naTelefonie() && aktywny >= 0) ustawSwiat(aktywny);

        /* 3C.3.3: nagłówek z liczbą wchodzi DOPIERO po sprzątaniu — w trakcie
           sprzątania uczeń ma patrzeć na znikające śmieci, nie czytać */
        linia(fakt,   p, FAZA.sprzatDo);
        linia(podpis, p, FAZA.podpis);
        linia(pytPig, p, FAZA.pytPig);
        linia(fakt2,  p, FAZA.fakt2);
        linia(q,      p, FAZA.pytanie);

        if (tiry) {
          /* meta postoju: pierwsza dalej w prawo, druga tuż za nią */
          tiry.style.setProperty("--tir1",
            przejazd(p, FAZA.tir1, FAZA.postoj, FAZA.wyjazd, 0.62).toFixed(4));
          tiry.style.setProperty("--tir2",
            przejazd(p, FAZA.tir2, FAZA.postoj, FAZA.wyjazd + 0.02, 0.30).toFixed(4));
          tiry.classList.toggle("is-on", p > FAZA.tir1);
        }

        /* ── zakończenie tropu: las gaśnie, panel wchodzi wierszami ── */
        const zanik = clamp((p - FAZA.zanik) / 0.06, 0, 1);
        k12.classList.toggle("is-zanik", zanik > 0);
        k12.style.setProperty("--zanik", zanik.toFixed(3));
        const pan = panel();
        if (pan) {
          pan.classList.toggle("is-on", p > FAZA.panel);
          Array.from(pan.querySelectorAll("[data-wiersz]")).forEach((el, i) => {
            el.classList.toggle("is-on", p > FAZA.panel + i * 0.022);
          });
        }
      };

      if (reduceMotion) {
        pokazWszystko();
      } else {
        frameSequence({
          id: "k12-scene", dir: IMG + "las-seq/", prefix: "las-", count: 64, pad: 3,
          frameSel: ".k12__frame", stageSel: ".k12__stage",
          /* przemiana kończy się w pierwszej części drogi; reszta należy do
             śladów, sprzątania i finału */
          scrubEnd: 0.40,
          /* KOREKTA 3C.3.3 — te same 64 klatki służą DWA razy: w przód
             (zaśmiecanie) i wstecz (sprzątanie). Sprzątanie rusza dopiero,
             gdy uczeń odkryje wszystkie pięć śladów — inaczej las czekałby
             zaśmiecony, bo nie ma czego jeszcze sprzątać. */
          mapFrame: (p) => {
            if (p <= 0.40) return p / 0.40;
            const komplet = odkryte.size >= OBIEKTY.length;
            if (!komplet || p < FAZA.sprzatOd) return 1;
            if (p >= FAZA.sprzatDo) return 0;
            return 1 - (p - FAZA.sprzatOd) / (FAZA.sprzatDo - FAZA.sprzatOd);
          },
          onProgress: fazy,
          onStatic: pokazWszystko,
        });
      }
    }
  }

  NS.modules = {
    PLACEHOLDERS,
    init() {
      initPlaceholders();
      initPreviewSimulators();
      initGenially();
      initFrames();
      initK09();
      initK13();
      initGraPszok();
      initSequences();
    },
  };
})();
