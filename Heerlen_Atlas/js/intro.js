// ============================================================================
// INTRO.JS — Heerlen Opportunity Atlas
// Introductieverhaal "De armoedegrens trekken": vijf stappen die telkens de
// kaart veranderen en laten zien dat een armoedekaart afhangt van waar je de
// grens trekt — geografisch (noord/zuid, buurten) én in de definitie van armoede.
//
// De intro heeft een eigen Leaflet-kaart in een schermvullende laag boven de
// atlas. Zo loopt het laden en zoomen van de gewone kaart er niet doorheen, en
// staat de gewone interface na afloop ongewijzigd klaar.
//
// Data (alles 2024):
//   - kaartvormen van de buurten: PDOK wijken-en-buurten-2024
//   - cijfers: CBS StatLine 85984NED (Kerncijfers wijken en buurten 2024);
//     PDOK heeft de inkomenscijfers voor 2024 niet gevuld (-99997).
//   - het spoor: OpenStreetMap (vaste lijn in INTRO_CONFIG)
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE — Pas hier de introductie aan
  // ==========================================================================

  const INTRO_CONFIG = {
    // Voorlopig bij elk bezoek tonen. Op false: alleen tot de intro één keer is afgesloten.
    altijdTonen: true,
    gezienCookie: 'atlas_intro_gezien',

    // --- Data ---
    pdokBuurtenUrl: 'https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json',
    cbsTabelUrl:    'https://opendata.cbs.nl/ODataApi/OData/85984NED',
    gemeenteCode:   '0917',

    // CBS-onderwerpen, zonder het volgnummer (dat wordt in DataProperties opgezocht)
    cbsVelden: {
      inwoners:          'AantalInwoners',
      inkomenPerInwoner: 'GemiddeldInkomenPerInwoner',     // x 1 000 euro per jaar
      laagInkomen:       'k_40PersonenMetLaagsteInkomen',  // %
      armoede:           'PersonenInArmoede',              // %
    },

    // Buurten boven het spoor (Hoensbroek – De Kissel – Heerlen – Landgraaf).
    // Ingedeeld op het zwaartepunt van de buurt; de buurten die aan beide kanten
    // van het spoor liggen (De Koumen, Nieuw Lotbroek-Noord en Ten Esschen) horen
    // bij Noord. In de Cramer (BU09173002) ligt onder het spoor en hoort bij Zuid.
    noordBuurten: [
      'BU09171000', 'BU09171001', 'BU09171100', 'BU09171101', 'BU09171200', 'BU09171201',
      'BU09171300', 'BU09171301', 'BU09171400', 'BU09172000', 'BU09172001', 'BU09172002',
      'BU09172003', 'BU09172004', 'BU09172100', 'BU09172101', 'BU09172200', 'BU09172201',
      'BU09172300', 'BU09172400', 'BU09172401', 'BU09172402', 'BU09173000', 'BU09173001',
      'BU09173100', 'BU09173101', 'BU09173102', 'BU09173103', 'BU09173200',
      'BU09173201', 'BU09173202', 'BU09173203', 'BU09173500',
    ],

    // Mondiale extreme-armoedegrens per persoon per dag, afgerond (Wereldbank sinds 2025: $3,00)
    mondialeGrensEuro: 3,

    // Het spoor door Heerlen (OpenStreetMap, [lat, lon]). Het steekt aan beide kanten even ver (± 1,8 km)
    // buiten de gemeente uit: in het westen tot voorbij Voerendaal, in het oosten tot de splitsing bij Strijthagen.
    spoorlijn: [
      [50.88236, 5.91695], [50.89059, 5.93985], [50.89242, 5.94485], [50.89573, 5.95134], [50.89617, 5.95278], [50.89637, 5.95427],
      [50.89633, 5.95620], [50.89592, 5.95820], [50.89539, 5.95969], [50.89359, 5.96380], [50.89210, 5.96813],
      [50.89160, 5.96996], [50.89119, 5.97347], [50.88987, 5.98025], [50.88977, 5.98689], [50.89001, 5.99171],
      [50.89018, 5.99339], [50.89049, 5.99529], [50.89144, 5.99923], [50.89569, 6.01269], [50.89655, 6.01916],
      [50.89682, 6.02308],
    ],

    // Vaste, lineaire kleurschaal voor álle stappen (aandeel inwoners in %):
    // zelfde kleur = zelfde waarde. Blauw, net als de atlas; "geen cijfers" is
    // neutraal grijs zodat het niet op lichtblauw lijkt.
    kleurMax:       80,
    legendaWaarden: [0, 20, 40, 60, 80],
    geenDataKleur:  '#c4c7cc',
    // Stap 4: aantal personen in armoede per buurt (de grootste buurt heeft er ± 240)
    aantalMax:            250,
    aantalLegendaWaarden: [0, 50, 100, 150, 200, 250],
    // Stap 6–9: aandeel inwoners in armoede (Noord ± 6%, Zuid ± 4%, buurten tot ± 13%)
    perInwonerMax:            15,
    perInwonerLegendaWaarden: [0, 5, 10, 15],
    // Stap 3: aantal personen in armoede per wijk (de grootste wijk heeft er ± 460)
    aantalWijkMax:            500,
    aantalWijkLegendaWaarden: [0, 100, 200, 300, 400, 500],
    // Buurten zonder cijfers krijgen bovendien schuine streepjes (patroon in index.html)
    arcering:       'url(#arcering-geen-data)',

    // Stap 10: de keuze loopt vanzelf door de definities tot je de knoppen aanraakt
    autoDraaiMs:     4000,

    // --- Kaart ---
    startBounds:     [[50.855, 5.885], [50.935, 6.045]],
    tegelUrl:        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tegelAttributie: '© OpenStreetMap contributors · CBS / PDOK 2024',
  };

  const NF_HEEL    = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
  const NF_DECIMAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  const NF_EURO    = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const { mondialeGrensEuro } = INTRO_CONFIG;


  // ==========================================================================
  // HULPFUNCTIES — Opmaak en kleuren
  // ==========================================================================

  const escapeHtml = (waarde) => String(waarde ?? '').replace(/[&<>"']/g, t => `&#${t.charCodeAt(0)};`);

  // Lengtegraden liggen op deze breedte dichter bij elkaar: afstanden in graden hiermee corrigeren
  const COS_BREEDTE = Math.cos(50.89 * Math.PI / 180);

  /** Kortste afstand van een punt [x, y] tot de lijnstukken van een of meer lijnen ([[x, y], …]). */
  function afstandTotLijnen([x, y], lijnen) {
    let min = Infinity;
    for (const lijn of lijnen) for (let i = 1; i < lijn.length; i++) {
      const [x1, y1] = lijn[i - 1], dx = lijn[i][0] - x1, dy = lijn[i][1] - y1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
      min = Math.min(min, Math.hypot(x - x1 - t * dx, y - y1 - t * dy));
    }
    return min;
  }

  const pct = (v, decimaal = false) => v == null ? 'geen cijfers' : `${(decimaal ? NF_DECIMAL : NF_HEEL).format(v)}%`;
  const personen = (v) => v == null ? 'geen cijfers' : `${NF_HEEL.format(v)} ${Math.round(v) === 1 ? 'persoon' : 'personen'}`;

  // Eén kleur per niveau: grijs = Noord en Zuid, blauw = wijken, groen = buurten (ook bij de armoedegrens).
  // Elk palet loopt van licht naar donker; de uitersten zijn afgeknepen zodat licht niet wit wordt.
  const PALET = {
    helft: (t) => d3.interpolateGreys(0.1 + 0.75 * t),
    wijk:  (t) => d3.interpolateBlues(0.08 + 0.92 * t),
    buurt: (t) => d3.interpolateBuGn(0.08 + 0.92 * t),
  };

  const C = INTRO_CONFIG;
  const maakSchaal = (max, waarden, eenheid, palet) => ({ max, waarden, eenheid, palet });
  // Aantallen (stap 2–5)
  const SCHAAL_VERDELING     = maakSchaal(C.kleurMax,      C.legendaWaarden,           '%', PALET.helft);  // deel van alle Heerlenaren in armoede
  const SCHAAL_AANTAL_WIJK   = maakSchaal(C.aantalWijkMax, C.aantalWijkLegendaWaarden, '',  PALET.wijk);
  const SCHAAL_AANTAL        = maakSchaal(C.aantalMax,     C.aantalLegendaWaarden,     '',  PALET.buurt);
  // Procentueel (stap 6–9): overal dezelfde 0–15%, elk niveau in zijn eigen kleur
  const SCHAAL_PROCENT_HELFT = maakSchaal(C.perInwonerMax, C.perInwonerLegendaWaarden, '%', PALET.helft);
  const SCHAAL_PROCENT_WIJK  = maakSchaal(C.perInwonerMax, C.perInwonerLegendaWaarden, '%', PALET.wijk);
  const SCHAAL_PROCENT_BUURT = maakSchaal(C.perInwonerMax, C.perInwonerLegendaWaarden, '%', PALET.buurt);
  // Armoedegrens (stap 10 en 11): buurten, dus groen
  const SCHAAL_AANDEEL       = maakSchaal(C.kleurMax,      C.legendaWaarden,           '%', PALET.buurt);

  /** Kleur bij een waarde op een vaste, lineaire schaal (standaard: aandeel 0–80%). */
  function kleurVoor(waarde, schaal = SCHAAL_AANDEEL) {
    if (waarde == null || !Number.isFinite(waarde)) return INTRO_CONFIG.geenDataKleur;
    return schaal.palet(Math.max(0, Math.min(waarde, schaal.max)) / schaal.max);
  }

  const verloop = (palet) =>
    `linear-gradient(90deg, ${d3.range(0, 1.0001, 0.1).map(t => `${palet(t)} ${Math.round(t * 100)}%`).join(', ')})`;

  /**
   * Legenda van een vaste kleurschaal. Met `geenData` staat rechts naast de titel het vakje voor
   * gearceerde gebieden, zodat legenda's met en zonder dat vakje even hoog zijn.
   */
  function legendaHtml(titel, { schaal = SCHAAL_AANDEEL, geenData = false } = {}) {
    const ticks = schaal.waarden.map(v =>
      `<span style="left:${(v / schaal.max) * 100}%">${NF_HEEL.format(v)}${schaal.eenheid}</span>`).join('');
    return `
      <div class="intro-legenda">
        <div class="intro-legenda-kop">
          <span class="intro-legenda-titel">${escapeHtml(titel)}</span>
          ${geenData ? '<span class="intro-legenda-geendata" title="Te weinig inwoners voor cijfers"><i></i>Geen cijfers</span>' : ''}
        </div>
        <div class="intro-legenda-balk" style="background: ${verloop(schaal.palet)}"></div>
        <div class="intro-legenda-ticks">${ticks}</div>
      </div>`;
  }


  // ==========================================================================
  // ARMOEDEDEFINITIES — Stap 10 en 11
  // ==========================================================================

  // Gebieden met te weinig inwoners hebben bij CBS geen cijfers; die blijven op elke kaart grijs
  const heeftCijfers = (b) => b.armoede != null || b.laagInkomen != null;

  // Herkomst van het gemiddelde inkomen in de tooltip (het eigen cijfer is vaak geheim)
  const INKOMEN_BRON = { buurt: '', wijk: ' (wijkgemiddelde)', gemeente: ' (gemiddelde van Heerlen)' };

  const DEFINITIES = [
    {
      id:    'mondiaal',
      naam:  'Mondiaal',
      titel: 'Mondiale armoedegrens',
      kort:  `${NF_EURO.format(mondialeGrensEuro)} per dag`,
      maatstaf: `Minder dan ${NF_EURO.format(mondialeGrensEuro)} per dag`,
      uitleg: m => `Ongeveer de extreme armoedegrens van de Wereldbank. Zelfs in de buurt met het laagste gemiddelde
        inkomen heeft een inwoner zo'n ${NF_EURO.format(m.minInkomenPerDag)} per dag.`,
      // Een gebied telt als arm als het gemiddelde inkomen per inwoner onder de grens ligt
      waarde:  b => heeftCijfers(b) && b.inkomenPerDag != null ? (b.inkomenPerDag < mondialeGrensEuro ? 100 : 0) : null,
      tooltip: b => heeftCijfers(b) && b.inkomenPerDag != null
        ? `${pct(b.inkomenPerDag < mondialeGrensEuro ? 100 : 0)} · gem. ${NF_EURO.format(b.inkomenPerDag)} per dag${INKOMEN_BRON[b.inkomenBron]}`
        : 'geen cijfers',
      stad: m => m.stad.mondiaal,
    },
    {
      id:    'nationaal',
      naam:  'Nationaal',
      titel: 'Nationale armoedegrens',
      kort:  'personen in armoede',
      maatstaf: 'Inkomen onder de Nederlandse armoedegrens',
      uitleg: () => 'De armoedegrens zoals het CBS die voor Nederland vaststelt.',
      waarde:  b => b.armoede,
      tooltip: b => pct(b.armoede, true),
      stad: m => m.stad.nationaal,
    },
    {
      id:    'laag',
      naam:  'Laag inkomen',
      titel: 'Laag-inkomensmaatstaf',
      kort:  '40% laagste inkomens',
      maatstaf: 'Bij de 40% laagste inkomens van Nederland',
      uitleg: () => `Zet je alle inkomens van Nederland op een rij, dan is dit het aandeel inwoners bij de laagste 40%.
        Het zegt wie minder verdient dan anderen, niet wie te weinig heeft.`,
      waarde:  b => b.laagInkomen,
      tooltip: b => pct(b.laagInkomen, true),
      stad: m => m.stad.laag,
    },
  ];


  // ==========================================================================
  // KAARTEN — Wat de grote kaart per stap toont
  // ==========================================================================

  /** Niveau (helft, wijk, buurt), waarde per gebied en kleurschaal; elke stap verwijst naar een van deze. */
  const KAART_PER_STAP = {
    noordZuid:      { niveau: 'helft', waarde: h => h.waarde,      schaal: SCHAAL_VERDELING },
    wijken:         { niveau: 'wijk',  waarde: w => w.armPersonen, schaal: SCHAAL_AANTAL_WIJK },
    buurten:        { niveau: 'buurt', waarde: b => b.armPersonen, schaal: SCHAAL_AANTAL },
    perInwoner:     { niveau: 'helft', waarde: h => h.perInwoner,  schaal: SCHAAL_PROCENT_HELFT },
    wijkenProcent:  { niveau: 'wijk',  waarde: w => w.perInwoner,  schaal: SCHAAL_PROCENT_WIJK },
    buurtenProcent: { niveau: 'buurt', waarde: b => b.armoede,     schaal: SCHAAL_PROCENT_BUURT },
  };
  // De armoedegrens kleurt de buurten volgens de gekozen definitie
  const KAART_DEFINITIE = { niveau: 'buurt', waarde: b => DEFINITIES[staat.definitie].waarde(b), schaal: SCHAAL_AANDEEL, definitie: true };


  // ==========================================================================
  // STAPPEN — Teksten en knoppen (tekst volgens het script)
  // `kaart`: wat de grote kaart toont (bij een vergelijking: de kaart erachter);
  // `procentueel`: de stap kijkt naar het aandeel van de inwoners, niet naar aantallen.
  // `tekst` mag een functie van het model zijn, zodat cijfers in de tekst uit de data komen.
  // ==========================================================================

  const STAPPEN = [
    {
      id:     'start',
      kicker: 'De armoedegrens trekken',
      titel:  'Waar trek je de armoedegrens?',
      tekst: `
        <p>Armoede klinkt als iets dat we in kaart zouden moeten kunnen brengen. Bepaal wie arm is,
        zoek uit waar deze mensen wonen en zet dat op een kaart.</p>
        <p>Maar voordat we armoede in kaart kunnen brengen, moeten we eerst een keuze maken:</p>
        <p class="intro-nadruk">Wat bedoelen we met ‘arm’?</p>`,
      knop: 'Trek de grens',
    },
    {
      id:     'noordZuid',
      kaart:  KAART_PER_STAP.noordZuid,
      kicker: 'Noord en zuid',
      titel:  'Eén lijn door Heerlen',
      tekst: (m) => `
        <p>Heerlen wordt soms beschreven als een stad die in tweeën wordt gedeeld: ten noorden van de
        spoorlijn en ten zuiden van de spoorlijn.</p>
        <p>Wanneer we tellen hoeveel mensen in armoede leven, lijkt deze indeling betekenisvol.
        ${m ? `${pct(m.noord.waarde)} van de Heerlenaren in armoede` : 'Het grootste deel van de Heerlenaren in armoede'}
        woont ten noorden van het spoor.</p>
        <p>Het is verleidelijk om hier een eenvoudig beeld van te maken: <strong>Noord is arm. Zuid niet.</strong></p>
        <p>Maar wat gebeurt er als we de grenzen anders trekken?</p>`,
      extra: extraNoordZuid,
      knop: 'Verander de grenzen',
    },
    {
      id:     'wijken',
      kaart:  KAART_PER_STAP.wijken,
      kicker: 'Wijken',
      titel:  'Dezelfde stad. Andere grenzen.',
      tekst: (m) => `
        <p>Laten we de grenzen nu anders trekken. In plaats van Heerlen in noord en zuid te verdelen,
        kijken we naar de wijken.</p>
        <p>Het eenvoudige noord-zuidbeeld begint uiteen te vallen.${m ? ` ${zuidTegenNoord(m)}` : ''}</p>
        <p>En wat als we de grenzen nog kleiner trekken?</p>`,
      extra: (m) => extraWijken(m, false),
      knop: 'Bekijk de buurten',
    },
    {
      id:     'buurten',
      kaart:  KAART_PER_STAP.buurten,
      kicker: 'Buurten',
      titel:  'Nog kleinere grenzen',
      tekst: `
        <p>Binnen een wijk kunnen buurten er heel verschillend uitzien. Hoe kleiner de grenzen, hoe
        gevarieerder het patroon.</p>
        <p class="intro-nadruk">De data is niet veranderd. De grenzen zijn veranderd.</p>
        <p>En daardoor verandert het patroon dat we zien. Maar vergelijken we hier wel eerlijk?</p>`,
      extra: extraBuurten,
      knop: 'Zet ze naast elkaar',
    },
    {
      id:     'naastElkaar',
      kaart:  KAART_PER_STAP.buurten,
      kicker: 'Naast elkaar',
      titel:  'Meer arme mensen, of gewoon meer mensen?',
      tekst: `
        <p>Alle drie de kaarten tellen mensen. En boven het spoor wonen veel meer mensen dan eronder.</p>
        <p>Waar meer mensen wonen, wonen ook meer mensen in armoede. Deze aantallen zeggen dus net zo
        veel over hoeveel mensen er wonen als over armoede.</p>
        <p class="intro-nadruk">Is dit wel een eerlijke vergelijking?</p>`,
      extra: extraInwoners,
      vergelijking: vergelijkingAantallenHtml,
      knop: 'Kijk procentueel',
    },
    {
      id:     'perInwoner',
      kaart:  KAART_PER_STAP.perInwoner,
      procentueel: true,
      kicker: 'Procentueel',
      titel:  'Een eerlijkere vergelijking',
      tekst: `
        <p>Een eerlijkere vraag is niet hoeveel mensen in armoede leven, maar welk deel van de
        inwoners dat is.</p>
        <p>Procentueel is het verschil tussen noord en zuid een stuk kleiner.</p>
        <p class="intro-nadruk">Dezelfde mensen. Een andere manier van tellen.</p>
        <p>En wat zien we als we ook nu weer naar de wijken kijken?</p>`,
      extra: extraPerInwoner,
      knop: 'Bekijk de wijken',
    },
    {
      id:     'wijkenProcent',
      kaart:  KAART_PER_STAP.wijkenProcent,
      procentueel: true,
      kicker: 'Wijken, procentueel',
      titel:  'Ook procentueel verschillen de wijken',
      tekst: (m) => `
        <p>Per wijk loopt het aandeel inwoners in armoede ${m ? `uiteen van ${wijkBereik(m)}` : 'sterk uiteen'}.</p>
        <p>En wat zien we als we weer naar de buurten kijken?</p>`,
      extra: (m) => extraWijken(m, true),
      knop: 'Bekijk de buurten',
    },
    {
      id:     'buurtenProcent',
      kaart:  KAART_PER_STAP.buurtenProcent,
      procentueel: true,
      kicker: 'Buurten, procentueel',
      titel:  'Ook procentueel valt het beeld uiteen',
      tekst: `
        <p>Per buurt verschilt het aandeel inwoners in armoede sterk, ook binnen dezelfde helft van
        de stad.</p>
        <p>Sommige buurten ten zuiden van het spoor hebben procentueel meer armoede dan veel buurten
        ten noorden ervan.</p>
        <p class="intro-nadruk">Het eenvoudige noord-zuidbeeld houdt geen stand.</p>`,
      extra: extraBuurtenProcent,
      knop: 'Zet ze naast elkaar',
    },
    {
      id:     'naastElkaarProcent',
      kaart:  KAART_PER_STAP.buurtenProcent,
      procentueel: true,
      kicker: 'Naast elkaar',
      titel:  'Hetzelfde verhaal, eerlijk geteld',
      tekst: `
        <p>Procentueel geteld is het verschil tussen noord en zuid klein. Binnen elke helft zijn de
        verschillen tussen wijken en buurten veel groter.</p>
        <p class="intro-nadruk">Hoe je telt en waar je de grens trekt, bepaalt welk verhaal de kaart vertelt.</p>
        <p>Maar geografische grenzen zijn niet de enige grenzen die we trekken.</p>`,
      extra: extraPerInwoner,
      vergelijking: vergelijkingProcentHtml,
      knop: 'Verander de armoedegrens',
    },
    {
      id:     'drempel',
      kaart:  KAART_DEFINITIE,
      kicker: 'Wat telt als armoede?',
      titel:  'Wat als we hier de armoedegrens trekken?',
      tekst: `
        <p>Tot nu toe hebben we veranderd waar we geografische grenzen trekken. Maar er is nog een
        andere grens die nog belangrijker is:</p>
        <p class="intro-nadruk">Wie telt als arm?</p>
        <p>Een manier om armoede te definiëren is aan de hand van een inkomensdrempel. Pas een mondiale
        extreme armoedegrens toe op Heerlen en bijna niemand hier zou volgens deze definitie als arm
        worden geclassificeerd.</p>
        <p>Betekent dat dat armoede geen probleem is in Heerlen?</p>`,
      extra: extraDrempel,
      knop: 'Vergelijk de kaarten',
    },
    {
      id:     'vergelijking',
      kaart:  KAART_DEFINITIE,
      kicker: 'Meerdere kaarten',
      titel:  'Welke van deze is de armoedekaart van Heerlen?',
      tekst: `
        <p class="intro-nadruk">Ze zijn het allemaal.</p>
        <p>Elke kaart toont dezelfde stad, maar elke kaart beantwoordt een andere vraag, omdat een
        andere definitie van armoede wordt gebruikt.</p>
        <p>Verander de geografische grenzen en het patroon verandert. Verander de armoededrempel en
        het patroon verandert opnieuw.</p>
        <p>Een armoedekaart laat niet simpelweg armoede zien. Ze laat zien wat we ervoor hebben
        gekozen als armoede te tellen.</p>
        <div class="intro-teaser">
          <p><strong>En inkomen is slechts één manier om naar armoede te kijken.</strong></p>
          <p>Financiële middelen zijn belangrijk, maar armoede kan het leven van mensen op veel
          verschillende manieren beïnvloeden. De volgende verhalen verkennen deze verschillende
          dimensies — en de verschillende mensen achter de data.</p>
        </div>`,
      vergelijking: vergelijkingHtml,
      laatste: true,
    },
  ];

  // Stapnummer bij naam (0-based), bijv. STAP.drempel
  const STAP = Object.fromEntries(STAPPEN.map((s, i) => [s.id, i]));

  /** Wijken met cijfers voor `veld`, van laag naar hoog. */
  const wijkenGesorteerd = (m, veld) => m.wijken.filter(w => w[veld] != null).sort((a, b) => a[veld] - b[veld]);

  /** Stap 3: de zuidelijke wijk met de meeste mensen in armoede, afgezet tegen de wijken in het noorden. */
  function zuidTegenNoord(m) {
    const wijken = wijkenGesorteerd(m, 'armPersonen');
    const zuid  = wijken.filter(w => w.helft === m.zuid).at(-1);
    const noord = wijken.filter(w => w.helft === m.noord);
    const minder = zuid ? noord.filter(w => w.armPersonen < zuid.armPersonen).length : 0;
    return minder ? `Zo wonen er in ${escapeHtml(zuid.naam)}, ten zuiden van het spoor, meer mensen in armoede
      dan in ${minder} van de ${noord.length} wijken in het noorden.` : '';
  }

  /** Stap 7: het laagste en hoogste aandeel inwoners in armoede over de wijken, bijv. "1,2% tot 8,7%". */
  function wijkBereik(m) {
    const wijken = wijkenGesorteerd(m, 'perInwoner');
    return wijken.length ? `${pct(wijken[0].perInwoner, true)} tot ${pct(wijken.at(-1).perInwoner, true)}` : 'wijk tot wijk';
  }

  const BRON = 'Bron: CBS, Kerncijfers wijken en buurten 2024.';


  // ==========================================================================
  // GLOBALE STATUS
  // ==========================================================================

  const staat = {
    open: false,
    stap: 0,
    definitie: 0,
    bekekenDefinities: new Set([0]),
    autoDraaiTimer: null,
    autoDraaiGestopt: false,   // na de eerste aanraking blijft de keuze voorgoed staan
    model: null,
    laadFout: null,
    laadBelofte: null,

    overlay: null, paneel: null, inhoud: null, status: null, vergelijking: null,
    kaartUitleg: null,    // de kaartjes bij de gekozen armoedegrens (stap 10)
    getoondCijfer: null,  // het aandeel dat het grote cijfer nu laat zien (telt mee bij een wissel)
    kaart: null,
    grensLagen: [],       // gemeentegrens (halo + lijn)
    spoorLagen: [],       // het spoor (witte rand, zwarte lijn, witte blokjes)
    spoorZicht: 0,
    labels: [],
    gemeentegrensGetekend: false,
    spoorGetekend: false,
    miniKaart: null,  // { viewBox, paden, helften, spoor, streep } van de kaartjes naast elkaar (stap 5, 9 en 11)
  };

  // Elke nieuwe kaartovergang verhoogt dit token; lopende animaties stoppen dan
  let animatieToken = 0;


  // ==========================================================================
  // DATA — Laden en klaarzetten
  // ==========================================================================

  const haalJson = (url) => window.fetchJsonMetRetry(url);  // met opnieuw proberen (multi-loader.js)

  const getal = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

  /** Haal de CBS-cijfers voor Heerlen op als { code: { inwoners, laagInkomen, ... } }. */
  async function haalCbsCijfers() {
    const basis = INTRO_CONFIG.cbsTabelUrl;
    const meta  = (await haalJson(`${basis}/DataProperties?$format=json`)).value;
    const geo   = meta.find(m => m.Type === 'GeoDetail')?.Key || 'WijkenEnBuurten';

    const sleutels = {};
    for (const [naam, onderwerp] of Object.entries(INTRO_CONFIG.cbsVelden)) {
      sleutels[naam] = meta.find(m => m.Key && m.Key.replace(/_\d+$/, '') === onderwerp)?.Key;
    }

    const select  = [geo, ...Object.values(sleutels).filter(Boolean)].join(',');
    const filter  = encodeURIComponent(`substringof('${INTRO_CONFIG.gemeenteCode}',${geo})`);
    const codeOk  = new RegExp(`^(GM|WK|BU)${INTRO_CONFIG.gemeenteCode}`);
    const perCode = {};

    let url = `${basis}/TypedDataSet?$filter=${filter}&$select=${select}&$format=json`;
    while (url) {
      const json = await haalJson(url);
      for (const rij of json.value || []) {
        const code = String(rij[geo] || '').trim();
        if (!codeOk.test(code)) continue;
        perCode[code] = Object.fromEntries(Object.entries(sleutels).map(([naam, k]) => [naam, k ? getal(rij[k]) : null]));
      }
      url = json['odata.nextLink'] || null;
    }
    return perCode;
  }

  /** Namen van de wijken als { WK091710: 'Maria Gewanden en Terschuren', ... } (zonder "Wijk 10"). */
  async function haalWijkNamen() {
    const filter = encodeURIComponent(`substringof('WK${INTRO_CONFIG.gemeenteCode}',Key)`);
    const json = await haalJson(`${INTRO_CONFIG.cbsTabelUrl}/WijkenEnBuurten?$filter=${filter}&$select=Key,Title&$format=json`);
    return Object.fromEntries((json.value || []).map(w => [String(w.Key).trim(), String(w.Title).replace(/^Wijk\s+\d+\s*/, '').trim()]));
  }

  async function haalBuurten() {
    const json = await haalJson(INTRO_CONFIG.pdokBuurtenUrl);
    const features = json.features || json.items || [];
    if (!features.length) throw new Error('Geen buurten ontvangen van PDOK');
    return features;
  }

  function laadData() {
    if (!staat.laadBelofte) {
      staat.laadFout = null;
      staat.laadBelofte = Promise.all([haalBuurten(), haalCbsCijfers()])
        .then(([features, cijfers]) => {
          const model = bouwModel(features, cijfers);
          // Wijknamen zijn alleen voor de tooltips: ze komen later binnen en houden de intro niet op.
          // Tot dan (of als het mislukt) staat de wijkcode er.
          haalWijkNamen()
            .then(namen => model.wijken.forEach(w => { w.naam = namen[w.code] || w.naam; }))
            .catch(err => console.warn('Introductie: wijknamen laden mislukt', err));
          return model;
        })
        .catch(err => { staat.laadBelofte = null; throw err; });
    }
    return staat.laadBelofte;
  }

  /** Inwonergewogen gemiddelde van een percentage over een groep buurten. */
  function gewogenGemiddelde(buurten, waardeFn) {
    let som = 0, gewicht = 0;
    for (const b of buurten) {
      const v = waardeFn(b);
      if (v == null || !b.inwoners) continue;
      som += v * b.inwoners;
      gewicht += b.inwoners;
    }
    return gewicht ? som / gewicht : null;
  }

  function polygonen(geom) {
    return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  }

  /** Zwaartepunt [lon, lat] en oppervlak (in graden²) van de buitenringen van een (Multi)Polygon. */
  function zwaartepunt(geom) {
    let a = 0, cx = 0, cy = 0;
    for (const poly of polygonen(geom)) {
      const ring = poly[0];
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
        const f = x0 * y1 - x1 * y0;
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
      }
    }
    a /= 2;
    return { punt: [cx / (6 * a), cy / (6 * a)], oppervlak: Math.abs(a) };
  }


  /**
   * Gemiddeld inkomen per inwoner per dag. Het eigen cijfer is vaak geheim (te weinig
   * inkomensontvangers): dan het eerstvolgende niveau, bijv. [['buurt', c], ['wijk', w], ['gemeente', g]].
   */
  function inkomenPerDag(...niveaus) {
    const [bron, c] = niveaus.find(([, cijfers]) => cijfers?.inkomenPerInwoner != null) || [];
    return { inkomenPerDag: c ? (c.inkomenPerInwoner * 1000) / 365 : null, inkomenBron: bron ?? null };
  }

  function bouwModel(features, cijfers) {
    const noordSet = new Set(INTRO_CONFIG.noordBuurten);
    const gemeente = cijfers[`GM${INTRO_CONFIG.gemeenteCode}`] || {};
    const wijkcode = (buurtcode) => `WK${buurtcode.slice(2, 8)}`;

    const buurten = features.map(f => {
      const code = String(f.properties.buurtcode || '').trim();
      const c    = cijfers[code] || {};
      const { punt, oppervlak } = zwaartepunt(f.geometry);
      const inwoners = c.inwoners ?? getal(f.properties.aantal_inwoners) ?? 0;
      return {
        code,
        naam:          f.properties.buurtnaam || code,
        noord:         noordSet.has(code),
        inwoners,
        laagInkomen:   c.laagInkomen ?? null,
        armoede:       c.armoede ?? null,
        // Aantal personen in armoede: inwoners x percentage (nationale armoedegrens)
        armPersonen:   c.armoede != null ? (inwoners * c.armoede) / 100 : null,
        ...inkomenPerDag(['buurt', c], ['wijk', cijfers[wijkcode(code)]], ['gemeente', gemeente]),
        zwaartepunt:   punt,
        oppervlak,
        feature:       f,
        laag:  null,
        stijl: { fillColor: '#ffffff', fillOpacity: 0, color: '#ffffff', weight: 1, opacity: 0 },
      };
    });

    const maakHelft = (naam, lijst) => {
      const opp = lijst.reduce((s, b) => s + b.oppervlak, 0);
      return {
        naam,
        buurten: lijst,
        armPersonen: lijst.reduce((s, b) => s + (b.armPersonen ?? 0), 0),
        waarde:  null,  // aandeel van alle Heerlenaren in armoede, zie hieronder
        inwoners: lijst.reduce((s, b) => s + b.inwoners, 0),
        labelPunt: [
          lijst.reduce((s, b) => s + b.zwaartepunt[1] * b.oppervlak, 0) / opp,
          lijst.reduce((s, b) => s + b.zwaartepunt[0] * b.oppervlak, 0) / opp,
        ],
        feature: {
          type: 'Feature',
          properties: { naam },
          geometry: { type: 'MultiPolygon', coordinates: lijst.flatMap(b => polygonen(b.feature.geometry)) },
        },
        laag:  null,
        stijl: { fillColor: '#ffffff', fillOpacity: 0, color: '#ffffff', weight: 0, opacity: 0 },
      };
    };
    const noord = maakHelft('Noord', buurten.filter(b => b.noord));
    const zuid  = maakHelft('Zuid',  buurten.filter(b => !b.noord));
    buurten.forEach(b => { b.helft = b.noord ? noord : zuid; });
    const armTotaal = noord.armPersonen + zuid.armPersonen;
    [noord, zuid].forEach(h => {
      h.waarde = armTotaal ? (h.armPersonen / armTotaal) * 100 : null;
      // Per inwoner: alleen de inwoners van buurten met cijfers tellen mee
      const inwonersMetCijfers = h.buurten.reduce((s, b) => s + (b.armPersonen != null ? b.inwoners : 0), 0);
      h.perInwoner = inwonersMetCijfers ? (h.armPersonen / inwonersMetCijfers) * 100 : null;
    });

    // De gemeentegrens: randen die bij maar één buurt horen (randSegmenten en maakKetens staan in map.js)
    const segmenten = randSegmenten(buurten, b => b.feature.geometry);
    const gemeentegrens = maakKetens(segmenten.filter(s => s.buurten.length === 1));

    // Wijken (stap 3, 5, 7 en 9): opgeteld uit hun buurten, net als Noord en Zuid
    const wijken = [...d3.group(buurten, b => wijkcode(b.code))].map(([code, lijst]) => {
      const metCijfers = lijst.filter(b => b.armPersonen != null);
      const armPersonen = metCijfers.length ? metCijfers.reduce((som, b) => som + b.armPersonen, 0) : null;
      const inwonersMetCijfers = metCijfers.reduce((som, b) => som + b.inwoners, 0);
      const opp = lijst.reduce((som, b) => som + b.oppervlak, 0);
      const geometry = { type: 'MultiPolygon', coordinates: lijst.flatMap(b => polygonen(b.feature.geometry)) };
      const wijk = {
        code,
        naam: code,  // de naam komt na het laden binnen (haalWijkNamen)
        buurten: lijst,
        armPersonen,
        perInwoner: armPersonen != null && inwonersMetCijfers ? (armPersonen / inwonersMetCijfers) * 100 : null,
        // Een wijk die het spoor raakt, hoort bij de helft waar de meeste inwoners wonen
        helft: d3.greatest([noord, zuid], h => d3.sum(lijst.filter(b => b.helft === h), b => b.inwoners)),
        zwaartepunt: [
          lijst.reduce((som, b) => som + b.zwaartepunt[0] * b.oppervlak, 0) / opp,
          lijst.reduce((som, b) => som + b.zwaartepunt[1] * b.oppervlak, 0) / opp,
        ],
        geometry,
        feature: { type: 'Feature', properties: { code }, geometry },
        laag:  null,
        stijl: { fillColor: '#ffffff', fillOpacity: 0, color: '#ffffff', weight: 0, opacity: 0 },
      };
      lijst.forEach(b => { b.wijk = wijk; });
      return wijk;
    });
    // Wijkgrenzen: randen tussen buurten van verschillende wijken, plus de buitenrand
    const wijkgrenzen = maakKetens(segmenten.filter(s =>
      s.buurten.length === 1 || wijkcode(s.buurten[0].code) !== wijkcode(s.buurten[1].code)));

    // Afstand van elke wijk en buurt tot het spoor (0–1): de kaart "valt uiteen" vanaf de lijn
    const spoorVlak = [INTRO_CONFIG.spoorlijn.map(([lat, lon]) => [lon * COS_BREEDTE, lat])];
    [buurten, wijken].forEach(items => {
      items.forEach(it => {
        const [lon, lat] = it.zwaartepunt;
        it.afstandTotSpoor = afstandTotLijnen([lon * COS_BREEDTE, lat], spoorVlak);
      });
      const maxAfstand = Math.max(...items.map(it => it.afstandTotSpoor)) || 1;
      items.forEach(it => { it.afstandTotSpoor /= maxAfstand; });
    });

    const uitersten = (lijst, veld = 'armPersonen') => {
      const metWaarde = lijst.filter(b => b[veld] != null).sort((a, b) => a[veld] - b[veld]);
      return { laagste: metWaarde[0], hoogste: metWaarde.at(-1) };
    };

    return {
      buurten,
      helften: [noord, zuid],
      noord, zuid,
      spreiding: { noord: uitersten(noord.buurten), zuid: uitersten(zuid.buurten) },
      spreidingProcent: { noord: uitersten(noord.buurten, 'armoede'), zuid: uitersten(zuid.buurten, 'armoede') },
      gemeentegrens,
      wijken,
      wijkgrenzen,
      spoorlijn: [INTRO_CONFIG.spoorlijn],
      minInkomenPerDag: Math.min(...buurten.filter(b => b.inkomenBron === 'buurt').map(b => b.inkomenPerDag)),
      stad: {
        mondiaal:  gewogenGemiddelde(buurten, DEFINITIES[0].waarde),
        nationaal: gemeente.armoede ?? gewogenGemiddelde(buurten, b => b.armoede),
        laag:      gemeente.laagInkomen ?? gewogenGemiddelde(buurten, b => b.laagInkomen),
      },
    };
  }


  // ==========================================================================
  // ANIMATIE — Kleine tween-helpers
  // ==========================================================================

  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /** Roep `stap(t)` aan met t van 0 naar 1 (lineair) en daarna `klaar`. Stopt als het token verandert. */
  function animeer(duur, stap, klaar) {
    const token = animatieToken;
    if (!duur || rustig) { stap(1); klaar?.(); return; }
    const start = performance.now();
    const frame = (nu) => {
      if (token !== animatieToken) return;
      const t = Math.min(1, (nu - start) / duur);
      stap(t);
      if (t < 1) requestAnimationFrame(frame); else klaar?.();
    };
    requestAnimationFrame(frame);
  }

  function zetStijl(items, doel) {
    for (const it of items) {
      it.stijl = { ...it.stijl, ...(typeof doel === 'function' ? doel(it) : doel) };
      it.laag?.setStyle(it.stijl);
    }
  }

  /**
   * Laat de stijl van kaartvlakken geleidelijk overgaan naar `doel(item)`.
   * Met `vertraging(item)` (0–1) start elk vlak iets later: een golf over de kaart.
   */
  function stijlOvergang(items, doel, duur, vertraging, klaar) {
    const overgangen = items.map(it => {
      const van = { ...it.stijl };
      const naar = { ...van, ...doel(it) };
      return {
        it, van, naar,
        vulling: d3.interpolateRgb(van.fillColor, naar.fillColor),
        rand:    d3.interpolateRgb(van.color, naar.color),
        start:   vertraging ? vertraging(it) * 0.45 : 0,
      };
    });
    const span = vertraging ? 0.55 : 1;

    animeer(duur, (t) => {
      for (const o of overgangen) {
        const lokaal = easeInOut(Math.max(0, Math.min(1, (t - o.start) / span)));
        o.it.stijl = {
          fillColor:   o.vulling(lokaal),
          fillOpacity: lerp(o.van.fillOpacity, o.naar.fillOpacity, lokaal),
          color:       o.rand(lokaal),
          weight:      lerp(o.van.weight, o.naar.weight, lokaal),
          opacity:     lerp(o.van.opacity, o.naar.opacity, lokaal),
        };
        o.it.laag?.setStyle(o.it.stijl);
      }
    }, klaar);
  }

  /** Cumulatieve lengtes langs een lijn (graden, lengtegraad gecorrigeerd). */
  function cumulatief(lijn) {
    const cum = [0];
    for (let i = 1; i < lijn.length; i++) {
      cum.push(cum[i - 1] + Math.hypot((lijn[i][1] - lijn[i - 1][1]) * COS_BREEDTE, lijn[i][0] - lijn[i - 1][0]));
    }
    return cum;
  }

  /** Teken lijnen geleidelijk, keten na keten, alsof ze met een pen getrokken worden. */
  function tekenGeleidelijk(lagen, ketens, duur, klaar) {
    const lengtes = ketens.map(cumulatief);
    const totaal = lengtes.reduce((s, c) => s + c.at(-1), 0);

    animeer(duur, (t) => {
      let rest = easeInOut(t) * totaal;
      const delen = ketens.map((keten, i) => {
        const cum = lengtes[i], lengte = cum.at(-1);
        if (rest <= 0) return [];
        if (rest >= lengte) { rest -= lengte; return keten; }
        const j = cum.findIndex(c => c >= rest);
        const f = (rest - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
        const punt = [lerp(keten[j - 1][0], keten[j][0], f), lerp(keten[j - 1][1], keten[j][1], f)];
        rest = 0;
        return [...keten.slice(0, j), punt];
      });
      lagen.forEach(l => l.setLatLngs(delen));
    }, klaar);
  }

  function zetLijnenVolledig(lagen, ketens) {
    lagen.forEach(l => l.setLatLngs(ketens));
  }

  /** Zichtbaarheid (0–1) van het spoor geleidelijk aanpassen. */
  function spoorZichtbaarheid(doel, duur, klaar) {
    const van = staat.spoorZicht;
    animeer(duur, (t) => {
      staat.spoorZicht = lerp(van, doel, easeInOut(t));
      staat.spoorLagen.forEach(l => l.setStyle({ opacity: l.options.basisOpacity * staat.spoorZicht }));
    }, klaar);
  }

  /** Waarde en uitleg op het label van een helft: aantallen (stap 2) of procentueel (stap 6). */
  function helftLabelInhoud(h) {
    return isProcentueel(staat.stap)
      ? { waarde: pct(h.perInwoner, true), uitleg: 'van de inwoners in armoede' }
      : { waarde: pct(h.waarde), uitleg: `${NF_HEEL.format(h.armPersonen)} personen in armoede` };
  }

  function toonHelftLabels(zichtbaar) {
    staat.labels.forEach((marker, i) => {
      const el = marker.getElement();
      if (!el) return;
      if (zichtbaar) {
        const { waarde, uitleg } = helftLabelInhoud(staat.model.helften[i]);
        el.querySelector('.intro-helft-label-waarde').textContent = waarde;
        el.querySelector('.intro-helft-label-uitleg').textContent = uitleg;
      }
      el.classList.toggle('is-zichtbaar', zichtbaar);
    });
  }


  // ==========================================================================
  // KAART — Opbouw
  // ==========================================================================

  function maakKaart() {
    const kaart = L.map(staat.overlay.querySelector('.intro-kaart'), {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
    });
    L.control.zoom({ position: 'topright' }).addTo(kaart);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(kaart);
    L.tileLayer(INTRO_CONFIG.tegelUrl, { maxZoom: 19, attribution: INTRO_CONFIG.tegelAttributie }).addTo(kaart);
    kaart.fitBounds(INTRO_CONFIG.startBounds);

    // Arcering van buurten zonder cijfers, net boven de vlakken en niet klikbaar
    kaart.createPane('introArcering');
    kaart.getPane('introArcering').style.zIndex = 410;
    kaart.getPane('introArcering').style.pointerEvents = 'none';

    // Grenzen boven de vlakken, niet klikbaar
    kaart.createPane('introGrenzen');
    kaart.getPane('introGrenzen').style.zIndex = 450;
    kaart.getPane('introGrenzen').style.pointerEvents = 'none';

    staat.kaart = kaart;
  }

  function tooltipTekst(b) {
    if (staat.stap === STAP.start) return 'Heerlen';
    const kaart = kaartVoorStap(staat.stap);
    if (kaart.definitie) return `<strong>${escapeHtml(b.naam)}</strong> · ${DEFINITIES[staat.definitie].tooltip(b)}`;

    const gebied = gebiedVan(b, kaart.niveau);
    const v = kaart.waarde(gebied);
    const tekst = v == null ? 'geen cijfers'
      : staat.stap === STAP.noordZuid ? `${pct(v)} van de Heerlenaren in armoede (${personen(gebied.armPersonen)})`
      : isProcentueel(staat.stap) ? `${pct(v, true)} van de inwoners in armoede`
      : `${personen(v)} in armoede`;
    return `<strong>${escapeHtml(gebied.naam)}</strong> · ${tekst}`;
  }

  /** Zet de kaartlagen eenmalig neer zodra de data er is. */
  function bouwKaartlagen() {
    const m = staat.model;
    const kaart = staat.kaart;

    // Noord en Zuid als één vlak per helft: één pad (met 'nonzero'), dus geen naden tussen de buurten
    m.helften.forEach(h => {
      h.laag = L.geoJSON(h.feature, { interactive: false, style: () => ({ ...h.stijl, fillRule: 'nonzero' }) }).getLayers()[0];
      h.laag.addTo(kaart);
    });

    // Wijken op dezelfde manier: één vlak per wijk; de grenzen tekenen we apart
    m.wijken.forEach(w => {
      w.laag = L.geoJSON(w.feature, { interactive: false, style: () => ({ ...w.stijl, fillRule: 'nonzero' }) }).getLayers()[0];
      w.laag.addTo(kaart);
    });
    staat.wijkgrensLaag = L.polyline(m.wijkgrenzen, {
      pane: 'introArcering', interactive: false, color: '#ffffff', weight: 1.2, opacity: 0, lineJoin: 'round',
    }).addTo(kaart);

    const perCode = new Map(m.buurten.map(b => [b.code, b]));
    L.geoJSON(m.buurten.map(b => b.feature), {
      style: f => perCode.get(f.properties.buurtcode).stijl,
      onEachFeature: (f, laag) => {
        const b = perCode.get(f.properties.buurtcode);
        b.laag = laag;
        laag.bindTooltip(() => tooltipTekst(b), { sticky: true, direction: 'top', offset: [0, -10], className: 'intro-tooltip' });
      },
    }).addTo(kaart);

    m.buurten.forEach(b => {
      b.arcering = L.geoJSON(b.feature, {
        pane: 'introArcering', interactive: false,
        style: () => ({ stroke: false, fillColor: INTRO_CONFIG.arcering, fillOpacity: 0 }),
      }).getLayers()[0].addTo(kaart);
    });

    const lijn = (opties) => L.polyline([], { pane: 'introGrenzen', interactive: false, ...opties, basisOpacity: opties.opacity });

    staat.grensLagen = [
      lijn({ color: '#ffffff', weight: 6, opacity: 0.7, lineJoin: 'round' }),
      lijn({ color: '#061826', weight: 2.2, opacity: 0.85, lineJoin: 'round' }),
    ];

    // Het spoor zoals op een topografische kaart: zwart met witte blokjes, met een witte rand
    staat.spoorLagen = [
      lijn({ color: '#ffffff', weight: 10, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }),
      lijn({ color: '#061826', weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'butt' }),
      lijn({ color: '#ffffff', weight: 3, opacity: 1, dashArray: '9 9', lineJoin: 'round', lineCap: 'butt' }),
    ];
    [...staat.grensLagen, ...staat.spoorLagen].forEach(l => l.addTo(kaart));
    staat.spoorLagen.forEach(l => l.setStyle({ opacity: 0 }));

    staat.labels = m.helften.map(h => L.marker(h.labelPunt, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'intro-helft-icoon',
        iconSize: null,
        html: `<div class="intro-helft-label">
                 <span class="intro-helft-label-naam">${h.naam}</span>
                 <span class="intro-helft-label-waarde">${pct(h.waarde)}</span>
                 <span class="intro-helft-label-uitleg"></span>
               </div>`,
      }),
    }).addTo(kaart));

    staat.bounds = L.geoJSON(m.helften.map(h => h.feature)).getBounds();
  }

  /** Zoom zo dat Heerlen naast (desktop) of boven (smal scherm) het tekstpaneel past. */
  function pasZoomAan(animeren = true) {
    if (!staat.kaart || !staat.bounds || !staat.paneel) return;
    const r = staat.paneel.getBoundingClientRect();
    const smal = window.innerWidth < 760;
    const uitleg = staat.kaartUitleg.hidden ? null : staat.kaartUitleg.getBoundingClientRect();
    const opties = smal
      ? { paddingTopLeft: [16, (uitleg?.bottom ?? 0) + 16], paddingBottomRight: [16, Math.max(16, window.innerHeight - r.top + 12)] }
      : { paddingTopLeft: [r.right + 24, 24], paddingBottomRight: [56, 24] };
    if (uitleg && !smal) maakRuimteVoorUitleg(opties, uitleg);
    staat.kaart.fitBounds(staat.bounds, { ...opties, animate: animeren && !rustig });
  }


  // ==========================================================================
  // KAART — Toestand per stap
  // ==========================================================================

  const kaartVoorStap = (stap) => STAPPEN[stap].kaart ?? null;  // de start heeft nog geen cijfers
  const isProcentueel = (stap) => Boolean(STAPPEN[stap].procentueel);

  const RANG = { helft: 0, wijk: 1, buurt: 2 };
  const gebiedenOp = (niveau) => ({ helft: staat.model.helften, wijk: staat.model.wijken, buurt: staat.model.buurten })[niveau];
  /** Het gebied op `niveau` waar een buurt (of wijk) in ligt. */
  const gebiedVan = (item, niveau) => niveau === 'helft' ? item.helft : niveau === 'wijk' ? item.wijk ?? item : item;

  /** Arceer de buurten waarvoor `geenCijfers(buurt)` waar is; zonder functie verdwijnt alle arcering. */
  function toonArcering(geenCijfers) {
    staat.model.buurten.forEach(b => b.arcering?.setStyle({ fillOpacity: geenCijfers?.(b) ? 0.9 : 0 }));
  }

  /**
   * Breng de grote kaart naar `kaart` (zie KAART_PER_STAP). Een fijner niveau "valt uiteen" vanaf
   * het spoor (helft → wijken → buurten); een grover niveau vloeit samen in zijn grotere gebied.
   */
  function toonNiveau(kaart, duur, klaar) {
    const van = staat.niveau, naar = kaart.niveau;
    const items = gebiedenOp(naar);
    const zichtbaar = (it) => ({
      fillColor: kleurVoor(kaart.waarde(it), kaart.schaal), fillOpacity: 0.85,
      ...(naar === 'buurt' ? { color: '#ffffff', weight: 1, opacity: 0.9 } : { weight: 0, opacity: 0 }),
    });
    const verbergAndere = () => Object.keys(RANG).filter(n => n !== naar)
      .forEach(n => zetStijl(gebiedenOp(n), { fillOpacity: 0, opacity: 0 }));

    staat.niveau = naar;
    staat.wijkgrensLaag.setStyle({ opacity: naar === 'wijk' ? 0.9 : 0 });
    toonArcering(b => kaart.waarde(gebiedVan(b, naar)) == null && naar !== 'helft');

    if (!duur || !van || van === naar) {
      // Zelfde niveau (of zonder animatie): de kleuren vloeien over. Ook een half afgemaakte
      // vorige overgang op een ander niveau verdwijnt hiermee.
      verbergAndere();
      if (!duur) { zetStijl(items, zichtbaar); klaar?.(); return; }
      stijlOvergang(items, zichtbaar, duur, null, klaar);
      return;
    }

    if (RANG[naar] > RANG[van]) {
      // Uiteenvallen: elk gebied begint in de kleur van het grotere gebied eromheen
      zetStijl(items, it => ({ ...zichtbaar(it), fillColor: gebiedVan(it, van).stijl.fillColor, opacity: 0 }));
      verbergAndere();
      stijlOvergang(items, zichtbaar, 1700, it => it.afstandTotSpoor, klaar);
    } else {
      // Samenvloeien: het grotere niveau staat er meteen (het ligt onder het kleinere); de kleine
      // gebieden nemen de kleur van hun grotere gebied aan en verdwijnen dan
      zetStijl(items, zichtbaar);
      const oud = gebiedenOp(van);
      stijlOvergang(oud, it => {
        const kleur = kleurVoor(kaart.waarde(gebiedVan(it, naar)), kaart.schaal);
        return { fillColor: kleur, color: kleur, opacity: 0 };
      }, duur, null, () => {
        verbergAndere();
        klaar?.();
      });
    }
  }

  /**
   * Breng de kaart naar de toestand van `stap`. `vanStap` is de vorige stap
   * (bepaalt welke overgang we tonen); null = direct, zonder animatie.
   */
  function pasKaartToe(stap, vanStap) {
    const m = staat.model;
    if (!m || !staat.kaart) return;
    animatieToken++;
    const anim = vanStap != null && !rustig;
    const D = anim ? 800 : 0;
    const kaart = kaartVoorStap(stap);

    staat.overlay.classList.toggle('is-vergelijking', Boolean(STAPPEN[stap].vergelijking));
    toonHelftLabels(false);

    // De gemeentegrens wordt alleen de eerste keer getekend; daarna staat hij er altijd
    if (stap === STAP.start && !staat.gemeentegrensGetekend) {
      tekenGeleidelijk(staat.grensLagen, m.gemeentegrens, 1800, () => { staat.gemeentegrensGetekend = true; });
    } else {
      zetLijnenVolledig(staat.grensLagen, m.gemeentegrens);
      staat.gemeentegrensGetekend = true;
    }

    if (!kaart) {
      // Eén stad, nog zonder cijfers
      staat.niveau = null;
      staat.wijkgrensLaag.setStyle({ opacity: 0 });
      toonArcering(null);
      stijlOvergang(m.helften, () => ({ fillColor: '#ffffff', fillOpacity: 0.5 }), D);
      stijlOvergang([...m.wijken, ...m.buurten], () => ({ fillOpacity: 0, opacity: 0 }), D);
      spoorZichtbaarheid(0, D, () => { staat.spoorGetekend = false; });
      return;
    }

    // Bij Noord en Zuid verschijnen de labels zodra de helften gekleurd zijn
    const klaar = kaart.niveau === 'helft' ? () => toonHelftLabels(true) : null;

    if (anim && !staat.spoorGetekend) {
      // Eerst de lijn door de stad trekken, dan kleurt de kaart in
      spoorZichtbaarheid(1, 0);
      tekenGeleidelijk(staat.spoorLagen, m.spoorlijn, 1600, () => { staat.spoorGetekend = true; toonNiveau(kaart, D, klaar); });
      return;
    }

    zetLijnenVolledig(staat.spoorLagen, m.spoorlijn);
    staat.spoorGetekend = true;
    // Bij de armoedegrens maakt de geografische grens plaats voor de armoededrempel
    spoorZichtbaarheid(kaart.definitie ? 0 : 1, D);
    toonNiveau(kaart, stap === STAP.vergelijking ? 0 : D, klaar);
  }


  // ==========================================================================
  // KAART — Uitleg bij de gekozen armoedegrens (stap 10)
  // ==========================================================================

  /** De kaartjes links naast Heerlen: naam, maatstaf en uitleg van de grens, en het aandeel van Heerlen. */
  function werkKaartUitlegBij(def, metOvergang) {
    const uitleg = staat.kaartUitleg;
    uitleg.querySelector('.intro-uitleg-titel').textContent = def.titel;
    uitleg.querySelector('.intro-uitleg-maatstaf').textContent = def.maatstaf;
    uitleg.querySelector('.intro-uitleg-tekst').textContent = def.uitleg(staat.model).replace(/\s+/g, ' ');
    if (metOvergang && !rustig) {
      uitleg.querySelector('.intro-uitleg-grens').animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    }

    // Het grote cijfer telt geleidelijk naar de nieuwe waarde
    const getal = uitleg.querySelector('.intro-uitleg-cijfer strong');
    const van = staat.getoondCijfer ?? 0, naar = def.stad(staat.model);
    if (naar == null) { getal.textContent = pct(null); return; }
    animeer(metOvergang ? 700 : 0, (t) => {
      staat.getoondCijfer = lerp(van, naar, easeInOut(t));
      getal.textContent = pct(staat.getoondCijfer, true);
    });
  }

  /** Schermpunt van een [lat, lon] als de kaart Heerlen met deze padding toont (zelfde rekenwerk als fitBounds). */
  function schermpuntBij({ paddingTopLeft, paddingBottomRight }) {
    const kaart = staat.kaart, linksboven = L.point(paddingTopLeft), rechtsonder = L.point(paddingBottomRight);
    const zoom = kaart.getBoundsZoom(staat.bounds, false, linksboven.add(rechtsonder));
    const midden = kaart.project(staat.bounds.getSouthWest(), zoom).add(kaart.project(staat.bounds.getNorthEast(), zoom))
      .divideBy(2).add(rechtsonder.subtract(linksboven).divideBy(2));
    const helft = kaart.getSize().divideBy(2);
    return (punt) => kaart.project(punt, zoom).subtract(midden).add(helft);
  }

  /** Schuif Heerlen naar rechts tot de gemeentegrens nergens achter de kaartjes van stap 10 ligt. */
  function maakRuimteVoorUitleg(opties, vak) {
    const grens = staat.model.gemeentegrens.flat();
    for (let poging = 0; poging < 4; poging++) {
      const scherm = schermpuntBij(opties);
      const teVer = Math.max(0, ...grens.map(scherm)
        .filter(p => p.y > vak.top - 12 && p.y < vak.bottom + 12)
        .map(p => vak.right + 24 - p.x));
      if (!teVer) return;
      opties.paddingTopLeft[0] += teVer;
    }
  }


  // ==========================================================================
  // PANEEL — Extra inhoud per stap
  // ==========================================================================

  function ladenHtml() {
    if (staat.laadFout) {
      return `<div class="intro-laden is-fout">
        <p>De kaartgegevens konden niet geladen worden.</p>
        <button type="button" class="intro-knop-secundair" data-actie="opnieuw-laden">Opnieuw proberen</button>
      </div>`;
    }
    return '<div class="intro-laden"><span class="intro-laden-bolletje"></span>Cijfers van 2024 laden…</div>';
  }

  function extraNoordZuid(m) {
    if (!m) return ladenHtml();
    const tegel = (h) => `
      <div class="intro-helft">
        <span class="intro-helft-kleur" style="background:${kleurVoor(h.waarde, SCHAAL_VERDELING)}"></span>
        <span class="intro-helft-naam">${h.naam}</span>
        <strong class="intro-helft-waarde">${pct(h.waarde)}</strong>
        <span class="intro-helft-meta">${personen(h.armPersonen)} in armoede · ${h.buurten.length} buurten · ${NF_HEEL.format(h.inwoners)} inwoners</span>
      </div>`;
    return `
      <div class="intro-helften">${tegel(m.noord)}${tegel(m.zuid)}</div>
      ${legendaHtml('Aandeel van alle Heerlenaren in armoede (nationale armoedegrens)', { schaal: SCHAAL_VERDELING })}
      <p class="intro-bron">${BRON} Aantal per buurt = inwoners × aandeel personen in armoede.</p>`;
  }

  function extraBuurten(m) {
    if (!m) return ladenHtml();
    const regel = (naam, { laagste, hoogste }) => laagste && hoogste
      ? `<li><strong>${naam}</strong>: van ${personen(laagste.armPersonen)} (${escapeHtml(laagste.naam)})
         tot ${personen(hoogste.armPersonen)} (${escapeHtml(hoogste.naam)})</li>`
      : '';
    return `
      <ul class="intro-spreiding">
        ${regel('Noord', m.spreiding.noord)}
        ${regel('Zuid', m.spreiding.zuid)}
      </ul>
      ${legendaHtml('Aantal personen in armoede per buurt (nationale armoedegrens)', { schaal: SCHAAL_AANTAL, geenData: true })}
      <p class="intro-bron">${BRON}</p>`;
  }

  /** Stap 3 en 7: de wijk met de minste en de meeste armoede (aantal of procentueel). */
  function extraWijken(m, procentueel) {
    if (!m) return ladenHtml();
    const veld = procentueel ? 'perInwoner' : 'armPersonen';
    const opmaak = procentueel ? (v => pct(v, true)) : personen;
    const metWaarde = wijkenGesorteerd(m, veld);
    const regel = (label, w) => `<li><strong>${label}</strong>: ${opmaak(w[veld])} (${escapeHtml(w.naam)})</li>`;
    return `
      ${metWaarde.length ? `<ul class="intro-spreiding">
        ${regel('Minste', metWaarde[0])}
        ${regel('Meeste', metWaarde.at(-1))}
      </ul>` : ''}
      ${procentueel
        ? legendaHtml('Aandeel inwoners in armoede per wijk (nationale armoedegrens)', { schaal: SCHAAL_PROCENT_WIJK, geenData: true })
        : legendaHtml('Aantal personen in armoede per wijk (nationale armoedegrens)', { schaal: SCHAAL_AANTAL_WIJK, geenData: true })}
      <p class="intro-bron">${BRON}</p>`;
  }

  /** Stap 8: de spreiding van het aandeel in armoede per buurt, binnen elke helft. */
  function extraBuurtenProcent(m) {
    if (!m) return ladenHtml();
    const regel = (naam, { laagste, hoogste }) => laagste && hoogste
      ? `<li><strong>${naam}</strong>: van ${pct(laagste.armoede, true)} (${escapeHtml(laagste.naam)})
         tot ${pct(hoogste.armoede, true)} (${escapeHtml(hoogste.naam)})</li>`
      : '';
    return `
      <ul class="intro-spreiding">
        ${regel('Noord', m.spreidingProcent.noord)}
        ${regel('Zuid', m.spreidingProcent.zuid)}
      </ul>
      ${legendaHtml('Aandeel inwoners in armoede per buurt (nationale armoedegrens)', { schaal: SCHAAL_PROCENT_BUURT, geenData: true })}
      <p class="intro-bron">${BRON}</p>`;
  }

  /** Stap 5: hoeveel mensen er in elke helft wonen. */
  function extraInwoners(m) {
    if (!m) return ladenHtml();
    const tegel = (h) => `
      <div class="intro-helft">
        <span class="intro-helft-naam">${h.naam}</span>
        <strong class="intro-helft-waarde">${NF_HEEL.format(h.inwoners)}</strong>
        <span class="intro-helft-meta">inwoners · ${personen(h.armPersonen)} in armoede</span>
      </div>`;
    return `
      <div class="intro-helften">${tegel(m.noord)}${tegel(m.zuid)}</div>
      <p class="intro-bron">${BRON}</p>`;
  }

  /** Stap 6 en 9: het aandeel inwoners in armoede per helft. */
  function extraPerInwoner(m) {
    if (!m) return ladenHtml();
    const tegel = (h) => `
      <div class="intro-helft">
        <span class="intro-helft-kleur" style="background:${kleurVoor(h.perInwoner, SCHAAL_PROCENT_HELFT)}"></span>
        <span class="intro-helft-naam">${h.naam}</span>
        <strong class="intro-helft-waarde">${pct(h.perInwoner, true)}</strong>
        <span class="intro-helft-meta">${NF_HEEL.format(h.armPersonen)} van de ${NF_HEEL.format(h.inwoners)} inwoners</span>
      </div>`;
    return `
      <div class="intro-helften">${tegel(m.noord)}${tegel(m.zuid)}</div>
      ${legendaHtml('Aandeel inwoners in armoede (nationale armoedegrens)', { schaal: SCHAAL_PROCENT_HELFT })}
      <p class="intro-bron">${BRON}</p>`;
  }

  function extraDrempel(m) {
    if (!m) return ladenHtml();
    return `
      <div class="intro-drempel">
        <p class="intro-drempel-label" id="intro-drempel-label">Kies een armoedegrens</p>
        <p class="intro-drempel-gekozen sr-only" aria-live="polite"></p>
        <div class="intro-drempel-stops" role="group" aria-labelledby="intro-drempel-label">
          ${DEFINITIES.map((d, i) => `
            <button type="button" class="intro-drempel-stop" data-definitie="${i}">
              <span>${d.naam}</span><small>${d.kort}</small>
            </button>`).join('')}
        </div>
        <p class="intro-drempel-boodschap">Dezelfde stad. Dezelfde mensen. Een andere armoedegrens.</p>
      </div>
      ${legendaHtml('Aandeel inwoners dat als arm telt', { geenData: true })}
      <p class="intro-bron">${BRON}</p>`;
  }

  /** Werk de keuzeknoppen en de kaartjes op de kaart bij (zonder opnieuw op te bouwen). */
  function werkDrempelBij(metOvergang = false) {
    const blok = staat.inhoud.querySelector('.intro-drempel');
    if (!blok || !staat.model) return;
    const def = DEFINITIES[staat.definitie];

    blok.querySelectorAll('.intro-drempel-stop').forEach((knop, i) => {
      knop.classList.toggle('is-actief', i === staat.definitie);
      knop.setAttribute('aria-pressed', String(i === staat.definitie));
    });
    // De uitleg staat op de kaart (kaartjes); voor schermlezers ook hier, want het paneel is de dialoog
    blok.querySelector('.intro-drempel-gekozen').textContent =
      `${def.titel}: ${def.maatstaf}. ${pct(def.stad(staat.model), true)} van de personen in Heerlen telt zo als arm.`;
    blok.querySelector('.intro-drempel-boodschap').classList.toggle('is-zichtbaar', staat.bekekenDefinities.size > 1);
    werkKaartUitlegBij(def, metOvergang);
  }

  function kiesDefinitie(index) {
    if (index === staat.definitie || staat.stap !== STAP.drempel) return;
    staat.definitie = index;
    staat.bekekenDefinities.add(index);
    animatieToken++;           // stopt de vorige overgang van kleuren en cijfer
    spoorZichtbaarheid(0, 0);  // en een nog lopende vervaging van het spoor
    werkDrempelBij(true);
    toonNiveau(KAART_DEFINITIE, 750);
  }

  /** Laat de keuze vanzelf door de definities lopen zolang stap 10 open is en niemand de knoppen heeft aangeraakt. */
  function regelAutoDraai() {
    clearInterval(staat.autoDraaiTimer);
    staat.autoDraaiTimer = null;
    if (!staat.open || staat.stap !== STAP.drempel || !staat.model || staat.autoDraaiGestopt) return;
    staat.autoDraaiTimer = setInterval(
      () => kiesDefinitie((staat.definitie + 1) % DEFINITIES.length), INTRO_CONFIG.autoDraaiMs);
  }

  function stopAutoDraai() {
    staat.autoDraaiGestopt = true;
    regelAutoDraai();
  }

  /** Paden van de kaartjes naast elkaar (stap 5, 9 en 11): eenmalig berekend, zonder achtergrond en niet zoombaar. */
  function miniKaartGeometrie(m) {
    if (!staat.miniKaart) {
      // Vlakke projectie: lengtegraad schalen met cos(breedtegraad). De viewBox ligt precies om
      // de vorm van Heerlen, zodat de kaart in elk vak zo groot mogelijk wordt.
      const schaal = (c) => (typeof c[0] === 'number' ? [c[0] * COS_BREEDTE, c[1]] : c.map(schaal));
      const alsFeature = (geom) => ({ type: 'Feature', geometry: { type: geom.type, coordinates: schaal(geom.coordinates) } });
      const vlak = m.buurten.map(b => alsFeature(b.feature.geometry));
      const geheel = { type: 'FeatureCollection', features: vlak };
      const pad = d3.geoPath(d3.geoIdentity().reflectY(true).fitSize([1000, 1000], geheel));
      const [[x0, y0], [x1, y1]] = pad.bounds(geheel);
      staat.miniKaart = {
        viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`,
        paden:   vlak.map(f => pad(f)),
        helften: m.helften.map(h => pad(alsFeature(h.feature.geometry))),
        wijken:  m.wijken.map(w => pad(alsFeature(w.geometry))),
        // maakKetens geeft [lat, lon]; terug naar [lon, lat]
        wijkgrenzen: pad(alsFeature({ type: 'MultiLineString', coordinates: m.wijkgrenzen.map(k => k.map(([lat, lon]) => [lon, lat])) })),
        spoor:   pad(alsFeature({ type: 'LineString', coordinates: INTRO_CONFIG.spoorlijn.map(([lat, lon]) => [lon, lat]) })),
        // Streepafstand in viewBox-eenheden: ongeveer 45 strepen over de breedte van de kaart
        streep:  (x1 - x0) / 45,
      };
    }
    return staat.miniKaart;
  }

  /**
   * Eén kaartje: `vlakken` is een lijst { d, waarde, kleur, titel }; zonder waarde wordt het vlak gearceerd.
   * Met `spoor` loopt de spoorlijn erdoor; `legenda` en `onderschrift` staan eronder.
   */
  function miniKaartHtml(i, { titel, sub, vlakken, spoor = false, grenzen = null, onderschrift = '', legenda = '', geheel = false }) {
    const { viewBox, streep, spoor: spoorPad } = staat.miniKaart;
    return `
      <figure class="intro-mini" style="--vertraging:${i * 140}ms">
        <figcaption>
          <span class="intro-mini-titel">${titel}</span>
          <span class="intro-mini-sub">${sub}</span>
        </figcaption>
        <svg viewBox="${viewBox}" role="img" aria-label="Kaart van Heerlen: ${escapeHtml(titel)}, ${escapeHtml(sub)}"${geheel ? ' class="is-geheel"' : ''}>
          <defs>
            <pattern id="arcering-mini-${i}" width="${streep}" height="${streep}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="${streep}" height="${streep}" fill="${INTRO_CONFIG.geenDataKleur}"/>
              <line x1="0" y1="0" x2="0" y2="${streep}" stroke="#7d838c" stroke-width="${streep * 0.3}"/>
            </pattern>
          </defs>
          ${vlakken.map(v => `<path d="${v.d}" fill="${v.waarde == null ? `url(#arcering-mini-${i})` : v.kleur}"><title>${escapeHtml(v.titel)}</title></path>`).join('')}
          ${grenzen ? `<path class="intro-mini-grens" d="${grenzen}"/>` : ''}
          ${spoor ? `<path class="intro-mini-spoor" d="${spoorPad}"/><path class="intro-mini-spoor is-streep" d="${spoorPad}"/>` : ''}
        </svg>
        ${onderschrift ? `<p class="intro-mini-stad">${onderschrift}</p>` : ''}
        ${legenda}
      </figure>`;
  }

  /**
   * De drie kaartjes van stap 5 of 9: Noord en Zuid, wijken en buurten, elk in de kleur van zijn niveau.
   * `kaarten` zijn drie items uit KAART_PER_STAP (zelfde waarde en schaal als de grote kaart).
   */
  function drieNiveausHtml(m, { sub, kaarten, tekst, legendas }) {
    const g = miniKaartGeometrie(m);
    const paden = { helft: g.helften, wijk: g.wijken, buurt: g.paden };
    const titels = { helft: 'Noord en Zuid', wijk: 'Wijken', buurt: 'Buurten' };
    return kaarten.map(({ niveau, waarde, schaal }, i) => miniKaartHtml(i, {
      titel: titels[niveau], sub,
      geheel: niveau !== 'buurt',
      spoor: true,
      grenzen: niveau === 'wijk' ? g.wijkgrenzen : null,
      vlakken: gebiedenOp(niveau).map((gb, j) => {
        const v = waarde(gb);
        return { d: paden[niveau][j], waarde: v, kleur: kleurVoor(v, schaal), titel: `${gb.naam}: ${v == null ? 'geen cijfers' : tekst[niveau](v)}` };
      }),
      legenda: legendaHtml(legendas[i], { schaal, geenData: niveau !== 'helft' }),
    })).join('');
  }

  /** Stap 5: de aantallen van Noord en Zuid (stap 2), de wijken (stap 3) en de buurten (stap 4) naast elkaar. */
  function vergelijkingAantallenHtml(m) {
    if (!m) return ladenHtml();
    const inArmoede = v => `${personen(v)} in armoede`;
    const kaartjes = drieNiveausHtml(m, {
      sub: 'aantal personen in armoede',
      kaarten: [KAART_PER_STAP.noordZuid, KAART_PER_STAP.wijken, KAART_PER_STAP.buurten],
      tekst: { helft: v => `${pct(v)} van de Heerlenaren in armoede`, wijk: inArmoede, buurt: inArmoede },
      legendas: ['Deel van alle arme Heerlenaren', 'Personen in armoede per wijk', 'Personen in armoede per buurt'],
    });
    return `<div class="intro-vergelijking-kaarten is-eigen-legenda">${kaartjes}</div>`;
  }

  /** Stap 9: hetzelfde procentueel, met net als stap 5 een eigen legenda onder elk kaartje. */
  function vergelijkingProcentHtml(m) {
    if (!m) return ladenHtml();
    const aandeel = v => `${pct(v, true)} van de inwoners in armoede`;
    const kaartjes = drieNiveausHtml(m, {
      sub: 'aandeel inwoners in armoede',
      kaarten: [KAART_PER_STAP.perInwoner, KAART_PER_STAP.wijkenProcent, KAART_PER_STAP.buurtenProcent],
      tekst: { helft: aandeel, wijk: aandeel, buurt: aandeel },
      legendas: ['Aandeel inwoners in armoede', 'Aandeel per wijk', 'Aandeel per buurt'],
    });
    return `<div class="intro-vergelijking-kaarten is-eigen-legenda">${kaartjes}</div>`;
  }

  /** Stap 11: de drie armoedegrenzen naast elkaar. */
  function vergelijkingHtml(m) {
    if (!m) return ladenHtml();
    const g = miniKaartGeometrie(m);
    const kaartjes = DEFINITIES.map((def, i) => miniKaartHtml(i, {
      titel: def.titel,
      sub:   def.kort,
      vlakken: m.buurten.map((b, j) => {
        const v = def.waarde(b);
        return { d: g.paden[j], waarde: v, kleur: kleurVoor(v), titel: `${b.naam}: ${def.tooltip(b)}` };
      }),
      onderschrift: `<strong>${pct(def.stad(m), true)}</strong> van Heerlen telt als arm`,
    })).join('');

    return `<div class="intro-vergelijking-kaarten">${kaartjes}</div>${legendaHtml('Aandeel inwoners dat als arm telt', { geenData: true })}`;
  }


  // ==========================================================================
  // PANEEL — Opbouw en navigatie
  // ==========================================================================

  function paneelHtml(index) {
    const s = STAPPEN[index];
    const knoppen = s.laatste
      ? `<button type="button" class="intro-knop" data-actie="verhalen">Ontdek de verhalen <span aria-hidden="true">→</span></button>
         <button type="button" class="intro-knop-secundair" data-actie="zelf">Verken de kaart zelf</button>`
      : `<button type="button" class="intro-knop" data-actie="volgende">${s.knop} <span aria-hidden="true">→</span></button>`;

    return `
      <div class="intro-voortgang">
        <span class="intro-teller">${index + 1} / ${STAPPEN.length}</span>
        <span class="intro-voortgang-balk"><span style="width:${((index + 1) / STAPPEN.length) * 100}%"></span></span>
        <button type="button" class="intro-overslaan" data-actie="overslaan">Introductie overslaan</button>
      </div>
      <p class="intro-kicker">${s.kicker}</p>
      <h2 class="intro-titel" id="intro-titel">${s.titel}</h2>
      <div class="intro-tekst">${typeof s.tekst === 'function' ? s.tekst(staat.model) : s.tekst}</div>
      ${s.extra ? `<div class="intro-extra">${s.extra(staat.model)}</div>` : ''}
      <div class="intro-navigatie">
        <button type="button" class="intro-vorige" data-actie="vorige" ${index === 0 ? 'disabled' : ''}>
          <span aria-hidden="true">←</span> Vorige
        </button>
        <div class="intro-navigatie-rechts">${knoppen}</div>
      </div>`;
  }

  function renderPaneel(metOvergang) {
    const vul = () => {
      staat.inhoud.innerHTML = paneelHtml(staat.stap);
      staat.paneel.scrollTop = 0;
      if (staat.stap === STAP.drempel) werkDrempelBij();
      staat.kaartUitleg.hidden = staat.stap !== STAP.drempel || !staat.model;
      regelAutoDraai();

      const vergelijking = STAPPEN[staat.stap].vergelijking;
      staat.vergelijking.hidden = !vergelijking;
      if (vergelijking) staat.vergelijking.innerHTML = vergelijking(staat.model);

      staat.status.textContent = `Stap ${staat.stap + 1} van ${STAPPEN.length}: ${STAPPEN[staat.stap].titel}`;
      requestAnimationFrame(() => pasZoomAan());
    };

    if (!metOvergang || rustig) { vul(); return; }
    staat.inhoud.classList.add('is-wisselend');
    setTimeout(() => {
      vul();
      staat.inhoud.classList.remove('is-wisselend');
      staat.inhoud.querySelector('[data-actie="volgende"]:not(:disabled), [data-actie="verhalen"], [data-actie="vorige"]')
        ?.focus({ preventScroll: true });
    }, 170);
  }

  function gaNaarStap(index) {
    if (index < 0 || index >= STAPPEN.length || index === staat.stap) return;
    const vorige = staat.stap;
    staat.stap = index;
    // Bij binnenkomst begint de armoedegrens bij de mondiale definitie
    if (index === STAP.drempel && vorige < STAP.drempel) staat.definitie = 0;
    renderPaneel(true);
    pasKaartToe(index, vorige);
  }


  // ==========================================================================
  // OPENEN EN SLUITEN
  // ==========================================================================

  function bouwOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'intro';
    overlay.className = 'intro';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="intro-kaart" aria-hidden="true"></div>
      <div class="intro-scrim" aria-hidden="true"></div>
      <section class="intro-vergelijking" aria-label="Drie armoedekaarten van Heerlen naast elkaar" hidden></section>
      <div class="intro-kaartuitleg" aria-hidden="true" hidden>
        <div class="intro-uitleg-kaart intro-uitleg-grens">
          <p class="intro-uitleg-titel"></p>
          <p class="intro-uitleg-maatstaf"></p>
          <p class="intro-uitleg-tekst"></p>
        </div>
        <p class="intro-uitleg-kaart intro-uitleg-cijfer"><strong></strong><span>van de personen in Heerlen</span></p>
      </div>
      <section class="intro-paneel" role="dialog" aria-modal="true" aria-labelledby="intro-titel">
        <div class="intro-inhoud"></div>
      </section>
      <p class="sr-only intro-status" aria-live="polite"></p>`;
    document.body.appendChild(overlay);

    staat.overlay      = overlay;
    staat.paneel       = overlay.querySelector('.intro-paneel');
    staat.inhoud       = overlay.querySelector('.intro-inhoud');
    staat.vergelijking = overlay.querySelector('.intro-vergelijking');
    staat.kaartUitleg  = overlay.querySelector('.intro-kaartuitleg');
    staat.status       = overlay.querySelector('.intro-status');

    staat.paneel.addEventListener('click', (e) => {
      const stop = e.target.closest('[data-definitie]');
      if (stop) { kiesDefinitie(Number(stop.dataset.definitie)); return; }

      switch (e.target.closest('[data-actie]')?.dataset.actie) {
        case 'volgende':      gaNaarStap(staat.stap + 1); break;
        case 'vorige':        gaNaarStap(staat.stap - 1); break;
        case 'overslaan':
        case 'zelf':          sluitIntro(); break;
        case 'verhalen':      sluitIntro(() => window.openVerhalenPaneel?.()); break;
        case 'opnieuw-laden': startLaden(); renderPaneel(false); break;
      }
    });
    ['pointerdown', 'keydown'].forEach(type => staat.paneel.addEventListener(type, (e) => {
      if (e.target.closest('.intro-drempel')) stopAutoDraai();
    }));

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (!staat.open) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { staat.kaart?.invalidateSize(); pasZoomAan(false); }, 150);
    });
  }

  function opToets(e) {
    if (e.key === 'Escape') sluitIntro();
  }

  function startLaden() {
    laadData()
      .then(model => {
        const eersteKeer = !staat.model;
        staat.model = model;
        if (eersteKeer) bouwKaartlagen();
        if (!staat.open) return;
        renderPaneel(false);
        // Stap 1 met animatie (de gemeentegrens wordt getekend), latere stappen direct
        pasKaartToe(staat.stap, staat.stap === 0 ? -1 : null);
      })
      .catch(err => {
        console.warn('Introductie: data laden mislukt', err);
        staat.laadFout = err;
        if (staat.open) renderPaneel(false);
      });
  }

  function openIntro() {
    if (!staat.overlay) bouwOverlay();
    if (staat.open) return;

    staat.open = true;
    staat.stap = 0;
    staat.definitie = 0;
    staat.bekekenDefinities = new Set([0]);
    staat.gemeentegrensGetekend = false;
    staat.spoorGetekend = false;

    staat.overlay.hidden = false;
    document.body.classList.add('intro-open');
    document.addEventListener('keydown', opToets);
    requestAnimationFrame(() => staat.overlay.classList.add('is-zichtbaar'));

    if (!staat.kaart) maakKaart(); else staat.kaart.invalidateSize();
    renderPaneel(false);

    if (staat.model) {
      staat.grensLagen.forEach(l => l.setLatLngs([]));
      pasKaartToe(0, -1);
    } else {
      startLaden();
    }
  }

  /** Sluit de intro; `daarna` draait direct na het sluiten (bijv. verhalenpaneel openen). */
  function sluitIntro(daarna) {
    if (!staat.open) return;
    staat.open = false;
    animatieToken++;
    regelAutoDraai();

    staat.overlay.classList.remove('is-zichtbaar');
    document.body.classList.remove('intro-open');
    document.removeEventListener('keydown', opToets);
    setTimeout(() => { if (!staat.open) staat.overlay.hidden = true; }, rustig ? 0 : 400);

    window.zetCookie?.(INTRO_CONFIG.gezienCookie, '1');
    window.appData?.map?.invalidateSize();

    daarna?.();
    window.toonCookieMelding?.();
  }


  // ==========================================================================
  // INITIALISATIE
  // ==========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-intro')?.addEventListener('click', openIntro);

    // Geen introductie in het splitscherm, bij terugkomst uit splitscherm/3D of via een link naar een story
    const params = new URLSearchParams(location.search);
    const overslaan = document.documentElement.classList.contains('split-pane')
      || params.get('intro') === 'uit' || params.has('story');
    const alGezien = window.leesCookie?.(INTRO_CONFIG.gezienCookie) === '1';
    if (!overslaan && (INTRO_CONFIG.altijdTonen || !alGezien)) openIntro();
    else window.toonCookieMelding?.();
  });

  window.startIntro = openIntro;
  window.sluitIntro = sluitIntro;
})();
