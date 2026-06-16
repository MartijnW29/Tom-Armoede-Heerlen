// ============================================================================
// importer.js — Heerlen Opportunity Atlas
// CSV- en GeoJSON-bestandsimport met herprojectie-ondersteuning
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de importinstellingen aan
// ============================================================================

const IMPORTER_CONFIG = {

  // --- Kolomnamen die herkend worden als breedtegraad (lat) ---
  breedtevelden: ['lat', 'latitude', 'breedtegraad'],

  // --- Kolomnamen die herkend worden als lengtegraad (lon) ---
  lengdevelden: ['lon', 'lng', 'longitude', 'lengtegraad'],
};


// ============================================================================
// CSV-PARSING
// ============================================================================

/**
 * Zoekt de kolomindex van de breedtegraad in de gestandaardiseerde header-rij.
 * Geeft -1 terug als er geen overeenkomst gevonden wordt.
 * @param {string[]} headers - Genormaliseerde (lowercase) headerwaarden
 * @returns {number}
 */
function vindBreedtegraadKolom(headers) {
  for (const veld of IMPORTER_CONFIG.breedtevelden) {
    const idx = headers.indexOf(veld);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Zoekt de kolomindex van de lengtegraad in de gestandaardiseerde header-rij.
 * Geeft -1 terug als er geen overeenkomst gevonden wordt.
 * @param {string[]} headers - Genormaliseerde (lowercase) headerwaarden
 * @returns {number}
 */
function vindLengtegraadKolom(headers) {
  for (const veld of IMPORTER_CONFIG.lengdevelden) {
    const idx = headers.indexOf(veld);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parseert CSV-tekst naar een array van GeoJSON-features.
 * Verwacht minimaal één kolom voor lat én één voor lon (zie IMPORTER_CONFIG).
 * Alle overige kolommen worden opgeslagen als feature-properties.
 * Rijen met ontbrekende of ongeldige coördinaten worden overgeslagen.
 * @param {string} tekst - Ruwe CSV-inhoud
 * @returns {GeoJSON.Feature[]}
 */
function parseCSV(tekst) {
  const rijen = tekst.split('\n')
    .map(r => r.split(',').map(cel => cel.trim()))
    .filter(r => r.length > 0);

  if (rijen.length < 2) return [];

  const headers = rijen[0].map(h => h.toLowerCase());
  const latIdx  = vindBreedtegraadKolom(headers);
  const lonIdx  = vindLengtegraadKolom(headers);

  if (latIdx < 0 || lonIdx < 0) return [];

  const features = [];
  for (let i = 1; i < rijen.length; i++) {
    const rij = rijen[i];
    if (rij.length <= Math.max(latIdx, lonIdx)) continue;

    const lat = parseFloat(rij[latIdx]);
    const lon = parseFloat(rij[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    // Alle overige kolommen worden properties
    const props = {};
    headers.forEach((h, j) => { if (j !== latIdx && j !== lonIdx) props[h] = rij[j]; });

    features.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }

  return features;
}


// ============================================================================
// DATA WEERGEVEN
// ============================================================================

/**
 * Toont een GeoJSON FeatureCollection als grijze laag op de kaart
 * en koppelt de data aan de app-status.
 *
 * Vergelijkmodus: als window.appData.compareMode actief is én er al een
 * eerste dataset is, wordt de nieuw geladen dataset als compareFC opgeslagen
 * en worden de vergelijkgrafieken getekend.
 *
 * @param {GeoJSON.FeatureCollection} fc
 * @param {{ map: L.Map, dataLayer: L.LayerGroup }} context
 * @param {boolean} vergelijkModus
 */
function toonDataOmgeving(fc, context, vergelijkModus) {
  if (!fc?.features?.length) {
    alert('Geen features gevonden in de geïmporteerde data.');
    return;
  }

  const laag = L.geoJSON(fc, { style: { color: '#888', weight: 1, fillOpacity: 0.3 } })
    .addTo(context.dataLayer);

  window.bringSmallPolygonsToFront?.(context.dataLayer);
  try { context.map.fitBounds(laag.getBounds()); } catch (_) {}

  window.appData = window.appData || {};

  if (vergelijkModus && window.appData.lastFC) {
    // Tweede dataset geladen: sla op als compareFC en teken vergelijkgrafieken
    window.appData.compareFC   = fc;
    window.appData.compareMode = false;

    const veld = document.getElementById('field-select')?.value;
    if (window.createCompareCharts && veld) {
      window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, veld);
    } else {
      alert('Vergelijkmodus: tweede dataset geladen. Kies eerst een variabele in het keuzemenu.');
    }
  } else {
    // Eerste (of enige) dataset: sla op als hoofddata en vul veldkeuze
    window.appData.lastFC = fc;
    window.populateFieldSelect?.(fc);
  }
}


// ============================================================================
// HOOFD-IMPORTFUNCTIE
// ============================================================================

/**
 * Verwerkt een geüpload bestand en voegt het toe aan de kaart.
 * Ondersteunde formaten: GeoJSON (.geojson / .json), CSV (.csv / .txt).
 * GeoJSON wordt automatisch hergeprojecteerd van RD naar WGS84 indien nodig
 * (via window.herprojecteerAlsNodig, gedefinieerd in een aparte module).
 *
 * @param {File}   bestand  - Het geüploade bestand
 * @param {{ map: L.Map, dataLayer: L.LayerGroup }} context - Kaartcontext
 */
window.handleImportFile = async function (bestand, context) {
  const naam = bestand.name.toLowerCase();

  try {
    const tekst = await bestand.text();
    const vergelijkModus = window.appData?.compareMode ?? false;

    // ----- GeoJSON -----
    if (naam.endsWith('.geojson') || naam.endsWith('.json') || tekst.trim().startsWith('{')) {
      try {
        const fc = JSON.parse(tekst);
        if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error('Geen geldige FeatureCollection.');

        // Herprojecteer van RD Nieuwe (meters) naar WGS84 (graden) indien nodig
        const verwerkt = window.herprojecteerAlsNodig ? window.herprojecteerAlsNodig(fc) : fc;
        toonDataOmgeving(verwerkt, context, vergelijkModus);
      } catch (err) {
        console.error('GeoJSON parse-fout:', err);
        alert('Fout: kan GeoJSON niet parseren.\n' + err.message);
      }
      return;
    }

    // ----- CSV -----
    if (naam.endsWith('.csv') || naam.endsWith('.txt')) {
      const features = parseCSV(tekst);
      if (!features.length) {
        alert('Fout: geen lat/lon-kolommen gevonden in het CSV-bestand.\nGebruik kolomnamen zoals "lat", "lon", "latitude" of "longitude".');
        return;
      }
      toonDataOmgeving({ type: 'FeatureCollection', features }, context, vergelijkModus);
      return;
    }

    // ----- ZIP (nog niet ondersteund) -----
    if (naam.endsWith('.zip')) {
      alert('ZIP-bestanden worden momenteel niet ondersteund.\nGebruik GeoJSON (.geojson / .json) of CSV (.csv).');
      return;
    }

    // ----- Onbekend formaat -----
    alert('Bestandstype niet ondersteund.\nGebruik: .geojson, .json of .csv');

  } catch (err) {
    console.error('Bestandimport-fout:', err);
    alert('Fout bij het lezen van het bestand: ' + err.message);
  }
};


// ============================================================================
// GLOBALE EXPORTS — Beschikbaar voor multi-loader.js en andere modules
// ============================================================================

window.parseCSV              = parseCSV;
window.vindBreedtegraadKolom = vindBreedtegraadKolom;
window.vindLengtegraadKolom  = vindLengtegraadKolom;
window.toonDataOmgeving      = toonDataOmgeving;