// ============================================================================
// app.js — Heerlen Opportunity Atlas
// Kaart-initialisatie, event-listeners, filter- en visualisatie-logica
// ============================================================================

/**
 * Maak een technische veldnaam prettig leesbaar voor weergave aan de gebruiker:
 * underscores worden spaties en de eerste letter wordt een hoofdletter
 * (bv. "aantal_inwoners" → "Aantal inwoners"). De onderliggende data-sleutel
 * (het veld zelf, gebruikt om waarden op te zoeken) blijft altijd ongewijzigd —
 * dit is uitsluitend voor de weergave. Globaal beschikbaar voor alle scripts.
 */
window.mooieVeldnaam = function (veld) {
  if (!veld || typeof veld !== 'string') return veld;
  const metSpaties = veld.replace(/_/g, ' ').trim();
  if (!metSpaties) return veld;
  return metSpaties.charAt(0).toUpperCase() + metSpaties.slice(1);
};

/**
 * Toont een korte melding onderin beeld die vanzelf verdwijnt en niets blokkeert
 * (in plaats van alert(), waarbij je eerst op OK moet drukken). Dezelfde tekst
 * wordt niet dubbel getoond. Globaal beschikbaar voor alle scripts.
 */
window.toonMelding = function (tekst, duurMs = 4500) {
  let houder = document.getElementById('melding-houder');
  if (!houder) {
    houder = document.createElement('div');
    houder.id = 'melding-houder';
    houder.setAttribute('role', 'status');
    houder.setAttribute('aria-live', 'polite');
    document.body.appendChild(houder);
  }
  const bestaand = Array.from(houder.children).find(el => el.dataset.tekst === tekst);
  if (bestaand) { clearTimeout(bestaand._timer); bestaand._timer = setTimeout(() => bestaand.remove(), duurMs); return; }

  const melding = document.createElement('div');
  melding.className = 'melding';
  melding.dataset.tekst = tekst;
  melding.textContent = tekst;
  melding.addEventListener('click', () => melding.remove());
  houder.appendChild(melding);
  melding._timer = setTimeout(() => melding.remove(), duurMs);
};

// ============================================================================
// COOKIES — Voorkeuren van de gebruiker onthouden (favorieten, aangemaakte variabelen)
// ============================================================================

// Keuze uit de cookiemelding ('geaccepteerd' of 'geweigerd'); zelf altijd toegestaan
const COOKIE_KEUZE_NAAM = 'atlas_cookie_keuze';

/** Zet een cookie met een houdbaarheid in dagen (standaard 365 dagen). Na weigeren wordt niets meer opgeslagen. */
window.zetCookie = function (naam, waarde, dagen = 365) {
  if (naam !== COOKIE_KEUZE_NAAM && window.leesCookie(COOKIE_KEUZE_NAAM) === 'geweigerd') return;
  const verloopt = new Date();
  verloopt.setTime(verloopt.getTime() + dagen * 24 * 60 * 60 * 1000);
  document.cookie = `${naam}=${encodeURIComponent(waarde)};expires=${verloopt.toUTCString()};path=/;SameSite=Lax`;
};

/** Leest een cookie-waarde. Geeft null terug als de cookie niet bestaat. */
window.leesCookie = function (naam) {
  const veilig = naam.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
  const match  = document.cookie.match(new RegExp('(?:^|; )' + veilig + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Cookiemelding onderin beeld. Wordt eenmalig getoond (na de introductie) zolang
 * er nog geen keuze is gemaakt; de keuze zelf wordt in een cookie onthouden.
 * Bij weigeren worden de al opgeslagen voorkeuren-cookies verwijderd.
 */
window.toonCookieMelding = function () {
  if (window.leesCookie(COOKIE_KEUZE_NAAM) || document.getElementById('cookie-melding')) return;

  const melding = document.createElement('section');
  melding.id = 'cookie-melding';
  melding.className = 'cookie-melding';
  melding.setAttribute('role', 'dialog');
  melding.setAttribute('aria-labelledby', 'cookie-melding-titel');
  melding.innerHTML = `
    <div class="cookie-melding-tekst">
      <h2 id="cookie-melding-titel">Cookies</h2>
      <p>De atlas gebruikt alleen functionele cookies om je favoriete en zelfgemaakte variabelen en je
      kaartweergave te onthouden. Er worden geen gegevens gedeeld of voor advertenties gebruikt.</p>
    </div>
    <div class="cookie-melding-knoppen">
      <button type="button" data-keuze="geaccepteerd">Accepteren</button>
      <button type="button" data-keuze="geweigerd" class="is-secundair">Weigeren</button>
    </div>`;

  melding.addEventListener('click', (e) => {
    const keuze = e.target.closest('[data-keuze]')?.dataset.keuze;
    if (!keuze) return;
    window.zetCookie(COOKIE_KEUZE_NAAM, keuze);
    if (keuze === 'geweigerd') {
      document.cookie.split('; ').map(c => c.split('=')[0])
        .filter(naam => naam.startsWith('atlas_') && naam !== COOKIE_KEUZE_NAAM)
        .forEach(naam => { document.cookie = `${naam}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`; });
    }
    melding.remove();
  });

  document.body.appendChild(melding);
};

// ============================================================================
// FAVORIETEN — Variabelen die de gebruiker met een ster heeft gemarkeerd
// ============================================================================

const FAVORIETEN_COOKIE_NAAM = 'atlas_favoriete_velden';

window.favorieteVelden = new Set(
  (window.leesCookie(FAVORIETEN_COOKIE_NAAM) || '').split(',').map(s => s.trim()).filter(Boolean)
);

/** Wisselt de favoriet-status van een veld om, onthoudt dit in een cookie en vernieuwt de UI. */
window.toggleFavorietVeld = function (veld) {
  if (!veld) return;
  window.favorieteVelden.has(veld) ? window.favorieteVelden.delete(veld) : window.favorieteVelden.add(veld);
  window.zetCookie(FAVORIETEN_COOKIE_NAAM, Array.from(window.favorieteVelden).join(','));
  window.vernieuwVeldSelecties?.();
};


// ============================================================================
// CONFIGURATIE — Pas hier de projectinstellingen aan
// ============================================================================

const APP_CONFIG = {

  // --- Kaartweergave ---
  kaartCentrum:        [50.8889, 5.9794],   // Startpositie kaart (lat, lon)
  standaardZoom:       12,                  // Zoomniveau bij opstarten
  maxZoom:             19,                  // Maximaal zoomniveau
  zoomStap:            0.5,                 // Per scrollklik/knop een halve stap: rustiger inzoomen
  scrollPxPerZoom:     120,                 // Meer scrollen nodig per zoomniveau = zachter

  // --- Ondergronden (keuze via het tandwiel); 'licht' is de rustige grijze look van de introductie ---
  standaardOndergrond: 'licht',
  ondergronden: {
    licht:     { naam: 'Licht',     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attributie: '© OpenStreetMap contributors' },
    kaart:     { naam: 'Kaart',     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attributie: '© OpenStreetMap contributors' },
    luchtfoto: { naam: 'Luchtfoto', url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg', attributie: '© Beeldmateriaal.nl / PDOK' },
  },
  voorbeeldTegel: { z: 13, x: 4232, y: 2746 },  // Tegel van Heerlen-centrum voor de voorbeeldplaatjes

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
  updateOpacityDisplay();
};

// Dekking: "magnetisch" naar 0/25/50/75/100% als je er dichtbij komt, en het actieve punt markeren
const DEKKING_SNAPPUNTEN = [0, 0.25, 0.5, 0.75, 1];
const DEKKING_SNAP_MARGE = 0.03; // ±3% rond een snappunt

function updateOpacityDisplay() {
  const slider  = document.getElementById('opacity-range');
  const display = document.getElementById('opacity-display');
  if (!slider) return;
  const waarde = parseFloat(slider.value);
  if (display) display.textContent = `${Math.round(waarde * 100)}%`;
  slider.style.setProperty('--v', String(waarde));
  document.querySelectorAll('.dekking-ticks span').forEach(el =>
    el.classList.toggle('is-actief', Math.abs(parseFloat(el.style.getPropertyValue('--f')) - waarde) < 0.001));
}

document.getElementById('opacity-range')?.addEventListener('input', (e) => {
  const waarde = parseFloat(e.target.value);
  const dichtstbij = DEKKING_SNAPPUNTEN.find(p => Math.abs(p - waarde) <= DEKKING_SNAP_MARGE);
  if (dichtstbij !== undefined) e.target.value = String(dichtstbij);
  updateOpacityDisplay();
});


// ============================================================================
// KAART-INITIALISATIE
// ============================================================================

const map = L.map('map', {
  zoomSnap:            0.25,
  zoomDelta:           APP_CONFIG.zoomStap,
  wheelPxPerZoomLevel: APP_CONFIG.scrollPxPerZoom,
}).setView(APP_CONFIG.kaartCentrum, APP_CONFIG.standaardZoom);

// Tijdens een zoom-animatie loopt de lichte waas buiten Heerlen achter; even verbergen oogt rustiger
map.on('zoomstart', () => map.getContainer().classList.add('is-zoomend'));
map.on('zoomend',   () => map.getContainer().classList.remove('is-zoomend'));

// Aparte layergroup zodat data-lagen onafhankelijk van de basemap beheerd worden
const dataLayer = L.layerGroup().addTo(map);


// ============================================================================
// KAARTWEERGAVE — Kleurenpalet, dekking en ondergrond, getoond als voorbeelden
// ============================================================================

const ONDERGROND_COOKIE_NAAM = 'atlas_ondergrond';
const paletSelect = document.getElementById('palette-select');
let ondergrondLaag    = null;
let huidigeOndergrond = null;

/** Zet de actieve kleurstaal en ondergrond (ook als een story het palet heeft veranderd). */
function markeerActieveKeuzes() {
  document.querySelectorAll('#palet-keuze .keuze-knop').forEach(k =>
    k.setAttribute('aria-checked', String(k.dataset.waarde === paletSelect?.value)));
  document.querySelectorAll('#ondergrond-keuze .keuze-knop').forEach(k =>
    k.setAttribute('aria-checked', String(k.dataset.waarde === huidigeOndergrond)));
}

function maakKeuzeKnop(waarde, label, inhoud, kiezen) {
  const knop = Object.assign(document.createElement('button'), { type: 'button', className: 'keuze-knop', title: label });
  knop.dataset.waarde = waarde;
  knop.setAttribute('role', 'radio');
  knop.setAttribute('aria-label', label);
  knop.innerHTML = inhoud;
  knop.addEventListener('click', () => { kiezen(waarde); markeerActieveKeuzes(); });
  return knop;
}

function kiesOndergrond(sleutel) {
  const instelling = APP_CONFIG.ondergronden[sleutel] || APP_CONFIG.ondergronden[APP_CONFIG.standaardOndergrond];
  if (ondergrondLaag) map.removeLayer(ondergrondLaag);
  ondergrondLaag = L.tileLayer(instelling.url, { maxZoom: APP_CONFIG.maxZoom, attribution: instelling.attributie }).addTo(map);
  huidigeOndergrond = sleutel in APP_CONFIG.ondergronden ? sleutel : APP_CONFIG.standaardOndergrond;
  map.getContainer().dataset.ondergrond = huidigeOndergrond;
}

kiesOndergrond(window.leesCookie(ONDERGROND_COOKIE_NAAM) || APP_CONFIG.standaardOndergrond);

// --- Keuzes opbouwen (na het laden van map.js, dat de kleurschema's levert) ---
document.addEventListener('DOMContentLoaded', () => {
  const paletKeuze = document.getElementById('palet-keuze');
  Array.from(paletSelect?.options || []).forEach(optie => {
    const stalen = haalKleurSchema(optie.value, 5).map(kleur => `<i style="background:${kleur}"></i>`).join('');
    paletKeuze?.appendChild(maakKeuzeKnop(optie.value, optie.textContent, `<span class="palet-staal">${stalen}</span>`, (waarde) => {
      paletSelect.value = waarde;
      paletSelect.dispatchEvent(new Event('change'));
    }));
  });

  const { z, x, y } = APP_CONFIG.voorbeeldTegel;
  const ondergrondKeuze = document.getElementById('ondergrond-keuze');
  Object.entries(APP_CONFIG.ondergronden).forEach(([sleutel, { naam, url }]) => {
    const tegel = url.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y);
    ondergrondKeuze?.appendChild(maakKeuzeKnop(sleutel, naam,
      `<img class="ondergrond-voorbeeld is-${sleutel}" src="${tegel}" alt="" loading="lazy"><span>${naam}</span>`, (waarde) => {
        kiesOndergrond(waarde);
        window.zetCookie(ONDERGROND_COOKIE_NAAM, waarde);
      }));
  });

  markeerActieveKeuzes();
});


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

document.getElementById('open-3d')?.addEventListener('click', () => {
  window.location.href = 'huisjes-3d.html';
});


// ============================================================================
// VISUALISATIE — Herlaad met huidige instellingen
// ============================================================================

/**
 * Leest de huidige UI-instellingen en roept toonChoropleth aan.
 * Toont ook grafieken voor alle geselecteerde velden.
 */
window.herllaadVisualisatie = function () {
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
    klassenFC: window.multiLoaderState?.originalData,
  });

  // Render grafieken voor alle geselecteerde velden
  const veldenVoorGrafiek = geselecteerde.length > 0 ? geselecteerde : [veld];
  window.renderMultiVariableCharts?.(fc, veldenVoorGrafiek);
};


// ============================================================================
// VELDSELECTOREN — "Verken de data": eerste rij kleurt de kaart, de overige
// rijen verschijnen in het info-venster bij een buurt
// ============================================================================

const VARIABELEN_CONFIG = {
  // Technische velden die niets zeggen op een kaart
  verborgenVelden: ['jaar', 'indelingswijziging_wijken_en_buurten', 'meest_voorkomende_postcode'],

  // Categorieën in het keuzemenu; de eerste passende regel wint, dus volgorde is belangrijk
  categorieen: [
    ['Inkomen en armoede',     /inkomen|koopkracht|sociaal_minimum|vermogen/],
    ['Werk en uitkeringen',    /uitkering|arbeidsparticipatie|werknemers|zelfstandigen/],
    ['Zorg en welzijn',        /wmo|jeugdzorg/],
    ['Opleiding',              /opleidingsniveau/],
    ['Energie',                /elektriciteit|gasverbruik/],
    ['Vervoer en bereikbaarheid', /auto|motortweewielers|station|oprit/],
    ['Wonen',                  /woning|huur|koop|bouwjaar|leegstand|gezins|bewoond|stadsverwarming|eigendom/],
    ['Huishoudens',            /huishoud/],
    ['Bedrijven',              /bedrijf|bedrijven/],
    ['Voorzieningen: zorg en veiligheid', /huisarts|apotheek|ziekenhuis|brandweer/],
    ['Voorzieningen: onderwijs en opvang', /onderwijs|havo|vmbo|kinderdagverblijf|opvang/],
    ['Voorzieningen: winkels en horeca',  /supermarkt|winkels|warenhuis|cafe|restaurant|hotel/],
    ['Voorzieningen: cultuur en vrije tijd', /bioscoop|theater|muse|poppodium|attractiepark|zwembad|sauna|ijsbaan|zonnebank|bibliotheek/],
    ['Bevolking',              /inwoners|mannen|vrouwen|personen_\d|geboorte|sterfte|gehuwd|gescheid|verweduwd|migratie|percentage_uit_/],
    ['Gebied',                 /oppervlakte|dichtheid|stedelijkheid|dekking/],
  ],
  overigeCategorie: 'Overig',
};

const ICONEN = {
  kaart:      '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 2.2 6 2v11.6l-6-2V6.2z"/></svg>',
  info:       '<svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h1v2l2.5-2H19V6H5z"/></svg>',
  prullenbak: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3 0v8h1.5v-8H13z"/></svg>',
};

window.availableFields  = window.availableFields  || [];
window.customFieldNames = window.customFieldNames || [];

function isCustomField(veld) {
  return Boolean(veld) && (window.customFieldNames || []).includes(veld);
}

window.getFieldGroupsForUi = function () {
  const fields = [...new Set((window.availableFields || []).filter(Boolean))]
    .filter(veld => !VARIABELEN_CONFIG.verborgenVelden.includes(veld));
  const favorites = fields.filter(veld => window.favorieteVelden.has(veld));
  const overig    = fields.filter(veld => !window.favorieteVelden.has(veld));
  return {
    favorites,
    custom: overig.filter(isCustomField),
    standard: overig.filter(veld => !isCustomField(veld))
  };
};

/** Thematische categorie van een basisvariabele. */
function categorieVanVeld(veld) {
  return VARIABELEN_CONFIG.categorieen.find(([, regel]) => regel.test(veld))?.[0]
    ?? VARIABELEN_CONFIG.overigeCategorie;
}

/** Alle bruikbare velden per categorie: favorieten en zelfgemaakte eerst, daarna de thema's. */
function veldCategorieen() {
  const { favorites, custom, standard } = window.getFieldGroupsForUi();
  const lijst = [['Favorieten', favorites], ['Zelfgemaakt', custom]];
  const perThema = new Map();
  standard.forEach(veld => {
    const naam = categorieVanVeld(veld);
    if (!perThema.has(naam)) perThema.set(naam, []);
    perThema.get(naam).push(veld);
  });
  [...VARIABELEN_CONFIG.categorieen.map(([naam]) => naam), VARIABELEN_CONFIG.overigeCategorie]
    .forEach(naam => lijst.push([naam, perThema.get(naam) || []]));

  return lijst
    .map(([naam, velden]) => ({ naam, velden: velden.filter(veldHeeftBeschikbareData) }))
    .filter(c => c.velden.length);
}

/** Geeft alle momenteel geselecteerde veldwaarden terug als array */
window.getSelectedFields = function () {
  return Array.from(document.querySelectorAll('#selectors-div select.field-select-item'))
    .map(s => s.value)
    .filter(Boolean);
};

/**
 * Een veld is selecteerbaar als het (over álle jaren) minstens één numerieke
 * waarde heeft die ook door het actieve filter komt. Zo verdwijnt een veld
 * niet tijdens het afspelen van de tijdlijn als het in één jaar ontbreekt.
 */
function veldHeeftBeschikbareData(veld) {
  const fc = window.multiLoaderState?.originalData || window.appData?.lastFC;
  if (!fc || typeof window.haalNumeriekeWaarden !== 'function') return true;

  const alleWaarden = window.haalNumeriekeWaarden(fc, veld);
  if (!alleWaarden.length) return false;

  const filter = window.appData?.filter || null;
  if (!filter || typeof window.waardePasseertFilter !== 'function') return true;

  return alleWaarden.some(w => window.waardePasseertFilter(w, alleWaarden, filter));
}

/**
 * (Her)vult de verborgen <select> van een rij. Een eerder gekozen veld dat
 * niet meer bruikbaar is, valt terug op leeg.
 */
function vulVeldSelect(sel, forceerWaarde) {
  const gewenst = forceerWaarde !== undefined ? forceerWaarde : sel.value;
  const velden  = veldCategorieen().flatMap(c => c.velden);

  sel.innerHTML = '<option value=""></option>';
  velden.forEach(veld => sel.add(new Option(window.mooieVeldnaam(veld), veld)));
  sel.value = velden.includes(gewenst) ? gewenst : '';

  vernieuwVeldPickerInhoud(sel);
}

/** Werk iconen en rollen bij: de eerste rij is de kaartvariabele, de rest het info-venster. */
function werkRijRollenBij() {
  document.querySelectorAll('#selectors-div .field-row').forEach((rij, i) => {
    const rol = i === 0 ? 'kaart' : 'info';
    if (rij.dataset.rol === rol) return;
    rij.dataset.rol = rol;
    rij.querySelector('.rij-icoon').innerHTML = ICONEN[rol];
    rij.querySelector('.rij-icoon').title = rol === 'kaart' ? 'Kleurt de kaart' : 'Zichtbaar in het info-venster';
  });
}

/** Voegt een veldselector-rij toe. */
window.addFieldSelector = function (standaardWaarde) {
  const container = document.getElementById('field-select');
  if (!container) return;

  let selectorsDiv = document.getElementById('selectors-div');
  if (!selectorsDiv) {
    selectorsDiv = Object.assign(document.createElement('div'), { id: 'selectors-div' });
    container.appendChild(selectorsDiv);
  }

  const rij = Object.assign(document.createElement('div'), { className: 'field-row' });
  const icoon = Object.assign(document.createElement('span'), { className: 'rij-icoon' });
  icoon.setAttribute('aria-hidden', 'true');

  const sel = Object.assign(document.createElement('select'), { className: 'field-select-item', hidden: true });
  sel.addEventListener('change', herllaadVisualisatie);

  const verwijder = Object.assign(document.createElement('button'), {
    type: 'button', className: 'rij-verwijder', innerHTML: ICONEN.prullenbak, title: 'Verwijderen',
  });
  verwijder.setAttribute('aria-label', 'Variabele verwijderen');
  verwijder.addEventListener('click', () => { rij.remove(); werkRijRollenBij(); herllaadVisualisatie(); });

  rij.append(icoon, sel, maakVeldPicker(sel), verwijder);
  selectorsDiv.appendChild(rij);
  vulVeldSelect(sel, standaardWaarde);
  werkRijRollenBij();
  return sel;
};

/** Werkt alle rijen bij na een wijziging in data, filter of favorieten. */
window.vernieuwVeldSelecties = function () {
  document.querySelectorAll('#selectors-div select.field-select-item').forEach(sel => vulVeldSelect(sel));
};

/** Bouwt de rijen op na het laden van een dataset: standaard één kaart- en één info-variabele. */
window.initFieldSelectors = function (velden) {
  window.availableFields = velden || [];
  const container = document.getElementById('field-select');
  const addBtn = document.getElementById('add-variable');
  if (!container) return;

  if (!window.availableFields.length) {
    container.innerHTML = '<div class="hint">Laad eerst een dataset om variabelen te kunnen kiezen.</div>';
    if (addBtn) addBtn.disabled = true;
    return;
  }

  container.innerHTML = '';
  const beschikbaar = (veld) => window.availableFields.includes(veld) && veldHeeftBeschikbareData(veld) ? veld : undefined;
  window.addFieldSelector(beschikbaar(APP_CONFIG.standaardVeld1));
  window.addFieldSelector(beschikbaar(APP_CONFIG.standaardVeld2));

  if (addBtn) addBtn.disabled = false;
  window.refreshEquationFieldOptions?.();
  setTimeout(() => window.herllaadVisualisatie?.(), 100);
};

document.getElementById('add-variable')?.addEventListener('click', () => {
  window.addFieldSelector();
  document.querySelector('#selectors-div .field-row:last-child .veld-picker-trigger')?.click();
});

document.getElementById('verken-info-toggle')?.addEventListener('click', (e) => {
  const info = document.getElementById('verken-info');
  info.hidden = !info.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!info.hidden));
});


// ============================================================================
// VELD-PICKER — Keuzemenu met zoekbalk en categorieën (één niveau diep).
// Stuurt de verborgen <select> van de rij aan.
// ============================================================================

function maakVeldPicker(sel) {
  const wrap = Object.assign(document.createElement('div'), { className: 'veld-picker' });
  const trigger = Object.assign(document.createElement('button'), { type: 'button', className: 'veld-picker-trigger' });
  const menu = Object.assign(document.createElement('div'), { className: 'veld-picker-menu', hidden: true });
  const zoek = Object.assign(document.createElement('input'), {
    type: 'search', className: 'veld-picker-zoek', placeholder: 'Zoek een variabele…',
  });
  zoek.setAttribute('aria-label', 'Zoek een variabele');
  const lijst = Object.assign(document.createElement('div'), { className: 'veld-picker-lijst' });

  menu.append(zoek, lijst);
  wrap.append(trigger, menu);
  sel._picker = { trigger, menu, zoek, lijst, categorie: null };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const openen = menu.hidden;
    sluitVeldPickers();
    if (!openen) return;
    sel._picker.categorie = null;
    zoek.value = '';
    vernieuwVeldPickerInhoud(sel);
    menu.hidden = false;
    zoek.focus();
  });
  zoek.addEventListener('input', () => vernieuwVeldPickerInhoud(sel));
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sluitVeldPickers(); trigger.focus(); } });

  return wrap;
}

function sluitVeldPickers() {
  document.querySelectorAll('.veld-picker-menu').forEach(m => { m.hidden = true; });
}

// Klik buiten een veld-picker sluit het open menu
document.addEventListener('click', (e) => {
  if (!e.target.closest('.veld-picker')) sluitVeldPickers();
});

/** Bouwt de trigger-tekst en de lijst: zoekresultaten, één categorie, of het categorie-overzicht. */
function vernieuwVeldPickerInhoud(sel) {
  const picker = sel._picker;
  if (!picker) return;
  const { trigger, zoek, lijst } = picker;

  trigger.textContent = sel.value ? window.mooieVeldnaam(sel.value) : 'Kies een variabele';
  trigger.classList.toggle('is-leeg', !sel.value);
  lijst.innerHTML = '';

  const categorieen = veldCategorieen();
  const term = zoek.value.trim().toLowerCase();
  const voegToe = (...el) => lijst.append(...el);

  if (term) {
    const treffers = categorieen.flatMap(c => c.velden)
      .filter(veld => window.mooieVeldnaam(veld).toLowerCase().includes(term));
    treffers.forEach(veld => voegToe(maakVeldItem(sel, veld, categorieVanVeld(veld))));
    if (!treffers.length) voegToe(Object.assign(document.createElement('div'), { className: 'veld-picker-leeg', textContent: 'Geen variabelen gevonden.' }));
    return;
  }

  const open = categorieen.find(c => c.naam === picker.categorie);
  if (open) {
    const terug = Object.assign(document.createElement('button'), {
      type: 'button', className: 'veld-picker-terug', innerHTML: `<span aria-hidden="true">‹</span> ${open.naam}`,
    });
    terug.addEventListener('click', (e) => { e.stopPropagation(); picker.categorie = null; vernieuwVeldPickerInhoud(sel); });
    voegToe(terug, ...open.velden.map(veld => maakVeldItem(sel, veld)));
    return;
  }

  categorieen.forEach(({ naam, velden }) => {
    const knop = Object.assign(document.createElement('button'), { type: 'button', className: 'veld-picker-categorie' });
    knop.classList.toggle('is-actief', velden.includes(sel.value));
    knop.innerHTML = `<span class="veld-picker-naam"></span><span class="veld-picker-aantal">${velden.length}</span><span aria-hidden="true">›</span>`;
    knop.firstChild.textContent = naam;
    knop.addEventListener('click', (e) => { e.stopPropagation(); picker.categorie = naam; vernieuwVeldPickerInhoud(sel); });
    voegToe(knop);
  });
  if (!categorieen.length) voegToe(Object.assign(document.createElement('div'), { className: 'veld-picker-leeg', textContent: 'Geen variabelen beschikbaar.' }));
}

window.vernieuwVeldPickerInhoud = vernieuwVeldPickerInhoud;

/** Eén variabele in het menu: ster (favoriet), naam en — bij zelfgemaakte — een prullenbak. */
function maakVeldItem(sel, veld, categorieLabel) {
  const item = Object.assign(document.createElement('div'), { className: 'veld-picker-item' });
  item.classList.toggle('is-geselecteerd', veld === sel.value);

  const isFavoriet = window.favorieteVelden.has(veld);
  const ster = Object.assign(document.createElement('button'), {
    type: 'button', className: 'veld-ster', textContent: isFavoriet ? '★' : '☆',
    title: isFavoriet ? 'Verwijderen uit favorieten' : 'Toevoegen aan favorieten',
  });
  ster.classList.toggle('is-actief', isFavoriet);
  ster.addEventListener('click', (e) => { e.stopPropagation(); window.toggleFavorietVeld(veld); });

  const naam = Object.assign(document.createElement('button'), {
    type: 'button', className: 'veld-picker-naam', textContent: window.mooieVeldnaam(veld), title: window.mooieVeldnaam(veld),
  });
  if (categorieLabel) naam.append(Object.assign(document.createElement('small'), { textContent: categorieLabel }));
  naam.addEventListener('click', () => {
    sel.value = veld;
    sluitVeldPickers();
    herllaadVisualisatie();
  });

  item.append(ster, naam);

  if (isCustomField(veld)) {
    const prullenbak = Object.assign(document.createElement('button'), {
      type: 'button', className: 'veld-verwijder', innerHTML: ICONEN.prullenbak, title: 'Deze zelfgemaakte variabele verwijderen',
    });
    prullenbak.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Weet je zeker dat je de variabele "${window.mooieVeldnaam(veld)}" wilt verwijderen?`)) {
        window.verwijderAangemaakteVariabele?.(veld);
      }
    });
    item.appendChild(prullenbak);
  }
  return item;
}

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
// HOOFDPANELEN IN-/UITKLAPBAAR — Klik op de kop van een sidebar-vak (Stories,
// Meer, Databronnen, enz.) om de inhoud van dat vak te verbergen/tonen.
// ============================================================================

(function () {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Eén gedelegeerde listener: werkt ook voor dynamisch toegevoegde secties.
  sidebar.addEventListener('click', (e) => {
    const kop = e.target.closest('.kaart-paneel > h3');
    if (!kop) return;
    if (e.target.closest('button, input, select, a')) return; // knoppen in de kop klappen het paneel niet in
    const paneel = kop.parentElement;
    paneel.classList.toggle('is-ingeklapt');
  });
})();


// ============================================================================
// KAARTKNOPPEN — Tandwiel (kaartweergave) en "i" (legenda) rechtsboven op de kaart
// ============================================================================

(function () {
  const widget    = document.getElementById('legend-widget');
  const legenda   = document.getElementById('legend');
  const legendaKnop = document.getElementById('legend-icon-toggle');
  const weergave  = document.getElementById('kaartweergave');
  const weergaveKnop = document.getElementById('kaartweergave-toggle');
  if (!widget || !legenda || !weergave) return;

  // Klikken en scrollen op de knoppen en panelen mag de kaart niet bewegen
  [widget, document.getElementById('year-filter-area')].forEach(el => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  });

  legendaKnop?.addEventListener('click', () => {
    const zichtbaar = legenda.classList.toggle('is-zichtbaar');
    legendaKnop.setAttribute('aria-expanded', String(zichtbaar));
    legenda.setAttribute('aria-hidden', String(!zichtbaar));
  });

  const toonWeergave = (open) => {
    weergave.hidden = !open;
    weergaveKnop.setAttribute('aria-expanded', String(open));
    if (open) markeerActieveKeuzes();
  };
  weergaveKnop?.addEventListener('click', () => toonWeergave(weergave.hidden));
  document.addEventListener('click', (e) => { if (!widget.contains(e.target)) toonWeergave(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !weergave.hidden) toonWeergave(false); });
})();
