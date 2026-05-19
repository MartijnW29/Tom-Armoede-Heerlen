// ============================================================================
// MULTI-LOADER.JS — Heerlen Opportunity Atlas
// ============================================================================
// Bestand voor: Gelijktijdig laden van meerdere bestanden/API's en jaar-filtering
// ============================================================================

// ============================================================================
// CONFIGURATIE — Multi-Loader
// ============================================================================

const MULTI_LOADER_CONFIG = {
  minYear: 1950,
  maxYear: 2050,
  yearField: 'jaar',  // Veldnaam om naar te zoeken
  yearFields: ['jaar', 'year', 'Jaar', 'Year', 'JAAR', 'jaa r'],  // Mogelijke veldnamen
};

// ============================================================================
// GLOBALE STATE VOOR MULTI-LOADER
// ============================================================================

window.multiLoaderState = {
  selectedFiles: [],
  apiUrls: [],
  mergedData: null,
  yearFilter: null,
  originalData: null,
};

// ============================================================================
// HULPFUNCTIES — Jaar-detectie
// ============================================================================

/**
 * Detecteer welk veld de jaareigenschappen bevat
 * @param {Object} properties - Feature properties
 * @return {string|null} Veldnaam of null
 */
function detectYearField(properties) {
  for (const field of MULTI_LOADER_CONFIG.yearFields) {
    if (field in properties) return field;
  }
  return null;
}

/**
 * Haal het jaar uit een feature
 * @param {Object} feature - GeoJSON feature
 * @return {number|null} Jaar of null
 */
function getYearFromFeature(feature) {
  if (!feature.properties) return null;
  
  const yearField = detectYearField(feature.properties);
  if (!yearField) return null;
  
  const value = feature.properties[yearField];
  const year = parseInt(value, 10);
  return !isNaN(year) ? year : null;
}

/**
 * Bepaal het bereik van jaren in een FeatureCollection
 * @param {Object} fc - FeatureCollection
 * @return {Object} {min, max} of null als geen jaren
 */
function getYearRange(fc) {
  if (!fc || !fc.features) return null;
  
  const years = fc.features
    .map(f => getYearFromFeature(f))
    .filter(y => y !== null);
  
  if (years.length === 0) return null;
  
  return {
    min: Math.min(...years),
    max: Math.max(...years),
  };
}

// ============================================================================
// HULPFUNCTIES — Data-samenvoeging
// ============================================================================

/**
 * Voeg meerdere FeatureCollections samen
 * @param {Array} collections - Array van FeatureCollections
 * @return {Object} Samengevoegde FeatureCollection
 */
function mergeFeatureCollections(collections) {
  const allFeatures = [];
  
  for (const fc of collections) {
    if (fc && fc.features && Array.isArray(fc.features)) {
      allFeatures.push(...fc.features);
    }
  }
  
  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}

// ============================================================================
// SPATIAL HELPERS — Centroid + point-in-polygon (lightweight, no turf)
// ============================================================================

function getFeatureCentroid(feature) {
  if (!feature || !feature.geometry) return null;
  const geom = feature.geometry;
  const coords = [];

  if (geom.type === 'Polygon') {
    const ring = geom.coordinates && geom.coordinates[0];
    if (!ring) return null;
    ring.forEach(pt => coords.push(pt));
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach(poly => {
      const ring = poly && poly[0];
      if (ring) ring.forEach(pt => coords.push(pt));
    });
  } else {
    return null;
  }

  if (coords.length === 0) return null;
  let sx = 0, sy = 0;
  coords.forEach(c => { sx += c[0]; sy += c[1]; });
  return [sx / coords.length, sy / coords.length];
}

function pointInRing(point, ring) {
  // Ray-casting algorithm — ring is array of [x,y]
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geom) {
  if (!point || !geom) return false;
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates && geom.coordinates[0];
    if (!ring) return false;
    return pointInRing(point, ring);
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      const ring = poly && poly[0];
      if (ring && pointInRing(point, ring)) return true;
    }
    return false;
  }
  return false;
}

function getFeatureName(f) {
  const p = f && f.properties ? f.properties : {};
  return p.wijknaam || p.naam || p.name || p.buurtnaam || p.buurt || p.code || null;
}

/**
 * Voeg overlappende wijken toe aan buurten (eigenschap `overlapping_wijken`)
 * Werkt via centroid -> point-in-polygon match (lichtgewicht benadering).
 */
function addWijkenToBuurten(buurtenFC, wijkenFC) {
  if (!buurtenFC || !buurtenFC.features || !wijkenFC || !wijkenFC.features) return;
  for (const buurt of buurtenFC.features) {
    const c = getFeatureCentroid(buurt);
    if (!c) continue;
    const matches = [];
    for (const wijk of wijkenFC.features) {
      if (pointInGeometry(c, wijk.geometry)) {
        const naam = getFeatureName(wijk);
        if (naam && !matches.includes(naam)) matches.push(naam);
      }
    }
    buurt.properties = buurt.properties || {};
    buurt.properties.overlapping_wijken = matches;
  }
}

// Expose for debugging/explicit calls
window.addWijkenToBuurten = addWijkenToBuurten;

/**
 * Filter features op jaarbereik
 * @param {Object} fc - FeatureCollection
 * @param {number} year - Gewenst jaar
 * @return {Object} Gefilterde FeatureCollection
 */
function filterFeaturesByYear(fc, year) {
  if (!year || !fc || !fc.features) return fc;
  
  const filtered = {
    type: 'FeatureCollection',
    features: fc.features.filter(feature => {
      const featureYear = getYearFromFeature(feature);
      return featureYear === year || featureYear === null; // Inclusief features zonder jaar
    }),
  };
  
  return filtered;
}

// ============================================================================
// MULTI-FILE LOADING
// ============================================================================

/**
 * Laad meerdere bestanden gelijktijdig
 */
async function loadMultipleFiles() {
  const fileInput = document.getElementById('multi-file-input');
  const files = fileInput?.files;
  
  if (!files || files.length === 0) {
    alert('Selecteer minstens één bestand');
    return;
  }
  
  try {
    // Verzamel alle FeatureCollections
    const allCollections = [];
    
    for (const file of files) {
      const text = await file.text();
      const name = file.name.toLowerCase();
      
      try {
        if (name.endsWith('.geojson') || name.endsWith('.json')) {
          const fc = JSON.parse(text);
          if (fc.type === 'FeatureCollection' && fc.features) {
            allCollections.push(fc);
          }
        } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
          // CSV parsing via importer.js
          if (window.parseCSV) {
            const features = window.parseCSV(text);
            if (features.length > 0) {
              allCollections.push({
                type: 'FeatureCollection',
                features: features,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Kon bestand ${file.name} niet verwerken:`, err);
      }
    }
    
    if (allCollections.length === 0) {
      alert('Geen geldige data gevonden in geselecteerde bestanden');
      return;
    }
    
    // Voeg alle data samen
    const merged = mergeFeatureCollections(allCollections);
    
    // Sla originele data op voor jaarfiltering
    window.multiLoaderState.originalData = merged;
    window.appData.lastFC = merged;
    
    // Toon op kaart
    toonGemergedData(merged);
    
    // Update jaarslider
    updateYearSlider(merged);
    
    // Populate variabelen
    if (window.populateFieldSelect) {
      window.populateFieldSelect(merged);
    }
    
    // Succesmelding weggelaten (stil laden als standaard)
    
  } catch (err) {
    console.error('Fout bij multi-file loading:', err);
    alert('Fout bij laden van meerdere bestanden: ' + err.message);
  }
}

/**
 * Toon samengevoegde data op kaart
 * @param {Object} fc - FeatureCollection
 */
function toonGemergedData(fc) {
  // Verwijder vorige lagen
  if (window.appData.baseGeoLayer) {
    window.appData.dataLayer.removeLayer(window.appData.baseGeoLayer);
    window.appData.baseGeoLayer = null;
  }
  if (window.appData.choroplethLayer) {
    window.appData.dataLayer.removeLayer(window.appData.choroplethLayer);
    window.appData.choroplethLayer = null;
  }
  
  // Toon als grijze laag
  const laag = L.geoJSON(fc, {
    style: { color: '#888', weight: 1, fillOpacity: 0.3 },
  }).addTo(window.appData.dataLayer);
  if (window.bringSmallPolygonsToFront) {
    window.bringSmallPolygonsToFront(window.appData.dataLayer);
  }
  
  window.appData.baseGeoLayer = laag;
  
  try {
    window.appData.map.fitBounds(laag.getBounds(), { maxZoom: 14 });
  } catch (e) {
    /* Negeren */
  }
}

// ============================================================================
// MULTI-API LOADING
// ============================================================================

/**
 * Breid URL's uit wanneer ze een jaartal bevatten: vervang gevonden jaartal
 * door alle jaren in de geconfigureerde range zodat meerdere jaren tegelijk
 * opgehaald kunnen worden.
 * @param {Array<string>} urls
 * @return {Array<string>} expanded urls (uniek)
 */
function expandUrlsForYearRange(urls) {
  const out = new Set();
  const minY = MULTI_LOADER_CONFIG.minYear;
  const maxY = MULTI_LOADER_CONFIG.maxYear;

  for (const url of urls) {
    // Zoek een duidelijk viercijferig jaar (bv. 2024) in de URL
    const m = url.match(/\b20\d{2}\b/);
    if (m) {
      const found = m[0];
      for (let y = minY; y <= maxY; y++) {
        out.add(url.replace(found, String(y)));
      }
    } else {
      out.add(url);
    }
  }

  return Array.from(out);
}

/**
 * Laad meerdere API's gelijktijdig
 */
async function loadAllAPIs() {
  const apiInputs = document.querySelectorAll('.api-url-input');
  const urls = Array.from(apiInputs)
    .map(input => input.value?.trim())
    .filter(url => url && url.length > 0);
  
  if (urls.length === 0) {
    alert('Voer minstens één API-URL in');
    return;
  }
  
  try {
    console.log(`Laden van ${urls.length} API-verzoek(en)...`);
    
    // Breid URL-lijst uit voor jaargroepen en laad alle API's gelijktijdig
    const expandedUrls = expandUrlsForYearRange(urls);
    const fetchPromises = expandedUrls.map(url =>
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return res.json();
        })
        .catch(err => {
          console.warn(`Fout bij laden ${url}:`, err);
          return null;
        })
    );
    
    const results = await Promise.all(fetchPromises);
    
    // Zet resultaten om naar FeatureCollections
    const allCollections = [];
    for (const result of results) {
      if (!result) continue;
      
      let fc = result;
      // Zet OGC-format om naar GeoJSON
      if (!fc.features && fc.items && Array.isArray(fc.items)) {
        fc = { type: 'FeatureCollection', features: fc.items };
      }
      
      if (fc && fc.features && Array.isArray(fc.features)) {
        allCollections.push(fc);
      }
    }
    
    if (allCollections.length === 0) {
      alert('Geen geldige data ontvangen van API\'s');
      return;
    }

    // Als zowel PDOK Buurten als Wijken geladen zijn, voeg wijken toe aan buurten
    try {
      const detectBuurtFC = (fc) => fc.features && fc.features.some(f => f.properties && (f.properties.buurt || f.properties.buurtnaam));
      const detectWijkFC = (fc) => fc.features && fc.features.some(f => f.properties && (f.properties.wijk || f.properties.wijknaam));
      const buurtFC = allCollections.find(detectBuurtFC);
      const wijkFC = allCollections.find(detectWijkFC);
      if (buurtFC && wijkFC && typeof addWijkenToBuurten === 'function') {
        addWijkenToBuurten(buurtFC, wijkFC);
        // also store for later inspection
        window.multiLoaderState.buurtenFC = buurtFC;
        window.multiLoaderState.wijkenFC = wijkFC;
      }
    } catch (e) {
      console.warn('Kon overlaps niet berekenen:', e);
    }
    
    // Voeg alles samen
    const merged = mergeFeatureCollections(allCollections);
    
    // Sla originele data op
    window.multiLoaderState.originalData = merged;
    window.appData.lastFC = merged;
    
    // Toon op kaart
    toonGemergedData(merged);
    
    // Update jaarslider
    updateYearSlider(merged);
    
    // Populate variabelen
    if (window.populateFieldSelect) {
      window.populateFieldSelect(merged);
    }
    
    // Succesmelding weggelaten (stil laden als standaard)
    
  } catch (err) {
    console.error('Fout bij multi-API loading:', err);
    alert('Fout bij laden van API\'s: ' + err.message);
  }
}

// ============================================================================
// JAAR-SLIDER FUNCTIONALITEIT
// ============================================================================

/**
 * Update jaarslider op basis van data
 * @param {Object} fc - FeatureCollection
 */
function updateYearSlider(fc) {
  const slider = document.getElementById('year-slider');
  const yearRange = getYearRange(fc);
  
  if (!yearRange || !slider) return;
  
  slider.min = Math.max(yearRange.min, MULTI_LOADER_CONFIG.minYear);
  slider.max = Math.min(yearRange.max, MULTI_LOADER_CONFIG.maxYear);
  slider.value = slider.max; // Standaard het meest recente jaar
  
  updateYearDisplay();
}

/**
 * Update de jaarweergave
 */
function updateYearDisplay() {
  const slider = document.getElementById('year-slider');
  const display = document.getElementById('year-display');
  
  if (slider && display) {
    display.textContent = slider.value;
    
    // Pas filtering toe
    applyYearFilter(parseInt(slider.value, 10));
  }
}

/**
 * Pas jaarfilter toe en vernieuw visualisatie
 * @param {number} year - Geselecteerd jaar
 */
function applyYearFilter(year) {
  const original = window.multiLoaderState.originalData || window.appData.lastFC;
  
  if (!original) return;
  
  // Filter data
  const filtered = filterFeaturesByYear(original, year);
  window.multiLoaderState.yearFilter = year;
  
  // Update appData
  window.appData.lastFC = filtered;
  
  // Vernieuw visualisatie
  if (window.herllaadVisualisatie) {
    window.herllaadVisualisatie();
  }
}

/**
 * Wis jaarfilter
 */
function clearYearFilter() {
  const slider = document.getElementById('year-slider');
  window.multiLoaderState.yearFilter = null;
  
  if (window.multiLoaderState.originalData) {
    window.appData.lastFC = window.multiLoaderState.originalData;
    
    if (window.herllaadVisualisatie) {
      window.herllaadVisualisatie();
    }
  }
}

// ============================================================================
// UI-BEHEER — API-URL BEHEER
// ============================================================================

/**
 * Voeg nieuwe API-URL invoerveld toe
 */
function addApiUrlInput() {
  const list = document.getElementById('api-urls-list');
  if (!list) return;
  
  const item = document.createElement('div');
  item.className = 'api-url-item';
  item.style.display = 'flex';
  item.style.alignItems = 'center';
  item.style.gap = 'var(--ruimte-2)';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'api-url-input';
  input.placeholder = `API URL ${list.children.length + 1}`;
  
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-api-url';
  removeBtn.textContent = 'Verwijder';
  removeBtn.addEventListener('click', () => {
    item.remove();
    updateRemoveButtons();
  });
  
  item.appendChild(input);
  item.appendChild(removeBtn);
  list.appendChild(item);
  
  updateRemoveButtons();
}

/**
 * Update zichtbaarheid van verwijderknoppen
 */
function updateRemoveButtons() {
  const items = document.querySelectorAll('.api-url-item');
  items.forEach((item, index) => {
    const removeBtn = item.querySelector('.remove-api-url');
    if (removeBtn) {
      removeBtn.style.display = items.length > 1 ? 'block' : 'none';
    }
  });
}

/**
 * Update file-list weergave
 */
function updateFileList() {
  const fileInput = document.getElementById('multi-file-input');
  const fileList = document.getElementById('file-list');
  
  if (!fileList) return;
  
  fileList.innerHTML = '';
  
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    Array.from(fileInput.files).forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-list-item';
      
      const span = document.createElement('span');
      span.textContent = `${index + 1}. ${file.name}`;
      
      item.appendChild(span);
      fileList.appendChild(item);
    });
  }
}

// ============================================================================
// EVENT-LISTENERS INITIALISATIE
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Multi-file loading
  document.getElementById('load-multiple-files')?.addEventListener('click', loadMultipleFiles);
  document.getElementById('multi-file-input')?.addEventListener('change', updateFileList);
  
  // Multi-API loading
  document.getElementById('add-api-url')?.addEventListener('click', addApiUrlInput);
  document.getElementById('load-all-apis')?.addEventListener('click', loadAllAPIs);
  
  // Jaar-slider
  document.getElementById('year-slider')?.addEventListener('input', updateYearDisplay);
  document.getElementById('year-filter-clear')?.addEventListener('click', clearYearFilter);
  
  // Initialiseer met één API-URL invoerveld
  updateRemoveButtons();
  
  // Laad standaard API's automatisch bij start (gebruik de default gelezen URL-velden)
  try {
    // kleine timeout om zeker te zijn dat andere init scripts klaar zijn
    setTimeout(() => {
      if (typeof loadAllAPIs === 'function') loadAllAPIs();
    }, 200);
  } catch (e) { console.warn('Auto-load default APIs faalde:', e); }
});

// Zorg dat alles is geregistreerd als window-functie voor andere scripts
window.loadMultipleFiles = loadMultipleFiles;
window.loadAllAPIs = loadAllAPIs;
window.applyYearFilter = applyYearFilter;
window.clearYearFilter = clearYearFilter;
window.getYearFromFeature = getYearFromFeature;
window.getYearRange = getYearRange;
window.mergeFeatureCollections = mergeFeatureCollections;
window.filterFeaturesByYear = filterFeaturesByYear;
