// ============================================================================
// IMPORTER.JS — Heerlen Opportunity Atlas
// Eigen GeoJSON- en CSV-bestanden inlezen (paneel staat standaard verborgen)
// ============================================================================


// ============================================================================
// CONFIGURATIE — Kolomnamen die als coördinaten herkend worden
// ============================================================================

const IMPORTER_CONFIG = {
  breedtevelden: ['lat', 'latitude', 'breedtegraad'],
  lengtevelden:  ['lon', 'lng', 'longitude', 'lengtegraad'],
};


// ============================================================================
// CSV — Punten met een lat- en lon-kolom; overige kolommen worden properties
// ============================================================================

function parseCSV(tekst) {
  const [kop, ...rijen] = tekst.split('\n').map(r => r.split(',').map(cel => cel.trim()));
  const headers = kop.map(h => h.toLowerCase());
  const latIdx = headers.findIndex(h => IMPORTER_CONFIG.breedtevelden.includes(h));
  const lonIdx = headers.findIndex(h => IMPORTER_CONFIG.lengtevelden.includes(h));
  if (latIdx < 0 || lonIdx < 0) return [];

  return rijen
    .map(rij => ({ rij, lat: parseFloat(rij[latIdx]), lon: parseFloat(rij[lonIdx]) }))
    .filter(({ lat, lon }) => !isNaN(lat) && !isNaN(lon))
    .map(({ rij, lat, lon }) => ({
      type: 'Feature',
      properties: Object.fromEntries(headers.map((h, j) => [h, rij[j]]).filter((_, j) => j !== latIdx && j !== lonIdx)),
      geometry: { type: 'Point', coordinates: [lon, lat] },
    }));
}


// ============================================================================
// IMPORTEREN — Bestand lezen en als grijze laag op de kaart tonen
// ============================================================================

/** Lees een .geojson/.json- of .csv-bestand en toon het op de kaart. RD-coördinaten worden omgezet naar WGS84. */
window.handleImportFile = async function (bestand, { map, dataLayer }) {
  const naam = bestand.name.toLowerCase();
  try {
    const tekst = await bestand.text();
    let fc;

    if (/\.(geo)?json$/.test(naam) || tekst.trim().startsWith('{')) {
      fc = JSON.parse(tekst);
      if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error('Geen geldige FeatureCollection.');
      fc = window.herprojecteerAlsNodig(fc);
    } else if (/\.(csv|txt)$/.test(naam)) {
      fc = { type: 'FeatureCollection', features: parseCSV(tekst) };
      if (!fc.features.length) {
        alert('Geen lat/lon-kolommen gevonden in het CSV-bestand.\nGebruik kolomnamen zoals "lat", "lon", "latitude" of "longitude".');
        return;
      }
    } else {
      alert('Bestandstype niet ondersteund.\nGebruik: .geojson, .json of .csv');
      return;
    }

    if (!fc.features.length) { alert('Geen features gevonden in de geïmporteerde data.'); return; }

    const laag = L.geoJSON(fc, { style: { color: '#888', weight: 1, fillOpacity: 0.3 } }).addTo(dataLayer);
    window.bringSmallPolygonsToFront(dataLayer);
    try { map.fitBounds(laag.getBounds()); } catch (_) { /* lege laag */ }

    window.appData.lastFC = fc;
    window.populateFieldSelect(fc);
  } catch (err) {
    console.error('Bestandimport-fout:', err);
    alert('Fout bij het lezen van het bestand: ' + err.message);
  }
};

window.parseCSV = parseCSV;
