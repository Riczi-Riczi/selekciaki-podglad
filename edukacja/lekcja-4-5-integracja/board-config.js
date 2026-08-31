/* ═══════════════════════════════════════════════════════════════════
   TABLICA ŚLEDZTWA — KONFIGURACJA v02
   Jedno źródło prawdy: pozycje, pineski, kartki, trasa nici, treści.
   Wszystkie współrzędne w % kadru tablicy (osobno desktop i mobile),
   odczytane ze wzorników v02:
     02-layout-tablicy/desktop/tablica-wzornik-polaroidy-desktop-1920x1080-v02.jpg
     02-layout-tablicy/mobile/tablica-wzornik-polaroidy-desktop-1080x1920-v02.jpg

   ŻADNA z tych liczb nie może trafić do funkcji animacji — kamera i nić
   czytają wyłącznie stąd.

   Kolejność narracyjna, semantyczna i trasa nici: P01 → P09.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";
  const NS = (window.LK45I = window.LK45I || {});

  const IMG = "../assets/images/lekcja45/00-wstep-tablica/";
  const VID = "../assets/video/lekcja45/00-wstep-tablica/";
  const IMG_DIAG = "../assets/images/lekcja45/diagram-olej/";   // assety modułu EMKA

  const PIN = {
    czerwona:  IMG + "dekoracje/pineska-czerwona.webp",
    niebieska: IMG + "dekoracje/pineska-niebieska.webp",
    zielona:   IMG + "dekoracje/pineska-zielona.webp",
    zolta:     IMG + "dekoracje/pineska-zolta.webp",
  };

  /* x/y = środek elementu, w = szerokość, rot = obrót (stopnie);
     pin.x/pin.y = punkt mocowania pinezki = węzeł nici; pin.w = jej szerokość.
     Pineski leżą na GÓRNEJ krawędzi białej ramki (albo przy narożniku) —
     nigdy na środku zdjęcia. `pin` jest OPCJONALNY (kartki z taśmą go nie mają). */
  const CHAPTERS = [
    { id: "p01", blocks: ["k01"], letter: null,
      title: "Tajemnica zakorkowanego miasta", lead: "Otwarcie sprawy",
      desktop: { x: 25.5, y: 21.1, w: 9.0, rot: -3.0, pin: { x: 25.9, y: 12.4, w: 1.6, img: PIN.zielona } },
      mobile:  { x: 26.0, y: 27.1, w: 17.3, rot: -3.5, pin: { x: 25.6, y: 19.3, w: 3.4, img: PIN.niebieska } },
      state: "active" },

    { id: "p02", blocks: ["k02", "k03"], letter: null,
      title: "Początek sprawy", lead: "Film otwierający i odprawa",
      /* Trop z filmem dzieli się na dwie sceny: A (nagranie) i B (odprawa).
         Karta filmu stoi centralnie w scenie A — bez przenoszenia po DOM. */
      /* Etap A5: materiał docelowy użytkownika zastąpił film zastępczy
         (`DPLtxSwYNS0`), który wisiał tu od Etapu 31 jako placeholder. */
      video: { youtubeId: "UUFVhqLkx-k", title: "Początek sprawy" },
      desktop: { x: 45.8, y: 28.0, w: 9.0, rot: 1.5, pin: { x: 45.8, y: 19.3, w: 1.6, img: PIN.czerwona } },
      mobile:  { x: 54.8, y: 30.6, w: 18.2, rot: 2.0, pin: { x: 55.0, y: 23.2, w: 3.4, img: PIN.czerwona } },
      state: "locked" },

    /* P03 — rozdział sześcioscenowy zbudowany wokół GOTOWEJ gry Genially K04.
       `game` opisuje scenę gry: strona daje tylko okno uruchamiające, całe
       audio i mechanika zostają w Genially. `diagram` to osobny moduł EMKA,
       następujący PO grze — nie przyznaje litery i nie jest osobnym klockiem. */
    { id: "p03", blocks: ["k04", "k05"], letter: "P",
      title: "Tropy prowadzą pod ziemię", lead: "Gra i dowód nr 1: zlew",
      game: { block: "k04", cta: "Gdy skończysz grę, pokaż odkryty dowód" },
      /* Sekwencja zlewu (klocek K05) należy do TEGO rozdziału — od Etapu 1B-B
         P04 to wyłącznie K06, więc zlew nie gra dwa razy pod rząd. Sekwencja
         jest wizualną częścią sceny „Odkryty dowód", nie osobnym rozdziałem,
         dlatego nie ma tu własnego tytułu. */
      seq: {
        block: "k05",
        dir: "../assets/images/lekcja45/zlew-seq/",
        prefix: "zlew-", count: 71, pad: 3, ext: ".webp",
        alt: "Sekwencja: olej osadza się w rurze i utrudnia przepływ wody",
      },
      /* Diagram EMKA — od Etapu 1D DWA układy nad wspólnym mapowaniem:

         DESKTOP (szeroki kontener): zatwierdzony układ promienisty — obraz
         `diagram-static.webp` Z liniami prowadzącymi i siedem odwracanych kart
         wokół niego (pozycje `x/y` w % sceny, pastele awersów). Stan
         początkowy: wszystkie odpowiedzi zakryte.

         KOMPAKT (wąski kontener): baza bez linii + siedem wycinków ułożonych
         1:1 na wspólnym płótnie (kopie produkcyjne w `kompakt/`, 1200×800).
         Kliknięcie wycinka otwiera JEDNĄ kartę w panelu pod diagramem.

         `cards` to JEDYNE źródło semantyki (id → etykieta → pastel → pozycja
         promienista → alt) — oba układy czytają stąd. Mapowanie wycinków
         zweryfikowane barwą górnych ścianek (odległości 3–13 od wzorców
         z raportu 42), nie numerem pliku; kotwica: największy pomarańczowy
         wycinek-01 = „Wylewa olej do zlewu lub toalety". */
      diagram: {
        img: IMG_DIAG,
        promienisty: IMG_DIAG + "diagram-static.webp",
        kompaktBaza: IMG_DIAG + "kompakt/calosc-bez-linii.webp",
        kompaktWycinek: (n) => IMG_DIAG + "kompakt/wycinek-0" + n + ".webp",
        sfx: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/sfx/card-flip.mp3",
        /* Breakpoint SZEROKOŚCI KONTENERA sceny (nie okna). Punkt startowy
           1024 z polecenia obniżono po pomiarze czytelności: przy kontenerze
           ~950 (okno 1280) karty promieniste mają ~173 px szerokości i są
           czytelne, przy ~780 (okno 1024) spadłyby do ~144 px — za mało dla
           klas 4–5, więc tam przełączamy na kompakt. */
        progKompakt: 860,
        cards: [
          { id: "olej-do-olejomatu",  wycinek: 7, x: 23.24, y: 10.65, rgb: "245,230,216", barwa: "kremowy",      label: "Korzysta z Olejomatów",                alt: "Korzysta z Olejomatów", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-korzysta-z-olejomatu.mp3" },
          { id: "olej-do-zlewu",      wycinek: 1, x: 80.51, y: 11.64, rgb: "252,216,176", barwa: "pomarańczowy", label: "Wylewa olej do zlewu lub toalety",     alt: "Wylewa olej do zlewu lub toalety", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-karty-zlew-toaleta.mp3" },
          { id: "olej-papierem",      wycinek: 6, x: 4.91,  y: 40.69, rgb: "219,216,227", barwa: "lawendowy",    label: "Wyciera papierem i wrzuca do papieru", alt: "Wyciera papierem i wrzuca do papieru", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-wyciera-papierem.mp3" },
          { id: "olej-do-zmieszanych",wycinek: 2, x: 92.44, y: 44.08, rgb: "209,216,198", barwa: "oliwkowy",     label: "Wyrzuca do odpadów zmieszanych",       alt: "Wyrzuca do odpadów zmieszanych", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-karty-odpady-zmieszane.mp3" },
          { id: "inne-sposoby",       wycinek: 5, x: 8.67,  y: 76.16, rgb: "248,227,187", barwa: "żółty",        label: "Inne sposoby",                         alt: "Inne sposoby", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-inne-sposoby.mp3" },
          { id: "olej-do-pszok",      wycinek: 4, x: 29.24, y: 91.4,  rgb: "198,201,209", barwa: "błękitny",     label: "Oddaje olej do PSZOK",                 alt: "Oddaje olej do PSZOK", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-olej-PSZOK.mp3" },
          { id: "nie-wiem",           wycinek: 3, x: 86.87, y: 83.99, rgb: "201,205,194", barwa: "szałwiowy",    label: "Nie wiem",                             alt: "Nie wiem", glos: "../assets/audio/lekcja45/03-punkt-kontrolny/diagram-karty/03-nie-wiem.mp3" },
        ],
      },
      desktop: { x: 70.8, y: 20.2, w: 8.5, rot: 1.0, pin: { x: 68.5, y: 12.1, w: 1.6, img: PIN.zielona } },
      mobile:  { x: 82.8, y: 23.2, w: 17.3, rot: 1.5, pin: { x: 83.0, y: 15.5, w: 3.4, img: PIN.zolta } },
      state: "locked" },

    /* P04 — wyłącznie K06 (przeszukanie kuchni, punkt kontrolny z literą S).
       Do Etapu 1B-B rozdział obejmował też K05, ale klocek zlewu jest już
       wizualnym dowodem w P03 — trzymanie go w obu miejscach oznaczałoby
       tę samą animację dwa razy pod rząd. K05 nie został usunięty z lekcji,
       tylko przeniesiony narracyjnie i technicznie do P03. */
    /* Etap 2C: K08 „Złap krople oleju" jest DRUGĄ obowiązkową sceną tego
       tropu (po przeszukaniu kuchni) — narracyjnie: znaleziona butelka →
       zebranie oleju → pełna butelka. Litery: S po K06, Z po K08; obie są
       stanem GLOBALNYM lesson-state (pole `letter` to wyłącznie metadana). */
    { id: "p04", blocks: ["k06", "k08"], letter: "S",
      title: "Ślad prowadzi do kuchni", lead: "Przeszukanie kuchni",
      /* Etap A5: gra „Latarka w kuchni" zastąpiła materiał Genially i sama
         zgłasza ukończenie (`k06:completed`), więc `cta` — ręczne
         potwierdzenie ucznia — zniknęło razem z nim. Scenę K08 odsłania
         teraz zdarzenie gry, nie kliknięcie w przycisk. */
      game: { block: "k06", wide: true },
      desktop: { x: 75.1, y: 46.3, w: 8.8, rot: -2.0, pin: { x: 72.9, y: 38.2, w: 1.6, img: PIN.czerwona } },
      mobile:  { x: 29.2, y: 46.4, w: 18.0, rot: -2.5, pin: { x: 29.0, y: 39.1, w: 3.4, img: PIN.niebieska } },
      state: "locked" },

    /* Etap 2C: K08 przeniesione do P04 — w tym tropie zostają K07 oraz
       przyszłe K09/K10. Litera Z jest zdobywana w P04 (metadana bez użycia
       w silniku usunięta, żeby nie sugerowała drugiego miejsca zdobycia). */
    { id: "p05", blocks: ["k07", "k09", "k10"], letter: null,
      title: "Sprawa oleju — Olejomat", lead: "Droga butelki i dalsze losy oleju",
      desktop: { x: 58.7, y: 49.9, w: 8.5, rot: 1.0, pin: { x: 58.7, y: 41.9, w: 1.6, img: PIN.niebieska } },
      mobile:  { x: 75.3, y: 62.1, w: 17.3, rot: 1.5, pin: { x: 75.4, y: 55.0, w: 3.4, img: PIN.czerwona } },
      state: "locked" },

    { id: "p06", blocks: ["k11", "k12"], letter: null,
      title: "Skala problemu", lead: "Stadion i ślady w lesie",
      desktop: { x: 31.0, y: 50.1, w: 8.6, rot: 0.0, pin: { x: 31.0, y: 42.0, w: 1.6, img: PIN.czerwona } },
      mobile:  { x: 70.7, y: 43.4, w: 17.8, rot: -1.0, pin: { x: 70.6, y: 36.2, w: 3.4, img: PIN.zielona } },
      state: "locked" },

    { id: "p07", blocks: ["k13", "k14", "k15"], letter: "O",
      title: "PSZOK — centrum dowodów", lead: "Spacer po strefach i obsługa punktu",
      desktop: { x: 24.5, y: 73.7, w: 8.9, rot: 2.0, pin: { x: 24.8, y: 65.2, w: 1.6, img: PIN.zielona } },
      mobile:  { x: 24.6, y: 64.3, w: 18.2, rot: 2.5, pin: { x: 24.9, y: 56.3, w: 3.4, img: PIN.zolta } },
      state: "locked" },

    { id: "p08", blocks: ["k16"], letter: "K",
      title: "Co dalej z odpadami?", lead: "Drugie życie odpadów",
      desktop: { x: 51.1, y: 75.6, w: 8.85, rot: -1.5, pin: { x: 51.1, y: 67.1, w: 1.6, img: PIN.zolta } },
      mobile:  { x: 77.8, y: 79.0, w: 17.8, rot: -2.0, pin: { x: 77.6, y: 71.8, w: 3.4, img: PIN.zielona } },
      state: "locked" },

    { id: "p09", blocks: ["k17", "k18"], letter: null,
      title: "Rozwiązanie sprawy", lead: "Finał śledztwa i dyplom",
      desktop: { x: 71.3, y: 72.5, w: 8.7, rot: 1.5, pin: { x: 69.2, y: 64.2, w: 1.6, img: PIN.czerwona } },
      mobile:  { x: 39.7, y: 81.3, w: 18.2, rot: 2.0, pin: { x: 39.9, y: 73.9, w: 3.4, img: PIN.czerwona } },
      state: "locked" },
  ];

  CHAPTERS.forEach((c) => {
    c.frameStart = IMG + "polaroidy/" + c.id + "-start.webp";
    c.frameEnd   = IMG + "polaroidy/" + c.id + "-koniec.webp";
    /* Komplet dziewięciu animacji jest w produkcji: P01–P06 od początku,
       P07 w korekcie 4A.3, P08 w etapie 5A, P09 w etapie 6A. Wszystkie
       mieszczą się w 2,11–2,15 MB, więc każda była kopiowana bajt w bajt,
       bez ponownego kodowania. Źródła: docs/referencje/.../
       animacje-do-oceny/p0N-animacja-v01.mp4. */
    c.anim = ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09"].indexOf(c.id) >= 0
      ? VID + "polaroidy/" + c.id + "-animacja.mp4" : null;
  });

  /* Kartki — czysta dekoracja (aria-hidden). Napisy są częścią grafiki;
     wszystkie istotne informacje niesie tekst HTML polaroidów i statusów.
     Kartki przyklejone taśmą NIE mają pineski (brak właściwości `pin`);
     pineskę zachowuje tylko notatka „Pilne!" — zgodnie z wzorcem v02. */
  const NOTES = [
    { id: "n-incydent", img: IMG + "dekoracje/kartka-zolta-2.webp",
      desktop: { x: 58.9, y: 27.7, w: 8.8, rot: -1.5 },
      mobile:  { x: 44.6, y: 16.0, w: 13.8, rot: -1.0 } },
    { id: "n-pilne", img: IMG + "dekoracje/kartka-notatka.webp",
      desktop: { x: 18.3, y: 41.1, w: 6.0, rot: -2.0, pin: { x: 19.9, y: 37.3, w: 1.35, img: PIN.zolta } },
      mobile:  { x: 53.5, y: 55.6, w: 12.0, rot: -1.5, pin: { x: 55.0, y: 53.0, w: 2.9, img: PIN.niebieska } } },
    { id: "n-skuteczne", img: IMG + "dekoracje/kartka-zolta-3.webp",
      desktop: { x: 43.9, y: 43.1, w: 7.75, rot: 1.0 },
      mobile:  { x: 87.6, y: 49.8, w: 11.6, rot: 1.5 } },
    { id: "n-prawda", img: IMG + "dekoracje/kartka-zolta-1.webp",
      desktop: { x: 38.8, y: 69.9, w: 7.0, rot: -3.0 },
      mobile:  { x: 50.4, y: 69.8, w: 12.9, rot: -3.5 } },
  ];

  NS.boardConfig = {
    chapters: CHAPTERS,
    notes: NOTES,
    assets: {
      introLandscape: VID + "intro/intro-16x9.mp4",
      introPortrait:  VID + "intro/intro-9x16.mp4",
      /* Etap A1: głos narratora wchodzi w 2. sekundzie intro i MIESZA SIĘ
         z jego ścieżką dźwiękową (nie zastępuje jej). Nagranie trwa 9,2 s,
         intro 15,6 s, więc głos kończy się z zapasem przed tablicą. */
      introVoice: "../assets/audio/lekcja45/00-intro/00-intro-glos.mp3",
      introVoiceStart: 2,
      posterLandscape: IMG + "board/poster-16x9.webp",
      posterPortrait:  IMG + "board/poster-9x16.webp",
      boardDesktop: IMG + "board/tablica-desktop.webp",
      boardMobile:  IMG + "board/tablica-mobile.webp",
    },
    /* v02: kompozycja została zaprojektowana tak, że nić prowadzi
       zgodnie z kolejnością śledztwa — bez pętli poza kadrem */
    threadOrder: ["p01","p02","p03","p04","p05","p06","p07","p08","p09"],
    /* choreografia kamery (jedno miejsce, nie w funkcjach animacji) */
    camera: {
      zoom: 2.6,             // przybliżenie na trop (film w polaroidzie)
      zoomMs: 900,
      travelMs: 2000,        // podróż wzdłuż nici P01 → P02 (1,5–2,5 s)
      morphMs: 560,          // dopchnięcie zoomu podczas przemiany w stronę
      fadeMs: 320,           // crossfade polaroid → strona rozdziału
      overviewZoom: 1.0,
    },
  };
})();
