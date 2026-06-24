(function () {
  const STORY_ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  const NF_NUMBER = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
  const NF_DECIMAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const NF_CURRENCY = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const NO_DATA_TEXT = 'geen data';

  const STORY_DATA_URL = 'data/heerlen_buurten.geojson';


  let storyDataCache = null;
  let storyDataPromise = null;

  // ====================== DEBUG ======================
  window.debugStoryData = async () => {
    const fc = await ensureStoryDataCollection();
    console.log('%c🔍 Story Data Debug', 'color: #0b7285; font-weight: bold');
    console.log('Features count:', fc?.features?.length || 0);
    if (fc?.features?.[0]) {
      console.log('Available properties:', Object.keys(fc.features[0].properties));
    }
  };

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
    if (value === null || value === undefined || value === '') return NO_DATA_TEXT;
    const numeric = Number(value);

    if (stat.format === 'currency') return Number.isFinite(numeric) ? NF_CURRENCY.format(numeric) : String(value);
    if (stat.format === 'integer') return Number.isFinite(numeric) ? NF_NUMBER.format(numeric) : String(value);
    if (stat.format === 'decimal') return Number.isFinite(numeric) ? NF_DECIMAL.format(numeric) : String(value);
    if (stat.suffix === '%') return Number.isFinite(numeric) ? `${NF_DECIMAL.format(numeric)}%` : String(value);
    if (Number.isFinite(numeric)) return NF_DECIMAL.format(numeric);
    return String(value);
  }

  function getFeatureCollection() {
    return window.multiLoaderState?.originalData || window.appData?.lastFC || storyDataCache || null;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function getActiveFilter() {
    return window.appData?.filter || null;
  }

  function valuePassesFilter(value, allValues, filter) {
    if (!filter) return true;
    const num = toNumber(value);
    if (num === null) return false;

    if (typeof filter.min === 'number' && num < filter.min) return false;
    if (typeof filter.max === 'number' && num > filter.max) return false;

    if (typeof filter.lowPct === 'number' || typeof filter.highPct === 'number') {
      const sorted = (allValues || []).slice().sort((a, b) => a - b);
      if (sorted.length === 0) return true;

      const lowIndex = Math.floor(((filter.lowPct || 0) / 100) * (sorted.length - 1));
      const highIndex = Math.floor(((filter.highPct || 100) / 100) * (sorted.length - 1));
      const lowValue = sorted[Math.max(0, lowIndex)];
      const highValue = sorted[Math.min(sorted.length - 1, highIndex)];

      if (typeof filter.lowPct === 'number' && num < lowValue) return false;
      if (typeof filter.highPct === 'number' && num > highValue) return false;
    }

    return true;
  }

  function getAllNumericValuesForField(fc, field) {
    if (!fc?.features || !field) return [];
    return fc.features
      .map(f => toNumber(f?.properties?.[field]))
      .filter(v => v !== null);
  }

  function setStoryDataCache(fc) {
    storyDataCache = fc || null;
    return storyDataCache;
  }

  function getStoryDataUrl(year) {
    if (!year) {
      const slider = document.getElementById('year-slider');
      year = slider ? parseInt(slider.value, 10) : null;
    }
    return year ? `data/heerlen_buurten_${year}.geojson` : STORY_DATA_URL;
  }

  /**
   * Haal de FeatureCollection op die de story moet gebruiken.
   * - Met jaar: filtert de originele (ongefilterde) dataset op dat jaar.
   * - Zonder jaar: gebruikt bestaande cache of laadt het standaardbestand.
   */
  async function ensureStoryDataCollection(year) {
    const original = window.multiLoaderState?.originalData || null;

    if (original && Array.isArray(original.features) && original.features.length > 0) {
      if (year && typeof window.filterFeaturesByYear === 'function') {
        const filtered = window.filterFeaturesByYear(original, year);
        console.log(`📅 Story data gefilterd op jaar ${year}: ${filtered.features.length} features`);
        return filtered;
      }
      return original;
    }

    if (storyDataCache) return storyDataCache;
    if (storyDataPromise) return storyDataPromise;

    storyDataPromise = fetch(getStoryDataUrl(), { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(fc => {
        console.log(`✅ ${fc.features.length} buurten geladen`);
        return setStoryDataCache(fc);
      })
      .catch(() => setStoryDataCache(null))
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

  function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  // ==================== FEATURE MATCHING ====================
  function findFeatureInCollection(fc, focus) {
    if (!fc?.features || !focus) return null;

    let target = normalizeText(focus.value ?? focus.name ?? focus.label);
    if (!target) return null;

    // Extra tolerantie: verwijder "heerlen " als het erin zit
    target = target.replace(/^heerlen\s+/, '');

    const fields = ['buurtnaam', 'naam', 'buurt', 'wijknaam', 'label'];

    for (const feature of fc.features) {
      if (!feature?.properties) continue;
      for (const field of fields) {
        const value = normalizeText(feature.properties[field]);
        if (!value) continue;

        if (value === target || value.includes(target) || target.includes(value)) {
          console.log(`✅ Feature gevonden: ${feature.properties.buurtnaam || feature.properties.naam}`);
          return feature;
        }
      }
    }

    console.warn(`⚠️ Kon feature niet vinden voor: "${target}"`);
    return null;
  }

  function getPropWithFallback(props, candidates) {
    if (!props) return undefined;
    for (const c of candidates) {
      if (c == null) continue;
      const v = props[c];
      if (v !== undefined && v !== null && v !== '') return v;
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
      } catch (e) {}
      layer.__storyOpenedPopup = false;
    }
    state.highlightedLayers = [];
  }

  // ==================== STAT BUILDER MET BETERE MAPPING ====================
  function buildStatEntries(slide, feature, fc) {
    if (!Array.isArray(slide?.stats)) return [];

    const sourceFeature = feature || (slide.focus ? findFeatureInCollection(fc, slide.focus) : null);
    if (!sourceFeature?.properties) return [];

    const props = sourceFeature.properties;

    const activeFilter = getActiveFilter();

    return slide.stats.map((stat) => {
      let rawValue = stat.value;

      if (rawValue === undefined && stat.field) {
        rawValue = props[stat.field];

        if (rawValue === undefined) {
          const mappings = {
            'aantal_inwoners': ['aantal_inwoners'],
            'huishoudens': ['aantal_huishoudens', 'huishoudens'],
            'werkloosheid': ['werkloosheid_pct', 'aantal_personen_met_een_ww_uitkering_totaal'],
            'inkomen_mediaan': ['inkomen_mediaan', 'gemiddeld_gestandaardiseerd_inkomen_van_huishoudens', 'gemiddeld_inkomen_per_inwoner']
          };
          rawValue = getPropWithFallback(props, mappings[stat.field] || [stat.field]);
        }
      }

      const numericValue = toNumber(rawValue);
      const allValuesForField = stat.field ? getAllNumericValuesForField(fc, stat.field) : [];
      const filteredOut = stat.field && numericValue !== null && !valuePassesFilter(numericValue, allValuesForField, activeFilter);
      const hasNoValue = rawValue === undefined || rawValue === null || rawValue === '';
      const noData = hasNoValue || filteredOut;
      const baseNote = stat.note || '';
      const computedNote = filteredOut
        ? (baseNote ? `${baseNote} · buiten actief filter` : 'Buiten actief filter')
        : baseNote;

      return {
        label: stat.label || stat.field || 'Statistiek',
        value: noData ? NO_DATA_TEXT : formatValue(rawValue, stat),
        note: computedNote,
        isNoData: noData
      };
    });
  }

  function buildStatHtml(entries) {
    if (!entries.length) {
      return `<div class="story-stats"><p style="color:#888;">Geen statistieken beschikbaar</p></div>`;
    }
    return `
      <div class="story-stats">
        ${entries.map(entry => `
          <article class="story-stat${entry.isNoData ? ' is-no-data' : ''}">
            <span class="story-stat-label">${escapeHtml(entry.label)}</span>
            <span class="story-stat-value${entry.isNoData ? ' is-no-data' : ''}">${escapeHtml(entry.value)}</span>
            ${entry.note ? `<span class="story-stat-note">${escapeHtml(entry.note)}</span>` : ''}
          </article>
        `).join('')}
      </div>
    `;
  }

  // ==================== OVERLAY & MENU OPBOUW ====================
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
        <div class="story-progress"><span class="story-progress-bar"></span></div>
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
    state.progressBar = overlay.querySelector('.story-progress-bar');
    state.card = overlay.querySelector('.story-card');
    state.kicker = overlay.querySelector('.story-kicker');
    state.title = overlay.querySelector('.story-title');
    state.copy = overlay.querySelector('.story-copy');
    state.stats = overlay.querySelector('.story-stats');
    state.note = overlay.querySelector('.story-map-note');

    state.prevButton.addEventListener('click', () => window.prevStorySlide());
    state.nextButton.addEventListener('click', () => window.nextStorySlide());
    state.closeButton.addEventListener('click', () => window.closeStory());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === state.backdrop || e.target === overlay.querySelector('.story-scrim')) {
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

  // ==================== STORY CATALOGUS ====================
  function storyCatalog() {
    return [
      // === VERHAAL: ARMOEDE IN HEERLEN ===
      {
        id: 'armoede-heerlen',
        title: 'Armoede in Heerlen',
        summary: 'Een eerlijk en hoopvol verhaal over armoede, veerkracht en de toekomst van onze stad.',
        colors: ['#1a3a5e', '#e63946', '#f4a261'],
        slides: [
          {
            paginatype: 'voorpagina',
            overline: 'Verhaal over onze stad',
            title: 'Armoede in Heerlen',
            body: 'Achter de statistieken gaan mensen schuil. Mensen met dromen, zorgen en veerkracht.',
            anchor: 'middle-right',
            backgroundImage: createBackdrop('Armoede in Heerlen', 'De onzichtbare realiteit achter de cijfers', ['#1a3a5e', '#e63946', '#f4a261'])
          },
          {
            paginatype: 'map',
            year: 2024,
            overline: 'De realiteit',
            title: 'Waar armoede het hardst toeslaat',
            body: 'In sommige buurten van Heerlen leeft meer dan 1 op de 4 huishoudens onder de armoedegrens. Dit is geen cijfer — dit zijn gezinnen, paginatypeeren en ouderen.',
            anchor: 'bottom-left',
            field: 'aantal_huishoudens',
            palette: 'oranges',
            focus: { field: 'buurtnaam', value: 'Heksenberg' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
              { label: 'Huishoudens', field: 'aantal_huishoudens', format: 'integer' },
              { label: 'Werklozen', field: 'werkloosheid', suffix: '' },
              { label: 'Gemiddeld inkomen', field: 'inkomen_mediaan', format: 'currency' }
            ],
            mapNote: 'Donkere kleuren = hogere concentratie van armoede-indicatoren'
          },
          {
            paginatype: 'map',
            year: 2024,
            overline: 'paginatypeeren in armoede',
            title: 'De toekomst mag niet verloren gaan',
            body: 'paginatypeeren die in armoede opgroeien hebben minder kansen op een goede opleiding en gezondheid. Heerlen heeft hier een grote opgave, maar ook veel betrokken mensen die helpen.',
            anchor: 'middle-right',
            field: 'aantal_jongeren_met_jeugdzorg_in_natura',
            palette: 'oranges',
            focus: { field: 'buurtnaam', value: 'Hoensbroek-Centrum' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
              { label: 'Huishoudens onder minimum', field: 'huishoudens_tot_120_percent_van_sociaal_minimum', format: 'integer' },
              { label: 'Jongeren met jeugdzorg', field: 'aantal_jongeren_met_jeugdzorg_in_natura', format: 'integer' }
            ]
          },
          {
            paginatype: 'summary',
            year: 2024,
            overline: 'Hoop en actie',
            title: 'Heerlen kan het beter',
            body: 'Armoede is niet onvermijdelijk. Door samen te werken — gemeente, bewoners, bedrijven en organisaties — kunnen we de cirkel doorbreken. Veel buurten laten al zien dat het anders kan.',
            anchor: 'top-right',
            stats: [
              { label: 'Samen kunnen we', value: 'meer', note: 'Ondersteuning, onderwijs en werkgelegenheid zijn de sleutels' }
            ]
          }
        ]
      }
      // Voeg hier je andere stories toe
    ];
  }

  const state = {
    overlay: null, backdrop: null, chip: null, counter: null,
    prevButton: null, nextButton: null, closeButton: null,
    card: null, kicker: null, title: null, copy: null,
    stats: null, note: null, menu: null,
    storyId: null, slideIndex: 0, highlightedLayers: [], keyHandler: null,
    _storyDrivenYearChange: false,
    _focusRenderToken: 0 // voorkomt dat een oude/trage retry een nieuwere slide overschrijft
  };

  function getStoryById(id) {
    return storyCatalog().find(s => s.id === id) || null;
  }

  function buildStoryMenu() {
    const menu = ensureMenu(state);
    if (!menu) return;
    const current = getFeatureCollection();
    const hasData = !!(current && Array.isArray(current.features) && current.features.length > 0);

    menu.innerHTML = storyCatalog().map(story => `
      <button type="button" class="story-menu-button" data-story-id="${escapeHtml(story.id)}">
        <span class="story-menu-title">${escapeHtml(story.title)}</span>
        <span class="story-menu-meta">${escapeHtml(story.summary)} · ${story.slides.length} slides${hasData ? '' : ' · data laden...'}</span>
      </button>
    `).join('');

    menu.querySelectorAll('[data-story-id]').forEach(btn => {
      btn.addEventListener('click', () => startStory(btn.getAttribute('data-story-id')));
    });
  }

  function updateMenuActiveState() {
    if (!state.menu) return;
    state.menu.querySelectorAll('.story-menu-button').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-story-id') === state.storyId);
    });
  }

  // ==================== SCENE TOEPASSING — gestructureerd in duidelijke stappen ====================

  /**
   * Stap 1: Year-slider synchroniseren met de slide.
   *
   * Vuurt de input/change-events ALLEEN af als het jaar daadwerkelijk
   * wijzigt. Twee opeenvolgende slides met hetzelfde jaar (zoals slide 2
   * en 3 in "Armoede in Heerlen", beide year: 2024) lieten deze events
   * vroeger toch afgaan — en als de multi-loader daar zelf (los van onze
   * eigen refreshOpenStory-listener, die we al onderdrukken via
   * _storyDrivenYearChange) op reageert met een eigen herlaad/redraw van
   * de kaartdata, is dat een goede kandidaat voor een ongewenste
   * fitBounds-naar-volledige-extent — zichtbaar als "uitzoomen" bij het
   * doorklikken naar een slide met hetzelfde jaar als de vorige.
   */
  function applyYearToSlider(slide) {
    if (slide?.year === undefined) return;

    const slider = document.getElementById('year-slider');
    const display = document.getElementById('year-display');
    if (!slider) return;

    const newYear = String(slide.year);
    const yearOngewijzigd = slider.value === newYear;

    slider.value = newYear;
    if (display) display.textContent = newYear;

    if (yearOngewijzigd) return;

    // Onderdruk de change-listener van multi-loader zodat er geen
    // dubbele/oneindige render-cyclus ontstaat.
    state._storyDrivenYearChange = true;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    state._storyDrivenYearChange = false;
  }

  /**
   * Stap 2: Palet synchroniseren met de slide.
   */
  function applyPaletteToUi(slide) {
    if (!slide?.palette) return;
    const paletteSelect = document.getElementById('palette-select');
    if (paletteSelect) paletteSelect.value = slide.palette;
  }

  /**
   * Stap 3: Variabelen-selectors vervangen door de stats-fields van de slide,
   * in de volgorde waarin ze in slide.stats staan.
   */
  function applyVariablesToUi(slide) {
    const selectorsDiv = document.getElementById('selectors-div');
    if (!selectorsDiv) return;

    selectorsDiv.innerHTML = '';

    const statsFields = (slide?.stats || [])
      .map(s => s.field)
      .filter(f => f && (window.availableFields || []).includes(f));

    statsFields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';

      const sel = document.createElement('select');
      sel.className = 'field-select-item';
      sel.style.minWidth = '180px';

      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '-- geen --';
      sel.appendChild(noneOpt);

      (window.availableFields || []).forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        if (f === field) opt.selected = true;
        sel.appendChild(opt);
      });

      // Luistert alleen naar handmatige gebruikerswijzigingen, niet naar
      // de story-initialisatie zelf (die roept toonChoropleth rechtstreeks aan).
      sel.addEventListener('change', () => window.herllaadVisualisatie?.());

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Verwijder';
      removeBtn.addEventListener('click', () => {
        row.remove();
        window.herllaadVisualisatie?.();
      });

      row.appendChild(sel);
      row.appendChild(removeBtn);
      selectorsDiv.appendChild(row);
    });
  }

  /**
   * Stap 4: Choropleth-laag tekenen voor deze slide.
   */
  function drawChoroplethForSlide(slide, fc) {
    if (slide.paginatype !== 'map' || !slide.field || typeof window.toonChoropleth !== 'function') return;

    const method  = document.getElementById('method-select')?.value || 'quantile';
    const palette = slide.palette || document.getElementById('palette-select')?.value || 'viridis';
    const opacity = parseFloat(document.getElementById('opacity-range')?.value || '0.65');

    window.toonChoropleth(fc, slide.field, {
      method,
      palette,
      opacity: Number.isFinite(opacity) ? opacity : 0.65,
      classes: 5
    });
  }

  /**
   * Stap 5: Zoek de Leaflet-laag die bij de focus-feature van de slide hoort.
   * Doorzoekt alle candidate-lagen (choropleth-laag, basis-laag).
   */
  function findFocusLayer(slide, fc) {
    if (!slide.focus) return null;

    const focusFeature = findFeatureInCollection(fc, slide.focus);
    if (!focusFeature?.properties) return null;

    const focusField = slide.focus.field || 'buurtnaam';
    const focusValue = normalizeText(focusFeature.properties[focusField] || slide.focus.value);
    if (!focusValue) return null;

    const candidates = getStoryLayerCandidates();
    for (const rootLayer of candidates) {
      if (!rootLayer || typeof rootLayer.eachLayer !== 'function') continue;

      let matchedLayer = null;
      rootLayer.eachLayer(layer => {
        if (matchedLayer || !layer?.feature?.properties) return;
        const props = layer.feature.properties;
        const probe = normalizeText(props[focusField] || props.buurtnaam || props.naam || props.wijknaam || props.buurt);
        if (probe && (probe === focusValue || probe.includes(focusValue) || focusValue.includes(probe))) {
          matchedLayer = layer;
        }
      });

      if (matchedLayer) return matchedLayer;
    }

    return null;
  }

  /**
   * Stap 5b: Bounds van de focus-feature berekenen direct vanuit de ruwe
   * GeoJSON-geometrie (via Leaflet), ZONDER te wachten op de gerenderde
   * choropleth-laag.
   *
   * Waarom dit nodig is: toonChoropleth() bouwt de kaartlaag opnieuw op en
   * lijkt daarbij zelf ook de view aan te passen (richting de volledige
   * gemeente-extent). Onze oude aanpak wachtte met zoomen tot de nieuwe
   * Leaflet-laag gevonden was (via requestAnimationFrame-retries in Stap 7),
   * maar dat is een race condition: als toonChoropleth() iets trager is dan
   * onze eerste paar pogingen, "wint" de volledige-extent-zoom van
   * toonChoropleth() alsnog en lijkt de kaart bij de volgende slide
   * onverwacht uit te zoomen. Door de bounds direct uit de feature-geometrie
   * te halen (die we al hebben, los van of de laag al getekend is) kunnen we
   * synchroon en direct na het tekenen van de choropleth naar de focus-buurt
   * zoomen — vóórdat er ruimte is voor zo'n race condition.
   */
  function computeFocusBoundsFromFeature(focusFeature) {
    if (!focusFeature?.geometry || typeof window.L === 'undefined' || !window.L.geoJSON) return null;
    try {
      const bounds = window.L.geoJSON(focusFeature).getBounds();
      return bounds && bounds.isValid() ? bounds : null;
    } catch (e) {
      console.warn('⚠️ Kon bounds niet berekenen uit focus-feature:', e);
      return null;
    }
  }

  /**
   * Stap 6: Highlight + popup voor de gevonden laag.
   *
   * Let op: het zoomen/fitBounds gebeurt hier NIET meer. Dat gebeurt nu
   * synchroon in applyStoryScene() (zie computeFocusBoundsFromFeature),
   * direct na het tekenen van de choropleth — vóór deze functie überhaupt
   * wordt aangeroepen. Deze functie regelt alleen nog de visuele highlight
   * (kleur) en de popup, die wél kunnen wachten tot de Leaflet-laag
   * daadwerkelijk bestaat.
   */
  function highlightFocusLayer(map, matchedLayer) {
    try {
      if (!matchedLayer.__storyOriginalStyle && typeof matchedLayer.setStyle === 'function') {
        matchedLayer.__storyOriginalStyle = {
          color: matchedLayer.options?.color,
          weight: matchedLayer.options?.weight,
          fillOpacity: matchedLayer.options?.fillOpacity,
          fillColor: matchedLayer.options?.fillColor
        };
      }

      if (typeof matchedLayer.setStyle === 'function') {
        matchedLayer.setStyle({ color: '#ffd166', weight: 2.2, fillOpacity: 0.9 });
      }

      if (typeof matchedLayer.openPopup === 'function') {
        matchedLayer.openPopup();
        matchedLayer.__storyOpenedPopup = true;
      }

      state.highlightedLayers.push(matchedLayer);
      return true;
    } catch (e) {
      console.warn('⚠️ Highlight mislukt:', e);
      return false;
    }
  }

  /**
   * Stap 7: Robuuste retry-wrapper rondom het zoeken naar de focus-laag.
   *
   * De choropleth-laag wordt door Leaflet niet synchroon in dezelfde
   * microtaak opgebouwd als waarin toonChoropleth() wordt aangeroepen.
   * Eén enkele poging direct na het tekenen leidde daardoor tot de
   * 50/50 bug: soms was de laag al klaar (alles werkte), soms nog niet
   * (geen highlight, geen hover-grafiek).
   *
   * We proberen daarom een paar keer met telkens een nieuw animatieframe,
   * en stoppen meteen zodra de laag gevonden is. Een token voorkomt dat
   * een trage, oude retry-cyclus de inmiddels nieuwere slide overschrijft
   * (bijvoorbeeld als de gebruiker snel meerdere keren doorklikt).
   *
   * De zoom zelf is hier inmiddels weggehaald (zie Stap 5b) — deze functie
   * regelt alleen nog de highlight-styling, popup en hover-grafiek.
   */
  function focusOnSlideWithRetry(slide, fc, renderToken, attemptsLeft = 8) {
    if (renderToken !== state._focusRenderToken) return; // er is al een nieuwere slide actief

    const map = getMap();
    if (!map || !slide?.focus) return;

    const matchedLayer = findFocusLayer(slide, fc);

    if (matchedLayer) {
      highlightFocusLayer(map, matchedLayer);

      if (typeof window.toonHoverJarenGrafiek === 'function') {
        window.toonHoverJarenGrafiek(matchedLayer.feature, slide.field);
      }
      return;
    }

    if (attemptsLeft <= 0) {
      console.warn('⚠️ Focus-laag niet gevonden na meerdere pogingen voor:', slide.focus);
      return;
    }

    requestAnimationFrame(() => {
      focusOnSlideWithRetry(slide, fc, renderToken, attemptsLeft - 1);
    });
  }

  /**
   * Stap 5c: Zoom naar de focus-bounds en HERBEVESTIG dit een paar keer kort
   * daarna ("lock").
   *
   * Waarom: ondanks de directe, synchrone fitBounds-call uit Stap 5b bleef
   * de kaart bij sommige overgangen toch uitzoomen. Dat betekent dat er
   * ná onze fitBounds-call nog iets anders de view aanpast — vermoedelijk
   * iets in toonChoropleth() zelf dat asynchroon werkt (bv. na het laden
   * van de laag, of via een eigen timer), waardoor het ons eigen
   * call-volgorde-argument ("wij roepen als laatste fitBounds aan") niet
   * standhoudt.
   *
   * In plaats van te blijven zoeken naar exact wélke code dat doet, dwingen
   * we onze gewenste view een paar keer kort na elkaar af. Als niemand de
   * view ondertussen heeft aangepast, zijn dit no-ops (de kaart staat al
   * goed, dus er gebeurt visueel niets). Als er wél iets tussendoor de view
   * heeft veranderd, wordt die binnen ~0,5 seconde weer teruggezet —
   * zonder animatie, dus zonder zichtbare "knipper".
   *
   * De renderToken-check zorgt ervoor dat dit stopt zodra de gebruiker
   * doorklikt naar een andere slide.
   */
  /**
   * Stap 5c: Pan/zoom-animaties van de Leaflet-kaart tijdelijk uitzetten.
   *
   * Leaflet beslist of een fitBounds/setView geanimeerd wordt aan de hand
   * van een MAP-BREDE vlag (options.zoomAnimation, en de intern gecachete
   * _zoomAnimated) — niet aan de hand van wie de aanroep doet. Door deze
   * vlag even op false te zetten, wordt ELKE view-wijziging tijdens dit
   * venster een instante sprong in plaats van een animatie. Dat geldt dus
   * ook voor een eventuele fitBounds/setView die toonChoropleth() zelf
   * (asynchroon) uitvoert, zonder dat wij die code hoeven aan te passen of
   * zelfs te kennen.
   *
   * Resultaat: als er tussendoor alsnog kort wordt "uitgezoomd" doordat iets
   * buiten ons bereik de view aanpast, gebeurt dat zo snel dat het visueel
   * niet meer als animatie te zien is — in plaats van de zichtbare
   * uit-dan-weer-inzoom-beweging van voorheen.
   *
   * Geeft een restore-functie terug om de oorspronkelijke staat terug te zetten.
   */
  function suspendZoomAnimation(map) {
    const hadZoomAnimationOption = map.options.zoomAnimation;
    const hadZoomAnimatedFlag = map._zoomAnimated;

    map.options.zoomAnimation = false;
    if (hadZoomAnimatedFlag !== undefined) map._zoomAnimated = false;

    return function restoreZoomAnimation() {
      map.options.zoomAnimation = hadZoomAnimationOption;
      if (hadZoomAnimatedFlag !== undefined) map._zoomAnimated = hadZoomAnimatedFlag;
    };
  }

  /**
   * Stap 5d: Zoom naar de focus-bounds en HERBEVESTIG dit een paar keer kort
   * daarna ("lock").
   *
   * Waarom: ondanks de directe, synchrone fitBounds-call uit Stap 5b bleef
   * de kaart bij sommige overgangen toch uitzoomen. Dat betekent dat er
   * ná onze fitBounds-call nog iets anders de view aanpast — vermoedelijk
   * iets in toonChoropleth() zelf dat asynchroon werkt (bv. na het laden
   * van de laag, of via een eigen timer), waardoor het ons eigen
   * call-volgorde-argument ("wij roepen als laatste fitBounds aan") niet
   * standhoudt.
   *
   * In plaats van te blijven zoeken naar exact wélke code dat doet, dwingen
   * we onze gewenste view een paar keer kort na elkaar af. Dit gebeurt
   * altijd zonder animatie (animate: false) — gecombineerd met
   * suspendZoomAnimation() in applyStoryScene is élke correctie hierdoor
   * een instante sprong, dus zonder de zichtbare "uitzoomen en dan weer
   * inzoomen"-beweging.
   *
   * De renderToken-check zorgt ervoor dat dit stopt zodra de gebruiker
   * doorklikt naar een andere slide.
   */
  function lockFocusZoom(map, bounds, renderToken) {
    map.fitBounds(bounds, { maxZoom: 14, animate: false, padding: [18, 18] });

    [40, 100, 200, 400, 700].forEach(delay => {
      setTimeout(() => {
        if (renderToken !== state._focusRenderToken) return; // andere slide actief, stop
        map.fitBounds(bounds, { maxZoom: 14, animate: false, padding: [18, 18] });
      }, delay);
    });
  }


  function applyStoryScene(slide, fc) {
    if (!slide) return;

    clearHighlights(state);

    applyYearToSlider(slide);
    applyPaletteToUi(slide);
    applyVariablesToUi(slide);

    const map = getMap();
    if (!map) return;

    if (!slide.focus) {
      drawChoroplethForSlide(slide, fc);
      return;
    }

    // Nieuw token: elke aanroep van applyStoryScene "annuleert" lopende
    // retry-cycli van een vorige slide.
    const renderToken = ++state._focusRenderToken;

    // Animaties van de kaart tijdelijk uitzetten — zie Stap 5c — zodat een
    // eventuele ongewenste tussenstap (uitzoomen) niet animeert en dus niet
    // zichtbaar is.
    const restoreZoomAnimation = suspendZoomAnimation(map);

    drawChoroplethForSlide(slide, fc);

    // Zoom naar de focus-buurt, op basis van de ruwe GeoJSON-geometrie —
    // zie Stap 5b voor waarom dit niet wacht op de gerenderde
    // choropleth-laag, en Stap 5d voor de "lock"-herbevestiging.
    const focusFeature = findFeatureInCollection(fc, slide.focus);
    const focusBounds = computeFocusBoundsFromFeature(focusFeature);
    if (focusBounds) {
      lockFocusZoom(map, focusBounds, renderToken);
    }

    // Highlight-styling, popup en hover-grafiek wachten wél op de
    // gerenderde Leaflet-laag — dat kan best een paar frames duren.
    requestAnimationFrame(() => {
      focusOnSlideWithRetry(slide, fc, renderToken);
    });

    // Animaties pas weer aanzetten nadat de laatste 'lock'-poging is geweest
    // (zie lockFocusZoom) — anders zou een héél late, trage aanpassing
    // daarna nog wél geanimeerd kunnen uitzoomen.
    setTimeout(() => {
      if (renderToken === state._focusRenderToken) restoreZoomAnimation();
    }, 900);
  }

  function resolveSlideFeature(slide, fc) {
    if (!slide) return null;
    return slide.focus ? findFeatureInCollection(fc, slide.focus) : null;
  }

  // ==================== RENDER / NAVIGATIE ====================

  async function renderSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;
    const slide = story.slides[state.slideIndex];
    if (!slide) return;

    ensureOverlay(state);
    const fc = await ensureStoryDataCollection(slide.year);

    const background = slide.paginatype === 'voorpagina'
      ? (slide.backgroundImage || createBackdrop(slide.title || story.title, slide.body, story.colors))
      : 'none';

    state.overlay.dataset.paginatype = slide.paginatype;
    state.overlay.hidden = false;
    state.backdrop.style.backgroundImage = background;
    state.backdrop.style.opacity = slide.paginatype === 'voorpagina' ? '1' : '0.14';

    state.chip.textContent = slide.overline || story.title;
    state.counter.textContent = `${state.slideIndex + 1} / ${story.slides.length}`;
    if (state.progressBar) {
      const progress = ((state.slideIndex + 1) / story.slides.length) * 100;
      state.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
    state.prevButton.disabled = state.slideIndex === 0;
    state.nextButton.textContent = state.slideIndex === story.slides.length - 1 ? 'Sluit verhaal' : 'Volgende';
    state.card.dataset.anchor = normalizeAnchors(slide.anchor || 'middle-right');
    state.card.classList.toggle('is-voorpagina', slide.paginatype === 'voorpagina');
    state.card.classList.toggle('is-map', slide.paginatype === 'map');
    state.card.classList.toggle('is-summary', slide.paginatype === 'summary');

    state.kicker.textContent = slide.overline || story.title;
    state.title.textContent = slide.title || story.title;
    state.copy.textContent = slide.body || '';

    applyStoryScene(slide, fc);
    const feature = resolveSlideFeature(slide, fc);
    state.stats.innerHTML = buildStatHtml(buildStatEntries(slide, feature, fc));

    if (slide.mapNote) {
      state.note.hidden = false;
      state.note.textContent = slide.mapNote;
    } else {
      state.note.hidden = true;
      state.note.textContent = '';
    }

    updateMenuActiveState();
  }

  function dispatchStoryEvent(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  }

  async function openStory(id) {
    const story = getStoryById(id) || storyCatalog()[0];
    if (!story) return;

    ensureOverlay(state);
    state.storyId = story.id;
    state.slideIndex = 0;
    document.body.classList.add('story-open');
    state.overlay.hidden = false;

    try {
      await ensureStoryDataCollection();
    } catch (e) {}

    if (!state.keyHandler) {
      state.keyHandler = (e) => {
        if (e.key === 'Escape') window.closeStory();
        if (e.key === 'ArrowRight') window.nextStorySlide();
        if (e.key === 'ArrowLeft') window.prevStorySlide();
      };
      document.addEventListener('keydown', state.keyHandler);
    }

    await renderSlide();
  }

  function closeStory() {
    if (!state.overlay) return;
    clearHighlights(state);
    state.overlay.hidden = true;
    document.body.classList.remove('story-open');
    state.storyId = null;
    state.slideIndex = 0;
  }

  function nextSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;
    if (state.slideIndex >= story.slides.length - 1) return closeStory();
    state.slideIndex++;
    renderSlide();
  }

  function prevSlide() {
    if (state.slideIndex <= 0) return;
    state.slideIndex--;
    renderSlide();
  }

  // ==================== INITIALISATIE ====================
  console.log('%c✅ Stories module geladen (robuuste focus/zoom/hover)', 'color:#0b7285; font-weight:bold');

  document.addEventListener('DOMContentLoaded', () => {
    ensureOverlay(state);
    buildStoryMenu();
    ensureStoryDataCollection();

    window.addEventListener('story:data-ready', buildStoryMenu);

    const refreshOpenStory = () => {
      if (state.storyId) {
        renderSlide();
      }
    };

    document.getElementById('apply-filter')?.addEventListener('click', refreshOpenStory);
    document.getElementById('clear-filter')?.addEventListener('click', refreshOpenStory);
    document.getElementById('filter-negative')?.addEventListener('click', refreshOpenStory);

    // Onderdruk re-render als de year-slider-change door de story zelf
    // werd veroorzaakt (zie applyYearToSlider) — voorkomt een oneindige lus.
    document.getElementById('year-slider')?.addEventListener('change', () => {
      if (!state._storyDrivenYearChange) refreshOpenStory();
    });
  });

  window.startStory = openStory;
  window.closeStory = closeStory;
  window.nextStorySlide = nextSlide;
  window.prevStorySlide = prevSlide;
  window.debugStoryData = window.debugStoryData;

})();