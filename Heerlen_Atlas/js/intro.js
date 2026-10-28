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
    // van het spoor liggen (De Koumen, Nieuw Lotbroek-Noord, In de Cramer en
    // Ten Esschen) horen bij Noord.
    noordBuurten: [
      'BU09171000', 'BU09171001', 'BU09171100', 'BU09171101', 'BU09171200', 'BU09171201',
      'BU09171300', 'BU09171301', 'BU09171400', 'BU09172000', 'BU09172001', 'BU09172002',
      'BU09172003', 'BU09172004', 'BU09172100', 'BU09172101', 'BU09172200', 'BU09172201',
      'BU09172300', 'BU09172400', 'BU09172401', 'BU09172402', 'BU09173000', 'BU09173001',
      'BU09173002', 'BU09173100', 'BU09173101', 'BU09173102', 'BU09173103', 'BU09173200',
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

    // Stap 4: de armoedegrens-schuif loopt vanzelf door de definities tot je hem aanraakt
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

  const paletKleur = (t) => d3.interpolateBlues(0.08 + 0.92 * t);

  /** Kleur bij een aandeel (0–100%) op de vaste, lineaire schaal. */
  function kleurVoor(waarde) {
    if (waarde == null || !Number.isFinite(waarde)) return INTRO_CONFIG.geenDataKleur;
    return paletKleur(Math.max(0, Math.min(waarde, INTRO_CONFIG.kleurMax)) / INTRO_CONFIG.kleurMax);
  }

  /** Legenda van de vaste kleurschaal. */
  function legendaHtml(titel) {
    const stops = d3.range(0, 1.0001, 0.1).map(t => `${paletKleur(t)} ${Math.round(t * 100)}%`).join(', ');
    const ticks = INTRO_CONFIG.legendaWaarden.map(v =>
      `<span style="left:${(v / INTRO_CONFIG.kleurMax) * 100}%">${v}%</span>`).join('');
    return `
      <div class="intro-legenda">
        <div class="intro-legenda-titel">${escapeHtml(titel)}</div>
        <div class="intro-legenda-balk" style="background: linear-gradient(90deg, ${stops})"></div>
        <div class="intro-legenda-ticks">${ticks}</div>
      </div>`;
  }


  // ==========================================================================
  // ARMOEDEDEFINITIES — Stap 4 en 5
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
  // STAPPEN — Teksten en knoppen (tekst volgens het script)
  // ==========================================================================

  const STAPPEN = [
    {
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
      kicker: 'Noord en zuid',
      titel:  'Eén lijn door Heerlen',
      tekst: `
        <p>Heerlen wordt soms beschreven als een stad die in tweeën wordt gedeeld: ten noorden van de
        spoorlijn en ten zuiden van de spoorlijn.</p>
        <p>Wanneer we naar inkomen kijken, lijkt deze indeling betekenisvol. In het noorden vinden we
        een groter aandeel mensen met een laag inkomen dan in het zuiden.</p>
        <p>Het is verleidelijk om hier een eenvoudig beeld van te maken: <strong>Noord is arm. Zuid niet.</strong></p>
        <p>Maar wat gebeurt er als we de grenzen anders trekken?</p>`,
      extra: extraNoordZuid,
      knop: 'Verander de grenzen',
    },
    {
      kicker: 'Buurten',
      titel:  'Dezelfde stad. Andere grenzen.',
      tekst: `
        <p>Laten we de grenzen nu anders trekken. In plaats van Heerlen in noord en zuid te verdelen,
        kunnen we naar afzonderlijke buurten kijken. Het eenvoudige noord-zuidbeeld begint uiteen te
        vallen. Buurten binnen dezelfde helft van de stad kunnen er heel verschillend uitzien.</p>
        <p class="intro-nadruk">De data is niet veranderd. De grenzen zijn veranderd.</p>
        <p>En daardoor verandert het patroon dat we zien. Maar geografische grenzen zijn niet de enige
        grenzen die we trekken.</p>`,
      extra: extraBuurten,
      knop: 'Verander de armoedegrens',
    },
    {
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
      laatste: true,
    },
  ];

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
    autoDraaiGestopt: false,   // na de eerste aanraking blijft de schuif voorgoed stil
    model: null,
    laadFout: null,
    laadBelofte: null,

    overlay: null, paneel: null, inhoud: null, status: null, vergelijking: null,
    kaartUitleg: null,    // de kaartjes bij de gekozen armoedegrens (stap 4)
    getoondCijfer: null,  // het aandeel dat het grote cijfer nu laat zien (telt mee bij een wissel)
    kaart: null,
    grensLagen: [],       // gemeentegrens (halo + lijn)
    spoorLagen: [],       // het spoor (witte rand, zwarte lijn, witte blokjes)
    spoorZicht: 0,
    labels: [],
    gemeentegrensGetekend: false,
    spoorGetekend: false,
    miniKaart: null,  // { viewBox, paden } van de drie kaarten in stap 5
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
        .then(([features, cijfers]) => bouwModel(features, cijfers))
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
      return {
        code,
        naam:          f.properties.buurtnaam || code,
        noord:         noordSet.has(code),
        inwoners:      c.inwoners ?? getal(f.properties.aantal_inwoners) ?? 0,
        laagInkomen:   c.laagInkomen ?? null,
        armoede:       c.armoede ?? null,
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
        waarde:  gewogenGemiddelde(lijst, b => b.laagInkomen),
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

    // De gemeentegrens: randen die bij maar één buurt horen (randSegmenten en maakKetens staan in map.js)
    const gemeentegrens = maakKetens(randSegmenten(buurten, b => b.feature.geometry).filter(s => s.buurten.length === 1));

    // Afstand van elke buurt tot het spoor (0–1): de buurtkaart "valt uiteen" vanaf de lijn
    const spoorVlak = [INTRO_CONFIG.spoorlijn.map(([lat, lon]) => [lon * COS_BREEDTE, lat])];
    buurten.forEach(b => {
      const [lon, lat] = b.zwaartepunt;
      b.afstandTotSpoor = afstandTotLijnen([lon * COS_BREEDTE, lat], spoorVlak);
    });
    const maxAfstand = Math.max(...buurten.map(b => b.afstandTotSpoor)) || 1;
    buurten.forEach(b => { b.afstandTotSpoor /= maxAfstand; });

    const uitersten = (lijst) => {
      const metWaarde = lijst.filter(b => b.laagInkomen != null).sort((a, b) => a.laagInkomen - b.laagInkomen);
      return { laagste: metWaarde[0], hoogste: metWaarde.at(-1) };
    };

    return {
      buurten,
      helften: [noord, zuid],
      noord, zuid,
      spreiding: { noord: uitersten(noord.buurten), zuid: uitersten(zuid.buurten) },
      gemeentegrens,
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

  function toonHelftLabels(zichtbaar) {
    staat.labels.forEach(m => m.getElement()?.classList.toggle('is-zichtbaar', zichtbaar));
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

    // Grenzen boven de vlakken, niet klikbaar
    kaart.createPane('introGrenzen');
    kaart.getPane('introGrenzen').style.zIndex = 450;
    kaart.getPane('introGrenzen').style.pointerEvents = 'none';

    staat.kaart = kaart;
  }

  function tooltipTekst(b) {
    switch (staat.stap) {
      case 0:  return 'Heerlen';
      case 1:  return `<strong>${b.helft.naam}</strong> · ${pct(b.helft.waarde)} laag inkomen`;
      case 2:  return `<strong>${escapeHtml(b.naam)}</strong> · ${pct(b.laagInkomen, true)} laag inkomen`;
      default: return `<strong>${escapeHtml(b.naam)}</strong> · ${DEFINITIES[staat.definitie].tooltip(b)}`;
    }
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

    const perCode = new Map(m.buurten.map(b => [b.code, b]));
    L.geoJSON(m.buurten.map(b => b.feature), {
      style: f => perCode.get(f.properties.buurtcode).stijl,
      onEachFeature: (f, laag) => {
        const b = perCode.get(f.properties.buurtcode);
        b.laag = laag;
        laag.bindTooltip(() => tooltipTekst(b), { sticky: true, direction: 'top', offset: [0, -10], className: 'intro-tooltip' });
      },
    }).addTo(kaart);

    const lijn = (opties) => L.polyline([], { pane: 'introGrenzen', interactive: false, ...opties, basisOpacity: opties.opacity });

    staat.grensLagen = [
      lijn({ color: '#ffffff', weight: 6, opacity: 0.7, lineJoin: 'round' }),
      lijn({ color: '#061826', weight: 2.2, opacity: 0.85, lineJoin: 'round' }),
    ];

    // Het spoor zoals op een topografische kaart: zwart met witte blokjes, met een witte rand.
    // Dezelfde look keert terug als schuifknop van de armoedegrens in stap 4.
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
                 <span class="intro-helft-label-uitleg">laag inkomen</span>
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

  const helftKleur = (h) => kleurVoor(h.waarde);

  function kleurDefinitie(index, duur) {
    const def = DEFINITIES[index];
    stijlOvergang(staat.model.buurten, b => ({
      fillColor: kleurVoor(def.waarde(b)), fillOpacity: 0.85, color: '#ffffff', weight: 1, opacity: 0.9,
    }), duur);
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

    staat.overlay.classList.toggle('is-vergelijking', stap === 4);
    toonHelftLabels(false);

    // De gemeentegrens wordt alleen de eerste keer getekend; daarna staat hij er altijd
    if (stap === 0 && !staat.gemeentegrensGetekend) {
      tekenGeleidelijk(staat.grensLagen, m.gemeentegrens, 1800, () => { staat.gemeentegrensGetekend = true; });
    } else {
      zetLijnenVolledig(staat.grensLagen, m.gemeentegrens);
      staat.gemeentegrensGetekend = true;
    }

    if (stap === 0) {
      // Eén stad, nog zonder cijfers
      stijlOvergang(m.helften, () => ({ fillColor: '#ffffff', fillOpacity: 0.5 }), D);
      stijlOvergang(m.buurten, () => ({ fillOpacity: 0, opacity: 0 }), D);
      spoorZichtbaarheid(0, D, () => { staat.spoorGetekend = false; });
      return;
    }

    if (stap === 1) {
      const kleurHelften = () => stijlOvergang(m.helften, h => ({ fillColor: helftKleur(h), fillOpacity: 0.85 }), D, null,
        () => toonHelftLabels(true));

      if (vanStap != null && vanStap >= 2) {
        // Terug van de buurten: buurten lossen op in hun helft
        zetLijnenVolledig(staat.spoorLagen, m.spoorlijn);
        spoorZichtbaarheid(1, D);
        stijlOvergang(m.buurten, b => ({ fillColor: helftKleur(b.helft), color: helftKleur(b.helft), opacity: 0 }), D, null, () => {
          zetStijl(m.helften, h => ({ fillColor: helftKleur(h), fillOpacity: 0.85 }));
          zetStijl(m.buurten, { fillOpacity: 0 });
          toonHelftLabels(true);
        });
      } else if (anim && !staat.spoorGetekend) {
        // Eerst de lijn door de stad trekken, dan kleuren de twee helften in
        spoorZichtbaarheid(1, 0);
        tekenGeleidelijk(staat.spoorLagen, m.spoorlijn, 1600, () => { staat.spoorGetekend = true; kleurHelften(); });
      } else {
        zetLijnenVolledig(staat.spoorLagen, m.spoorlijn);
        staat.spoorGetekend = true;
        spoorZichtbaarheid(1, D);
        zetStijl(m.buurten, { fillOpacity: 0, opacity: 0 });
        kleurHelften();
      }
      return;
    }

    // Vanaf hier: buurten, spoor volledig getekend
    zetLijnenVolledig(staat.spoorLagen, m.spoorlijn);
    staat.spoorGetekend = true;

    if (stap === 2) {
      spoorZichtbaarheid(0.5, D);
      if (vanStap === 1 && anim) {
        // De twee helften "vallen uiteen" in buurten, vanaf het spoor naar buiten
        zetStijl(m.buurten, b => ({ fillColor: helftKleur(b.helft), fillOpacity: 0.85, color: helftKleur(b.helft), weight: 1, opacity: 0 }));
        zetStijl(m.helften, { fillOpacity: 0 });
      } else {
        stijlOvergang(m.helften, () => ({ fillOpacity: 0 }), D);
      }
      stijlOvergang(m.buurten, b => ({
        fillColor: kleurVoor(b.laagInkomen), fillOpacity: 0.85, color: '#ffffff', weight: 1, opacity: 0.9,
      }), anim ? 1700 : 0, vanStap === 1 ? (b => b.afstandTotSpoor) : null);
      return;
    }

    // Stap 4 en 5: de geografische grens maakt plaats voor de armoededrempel
    spoorZichtbaarheid(0, D);
    zetStijl(m.helften, { fillOpacity: 0 });
    kleurDefinitie(staat.definitie, stap === 3 ? D : 0);
  }


  // ==========================================================================
  // KAART — Uitleg bij de gekozen armoedegrens (stap 4)
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

  /** Schuif Heerlen naar rechts tot de gemeentegrens nergens achter de kaartjes van stap 4 ligt. */
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
        <span class="intro-helft-kleur" style="background:${helftKleur(h)}"></span>
        <span class="intro-helft-naam">${h.naam}</span>
        <strong class="intro-helft-waarde">${pct(h.waarde)}</strong>
        <span class="intro-helft-meta">${h.buurten.length} buurten · ${NF_HEEL.format(h.inwoners)} inwoners</span>
      </div>`;
    return `
      <div class="intro-helften">${tegel(m.noord)}${tegel(m.zuid)}</div>
      ${legendaHtml('Aandeel inwoners met een laag inkomen (40% laagste inkomens van Nederland)')}
      <p class="intro-bron">${BRON}</p>`;
  }

  function extraBuurten(m) {
    if (!m) return ladenHtml();
    const regel = (naam, { laagste, hoogste }) => laagste && hoogste
      ? `<li><strong>${naam}</strong>: van ${pct(laagste.laagInkomen)} (${escapeHtml(laagste.naam)})
         tot ${pct(hoogste.laagInkomen)} (${escapeHtml(hoogste.naam)})</li>`
      : '';
    return `
      <ul class="intro-spreiding">
        ${regel('Noord', m.spreiding.noord)}
        ${regel('Zuid', m.spreiding.zuid)}
      </ul>
      ${legendaHtml('Aandeel inwoners met een laag inkomen (40% laagste inkomens van Nederland)')}
      <p class="intro-bron">${BRON} Grijs: te weinig inwoners voor cijfers.</p>`;
  }

  function extraDrempel(m) {
    if (!m) return ladenHtml();
    return `
      <div class="intro-drempel">
        <p class="intro-drempel-label">Kies een armoedegrens</p>
        <p class="intro-drempel-gekozen sr-only" aria-live="polite"></p>
        <div class="intro-drempel-baan">
          <div class="intro-drempel-spoor" aria-hidden="true">
            ${DEFINITIES.map((d, i) => `<span class="intro-drempel-punt" style="--f:${i / (DEFINITIES.length - 1)}"></span>`).join('')}
          </div>
          <div class="intro-drempel-lijn" aria-hidden="true"></div>
          <input class="intro-drempel-invoer" type="range" min="0" max="${DEFINITIES.length - 1}" step="1"
                 value="${staat.definitie}" aria-label="Kies waar de armoedegrens ligt" />
        </div>
        <div class="intro-drempel-stops">
          ${DEFINITIES.map((d, i) => `
            <button type="button" class="intro-drempel-stop" data-definitie="${i}">
              <span>${d.naam}</span><small>${d.kort}</small>
            </button>`).join('')}
        </div>
        <p class="intro-drempel-boodschap">Dezelfde stad. Dezelfde mensen. Een andere armoedegrens.</p>
      </div>
      ${legendaHtml('Aandeel inwoners dat als arm telt')}
      <p class="intro-bron">${BRON} Grijs: te weinig inwoners voor cijfers.</p>`;
  }

  /** Werk de armoedegrens-schuif en de kaartjes op de kaart bij (zonder opnieuw op te bouwen). */
  function werkDrempelBij(metOvergang = false) {
    const blok = staat.inhoud.querySelector('.intro-drempel');
    if (!blok || !staat.model) return;
    const def = DEFINITIES[staat.definitie];

    blok.style.setProperty('--pos', String(staat.definitie / (DEFINITIES.length - 1)));
    const invoer = blok.querySelector('.intro-drempel-invoer');
    invoer.value = String(staat.definitie);
    invoer.setAttribute('aria-valuetext', `${def.titel}: ${def.kort}`);
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
    if (index === staat.definitie || staat.stap !== 3) return;
    staat.definitie = index;
    staat.bekekenDefinities.add(index);
    animatieToken++;           // stopt de vorige overgang van kleuren en cijfer
    spoorZichtbaarheid(0, 0);  // en een nog lopende vervaging van het spoor
    werkDrempelBij(true);
    kleurDefinitie(index, 750);
  }

  /** Laat de schuif vanzelf door de definities lopen zolang stap 4 open is en niemand hem heeft aangeraakt. */
  function regelAutoDraai() {
    clearInterval(staat.autoDraaiTimer);
    staat.autoDraaiTimer = null;
    if (!staat.open || staat.stap !== 3 || !staat.model || staat.autoDraaiGestopt) return;
    staat.autoDraaiTimer = setInterval(
      () => kiesDefinitie((staat.definitie + 1) % DEFINITIES.length), INTRO_CONFIG.autoDraaiMs);
  }

  function stopAutoDraai() {
    staat.autoDraaiGestopt = true;
    regelAutoDraai();
  }

  /** Drie kaarten naast elkaar over het hele kaartgebied (stap 5), zonder achtergrond en niet zoombaar. */
  function vergelijkingHtml(m) {
    if (!m) return ladenHtml();

    if (!staat.miniKaart) {
      // Vlakke projectie: lengtegraad schalen met cos(breedtegraad). De viewBox ligt precies om
      // de vorm van Heerlen, zodat de kaart in elk vak zo groot mogelijk wordt.
      const schaal = (c) => (typeof c[0] === 'number' ? [c[0] * COS_BREEDTE, c[1]] : c.map(schaal));
      const vlak = m.buurten.map(b => ({ type: 'Feature', geometry: { type: b.feature.geometry.type, coordinates: schaal(b.feature.geometry.coordinates) } }));
      const geheel = { type: 'FeatureCollection', features: vlak };
      const pad = d3.geoPath(d3.geoIdentity().reflectY(true).fitSize([1000, 1000], geheel));
      const [[x0, y0], [x1, y1]] = pad.bounds(geheel);
      staat.miniKaart = { viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, paden: vlak.map(f => pad(f)) };
    }

    const kaartjes = DEFINITIES.map((def, i) => `
      <figure class="intro-mini" style="--vertraging:${i * 140}ms">
        <figcaption>
          <span class="intro-mini-titel">${def.titel}</span>
          <span class="intro-mini-sub">${def.kort}</span>
        </figcaption>
        <svg viewBox="${staat.miniKaart.viewBox}" role="img" aria-label="Kaart van Heerlen volgens de ${def.titel.toLowerCase()}">
          ${m.buurten.map((b, j) => `<path d="${staat.miniKaart.paden[j]}" fill="${kleurVoor(def.waarde(b))}"><title>${escapeHtml(b.naam)}: ${escapeHtml(def.tooltip(b))}</title></path>`).join('')}
        </svg>
        <p class="intro-mini-stad"><strong>${pct(def.stad(m), true)}</strong> van Heerlen telt als arm</p>
      </figure>`).join('');

    return `<div class="intro-vergelijking-kaarten">${kaartjes}</div>${legendaHtml('Aandeel inwoners dat als arm telt')}`;
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
      <div class="intro-tekst">${s.tekst}</div>
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
      if (staat.stap === 3) werkDrempelBij();
      staat.kaartUitleg.hidden = staat.stap !== 3 || !staat.model;
      regelAutoDraai();

      staat.vergelijking.hidden = staat.stap !== 4;
      if (staat.stap === 4) staat.vergelijking.innerHTML = vergelijkingHtml(staat.model);

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
    // Vanuit stap 3 begint de armoedegrens bij de mondiale definitie
    if (index === 3 && vorige < 3) staat.definitie = 0;
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
    staat.paneel.addEventListener('input', (e) => {
      if (e.target.matches('.intro-drempel-invoer')) kiesDefinitie(Number(e.target.value));
    });

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
