// ============================================================================
// MULTI-LOADER.JS — Heerlen Opportunity Atlas
// Gelijktijdig laden van meerdere bestanden/API's en jaar-filtering
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de laderinstellingen aan
// ============================================================================

const MULTI_LOADER_CONFIG = {

  // --- Jaarslider ---
  minYear:   2015,                                        // Vroegste jaar in de slider
  maxYear:   2030,                                        // Laatste jaar in de slider

  // --- Jaar-veldnamen (in volgorde van prioriteit) ---
  yearField:  'jaar',
  yearFields: ['jaar', 'year', 'Jaar', 'Year', 'JAAR'],

  // --- CBS OData API (kerncijfers wijken en buurten) ---
  // De server gebruikt ODataApi v3 (herkenbaar aan "odata.metadata" zonder @).
  // Tabelcodes per jaar:
  //   84799NED = 2020 | 85619NED = 2021 | 85959NED = 2022 | 86005NED = 2023 | 85984NED = 2024
  cbsOdataUrl: 'https://opendata.cbs.nl/ODataApi/OData/84799NED/TypedDataSet',

  // Gemeentecode voor Heerlen — wordt gebruikt om CBS-rijen te filteren in JS
  // (server-side $filter werkt niet betrouwbaar door trailing spaties in CBS-codes)
  cbsGemeenteCode: '0917',

  // Veld in CBS-data dat overeenkomt met de buurt/wijkcode in de PDOK-geometrielaag
  cbsKoppelveld:    'WijkenEnBuurten',  // CBS-kant  (wordt getrimd voor vergelijking)
  pdokKoppelveld:   'statcode',         // PDOK-kant (wordt getrimd voor vergelijking)

  // Velden die NIET als datavariabelen getoond worden (identificatie/meta)
  cbsUitsluitVelden: ['ID', 'WijkenEnBuurten', 'Codering_3'],
};


// ============================================================================
// GLOBALE STATE — Gedeeld tussen alle loader-functies
// ============================================================================

window.multiLoaderState = {
  selectedFiles:  [],   // Geselecteerde bestanden (File-objecten)
  apiUrls:        [],   // Ingevoerde API-URL's
  mergedData:     null, // Samengevoegde FeatureCollection (na laden)
  originalData:   null, // Originele data vóór jaarfiltering
  yearFilter:     null, // Actief geselecteerd jaar (null = alle jaren)
  availableYears: [],   // Unieke jaren aanwezig in de data
  cbsData:        null, // Geladen CBS-kerncijfers (als object: code → properties)
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
// CBS ODATA — Laden en koppelen van kerncijfers
// ============================================================================

/**
 * Haalt CBS-kerncijfers op via de ODataApi v3 en retourneert een opzoektabel:
 *   { [buurt/wijkcode]: { ...numerieke velden... } }
 *
 * Belangrijke eigenaardigheden van de CBS v3 API:
 *   - Paginering via "odata.nextLink" (zonder @, dat is v4-syntax).
 *   - $filter met substringof() werkt WEL in v3 (startswith() niet).
 *   - CBS-codes bevatten trailing spaties (bijv. 'GM0917    ') — altijd trimmen.
 *   - Respons heeft `value`-array met alle rijen.
 *
 * @returns {Promise<Object>} Opzoektabel geïndexeerd op getrimde buurt/wijkcode
 */
async function laadCbsKerncijfers() {
  const uitsluit     = new Set(MULTI_LOADER_CONFIG.cbsUitsluitVelden);
  const gemeenteCode = MULTI_LOADER_CONFIG.cbsGemeenteCode;
  const opzoek       = {};

  // substringof is de v3-manier om op een deelstring te filteren.
  // We filteren op de gemeentecode zodat we alleen Heerlen-rijen ophalen.
  const filter = encodeURIComponent(`substringof('${gemeenteCode}',WijkenEnBuurten)`);
  let url = `${MULTI_LOADER_CONFIG.cbsOdataUrl}?$filter=${filter}&$format=json`;

  // Pagineer via odata.nextLink (v3 gebruikt geen @ prefix)
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CBS API fout: HTTP ${res.status}`);
    const json = await res.json();

    for (const rij of (json.value || [])) {
      // Trim trailing spaties uit de CBS-code
      const cbsCode = (rij[MULTI_LOADER_CONFIG.cbsKoppelveld] || '').trim();
      if (!cbsCode) continue;

      // Sla alleen numerieke velden op; sla meta-velden over
      const props = {};
      for (const [k, v] of Object.entries(rij)) {
        if (uitsluit.has(k)) continue;
        if (typeof v === 'number') {
          props[k] = v;
        } else if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v.trim())) {
          props[k] = +v.trim();
        }
      }
      opzoek[cbsCode] = props;
    }

    // v3 paginering: "odata.nextLink" (zonder @)
    url = json['odata.nextLink'] || json['@odata.nextLink'] || null;
  }

  if (!Object.keys(opzoek).length) {
    throw new Error(
      `Geen CBS-data gevonden voor gemeente ${gemeenteCode}. ` +
      'Controleer de tabelcode in cbsOdataUrl (bijv. 85984NED voor 2024).'
    );
  }

  return opzoek;
}

/**
 * Koppelt CBS-kerncijfers aan een PDOK GeoJSON FeatureCollection.
 * Zoekt per feature de bijbehorende CBS-rij op via de buurt/wijkcode
 * (beide kanten worden getrimd om spatie-mismatches te voorkomen).
 * CBS-velden worden alleen geschreven als het veld nog niet bestaat in PDOK-data.
 *
 * @param {GeoJSON.FeatureCollection} fc        - PDOK-geometrielaag
 * @param {Object}                    cbsOpzoek - Opzoektabel uit laadCbsKerncijfers()
 */
function koppelCbsAanGeometrie(fc, cbsOpzoek) {
  if (!fc?.features || !cbsOpzoek) return;

  let gekoppeld = 0;
  for (const feature of fc.features) {
    const props = feature.properties || {};

    // Probeer meerdere PDOK-veldnamen voor de buurtcode; trim altijd
    const code = (
      props[MULTI_LOADER_CONFIG.pdokKoppelveld] ||
      props.buurtcode || props.wijkcode ||
      props.statcode  || props.code || ''
    ).trim();

    if (!code) continue;
    const cbsProps = cbsOpzoek[code];
    if (!cbsProps) continue;

    // Voeg CBS-velden toe zonder bestaande PDOK-velden te overschrijven
    for (const [k, v] of Object.entries(cbsProps)) {
      if (!(k in props)) props[k] = v;
    }
    feature.properties = props;
    gekoppeld++;
  }

  console.log(`CBS-koppeling: ${gekoppeld} van ${fc.features.length} features gekoppeld`);
}

/**
 * Laad CBS-kerncijfers en koppel ze aan de actieve geometrielaag.
 * Vereist dat er al een PDOK-geometrielaag geladen is (via loadAllAPIs).
 * Geeft statusfeedback in de knoptekst.
 */
async function laadEnKoppelCbs() {
  const btn       = document.getElementById('load-cbs-data');
  const origTekst = btn?.textContent || 'CBS laden';
  if (btn) { btn.disabled = true; btn.textContent = 'CBS data laden…'; }

  try {
    const opzoek = await laadCbsKerncijfers();
    window.multiLoaderState.cbsData = opzoek;

    const fc = window.multiLoaderState.originalData || window.appData?.lastFC;
    if (!fc) {
      alert('Laad eerst een geometrielaag (PDOK buurten/wijken) voordat CBS data gekoppeld kan worden.');
      if (btn) { btn.disabled = false; btn.textContent = origTekst; }
      return;
    }

    koppelCbsAanGeometrie(fc, opzoek);

    // Herlaad veldselectoren en visualisatie zodat CBS-velden zichtbaar worden
    window.populateFieldSelect?.(fc);
    window.herllaadVisualisatie?.();

    if (btn) btn.textContent = `✓ CBS gekoppeld (${Object.keys(opzoek).length} gebieden)`;
  } catch (err) {
    console.error('CBS laden mislukt:', err);
    alert('Fout bij laden CBS-data: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = origTekst; }
  }
}


// ============================================================================
// SPATIAL HELPERS — Centroid en point-in-polygon (zonder Turf.js)
// ============================================================================

/**
 * Berekent het centroid van een Polygon of MultiPolygon als gemiddelde
 * van alle buitenring-coördinaten. Snelle benadering, geen exacte formule.
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
 * Schiet een horizontale straal vanuit het punt en telt kruisingen.
 * Oneven aantal kruisingen = het punt ligt binnen de ring.
 */
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
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

/** Geef de meest beschrijvende naam van een feature terug (wijknaam → naam → buurtnaam → code). */
function getFeatureName(f) {
  const p = f?.properties || {};
  return p.wijknaam || p.naam || p.name || p.buurtnaam || p.buurt || p.code || null;
}

/**
 * Koppelt wijknamen aan buurten via centroid → point-in-polygon matching.
 * Schrijft het resultaat als `overlapping_wijken`-array op elke buurt-feature.
 * Wordt aangeroepen nadat zowel buurten- als wijken-data geladen zijn.
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
// API LADEN — Meerdere PDOK/GeoJSON-eindpunten tegelijk
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

/**
 * Verwijdert de standaard PDOK-bronnen uit de lijst na het laden van de basisdata.
 * Dit houdt de interface schoon nadat CBS-kerncijfers zijn gekoppeld.
 */
function verwijderStandaardApiBronnen() {
  const list = document.getElementById('api-urls-list');
  if (!list) return;

  const standaardItems = Array.from(list.querySelectorAll('.api-url-item'))
    .filter(item => ['pdok-buurten', 'pdok-wijken'].includes(item.dataset.api));

  standaardItems.slice(0, 2).forEach(item => item.remove());
  updateRemoveButtons();
}

/**
 * Laad alle ingevoerde API-URL's gelijktijdig en toon de data op de kaart.
 * Ondersteunt PDOK OGC API (geeft `items`) en standaard GeoJSON (geeft `features`).
 * Na het laden worden CBS-kerncijfers gekoppeld en worden de standaard bronregels verwijderd.
 */
async function loadAllAPIs() {
  const urls = Array.from(document.querySelectorAll('.api-url-input'))
    .map(i => i.value?.trim()).filter(Boolean);

  if (!urls.length) { alert('Voer minstens één API-URL in'); return; }

  try {
    const expandedUrls = expandUrlsForYearRange(urls);

    // CBS OData URLs geven geen GeoJSON — die worden apart afgehandeld via laadEnKoppelCbs().
    // Filter ze hier weg zodat ze de GeoJSON-parser niet laten crashen.
    const geoJsonUrls = expandedUrls.filter(u => !u.includes('opendata.cbs.nl'));
    const cbsUrls     = expandedUrls.filter(u =>  u.includes('opendata.cbs.nl'));

    if (cbsUrls.length) {
      console.info('CBS-URLs worden overgeslagen in loadAllAPIs — gebruik de "CBS laden" knop:', cbsUrls);
    }

    if (!geoJsonUrls.length) {
      alert('Alle ingevoerde URLs zijn CBS OData URLs. Gebruik de "CBS laden" knop om CBS-kerncijfers te koppelen.');
      return;
    }

    const results = await Promise.all(
      geoJsonUrls.map(url =>
        fetch(url)
          .then(res => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.json(); })
          .catch(err => { console.warn(`Fout bij laden ${url}:`, err); return null; })
      )
    );

    const collections = results
      .filter(Boolean)
      .map(r => {
        // PDOK OGC API gebruikt `items`, standaard GeoJSON gebruikt `features`
        if (!r.features && Array.isArray(r.items)) return { type: 'FeatureCollection', features: r.items };
        return r;
      })
      .filter(fc => Array.isArray(fc?.features));

    if (!collections.length) { alert("Geen geldige GeoJSON data ontvangen van de API's"); return; }

    // Koppel wijknamen aan buurten als beide datasets aanwezig zijn (PDOK)
    try {
      const buurtFC = collections.find(fc => fc.features.some(f => f.properties?.buurt || f.properties?.buurtnaam));
      const wijkFC  = collections.find(fc => fc.features.some(f => f.properties?.wijk  || f.properties?.wijknaam));
      if (buurtFC && wijkFC) {
        addWijkenToBuurten(buurtFC, wijkFC);
        window.multiLoaderState.buurtenFC = buurtFC;
        window.multiLoaderState.wijkenFC  = wijkFC;
      }
    } catch (e) { console.warn('Kon wijk-buurt overlaps niet berekenen:', e); }

    const samengevoegd = mergeFeatureCollections(collections);
    verwerkGeladen(samengevoegd);

    // Laad CBS-kerncijfers en koppel ze aan de nieuwe geometrie.
    await laadEnKoppelCbs();
    verwijderStandaardApiBronnen();

    // Als CBS-data al eerder geladen was, direct koppelen aan de nieuwe geometrie
    if (window.multiLoaderState.cbsData) {
      koppelCbsAanGeometrie(samengevoegd, window.multiLoaderState.cbsData);
      window.populateFieldSelect?.(samengevoegd);
      window.herllaadVisualisatie?.();
    }

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

  try { window.appData.map.fitBounds(laag.getBounds(), { maxZoom: 14 }); } catch (_) {}
}


// ============================================================================
// JAAR-SLIDER — Initialiseren, renderen en filteren
// ============================================================================

/** Initialiseer de jaarslider op basis van beschikbare jaren in de data. */
function updateYearSlider(fc) {
  const slider      = document.getElementById('year-slider');
  const display     = document.getElementById('year-display');
  const clearButton = document.getElementById('year-filter-clear');
  const jaarRange   = getYearRange(fc);
  if (!jaarRange || !slider) return;

  const alleJaren = getAvailableYears(fc).filter(
    j => j >= MULTI_LOADER_CONFIG.minYear && j <= MULTI_LOADER_CONFIG.maxYear
  );
  const jaren = alleJaren.length > 0 ? alleJaren : [
    Math.max(jaarRange.min, MULTI_LOADER_CONFIG.minYear),
    Math.min(jaarRange.max, MULTI_LOADER_CONFIG.maxYear),
  ].filter(Number.isFinite);

  window.multiLoaderState.availableYears = jaren;
  slider.min  = String(jaren[0]);
  slider.max  = String(jaren.at(-1));
  slider.step = '1';

  const standaardJaar = jaren.includes(2024) ? 2024 : jaren.at(-1);
  slider.value = String(standaardJaar);

  renderYearTicks(slider, jaren);
  if (display) display.textContent = String(standaardJaar);
  updateYearDisplay();

  if (clearButton) { clearButton.hidden = true; clearButton.setAttribute('aria-hidden', 'true'); }
}

/**
 * Teken streepjes en labels onder de jaarslider.
 * Bij meer dan 16 jaren worden labels uitgedund om overlapping te voorkomen.
 */
function renderYearTicks(slider, jaren) {
  const container = document.getElementById('year-ticks');
  if (!container || !slider || !jaren?.length) return;

  const minJ      = parseInt(slider.min, 10);
  const maxJ      = parseInt(slider.max, 10);
  const span      = Math.max(maxJ - minJ, 1);
  const labelStap = jaren.length <= 16 ? 1 : Math.ceil(jaren.length / 12);

  container.innerHTML = '';
  jaren.forEach((jaar, i) => {
    const left = `${((jaar - minJ) / span) * 100}%`;
    const edge = i === 0 ? 'start' : (i === jaren.length - 1 ? 'end' : 'middle');

    const tick = document.createElement('span');
    Object.assign(tick, { className: 'year-tick', title: String(jaar) });
    tick.style.left   = left;
    tick.dataset.year = String(jaar);
    tick.dataset.edge = edge;

    const label = document.createElement('span');
    label.className    = 'year-tick-label';
    label.style.left   = left;
    label.dataset.edge = edge;
    label.textContent  = (i % labelStap === 0 || i === jaren.length - 1) ? String(jaar) : '';

    container.append(tick, label);
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
 * Snap een jaar naar het dichtstbijzijnde beschikbare jaar.
 * Voorkomt dat de slider op een jaar staat waarvoor geen data beschikbaar is.
 */
function snapYearToAvailableYear(jaar) {
  const jaren = window.multiLoaderState.availableYears || [];
  if (!Number.isFinite(jaar) || !jaren.length) return Number.isFinite(jaar) ? jaar : null;
  return jaren.reduce((best, k) => Math.abs(k - jaar) < Math.abs(best - jaar) ? k : best, jaren[0]);
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

  window.multiLoaderState.yearFilter    = jaar;
  window.appData.lastFC                 = filterFeaturesByYear(original, jaar);
  window.appData.skipFitOnNextRender    = true;  // Voorkomt ongewenste zoom-reset

  window.herllaadVisualisatie?.();
}

// ============================================================================
// JAAR-ANIMATIE — Automatisch afspelen door de beschikbare jaren
// ============================================================================

const YEAR_PLAY_CONFIG = { stepDelayMs: 1200 }; // tijd tussen twee jaren tijdens afspelen

window.multiLoaderState.yearPlayTimer = window.multiLoaderState.yearPlayTimer || null;

/** Start of stop het automatisch doorlopen van de jaren, afhankelijk van de huidige status. */
function toggleYearPlay() {
  window.multiLoaderState.yearPlayTimer ? stopYearPlay() : startYearPlay();
}

/** Start de jaar-animatie: loopt elke `stepDelayMs` naar het volgstende beschikbare jaar. */
function startYearPlay() {
  const jaren = window.multiLoaderState.availableYears || [];
  const slider = document.getElementById('year-slider');
  const knop = document.getElementById('year-play-toggle');
  if (!slider || jaren.length < 2) return;

  // Begin opnieuw vanaf het eerste jaar als de slider al op het laatste jaar staat
  const huidig = snapYearToAvailableYear(parseInt(slider.value, 10));
  if (huidig === jaren.at(-1)) {
    slider.value = String(jaren[0]);
    updateYearDisplay();
  }

  window.multiLoaderState.yearPlayTimer = setInterval(() => {
    const jaren = window.multiLoaderState.availableYears || [];
    const huidigJaar = snapYearToAvailableYear(parseInt(slider.value, 10));
    const idx = jaren.indexOf(huidigJaar);
    if (idx === -1) { stopYearPlay(); return; }
    // Bij het laatste jaar: begin weer opnieuw vanaf het eerste (oneindige loop)
    const volgendeIdx = idx >= jaren.length - 1 ? 0 : idx + 1;
    slider.value = String(jaren[volgendeIdx]);
    updateYearDisplay();
  }, YEAR_PLAY_CONFIG.stepDelayMs);

  if (knop) { knop.innerHTML = '&#10074;&#10074;'; knop.setAttribute('aria-pressed', 'true'); knop.title = 'Afspelen stoppen'; }
}

/** Stop de jaar-animatie. */
function stopYearPlay() {
  if (window.multiLoaderState.yearPlayTimer) clearInterval(window.multiLoaderState.yearPlayTimer);
  window.multiLoaderState.yearPlayTimer = null;

  const knop = document.getElementById('year-play-toggle');
  if (knop) { knop.innerHTML = '&#9654;'; knop.setAttribute('aria-pressed', 'false'); knop.title = 'Automatisch afspelen door de jaren'; }
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
  item.className     = 'api-url-item';
  item.style.cssText = 'display:flex;align-items:center;gap:var(--ruimte-2)';

  const input = document.createElement('input');
  input.type        = 'text';
  input.className   = 'api-url-input';
  input.placeholder = `API URL ${list.children.length + 1}`;

  const verwijderBtn = document.createElement('button');
  verwijderBtn.type        = 'button';
  verwijderBtn.className   = 'remove-api-url';
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
  const files    = document.getElementById('multi-file-input')?.files;
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
  document.getElementById('load-multiple-files')?.addEventListener('click',  loadMultipleFiles);
  document.getElementById('multi-file-input')?.addEventListener('change',    updateFileList);
  document.getElementById('add-api-url')?.addEventListener('click',          addApiUrlInput);
  document.getElementById('load-all-apis')?.addEventListener('click',        loadAllAPIs);
  document.getElementById('year-slider')?.addEventListener('input',          updateYearDisplay);
  document.getElementById('year-slider')?.addEventListener('pointerdown',    stopYearPlay); // handmatig schuiven stopt de animatie
  document.getElementById('year-filter-clear')?.addEventListener('click',    clearYearFilter);
  document.getElementById('year-play-toggle')?.addEventListener('click',     toggleYearPlay);

  // CBS-knop: voeg toe in HTML als <button id="load-cbs-data">CBS kerncijfers laden</button>
  document.getElementById('load-cbs-data')?.addEventListener('click', laadEnKoppelCbs);

  updateRemoveButtons();

  // Automatisch laden bij start (korte vertraging zodat andere scripts klaar zijn)
  setTimeout(() => { try { loadAllAPIs(); } catch (e) { console.warn('Auto-load mislukt:', e); } }, 200);
});


// ============================================================================
// GLOBALE EXPORTS — Beschikbaar maken voor andere scripts
// ============================================================================

Object.assign(window, {
  loadMultipleFiles,
  loadAllAPIs,
  laadEnKoppelCbs,
  applyYearFilter,
  clearYearFilter,
  getYearFromFeature,
  getYearRange,
  getAvailableYears,
  mergeFeatureCollections,
  filterFeaturesByYear,
});