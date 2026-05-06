// ============================================================================
// IMPORTER.JS — Heerlen Opportunity Atlas
// ============================================================================
// Bestand voor: CSV en GeoJSON bestandsimport met herprojectie-ondersteuning
// ============================================================================

// ============================================================================
// CONFIGURATIE — Pas hier aan voor je eigen project
// ============================================================================

const IMPORTER_CONFIG = {
  // Ondersteunde veldnamen voor coördinaten
  breedtevelden: ['lat', 'latitude', 'breedtegraad'],
  lengdevelden: ['lon', 'lng', 'longitude', 'lengtegraad'],
  
  // Projectie-detectie
  geprojecteeerdBoven: 1000,   // Coördinaten boven deze waarde zijn waarschijnlijk geprojecteerd (RD/meters)
};

// ============================================================================
// HULPFUNCTIES — Bestandsverwerking
// ============================================================================

/**
 * Zoek breedtegraad-kolomindex in CSV-headers
 * @param {Array} headers - Genormaliseerde header-rij
 * @return {number} Index of -1 if not found
 */
function vindBreedtegraadKolom(headers) {
  for (const veld of IMPORTER_CONFIG.breedtevelden) {
    const idx = headers.indexOf(veld);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Zoek lengtegraad-kolomindex in CSV-headers
 * @param {Array} headers - Genormaliseerde header-rij
 * @return {number} Index or -1 if not found
 */
function vindLengtegraadKolom(headers) {
  for (const veld of IMPORTER_CONFIG.lengdevelden) {
    const idx = headers.indexOf(veld);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parseer CSV-tekst naar Feature array
 * @param {string} tekst - CSV-inhoud
 * @return {Array} Features of empty array if parsing failed
 */
function parseCSV(tekst) {
  const rijen = tekst.split('\n')
    .map(r => r.split(',').map(cel => cel.trim()))
    .filter(r => r.length > 0);
  
  if (rijen.length < 2) return [];
  
  // Headers
  const headers = rijen[0].map(h => h.toLowerCase());
  const latIdx = vindBreedtegraadKolom(headers);
  const lonIdx = vindLengtegraadKolom(headers);
  
  if (latIdx < 0 || lonIdx < 0) {
    return []; // Geen lat/lon gevonden
  }
  
  // Zet alle rijen om naar Features
  const features = [];
  for (let i = 1; i < rijen.length; i++) {
    const rij = rijen[i];
    if (rij.length <= Math.max(latIdx, lonIdx)) continue;
    
    const lat = parseFloat(rij[latIdx]);
    const lon = parseFloat(rij[lonIdx]);
    
    if (isNaN(lat) || isNaN(lon)) continue;
    
    // Bouw properties van alle kolommen
    const props = {};
    for (let j = 0; j < headers.length; j++) {
      if (j !== latIdx && j !== lonIdx) {
        props[headers[j]] = rij[j];
      }
    }
    
    features.push({
      type: 'Feature',
      properties: props,
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      }
    });
  }
  
  return features;
}

/**
 * Toon data als generieke laag op kaart + update veldenselectie
 * @param {GeoJSON FeatureCollection} fc
 * @param {Object} context - {map, dataLayer}
 * @param {boolean} compareMode - OF dit de tweede dataset is
 */
function toonDataOmgeving(fc, context, compareMode) {
  if (!fc || !fc.features || fc.features.length === 0) {
    alert('Geen features gevonden in geïmporteerde data.');
    return;
  }
  
  // Toon als grijze laag
  const laag = L.geoJSON(fc, {
    style: { color: '#888', weight: 1, fillOpacity: 0.3 }
  }).addTo(context.dataLayer);
  
  try {
    context.map.fitBounds(laag.getBounds());
  } catch (e) { /* Negeren */ }
  
  // Update app-status
  window.appData = window.appData || {};
  
  if (compareMode && window.appData.lastFC) {
    window.appData.compareFC = fc;
    window.appData.compareMode = false;
    
    const veld = document.getElementById('field-select')?.value;
    if (window.createCompareCharts && veld) {
      window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, veld);
    } else {
      alert('Vergelijkmodus: tweede dataset geladen. Kies eerst een variabele.');
    }
  } else {
    window.appData.lastFC = fc;
    if (window.populateFieldSelect) window.populateFieldSelect(fc);
  }
}

// ============================================================================
// HOOFD-IMPORT-FUNCTIE
// ============================================================================

/**
 * Importeer file (GeoJSON of CSV) en voeg toe aan kaart
 * @param {File} file
 * @param {Object} context - Kaart-context {map, dataLayer}
 */
window.handleImportFile = async function(file, context) {
  const bestandsnaam = file.name.toLowerCase();
  
  try {
    const tekst = await file.text();
    
    // ===== GEOJSON IMPORT =====
    if (bestandsnaam.endsWith('.geojson') || bestandsnaam.endsWith('.json') || tekst.trim().startsWith('{')) {
      try {
        const fc = JSON.parse(tekst);
        
        // Controleer of het geldige GeoJSON is
        if (fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          // Herprojecteer als nodig (RD -> WGS84)
          if (window.herprojecteerAlsNodig) {
            const geherprojecteerd = window.herprojecteerAlsNodig(fc);
            toonDataOmgeving(geherprojecteerd, context, window.appData?.compareMode);
          } else {
            toonDataOmgeving(fc, context, window.appData?.compareMode);
          }
          return;
        }
      } catch (err) {
        console.error('GeoJSON parse-fout:', err);
        alert('Fout: Kan GeoJSON niet parseren.\n' + err.message);
        return;
      }
    }
    
    // ===== CSV IMPORT =====
    if (bestandsnaam.endsWith('.csv') || bestandsnaam.endsWith('.txt')) {
      const features = parseCSV(tekst);
      
      if (features.length === 0) {
        alert('Fout: Kan geen lat/lon-kolommen vinden in CSV. Gebruik: "lat", "lon" (of "latitude", "longitude")');
        return;
      }
      
      const fc = {
        type: 'FeatureCollection',
        features: features
      };
      
      toonDataOmgeving(fc, context, window.appData?.compareMode);
      return;
    }
    
    // ===== ZIP IMPORT (TOEKOMSTIGE UITBREIDING) =====
    if (bestandsnaam.endsWith('.zip')) {
      alert('ZIP-bestanden worden momenteel niet ondersteund.\nGebruik GeoJSON (.geojson, .json) of CSV (.csv).');
      return;
    }
    
    // ===== ONBEKEND BESTANDSTYPE =====
    alert('Bestandstype niet ondersteund.\nGebruik: .geojson, .json, .csv');
    
  } catch (err) {
    console.error('Bestandimport-fout:', err);
    alert('Fout bij bestandlezen: ' + err.message);
  }
};
// Importer: ondersteunt GeoJSON en CSV (basis lat/lon) voor de proefversie

window.handleImportFile = async function(file, ctx){
  const name = file.name.toLowerCase();
  const text = await file.text();
  // Als de tekst op GeoJSON lijkt
  if (name.endsWith('.geojson') || text.trim().startsWith('{')){
    try{
      const fc = JSON.parse(text);
      const layer = L.geoJSON(fc).addTo(ctx.dataLayer);
      try{ map.fitBounds(layer.getBounds()); }catch(e){}

      // App-status + D3-koppelingen
      window.appData = window.appData || {};
      if(window.appData.compareMode && window.appData.lastFC){
        window.appData.compareFC = fc;
        window.appData.compareMode = false;
        const sel = document.getElementById('field-select');
        const field = sel?.value;
        if(window.createCompareCharts && field){
          window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, field);
        } else {
          alert('Vergelijkmodus: tweede bestand geladen. Kies eerst een variabele in het keuzemenu.');
        }
      } else {
        window.appData.lastFC = fc;
        if(window.populateFieldSelect) window.populateFieldSelect(fc);
      }
      return;
    }catch(err){
      console.error('Fout bij het parsen van GeoJSON-tekst', err);
      alert('Fout bij parsen van GeoJSON.');
      return;
    }
  }

  if (name.endsWith('.csv') || name.endsWith('.txt')){
    // Eenvoudige CSV-parsing: verwacht lat/lon- of lon/lat-kolommen
    const rows = text.split('\n').map(r=>r.split(','));
    // find lat/lon headers
    const headers = rows[0].map(h=>h.trim().toLowerCase());
    const latIdx = headers.indexOf('lat');
    const lonIdx = headers.indexOf('lon') >=0 ? headers.indexOf('lon') : headers.indexOf('lng');
    if (latIdx>=0 && lonIdx>=0){
      const feats = rows.slice(1).filter(r=>r.length>Math.max(latIdx,lonIdx)).map(r=>({
        type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:[+r[lonIdx], +r[latIdx]] }
      }));
      const fc = { type:'FeatureCollection', features: feats };
        const layer = L.geoJSON(fc).addTo(ctx.dataLayer);
        try{ map.fitBounds(layer.getBounds()); }catch(e){}

        window.appData = window.appData || {};
        if(window.appData.compareMode && window.appData.lastFC){
          window.appData.compareFC = fc;
          window.appData.compareMode = false;
          const sel = document.getElementById('field-select');
          const field = sel?.value;
          if(window.createCompareCharts && field){
            window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, field);
          } else {
            alert('Vergelijkmodus: tweede bestand geladen. Kies eerst een variabele in het keuzemenu.');
          }
        } else {
          window.appData.lastFC = fc;
          if(window.populateFieldSelect) window.populateFieldSelect(fc);
        }

        return;
    }

    if(name.endsWith('.zip')){
        alert('Zip-bestanden worden in deze frontend-only versie niet ondersteund. Gebruik GeoJSON of CSV.');
      return;
      }
  }

      alert('Bestandstype niet ondersteund door de importer van de proefversie.');
};
