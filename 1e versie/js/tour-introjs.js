// ============================================================
// CONFIGURATIE — pas hier de rondleiding aan
// ============================================================

// Stap-definities voor de rondleiding.
// Beschikbare velden per stap:
//   id        – unieke naam (wordt ook als CSS-selector gebruikt als er geen selector is)
//   selector  – optionele CSS-selector voor het element dat gehighlight wordt
//   title     – titel in het tooltip
//   content   – tekst in het tooltip
//   center    – [lat, lng] om de kaart te centreren op deze stap
//   zoom      – zoomniveau bij bovenstaande center
//   fitBounds – [[z,w],[n,o]] om de kaart op een gebied te zoomen
window.tourSteps = window.tourSteps || [
  {
    id:      'welcome',
    title:   'Welkom',
    content: 'Welkom. Deze korte rondleiding laat rustig de belangrijkste bedieningselementen zien.'
  },
  {
    id:      'sidebar',
    title:   'Zijbalk',
    content: 'Hier staan legenda, variabele keuze en filters.'
  },
  {
    id:       'year-filter-area',
    selector: '#year-filter-area',
    title:    'Filter op jaar',
    content:  'Met deze schuifregelaar kun je het jaar filteren.'
  },
  {
    id:      'controls',
    title:   'Variabelen',
    content: 'Voeg hier extra variabelen toe en pas kleuren/opacity aan.'
  },
  {
    id:      'map',
    title:   'Kaart',
    content: 'De kaart toont de gebieden. Hover over een gebied voor een mini-grafiek.',
    center:  [50.8889, 5.9794],
    zoom:    12
  },
  {
    id:      'end',
    title:   'Klaar',
    content: 'Dat is alles — je kunt de rondleiding altijd opnieuw starten.'
  }
];

// CSS voor de navigatie-bolletjes (bullets) in de rondleiding
// De actieve stap krijgt een geel kleurverloop; inactieve stappen zijn lichtgrijs
const BULLET_CSS = `
  .introjs-bullets ul li a,
  .introjs-bullets ul li {
    display: block !important; width: 14px !important; height: 14px !important;
    border-radius: 50% !important; background: #f1f6f8 !important;
    border: 1px solid rgba(8,24,48,0.06) !important;
    box-shadow: 0 4px 10px rgba(8,24,48,0.06) !important;
  }
  .introjs-bullets ul li a.active,
  .introjs-bullets ul li.introjs-active a,
  .introjs-bullets ul li.introjs-active {
    background-image: linear-gradient(90deg,#ffd166,#ffb703) !important;
    background-color: transparent !important;
    box-shadow: 0 12px 28px rgba(255,167,29,0.18) !important;
    transform: scale(1.35) !important;
    border-color: transparent !important;
  }
  .introjs-bullets ul li a:hover,
  .introjs-bullets ul li a:focus {
    transform: translateY(-3px) scale(1.05) !important;
    box-shadow: 0 8px 20px rgba(8,24,48,0.08) !important;
  }
`;

// ============================================================
// RONDLEIDING LOGICA
// ============================================================

(function () {

  // Bouwt de stappen-array op die intro.js verwacht, op basis van tourSteps
  function buildSteps() {
    return (window.tourSteps || []).map(s => {
      const selector = s.selector || ('#' + s.id);
      const el       = document.querySelector(selector);
      const stap     = { intro: s.content || '', title: s.title || '' };

      if (el)                stap.element           = selector;
      if (s.position)        stap.position          = s.position;
      if (s.disableInteraction) stap.disableInteraction = true;

      // Eigen velden voor kaartbediening (niet native intro.js)
      if (s.center)     stap.__center    = s.center;
      if (s.zoom)       stap.__zoom      = s.zoom;
      if (s.fitBounds)  stap.__fitBounds = s.fitBounds;

      return stap;
    });
  }

  // Stuur een event naar de browser én optioneel naar analytics
  function dispatchTourEvent(naam, detail) {
    try { window.dispatchEvent(new CustomEvent(naam, { detail })); } catch (e) {}
    try { window.dataLayer?.push(Object.assign({ event: naam }, detail || {})); } catch (e) {}
    try { window.ga?.('send', 'event', 'tour', naam, JSON.stringify(detail || {})); } catch (e) {}
    console.log('tour.event', naam, detail || {});
  }

  // Haal de actieve Leaflet-kaart op
  function getMap() {
    return window.appData?.map || window.map || null;
  }

  // Pas de kaartpositie aan op basis van de stap-definitie
  function pasKaartAan(stapDef) {
    const map = getMap();
    if (!map || !stapDef) return;
    try {
      if (Array.isArray(stapDef.__center) && stapDef.__center.length === 2) {
        const zoom = typeof stapDef.__zoom === 'number'
          ? stapDef.__zoom
          : (window.APP_CONFIG?.standaardZoom || 12);
        map.setView(stapDef.__center, zoom, { animate: true });
      }
      if (Array.isArray(stapDef.__fitBounds) && stapDef.__fitBounds.length) {
        map.fitBounds(stapDef.__fitBounds, { animate: true, padding: [20, 20] });
      }
    } catch (e) { /* kaartfouten negeren */ }
  }

  // Verwijder alle tour-highlight klassen van de pagina
  function clearHighlights() {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  }

  // Pas inline stijlen toe op de bullet-punten.
  // Dit is nodig omdat intro.js de DOM herschrijft en CSS-overrides soms worden overschreven.
  function applyBulletInlineStyles() {
    document.querySelectorAll('.introjs-bullets ul li').forEach((li, i) => {
      const node = li.querySelector('a') || li;
      node.style.width        = '14px';
      node.style.height       = '14px';
      node.style.borderRadius = '50%';

      const isActief = li.classList.contains('introjs-active') || node.classList.contains('active');
      if (isActief) {
        node.style.backgroundImage = 'linear-gradient(90deg,#ffd166,#ffb703)';
        node.style.backgroundColor = 'transparent';
        node.style.boxShadow       = '0 12px 28px rgba(255,167,29,0.18)';
        node.style.transform       = 'scale(1.35)';
        node.style.borderColor     = 'transparent';
      } else {
        // Reset naar CSS-standaard
        ['backgroundImage', 'backgroundColor', 'boxShadow', 'transform', 'borderColor']
          .forEach(p => node.style[p] = '');
      }
    });
  }

  // ============================================================
  // RONDLEIDING STARTEN
  // ============================================================

  window.startIntroTour = function () {
    if (typeof introJs !== 'function') return;

    const stappen = buildSteps();
    const intro   = introJs();

    intro.setOptions({
      steps:               stappen,
      showProgress:        true,
      showBullets:         true,
      exitOnOverlayClick:  false,
      exitOnEsc:           true,
      disableInteraction:  false,
      scrollToElement:     true,
      nextLabel: 'Volgende',
      prevLabel: 'Vorige',
      doneLabel: 'Klaar'
    });

    // Helper: huidige stap-definitie ophalen
    const getHuidigeStap = () => {
      const idx = typeof intro._currentStep === 'number' ? intro._currentStep : null;
      return idx !== null ? stappen[idx] : null;
    };

    intro.onstart(() => dispatchTourEvent('tour:start', {}));

    intro.onbeforechange(() => {
      const stapDef = getHuidigeStap();
      pasKaartAan(stapDef);
      dispatchTourEvent('tour:step:beforechange', { index: intro._currentStep, step: stapDef });
    });

    intro.onchange(() => {
      clearHighlights();
      const stapDef = getHuidigeStap();

      // Highlight het actieve element
      if (stapDef?.element) {
        document.querySelector(stapDef.element)?.classList.add('tour-highlight');
      }

      // Bullet-stijlen inline bijwerken (intro.js kan CSS overschrijven)
      applyBulletInlineStyles();

      dispatchTourEvent('tour:step:changed', { index: intro._currentStep, step: stapDef });
    });

    // Opruimen bij afsluiten of voltooien
    const opruimen = (eventNaam) => () => {
      clearHighlights();
      dispatchTourEvent(eventNaam, {});
    };
    intro.onexit(opruimen('tour:exit'));
    intro.oncomplete(opruimen('tour:complete'));

    intro.start();
  };

  // Achterwaartse compatibiliteit
  window.startTour = window.startIntroTour;

  // ============================================================
  // INITIALISATIE NA LADEN DOM
  // ============================================================

  document.addEventListener('DOMContentLoaded', () => {

    // Knop om rondleiding te starten
    document.getElementById('start-tour')?.addEventListener('click', () => {
      window.startIntroTour();
      try { sessionStorage.setItem('tourStarted', '1'); } catch (e) {}
    });

    // Knoppen in het welkomst-modal
    document.getElementById('tour-yes')?.addEventListener('click', () => {
      document.getElementById('tour-modal').hidden = true;
      window.startIntroTour();
      try { sessionStorage.setItem('tourStarted', '1'); } catch (e) {}
    });
    document.getElementById('tour-no')?.addEventListener('click', () => {
      document.getElementById('tour-modal').hidden = true;
      try { sessionStorage.setItem('tourDeclined', '1'); } catch (e) {}
    });

    // Injecteer bullet CSS in de <head>
    try {
      const style = document.createElement('style');
      style.setAttribute('data-generated', 'tour-bullet-overrides');
      style.textContent = BULLET_CSS;
      document.head.appendChild(style);
    } catch (e) {}

    // MutationObserver: hertoepassen van bullet-stijlen als intro.js de DOM herschrijft
    // Dit is nodig omdat intro.js actief klassen en stijlen kan overschrijven
    try {
      const observer = new MutationObserver(applyBulletInlineStyles);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(applyBulletInlineStyles, 200); // Eenmalige run voor het geval de tour al actief is
    } catch (e) {}
  });

})();