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
  standaardPalet: 'viridis',             // ColorBrewer palet
  standaardOpaciteit: 0.8,               // 0.0–1.0
  standaardAantalKlassen: 5,             // Aantal kleurklassen
  
  // API-endpoints (PDOK Buurten/Wijken voor Heerlen gemeentecode GM0917)
  pdokBuurtenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json',
  pdokWijkenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json',
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

// Globale applicatiestate
window.appData = {
  map,
  dataLayer,
  lastFC: null,
  compareMode: false,
  compareFC: null,
  choroplethLayer: null,
  filter: null
};

// ============================================================================
// HULPFUNCTIES
// ============================================================================

/**
 * Herlaad visualisatie met huidige instellingen
 */
function herllaadVisualisatie() {
  const veld = document.getElementById('field-select')?.value;
  const fc = window.appData?.lastFC;
  if (!veld || !fc || !window.toonChoropleth) return;
  
  const methode = document.getElementById('method-select')?.value || APP_CONFIG.standaardMethode;
  const palet = document.getElementById('palette-select')?.value || APP_CONFIG.standaardPalet;
  const opaciteit = parseFloat(document.getElementById('opacity-range')?.value || APP_CONFIG.standaardOpaciteit);
  
  window.toonChoropleth(fc, veld, {
    method: methode,
    palette: palet,
    opacity: opaciteit,
    classes: APP_CONFIG.standaardAantalKlassen
  });
}

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
      
      // Verwijder vorige choropleth-laag
      if (window.appData.choroplethLayer) {
        window.appData.dataLayer.removeLayer(window.appData.choroplethLayer);
        window.appData.choroplethLayer = null;
      }
      
      // Toon features als grijze generieke laag
      const laag = L.geoJSON(fc, {
        style: { color: '#888', weight: 1, fillOpacity: 0.3 }
      }).addTo(window.appData.dataLayer);
      
      try {
        map.fitBounds(laag.getBounds(), { maxZoom: 14 });
      } catch (e) { /* negeren */ }
      
      // Vulveldenselectie-dropdown
      if (window.populateFieldSelect) window.populateFieldSelect(fc);
      
      alert(`Dataset "${label}" geladen. Kies een variabele om te visualiseren.`);
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
    console.error('Import error:', err);
    alert('Fout bij bestandimport: ' + err.message);
  }
});

// ============================================================================
// EVENT-LISTENERS — API laden
// ============================================================================

document.getElementById('load-buurten')?.addEventListener('click', () =>
  laadVanApi(APP_CONFIG.pdokBuurtenUrl, 'Heerlen Buurten')
);

document.getElementById('load-wijken')?.addEventListener('click', () =>
  laadVanApi(APP_CONFIG.pdokWijkenUrl, 'Heerlen Wijken')
);

document.getElementById('load-api')?.addEventListener('click', () => {
  const url = document.getElementById('api-url')?.value?.trim();
  if (!url) return alert('Voer een geldige URL in.');
  laadVanApi(url, 'Custom API');
});

// ============================================================================
// EVENT-LISTENERS — Vergelijking (Compare mode)
// ============================================================================

const startCompareBtn = document.getElementById('start-compare');
startCompareBtn?.addEventListener('click', () => {
  if (!window.appData.lastFC) {
    alert('Laad eerst de eerste dataset.');
    return;
  }
  window.appData.compareMode = true;
  startCompareBtn.textContent = 'Upload vergelijkingsbestand';
  alert('Upload nu het tweede bestand om te vergelijken.');
});

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
