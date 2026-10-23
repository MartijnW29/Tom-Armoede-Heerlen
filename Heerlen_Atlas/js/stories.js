// ============================================================================
// STORIES.JS — Heerlen Opportunity Atlas
// Stories laden (bestanden in de map stories/ en eigen stories in de browser) en
// afspelen over de kaart. De story maker (storymaker.js) gebruikt dit ook.
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE
  // ==========================================================================

  const STORIES_CONFIG = {
    map:            'stories/',
    lijst:          'stories/lijst.json',  // online ingevuld bij het bouwen (GitHub Pages of Cloudflare Pages)
    opslagSleutel:  'atlas_stories',       // eigen stories in de browser (localStorage)
    versie:         1,
    standaardKleur: '#0b7285',
    maxCijfers:     6,
    maxPunten:      6,
    // Omlijning van de buurten in beeld (A, B, C, …), met een witte rand eronder zodat hij op elke
    // vulkleur opvalt. Hij ligt in een eigen laag boven alle buurt- en gemeentegrenzen.
    // Eén kleur per buurt: ook het hoogste aantal buurten bij vergelijken.
    focusKleuren: ['#061826', '#0b7285', '#e8590c', '#c2255c', '#2b8a3e', '#6741d9'],
    focusRand:    { color: '#ffffff', weight: 9, opacity: 0.95 },
    focusLijn:    { weight: 4, opacity: 1 },
    focusVulling: 0.9,                     // de buurt zelf iets voller gekleurd
    vliegen:      { maxZoom: 14, duration: 1.1 },
    marge:        24,                      // ruimte (px) rond het gebied als de kaart erheen vliegt
  };

  /**
   * De slidesoorten. kaart: zet variabele, jaar en palet; buurten: aantal te kiezen buurten;
   * cijfers: cijfers van de buurt(en) of van heel Heerlen; punten: eigen teksten als cijferblokken.
   */
  const SOORTEN = {
    titel:     { naam: 'Titelpagina',              kort: 'Titel',     uitleg: 'Grote titel over de kaart van heel Heerlen.', kaart: true, buurten: 0 },
    heerlen:   { naam: 'Heel Heerlen',             kort: 'Heerlen',   uitleg: 'De kaart van heel Heerlen, met cijfers voor de hele stad.', kaart: true, buurten: 0, cijfers: true },
    buurt:     { naam: 'Inzoomen op een buurt',    kort: 'Buurt',     uitleg: 'Eén buurt licht op, met de cijfers van die buurt.', kaart: true, buurten: 1, cijfers: true },
    vergelijk: { naam: 'Buurten vergelijken',      kort: 'Vergelijk', uitleg: 'Twee of meer buurten lichten op, met hun cijfers naast elkaar.', kaart: true, buurten: 6, cijfers: true },
    tekst:     { naam: 'Alleen tekst',             kort: 'Tekst',     uitleg: 'Tekst zonder kaartwijziging, bijvoorbeeld als afsluiting.', punten: true },
  };

  // Tellingen worden voor heel Heerlen opgeteld; van de andere cijfers nemen we het gemiddelde
  const IS_TELLING = /^(aantal_|woningvoorraad$|mannen$|vrouwen$|geboorte_totaal$|sterfte_totaal$)/;
  // CBS geeft inkomens, woningwaarde en vermogen in duizenden euro's
  const IS_DUIZEND_EURO = /^gemiddeld[e]?_(inkomen|woningwaarde)|vermogen/;

  const GETAL    = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
  const DECIMAAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const EURO     = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });


  // ==========================================================================
  // HULPFUNCTIES
  // ==========================================================================

  const escapeHtml = (waarde) => String(waarde ?? '').replace(/[&<>"']/g, t => `&#${t.charCodeAt(0)};`);
  const lijst = (waarde) => Array.isArray(waarde) ? waarde : [];
  const alleData = () => window.multiLoaderState.originalData;
  const buurtNaam = (feature) => feature?.properties?.buurtnaam || feature?.properties?.buurtcode || 'Buurt';
  const labelVan = (cijfer) => cijfer.label || window.mooieVeldnaam(cijfer.variabele);
  const aantalSlides = (verhaal) => verhaal.slides.length === 1 ? '1 slide' : `${verhaal.slides.length} slides`;

  function formatteerCijfer(waarde, veld) {
    if (isPercentageVeld(veld)) return `${DECIMAAL.format(waarde)}%`;
    if (IS_DUIZEND_EURO.test(veld)) return EURO.format(waarde * 1000);
    return (IS_TELLING.test(veld) ? GETAL : DECIMAAL).format(waarde);
  }

  /** Buurten van één jaar; zonder jaar die van het getoonde jaar. */
  function featuresVanJaar(jaar) {
    if (!jaar || !alleData()) return window.appData.lastFC?.features || [];
    return alleData().features.filter(f => window.getYearFromFeature(f) === jaar);
  }

  /**
   * Geeft een functie die per buurt het getal van `veld` teruggeeft, of null als het ontbreekt of
   * buiten het actieve filter valt. De waarden voor het filter worden één keer opgehaald.
   */
  function waardenVan(features, veld) {
    const filter = window.appData.filter;
    const alle = filter ? window.haalNumeriekeWaarden({ features }, veld) : null;
    return (feature) => {
      const waarde = feature?.properties?.[veld];
      if (waarde === null || waarde === undefined || waarde === '' || !Number.isFinite(+waarde)) return null;
      return !filter || window.waardePasseertFilter(+waarde, alle, filter) ? +waarde : null;
    };
  }

  /** Tekst met een lege regel ertussen wordt losse alinea's. */
  const alineas = (tekst) => tekst.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => maak('p', { textContent: t }));


  // ==========================================================================
  // STORY-FORMAAT — Controleren en opschonen (een bestand kan van overal komen)
  // ==========================================================================

  const tekst = (waarde, max = 3000) => typeof waarde === 'string' ? waarde.trim().slice(0, max) : '';

  /** Een geldige story met alleen bekende velden, of null. */
  function normaliseerVerhaal(data) {
    const slides = lijst(data?.slides).map(normaliseerSlide).filter(Boolean);
    if (!slides.length) return null;
    return {
      versie: STORIES_CONFIG.versie,
      titel: tekst(data.titel, 120) || 'Naamloze story',
      samenvatting: tekst(data.samenvatting, 300),
      kleur: /^#[0-9a-f]{6}$/i.test(data.kleur) ? data.kleur : STORIES_CONFIG.standaardKleur,
      slides,
      formules: lijst(data.formules)
        .filter(f => ['veld', 'a', 'b', 'op'].every(k => typeof f?.[k] === 'string'))
        .map(({ veld, a, b, op }) => ({ veld, a, b, op })),
    };
  }

  function normaliseerSlide(bron) {
    const soort = SOORTEN[bron?.soort];
    if (!soort) return null;
    const slide = { soort: bron.soort, kopje: tekst(bron.kopje, 120), titel: tekst(bron.titel, 200), tekst: tekst(bron.tekst) };
    if (soort.kaart) {
      Object.assign(slide, {
        variabele:   tekst(bron.variabele, 200),
        jaar:        Number.isInteger(bron.jaar) ? bron.jaar : null,
        palet:       typeof bron.palet === 'string' && bron.palet in KLEURSCHEMAS ? bron.palet : APP_CONFIG.standaardPalet,
        toelichting: tekst(bron.toelichting, 300),
      });
    }
    if (soort.buurten) slide.buurten = lijst(bron.buurten).filter(c => typeof c === 'string' && c).slice(0, soort.buurten);
    if (soort.buurten > 1 && bron.buurtenOnderElkaar === true) slide.buurtenOnderElkaar = true;  // tabel omgedraaid
    if (soort.cijfers) {
      slide.cijfers = lijst(bron.cijfers)
        .map(c => typeof c === 'string' ? { variabele: c } : c)
        .filter(c => typeof c?.variabele === 'string' && c.variabele)
        .map(c => ({ variabele: c.variabele, label: tekst(c.label, 80) }))
        .slice(0, STORIES_CONFIG.maxCijfers);
    }
    if (soort.punten) {
      slide.punten = lijst(bron.punten)
        .map(p => ({ label: tekst(p?.label, 80), tekst: tekst(p?.tekst, 300) }))
        .filter(p => p.label || p.tekst)
        .slice(0, STORIES_CONFIG.maxPunten);
    }
    return slide;
  }

  /** Alle variabelen die de story gebruikt (kaart en cijfers). */
  const gebruikteVelden = (verhaal) =>
    [...new Set(verhaal.slides.flatMap(s => [s.variabele, ...lijst(s.cijfers).map(c => c.variabele)]).filter(Boolean))];

  /** Neem de formules mee van zelfgemaakte variabelen (en van de variabelen waar die op rusten). */
  function metFormules(verhaal) {
    const bekend = new Map(verhaal.formules.map(f => [f.veld, f]));
    const formules = new Map();
    const bezocht = new Set();
    const voegToe = (veld) => {
      if (bezocht.has(veld)) return;
      bezocht.add(veld);
      const f = window.formuleVan?.(veld) || bekend.get(veld);
      if (!f) return;
      voegToe(f.a);
      voegToe(f.b);
      formules.set(veld, { veld: f.veld, a: f.a, b: f.b, op: f.op });
    };
    gebruikteVelden(verhaal).forEach(voegToe);
    return { ...verhaal, formules: [...formules.values()] };
  }

  /** Lege teksten, lege lijsten en ontbrekende jaren weglaten: een schoon, leesbaar bestand. */
  const zonderLeeg = (verhaal) => JSON.parse(JSON.stringify(verhaal, (sleutel, waarde) =>
    waarde === '' || waarde === null || (Array.isArray(waarde) && !waarde.length && sleutel !== 'slides') ? undefined : waarde));

  /** "Armoede in Heerlen" → "armoede-in-heerlen.json" */
  const bestandsnaam = (titel) => `${titel.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'story'}.json`;

  /** Download de story als bestand, klaar om in de map stories/ te zetten. */
  function exporteer(verhaal) {
    const schoon = metFormules(normaliseerVerhaal(verhaal));
    const blob = new Blob([`${JSON.stringify(zonderLeeg(schoon), null, 2)}\n`], { type: 'application/json' });
    const link = maak('a', { href: URL.createObjectURL(blob), download: bestandsnaam(schoon.titel) });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /** Lees een story uit een gekozen bestand; geeft een foutmelding als het geen story is. */
  async function leesBestand(bestand) {
    let data = null;
    try { data = JSON.parse(await bestand.text()); } catch (_) { /* geen JSON */ }
    const verhaal = normaliseerVerhaal(data);
    if (!verhaal) throw new Error(`"${bestand.name}" is geen geldige story.`);
    return verhaal;
  }


  // ==========================================================================
  // BIBLIOTHEEK — Stories uit de map en eigen stories in de browser
  // ==========================================================================

  // Items: { id, bron: 'map' | 'eigen', verhaal, gewijzigd? }
  const bibliotheek = { map: [], eigen: [], geladen: false };

  const alleStories = () => [...bibliotheek.map, ...bibliotheek.eigen];
  const zoekStory = (id) => alleStories().find(item => item.id === id) || null;

  /** Bestandsnamen in de storymap: online via lijst.json, lokaal via de mappenlijst van de server. */
  async function zoekBestandsnamen() {
    try {
      const namen = await (await fetch(STORIES_CONFIG.lijst)).json();
      if (Array.isArray(namen)) return namen.filter(n => /\.json$/i.test(n));
    } catch (_) { /* lokaal is lijst.json nog een sjabloon */ }
    try {
      const html = await (await fetch(STORIES_CONFIG.map)).text();
      const namen = [...html.matchAll(/href="([^"?#]+\.json)"/gi)].map(([, href]) => decodeURIComponent(href.split('/').pop()));
      return [...new Set(namen)].filter(n => n !== 'lijst.json');
    } catch (err) {
      console.warn('De storymap kon niet gelezen worden:', err);
      return [];
    }
  }

  async function laadMapStories() {
    const items = await Promise.all((await zoekBestandsnamen()).map(async naam => {
      try {
        const verhaal = normaliseerVerhaal(await (await fetch(STORIES_CONFIG.map + encodeURIComponent(naam))).json());
        if (!verhaal) throw new Error('geen geldige story');
        return { id: naam.replace(/\.json$/i, ''), bron: 'map', verhaal };
      } catch (err) {
        console.warn(`Story "${naam}" kon niet geladen worden:`, err);
        return null;
      }
    }));
    bibliotheek.map = items.filter(Boolean).sort((a, b) => a.verhaal.titel.localeCompare(b.verhaal.titel, 'nl'));
  }

  // Eigen stories volgen de cookiekeuze: na "Weigeren" wordt niets bewaard
  const magOpslaan = () => window.leesCookie(COOKIES.keuze) !== 'geweigerd';

  function leesEigen() {
    try {
      return lijst(JSON.parse(localStorage.getItem(STORIES_CONFIG.opslagSleutel) || '[]'))
        .map(({ id, verhaal, gewijzigd } = {}) => ({ id, bron: 'eigen', verhaal: normaliseerVerhaal(verhaal), gewijzigd }))
        .filter(item => typeof item.id === 'string' && item.verhaal);
    } catch (_) {
      return [];
    }
  }

  function schrijfEigen() {
    if (!magOpslaan()) return false;
    try {
      const opslag = bibliotheek.eigen.map(({ id, verhaal, gewijzigd }) => ({ id, verhaal, gewijzigd }));
      localStorage.setItem(STORIES_CONFIG.opslagSleutel, JSON.stringify(opslag));
      return true;
    } catch (err) {
      console.warn('Eigen stories opslaan mislukt:', err);
      return false;
    }
  }

  /** Bewaar een eigen story (nieuw of bijgewerkt). Geeft true als hij ook echt in de browser staat. */
  function bewaarEigen(id, verhaal) {
    const schoon = normaliseerVerhaal(verhaal);
    if (!schoon) return false;
    bibliotheek.eigen = [{ id, bron: 'eigen', verhaal: metFormules(schoon), gewijzigd: Date.now() },
      ...bibliotheek.eigen.filter(item => item.id !== id)];
    bouwMenu();
    return schrijfEigen();
  }

  function verwijderEigen(id) {
    bibliotheek.eigen = bibliotheek.eigen.filter(item => item.id !== id);
    bouwMenu();
    schrijfEigen();
  }


  // ==========================================================================
  // MENU — Stories-paneel in de zijbalk en het verhalenpaneel na de introductie
  // ==========================================================================

  const menuKnopHtml = ({ id, bron, verhaal }) => `
    <button type="button" class="story-menu-button" data-story-id="${escapeHtml(id)}" style="--verhaal-kleur:${verhaal.kleur}">
      <span class="story-menu-title">${escapeHtml(verhaal.titel)}${bron === 'eigen' ? '<span class="story-menu-eigen">Eigen</span>' : ''}</span>
      <span class="story-menu-meta">${verhaal.samenvatting ? `${escapeHtml(verhaal.samenvatting)} · ` : ''}${aantalSlides(verhaal)}</span>
    </button>`;

  function bouwMenu() {
    const items = alleStories();
    document.getElementById('stories-menu').innerHTML = items.length
      ? items.map(menuKnopHtml).join('')
      : `<p class="hint">${bibliotheek.geladen ? 'Nog geen stories. Maak er zelf een via Meer → Story maken.' : 'Stories laden…'}</p>`;
    markeerMenu();
  }

  function markeerMenu() {
    document.querySelectorAll('#stories-menu .story-menu-button')
      .forEach(knop => knop.classList.toggle('is-active', knop.dataset.storyId === staat.id));
  }

  /** Paneel midden in beeld met alle stories (via "Ontdek de verhalen" aan het eind van de introductie). */
  function openVerhalenPaneel() {
    document.getElementById('verhalen-paneel')?.remove();
    const paneel = maak('div', { id: 'verhalen-paneel', className: 'verhalen-paneel' });
    paneel.innerHTML = `
      <div class="verhalen-paneel-kaart" role="dialog" aria-modal="true" aria-labelledby="verhalen-paneel-titel">
        <p class="verhalen-paneel-kicker">Verhalen over Heerlen</p>
        <h2 id="verhalen-paneel-titel">Kies een verhaal</h2>
        <p class="verhalen-paneel-uitleg">Elk verhaal neemt je stap voor stap mee langs de kaart en de cijfers achter één thema.</p>
        <div class="verhalen-paneel-lijst">${alleStories().map(menuKnopHtml).join('')}</div>
        <div class="verhalen-paneel-acties">
          <button type="button" class="verhalen-paneel-sluit">Verken de kaart zelf</button>
        </div>
      </div>`;

    const opEscape = (e) => { if (e.key === 'Escape') sluit(); };
    const sluit = () => { paneel.remove(); document.removeEventListener('keydown', opEscape); };
    paneel.addEventListener('click', (e) => {
      const knop = e.target.closest('[data-story-id]');
      if (knop) { sluit(); openVerhaal(knop.dataset.storyId); }
      else if (e.target === paneel || e.target.closest('.verhalen-paneel-sluit')) sluit();
    });
    document.addEventListener('keydown', opEscape);
    document.body.appendChild(paneel);
    paneel.querySelector('button').focus();
  }


  // ==========================================================================
  // KAARTJE OVER DE KAART
  // ==========================================================================

  const staat = {
    overlay: null, el: {},
    id: null, verhaal: null, index: 0,
    voorbeeld: null,                   // { naar(index) } als de story maker de slide toont
    kaartSleutel: null, focusSleutel: null, getoondeIndex: null,
    gemarkeerd: [],
  };

  function maakOverlay() {
    if (staat.overlay) return;
    const overlay = maak('div', { className: 'story-overlay', hidden: true });
    overlay.innerHTML = `
      <div class="story-scrim"></div>
      <article class="story-card" aria-live="polite">
        <div class="story-progress"><span class="story-progress-bar"></span></div>
        <p class="story-kicker"></p>
        <h2 class="story-title"></h2>
        <div class="story-copy"></div>
        <div class="story-stats"></div>
        <p class="story-map-note" hidden></p>
        <div class="story-card-nav">
          <span class="story-counter"></span>
          <div class="story-actions">
            <button type="button" class="story-prev">Vorige</button>
            <button type="button" class="story-next">Volgende</button>
            <button type="button" class="story-close">Sluit</button>
          </div>
        </div>
      </article>`;
    document.getElementById('map').appendChild(overlay);

    staat.overlay = overlay;
    for (const naam of ['card', 'progress-bar', 'kicker', 'title', 'copy', 'stats', 'map-note', 'counter', 'prev', 'next', 'close']) {
      staat.el[naam] = overlay.querySelector(`.story-${naam}`);
    }
    // Klikken en scrollen in het kaartje mag de kaart niet bewegen
    L.DomEvent.disableClickPropagation(staat.el.card);
    L.DomEvent.disableScrollPropagation(staat.el.card);
    staat.el.prev.addEventListener('click', () => naarSlide(staat.index - 1));
    staat.el.next.addEventListener('click', () => naarSlide(staat.index + 1));
    staat.el.close.addEventListener('click', sluitVerhaal);
  }

  const cijferBlok = (label, waarde, noot = '') => `
    <article class="story-stat${waarde === null ? ' is-leeg' : ''}">
      <span class="story-stat-label">${escapeHtml(label)}</span>
      <span class="story-stat-value">${escapeHtml(waarde ?? 'geen data')}</span>
      ${noot ? `<span class="story-stat-note">${escapeHtml(noot)}</span>` : ''}
    </article>`;

  /** Cijfer voor heel Heerlen: totaal (tellingen) of gemiddelde van de buurten, met de hoogste en laagste buurt. */
  function stadCijfer(cijfer, features) {
    const veld = cijfer.variabele;
    const waardeVan = waardenVan(features, veld);
    const metWaarde = features.map(f => ({ f, w: waardeVan(f) })).filter(x => x.w !== null);
    if (!metWaarde.length) return cijferBlok(labelVan(cijfer), null);

    const som = metWaarde.reduce((totaal, x) => totaal + x.w, 0);
    const telling = IS_TELLING.test(veld);
    const hoog = d3.greatest(metWaarde, x => x.w), laag = d3.least(metWaarde, x => x.w);
    const noot = `${telling ? 'Totaal van de buurten' : 'Gemiddelde van de buurten'}\n`
      + `Hoogst: ${buurtNaam(hoog.f)} (${formatteerCijfer(hoog.w, veld)})\nLaagst: ${buurtNaam(laag.f)} (${formatteerCijfer(laag.w, veld)})`;
    return cijferBlok(labelVan(cijfer), formatteerCijfer(telling ? som : som / metWaarde.length, veld), noot);
  }

  /**
   * Tabel met de buurten naast elkaar (een kolom per buurt) of onder elkaar (een rij per buurt).
   * Bij veel kolommen scrolt hij opzij. `buurten`: [{ f, i }], waarbij i de plek in de slide is (de kleur).
   */
  function vergelijkTabel(cijfers, buurten, tekstVan, onderElkaar) {
    const buurtKop = ({ f, i }, scope) =>
      `<th scope="${scope}"><i class="story-punt" style="border-color:${STORIES_CONFIG.focusKleuren[i]}"></i>${escapeHtml(buurtNaam(f))}</th>`;
    const cijferKop = (c, scope) => `<th scope="${scope}">${escapeHtml(labelVan(c))}</th>`;
    const cel = ({ f }, veld) => {
      const waarde = tekstVan(f, veld);
      return `<td${waarde === null ? ' class="is-leeg"' : ''}>${escapeHtml(waarde ?? 'geen data')}</td>`;
    };
    const [kolommen, rijen] = onderElkaar
      ? [cijfers.map(c => cijferKop(c, 'col')), buurten.map(b => buurtKop(b, 'row') + cijfers.map(c => cel(b, c.variabele)).join(''))]
      : [buurten.map(b => buurtKop(b, 'col')), cijfers.map(c => cijferKop(c, 'row') + buurten.map(b => cel(b, c.variabele)).join(''))];
    return `
      <div class="story-vergelijk${onderElkaar ? ' is-onder-elkaar' : ''}">
        <table>
          <thead><tr><td></td>${kolommen.join('')}</tr></thead>
          <tbody>${rijen.map(rij => `<tr>${rij}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function cijfersHtml(slide) {
    const soort = SOORTEN[slide.soort];
    if (soort.punten) return lijst(slide.punten).map(p => cijferBlok(p.label, p.tekst)).join('');
    const cijfers = lijst(slide.cijfers).filter(c => c.variabele);
    if (!soort.cijfers || !cijfers.length) return '';

    const features = featuresVanJaar(slide.jaar);
    if (slide.soort === 'heerlen') return cijfers.map(c => stadCijfer(c, features)).join('');

    const perVeld = new Map(cijfers.map(c => [c.variabele, waardenVan(features, c.variabele)]));
    const tekstVan = (feature, veld) => {
      const waarde = perVeld.get(veld)(feature);
      return waarde === null ? null : formatteerCijfer(waarde, veld);
    };
    // De plek (i) in de slide bepaalt de kleur, ook als een buurt in dit jaar ontbreekt
    const buurten = lijst(slide.buurten)
      .map((code, i) => ({ f: features.find(f => f.properties?.buurtcode === code), i }))
      .filter(b => b.f);
    if (!buurten.length) return '<p class="story-stats-leeg">Kies een buurt om de cijfers te zien.</p>';
    if (buurten.length > 1) return vergelijkTabel(cijfers, buurten, tekstVan, slide.buurtenOnderElkaar);
    return cijfers.map(c => cijferBlok(labelVan(c), tekstVan(buurten[0].f, c.variabele))).join('');
  }


  // ==========================================================================
  // KAART PER SLIDE — Variabele, jaar en palet; buurten laten oplichten en erheen vliegen
  // ==========================================================================

  function wisMarkering() {
    staat.gemarkeerd.forEach(({ laag, fillOpacity, omlijning }) => {
      laag.setStyle({ fillOpacity });
      laag.unbindTooltip();
      omlijning.remove();
    });
    staat.gemarkeerd = [];
  }

  /** Kaartrijen, palet en jaar zoals de slide wil; daarna kleurt de kaart opnieuw. */
  function tekenKaart(slide) {
    const velden = [...new Set([slide.variabele, ...lijst(slide.cijfers).map(c => c.variabele)])]
      .filter(v => v && window.availableFields.includes(v));
    if (velden[0] && velden[0] === slide.variabele) {
      document.getElementById('selectors-div').innerHTML = '';
      velden.forEach(v => window.addFieldSelector(v));
    }
    document.getElementById('palette-select').value = slide.palet;

    const jaarSlider = document.getElementById('year-slider');
    if (slide.jaar && jaarSlider.value !== String(slide.jaar)) {
      jaarSlider.value = slide.jaar;
      jaarSlider.dispatchEvent(new Event('input'));  // kleurt opnieuw, ook buiten de gekozen periode
    } else {
      window.herlaadVisualisatie();
    }
  }

  /** Eigen laag voor de omlijning: boven de gemeentegrens (475), onder het info-venster; de muis gaat erdoor. */
  function omlijningPane() {
    const kaart = window.appData.map;
    if (!kaart.getPane('storyFocusPane')) {
      Object.assign(kaart.createPane('storyFocusPane').style, { zIndex: 480, pointerEvents: 'none' });
    }
    return 'storyFocusPane';
  }

  function markeerBuurten(slide) {
    wisMarkering();
    const { focusKleuren, focusRand, focusLijn, focusVulling } = STORIES_CONFIG;
    const lagen = window.appData.choroplethLayer?.getLayers() || [];
    const lijnStijl = (stijl) => ({ pane: omlijningPane(), interactive: false, style: { fill: false, lineJoin: 'round', ...stijl } });
    lijst(slide.buurten).forEach((code, i) => {
      const laag = lagen.find(l => l.feature?.properties?.buurtcode === code);
      if (!laag) return;
      // Eerst de witte rand, daarbovenop de gekleurde lijn
      const omlijning = L.layerGroup([
        L.geoJSON(laag.feature, lijnStijl(focusRand)),
        L.geoJSON(laag.feature, lijnStijl({ ...focusLijn, color: focusKleuren[i] })),
      ]).addTo(window.appData.map);
      staat.gemarkeerd.push({ laag, fillOpacity: laag.options.fillOpacity, omlijning });
      laag.setStyle({ fillOpacity: focusVulling });
      laag.bindTooltip(buurtNaam(laag.feature), { permanent: true, direction: 'center', className: 'story-label' }).openTooltip();
      laag.getTooltip().getElement().style.background = focusKleuren[i];
    });
  }

  /** Vlieg naar de buurten van de slide (of naar heel Heerlen): naast het kaartje en boven de tijdlijn. */
  function vliegNaar() {
    const lagen = staat.gemarkeerd.length ? staat.gemarkeerd.map(g => g.laag) : window.appData.choroplethLayer?.getLayers() || [];
    if (!lagen.length) return;
    const gebied = lagen.reduce((grenzen, laag) => grenzen.extend(laag.getBounds()), L.latLngBounds([]));

    const kaart = window.appData.map;
    kaart.invalidateSize({ pan: false });  // de zijbalk of het venster kan van breedte veranderd zijn
    const { marge, vliegen } = STORIES_CONFIG;
    const k = kaart.getContainer().getBoundingClientRect();
    const kaartje = staat.el.card.getBoundingClientRect();
    const tijdlijn = document.getElementById('year-filter-area').getBoundingClientRect();
    const naastKaartje = kaartje.right - k.left + marge;
    const opties = {
      paddingTopLeft:     [k.width - naastKaartje - marge >= 160 ? naastKaartje : marge, marge],  // te weinig ruimte: dan maar achter het kaartje
      paddingBottomRight: [marge, tijdlijn.height ? k.bottom - tijdlijn.top + marge : marge],
      maxZoom:            vliegen.maxZoom,
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) kaart.fitBounds(gebied, { ...opties, animate: false });
    else kaart.flyToBounds(gebied, { ...opties, duration: vliegen.duration });
  }

  /** Alleen opnieuw kleuren of vliegen als dat voor deze slide echt nodig is (de maker tekent bij elke toets). */
  function zetKaart(slide) {
    if (!SOORTEN[slide.soort].kaart) {
      wisMarkering();
      staat.focusSleutel = null;
      return;
    }
    const kaartSleutel = JSON.stringify([slide.variabele, slide.jaar, slide.palet, lijst(slide.cijfers).map(c => c.variabele)]);
    const focusSleutel = JSON.stringify([slide.soort, lijst(slide.buurten)]);
    const opnieuwGekleurd = kaartSleutel !== staat.kaartSleutel;
    if (opnieuwGekleurd) {
      staat.kaartSleutel = kaartSleutel;
      tekenKaart(slide);
    }
    if (opnieuwGekleurd || focusSleutel !== staat.focusSleutel) markeerBuurten(slide);
    if (focusSleutel !== staat.focusSleutel) vliegNaar();
    staat.focusSleutel = focusSleutel;
  }


  // ==========================================================================
  // AFSPELEN
  // ==========================================================================

  function toonSlide() {
    const { verhaal, index, el, voorbeeld } = staat;
    const slide = verhaal.slides[index];
    const laatste = index === verhaal.slides.length - 1;

    staat.overlay.hidden = false;
    staat.overlay.dataset.soort = slide.soort;
    el.card.setAttribute('aria-live', voorbeeld ? 'off' : 'polite');  // niet voorlezen tijdens het typen in de maker
    el.card.style.setProperty('--verhaal-kleur', verhaal.kleur);

    el.kicker.textContent = slide.kopje || verhaal.titel;
    el.title.textContent = slide.titel || (slide.soort === 'titel' ? verhaal.titel : '');
    el.title.hidden = !el.title.textContent;
    el.copy.replaceChildren(...alineas(slide.tekst || ''));
    el.stats.innerHTML = cijfersHtml(slide);
    el['map-note'].textContent = slide.toelichting || '';
    el['map-note'].hidden = !slide.toelichting;

    el.counter.textContent = `${index + 1} / ${verhaal.slides.length}`;
    el['progress-bar'].style.width = `${(index + 1) / verhaal.slides.length * 100}%`;
    el.prev.disabled = index === 0;
    el.next.disabled = Boolean(voorbeeld) && laatste;
    el.next.textContent = laatste && !voorbeeld ? 'Sluit story' : 'Volgende';
    el.close.hidden = Boolean(voorbeeld);
    if (staat.getoondeIndex !== index) {
      el.card.scrollTop = 0;
      staat.getoondeIndex = index;
    }

    zetKaart(slide);
    markeerMenu();
  }

  function start(verhaal, index, voorbeeld) {
    if (!alleData()) {
      window.toonMelding('De data wordt nog geladen. Probeer het zo nog eens.');
      return false;
    }
    maakOverlay();
    window.zorgVoorFormules?.(verhaal.formules);
    Object.assign(staat, { verhaal, index: Math.min(index, verhaal.slides.length - 1), voorbeeld });
    document.body.classList.add('story-open');
    toonSlide();
    return true;
  }

  function openVerhaal(id) {
    const item = zoekStory(id);
    if (!item) return window.toonMelding('Deze story bestaat niet (meer).');
    if (start(item.verhaal, 0, null)) {
      staat.id = id;
      zetLink(id);
      markeerMenu();
    }
  }

  /** Voor de story maker: toon één slide live. `voorbeeld.naar(i)` laat de maker een andere slide kiezen. */
  function toonVoorbeeld(verhaal, index, voorbeeld) {
    staat.id = null;
    start(verhaal, index, voorbeeld);
  }

  function sluitVerhaal() {
    if (!staat.verhaal) return;
    wisMarkering();
    staat.overlay.hidden = true;
    document.body.classList.remove('story-open');
    Object.assign(staat, { id: null, verhaal: null, voorbeeld: null, kaartSleutel: null, focusSleutel: null, getoondeIndex: null });
    zetLink(null);
    markeerMenu();
  }

  function naarSlide(index) {
    const { verhaal, voorbeeld } = staat;
    if (!verhaal || index < 0) return;
    if (voorbeeld) return voorbeeld.naar(Math.min(index, verhaal.slides.length - 1));
    if (index >= verhaal.slides.length) return sluitVerhaal();
    staat.index = index;
    toonSlide();
  }

  /** De open story staat in de adresbalk (?story=...), zodat je de link kunt delen. */
  function zetLink(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('story', id);
    else url.searchParams.delete('story');
    history.replaceState(null, '', url);
  }


  // ==========================================================================
  // INITIALISATIE
  // ==========================================================================

  // Een link naar een story (?story=...) opent die story zodra de stories én de data er zijn
  let wachtendeLink = new URLSearchParams(location.search).get('story');

  function openWachtendeLink() {
    if (!wachtendeLink || !bibliotheek.geladen || !alleData()) return;
    const id = wachtendeLink;
    wachtendeLink = null;
    openVerhaal(id);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bibliotheek.eigen = leesEigen();
    bouwMenu();
    document.getElementById('stories-menu').addEventListener('click', (e) => {
      const knop = e.target.closest('[data-story-id]');
      if (knop) openVerhaal(knop.dataset.storyId);
    });

    window.addEventListener('atlas:data-geladen', () => {
      if (staat.verhaal) {  // nieuwe jaren binnen (CBS): de open slide opnieuw tekenen
        staat.kaartSleutel = staat.focusSleutel = null;
        toonSlide();
      }
      openWachtendeLink();
    });

    document.addEventListener('keydown', (e) => {
      if (!staat.verhaal || staat.voorbeeld || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') sluitVerhaal();
      if (e.key === 'ArrowRight') naarSlide(staat.index + 1);
      if (e.key === 'ArrowLeft') naarSlide(staat.index - 1);
    });

    // Een ander filter verandert de cijfers: de open slide opnieuw tonen
    ['apply-filter', 'clear-filter', 'filter-negative'].forEach(id =>
      document.getElementById(id).addEventListener('click', () => { if (staat.verhaal) toonSlide(); }));

    await laadMapStories();
    bibliotheek.geladen = true;
    bouwMenu();
    openWachtendeLink();
  });

  window.openVerhalenPaneel = openVerhalenPaneel;
  window.AtlasStories = {
    SOORTEN,
    config: STORIES_CONFIG,
    alle: alleStories,
    open: openVerhaal,
    toonVoorbeeld,
    sluit: sluitVerhaal,
    bewaarEigen,
    verwijderEigen,
    magOpslaan,
    normaliseer: normaliseerVerhaal,
    exporteer,
    leesBestand,
    featuresVanJaar,
    aantalSlides,
  };
})();
