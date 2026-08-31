# Przeszukanie kuchni — prototyp K06 (klasy 4–5)

Samodzielna gra śledcza dla klocka **K06** e-lekcji SELEKT (Trop 4).
Uczeń prowadzi latarkę po ciemnym kadrze kuchni i odnajduje **pięć śladów**.
Wniosek śledczy: **mieszkańcy nie wylewają oleju do zlewu** — dowodzi tego
pięć znalezionych dowodów.

Gra zastępuje dotychczasowy moduł Genially „Przeszukanie kuchni”. Genially
jest cross-origin i nigdy nie mówił stronie, że uczeń skończył — dlatego
klocek zaliczało się ręcznym przyciskiem. Ta gra wysyła sygnał ukończenia
sama (patrz „Kontrakt integracyjny”).

> Prototyp **nie jest jeszcze wpięty** w lekcję i **niczego nie zapisuje**:
> ani do `localStorage`, ani do stanu lekcji. Litery **nie przyznaje** —
> po prostu ją pokazuje. Zapis litery **S** należy do strony lekcji
> (`lesson-state.js` → `unlockLetterEntry`).

## Uruchomienie

```bash
npx serve -l 3000 site
```

→ `http://localhost:3000/edukacja/prototypy/k06-latarka-kuchnia/`

| Adres | Do czego |
|---|---|
| `…/k06-latarka-kuchnia/` | normalna gra |
| `…/?debug=1` | obrysy pól trafienia, pozycja pod kursorem, hak `K06_DEV` |
| `…/?mock=1` | podgląd wbudowanego zastępnika CSS/SVG (gra bez grafik) |
| `…/?embed=board` | tryb tablicy lekcji: klasa `k06-embed` na `<html>` |

Parametry można łączyć: `?debug=1&mock=1`.

## Zasady gry

- Kadr kuchni jest ciemny; plama światła latarki odsłania oryginalny render.
- **Odkrycie śladu**: zatrzymanie środka plamy na przedmiocie na ~350 ms
  **albo** kliknięcie w niego. Odkryty ślad zostaje rozjaśniony **na stałe**
  (osobna warstwa „pamięci”), dostaje pinezkę i kartę tekstową.
- Karta każdego śladu zaczyna się nagłówkiem **„Świetnie! Masz kolejny trop.”**
- **Bez limitu czasu i bez przegranej.** Po ~45 s bez postępu okolica pierwszego
  nieodkrytego śladu delikatnie pulsuje.
- Po piątym śladzie cała kuchnia rozjaśnia się w pełni, pada wniosek
  („Pięć śladów, jeden wniosek — w tej kuchni olej nie trafia do zlewu”)
  i pojawia się litera **S**.

### Pięć śladów

Współrzędne i promienie w **procentach kadru** (x i r — względem szerokości,
y — względem wysokości). Wszystko w tablicy `TRACES` na górze `k06.js`;
pozycje odczytane z renderu 2752×1536 i sprawdzone w `?debug=1`.

| # | ślad | x | y | r | karta |
|---|---|---|---|---|---|
| 1 | butelka OLEJOMATY | 71,5% | 52,4% | 4,6% | „Zużyty olej ma tu swoje miejsce — szczelną butelkę, która pojedzie do Olejomatu.” |
| 2 | lejek przy zlewie | 57,5% | 52,9% | 4,2% | „Lejek znaczy jedno: olej przelewa się do butelki, nie do zlewu.” |
| 3 | kosze pod zlewem | 63,0% | 72,5% | 7,5% | „Pięć pojemników pod zlewem — ten dom segreguje na co dzień.” |
| 4 | plakat segregacji | 82,6% | 50,6% | 5,2% | „Ściągawka segregacji. Ktoś tu sprawdza, co gdzie wrzucić.” |
| 5 | pudełko z bateriami | 83,4% | 20,5% | 4,2% | „Zużyte baterie czekają na punkt zbiórki, nie w koszu.” |

**Szafka (ślad 3)** działa dwuetapowo: bazowy render ma drzwiczki zamknięte.
Światło na drzwiczkach pokazuje przy klamce etykietę **„Otwórz”**; dopiero
kliknięcie (lub Enter) uruchamia crossfade ~400 ms na render z otwartą szafką
i **wtedy** ślad zostaje zaliczony. Samo przytrzymanie światła na zamkniętych
drzwiczkach niczego nie zalicza.

Ślad 3 ma osobne pola `revealX/revealY/revealR` i `pinX/pinY` — pole trafienia
jest na drzwiczkach, a rozjaśnia się i pinezkę dostaje pas koszy poniżej.

## Kontrakt integracyjny

### Ukończenie — `k06:completed`

Po piątym śladzie gra emituje **dokładnie raz na cykl życia strony**
(strażnik `state.completionSent`; ponowne `finish()` nic nie wysyła):

```js
window.dispatchEvent(new CustomEvent("k06:completed", {
  bubbles: true,
  detail: { letter: "S", foundTraces: 5, totalTraces: 5 },
}));
```

**Emisja idzie wyłącznie na `window`** — świadomie, nie przez przeoczenie.
Strona lekcji podpina ten sam handler równolegle do `contentWindow`
**i** `contentDocument` ramki (`modules.js` → `bindBridge`, `board-stage.js`).
Emisja na obu celach zaliczyłaby klocek dwa razy. Sprawdzone w ramce:
przy nasłuchu na obu celach handler dostaje **jedno** wywołanie.

Wzorzec jest ten sam co w K07 i K08 (`window`, `bubbles: true`); K16 emituje
na `document`, dlatego lekcja słucha na obu.

### Odkrycie śladu — `k06:trace`

Punkt wpięcia przyszłych klipów głosowych. Przy każdym odkryciu:

```js
window.dispatchEvent(new CustomEvent("k06:trace", {
  bubbles: true,
  detail: { id: 1, label: "Butelka na zużyty olej" },
}));
```

Gra **niczego nie odtwarza** — mówi tylko, który ślad padł. Odtwarzanie
należy do strony lekcji i wyłącznie w trybach dźwiękowych („Słucham”,
„Czytam i słucham”).

### Sterowanie z lekcji (opcjonalne)

Gra przyjmuje komunikaty **tylko od okna nadrzędnego**
(`event.source === window.parent`); wszystko inne jest ignorowane.
Bez rodzica działa w pełni.

```js
// pozycja światła — proporcje 0..1 względem kadru (poza zakres → clamp)
iframe.contentWindow.postMessage({ type: "k06:pointer", xRatio: 0.42, yRatio: 0.6 }, "*");

// klawisz kierunku, niezależnie od tego, gdzie jest fokus przeglądarki
iframe.contentWindow.postMessage({ type: "k06:key", key: "ArrowUp", down: true }, "*");
iframe.contentWindow.postMessage({ type: "k06:key", key: "ArrowUp", down: false }, "*");
```

`k06:key` przyjmuje wyłącznie `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`.

### Czego gra NIE robi

- nie zapisuje litery ani ukończenia (`localStorage`, `lk45_*` — nie występują),
- nie odtwarza dźwięku,
- nie decyduje o przejściu dalej w lekcji.

## Sterowanie i dostępność

| Ścieżka | Jak działa |
|---|---|
| **Mysz** | `pointermove` na **całym dokumencie ramki**; pozycja przycinana do kadru, więc kursor poza kadrem trzyma latarkę przy krawędzi zamiast ją gubić |
| **Dotyk** | te same zdarzenia `pointer*`; kadr blokuje przewijanie (`touch-action: none` + `preventDefault` na `touchmove`) |
| **Klawiatura** | ← → ↑ ↓ — krok i rozpędzanie (niżej) |
| **Czytnik ekranu** | Tab po pięciu śladach jako przyciskach, Enter odkrywa, `aria-live` czyta nagłówek i zdanie karty |
| **Z lekcji** | `k06:pointer` / `k06:key` |

**Drugi tor** (Tab/Enter) jest pełnoprawną ścieżką ukończenia gry, nie protezą:
gra „szukaj wzrokiem” bez alternatywy byłaby niedostępna. Przyciski są poza
ekranem, ale **przy fokusie stają się widoczne**, więc korzysta z nich też
osoba widząca, która nie używa myszy. Odkryty ślad wyłącza swój przycisk
i zmienia jego etykietę na „ślad odnaleziony”.

### Precyzja klawiatury

| Parametr | Wartość | Efekt |
|---|---|---|
| `keyStepRatio` | `0.045` | jedno naciśnięcie = krok 4,5% szerokości kadru (w obu osiach ten sam dystans w px) |
| `keyHoldDelayMs` | `140` | dopiero po tym czasie przytrzymanie przechodzi w ruch ciągły |
| `keyRampMs` | `300` | czas rozpędzania do pełnej prędkości |
| `keyRampStart` | `0.35` | prędkość na starcie rozpędzania |
| `moveSpeed` | `0.62` | pełna prędkość: ułamek szerokości kadru na sekundę |

Auto-repeat systemu jest odfiltrowany (`e.repeat` plus strażnik stanu klawisza),
więc jedno fizyczne naciśnięcie = dokładnie jeden krok — także gdy lekcja wyśle
kilka `k06:key {down: true}` z rzędu. Każdy `blur` zwalnia wszystkie klawisze,
więc światło nigdy nie jedzie w nieskończoność po utracie fokusu.
Krok i rozpędzanie to **sterowanie, nie animacja**, więc
`prefers-reduced-motion` ich nie zmienia.

### `prefers-reduced-motion`

Wyłącza puls podpowiedzi (zostaje statyczna poświata), animacje pinezki, karty,
panelu i litery; crossfade szafki skraca się z 400 ms do 150 ms. Mechanika,
czasy przytrzymania i zaliczanie śladów — bez zmian.

## Grafiki

| Plik | Rola | Waga |
|---|---|---|
| `kuchnia-1760.webp` | render bazowy, szafka zamknięta | 58 kB |
| `kuchnia-szafka-otwarta-1760.webp` | ten sam kadr, szafka otwarta | 62 kB |
| `latarka-900.webp` | latarka z kanałem alfa, bez snopu | 29 kB |

Lekkie warianty powstały z oryginałów wgranych przez użytkownika
(`kuchnia.webp` 2,63 MB, `kuchnia-szafka-otwarta.webp` 2,73 MB,
`latarka.webp` 0,89 MB — razem 6,35 MB, na tablecie szkolnym to kilkanaście
sekund ładowania). **Oryginały zostały nietknięte** i leżą obok; gra ich nie
pobiera. Nietknięte są też duplikaty PNG (`kuchnia-szafka-otwarta.png`,
`latarka-bez-swiatla.png`).

Oba rendery mają **identyczne kadrowanie** (2752×1536), więc crossfade szafki
nie wymaga żadnego przesunięcia ani skalowania.

Ścieżki i przełączniki: `CONFIG.images` i `CONFIG.useImages` na górze `k06.js`.

```js
useImages: { kitchen: true, torch: true },
```

Zastępnik CSS/SVG jest **domyślną zawartością HTML-a**, a nie ratunkiem
awaryjnym: gra działa od pierwszej sekundy, a rendery wchodzą dopiero po
sprawdzeniu, że plik naprawdę się wczytał (`withImage`). Brak pliku = gra
działa dalej na zastępniku i wypisuje jedno ostrzeżenie w konsoli, bez błędu.
Podgląd zastępnika: `?mock=1`.

### Jak zbudowana jest ciemność

Trzy warstwy tego samego kadru:

1. `.pic` — jasny render (dwie klatki: szafka zamknięta / otwarta),
2. `.veil` — jednolita ciemność `rgba(6, 10, 20, .93)`, bez maski,
3. `.reveal--memory` i `.reveal--spot` — kopie renderu z maskami: pierwsza
   trzyma odkryte ślady, druga ruchomą plamę latarki.

Maskowana jest **jasność**, nie ciemność. Dzięki temu dziury sumują się same
(domyślne kompozytowanie warstw maski) i nie trzeba `mask-composite: intersect`,
którego starsze tablety mogą nie znać. Co klatkę przeliczana jest tylko jedna
maska z jednym gradientem — maska „pamięci” zmienia się wyłącznie w momencie
odkrycia śladu.

**Promień plamy liczony jest od szerokości kadru, nie okna**:
`clamp(32px, 8% szerokości kadru, 95px)`. Zapis w `vw` oderwałby wielkość
światła od wielkości kadru — na telefonie plama nie ma jak wiedzieć, że kuchnia
jest mała.

Miękkie zejście krawędzi (`--r-fade`) skaluje się razem z promieniem
(`spotFadeRatio`, domyślnie 0,324 — proporcja z pierwszej wersji). Gdyby
zostało stałe 60 px, samo rozmycie zjadłoby połowę zmniejszenia plamy.

### Korekta K06.1 — plama o połowę mniejsza

Pierwsza wersja miała `clamp(64px, 16%, 190px)`; każda z tych wartości została
zmniejszona o połowę, żeby światło było snopem, a nie reflektorem. Pomiar po
zmianie (kadr w nawiasie, „krotność” = promień plamy ÷ promień pola trafienia —
poniżej 1,0 znaczy, że pole jest większe od światła):

| viewport | kadr | promień plamy | średnica jako % kadru | krotność: ślad 1 / 2 / 3 / 4 / 5 |
|---|---|---|---|---|
| 320×568 | 308×172 | 32 px (minimum) | 20,8% | 2,26 / 2,47 / **1,39** / 2,00 / 2,47 |
| 390×844 | 378×211 | 32 px (minimum) | 16,9% | 1,84 / 2,02 / **1,13** / 1,63 / 2,02 |
| 844×390 | 581×324 | 46,5 px | 16,0% | 1,74 / 1,90 / **1,07** / 1,54 / 1,90 |
| 1280×720 | 1157×646 | 92,6 px | 16,0% | 1,74 / 1,90 / **1,07** / 1,54 / 1,90 |
| 1600×900 | 1480×826 | 95 px (maksimum) | 12,8% | 1,40 / 1,53 / **0,86** / 1,23 / 1,53 |

Wniosek: na wszystkich rozmiarach do 1280 px plama pozostaje **większa od
każdego pola trafienia** — najciaśniej jest przy śladzie 3 (szafka), bo to
największe pole. Na 320 px, o które chodziło najbardziej, zapas wynosi 1,39×.

Powyżej ~1190 px szerokości kadru promień zatrzymuje się na maksimum 95 px,
więc dla śladu 3 plama robi się mniejsza od pola (0,86× przy 1600 px). Trafianie
to nie psuje — o zaliczeniu decyduje pole, nie światło — ale całe drzwiczki
przestają mieścić się w jednym snopie. Gdyby to przeszkadzało, wystarczy
podnieść `spotMax`.

### Korekta K06.2 — latarka

Po zmniejszeniu plamy latarka (0,21 szerokości kadru, minimum 96 px) okazała się
**szersza niż własne światło** i zasłaniała to, co oświetla — najmocniej na
telefonie, gdzie miała 96 px przy plamie o średnicy 64 px. Zmniejszona do
`torchRatio: 0.15` i `torchMinPx: 70`.

### Ciemność

Obowiązuje **`.93`** (korekta K06.2) — przy `.88` kuchnia była zbyt czytelna
bez latarki i szukanie traciło sens. Zmiana to jedna zmienna: `--dark`
w `k06.css`.

Ciemność **nie dotyka odkrytych śladów ani plamy latarki** — obie leżą na
warstwach nad nią i są maskowane, więc ich jasność jest stała (zmierzone:
155 i 200 na 255 niezależnie od alfy). Przyciemnianie tła wyłącznie zwiększa
ich kontrast, więc odkryte ślady są przy `.93` wyraźniejsze niż były:

| `--dark` | tło kadru | odkryty ślad | kontrast pamięci |
|---|---|---|---|
| .88 | 31 / 255 | 155 / 255 | 5,0× |
| **.93 (wybrane)** | **22 / 255** | **155 / 255** | **7,0×** |
| .96 | 17 / 255 | 155 / 255 | 9,1× |

## Audio śladów

Gra nie odtwarza dźwięku — mówi tylko, który ślad padł (`k06:trace`).
Klipy są już nagrane i leżą w:

```
site/assets/audio/lekcja45/04-slad-do-kuchni/slady/
├── 01-olejomat.mp3     ślad 1 — butelka OLEJOMATY
├── 02-lejek.mp3        ślad 2 — lejek przy zlewie
├── 03-kosze.mp3        ślad 3 — kosze pod zlewem
├── 04-plakat.mp3       ślad 4 — plakat segregacji
└── 05-baterie.mp3      ślad 5 — pudełko z bateriami
```

Odtwarzanie należy do strony lekcji: `board-stage.js` mapuje `detail.id`
na ścieżkę i woła `NS.audio.playClip()` — jednym kanałem menedżera audio
(kolejny ślad przerywa poprzedni klip) i **wyłącznie w trybie „Czytam
i słucham"**; w „Czytam" bramka stoi przed `playClip`, więc nie leci ani
jedno żądanie po plik.

Podfolder `slady/` oddziela je od istniejących nagrań narracyjnych tego tropu
(`04-slad-do-kuchni-01.mp3`, `04-zlap-krople-02.mp3`, `04-butelka-pelna-03.mp3`).
Treść klipu = zdanie z karty śladu (tabela wyżej).

## Wpięcie klipów śladów

Gotowy, przetestowany patch dla strony lekcji. **Nie jest jeszcze wpięty** —
wykona to etap A5, w oknie prowadzącym `board-stage.js`. Gra po swojej
stronie nie wymaga żadnej zmiany: emituje `k06:trace` od pierwszej wersji.

Plik: `site/edukacja/lekcja-4-5-integracja/board-stage.js`, blok obsługi ramki
K06 — ten sam, w którym stoi nasłuch `k06:completed` (ok. linii 1277–1302).

### 1. Wstaw przed `const bind = () => {`

```js
    /* ── Klipy śladów (etap 9) ──────────────────────────────────────
       Odkrycie śladu odzywa się głosem lektora, ale WYŁĄCZNIE w trybie
       „Czytam i słucham". W „Czytam" nie wołamy `playClip`, więc po plik
       nie leci ani jedno żądanie. Kanał jest jeden — ten sam co narracja —
       więc kolejny ślad przerywa poprzedni klip i nigdy nie słychać dwóch
       nagrań naraz. Gra mówi tylko, KTÓRY ślad padł (`k06:trace` →
       {id, label}); ścieżki należą do lekcji. */
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
```

### 2. W `bind()` dopisz rejestrację i sprzątanie

Było:

```js
        win.addEventListener("k06:completed", onDone);
        chapterCleanup.push(() => {
          try { win.removeEventListener("k06:completed", onDone); } catch (e) { /* okno zwolnione */ }
        });
```

Ma być:

```js
        win.addEventListener("k06:completed", onDone);
        win.addEventListener("k06:trace", onTrace);
        chapterCleanup.push(() => {
          try {
            win.removeEventListener("k06:completed", onDone);
            win.removeEventListener("k06:trace", onTrace);
          } catch (e) { /* okno zwolnione */ }
        });
```

### Dlaczego tak

* **Bramka trybu stoi PRZED `playClip`** — dlatego w „Czytam" nie powstaje
  nawet element audio, nie tylko nie leci żądanie.
* **Jeden kanał gratis**: `playClip` z `audio-manager.js` używa jednej
  instancji na całą lekcję, więc kolejny ślad z natury przerywa poprzedni.
  Nie trzeba własnego odtwarzacza ani gaszenia poprzedniego klipu.
* **Klip zagra mimo wyciszenia gry**: kontener K06 ma `data-stops-audio`,
  co ucisza narrację sceny, ale `playClip` celowo nie sprawdza `suspended` —
  krótkie nagranie będące odpowiedzią na działanie ucznia ma prawo wybrzmieć.
* Ścieżki są względne wobec `site/edukacja/` (`../assets/...`) — tak samo jak
  `glos:` w `board-config.js` i `data-audio-src` w HTML lekcji.

### Wynik testu na żywej lekcji

Logika sprawdzona przez wstrzyknięcie do działającej strony, **bez zmian
w plikach lekcji**:

| test | wynik |
|---|---|
| tryb „Czytam", pięć śladów | 5× pominięte, **zero żądań**, element audio nie powstał |
| tryb „Czytam i słucham", pięć śladów | 5× `playClip`, **pięć żądań** (206), po jednym na klip |
| mapowanie id → plik | 1 → olejomat, 2 → lejek, 3 → kosze, 4 → plakat, 5 → baterie |
| jeden kanał | ślad 5 grał („Ślad: Pudełko z bateriami"), 0,25 s później ślad 3 przejął kanał („Ślad: Kosze pod zlewem") — nigdy dwa naraz |

## Tryb `?debug=1`

- przerywane obrysy wszystkich pięciu pól trafienia z etykietami `x% / y% r%`,
- panel z pozycją światła pod kursorem (`x 71.5%  y 52.4%`), rozmiarem kadru
  i nazwą śladu pod plamą,
- każde kliknięcie w kadr wypisuje współrzędne do konsoli,
- hak testowy `K06_DEV` (istnieje **wyłącznie** pod `?debug=1`):

```js
K06_DEV.state();        // mode, found, doorOpen, completionSent, rozmiar kadru
K06_DEV.reveal(4);      // odkryj ślad o podanym numerze
K06_DEV.revealAll();    // przejdź grę do końca (wyzwala k06:completed)
K06_DEV.openDoor();     // otwórz szafkę pod zlewem
K06_DEV.spot(61.5, 74); // ustaw światło w punkcie (procenty kadru)
```

Dostrajanie pozycji śladu: `?debug=1`, najedź na przedmiot, odczytaj `x/y`
z panelu i wpisz do `TRACES` w `k06.js`.

## Wydajność

- Pętla `requestAnimationFrame` chodzi **tylko wtedy, gdy coś się dzieje**
  (ruch klawiszem, odliczanie przytrzymania, nowa pozycja wskaźnika) i sama
  się zatrzymuje. Gra przez większość czasu stoi, więc tablet nie grzeje się
  na pustym biegu.
- Pozycja latarki rysowana jest synchronicznie ze zdarzeniem wskaźnika —
  latarka jest pod palcem, nie klatkę za nim.
- Zero zależności, zero `filter` na warstwach ruchomych, jedna grafika kadru
  (druga tylko dla otwartej szafki).
- `ResizeObserver` na kadrze: w ramce lekcji rozmiar potrafi się zmienić bez
  zdarzenia `resize` okna, a wtedy pola trafienia liczone w px rozjechałyby
  się z obrazem.

## Struktura plików

```
k06-latarka-kuchnia/
├── index.html      kadr, HUD, karta śladu, lista śladów (drugi tor), ekrany
├── k06.css         warstwy ciemności i światła, HUD, karta, mobile, reduced-motion
├── k06.js          TRACES + CONFIG na górze, cała logika, kontrakt zdarzeń
├── README.md
└── assets/images/  rendery kuchni (lekkie warianty + oryginały) i latarka
```

## Testy wykonane

Odkrycie śladu światłem (przytrzymanie) i klikiem; szafka: światło → etykieta
„Otwórz” → klik → crossfade → zaliczenie (samo przytrzymanie nie zalicza);
komplet 5/5 → finał → `k06:completed` **raz** (ponowne `finish()` nie emituje);
pięć zdarzeń `k06:trace`; klawiatura end-to-end (krok zmierzony: 4,50%,
auto-repeat odfiltrowany, `blur` zwalnia klawisze) i drugi tor Tab/Enter;
most `k06:pointer` / `k06:key` wraz z odrzucaniem obcych komunikatów;
osadzenie w ramce z nasłuchem na `contentWindow` **i** `contentDocument`
(jedno zaliczenie); kursor poza kadrem nie gubi latarki; odbicie latarki przy
lewej krawędzi z histerezą; `prefers-reduced-motion`; mobile 320×568,
390×844 i 844×390 (brak poziomego przewijania, karta pod kadrem gdy kadr niski);
zastępnik `?mock=1` (zero żądań grafik, zero 404); konsola bez błędów gry.

**Korekta K06.1:** pomiar plamy kontra pola trafienia na pięciu rozmiarach
(tabela wyżej); pole śladu 3 przeniesione na środek frontu drzwiczek —
pozycja wyznaczona z różnicy renderów (fronty zajmują y 61,0%–84,5%, więc
środek wypada na 72,5%), a nie „na oko”; etykieta „Otwórz” pozostaje przy
klamkach na y 62,5%.
