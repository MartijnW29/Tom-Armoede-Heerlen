// D3-visualisaties (Nederlands, onderhoudsvriendelijk)
// - Vergelijkmodus: twee grafieken naast elkaar

// Hulpfuncties
function isNumber(v){ return v!==null && v!==undefined && !isNaN(+v); }

function extractNumericFields(fc){
  const props = fc.features[0]?.properties || {};
  return Object.keys(props).filter(k => {
    for(let i=0;i<Math.min(20,fc.features.length);i++){
      const v = fc.features[i].properties[k];
      if(v===null||v===undefined) continue;
      return isNumber(v);
    }
    return false;
  });
}

function getValues(fc, field){
  const all = fc.features.map(f=>{
    const v = f.properties[field];
    return isNumber(v)? +v : null;
  }).filter(v=>v!==null);
  // Pas indien aanwezig het actieve filter toe
  const filter = window.appData && window.appData.filter ? window.appData.filter : null;
  if(!filter) return all;
  // compute percentiles if needed
  const sorted = all.slice().sort((a,b)=>a-b);
  const lowerIdx = Math.floor((filter.lowPct||0)/100 * (sorted.length-1));
  const upperIdx = Math.floor((filter.highPct||100)/100 * (sorted.length-1));
  const lowerVal = sorted[Math.max(0, lowerIdx)];
  const upperVal = sorted[Math.min(sorted.length-1, upperIdx)];
  return all.filter(v=>{
    if(typeof filter.min === 'number' && v < filter.min) return false;
    if(typeof filter.max === 'number' && v > filter.max) return false;
    if(typeof filter.lowPct === 'number' && v < lowerVal) return false;
    if(typeof filter.highPct === 'number' && v > upperVal) return false;
    return true;
  });
}

// Vul de veldkeuze in de zijbalk
window.populateFieldSelect = function(fc){
  const sel = document.getElementById('field-select');
  if(!sel) return;
  // clear
  sel.innerHTML = '<option value="">-- geen --</option>';
  if(!fc || !fc.features || fc.features.length===0) return;
  const numeric = extractNumericFields(fc);
  numeric.forEach(f=>{
    const o = document.createElement('option');
    o.value = f; o.textContent = f;
    sel.appendChild(o);
  });
}

// Wis het grafiekvlak
function clearCharts(){
  const c = document.getElementById('charts');
  if(c) c.innerHTML = '';
}

// Vergelijkmodus: twee grafieken naast elkaar
window.createCompareCharts = function(fcA, fcB, field){
  clearCharts();
  const valuesA = getValues(fcA, field);
  const valuesB = getValues(fcB, field);
  if(!valuesA.length || !valuesB.length){ alert('Geen numerieke waarden gevonden in één van de datasets voor veld: ' + field); return; }

  const container = document.getElementById('charts');
  const title = document.createElement('h3');
  title.textContent = `Vergelijkmodus — ${field}`;
  container.appendChild(title);

  const wrap = document.createElement('div');
  wrap.style.display='flex';
  wrap.style.gap='12px';
  container.appendChild(wrap);

  const makeSmall = (values, label, color) => {
    const div = document.createElement('div');
    wrap.appendChild(div);
    const svg = d3.select(div).append('svg').attr('width',300).attr('height',200);
    const margin={top:20,right:10,bottom:30,left:30}, w=300, h=200;
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, w-margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(15)(values);
    const y = d3.scaleLinear().domain([0,d3.max(bins,d=>d.length)]).range([h-margin.bottom, margin.top]);
    svg.append('g').attr('fill',color).selectAll('rect').data(bins).join('rect')
      .attr('x',d=>x(d.x0)+1)
      .attr('y',d=>y(d.length))
      .attr('width',d=>Math.max(0,x(d.x1)-x(d.x0)-1))
      .attr('height',d=>y(0)-y(d.length));
    svg.append('g').attr('transform',`translate(0,${h-margin.bottom})`).call(d3.axisBottom(x).ticks(4));
    svg.append('g').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4));
    const lab = document.createElement('div'); lab.textContent = label; lab.style.textAlign='center'; div.appendChild(lab);
  }

  makeSmall(valuesA,'Gegevensset A','#4c78a8');
  makeSmall(valuesB,'Gegevensset B','#e45756');
}

// Toegankelijkheid: eenvoudige Nederlandse instructie
window.d3ChartsHelp = function(){
  return 'Gebruik het keuzemenu om een numerieke variabele te kiezen. Voor vergelijkmodus: klik "Start vergelijkmodus" en upload daarna het tweede bestand.';
}
