// ============================================================================
// TOUR-INTROJS.JS — Heerlen Opportunity Atlas
// Rondleiding langs de bediening, met de intro.js-bibliotheek
// ============================================================================

(function () {

  // ==========================================================================
  // CONFIGURATIE — Stappen van de rondleiding
  // Per stap: id (element met dat id wordt uitgelicht; ontbreekt het, dan staat
  // de uitleg midden in beeld), title, content en optioneel center/zoom voor de kaart.
  // ==========================================================================

  const STAPPEN = [
    { id: 'welcome', title: 'Welkom', content: 'Welkom. Deze korte rondleiding laat rustig de belangrijkste bedieningselementen zien.' },
    { id: 'controls', title: 'Verken de data', content: 'De variabele bij het kaart-icoon kleurt de kaart. Met + voeg je variabelen toe die je ziet als je over een buurt beweegt.' },
    { id: 'year-filter-area', title: 'Tijdlijn', content: 'Kies met de twee driehoekjes een periode en druk op afspelen om door de jaren te gaan.' },
    { id: 'legend-widget', title: 'Kaartweergave en legenda', content: 'Met het tandwiel kies je kleuren, dekking en ondergrond. De i toont de legenda.' },
    { id: 'map', title: 'Kaart', content: 'De kaart toont de gebieden. Wijs een gebied aan voor een mini-grafiek.', center: [50.8889, 5.9794], zoom: 12 },
    { id: 'end', title: 'Klaar', content: 'Dat is alles — je kunt de rondleiding altijd opnieuw starten.' },
  ];


  // ==========================================================================
  // RONDLEIDING
  // ==========================================================================

  const wisUitlichting = () => document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

  function startRondleiding() {
    const tour = introJs().setOptions({
      steps: STAPPEN.map(({ id, title, content }) => ({ title, intro: content, element: document.getElementById(id) || undefined })),
      showProgress: true,
      showBullets: true,
      exitOnOverlayClick: false,
      nextLabel: 'Volgende',
      prevLabel: 'Vorige',
      doneLabel: 'Klaar',
    });

    tour.onbeforechange(() => {
      const { center, zoom } = STAPPEN[tour._currentStep] || {};
      if (center) window.appData.map.setView(center, zoom);
    });
    tour.onchange((el) => {
      wisUitlichting();
      if (el?.id) el.classList.add('tour-highlight');
    });
    tour.onexit(wisUitlichting);
    tour.oncomplete(wisUitlichting);
    tour.start();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-tour').addEventListener('click', startRondleiding);
  });

})();
