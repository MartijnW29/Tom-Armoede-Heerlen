// ============================================================================
// INTRO-VERHAAL.JS — Heerlen Opportunity Atlas
// Introductie "De armoedegrens trekken": vijf stappen die op de kaart zelf
// laten zien dat wat je ziet afhangt van waar je de grens trekt.
//
//   Stap 1  Waar trek je de armoedegrens?     (kale kaart + gemeentegrens)
//   Stap 2  Eén lijn door Heerlen              (spoorlijn → Noord vs Zuid)
//   Stap 3  Dezelfde stad, andere grenzen      (zelfde indicator per buurt)
//   Stap 4  Wat telt als armoede?              (drempel-schuif met definities)
//   Stap 5  Welke kaart is de armoedekaart?    (kaarten naast elkaar)
//
// Het verhaal start bij het eerste bezoek (na de cookiemelding), kan altijd
// worden overgeslagen en is opnieuw te starten via de "?"-knop op de kaart.
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE — Pas hier de indicatoren, definities en teksten aan
  // ==========================================================================

  const INTRO_CONFIG = {
    // --- Data ---
    voorkeursJaar: 2024,                                   // Jaar uit het script (Kerncijfers wijken en buurten 2024)
    indicator:     'percentage_personen_met_laag_inkomen', // Stap 2 en 3: 40% personen met laagste inkomen
    inwonersVeld:  'aantal_inwoners',                      // Weging bij optellen naar Noord/Zuid
    spoorlijnUrl:  'data/spoorlijn-noord-zuid.geojson',
    gemeenteUrl:   'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/gemeenten/items?gemeentecode=GM0917&f=json',
    maxWachtOpDataMs: 90000,

    // --- Kleuren (de grens is overal dezelfde rode stippellijn) ---
    grensKleur:  '#d62839',
    geenData:    '#d9d9d9',
    kleurVan:    0.06,   // Deel van d3.interpolateOrRd dat gebruikt wordt (licht → donker)
    kleurTot:    0.92,

    // --- Opslag ---
    gezienSleutel: 'atlas_intro_gezien',
    cookieKeuze:   'atlas_cookie_keuze',

    // --- Stap 4 en 5: definities van armoede ---
    // type 'drempel':    een buurt telt als arm als het (berekende) bedrag onder de drempel ligt
    // type 'percentage': de waarde is al het aandeel arme inwoners/huishoudens;
    //                    het eerste veld in `velden` dat data heeft wordt gebruikt
    definities: [
      {
        id:     'mondiaal',
        label:  'Mondiale armoedegrens',
        kort:   'minder dan $1,90 per dag',
        uitleg: 'Arm is wie van minder dan $1,90 (ongeveer € 1,75) per dag rondkomt. Berekend als gemiddeld inkomen per inwoner ÷ 365.',
        type:   'drempel',
        veld:   'gemiddeld_inkomen_per_inwoner',       // CBS: × € 1.000 per jaar
        bedragPerDag: v => (v * 1000) / 365,
        drempel: 1.75,
      },
      {
        id:     'nationaal',
        label:  'Nationale armoedegrens',
        kort:   'rond het sociaal minimum',
        uitleg: 'Het aandeel huishoudens met een inkomen onder of rond het sociaal minimum.',
        type:   'percentage',
        velden: [
          'percentage_personen_in_armoede',
          'percentage_huishoudens_onder_of_rond_sociaal_minimum',
          'huishoudens_tot_110_percent_van_sociaal_minimum',
          'huishoudens_tot_120_percent_van_sociaal_minimum',
        ],
      },
      {
        id:     'laag-inkomen',
        label:  'Laag-inkomensmaatstaf',
        kort:   '40% laagste inkomens van Nederland',
        uitleg: 'Het aandeel huishoudens dat tot de 40% laagste inkomens van Nederland hoort.',
        type:   'percentage',
        velden: ['percentage_huishoudens_met_laag_inkomen', 'percentage_personen_met_laag_inkomen'],
      },
    ],
  };

  const AANTAL_STAPPEN = 5;
  const STAP_TITELS = ['De vraag', 'Eén lijn', 'Buurten', 'Definitie', 'Vergelijk'];

  // ==========================================================================
  // STATE
  // ==========================================================================

  const state = {
    actief:        false,
    stap:          1,
    maxBereikt:    1,
    definitie:     0,
    bekekenDefs:   new Set(),
    data:          null,   // { jaar, buurten: [...features], alleJaren: [...features] }
    spoorlijn:     null,   // GeoJSON FeatureCollection
    gemeente:      null,   // GeoJSON FeatureCollection
    lagen:         {},
    el:            {},
    vorigeView:    null,
  };

  const vermindertBeweging = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duur = (ms) => (vermindertBeweging() ? 0 : ms);

  // ==========================================================================
  // HULPFUNCTIES — Getallen en opmaak
  // ==========================================================================

  /** Geldige numerieke waarde (CBS/PDOK gebruiken negatieve codes voor "geheim/onbekend"). */
  function getal(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = +v;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const fmtPct  = (v) => (v == null ? 'geen data' : `${v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`);
  const fmtEuro = (v) => (v == null ? 'geen data' : `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function jaarVan(f) {
    if (typeof window.getYearFromFeature === 'function') return window.getYearFromFeature(f);
    const j = parseInt(f?.properties?.jaar, 10);
    return Number.isFinite(j) ? j : null;
  }

  const isBuurt = (f) => Boolean(f?.properties?.buurtcode) && /^BU/i.test(String(f.properties.buurtcode));
  const buurtNaam = (f) => f?.properties?.buurtnaam || f?.properties?.naam || f?.properties?.buurtcode || 'Buurt';

  /** Kleurschaal met een VAST domein (hele dataset, alle jaren), zodat rood altijd hetzelfde betekent. */
  function maakSchaal(min, max) {
    const interp = (t) => d3.interpolateOrRd(INTRO_CONFIG.kleurVan + t * (INTRO_CONFIG.kleurTot - INTRO_CONFIG.kleurVan));
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
    const schaal = d3.scaleSequential(interp).domain([lo, hi]).clamp(true);
    return (v) => (v == null ? INTRO_CONFIG.geenData : schaal(v));
  }

  // ==========================================================================
  // GEOMETRIE — Zwaartepunt en zijde van de spoorlijn
  // ==========================================================================

  function buitenringen(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates[0]];
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p[0]);
    return [];
  }

  /** Oppervlakte-gewogen zwaartepunt (lon/lat) van een (Multi)Polygon. */
  function zwaartepunt(feature) {
    let A = 0, cx = 0, cy = 0;
    for (const ring of buitenringen(feature.geometry)) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const k = x1 * y2 - x2 * y1;
        A += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
      }
    }
    if (Math.abs(A) < 1e-12) {
      const ring = buitenringen(feature.geometry)[0] || [[0, 0]];
      const n = ring.length;
      return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
    }
    return [cx / (3 * A), cy / (3 * A)];
  }

  /** Alle lijnsegmenten van de spoorlijn als [[lon,lat],[lon,lat]]. */
  function spoorSegmenten() {
    const segs = [];
    for (const f of state.spoorlijn?.features || []) {
      const g = f.geometry;
      const lijnen = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
      for (const l of lijnen) for (let i = 0; i < l.length - 1; i++) segs.push([l[i], l[i + 1]]);
    }
    return segs;
  }

  /**
   * Ligt een punt ten noorden van de spoorlijn? Kijkt naar het dichtstbijzijnde
   * segment (west→oost gericht) en bepaalt aan welke kant het punt ligt. Voorbij
   * de uiteinden van de lijn wordt het laatste segment doorgetrokken.
   */
  function ligtNoordelijk(punt, segs) {
    const kx = Math.cos((punt[1] * Math.PI) / 180);  // lengtegraden korter maken op deze breedte
    let beste = null, besteAfstand = Infinity;
    for (let [a, b] of segs) {
      if (b[0] < a[0]) [a, b] = [b, a];
      const ax = a[0] * kx, ay = a[1], bx = b[0] * kx, by = b[1], px = punt[0] * kx, py = punt[1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const afst = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
      if (afst < besteAfstand) { besteAfstand = afst; beste = { ax, ay, dx, dy, px, py }; }
    }
    if (!beste) return true;
    return beste.dx * (beste.py - beste.ay) - beste.dy * (beste.px - beste.ax) > 0;
  }

  // ==========================================================================
  // DATA — Wachten op de atlas-data en kiezen van het jaar
  // ==========================================================================

  function alleBuurtFeatures() {
    const fc = window.multiLoaderState?.originalData || window.appData?.lastFC;
    return (fc?.features || []).filter(isBuurt);
  }

  function wachtOpData() {
    return new Promise((resolve) => {
      const start = Date.now();
      (function probeer() {
        const buurten = alleBuurtFeatures();
        if (buurten.length) return resolve(buurten);
        if (Date.now() - start > INTRO_CONFIG.maxWachtOpDataMs) return resolve([]);
        setTimeout(probeer, 300);
      })();
    });
  }

  /** Het voorkeursjaar als daar data voor de indicator is, anders het meest recente jaar mét data. */
  function kiesJaar(features, veld) {
    const jarenMetData = new Set(features.filter(f => getal(f.properties?.[veld]) != null).map(jaarVan).filter(Number.isFinite));
    if (jarenMetData.has(INTRO_CONFIG.voorkeursJaar)) return INTRO_CONFIG.voorkeursJaar;
    const jaren = [...jarenMetData].sort((a, b) => b - a);
    return jaren[0] ?? INTRO_CONFIG.voorkeursJaar;
  }

  async function laadData() {
    const alle = await wachtOpData();
    const jaar = kiesJaar(alle, INTRO_CONFIG.indicator);
    let buurten = alle.filter(f => jaarVan(f) === jaar);
    if (!buurten.length) buurten = alle.filter(f => jaarVan(f) == null);
    state.data = { jaar, buurten, alleJaren: alle };
    return state.data;
  }

  async function laadSpoorlijn() {
    if (state.spoorlijn) return state.spoorlijn;
    try {
      const r = await fetch(INTRO_CONFIG.spoorlijnUrl, { cache: 'no-cache' });
      if (r.ok) state.spoorlijn = await r.json();
    } catch (e) { console.warn('Spoorlijn laden mislukt:', e); }
    return state.spoorlijn;
  }

  async function laadGemeentegrens() {
    if (state.gemeente) return state.gemeente;
    try {
      const r = await fetch(INTRO_CONFIG.gemeenteUrl);
      if (r.ok) {
        const json = await r.json();
        const features = json.features || json.items || [];
        if (features.length) state.gemeente = { type: 'FeatureCollection', features };
      }
    } catch (e) { console.warn('Gemeentegrens laden mislukt:', e); }
    return state.gemeente;
  }

  /** Vast domein [min, max] van een veld over alle buurten en alle jaren. */
  function domeinOverAlleJaren(veld) {
    const waarden = (state.data?.alleJaren || []).map(f => getal(f.properties?.[veld])).filter(v => v != null);
    if (!waarden.length) return [0, 100];
    return d3.extent(waarden);
  }

  /** Waarde van een buurt volgens een definitie (aandeel arm in %), of null. */
  function definitieVeld(def, features) {
    if (def.type === 'drempel') return def.veld;
    const bron = features || state.data?.buurten || [];
    return def.velden.find(v => bron.some(f => getal(f.properties?.[v]) != null)) || def.velden[0];
  }

  function definitieWaarde(def, feature) {
    const p = feature.properties || {};
    if (def.type === 'drempel') {
      const v = getal(p[def.veld]);
      if (v == null) return null;
      return def.bedragPerDag(v) < def.drempel ? 100 : 0;
    }
    return getal(p[definitieVeld(def)]);
  }

  /** Eén gedeelde vaste schaal voor alle definities (stap 4 en 5), over alle jaren. */
  function definitieDomein() {
    let max = 0;
    for (const def of INTRO_CONFIG.definities) {
      if (def.type !== 'percentage') continue;
      const [, hi] = domeinOverAlleJaren(definitieVeld(def, state.data?.alleJaren));
      if (Number.isFinite(hi)) max = Math.max(max, hi);
    }
    return [0, max || 100];
  }

  /** Noord- en zuidgemiddelde van de indicator, gewogen naar aantal inwoners. */
  function noordZuidWaarden() {
    const segs = spoorSegmenten();
    const groepen = { noord: { som: 0, gewicht: 0, punten: [] }, zuid: { som: 0, gewicht: 0, punten: [] } };
    for (const f of state.data.buurten) {
      const zijde = segs.length && ligtNoordelijk(zwaartepunt(f), segs) ? 'noord' : 'zuid';
      f.__zijde = zijde;
      groepen[zijde].punten.push(zwaartepunt(f));
      const v = getal(f.properties?.[INTRO_CONFIG.indicator]);
      if (v == null) continue;
      const w = getal(f.properties?.[INTRO_CONFIG.inwonersVeld]) || 1;
      groepen[zijde].som += v * w;
      groepen[zijde].gewicht += w;
    }
    const uit = {};
    for (const [zijde, g] of Object.entries(groepen)) {
      uit[zijde] = {
        waarde: g.gewicht ? g.som / g.gewicht : null,
        punt: g.punten.length ? [d3.mean(g.punten, p => p[1]), d3.mean(g.punten, p => p[0])] : null,
      };
    }
    return uit;
  }

  // ==========================================================================
  // KAARTLAGEN
  // ==========================================================================

  function kaart() { return window.appData?.map; }

  function zorgVoorPanes(m) {
    [['introVlakPane', 455], ['introGrensPane', 470], ['introLijnPane', 480], ['introLabelPane', 650]].forEach(([naam, z]) => {
      if (!m.getPane(naam)) m.createPane(naam);
      m.getPane(naam).style.zIndex = z;
    });
    m.getPane('introLabelPane').style.pointerEvents = 'none';
  }

  function bouwLagen() {
    const m = kaart();
    if (!m) return;
    zorgVoorPanes(m);
    state.lagen.groep = state.lagen.groep || L.layerGroup().addTo(m);
    if (!m.hasLayer(state.lagen.groep)) state.lagen.groep.addTo(m);
  }

  function tekenGemeentegrens() {
    const m = kaart();
    if (!m || state.lagen.gemeente) return;
    const bron = state.gemeente
      || (state.data?.buurten?.length ? { type: 'FeatureCollection', features: state.data.buurten } : null);
    if (!bron) return;
    state.lagen.gemeente = L.geoJSON(bron, {
      pane: 'introGrensPane',
      interactive: false,
      style: { color: '#1f2d3d', weight: state.gemeente ? 2.5 : 0.8, opacity: 0.9, fill: false },
    }).addTo(state.lagen.groep);
  }

  function fitOpGemeente() {
    const m = kaart();
    const laag = state.lagen.gemeente || state.lagen.vlakken;
    if (!m || !laag) return;
    const b = laag.getBounds();
    if (!b.isValid()) return;
    const kaartje = state.el.kaartje?.getBoundingClientRect();
    const opties = { animate: !vermindertBeweging(), duration: 0.8 };
    if (kaartje && window.innerWidth > 700) {
      opties.paddingTopLeft = L.point(kaartje.right + 16, 24);
      opties.paddingBottomRight = L.point(24, 24);
    } else if (kaartje) {
      opties.paddingTopLeft = L.point(16, 16);
      opties.paddingBottomRight = L.point(16, kaartje.height + 16);
    }
    m.flyToBounds(b, opties);
  }

  function tekenVlakken() {
    if (state.lagen.vlakken || !state.data?.buurten?.length) return;
    state.lagen.vlakken = L.geoJSON({ type: 'FeatureCollection', features: state.data.buurten }, {
      pane: 'introVlakPane',
      style: { color: '#ffffff', weight: 0, opacity: 0, fillColor: INTRO_CONFIG.geenData, fillOpacity: 0 },
      onEachFeature: (feature, laag) => {
        laag.bindTooltip(() => tooltipTekst(feature), { sticky: true, className: 'intro-tooltip', direction: 'top', offset: [0, -8] });
      },
    }).addTo(state.lagen.groep);
  }

  function tooltipTekst(feature) {
    const naam = `<strong>${escapeHtml(buurtNaam(feature))}</strong>`;
    if (state.stap === 2) {
      const zijde = feature.__zijde === 'noord' ? 'Noord' : 'Zuid';
      return `${naam}<br>Hoort bij Heerlen ${zijde}`;
    }
    if (state.stap === 3) return `${naam}<br>${fmtPct(getal(feature.properties?.[INTRO_CONFIG.indicator]))} lage inkomens`;
    if (state.stap === 4) {
      const def = INTRO_CONFIG.definities[state.definitie];
      if (def.type === 'drempel') {
        const v = getal(feature.properties?.[def.veld]);
        return `${naam}<br>Gemiddeld ${fmtEuro(v == null ? null : def.bedragPerDag(v))} per inwoner per dag`;
      }
      return `${naam}<br>${fmtPct(definitieWaarde(def, feature))} arm volgens deze definitie`;
    }
    return naam;
  }

  /** Zet de stijl van alle buurtvlakken, met een vloeiende overgang via d3. */
  function stijlVlakken(stijlVoor, ms = 900) {
    const laag = state.lagen.vlakken;
    if (!laag) return;
    laag.eachLayer((l) => {
      const s = stijlVoor(l.feature);
      Object.assign(l.options, s);
      const pad = l._path;
      if (!pad) return;
      const sel = d3.select(pad).interrupt();
      const t = sel.transition().duration(duur(ms)).ease(d3.easeCubicInOut);
      if (s.fillColor !== undefined)   t.attr('fill', s.fillColor);
      if (s.fillOpacity !== undefined) t.attr('fill-opacity', s.fillOpacity);
      if (s.color !== undefined)       t.attr('stroke', s.color);
      if (s.weight !== undefined)      t.attr('stroke-width', s.weight);
      if (s.opacity !== undefined)     t.attr('stroke-opacity', s.opacity);
    });
  }

  function tekenSpoorlijn() {
    if (!state.spoorlijn?.features?.length) return;
    if (!state.lagen.spoor) {
      state.lagen.spoor = L.geoJSON(state.spoorlijn, {
        pane: 'introLijnPane',
        interactive: false,
        style: { color: INTRO_CONFIG.grensKleur, weight: 4, opacity: 1, lineCap: 'round', className: 'intro-spoor' },
      }).addTo(state.lagen.groep);
      animeerLijn(state.lagen.spoor);
    } else if (!state.lagen.groep.hasLayer(state.lagen.spoor)) {
      state.lagen.spoor.addTo(state.lagen.groep);
      animeerLijn(state.lagen.spoor);
    }
  }

  /** "Trek" de lijn: eerst als doorgetrokken streep tekenen, daarna overgaan in de rode stippellijn. */
  function animeerLijn(laag) {
    laag.eachLayer((l) => {
      const pad = l._path;
      if (!pad || typeof pad.getTotalLength !== 'function') return;
      const lengte = pad.getTotalLength();
      if (!lengte || vermindertBeweging()) { pad.style.strokeDasharray = '10 8'; return; }
      pad.style.transition = 'none';
      pad.style.strokeDasharray = `${lengte} ${lengte}`;
      pad.style.strokeDashoffset = String(lengte);
      pad.getBoundingClientRect();
      pad.style.transition = 'stroke-dashoffset 1.6s ease-in-out';
      pad.style.strokeDashoffset = '0';
      setTimeout(() => {
        pad.style.transition = 'none';
        pad.style.strokeDasharray = '10 8';
        pad.style.strokeDashoffset = '0';
      }, 1650);
    });
  }

  function zetSpoorZichtbaarheid(opaciteit) {
    state.lagen.spoor?.eachLayer((l) => {
      if (l._path) d3.select(l._path).transition().duration(duur(600)).attr('stroke-opacity', opaciteit);
      l.options.opacity = opaciteit;
    });
  }

  function toonLabels(noordZuid) {
    verwijderLabels();
    const maak = (zijde, titel) => {
      const info = noordZuid[zijde];
      if (!info?.punt) return null;
      const html = `<div class="intro-label"><span class="intro-label-naam">${titel}</span><span class="intro-label-waarde">${fmtPct(info.waarde)}</span></div>`;
      return L.marker(info.punt, {
        pane: 'introLabelPane', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'intro-label-icoon', html, iconSize: null }),
      }).addTo(state.lagen.groep);
    };
    state.lagen.labels = [maak('noord', 'NOORD'), maak('zuid', 'ZUID')].filter(Boolean);
  }

  function verwijderLabels() {
    (state.lagen.labels || []).forEach(l => state.lagen.groep?.removeLayer(l));
    state.lagen.labels = [];
  }

  function ruimLagenOp() {
    const m = kaart();
    if (state.lagen.groep && m) m.removeLayer(state.lagen.groep);
    state.lagen = {};
  }

  // ==========================================================================
  // GRENS-SCHUIF — De rode stippellijn als schuifknop (voortgang én drempel)
  // ==========================================================================

  /**
   * Maakt een schuifbalk waarvan de knop de "grens" zelf is: een rode
   * stippellijn die je kunt verslepen. Klikken op een streepje of de
   * pijltjestoetsen werkt ook. `opties.magNaar(i)` bepaalt welke stops bereikbaar zijn.
   */
  function maakGrensSchuif({ labels, waarde, onKies, magNaar = () => true, ariaLabel, klein = false }) {
    const wrap = document.createElement('div');
    wrap.className = `grens-schuif${klein ? ' grens-schuif-klein' : ''}`;
    wrap.innerHTML = `
      <div class="grens-schuif-baan" role="slider" tabindex="0" aria-label="${escapeHtml(ariaLabel)}"
           aria-valuemin="1" aria-valuemax="${labels.length}">
        <div class="grens-schuif-lijn"></div>
        ${labels.map((_, i) => `<span class="grens-schuif-stop" data-i="${i}" style="left:${labels.length === 1 ? 50 : (i / (labels.length - 1)) * 100}%"></span>`).join('')}
        <div class="grens-schuif-knop" aria-hidden="true"><span class="grens-schuif-streep"></span></div>
      </div>
      <div class="grens-schuif-labels">
        ${labels.map((l, i) => `<button type="button" class="grens-schuif-label" data-i="${i}">${escapeHtml(l)}</button>`).join('')}
      </div>`;

    const baan = wrap.querySelector('.grens-schuif-baan');
    const knop = wrap.querySelector('.grens-schuif-knop');
    const n = labels.length;
    const posVan = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
    let huidig = waarde;

    function zet(i, animeren = true) {
      huidig = i;
      knop.style.transition = animeren && !vermindertBeweging() ? 'left .35s cubic-bezier(.3,.7,.3,1)' : 'none';
      knop.style.left = `${posVan(i)}%`;
      baan.setAttribute('aria-valuenow', String(i + 1));
      baan.setAttribute('aria-valuetext', labels[i]);
      wrap.querySelectorAll('[data-i]').forEach(el => {
        const j = +el.dataset.i;
        el.classList.toggle('is-actief', j === i);
        el.classList.toggle('is-voorbij', j < i);
        el.classList.toggle('is-geblokkeerd', !magNaar(j));
      });
    }

    function kies(i) {
      const doel = Math.max(0, Math.min(n - 1, i));
      if (!magNaar(doel)) { zet(huidig); return; }
      zet(doel);
      if (doel !== waarde) onKies(doel);
    }

    // Slepen met muis/vinger — de grens volgt de wijzer en klikt vast op de dichtstbijzijnde stop
    let sleept = false;
    const indexBijX = (x) => {
      const r = baan.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
      return Math.round(f * (n - 1));
    };
    baan.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      sleept = true;
      baan.setPointerCapture?.(e.pointerId);
      knop.style.transition = 'none';
      wrap.classList.add('is-slepend');
      const r = baan.getBoundingClientRect();
      knop.style.left = `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`;
      e.preventDefault();
    });
    baan.addEventListener('pointermove', (e) => {
      if (!sleept) return;
      const r = baan.getBoundingClientRect();
      knop.style.left = `${Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))}%`;
    });
    const stopSlepen = (e) => {
      if (!sleept) return;
      sleept = false;
      wrap.classList.remove('is-slepend');
      kies(indexBijX(e.clientX));
    };
    baan.addEventListener('pointerup', stopSlepen);
    baan.addEventListener('pointercancel', () => { sleept = false; wrap.classList.remove('is-slepend'); zet(huidig); });

    wrap.querySelectorAll('.grens-schuif-label').forEach(btn => btn.addEventListener('click', () => kies(+btn.dataset.i)));
    baan.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { kies(huidig + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { kies(huidig - 1); e.preventDefault(); }
      if (e.key === 'Home') { kies(0); e.preventDefault(); }
      if (e.key === 'End')  { kies(n - 1); e.preventDefault(); }
    });

    zet(waarde, false);
    return wrap;
  }

  // ==========================================================================
  // DOM — Tekstkaartje, knoppen en legenda
  // ==========================================================================

  function bouwDom() {
    if (state.el.root) return;
    const root = document.createElement('div');
    root.id = 'intro-verhaal';
    root.className = 'intro-verhaal';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Introductie: de armoedegrens trekken');
    root.innerHTML = `
      <section class="intro-kaartje" aria-live="polite">
        <div class="intro-kop">
          <span class="intro-teller"></span>
          <button type="button" class="intro-overslaan">Introductie overslaan</button>
        </div>
        <div class="intro-voortgang"></div>
        <div class="intro-inhoud">
          <h2 class="intro-titel"></h2>
          <div class="intro-voor"></div>
          <div class="intro-tekst"></div>
          <div class="intro-extra"></div>
        </div>
        <div class="intro-acties">
          <button type="button" class="intro-terug">← Terug</button>
          <span class="intro-acties-rechts"></span>
        </div>
        <p class="intro-bron"></p>
      </section>`;
    document.body.appendChild(root);

    state.el = {
      root,
      kaartje:   root.querySelector('.intro-kaartje'),
      teller:    root.querySelector('.intro-teller'),
      voortgang: root.querySelector('.intro-voortgang'),
      titel:     root.querySelector('.intro-titel'),
      tekst:     root.querySelector('.intro-tekst'),
      extra:     root.querySelector('.intro-extra'),
      voor:      root.querySelector('.intro-voor'),
      inhoud:    root.querySelector('.intro-inhoud'),
      terug:     root.querySelector('.intro-terug'),
      rechts:    root.querySelector('.intro-acties-rechts'),
      bron:      root.querySelector('.intro-bron'),
    };

    // Scrollen en klikken in het kaartje mogen de kaart niet laten zoomen of pannen
    if (window.L?.DomEvent) {
      L.DomEvent.disableScrollPropagation(state.el.kaartje);
      L.DomEvent.disableClickPropagation(state.el.kaartje);
    }

    root.querySelector('.intro-overslaan').addEventListener('click', () => stopIntro('overslaan'));
    state.el.terug.addEventListener('click', () => gaNaarStap(state.stap - 1));
    document.addEventListener('keydown', (e) => {
      if (!state.actief) return;
      if (e.key === 'Escape') stopIntro('overslaan');
    });
  }

  function knop(tekst, { primair = false, uit = false, onClick, klasse = '' } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `intro-knop${primair ? ' intro-knop-primair' : ''}${klasse ? ` ${klasse}` : ''}`;
    b.textContent = tekst;
    b.disabled = uit;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function renderVoortgang() {
    const el = state.el.voortgang;
    el.innerHTML = '';
    el.appendChild(maakGrensSchuif({
      labels: STAP_TITELS,
      waarde: state.stap - 1,
      ariaLabel: 'Stap in de introductie',
      klein: true,
      magNaar: (i) => i + 1 <= state.maxBereikt,
      onKies: (i) => gaNaarStap(i + 1),
    }));
    state.el.teller.textContent = `${state.stap} / ${AANTAL_STAPPEN}`;
  }

  function legendaHtml(min, max, schaal, { titel, markers = [], pct = true } = {}) {
    const stops = d3.range(0, 1.0001, 0.1).map(t => schaal(min + t * (max - min)));
    const fmt = (v) => (pct ? fmtPct(v) : v.toLocaleString('nl-NL', { maximumFractionDigits: 1 }));
    const pos = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100));
    return `
      <div class="intro-legenda">
        <div class="intro-legenda-titel">${escapeHtml(titel)}</div>
        <div class="intro-legenda-balk" style="background:linear-gradient(90deg, ${stops.join(',')})">
          ${markers.filter(m => m.waarde != null).map(m => `<span class="intro-legenda-marker" style="left:${pos(m.waarde)}%" title="${escapeHtml(m.label)}"><b>${escapeHtml(m.label)}</b></span>`).join('')}
        </div>
        <div class="intro-legenda-schaal"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>
        <div class="intro-legenda-noot">Vaste schaal over alle jaren, zodat een kleur altijd hetzelfde betekent.</div>
      </div>`;
  }

  function zetBron(tekst) { state.el.bron.textContent = tekst || ''; }

  function toonLaden(tekst = 'Kaartgegevens laden…') {
    state.el.extra.innerHTML = `<div class="intro-laden"><span class="intro-laden-lijn"></span>${escapeHtml(tekst)}</div>`;
  }

  // ==========================================================================
  // STAPPEN
  // ==========================================================================

  const STAPPEN = {
    1: stap1, 2: stap2, 3: stap3, 4: stap4, 5: stap5,
  };

  async function gaNaarStap(n) {
    if (n < 1 || n > AANTAL_STAPPEN) return;
    state.stap = n;
    state.maxBereikt = Math.max(state.maxBereikt, n);
    state.el.root.dataset.stap = String(n);
    state.el.terug.hidden = n === 1;
    state.el.rechts.innerHTML = '';
    state.el.extra.innerHTML = '';
    state.el.voor.innerHTML = '';
    zetBron('');
    renderVoortgang();
    state.el.inhoud.scrollTop = 0;
    await STAPPEN[n]();
  }

  function zetTekst(titel, alineas) {
    state.el.titel.textContent = titel;
    state.el.tekst.innerHTML = alineas.map(a => (a.startsWith('<') ? a : `<p>${a}</p>`)).join('');
  }

  // --- Stap 1: Waar trek je de armoedegrens? --------------------------------
  async function stap1() {
    zetTekst('Waar trek je de armoedegrens?', [
      'Armoede klinkt als iets dat we in kaart zouden moeten kunnen brengen. Bepaal wie arm is, zoek uit waar deze mensen wonen en zet dat op een kaart.',
      'Maar voordat we armoede in kaart kunnen brengen, moeten we eerst een keuze maken:',
      '<p class="intro-vraag">Wat bedoelen we met ‘arm’?</p>',
    ]);
    state.el.rechts.appendChild(knop('Trek de grens →', { primair: true, onClick: () => gaNaarStap(2) }));

    verwijderLabels();
    if (state.lagen.spoor) state.lagen.groep.removeLayer(state.lagen.spoor);
    stijlVlakken(() => ({ fillOpacity: 0, weight: 0, opacity: 0 }), 500);
    fitOpGemeente();
  }

  // --- Stap 2: Eén lijn door Heerlen -----------------------------------------
  async function stap2() {
    zetTekst('Eén lijn door Heerlen', [
      'Heerlen wordt soms beschreven als een stad die in tweeën wordt gedeeld: ten noorden van de spoorlijn en ten zuiden van de spoorlijn.',
      'Wanneer we naar inkomen kijken, lijkt deze indeling betekenisvol. In het noorden vinden we een groter aandeel mensen met een laag inkomen dan in het zuiden.',
      'Het is verleidelijk om hier een eenvoudig beeld van te maken: <strong>Noord is arm. Zuid niet.</strong>',
      'Maar wat gebeurt er als we de grenzen anders trekken?',
    ]);
    const verder = knop('Verander de grenzen →', { primair: true, uit: true, onClick: () => gaNaarStap(3) });
    state.el.rechts.appendChild(verder);

    if (!state.data) { toonLaden(); await Promise.all([laadData(), laadSpoorlijn()]); }
    else await laadSpoorlijn();
    if (!state.actief || state.stap !== 2) return;
    if (!state.data.buurten.length) { toonLaden('De kaartgegevens konden niet geladen worden. Ververs de pagina om het opnieuw te proberen.'); return; }

    tekenVlakken();
    tekenGemeentegrens();
    const nz = noordZuidWaarden();
    const [min, max] = domeinOverAlleJaren(INTRO_CONFIG.indicator);
    const schaal = maakSchaal(min, max);

    // Kleur elke buurt met de waarde van zijn helft: twee grote vlakken zonder binnengrenzen
    stijlVlakken(f => ({ fillColor: schaal(nz[f.__zijde]?.waarde), fillOpacity: 0.85, color: '#ffffff', weight: 0, opacity: 0 }), 1100);
    tekenSpoorlijn();
    zetSpoorZichtbaarheid(1);
    toonLabels(nz);
    fitOpGemeente();

    state.el.extra.innerHTML = legendaHtml(min, max, schaal, {
      titel: 'Aandeel inwoners met een laag inkomen (40% laagste inkomens)',
      markers: [{ label: 'N', waarde: nz.noord.waarde }, { label: 'Z', waarde: nz.zuid.waarde }],
    });
    zetBron(`Bron: CBS Kerncijfers wijken en buurten ${state.data.jaar}. Buurten opgeteld tot Noord en Zuid, gewogen naar aantal inwoners.`);
    verder.disabled = false;
  }

  // --- Stap 3: Dezelfde stad, andere grenzen ---------------------------------
  async function stap3() {
    zetTekst('Dezelfde stad. Andere grenzen.', [
      'Laten we de grenzen nu anders trekken. In plaats van Heerlen in noord en zuid te verdelen, kunnen we naar afzonderlijke buurten kijken.',
      'Het eenvoudige noord-zuidbeeld begint uiteen te vallen. Buurten binnen dezelfde helft van de stad kunnen er heel verschillend uitzien.',
      '<p class="intro-nadruk">De data is niet veranderd. De grenzen zijn veranderd.</p>',
      'En daardoor verandert het patroon dat we zien. Maar geografische grenzen zijn niet de enige grenzen die we trekken.',
    ]);
    state.el.rechts.appendChild(knop('Verander de armoedegrens →', { primair: true, onClick: () => gaNaarStap(4) }));
    if (!state.data) { toonLaden(); await Promise.all([laadData(), laadSpoorlijn()]); }
    if (!state.actief || state.stap !== 3) return;

    tekenVlakken();
    tekenGemeentegrens();
    const [min, max] = domeinOverAlleJaren(INTRO_CONFIG.indicator);
    const schaal = maakSchaal(min, max);
    noordZuidWaarden(); // zorgt voor __zijde (tooltip)
    verwijderLabels();
    stijlVlakken(f => ({ fillColor: schaal(getal(f.properties?.[INTRO_CONFIG.indicator])), fillOpacity: 0.85, color: '#ffffff', weight: 1, opacity: 0.9 }), 1300);
    tekenSpoorlijn();
    zetSpoorZichtbaarheid(0.9);  // de spoorlijn blijft staan
    fitOpGemeente();

    state.el.extra.innerHTML = legendaHtml(min, max, schaal, { titel: 'Aandeel inwoners met een laag inkomen (40% laagste inkomens)' });
    zetBron(`Bron: CBS Kerncijfers wijken en buurten ${state.data.jaar}. Zelfde indicator als bij Noord en Zuid, nu per buurt.`);
  }

  // --- Stap 4: Wat telt als armoede? -----------------------------------------
  async function stap4() {
    if (!state.data) { toonLaden(); await laadData(); }
    if (!state.actief || state.stap !== 4) return;
    tekenVlakken();
    tekenGemeentegrens();
    verwijderLabels();
    zetSpoorZichtbaarheid(0);

    state.el.titel.textContent = 'Wat telt als armoede?';
    const vergelijk = knop('Vergelijk de kaarten →', { primair: true, uit: state.bekekenDefs.size < 2, onClick: () => gaNaarStap(5) });
    state.el.rechts.appendChild(vergelijk);

    const [dmin, dmax] = definitieDomein();
    const schaal = maakSchaal(dmin, dmax);

    const schuifHouder = document.createElement('div');
    schuifHouder.className = 'intro-drempel';
    const uitleg = document.createElement('div');
    uitleg.className = 'intro-def-uitleg';
    const legenda = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'intro-hint';

    function toonDefinitie(i, eersteKeer = false) {
      state.definitie = i;
      state.bekekenDefs.add(i);
      const def = INTRO_CONFIG.definities[i];

      if (i === 0 && eersteKeer) {
        zetTekst('Wat als we hier de armoedegrens trekken?', [
          'Tot nu toe hebben we veranderd waar we geografische grenzen trekken. Maar er is nog een andere grens die nog belangrijker is:',
          '<p class="intro-vraag">Wie telt als arm?</p>',
          'Een manier om armoede te definiëren is aan de hand van een inkomensdrempel. Pas een mondiale extreme armoedegrens toe op Heerlen en bijna niemand hier zou volgens deze definitie als arm worden geclassificeerd.',
          '<strong>Betekent dat dat armoede geen probleem is in Heerlen?</strong>',
        ]);
      } else {
        zetTekst('Dezelfde stad. Dezelfde mensen. Een andere armoedegrens.', [
          'Het doel is niet om te suggereren dat één definitie correct is en de andere onjuist. Iedere definitie maakt armoede op een andere manier meetbaar, en maakt daardoor andere groepen en plaatsen zichtbaar.',
        ]);
      }

      const veld = definitieVeld(def);
      let samenvatting = '';
      if (def.type === 'drempel') {
        const bedragen = state.data.buurten.map(f => getal(f.properties?.[def.veld])).filter(v => v != null).map(def.bedragPerDag);
        const arm = bedragen.filter(b => b < def.drempel).length;
        const laagste = bedragen.length ? d3.min(bedragen) : null;
        samenvatting = `<strong>${arm} van ${state.data.buurten.length}</strong> buurten liggen onder deze grens. Zelfs in de buurt met het laagste gemiddelde inkomen is dat ${fmtEuro(laagste)} per inwoner per dag.`;
      } else {
        const waarden = state.data.buurten.map(f => definitieWaarde(def, f)).filter(v => v != null);
        samenvatting = waarden.length
          ? `Tussen <strong>${fmtPct(d3.min(waarden))}</strong> en <strong>${fmtPct(d3.max(waarden))}</strong> per buurt.`
          : 'Voor deze definitie is (nog) geen data beschikbaar in dit jaar.';
      }
      uitleg.innerHTML = `
        <div class="intro-def-label"><span class="intro-def-streep"></span>${escapeHtml(def.label)} <em>${escapeHtml(def.kort)}</em></div>
        <p>${escapeHtml(def.uitleg)}</p>
        <p>${samenvatting}</p>`;

      legenda.innerHTML = legendaHtml(dmin, dmax, schaal, { titel: 'Aandeel arm volgens de gekozen definitie' });
      stijlVlakken(f => ({ fillColor: schaal(definitieWaarde(def, f)), fillOpacity: 0.85, color: '#ffffff', weight: 1, opacity: 0.9 }), 900);
      zetBron(`Bron: CBS Kerncijfers wijken en buurten ${state.data.jaar} — variabele: ${window.mooieVeldnaam ? window.mooieVeldnaam(veld) : veld}.`);

      vergelijk.disabled = state.bekekenDefs.size < 2;
      hint.textContent = state.bekekenDefs.size < 2 ? 'Versleep de rode grens om een andere definitie te kiezen.' : '';
      state.el.extra.replaceChildren(uitleg, legenda);
    }

    schuifHouder.appendChild(maakGrensSchuif({
      labels: INTRO_CONFIG.definities.map(d => d.label.replace(' armoedegrens', '').replace('maatstaf', '')),
      waarde: state.definitie,
      ariaLabel: 'Kies de armoedegrens',
      onKies: (i) => toonDefinitie(i),
    }));
    const titelDrempel = document.createElement('div');
    titelDrempel.className = 'intro-drempel-titel';
    titelDrempel.textContent = 'Armoedegrens';
    schuifHouder.prepend(titelDrempel);

    // De drempel staat direct onder de titel, zodat je hem ook op een telefoon meteen ziet
    state.el.voor.replaceChildren(schuifHouder, hint);
    toonDefinitie(state.definitie, state.bekekenDefs.size === 0);
    fitOpGemeente();
  }

  // --- Stap 5: Welke kaart is de armoedekaart van Heerlen? --------------------
  async function stap5() {
    if (!state.data) { toonLaden(); await laadData(); }
    if (!state.actief || state.stap !== 5) return;
    zetSpoorZichtbaarheid(0);
    zetTekst('Welke van deze is de armoedekaart van Heerlen?', [
      '<p class="intro-nadruk">Ze zijn het allemaal.</p>',
      'Elke kaart toont dezelfde stad, maar elke kaart beantwoordt een andere vraag, omdat een andere definitie van armoede wordt gebruikt.',
      'Verander de geografische grenzen en het patroon verandert. Verander de armoededrempel en het patroon verandert opnieuw.',
      '<strong>Een armoedekaart laat niet simpelweg armoede zien. Ze laat zien wat we ervoor hebben gekozen als armoede te tellen.</strong>',
    ]);

    const [dmin, dmax] = definitieDomein();
    const schaal = maakSchaal(dmin, dmax);
    const raster = document.createElement('div');
    raster.className = 'intro-kaarten';
    INTRO_CONFIG.definities.forEach((def) => raster.appendChild(kleineKaart(def, schaal)));

    const teaser = document.createElement('div');
    teaser.className = 'intro-teaser';
    teaser.innerHTML = `
      <p><strong>En inkomen is slechts één manier om naar armoede te kijken.</strong></p>
      <p>Financiële middelen zijn belangrijk, maar armoede kan het leven van mensen op veel verschillende manieren beïnvloeden. De volgende verhalen verkennen deze verschillende dimensies, en de verschillende mensen achter de data.</p>`;

    const legenda = document.createElement('div');
    legenda.innerHTML = legendaHtml(dmin, dmax, schaal, { titel: 'Aandeel arm volgens de definitie' });
    state.el.extra.replaceChildren(raster, legenda, teaser);

    state.el.rechts.append(
      knop('Verken de kaart zelf', { onClick: () => stopIntro('kaart') }),
      knop('Ontdek de verhalen →', { primair: true, onClick: () => stopIntro('verhalen') }),
    );
    zetBron(`Bron: CBS Kerncijfers wijken en buurten ${state.data.jaar}.`);
  }

  /** Kleine, niet-zoombare kaart (SVG zonder achtergrond) voor één definitie. */
  function kleineKaart(def, schaal) {
    const fig = document.createElement('figure');
    fig.className = 'intro-kleine-kaart';
    const b = 240, h = 200;
    const fc = { type: 'FeatureCollection', features: state.data.buurten };
    const d3fc = { type: 'FeatureCollection', features: fc.features.map(f => ({ ...f, geometry: draaiRingen(f.geometry) })) };
    const projectie = d3.geoMercator().fitSize([b, h], d3fc);
    const pad = d3.geoPath(projectie);
    const paden = d3fc.features.map(f => {
      const kleur = schaal(definitieWaarde(def, f));
      return `<path d="${pad(f)}" fill="${kleur}" stroke="#fff" stroke-width="0.6"><title>${escapeHtml(buurtNaam(f))}: ${escapeHtml(fmtPct(definitieWaarde(def, f)))}</title></path>`;
    }).join('');
    fig.innerHTML = `
      <svg viewBox="0 0 ${b} ${h}" role="img" aria-label="${escapeHtml(def.label)}">${paden}</svg>
      <figcaption><span class="intro-def-streep"></span><strong>${escapeHtml(def.label)}</strong><span>${escapeHtml(def.kort)}</span></figcaption>`;
    return fig;
  }

  /** d3-geo verwacht rechtsom gewonden ringen; GeoJSON (RFC 7946) is linksom. Draai om waar nodig. */
  function draaiRingen(geom) {
    if (!geom) return geom;
    const goed = (poly) => (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly);
    if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: goed(geom.coordinates) };
    if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.coordinates.map(goed) };
    return geom;
  }

  // ==========================================================================
  // START EN STOP
  // ==========================================================================

  async function startIntro() {
    const m = kaart();
    if (!m || state.actief) return;
    state.actief = true;
    state.stap = 1;
    state.maxBereikt = 1;
    state.bekekenDefs = new Set();
    state.definitie = 0;
    state.vorigeView = { center: m.getCenter(), zoom: m.getZoom() };

    document.body.classList.add('intro-actief');
    window.hideHoverTimeSeries?.();
    m.closePopup();
    if (window.appData?.dataLayer && m.hasLayer(window.appData.dataLayer)) m.removeLayer(window.appData.dataLayer);
    setTimeout(() => m.invalidateSize(), 50);

    bouwDom();
    state.el.root.hidden = false;
    bouwLagen();
    await gaNaarStap(1);

    // Laad alles alvast op de achtergrond, zodat stap 2 direct klaar is
    laadGemeentegrens().then(() => { if (state.actief) { tekenGemeentegrens(); if (state.stap === 1) fitOpGemeente(); } });
    Promise.all([laadData(), laadSpoorlijn()]).then(() => {
      if (!state.actief) return;
      tekenVlakken();
      if (!state.gemeente) tekenGemeentegrens();
    });
    state.el.kaartje.querySelector('.intro-verder, .intro-knop-primair')?.focus({ preventScroll: true });
  }

  function stopIntro(reden = 'overslaan') {
    if (!state.actief) return;
    state.actief = false;
    const m = kaart();
    try { localStorage.setItem(INTRO_CONFIG.gezienSleutel, '1'); } catch (e) { /* leeg */ }

    ruimLagenOp();
    state.el.root.hidden = true;
    document.body.classList.remove('intro-actief');
    if (m && window.appData?.dataLayer && !m.hasLayer(window.appData.dataLayer)) window.appData.dataLayer.addTo(m);
    setTimeout(() => {
      m?.invalidateSize();
      const laag = window.appData?.choroplethLayer || window.appData?.baseGeoLayer;
      try { if (laag) m.fitBounds(laag.getBounds(), { maxZoom: 14 }); } catch (e) { /* leeg */ }
    }, 60);

    if (reden === 'verhalen') openVerhalen();
    window.dispatchEvent(new CustomEvent('intro:gesloten', { detail: { reden } }));
  }

  /** Open de zijbalk bij de Stories en laat ze even oplichten. */
  function openVerhalen() {
    const app = document.getElementById('app');
    if (app?.classList.contains('sidebar-collapsed')) document.getElementById('sidebar-toggle')?.click();
    const paneel = document.getElementById('stories-area');
    if (!paneel) return;
    paneel.classList.remove('is-ingeklapt');
    setTimeout(() => {
      paneel.scrollIntoView({ behavior: vermindertBeweging() ? 'auto' : 'smooth', block: 'start' });
      paneel.classList.add('is-uitgelicht');
      setTimeout(() => paneel.classList.remove('is-uitgelicht'), 2400);
    }, 320);
  }

  // ==========================================================================
  // COOKIEMELDING — Eerst toestemming vragen, daarna start het verhaal
  // ==========================================================================

  function cookieKeuze() {
    return window.leesCookie?.(INTRO_CONFIG.cookieKeuze) || null;
  }

  function vraagCookies() {
    return new Promise((resolve) => {
      if (cookieKeuze()) return resolve(cookieKeuze());
      const banner = document.createElement('div');
      banner.className = 'cookie-melding';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-modal', 'true');
      banner.setAttribute('aria-labelledby', 'cookie-titel');
      banner.innerHTML = `
        <div class="cookie-paneel">
          <h2 id="cookie-titel">Cookies</h2>
          <p>Deze atlas gebruikt alleen functionele cookies om je voorkeuren te onthouden, zoals favoriete en zelfgemaakte variabelen.
             We gebruiken geen cookies voor advertenties of om je te volgen.</p>
          <div class="cookie-acties">
            <button type="button" class="intro-knop" data-keuze="noodzakelijk">Alleen noodzakelijke</button>
            <button type="button" class="intro-knop intro-knop-primair" data-keuze="alles">Akkoord</button>
          </div>
        </div>`;
      document.body.appendChild(banner);
      banner.querySelector('.intro-knop-primair').focus();
      banner.querySelectorAll('[data-keuze]').forEach(b => b.addEventListener('click', () => {
        const keuze = b.dataset.keuze;
        window.zetCookie?.(INTRO_CONFIG.cookieKeuze, keuze, 365);
        banner.remove();
        resolve(keuze);
      }));
    });
  }

  // ==========================================================================
  // HULPMENU — "?"-knop op de kaart om de introductie opnieuw te starten
  // ==========================================================================

  function voegHulpknopToe() {
    const m = kaart();
    if (!m || !window.L) return;
    const Hulp = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const wrap = L.DomUtil.create('div', 'leaflet-bar intro-hulp');
        wrap.innerHTML = `
          <button type="button" class="intro-hulp-knop" aria-haspopup="true" aria-expanded="false" title="Hulp en uitleg">?</button>
          <div class="intro-hulp-menu" hidden>
            <button type="button" data-actie="intro">Introductie opnieuw bekijken</button>
            <button type="button" data-actie="rondleiding">Rondleiding door de knoppen</button>
          </div>`;
        L.DomEvent.disableClickPropagation(wrap);
        const knopEl = wrap.querySelector('.intro-hulp-knop');
        const menu = wrap.querySelector('.intro-hulp-menu');
        const zet = (open) => { menu.hidden = !open; knopEl.setAttribute('aria-expanded', String(open)); };
        knopEl.addEventListener('click', () => zet(menu.hidden));
        document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) zet(false); });
        menu.addEventListener('click', (e) => {
          const actie = e.target.closest('[data-actie]')?.dataset.actie;
          zet(false);
          if (actie === 'intro') startIntro();
          if (actie === 'rondleiding') window.startIntroTour?.();
        });
        return wrap;
      },
    });
    new Hulp().addTo(m);
  }

  // ==========================================================================
  // INITIALISATIE
  // ==========================================================================

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.isSplitScreenPane) return; // niet in de panelen van het splitscherm
    voegHulpknopToe();

    const params = new URLSearchParams(window.location.search);
    let gezien = false;
    try { gezien = localStorage.getItem(INTRO_CONFIG.gezienSleutel) === '1'; } catch (e) { /* leeg */ }
    const forceer = params.get('intro') === '1';
    if (params.get('intro') === '0') return;

    const toonIntro = !gezien || forceer;
    if (toonIntro) document.body.classList.add('intro-actief'); // zijbalk al verbergen achter de cookiemelding
    await vraagCookies();
    if (toonIntro) startIntro();
  });

  // Publieke functies
  window.introVerhaal = {
    start: startIntro,
    stop: stopIntro,
    gaNaarStap,
    get actief() { return state.actief; },
    config: INTRO_CONFIG,
  };
})();
