// ============================================================================
// CBS-HISTORIE.JS — Heerlen Opportunity Atlas
// Vult de atlas aan met CBS "Kerncijfers wijken en buurten" (StatLine).
//
// PDOK levert alleen 2023 t/m 2025 (2022 is daar in 2026 verdwenen). Voor 2013 t/m 2022 halen we de cijfers uit
// de CBS OData-tabellen en hangen we ze aan de kaartvormen van het vroegste
// PDOK-jaar (gekoppeld op buurt-/wijkcode). In de PDOK-jaren vult CBS de velden
// aan die PDOK leeg laat (zoals de inkomens van 2024) of niet heeft (personen in
// armoede). De CBS-veldnamen (bijv. "AantalInwoners_5") worden vertaald naar de
// PDOK-namen (bijv. "aantal_inwoners"), zodat dezelfde variabele door alle jaren heen werkt.
// Ook gebruikt door de 3D-kaart (window.vulCbsAan).
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATIE
  // ==========================================================================

  // CBS-tabelcodes per jaar (Kerncijfers wijken en buurten <jaar>)
  const CBS_TABELLEN = {
    2013: '82339NED', 2014: '82931NED', 2015: '83220NED', 2016: '83487NED',
    2017: '83765NED', 2018: '84286NED', 2019: '84583NED', 2020: '84799NED',
    2021: '85039NED', 2022: '85318NED', 2023: '85618NED', 2024: '85984NED', 2025: '86165NED',
  };

  const CBS_BASIS_URL      = 'https://opendata.cbs.nl/ODataApi/OData';
  const GEMEENTE_CODE_DEEL = '0917';   // Heerlen (komt voor in GM0917, WK0917xx, BU0917xxxx)
  const CBS_CODE_REGEX     = /^(GM|WK|BU)0917/;
  const PDOK_ONBEKEND      = -99990;   // PDOK geeft -99997 e.d. voor geheim of onbekend

  // Vertaaltabel CBS → PDOK.
  // Sleutel: CBS-veldnaam zonder volgnummer, gevolgd door "|" en de eenheid waar
  // dezelfde naam meerdere keren voorkomt (stroom kWh / gas m³).
  // Waarde: PDOK-veldnaam. Is de PDOK-naam een percentage en levert CBS in dat
  // jaar aantallen, dan rekenen we automatisch om (zie `noemer`).
  const NAAR_PDOK = {
    // Bevolking
    AantalInwoners: 'aantal_inwoners', Mannen: 'mannen', Vrouwen: 'vrouwen',
    GeboorteTotaal: 'geboorte_totaal', GeboorteRelatief: 'geboortes_per_1000_inwoners',
    SterfteTotaal: 'sterfte_totaal', SterfteRelatief: 'sterfte_relatief',
    Bevolkingsdichtheid: 'bevolkingsdichtheid_inwoners_per_km2',
    k_0Tot15Jaar: 'percentage_personen_0_tot_15_jaar',
    k_15Tot25Jaar: 'percentage_personen_15_tot_25_jaar',
    k_25Tot45Jaar: 'percentage_personen_25_tot_45_jaar',
    k_45Tot65Jaar: 'percentage_personen_45_tot_65_jaar',
    k_65JaarOfOuder: 'percentage_personen_65_jaar_en_ouder',
    Ongehuwd: 'percentage_ongehuwd', Gehuwd: 'percentage_gehuwd',
    Gescheiden: 'percentage_gescheid', Verweduwd: 'percentage_verweduwd',
    WestersTotaal: 'percentage_westerse_migratieachtergrond',
    NietWestersTotaal: 'percentage_niet_westerse_migratieachtergrond',
    Marokko: 'percentage_uit_marokko',
    NederlandseAntillenEnAruba: 'percentage_uit_nederlandse_antillen_en_aruba',
    Suriname: 'percentage_uit_suriname', Turkije: 'percentage_uit_turkije',
    OverigNietWesters: 'percentage_overige_nietwestersemigratieachtergrond',

    // Huishoudens
    HuishoudensTotaal: 'aantal_huishoudens',
    Eenpersoonshuishoudens: 'percentage_eenpersoonshuishoudens',
    HuishoudensZonderKinderen: 'percentage_huishoudens_zonder_kinderen',
    HuishoudensMetKinderen: 'percentage_huishoudens_met_kinderen',
    GemiddeldeHuishoudensgrootte: 'gemiddelde_huishoudsgrootte',

    // Wonen
    Woningvoorraad: 'woningvoorraad',
    GemiddeldeWOZWaardeVanWoningen: 'gemiddelde_woningwaarde',
    GemiddeldeWoningwaarde: 'gemiddelde_woningwaarde',
    PercentageEengezinswoning: 'percentage_eengezinswoning',
    PercentageMeergezinswoning: 'percentage_meergezinswoning',
    PercentageBewoond: 'percentage_bewoond',
    PercentageOnbewoond: 'percentage_leegstand_woningen',
    PercentageLeegstaand: 'percentage_leegstand_woningen',
    Koopwoningen: 'percentage_koopwoningen', HuurwoningenTotaal: 'percentage_huurwoningen',
    InBezitWoningcorporatie: 'perc_huurwoningen_in_bezit_woningcorporaties',
    InBezitOverigeVerhuurders: 'perc_huurwoningen_in_bezit_overige_verhuurders',
    EigendomOnbekend: 'percentage_woningen_met_eigendom_onbekend',
    BouwjaarVoor2000: 'percentage_bouwjaarklasse_tot_2000',
    BouwjaarVanaf2000: 'percentage_bouwjaarklasse_vanaf_2000',
    BouwjaarMeerDanTienJaarGeleden: 'perc_bouwjaar_meer_dan_10_jaar_geleden',
    BouwjaarAfgelopenTienJaar: 'perc_bouwjaar_afgelopen_10_jaar',
    PercentageWoningenMetStadsverwarming: 'percentage_woningen_met_stadsverwarming',
    NieuwbouwWoningen: 'aantal_nieuwbouw_woningen', NietWoningvoorraad: 'aantal_niet_woningvoorraad',
    NieuwbouwNietWoningen: 'aantal_nieuwbouw_niet_woningen', OnbewoondeWoningen: 'percentage_onbewoond',
    PercentageTussenwoningEengezins: 'perc_eengezinswoning_tussenwoning',
    PercentageHoekwoningEengezins: 'perc_eengezinswoning_hoekwoning',
    PercentageTweeOnderEenKapWoningEe: 'perc_eengezinswoning_2onder1kap',
    PercentageVrijstaandeWoningEengezins: 'perc_eengezinswoning_vrijstaand',

    // Energie: elektriciteit (kWh)
    'GemiddeldeElektriciteitsleveringTotaal|kWh': 'gemiddeld_elektriciteitsverbruik_totaal',
    'GemiddeldElektriciteitsverbruikTotaal|kWh': 'gemiddeld_elektriciteitsverbruik_totaal',
    'Appartement|kWh': 'gemiddeld_elektriciteitsverbruik_appartement',
    'Tussenwoning|kWh': 'gemiddeld_elektriciteitsverbruik_tussenwoning',
    'Hoekwoning|kWh': 'gemiddeld_elektriciteitsverbruik_hoekwoning',
    'TweeOnderEenKapWoning|kWh': 'gem_elektriciteitsverbruik_2_onder_1_kap_woning',
    'VrijstaandeWoning|kWh': 'gem_elektriciteitsverbruik_vrijstaande_woning',
    'Huurwoning|kWh': 'gemiddeld_elektriciteitsverbruik_huurwoning',
    'EigenWoning|kWh': 'gemiddeld_elektriciteitsverbruikkoopwoning',
    'Koopwoning|kWh': 'gemiddeld_elektriciteitsverbruikkoopwoning',
    // Energie: aardgas (m³)
    'GemiddeldAardgasverbruikTotaal|m³': 'gemiddeld_gasverbruik_totaal',
    'Appartement|m³': 'gemiddeld_gasverbruik_appartement',
    'Tussenwoning|m³': 'gemiddeld_gasverbruik_tussenwoning',
    'Hoekwoning|m³': 'gemiddeld_gasverbruik_hoekwoning',
    'TweeOnderEenKapWoning|m³': 'gemiddeld_gasverbruik_2_onder_1_kap_woning',
    'VrijstaandeWoning|m³': 'gemiddeld_gasverbruik_vrijstaande_woning',
    'Huurwoning|m³': 'gemiddeld_gasverbruik_huurwoning',
    'EigenWoning|m³': 'gemiddeld_gasverbruikkoopwoning',
    'Koopwoning|m³': 'gemiddeld_gasverbruikkoopwoning',
    // Energie vanaf 2024
    GemiddeldeElektriciteitslevering: 'gemiddelde_elektriciteitslevering',
    GemiddeldeElektriciteitsteruglevering: 'gemiddelde_elektriciteitsteruglevering',
    GemiddeldAardgasverbruik: 'gemiddeld_aardgasverbruik',
    AardgasvrijeWoningen: 'percentage_aardgasvrije_woningen', Aardgaswoningen: 'percentage_aardgaswoningen',
    WoningenMetZonnestroom: 'percentage_woningen_met_zonnestroom',

    // Opleiding, werk en inkomen
    OpleidingsniveauLaag: 'opleidingsniveau_laag',
    OpleidingsniveauMiddelbaar: 'opleidingsniveau_middelbaar',
    OpleidingsniveauHoog: 'opleidingsniveau_hoog',
    BasisonderwijsVmboMbo1: 'aantal_personen_met_bvm_als_hoogst_beh_ond_niv',
    HavoVwoMbo24: 'aantal_personen_met_hvm_als_hoogst_beh_ond_niv',
    HboWo: 'aantal_personen_met_hw_als_hoogst_beh_ond_niv',
    LeerlingenPo: 'aantal_leerlingen_primair_onderwijs', LeerlingenVoInclVavo: 'aantal_leerlingen_voortgezet_onderwijs',
    StudentenMboExclExtranei: 'aantal_studenten_mbo', StudentenHbo: 'aantal_studenten_hbo', StudentenWo: 'aantal_studenten_wo',
    Nettoarbeidsparticipatie: 'netto_arbeidsparticipatie',
    PercentageWerknemers: 'percentage_werknemers',
    PercentageZelfstandigen: 'percentage_zelfstandigen',
    WerkzameBeroepsbevolking: 'aantal_pers_werkzame_beroepsbevolking',
    WerknemersMetVasteArbeidsrelatie: 'percentage_werknemers_met_vaste_arbeidsrelatie',
    WerknemersMetFlexibeleArbeidsrelatie: 'percentage_werknemers_met_flexibele_arbeidsrelatie',
    AantalInkomensontvangers: 'aantal_inkomensontvangers',
    GemiddeldInkomenPerInkomensontvanger: 'gemiddeld_inkomen_per_inkomensontvanger',
    GemiddeldInkomenPerInwoner: 'gemiddeld_inkomen_per_inwoner',
    k_40PersonenMetLaagsteInkomen: 'percentage_personen_met_laag_inkomen',
    k_20PersonenMetHoogsteInkomen: 'percentage_personen_met_hoog_inkomen',
    PersonenMetLaagInkomen: 'percentage_personen_met_laag_inkomen',
    PersonenMetHoogInkomen: 'percentage_personen_met_hoog_inkomen',
    GemGestandaardiseerdInkomenVanHuish: 'gemiddeld_gestandaardiseerd_inkomen_van_huishoudens',
    GemGestandaardiseerdInkomen: 'gemiddeld_gestandaardiseerd_inkomen_van_huishoudens',
    k_40HuishoudensMetLaagsteInkomen: 'percentage_huishoudens_met_laag_inkomen',
    k_20HuishoudensMetHoogsteInkomen: 'percentage_huishoudens_met_hoog_inkomen',
    HuishoudensMetLaagInkomen: 'percentage_huishoudens_met_laag_inkomen',
    HuishoudensMetHoogInkomen: 'percentage_huishoudens_met_hoog_inkomen',
    HuishoudensMetLageKoopkracht: 'percentage_huishoudens_met_lage_koopkracht',
    HuishoudensMetEenLaagInkomen: 'percentage_huishoudens_met_lage_koopkracht',  // zelfde maat, PDOK-naam
    PersonenInArmoede: 'percentage_personen_in_armoede',                       // vanaf 2024
    PersonenTot25BovenArmoedegrens: 'percentage_personen_tot_25_procent_boven_armoedegrens',
    HuishOnderOfRondSociaalMinimum: 'percentage_huishoudens_onder_of_rond_sociaal_minimum',
    HuishoudensTot110VanSociaalMinimum: 'huishoudens_tot_110_percent_van_sociaal_minimum',
    HuishoudensTot120VanSociaalMinimum: 'huishoudens_tot_120_percent_van_sociaal_minimum',
    MediaanVermogenVanParticuliereHuish: 'mediaan_vermogen_van_particuliere_huish',

    // Uitkeringen en zorg
    PersonenPerSoortUitkeringBijstand: 'aantal_personen_met_een_alg_bijstandsuitkering_tot',
    PersonenPerSoortUitkeringAO: 'aantal_personen_met_een_ao_uitkering_totaal',
    PersonenPerSoortUitkeringWW: 'aantal_personen_met_een_ww_uitkering_totaal',
    PersonenPerSoortUitkeringAOW: 'aantal_personen_met_een_aow_uitkering_totaal',
    PersonenMetEenWWBUitkeringTotaal: 'aantal_personen_met_een_alg_bijstandsuitkering_tot',
    PersonenMetEenAOUitkeringTotaal: 'aantal_personen_met_een_ao_uitkering_totaal',
    PersonenMetEenWWUitkeringTotaal: 'aantal_personen_met_een_ww_uitkering_totaal',
    PersonenMetEenAOWUitkeringTotaal: 'aantal_personen_met_een_aow_uitkering_totaal',
    JongerenMetJeugdzorgInNatura: 'aantal_jongeren_met_jeugdzorg_in_natura',
    PercentageJongerenMetJeugdzorg: 'percentage_jongeren_met_jeugdzorg_in_natura',
    PercentageJongerenJeugdzorgInNatura: 'percentage_jongeren_met_jeugdzorg_in_natura',
    WmoClienten: 'aantal_wmo_clienten',
    WmoClientenRelatief: 'aantal_wmo_clienten_per_1000_inwoners',

    // Bedrijven en voertuigen
    BedrijfsvestigingenTotaal: 'aantal_bedrijfsvestigingen',
    ALandbouwBosbouwEnVisserij: 'aantal_bedrijven_landbouw_bosbouw_visserij',
    BFNijverheidEnEnergie: 'aantal_bedrijven_nijverheid_energie',
    GIHandelEnHoreca: 'aantal_bedrijven_handel_en_horeca',
    HJVervoerInformatieEnCommunicatie: 'aantal_bedrijven_vervoer_informatie_communicatie',
    KLFinancieleDienstenOnroerendGoed: 'aantal_bedrijven_financieel_onroerend_goed',
    MNZakelijkeDienstverlening: 'aantal_bedrijven_zakelijke_dienstverlening',
    OQOverheidOnderwijsEnZorg: 'aantal_bedrijven_overheid_onderwijs_en_zorg',
    RUCultuurRecreatieOverigeDiensten: 'aantal_bedrijven_cultuur_recreatie_overige',
    PersonenautoSTotaal: 'personenautos_totaal',
    PersonenautoSBrandstofBenzine: 'aantal_personenautos_met_brandstof_benzine',
    PersonenautoSOverigeBrandstof: 'aantal_personenautos_met_overige_brandstof',
    PersonenautoSPerHuishouden: 'personenautos_per_huishouden',
    PersonenautoSNaarOppervlakte: 'personenautos_per_km2',
    Motorfietsen: 'motortweewielers_totaal', Motortweewielers: 'motortweewielers_totaal',

    // Voorzieningen en ruimte
    AfstandTotHuisartsenpraktijk: 'huisartsenpraktijk_gemiddelde_afstand_in_km',
    AfstandTotGroteSupermarkt: 'grote_supermarkt_gemiddelde_afstand_in_km',
    AfstandTotKinderdagverblijf: 'kinderdagverblijf_gemiddelde_afstand_in_km',
    AfstandTotSchool: 'basisonderwijs_gemiddelde_afstand_in_km',
    ScholenBinnen3Km: 'basisonderwijs_gemiddeld_aantal_binnen_3_km',
    OppervlakteTotaal: 'oppervlakte_totaal_in_ha',
    OppervlakteLand: 'oppervlakte_land_in_ha',
    OppervlakteWater: 'oppervlakte_water_in_ha',
    Dekkingspercentage: 'dekkingspercentage',
    MateVanStedelijkheid: 'stedelijkheid_adressen_per_km2',
    Omgevingsadressendichtheid: 'omgevingsadressendichtheid',
  };

  // Percentage-velden waarvoor CBS in sommige jaren aantallen geeft:
  // omrekenen naar % van de inwoners resp. huishoudens.
  const NOEMER_HUISHOUDENS = new Set([
    'percentage_eenpersoonshuishoudens', 'percentage_huishoudens_zonder_kinderen',
    'percentage_huishoudens_met_kinderen',
  ]);

  // CBS-velden die geen bruikbare kaartvariabele zijn (codes, namen, indeling)
  const OVERSLAAN = /^(ID|WijkenEnBuurten|RegioS|Gemeentenaam|SoortRegio|Codering|Indelingswijziging|MeestVoorkomendePostcode)/;

  const EENHEID_TAG = { '%': 'pct', 'aantal': 'aantal', 'kWh': 'kwh', 'm³': 'm3', 'ha': 'ha', 'km': 'km' };

  // Identificerende velden die van de kaartvorm meegaan naar oudere jaren
  const IDENTITEIT = ['buurtcode', 'buurtnaam', 'wijkcode', 'wijknaam', 'gemeentecode', 'gemeentenaam',
    'overlapping_wijken', 'water', 'meest_voorkomende_postcode'];


  // ==========================================================================
  // HULPFUNCTIES
  // ==========================================================================

  const zonderVolgnummer = (sleutel) => sleutel.replace(/_\d+$/, '');
  const codeVan = (p) => String(p.buurtcode || p.wijkcode || p.gemeentecode || '').trim();

  function numeriek(v) {
    if (typeof v === 'number') return v;
    return typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null;
  }

  function slug(tekst) {
    return String(tekst).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/%/g, ' procent ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /** Bepaal de veldnaam voor een CBS-onderwerp: PDOK-naam als bekend, anders een leesbare eigen naam. */
  function veldnaamVoor(topic) {
    const basis = zonderVolgnummer(topic.Key);
    const eenheid = (topic.Unit || '').trim();
    return NAAR_PDOK[`${basis}|${eenheid}`] || NAAR_PDOK[basis]
      || `cbs_${slug(topic.Title)}_${EENHEID_TAG[eenheid] || slug(eenheid)}`.replace(/_$/, '');
  }


  // ==========================================================================
  // LADEN — Eén jaar uit CBS StatLine
  // ==========================================================================

  /** Haal voor één jaar de Heerlen-rijen op, vertaald naar { code: { veldnaam: waarde } }. */
  async function laadJaar(jaar, tabel) {
    const meta = (await window.fetchJsonMetRetry(`${CBS_BASIS_URL}/${tabel}/DataProperties?$format=json`)).value;
    const geoSleutel = meta.find(m => m.Type === 'GeoDetail')?.Key || 'WijkenEnBuurten';
    const topics = meta.filter(m => m.Type === 'Topic' && !OVERSLAAN.test(m.Key));

    // Per CBS-sleutel de veldnaam en eenheid; komt een veldnaam vaker voor, dan wint de eerste
    const velden = {};
    topics.forEach(t => {
      const naam = veldnaamVoor(t);
      if (!Object.values(velden).some(v => v.naam === naam)) velden[t.Key] = { naam, eenheid: (t.Unit || '').trim() };
    });
    const sleutelVan = (naam) => Object.keys(velden).find(k => velden[k].naam === naam);
    const inwonersSleutel    = sleutelVan('aantal_inwoners');
    const huishoudensSleutel = sleutelVan('aantal_huishoudens');

    const filter = encodeURIComponent(`substringof('${GEMEENTE_CODE_DEEL}',${geoSleutel})`);
    let url = `${CBS_BASIS_URL}/${tabel}/TypedDataSet?$filter=${filter}&$format=json`;
    const rijen = [];
    while (url) {
      const json = await window.fetchJsonMetRetry(url);
      rijen.push(...(json.value || []));
      url = json['odata.nextLink'] || null;
    }

    const perCode = {};
    for (const rij of rijen) {
      const code = String(rij[geoSleutel] || '').trim();
      if (!CBS_CODE_REGEX.test(code)) continue;

      const inwoners    = numeriek(rij[inwonersSleutel]);
      const huishoudens = numeriek(rij[huishoudensSleutel]);
      const props = {};

      for (const [sleutel, { naam, eenheid }] of Object.entries(velden)) {
        let waarde = numeriek(rij[sleutel]);
        if (waarde === null) continue;

        // Sommige jaren geven aantallen waar PDOK een percentage heeft (bv. leeftijdsgroepen)
        if (naam.startsWith('percentage_') && eenheid === 'aantal') {
          const noemer = NOEMER_HUISHOUDENS.has(naam) ? huishoudens : inwoners;
          if (!noemer) continue;
          waarde = Math.round((waarde / noemer) * 100);
        }
        props[naam] = waarde;
      }
      perCode[code] = props;
    }
    return perCode;
  }


  // ==========================================================================
  // KOPPELEN — Oudere jaren aan de kaartvormen hangen, PDOK-jaren aanvullen
  // ==========================================================================

  const heeftWaarde = (v) => typeof v === 'number' && v > PDOK_ONBEKEND;

  /** Veldnamen die de atlas kent: de PDOK-namen en alles wat al in de features staat. */
  const bekendeVelden = (features) =>
    new Set([...Object.values(NAAR_PDOK), ...features.flatMap(f => Object.keys(f.properties || {}))]);

  /**
   * Vul lege of ontbrekende velden van PDOK-features aan met de CBS-cijfers van hetzelfde gebied.
   * Alleen bekende velden: CBS-velden zonder PDOK-naam zouden anders als dubbele variabele verschijnen.
   * Geeft het aantal aangevulde waarden terug.
   */
  function vulAan(features, perCode, bekend) {
    let aangevuld = 0;
    for (const f of features) {
      const cijfers = perCode[codeVan(f.properties)];
      if (!cijfers) continue;
      for (const [naam, waarde] of Object.entries(cijfers)) {
        if (bekend.has(naam) && !heeftWaarde(f.properties[naam])) { f.properties[naam] = waarde; aangevuld++; }
      }
    }
    return aangevuld;
  }

  /**
   * Koppel de CBS-cijfers aan de FeatureCollection. Jaren vóór het vroegste PDOK-jaar krijgen
   * kopieën van diens kaartvormen; in de PDOK-jaren vult CBS de lege velden aan.
   * Geeft het aantal jaren terug waar iets bij kwam.
   */
  async function laadCbsCijfers(fc) {
    if (!fc?.features?.length) return 0;

    const pdokJaren = new Set(fc.features.map(window.getYearFromFeature).filter(Number.isFinite));
    const vroegste = Math.min(...pdokJaren);
    const sjabloon = fc.features.filter(f => window.getYearFromFeature(f) === vroegste);
    const doelJaren = Object.keys(CBS_TABELLEN).map(Number).filter(j => j < vroegste || pdokJaren.has(j));
    if (!sjabloon.length || !doelJaren.length) return 0;

    const taak = async jaar => {
      try { return [jaar, await laadJaar(jaar, CBS_TABELLEN[jaar])]; }
      catch (err) { console.warn(`CBS ${jaar} laden mislukt:`, err); return [jaar, null]; }
    };
    const resultaten = await window.metMaxGelijktijdig(doelJaren, 3, taak);
    window.meldMislukteJaren(resultaten.filter(([, r]) => !r).map(([j]) => j), 'CBS');
    const geladen = resultaten.filter(([, r]) => r);

    let verwerkt = 0;
    for (const [jaar, perCode] of geladen.filter(([j]) => j < vroegste)) {
      let gekoppeld = 0;
      for (const vorm of sjabloon) {
        const cijfers = perCode[codeVan(vorm.properties)];
        if (!cijfers) continue;  // gebied bestond dit jaar niet (of had een andere code)
        const identiteit = Object.fromEntries(IDENTITEIT.filter(k => k in vorm.properties).map(k => [k, vorm.properties[k]]));
        fc.features.push({ type: 'Feature', properties: { jaar, ...identiteit, ...cijfers }, geometry: vorm.geometry });
        gekoppeld++;
      }
      if (gekoppeld) verwerkt++;
    }

    // Na de oudere jaren, zodat hun veldnamen ook doorlopen in de PDOK-jaren
    const bekend = bekendeVelden(fc.features);
    for (const [jaar, perCode] of geladen.filter(([j]) => pdokJaren.has(j))) {
      if (vulAan(fc.features.filter(f => window.getYearFromFeature(f) === jaar), perCode, bekend)) verwerkt++;
    }
    return verwerkt;
  }

  /** Eén PDOK-jaar aanvullen (3D-kaart). Geeft het aantal aangevulde waarden terug. */
  async function vulCbsAan(features, jaar) {
    const tabel = CBS_TABELLEN[jaar];
    return tabel ? vulAan(features, await laadJaar(jaar, tabel), bekendeVelden(features)) : 0;
  }

  window.laadCbsCijfers = laadCbsCijfers;
  window.vulCbsAan = vulCbsAan;
})();
