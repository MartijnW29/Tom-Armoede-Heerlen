// D3-visualisaties (Nederlands, onderhoudsvriendelijk)
// - Histogram voor één dataset
// - Compare-mode: twee histogrammen naast elkaar

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
  return fc.features.map(f=>{
    const v = f.properties[field];
    return isNumber(v)? +v : null;
  }).filter(v=>v!==null);
}

// Populeer field-select in sidebar (Nederlands)
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

// Clear charts area
function clearCharts(){
  const c = document.getElementById('charts');
  if(c) c.innerHTML = '';
}

// Maak een histogram (Nederlands labels)
window.createHistogramFromGeoJSON = function(fc, field){
  clearCharts();
  const values = getValues(fc, field);
  if(!values.length) { alert('Geen numerieke waarden gevonden voor veld: ' + field); return; }

  const container = document.getElementById('charts');
  const title = document.createElement('h3');
  title.textContent = `Histogram — ${field}`;
  container.appendChild(title);

  const width = Math.min(600, container.clientWidth || 600);
  const height = 240;
  const margin = {top:20,right:20,bottom:30,left:40};

  const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('role','img')
    .attr('aria-label', `Histogram van ${field}`);

  const x = d3.scaleLinear()
    .domain(d3.extent(values)).nice()
    .range([margin.left, width - margin.right]);

  const bins = d3.bin().domain(x.domain()).thresholds(20)(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)]).nice()
    .range([height - margin.bottom, margin.top]);

  const bar = svg.append('g')
    .attr('fill','#4c78a8')
    .selectAll('rect')
    .data(bins)
    .join('rect')
      .attr('x', d => x(d.x0) + 1)
      .attr('y', d => y(d.length))
      .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr('height', d => y(0) - y(d.length));

  const xAxis = g => g
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.append('text')
      .attr('x', width - margin.right)
      .attr('y', -6)
      .attr('fill', '#000')
      .attr('text-anchor','end')
      .text(field));

  const yAxis = g => g
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .call(g => g.append('text')
      .attr('x',6)
      .attr('y', margin.top)
      .attr('dy','0.75em')
      .attr('fill','#000')
      .attr('text-anchor','start')
      .text('Aantal'));

  svg.append('g').call(xAxis);
  svg.append('g').call(yAxis);
}

// Compare-mode: twee histogrammen naast elkaar
window.createCompareCharts = function(fcA, fcB, field){
  clearCharts();
  const valuesA = getValues(fcA, field);
  const valuesB = getValues(fcB, field);
  if(!valuesA.length || !valuesB.length){ alert('Geen numerieke waarden in één van de datasets voor veld: ' + field); return; }

  const container = document.getElementById('charts');
  const title = document.createElement('h3');
  title.textContent = `Compare-mode — ${field}`;
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

  makeSmall(valuesA,'Dataset A','#4c78a8');
  makeSmall(valuesB,'Dataset B','#e45756');
}

// Accessibility: eenvoudige Nederlandse instructie
window.d3ChartsHelp = function(){
  return 'Gebruik het dropdown-menu om een numerieke variabele te kiezen. Klik "Toon histogram" om verdeling te zien. Voor compare-mode: klik "Start compare-mode" en upload daarna het tweede bestand.';
}
