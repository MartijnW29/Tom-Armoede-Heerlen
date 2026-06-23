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

  function getStoryDataUrl(year) {
  if (!year) {
    const slider = document.getElementById('year-slider');
    year = slider ? parseInt(slider.value, 10) : null;
  }
  return year ? `data/heerlen_buurten_${year}.geojson` : 'data/heerlen_buurten.geojson';
}


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

  async function ensureStoryDataCollection(year) {
  // Haal altijd de originele (ongefilterde) data op
  const original = window.multiLoaderState?.originalData || null;

  if (original && Array.isArray(original.features) && original.features.length > 0) {
    // Filter op jaar als opgegeven
    if (year && typeof window.filterFeaturesByYear === 'function') {
      const filtered = window.filterFeaturesByYear(original, year);
      console.log(`📅 Story data gefilterd op jaar ${year}: ${filtered.features.length} features`);
      return filtered;
    }
    return original;
  }

  // Geen data in memory: gebruik cache of laad standaard bestand
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

  // ==================== VERBETERDE FEATURE MATCHING ====================
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

  // ==================== OVERIGE FUNCTIES ====================
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

  // ==================== MOOIE ARMOEDE STORY ====================
  function storyCatalog() {
    return [
      // === NIEUW VERHAAL: ARMOEDE IN HEERLEN ===
      {
        id: 'armoede-heerlen',
        title: 'Armoede in Heerlen',
        summary: 'Een eerlijk en hoopvol verhaal over armoede, veerkracht en de toekomst van onze stad.',
        colors: ['#1a3a5e', '#e63946', '#f4a261'],
        slides: [
          {
            slide_type: 'voorpagina',
            overline: 'Verhaal over onze stad',
            title: 'Armoede in Heerlen',
            body: 'Achter de statistieken gaan mensen schuil. Mensen met dromen, zorgen en veerkracht.',
            anchor: 'middle-right',
            backgroundImage: createBackdrop('Armoede in Heerlen', 'De onzichtbare realiteit achter de cijfers', ['#1a3a5e', '#e63946', '#f4a261'])
          },
          {
            slide_type: 'kaart',
            year: 2024,
            overline: 'De realiteit',
            title: 'Waar armoede het hardst toeslaat',
            body: 'In sommige buurten van Heerlen leeft meer dan 1 op de 4 huishoudens onder de armoedegrens. Dit is geen cijfer — dit zijn gezinnen, slide_typeeren en ouderen.',
            anchor: 'bottom-left',
            field: 'aantal_huishoudens',
            palette: 'Oranges',
            focus: { field: 'buurtnaam', value: 'Hoensbroek-Centrum' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners'},
              { label: 'Huishoudens', field: 'aantal_huishoudens'},
              { label: 'Werklozen', field: 'aantal_personen_met_een_aow_uitkering_totaal'},
              { label: 'Gemiddeld inkomen', field: 'gemiddeld_inkomen_per_inwoner'}
            ],
            mapNote: 'Donkere kleuren = hogere concentratie van armoede-indicatoren'
          },
          {
            slide_type: 'kaart',
            year: 2024,
            overline: 'slide_typeeren in armoede',
            title: 'De toekomst mag niet verloren gaan',
            body: 'slide_typeeren die in armoede opgroeien hebben minder kansen op een goede opleiding en gezondheid. Heerlen heeft hier een grote opgave, maar ook veel betrokken mensen die helpen.',
            anchor: 'bottom-left',
            field: 'aantal_inwoners',
            palette: 'Blues',
            focus: { field: 'buurtnaam', value: 'Hoensbroek-Centrum' },
            stats: [
              { label: 'Inwoners', field: 'aantal_inwoners'},
              { label: 'Huishoudens onder minimum', field: 'huishoudens_tot_120_percent_van_sociaal_minimum'},
              { label: 'Jongeren met jeugdzorg', field: 'aantal_jongeren_met_jeugdzorg_in_natura'}
            ]
          },
          {
            slide_type: 'summary',
            year: 2024,
            overline: 'Hoop en actie',
            title: 'Heerlen kan het beter',
            body: 'Armoede is niet onvermijdelijk. Door samen te werken — gemeente, bewoners, bedrijven en organisaties — kunnen we de cirkel doorbreken. Veel buurten laten al zien dat het anders kan.',
            anchor: 'top-left',
            stats: [
              { label: '', field: ''}
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
    storyId: null, slideIndex: 0, highlightedLayers: [], keyHandler: null
  };

  function getStoryById(id) {
    return storyCatalog().find(s => s.id === id) || null;
  }

  function buildStoryMenu() { /* ... jouw originele buildStoryMenu ... */ 
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

  function applyStoryScene(slide, fc) {
  // ── 1. Year-slider ────────────────────────────────────────────────
  if (slide?.year !== undefined) {
    const slider = document.getElementById('year-slider');
    const display = document.getElementById('year-display');
    if (slider) {
      slider.value = String(slide.year);
      if (display) display.textContent = String(slide.year);
      state._storyDrivenYearChange = true;
      slider.dispatchEvent(new Event('input',  { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      state._storyDrivenYearChange = false;
    }
  }

  // ── 2. Palet ─────────────────────────────────────────────────────
  if (slide?.palette) {
    const paletteSelect = document.getElementById('palette-select');
    if (paletteSelect) paletteSelect.value = slide.palette;
  }

  // ── 3. Variabelen resetten + instellen ────────────────────────────
  if (slide?.field && typeof window.addFieldSelector === 'function') {
    const selectorsDiv = document.getElementById('selectors-div');
    if (selectorsDiv) selectorsDiv.innerHTML = '';

    const slideFields = (slide?.stats || [])
    .map(s => s.field)
    .filter(f => f && (window.availableFields || []).includes(f));

    // Bouw rijen handmatig zonder herllaadVisualisatie te triggeren
    
const container = document.getElementById('field-select');
if (selectorsDiv && container) {
  slideFields.forEach(field => {
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

    // Luistert naar gebruikerswijzigingen — niet naar story-initialisatie
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
  }

  // ── 4. Kaart + choropleth ─────────────────────────────────────────
  const map = getMap();
  clearHighlights(state);
  if (!map || !slide) return;

  if (slide.slide_type === 'kaart' && slide.field && typeof window.toonChoropleth === 'function') {
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

  // ── 5. Focus + highlight ──────────────────────────────────────────
  if (!slide.focus) return;
  const focusFeature = findFeatureInCollection(fc, slide.focus);
  if (!focusFeature?.properties) return;

  const focusField = slide.focus.field || 'buurtnaam';
  const focusValue = normalizeText(focusFeature.properties[focusField] || slide.focus.value);
  if (!focusValue) return;

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

    if (!matchedLayer) continue;

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
      if (typeof matchedLayer.getBounds === 'function') {
        map.fitBounds(matchedLayer.getBounds(), { maxZoom: 14, animate: true, padding: [18, 18] });
      }
      if (typeof matchedLayer.openPopup === 'function') {
        matchedLayer.openPopup();
        matchedLayer.__storyOpenedPopup = true;
      }
      state.highlightedLayers.push(matchedLayer);
    } catch (e) {}

    break;
  }
}

  function resolveSlideFeature(slide, fc) {
    if (!slide) return null;
    return slide.focus ? findFeatureInCollection(fc, slide.focus) : null;
  }

  async function renderSlide() {
    const story = getStoryById(state.storyId);
    if (!story) return;
    const slide = story.slides[state.slideIndex];
    if (!slide) return;

    ensureOverlay(state);
    const fc = await ensureStoryDataCollection(slide.year);

    const background = slide.slide_type === 'voorpagina' 
      ? (slide.backgroundImage || createBackdrop(slide.title || story.title, slide.body, story.colors))
      : 'none';

    state.overlay.dataset.slide_type = slide.slide_type;
    state.overlay.hidden = false;
    state.backdrop.style.backgroundImage = background;
    state.backdrop.style.opacity = slide.slide_type === 'voorpagina' ? '1' : '0.14';

    state.chip.textContent = slide.overline || story.title;
    state.counter.textContent = `${state.slideIndex + 1} / ${story.slides.length}`;
    if (state.progressBar) {
      const progress = ((state.slideIndex + 1) / story.slides.length) * 100;
      state.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
    state.prevButton.disabled = state.slideIndex === 0;
    state.nextButton.textContent = state.slideIndex === story.slides.length - 1 ? 'Sluit verhaal' : 'Volgende';
    state.card.dataset.anchor = normalizeAnchors(slide.anchor || 'middle-right');
    state.card.classList.toggle('is-voorpagina', slide.slide_type === 'voorpagina');
    state.card.classList.toggle('is-map', slide.slide_type === 'kaart');
    state.card.classList.toggle('is-summary', slide.slide_type === 'summary');

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
      const fc = await ensureStoryDataCollection();
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

  // ==================== START ====================
  console.log('%c✅ Mooi armoede-verhaal toegevoegd', 'color:#e63946; font-weight:bold');

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