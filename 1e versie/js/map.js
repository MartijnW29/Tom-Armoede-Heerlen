// Kaart-hulpfuncties / choropleethulpen (stub)
// Choropleethulpen (D3 + Leaflet)

function getNumericValues(fc, field){
  const vals = fc.features.map(f=>{
    const v = f.properties?.[field];
    return (v===null||v===undefined||v==='')? null : +v;
  }).filter(v=>v!==null && !isNaN(v));
  return vals;
}

// Controleer of één numerieke waarde door het actieve filter komt
function valuePassesFilter(v, valuesAll, filter){
  if(filter==null) return true;
  if(v===null||v===undefined||isNaN(+v)) return false;
  const num = +v;
  if(typeof filter.min === 'number' && num < filter.min) return false;
  if(typeof filter.max === 'number' && num > filter.max) return false;
  if(typeof filter.lowPct === 'number' || typeof filter.highPct === 'number'){
    // Bereken percentielen op basis van alle waarden
    const sorted = (valuesAll||[]).slice().sort((a,b)=>a-b);
    if(sorted.length===0) return true;
    const lowerIdx = Math.floor((filter.lowPct||0) / 100 * (sorted.length-1));
    const upperIdx = Math.floor((filter.highPct||100) / 100 * (sorted.length-1));
    const lowerVal = sorted[Math.max(0, lowerIdx)];
    const upperVal = sorted[Math.min(sorted.length-1, upperIdx)];
    if(typeof filter.lowPct === 'number' && num < lowerVal) return false;
    if(typeof filter.highPct === 'number' && num > upperVal) return false;
  }
  return true;
}

// Bouw een gefilterde FeatureCollection-variant (zonder geometrieën diep te kopiëren)
function featuresPassingFilter(fc, field, filter){
  if(!filter) return fc.features;
  const all = getNumericValues(fc, field);
  return fc.features.filter(f => valuePassesFilter(f.properties?.[field], all, filter));
}

function buildFeaturePopup(feature, field, activeFilter, valuesAll){
  const p = feature.properties || {};
  const v = p[field];
  const passes = valuePassesFilter(v, valuesAll, activeFilter);
  const preferredKeys = [];
  if(field && p[field] !== undefined) preferredKeys.push(field);
  ['naam','name','buurtnaam','wijknaam','id','code','gemeentenaam'].forEach(k=>{
    if(k !== field && p[k] !== undefined && !preferredKeys.includes(k)) preferredKeys.push(k);
  });

  const rows = [];
  rows.push(`<b>Geselecteerd gebied</b>`);
  if(!passes) rows.push(`<i>Dit gebied valt buiten de actieve filter.</i>`);
  preferredKeys.forEach(k=>{
    rows.push(`<b>${k}</b>: ${p[k]}`);
  });
  if(preferredKeys.length === 0){
    rows.push(`<i>Geen relevante velden gevonden voor deze selectie.</i>`);
  }
  return rows.join('<br/>');
}

window.applyChoropleth = function(fc, field, opts={classes:7, method:'quantile', palette:'viridis'}){
  if(!fc || !fc.features || fc.features.length===0) return;
  // Verwijder de vorige laag
  if(window.appData.choroplethLayer){ window.appData.dataLayer.removeLayer(window.appData.choroplethLayer); window.appData.choroplethLayer = null; }

  const values = getNumericValues(fc, field);
  if(values.length===0){ alert('Geen numerieke waarden gevonden voor ' + field); return; }

  // Probeer, indien mogelijk, altijd 5 legendarangen te maken (maar niet meer dan unieke waarden)
    const n = opts.classes || 7;
  // Kies palet
  function paletteColors(name, count){
    switch((name||'').toLowerCase()){
      case 'rdylgn': return d3.quantize(d3.interpolateRdYlGn, count);
      case 'blues': return d3.quantize(d3.interpolateBlues, count);
      case 'oranges': return d3.quantize(d3.interpolateOranges, count);
      case 'viridis':
      default: return d3.quantize(d3.interpolateViridis, count);
    }
  }

  const colors = paletteColors(opts.palette, n);

  // Houd rekening met het actieve filter: window.appData.filter
  const activeFilter = window.appData && window.appData.filter ? window.appData.filter : null;
  const valuesAll = values;
  const filteredFeatures = featuresPassingFilter(fc, field, activeFilter);
  const valuesFiltered = filteredFeatures.map(f=> +f.properties[field]).filter(v=>!isNaN(v));
  const useValues = valuesFiltered.length? valuesFiltered : valuesAll;

  let scale;
  if(opts.method === 'quantile'){
    scale = d3.scaleQuantile().domain(useValues).range(colors);
  } else if(opts.method === 'jenks'){
    const breaks = jenks(useValues, n); // geeft n+1 grenzen terug
    const thresholds = breaks.slice(1, -1);
    scale = d3.scaleThreshold().domain(thresholds).range(colors);
  } else { // equal interval
    const min = d3.min(useValues), max = d3.max(useValues);
    scale = d3.scaleQuantize().domain([min, max]).range(colors);
  }

  const opacity = typeof opts.opacity === 'number' ? opts.opacity : 0.8;
  function styleFeature(feat){
    const v = feat.properties?.[field];
    const included = valuePassesFilter(v, valuesAll, activeFilter);
    if(!included) return { color:'#999', weight:0.4, fillOpacity:0.18, fillColor:'#f0f0f0' };
    const fill = (v===null||v===undefined||v==='')? '#eee' : getColorForValue(scale, +v);
    // Bescherm tegen undefined uit de schaal met een veilige fallback
    const safeFill = fill || colors[0];
    return { color:'#333', weight:0.6, fillOpacity:opacity, fillColor: safeFill };
  }

  const layer = L.geoJSON(fc, { style: styleFeature, onEachFeature: (f,l)=>{
    // Toon alleen de relevante info van het aangeklikte gebied
    l.on('click', ()=>{
      const html = buildFeaturePopup(f, field, activeFilter, valuesAll);
      l.bindPopup(html).openPopup();
    });
  }}).addTo(window.appData.dataLayer);

  window.appData.choroplethLayer = layer;

  // Pas het kaartbeeld aan
  try{ map.fitBounds(layer.getBounds(), { maxZoom: 14 }); } catch(e){}

  // Legenda
  buildLegend(scale, n, field);
}

// Jenks-berekening voor natuurlijke breekpunten
function jenks(data, n_classes){
  // data: numerieke array
  const dataSorted = data.slice().sort((a,b)=>a-b);
  const n_data = dataSorted.length;
  if(n_classes <= 1) return [dataSorted[0], dataSorted[dataSorted.length-1]];

  // Initialiseer matrices
  const mat1 = Array(n_data+1).fill(0).map(()=>Array(n_classes+1).fill(0));
  const mat2 = Array(n_data+1).fill(0).map(()=>Array(n_classes+1).fill(0));

  for(let i=1;i<=n_classes;i++){
    mat1[0][i] = 1;
    mat2[0][i] = 0;
    for(let j=1;j<=n_data;j++){
      mat2[j][i] = Infinity;
    }
  }

  let v = 0.0;
  for(let l=2;l<=n_data;l++){
    let s1 = 0.0, s2 = 0.0, w = 0.0;
    for(let m=1; m<=l; m++){
      const i3 = l - m + 1;
      const val = dataSorted[i3-1];
      s2 += val * val;
      s1 += val;
      w += 1;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if(i4 !== 0){
        for(let j=2; j<=n_classes; j++){
          if(mat2[l][j] >= (v + mat2[i4][j-1])){
            mat1[l][j] = i3;
            mat2[l][j] = v + mat2[i4][j-1];
          }
        }
      }
    }
    mat1[l][1] = 1;
    mat2[l][1] = v;
  }

  const k = n_data;
  const kclass = Array(n_classes+1).fill(0);
  kclass[n_classes] = dataSorted[n_data-1];
  kclass[0] = dataSorted[0];
  let countNum = n_classes;
  let idx = k;
  while(countNum > 1){
    const id = mat1[idx][countNum] - 2;
    kclass[countNum-1] = dataSorted[id+1];
    idx = mat1[idx][countNum] - 1;
    countNum -= 1;
  }
  return kclass;
}

// Bouw samengevoegde ranges uit een schaal (compressie van identieke breekpunten)
function getRangesFromScale(s){
  const colors = s.range();
  const quantiles = s.quantiles ? s.quantiles() : null;
  const domain = s.domain ? s.domain() : [0,0];
  const domainMin = d3.min(domain);
  const domainMax = d3.max(domain);
  const breaks = quantiles ? [domainMin].concat(quantiles).concat([domainMax]) : [domainMin, domainMax];
  const ranges = [];
  let idx = 0;
  while(idx < colors.length){
    const lo = breaks[idx];
    let k = idx;
    while(k+1 < colors.length && breaks[k+1] === breaks[idx+1]) k++;
    const hi = breaks[k+1];
    const color = colors[k];
    ranges.push({ lo: lo, hi: hi, color: color });
    idx = k+1;
  }
  return ranges;
}

// Krijg de kleur voor een waarde, voorkeur voor de hoogst mogelijke klasse bij exacte grenzen
function getColorForValue(scale, v){
  if(v===null||v===undefined||isNaN(+v)) return null;
  const num = +v;
  try{
    const ranges = getRangesFromScale(scale);
    for(let i=ranges.length-1;i>=0;i--){
      const r = ranges[i];
      if(num >= r.lo && num <= r.hi) return r.color;
    }
  }catch(e){/* ignore */}
  // fallback op scale
  try{ const c = scale(num); return c || (scale.range && scale.range()[0]); }catch(e){ return (scale.range && scale.range()[0]) || '#eee'; }
}

function buildLegend(scale, n, field){
  const legend = document.getElementById('legend');
  if(!legend) return;
  legend.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = `Legenda — ${field}`;
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '6px';
  legend.appendChild(title);

  const swatches = document.createElement('div');
  swatches.style.display = 'flex';
  swatches.style.flexDirection = 'column';
  swatches.style.gap = '4px';
  const ranges = getRangesFromScale(scale);

  // Bouw getoonde regels uit de samengevoegde ranges
  for(const r of ranges){
    const row = document.createElement('div');
    row.style.display='flex'; row.style.alignItems='center';
    const sw = document.createElement('div'); sw.style.width='28px'; sw.style.height='14px'; sw.style.background=r.color; sw.style.border='1px solid #ccc'; sw.style.marginRight='8px';
    const label = document.createElement('div'); label.style.fontSize='12px';
    const loRound = Math.round(r.lo);
    const hiRound = Math.round(r.hi);
    label.textContent = `${loRound} → ${hiRound}`;
    row.appendChild(sw); row.appendChild(label);
    swatches.appendChild(row);
  }
  legend.appendChild(swatches);
}

// Hulpfunctie om de legenda te wissen
window.clearLegend = function(){ const legend = document.getElementById('legend'); if(legend) legend.innerHTML=''; }

// Zorg dat appData bestaat
window.appData = window.appData || {};

// PROJ4-definitie voor Amersfoort / RD (EPSG:28992)
if(typeof proj4 !== 'undefined'){
  try{
    proj4.defs('EPSG:28992', '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs');
  }catch(e){/* negeren als al gedefinieerd */}
}

// Detecteer of geometriecoördinaten op projectiecoördinaten lijken (grote getallen)
function coordsAreProjected(geom){
  // Zoek recursief naar coördinaten > 1000; waarschijnlijk meters (RD)
  let found = false;
  function walk(c){
    if(found) return;
    if(Array.isArray(c)){
      if(typeof c[0] === 'number' && typeof c[1] === 'number'){
        if(Math.abs(c[0])>1000 || Math.abs(c[1])>1000) found = true;
      } else {
        c.forEach(walk);
      }
    }
  }
  walk(geom.coordinates);
  return found;
}

function reprojectGeometry(geom){
  if(!proj4) return geom;
  const reprojectPoint = (pt)=>{
    const p = proj4('EPSG:28992','EPSG:4326', pt);
    return [p[0], p[1]];
  };
  if(geom.type === 'Point'){
    geom.coordinates = reprojectPoint(geom.coordinates);
  } else if(geom.type === 'MultiPoint' || geom.type === 'LineString'){
    geom.coordinates = geom.coordinates.map(reprojectPoint);
  } else if(geom.type === 'Polygon'){
    geom.coordinates = geom.coordinates.map(r => r.map(reprojectPoint));
  } else if(geom.type === 'MultiPolygon'){
    geom.coordinates = geom.coordinates.map(p => p.map(r => r.map(reprojectPoint)));
  }
  return geom;
}

// Herprojecteer de FeatureCollection van RD -> WGS84 indien nodig
window.reprojectIfNeeded = function(fc){
  if(!fc || !fc.features || !proj4) return fc;
  for(const f of fc.features){
    if(f.geometry && coordsAreProjected(f.geometry)){
      f.geometry = reprojectGeometry(f.geometry);
    }
  }
  return fc;
}
