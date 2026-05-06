// Importer: ondersteunt GeoJSON en CSV (basis lat/lon) voor de proefversie

window.handleImportFile = async function(file, ctx){
  const name = file.name.toLowerCase();
  const text = await file.text();
  // Als de tekst op GeoJSON lijkt
  if (name.endsWith('.geojson') || text.trim().startsWith('{')){
    try{
      const fc = JSON.parse(text);
      const layer = L.geoJSON(fc).addTo(ctx.dataLayer);
      try{ map.fitBounds(layer.getBounds()); }catch(e){}

      // App-status + D3-koppelingen
      window.appData = window.appData || {};
      if(window.appData.compareMode && window.appData.lastFC){
        window.appData.compareFC = fc;
        window.appData.compareMode = false;
        const sel = document.getElementById('field-select');
        const field = sel?.value;
        if(window.createCompareCharts && field){
          window.createCompareCharts(window.appData.lastFC, window.appData.compareFC, field);
        } else {
          alert('Vergelijkmodus: tweede bestand geladen. Kies eerst een variabele in het keuzemenu.');
        }
      } else {
        window.appData.lastFC = fc;
        if(window.populateFieldSelect) window.populateFieldSelect(fc);
      }
      return;
    }catch(err){
      console.error('Fout bij het parsen van GeoJSON-tekst', err);
      alert('Fout bij parsen van GeoJSON.');
      return;
    }
  }

  if (name.endsWith('.csv') || name.endsWith('.txt')){
    // Eenvoudige CSV-parsing: verwacht lat/lon- of lon/lat-kolommen
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
            alert('Vergelijkmodus: tweede bestand geladen. Kies eerst een variabele in het keuzemenu.');
          }
        } else {
          window.appData.lastFC = fc;
          if(window.populateFieldSelect) window.populateFieldSelect(fc);
        }

        return;
    }

    if(name.endsWith('.zip')){
        alert('Zip-bestanden worden in deze frontend-only versie niet ondersteund. Gebruik GeoJSON of CSV.');
      return;
      }
  }

      alert('Bestandstype niet ondersteund door de importer van de proefversie.');
};
