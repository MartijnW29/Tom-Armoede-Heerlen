// Importer stub: supports GeoJSON and CSV (basic lat/lon) for MVP

window.handleImportFile = async function(file, ctx){
  const name = file.name.toLowerCase();
  const text = await file.text();

  if (name.endsWith('.geojson') || text.trim().startsWith('{')){
    const fc = JSON.parse(text);
    const layer = L.geoJSON(fc).addTo(ctx.dataLayer);
    try{ map.fitBounds(layer.getBounds()); }catch(e){}

    // App state + D3 hooks
    window.appData = window.appData || {};
    if(window.appData.compareMode && window.appData.lastFC){
      window.appData.compareFC = fc;
      window.appData.compareMode = false;
      // use selected field
      const sel = document.getElementById('field-select');
      const field = sel?.value;
      if(window.createCompareCharts && field){
        window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, field);
      } else {
        alert('Compare-mode: tweede bestand geladen. Kies eerst een variabele in het dropdown-menu.');
      }
    } else {
      // standaard: stel dit dataset in als lastFC en populeer fields
      window.appData.lastFC = fc;
      if(window.populateFieldSelect) window.populateFieldSelect(fc);
    }

    return;
  }

  if (name.endsWith('.csv') || name.endsWith('.txt')){
    // naive CSV parse: expect lat,lon or lon,lat columns
    const rows = text.split('\n').map(r=>r.split(','));
    // find lat/lon headers
    const headers = rows[0].map(h=>h.trim().toLowerCase());
    const latIdx = headers.indexOf('lat');
    const lonIdx = headers.indexOf('lon') >=0 ? headers.indexOf('lon') : headers.indexOf('lng');
    if (latIdx>=0 && lonIdx>=0){
      const feats = rows.slice(1).filter(r=>r.length>Math.max(latIdx,lonIdx)).map(r=>({
        type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:[+r[lonIdx], +r[latIdx]] }
      }));
      const fc = { type:'FeatureCollection', features: feats };
        const layer = L.geoJSON(fc).addTo(ctx.dataLayer);
        try{ map.fitBounds(layer.getBounds()); }catch(e){}

        window.appData = window.appData || {};
        if(window.appData.compareMode && window.appData.lastFC){
          window.appData.compareFC = fc;
          window.appData.compareMode = false;
          const sel = document.getElementById('field-select');
          const field = sel?.value;
          if(window.createCompareCharts && field){
            window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, field);
          } else {
            alert('Compare-mode: tweede bestand geladen. Kies eerst een variabele in het dropdown-menu.');
          }
        } else {
          window.appData.lastFC = fc;
          if(window.populateFieldSelect) window.populateFieldSelect(fc);
        }

        return;
    }
  }

  alert('Bestandstype niet ondersteund door MVP importer.');
};
