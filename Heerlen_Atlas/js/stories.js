// ============================================================================
// STORIES.JS — Heerlen Opportunity Atlas
// Verhalen: slides met tekst, statistieken en een kaart die inzoomt op één buurt
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE
  // ==========================================================================

  const GEEN_DATA = 'geen data';
  const FOCUS_STIJL = { color: '#ffd166', weight: 2.2, fillOpacity: 0.9 };
  const FOCUS_ZOOM  = { maxZoom: 14, animate: false, padding: [18, 18] };

  const GETAL   = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
  const DECIMAAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const EURO    = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  // Let op bij het schrijven van een nieuwe story: niet elk CBS-veld heeft in elk
  // jaar echte data. Vooral de inkomens- en armoedecijfers ontbreken in de meest
  // recente PDOK-jaren (2024/2025 zijn hiervoor leeg) maar zijn compleet voor
  // 2019 t/m 2021. Kies daarom bewust een `year` per slide, en controleer met
  // `window.debugStoryData()` welke velden er zijn — anders toont de kaart "geen data".
  //
  // Slide-soorten: 'voorpagina' (titel met achtergrond), 'map' (kaart met focus-buurt)
  // en 'summary' (afsluiting). Stat-formaten: integer, decimal, currency, currency1000
  // (CBS geeft bedragen in duizenden euro's) of suffix '%'.
  const VERHALEN = [
    {
      id: 'armoede-heerlen',
      title: 'Armoede in Heerlen',
      summary: 'Een eerlijk en hoopvol verhaal over armoede, veerkracht en de toekomst van onze stad.',
      colors: ['#1a3a5e', '#e63946', '#f4a261'],
      slides: [
        {
          paginatype: 'voorpagina',
          overline: 'Verhaal over onze stad',
          title: 'Armoede in Heerlen',
          body: 'Achter de statistieken gaan mensen schuil. Mensen met dromen, zorgen en veerkracht.',
          subtitle: 'De onzichtbare realiteit achter de cijfers',
        },
        {
          paginatype: 'map',
          year: 2021,
          overline: 'De realiteit',
          title: 'Waar armoede het hardst toeslaat',
          body: 'In Heksenberg heeft bijna de helft van de huishoudens een laag inkomen. Dit zijn geen cijfers — dit zijn gezinnen, jongeren en ouderen die elke maand moeten rondkomen.',
          field: 'percentage_huishoudens_met_laag_inkomen',
          palette: 'oranges',
          focus: { field: 'buurtnaam', value: 'Heksenberg' },
          stats: [
            { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
            { label: 'Huishoudens', field: 'aantal_huishoudens', format: 'integer' },
            { label: 'Huishoudens met laag inkomen', field: 'percentage_huishoudens_met_laag_inkomen', suffix: '%' },
            { label: 'Rond het sociaal minimum', field: 'huishoudens_tot_120_percent_van_sociaal_minimum', suffix: '%' },
            { label: 'Gemiddeld inkomen per inwoner', field: 'gemiddeld_inkomen_per_inwoner', format: 'currency1000' },
          ],
          mapNote: 'Donkerder oranje = een groter deel van de huishoudens met een laag inkomen (2021)',
        },
        {
          paginatype: 'map',
          year: 2021,
          overline: 'Kinderen in armoede',
          title: 'De toekomst mag niet verloren gaan',
          body: 'In Hoensbroek-Centrum heeft bijna 3 op de 4 huishoudens een laag inkomen, en groeien tientallen kinderen op met jeugdzorg. Wie in armoede opgroeit, heeft minder kansen op een goede opleiding en gezondheid — een opgave voor heel de stad.',
          field: 'huishoudens_tot_120_percent_van_sociaal_minimum',
          palette: 'oranges',
          focus: { field: 'buurtnaam', value: 'Hoensbroek-Centrum' },
          stats: [
            { label: 'Inwoners', field: 'aantal_inwoners', format: 'integer' },
            { label: 'Huishoudens met laag inkomen', field: 'percentage_huishoudens_met_laag_inkomen', suffix: '%' },
            { label: 'Rond het sociaal minimum', field: 'huishoudens_tot_120_percent_van_sociaal_minimum', suffix: '%' },
            { label: 'Jongeren met jeugdzorg', field: 'aantal_jongeren_met_jeugdzorg_in_natura', format: 'integer' },
            { label: 'Netto arbeidsparticipatie', field: 'netto_arbeidsparticipatie', suffix: '%' },
          ],
          mapNote: 'Donkerder oranje = een groter deel van de huishoudens rond het sociaal minimum (2021)',
        },
        {
          paginatype: 'summary',
          overline: 'Hoop en actie',
          title: 'Heerlen kan het beter',
          body: 'Armoede is niet overal in Heerlen hetzelfde. Sommige buurten kennen nauwelijks laag inkomen, andere juist heel veel — en dat verschil is precies waarom gerichte hulp werkt. Door samen te werken — gemeente, scholen, bewoners en organisaties — kan de cirkel doorbroken worden.',
          stats: [
            { label: 'Sleutels tot verandering', value: 'onderwijs, werk en ondersteuning dichtbij huis' },
          ],
        },
      ],
    },
    // Voeg hier andere verhalen toe
  ];


  // ==========================================================================
  // HULPFUNCTIES
  // ==========================================================================

  const escapeHtml = (waarde) => String(waarde ?? '').replace(/[&<>"']/g, t => `&#${t.charCodeAt(0)};`);
  const normaliseer = (waarde) => String(waarde ?? '').trim().toLowerCase();
  const alleData = () => window.multiLoaderState.originalData;
  const vindVerhaal = (id) => VERHALEN.find(v => v.id === id);

  /** Achtergrond voor een titelslide: kleurverloop met cirkels en de titel, als SVG-afbeelding. */
  function maakAchtergrond(titel, ondertitel, [eerste = '#0b7285', tweede = '#ffb703', derde = '#061826'] = []) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="${escapeHtml(titel)}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${eerste}"/><stop offset="52%" stop-color="${tweede}"/><stop offset="100%" stop-color="${derde}"/>
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="35%" r="68%">
            <stop offset="0%" stop-color="#fff" stop-opacity="0.28"/><stop offset="50%" stop-color="#fff" stop-opacity="0.08"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#bg)"/>
        <rect width="1600" height="900" fill="url(#glow)"/>
        <g fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2">
          <circle cx="260" cy="220" r="180"/><circle cx="1260" cy="170" r="260"/><circle cx="1190" cy="740" r="220"/>
          <path d="M70 690 C250 560, 410 620, 560 510 S860 420, 1020 520 S1330 650, 1540 470" stroke-width="10" stroke-linecap="round"/>
        </g>
        <g fill="#fff" fill-opacity="0.92" font-family="Segoe UI, Arial, sans-serif">
          <text x="96" y="170" font-size="34" letter-spacing="6" font-weight="800">HEERLEN STORIES</text>
          <text x="96" y="300" font-size="88" font-weight="800">${escapeHtml(titel)}</text>
          <text x="96" y="375" font-size="28" fill-opacity="0.82">${escapeHtml(ondertitel)}</text>
        </g>
      </svg>`;
    return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
  }

  function formatteer(waarde, { format, suffix } = {}) {
    const getal = Number(waarde);
    if (!Number.isFinite(getal)) return String(waarde);
    switch (format) {
      case 'currency':     return EURO.format(getal);
      case 'currency1000': return EURO.format(getal * 1000);
      case 'integer':      return GETAL.format(getal);
      default:             return DECIMAAL.format(getal) + (suffix === '%' ? '%' : '');
    }
  }

  /** De buurt uit de focus van een slide; zoekt tolerant (hoofdletters, "Heerlen " ervoor, deelnaam). */
  function vindFocusBuurt(features, focus) {
    const doel = normaliseer(focus?.value).replace(/^heerlen\s+/, '');
    if (!doel) return null;
    const velden = [focus.field, 'buurtnaam', 'naam', 'buurt', 'wijknaam'];
    return features.find(f => velden.some(veld => {
      const waarde = normaliseer(f.properties?.[veld]);
      return waarde && (waarde === doel || waarde.includes(doel) || doel.includes(waarde));
    })) || null;
  }


  // ==========================================================================
  // STATISTIEKEN — Waarden van de focus-buurt (of vaste teksten)
  // ==========================================================================

  function statistiekenHtml(slide, buurt, fc) {
    const props = buurt?.properties;
    const stats = (slide.stats || []).filter(s => s.value !== undefined || props);
    if (!stats.length) return '<p class="story-stats-leeg">Geen statistieken beschikbaar</p>';

    return stats.map(stat => {
      const waarde = stat.value ?? props?.[stat.field];
      const leeg = waarde === undefined || waarde === null || waarde === '';
      const buitenFilter = !leeg && stat.field && Number.isFinite(+waarde)
        && !window.waardePasseertFilter(+waarde, window.haalNumeriekeWaarden(fc, stat.field), window.appData.filter);
      const geenData = leeg || buitenFilter;
      const noot = [stat.note, buitenFilter && 'buiten actief filter'].filter(Boolean).join(' · ');
      return `
        <article class="story-stat${geenData ? ' is-no-data' : ''}">
          <span class="story-stat-label">${escapeHtml(stat.label || window.mooieVeldnaam(stat.field) || 'Statistiek')}</span>
          <span class="story-stat-value${geenData ? ' is-no-data' : ''}">${escapeHtml(geenData ? GEEN_DATA : formatteer(waarde, stat))}</span>
          ${noot ? `<span class="story-stat-note">${escapeHtml(noot)}</span>` : ''}
        </article>`;
    }).join('');
  }


  // ==========================================================================
  // OVERLAY EN MENU'S
  // ==========================================================================

  const staat = { overlay: null, el: {}, verhaalId: null, slide: 0, gemarkeerd: [] };

  function maakOverlay() {
    if (staat.overlay) return;
    const overlay = Object.assign(document.createElement('div'), { className: 'story-overlay', hidden: true });
    overlay.innerHTML = `
      <div class="story-backdrop"></div>
      <div class="story-scrim"></div>
      <div class="story-shell">
        <div class="story-topbar"><div class="story-chip"></div></div>
        <div class="story-progress"><span class="story-progress-bar"></span></div>
        <div class="story-grid">
          <article class="story-card">
            <p class="story-kicker"></p>
            <h2 class="story-title"></h2>
            <p class="story-copy"></p>
            <div class="story-stats"></div>
            <div class="story-map-note" hidden></div>
            <div class="story-card-nav">
              <div class="story-counter"></div>
              <div class="story-actions">
                <button type="button" class="story-prev">Vorige</button>
                <button type="button" class="story-next">Volgende</button>
                <button type="button" class="story-close">Sluit</button>
              </div>
            </div>
          </article>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    staat.overlay = overlay;
    for (const naam of ['backdrop', 'chip', 'counter', 'prev', 'next', 'progress-bar', 'card', 'kicker', 'title', 'copy', 'stats', 'map-note']) {
      staat.el[naam] = overlay.querySelector(`.story-${naam}`);
    }
    staat.el.prev.addEventListener('click', vorigeSlide);
    staat.el.next.addEventListener('click', volgendeSlide);
    overlay.querySelector('.story-close').addEventListener('click', sluitVerhaal);
    overlay.addEventListener('click', (e) => {
      if (e.target.matches('.story-overlay, .story-backdrop, .story-scrim')) sluitVerhaal();
    });
  }

  const menuKnopHtml = (verhaal, extra = '') => `
    <button type="button" class="story-menu-button" data-story-id="${escapeHtml(verhaal.id)}"
            style="--verhaal-kleur:${escapeHtml(verhaal.colors?.[0] || '#0b7285')}">
      <span class="story-menu-title">${escapeHtml(verhaal.title)}</span>
      <span class="story-menu-meta">${escapeHtml(verhaal.summary)} · ${verhaal.slides.length} slides${extra}</span>
    </button>`;

  function bouwMenu() {
    const menu = document.getElementById('stories-menu');
    menu.innerHTML = VERHALEN.map(v => menuKnopHtml(v, alleData() ? '' : ' · data laden…')).join('');
    menu.querySelectorAll('[data-story-id]').forEach(knop => knop.addEventListener('click', () => openVerhaal(knop.dataset.storyId)));
  }

  /** Paneel midden in beeld met alle verhalen (o.a. via "Ontdek de verhalen" aan het eind van de introductie). */
  function openVerhalenPaneel() {
    document.getElementById('verhalen-paneel')?.remove();
    const paneel = Object.assign(document.createElement('div'), { id: 'verhalen-paneel', className: 'verhalen-paneel' });
    paneel.innerHTML = `
      <div class="verhalen-paneel-kaart" role="dialog" aria-modal="true" aria-labelledby="verhalen-paneel-titel">
        <p class="verhalen-paneel-kicker">Verhalen over Heerlen</p>
        <h2 id="verhalen-paneel-titel">Kies een verhaal</h2>
        <p class="verhalen-paneel-uitleg">Elk verhaal neemt je stap voor stap mee langs de kaart en de cijfers achter één thema.</p>
        <div class="verhalen-paneel-lijst">${VERHALEN.map(v => menuKnopHtml(v)).join('')}</div>
        <div class="verhalen-paneel-acties">
          <button type="button" class="verhalen-paneel-sluit">Verken de kaart zelf</button>
        </div>
      </div>`;

    const opEscape = (e) => { if (e.key === 'Escape') sluit(); };
    const sluit = () => { paneel.remove(); document.removeEventListener('keydown', opEscape); };
    paneel.addEventListener('click', (e) => {
      const verhaal = e.target.closest('[data-story-id]');
      if (verhaal) { sluit(); openVerhaal(verhaal.dataset.storyId); }
      else if (e.target === paneel || e.target.closest('.verhalen-paneel-sluit')) sluit();
    });
    document.addEventListener('keydown', opEscape);
    document.body.appendChild(paneel);
    paneel.querySelector('.story-menu-button').focus();
  }


  // ==========================================================================
  // KAART PER SLIDE — Jaar, palet en variabelen instellen, dan inzoomen op de buurt
  // ==========================================================================

  function wisMarkering() {
    staat.gemarkeerd.forEach(({ laag, stijl }) => { laag.setStyle(stijl); laag.closePopup(); });
    staat.gemarkeerd = [];
  }

  function toonKaart(slide) {
    wisMarkering();
    if (slide.paginatype !== 'map' || !slide.field) return;

    // De kaartvariabele eerst, daarna de statistieken in het info-venster (via de gewone rijen)
    const velden = [...new Set([slide.field, ...(slide.stats || []).map(s => s.field)])]
      .filter(v => v && window.availableFields.includes(v));
    if (velden.length) {
      document.getElementById('selectors-div').innerHTML = '';
      velden.forEach(v => window.addFieldSelector(v));
    }
    if (slide.palette) document.getElementById('palette-select').value = slide.palette;

    // Een ander jaar kleurt de kaart via de tijdlijn opnieuw (ook buiten de gekozen periode); anders zelf
    const jaarSlider = document.getElementById('year-slider');
    if (slide.year !== undefined && jaarSlider.value !== String(slide.year)) {
      jaarSlider.value = slide.year;
      jaarSlider.dispatchEvent(new Event('input'));
    } else {
      window.herlaadVisualisatie();
    }

    const lagen = window.appData.choroplethLayer?.getLayers() || [];
    const buurt = vindFocusBuurt(lagen.map(l => l.feature), slide.focus);
    const laag = lagen.find(l => l.feature === buurt);
    if (!laag) return;

    window.appData.map.fitBounds(laag.getBounds(), FOCUS_ZOOM);
    const { color, weight, fillOpacity, fillColor } = laag.options;
    staat.gemarkeerd.push({ laag, stijl: { color, weight, fillOpacity, fillColor } });
    laag.setStyle(FOCUS_STIJL);
    laag.openPopup();
    toonTrendgrafiek(buurt, slide.field);
  }


  // ==========================================================================
  // NAVIGATIE
  // ==========================================================================

  function toonSlide() {
    const verhaal = vindVerhaal(staat.verhaalId);
    const slide = verhaal?.slides[staat.slide];
    if (!slide) return;
    const { el } = staat;
    const isVoorpagina = slide.paginatype === 'voorpagina';

    staat.overlay.hidden = false;
    staat.overlay.dataset.paginatype = slide.paginatype;
    el.backdrop.style.backgroundImage = isVoorpagina ? maakAchtergrond(slide.title, slide.subtitle, verhaal.colors) : 'none';
    el.backdrop.style.opacity = isVoorpagina ? '1' : '0.14';

    el.chip.textContent = el.kicker.textContent = slide.overline || verhaal.title;
    el.title.textContent = slide.title || verhaal.title;
    el.copy.textContent = slide.body || '';
    el.counter.textContent = `${staat.slide + 1} / ${verhaal.slides.length}`;
    el['progress-bar'].style.width = `${(staat.slide + 1) / verhaal.slides.length * 100}%`;
    el.prev.disabled = staat.slide === 0;
    el.next.textContent = staat.slide === verhaal.slides.length - 1 ? 'Sluit verhaal' : 'Volgende';

    // Het kaartje staat vast: de titelslide linksonder, alle andere linksboven
    el.card.dataset.anchor = isVoorpagina ? 'bottom-left' : 'top-left';
    ['voorpagina', 'map', 'summary'].forEach(soort => el.card.classList.toggle(`is-${soort}`, slide.paginatype === soort));
    el.card.scrollTop = 0;

    toonKaart(slide);
    const fc = window.appData.lastFC;
    el.stats.innerHTML = statistiekenHtml(slide, slide.focus && vindFocusBuurt(fc.features, slide.focus), fc);
    el['map-note'].hidden = !slide.mapNote;
    el['map-note'].textContent = slide.mapNote || '';

    document.querySelectorAll('#stories-menu .story-menu-button')
      .forEach(knop => knop.classList.toggle('is-active', knop.dataset.storyId === staat.verhaalId));
  }

  function openVerhaal(id) {
    if (!alleData()) { window.toonMelding('De data wordt nog geladen. Probeer het zo nog eens.'); return; }
    maakOverlay();
    staat.verhaalId = (vindVerhaal(id) || VERHALEN[0]).id;
    staat.slide = 0;
    document.body.classList.add('story-open');
    toonSlide();
  }

  function sluitVerhaal() {
    if (!staat.verhaalId) return;
    wisMarkering();
    staat.overlay.hidden = true;
    document.body.classList.remove('story-open');
    staat.verhaalId = null;
    document.querySelectorAll('#stories-menu .story-menu-button').forEach(knop => knop.classList.remove('is-active'));
  }

  function volgendeSlide() {
    const verhaal = vindVerhaal(staat.verhaalId);
    if (!verhaal) return;
    if (staat.slide >= verhaal.slides.length - 1) return sluitVerhaal();
    staat.slide++;
    toonSlide();
  }

  function vorigeSlide() {
    if (staat.slide <= 0) return;
    staat.slide--;
    toonSlide();
  }


  // ==========================================================================
  // INITIALISATIE
  // ==========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    bouwMenu();
    window.addEventListener('atlas:data-geladen', bouwMenu);

    document.addEventListener('keydown', (e) => {
      if (!staat.verhaalId) return;
      if (e.key === 'Escape') sluitVerhaal();
      if (e.key === 'ArrowRight') volgendeSlide();
      if (e.key === 'ArrowLeft') vorigeSlide();
    });

    // Een ander filter verandert de statistieken: open slide opnieuw tonen
    ['apply-filter', 'clear-filter', 'filter-negative'].forEach(id =>
      document.getElementById(id).addEventListener('click', () => { if (staat.verhaalId) toonSlide(); }));
  });

  window.startStory = openVerhaal;
  window.openVerhalenPaneel = openVerhalenPaneel;
  window.closeStory = sluitVerhaal;

  /** Hulp bij het schrijven van verhalen: toont welke velden er per jaar zijn. */
  window.debugStoryData = () => {
    const fc = alleData();
    console.log('Features:', fc?.features.length || 0, '· jaren:', window.multiLoaderState.availableYears.join(', '));
    console.log('Velden:', Object.keys(fc?.features[0]?.properties || {}));
  };
})();
