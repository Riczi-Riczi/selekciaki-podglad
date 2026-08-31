/* ═══════════════════════════════════════════════════════════════
   „Złap zużyty olej!” — minigra e-lekcji SELEKT (klasy 4–5)

   Czysty JavaScript, bez zależności.
   Cała rozgrywka działa w jednej pętli requestAnimationFrame —
   wszystkie opóźnienia liczone są wewnątrz pętli (brak setTimeout
   dla mechaniki), więc restart nigdy nie zostawia „osieroconych”
   timerów ani podwójnych kropli.
   ═══════════════════════════════════════════════════════════════ */

"use strict";

/* ══════════════ 1. KONFIGURACJA ══════════════
   Wszystkie parametry trudności w jednym miejscu.
   Prędkości podane jako CZĘŚĆ WYSOKOŚCI/SZEROKOŚCI PLANSZY na sekundę,
   dzięki czemu trudność jest podobna na każdym urządzeniu. */

const GAME_CONFIG = {
  targetDrops: 20,          // ile kropli trzeba złapać, aby wygrać

  startingDropSpeed: 0.30,  // prędkość 1. kropli (wysokości planszy / s) ≈ 200 px/s przy 680 px
  maximumDropSpeed: 0.60,   // prędkość 20. kropli ≈ 410 px/s przy 680 px

  startingSpawnDelay: 1300, // ms przerwy przed 1. patelnią po złapaniu
  minimumSpawnDelay: 550,   // ms przerwy przy ostatnich kroplach

  funnelHitboxPadding: 14,  // px „wyrozumiałości” obszaru łapania (z każdej strony)

  /* N4 — łagodniejszy próg wejścia.
     funnelWidenFactor mnoży CAŁE pole łapania (baza + padding), więc lejek
     jest szerszy o ten sam procent na każdym ekranie. */
  funnelWidenFactor: 1.30,  // ×szerokość pola łapania (+30%)

  /* Rozbieg: pierwsze `warmupDrops` kropli wolniej, z liniowym powrotem
     do zwykłych wartości. Mnożniki startowe (przy 0 złapanych kroplach): */
  warmupDrops: 6,
  warmupDropSpeed: 0.72,    // ×prędkość spadania na starcie rozbiegu
  warmupPanSpeed: 0.80,     // ×prędkość patelni na starcie rozbiegu
  warmupSpawnDelay: 1.25,   // ×przerwa między kroplami na starcie rozbiegu

  pointerSmoothingMs: 75,   // stała czasowa wygładzania ruchu za wskaźnikiem

  /* N4.1 — precyzja klawiatury. Krótkie naciśnięcie = mały krok,
     przytrzymanie = rozpędzanie do PEŁNEJ bottleSpeed (test uczciwości
     liczy zasięg z bottleSpeed, więc ta wartość musi zostać osiągalna). */
  keyStepRatio: 0.045,      // krok pojedynczego naciśnięcia (część szerokości planszy)
  keyHoldDelayMs: 140,      // ile trzeba trzymać, zanim ruch stanie się ciągły
  keyRampMs: 300,           // czas rozpędzania do pełnej prędkości
  keyRampStart: 0.35,       // prędkość na początku rozpędzania (×bottleSpeed)

  /* patelnia patroluje poziomo górny pas planszy (K08 v2 — bez teleportacji) */
  panPatrolY: 0.13,         // wysokość toru patrolu (część wysokości planszy)
  panSpeedStart: 0.16,      // prędkość patelni przy 1. kropli (szerokości planszy / s)
  panSpeedMax: 0.34,        // prędkość patelni przy 20. kropli

  lifeToastMs: 1200,        // ms przerwy po utracie życia (komunikat + rozbryzg)

  rewardLetter: "Z",        // litera-nagroda do finałowego hasła (kanon: Z = K08)

  bottleSpeed: 1.05,        // prędkość butelki (szerokości planszy / s) — klawiatura i test uczciwości
  fairnessSafety: 1.3,      // margines bezpieczeństwa testu uczciwości (>1 = łatwiej)

  countdownTick: 750,       // ms na jedną cyfrę odliczania 3-2-1
  missFreeze: 1100,         // ms pokazywania rozlanego oleju przed ekranem pudła

  /* Po dodaniu docelowych plików .webp do assets/images przestaw
     odpowiednią flagę na true — gra użyje ich zamiast wbudowanych SVG/CSS,
     bez żadnych zmian w mechanice. */
  useImages: {
    background: true,       // assets/images/background.webp (zlew kuchenny 3D)
    oilDrop: false,         // assets/images/oil-drop.webp
    oilSplash: false,       // assets/images/oil-splash.webp
    pans: true,             // assets/images/pan-left.webp + pan-right.webp (patelnia 3D)
  },
};

/* ADAPTACYJNY TRYB POMOCY (K08 v2).
   Włącza się automatycznie od 3. pełnej próby i pozostaje aktywny aż do
   zwycięstwa. Jeden czytelny profil mnożników — wartości do strojenia.
   Uczniowi nie pokazujemy liczb, tylko neutralny komunikat. */
const ASSIST_PROFILE = {
  dropSpeed: 0.8,    // ×prędkość spadania (cała krzywa, także maksimum)
  spawnDelay: 1.25,  // ×przerwa między kroplami
  panSpeed: 0.8,     // ×prędkość poziomego ruchu patelni
  hitboxBonus: 6,    // +px do pola złapania lejka (z każdej strony)
};

/* ══════════════ 2. ELEMENTY DOM ══════════════ */

const el = {
  game:        document.getElementById("game"),
  board:       document.getElementById("board"),
  bg:          document.getElementById("bg"),
  pan:         document.getElementById("pan"),
  drop:        document.getElementById("drop"),
  splash:      document.getElementById("splash"),
  fx:          document.getElementById("fx"),
  bottle:      document.getElementById("bottle"),
  counter:     document.getElementById("counter"),
  progress:    document.getElementById("progressFill"),
  soundBtn:    document.getElementById("soundBtn"),
  srStatus:    document.getElementById("srStatus"),
  livesBox:    document.getElementById("livesBox"),
  lives:       Array.from(document.querySelectorAll("#livesBox .life")),
  toast:       document.getElementById("toast"),
  hudHint:     document.getElementById("hudHint"),
  startHint:   document.getElementById("startHint"),
  assistNote:  document.getElementById("assistNote"),
  screenStart: document.getElementById("screenStart"),
  screenMiss:  document.getElementById("screenMiss"),
  screenWin:   document.getElementById("screenWin"),
  screenPause: document.getElementById("screenPause"),
  countdown:   document.getElementById("countdown"),
  countdownNum: document.getElementById("countdownNum"),
  btnStart:    document.getElementById("btnStart"),
  btnRetry:    document.getElementById("btnRetry"),
  btnResume:   document.getElementById("btnResume"),
  btnNext:     document.getElementById("btnNext"),
  rewardLetter: document.getElementById("rewardLetter"),
  rewardLetterInline: document.getElementById("rewardLetterInline"),
};

/* ══════════════ 3. STAN GRY ══════════════ */

const STATES = {
  START: "start",           // ekran startowy
  PLAYING: "playing",       // rozgrywka
  MISSED: "missed",         // ekran pudła
  RESTARTING: "restarting", // odliczanie 3-2-1 przed próbą / po pauzie
  WON: "won",               // ekran zwycięstwa
  PAUSED: "paused",         // gra wstrzymana (karta / fokus / scroll)
};

const game = {
  state: STATES.START,
  caught: 0,                // złapane krople w bieżącej próbie

  /* K08 v2: trzy życia i licznik pełnych prób */
  lives: 3,                 // pudło = −1 życie; wynik zostaje
  attempt: 1,               // rośnie WYŁĄCZNIE po utracie trzeciego życia

  /* fazy wewnątrz stanu PLAYING:
     waitPan (przerwa) → armed (czekamy, aż kropla będzie osiągalna)
     → falling → catch/lifePause → waitPan… */
  phase: "waitPan",
  phaseTimer: 0,            // ms pozostałe w bieżącej fazie

  /* odliczanie */
  countdownLeft: 0,
  countdownValue: 3,
  afterCountdown: null,     // funkcja wywoływana po 3-2-1

  /* kropla */
  drop: { x: 0, y: 0, speed: 0, wobblePhase: 0, missed: false },

  /* patelnia: ciągły patrol poziomy (dir = kierunek ruchu) */
  pan: { x: 0, y: 0, dir: 1, faceRight: true, spoutX: 0, spoutY: 0 },

  /* butelka */
  bottleX: 0,               // środek butelki (px) — pozycja renderowana
  targetX: null,            // cel wskaźnika (mysz/palec/lekcja); null = brak
  keys: { left: false, right: false },
  keyHold: { left: 0, right: 0 },   // ms trzymania klawisza (rozpędzanie)

  completionSent: false,    // k08:completed emitowane tylko raz
  lastTime: 0,
};

/* Wymiary przeliczane przy starcie i każdym resize */
const metrics = {
  W: 0, H: 0,
  bottleW: 0, bottleH: 0, bottleTop: 0,
  mouthY: 0, mouthHalfBase: 0, // linia i bazowa połowa szerokości otworu lejka
  panW: 0, panH: 0,
  dropW: 0, dropH: 0,
  floorY: 0,                 // poziom „podłogi” (blat) — tu ląduje pudło
};

/* ══════════════ 4. DŹWIĘK ══════════════ */

const sounds = { catch: null, miss: null, win: null };
let soundEnabled = true;

function initAudio() {
  const files = { catch: "assets/audio/catch.mp3", miss: "assets/audio/miss.mp3", win: "assets/audio/win.mp3" };
  for (const key of Object.keys(files)) {
    try {
      const a = new Audio(files[key]);
      a.preload = "auto";
      /* brak pliku = gra działa dalej bez dźwięku */
      a.addEventListener("error", () => { sounds[key] = null; });
      sounds[key] = a;
    } catch (e) {
      sounds[key] = null;
    }
  }
}

function playSound(name) {
  if (!soundEnabled) return;
  const a = sounds[name];
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;                       // bez nakładających się dźwięków
    const p = a.play();
    if (p && p.catch) p.catch(() => {});     // np. brak interakcji / autoplay policy
  } catch (e) { /* ignorujemy — dźwięk jest opcjonalny */ }
}

function setSound(on) {
  soundEnabled = on;
  el.soundBtn.setAttribute("aria-pressed", String(on));
  el.soundBtn.setAttribute("aria-label", on ? "Wyłącz dźwięk" : "Włącz dźwięk");
  try { sessionStorage.setItem("selekt_zlap_olej_sound", on ? "1" : "0"); } catch (e) {}
}

/* ══════════════ 5. WYMIARY I POZYCJONOWANIE ══════════════ */

function measure() {
  metrics.W = el.board.clientWidth;
  metrics.H = el.board.clientHeight;

  metrics.bottleW = el.bottle.offsetWidth;
  metrics.bottleH = el.bottle.offsetHeight || metrics.bottleW * (512 / 219);
  metrics.bottleTop = metrics.H * 0.98 - metrics.bottleH;   // butelka stoi tuż nad dołem

  /* Otwór lejka: górne ~72% szerokości obrazka butelki, tuż pod jej górną krawędzią.
     Bazowa połówka bez „wyrozumiałości” — padding dokładany dynamicznie
     (tryb pomocy poszerza pole łapania), patrz currentMouthHalf(). */
  metrics.mouthY = metrics.bottleTop + metrics.bottleH * 0.07;
  metrics.mouthHalfBase = metrics.bottleW * 0.36;

  metrics.panW = el.pan.offsetWidth;
  /* wysokość z rzeczywistego elementu — grafika patelni może mieć
     inne proporcje niż wbudowane SVG (220×90) */
  metrics.panH = el.pan.offsetHeight || metrics.panW * (90 / 220);

  metrics.dropW = el.drop.offsetWidth || 32;
  metrics.dropH = metrics.dropW * (54 / 40);

  metrics.floorY = metrics.H * 0.93;

  clampBottle();
  renderBottle();
  renderPan();
  renderDrop();
}

/* zakres, w którym może znaleźć się ŚRODEK butelki (cały lejek widoczny) */
function bottleRange() {
  const half = metrics.bottleW / 2 + 4;
  return { min: half, max: Math.max(half, metrics.W - half) };
}

function clampBottle() {
  const r = bottleRange();
  game.bottleX = Math.min(Math.max(game.bottleX, r.min), r.max);
}

/* N4 — sterowanie wskaźnikiem (mysz, palec, pozycja przysłana przez lekcję).
   Zapisujemy CEL; butelka dogania go płynnie w stepGame(). Ruch klawiaturą
   i przyciskami ekranowymi jest natychmiastowy i kasuje cel wskaźnika,
   żeby oba tory sterowania nie przeciągały butelki w przeciwne strony. */
function setPointerTarget(x) {
  if (game.state !== STATES.PLAYING) return;
  const r = bottleRange();
  game.targetX = Math.min(Math.max(x, r.min), r.max);
}

function clearPointerTarget() {
  game.targetX = null;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { return false; }
}

function renderBottle() {
  el.bottle.style.transform =
    `translate3d(${game.bottleX - metrics.bottleW / 2}px, ${metrics.bottleTop}px, 0)`;
}

function renderPan() {
  el.pan.style.transform = `translate3d(${game.pan.x}px, ${game.pan.y}px, 0)`;
}

function renderDrop() {
  const wobble = Math.sin(game.drop.wobblePhase) * metrics.dropW * 0.14;
  el.drop.style.transform =
    `translate3d(${game.drop.x - metrics.dropW / 2 + wobble}px, ${game.drop.y}px, 0) ` +
    `rotate(${Math.sin(game.drop.wobblePhase * 0.7) * 7}deg)`;
}

/* ══════════════ 6. TRUDNOŚĆ ══════════════ */

/* Tryb pomocy: od 3. pełnej próby, trwale aż do zwycięstwa
   (attempt tylko rośnie, więc warunek jest z natury trwały). */
function assistActive() {
  return game.attempt >= 3;
}

/* Płynna interpolacja 0→1 między pierwszą a ostatnią kroplą */
function difficultyT() {
  return Math.min(game.caught / (GAME_CONFIG.targetDrops - 1), 1);
}

/* N4 — ROZBIEG: przez pierwsze `warmupDrops` kropli gra jest wolniejsza,
   a mnożnik wraca liniowo do 1.0. Dotyczy KAŻDEJ próby (także po pudle),
   bo to próg wejścia, nie nagroda. Działa niezależnie od trybu pomocy
   — mnożniki się mnożą. */
function warmupT() {
  return Math.min(game.caught / GAME_CONFIG.warmupDrops, 1);
}

/* from = mnożnik przy 0 złapanych kroplach; wynik dąży do 1.0 */
function warmupFactor(from) {
  return from + (1 - from) * warmupT();
}

function currentDropSpeed() {   // px/s — w pomocy wolniej w CAŁEJ krzywej
  const t = difficultyT();
  const frac = GAME_CONFIG.startingDropSpeed +
    (GAME_CONFIG.maximumDropSpeed - GAME_CONFIG.startingDropSpeed) * t;
  return frac * metrics.H * (assistActive() ? ASSIST_PROFILE.dropSpeed : 1) *
    warmupFactor(GAME_CONFIG.warmupDropSpeed);
}

function currentSpawnDelay() {  // ms — w pomocy dłuższe przerwy
  const t = difficultyT();
  const base = GAME_CONFIG.startingSpawnDelay +
    (GAME_CONFIG.minimumSpawnDelay - GAME_CONFIG.startingSpawnDelay) * t;
  return base * (assistActive() ? ASSIST_PROFILE.spawnDelay : 1) *
    warmupFactor(GAME_CONFIG.warmupSpawnDelay);
}

function currentPanSpeed() {    // px/s — patrol nadal przyspiesza, w pomocy wolniej
  const t = difficultyT();
  const frac = GAME_CONFIG.panSpeedStart +
    (GAME_CONFIG.panSpeedMax - GAME_CONFIG.panSpeedStart) * t;
  return frac * metrics.W * (assistActive() ? ASSIST_PROFILE.panSpeed : 1) *
    warmupFactor(GAME_CONFIG.warmupPanSpeed);
}

/* N4 — pole łapania szersze o funnelWidenFactor (procentowo, więc tak samo
   na 320 px i na 1440 px); bonus trybu pomocy dokładany jak dotąd na końcu. */
function currentMouthHalf() {
  const base = (metrics.mouthHalfBase + GAME_CONFIG.funnelHitboxPadding) *
    GAME_CONFIG.funnelWidenFactor;
  return base + (assistActive() ? ASSIST_PROFILE.hitboxBonus : 0);
}

/* ══════════════ 7. PATELNIA — CIĄGŁY PATROL POZIOMY (K08 v2) ══════════════
   Patelnia jeździ płynnie między bezpiecznymi granicami planszy w górnym
   pasie i odbija się od krawędzi. Nie teleportuje się między kroplami.
   Grafika pan-left/pan-right podąża za kierunkiem ruchu (wylew z przodu).

   TEST UCZCIWOŚCI został zachowany w nowej formie: skoro nie wybieramy już
   pozycji patelni, wybieramy MOMENT wypuszczenia kropli. Po upływie przerwy
   faza "armed" czeka, aż aktualna pozycja wylewu będzie w zasięgu butelki
   sterowanej klawiaturą (najwolniejsze sterowanie) z marginesem bezpieczeństwa
   — dopiero wtedy kropla startuje. Patrol pokrywa całą szerokość, więc warunek
   zawsze zostaje spełniony w ułamku cyklu. */

function panBounds() {
  const margin = Math.max(metrics.W * 0.03, 12);
  return { min: margin, max: metrics.W - metrics.panW - margin };
}

function updatePanSpout() {
  const spoutOffset = metrics.panW * 0.04;   // wylew przy przedniej krawędzi
  game.pan.spoutX = game.pan.faceRight
    ? game.pan.x + metrics.panW - spoutOffset
    : game.pan.x + spoutOffset;
  game.pan.spoutY = game.pan.y + metrics.panH * 0.5;
}

function updatePan(dt) {
  const b = panBounds();
  game.pan.x += game.pan.dir * currentPanSpeed() * dt;
  if (game.pan.x <= b.min) { game.pan.x = b.min; game.pan.dir = 1; }
  if (game.pan.x >= b.max) { game.pan.x = b.max; game.pan.dir = -1; }

  const faceRight = game.pan.dir > 0;
  if (faceRight !== game.pan.faceRight) {
    game.pan.faceRight = faceRight;
    el.pan.classList.toggle("face-right", faceRight);
  }
  updatePanSpout();
  renderPan();
}

/* pozycja startowa patrolu na początku próby */
function resetPan() {
  const hudSafe = 84;
  game.pan.y = Math.max(GAME_CONFIG.panPatrolY * metrics.H, hudSafe);
  const b = panBounds();
  game.pan.x = b.min + (b.max - b.min) * 0.25;
  game.pan.dir = 1;
  game.pan.faceRight = true;
  el.pan.classList.add("face-right");
  el.pan.classList.remove("tilt-pour");
  updatePanSpout();
  renderPan();
}

function showPan() { el.pan.classList.remove("is-hidden"); }

function hidePan() {
  el.pan.classList.add("is-hidden");
  el.pan.classList.remove("tilt-pour");
}

/* N4 — PAS OSIĄGALNY: wylew patelni potrafi dojechać bliżej krawędzi, niż
   ŚRODEK butelki jest w stanie dojechać. Kropla startuje wyłącznie wtedy,
   gdy wylew mieści się w zakresie ruchu środka butelki — dzięki temu żadna
   kropla nie ląduje w pasie, którego dziecko nie może pokryć lejkiem.
   Patrol pokrywa całą szerokość, więc warunek spełnia się w każdym cyklu. */
function spoutInReachBand() {
  const r = bottleRange();
  return game.pan.spoutX >= r.min && game.pan.spoutX <= r.max;
}

/* czy kropla wypuszczona TERAZ będzie uczciwie osiągalna */
function dropIsReachableNow() {
  const fallTime = (metrics.mouthY - game.pan.spoutY) / currentDropSpeed();  // s
  const reach = fallTime * (GAME_CONFIG.bottleSpeed * metrics.W) / GAME_CONFIG.fairnessSafety;
  return Math.abs(game.pan.spoutX - game.bottleX) <= reach;
}

/* ══════════════ 8. KROPLA ══════════════ */

function spawnDrop() {
  game.drop.x = game.pan.spoutX;
  game.drop.y = game.pan.spoutY;
  game.drop.speed = currentDropSpeed();
  game.drop.wobblePhase = Math.random() * Math.PI * 2;
  game.drop.missed = false;
  el.pan.classList.add("tilt-pour");   // patelnia przechyla się w stronę wylewu
  renderDrop();
  el.drop.classList.remove("is-hidden");
}

function hideDrop() {
  el.drop.classList.add("is-hidden");
}

function updateDrop(dt) {
  game.drop.y += game.drop.speed * dt;
  game.drop.wobblePhase += dt * 5;

  const dropBottom = game.drop.y + metrics.dropH;

  /* przekroczenie linii otworu lejka → sprawdzamy złapanie
     (pole łapania dynamiczne: tryb pomocy delikatnie je poszerza) */
  if (!game.drop.missed && dropBottom >= metrics.mouthY) {
    if (Math.abs(game.drop.x - game.bottleX) <= currentMouthHalf()) {
      onCatch();
      return;
    }
    game.drop.missed = true;   // minęła lejek — złapać już się nie da
  }

  /* kropla doleciała do blatu poza lejkiem → pudło */
  if (dropBottom >= metrics.floorY) {
    onMiss();
    return;
  }
  renderDrop();
}

/* ══════════════ 9. ZDARZENIA ROZGRYWKI ══════════════ */

function onCatch() {
  hideDrop();
  game.caught++;
  updateCounter();
  playSound("catch");

  /* animacja butelki + efekt „+1” nad lejkiem */
  el.bottle.classList.remove("catch-bounce");
  void el.bottle.offsetWidth;               // restart animacji CSS
  el.bottle.classList.add("catch-bounce");
  spawnPlusOne();

  announce(`Złapano kroplę ${game.caught} z ${GAME_CONFIG.targetDrops}.`);

  if (game.caught >= GAME_CONFIG.targetDrops) {
    onWin();
    return;
  }
  /* patelnia jedzie dalej — bez chowania i teleportacji */
  el.pan.classList.remove("tilt-pour");
  game.phase = "waitPan";
  game.phaseTimer = currentSpawnDelay();
}

function spawnPlusOne() {
  const plus = document.createElement("div");
  plus.className = "fx-plus";
  plus.textContent = "+1";
  plus.style.left = `${game.bottleX}px`;
  plus.style.top = `${metrics.mouthY - 10}px`;
  el.fx.appendChild(plus);
  plus.addEventListener("animationend", () => plus.remove());
}

/* K08 v2: pudło odbiera jedno życie. Wynik (caught) NIE jest zerowany.
   Dopiero utrata trzeciego życia kończy pełną próbę. */
function onMiss() {
  hideDrop();
  el.pan.classList.remove("tilt-pour");
  playSound("miss");

  /* rozlany olej w miejscu upadku kropli */
  el.splash.style.left = `${game.drop.x}px`;
  el.splash.style.top = `${metrics.floorY}px`;
  el.splash.classList.remove("is-hidden");

  game.lives--;
  updateLives();

  if (game.lives > 0) {
    /* krótki komunikat i gramy dalej — bez pełnego ekranu restartu */
    const zostalo = game.lives === 1 ? "Zostało 1 życie." : `Zostały ${game.lives} życia.`;
    announce(`Kropla uciekła do zlewu. ${zostalo} Wynik bez zmian: ${game.caught} z ${GAME_CONFIG.targetDrops}.`);
    showToast(`Ojej, kropla uciekła! ${zostalo}`);
    game.phase = "lifePause";
    game.phaseTimer = GAME_CONFIG.lifeToastMs;
    return;
  }

  /* trzecie pudło — koniec pełnej próby */
  setState(STATES.MISSED);
  announce("Trzecia kropla uciekła. Ta próba dobiegła końca.");
  game.phase = "missWait";
  game.phaseTimer = GAME_CONFIG.missFreeze;
}

function onWin() {
  setState(STATES.WON);
  hidePan();
  hideDrop();
  hideToast();
  playSound("win");
  announce(`Brawo! Złapano wszystkie ${GAME_CONFIG.targetDrops} kropli. ` +
    `Zdobywasz literę ${GAME_CONFIG.rewardLetter}.`);

  showOverlay(el.screenWin);
  el.btnNext.focus();

  finalizeCompletion();
}

/* KONTRAKT PROTOTYPU (jak K16): jedna funkcja finalizująca emituje
   `k08:completed` DOKŁADNIE RAZ — chroni przed ponowną emisją po
   wielokrotnym kliknięciu, pauzie/wznowieniu i powrocie do stanu WON.
   Prototyp NICZEGO nie zapisuje do localStorage (żadnych kluczy
   selekt_zlap_olej_* ani lk45_*) — zapis litery nastąpi dopiero przy
   integracji, przez mechanizm strony lekcji. */
function finalizeCompletion() {
  if (game.completionSent) return;
  game.completionSent = true;
  try {
    window.dispatchEvent(new CustomEvent("k08:completed", {
      bubbles: true,
      detail: {
        letter: GAME_CONFIG.rewardLetter,
        caughtDrops: game.caught,
        totalDrops: GAME_CONFIG.targetDrops,
        attempts: game.attempt,
        assistanceActive: assistActive(),
      },
    }));
  } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
}

/* ══════════════ 10. LICZNIK I KOMUNIKATY ══════════════ */

function updateCounter() {
  el.counter.textContent = `ZŁAPANE KROPLE: ${game.caught} / ${GAME_CONFIG.targetDrops}`;
  el.progress.style.width = `${(game.caught / GAME_CONFIG.targetDrops) * 100}%`;
  updateHint();
}

/* HUD trzech żyć: utracone = pusta kropla z przekreśleniem (nie sam kolor);
   stan tekstowy niesie aria-label kontenera + srStatus przy zdarzeniach */
function updateLives() {
  el.lives.forEach((life, i) => {
    life.classList.toggle("is-lost", i >= game.lives);
  });
  el.livesBox.setAttribute("aria-label", `Życia: ${game.lives} z 3`);
}

/* krótki, wizualny komunikat (treść dla czytnika idzie przez announce) */
let toastTimer = null;
function showToast(text, isAssist) {
  clearTimeout(toastTimer);
  el.toast.textContent = text;
  el.toast.classList.toggle("toast--assist", !!isAssist);
  el.toast.classList.remove("is-hidden");
  toastTimer = setTimeout(hideToast, isAssist ? 3200 : 1600);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  el.toast.classList.add("is-hidden");
}

function announce(msg) {
  el.srStatus.textContent = msg;
}

/* N4 — PODPOWIEDŹ STEROWANIA.
   Treść zależy od urządzenia: na ekranie dotykowym mysz i strzałki nie
   istnieją, więc podpowiadamy gest. Ta sama treść na ekranie startowym
   i w małym chipie HUD; chip znika po `hintFadeAfter` kroplach, żeby
   nie zaśmiecać planszy do końca gry. */
const HINT_FADE_AFTER = 5;

function isTouchPrimary() {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch (e) { return false; }
}

function controlHintText() {
  return isTouchPrimary()
    ? "Przeciągaj palcem"
    : "Steruj myszką lub strzałkami ← →";
}

function initHints() {
  const text = controlHintText();
  if (el.startHint) el.startHint.textContent = text;
  if (el.hudHint)   el.hudHint.textContent = text;
}

function updateHint() {
  if (!el.hudHint) return;
  el.hudHint.classList.toggle("is-faded", game.caught >= HINT_FADE_AFTER);
}

/* ══════════════ 11. STANY I EKRANY ══════════════ */

function setState(next) {
  game.state = next;
  el.game.dataset.state = next;
}

function showOverlay(overlay) {
  for (const o of [el.screenStart, el.screenMiss, el.screenWin, el.screenPause]) {
    o.classList.toggle("is-hidden", o !== overlay);
  }
}

function hideOverlays() {
  showOverlay(null);
}

/* Pełne czyszczenie planszy — wywoływane przy każdym (re)starcie PEŁNEJ próby.
   Resetuje wynik ORAZ trzy życia; numeru próby nie dotyka (nim zarządza
   wyłącznie przycisk NOWA PRÓBA po utracie trzeciego życia). */
function cleanupRound() {
  hideDrop();
  hidePan();
  hideToast();
  el.splash.classList.add("is-hidden");
  el.fx.replaceChildren();                 // usuwa efekty „+1” razem z animacjami
  el.bottle.classList.remove("catch-bounce");
  game.caught = 0;
  game.lives = 3;
  updateCounter();
  updateLives();
}

/* Start nowej pełnej próby: reset + butelka na środku + odliczanie 3-2-1 */
function startAttempt() {
  cleanupRound();
  game.bottleX = metrics.W / 2;
  clearPointerTarget();                    // butelka startuje na środku
  clampBottle();
  renderBottle();
  resetPan();
  startCountdown(() => {
    setState(STATES.PLAYING);
    showPan();                             // patrol startuje z pozycją z resetPan()
    if (assistActive()) {
      showToast("Włączamy spokojniejsze tempo. Zebrane wskazówki pomogą Ci w kolejnej próbie.", true);
      announce("Włączamy spokojniejsze tempo.");
    }
    game.phase = "waitPan";
    game.phaseTimer = GAME_CONFIG.startingSpawnDelay * 0.5;
  }, "attempt");
}

/* kind — JAWNY cel odliczania (poprawka po audycie Codexa):
     "attempt" — odliczanie rozpoczyna nową pełną próbę,
     "resume"  — odliczanie wznawia istniejącą próbę (stan gry nietknięty).
   Dzięki temu pauza w trakcie odliczania wie, co przerwała, i kolejne
   wznowienie nie kasuje wyniku, żyć ani numeru próby. Jedno odliczanie
   naraz: startCountdown zawsze nadpisuje poprzedni callback. */
function startCountdown(after, kind) {
  setState(STATES.RESTARTING);
  hideOverlays();
  game.countdownKind = kind || "attempt";
  game.countdownValue = 3;
  game.countdownLeft = GAME_CONFIG.countdownTick;
  game.afterCountdown = after;
  el.countdownNum.textContent = "3";
  el.countdown.classList.remove("is-hidden");
}

/* ══════════════ 12. GŁÓWNA PĘTLA ══════════════ */

/* Krok logiki wydzielony z callbacku rAF: produkcyjnie woła go wyłącznie
   loop(); w trybie ?dev=1 może go krokować K08_DEV.tick() z syntetycznym
   zegarem (ukryte karty zamrażają rAF — testy przechodzą przez TEN SAM kod). */
function stepGame(now) {
  /* clamp z obu stron: ≤50 ms chroni przed skokiem po uśpieniu karty,
     ≥0 przed cofnięciem zegara (nigdy ujemny krok fizyki) */
  const dtMs = Math.min(Math.max(now - game.lastTime, 0), 50);
  game.lastTime = now;
  const dt = dtMs / 1000;

  /* Ruch butelki — dwa tory sterowania, obsługiwane w trakcie rozgrywki:
     1) klawiatura: krok przy naciśnięciu (obsłużony w pressKey), a przy
        przytrzymaniu ruch ciągły rozpędzający się do pełnej `bottleSpeed`
        (ta sama stała stoi w teście uczciwości) — kasuje cel wskaźnika;
     2) wskaźnik (mysz, palec, pozycja przysłana przez lekcję): butelka
        dogania cel wykładniczo, ze stałą czasową pointerSmoothingMs.
     Przy prefers-reduced-motion doganianie jest natychmiastowe;
     krok i rozpędzanie klawiatury to sterowanie, nie animacja — bez zmian. */
  if (game.state === STATES.PLAYING) {
    if (game.keys.left || game.keys.right) {
      clearPointerTarget();               // klawisz przejmuje sterowanie
      let dx = 0;
      if (game.keys.left) {
        game.keyHold.left += dtMs;
        dx -= keyVelocity(game.keyHold.left) * dt;
      }
      if (game.keys.right) {
        game.keyHold.right += dtMs;
        dx += keyVelocity(game.keyHold.right) * dt;
      }
      if (dx !== 0) {
        game.bottleX += dx;
        clampBottle();
        renderBottle();
      }
    } else if (game.targetX !== null) {
      const diff = game.targetX - game.bottleX;
      if (Math.abs(diff) < 0.5 || prefersReducedMotion()) {
        game.bottleX = game.targetX;
      } else {
        const tau = GAME_CONFIG.pointerSmoothingMs / 1000;
        game.bottleX += diff * (1 - Math.exp(-dt / tau));
      }
      clampBottle();
      renderBottle();
    }
  }

  if (game.state === STATES.PLAYING) {
    updatePan(dt);                          // patrol patelni trwa we wszystkich fazach

    switch (game.phase) {
      case "waitPan":                       // przerwa między kroplami
        game.phaseTimer -= dtMs;
        if (game.phaseTimer <= 0) {
          game.phase = "armed";
        }
        break;
      case "armed":                         // test uczciwości: czekamy na osiągalność
        if (spoutInReachBand() && dropIsReachableNow()) {
          spawnDrop();                      // kropla z AKTUALNEJ pozycji wylewu
          game.phase = "falling";
        }
        break;
      case "falling":                       // kropla w locie
        updateDrop(dt);
        break;
      case "lifePause":                     // po utracie życia: komunikat, gramy dalej
        game.phaseTimer -= dtMs;
        if (game.phaseTimer <= 0) {
          el.splash.classList.add("is-hidden");
          game.phase = "waitPan";
          game.phaseTimer = currentSpawnDelay();
        }
        break;
    }
  } else if (game.state === STATES.MISSED && game.phase === "missWait") {
    game.phaseTimer -= dtMs;
    if (game.phaseTimer <= 0) {
      game.phase = "idle";
      /* neutralna zapowiedź spokojniejszego tempa, gdy KOLEJNA próba
         będzie trzecią lub późniejszą */
      el.assistNote.classList.toggle("is-hidden", game.attempt + 1 < 3);
      showOverlay(el.screenMiss);
      el.btnRetry.focus();
    }
  } else if (game.state === STATES.RESTARTING) {
    game.countdownLeft -= dtMs;
    if (game.countdownLeft <= 0) {
      game.countdownValue--;
      if (game.countdownValue <= 0) {
        el.countdown.classList.add("is-hidden");
        const after = game.afterCountdown;
        game.afterCountdown = null;
        if (after) after();
      } else {
        el.countdownNum.textContent = String(game.countdownValue);
        game.countdownLeft = GAME_CONFIG.countdownTick;
      }
    }
  }
}

function loop(now) {
  stepGame(now);
  requestAnimationFrame(loop);
}

/* ══════════════ 13. PAUZA I WIDOCZNOŚĆ ══════════════ */

function pauseGame() {
  /* pauzujemy tylko aktywną rozgrywkę lub odliczanie do niej */
  if (game.state !== STATES.PLAYING && game.state !== STATES.RESTARTING) return;

  if (game.state === STATES.RESTARTING) {
    /* przerwane odliczanie — tryb wznowienia wynika z JAWNEGO celu
       odliczania, nie z samego stanu RESTARTING. Przerwane odliczanie
       wznowieniowe NIE może skasować wyniku, żyć ani numeru próby. */
    el.countdown.classList.add("is-hidden");
    game.afterCountdown = null;
    setState(STATES.PAUSED);
    game.resumeMode = game.countdownKind === "resume" ? "continue" : "attempt";
  } else {
    setState(STATES.PAUSED);
    game.resumeMode = "continue";    // wznowienie = kontynuacja od bieżącego stanu
  }
  showOverlay(el.screenPause);
  announce("Gra wstrzymana.");
}

function resumeGame() {
  if (game.state !== STATES.PAUSED) return;
  if (game.resumeMode === "attempt") {
    startAttempt();                  // przerwane odliczanie STARTOWE → ta sama nowa próba
    return;
  }
  /* kontynuacja: odliczanie od 3, ale bez cleanupRound() — caught, życia,
     attempt, faza, butelka, patelnia i lecąca kropla zostają nietknięte */
  startCountdown(() => {
    setState(STATES.PLAYING);        // wracamy dokładnie do przerwanej fazy
  }, "resume");
}

/* ══════════════ 14. STEROWANIE ══════════════ */

/* Czy gra działa w ramce lekcji. Od tego zależy polityka pauzy (patrz niżej)
   oraz filtr nadawcy komunikatów sterujących. */
const EMBEDDED = (() => {
  try { return window.parent !== window; } catch (e) { return true; }
})();

/* N4 — pozycja wskaźnika liczona na CAŁYM dokumencie ramki, nie tylko na
   planszy. Dzięki temu wyjechanie kursorem poza planszę (albo poza ramkę,
   dopóki zdarzenia trafiają do tego dokumentu) nie „zamraża” butelki —
   pozycja jest po prostu przycinana do krawędzi planszy. */
function onPointerMove(e) {
  if (game.state !== STATES.PLAYING) return;
  const rect = el.board.getBoundingClientRect();
  setPointerTarget(e.clientX - rect.left);
}

/* N4.1 — KLAWIATURA PRECYZYJNA.
   Wspólny tor dla strzałek własnych i przysłanych przez lekcję (k08:key).

   Jedno krótkie naciśnięcie = mały KROK (keyStepRatio szerokości planszy).
   Przytrzymanie: po keyHoldDelayMs ruch staje się ciągły i rozpędza się
   od keyRampStart do PEŁNEJ bottleSpeed w keyRampMs. Pełna prędkość przy
   przytrzymaniu zostaje nienaruszona, więc dropIsReachableNow() — który
   liczy zasięg właśnie z bottleSpeed — pozostaje prawdziwy.

   Auto-repeat systemowy jest odfiltrowany (`e.repeat` + strażnik stanu
   klawisza), więc jedno fizyczne naciśnięcie daje dokładnie jeden krok. */

function keyStepPx() {
  return GAME_CONFIG.keyStepRatio * metrics.W;
}

/* prędkość ciągłego ruchu po `heldMs` trzymania klawisza (px/s; 0 = jeszcze krok) */
function keyVelocity(heldMs) {
  const after = heldMs - GAME_CONFIG.keyHoldDelayMs;
  if (after <= 0) return 0;
  const t = Math.min(after / GAME_CONFIG.keyRampMs, 1);
  const ramp = GAME_CONFIG.keyRampStart + (1 - GAME_CONFIG.keyRampStart) * t;
  return GAME_CONFIG.bottleSpeed * metrics.W * ramp;
}

function pressKey(side) {
  if (game.keys[side]) return;            // już wciśnięty → żadnej kaskady
  game.keys[side] = true;
  game.keyHold[side] = 0;
  if (game.state !== STATES.PLAYING) return;
  clearPointerTarget();                   // klawisz przejmuje sterowanie
  game.bottleX += (side === "left" ? -1 : 1) * keyStepPx();
  clampBottle();
  renderBottle();
}

function releaseKey(side) {
  game.keys[side] = false;
  game.keyHold[side] = 0;
}

function setKey(key, down) {
  const side = key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : null;
  if (!side) return;
  if (down) pressKey(side); else releaseKey(side);
}

function releaseKeys() {
  releaseKey("left");
  releaseKey("right");
}

/* gra przejmuje fokus, żeby własne strzałki działały od razu po dotknięciu
   planszy — bez konieczności klikania w ramkę „na ślepo” */
function grabFocus() {
  try { window.focus(); } catch (e) {}
}

/* N4 — STEROWANIE Z LEKCJI (opcjonalne; gra działa w pełni bez niego).
   Przyjmujemy wyłącznie komunikaty od okna nadrzędnego:
     { type: "k08:pointer", xRatio: 0..1 }   — pozycja względem szerokości planszy
     { type: "k08:key", key: "ArrowLeft"|"ArrowRight", down: true|false }
   Nic innego nie jest interpretowane. */
function bindParentBridge() {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;         // tylko lekcja-rodzic
    const data = e.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "k08:pointer") {
      const r = Number(data.xRatio);
      if (!isFinite(r)) return;
      const ratio = Math.min(Math.max(r, 0), 1);
      setPointerTarget(ratio * metrics.W);
      return;
    }

    if (data.type === "k08:key") {
      if (data.key !== "ArrowLeft" && data.key !== "ArrowRight") return;
      if (data.down) clearPointerTarget();
      setKey(data.key, !!data.down);
    }
  });
}

function bindControls() {
  /* mysz + dotyk: nasłuch na całym dokumencie ramki */
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerdown", (e) => {
    grabFocus();
    onPointerMove(e);
  });

  /* dotknięcie planszy = fokus dla klawiatury */
  el.board.addEventListener("pointerenter", grabFocus);

  /* blokada przewijania i gestów dotykowych w obrębie planszy */
  el.board.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  bindParentBridge();

  /* klawiatura: strzałki lewo–prawo (funkcja dostępności).
     `e.repeat` odrzucamy — auto-repeat systemu nie może sypać krokami. */
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (!e.repeat) setKey(e.key, true);
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") setKey(e.key, false);
  });

  /* przyciski ekranów — chronione stanem, więc szybkie wielokrotne
     kliknięcia nie uruchomią dwóch prób ani dwóch timerów */
  el.btnStart.addEventListener("click", () => {
    if (game.state !== STATES.START) return;
    initAudio();                      // audio odblokowane gestem użytkownika
    grabFocus();                      // strzałki działają od razu po starcie
    startAttempt();
  });

  el.btnRetry.addEventListener("click", () => {
    if (game.state !== STATES.MISSED) return;
    /* numer pełnej próby rośnie WYŁĄCZNIE tutaj — po utracie trzeciego
       życia. Pauza, blur, zmiana widoczności ani przerwane odliczanie
       nie przechodzą przez ten przycisk, więc nie zawyżają licznika. */
    game.attempt++;
    startAttempt();
  });

  el.btnResume.addEventListener("click", resumeGame);

  /* prototyp: przycisk tylko potwierdza — zapis litery nastąpi w lekcji */
  el.btnNext.addEventListener("click", () => {
    if (game.state !== STATES.WON) return;
    announce("Litera Z gotowa. Zapis w Aktach sprawy nastąpi w pełnej lekcji.");
    el.btnNext.disabled = true;
    el.btnNext.textContent = "LITERA Z GOTOWA ✓";
  });

  el.soundBtn.addEventListener("click", () => setSound(!soundEnabled));

  /* ══ PAUZA — polityka zależna od trybu (N4/i) ══
     Samodzielne okno: bez zmian — ukrycie karty ORAZ każda utrata fokusu.
     W ramce lekcji: pauzujemy tylko przy ukryciu karty oraz przy blurze
     SZTUCZNYM (isTrusted === false), który lekcja wysyła przy wyjściu z
     ekranu gry. Prawdziwą utratę fokusu ignorujemy — inaczej kliknięcie
     w treść lekcji zapauzowałoby grę i sterowanie przekazywane przez
     k08:pointer / k08:key trafiałoby w martwy punkt.
     Klawisze zwalniamy ZAWSZE, żeby butelka nie jechała w nieskończoność. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { releaseKeys(); pauseGame(); }
  });
  window.addEventListener("blur", (e) => {
    releaseKeys();
    if (EMBEDDED && e.isTrusted !== false) return;   // realny blur w ramce: ignorujemy
    pauseGame();
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) pauseGame();
      }
    }, { threshold: 0.4 });
    io.observe(el.game);
  }

  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", () => setTimeout(measure, 250));
}

/* ══════════════ 15. OPCJONALNA PODMIANA GRAFIK ══════════════
   Sterowana flagami GAME_CONFIG.useImages — po dodaniu plików .webp
   do assets/images wystarczy przestawić flagę na true. Mechanika gry
   pozostaje bez zmian; przy braku flag działają wbudowane SVG/CSS. */

function makeImg(src) {
  const img = new Image();
  img.src = src;
  img.alt = "";
  img.draggable = false;
  img.style.cssText = "display:block;width:100%;height:auto;";
  return img;
}

function initOptionalImages() {
  const use = GAME_CONFIG.useImages;
  if (use.background) {
    el.bg.style.backgroundImage = "url(assets/images/background.webp)";
    el.bg.classList.add("has-image");
  }
  if (use.oilDrop)   el.drop.replaceChildren(makeImg("assets/images/oil-drop.webp"));
  if (use.oilSplash) el.splash.replaceChildren(makeImg("assets/images/oil-splash.webp"));
  if (use.pans) {
    /* orientacja przez podmianę pliku zamiast odbicia CSS */
    const img = makeImg("assets/images/pan-left.webp");
    img.addEventListener("load", measure, { once: true });   // proporcje mogą różnić się od SVG
    el.pan.replaceChildren(img);
    const observer = new MutationObserver(() => {
      const want = el.pan.classList.contains("face-right")
        ? "assets/images/pan-right.webp" : "assets/images/pan-left.webp";
      if (!img.src.endsWith(want)) img.src = want;
    });
    observer.observe(el.pan, { attributes: true, attributeFilter: ["class"] });
  }
}

/* ══════════════ 16. INICJALIZACJA ══════════════ */

function init() {
  /* litera nagrody z konfiguracji */
  el.rewardLetter.textContent = GAME_CONFIG.rewardLetter;
  el.rewardLetter.setAttribute("aria-label", `Litera ${GAME_CONFIG.rewardLetter}`);
  el.rewardLetterInline.textContent = GAME_CONFIG.rewardLetter;

  /* ustawienie dźwięku zapamiętane w sesji */
  let saved = null;
  try { saved = sessionStorage.getItem("selekt_zlap_olej_sound"); } catch (e) {}
  setSound(saved !== "0");

  initHints();

  measure();
  game.bottleX = metrics.W / 2;
  clampBottle();
  renderBottle();
  updateCounter();
  updateLives();

  bindControls();
  initOptionalImages();

  /* początkowy fokus na przycisku startowym — po związaniu kontrolek,
     przy widocznym ekranie startowym; bez automatycznego startu gry */
  try { el.btnStart.focus(); } catch (e) {}

  /* Hak deweloperski WYŁĄCZNIE za flagą ?dev=1 — do testów przebiegu.
     Nie zmienia produkcyjnej mechaniki i nie jest widoczny w interfejsie. */
  if (new URLSearchParams(location.search).get("dev") === "1") {
    let devNow = null;
    window.K08_DEV = {
      catch() { if (game.state === STATES.PLAYING) { hideDrop(); onCatch(); } },
      miss()  { if (game.state === STATES.PLAYING) { game.drop.x = game.bottleX; onMiss(); } },
      /* deterministyczne krokowanie PRAWDZIWEJ pętli syntetycznym zegarem —
         ukryte karty zamrażają rAF; tick nie planuje dodatkowych klatek */
      tick(ms = 16.7, steps = 1) {
        /* synchronizacja z lastTime: pojedyncze „zbłąkane" klatki rAF
           (np. migoczący kompozytor) nie mogą cofnąć syntetycznego zegara */
        for (let i = 0; i < steps; i++) {
          devNow = Math.max(devNow ?? game.lastTime, game.lastTime) + ms;
          stepGame(devNow);
        }
      },
      setBottleX(x) { game.bottleX = x; clampBottle(); renderBottle(); },
      state() {
        return {
          state: game.state, phase: game.phase,
          caught: game.caught, lives: game.lives, attempt: game.attempt,
          assist: assistActive(),
          dropSpeed: Math.round(currentDropSpeed()),
          spawnDelay: Math.round(currentSpawnDelay()),
          panSpeed: Math.round(currentPanSpeed()),
          mouthHalf: Math.round(currentMouthHalf()),
          completionSent: game.completionSent,
          /* N4 — podgląd sterowania */
          embedded: EMBEDDED,
          bottleX: Math.round(game.bottleX),
          targetX: game.targetX === null ? null : Math.round(game.targetX),
          keys: { left: game.keys.left, right: game.keys.right },
          keyHold: { left: Math.round(game.keyHold.left), right: Math.round(game.keyHold.right) },
          keyStepPx: Math.round(keyStepPx()),
        };
      },
    };
  }

  game.lastTime = performance.now();
  requestAnimationFrame(loop);
}

init();
