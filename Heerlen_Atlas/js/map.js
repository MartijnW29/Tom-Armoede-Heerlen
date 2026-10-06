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
};

const TRENDGRAFIEK_CONFIG = {
  breedte: 340, hoogte: 190,
  marge: { boven: 16, rechts: 14, onder: 36, links: 42 },
  verbergNaMs: 650,  // wachttijd voordat het paneel verdwijnt na het verlaten van een buurt
  // Velden die een buurt over de jaren heen herkenbaar maken (eerste gevulde wint)
  identiteitsvelden: ['code', 'id', 'buurtcode', 'wijkcode', 'buurtnaam', 'wijknaam', 'naam', 'name'],
};

// Lagen boven elkaar: ondergrond (200) < kleuren < gemeentegrens < info-venster (700).
// De grens laat de muis door naar de buurten eronder.
[['choroplethPane', 460, true], ['grensPane', 475, false]].forEach(([naam, z, muis]) => {
  Object.assign(map.createPane(naam).style, { zIndex: z, pointerEvents: muis ? '' : 'none' });
});


// ============================================================================
// WAARDEN EN FILTER
// ============================================================================

const isPercentageVeld = (veld) => /(percentage|perc\b|_pct|pct_|aandeel|%)/i.test(veld || '');

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

function tekenLegenda(breuken, kleuren, veld) {
  const titel = `Legenda: ${window.mooieVeldnaam(veld)}`;
  const rij = (kleur, tekst, extraKlasse = '') =>
    `<div class="legenda-rij ${extraKlasse}"><i style="background:${kleur}"></i><span>${tekst}</span></div>`;

  document.getElementById('legend').innerHTML = `<h3 title="${titel}">${titel}</h3>`
    + rij('#ccc', 'Geen data', 'is-geen-data')
    + kleuren.map((kleur, i) => rij(kleur, `${formatteerGetal(breuken[i], veld, 1)} – ${formatteerGetal(breuken[i + 1], veld, 1)}`)).join('');
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
window.toonChoropleth = function (fc, veld, { method = 'quantile', palette = 'rdylgn', opacity = 0.65, classes = 5, klassenFC } = {}) {
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

  const stijl = (feature) => {
    const waarde = feature.properties?.[veld];
    if (!waardePasseertFilter(waarde, alleWaarden, filter)) return KAART_CONFIG.buitenFilterStijl;
    if (waarde === null || waarde === '' || isNaN(+waarde)) return KAART_CONFIG.geenDataStijl;
    const klasse = breuken.slice(1, -1).findIndex(grens => +waarde < grens);
    return {
      color: KAART_CONFIG.randKleur, weight: KAART_CONFIG.randBreedte, fillOpacity: opacity,
      fillColor: kleuren[klasse === -1 ? kleuren.length - 1 : klasse],
    };
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
  tekenLegenda(breuken, kleuren, veld);
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
