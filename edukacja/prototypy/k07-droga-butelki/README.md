# Droga butelki — prototyp K07 (klasy 4–5)

Samodzielny prototyp klocka **K07** e-lekcji SELEKT: układanka sześciu kart
pokazujących pełną drogę butelki Olejomatu — od rejestracji w aplikacji
po oddanie pełnej butelki.

> Moduł jest osadzony w rozdziale P05 tablicy śledztwa (tryb
> `?embed=board`, Etapy 2B/2B.1) oraz w wariancie `?legacy=1` lekcji.
> Nie przyznaje litery, nie zapisuje niczego do `localStorage` i nie
> używa `postMessage` — po ułożeniu emituje wyłącznie zdarzenie
> `k07:completed`.

## Uruchomienie

```bash
npx serve -l 3000 site
# → http://localhost:3000/edukacja/prototypy/k07-droga-butelki/
```

## Zasady

- Sześć kart startuje w banku w losowej kolejności (nigdy w poprawnym układzie).
- Uczeń przenosi karty do sześciu ponumerowanych pól na planszy:
  1. rejestracja w aplikacji z pomocą osoby dorosłej;
  2. odbiór pustej butelki w Olejomacie;
  3. zabranie butelki do domu;
  4. przelanie ostygniętego oleju (z pomocą osoby dorosłej);
  5. dokładne zakręcenie butelki;
  6. oddanie pełnej butelki do Olejomatu.
- Bez limitu czasu, punktów ujemnych i resetu poprawnych kart.
- **Lupa na planszy jest jedynym przyciskiem sprawdzenia.** Aktywuje się
  (pulsuje + napis „Sprawdź kolejność") po obsadzeniu wszystkich sześciu pól.
  Poprawne karty zostają zablokowane; błędne można przestawiać dalej.
  Identycznego błędnego układu nie można sprawdzić ponownie — lupa budzi
  się dopiero po przestawieniu błędnej karty (sygnatura układu).
- **Ekran konsoli** (niebieskie monitory planszy) pokazuje komunikaty:
  start → „Ułóż sześć kart we właściwej kolejności.", komplet → „Wszystkie
  karty są na planszy. Kliknij lupę.", sprawdzanie → „Sprawdzam kolejność…",
  błąd → „Część drogi jest poprawna. Przestaw pozostałe karty.",
  sukces → „Droga butelki gotowa!". Osobny niewidoczny region `aria-live`
  ogłasza pełniejsze komunikaty czytnikom ekranu.
- Po sukcesie: bursztynowa trasa zapala się kolejno 1→6, zielone kontrolki
  i światło Olejomatu świecą, otwiera się **zamykane okno** „Droga butelki
  gotowa" z informacją o bezpieczeństwie (Escape/„Zamknij"; zamknięcie nie
  resetuje planszy, fokus wraca na lupę).

## Dźwięk

Cztery kategorie (menedżer SFX — jedna instancja na dźwięk, bez nakładania;
brak dowolnego pliku nigdy nie blokuje układanki):

| Zdarzenie | Plik (`site/assets/sound/`) |
|---|---|
| udane umieszczenie karty (1× na ruch, zamiana = 1×) | `click_sound_v1.mp3` |
| praca maszyny w fazie sprawdzania | `k07-machine-check.mp3` |
| wynik negatywny | `Short_negative_feedb_mashine.mp3` |
| wynik pozytywny | `Postitive-way-maschine-accept.mp3` |

Wybór/anulowanie/odrzucony ruch — bez dźwięku. Wynik odtwarza się po
zakończeniu dźwięku maszyny albo po limicie 2,6 s (konfiguracja w
`AUDIO_CFG` na górze `k07.js`).

**Nagranie polecenia**
(`assets/audio/lekcja45/07-droga-butelki/01-wprowadzenie.mp3`, ~15 s)
gra **wyłącznie po świadomym kliknięciu** przycisku
„▶ Odtwórz polecenie" (stan grający: „⏸ Zatrzymaj polecenie"), zawsze
od początku. **Bez autostartu i bez uzbrajania do pierwszego gestu**
(decyzja Etapu 2B.1 — dotyczy podglądu i osadzenia). Rozpoczęcie
układania (wybór lub przeciągnięcie karty) zatrzymuje nagranie, żeby
nie nakładało się z efektami gry. Zmiana trybu „Czytam/Słucham" na
stronie lekcji może nagranie wyłącznie **zatrzymać** (tryb „Czytam"),
nigdy nie uruchamia go sama (`syncK07Voice` w `modules.js`).

## Tryb osadzenia (`?embed=board`)

Rozdział P05 tablicy osadza prototyp z parametrem `?embed=board`
(dokleja go silnik tablicy — `data-src` w lekcji pozostaje bez parametru,
więc wariant `?legacy=1` dalej pokazuje pełny układ). Inline'owy skrypt
w `<head>` ustawia klasę `k07-embed` na `<html>` przed pierwszym
malowaniem, a CSS w tym trybie:

- robi tło dokumentu przezroczystym i zmniejsza padding (koniec wrażenia
  „okna w oknie" — tytuł, opis i tło daje rozdział);
- chowa notkę prototypową, „Klocek 7", tytuł i lead;
- zostawia planszę z żółto-ciemną obudową (część interakcji), bank kart,
  notę „Bez limitu czasu…", kontrolkę polecenia, statusy i dialog.

## Sterowanie

- **Klik / dotyk**: karta → pole (ścieżka podstawowa). Karta w zajętym polu:
  z banku — wypiera (poprzednia wraca do banku); z pola — zamiana miejscami.
- **Drag and drop**: dostępny na desktopie jako równorzędna ścieżka.
- **Klawiatura**: Tab po kartach i polach, Enter/Spacja wybiera i umieszcza,
  **Escape** anuluje wybór; ponowne kliknięcie wybranej karty też anuluje.
- Wybrana karta jest oznaczona ramką, znaczkiem „wybrana" i `aria-pressed`.

## Plansze i pola

Jeden zestaw sześciu pól DOM; media query (próg **901 px**) przestawia
wyłącznie współrzędne:

- **desktop** `plansza-droga-butelki-3d.webp` — 3×2 wężowo
  (1 TL, 2 TM, 3 TR, 4 BR, 5 BM, 6 BL);
- **mobile/tablet** `plansza-pion-droga-butelki-3d.webp` (2:3) — 2×3 wężowo
  (1 TL, 2 TR, 3 MR, 4 ML, 5 BL, 6 BR).

`<picture>` z `source media` pobiera **tylko jedną** planszę właściwą dla
viewportu. Numery pól, focus, stany i podpisy są w HTML/CSS — nic nie jest
wypalone w obrazach. Brak obrazka karty lub planszy nie blokuje układanki
(tekstowe zamienniki).

## Kontrakt integracyjny

Po poprawnym ułożeniu wszystkich sześciu kart, **dokładnie raz**:

```js
window.dispatchEvent(new CustomEvent("k07:completed", {
  bubbles: true,
  detail: { completedSteps: 6, totalSteps: 6 },
}));
```

K07 nie przyznaje litery (kanon: litery przyznają K04/K06/K08/K15/K16).

## Assety

Mastery: `site/assets/images/lekcja45/07-droga-butelki/source-webp/` —
**nietykane**. Prototyp używa lżejszych kopii WebP (wygenerowanych
wyłącznie z masterów WebP) w katalogu nadrzędnym: karty 640 px q88
(17–27 KB), plansza desktop 2200 px q86 (102 KB), pion 1100 px q86 (76 KB).
Cały pierwszy widok ≈ **300 KB** zamiast ~9 MB.

## Testowanie (tryb deweloperski)

Flaga `?dev=1` udostępnia niewidoczny w UI hak:

```js
K07_DEV.place(stepId, slotNo);  // umieść/zamień kartę
K07_DEV.select(stepId);        // wybierz kartę
K07_DEV.check();               // uruchom sprawdzanie (jak klik lupy)
K07_DEV.sfxLog();              // kolejność odtworzonych dźwięków
K07_DEV.state();               // sloty, blokady, faza, lupa, konsola, dialog
```

Automat faz: `arranging → readyToCheck → checking →
(needsCorrection → …) → completed`. W fazie `checking` karty i lupa są
zablokowane, a ozdobne timery mają token przebiegu (szybkie kliki nie
tworzą równoległych sprawdzeń, dźwięków ani dialogów).

## Struktura

```
k07-droga-butelki/
├── index.html   nagłówek, plansza (<picture>), pola, bank, sterowanie
├── k07.css      współrzędne pól/trasy dla obu plansz, stany, a11y
├── k07.js       automat stanów, DnD, klawiatura, kontrakt k07:completed
└── README.md
```
