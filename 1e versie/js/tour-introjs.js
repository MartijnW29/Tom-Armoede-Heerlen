// Provide default steps if none exist (previous custom tour defined these)
window.tourSteps = window.tourSteps || [
  { id: 'welcome', title: 'Welkom', content: 'Welkom. Deze korte rondleiding laat rustig de belangrijkste bedieningselementen zien.' },
  { id: 'sidebar', title: 'Zijbalk', content: 'Hier staan legenda, variabele keuze en filters.' },
  { id: 'year-slider', title: 'Jaarfilter', content: 'Met deze schuifregelaar selecteer je een jaar om op te filteren.' },
  { id: 'controls', title: 'Variabelen', content: 'Voeg hier extra variabelen toe en pas kleuren/opacity aan.' },
  { id: 'map', title: 'Kaart', content: 'De kaart toont de choropleth. Hover over een gebied voor een mini-grafiek.', center: [50.8889,5.9794], zoom: 12 },
  { id: 'end', title: 'Klaar', content: 'Dat is alles — je kunt de rondleiding altijd opnieuw starten.' }
];

(function(){
  function buildSteps(){
    const out = [];
    (window.tourSteps||[]).forEach(s=>{
      const selector = s.selector || ('#'+s.id);
      const el = document.querySelector(selector);
      const step = { intro: s.content||'', title: s.title||'' };
      if (el) step.element = selector;
      if (s.position) step.position = s.position;
      if (s.disableInteraction) step.disableInteraction = !!s.disableInteraction;
      // custom fields supported by our adapter (not intro.js native)
      if (s.center) step.__center = s.center;
      if (s.zoom) step.__zoom = s.zoom;
      if (s.fitBounds) step.__fitBounds = s.fitBounds;
      out.push(step);
    });
    return out;
  }

  function dispatchEvent(name, detail){
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch(e){}
    try { if (window.dataLayer && typeof window.dataLayer.push === 'function') window.dataLayer.push(Object.assign({ event: name }, detail || {})); } catch(e){}
    try { if (window.ga && typeof window.ga === 'function') window.ga('send', 'event', 'tour', name, JSON.stringify(detail || {})); } catch(e){}
    try { console.log('tour.event', name, detail || {}); } catch(e){}
  }

  window.startIntroTour = function(){
    if (typeof introJs !== 'function' && typeof introJs === 'undefined') return;
    const steps = buildSteps();
    const intro = introJs();
    intro.setOptions({
      steps: steps,
      showProgress: true,
      showBullets: true,
      exitOnOverlayClick: false,
      exitOnEsc: true,
      disableInteraction: false,
      scrollToElement: true,
      nextLabel: 'Volgende',
      prevLabel: 'Vorige',
      doneLabel: 'Klaar'
    });

    const constructedSteps = steps.slice();

    intro.onstart(function(){ dispatchEvent('tour:start', {}); });

    intro.onbeforechange(function(target){
      const idx = (typeof intro._currentStep === 'number') ? intro._currentStep : null;
      const stepDef = (idx !== null && constructedSteps[idx]) ? constructedSteps[idx] : null;
      try {
        const m = (window.appData && window.appData.map) || window.map;
        if (m && stepDef) {
          if (Array.isArray(stepDef.__center) && stepDef.__center.length === 2) {
            const z = (typeof stepDef.__zoom === 'number') ? stepDef.__zoom : (window.APP_CONFIG && window.APP_CONFIG.standaardZoom) || 12;
            if (typeof m.setView === 'function') m.setView(stepDef.__center, z, { animate: true });
          }
          if (Array.isArray(stepDef.__fitBounds) && stepDef.__fitBounds.length) {
            if (typeof m.fitBounds === 'function') m.fitBounds(stepDef.__fitBounds, { animate: true, padding: [20,20] });
          }
        }
      } catch (e) { /* ignore map errors */ }
      dispatchEvent('tour:step:beforechange', { index: idx, step: stepDef });
    });

    intro.onchange(function(target){
      try { document.querySelectorAll('.tour-highlight').forEach(el=>el.classList.remove('tour-highlight')); } catch(e) {}
      const idx = (typeof intro._currentStep === 'number') ? intro._currentStep : null;
      const stepDef = (idx !== null && constructedSteps[idx]) ? constructedSteps[idx] : null;
      if (stepDef && stepDef.element) {
        try { const tgt = document.querySelector(stepDef.element); if (tgt && tgt.classList) tgt.classList.add('tour-highlight'); } catch(e) {}
      }
      dispatchEvent('tour:step:changed', { index: idx, step: stepDef });
    });

    intro.onexit(function(){ try { document.querySelectorAll('.tour-highlight').forEach(el=>el.classList.remove('tour-highlight')); } catch(e){}; dispatchEvent('tour:exit', {}); });
    intro.oncomplete(function(){ try { document.querySelectorAll('.tour-highlight').forEach(el=>el.classList.remove('tour-highlight')); } catch(e){}; dispatchEvent('tour:complete', {}); });

    intro.start();
  };

  // keep compatibility
  window.startTour = window.startIntroTour;

  document.addEventListener('DOMContentLoaded', ()=>{
    const b = document.getElementById('start-tour'); if (b) b.addEventListener('click', ()=>{ window.startIntroTour(); try{sessionStorage.setItem('tourStarted','1')}catch(e){} });
    const yes = document.getElementById('tour-yes'); if (yes) yes.onclick = ()=>{ const modal = document.getElementById('tour-modal'); if (modal) modal.hidden=true; window.startIntroTour(); try{sessionStorage.setItem('tourStarted','1')}catch(e){} };
    const no = document.getElementById('tour-no'); if (no) no.onclick = ()=>{ const modal = document.getElementById('tour-modal'); if (modal) modal.hidden=true; try{sessionStorage.setItem('tourDeclined','1')}catch(e){} };
  });
})();
