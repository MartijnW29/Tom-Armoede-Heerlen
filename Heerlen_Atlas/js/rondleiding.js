// ============================================================================
// RONDLEIDING.JS — Heerlen Opportunity Atlas
// Korte rondleiding langs de bediening: een donkere laag met een uitgespaard
// venster rond het onderdeel, en een kaartje met uitleg ernaast.
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE — Stappen van de rondleiding
  // Per stap: id (element met dat id wordt uitgelicht; ontbreekt het of is het
  // onzichtbaar, dan staat de uitleg midden in beeld), titel, tekst en optioneel
  // centrum/zoom voor de kaart.
  // ==========================================================================

  const STAPPEN = [
    { titel: 'Welkom', tekst: 'Deze korte rondleiding laat rustig de belangrijkste bedieningselementen zien.' },
    { id: 'controls', titel: 'Verken de data', tekst: 'De variabele bij het kaart-icoon kleurt de kaart. Met + voeg je variabelen toe die je ziet als je over een buurt beweegt.' },
    { id: 'year-filter-area', titel: 'Tijdlijn', tekst: 'Kies met de twee driehoekjes een periode en druk op afspelen om door de jaren te gaan.' },
    { id: 'legend-widget', titel: 'Kaartweergave en legenda', tekst: 'Met het tandwiel kies je kleuren, dekking en ondergrond. De i toont de legenda.' },
    { id: 'map', titel: 'Kaart', tekst: 'De kaart toont de buurten. Wijs een buurt aan voor de cijfers en een mini-grafiek.', centrum: [50.8889, 5.9794], zoom: 12 },
    { titel: 'Klaar', tekst: 'Dat is alles. Je kunt de rondleiding altijd opnieuw starten via Meer.' },
  ];

  const MARGE = 12;  // ruimte (px) tussen het uitgelichte onderdeel, het venster en het kaartje


  // ==========================================================================
  // OPBOUW
  // ==========================================================================

  const staat = { laag: null, venster: null, kaartje: null, stap: 0 };

  function maakLaag() {
    if (staat.laag) return;
    const laag = maak('div', { className: 'rondleiding', hidden: true });
    laag.innerHTML = `
      <div class="rondleiding-venster"></div>
      <section class="rondleiding-kaartje" role="dialog" aria-modal="true" aria-labelledby="rondleiding-titel">
        <button type="button" class="rondleiding-sluit" aria-label="Rondleiding sluiten">✕</button>
        <h2 id="rondleiding-titel" class="rondleiding-titel"></h2>
        <p class="rondleiding-tekst"></p>
        <div class="rondleiding-voet">
          <ol class="rondleiding-bolletjes" aria-label="Voortgang"></ol>
          <div class="rondleiding-knoppen">
            <button type="button" class="rondleiding-vorige">Vorige</button>
            <button type="button" class="rondleiding-volgende">Volgende</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(laag);

    Object.assign(staat, { laag, venster: laag.querySelector('.rondleiding-venster'), kaartje: laag.querySelector('.rondleiding-kaartje') });
    laag.querySelector('.rondleiding-bolletjes').append(...STAPPEN.map((stap, i) => {
      const bolletje = maak('button', { type: 'button', title: stap.titel });
      bolletje.setAttribute('aria-label', `Stap ${i + 1}: ${stap.titel}`);
      bolletje.addEventListener('click', () => toonStap(i));
      const li = maak('li');
      li.append(bolletje);
      return li;
    }));
    laag.querySelector('.rondleiding-sluit').addEventListener('click', sluit);
    laag.querySelector('.rondleiding-vorige').addEventListener('click', () => toonStap(staat.stap - 1));
    laag.querySelector('.rondleiding-volgende').addEventListener('click', () =>
      staat.stap === STAPPEN.length - 1 ? sluit() : toonStap(staat.stap + 1));
  }


  // ==========================================================================
  // PLAATSEN — Venster om het onderdeel, kaartje ernaast (of in het midden)
  // ==========================================================================

  /** Het zichtbare deel van het onderdeel van deze stap, of null (dan in het midden). */
  function doelRect() {
    const el = document.getElementById(STAPPEN[staat.stap].id);
    const r = el?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : null;
  }

  function plaats() {
    const r = doelRect();
    const { venster, kaartje } = staat;
    staat.laag.classList.toggle('is-midden', !r);
    if (r) {
      Object.assign(venster.style, {
        left: `${r.left - MARGE / 2}px`, top: `${r.top - MARGE / 2}px`,
        width: `${r.width + MARGE}px`, height: `${r.height + MARGE}px`,
      });
    }

    // Kaartje: onder, boven, rechts of links van het onderdeel; past het nergens, dan erin (bijv. bij de kaart)
    const k = kaartje.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const klem = (waarde, max) => Math.min(Math.max(waarde, MARGE), max - MARGE);
    let links = (W - k.width) / 2, boven = (H - k.height) / 2;
    if (r) {
      const opties = [
        [r.bottom + MARGE + k.height <= H, () => [r.left, r.bottom + MARGE]],
        [r.top - MARGE - k.height >= 0, () => [r.left, r.top - MARGE - k.height]],
        [r.right + MARGE + k.width <= W, () => [r.right + MARGE, r.top]],
        [r.left - MARGE - k.width >= 0, () => [r.left - MARGE - k.width, r.top]],
      ];
      [links, boven] = (opties.find(([past]) => past)?.[1] ?? (() => [r.left + (r.width - k.width) / 2, r.top + (r.height - k.height) / 2]))();
    }
    Object.assign(kaartje.style, { left: `${klem(links, W - k.width)}px`, top: `${klem(boven, H - k.height)}px` });
  }


  // ==========================================================================
  // STAPPEN
  // ==========================================================================

  function toonStap(index) {
    if (index < 0 || index >= STAPPEN.length) return;
    staat.stap = index;
    const stap = STAPPEN[index];
    const laatste = index === STAPPEN.length - 1;
    const { laag } = staat;

    if (stap.centrum) window.appData.map.setView(stap.centrum, stap.zoom, { animate: false });
    laag.querySelector('.rondleiding-titel').textContent = stap.titel;
    laag.querySelector('.rondleiding-tekst').textContent = stap.tekst;
    laag.querySelectorAll('.rondleiding-bolletjes button').forEach((b, i) => b.toggleAttribute('aria-current', i === index));
    laag.querySelector('.rondleiding-vorige').disabled = index === 0;
    laag.querySelector('.rondleiding-volgende').textContent = laatste ? 'Klaar' : 'Volgende';

    plaats();
    laag.querySelector('.rondleiding-volgende').focus();
  }

  function opToets(e) {
    if (e.key === 'Escape') sluit();
    if (e.key === 'ArrowRight') toonStap(staat.stap + 1);
    if (e.key === 'ArrowLeft') toonStap(staat.stap - 1);
  }

  function start() {
    maakLaag();
    staat.laag.hidden = false;
    document.addEventListener('keydown', opToets);
    addEventListener('resize', plaats);
    toonStap(0);
  }

  function sluit() {
    staat.laag.hidden = true;
    document.removeEventListener('keydown', opToets);
    removeEventListener('resize', plaats);
    document.getElementById('start-tour').focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-tour').addEventListener('click', start);
  });
})();
