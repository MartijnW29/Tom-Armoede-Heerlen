// ============================================================================
// APP.JS — Heerlen Opportunity Atlas
// ============================================================================
// Bestand voor: Kaart-initialisatie, event-listeners, filter- en visualisatie-logica
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier aan voor je eigen project
// ============================================================================

const APP_CONFIG = {
  // Kaart-instellingen
  kaartCentrum: [50.8889, 5.9794],       // Heerlen centrum (lat, lon)
  standaardZoom: 12,                     // Initieel zoomniveau
  maxZoom: 19,                           // Maximaal zoomniveau
  
  // Basemap
  basemapUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  basemapAttr: '© OpenStreetMap contributors',
  
  // Visualisatie-defaults
  standaardMethode: 'quantile',          // quantile of equal
  standaardPalet: 'rdylgn',             // ColorBrewer palet (default naar RdYlGn gezet)
  standaardOpaciteit: 0.50,               // 0.0–1.0
  standaardAantalKlassen: 5,             // Aantal kleurklassen
  
  // API-endpoints (PDOK Buurten/Wijken voor Heerlen gemeentecode GM0917)
  pdokBuurtenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json',
  pdokWijkenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json',
};

window.APP_SETTINGS = window.APP_SETTINGS || {};

function getDefaultOpacity() {
  return typeof window.APP_SETTINGS.defaultOpacity === 'number'
    ? window.APP_SETTINGS.defaultOpacity
    : APP_CONFIG.standaardOpaciteit;
}

window.syncOpacityDefaults = function syncOpacityDefaults() {
  const opacityRange = document.getElementById('opacity-range');
  if (opacityRange) {
    opacityRange.value = String(getDefaultOpacity());
  }
};

// ============================================================================
// INITIALISATIE — Kaart en basislagen
// ============================================================================

// Maak kaart
const map = L.map('map').setView(APP_CONFIG.kaartCentrum, APP_CONFIG.standaardZoom);

// OpenStreetMap basemap
L.tileLayer(APP_CONFIG.basemapUrl, {
  maxZoom: APP_CONFIG.maxZoom,
  attribution: APP_CONFIG.basemapAttr
}).addTo(map);

// Data-laag (container voor alle data-visualisaties)
const dataLayer = L.layerGroup().addTo(map);

function polygonRingArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function featureArea(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === 'Polygon') {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    if (rings.length === 0) return null;
    const outerRing = polygonRingArea(rings[0]);
    const holesArea = rings.slice(1).reduce((sum, ring) => sum + polygonRingArea(ring), 0);
    return Math.max(outerRing - holesArea, 0);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, polygon) => {
      const rings = Array.isArray(polygon) ? polygon : [];
      if (rings.length === 0) return sum;
      const outerRing = polygonRingArea(rings[0]);
      const holesArea = rings.slice(1).reduce((innerSum, ring) => innerSum + polygonRingArea(ring), 0);
      return sum + Math.max(outerRing - holesArea, 0);
    }, 0);
  }

  return null;
}

function applySmallPolygonsToFront(rootLayer) {
  if (!rootLayer || typeof rootLayer.eachLayer !== 'function') return;

  const polygonLayers = [];

  const collectLayers = (layer) => {
    if (!layer) return;

    if (typeof layer.eachLayer === 'function' && !layer.feature) {
      layer.eachLayer(collectLayers);
      return;
    }

    const area = featureArea(layer.feature);
    if (typeof area === 'number' && typeof layer.bringToFront === 'function') {
      polygonLayers.push({ layer, area });
    }
  };

  rootLayer.eachLayer(collectLayers);

  polygonLayers
    .sort((a, b) => b.area - a.area)
    .forEach(({ layer }) => layer.bringToFront());
}

window.bringSmallPolygonsToFront = function bringSmallPolygonsToFront(rootLayer) {
  applySmallPolygonsToFront(rootLayer);

  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => setTimeout(callback, 0);

  schedule(() => applySmallPolygonsToFront(rootLayer));
};

// Globale applicatiestate
window.appData = {
  map,
  dataLayer,
  lastFC: null,
  compareMode: false,
  compareFC: null,
  baseGeoLayer: null,
  choroplethLayer: null,
  filter: {
    min: 0.01
  }
};

window.syncOpacityDefaults();

// ============================================================================
// HULPFUNCTIES
// ============================================================================

/**
 * Herlaad visualisatie met huidige instellingen
 */
function herllaadVisualisatie() {
  // Read selected fields from dynamic selectors (fallback to single select)
  const geselecteerde = (window.getSelectedFields && window.getSelectedFields()) || [];
  const veld = geselecteerde.length > 0 ? geselecteerde[0] : document.getElementById('field-select')?.value;
  const fc = window.appData?.lastFC;
  if (!veld || !fc || !window.toonChoropleth) return;
  
  const methode = document.getElementById('method-select')?.value || APP_CONFIG.standaardMethode;
  const palet = document.getElementById('palette-select')?.value || APP_CONFIG.standaardPalet;
  const opaciteit = parseFloat(document.getElementById('opacity-range')?.value || getDefaultOpacity());
  
  window.toonChoropleth(fc, veld, {
    method: methode,
    palette: palet,
    opacity: opaciteit,
    classes: APP_CONFIG.standaardAantalKlassen
  });

  // If multiple fields selected, render charts for all of them
  if (geselecteerde.length > 0 && window.renderMultiVariableCharts) {
    window.renderMultiVariableCharts(fc, geselecteerde);
  } else if (window.renderMultiVariableCharts) {
    window.renderMultiVariableCharts(fc, [veld]);
  }
}

// Remove old compare-mode button behavior (if present)
const startCompareBtn = document.getElementById('start-compare');
if (startCompareBtn) startCompareBtn.remove();

// ---- dynamic selector management ----
window.availableFields = window.availableFields || [];

window.getSelectedFields = function(){
  const selects = Array.from(document.querySelectorAll('#selectors-div select.field-select-item'));
  return selects.map(s => s.value).filter(v => v);
}

function createSelectElement(value){
  const sel = document.createElement('select');
  sel.className = 'field-select-item';
  sel.style.minWidth = '180px';
  const none = document.createElement('option'); none.value = ''; none.textContent = '-- geen --'; sel.appendChild(none);
  (window.availableFields || []).forEach(f => {
    const o = document.createElement('option'); o.value = f; o.textContent = f; if (f === value) o.selected = true; sel.appendChild(o);
  });
  sel.addEventListener('change', () => herllaadVisualisatie());
  return sel;
}

window.addFieldSelector = function(value){
  const container = document.getElementById('field-select');
  if(!container) { console.error('field-select container not found'); return; }
  let selectorsDiv = document.getElementById('selectors-div');
  if(!selectorsDiv){ 
    selectorsDiv = document.createElement('div'); 
    selectorsDiv.id = 'selectors-div'; 
    container.appendChild(selectorsDiv);
  }

  const row = document.createElement('div'); 
  row.className = 'field-row'; 
  row.style.display='flex'; 
  row.style.alignItems='center'; 
  row.style.gap='6px'; 
  row.style.marginTop='4px';
  
  const sel = createSelectElement(value);
  row.appendChild(sel);
  
  const removeBtn = document.createElement('button'); 
  removeBtn.type='button'; 
  removeBtn.textContent='Verwijder'; 
  removeBtn.addEventListener('click', ()=>{ 
    row.remove(); 
    herllaadVisualisatie(); 
  });
  row.appendChild(removeBtn);
  selectorsDiv.appendChild(row);
  console.log('Veldselector toegevoegd voor:', value);
  return sel;
}

window.initFieldSelectors = function(fields){
  window.availableFields = fields || [];
  const container = document.getElementById('field-select');
  if(!container) { console.error('field-select container not found'); return; }
  console.log('initFieldSelectors aangeroepen met velden:', fields);
  if (!window.availableFields.length) {
    container.innerHTML = '<div class="hint">Laad eerst een dataset om variabelen te kunnen kiezen.</div>';
    const addButton = document.getElementById('add-variable');
    if (addButton) addButton.disabled = true;
    return;
  }
  // Remove all but the hint
  const hint = container.querySelector('.hint');
  Array.from(container.children).forEach(child => {
    if (child !== hint) child.remove();
  });
  let selectorsDiv = document.getElementById('selectors-div');
  if (!selectorsDiv) {
    selectorsDiv = document.createElement('div');
    selectorsDiv.id = 'selectors-div';
    container.appendChild(selectorsDiv);
  }
  // create one selector by default met aantal_inwoners als standaardwaarde
  const standaardVeld = 'aantal_inwoners';
  if (window.availableFields.includes(standaardVeld)) {
    window.addFieldSelector(standaardVeld);
  } else {
    window.addFieldSelector();
  }
  const addButton = document.getElementById('add-variable');
  if (addButton) addButton.disabled = false;
  
  // Trigger visualisatie na korte delay zodat selector klaar is
  setTimeout(() => {
    if (typeof window.herllaadVisualisatie === 'function') {
      window.herllaadVisualisatie();
    }
  }, 100);
}

document.getElementById('add-variable')?.addEventListener('click', (e)=>{ e.preventDefault(); window.addFieldSelector(); });

/**
 * Pas filter toe en vernieuw visualisatie
 */
function pasFilterToe() {
  const min = document.getElementById('filter-min')?.value;
  const max = document.getElementById('filter-max')?.value;
  const lowPct = document.getElementById('filter-lowpct')?.value;
  const highPct = document.getElementById('filter-highpct')?.value;
  
  window.appData.filter = {
    min: min ? parseFloat(min) : null,
    max: max ? parseFloat(max) : null,
    lowPct: lowPct ? parseFloat(lowPct) : null,
    highPct: highPct ? parseFloat(highPct) : null
  };
  
  herllaadVisualisatie();
}

/**
 * Wis het actieve filter
 */
function wisFilter() {
  window.appData.filter = null;
  document.getElementById('filter-min').value = '';
  document.getElementById('filter-max').value = '';
  document.getElementById('filter-lowpct').value = '';
  document.getElementById('filter-highpct').value = '';
  herllaadVisualisatie();
}

/**
 * Laad GeoJSON data vanuit API-endpoint
 * @param {string} url - API-URL
 * @param {string} label - Label voor gebruikersmelding
 */
async function laadVanApi(url, label) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Netwerkfout: ' + res.status);
    const data = await res.json();
    
    // Zet OGC-responsformat om naar GeoJSON (items -> features)
    let fc = data;
    if (data && !data.features && data.items && Array.isArray(data.items)) {
      fc = { type: 'FeatureCollection', features: data.items };
    }
    
    if (fc && fc.features) {
      window.appData.lastFC = fc;
      
      // Sla originele data op voor jaarfiltering
      if (window.multiLoaderState) {
        window.multiLoaderState.originalData = fc;
      }
      
      // Verwijder vorige choropleth-laag
      if (window.appData.choroplethLayer) {
        window.appData.dataLayer.removeLayer(window.appData.choroplethLayer);
        window.appData.choroplethLayer = null;
      }
      if (window.appData.baseGeoLayer) {
        window.appData.dataLayer.removeLayer(window.appData.baseGeoLayer);
        window.appData.baseGeoLayer = null;
      }
      
      // Toon features als grijze generieke laag
      const laag = L.geoJSON(fc, {
        style: { color: '#888', weight: 1, fillOpacity: 0.3 }
      }).addTo(window.appData.dataLayer);
      if (window.bringSmallPolygonsToFront) {
        window.bringSmallPolygonsToFront(window.appData.dataLayer);
      }
      window.appData.baseGeoLayer = laag;
      
      try {
        map.fitBounds(laag.getBounds(), { maxZoom: 14 });
      } catch (e) { /* negeren */ }
      
      // Update jaarslider als data jaarvelden bevat
      if (window.updateYearSlider) {
        window.updateYearSlider(fc);
      }
      
      // Vulveldenselectie-dropdown
      if (window.populateFieldSelect) window.populateFieldSelect(fc);
      
      // Succesmelding weggelaten (stil laden als standaard)
    }
  } catch (err) {
    console.error(err);
    alert('Fout bij laden: ' + err.message);
  }
}

// ============================================================================
// EVENT-LISTENERS — Bestandimport
// ============================================================================

const fileInput = document.getElementById('file-input');
fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await handleFileImport(file);
  } catch (err) {
    console.error('Fout bij import:', err);
    alert('Fout bij bestandimport: ' + err.message);
  }
});

// ============================================================================
// EVENT-LISTENERS — API laden
// ============================================================================

// Single API buttons removed - use multi-API loading instead

// ============================================================================
// EVENT-LISTENERS — Veldkeuze & visualisatie
// ============================================================================

document.getElementById('field-select')?.addEventListener('change', () => {
  herllaadVisualisatie();
});

// ============================================================================
// EVENT-LISTENERS — Visualisatieopties (methode, palet, opaciteit)
// ============================================================================

document.getElementById('method-select')?.addEventListener('change', () => herllaadVisualisatie());
document.getElementById('palette-select')?.addEventListener('change', () => herllaadVisualisatie());
document.getElementById('opacity-range')?.addEventListener('change', () => herllaadVisualisatie());

// ============================================================================
// EVENT-LISTENERS — Filter toepassen en wissen
// ============================================================================

document.getElementById('apply-filter')?.addEventListener('click', () => pasFilterToe());

document.getElementById('clear-filter')?.addEventListener('click', () => wisFilter());

document.getElementById('filter-negative')?.addEventListener('click', () => {
  document.getElementById('filter-min').value = '1';
  window.appData.filter = { ...(window.appData.filter || {}), min: 1 };
  herllaadVisualisatie();
});

// ============================================================================
// IMPORT HELPER — Wrapper voor importer.js
// ============================================================================

/**
 * Wrapper voor bestandimport (geïmplementeerd in importer.js)
 * @param {File} file
 */
async function handleFileImport(file) {
  if (window.handleImportFile) {
    await window.handleImportFile(file, { map, dataLayer });
  } else {
    alert('Importer module niet geladen.');
  }
}
