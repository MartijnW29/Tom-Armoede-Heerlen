// Minimal starter for the MVP
// - Initializes Leaflet map centered on Heerlen
// - Hooks basic file input to importer

const mapCenter = [50.8889, 5.9794]; // Heerlen approx
const map = L.map('map').setView(mapCenter, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Simple layer group for imported/vector layers
const dataLayer = L.layerGroup().addTo(map);
// App state shared between modules
window.appData = window.appData || {};
window.appData.dataLayer = dataLayer;
window.appData.lastFC = null;
window.appData.compareMode = false;
window.appData.compareFC = null;

// Hook file input
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await handleFileImport(file);
});

// API buttons
const pdokBuurtenUrl = 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json';
const pdokWijkenUrl = 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json';

document.getElementById('load-buurten')?.addEventListener('click', ()=> loadFromApi(pdokBuurtenUrl));
document.getElementById('load-wijken')?.addEventListener('click', ()=> loadFromApi(pdokWijkenUrl));
document.getElementById('load-api')?.addEventListener('click', ()=>{
  const url = document.getElementById('api-url')?.value?.trim();
  if(!url) return alert('Voer een geldige URL in.');
  loadFromApi(url);
});

// fetch JSON/GeoJSON from API, attempt reprojection if needed
async function loadFromApi(url){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('Netwerkfout: ' + res.status);
    const data = await res.json();
    let fc = data;
    // If the API wrapped in features property
    if(data && data.features===undefined && data.items && Array.isArray(data.items)){
      // try to convert items to FeatureCollection if possible
      fc = { type:'FeatureCollection', features: data.items };
    }

    // attempt reprojection if coordinates look projected
    if(window.reprojectIfNeeded) fc = reprojectIfNeeded(fc);

    // add to map / app state
    window.appData = window.appData || {};
    window.appData.lastFC = fc;
    // clear existing layers
    if(window.appData.choroplethLayer){ window.appData.dataLayer.removeLayer(window.appData.choroplethLayer); window.appData.choroplethLayer = null; }
    // add raw layer
    const layer = L.geoJSON(fc).addTo(window.appData.dataLayer);
    try{ map.fitBounds(layer.getBounds()); }catch(e){}

    // populate field select
    if(window.populateFieldSelect) window.populateFieldSelect(fc);
    alert('Dataset geladen vanaf API. Kies een variabele in het dropdown-menu.');
  }catch(err){
    console.error(err);
    alert('Fout bij laden API: ' + err.message);
  }
}

// UI buttons: histogram and compare-mode
const showHistBtn = document.getElementById('show-hist');
const startCompareBtn = document.getElementById('start-compare');

showHistBtn?.addEventListener('click', ()=>{
  const sel = document.getElementById('field-select');
  const field = sel?.value;
  if(!field) { alert('Kies eerst een variabele.'); return; }
  if(!window.appData.lastFC){ alert('Laad eerst een dataset via "Bestand kiezen".'); return; }
  if(window.createHistogramFromGeoJSON) window.createHistogramFromGeoJSON(window.appData.lastFC, field);
});

startCompareBtn?.addEventListener('click', ()=>{
  if(!window.appData.lastFC){ alert('Laad eerst de eerste dataset (basis).'); return; }
  window.appData.compareMode = true;
  startCompareBtn.textContent = 'Upload vergelijkingsbestand';
  alert('Upload nu het tweede bestand via dezelfde bestandsuploader om te vergelijken.');
});

// Wanneer het geselecteerde veld verandert: update choropleth
const fieldSelect = document.getElementById('field-select');
fieldSelect?.addEventListener('change', ()=>{
  const field = fieldSelect.value;
  if(!field) return;
  // gebruik laatste geladen dataset
  const fc = window.appData?.lastFC;
  if(!fc) return;
  // read visual options
  const method = document.getElementById('method-select')?.value || 'quantile';
  const palette = document.getElementById('palette-select')?.value || 'viridis';
  const opacity = parseFloat(document.getElementById('opacity-range')?.value || 0.8);
  if(window.applyChoropleth) window.applyChoropleth(fc, field, { method, palette, opacity });
});

// react to changes in method/palette/opacity too
['method-select','palette-select','opacity-range'].forEach(id=>{
  const el = document.getElementById(id);
  el?.addEventListener('change', ()=>{
    const field = document.getElementById('field-select')?.value;
    if(!field) return;
    const fc = window.appData?.lastFC;
    if(!fc) return;
    const method = document.getElementById('method-select')?.value || 'quantile';
    const palette = document.getElementById('palette-select')?.value || 'viridis';
    const opacity = parseFloat(document.getElementById('opacity-range')?.value || 0.8);
    if(window.applyChoropleth) window.applyChoropleth(fc, field, { method, palette, opacity });
  });
});

// Placeholder functions (implemented in importer.js)
async function handleFileImport(file) {
  if (window.handleImportFile) {
    await window.handleImportFile(file, { map, dataLayer });
  } else {
    alert('Importer not loaded yet.');
  }
}
