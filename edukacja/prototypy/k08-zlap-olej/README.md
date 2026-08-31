# Złap zużyty olej! — prototyp K08 (klasy 4–5)

Samodzielny prototyp gry zręcznościowej dla klocka **K08** e-lekcji SELEKT.
Uczeń łapie krople zużytego oleju do butelki z lejkiem i utrwala zasadę:
**każda kropla zużytego oleju powinna zostać zebrana zamiast trafić do odpływu**.

> Prototyp **nie jest zintegrowany** z główną lekcją. Nie zapisuje litery ani
> ukończenia do `localStorage` — po zwycięstwie emituje wyłącznie zdarzenie
> `k08:completed` (patrz „Kontrakt integracyjny").

## Uruchomienie

```bash
npx serve -l 3000 site
# → http://localhost:3000/edukacja/prototypy/k08-zlap-olej/
```

## Zasady gry

- Cel: złap **20 kropli** oleju z jeżdżącej patelni. Bez limitu czasu.
- Masz **trzy życia** pokazane jako trzy krople w HUD.
- **Pierwsze i drugie pudło**: −1 życie, krótki komunikat — **wynik zostaje**
  i gra toczy się dalej.
- **Trzecie pudło**: koniec pełnej próby. Nowa próba zaczyna od 0 kropli
  z trzema świeżymi życiami; licznik pełnych prób rośnie o 1.
- **Od trzeciej pełnej próby** gra automatycznie włącza **spokojniejsze tempo**
  (wolniejsze krople i patelnia, dłuższe przerwy, odrobinę szersze pole
  łapania). Tryb zostaje aktywny aż do zwycięstwa i nie jest przedstawiany
  jako kara. Mnożniki: `ASSIST_PROFILE` na górze `game.js`.
- Trudność rośnie w trakcie próby: początek uczy sterowania, końcowe krople
  są wyraźnie szybsze.
- **Patelnia porusza się płynnie poziomo** w górnym pasie planszy i odbija się
  od krawędzi; grafika (`pan-left`/`pan-right`) podąża za kierunkiem ruchu.
  Kropla startuje z aktualnej pozycji wylotu.
- **Test uczciwości**: kropla zostaje wypuszczona dopiero w momencie, w którym
  jest osiągalna butelką sterowaną klawiaturą (z marginesem bezpieczeństwa) —
  każda kropla jest do złapania.

## Parametry trudności (N4 — łagodniejszy próg)

Wszystko w `GAME_CONFIG` na górze `game.js`. Zasada zaliczenia (20/20,
trzy życia) i końcowe tempo gry są **bez zmian** — łagodniejszy jest tylko
próg wejścia:

| Parametr | Wartość | Efekt |
|---|---|---|
| `funnelWidenFactor` | `1.30` | pole łapania (lejek) szersze o 30% — mnoży całość `(baza + funnelHitboxPadding)`, więc tak samo działa na 320 px i na 1440 px (np. 56,5 px → 73 px przy szerokiej butelce) |
| `warmupDrops` | `6` | przez pierwsze 6 kropli gra jest wolniejsza; mnożniki wracają **liniowo** do 1.0, więc od 6. kropli tempo jest dokładnie takie jak dotąd |
| `warmupDropSpeed` | `0.72` | ×prędkość spadania na starcie rozbiegu |
| `warmupPanSpeed` | `0.80` | ×prędkość patelni na starcie rozbiegu |
| `warmupSpawnDelay` | `1.25` | ×przerwa między kroplami na starcie rozbiegu |
| `pointerSmoothingMs` | `75` | stała czasowa doganiania celu przez butelkę |

Rozbieg obowiązuje w **każdej** próbie (to próg wejścia, nie nagroda)
i mnoży się z adaptacyjnym trybem pomocy (`ASSIST_PROFILE`), jeśli ten jest
aktywny.

**Pas osiągalny**: wylew patelni potrafi dojechać bliżej krawędzi niż środek
butelki. Kropla startuje więc dopiero wtedy, gdy wylew mieści się w zakresie
ruchu środka butelki (`spoutInReachBand()`) — obok istniejącego testu
uczciwości. Żadna kropla nie ląduje w pasie, którego dziecko nie może pokryć
lejkiem. Patrol pokrywa całą szerokość, więc warunek spełnia się w każdym
cyklu i nie wydłuża zauważalnie przerw.

## Sterowanie i integracja

Etap **N4** powstał po teście z dzieckiem: gdy kursor wyjechał poza planszę
lub poza ramkę, butelka przestawała reagować, a kursora nie było widać
(`.board { cursor: none }`) — dziecko traciło kontrolę. Dlatego sterowanie
ma teraz **trzy niezależne ścieżki**, a gra przyjmuje pozycję również
od strony lekcji. Korekta **N4.1**: ekranowe przyciski ◀ ▶ zostały
usunięte — nie sprawdziły się w teście; zamiast nich klawiatura dostała
precyzyjny krok.

### Ścieżki sterowania

| Ścieżka | Jak działa |
|---|---|
| **Mysz** | nasłuch `pointermove`/`pointerdown` na **całym dokumencie ramki** (nie na planszy). Pozycja X jest przeliczana względem planszy i przycinana do jej krawędzi, więc kursor poza planszą trzyma butelkę przy krawędzi zamiast ją zamrażać. |
| **Dotyk** | to samo zdarzenie `pointer*`; plansza blokuje przewijanie (`touch-action: none` + `preventDefault` na `touchmove`). |
| **Klawiatura** | strzałki ← → (`keydown`/`keyup` na `window`) z precyzyjnym krokiem — patrz niżej. |
| **Z lekcji** | komunikaty `k08:pointer` i `k08:key` (niżej). |

Butelka **dogania cel płynnie** (wygładzanie wykładnicze, stała czasowa
`pointerSmoothingMs = 75 ms`) — bez skoków przy szarpnięciu myszą. Przy
`prefers-reduced-motion: reduce` doganianie jest natychmiastowe. Każde
użycie strzałki kasuje cel wskaźnika, żeby oba tory nie ciągnęły butelki
w przeciwne strony.

### Precyzja klawiatury (N4.1)

| Parametr | Wartość | Efekt |
|---|---|---|
| `keyStepRatio` | `0.045` | jedno krótkie naciśnięcie = krok 4,5% szerokości planszy (65 px przy 1440, 14 px przy 320) |
| `keyHoldDelayMs` | `140` | dopiero po tym czasie przytrzymanie przechodzi w ruch ciągły — dzięki temu tapnięcie daje sam krok, bez doklejonego poślizgu |
| `keyRampMs` | `300` | czas rozpędzania do pełnej prędkości |
| `keyRampStart` | `0.35` | prędkość na starcie rozpędzania (×`bottleSpeed`) |

Przytrzymanie osiąga **pełne `bottleSpeed`** (~440 ms od wciśnięcia), więc
`dropIsReachableNow()` — liczący zasięg butelki właśnie z `bottleSpeed` —
pozostaje prawdziwy i każda kropla nadal jest do złapania.

Auto-repeat systemowy jest odfiltrowany (`e.repeat` plus strażnik stanu
klawisza w `pressKey()`), więc jedno fizyczne naciśnięcie = dokładnie jeden
krok, także gdy lekcja wyśle kilka `k08:key {down: true}` z rzędu.
Krok i rozpędzanie to sterowanie, nie animacja, więc
`prefers-reduced-motion` ich **nie** zmienia (wyłącza tylko wygładzanie myszy).

Podpowiedź sterowania pojawia się na ekranie startowym i jako mały chip
w HUD; treść zależy od urządzenia (`(hover: none) and (pointer: coarse)`):
„Steruj myszką lub strzałkami ← →” albo „Przeciągaj palcem”. Chip znika po
5. złapanej kropli.

### Komunikaty przyjmowane od lekcji (`postMessage`)

Gra nasłuchuje `message` i przyjmuje **wyłącznie** komunikaty od okna
nadrzędnego (`event.source === window.parent`). Wszystko inne jest
ignorowane. Obie ścieżki są **opcjonalne** — gra działa w pełni, jeśli
lekcja nigdy nic nie wyśle.

```js
// pozycja wskaźnika: xRatio = 0..1 względem SZEROKOŚCI PLANSZY (poza zakres → clamp)
iframe.contentWindow.postMessage({ type: "k08:pointer", xRatio: 0.42 }, "*");

// klawisz kierunku, niezależny od tego, gdzie jest fokus przeglądarki
iframe.contentWindow.postMessage({ type: "k08:key", key: "ArrowLeft",  down: true  }, "*");
iframe.contentWindow.postMessage({ type: "k08:key", key: "ArrowLeft",  down: false }, "*");
```

- `k08:pointer` — butelka podąża za pozycją tak samo jak za myszą (z tym
  samym wygładzaniem). Nadawcą jest strona lekcji, np. przeliczając własne
  `mousemove` na proporcję szerokości ramki.
- `k08:key` — `key` może być tylko `"ArrowLeft"` lub `"ArrowRight"`;
  `down: true/false` odpowiada `keydown`/`keyup`. Inne klawisze są
  ignorowane.

Gra dodatkowo **przejmuje fokus** (`window.focus()`) przy `pointerdown` /
`pointerenter` na planszy oraz po kliknięciu „Rozpocznij grę”, żeby własne
strzałki działały od razu.

### Polityka pauzy

| Tryb | Co pauzuje grę |
|---|---|
| **Samodzielne okno** (bez zmian) | `visibilitychange → hidden`, **każda** utrata fokusu okna, wyjechanie gry poza widok (`IntersectionObserver`) |
| **W ramce lekcji** (`window.parent !== window`) | `visibilitychange → hidden` oraz **blur sztuczny** wysłany przez lekcję (`event.isTrusted === false`); wyjechanie poza widok bez zmian |

W ramce **prawdziwa** utrata fokusu (`isTrusted === true`) jest ignorowana —
inaczej kliknięcie w treść lekcji zapauzowałoby grę i sterowanie
przekazywane przez `k08:pointer` / `k08:key` trafiałoby w martwy punkt.
Lekcja pauzuje grę przy wyjściu z ekranu tak:

```js
iframe.contentWindow.dispatchEvent(new Event("blur"));   // isTrusted === false → pauza
```

Klawisze kierunku są zwalniane przy **każdym** blurze, także ignorowanym,
więc butelka nigdy nie jedzie w nieskończoność po utracie fokusu.

### Pozostałe

- Przycisk dźwięku: klawiatura + `aria-pressed`; ustawienie w `sessionStorage`
  (`selekt_zlap_olej_sound`).
- Wznowienie po pauzie zawsze z odliczaniem 3-2-1; wynik, życia i numer
  próby zostają nietknięte.

## Kontrakt integracyjny

Po złapaniu 20/20 gra emituje **dokładnie raz** (funkcja `finalizeCompletion()`
chroni przed ponowną emisją po klikach, pauzie i powrocie do ekranu wygranej):

```js
window.dispatchEvent(new CustomEvent("k08:completed", {
  bubbles: true,
  detail: {
    letter: "Z",
    caughtDrops: 20,
    totalDrops: 20,
    attempts: <liczba rozpoczętych pełnych prób>,
    assistanceActive: <true|false>,
  },
}));
```

- **Litera nagrody: Z** (kanon liter P–S–Z–O–K: docs/09).
- Prototyp **nie używa** kluczy `selekt_zlap_olej_completed`,
  `selekt_zlap_olej_reward` ani produkcyjnych `lk45_*`.
- Zapis litery w „Aktach sprawy" nastąpi dopiero na etapie integracji,
  mechanizmem strony lekcji.

## Dostępność

- pełna rozgrywka klawiaturą, widoczny fokus, fokus po ekranach startu /
  końca próby / wygranej trafia na właściwy przycisk;
- komunikaty `aria-live` (wynik, życie, pomoc, sukces) bez spamowania;
- utracone życie = pusta kropla **z przekreśleniem** (nie sam kolor);
- `prefers-reduced-motion` wyłącza ozdobne animacje (przechył patelni,
  bounce, splash, odliczanie) — mechanika i czasy gry bez zmian;
- brak dowolnego pliku MP3 nie blokuje startu, wznowienia ani ukończenia;
- na dotyku plansza blokuje przewijanie tylko w swoim obszarze;
- podpowiedź sterowania w HUD jest `aria-hidden` (duplikat treści z ekranu
  startowego), a jej treść dopasowuje się do urządzenia;
- `prefers-reduced-motion` wyłącza też wygładzanie ruchu butelki — pozycja
  wskaźnika jest wtedy przenoszona natychmiast.

## Testowanie (tryb deweloperski)

Pod adresem z flagą `?dev=1` dostępny jest niewidoczny w UI hak testowy:

```js
K08_DEV.catch(); // zalicza kroplę (tylko w stanie PLAYING)
K08_DEV.miss();  // wymusza pudło
K08_DEV.state(); // podgląd: caught/lives/attempt/assist + aktualne parametry
```

Bez `?dev=1` hak nie istnieje i nie jest widoczny w interfejsie.

## Struktura plików

```
k08-zlap-olej/
├── index.html          markup + HUD (licznik, życia, podpowiedź, dźwięk) + ekrany
├── style.css           style gry + HUD żyć + toast + chip podpowiedzi + reduced-motion
├── game.js             cała logika (jedna pętla rAF, bez zależności)
└── assets/
    ├── audio/          catch.mp3, miss.mp3, win.mp3 (opcjonalne)
    └── images/         background, bottle-funnel, pan-left, pan-right (.webp)
```

Źródło bazowe: commit `62ae4bf` (gra „Złap olej" z gałęzi
`claude/zlap-olej-game-dx4z00`), rozszerzony o system trzech żyć, licznik
pełnych prób, adaptacyjny tryb pomocy, ruchomą patelnię i kontrakt K08.
Etap N4: sterowanie z całego dokumentu ramki, mostek `k08:pointer` /
`k08:key`, wygładzanie ruchu myszy, łagodniejszy próg wejścia i polityka
pauzy dla trybu osadzonego. Korekta N4.1: ekranowe strzałki usunięte,
klawiatura z krokiem i rozpędzaniem.
