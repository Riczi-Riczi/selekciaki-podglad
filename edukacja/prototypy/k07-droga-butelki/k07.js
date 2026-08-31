/* ═══════════════════════════════════════════════════════════════
   K07 — Droga butelki (prototyp, wersja po korekcie odbiorowej)
   Czysty JS, bez zależności. Jeden stan gry, jeden zestaw pól DOM.
   Automat faz: arranging → readyToCheck → checking →
                (needsCorrection → …) → completed
   Kontrakt: zero localStorage / postMessage; po sukcesie dokładnie
   jedno zdarzenie `k07:completed` (window, bubbles).
   Brak dowolnego pliku audio NIGDY nie blokuje układanki.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const IMG = "../../../assets/images/lekcja45/07-droga-butelki/";
  const SND = "../../../assets/sound/";

  /* ── KONFIGURACJA AUDIO — jedyne miejsce ze ścieżkami ── */
  const AUDIO_CFG = {
    src: {
      click:    SND + "click_sound_v1.mp3",
      negative: SND + "Short_negative_feedb_mashine.mp3",
      positive: SND + "Postitive-way-maschine-accept.mp3",
      /* dźwięk pracy maszyny w fazie sprawdzania; jeśli plik zniknie,
         faza checking przebiega bez niego (sam timing wizualny) */
      machine:  SND + "k07-machine-check.mp3",
    },
    machineCapMs: 2600,   // twardy limit fazy checking z dźwiękiem maszyny
    minCheckMs:   900,    // minimalny czas fazy checking bez dźwięku
  };

  /* Jedna tablica konfiguracyjna sześciu kroków. */
  const STEPS = [
    { id: 1, img: "karta-01-rejestracja-aplikacja.webp",
      label: "Zarejestruj się w aplikacji z pomocą osoby dorosłej" },
    { id: 2, img: "karta-02-odbior-pustej-butelki.webp",
      label: "Odbierz pustą butelkę w Olejomacie" },
    { id: 3, img: "karta-03-zabranie-butelki-do-domu.webp",
      label: "Zabierz butelkę do domu" },
    { id: 4, img: "karta-04-przelanie-ostygnietego-oleju.webp",
      label: "Przelej ostygnięty olej z pomocą osoby dorosłej" },
    { id: 5, img: "karta-05-zakrecenie-butelk.webp",
      label: "Dokładnie zakręć butelkę" },
    { id: 6, img: "karta-06-oddanie-butelki-do-olejomatu.webp",
      label: "Oddaj pełną butelkę do Olejomatu" },
  ];
  const N = STEPS.length;

  /* ── KOMUNIKATY EKRANU KONSOLI (wizualne) + sr ── */
  const MSG = {
    start:    "Ułóż sześć kart we właściwej kolejności.",
    full:     "Wszystkie karty są na planszy. Kliknij lupę.",
    checking: "Sprawdzam kolejność…",
    wrong:    "Część drogi jest poprawna. Przestaw pozostałe karty.",
    done:     "Droga butelki gotowa!",
    readySr:  "Wszystkie karty są na planszy. Możesz sprawdzić kolejność lupą.",
    /* wezwanie w miejscu pustego banku (Etap 2B.2) */
    bankReady: "Wszystkie karty są już na planszy. Naciśnij pulsującą lupę " +
               "na terminalu, aby sprawdzić, czy droga butelki do Olejomatu " +
               "jest ułożona prawidłowo.",
    bankWrong: "Część drogi jest już poprawna. Przestaw karty oznaczone " +
               "krzyżykiem, a potem sprawdź kolejność jeszcze raz.",
  };

  const el = {
    root:     document.getElementById("k07"),
    board:    document.getElementById("k07-board"),
    boardImg: document.getElementById("k07-board-img"),
    slots:    document.getElementById("k07-slots"),
    bank:     document.getElementById("k07-bank"),
    lens:     document.getElementById("k07-lens"),
    console:  document.getElementById("k07-console"),
    feedback: document.getElementById("k07-feedback"),
    glows:    Array.from(document.querySelectorAll(".k07-glow")),
    lampWarn: document.querySelector(".k07-lampfx--warn"),
    lampOk1:  document.querySelector(".k07-lampfx--ok1"),
    lampOk2:  document.querySelector(".k07-lampfx--ok2"),
    dialog:      document.getElementById("k07-dialog"),
    dialogTitle: document.getElementById("k07-dialog-title"),
    dialogClose: document.getElementById("k07-dialog-close"),
    diag:     document.getElementById("k07-diag"),
    bankInfo:    document.getElementById("k07-bank-info"),
    bankInfoTxt: document.getElementById("k07-bank-info-txt"),
    showLens:    document.getElementById("k07-show-lens"),
  };

  /* ── STAN ──
     slots[n]     = id kroku w polu n (1..6) albo null
     locked       = id kroków zablokowanych jako poprawne
     selected     = { stepId, from: "bank" | slotNo } albo null
     phase        = arranging|readyToCheck|checking|needsCorrection|completed
     lastWrongSig = sygnatura ostatniego błędnego układu (blokada
                    ponownego sprawdzenia identycznego układu)
     runToken     = unieważnia timery ozdobne poprzednich przebiegów   */
  const state = {
    slots: {},
    locked: new Set(),
    selected: null,
    phase: "arranging",
    lastWrongSig: null,
    runToken: 0,
    completionSent: false,
    finished: false,
  };
  for (let i = 1; i <= N; i++) state.slots[i] = null;

  const cardEls = {};   // stepId → element karty
  const slotEls = {};   // slotNo → element pola

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ═══ MENEDŻER SFX — jedna instancja Audio na dźwięk ═══ */
  const sfx = { pool: {}, log: [] };
  function sfxGet(name) {
    if (!(name in sfx.pool)) {
      const a = new Audio(AUDIO_CFG.src[name]);
      a.preload = "auto";
      a.addEventListener("error", () => { a.dataset.failed = "1"; }, { once: true });
      sfx.pool[name] = a;
    }
    return sfx.pool[name];
  }
  function sfxStop(name) {
    const a = sfx.pool[name];
    if (!a) return;
    try { a.pause(); a.currentTime = 0; } catch (e) { /* np. przed metadanymi */ }
  }
  /* dźwięki wyniku/maszyny nie mogą się nakładać — przed odtworzeniem
     zatrzymaj i przewiń pozostałe z tej grupy */
  const EXCLUSIVE = ["machine", "negative", "positive"];
  function sfxPlay(name) {
    if (EXCLUSIVE.includes(name)) EXCLUSIVE.forEach(sfxStop);
    const a = sfxGet(name);
    if (a.dataset.failed === "1") return null;
    try { a.currentTime = 0; } catch (e) { /* jw. */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    sfx.log.push(name);
    return a;
  }

  /* ── KOMUNIKATY ── */
  function announce(msg) { el.feedback.textContent = msg; }   // sr-only aria-live
  function setConsole(msg) { el.console.textContent = msg; }  // ekran konsoli

  function diag(msg) {
    el.diag.textContent = msg;
    el.diag.classList.remove("is-hidden");
  }

  /* ── FAZY I LUPA ── */
  const LENS_STATE = {
    arranging: "idle", readyToCheck: "ready", checking: "checking",
    needsCorrection: "needsCorrection", completed: "completed",
  };
  function setPhase(p) {
    state.phase = p;
    el.lens.dataset.state = LENS_STATE[p];
    /* completed zostaje fokusowalne (powrót fokusu z dialogu);
       klik w completed jest neutralny — runCheck pilnuje fazy */
    el.lens.disabled = (p === "arranging" || p === "checking" || p === "needsCorrection");
    odswiezWezwanie();
  }

  /* ── WEZWANIE DO LUPY W MIEJSCU PUSTEGO BANKU (Etap 2B.2) ──
     Jeden element sterowany wyłącznie z `setPhase`, więc wielokrotne
     przejścia między fazami nie tworzą duplikatów. Element NIE jest
     regionem aria-live — treść dla czytnika ekranu ogłasza istniejący
     `#k07-feedback`, żeby ten sam komunikat nie zabrzmiał dwa razy. */
  let lupaWidocznoscTimer = 0;

  /* Czy lupa jest w kadrze? W osadzeniu (?embed=board) iframe jest
     rozprężony do pełnej wysokości treści, więc jego własny viewport
     „widzi" wszystko — realny kadr wyznacza okno RODZICA. Liczymy więc
     względem `window.frameElement` (ta sama domena). */
  function lupaWKadrze() {
    const r = el.lens.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;      /* brak layoutu */
    try {
      const ramka = window.frameElement;
      if (ramka) {
        const fr = ramka.getBoundingClientRect();
        const okno = ramka.ownerDocument.defaultView;
        /* pozycja lupy w układzie współrzędnych rodzica */
        return (fr.top + r.bottom) > 8 && (fr.top + r.top) < okno.innerHeight - 8;
      }
    } catch (e) { /* inna domena — zostajemy przy własnym viewporcie */ }
    return r.bottom > 8 && r.top < window.innerHeight - 8;
  }

  function odswiezWezwanie() {
    if (!el.bankInfo) return;
    const p = state.phase;
    const pokaz = (p === "readyToCheck" || p === "needsCorrection");
    clearInterval(lupaWidocznoscTimer);
    lupaWidocznoscTimer = 0;

    if (!pokaz) {
      el.bankInfo.hidden = true;
      el.bankInfo.setAttribute("aria-hidden", "true");
      if (el.showLens) el.showLens.hidden = true;
      return;
    }
    el.bankInfoTxt.textContent = p === "readyToCheck" ? MSG.bankReady : MSG.bankWrong;
    el.bankInfo.classList.toggle("is-correction", p === "needsCorrection");
    el.bankInfo.hidden = false;
    el.bankInfo.setAttribute("aria-hidden", "false");

    /* „Pokaż lupę" tylko wtedy, gdy lupa NIE jest w kadrze (na desktopie
       zwykle widać ją razem z komunikatem, więc przycisk pozostaje ukryty).
       Sprawdzamy cyklicznie — bez wieszania listenerów na oknie rodzica,
       które przeżyłyby przeładowanie ramki. */
    const sprawdz = () => {
      if (!el.showLens) return;
      el.showLens.hidden = lupaWKadrze();
    };
    sprawdz();
    lupaWidocznoscTimer = setInterval(sprawdz, 600);
  }

  function signature() {
    let s = "";
    for (let no = 1; no <= N; no++) s += (state.slots[no] ?? 0) + ",";
    return s;
  }

  /* po każdej zmianie układu: wyznacz fazę i komunikat konsoli */
  function refreshPhase() {
    if (state.phase === "checking" || state.phase === "completed") return;
    if (filledCount() < N) {
      setPhase("arranging");
      setConsole(MSG.start);
      return;
    }
    if (state.lastWrongSig !== null && signature() === state.lastWrongSig) {
      /* identyczny błędny układ — lupa śpi, dopóki błędna karta się nie ruszy */
      setPhase("needsCorrection");
      setConsole(MSG.wrong);
      return;
    }
    const wasReady = state.phase === "readyToCheck";
    setPhase("readyToCheck");
    setConsole(MSG.full);
    if (!wasReady) announce(MSG.readySr);
  }

  function uiLocked() {
    return state.finished || state.phase === "checking";
  }

  /* ── TASOWANIE z gwarancją: układ startowy banku ≠ 1..6 ── */
  function shuffledSteps() {
    const arr = STEPS.slice();
    do {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } while (arr.every((s, i) => s.id === i + 1));
    return arr;
  }

  /* ── BUDOWA DOM ── */
  function buildSlots() {
    for (let no = 1; no <= N; no++) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "k07-slot";
      slot.dataset.step = String(no);
      slot.setAttribute("aria-label", `Pole ${no} z ${N}, puste`);

      const num = document.createElement("span");
      num.className = "k07-slot__no";
      num.textContent = String(no);
      num.setAttribute("aria-hidden", "true");

      const mark = document.createElement("span");
      mark.className = "k07-slot__mark";
      mark.setAttribute("aria-hidden", "true");

      slot.append(num, mark);
      slot.addEventListener("click", () => onSlotActivate(no));
      slot.addEventListener("dragover", (e) => {
        if (uiLocked()) return;
        e.preventDefault();
      });
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        if (uiLocked()) return;
        const stepId = Number(e.dataTransfer.getData("text/plain"));
        if (!stepId || state.locked.has(stepId)) return;
        state.selected = { stepId, from: findCard(stepId) };
        placeSelectedInto(no);
      });
      el.slots.appendChild(slot);
      slotEls[no] = slot;
    }
  }

  function buildCards() {
    for (const step of shuffledSteps()) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "k07-card";
      card.dataset.stepId = String(step.id);
      card.setAttribute("aria-label", step.label);
      card.setAttribute("aria-pressed", "false");
      card.draggable = true;

      const img = document.createElement("img");
      img.className = "k07-card__img";
      img.src = IMG + step.img;
      img.alt = "";
      img.addEventListener("error", () => {
        card.classList.add("img-failed");
        diag("Nie udało się wczytać obrazka karty. Układanka działa dalej w wersji tekstowej.");
      }, { once: true });

      const label = document.createElement("span");
      label.className = "k07-card__label";
      label.textContent = step.label;

      const sel = document.createElement("span");
      sel.className = "k07-card__sel";
      sel.textContent = "wybrana";

      card.append(img, label, sel);
      card.addEventListener("click", (e) => {
        e.stopPropagation();          // klik w kartę w polu ≠ klik w pole
        onCardActivate(step.id);
      });
      card.addEventListener("dragstart", (e) => {
        if (uiLocked() || state.locked.has(step.id)) { e.preventDefault(); return; }
        e.dataTransfer.setData("text/plain", String(step.id));
        e.dataTransfer.effectAllowed = "move";
        selectCard(step.id);          // drag = wybór (spójny stan)
      });
      el.bank.appendChild(card);
      cardEls[step.id] = card;
    }
  }

  /* ── POMOCNICZE ── */
  function findCard(stepId) {       // "bank" | numer pola
    for (let no = 1; no <= N; no++) if (state.slots[no] === stepId) return no;
    return "bank";
  }

  function slotOf(stepId) {
    const at = findCard(stepId);
    return at === "bank" ? null : at;
  }

  function filledCount() {
    let c = 0;
    for (let no = 1; no <= N; no++) if (state.slots[no] !== null) c++;
    return c;
  }

  function labelOf(stepId) {
    return STEPS.find(s => s.id === stepId).label;
  }

  function updateSlotAria(no) {
    const stepId = state.slots[no];
    const base = `Pole ${no} z ${N}`;
    if (stepId === null) {
      slotEls[no].setAttribute("aria-label", `${base}, puste`);
    } else if (state.locked.has(stepId)) {
      slotEls[no].setAttribute("aria-label", `${base}: ${labelOf(stepId)} — poprawne, zablokowane`);
    } else {
      slotEls[no].setAttribute("aria-label", `${base}: ${labelOf(stepId)}`);
    }
  }

  /* Punkt wpięcia klipów głosowych kart (Etap A4): prototyp mówi tylko, KTÓRA
     karta została wybrana — odtwarzanie należy do strony lekcji i wyłącznie
     do trybu z narracją. Bez rodzica zdarzenie nie ma odbiorcy i nic nie robi. */
  function emitCard(stepId) {
    try {
      window.dispatchEvent(new CustomEvent("k07:card", {
        bubbles: true,
        detail: { id: stepId, label: labelOf(stepId) },
      }));
    } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
  }

  /* ── WYBÓR KARTY ── */
  function selectCard(stepId) {
    if (uiLocked() || state.locked.has(stepId)) return;
    /* Chwycenie karty, która JUŻ jest wybrana (klik → drag), nie zaczyna
       nagrania od nowa — uczeń usłyszał podpis sekundę wcześniej. Sprawdzamy
       przed `deselect`, bo ono kasuje `state.selected`. */
    const juzWybrana = !!(state.selected && state.selected.stepId === stepId);
    deselect(true);
    if (!juzWybrana) emitCard(stepId);
    state.selected = { stepId, from: findCard(stepId) };
    cardEls[stepId].classList.add("is-selected");
    cardEls[stepId].setAttribute("aria-pressed", "true");
    const s = slotOf(stepId);
    if (s) slotEls[s].classList.add("is-selected");
    el.root.classList.add("k07--placing");
    announce(`Wybrano kartę: ${labelOf(stepId)}. Wskaż pole 1–${N}` +
      (s ? " albo inne pole, aby zamienić karty." : "."));
  }

  function deselect(cicho) {
    if (!state.selected) return;
    const { stepId } = state.selected;
    cardEls[stepId].classList.remove("is-selected");
    cardEls[stepId].setAttribute("aria-pressed", "false");
    const s = slotOf(stepId);
    if (s) slotEls[s].classList.remove("is-selected");
    state.selected = null;
    el.root.classList.remove("k07--placing");
    if (!cicho) announce("Wybór anulowany.");
  }

  function onCardActivate(stepId) {
    if (uiLocked()) return;
    /* Karta ułożona poprawnie jest zablokowana i tak zostaje — ale klik w nią
       ma prawo PRZYPOMNIEĆ jej treść. Mechanika bez zmian: dalej nie da się
       jej ruszyć, wyjście z funkcji następuje tak jak dotąd. */
    if (state.locked.has(stepId)) { emitCard(stepId); return; }
    if (state.selected && state.selected.stepId === stepId) { deselect(); return; }
    if (state.selected) {
      const target = slotOf(stepId);
      if (target) { placeSelectedInto(target); return; }
    }
    selectCard(stepId);
  }

  function onSlotActivate(no) {
    if (uiLocked()) return;
    const occupant = state.slots[no];
    if (state.selected) { placeSelectedInto(no); return; }
    if (occupant !== null && !state.locked.has(occupant)) selectCard(occupant);
  }

  /* ── UMIESZCZANIE: bank→pole, pole→pole (zamiana), bank→zajęte ──
     Dokładnie JEDEN dźwięk kliknięcia na udane umieszczenie
     (zamiana = też jeden). Wybór/anulowanie/odrzucenie — bez dźwięku. */
  function placeSelectedInto(no) {
    if (uiLocked()) { state.selected = null; return; }   // twarda blokada w checking/completed
    const { stepId, from } = state.selected;
    const occupant = state.slots[no];

    if (occupant !== null && state.locked.has(occupant)) {
      announce("To pole jest już poprawnie ułożone i zablokowane. Wybierz inne pole.");
      return;                                       // odrzucone — bez dźwięku
    }
    deselect(true);
    if (occupant === stepId) {                       // pole bez zmiany — bez dźwięku
      announce(`Karta zostaje w polu ${no}.`);
      return;
    }

    if (from !== "bank") state.slots[from] = null;

    if (occupant !== null) {
      if (from !== "bank") {
        state.slots[from] = occupant;               // zamiana miejscami
        putCardInSlot(occupant, from);
      } else {
        putCardInBank(occupant);                    // wraca do banku
      }
    }

    state.slots[no] = stepId;
    putCardInSlot(stepId, no);
    sfxPlay("click");                                // jeden dźwięk na ruch

    if (occupant !== null && from !== "bank") {
      announce(`Zamieniono karty w polach ${from} i ${no}.`);
      updateSlotAria(from);
    } else if (occupant !== null) {
      announce(`Karta „${labelOf(stepId)}" trafiła do pola ${no}; poprzednia wróciła do banku.`);
    } else {
      announce(`Karta „${labelOf(stepId)}" trafiła do pola ${no}.`);
      if (from !== "bank") updateSlotAria(from);
    }
    updateSlotAria(no);
    refreshPhase();
  }

  function putCardInSlot(stepId, no) {
    slotEls[no].appendChild(cardEls[stepId]);
    slotEls[no].classList.remove("is-wrong");
  }

  function putCardInBank(stepId) {
    el.bank.appendChild(cardEls[stepId]);
  }

  /* ═══ SPRAWDZANIE — lupa ═══
     readyToCheck → checking (blokada kart i lupy, „Sprawdzam kolejność…",
     bursztynowy skan, dźwięk maszyny) → po `ended` LUB po limicie czasu
     ocena → NEGATYWNY albo POZYTYWNY dźwięk → odblokowanie/finał.       */
  function runCheck() {
    if (state.phase !== "readyToCheck") return;      // szybkie kliki, zła faza
    const token = ++state.runToken;
    setPhase("checking");
    deselect(true);
    setConsole(MSG.checking);
    announce(MSG.checking);
    el.root.classList.add("k07--checking");
    el.glows.forEach(g => g.classList.add("is-scan"));

    let done = false;
    let capTimer = null;
    const finish = () => {
      if (done || token !== state.runToken) return;
      done = true;
      if (capTimer) clearTimeout(capTimer);
      el.root.classList.remove("k07--checking");
      el.glows.forEach(g => g.classList.remove("is-scan"));
      evaluate(token);
    };

    const machine = sfxPlay("machine");
    if (machine) {
      machine.addEventListener("ended", finish, { once: true });
      capTimer = setTimeout(finish, AUDIO_CFG.machineCapMs);
    } else {
      /* brak dźwięku maszyny: sam minimalny czas wizualny */
      capTimer = setTimeout(finish, AUDIO_CFG.minCheckMs);
    }
  }

  function evaluate(token) {
    let correct = 0;
    let firstWrong = null;
    for (let no = 1; no <= N; no++) {
      const stepId = state.slots[no];
      const ok = stepId === no;
      const slot = slotEls[no];
      slot.classList.toggle("is-correct", ok);
      slot.classList.toggle("is-wrong", !ok);
      slot.querySelector(".k07-slot__mark").textContent = ok ? "✓" : "✕";
      if (ok) {
        correct++;
        state.locked.add(stepId);
        slot.classList.add("is-locked");
        cardEls[stepId].setAttribute("aria-disabled", "true");
        cardEls[stepId].draggable = false;
      } else if (!firstWrong) {
        firstWrong = slot;
      }
      updateSlotAria(no);
    }

    if (correct === N) { onSuccess(token); return; }

    /* ── WYNIK NEGATYWNY ── */
    sfxPlay("negative");
    state.lastWrongSig = signature();
    setPhase("needsCorrection");
    setConsole(MSG.wrong);
    announce(`Część drogi jest poprawna (${correct} z ${N}). Przestaw pozostałe karty.`);
    /* krótka poświata lampy ostrzegawczej (komunikat NIE jest tylko kolorem:
       jest też tekst na konsoli, znaczki ✕ i dźwięk) */
    el.lampWarn.classList.add("is-on");
    setTimeout(() => {
      if (token === state.runToken) el.lampWarn.classList.remove("is-on");
    }, 1500);
    if (firstWrong) {
      const card = firstWrong.querySelector(".k07-card");
      (card || firstWrong).focus();
    }
  }

  /* ── SUKCES ── */
  function onSuccess(token) {
    state.finished = true;
    setPhase("completed");
    setConsole(MSG.done);
    announce(MSG.done);
    el.root.classList.remove("k07--placing");
    Object.values(slotEls).forEach(s => s.classList.remove("is-wrong"));
    sfxPlay("positive");

    const lightLamps = () => {
      el.lampOk1.classList.add("is-on");
      el.lampOk2.classList.add("is-on");
    };
    if (reduceMotion()) {
      /* czytelny stan statyczny: cała trasa + zielone kontrolki naraz */
      el.glows.forEach(g => g.classList.add("is-lit"));
      lightLamps();
      openDialog(token, 200);
    } else {
      /* bursztynowa trasa zapala się kolejno 1→6, potem zielone kontrolki */
      el.glows.forEach((g, i) => setTimeout(() => {
        if (token === state.runToken) g.classList.add("is-lit");
      }, 250 + i * 320));
      setTimeout(() => { if (token === state.runToken) lightLamps(); },
        250 + el.glows.length * 320);
      openDialog(token, 350 + el.glows.length * 320);
    }

    finalizeCompletion();
  }

  /* ── DIALOG SUKCESU (zamykalny; zamknięcie NIE resetuje stanu) ── */
  function openDialog(token, delayMs) {
    setTimeout(() => {
      if (token !== state.runToken) return;
      if (!el.dialog || el.dialog.open) return;      // brak wielokrotnego otwarcia
      if (typeof el.dialog.showModal !== "function") return; // stary silnik: stan
      try { el.dialog.showModal(); } catch (e) { return; }   // i tak jest na planszy
      el.dialogTitle.focus();
    }, delayMs);
  }

  /* jedna funkcja finalizująca — emisja DOKŁADNIE raz */
  function finalizeCompletion() {
    if (state.completionSent) return;
    state.completionSent = true;
    try {
      window.dispatchEvent(new CustomEvent("k07:completed", {
        bubbles: true,
        detail: { completedSteps: N, totalSteps: N },
      }));
    } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
  }

  /* Etap T5.1: nagranie polecenia NIE należy już do prototypu.
     Scena K07 w lekcji ma zwykłą narrację sceny (data-audio-src), więc
     układanka nie prowadzi drugiego, własnego odtwarzacza — jeden kanał
     dźwięku na całą lekcję. Przycisk, jego style i obsługa usunięte. */

  /* ── KLAWIATURA GLOBALNIE: Escape anuluje wybór ── */
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") deselect();
  });

  /* ── PLANSZA: awaria obrazu nie blokuje układanki ── */
  el.boardImg.addEventListener("error", () => {
    el.board.classList.add("img-failed");
    diag("Nie udało się wczytać planszy. Pola i karty działają dalej.");
  }, { once: true });

  el.lens.addEventListener("click", runCheck);
  /* „Pokaż lupę": WYŁĄCZNIE przewinięcie i fokus — nie uruchamia
     sprawdzania, nie zmienia układu kart, nie emituje k07:completed.

     W osadzeniu `scrollIntoView` nie wystarcza: iframe jest rozprężony do
     pełnej wysokości treści, więc „wyśrodkowanie" liczone jest względem
     jego własnego viewportu, a nie realnego kadru rodzica. Dlatego przy
     osadzeniu szukamy przewijalnego przodka ramki (same-origin) i sami
     ustawiamy jego pozycję tak, aby lupa znalazła się na środku kadru. */
  function przewinDoLupy() {
    const zachowanie = reduceMotion() ? "auto" : "smooth";
    let ramka = null;
    try { ramka = window.frameElement; } catch (e) { ramka = null; }
    if (!ramka) {
      try { el.lens.scrollIntoView({ behavior: zachowanie, block: "center" }); }
      catch (e) { el.lens.scrollIntoView(); }
      return;
    }
    const doc = ramka.ownerDocument;
    const okno = doc.defaultView;
    const lr = el.lens.getBoundingClientRect();
    const fr = ramka.getBoundingClientRect();
    /* środek lupy w układzie współrzędnych rodzica → środek jego kadru */
    const delta = (fr.top + lr.top + lr.height / 2) - okno.innerHeight / 2;
    /* najbliższy przewijalny przodek ramki; gdy brak — przewija okno */
    let n = ramka.parentElement, port = null;
    while (n && n !== doc.documentElement) {
      const cs = okno.getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) { port = n; break; }
      n = n.parentElement;
    }
    if (!port) {
      try { okno.scrollBy({ top: delta, behavior: zachowanie }); }
      catch (e) { okno.scrollBy(0, delta); }
      return;
    }
    const cel = Math.max(0, Math.min(port.scrollTop + delta, port.scrollHeight - port.clientHeight));
    try { port.scrollTo({ top: cel, behavior: zachowanie }); }
    catch (e) { port.scrollTop = cel; }
  }

  if (el.showLens) {
    el.showLens.addEventListener("click", () => {
      /* Rodzic może w tym momencie trzymać scenę przypiętą (przejście
         Faza A → K07 w rozdziale P05): pierwsze przewinięcie zwalnia pin,
         a dopiero kolejne realnie przesuwa grę. Dlatego korygujemy kilka
         razy, aż lupa znajdzie się w kadrze — i dopiero wtedy fokus. */
      przewinDoLupy();
      let proby = 0;
      const dostroj = () => {
        if (++proby > 3 || lupaWKadrze()) {
          el.lens.focus({ preventScroll: true });
          return;
        }
        przewinDoLupy();
        setTimeout(dostroj, 420);
      };
      setTimeout(dostroj, 460);
    });
  }
  el.dialogTitle.setAttribute("tabindex", "-1");
  el.dialogClose.addEventListener("click", () => el.dialog.close());
  /* Escape → natywny `cancel` → `close`; fokus wraca na lupę */
  el.dialog.addEventListener("close", () => { el.lens.focus(); });

  /* ── START ── */
  buildSlots();
  buildCards();
  setPhase("arranging");
  setConsole(MSG.start);
  announce(`Ułóż ${N} kart w kolejności od 1 do ${N}.`);

  /* Hak deweloperski WYŁĄCZNIE za ?dev=1 — testy przebiegu bez UI */
  if (new URLSearchParams(location.search).get("dev") === "1") {
    window.K07_DEV = {
      place(stepId, no) {
        if (state.locked.has(stepId)) return false;
        state.selected = { stepId, from: findCard(stepId) };
        placeSelectedInto(no);
        return true;
      },
      select: selectCard,
      deselect: () => deselect(),
      check: runCheck,
      sfxLog: () => sfx.log.slice(),
      state() {
        return {
          slots: { ...state.slots },
          locked: Array.from(state.locked),
          selected: state.selected ? { ...state.selected } : null,
          filled: filledCount(),
          phase: state.phase,
          lensState: el.lens.dataset.state,
          lensDisabled: el.lens.disabled,
          console: el.console.textContent,
          lastWrongSig: state.lastWrongSig,
          dialogOpen: !!(el.dialog && el.dialog.open),
          bankInfo: {
            widoczny: !!(el.bankInfo && !el.bankInfo.hidden),
            tekst: el.bankInfoTxt ? el.bankInfoTxt.textContent : "",
            pokazLupe: !!(el.showLens && !el.showLens.hidden),
          },
          finished: state.finished,
          completionSent: state.completionSent,
          bankOrder: Array.from(el.bank.querySelectorAll(".k07-card"))
            .map(c => Number(c.dataset.stepId)),
        };
      },
    };
  }
})();
