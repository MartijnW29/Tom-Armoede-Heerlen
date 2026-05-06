// map helpers / choropleth helpers (stub)
// Choropleth helpers (D3 + Leaflet)

function getNumericValues(fc, field){
  const vals = fc.features.map(f=>{
    const v = f.properties?.[field];
    return (v===null||v===undefined||v==='')? null : +v;
  }).filter(v=>v!==null && !isNaN(v));
  return vals;
}

window.applyChoropleth = function(fc, field, opts={classes:7, method:'quantile', palette:'viridis'}){
  if(!fc || !fc.features || fc.features.length===0) return;
  // remove previous layer
  if(window.appData.choroplethLayer){ window.appData.dataLayer.removeLayer(window.appData.choroplethLayer); window.appData.choroplethLayer = null; }

  const values = getNumericValues(fc, field);
  if(values.length===0){ alert('Geen numerieke waarden gevonden voor ' + field); return; }

  const n = opts.classes || 7;
  // choose palette
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

  let scale;
  if(opts.method === 'quantile'){
    scale = d3.scaleQuantile().domain(values).range(colors);
  } else if(opts.method === 'jenks'){
    const breaks = jenks(values, n); // returns n+1 breaks
    // thresholds for scaleThreshold should be n-1 values (exclude min and max)
    const thresholds = breaks.slice(1, -1);
    scale = d3.scaleThreshold().domain(thresholds).range(colors);
  } else { // equal interval
    const min = d3.min(values), max = d3.max(values);
    scale = d3.scaleQuantize().domain([min, max]).range(colors);
  }

  const opacity = typeof opts.opacity === 'number' ? opts.opacity : 0.8;
  function styleFeature(feat){
    const v = feat.properties?.[field];
    const fill = (v===null||v===undefined||v==='')? '#eee' : scale(+v);
    return { color:'#333', weight:0.6, fillOpacity:opacity, fillColor: fill };
  }

  const layer = L.geoJSON(fc, { style: styleFeature, onEachFeature: (f,l)=>{
    // popup: show properties (compact)
    const p = f.properties || {};
    const rows = Object.keys(p).slice(0,8).map(k=>`<b>${k}</b>: ${p[k]}`);
    l.bindPopup(rows.join('<br/>'));
  }}).addTo(window.appData.dataLayer);

  window.appData.choroplethLayer = layer;

  // fit view
  try{ map.fitBounds(layer.getBounds(), { maxZoom: 14 }); } catch(e){}

  // legend
  buildLegend(scale, n, field);
}

// Jenks natural breaks implementation
function jenks(data, n_classes){
  // data: numeric array
  const dataSorted = data.slice().sort((a,b)=>a-b);
  const n_data = dataSorted.length;
  if(n_classes <= 1) return [dataSorted[0], dataSorted[dataSorted.length-1]];

  // initialize matrices
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

  // for quantile scale, use quantiles
  const quantiles = scale.quantiles ? scale.quantiles() : null;
  const domainMin = d3.min(scale.domain());
  const domainMax = d3.max(scale.domain());

  for(let i=0;i<scale.range().length;i++){
    const color = scale.range()[i];
    const row = document.createElement('div');
    row.style.display='flex'; row.style.alignItems='center';
    const sw = document.createElement('div'); sw.style.width='28px'; sw.style.height='14px'; sw.style.background=color; sw.style.border='1px solid #ccc'; sw.style.marginRight='8px';
    const label = document.createElement('div'); label.style.fontSize='12px';
    let text;
    if(quantiles){
      const lo = i===0? domainMin : Math.round(quantiles[i-1]);
      const hi = i<quantiles.length? Math.round(quantiles[i]) : Math.round(domainMax);
      text = `${lo} → ${hi}`;
    } else {
      text = `${i+1}`;
    }
    label.textContent = text;
    row.appendChild(sw); row.appendChild(label);
    swatches.appendChild(row);
  }
  legend.appendChild(swatches);
}

// expose helper to clear legend
window.clearLegend = function(){ const legend = document.getElementById('legend'); if(legend) legend.innerHTML=''; }

// ensure appData exists
window.appData = window.appData || {};

// PROJ4 definition for Amersfoort / RD (EPSG:28992)
if(typeof proj4 !== 'undefined'){
  try{
    proj4.defs('EPSG:28992', '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs');
  }catch(e){/* ignore if already defined */}
}

// Detect whether geometry coordinates look projected (large numbers)
function coordsAreProjected(geom){
  // recursively find any numeric coordinate > 1000 -> likely meters (RD)
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

// Reproject featurecollection from RD -> WGS84 if needed
window.reprojectIfNeeded = function(fc){
  if(!fc || !fc.features || !proj4) return fc;
  for(const f of fc.features){
    if(f.geometry && coordsAreProjected(f.geometry)){
      f.geometry = reprojectGeometry(f.geometry);
    }
  }
  return fc;
}
