/* ═══════════════════════════════════════════════════════════════════
   TABLICA ŚLEDZTWA — BOOTSTRAP

   Tablica jest wariantem DOMYŚLNYM: wystarczy otworzyć adres lekcji.
   Stara zielona lekcja żyje pod jawnym parametrem technicznym `?legacy=1`
   (albo `#legacy`, bo fragment przeżywa przekierowanie 301, które serwer
   `serve` robi z adresu z rozszerzeniem — query string wtedy przepada).
   `?boardPreview=1` zostaje zgodnym aliasem: niczego nie zmienia, ale nie
   psuje starszych linków w dokumentacji i w zakładkach.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const q = new URLSearchParams(location.search);
  const hash = (location.hash || "").toLowerCase();
  const legacy = q.get("legacy") === "1" || hash === "#legacy";

  /* zdejmuje blokadę anty-mignięciową ustawioną w <head> */
  const unveil = () => {
    document.documentElement.classList.remove("bd-booting");
    const st = document.getElementById("bd-antiflash");
    if (st) st.remove();
  };

  /* stara lekcja: wyjście bez ładowania arkusza i silnika —
     wariant zielony nie ponosi kosztu ani jednego dodatkowego żądania */
  if (legacy) { unveil(); return; }

  const base = "lekcja-4-5-integracja/";
  const v = "?v=164";

  /* Ten sam znacznik wersji udostępniamy silnikowi. Klatki sekwencji zlewu mają
     stałe nazwy, więc po korekcie kanału alfa przeglądarka podałaby stare pliki
     z pamięci podręcznej — doklejamy do nich TEN SAM parametr, zamiast budować
     osobny mechanizm tylko dla obrazów. */
  (window.LK45I = window.LK45I || {}).assetVersion = v;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "lekcja-4-5-integracja-board.css" + v;
  document.head.appendChild(css);

  /* config → silnik, kolejno (silnik wymaga gotowej konfiguracji) */
  function load(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("nie udało się wczytać " + src));
      document.body.appendChild(s);
    });
  }

  const start = () => load(base + "board-config.js" + v)
    .then(() => load(base + "board-stage.js" + v))
    /* jeśli silnik nie wstanie, uczeń dostaje starą lekcję zamiast pustego ekranu */
    .catch((e) => { console.warn("[tablica]", e.message); unveil(); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
