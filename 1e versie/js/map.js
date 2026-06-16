// ============================================================================
// KAART.JS — Heerlen Opportunity Atlas
// ============================================================================
// Bestand voor: Choropleth visualisatie, filtering, legends, popups
// 
// Ondersteunde methoden:
//   - quantile (standaard): gelijke aantal features per klasse
//   - equal: gelijke waardebereiken
//
// Ondersteunde kleurschema's:
//   - viridis (standaard), rdylgn, blues, oranges
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier aan voor je eigen project
// ============================================================================

const KAART_CONFIG = {
  // Kleuren en visualisatie-instellingen
  standaardKleurPalet: 'viridis',         // viridis, rdylgn, blues, oranges
  standaardTransparantie: 0.5,            // 0.0–1.0: hoe zichtbaar polygonen zijn
  standaardAantalKlassen: 5,              // Aantal kleurklassen in legenda
  standaardClassificatie: 'quantile',     // quantile of equal
  
  // Polygon randstijl
  randKleur: '#333',                      // Kleur van grenzen
  randBreedte: 0.6,                       // Dikte van grenzen
  wijkRandBreedte: 2.5,                   // Dikte van grenzen voor features met `wijknaam`
  gefilterdRandKleur: '#999',             // Grenzen van gefilterde gebieden
  gefilterdVulKleur: '#e8e8e8',           // Vulkleur van gefilterde gebieden
  gefilterdTransparantie: 0.15,           // Transparantie gefilterde gebieden
  
  // Veldkeuzes voor popup
  voorkeurvelden: [
    'naam', 'name', 'buurtnaam', 'wijknaam', 
    'id', 'code'
  ],
  
  // Kaart-view
  maxZoomNaDataLoad: 14,                  // Maximaal zoomniveau na inladen data
};

window.APP_SETTINGS = window.APP_SETTINGS || {};
window.APP_SETTINGS.defaultOpacity = KAART_CONFIG.standaardTransparantie;
if (typeof window.syncOpacityDefaults === 'function') {
  window.syncOpacityDefaults();
}

// ============================================================================
// HULPFUNCTIES — Basis operaties
// ============================================================================

/**
 * Extraheer numerieke waarden uit FeatureCollection
 * @param {GeoJSON} fc - FeatureCollection
 * @param {string} veld - Eigenschapsnaam
 * @return {Array} Array van getallen (null en NaN gefilterd)
 */
function haalNumeriekeWaarden(fc, veld) {
  const vals = fc.features.map(f => {
    const v = f.properties?.[veld];
    return (v === null || v === undefined || v === '') ? null : +v;
  }).filter(v => v !== null && !isNaN(v));
  return vals;
}

/**
 * Controleer of numerieke waarde door filter komt
 * @param {number} waarde - Te controleren waarde
 * @param {Array} alleWaarden - Alle waarden (voor percentielberekening)
 * @param {Object} filter - {min, max, lowPct, highPct}
 * @return {boolean} true als waarde door filter gaat
 */
function waardePasseertFilter(waarde, alleWaarden, filter) {
  if (filter == null) return true;
  if (waarde === null || waarde === undefined || isNaN(+waarde)) return false;
  
  const num = +waarde;
  
  // Min/Max check
  if (typeof filter.min === 'number' && num < filter.min) return false;
  if (typeof filter.max === 'number' && num > filter.max) return false;
  
  // Percentiel check
  if (typeof filter.lowPct === 'number' || typeof filter.highPct === 'number') {
    const gesorteerd = (alleWaarden || []).slice().sort((a, b) => a - b);
    if (gesorteerd.length === 0) return true;
    
    const onderIdx = Math.floor((filter.lowPct || 0) / 100 * (gesorteerd.length - 1));
    const bovenIdx = Math.floor((filter.highPct || 100) / 100 * (gesorteerd.length - 1));
    const onderWaarde = gesorteerd[Math.max(0, onderIdx)];
    const bovenWaarde = gesorteerd[Math.min(gesorteerd.length - 1, bovenIdx)];
    
    if (typeof filter.lowPct === 'number' && num < onderWaarde) return false;
    if (typeof filter.highPct === 'number' && num > bovenWaarde) return false;
  }
  
  return true;
}

/**
 * Filter features op basis van waarde en filter
 * @param {GeoJSON} fc
 * @param {string} veld
 * @param {Object} filter
 * @return {Array} Gefilterde features
 */
function filtreerdFeatures(fc, veld, filter) {
  if (!filter) return fc.features;
  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  return fc.features.filter(f =>
    waardePasseertFilter(f.properties?.[veld], alleWaarden, filter)
  );
}

/**
 * Bouw HTML-popup met attributen
 * @param {GeoJSON Feature} feature
 * @param {string} veld - Geselecteerd veld
 * @param {Object} activeFilter - Actieve filter
 * @param {Array} alleWaarden - Alle waarden
 * @return {string} HTML
 */
function bouwFeaturePopup(feature, veld, activeFilter, alleWaarden) {
  const props = feature.properties || {};

  // Ensure `wijknaam` is available in the popup when possible.
  // If the source data doesn't include `wijknaam`, attempt to derive it
  // from `buurtnaam` (e.g. "Heerlen Centrum" -> "Centrum") or from
  // the shorter `buurt` field as a fallback.
  if (!props.wijknaam || String(props.wijknaam).trim() === '') {
    const buurtnaam = props.buurtnaam || '';
    const buurt = props.buurt || '';
    if (buurtnaam && typeof buurtnaam === 'string') {
      // If buurtnaam contains a space, prefer the trailing part(s)
      // (e.g. "Heerlen Centrum" -> "Centrum"). For single-token
      // buurtnamen (e.g. "Terworm") use the full buurtnaam.
      const parts = buurtnaam.trim().split(/\s+/);
      if (parts.length > 1) {
        props.wijknaam = parts.slice(1).join(' ');
      } else {
        props.wijknaam = buurtnaam.trim();
      }
    } else if (buurt && typeof buurt === 'string') {
      props.wijknaam = buurt;
    }
  }

  // Determine which variables to show: read from dynamic selectors if present,
  // otherwise fall back to single `veld` parameter
  const geselecteerde = Array.from(document.querySelectorAll('#selectors-div select.field-select-item')).map(s => s.value).filter(v => v);
  const veldenToShow = geselecteerde.length > 0 ? geselecteerde : (veld ? [veld] : []);

  const rijen = [];
  rijen.push(`<b>Geselecteerd gebied</b>`);

  // Add preferred identifying fields first. Determine a single, normalized
  // `wijknaam` to show (priority: overlapping_wijken[0], props.wijknaam,
  // derived from buurtnaam/buurt). Add it once and avoid duplicates.
  const overlaps = Array.isArray(props.overlapping_wijken) ? props.overlapping_wijken : null;

  function normalizeName(s) {
    if (!s && s !== 0) return s;
    let t = String(s).trim();
    // Normalize hyphen spacing and multiple spaces
    t = t.replace(/\s*-\s*/g, ' - ');
    t = t.replace(/\s+/g, ' ');
    return t;
  }

  // Determine displayWijk
  let displayWijk = null;
  if (overlaps && overlaps.length) {
    displayWijk = normalizeName(overlaps[0]);
  } else if (props.wijknaam && String(props.wijknaam).trim() !== '') {
    displayWijk = normalizeName(props.wijknaam);
  } else {
    const buurtnaam = props.buurtnaam || '';
    const buurt = props.buurt || '';
    if (buurtnaam && typeof buurtnaam === 'string') {
      const parts = buurtnaam.trim().split(/\s+/);
      displayWijk = parts.length > 1 ? normalizeName(parts.slice(1).join(' ')) : normalizeName(buurtnaam);
    } else if (buurt && typeof buurt === 'string') {
      displayWijk = normalizeName(buurt);
    }
  }

  // Add `wijknaam` once if available
  if (displayWijk) {
    rijen.push(`<b>wijknaam</b>: ${displayWijk}`);
  }

  // Now add the preferred fields, but skip `wijknaam` to avoid duplicates
  KAART_CONFIG.voorkeurvelden.forEach(k => {
    if (k === 'wijknaam') return;
    if (props[k] !== undefined) {
      const txt = typeof props[k] === 'number' ? props[k].toFixed(2) : props[k];
      rijen.push(`<b>${k}</b>: ${txt}`);
    }
  });

  if (veldenToShow.length === 0) {
    rijen.push(`<i>Geen variabele geselecteerd.</i>`);
    return rijen.join('<br/>');
  }

  // Show values for all selected variables
  for (const v of veldenToShow) {
    const val = props[v];
    const tekst = (val === null || val === undefined || val === '') ? '<i>geen waarde</i>' : (typeof val === 'number' ? val.toFixed(2) : val);
    const passeert = waardePasseertFilter(val, alleWaarden, activeFilter);
    const waarschuwing = !passeert ? ' <i>(buiten filter)</i>' : '';
    rijen.push(`<b>${v}</b>: ${tekst}${waarschuwing}`);
  }

  return rijen.join('<br/>');
}

const HOVER_CHART_CONFIG = {
  panelWidth: 340,
  panelHeight: 190,
  marginTop: 16,
  marginRight: 14,
  marginBottom: 36,
  marginLeft: 42,
  hideDelayMs: 650, // Delay voordat hover chart verdwijnt na muis weg (ms)
  identityFields: [
    'code', 'id', 'buurtcode', 'wijkcode',
    'buurtnaam', 'wijknaam', 'naam', 'name'
  ]
};

let hoverChartHideTimer = null;
let mouseIsOverPanel = false;
let mouseIsOverFeature = false;
let mouseIsOverPopup = false;

function shouldHideHoverChart() {
  return !mouseIsOverFeature && !mouseIsOverPopup && !mouseIsOverPanel;
}

function getHoverChartPanel() {
  let panel = document.getElementById('hover-timeseries-panel');
  if (panel) return panel;

  const mapContainer = document.getElementById('map');
  if (!mapContainer) return null;

  panel = document.createElement('section');
  panel.id = 'hover-timeseries-panel';
  panel.className = 'hover-timeseries-panel';
panel.innerHTML = [
    '<div class="hover-timeseries-header">',
    '  <div class="hover-timeseries-title"></div>',
    '  <span class="hover-timeseries-chevron">Inklappen ▼</span>',
    '</div>',
    '<div class="hover-timeseries-body"></div>'
  ].join('');

  const header = panel.querySelector('.hover-timeseries-header');
  header.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    panel.querySelector('.hover-timeseries-chevron').textContent = collapsed ? 'Uitklappen ▲' : 'Inklappen ▼';
  });

  panel.addEventListener('mouseenter', () => {
    mouseIsOverPanel = true;
    cancelHideHoverChartPanel();
  });

  panel.addEventListener('mouseleave', () => {
    mouseIsOverPanel = false;
    if (shouldHideHoverChart()) {
      scheduleHideHoverChartPanel();
    }
  });

  mapContainer.appendChild(panel);
  return panel;
}

function hideHoverChartPanelNow() {
  const panel = document.getElementById('hover-timeseries-panel');
  if (!panel) return;
  // Only hide if mouse is not over feature/popup/panel
  if (!shouldHideHoverChart()) return;
  panel.classList.remove('is-visible');
  try {
    if (map && typeof map.closePopup === 'function') {
      map.closePopup();
    }
  } catch (e) { /* ignore */ }
}

function scheduleHideHoverChartPanel() {
  if (hoverChartHideTimer) {
    clearTimeout(hoverChartHideTimer);
  }
  hoverChartHideTimer = setTimeout(() => {
    if (shouldHideHoverChart()) {
      hideHoverChartPanelNow();
    }
  }, HOVER_CHART_CONFIG.hideDelayMs);
}

function cancelHideHoverChartPanel() {
  if (!hoverChartHideTimer) return;
  clearTimeout(hoverChartHideTimer);
  hoverChartHideTimer = null;
}

function getSelectedFieldsForHover(defaultField) {
  const fromSelectors = Array.from(
    document.querySelectorAll('#selectors-div select.field-select-item')
  )
    .map(s => s.value)
    .filter(Boolean);

  if (fromSelectors.length > 0) return fromSelectors;
  return defaultField ? [defaultField] : [];
}

function getCurrentSelectedYear() {
  if (typeof window.multiLoaderState?.yearFilter === 'number') {
    return window.multiLoaderState.yearFilter;
  }

  const slider = document.getElementById('year-slider');
  if (!slider) return null;
  const year = parseInt(slider.value, 10);
  return Number.isFinite(year) ? year : null;
}

function detectYearFromFeature(feature) {
  if (typeof window.getYearFromFeature === 'function') {
    return window.getYearFromFeature(feature);
  }

  const props = feature?.properties || {};
  const candidates = ['jaar', 'year', 'Jaar', 'Year', 'JAAR'];
  for (const key of candidates) {
    if (props[key] === undefined || props[key] === null || props[key] === '') continue;
    const year = parseInt(props[key], 10);
    if (Number.isFinite(year)) return year;
  }

  return null;
}

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

function matchesFeatureIdentity(candidate, identity) {
  if (!identity || !candidate?.properties) return false;
  const value = candidate.properties[identity.key];
  if (value === undefined || value === null) return false;
  return String(value) === identity.value;
}

function collectHoverSeries(baseFeature, fields) {
  const source = window.multiLoaderState?.originalData || window.appData?.lastFC;
  if (!source || !Array.isArray(source.features) || source.features.length === 0) return null;

  const identity = getFeatureIdentity(baseFeature);
  let candidates = source.features;

  if (identity) {
    const matched = candidates.filter(f => matchesFeatureIdentity(f, identity));
    if (matched.length > 0) candidates = matched;
  }

  const byYear = new Map();

  // Prepare arrays of all values per field to enable percentile/min/max checks
  const allePerField = {};
  for (const field of fields) {
    allePerField[field] = source.features
      .map(f => {
        const v = f.properties?.[field];
        return (v === null || v === undefined || v === '') ? null : +v;
      })
      .filter(v => Number.isFinite(v));
  }

  const activeFilter = window.appData?.filter || null;

  for (const candidate of candidates) {
    const year = detectYearFromFeature(candidate);
    if (!Number.isFinite(year)) continue;

    if (!byYear.has(year)) {
      const fieldBuckets = {};
      for (const field of fields) fieldBuckets[field] = [];
      byYear.set(year, fieldBuckets);
    }

    const bucket = byYear.get(year);
    for (const field of fields) {
      const raw = candidate.properties?.[field];
      if (raw === undefined || raw === null || raw === '') continue;
      const num = +raw;
      if (!Number.isFinite(num)) continue;

      // Apply active map filter: only include values that pass
      const alleVals = allePerField[field] || [];
      if (!waardePasseertFilter(num, alleVals, activeFilter)) continue;

      bucket[field].push(num);
    }
  }

  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  if (years.length === 0) return null;

  const series = {};
  const allValues = [];

  for (const field of fields) {
    const points = years
      .map(year => {
        const values = byYear.get(year)?.[field] || [];
        if (values.length === 0) return null;
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        return { year, value: avg };
      })
      .filter(Boolean);

    series[field] = points;
    points.forEach(p => allValues.push(p.value));
  }

  if (allValues.length === 0) return null;

  return {
    years,
    series,
    allValues,
    identity
  };
}

function renderHoverChartMessage(panel, titleText, message) {
  const titleEl = panel.querySelector('.hover-timeseries-title');
  const bodyEl = panel.querySelector('.hover-timeseries-body');
  if (!titleEl || !bodyEl) return;

  titleEl.textContent = titleText;
  bodyEl.innerHTML = `<div class="hover-timeseries-empty">${message}</div>`;
  panel.classList.add('is-visible');
}

function toonHoverJarenGrafiek(feature, defaultField) {
  cancelHideHoverChartPanel();

  const panel = getHoverChartPanel();
  if (!panel) return;
  if (typeof d3 === 'undefined') {
    renderHoverChartMessage(panel, 'Trend over jaren', 'D3 is niet beschikbaar.');
    return;
  }

  const fields = getSelectedFieldsForHover(defaultField);
  if (fields.length === 0) {
    renderHoverChartMessage(panel, 'Trend over jaren', 'Selecteer eerst een variabele.');
    return;
  }

  const data = collectHoverSeries(feature, fields);
  const preferredName = feature?.properties?.buurtnaam || feature?.properties?.wijknaam || feature?.properties?.naam || feature?.properties?.name;
  const identityValue = preferredName || data?.identity?.value || 'Gebied';
  const title = `Trend over jaren - ${identityValue}`;

  if (!data) {
    renderHoverChartMessage(panel, title, 'Geen jaarreeks beschikbaar voor dit gebied.');
    return;
  }

  const titleEl = panel.querySelector('.hover-timeseries-title');
  const bodyEl = panel.querySelector('.hover-timeseries-body');
  if (!titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = '';

  const width = HOVER_CHART_CONFIG.panelWidth;
  const height = HOVER_CHART_CONFIG.panelHeight;

  const svg = d3
    .select(bodyEl)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Trendgrafiek per geselecteerde variabele');

  const xExtent = d3.extent(data.years);
  let xMin = xExtent[0];
  let xMax = xExtent[1];
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }

  let yMin = d3.min(data.allValues);
  let yMax = d3.max(data.allValues);
  if (yMin === yMax) {
    const pad = Math.abs(yMin || 1) * 0.05;
    yMin -= pad;
    yMax += pad;
  }

  const xScale = d3
    .scaleLinear()
    .domain([xMin, xMax])
    .range([HOVER_CHART_CONFIG.marginLeft, width - HOVER_CHART_CONFIG.marginRight]);

  const yScale = d3
    .scaleLinear()
    .domain([yMin, yMax])
    .nice()
    .range([height - HOVER_CHART_CONFIG.marginBottom, HOVER_CHART_CONFIG.marginTop]);

  svg
    .append('g')
    .attr('transform', `translate(0,${height - HOVER_CHART_CONFIG.marginBottom})`)
    .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')));

  svg
    .append('g')
    .attr('transform', `translate(${HOVER_CHART_CONFIG.marginLeft},0)`)
    .call(d3.axisLeft(yScale).ticks(4));

  const line = d3
    .line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.value));

  const colors = d3.scaleOrdinal(d3.schemeTableau10).domain(fields);

  for (const field of fields) {
    const points = data.series[field] || [];
    if (points.length === 0) continue;

    const pathLength = 1000;

    const pathElement = svg
      .append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', colors(field))
      .attr('stroke-width', 2)
      .attr('d', line)
      .attr('stroke-dasharray', pathLength)
      .attr('stroke-dashoffset', pathLength)
      .attr('opacity', 0.85);

    pathElement
      .transition()
      .duration(600)
      .ease(d3.easeCubicInOut)
      .attr('stroke-dashoffset', 0);

    const circleElement = svg
      .append('circle')
      .attr('cx', xScale(points[points.length - 1].year))
      .attr('cy', yScale(points[points.length - 1].value))
      .attr('r', 2.5)
      .attr('fill', colors(field))
      .attr('opacity', 0);

    circleElement
      .transition()
      .delay(350)
      .duration(300)
      .ease(d3.easeQuadOut)
      .attr('opacity', 1);
  }

  const selectedYear = getCurrentSelectedYear();
  if (Number.isFinite(selectedYear)) {
    const withinDomain = selectedYear >= xMin && selectedYear <= xMax;
    if (withinDomain) {
      const markerLine = svg
        .append('line')
        .attr('x1', xScale(selectedYear))
        .attr('x2', xScale(selectedYear))
        .attr('y1', HOVER_CHART_CONFIG.marginTop)
        .attr('y2', height - HOVER_CHART_CONFIG.marginBottom)
        .attr('class', 'hover-chart-year-marker')
        .attr('opacity', 0);

      markerLine
        .transition()
        .delay(500)
        .duration(300)
        .ease(d3.easeQuadOut)
        .attr('opacity', 0.9);

      for (const field of fields) {
        const points = data.series[field] || [];
        const match = points.find(p => p.year === selectedYear);
        if (!match) continue;

        const highlight = svg
          .append('circle')
          .attr('cx', xScale(match.year))
          .attr('cy', yScale(match.value))
          .attr('r', 0)
          .attr('fill', colors(field))
          .attr('stroke', '#111')
          .attr('stroke-width', 1.4)
          .attr('opacity', 0);

        highlight
          .transition()
          .delay(550)
          .duration(350)
          .ease(d3.easeBackOut)
          .attr('r', 5)
          .attr('opacity', 1);
      }
    }
  }

  const legend = d3
    .select(bodyEl)
    .append('div')
    .attr('class', 'hover-timeseries-legend')
    .style('opacity', 0);

  fields.forEach(field => {
    const hasData = (data.series[field] || []).length > 0;
    const item = legend.append('span').attr('class', 'legend-item');

    item
      .append('i')
      .style('background', colors(field))
      .style('opacity', hasData ? 1 : 0.35);

    item.append('b').text(field);
  });

  d3.select(bodyEl)
    .select('.hover-timeseries-legend')
    .transition()
    .delay(700)
    .duration(300)
    .ease(d3.easeQuadOut)
    .style('opacity', 1);

  panel.classList.add('is-visible');
}

window.hideHoverTimeSeries = scheduleHideHoverChartPanel;

// ============================================================================
// KLEURSCHEMA'S
// ============================================================================

/**
 * Haal kleurarray uit D3 ColorBrewer
 * @param {string} naam - viridis, rdylgn, blues, oranges
 * @param {number} aantal - Aantal kleuren
 * @return {Array} Hex-kleuren
 */
function haalKleurSchema(naam, aantal) {
  switch ((naam || '').toLowerCase()) {
    case 'rdylgn': return d3.quantize(d3.interpolateRdYlGn, aantal);
    case 'blues': return d3.quantize(d3.interpolateBlues, aantal);
    case 'oranges': return d3.quantize(d3.interpolateOranges, aantal);
    case 'viridis':
    default: return d3.quantize(d3.interpolateViridis, aantal);
  }
}

// ============================================================================
// KLASSIFICATIE — Bereken breaks voor choropleth
// ============================================================================

/**
 * Quantile: verdeel in gelijke groepen
 * @param {Array} waarden
 * @param {number} aantalKlassen
 * @return {Array} Waarde-grenzen inclusief min/max
 */
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

/**
 * Equal Interval: gelijke waarde-stappen
 * @param {Array} waarden
 * @param {number} aantalKlassen
 * @return {Array} Waarde-grenzen inclusief min/max
 */
function berekenBreaksEqualInterval(waarden, aantalKlassen) {
  const gesorteerd = waarden.slice().sort((a, b) => a - b);
  const min = gesorteerd[0];
  const max = gesorteerd[gesorteerd.length - 1];
  const breuken = [min];
  
  for (let i = 1; i < aantalKlassen; i++) {
    breuken.push(min + (max - min) * i / aantalKlassen);
  }
  breuken.push(max);
  return breuken;
}

// ============================================================================
// LEGENDA
// ============================================================================

/**
 * Teken legenda in #legend div
 * @param {Array} breuken - Waardebreaken
 * @param {Array} kleuren - Kleurarray
 * @param {string} veldnaam - Naam van veld (voor titel)
 */
function tekenLegenda(breuken, kleuren, veldnaam) {
  const legendDiv = document.getElementById('legend');
  if (!legendDiv) return;
  
  legendDiv.innerHTML = '';
  
  // Titel
  const titel = document.createElement('h3');
  titel.textContent = `Legenda: ${veldnaam}`;
  titel.style.margin = '0 0 8px 0';
  legendDiv.appendChild(titel);
  
  // Voeg "Geen data" bovenaan toe
  const geenDataRij = document.createElement('div');
  geenDataRij.style.display = 'flex';
  geenDataRij.style.alignItems = 'center';
  geenDataRij.style.marginBottom = '4px';
  geenDataRij.style.fontSize = '12px';
  
  const geenDataKastje = document.createElement('div');
  geenDataKastje.style.width = '20px';
  geenDataKastje.style.height = '14px';
  geenDataKastje.style.backgroundColor = '#ccc';
  geenDataKastje.style.marginRight = '8px';
  geenDataKastje.style.border = '1px solid #666';
  
  const geenDataLabel = document.createElement('span');
  geenDataLabel.textContent = 'Geen data';
  geenDataLabel.style.fontStyle = 'italic';
  
  geenDataRij.appendChild(geenDataKastje);
  geenDataRij.appendChild(geenDataLabel);
  legendDiv.appendChild(geenDataRij);
  
  // Voeg scheider toe
  const scheider = document.createElement('div');
  scheider.style.borderTop = '1px solid #ddd';
  scheider.style.margin = '4px 0 4px 0';
  legendDiv.appendChild(scheider);
  
  // Kleurkastjes met ranges
  for (let i = 0; i < kleuren.length; i++) {
    const rij = document.createElement('div');
    rij.style.display = 'flex';
    rij.style.alignItems = 'center';
    rij.style.marginBottom = '4px';
    rij.style.fontSize = '12px';
    
    const kastje = document.createElement('div');
    kastje.style.width = '20px';
    kastje.style.height = '14px';
    kastje.style.backgroundColor = kleuren[i];
    kastje.style.marginRight = '8px';
    kastje.style.border = '1px solid #666';
    
    const label = document.createElement('span');
    const van = breuken[i] ? breuken[i].toFixed(1) : '';
    const tot = breuken[i + 1] ? breuken[i + 1].toFixed(1) : '∞';
    label.textContent = `${van} – ${tot}`;
    
    rij.appendChild(kastje);
    rij.appendChild(label);
    legendDiv.appendChild(rij);
  }
}

// ============================================================================
// HOOFD-FUNCTIE: Toon choropleth
// ============================================================================

/**
 * Teken choropleth-kaart met gekozen instellingen
 * @param {GeoJSON} fc - FeatureCollection met alle features
 * @param {string} veld - Numeriek eigenschapsveld om te visualiseren
 * @param {Object} opties - {method, palette, opacity, classes}
 */
window.toonChoropleth = function(fc, veld, opties = {}) {
  if (!fc || !fc.features || fc.features.length === 0) return;
  
  // Instellingen + defaults
  const methode = opties.method || KAART_CONFIG.standaardClassificatie;
  const palet = opties.palette || KAART_CONFIG.standaardKleurPalet;
  const transparantie = typeof opties.opacity === 'number'
    ? opties.opacity
    : KAART_CONFIG.standaardTransparantie;
  const aantalKlassen = Math.min(
    opties.classes || KAART_CONFIG.standaardAantalKlassen,
    fc.features.length
  );
  
  // Verwijder vorige choropleth-laag
  if (window.appData.baseGeoLayer) {
    window.appData.dataLayer.removeLayer(window.appData.baseGeoLayer);
    window.appData.baseGeoLayer = null;
  }
  if (window.appData.choroplethLayer) {
    window.appData.dataLayer.removeLayer(window.appData.choroplethLayer);
    window.appData.choroplethLayer = null;
  }
  
  // Haal alle numerieke waarden
  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  if (alleWaarden.length === 0) {
    alert(`Geen numerieke waarden gevonden voor "${veld}"`);
    return;
  }
  
  // Pas filter toe (als actief)
  const activeFilter = window.appData?.filter || null;
  const gefilterdFeatures = filtreerdFeatures(fc, veld, activeFilter);
  const gefilterdWaarden = gefilterdFeatures
    .map(f => +f.properties[veld])
    .filter(v => !isNaN(v));
  const teGebruikenWaarden = gefilterdWaarden.length > 0
    ? gefilterdWaarden
    : alleWaarden;
  
  // Bereken breaks op basis van methode
  let breuken = [];
  if (methode === 'equal') {
    breuken = berekenBreaksEqualInterval(teGebruikenWaarden, aantalKlassen);
  } else {
    breuken = berekenBreaksQuantile(teGebruikenWaarden, aantalKlassen);
  }
  
  // Haal kleuren
  const kleuren = haalKleurSchema(palet, aantalKlassen);

  // If wijken data is available globally but buurten features don't yet have
  // overlapping_wijken, try to compute them via the light-weight helper.
  try {
    const hasOverlaps = (fc.features || []).some(f => f.properties && Array.isArray(f.properties.overlapping_wijken) && f.properties.overlapping_wijken.length > 0);
    if (!hasOverlaps && window.multiLoaderState && window.multiLoaderState.wijkenFC && typeof addWijkenToBuurten === 'function') {
      addWijkenToBuurten(fc, window.multiLoaderState.wijkenFC);
    }
  } catch (e) { /* ignore */ }
  
  // === STYLING FUNCTIE ===
  function styleFeature(feature) {
    const waarde = feature.properties?.[veld];
    const passeertFilter = waardePasseertFilter(waarde, alleWaarden, activeFilter);
    
    // Buiten filter → grijs
    if (!passeertFilter) {
      return {
        color: KAART_CONFIG.gefilterdRandKleur,
        weight: 0.6,
        fillOpacity: 0.45,
        fillColor: '#bdbdbd'
      };
    }
    
    // Geen waarde → lichtgrijs
    if (waarde === null || waarde === undefined || waarde === '' || isNaN(+waarde)) {
      return {
        color: KAART_CONFIG.gefilterdRandKleur,
        weight: 0.6,
        fillOpacity: 0.3,
        fillColor: '#ccc'
      };
    }
    
    // Bepaal kleur op basis van breaks
    const numWaarde = +waarde;
    let toonKleur = '#ddd';
    
    for (let i = 0; i < kleuren.length; i++) {
      if (i === kleuren.length - 1) {
        toonKleur = kleuren[i];
        break;
      } else if (numWaarde < breuken[i + 1]) {
        toonKleur = kleuren[i];
        break;
      }
    }
    
    return {
      color: KAART_CONFIG.randKleur,
      weight: KAART_CONFIG.randBreedte,
      fillOpacity: transparantie,
      fillColor: toonKleur
    };
  }
  
  // === LAAG TOEVOEGEN ===
  // Zorg dat speciale panes bestaan voordat we de laag toevoegen (voorkomt render-issues)
  try {
    const map = window.appData.map;
    if (map) {
      if (!map.getPane('dimPane')) map.createPane('dimPane');
      if (!map.getPane('choroplethWijkBorderPane')) map.createPane('choroplethWijkBorderPane');
      if (!map.getPane('choroplethPane')) map.createPane('choroplethPane');
      map.getPane('dimPane').style.zIndex = 450;
      map.getPane('choroplethPane').style.zIndex = 460;
      // Pane speciaal voor dikkere wijkranden die altijd bovenop moeten komen
      try { map.getPane('choroplethWijkBorderPane').style.zIndex = 475; } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  const laag = L.geoJSON(fc, {
    style: styleFeature,
    pane: 'choroplethPane',
    onEachFeature: (feature, leafletLayer) => {
      const popupHtml = bouwFeaturePopup(feature, veld, activeFilter, alleWaarden);

      leafletLayer.bindPopup(popupHtml, {
        closeButton: false,
        autoPan: false
      });

      // Per-feature we alleen de hover state bijhouden; popup mouse handlers
      // worden globaal op de kaart afgehandeld (zie map popup listeners).
      leafletLayer.on('mouseover', function () {
        mouseIsOverFeature = true;
        cancelHideHoverChartPanel();
        this.openPopup();
        toonHoverJarenGrafiek(feature, veld);
        try {
          // Broadcast hover to split parent so peer pane can highlight the same area
          if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
            const identity = getFeatureIdentity(feature);
            if (identity && window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'heerlen-hover',
                panelId: window.splitScreenPanelId || null,
                identity
              }, '*');
            }
          }
        } catch (e) { /* ignore */ }
      });

      leafletLayer.on('mouseout', function () {
        mouseIsOverFeature = false;
        // Don't close the popup immediately - allow entering the popup element
        // or the chart panel to cancel the hide.
        if (shouldHideHoverChart()) {
          scheduleHideHoverChartPanel();
        } else {
          // If other hover states are active, ensure any pending hide is cancelled
          cancelHideHoverChartPanel();
        }
        try {
          if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'heerlen-hover-clear', panelId: window.splitScreenPanelId || null }, '*');
            }
          }
        } catch (e) { /* ignore */ }
      });

      leafletLayer.on('click', () => {
        leafletLayer.openPopup();
      });
    }
  }).addTo(window.appData.dataLayer);
    if (window.bringSmallPolygonsToFront) {
      window.bringSmallPolygonsToFront(window.appData.dataLayer);
    }
  
  window.appData.choroplethLayer = laag;

  // --- Tekenen van dikke grenzen voor echte WIJKEN (bovenop) ---
  try {
    // Verwijder bestaande wijk-border laag als aanwezig
    if (window.appData.choroplethWijkBorderLayer) {
      try { window.appData.dataLayer.removeLayer(window.appData.choroplethWijkBorderLayer); } catch (e) { /* ignore */ }
      window.appData.choroplethWijkBorderLayer = null;
    }

    // Only create thick wijk borders from an explicit wijken FeatureCollection
    // (e.g. loaded via PDOK and stored in window.multiLoaderState.wijkenFC).
    const wijkSourceFC = window.multiLoaderState && window.multiLoaderState.wijkenFC ? window.multiLoaderState.wijkenFC : null;
    if (wijkSourceFC && Array.isArray(wijkSourceFC.features) && wijkSourceFC.features.length > 0) {
      const wijkBorderStyle = function () {
        return {
          color: KAART_CONFIG.randKleur,
          weight: KAART_CONFIG.wijkRandBreedte || (KAART_CONFIG.randBreedte * 3),
          opacity: 1,
          fillOpacity: 0
        };
      };

      const wijkBorderLayer = L.geoJSON(wijkSourceFC, {
        style: wijkBorderStyle,
        pane: 'choroplethWijkBorderPane',
        interactive: false
      }).addTo(window.appData.dataLayer);

      // Ensure border layer is above choropleth and dim overlays
      try { if (wijkBorderLayer && typeof wijkBorderLayer.bringToFront === 'function') wijkBorderLayer.bringToFront(); } catch (e) { /* ignore */ }
      window.appData.choroplethWijkBorderLayer = wijkBorderLayer;
    }
    // If no explicit wijkenFC is available, do not create a thick wijk border
    // from the buurten dataset (avoids making every buurt border thick).
  } catch (e) { /* ignore */ }
  
  // --- Dim achtergrond buiten de gevisualiseerde gebieden (pane-based) ---
  (function setupDimPane() {
    const map = window.appData.map;
    if (!map) return;

    // Create panes if they don't exist
    if (!map.getPane('dimPane')) map.createPane('dimPane');
    if (!map.getPane('choroplethPane')) map.createPane('choroplethPane');

    const dimPane = map.getPane('dimPane');
    const choroplethPane = map.getPane('choroplethPane');

    // z-index ordering: dimPane below choroplethPane
    dimPane.style.zIndex = 450;
    choroplethPane.style.zIndex = 460;

    // Ensure choropleth layer uses the choropleth pane
    // (we set pane when creating the layer above)

    // Remove any existing overlay element
    const existing = dimPane.querySelector('.choropleth-dim-overlay');
    if (existing) existing.remove();

    // Create an SVG overlay that contains a mask with holes matching the choropleth polygons.
    // This projects GeoJSON coordinates to container points on every view change so holes stay aligned.
    const mapContainer = (map && typeof map.getContainer === 'function') ? map.getContainer() : document.getElementById('map');
    if (!mapContainer) return;

    // Remove existing svg overlay
    const oldSvg = mapContainer.querySelector('svg.choropleth-dim-svg');
    if (oldSvg) oldSvg.remove();

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('choropleth-dim-svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '400';

    const defs = document.createElementNS(svgNS, 'defs');
    svg.appendChild(defs);

    const mask = document.createElementNS(svgNS, 'mask');
    const maskId = `choropleth-dim-mask`;
    mask.setAttribute('id', maskId);
    defs.appendChild(mask);

    window.appData.choroplethDimOverlayState = {
      map,
      mapContainer,
      mask,
      popupEl: null
    };

    // full white rect to show by default
    const fullRect = document.createElementNS(svgNS, 'rect');
    fullRect.setAttribute('x', '0');
    fullRect.setAttribute('y', '0');
    fullRect.setAttribute('width', '100%');
    fullRect.setAttribute('height', '100%');
    fullRect.setAttribute('fill', 'white');
    mask.appendChild(fullRect);

    // overlay rect that will dim the map; it will be masked by polygon holes
    const overlayRect = document.createElementNS(svgNS, 'rect');
    overlayRect.setAttribute('x', '0');
    overlayRect.setAttribute('y', '0');
    overlayRect.setAttribute('width', '100%');
    overlayRect.setAttribute('height', '100%');
    overlayRect.setAttribute('fill', '#000');
    overlayRect.setAttribute('opacity', '0.6');
    overlayRect.setAttribute('mask', `url(#${maskId})`);

    // Insert overlayRect as first child so choropleth paths (in other panes) render above it
    svg.appendChild(overlayRect);

    mapContainer.appendChild(svg);

    // Function to clear holes and recreate from GeoJSON features
    function updateMaskFromFeatures() {
      // remove previous hole paths (keep first child fullRect)
      while (mask.childNodes.length > 1) mask.removeChild(mask.lastChild);

      function projectCoords(coord) {
        // coord [lng, lat]
        const p = map.latLngToContainerPoint([coord[1], coord[0]]);
        return `${p.x},${p.y}`;
      }

      function ringToPath(ring) {
        return ring.map(projectCoords).map((c, i) => (i === 0 ? `M${c}` : `L${c}`)).join(' ') + ' Z';
      }

      const popupEl = window.appData.choroplethDimOverlayState?.popupEl;
      if (popupEl) {
        const popupRect = popupEl.getBoundingClientRect();
        const containerRect = mapContainer.getBoundingClientRect();
        const left = Math.max(0, popupRect.left - containerRect.left);
        const top = Math.max(0, popupRect.top - containerRect.top);
        const width = Math.min(containerRect.width - left, popupRect.width);
        const height = Math.min(containerRect.height - top, popupRect.height);

        if (width > 0 && height > 0) {
          const popupHole = document.createElementNS(svgNS, 'rect');
          popupHole.setAttribute('x', String(left));
          popupHole.setAttribute('y', String(top));
          popupHole.setAttribute('width', String(width));
          popupHole.setAttribute('height', String(height));
          popupHole.setAttribute('rx', '12');
          popupHole.setAttribute('ry', '12');
          popupHole.setAttribute('fill', 'black');
          popupHole.setAttribute('stroke', 'none');
          mask.appendChild(popupHole);
        }
      }

      // For each feature, build path(s)
      (fc.features || []).forEach(feat => {
        const geom = feat.geometry;
        if (!geom) return;
        if (geom.type === 'Polygon') {
          const d = geom.coordinates.map(ringToPath).join(' ');
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'black');
          path.setAttribute('stroke', 'none');
          mask.appendChild(path);
        } else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach(poly => {
            const d = poly.map(ringToPath).join(' ');
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'black');
            path.setAttribute('stroke', 'none');
            mask.appendChild(path);
          });
        }
      });
    }

    // Initial and update on view changes
    updateMaskFromFeatures();

    // Attach listeners (throttled during continuous moves using rAF)
    // Remove previous listener if present
    try {
      if (map._choroplethDimUpdater) {
        map.off('move moveend viewreset zoomend resize', map._choroplethDimUpdater);
        map._choroplethDimUpdater = null;
      }
    } catch (e) { /* ignore */ }

    let rafId = null;
    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        try { updateMaskFromFeatures(); } catch (e) { /* ignore */ }
      });
    };

    window.requestChoroplethDimOverlayUpdate = schedule;

    // Listen to a wide set of map events so the mask updates continuously
    map.on('move moveend viewreset zoom zoomstart zoomend zoomanim resize', schedule);
    map._choroplethDimUpdater = schedule;

    // Bring choropleth layer to front so it appears above the dim overlay
    try {
      if (window.appData.choroplethLayer && typeof window.appData.choroplethLayer.bringToFront === 'function') {
        window.appData.choroplethLayer.bringToFront();
      }
    } catch (e) { /* ignore */ }

  })();
  
  // Zoom naar data ALLEEN als dit een nieuwe dataset is (niet bij visuele updates)
  const isNieuweDataset = window.appData.lastLoadedData !== fc;
  const suppressFit = window.appData?.skipFitOnNextRender;
  // Always update lastLoadedData so future dataset-detection works
  if (isNieuweDataset) {
    // If a suppression flag is set (e.g., year filter), skip fitBounds once
    if (!suppressFit) {
      try {
        window.appData.map.fitBounds(laag.getBounds(), {
          maxZoom: KAART_CONFIG.maxZoomNaDataLoad
        });
      } catch (e) { /* negeren */ }
    }
    // Clear suppression flag after use
    if (suppressFit) {
      delete window.appData.skipFitOnNextRender;
    }
    window.appData.lastLoadedData = fc;
  }
  
  // Teken legenda
  tekenLegenda(breuken, kleuren, veld);
};

// Alias voor achterwaarts compatibiliteit
window.applyChoropleth = window.toonChoropleth;

// Globale popup handlers: zorg dat when popup open is, hover over popup telt
// zodat het paneel niet flickert als de gebruiker van feature -> popup -> paneel beweegt.
if (map && typeof map.on === 'function') {
  map.on('popupopen', (e) => {
    try {
      const popupEl = e.popup && e.popup.getElement ? e.popup.getElement() : null;
      if (!popupEl) return;

      // Ensure we only attach once
      if (!popupEl.__hoverHandlersAttached) {
        popupEl.__hoverHandlersAttached = true;

        popupEl.addEventListener('mouseenter', () => {
          mouseIsOverPopup = true;
          cancelHideHoverChartPanel();
          try {
            if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
              const feature = e.popup && e.popup._source && e.popup._source.feature ? e.popup._source.feature : null;
              const identity = feature ? getFeatureIdentity(feature) : null;
              if (identity && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'heerlen-hover', identity, panelId: window.splitScreenPanelId || null }, '*');
              }
            }
          } catch (err) { /* ignore */ }
        });

        popupEl.addEventListener('mouseleave', () => {
          mouseIsOverPopup = false;
          if (shouldHideHoverChart()) scheduleHideHoverChartPanel();
          try {
            if (window.isSplitScreenPane && !window.__suppressHoverBroadcast) {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'heerlen-hover-clear', panelId: window.splitScreenPanelId || null }, '*');
              }
            }
          } catch (err) { /* ignore */ }
        });
      }

      const overlayState = window.appData?.choroplethDimOverlayState;
      if (overlayState) {
        overlayState.popupEl = popupEl;
      }

      if (typeof window.requestChoroplethDimOverlayUpdate === 'function') {
        window.requestChoroplethDimOverlayUpdate();
      }
    } catch (err) { /* ignore */ }
  });

  map.on('popupclose', (e) => {
    mouseIsOverPopup = false;
    const overlayState = window.appData?.choroplethDimOverlayState;
    if (overlayState) {
      overlayState.popupEl = null;
    }
    if (typeof window.requestChoroplethDimOverlayUpdate === 'function') {
      window.requestChoroplethDimOverlayUpdate();
    }
    if (shouldHideHoverChart()) scheduleHideHoverChartPanel();
  });
}

// --- Hover synchronization: receive highlight requests from peer pane ---
function findLayerByIdentity(identity) {
  if (!identity || !window.appData || !window.appData.dataLayer) return null;
  let found = null;
  try {
    window.appData.dataLayer.eachLayer(function search(layer) {
      if (found) return;
      if (layer && layer.feature && matchesFeatureIdentity(layer.feature, identity)) {
        found = layer;
        return;
      }
      if (layer && typeof layer.eachLayer === 'function') {
        layer.eachLayer(function (inner) {
          if (found) return;
          if (inner && inner.feature && matchesFeatureIdentity(inner.feature, identity)) {
            found = inner;
          }
        });
      }
    });
  } catch (e) { /* ignore */ }
  return found;
}

function highlightFeatureByIdentity(identity) {
  const layer = findLayerByIdentity(identity);
  if (!layer) return false;
  try {
    // Suppress broadcasting while we programmatically show popup/highlight
    window.__suppressHoverBroadcast = true;
    layer.openPopup();
    try { toonHoverJarenGrafiek(layer.feature); } catch (e) { /* ignore */ }
    // small timeout then re-enable broadcast
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
    if (map && typeof map.closePopup === 'function') map.closePopup();
    if (typeof window.hideHoverTimeSeries === 'function') window.hideHoverTimeSeries();
    setTimeout(() => { window.__suppressHoverBroadcast = false; }, 250);
  } catch (e) { window.__suppressHoverBroadcast = false; }
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'heerlen-set-hover' && data.identity) {
    highlightFeatureByIdentity(data.identity);
  } else if (data.type === 'heerlen-clear-hover') {
    clearPeerHighlight();
  }
});

// ============================================================================
// COÖRDINAAT-REPROJECTION — RD (EPSG:28992) naar WGS84
// ============================================================================

// Definieer RD-projectie als proj4 beschikbaar is
if (typeof proj4 !== 'undefined') {
  try {
    proj4.defs('EPSG:28992',
      '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 ' +
      '+k=0.9999079 +x_0=155000 +y_0=463000 ' +
      '+ellps=bessel +units=m +no_defs'
    );
  } catch (e) { /* al gedefinieerd */ }
}

/**
 * Detecteer of geometriecoördinaten geprojecteerd zijn (grote getallen -> RD/meters)
 */
function coorsDinatenZijnGeprojecteerd(geom) {
  let gevonden = false;
  function loop(c) {
    if (gevonden) return;
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number' && typeof c[1] === 'number') {
        if (Math.abs(c[0]) > 1000 || Math.abs(c[1]) > 1000) gevonden = true;
      } else {
        c.forEach(loop);
      }
    }
  }
  loop(geom.coordinates);
  return gevonden;
}

/**
 * Herprojecteer geometrie van RD naar WGS84
 */
function herprojecteerGeometrie(geom) {
  if (!proj4) return geom;
  
  const herprojecteerPunt = (pt) => {
    const p = proj4('EPSG:28992', 'EPSG:4326', pt);
    return [p[0], p[1]];
  };
  
  if (geom.type === 'Point') {
    geom.coordinates = herprojecteerPunt(geom.coordinates);
  } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
    geom.coordinates = geom.coordinates.map(herprojecteerPunt);
  } else if (geom.type === 'Polygon') {
    geom.coordinates = geom.coordinates.map(r => r.map(herprojecteerPunt));
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates = geom.coordinates.map(p => p.map(r => r.map(herprojecteerPunt)));
  }
  return geom;
}

/**
 * Herprojecteer FeatureCollection van RD naar WGS84 indien nodig
 * @param {GeoJSON} fc
 * @return {GeoJSON} Geherprojecteerde fc
 */
window.herprojecteerAlsNodig = function(fc) {
  if (!fc || !fc.features || !proj4) return fc;
  
  for (const f of fc.features) {
    if (f.geometry && coorsDinatenZijnGeprojecteerd(f.geometry)) {
      f.geometry = herprojecteerGeometrie(f.geometry);
    }
  }
  return fc;
};

// Zorg dat appData object bestaat
window.appData = window.appData || {};
