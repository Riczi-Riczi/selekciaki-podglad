# Akcja kanalizacja — prototyp K04 (klasy 4–5)

Samodzielna gra labiryntowa dla klocka **K04** e-lekcji SELEKT (Trop 3
„Pierwszy trop prowadzi pod ziemię”). Uczeń prowadzi wodę rurami **od lejka
przy studzience do rury zatkanej zastygłym tłuszczem**. Wniosek śledczy:
tłuszcz z jednego zlewu potrafi zatkać rurę całej ulicy — dlatego zużyty
olej trafia do butelki i Olejomatu, a nie do kanalizacji.

Gra zastępuje moduł Genially „Rurociąg / Akcja kanalizacja”. Genially się
zawieszał, bo **każdy krok był nowym obrazem 6901 × 6901 px**, strzałki były
kilkupikselowe, a bramka dźwięku blokowała wejście. Tutaj są **dwa obrazy
wczytane raz na starcie** — między krokami nie leci ani jeden request.

> Prototyp **nie jest jeszcze wpięty** w lekcję i **niczego nie zapisuje**:
> ani do `localStorage`, ani do stanu lekcji. Litery **nie przyznaje** —
> po prostu ją pokazuje. Zapis litery **P** należy do strony lekcji
> (`lesson-state.js` → `unlockLetterEntry`).

## Uruchomienie

```bash
npx serve -l 3000 site
```

→ `http://localhost:3000/edukacja/prototypy/k04-rurociag/`

| Adres | Do czego |
|---|---|
| `…/k04-rurociag/` | normalna gra |
| `…/?debug=1` | graf labiryntu na obrazie, numery węzłów, trasa wzorcowa, odczyt pozycji pod kursorem, hak `K04_DEV` |
| `…/?embed=board` | tryb tablicy lekcji: klasa `k04-embed` na `<html>`, przezroczyste tło |

Parametry można łączyć: `?debug=1&embed=board`.

## Jak wygląda trasa — wstęga, nie linia

Przebyta rura robi się **cała niebieska**, dokładnie jak na slajdach
Genially. Nie rysujemy linii NA rurze:

1. **`labirynt-niebieski.webp`** to kopia całego labiryntu, w której zieleń
   rur została przebarwiona na błękit. Przebarwienie policzone **ze slajdów
   klienta**: 6 slajdów z niebieskim wypełnieniem porównano z tłem bazowym,
   zebrano 1,15 mln próbek „ten zielony piksel → ten niebieski”, uśredniono
   do 603 kubełków koloru (5 bitów na kanał) i tę tablicę nałożono na tło.
   Dotykamy wyłącznie zieleni (`G ≥ R+5` i `G ≥ B+5`), więc **czerwone
   zawory, manometry, zator, piasek i ziemia zostają nietknięte**. Alfa
   kopii jest obcięta do maski rur (poszerzonej o 1 px) — poza rurami plik
   jest przezroczysty.
2. Kopia leży nad oryginałem i widać z niej **tylko to, co odsłoni maska
   SVG**. W masce są dwa obrysy: `#trailDone` (odcinki ukończone) i
   `#trailLive` (odcinek animowany w tej chwili, `stroke-dashoffset`).
3. Kolejne odcinki są **sklejane w jedną polilinię**. To jest sedno: gdyby
   każdy odcinek był osobną ścieżką, na skrzyżowaniu spotykałyby się dwie
   zaokrąglone końcówki i wstęga wyglądałaby jak doklejane kawałki. Po
   sklejeniu jest tam zwykłe załamanie linii. Test sprawdza, że cała trasa
   to **jedna podścieżka** (`d` zaczyna się jednym `M`).

**Szerokość wstęgi: 2,25 % kadru.** Z pomiaru maski rur: rura ma 2,07 %,
pierścienie łączeń do 2,3 %. Przy 3,1 % (pierwsze podejście) błękit
przeciekał na sąsiednie rury tam, gdzie stykają się bez prześwitu; przy
2,25 % wychodzi poza rurę o ~1,2 px (przy 1400 px) i nie przecieka nigdzie.

Wariant zapasowy — gruba linia w trybie `multiply` — **odrzucony po
porównaniu**: rury robiły się mętno-morskie, a zawory ciemniały razem z nimi.

## Zasady gry

- Kadr **1:1** — dokładnie taki, jak oryginalna grafika labiryntu.
- Stan gry to **bieżący węzeł**. Na węźle pojawiają się duże strzałki
  (min. 48 px), po jednej na każdą wychodzącą rurę.
- Klik w strzałkę albo klawisz **← → ↑ ↓** = ruch: woda płynie po rurze
  animacją ~0,6 s, węzeł staje się bieżącym.
- **Ślepy zaułek**: woda dopływa do końca odnogi, hydraulik komentuje
  (karta + głos), po czym woda **cofa się sama** na skrzyżowanie.
- **Ruch, który oddala od zatoru, ale prowadzi dalej**, NIE cofa wody
  automatycznie — pada łagodne „Czy to na pewno dobra droga?”, a uczeń
  decyduje sam.
- **Bez limitu czasu, bez przegranej.**
- Dojście do zatoru → błysk alarmu + plansza ze zbliżeniem zatoru → tło
  zmienia się na wersję z **rurą udrożnioną** → „Świetna robota” + jingiel
  → **tablica końcowa** z literą **P** i wynikiem.

### Sterowanie: same niebieskie strzałki

Osobnego przycisku „Cofnij” **nie ma**. Wszystkie trzy role są strzałkami
i różnią się odcieniem, nie kolorem:

| wygląd | klasa | rola | `aria-label` |
|---|---|---|---|
| pełny błękit wody, biały grot, delikatnie pulsuje | `act--fwd` | rura pusta — ruch naprzód | „Puść wodę w lewo” |
| **jaśniejszy błękit, ciemny grot** | `act--back` | rura, którą woda przypłynęła — **cofnięcie**: błękit ściera się animacją wsteczną, stan wraca na poprzednie skrzyżowanie | „Wróć tą rurą — w lewo” |
| przygaszona, przekreślona | `act--off` | rura już wypełniona, ale **nie** powrót — blokada pętli | „Tędy woda już płynęła — w lewo” |

**Backspace** nadal cofa, tylko nie ma już własnej ikony.

Strzałki z powrotem do lejka nie ma wcale: z lejka się wypływa, a nie wpływa.

### Pętle — wariant blokady

Strzałka na rurę, która jest już w trasie (i nie jest powrotem o jeden
odcinek), jest **nieaktywna**. Kliknięcie **nie rusza wody** — pada tylko
komentarz „Nie żartuj. Chcesz tak kręcić się w kółko?”. Kręcenie w kółko
jest więc niemożliwe z konstrukcji, a nie z upomnienia.

Przycisk ma `aria-disabled="true"`, a nie `disabled` — zostaje w kolejce
Taba i po naciśnięciu mówi, **dlaczego** nic się nie stało.

Uczeń nigdy nie utknie: strzałka „wróć” jest dostępna zawsze, więc
z każdego zaułka i z każdej pętli da się wycofać aż do lejka.

### Eskalacja komentarzy

| Sytuacja | Reakcja |
|---|---|
| ruch zbliżający do zatoru | losowy głos „dobry ruch” (5 wariantów, nigdy dwa razy z rzędu), bez karty |
| ślepy zaułek | karta + głos (4 warianty) → automatyczne cofnięcie |
| 1., 3., 5.… ruch oddalający | „Czy to na pewno dobra droga?” (co drugi, żeby nie zrzędzić) |
| 3 złe ruchy z rzędu | „Nie żartuj. Chcesz tak kręcić się w kółko?” (raz na serię) |
| 5 złych ruchów z rzędu | „Rety… nie mamy na to całego dnia!” (raz na serię) |
| próba wejścia w rurę już wypełnioną | j.w., bez zmiany stanu |
| ≤ 2 ruchy od zatoru | „Jesteś prawie na miejscu!” — **raz na całą grę** |

Serie zeruje każdy ruch zbliżający do zatoru.

**Cofanie jest ciche.** Hydraulik odzywa się wyłącznie po **wskazaniu rury** —
przy wycofywaniu się (strzałka „wróć” albo Backspace) nie ma ani głosu, ani
karty. Do `aria-live` idzie sam neutralny komunikat „Cofnięto o jeden
odcinek.”, żeby czytnik ekranu wiedział, że woda się przesunęła.

## Komunikaty hydraulika — nierozłączne trójki

**Zasada twarda:** jeden komunikat to jeden obiekt `{ plate, text, voice }`.
Kod losuje i przekazuje dalej **cały obiekt**, nigdy pojedyncze pole.
`text` jest przepisany **dosłownie z dymka na planszy**, więc podpis pod
kartą, obrazek i nagranie zawsze mówią to samo.

| # | plansza (`assets/images/hydraulik/`) | podpis = dymek | nagranie (`assets/audio/`) | kiedy |
|---|---|---|---|---|
| 1 | `nie-tedy-droga` | „Nie tędy droga!” | `zle-nie-tedy` | ślepy zaułek |
| 2 | `zawroty-glowy` | „Ojoj! Chyba zakręciło mi się w głowie.” | `zle-zawroty` | ślepy zaułek |
| 3 | `na-moje-oko` | „Na moje oko nic z tego nie będzie.” | `zle-na-moje-oko` | ślepy zaułek |
| 4 | `co-ja-ci-zrobilem` | „Co ja Ci zrobiłem?! Proszę, zmień kierunek.” | `zle-co-ja-ci-zrobilem` | ślepy zaułek |
| 5 | `czy-dobra-droga` | „Hm… Czy to na pewno dobra droga? Spróbuj jeszcze raz.” | `watp-czy-dobra` | objazd |
| 6 | `chcesz-sie-krecic` | „Nie żartuj. Chcesz tak kręcić się w kółko?” | `dlugo-krecic` | pętla, 3 złe ruchy z rzędu |
| 7 | `nie-mamy-dnia` | „Rety… nie mamy na to całego dnia!” | `dlugo-nie-mamy-dnia` | 5 złych ruchów z rzędu |
| 8 | `prawie-na-miejscu` | „Jesteś prawie na miejscu! Ale znajdź krótszą trasę.” | `blisko-prawie` | ≤ 2 ruchy od zatoru |
| 9 | `swietna-robota` | „Świetna robota! Wierzyłem w Ciebie.” | `final-gratulacje` | finał |

Bez karty, sam dźwięk (nie ma czego zestawić niespójnie): 5 głosów „dobry
ruch”, narrator, „bierzmy się do pracy”, jingiel, melodia.

### Jak zasada jest wymuszona w kodzie

- `SAY_ALL` to płaska lista wszystkich dziewięciu trójek; każda jest
  `Object.freeze`.
- `showCard()` **odmawia** pokazania czegokolwiek spoza tej listy: pod
  `?debug=1` rzuca wyjątkiem, w trybie normalnym loguje błąd i nie pokazuje
  karty. Zbudowanie karty „ręcznie” z planszy A i podpisu B jest niemożliwe.
- `K04_DEV.checkTriples()` sprawdza komplet pól i to, że ta sama plansza
  nigdy nie ma dwóch różnych podpisów ani dwóch różnych nagrań.
- Test przejściowy: przejście przez **wszystkie 22 ślepe zaułki** zbiera
  pary (plansza, podpis) i weryfikuje, że są stałe.

### Trzy nagrania bez planszy — świadomie nieużywane

`Nietety to zły ruch`, `Już prawie finish` i `Hola, hola wydłużasz trasę`
nie mają w materiale swojej planszy. **Decyzja klienta: nie dodajemy dźwięków
bez powiązanej grafiki.** Pliki zostają w `assets/audio/` (`zle-zly-ruch`,
`blisko-finish`, `dlugo-hola`, razem ~105 KB), ale nic ich nie odtwarza.

Miejsce po „Hola, hola” (seria cofnięć) nie zostało niczym zastąpione —
cofanie jest po prostu ciche.

## Tablice: początkowa i końcowa

Ekran startu i ekran finału to **gotowe grafiki** z materiału klienta, z całą
treścią wpaloną w obraz. Żywe są tylko liczby i przyciski.

Każda z nich ma **dwie postacie** w DOM naraz:

| postać | kiedy | co zawiera |
|---|---|---|
| tablica graficzna | gdy renderuje się co najmniej **600 px** szeroka | obraz + przezroczysty `<button>` (+ liczby SVG na końcowej) |
| karta HTML | poniżej tego progu | ten sam tekst i ten sam przycisk, tylko złożone w HTML |

Widoczna jest zawsze dokładnie jedna — o tym decyduje `data-form="graf"`
albo `"karta"` na `.overlay`. Przyciski w obu postaciach mają wspólne klasy
`.js-start` i `.js-final`, więc obsługuje je jedno zdarzenie.

### Tablica początkowa

`assets/images/tablica-poczatkowa.webp` (1200 × 1262, 210 KB). Fabuła
i instrukcja są wpalone w grafikę, więc powtarzamy je w bloku `.sr-board`
dla czytnika ekranu. Blok znika razem z tablicą (`display: none`, czyli
i z drzewa dostępności) — inaczej przy karcie HTML czytnik przeczytałby
tę samą treść dwa razy. Przycisk: lewa 32,54 %, góra 77,83 %,
szer. 38,59 %, wys. 6,27 %.

### Tablica końcowa

`assets/images/tablica-koncowa.webp` (1200 × 1144, 165 KB). Na niej:

- **trzy liczby** — ruchy, ślepe zaułki, cofnięcia. Pola po wypalonych „25 / 8 / 7”
  są **wyczyszczone w samym pliku**: sklonowanym czystym paskiem pigułki.
  Płaska łata w kolorze tła zostawiała widoczny ślad, bo tło pigułki ma
  delikatną fakturę.
- Liczby wstawia SVG w **układzie współrzędnych grafiki** (`viewBox 0 0 2114 2016`),
  gdzie linia bazowa `y = 1620` trafia co do piksela w miejsce po cyfrach.
  Wysokość cyfry: 36 jednostek, szerokość 24,5 na cyfrę — tyle miały wypalone.
  Stopień pisma kalibruje `kalibruj()` kanwą (`actualBoundingBoxAscent`), bo
  `getBBox()` na `<text>` zwraca pudełko em kroju, nie zasięg tuszu.
  Szerokość wymusza `textLength`, bo systemowy grotesk jest o ~30 % szerszy
  od użytego w grafice. Gdy liczba nie mieści się w pigułce — ściska się,
  zamiast wyjść poza krawędź.
- **przycisk** — przezroczysty `<button>` dokładnie na wpalonej zielonej płytce,
  `min-height: 44px` na telefonie.

**„Ślepe zaułki” to osobny licznik.** Tablica pokazuje `state.deadEnds` (same
zaułki), a payload `k04:completed` nadal niesie `wrongTurns` (zaułki **plus**
objazdy oddalające) — kontrakt się nie zmienił.

### Próg czytelności

Napisy na tablicach są wpalone i skalują się razem z grafiką. Zmierzone
wysokości x (na oryginale 2016 px szerokości):

| tekst | x-height | % szerokości | na kadrze 366 px | na kadrze 640 px |
|---|---|---|---|---|
| tekst fabularny (tablica startowa) | 34,5 px | 1,712 % | 6,3 px | 11,0 px |
| ramka instrukcji (startowa) | 28 px | 1,389 % | **5,1 px** | 8,9 px |
| podpis pod przyciskiem (startowa) | 24 px | 1,190 % | 4,4 px | 7,6 px |
| „Litera trafia do…” (końcowa) | 26 px | 1,230 % | **4,5 px** | 7,9 px |

Dla odniesienia: tekst 16 px ma x-height ok. 8,4 px, 14 px ok. 7,3 px,
12 px ok. 6,3 px. Na telefonie wpalona instrukcja czytałaby się jak tekst
**9,7 px** — dla klas 4–5 za mało.

Próg to **600 px szerokości renderowania tablicy** — i liczymy go z REALNEGO
rozmiaru, nie z media query na oknie:

```js
szerokość = min(640, dostępna szerokość kadru,
                dostępna wysokość kadru × proporcje tablicy)
```

Media query na oknie kłamałaby. W lekcji gra siedzi w ramce o własnej
wysokości: na laptopie 1366 × 768 okno jest szerokie, ale ramka może mieć
600 px i tablica i tak by się skurczyła. Liczy to `updateBoards()` w `k04.js`,
wynik wpisuje w `--board-start` / `--board-final` i ustawia `data-form`.
Przeliczenie odpala **`ResizeObserver` na kadrze gry** oraz `resize`
i `orientationchange` — postać przełącza się na żywo, w obie strony.

Zmierzone zachowanie:

| kontekst | tablica startowa | tablica końcowa |
|---|---|---|
| prototyp 1440 × 900 | 640 px → **grafika** | 640 px → **grafika** |
| prototyp 1366 × 768 | 640 px → **grafika** | 640 px → **grafika** |
| prototyp 768 × 1024 | 640 px → **grafika** | 640 px → **grafika** |
| prototyp 390 × 844 | 362 px → **karta** | 362 px → **karta** |
| `?embed=board`, ramka 1200 × 760 | 640 px → **grafika** | 640 px → **grafika** |
| `?embed=board`, ramka 1200 × 640 | 572 px → **karta** | 562 px → **karta** |
| `?embed=board`, ramka 1200 × 560 | 496 px → **karta** | 478 px → **karta** |

Powrót ramki z 560 na 760 px przywraca grafikę bez przeładowania.

## Kontrakt integracyjny

### Sygnał ukończenia

```js
window.addEventListener("k04:completed", (e) => {
  e.detail; // { letter: "P", moves: 14, wrongTurns: 0, undos: 0 }
});
```

- emitowane na `window`, `bubbles: true`, **DOKŁADNIE RAZ** na cykl życia
  strony (strażnik `state.completionSent`),
- moment: pokazanie ekranu finałowego (po alarmie i podmianie tła),
- `moves` — wszystkie wykonane ruchy,
- `wrongTurns` — ruchy, które **nie zbliżyły** do zatoru: wejścia w ślepe
  zaułki **plus** objazdy oddalające,
- `undos` — cofnięcia strzałką „wróć” lub Backspace (automatyczny powrót
  ze ślepego zaułka się **nie liczy**),
- gra **nie przyznaje litery** i niczego nie zapisuje.

Strona lekcji nasłuchuje zwykle równolegle na `contentWindow` i
`contentDocument` ramki — dlatego emitujemy **tylko na `window`**; podwójny
cel zaliczyłby klocek dwa razy.

### Most z lekcji (opcjonalny)

Gra działa w pełni bez rodzica. Jeśli lekcja chce sterować z zewnątrz:

```js
iframe.contentWindow.postMessage({ type: "k04:key", key: "ArrowLeft", down: true }, "*");
```

Przyjmowane `key`: `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`,
`Backspace`, `Escape`, `Enter`. Komunikaty spoza `window.parent` są
ignorowane (`e.source !== window.parent`).

**Most i klawiatura fizyczna idą tą samą ścieżką** — obsługuje je jedna
funkcja `handleKey(key, source)`. Ma to znaczenie przy otwartej karcie
hydraulika, bo karta przykrywa strzałki:

| stan | `Backspace` / `Escape` / `Enter` | strzałki |
|---|---|---|
| karta otwarta | **zamykają kartę** (i uciszają głos) | ignorowane |
| karta zamknięta | `Backspace` cofa wodę | ruch albo cofnięcie, jak klik w tę strzałkę |

Wcześniej most wołał cofnięcie z pominięciem gałęzi zamykającej kartę,
więc uczeń sterujący klawiaturą z poziomu lekcji utykał na pierwszej karcie
— strzałki nie miały czego nacisnąć, a `Backspace` nie zamykał karty.
Kontrakt `k04:key` się nie zmienił.

### Sygnał „idziemy dalej”

```js
window.addEventListener("k04:continue", () => { /* przewiń lekcję dalej */ });
```

- emitowane po kliknięciu przycisku na tablicy końcowej, na `window`,
  `bubbles: true`, **DOKŁADNIE RAZ** (strażnik `state.continueSent`),
- **bez `detail`** — to czysty sygnał nawigacyjny,
- **nie dotyka `k04:completed` ani jego payloadu**: to osobne, wcześniejsze
  zdarzenie, które leci już przy pokazaniu tablicy,
- po kliknięciu przycisk dostaje `aria-disabled="true"` i przestaje reagować,
  a tablica **zostaje na ekranie** — nawigację przejmuje lekcja.

### Dźwięk lekcji

Głosy hydraulika to **dźwięk gry** i mają własny przełącznik w HUD
(wzorzec K16). Narrację sceny lekcji wycisza obserwator gry po stronie
lekcji — gra nie robi tu nic więcej.

## Graf labiryntu

Dane siedzą w **`k04-mapa.js`** (`K04_MAP`), bez logiki. Wszystkie
współrzędne w **procentach kadru** (0–100); kadr jest kwadratowy, więc ten
sam procent działa na każdym ekranie.

```js
K04_MAP = {
  entry: 11,            // lejek
  goals: [419, 427],    // OBA końce zatkanej rury — wygrana z każdego
  nodes: [ { id, x, y }, … ],           // 66 węzłów
  edges: [ { a, b, p: [[x,y], …] }, … ] // 74 rury, p = polilinia od a do b
}
```

| | |
|---|---|
| węzłów | 66 |
| rur (krawędzi) | 74 |
| skrzyżowań T (stopień 3) | 39 |
| skrzyżowanie czterodrożne | 1 (węzeł 395) |
| ślepych zaułków | 22 |
| niezależnych pętli | 9 |
| najkrótsza trasa | **14 ruchów** |
| punktów w poliliniach | 421 (plik 12 KB) |

Ślepe zaułki: `21, 57, 71, 81, 89, 93, 117, 120, 173, 176, 206, 219, 222,
251, 258, 273, 318, 339, 343, 346, 359, 361`.

Najkrótsza pętla (do testów blokady): węzły **350 ↔ 402** łączą dwie
równoległe rury (krawędzie 64 i 68).

### Skąd wziął się graf

Nie z oka — z materiału Genially, programowo:

1. **Maska rur** z `Labirynt_rurociąg_slajd 01_dol.jpg` (zieleń + ciemne
   kontury + zawory + manometry), przycięta do jaskini piaskowej,
   największa spójna składowa.
2. **Szkieletyzacja** Zhang-Suen → linia środkowa rur.
3. **Graf**: piksele szkieletu o stopniu ≠ 2 to węzły, spójne składowe
   reszty to krawędzie. Usunięcie artefaktów (kołnierze, zawory),
   rozpuszczenie węzłów stopnia 2, uproszczenie Douglas-Peuckerem.
4. **Weryfikacja trasy**: 33 slajdy z niebieskim wypełnieniem zamienione
   na maski wody i nałożone na krawędzie. Krawędzie na trasie: pokrycie
   **0,95–0,99**; poza trasą **≤ 0,05**.

Ta sama maska rur posłużyła potem jako alfa dla `labirynt-niebieski.webp`.

### Trasa wzorcowa (14 ruchów)

Rysuje ją `?debug=1` grubą niebieską linią.

| # | z węzła | do węzła | strzałka | pozycja startu (x, y) | wyjść ze skrzyżowania |
|---|---|---|---|---|---|
| 1 | 11 | 25 | ↓ w dół | 81,95 % · 21,31 % | 1 |
| 2 | 25 | 62 | ← w lewo | 81,55 % · 25,21 % | 3 |
| 3 | 62 | 28 | ↑ w górę | 57,66 % · 31,71 % | 3 |
| 4 | 28 | 33 | ← w lewo | 57,71 % · 25,52 % | 3 |
| 5 | 33 | 32 | ← w lewo | 28,36 % · 25,80 % | 3 |
| 6 | 32 | 192 | ← w lewo | 20,93 % · 25,80 % | 3 |
| 7 | 192 | 191 | ↑ w górę | 27,84 % · 50,64 % | 3 |
| 8 | 191 | 268 | ↓ w dół | 33,66 % · 50,57 % | 3 |
| 9 | 268 | 265 | → w prawo | 39,71 % · 62,95 % | 3 |
| 10 | 265 | 266 | → w prawo | 45,86 % · 62,84 % | 3 |
| 11 | 266 | 312 | ↓ w dół | 51,83 % · 62,88 % | 3 |
| 12 | 312 | 395 | ↓ w dół | 51,91 % · 72,64 % | 3 |
| 13 | 395 | 412 | ↓ w dół | 69,50 % · 80,29 % | 4 |
| 14 | 412 | 427 | ↓ w dół | 57,86 % · 86,59 % | 3 |

Strzałka pokazuje kierunek, w którym rura **wychodzi** z węzła — dalej może
się wić (np. krok 6 startuje w lewo, a kończy 25 % niżej).

## Dostępność

- **Drugi tor**: wszystkie strzałki to zwykłe `<button>` — Tab je obchodzi,
  Enter/Spacja uruchamia. Strzałki zablokowane też, przez `aria-disabled`.
- **Klawiatura**: ← → ↑ ↓ działają na **tę samą strzałkę, w którą trafiłaby
  mysz** — łącznie z cofnięciem (klawisz w stronę rury, którą woda przypłynęła)
  i blokadą pętli (klawisz w rurę już wypełnioną = komentarz, bez ruchu).
  **Backspace** = cofnij, **Esc** = zamknij kartę hydraulika.
  Jeden selektor `.act` obsługuje i klawiaturę, i fokus startowy — rozjechanie
  się tych dwóch miejsc zabiło kiedyś całe sterowanie klawiaturą, więc trzyma
  je teraz wspólna klasa, a nie nazwa wariantu.
- **`aria-live`**: każdy komunikat hydraulika i każde cofnięcie trafia do
  `#srStatus` — czytnik ekranu dostaje ten sam tekst, co widnieje na karcie
  (to ten sam `text` z trójki).
- **`prefers-reduced-motion`**: woda skacze zamiast płynąć (bez animacji
  `dash-offset`), strzałki nie pulsują, alarm nie miga, karta nie wjeżdża.
  Zmierzone: ruch kończy się w < 100 ms.

## Mobile

- Kadr 1:1 → **na telefonie w pionie jest większy niż w poziomie**, dlatego
  nie ma podpowiedzi „obróć telefon”.
- Przyciski: `max(48px, 8 % kadru)`. Odsunięcie strzałki od węzła liczy się
  **w pikselach** (`measure()` w `k04.js`), nie stałym procentem — inaczej
  na kadrze 320 px strzałki nachodziłyby na siebie. Warunek: dwie
  prostopadłe strzałki są od siebie o `r · √2`, co musi być ≥ średnica
  przycisku.
- Sprawdzone na 320 × 568, 390 × 844 i 1240 × 980: zero nachodzenia
  przycisków, zero poziomego scrolla, nic nie wychodzi poza kadr.

## Pliki i waga

```
k04-rurociag/
├─ index.html
├─ k04.css
├─ k04.js            ← logika
├─ k04-mapa.js       ← dane grafu (K04_MAP), 12 KB
├─ README.md
└─ assets/
   ├─ images/       1168 KB
   │  ├─ labirynt.webp           181 KB  1800² — tło gry
   │  ├─ labirynt-niebieski.webp 189 KB  1800² — rury na błękit, alfa = maska rur
   │  ├─ labirynt-drozny.webp    152 KB  1800² — finał, rura udrożniona
   │  ├─ tablica-koncowa.webp     165 KB  1200² — ekran finału (pola liczb wyczyszczone)
   │  ├─ tablica-poczatkowa.webp  210 KB  1200 × 1262 — ekran startowy
   │  ├─ tytul.webp              162 KB  ekran startowy w karcie HTML
   │  ├─ zator-zblizenie.webp     33 KB  plansza alarmu
   │  └─ hydraulik/              421 KB  9 plansz 760², po ~45 KB
   └─ audio/        1564 KB   21 plików MP3 (18 używanych + 3 odłożone)
```

Bez audio: **~1,2 MB** (cel ≤ 2 MB). Same tła: 181 + 189 KB, oba wczytane
raz na starcie. Mastery 6901² zostają w repo Codex — tutaj są tylko kopie
produkcyjne.

## Hak QA (`?debug=1`)

Warstwa debugowa rysuje **cały graf** (cienkie czerwone rury), **trasę
wzorcową** (gruba niebieska), numery węzłów i znaczniki: żółty = lejek,
zielone = oba końce zatoru, fioletowe = ślepe zaułki.

```js
K04_DEV.finish()        // natychmiastowy finał — test wpięcia w lekcję
K04_DEV.goto(350)       // przeskok na węzeł (czyści wstęgę i stos)
K04_DEV.solve()         // jeden krok trasą wzorcową
K04_DEV.path()          // ["11→25", "25→62", …]
K04_DEV.checkTriples()  // { trojek: 9, plansz: 9, bledy: [] }
K04_DEV.state()         // { mode, cur, distToGoal, moves, wrongTurns, undos, trail, completionSent }
```

Hak istnieje **wyłącznie** pod `?debug=1`.

## Wyniki testów (korekta K04.1)

| test | wynik |
|---|---|
| przejście trasą wzorcową (klik i klawiatura) | 14 ruchów, meta ✔ |
| `k04:completed` | wysłane **raz**, `{ letter:"P", moves:14, wrongTurns:0, undos:0 }` ✔ |
| **ciągłość wstęgi** | cała trasa = **1 podścieżka** w atrybucie `d` (zero sklejek) ✔ |
| **wszystkie 22 ślepe zaułki** | karta + automatyczne cofnięcie — 22/22 ✔ |
| **spójność trójek, test automatyczny** | `checkTriples()` → 9 trójek, 9 plansz, 0 błędów; przy 22 zaułkach każda plansza zawsze z tym samym podpisem ✔ |
| **cofanie strzałką** w kolejnych stanach | trasa i licznik `undos` kurczą się poprawnie, na lejku strzałki „wróć” brak ✔ |
| **cofanie jest ciche** | 5 cofnięć z rzędu: 0 kart, 0 głosów, tylko neutralny `aria-live` ✔ |
| głos wraca po wskazaniu nowej rury | po cofnięciu i nowym ruchu gra „dobry ruch” ✔ |
| **blokada pętli 350 ↔ 402** | po objściu pętli: 2 strzałki `off` (`aria-disabled`), 1 `back`; klik w zablokowaną → komentarz, **trasa bez zmian** ✔ |
| `prefers-reduced-motion` | ruch kończy się w < 100 ms, bez `dash-offset` ✔ |
| 320 × 568 / 390 × 844 / 1240 × 980 | brak nachodzenia przycisków, brak poziomego scrolla ✔ |
| **pełna trasa SAMĄ KLAWIATURĄ** (← → ↑ ↓) | 14 ruchów, `k04:completed` **raz**, `{letter:"P", moves:14, wrongTurns:0, undos:0}` ✔ |
| klawiatura: Backspace i klawisz „wróć” | oba cofają, licznik `undos` rośnie ✔ |
| klawiatura: klawisz w rurę zajętą | komentarz, ruchy bez zmian ✔ |
| **pełna trasa SAMYMI `postMessage k04:key`** (dźwięk wyłączony) | 14 ruchów, 1 karta zamknięta `Backspace` z mostu, `k04:completed` **raz** ✔ |
| most: trasa z objazdem w ślepy zaułek | 15 ruchów, **2 karty** zamknięte z mostu, payload `{moves:15, wrongTurns:1, undos:0}` ✔ |
| most: strzałka przy otwartej karcie | węzeł i licznik ruchów bez zmian, karta nadal otwarta ✔ |
| most: `Escape` przy otwartej karcie | karta zamknięta ✔ |
| tablica końcowa: liczby | rozgrywka 19 ruchów / 3 zaułki / 2 cofnięcia → tablica pokazuje 19 / 3 / 2 ✔ |
| `k04:continue` | trzy kliknięcia → zdarzenie **raz**, przycisk `aria-disabled` ✔ |
| `k04:completed` po dodaniu tablicy | nadal **raz**, payload bez zmian (`wrongTurns` = 4 przy `deadEnds` = 3) ✔ |
| próg tablic — prototyp | 1440 × 900, 1366 × 768, 768 × 1024 → grafika; 390 × 844 → karta (362 px) ✔ |
| próg tablic — `?embed=board` | ramka 760 px → grafika; 640 px → karta (572/562); 560 px → karta (496/478); powrót na 760 → znów grafika ✔ |
| przyciski tablic | grafika: start 70 px, finał 64 px · karta: oba 50 px — wszędzie ≥ 44 px ✔ |
| brak poziomego scrolla | 1440 / 768 / 390 ✔ |
| konsola (tryb produkcyjny) | 0 komunikatów ✔ |
| sieć | 21 plików, 0 odpowiedzi 404 ✔ |

## Czego gra świadomie NIE robi

- nie zapisuje postępu (`localStorage`, stan lekcji) — to zadanie lekcji,
- nie przyznaje litery **P**, tylko ją pokazuje,
- nie ma limitu czasu ani przegranej,
- nie pozwala kręcić się w kółko (blokada rur już wypełnionych),
- nie odtwarza trzech nagrań, które nie mają swojej planszy,
- nie komentuje cofania — hydraulik odzywa się dopiero po wskazaniu rury,
- nie pokazuje tablicy graficznej tam, gdzie jej wpalony tekst byłby za mały.
