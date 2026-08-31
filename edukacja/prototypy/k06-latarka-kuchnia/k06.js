/* ═══════════════════════════════════════════════════════════════════
   „Przeszukanie kuchni” — gra śledcza e-lekcji SELEKT (klasy 4–5)
   Klocek K06, Trop 4. Zastępuje moduł Genially „Przeszukanie kuchni”.

   Uczeń prowadzi latarkę po ciemnym kadrze kuchni i odnajduje pięć
   śladów. Bez limitu czasu, bez przegranej — to śledztwo, nie zręcznościówka.

   KONTRAKT INTEGRACYJNY (patrz README):
     • po piątym śladzie: `k06:completed` na `window`, bubbles, DOKŁADNIE RAZ
       detail: { letter: "S", foundTraces: 5, totalTraces: 5 }
     • przy każdym odkryciu: `k06:trace` na `window`, detail: { id, label }
       — punkt wpięcia przyszłych klipów głosowych; gra sama nic nie odtwarza
     • gra NIE przyznaje litery i niczego nie zapisuje — literę S zapisuje
       strona lekcji (lesson-state.js: unlockLetterEntry)

   Zero zależności. Jedna pętla requestAnimationFrame.
   ═══════════════════════════════════════════════════════════════════ */

"use strict";

/* ══════════════ 1. PIĘĆ ŚLADÓW ══════════════
   Współrzędne i promienie w PROCENTACH kadru (x, r — względem szerokości;
   y — względem wysokości). Odczytane z renderu 2752×1536; do dostrojenia
   w trybie ?debug=1, który pokazuje obrysy i pozycję pod kursorem.

     x, y        — środek pola trafienia (tam musi stanąć środek plamy)
     r           — promień pola trafienia
     revealX/Y   — środek obszaru, który zostaje rozjaśniony (gdy inny niż pole)
     revealR     — promień rozjaśnienia w „pamięci” latarki
     pinX/pinY   — miejsce pinezki (gdy inne niż środek pola)
     needsDoor   — ślad wymaga wcześniejszego otwarcia szafki
     doorX/doorY — miejsce etykiety „Otwórz” (przy klamce)                */

const TRACES = [
  {
    id: 1,
    x: 71.5, y: 52.4, r: 4.6,
    revealR: 6.4,
    label: "Butelka na zużyty olej",
    text: "Zużyty olej ma tu swoje miejsce — szczelną butelkę, która pojedzie do Olejomatu.",
  },
  {
    id: 2,
    x: 57.5, y: 52.9, r: 4.2,
    revealR: 6.0,
    label: "Lejek przy zlewie",
    text: "Lejek znaczy jedno: olej przelewa się do butelki, nie do zlewu.",
  },
  {
    id: 3,
    x: 63.0, y: 72.5, r: 7.5,
    revealX: 61.5, revealY: 74.5, revealR: 12.5,
    pinX: 61.5, pinY: 74.5,
    needsDoor: true, doorX: 63.5, doorY: 62.5,
    label: "Kosze pod zlewem",
    text: "Pięć pojemników pod zlewem — ten dom segreguje na co dzień.",
  },
  {
    id: 4,
    x: 82.6, y: 50.6, r: 5.2,
    revealR: 7.6,
    label: "Plakat o segregacji",
    text: "Ściągawka segregacji. Ktoś tu sprawdza, co gdzie wrzucić.",
  },
  {
    id: 5,
    x: 83.4, y: 20.5, r: 4.2,
    revealR: 5.8,
    label: "Pudełko z bateriami",
    text: "Zużyte baterie czekają na punkt zbiórki, nie w koszu.",
  },
];

/* ══════════════ 2. KONFIGURACJA ══════════════ */

const CONFIG = {
  /* Odkrywanie */
  dwellMs: 350,             // ile trzeba przytrzymać światło na śladzie
  doorFadeMs: 400,          // crossfade renderu z otwartą szafką
  hintAfterMs: 45000,       // po tylu ms bez postępu pulsuje nieodkryty ślad

  /* Plama światła — promień liczony od SZEROKOŚCI KADRU, nie okna:
     zapis w vw dałby na telefonie plamę oderwaną od wielkości kadru.
     KOREKTA K06.1: każda z trzech wartości o połowę mniejsza niż w pierwszej
     wersji (0.16 / 64 / 190) — światło ma być snopem, nie reflektorem.
     Miękkie zejście krawędzi skaluje się razem z promieniem, inaczej stałe
     60 px zjadłoby połowę zmniejszenia. */
  spotRatio: 0.08,
  spotMin: 32,
  spotMax: 95,
  spotFadeRatio: 0.324,     // proporcja krawędzi zachowana z wersji 1 (60/185)
  spotFadeMin: 18,
  spotFadeMax: 62,

  /* Klawiatura: jedno naciśnięcie = krok, przytrzymanie = płynny ruch.
     To sterowanie, nie animacja — `prefers-reduced-motion` go nie zmienia. */
  keyStepRatio: 0.045,      // krok = 4,5% szerokości kadru
  keyHoldDelayMs: 140,      // dopiero po tym czasie zaczyna się ruch ciągły
  keyRampMs: 300,           // czas rozpędzania do pełnej prędkości
  keyRampStart: 0.35,       // prędkość startowa (× moveSpeed)
  moveSpeed: 0.62,          // pełna prędkość: ułamek szerokości kadru na sekundę

  /* Latarka (proporcje i punkt soczewki odczytane z assets/images/latarka.webp) */
  /* KOREKTA K06.2: latarka zmniejszona z 0.21 / 96 px — po zmniejszeniu plamy
     była szersza niż własne światło i zasłaniała to, co oświetla. */
  torchRatio: 0.15,         // szerokość latarki jako ułamek szerokości kadru
  torchMinPx: 70,
  torchMaxPx: 260,
  torchAspect: 5744 / 6035, // wysokość / szerokość
  lensX: 0.86,              // punkt soczewki w obrazie latarki
  lensY: 0.20,
  beamAngleDeg: -39,        // latarka świeci w prawo i w górę
  /* Przy lewej krawędzi latarka wjeżdżałaby poza kadr — wtedy ją odbijamy.
     Dwa progi = histereza, żeby nie migotała na granicy. */
  mirrorOn: 0.26,
  mirrorOff: 0.34,

  /* Grafiki. Po podmianie plików wystarczy zmienić ścieżki niżej.
     Gdy `kitchen`/`torch` = false (albo plik się nie wczyta), działa
     wbudowany zastępnik CSS/SVG — gra nie przestaje działać ani na chwilę. */
  useImages: { kitchen: true, torch: true },
  images: {
    closed: "assets/images/kuchnia-1760.webp",
    open: "assets/images/kuchnia-szafka-otwarta-1760.webp",
    torch: "assets/images/latarka-900.webp",
  },
};

const REWARD_LETTER = "S";

/* ══════════════ 3. STAN ══════════════ */

const state = {
  mode: "intro",            // intro | search | final
  found: [],                // id odkrytych śladów, w kolejności odkrycia
  doorOpen: false,
  finished: false,
  completionSent: false,    // k06:completed emitowane tylko raz

  spot: { x: 0, y: 0 },     // środek plamy w px kadru
  keys: { left: false, right: false, up: false, down: false },
  keyHold: { left: 0, right: 0, up: 0, down: 0 },
  mirror: false,

  dwellId: null,
  dwellMs: 0,
  hintedId: null,
  cardTraceId: null,
};

const metrics = { W: 0, H: 0, r: 0, rFade: 0, torchW: 0, torchH: 0 };

const EMBEDDED = (() => {
  try { return window.parent !== window; } catch (e) { return true; }
})();

const DEBUG = (() => {
  try { return new URLSearchParams(location.search).get("debug") === "1"; }
  catch (e) { return false; }
})();

/* ?mock=1 — podgląd wbudowanego zastępnika CSS/SVG bez ruszania konfiguracji */
const FORCE_MOCK = (() => {
  try { return new URLSearchParams(location.search).get("mock") === "1"; }
  catch (e) { return false; }
})();

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e) { return false; }
}

/* ══════════════ 4. ELEMENTY ══════════════ */

const el = {
  game: document.getElementById("game"),
  stage: document.getElementById("stage"),
  scene: document.getElementById("scene"),
  picBase: document.getElementById("picBase"),
  revealMemory: document.getElementById("revealMemory"),
  revealSpot: document.getElementById("revealSpot"),
  marks: document.getElementById("marks"),
  dwell: document.getElementById("dwell"),
  door: document.getElementById("door"),
  beam: document.getElementById("beam"),
  torch: document.getElementById("torch"),
  debug: document.getElementById("debug"),
  card: document.getElementById("card"),
  cardText: document.getElementById("cardText"),
  cardClose: document.getElementById("cardClose"),
  counterNum: document.getElementById("counterNum"),
  slots: document.getElementById("slots"),
  hudHint: document.getElementById("hudHint"),
  traceList: document.getElementById("traceList"),
  srStatus: document.getElementById("srStatus"),
  rotateTip: document.getElementById("rotateTip"),
  screenIntro: document.getElementById("screenIntro"),
  screenFinal: document.getElementById("screenFinal"),
  btnStart: document.getElementById("btnStart"),
  btnFinal: document.getElementById("btnFinal"),
  introHint: document.getElementById("introHint"),
};

const markEls = new Map();   // id śladu → element pinezki

function traceById(id) {
  for (const t of TRACES) if (t.id === id) return t;
  return null;
}
function isFound(id) { return state.found.indexOf(id) >= 0; }

/* punkt trafienia / rozjaśnienia / pinezki w px kadru */
function hitPoint(t) { return { x: t.x / 100 * metrics.W, y: t.y / 100 * metrics.H }; }
function revealPoint(t) {
  return {
    x: (t.revealX !== undefined ? t.revealX : t.x) / 100 * metrics.W,
    y: (t.revealY !== undefined ? t.revealY : t.y) / 100 * metrics.H,
  };
}
function pinPoint(t) {
  return {
    x: (t.pinX !== undefined ? t.pinX : t.x) / 100 * metrics.W,
    y: (t.pinY !== undefined ? t.pinY : t.y) / 100 * metrics.H,
  };
}
function hitRadius(t) { return t.r / 100 * metrics.W; }
function revealRadius(t) { return (t.revealR || t.r * 1.4) / 100 * metrics.W; }

/* ══════════════ 5. POMIAR KADRU ══════════════ */

function measure() {
  const cs = getComputedStyle(el.stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = Math.max(el.stage.clientWidth - padX, 120);
  const availH = Math.max(el.stage.clientHeight - padY, 80);

  const RATIO = 43 / 24;               // 2752 × 1536
  let w = availW;
  let h = w / RATIO;
  if (h > availH) { h = availH; w = h * RATIO; }

  metrics.W = Math.round(w);
  metrics.H = Math.round(h);
  metrics.r = Math.min(Math.max(metrics.W * CONFIG.spotRatio, CONFIG.spotMin), CONFIG.spotMax);
  metrics.rFade = Math.min(Math.max(metrics.r * CONFIG.spotFadeRatio, CONFIG.spotFadeMin), CONFIG.spotFadeMax);
  metrics.torchW = Math.min(Math.max(metrics.W * CONFIG.torchRatio, CONFIG.torchMinPx), CONFIG.torchMaxPx);
  metrics.torchH = metrics.torchW * CONFIG.torchAspect;

  el.scene.style.setProperty("--scene-w", metrics.W + "px");
  el.scene.style.setProperty("--scene-h", metrics.H + "px");
  el.scene.style.setProperty("--r", metrics.r + "px");
  el.scene.style.setProperty("--r-fade", Math.round(metrics.rFade) + "px");
  el.torch.style.setProperty("--torch-w", metrics.torchW + "px");

  /* pinezka, wskaźnik przytrzymania i poświata podpowiedzi rosną razem z kadrem */
  const clamp = (min, val, max) => Math.round(Math.min(Math.max(val, min), max));
  el.scene.style.setProperty("--mark-size", clamp(18, metrics.W * 0.026, 34) + "px");
  el.scene.style.setProperty("--dwell-size", clamp(34, metrics.W * 0.047, 58) + "px");
  el.scene.style.setProperty("--hint-size", clamp(54, metrics.W * 0.1, 120) + "px");

  clampSpot();
  renderSpot();
  renderTorch();
  layoutMarks();
  updateMemoryMask();
  layoutDoor();
  layoutCard();
  layoutDebug();
  updateRotateTip();
}

function clampSpot() {
  state.spot.x = Math.min(Math.max(state.spot.x, 0), metrics.W);
  state.spot.y = Math.min(Math.max(state.spot.y, 0), metrics.H);
}

/* ══════════════ 6. RYSOWANIE ══════════════ */

function renderSpot() {
  el.scene.style.setProperty("--mx", state.spot.x + "px");
  el.scene.style.setProperty("--my", state.spot.y + "px");
}

function renderTorch() {
  /* Latarka ma stały kąt (taki jak render), więc plama musi leżeć przed
     jej soczewką. Przy lewej krawędzi kadru latarkę odbijamy lustrzanie,
     inaczej wyjechałaby poza obraz. */
  const ratio = metrics.W ? state.spot.x / metrics.W : 0.5;
  if (!state.mirror && ratio < CONFIG.mirrorOn) state.mirror = true;
  else if (state.mirror && ratio > CONFIG.mirrorOff) state.mirror = false;

  const rad = CONFIG.beamAngleDeg * Math.PI / 180;
  const dirX = (state.mirror ? -1 : 1) * Math.cos(rad);
  const dirY = Math.sin(rad);

  const dist = metrics.r * 0.62 + 8;
  const lensXpx = state.spot.x - dirX * dist;
  const lensYpx = state.spot.y - dirY * dist;

  const localLensX = (state.mirror ? 1 - CONFIG.lensX : CONFIG.lensX) * metrics.torchW;
  const localLensY = CONFIG.lensY * metrics.torchH;

  el.torch.style.transform =
    `translate3d(${lensXpx - localLensX}px, ${lensYpx - localLensY}px, 0)` +
    (state.mirror ? " scaleX(-1)" : "");

  const beamLen = dist + metrics.r * 1.15;
  const beamH = metrics.r * 2.3;
  const angle = Math.atan2(dirY, dirX) * 180 / Math.PI;
  el.beam.style.setProperty("--beam-len", beamLen + "px");
  el.beam.style.setProperty("--beam-h", beamH + "px");
  el.beam.style.transform =
    `translate3d(${lensXpx}px, ${lensYpx - beamH / 2}px, 0) rotate(${angle}deg)`;
}

/* Maska „pamięci”: każdy odkryty ślad zostaje rozjaśniony na stałe.
   Warstwy maski sumują się same, więc nie potrzeba `mask-composite`. */
function updateMemoryMask() {
  if (!state.found.length) return;
  const parts = state.found.map((id) => {
    const t = traceById(id);
    const p = revealPoint(t);
    const rr = revealRadius(t);
    return `radial-gradient(circle at ${Math.round(p.x)}px ${Math.round(p.y)}px, ` +
           `#000 0 ${Math.round(rr)}px, rgba(0,0,0,0) ${Math.round(rr + 46)}px)`;
  });
  const value = parts.join(", ");
  el.revealMemory.style.webkitMaskImage = value;
  el.revealMemory.style.maskImage = value;
  el.revealMemory.classList.add("is-active");
}

function layoutMarks() {
  for (const t of TRACES) {
    const mark = markEls.get(t.id);
    if (!mark) continue;
    const p = pinPoint(t);
    mark.style.left = p.x + "px";
    mark.style.top = p.y + "px";
  }
}

function layoutDoor() {
  const t = traceById(3);
  const x = (t.doorX !== undefined ? t.doorX : t.x) / 100 * metrics.W;
  const y = (t.doorY !== undefined ? t.doorY : t.y) / 100 * metrics.H;
  el.door.style.left = x + "px";
  el.door.style.top = y + "px";
}

function showDwellRing(t, progress) {
  const p = hitPoint(t);
  el.dwell.style.left = p.x + "px";
  el.dwell.style.top = p.y + "px";
  el.dwell.style.setProperty("--p", Math.min(progress, 1).toFixed(3));
  el.dwell.classList.add("is-on");
}
function hideDwellRing() {
  el.dwell.classList.remove("is-on");
  el.dwell.style.setProperty("--p", "0");
}

/* ══════════════ 7. ODKRYWANIE ŚLADÓW ══════════════ */

/* nieodkryty ślad pod podanym punktem (px kadru) */
function traceAt(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const t of TRACES) {
    if (isFound(t.id)) continue;
    const p = hitPoint(t);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= hitRadius(t) && d < bestDist) { best = t; bestDist = d; }
  }
  return best;
}

function revealTrace(t, source) {
  if (!t || isFound(t.id) || state.mode === "intro") return;
  if (t.needsDoor && !state.doorOpen) { openDoor(source); return; }

  state.found.push(t.id);
  clearHint();
  scheduleHint();
  updateMemoryMask();
  markFound(t);
  updateHud();
  disableTraceButton(t.id);
  showCard(t);
  announce(`Świetnie! Masz kolejny trop. ${t.text} Odnalezione ślady: ${state.found.length} z ${TRACES.length}.`);
  emitTrace(t);

  if (DEBUG) console.log(`[k06] ślad ${t.id} odkryty (${source})`);
  if (state.found.length >= TRACES.length) finish();
}

function markFound(t) {
  const mark = markEls.get(t.id);
  if (!mark) return;
  mark.classList.remove("is-hinted");
  mark.classList.add("is-found");
  const slot = el.slots.children[state.found.length - 1];
  if (slot) {
    slot.classList.add("is-found", "is-just-found");
    setTimeout(() => slot.classList.remove("is-just-found"), 260);
  }
}

/* ── Szafka pod zlewem ──
   Bazowy render ma drzwiczki zamknięte. Światło na drzwiczkach pokazuje
   etykietę „Otwórz”; dopiero po crossfadzie ślad zostaje zaliczony. */
function openDoor(source) {
  if (state.doorOpen) return;
  state.doorOpen = true;
  el.door.hidden = true;
  el.scene.classList.add("is-open");
  announce("Otwierasz szafkę pod zlewem.");
  if (DEBUG) console.log(`[k06] szafka otwarta (${source})`);

  const wait = reducedMotion() ? 150 : CONFIG.doorFadeMs;
  setTimeout(() => {
    const t = traceById(3);
    if (!isFound(t.id)) revealTrace(t, "szafka");
  }, wait);
}

function updateDoorHint(hoverTrace) {
  const wanted = !state.doorOpen && hoverTrace && hoverTrace.needsDoor;
  if (wanted && el.door.hidden) el.door.hidden = false;
  else if (!wanted && !el.door.hidden && document.activeElement !== el.door) el.door.hidden = true;
}

/* ── Karta śladu ── */
function showCard(t) {
  state.cardTraceId = t.id;
  el.cardText.textContent = t.text;
  el.card.hidden = false;
  layoutCard();
}

function hideCard() {
  el.card.hidden = true;
  state.cardTraceId = null;
}

/* Na dużym kadrze karta leży w środku, przy krawędzi dalszej od śladu.
   Na niskim kadrze (telefon w pionie) każde okno w środku zasłoniłoby całą
   kuchnię, więc karta schodzi pod kadr — tam i tak jest wolne miejsce. */
function layoutCard() {
  if (el.card.hidden || !metrics.W) return;
  const t = traceById(state.cardTraceId);
  if (!t) return;

  const s = el.scene.getBoundingClientRect();
  const g = el.game.getBoundingClientRect();
  const top = s.top - g.top;
  const left = s.left - g.left;
  const spaceBelow = g.height - (top + metrics.H);
  const underneath = metrics.H < 280 && spaceBelow > 140;

  el.card.style.width = underneath
    ? Math.min(g.width * 0.94, 520) + "px"
    : Math.min(metrics.W * 0.9, 520) + "px";
  el.card.style.left = (underneath ? g.width / 2 : left + metrics.W / 2) + "px";

  if (underneath) {
    el.card.style.top = (top + metrics.H + 12) + "px";
    return;
  }
  const margin = Math.max(metrics.H * 0.035, 10);
  const low = pinPoint(t).y > metrics.H * 0.55;
  el.card.style.top = low
    ? (top + margin) + "px"
    : (top + metrics.H - el.card.offsetHeight - margin) + "px";
}

/* ── HUD, czytnik ekranu, drugi tor ── */
function updateHud() {
  el.counterNum.textContent = String(state.found.length);
  if (state.found.length >= 2) el.hudHint.classList.add("is-faded");
  if (state.found.length >= 1 && !el.rotateTip.hidden) el.rotateTip.hidden = true;
}

function announce(text) {
  el.srStatus.textContent = text;
}

function disableTraceButton(id) {
  const btn = el.traceList.querySelector(`button[data-trace="${id}"]`);
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = `${traceById(id).label} — ślad odnaleziony`;
}

/* ── Podpowiedź po 45 s bez postępu ──
   Pulsuje okolica pierwszego nieodkrytego śladu — tyle, żeby ruszyć z miejsca,
   za mało, żeby wyręczyć. `prefers-reduced-motion` gasi sam puls (CSS). */
let hintTimer = null;

function scheduleHint() {
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(showHint, CONFIG.hintAfterMs);
}

function showHint() {
  hintTimer = null;
  if (state.mode !== "search" || state.hintedId) return;
  for (const t of TRACES) {
    if (isFound(t.id)) continue;
    const mark = markEls.get(t.id);
    if (mark) { mark.classList.add("is-hinted"); state.hintedId = t.id; }
    return;
  }
}

function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  if (!state.hintedId) return;
  const mark = markEls.get(state.hintedId);
  if (mark) mark.classList.remove("is-hinted");
  state.hintedId = null;
}

/* ══════════════ 8. FINAŁ I KONTRAKT ══════════════ */

function finish() {
  if (state.finished) return;
  state.finished = true;
  state.mode = "final";
  el.game.dataset.state = "final";
  el.scene.classList.add("is-lit");
  el.door.hidden = true;
  hideDwellRing();
  emitCompleted();

  const wait = reducedMotion() ? 300 : 1400;
  setTimeout(() => {
    hideCard();
    el.screenFinal.classList.remove("is-hidden");
    try { el.btnFinal.focus(); } catch (e) { /* fokus jest miły, nie krytyczny */ }
  }, wait);
}

/* Emisja DOKŁADNIE RAZ na cykl życia strony. Strona lekcji nasłuchuje
   równolegle na `contentWindow` i `contentDocument` ramki, więc emitujemy
   tylko na `window` — podwójny cel zaliczyłby klocek dwa razy. */
function emitCompleted() {
  if (state.completionSent) return;
  state.completionSent = true;
  try {
    window.dispatchEvent(new CustomEvent("k06:completed", {
      bubbles: true,
      detail: {
        letter: REWARD_LETTER,
        foundTraces: state.found.length,
        totalTraces: TRACES.length,
      },
    }));
  } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
}

/* Punkt wpięcia przyszłych klipów głosowych: gra mówi, KTÓRY ślad padł,
   a odtwarzanie robi strona lekcji (wyłącznie w trybach dźwiękowych). */
function emitTrace(t) {
  try {
    window.dispatchEvent(new CustomEvent("k06:trace", {
      bubbles: true,
      detail: { id: t.id, label: t.label },
    }));
  } catch (e) { /* jw. */ }
}

/* ══════════════ 9. STEROWANIE ══════════════ */

function setSpotFromClient(clientX, clientY) {
  const rect = el.scene.getBoundingClientRect();
  state.spot.x = clientX - rect.left;
  state.spot.y = clientY - rect.top;
  clampSpot();
}

function onPointerMove(e) {
  if (state.mode !== "search") return;
  setSpotFromClient(e.clientX, e.clientY);
  /* rysujemy od razu — latarka ma być pod palcem, nie klatkę za nim;
     pętla dobudza się tylko po to, żeby liczyć przytrzymanie */
  renderSpot();
  renderTorch();
  if (DEBUG) updateDebugReadout();
  requestFrame();
}

function grabFocus() {
  try { window.focus(); } catch (e) { /* w ramce bywa zablokowane */ }
}

function keyStepPx() { return CONFIG.keyStepRatio * metrics.W; }

/* prędkość ruchu ciągłego po `heldMs` trzymania klawisza (px/s; 0 = jeszcze sam krok) */
function keyVelocity(heldMs) {
  const after = heldMs - CONFIG.keyHoldDelayMs;
  if (after <= 0) return 0;
  const t = Math.min(after / CONFIG.keyRampMs, 1);
  const ramp = CONFIG.keyRampStart + (1 - CONFIG.keyRampStart) * t;
  return CONFIG.moveSpeed * metrics.W * ramp;
}

const KEY_SIDES = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};

function pressKey(side) {
  if (state.keys[side]) return;          // auto-repeat nie może sypać krokami
  state.keys[side] = true;
  state.keyHold[side] = 0;
  if (state.mode !== "search") return;
  const step = keyStepPx();
  if (side === "left") state.spot.x -= step;
  if (side === "right") state.spot.x += step;
  if (side === "up") state.spot.y -= step;
  if (side === "down") state.spot.y += step;
  clampSpot();
  renderSpot();
  renderTorch();
  requestFrame();
}

function releaseKey(side) {
  state.keys[side] = false;
  state.keyHold[side] = 0;
}

function setKey(key, down) {
  const side = KEY_SIDES[key];
  if (!side) return;
  if (down) pressKey(side); else releaseKey(side);
}

function releaseKeys() {
  for (const side of ["left", "right", "up", "down"]) releaseKey(side);
}

/* Most z lekcji (opcjonalny — gra działa w pełni bez rodzica).
   Przyjmujemy wyłącznie komunikaty od okna nadrzędnego:
     { type: "k06:pointer", xRatio: 0..1, yRatio: 0..1 }
     { type: "k06:key", key: "ArrowLeft"|"ArrowRight"|"ArrowUp"|"ArrowDown", down: bool } */
function bindParentBridge() {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const data = e.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "k06:pointer") {
      if (state.mode !== "search") return;
      const rx = Number(data.xRatio);
      const ry = Number(data.yRatio);
      if (isFinite(rx)) state.spot.x = Math.min(Math.max(rx, 0), 1) * metrics.W;
      if (isFinite(ry)) state.spot.y = Math.min(Math.max(ry, 0), 1) * metrics.H;
      clampSpot();
      renderSpot();
      renderTorch();
      requestFrame();
      return;
    }

    if (data.type === "k06:key") {
      if (!KEY_SIDES[data.key]) return;
      setKey(data.key, !!data.down);
    }
  });
}

function bindControls() {
  /* mysz i dotyk: nasłuch na CAŁYM dokumencie ramki — kursor poza kadrem
     trzyma latarkę przy krawędzi, zamiast ją zamrażać */
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerdown", (e) => {
    if (state.mode !== "search") return;
    grabFocus();
    onPointerMove(e);
  });

  /* klik w kadr = próba odkrycia śladu w miejscu kliknięcia */
  el.scene.addEventListener("click", (e) => {
    if (state.mode !== "search") return;
    if (e.target === el.door || el.door.contains(e.target)) return;
    setSpotFromClient(e.clientX, e.clientY);
    renderSpot();
    renderTorch();
    if (DEBUG) {
      console.log(`[k06] klik: x ${(state.spot.x / metrics.W * 100).toFixed(1)}%, ` +
                  `y ${(state.spot.y / metrics.H * 100).toFixed(1)}%`);
    }
    const t = traceAt(state.spot.x, state.spot.y);
    if (t) revealTrace(t, "klik");
  });

  el.scene.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  el.scene.addEventListener("pointerenter", grabFocus);

  window.addEventListener("keydown", (e) => {
    if (!KEY_SIDES[e.key]) return;
    if (!e.repeat) setKey(e.key, true);
    e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    if (KEY_SIDES[e.key]) setKey(e.key, false);
  });

  /* fokus stracony → żaden klawisz nie może zostać „wciśnięty” */
  window.addEventListener("blur", releaseKeys);

  bindParentBridge();

  el.btnStart.addEventListener("click", startSearch);
  el.cardClose.addEventListener("click", () => { hideCard(); grabFocus(); });
  el.door.addEventListener("click", () => openDoor("przycisk"));

  el.btnFinal.addEventListener("click", () => {
    announce("Litera S gotowa. Wpisz ją w polu postępu śledztwa.");
    el.btnFinal.disabled = true;
  });

  /* DRUGI TOR: pięć śladów jako przyciski (Tab / Enter) */
  el.traceList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-trace]");
    if (!btn || btn.disabled) return;
    if (state.mode === "intro") startSearch();
    const t = traceById(Number(btn.dataset.trace));
    if (!t) return;
    if (t.needsDoor && !state.doorOpen) { openDoor("lista"); return; }
    revealTrace(t, "lista");
  });

  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", () => setTimeout(measure, 250));

  /* W ramce lekcji rozmiar potrafi się zmienić bez zdarzenia `resize` okna
     (zmiana układu strony, rozwinięcie sekcji), a wtedy hotspoty liczone
     w px rozjechałyby się z obrazem. */
  if ("ResizeObserver" in window) {
    let last = 0;
    new ResizeObserver(() => {
      const w = el.stage.clientWidth + el.stage.clientHeight;
      if (w === last) return;
      last = w;
      measure();
    }).observe(el.stage);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.card.hidden) hideCard();
  });
}

/* ══════════════ 10. PĘTLA (na żądanie) ══════════════
   Gra przez większość czasu stoi w miejscu, więc pętla chodzi tylko wtedy,
   gdy coś się dzieje: trwa ruch klawiszem, odliczanie przytrzymania albo
   przyszła nowa pozycja wskaźnika. Tablet nie grzeje się na pustym biegu. */

let lastFrame = 0;
let running = false;

function requestFrame() {
  if (running) return;
  running = true;
  lastFrame = 0;
  requestAnimationFrame(frame);
}

function frame(ts) {
  const dt = lastFrame ? Math.min(ts - lastFrame, 100) : 16;
  lastFrame = ts;
  let busy = false;

  if (state.mode === "search") {
    /* ruch klawiszami */
    let moved = false;
    for (const side of ["left", "right", "up", "down"]) {
      if (!state.keys[side]) continue;
      busy = true;
      state.keyHold[side] += dt;
      const v = keyVelocity(state.keyHold[side]);
      if (!v) continue;
      const d = v * dt / 1000;
      if (side === "left") state.spot.x -= d;
      if (side === "right") state.spot.x += d;
      if (side === "up") state.spot.y -= d;
      if (side === "down") state.spot.y += d;
      moved = true;
    }
    if (moved) clampSpot();

    if (updateDwell(dt)) busy = true;
    renderSpot();
    renderTorch();
    if (DEBUG) updateDebugReadout();
  }

  if (busy) requestAnimationFrame(frame);
  else { running = false; lastFrame = 0; }
}

/* zwraca true, gdy odliczanie przytrzymania trwa (pętla ma chodzić dalej) */
function updateDwell(dt) {
  const t = traceAt(state.spot.x, state.spot.y);
  updateDoorHint(t);

  if (!t || (t.needsDoor && !state.doorOpen)) {
    if (state.dwellId !== null) { state.dwellId = null; state.dwellMs = 0; hideDwellRing(); }
    return false;
  }
  if (state.dwellId !== t.id) { state.dwellId = t.id; state.dwellMs = 0; }
  state.dwellMs += dt;
  showDwellRing(t, state.dwellMs / CONFIG.dwellMs);

  if (state.dwellMs >= CONFIG.dwellMs) {
    state.dwellId = null;
    state.dwellMs = 0;
    hideDwellRing();
    revealTrace(t, "światło");
    return false;
  }
  return true;
}

/* ══════════════ 11. TRYB DEBUG ══════════════ */

let debugReadout = null;

function initDebug() {
  if (!DEBUG) return;
  el.debug.hidden = false;
  for (const t of TRACES) {
    const ring = document.createElement("div");
    ring.className = "debug-spot";
    ring.dataset.trace = String(t.id);
    el.debug.appendChild(ring);

    const label = document.createElement("div");
    label.className = "debug-label";
    label.dataset.trace = String(t.id);
    label.textContent = `${t.id}: ${t.x}% / ${t.y}%  r ${t.r}%`;
    el.debug.appendChild(label);
  }
  debugReadout = document.createElement("div");
  debugReadout.className = "debug-readout";
  el.debug.appendChild(debugReadout);
  layoutDebug();
}

function layoutDebug() {
  if (!DEBUG) return;
  for (const t of TRACES) {
    const p = hitPoint(t);
    const rr = hitRadius(t);
    const ring = el.debug.querySelector(`.debug-spot[data-trace="${t.id}"]`);
    if (ring) {
      ring.style.left = p.x + "px";
      ring.style.top = p.y + "px";
      ring.style.width = rr * 2 + "px";
      ring.style.height = rr * 2 + "px";
    }
    const label = el.debug.querySelector(`.debug-label[data-trace="${t.id}"]`);
    if (label) {
      label.style.left = p.x + "px";
      label.style.top = (p.y - rr - 12) + "px";
    }
  }
}

/* Hak testowy — istnieje WYŁĄCZNIE pod ?debug=1. Ułatwia sprawdzenie wpięcia
   w lekcję bez przechodzenia całej gry (wzorzec K08_DEV). */
function initDevHooks() {
  if (!DEBUG) return;
  window.K06_DEV = {
    reveal(id) { const t = traceById(Number(id)); if (t) revealTrace(t, "K06_DEV"); },
    revealAll() { for (const t of TRACES) revealTrace(t, "K06_DEV"); },
    openDoor() { openDoor("K06_DEV"); },
    spot(xPercent, yPercent) {
      state.spot.x = Number(xPercent) / 100 * metrics.W;
      state.spot.y = Number(yPercent) / 100 * metrics.H;
      clampSpot(); renderSpot(); renderTorch(); updateDebugReadout(); requestFrame();
    },
    state() {
      return {
        mode: state.mode,
        found: state.found.slice(),
        doorOpen: state.doorOpen,
        completionSent: state.completionSent,
        frame: `${metrics.W}×${metrics.H}`,
        spotRadius: Math.round(metrics.r),
      };
    },
  };
}

function updateDebugReadout() {
  if (!debugReadout || !metrics.W) return;
  const px = (state.spot.x / metrics.W * 100).toFixed(1);
  const py = (state.spot.y / metrics.H * 100).toFixed(1);
  const t = traceAt(state.spot.x, state.spot.y);
  debugReadout.textContent =
    `x ${px}%   y ${py}%\nkadr ${metrics.W}×${metrics.H}  r ${Math.round(metrics.r)}px\n` +
    `pod światłem: ${t ? t.id + " (" + t.label + ")" : "—"}`;
}

/* ══════════════ 12. GRAFIKI (flaga useImages) ══════════════
   Zastępnik CSS/SVG stoi w HTML-u i działa od pierwszej sekundy; prawdziwe
   rendery wchodzą dopiero po sprawdzeniu, że plik faktycznie się wczytał.
   Brak pliku = gra działa dalej na zastępniku, bez błędu w konsoli. */

function withImage(src, onOk) {
  const probe = new Image();
  probe.addEventListener("load", () => onOk(), { once: true });
  probe.addEventListener("error", () => {
    console.warn(`[k06] nie wczytano grafiki: ${src} — zostaje zastępnik CSS`);
  }, { once: true });
  probe.src = src;
}

function initImages() {
  if (FORCE_MOCK) return;

  if (CONFIG.useImages.kitchen) {
    withImage(CONFIG.images.closed, () => {
      document.querySelectorAll(".pic-frame--closed").forEach((node) => {
        node.style.backgroundImage = `url("${CONFIG.images.closed}")`;
        node.classList.add("pic-frame--filled");
      });
    });
    withImage(CONFIG.images.open, () => {
      document.querySelectorAll(".pic-frame--open").forEach((node) => {
        node.style.backgroundImage = `url("${CONFIG.images.open}")`;
      });
    });
  }

  if (CONFIG.useImages.torch) {
    withImage(CONFIG.images.torch, () => {
      const img = new Image();
      img.src = CONFIG.images.torch;
      img.alt = "";
      img.draggable = false;
      el.torch.insertBefore(img, el.torch.firstChild);
      el.torch.classList.add("has-image");
    });
  }
}

/* ══════════════ 13. START ══════════════ */

function buildMarks() {
  for (const t of TRACES) {
    const mark = document.createElement("div");
    mark.className = "mark";
    mark.dataset.trace = String(t.id);
    el.marks.appendChild(mark);
    markEls.set(t.id, mark);
  }
}

/* Warstwy „pamięci” i „plamy” pokazują dokładnie ten sam kadr co spód,
   więc powstają jako klon bazowego bloku obrazu. */
function cloneLayers() {
  for (const host of [el.revealMemory, el.revealSpot]) {
    const clone = el.picBase.cloneNode(true);
    clone.removeAttribute("id");
    host.appendChild(clone);
  }
}

function updateRotateTip() {
  const narrowPortrait = window.innerWidth < 560 && window.innerHeight > window.innerWidth;
  el.rotateTip.hidden = !(narrowPortrait && state.found.length === 0);
}

function startSearch() {
  if (state.mode !== "intro") return;
  state.mode = "search";
  el.game.dataset.state = "search";
  el.screenIntro.classList.add("is-hidden");
  state.spot.x = metrics.W * 0.5;
  state.spot.y = metrics.H * 0.5;
  renderSpot();
  renderTorch();
  requestFrame();
  scheduleHint();
  grabFocus();
  announce("Latarka włączona. Prowadź ją myszką lub strzałkami. Klawiszem Tab przejdziesz po liście śladów.");
}

function initHint() {
  let touch = false;
  try { touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches; }
  catch (e) { /* stara przeglądarka — zostaje wersja dla myszy */ }
  const text = touch ? "Przesuwaj latarkę palcem" : "Prowadź latarkę myszką lub strzałkami";
  el.hudHint.textContent = text;
  el.introHint.textContent = touch
    ? "Przesuwaj latarkę palcem po kuchni"
    : "Prowadź latarkę myszką lub strzałkami ← → ↑ ↓";
}

function init() {
  buildMarks();
  cloneLayers();
  initImages();
  initHint();
  initDebug();
  initDevHooks();
  bindControls();
  measure();
  state.spot.x = metrics.W * 0.5;
  state.spot.y = metrics.H * 0.5;
  renderSpot();
  renderTorch();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
