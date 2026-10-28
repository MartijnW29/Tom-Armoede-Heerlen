// ============================================================================
// GEBOUWEN.JS — Heerlen Opportunity Atlas
// De BAG-panden van Heerlen (data/gebouwen_heerlen.bin) en welke panden bij een
// variabele horen. Gedeeld door de 2D-kaart (map.js) en de 3D-kaart (huisjes-3d.html).
// ============================================================================


// ============================================================================
// CONFIGURATIE
// ============================================================================

const GEBOUWEN_CONFIG = {
  bestand:      'data/gebouwen_heerlen.bin',  // gebakken met tools/bake-gebouwen.html
  minOppervlak: 20,                           // m²; kleiner (schuurtjes, garages) wordt niet getekend

  // De 11 BAG-gebruiksfuncties. De index is het typegetal per pand in het bestand,
  // dus de volgorde moet gelijk zijn aan TYPES in tools/bake-gebouwen.html.
  typen: [
    'Woning', 'Winkel', 'Kantoor', 'Industrie / bedrijf', 'Bijeenkomst (horeca, kerk, theater)',
    'Onderwijs', 'Gezondheidszorg', 'Sport', 'Logies (hotel, pension)', 'Cel', 'Overig / onbekend',
  ],

  // Welke panden een variabele kleurt. De eerste passende regel wint; past er geen,
  // dan gaat de variabele over de bewoners en kleurt hij de woningen.
  // Functies: index in `typen`; een lege lijst kleurt geen enkel pand.
  doelgroepen: [
    { regel: /handel_en_horeca/,                           functies: [1, 4, 8],    naam: 'winkels, horeca en hotels' },
    { regel: /nijverheid/,                                 functies: [3],          naam: 'bedrijfspanden' },
    { regel: /zakelijke_dienstverlening|financi/,          functies: [2],          naam: 'kantoren' },
    { regel: /overheid_onderwijs/,                         functies: [2, 5, 6],    naam: 'kantoren, scholen en zorggebouwen' },
    { regel: /cultuur_recreatie/,                          functies: [4, 7],       naam: 'zalen, kerken, theaters en sportgebouwen' },
    { regel: /vervoer_informatie/,                         functies: [2, 3],       naam: 'kantoren en bedrijfspanden' },
    { regel: /landbouw/,                                   functies: [3, 10],      naam: 'bedrijfspanden en overige gebouwen' },
    // Leerlingen en studenten tellen waar ze wonen
    { regel: /leerlingen|studenten/,                       functies: [0],          naam: 'woningen' },
    // Voorzieningen kleuren hun eigen soort gebouw. Het BAG weet niet wélke winkel een
    // supermarkt is, dus alle panden van dat type in de buurt krijgen de kleur.
    { regel: /huisarts|apotheek|ziekenhuis/,               functies: [6],          naam: 'zorggebouwen' },
    { regel: /onderwijs|havo|vmbo|kinderdagverblijf|opvang/, functies: [5],        naam: 'scholen' },
    { regel: /supermarkt|winkels|warenhuis|zonnebank/,     functies: [1],          naam: 'winkels' },
    { regel: /cafe|restaurant/,                            functies: [4, 1],       naam: 'horeca en winkels' },  // snackbars staan vaak als winkel in het BAG
    { regel: /hotel/,                                      functies: [8],          naam: 'hotels' },
    { regel: /bioscoop|theater|muse|poppodium|bibliotheek|attractiepark/, functies: [4], naam: 'zalen, theaters en andere bijeenkomstgebouwen' },
    { regel: /sportterrein|zwembad|ijsbaan|sauna/,         functies: [7],          naam: 'sportgebouwen' },
    { regel: /station|brandweer/,                          functies: [10],         naam: 'overige gebouwen' },
    // Afstand tot groen, water, begraafplaats of een snelweg-oprit: daar hoort geen gebouw bij
    { regel: /afstand_tot_|oprit/,                         functies: [],           naam: null },
    { regel: /bedrijfsvestigingen|niet_woning/,            functies: [1, 2, 3, 4, 5, 6, 7, 8, 9], naam: 'niet-woongebouwen' },
    { regel: /oppervlakte|stedelijkheid|adressendichtheid|dekkingspercentage/, functies: null, naam: 'gebouwen' },
  ],
  woningen: { functies: [0], naam: 'woningen' },
};


// ============================================================================
// BESTAND INLEZEN — Omtrekken (kwartmeters rond een vaste oorsprong) en gegevens per pand
// ============================================================================

// Functiebits zoals de bake-tool ze per pand opslaat ('vlag'), met de index van het bijbehorende type
const VLAG_NAAR_TYPE = [[1, 0], [2, 3], [4, 1], [8, 2], [16, 5], [32, 6], [64, 4], [128, 10]];

/** ArrayBuffer van gebouwen_heerlen.bin → object met getypte arrays per pand. */
function leesGebouwen(buf) {
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic === 0x31424748) throw new Error('gebouwenbestand is nog het oude formaat (zonder gebouwtypen) — bak opnieuw met tools/bake-gebouwen.html');
  if (magic !== 0x32424748) throw new Error('onbekend gebouwenbestand');
  const N = dv.getUint32(4, true), R = dv.getUint32(8, true), V = dv.getUint32(12, true);
  const g = {
    N, R, V,
    lon0: dv.getFloat64(16, true), lat0: dv.getFloat64(24, true),
    x0: dv.getFloat32(32, true), z0: dv.getFloat32(36, true), Q: dv.getFloat32(40, true),
  };
  let p = 48;
  const neem = (T, n) => { const a = new T(buf, p, n); p += (n * T.BYTES_PER_ELEMENT + 3) & ~3; return a; };
  g.ringen = neem(Uint8Array, N); g.len = neem(Uint16Array, R); g.X = neem(Uint16Array, V); g.Z = neem(Uint16Array, V);
  g.H = neem(Uint16Array, N); g.G = neem(Int16Array, N); g.BJ = neem(Uint16Array, N); g.VO = neem(Uint16Array, N); g.vlag = neem(Uint8Array, N);
  g.typ = neem(Uint8Array, N);

  // Afgeleid: waar de ringen en hoekpunten van elk pand beginnen, zwaartepunt, oppervlak en alle functies
  g.rStart = new Uint32Array(N); g.vStart = new Uint32Array(N); g.vCnt = new Uint32Array(N);
  g.cx = new Float32Array(N); g.cz = new Float32Array(N); g.opp = new Float32Array(N); g.functies = new Uint16Array(N);
  let r = 0, v = 0;
  for (let i = 0; i < N; i++) {
    g.rStart[i] = r; g.vStart[i] = v;
    let tot = 0, sx = 0, sz = 0, a = 0;
    const n0 = g.len[r];
    for (let k = 0; k < g.ringen[i]; k++) tot += g.len[r + k];
    for (let k = 0; k < n0; k++) {
      const j = v + (k + 1) % n0;
      sx += g.X[v + k]; sz += g.Z[v + k]; a += g.X[v + k] * g.Z[j] - g.X[j] * g.Z[v + k];
    }
    g.vCnt[i] = tot; g.cx[i] = g.x0 + (sx / n0) * g.Q; g.cz[i] = g.z0 + (sz / n0) * g.Q;
    g.opp[i] = Math.abs(a) / 2 * g.Q * g.Q;                      // voetafdruk in m²
    // Een winkel met een woning erboven is ook een woning: alle functies tellen, niet alleen het type
    let functies = 1 << g.typ[i];
    for (const [bit, type] of VLAG_NAAR_TYPE) if (g.vlag[i] & bit) functies |= 1 << type;
    g.functies[i] = functies;
    r += g.ringen[i]; v += tot;
  }
  return g;
}

// x = oost, z = zuid, in meters vanaf de oorsprong (dezelfde benadering als de bake-tool)
const meterPerGraad = (g) => [111320 * Math.cos(g.lat0 * Math.PI / 180), 110574];

/** Meters in het bestand → [lon, lat]. */
function naarLonLat(g, x, z) {
  const [kx, kz] = meterPerGraad(g);
  return [g.lon0 + x / kx, g.lat0 - z / kz];
}

/** [lon, lat] → meters in het bestand. */
function naarMeters(g, lon, lat) {
  const [kx, kz] = meterPerGraad(g);
  return [(lon - g.lon0) * kx, -(lat - g.lat0) * kz];
}


// ============================================================================
// DOELGROEP — Welke panden een variabele kleurt, en bij een percentage welk deel
// ============================================================================

function doelgroep(veld) {
  const { functies, naam } = GEBOUWEN_CONFIG.doelgroepen.find(d => d.regel.test(veld || '')) || GEBOUWEN_CONFIG.woningen;
  const masker = functies ? functies.reduce((m, f) => m | 1 << f, 0) : -1;
  return { naam, past: (g, i) => (g.functies[i] & masker) !== 0 };
}

/** Getal tussen 0 en 1 dat per variabele en pand vastligt (zelfde huizen in elk jaar). */
function volgordeGetal(zaad, i) {
  let h = Math.imul(zaad ^ i, 0x45d9f3b); h = Math.imul(h ^ h >>> 16, 0x45d9f3b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
const tekstZaad = (tekst) => [...String(tekst)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/**
 * Welke panden kleuren? `buurten`: [{ panden: [index, ...], waarde }] (waarde null = geen kleur).
 * Zonder percentage krijgen alle passende panden van een buurt de kleur. Bij een percentage
 * kleurt dat deel ervan, geteld per adres (een flat met 40 woningen telt 40 keer). Welke panden
 * dat zijn is willekeurig, maar vast per variabele: het zijn geen echte adressen.
 * @returns {Uint8Array} 1 = kleuren
 */
function kiesGekleurd(g, buurten, veld, isPercentage) {
  const gekleurd = new Uint8Array(g.N);
  const { past } = doelgroep(veld);
  const zaad = tekstZaad(veld);
  const gewicht = (i) => Math.max(1, g.VO[i]);

  for (const { panden, waarde } of buurten) {
    if (waarde === null || waarde === undefined || !Number.isFinite(+waarde)) continue;
    const passend = panden.filter(i => past(g, i));
    if (!isPercentage) { for (const i of passend) gekleurd[i] = 1; continue; }

    const volgorde = new Map(passend.map(i => [i, volgordeGetal(zaad, i)]));
    passend.sort((a, b) => volgorde.get(a) - volgorde.get(b));
    const doel = Math.min(1, Math.max(0, waarde / 100)) * passend.reduce((som, i) => som + gewicht(i), 0);
    let bereikt = 0;
    const kleur = (i) => { gekleurd[i] = 1; bereikt += gewicht(i); };
    // Eerst alleen panden die er nog helemaal in passen (een grote flat schiet anders ver door),
    // daarna hooguit één pand dat het laatste gat kleiner maakt
    for (const i of passend) if (bereikt + gewicht(i) <= doel) kleur(i);
    const laatste = passend.find(i => !gekleurd[i] && bereikt + gewicht(i) / 2 <= doel);
    if (laatste !== undefined) kleur(laatste);
  }
  return gekleurd;
}


// ============================================================================
// LADEN — Eén keer ophalen, daarna uit het geheugen
// ============================================================================

let gebouwenBelofte = null;

window.Gebouwen = {
  config: GEBOUWEN_CONFIG,
  lees: leesGebouwen,
  laad(haalOp = fetch) {
    gebouwenBelofte ||= haalOp(GEBOUWEN_CONFIG.bestand)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(leesGebouwen)
      .catch(fout => { gebouwenBelofte = null; throw fout; });
    return gebouwenBelofte;
  },
  naarLonLat, naarMeters, doelgroep, kiesGekleurd,
};
