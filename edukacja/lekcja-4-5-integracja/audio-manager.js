/* ═══════════════════════════════════════════════════════════════════
   LK45-INT — GLOBALNY MENEDŻER AUDIO
   Fundament systemu DWÓCH trybów: „Czytam" i „Czytam i słucham"
   (Etap A3; wybór w Tropie 1 i w panelu Audio, nie w odprawie).

   Zasady (dokumentacja V3 + schemat 18 klocków):
   • domyślnie „Czytam” — nic nie gra przed świadomym wyborem ucznia;
   • w danym momencie odtwarza się TYLKO jedno nagranie;
   • scena uruchamia narrację po stabilnej obecności w widoku (≈500 ms),
     więc szybki scroll nie buduje kolejki;
   • powrót do sceny nie restartuje nagrania samoczynnie;
   • brak pliku MP3 nigdy nie blokuje treści — panel pokazuje stan i tyle;
   • wejście do filmu albo aktywnej gry zatrzymuje narrację;
   • wszystkie kontrolki działają klawiaturą i mają jednoznaczne etykiety.

   Scena deklaruje narrację atrybutami: data-audio-src, data-audio-title.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const NS = (window.LK45I = window.LK45I || {});
  const S  = NS.state;

  const DWELL_MS = 500;          // 400–700 ms wg dokumentacji
  const VISIBLE_RATIO = 0.55;    // scena „aktywna” od 55% widoczności

  const el = {};
  let audio = null;              // jedna instancja na całą lekcję
  let currentScene = null;       // element sceny, której nagranie jest załadowane
  let dwellTimer = null;
  let pendingScene = null;
  let suspended = false;         // film/gra aktywne
  let blokadaTwarda = false;     /* Etap A3: film w modalu — cisza do jego zamknięcia */
  const unavailable = new Set(); // ścieżki, które nie wczytały się — nie próbujemy w kółko
  /* Etap A1 — LENIWE ŹRÓDŁA. Dotąd wejście w scenę przypinało `src`
     i wołało `load()` niezależnie od trybu, więc przeglądarka szła po plik
     nawet w trybie „Czytam" (stąd 404 nagrań, których jeszcze nie ma,
     w konsoli ucznia, który niczego nie słuchał). Teraz ścieżka czeka
     w zmiennej, a do elementu trafia dopiero przy pierwszym realnym
     odtworzeniu. Panel nadal pokazuje tytuł sceny — bez pobierania. */
  let oczekujaceZrodlo = null;   // ścieżka gotowa do przypięcia przy `play()`
  let klipTytul = null;          // trwa krótkie nagranie kliknięcia (tryby w K03)

  /* Etap A3 — REJESTR WIDOKÓW. Panel w belce tablicy (popover / arkusz)
     nie trzyma własnego stanu: subskrybuje menedżera i renderuje to samo,
     co panel starej lekcji. Jedno źródło prawdy, dwie prezentacje. */
  const widoki = new Set();
  function stanUi() {
    const scena = currentScene;
    const src = scena ? scena.dataset.audioSrc : null;
    return {
      tryb: S.get().audioMode,
      tytul: klipTytul !== null ? klipTytul : (scena ? (scena.dataset.audioTitle || "") : ""),
      status: el.status ? el.status.textContent : "",
      gra: !!(audio && !audio.paused && !audio.ended),
      maNagranie: !!(src && !unavailable.has(srcOf(src))),
    };
  }
  function powiadomWidoki() {
    const dane = stanUi();
    widoki.forEach((fn) => { try { fn(dane); } catch (e) { console.warn(e); } });
  }

  const autoOn = () => {
    const m = S.get().audioMode;
    return m === "both";        /* Etap A3: został jeden tryb z dźwiękiem */
  };

  /* ── UI panelu ── */
  function cacheEls() {
    el.panel   = document.getElementById("audio-panel");
    el.toggle  = document.getElementById("audio-panel-toggle");
    el.title   = document.getElementById("audio-current-title");
    el.toggleScene = document.getElementById("audio-toggle-scene");
    el.status  = document.getElementById("audio-status");
    el.play    = document.getElementById("audio-play");
    el.restart = document.getElementById("audio-restart");
    el.stop    = document.getElementById("audio-stop");
    /* dwie grupy radiowe (K03 i panel) opisują to samo ustawienie */
    el.modes   = Array.from(document.querySelectorAll(
      'input[name="audio-mode"], input[name="audio-mode-panel"]'));
  }

  /** Komunikat gotowości zależy od trybu (Etap A3, korekta po zrzutach):
      w „Czytam" żaden tekst nie może sugerować, że coś zaraz zagra. */
  const statusGotowosci = () => (S.get().audioMode === "read"
    ? "Tryb czytania — nagrania nie uruchamiają się same."
    : "Gotowe do odtworzenia.");

  function setStatus(text) {
    if (el.status) el.status.textContent = text;
    powiadomWidoki();
  }
  function setTitle(text, zKlipu)  {
    /* Klip kliknięcia trzyma tytuł do końca: `change` po kliknięciu trybu
       woła `loadScene`, które inaczej natychmiast podmieniałoby podpis na
       nazwę sceny — uczeń widziałby cudzy tytuł nad grającym opisem. */
    if (klipTytul !== null && !zKlipu) return;
    if (el.title) el.title.textContent = text || "—";
    powiadomWidoki();
    /* tytuł sceny widoczny także na zwiniętej kontrolce */
    if (el.toggleScene) el.toggleScene.textContent = text ? " — " + text : "";
  }

  function syncPlayBtn() {
    powiadomWidoki();
    if (!el.play) return;
    const playing = audio && !audio.paused && !audio.ended;
    el.play.setAttribute("aria-pressed", playing ? "true" : "false");
    el.play.querySelector(".ap__btn-label").textContent = playing ? "Pauza" : "Odtwórz";
    const hasTrack = !!(currentScene && currentScene.dataset.audioSrc &&
                        !unavailable.has(currentScene.dataset.audioSrc));
    el.play.disabled = !hasTrack;
    if (el.restart) el.restart.disabled = !hasTrack;
    if (el.stop)    el.stop.disabled    = !hasTrack;
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("ended",  () => { setStatus("Nagranie zakończone."); syncPlayBtn(); });
    audio.addEventListener("play",   () => { setStatus("Odtwarzanie…"); syncPlayBtn(); });
    /* `pause` przychodzi zdarzeniem, czyli PO tym, jak `suspend()` ustawi
       swój komunikat — bez tego warunku „Narracja wstrzymana, trwa film"
       natychmiast zamieniało się w bezradne „Wstrzymane." */
    audio.addEventListener("pause",  () => {
      /* w trybie czytania komunikat należy do trybu, nie do elementu:
         inaczej wybór „Czytam" migał na „Wstrzymane." (smoke test A3) */
      if (!audio.ended && !suspended && S.get().audioMode !== "read") setStatus("Wstrzymane.");
      syncPlayBtn();
    });
    audio.addEventListener("error",  () => {
      if (audio.src) unavailable.add(srcOf(audio.src));
      setStatus("Nagranie tej sceny jest jeszcze w przygotowaniu. Możesz czytać dalej.");
      syncPlayBtn();
    });
    return audio;
  }

  /* ścieżka względna → porównywalna postać (audio.src zwraca URL bezwzględny) */
  function srcOf(url) {
    try { return new URL(url, location.href).href; } catch (e) { return url; }
  }

  /* ── ładowanie nagrania sceny (bez odtwarzania) ── */
  function loadScene(scene) {
    if (!scene) return false;
    const src = scene.dataset.audioSrc;
    currentScene = scene;
    setTitle(scene.dataset.audioTitle || "");
    if (!src) {
      /* jeden komunikat na oba braki: scena bez deklaracji i scena z plikiem,
         którego jeszcze nie ma — uczeń i tak widzi to samo (Etap A3) */
      setStatus("Nagranie tej sceny jest jeszcze w przygotowaniu. Możesz czytać dalej.");
      syncPlayBtn(); return false;
    }
    if (unavailable.has(srcOf(src))) {
      setStatus("Nagranie tej sceny jest jeszcze w przygotowaniu. Możesz czytać dalej.");
      syncPlayBtn(); return false;
    }
    /* źródła NIE przypinamy — czeka na pierwsze odtworzenie (patrz wyżej) */
    ensureAudio();
    oczekujaceZrodlo = src;
    /* trwa film albo gra — komunikat należy do nich, nie do sceny */
    if (!suspended) setStatus(statusGotowosci());
    syncPlayBtn();
    return true;
  }

  /** Przypięcie ścieżki do elementu — dopiero tutaj rusza pobieranie pliku.
      Zwraca `true`, gdy element dostał NOWE źródło (czyli gra od zera). */
  function przypnijZrodlo(src) {
    const a = ensureAudio();
    if (!src || srcOf(a.src) === srcOf(src)) return false;
    try { a.pause(); } catch (e) { /* przed metadanymi */ }
    a.src = src;
    return true;
  }

  function play(fromStart) {
    const a = ensureAudio();
    if (!currentScene || !currentScene.dataset.audioSrc) return;
    const src = currentScene.dataset.audioSrc;
    if (unavailable.has(srcOf(src))) return;
    /* klip kliknięcia mógł zająć kanał — scena przypina swoje źródło z powrotem */
    const nowe = przypnijZrodlo(src);
    if (nowe) { klipTytul = null; setTitle(currentScene.dataset.audioTitle || ""); }
    if (fromStart && !nowe) { try { a.currentTime = 0; } catch (e) { /* przed metadanymi */ } }
    const p = a.play();
    if (p && p.catch) p.catch(() => {
      /* polityka autoodtwarzania — nie blokujemy lekcji, tylko informujemy */
      setStatus("Kliknij „Odtwórz”, aby uruchomić nagranie.");
      syncPlayBtn();
    });
  }

  function pause() { if (audio && !audio.paused) audio.pause(); }

  /** Zatrzymanie kanału lekcji. Argument „zapomnij scenę" = wyjście
      z tropu (A3.1):
      poza zatrzymaniem kasujemy pamięć bieżącej sceny, bo inaczej ponowne
      wejście w ten sam trop uznaje scenę za „tę samą co przed chwilą"
      i — zgodnie z zasadą „powrót do sceny nie restartuje nagrania" —
      milczy. Uczeń wracający do tropu ma usłyszeć scenę od początku. */
  function stop(zapomnijScene) {
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
    if (zapomnijScene) {
      currentScene = null;
      oczekujaceZrodlo = null;
      klipTytul = null;
      setTitle("", true);
    }
    setStatus(zapomnijScene ? "" : "Wyłączone.");
    syncPlayBtn();
  }

  /** Krótkie nagranie będące ODPOWIEDZIĄ NA KLIK (Etap A1: opisy trybów
      w odprawie). Gra niezależnie od wybranego trybu, bo uczeń sam o nie
      poprosił — ale jedzie tym samym, jedynym kanałem, więc każdy kolejny
      klik przerywa poprzedni i nigdy nie słychać dwóch nagrań naraz. */
  function playClip(src, tytul) {
    if (!src) return;
    if (unavailable.has(srcOf(src))) return;
    const a = ensureAudio();
    const nowe = przypnijZrodlo(src);
    if (!nowe) { try { a.currentTime = 0; } catch (e) { /* przed metadanymi */ } }
    klipTytul = tytul || "";
    setTitle(klipTytul, true);
    clearTimeout(dwellTimer);
    const p = a.play();
    if (p && p.catch) p.catch(() => {
      setStatus("Kliknij „Odtwórz”, aby uruchomić nagranie.");
      syncPlayBtn();
    });
    a.addEventListener("ended", przywrocTytulSceny, { once: true });
  }
  function przywrocTytulSceny() {
    if (klipTytul === null) return;
    klipTytul = null;
    setTitle(currentScene ? (currentScene.dataset.audioTitle || "") : "", true);
    syncPlayBtn();
  }

  /** Film/gra przejmuje dźwięk — narracja milknie i nie wraca sama.
      `zrodlo` (opcjonalne) to element, który o ciszę prosi. Jeśli leży
      w scenie, której nagranie właśnie gra, prośbę ODRZUCAMY: polecenie do
      gry jest częścią tej samej sceny co gra i musi mieć prawo wybrzmieć.
      Ten sam błąd co z atrapą filmu w etapie A1 — element uciszał narrację,
      którą sam zapowiada. Gra nadal ucisza narrację CUDZYCH scen. */
  function suspend(reason, zrodlo, twarda) {
    if (zrodlo && currentScene && audio && !audio.paused &&
        (currentScene === zrodlo || currentScene.contains(zrodlo))) return;
    suspended = true;
    if (twarda) blokadaTwarda = true;
    clearTimeout(dwellTimer);
    pendingScene = null;
    if (audio && !audio.paused) { audio.pause(); }
    if (reason) setStatus(reason);
    syncPlayBtn();
  }
  /** Zdjęcie blokady. Obserwator sceny woła to bez argumentu i NIE może
      obudzić narracji w trakcie filmu: modal zasłania stronę, więc element
      z markerem filmu wychodzi z kadru i zgłasza „już mnie nie ma" —
      dokładnie w chwili, gdy dźwięk należy do filmu (pomiar regresji A3). */
  function resumeAllowed(twarda) {
    if (blokadaTwarda && !twarda) return;
    if (twarda) blokadaTwarda = false;
    if (!suspended) return;
    suspended = false;
    /* komunikat o filmie nie może zostać na ekranie po jego zamknięciu */
    if (currentScene && currentScene.dataset.audioSrc &&
        !unavailable.has(srcOf(currentScene.dataset.audioSrc))) {
      setStatus(statusGotowosci());
    }
  }

  /* ── obserwator scen ── */
  const obserwowane = new WeakSet();

  /** Doczytanie scen zbudowanych PO starcie strony (Etap A2).
      Rozdziały tablicy powstają dopiero przy wejściu w trop, więc ich
      sceny — diagram, kuchnia, finał kuchni, Olejomat, przejście do
      sekwencji, domknięcie tropu — nie istniały w chwili pierwszego
      skanowania. Wołane z silnika po zbudowaniu widoku; `WeakSet` pilnuje,
      żeby żaden węzeł nie dostał dwóch obserwatorów. */
  function scanScenes(root) {
    const zakres = root && root.querySelectorAll ? root : document;
    const sceny = Array.from(zakres.querySelectorAll(
      "[data-audio-src]:not([data-audio-manual]), [data-audio-title]:not([data-audio-manual])"));
    sceny.forEach(zaobserwuj);
  }

  function zaobserwuj(scene) {
    if (!NS.util || obserwowane.has(scene)) return;
    obserwowane.add(scene);
    /* dwell w obserwatorze = stabilna obecność; szybki scroll nie tworzy
       kolejki, bo wejście zgłasza się dopiero po DWELL_MS ciągłej widoczności */
    NS.util.watch(scene, {
      ratio: VISIBLE_RATIO, dwell: DWELL_MS,
      onEnter: () => {
        const isNew = scene !== currentScene;
        loadScene(scene);
        /* auto-start tylko w trybie słuchania i tylko dla NOWEJ sceny
           (powrót do sceny nie restartuje nagrania samoczynnie) */
        if (isNew && autoOn() && !suspended) play(true);
      },
    });
  }

  /* [data-audio-manual] = slot sterowany przez moduł (np. etapy sekwencji),
     a nie przez obserwator widoczności — inaczej etapy w przypiętej scenie
     biłyby się o pierwszeństwo z nagraniem całej sekcji */
  function observeScenes() { scanScenes(document); }

  /* ── kontrolki panelu ── */
  function wireControls() {
    if (el.play) el.play.addEventListener("click", () => {
      if (audio && !audio.paused) pause(); else { resumeAllowed(); play(false); }
    });
    if (el.restart) el.restart.addEventListener("click", () => { resumeAllowed(); play(true); });

    /* Etap A3: przycisk „Wyłącz" zniknął — jego rolę przejął wybór trybu
       „Czytam". Wszystkie kontrolki trybu (panel starej lekcji, chipy
       w Tropie 1, karty w panelu tablicy) przechodzą przez setMode, więc
       istnieje JEDNA droga zmiany ustawienia. */
    el.modes.forEach((input) => {
      input.addEventListener("change", () => { if (input.checked) setMode(input.value); });
    });

    /* mobile: zwijanie panelu do kompaktowej kontrolki */
    if (el.toggle) el.toggle.addEventListener("click", () => {
      const open = el.panel.classList.toggle("is-open");
      el.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    /* karta w tle nie powinna grać w tle lekcji */
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  }

  /** JEDYNA droga zmiany trybu (Etap A3). Widoki tylko ją wołają i słuchają
      zmian stanu przez NS.state.onChange, więc nigdzie nie ma lokalnego stanu
      kontrolki. „Czytam" zatrzymuje narrację; „Czytam i słucham" jest
      świadomym gestem, więc uruchamia nagranie bieżącej sceny — ale nigdy
      nie przełamuje blokady filmu ani gry i nie przerywa grającego klipu. */
  function setMode(mode) {
    if (mode !== "read" && mode !== "both") return;
    const przed = S.get().audioMode;
    S.setAudioMode(mode);
    syncModeUI();
    if (mode === "read") {
      if (klipTytul === null) stop();
      setStatus("Tryb czytania — nagrania nie uruchamiają się same.");
      return;
    }
    resumeAllowed();
    if (!currentScene) { setStatus("Tryb z narracją — nagranie ruszy w kolejnej scenie."); return; }
    const src = currentScene.dataset.audioSrc;
    if (!src || unavailable.has(srcOf(src))) {
      setStatus("Nagranie tej sceny jest jeszcze w przygotowaniu. Możesz czytać dalej.");
      loadScene(currentScene);
      return;
    }
    loadScene(currentScene);
    /* film/gra trzymają dźwięk — zapisujemy wybór i czekamy na ich koniec */
    if (suspended) return;
    /* klip kliknięcia dogrywa swoje; scena odezwie się po nim */
    if (klipTytul !== null) return;
    if (przed !== "both" || !audio || audio.paused) play(true);
  }

  function syncModeUI() {
    const mode = S.get().audioMode;
    el.modes.forEach(i => { i.checked = (i.value === mode); });
  }

  function init() {
    cacheEls();
    if (!el.panel) return;
    syncModeUI();
    wireControls();
    observeScenes();
    setStatus(S.get().audioMode === "read"
      ? "Tryb czytania — nagrania nie uruchamiają się same."
      : "Tryb z narracją — nagranie sceny uruchomi się po wejściu w nią.");
    syncPlayBtn();
  }

  NS.audio = {
    init, play, pause, stop, suspend, resumeAllowed,
    loadScene, playClip, scanScenes, setMode,
    stanUi,
    onUi(fn) { widoki.add(fn); try { fn(stanUi()); } catch (e) {} return () => widoki.delete(fn); },
    isSuspended: () => suspended,
    autoOn,
  };
})();
