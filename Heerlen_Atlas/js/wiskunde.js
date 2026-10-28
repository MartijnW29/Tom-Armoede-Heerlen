// ============================================================================
// WISKUNDE.JS — Heerlen Opportunity Atlas
// Zelf een variabele berekenen uit twee bestaande: + − × ÷ en % (A als percentage van B).
// Formules worden in een cookie onthouden en bij een volgend bezoek opnieuw berekend;
// een story neemt de formules mee die hij gebruikt.
// ============================================================================

(function () {

  // ==========================================================================
  // CONFIGURATIE
  // ==========================================================================

  const OPERATOREN = {
    '+': { label: '+', woord: 'plus',         reken: (a, b) => a + b },
    '-': { label: '−', woord: 'min',          reken: (a, b) => a - b },
    '*': { label: '×', woord: 'maal',         reken: (a, b) => a * b },
    '/': { label: '÷', woord: 'gedeeld_door', reken: (a, b) => b !== 0 ? a / b : null },
    '%': { label: '% van', woord: 'pct_van',  reken: (a, b) => b !== 0 ? (a / b) * 100 : null },
  };

  const COOKIE_NAAM = 'atlas_aangemaakte_variabelen';
  const $ = (id) => document.getElementById(id);
  let operator = '+';
  const tijdelijk = new Map();    // formules uit een story: alleen voor dit bezoek, niet in de cookie
  const nietBewaard = new Map();  // eigen formules na "Weigeren": bewaard zodra cookies alsnog geaccepteerd worden


  // ==========================================================================
  // REKENEN EN NAAMGEVING
  // ==========================================================================

  const alsGetal = (waarde) => (waarde === null || waarde === undefined || waarde === '' || !Number.isFinite(Number(waarde))) ? null : Number(waarde);

  function bereken(a, b, op) {
    a = alsGetal(a);
    b = alsGetal(b);
    return a === null || b === null ? null : OPERATOREN[op]?.reken(a, b) ?? null;
  }

  /** Veilige veldnaam (kleine letters en underscores), uniek gemaakt met _2, _3, … */
  function nieuweVeldnaam(veldA, veldB, op, gewenst) {
    const basis = String(gewenst || '').trim() || `${veldA}_${OPERATOREN[op].woord}_${veldB}`;
    const naam = basis.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'berekend';
    const bestaand = new Set(window.availableFields);
    let uniek = naam;
    for (let i = 2; bestaand.has(uniek); i++) uniek = `${naam}_${i}`;
    return uniek;
  }


  // ==========================================================================
  // OPSLAG — Formules in een cookie: [{ veld, a, b, op }]
  // ==========================================================================

  function leesFormules() {
    try {
      const lijst = JSON.parse(window.leesCookie(COOKIE_NAAM) || '[]');
      return Array.isArray(lijst) ? lijst : [];
    } catch (_) {
      return [];
    }
  }

  const schrijfFormules = (lijst) => window.zetCookie(COOKIE_NAAM, JSON.stringify(lijst));
  const zonderFormule = (veld) => leesFormules().filter(f => f.veld !== veld);

  window.addEventListener('atlas:cookies-geaccepteerd', () => {
    if (!nietBewaard.size) return;
    schrijfFormules([...leesFormules().filter(f => !nietBewaard.has(f.veld)), ...nietBewaard.values()]);
    nietBewaard.clear();
  });


  // ==========================================================================
  // VARIABELE AANMAKEN
  // ==========================================================================

  /**
   * Bereken het nieuwe veld voor alle jaren (originalData, niet alleen het getoonde jaar)
   * en registreer het als zelfgemaakte variabele. Geeft het aantal ongeldige uitkomsten terug.
   */
  function berekenEnRegistreer(veldA, veldB, op, veld) {
    const state = window.multiLoaderState;
    const bron  = state.originalData?.features?.length ? state.originalData : window.appData.lastFC;
    if (!bron?.features?.length) return null;

    let ongeldig = 0;
    // Properties kopiëren zodat de bron intact blijft; de geometrie wordt gedeeld
    const nieuw = {
      ...bron,
      features: bron.features.map(feature => {
        const waarde = bereken(feature.properties?.[veldA], feature.properties?.[veldB], op);
        if (waarde === null) ongeldig++;
        return { ...feature, properties: { ...feature.properties, [veld]: waarde } };
      }),
    };

    state.originalData = nieuw;
    window.appData.lastFC = state.yearFilter ? window.filterFeaturesByYear(nieuw, state.yearFilter) : nieuw;
    window.customFieldNames = [...new Set([...window.customFieldNames, veld])];
    window.availableFields  = [...new Set([...window.availableFields, veld])];
    return ongeldig;
  }

  function maakVariabele() {
    const veldA = $('formula-field-a').value;
    const veldB = $('formula-field-b').value;
    if (!veldA || !veldB) return zetStatus('Kies eerst twee variabelen voor de berekening.', 'error');

    const veld = nieuweVeldnaam(veldA, veldB, operator, $('formula-name').value);
    const ongeldig = berekenEnRegistreer(veldA, veldB, operator, veld);
    if (ongeldig === null) return zetStatus('Laad eerst een dataset voordat je een berekende variabele maakt.', 'error');

    const formule = { veld, a: veldA, b: veldB, op: operator };
    if (!schrijfFormules([...zonderFormule(veld), formule])) {
      nietBewaard.set(veld, formule);
      window.meldNietBewaard();
    }

    // De nieuwe variabele meteen op de kaart
    window.initFieldSelectors(window.availableFields);
    const kaartRij = document.querySelector('#selectors-div select.field-select-item');
    kaartRij.value = veld;
    window.vernieuwVeldPickerInhoud(kaartRij);
    vernieuwFormuleVelden();
    window.herlaadVisualisatie();

    const mooi = window.mooieVeldnaam;
    zetStatus(`Nieuwe variabele aangemaakt: "${mooi(veld)}" (${mooi(veldA)} ${OPERATOREN[operator].label} ${mooi(veldB)})`
      + (ongeldig ? ` (${ongeldig} feature(s) hebben geen geldige waarde)` : '') + '.', 'success');
  }

  /** Vul zelfgemaakte variabelen aan voor features die het veld nog missen (bijv. later geladen CBS-jaren). */
  window.vulAangemaakteVariabelenAan = function (fc) {
    [...leesFormules(), ...nietBewaard.values(), ...tijdelijk.values()]
      .filter(({ veld }) => window.customFieldNames.includes(veld))
      .forEach(({ veld, a, b, op }) => fc.features.forEach(f => {
        f.properties ??= {};
        if (!(veld in f.properties)) f.properties[veld] = bereken(f.properties[a], f.properties[b], op);
      }));
  };

  /** Bereken opgeslagen formules opnieuw na het laden van een dataset (als de bronvelden er zijn). */
  window.herstelAangemaakteVariabelen = function () {
    const velden = window.availableFields;
    leesFormules()
      .filter(({ veld, a, b }) => veld && !velden.includes(veld) && velden.includes(a) && velden.includes(b))
      .forEach(({ veld, a, b, op }) => berekenEnRegistreer(a, b, op, veld));
  };

  /** Formule { veld, a, b, op } van een zelfgemaakte variabele (uit de cookie of uit een story), anders null. */
  window.formuleVan = (veld) => leesFormules().find(f => f.veld === veld) || nietBewaard.get(veld) || tijdelijk.get(veld) || null;

  /**
   * Zelfgemaakte variabelen uit een story aanmaken die deze bezoeker nog niet heeft, alleen
   * voor dit bezoek. De volgorde telt: een formule kan een eerdere formule uit de lijst gebruiken.
   */
  window.zorgVoorFormules = function (formules = []) {
    let aangemaakt = false;
    for (const f of formules) {
      const velden = window.availableFields;
      if (velden.includes(f.veld) || !OPERATOREN[f.op] || !velden.includes(f.a) || !velden.includes(f.b)) continue;
      if (berekenEnRegistreer(f.a, f.b, f.op, f.veld) === null) continue;
      tijdelijk.set(f.veld, { veld: f.veld, a: f.a, b: f.b, op: f.op });
      aangemaakt = true;
    }
    if (aangemaakt) { window.vernieuwVeldSelecties(); vernieuwFormuleVelden(); }
  };

  window.verwijderAangemaakteVariabele = function (veld) {
    tijdelijk.delete(veld);
    nietBewaard.delete(veld);
    window.customFieldNames = window.customFieldNames.filter(v => v !== veld);
    window.availableFields  = window.availableFields.filter(v => v !== veld);
    if (window.favorieteVelden.delete(veld)) window.zetCookie(COOKIES.favorieten, [...window.favorieteVelden].join(','));
    schrijfFormules(zonderFormule(veld));

    window.vernieuwVeldSelecties();  // rijen met dit veld vallen terug (de kaartrij op de standaardvariabele)
    vernieuwFormuleVelden();
    window.herlaadVisualisatie();
  };


  // ==========================================================================
  // FORMULEBOUWER — Keuzelijsten, voorbeeldtekst en status
  // ==========================================================================

  function werkVoorbeeldBij() {
    const naam = (id, standaard) => $(id).value ? window.mooieVeldnaam($(id).value) : standaard;
    const a = naam('formula-field-a', 'Variabele 1');
    const b = naam('formula-field-b', 'Variabele 2');
    $('formula-preview').textContent = operator === '%'
      ? `Voorbeeld: (${a} ÷ ${b}) × 100`
      : `Voorbeeld: ${a} ${OPERATOREN[operator].label} ${b}`;
  }

  /** Vul beide keuzelijsten opnieuw en behoud de gekozen velden (als die nog bestaan). */
  function vernieuwFormuleVelden() {
    const { custom, standard } = window.getFieldGroupsForUi();
    const alle = [...custom, ...standard];
    const isZelfgemaakt = (v) => custom.includes(v);
    const groep = (label, velden) => {
      const optgroup = Object.assign(document.createElement('optgroup'), { label });
      optgroup.append(...velden.map(v => new Option(window.mooieVeldnaam(v), v)));
      return velden.length ? [optgroup] : [];
    };
    for (const select of [$('formula-field-a'), $('formula-field-b')]) {
      const gekozen = select.value;
      select.replaceChildren(new Option('-- kies variabele --', ''),
        ...groep('Zelfgemaakte variabelen', alle.filter(isZelfgemaakt)), ...groep('Basisvariabelen', alle.filter(v => !isZelfgemaakt(v))));
      select.value = gekozen;  // bestaat het veld niet meer, dan blijft de keuze leeg
    }
    werkVoorbeeldBij();
  }

  function zetStatus(tekst, soort) {
    $('formula-status').textContent = tekst;
    $('formula-status').className = `formula-status is-${soort}`;
  }

  window.refreshEquationFieldOptions = vernieuwFormuleVelden;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.formula-op').forEach(knop => knop.addEventListener('click', () => {
      operator = knop.dataset.op;
      document.querySelectorAll('.formula-op').forEach(k => k.classList.toggle('is-active', k === knop));
      werkVoorbeeldBij();
    }));
    $('formula-field-a').addEventListener('change', werkVoorbeeldBij);
    $('formula-field-b').addEventListener('change', werkVoorbeeldBij);
    $('create-formula-variable').addEventListener('click', maakVariabele);
    vernieuwFormuleVelden();
  });

})();
