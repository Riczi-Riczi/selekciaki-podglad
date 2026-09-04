/* ═══════════════════════════════════════════════════════════════════
   TABLICA ŚLEDZTWA — SILNIK v03 (etap 2, korekta zoomu i strony)

   ZASADA GŁÓWNA: kamera porusza CAŁĄ SCENĄ (`.bd-scene` = tablica,
   polaroidy, kartki, pineski, nić). Polaroid nigdy nie skaluje się sam.

   PRZEJŚCIE DO STRONY (storyboard 1–5): jeden ciągły ruch —
   zoom sceny na polaroid → film w polu zdjęcia → dopchnięcie zoomu tak,
   że karta wypełnia szerokość przyszłej strony → crossfade do warstwy
   `.bd-chapterlay` (korek po bokach + centralna strona). Kamera resetuje
   się DOPIERO pod nieprzezroczystą stroną — transfer jest niewidoczny,
   bez cofnięcia i bez skoku.

   Strona rozdziału: JEDEN scrollbar (scrolluje .bd-chapterlay), treść
   K01/K02/K03 PRZENOSZONA (nie kopiowana) i wracająca na miejsce.
   `.bd-sheetfx` = pusta warstwa pod przyszły parallax (data-parallax-*).
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";
  const NS = (window.LK45I = window.LK45I || {});
  const CFG = NS.boardConfig;
  if (!CFG) { console.warn("[tablica] brak konfiguracji"); return; }

  const CAM = CFG.camera;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPortrait = () => window.matchMedia("(orientation: portrait)").matches;
  const layoutKey = () => (isPortrait() ? "mobile" : "desktop");
  const NBSP = " ";

  const el = {};
  let currentVideo = null;      // najwyżej jedno wideo naraz
  let openedChapter = null;
  let camTimer = 0, camRaf = 0;
  const moved = [];             // przeniesione węzły + kotwice powrotu
  const titleFixes = [];        // tytuły z podmienionymi twardymi spacjami
  const chapterCleanup = [];    // odpinanie obserwatorów/listenerów strony rozdziału
  /* Pamięć silnika (świadomie NIE storage): tropy, których film uczeń już
     otwierał. Dzięki temu strzałka zostaje widoczna po powrocie do P02
     w tej samej sesji strony, a po odświeżeniu wraca stan wyjściowy. */
  const filmTouched = new Set();
  let thumbsReady = Promise.resolve();   // preload 9 miniatur (patrz „── start ──")

  /* ── Pamięć sesji ────────────────────────────────────────────────
     Tablica jest wariantem domyślnym, więc odświeżenie strony nie może
     cofać ucznia na start. W `sessionStorage` (a nie `localStorage`)
     trzymamy tylko dwie rzeczy: czy intro już leciało i jakie tropy są
     odblokowane/ukończone. Trwały rejestr postępu między dniami to nadal
     osobny etap — tutaj świadomie nie dublujemy `lesson-state.js`. */
  const SS_INTRO = "lk45int_board_intro_v1";
  const SS_STATES = "lk45int_board_states_v1";

  const ss = {
    get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { sessionStorage.setItem(key, val); } catch (e) { /* tryb prywatny */ } },
  };

  const introSeen = () => ss.get(SS_INTRO) === "1";
  const markIntroSeen = () => ss.set(SS_INTRO, "1");

  function saveStates() {
    const map = {};
    CFG.chapters.forEach((c) => { if (c.state !== "locked") map[c.id] = c.state; });
    ss.set(SS_STATES, JSON.stringify(map));
  }

  /** Odtworzenie stanów przed zbudowaniem sceny — polaroidy powstają od razu
      z właściwą klatką i etykietą, bez migotania „zablokowany → aktywny". */
  function restoreStates() {
    let map;
    try { map = JSON.parse(ss.get(SS_STATES) || "{}"); } catch (e) { return; }
    if (!map || typeof map !== "object") return;
    CFG.chapters.forEach((c) => {
      const s = map[c.id];
      if (s === "active" || s === "completed") c.state = s;
    });
  }

  /* ── pomocnicze ──────────────────────────────────────────────── */
  const h = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const announce = (msg) => {
    const live = document.getElementById("bd-live");
    if (live) live.textContent = msg;
  };
  /** Scena wygaszona (opacity:0 albo jeszcze nieodsłonięta) nie może zostać
      w kolejności Tab ani w drzewie dostępności — inaczej użytkownik klawiatury
      wpada w niewidoczną treść. `inert` załatwia fokus i wskaźnik, `aria-hidden`
      dokłada czytniki ekranu w starszych silnikach. */
  function setSceneActive(node, active) {
    if (!node) return;
    if (active) {
      node.inert = false;
      node.removeAttribute("inert");
      node.removeAttribute("aria-hidden");
    } else {
      node.inert = true;
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    }
  }

  function stopVideo(v) {
    if (!v) return;
    /* koniec intro (koniec filmu, „Pomiń", błąd, wejście w rozdział)
       zabiera ze sobą narratora — Etap A1 */
    if (el.introVideo && v === el.introVideo) narratorStop();
    try { v.pause(); } catch (e) { /* przed metadanymi */ }
    try { v.removeAttribute("src"); v.load(); } catch (e) { /* zwolnienie dekodera */ }
    if (currentVideo === v) currentVideo = null;
  }
  function stopAllMedia() {
    stopVideo(el.introVideo);
    document.querySelectorAll(".bd-pol__video").forEach(stopVideo);
    const yt = document.getElementById("bd-yt");
    if (yt) yt.removeAttribute("src");
    currentVideo = null;
  }

  /* logotypy z istniejącej stopki lekcji (nic nie jest przepisywane) */
  function footerLogos() {
    const foot = document.querySelector(".lk-footer");
    return foot ? Array.from(foot.querySelectorAll(".lk-footer__logos img")) : [];
  }
  /* plakat startowy: logotypy na jasnym kafelku + tekst dofinansowania */
  function formalBarHtml() {
    const imgs = footerLogos().map((i) =>
      `<img src="${i.getAttribute("src")}" alt="${i.getAttribute("alt") || ""}">`).join("");
    const fund = document.querySelector(".lk-footer .lk-footer__fund");
    return `<span class="bd-formal__logos">${imgs}</span>` +
           `<p class="bd-formal__text">${fund ? fund.textContent.trim() : ""}</p>`;
  }
  /* stopka strony rozdziału: trzy kolumny — logo SELEKT, logo WFOŚiGW,
     tekst w dokładnie trzech kontrolowanych wierszach (oficjalne brzmienie) */
  function pageFootHtml() {
    const logos = footerLogos();
    /* Każdy znak dostaje własną klasę (Etap 6B.5): pliki mają różny udział
       atramentu w ramce, więc równa wysokość ramek dawałaby nierówne znaki.
       Rozmiary ustawia arkusz — tutaj tylko je rozpoznajemy. */
    const cols = logos.map((i) => {
      const src = i.getAttribute("src") || "";
      const rodzaj = /Logo_Selekt/i.test(src) ? "selekt" : "wfos";
      return `<span class="bd-foot__logo bd-foot__logo--${rodzaj}">` +
        `<img src="${src}" alt="${i.getAttribute("alt") || ""}"></span>`;
    }).join("");
    return cols +
      '<p class="bd-foot__text">Projekt dofinansowano ze środków<br>' +
      'Wojewódzkiego Funduszu Ochrony Środowiska<br>' +
      'i&nbsp;Gospodarki Wodnej w&nbsp;Poznaniu.</p>';
  }

  /* ── budowa DOM ──────────────────────────────────────────────── */
  function build() {
    const root = h("div", "bd-root");
    root.id = "bd-root";
    const poster = () => (isPortrait() ? CFG.assets.posterPortrait : CFG.assets.posterLandscape);

    root.innerHTML = `
      <p class="bd-sr" id="bd-live" role="status" aria-live="polite"></p>

      <section class="bd-layer bd-start" id="bd-start" aria-label="Ekran startowy e-lekcji">
        <img class="bd-start__poster" id="bd-start-poster" src="${poster()}" alt="">
        <div class="bd-start__inner">
          <p class="bd-start__kicker">E-lekcja • klasy 4–5</p>
          <h1 class="bd-start__title">Eko-detektyw:<br>Tajemnica zakorkowanego miasta</h1>
          <p class="bd-start__lead">Wejdź do biura śledczego i sprawdź, co zatkało miasto.
            Na tablicy czeka dziewięć tropów.</p>
          <p class="bd-start__actions">
            <button type="button" class="bd-btn" id="bd-play">Rozpocznij śledztwo</button>
            <button type="button" class="bd-btn bd-btn--ghost" id="bd-skip-intro">Pomiń intro</button>
          </p>
        </div>
        <div class="bd-formal">${formalBarHtml()}</div>
      </section>

      <section class="bd-layer bd-video" id="bd-video" hidden aria-label="Animacja wprowadzająca">
        <video class="bd-video__el" id="bd-video-el" playsinline preload="none"></video>
        <img class="bd-freeze" id="bd-freeze" src="${poster()}" alt="">
        <div class="bd-video__ui">
          <button type="button" class="bd-btn bd-btn--ghost" id="bd-pause" aria-pressed="false">Pauza</button>
          <button type="button" class="bd-btn bd-btn--ghost" id="bd-mute" aria-pressed="false">Wycisz</button>
          <button type="button" class="bd-btn" id="bd-skip">Pomiń intro</button>
        </div>
      </section>

      <section class="bd-layer bd-board" id="bd-board" hidden aria-label="Tablica śledztwa">
        <div class="bd-frame" id="bd-frame">
          <div class="bd-scene" id="bd-scene">
            <div class="bd-scene__bg" id="bd-scene-bg"></div>
            <svg class="bd-thread" id="bd-thread" preserveAspectRatio="none" aria-hidden="true">
              <path id="bd-thread-path" d=""></path>
            </svg>
            <div class="bd-notes" id="bd-notes" aria-hidden="true"></div>
            <div class="bd-pols" id="bd-pols"></div>
          </div>
        </div>
      </section>

      <!-- Stały klaster kontrolek: leży POZA transformowaną sceną i poza polem
           tablicy, więc nigdy nie zasłania polaroidów, kartek, pinezek ani nici.
           Korekta T-ANIM.1: „Pomiń animację" nie jest już osobnym przyciskiem —
           pominięciem jest kliknięcie w sam polaroid (wzrok ucznia jest tam,
           nie w rogu ekranu). -->
      <div class="bd-boardbar" id="bd-boardbar">
        <p class="bd-boardbar__title">Tablica śledztwa</p>
        <div class="bd-boardbar__actions">
          <button type="button" class="bd-btn bd-btn--ghost bd-btn--sm" id="bd-replay">Odtwórz intro ponownie</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    Object.assign(el, {
      root,
      start: document.getElementById("bd-start"),
      video: document.getElementById("bd-video"),
      board: document.getElementById("bd-board"),
      introVideo: document.getElementById("bd-video-el"),
      freeze: document.getElementById("bd-freeze"),
      frame: document.getElementById("bd-frame"),
      scene: document.getElementById("bd-scene"),
      thread: document.getElementById("bd-thread"),
      threadPath: document.getElementById("bd-thread-path"),
      notes: document.getElementById("bd-notes"),
      pols: document.getElementById("bd-pols"),
      boardbar: document.getElementById("bd-boardbar"),
    });
    applyBoardImage();
  }

  /** Preload 9 miniatur tablicy (frameStart), żeby po zakończeniu/pominięciu
      intro tablica pojawiła się z gotowymi zdjęciami zamiast szarych pól.
      Start ładowania NIE czeka na żadne zdarzenie — wywoływane od razu przy
      starcie silnika (jeszcze na ekranie startowym), więc w normalnym
      przebiegu (intro trwa kilka sekund) obrazy zdążą się wczytać. Krótki
      timeout bezpieczeństwa gwarantuje, że pojedynczy wolny/martwy plik
      nigdy nie zablokuje wejścia na tablicę. Każdy URL ładowany jest raz
      (ta sama przeglądarkowa pamięć podręczna, z której korzysta później
      właściwy <img>). Zdjęcia i podpisy pozostają bez zmian. */
  function preloadThumbnails() {
    const loaders = CFG.chapters.map((c) => new Promise((res) => {
      const img = new Image();
      img.onload = img.onerror = () => res();
      img.src = c.frameStart;
    }));
    const safety = new Promise((res) => setTimeout(res, 1500));
    return Promise.race([Promise.all(loaders), safety]);
  }

  function applyBoardImage() {
    const portrait = isPortrait();
    const r = document.documentElement.style;
    r.setProperty("--bd-board-img", `url("${portrait ? CFG.assets.boardMobile : CFG.assets.boardDesktop}")`);
    r.setProperty("--bd-ar", portrait ? "9 / 16" : "16 / 9");
    r.setProperty("--bd-ar-num", portrait ? "0.5625" : "1.7778");
  }

  /** Kadr tablicy w PIKSELACH: wpisany w realne wymiary warstwy .bd-board,
      z zachowaniem proporcji planszy. Jednostki vw/dvh i % bywały liczone
      różnie w różnych środowiskach — piksele są jednoznaczne wszędzie. */
  function sizeFrame() {
    const bw = el.board.clientWidth || innerWidth;
    const bh = el.board.clientHeight || innerHeight;
    if (!bw || !bh) return;
    const ar = isPortrait() ? 9 / 16 : 16 / 9;
    const w = Math.min(bw, bh * ar);
    el.frame.style.width = w.toFixed(1) + "px";
    el.frame.style.height = (w / ar).toFixed(1) + "px";
  }

  /* ── elementy sceny ──────────────────────────────────────────── */
  const STATUS = {
    active: "Aktywny trop — otwórz", available: "Dostępny — otwórz",
    locked: "Dostępne w kolejnych etapach", completed: "Ukończony",
  };

  function place(node, p) {
    node.style.setProperty("--x", p.x);
    node.style.setProperty("--y", p.y);
    node.style.setProperty("--w", p.w);
    node.style.setProperty("--rot", p.rot);
  }
  function placePin(node, p) {
    if (!p.pin) return;
    node.style.setProperty("--px", p.pin.x);
    node.style.setProperty("--py", p.pin.y);
    node.style.setProperty("--pw", p.pin.w);
  }

  function buildScene() {
    const key = layoutKey();
    el.pols.innerHTML = "";
    el.notes.innerHTML = "";

    /* kartki — czysta dekoracja; pineska tylko, gdy konfiguracja ma `pin` */
    CFG.notes.forEach((n) => {
      const p = n[key];
      const note = h("div", "bd-note");
      note.id = "bd-" + n.id;
      place(note, p);
      note.innerHTML = '<img class="bd-note__img" src="' + n.img + '" alt="" loading="lazy">';
      el.notes.appendChild(note);
      if (p.pin) {
        const npin = h("div", "bd-pinwrap");
        npin.id = "bd-pin-" + n.id;
        placePin(npin, p);
        npin.innerHTML = '<img src="' + p.pin.img + '" alt="">';
        el.notes.appendChild(npin);
      }
    });

    /* polaroidy */
    CFG.chapters.forEach((c, i) => {
      const p = c[key];
      const btn = h("button", "bd-pol");
      btn.type = "button";
      btn.id = "bd-" + c.id;
      btn.dataset.chapter = c.id;
      btn.dataset.state = c.state;
      place(btn, p);
      btn.disabled = c.state === "locked";
      btn.setAttribute("aria-label", `Trop ${i + 1} z 9: ${c.title}. ${c.lead}. ${STATUS[c.state]}.`);
      btn.innerHTML = `
        <span class="bd-pol__card">
          <span class="bd-pol__photo">
            <img class="bd-pol__img" src="${c.state === "completed" ? c.frameEnd : c.frameStart}"
                 alt="" loading="lazy" decoding="async">
            <video class="bd-pol__video" playsinline preload="none" hidden></video>
          </span>
          <span class="bd-pol__cap">${i + 1}. ${c.title}
            <span class="bd-pol__status">${STATUS[c.state]}</span></span>
        </span>
        <span class="bd-pol__hint" aria-hidden="true">Kliknij, aby wejść od razu</span>`;
      btn.addEventListener("click", () => openChapter(c.id));
      /* Zabezpieczenie (Etap 1E): chwilowy błąd sieci nie może zostawić pustej
         ramki — jedno ponowienie z pominięciem cache, potem jawne tło ramki
         (kadr ma stały wymiar z aspect-ratio, więc układ się nie rusza). */
      const foto = btn.querySelector(".bd-pol__img");
      foto.addEventListener("error", () => {
        if (!foto.dataset.retry) {
          foto.dataset.retry = "1";
          foto.src = foto.src.split("?")[0] + "?r=" + Date.now();
        } else {
          btn.classList.add("bd-pol--bezfoto");
        }
      });
      el.pols.appendChild(btn);

      if (p.pin) {
        const wrap = h("div", "bd-pinwrap");
        wrap.id = "bd-wrap-" + c.id;
        placePin(wrap, p);
        const pin = document.createElement("img");
        pin.src = p.pin.img; pin.alt = "";
        wrap.appendChild(pin);
        el.pols.appendChild(wrap);
      }
    });
    scheduleThread();
  }

  function relayoutScene() {
    const key = layoutKey();
    CFG.notes.forEach((n) => {
      const node = document.getElementById("bd-" + n.id);
      const np = document.getElementById("bd-pin-" + n.id);
      if (node) place(node, n[key]);
      if (np && n[key].pin) {
        placePin(np, n[key]);
        const i = np.querySelector("img");
        if (i) i.src = n[key].pin.img;
      }
    });
    CFG.chapters.forEach((c) => {
      const btn = document.getElementById("bd-" + c.id);
      const wrap = document.getElementById("bd-wrap-" + c.id);
      if (btn) place(btn, c[key]);
      if (wrap && c[key].pin) {
        placePin(wrap, c[key]);
        const pinImg = wrap.querySelector("img");
        if (pinImg) pinImg.src = c[key].pin.img;
      }
    });
    scheduleThread();
  }

  /* ── nić ─────────────────────────────────────────────────────── */
  let threadTimer = 0, threadRevealed = false;
  function scheduleThread() {
    requestAnimationFrame(drawThread);
    clearTimeout(threadTimer);
    threadTimer = setTimeout(drawThread, 180);
  }
  function drawThread() {
    const fr = el.frame.getBoundingClientRect();
    if (!fr.width || !fr.height) return;
    const key = layoutKey();
    el.thread.setAttribute("viewBox", `0 0 ${Math.round(fr.width)} ${Math.round(fr.height)}`);

    const pts = CFG.threadOrder
      .map((id) => CFG.chapters.find((c) => c.id === id))
      .filter((c) => c && c[key].pin)
      .map((c) => [c[key].pin.x / 100 * fr.width, c[key].pin.y / 100 * fr.height]);
    if (pts.length < 2) return;

    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const sag = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.07, 26);
      d += ` Q${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2 + sag).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }
    el.threadPath.setAttribute("d", d);
    const len = el.threadPath.getTotalLength();
    el.threadPath.style.strokeDasharray = len;
    el.threadPath.style.strokeDashoffset = (reduceMotion || threadRevealed) ? 0 : len;
  }

  /* ── KAMERA: transform całej sceny ───────────────────────────── */
  function camApply(x, y, zoom) {
    const fr = el.frame.getBoundingClientRect();
    if (!fr.width) return;
    const tx = x / 100 * fr.width, ty = y / 100 * fr.height;
    const dx = fr.width / 2 - tx, dy = fr.height / 2 - ty;
    el.scene.style.transformOrigin = `${tx}px ${ty}px`;
    el.scene.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${zoom})`;
  }
  function camReset(animate) {
    el.scene.style.transition = animate && !reduceMotion
      ? `transform ${CAM.zoomMs}ms cubic-bezier(.22,.61,.36,1)` : "none";
    el.scene.style.transformOrigin = "50% 50%";
    el.scene.style.transform = "none";
  }
  function camTo(x, y, zoom, ms, ease) {
    return new Promise((res) => {
      if (reduceMotion) { el.scene.style.transition = "none"; camApply(x, y, zoom); res(); return; }
      el.scene.style.transition = `transform ${ms}ms ${ease || "cubic-bezier(.22,.61,.36,1)"}`;
      camApply(x, y, zoom);
      clearTimeout(camTimer);
      camTimer = setTimeout(res, ms + 40);
    });
  }
  /** Podróż wzdłuż nici: interpolacja między pinezkami z łukiem oddalenia,
      żeby uczeń widział trasę, a nie tylko zbliżenie. */
  function camTravel(fromId, toId, ms) {
    return new Promise((res) => {
      const key = layoutKey();
      const a = CFG.chapters.find((c) => c.id === fromId)[key].pin;
      const b = CFG.chapters.find((c) => c.id === toId)[key].pin;
      if (reduceMotion) { camApply(b.x, b.y, CAM.zoom); res(); return; }
      el.scene.style.transition = "none";
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      cancelAnimationFrame(camRaf);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        const x = a.x + (b.x - a.x) * e;
        const y = a.y + (b.y - a.y) * e;
        const dip = Math.sin(Math.PI * t);           /* zoom → 1.35 → zoom */
        camApply(x, y, CAM.zoom - dip * (CAM.zoom - 1.35));
        if (t < 1) camRaf = requestAnimationFrame(step);
        else { camRaf = 0; res(); }
      };
      camRaf = requestAnimationFrame(step);
      clearTimeout(camTimer);
      camTimer = setTimeout(() => { cancelAnimationFrame(camRaf); camRaf = 0; res(); }, ms + 400);
    });
  }

  /* ── warstwy ─────────────────────────────────────────────────── */
  function show(layer) {
    [el.start, el.video, el.board].forEach((n) => { n.hidden = n !== layer; });
    el.boardbar.hidden = layer !== el.board;
  }

  /* ── NARRATOR INTRO (Etap A1) ─────────────────────────────────
     Głos wchodzi w 2. sekundzie i gra RÓWNOLEGLE ze ścieżką intro —
     stąd osobny element, a nie kanał menedżera audio. Plik dociąga się
     dopiero przy pierwszym uruchomieniu intro (`preload="none"`, źródło
     przypinane w chwili startu), więc uczeń, który intro pomija, nie
     pobiera ani bajta. Wejście liczymy z `timeupdate`, nie zegarem: przy
     buforowaniu `setTimeout` odpaliłby głos nad nieruchomym kadrem. */
  let narrator = null;
  let narratorNaCzas = null;      // nasłuch timeupdate na filmie intro
  let introBezDzwieku = false;    // przeglądarka nie dała zgody na dźwięk

  function narratorStop() {
    if (narratorNaCzas && el.introVideo) {
      el.introVideo.removeEventListener("timeupdate", narratorNaCzas);
      narratorNaCzas = null;
    }
    if (!narrator) return;
    try { narrator.pause(); narrator.currentTime = 0; } catch (e) { /* przed metadanymi */ }
  }

  function narratorUzbroj(v) {
    const CFGa = CFG.assets;
    if (!CFGa.introVoice) return;
    narratorStop();
    if (!narrator) {
      narrator = new Audio();
      narrator.preload = "none";
    }
    narrator.muted = v.muted;
    let ruszyl = false;
    narratorNaCzas = () => {
      if (ruszyl || introBezDzwieku) return;
      if (v.currentTime < (CFGa.introVoiceStart || 2)) return;
      ruszyl = true;
      v.removeEventListener("timeupdate", narratorNaCzas);
      narratorNaCzas = null;
      /* jedno nagranie naraz: narracja sceny milknie na czas intro */
      if (NS.audio && NS.audio.suspend) NS.audio.suspend("Trwa animacja wprowadzająca.");
      if (!narrator.src) narrator.src = CFGa.introVoice;   /* dopiero teraz pobranie */
      try { narrator.currentTime = 0; } catch (e) { /* przed metadanymi */ }
      const p = narrator.play();
      if (p && p.catch) p.catch(() => { /* brak zgody na dźwięk — intro gra dalej */ });
    };
    v.addEventListener("timeupdate", narratorNaCzas);
  }

  /* Etap A2 (pkt 8): wyjście ze strony ucisza narratora intro. Menedżer
     audio robi to samo dla narracji scen i klipów — tu potrzebny osobny
     nasłuch, bo narrator ma własny element. Po powrocie NIC nie wznawia
     się samo: uczeń, który wrócił po dłuższej chwili, nie powinien być
     zaskakiwany głosem w tle. */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !narrator) return;
    try { narrator.pause(); } catch (e) { /* przed metadanymi */ }
  });

  /* ── INTRO ───────────────────────────────────────────────────── */
  function playIntro() {
    if (chapterView()) closeChapterInstant();
    stopAllMedia();
    show(el.video);
    el.freeze.classList.remove("is-on");
    el.freeze.src = isPortrait() ? CFG.assets.posterPortrait : CFG.assets.posterLandscape;
    const v = el.introVideo;
    v.src = isPortrait() ? CFG.assets.introPortrait : CFG.assets.introLandscape;
    v.muted = false;
    /* każdy start intro zaczyna od spójnego stanu kontrolek */
    const pauseBtn = document.getElementById("bd-pause");
    pauseBtn.textContent = "Pauza";
    pauseBtn.setAttribute("aria-pressed", "false");
    const muteBtn = document.getElementById("bd-mute");
    muteBtn.textContent = v.muted ? "Włącz dźwięk" : "Wycisz";
    muteBtn.setAttribute("aria-pressed", v.muted ? "true" : "false");
    currentVideo = v;
    introBezDzwieku = false;
    narratorUzbroj(v);                 /* głos wchodzi w 2. sekundzie */
    const p = v.play();
    if (p && p.catch) p.catch(() => {
      v.muted = true;
      /* zejście na wariant bez dźwięku dotyczy CAŁEGO intro — narrator też
         milczy, inaczej mówiłby nad niemym filmem */
      introBezDzwieku = true;
      narratorStop();
      const m = document.getElementById("bd-mute");
      m.setAttribute("aria-pressed", "true"); m.textContent = "Włącz dźwięk";
      v.play().catch(() => enterBoard(true));
    });
    v.addEventListener("ended", () => enterBoard(false), { once: true });
    v.addEventListener("error", () => enterBoard(true), { once: true });
  }

  function enterBoard(instant) {
    if (!instant && !reduceMotion) {
      el.freeze.classList.add("is-on");
      setTimeout(() => { stopVideo(el.introVideo); showBoard(); }, 200);
    } else { stopVideo(el.introVideo); showBoard(); }
  }

  /** STEMPEL „SPRAWA ZAMKNIĘTA" (Etap 6A).
      Pieczęć leży W SCENIE tablicy, więc jeździ i skaluje się razem z nią
      jak polaroidy — nie jest nakładką na ekranie. Pojawia się wyłącznie
      przy domkniętej sprawie (`caseClosed`, czyli komplet dowodów PLUS
      finał Tropu 9) i tylko raz: powtórne wejścia zastają ją na miejscu.
      Tablica zostaje otwarta — stempel niczego nie blokuje. */
  function stempelSprawy(opcje) {
    const S = NS.state;
    const scena = el.scene;
    if (!scena) return;
    const jest = scena.querySelector(".bd-stempel");
    /* Dwa pytania, nie jedno (Etap 6B.4). `caseClosed` mieszka w
       localStorage i przeżywa zamknięcie przeglądarki, a stany tropów
       tablicy — w sessionStorage, więc giną razem z sesją. Uczeń, który
       wracał nazajutrz, zastawał tablicę od nowa (P01 aktywny, reszta
       zamknięta) i pieczęć na niej: pamięć trwała mówiła „zamknięte",
       tablica pokazywała „start". Pieczęć musi zgadzać się z tym, co
       widać, więc pytamy też tablicę o Trop 9. */
    const p09 = CFG.chapters.find((c) => c.id === "p09");
    const zamknieta = !!(S && S.get && S.get().caseClosed) &&
      !!(p09 && p09.state === "completed");
    if (!zamknieta) { if (jest) jest.remove(); return; }
    if (jest) return;
    const st = h("div", "bd-stempel");
    st.setAttribute("role", "img");
    st.setAttribute("aria-label", "Sprawa zamknięta");
    /* Pieczęć rysujemy w SVG z viewBoxem, nie pudełkami CSS: scena tablicy
       jest skalowana transformacją kamery, więc grubość ramki i stopień
       pisma podane w jednostkach okna rozjeżdżałyby się przy każdym
       przybliżeniu. W SVG wszystko skaluje się razem z elementem. */
    st.innerHTML =
      '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
      + '<rect x="4" y="4" width="92" height="92" rx="14" ry="14"'
      + ' fill="rgba(255,246,240,.14)" stroke="#b4231d" stroke-width="5"/>'
      + '<rect x="11" y="11" width="78" height="78" rx="9" ry="9"'
      + ' fill="none" stroke="#b4231d" stroke-width="1.6" opacity=".7"/>'
      + '<text x="50" y="44" text-anchor="middle" fill="#b4231d"'
      + ' font-family="Cabinet Grotesk, system-ui, sans-serif"'
      + ' font-weight="700" font-size="17" letter-spacing="1">SPRAWA</text>'
      + '<text x="50" y="66" text-anchor="middle" fill="#b4231d"'
      + ' font-family="Cabinet Grotesk, system-ui, sans-serif"'
      + ' font-weight="700" font-size="13.4" letter-spacing="0.6">ZAMKNIĘTA</text>'
      + "</svg>";
    /* Przybicie należy do CHWILI domknięcia sprawy — przy zwykłym wejściu
       na tablicę pieczęć po prostu leży na aktach. Przy ograniczonym ruchu
       nie ma uderzenia w ogóle. */
    if (opcje && opcje.przybij && !reduceMotion) st.classList.add("is-przybity");
    scena.appendChild(st);
  }

  async function showBoard(skipReveal) {
    /* Wejście na tablicę zamyka temat intro na tę sesję — niezależnie od tego,
       czy film doleciał do końca, czy uczeń go pominął. */
    markIntroSeen();
    /* preload wystartował już na ekranie startowym — w normalnym przebiegu
       ta pauza jest praktycznie zerowa; ograniczona timeoutem bezpieczeństwa */
    await thumbsReady;
    show(el.board);
    el.freeze.classList.remove("is-on");
    sizeFrame();                      /* wymiary dopiero, gdy warstwa widoczna */
    if (!el.pols.children.length) buildScene();
    stempelSprawy();
    camReset(false);
    if (skipReveal || reduceMotion) instantReveal(); else animateReveal();
    focusActive();
    announce("Tablica śledztwa. Dziewięć tropów. Otwórz pierwszy trop.");
  }

  function animateReveal() {
    const items = Array.from(el.pols.children).concat(Array.from(el.notes.children));
    items.forEach((n) => n.classList.remove("is-in"));
    const pols = Array.from(el.pols.querySelectorAll(".bd-pol"));
    pols.forEach((p, i) => {
      const wrap = document.getElementById("bd-wrap-" + p.dataset.chapter);
      setTimeout(() => { p.classList.add("is-in"); if (wrap) wrap.classList.add("is-in"); }, 120 + i * 120);
    });
    Array.from(el.notes.children).forEach((n, i) =>
      setTimeout(() => n.classList.add("is-in"), 300 + i * 140));
    setTimeout(() => {
      threadRevealed = true;
      el.threadPath.style.transition = "stroke-dashoffset 1.7s ease";
      el.threadPath.style.strokeDashoffset = 0;
    }, 120 + pols.length * 120);
  }
  function instantReveal() {
    Array.from(el.pols.children).forEach((n) => n.classList.add("is-in"));
    Array.from(el.notes.children).forEach((n) => n.classList.add("is-in"));
    threadRevealed = true;
    el.threadPath.style.transition = "none";
    el.threadPath.style.strokeDashoffset = 0;
  }
  function focusActive() {
    const act = el.pols.querySelector('.bd-pol[data-state="active"]') || document.getElementById("bd-p01");
    if (act) act.focus({ preventScroll: true });
  }

  /* ── OTWARCIE TROPU (storyboard 1→3) ─────────────────────────── */
  async function openChapter(id) {
    const c = CFG.chapters.find((x) => x.id === id);
    if (!c || c.state === "locked" || openedChapter) return;
    openedChapter = c;
    const p = c[layoutKey()];
    announce(`Otwieram trop: ${c.title}.`);
    await camTo(p.x, p.y, CAM.zoom, CAM.zoomMs);
    await playInPolaroid(c);
  }

  /** POMINIĘCIE ANIMACJI POLAROIDU (korekta T-ANIM.1).
      Jeden uchwyt na moduł: podczas grającej animacji wskazuje na `finish(true)`
      bieżącego polaroidu, poza nią jest pusty. Wołają go: klik w polaroid
      (a przez natywne zachowanie `<button>` także Enter i Spacja) oraz Escape.
      Dawny przycisk „Pomiń animację" stał w rogu ekranu, a wzrok ucznia był na
      polaroidzie — źródłem pominięcia jest więc sam polaroid. */
  let pominAnimacje = null;

  /** Animacja WEWNĄTRZ pola zdjęcia polaroidu — bez modalu i czarnego tła;
      ramka, pineska i korek pozostają w kadrze. */
  function playInPolaroid(c) {
    return new Promise((res) => {
      const btn = document.getElementById("bd-" + c.id);
      const img = btn.querySelector(".bd-pol__img");
      const vid = btn.querySelector(".bd-pol__video");
      btn.classList.add("is-open");

      /* Klik w polaroid z grającą animacją = wejście od razu. Listener siedzi
         w fazie CAPTURE, żeby wyprzedzić `openChapter` z tego samego przycisku
         (który w trakcie animacji i tak wychodzi na strażniku `openedChapter`)
         i nie zależeć od kolejności rejestracji. */
      const onPomin = (e) => { e.stopPropagation(); finish(true); };
      let hintTimer = 0;
      const ariaOryginal = btn.getAttribute("aria-label");

      const finish = (skipped) => {
        if (finish.done) return;
        finish.done = true;
        pominAnimacje = null;
        clearTimeout(hintTimer);
        btn.removeEventListener("click", onPomin, true);
        btn.classList.remove("is-anim", "is-hint");
        if (ariaOryginal !== null) btn.setAttribute("aria-label", ariaOryginal);
        stopVideo(vid);
        vid.hidden = true;
        img.hidden = false;
        img.src = c.frameEnd;                       /* klatka końcowa na moment */
        setTimeout(() => revealContent(c), skipped ? 120 : 380);
        res();
      };

      if (!c.anim || reduceMotion) { finish(true); return; }

      pominAnimacje = () => finish(true);
      btn.addEventListener("click", onPomin, true);
      btn.classList.add("is-anim");
      btn.setAttribute("aria-label", "Pomiń animację i wejdź do tropu");
      btn.focus({ preventScroll: true });
      /* dyskretny podpis pod polaroidem — dopiero po sekundzie, żeby nie
         konkurował z pierwszymi klatkami animacji */
      hintTimer = setTimeout(() => btn.classList.add("is-hint"), 1000);

      stopAllMedia();
      img.hidden = true;
      vid.hidden = false;
      vid.src = c.anim;
      currentVideo = vid;
      const pr = vid.play();
      if (pr && pr.catch) pr.catch(() => finish(true));
      vid.addEventListener("ended", () => finish(false), { once: true });
      vid.addEventListener("error", () => finish(true), { once: true });
    });
  }

  /* ── PRZEMIANA POLAROID → STRONA (storyboard 4→5) ────────────── */
  const chapterView = () => document.getElementById("bd-chapterlay");

  /** Jeden ciągły ruch: kamera dopycha zoom tak, aby karta polaroidu
      osiągnęła szerokość przyszłej strony; w trakcie dopchnięcia strona
      wjeżdża crossfadem. Reset kamery następuje dopiero POD nieprzezroczystą
      stroną — bez widocznego cofnięcia. */
  async function revealContent(c) {
    const btn = document.getElementById("bd-" + c.id);
    const view = buildChapterView(c);

    if (reduceMotion) {
      view.classList.add("bd-chapterlay--instant", "is-on");
      camReset(false);
      focusChapterHead(view, c, true);
      wakeChapter(view);
      return;
    }

    /* docelowa szerokość strony (mobile ~94vw, desktop ~77% do 1240px) */
    const pageW = isPortrait() || innerWidth < 900
      ? Math.min(innerWidth * 0.94, 1240)
      : Math.min(innerWidth * 0.77, 1240);
    const card = btn.querySelector(".bd-pol__card").getBoundingClientRect();
    const p = c[layoutKey()];
    const zFinal = Math.min(Math.max(CAM.zoom * pageW / Math.max(card.width, 1), CAM.zoom + 0.6), 9.5);

    /* dopchnięcie kamery (przyspieszające) + crossfade strony */
    camTo(p.x, p.y, zFinal, CAM.morphMs, "cubic-bezier(.5,.05,.75,.5)");
    setTimeout(() => view.classList.add("is-on"), Math.round(CAM.morphMs * 0.45));
    await new Promise((r) => setTimeout(r, CAM.morphMs + CAM.fadeMs * 0.6));

    camReset(false);                    /* niewidoczne — strona jest nieprzezroczysta */
    focusChapterHead(view, c, false);
    wakeChapter(view);
  }

  /** Rozdział otwarty automatycznie (podróż P02→P03) nie dostaje żadnego
      gestu przewijania, więc obserwatory leniwego ładowania nigdy by nie
      wystartowały — gra Genially zostałaby pustym prostokątem. Budzimy je
      jawnie, dwa razy: po wstawieniu strony i po ustabilizowaniu układu. */
  function wakeChapter(view) {
    syncBarHeight(view);
    nudgeWatchers();
    requestAnimationFrame(() => { syncBarHeight(view); nudgeWatchers(); });
    setTimeout(nudgeWatchers, 260);
  }

  function focusChapterHead(view, c, instant) {
    const head = view.querySelector("#bd-slot-a h1, #bd-slot-a h2, #bd-slot-a .lead")
      || view.querySelector(".bd-page__crumb");
    if (!head) return;
    head.setAttribute("tabindex", "-1");
    setTimeout(() => head.focus({ preventScroll: true }), instant ? 0 : 60);
    announce(`Otwarto rozdział: ${c.title}.`);
  }

  /** Przeniesienie klocka lekcji (nie kopia) do wskazanego slotu.
      Kotwica-komentarz pozwala oddać węzeł dokładnie na swoje miejsce. */
  function moveBlockInto(blockId, slot) {
    const node = document.getElementById(blockId);
    if (!node || moved.some((m) => m.node === node)) return null;
    const anchor = document.createComment("bd-anchor-" + blockId);
    node.parentNode.insertBefore(anchor, node);
    slot.appendChild(node);
    moved.push({ node, anchor });
    /* Twarde spacje w tytułach sklejają słowa w jeden segment i na wąskiej
       stronie wymuszają poziomy scroll — na czas rozdziału zamieniamy je na
       zwykłe spacje; unmountChapter przywraca oryginał. */
    node.querySelectorAll(".lead, h1, h2").forEach((n) => {
      if (n.innerHTML.indexOf(NBSP) === -1 && n.innerHTML.indexOf("&nbsp;") === -1) return;
      titleFixes.push({ el: n, html: n.innerHTML });
      n.innerHTML = n.innerHTML.split(NBSP).join(" ").split("&nbsp;").join(" ");
    });
    return node;
  }

  function evidenceHtml(c, idx) {
    const play = c.video
      ? `<button type="button" class="bd-play" id="bd-film-play"
           aria-label="Odtwórz film: ${c.video.title}" aria-haspopup="dialog">
           <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
             <path d="M8 5.5v13l11-6.5z"/></svg>
         </button>`
      : "";
    const cap = c.video
      ? `Dowód nr ${idx + 1} — nagranie z biura detektywa`
      : `Dowód nr ${idx + 1}`;
    return `<figure class="bd-evidence">
        <span class="bd-evidence__media"><img src="${c.frameEnd}" alt="">${play}</span>
        <figcaption class="bd-evidence__cap">${cap}</figcaption>
      </figure>`;
  }

  /* Pasek pomocniczy — w rozdziale z dwiema scenami jest przyklejony
     (sticky), żeby „Wróć do tablicy" nie zniknęło po przewinięciu. */
  /* ═══════════════════════════════════════════════════════════════
     PANEL AUDIO W BELCE TROPU (Etap A3)

     Jeden mechanizm dźwięku (`NS.audio`), dwie prezentacje: niemodalny
     popover pod przyciskiem na szerokich ekranach i modalny arkusz przy
     dolnej krawędzi na telefonach. Panel nie trzyma własnego stanu —
     subskrybuje menedżera (`onUi`) i zmienia ustawienie wyłącznie przez
     `setMode`, więc chipy w Tropie 1, ten panel i panel starej lekcji
     zawsze pokazują to samo.
     ═══════════════════════════════════════════════════════════════ */
  const A3_PROG_ARKUSZ = 900;      /* ten sam próg, w którym belka staje się dwurzędowa */
  const trybArkusza = () => window.matchMedia("(max-width: " + A3_PROG_ARKUSZ + "px)").matches;

  function audioBtnHtml() {
    return `<button type="button" class="bd-btn bd-btn--dark bd-btn--sm bd-audiobtn"
            id="bd-audio-btn" aria-expanded="false" aria-controls="bd-audio-panel"
            aria-label="Dźwięk lekcji: tekst bez narracji. Otwórz ustawienia dźwięku">
        <span class="bd-audiobtn__ico" aria-hidden="true">Aa</span>
        <span class="bd-audiobtn__txt">Audio<span class="bd-audiobtn__tryb">: czytam</span></span>
      </button>`;
  }

  /** Dwie karty wyboru — wspólny wzorzec dla panelu i (w wersji chipów)
      dla Tropu 1. Cała karta jest klikalna, bo `<label>` obejmuje radio. */
  function kartyTrybuHtml(nazwaGrupy, kompakt) {
    const karta = (wartosc, ikona, tytul, opis) => `
      <label class="bd-audiocard${kompakt ? " bd-audiocard--chip" : ""}">
        <input type="radio" name="${nazwaGrupy}" value="${wartosc}" class="bd-audiocard__radio">
        <span class="bd-audiocard__in">
          <span class="bd-audiocard__ico" aria-hidden="true">${ikona}</span>
          <span class="bd-audiocard__txt">
            <span class="bd-audiocard__name">${tytul}</span>
            ${kompakt ? "" : `<span class="bd-audiocard__desc">${opis}</span>`}
          </span>
          <span class="bd-audiocard__check" aria-hidden="true">✓</span>
        </span>
      </label>`;
    return karta("read", "Aa", "Czytam", "Tekst bez narracji") +
           karta("both", "🔊", "Czytam i słucham", "Tekst i narracja razem");
  }

  function audioPanelHtml() {
    return `<div class="bd-audiopanel" id="bd-audio-panel" hidden>
        <div class="bd-audiopanel__box" id="bd-audio-box" aria-labelledby="bd-audio-title">
          <button type="button" class="bd-audiopanel__close" id="bd-audio-close"
                  aria-label="Zamknij ustawienia dźwięku">✕</button>
          <p class="bd-audiopanel__kicker">DŹWIĘK LEKCJI</p>
          <h2 class="bd-audiopanel__title" id="bd-audio-title">Jak chcesz poznawać tropy?</h2>
          <div class="bd-audiopanel__cards" role="radiogroup" aria-labelledby="bd-audio-title">
            ${kartyTrybuHtml("bd-audio-mode", false)}
          </div>
          <div class="bd-audiopanel__now">
            <p class="bd-audiopanel__nowlab">TERAZ</p>
            <p class="bd-audiopanel__scene" id="bd-audio-scene">—</p>
            <p class="bd-audiopanel__status" id="bd-audio-status" role="status" aria-live="polite"></p>
          </div>
          <div class="bd-audiopanel__row" id="bd-audio-controls" hidden>
            <button type="button" class="bd-audiopanel__btn bd-audiopanel__btn--main" id="bd-audio-play">Odtwórz</button>
            <button type="button" class="bd-audiopanel__btn" id="bd-audio-restart">Od początku</button>
          </div>
        </div>
      </div>`;
  }

  /** Panel + przycisk w belce rozdziału. Wołane dla KAŻDEGO tropu. */
  function wireAudioUI(view) {
    const btn = view.querySelector("#bd-audio-btn");
    if (!btn || !NS.audio) return;
    view.insertAdjacentHTML("beforeend", audioPanelHtml());
    const panel = view.querySelector("#bd-audio-panel");
    const box = view.querySelector("#bd-audio-box");
    const zamknij = view.querySelector("#bd-audio-close");
    const scena = view.querySelector("#bd-audio-scene");
    const status = view.querySelector("#bd-audio-status");
    const sterowanie = view.querySelector("#bd-audio-controls");
    const play = view.querySelector("#bd-audio-play");
    const restart = view.querySelector("#bd-audio-restart");
    const radia = Array.from(panel.querySelectorAll('input[name="bd-audio-mode"]'));
    let otwarty = false;

    /* ── prezentacja: popover czy arkusz ── */
    const ustawTryb = () => {
      const arkusz = trybArkusza();
      panel.classList.toggle("is-arkusz", arkusz);
      panel.classList.toggle("is-popover", !arkusz);
      if (arkusz) {
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
      } else {
        box.setAttribute("role", "group");
        box.removeAttribute("aria-modal");
      }
    };
    ustawTryb();
    const mq = window.matchMedia("(max-width: " + A3_PROG_ARKUSZ + "px)");
    const naZmianeProgu = () => { ustawTryb(); if (otwarty) pozycjonuj(); };
    if (mq.addEventListener) mq.addEventListener("change", naZmianeProgu);
    chapterCleanup.push(() => { if (mq.removeEventListener) mq.removeEventListener("change", naZmianeProgu); });

    /* popover kotwiczy się pod przyciskiem, wyrównany do jego prawej krawędzi */
    const pozycjonuj = () => {
      if (trybArkusza()) { box.style.left = ""; box.style.top = ""; return; }
      const r = btn.getBoundingClientRect();
      const vr = view.getBoundingClientRect();
      const szer = box.offsetWidth || 320;
      let left = r.right - vr.left - szer;
      left = Math.max(12, Math.min(left, vr.width - szer - 12));
      box.style.left = Math.round(left) + "px";
      box.style.top = Math.round(r.bottom - vr.top + 10) + "px";
    };

    /* ── otwieranie i zamykanie ── */
    /* Grupa radiowa to dla klawiatury JEDEN przystanek (Tab wchodzi i wychodzi,
       strzałki przełączają w środku) — więc do listy bierzemy z niej wyłącznie
       zaznaczone pole. Bez tego pułapka wypuszczała fokus na stronę, bo za
       „ostatni" uznawała pole, którego Tab i tak nie odwiedza. */
    const fokusowalne = () => Array.from(box.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((n) => n.offsetParent !== null || n.type === "radio")
      .filter((n) => n.type !== "radio" || n.checked);

    const pulapka = (e) => {
      if (e.key !== "Tab" || !trybArkusza() || !otwarty) return;
      const lista = fokusowalne();
      if (!lista.length) return;
      const pierwszy = lista[0], ostatni = lista[lista.length - 1];
      const akt = document.activeElement;
      /* Fokus poza arkuszem — wracamy do środka. Bez tego Tab uciekał na
         stronę pod arkuszem (pomiar regresji A3: 6 z 7 tabów poza panelem),
         bo po otwarciu fokus siadał na tytule, który sam kontrolką nie jest. */
      if (!box.contains(akt)) { e.preventDefault(); (e.shiftKey ? ostatni : pierwszy).focus(); return; }
      if (e.shiftKey && akt === pierwszy) { e.preventDefault(); ostatni.focus(); }
      else if (!e.shiftKey && akt === ostatni) { e.preventDefault(); pierwszy.focus(); }
    };

    const otworz = () => {
      if (otwarty) return;
      otwarty = true;
      panel.hidden = false;
      ustawTryb();
      pozycjonuj();
      btn.setAttribute("aria-expanded", "true");
      /* Trop 5 jeździ slajdami na kółko i klawiaturę — na czas otwartego
         panelu nawigacja slajdów milknie, żeby scena nie uciekała spod
         palca (ryzyko 3 z preflightu A3). */
      view.dataset.bdAudioOpen = "1";
      requestAnimationFrame(() => {
        const cel = trybArkusza()
          ? (zamknij || fokusowalne()[0])
          : (radia.find((r) => r.checked) || radia[0] || zamknij);
        if (cel) { if (cel.tabIndex < 0 && !cel.matches("input")) cel.tabIndex = -1; cel.focus({ preventScroll: true }); }
      });
    };

    const zamknijPanel = (wrocFokus) => {
      if (!otwarty) return;
      otwarty = false;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      delete view.dataset.bdAudioOpen;
      if (wrocFokus) btn.focus({ preventScroll: true });
    };

    btn.addEventListener("click", () => { if (otwarty) zamknijPanel(true); else otworz(); });
    zamknij.addEventListener("click", () => zamknijPanel(true));

    /* Klik poza panelem zamyka go, ale NIE odbiera kliknięcia — kontrolka
       pod kursorem działa od razu, bez drugiego kliknięcia (errata E6). */
    const naDokumencie = (e) => {
      if (!otwarty) return;
      if (box.contains(e.target) || btn.contains(e.target)) return;
      if (trybArkusza()) { e.preventDefault(); e.stopPropagation(); }
      zamknijPanel(false);
    };
    document.addEventListener("pointerdown", naDokumencie, true);
    chapterCleanup.push(() => document.removeEventListener("pointerdown", naDokumencie, true));

    const naEscape = (e) => {
      if (e.key === "Escape" && otwarty) { e.stopPropagation(); zamknijPanel(true); return; }
      pulapka(e);
    };
    document.addEventListener("keydown", naEscape, true);
    chapterCleanup.push(() => document.removeEventListener("keydown", naEscape, true));

    const naScroll = () => { if (otwarty && !trybArkusza()) pozycjonuj(); };
    view.addEventListener("scroll", naScroll, { passive: true });
    window.addEventListener("resize", naScroll);
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", naScroll);
      window.removeEventListener("resize", naScroll);
    });

    /* ── kontrolki ── */
    radia.forEach((r) => r.addEventListener("change", () => {
      if (r.checked) NS.audio.setMode(r.value);
    }));
    play.addEventListener("click", () => {
      const stan = NS.audio.stanUi();
      if (stan.gra) NS.audio.pause();
      else { NS.audio.resumeAllowed(); NS.audio.play(false); }
    });
    restart.addEventListener("click", () => { NS.audio.resumeAllowed(); NS.audio.play(true); });

    /* ── render stanu (jedno źródło: menedżer) ── */
    const render = (d) => {
      radia.forEach((r) => { r.checked = (r.value === d.tryb); });
      panel.querySelectorAll(".bd-audiocard").forEach((k) => {
        const inp = k.querySelector("input");
        k.classList.toggle("is-on", !!(inp && inp.checked));
      });
      const zDzwiekiem = d.tryb === "both";
      btn.classList.toggle("is-dzwiek", zDzwiekiem);
      const ikona = btn.querySelector(".bd-audiobtn__ico");
      /* Etykieta ma dwie części, bo na telefonie w rzędzie stoją TRZY akcje
         i pełny wariant („Audio: czytam i słucham") wypychał je poza ekran.
         Wąskie ekrany chowają samą końcówkę trybu — zostaje „Audio”, a stan
         niosą dalej ikona (Aa / 🔊), obwódka `is-dzwiek` i `aria-label`. */
      const tryb = btn.querySelector(".bd-audiobtn__tryb");
      if (ikona) ikona.textContent = zDzwiekiem ? "🔊" : "Aa";
      if (tryb) tryb.textContent = zDzwiekiem ? ": czytam i słucham" : ": czytam";
      btn.setAttribute("aria-label", (zDzwiekiem
        ? "Dźwięk lekcji: tekst i narracja razem."
        : "Dźwięk lekcji: tekst bez narracji.") + " Otwórz ustawienia dźwięku");
      if (scena) scena.textContent = d.tytul || "—";
      if (status) status.textContent = d.status || "";
      if (sterowanie) sterowanie.hidden = !zDzwiekiem;
      if (play) {
        play.textContent = d.gra ? "Pauza" : "Odtwórz";
        play.setAttribute("aria-pressed", d.gra ? "true" : "false");
        play.disabled = !d.maNagranie;
      }
      if (restart) restart.disabled = !d.maNagranie;
    };
    const odepnij = NS.audio.onUi(render);
    chapterCleanup.push(odepnij);
    chapterCleanup.push(() => { const p = view.querySelector("#bd-audio-panel"); if (p) p.remove(); });
  }

  /** Chipy wyboru trybu w Tropie 1 (Etap A3, wariant B).
      Wstrzykiwane PRZEZ SILNIK — blok K01 jest wspólny ze starą lekcją,
      więc w `?legacy=1` chipy nie istnieją i wybór zostaje w panelu w rogu. */
  function wstrzyknijChipyK01(view) {
    const blok = view.querySelector("#k01");
    if (!blok || blok.querySelector(".bd-audiochips") || !NS.audio) return;
    const cta = blok.querySelector("a.btn, .btn");
    const wrap = h("div", "bd-audiochips");
    wrap.innerHTML = '<p class="bd-audiochips__q" id="bd-chips-q">Jak chcesz poznawać tropy?</p>' +
      '<div class="bd-audiochips__row" role="radiogroup" aria-labelledby="bd-chips-q">' +
      kartyTrybuHtml("bd-audio-mode-k01", true) + "</div>";
    if (cta && cta.parentNode) cta.parentNode.insertBefore(wrap, cta);
    else blok.appendChild(wrap);
    const radia = Array.from(wrap.querySelectorAll("input"));
    radia.forEach((r) => r.addEventListener("change", () => {
      if (r.checked) NS.audio.setMode(r.value);
    }));
    const render = (d) => {
      radia.forEach((r) => { r.checked = (r.value === d.tryb); });
      wrap.querySelectorAll(".bd-audiocard").forEach((k) => {
        const inp = k.querySelector("input");
        k.classList.toggle("is-on", !!(inp && inp.checked));
      });
    };
    const odepnij = NS.audio.onUi(render);
    chapterCleanup.push(odepnij);
    chapterCleanup.push(() => wrap.remove());
  }

  function barHtml(c, idx) {
    return `<div class="bd-page__bar" id="bd-page-bar">
        <p class="bd-page__crumb"><span class="bd-crumb__n">Trop ${idx + 1} z 9</span><span
          class="bd-crumb__t"> &bull; ${c.title}</span></p>
        <div class="bd-page__actions">
          ${audioBtnHtml()}
          ${c.anim ? '<button type="button" class="bd-btn bd-btn--dark bd-btn--sm" id="bd-ch-replay">Odtwórz animację</button>' : ""}
          <button type="button" class="bd-btn bd-btn--dark bd-btn--sm" id="bd-ch-back">&larr; Wróć do tablicy</button>
        </div>
      </div>`;
  }

  function dialogHtml(c) {
    if (!c.video) return "";
    return `<dialog class="bd-dialog" id="bd-dialog" aria-label="Film: ${c.video.title}">
        <div class="bd-dialog__bar">
          <p class="bd-dialog__title">Film: ${c.video.title}</p>
          <button type="button" class="bd-btn bd-btn--sm" id="bd-dialog-close">Zamknij ✕</button>
        </div>
        <div class="bd-dialog__frame">
          <iframe id="bd-yt" title="Film: ${c.video.title}"
            allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
        </div>
      </dialog>`;
  }

  /* ── P03: rozdział sześcioscenowy wokół GOTOWEJ gry Genially K04 ──
     Strona daje wyłącznie okno uruchamiające. Całe audio, grafiki i mechanika
     gry zostają wewnątrz Genially — nie odtwarzamy ich z kodu strony i nie
     tworzymy dla nich żadnych plików w repozytorium. */
  /** Ekran otwierający rozdziału z grą — wspólny szkielet dla P03 i P04.

      P03: gra Genially K04 jest KWADRATOWA (1:1), więc pionowa kompozycja
      „duży tytuł nad grą" nie mieści się w jednym kadrze — dwie kolumny
      wykorzystują szerokość, której kwadrat i tak nie zajmuje. Tekst po lewej
      pochodzi z dokumentu 37, własny nagłówek K04 jest w tablicy ukryty.

      P04: gra K06 jest SZEROKA (16:9), więc jedna kolumna na pełną szerokość
      arkusza wystarcza — treść niesie sam przeniesiony klocek, bez dublowania
      tekstu w silniku.

      W obu wypadkach gra NIE jest przypinana do scrolla. */
  function gameSceneHtml(c) {
    const wide = !!(c.game && c.game.wide);
    const kolumna = wide ? "" : `
            <div class="bd-p03open__text">
              <p class="bd-scene__kicker">PUNKT KONTROLNY</p>
              <h2 class="bd-scene__title" id="bd-p03-title">Tropy prowadzą pod ziemię</h2>
              <p class="bd-scene__text">Pod ulicami miasta biegnie sieć rur. To nimi odpływa
                woda z domów, szkół i restauracji. Gdzieś w tej sieci coś utrudnia przepływ.</p>
              <p class="bd-scene__text">Wejdź do kanalizacji i znajdź miejsce, w którym woda
                płynie z trudem.</p>
              <p class="bd-scene__text bd-scene__text--do">Przejdź przez labirynt rur
                i znajdź przeszkodę.</p>
            </div>`;
    return `<section class="bd-chscene bd-chscene--game" id="bd-scene-open"
                     aria-label="Gra: ${c.title}">
        <div class="bd-chscene__in">
          <div class="bd-p03open${wide ? " bd-p03open--wide" : ""}">${kolumna}
            <div class="bd-p03open__game">
              <div class="bd-page__main" id="bd-slot-game"></div>
            </div>
          </div>
          <div class="bd-p03open__foot" id="bd-slot-progress"></div>
          ${c.game.cta ? `<p class="bd-gamecta">
            <button type="button" class="bd-btn" id="bd-game-done">${c.game.cta}</button>
          </p>` : ""}
        </div>
      </section>`;
  }

  /** Rozdział P04 „Ślad prowadzi do kuchni" (Etap 2C): DWIE obowiązkowe
      sceny. Scena 1 — przeszukanie kuchni (K06, Genially). Scena 2 — gra
      „Złap krople oleju" (K08), odsłaniana dopiero po potwierdzeniu K06.
      Po ukończeniu K08 pojawia się finał tropu z przejściem do P05.
      Logika opowieści: kuchnia → znaleziona butelka → zebranie oleju →
      pełna butelka → co z nią zrobić? → Olejomat (P05). */
  function gameChapterHtml(c, idx) {
    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}
        ${gameSceneHtml(c)}

        <section class="bd-chscene bd-chscene--k08g" id="bd-scene-k08g" hidden
                 aria-label="Złap krople oleju — gra">
          <div class="bd-chscene__in">
            <p class="bd-przejscie">Butelka okazała się ważnym dowodem. Pomóż zebrać
              do niej zużyty olej, zanim kolejne krople trafią do zlewu.</p>
            <div class="bd-page__main" id="bd-slot-k08"></div>
            <div class="bd-p04__panel" id="bd-slot-progress2"></div>
          </div>
        </section>

        <section class="bd-chscene bd-chscene--p04koniec" id="bd-scene-p04-final" hidden
                 aria-label="Finał tropu — pełna butelka">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt"
                   data-audio-src="../assets/audio/lekcja45/04-slad-do-kuchni/04-butelka-pelna-03.mp3"
                   data-audio-title="Butelka jest pełna">
                <h2 class="bd-scene__title bd-final__title">Butelka jest pełna</h2>
                <p class="bd-scene__text">Wszystkie krople zużytego oleju trafiły do
                  butelki. Teraz sprawdź, co należy zrobić ze zużytym olejem.</p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-p04-dalej">Sprawdź, co dalej</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** Odsłona sceny K08 (po potwierdzeniu K06). Leniwe ładowanie iframe'u
      startuje DOPIERO tutaj (wymóg 2C) — nie przy wejściu do rozdziału.
      Panel postępu wędruje pod aktywną scenę: pola liter (S, potem Z) są
      zawsze przy bieżącym zadaniu. */
  function odslonaK08(view, odRazu) {
    const scena = view.querySelector("#bd-scene-k08g");
    if (!scena) return;
    scena.hidden = false;
    setSceneActive(scena, true);
    const laduj = view.__bdLazyK08;
    if (laduj) laduj();
    const panel = view.querySelector("#progress-panel");
    const slot2 = view.querySelector("#bd-slot-progress2");
    if (panel && slot2 && panel.parentElement !== slot2) slot2.appendChild(panel);
    syncBarHeight(view);
    /* każde kliknięcie potwierdzenia K06 prowadzi do sceny (idempotentnie) */
    if (!odRazu) requestAnimationFrame(() => scrollToHeading(scena, view));
  }

  function pokazFinalP04(view, odRazu) {
    const koniec = view.querySelector("#bd-scene-p04-final");
    if (!koniec) return;
    koniec.hidden = false;
    setSceneActive(koniec, true);
    syncBarHeight(view);
    if (!odRazu) requestAnimationFrame(() => scrollToHeading(koniec, view));
  }

  /** Okablowanie gry K06 „Latarka w kuchni" w P04 (Etap A5).

      Poprzednik — materiał Genially — był cross-origin i nigdy nie mówił
      stronie, że uczeń skończył: klocek zaliczał ręczny przycisk „Zakończ
      sprawdzanie kuchni", a litera S otwierała się już przy ZAŁADOWANIU
      ramki. Prototyp emituje `k06:completed` po pięciu śladach, więc
      przycisk zniknął, a jego druga rola — odsłona obowiązkowej sceny K08 —
      przeszła na to zdarzenie. To JEDYNE przejście dalej w tym tropie,
      dlatego awaria ładowania musi mówić uczniowi, co zrobić.

      Blok jest już przeniesiony przez `wireGameScene`; tu dochodzi wysokość
      ramki w kadrze, nasłuch, komunikaty i pełny stop przy wyjściu. */
  function wireK06(c, view, blok) {
    const wrap = blok.querySelector('[data-frame="k06"]');
    const frame = wrap && wrap.querySelector("iframe");
    const statusEl = blok.querySelector(".frame__status");
    if (!frame) return;

    const gotowe = () =>
      "Gra ukończona. Litera S jest gotowa do wpisania w polu postępu śledztwa.";

    /* Ładowanie leniwe z parametrem trybu osadzenia (wzorzec K07/K16):
       gra chowa wtedy własne marginesy. Legacy'owa ścieżka w `initFrames`
       milczy przy `body.bd-on`, więc nie ma wyścigu o `src`. */
    const laduj = () => {
      if (!frame.dataset.src || frame.src) return;
      wrap.classList.remove("is-ready", "is-error");
      wrap.classList.add("is-loading");
      if (statusEl) statusEl.textContent = "Wczytywanie gry…";
      const bazowy = frame.dataset.src;
      frame.src = bazowy + (bazowy.indexOf("?") >= 0 ? "&" : "?") + "embed=board";
    };

    /* Wysokość = kadr rozdziału pod paskiem. Gra jest `position:fixed` i sama
       reaguje na zmianę rozmiaru, więc nie mierzymy treści i nie ma
       wewnętrznego paska przewijania (dokładnie jak przy K08). */
    const fitFrame = () => {
      if (!frame.src) return;
      const bar = parseFloat(getComputedStyle(view).getPropertyValue("--bd-bar-h")) || 64;
      const h = Math.min(Math.max(Math.round((view.clientHeight - bar) * 0.92), 460), 900);
      frame.style.height = h + "px";
    };
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(fitFrame);
      ro.observe(view);
      chapterCleanup.push(() => ro.disconnect());
    }

    /* JEDYNE źródło zaliczenia w trybie tablicy (legacy'owy `initFrames` ma
       osłonę `body.bd-on`). Wzorzec N1: zaliczenie liczy się raz, ale pole
       litery otwiera się przy KAŻDEJ wygranej — `completedInteractions` żyje
       w localStorage, więc przy powtórnym przejściu gry strażnik zaliczenia
       zjadłby odblokowanie litery. */
    const onDone = () => {
      const S = NS.state;
      if (!S) return;
      const noweZaliczenie = S.completeInteraction("k06");
      if (S.unlockLetterEntry) S.unlockLetterEntry("S");
      if (statusEl) statusEl.textContent = gotowe();
      if (noweZaliczenie) {
        announce("Pięć śladów odnalezionych. Pole litery S czeka na wpisanie. " +
          "Czas zebrać olej z patelni.");
      }
      /* Rola dawnego przycisku: odsłona obowiązkowej sceny K08. Scena staje
         się dostępna NATYCHMIAST, ale strona nie skacze do niej od razu —
         przewinięcie czeka na koniec klipu piątego śladu (niżej). */
      odslonaK08(view, true);
      if (noweZaliczenie) przewinDoK08PoKlipie();
    };

    /* PIĄTY ŚLAD MA WYBRZMIEĆ (Etap A5, decyzja użytkownika).
       Ukończenie gry pada w tej samej chwili co klip ostatniego śladu, więc
       natychmiastowe przewinięcie do sceny K08 uruchamiało jej narrację, ta
       przejmowała jedyny kanał audio i ucinała klip w pierwszej sekundzie —
       razem z finałem gry, którego uczeń nie zdążył zobaczyć.
       Czekamy więc na koniec klipu, ale nigdy dłużej niż 11 s, a przerwanie
       klipu przez ucznia — pauza, zmiana trybu — przewija od razu. W trybie
       „Czytam" nie ma na co czekać: przewijamy bez opóźnienia.
       Bezpiecznik to WYŁĄCZNIE siatka na zawieszony odtwarzacz, nie planowany
       czas oczekiwania: normalnie przewijamy w chwili realnego końca nagrania.
       Stąd 11 s — najdłuższy klip śladu (lejek) trwa 10,11 s, a przy 4 s
       z pierwszej wersji bezpiecznik ucinał każdy ślad w połowie zdania. */
    const przewinDoK08PoKlipie = () => {
      const przewin = () => scrollToHeading(view.querySelector("#bd-scene-k08g"), view);
      const A = NS.audio;
      const stan = A && A.stanUi ? A.stanUi() : null;
      const klipGra = (d) => !!(d && d.gra && /^Ślad:/.test(d.tytul || ""));
      if (!stan || stan.tryb !== "both" || !klipGra(stan)) {
        requestAnimationFrame(przewin);
        return;
      }
      let odepnij = null, zrobione = false;
      const zakoncz = () => {
        if (zrobione) return;
        zrobione = true;
        clearTimeout(bezpiecznik);
        if (odepnij) odepnij();
        przewin();
      };
      const bezpiecznik = setTimeout(zakoncz, 11000);
      odepnij = A.onUi((d) => { if (!klipGra(d)) zakoncz(); });
      chapterCleanup.push(() => {
        clearTimeout(bezpiecznik);
        if (odepnij) odepnij();
      });
    };
    /* ── Klipy śladów (Etap A5, patch autora gry) ────────────────────
       Odkrycie śladu odzywa się głosem lektora, ale WYŁĄCZNIE w trybie
       „Czytam i słucham". W „Czytam" nie wołamy `playClip`, więc po plik
       nie leci ani jedno żądanie. Kanał jest jeden — ten sam co narracja —
       więc kolejny ślad przerywa poprzedni klip i nigdy nie słychać dwóch
       nagrań naraz. Gra mówi tylko, KTÓRY ślad padł (`k06:trace` →
       {id, label}); ścieżki należą do lekcji.
       Klip gra mimo wyciszenia narracji przez samą grę: `playClip` celowo
       nie sprawdza `suspended`, bo krótkie nagranie będące odpowiedzią na
       działanie ucznia ma prawo wybrzmieć (ta sama zasada co przy kartach
       diagramu w Tropie 3). */
    const KLIPY_SLADOW = {
      1: "../assets/audio/lekcja45/04-slad-do-kuchni/slady/01-olejomat.mp3",
      2: "../assets/audio/lekcja45/04-slad-do-kuchni/slady/02-lejek.mp3",
      3: "../assets/audio/lekcja45/04-slad-do-kuchni/slady/03-kosze.mp3",
      4: "../assets/audio/lekcja45/04-slad-do-kuchni/slady/04-plakat.mp3",
      5: "../assets/audio/lekcja45/04-slad-do-kuchni/slady/05-baterie.mp3",
    };
    const onTrace = (e) => {
      const S = NS.state;
      const d = e && e.detail;
      const src = d && KLIPY_SLADOW[d.id];
      if (!src || !S || !NS.audio || !NS.audio.playClip) return;
      if (S.get().audioMode !== "both") return;
      NS.audio.playClip(src, "Ślad: " + (d.label || ""));
    };

    const bind = () => {
      try {
        const win = frame.contentWindow;
        if (!win || win.__bdK06Bound) return;
        win.__bdK06Bound = true;
        /* gra emituje wyłącznie na oknie (bubbles) — jeden nasłuch, jedno
           zaliczenie; nasłuch na dokumencie dołożyłby drugie wywołanie */
        win.addEventListener("k06:completed", onDone);
        win.addEventListener("k06:trace", onTrace);
        chapterCleanup.push(() => {
          try {
            win.removeEventListener("k06:completed", onDone);
            win.removeEventListener("k06:trace", onTrace);
          } catch (e) { /* okno zwolnione */ }
        });
      } catch (e) { /* cisza */ }
    };

    /* AWARIA: przy same-origin `error` na ramce jest prawie zawsze nieme —
       serwer oddaje stronę błędu, więc ramka „wczytuje się" i tylko nie ma
       w niej gry. Sprawdzamy więc obecność jej korzenia. */
    const modulJest = () => {
      try {
        const doc = frame.contentDocument;
        return !doc || !!doc.querySelector("#game");
      } catch (e) { return true; }
    };
    const onFrameLoad = () => {
      wrap.classList.remove("is-loading");
      if (!modulJest()) {
        wrap.classList.add("is-error");
        if (statusEl) statusEl.textContent =
          "Nie udało się wczytać gry. Otwórz ją w nowej karcie linkiem pod oknem — " +
          "po powrocie literę S wpisz samodzielnie w polu postępu śledztwa.";
        return;
      }
      wrap.classList.add("is-ready");
      bind(); fitFrame();
      if (statusEl) {
        statusEl.textContent = (NS.state && NS.state.isCompleted && NS.state.isCompleted("k06"))
          ? gotowe()
          : "Gra gotowa. Prowadź latarkę i znajdź pięć śladów.";
      }
    };
    frame.addEventListener("load", onFrameLoad);
    chapterCleanup.push(() => frame.removeEventListener("load", onFrameLoad));
    laduj();
    if (frame.contentDocument && frame.src) { bind(); fitFrame(); }

    /* Wyjście z rozdziału = pełny stop gry: zdejmujemy `src` (`data-src`
       zostaje), więc gra nie chodzi dalej w ukrytym <main>, a powrót do
       tropu zaczyna ją od nowa. */
    chapterCleanup.push(() => {
      try {
        frame.removeAttribute("src");
        wrap.classList.remove("is-ready", "is-loading", "is-error");
        if (statusEl) statusEl.textContent = "";
      } catch (e) { /* ignore */ }
    });
  }

  /** Okablowanie sceny K08 w P04 (Etap 2C): przeniesienie bloku, wysokość
      ramki w kadrze, JEDYNE w trybie tablicy źródło nasłuchu `k08:completed`
      (legacy'owy initFrames ma osłonę body.bd-on z Etapu 2B.1), pauza gry
      po opuszczeniu sceny i finał tropu. Prototyp gry pozostaje nietknięty:
      wypełnia iframe (position:fixed; inset:0), nie ma notki ani dublującego
      nagłówka, więc tryb osadzenia w stylu ?embed=board nie jest potrzebny. */
  function wireK08(c, view) {
    const slot = view.querySelector("#bd-slot-k08");
    moveBlockInto("k08", slot);
    const blok = view.querySelector("#k08");
    if (!blok) return;

    /* nadtytuł bez numeracji + tytuł sceny wg Etapu 2C — odwracalnie
       (titleFixes), wariant ?legacy=1 zachowuje dotychczasowe brzmienie */
    const kicker = blok.querySelector(":scope > .kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      const ogon = kicker.textContent.split("•").pop().trim();
      kicker.textContent = ogon ? ogon.charAt(0).toUpperCase() + ogon.slice(1) : "Punkt kontrolny";
    }
    const tytul = blok.querySelector(":scope > .lead");
    if (tytul) {
      titleFixes.push({ el: tytul, html: tytul.innerHTML });
      tytul.textContent = "Złap krople oleju";
    }

    const wrap = blok.querySelector('[data-frame="k08"]');
    const frame = wrap && wrap.querySelector("iframe");
    const statusEl = blok.querySelector(".frame__status");
    if (!frame) return;

    /* ładowanie odroczone do odsłony sceny (odslonaK08 woła przez uchwyt) */
    view.__bdLazyK08 = () => {
      if (!frame.dataset.src || frame.src) return;
      if (wrap) { wrap.classList.remove("is-ready"); wrap.classList.add("is-loading"); }
      if (statusEl) statusEl.textContent = "Wczytywanie gry…";
      frame.src = frame.dataset.src;
    };
    chapterCleanup.push(() => { delete view.__bdLazyK08; });

    /* Wysokość = kadr rozdziału pod paskiem. Gra wypełnia iframe i sama
       reaguje na resize — bez pomiaru treści, bez wewnętrznego scrolla.
       Zmiany geometrii nie dotykają src (obrót nie przeładowuje gry). */
    const fitFrame = () => {
      if (!frame.src) return;
      const bar = parseFloat(getComputedStyle(view).getPropertyValue("--bd-bar-h")) || 64;
      const h = Math.min(Math.max(Math.round((view.clientHeight - bar) * 0.92), 460), 900);
      frame.style.height = h + "px";
    };
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(fitFrame);
      ro.observe(view);
      chapterCleanup.push(() => ro.disconnect());
    }

    /* Opuszczenie sceny wstrzymuje grę: prototyp pauzuje na `blur` okna,
       więc wysyłamy syntetyczny blur, gdy ramka wyjeżdża z kadru rozdziału.
       Wznowienie jest zawsze świadome (ekran pauzy z przyciskiem). */
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting || !frame.src) return;
          try { frame.contentWindow.dispatchEvent(new Event("blur")); } catch (err) { /* ignore */ }
        });
      }, { root: view, threshold: 0 });
      io.observe(wrap);
      chapterCleanup.push(() => io.disconnect());
    }

    /* JEDYNE źródło zaliczenia w trybie tablicy — wzorzec K07 (raport 47) */
    /* Zaliczenie liczy się DOKŁADNIE RAZ, ale odblokowanie pola litery i
       odsłona finału muszą działać przy KAŻDEJ wygranej. Wcześniej strażnik
       `if (!completeInteraction(...)) return;` przerywał przed
       `unlockLetterEntry("Z")`, więc przy powtórnym przejściu gry (stan
       `completedInteractions` żyje w localStorage, także między sesjami)
       pole litery Z nigdy się nie otwierało — naprawa N1. */
    const onDone = () => {
      const S = NS.state;
      if (!S) return;
      const noweZaliczenie = S.completeInteraction("k08");
      /* idempotentne: nie doda duplikatu i nie otworzy litery już wpisanej */
      if (S.unlockLetterEntry) S.unlockLetterEntry("Z");
      if (statusEl) statusEl.textContent =
        "Gra ukończona. Litera Z jest gotowa do wpisania w polu postępu śledztwa.";
      if (noweZaliczenie) {
        announce("Butelka jest pełna. Pole litery Z czeka na wpisanie. " +
          "Możesz przejść do kolejnego tropu.");
      }
      pokazFinalP04(view, !noweZaliczenie);   /* przewijamy tylko przy pierwszym razie */
      unlock("p05");                       /* tablica pokazuje kolejny trop
                                              nawet przy wyjściu bez CTA */
    };
    const bind = () => {
      try {
        const win = frame.contentWindow;
        if (!win || win.__bdK08Bound) return;
        win.__bdK08Bound = true;
        win.addEventListener("k08:completed", onDone);
        chapterCleanup.push(() => {
          try { win.removeEventListener("k08:completed", onDone); } catch (e) { /* okno zwolnione */ }
        });
      } catch (e) { /* cisza */ }
    };
    const onFrameLoad = () => {
      bind(); fitFrame();
      if (NS.state && NS.state.isCompleted && NS.state.isCompleted("k08") && statusEl) {
        statusEl.textContent =
          "Gra ukończona. Litera Z jest gotowa do wpisania w polu postępu śledztwa.";
      }
    };
    frame.addEventListener("load", onFrameLoad);
    chapterCleanup.push(() => frame.removeEventListener("load", onFrameLoad));
    if (frame.contentDocument && frame.src) { bind(); fitFrame(); }
    /* wyjście z rozdziału = pełny stop gry: zdejmujemy src (data-src zostaje),
       ponowne wpięcie do ukrytego <main> nie wystartuje pętli gry na nowo */
    chapterCleanup.push(() => {
      try { frame.removeAttribute("src"); } catch (e) { /* ignore */ }
    });

    /* CTA finału: dopiero ono domyka trop i przenosi do P05 (bramka 2C) */
    const dalej = view.querySelector("#bd-p04-dalej");
    if (dalej) dalej.addEventListener("click", () => {
      dalej.disabled = true;
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });

    /* Ponowne wejście: honorujemy trwały stan lekcji (wzorzec D3).
       K06 potwierdzone → scena K08 dostępna od razu; K08 ukończone →
       finał widoczny, gra pozostaje dostępna dobrowolnie. */
    const S = NS.state;
    const k06Gotowe = !!(S && S.isCompleted && S.isCompleted("k06"));
    const k08Gotowe = !!(S && S.isCompleted && S.isCompleted("k08"));
    if (k06Gotowe || k08Gotowe) odslonaK08(view, true);
    if (k08Gotowe) {
      /* Gra była już wygrana: pole litery Z ma czekać na wpisanie także po
         powrocie do rozdziału (naprawa N1). Wywołanie jest idempotentne —
         przy literze już wpisanej nie zmienia niczego i nie zalicza gry
         ponownie. */
      if (S.unlockLetterEntry) S.unlockLetterEntry("Z");
      pokazFinalP04(view, true);
      unlock("p05");
    }
  }

  /** P05 „Sprawa oleju — Olejomat": wprowadzenie (Faza A) + układanka K07.
      Sceny K09–K10 to puste, ukryte punkty montażu kolejnych etapów — uczeń
      nigdy ich nie widzi (żadnych surowych bloków legacy). K08 od Etapu 2C
      należy do P04 i NIE występuje w widocznym przebiegu tego tropu; przy
      prawidłowym wejściu do P05 jest już ukończone. Po ukończeniu K07
      pojawia się kontrolowany koniec dostępnego zakresu z powrotem na
      tablicę — bez fałszywego przycisku następnego klocka i BEZ oznaczania
      P05 jako ukończonego. */
  function p05Html(c, idx) {
    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}

        <!-- FAZA A (Etap 2B.1): przypięte wprowadzenie „Co to jest Olejomat?"
             ze scrubowanym lotem butelki do wlotu maszyny. Wysokość runwayu
             wyznacza długość przewijania; scena jest sticky pod paskiem. -->
        <section class="bd-chscene bd-chscene--olejomat" id="bd-scene-olejomat"
                 aria-label="Co to jest Olejomat?">
          <div class="bd-olejomat-runway" id="bd-p05-runway">
            <div class="bd-olejomat-stage" id="bd-p05-stage">
              <div class="bd-olejomat__grid">
                <div class="bd-olejomat__txt"
                     data-audio-src="../assets/audio/lekcja45/05-sprawa-oleju/05-co-to-olejomat-01.mp3"
                     data-audio-title="Co to jest Olejomat?">
                  <p class="bd-scene__kicker">SPRAWA OLEJU</p>
                  <h2 class="bd-scene__title">Co to jest Olejomat?</h2>
                  <p class="bd-scene__text">Olejomat to urządzenie do zbierania zużytego
                    oleju spożywczego. Oddajemy do niego szczelnie zakręconą butelkę,
                    dzięki czemu olej nie trafia do kanalizacji i&nbsp;może zostać
                    przekazany do dalszego wykorzystania.</p>
                  <p class="bd-olejomat__audio" id="bd-p05-intro-audio" hidden></p>
                </div>
                <div class="bd-olejomat__wiz" id="bd-p05-wiz">
                  <img class="bd-olejomat__maszyna" id="bd-p05-olejomat"
                       src="../assets/images/lekcja45/07-droga-butelki/olejomat-3d.webp"
                       alt="Olejomat — urządzenie do zbiórki zużytego oleju spożywczego"
                       draggable="false">
                  <img class="bd-olejomat__butelka" id="bd-p05-butelka"
                       src="../assets/images/lekcja45/07-droga-butelki/butelka-olejomat-3d.webp"
                       alt="" aria-hidden="true" draggable="false">
                </div>
              </div>
              <p class="bd-olejomat__hint" id="bd-p05-hint" aria-hidden="true">Przewijaj&nbsp;↓</p>
            </div>
          </div>
        </section>

        <section class="bd-chscene bd-chscene--k07" id="bd-scene-k07"
                 aria-label="Ułóż drogę butelki — układanka">
          <!-- Etap T5.1: polecenie układanki czyta lektor sceny, tak jak
               w każdej innej scenie lekcji. Prototyp stracił własny przycisk
               „Odtwórz polecenie" — jeden kanał dźwięku, jedna kontrolka. -->
          <div class="bd-chscene__in"
               data-audio-src="../assets/audio/lekcja45/05-sprawa-oleju/05-uloz-droge-butelki-02.mp3"
               data-audio-title="Ułóż drogę butelki">
            <div class="bd-page__main" id="bd-slot-k07"></div>
          </div>
        </section>

        <!-- Etap 2D: „Magnetyczna stacja kontroli" (K09) — druga obowiązkowa
             scena tropu, odsłaniana po ukończeniu układanki K07. -->
        <section class="bd-chscene bd-chscene--k09" id="bd-scene-k09" hidden
                 aria-label="Co może trafić do zielonej butelki?">
          <div class="bd-chscene__in">
            <p class="bd-przejscie">Droga butelki jest już jasna. Zanim ruszy do Olejomatu,
              sprawdź, co wolno do niej wlać.</p>
            <div class="bd-page__main" id="bd-slot-k09"></div>
          </div>
        </section>

        <!-- Etap T5.1: zdanie przejścia jest OSOBNYM slajdem. Wcześniej
             siedziało nad sekwencją w jednej scenie, więc jego nagranie
             i narracja sekwencji biły się o ten sam moment. -->
        <section class="bd-chscene bd-chscene--przejscie" id="bd-scene-przejscie" hidden
                 aria-label="Butelka pojechała do Olejomatu">
          <div class="bd-chscene__in">
            <p class="bd-przejscie" id="bd-p05-przejscie"
               data-audio-src="../assets/audio/lekcja45/05-sprawa-oleju/05-butelka-pojechala-04.mp3"
               data-audio-title="Butelka pojechała do Olejomatu">Butelka pojechała do Olejomatu. Zobacz,
              co dzieje się z olejem dalej.</p>
          </div>
        </section>

        <!-- Etap 2E: K10 „Olej rusza w dalszą drogę" — scena opowieściowa,
             puenta tropu (bez zaliczenia i bez litery). Blok #k10-seq wraz
             z jego silnikiem frameSequence przenosi tu wireK10; scrub napędza
             mostek scrolla rozdziału. Odsłona po k09:completed (odslonaK10). -->
        <section class="bd-chscene bd-chscene--k10" id="bd-scene-k10" hidden
                 aria-label="Olej rusza w dalszą drogę">
          <!-- 2E.1/3: tło sceny butelki (ciągłość przestrzeni tropu).
               Sticky o zerowej wysokości — obraz zawsze wypełnia kadr pod
               belką, bez rozciągania na cały wysoki runway scrubu. -->
          <div class="bd-k10tlo" aria-hidden="true"></div>
          <div class="bd-chscene__in">
            <div id="bd-slot-k10"></div>
          </div>
        </section>

        <!-- Etap 2E: panel końca jako DOMKNIĘCIE opowieści tropu (już nie
             „koniec dostępnej części" — historia oleju jest opowiedziana) -->
        <section class="bd-chscene bd-chscene--p05koniec" id="bd-scene-p05-koniec" hidden
                 aria-label="Domknięcie tropu Olejomatu">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt"
                   data-audio-src="../assets/audio/lekcja45/05-sprawa-oleju/05-trop-olejomatu-rozwiazany-06.mp3"
                   data-audio-title="Trop Olejomatu rozwiązany">
                <h2 class="bd-scene__title bd-final__title">Trop Olejomatu rozwiązany</h2>
                <p class="bd-scene__text">Znasz już całą historię: butelka z zużytym
                  olejem trafia do Olejomatu, a olej — zamiast zatykać rury — wraca
                  jako cenny surowiec. Wracaj na tablicę, śledztwo toczy się dalej.</p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-p05-wroc">Wróć na tablicę śledztwa</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** TROP 6 „Skala problemu" (Etap 3A) — scena K11 „stadion" w dwóch fazach
      jednej przestrzeni kadru (wzorzec sceny dowodu z P03):
      A) scrub 48 klatek: pusty stadion → pełny olejem,
      B) po plateau crossfade do ekranu analitycznego: stadion cofa się
         w głąb, wchodzą liczby i siatka 41 kubatur.
      Bez gry i bez litery — trop opowieściowy. Punkt montażu K12 czeka
      pusty i ukryty (etap 3B). */
  function p06Html(c, idx) {
    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}

        <section class="bd-chscene bd-chscene--k11" id="bd-scene-k11"
                 aria-label="Ile to naprawdę jest? Skala zużytego oleju">
          <!-- 3A.1: jasne tło sceny z rodziny Tropu 5 (kremowe kadry
               09-stacja-kontroli, fallback kolorem). Sticky o zerowej
               wysokości maluje kadr pod belką przez cały scrub, bez
               rozciągania obrazu na wysoki runway (wzorzec z 2E.1/K10). -->
          <div class="bd-k11tlo" aria-hidden="true"></div>
          <div class="bd-chscene__in">
            <p class="bd-przejscie">Wiesz już, dokąd trafia olej z jednej butelki.
              Zobacz, ile go jest naprawdę.</p>
            <!-- klasa bd-page__main neutralizuje data-tone bloku lekcji
                 (reguła .bd-page__main .scene), więc scena gra na jasnym
                 tle tablicy zamiast na ciemnym gradiencie z arkusza lekcji -->
            <div class="bd-page__main" id="bd-slot-k11"></div>
            <!-- Korekta 3C.3.1: dodatkowa ścieżka do kolejnej części —
                 przewijanie działa normalnie, to tylko skrót dla ucznia,
                 który nie zorientował się, że scena ma ciąg dalszy. -->
            <button type="button" class="bd-dalej" id="bd-p06-dalej">
              <span class="bd-dalej__nic" aria-hidden="true"></span>
              <span class="bd-dalej__txt">Kliknij, aby przejść niżej
                <small>przewiń do kolejnej części</small></span>
              <span class="bd-dalej__strzalka" aria-hidden="true">↓</span>
            </button>
          </div>
        </section>

        <!-- Etap 3B: K12 „Odpady zostawiają ślady" — przemiana lasu
             (scrub 64 klatek) i skaner po pięciu porzuconych odpadach.
             Scena opowieściowa: bez gry, bez litery. -->
        <section class="bd-chscene bd-chscene--k12" id="bd-scene-k12"
                 aria-label="Odpady zostawiają ślady">
          <div class="bd-k12tlo" aria-hidden="true"></div>
          <div class="bd-chscene__in">
            <!-- Korekta 3C.3.2: nić przejścia usunięta w całości (decyzja
                 użytkownika). Po scenie stadionu następuje bezpośrednio
                 „Ślady w lesie" — bez łącznika. -->
            <div class="bd-page__main" id="bd-slot-k12"></div>
          </div>
        </section>

        <!-- Korekta 3C.3.2: zamknięcie tropu nie jest już osobną sekcją pod
             sceną. Jego treść wjeżdża wierszami W TYM SAMYM kadrze, w którym
             gaśnie las — okablowanie tropu przenosi ten blok do sceny K12.
             Element zostaje tu jako źródło treści (jedna treść, nie kopia). -->
        <template id="bd-p06-koniec-tresc">
          <div class="k12__panel" aria-live="polite">
            <h2 class="k12__panel-tytul" data-wiersz>Skala policzona, ślady odczytane</h2>
            <p class="k12__panel-tekst" data-wiersz>Ponad 41 stadionów zużytego oleju rocznie
              i&nbsp;las pełen rzeczy, które miały swoje miejsce gdzie indziej.
              Gdzie dokładnie? Sprawdzimy w&nbsp;kolejnej części śledztwa.</p>
            <p class="k12__panel-cta" data-wiersz>
              <button type="button" class="bd-btn" id="bd-p06-wroc">Wróć na tablicę śledztwa</button>
            </p>
          </div>
        </template>
      </div>`;
  }

  /** TROP 7 „PSZOK — centrum dowodów" (Etap 4A) — scena wejścia w dwóch
  /** TROP 7 „PSZOK — centrum dowodów" (Etap 4A.1 + 4B).
      Korekta 4A.1: metafora zjazdu z autostrady USUNIĘTA w całości (decyzja
      użytkownika). Scena wejścia jest teraz prosta i krótka:
      zdanie-most → plac PSZOK-u → rozwinięcie skrótu P–S–Z–O–K.
      Etap 4B: po rozwinięciu skrótu przycisk prowadzi do Spaceru (K14),
      a koniec Spaceru jest końcem dostępnej części tropu — bez panelu.
      Litery O ta scena nie przyznaje: należy do gry (etap 4C). */
  function p07Html(c, idx) {
    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}

        <!-- KOREKTA 4A.3: wejście i rozwinięcie skrótu to JEDEN przypięty
             kadr, w którym treść przenika przy scrollu. Wcześniej były to
             dwa osobne ekrany: uczeń musiał zjechać, a litery lądowały na
             pustej przestrzeni. Fazy są czystą funkcją postępu (wzorzec
             ze Spaceru 4B.3), więc scroll w górę cofa je bez stanu.
             faza 1: kicker + tytuł + duży plac
             faza 2: tytuł znika, plac przygasa i maleje, POD nim przenika
                     „Co kryje się za skrótem?" + litery — wszystko naraz
             faza 3: piąta litera odpina kadr, żeby rozwinięcie i definicja
                     miały tyle miejsca, ile potrzebują (patrz uwolnijKadr) -->
        <section class="bd-chscene bd-chscene--pszok" id="bd-scene-pszok"
                 aria-label="PSZOK — centrum dowodów">
          <div class="bd-k13tlo" aria-hidden="true"></div>
          <div class="pw-runway" id="pw-runway">
            <div class="pw-stage" id="pw-stage">
              <div class="pw-tytul" id="pw-tytul">
                <p class="bd-scene__kicker">SPRAWA ODPADÓW</p>
                <h2 class="bd-scene__title pszok-wejscie__title">Nie do lasu,
                  nie do pojemnika, więc do…</h2>
              </div>
              <!-- Kotwica sceny: dopóki obraz nie ma pikseli, miejsce trzyma
                   płyta zastępcza (wzorzec is-ready z K11/K12) — żadnego
                   pustego prostokąta z tekstem alternatywnym na wolnym łączu. -->
              <figure class="pszok-plac" id="pszok-plac-figura">
                <img class="pszok__plac" id="pszok-plac"
                     width="1200" height="614" fetchpriority="high"
                     src="../assets/images/lekcja45/pszok-plac.webp"
                     alt="Plac PSZOK-u: ogrodzony teren z osobnymi kontenerami na różne rodzaje odpadów"
                     draggable="false">
              </figure>
              <div class="pw-skrot" id="bd-slot-k13"></div>
            </div>
          </div>
        </section>

        <!-- Etap 4B: K14 „Spacer po PSZOK-u" — scena przyjeżdża z dokumentu
             lekcji razem ze swoim kontrolerem. Odsłania się po zaliczeniu
             skrótu (k13). Wartownik końca spaceru jedzie RAZEM z blokiem. -->
        <section class="bd-chscene bd-chscene--k14" id="bd-scene-k14" hidden
                 aria-label="Spacer po PSZOK-u">
          <div class="bd-chscene__in">
            <div id="bd-slot-k14"></div>
          </div>
        </section>

        <!-- Etap 4C: K15 „Obsłuż PSZOK" — gra przyznaje literę O.
             Odsłania się po przejściu Spaceru; ramka ładuje się leniwie. -->
        <section class="bd-chscene bd-chscene--k15" id="bd-scene-k15" hidden
                 aria-label="Obsłuż PSZOK — gra">
          <div class="bd-chscene__in">
            <p class="bd-przejscie">Znasz strefy. Teraz obsłuż punkt sam.</p>
            <div class="bd-page__main" id="bd-slot-k15"></div>
            <!-- Poprawka 5B.1: panel postępu śledztwa. W trybie tablicy jest
                 dzieckiem body i ma ukrytą widoczność, więc bez przeniesienia
                 litera O przyznana przez grę nie miała GDZIE zostać wpisana —
                 trop był realnie niedomknięty. Slot i mechanizm jak w Tropie 8. -->
            <div class="bd-p04__panel" id="bd-slot-progress-k15"></div>
          </div>
        </section>

        <!-- Domknięcie Tropu 7 (etap 4C). Przycisk wraca na tablicę i NIE
             kończy tropu: P08 nie jest zintegrowane, więc ma zostać zamknięte. -->
        <section class="bd-chscene bd-chscene--p07koniec" id="bd-scene-p07-koniec" hidden
                 aria-label="Domknięcie tropu PSZOK">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt">
                <h2 class="bd-scene__title bd-final__title">Punkt obsłużony</h2>
                <p class="bd-scene__text">Wiesz już, czym jest PSZOK, jak dzieli odpady
                  na strefy i&nbsp;jak wygląda praca w&nbsp;takim punkcie.
                  Wracaj na tablicę — śledztwo toczy się dalej.</p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-p07-wroc">Sprawdź, co dalej</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** TROP 8 „CO DALEJ Z ODPADAMI?" (Etap 5A) — scena wejścia.

      Jeden przypięty kadr z przenikaniem, wzorcem 4A.3 z Tropu 7:
        faza 1: kicker + tytuł + zdanie-most z Tropu 7
        faza 2: tytuł ustępuje, wschodzi OBIEG — pierścień rysowany SVG,
                cztery przystanki odsłaniane po kolei
        faza 3: łuk domyka pętlę, pod nim dwa zdania

      Ikony przystanków to istniejące rendery (żadnych nowych rastrów):
      butelka PET i bluza z polaru z materiałów K16, żółty kontener
      i hałda tworzyw ze Spaceru po PSZOK-u — ten sam kontener, obok
      którego uczeń przeszedł w Tropie 7.

      Blok K16 (gra) NIE jedzie do tego rozdziału: zostaje w ukrytym
      dokumencie do etapu 5B. Litery K ta scena nie przyznaje. */
  function p08Html(c, idx) {
    const IMG16 = "../assets/images/lekcja45/16-drugie-zycie-materialow/webp/";
    const IMG14 = "../assets/images/lekcja45/14-spacer-pszok/";
    const przystanki = [
      { poz: "gora", etykieta: "Twoja butelka",
        src: IMG16 + "wejscie-butelka-pet.webp",
        alt: "Plastikowa butelka po napoju" },
      { poz: "prawo", etykieta: "Oddana osobno",
        src: IMG14 + "kontenery/webp/kontener-klapowy-zolty.webp",
        alt: "Żółty kontener na tworzywa i metale" },
      { poz: "dol", etykieta: "Surowiec",
        src: IMG14 + "odpady/webp/frakcja-06-tworzywa-folie-metale-kolorowe.webp",
        alt: "Zebrane razem tworzywa gotowe do przetworzenia" },
      { poz: "lewo", etykieta: "Nowa rzecz",
        src: IMG16 + "wyjscie-bluza-polarowa.webp",
        alt: "Bluza z polaru uszyta z przetworzonych butelek" },
    ];
    /* Kotwica sceny (butelka) jedzie od razu; reszta czeka w data-src
       i dojeżdża kolejką, żeby pierwszy ekran nie stał na ikonach,
       których jeszcze nie widać. */
    const stopy = przystanki.map((s, i) => `
              <li class="ob-stop ob-stop--${s.poz}" data-nr="${i + 1}">
                <span class="ob-stop__ikona">
                  <img ${i === 0 ? 'src="' + s.src + '" fetchpriority="high"'
                                 : 'data-src="' + s.src + '"'}
                       alt="${s.alt}" width="320" height="320" draggable="false">
                </span>
                <span class="ob-stop__etykieta" data-nr="${i + 1}">${s.etykieta}</span>
              </li>`).join("");

    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}

        <section class="bd-chscene bd-chscene--obieg" id="bd-scene-obieg"
                 aria-label="Gdy odpad zamienia się w surowiec">
          <div class="ob-runway" id="ob-runway">
            <div class="ob-stage" id="ob-stage">
              <div class="ob-tytul" id="ob-tytul">
                <p class="bd-scene__kicker">SPRAWA SUROWCÓW</p>
                <h2 class="bd-scene__title ob-tytul__h">Gdy odpad zamienia się
                  w&nbsp;surowiec</h2>
                <p class="bd-scene__text ob-most">Oddałeś odpady w&nbsp;PSZOK-u.
                  Teraz zobacz, dokąd jadą dalej.</p>
              </div>

              <div class="ob-kolo" id="ob-kolo">
                <svg class="ob-kolo__svg" viewBox="0 0 100 100" aria-hidden="true"
                     focusable="false">
                  <circle class="ob-kolo__slad" cx="50" cy="50" r="38"></circle>
                  <circle class="ob-kolo__luk" cx="50" cy="50" r="38"></circle>
                </svg>
                <ol class="ob-stopy">${stopy}
                </ol>
              </div>

              <p class="bd-scene__text ob-domkniecie" id="ob-domkniecie">Materiał
                nie znika — zmienia postać. Butelka nie musi zostać butelką:
                może wrócić jako coś, czego znów będziesz używać.</p>
            </div>
          </div>
        </section>

        <!-- Etap 5B: gra K16 „Drugie życie materiałów" razem z nagraniem
             01-wprowadzenie.mp3. Scena nie jest bramkowana: kadr wejścia
             jest przypięty, więc uczeń i tak przechodzi przez cały obieg,
             zanim tu dojedzie — dokładanie zamka dołożyłoby tylko tryb,
             w którym coś może się nie odsłonić. Ramka doczytuje się
             leniwie, przy zbliżeniu. -->
        <section class="bd-chscene bd-chscene--k16" id="bd-scene-k16"
                 aria-label="Drugie życie odpadów — gra">
          <div class="bd-chscene__in">
            <p class="bd-przejscie">Znasz już drogę materiału. Teraz dobierz pary.</p>
            <div class="bd-page__main" id="bd-slot-k16"></div>
            <!-- Panel postępu śledztwa: w trybie tablicy jest dzieckiem
                 body i ma ukrytą widoczność, więc bez przeniesienia uczeń
                 nie miałby GDZIE wpisać zdobytej litery K. Slot stoi pod
                 grą, wzorcem sceny gry z Tropu 4. -->
            <div class="bd-p04__panel" id="bd-slot-progress-k16"></div>
          </div>
        </section>

        <!-- Kontrolowany koniec dostępnej części tropu: przycisk wraca na
             tablicę i NIE kończy tropu — P09 nie jest zintegrowane, a litera
             K należy do gry z etapu 5B. -->
        <section class="bd-chscene bd-chscene--p08koniec" id="bd-scene-p08-koniec"
                 aria-label="Domknięcie tropu o surowcach">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt">
                <h2 class="bd-scene__title bd-final__title">Obieg zamknięty</h2>
                <p class="bd-scene__text">Wiesz już, że odpad oddany osobno wraca
                  jako materiał, a materiał — jako nowa rzecz.
                  Wracaj na tablicę: ostatni krok śledztwa jeszcze przed tobą.</p>
                <!-- Zdanie o haśle zależy od tego, czy litera K jest już
                     wpisana — treść ustawia silnik (patrz zdanieOHasle),
                     bo uczeń może dojść do panelu przed wpisaniem litery. -->
                <p class="bd-scene__text bd-p08__haslo" id="bd-p08-haslo"></p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-p08-wroc">Sprawdź, co dalej</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** TROP 9 „ROZWIĄZANIE SPRAWY" (Etap 6A) — finał lekcji w pięciu scenach.

      1. TERMINAL (K17) — jedyna ciemna scena w całej lekcji, moment powagi.
         Logika zamknięty/otwarty należy do `renderTerminal` w skrypcie
         lekcji i NIE jest tu dublowana: te same węzły DOM jeżdżą do
         rozdziału, więc funkcja działa bez zmiany.
      2. ODTAJNIENIE — kadr nagrania. Filmu jeszcze nie ma, więc stoi
         plansza zastępcza z przyciskiem; architektura pod plik MP4 jest
         gotowa (patrz wireP09).
      3. WERDYKT — hasło P-S-Z-O-K zapala się literą po literze przy
         scrollu; przy ograniczonym ruchu od razu w całości.
      4. DYPLOM (K18) — mechanizm bez zmian, przebudowana wyłącznie szata:
         tło i imię to dwie warstwy, więc w 6B wystarczy podmienić tło.
      5. DOMKNIĘCIE — powrót na tablicę, gdzie czeka stempel. */
  function p09Html(c, idx) {
    const litery = ["P", "S", "Z", "O", "K"].map((L, i) => `
                <li class="bd-werdykt__litera" data-litera="${L}" data-nr="${i}">
                  <span class="bd-werdykt__znak">${L}</span>
                </li>`).join("");

    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page bd-page--final">
        ${barHtml(c, idx)}

        <!-- 1. TERMINAL — blok K17 przyjeżdża z dokumentu lekcji razem
             z całą logiką kompletu dowodów. -->
        <section class="bd-chscene bd-chscene--terminal" id="bd-scene-terminal"
                 aria-label="Terminal śledztwa">
          <div class="bd-chscene__in bd-chscene__in--narrow">
            <div class="bd-page__main" id="bd-slot-k17"></div>
          </div>
        </section>

        <!-- 2. ODTAJNIENIE — kadr nagrania. Węzeł #k17-film-wrap wjeżdża
             tutaj z bloku K17, więc przycisk terminala steruje nim dalej
             bez żadnej zmiany w skrypcie lekcji. -->
        <section class="bd-chscene bd-chscene--odtajnienie" id="bd-scene-film" hidden
                 aria-label="Odtajnione nagranie">
          <div class="bd-chscene__in">
            <p class="bd-scene__kicker">MATERIAŁ ODTAJNIONY</p>
            <h2 class="bd-scene__title">Rozwiązanie sprawy</h2>
            <div class="bd-film" id="bd-slot-film"></div>
          </div>
        </section>

        <!-- 3. WERDYKT — jeden ekran-pomost między filmem a dyplomem. -->
        <section class="bd-chscene bd-chscene--werdykt" id="bd-scene-werdykt" hidden
                 aria-label="Werdykt">
          <div class="bd-chscene__in">
            <p class="bd-scene__kicker">WERDYKT</p>
            <ol class="bd-werdykt" id="bd-werdykt" aria-label="Hasło śledztwa: P S Z O K">
              ${litery}
            </ol>
            <p class="bd-scene__text bd-werdykt__zdanie">Znasz drogę odpadów od zlewu
              po nową rzecz. Taka wiedza zasługuje na dokument.</p>
          </div>
        </section>

        <!-- 4. DYPLOM — blok K18 z dokumentu lekcji. -->
        <section class="bd-chscene bd-chscene--dyplom" id="bd-scene-dyplom" hidden
                 aria-label="Dyplom">
          <div class="bd-chscene__in">
            <div class="bd-page__main" id="bd-slot-k18"></div>
          </div>
        </section>

        <!-- 5. DOMKNIĘCIE — ostatni trop, więc żadnej podróży dalej. -->
        <section class="bd-chscene bd-chscene--p09koniec" id="bd-scene-p09-koniec" hidden
                 aria-label="Domknięcie śledztwa">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt">
                <h2 class="bd-scene__title bd-final__title">Sprawa rozwiązana</h2>
                <p class="bd-scene__text">Dowody zebrane, hasło złożone, dyplom w&nbsp;rękach.
                  Wracaj na tablicę — czeka tam ostatni ślad tej sprawy.</p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-p09-wroc">Wróć na tablicę śledztwa</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** Okablowanie P05 (Etap 2B): przeniesienie bloku K07, wysokość ramki
      w kadrze rozdziału, JEDYNE w trybie tablicy źródło nasłuchu
      `k07:completed` (rozstrzygnięcie D6) i obsługa powrotu. */
  /** ═══ TROP 5: SLAJDY (Etap T5.1) ═══════════════════════════════
      Sceny zmieniają się SKOKOWO — w kadrze jest dokładnie jedna, reszta
      ma `display:none`, więc nic nie prześwituje. Sceny z własnym
      przewijaniem (lot butelki, sekwencja K10) zachowują je wewnątrz
      swojej warstwy: granica scen zapada dopiero, gdy wewnętrzny scroll
      dojechał do krawędzi, a uczeń przewija DALEJ ponad próg. Dzięki temu
      nie trzeba było przepisywać ani jednej z dwóch dopracowanych animacji
      — obie nadal liczą postęp ze swojego prostokąta.

      Narracja idzie za obrazem: startuje po wskoku sceny i milknie przy
      zmianie, więc głos nigdy nie czyta sceny, której nie widać. */
  const P05_SLAJDY = ["#bd-scene-olejomat", "#bd-scene-k07", "#bd-scene-k09",
                      "#bd-scene-przejscie", "#bd-scene-k10", "#bd-scene-p05-koniec"];
  const P05_PROG = 120;      /* px delty potrzebne do przeskoku — drobny ruch kółka nic nie robi */
  const P05_ANIM = 460;      /* ms blokady na czas wskoku */
  const P05_BEZRUCH = 320;   /* ms bezruchu zerujące akumulator */

  function wireP05Slajdy(view) {
    const sceny = P05_SLAJDY.map((s) => view.querySelector(s)).filter(Boolean);
    if (sceny.length < 2) return null;
    view.classList.add("bd-slajdy");

    const dostepne = () => sceny.filter((s) => !s.hidden);
    let idx = 0, animuje = false, akumulator = 0, ostatni = 0;

    const audioWezel = (s) => (s.matches("[data-audio-src]") ? s : s.querySelector("[data-audio-src]"));

    const mow = (s) => {
      if (!NS.audio) return;
      const w = audioWezel(s);
      if (!w) return;
      NS.audio.loadScene(w);
      if (NS.audio.autoOn() && !NS.audio.isSuspended()) NS.audio.play(true);
    };

    const pokaz = (s, kierunek, bezAnimacji) => {
      sceny.forEach((x) => { if (x !== s) x.classList.remove("is-slajd-on", "is-pop"); });
      s.classList.add("is-slajd-on");
      /* wejście od strony, z której uczeń przyszedł: w dół — od góry sceny,
         w górę — od jej końca (odwracalność bez przeskoku treści) */
      s.scrollTop = kierunek < 0 ? Math.max(0, s.scrollHeight - s.clientHeight) : 0;
      if (!reduceMotion && !bezAnimacji) {
        s.classList.remove("is-pop");
        void s.offsetWidth;                 /* restart animacji */
        s.classList.add("is-pop");
      }
      syncBarHeight(view);
      /* animacje wewnątrz sceny liczą postęp z prostokąta — muszą dostać
         sygnał, że układ się zmienił */
      view.dispatchEvent(new Event("scroll"));
      nudgeWatchers();
    };

    const idzDo = (nowyIdx, kierunek) => {
      const lista = dostepne();
      if (animuje || nowyIdx < 0 || nowyIdx >= lista.length) return false;
      const cel = lista[nowyIdx];
      if (!cel || cel === lista[idx]) return false;
      animuje = true;
      akumulator = 0;
      if (NS.audio && NS.audio.stop) NS.audio.stop();   /* zmiana sceny przerywa nagranie */
      idx = nowyIdx;
      pokaz(cel, kierunek);
      setTimeout(() => {
        animuje = false;
        mow(cel);                                       /* głos DOPIERO po wskoku */
      }, reduceMotion ? 0 : P05_ANIM);
      return true;
    };

    const naKrancu = (s, kierunek) => {
      const zapas = 2;
      if (kierunek > 0) return s.scrollTop + s.clientHeight >= s.scrollHeight - zapas;
      return s.scrollTop <= zapas;
    };

    const ruch = (delta, ev) => {
      if (view.dataset.bdAudioOpen) return;   /* otwarty panel audio — slajdy stoją */
      const lista = dostepne();
      const biezaca = lista[idx];
      if (!biezaca) return;
      const kierunek = delta > 0 ? 1 : -1;
      if (!naKrancu(biezaca, kierunek)) { akumulator = 0; return; }   /* scena ma jeszcze własny scroll */
      if (ev && ev.cancelable) ev.preventDefault();
      const teraz = Date.now();
      if (teraz - ostatni > P05_BEZRUCH) akumulator = 0;
      ostatni = teraz;
      akumulator += delta;
      if (Math.abs(akumulator) < P05_PROG) return;
      idzDo(idx + kierunek, kierunek);
    };

    const naWheel = (e) => { if (!animuje) ruch(e.deltaY, e); else if (e.cancelable) e.preventDefault(); };
    view.addEventListener("wheel", naWheel, { passive: false });
    chapterCleanup.push(() => view.removeEventListener("wheel", naWheel));

    let dotykY = 0;
    const naStart = (e) => { dotykY = e.touches && e.touches[0] ? e.touches[0].clientY : 0; };
    const naMove = (e) => {
      if (!e.touches || !e.touches[0]) return;
      const dy = dotykY - e.touches[0].clientY;
      if (Math.abs(dy) < 8) return;
      dotykY = e.touches[0].clientY;
      ruch(dy * 1.6, e);                 /* palec przesuwa mniej niż kółko — stąd mnożnik */
    };
    view.addEventListener("touchstart", naStart, { passive: true });
    view.addEventListener("touchmove", naMove, { passive: false });
    chapterCleanup.push(() => {
      view.removeEventListener("touchstart", naStart);
      view.removeEventListener("touchmove", naMove);
    });

    /* Klawiatura nasłuchuje na DOKUMENCIE, nie na warstwie rozdziału:
       zdarzenie idzie od elementu z fokusem w górę, a fokus zwykle siedzi
       na `<body>`, które nie jest potomkiem warstwy — listener na `view`
       nie dostawał nic (pomiar T5.1: PageDown nie przełączał slajdu).
       Pola tekstowe i wnętrze ramki obsługują klawisze same. */
    const naKlawisz = (e) => {
      if (!view.isConnected || !view.classList.contains("bd-slajdy")) return;
      if (view.dataset.bdAudioOpen) return;   /* panel audio ma pierwszeństwo */
      const cel = e.target;
      if (cel && cel.closest && cel.closest("input, textarea, select, [contenteditable]")) return;
      const lista = dostepne();
      const biezaca = lista[idx];
      if (!biezaca || animuje) return;
      const wDol = e.key === "PageDown" || e.key === "ArrowDown";
      const wGore = e.key === "PageUp" || e.key === "ArrowUp";
      if (!wDol && !wGore) return;
      const kierunek = wDol ? 1 : -1;
      if (!naKrancu(biezaca, kierunek)) return;    /* najpierw wewnętrzny scroll sceny */
      if (idzDo(idx + kierunek, kierunek)) e.preventDefault();
    };
    document.addEventListener("keydown", naKlawisz);
    chapterCleanup.push(() => document.removeEventListener("keydown", naKlawisz));

    /* MOST Z RAMKI (T5.1): kółko nad osadzoną układanką K07 trafia do
       dokumentu ramki i NIGDY nie dociera do rozdziału — uczeń kręciłby
       kółkiem nad grą i nic by się nie działo. Ramka jest same-origin, więc
       podpinamy się do jej dokumentu i przekazujemy ruch dalej, ale tylko
       wtedy, gdy sama nie ma już czego przewijać. */
    const podepnijRamke = (ifr) => {
      try {
        const d = ifr.contentDocument;
        if (!d || d.__bdSlajdMost) return;
        d.__bdSlajdMost = true;
        const el = () => d.scrollingElement || d.documentElement;
        const wlasnyScroll = (kierunek) => {
          const n = el();
          if (!n) return false;
          return kierunek > 0
            ? n.scrollTop + n.clientHeight < n.scrollHeight - 2
            : n.scrollTop > 2;
        };
        d.addEventListener("wheel", (e) => {
          if (wlasnyScroll(e.deltaY > 0 ? 1 : -1)) return;
          ruch(e.deltaY, e);
        }, { passive: false });
        let y0 = 0;
        d.addEventListener("touchstart", (e) => {
          y0 = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        }, { passive: true });
        d.addEventListener("touchmove", (e) => {
          if (!e.touches || !e.touches[0]) return;
          const dy = y0 - e.touches[0].clientY;
          if (Math.abs(dy) < 8) return;
          y0 = e.touches[0].clientY;
          if (wlasnyScroll(dy > 0 ? 1 : -1)) return;
          ruch(dy * 1.6, e);
        }, { passive: false });
      } catch (e) { /* gdyby kiedyś ramka była z innej domeny — po prostu nic */ }
    };
    const szukajRamek = () => {
      view.querySelectorAll(".bd-chscene iframe").forEach((ifr) => {
        podepnijRamke(ifr);
        ifr.addEventListener("load", () => podepnijRamke(ifr));
      });
    };
    szukajRamek();
    const timerRamek = setInterval(szukajRamek, 1200);   /* ramki doczytują się leniwie */
    chapterCleanup.push(() => clearInterval(timerRamek));

    /* przewijanie WEWNĄTRZ slajdu musi napędzać animacje sceny */
    const mostek = () => { view.dispatchEvent(new Event("scroll")); nudgeWatchers(); };
    sceny.forEach((s) => {
      s.addEventListener("scroll", mostek, { passive: true });
      chapterCleanup.push(() => s.removeEventListener("scroll", mostek));
    });

    pokaz(sceny[0], 1, true);
    setTimeout(() => mow(sceny[0]), 60);

    /* Odsłonięcie kolejnej sceny (zaliczenie K07/K09) ma od razu ją pokazać —
       uczeń nie ma wracać scrollem po coś, co właśnie odblokował. */
    return {
      pokazScene(sel) {
        const s = view.querySelector(sel);
        if (!s || s.hidden) return;
        const i = dostepne().indexOf(s);
        if (i >= 0 && i !== idx) { animuje = false; idzDo(i, 1); }
      },
    };
  }

  function wireP05(c, view) {
    const slot = view.querySelector("#bd-slot-k07");
    moveBlockInto("k07", slot);
    const blok = view.querySelector("#k07");
    const koniec = view.querySelector("#bd-scene-p05-koniec");

    /* nadtytuł bez numeracji klocka (wzorzec z P03/P04), odwracalnie */
    const kicker = blok && blok.querySelector(":scope > .kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      const ogon = kicker.textContent.split("•").pop().trim();
      kicker.textContent = ogon ? ogon.charAt(0).toUpperCase() + ogon.slice(1) : "Zadanie obowiązkowe";
    }

    /* Etap 2B.1: w widoku zintegrowanym blok niesie JEDYNY tytuł i JEDYNY
       opis zadania (wewnętrzne teksty prototypu chowa tryb embed).
       Podmiana odwracalna — wariant ?legacy=1 zachowuje dotychczasowe
       brzmienie bloku. */
    const tytul = blok && blok.querySelector(":scope > .lead");
    if (tytul) {
      titleFixes.push({ el: tytul, html: tytul.innerHTML });
      tytul.textContent = "Ułóż drogę butelki";
    }
    const opis = blok && blok.querySelector(":scope > .body-text");
    if (opis) {
      titleFixes.push({ el: opis, html: opis.innerHTML });
      opis.textContent = "Zielona butelka należy do systemu Olejomatów. " +
        "Ułóż sześć kart — od rejestracji z pomocą osoby dorosłej aż do " +
        "oddania pełnej butelki. Przeciągnij kartę albo wybierz kartę, " +
        "a potem właściwe pole.";
    }

    const wrap = blok && blok.querySelector('[data-frame="k07"]');
    const frame = wrap && wrap.querySelector("iframe");
    const statusEl = blok && blok.querySelector(".frame__status");

    /* Moduł doczytuje się w tle już podczas Fazy A (rozstrzygnięcie 6 Etapu
       2B.1) — do Fazy B jest niewidoczny, nie zmienia geometrii przypiętej
       sceny i niczego nie odtwarza (autostart usunięty z prototypu).
       Ładowanie w trybie tablicy prowadzi WYŁĄCZNIE ta ścieżka (legacy'owy
       watcher ma osłonę bd-on) i dokleja parametr trybu osadzenia. */
    const lazyLoad = () => {
      if (!frame || !frame.dataset.src || frame.src) return;
      if (wrap) { wrap.classList.remove("is-ready"); wrap.classList.add("is-loading"); }
      if (statusEl) statusEl.textContent = "Wczytywanie modułu…";
      const bazowy = frame.dataset.src;
      frame.src = bazowy + (bazowy.indexOf("?") >= 0 ? "&" : "?") + "embed=board";
    };

    /* Wysokość ramki liczona od KADRU rozdziału (nie okna): prototyp to pełna
       strona min-height:100vh, więc mierzymy treść po ustawieniu wysokości
       startowej i powiększamy tylko, gdy naprawdę wystaje. Zmiany geometrii
       nie dotykają `src`, więc ramka nie przeładowuje się przy drobnych
       korektach ani zmianie orientacji. */
    const fitFrame = () => {
      if (!frame || !frame.src) return;
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        const bar = parseFloat(getComputedStyle(view).getPropertyValue("--bd-bar-h")) || 64;
        let h = Math.min(Math.max(Math.round((view.clientHeight - bar) * 0.92), 520), 980);
        frame.style.height = h + "px";
        for (let i = 0; i < 2; i++) {
          const sh = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
          if (sh <= h + 4) break;
          /* pionowa plansza + bank kart mają na telefonach ~1950–2020 px;
             limit chroni tylko przed patologią (pętla 100vh), nie przycina
             realnej treści — inaczej wróciłby podwójny pionowy scroll */
          h = Math.min(sh, 2200);
          frame.style.height = h + "px";
        }
      } catch (e) { /* same-origin — nie wystąpi */ }
    };
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(fitFrame);
      ro.observe(view);
      chapterCleanup.push(() => ro.disconnect());
    }

    /* Jedyne źródło zaliczenia w trybie tablicy (legacy'owy initFrames jest
       osłonięty warunkiem body.bd-on). Idempotencja: completeInteraction
       zwraca false przy powtórce — status i sceny aktualizują się raz. */
    const pokazKoniec = (odRazu) => {
      if (!koniec) return;
      koniec.hidden = false;
      setSceneActive(koniec, true);
      syncBarHeight(view);
      if (odRazu) return;
      /* T5.1: finał staje się dostępnym slajdem; uczeń dochodzi do niego
         przewijaniem po sekwencji, bez wyrywania go z niej skokiem */
      if (view.__bdSlajdy) return;
      requestAnimationFrame(() => scrollToHeading(koniec, view));
    };
    /* Etap 2D: po K07 odsłania się K09 (stacja kontroli), a nie panel końca */
    const onDone = () => {
      if (!(NS.state && NS.state.completeInteraction("k07"))) return;
      if (statusEl) statusEl.textContent = "Układanka ukończona. Droga butelki gotowa.";
      announce("Droga butelki ukończona. Sprawdź teraz, co może trafić do zielonej butelki.");
      odslonaK09(view, false);
    };
    /* ── KLIPY GŁOSOWE KART (Etap A4) ────────────────────────────────
       Uczeń, który nie czyta płynnie, po wybraniu karty słyszy jej podpis
       i wie, co przeciąga do którego pola. Prototyp mówi tylko, KTÓRA karta
       padła (`k07:card` → {id, label}); ścieżki i decyzja o odtwarzaniu
       należą do lekcji.
       Bramka trybu stoi PRZED `playClip`, więc w „Czytam" nie powstaje nawet
       element audio — po plik nie leci żadne żądanie. To świadoma RÓŻNICA
       wobec kart diagramu w Tropie 3, które grają w każdym trybie.
       Kanał jest jeden, więc klip przerywa narrację polecenia i odwrotnie —
       „ostatni start wygrywa", bez kolejkowania. */
    const KLIPY_KART = {
      1: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/01-rejestracja-w-aplikacji.mp3",
      2: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/02-odbior-pustej-butelki.mp3",
      3: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/03-zabranie-butelki-do-domu.mp3",
      4: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/04-przelanie-ostygnietego-oleju.mp3",
      5: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/05-zakrecenie-butelki.mp3",
      6: "../assets/audio/lekcja45/05-sprawa-oleju/karty-drogi/06-oddanie-butelki-do-olejomatu.mp3",
    };
    const onCard = (e) => {
      const S = NS.state;
      const d = e && e.detail;
      const src = d && KLIPY_KART[d.id];
      if (!src || !S || !NS.audio || !NS.audio.playClip) return;
      if (S.get().audioMode !== "both") return;
      NS.audio.playClip(src, "Karta: " + (d.label || ""));
    };

    if (frame) {
      const bind = () => {
        try {
          const win = frame.contentWindow;
          if (!win || win.__bdK07Bound) return;
          win.__bdK07Bound = true;
          win.addEventListener("k07:completed", onDone);
          win.addEventListener("k07:card", onCard);
          chapterCleanup.push(() => {
            try {
              win.removeEventListener("k07:completed", onDone);
              win.removeEventListener("k07:card", onCard);
            } catch (e) { /* okno zwolnione */ }
          });
        } catch (e) { /* cisza */ }
      };
      /* (2B.1) Notkę prototypu i zdublowane teksty chowa czysty tryb
         osadzenia (?embed=board → html.k07-embed w CSS prototypu) — bez
         doraźnych ingerencji z rodzica po każdym load. */
      const onFrameLoad = () => {
        bind(); fitFrame(); setTimeout(fitFrame, 600);
        /* legacy'owy listener load ustawia „Moduł gotowy." — przy klocku już
           ukończonym (D3) przywracamy status zaliczenia (nasz listener jest
           późniejszy, więc wygrywa) */
        if (NS.state && NS.state.isCompleted && NS.state.isCompleted("k07") && statusEl) {
          statusEl.textContent = "Układanka ukończona. Droga butelki gotowa.";
        }
      };
      frame.addEventListener("load", onFrameLoad);
      chapterCleanup.push(() => frame.removeEventListener("load", onFrameLoad));
      if (frame.contentDocument && frame.src) { bind(); fitFrame(); }
      /* Wyjście z rozdziału: klocek wraca do ukrytego <main>, a ponowne
         wpięcie iframe'u do DOM i tak przeładowuje jego zawartość — bez
         zdjęcia src wystartowałaby tam od nowa ukryta narracja układanki.
         Zdejmujemy src (data-src zostaje), więc moduł wraca do stanu
         leniwego i doczyta się dopiero przy kolejnym wejściu w scenę. */
      chapterCleanup.push(() => {
        try { frame.removeAttribute("src"); } catch (e) { /* ignore */ }
      });
      requestAnimationFrame(lazyLoad);
    }

    /* D3 + Etap 2D: honorujemy trwały stan lekcji przy ponownym wejściu.
       K07 ✓ → stacja kontroli dostępna od razu; K09 ✓ → także finał tropu.
       Ukończone zadania pozostają dostępne dobrowolnie. */
    const Sx = NS.state;
    const k07Gotowe = !!(Sx && Sx.isCompleted && Sx.isCompleted("k07"));
    const k09Gotowe = !!(Sx && Sx.isCompleted && Sx.isCompleted("k09"));
    if (k07Gotowe) {
      if (statusEl) statusEl.textContent = "Układanka ukończona. Droga butelki gotowa.";
      odslonaK09(view, true);
    }
    /* Etap 2E: po ukończonym K09 trop pokazuje od razu CAŁĄ resztę drogi —
       scenę K10 i panel domknięcia (K10 bez własnego zaliczenia). */
    if (k09Gotowe) { odslonaK10(view, true); pokazKoniec(true); }

    /* KOREKTA T5–T7.1: koniec tropu ma wyglądać TAK SAMO jak w tropach 1–4,
       czyli ukończenie + podróż kamerą do kolejnego polaroidu jednym ruchem.
       `finishChapter` samo w sobie NIE podróżuje — zamyka stronę i cofa
       kamerę do widoku ogólnego. Wzorzec z P01–P04 pyta najpierw
       `autoNext`, a dopiero brak następnika kończy trop na miejscu. */
    const wroc = view.querySelector("#bd-p05-wroc");
    if (wroc) wroc.addEventListener("click", () => {
      wroc.disabled = true;
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });

    wireK09(view, pokazKoniec);
    wireK10(view);

    /* Etap T5.1: dopiero teraz, gdy sceny są zbudowane i odsłonięte zgodnie
       ze stanem lekcji, przełączamy trop na SLAJDY. */
    const slajdy = wireP05Slajdy(view);
    if (slajdy) {
      view.__bdSlajdy = slajdy;
      chapterCleanup.push(() => { delete view.__bdSlajdy; });
    }
    wireOlejomatIntro(view);
  }

  /** Odsłona sceny K09 „Magnetyczna stacja kontroli" (Etap 2D).
      Blok #k09 jest natywny (bez iframe'u), więc wystarczy odsłonić scenę —
      moduł został okablowany przy przenoszeniu bloku (patrz `wireK09`). */
  function odslonaK09(view, odRazu) {
    const scena = view.querySelector("#bd-scene-k09");
    if (!scena) return;
    scena.hidden = false;
    setSceneActive(scena, true);
    syncBarHeight(view);
    if (odRazu) return;
    /* Etap T5.1: w trybie slajdów „odsłona" znaczy przeskok na tę scenę,
       a nie przewinięcie do jej nagłówka — nie ma czego przewijać. */
    if (view.__bdSlajdy) { view.__bdSlajdy.pokazScene("#bd-scene-k09"); return; }
    requestAnimationFrame(() => scrollToHeading(scena, view));
  }

  /** Odsłona sceny K10 „Olej rusza w dalszą drogę" (Etap 2E) — razem z nią
      trop pokazuje resztę drogi. Scena jest opowieścią: bez zaliczenia. */
  function odslonaK10(view, odRazu) {
    const scena = view.querySelector("#bd-scene-k10");
    if (!scena) return;
    /* zdanie przejścia jest osobnym slajdem (T5.1) i wchodzi razem z K10 */
    const przejscie = view.querySelector("#bd-scene-przejscie");
    if (przejscie) { przejscie.hidden = false; setSceneActive(przejscie, true); }
    scena.hidden = false;
    setSceneActive(scena, true);
    syncBarHeight(view);
    if (odRazu) return;
    if (view.__bdSlajdy) { view.__bdSlajdy.pokazScene("#bd-scene-przejscie"); return; }
    requestAnimationFrame(() => scrollToHeading(scena, view));
  }

  /** Okablowanie TROPU 6 (Etap 3A). Blok #k11-seq przyjeżdża z dokumentu
      lekcji razem ze swoim silnikiem `frameSequence` (wspólnym z ?legacy=1),
      więc tutaj tylko: przeniesienie, mostek scrolla rozdziału, przełączanie
      faz stadion ↔ analityka i odsłona panelu końca. Zero drugiego silnika. */
  function wireP06(c, view) {
    const slot = view.querySelector("#bd-slot-k11");
    if (!slot) return;
    moveBlockInto("k11-seq", slot);
    const blok = view.querySelector("#k11-seq");
    if (!blok) return;

    /* nadtytuł bez numeracji klocka (wzorzec tropów), odwracalnie */
    const kicker = blok.querySelector(".kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      kicker.textContent = "Skala problemu";
    }

    /* Korekta 3C.3.2: skrót „przejdź niżej" musi jechać RAZEM z przypiętym
       kadrem — zostawiony na końcu runwayu lądował kilkaset pikseli pod
       dolną krawędzią okna, więc uczeń nigdy go nie widział. */
    const skrot = view.querySelector("#bd-p06-dalej");
    const kolumnaK11 = blok.querySelector(".seq__stage > div");
    if (skrot && kolumnaK11 && skrot.parentElement !== kolumnaK11) {
      kolumnaK11.appendChild(skrot);
    }

    /* Runwayem jest SAMA sekcja #k11-seq — z jej geometrii silnik
       `frameSequence` liczy postęp scrubu (wzorzec K10). Osobny kontener
       spłaszczyłby sekcję i silnik nie miałby z czego liczyć. Klasę fazy
       wpinamy tam, gdzie szuka jej CSS: na sekcji. */
    const stage = blok;
    const runway = blok;
    /* Korekta 3C.3.2: zamknięcie tropu przenika w kadrze sceny lasu, więc
       nie ma już osobnej sekcji do odsłonięcia — została pusta funkcja dla
       ścieżki reduced motion, która pokazuje panel od razu. */
    const pokazKoniec = () => {
      const p = view.querySelector(".k12__panel");
      if (p) {
        p.classList.add("is-on");
        p.querySelectorAll("[data-wiersz]").forEach((el) => el.classList.add("is-on"));
      }
    };

    /* Mostek scrolla rozdziału → obserwator geometrii i silnik sekwencji
       (ten sam wzorzec co K10 w 2E: `frameSequence` nasłuchuje scrolla OKNA,
       a rozdział przewija własny kontener). */
    let raf = 0;
    const most = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
      });
    };
    view.addEventListener("scroll", most, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", most);
      if (raf) cancelAnimationFrame(raf);
    });

    /* Fazy w JEDNEJ przestrzeni kadru: po plateau na pełnym stadionie
       wchodzi ekran analityczny (crossfade, klasa `is-analiza`), z histerezą
       przy cofaniu — dokładnie jak przejście dowód → diagram w P03.
       Panel końca odsłaniamy dopiero, gdy uczeń dojedzie do końca analizy. */
    let rafF = 0;
    const fazy = () => {
      rafF = 0;
      if (!runway || !stage) return;
      const r = runway.getBoundingClientRect();
      if (r.height < 1) return;
      const droga = Math.max(r.height - view.clientHeight, 1);
      const p = Math.max(0, Math.min(1, -r.top / droga));
      const naAnalizie = stage.classList.contains("is-analiza");
      if (!naAnalizie && p >= 0.70) {
        stage.classList.add("is-analiza");
        announce("Skala w liczbach: 42 miliony ton rocznie, czyli około 41 kubatur stadionu.");
      } else if (naAnalizie && p < 0.64) {
        stage.classList.remove("is-analiza");
      }
      /* Korekta 3C.3.1: skrót „przejdź niżej" — przewija do sceny lasu. */
      const dalej = view.querySelector("#bd-p06-dalej");
      if (dalej && !dalej.dataset.wpiete) {
        dalej.dataset.wpiete = "1";
        dalej.addEventListener("click", () => {
          const cel = view.querySelector("#bd-scene-k12") || view.querySelector("#k12-scene");
          if (cel) cel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        });
      }

    };
    const onFazy = () => { if (!rafF) rafF = requestAnimationFrame(fazy); };
    view.addEventListener("scroll", onFazy, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", onFazy);
      if (rafF) cancelAnimationFrame(rafF);
    });
    fazy();

    /* Reduced motion: sekwencja jest statyczna (silnik dodaje `is-static`),
       więc scrub nie rozstrzygnie faz — pokazujemy pełną wiedzę od razu. */
    if (reduceMotion) {
      stage.classList.add("is-analiza");
      pokazKoniec(true);
    }

    /* Etap 3B: druga scena tropu — las. Ten sam wzorzec co K11: blok
       przyjeżdża z dokumentu lekcji ze swoim silnikiem, my tylko go
       przenosimy i skracamy nadtytuł. Mostek scrolla (wyżej) obsługuje
       obie sceny naraz, bo rzuca zdarzenie na okno. */
    const slotK12 = view.querySelector("#bd-slot-k12");
    if (slotK12) {
      moveBlockInto("k12-scene", slotK12);
      const blokK12 = view.querySelector("#k12-scene");
      const kickerK12 = blokK12 && blokK12.querySelector(".kicker");
      if (kickerK12 && /klocek/i.test(kickerK12.textContent)) {
        titleFixes.push({ el: kickerK12, html: kickerK12.innerHTML });
        kickerK12.textContent = "Ślady w lesie";
      }
      /* Korekta 3C.3.2: treść zamknięcia tropu wjeżdża do kadru sceny lasu,
         żeby las mógł w nim zgasnąć, a panel wejść wierszami w tym samym
         miejscu. Jedna treść — przenosimy ją z szablonu, nie kopiujemy. */
      const szablon = view.querySelector("#bd-p06-koniec-tresc");
      const kolumnaK12 = blokK12 && blokK12.querySelector(".k12__stage > div");
      if (szablon && kolumnaK12 && !blokK12.querySelector(".k12__panel")) {
        kolumnaK12.appendChild(szablon.content.cloneNode(true));
        const wroc = blokK12.querySelector("#bd-p06-wroc");
        /* KOREKTA T5–T7.1: ten sam wzorzec co P05 i tropy 1–4 — ukończenie
           tropu i podróż kamerą do kolejnego polaroidu jednym ruchem. */
        if (wroc) wroc.addEventListener("click", () => {
          wroc.disabled = true;
          const next = autoNext(c);
          if (next) travelTo(next); else finishChapter(c);
        });
      }
      /* Korekta 3C.3.3: las dostaje pierwszą klatkę tak samo jak stadion —
         w chwili wejścia do tropu, a nie dopiero gdy scena wjedzie w pole
         widzenia. Przy zimnym wejściu na wolnym łączu kadr lasu stał pusty
         kilkanaście sekund, bo czekał na leniwy preload (pomiar w raporcie 61,
         aneks C). Rozgrzewka kolejnych klatek zostaje jak dotąd. */
      const kadrLas = blokK12 && blokK12.querySelector(".k12__frame");
      if (kadrLas && !kadrLas.getAttribute("src")) {
        kadrLas.setAttribute("src", "../assets/images/lekcja45/las-seq/las-000.webp");
        if (kadrLas.complete && kadrLas.naturalWidth) blokK12.classList.add("is-ready");
        else kadrLas.addEventListener("load", () => blokK12.classList.add("is-ready"), { once: true });
      }
      for (let i = 1; i < 4; i++) {
        const im = new Image();
        im.src = "../assets/images/lekcja45/las-seq/las-" +
          String(i).padStart(3, "0") + ".webp";
      }
    }

    /* Etap 3C.1 — PIERWSZY KADR OD RAZU.
       Rozgrzewka z 2E.1 wypełniała wyłącznie cache HTTP: `<img>` nadal nie
       miał atrybutu `src`, więc do czasu leniwego preloadu przeglądarka
       malowała ikonę zepsutego obrazka i tekst alternatywny (usterka
       zgłoszona z realnego testu, pomiar w raporcie 59). Teraz kadr
       dostaje pierwszą klatkę w chwili przenoszenia bloku — czyli zanim
       strona tropu w ogóle się pokaże. Koszt: 71,5 KB i tylko dla ucznia,
       który wszedł w Trop 6; start lekcji i tryb legacy bez zmian. */
    const kadr = blok.querySelector(".seq__frame");
    if (kadr && !kadr.getAttribute("src")) {
      kadr.setAttribute("src", "../assets/images/lekcja45/stadion-seq/stadion-000.webp");
      if (kadr.complete && kadr.naturalWidth) blok.classList.add("is-ready");
      else kadr.addEventListener("load", () => blok.classList.add("is-ready"), { once: true });
    }
    /* pozostała rozgrzewka: kolejne klatki do cache, zanim ruszy scrub */
    for (let i = 1; i < 4; i++) {
      const im = new Image();
      im.src = "../assets/images/lekcja45/stadion-seq/stadion-" +
        String(i).padStart(3, "0") + ".webp";
    }
  }

  /** Okablowanie P07 (Etap 4A.1 + 4B): plac jako kotwica sceny, blok K13
      w oprawie tropu, przejście do Spaceru (K14) po rozwinięciu skrótu. */
  function wireP07(c, view) {
    /* Mostek scrolla rozdziału → obserwatory geometrii (ten sam wzorzec co
       P05/P06: rozdział przewija własny kontener, a obserwatory nasłuchują
       scrolla OKNA). Tędy budzi się też wartownik końca Spaceru. */
    let raf = 0;
    const most = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
      });
    };
    view.addEventListener("scroll", most, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", most);
      if (raf) cancelAnimationFrame(raf);
    });

    /* Kotwica sceny: dopóki obraz nie ma pikseli, jego miejsce trzyma płyta
       zastępcza (CSS). Wzorzec is-ready z K11/K12 — na wolnym łączu uczeń
       nie ma prawa zobaczyć pustego prostokąta z tekstem alternatywnym. */
    const figura = view.querySelector("#pszok-plac-figura");
    const plac = view.querySelector("#pszok-plac");

    /* ── WYPRZEDZENIE DLA SPACERU ──
       Materiał Spaceru to 26 plików (3,29 MB). Na zimnym łączu 3G nie zdąży
       dojechać, jeśli zacznie się dopiero przy odsłonięciu sceny: uczeń
       wchodzi w Spacer po kilkunastu sekundach (plac + pięć liter), a to
       za mało. Kolejka rusza więc już przy WEJŚCIU W TROP — ale dopiero
       po kotwicy sceny, żeby nie odbierać jej pasma. Obrazy są tymi samymi
       węzłami, które później przyjadą z blokiem, więc `src` ustawiony teraz
       jest gotowy w chwili wpięcia. */
    const grzejSpacer = () => {
      const blokK14 = document.getElementById("k14");
      if (!blokK14) return;
      const nastepny = () => {
        const im = Array.from(blokK14.querySelectorAll(".pj-station img[data-src]"))
          .find((e) => !e.getAttribute("src"));
        if (!im) return;
        im.addEventListener("load", nastepny, { once: true });
        im.addEventListener("error", nastepny, { once: true });
        im.setAttribute("src", im.dataset.src);
      };
      nastepny();
    };

    if (plac && figura) {
      if (plac.complete && plac.naturalWidth) { figura.classList.add("is-plac"); grzejSpacer(); }
      else plac.addEventListener("load", () => {
        figura.classList.add("is-plac"); grzejSpacer();
      }, { once: true });
    } else grzejSpacer();

    /* ── ROZWINIĘCIE SKRÓTU (blok K13 z dokumentu lekcji) ── */
    const slot = view.querySelector("#bd-slot-k13");
    if (slot) moveBlockInto("k13", slot);
    const blok = view.querySelector("#k13");

    /* ── KADR WEJŚCIA: PRZENIKANIE FAZ (korekta 4A.3) ──
       Tytuł, plac i rozwinięcie skrótu dzielą jeden przypięty kadr.
       Fazy są czystą funkcją postępu — scroll w górę cofa je same z siebie,
       bez pamiętania stanu (ten sam wzorzec co Spacer w 4B.3). */
    const runway = view.querySelector("#pw-runway");
    const kadr = view.querySelector("#pw-stage");
    let kadrWolny = false;

    /* Piąta litera otwiera rozwinięcie z definicją i przyciskiem — treści,
       która nie mieści się w kadrze na niskich oknach. Zamiast ją ciąć,
       ODPINAMY kadr: od tej chwili scena płynie normalnie i ma tyle
       miejsca, ile potrzebuje. Odpięcie zmienia wysokość runwayu, więc bez
       korekty scrolla treść skoczyłaby uczniowi pod palcami — mierzymy
       położenie kadru przed i po, a różnicę oddajemy scrollowi. */
    const uwolnijKadr = (przewin) => {
      if (kadrWolny || !runway || !kadr) return;
      kadrWolny = true;
      const przed = kadr.getBoundingClientRect().top;
      runway.classList.add("pw--wolny");
      const po = kadr.getBoundingClientRect().top;
      view.scrollTop += po - przed;
      nudgeWatchers();
      /* Piąta litera odsłania odpowiedź NIŻEJ, poza kadrem — uczeń musiałby
         się domyślić, że ma zjechać. Przy powrocie do tropu (przewin=false)
         nic nie przewijamy: uczeń jest wtedy na górze sceny. */
      if (!przewin) return;
      const odslona = view.querySelector("#k13-expand .k13__reveal");
      if (!odslona || odslona.hidden) return;
      requestAnimationFrame(() => odslona.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth", block: "center" }));
    };

    if (runway && kadr && !reduceMotion) {
      const przytnij = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
      let rafW = 0;
      const fazyWejscia = () => {
        rafW = 0;
        if (kadrWolny) return;
        const r = runway.getBoundingClientRect();
        if (r.height < 1) return;
        const droga = Math.max(r.height - view.clientHeight, 1);
        const p = przytnij(-r.top / droga);
        /* Zakresy CELOWO na siebie zachodzą — to jest przenikanie:
           tytuł gaśnie 0,12–0,40, skrót wchodzi 0,30–0,65. */
        const t = 1 - przytnij((p - 0.12) / 0.28);
        const k = przytnij((p - 0.30) / 0.35);
        /* Plac kurczy się SZYBCIEJ, niż wschodzi skrót (0,18–0,46 wobec
           0,30–0,65). Bez tego wyprzedzenia w środku przenikania obie
           treści są jeszcze duże naraz i kadr się przelewa — zmierzone
           114% wypełnienia i 265 px poza kadrem przy równych rampach. */
        const s = przytnij((p - 0.18) / 0.28);
        kadr.style.setProperty("--pw-t", t.toFixed(3));
        kadr.style.setProperty("--pw-k", k.toFixed(3));
        kadr.style.setProperty("--pw-s", s.toFixed(3));
        /* `is-blisko` wpuszcza skrót do drzewa dostępności i kolejności
           tabulacji dopiero, gdy zaczyna być widoczny; `is-skrot` wpuszcza
           kliknięcia, gdy widać już, w co uczeń celuje. */
        kadr.classList.toggle("is-blisko", k > 0.01);
        kadr.classList.toggle("is-skrot", k > 0.5);
        kadr.classList.toggle("is-pelny", p >= 0.72);
      };
      const naScroll = () => { if (!rafW) rafW = requestAnimationFrame(fazyWejscia); };
      view.addEventListener("scroll", naScroll, { passive: true });
      window.addEventListener("resize", naScroll);
      chapterCleanup.push(() => {
        view.removeEventListener("scroll", naScroll);
        window.removeEventListener("resize", naScroll);
        if (rafW) cancelAnimationFrame(rafW);
      });
      fazyWejscia();
    } else if (runway) {
      /* ograniczony ruch: żadnego przenikania — wszystko widoczne od razu */
      uwolnijKadr(false);
    }

    /* ── SPACER PO PSZOK-u (Etap 4B) ──
       Blok przyjeżdża z dokumentu lekcji RAZEM ze swoim kontrolerem.
       Treść, stacje i etykiety bez zmian — zmienia się wyłącznie to,
       skąd kontroler czyta postęp (kontener rozdziału zamiast okna). */
    const scenaK14 = view.querySelector("#bd-scene-k14");
    const slotK14 = view.querySelector("#bd-slot-k14");
    let spacerWpiety = false;
    const wepnijSpacer = () => {
      if (spacerWpiety || !slotK14) return;
      spacerWpiety = true;
      moveBlockInto("k14", slotK14);
      /* Wartownik końca spaceru leży POZA blokiem #k14 (osobny węzeł
         #k14-end za ostatnią stacją) i to on rozstrzyga zaliczenie k14.
         Zostawiony w ukrytym dokumencie miałby geometrię 0×0 i nigdy nie
         wszedłby w pole widzenia — kontrakt „dopiero po dojściu do końca"
         nigdy by się nie domknął (reguła zerowej geometrii z N2.1). */
      const wartownik = document.getElementById("k14-end");
      if (wartownik && wartownik.parentNode !== slotK14) {
        const kotwica = document.createComment("k14-end");
        wartownik.parentNode.insertBefore(kotwica, wartownik);
        moved.push({ node: wartownik, anchor: kotwica });
        slotK14.appendChild(wartownik);
      }
      /* KOREKTA 4B.3: w tablicy Spacer ma własny, pionowy układ — scena
         z kamerą i naprzemiennymi stronami ustępuje. `stop()` woła własne
         sprzątanie kontrolera: teksty i numery wracają do stacji, klasa
         `js-pj` znika, pozycjonowanie absolutne przestaje obowiązywać. */
      if (NS.spacer && typeof NS.spacer.stop === "function") {
        try { NS.spacer.stop(); } catch (e) { console.warn("[spacer]", e); }
      }
      spacerBoard(view);
      nudgeWatchers();
    };

    const odslonSpacer = (odRazu) => {
      if (!scenaK14) return;
      wepnijSpacer();
      if (!scenaK14.hidden) return;
      scenaK14.hidden = false;
      /* po odsłonięciu sekcja ma wreszcie realną wysokość — przeliczamy fazy */
      requestAnimationFrame(() => nudgeWatchers());
      if (!odRazu) announce("Odsłonięto spacer po PSZOK-u. Przewijaj, żeby przejść przez wszystkie strefy.");
    };

    if (blok) {
      /* nadtytuł bez numeracji klocka (wzorzec tropów), odwracalnie */
      const kicker = blok.querySelector(".kicker");
      if (kicker && /klocek/i.test(kicker.textContent)) {
        titleFixes.push({ el: kicker, html: kicker.innerHTML });
        kicker.textContent = "Centrum dowodów";
      }
      /* Etap 4B: „Zajrzyjmy do środka" wraca i prowadzi do Spaceru wpiętego
         w rozdziale. W legacy ten sam przycisk zostaje zwykłą kotwicą #k14. */
      const doSrodka = blok.querySelector('.k13__reveal a.btn[href="#k14"]');
      if (doSrodka && !doSrodka.dataset.wpiete) {
        doSrodka.dataset.wpiete = "1";
        const naKlik = (e) => {
          e.preventDefault();
          odslonSpacer(false);
          const cel = view.querySelector("#bd-scene-k14");
          if (cel) cel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        };
        doSrodka.addEventListener("click", naKlik);
        chapterCleanup.push(() => {
          doSrodka.removeEventListener("click", naKlik);
          delete doSrodka.dataset.wpiete;
        });
      }
    }

    /* ── GRA „OBSŁUŻ PSZOK" (Etap 4C) ──
       Blok #k15 przyjeżdża z dokumentu lekcji razem ze swoją obsługą
       (modules.js): leniwe ładowanie ramki, wyciszenie narracji i nasłuch
       `pszok:completed`, który przyznaje literę O. Tu tylko odsłona sceny,
       przewinięcie do panelu i zatrzymanie gry przy wyjściu z tropu. */
    const scenaK15 = view.querySelector("#bd-scene-k15");
    const koniec = view.querySelector("#bd-scene-p07-koniec");
    let graWpieta = false;

    const odslonGre = (odRazu) => {
      if (!scenaK15) return;
      if (!graWpieta) {
        graWpieta = true;
        const slotK15 = view.querySelector("#bd-slot-k15");
        if (slotK15) moveBlockInto("k15", slotK15);
        /* KOREKTA 5B.1: w trybie tablicy żaden tekst „Klocek N" nie może być
           widoczny — ten sam mechanizm co przy K16, odwracalny, więc
           `?legacy=1` zachowuje dotychczasowe brzmienie. */
        const blokK15 = view.querySelector("#k15");
        const kickerK15 = blokK15 && blokK15.querySelector(":scope > .kicker");
        if (kickerK15 && /klocek/i.test(kickerK15.textContent)) {
          titleFixes.push({ el: kickerK15, html: kickerK15.innerHTML });
          kickerK15.textContent = "";
          kickerK15.hidden = true;
          chapterCleanup.push(() => { kickerK15.hidden = false; });
        }
        /* Panel postępu — ten sam węzeł DOM, wpisany do `moved`, więc przy
           zamknięciu rozdziału wraca na miejsce (wzorzec z Tropów 4 i 8). */
        const slotPO = view.querySelector("#bd-slot-progress-k15");
        const progO = document.getElementById("progress-panel");
        if (slotPO && progO && !moved.some((m) => m.node === progO)) {
          const kotwica = document.createComment("bd-anchor-progress");
          progO.parentNode.insertBefore(kotwica, progO);
          slotPO.appendChild(progO);
          moved.push({ node: progO, anchor: kotwica });
        }
        explainProgress(view);
        /* Wzorzec N2.1: przy wyjściu z tropu ramka gry musi ucichnąć —
           zdejmujemy `src`, więc gra przestaje istnieć razem z dźwiękiem
           i żądaniami. Przy powrocie `data-src` ładuje ją od nowa. */
        chapterCleanup.push(() => {
          const ramka = document.querySelector("[data-frame-pszok] iframe");
          if (ramka && ramka.getAttribute("src")) ramka.removeAttribute("src");
        });
        nudgeWatchers();
      }
      if (scenaK15.hidden) {
        scenaK15.hidden = false;
        if (!odRazu) announce("Odsłonięto grę: Obsłuż PSZOK.");
      }
      if (koniec && koniec.hidden) koniec.hidden = false;
    };

    /* Pierwsze zaliczenie przewija ucznia do panelu domknięcia; powrót
       z ekranu wyników gry robi to samo, bez zamykania tropu. */
    const doPanelu = () => {
      if (!koniec) return;
      koniec.hidden = false;
      requestAnimationFrame(() => koniec.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
    };
    view.addEventListener("k15:pierwsza-wygrana", doPanelu);
    view.addEventListener("k15:powrot", doPanelu);

    /* Spacer odsłania się po zaliczeniu skrótu, a gra po przejściu Spaceru
       — od razu, gdy uczeń wraca do tropu z zaliczonymi krokami. */
    const Sx = NS.state;
    const zastosuj = (s) => {
      const ukonczone = s.completedInteractions;
      /* Zaliczony skrót = rozwinięcie z definicją jest na ekranie, więc kadr
         musi być odpięty. Dotyczy też ucznia, który wraca do tropu. */
      if (ukonczone.indexOf("k13") >= 0) { uwolnijKadr(false); odslonSpacer(true); }
      if (ukonczone.indexOf("k14") >= 0) odslonGre(true);
    };
    if (Sx && Sx.get) zastosuj(Sx.get());
    if (Sx && Sx.onChange) {
      const off = Sx.onChange((s) => {
        if (s.completedInteractions.indexOf("k13") >= 0) { uwolnijKadr(true); odslonSpacer(false); }
        if (s.completedInteractions.indexOf("k14") >= 0) odslonGre(false);
      });
      chapterCleanup.push(off);
    }
    if (reduceMotion) { odslonSpacer(true); odslonGre(true); }

    const wroc = view.querySelector("#bd-p07-wroc");
    /* Etap 5A: P08 jest już zintegrowane, więc koniec Tropu 7 wraca na
       wzorzec tropów 1–6 — ukończenie, odblokowanie i PODRÓŻ KAMERY.
       `disabled` po kliknięciu, żeby podwójny klik nie odpalił dwóch
       podróży (ten sam zabezpieczacz co w P05/P06). */
    if (wroc) wroc.addEventListener("click", () => {
      wroc.disabled = true;
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });
  }

  /** KOREKTA 4B.3 — SPACER W TABLICY: UKŁAD PIONOWY, JEDNA STACJA NA EKRAN.

      Naprzemienna kompozycja lewo/prawo z ruchem kamery nie mieści się
      w kolumnie rozdziału bez ucięć (pomiar 4B.1: tekst wychodził 27–58 px
      poza kadr na każdej szerokości). Zamiast skalować tamtą choreografię
      scena dostaje tu własną, prostą: przypięty kadr pod belką, w nim
      kolejno tytuł, opis i obraz stacji.

      Fazy są CZYSTĄ FUNKCJĄ POSTĘPU — dzięki temu przewijanie w górę cofa
      je bez osobnej logiki, a scena nie ma stanu do zgubienia.
      Ten sam mechanizm co K11/K12: postęp z geometrii sekcji, zdarzenia
      z mostka scrolla rozdziału. Bez GSAP (ten zostaje dla ?legacy=1). */
  /** Okablowanie P08 (Etap 5A). Cała scena pochodzi z silnika, więc nie ma
      tu przenoszenia bloków — jest tylko choreografia kadru i powrót.
      Fazy, tak jak w 4A.3, są czystą funkcją postępu: scroll w górę cofa
      je sam z siebie, bez pamiętania stanu. */
  function wireP08(c, view) {
    /* Mostek scrolla rozdziału → obserwatory geometrii (wzorzec P05–P07:
       rozdział przewija własny kontener, a obserwatory słuchają okna). */
    let raf = 0;
    const most = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
      });
    };
    view.addEventListener("scroll", most, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", most);
      if (raf) cancelAnimationFrame(raf);
    });

    const runway = view.querySelector("#ob-runway");
    const kadr = view.querySelector("#ob-stage");
    const stopy = Array.from(view.querySelectorAll(".ob-stop"));

    /* Kolejka ikon: idą PO KOLEI i następna rusza dopiero po dojechaniu
       poprzedniej, więc nie odbierają pasma kotwicy sceny (wzorzec ze
       Spaceru 4B.3). Pierwsza ikona ma `src` już w HTML-u. */
    const kolejka = () => {
      const im = view.querySelector(".ob-stop img[data-src]:not([src])");
      if (!im) return;
      const dalej = () => kolejka();
      im.addEventListener("load", dalej, { once: true });
      im.addEventListener("error", dalej, { once: true });
      im.setAttribute("src", im.dataset.src);
    };
    kolejka();

    /* Ograniczony ruch: kadr od razu odpięty, pętla narysowana w całości,
       wszystkie przystanki widoczne — żadnego przenikania. */
    if (reduceMotion) {
      if (runway) runway.classList.add("ob--wolny");
      stopy.forEach((s) => s.classList.add("is-widoczny"));
      view.querySelectorAll(".ob-stop img[data-src]").forEach((im) => {
        if (!im.getAttribute("src")) im.setAttribute("src", im.dataset.src);
      });
    } else if (runway && kadr) {
      const przytnij = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
      /* Przystanek n odsłania się na tym progu postępu. Ostatni ma zapas
         do końca runwayu, żeby domknięcie pętli i tekst nie deptały mu po
         piętach na krótkich ekranach. */
      const PROGI = [0.32, 0.43, 0.54, 0.64];
      let rafF = 0;
      const fazy = () => {
        rafF = 0;
        const r = runway.getBoundingClientRect();
        if (r.height < 1) return;
        const droga = Math.max(r.height - view.clientHeight, 1);
        const p = przytnij(-r.top / droga);
        /* Zakresy zachodzą na siebie — to jest przenikanie. */
        const t = 1 - przytnij((p - 0.10) / 0.20);   /* tytuł i most      */
        const k = przytnij((p - 0.14) / 0.20);       /* obecność obiegu   */
        const luk = przytnij((p - 0.26) / 0.48);     /* rysowanie pętli   */
        const x = przytnij((p - 0.74) / 0.16);       /* dwa zdania na końcu */
        kadr.style.setProperty("--ob-t", t.toFixed(3));
        kadr.style.setProperty("--ob-k", k.toFixed(3));
        kadr.style.setProperty("--ob-luk", luk.toFixed(3));
        kadr.style.setProperty("--ob-x", x.toFixed(3));
        kadr.classList.toggle("is-obieg", k > 0.5);
        stopy.forEach((s, i) => s.classList.toggle("is-widoczny", p >= PROGI[i]));
      };
      const naScroll = () => { if (!rafF) rafF = requestAnimationFrame(fazy); };
      view.addEventListener("scroll", naScroll, { passive: true });
      window.addEventListener("resize", naScroll);
      chapterCleanup.push(() => {
        view.removeEventListener("scroll", naScroll);
        window.removeEventListener("resize", naScroll);
        if (rafF) cancelAnimationFrame(rafF);
      });
      fazy();
    }

    /* ── GRA „DRUGIE ŻYCIE MATERIAŁÓW" (K16, etap 5B) ──
       Blok przyjeżdża z dokumentu lekcji razem z ramką, statusem, notą
       awaryjną i nagraniem sceny. Tu: leniwe ładowanie, wyciszenie
       narracji, zaliczenie i litera K oraz sprzątanie przy wyjściu. */
    const slotK16 = view.querySelector("#bd-slot-k16");
    if (slotK16) moveBlockInto("k16", slotK16);

    /* PANEL POSTĘPU — bez tego litera K nie ma gdzie zostać wpisana.
       Ten sam mechanizm co w scenie gry Tropu 4: to TEN SAM węzeł DOM,
       wpisany do `moved`, więc przy zamknięciu rozdziału wraca na swoje
       miejsce w dokumencie (zero duplikatów, zero drugiego systemu). */
    {
      const slotP = view.querySelector("#bd-slot-progress-k16");
      const prog = document.getElementById("progress-panel");
      if (slotP && prog && !moved.some((m) => m.node === prog)) {
        const kotwica = document.createComment("bd-anchor-progress");
        prog.parentNode.insertBefore(kotwica, prog);
        slotP.appendChild(prog);
        moved.push({ node: prog, anchor: kotwica });
      }
      explainProgress(view);
    }
    const blokK16 = view.querySelector("#k16");

    /* KOREKTA 5B.1 — nagłówek sceny. W trybie tablicy żaden tekst
       „Klocek N" nie może być widoczny, a nazwa modułu mówi o odpadach,
       nie o materiałach. Obie zmiany odwracalne (`titleFixes`), więc
       `?legacy=1` zachowuje dotychczasowe brzmienie. */
    if (blokK16) {
      const kickerK16 = blokK16.querySelector(":scope > .kicker");
      if (kickerK16 && /klocek/i.test(kickerK16.textContent)) {
        titleFixes.push({ el: kickerK16, html: kickerK16.innerHTML });
        kickerK16.textContent = "";
        kickerK16.hidden = true;
        chapterCleanup.push(() => { kickerK16.hidden = false; });
      }
      const tytulK16 = blokK16.querySelector(":scope > .lead");
      if (tytulK16) {
        titleFixes.push({ el: tytulK16, html: tytulK16.innerHTML });
        tytulK16.textContent = "Drugie życie odpadów";
      }
    }

    const wrapK16 = blokK16 && blokK16.querySelector('[data-frame="k16"]');
    const ramka = wrapK16 && wrapK16.querySelector("iframe");
    const statusK16 = blokK16 && blokK16.querySelector(".frame__status");
    const poGrze = view.querySelector("#k16-po");
    const panel = view.querySelector("#bd-scene-p08-koniec");
    const zdanieEl = view.querySelector("#bd-p08-haslo");

    /* Panel wita ucznia inaczej przed wpisaniem litery i po nim. Stan
       czytamy z lesson-state, więc nie budujemy drugiego rejestru. */
    const zdanieOHasle = () => {
      if (!zdanieEl) return;
      const S = NS.state;
      const jest = !!(S && S.get && S.get().checkpointLetters.K);
      zdanieEl.textContent = jest
        ? "Hasło z pięciu liter jest kompletne."
        : "Zostało wpisać ostatnią literę — a hasło z pięciu liter będzie kompletne.";
    };
    zdanieOHasle();

    if (ramka) {
      const ustawStatus = (t) => { if (statusK16) statusK16.textContent = t; };

      /* Leniwe ładowanie przy zbliżeniu. Obserwator NIE jest jednorazowy:
         przy wyjściu z tropu zdejmujemy `src`, więc po powrocie ramka musi
         doczytać się od nowa (usterka z etapu 4C). */
      const zaladuj = () => {
        if (!ramka.dataset.src || ramka.getAttribute("src")) return;
        if (wrapK16) { wrapK16.classList.remove("is-ready"); wrapK16.classList.add("is-loading"); }
        ustawStatus("Wczytywanie modułu…");
        /* Tryb osadzenia (wzorzec K07): parametr doklejamy TYLKO tutaj,
           więc `?legacy=1` ładuje moduł bez niego i zostaje bez zmian
           wizualnych. W rozdziale znika notka prototypowa — po integracji
           mówiłaby uczniowi nieprawdę — i zdublowany nagłówek. */
        const bazowy = ramka.dataset.src;
        ramka.setAttribute("src",
          bazowy + (bazowy.indexOf("?") >= 0 ? "&" : "?") + "embed=board");
      };
      if (NS.util && NS.util.watch) {
        NS.util.watch(wrapK16, { margin: 600, onEnter: zaladuj });
        /* aktywna gra ucisza narrację sceny; wyjście z kadru zdejmuje
           blokadę (Etap A2 — spójnie z ramkami w modules.js) */
        NS.util.watch(wrapK16, { ratio: 0.45, dwell: 600,
          onEnter: () => NS.audio && NS.audio.suspend("Narracja wstrzymana — pracuje moduł gry.", wrapK16),
          onLeave: () => NS.audio && NS.audio.resumeAllowed() });
      }

      /* ── ZALICZENIE ──
         K16 emituje `k16:completed` na WŁASNYM dokumencie i BEZ `bubbles`,
         więc nasłuch na `contentWindow` (wzorzec K08) by go nie zobaczył —
         musi siedzieć na `contentDocument`. Ramka jest same-origin, więc
         sygnał przechodzi bez zmian w grze. Drugi nasłuch na oknie jest
         tanim zabezpieczeniem, gdyby prototyp kiedyś zaczął bąbelkować. */
      const naWygrana = () => {
        const S = NS.state;
        if (!S) return;
        const noweZaliczenie = S.completeInteraction("k16");
        /* idempotentne — przy KAŻDEJ wygranej, tak jak litera Z po naprawie
           N1 i litera O w etapie 4C */
        if (S.unlockLetterEntry) S.unlockLetterEntry("K");
        ustawStatus("Moduł ukończony. Litera K jest gotowa do wpisania w polu postępu śledztwa.");
        if (poGrze) poGrze.hidden = false;
        zdanieOHasle();
        if (!noweZaliczenie) return;         /* ogłoszenie i przewinięcie raz */
        announce("Drugie życie odpadów: ukończone. Pole litery K czeka na wpisanie.");
        NS.ui && NS.ui.flashProgress && NS.ui.flashProgress();
        if (panel) requestAnimationFrame(() => panel.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
      };

      const wepnij = () => {
        try {
          const okno = ramka.contentWindow, dok = ramka.contentDocument;
          if (!okno || !dok || okno.__bdK16Bound) return;
          okno.__bdK16Bound = true;
          dok.addEventListener("k16:completed", naWygrana);
          okno.addEventListener("k16:completed", naWygrana);
          chapterCleanup.push(() => {
            try {
              dok.removeEventListener("k16:completed", naWygrana);
              okno.removeEventListener("k16:completed", naWygrana);
            } catch (e) { /* okno zwolnione */ }
          });
        } catch (e) { /* cisza */ }
      };
      /* WYSOKOŚĆ RAMKI (usterka znaleziona w QA 5C).
         `fitHeight` z modules.js wychodzi w trybie tablicy od razu — miała
         ją prowadzić strona rozdziału, ale dla K16 nikt jej nie prowadził.
         Skutek: ramka stała na stałych 760 px i przy telefonie w poziomie
         dokument modułu miał 910 px, czyli 150 px WEWNĘTRZNEGO scrolla —
         dokładnie ten drugi pasek przewijania, którego wzorzec ramek unika.
         Mierzymy tak samo jak modules.js: start od kadru rozdziału, potem
         dwie iteracje, bo układ modułu zależy od wysokości okna. */
      /* Awaria ładowania nie może zablokować tropu: uczeń dostaje jasną
         informację, że po przejściu modułu w osobnej karcie literę K
         wpisuje sam. Nota z odnośnikiem stoi pod ramką w dokumencie.
         Deklaracja PRZED `poZaladowaniu`, bo ono wywołuje ją przy pustej
         ramce — również w wywołaniu natychmiastowym, gdy `src` już stoi. */
      const naBlad = () => {
        /* `is-ready` zdejmujemy również: nasłuch z modules.js dodaje ją przy
           każdym `load`, także dla pustego dokumentu, więc bez tego ramka
           miała naraz klasy „gotowa" i „błąd". */
        if (wrapK16) {
          wrapK16.classList.remove("is-loading", "is-ready");
          wrapK16.classList.add("is-error");
        }
        ustawStatus("Nie udało się wczytać modułu. Otwórz go w nowej karcie — "
          + "po ukończeniu wróć tutaj i wpisz literę K samodzielnie.");
      };

      const H_MIN = 520, H_MAX = 2000;
      const dopasujWysokosc = () => {
        try {
          const dok = ramka.contentDocument;
          if (!dok || !dok.documentElement || !ramka.getAttribute("src")) return;
          let h = Math.min(Math.max(Math.round(view.clientHeight * 0.86), H_MIN), 900);
          ramka.style.height = h + "px";
          for (let i = 0; i < 2; i++) {
            const sh = Math.max(dok.documentElement.scrollHeight,
              dok.body ? dok.body.scrollHeight : 0);
            if (sh <= h + 4) break;
            h = Math.min(sh, H_MAX);
            ramka.style.height = h + "px";
          }
        } catch (e) { /* cross-origin nie wystąpi, ale nie ryzykujemy */ }
      };
      if ("ResizeObserver" in window) {
        const ro = new ResizeObserver(dopasujWysokosc);
        ro.observe(view);
        chapterCleanup.push(() => ro.disconnect());
      }

      const poZaladowaniu = () => {
        /* USTERKA Z QA 5C: gdy moduł nie dojedzie (blokada sieci, filtr,
           awaria serwera), przeglądarka i tak zgłasza `load` — dla pustego
           dokumentu. Ramka dostawała wtedy klasę `is-ready` i status
           „Moduł gotowy.", czyli uczeń widział uspokajający komunikat nad
           pustym miejscem. Sprawdzamy więc, czy moduł NAPRAWDĘ jest
           w środku; jeśli nie — ścieżka awaryjna z odnośnikiem. */
        let modulJest = false;
        try {
          const d = ramka.contentDocument;
          modulJest = !!(d && d.getElementById("k16-round"));
        } catch (e) { modulJest = false; }
        if (!modulJest) { naBlad(); return; }

        if (wrapK16) { wrapK16.classList.remove("is-loading"); wrapK16.classList.add("is-ready"); }
        wepnij();
        dopasujWysokosc();
        setTimeout(dopasujWysokosc, 600);   /* po dociągnięciu grafik modułu */
        const S = NS.state;
        if (S && S.isCompleted && S.isCompleted("k16")) {
          ustawStatus("Moduł ukończony. Litera K jest gotowa do wpisania w polu postępu śledztwa.");
        } else ustawStatus("Moduł gotowy.");
      };
      ramka.addEventListener("load", poZaladowaniu);
      chapterCleanup.push(() => ramka.removeEventListener("load", poZaladowaniu));
      if (ramka.contentDocument && ramka.getAttribute("src")) poZaladowaniu();

      ramka.addEventListener("error", naBlad);
      chapterCleanup.push(() => ramka.removeEventListener("error", naBlad));

      /* Wyjście z tropu = pełny stop modułu (wzorzec N2.1): zdejmujemy
         `src`, więc gra przestaje istnieć razem z dźwiękiem i żądaniami.
         `data-src` zostaje, a nietrwały obserwator wczyta ją po powrocie. */
      chapterCleanup.push(() => {
        try { ramka.removeAttribute("src"); } catch (e) { /* ignore */ }
        if (wrapK16) wrapK16.classList.remove("is-ready", "is-loading", "is-error");
      });
    }

    /* Powrót ucznia z zaliczonym modułem: status i zdanie o haśle mają
       od razu mówić prawdę, a pole litery K być otwarte (N1). */
    {
      const S = NS.state;
      if (S && S.get) {
        if (S.get().completedInteractions.indexOf("k16") >= 0) {
          if (S.unlockLetterEntry) S.unlockLetterEntry("K");
          if (poGrze) poGrze.hidden = false;
        }
        if (S.onChange) {
          const off = S.onChange(() => zdanieOHasle());
          chapterCleanup.push(off);
        }
      }
    }

    /* Etap 6A: P09 jest już zintegrowane, więc koniec Tropu 8 wraca na
       wzorzec tropów 1–7 — ukończenie, odblokowanie i podróż kamery. */
    const wroc = view.querySelector("#bd-p08-wroc");
    if (wroc) wroc.addEventListener("click", () => {
      wroc.disabled = true;
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });
  }

  /** Okablowanie P09 (Etap 6A). Żadna logika lekcji nie jest tu dublowana:
      terminal, dyplom i komplet dowodów obsługuje skrypt lekcji na TYCH
      SAMYCH węzłach, które tu przyjeżdżają. Rozdział dokłada choreografię
      scen, atrapę nagrania, werdykt i domknięcie sprawy. */
  function wireP09(c, view) {
    /* mostek scrolla rozdziału → obserwatory geometrii (wzorzec P05–P08) */
    let raf = 0;
    const most = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
      });
    };
    view.addEventListener("scroll", most, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", most);
      if (raf) cancelAnimationFrame(raf);
    });

    const slot17 = view.querySelector("#bd-slot-k17");
    if (slot17) moveBlockInto("k17", slot17);
    const slot18 = view.querySelector("#bd-slot-k18");
    if (slot18) moveBlockInto("k18", slot18);

    /* Nadtytuły „Klocek N" znikają w tablicy — mechanizm z korekty 5B.1,
       odwracalny, więc `?legacy=1` zachowuje dotychczasowe brzmienie. */
    ["k17", "k18"].forEach((id) => {
      const blok = view.querySelector("#" + id);
      const kicker = blok && blok.querySelector(".kicker");
      if (kicker && /klocek/i.test(kicker.textContent)) {
        titleFixes.push({ el: kicker, html: kicker.innerHTML });
        kicker.textContent = "";
        kicker.hidden = true;
        chapterCleanup.push(() => { kicker.hidden = false; });
      }
    });

    const scenaFilm = view.querySelector("#bd-scene-film");
    const scenaWerdykt = view.querySelector("#bd-scene-werdykt");
    const scenaDyplom = view.querySelector("#bd-scene-dyplom");
    const koniec = view.querySelector("#bd-scene-p09-koniec");

    const odslon = (sekcja) => {
      if (!sekcja || !sekcja.hidden) return false;
      sekcja.hidden = false;
      requestAnimationFrame(() => nudgeWatchers());
      return true;
    };
    const domknijSprawe = () => {
      const S = NS.state;
      if (!S || !S.closeCase) return;
      if (S.closeCase()) announce("Sprawa zamknięta. Na tablicy czeka stempel.");
    };

    /* ── KADR NAGRANIA ──
       Węzeł #k17-film-wrap wjeżdża do sceny 2 wzorcem `moved`, więc wraca
       na miejsce przy zamknięciu rozdziału, a referencja `term.film`
       w skrypcie lekcji zostaje ważna: przycisk terminala nadal go odsłania. */
    const filmWrap = document.getElementById("k17-film-wrap");
    const slotFilm = view.querySelector("#bd-slot-film");
    if (filmWrap && slotFilm && filmWrap.parentNode !== slotFilm) {
      const kotwica = document.createComment("bd-anchor-film");
      filmWrap.parentNode.insertBefore(kotwica, filmWrap);
      moved.push({ node: filmWrap, anchor: kotwica });
      slotFilm.appendChild(filmWrap);
    }

    /* ── ATRAPA NAGRANIA (do wymiany w 6B) ──
       Architektura pod plik jest gotowa: kadr o proporcji 16:9, plansza
       zastępcza w tonacji sceny i przycisk, który ustawia ZNACZNIK
       OBEJRZENIA. W 6B ten sam znacznik ustawi koniec odtwarzania,
       a plansza ustąpi elementowi wideo z posterem. */
    let filmObejrzany = false;
    if (filmWrap && !filmWrap.dataset.bdAtrapa) {
      filmWrap.dataset.bdAtrapa = "1";
      const plansza = h("div", "bd-atrapa");
      plansza.innerHTML =
        '<p class="bd-atrapa__tytul">Nagranie w przygotowaniu</p>'
        + '<p class="bd-atrapa__opis">Film z rozwiązaniem sprawy pojawi się tutaj. '
        + 'Na razie możesz przejść dalej — reszta śledztwa czeka.</p>';
      const dalej = h("button", "bd-btn bd-atrapa__cta");
      dalej.type = "button";
      dalej.id = "bd-film-dalej";
      dalej.textContent = "Przejdź do werdyktu →";
      plansza.appendChild(dalej);
      filmWrap.appendChild(plansza);
      chapterCleanup.push(() => {
        plansza.remove();
        delete filmWrap.dataset.bdAtrapa;
      });
      dalej.addEventListener("click", () => {
        filmObejrzany = true;
        domknijSprawe();
        odslon(scenaWerdykt);
        odslon(scenaDyplom);
        if (scenaWerdykt) requestAnimationFrame(() => scenaWerdykt.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
      });
    }

    /* Scena nagrania odsłania się dokładnie wtedy, gdy skrypt lekcji zdejmie
       `hidden` z kadru — czyli po kliknięciu przycisku w terminalu.
       Obserwujemy atrybut zamiast podpinać się pod kliknięcie: nie zależymy
       wtedy od kolejności nasłuchów ani od tego, kto go w przyszłości odsłoni. */
    if (filmWrap && "MutationObserver" in window) {
      const mo = new MutationObserver(() => {
        if (filmWrap.hidden) return;
        if (odslon(scenaFilm) && scenaFilm) {
          requestAnimationFrame(() => scenaFilm.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
        }
      });
      mo.observe(filmWrap, { attributes: true, attributeFilter: ["hidden"] });
      chapterCleanup.push(() => mo.disconnect());
      if (!filmWrap.hidden) odslon(scenaFilm);
    }

    /* ── WERDYKT: hasło zapala się literą po literze przy scrollu ── */
    const werdykt = view.querySelector("#bd-werdykt");
    const znaki = Array.from(view.querySelectorAll(".bd-werdykt__litera"));
    if (werdykt && znaki.length) {
      if (reduceMotion) {
        znaki.forEach((el) => el.classList.add("is-on"));
      } else {
        let rafW = 0;
        const zapalaj = () => {
          rafW = 0;
          if (scenaWerdykt && scenaWerdykt.hidden) return;
          const r = werdykt.getBoundingClientRect();
          const wys = view.clientHeight || window.innerHeight;
          /* postęp liczony od chwili, gdy hasło wjeżdża w dolne 85% kadru,
             do chwili, gdy dojedzie do jego środka */
          const p = (wys * 0.85 - r.top) / (wys * 0.35);
          const ile = Math.max(0, Math.min(znaki.length, Math.floor(p * znaki.length)));
          znaki.forEach((el, i) => el.classList.toggle("is-on", i < ile));
        };
        const naScroll = () => { if (!rafW) rafW = requestAnimationFrame(zapalaj); };
        view.addEventListener("scroll", naScroll, { passive: true });
        window.addEventListener("resize", naScroll);
        chapterCleanup.push(() => {
          view.removeEventListener("scroll", naScroll);
          window.removeEventListener("resize", naScroll);
          if (rafW) cancelAnimationFrame(rafW);
          znaki.forEach((el) => el.classList.remove("is-on"));
        });
        zapalaj();
      }
    }

    /* ── DYPLOM: gotowa karta odsłania domknięcie tropu ── */
    const karta = document.getElementById("k18-card");
    if (karta && "MutationObserver" in window) {
      const mo2 = new MutationObserver(() => {
        if (karta.hidden) return;
        odslon(koniec);
      });
      mo2.observe(karta, { attributes: true, attributeFilter: ["hidden"] });
      chapterCleanup.push(() => mo2.disconnect());
      if (!karta.hidden) odslon(koniec);
    }

    /* Uczeń, który wraca do finału z domkniętą sprawą, dostaje wszystkie
       sceny od razu — nie każemy mu przechodzić atrapy drugi raz. */
    {
      const S = NS.state;
      const s = S && S.get ? S.get() : null;
      if (s && s.caseClosed) {
        filmObejrzany = true;
        odslon(scenaFilm); odslon(scenaWerdykt); odslon(scenaDyplom); odslon(koniec);
      }
    }
    if (reduceMotion) { odslon(scenaWerdykt); odslon(scenaDyplom); }

    /* ── DOMKNIĘCIE: to OSTATNI trop, więc żadnej podróży dalej ──
       `finishChapter` oznacza trop jako ukończony i wraca na tablicę;
       `autoNext` nie ma dla P09 wpisu, więc nic się nie odblokowuje. */
    const wroc = view.querySelector("#bd-p09-wroc");
    if (wroc) wroc.addEventListener("click", () => {
      wroc.disabled = true;
      if (filmObejrzany) domknijSprawe();
      finishChapter(c);
    });
  }

  function spacerBoard(view) {
    const sekcja = view.querySelector("#rail-pszok");
    if (!sekcja || sekcja.dataset.bdUklad === "1") return;
    sekcja.dataset.bdUklad = "1";
    sekcja.classList.add("bd-pj");

    const stacje = Array.from(sekcja.querySelectorAll(".pj-station"));
    if (!stacje.length) return;
    const N = stacje.length;

    /* Obrazy stacji czekają w `data-src` (leniwe ładowanie sceny lekcji).
       Podstawiamy je z wyprzedzeniem: bieżąca stacja i sąsiedztwo. */
    const podstaw = (i) => {
      const s = stacje[i];
      if (!s) return;
      s.querySelectorAll("img[data-src]").forEach((im) => {
        if (!im.getAttribute("src")) im.setAttribute("src", im.dataset.src);
      });
    };

    /* Kolejka tła: stara scena miała „primer", który zaczynał pobierać
       materiał, gdy sekcja była jeszcze 60% ekranu niżej. Bez tego na
       zimnym łączu 3G pierwsze stacje nie zdążyły (zmierzone: braki na
       stacjach 1–9). Kolejka rusza od razu po odsłonięciu spaceru, idzie
       PO KOLEI i podaje następny plik dopiero po dojechaniu poprzedniego,
       więc nie odbiera pasma stacji, na którą uczeń właśnie patrzy.
       Kolejka idzie po OBRAZACH, nie po stacjach: każda stacja ma dwa
       (kontener i odpady), a pominięcie drugiego zostawiało pół kadru
       pustego. */
    const kolejkaTla = () => {
      const im = Array.from(sekcja.querySelectorAll(".pj-station img[data-src]"))
        .find((e) => !e.getAttribute("src"));
      if (!im) return;
      const dalej = () => kolejkaTla();
      im.addEventListener("load", dalej, { once: true });
      im.addEventListener("error", dalej, { once: true });
      im.setAttribute("src", im.dataset.src);
    };

    /* reduced motion: żadnego mapowania — statyczna lista wszystkich stacji */
    if (reduceMotion) {
      sekcja.classList.add("bd-pj--statyczny");
      stacje.forEach((s, i) => { podstaw(i); s.classList.add("is-widoczna"); });
      return;
    }

    let rafP = 0, ostatnia = -1;
    const fazy = () => {
      rafP = 0;
      const r = sekcja.getBoundingClientRect();
      if (r.height < 1) return;
      const droga = Math.max(r.height - view.clientHeight, 1);
      const p = Math.max(0, Math.min(0.9999, -r.top / droga));
      const i = Math.min(N - 1, Math.floor(p * N));
      const q = p * N - i;                       /* postęp WEWNĄTRZ stacji */

      if (i !== ostatnia) {
        ostatnia = i;
        /* wyprzedzenie: poprzednia, bieżąca i dwie następne */
        for (let k = i - 1; k <= i + 2; k++) podstaw(k);
        stacje.forEach((s, n) => s.classList.toggle("is-aktywna", n === i));
        sekcja.style.setProperty("--pj-nr", String(i + 1));
      }
      /* Fazy w obrębie stacji — progi z preflightu:
         0–0,30 kontener, 0,30–0,55 odpady, 0,55–0,80 tekst, 0,80–1 zanik. */
      const s = stacje[i];
      s.classList.toggle("is-kontener", q >= 0.04);
      s.classList.toggle("is-odpady", q >= 0.30);
      s.classList.toggle("is-tekst", q >= 0.55);
      const zanik = q >= 0.80 ? (q - 0.80) / 0.20 : 0;
      sekcja.style.setProperty("--pj-zanik", (1 - zanik).toFixed(3));
    };
    const onScroll = () => { if (!rafP) rafP = requestAnimationFrame(fazy); };
    view.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafP) cancelAnimationFrame(rafP);
      sekcja.classList.remove("bd-pj", "bd-pj--statyczny");
      delete sekcja.dataset.bdUklad;
      stacje.forEach((s) => s.classList.remove(
        "is-aktywna", "is-kontener", "is-odpady", "is-tekst", "is-widoczna"));
    });
    podstaw(0); podstaw(1);
    kolejkaTla();
    fazy();
  }

  /** Okablowanie K10 (Etap 2E): przeniesienie bloku #k10-seq i mostek
      scrolla. Logika sekwencji mieszka w modules.js (`frameSequence`) —
      wspólna z ?legacy=1; silnik nasłuchuje scrolla OKNA, a rozdział
      przewija własny kontener, więc zdarzenie przekazujemy dalej przez
      rAF (to samo, co robi punktowo `nudgeWatchers`, tylko na żywo).
      Jeden blok, jeden silnik — zero duplikacji treści. */
  function wireK10(view) {
    const slot = view.querySelector("#bd-slot-k10");
    if (!slot) return;
    moveBlockInto("k10-seq", slot);
    const blok = view.querySelector("#k10-seq");
    if (!blok) return;

    /* nadtytuł bez numeracji klocka (wzorzec tropów), odwracalnie */
    const kicker = blok.querySelector(".kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      kicker.textContent = "Dalsza droga oleju";
    }

    let raf = 0;
    const most = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
      });
    };
    view.addEventListener("scroll", most, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", most);
      if (raf) cancelAnimationFrame(raf);
    });

    /* 2E.1/1: rozgrzanie pierwszych klatek. Preload silnika rusza dopiero
       marginesem nasłuchu (800 px przed sceną) — na zimnej sieci pierwszy
       kadr potrafił nie zdążyć i uczeń widział pusty prostokąt. Ciepły
       cache HTTP sprawia, że próbka silnika rozstrzyga natychmiast. */
    /* Etap 2E.2 — PIERWSZY KADR OD RAZU (wzorzec K11 z 3C.1 i K12 z 3C.3.3).
       K10 była ostatnią sceną sekwencyjną, która go nie miała: rozgrzewka
       wypełniała wyłącznie cache HTTP, a `<img>` dostawał `src` dopiero
       z leniwego preloadu silnika. Na zimnym łączu 3G kadr nie miał pikseli
       jeszcze w czwartej sekundzie po wejściu w trop (pomiar 20/20). */
    const kadr = blok && blok.querySelector(".seq__frame");
    if (kadr && !kadr.getAttribute("src")) {
      kadr.setAttribute("src", "../assets/images/lekcja45/proces-seq-v2/proces-000.webp");
      if (kadr.complete && kadr.naturalWidth) blok.classList.add("is-ready");
      else kadr.addEventListener("load", () => blok.classList.add("is-ready"), { once: true });
    }
    /* Rozgrzewka musi wskazywać TĘ SAMĄ serię co silnik — po podmianie na
       `proces-seq-v2` pobierała klatki starej animacji, czyli grzała cache
       plikami, których scena już nie używa. */
    for (let i = 1; i < 4; i++) {
      const im = new Image();
      im.src = "../assets/images/lekcja45/proces-seq-v2/proces-" +
        String(i).padStart(3, "0") + ".webp";
    }
  }

  /** Okablowanie K09 w rozdziale: przeniesienie bloku i nasłuch ukończenia.
      Logika gry mieszka w `modules.js` (wspólna dla tablicy i ?legacy=1) —
      silnik rozdziału tylko przenosi blok, skraca nadtytuł i reaguje na
      zakończenie odsłonięciem finału tropu. */
  function wireK09(view, pokazKoniec) {
    const slot = view.querySelector("#bd-slot-k09");
    if (!slot) return;
    moveBlockInto("k09", slot);
    const blok = view.querySelector("#k09");
    if (!blok) return;

    const kicker = blok.querySelector(":scope > .kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      const ogon = kicker.textContent.split("•").pop().trim();
      kicker.textContent = ogon ? ogon.charAt(0).toUpperCase() + ogon.slice(1) : "Stacja kontroli";
    }

    /* Zdarzenie z modułu jest sygnałem prezentacyjnym; źródłem prawdy o
       ukończeniu pozostaje lesson-state (completeInteraction w module). */
    const naKoniec = () => {
      announce("Stacja kontroli ukończona. Zobacz, co dzieje się z olejem dalej.");
      /* Etap 2E: przewijamy do K10 (dalsza droga oleju); panel domknięcia
         odsłania się razem z nią, ale bez drugiego skoku przewijania. */
      odslonaK10(view, false);
      pokazKoniec(true);
    };
    blok.addEventListener("k09:completed", naKoniec);
    chapterCleanup.push(() => blok.removeEventListener("k09:completed", naKoniec));

    /* K3.3.2 — grafiki celów klikalne obok przycisków. To WYŁĄCZNIE delegacja:
       klik w strefę wywołuje istniejący przycisk [data-k09], więc decyzję
       podejmuje ten sam kontroler i nie powstaje drugi nasłuch decyzji.
       Fokus i ścieżka klawiatury zostają na przyciskach. Przeciągnięcie
       produktu nie może wyzwalać decyzji: `pointerdown` na obszarze produktu
       ustawia znacznik, a klik strefy tuż po nim jest ignorowany. */
    let poDragu = 0;
    const area = blok.querySelector(".k09__stagearea");
    if (area) {
      const znacznik = () => { poDragu = Date.now(); };
      area.addEventListener("pointerdown", znacznik, true);
      chapterCleanup.push(() => area.removeEventListener("pointerdown", znacznik, true));
    }
    [["--bottle", "bottle"], ["--reject", "reject"]].forEach(([sel, cel]) => {
      const strefa = blok.querySelector(".k09__zone" + sel);
      const btn = blok.querySelector('[data-k09="' + cel + '"]');
      if (!strefa || !btn) return;
      const naKlik = (e) => {
        if (e.target.closest("[data-k09]")) return;      /* klik w sam przycisk */
        if (Date.now() - poDragu < 400) return;          /* koniec przeciągania */
        btn.click();
      };
      strefa.addEventListener("click", naKlik);
      chapterCleanup.push(() => strefa.removeEventListener("click", naKlik));
    });
  }

  /* Wprowadzenie do Olejomatu (Faza A). Nagranie DOTARŁO w etapie A2
     (`05-sprawa-oleju/05-co-to-olejomat-01.mp3`), ale gra jako NARRACJA
     SCENY — deklaracja siedzi przy tekście „Co to jest Olejomat?", więc
     rusza w trybach dźwiękowych i ma pauzę w panelu audio. Ten ręczny
     przycisk zostaje wyłączony (`null`): jedno nagranie i dwa niezależne
     odtwarzacze na jednym ekranie potrafiłyby zagrać naraz. Decyzja
     użytkownika D1, etap A2. */
  const P05_INTRO_MP3 = null;

  /** FAZA A rozdziału P05 (Etap 2B.1): przypięte wprowadzenie do Olejomatu.
      Model ruchu przeniesiony ze starej animacji [ANIM: BUTELKA-WLOT]
      (lekcja-4-5.js): pojedyncza grafika butelki leci z prawego górnego
      obszaru poza kadrem do wlotu maszyny, malejąc (1→~0.14) i prostując
      rotację (26°→−8°), po czym znika w otworze. Sterowanie WYŁĄCZNIE
      pozycją scrolla rozdziału (bez wheel/touchmove), w pełni odwracalne;
      po wpadnięciu — plateau, na końcu wygaszenie sceny (crossfade do K07).
      Histereza nie jest potrzebna: przebieg jest ciągłą funkcją postępu,
      bez przełączania DOM. */
  function wireOlejomatIntro(view) {
    const runway = view.querySelector("#bd-p05-runway");
    const stage = view.querySelector("#bd-p05-stage");
    const wiz = view.querySelector("#bd-p05-wiz");
    const grid = view.querySelector(".bd-olejomat__grid");
    const maszyna = view.querySelector("#bd-p05-olejomat");
    const butelka = view.querySelector("#bd-p05-butelka");
    const hint = view.querySelector("#bd-p05-hint");
    if (!runway || !stage || !wiz || !maszyna || !butelka) return;

    /* Nagranie wprowadzenia: kontrolka istnieje tylko, gdy plik jest
       zadeklarowany (rozstrzygnięcie 3 — bez atrap i bez 404). */
    let introAudio = null;
    const audioSlot = view.querySelector("#bd-p05-intro-audio");
    if (P05_INTRO_MP3 && audioSlot) {
      audioSlot.hidden = false;
      audioSlot.innerHTML = '<button type="button" class="bd-btn bd-btn--sm" ' +
        'id="bd-p05-intro-play" aria-pressed="false" ' +
        'aria-label="Odtwórz nagranie wprowadzenia do Olejomatu">' +
        '▶ Odtwórz wprowadzenie</button>';
      const btn = audioSlot.querySelector("#bd-p05-intro-play");
      const ui = (gra) => {
        btn.setAttribute("aria-pressed", gra ? "true" : "false");
        btn.textContent = gra ? "⏸ Zatrzymaj wprowadzenie" : "▶ Odtwórz wprowadzenie";
      };
      btn.addEventListener("click", () => {
        if (!introAudio) {
          introAudio = new Audio(P05_INTRO_MP3);
          introAudio.addEventListener("ended", () => ui(false));
          introAudio.addEventListener("error", () => {
            btn.disabled = true; ui(false);
            btn.textContent = "Wprowadzenie chwilowo niedostępne";
          }, { once: true });
        }
        if (introAudio.paused) {
          /* Etap T5.1: prototyp K07 nie ma już własnego odtwarzacza, więc
             nie ma czego wyłączać — wyłączność zapewnia jeden kanał audio. */
          try { introAudio.currentTime = 0; } catch (e) { /* przed metadanymi */ }
          const p = introAudio.play();
          if (p && p.then) p.then(() => ui(true)).catch(() => ui(false)); else ui(true);
        } else {
          introAudio.pause(); ui(false);
        }
      });
      /* tryb „Czytam" zatrzymuje; żaden tryb nie uruchamia */
      if (NS.state && NS.state.onChange) {
        const naTryb = () => {
          if (introAudio && !introAudio.paused && NS.audio && !NS.audio.autoOn()) {
            introAudio.pause(); ui(false);
          }
        };
        NS.state.onChange(naTryb);
      }
      chapterCleanup.push(() => { if (introAudio) { introAudio.pause(); introAudio = null; } });
    }
    const stopIntroAudio = () => {
      if (introAudio && !introAudio.paused) {
        introAudio.pause();
        const btn = view.querySelector("#bd-p05-intro-play");
        if (btn) { btn.setAttribute("aria-pressed", "false"); btn.textContent = "▶ Odtwórz wprowadzenie"; }
      }
    };

    /* ── PRAWDZIWY CROSSFADE FAZA A → K07 (Etap 2B.2) ──
       Sekcja K07 jest podciągnięta pod kadr ujemnym marginesem o wysokość
       kadru (zmienna --bd-p05-nakladka) i przez cały pin trzymana
       transformem STOP-KLATKI dokładnie pod paskiem — transform to licznik
       przesunięcia przepływu, więc zeruje się matematycznie w punkcie
       zwolnienia pinu (handoff bez skoku z konstrukcji). Do progu PC sekcja
       ma opacity 0 i jest inert; w strefie [PC, 1] obie warstwy krzyżują
       opacity nad tym samym arkuszem (arkusz jest półprzezroczysty, więc
       nieprzezroczysta „kurtyna" dawałaby jaśniejszy prostokąt — dlatego
       zamiast kurtyny ukrywamy sekcję). Wszystko jest ciągłą funkcją
       postępu scrolla — pełna odwracalność bez histerezy; histereza
       (0.84/0.88) dotyczy WYŁĄCZNIE przełącznika inert dla klawiatury. */
    const sekcjaK07 = view.querySelector("#bd-scene-k07");
    const PC = 0.86;                     /* start przejścia (ostatnie 14%) */
    let sekcjaAktywna = true;

    /* Reduced motion: bez crossfade'u i bez pinu — obie fazy czytelnie
       w zwykłym przepływie (runway zwinięty przez klasę static). */
    if (reduceMotion) {
      view.classList.add("bd-p05-intro-static");
      view.style.setProperty("--bd-p05-nakladka", "0px");
      butelka.hidden = true;
      if (hint) hint.hidden = true;
      return;
    }

    /* Świeże wejście: warstwa K07 niewidoczna i nieosiągalna dla Taba,
       dopóki scroll nie doprowadzi do strefy przejścia. Przy ukończonym
       K07 (D3) rozdział i tak przewija się do panelu końcowego — sekcja
       startuje aktywna, a pierwszy rysunek ustawi właściwe opacity. */
    const odRazuAktywna = !!(NS.state && NS.state.isCompleted && NS.state.isCompleted("k07"));
    /* Etap T5.1 — KONIEC CROSSFADE'U. W trybie slajdów sceny nie mogą na
       siebie nachodzić: K07 jest osobną warstwą, pokazywaną skokowo, a nie
       wyłanianą zza Olejomatu. Zostaje sam lot butelki jako scrub tej sceny;
       krzyżowanie opacity, nakładka i przełącznik `inert` są tu zbędne
       (ich obsługę omija warunek `slajdy` w `maluj`). */
    const slajdy = view.classList.contains("bd-slajdy") ||
                   ["p05"].indexOf((openedChapter || {}).id) >= 0;
    if (sekcjaK07 && !odRazuAktywna && !slajdy) {
      sekcjaK07.style.opacity = "0";
      setSceneActive(sekcjaK07, false);
      sekcjaAktywna = false;
    }

    /* Geometria liczona z układu (offsety w obrębie kolumny wizualnej);
       przeliczana przy zmianie rozmiaru — bez dotykania src czegokolwiek. */
    const geo = { startX: 0, startY: 0, celX: 0, celY: 0, W: 0, H: 0, bar: 64, gotowa: false };
    const przelicz = () => {
      geo.bar = parseFloat(getComputedStyle(view).getPropertyValue("--bd-bar-h")) || 64;
      const W = butelka.offsetWidth, H = butelka.offsetHeight;
      if (!W || !maszyna.offsetWidth) { geo.gotowa = false; return; }
      const stR = stage.getBoundingClientRect();
      const wzR = wiz.getBoundingClientRect();
      /* start: butelka W CAŁOŚCI poza kadrem sceny (prawy górny obszar);
         zapas 0.75 wysokości pokrywa też rozrzut narożników po rotacji */
      geo.startX = (stR.right - wzR.left) + W * 0.60 - W / 2;
      geo.startY = (stR.top - wzR.top) - H * 0.75 - H / 2;
      /* cel: czarna klapka wrzutowa na froncie maszyny (lewa górna część
         obudowy) — tam butelka znika „wewnątrz urządzenia" */
      geo.celX = maszyna.offsetLeft + maszyna.offsetWidth * 0.22 - W / 2;
      geo.celY = maszyna.offsetTop + maszyna.offsetHeight * 0.38 - H / 2;
      geo.W = W; geo.H = H;
      geo.gotowa = true;

      /* mobile: gdyby kompozycja nie mieściła się w kadrze pod paskiem,
         zacieśnij (mniejsza maszyna); w ostateczności zwolnij pin —
         scena statyczna z widocznym stanem końcowym */
      view.classList.remove("bd-p05-intro-ciasno");
      if (grid && grid.scrollHeight > stage.clientHeight + 4) {
        view.classList.add("bd-p05-intro-ciasno");
        view.classList.toggle("bd-p05-intro-static",
          grid.scrollHeight > stage.clientHeight + 40);
      } else {
        view.classList.remove("bd-p05-intro-static");
      }

      /* nakładka crossfade'u: sekcja K07 podchodzi pod kadr dokładnie o jego
         wysokość; w trybie statycznym obie fazy stoją w zwykłym przepływie */
      const statyczna = view.classList.contains("bd-p05-intro-static");
      view.style.setProperty("--bd-p05-nakladka", statyczna ? "0px" : stage.offsetHeight + "px");
      if (statyczna && sekcjaK07) {
        stage.style.opacity = ""; stage.style.pointerEvents = "";
        sekcjaK07.style.opacity = ""; sekcjaK07.style.transform = "";
        if (!sekcjaAktywna) { setSceneActive(sekcjaK07, true); sekcjaAktywna = true; }
      }
    };

    let cel = 0, rysowany = -1, raf = 0;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const maluj = () => {
      raf = 0;
      if (view.classList.contains("bd-p05-intro-static")) return;
      if (!geo.gotowa) przelicz();
      if (!geo.gotowa) return;
      /* wygładzenie jak w P03: pościg za celem, dorysowania do zbieżności */
      rysowany = rysowany < 0 ? cel : rysowany + (cel - rysowany) * 0.22;
      if (Math.abs(cel - rysowany) > 0.0008 && !raf) raf = requestAnimationFrame(maluj);
      const p = Math.min(1, Math.max(0, rysowany));
      view.style.setProperty("--bd-p05-postep", p.toFixed(4));

      /* LOT 0–0.68 → WPADNIĘCIE 0.68–0.74 → PLATEAU 0.74–0.86 →
         CROSSFADE 0.86–1.0 (obie warstwy w tym samym kadrze) */
      const tLot = ease(Math.min(1, p / 0.68));
      const x = geo.startX + (geo.celX - geo.startX) * tLot;
      /* delikatny łuk: uniesienie w połowie drogi */
      const y = geo.startY + (geo.celY - geo.startY) * tLot
        - Math.sin(Math.PI * tLot) * geo.H * 0.10;
      const skala = 1 - 0.86 * tLot;
      const rot = 26 - 34 * tLot;
      const zanik = p < 0.68 ? 1 : Math.max(0, 1 - (p - 0.68) / 0.06);
      butelka.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) +
        "px,0) rotate(" + rot.toFixed(1) + "deg) scale(" + Math.max(0.06, skala).toFixed(3) + ")";
      butelka.style.opacity = zanik.toFixed(3);
      if (hint) hint.style.opacity = p > 0.06 ? "0" : "";
      /* przejście do zadania zatrzymuje nagranie wprowadzenia (pkt 5) */
      if (p > 0.72) stopIntroAudio();

      /* Etap T5.1: w trybie slajdów krzyżowania nie ma — scena Olejomatu
         kończy się na swojej ostatniej klatce, a K07 wskakuje jako osobny
         slajd. Wychodzimy przed całym blokiem crossfade'u. */
      if (view.classList.contains("bd-slajdy")) return;
      const tCross = Math.min(1, Math.max(0, (p - PC) / (1 - PC)));
      stage.style.opacity = (1 - tCross).toFixed(3);
      stage.style.pointerEvents = tCross > 0.97 ? "none" : "";
      if (sekcjaK07) {
        sekcjaK07.style.opacity = tCross.toFixed(3);
        /* STOP-KLATKA: licznik przesunięcia przepływu trzyma nagłówek K07
           dokładnie pod paskiem; zeruje się w punkcie zwolnienia pinu
           (shift = L·(p−1) ≤ 0), więc handoff nie ma żadnego skoku */
        const rR = runway.getBoundingClientRect();
        const naturalny = rR.top + runway.offsetHeight - stage.offsetHeight;
        const shift = Math.min(0, geo.bar - naturalny);
        sekcjaK07.style.transform = shift < 0
          ? "translate3d(0," + shift.toFixed(1) + "px,0)" : "";
        /* inert tylko dla klawiatury/AT — mikro-histereza wokół progu */
        if (!sekcjaAktywna && p >= 0.88) { setSceneActive(sekcjaK07, true); sekcjaAktywna = true; }
        else if (sekcjaAktywna && p <= 0.84 && !odRazuAktywna) {
          setSceneActive(sekcjaK07, false); sekcjaAktywna = false;
        }
      }
    };
    const naScroll = () => {
      /* postęp pinu: ile runwayu przewinęło się nad krawędź przyklejenia
         (pasek); scena sticky stoi, dopóki runway ma jeszcze luz */
      const vR = view.getBoundingClientRect();
      const rR = runway.getBoundingClientRect();
      const luz = rR.height - stage.offsetHeight;
      const bar = parseFloat(getComputedStyle(view).getPropertyValue("--bd-bar-h")) || 64;
      cel = luz > 0 ? Math.min(1, Math.max(0, (bar - (rR.top - vR.top)) / luz)) : 1;
      if (!raf) raf = requestAnimationFrame(maluj);
    };
    view.addEventListener("scroll", naScroll, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", naScroll);
      if (raf) cancelAnimationFrame(raf);
    });
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => { geo.gotowa = false; naScroll(); });
      ro.observe(stage);
      chapterCleanup.push(() => ro.disconnect());
    }
    /* stan początkowy (także po powrocie D3 z przewinięciem do finału) */
    requestAnimationFrame(() => { przelicz(); naScroll(); maluj(); });
  }

  /** Diagram EMKA — dwa układy nad wspólnym mapowaniem `d.cards`.

      DESKTOP (kontener > d.progKompakt): zatwierdzony układ promienisty —
      obraz z liniami prowadzącymi i siedem kart wokół, w stanie początkowym
      zakrytych, odwracanych kliknięciem/Enterem/spacją.

      KOMPAKT (kontener ≤ próg): baza bez linii + siedem wycinków 1:1 na
      wspólnym płótnie; kliknięcie wycinka otwiera jedną kartę w panelu pod
      diagramem. Obrazy kompaktu ładują się DOPIERO gdy ten układ jest
      aktywny (data-src → src w wireDiagram), więc desktop ich nie pobiera. */
  /** Jeden wrapper treści diagramu (nagłówek + licznik bramki + oba układy +
      źródło), przenoszony w całości między sekcją przepływu a fazą przypiętą.
      Obrazy OBU układów są za data-src — aktywny układ ładuje tylko swoje. */
  function diagramHtml(d) {
    const kartyProm = d.cards.map((k, i) => `
      <div class="mdo-card" tabindex="0" role="button" data-card="${k.id}"
           style="--mdo-x:${k.x}%; --mdo-y:${k.y}%; --mdo-pastel:rgb(${k.rgb}); --mdo-i:${i}"
           aria-label="Karta: ${k.label} — kliknij, aby odwrócić">
        <span class="mdo-card__inner">
          <span class="mdo-card__face mdo-card__face--front">
            <img class="mdo-card__hand" data-src="${d.img}hand_click.webp" alt="" aria-hidden="true">
          </span>
          <span class="mdo-card__face mdo-card__face--back">
            <img data-src="${d.img}karty/${k.id}.webp" alt="${k.alt}">
          </span>
        </span>
      </div>`).join("");
    const wycinki = d.cards.map((k, i) => `
        <button type="button" class="mdo-wyc" data-card="${k.id}" style="--mdo-i:${i}"
                aria-pressed="false" aria-label="Część diagramu: ${k.label}. Pokaż kartę.">
          <img data-src="${d.kompaktWycinek(k.wycinek)}" alt="" aria-hidden="true">
        </button>`).join("");
    const kartyDlg = d.cards.map((k) => `
        <figure class="mdo-fig" data-card="${k.id}" hidden>
          <img data-src="${d.img}karty/${k.id}.webp" alt="${k.alt}">
        </figure>`).join("");
    return `<div class="mdo-tresc" id="bd-diagram-tresc"
        data-audio-src="../assets/audio/lekcja45/03-punkt-kontrolny/03-jak-ludzie-pozbywaja-03.mp3"
        data-audio-title="Jak ludzie pozbywają się zużytego oleju?">
        <p class="bd-scene__kicker">DANE ZE ŚLEDZTWA</p>
        <h2 class="bd-scene__title mdo-tresc__title">Jak ludzie pozbywają się zużytego oleju?</h2>
        <p class="bd-scene__text mdo-tresc__intro">Wyobraź sobie tort podzielony na części.
          Każda część pokazuje jeden ze sposobów postępowania ze zużytym olejem, wskazanych
          w badaniu firmy EMKA. Im większa część, tym częściej wskazywano dany sposób.</p>
        <!-- instrukcja i stan postępu wizualnie ROZDZIELONE (Etap 1F);
             aria-live tylko na liczniku — bez powtarzania całej instrukcji
             przy każdym odkryciu -->
        <p class="mdo-brama__hint" id="bd-diagram-hint">Odkryj wszystkie karty, aby przejść dalej.</p>
        <p class="mdo-brama">
          <span class="mdo-brama__licznik" id="bd-diagram-licznik"
                aria-live="polite">Odkryto 0 z 7 sposobów</span>
        </p>
        <!-- układ promienisty (desktop) -->
        <div class="mdo-stage" id="bd-diagram" hidden>
          <div class="mdo-diagram">
            <img class="mdo-diagram__img" data-src="${d.promienisty}"
                 alt="Diagram: sposoby postępowania ze zużytym olejem — siedem części">
          </div>
          <div class="mdo-cards">${kartyProm}</div>
        </div>
        <!-- układ kompaktowy (wąski kontener) -->
        <div class="mdo-kompakt" id="bd-diagram-kompakt" hidden>
          <div class="mdo-kompakt__stage">
            <img class="mdo-kompakt__baza" data-src="${d.kompaktBaza}"
                 alt="Diagram kołowy: siedem sposobów postępowania ze zużytym olejem">
            <div class="mdo-kompakt__wycinki" role="group"
                 aria-label="Diagram — wybierz część, aby zobaczyć odpowiedź">${wycinki}</div>
          </div>
          <!-- KARTA POD DIAGRAMEM (Etap 1F, wg makiety) — stały, zarezerwowany
               obszar: otwieranie i zamykanie nie rusza układu; jedna karta,
               bez przyciemniania ekranu i bez modala -->
          <div class="mdo-kslot" id="bd-kslot">
            <p class="mdo-kslot__hint" id="bd-kslot-hint">Wybierz kawałek diagramu,
              aby zobaczyć odpowiedź.</p>
            <div class="mdo-kslot__karta" id="bd-kslot-karta" hidden>
              <button type="button" class="mdo-kslot__close" id="bd-diagram-close"
                      aria-label="Zamknij kartę">✕</button>
              ${kartyDlg}
            </div>
          </div>
        </div>
        <p class="bd-scene__src">Źródło danych: badanie firmy EMKA.</p>
      </div>`;
  }

  /** Sześć scen P03. Scena 1 i 3–6 pochodzą z silnika (teksty z dokumentu 37),
      scena 2 to PRZENIESIONY węzeł #k04 z działającym osadzeniem Genially. */
  function p03Html(c, idx) {
    const d = c.diagram;
    return `<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>
      <div class="bd-page">
        ${barHtml(c, idx)}

        ${gameSceneHtml(c)}

        <!-- Dowód nr 1 (klocek K05): JEDNA przypięta scena z FAZAMI (Etap 1E).
             Faza „dowód": nieruchomy tekst + animacja zlewu (scroll = klatki).
             Faza „diagram" (tylko przy przypiętym diagramie): ta sama przestrzeń
             kadru, crossfade po ostatniej klatce. Bez drugiego tytułu. -->
        <section class="bd-chscene bd-chscene--proof" id="bd-scene-proof" hidden
                 aria-label="Odkryty dowód: olej trafił nie tam, gdzie powinien">
          <div class="bd-pinrunway" id="bd-pinrunway">
            <div class="bd-pinstage" id="bd-pinstage">
              <div class="bd-faza bd-faza--dowod" id="bd-faza-dowod">
                <div class="bd-proof__text" id="bd-proof-text"
                     data-audio-src="../assets/audio/lekcja45/03-punkt-kontrolny/03-dowod-zlew-02.mp3"
                     data-audio-title="Dowód nr 1: Olej nie znika">
                  <p class="bd-scene__kicker">ODKRYTY DOWÓD</p>
                  <h2 class="bd-scene__title" id="bd-proof-title">Olej trafił nie tam, gdzie powinien</h2>
                  <p class="bd-scene__text">Zużyty olej wlany do odpływu nie znika. Może osadzać się
                    w instalacji, łączyć z innymi resztkami i utrudniać przepływ wody. Dlatego nie
                    powinien trafiać do zlewu ani toalety.</p>
                  <p class="bd-scene__text">To jednak dopiero początek śledztwa. Zużyty olej nie musi
                    zostać zmarnowany — może jeszcze zostać wykorzystany. Najpierw ustalmy, skąd
                    trafił do kanalizacji.</p>
                </div>
                <!-- bez aria-hidden: sekwencja niesie treść dowodu, a jej opis
                     alternatywny jest jedynym opisem tego, co widzi uczeń -->
                <div class="bd-proof__anim" id="bd-proof-anim">
                  <img class="bd-seq__frame" id="bd-seq-frame" alt="${c.seq ? c.seq.alt : ""}"
                       decoding="async">
                </div>
              </div>
              <div class="bd-faza bd-faza--diag" id="bd-faza-diag" hidden>
                <div id="bd-diagram-host-pin"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- sekcja diagramu = punkt montażu wariantu NIEPRZYPIĘTEGO; treść
             (nagłówek, licznik, oba układy, źródło) żyje w jednym wrapperze
             przenoszonym między tą sekcją a fazą przypiętą -->
        <section class="bd-chscene bd-chscene--diagram" id="bd-scene-diagram" hidden
                 aria-label="Diagram: jak ludzie pozbywają się zużytego oleju">
          <div class="bd-chscene__in">
            <div id="bd-diagram-host-flow">${diagramHtml(d)}</div>
          </div>
        </section>

        <!-- FINAŁ bramki 7/7 (Etap 1F): zwarty pas — tytuł i opis po lewej,
             CTA po prawej; na wąskich szerokościach układ pionowy. Treść
             przycisku i logika przejścia bez zmian. -->
        <section class="bd-chscene bd-chscene--kitchen" id="bd-scene-kitchen" hidden
                 aria-label="Trop prowadzący do kuchni">
          <div class="bd-chscene__in">
            <div class="bd-final">
              <div class="bd-final__txt"
                   data-audio-src="../assets/audio/lekcja45/03-punkt-kontrolny/03-kolejny-trop-prowadzi-04.mp3"
                   data-audio-title="Kolejny trop prowadzi do kuchni">
                <h2 class="bd-scene__title bd-final__title">Kolejny trop prowadzi do kuchni</h2>
                <p class="bd-scene__text" id="bd-kitchen-text">Jeden z tropów prowadzi do kuchni.
                  Nie wiemy jeszcze, co wydarzyło się przy zlewie, dlatego musimy sprawdzić to
                  miejsce i poszukać dowodów.</p>
              </div>
              <p class="bd-final__cta">
                <button type="button" class="bd-btn" id="bd-to-kitchen">Sprawdź kuchnię</button>
              </p>
            </div>
          </div>
        </section>
      </div>`;
  }

  /** Scena gry: przenosi istniejący #k04 (Genially + litera P) oraz panel
      postępu, żeby uczeń miał gdzie wpisać literę. Zero duplikatów: to te same
      węzły DOM, wracające na miejsce przy zamknięciu rozdziału. */
  /* sceny odsłaniane po grze. KUCHNI tu nie ma: od Etapu 1E wchodzi do
     przebiegu dokumentu dopiero po odkryciu 7/7 kart diagramu (bramka).
     Sekcją diagramu zarządza wireDiagram (przypięty ↔ przepływ). */
  const LATER_SCENES = ["bd-scene-proof"];

  function wireGameScene(c, view) {
    const slot = view.querySelector("#bd-slot-game");
    moveBlockInto(c.game.block, slot);
    /* sceny odsłaniane dopiero po grze — poza kolejnością Tab do tego czasu */
    LATER_SCENES.forEach((id) => setSceneActive(view.querySelector("#" + id), false));
    /* panel postępu jest dzieckiem <body> i przy body.bd-on ma visibility:hidden —
       bez przeniesienia uczeń nie miałby gdzie wpisać zdobytej litery.
       Trafia POD kompozycję (własny slot), żeby na desktopie stał centralnie
       pod grą, a nie w wąskiej prawej kolumnie. */
    const foot = view.querySelector("#bd-slot-progress") || slot;
    const prog = document.getElementById("progress-panel");
    if (prog && !moved.some((m) => m.node === prog)) {
      const anchor = document.createComment("bd-anchor-progress");
      prog.parentNode.insertBefore(anchor, prog);
      foot.appendChild(prog);
      moved.push({ node: prog, anchor });
    }

    const blok = view.querySelector("#" + c.game.block);

    /* N2.1 — wyjście z rozdziału = pełny stop gry Genially, tak jak przy
       prototypach K07/K08/K16. Bez tego blok wracał do ukrytego `<main>`
       z nadal ustawionym `src`: przeglądarka odtwarzała kontekst ramki
       i gra startowała od nowa w niewidocznym poddrzewie (razem z dźwiękiem).
       `data-src` zostaje, więc ponowne wejście doczytuje grę leniwie —
       obserwator w `initGenially` nie ma już `once`, a po naprawie N2
       blok w ukrytym `<main>` liczy się jako „poza kadrem", więc powrót
       do widocznej sceny jest dla niego świeżym wejściem.
       Zdejmujemy też klasy stanu, żeby uczeń zobaczył normalne
       „Wczytywanie gry…", a nie zastany komunikat „Gra gotowa". */
    const gWrap = blok && blok.querySelector("[data-genially]");
    const gFrame = gWrap && gWrap.querySelector("iframe");
    if (gFrame) {
      chapterCleanup.push(() => {
        try {
          gFrame.removeAttribute("src");
          gWrap.classList.remove("is-ready", "is-loading");
          const st = gWrap.querySelector(".genially__status");
          if (st) st.textContent = "";
        } catch (e) { /* ignore */ }
      });
    }

    /* Etap A5: w P04 grą jest prototyp „Latarka w kuchni" (`[data-frame]`),
       nie materiał Genially — okablowanie ma własną funkcję, bo dochodzi
       nasłuch ukończenia, most sterowania i awaria ładowania. */
    if (c.id === "p04" && blok) wireK06(c, view, blok);

    /* Jedno polecenie zamiast trzech. Akapit `.note` niesie link awaryjny,
       więc nie znika — skracamy go odwracalnie do samego linku (ten sam
       mechanizm, którym przywracamy tytuły przy zamknięciu rozdziału).
       Wariant ?legacy=1 zostaje z pełnym tekstem. */
    const note = blok && blok.querySelector(".note");
    const link = note && note.querySelector("a");
    if (note && link) {
      titleFixes.push({ el: note, html: note.innerHTML });
      note.innerHTML = "Link awaryjny: " + link.outerHTML;
    }

    /* Nadtytuł klocka w tablicy nie numeruje klocków — uczeń widzi tropy,
       nie klocki. „Klocek 6 • punkt kontrolny" → „Punkt kontrolny".
       Odwracalnie; w wariancie ?legacy=1 zostaje pełna numeracja. */
    const kicker = blok && blok.querySelector(":scope > .kicker");
    if (kicker && /klocek/i.test(kicker.textContent)) {
      titleFixes.push({ el: kicker, html: kicker.innerHTML });
      const ogon = kicker.textContent.split("•").pop().trim();
      kicker.textContent = ogon ? ogon.charAt(0).toUpperCase() + ogon.slice(1) : "Punkt kontrolny";
    }

    /* P04: hipoteza śledcza zamiast gołego polecenia — uczeń ma wiedzieć,
       DLACZEGO sprawdza kuchnię. Treść sceny filmu (chłopiec z patelnią przy
       zlewie, ujęcie urwane) potwierdzona przez użytkownika. Od Etapu 1E JEDEN
       zwarty akapit na wszystkich szerokościach (rozstrzygnięcie 2) —
       responsywność dotyczy łamania wierszy, nie przekazu. Odwracalnie;
       ?legacy=1 zostaje bez zmian. */
    if (c.id === "p04" && blok) {
      const pierwszy = blok.querySelector(":scope > .body-text");
      if (pierwszy) {
        titleFixes.push({ el: pierwszy, html: pierwszy.innerHTML });
        pierwszy.innerHTML =
          "W nagraniu chłopiec podszedł do zlewu z patelnią, ale kamera nie " +
          "pokazała, co zrobił dalej. Przeszukaj kuchnię, znajdź pięć poszlak " +
          "i sprawdź, co domownicy robią ze zużytym olejem.";
      }
    }

    /* Przycisk NARRACYJNY: ręczne potwierdzenie ucznia, nie weryfikacja systemu.
       Zostaje wyłącznie w P03, gdzie grą jest Genially (cross-origin — nie mamy
       pewnego sygnału ukończenia i nie udajemy, że mamy). W P04 od Etapu A5 gra
       zgłasza się sama, więc konfiguracja rozdziału nie ma już `game.cta`
       i przycisk w ogóle nie powstaje. */
    const done = view.querySelector("#bd-game-done");
    if (!done) return;

    /* P03: przycisk odsłania dalszą część tropu. Tu — i dopiero tu — klocek
       gry liczy się jako przerobiony; K05 zaliczy się osobno, po przejściu
       sekwencji zlewu (rozstrzygnięcie 2). */
    done.addEventListener("click", () => {
      if (NS.state && NS.state.visit) NS.state.visit(c.game.block);
      view.classList.add("is-odsloniete");
      LATER_SCENES.forEach((id) => {
        const s = view.querySelector("#" + id);
        if (s) { s.hidden = false; setSceneActive(s, true); }
      });
      /* diagram: o miejscu (faza przypięta ↔ sekcja przepływu) decyduje
         wireDiagram — tu tylko prosimy o przeliczenie po odsłonięciu */
      if (NS.__bdPrzelaczDiagram) NS.__bdPrzelaczDiagram();
      /* przycisk był wyłącznie przejściem — po aktywacji sceny znika,
         żeby nie wisiał nad tytułem jako konkurencyjny element */
      const cta = done.closest(".bd-gamecta");
      if (cta) cta.hidden = true;
      announce("Odkryty dowód. Możesz czytać dalej.");
      /* najpierw zmierz pasek, potem przewijaj: `scroll-margin-top` liczy się
         ze zmiennej --bd-bar-h, a odsłonięcie scen mogło zmienić jego wysokość */
      syncBarHeight(view);
      requestAnimationFrame(() => scrollToHeading(view.querySelector("#bd-scene-proof"), view));
    });
  }

  /** Diagram EMKA: karty odwracane kliknięciem, Enterem i spacją.
      Jeden wspólny efekt interfejsu — bez narracji etykiet i bez siedmiu MP3. */
  function wireDiagram(c, view) {
    const d = c.diagram;
    if (!d) return;
    let sfx = null;
    if (d.sfx) {
      sfx = new Audio(d.sfx);
      sfx.preload = "auto";
      /* brak pliku nie może niczego przerwać ani zalogować błędu */
      sfx.addEventListener("error", () => { sfx = null; }, { once: true });
    }
    /* „Globalne wyciszenie efektów" nie ma jeszcze własnego przełącznika
       w interfejsie (raport 38, ograniczenie znane). Do czasu jego dodania
       respektujemy dwa istniejące sygnały: kartę w tle oraz wspólną flagę
       `LK45I.sfxMuted`, którą przyszły przełącznik będzie tylko ustawiał.
       Efekt gra we wszystkich trzech trybach lekcji — to dźwięk interfejsu,
       nie narracja treści. */
    const playFlip = () => {
      if (!sfx || NS.sfxMuted || document.hidden) return;
      try { sfx.currentTime = 0; sfx.play().catch(() => {}); } catch (e) { /* cisza */ }
    };

    /* ── NAGRANIA KART (Etap A2) ──────────────────────────────────
       Każda karta ma krótki opis lektora. Gra na KLIK, w każdym trybie —
       to świadome działanie ucznia, tak samo jak opisy trybów w odprawie.
       Kolejność: najpierw efekt odwrócenia, potem głos, żeby dwa dźwięki
       nie nachodziły na siebie; kolejne kliknięcie kasuje oczekujący głos
       i zaczyna swój. Wszystko idzie kanałem menedżera, więc nigdy nie gra
       więcej niż jedno nagranie naraz. */
    let czekaGlos = 0;
    const dlugoscSfx = () => {
      const d = sfx && isFinite(sfx.duration) ? sfx.duration * 1000 : 1500;
      return Math.min(Math.max(d, 300), 2000);
    };
    const zagrajKarte = (id) => {
      const k = d.cards.find((x) => x.id === id);
      if (!k || !k.glos || !NS.audio || !NS.audio.playClip) return;
      clearTimeout(czekaGlos);
      const start = () => NS.audio.playClip(k.glos, "Karta: " + k.label);
      /* bez efektu (wyciszony, brak pliku, karta w tle) głos rusza od razu */
      if (!sfx || NS.sfxMuted || document.hidden) { start(); return; }
      czekaGlos = setTimeout(start, dlugoscSfx());
    };
    chapterCleanup.push(() => clearTimeout(czekaGlos));
    /* ── elementy wspólne ─────────────────────────────────────────── */
    const tresc = view.querySelector("#bd-diagram-tresc");
    const prom = view.querySelector("#bd-diagram");
    const komp = view.querySelector("#bd-diagram-kompakt");
    const scena = view.querySelector("#bd-scene-diagram");
    const hostFlow = view.querySelector("#bd-diagram-host-flow");
    const hostPin = view.querySelector("#bd-faza-diag #bd-diagram-host-pin");
    const fazaDiag = view.querySelector("#bd-faza-diag");
    const licznik = view.querySelector("#bd-diagram-licznik");
    const brama = view.querySelector(".mdo-brama");
    if (!tresc || !prom || !komp || !scena || !hostFlow || !hostPin) return;

    /* ── ładowanie zestawów grafik: każdy układ tylko swoje ── */
    const zaladuj = (kont) => kont.querySelectorAll("img[data-src]").forEach((im) => {
      if (!im.src) {
        /* awaria assetu nie może uwięzić ucznia: karta bez obrazka dostaje
           tekstową etykietę, a interakcja i licznik działają dalej */
        im.addEventListener("error", () => {
          const fig = im.closest(".mdo-fig, .mdo-card__face--back");
          const id = (im.closest("[data-card]") || {}).dataset;
          if (fig && id && id.card) {
            const k = d.cards.find((x) => x.id === id.card);
            const zast = h("p", "mdo-fallback", k ? k.label : id.card);
            fig.appendChild(zast);
          }
          im.remove();
        }, { once: true });
        im.src = im.dataset.src;
      }
    });
    let promZaladowany = false, kompZaladowany = false;
    const zaladujProm = () => { if (!promZaladowany) { promZaladowany = true; zaladuj(prom); } };
    const zaladujKompakt = () => { if (!kompZaladowany) { kompZaladowany = true;
      zaladuj(komp); } };

    /* ── BRAMKA 7/7: wspólna dla obu układów ──────────────────────── */
    const odkryte = new Set();
    let bramaOtwarta = false;
    const kuchnia = view.querySelector("#bd-scene-kitchen");
    const odkryj = (id) => {
      if (odkryte.has(id)) return;
      odkryte.add(id);
      if (licznik) licznik.textContent = "Odkryto " + odkryte.size + " z 7 sposobów";
      if (odkryte.size >= d.cards.length && !bramaOtwarta) {
        bramaOtwarta = true;
        tresc.classList.add("is-complete");        /* koniec pulsowania */
        const hintB = view.querySelector("#bd-diagram-hint");
        if (hintB) hintB.textContent = "Wszystkie sposoby odkryte — możesz przejść dalej.";
        announce("Wszystkie sposoby odkryte. Odblokowano dalszą część śledztwa.");
        /* dopiero TERAZ dalsza treść trafia do przebiegu dokumentu */
        if (kuchnia) { kuchnia.hidden = false; setSceneActive(kuchnia, true); }
        syncBarHeight(view);
        nudgeWatchers();
      }
    };

    /* ── decyzja: kompakt / promienisty przypięty / promienisty w przepływie ──
       Kryteria przypięcia (rozstrzygnięcie 1): wysokość kadru ≥ 820 px ORAZ
       policzona szerokość karty ≥ 156 px przy realnie zmierzonym nagłówku. */
    /* REALNA szerokość karty: warstwa kart ma inset 5% (x0,9), a w trybie
       ciasnym karta zajmuje 21,5% warstwy — wzór odzwierciedla render */
    const PIN_MIN_H = 820, PIN_MIN_KARTA = 156, KARTA_PROC = 0.94 * 0.205;
    let trybPin = false;
    const przelaczUklad = () => {
      const kont = scena.querySelector(".bd-chscene__in") || scena;
      const szer = kont.clientWidth
        || (view.querySelector(".bd-page") || view).clientWidth
        || view.clientWidth;
      const kompaktowy = szer <= (d.progKompakt || 860);
      prom.hidden = kompaktowy;
      komp.hidden = !kompaktowy;
      if (kompaktowy) zaladujKompakt(); else zaladujProm();

      /* przypięcie tylko dla układu promienistego. Nagłówek mierzymy w tej
         typografii, w której faktycznie będzie wyświetlany po przypięciu
         (klasa `is-ciasna`) — pomiar w luźnej typografii przepływu zaniżał
         dostępny bok i 1920×1080 nie łapało progu 156 px. */
      let pin = false, stronaKarty = 0;
      /* dopóki treść jest ukryta (przed przyciskiem gry), pomiar nagłówka
         zwróciłby 0 i dawał fałszywe przypięcie — decyzję odkładamy */
      if (!kompaktowy && tresc.offsetWidth > 0) {
        const availH = view.clientHeight - parseFloat(
          getComputedStyle(view).getPropertyValue("--bd-bar-h")) || view.clientHeight - 64;
        const bylaCiasna = tresc.classList.contains("is-ciasna");
        tresc.classList.add("is-ciasna");
        let headH = 0;
        tresc.querySelectorAll(".bd-scene__kicker, .mdo-tresc__title, .mdo-tresc__intro, .mdo-brama")
          .forEach((e) => { headH += e.offsetHeight; });
        /* źródło EMKA w trybie ciasnym jest nakładką (0 wysokości); rezerwa 32
           pokrywa pionowe wypełnienie stage'u i margines bezpieczeństwa */
        const bok = Math.min(availH - headH - 32, szer * 0.96, 1180);
        stronaKarty = bok * KARTA_PROC;
        pin = availH >= PIN_MIN_H && stronaKarty >= PIN_MIN_KARTA;
        if (!pin && !bylaCiasna) tresc.classList.remove("is-ciasna");
        if (pin) tresc.classList.add("is-ciasna");
        prom.style.width = pin ? Math.round(bok) + "px" : "";
        prom.style.marginInline = pin ? "auto" : "";
      } else {
        tresc.classList.remove("is-ciasna");
      }
      /* KOMPAKT (Etap 1F): przy pełnym mobilnym pinie sceny dowodu diagram
         też wchodzi jako faza tej samej przypiętej przestrzeni — z typografią
         kompaktową wg makiety (klasa `is-komp`). */
      tresc.classList.toggle("is-komp", kompaktowy);
      if (kompaktowy && NS.__bdMobPin) pin = true;
      if (pin !== trybPin) {
        trybPin = pin;
        /* przenosimy CAŁY wrapper — słuchacze i stan wędrują z węzłami */
        (pin ? hostPin : hostFlow).appendChild(tresc);
        fazaDiag.hidden = !pin;
        view.classList.toggle("bd-diag-pin", pin);
      }
      /* sekcja przepływu widoczna tylko, gdy treści odsłonięte i diagram
         NIE jest przypięty (przy pinie żyje w fazie sceny dowodu) */
      const odslon = view.classList.contains("is-odsloniete");
      scena.hidden = !(odslon && !pin);
      if (odslon) setSceneActive(scena, !pin);
      NS.__bdDiagPinInfo = { pin, karta: Math.round(stronaKarty), kompaktowy };
    };
    przelaczUklad();
    NS.__bdPrzelaczDiagram = przelaczUklad;      /* wywoływane po odsłonięciu treści */
    chapterCleanup.push(() => { delete NS.__bdPrzelaczDiagram; delete NS.__bdDiagPinInfo; });
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => przelaczUklad()) : null;
    if (ro) { ro.observe(view); ro.observe(scena);
      chapterCleanup.push(() => ro.disconnect());
    } else { window.addEventListener("resize", przelaczUklad);
      chapterCleanup.push(() => window.removeEventListener("resize", przelaczUklad)); }

    /* ── DESKTOP: promieniste karty, zakryte na starcie, puls kolejno ── */
    const flip = (card) => {
      const opened = card.classList.toggle("is-flipped");
      card.setAttribute("aria-pressed", opened ? "true" : "false");
      tresc.classList.add("is-touched");         /* puls łagodnieje po 1. interakcji */
      if (opened) { playFlip(); zagrajKarte(card.dataset.card); odkryj(card.dataset.card); }
    };
    prom.querySelectorAll(".mdo-card").forEach((card) => {
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", () => flip(card));
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        e.preventDefault();                       /* spacja nie przewija strony */
        flip(card);
      });
    });

    /* ── KOMPAKT: jedna karta w STAŁYM slocie pod diagramem (Etap 1F).
       Świadoma zmiana względem raportu 44 (duży modal) na wzór makiety
       użytkownika. Slot ma zarezerwowaną wysokość — otwieranie i zamykanie
       nie rusza układu; bez przyciemniania ekranu. */
    const kslot = view.querySelector("#bd-kslot");
    const kslotKarta = view.querySelector("#bd-kslot-karta");
    const kslotHint = view.querySelector("#bd-kslot-hint");
    const zamknijBtn = view.querySelector("#bd-diagram-close");
    const wycinki = Array.from(komp.querySelectorAll(".mdo-wyc"));
    let aktywny = null;

    const zamknijKarte = (wrocFokus) => {
      if (!aktywny) return;
      const poprzedni = aktywny;
      aktywny = null;
      kslotKarta.hidden = true;
      kslotHint.hidden = false;
      wycinki.forEach((s) => { s.classList.remove("is-active"); s.setAttribute("aria-pressed", "false"); });
      if (wrocFokus) {
        const s = wycinki.find((x) => x.dataset.card === poprzedni);
        if (s) s.focus();                        /* powrót fokusu na wycinek */
      }
    };
    if (zamknijBtn) zamknijBtn.addEventListener("click", () => zamknijKarte(true));

    const pokazKarte = (id) => {
      if (id === aktywny) { zamknijKarte(true); return; }   /* toggle aktywnego */
      kslotKarta.querySelectorAll(".mdo-fig").forEach((f) => { f.hidden = f.dataset.card !== id; });
      kslotKarta.hidden = false;
      kslotHint.hidden = true;
      wycinki.forEach((s) => {
        const on = s.dataset.card === id;
        s.classList.toggle("is-active", on);
        s.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) s.classList.add("is-seen");
      });
      aktywny = id;
      komp.classList.add("is-touched");
      playFlip();
      zagrajKarte(id);
      odkryj(id);
      /* logiczny fokus na przycisku zamknięcia — Escape i Enter działają od razu */
      if (zamknijBtn) zamknijBtn.focus({ preventScroll: true });
      announce("Odpowiedź: " + ((d.cards.find((k) => k.id === id) || {}).label || id) + ".");
    };
    /* klawiatura: Enter/spacja na przycisku odpala click mimo pointer-events:none */
    wycinki.forEach((s) => s.addEventListener("click", () => pokazKarte(s.dataset.card)));

    /* Escape zamyka TYLKO kartę (zanim globalny uchwyt zamknie rozdział) */
    const naEscKarta = (e) => {
      if (e.key !== "Escape" || !aktywny) return;
      e.stopPropagation();
      zamknijKarte(true);
    };
    view.addEventListener("keydown", naEscKarta);
    chapterCleanup.push(() => view.removeEventListener("keydown", naEscKarta));

    /* wskaźnik (mysz/dotyk): hit-test po kanale alfa — wycinki się nie
       nakładają, więc pasuje najwyżej jeden */
    const stageKomp = komp.querySelector(".mdo-kompakt__stage");
    const hitCtx = { gotowe: false, dane: [] };
    const zbudujHitTest = () => {
      if (hitCtx.gotowe) return;
      const obrazy = wycinki.map((w) => w.querySelector("img")).filter(Boolean);
      if (obrazy.length !== wycinki.length ||
          !obrazy.every((im) => im.complete && im.naturalWidth)) return;
      const HW = 300;                            /* zgrubna siatka trafień wystarcza */
      hitCtx.dane = obrazy.map((im) => {
        const cv = document.createElement("canvas");
        const hh = Math.round(HW * im.naturalHeight / im.naturalWidth);
        cv.width = HW; cv.height = hh;
        cv.getContext("2d").drawImage(im, 0, 0, HW, hh);
        return { d: cv.getContext("2d").getImageData(0, 0, HW, hh).data, w: HW, h: hh };
      });
      hitCtx.gotowe = true;
    };
    stageKomp.addEventListener("click", (e) => {
      zbudujHitTest();
      if (!hitCtx.gotowe) return;
      const r = stageKomp.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return;
      for (let i = 0; i < hitCtx.dane.length; i++) {
        const hd = hitCtx.dane[i];
        const px = Math.min(hd.w - 1, Math.round(nx * hd.w));
        const py = Math.min(hd.h - 1, Math.round(ny * hd.h));
        if (hd.d[(py * hd.w + px) * 4 + 3] > 60) { pokazKarte(wycinki[i].dataset.card); return; }
      }
    });

    /* „Sprawdź kuchnię" domyka CAŁY trop P03 i przenosi ucznia do P04 —
       dopiero tutaj rozdział liczy się jako ukończony (rozstrzygnięcie 2). */
    const kitchen = view.querySelector("#bd-to-kitchen");
    if (kitchen) kitchen.addEventListener("click", () => {
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });
  }

  /** Przypięta scena dowodu — JEDNA kompozycja wg makiety użytkownika:
      nadtytuł, tytuł i oba akapity stoją NIERUCHOMO u góry kadru, pod nimi
      duża animacja zlewu. Scroll steruje wyłącznie numerem klatki (0 → 70);
      tekst nie jest przesuwany, skalowany ani wygaszany — poprzedni mechanizm
      wzajemnego zastępowania się warstw został usunięty w Etapie 1D.

      Wejście sceny: delikatny fade + przesunięcie CAŁEJ kompozycji (klasa
      `is-in`), a scrub zaczyna się dopiero od małego progu postępu, żeby kadr
      zdążył się ustabilizować z tekstem i pierwszą klatką.

      Bez przechwytywania `wheel`/`touchmove`, bez nowych zależności.
      Przewijanie wstecz odtwarza sekwencję wstecz, bo stan liczymy z pozycji,
      a nie akumulujemy. Brak pojedynczej klatki nie przerywa lekcji. */
  function wireSeq(c, view) {
    const s = c.seq;
    const img = view.querySelector("#bd-seq-frame");
    const scene = view.querySelector("#bd-scene-proof");
    const runway = view.querySelector("#bd-pinrunway");
    const stage = view.querySelector("#bd-pinstage");
    const anim = view.querySelector("#bd-proof-anim");
    if (!s || !img || !scene || !runway || !stage || !anim) return;

    /* znacznik wersji z board-boot.js — nazwy klatek są stałe, więc bez niego
       przeglądarka pokazałaby wersje sprzed korekty kanału alfa */
    const wer = NS.assetVersion || "";
    const url = (i) => s.dir + s.prefix + String(i).padStart(s.pad, "0") + s.ext + wer;
    const last = s.count - 1;

    /* Klocek K05 zalicza się dopiero po REALNYM przejściu sekwencji: uczeń
       musiał zobaczyć jej początek (drożna instalacja) i dojść do końca
       (zator). Samo odsłonięcie sceny ani skok na jej koniec nie wystarcza
       — patrz rozstrzygnięcie 2. */
    let seqDone = false, widzianoStart = false;
    const markSeq = () => {
      if (seqDone || !widzianoStart) return;
      seqDone = true;
      scene.classList.add("is-done");
      if (s.block && NS.state && NS.state.visit) NS.state.visit(s.block);
    };

    /* reduced motion: bez przypinania i bez scrubu — tekst i klatka końcowa
       stoją nieruchomo jedno pod drugim, w normalnej kolejności czytania */
    if (reduceMotion) {
      img.src = url(last);
      scene.classList.add("is-static", "is-in");
      widzianoStart = true;               /* statyczny wariant = pełna treść od razu */
      markSeq();
      return;
    }

    /* ── Renderowanie na canvasie ────────────────────────────────────────
       Podmiana `img.src` wymusza dekodowanie w chwili wyświetlenia: przy
       szybkim przewijaniu przeglądarka pokazywała przez moment starą klatkę,
       co dawało widoczne szarpnięcia. Teraz klatki są dekodowane z góry
       (`img.decode()`), a rysujemy je do canvasu — rysowanie zdekodowanego
       obrazu jest natychmiastowe i nigdy nie zostawia pustego kadru.
       Na wąskich ekranach dekodujemy co drugą klatkę: 71 pełnych bitmap to
       ~143 MB rastry, czego szkolny telefon nie udźwignie (patrz raport 42). */
    const waski = Math.min(innerWidth, innerHeight) < 700;
    const krokDek = waski ? 2 : 1;
    const canvas = document.createElement("canvas");
    canvas.className = "bd-seq__canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", s.alt || "");
    const ctx = canvas.getContext("2d", { alpha: true });
    anim.insertBefore(canvas, img);
    img.hidden = true;                      /* <img> zostaje jako opis dostępny */
    img.setAttribute("aria-hidden", "true");

    const klatki = new Array(s.count).fill(null);
    let gotowe = 0, ostatniaNarysowana = -1, wymiaryUstawione = false;

    const rysuj = (i) => {
      let k = klatki[i];
      if (!k) {                             /* brak tej klatki → najbliższa gotowa */
        for (let d = 1; d <= s.count; d++) {
          if (klatki[i - d]) { k = klatki[i - d]; break; }
          if (klatki[i + d]) { k = klatki[i + d]; break; }
        }
      }
      if (!k) return;                       /* nic jeszcze nie ma — zostaje puste tło */
      /* świeży <canvas> ma domyślne 300×150, więc nie można testować `!canvas.width` */
      if (!wymiaryUstawione) {
        canvas.width = k.naturalWidth; canvas.height = k.naturalHeight;
        wymiaryUstawione = true;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(k, 0, 0, canvas.width, canvas.height);
      ostatniaNarysowana = i;
      canvas.dataset.klatka = i;            /* podgląd dla testów i diagnostyki */
    };

    /* Pobranie i zdekodowanie: najpierw klatka 0 (żeby kadr nigdy nie był pusty),
       potem reszta w kolejności. `decode()` nie blokuje wątku głównego. */
    const wczytaj = (i) => new Promise((res) => {
      const im = new Image();
      im.decoding = "async";
      im.onerror = () => res(null);         /* brak klatki nie przerywa lekcji */
      im.onload = () => {
        const ok = () => { klatki[i] = im; gotowe++; res(im); };
        if (im.decode) im.decode().then(ok, ok); else ok();
      };
      im.src = url(i);
    });

    /* Korekta OPTYCZNA (rozstrzygnięcie 3): rura wystaje w prawo, więc środek
       treści rysunku nie pokrywa się ze środkiem płótna. Liczymy unię bboxów
       trzech próbkowanych klatek (stała wartość — bez bocznego „pływania"
       podczas scrubu) i przesuwamy WYŁĄCZNIE warstwę renderującą transformem,
       przyciętym do luzu kontenera — transform nie zmienia layoutu, więc nie
       może powstać poziomy scroll. Na telefonie canvas ma 100% szerokości
       (luz 0), więc korekta naturalnie znika. */
    const optyka = { dx: 0 };
    const policzOptyke = () => {
      /* Podstawą jest KLATKA 0 — to na niej uczeń stoi przed scrubem i to jej
         środek treści ma leżeć na osi arkusza. Unia z klatką końcową (szerokie
         wykrzykniki po obu stronach) jest niemal symetryczna i dawałaby
         korektę zerową, mimo widocznego przesunięcia w spoczynku. */
      const im = klatki[0];
      if (!im || optyka.srodekTresci !== undefined) return;
      let minX = 1e9, maxX = -1;
      const cv = document.createElement("canvas");
      cv.width = 240; cv.height = Math.round(240 * im.naturalHeight / im.naturalWidth);
      const cx = cv.getContext("2d");
      cx.drawImage(im, 0, 0, cv.width, cv.height);
      const dd = cx.getImageData(0, 0, cv.width, cv.height).data;
      for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
        if (dd[(y * cv.width + x) * 4 + 3] > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
      if (maxX < 0) return;
      optyka.srodekTresci = (minX + maxX) / 2 / cv.width;   /* 0..1 płótna */
      zastosujOptyke();
    };
    const zastosujOptyke = () => {
      if (optyka.srodekTresci === undefined) return;
      const rc = canvas.getBoundingClientRect();
      const ra = anim.getBoundingClientRect();
      if (!rc.width || !ra.width) return;
      const luz = Math.max(0, (ra.width - rc.width) / 2);
      const dx = Math.max(-luz, Math.min(luz, (0.5 - optyka.srodekTresci) * rc.width));
      if (Math.abs(dx - optyka.dx) < 1) return;
      optyka.dx = dx;
      canvas.style.transform = dx ? "translateX(" + dx.toFixed(0) + "px)" : "";
    };
    if ("ResizeObserver" in window) {
      const roA = new ResizeObserver(zastosujOptyke);
      roA.observe(anim);
      chapterCleanup.push(() => roA.disconnect());
    }

    wczytaj(0).then((im) => { if (im) { rysuj(0); policzOptyke(); } });
    (async () => {
      for (let i = krokDek; i <= last; i += krokDek) await wczytaj(i);
      if (ostatniaNarysowana >= 0) rysuj(ostatniaNarysowana);
      policzOptyke();
    })();

    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const faza = (p, a, b) => clamp((p - a) / (b - a));

    /* wejście CAŁEJ kompozycji: raz, po wjechaniu sceny w kadr (fade +
       przesunięcie w CSS); tekst i pierwsza klatka są potem nieruchome */
    const wejdz = () => scene.classList.add("is-in");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es, obs) => {
        es.forEach((e) => { if (e.isIntersecting) { wejdz(); obs.disconnect(); } });
      }, { threshold: 0.1 });
      io.observe(scene);
      chapterCleanup.push(() => io.disconnect());
      setTimeout(wejdz, 2000);              /* zapas, gdyby IO nie raportował */
    } else { wejdz(); }

    /* Wygładzanie: scroll wyznacza CEL, a wyświetlana klatka dojeżdża do niego
       w `requestAnimationFrame`. Dzięki temu jedno kliknięcie kółka nie jest
       skokiem o kilka klatek, tylko krótkim przesunięciem — a widok nadal
       reaguje na aktualną pozycję strony (nie odtwarzamy pominiętych klatek
       po zakończeniu przewijania, tylko dojeżdżamy do bieżącego celu). */
    let raf = 0, tickRaf = 0;
    let cel = 0, biezacy = 0;
    /* pełne przypięcie na telefonie: null = jeszcze nie zmierzone */
    let mobPin = null;
    if ("ResizeObserver" in window) {
      const roM = new ResizeObserver(() => { mobPin = null; onScroll(); });
      roM.observe(view);
      chapterCleanup.push(() => roM.disconnect());
    }
    const tick = () => {
      tickRaf = 0;
      const roznica = cel - biezacy;
      if (Math.abs(roznica) < 0.35) biezacy = cel;
      else biezacy += roznica * 0.22;
      const i = Math.max(0, Math.min(last, Math.round(biezacy)));
      if (i !== ostatniaNarysowana) rysuj(i);
      if (biezacy !== cel) tickRaf = requestAnimationFrame(tick);
    };
    const ruszTick = () => { if (!tickRaf) tickRaf = requestAnimationFrame(tick); };

    const draw = () => {
      raf = 0;
      const r = runway.getBoundingClientRect();
      /* scena jeszcze nieodsłonięta (wysokość 0) — nie licz postępu,
         bo wyszłoby 100% i sekwencja startowałaby od ostatniej klatki */
      if (r.height < 1) return;
      const vh = view.clientHeight || innerHeight;
      const droga = Math.max(r.height - vh, 1);
      const p = clamp(-r.top / droga);

      /* Pełne przypięcie na telefonie (N3/A, decyzja użytkownika): ZAWSZE —
         ten sam model co desktop: wejście w kadr → stop, scroll scrubuje
         klatki, po domknięciu crossfade do diagramu w tym samym kadrze.
         Dawny pomiar z 1F (tekst+150+52 ≤ okno−belka) przepadał na
         prawdziwych telefonach — pasek przeglądarki zabiera ~80–150 px
         wysokości — i zrzucał ucznia do wariantu zapasowego z 1D: animacja
         biegła w trakcie zwykłego przewijania, zlew uciekał nad krawędź,
         a po treści zostawał ogon pustego runwayu. Dopasowaniem kompozycji
         do niskich okien zajmuje się teraz CSS (kompakt typografii),
         nie heurystyka. Wariant zapasowy zostaje w arkuszu wyłącznie jako
         asekuracja na wypadek braku tej gałęzi JS. */
      if (mobPin === null) {
        mobPin = matchMedia("(max-width: 900px)").matches;
        /* desktop: o pinie decyduje diagram (deskPin niżej) — bez zmian */
        view.classList.toggle("bd-mob-pin", mobPin);
        NS.__bdMobPin = mobPin;
        if (NS.__bdPrzelaczDiagram) NS.__bdPrzelaczDiagram();
      }

      /* STREFY POSTĘPU (Etap 1F, rozstrzygnięcie o plateau):
           tryb przypięty (desktop-pin LUB mobile-pin):
             6–62 %  klatki 0 → 70
             62–78 % PLATEAU ostatniej klatki (16 % drogi ≈ „dwa ruchy palca")
             78 %    przejście faz zlew → diagram (histereza 72 % przy cofaniu)
           tryb bez przypięcia diagramu:
             6–80 %  klatki, 80–100 % plateau przed zjazdem do sekcji.
         Wszystko z mapowania pozycji scrolla — zero liczenia gestów. */
      const deskPin = !!(NS.__bdDiagPinInfo && NS.__bdDiagPinInfo.pin);
      const pinFaz = deskPin || mobPin === true;
      const koniecKlatek = pinFaz ? 0.62 : 0.80;
      cel = faza(p, 0.06, koniecKlatek) * last;
      if (cel <= 3) widzianoStart = true;
      if (cel >= last - 1) markSeq();

      /* przejście faz w tej samej przestrzeni kadru — po plateau, odwracalne */
      if (pinFaz) {
        const naDiag = stage.classList.contains("is-diag");
        if (!naDiag && p >= 0.78) {
          stage.classList.add("is-diag");
          const fd = view.querySelector("#bd-faza-diag");
          if (fd) fd.hidden = false;
          announce("Dane ze śledztwa: diagram sposobów pozbywania się oleju.");
        } else if (naDiag && p < 0.72) {
          stage.classList.remove("is-diag");
        }
      } else if (stage.classList.contains("is-diag")) {
        stage.classList.remove("is-diag");
      }
      ruszTick();
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
    view.addEventListener("scroll", onScroll, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (tickRaf) cancelAnimationFrame(tickRaf);
      klatki.length = 0;                    /* zwolnij zdekodowane bitmapy */
    });
    draw();
  }

  /** Panel postępu: dodajemy wyłącznie instrukcję dla ucznia. Logika liter,
      pola i licznik pozostają dotychczasowe — nie budujemy drugiego systemu. */
  function explainProgress(view) {
    const prog = view.querySelector("#progress-panel");
    if (!prog || prog.querySelector(".bd-proghint")) return;
    const hint = h("p", "bd-proghint",
      "Po ukończeniu gry znajdź literę i wpisz ją w pierwsze wolne pole.");
    const title = prog.querySelector(".progress__title");
    if (title && title.parentNode) title.parentNode.insertBefore(hint, title.nextSibling);
    else prog.insertBefore(hint, prog.firstChild);
  }

  /** Obserwator widoczności w lesson-state liczy geometrię i nasłuchuje scrolla
      OKNA. Rozdział ma własny kontener przewijania, więc bez tego mostka leniwe
      ładowanie gry i wyciszanie narracji nigdy by się nie uruchomiły. */
  function nudgeWatchers() {
    try { window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignore */ }
  }

  /** Strona rozdziału: korek po bokach, centralna jasna powierzchnia.
      Rozdział z filmem (P02) dzieli się na DWIE pełne sceny jedna pod
      drugą — A: film, B: odprawa — w jednym naturalnym kontenerze
      przewijania. Rozdział bez filmu (P01) zachowuje zatwierdzony układ
      dwukolumnowy ze stopką formalną (logotypy tylko tutaj). */
  function buildChapterView(c) {
    const old = chapterView();
    if (old) old.remove();

    const idx = CFG.chapters.indexOf(c);
    const view = h("section", "bd-chapterlay");
    view.id = "bd-chapterlay";
    view.setAttribute("aria-label", `Trop ${idx + 1} z 9: ${c.title}`);
    const scenowy = c.id === "p05" || c.id === "p06" || c.id === "p07" || c.id === "p08" || c.id === "p09";
    if (c.video || c.game || scenowy) view.classList.add("bd-chapterlay--scenes");
    /* klasa per rozdział: reguły gry K04 i K06 są różne (kwadrat kontra 16:9) */
    if (c.game || scenowy) view.classList.add("bd-chapterlay--" + c.id);

    /* Warstwa korka jest RODZEŃSTWEM białego arkusza, nigdy jego rodzicem —
       transform na przodku unieruchomiłby sticky w pasku nawigacyjnym. */
    const bg = '<div class="bd-parallax-bg" id="bd-parallax-bg" aria-hidden="true"></div>';

    view.innerHTML = c.id === "p05"
      ? p05Html(c, idx)
      : c.id === "p06"
      ? p06Html(c, idx)
      : c.id === "p07"
      ? p07Html(c, idx)
      : c.id === "p08"
      ? p08Html(c, idx)
      : c.id === "p09"
      ? p09Html(c, idx)
      : c.game && c.seq
      ? p03Html(c, idx)
      : c.game
      ? gameChapterHtml(c, idx)
      : c.video
      ? `${bg}
        <div class="bd-page">
          ${barHtml(c, idx)}
          <section class="bd-chscene bd-chscene--film" aria-label="Nagranie: ${c.title}">
            <div class="bd-chscene__in">
              <div class="bd-page__main" id="bd-slot-a"></div>
              ${evidenceHtml(c, idx)}
              <p class="bd-arrowwrap">
                <button type="button" class="bd-arrow" id="bd-arrow" hidden
                  aria-label="Przejdź do odprawy — przewiń do następnej sceny">
                  <span class="bd-arrow__txt">Przejdź do odprawy</span>
                  <svg class="bd-arrow__ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4v13m0 0l-6-6m6 6l6-6" fill="none" stroke="currentColor"
                      stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </p>
            </div>
          </section>
          <section class="bd-chscene bd-chscene--brief" id="bd-scene-brief" aria-label="Odprawa">
            <div class="bd-chscene__in">
              <div class="bd-page__main" id="bd-slot-b"></div>
            </div>
          </section>
        </div>
        ${dialogHtml(c)}`
      : `${bg}
        <div class="bd-page">
          <div class="bd-sheetfx" aria-hidden="true"></div>
          <div class="bd-page__in">
            ${barHtml(c, idx)}
            <div class="bd-page__grid">
              <div class="bd-page__main" id="bd-slot-a"></div>
              <aside class="bd-page__aside">${evidenceHtml(c, idx)}</aside>
            </div>
            <div class="bd-page__foot">${pageFootHtml()}</div>
          </div>
        </div>`;

    el.root.appendChild(view);

    /* treści przenoszone: przy dwóch scenach K02 → scena A, K03 → scena B */
    const slotA = view.querySelector("#bd-slot-a");
    const slotB = view.querySelector("#bd-slot-b");
    if (c.id === "p05") {
      /* Etap 2B: przenosimy WYŁĄCZNIE K07 — K08/K09/K10 czekają na kolejne
         etapy i nie mogą pojawić się jako surowe bloki legacy. */
      wireP05(c, view);
    } else if (c.id === "p06") {
      /* Etap 3A: przenosimy WYŁĄCZNIE K11 — K12 czeka na etap 3B. */
      wireP06(c, view);
    } else if (c.id === "p07") {
      /* Etap 4A: przenosimy WYŁĄCZNIE K13 — K14/K15 czekają na 4B/4C. */
      wireP07(c, view);
    } else if (c.id === "p09") {
      /* Etap 6A: finał lekcji — terminal K17, atrapa filmu, werdykt,
         dyplom K18 i powrót ze stemplem. */
      wireP09(c, view);
    } else if (c.id === "p08") {
      /* Etap 5A: scena wejścia jest w całości budowana przez silnik —
         bloku K16 NIE przenosimy, gra dochodzi w 5B. */
      wireP08(c, view);
    } else if (c.game) {
      wireGameScene(c, view);          /* przenosi #k04 i panel postępu */
    } else if (c.video && slotB) {
      moveBlockInto(c.blocks[0], slotA);
      c.blocks.slice(1).forEach((b) => moveBlockInto(b, slotB));
    } else {
      c.blocks.forEach((b) => moveBlockInto(b, slotA));
    }

    /* ── AUDIO ROZDZIAŁU ────────────────────────────────────────────
       A3: panel dźwięku siedzi w BELCE i jest w KAŻDYM tropie — stary
       panel z rogu obsługuje już wyłącznie starą lekcję. Do tego dwie
       rzeczy z wcześniejszych etapów, potrzebne wszędzie tam, gdzie
       narracja ma ruszać sama:
       • mostek przewijania (obserwator widoczności słucha scrolla
         OKNA, a rozdział przewija własny kontener),
       • doczytanie scen zbudowanych przed chwilą przez silnik. */
    wireAudioUI(view);
    if (NS.audio && NS.audio.scanScenes) NS.audio.scanScenes(view);
    if (c.id === "p01") wstrzyknijChipyK01(view);
    {
      const onAudioScroll = () => nudgeWatchers();
      view.addEventListener("scroll", onAudioScroll, { passive: true });
      chapterCleanup.push(() => view.removeEventListener("scroll", onAudioScroll));
      setTimeout(nudgeWatchers, 120);
    }

    document.body.classList.add("bd-chapter");
    wireChapterCta(c, view);
    view.querySelector("#bd-ch-back").addEventListener("click", backToBoard);
    const rep = view.querySelector("#bd-ch-replay");
    if (rep) rep.addEventListener("click", () => replayAnimation(c));
    if (c.video) {
      wireFilmModal(c, view);
      wireArrow(c, view);
      wireSceneFx(view);
    }
    if (c.game) {
      wireDiagram(c, view);
      wireSeq(c, view);
      explainProgress(view);
      wireSceneFx(view);               /* paralaksa tła, wejście scen */
      /* mostek: scroll rozdziału → obserwator geometrii w lesson-state,
         inaczej gra nigdy nie zostanie doczytana (patrz nudgeWatchers) */
      const onChScroll = () => nudgeWatchers();
      view.addEventListener("scroll", onChScroll, { passive: true });
      chapterCleanup.push(() => view.removeEventListener("scroll", onChScroll));
      setTimeout(nudgeWatchers, 120);
    }
    if (c.id === "p05") {
      wireSceneFx(view);               /* paralaksa tła korkowego */
      /* leniwe ładowanie iframe'u K07 mierzy geometrię względem OKNA —
         ten sam mostek co przy grach K04/K06 */
      const onChScroll = () => nudgeWatchers();
      view.addEventListener("scroll", onChScroll, { passive: true });
      chapterCleanup.push(() => view.removeEventListener("scroll", onChScroll));
      setTimeout(nudgeWatchers, 120);
    }
    if (c.id === "p04") {
      wireK08(c, view);                /* Etap 2C: druga scena tropu (K08) */
    }
    syncBarHeight(view);
    return view;
  }

  /* ── pasek sticky: realna wysokość → zmienna CSS ──
     Sceny mają wysokość „ekran minus pasek"; bez tego strzałka z dołu
     sceny A wypadałaby pod krawędzią pierwszego kadru. */
  function syncBarHeight(view) {
    const v = view || chapterView();
    if (!v) return;
    const bar = v.querySelector(".bd-page__bar");
    if (!bar) return;
    v.style.setProperty("--bd-bar-h", Math.round(bar.offsetHeight) + "px");
  }

  /* ── przewijanie do nagłówka ──
     Fokus PRZED przewinięciem: focus() przerywa w Chrome trwającą animację.
     Zabezpieczenie: jeśli po 450 ms kontener nie drgnął (środowiska bez
     klatek animacji), dosuwamy natychmiast. */
  function scrollToHeading(target, host) {
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (reduceMotion || !host) return;
    const before = host.scrollTop;
    setTimeout(() => {
      if (host.scrollTop === before) target.scrollIntoView({ behavior: "auto", block: "start" });
    }, 450);
  }

  /** Strzałka „Przejdź do odprawy": skrót i wskazówka, NIGDY kłódka —
      scena B jest zawsze w DOM i osiągalna zwykłym przewijaniem. */
  function wireArrow(c, view) {
    const arrow = view.querySelector("#bd-arrow");
    if (!arrow) return;
    if (filmTouched.has(c.id)) arrow.hidden = false;   /* pamięć silnika */
    arrow.addEventListener("click", () => {
      const head = view.querySelector("#bd-slot-b .lead, #bd-slot-b h2, #bd-slot-b h1");
      scrollToHeading(head, view);
    });
  }

  /** Dekoracja: korek przesuwa się wolniej niż treść (maks. 24 px) oraz
      jednorazowe wejście sceny B. Nic z tego nie transformuje arkusza,
      tekstu, formularza ani przycisków. */
  function wireSceneFx(view) {
    /* Jednorazowe wejście scen: odprawa P02 oraz diagram i trop kuchenny w P03.
       Diagram i kuchnia mają w CSS `opacity:0` na wewnętrznym kontenerze, więc
       ich WYSOKOŚĆ jest stabilna — pod nimi nie powstaje pusta przestrzeń. */
    ["#bd-scene-brief", "#bd-scene-diagram", "#bd-scene-kitchen"].forEach((sel) => {
      const sc = view.querySelector(sel);
      if (!sc) return;
      const wygaszona = sel === "#bd-scene-brief";   /* tylko odprawa łapie Taba przed wejściem */
      const enter = () => { sc.classList.add("is-in"); if (wygaszona) setSceneActive(sc, true); };
      if (reduceMotion || !("IntersectionObserver" in window)) { enter(); return; }
      if (wygaszona) setSceneActive(sc, false);
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          enter();
          obs.disconnect();                 /* jednorazowo */
        });
      }, { threshold: 0.14 });
      io.observe(sc);
      chapterCleanup.push(() => io.disconnect());
      /* zapas: gdyby IO nie raportował (karta bez kompozycji klatek) */
      const t = setTimeout(enter, 2500);
      chapterCleanup.push(() => clearTimeout(t));
    });

    const bg = view.querySelector("#bd-parallax-bg");
    if (!bg || reduceMotion) return;
    let raf = 0, lastPaint = 0;
    const MAX = 24;                            /* górna granica z ustaleń */
    const paint = () => {
      raf = 0;
      lastPaint = Date.now();
      const y = Math.min(view.scrollTop * 0.06, MAX);
      bg.style.transform = "translate3d(0," + (-y).toFixed(1) + "px,0)";
    };
    const onScroll = () => {
      /* Zwykle throttlujemy klatką animacji. Gdy klatki nie są generowane
         (karta bez kompozycji, oszczędzanie energii), rAF nigdy nie oddaje
         sterowania — po 120 ms rysujemy synchronicznie, żeby dekoracja
         nie zamarzła na stałe. */
      if (raf) {
        if (Date.now() - lastPaint < 120) return;
        cancelAnimationFrame(raf);
        paint();
        return;
      }
      raf = requestAnimationFrame(paint);
    };
    view.addEventListener("scroll", onScroll, { passive: true });
    chapterCleanup.push(() => {
      view.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    });
  }

  /** Modal filmu: dostępny <dialog>, youtube-nocookie, bez nowej karty.
      Film startuje wyłącznie po świadomym kliknięciu Play. */
  function wireFilmModal(c, view) {
    const play = view.querySelector("#bd-film-play");
    const dlg = view.querySelector("#bd-dialog");
    const iframe = view.querySelector("#bd-yt");
    const close = view.querySelector("#bd-dialog-close");

    /* Jedna ścieżka zamknięcia (przycisk, Escape, powrót do tablicy):
       czyści src iframe'a (film przestaje grać) i przywraca focus na Play.
       Nie polegamy wyłącznie na zdarzeniu 'close' — bywa nieemitowane. */
    const closeFilm = () => {
      iframe.removeAttribute("src");
      /* Etap A1: film skończył zajmować dźwięk. Zdejmujemy blokadę, ale
         NICZEGO nie wznawiamy — scena filmu milczy dalej (powrót do sceny
         nigdy nie restartuje nagrania), a dopiero wejście w KOLEJNĄ scenę
         może się odezwać. Bez tego tryb „Słucham" po obejrzeniu filmu
         zostawał głuchy do końca lekcji. */
      if (NS.audio && NS.audio.resumeAllowed) NS.audio.resumeAllowed(true);
      if (dlg.open) dlg.close();
      setTimeout(() => play.focus(), 0);   /* po natywnym przywróceniu focusu */
      revealArrow(c, view);                /* kontakt z nagraniem = otwarcie + zamknięcie */
    };
    dlg.__bdClose = closeFilm;

    play.addEventListener("click", () => {
      stopAllMedia();
      /* Etap A1: `stopAllMedia` zatrzymuje obraz, nie narrację. Deklaracja
         `data-stops-audio` wisi na atrapie filmu w ukrytym `<main>`, która
         w tablicy ma zerową geometrię, więc jej obserwator nigdy nie odpala
         — narracja sceny grałaby pod filmem. Uciszamy wprost i nie wznawiamy
         po zamknięciu: powrót do sceny nigdy nie restartuje nagrania sam. */
      if (NS.audio && NS.audio.suspend) {
        NS.audio.suspend("Narracja wstrzymana — trwa odtwarzanie filmu.", null, true);
      }
      dlg.showModal();
      iframe.src = "https://www.youtube-nocookie.com/embed/" + c.video.youtubeId +
        "?autoplay=1&rel=0&hl=pl";
      close.focus();
    });
    close.addEventListener("click", closeFilm);
    dlg.addEventListener("cancel", closeFilm);   /* natywny Escape */
    dlg.addEventListener("close", closeFilm);    /* zapas */
  }

  /** Odsłonięcie strzałki po pierwszym kontakcie z nagraniem.
      NIE twierdzimy, że film został obejrzany — tego nie mierzymy. */
  function revealArrow(c, view) {
    filmTouched.add(c.id);
    const arrow = (view || chapterView() || document).querySelector("#bd-arrow");
    if (!arrow || !arrow.hidden) return;
    arrow.hidden = false;
    syncBarHeight();
    announce("Możesz przejść do odprawy.");
  }

  function wireChapterCta(c, view) {
    if (c.id === "p01") {
      const cta = view.querySelector("#k01 a.btn, #k01 .btn");
      if (cta && !cta.dataset.bdWired) {
        cta.dataset.bdWired = "1";
        cta.addEventListener("click", (e) => {
          e.preventDefault();
          const next = autoNext(c);
          if (next) travelTo(next); else finishChapter(c);
        });
      }
      return;
    }
    /* „Rozpocznij śledztwo" w odprawie: kończy P02 i JEDNYM ruchem przenosi
       ucznia do P03 — bez zatrzymywania go na tablicy i bez drugiego kliknięcia.
       A3: wybór trybu przeniósł się do Tropu 1 i panelu w belce, więc
       odprawa niczego już o dźwięku nie decyduje.
       Poza tablicą (wariant ?legacy=1) odnośnik #k04 działa jak dotąd. */
    const cta = view.querySelector("#k03 a.btn, #k03 .btn");
    if (!cta || cta.dataset.bdWired) return;
    cta.dataset.bdWired = "1";
    cta.addEventListener("click", (e) => {
      e.preventDefault();
      const next = autoNext(c);
      if (next) travelTo(next); else finishChapter(c);
    });
  }

  /** Dokąd trop przechodzi automatycznie po zamknięciu treści.
      Mechanizm jest wspólny (ten sam `travelTo`), ale lista jest jawna:
      dalsze polaroidy podłączamy dopiero po integracji ich rozdziałów. */
  const AUTO_TRAVEL = { p01: "p02", p02: "p03", p03: "p04", p04: "p05",
    p05: "p06", p06: "p07", p07: "p08", p08: "p09" };
  /* Rozdziały z gotowym układem strony. Od etapu 6A komplet dziewięciu:
     P09 domyka lekcję terminalem, werdyktem i dyplomem, więc nie ma już
     tropu, którego nie wolno otworzyć. */
  const ZINTEGROWANE = ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09"];
  function autoNext(c) {
    const id = AUTO_TRAVEL[c.id];
    return id && CFG.chapters.some((x) => x.id === id) ? id : null;
  }

  /** Zamknięcie tropu z poziomu treści: oznacz jako ukończony (pamięć
      silnika — trwały rejestr postępu to świadomie odłożony etap) i wróć
      na tablicę. */
  async function finishChapter(c) {
    stopAllMedia();
    restorePolaroid(c, true);
    /* Odblokowanie kolejnego tropu w pamięci silnika — bez budowania drugiego
       systemu postępu. Odblokowujemy WYŁĄCZNIE rozdziały już zintegrowane:
       otwarcie P05 pokazałoby uczniowi surowy, nieprzygotowany układ. */
    const next = CFG.chapters[CFG.chapters.indexOf(c) + 1];
    if (next && ZINTEGROWANE.indexOf(next.id) >= 0) unlock(next.id);
    const p = c[layoutKey()];
    el.scene.style.transition = "none";
    camApply(p.x, p.y, CAM.zoom);          /* niewidoczne pod stroną */
    await closeChapterFade();
    openedChapter = null;
    camReset(true);
    /* powrót PO ukończeniu tropu — jeśli to był finał, pieczęć przybija
       się na oczach ucznia */
    stempelSprawy({ przybij: true });
    const nextBtn = next && document.getElementById("bd-" + next.id);
    const btn = nextBtn || document.getElementById("bd-" + c.id);
    if (btn) btn.focus({ preventScroll: true });
    announce(next
      ? `Trop ${CFG.chapters.indexOf(c) + 1} ukończony. Odblokowano kolejny trop: ${next.title}.`
      : `Trop ${CFG.chapters.indexOf(c) + 1} ukończony. Powrót do tablicy śledztwa.`);
  }

  function unmountChapter() {
    while (chapterCleanup.length) {
      const off = chapterCleanup.pop();
      try { off(); } catch (e) { /* obserwator już odpięty */ }
    }
    while (titleFixes.length) {
      const f = titleFixes.pop();
      f.el.innerHTML = f.html;
    }
    while (moved.length) {
      const m = moved.pop();
      if (m.anchor && m.anchor.parentNode) m.anchor.parentNode.insertBefore(m.node, m.anchor);
      if (m.anchor && m.anchor.parentNode) m.anchor.parentNode.removeChild(m.anchor);
    }
    document.body.classList.remove("bd-chapter");
    /* N2.1 — bloki właśnie wróciły do ukrytego `<main>`, więc ich prostokąt
       to znów 0×0. Bez przeliczenia obserwatory zostałyby w stanie „jestem
       w kadrze" (nic nie rusza scrollem OKNA przy powrocie na tablicę),
       a wtedy ponowne wejście do tropu nie byłoby dla nich świeżym wejściem
       i gra ze zdjętym `src` nigdy by się nie doczytała. */
    nudgeWatchers();
  }

  /* Karta dowodu należy teraz wyłącznie do strony rozdziału (nigdy nie jest
     zagnieżdżana w przenoszonym #k02), więc znika razem z `view.remove()` —
     osobne odłączanie nie jest już potrzebne. */
  /** TWARDE CIĘCIE AUDIO PRZY WYJŚCIU Z TROPU (Etap A3.1).
      Wyjść jest kilka — „Wróć do tablicy", domknięcie tropu, podróż kamery
      do kolejnego tropu i Escape — ale WSZYSTKIE przechodzą przez jedną
      z dwóch bram zamknięcia rozdziału. Cięcie siedzi więc w jednym
      miejscu, na samym ich początku, a nie w każdej ścieżce osobno.
      To STOP, nie pauza: narracja urywa się w pół zdania razem z klipami
      kart, a po wejściu w kolejny trop nagranie startuje od początku swojej
      sceny. Zanik strony trwa 320 ms — gdyby cisza czekała na sprzątanie
      rozdziału, uczeń słyszałby jeszcze jedno słowo po kliknięciu. Dźwięki samej tablicy
      (intro i jego narrator) mają własny kanał i tego cięcia nie dotyczy. */
  function utnijAudioRozdzialu() {
    if (NS.audio && NS.audio.stop) NS.audio.stop(true);
  }

  function closeChapterFade() {
    utnijAudioRozdzialu();
    return new Promise((res) => {
      const view = chapterView();
      if (!view) { res(); return; }
      const dlg = view.querySelector("dialog[open]");
      if (dlg) (dlg.__bdClose || dlg.close).call(dlg);
      if (reduceMotion) { unmountChapter(); view.remove(); res(); return; }
      view.classList.remove("is-on");
      setTimeout(() => { unmountChapter(); view.remove(); res(); }, CAM.fadeMs + 40);
    });
  }
  function closeChapterInstant() {
    utnijAudioRozdzialu();
    const view = chapterView();
    if (!view) return;
    const dlg = view.querySelector("dialog[open]");
    if (dlg) (dlg.__bdClose || dlg.close).call(dlg);
    unmountChapter();
    view.remove();
    openedChapter = null;
  }

  function restorePolaroid(c, completed) {
    const btn = document.getElementById("bd-" + c.id);
    if (!btn) return;
    btn.classList.remove("is-open");
    if (completed) {
      c.state = "completed";
      btn.dataset.state = "completed";
      btn.querySelector(".bd-pol__img").src = c.frameEnd;
      btn.querySelector(".bd-pol__status").textContent = STATUS.completed;
      const i = CFG.chapters.indexOf(c);
      btn.setAttribute("aria-label", `Trop ${i + 1} z 9: ${c.title}. ${c.lead}. ${STATUS.completed}.`);
      saveStates();
    }
  }

  function unlock(id) {
    const c = CFG.chapters.find((x) => x.id === id);
    if (!c || c.state === "completed") return;
    c.state = "active";
    saveStates();                      /* także gdy scena nie jest jeszcze zbudowana */
    const btn = document.getElementById("bd-" + id);
    if (!btn) return;
    btn.dataset.state = "active";
    btn.disabled = false;
    btn.querySelector(".bd-pol__status").textContent = STATUS.active;
    const i = CFG.chapters.indexOf(c);
    btn.setAttribute("aria-label", `Trop ${i + 1} z 9: ${c.title}. ${c.lead}. ${STATUS.active}.`);
  }

  /** Ponowne odtworzenie animacji tropu: strona znika (pod nią kamera już
      stoi przy polaroidzie), film gra ponownie w polu zdjęcia. */
  async function replayAnimation(c) {
    stopAllMedia();
    const p = c[layoutKey()];
    el.scene.style.transition = "none";
    camApply(p.x, p.y, CAM.zoom);       /* niewidoczne pod stroną */
    const btn = document.getElementById("bd-" + c.id);
    btn.querySelector(".bd-pol__img").src = c.frameStart;
    await closeChapterFade();
    await playInPolaroid(c);
  }

  /* ── PODRÓŻ DO KOLEJNEGO TROPU ───────────────────────────────── */
  async function travelTo(nextId) {
    const from = openedChapter;
    if (!from) return;
    const next = CFG.chapters.find((c) => c.id === nextId);
    if (!next) return;

    /* pod nieprzezroczystą stroną: kamera wraca nad polaroid startowy */
    restorePolaroid(from, true);
    unlock(nextId);
    const pf = from[layoutKey()];
    el.scene.style.transition = "none";
    camApply(pf.x, pf.y, CAM.zoom);

    await closeChapterFade();
    openedChapter = null;
    announce(`Przechodzimy do tropu ${CFG.chapters.indexOf(next) + 1}: ${next.title}.`);

    if (reduceMotion) { openChapter(nextId); return; }

    /* podróż wzdłuż nici + rozświetlenie */
    el.threadPath.classList.add("is-live");
    await camTravel(from.id, nextId, CAM.travelMs);
    el.threadPath.classList.remove("is-live");

    openedChapter = next;
    const p = next[layoutKey()];
    await camTo(p.x, p.y, CAM.zoom, 320);
    await playInPolaroid(next);
  }

  async function backToBoard() {
    const c = openedChapter;
    stopAllMedia();
    if (c) {
      restorePolaroid(c, false);
      const p = c[layoutKey()];
      el.scene.style.transition = "none";
      camApply(p.x, p.y, CAM.zoom);     /* niewidoczne pod stroną */
    }
    await closeChapterFade();
    openedChapter = null;
    camReset(true);                     /* płynne oddalenie do całej tablicy */
    /* wyjście z rozdziału: jeśli sprawa domknęła się dopiero co, pieczęć
       przybija się teraz; jeśli już leżała — nic się nie powtarza */
    stempelSprawy({ przybij: true });
    const btn = c && document.getElementById("bd-" + c.id);
    if (btn) btn.focus({ preventScroll: true });
    announce("Powrót do tablicy śledztwa.");
  }

  /* ── podpięcia ───────────────────────────────────────────────── */
  function wire() {
    document.getElementById("bd-play").addEventListener("click", playIntro);
    document.getElementById("bd-skip-intro").addEventListener("click", () => showBoard(true));
    document.getElementById("bd-skip").addEventListener("click", () => enterBoard(true));
    document.getElementById("bd-replay").addEventListener("click", playIntro);

    const pause = document.getElementById("bd-pause");
    pause.addEventListener("click", () => {
      const v = el.introVideo;
      /* narrator idzie z filmem para w parę — inaczej po wznowieniu
         mówiłby o kadrze, którego już nie ma (Etap A1) */
      if (v.paused) {
        v.play().catch(() => {});
        if (narrator && narrator.src && narrator.currentTime > 0 && !narrator.ended) {
          narrator.play().catch(() => {});
        }
        pause.textContent = "Pauza"; pause.setAttribute("aria-pressed", "false");
      } else {
        v.pause();
        if (narrator && !narrator.paused) narrator.pause();
        pause.textContent = "Wznów"; pause.setAttribute("aria-pressed", "true");
      }
    });
    const mute = document.getElementById("bd-mute");
    mute.addEventListener("click", () => {
      const v = el.introVideo;
      v.muted = !v.muted;
      /* „Wycisz" ma wyciszać WSZYSTKO, co słychać w intro */
      if (narrator) narrator.muted = v.muted;
      mute.textContent = v.muted ? "Włącz dźwięk" : "Wycisz";
      mute.setAttribute("aria-pressed", v.muted ? "true" : "false");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const openDlg = document.querySelector(".bd-dialog[open]");
      if (openDlg) { if (openDlg.__bdClose) openDlg.__bdClose(); return; }
      if (pominAnimacje) { pominAnimacje(); return; }
      if (chapterView()) backToBoard();
    });

    const onViewportChange = () => {
      applyBoardImage();
      sizeFrame();
      relayoutScene();
      const cv = chapterView();
      if (cv) syncBarHeight(cv);        /* zmiana szerokości zmienia wysokość paska */
      if (!cv) {
        if (openedChapter) {
          const p = openedChapter[layoutKey()];
          el.scene.style.transition = "none";
          camApply(p.x, p.y, CAM.zoom);
        } else camReset(false);
      }
    };
    let rt = 0;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(onViewportChange, 200);
    });
    /* obrót telefonu bywa zgłaszany przez media query, zanim dojdzie resize */
    const mqOrient = window.matchMedia("(orientation: portrait)");
    if (mqOrient.addEventListener) mqOrient.addEventListener("change", onViewportChange);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && currentVideo) currentVideo.pause();
    });

    /* Kadr przelicza się przy KAŻDEJ zmianie wymiarów warstwy tablicy —
       jednorazowy pomiar bywał wykonywany, zanim viewport się ustabilizował
       (headless, wolny start na telefonie), i kadr zostawał za szeroki. */
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => { sizeFrame(); scheduleThread(); }).observe(el.board);
    }
  }

  /* ── start ───────────────────────────────────────────────────── */
  restoreStates();                      /* przed build(): polaroidy od razu z właściwą klatką */
  build();
  wire();
  thumbsReady = preloadThumbnails();    /* start od razu — jeszcze na ekranie startowym */
  document.body.classList.add("bd-on");
  /* strona była schowana blokadą z <head>, żeby stara lekcja nie mignęła */
  document.documentElement.classList.remove("bd-booting");
  const antiflash = document.getElementById("bd-antiflash");
  if (antiflash) antiflash.remove();

  /* Intro tylko raz w sesji. Przy kolejnym wejściu i po odświeżeniu uczeń
     dostaje od razu tablicę — film zostaje pod przyciskiem „Odtwórz intro
     ponownie". Ekran startowy jest jednocześnie gestem wymaganym przez
     przeglądarki do odtworzenia dźwięku, więc przy pierwszym wejściu zostaje. */
  const skipIntro = introSeen();
  if (skipIntro) {
    showBoard(true);                    /* bez animacji odsłaniania — to nie jest pierwsze wejście */
  } else {
    show(el.start);
    el.boardbar.hidden = true;
  }

  /* parametr QA (tylko podgląd):
     &bdStage=board | p01 (zoom) | content (strona P01) | p02 (zoom) | p02content */
  const stageParam = new URLSearchParams(location.search).get("bdStage");
  if (stageParam) {
    const jump = (c) => {
      openedChapter = c;
      const view = buildChapterView(c);
      view.classList.add("bd-chapterlay--instant", "is-on");
      camReset(false);
      /* Etap 3C.1: ta skrótowa ścieżka omijała `revealContent`, a razem
         z nią `wakeChapter` — obserwatory leniwego ładowania nigdy się nie
         budziły i sekwencje zostawały pustym kadrem aż do pierwszego gestu
         przewijania. Podgląd QA ma pokazywać to, co widzi uczeń. */
      wakeChapter(view);
    };
    const go = () => {
      if (stageParam === "intro") {
        /* podgląd układu kontrolek intro (bez odtwarzania — brak gestu) */
        show(el.video);
        el.freeze.src = isPortrait() ? CFG.assets.posterPortrait : CFG.assets.posterLandscape;
        el.freeze.classList.add("is-on");
        return;
      }
      showBoard(true);
      if (stageParam === "p01" || stageParam === "p02") {
        const c = CFG.chapters[stageParam === "p01" ? 0 : 1];
        if (stageParam === "p02") unlock("p02");
        openedChapter = c;
        const p = c[layoutKey()];
        camApply(p.x, p.y, CAM.zoom);
      } else if (stageParam === "content") {
        jump(CFG.chapters[0]);
      } else if (stageParam === "p04content") {
        /* QA: skrót prosto do treści P04 (nagłówek kuchni, gra, panel postępu,
           zakończenie) bez przechodzenia P01–P03. Działa wyłącznie z parametrem
           w adresie — nie zmienia normalnego przebiegu ani stanu produkcyjnego. */
        unlock("p04");
        jump(CFG.chapters.find((x) => x.id === "p04"));
      } else if (stageParam === "p05content") {
        /* QA: skrót prosto do treści P05 (układanka K07) — analogicznie. */
        unlock("p05");
        jump(CFG.chapters.find((x) => x.id === "p05"));
      } else if (stageParam === "p06content") {
        /* QA: skrót prosto do treści P06 (scena stadionu K11) — analogicznie. */
        unlock("p06");
        jump(CFG.chapters.find((x) => x.id === "p06"));
      } else if (stageParam === "p07content") {
        /* QA: skrót prosto do treści P07 (metafora zjazdu i skrót PSZOK). */
        unlock("p07");
        jump(CFG.chapters.find((x) => x.id === "p07"));
      } else if (stageParam === "p09content") {
        /* QA: skrót prosto do treści P09 (terminal, werdykt, dyplom). */
        unlock("p09");
        jump(CFG.chapters.find((x) => x.id === "p09"));
      } else if (stageParam === "p08content") {
        /* QA: skrót prosto do treści P08 (kadr wejścia z obiegiem). */
        unlock("p08");
        jump(CFG.chapters.find((x) => x.id === "p08"));
      } else if (stageParam === "p03" || stageParam === "p03content") {
        /* QA: skrót do P03 bez przechodzenia P01–P02. NIE zastępuje
           prawidłowego odblokowania w rzeczywistym przebiegu lekcji. */
        unlock("p03");
        const c = CFG.chapters[2];
        if (stageParam === "p03") {
          openedChapter = c;
          const p = c[layoutKey()];
          camApply(p.x, p.y, CAM.zoom);
        } else {
          jump(c);
        }
      } else if (stageParam === "p02content" || stageParam === "film" || stageParam === "brief") {
        unlock("p02");
        jump(CFG.chapters[1]);
        if (stageParam === "film") setTimeout(() => {
          const play = document.querySelector(".bd-play");
          if (play) play.click();
        }, 400);
        /* QA: ustaw kadr od razu na scenie odprawy (zrzuty do raportu) */
        if (stageParam === "brief") setTimeout(() => {
          const v = chapterView(), b = v && v.querySelector("#bd-scene-brief");
          if (!v || !b) return;
          b.classList.add("is-in");
          v.scrollTop = v.scrollHeight;
        }, 400);
      }
    };
    if (document.readyState === "complete") setTimeout(go, 80);
    else window.addEventListener("load", () => setTimeout(go, 80), { once: true });
  }

  window.BOARD_DEV = {
    state: () => ({
      layer: el.start.hidden ? (el.video.hidden ? "board" : "video") : "start",
      chapterOpen: !!chapterView(),
      chapter: openedChapter ? openedChapter.id : null,
      polaroids: el.pols.querySelectorAll(".bd-pol").length,
      notes: el.notes.querySelectorAll(".bd-note").length,
      notePins: el.notes.querySelectorAll(".bd-pinwrap").length,
      states: CFG.chapters.map((c) => c.id + ":" + c.state),
      movedNodes: moved.map((m) => m.node.id),
      videoPlaying: !!(currentVideo && !currentVideo.paused),
      camTransform: el.scene.style.transform || "(brak)",
      layout: layoutKey(),
    }),
    board: () => showBoard(true),
    open: (id) => openChapter(id || "p01"),
    travel: (id) => travelTo(id || "p02"),
    back: backToBoard,
  };
})();
