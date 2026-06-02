(function () {
  const STORY_ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  const NF_NUMBER = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
  const NF_DECIMAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const NF_CURRENCY = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const STORY_DATA_URL = 'data/heerlen_buurten.geojson';

  const STORY_DATA_FALLBACK = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { buurt: 'Centrum', buurtnaam: 'Heerlen Centrum', aantal_inwoners: 1250, huishoudens: 580, werkloosheid_pct: 4.2, inkomen_mediaan: 32500 },
        geometry: { type: 'Polygon', coordinates: [[[5.965, 50.885], [5.975, 50.885], [5.975, 50.895], [5.965, 50.895], [5.965, 50.885]]] }
      },
      {
        type: 'Feature',
        properties: { buurt: 'Noord', buurtnaam: 'Heerlen Noord', aantal_inwoners: 2100, huishoudens: 920, werkloosheid_pct: 5.8, inkomen_mediaan: 28900 },
        geometry: { type: 'Polygon', coordinates: [[[5.95, 50.895], [5.985, 50.895], [5.985, 50.91], [5.95, 50.91], [5.95, 50.895]]] }
      },
      {
        type: 'Feature',
        properties: { buurt: 'Oost', buurtnaam: 'Heerlen Oost', aantal_inwoners: 1850, huishoudens: 780, werkloosheid_pct: 3.9, inkomen_mediaan: 35200 },
        geometry: { type: 'Polygon', coordinates: [[[5.975, 50.875], [6.005, 50.875], [6.005, 50.895], [5.975, 50.895], [5.975, 50.875]]] }
      },
      {
        type: 'Feature',
        properties: { buurt: 'West', buurtnaam: 'Heerlen West', aantal_inwoners: 1680, huishoudens: 710, werkloosheid_pct: 6.1, inkomen_mediaan: 27500 },
        geometry: { type: 'Polygon', coordinates: [[[5.945, 50.87], [5.965, 50.87], [5.965, 50.885], [5.945, 50.885], [5.945, 50.87]]] }
      },
      {
        type: 'Feature',
        properties: { buurt: 'Zuid', buurtnaam: 'Heerlen Zuid', aantal_inwoners: 2340, huishoudens: 1050, werkloosheid_pct: 7.3, inkomen_mediaan: 26800 },
        geometry: { type: 'Polygon', coordinates: [[[5.962, 50.86], [5.982, 50.86], [5.982, 50.878], [5.962, 50.878], [5.962, 50.86]]] }
      }
    ]
  };

  let storyDataCache = null;
  let storyDataPromise = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeXml(value) {
    return escapeHtml(value).replace(/\n/g, ' ');
  }

  function createBackdrop(title, subtitle, colors) {
    const first = colors?.[0] || '#0b7285';
    const second = colors?.[1] || '#ffb703';
    const third = colors?.[2] || '#061826';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="${escapeXml(title)}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${first}"/>
            <stop offset="52%" stop-color="${second}"/>
            <stop offset="100%" stop-color="${third}"/>
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="35%" r="68%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
            <stop offset="50%" stop-color="#ffffff" stop-opacity="0.08"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#bg)"/>
        <rect width="1600" height="900" fill="url(#glow)"/>
        <g fill="none" stroke="#ffffff" stroke-opacity="0.18">
          <circle cx="260" cy="220" r="180" stroke-width="2"/>
          <circle cx="1260" cy="170" r="260" stroke-width="2"/>
          <circle cx="1190" cy="740" r="220" stroke-width="2"/>
          <path d="M70 690 C250 560, 410 620, 560 510 S860 420, 1020 520 S1330 650, 1540 470" stroke-width="10" stroke-linecap="round"/>
        </g>
        <g fill="#ffffff" fill-opacity="0.92" font-family="Segoe UI, Arial, sans-serif">
          <text x="96" y="170" font-size="34" letter-spacing="6" font-weight="800">HEERLEN STORIES</text>
          <text x="96" y="300" font-size="88" font-weight="800">${escapeXml(title)}</text>
          <text x="96" y="375" font-size="28" font-weight="400" fill-opacity="0.82">${escapeXml(subtitle || '')}</text>
        </g>
      </svg>`;

    return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
  }

  function formatValue(value, stat = {}) {
    if (value === null || value === undefined || value === '') return '—';
    const numeric = Number(value);

    if (stat.format === 'currency') {
      return Number.isFinite(numeric) ? NF_CURRENCY.format(numeric) : String(value);
    }

    if (stat.format === 'integer') {
      return Number.isFinite(numeric) ? NF_NUMBER.format(numeric) : String(value);
    }

    if (stat.format === 'decimal') {
      return Number.isFinite(numeric) ? NF_DECIMAL.format(numeric) : String(value);
    }

    if (stat.suffix === '%') {
      return Number.isFinite(numeric) ? `${NF_DECIMAL.format(numeric)}%` : String(value);
    }

    if (Number.isFinite(numeric)) {
      return NF_DECIMAL.format(numeric);
    }

    return String(value);
  }

  function getFeatureCollection() {
    return window.multiLoaderState?.originalData || window.appData?.lastFC || storyDataCache || null;
  }

  function setStoryDataCache(fc) {
    storyDataCache = fc || null;
    return storyDataCache;
  }

  async function ensureStoryDataCollection() {
    const current = getFeatureCollection();
    if (current && Array.isArray(current.features) && current.features.length > 0) {
      return current;
    }

    if (storyDataCache) {
      return storyDataCache;
    }

    if (storyDataPromise) {
      return storyDataPromise;
    }

    storyDataPromise = fetch(STORY_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Kon story-data niet laden (${response.status})`);
        }
        return response.json();
      })
      .then((fc) => setStoryDataCache(fc))
      .catch(() => setStoryDataCache(STORY_DATA_FALLBACK))
      .finally(() => {
        storyDataPromise = null;
        dispatchStoryEvent('story:data-ready', { ready: true });
      });

    return storyDataPromise;
  }

  function getMap() {
    return window.appData?.map || window.map || null;
  }

  function getStoryLayerCandidates() {
    return [window.appData?.choroplethLayer, window.appData?.baseGeoLayer].filter(Boolean);
  }

  function normalizeAnchors(anchor) {
    return STORY_ANCHORS.includes(anchor) ? anchor : 'middle-right';
  }

  function findLeafletLayer(predicate) {
    for (const collection of getStoryLayerCandidates()) {
      if (!collection || typeof collection.eachLayer !== 'function') continue;
      let match = null;
      collection.eachLayer((layer) => {
        if (match || !layer?.feature) return;
        if (predicate(layer.feature, layer)) match = layer;
      });
      if (match) return match;
    }
    return null;
  }

  function featureMatches(feature, focus) {
    if (!feature?.properties || !focus) return false;

    const target = focus.value ?? focus.name ?? focus.label;
    if (target === undefined || target === null || target === '') return false;

    const fields = Array.isArray(focus.fields)
      ? focus.fields
      : [focus.field || 'buurtnaam', 'wijknaam', 'naam', 'name'];

    return fields.some((field) => String(feature.properties[field]) === String(target));
  }

  function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function findFeatureInCollection(fc, focus) {
    if (!fc || !Array.isArray(fc.features) || !focus) return null;
    const fields = Array.isArray(focus.fields)
      ? focus.fields
      : [focus.field || 'buurtnaam', 'wijknaam', 'buurt', 'naam', 'name'];
    const target = normalizeText(focus.value ?? focus.name ?? focus.label);
    if (!target) return null;

    return fc.features.find((feature) => fields.some((field) => normalizeText(feature?.properties?.[field]) === target)) || null;
  }

  function chooseAvailableField(fc, candidates) {
    if (!fc || !Array.isArray(fc.features) || !candidates || !candidates.length) return null;
    for (const c of candidates) {
      if (!c) continue;
      for (const f of fc.features) {
        const v = f?.properties?.[c];
        if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) return c;
      }
    }
    return null;
  }

  function getPropWithFallback(props, candidates) {
    if (!props) return undefined;
    for (const c of candidates) {
      if (c === undefined || c === null) continue;
      const v = props[c];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  function clearHighlights(state) {
    for (const layer of state.highlightedLayers) {
      if (!layer) continue;
      try {
        if (layer.__storyOriginalStyle && typeof layer.setStyle === 'function') {
          layer.setStyle(layer.__storyOriginalStyle);
        }
        if (layer.__storyOpenedPopup && typeof layer.closePopup === 'function') {
          layer.closePopup();
        }
      } catch (e) {
        void e;
      }
      layer.__storyOpenedPopup = false;
    }
    state.highlightedLayers = [];
  }

  function buildStatEntries(slide, feature, fc) {
    if (!Array.isArray(slide.stats)) return [];

    const sourceFeature = feature || (slide.focus ? findFeatureInCollection(fc, slide.focus) : null);

    return slide.stats.map((stat) => {
      const source = stat.source === 'collection' ? fc : feature;
      const safeSource = source || sourceFeature;
      let rawValue;
      if (stat.value !== undefined) {
        rawValue = stat.value;
      } else if (stat.field && safeSource && safeSource.properties && safeSource.properties[stat.field] !== undefined) {
        rawValue = safeSource.properties[stat.field];
      } else if (safeSource && safeSource.properties) {
        // try common fallbacks when configured field is missing or empty
        rawValue = getPropWithFallback(safeSource.properties, [stat.field, 'werkloosheid_pct', 'inkomen_mediaan', 'aantal_inwoners', 'huishoudens', 'buurtnaam']);
      } else {
        rawValue = undefined;
      }
      const formatted = formatValue(rawValue, stat);

      return {
        label: stat.label || stat.field || 'Statistiek',
        value: formatted,
        note: stat.note || '',
      };
    });
  }

  function buildStatHtml(entries) {
    if (!entries.length) return '';

    return `
      <div class="story-stats">
        ${entries.map((entry) => `
          <article class="story-stat">
            <span class="story-stat-label">${escapeHtml(entry.label)}</span>
            <span class="story-stat-value">${escapeHtml(entry.value)}</span>
            ${entry.note ? `<span class="story-stat-note">${escapeHtml(entry.note)}</span>` : ''}
          </article>
        `).join('')}
      </div>
    `;
  }

  function ensureOverlay(state) {
    if (state.overlay) return state.overlay;

    const overlay = document.createElement('div');
    overlay.className = 'story-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="story-backdrop"></div>
      <div class="story-scrim"></div>
      <div class="story-shell">
        <div class="story-topbar">
          <div class="story-chip"></div>
          <div class="story-counter"></div>
          <div class="story-actions">
            <button type="button" class="story-prev">Vorige</button>
            <button type="button" class="story-next">Volgende</button>
            <button type="button" class="story-close">Sluit</button>
          </div>
        </div>
        <div class="story-grid">
          <article class="story-card" data-anchor="middle-right">
            <p class="story-kicker"></p>
            <h2 class="story-title"></h2>
            <p class="story-copy"></p>
            <div class="story-stats"></div>
            <div class="story-map-note" hidden></div>
          </article>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.backdrop = overlay.querySelector('.story-backdrop');
    state.chip = overlay.querySelector('.story-chip');
    state.counter = overlay.querySelector('.story-counter');
    state.prevButton = overlay.querySelector('.story-prev');
    state.nextButton = overlay.querySelector('.story-next');
    state.closeButton = overlay.querySelector('.story-close');
    state.card = overlay.querySelector('.story-card');
    state.kicker = overlay.querySelector('.story-kicker');
    state.title = overlay.querySelector('.story-title');
    state.copy = overlay.querySelector('.story-copy');
    state.stats = overlay.querySelector('.story-stats');
    state.note = overlay.querySelector('.story-map-note');

    state.prevButton.addEventListener('click', () => window.prevStorySlide());
    state.nextButton.addEventListener('click', () => window.nextStorySlide());
    state.closeButton.addEventListener('click', () => window.closeStory());

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target === state.backdrop || event.target === overlay.querySelector('.story-scrim')) {
        window.closeStory();
      }
    });

    return overlay;
  }

  function ensureMenu(state) {
    if (state.menu) return state.menu;
    state.menu = document.getElementById('stories-menu');
    return state.menu;
  }

  function storyCatalog() {
    return [
      {
        id: 'heerlen-centrum',
        title: 'Centrum in beeld',
        summary: 'Een verhalende route langs centrumdata, met een duidelijke start, kaartfocus en een samenvattende slotslide.',
        colors: ['#0b7285', '#ffb703', '#061826'],
        slides: [
          {
            kind: 'hero',
            overline: 'Story 1',
            title: 'Heerlen Centrum',
            body: 'Deze story begint met een fullscreen beeld. De kaarttekst staat rechts-midden, maar dat kun je per slide altijd in het 3x3-grid verplaatsen zonder extra layout code.',
            anchor: 'middle-right',
            backgroundImage: createBackdrop('Centrum in beeld', 'Werkloosheid, inkomen en inwoners rond het stadscentrum.', ['#0b7285', '#ffb703', '#061826']),
            stats: [
              { label: 'Buurten in set', value: 5, format: 'integer', note: 'Eenvoudig uit te breiden wanneer je meer buurten toevoegt.' },
              { label: 'Startfocus', value: 'Centrum', note: 'Gebruikt als eerste anker in deze story.' }
            ]
          },
          {
            kind: 'map',
            overline: 'Kaart en statistieken',
            title: 'Werkloosheid en inkomen',
            body: 'De kaart kleurt op werkloosheid_pct. We focussen op Heerlen Centrum en tonen meteen de belangrijkste statistieken. Deze slide gebruikt echte feature-data uit de geojson, zodat er altijd zichtbare cijfers komen.',
            anchor: 'bottom-left',
            field: 'werkloosheid_pct',
            palette: 'oranges',
            opacity: 0.78,
            classes: 5,
            center: [50.8889, 5.9794],
            zoom: 14,
            focus: { field: 'buurtnaam', value: 'Heerlen Centrum' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
              { label: 'Huishoudens', field: 'huishoudens', format: 'integer' },
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Mediaan inkomen', field: 'inkomen_mediaan', format: 'currency' }
            ],
            mapNote: 'Deze slide gebruikt bestaande kaartdata. Voeg later een andere variabele toe door alleen het veld in de config te wijzigen.'
          },
          {
            kind: 'summary',
            overline: 'Slot en interpretatie',
            title: 'Wat valt op in het centrum?',
            body: 'Door de kaart, tekst en statistieken van elkaar te scheiden kun je per slide veel langer vertellen zonder het systeem complexer te maken. Je houdt de content in de story-config, terwijl de engine het renderen en de data-fallback regelt.',
            anchor: 'top-right',
            focus: { field: 'buurtnaam', value: 'Heerlen Centrum' },
            stats: [
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Mediaan inkomen', field: 'inkomen_mediaan', format: 'currency' },
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' }
            ],
            mapNote: 'Gebruik deze slotslide als conclusie, citaat of call-out. Een nieuwe story betekent alleen een nieuw object toevoegen.'
          }
        ]
      },
      {
        id: 'heerlen-noord',
        title: 'Noord als contrast',
        summary: 'Een langere vergelijking waarin Noord, Centrum en Zuid dezelfde verhaalstructuur volgen maar andere cijfers laten zien.',
        colors: ['#084c59', '#7ad1c8', '#0b3040'],
        slides: [
          {
            kind: 'hero',
            overline: 'Story 2',
            title: 'Heerlen Noord',
            body: 'Een tweede verhaal kan dezelfde bouwblokken hergebruiken. Alleen de tekst, het kaartveld en de focus veranderen. Daardoor blijft het onderhoud klein, terwijl de verhalen toch lang en inhoudelijk rijk kunnen worden.',
            anchor: 'top-left',
            backgroundImage: createBackdrop('Noord als contrast', 'Zelfde opbouw, andere buurt, andere statistieken.', ['#084c59', '#7ad1c8', '#0b3040']),
            stats: [
              { label: 'Focusgebied', value: 'Heerlen Noord' },
              { label: 'Kaartlaag', value: 'inkomen_mediaan' }
            ]
          },
          {
            kind: 'map',
            overline: 'Vergelijking',
            title: 'Inkomen en inwoners',
            body: 'We focussen op Heerlen Noord en laten de kaart kleuren op inkomen_mediaan. Zo kun je in één slide meteen het contrast zien. De statistieken worden rechtstreeks uit de feature gehaald, zodat de waarden altijd correct meebewegen met de gekozen buurt.',
            anchor: 'middle-left',
            field: 'inkomen_mediaan',
            palette: 'blues',
            opacity: 0.76,
            classes: 5,
            center: [50.902, 5.968],
            zoom: 14,
            focus: { field: 'buurtnaam', value: 'Heerlen Noord' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
              { label: 'Huishoudens', field: 'huishoudens', format: 'integer' },
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Mediaan inkomen', field: 'inkomen_mediaan', format: 'currency' }
            ],
            mapNote: 'De highlights zijn tijdelijk. Het onderliggende kaartobject blijft bruikbaar voor andere stories.'
          },
          {
            kind: 'summary',
            overline: 'Interpretatie',
            title: 'Waarom dit contrast werkt',
            body: 'De kracht van stories zit in herhaling met variatie: één en dezelfde structuur, maar steeds andere buurten, statistieken en boodschap. De engine maakt dat onderhoudbaar; de content bepaalt het verhaal.',
            anchor: 'bottom-right',
            focus: { field: 'buurtnaam', value: 'Heerlen Noord' },
            stats: [
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Inkomen', field: 'inkomen_mediaan', format: 'currency' },
              { label: 'Huishoudens', field: 'huishoudens', format: 'integer' }
            ],
            mapNote: 'Je kunt later een derde slide toevoegen met een citaat, benchmark of trend zonder de engine aan te passen.'
          }
        ]
      },
      {
        id: 'heerlen-oost-west',
        title: 'Oost versus West',
        summary: 'Een langere vergelijking met meerdere stappen en een duidelijke samenvatting aan het einde.',
        colors: ['#7c3f00', '#ffb703', '#0b7285'],
        slides: [
          {
            kind: 'hero',
            overline: 'Story 3',
            title: 'Oost versus West',
            body: 'Ook de intro-slide is gewoon configuratie. Je kiest de achtergrond, de tekstpositie en de toon van het verhaal per object. Dat maakt het veilig om later nog veel meer stories toe te voegen.',
            anchor: 'bottom-center',
            backgroundImage: createBackdrop('Oost versus West', 'Vergelijking zonder extra code, alleen door een nieuwe story toe te voegen.', ['#7c3f00', '#ffb703', '#0b7285']),
            stats: [
              { label: 'Story-stijl', value: 'vergelijking' },
              { label: 'Layout', value: '3x3 grid' }
            ]
          },
          {
            kind: 'map',
            overline: 'Kleine verschillen zichtbaar maken',
            title: 'Werkloosheid in de buurt',
            body: 'Hier laat de story-engine zien dat je ook andere buurten kunt kiezen zonder het systeem aan te passen. De data worden eerst geladen, daarna wordt de juiste feature opgezocht en pas dan worden de statistieken getoond.',
            anchor: 'top-right',
            field: 'werkloosheid_pct',
            palette: 'rdylgn',
            opacity: 0.74,
            classes: 5,
            center: [50.885, 5.985],
            zoom: 14,
            focus: { field: 'buurtnaam', value: 'Heerlen Oost' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
              { label: 'Huishoudens', field: 'huishoudens', format: 'integer' },
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Mediaan inkomen', field: 'inkomen_mediaan', format: 'currency' }
            ],
            mapNote: 'Meer stories toevoegen betekent hier alleen een nieuw object aan de catalogus toevoegen.'
          },
          {
            kind: 'summary',
            overline: 'Eindslide',
            title: 'Samenvatting van de vergelijking',
            body: 'Deze laatste slide is bewust wat langer, zodat je tekst, cijfers en conclusie samen kunt brengen. De layout blijft altijd hetzelfde, de inhoud bepaalt de lengte.',
            anchor: 'middle-center',
            focus: { field: 'buurtnaam', value: 'Heerlen West' },
            stats: [
              { label: 'Werkloosheid', field: 'werkloosheid_pct', suffix: '%' },
              { label: 'Mediaan inkomen', field: 'inkomen_mediaan', format: 'currency' },
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' }
            ],
            mapNote: 'De story-engine is nu robuuster: als de app nog geen data had, laadt de story-laag zelf een lokale buurten-geojson.'
          }
        ]
      }
    ];
  }

  const state = {
    overlay: null,
    backdrop: null,
    chip: null,
    counter: null,
    prevButton: null,
    nextButton: null,
    closeButton: null,
    card: null,
    kicker: null,
    title: null,
    copy: null,
    stats: null,
    note: null,
    menu: null,
    storyId: null,
    slideIndex: 0,
    highlightedLayers: [],
    keyHandler: null,
  };

  function getStoryById(id) {
    return storyCatalog().find((story) => story.id === id) || null;
  }

  function buildStoryMenu() {
    const menu = ensureMenu(state);
    if (!menu) return;

    const current = getFeatureCollection();
    const hasData = !!(current && Array.isArray(current.features) && current.features.length > 0);

    menu.innerHTML = storyCatalog().map((story) => `
      <button type="button" class="story-menu-button" data-story-id="${escapeHtml(story.id)}">
        <span class="story-menu-title">${escapeHtml(story.title)}</span>
        <span class="story-menu-meta">${escapeHtml(story.summary)} · ${story.slides.length} slides${hasData ? '' : ' · werkt zodra data geladen is'}</span>
      </button>
    `).join('');

    menu.querySelectorAll('[data-story-id]').forEach((button) => {
      button.addEventListener('click', () => startStory(button.getAttribute('data-story-id')));
    });
  }

  function updateMenuActiveState() {
    if (!state.menu) return;
    state.menu.querySelectorAll('.story-menu-button').forEach((button) => {
      const active = button.getAttribute('data-story-id') === state.storyId;
      button.classList.toggle('is-active', active);
    });
  }

  function applyStoryScene(slide, fc) {
    const map = getMap();

    clearHighlights(state);

    if (slide.kind === 'map' && fc && typeof window.toonChoropleth === 'function') {
      const preferred = Array.isArray(slide.field) ? slide.field : (slide.field ? [slide.field] : []);
      const fallbackOrder = ['werkloosheid_pct', 'inkomen_mediaan', 'aantal_inwoners', 'huishoudens'];
      const fieldToUse = chooseAvailableField(fc, preferred.concat(fallbackOrder));
      if (fieldToUse) {
        window.toonChoropleth(fc, fieldToUse, {
          method: slide.method || 'quantile',
          palette: slide.palette || 'rdylgn',
          opacity: typeof slide.opacity === 'number' ? slide.opacity : 0.74,
          classes: slide.classes || 5,
        });
      }
    }

    if (map && Array.isArray(slide.center) && slide.center.length === 2 && typeof map.setView === 'function') {
      try {
        map.setView(slide.center, slide.zoom || 13, { animate: true });
      } catch (e) {
        void e;
      }
    }

    if (map && Array.isArray(slide.bounds) && typeof map.fitBounds === 'function') {
      try {
        map.fitBounds(slide.bounds, { padding: [28, 28], animate: true });
      } catch (e) {
        void e;
      }
    }

    if (slide.focus) {
      const layer = findLeafletLayer((feature, leafletLayer) => featureMatches(feature, slide.focus));
      if (layer) {
        if (typeof layer.setStyle === 'function') {
          if (!layer.__storyOriginalStyle) {
            layer.__storyOriginalStyle = Object.assign({}, layer.options || {});
          }
          layer.setStyle(Object.assign({ color: '#061826', weight: 3, fillOpacity: 0.85 }, slide.highlightStyle || {}));
        }

        if (typeof layer.bringToFront === 'function') {
          layer.bringToFront();
        }

        if (typeof layer.openPopup === 'function') {
          try {
            layer.openPopup();
            layer.__storyOpenedPopup = true;
          } catch (e) {
            void e;
          }
        }

        state.highlightedLayers.push(layer);

        if (map && typeof layer.getBounds === 'function' && !(Array.isArray(slide.center) && slide.center.length === 2)) {
          try {
            map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: slide.zoom || 15, animate: true });
          } catch (e) {
            void e;
          }
        }
      }
    }

    return fc;
  }

  function resolveSlideFeature(slide, fc) {
    if (!slide) return null;
    if (slide.feature) return slide.feature;
    return slide.focus ? findFeatureInCollection(fc, slide.focus) : null;
  }

  /*
   * Collect story-related variable names and ensure the sidebar field selectors
   * contain those variables (so story fields become selectable in the variable UI).
   */
  function ensureStoryVariables(fc, story) {
    try {
      const numericKeys = new Set();
      if (fc && Array.isArray(fc.features)) {
        for (let i = 0; i < Math.min(30, fc.features.length); i++) {
          const props = fc.features[i]?.properties || {};
          Object.keys(props).forEach((k) => {
            const v = props[k];
            if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) numericKeys.add(k);
          });
        }
      }

      // Include fields explicitly referenced by the story slides
      if (story && Array.isArray(story.slides)) {
        story.slides.forEach((s) => {
          if (s.field) {
            if (Array.isArray(s.field)) s.field.forEach(f => f && numericKeys.add(f));
            else numericKeys.add(s.field);
          }
          if (Array.isArray(s.stats)) {
            s.stats.forEach((st) => { if (st.field) numericKeys.add(st.field); });
          }
        });
      }

      const fields = Array.from(numericKeys).sort();
      if (fields.length && typeof window.initFieldSelectors === 'function') {
        // merge with existing availableFields if present
        const merged = Array.isArray(window.availableFields) && window.availableFields.length
          ? Array.from(new Set((window.availableFields || []).concat(fields)))
          : fields;
        window.initFieldSelectors(merged);
      }
    } catch (e) {
      console.warn('ensureStoryVariables failed', e);
    }
  }

  /** Attach hover handlers to underlying map layers so hovering updates story stats live. */
  function attachHoverHandlers(fc) {
    const candidates = getStoryLayerCandidates();
    candidates.forEach((collection) => {
      if (!collection || typeof collection.eachLayer !== 'function') return;
      collection.eachLayer((layer) => {
        if (!layer || !layer.feature) return;
        if (layer.__storyHoverAttached) return;

        const onOver = () => {
          try {
            const story = getStoryById(state.storyId);
            const slide = story?.slides?.[state.slideIndex];
            if (!slide) return;
            // build stats for hovered feature
            const entries = buildStatEntries(slide, layer.feature, fc);
            if (entries && entries.length) {
              state.stats.innerHTML = buildStatHtml(entries);
            }
            // subtle highlight
            try {
              if (!layer.__storyOriginalStyle && typeof layer.options !== 'undefined') {
                layer.__storyOriginalStyle = Object.assign({}, layer.options || {});
              }
              if (typeof layer.setStyle === 'function') layer.setStyle(Object.assign({}, layer.__storyOriginalStyle, { weight: 3, color: '#061826', fillOpacity: 0.9 }));
            } catch (e) { void e; }
          } catch (e) { void e; }
        };

        const onOut = () => {
          try {
            // restore style
            if (layer.__storyOriginalStyle && typeof layer.setStyle === 'function') {
              layer.setStyle(layer.__storyOriginalStyle);
            }
          } catch (e) { void e; }
          // restore slide content
          try { renderSlide(); } catch (e) { void e; }
        };

        // Attach and record references so we can detach later
        if (typeof layer.on === 'function') {
          layer.on('mouseover', onOver);
          layer.on('mouseout', onOut);
          layer.__storyHoverAttached = true;
          layer.__storyHoverHandlers = { onOver, onOut };
        }
      });
    });
  }

  function detachHoverHandlers() {
    const candidates = getStoryLayerCandidates();
    candidates.forEach((collection) => {
      if (!collection || typeof collection.eachLayer !== 'function') return;
      collection.eachLayer((layer) => {
        if (!layer || !layer.__storyHoverAttached) return;
        try {
          const h = layer.__storyHoverHandlers || {};
          if (typeof layer.off === 'function') {
            if (h.onOver) layer.off('mouseover', h.onOver);
            if (h.onOut) layer.off('mouseout', h.onOut);
          }
        } catch (e) { void e; }
        layer.__storyHoverAttached = false;
        layer.__storyHoverHandlers = null;
      });
    });
  }

  async function renderSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;

    const slide = story.slides[state.slideIndex];
    if (!slide) return;

    ensureOverlay(state);

    const fc = await ensureStoryDataCollection();

    const background = slide.kind === 'hero'
      ? (slide.backgroundImage || createBackdrop(slide.title || story.title, slide.body || story.summary, story.colors))
      : 'none';

    state.overlay.dataset.kind = slide.kind;
    state.overlay.hidden = false;
    state.backdrop.style.backgroundImage = background;
    state.backdrop.style.opacity = slide.kind === 'hero' ? '1' : '0.14';
    state.chip.textContent = slide.overline || story.title;
    state.counter.textContent = `${state.slideIndex + 1} / ${story.slides.length}`;
    state.prevButton.disabled = state.slideIndex === 0;
    state.nextButton.textContent = state.slideIndex === story.slides.length - 1 ? 'Sluit verhaal' : 'Volgende';
    state.card.dataset.anchor = normalizeAnchors(slide.anchor || story.anchor || (slide.kind === 'hero' ? 'middle-right' : 'bottom-left'));
    state.card.classList.toggle('is-hero', slide.kind === 'hero');
    state.card.classList.toggle('is-map', slide.kind !== 'hero');
    state.kicker.textContent = slide.overline || story.title;
    state.title.textContent = slide.title || story.title;
    state.copy.textContent = slide.body || story.summary || '';

    applyStoryScene(slide, fc);
    const feature = resolveSlideFeature(slide, fc) || state.highlightedLayers[0]?.feature || null;
    const stats = buildStatEntries(slide, feature, fc);
    state.stats.innerHTML = buildStatHtml(stats);

    if (slide.mapNote) {
      state.note.hidden = false;
      state.note.textContent = slide.mapNote;
    } else {
      state.note.hidden = true;
      state.note.textContent = '';
    }

    updateMenuActiveState();
    dispatchStoryEvent('story:slide', { storyId: story.id, slideIndex: state.slideIndex, slideKind: slide.kind });
  }

  function dispatchStoryEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      void e;
    }
  }

  async function openStory(id) {
    const story = getStoryById(id) || storyCatalog()[0];
    if (!story) return;

    ensureOverlay(state);
    state.storyId = story.id;
    state.slideIndex = 0;
    document.body.classList.add('story-open');
    state.overlay.hidden = false;

    // ensure data + variable selectors and attach hover handlers
    try {
      const fc = await ensureStoryDataCollection();
      ensureStoryVariables(fc, story);
      attachHoverHandlers(fc);
    } catch (e) {
      void e;
    }

    if (!state.keyHandler) {
      state.keyHandler = (event) => {
        if (!state.overlay || state.overlay.hidden) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          window.closeStory();
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          window.nextStorySlide();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          window.prevStorySlide();
        }
      };
      document.addEventListener('keydown', state.keyHandler);
    }

    dispatchStoryEvent('story:start', { storyId: story.id });
    await renderSlide();
  }

  function closeStory() {
    if (!state.overlay) return;

    // detach hover handlers before removing highlights
    try { detachHoverHandlers(); } catch (e) { void e; }

    clearHighlights(state);
    state.overlay.hidden = true;
    document.body.classList.remove('story-open');
    dispatchStoryEvent('story:close', { storyId: state.storyId });
    state.storyId = null;
    state.slideIndex = 0;
    updateMenuActiveState();
  }

  function nextSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;

    if (state.slideIndex >= story.slides.length - 1) {
      closeStory();
      return;
    }

    state.slideIndex += 1;
    renderSlide();
  }

  function prevSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;

    if (state.slideIndex <= 0) return;
    state.slideIndex -= 1;
    renderSlide();
  }

  window.storyCatalog = storyCatalog();
  window.startStory = openStory;
  window.closeStory = closeStory;
  window.nextStorySlide = nextSlide;
  window.prevStorySlide = prevSlide;
  window.renderStoriesMenu = buildStoryMenu;

  document.addEventListener('DOMContentLoaded', () => {
    ensureOverlay(state);
    buildStoryMenu();
    ensureStoryDataCollection().then(() => buildStoryMenu());
  });

  window.addEventListener('story:data-ready', buildStoryMenu);
})();