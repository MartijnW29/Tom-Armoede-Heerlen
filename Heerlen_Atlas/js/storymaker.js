// ============================================================================
// STORYMAKER.JS — Heerlen Opportunity Atlas
// Zelf stories maken: het formulier staat in de zijbalk en de kaart laat de slide
// live zien. Opslaan, exporteren en afspelen gaan via stories.js (window.AtlasStories).
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE
  // ==========================================================================

  const MAKER_CONFIG = {
    kleuren: ['#0b7285', '#1a3a5e', '#e63946', '#f4a261', '#2b8a3e', '#7048e8'],
    // Hoe een nieuwe story begint: de soort van de eerste slide
    beginKeuzes: [
      { soort: 'heerlen', naam: 'Heel Heerlen in beeld',    uitleg: 'Begin met de kaart van de hele stad.' },
      { soort: 'titel',   naam: 'Grote titel over de kaart', uitleg: 'Een titelpagina met de kaart van Heerlen erachter.' },
      { soort: 'buurt',   naam: 'Direct naar een buurt',     uitleg: 'Geen eerste pagina: de story begint bij een buurt.' },
    ],
    voorbeeldMs: 250,  // wachten na een wijziging voordat de kaart meeverandert
    opslaanMs:   600,
  };

  const Stories = window.AtlasStories;  // stories.js laadt eerder (zie index.html)
  const { SOORTEN } = Stories;

  const maker = {
    paneel: null, inhoud: null, status: null, strip: null, formulier: null,
    id: null, verhaal: null, slide: 0, gewijzigd: false,
    timers: {}, jarenCache: new Map(), stopAanwijzen: null,
  };


  // ==========================================================================
  // HULPFUNCTIES — Kleine bouwstenen voor het formulier
  // ==========================================================================

  const zonderLeeg = (kinderen) => kinderen.flat().filter(k => k !== null && k !== undefined && k !== false);

  /** Element met eigenschappen en kinderen: h('div', { className: 'x' }, kind, 'tekst', …); null en false tellen niet mee. */
  function h(tag, eigenschappen = {}, ...kinderen) {
    const el = maak(tag, eigenschappen);
    el.append(...zonderLeeg(kinderen));
    return el;
  }

  /** Vervang de inhoud van een element; lege onderdelen (null, false) worden overgeslagen. */
  const vul = (el, ...kinderen) => el.replaceChildren(...zonderLeeg(kinderen));

  function knop(tekst, klik, className = '', titel = '') {
    const el = h('button', { type: 'button', className, title: titel }, tekst);
    el.addEventListener('click', klik);
    return el;
  }

  function icoonKnop(icoon, klik, titel, uit = false) {
    const el = knop('', klik, `maker-icoon${icoon === ICONEN.prullenbak ? ' is-gevaar' : ''}`, titel);
    el.innerHTML = icoon;
    el.setAttribute('aria-label', titel);
    el.disabled = uit;
    return el;
  }

  function invoer(soort, waarde, bijWijziging, { label, ...eigenschappen } = {}) {
    const el = soort === 'textarea' ? maak('textarea', eigenschappen) : maak('input', { type: soort, ...eigenschappen });
    el.value = waarde || '';
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('input', () => bijWijziging(el.value));
    return el;
  }

  /** Invoerveld met label erboven (een <label>, dus klikken op de tekst zet de cursor erin). */
  const tekstVeld = (label, ...kinderen) => h('label', { className: 'maker-veld' }, h('span', { className: 'maker-label' }, label), ...kinderen);

  /** Groep met een kopje voor iets anders dan een gewoon invoerveld (keuzemenu, kleuren). */
  const groep = (label, ...kinderen) => h('div', { className: 'maker-veld' }, h('span', { className: 'maker-label' }, label), ...kinderen);

  const blok = (titel, ...kinderen) => h('section', { className: 'maker-blok' }, titel ? h('h4', { className: 'maker-blok-kop' }, titel) : null, ...kinderen);

  /**
   * Vraag "Weet je het zeker?" op de plek van de knoppen zelf, in plaats van een pop-up van de browser.
   * Annuleren (of Escape) zet de knoppen terug.
   */
  function bevestigVerwijderen(houder, vraag, verwijder) {
    const knoppen = [...houder.childNodes];
    const terug = () => {
      houder.removeEventListener('keydown', opEscape);
      houder.classList.remove('is-bevestigen');
      houder.replaceChildren(...knoppen);
    };
    const opEscape = (e) => { if (e.key === 'Escape') terug(); };
    const annuleer = knop('Annuleren', terug, 'maker-tweede maker-klein');
    houder.addEventListener('keydown', opEscape);
    houder.classList.add('is-bevestigen');
    houder.replaceChildren(h('span', { className: 'maker-vraag' }, vraag), knop('Verwijderen', verwijder, 'maker-gevaar maker-klein'), annuleer);
    annuleer.focus();
  }

  const hint = (tekst) => h('p', { className: 'maker-hint' }, tekst);
  const waarschuwing = (tekst) => h('p', { className: 'maker-waarschuwing' }, tekst);

  const nieuwId = () => `eigen-${Date.now().toString(36)}`;
  const datum = (tijd) => new Date(tijd).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });


  // ==========================================================================
  // DATA — Jaren met data per variabele en de buurten om uit te kiezen
  // ==========================================================================

  /** Jaren waarin een variabele echt waarden heeft (per variabele onthouden). */
  function jarenMetData(veld) {
    if (!maker.jarenCache.has(veld)) {
      const jaren = new Set();
      for (const f of window.multiLoaderState.originalData?.features || []) {
        const waarde = f.properties?.[veld];
        if (waarde !== null && waarde !== undefined && waarde !== '' && Number.isFinite(+waarde)) jaren.add(window.getYearFromFeature(f));
      }
      maker.jarenCache.set(veld, jaren);
    }
    return maker.jarenCache.get(veld);
  }

  /** {2013, 2014, 2015, 2018} → "2013–2015, 2018" */
  function jarenTekst(jaren) {
    const reeksen = [];
    [...jaren].sort((a, b) => a - b).forEach(jaar => {
      const laatste = reeksen.at(-1);
      if (laatste && jaar === laatste[1] + 1) laatste[1] = jaar;
      else reeksen.push([jaar, jaar]);
    });
    return reeksen.map(([van, tot]) => van === tot ? van : `${van}–${tot}`).join(', ');
  }

  /** Alle buurten (code en naam) uit het nieuwste jaar, op naam gesorteerd. */
  function buurtenLijst() {
    const features = Stories.featuresVanJaar(window.multiLoaderState.availableYears.at(-1));
    return [...new Map(features.map(f => [f.properties?.buurtcode, f.properties?.buurtnaam])).entries()]
      .filter(([code]) => code)
      .map(([code, naam]) => ({ code, naam: naam || code }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  }

  /**
   * Een slide met álle velden (ook die van andere soorten), zodat wisselen van soort niets
   * weggooit. Kaart en cijfers komen van `basis` (bijv. de vorige slide) of van de kaart nu.
   */
  function volledigeSlide(slide = {}, basis = {}) {
    const kaart = basis.variabele ? basis : {
      variabele: window.getSelectedFields()[0] || APP_CONFIG.standaardVeld1,
      jaar:      window.multiLoaderState.yearFilter,
      palet:     document.getElementById('palette-select').value,
    };
    return {
      kopje: '', titel: '', tekst: '', toelichting: '',
      variabele: kaart.variabele, jaar: kaart.jaar, palet: kaart.palet,
      buurten: [], cijfers: structuredClone(basis.cijfers || []), punten: [],
      ...structuredClone(slide),
    };
  }


  // ==========================================================================
  // OPENEN, SLUITEN EN BEWAREN
  // ==========================================================================

  function openMaker() {
    if (!window.multiLoaderState.originalData) return window.toonMelding('De data wordt nog geladen. Probeer het zo nog eens.');
    Stories.sluit();
    maakPaneel();
    const app = document.getElementById('app');
    if (app.classList.contains('sidebar-collapsed')) document.getElementById('sidebar-toggle').click();
    app.classList.add('maker-open');
    setTimeout(() => window.appData.map.invalidateSize(), 310);  // de zijbalk wordt breder (CSS-overgang)
    toonOverzicht();
    maker.paneel.querySelector('.maker-hoofdknop').focus();
  }

  function sluitMaker() {
    bewaarNu();
    stopAanwijzen();
    Stories.sluit();
    Object.assign(maker, { id: null, verhaal: null });
    document.getElementById('app').classList.remove('maker-open');
    setTimeout(() => window.appData.map.invalidateSize(), 310);
    document.getElementById('open-storymaker').focus();
  }

  function maakPaneel() {
    if (maker.paneel) return;
    maker.inhoud = h('div', { className: 'maker-inhoud' });
    maker.paneel = h('section', { id: 'storymaker', className: 'storymaker' }, maker.inhoud);
    maker.paneel.setAttribute('aria-label', 'Story maker');
    document.getElementById('sidebar').prepend(maker.paneel);
  }

  /** Na elke wijziging: de kaart (even later) bijwerken en de story bewaren. */
  function gewijzigd({ strip = false, formulier = false } = {}) {
    maker.gewijzigd = true;
    if (strip) bouwStrip();
    if (formulier) bouwFormulier();
    clearTimeout(maker.timers.voorbeeld);
    maker.timers.voorbeeld = setTimeout(toonVoorbeeld, MAKER_CONFIG.voorbeeldMs);
    clearTimeout(maker.timers.opslaan);
    maker.timers.opslaan = setTimeout(bewaarNu, MAKER_CONFIG.opslaanMs);
  }

  /** Bewaar de story als er iets gewijzigd is (of altijd, met `toch`). Geeft true als hij in de browser staat. */
  function bewaarNu(toch = false) {
    clearTimeout(maker.timers.opslaan);
    if (!maker.verhaal || !(maker.gewijzigd || toch)) return false;
    maker.gewijzigd = false;
    const bewaard = Stories.bewaarEigen(maker.id, maker.verhaal);
    werkStatusBij(bewaard);
    return bewaard;
  }

  /** Opslaan gebeurt al vanzelf; deze knop geeft de gebruiker de zekerheid en brengt hem terug naar het overzicht. */
  function opslaanEnSluiten() {
    const { id, verhaal } = maker;
    if (!bewaarNu(true)) {
      window.toonMelding('Niet opgeslagen: je hebt cookies geweigerd. Exporteer je story als bestand om hem te houden.', 7000);
      return;
    }
    toonOverzicht();
    window.toonMelding(`"${verhaal.titel.trim() || 'Naamloze story'}" is opgeslagen.`);
    maker.inhoud.querySelector(`.maker-rij[data-id="${CSS.escape(id)}"]`)?.classList.add('is-net-opgeslagen');
  }

  function werkStatusBij(bewaard) {
    if (!maker.status) return;
    maker.status.textContent = bewaard ? '✓ Bewaard in deze browser' : 'Niet bewaard: exporteer je story';
    maker.status.classList.toggle('is-waarschuwing', !bewaard);
  }

  function toonVoorbeeld() {
    clearTimeout(maker.timers.voorbeeld);
    const verhaal = maker.verhaal && Stories.normaliseer(maker.verhaal);
    if (verhaal) Stories.toonVoorbeeld(verhaal, maker.slide, { naar: kiesSlide });
  }

  const opslagWaarschuwing = () => Stories.magOpslaan() ? null : waarschuwing(
    'Je hebt cookies geweigerd, dus stories worden niet in deze browser bewaard. Exporteer je story als bestand om hem te houden.');

  function kop(titel, terug) {
    const sluit = knop('✕', sluitMaker, 'maker-sluit', 'Story maker sluiten');
    sluit.setAttribute('aria-label', 'Story maker sluiten');
    return h('header', { className: 'maker-kop' },
      terug ? knop('‹ Terug', terug, 'maker-terug', 'Terug naar het overzicht') : null,
      h('h2', {}, titel),
      sluit);
  }


  // ==========================================================================
  // OVERZICHT — Nieuwe story, bestand openen, mijn stories en stories op de site
  // ==========================================================================

  function toonOverzicht() {
    bewaarNu();
    stopAanwijzen();
    Stories.sluit();
    Object.assign(maker, { id: null, verhaal: null, status: null });

    const alle = Stories.alle();
    const eigen = alle.filter(item => item.bron === 'eigen');
    const site = alle.filter(item => item.bron === 'map');

    const bestand = maak('input', { type: 'file', accept: '.json,application/json', hidden: true });
    bestand.addEventListener('change', () => { if (bestand.files[0]) openBestand(bestand.files[0]); });

    vul(maker.inhoud,
      kop('Story maker'),
      h('p', { className: 'maker-uitleg' },
        'Vertel een verhaal met de kaart: kies per slide een variabele, een jaar en buurten, en schrijf je tekst erbij. '
        + 'Je story wordt bewaard in deze browser en is te exporteren als bestand.'),
      opslagWaarschuwing(),
      h('div', { className: 'maker-knoppen' },
        knop('+ Nieuwe story', toonBegin, 'maker-hoofdknop'),
        knop('Bestand openen…', () => bestand.click(), 'maker-tweede', 'Een geëxporteerde story (.json) openen om verder te bewerken'),
        bestand),
      h('h3', { className: 'maker-kopje' }, 'Mijn stories'),
      eigen.length ? h('div', { className: 'maker-lijst' }, eigen.map(rijEigen)) : h('p', { className: 'maker-leeg' }, 'Je hebt nog geen eigen stories.'),
      site.length ? h('h3', { className: 'maker-kopje' }, 'Stories op de site') : null,
      site.length ? h('div', { className: 'maker-lijst' }, site.map(rijSite)) : null,
    );
  }

  function storyRij({ id, verhaal, gewijzigd: tijd }, ...acties) {
    const kleur = h('span', { className: 'maker-rij-kleur' });
    kleur.style.background = verhaal.kleur;
    const rij = h('div', { className: 'maker-rij' },
      kleur,
      h('div', { className: 'maker-rij-tekst' },
        h('b', {}, verhaal.titel),
        h('small', {}, `${Stories.aantalSlides(verhaal)}${tijd ? ` · ${datum(tijd)}` : ''}`)),
      h('div', { className: 'maker-rij-acties' }, ...acties));
    rij.dataset.id = id;
    return rij;
  }

  const rijEigen = (item) => storyRij(item,
    knop('Bewerken', () => bewerk(item.id, item.verhaal), 'maker-tweede maker-klein'),
    icoonKnop(ICONEN.exporteren, () => Stories.exporteer(item.verhaal), 'Exporteren als bestand'),
    icoonKnop(ICONEN.prullenbak, (e) => verwijder(item, e.currentTarget.parentElement), 'Verwijderen'));

  const rijSite = (item) => storyRij(item,
    knop('Bewerk als kopie', () => bewerkKopie(item.verhaal), 'maker-tweede maker-klein', 'De kopie komt bij Mijn stories; het origineel blijft zoals het is'));

  function verwijder({ id, verhaal }, knoppen) {
    bevestigVerwijderen(knoppen, 'Weet je het zeker?', () => {
      Stories.verwijderEigen(id);
      toonOverzicht();
      window.toonMelding(`"${verhaal.titel}" is verwijderd.`);
    });
  }

  function bewerkKopie(verhaal) {
    const id = nieuwId();
    Stories.bewaarEigen(id, verhaal);
    bewerk(id, verhaal);
  }

  async function openBestand(bestand) {
    try {
      bewerkKopie(await Stories.leesBestand(bestand));
    } catch (err) {
      window.toonMelding(err.message);
    }
  }

  /** Nieuwe story: titel en hoe hij begint. */
  function toonBegin() {
    const titel = invoer('text', '', () => {}, { maxLength: 120, placeholder: 'Bijv. Wonen in Heerlen-Noord' });
    const begin = (soort) => {
      const id = nieuwId();
      const verhaal = {
        titel: titel.value.trim() || 'Naamloze story', samenvatting: '', kleur: MAKER_CONFIG.kleuren[0], formules: [],
        slides: [volledigeSlide({ soort })],
      };
      Stories.bewaarEigen(id, verhaal);
      bewerk(id, verhaal);
    };

    vul(maker.inhoud,
      kop('Nieuwe story', toonOverzicht),
      tekstVeld('Titel van je story', titel),
      groep('Hoe begint je story?', h('div', { className: 'maker-begin' }, MAKER_CONFIG.beginKeuzes.map(keuze =>
        knop([h('b', {}, keuze.naam), h('span', {}, keuze.uitleg)], () => begin(keuze.soort), 'maker-keuze')))),
      hint('Daarna voeg je zelf slides toe. Alles is later nog aan te passen.'),
    );
    titel.focus();
  }


  // ==========================================================================
  // BEWERKEN — Story-gegevens, de rij slides en het formulier van één slide
  // ==========================================================================

  function bewerk(id, verhaal) {
    maker.jarenCache.clear();
    window.zorgVoorFormules?.(verhaal.formules);
    Object.assign(maker, {
      id, slide: 0, gewijzigd: false,
      verhaal: { ...structuredClone(verhaal), slides: verhaal.slides.map(s => volledigeSlide(s, s)) },
      status: h('span', { className: 'maker-status', role: 'status' }),
      strip: h('div', { className: 'maker-strip' }),
      formulier: h('div', { className: 'maker-formulier' }),
    });

    vul(maker.inhoud,
      kop('Story bewerken', toonOverzicht),
      storyGegevens(),
      h('div', { className: 'maker-slides-kop' }, h('h3', { className: 'maker-kopje' }, 'Slides'), maker.status),
      maker.strip,
      maker.formulier,
      h('footer', { className: 'maker-voet' },
        h('div', { className: 'maker-knoppen' },
          knop('Opslaan en sluiten', opslaanEnSluiten, 'maker-hoofdknop'),
          knop('Exporteren als bestand', () => { bewaarNu(); Stories.exporteer(maker.verhaal); }, 'maker-tweede')),
        hint('Je story wordt ook tussendoor vanzelf bewaard. Exporteer hem en zet het bestand in de map stories/ van de website: dan staat hij voor iedereen in de lijst.')),
    );
    werkStatusBij(Stories.magOpslaan());
    bouwStrip();
    bouwFormulier();
    toonVoorbeeld();
  }

  function storyGegevens() {
    const verhaal = maker.verhaal;
    const kiesKleur = (kleur) => { verhaal.kleur = kleur; markeerKleur(); gewijzigd(); };

    const stalen = MAKER_CONFIG.kleuren.map(kleur => {
      const staal = knop('', () => kiesKleur(kleur), 'maker-kleur', 'Kleur van de story');
      staal.style.background = kleur;
      staal.setAttribute('role', 'radio');
      staal.dataset.kleur = kleur;
      return staal;
    });

    // Helemaal rechts: een eigen kleur via de kleurkiezer van de browser
    const kiezer = maak('input', { type: 'color', value: verhaal.kleur });
    kiezer.setAttribute('aria-label', 'Eigen kleur kiezen');
    kiezer.addEventListener('input', () => kiesKleur(kiezer.value));
    const eigen = h('label', { className: 'maker-kleur maker-kleur-eigen', title: 'Eigen kleur kiezen' }, kiezer);

    const markeerKleur = () => {
      stalen.forEach(staal => staal.setAttribute('aria-checked', String(staal.dataset.kleur === verhaal.kleur)));
      const isEigen = !MAKER_CONFIG.kleuren.includes(verhaal.kleur);
      eigen.classList.toggle('is-actief', isEigen);
      eigen.style.background = isEigen ? verhaal.kleur : '';
      kiezer.value = verhaal.kleur;
    };
    markeerKleur();

    return blok(null,
      tekstVeld('Titel van de story', invoer('text', verhaal.titel, (w) => { verhaal.titel = w; gewijzigd(); }, { maxLength: 120 })),
      tekstVeld('Korte omschrijving', invoer('textarea', verhaal.samenvatting, (w) => { verhaal.samenvatting = w; gewijzigd(); },
        { rows: 2, maxLength: 300, placeholder: 'Eén of twee zinnen: waar gaat de story over?' })),
      groep('Kleur in het menu', h('div', { className: 'maker-kleuren', role: 'radiogroup' }, stalen, eigen)));
  }

  function kiesSlide(index) {
    stopAanwijzen();
    maker.slide = index;
    bouwStrip();
    bouwFormulier();
    toonVoorbeeld();
  }

  // --- Rij met slides: kiezen, slepen om te verplaatsen, en "+" voor een nieuwe slide ---

  function bouwStrip() {
    const slides = maker.verhaal.slides;
    maker.strip.replaceChildren(...slides.map((slide, i) => {
      const soort = SOORTEN[slide.soort];
      const chip = knop([h('b', {}, String(i + 1)), h('span', {}, soort.kort)], () => kiesSlide(i),
        `maker-chip${i === maker.slide ? ' is-actief' : ''}`, `${i + 1}. ${soort.naam}${slide.titel ? `: ${slide.titel}` : ''} (sleep om te verplaatsen)`);
      chip.draggable = true;
      chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); chip.classList.add('is-slepend'); });
      chip.addEventListener('dragend', () => chip.classList.remove('is-slepend'));
      chip.addEventListener('dragover', (e) => { e.preventDefault(); chip.classList.add('is-doel'); });
      chip.addEventListener('dragleave', () => chip.classList.remove('is-doel'));
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        chip.classList.remove('is-doel');
        verplaats(Number(e.dataTransfer.getData('text/plain')), i);
      });
      return chip;
    }), nieuweSlideKnop());
  }

  function nieuweSlideKnop() {
    const menu = h('div', { className: 'maker-soortmenu', hidden: true }, Object.entries(SOORTEN).map(([soort, info]) =>
      knop([h('b', {}, info.naam), h('span', {}, info.uitleg)], () => voegSlideToe(soort), 'maker-keuze')));
    const plus = knop('+', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; }, 'maker-chip maker-plus', 'Slide toevoegen');
    plus.setAttribute('aria-label', 'Slide toevoegen');
    return h('div', { className: 'maker-plus-houder' }, plus, menu);
  }

  function voegSlideToe(soort) {
    const slides = maker.verhaal.slides;
    slides.splice(maker.slide + 1, 0, volledigeSlide({ soort }, slides[maker.slide]));
    maker.slide++;
    gewijzigd({ strip: true, formulier: true });
  }

  function verplaats(van, naar) {
    const slides = maker.verhaal.slides;
    if (van === naar || naar < 0 || naar >= slides.length) return;
    const gekozen = slides[maker.slide];
    slides.splice(naar, 0, slides.splice(van, 1)[0]);
    maker.slide = slides.indexOf(gekozen);
    gewijzigd({ strip: true, formulier: true });
  }

  function dupliceerSlide() {
    const slides = maker.verhaal.slides;
    slides.splice(maker.slide + 1, 0, structuredClone(slides[maker.slide]));
    maker.slide++;
    gewijzigd({ strip: true, formulier: true });
  }

  function verwijderSlide(e) {
    const slides = maker.verhaal.slides;
    if (slides.length < 2) return;
    bevestigVerwijderen(e.currentTarget.parentElement, 'Slide verwijderen?', () => {
      slides.splice(maker.slide, 1);
      maker.slide = Math.min(maker.slide, slides.length - 1);
      gewijzigd({ strip: true, formulier: true });
    });
  }

  // --- Formulier van de gekozen slide ---

  function bouwFormulier() {
    stopAanwijzen();
    const slides = maker.verhaal.slides;
    const i = maker.slide;
    const slide = slides[i];
    const soort = SOORTEN[slide.soort];
    const zet = (sleutel) => (waarde) => { slide[sleutel] = waarde; gewijzigd({ strip: sleutel === 'titel' }); };

    const soortKeuze = h('select', {}, Object.entries(SOORTEN).map(([sleutel, info]) => new Option(info.naam, sleutel)));
    soortKeuze.value = slide.soort;
    soortKeuze.addEventListener('change', () => { slide.soort = soortKeuze.value; gewijzigd({ strip: true, formulier: true }); });

    vul(maker.formulier,
      h('div', { className: 'maker-slide-kop' },
        h('span', { className: 'maker-slide-nr' }, `Slide ${i + 1} van ${slides.length}`),
        h('div', { className: 'maker-slide-acties' },
          icoonKnop('‹', () => verplaats(i, i - 1), 'Eerder in de story', i === 0),
          icoonKnop('›', () => verplaats(i, i + 1), 'Later in de story', i === slides.length - 1),
          icoonKnop(ICONEN.kopie, dupliceerSlide, 'Slide dupliceren'),
          icoonKnop(ICONEN.prullenbak, verwijderSlide, 'Slide verwijderen', slides.length < 2))),
      blok(null,
        tekstVeld('Soort slide', soortKeuze),
        hint(soort.uitleg),
        soort.buurten ? buurtKeuzes(slide, soort.buurten) : null,
        tekstVeld('Kopje', invoer('text', slide.kopje, zet('kopje'), { maxLength: 120, placeholder: 'Klein kopje boven de titel' })),
        tekstVeld('Titel', invoer('text', slide.titel, zet('titel'),
          { maxLength: 200, placeholder: slide.soort === 'titel' ? maker.verhaal.titel : 'Waar gaat deze slide over?' })),
        tekstVeld('Tekst', invoer('textarea', slide.tekst, zet('tekst'), { rows: 5, maxLength: 3000 }),
          h('small', { className: 'maker-hint' }, 'Een lege regel begint een nieuwe alinea.'))),
      soort.kaart ? kaartBlok(slide) : null,
      soort.cijfers ? cijfersBlok(slide) : null,
      soort.punten ? puntenBlok(slide) : null,
    );
  }

  function kaartBlok(slide) {
    const jaren = window.multiLoaderState.availableYears;
    const metData = jarenMetData(slide.variabele);
    if (!jaren.includes(slide.jaar)) slide.jaar = jaren.at(-1);

    const jaarKeuze = h('select', {}, jaren.map(j => new Option(metData.has(j) ? String(j) : `${j} (geen data)`, j)));
    jaarKeuze.value = slide.jaar;
    jaarKeuze.addEventListener('change', () => { slide.jaar = Number(jaarKeuze.value); gewijzigd({ formulier: true }); });

    const paletten = [...document.getElementById('palette-select').options].map(({ value, textContent }) => {
      const staal = knop('', () => { slide.palet = value; gewijzigd({ formulier: true }); }, `maker-palet${slide.palet === value ? ' is-actief' : ''}`, textContent);
      staal.innerHTML = haalKleurSchema(value, 5).map(kleur => `<i style="background:${kleur}"></i>`).join('');
      staal.setAttribute('role', 'radio');
      staal.setAttribute('aria-checked', String(slide.palet === value));
      staal.setAttribute('aria-label', textContent);
      return staal;
    });

    return blok('Kaart',
      groep('Variabele op de kaart', h('div', { className: 'maker-keuze-houder' }, window.maakVariabeleKeuze(slide.variabele, (veld) => {
        slide.variabele = veld;
        // Geen data in het gekozen jaar? Dan het nieuwste jaar mét data
        const jarenVeld = jarenMetData(veld);
        if (jarenVeld.size && !jarenVeld.has(slide.jaar)) slide.jaar = Math.max(...jarenVeld);
        gewijzigd({ formulier: true });
      }))),
      tekstVeld('Jaar', jaarKeuze),
      slide.variabele && !metData.has(slide.jaar)
        ? waarschuwing(metData.size ? `Geen data in ${slide.jaar}. Deze variabele heeft data voor ${jarenTekst(metData)}.` : 'Deze variabele heeft geen data.')
        : null,
      groep('Kleuren', h('div', { className: 'maker-paletten', role: 'radiogroup' }, paletten)),
      tekstVeld('Uitleg bij de kaart (optioneel)', invoer('text', slide.toelichting, (w) => { slide.toelichting = w; gewijzigd(); },
        { maxLength: 300, placeholder: 'Bijv. Donkerder = meer huishoudens met een laag inkomen' })));
  }

  /**
   * De buurtkeuze(s) van een slide, direct onder de soort: kiezen uit de lijst of aanwijzen op de kaart.
   * Bij vergelijken (max > 1) minstens twee buurten, aan te vullen tot het maximum.
   */
  function buurtKeuzes(slide, max) {
    const buurten = buurtenLijst();
    const kleuren = Stories.config.focusKleuren;
    const aantal = max === 1 ? 1 : Math.min(max, Math.max(2, slide.buurten.length));
    const huidige = () => Array.from({ length: aantal }, (_, j) => slide.buurten[j] || '');
    const naam = (i) => max === 1 ? 'Buurt' : `Buurt ${String.fromCharCode(65 + i)}`;  // A, B, C, …
    const zetEnHerbouw = (lijst) => { slide.buurten = lijst; gewijzigd({ formulier: true }); };

    const keuze = (i) => {
      const select = h('select', {}, new Option('Kies een buurt…', ''), buurten.map(b => new Option(b.naam, b.code)));
      select.value = slide.buurten[i] || '';
      select.setAttribute('aria-label', naam(i));
      select.addEventListener('change', () => {
        slide.buurten = huidige().map((code, j) => (j === i ? select.value : code));
        gewijzigd();
      });
      const punt = h('i', { className: 'story-punt' });
      punt.style.borderColor = kleuren[i];
      return groep(naam(i), h('div', { className: 'maker-buurtkeuze' },
        punt,
        select,
        knop('Aanwijzen', () => wijsAan(select), 'maker-tweede maker-klein', 'Klik daarna op een buurt op de kaart'),
        aantal > 2 ? icoonKnop(ICONEN.prullenbak, () => zetEnHerbouw(huidige().filter((_, j) => j !== i)), `${naam(i)} verwijderen`) : null));
    };

    const keuzes = Array.from({ length: aantal }, (_, i) => keuze(i));
    if (max === 1) return keuzes;
    const toevoegen = knop('+ Buurt toevoegen', () => zetEnHerbouw([...huidige(), '']), 'maker-tweede maker-klein');
    toevoegen.disabled = aantal >= max;
    return [...keuzes, h('div', {}, toevoegen)];
  }

  /** Kies een buurt door erop te klikken op de kaart; Escape breekt af. */
  function wijsAan(select) {
    stopAanwijzen();
    const lagen = window.appData.choroplethLayer;
    const kaart = window.appData.map.getContainer();
    if (!lagen) return;

    const opKlik = (e) => {
      const code = e.layer?.feature?.properties?.buurtcode;
      e.layer?.closePopup();
      stopAanwijzen();
      if (code) {
        select.value = code;
        select.dispatchEvent(new Event('change'));
      }
    };
    const opEscape = (e) => { if (e.key === 'Escape') stopAanwijzen(); };

    lagen.on('click', opKlik);
    document.addEventListener('keydown', opEscape);
    kaart.classList.add('is-aanwijzen');
    window.toonMelding('Klik op een buurt op de kaart (Escape om te stoppen).');
    maker.stopAanwijzen = () => {
      lagen.off('click', opKlik);
      document.removeEventListener('keydown', opEscape);
      kaart.classList.remove('is-aanwijzen');
    };
  }

  function stopAanwijzen() {
    maker.stopAanwijzen?.();
    maker.stopAanwijzen = null;
  }

  function cijfersBlok(slide) {
    const max = Stories.config.maxCijfers;
    const rijen = slide.cijfers.map((cijfer, i) => h('div', { className: 'maker-rij-invoer' },
      h('div', { className: 'maker-keuze-houder' }, window.maakVariabeleKeuze(cijfer.variabele, (veld) => { cijfer.variabele = veld; gewijzigd({ formulier: true }); })),
      icoonKnop(ICONEN.prullenbak, () => { slide.cijfers.splice(i, 1); gewijzigd({ formulier: true }); }, 'Cijfer verwijderen'),
      invoer('text', cijfer.label, (w) => { cijfer.label = w; gewijzigd(); },
        { maxLength: 80, label: 'Eigen naam', placeholder: cijfer.variabele ? `Naam: ${window.mooieVeldnaam(cijfer.variabele)}` : 'Eigen naam (optioneel)' }),
      cijfer.variabele && !jarenMetData(cijfer.variabele).has(slide.jaar) ? waarschuwing(`Geen data in ${slide.jaar}.`) : null));

    const toevoegen = knop('+ Cijfer toevoegen', () => {
      slide.cijfers.push({ variabele: '', label: '' });
      gewijzigd({ formulier: true });
      [...maker.formulier.querySelectorAll('.maker-rij-invoer .veld-picker-trigger')].at(-1)?.click();
    }, 'maker-tweede');
    toevoegen.disabled = slide.cijfers.length >= max;

    return blok(slide.soort === 'heerlen' ? 'Cijfers voor heel Heerlen' : 'Cijfers op het kaartje',
      slide.soort === 'vergelijk' ? tabelSchakelaar(slide) : null,
      hint(slide.soort === 'heerlen'
        ? 'Tellingen (zoals inwoners) worden opgeteld, de andere cijfers gemiddeld; met de hoogste en laagste buurt erbij.'
        : 'Een eigen naam is optioneel; anders staat de naam van de variabele op het kaartje.'),
      rijen,
      toevoegen);
  }

  /** Vergelijken: de buurten in de tabel naast elkaar (een kolom per buurt) of onder elkaar (een rij per buurt). */
  function tabelSchakelaar(slide) {
    const optie = (onderElkaar, tekst) => {
      const el = knop(tekst, () => { slide.buurtenOnderElkaar = onderElkaar; gewijzigd({ formulier: true }); }, 'maker-schakel-optie');
      el.setAttribute('role', 'radio');
      el.setAttribute('aria-checked', String(Boolean(slide.buurtenOnderElkaar) === onderElkaar));
      return el;
    };
    const schakelaar = h('div', { className: 'maker-schakelaar', role: 'radiogroup' }, optie(false, 'Naast elkaar'), optie(true, 'Onder elkaar'));
    schakelaar.setAttribute('aria-label', 'Buurten in de tabel');
    return groep('Buurten in de tabel', schakelaar);
  }

  function puntenBlok(slide) {
    const rijen = slide.punten.map((punt, i) => h('div', { className: 'maker-rij-invoer' },
      invoer('text', punt.label, (w) => { punt.label = w; gewijzigd(); }, { maxLength: 80, label: 'Kopje', placeholder: 'Kopje, bijv. Sleutels tot verandering' }),
      icoonKnop(ICONEN.prullenbak, () => { slide.punten.splice(i, 1); gewijzigd({ formulier: true }); }, 'Punt verwijderen'),
      invoer('text', punt.tekst, (w) => { punt.tekst = w; gewijzigd(); }, { maxLength: 300, label: 'Tekst', placeholder: 'Tekst' })));

    const toevoegen = knop('+ Punt toevoegen', () => {
      slide.punten.push({ label: '', tekst: '' });
      gewijzigd({ formulier: true });
      [...maker.formulier.querySelectorAll('.maker-rij-invoer input')].at(-2)?.focus();
    }, 'maker-tweede');
    toevoegen.disabled = slide.punten.length >= Stories.config.maxPunten;

    return blok('Punten (optioneel)', hint('Korte punten in blokjes onder de tekst, bijvoorbeeld een conclusie.'), rijen, toevoegen);
  }


  // ==========================================================================
  // INITIALISATIE
  // ==========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('open-storymaker').addEventListener('click', openMaker);

    // Het menu met slidesoorten sluit bij een klik ergens anders
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.maker-plus-houder')) document.querySelectorAll('.maker-soortmenu').forEach(m => { m.hidden = true; });
    });

    // Nieuwe jaren binnen (CBS): jaarkeuzes bijwerken, maar niet midden in het typen
    window.addEventListener('atlas:data-geladen', () => {
      maker.jarenCache.clear();
      if (maker.verhaal && !maker.formulier.contains(document.activeElement)) bouwFormulier();
    });
  });

  window.addEventListener('pagehide', () => bewaarNu());
})();
