// ============================================================================
// MULTI-LOADER.JS — Heerlen Opportunity Atlas
// Gelijktijdig laden van meerdere bestanden/API's en jaar-filtering
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier aan voor jouw project
// ============================================================================

const MULTI_LOADER_CONFIG = {
  minYear:    2015,                                           // Vroegste jaar in de slider
  maxYear:    2030,                                           // Laatste jaar in de slider
  yearField:  'jaar',                                         // Primaire veldnaam voor jaar
  yearFields: ['jaar', 'year', 'Jaar', 'Year', 'JAAR'],      // Alle mogelijke jaar-veldnamen
};

// ============================================================================
// GLOBALE STATE — Gedeeld tussen alle loader-functies
// ============================================================================

window.multiLoaderState = {
  selectedFiles:  [],     // Geselecteerde bestanden (File-objecten)
  apiUrls:        [],     // Ingevoerde API-URL's
  mergedData:     null,   // Samengevoegde FeatureCollection (na laden)
  originalData:   null,   // Originele data vóór jaarfiltering
  yearFilter:     null,   // Actief geselecteerd jaar (null = alle jaren)
  availableYears: [],     // Unieke jaren aanwezig in de data
};

// ============================================================================
// HULPFUNCTIES — Jaar-detectie
// ============================================================================

/** Zoek welk property-veld het jaar bevat. Geeft de veldnaam terug, of null. */
function detectYearField(properties) {
  for (const field of MULTI_LOADER_CONFIG.yearFields) {
    if (field in properties) return field;
  }
  return null;
}

/** Lees het jaar uit een GeoJSON feature. Geeft een getal terug of null. */
function getYearFromFeature(feature) {
  if (!feature?.properties) return null;
  const veld = detectYearField(feature.properties);
  if (!veld) return null;
  const jaar = parseInt(feature.properties[veld], 10);
  return isNaN(jaar) ? null : jaar;
}

/** Geef het minimale en maximale jaar in een FeatureCollection terug als {min, max}. */
function getYearRange(fc) {
  if (!fc?.features) return null;
  const jaren = fc.features.map(getYearFromFeature).filter(j => j !== null);
  if (!jaren.length) return null;
  return { min: Math.min(...jaren), max: Math.max(...jaren) };
}

/** Geef een gesorteerde lijst van unieke jaren in een FeatureCollection terug. */
function getAvailableYears(fc) {
  if (!fc?.features) return [];
  const jaren = new Set();
  fc.features.forEach(f => { const j = getYearFromFeature(f); if (Number.isFinite(j)) jaren.add(j); });
  return Array.from(jaren).sort((a, b) => a - b);
}

// ============================================================================
// HULPFUNCTIES — Data-samenvoeging
// ============================================================================

/** Voeg meerdere FeatureCollections samen tot één. */
function mergeFeatureCollections(collections) {
  const features = [];
  for (const fc of collections) {
    if (Array.isArray(fc?.features)) features.push(...fc.features);
  }
  return { type: 'FeatureCollection', features };
}

/** Filter features op een specifiek jaar. Features zonder jaar worden altijd meegenomen. */
function filterFeaturesByYear(fc, year) {
  if (!year || !fc?.features) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(f => {
      const j = getYearFromFeature(f);
      return j === year || j === null;
    }),
  };
}

// ============================================================================
// SPATIAL HELPERS — Centroid en point-in-polygon (zonder Turf.js)
// ============================================================================

/**
 * Bereken het centroid (zwaartepunt) van een Polygon of MultiPolygon.
 * Methode: gemiddelde van alle coördinaten van de buitenring(en).
 * Dit is een benadering, maar snel genoeg voor de wijk-buurt matching.
 */
function getFeatureCentroid(feature) {
  const geom = feature?.geometry;
  if (!geom) return null;

  const coords = [];
  if      (geom.type === 'Polygon')      geom.coordinates[0]?.forEach(pt => coords.push(pt));
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly[0]?.forEach(pt => coords.push(pt)));
  else return null;

  if (!coords.length) return null;
  let sx = 0, sy = 0;
  coords.forEach(c => { sx += c[0]; sy += c[1]; });
  return [sx / coords.length, sy / coords.length];
}

/**
 * Ray-casting algoritme: bepaalt of een punt binnen een polygoonring valt.
 * Schiet een horizontale straal vanuit het punt en telt kruisingen met de ring.
 * Oneven aantal kruisingen = binnen de polygoon.
 */
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Controleer of een punt binnen een Polygon of MultiPolygon valt. */
function pointInGeometry(point, geom) {
  if (!point || !geom) return false;
  if (geom.type === 'Polygon')      return pointInRing(point, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(poly => pointInRing(point, poly[0]));
  return false;
}

/** Geef de meest beschrijvende naam van een feature terug (volgorde: wijknaam → naam → buurtnaam → code). */
function getFeatureName(f) {
  const p = f?.properties || {};
  return p.wijknaam || p.naam || p.name || p.buurtnaam || p.buurt || p.code || null;
}

/**
 * Koppel wijknamen aan buurten via centroid → point-in-polygon matching.
 * Schrijft het resultaat als `overlapping_wijken` array op elke buurt-feature.
 * Wordt aangeroepen nadat zowel buurten- als wijken-data geladen is.
 */
function addWijkenToBuurten(buurtenFC, wijkenFC) {
  if (!buurtenFC?.features || !wijkenFC?.features) return;
  for (const buurt of buurtenFC.features) {
    const centroid = getFeatureCentroid(buurt);
    if (!centroid) continue;
    const matches = [];
    for (const wijk of wijkenFC.features) {
      if (pointInGeometry(centroid, wijk.geometry)) {
        const naam = getFeatureName(wijk);
        if (naam && !matches.includes(naam)) matches.push(naam);
      }
    }
    buurt.properties = buurt.properties || {};
    buurt.properties.overlapping_wijken = matches;
  }
}

window.addWijkenToBuurten = addWijkenToBuurten;

// ============================================================================
// BESTANDEN LADEN — Meerdere lokale bestanden tegelijk
// ============================================================================

/** Laad en verwerk alle geselecteerde bestanden. Ondersteunt GeoJSON en CSV. */
async function loadMultipleFiles() {
  const files = document.getElementById('multi-file-input')?.files;
  if (!files?.length) { alert('Selecteer minstens één bestand'); return; }

  try {
    const collections = [];

    for (const file of files) {
      const text = await file.text();
      const naam = file.name.toLowerCase();
      try {
        if (naam.endsWith('.geojson') || naam.endsWith('.json')) {
          const fc = JSON.parse(text);
          if (fc.type === 'FeatureCollection' && fc.features) collections.push(fc);
        } else if ((naam.endsWith('.csv') || naam.endsWith('.txt')) && window.parseCSV) {
          // CSV-verwerking via importer.js
          const features = window.parseCSV(text);
          if (features.length) collections.push({ type: 'FeatureCollection', features });
        }
      } catch (err) {
        console.warn(`Kon bestand ${file.name} niet verwerken:`, err);
      }
    }

    if (!collections.length) { alert('Geen geldige data gevonden in geselecteerde bestanden'); return; }

    verwerkGeladen(mergeFeatureCollections(collections));
  } catch (err) {
    console.error('Fout bij multi-file loading:', err);
    alert('Fout bij laden van bestanden: ' + err.message);
  }
}

// ============================================================================
// API LADEN — Meerdere API-eindpunten tegelijk
// ============================================================================

/**
 * Breid URL-lijst uit voor jaargroepen.
 * Als een URL een viercijferig jaar bevat (bijv. 2024), wordt er één URL
 * per jaar in de geconfigureerde range aangemaakt.
 */
function expandUrlsForYearRange(urls) {
  const out = new Set();
  for (const url of urls) {
    const m = url.match(/\b20\d{2}\b/);
    if (m) {
      for (let y = MULTI_LOADER_CONFIG.minYear; y <= MULTI_LOADER_CONFIG.maxYear; y++) {
        out.add(url.replace(m[0], String(y)));
      }
    } else {
      out.add(url);
    }
  }
  return Array.from(out);
}

/** Laad alle ingevoerde API-URL's gelijktijdig en toon de data op de kaart. */
async function loadAllAPIs() {
  const urls = Array.from(document.querySelectorAll('.api-url-input'))
    .map(i => i.value?.trim()).filter(Boolean);

  if (!urls.length) { alert('Voer minstens één API-URL in'); return; }

  try {
    // Haal alle URL's (incl. jaar-varianten) gelijktijdig op
    const expandedUrls = expandUrlsForYearRange(urls);
    const results = await Promise.all(
      expandedUrls.map(url =>
        fetch(url)
          .then(res => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.json(); })
          .catch(err => { console.warn(`Fout bij laden ${url}:`, err); return null; })
      )
    );

    const collections = results
      .filter(Boolean)
      .map(r => {
        // OGC API Features gebruikt `items` in plaats van `features`
        if (!r.features && Array.isArray(r.items)) return { type: 'FeatureCollection', features: r.items };
        return r;
      })
      .filter(fc => Array.isArray(fc?.features));

    if (!collections.length) { alert("Geen geldige data ontvangen van API's"); return; }

    // Koppel wijknamen aan buurten als beide aanwezig zijn (PDOK data)
    try {
      const buurtFC = collections.find(fc => fc.features.some(f => f.properties?.buurt || f.properties?.buurtnaam));
      const wijkFC  = collections.find(fc => fc.features.some(f => f.properties?.wijk  || f.properties?.wijknaam));
      if (buurtFC && wijkFC) {
        addWijkenToBuurten(buurtFC, wijkFC);
        window.multiLoaderState.buurtenFC = buurtFC;
        window.multiLoaderState.wijkenFC  = wijkFC;
      }
    } catch (e) { console.warn('Kon wijk-buurt overlaps niet berekenen:', e); }

    verwerkGeladen(mergeFeatureCollections(collections));
  } catch (err) {
    console.error('Fout bij multi-API loading:', err);
    alert("Fout bij laden van API's: " + err.message);
  }
}

// ============================================================================
// VERWERKING — Na laden: opslaan, tonen, slider updaten
// ============================================================================

/**
 * Verwerk een nieuw geladen FeatureCollection:
 * sla op in state, toon op kaart, update slider en variabelen-selector.
 */
function verwerkGeladen(merged) {
  window.multiLoaderState.originalData = merged;
  window.appData.lastFC = merged;
  toonGemergedData(merged);
  updateYearSlider(merged);
  window.populateFieldSelect?.(merged);
}

/** Toon een FeatureCollection als grijze basislaag op de kaart en zoom ernaar. */
function toonGemergedData(fc) {
  // Verwijder vorige lagen
  for (const sleutel of ['baseGeoLayer', 'choroplethLayer']) {
    if (window.appData[sleutel]) {
      window.appData.dataLayer.removeLayer(window.appData[sleutel]);
      window.appData[sleutel] = null;
    }
  }

  const laag = L.geoJSON(fc, { style: { color: '#888', weight: 1, fillOpacity: 0.3 } })
    .addTo(window.appData.dataLayer);

  window.bringSmallPolygonsToFront?.(window.appData.dataLayer);
  window.appData.baseGeoLayer = laag;

  try { window.appData.map.fitBounds(laag.getBounds(), { maxZoom: 14 }); } catch (e) { /* negeren */ }
}

// ============================================================================
// JAAR-SLIDER — Initialiseren, renderen en filteren
// ============================================================================

/** Initialiseer de jaarslider op basis van beschikbare jaren in de data. */
function updateYearSlider(fc) {
  const slider       = document.getElementById('year-slider');
  const display      = document.getElementById('year-display');
  const clearButton  = document.getElementById('year-filter-clear');
  const jaarRange    = getYearRange(fc);
  if (!jaarRange || !slider) return;

  const alleJaren = getAvailableYears(fc).filter(
    j => j >= MULTI_LOADER_CONFIG.minYear && j <= MULTI_LOADER_CONFIG.maxYear
  );
  const jaren = alleJaren.length > 0 ? alleJaren : [
    Math.max(jaarRange.min, MULTI_LOADER_CONFIG.minYear),
    Math.min(jaarRange.max, MULTI_LOADER_CONFIG.maxYear),
  ].filter(Number.isFinite);

  window.multiLoaderState.availableYears = jaren;

  slider.min   = String(jaren[0]);
  slider.max   = String(jaren.at(-1));
  slider.step  = '1';

  // Standaard jaar: 2024 als beschikbaar, anders het laatste jaar
  const standaardJaar = jaren.includes(2024) ? 2024 : jaren.at(-1);
  slider.value = String(standaardJaar);

  renderYearTicks(slider, jaren);
  if (display) display.textContent = String(standaardJaar);
  updateYearDisplay();

  if (clearButton) { clearButton.hidden = true; clearButton.setAttribute('aria-hidden', 'true'); }
}

/**
 * Teken streepjes en labels onder de jaarslider.
 * Bij meer dan 16 jaren worden labels uitgedund om overbodige overlap te voorkomen.
 */
function renderYearTicks(slider, jaren) {
  const container = document.getElementById('year-ticks');
  if (!container || !slider || !jaren?.length) return;

  const minJ     = parseInt(slider.min, 10);
  const maxJ     = parseInt(slider.max, 10);
  const span     = Math.max(maxJ - minJ, 1);
  const labelStap = jaren.length <= 16 ? 1 : Math.ceil(jaren.length / 12);

  container.innerHTML = '';
  jaren.forEach((jaar, i) => {
    const left = `${((jaar - minJ) / span) * 100}%`;
    const edge = i === 0 ? 'start' : (i === jaren.length - 1 ? 'end' : 'middle');

    const tick = document.createElement('span');
    Object.assign(tick, { className: 'year-tick', title: String(jaar) });
    tick.style.left = left;
    tick.dataset.year = String(jaar);
    tick.dataset.edge = edge;

    const label = document.createElement('span');
    label.className   = 'year-tick-label';
    label.style.left  = left;
    label.dataset.edge = edge;
    label.textContent = (i % labelStap === 0 || i === jaren.length - 1) ? String(jaar) : '';

    container.appendChild(tick);
    container.appendChild(label);
  });
}

/** Markeer het actieve jaar visueel in de tick-reeks. */
function updateYearTickHighlight(jaar) {
  const container = document.getElementById('year-ticks');
  if (!container) return;
  container.querySelectorAll('.year-tick').forEach(t =>
    t.classList.toggle('is-active', jaar !== null && t.dataset.year === String(jaar)));
  container.querySelectorAll('.year-tick-label').forEach(l =>
    l.classList.toggle('is-active', jaar !== null && l.textContent === String(jaar)));
}

/**
 * Snap een jaar naar het dichtstbijzijnde beschikbare jaar in de data.
 * Voorkomt dat de slider op een jaar staat waarvoor geen data is.
 */
function snapYearToAvailableYear(jaar) {
  const jaren = window.multiLoaderState.availableYears || [];
  if (!Number.isFinite(jaar) || !jaren.length) return Number.isFinite(jaar) ? jaar : null;
  return jaren.reduce((best, kandidaat) =>
    Math.abs(kandidaat - jaar) < Math.abs(best - jaar) ? kandidaat : best
  , jaren[0]);
}

/** Lees de sliderwaarde, snap naar beschikbaar jaar en pas het filter toe. */
function updateYearDisplay() {
  const slider      = document.getElementById('year-slider');
  const display     = document.getElementById('year-display');
  const clearButton = document.getElementById('year-filter-clear');
  if (!slider || !display) return;

  const huidigJaar = snapYearToAvailableYear(parseInt(slider.value, 10));
  if (huidigJaar !== null && String(huidigJaar) !== slider.value) slider.value = String(huidigJaar);

  display.textContent = huidigJaar === null ? 'Alle jaren' : String(huidigJaar);
  updateYearTickHighlight(huidigJaar);

  if (huidigJaar !== null) {
    applyYearFilter(huidigJaar);
    if (clearButton) { clearButton.hidden = false; clearButton.setAttribute('aria-hidden', 'false'); }
  }
}

/** Filter data op het gekozen jaar en herlaad de visualisatie zonder opnieuw in te zoomen. */
function applyYearFilter(jaar) {
  const original = window.multiLoaderState.originalData || window.appData.lastFC;
  if (!original) return;

  window.multiLoaderState.yearFilter = jaar;
  window.appData = window.appData || {};
  window.appData.lastFC              = filterFeaturesByYear(original, jaar);
  window.appData.skipFitOnNextRender = true;  // Voorkomt ongewenste zoom-reset

  window.herllaadVisualisatie?.();
}

/** Zet het jaarfilter terug en toon alle jaren opnieuw. */
function clearYearFilter() {
  const display     = document.getElementById('year-display');
  const clearButton = document.getElementById('year-filter-clear');

  window.multiLoaderState.yearFilter = null;
  if (!window.multiLoaderState.originalData) return;

  window.appData.lastFC = window.multiLoaderState.originalData;
  if (display)     display.textContent = 'Alle jaren';
  if (clearButton) { clearButton.hidden = true; clearButton.setAttribute('aria-hidden', 'true'); }

  updateYearTickHighlight(null);
  window.herllaadVisualisatie?.();
}

// ============================================================================
// UI-BEHEER — API-URL velden dynamisch toevoegen/verwijderen
// ============================================================================

/** Voeg een extra API-URL invoerveld toe aan de lijst. */
function addApiUrlInput() {
  const list = document.getElementById('api-urls-list');
  if (!list) return;

  const item = document.createElement('div');
  item.className = 'api-url-item';
  item.style.cssText = 'display:flex;align-items:center;gap:var(--ruimte-2)';

  const input = document.createElement('input');
  input.type        = 'text';
  input.className   = 'api-url-input';
  input.placeholder = `API URL ${list.children.length + 1}`;

  const verwijderBtn = document.createElement('button');
  verwijderBtn.type      = 'button';
  verwijderBtn.className = 'remove-api-url';
  verwijderBtn.textContent = 'Verwijder';
  verwijderBtn.addEventListener('click', () => { item.remove(); updateRemoveButtons(); });

  item.append(input, verwijderBtn);
  list.appendChild(item);
  updateRemoveButtons();
}

/** Verberg de verwijderknop als er slechts één URL-veld is (minimaal één vereist). */
function updateRemoveButtons() {
  const items = document.querySelectorAll('.api-url-item');
  items.forEach(item => {
    const btn = item.querySelector('.remove-api-url');
    if (btn) btn.style.display = items.length > 1 ? 'block' : 'none';
  });
}

/** Update de weergave van geselecteerde bestanden onder het bestandsinvoerveld. */
function updateFileList() {
  const files   = document.getElementById('multi-file-input')?.files;
  const fileList = document.getElementById('file-list');
  if (!fileList) return;

  fileList.innerHTML = '';
  if (files?.length) {
    Array.from(files).forEach((file, i) => {
      const item = document.createElement('div');
      item.className = 'file-list-item';
      item.appendChild(Object.assign(document.createElement('span'), { textContent: `${i + 1}. ${file.name}` }));
      fileList.appendChild(item);
    });
  }
}

// ============================================================================
// INITIALISATIE — Event-listeners koppelen na laden van de pagina
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('load-multiple-files')?.addEventListener('click', loadMultipleFiles);
  document.getElementById('multi-file-input')?.addEventListener('change', updateFileList);
  document.getElementById('add-api-url')?.addEventListener('click', addApiUrlInput);
  document.getElementById('load-all-apis')?.addEventListener('click', loadAllAPIs);
  document.getElementById('year-slider')?.addEventListener('input', updateYearDisplay);
  document.getElementById('year-filter-clear')?.addEventListener('click', clearYearFilter);

  updateRemoveButtons();

  // Automatisch laden bij start (kleine vertraging zodat andere scripts klaar zijn)
  setTimeout(() => { try { loadAllAPIs(); } catch (e) { console.warn('Auto-load mislukt:', e); } }, 200);
});

// ============================================================================
// GLOBALE EXPORTS — Beschikbaar maken voor andere scripts
// ============================================================================

Object.assign(window, {
  loadMultipleFiles,
  loadAllAPIs,
  applyYearFilter,
  clearYearFilter,
  getYearFromFeature,
  getYearRange,
  getAvailableYears,
  mergeFeatureCollections,
  filterFeaturesByYear,
});