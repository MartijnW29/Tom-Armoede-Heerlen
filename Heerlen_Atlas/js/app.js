// ============================================================================
// app.js — Heerlen Opportunity Atlas
// Kaart-initialisatie, event-listeners, filter- en visualisatie-logica
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de projectinstellingen aan
// ============================================================================

const APP_CONFIG = {

  // --- Kaartweergave ---
  kaartCentrum:        [50.8889, 5.9794],   // Startpositie kaart (lat, lon)
  standaardZoom:       12,                  // Zoomniveau bij opstarten
  maxZoom:             19,                  // Maximaal zoomniveau

  // --- Basemap (OpenStreetMap) ---
  basemapUrl:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  basemapAttr: '© OpenStreetMap contributors',

  // --- Visualisatie-standaarden ---
  standaardMethode:     'quantile',         // Classificatiemethode: 'quantile' of 'equal'
  standaardPalet:       'rdylgn',           // ColorBrewer palet (RdYlGn = rood-geel-groen)
  standaardOpaciteit:   0.50,               // Vulling transparantie (0.0 = onzichtbaar, 1.0 = vol)
  standaardAantalKlassen: 5,                // Aantal kleurklassen in de legenda

  // --- PDOK API-endpoints (CBS wijken/buurten, gemeentecode GM0917 = Heerlen) ---
  pdokBuurtenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json',
  pdokWijkenUrl:  'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json',

  // --- Standaardvelden bij opstarten ---
  standaardVeld1: 'aantal_inwoners',        // Eerste variabele die standaard getoond wordt
  standaardVeld2: 'aantal_huishoudens',     // Tweede variabele die standaard getoond wordt

  // --- Kleurverloop-hints per palet (voor de kleur-indicator naast veldselector) ---
  paletGradients: {
    'viridis': 'linear-gradient(135deg, #440154 0%, #31688e 40%, #35b779 70%, #fde724 100%)',
    'rdylgn':  'linear-gradient(135deg, #a50026 0%, #ffffbf 50%, #006837 100%)',
    'blues':   'linear-gradient(135deg, #f7fbff 0%, #4292c6 70%, #08519c 100%)',
    'oranges': 'linear-gradient(135deg, #fff5eb 0%, #fb9a6f 70%, #b30000 100%)',
  },
};


// ============================================================================
// OPACITEIT-HULP — Leest opaciteit uit externe instellingen of config
// ============================================================================

// Externe overrides kunnen via window.APP_SETTINGS worden meegegeven
window.APP_SETTINGS = window.APP_SETTINGS || {};

function getDefaultOpacity() {
  return typeof window.APP_SETTINGS.defaultOpacity === 'number'
    ? window.APP_SETTINGS.defaultOpacity
    : APP_CONFIG.standaardOpaciteit;
}

// Synchroniseer de opaciteits-slider met de standaardwaarde
window.syncOpacityDefaults = function () {
  const slider = document.getElementById('opacity-range');
  if (slider) slider.value = String(getDefaultOpacity());
};


// ============================================================================
// KAART-INITIALISATIE
// ============================================================================

const map = L.map('map').setView(APP_CONFIG.kaartCentrum, APP_CONFIG.standaardZoom);

L.tileLayer(APP_CONFIG.basemapUrl, {
  maxZoom:     APP_CONFIG.maxZoom,
  attribution: APP_CONFIG.basemapAttr,
}).addTo(map);

// Aparte layergroup zodat data-lagen onafhankelijk van de basemap beheerd worden
const dataLayer = L.layerGroup().addTo(map);


// ============================================================================
// OPPERVLAKTE-BEREKENING — Nodig voor polygoonvolgorde op de kaart
// ============================================================================

/**
 * Berekent het oppervlak van één coördinatenring via de schoenveter-formule
 * (shoelace formula). Werkt op platte x/y coördinaten, niet geodetisch.
 */
function polygonRingArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Geeft het netto oppervlak van een GeoJSON-feature (Polygon of MultiPolygon).
 * Gaten (inner rings) worden afgetrokken van de buitenring.
 * Retourneert null als het geometrietype niet ondersteund wordt.
 */
function featureArea(feature) {
  const geom = feature?.geometry;
  if (!geom) return null;

  const ringNettoOppervlak = (rings) => {
    if (!rings.length) return 0;
    const buiten = polygonRingArea(rings[0]);
    const gaten  = rings.slice(1).reduce((som, r) => som + polygonRingArea(r), 0);
    return Math.max(buiten - gaten, 0);
  };

  if (geom.type === 'Polygon')      return ringNettoOppervlak(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((som, poly) => som + ringNettoOppervlak(poly), 0);
  return null;
}

/**
 * Brengt kleine polygonen naar de voorgrond zodat ze klikbaar blijven.
 * Sorteert alle lagen op oppervlak (groot → klein) en roept bringToFront aan.
 * Wordt twee keer uitgevoerd: direct en via requestAnimationFrame,
 * omdat Leaflet rendering asynchroon kan zijn.
 */
function applySmallPolygonsToFront(rootLayer) {
  if (!rootLayer || typeof rootLayer.eachLayer !== 'function') return;

  const lagen = [];

  const verzamelLagen = (layer) => {
    if (typeof layer.eachLayer === 'function' && !layer.feature) {
      layer.eachLayer(verzamelLagen);
    } else {
      const opp = featureArea(layer.feature);
      if (typeof opp === 'number' && typeof layer.bringToFront === 'function') {
        lagen.push({ layer, opp });
      }
    }
  };

  rootLayer.eachLayer(verzamelLagen);
  lagen.sort((a, b) => b.opp - a.opp).forEach(({ layer }) => layer.bringToFront());
}

window.bringSmallPolygonsToFront = function (rootLayer) {
  applySmallPolygonsToFront(rootLayer);
  const schedule = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 0));
  schedule(() => applySmallPolygonsToFront(rootLayer));
};


// ============================================================================
// GLOBALE APPLICATIESTATUS
// ============================================================================

window.appData = {
  map,
  dataLayer,
  lastFC:          null,    // Laatste geladen FeatureCollection
  compareMode:     false,
  compareFC:       null,
  baseGeoLayer:    null,    // Grijze basislaag (ongestijld)
  choroplethLayer: null,    // Gekleurde choropleth-laag
  filter:          { min: 0.01 },
};

window.syncOpacityDefaults();


// ============================================================================
// SPLIT-SCREEN SYNCHRONISATIE
// ============================================================================

// Lees URL-parameters om te bepalen of dit venster onderdeel is van een split-screen
const splitParams      = new URLSearchParams(window.location.search);
const isSplitScreenPane = splitParams.get('split') === '1';
const splitScreenPanelId = splitParams.get('panel') || splitParams.get('sidebar') || 'single';

window.isSplitScreenPane  = isSplitScreenPane;
window.splitScreenPanelId = splitScreenPanelId;

if (isSplitScreenPane) {
  // Voorkom terugkoppel-loop: als wij zelf de kaart verplaatsen via een bericht,
  // slaan we de volgende broadcast over.
  let onderdrukVolgende = false;

  const broadcastKaartView = () => {
    if (onderdrukVolgende) { onderdrukVolgende = false; return; }
    window.parent?.postMessage({
      type:     'heerlen-map-view',
      panelId:  splitScreenPanelId,
      center:   map.getCenter(),
      zoom:     map.getZoom(),
    }, '*');
  };

  map.on('move', broadcastKaartView);

  window.addEventListener('message', (event) => {
    const { type, panelId, center, zoom } = event.data || {};
    if (type !== 'heerlen-set-map-view') return;
    if (panelId !== splitScreenPanelId)  return;
    if (!center || typeof zoom !== 'number') return;

    onderdrukVolgende = true;
    map.setView(center, zoom, { animate: false });
  });
}

document.getElementById('open-split-screen')?.addEventListener('click', () => {
  window.location.href = 'split-screen.html';
});


// ============================================================================
// VISUALISATIE — Herlaad met huidige instellingen
// ============================================================================

/**
 * Leest de huidige UI-instellingen en roept toonChoropleth aan.
 * Toont ook grafieken voor alle geselecteerde velden.
 */
function herllaadVisualisatie() {
  // Werk eerst de veldselectoren bij: velden zonder (gefilterde) data worden
  // uitgeschakeld zodat ze niet meer gekozen kunnen worden.
  window.vernieuwVeldSelecties?.();

  const geselecteerde = window.getSelectedFields?.() || [];
  const veld = geselecteerde[0] || document.getElementById('field-select')?.value;
  const fc   = window.appData?.lastFC;
  if (!veld || !fc || !window.toonChoropleth) return;

  window.toonChoropleth(fc, veld, {
    method:  document.getElementById('method-select')?.value  || APP_CONFIG.standaardMethode,
    palette: document.getElementById('palette-select')?.value || APP_CONFIG.standaardPalet,
    opacity: parseFloat(document.getElementById('opacity-range')?.value || getDefaultOpacity()),
    classes: APP_CONFIG.standaardAantalKlassen,
  });

  // Render grafieken voor alle geselecteerde velden
  const veldenVoorGrafiek = geselecteerde.length > 0 ? geselecteerde : [veld];
  window.renderMultiVariableCharts?.(fc, veldenVoorGrafiek);
}

// Verwijder de oude vergelijkknop als die nog bestaat
document.getElementById('start-compare')?.remove();


// ============================================================================
// VELDSELECTOREN — Dynamisch beheer van variabele-dropdowns
// ============================================================================

// ============================================================================
// VELDSELECTOREN — Dynamisch beheer van variabele-dropdowns
// ============================================================================

window.availableFields = window.availableFields || [];
window.customFieldNames = window.customFieldNames || [];

function isCustomField(veld) {
  return Boolean(veld) && (window.customFieldNames || []).includes(veld);
}

window.getFieldGroupsForUi = function () {
  const fields = [...new Set((window.availableFields || []).filter(Boolean))];
  return {
    custom: fields.filter(isCustomField),
    standard: fields.filter(veld => !isCustomField(veld))
  };
};

function renderCustomFieldNotice() {
  const container = document.getElementById('field-select');
  if (!container) return;

  const existing = container.querySelector('.custom-fields-section');
  if (existing) existing.remove();

  const { custom } = window.getFieldGroupsForUi();
  if (!custom.length) return;

  const section = document.createElement('div');
  section.className = 'custom-fields-section';

  const title = document.createElement('div');
  title.className = 'custom-fields-section-title';
  title.textContent = 'Zelfgemaakte variabelen';

  const text = document.createElement('div');
  text.className = 'custom-fields-section-text';
  text.textContent = 'Deze berekende variabelen staan bovenaan voor snelle selectie.';

  section.append(title, text);
  const hint = container.querySelector('.hint');
  if (hint) container.insertBefore(section, hint);
  else container.prepend(section);
}

/** Geeft alle momenteel geselecteerde veldwaarden terug als array */
window.getSelectedFields = function () {
  return Array.from(document.querySelectorAll('#selectors-div select.field-select-item'))
    .map(s => s.value)
    .filter(Boolean);
};

/**
 * Bepaalt of een veld bruikbare data heeft in de momenteel geladen dataset.
 * Een veld is alleen "bruikbaar" (selecteerbaar) als er:
 *   1. minstens één niet-lege, numerieke waarde voor bestaat, EN
 *   2. — als er een actief filter is (min/max of percentiel) — minstens één
 *      van die waarden ook daadwerkelijk door dat filter heen komt.
 * Zo worden velden die volledig leeg zijn, of waarvan alle waarden door het
 * actieve filter worden uitgesloten, niet meer selecteerbaar in de dropdown.
 */
function veldHeeftBeschikbareData(veld) {
  const fc = window.appData?.lastFC;
  if (!fc || typeof window.haalNumeriekeWaarden !== 'function') return true;

  const alleWaarden = window.haalNumeriekeWaarden(fc, veld);
  if (!alleWaarden.length) return false;

  const filter = window.appData?.filter || null;
  if (!filter || typeof window.waardePasseertFilter !== 'function') return true;

  return alleWaarden.some(w => window.waardePasseertFilter(w, alleWaarden, filter));
}

/**
 * (Her)vult een bestaand <select>-element met alle beschikbare velden.
 * Velden zonder bruikbare (gefilterde) data worden toegevoegd als uitgeschakelde
 * optie met de toevoeging "(geen data)", zodat ze zichtbaar maar niet
 * selecteerbaar zijn. Een eerder geselecteerde waarde die niet langer bruikbaar
 * is, wordt teruggezet naar "-- geen --".
 * @param {HTMLSelectElement} sel
 * @param {string} [forceerWaarde] - Optioneel: forceer deze waarde als selectie (bij eerste opbouw)
 */
function vulVeldSelect(sel, forceerWaarde) {
  const huidigeWaarde = forceerWaarde !== undefined ? forceerWaarde : sel.value;
  sel.innerHTML = '';

  const legeOptie = document.createElement('option');
  legeOptie.value = '';
  legeOptie.textContent = '-- geen --';
  sel.appendChild(legeOptie);

  let huidigeNogBruikbaar = false;
  const { custom, standard } = window.getFieldGroupsForUi();

  const voegGroepToe = (groepsLabel, velden) => {
    const bruikbareVelden = velden.filter(veld => veldHeeftBeschikbareData(veld));
    if (!bruikbareVelden.length) return;

    const group = document.createElement('optgroup');
    group.label = groepsLabel;
    bruikbareVelden.forEach(veld => {
      const opt = document.createElement('option');
      opt.value = veld;
      opt.textContent = veld;

      if (veld === huidigeWaarde) {
        opt.selected = true;
        huidigeNogBruikbaar = true;
      }
      group.appendChild(opt);
    });
    sel.appendChild(group);
  };

  voegGroepToe('Zelfgemaakte variabelen', custom);
  voegGroepToe('Basisvariabelen', standard);

  // Val terug op "-- geen --" als de gewenste waarde niet (meer) bruikbaar is
  if (huidigeWaarde && !huidigeNogBruikbaar) sel.value = '';
}

/** Maakt een <select> element aan gevuld met alle beschikbare velden */
function maakSelectElement(standaardWaarde) {
  const sel = document.createElement('select');
  sel.className = 'field-select-item';
  sel.style.minWidth = '180px';

  vulVeldSelect(sel, standaardWaarde);

  sel.addEventListener('change', herllaadVisualisatie);
  return sel;
}

/**
 * Werkt alle bestaande veldselectoren in de sidebar bij op basis van de actuele
 * data en het actieve filter. Wordt aangeroepen vanuit herllaadVisualisatie,
 * dus telkens wanneer het jaar, het waardefilter of de dataset wijzigt.
 */
window.vernieuwVeldSelecties = function () {
  document.querySelectorAll('#selectors-div select.field-select-item').forEach(sel => {
    vulVeldSelect(sel);
  });
};

/**
 * Voegt een nieuwe veldselector-rij toe aan de sidebar.
 * @param {string} [standaardWaarde] - Optioneel vooraf geselecteerde veldnaam
 */
window.addFieldSelector = function (standaardWaarde) {
  const container = document.getElementById('field-select');
  if (!container) { console.error('field-select container niet gevonden'); return; }

  let selectorsDiv = document.getElementById('selectors-div');
  if (!selectorsDiv) {
    selectorsDiv = document.createElement('div');
    selectorsDiv.id = 'selectors-div';
    container.appendChild(selectorsDiv);
  }

  const rij = document.createElement('div');
  rij.className = 'field-row';
  Object.assign(rij.style, { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' });

  const sel = maakSelectElement(standaardWaarde);
  rij.appendChild(sel);

  const verwijderBtn = document.createElement('button');
  verwijderBtn.type = 'button';
  verwijderBtn.textContent = 'Verwijder';
  verwijderBtn.addEventListener('click', () => { rij.remove(); herllaadVisualisatie(); });
  rij.appendChild(verwijderBtn);

  selectorsDiv.appendChild(rij);
  return sel;
};

/**
 * Initialiseert alle veldselectoren op basis van de geladen dataset.
 * Voegt standaard twee selectoren toe (aantal_inwoners + aantal_huishoudens).
 * Voegt ook een kleur-indicatortje toe bij de eerste selector.
 * @param {string[]} velden - Lijst van beschikbare veldnamen
 */
window.initFieldSelectors = function (velden) {
  window.availableFields = velden || [];
  const container = document.getElementById('field-select');
  if (!container) { console.error('field-select container niet gevonden'); return; }

  if (!window.availableFields.length) {
    container.innerHTML = '<div class="hint">Laad eerst een dataset om variabelen te kunnen kiezen.</div>';
    const addBtn = document.getElementById('add-variable');
    if (addBtn) addBtn.disabled = true;
    return;
  }

  // Verwijder alle kinderen behalve de hint
  const hint = container.querySelector('.hint');
  Array.from(container.children).forEach(kind => { if (kind !== hint) kind.remove(); });

  renderCustomFieldNotice();

  let selectorsDiv = document.getElementById('selectors-div');
  if (!selectorsDiv) {
    selectorsDiv = document.createElement('div');
    selectorsDiv.id = 'selectors-div';
    container.appendChild(selectorsDiv);
  }

  // Voeg twee standaard selectoren toe — alleen als die velden ook daadwerkelijk
  // bruikbare data hebben; anders start de selector leeg ("-- geen --")
  const heeftVeld1 = window.availableFields.includes(APP_CONFIG.standaardVeld1) && veldHeeftBeschikbareData(APP_CONFIG.standaardVeld1);
  const heeftVeld2 = window.availableFields.includes(APP_CONFIG.standaardVeld2) && veldHeeftBeschikbareData(APP_CONFIG.standaardVeld2);
  window.addFieldSelector(heeftVeld1 ? APP_CONFIG.standaardVeld1 : undefined);
  window.addFieldSelector(heeftVeld2 ? APP_CONFIG.standaardVeld2 : undefined);

  // Voeg kleur-indicator toe bij de eerste selector (laat zien welk veld de kaartkleur bepaalt)
  setTimeout(() => {
    const eersteRij = document.getElementById('selectors-div')?.querySelector('.field-row');
    if (!eersteRij || eersteRij.querySelector('.color-hint')) return;

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginRight: '6px' });

    const kleurBlok = document.createElement('div');
    kleurBlok.className = 'color-hint';
    kleurBlok.title = 'Kleur: bepaalt welke variabele de kleur van de kaart beïnvloedt.';
    Object.assign(kleurBlok.style, { display: 'inline-block', width: '20px', height: '20px', border: '1.5px solid #333', borderRadius: '4px', cursor: 'default', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' });

    const label = document.createElement('span');
    Object.assign(label.style, { fontSize: '9px', fontWeight: 'bold', color: '#555' });
    label.textContent = 'kleur';

    const updateKleurHint = () => {
      const palet = document.getElementById('palette-select')?.value || 'viridis';
      kleurBlok.style.background = APP_CONFIG.paletGradients[palet] || APP_CONFIG.paletGradients['viridis'];
    };

    updateKleurHint();
    document.getElementById('palette-select')?.addEventListener('change', updateKleurHint);

    wrapper.append(kleurBlok, label);
    const eersteSelect = eersteRij.querySelector('select');
    eersteRij.insertBefore(wrapper, eersteSelect ?? eersteRij.firstChild);
  }, 120);

  document.getElementById('add-variable').disabled = false;
  refreshEquationFieldOptions();

  // Trigger visualisatie nadat de DOM klaar is
  setTimeout(() => window.herllaadVisualisatie?.(), 100);
};

document.getElementById('add-variable')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.addFieldSelector();
});

// ============================================================================
// FILTER — Toepassen en wissen
// ============================================================================

/** Leest filterwaarden uit de UI en vernieuwt de visualisatie */
function pasFilterToe() {
  const lees = (id) => { const v = document.getElementById(id)?.value; return v ? parseFloat(v) : null; };
  window.appData.filter = {
    min:     lees('filter-min'),
    max:     lees('filter-max'),
    lowPct:  lees('filter-lowpct'),
    highPct: lees('filter-highpct'),
  };
  herllaadVisualisatie();
}

/** Wist alle filterwaarden en vernieuwt de visualisatie */
function wisFilter() {
  window.appData.filter = null;
  ['filter-min', 'filter-max', 'filter-lowpct', 'filter-highpct']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  herllaadVisualisatie();
}


// ============================================================================
// DATA LADEN — Via PDOK API
// ============================================================================

/**
 * Haalt GeoJSON op van een PDOK API-endpoint en toont de data op de kaart.
 * Zet OGC-itemsformaat (items-array) om naar standaard GeoJSON FeatureCollection.
 * @param {string} url   - API-endpoint URL
 * @param {string} label - Naam voor foutmeldingen (niet zichtbaar bij succes)
 */
async function laadVanApi(url, label) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Netwerkfout: ' + res.status);
    let fc = await res.json();

    // OGC-API geeft soms { items: [...] } in plaats van { features: [...] }
    if (fc && !fc.features && Array.isArray(fc.items)) {
      fc = { type: 'FeatureCollection', features: fc.items };
    }

    if (!fc?.features) return;

    window.appData.lastFC = fc;
    if (window.multiLoaderState) window.multiLoaderState.originalData = fc;

    // Verwijder eventuele vorige lagen
    if (window.appData.choroplethLayer) {
      window.appData.dataLayer.removeLayer(window.appData.choroplethLayer);
      window.appData.choroplethLayer = null;
    }
    if (window.appData.baseGeoLayer) {
      window.appData.dataLayer.removeLayer(window.appData.baseGeoLayer);
      window.appData.baseGeoLayer = null;
    }

    // Toon features als neutrale grijze laag
    const laag = L.geoJSON(fc, { style: { color: '#888', weight: 1, fillOpacity: 0.3 } })
      .addTo(window.appData.dataLayer);

    window.bringSmallPolygonsToFront?.(window.appData.dataLayer);
    window.appData.baseGeoLayer = laag;

    try { map.fitBounds(laag.getBounds(), { maxZoom: 14 }); } catch (_) {}

    window.updateYearSlider?.(fc);
    window.populateFieldSelect?.(fc);

  } catch (err) {
    console.error(err);
    alert('Fout bij laden: ' + err.message);
  }
}


// ============================================================================
// BESTANDIMPORT — Wrapper voor importer.js
// ============================================================================

/**
 * Delegeert het importeren naar handleImportFile in importer.js.
 * @param {File} bestand
 */
async function handleFileImport(bestand) {
  if (window.handleImportFile) {
    await window.handleImportFile(bestand, { map, dataLayer });
  } else {
    alert('Importer module niet geladen.');
  }
}

document.getElementById('file-input')?.addEventListener('change', async (e) => {
  const bestand = e.target.files[0];
  if (!bestand) return;
  try {
    await handleFileImport(bestand);
  } catch (err) {
    console.error('Fout bij import:', err);
    alert('Fout bij bestandimport: ' + err.message);
  }
});


// ============================================================================
// EVENT-LISTENERS — Visualisatie-instellingen
// ============================================================================

document.getElementById('field-select')?.addEventListener('change',   herllaadVisualisatie);
document.getElementById('method-select')?.addEventListener('change',  herllaadVisualisatie);
document.getElementById('palette-select')?.addEventListener('change', herllaadVisualisatie);
document.getElementById('opacity-range')?.addEventListener('change',  herllaadVisualisatie);

document.getElementById('apply-filter')?.addEventListener('click', pasFilterToe);
document.getElementById('clear-filter')?.addEventListener('click', wisFilter);

// Snelknop: zet minimum op 1 om negatieve/nul-waarden te verbergen
document.getElementById('filter-negative')?.addEventListener('click', () => {
  const el = document.getElementById('filter-min');
  if (el) el.value = '1';
  window.appData.filter = { ...(window.appData.filter || {}), min: 1 };
  herllaadVisualisatie();
});


// ============================================================================
// SIDEBAR TOGGLE — Inklappen en uitklappen van het zijpaneel
// ============================================================================

(function () {
  const app = document.getElementById('app');
  const btn = document.getElementById('sidebar-toggle');
  if (!app || !btn) return;

  // Bepaal pijlrichting op basis van sidebar-positie (links of rechts)
  const sidebarLinks = document.documentElement.classList.contains('sidebar-left');
  btn.innerHTML = sidebarLinks ? '&#8249;' : '&#8250;';

  btn.addEventListener('click', () => {
    const ingeklapt = app.classList.toggle('sidebar-collapsed');

    // Pijl wisselt richting afhankelijk van in-/uitgeklapt en sidebar-positie
    btn.innerHTML = ingeklapt ? '&#8250;' : '&#8249;';

    // Geef Leaflet even tijd om de nieuwe grootte te registreren na CSS-transitie
    setTimeout(() => window.appData?.map?.invalidateSize(), 310);
  });
})();


// ============================================================================
// HOOFDPANELEN IN-/UITKLAPBAAR — Klik op de kop van een sidebar-vak (Visualisatie,
// Variabele, Nieuwe berekende variabele, Stories, Legenda, API's laden, enz.)
// om de inhoud van dat vak te verbergen/tonen.
// ============================================================================

(function () {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Eén gedelegeerde listener: werkt ook voor de legenda-kop, die dynamisch
  // opnieuw wordt getekend door map.js (elementen bestaan dan nog niet bij page-load).
  sidebar.addEventListener('click', (e) => {
    const kop = e.target.closest('.kaart-paneel > h3');
    if (!kop) return;
    const paneel = kop.parentElement;
    paneel.classList.toggle('is-ingeklapt');
  });
})();