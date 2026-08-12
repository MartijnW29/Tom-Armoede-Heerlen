// ============================================================================
// d3_charts.js — Heerlen Opportunity Atlas
// Vergelijkmodus: D3.js histogrammen voor twee datasets naast elkaar
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de grafiekinstellingen aan
// ============================================================================

const CHARTS_CONFIG = {

  // --- Grafiek-afmetingen (pixels) ---
  breedte: 300,
  hoogte:  200,

  // --- SVG-marges (ruimte voor assen en labels) ---
  marge: {
    boven:  20,
    rechts: 10,
    onder:  30,
    links:  30,
  },

  // --- Histogram ---
  aantalBakken: 15,           // Aantal kolommen in het histogram

  // --- Vergelijkmodus-kleuren ---
  kleurDatasetA: '#4c78a8',   // Blauw  — eerste dataset
  kleurDatasetB: '#e45756',   // Rood   — tweede dataset
};


// ============================================================================
// HULPFUNCTIES
// ============================================================================

/**
 * Controleert of een waarde bruikbaar numeriek is (geen null, undefined of NaN).
 */
function isNumeriekeWaarde(v) {
  return v !== null && v !== undefined && !isNaN(+v);
}

/**
 * Geeft alle veldnamen terug die numerieke waarden bevatten.
 * Controleert de eerste 20 features om snel te scannen zonder de hele dataset te lopen.
 * @param {GeoJSON.FeatureCollection} fc
 * @returns {string[]}
 */
function vindNumeriekeVelden(fc) {
  if (!fc?.features?.length) return [];

  return Object.keys(fc.features[0]?.properties || {}).filter(veld => {
    for (let i = 0; i < Math.min(20, fc.features.length); i++) {
      const v = fc.features[i]?.properties?.[veld];
      if (v === null || v === undefined) continue;
      return isNumeriekeWaarde(v);
    }
    return false;
  });
}

/**
 * Haalt alle numerieke waarden op voor een veld en past het actieve filter toe.
 * Het filter (min/max/percentiel) wordt gelezen uit window.appData.filter (ingesteld in app.js).
 * @param {GeoJSON.FeatureCollection} fc
 * @param {string} veld
 * @returns {number[]}
 */
function haalWaarden(fc, veld) {
  const alle = fc.features
    .map(f => { const v = f.properties?.[veld]; return isNumeriekeWaarde(v) ? +v : null; })
    .filter(v => v !== null);

  const filter = window.appData?.filter || null;
  if (!filter) return alle;

  // Bereken percentielen voor lowPct/highPct-filter
  const gesorteerd = alle.slice().sort((a, b) => a - b);
  const onderWaarde = gesorteerd[Math.max(0, Math.floor((filter.lowPct  || 0)   / 100 * (gesorteerd.length - 1)))];
  const bovenWaarde = gesorteerd[Math.min(gesorteerd.length - 1, Math.floor((filter.highPct || 100) / 100 * (gesorteerd.length - 1)))];

  return alle.filter(v => {
    if (typeof filter.min    === 'number' && v < filter.min)    return false;
    if (typeof filter.max    === 'number' && v > filter.max)    return false;
    if (typeof filter.lowPct === 'number' && v < onderWaarde)  return false;
    if (typeof filter.highPct === 'number' && v > bovenWaarde) return false;
    return true;
  });
}


// ============================================================================
// UI-HULPFUNCTIES
// ============================================================================

/** Wist alle grafieken uit de charts-container */
function wisGrafieken() {
  const container = document.getElementById('charts');
  if (container) container.innerHTML = '';
}

/**
 * Vult de veldselectoren in de sidebar met numerieke velden uit de geladen dataset.
 * De daadwerkelijke selector-rendering wordt afgehandeld door initFieldSelectors (app.js).
 * @param {GeoJSON.FeatureCollection} fc
 */
window.populateFieldSelect = function (fc) {
  if (!fc?.features?.length) return;
  const numeriekeVelden = vindNumeriekeVelden(fc);
  window.availableFields = numeriekeVelden;
  window.herstelAangemaakteVariabelen?.(); // eerder gemaakte (cookie-opgeslagen) variabelen terugzetten
  window.initFieldSelectors?.(window.availableFields);
};


// ============================================================================
// VERGELIJKMODUS — Twee histogrammen naast elkaar
// ============================================================================

/**
 * Tekent één D3-histogram in de opgegeven container.
 * Gebruikt bin-schaling: x-as op waardebereik, y-as op aantal per bak.
 * @param {number[]}    waarden   - Numerieke waarden voor dit histogram
 * @param {string}      label     - Onderschrift onder de grafiek
 * @param {string}      kleur     - Vulkleur van de balken (hex)
 * @param {HTMLElement} container - Parent-element waar het histogram in wordt geplaatst
 */
function tekenHistogram(waarden, label, kleur, container) {
  if (!waarden?.length) return;

  const div = document.createElement('div');
  container.appendChild(div);

  const { breedte: w, hoogte: h, marge: m, aantalBakken } = CHARTS_CONFIG;

  const svg = d3.select(div).append('svg').attr('width', w).attr('height', h);

  // X-schaal: lineair over het waardebereik
  const xSchaal = d3.scaleLinear()
    .domain(d3.extent(waarden)).nice()
    .range([m.links, w - m.rechts]);

  // Verdeel waarden in bakken (bins)
  const bakken = d3.bin().domain(xSchaal.domain()).thresholds(aantalBakken)(waarden);

  // Y-schaal: aantal items per bak
  const ySchaal = d3.scaleLinear()
    .domain([0, d3.max(bakken, d => d.length)])
    .range([h - m.onder, m.boven]);

  // Teken histogram-balken
  svg.append('g').attr('fill', kleur)
    .selectAll('rect').data(bakken).join('rect')
    .attr('x',      d => xSchaal(d.x0) + 1)
    .attr('y',      d => ySchaal(d.length))
    .attr('width',  d => Math.max(0, xSchaal(d.x1) - xSchaal(d.x0) - 1))
    .attr('height', d => ySchaal(0) - ySchaal(d.length));

  // X-as onderin
  svg.append('g')
    .attr('transform', `translate(0,${h - m.onder})`)
    .call(d3.axisBottom(xSchaal).ticks(4));

  // Y-as links
  svg.append('g')
    .attr('transform', `translate(${m.links},0)`)
    .call(d3.axisLeft(ySchaal).ticks(4));

  // Label onder de grafiek
  const labelEl = document.createElement('div');
  labelEl.textContent = label;
  Object.assign(labelEl.style, { textAlign: 'center', marginTop: '8px', fontSize: '12px', fontWeight: 'bold' });
  div.appendChild(labelEl);
}

/**
 * Rendert twee vergelijkende histogrammen naast elkaar voor hetzelfde veld.
 * Geeft een foutmelding als één van de datasets geen bruikbare waarden heeft.
 * @param {GeoJSON.FeatureCollection} fcA - Eerste dataset
 * @param {GeoJSON.FeatureCollection} fcB - Tweede dataset
 * @param {string}                    veld - Veldnaam om te vergelijken
 */
window.createCompareCharts = function (fcA, fcB, veld) {
  wisGrafieken();

  const waardenA = haalWaarden(fcA, veld);
  const waardenB = haalWaarden(fcB, veld);

  if (!waardenA.length || !waardenB.length) {
    alert(`Geen numerieke waarden gevonden voor veld "${veld}" in één van de datasets.`);
    return;
  }

  const container = document.getElementById('charts');
  if (!container) return;

  const titel = document.createElement('h3');
  titel.textContent = `Vergelijkmodus — ${window.mooieVeldnaam ? window.mooieVeldnaam(veld) : veld}`;
  container.appendChild(titel);

  const wrapper = document.createElement('div');
  Object.assign(wrapper.style, { display: 'flex', gap: '12px', justifyContent: 'center' });
  container.appendChild(wrapper);

  tekenHistogram(waardenA, 'Dataset A', CHARTS_CONFIG.kleurDatasetA, wrapper);
  tekenHistogram(waardenB, 'Dataset B', CHARTS_CONFIG.kleurDatasetB, wrapper);
};


// ============================================================================
// HULPTEKST
// ============================================================================

/** Geeft een korte gebruikersinstructie terug (voor tooltips of helpvensters) */
window.d3ChartsHelp = function () {
  return 'Selecteer een numerieke variabele in het menu om te visualiseren. ' +
    'Voor vergelijkmodus: klik "Start vergelijking" en upload daarna het tweede bestand.';
};