/* ═══════════════════════════════════════════════════════════════════
   E-LEKCJA 4–5 — STRONA INTEGRACYJNA K01–K18
   „Laboratorium dowodów SELEKT”

   Ten plik spina: interfejs postępu śledztwa, nawigację rozdziałów,
   bramki klocków, terminal finałowy, dyplom oraz przeniesiony bez zmian
   moduł K14 „Spacer po PSZOK-u”.

   Kolejność ładowania (zwykłe skrypty, bez bundlera):
     lesson-state.js → audio-manager.js → modules.js → ten plik.
   ═══════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const NS = window.LK45I || {};
  const S  = NS.state;
  if (!S) { console.warn("LK45I: brak modułu stanu"); return; }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
  const motionOn = hasGsap && !reduceMotion;

  /* ═══════════════════════════════════════════
     0. DROBIAZGI UI (ogłoszenia, tryb podglądu)
     ═══════════════════════════════════════════ */
  const liveEl = document.getElementById("lk-live");
  const progPanel = document.getElementById("progress-panel");

  const ui = NS.ui = {
    announce(msg) { if (liveEl) liveEl.textContent = msg; },
    flashProgress() {
      if (!progPanel) return;
      progPanel.classList.add("is-flash");
      setTimeout(() => progPanel.classList.remove("is-flash"), 1400);
    },
  };

  if (S.PREVIEW) {
    document.body.classList.add("is-preview");
    const flag = document.getElementById("preview-flag");
    if (flag) flag.hidden = false;
    const resetBtn = document.getElementById("preview-reset");
    if (resetBtn) {
      resetBtn.hidden = false;
      resetBtn.addEventListener("click", () => {
        S.reset();
        location.reload();
      });
    }
  }

  /* ═══════════════════════════════════════════
     1. POSTĘP ŚLEDZTWA — pięć neutralnych pól
     puste → aktywne pole wpisania litery → ✓
     ═══════════════════════════════════════════ */
  const slots = Array.from(document.querySelectorAll(".prog__slot"));
  const counterEl = document.getElementById("progress-counter");

  function renderProgress() {
    const st = S.get();
    slots.forEach(slot => {
      const L = slot.dataset.letter;
      const dot   = slot.querySelector(".prog__dot");
      const input = slot.querySelector(".prog__input");
      const check = slot.querySelector(".prog__check");
      const done  = st.checkpointLetters[L];
      const ready = st.lettersReady.includes(L);

      slot.classList.toggle("is-done", done);
      slot.classList.toggle("is-ready", ready && !done);
      dot.hidden   = done || ready;
      input.hidden = done || !ready;
      check.hidden = !done;
      input.disabled = done || !ready;
      if (done) {
        input.value = "";
        slot.setAttribute("aria-label", `Punkt ${L}: zaliczony`);
      } else if (ready) {
        slot.setAttribute("aria-label", `Punkt ${L}: wpisz zdobytą literę`);
      } else {
        slot.setAttribute("aria-label", `Punkt ${L}: jeszcze niedostępny`);
      }
    });
    const n = S.get().lettersCount;
    if (counterEl) counterEl.textContent = `Ukończono ${n} z 5 punktów`;
    renderTerminal();
  }

  slots.forEach(slot => {
    const L = slot.dataset.letter;
    const input = slot.querySelector(".prog__input");
    const msg = document.getElementById("progress-msg");
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (!v) return;
      const res = S.submitLetter(L, v);
      if (res === "ok") {
        if (msg) msg.textContent = `Litera ${L} zapisana w aktach sprawy.`;
        ui.announce(`Litera ${L} zapisana. ${S.get().lettersCount} z 5 punktów.`);
      } else if (res === "wrong") {
        input.value = "";
        slot.classList.add("is-wrong");
        setTimeout(() => slot.classList.remove("is-wrong"), 700);
        if (msg) msg.textContent = "To nie ta litera. Sprawdź ekran końcowy gry.";
        ui.announce("Wpisana litera jest niepoprawna.");
      } else if (res === "locked") {
        input.value = "";
        if (msg) msg.textContent = "To pole otworzy się po ukończeniu odpowiedniego zadania.";
      }
      renderProgress();
    });
  });

  /* ═══════════════════════════════════════════
     2. NAWIGACJA — rozdziały, pasek scrolla, wyjście
     ═══════════════════════════════════════════ */
  const bar = document.getElementById("scroll-bar");
  const chapterLinks = Array.from(document.querySelectorAll(".hud__chapter"));
  const chapterSections = chapterLinks
    .map(a => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  function onScrollUI() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.width = max > 0 ? (h.scrollTop / max * 100) + "%" : "0%";

    /* aktywny rozdział = ostatnia sekcja, której początek minęliśmy */
    let active = 0;
    chapterSections.forEach((sec, i) => {
      if (sec.getBoundingClientRect().top <= window.innerHeight * 0.4) active = i;
    });
    chapterLinks.forEach((a, i) => {
      a.classList.toggle("is-active", i === active);
      if (i === active) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", onScrollUI, { passive: true });
  window.addEventListener("resize", onScrollUI);

  /* kotwice: przewijanie z poszanowaniem focusu (stałe panele nie kradną go) */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href.length < 2) return;
      const t = document.querySelector(href);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      /* focus na celu, ale bez ponownego przewijania */
      const prevTab = t.getAttribute("tabindex");
      if (prevTab === null) t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: true });
      if (prevTab === null) t.addEventListener("blur", () => t.removeAttribute("tabindex"), { once: true });
    });
  });

  /* mobilne zwijanie panelu postępu */
  const progToggle = document.getElementById("progress-toggle");
  if (progToggle && progPanel) {
    progToggle.addEventListener("click", () => {
      const open = progPanel.classList.toggle("is-open");
      progToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ═══════════════════════════════════════════
     3. ODWIEDZONE KLOCKI
     Stabilna obecność w widoku (≈700 ms) — nie samo mignięcie.
     Interakcje mają własne zdarzenia ukończenia (moduły).
     ═══════════════════════════════════════════ */
  document.querySelectorAll("[data-block]").forEach(sec => {
    NS.util.watch(sec, {
      ratio: 0.35, dwell: 700, once: true,
      onEnter: () => S.visit(sec.dataset.block),
    });
  });

  /* ═══════════════════════════════════════════
     4. K02 — film otwierający (bramka przejścia)
     ═══════════════════════════════════════════ */
  const k02Btn = document.getElementById("k02-seen");
  if (k02Btn) {
    k02Btn.addEventListener("click", () => {
      S.visit("k02");
      const t = document.getElementById("k03");
      if (!t) return;
      /* KOLEJNOŚĆ MA ZNACZENIE: focus() — nawet z preventScroll — przerywa
         trwającą animację płynnego przewijania w Chrome. Najpierw ustawiamy
         fokus na nagłówku odprawy (czytnik ekranu i klawiatura czytają dalej
         we właściwym miejscu), dopiero potem uruchamiamy przewijanie.
         Obwódka pojawia się tylko przy :focus-visible — patrz reguła
         [tabindex="-1"]:focus:not(:focus-visible) w arkuszu stylów. */
      const head = document.getElementById("k03-title");
      if (head) {
        head.setAttribute("tabindex", "-1");
        head.focus({ preventScroll: true });
      }
      /* przewinięcie uruchamia WYŁĄCZNIE kliknięcie ucznia — nigdy koniec filmu */
      const target = head || t;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

      /* Zabezpieczenie: animowane przewijanie opiera się na klatkach animacji
         i w środowiskach, które ich nie generują (np. karta bez kompozycji),
         potrafi nie ruszyć wcale. Jeśli po 450 ms kontener nie drgnął,
         dosuwamy natychmiast — uczeń zawsze dociera do odprawy. */
      if (!reduceMotion) {
        const host = (() => {
          for (let n = target.parentElement; n; n = n.parentElement) {
            const oy = getComputedStyle(n).overflowY;
            if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
          }
          return document.scrollingElement || document.documentElement;
        })();
        const before = host.scrollTop;
        setTimeout(() => {
          if (host.scrollTop === before) {
            target.scrollIntoView({ behavior: "auto", block: "start" });
          }
        }, 450);
      }
    });
  }
  /* Wejście w obszar filmu ucisza narrację strony.
     Etap A1: ATRAPY POMIJAMY. Znacznik `data-stops-audio` znaczy „tutaj
     jest odtwarzacz, który przejmie dźwięk" — pusty prostokąt „DO
     UZUPEŁNIENIA" niczego nie przejmuje, a uciszał narrację TEJ SAMEJ
     sceny, w której leży (K02: wstęp przed filmem nie miał szans zagrać).
     Gdy w miejsce atrapy wejdzie prawdziwy odtwarzacz, warunek przestanie
     go dotyczyć i zachowanie wróci samo. */
  document.querySelectorAll("[data-stops-audio]").forEach(node => {
    if (node.classList.contains("ph")) return;
    /* Etap A2 — trzy poprawki w tym jednym miejscu:
       • ŹRÓDŁO: menedżer odrzuca prośbę o ciszę od elementu, który leży
         w scenie właśnie mówiącej. Bez tego gra uciszała polecenie do
         SAMEJ SIEBIE (Tropy 3–5 milczały w trybie „Słucham");
       • DWELL 600 ms: dłuższy niż 500 ms obserwatora scen, więc narracja
         sceny zdąży ruszyć, zanim gra poprosi o ciszę;
       • ONLEAVE: blokada trwa, dopóki gra jest w kadrze — wcześniej
         zapadała raz na zawsze i kolejne sceny już nie mówiły.
       Przy okazji komunikat mówi prawdę: ten znacznik wisi także na
       kontenerach gier, a nie tylko przy filmie. */
    const gra = node.hasAttribute("data-genially") ||
                node.hasAttribute("data-frame") ||
                node.hasAttribute("data-frame-pszok");
    const komunikat = gra
      ? "Narracja wstrzymana — pracuje gra."
      : "Narracja wstrzymana — trwa odtwarzanie filmu.";
    NS.util.watch(node, {
      ratio: 0.5, dwell: 600,
      onEnter: () => NS.audio && NS.audio.suspend(komunikat, node),
      onLeave: () => NS.audio && NS.audio.resumeAllowed(),
    });
  });

  /* ═══════════════════════════════════════════
     5. K17 — TERMINAL FINAŁOWY
     Warunek podwójny: pięć ✓ ORAZ przejście obowiązkowej ścieżki.
     Uczeń nie wpisuje ponownie całego hasła.
     ═══════════════════════════════════════════ */
  const term = {
    root:    document.getElementById("k17-terminal"),
    locked:  document.getElementById("k17-locked"),
    open:    document.getElementById("k17-open"),
    missing: document.getElementById("k17-missing"),
    play:    document.getElementById("k17-play"),
    film:    document.getElementById("k17-film-wrap"),
  };

  function renderTerminal() {
    if (!term.root) return;
    const unlocked = S.recheckFinal();
    term.root.classList.toggle("is-unlocked", unlocked);
    if (term.locked) term.locked.hidden = unlocked;
    if (term.open)   term.open.hidden   = !unlocked;
    if (!unlocked && term.missing) {
      const m = S.missingForFinal();
      const parts = [];
      if (m.letters.length) parts.push(`brakujące punkty kontrolne: ${m.letters.join(", ")}`);
      const pending = m.interactions.filter(b => !m.letters.some(L =>
        (S.LETTERS.find(x => x.letter === L) || {}).block === b));
      if (pending.length) parts.push(`niedokończone zadania: ${pending.map(b => b.toUpperCase()).join(", ")}`);
      const unseen = m.blocks.filter(b => !m.interactions.includes(b));
      if (unseen.length) parts.push(`nieodwiedzone klocki: ${unseen.map(b => b.toUpperCase()).join(", ")}`);
      term.missing.textContent = parts.length
        ? "Do odblokowania brakuje — " + parts.join("; ") + "."
        : "Dokończ obowiązkową ścieżkę śledztwa.";
    }
  }

  if (term.play) {
    term.play.addEventListener("click", () => {
      if (!S.recheckFinal()) return;
      if (term.film) term.film.hidden = false;
      if (NS.audio) NS.audio.suspend("Narracja wstrzymana — trwa odtwarzanie filmu.");
      const dip = document.getElementById("k18");
      if (dip) dip.classList.add("is-available");
      ui.announce("Film finałowy odblokowany.");
    });
  }

  /* ═══════════════════════════════════════════
     6. K18 — DYPLOM (wszystko lokalnie w przeglądarce)
     ═══════════════════════════════════════════ */
  const dip = {
    form:  document.getElementById("k18-form"),
    input: document.getElementById("k18-name"),
    card:  document.getElementById("k18-card"),
    name:  document.getElementById("k18-card-name"),
    print: document.getElementById("k18-print"),
    save:  document.getElementById("k18-save"),
  };

  /* ═══ DYPLOM: MATERIAŁY UŻYTKOWNIKA I WARSTWY (Etap 6B) ═══
     Karta dyplomu to grafika tła plus trzy warstwy: imię, logotypy
     i formuła. Wszystkie pozycje podane w UŁAMKACH mastera 1054×1492,
     więc ten sam zestaw liczb obsługuje ekran i sklejanie pliku —
     pobrany dyplom nie może wyglądać inaczej niż ten na ekranie.
     Współrzędne zmierzone z pliku (skan gęstości treści wiersz po
     wierszu), nie oszacowane:
       • puste pole na imię: y 724–871 px, środek 53,4%,
       • wolny pas na stopkę: y 1240–1430 px, z gotową kreską dzielącą
         w osi (49,9%), czyli grafika sama proponuje dwie kolumny.
     Barwa pisma pobrana z napisu „DYPLOM" na dyplomie: #0d4c3a. */
  const DYPLOM = {
    szer: 1054, wys: 1492,
    /* ekran dostaje lekki WebP, sklejanie i wydruk — pełny PNG */
    tloEkran:  "../assets/images/lekcja45/18-dyplom-final/dyplom-tlo.webp",
    tloMaster: "../assets/images/lekcja45/18-dyplom-final/dyplom-tlo.png",
    kolor: "#0d4c3a",
    kolorStopki: "#1d1d1c",
    krojStopki: "Arial, 'Helvetica Neue', system-ui, sans-serif",
    krojTytul: "'Cabinet Grotesk', 'Signika', system-ui, sans-serif",
    imie:   { x: 0.5, y: 0.552, font: 0.052, maxSzer: 0.62 },
    stopka: {
      /* Wysokości podane dla CAŁEGO pliku znaku, a te mają różny margines
         wewnętrzny — dlatego wartości są dobrane tak, by ZMIERZONY ślad
         atramentu zgadzał się ze wzorem (SELEKT 95 px, WFOŚiGW 51 px),
         a nie tak, by zgadzały się same liczby w konfiguracji. */
      logoSelekt:  { x: 0.288, y: 0.838, wys: 0.071 },
      nazwa:       { x: 0.288, y: 0.921, font: 0.0101, maxSzer: 0.40, interlinia: 1.02 },
      logoWfos:    { x: 0.569, y: 0.8318, wys: 0.0672 },
      formula:     { x: 0.589, y: 0.906, font: 0.0107, interlinia: 1.05 },
    },
    nazwaLinie: ["Związek Międzygminny",
                 "„Centrum Zagospodarowania Odpadów – SELEKT”",
                 "w Czempiniu"],
    formulaLinie: ["Projekt dofinansowano ze środków",
                   "Wojewódzkiego Funduszu Ochrony",
                   "Środowiska i Gospodarki Wodnej",
                   "w Poznaniu"],
    logoSelektPlik: "../assets/logos/Logo_Selekt_2026_full%20logo.svg",
    logoWfosPlik:   "../assets/logos/wfosigw-poznan-logo.webp",
  };

  const wczytajObraz = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("nie wczytano: " + url));
    img.src = url;
  });

  /** Skleja komplet warstw w rozdzielczości mastera i oddaje plik PNG.
      Wydruk i pobranie mają dostać dokładnie to samo, co widzi uczeń. */
  async function diplomaPng(name) {
    const [tlo, logoS, logoW] = await Promise.all([
      wczytajObraz(DYPLOM.tloMaster),
      wczytajObraz(DYPLOM.logoSelektPlik),
      wczytajObraz(DYPLOM.logoWfosPlik),
    ]);
    const c = document.createElement("canvas");
    c.width = DYPLOM.szer; c.height = DYPLOM.wys;
    const g = c.getContext("2d");
    const W = c.width, H = c.height;
    g.drawImage(tlo, 0, 0, W, H);
    g.fillStyle = DYPLOM.kolor;
    g.textBaseline = "alphabetic";

    /* IMIĘ — długie skaluje się w dół, zamiast wyjść poza pole */
    let px = Math.round(DYPLOM.imie.font * H);
    const maks = W * DYPLOM.imie.maxSzer;
    g.textAlign = "center";
    g.font = "700 " + px + "px " + DYPLOM.krojTytul;
    while (g.measureText(name).width > maks && px > 22) {
      px -= 2;
      g.font = "700 " + px + "px " + DYPLOM.krojTytul;
    }
    g.fillText(name, W * DYPLOM.imie.x, H * DYPLOM.imie.y);

    /* LOGO SELEKT + pełna nazwa (kolumna lewa) */
    const s = DYPLOM.stopka;
    const hS = H * s.logoSelekt.wys;
    const wS = hS * (logoS.width / logoS.height || 1);
    g.drawImage(logoS, W * s.logoSelekt.x - wS / 2, H * s.logoSelekt.y, wS, hS);
    const pxN = Math.round(s.nazwa.font * H);
    g.fillStyle = DYPLOM.kolorStopki;
    g.font = "400 " + pxN + "px " + DYPLOM.krojStopki;
    DYPLOM.nazwaLinie.forEach((linia, i) => {
      g.fillText(linia, W * s.nazwa.x, H * s.nazwa.y + i * pxN * s.nazwa.interlinia);
    });

    /* LOGO WFOŚiGW + formuła (kolumna prawa, tekst do lewej krawędzi logo) */
    const hW = H * s.logoWfos.wys;
    const wW = hW * (logoW.width / logoW.height || 1);
    g.drawImage(logoW, W * s.logoWfos.x, H * s.logoWfos.y, wW, hW);
    g.textAlign = "left";
    const pxF = Math.round(s.formula.font * H);
    g.font = "400 " + pxF + "px " + DYPLOM.krojStopki;
    DYPLOM.formulaLinie.forEach((linia, i) => {
      g.fillText(linia, W * s.formula.x, H * s.formula.y + i * pxF * s.formula.interlinia);
    });

    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  /* ── CHOREOGRAFIA DYPLOMU (Etap 6B) ──
     imię → animacja MP4 w kadrze → ostatnia klatka zastyga → warstwa tła
     przejmuje obraz (ostatnia klatka i grafika tła to praktycznie ten sam
     kadr: proporcje 0,7056 wobec 0,7064, różnica pikseli 1,5%, więc
     przejście jest bez skoku) → imię → logotypy i formuła.

     Animacja gra WYŁĄCZNIE w trybie tablicy. W `?legacy=1`, przy
     ograniczonym ruchu i przy każdej awarii wideo dyplom pojawia się
     od razu, w komplecie — nikt nie zostaje bez dyplomu. */
  function pokazDyplom(val) {
    dip.name.textContent = val;
    dip.card.hidden = false;
    dip.print.hidden = false;
    dip.save.hidden = false;
    dip.card.setAttribute("tabindex", "-1");
    dip.card.focus({ preventScroll: true });
  }
  function gotowyDyplom(zOdslona) {
    dip.card.classList.remove("is-film");
    dip.card.classList.add(zOdslona ? "is-odslona" : "is-gotowy");
    ui.announce("Dyplom gotowy. Możesz go wydrukować lub pobrać.");
  }

  if (dip.form) {
    dip.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (dip.input.value || "").trim();
      if (!val) { dip.input.focus(); return; }
      pokazDyplom(val);

      const film = document.getElementById("k18-film");
      const wTablicy = document.body.classList.contains("bd-on");
      if (!film || !wTablicy || reduceMotion) { gotowyDyplom(false); return; }

      /* Plik nie ma ścieżki dźwiękowej (sprawdzone: jeden strumień wideo),
         więc narracji nie ma czego wyciszać — zostaje jak jest. */
      let domkniete = false;
      const domknij = () => {
        if (domkniete) return;
        domkniete = true;
        film.hidden = true;
        gotowyDyplom(true);
      };
      film.hidden = false;
      dip.card.classList.add("is-film");
      film.addEventListener("ended", domknij, { once: true });
      film.addEventListener("error", domknij, { once: true });
      /* Plik podany przez <source>: przy zerwanym pobieraniu zdarzenie
         `error` trafia najpierw do <source>, a element wideo potrafi
         milczeć aż do wyczerpania kandydatów. Stąd dwa zabezpieczenia:
         nasłuch na źródle i krótka warta — jeśli po 2,5 s nie przyszedł
         ANI JEDEN bajt, dyplom pojawia się od razu, zamiast trzymać
         ucznia przy nieruchomym kadrze. Wolne łącze nie jest awarią:
         każde `progress` i `loadedmetadata` wartę odwołuje, więc na 3G
         film spokojnie się buforuje. */
      const zrodlo = film.querySelector("source");
      if (zrodlo) zrodlo.addEventListener("error", domknij, { once: true });
      let plynie = false;
      const znak = () => { plynie = true; };
      film.addEventListener("progress", znak, { once: true });
      film.addEventListener("loadedmetadata", znak, { once: true });
      setTimeout(() => { if (!plynie && film.readyState < 2) domknij(); }, 2500);
      /* zabezpieczenie ostateczne: wideo ruszyło, ale się nie kończy */
      setTimeout(domknij, 9000);
      const p = film.play();
      if (p && typeof p.catch === "function") p.catch(domknij);
    });
  }
  if (dip.print) dip.print.addEventListener("click", () => window.print());
  if (dip.save) dip.save.addEventListener("click", async () => {
    const val = (dip.input.value || "").trim() || "Eko-Detektyw";
    const wyjscie = dip.save.textContent;
    dip.save.disabled = true;
    dip.save.textContent = "Przygotowuję plik…";
    try {
      const blob = await diplomaPng(val);
      if (!blob) throw new Error("puste płótno");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "dyplom-eko-detektyw.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      /* Zapis nie może zostawić ucznia bez wyjścia: dyplom zawsze da się
         wydrukować z ekranu, więc mówimy to wprost zamiast milczeć. */
      console.warn("[dyplom]", e);
      ui.announce("Nie udało się przygotować pliku. Dyplom możesz wydrukować przyciskiem obok.");
    } finally {
      dip.save.disabled = false;
      dip.save.textContent = wyjscie;
    }
  });

  /* ═══════════════════════════════════════════
     7. REVEAL scen (lekki, bez GSAP)
     ═══════════════════════════════════════════ */
  if (reduceMotion) {
    document.querySelectorAll(".reveal").forEach(n => n.classList.add("is-visible"));
  } else {
    document.querySelectorAll(".reveal").forEach(n => NS.util.watch(n, {
      ratio: 0.12, once: true, onEnter: () => n.classList.add("is-visible"),
    }));
  }

  /* ═══════════════════════════════════════════
     8. START
     ═══════════════════════════════════════════ */
  S.onChange(renderProgress);
  renderProgress();
  onScrollUI();
  if (NS.audio)   NS.audio.init();
  if (NS.modules) NS.modules.init();

  /* K14 uznajemy za ukończony dopiero po PRZEJŚCIU całego spaceru — znacznik
     #k14-end leży za ostatnią stacją, więc samo wejście w sekcję nie wystarczy. */
  const k14end = document.getElementById("k14-end");
  if (k14end) {
    NS.util.watch(k14end, {
      once: true,
      onEnter: () => {
        if (S.completeInteraction("k14")) ui.announce("Spacer po PSZOK-u ukończony.");
      },
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     9. K14 — SPACER PO PSZOK-u
     Implementacja przeniesiona 1:1 z zaakceptowanej lekcji
     (site/edukacja/lekcja-4-5.js). Choreografia, 14 stacji, droga,
     ruch kamery, proporcje, lazy loading i fallback bez zmian.
     Warunek startu identyczny jak w lekcji: GSAP + brak reduced-motion.
     ═══════════════════════════════════════════════════════════════ */
  if (!motionOn) {
    /* Bez GSAP / reduced-motion: kontroler nie startuje, więc obrazy stacji
       czekałyby w data-src bez końca — przywracamy src od razu (stos stoi
       w normalnym przepływie, loading="lazy" dalej ogranicza pobieranie). */
    document.querySelectorAll(".pszok-journey .pj-station__visual > img:not([src])")
      .forEach(img => { if (img.dataset.src) img.setAttribute("src", img.dataset.src); });
  } else {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

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
        /* USTERKA ZNALEZIONA W QA 5C: w trybie tablicy blok K14 czeka
           w UKRYTYM dokumencie, dopóki nie wejdzie do Tropu 7. Ukryty
           element ScrollTrigger widzi na pozycji zerowej, więc warunek
           „top bottom+=60%" spełniał się od razu — i uczeń stojący
           w CUDZYM tropie pobierał pierwsze stacje Spaceru.
           Zmierzone w Tropie 8: pięć plików, 475 KB bez żadnego pożytku.
           W `?legacy=1` klasy `bd-on` nie ma, więc wariant zielony działa
           dokładnie jak dotąd. W Tropie 7 materiał Spaceru dowozi własna
           kolejka rozdziału (grzejSpacer), niezależna od tej ścieżki. */
        if (document.body.classList.contains('bd-on')
            && section && !section.closest('.bd-chapterlay')) return;
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

      /* ── ETAP 4B.3: WYPIĘCIE SCENY Z KAMERĄ ──
         W trybie tablicy Spacer dostaje własny, pionowy układ (jedna stacja
         na ekranie, bez kamery i bez naprzemiennych stron). Ta choreografia
         musi wtedy ustąpić — razem z całą chirurgią DOM, którą robi:
         przenoszeniem tekstów i numerów do warstwy UI oraz pozycjonowaniem
         absolutnym. `mm.revert()` uruchamia sprzątanie zarejestrowane przy
         `mm.add`, czyli oddaje węzły na miejsce i zdejmuje klasę `js-pj`.
         W wariancie ?legacy=1 nikt tego nie woła — stara scena zostaje. */
      NS.spacer = Object.assign(NS.spacer || {}, {
        stop() { try { mm.revert(); } catch (e) { console.warn("[spacer]", e); } },
      });

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

        /* ── ETAP 4B: SKĄD CZYTAMY POSTĘP ──
           Na stronie lekcji przewija się OKNO i domyślny scroller jest
           poprawny. W trybie tablicy rozdział przewija WŁASNY kontener
           (`.bd-chapterlay`), więc okno stoi w miejscu, a scena zamarłaby
           na postępie 0. Konfiguracja jest jedna — zmienia się wyłącznie
           `scroller`. Choreografia, stacje, teksty i obrazy bez zmian. */
        let trig = null, primer = null;
        const zbudujTriggery = (scroller) => {
          const wspolne = scroller ? { scroller } : {};
          trig = ScrollTrigger.create(Object.assign({
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
          }, wspolne));
          primer = ScrollTrigger.create(Object.assign({
            trigger: section, start: 'top bottom+=60%', once: true, onEnter: primeJourneyAssets
          }, wspolne));
        };
        zbudujTriggery(null);

        /* Hak dla trybu tablicy: po przeniesieniu bloku do rozdziału silnik
           tablicy woła to raz, podając swój kontener przewijania. */
        NS.spacer = Object.assign(NS.spacer || {}, {
          przeniesDo(scroller) {
            if (trig) trig.kill();
            if (primer) primer.kill();
            zbudujTriggery(scroller || null);
            measure();
            lastRoadKey = '';
            ScrollTrigger.refresh();
          }
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

  }
});
