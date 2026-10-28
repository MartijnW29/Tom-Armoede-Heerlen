// ============================================================================
// MAP.JS — Heerlen Opportunity Atlas
// Kaart kleuren (choropleth), legenda, info-venster en trendgrafiek per buurt
// ============================================================================


// ============================================================================
// CONFIGURATIE
// ============================================================================

const KAART_CONFIG = {
  // Randen (dezelfde rustige look als de introductie)
  randKleur:       '#ffffff',
  randBreedte:     1,
  // Gemeentegrens: witte gloed met een donkere lijn erin (zoals in de introductie)
  grensGloed: { color: '#ffffff', weight: 6, opacity: 0.7, lineJoin: 'round' },
  grensLijn:  { color: '#061826', weight: 2.2, opacity: 0.85, lineJoin: 'round' },

  // Buurten buiten het filter of zonder waarde
  buitenFilterStijl: { color: '#999', weight: 0.6, fillOpacity: 0.45, fillColor: '#bdbdbd' },
  geenDataStijl:     { color: '#999', weight: 0.6, fillOpacity: 0.3,  fillColor: '#ccc' },

  // Info-venster: deze velden staan bovenaan (als ze bestaan)
  voorkeurvelden: ['naam', 'name', 'buurtnaam', 'id', 'code'],

  // Gebouwen als bovenaanzicht (aan/uit via het tandwiel)
  gebouwen: {
    vanafZoom:  14,      // daaronder zijn panden kleiner dan een pixel
    vlakFactor: 0.35,    // de buurtvlakken worden zoveel lichter, zodat de gebouwen opvallen
    tekenMarge: 0.3,     // minder dan de vlakken: één groot canvas kost veel geheugen
    dekking:    0.95,
    wit:        '#ffffff',
    rand:       'rgba(51, 65, 85, 0.5)',
    aanwijsLijn: { color: '#061826', weight: 2, fill: false, interactive: false },
  },
};

const TRENDGRAFIEK_CONFIG = {
  breedte: 340, hoogte: 190,
  marge: { boven: 16, rechts: 14, onder: 36, links: 42 },
  verbergNaMs: 650,  // wachttijd voordat het paneel verdwijnt na het verlaten van een buurt
  // Velden die een buurt over de jaren heen herkenbaar maken (eerste gevulde wint)
  identiteitsvelden: ['code', 'id', 'buurtcode', 'wijkcode', 'buurtnaam', 'wijknaam', 'naam', 'name'],
};

// Lagen boven elkaar: ondergrond (200) < kleuren < gebouwen < gemeentegrens < info-venster (700).
// Gebouwen en grens laten de muis door naar de buurten eronder.
[['choroplethPane', 460, true], ['gebouwenPane', 468, false], ['grensPane', 475, false]].forEach(([naam, z, muis]) => {
  Object.assign(map.createPane(naam).style, { zIndex: z, pointerEvents: muis ? '' : 'none' });
});


// ============================================================================
// WAARDEN EN FILTER
// ============================================================================

// Ook CBS-velden die een percentage zijn zonder dat in hun naam (sociaal minimum, arbeidsparticipatie)
const isPercentageVeld = (veld) => /(percentage|perc\b|_pct|pct_|aandeel|%|_percent_van_|arbeidsparticipatie)/i.test(veld || '');

/** Nederlandse notatie met hoogstens `decimalen` cijfers achter de komma; percentages krijgen een %-teken. */
function formatteerGetal(getal, veld, decimalen = 2) {
  const tekst = Number(getal).toLocaleString('nl-NL', { maximumFractionDigits: decimalen });
  return isPercentageVeld(veld) ? `${tekst}%` : tekst;
}

function haalNumeriekeWaarden(fc, veld) {
  return fc.features
    .map(f => f.properties?.[veld])
    .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(+v))
    .map(Number);
}

/** Komt een waarde door het filter? Ondersteunt min/max en percentielgrenzen (lowPct/highPct). */
function waardePasseertFilter(waarde, alleWaarden, filter) {
  if (!filter) return true;
  if (waarde === null || waarde === undefined || isNaN(+waarde)) return false;
  const getal = +waarde;
  if (typeof filter.min === 'number' && getal < filter.min) return false;
  if (typeof filter.max === 'number' && getal > filter.max) return false;

  if (typeof filter.lowPct === 'number' || typeof filter.highPct === 'number') {
    const gesorteerd = [...alleWaarden].sort((a, b) => a - b);
    const opPercentiel = (pct) => gesorteerd[Math.floor(pct / 100 * (gesorteerd.length - 1))];
    if (typeof filter.lowPct  === 'number' && getal < opPercentiel(filter.lowPct))  return false;
    if (typeof filter.highPct === 'number' && getal > opPercentiel(filter.highPct)) return false;
  }
  return true;
}

function gefilterdeFeatures(fc, veld, filter) {
  if (!filter) return fc.features;
  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  return fc.features.filter(f => waardePasseertFilter(f.properties?.[veld], alleWaarden, filter));
}


// ============================================================================
// KLEUREN, KLASSEN EN LEGENDA
// ============================================================================

const KLEURSCHEMAS = {
  viridis: d3.interpolateViridis,
  rdylgn:  d3.interpolateRdYlGn,
  blues:   d3.interpolateBlues,
  oranges: d3.interpolateOranges,
};

function haalKleurSchema(naam, aantal) {
  return d3.quantize(KLEURSCHEMAS[naam] || KLEURSCHEMAS.viridis, aantal);
}

/** Klassengrenzen (aantal + 1 stuks): kwantielen (even veel buurten per klasse) of gelijke stappen. */
function berekenBreuken(waarden, aantal, methode) {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const min = gesorteerd[0], max = gesorteerd.at(-1);
  return Array.from({ length: aantal + 1 }, (_, i) => {
    if (i === 0) return min;
    if (i === aantal) return max;
    return methode === 'equal' ? min + (max - min) * i / aantal : gesorteerd[Math.floor(i / aantal * (gesorteerd.length - 1))];
  });
}

function tekenLegenda(breuken, kleuren, veld, waarden) {
  const titel = `Legenda: ${window.mooieVeldnaam(veld)}`;
  const rij = (kleur, tekst, extraKlasse = '') =>
    `<div class="legenda-rij ${extraKlasse}"><i style="background:${kleur}"></i><span>${tekst}</span></div>`;

  // Klassen sluiten zonder overlap op elkaar aan: een waarde op de grens hoort bij de hogere klasse,
  // dus de klasse eronder loopt tot één stap (1, of 0,1 bij decimalen) onder die grens
  const stap = waarden.every(Number.isInteger) ? 1 : 0.1;
  const rond = (x) => +x.toFixed(1);
  const vanaf = (i) => i === 0 ? breuken[0] : rond(Math.ceil(breuken[i] / stap - 1e-9) * stap);
  const tot = (i) => i === kleuren.length - 1 ? breuken.at(-1) : rond(vanaf(i + 1) - stap);
  const label = (i) => tot(i) > vanaf(i) ? `${formatteerGetal(vanaf(i), veld, 1)} – ${formatteerGetal(tot(i), veld, 1)}` : formatteerGetal(vanaf(i), veld, 1);

  // Hoogste klasse bovenaan
  const klassen = kleuren.map((kleur, i) => rij(kleur, label(i)));
  document.getElementById('legend').innerHTML = `<h3 title="${titel}">${titel}</h3>`
    + klassen.reverse().join('')
    + rij('#ccc', 'Geen data', 'is-geen-data');
}


// ============================================================================
// INFO-VENSTER — Gegevens van een buurt bij aanwijzen of klikken
// ============================================================================

const netteNaam = (naam) => String(naam).trim().replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ');

/** Wijknaam: uit de wijkkoppeling, uit de data, of afgeleid uit de buurtnaam ("Heerlen Centrum" → "Centrum"). */
function bepaalWijknaam(props) {
  if (props.overlapping_wijken?.length) return netteNaam(props.overlapping_wijken[0]);
  if (props.wijknaam?.trim()) return netteNaam(props.wijknaam);
  const buurt = (props.buurtnaam || props.buurt || '').trim();
  if (!buurt) return null;
  const delen = buurt.split(/\s+/);
  return netteNaam(delen.length > 1 ? delen.slice(1).join(' ') : buurt);
}

function bouwFeaturePopup(feature, veld, filter, alleWaarden) {
  const props = feature.properties || {};
  const velden = window.getSelectedFields().length ? window.getSelectedFields() : [veld];
  const regel = (naam, waarde) => `<b>${naam}</b>: ${waarde}`;
  const toon = (waarde, v) => typeof waarde === 'number' ? formatteerGetal(waarde, v) : waarde;

  const wijk = bepaalWijknaam(props);
  return [
    '<b>Geselecteerd gebied</b>',
    wijk && regel('Wijknaam', wijk),
    ...KAART_CONFIG.voorkeurvelden.filter(k => props[k] !== undefined).map(k => regel(window.mooieVeldnaam(k), toon(props[k], k))),
    ...velden.map(v => {
      const waarde = props[v];
      const leeg = waarde === null || waarde === undefined || waarde === '';
      const buiten = waardePasseertFilter(waarde, alleWaarden, filter) ? '' : ' <i>(buiten filter)</i>';
      return regel(window.mooieVeldnaam(v), (leeg ? '<i>geen waarde</i>' : toon(waarde, v)) + buiten);
    }),
  ].filter(Boolean).join('<br/>');
}


// ============================================================================
// TRENDGRAFIEK — Paneel met de waarden van een buurt over de jaren
// ============================================================================

const trend = { verbergTimer: null, bovenFeature: false, bovenPaneel: false };

function planVerbergTrend() {
  clearTimeout(trend.verbergTimer);
  trend.verbergTimer = setTimeout(() => {
    if (trend.bovenFeature || trend.bovenPaneel) return;
    document.getElementById('hover-timeseries-panel')?.classList.remove('is-visible');
    map.closePopup();
  }, TRENDGRAFIEK_CONFIG.verbergNaMs);
}

function trendPaneel() {
  let paneel = document.getElementById('hover-timeseries-panel');
  if (paneel) return paneel;

  paneel = Object.assign(document.createElement('section'), { id: 'hover-timeseries-panel', className: 'hover-timeseries-panel' });
  paneel.innerHTML = `
    <div class="hover-timeseries-header">
      <div class="hover-timeseries-title"></div>
      <span class="hover-timeseries-chevron">Inklappen ▼</span>
    </div>
    <div class="hover-timeseries-body"></div>`;

  paneel.querySelector('.hover-timeseries-header').addEventListener('click', () => {
    const ingeklapt = paneel.classList.toggle('is-collapsed');
    paneel.querySelector('.hover-timeseries-chevron').textContent = ingeklapt ? 'Uitklappen ▲' : 'Inklappen ▼';
    pasTrendPositieAan();
  });
  paneel.addEventListener('mouseenter', () => { trend.bovenPaneel = true; clearTimeout(trend.verbergTimer); });
  paneel.addEventListener('mouseleave', () => { trend.bovenPaneel = false; planVerbergTrend(); });

  document.getElementById('map').appendChild(paneel);
  return paneel;
}

/** Eerste gevulde identiteitsveld van een buurt, bv. { key: 'buurtcode', value: 'BU09170000' }. */
function getFeatureIdentity(feature) {
  const props = feature?.properties || {};
  const key = TRENDGRAFIEK_CONFIG.identiteitsvelden.find(k => props[k] !== undefined && props[k] !== null && String(props[k]).trim() !== '');
  return key ? { key, value: String(props[key]) } : null;
}

const heeftIdentiteit = (feature, identiteit) => identiteit && String(feature?.properties?.[identiteit.key]) === identiteit.value;

/** Gemiddelde waarde per jaar en per veld voor dezelfde buurt in de gekozen periode; waarden buiten het filter tellen niet mee. */
function verzamelTrend(buurt, velden) {
  const bron = window.multiLoaderState.originalData || window.appData.lastFC;
  if (!bron?.features?.length) return null;

  const identiteit = getFeatureIdentity(buurt);
  const zelfde = bron.features.filter(f => heeftIdentiteit(f, identiteit));
  const kandidaten = zelfde.length ? zelfde : bron.features;
  const filter = window.appData.filter;
  const alleWaarden = Object.fromEntries(velden.map(v => [v, haalNumeriekeWaarden(bron, v)]));
  const { start, eind } = haalPeriode();  // alleen de jaren van de gekozen periode op de tijdlijn

  const perJaar = new Map();
  for (const f of kandidaten) {
    const jaar = getYearFromFeature(f);
    if (!Number.isFinite(jaar) || jaar < start || jaar > eind) continue;
    if (!perJaar.has(jaar)) perJaar.set(jaar, Object.fromEntries(velden.map(v => [v, []])));
    for (const v of velden) {
      const waarde = f.properties?.[v];
      if (waarde === null || waarde === '' || !Number.isFinite(+waarde) || !waardePasseertFilter(+waarde, alleWaarden[v], filter)) continue;
      perJaar.get(jaar)[v].push(+waarde);
    }
  }

  const jaren = [...perJaar.keys()].sort((a, b) => a - b);
  const reeksen = Object.fromEntries(velden.map(v => [v, jaren
    .map(jaar => ({ year: jaar, waarden: perJaar.get(jaar)[v] }))
    .filter(p => p.waarden.length)
    .map(p => ({ year: p.year, value: d3.mean(p.waarden) }))]));
  const alleWaardenInReeks = Object.values(reeksen).flat().map(p => p.value);
  return alleWaardenInReeks.length ? { jaren, reeksen, alleWaarden: alleWaardenInReeks, identiteit } : null;
}

/**
 * Staat er een story-kaartje over het paneel heen, dan schuift het paneel ernaast
 * (maar nooit onder de zijbalk). Wordt bij elke weergave en bij resize opnieuw bepaald.
 */
function pasTrendPositieAan() {
  const paneel = document.getElementById('hover-timeseries-panel');
  if (!paneel?.classList.contains('is-visible')) return;
  paneel.style.left = '';

  const kaartje = document.querySelector('.story-overlay:not([hidden]) .story-card');
  if (!kaartje) return;
  const p = paneel.getBoundingClientRect(), k = kaartje.getBoundingClientRect();
  if (!(p.left < k.right && p.right > k.left && p.top < k.bottom && p.bottom > k.top)) return;

  const zijbalk = document.getElementById('sidebar').getBoundingClientRect();
  const grensRechts = zijbalk.width > 0 && zijbalk.left >= k.right ? zijbalk.left - 14 : window.innerWidth - 14;
  paneel.style.left = `${Math.round(Math.min(k.right + 14, grensRechts - p.width))}px`;
}
window.addEventListener('resize', pasTrendPositieAan);

/** Teken voor een buurt één lijn per gekozen variabele, met een markering op het getoonde jaar. */
function toonTrendgrafiek(buurt, standaardVeld) {
  clearTimeout(trend.verbergTimer);
  const paneel = trendPaneel();
  const titelEl = paneel.querySelector('.hover-timeseries-title');
  const body = paneel.querySelector('.hover-timeseries-body');
  const toon = () => { paneel.classList.add('is-visible'); pasTrendPositieAan(); };

  const velden = window.getSelectedFields().length ? window.getSelectedFields() : [standaardVeld].filter(Boolean);
  const data = velden.length ? verzamelTrend(buurt, velden) : null;
  const p = buurt?.properties || {};
  titelEl.textContent = `Trend over jaren - ${p.buurtnaam || p.wijknaam || p.naam || p.name || data?.identiteit?.value || 'Gebied'}`;

  if (!data) {
    body.innerHTML = `<div class="hover-timeseries-empty">${velden.length ? 'Geen jaarreeks beschikbaar voor dit gebied.' : 'Selecteer eerst een variabele.'}</div>`;
    return toon();
  }
  body.innerHTML = '';

  const { breedte: W, hoogte: H, marge: m } = TRENDGRAFIEK_CONFIG;
  const svg = d3.select(body).append('svg')
    .attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Trendgrafiek per geselecteerde variabele');

  let [xMin, xMax] = d3.extent(data.jaren);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  let [yMin, yMax] = d3.extent(data.alleWaarden);
  if (yMin === yMax) { const marge = Math.abs(yMin || 1) * 0.05; yMin -= marge; yMax += marge; }

  const x = d3.scaleLinear().domain([xMin, xMax]).range([m.links, W - m.rechts]);
  const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([H - m.onder, m.boven]);
  const kleur = d3.scaleOrdinal(d3.schemeTableau10).domain(velden);
  const verschijn = (sel, vertraging, duur, easing) => sel.transition().delay(vertraging).duration(duur).ease(easing);

  svg.append('g').attr('transform', `translate(0,${H - m.onder})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')));
  svg.append('g').attr('transform', `translate(${m.links},0)`).call(d3.axisLeft(y).ticks(4));

  for (const veld of velden) {
    const punten = data.reeksen[veld];
    if (!punten.length) continue;
    // Lijn "tekent zichzelf" via een streepjespatroon dat wegschuift
    verschijn(svg.append('path').datum(punten)
      .attr('fill', 'none').attr('stroke', kleur(veld)).attr('stroke-width', 2).attr('opacity', 0.85)
      .attr('d', d3.line().x(d => x(d.year)).y(d => y(d.value)))
      .attr('stroke-dasharray', 1000).attr('stroke-dashoffset', 1000), 0, 600, d3.easeCubicInOut).attr('stroke-dashoffset', 0);
    verschijn(svg.append('circle')
      .attr('cx', x(punten.at(-1).year)).attr('cy', y(punten.at(-1).value)).attr('r', 2.5).attr('fill', kleur(veld)).attr('opacity', 0),
      350, 300, d3.easeQuadOut).attr('opacity', 1);
  }

  const jaar = window.multiLoaderState.yearFilter;
  if (Number.isFinite(jaar) && jaar >= xMin && jaar <= xMax) {
    verschijn(svg.append('line').attr('class', 'hover-chart-year-marker').attr('opacity', 0)
      .attr('x1', x(jaar)).attr('x2', x(jaar)).attr('y1', m.boven).attr('y2', H - m.onder), 500, 300, d3.easeQuadOut).attr('opacity', 0.9);
    for (const veld of velden) {
      const punt = data.reeksen[veld].find(p => p.year === jaar);
      if (!punt) continue;
      verschijn(svg.append('circle').attr('cx', x(punt.year)).attr('cy', y(punt.value)).attr('r', 0)
        .attr('fill', kleur(veld)).attr('stroke', '#111').attr('stroke-width', 1.4).attr('opacity', 0),
        550, 350, d3.easeBackOut).attr('r', 5).attr('opacity', 1);
    }
  }

  const legenda = d3.select(body).append('div').attr('class', 'hover-timeseries-legend').style('opacity', 0);
  for (const veld of velden) {
    const item = legenda.append('span').attr('class', 'legend-item');
    item.append('i').style('background', kleur(veld)).style('opacity', data.reeksen[veld].length ? 1 : 0.35);
    item.append('b').text(window.mooieVeldnaam(veld));
  }
  verschijn(legenda, 700, 300, d3.easeQuadOut).style('opacity', 1);
  toon();
}


// ============================================================================
// CHOROPLETH — De buurten kleuren naar één variabele
// ============================================================================

/**
 * @param {Object} opties - { method, palette, opacity, classes, klassenFC }
 *   klassenFC: dataset voor de klassengrenzen (alle jaren), zodat dezelfde kleur
 *   elk jaar dezelfde waarde betekent.
 */
window.toonChoropleth = function (fc, veld, { method = 'quantile', palette = 'blues', opacity = 0.65, classes = 5, klassenFC } = {}) {
  if (!fc?.features?.length) return;
  const { appData } = window;

  ['baseGeoLayer', 'choroplethLayer'].forEach(sleutel => {
    if (appData[sleutel]) appData.dataLayer.removeLayer(appData[sleutel]);
    appData[sleutel] = null;
  });

  const alleWaarden = haalNumeriekeWaarden(fc, veld);
  if (!alleWaarden.length) {
    window.toonMelding(`Geen data voor "${window.mooieVeldnaam(veld)}" in dit jaar.`);
    return;
  }

  const filter = appData.filter;
  const klassenWaarden = haalNumeriekeWaarden({ features: gefilterdeFeatures(klassenFC?.features?.length ? klassenFC : fc, veld, filter) }, veld);
  const aantal  = Math.min(classes, fc.features.length);
  const breuken = berekenBreuken(klassenWaarden.length ? klassenWaarden : alleWaarden, aantal, method);
  const kleuren = haalKleurSchema(palette, aantal);

  const wijkenFC = window.multiLoaderState.wijkenFC;
  if (wijkenFC && !fc.features.some(f => f.properties?.overlapping_wijken?.length)) addWijkenToBuurten(fc, wijkenFC);

  /** Kleur van de klasse waar een buurt in valt; null zonder waarde of buiten het filter. */
  const kleurVan = (feature) => {
    const waarde = feature.properties?.[veld];
    if (!waardePasseertFilter(waarde, alleWaarden, filter) || waarde === null || waarde === '' || isNaN(+waarde)) return null;
    const klasse = breuken.slice(1, -1).findIndex(grens => +waarde < grens);
    return kleuren[klasse === -1 ? kleuren.length - 1 : klasse];
  };

  const stijl = (feature) => {
    const waarde = feature.properties?.[veld];
    const basis = !waardePasseertFilter(waarde, alleWaarden, filter) ? KAART_CONFIG.buitenFilterStijl
      : waarde === null || waarde === '' || isNaN(+waarde) ? KAART_CONFIG.geenDataStijl
      : { color: KAART_CONFIG.randKleur, weight: KAART_CONFIG.randBreedte, fillOpacity: opacity, fillColor: kleurVan(feature) };
    return { ...basis, fillOpacity: basis.fillOpacity * gebouwenKaart.vlakFactor() };
  };

  appData.choroplethLayer = L.geoJSON(fc, {
    style: stijl,
    pane: 'choroplethPane',
    onEachFeature: (feature, laag) => {
      laag.bindPopup(bouwFeaturePopup(feature, veld, filter, alleWaarden), { closeButton: false, autoPan: false });
      laag.on('click', () => laag.openPopup());
      laag.on('mouseover', () => {
        trend.bovenFeature = true;
        laag.openPopup();
        toonTrendgrafiek(feature, veld);
        stuurNaarAndereKaart({ type: 'heerlen-hover', identity: getFeatureIdentity(feature) });
      });
      laag.on('mouseout', () => {
        trend.bovenFeature = false;
        planVerbergTrend();
        stuurNaarAndereKaart({ type: 'heerlen-hover-clear' });
      });
    },
  }).addTo(appData.dataLayer);
  window.bringSmallPolygonsToFront(appData.dataLayer);

  // Kleuren verandert nooit de kaartuitsnede; inzoomen gebeurt alleen bij het laden van data
  gemeentegrens.toon(fc);
  tekenLegenda(breuken, kleuren, veld, klassenWaarden.length ? klassenWaarden : alleWaarden);
  gebouwenKaart.werkBij(fc, veld, kleurVan);
};


map.on('popupclose', planVerbergTrend);


// ============================================================================
// GEMEENTEGRENS — De buitenrand van alle buurten samen, als zwarte lijn.
// Aangrenzende buurten delen in PDOK exact dezelfde punten: een rand die maar
// bij één buurt hoort, ligt aan de buitenkant. (Ook gebruikt door intro.js.)
// ============================================================================

/** Alle randsegmenten met de items waar ze bij horen; een gedeelde rand komt twee keer voor. */
function randSegmenten(items, geometrieVan) {
  const segmenten = new Map();
  for (const item of items) {
    const g = geometrieVan(item);
    const ringen = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
    for (const ring of ringen) {
      for (let i = 0; i < ring.length - 1; i++) {
        const p = ring[i], q = ring[i + 1];
        const kp = p.join(','), kq = q.join(',');
        if (kp === kq) continue;
        const sleutel = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
        const seg = segmenten.get(sleutel) || { a: p, b: q, buurten: [] };
        seg.buurten.push(item);
        segmenten.set(sleutel, seg);
      }
    }
  }
  return [...segmenten.values()];
}

/** Rijg losse segmenten aaneen tot zo lang mogelijke lijnen ([lat, lng]-arrays). */
function maakKetens(segmenten) {
  const sleutel = p => p.join(',');
  const perPunt = new Map();
  segmenten.forEach((s, i) => [s.a, s.b].forEach(p => {
    const k = sleutel(p);
    if (!perPunt.has(k)) perPunt.set(k, []);
    perPunt.get(k).push(i);
  }));

  const gebruikt = new Array(segmenten.length).fill(false);
  const volg = (startIndex, startPunt) => {
    const keten = [startPunt];
    let punt = startPunt, index = startIndex;
    while (index !== undefined) {
      gebruikt[index] = true;
      const s = segmenten[index];
      punt = sleutel(s.a) === sleutel(punt) ? s.b : s.a;
      keten.push(punt);
      index = perPunt.get(sleutel(punt)).find(j => !gebruikt[j]);
    }
    return keten;
  };

  const ketens = [];
  // Eerst open lijnen vanaf hun eindpunt, daarna gesloten ringen
  for (const [k, lijst] of perPunt) {
    if (lijst.length === 1 && !gebruikt[lijst[0]]) ketens.push(volg(lijst[0], k.split(',').map(Number)));
  }
  segmenten.forEach((s, i) => { if (!gebruikt[i]) ketens.push(volg(i, s.a)); });
  return ketens.map(k => k.map(([lon, lat]) => [lat, lon]));
}

const gemeentegrens = (function () {
  const lijn = (stijl) => L.polyline([], { pane: 'grensPane', interactive: false, ...stijl });
  const lagen = [lijn(KAART_CONFIG.grensGloed), lijn(KAART_CONFIG.grensLijn)];
  let sleutel = null;  // de grens verandert alleen als er andere buurten op de kaart staan

  return {
    toon(fc) {
      const codes = fc.features.map(f => f.properties?.buurtcode).join();
      if (codes !== sleutel) {
        const ketens = maakKetens(randSegmenten(fc.features, f => f.geometry).filter(s => s.buurten.length === 1));
        lagen.forEach(l => l.setLatLngs(ketens));
        sleutel = codes;
      }
      lagen.forEach(l => { if (!map.hasLayer(l)) l.addTo(map); });
    },
  };
})();


// ============================================================================
// GEBOUWEN — De BAG-panden als bovenaanzicht, in de kleur van hun buurt.
// Alleen de panden waar de variabele over gaat krijgen kleur (regels in
// js/gebouwen.js), bij een percentage dat aandeel ervan; de rest is wit.
// ============================================================================

/**
 * Canvas voor tienduizenden panden. L.Renderer schaalt de tekening mee tijdens het
 * zoomen; na elke beweging tekent _update de panden in beeld opnieuw (zoals L.Canvas).
 */
const GebouwenLaag = L.Renderer.extend({
  _initContainer() {
    this._container = document.createElement('canvas');
    this._ctx = this._container.getContext('2d');
  },

  _destroyContainer() {
    this._container.remove();
    delete this._container;
  },

  _update() {
    if (this._map._animatingZoom && this._bounds) return;
    L.Renderer.prototype._update.call(this);
    const { min, max } = this._bounds, breedte = max.x - min.x, hoogte = max.y - min.y;
    const r = Math.min(2, window.devicePixelRatio || 1), canvas = this._container;
    L.DomUtil.setPosition(canvas, min);
    Object.assign(canvas, { width: Math.round(breedte * r), height: Math.round(hoogte * r) });
    Object.assign(canvas.style, { width: `${breedte}px`, height: `${hoogte}px` });
    this._ctx.setTransform(r, 0, 0, r, 0, 0);
    this.options.teken(this._ctx, min, breedte, hoogte);
  },
});

/** Ligt (x, y) binnen een ring van [x, y]-punten? (even-oneven-regel) */
function binnenRing(x, y, ring) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

const gebouwenKaart = (function () {
  const cfg = KAART_CONFIG.gebouwen;
  const st = {
    aan: false,
    g: null, wereld: null, kader: null, getekend: [],  // panden, hoekpunten en kaders in wereldpixels (zoom 0)
    fc: null, veld: null, kleurVan: null,              // de laatst getoonde kaartkleuren
    buurtFC: null, buurtSleutel: null, pandenPerBuurt: [], buurtVan: null,
    kleur: [],                                         // vulkleur per pand; leeg = wit
    pand: -1,                                          // het aangewezen pand
  };
  const laag = new GebouwenLaag({ pane: 'gebouwenPane', padding: cfg.tekenMarge, teken });
  const aanwijsLijn = L.polygon([], { pane: 'grensPane', ...cfg.aanwijsLijn });  // boven het canvas

  const zichtbaar = () => st.aan && !!st.g && map.getZoom() >= cfg.vanafZoom;
  const naarWereld = (lon, lat) => [256 * (0.5 + lon / 360), 256 * (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI))];

  // ── Voorbereiden en koppelen ────────────────────────────────────────────

  /** Hoekpunten naar wereldpixels op zoom 0 (zoals map.project(…, 0)), met een kader per pand. */
  function bereidVoor(g) {
    const wereld = new Float64Array(g.V * 2), kader = new Float64Array(g.N * 4);
    for (let i = 0; i < g.N; i++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let v = g.vStart[i], eind = v + g.vCnt[i]; v < eind; v++) {
        const [x, y] = naarWereld(...Gebouwen.naarLonLat(g, g.x0 + g.X[v] * g.Q, g.z0 + g.Z[v] * g.Q));
        wereld[v * 2] = x; wereld[v * 2 + 1] = y;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      kader.set([x0, y0, x1, y1], i * 4);
    }
    // Net als in 3D: schuurtjes en garages niet
    const getekend = [];
    for (let i = 0; i < g.N; i++) if (g.opp[i] >= Gebouwen.config.minOppervlak) getekend.push(i);
    Object.assign(st, { g, wereld, kader, getekend });
  }

  /** Bij welke buurt hoort elk pand (zwaartepunt in de buurt)? Alleen opnieuw als er andere buurten staan. */
  function wijsBuurtenToe(fc) {
    const sleutel = fc.features.map(f => f.properties?.buurtcode ?? '').join();
    if (fc === st.buurtFC || (sleutel.replace(/,/g, '') && sleutel === st.buurtSleutel)) return;

    const buurten = fc.features.map(f => {
      const geom = f.geometry || {};
      const polygonen = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      const punten = polygonen.flat(2);
      return {
        polygonen,
        kader: [d3.min(punten, p => p[0]), d3.min(punten, p => p[1]), d3.max(punten, p => p[0]), d3.max(punten, p => p[1])],
      };
    });
    const binnen = (lon, lat, b) => lon >= b.kader[0] && lon <= b.kader[2] && lat >= b.kader[1] && lat <= b.kader[3]
      && b.polygonen.some(ringen => ringen.reduce((erin, ring) => binnenRing(lon, lat, ring) ? !erin : erin, false));

    const g = st.g;
    st.buurtVan = new Int16Array(g.N).fill(-1);
    st.pandenPerBuurt = fc.features.map(() => []);
    for (const i of st.getekend) {
      const [lon, lat] = Gebouwen.naarLonLat(g, g.cx[i], g.cz[i]);
      const k = buurten.findIndex(b => binnen(lon, lat, b));
      if (k >= 0) { st.buurtVan[i] = k; st.pandenPerBuurt[k].push(i); }
    }
    Object.assign(st, { buurtFC: fc, buurtSleutel: sleutel });
  }

  function kleurPanden() {
    const { g, fc, veld, kleurVan } = st;
    if (!st.aan || !g || !fc) return;
    wijsBuurtenToe(fc);
    const buurtkleuren = fc.features.map(kleurVan);
    const buurten = fc.features.map((f, k) => ({ panden: st.pandenPerBuurt[k], waarde: buurtkleuren[k] ? f.properties[veld] : null }));
    const gekleurd = Gebouwen.kiesGekleurd(g, buurten, veld, isPercentageVeld(veld));
    st.kleur = new Array(g.N);
    for (const i of st.getekend) if (gekleurd[i]) st.kleur[i] = buurtkleuren[st.buurtVan[i]];
    if (map.hasLayer(laag)) laag._update();
  }

  // ── Tekenen ─────────────────────────────────────────────────────────────

  function tekenPand(ctx, i, schaal, dx, dy) {
    const { g, wereld: w } = st;
    let v = g.vStart[i];
    for (let k = 0; k < g.ringen[i]; k++) {
      const n = g.len[g.rStart[i] + k];
      ctx.moveTo(w[v * 2] * schaal - dx, w[v * 2 + 1] * schaal - dy);
      for (let m = 1; m < n; m++) ctx.lineTo(w[(v + m) * 2] * schaal - dx, w[(v + m) * 2 + 1] * schaal - dy);
      ctx.closePath();
      v += n;
    }
  }

  function teken(ctx, min, breedte, hoogte) {
    ctx.clearRect(0, 0, breedte, hoogte);
    if (!zichtbaar()) return;
    const zoom = map.getZoom(), schaal = 2 ** zoom, oorsprong = map.getPixelOrigin();
    const dx = oorsprong.x + min.x, dy = oorsprong.y + min.y;  // canvaspixel = wereldpixel × schaal − (dx, dy)

    // De panden in beeld per kleur gegroepeerd (wit eerst), zodat de vulkleur zelden wisselt
    const perKleur = new Map([[cfg.wit, []]]);
    for (const i of st.getekend) {
      const k = i * 4;
      if (st.kader[k + 2] * schaal - dx < 0 || st.kader[k] * schaal - dx > breedte
       || st.kader[k + 3] * schaal - dy < 0 || st.kader[k + 1] * schaal - dy > hoogte) continue;
      const kleur = st.kleur[i] || cfg.wit;
      if (!perKleur.has(kleur)) perKleur.set(kleur, []);
      perKleur.get(kleur).push(i);
    }

    // Elk pand een eigen pad: één groot pad met duizenden panden is in Chrome juist heel traag
    Object.assign(ctx, { globalAlpha: cfg.dekking, strokeStyle: cfg.rand, lineWidth: zoom >= 17 ? 1 : zoom >= 16 ? 0.7 : 0.5, lineJoin: 'round' });
    for (const [kleur, panden] of perKleur) {
      ctx.fillStyle = kleur;
      for (const i of panden) {
        const k = i * 4, x = st.kader[k] * schaal - dx, y = st.kader[k + 1] * schaal - dy;
        const b = (st.kader[k + 2] - st.kader[k]) * schaal, h = (st.kader[k + 3] - st.kader[k + 1]) * schaal;
        // Een pand van een paar pixels als blokje: ziet er hetzelfde uit en is veel sneller
        if (b < 2 && h < 2) { ctx.fillRect(x, y, Math.max(b, 0.5), Math.max(h, 0.5)); continue; }
        ctx.beginPath();
        tekenPand(ctx, i, schaal, dx, dy);
        ctx.fill('evenodd');
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Aanwijzen: een donkere lijn om het pand onder de muis ───────────────

  function pandOp(latlng) {
    const [x, y] = naarWereld(latlng.lng, latlng.lat), { g, wereld: w } = st;
    for (const i of st.getekend) {
      const k = i * 4;
      if (x < st.kader[k] || x > st.kader[k + 2] || y < st.kader[k + 1] || y > st.kader[k + 3]) continue;
      let binnen = false, v = g.vStart[i];
      for (let r = 0; r < g.ringen[i]; r++) {
        const n = g.len[g.rStart[i] + r], ring = [];
        for (let m = 0; m < n; m++) ring.push([w[(v + m) * 2], w[(v + m) * 2 + 1]]);
        if (binnenRing(x, y, ring)) binnen = !binnen;
        v += n;
      }
      if (binnen) return i;
    }
    return -1;
  }

  function wijsAan(i) {
    if (i === st.pand) return;
    st.pand = i;
    if (i < 0) aanwijsLijn.remove();
    else {
      const { g } = st, ringen = [];
      let v = g.vStart[i];
      for (let r = 0; r < g.ringen[i]; r++) {
        const n = g.len[g.rStart[i] + r], ring = [];
        for (let m = 0; m < n; m++) {
          const [lon, lat] = Gebouwen.naarLonLat(g, g.x0 + g.X[v + m] * g.Q, g.z0 + g.Z[v + m] * g.Q);
          ring.push([lat, lon]);
        }
        ringen.push(ring);
        v += n;
      }
      aanwijsLijn.setLatLngs(ringen);
      if (!map.hasLayer(aanwijsLijn)) aanwijsLijn.addTo(map);
    }
  }

  let muisBeeldje = null;
  map.on('mousemove', (e) => {
    if (!zichtbaar()) return wijsAan(-1);
    cancelAnimationFrame(muisBeeldje);
    muisBeeldje = requestAnimationFrame(() => wijsAan(pandOp(e.latlng)));
  });
  map.on('mouseout', () => { cancelAnimationFrame(muisBeeldje); wijsAan(-1); });

  // ── Legenda en buurtvlakken ─────────────────────────────────────────────

  function werkLegendaBij() {
    const legenda = document.getElementById('legend');
    legenda.querySelector('.legenda-gebouwen')?.remove();
    if (!st.aan || !st.veld) return;
    const { naam } = Gebouwen.doelgroep(st.veld);
    const tekst = map.getZoom() < cfg.vanafZoom ? 'Zoom in om de gebouwen te zien.'
      : !naam ? 'Deze variabele hoort niet bij een soort gebouw, dus alle gebouwen zijn wit.'
      : isPercentageVeld(st.veld)
        ? `Per buurt is zo'n deel van de ${naam} gekleurd als het percentage, geteld per adres. Welke dat zijn is willekeurig gekozen: het zijn geen echte adressen.`
        : naam === 'gebouwen' ? 'Alle gebouwen hebben de kleur van hun buurt.'
        : `Alleen ${naam} hebben de kleur van hun buurt; de andere gebouwen zijn wit.`;
    legenda.append(maak('p', { className: 'legenda-gebouwen', innerHTML: `<b>Gebouwen:</b> ${tekst}` }));
  }

  let wasZichtbaar = false;
  function werkWeergaveBij() {
    wasZichtbaar = zichtbaar();
    window.appData.choroplethLayer?.resetStyle();  // de vlakken worden lichter of weer gewoon
    werkLegendaBij();
    if (!wasZichtbaar) wijsAan(-1);
  }
  map.on('zoomend', () => { if (zichtbaar() !== wasZichtbaar) werkWeergaveBij(); else werkLegendaBij(); });

  // ── Bediening ───────────────────────────────────────────────────────────

  return {
    isAan: () => st.aan,
    vlakFactor: () => zichtbaar() ? cfg.vlakFactor : 1,

    /** Na elke nieuwe kaartkleuring: zelfde jaar, variabele en klassekleuren voor de gebouwen. */
    werkBij(fc, veld, kleurVan) {
      Object.assign(st, { fc, veld, kleurVan });
      kleurPanden();
      werkLegendaBij();
    },

    async zetAan(aan) {
      st.aan = aan;
      if (aan && !st.g) {
        try {
          bereidVoor(await Gebouwen.laad());
        } catch (fout) {
          console.error(fout);
          st.aan = false;
          window.toonMelding('De gebouwen konden niet geladen worden.');
          return;
        }
        if (!st.aan) return;  // tijdens het laden weer uitgezet
      }
      if (aan) { kleurPanden(); laag.addTo(map); } else laag.remove();
      werkWeergaveBij();
      if (aan && map.getZoom() < cfg.vanafZoom) window.toonMelding('Zoom in om de gebouwen te zien.');
    },
  };
})();
window.gebouwenKaart = gebouwenKaart;


// ============================================================================
// SPLIT-SCREEN — Aangewezen buurt ook in de andere kaart tonen
// ============================================================================

let onderdrukHoverBericht = false;  // berichten die wij zelf veroorzaken niet terugsturen

function stuurNaarAndereKaart(bericht) {
  if (!window.isSplitScreenPane || onderdrukHoverBericht || bericht.identity === null) return;
  window.parent.postMessage({ ...bericht, panelId: window.splitScreenPanelId }, '*');
}

/** Voer een actie uit zonder dat de hover-gebeurtenissen die ze veroorzaakt worden doorgestuurd. */
function zonderTerugsturen(actie, ms) {
  onderdrukHoverBericht = true;
  try { actie(); } finally { setTimeout(() => { onderdrukHoverBericht = false; }, ms); }
}

window.addEventListener('message', ({ data }) => {
  if (data?.type === 'heerlen-set-hover' && data.identity) {
    const laag = window.appData.choroplethLayer?.getLayers().find(l => heeftIdentiteit(l.feature, data.identity));
    if (laag) zonderTerugsturen(() => { laag.openPopup(); toonTrendgrafiek(laag.feature); }, 350);
  } else if (data?.type === 'heerlen-clear-hover') {
    zonderTerugsturen(() => { map.closePopup(); planVerbergTrend(); }, 250);
  }
});


// ============================================================================
// HERPROJECTIE — Eigen bestanden in RD-coördinaten (meters) omzetten naar WGS84
// ============================================================================

// proj4 komt van een CDN; zonder proj4 blijven de coördinaten zoals ze zijn
window.proj4?.defs('EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 ' +
  '+k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs');

/** Coördinaten groter dan 1000 kunnen geen graden zijn, dus het zijn RD-meters. */
const isRdGeometrie = (geom) => geom.coordinates.flat(Infinity).some(n => Math.abs(n) > 1000);

function herprojecteer(coordinaten) {
  return typeof coordinaten[0] === 'number'
    ? proj4('EPSG:28992', 'EPSG:4326', coordinaten)
    : coordinaten.map(herprojecteer);
}

window.herprojecteerAlsNodig = function (fc) {
  if (!window.proj4) return fc;
  for (const f of fc.features) {
    if (f.geometry?.coordinates && isRdGeometrie(f.geometry)) f.geometry.coordinates = herprojecteer(f.geometry.coordinates);
  }
  return fc;
};
