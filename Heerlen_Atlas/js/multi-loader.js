// ============================================================================
// MULTI-LOADER.JS — Heerlen Opportunity Atlas
// Gelijktijdig laden van meerdere bestanden/API's en jaar-filtering
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de laderinstellingen aan
// ============================================================================

const MULTI_LOADER_CONFIG = {
  // --- Jaarslider ---
  minYear:   2013,                                        // Vroegste jaar in de slider (CBS StatLine, zie cbs-historie.js)
  maxYear:   2050,                                        // Laatste jaar in de slider

  // --- PDOK-jaren ---
  // De PDOK OGC API (kaartvormen + cijfers) bestaat alleen voor deze jaren;
  // oudere jaren komen uit CBS StatLine (cbs-historie.js).
  pdokMinYear: 2022,
  pdokMaxYear: 2025,

  // --- Jaar-veldnamen (in volgorde van prioriteit) ---
  yearField:  'jaar',
  yearFields: ['jaar', 'year', 'Jaar', 'Year', 'JAAR'],

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
// CBS HISTORIE — Jaren vóór 2022 aanvullen met CBS StatLine (zie cbs-historie.js)
// ============================================================================

/**
 * Voeg de jaren 2013–2021 toe aan de geladen data via CBS StatLine en ververs
 * de jaarslider, de variabelen en de kaart. Geeft statusfeedback in de knoptekst.
 */
async function laadEnKoppelCbs() {
  const btn       = document.getElementById('load-cbs-data');
  const origTekst = btn?.dataset.origTekst || btn?.textContent || 'CBS kerncijfers laden';
  if (btn) { btn.dataset.origTekst = origTekst; btn.disabled = true; btn.textContent = 'CBS data laden…'; }

  try {
    const fc = window.multiLoaderState.originalData || window.appData?.lastFC;
    if (!fc) {
      alert('Laad eerst een geometrielaag (PDOK buurten/wijken) voordat CBS-data gekoppeld kan worden.');
      if (btn) { btn.disabled = false; btn.textContent = origTekst; }
      return;
    }

    const aantal = await window.laadCbsHistorie(fc);
    if (aantal) {
      window.multiLoaderState.originalData = fc;
      window.vulAangemaakteVariabelenAan?.(fc);
      updateYearSlider(fc);
      window.populateFieldSelect?.(fc);
    }
    if (btn) btn.textContent = aantal ? `✓ CBS-jaren toegevoegd (${aantal})` : 'Geen extra CBS-jaren nodig';
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
// ROBUUST OPHALEN — Beperkte gelijktijdigheid + opnieuw proberen
// PDOK-antwoorden zijn groot (~1 MB per jaar). Alles tegelijk opvragen kan
// tijdelijk mislukken (time-out, 429/5xx); zulke jaren verdwenen dan stilletjes
// uit de jaarslider. Daarom: maximaal een paar verzoeken tegelijk, en bij een
// fout enkele keren opnieuw proberen.
// ============================================================================

const FETCH_CONFIG = { maxGelijktijdig: 3, pogingen: 4, wachtMs: 700 };

/** Haal JSON op; probeert bij een fout (netwerk, 429, 5xx) opnieuw met oplopende wachttijd. */
async function fetchJsonMetRetry(url) {
  let laatsteFout;
  for (let poging = 1; poging <= FETCH_CONFIG.pogingen; poging++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      // 4xx (behalve 429) is definitief: dat jaar bestaat niet
      if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`Status ${res.status}`), { definitief: true });
      laatsteFout = new Error(`Status ${res.status}`);
    } catch (err) {
      if (err.definitief) throw err;
      laatsteFout = err;
    }
    if (poging < FETCH_CONFIG.pogingen) await new Promise(r => setTimeout(r, FETCH_CONFIG.wachtMs * poging));
  }
  throw laatsteFout;
}

/** Voer taken uit met een maximum aantal tegelijk; behoudt de volgorde van de resultaten. */
async function metMaxGelijktijdig(items, limiet, taak) {
  const resultaten = new Array(items.length);
  let volgende = 0;
  const werkers = Array.from({ length: Math.min(limiet, items.length) }, async () => {
    while (volgende < items.length) {
      const i = volgende++;
      resultaten[i] = await taak(items[i], i);
    }
  });
  await Promise.all(werkers);
  return resultaten;
}


/** Toon een melding als jaren niet geladen konden worden (i.p.v. ze stilletjes over te slaan). */
function meldMislukteJaren(urls, bron = 'PDOK') {
  const jaren = [...new Set((urls || []).map(u => (String(u).match(/\b20\d{2}\b/) || [])[0]).filter(Boolean))].sort();
  if (!jaren.length) return;
  window.multiLoaderState.mislukteJaren = [...new Set([...(window.multiLoaderState.mislukteJaren || []), ...jaren])].sort();
  window.toonMelding?.(`${bron}-data voor ${jaren.join(', ')} kon niet geladen worden. Ververs de pagina om het opnieuw te proberen.`, 12000);
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
      for (let y = MULTI_LOADER_CONFIG.pdokMinYear; y <= MULTI_LOADER_CONFIG.pdokMaxYear; y++) {
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
 * Na het laden worden de jaren 2013–2021 uit CBS StatLine toegevoegd en worden de standaard bronregels verwijderd.
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

    const mislukt = [];
    const results = await metMaxGelijktijdig(geoJsonUrls, FETCH_CONFIG.maxGelijktijdig, url =>
      fetchJsonMetRetry(url).catch(err => { console.warn(`Fout bij laden ${url}:`, err); mislukt.push(url); return null; })
    );
    meldMislukteJaren(mislukt);

    const collections = results
      .filter(Boolean)
      .map(r => {
        // PDOK OGC API gebruikt `items`, standaard GeoJSON gebruikt `features`
        if (!r.features && Array.isArray(r.items)) return { type: 'FeatureCollection', features: r.items };
        return r;
      })
      .filter(fc => Array.isArray(fc?.features));

    if (!collections.length) { alert("Geen geldige GeoJSON data ontvangen van de API's"); return; }

    // Wijken worden alleen grenslijnen en wijknamen; de kaartkleuren gaan over buurten.
    // (Samengevoegd lagen de wijkvlakken gekleurd onder de buurten en telden ze mee in de legenda.)
    const isWijkLaag = (fc) => fc.features.some(f => f.properties?.wijknaam && !f.properties?.buurtnaam);
    const wijkLagen  = collections.filter(isWijkLaag);
    const buurtLagen = collections.filter(fc => !isWijkLaag(fc));
    if (wijkLagen.length && buurtLagen.length) {
      window.multiLoaderState.wijkenFC = wijkLagen[0];
      buurtLagen.forEach(fc => addWijkenToBuurten(fc, wijkLagen[0]));
    }

    verwerkGeladen(mergeFeatureCollections(buurtLagen.length ? buurtLagen : collections));

    // Vul de jaren vóór 2022 aan met CBS StatLine (2013–2021).
    await laadEnKoppelCbs();
    verwijderStandaardApiBronnen();

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
// TIJDLIJN — Onderin de kaart: twee ▼-schuifjes kiezen de periode, het
// bolletje (#year-slider) is het getoonde jaar
// ============================================================================

const tijdlijn = {
  baan:   () => document.getElementById('tijdlijn-baan'),
  jaar:   () => document.getElementById('year-slider'),
  start:  () => document.getElementById('year-start'),
  eind:   () => document.getElementById('year-end'),
  ticks:  () => document.getElementById('year-ticks'),
};

/** Initialiseer de tijdlijn op basis van de beschikbare jaren in de data; de periode beslaat alle jaren. */
function updateYearSlider(fc) {
  const jaarRange = getYearRange(fc);
  if (!jaarRange || !tijdlijn.jaar()) return;

  const alleJaren = getAvailableYears(fc).filter(
    j => j >= MULTI_LOADER_CONFIG.minYear && j <= MULTI_LOADER_CONFIG.maxYear
  );
  const jaren = alleJaren.length > 0 ? alleJaren : [
    Math.max(jaarRange.min, MULTI_LOADER_CONFIG.minYear),
    Math.min(jaarRange.max, MULTI_LOADER_CONFIG.maxYear),
  ].filter(Number.isFinite);
  window.multiLoaderState.availableYears = jaren;

  [tijdlijn.jaar(), tijdlijn.start(), tijdlijn.eind()].forEach(input => {
    Object.assign(input, { min: String(jaren[0]), max: String(jaren.at(-1)), step: '1' });
  });
  tijdlijn.start().value = String(jaren[0]);
  tijdlijn.eind().value  = String(jaren.at(-1));
  tijdlijn.jaar().value  = String(jaren.includes(2024) ? 2024 : jaren.at(-1));

  renderYearTicks(jaren);
  updateYearDisplay();
}

/** Gekozen periode als { start, eind }, gesnapt naar beschikbare jaren. */
function haalPeriode() {
  return {
    start: snapYearToAvailableYear(parseInt(tijdlijn.start()?.value, 10)),
    eind:  snapYearToAvailableYear(parseInt(tijdlijn.eind()?.value, 10)),
  };
}

/** Plaats van een jaar op de baan, van 0 (eerste jaar) tot 1 (laatste jaar). */
function positieOpBaan(jaar) {
  const min = parseInt(tijdlijn.jaar().min, 10);
  const max = parseInt(tijdlijn.jaar().max, 10);
  return max > min ? (jaar - min) / (max - min) : 0;
}

/**
 * Teken streepjes en jaartallen onder de baan. Past niet elk jaartal, dan worden
 * labels uitgedund (het laatste jaar blijft altijd staan). Tekent opnieuw bij een
 * andere breedte.
 */
const MIN_LABEL_BREEDTE_PX = 34; // ruimte voor een volledig jaartal (2013), incl. marge

function renderYearTicks(jaren) {
  const container = tijdlijn.ticks();
  if (!container || !jaren?.length) return;

  container._jaren = jaren;
  const span      = Math.max(jaren.at(-1) - jaren[0], 1);
  const pxPerJaar = container.clientWidth ? container.clientWidth / span : MIN_LABEL_BREEDTE_PX;
  const labelStap = Math.max(1, Math.ceil(MIN_LABEL_BREEDTE_PX / pxPerJaar));
  const laatste   = jaren.length - 1;

  container.innerHTML = jaren.map((jaar, i) => {
    const toonLabel = (laatste - i) % labelStap === 0 || (i === 0 && (laatste % labelStap) >= labelStap / 2);
    const left = `${positieOpBaan(jaar) * 100}%`;
    return `<span class="year-tick" data-year="${jaar}" style="left:${left}"></span>
            <span class="year-tick-label" data-year="${jaar}" style="left:${left}">${toonLabel ? jaar : ''}</span>`;
  }).join('');

  werkTijdlijnBij();

  if (!container._resizeObserver && typeof ResizeObserver !== 'undefined') {
    let vorigeBreedte = container.clientWidth;
    container._resizeObserver = new ResizeObserver(() => {
      if (Math.abs(container.clientWidth - vorigeBreedte) < 4) return;
      vorigeBreedte = container.clientWidth;
      renderYearTicks(container._jaren);
    });
    container._resizeObserver.observe(container);
  }
}

/** Werk de gekleurde periode, de streepjes en de jaartallen bij. */
function werkTijdlijnBij() {
  const baan = tijdlijn.baan();
  if (!baan) return;
  const { start, eind } = haalPeriode();
  const huidig = snapYearToAvailableYear(parseInt(tijdlijn.jaar().value, 10));

  baan.style.setProperty('--start', positieOpBaan(start));
  baan.style.setProperty('--eind', positieOpBaan(eind));
  baan.querySelectorAll('[data-year]').forEach(el => {
    const jaar = Number(el.dataset.year);
    el.classList.toggle('is-active', jaar === huidig);
    el.classList.toggle('is-buiten', jaar < start || jaar > eind);
  });
}

/** Snap een jaar naar het dichtstbijzijnde beschikbare jaar. */
function snapYearToAvailableYear(jaar) {
  const jaren = window.multiLoaderState.availableYears || [];
  if (!Number.isFinite(jaar) || !jaren.length) return Number.isFinite(jaar) ? jaar : null;
  return jaren.reduce((best, k) => Math.abs(k - jaar) < Math.abs(best - jaar) ? k : best, jaren[0]);
}

/** Lees het getoonde jaar, snap naar een beschikbaar jaar en pas het filter toe. */
function updateYearDisplay() {
  const slider  = tijdlijn.jaar();
  const display = document.getElementById('year-display');
  if (!slider || !display) return;

  const huidigJaar = snapYearToAvailableYear(parseInt(slider.value, 10));
  if (huidigJaar !== null && String(huidigJaar) !== slider.value) slider.value = String(huidigJaar);

  display.textContent = huidigJaar === null ? 'Alle jaren' : String(huidigJaar);
  werkTijdlijnBij();
  if (huidigJaar !== null) applyYearFilter(huidigJaar);
}

/** Houd het getoonde jaar binnen de gekozen periode. */
function houdJaarInPeriode() {
  const { start, eind } = haalPeriode();
  const slider = tijdlijn.jaar();
  slider.value = String(Math.min(Math.max(parseInt(slider.value, 10), start), eind));
}

/** Een periode-schuifje mag niet voorbij het andere; het getoonde jaar schuift zo nodig mee. */
function opPeriodeGewijzigd(e) {
  const { start, eind } = haalPeriode();
  if (start > eind) e.target.value = String(e.target === tijdlijn.start() ? eind : start);
  e.target.value = String(snapYearToAvailableYear(parseInt(e.target.value, 10)));

  const voor = tijdlijn.jaar().value;
  houdJaarInPeriode();
  if (tijdlijn.jaar().value !== voor) updateYearDisplay();
  else werkTijdlijnBij();
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
// JAAR-ANIMATIE — Automatisch afspelen door de gekozen periode
// ============================================================================

const YEAR_PLAY_CONFIG = { stepDelayMs: 1200 }; // tijd tussen twee jaren tijdens afspelen

window.multiLoaderState.yearPlayTimer = window.multiLoaderState.yearPlayTimer || null;

function toggleYearPlay() {
  window.multiLoaderState.yearPlayTimer ? stopYearPlay() : startYearPlay();
}

/** Loop elke `stepDelayMs` naar het volgende jaar binnen de periode; na het laatste begint hij opnieuw. */
function startYearPlay() {
  const slider = tijdlijn.jaar();
  const knop = document.getElementById('year-play-toggle');
  const jarenInPeriode = () => {
    const { start, eind } = haalPeriode();
    return (window.multiLoaderState.availableYears || []).filter(j => j >= start && j <= eind);
  };
  if (!slider || jarenInPeriode().length < 2) return;

  const stap = (vanafBegin) => {
    const jaren = jarenInPeriode();
    const idx = jaren.indexOf(snapYearToAvailableYear(parseInt(slider.value, 10)));
    slider.value = String(vanafBegin || idx === -1 || idx >= jaren.length - 1 ? jaren[0] : jaren[idx + 1]);
    updateYearDisplay();
  };

  // Staat het jaar buiten de periode of aan het eind, dan beginnen we vooraan
  const jaren = jarenInPeriode();
  if (!jaren.slice(0, -1).includes(snapYearToAvailableYear(parseInt(slider.value, 10)))) stap(true);

  window.multiLoaderState.yearPlayTimer = setInterval(() => stap(false), YEAR_PLAY_CONFIG.stepDelayMs);
  if (knop) { knop.innerHTML = '&#10074;&#10074;'; knop.setAttribute('aria-pressed', 'true'); knop.title = 'Afspelen stoppen'; }
}

function stopYearPlay() {
  if (window.multiLoaderState.yearPlayTimer) clearInterval(window.multiLoaderState.yearPlayTimer);
  window.multiLoaderState.yearPlayTimer = null;

  const knop = document.getElementById('year-play-toggle');
  if (knop) { knop.innerHTML = '&#9654;'; knop.setAttribute('aria-pressed', 'false'); knop.title = 'Afspelen door de gekozen periode'; }
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
  document.getElementById('year-play-toggle')?.addEventListener('click',     toggleYearPlay);
  document.getElementById('year-start')?.addEventListener('input',           opPeriodeGewijzigd);
  document.getElementById('year-end')?.addEventListener('input',             opPeriodeGewijzigd);
  document.getElementById('year-slider')?.addEventListener('pointerdown',    stopYearPlay); // handmatig schuiven stopt de animatie
  document.getElementById('year-slider')?.addEventListener('input', (e) => {
    // Alleen de gebruiker zelf blijft binnen de periode; stories mogen elk jaar tonen
    if (e.isTrusted) houdJaarInPeriode();
    updateYearDisplay();
  });

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
  fetchJsonMetRetry,
  metMaxGelijktijdig,
  meldMislukteJaren,
  loadMultipleFiles,
  loadAllAPIs,
  laadEnKoppelCbs,
  applyYearFilter,
  getYearFromFeature,
  getYearRange,
  getAvailableYears,
  mergeFeatureCollections,
  filterFeaturesByYear,
});