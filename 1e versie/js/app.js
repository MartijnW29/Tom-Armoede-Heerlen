// Minimale start voor de proefversie
// - Initialiseert de Leaflet-kaart gecentreerd op Heerlen
// - Koppelt de bestandsinvoer aan de importer

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

// API-knoppen
const pdokBuurtenUrl = 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json';
const pdokWijkenUrl = 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json';

document.getElementById('load-buurten')?.addEventListener('click', ()=> loadFromApi(pdokBuurtenUrl));
document.getElementById('load-wijken')?.addEventListener('click', ()=> loadFromApi(pdokWijkenUrl));
document.getElementById('load-api')?.addEventListener('click', ()=>{
  const url = document.getElementById('api-url')?.value?.trim();
  if(!url) return alert('Voer een geldige URL in.');
  loadFromApi(url);
});

// Haal JSON/GeoJSON op via API en probeer indien nodig te herprojecteren
async function loadFromApi(url){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('Netwerkfout: ' + res.status);
    const data = await res.json();
    let fc = data;
    // Als de API de data in een features-property verpakt
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
    alert('Dataset geladen via API. Kies een variabele in het keuzemenu.');
  }catch(err){
    console.error(err);
    alert('Fout bij het laden van de API: ' + err.message);
  }
}
  // UI-knoppen: vergelijkmodus
// UI-knoppen: vergelijkmodus
const startCompareBtn = document.getElementById('start-compare');

startCompareBtn?.addEventListener('click', ()=>{
  if(!window.appData.lastFC){ alert('Laad eerst de eerste dataset (basis).'); return; }
  window.appData.compareMode = true;
  startCompareBtn.textContent = 'Upload vergelijkingsbestand';
  alert('Upload nu het tweede bestand via dezelfde bestandskiezer om te vergelijken.');
});

// Wanneer het geselecteerde veld verandert: werk de choropleet bij
const fieldSelect = document.getElementById('field-select');
fieldSelect?.addEventListener('change', ()=>{
  const field = fieldSelect.value;
  if(!field) return;
  // Gebruik de laatst geladen dataset
  const fc = window.appData?.lastFC;
  if(!fc) return;
  // Lees visuele opties uit
  const method = document.getElementById('method-select')?.value || 'quantile';
  const palette = document.getElementById('palette-select')?.value || 'viridis';
  const opacity = parseFloat(document.getElementById('opacity-range')?.value || 0.8);
  if(window.applyChoropleth) window.applyChoropleth(fc, field, { method, palette, opacity });
});

// Reageer ook op wijzigingen in methode/palet/dekking
['method-select','palette-select','opacity-range'].forEach(id=>{
  const el = document.getElementById(id);
  el?.addEventListener('change', ()=>{
    const field = document.getElementById('field-select')?.value;
    if(!field) return;
    const fc = window.appData?.lastFC;
    if(!fc) return;
    const method = 'quantile';
    const palette = document.getElementById('palette-select')?.value || 'viridis';
    const opacity = parseFloat(document.getElementById('opacity-range')?.value || 0.8);
    if(window.applyChoropleth) window.applyChoropleth(fc, field, { method, palette, opacity });
  });
});

// Filterknoppen: filter toepassen/ wissen
document.getElementById('apply-filter')?.addEventListener('click', ()=>{
  const min = document.getElementById('filter-min')?.value;
  const max = document.getElementById('filter-max')?.value;
  const lowpct = document.getElementById('filter-lowpct')?.value;
  const highpct = document.getElementById('filter-highpct')?.value;
  const filter = {};
  if(min!==undefined && min!==null && min!=='') filter.min = +min;
  if(max!==undefined && max!==null && max!=='') filter.max = +max;
  if(lowpct) filter.lowPct = +lowpct;
  if(highpct) filter.highPct = +highpct;
  window.appData.filter = Object.keys(filter).length? filter : null;
  // Pas de visualisatie opnieuw toe voor het huidige veld
  const field = document.getElementById('field-select')?.value;
  const fc = window.appData?.lastFC;
  if(fc && field && window.applyChoropleth) window.applyChoropleth(fc, field, { method: 'quantile', palette: document.getElementById('palette-select')?.value, opacity: parseFloat(document.getElementById('opacity-range')?.value || 0.8) });
  if(fc && field && window.createHistogramFromGeoJSON) window.createHistogramFromGeoJSON(fc, field);
});

document.getElementById('clear-filter')?.addEventListener('click', ()=>{
  window.appData.filter = null;
  document.getElementById('filter-min').value = '';
  document.getElementById('filter-max').value = '';
  document.getElementById('filter-lowpct').value = '';
  document.getElementById('filter-highpct').value = '';
  const field = document.getElementById('field-select')?.value;
  const fc = window.appData?.lastFC;
  if(fc && field && window.applyChoropleth) window.applyChoropleth(fc, field, { method: 'quantile', palette: document.getElementById('palette-select')?.value, opacity: parseFloat(document.getElementById('opacity-range')?.value || 0.8) });
  if(fc && field && window.createHistogramFromGeoJSON) window.createHistogramFromGeoJSON(fc, field);
});

document.getElementById('filter-negative')?.addEventListener('click', ()=>{
  // Zet de minimale waarde op 1 zodat negatieve en nul-uitschieters worden weggelaten.
  const minInput = document.getElementById('filter-min');
  if(minInput) minInput.value = '1';
  window.appData.filter = { ...(window.appData.filter || {}), min: 1 };
  const field = document.getElementById('field-select')?.value;
  const fc = window.appData?.lastFC;
  if(fc && field && window.applyChoropleth) {
    window.applyChoropleth(fc, field, {
      method: 'quantile',
      palette: document.getElementById('palette-select')?.value,
      opacity: parseFloat(document.getElementById('opacity-range')?.value || 0.8)
    });
  }
});

// Hulpfunctie (geïmplementeerd in importer.js)
async function handleFileImport(file) {
  if (window.handleImportFile) {
    await window.handleImportFile(file, { map, dataLayer });
  } else {
    alert('Importer is nog niet geladen.');
  }
}
