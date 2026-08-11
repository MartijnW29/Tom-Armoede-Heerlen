// ============================================================================
// KAART.JS — Heerlen Opportunity Atlas
// Choropleth visualisatie, filtering, legenda's en popups
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier alle instellingen aan
// ============================================================================

const KAART_CONFIG = {
  // --- Visualisatie ---
  standaardKleurPalet:    'viridis',   // viridis | rdylgn | blues | oranges
  standaardTransparantie: 0.5,         // 0.0–1.0
  standaardAantalKlassen: 5,
  standaardClassificatie: 'quantile',  // quantile | equal

  // --- Randstijl polygonen ---
  randKleur:              '#333',
  randBreedte:            0.6,
  wijkRandBreedte:        2.5,         // Dikkere rand voor wijkgrenzen
  gefilterdRandKleur:     '#999',
  gefilterdVulKleur:      '#e8e8e8',
  gefilterdTransparantie: 0.15,

  // --- Popup: velden die als eerste worden getoond ---
  voorkeurvelden: ['naam', 'name', 'buurtnaam', 'wijknaam', 'id', 'code'],

  // --- Kaartweergave ---
  maxZoomNaDataLoad: 14,
};

// Synchroniseer standaard-transparantie met globale APP_SETTINGS
window.APP_SETTINGS = window.APP_SETTINGS || {};
window.APP_SETTINGS.defaultOpacity = KAART_CONFIG.standaardTransparantie;
if (typeof window.syncOpacityDefaults === 'function') window.syncOpacityDefaults();

// Hover-grafiek configuratie (panelafmetingen, vertraging, id-velden)
const HOVER_CHART_CONFIG = {
  panelWidth:    340,
  panelHeight:   190,
  marginTop:     16,
  marginRight:   14,
  marginBottom:  36,
  marginLeft:    42,
  hideDelayMs:   650, // ms vertraging voordat paneel verdwijnt na muisverlaten

  // Velden die worden gebruikt om een feature uniek te identificeren
  identityFields: ['code', 'id', 'buurtcode', 'wijkcode', 'buurtnaam', 'wijknaam', 'naam', 'name'],
};

// Zorg dat appData object altijd bestaat
window.appData = window.appData || {};

// ============================================================================
// HULPFUNCTIES — Basis operaties
// ============================================================================

/**
 * Herken of een veldnaam een percentage/aandeel representeert (CBS-achtige data).
 * Wordt gebruikt om de waarde in popups en legenda met een %-teken te tonen.
 */
function isPercentageVeld(veldnaam) {
  if (!veldnaam) return false;
  const naam = veldnaam.toLowerCase();
  return /(percentage|perc\b|_pct|pct_|aandeel|%)/.test(naam);
}

/**
 * Formatteer een numerieke waarde volgens Nederlandse notatie (komma als decimaalteken).
 * Percentage-achtige velden krijgen 2 decimalen + %-teken (bv. "25,00%"),
 * overige numerieke velden 2 decimalen zonder teken (bv. "1.234,56").
 */
function formatteerWaarde(waarde, veldnaam) {
  if (waarde === null || waarde === undefined || waarde === '' || isNaN(+waarde)) return waarde;
  const getal = +waarde;
  if (isPercentageVeld(veldnaam)) {
    return `${getal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
  return getal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Haal alle numerieke waarden op voor een veld uit een FeatureCollection. */
function haalNumeriekeWaarden(fc, veld) {
  return fc.features
    .map(f => {
      const v = f.properties?.[veld];
      return (v === null || v === undefined || v === '') ? null : +v;
    })
    .filter(v => v !== null && !isNaN(v));
}

/**
 * Controleer of een waarde door het actieve filter heen komt.
 * Ondersteunt min/max én percentiel-grenzen (lowPct / highPct).
 */
function waardePasseertFilter(waarde, alleWaarden, filter) {
  if (filter == null) return true;
  if (waarde === null || waarde === undefined || isNaN(+waarde)) return false;

  const num = +waarde;
  if (typeof filter.min === 'number' && num < filter.min) return false;
  if (typeof filter.max === 'number' && num > filter.max) return false;

  // Percentiel-check: bereken drempelwaarden op basis van gesorteerde array
  if (typeof filter.lowPct === 'number' || typeof filter.highPct === 'number') {
    const gesorteerd = (alleWaarden || []).slice().sort((a, b) => a - b);
    if (gesorteerd.length === 0) return true;

    const onderIdx  = Math.floor((filter.lowPct  || 0)   / 100 * (gesorteerd.length - 1));
    const bovenIdx  = Math.floor((filter.highPct || 100) / 100 * (gesorteerd.length - 1));
    const onderWaarde = gesorteerd[Math.max(0, onderIdx)];
    const bovenWaarde = gesorteerd[Math.min(gesorteerd.length - 1, bovenIdx)];

    if (typeof filter.lowPct  === 'number' && num < onderWaarde) return false;
    if (typeof filter.highPct === 'number' && num > bovenWaarde) return false;
  }
  return true;
}

/** Geef alle features terug die door het filter komen. */
function filtreerdFeatures(fc, veld, filter) {
  if (!filter) return fc.features;
  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  return fc.features.filter(f => waardePasseertFilter(f.properties?.[veld], alleWaarden, filter));
}

// ============================================================================
// POPUP — HTML opbouwen voor een aangeklikte feature
// ============================================================================

/**
 * Normaliseer een naam-string: witruimte en koppeltekenspaties opschonen.
 */
function normalizeName(s) {
  if (!s && s !== 0) return s;
  return String(s).trim().replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ');
}

/**
 * Bepaal de weer te geven wijknaam voor een feature.
 * Prioriteit: overlapping_wijken[0] → props.wijknaam → afgeleid van buurtnaam/buurt.
 */
function bepaalDisplayWijk(props) {
  const overlaps = Array.isArray(props.overlapping_wijken) ? props.overlapping_wijken : null;
  if (overlaps?.length) return normalizeName(overlaps[0]);
  if (props.wijknaam?.trim()) return normalizeName(props.wijknaam);

  // Leid wijknaam af van buurtnaam: "Heerlen Centrum" → "Centrum"
  const bron = props.buurtnaam || props.buurt || '';
  if (!bron) return null;
  const delen = bron.trim().split(/\s+/);
  return normalizeName(delen.length > 1 ? delen.slice(1).join(' ') : bron);
}

/**
 * Bouw HTML-inhoud voor de Leaflet popup.
 * Toont identificerende velden + waarden van alle geselecteerde variabelen.
 */
function bouwFeaturePopup(feature, veld, activeFilter, alleWaarden) {
  const props = feature.properties || {};

  // Lees actieve velden uit de UI-selectors; val terug op het doorgegeven veld
  const geselecteerde = Array.from(
    document.querySelectorAll('#selectors-div select.field-select-item')
  ).map(s => s.value).filter(Boolean);
  const veldenToShow = geselecteerde.length > 0 ? geselecteerde : (veld ? [veld] : []);

  const rijen = ['<b>Geselecteerd gebied</b>'];

  // Wijknaam eenmalig bovenaan
  const displayWijk = bepaalDisplayWijk(props);
  if (displayWijk) rijen.push(`<b>wijknaam</b>: ${displayWijk}`);

  // Overige voorkeursvelden (wijknaam overgeslagen om duplicaat te vermijden)
  KAART_CONFIG.voorkeurvelden.forEach(k => {
    if (k === 'wijknaam' || props[k] === undefined) return;
    const txt = typeof props[k] === 'number' ? formatteerWaarde(props[k], k) : props[k];
    rijen.push(`<b>${k}</b>: ${txt}`);
  });

  if (veldenToShow.length === 0) {
    rijen.push('<i>Geen variabele geselecteerd.</i>');
    return rijen.join('<br/>');
  }

  // Waarden van alle geselecteerde variabelen
  for (const v of veldenToShow) {
    const val = props[v];
    const tekst = (val === null || val === undefined || val === '')
      ? '<i>geen waarde</i>'
      : (typeof val === 'number' ? formatteerWaarde(val, v) : val);
    const buiten = !waardePasseertFilter(val, alleWaarden, activeFilter) ? ' <i>(buiten filter)</i>' : '';
    rijen.push(`<b>${v}</b>: ${tekst}${buiten}`);
  }

  return rijen.join('<br/>');
}

// ============================================================================
// HOVER TIJDREEKS GRAFIEK — Trendpaneel bij muisover feature
// ============================================================================

// Hover-status bijhouden: paneel mag alleen verdwijnen als muis nergens meer is
let hoverChartHideTimer  = null;
let mouseIsOverPanel     = false;
let mouseIsOverFeature   = false;
let mouseIsOverPopup     = false;

function shouldHideHoverChart() {
  return !mouseIsOverFeature && !mouseIsOverPopup && !mouseIsOverPanel;
}

function cancelHideHoverChartPanel() {
  if (!hoverChartHideTimer) return;
  clearTimeout(hoverChartHideTimer);
  hoverChartHideTimer = null;
}

function scheduleHideHoverChartPanel() {
  cancelHideHoverChartPanel();
  hoverChartHideTimer = setTimeout(() => {
    if (shouldHideHoverChart()) hideHoverChartPanelNow();
  }, HOVER_CHART_CONFIG.hideDelayMs);
}

function hideHoverChartPanelNow() {
  const panel = document.getElementById('hover-timeseries-panel');
  if (!panel || !shouldHideHoverChart()) return;
  panel.classList.remove('is-visible');
  try { if (map?.closePopup) map.closePopup(); } catch (e) { /* ignore */ }
}

/** Maak het hover-paneel aan als het nog niet bestaat en geef het terug. */
function getHoverChartPanel() {
  let panel = document.getElementById('hover-timeseries-panel');
  if (panel) return panel;

  const mapContainer = document.getElementById('map');
  if (!mapContainer) return null;

  panel = document.createElement('section');
  panel.id        = 'hover-timeseries-panel';
  panel.className = 'hover-timeseries-panel';
  panel.innerHTML = [
    '<div class="hover-timeseries-header">',
    '  <div class="hover-timeseries-title"></div>',
    '  <span class="hover-timeseries-chevron">Inklappen ▼</span>',
    '</div>',
    '<div class="hover-timeseries-body"></div>',
  ].join('');

  // In-/uitklappen via klik op de header
  panel.querySelector('.hover-timeseries-header').addEventListener('click', () => {
    const ingeklapt = panel.classList.toggle('is-collapsed');
    panel.querySelector('.hover-timeseries-chevron').textContent =
      ingeklapt ? 'Uitklappen ▲' : 'Inklappen ▼';
  });

  panel.addEventListener('mouseenter', () => { mouseIsOverPanel = true;  cancelHideHoverChartPanel(); });
  panel.addEventListener('mouseleave', () => {
    mouseIsOverPanel = false;
    if (shouldHideHoverChart()) scheduleHideHoverChartPanel();
  });

  mapContainer.appendChild(panel);
  return panel;
}

/** Lees de geselecteerde velden uit de UI, met fallback op het doorgegeven veld. */
function getSelectedFieldsForHover(defaultField) {
  const fromSelectors = Array.from(
    document.querySelectorAll('#selectors-div select.field-select-item')
  ).map(s => s.value).filter(Boolean);
  return fromSelectors.length > 0 ? fromSelectors : (defaultField ? [defaultField] : []);
}

/** Lees het momenteel geselecteerde jaar uit de jaarslider of multiLoaderState. */
function getCurrentSelectedYear() {
  if (typeof window.multiLoaderState?.yearFilter === 'number') return window.multiLoaderState.yearFilter;
  const slider = document.getElementById('year-slider');
  if (!slider) return null;
  const jaar = parseInt(slider.value, 10);
  return Number.isFinite(jaar) ? jaar : null;
}

/** Lees het jaar uit de properties van een feature (meerdere veldnamen geprobeerd). */
function detectYearFromFeature(feature) {
  if (typeof window.getYearFromFeature === 'function') return window.getYearFromFeature(feature);
  for (const key of ['jaar', 'year', 'Jaar', 'Year', 'JAAR']) {
    const jaar = parseInt(feature?.properties?.[key], 10);
    if (Number.isFinite(jaar)) return jaar;
  }
  return null;
}

/** Geef het eerste gevonden identiteitsveld + waarde terug voor een feature. */
function getFeatureIdentity(feature) {
  const props = feature?.properties || {};
  for (const key of HOVER_CHART_CONFIG.identityFields) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return { key, value: String(value) };
    }
  }
  return null;
}

/** Controleer of een candidaat-feature dezelfde identiteit heeft. */
function matchesFeatureIdentity(candidate, identity) {
  if (!identity || !candidate?.properties) return false;
  const value = candidate.properties[identity.key];
  return value !== undefined && value !== null && String(value) === identity.value;
}

/**
 * Verzamel tijdreeksdata voor een feature over alle jaren.
 * Groepeert waarden per jaar en berekent het gemiddelde per veld.
 * Waarden die buiten het actieve filter vallen worden overgeslagen.
 */
function collectHoverSeries(baseFeature, fields) {
  const source = window.multiLoaderState?.originalData || window.appData?.lastFC;
  if (!source?.features?.length) return null;

  const identity   = getFeatureIdentity(baseFeature);
  let candidates   = source.features;
  if (identity) {
    const matched = candidates.filter(f => matchesFeatureIdentity(f, identity));
    if (matched.length) candidates = matched;
  }

  // Alle waarden per veld (voor filter-checks)
  const allePerField = {};
  for (const field of fields) {
    allePerField[field] = source.features
      .map(f => { const v = f.properties?.[field]; return (v == null || v === '') ? null : +v; })
      .filter(v => Number.isFinite(v));
  }

  const activeFilter = window.appData?.filter || null;
  const byYear = new Map();

  for (const candidate of candidates) {
    const jaar = detectYearFromFeature(candidate);
    if (!Number.isFinite(jaar)) continue;
    if (!byYear.has(jaar)) {
      const buckets = {};
      for (const field of fields) buckets[field] = [];
      byYear.set(jaar, buckets);
    }
    const bucket = byYear.get(jaar);
    for (const field of fields) {
      const raw = candidate.properties?.[field];
      if (raw == null || raw === '') continue;
      const num = +raw;
      if (!Number.isFinite(num)) continue;
      if (!waardePasseertFilter(num, allePerField[field] || [], activeFilter)) continue;
      bucket[field].push(num);
    }
  }

  const jaren = Array.from(byYear.keys()).sort((a, b) => a - b);
  if (!jaren.length) return null;

  const series    = {};
  const allValues = [];

  for (const field of fields) {
    const points = jaren.map(jaar => {
      const values = byYear.get(jaar)?.[field] || [];
      if (!values.length) return null;
      return { year: jaar, value: values.reduce((s, v) => s + v, 0) / values.length };
    }).filter(Boolean);
    series[field] = points;
    points.forEach(p => allValues.push(p.value));
  }

  return allValues.length ? { years: jaren, series, allValues, identity } : null;
}

/** Toon een tekstbericht in het hover-paneel (bijv. bij ontbrekende data). */
function renderHoverChartMessage(panel, titel, bericht) {
  const titleEl = panel.querySelector('.hover-timeseries-title');
  const bodyEl  = panel.querySelector('.hover-timeseries-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = titel;
  bodyEl.innerHTML    = `<div class="hover-timeseries-empty">${bericht}</div>`;
  panel.classList.add('is-visible');
}

/**
 * Teken de D3-trendgrafiek in het hover-paneel voor de aangegeven feature.
 * Toont één lijn per geselecteerd veld + een verticale markering voor het huidige jaar.
 */
function toonHoverJarenGrafiek(feature, defaultField) {
  cancelHideHoverChartPanel();
  const panel = getHoverChartPanel();
  if (!panel) return;

  if (typeof d3 === 'undefined') {
    renderHoverChartMessage(panel, 'Trend over jaren', 'D3 is niet beschikbaar.');
    return;
  }

  const fields = getSelectedFieldsForHover(defaultField);
  if (!fields.length) {
    renderHoverChartMessage(panel, 'Trend over jaren', 'Selecteer eerst een variabele.');
    return;
  }

  const data          = collectHoverSeries(feature, fields);
  const naamVoorkeur  = feature?.properties?.buurtnaam || feature?.properties?.wijknaam
                     || feature?.properties?.naam      || feature?.properties?.name;
  const titel         = `Trend over jaren - ${naamVoorkeur || data?.identity?.value || 'Gebied'}`;

  if (!data) {
    renderHoverChartMessage(panel, titel, 'Geen jaarreeks beschikbaar voor dit gebied.');
    return;
  }

  const titleEl = panel.querySelector('.hover-timeseries-title');
  const bodyEl  = panel.querySelector('.hover-timeseries-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = titel;
  bodyEl.innerHTML    = '';

  const { panelWidth: W, panelHeight: H, marginTop: mT, marginRight: mR, marginBottom: mB, marginLeft: mL } = HOVER_CHART_CONFIG;

  // SVG aanmaken
  const svg = d3.select(bodyEl).append('svg')
    .attr('width', W).attr('height', H)
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Trendgrafiek per geselecteerde variabele');

  // Schalen: X op jaren, Y op waarden
  let [xMin, xMax] = d3.extent(data.years);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }

  let yMin = d3.min(data.allValues);
  let yMax = d3.max(data.allValues);
  if (yMin === yMax) { const pad = Math.abs(yMin || 1) * 0.05; yMin -= pad; yMax += pad; }

  const xSchaal = d3.scaleLinear().domain([xMin, xMax]).range([mL, W - mR]);
  const ySchaal = d3.scaleLinear().domain([yMin, yMax]).nice().range([H - mB, mT]);

  svg.append('g').attr('transform', `translate(0,${H - mB})`).call(d3.axisBottom(xSchaal).ticks(5).tickFormat(d3.format('d')));
  svg.append('g').attr('transform', `translate(${mL},0)`).call(d3.axisLeft(ySchaal).ticks(4));

  const lijnGenerator = d3.line().x(d => xSchaal(d.year)).y(d => ySchaal(d.value));
  const kleuren       = d3.scaleOrdinal(d3.schemeTableau10).domain(fields);

  // Teken een lijn per veld met inloop-animatie
  for (const field of fields) {
    const punten = data.series[field] || [];
    if (!punten.length) continue;

    const pathLength = 1000; // vaste waarde voor dash-animatie

    svg.append('path').datum(punten)
      .attr('fill', 'none').attr('stroke', kleuren(field)).attr('stroke-width', 2)
      .attr('d', lijnGenerator)
      .attr('stroke-dasharray', pathLength).attr('stroke-dashoffset', pathLength).attr('opacity', 0.85)
      .transition().duration(600).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);

    // Cirkel op het laatste datapunt
    svg.append('circle')
      .attr('cx', xSchaal(punten.at(-1).year)).attr('cy', ySchaal(punten.at(-1).value))
      .attr('r', 2.5).attr('fill', kleuren(field)).attr('opacity', 0)
      .transition().delay(350).duration(300).ease(d3.easeQuadOut).attr('opacity', 1);
  }

  // Verticale lijn voor het momenteel geselecteerde jaar
  const geselecteerdJaar = getCurrentSelectedYear();
  if (Number.isFinite(geselecteerdJaar) && geselecteerdJaar >= xMin && geselecteerdJaar <= xMax) {
    svg.append('line')
      .attr('x1', xSchaal(geselecteerdJaar)).attr('x2', xSchaal(geselecteerdJaar))
      .attr('y1', mT).attr('y2', H - mB)
      .attr('class', 'hover-chart-year-marker').attr('opacity', 0)
      .transition().delay(500).duration(300).ease(d3.easeQuadOut).attr('opacity', 0.9);

    // Highlight-cirkel op het geselecteerde jaar per veld
    for (const field of fields) {
      const match = (data.series[field] || []).find(p => p.year === geselecteerdJaar);
      if (!match) continue;
      svg.append('circle')
        .attr('cx', xSchaal(match.year)).attr('cy', ySchaal(match.value))
        .attr('r', 0).attr('fill', kleuren(field)).attr('stroke', '#111').attr('stroke-width', 1.4).attr('opacity', 0)
        .transition().delay(550).duration(350).ease(d3.easeBackOut).attr('r', 5).attr('opacity', 1);
    }
  }

  // Legenda onder de grafiek
  const legenda = d3.select(bodyEl).append('div').attr('class', 'hover-timeseries-legend').style('opacity', 0);
  fields.forEach(field => {
    const heeftData = (data.series[field] || []).length > 0;
    const item = legenda.append('span').attr('class', 'legend-item');
    item.append('i').style('background', kleuren(field)).style('opacity', heeftData ? 1 : 0.35);
    item.append('b').text(field);
  });
  legenda.transition().delay(700).duration(300).ease(d3.easeQuadOut).style('opacity', 1);

  panel.classList.add('is-visible');
}

// Exporteer hide-functie voor gebruik vanuit andere modules
window.hideHoverTimeSeries = scheduleHideHoverChartPanel;

// ============================================================================
// KLEURSCHEMA'S — D3 interpolaties
// ============================================================================

/** Geef een array van `aantal` kleuren terug voor het gekozen palet. */
function haalKleurSchema(naam, aantal) {
  switch ((naam || '').toLowerCase()) {
    case 'rdylgn':  return d3.quantize(d3.interpolateRdYlGn, aantal);
    case 'blues':   return d3.quantize(d3.interpolateBlues,  aantal);
    case 'oranges': return d3.quantize(d3.interpolateOranges, aantal);
    default:        return d3.quantize(d3.interpolateViridis, aantal);
  }
}

// ============================================================================
// CLASSIFICATIE — Bereken breekpunten voor choropleth-kleuring
// ============================================================================

/** Quantile: verdeel waarden in groepen met gelijk aantal elementen. */
function berekenBreaksQuantile(waarden, aantalKlassen) {
  const gesorteerd = waarden.slice().sort((a, b) => a - b);
  const breuken = [gesorteerd[0]];
  for (let i = 1; i < aantalKlassen; i++) {
    const idx = Math.floor((i / aantalKlassen) * (gesorteerd.length - 1));
    breuken.push(gesorteerd[Math.min(idx, gesorteerd.length - 1)]);
  }
  breuken.push(gesorteerd[gesorteerd.length - 1]);
  return breuken;
}

/** Equal interval: verdeel het waardebereik in gelijke stappen. */
function berekenBreaksEqualInterval(waarden, aantalKlassen) {
  const gesorteerd = waarden.slice().sort((a, b) => a - b);
  const min = gesorteerd[0];
  const max = gesorteerd[gesorteerd.length - 1];
  const breuken = [min];
  for (let i = 1; i < aantalKlassen; i++) breuken.push(min + (max - min) * i / aantalKlassen);
  breuken.push(max);
  return breuken;
}

// ============================================================================
// LEGENDA
// ============================================================================

/** Formatteer een klassegrens in de legenda: Nederlandse notatie, met %-teken indien van toepassing. */
function formatteerGrensWaarde(getal, percentage) {
  const tekst = getal.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return percentage ? `${tekst}%` : tekst;
}

/** Teken de kleurlegenda in het #legend element. */
function tekenLegenda(breuken, kleuren, veldnaam) {
  const legendDiv = document.getElementById('legend');
  if (!legendDiv) return;
  legendDiv.innerHTML = '';

  const titel = document.createElement('h3');
  titel.textContent = `Legenda: ${veldnaam}`;
  titel.title = `Legenda: ${veldnaam}`; // volledige naam als tooltip wanneer afgebroken
  titel.style.margin = '0 0 8px 0';
  titel.style.overflowWrap = 'break-word';
  titel.style.wordBreak = 'break-word';
  legendDiv.appendChild(titel);

  // "Geen data" rij bovenaan
  function maakRij(kleur, labelTekst, cursief = false) {
    const rij    = Object.assign(document.createElement('div'), { style: 'display:flex;align-items:center;margin-bottom:4px;font-size:12px' });
    const kastje = Object.assign(document.createElement('div'), { style: `width:20px;height:14px;background:${kleur};margin-right:8px;border:1px solid #666` });
    const label  = document.createElement('span');
    label.textContent  = labelTekst;
    if (cursief) label.style.fontStyle = 'italic';
    rij.appendChild(kastje);
    rij.appendChild(label);
    return rij;
  }

  legendDiv.appendChild(maakRij('#ccc', 'Geen data', true));

  const scheider = document.createElement('div');
  scheider.style.cssText = 'border-top:1px solid #ddd;margin:4px 0';
  legendDiv.appendChild(scheider);

  // Kleurklassen
  const percentage = isPercentageVeld(veldnaam);
  for (let i = 0; i < kleuren.length; i++) {
    const van = breuken[i]     != null ? formatteerGrensWaarde(breuken[i], percentage)     : '';
    const tot = breuken[i + 1] != null ? formatteerGrensWaarde(breuken[i + 1], percentage) : '∞';
    legendDiv.appendChild(maakRij(kleuren[i], `${van} – ${tot}`));
  }
}

// ============================================================================
// HOOFD-FUNCTIE: Toon choropleth
// ============================================================================

/**
 * Teken een choropleth-kaart op basis van een numeriek veld.
 * Verwijdert de vorige laag, berekent breuken, kent kleuren toe en voegt toe aan de kaart.
 *
 * @param {GeoJSON} fc    - FeatureCollection met alle features
 * @param {string}  veld  - Naam van het numerieke eigenschapsveld
 * @param {Object}  opties - { method, palette, opacity, classes }
 */
window.toonChoropleth = function(fc, veld, opties = {}) {
  if (!fc?.features?.length) return;

  // Instellingen samenvoegen met config-standaarden
  const methode       = opties.method  || KAART_CONFIG.standaardClassificatie;
  const palet         = opties.palette || KAART_CONFIG.standaardKleurPalet;
  const transparantie = typeof opties.opacity === 'number' ? opties.opacity : KAART_CONFIG.standaardTransparantie;
  const aantalKlassen = Math.min(opties.classes || KAART_CONFIG.standaardAantalKlassen, fc.features.length);

  // Verwijder vorige lagen
  ['baseGeoLayer', 'choroplethLayer'].forEach(key => {
    if (window.appData[key]) {
      window.appData.dataLayer.removeLayer(window.appData[key]);
      window.appData[key] = null;
    }
  });

  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  if (!alleWaarden.length) { alert(`Geen numerieke waarden gevonden voor "${veld}"`); return; }

  // Filter toepassen: gebruik alleen gefilterde waarden voor breekpunten
  const activeFilter     = window.appData?.filter || null;
  const gefilterd        = filtreerdFeatures(fc, veld, activeFilter);
  const gefilterdWaarden = gefilterd.map(f => +f.properties[veld]).filter(v => !isNaN(v));
  const teGebruiken      = gefilterdWaarden.length ? gefilterdWaarden : alleWaarden;

  const breuken = methode === 'equal'
    ? berekenBreaksEqualInterval(teGebruiken, aantalKlassen)
    : berekenBreaksQuantile(teGebruiken, aantalKlassen);
  const kleuren = haalKleurSchema(palet, aantalKlassen);

  // Voeg wijknamen toe aan buurten als dat nog niet is gedaan
  try {
    const heeftOverlaps = fc.features.some(f => Array.isArray(f.properties?.overlapping_wijken) && f.properties.overlapping_wijken.length);
    if (!heeftOverlaps && window.multiLoaderState?.wijkenFC && typeof addWijkenToBuurten === 'function') {
      addWijkenToBuurten(fc, window.multiLoaderState.wijkenFC);
    }
  } catch (e) { /* ignore */ }

  // Bepaal stijl per feature op basis van filterresultaat en waarde
  function styleFeature(feature) {
    const waarde      = feature.properties?.[veld];
    const passeert    = waardePasseertFilter(waarde, alleWaarden, activeFilter);

    if (!passeert) return { color: KAART_CONFIG.gefilterdRandKleur, weight: 0.6, fillOpacity: 0.45, fillColor: '#bdbdbd' };
    if (waarde == null || waarde === '' || isNaN(+waarde)) return { color: KAART_CONFIG.gefilterdRandKleur, weight: 0.6, fillOpacity: 0.3, fillColor: '#ccc' };

    // Zoek de juiste kleurklasse op basis van de breekpunten
    const num = +waarde;
    let kleur = kleuren[kleuren.length - 1];
    for (let i = 0; i < kleuren.length - 1; i++) {
      if (num < breuken[i + 1]) { kleur = kleuren[i]; break; }
    }
    return { color: KAART_CONFIG.randKleur, weight: KAART_CONFIG.randBreedte, fillOpacity: transparantie, fillColor: kleur };
  }

  // Zorg dat de benodigde Leaflet-panes bestaan (voorkomt render-volgorde-problemen)
  try {
    const m = window.appData.map;
    if (m) {
      [['dimPane', 450], ['choroplethPane', 460], ['choroplethWijkBorderPane', 475]].forEach(([naam, z]) => {
        if (!m.getPane(naam)) m.createPane(naam);
        try { m.getPane(naam).style.zIndex = z; } catch (e) { /* ignore */ }
      });
    }
  } catch (e) { /* ignore */ }

  // Voeg GeoJSON-laag toe met popups en hover-events
  const laag = L.geoJSON(fc, {
    style: styleFeature,
    pane: 'choroplethPane',
    onEachFeature: (feature, leafletLayer) => {
      leafletLayer.bindPopup(bouwFeaturePopup(feature, veld, activeFilter, alleWaarden), {
        closeButton: false, autoPan: false,
      });

      leafletLayer.on('mouseover', function () {
        mouseIsOverFeature = true;
        cancelHideHoverChartPanel();
        this.openPopup();
        toonHoverJarenGrafiek(feature, veld);
        // Stuur hover-identiteit door naar het andere split-screen venster
        try {
          if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
            const identity = getFeatureIdentity(feature);
            if (identity && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'heerlen-hover', panelId: window.splitScreenPanelId || null, identity }, '*');
            }
          }
        } catch (e) { /* ignore */ }
      });

      leafletLayer.on('mouseout', function () {
        mouseIsOverFeature = false;
        // Verberg pas als muis ook niet over popup of paneel is
        shouldHideHoverChart() ? scheduleHideHoverChartPanel() : cancelHideHoverChartPanel();
        try {
          if (window.isSplitScreenPane && !window.__suppressHoverBroadcast && window.parent !== window) {
            window.parent.postMessage({ type: 'heerlen-hover-clear', panelId: window.splitScreenPanelId || null }, '*');
          }
        } catch (e) { /* ignore */ }
      });

      leafletLayer.on('click', () => leafletLayer.openPopup());
    },
  }).addTo(window.appData.dataLayer);

  if (window.bringSmallPolygonsToFront) window.bringSmallPolygonsToFront(window.appData.dataLayer);

  window.appData.choroplethLayer = laag;

  // Dikke grenzen voor wijken bovenop de choropleth tekenen
  try {
    if (window.appData.choroplethWijkBorderLayer) {
      try { window.appData.dataLayer.removeLayer(window.appData.choroplethWijkBorderLayer); } catch (e) { /* ignore */ }
      window.appData.choroplethWijkBorderLayer = null;
    }
    const wijkFC = window.multiLoaderState?.wijkenFC;
    if (wijkFC?.features?.length) {
      const wijkLaag = L.geoJSON(wijkFC, {
        style: () => ({ color: KAART_CONFIG.randKleur, weight: KAART_CONFIG.wijkRandBreedte, opacity: 1, fillOpacity: 0 }),
        pane: 'choroplethWijkBorderPane',
        interactive: false,
      }).addTo(window.appData.dataLayer);
      try { wijkLaag.bringToFront(); } catch (e) { /* ignore */ }
      window.appData.choroplethWijkBorderLayer = wijkLaag;
    }
  } catch (e) { /* ignore */ }

  // ---- Dim-overlay: verduister alles buiten de gevisualiseerde polygonen ----
  // Werkt via een SVG-masker: polygoonvormen worden als "gaten" in het masker gestanst,
  // zodat de choropleth-gebieden volledig zichtbaar blijven maar de rest dimmer wordt.
  (function setupDimOverlay() {
    const m = window.appData.map;
    if (!m) return;

    // Panes aanmaken indien nodig
    if (!m.getPane('dimPane'))        m.createPane('dimPane');
    if (!m.getPane('choroplethPane')) m.createPane('choroplethPane');
    m.getPane('dimPane').style.zIndex        = 450;
    m.getPane('choroplethPane').style.zIndex = 460;

    const mapContainer = m.getContainer?.() || document.getElementById('map');
    if (!mapContainer) return;

    // Verwijder bestaande SVG-overlay
    mapContainer.querySelector('svg.choropleth-dim-svg')?.remove();

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(svgNS, 'svg');
    svg.classList.add('choropleth-dim-svg');
    Object.assign(svg.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '400' });
    svg.setAttribute('preserveAspectRatio', 'none');

    const defs = document.createElementNS(svgNS, 'defs');
    svg.appendChild(defs);

    const mask = document.createElementNS(svgNS, 'mask');
    mask.setAttribute('id', 'choropleth-dim-mask');
    defs.appendChild(mask);

    // Wit vlak: alles is standaard zichtbaar; polygoon-paden worden zwart (= gat in masker)
    const volRect = document.createElementNS(svgNS, 'rect');
    volRect.setAttribute('width', '100%'); volRect.setAttribute('height', '100%');
    volRect.setAttribute('x', '0');        volRect.setAttribute('y', '0');
    volRect.setAttribute('fill', 'white');
    mask.appendChild(volRect);

    // Dimrect: halftransparant zwart over het volledige kaartgebied
    const dimRect = document.createElementNS(svgNS, 'rect');
    dimRect.setAttribute('width', '100%'); dimRect.setAttribute('height', '100%');
    dimRect.setAttribute('x', '0');        dimRect.setAttribute('y', '0');
    dimRect.setAttribute('fill', '#000');  dimRect.setAttribute('opacity', '0.6');
    dimRect.setAttribute('mask', 'url(#choropleth-dim-mask)');
    svg.appendChild(dimRect);

    mapContainer.appendChild(svg);

    window.appData.choroplethDimOverlayState = { map: m, mapContainer, mask, popupEl: null };

    // Herbereken masker-paden bij elke kaartbeweging
    function updateMask() {
      // Verwijder alle eerder berekende gat-paden (eerste kind = volRect bewaren)
      while (mask.childNodes.length > 1) mask.removeChild(mask.lastChild);

      // Voeg een gat toe voor de open popup (zodat die ook goed zichtbaar blijft)
      const popupEl = window.appData.choroplethDimOverlayState?.popupEl;
      if (popupEl) {
        const pr = popupEl.getBoundingClientRect();
        const cr = mapContainer.getBoundingClientRect();
        const left = Math.max(0, pr.left - cr.left);
        const top  = Math.max(0, pr.top  - cr.top);
        const w    = Math.min(cr.width  - left, pr.width);
        const h    = Math.min(cr.height - top,  pr.height);
        if (w > 0 && h > 0) {
          const rect = document.createElementNS(svgNS, 'rect');
          Object.assign(rect, {}); 
          rect.setAttribute('x', left); rect.setAttribute('y', top);
          rect.setAttribute('width', w); rect.setAttribute('height', h);
          rect.setAttribute('rx', '12'); rect.setAttribute('ry', '12');
          rect.setAttribute('fill', 'black');
          mask.appendChild(rect);
        }
      }

      // Projecteer GeoJSON-coördinaten naar schermcoördinaten en bouw SVG-paden
      function projectCoord(coord) {
        const p = m.latLngToContainerPoint([coord[1], coord[0]]);
        return `${p.x},${p.y}`;
      }
      function ringNaarPad(ring) {
        return ring.map(projectCoord).map((c, i) => (i === 0 ? `M${c}` : `L${c}`)).join(' ') + ' Z';
      }

      (fc.features || []).forEach(feat => {
        const geom = feat.geometry;
        if (!geom) return;
        const polygonen = geom.type === 'Polygon'
          ? [geom.coordinates]
          : geom.type === 'MultiPolygon' ? geom.coordinates : [];

        polygonen.forEach(poly => {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', poly.map(ringNaarPad).join(' '));
          path.setAttribute('fill', 'black');
          mask.appendChild(path);
        });
      });
    }

    updateMask();

    // Verwijder eventuele vorige listener
    try {
      if (m._choroplethDimUpdater) {
        m.off('move moveend viewreset zoomend resize', m._choroplethDimUpdater);
      }
    } catch (e) { /* ignore */ }

    // Gebruik requestAnimationFrame om te voorkomen dat updateMask te vaak vuurt
    let rafId = null;
    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => { rafId = null; try { updateMask(); } catch (e) { /* ignore */ } });
    };

    window.requestChoroplethDimOverlayUpdate = schedule;
    m.on('move moveend viewreset zoom zoomstart zoomend zoomanim resize', schedule);
    m._choroplethDimUpdater = schedule;

    try { window.appData.choroplethLayer?.bringToFront?.(); } catch (e) { /* ignore */ }
  })();

  // Zoom naar data alleen als het een nieuwe dataset is (niet bij visuele updates)
  const isNieuweDataset = window.appData.lastLoadedData !== fc;
  if (isNieuweDataset) {
    if (!window.appData?.skipFitOnNextRender) {
      try { window.appData.map.fitBounds(laag.getBounds(), { maxZoom: KAART_CONFIG.maxZoomNaDataLoad }); } catch (e) { /* ignore */ }
    } else {
      delete window.appData.skipFitOnNextRender;
    }
    window.appData.lastLoadedData = fc;
  }

  tekenLegenda(breuken, kleuren, veld);
};

// Achterwaartse compatibiliteit alias
window.applyChoropleth = window.toonChoropleth;

// ============================================================================
// POPUP HOVER-SYNCHRONISATIE — Koppeling tussen split-screen vensters
// ============================================================================

// Popup open/dicht: houd mouseIsOverPopup bij en update de dim-overlay
if (map && typeof map.on === 'function') {
  map.on('popupopen', (e) => {
    try {
      const popupEl = e.popup?.getElement?.();
      if (!popupEl) return;

      if (!popupEl.__hoverHandlersAttached) {
        popupEl.__hoverHandlersAttached = true;

        popupEl.addEventListener('mouseenter', () => {
          mouseIsOverPopup = true;
          cancelHideHoverChartPanel();
          try {
            if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
              const feature  = e.popup?._source?.feature;
              const identity = feature ? getFeatureIdentity(feature) : null;
              if (identity && window.parent !== window) {
                window.parent.postMessage({ type: 'heerlen-hover', identity, panelId: window.splitScreenPanelId || null }, '*');
              }
            }
          } catch (err) { /* ignore */ }
        });

        popupEl.addEventListener('mouseleave', () => {
          mouseIsOverPopup = false;
          if (shouldHideHoverChart()) scheduleHideHoverChartPanel();
          try {
            if (window.isSplitScreenPane && !window.__suppressHoverBroadcast && window.parent !== window) {
              window.parent.postMessage({ type: 'heerlen-hover-clear', panelId: window.splitScreenPanelId || null }, '*');
            }
          } catch (err) { /* ignore */ }
        });
      }

      const state = window.appData?.choroplethDimOverlayState;
      if (state) state.popupEl = popupEl;
      window.requestChoroplethDimOverlayUpdate?.();
    } catch (err) { /* ignore */ }
  });

  map.on('popupclose', () => {
    mouseIsOverPopup = false;
    const state = window.appData?.choroplethDimOverlayState;
    if (state) state.popupEl = null;
    window.requestChoroplethDimOverlayUpdate?.();
    if (shouldHideHoverChart()) scheduleHideHoverChartPanel();
  });
}

// Zoek een Leaflet-laag op basis van feature-identiteit
function findLayerByIdentity(identity) {
  if (!identity || !window.appData?.dataLayer) return null;
  let gevonden = null;
  try {
    window.appData.dataLayer.eachLayer(function doorzoek(layer) {
      if (gevonden) return;
      if (layer?.feature && matchesFeatureIdentity(layer.feature, identity)) { gevonden = layer; return; }
      if (typeof layer?.eachLayer === 'function') {
        layer.eachLayer(inner => {
          if (!gevonden && inner?.feature && matchesFeatureIdentity(inner.feature, identity)) gevonden = inner;
        });
      }
    });
  } catch (e) { /* ignore */ }
  return gevonden;
}

/** Markeer een feature op de kaart via identiteit (gebruikt door peer split-screen). */
function highlightFeatureByIdentity(identity) {
  const layer = findLayerByIdentity(identity);
  if (!layer) return false;
  try {
    window.__suppressHoverBroadcast = true;
    layer.openPopup();
    try { toonHoverJarenGrafiek(layer.feature); } catch (e) { /* ignore */ }
    setTimeout(() => { window.__suppressHoverBroadcast = false; }, 350);
    return true;
  } catch (e) {
    window.__suppressHoverBroadcast = false;
    return false;
  }
}

function clearPeerHighlight() {
  try {
    window.__suppressHoverBroadcast = true;
    map?.closePopup?.();
    window.hideHoverTimeSeries?.();
    setTimeout(() => { window.__suppressHoverBroadcast = false; }, 250);
  } catch (e) { window.__suppressHoverBroadcast = false; }
}

// Luister naar berichten van het peer-venster (split-screen)
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'heerlen-set-hover' && data.identity) highlightFeatureByIdentity(data.identity);
  else if (data.type === 'heerlen-clear-hover') clearPeerHighlight();
});

// ============================================================================
// COÖRDINAAT HERPROJECTIE — RD (EPSG:28992) → WGS84
// ============================================================================

// Registreer RD New projectie bij proj4 indien beschikbaar
if (typeof proj4 !== 'undefined') {
  try {
    proj4.defs('EPSG:28992',
      '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 ' +
      '+k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs'
    );
  } catch (e) { /* al gedefinieerd */ }
}

/** Detecteer of coördinaten in meters zijn (RD-stelsel: waarden >> 180). */
function coorsDinatenZijnGeprojecteerd(geom) {
  let gevonden = false;
  function loop(c) {
    if (gevonden) return;
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number' && (Math.abs(c[0]) > 1000 || Math.abs(c[1]) > 1000)) gevonden = true;
      else c.forEach(loop);
    }
  }
  loop(geom.coordinates);
  return gevonden;
}

/** Herprojecteer alle coördinaten van een geometrie van RD naar WGS84. */
function herprojecteerGeometrie(geom) {
  if (!proj4) return geom;
  const herpunt = pt => proj4('EPSG:28992', 'EPSG:4326', pt);

  if      (geom.type === 'Point')                       geom.coordinates = herpunt(geom.coordinates);
  else if (geom.type === 'MultiPoint' || geom.type === 'LineString') geom.coordinates = geom.coordinates.map(herpunt);
  else if (geom.type === 'Polygon')                     geom.coordinates = geom.coordinates.map(r => r.map(herpunt));
  else if (geom.type === 'MultiPolygon')                geom.coordinates = geom.coordinates.map(p => p.map(r => r.map(herpunt)));
  return geom;
}

/**
 * Herprojecteer een FeatureCollection van RD naar WGS84 als de coördinaten dat vereisen.
 * Wordt aangeroepen na het inladen van externe GeoJSON/shapefile-data.
 */
window.herprojecteerAlsNodig = function(fc) {
  if (!fc?.features || !proj4) return fc;
  for (const f of fc.features) {
    if (f.geometry && coorsDinatenZijnGeprojecteerd(f.geometry)) f.geometry = herprojecteerGeometrie(f.geometry);
  }
  return fc;
};