// tour.js — polished, self-contained tour

window.tourSteps = window.tourSteps || [
  { id: 'welcome', title: 'Welkom', content: 'Welkom. Deze korte rondleiding laat rustig de belangrijkste bedieningselementen zien.' },
  { id: 'sidebar', title: 'Zijbalk', content: 'Hier staan legenda, variabele keuze en filters.' },
  { id: 'year-slider', title: 'Jaarfilter', content: 'Met deze schuifregelaar selecteer je een jaar om op te filteren.' },
  { id: 'controls', title: 'Variabelen', content: 'Voeg hier extra variabelen toe en pas kleuren/opacity aan.' },
  { id: 'map', title: 'Kaart', content: 'De kaart toont de choropleth. Hover over een gebied voor een mini-grafiek.' },
  { id: 'end', title: 'Klaar', content: 'Dat is alles — je kunt de rondleiding altijd opnieuw starten.' }
];

(function () {
  let idx = 0;
  let panel = null;

  function createUI() {
    if (panel) return panel;

    // overlay
    let overlay = document.getElementById('tour-ui-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tour-ui-overlay';
      overlay.className = 'tour-modal-overlay';
      document.body.appendChild(overlay);
    }

    // arrow
    let arrow = document.getElementById('tour-arrow');
    if (!arrow) {
      arrow = document.createElement('div');
      arrow.id = 'tour-arrow';
      arrow.className = 'tour-arrow';
      const head = document.createElement('div'); head.className = 'head'; arrow.appendChild(head);
      document.body.appendChild(arrow);
    }

    // panel
    panel = document.createElement('div');
    panel.className = 'tour-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');

    panel.innerHTML = `
      <div class="tour-steps" aria-hidden="true"></div>
      <h3 class="tour-title"></h3>
      <div class="tour-text"></div>
      <div class="tour-controls">
        <button class="tour-prev secondary">Vorige</button>
        <button class="tour-next">Volgende</button>
        <button class="tour-end secondary">Einde</button>
      </div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  function openPanel() {
    const p = createUI();
    document.getElementById('tour-ui-overlay').style.display = 'block';
    p.style.display = 'block';
    p.classList.add('show');
    p.focus?.();
    render();
  }

  function closePanel() {
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.remove('show');
    const overlay = document.getElementById('tour-ui-overlay');
    if (overlay) overlay.style.display = 'none';
    const arrow = document.getElementById('tour-arrow'); if (arrow) { arrow.style.display = 'none'; arrow.classList.remove('pulse'); }
    clearHighlights();
  }

  function render() {
    const p = createUI();
    const step = window.tourSteps[idx];
    p.querySelector('.tour-title').textContent = step.title || '';
    p.querySelector('.tour-text').textContent = step.content || '';

    // steps
    const stepsEl = p.querySelector('.tour-steps'); stepsEl.innerHTML = '';
    window.tourSteps.forEach((s,i)=>{
      const dot = document.createElement('span'); dot.className = 'tour-step-dot' + (i===idx? ' active':''); stepsEl.appendChild(dot);
    });

    // position panel, arrow and overlay spotlight (keeps panel inside viewport)
    positionPanelToTarget(step);
    positionArrowToTarget(step);
    highlightTarget(step);
  }

  function positionPanelToTarget(step) {
    const p = createUI();
    const selector = step.selector || ('#'+step.id);
    const target = document.querySelector(selector);
    const vw = window.innerWidth; const vh = window.innerHeight; const pad = 12;

    // Ensure panel is measurable
    const prevDisplay = p.style.display || '';
    p.style.display = 'block';
    p.style.visibility = 'hidden';
    p.style.position = 'fixed';
    p.style.transform = 'none';
    const w = p.offsetWidth; const h = p.offsetHeight;
    p.style.visibility = '';

    if (!target) {
      // center
      p.style.left = '50%'; p.style.top = '50%'; p.style.transform = 'translate(-50%,-50%)';
      return;
    }

    const r = target.getBoundingClientRect();

    // candidate placements: right, left, top, bottom
    let left = r.right + 12; let top = r.top + (r.height - h)/2; // right
    if (left + w > vw - pad) {
      left = r.left - w - 12; // left
      top = r.top + (r.height - h)/2;
    }
    if (left < pad) {
      // try above
      left = r.left + (r.width - w)/2; top = r.top - h - 12;
    }
    if (top < pad) {
      // fallback below
      left = Math.min(Math.max(pad, r.left + (r.width - w)/2), vw - w - pad);
      top = r.bottom + 12;
    }

    // clamp
    left = Math.min(Math.max(pad, left), Math.max(pad, vw - w - pad));
    top = Math.min(Math.max(pad, top), Math.max(pad, vh - h - pad));

    p.style.left = left + 'px';
    p.style.top = top + 'px';
    p.style.transform = 'none';
    p.style.display = prevDisplay || 'block';
  }

  function positionArrowToTarget(step) {
    const arrow = document.getElementById('tour-arrow');
    if (!arrow) return;
    const selector = step.selector || ('#'+step.id);
    const target = document.querySelector(selector);
    const vw = window.innerWidth; const vh = window.innerHeight;
    const cx = vw/2; const cy = vh/2;
    if (!target) { arrow.style.display='none'; setOverlayGradient(null); return; }
    const r = target.getBoundingClientRect();
    const tx = r.left + r.width/2; const ty = r.top + r.height/2;
    const dx = tx - cx; const dy = ty - cy; const angle = Math.atan2(dy,dx)*180/Math.PI;
    const dist = Math.max(60, Math.hypot(dx,dy)-60);
    arrow.style.display='block'; arrow.style.width = dist + 'px'; arrow.style.left = cx + 'px'; arrow.style.top = cy + 'px';
    arrow.style.transform = `translate(0,-50%) rotate(${angle}deg)`; arrow.style.setProperty('--angle', angle+'deg');
    arrow.classList.add('pulse');
    setOverlayGradient(r);
  }

  function setOverlayGradient(rect) {
    const overlay = document.getElementById('tour-ui-overlay'); if (!overlay) return;
    if (!rect) { overlay.style.backgroundImage = 'radial-gradient(circle at 50% 45%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.18) 30%, rgba(0,0,0,0.64) 72%)'; return; }
    const cx = Math.round(rect.left + rect.width/2); const cy = Math.round(rect.top + rect.height/2); const radius = Math.round(Math.max(rect.width,rect.height)/2 + 20);
    overlay.style.backgroundImage = `radial-gradient(circle at ${cx}px ${cy}px, rgba(0,0,0,0.0) 0px, rgba(0,0,0,0.02) ${Math.max(8,radius-12)}px, rgba(0,0,0,0.28) ${radius}px, rgba(0,0,0,0.64) 80%)`;
  }

  function highlightTarget(step) {
    clearHighlights();
    const selector = step.selector || ('#'+step.id); const t = document.querySelector(selector); if (!t) return;
    t.classList.add('tour-highlight');
  }

  function clearHighlights() { document.querySelectorAll('.tour-highlight').forEach(e=>e.classList.remove('tour-highlight')); }

  function next() { idx = Math.min(window.tourSteps.length-1, idx+1); render(); }
  function prev() { idx = Math.max(0, idx-1); render(); }

  // wire buttons
  document.addEventListener('click', (e)=>{
    if (e.target.matches('.tour-next')) next();
    if (e.target.matches('.tour-prev')) prev();
    if (e.target.matches('.tour-end')) { closePanel(); }
  });

  // keyboard
  document.addEventListener('keydown', (e)=>{
    if (!panel || panel.style.display==='none') return;
    if (e.key==='Escape') { e.preventDefault(); closePanel(); }
    if (e.key==='ArrowRight' || e.key==='Enter') { e.preventDefault(); next(); }
    if (e.key==='ArrowLeft') { e.preventDefault(); prev(); }
  });

  // modal prompt once per session
  function showModalPrompt() {
    const modal = document.getElementById('tour-modal'); if (!modal) return;
    modal.hidden = false; modal.setAttribute('aria-hidden','false');
    const yes = document.getElementById('tour-yes'); const no = document.getElementById('tour-no');
    if (yes) yes.onclick = ()=>{ modal.hidden=true; modal.setAttribute('aria-hidden','true'); openPanel(); try{sessionStorage.setItem('tourStarted','1')}catch(e){} };
    if (no) no.onclick = ()=>{ modal.hidden=true; modal.setAttribute('aria-hidden','true'); try{sessionStorage.setItem('tourDeclined','1')}catch(e){} };
  }

  // start button
  document.addEventListener('DOMContentLoaded', ()=>{
    const b = document.getElementById('start-tour'); if (b) b.addEventListener('click', ()=>{ openPanel(); try{sessionStorage.setItem('tourStarted','1')}catch(e){} });
    try{ const started=sessionStorage.getItem('tourStarted'); const declined=sessionStorage.getItem('tourDeclined'); if (!started && !declined) setTimeout(showModalPrompt,600);}catch(e){}
  });

  window.startTour = ()=>{ openPanel(); };
  window.endTour = ()=>{ closePanel(); };

})();
