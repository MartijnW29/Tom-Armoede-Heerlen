// ============================================================================
// D3_CHARTS.JS — Heerlen Opportunity Atlas
// ============================================================================
// Bestand voor: Vergelijkmodus met D3.js histogrammen
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier aan voor je eigen project
// ============================================================================

const CHARTS_CONFIG = {
  // Grafiek-afmetingen
  grafiiekBreedte: 300,                  // Pixels
  grafiiekHoogte: 200,                   // Pixels
  
  // Marges (SVG padding)
  margeBovenaf: 20,
  margeRechts: 10,
  margeOnder: 30,
  margeLinks: 30,
  
  // Histogram-instellingen
  aantalBakken: 15,                      // Number of bins in histogram
  
  // Kleuren voor vergelijkmodus
  kleurDatasetA: '#4c78a8',              // Blauw
  kleurDatasetB: '#e45756',              // Rood
};

// ============================================================================
// HULPFUNCTIES — Basisoperaties
// ============================================================================

/**
 * Controleer of waarde numeriek is
 * @param {any} v
 * @return {boolean}
 */
function isNumeriekeWaarde(v) {
  return v !== null && v !== undefined && !isNaN(+v);
}

/**
 * Extract numerieke veldnamen uit FeatureCollection
 * @param {GeoJSON} fc
 * @return {Array} Veldnamen die numeriek zijn
 */
function vindtNumeriekeVelden(fc) {
  if (!fc || !fc.features || fc.features.length === 0) return [];
  
  const props = fc.features[0]?.properties || {};
  return Object.keys(props).filter(k => {
    // Check eerste 20 features om te bepalen of veld numeriek is
    for (let i = 0; i < Math.min(20, fc.features.length); i++) {
      const v = fc.features[i]?.properties?.[k];
      if (v === null || v === undefined) continue;
      return isNumeriekeWaarde(v);
    }
    return false;
  });
}

/**
 * Haal waarden uit FeatureCollection veld, pas filter toe
 * @param {GeoJSON} fc
 * @param {string} veld
 * @return {Array} Numerieke waarden (gefilterd)
 */
function haalWaarden(fc, veld) {
  // Extract alle numerieke waarden
  const alle = fc.features
    .map(f => {
      const v = f.properties?.[veld];
      return isNumeriekeWaarde(v) ? +v : null;
    })
    .filter(v => v !== null);
  
  // Pas actief filter toe (van app.js)
  const filter = window.appData?.filter || null;
  if (!filter) return alle;
  
  // Bewerkfilter logica tegen percentiles
  const gesorteerd = alle.slice().sort((a, b) => a - b);
  const onderIdx = Math.floor((filter.lowPct || 0) / 100 * (gesorteerd.length - 1));
  const bovenIdx = Math.floor((filter.highPct || 100) / 100 * (gesorteerd.length - 1));
  const onderWaarde = gesorteerd[Math.max(0, onderIdx)];
  const bovenWaarde = gesorteerd[Math.min(gesorteerd.length - 1, bovenIdx)];
  
  return alle.filter(v => {
    if (typeof filter.min === 'number' && v < filter.min) return false;
    if (typeof filter.max === 'number' && v > filter.max) return false;
    if (typeof filter.lowPct === 'number' && v < onderWaarde) return false;
    if (typeof filter.highPct === 'number' && v > bovenWaarde) return false;
    return true;
  });
}

// ============================================================================
// UI-FUNCTIES
// ============================================================================

/**
 * Vulveldenselectie-dropdown in sidebar
 * @param {GeoJSON} fc
 */
window.populateFieldSelect = function(fc) {
  // Provide available numeric fields to the app; rendering of selectors is
  // handled by the app logic so users can add/remove selectors dynamically.
  if (!fc || !fc.features || fc.features.length === 0) return;
  const numeriekeVelden = vindtNumeriekeVelden(fc);
  window.availableFields = numeriekeVelden;
  if (window.initFieldSelectors) window.initFieldSelectors(numeriekeVelden);

  // Selecteer standaardvariabele indien aanwezig
  // No forced addition here; app initialiser (initFieldSelectors) handles
  // creating default selectors. This avoids duplicated selectors.
};

/**
 * Wis alle grafieken uit charts-container
 */
function wisGrafieken() {
  const container = document.getElementById('charts');
  if (container) container.innerHTML = '';
}

// ============================================================================
// VERGELIJKMODUS
// ============================================================================

/**
 * Teken single histogram in gegeven container
 * @param {Array} waarden - Numerieke waarden
 * @param {string} label - Titel
 * @param {string} kleur - Hexkleur
 * @param {HTMLElement} container - Parent div
 */
function tekenHistogram(waarden, label, kleur, container) {
  if (!waarden || waarden.length === 0) return;
  
  const div = document.createElement('div');
  container.appendChild(div);
  
  const w = CHARTS_CONFIG.grafiiekBreedte;
  const h = CHARTS_CONFIG.grafiiekHoogte;
  const marge = {
    top: CHARTS_CONFIG.margeBovenaf,
    right: CHARTS_CONFIG.margeRechts,
    bottom: CHARTS_CONFIG.margeOnder,
    left: CHARTS_CONFIG.margeLinks
  };
  
  // Maak SVG
  const svg = d3.select(div)
    .append('svg')
    .attr('width', w)
    .attr('height', h);
  
  // Schalen
  const xSchaal = d3.scaleLinear()
    .domain(d3.extent(waarden))
    .nice()
    .range([marge.left, w - marge.right]);
  
  const bakken = d3.bin()
    .domain(xSchaal.domain())
    .thresholds(CHARTS_CONFIG.aantalBakken)(waarden);
  
  const ySchaal = d3.scaleLinear()
    .domain([0, d3.max(bakken, d => d.length)])
    .range([h - marge.bottom, marge.top]);
  
  // Teken balken
  svg.append('g')
    .attr('fill', kleur)
    .selectAll('rect')
    .data(bakken)
    .join('rect')
    .attr('x', d => xSchaal(d.x0) + 1)
    .attr('y', d => ySchaal(d.length))
    .attr('width', d => Math.max(0, xSchaal(d.x1) - xSchaal(d.x0) - 1))
    .attr('height', d => ySchaal(0) - ySchaal(d.length));
  
  // X-as
  svg.append('g')
    .attr('transform', `translate(0,${h - marge.bottom})`)
    .call(d3.axisBottom(xSchaal).ticks(4));
  
  // Y-as
  svg.append('g')
    .attr('transform', `translate(${marge.left},0)`)
    .call(d3.axisLeft(ySchaal).ticks(4));
  
  // Label onder grafiek
  const labelDiv = document.createElement('div');
  labelDiv.textContent = label;
  labelDiv.style.textAlign = 'center';
  labelDiv.style.marginTop = '8px';
  labelDiv.style.fontSize = '12px';
  labelDiv.style.fontWeight = 'bold';
  div.appendChild(labelDiv);
}

/**
 * Maak twee vergelijkende histogrammen naast elkaar
 * @param {GeoJSON} fcA - Dataset A
 * @param {GeoJSON} fcB - Dataset B
 * @param {string} veld - Veldnaam om te vergelijken
 */
window.createCompareCharts = function(fcA, fcB, veld) {
  wisGrafieken();
  
  const waardenA = haalWaarden(fcA, veld);
  const waardenB = haalWaarden(fcB, veld);
  
  if (waardenA.length === 0 || waardenB.length === 0) {
    alert(`Fout: Geen numerieke waarden gevonden voor veld "${veld}" in één van de datasets.`);
    return;
  }
  
  const container = document.getElementById('charts');
  if (!container) return;
  
  // Titel
  const titel = document.createElement('h3');
  titel.textContent = `Vergelijkmodus — ${veld}`;
  container.appendChild(titel);
  
  // Wrapper voor twee grafieken naast elkaar
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.gap = '12px';
  wrapper.style.justifyContent = 'center';
  container.appendChild(wrapper);
  
  // Teken beide histogrammen
  tekenHistogram(waardenA, 'Dataset A', CHARTS_CONFIG.kleurDatasetA, wrapper);
  tekenHistogram(waardenB, 'Dataset B', CHARTS_CONFIG.kleurDatasetB, wrapper);
};

// ============================================================================
// HELP & ASSISTENTIE
// ============================================================================

/**
 * Geef hulp-instructie (Nederlands)
 * @return {string} Hulptekst
 */
window.d3ChartsHelp = function() {
  return 'Selecteer een numerieke variabele in het menu om te visualiseren. ' +
    'Voor vergelijkmodus: klik "Start vergelijking" en upload daarna het tweede bestand.';
};
// D3-visualisaties (Nederlands, onderhoudsvriendelijk)
// - Vergelijkmodus: twee grafieken naast elkaar

// Hulpfuncties
function isNumber(v){ return v!==null && v!==undefined && !isNaN(+v); }

function extractNumericFields(fc){
  const props = fc.features[0]?.properties || {};
  return Object.keys(props).filter(k => {
    for(let i=0;i<Math.min(20,fc.features.length);i++){
      const v = fc.features[i].properties[k];
      if(v===null||v===undefined) continue;
      return isNumber(v);
    }
    return false;
  });
}

function getValues(fc, field){
  const all = fc.features.map(f=>{
    const v = f.properties[field];
    return isNumber(v)? +v : null;
  }).filter(v=>v!==null);
  // Pas indien aanwezig het actieve filter toe
  const filter = window.appData && window.appData.filter ? window.appData.filter : null;
  if(!filter) return all;
  // compute percentiles if needed
  const sorted = all.slice().sort((a,b)=>a-b);
  const lowerIdx = Math.floor((filter.lowPct||0)/100 * (sorted.length-1));
  const upperIdx = Math.floor((filter.highPct||100)/100 * (sorted.length-1));
  const lowerVal = sorted[Math.max(0, lowerIdx)];
  const upperVal = sorted[Math.min(sorted.length-1, upperIdx)];
  return all.filter(v=>{
    if(typeof filter.min === 'number' && v < filter.min) return false;
    if(typeof filter.max === 'number' && v > filter.max) return false;
    if(typeof filter.lowPct === 'number' && v < lowerVal) return false;
    if(typeof filter.highPct === 'number' && v > upperVal) return false;
    return true;
  });
}

// Vul de veldkeuze in de zijbalk
window.populateFieldSelect = function(fc){
  if(!fc || !fc.features || fc.features.length===0) return;
  const numeric = extractNumericFields(fc);
  window.availableFields = numeric;
  if (window.initFieldSelectors) {
    window.initFieldSelectors(numeric);
  }
}

// Wis het grafiekvlak
function clearCharts(){
  const c = document.getElementById('charts');
  if(c) c.innerHTML = '';
}

// Vergelijkmodus: twee grafieken naast elkaar
window.createCompareCharts = function(fcA, fcB, field){
  clearCharts();
  const valuesA = getValues(fcA, field);
  const valuesB = getValues(fcB, field);
  if(!valuesA.length || !valuesB.length){ alert('Geen numerieke waarden gevonden in één van de datasets voor veld: ' + field); return; }

  const container = document.getElementById('charts');
  const title = document.createElement('h3');
  title.textContent = `Vergelijkmodus — ${field}`;
  container.appendChild(title);

  const wrap = document.createElement('div');
  wrap.style.display='flex';
  wrap.style.gap='12px';
  container.appendChild(wrap);

  const makeSmall = (values, label, color) => {
    const div = document.createElement('div');
    wrap.appendChild(div);
    const svg = d3.select(div).append('svg').attr('width',300).attr('height',200);
    const margin={top:20,right:10,bottom:30,left:30}, w=300, h=200;
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, w-margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(15)(values);
    const y = d3.scaleLinear().domain([0,d3.max(bins,d=>d.length)]).range([h-margin.bottom, margin.top]);
    svg.append('g').attr('fill',color).selectAll('rect').data(bins).join('rect')
      .attr('x',d=>x(d.x0)+1)
      .attr('y',d=>y(d.length))
      .attr('width',d=>Math.max(0,x(d.x1)-x(d.x0)-1))
      .attr('height',d=>y(0)-y(d.length));
    svg.append('g').attr('transform',`translate(0,${h-margin.bottom})`).call(d3.axisBottom(x).ticks(4));
    svg.append('g').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4));
    const lab = document.createElement('div'); lab.textContent = label; lab.style.textAlign='center'; div.appendChild(lab);
  }

  makeSmall(valuesA,'Gegevensset A','#4c78a8');
  makeSmall(valuesB,'Gegevensset B','#e45756');
}

// Toegankelijkheid: eenvoudige Nederlandse instructie
window.d3ChartsHelp = function(){
  return 'Gebruik het keuzemenu om een numerieke variabele te kiezen. Voor vergelijkmodus: klik "Start vergelijkmodus" en upload daarna het tweede bestand.';
}
