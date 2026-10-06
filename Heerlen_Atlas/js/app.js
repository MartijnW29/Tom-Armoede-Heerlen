// ============================================================================
// APP.JS — Heerlen Opportunity Atlas
// Kaart, kaartweergave, "Verken de data" en de zijbalk
// ============================================================================


// ============================================================================
// CONFIGURATIE — Pas hier de projectinstellingen aan
// ============================================================================

const APP_CONFIG = {
  // --- Kaart ---
  kaartCentrum:    [50.8889, 5.9794],
  standaardZoom:   12,
  maxZoom:         19,
  zoomStap:        0.5,    // +/- knoppen: een halve stap per klik
  scrollSnelheid:  0.01,   // zoomniveaus per wiel-eenheid: één wieltik ≈ een halve stap
  scrollVolgen:    0.25,   // deel van de resterende afstand per beeldje: lager = zachter uitlopen
  tekenMarge:      0.6,    // vlakken tot 60% van de kaartbreedte buiten beeld tekenen (voor uitzoomen)

  // --- Ondergronden (keuze via het tandwiel); 'licht' is de grijze look van de introductie ---
  standaardOndergrond: 'licht',
  ondergronden: {
    licht:     { naam: 'Licht',     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attributie: '© OpenStreetMap contributors' },
    kaart:     { naam: 'Kaart',     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attributie: '© OpenStreetMap contributors' },
    luchtfoto: { naam: 'Luchtfoto', url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg', attributie: '© Beeldmateriaal.nl / PDOK' },
  },
  voorbeeldTegel: { z: 13, x: 4232, y: 2746 },  // tegel van Heerlen-centrum voor de voorbeeldplaatjes

  // --- Visualisatie ---
  standaardMethode:       'quantile',  // 'quantile' of 'equal'
  standaardPalet:         'rdylgn',
  standaardDekking:       0.65,
  standaardAantalKlassen: 5,

  // --- Variabelen bij het opstarten: kaart en info-venster ---
  standaardVeld1: 'aantal_inwoners',
  standaardVeld2: 'aantal_huishoudens',
};

const VARIABELEN_CONFIG = {
  // Technische velden die niets zeggen op een kaart
  verborgenVelden: ['jaar', 'indelingswijziging_wijken_en_buurten', 'meest_voorkomende_postcode'],

  // Categorieën in het keuzemenu; de eerste passende regel wint, dus volgorde is belangrijk
  categorieen: [
    ['Inkomen en armoede',                   /inkomen|koopkracht|sociaal_minimum|vermogen/],
    ['Werk en uitkeringen',                  /uitkering|arbeidsparticipatie|werknemers|zelfstandigen/],
    ['Zorg en welzijn',                      /wmo|jeugdzorg/],
    ['Opleiding',                            /opleidingsniveau/],
    ['Energie',                              /elektriciteit|gasverbruik/],
    ['Vervoer en bereikbaarheid',            /auto|motortweewielers|station|oprit/],
    ['Wonen',                                /woning|huur|koop|bouwjaar|leegstand|gezins|bewoond|stadsverwarming|eigendom/],
    ['Huishoudens',                          /huishoud/],
    ['Bedrijven',                            /bedrijf|bedrijven/],
    ['Voorzieningen: zorg en veiligheid',    /huisarts|apotheek|ziekenhuis|brandweer/],
    ['Voorzieningen: onderwijs en opvang',   /onderwijs|havo|vmbo|kinderdagverblijf|opvang/],
    ['Voorzieningen: winkels en horeca',     /supermarkt|winkels|warenhuis|cafe|restaurant|hotel/],
    ['Voorzieningen: cultuur en vrije tijd', /bioscoop|theater|muse|poppodium|attractiepark|zwembad|sauna|ijsbaan|zonnebank|bibliotheek/],
    ['Bevolking',                            /inwoners|mannen|vrouwen|personen_\d|geboorte|sterfte|gehuwd|gescheid|verweduwd|migratie|percentage_uit_/],
    ['Gebied',                               /oppervlakte|dichtheid|stedelijkheid|dekking/],
  ],
  overigeCategorie: 'Overig',
};

const COOKIES = {
  keuze:      'atlas_cookie_keuze',   // 'geaccepteerd' of 'geweigerd'; deze mag altijd
  favorieten: 'atlas_favoriete_velden',
  ondergrond: 'atlas_ondergrond',
};

const ICONEN = {
  kaart:      '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 2.2 6 2v11.6l-6-2V6.2z"/></svg>',
  info:       '<svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h1v2l2.5-2H19V6H5z"/></svg>',
  prullenbak: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3 0v8h1.5v-8H13z"/></svg>',
};


// ============================================================================
// HULPFUNCTIES — Gedeeld met alle scripts
// ============================================================================

/** Maak een element met eigenschappen in één keer, bv. maak('button', { type: 'button', textContent: 'OK' }). */
function maak(tag, eigenschappen = {}) {
  return Object.assign(document.createElement(tag), eigenschappen);
}

/** "aantal_inwoners" → "Aantal inwoners". Alleen voor weergave; de data-sleutel blijft ongewijzigd. */
window.mooieVeldnaam = function (veld) {
  const tekst = typeof veld === 'string' ? veld.replace(/_/g, ' ').trim() : '';
  return tekst ? tekst[0].toUpperCase() + tekst.slice(1) : veld;
};

/** Korte melding onderin beeld die vanzelf verdwijnt (in plaats van alert). Dezelfde tekst komt er niet dubbel bij. */
window.toonMelding = function (tekst, duurMs = 4500) {
  let houder = document.getElementById('melding-houder');
  if (!houder) {
    houder = maak('div', { id: 'melding-houder' });
    houder.setAttribute('role', 'status');
    houder.setAttribute('aria-live', 'polite');
    document.body.appendChild(houder);
  }
  const melding = [...houder.children].find(el => el.dataset.tekst === tekst)
    || houder.appendChild(maak('div', { className: 'melding', textContent: tekst, onclick() { this.remove(); } }));
  melding.dataset.tekst = tekst;
  clearTimeout(melding._timer);
  melding._timer = setTimeout(() => melding.remove(), duurMs);
};


// ============================================================================
// COOKIES — Voorkeuren onthouden (favorieten, zelfgemaakte variabelen, ondergrond)
// ============================================================================

/** Zet een cookie; na "Weigeren" wordt niets meer opgeslagen. */
window.zetCookie = function (naam, waarde, dagen = 365) {
  if (naam !== COOKIES.keuze && window.leesCookie(COOKIES.keuze) === 'geweigerd') return;
  const verloopt = new Date(Date.now() + dagen * 864e5).toUTCString();
  document.cookie = `${naam}=${encodeURIComponent(waarde)};expires=${verloopt};path=/;SameSite=Lax`;
};

window.leesCookie = function (naam) {
  const waarde = document.cookie.split('; ').find(c => c.startsWith(naam + '='));
  return waarde ? decodeURIComponent(waarde.slice(naam.length + 1)) : null;
};

/** Cookiemelding onderin beeld, eenmalig (na de introductie). Bij weigeren gaan bestaande voorkeuren weg. */
window.toonCookieMelding = function () {
  if (window.leesCookie(COOKIES.keuze) || document.getElementById('cookie-melding')) return;

  const melding = maak('section', { id: 'cookie-melding', className: 'cookie-melding' });
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
    window.zetCookie(COOKIES.keuze, keuze);
    if (keuze === 'geweigerd') {
      document.cookie.split('; ').map(c => c.split('=')[0])
        .filter(naam => naam.startsWith('atlas_') && naam !== COOKIES.keuze)
        .forEach(naam => { document.cookie = `${naam}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`; });
    }
    melding.remove();
  });

  document.body.appendChild(melding);
};


// ============================================================================
// FAVORIETEN — Variabelen met een ster
// ============================================================================

window.favorieteVelden = new Set((window.leesCookie(COOKIES.favorieten) || '').split(',').filter(Boolean));

window.toggleFavorietVeld = function (veld) {
  const favorieten = window.favorieteVelden;
  favorieten.has(veld) ? favorieten.delete(veld) : favorieten.add(veld);
  window.zetCookie(COOKIES.favorieten, [...favorieten].join(','));
  window.vernieuwVeldSelecties();
};


// ============================================================================
// KAART — Leaflet-kaart en gedeelde status
// ============================================================================

const map = L.map('map', {
  zoomSnap:        0.25,
  zoomDelta:       APP_CONFIG.zoomStap,
  scrollWheelZoom: false,  // vervangen door vloeiend zoomen hieronder
}).setView(APP_CONFIG.kaartCentrum, APP_CONFIG.standaardZoom);

/**
 * Vloeiend zoomen met het muiswiel: elk beeldje schuift de kaart een stukje richting het
 * doel-zoomniveau, rond het punt onder de muis (zoals de plugin Leaflet.SmoothWheelZoom).
 * Gebruikt de interne _move-functies van Leaflet 1.9, net als Leaflet's eigen animaties.
 */
const VloeiendZoomen = L.Handler.extend({
  addHooks() {
    L.DomEvent.on(this._map.getContainer(), 'wheel', this._opWiel, this);
    this._map.on('mousemove', this._volgMuis, this);
  },
  removeHooks() {
    L.DomEvent.off(this._map.getContainer(), 'wheel', this._opWiel, this);
    this._map.off('mousemove', this._volgMuis, this);
  },

  // De muis blijft gevolgd, zodat je tijdens het zoomen ook kunt slepen
  _volgMuis(e) { this._muis = e.containerPoint; },

  _opWiel(e) {
    L.DomEvent.stop(e);
    const kaart = this._map;
    this._muis = kaart.mouseEventToContainerPoint(e);
    if (!this._bezig) {
      this._bezig = true;
      this._doel = kaart.getZoom();
      kaart._stop();
      kaart._moveStart(true, false);
      requestAnimationFrame(() => this._stap());
    }
    const doel = this._doel + L.DomEvent.getWheelDelta(e) * APP_CONFIG.scrollSnelheid;
    this._doel = Math.max(kaart.getMinZoom(), Math.min(kaart.getMaxZoom(), doel));
  },

  _stap() {
    const kaart = this._map;
    const klaar = Math.abs(this._doel - kaart.getZoom()) < 0.005;
    const zoom = klaar ? this._doel : kaart.getZoom() + (this._doel - kaart.getZoom()) * APP_CONFIG.scrollVolgen;
    // Wat nu onder de muis ligt, blijft na deze stap onder de muis liggen
    const anker = kaart.containerPointToLatLng(this._muis);
    const verschuiving = this._muis.subtract(kaart.getSize().divideBy(2));
    // De browser schaalt de bestaande tekening van de vlakken mee (licht en vloeiend);
    // aan het eind (_moveEnd) tekent Leaflet ze één keer scherp opnieuw
    kaart._move(kaart.unproject(kaart.project(anker, zoom).subtract(verschuiving), zoom), zoom);

    if (!klaar) { requestAnimationFrame(() => this._stap()); return; }
    this._bezig = false;
    kaart._moveEnd(true);
  },
});
map.addHandler('vloeiendZoomen', VloeiendZoomen);
map.vloeiendZoomen.enable();

// Vlakken ook een eind buiten beeld tekenen (standaard 10%), zodat er bij uitzoomen geen lege
// randen zijn tot het opnieuw tekenen. Geldt voor alle lagen die hierna gemaakt worden.
L.Renderer.prototype.options.padding = APP_CONFIG.tekenMarge;

window.appData = {
  map,
  dataLayer:       L.layerGroup().addTo(map),  // data-lagen los van de ondergrond
  lastFC:          null,                       // FeatureCollection van het getoonde jaar
  baseGeoLayer:    null,                       // grijze laag direct na het laden
  choroplethLayer: null,                       // gekleurde laag
  filter:          { min: 0.01 },
};

/** Netto oppervlak van een (Multi)Polygon in platte coördinaten (schoenveterformule, gaten eraf). */
function featureOppervlak(feature) {
  const ring = (r) => Math.abs(r.slice(0, -1).reduce((som, [x1, y1], i) => som + x1 * r[i + 1][1] - r[i + 1][0] * y1, 0)) / 2;
  const polygoon = ([buiten, ...gaten]) => buiten ? Math.max(ring(buiten) - gaten.reduce((s, g) => s + ring(g), 0), 0) : 0;
  const geom = feature?.geometry;
  if (geom?.type === 'Polygon')      return polygoon(geom.coordinates);
  if (geom?.type === 'MultiPolygon') return geom.coordinates.reduce((som, p) => som + polygoon(p), 0);
  return null;
}

/**
 * Leg kleine polygonen bovenop grote, zodat ze klikbaar blijven. Loopt nog een
 * keer na de volgende frame, omdat Leaflet asynchroon tekent.
 */
window.bringSmallPolygonsToFront = function (rootLayer) {
  const sorteer = () => {
    const lagen = [];
    const verzamel = (laag) => laag.eachLayer && !laag.feature
      ? laag.eachLayer(verzamel)
      : lagen.push({ laag, opp: featureOppervlak(laag.feature) });
    rootLayer?.eachLayer?.(verzamel);
    lagen.filter(l => typeof l.opp === 'number' && l.laag.bringToFront)
      .sort((a, b) => b.opp - a.opp)
      .forEach(({ laag }) => laag.bringToFront());
  };
  sorteer();
  requestAnimationFrame(sorteer);
};


// ============================================================================
// KAARTWEERGAVE — Kleurenpalet, dekking en ondergrond, getoond als voorbeelden
// ============================================================================

const paletSelect = document.getElementById('palette-select');
const dekkingSlider = document.getElementById('opacity-range');
let ondergrondLaag = null;
let huidigeOndergrond = null;

function kiesOndergrond(sleutel) {
  huidigeOndergrond = sleutel in APP_CONFIG.ondergronden ? sleutel : APP_CONFIG.standaardOndergrond;
  const { url, attributie } = APP_CONFIG.ondergronden[huidigeOndergrond];
  if (ondergrondLaag) map.removeLayer(ondergrondLaag);
  ondergrondLaag = L.tileLayer(url, { maxZoom: APP_CONFIG.maxZoom, attribution: attributie }).addTo(map);
  map.getContainer().dataset.ondergrond = huidigeOndergrond;
}

kiesOndergrond(window.leesCookie(COOKIES.ondergrond));

/** Markeer de actieve kleurstaal en ondergrond (ook als een story het palet heeft veranderd). */
function markeerActieveKeuzes() {
  const markeer = (id, actief) => document.querySelectorAll(`#${id} .keuze-knop`)
    .forEach(k => k.setAttribute('aria-checked', String(k.dataset.waarde === actief)));
  markeer('palet-keuze', paletSelect.value);
  markeer('ondergrond-keuze', huidigeOndergrond);
}

function maakKeuzeKnop(waarde, label, inhoud, kiezen) {
  const knop = maak('button', { type: 'button', className: 'keuze-knop', title: label, innerHTML: inhoud });
  knop.dataset.waarde = waarde;
  knop.setAttribute('role', 'radio');
  knop.setAttribute('aria-label', label);
  knop.addEventListener('click', () => { kiezen(waarde); markeerActieveKeuzes(); });
  return knop;
}

// Dekking "klikt vast" op 0/25/50/75/100% als je er dichtbij komt
const DEKKING_SNAPPUNTEN = [0, 0.25, 0.5, 0.75, 1];
const DEKKING_SNAP_MARGE = 0.03;

function werkDekkingBij() {
  const waarde = parseFloat(dekkingSlider.value);
  document.getElementById('opacity-display').textContent = `${Math.round(waarde * 100)}%`;
  dekkingSlider.style.setProperty('--v', String(waarde));
  document.querySelectorAll('.dekking-ticks span').forEach(el =>
    el.classList.toggle('is-actief', Math.abs(parseFloat(el.style.getPropertyValue('--f')) - waarde) < 0.001));
}

dekkingSlider.value = String(APP_CONFIG.standaardDekking);
werkDekkingBij();
dekkingSlider.addEventListener('input', () => {
  const snappunt = DEKKING_SNAPPUNTEN.find(p => Math.abs(p - dekkingSlider.value) <= DEKKING_SNAP_MARGE);
  if (snappunt !== undefined) dekkingSlider.value = String(snappunt);
  werkDekkingBij();
});
dekkingSlider.addEventListener('change', () => window.herlaadVisualisatie());
paletSelect.addEventListener('change', () => window.herlaadVisualisatie());

// Kleurstalen en ondergrond-plaatjes pas opbouwen als map.js (kleurschema's) geladen is
document.addEventListener('DOMContentLoaded', () => {
  for (const { value, textContent } of paletSelect.options) {
    const stalen = haalKleurSchema(value, 5).map(kleur => `<i style="background:${kleur}"></i>`).join('');
    document.getElementById('palet-keuze').appendChild(maakKeuzeKnop(value, textContent, `<span class="palet-staal">${stalen}</span>`, () => {
      paletSelect.value = value;
      paletSelect.dispatchEvent(new Event('change'));
    }));
  }

  const { z, x, y } = APP_CONFIG.voorbeeldTegel;
  for (const [sleutel, { naam, url }] of Object.entries(APP_CONFIG.ondergronden)) {
    const tegel = url.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y);
    document.getElementById('ondergrond-keuze').appendChild(maakKeuzeKnop(sleutel, naam,
      `<img class="ondergrond-voorbeeld is-${sleutel}" src="${tegel}" alt="" loading="lazy"><span>${naam}</span>`, () => {
        kiesOndergrond(sleutel);
        window.zetCookie(COOKIES.ondergrond, sleutel);
      }));
  }

  markeerActieveKeuzes();
});


// ============================================================================
// KAARTKNOPPEN — Tandwiel (kaartweergave) en "i" (legenda) rechtsboven op de kaart
// ============================================================================

(function () {
  const widget       = document.getElementById('legend-widget');
  const legenda      = document.getElementById('legend');
  const legendaKnop  = document.getElementById('legend-icon-toggle');
  const weergave     = document.getElementById('kaartweergave');
  const weergaveKnop = document.getElementById('kaartweergave-toggle');

  // Klikken en scrollen op knoppen en panelen mag de kaart niet bewegen
  for (const el of [widget, document.getElementById('year-filter-area')]) {
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }

  legendaKnop.addEventListener('click', () => {
    const zichtbaar = legenda.classList.toggle('is-zichtbaar');
    legendaKnop.setAttribute('aria-expanded', String(zichtbaar));
    legenda.setAttribute('aria-hidden', String(!zichtbaar));
  });

  const toonWeergave = (open) => {
    weergave.hidden = !open;
    weergaveKnop.setAttribute('aria-expanded', String(open));
    if (open) markeerActieveKeuzes();
  };
  weergaveKnop.addEventListener('click', () => toonWeergave(weergave.hidden));
  document.addEventListener('click', (e) => { if (!widget.contains(e.target)) toonWeergave(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !weergave.hidden) toonWeergave(false); });
})();


// ============================================================================
// SPLIT-SCREEN — Twee kaarten (iframes) bewegen samen via split-screen.html
// ============================================================================

const splitParams = new URLSearchParams(window.location.search);
window.isSplitScreenPane  = splitParams.get('split') === '1';
window.splitScreenPanelId = splitParams.get('panel') || splitParams.get('sidebar') || 'single';

if (window.isSplitScreenPane) {
  // Verplaatsen we de kaart zelf op verzoek van de andere kaart, dan sturen we dat niet terug
  let onderdrukVolgende = false;

  map.on('move', () => {
    if (onderdrukVolgende) { onderdrukVolgende = false; return; }
    window.parent.postMessage({
      type: 'heerlen-map-view', panelId: window.splitScreenPanelId, center: map.getCenter(), zoom: map.getZoom(),
    }, '*');
  });

  window.addEventListener('message', ({ data }) => {
    const { type, panelId, center, zoom } = data || {};
    if (type !== 'heerlen-set-map-view' || panelId !== window.splitScreenPanelId || !center || typeof zoom !== 'number') return;
    onderdrukVolgende = true;
    map.setView(center, zoom, { animate: false });
  });
}


// ============================================================================
// VISUALISATIE — Kaart opnieuw kleuren met de huidige instellingen
// ============================================================================

window.herlaadVisualisatie = function () {
  window.vernieuwVeldSelecties();  // velden zonder (gefilterde) data vallen af

  // Het kleurblokje in de kaartrij toont het palet dat nu op de kaart staat
  const stappen = haalKleurSchema(paletSelect.value, 5).map((kleur, i) => `${kleur} ${i * 20}% ${(i + 1) * 20}%`);
  document.querySelectorAll('.rij-kleuren').forEach(el => { el.style.background = `linear-gradient(to right, ${stappen.join(', ')})`; });

  const veld = window.getSelectedFields()[0];
  const fc   = window.appData.lastFC;
  if (!veld || !fc) return;

  window.toonChoropleth(fc, veld, {
    method:    document.getElementById('method-select').value || APP_CONFIG.standaardMethode,
    palette:   paletSelect.value || APP_CONFIG.standaardPalet,
    opacity:   parseFloat(dekkingSlider.value),
    classes:   APP_CONFIG.standaardAantalKlassen,
    klassenFC: window.multiLoaderState?.originalData,
  });
};


// ============================================================================
// VELDSELECTOREN — "Verken de data": de eerste rij kleurt de kaart, de overige
// rijen verschijnen in het info-venster bij een buurt
// ============================================================================

window.availableFields  = window.availableFields  || [];
window.customFieldNames = window.customFieldNames || [];

const isCustomField = (veld) => window.customFieldNames.includes(veld);

/**
 * Bruikbare velden (zonder verborgen velden): zelfgemaakte en de rest. Favorieten staan
 * daarnaast ook nog apart, dus een favoriet blijft ook op zijn eigen plek staan.
 */
window.getFieldGroupsForUi = function () {
  const velden = [...new Set(window.availableFields)].filter(v => v && !VARIABELEN_CONFIG.verborgenVelden.includes(v));
  return {
    favorites: velden.filter(v => window.favorieteVelden.has(v)),
    custom:    velden.filter(isCustomField),
    standard:  velden.filter(v => !isCustomField(v)),
  };
};

/** Numerieke velden uit de dataset worden de variabelen; daarna worden de rijen opgebouwd. */
window.populateFieldSelect = function (fc) {
  if (!fc?.features?.length) return;
  const steekproef = fc.features.slice(0, 20).map(f => f.properties || {});
  // Een veld telt als numeriek als de eerste ingevulde waarde in de steekproef een getal is
  window.availableFields = Object.keys(steekproef[0]).filter(veld => {
    const waarde = steekproef.map(p => p[veld]).find(v => v !== null && v !== undefined);
    return waarde !== undefined && !isNaN(+waarde);
  });
  window.herstelAangemaakteVariabelen?.();  // zelfgemaakte variabelen uit de cookie terugzetten
  window.initFieldSelectors(window.availableFields);
};

const categorieVanVeld = (veld) =>
  VARIABELEN_CONFIG.categorieen.find(([, regel]) => regel.test(veld))?.[0] ?? VARIABELEN_CONFIG.overigeCategorie;

/** Bruikbare velden per categorie: favorieten en zelfgemaakte eerst, daarna de thema's in vaste volgorde. */
function veldCategorieen() {
  const { favorites, custom, standard } = window.getFieldGroupsForUi();
  const themas = new Map([...VARIABELEN_CONFIG.categorieen, [VARIABELEN_CONFIG.overigeCategorie]].map(([naam]) => [naam, []]));
  standard.forEach(v => themas.get(categorieVanVeld(v)).push(v));
  return [['Favorieten', favorites], ['Zelfgemaakt', custom], ...themas]
    .map(([naam, velden]) => ({ naam, velden: velden.filter(veldHeeftBeschikbareData) }))
    .filter(c => c.velden.length);
}

window.getSelectedFields = () =>
  [...document.querySelectorAll('#selectors-div select.field-select-item')].map(s => s.value).filter(Boolean);

/**
 * Een veld is selecteerbaar als het (over álle jaren) minstens één waarde heeft
 * die door het actieve filter komt. Zo verdwijnt een veld niet tijdens het
 * afspelen van de tijdlijn als het in één jaar ontbreekt.
 */
function veldHeeftBeschikbareData(veld) {
  const fc = window.multiLoaderState?.originalData || window.appData.lastFC;
  if (!fc || !window.haalNumeriekeWaarden) return true;
  const waarden = window.haalNumeriekeWaarden(fc, veld);
  const filter = window.appData.filter;
  return filter ? waarden.some(w => window.waardePasseertFilter(w, waarden, filter)) : waarden.length > 0;
}

/**
 * (Her)vul de verborgen <select> van een rij. Een veld dat niet meer bruikbaar is, valt
 * terug op leeg — behalve in de kaartrij: de kaart toont altijd iets.
 */
function vulVeldSelect(sel, gewenst = sel.value, categorieen = veldCategorieen()) {
  const velden = [...new Set(categorieen.flatMap(c => c.velden))];
  const isKaartRij = sel.closest('.field-row') === document.querySelector('#selectors-div .field-row');
  const terugval = isKaartRij ? (velden.includes(APP_CONFIG.standaardVeld1) ? APP_CONFIG.standaardVeld1 : velden[0] ?? '') : '';
  sel.replaceChildren(new Option('', ''), ...velden.map(v => new Option(window.mooieVeldnaam(v), v)));
  sel.value = velden.includes(gewenst) ? gewenst : terugval;
  vernieuwVeldPickerInhoud(sel, categorieen);
}

/** De eerste rij is de kaartvariabele, de rest hoort bij het info-venster. */
function werkRijRollenBij() {
  document.querySelectorAll('#selectors-div .field-row').forEach((rij, i) => {
    const rol = i === 0 ? 'kaart' : 'info';
    if (rij.dataset.rol === rol) return;
    rij.dataset.rol = rol;
    Object.assign(rij.querySelector('.rij-icoon'), {
      innerHTML: ICONEN[rol], title: rol === 'kaart' ? 'Kleurt de kaart' : 'Zichtbaar in het info-venster',
    });
  });
}

window.addFieldSelector = function (standaardWaarde) {
  const container = document.getElementById('field-select');
  const rijen = document.getElementById('selectors-div') || container.appendChild(maak('div', { id: 'selectors-div' }));

  const rij = maak('div', { className: 'field-row' });
  const icoon = maak('span', { className: 'rij-icoon' });
  icoon.setAttribute('aria-hidden', 'true');
  const sel = maak('select', { className: 'field-select-item', hidden: true });
  const verwijder = maak('button', { type: 'button', className: 'rij-verwijder', innerHTML: ICONEN.prullenbak, title: 'Verwijderen' });
  verwijder.setAttribute('aria-label', 'Variabele verwijderen');
  verwijder.addEventListener('click', () => { rij.remove(); werkRijRollenBij(); window.herlaadVisualisatie(); });

  // Alleen zichtbaar in de kaartrij: de kleuren op de kaart; een klik opent de kaartweergave
  const kleuren = maak('button', { type: 'button', className: 'rij-kleuren', title: 'Kleuren op de kaart aanpassen' });
  kleuren.setAttribute('aria-label', 'Kleuren op de kaart aanpassen');
  kleuren.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('kaartweergave-toggle').click(); });

  rij.append(icoon, sel, maakVeldPicker(sel), verwijder, kleuren);
  rijen.appendChild(rij);
  vulVeldSelect(sel, standaardWaarde);
  werkRijRollenBij();
  return sel;
};

/** Werk alle rijen bij na een wijziging in data, filter of favorieten. */
window.vernieuwVeldSelecties = function () {
  const categorieen = veldCategorieen();
  document.querySelectorAll('#selectors-div select.field-select-item').forEach(sel => vulVeldSelect(sel, sel.value, categorieen));
};

/** Bouw de rijen op na het laden van een dataset: één kaart- en één info-variabele. */
window.initFieldSelectors = function (velden) {
  window.availableFields = velden || [];
  const container = document.getElementById('field-select');
  const toevoegen = document.getElementById('add-variable');
  toevoegen.disabled = !window.availableFields.length;

  if (!window.availableFields.length) {
    container.innerHTML = '<div class="hint">Laad eerst een dataset om variabelen te kunnen kiezen.</div>';
    return;
  }

  container.innerHTML = '';
  const indienBruikbaar = (veld) => window.availableFields.includes(veld) && veldHeeftBeschikbareData(veld) ? veld : undefined;
  window.addFieldSelector(indienBruikbaar(APP_CONFIG.standaardVeld1));
  window.addFieldSelector(indienBruikbaar(APP_CONFIG.standaardVeld2));
  window.refreshEquationFieldOptions?.();
  window.herlaadVisualisatie();
};

document.getElementById('add-variable').addEventListener('click', () => {
  window.addFieldSelector();
  document.querySelector('#selectors-div .field-row:last-child .veld-picker-trigger').click();
});


// ============================================================================
// VELD-PICKER — Keuzemenu met zoekbalk en categorieën (één niveau diep).
// Stuurt de verborgen <select> van de rij aan.
// ============================================================================

function maakVeldPicker(sel) {
  const trigger = maak('button', { type: 'button', className: 'veld-picker-trigger' });
  const zoek = maak('input', { type: 'search', className: 'veld-picker-zoek', placeholder: 'Zoek een variabele…' });
  zoek.setAttribute('aria-label', 'Zoek een variabele');
  const lijst = maak('div', { className: 'veld-picker-lijst' });
  const menu = maak('div', { className: 'veld-picker-menu', hidden: true });
  menu.append(zoek, lijst);
  sel._picker = { trigger, zoek, lijst, categorie: null };

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

  const wrap = maak('div', { className: 'veld-picker' });
  wrap.append(trigger, menu);
  return wrap;
}

function sluitVeldPickers() {
  document.querySelectorAll('.veld-picker-menu').forEach(m => { m.hidden = true; });
}

document.addEventListener('click', (e) => { if (!e.target.closest('.veld-picker')) sluitVeldPickers(); });

/** Trigger-tekst en lijst: zoekresultaten, één categorie, of het overzicht van categorieën. */
function vernieuwVeldPickerInhoud(sel, categorieen = veldCategorieen()) {
  const picker = sel._picker;
  if (!picker) return;
  const { trigger, zoek, lijst } = picker;
  trigger.textContent = sel.value ? window.mooieVeldnaam(sel.value) : 'Kies een variabele';
  trigger.classList.toggle('is-leeg', !sel.value);

  const term = zoek.value.trim().toLowerCase();
  const leeg = (tekst) => maak('div', { className: 'veld-picker-leeg', textContent: tekst });
  const naarCategorie = (naam) => (e) => { e.stopPropagation(); picker.categorie = naam; vernieuwVeldPickerInhoud(sel); };

  if (term) {
    const treffers = [...new Set(categorieen.flatMap(c => c.velden))].filter(v => window.mooieVeldnaam(v).toLowerCase().includes(term));
    lijst.replaceChildren(...treffers.map(v => maakVeldItem(sel, v, categorieVanVeld(v))));
    if (!treffers.length) lijst.append(leeg('Geen variabelen gevonden.'));
    return;
  }

  const open = categorieen.find(c => c.naam === picker.categorie);
  if (open) {
    const terug = maak('button', { type: 'button', className: 'veld-picker-terug', innerHTML: '<span aria-hidden="true">‹</span> ' });
    terug.append(open.naam);
    terug.addEventListener('click', naarCategorie(null));
    lijst.replaceChildren(terug, ...open.velden.map(v => maakVeldItem(sel, v)));
    return;
  }

  lijst.replaceChildren(...categorieen.map(({ naam, velden }) => {
    const knop = maak('button', {
      type: 'button', className: 'veld-picker-categorie',
      innerHTML: `<span class="veld-picker-naam">${naam}</span><span class="veld-picker-aantal">${velden.length}</span><span aria-hidden="true">›</span>`,
    });
    knop.addEventListener('click', naarCategorie(naam));
    return knop;
  }));
  if (!categorieen.length) lijst.append(leeg('Geen variabelen beschikbaar.'));
}

window.vernieuwVeldPickerInhoud = vernieuwVeldPickerInhoud;

/** Eén variabele in het menu: ster (favoriet), naam en — bij zelfgemaakte — een prullenbak. */
function maakVeldItem(sel, veld, categorieLabel) {
  const naam = window.mooieVeldnaam(veld);
  const isFavoriet = window.favorieteVelden.has(veld);
  const item = maak('div', { className: 'veld-picker-item' });

  const ster = maak('button', {
    type: 'button', className: 'veld-ster', textContent: isFavoriet ? '★' : '☆',
    title: isFavoriet ? 'Verwijderen uit favorieten' : 'Toevoegen aan favorieten',
  });
  ster.classList.toggle('is-actief', isFavoriet);
  ster.addEventListener('click', (e) => { e.stopPropagation(); window.toggleFavorietVeld(veld); });

  const kies = maak('button', { type: 'button', className: 'veld-picker-naam', textContent: naam, title: naam });
  if (categorieLabel) kies.append(maak('small', { textContent: categorieLabel }));
  kies.addEventListener('click', () => { sel.value = veld; sluitVeldPickers(); window.herlaadVisualisatie(); });

  item.append(ster, kies);

  if (isCustomField(veld)) {
    const prullenbak = maak('button', {
      type: 'button', className: 'veld-verwijder', innerHTML: ICONEN.prullenbak, title: 'Deze zelfgemaakte variabele verwijderen',
    });
    prullenbak.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Weet je zeker dat je de variabele "${naam}" wilt verwijderen?`)) window.verwijderAangemaakteVariabele?.(veld);
    });
    item.append(prullenbak);
  }
  return item;
}


// ============================================================================
// FILTER — Min/max en percentielen (paneel staat standaard verborgen)
// ============================================================================

const FILTER_VELDEN = { min: 'filter-min', max: 'filter-max', lowPct: 'filter-lowpct', highPct: 'filter-highpct' };

document.getElementById('apply-filter').addEventListener('click', () => {
  window.appData.filter = Object.fromEntries(Object.entries(FILTER_VELDEN).map(([sleutel, id]) => {
    const waarde = document.getElementById(id).value;
    return [sleutel, waarde ? parseFloat(waarde) : null];
  }));
  window.herlaadVisualisatie();
});

document.getElementById('clear-filter').addEventListener('click', () => {
  window.appData.filter = null;
  Object.values(FILTER_VELDEN).forEach(id => { document.getElementById(id).value = ''; });
  window.herlaadVisualisatie();
});

// Snelknop: minimum op 1 verbergt negatieve en nulwaarden
document.getElementById('filter-negative').addEventListener('click', () => {
  document.getElementById('filter-min').value = '1';
  window.appData.filter = { ...window.appData.filter, min: 1 };
  window.herlaadVisualisatie();
});


// ============================================================================
// BESTANDIMPORT — Eén bestand via importer.js (paneel staat standaard verborgen)
// ============================================================================

document.getElementById('file-input').addEventListener('change', (e) => {
  const bestand = e.target.files[0];
  if (bestand) window.handleImportFile(bestand, window.appData);
});


// ============================================================================
// ZIJBALK — In-/uitklappen, inklapbare vakken en knoppen
// ============================================================================

(function () {
  const app  = document.getElementById('app');
  const knop = document.getElementById('sidebar-toggle');
  knop.innerHTML = document.documentElement.classList.contains('sidebar-left') ? '&#8249;' : '&#8250;';

  knop.addEventListener('click', () => {
    knop.innerHTML = app.classList.toggle('sidebar-collapsed') ? '&#8250;' : '&#8249;';
    setTimeout(() => map.invalidateSize(), 310);  // na de CSS-overgang
  });
})();

// Klik op de kop van een vak (Stories, Meer, Databronnen, …) klapt het in of uit
document.getElementById('sidebar').addEventListener('click', (e) => {
  const kop = e.target.closest('.kaart-paneel > h3');
  if (kop && !e.target.closest('button, input, select, a')) kop.parentElement.classList.toggle('is-ingeklapt');
});

document.getElementById('verken-info-toggle').addEventListener('click', (e) => {
  const info = document.getElementById('verken-info');
  info.hidden = !info.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!info.hidden));
});

document.getElementById('open-split-screen').addEventListener('click', () => { window.location.href = 'split-screen.html'; });
document.getElementById('open-3d').addEventListener('click', () => { window.location.href = 'huisjes-3d.html'; });
