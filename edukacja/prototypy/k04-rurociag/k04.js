/* ═══════════════════════════════════════════════════════════════════
   „Akcja kanalizacja” — gra labiryntowa e-lekcji SELEKT (klasy 4–5)
   Klocek K04, Trop 3. Zastępuje moduł Genially „Rurociąg”.

   Uczeń prowadzi wodę rurami od lejka do rury zatkanej zastygłym tłuszczem.
   Przebyte rury robią się CAŁE niebieskie: nad oryginałem leży druga kopia
   labiryntu z rurami przebarwionymi na błękit, odsłaniana maską wzdłuż trasy.
   Dwa obrazy wczytane raz na starcie, zero doładowań między krokami (to
   właśnie zabijało wersję Genially: każdy krok był nowym obrazem 6901 px).
   Sterowanie: same niebieskie strzałki — jaśniejsza cofa, przekreślona
   oznacza rurę już wypełnioną. Bez limitu czasu, bez przegranej.

   KONTRAKT INTEGRACYJNY (patrz README):
     • po dojściu do zatoru: `k04:completed` na `window`, bubbles, DOKŁADNIE RAZ
       detail: { letter: "P", moves, wrongTurns, undos }
     • gra NIE przyznaje litery i niczego nie zapisuje — literę P zapisuje
       strona lekcji (lesson-state.js: unlockLetterEntry)
     • most z lekcji (opcjonalny): { type: "k04:key", key, down } od window.parent

   Dane labiryntu siedzą w k04-mapa.js (K04_MAP) — ten plik ich nie zmienia.
   Zero zależności zewnętrznych.
   ═══════════════════════════════════════════════════════════════════ */

"use strict";

/* ══════════════ 1. FLAGI ══════════════ */

const DEBUG = (() => {
  try { return new URLSearchParams(location.search).get("debug") === "1"; }
  catch (e) { return false; }
})();

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e) { return false; }
}

const REWARD_LETTER = "P";
const MOVE_MS = 600;            /* czas przepływu wody przez jeden odcinek */

/* Odsunięcie przycisków od węzła. Liczone w PIKSELACH, nie na sztywno w
   procentach: przycisk ma zawsze min. 48 px, więc na małym kadrze telefonu
   stały procent kazałby strzałkom na siebie nachodzić. Warunek, który musi
   być spełniony: dwie prostopadłe strzałki są od siebie o r·√2 — to musi
   być ≥ średnica przycisku, stąd mnożnik 0,80.                              */
const layout = { btn: 48, r: 8 };   /* btn w px, r w % kadru — liczy measure() */

/* ══════════════ 2. KOMUNIKATY HYDRAULIKA ══════════════

   ZASADA TWARDA: jeden komunikat to NIEROZŁĄCZNA trójka
   { plate, text, voice } o tej samej treści. Kod losuje i podaje dalej
   CAŁY obiekt — nigdy pojedyncze pole. `text` jest przepisany DOSŁOWNIE
   z dymka na planszy, więc podpis pod kartą, obrazek i nagranie zawsze
   mówią to samo. Spójności pilnuje test `K04_DEV.checkTriples()`.

   Trzy nagrania z materiału NIE MAJĄ swojej planszy („Niestety to zły
   ruch”, „Już prawie finish”, „Hola, hola wydłużasz trasę”). Decyzja
   klienta: NIE dodajemy dźwięków bez powiązanej grafiki — te pliki zostają
   w assets, ale nic ich nie odtwarza.

   KIEDY HYDRAULIK MÓWI: wyłącznie po WSKAZANIU RURY. Cofanie (strzałka
   „wróć” albo Backspace) jest ciche — do aria-live idzie sam neutralny
   komunikat o przesunięciu wody, bez głosu i bez karty.               */

const A = "assets/audio/";
const P = "assets/images/hydraulik/";

const SAY = {
  /* ślepy zaułek — po komentarzu woda cofa się sama */
  deadEnd: [
    { plate: "nie-tedy-droga",    text: "Nie tędy droga!",                             voice: "zle-nie-tedy" },
    { plate: "zawroty-glowy",     text: "Ojoj! Chyba zakręciło mi się w głowie.",      voice: "zle-zawroty" },
    { plate: "na-moje-oko",       text: "Na moje oko nic z tego nie będzie.",          voice: "zle-na-moje-oko" },
    { plate: "co-ja-ci-zrobilem", text: "Co ja Ci zrobiłem?! Proszę, zmień kierunek.", voice: "zle-co-ja-ci-zrobilem" },
  ],
  /* ruch, który oddala od zatoru, ale prowadzi dalej — bez cofania */
  doubt:   { plate: "czy-dobra-droga",   text: "Hm… Czy to na pewno dobra droga? Spróbuj jeszcze raz.", voice: "watp-czy-dobra" },
  /* próba wpłynięcia w rurę, którą woda już płynie (blokada pętli)
     albo trzy złe ruchy z rzędu — zawsze po WSKAZANIU rury, nigdy po cofnięciu */
  loop:    { plate: "chcesz-sie-krecic", text: "Nie żartuj. Chcesz tak kręcić się w kółko?",            voice: "dlugo-krecic" },
  /* eskalacja: pięć złych ruchów z rzędu */
  tooLong: { plate: "nie-mamy-dnia",     text: "Rety… nie mamy na to całego dnia!",                     voice: "dlugo-nie-mamy-dnia" },
  /* dwa ruchy od zatoru */
  near:    { plate: "prawie-na-miejscu", text: "Jesteś prawie na miejscu! Ale znajdź krótszą trasę.",   voice: "blisko-prawie" },
  /* finał */
  win:     { plate: "swietna-robota",    text: "Świetna robota! Wierzyłem w Ciebie.",                   voice: "final-gratulacje" },
};

/* Płaska lista wszystkich trójek. showCard() przyjmuje WYŁĄCZNIE obiekt
   z tej listy — to strukturalna gwarancja, że karta nigdy nie pokaże
   planszy z jednego zestawu i podpisu z drugiego. */
const SAY_ALL = [].concat(SAY.deadEnd, [SAY.doubt, SAY.loop, SAY.tooLong, SAY.near, SAY.win]);
SAY_ALL.forEach(Object.freeze);

/* Dobry ruch — SAM GŁOS, bez karty i bez planszy. Nie ma tu czego rozjechać,
   więc pięć wariantów losujemy swobodnie (nigdy dwa razy z rzędu). */
const VOICE_OK = ["ok-1", "ok-2", "ok-3", "ok-4", "ok-5"];

/* ══════════════ 3. GRAF ══════════════
   Z K04_MAP budujemy: indeks węzłów, listę krawędzi przy węźle,
   odległość każdego węzła od zatoru (BFS od OBU końców zatkanej rury)
   i trasę wzorcową — najkrótszą drogę z lejka, rysowaną w ?debug=1. */

const NODE = new Map(K04_MAP.nodes.map((n) => [n.id, n]));
const INCIDENT = new Map(K04_MAP.nodes.map((n) => [n.id, []]));
K04_MAP.edges.forEach((e, i) => {
  INCIDENT.get(e.a).push(i);
  INCIDENT.get(e.b).push(i);
});

const GOALS = new Set(K04_MAP.goals);

/* Odległość do najbliższego końca zatoru, w RUCHACH (nie w metrach rury) —
   po niej rozpoznajemy „ruch do przodu” i „prawie na miejscu”. */
const DIST = (() => {
  const d = new Map(K04_MAP.goals.map((g) => [g, 0]));
  const q = K04_MAP.goals.slice();
  while (q.length) {
    const u = q.shift();
    for (const ei of INCIDENT.get(u)) {
      const e = K04_MAP.edges[ei];
      const v = e.a === u ? e.b : e.a;
      if (!d.has(v)) { d.set(v, d.get(u) + 1); q.push(v); }
    }
  }
  return d;
})();

/* Trasa wzorcowa: schodzimy po malejącej odległości. */
const REF_PATH = (() => {
  const out = [];
  let cur = K04_MAP.entry;
  let guard = 0;
  while (DIST.get(cur) > 0 && guard++ < 200) {
    const step = INCIDENT.get(cur)
      .map((ei) => [ei, other(ei, cur)])
      .find(([, v]) => DIST.get(v) === DIST.get(cur) - 1);
    if (!step) break;
    out.push({ edge: step[0], from: cur, to: step[1] });
    cur = step[1];
  }
  return out;
})();

function other(edgeIndex, fromId) {
  const e = K04_MAP.edges[edgeIndex];
  return e.a === fromId ? e.b : e.a;
}

/* Polilinia krawędzi zorientowana OD podanego węzła. */
function orientedPoints(edgeIndex, fromId) {
  const e = K04_MAP.edges[edgeIndex];
  return e.a === fromId ? e.p : e.p.slice().reverse();
}

function pathD(points) {
  let d = "M " + points[0][0] + " " + points[0][1];
  for (let i = 1; i < points.length; i++) d += " L " + points[i][0] + " " + points[i][1];
  return d;
}

/* Kierunek wyjścia z węzła: bierzemy pierwszy odcinek dłuższy niż 1,2 %
   kadru, żeby krótka „szyjka” kolanka nie przekłamała strzałki. */
function dirFrom(edgeIndex, fromId) {
  const pts = orientedPoints(edgeIndex, fromId);
  const p0 = pts[0];
  let dx = 0, dy = 0;
  for (let k = 1; k < pts.length; k++) {
    dx = pts[k][0] - p0[0];
    dy = pts[k][1] - p0[1];
    if (Math.hypot(dx, dy) > 1.2) break;
  }
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U");
}

const DIR_VEC   = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
const DIR_LABEL = { L: "w lewo", R: "w prawo", U: "w górę", D: "w dół" };
const KEY_DIR   = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D" };

/* ══════════════ 4. STAN ══════════════ */

const state = {
  mode: "intro",          // intro | play | busy | final
  cur: K04_MAP.entry,
  trail: [],              // stos przebytych odcinków: { edge, from, to }
  moves: 0,
  wrongTurns: 0,          // ślepe zaułki + ruchy oddalające od zatoru (payload)
  deadEnds: 0,            // same ślepe zaułki — tablica końcowa pokazuje TO,
                          // payload k04:completed zostaje bez zmian
  continueSent: false,    // k04:continue emitowane tylko raz
  undos: 0,
  badStreak: 0,           // złe ruchy z rzędu (zeruje ruch do przodu)
  loop3Said: false,
  loop5Said: false,
  nearSaid: false,
  doubtCount: 0,
  lastOkVoice: "",
  completionSent: false,
  cardTimer: 0,
  afterCard: null,        // co zrobić po zamknięciu karty
};

/* ══════════════ 5. ELEMENTY ══════════════ */

const el = {
  game:        document.getElementById("game"),
  scene:       document.getElementById("scene"),
  mazeImg:     document.getElementById("mazeImg"),
  trailDone:   document.getElementById("trailDone"),
  trailLive:   document.getElementById("trailLive"),
  blueLayer:   document.getElementById("blueLayer"),
  arrows:      document.getElementById("arrows"),
  alarmFlash:  document.getElementById("alarmFlash"),
  hint:        document.getElementById("hint"),
  card:        document.getElementById("card"),
  cardImg:     document.getElementById("cardImg"),
  cardText:    document.getElementById("cardText"),
  cardClose:   document.getElementById("cardClose"),
  srStatus:    document.getElementById("srStatus"),
  statMoves:   document.getElementById("statMoves"),
  statUndos:   document.getElementById("statUndos"),
  btnSound:    document.getElementById("btnSound"),
  finalBoard:  document.getElementById("finalBoard"),
  valMoves:    document.getElementById("valMoves"),
  valDead:     document.getElementById("valDead"),
  valUndos:    document.getElementById("valUndos"),
  screenIntro: document.getElementById("screenIntro"),
  screenFinal: document.getElementById("screenFinal"),
  finalScore:  document.getElementById("finalScore"),
  debugSvg:    document.getElementById("debugSvg"),
  debugReadout:document.getElementById("debugReadout"),
};

const SVGNS = "http://www.w3.org/2000/svg";

/* ══════════════ 6. DŹWIĘK ══════════════
   Jeden kanał na głos hydraulika (nowy komentarz przerywa poprzedni),
   osobny na melodię w tle i jingiel finału. Brak pliku MP3 nigdy nie
   zatrzymuje gry. Nic nie gra przed kliknięciem „Schodzimy pod ziemię” —
   to gest ucznia odblokowuje audio, bez osobnej nakładki „Play”.
   Głosy „dobry ruch” NIE przerywają trwającej wypowiedzi: przy 14 ruchach
   hydraulik gadałby jeden przez drugiego. Komentarze o błędach, wątpliwości
   i finale mają pierwszeństwo i przerywają zawsze.                        */

const audio = {
  on: true,
  cache: new Map(),
  voice: null,          // aktualnie mówiący element
  melody: null,
};

function clip(name, volume, loop) {
  if (!audio.cache.has(name)) {
    const a = new Audio(A + name + ".mp3");
    a.preload = "auto";
    a.volume = volume;
    if (loop) a.loop = true;
    a.addEventListener("error", () => { /* cicho: gra działa bez audio */ });
    audio.cache.set(name, a);
  }
  return audio.cache.get(name);
}

function duckMelody(down) {
  if (audio.melody) audio.melody.volume = down ? 0.05 : 0.16;
}

/* priority=false → odezwie się tylko, gdy hydraulik akurat milczy */
function say(name, priority) {
  if (!audio.on || !name) return null;
  if (!priority && audio.voice && !audio.voice.paused && !audio.voice.ended) return null;
  try {
    if (audio.voice) { audio.voice.pause(); audio.voice.currentTime = 0; }
    const a = clip(name, 0.95, false);
    a.currentTime = 0;
    audio.voice = a;
    duckMelody(true);
    a.onended = () => { duckMelody(false); };
    const p = a.play();
    if (p && p.catch) p.catch(() => { duckMelody(false); });
    return a;
  } catch (e) { return null; }
}

function startMelody() {
  if (!audio.on) return;
  try {
    audio.melody = clip("melodia", 0.16, true);
    const p = audio.melody.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* melodia jest ozdobą, nie warunkiem gry */ }
}

function stopAllAudio() {
  audio.cache.forEach((a) => { try { a.pause(); a.currentTime = 0; } catch (e) {} });
  audio.voice = null;
}

el.btnSound.addEventListener("click", () => {
  audio.on = !audio.on;
  el.btnSound.setAttribute("aria-pressed", String(audio.on));
  el.btnSound.textContent = audio.on ? "Dźwięk: włączony" : "Dźwięk: wyłączony";
  if (!audio.on) stopAllAudio();
  else if (state.mode !== "intro") startMelody();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && audio.melody) { try { audio.melody.pause(); } catch (e) {} }
  else if (!document.hidden && audio.on && state.mode !== "intro") startMelody();
});

/* ══════════════ 7. WSTĘGA WODY ══════════════

   Nie rysujemy linii NA rurze — odsłaniamy CAŁĄ RURĘ w kolorze wody.
   Nad oryginałem leży druga kopia labiryntu, w której zieleń rur została
   przebarwiona na błękit (kolory nauczone wprost ze slajdów Genially;
   zawory, manometry, zator i piasek zostały nietknięte, a alfa jest obcięta
   do maski rur). Widać z niej tylko to, co odsłoni maska.

   Maska ma dwa obrysy:
     #trailDone — wszystkie ukończone odcinki SKLEJONE w ciągłe polilinie,
     #trailLive — odcinek animowany w tej chwili (dash-offset).
   Dzięki sklejaniu na skrzyżowaniu nie spotykają się dwie zaokrąglone
   końcówki (to dawało efekt „doklejanych kawałków”), tylko zwykłe
   załamanie linii — wstęga jest jedna i ciągła.                        */

/* Skleja kolejne odcinki trasy w ciągłe polilinie. Nowa polilinia zaczyna
   się dopiero tam, gdzie odcinek nie jest kontynuacją poprzedniego. */
function runs(trail) {
  const out = [];
  let cur = null, head = null;
  for (const t of trail) {
    const p = orientedPoints(t.edge, t.from);
    if (cur && head === t.from) cur.push.apply(cur, p.slice(1));
    else { cur = p.slice(); out.push(cur); }
    head = t.to;
  }
  return out;
}

/* Jedna ścieżka SVG może mieć wiele podścieżek — całą ukończoną trasę
   zmieścimy więc w jednym elemencie. */
function renderDone(trail) {
  const d = runs(trail).map(pathD).join(" ");
  el.trailDone.setAttribute("d", d);
}

function clearLive() {
  el.trailLive.setAttribute("d", "");
  el.trailLive.style.strokeDasharray = "";
  el.trailLive.style.strokeDashoffset = "";
}

/* Animacja przepływu: dash-offset od pełnej długości do zera (wpływanie)
   albo odwrotnie (cofanie). Przy ograniczonym ruchu — skok bez animacji. */
function flow(points, reverse, done) {
  const p = el.trailLive;
  p.setAttribute("d", pathD(points));

  let len = 0;
  try { len = p.getTotalLength(); } catch (e) { len = 0; }

  if (!len || reducedMotion()) {
    p.style.strokeDasharray = "";
    p.style.strokeDashoffset = "";
    if (done) done();
    return;
  }

  const from = reverse ? 0 : len;
  const to   = reverse ? len : 0;
  p.style.strokeDasharray = len + " " + len;
  p.style.strokeDashoffset = String(from);

  const t0 = performance.now();
  function step(now) {
    const k = Math.min(1, (now - t0) / MOVE_MS);
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    p.style.strokeDashoffset = String(from + (to - from) * eased);
    if (k < 1) { requestAnimationFrame(step); return; }
    if (done) done();
  }
  requestAnimationFrame(step);
}

/* ══════════════ 8. STRZAŁKI ══════════════

   Jedyny element sterujący. Wszystkie są niebieskie — różni je odcień
   i rola, nie kolor:

     naprzód  (act--fwd)  rura pusta; klik = ruch
     wróć     (act--back) rura, którą woda przypłynęła; klik = COFNIĘCIE
                          — błękit ściera się z ostatniego odcinka
     zajęta   (act--off)  rura już wypełniona, ale NIE powrót; klik nie
                          rusza wody, tylko wywołuje komentarz o kręceniu
                          się w kółko (wariant C-A: blokada pętli)

   Osobnego przycisku „Cofnij” nie ma — jego rolę przejęła strzałka „wróć”.
   Backspace nadal cofa, tylko bez własnej ikony.                        */

const SVG_ARROW = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<circle class="act-bg" cx="50" cy="50" r="45"/>' +
  '<path class="act-fg" d="M50 24 L74 58 H60 V76 H40 V58 H26 Z"/></svg>';

const DIR_ROT = { U: 0, R: 90, D: 180, L: 270 };

function clearArrows() { el.arrows.textContent = ""; }

/* Ostatni przebyty odcinek — strzałka wzdłuż niego jest cofnięciem. */
function backEdge() {
  const last = state.trail[state.trail.length - 1];
  return last && last.to === state.cur ? last.edge : -1;
}

function renderArrows() {
  clearArrows();
  if (state.mode !== "play") return;

  const node = NODE.get(state.cur);
  const R = layout.r;
  const back = backEdge();
  const filled = new Set(state.trail.map((t) => t.edge));

  for (const ei of INCIDENT.get(state.cur)) {
    /* Strzałki z powrotem do lejka nie pokazujemy: to nie jest wybór trasy.
       Z lejka się wypływa, a nie wpływa. */
    if (other(ei, state.cur) === K04_MAP.entry) continue;

    const kind = ei === back ? "back" : (filled.has(ei) ? "off" : "fwd");
    const dir = dirFrom(ei, state.cur);
    const v = DIR_VEC[dir];

    const b = document.createElement("button");
    b.type = "button";
    b.className = "act act--" + kind;
    b.style.left = (node.x + v[0] * R) + "%";
    b.style.top = (node.y + v[1] * R) + "%";
    b.dataset.dir = dir;
    b.dataset.edge = String(ei);
    b.dataset.kind = kind;
    b.setAttribute("aria-label",
      kind === "back" ? "Wróć tą rurą — " + DIR_LABEL[dir]
      : kind === "off" ? "Tędy woda już płynęła — " + DIR_LABEL[dir]
      : "Puść wodę " + DIR_LABEL[dir]);
    b.innerHTML = SVG_ARROW;
    b.querySelector(".act-fg").setAttribute(
      "transform", "rotate(" + DIR_ROT[dir] + " 50 50)");

    if (kind === "off") {
      /* aria-disabled, nie disabled: przycisk ma zostać w kolejce Taba
         i po kliknięciu powiedzieć, DLACZEGO nic się nie stało. */
      b.setAttribute("aria-disabled", "true");
      const bar = document.createElementNS(SVGNS, "line");
      bar.setAttribute("class", "act-bar");
      bar.setAttribute("x1", "28"); bar.setAttribute("y1", "72");
      bar.setAttribute("x2", "72"); bar.setAttribute("y2", "28");
      b.querySelector("svg").appendChild(bar);
      b.addEventListener("click", refuseLoop);
    } else if (kind === "back") {
      b.addEventListener("click", () => undo("strzałka"));
    } else {
      b.addEventListener("click", () => move(ei, "klik"));
    }
    el.arrows.appendChild(b);
  }
}

/* Próba wpłynięcia w rurę, którą woda już płynie. Stan się nie zmienia —
   pada tylko komentarz. Dzięki temu kręcenie w kółko jest niemożliwe. */
function refuseLoop() {
  if (state.mode !== "play") return;
  state.mode = "busy";
  setBusy(true);
  showCard(SAY.loop, true, () => { resume(); });
}

function setBusy(busy) {
  el.arrows.classList.toggle("is-busy", busy);
}

/* ══════════════ 9. RUCH ══════════════ */

function say2(msg) {
  el.srStatus.textContent = msg;
}

function setHint(text) {
  el.hint.textContent = text;
}

function move(edgeIndex, source) {
  if (state.mode !== "play") return;
  const from = state.cur;
  const to = other(edgeIndex, from);

  state.mode = "busy";
  setBusy(true);
  clearArrows();

  const entry = { edge: edgeIndex, from, to };
  state.trail.push(entry);
  state.moves++;
  state.cur = to;
  updateStats();

  if (DEBUG) console.log("[k04] ruch " + from + " → " + to + " (" + source + ")");

  /* ukończona część zostaje jak była, nowy odcinek płynie w warstwie „live”;
     po animacji obie scalamy w jedną ciągłą polilinię */
  flow(orientedPoints(edgeIndex, from), false, () => {
    renderDone(state.trail);
    clearLive();
    afterArrive(entry);
  });
}

function afterArrive(entry) {
  const to = entry.to;

  /* 1. Meta — dojście do któregokolwiek końca zatkanej rury */
  if (GOALS.has(to)) { finish(); return; }

  const dNew = DIST.get(to);
  const dOld = DIST.get(entry.from);
  const deadEnd = INCIDENT.get(to).length === 1 && to !== K04_MAP.entry;

  /* 2. Ślepy zaułek — komentarz, potem woda cofa się sama */
  if (deadEnd) {
    state.wrongTurns++;
    state.deadEnds++;
    state.badStreak++;
    const v = SAY.deadEnd[Math.floor(Math.random() * SAY.deadEnd.length)];
    showCard(v, true, () => { retreat(); });
    return;
  }

  /* 3. Kręcenie się w kółko */
  if (dNew > dOld) {
    state.wrongTurns++;
    state.badStreak++;
    if (state.badStreak >= 5 && !state.loop5Said) {
      state.loop5Said = true;
      showCard(SAY.tooLong, true, () => { resume(); });
      return;
    }
    if (state.badStreak >= 3 && !state.loop3Said) {
      state.loop3Said = true;
      showCard(SAY.loop, true, () => { resume(); });
      return;
    }
    /* „Czy to na pewno dobra droga?” — co drugie oddalenie, żeby nie zrzędzić */
    state.doubtCount++;
    if (state.doubtCount % 2 === 1) { showCard(SAY.doubt, true, () => { resume(); }); return; }
    resume();
    return;
  }

  /* 4. Ruch do przodu */
  state.badStreak = 0;
  state.loop3Said = false;
  state.loop5Said = false;

  /* „Jesteś prawie na miejscu” — RAZ na całą grę. Powtórki grał wcześniej
     osobny krótszy plik, ale nie ma on swojej planszy, więc go nie używamy. */
  if (dNew <= 2 && !state.nearSaid) {
    state.nearSaid = true;
    showCard(SAY.near, true, () => { resume(); });
    return;
  }

  /* zwykły dobry ruch: głos tylko wtedy, gdy hydraulik akurat nie mówi */
  let pick = VOICE_OK[Math.floor(Math.random() * VOICE_OK.length)];
  let guard = 0;
  while (pick === state.lastOkVoice && guard++ < 8) {
    pick = VOICE_OK[Math.floor(Math.random() * VOICE_OK.length)];
  }
  if (say(pick, false)) state.lastOkVoice = pick;
  resume();
}

/* Powrót do gry po komentarzu, bez cofania wody. */
function resume() {
  state.mode = "play";
  setBusy(false);
  renderArrows();
  updateHint();
}

/* Cofnięcie automatyczne ze ślepego zaułka. */
function retreat() {
  const last = state.trail.pop();
  if (!last) { resume(); return; }
  state.mode = "busy";
  setBusy(true);
  clearArrows();
  state.cur = last.from;
  renderDone(state.trail);
  flow(orientedPoints(last.edge, last.from), true, () => {
    clearLive();
    say2("Woda wróciła na skrzyżowanie. Wybierz inną rurę.");
    resume();
  });
}

/* Cofnięcie na życzenie — bez kary i bez komentarza o błędzie. */
function undo(source) {
  if (state.mode !== "play" || !state.trail.length) return;
  const last = state.trail.pop();
  state.mode = "busy";
  setBusy(true);
  clearArrows();
  state.cur = last.from;
  state.undos++;
  state.badStreak = 0;
  updateStats();

  if (DEBUG) console.log("[k04] cofnięcie do " + last.from + " (" + source + ")");

  renderDone(state.trail);
  flow(orientedPoints(last.edge, last.from), true, () => {
    clearLive();
    /* COFANIE JEST CICHE. Hydraulik nie komentuje wycofywania się — odzywa
       się dopiero wtedy, gdy uczeń wskaże NOWĄ rurę. Do aria-live idzie sam
       neutralny stan: to nie jest kwestia hydraulika, tylko informacja dla
       czytnika ekranu, że woda się przesunęła. */
    say2("Cofnięto o jeden odcinek.");
    resume();
  });
}

/* ══════════════ 10. KARTA HYDRAULIKA ══════════════
   Karta leży w rogu, a nie na całym ekranie — uczeń ma widzieć,
   skąd woda się cofa. Zamyka się sama po wypowiedzi (albo po 3,2 s,
   gdy dźwięk jest wyłączony); „Rozumiem” przyspiesza. */

function showCard(item, autoClose, after) {
  /* Plansza, podpis i nagranie pochodzą z JEDNEGO obiektu. Strażnik nie
     wpuszcza niczego spoza katalogu SAY — gdyby ktoś kiedyś zbudował kartę
     „ręcznie”, zobaczy błąd zamiast rozjechanego komunikatu. */
  if (SAY_ALL.indexOf(item) < 0) {
    const msg = "[k04] karta hydraulika musi pochodzić z katalogu SAY";
    if (DEBUG) throw new Error(msg);
    console.error(msg, item);
    if (after) after();
    return;
  }
  state.afterCard = after || null;
  say2(item.text);

  if (item.plate) {
    el.cardImg.src = P + item.plate + ".webp";
    el.cardImg.alt = "Hydraulik mówi: " + item.text;
    el.cardImg.hidden = false;
  } else {
    el.cardImg.hidden = true;
  }
  el.cardText.textContent = item.text;
  el.card.hidden = false;
  el.card.classList.add("is-enter");
  requestAnimationFrame(() => { el.card.classList.remove("is-enter"); });

  const voice = say(item.voice, true);
  clearTimeout(state.cardTimer);

  if (!autoClose) return;

  if (voice && !voice.paused) {
    voice.onended = () => { duckMelody(false); closeCard(); };
    /* bezpiecznik: gdy zdarzenie `ended` nie przyjdzie (np. błąd pliku) */
    state.cardTimer = setTimeout(closeCard, 9000);
  } else {
    state.cardTimer = setTimeout(closeCard, 3200);
  }
}

function closeCard() {
  clearTimeout(state.cardTimer);
  if (el.card.hidden) return;
  el.card.hidden = true;
  const after = state.afterCard;
  state.afterCard = null;
  if (after) after();
}

/* Zamknięcie karty przez ucznia — przyciskiem albo klawiszem. Ucisza głos
   hydraulika, żeby nie mówił do pustego ekranu. */
function dismissCard() {
  if (audio.voice) { try { audio.voice.pause(); } catch (e) {} duckMelody(false); }
  closeCard();
}

el.cardClose.addEventListener("click", dismissCard);

/* ══════════════ 11. FINAŁ ══════════════ */

function finish() {
  state.mode = "final";
  clearArrows();
  setBusy(false);
  updateStats();

  el.alarmFlash.classList.add("is-on");
  say2("Woda dotarła do zatkanej rury. Zator znaleziony!");
  setHint("Zator znaleziony — hydraulik bierze się do pracy.");

  /* Plansza alarmu: zbliżenie zatkanej rury z materiału Genially.
     Karta zostaje na ekranie aż do panelu finałowego, więc nie ustawiamy
     żadnego licznika zamknięcia. */
  clearTimeout(state.cardTimer);
  state.afterCard = null;
  el.cardImg.src = "assets/images/zator-zblizenie.webp";
  el.cardImg.alt = "Zbliżenie rury zatkanej zastygłym, przypalonym tłuszczem.";
  el.cardImg.hidden = false;
  el.cardText.textContent = "Znaleziony! To ten zator.";
  el.cardClose.hidden = true;
  el.card.hidden = false;

  const wait = reducedMotion() ? 200 : 1400;

  setTimeout(() => {
    el.alarmFlash.classList.remove("is-on");
    /* rura udrożniona: podmiana JEDNEGO obrazu, ta sama geometria kadru */
    el.mazeImg.src = "assets/images/labirynt-drozny.webp";
    el.mazeImg.alt = "Ten sam labirynt rur — zatkana rura na dole jest już czysta i drożna.";
    say(SAY.win.voice, true);
    try {
      const j = clip("jingiel", 0.5, false);
      j.currentTime = 0;
      const p = j.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* jingiel jest ozdobą */ }
  }, wait);

  setTimeout(() => {
    fillBoard();
    el.finalScore.textContent =
      "Ruchy: " + state.moves + " · ślepe zaułki: " + state.deadEnds +
      " · cofnięcia: " + state.undos + ".";
    el.card.hidden = true;
    el.cardClose.hidden = false;
    el.game.dataset.state = "final";
    el.screenFinal.classList.remove("is-hidden");
    try { finalButton().focus(); } catch (e) { /* fokus jest miły, nie krytyczny */ }
    emitCompleted();
  }, wait + (reducedMotion() ? 300 : 2200));
}

/* ══════════════ 11a. PRÓG CZYTELNOŚCI TABLIC ══════════════

   Obie tablice mają treść WPALONĄ w grafikę, więc ich napisy kurczą się
   razem z obrazem. Zmierzone x-height najmniejszego wiersza to 1,23–1,39 %
   szerokości tablicy: przy 600 px daje to 7,4–8,3 px (czyta się jak tekst
   14–16 px), przy 366 px spada do 4,5–5,1 px, czyli jak tekst 9 px.

   Dlatego o postaci decyduje SZEROKOŚĆ, DO JAKIEJ TABLICA REALNIE SIĘ
   SKALUJE — nie media query na oknie. W lekcji gra siedzi w ramce o własnej
   wysokości: na laptopie 1366 × 768 okno jest szerokie, ale ramka może mieć
   600 px wysokości i tablica i tak by się skurczyła. Liczymy więc mniejszą
   z dwóch wartości: dostępnej szerokości i dostępnej wysokości przeliczonej
   przez proporcje tablicy.                                               */

const BOARD_MAX = 640;   /* dalej nie rośnie — tyle wystarczy do czytelności */
const BOARD_MIN = 600;   /* poniżej tego wpalony tekst jest za mały */

/* Zapas wysokości w kadrze: marginesy overlaya plus to, co stoi obok
   tablicy (pod końcową jest jeszcze puenta lekcji). */
const BOARD_PAD = 28;
const BOARD_RESERVE = { start: 10, final: 76 };

function boardWidth(aspect, reserve) {
  const box = el.game.getBoundingClientRect();
  const wolneW = box.width - BOARD_PAD;
  const wolneH = box.height - BOARD_PAD - reserve;
  return Math.max(0, Math.min(BOARD_MAX, wolneW, wolneH * aspect));
}

function updateBoards() {
  const start = boardWidth(2016 / 2120, BOARD_RESERVE.start);
  const koniec = boardWidth(2114 / 2016, BOARD_RESERVE.final);
  el.game.style.setProperty("--board-start", Math.round(start) + "px");
  el.game.style.setProperty("--board-final", Math.round(koniec) + "px");
  el.screenIntro.dataset.form = start >= BOARD_MIN ? "graf" : "karta";
  el.screenFinal.dataset.form = koniec >= BOARD_MIN ? "graf" : "karta";
  return { start: Math.round(start), koniec: Math.round(koniec) };
}

/* ══════════════ 11b. TABLICA KOŃCOWA ══════════════

   Napisy są wpalone w grafikę — żywe są tylko trzy liczby. Wstawiamy je
   w UKŁADZIE WSPÓŁRZĘDNYCH GRAFIKI (SVG viewBox 2114 × 2016), bo tylko tam
   linia bazowa y = 1620 trafia co do piksela w miejsce po wypalonych cyfrach.
   Pola po nich są wyczyszczone w samym pliku WebP.

   Dwie stałe zmierzone na oryginale: cyfra ma 36 jednostek wysokości
   i 24,5 szerokości. Wysokość dobieramy przez kalibrację kroju (systemowy
   grotesk ma inną proporcję), szerokość wymuszamy przez textLength —
   bez tego cyfry byłyby o ~30 % szersze od wypalonych.                  */

const CYFRA_WYS = 36;
const CYFRA_SZER = 24.5;
/* prawa granica wnętrza pigułki — dalej liczba nie może wejść */
const PIGULKA_KONIEC = { valMoves: 802, valDead: 1288, valUndos: 1718 };

let stopienPisma = null;
function kalibruj() {
  if (stopienPisma !== null) return stopienPisma;
  /* getBBox() na <text> zwraca pudełko em kroju, nie zasięg samego tuszu —
     dlatego mierzymy kanwą: actualBoundingBoxAscent to dokładnie wysokość
     cyfry nad linią bazową. Kalibrujemy na „5”, bo ma płaską górę, tak jak
     cyfra wypalona w grafice. */
  stopienPisma = 54;
  try {
    const c = document.createElement("canvas").getContext("2d");
    c.font = '700 100px system-ui, "Segoe UI", Arial, sans-serif';
    const a = c.measureText("5").actualBoundingBoxAscent;
    if (a > 0) stopienPisma = (CYFRA_WYS / a) * 100;
  } catch (e) { /* zostaje wartość domyślna */ }
  return stopienPisma;
}

function wstawLiczbe(node, wartosc) {
  if (!node) return;
  const txt = String(wartosc);
  node.textContent = txt;
  node.style.fontSize = kalibruj() + "px";
  const chce = CYFRA_SZER * txt.length;
  const wolne = PIGULKA_KONIEC[node.id] - Number(node.getAttribute("x"));
  node.setAttribute("textLength", Math.min(chce, wolne));
  node.setAttribute("lengthAdjust", "spacingAndGlyphs");
}

function fillBoard() {
  wstawLiczbe(el.valMoves, state.moves);
  wstawLiczbe(el.valDead, state.deadEnds);
  wstawLiczbe(el.valUndos, state.undos);
}

/* Widoczny jest zawsze dokładnie jeden przycisk finału — o tym, czy jest to
   tablica graficzna czy karta zapasowa, decyduje media query. */
function finalButton() {
  return Array.from(document.querySelectorAll(".js-final"))
    .find((b) => b.offsetParent !== null) || document.querySelector(".js-final");
}

/* Sygnał dla lekcji: „uczeń przeczytał tablicę, możesz iść dalej”.
   NIE dotyka k04:completed ani jego payloadu — to osobne, późniejsze
   zdarzenie, wysyłane DOKŁADNIE RAZ. */
function emitContinue() {
  if (state.continueSent) return;
  state.continueSent = true;
  document.querySelectorAll(".js-final").forEach((b) => {
    b.setAttribute("aria-disabled", "true");
    b.classList.add("is-done");
  });
  say2("Litera P zapisana. Wracasz do e-lekcji.");
  try {
    window.dispatchEvent(new CustomEvent("k04:continue", { bubbles: true }));
  } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
  if (DEBUG) console.log("[k04] k04:continue wysłane");
}

/* Emisja DOKŁADNIE RAZ na cykl życia strony. Strona lekcji nasłuchuje
   równolegle na `contentWindow` i `contentDocument` ramki, więc emitujemy
   tylko na `window` — podwójny cel zaliczyłby klocek dwa razy. */
function emitCompleted() {
  if (state.completionSent) return;
  state.completionSent = true;
  try {
    window.dispatchEvent(new CustomEvent("k04:completed", {
      bubbles: true,
      detail: {
        letter: REWARD_LETTER,
        moves: state.moves,
        wrongTurns: state.wrongTurns,
        undos: state.undos,
      },
    }));
  } catch (e) { /* zdarzenie jest opcjonalne dla samego prototypu */ }
}

/* ══════════════ 12. HUD I PODPOWIEDZI ══════════════ */

function updateStats() {
  el.statMoves.textContent = String(state.moves);
  el.statUndos.textContent = String(state.undos);
}

function updateHint() {
  if (state.mode !== "play") return;
  const n = INCIDENT.get(state.cur).length;
  if (state.cur === K04_MAP.entry) {
    setHint("Woda czeka w lejku. Kliknij strzałkę w dół.");
  } else if (n >= 3) {
    setHint("Skrzyżowanie — wybierz rurę strzałką albo klawiszami ← → ↑ ↓. " +
            "Jaśniejsza strzałka cofa wodę.");
  } else {
    setHint("Jedź dalej albo wróć jaśniejszą strzałką (Backspace).");
  }
}

/* ══════════════ 13. KLAWIATURA I MOST Z LEKCJI ══════════════ */

/* Klawisz kierunku działa na TĘ SAMĄ strzałkę, w którą trafiłaby mysz —
   łącznie z cofnięciem i blokadą pętli. Dlatego szukamy po `.act` (wspólna
   klasa wszystkich strzałek), a rolę bierzemy z `data-kind`. Selektor jest
   jeden i ten sam co przy ustawianiu fokusu — rozjechanie się tych dwóch
   miejsc zabiło kiedyś całe sterowanie klawiaturą. */
function pressDir(dir, source) {
  if (state.mode !== "play") return;
  const hit = Array.from(el.arrows.querySelectorAll(".act"))
    .find((b) => b.dataset.dir === dir);
  if (!hit) return;
  if (hit.dataset.kind === "back") { undo(source || "klawiatura"); return; }
  if (hit.dataset.kind === "off") { refuseLoop(); return; }
  move(Number(hit.dataset.edge), source || "klawiatura");
}

/* JEDNA obsługa klawisza dla obu wejść: fizycznej klawiatury i mostu
   z lekcji. Rozjechanie się tych dwóch ścieżek zostawiało ucznia sterującego
   z poziomu lekcji uwięzionego na pierwszej karcie hydraulika: most wołał
   undo() z pominięciem gałęzi zamykającej kartę, a strzałki nie miały czego
   nacisnąć, bo karta chowa przyciski.

   Zwraca true, gdy klawisz został obsłużony (wtedy warto zjeść zdarzenie). */
function handleKey(key, source) {
  if (state.mode === "intro" || state.mode === "final") return false;

  /* Karta hydraulika przykrywa strzałki. Dopóki jest otwarta, klawisze
     służą tylko do jej zamknięcia — strzałki zjadamy bez skutku, żeby
     przypadkowy ruch nie wystrzelił zaraz po zamknięciu. */
  if (!el.card.hidden) {
    if (key === "Backspace" || key === "Escape" || key === "Enter") {
      dismissCard();
      return true;
    }
    return !!KEY_DIR[key];
  }

  if (key === "Backspace") { undo(source); return true; }
  const dir = KEY_DIR[key];
  if (!dir) return false;
  pressDir(dir, source);
  return true;
}

function onKeyDown(e) {
  const zjedzone = handleKey(e.key, "klawiatura");
  /* Backspace blokujemy zawsze — także na ekranie startowym i finałowym,
     żeby nie cofnął przeglądarki do poprzedniej strony. */
  if (zjedzone || e.key === "Backspace") e.preventDefault();
}

/* Most z lekcji (opcjonalny — gra działa w pełni bez rodzica):
     { type: "k04:key", key: "ArrowLeft"|…|"Backspace", down: true } */
function bindParentBridge() {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const data = e.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "k04:key" || !data.down) return;
    /* Dokładnie ta sama ścieżka co klawiatura fizyczna — łącznie
       z zamykaniem karty hydraulika. */
    handleKey(data.key, "most");
  });
}

/* ══════════════ 14. DEBUG ══════════════ */

function buildDebugLayer() {
  if (!DEBUG) return;
  /* SVG nie ma właściwości `hidden` (to IDL HTMLElement), więc atrybut
     trzeba zdjąć wprost — inaczej reguła [hidden] dalej gasi warstwę. */
  el.debugSvg.removeAttribute("hidden");
  el.debugReadout.hidden = false;

  const frag = document.createDocumentFragment();
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    frag.appendChild(n);
    return n;
  };

  /* wszystkie rury */
  K04_MAP.edges.forEach((e) => {
    add("path", { d: pathD(e.p), class: "d-edge" });
  });
  /* trasa wzorcowa — najkrótsza droga z lejka do zatoru */
  REF_PATH.forEach((s) => {
    add("path", { d: pathD(orientedPoints(s.edge, s.from)), class: "d-path" });
  });
  /* węzły */
  K04_MAP.nodes.forEach((n) => {
    const deg = INCIDENT.get(n.id).length;
    let cls = "d-node", r = 0.85;
    if (n.id === K04_MAP.entry) { cls = "d-entry"; r = 1.5; }
    else if (GOALS.has(n.id)) { cls = "d-goal"; r = 1.5; }
    else if (deg === 1) { cls = "d-dead"; r = 1.05; }
    add("circle", { cx: n.x, cy: n.y, r: r, class: cls });
    add("text", { x: n.x, y: n.y - 1.9, class: "d-label" }, String(n.id));
  });

  el.debugSvg.appendChild(frag);

  el.scene.addEventListener("pointermove", (ev) => {
    const r = el.scene.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width * 100).toFixed(2);
    const y = ((ev.clientY - r.top) / r.height * 100).toFixed(2);
    el.debugReadout.textContent =
      "kursor  " + x + "% , " + y + "%\n" +
      "węzeł   " + state.cur + "  (do zatoru: " + DIST.get(state.cur) + " ruchów)\n" +
      "trasa   " + REF_PATH.length + " ruchów · ruchy " + state.moves +
      " · cofnięcia " + state.undos;
  });
}

function initDevHooks() {
  if (!DEBUG) return;
  window.K04_DEV = {
    /* natychmiastowe zaliczenie klocka — do testu wpięcia w lekcję */
    finish() { if (state.mode !== "final") { state.mode = "play"; finish(); } },
    /* przeskok na dowolny węzeł: czyści wstęgę i stos, żeby stan po skoku
       był spójny (inaczej strzałka „wróć” prowadziłaby do rury bez wody) */
    goto(id) {
      const n = Number(id);
      if (!NODE.has(n)) return "brak węzła " + n;
      state.trail.length = 0;
      renderDone(state.trail);
      clearLive();
      state.cur = n; state.mode = "play"; renderArrows(); updateHint();
      return "węzeł " + n;
    },
    /* przejście trasą wzorcową krok po kroku */
    solve() {
      if (state.mode !== "play") return "poczekaj na koniec animacji";
      const step = INCIDENT.get(state.cur)
        .map((ei) => [ei, other(ei, state.cur)])
        .find(([, v]) => DIST.get(v) === DIST.get(state.cur) - 1);
      if (!step) return "brak dalszego kroku";
      move(step[0], "K04_DEV");
      return "krok do " + step[1];
    },
    path() { return REF_PATH.map((s) => s.from + "→" + s.to); },
    /* Test spójności trójek: każdy komunikat musi mieć komplet
       {plate, text, voice}, a ta sama plansza nie może mieć dwóch różnych
       podpisów ani dwóch różnych nagrań. Zwraca [] gdy wszystko gra. */
    checkTriples() {
      const bledy = [];
      const wgPlanszy = new Map();
      SAY_ALL.forEach((t, i) => {
        if (!t.text) bledy.push("trójka " + i + ": brak podpisu");
        if (!t.voice) bledy.push("trójka " + i + ": brak nagrania");
        if (!t.plate) { bledy.push("trójka " + i + " (" + t.text + "): brak planszy"); return; }
        const prev = wgPlanszy.get(t.plate);
        if (!prev) { wgPlanszy.set(t.plate, t); return; }
        if (prev.text !== t.text) bledy.push("plansza " + t.plate + ": dwa różne podpisy");
        if (prev.voice !== t.voice) bledy.push("plansza " + t.plate + ": dwa różne nagrania");
      });
      return { trojek: SAY_ALL.length, plansz: wgPlanszy.size, bledy: bledy };
    },
    state() {
      return {
        mode: state.mode,
        cur: state.cur,
        distToGoal: DIST.get(state.cur),
        moves: state.moves,
        wrongTurns: state.wrongTurns,
        undos: state.undos,
        trail: state.trail.map((t) => t.from + "→" + t.to),
        completionSent: state.completionSent,
      };
    },
  };
}

/* ══════════════ 15. ROZMIAR I OBRÓT ══════════════ */

function sceneSide() {
  const r = el.scene.getBoundingClientRect();
  return r.width || 1;
}

function measure() {
  const side = sceneSide();
  el.game.style.setProperty("--scene", Math.round(side) + "px");

  /* rozmiar przycisku musi zgadzać się z CSS: max(48px, 8 % kadru) */
  layout.btn = Math.max(48, side * 0.08);
  /* r ≥ 0,80 · średnica → dwie prostopadłe strzałki nie zachodzą na siebie;
     jednocześnie nie mniej niż 8 % kadru, żeby strzałka siedziała na rurze */
  const rPx = Math.max(side * 0.08, layout.btn * 0.80);
  layout.r = rPx / side * 100;

  if (state.mode === "play") renderArrows();
}

/* ══════════════ 16. START ══════════════ */

function startGame() {
  el.screenIntro.classList.add("is-hidden");
  el.game.dataset.state = "play";
  state.mode = "play";
  startMelody();
  say("narrator-start", true);
  /* „Bierzmy się do pracy” dopiero po narratorze — bez nachodzenia głosów */
  if (audio.voice) {
    audio.voice.onended = () => { duckMelody(false); say("do-pracy", true); };
  }
  renderArrows();
  updateHint();
  measure();
  try { const b = el.arrows.querySelector(".act"); if (b) b.focus(); } catch (e) {}
}

function onResize() {
  measure();
  updateBoards();
}

function init() {
  updateStats();
  buildDebugLayer();
  initDevHooks();
  bindParentBridge();

  document.querySelectorAll(".js-start").forEach((b) =>
    b.addEventListener("click", startGame));
  /* Dwa przyciski (tablica i karta zapasowa) robią to samo. Widoczny jest
     zawsze dokładnie jeden — decyduje o tym media query w CSS. */
  document.querySelectorAll(".js-final").forEach((b) =>
    b.addEventListener("click", emitContinue));

  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (window.ResizeObserver) {
    new ResizeObserver(measure).observe(el.scene);
    /* Kadr gry, nie okno: w ramce lekcji to on decyduje, ile miejsca ma
       tablica. Stąd obserwator właśnie na nim. */
    new ResizeObserver(updateBoards).observe(el.game);
  }
  onResize();

  if (DEBUG) {
    console.log("[k04] węzłów " + K04_MAP.nodes.length +
                ", rur " + K04_MAP.edges.length +
                ", trasa wzorcowa " + REF_PATH.length + " ruchów");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
