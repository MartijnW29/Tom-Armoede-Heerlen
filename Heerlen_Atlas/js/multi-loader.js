// ============================================================================
// MULTI-LOADER.JS — Heerlen Opportunity Atlas
// Data laden (PDOK, CBS StatLine, eigen bestanden) en de tijdlijn onderin de kaart
// ============================================================================


// ============================================================================
// CONFIGURATIE
// ============================================================================

const MULTI_LOADER_CONFIG = {
  // Jaren op de tijdlijn; 2013–2021 komen uit CBS StatLine (cbs-historie.js)
  minYear:       2013,
  maxYear:       2050,
  standaardJaar: 2024,

  // De PDOK OGC API (kaartvormen + cijfers) bestaat alleen voor deze jaren
  pdokMinYear: 2022,
  pdokMaxYear: 2025,

  yearFields:    ['jaar', 'year', 'Jaar', 'Year', 'JAAR'],  // in volgorde van voorkeur
  afspeelStapMs: 1200,                                       // tijd per jaar tijdens afspelen
};

// PDOK-antwoorden zijn groot (~1 MB per jaar): alles tegelijk opvragen mislukt soms
// (time-out, 429/5xx). Daarom een paar verzoeken tegelijk en bij een fout opnieuw proberen.
const FETCH_CONFIG = { maxGelijktijdig: 3, pogingen: 4, wachtMs: 700 };

window.multiLoaderState = {
  originalData:   null,  // alle jaren samen
  yearFilter:     null,  // getoonde jaar
  availableYears: [],
  wijkenFC:       null,  // wijkgrenzen (alleen lijnen en wijknamen)
  yearPlayTimer:  null,
};


// ============================================================================
// JAREN EN DATASETS
// ============================================================================

function getYearFromFeature(feature) {
  const props = feature?.properties;
  const veld = props && MULTI_LOADER_CONFIG.yearFields.find(v => v in props);
  const jaar = veld ? parseInt(props[veld], 10) : NaN;
  return isNaN(jaar) ? null : jaar;
}

function getAvailableYears(fc) {
  return [...new Set((fc?.features || []).map(getYearFromFeature).filter(Number.isFinite))].sort((a, b) => a - b);
}

function mergeFeatureCollections(collections) {
  return { type: 'FeatureCollection', features: collections.flatMap(fc => fc?.features || []) };
}

/** Features van één jaar; features zonder jaar horen bij elk jaar. */
function filterFeaturesByYear(fc, jaar) {
  if (!jaar || !fc?.features) return fc;
  return { type: 'FeatureCollection', features: fc.features.filter(f => [jaar, null].includes(getYearFromFeature(f))) };
}


// ============================================================================
// WIJKEN BIJ BUURTEN — Welke wijk hoort bij een buurt (zwaartepunt in wijkvlak)
// ============================================================================

/** Gemiddelde van de buitenring-punten: een snelle benadering van het zwaartepunt. */
function getFeatureCentroid(feature) {
  const geom = feature?.geometry;
  const ringen = geom?.type === 'Polygon' ? [geom.coordinates[0]]
    : geom?.type === 'MultiPolygon' ? geom.coordinates.map(p => p[0]) : [];
  const punten = ringen.flat().filter(Boolean);
  if (!punten.length) return null;
  return [0, 1].map(as => punten.reduce((som, p) => som + p[as], 0) / punten.length);
}

/** Ray-casting: een oneven aantal kruisingen betekent dat het punt binnen de ring ligt. */
function pointInRing([x, y], ring) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

function pointInGeometry(punt, geom) {
  if (geom?.type === 'Polygon')      return pointInRing(punt, geom.coordinates[0]);
  if (geom?.type === 'MultiPolygon') return geom.coordinates.some(p => pointInRing(punt, p[0]));
  return false;
}

/** Schrijf per buurt de namen van de wijk(en) waarin het zwaartepunt valt naar `overlapping_wijken`. */
function addWijkenToBuurten(buurtenFC, wijkenFC) {
  for (const buurt of buurtenFC?.features || []) {
    const midden = getFeatureCentroid(buurt);
    if (!midden) continue;
    const namen = (wijkenFC?.features || [])
      .filter(wijk => pointInGeometry(midden, wijk.geometry))
      .map(({ properties: p = {} }) => p.wijknaam || p.naam || p.name || p.buurtnaam || p.buurt || p.code)
      .filter(Boolean);
    (buurt.properties ??= {}).overlapping_wijken = [...new Set(namen)];
  }
}


// ============================================================================
// OPHALEN — Beperkt tegelijk en opnieuw proberen bij een fout
// ============================================================================

/** Haal JSON op; bij een netwerkfout, 429 of 5xx opnieuw met oplopende wachttijd. */
async function fetchJsonMetRetry(url) {
  let laatsteFout;
  for (let poging = 1; poging <= FETCH_CONFIG.pogingen; poging++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      // Andere 4xx-fouten zijn definitief: dat jaar bestaat niet
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

/** Voer taken uit met hoogstens `limiet` tegelijk; de resultaten houden de volgorde van `items`. */
async function metMaxGelijktijdig(items, limiet, taak) {
  const resultaten = new Array(items.length);
  let volgende = 0;
  const werker = async () => {
    while (volgende < items.length) {
      const i = volgende++;
      resultaten[i] = await taak(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limiet, items.length) }, werker));
  return resultaten;
}

/** Meld jaren die niet geladen konden worden (in plaats van ze stilletjes over te slaan). */
function meldMislukteJaren(urlsOfJaren, bron = 'PDOK') {
  const jaren = [...new Set(urlsOfJaren.map(u => String(u).match(/\b20\d{2}\b/)?.[0]).filter(Boolean))].sort();
  if (jaren.length) {
    window.toonMelding(`${bron}-data voor ${jaren.join(', ')} kon niet geladen worden. Ververs de pagina om het opnieuw te proberen.`, 12000);
  }
}


// ============================================================================
// LADEN — PDOK-API's, CBS StatLine en eigen bestanden
// ============================================================================

/** Een URL met een jaartal (bijv. wijken-en-buurten-2024) wordt één URL per PDOK-jaar. */
function expandUrlsForYearRange(urls) {
  const { pdokMinYear, pdokMaxYear } = MULTI_LOADER_CONFIG;
  return [...new Set(urls.flatMap(url => {
    const jaar = url.match(/\b20\d{2}\b/)?.[0];
    if (!jaar) return [url];
    return Array.from({ length: pdokMaxYear - pdokMinYear + 1 }, (_, i) => url.replace(jaar, String(pdokMinYear + i)));
  }))];
}

/** Laad alle API-URL's, koppel wijken aan buurten en vul daarna de oudere jaren aan uit CBS. */
async function loadAllAPIs() {
  const urls = [...document.querySelectorAll('.api-url-input')].map(i => i.value.trim()).filter(Boolean);
  if (!urls.length) { alert('Voer minstens één API-URL in'); return; }

  // CBS OData geeft geen GeoJSON; die cijfers komen via laadEnKoppelCbs()
  const geoJsonUrls = expandUrlsForYearRange(urls).filter(u => !u.includes('opendata.cbs.nl'));
  if (!geoJsonUrls.length) { alert('Gebruik de knop "CBS kerncijfers laden" om CBS-cijfers te koppelen.'); return; }

  try {
    const mislukt = [];
    const antwoorden = await metMaxGelijktijdig(geoJsonUrls, FETCH_CONFIG.maxGelijktijdig, url =>
      fetchJsonMetRetry(url).catch(err => { console.warn(`Fout bij laden ${url}:`, err); mislukt.push(url); return null; }));
    meldMislukteJaren(mislukt);

    // PDOK OGC API geeft `items`, gewone GeoJSON `features`
    const collections = antwoorden
      .map(r => r && !r.features && Array.isArray(r.items) ? { type: 'FeatureCollection', features: r.items } : r)
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
    await laadEnKoppelCbs();
    verwijderStandaardApiBronnen();
  } catch (err) {
    console.error('Fout bij multi-API loading:', err);
    alert("Fout bij laden van API's: " + err.message);
  }
}

/** Vul de jaren vóór 2022 aan uit CBS StatLine; de knoptekst laat zien hoe het ging. */
async function laadEnKoppelCbs() {
  const knop = document.getElementById('load-cbs-data');
  const fc = window.multiLoaderState.originalData;
  if (!fc) { alert('Laad eerst de PDOK-buurten voordat CBS-data gekoppeld kan worden.'); return; }

  knop.dataset.origTekst ??= knop.textContent;
  Object.assign(knop, { disabled: true, textContent: 'CBS data laden…' });
  try {
    const aantal = await window.laadCbsHistorie(fc);
    if (aantal) {
      window.vulAangemaakteVariabelenAan(fc);
      updateYearSlider(fc);
      window.populateFieldSelect(fc);
      window.dispatchEvent(new Event('atlas:data-geladen'));
    }
    knop.textContent = aantal ? `✓ CBS-jaren toegevoegd (${aantal})` : 'Geen extra CBS-jaren nodig';
  } catch (err) {
    console.error('CBS laden mislukt:', err);
    alert('Fout bij laden CBS-data: ' + err.message);
    Object.assign(knop, { disabled: false, textContent: knop.dataset.origTekst });
  }
}

/** Laad de gekozen lokale bestanden (GeoJSON en CSV) als één dataset. */
async function loadMultipleFiles() {
  const bestanden = [...document.getElementById('multi-file-input').files];
  if (!bestanden.length) { alert('Selecteer minstens één bestand'); return; }

  const collections = [];
  for (const bestand of bestanden) {
    try {
      const tekst = await bestand.text();
      const naam = bestand.name.toLowerCase();
      if (/\.(geo)?json$/.test(naam)) {
        const fc = JSON.parse(tekst);
        if (fc.type === 'FeatureCollection' && fc.features) collections.push(fc);
      } else if (/\.(csv|txt)$/.test(naam)) {
        const features = window.parseCSV(tekst);
        if (features.length) collections.push({ type: 'FeatureCollection', features });
      }
    } catch (err) {
      console.warn(`Kon bestand ${bestand.name} niet verwerken:`, err);
    }
  }

  if (collections.length) verwerkGeladen(mergeFeatureCollections(collections));
  else alert('Geen geldige data gevonden in geselecteerde bestanden');
}

/** Sla een nieuwe dataset op, toon hem als grijze laag, en bouw tijdlijn en variabelen op. */
function verwerkGeladen(fc) {
  const { appData } = window;
  window.multiLoaderState.originalData = fc;
  appData.lastFC = fc;

  ['baseGeoLayer', 'choroplethLayer'].forEach(sleutel => {
    if (appData[sleutel]) appData.dataLayer.removeLayer(appData[sleutel]);
    appData[sleutel] = null;
  });
  appData.baseGeoLayer = L.geoJSON(fc, { style: { color: '#888', weight: 1, fillOpacity: 0.3 } }).addTo(appData.dataLayer);
  window.bringSmallPolygonsToFront(appData.dataLayer);
  try { appData.map.fitBounds(appData.baseGeoLayer.getBounds(), { maxZoom: 14 }); } catch (_) { /* lege laag */ }

  updateYearSlider(fc);
  window.populateFieldSelect(fc);
  window.dispatchEvent(new Event('atlas:data-geladen'));
}


// ============================================================================
// DATABRONNEN-PANEEL — Extra API-URL's en bestandslijst
// ============================================================================

/** Na het laden verdwijnen de standaard PDOK-regels uit de lijst; dat houdt het paneel rustig. */
function verwijderStandaardApiBronnen() {
  document.querySelectorAll('.api-url-item[data-api^="pdok-"]').forEach(item => item.remove());
  werkVerwijderKnoppenBij();
}

function addApiUrlInput() {
  const lijst = document.getElementById('api-urls-list');
  const item = maak('div', { className: 'api-url-item' });
  const verwijder = maak('button', { type: 'button', className: 'rij-verwijder', innerHTML: ICONEN.prullenbak, title: 'Verwijderen' });
  verwijder.addEventListener('click', () => { item.remove(); werkVerwijderKnoppenBij(); });
  item.append(maak('input', { type: 'text', className: 'api-url-input', placeholder: `API URL ${lijst.children.length + 1}` }), verwijder);
  lijst.appendChild(item);
  werkVerwijderKnoppenBij();
}

/** Er blijft altijd minstens één URL-regel over. */
function werkVerwijderKnoppenBij() {
  const items = document.querySelectorAll('.api-url-item');
  items.forEach(item => { const knop = item.querySelector('.rij-verwijder'); if (knop) knop.style.display = items.length < 2 ? 'none' : ''; });
}

function toonBestandenlijst() {
  const bestanden = [...document.getElementById('multi-file-input').files];
  document.getElementById('file-list').replaceChildren(...bestanden.map((bestand, i) =>
    maak('div', { className: 'file-list-item', textContent: `${i + 1}. ${bestand.name}` })));
}


// ============================================================================
// TIJDLIJN — Onderin de kaart: twee ▼-schuifjes kiezen de periode, het
// bolletje (#year-slider) is het getoonde jaar
// ============================================================================

const tijdlijnBaan  = document.getElementById('tijdlijn-baan');
const jaarSlider    = document.getElementById('year-slider');
const startSchuif   = document.getElementById('year-start');
const eindSchuif    = document.getElementById('year-end');
const jaarTicks     = document.getElementById('year-ticks');
const afspeelKnop   = document.getElementById('year-play-toggle');
const MIN_LABEL_BREEDTE_PX = 34;  // ruimte voor een jaartal, inclusief marge

const leesJaar = (input) => snapYearToAvailableYear(parseInt(input.value, 10));

/** Tijdlijn opnieuw opbouwen voor de jaren in de data; de periode beslaat alle jaren. */
function updateYearSlider(fc) {
  const { minYear, maxYear, standaardJaar } = MULTI_LOADER_CONFIG;
  const jaren = getAvailableYears(fc).filter(j => j >= minYear && j <= maxYear);
  if (!jaren.length) return;
  window.multiLoaderState.availableYears = jaren;

  [jaarSlider, startSchuif, eindSchuif].forEach(input => Object.assign(input, { min: jaren[0], max: jaren.at(-1), step: 1 }));
  startSchuif.value = jaren[0];
  eindSchuif.value  = jaren.at(-1);
  jaarSlider.value  = jaren.includes(standaardJaar) ? standaardJaar : jaren.at(-1);

  renderYearTicks(jaren);
  updateYearDisplay();
}

/** Het dichtstbijzijnde jaar waarvoor data is. */
function snapYearToAvailableYear(jaar) {
  const jaren = window.multiLoaderState.availableYears;
  if (!Number.isFinite(jaar) || !jaren.length) return Number.isFinite(jaar) ? jaar : null;
  return jaren.reduce((best, j) => Math.abs(j - jaar) < Math.abs(best - jaar) ? j : best);
}

const haalPeriode = () => ({ start: leesJaar(startSchuif), eind: leesJaar(eindSchuif) });

/** Plaats van een jaar op de baan, van 0 (eerste jaar) tot 1 (laatste jaar). */
function positieOpBaan(jaar) {
  const min = Number(jaarSlider.min), max = Number(jaarSlider.max);
  return max > min ? (jaar - min) / (max - min) : 0;
}

/** Streepjes en jaartallen onder de baan; past niet elk jaartal, dan wordt uitgedund (het laatste blijft staan). */
function renderYearTicks(jaren) {
  const span      = Math.max(jaren.at(-1) - jaren[0], 1);
  const pxPerJaar = jaarTicks.clientWidth ? jaarTicks.clientWidth / span : MIN_LABEL_BREEDTE_PX;
  const labelStap = Math.max(1, Math.ceil(MIN_LABEL_BREEDTE_PX / pxPerJaar));
  const laatste   = jaren.length - 1;

  jaarTicks.innerHTML = jaren.map((jaar, i) => {
    const toonLabel = (laatste - i) % labelStap === 0 || (i === 0 && laatste % labelStap >= labelStap / 2);
    const stijl = `style="left:${positieOpBaan(jaar) * 100}%" data-year="${jaar}"`;
    return `<span class="year-tick" ${stijl}></span><span class="year-tick-label" ${stijl}>${toonLabel ? jaar : ''}</span>`;
  }).join('');
  werkTijdlijnBij();
}

// Opnieuw tekenen bij een andere breedte (zijbalk in-/uitklappen, venster, mobiel)
let vorigeTickBreedte = 0;
new ResizeObserver(() => {
  if (Math.abs(jaarTicks.clientWidth - vorigeTickBreedte) < 4 || !window.multiLoaderState.availableYears.length) return;
  vorigeTickBreedte = jaarTicks.clientWidth;
  renderYearTicks(window.multiLoaderState.availableYears);
}).observe(jaarTicks);

/** Gekleurde periode, actieve en vervaagde jaartallen bijwerken. */
function werkTijdlijnBij() {
  const { start, eind } = haalPeriode();
  const huidig = leesJaar(jaarSlider);
  tijdlijnBaan.style.setProperty('--start', positieOpBaan(start));
  tijdlijnBaan.style.setProperty('--eind', positieOpBaan(eind));
  tijdlijnBaan.querySelectorAll('[data-year]').forEach(el => {
    const jaar = Number(el.dataset.year);
    el.classList.toggle('is-active', jaar === huidig);
    el.classList.toggle('is-buiten', jaar < start || jaar > eind);
  });
  // Liggen beide schuifjes helemaal rechts, dan moet het begin-schuifje bovenop (anders zit het vast)
  startSchuif.style.zIndex = start === eind && positieOpBaan(eind) === 1 ? 3 : '';
}

/** Lees het getoonde jaar, snap naar een beschikbaar jaar en toon dat jaar op de kaart. */
function updateYearDisplay() {
  const jaar = leesJaar(jaarSlider);
  if (jaar !== null) jaarSlider.value = jaar;
  document.getElementById('year-display').textContent = jaar ?? 'Alle jaren';
  werkTijdlijnBij();
  if (jaar !== null) applyYearFilter(jaar);
}

function houdJaarInPeriode() {
  const { start, eind } = haalPeriode();
  jaarSlider.value = Math.min(Math.max(Number(jaarSlider.value), start), eind);
}

/** Een periode-schuifje mag niet voorbij het andere; het getoonde jaar schuift zo nodig mee. */
function opPeriodeGewijzigd({ target }) {
  const { start, eind } = haalPeriode();
  if (start > eind) target.value = target === startSchuif ? eind : start;
  target.value = leesJaar(target);

  const voor = jaarSlider.value;
  houdJaarInPeriode();
  jaarSlider.value !== voor ? updateYearDisplay() : werkTijdlijnBij();
}

/** Toon één jaar op de kaart. */
function applyYearFilter(jaar) {
  const alles = window.multiLoaderState.originalData || window.appData.lastFC;
  if (!alles) return;
  window.multiLoaderState.yearFilter = jaar;
  window.appData.lastFC = filterFeaturesByYear(alles, jaar);
  window.herlaadVisualisatie();
}


// ============================================================================
// AFSPELEN — Automatisch door de jaren van de gekozen periode
// ============================================================================

const toggleYearPlay = () => window.multiLoaderState.yearPlayTimer ? stopYearPlay() : startYearPlay();

/** Elke stap één jaar verder binnen de periode; na het laatste jaar begint hij opnieuw. */
function startYearPlay() {
  const jarenInPeriode = () => {
    const { start, eind } = haalPeriode();
    return window.multiLoaderState.availableYears.filter(j => j >= start && j <= eind);
  };
  if (jarenInPeriode().length < 2) return;

  const stap = (vanafBegin) => {
    const jaren = jarenInPeriode();
    const i = jaren.indexOf(leesJaar(jaarSlider));
    jaarSlider.value = vanafBegin || i === -1 || i === jaren.length - 1 ? jaren[0] : jaren[i + 1];
    updateYearDisplay();
  };

  // Staat het jaar buiten de periode of aan het eind, dan beginnen we vooraan
  if (!jarenInPeriode().slice(0, -1).includes(leesJaar(jaarSlider))) stap(true);

  window.multiLoaderState.yearPlayTimer = setInterval(() => stap(false), MULTI_LOADER_CONFIG.afspeelStapMs);
  Object.assign(afspeelKnop, { innerHTML: '&#10074;&#10074;', title: 'Afspelen stoppen' });
  afspeelKnop.setAttribute('aria-pressed', 'true');
}

function stopYearPlay() {
  clearInterval(window.multiLoaderState.yearPlayTimer);
  window.multiLoaderState.yearPlayTimer = null;
  Object.assign(afspeelKnop, { innerHTML: '&#9654;', title: 'Afspelen door de gekozen periode' });
  afspeelKnop.setAttribute('aria-pressed', 'false');
}


// ============================================================================
// INITIALISATIE
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('load-multiple-files').addEventListener('click', loadMultipleFiles);
  document.getElementById('multi-file-input').addEventListener('change', toonBestandenlijst);
  document.getElementById('add-api-url').addEventListener('click', addApiUrlInput);
  document.getElementById('load-all-apis').addEventListener('click', loadAllAPIs);
  document.getElementById('load-cbs-data').addEventListener('click', laadEnKoppelCbs);

  afspeelKnop.addEventListener('click', toggleYearPlay);
  startSchuif.addEventListener('input', opPeriodeGewijzigd);
  eindSchuif.addEventListener('input', opPeriodeGewijzigd);
  jaarSlider.addEventListener('pointerdown', stopYearPlay);  // zelf schuiven stopt het afspelen
  jaarSlider.addEventListener('input', (e) => {
    // Alleen de gebruiker zelf blijft binnen de periode; stories mogen elk jaar tonen
    if (e.isTrusted) houdJaarInPeriode();
    updateYearDisplay();
  });

  werkVerwijderKnoppenBij();
  loadAllAPIs();
});
