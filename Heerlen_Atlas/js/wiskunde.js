// ============================================================================
// WISKUNDE.JS — Formulebuilder voor berekende variabelen
// ============================================================================
// Ondersteunde operatoren: + − × ÷ %
//
// De % operator berekent welk percentage veld A uitmaakt van veld B:
//   (A / B) × 100
// ============================================================================

(function () {

  // ============================================================================
  // GLOBALE STATE
  // ============================================================================

  window.equationState       = window.equationState       || { operator: '+' };
  window.derivedFieldCounter = window.derivedFieldCounter || 0;

  // ============================================================================
  // HULPFUNCTIES — Operator en naamgeving
  // ============================================================================

  /**
   * Geeft de visuele operator-label terug die in de UI wordt getoond.
   * @param {string} op - Interne operator (+, -, *, /, %)
   * @return {string} Zichtbaar symbool
   */
  function getEquationOperatorLabel(op) {
    const labels = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '%' };
    return labels[op] ?? op;
  }

  /**
   * Normaliseert een string naar een veilige variabelenaam (lowercase, underscores).
   * @param {string} base
   * @return {string}
   */
  function sanitizeDerivedFieldName(base) {
    const safe = String(base || 'berekend')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    return safe || 'berekend';
  }

  /**
   * Bepaalt een duidelijke standaardnaam voor een nieuwe berekende variabele.
   * Geeft de opgegeven naam prioriteit als die niet leeg is.
   * @param {string} fieldA
   * @param {string} fieldB
   * @param {string} op
   * @param {string} requestedName - Optionele naam van de gebruiker
   * @return {string}
   */
  function buildDerivedFieldName(fieldA, fieldB, op, requestedName) {
    const cleaned = String(requestedName || '').trim();
    if (cleaned) return sanitizeDerivedFieldName(cleaned);

    const opWord = { '+': 'plus', '-': 'min', '*': 'maal', '/': 'gedeeld_door', '%': 'pct_van' };
    return sanitizeDerivedFieldName(`${fieldA}_${opWord[op] ?? op}_${fieldB}`);
  }

  /**
   * Zorgt ervoor dat de variabelenaam uniek blijft door een oplopend suffix toe
   * te voegen als de naam al bestaat (bijv. _2, _3, …).
   * @param {string} candidate
   * @param {string[]} existingFields
   * @return {string}
   */
  function ensureUniqueFieldName(candidate, existingFields) {
    const fields = new Set((existingFields || []).filter(Boolean));
    if (!fields.has(candidate)) return candidate;

    let index = 2;
    let next = `${candidate}_${index}`;
    while (fields.has(next)) {
      index += 1;
      next = `${candidate}_${index}`;
    }
    return next;
  }

  // ============================================================================
  // BEREKENING — Per feature de nieuwe waarde uitrekenen
  // ============================================================================

  /**
   * Voert de gekozen berekening uit op twee numerieke waarden.
   * Geeft null terug als een van de waarden ongeldig is of als er gedeeld
   * wordt door nul.
   * @param {number|null} a
   * @param {number|null} b
   * @param {string} op
   * @return {number|null}
   */
  function calculateValue(a, b, op) {
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;

    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : null;
      case '%': return b !== 0 ? (a / b) * 100 : null;
      default:  return null;
    }
  }

  /**
   * Converteert een ruwe property-waarde naar een getal of null.
   * @param {*} value
   * @return {number|null}
   */
  function toNumericOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // ============================================================================
  // UI — Formulevoorbeeld en dropdowns
  // ============================================================================

  /**
   * Werkt de voorbeeldtekst bij zodra de gebruiker een veld of operator kiest.
   */
  function updateFormulaPreview() {
    const rawFieldA = document.getElementById('formula-field-a')?.value;
    const rawFieldB = document.getElementById('formula-field-b')?.value;
    const fieldA  = rawFieldA ? (window.mooieVeldnaam ? window.mooieVeldnaam(rawFieldA) : rawFieldA) : 'Variabele 1';
    const fieldB  = rawFieldB ? (window.mooieVeldnaam ? window.mooieVeldnaam(rawFieldB) : rawFieldB) : 'Variabele 2';
    const op      = window.equationState?.operator || '+';
    const preview = document.getElementById('formula-preview');

    if (!preview) return;

    if (op === '%') {
      preview.textContent = `Voorbeeld: (${fieldA} ÷ ${fieldB}) × 100`;
    } else {
      preview.textContent = `Voorbeeld: ${fieldA} ${getEquationOperatorLabel(op)} ${fieldB}`;
    }
  }

  /**
   * Bouwt de opties van één dropdown opnieuw op en behoudt de huidige selectie.
   * @param {HTMLSelectElement} select
   * @param {string} currentValue - Eerder geselecteerde waarde
   * @param {{ custom: string[], standard: string[] }} groups
   */
  function buildSelectOptions(select, currentValue, groups) {
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- kies variabele --';
    select.appendChild(placeholder);

    const addGroup = (label, fields) => {
      if (!fields || fields.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = label;
      fields.forEach(veld => {
        const opt = document.createElement('option');
        opt.value = veld;
        opt.textContent = window.mooieVeldnaam ? window.mooieVeldnaam(veld) : veld;
        if (veld === currentValue) opt.selected = true;
        group.appendChild(opt);
      });
      select.appendChild(group);
    };

    addGroup('Zelfgemaakte variabelen', groups.custom   || []);
    addGroup('Basisvariabelen',         groups.standard || []);

    // Herstel de selectie als die niet via opt.selected werd ingesteld
    if (!select.value && currentValue) select.value = currentValue;
  }

  /**
   * Vult beide dropdowns opnieuw met de huidige beschikbare velden.
   * Behoudt de huidige selectie in beide dropdowns.
   */
  function refreshEquationFieldOptions() {
    const selectA = document.getElementById('formula-field-a');
    const selectB = document.getElementById('formula-field-b');
    if (!selectA || !selectB) return;

    const currentA = selectA.value;
    const currentB = selectB.value;

    const groups = typeof window.getFieldGroupsForUi === 'function'
      ? window.getFieldGroupsForUi()
      : {
          custom:   [],
          standard: [...new Set((window.availableFields || []).filter(Boolean))]
        };

    buildSelectOptions(selectA, currentA, groups);
    buildSelectOptions(selectB, currentB, groups);
    updateFormulaPreview();
  }

  /**
   * Toont een status- of foutmelding onder de formulebuilder.
   * @param {string} message
   * @param {'success'|'error'|''} type
   */
  function setFormulaStatus(message, type) {
    const status = document.getElementById('formula-status');
    if (!status) return;
    status.textContent = message;
    status.className = 'formula-status';
    if (type === 'success') status.classList.add('is-success');
    if (type === 'error')   status.classList.add('is-error');
  }

  // ============================================================================
  // OPSLAG — Zelfgemaakte variabelen onthouden met een cookie
  // ============================================================================

  const AANGEMAAKTE_VARIABELEN_COOKIE = 'atlas_aangemaakte_variabelen';

  /** Leest de lijst met opgeslagen formules (zelfgemaakte variabelen) uit de cookie. */
  function leesOpgeslagenVariabelen() {
    try {
      const raw   = window.leesCookie?.(AANGEMAAKTE_VARIABELEN_COOKIE);
      const lijst = raw ? JSON.parse(raw) : [];
      return Array.isArray(lijst) ? lijst : [];
    } catch (e) {
      return [];
    }
  }

  /** Schrijft de lijst met formules terug naar de cookie. */
  function schrijfOpgeslagenVariabelen(lijst) {
    window.zetCookie?.(AANGEMAAKTE_VARIABELEN_COOKIE, JSON.stringify(lijst));
  }

  /** Voegt een formule toe aan de opslag (werkt 'm bij als de naam al bestaat). */
  function slaFormuleOp(outputField, fieldA, fieldB, op) {
    const lijst = leesOpgeslagenVariabelen().filter(item => item.veld !== outputField);
    lijst.push({ veld: outputField, a: fieldA, b: fieldB, op });
    schrijfOpgeslagenVariabelen(lijst);
  }

  /** Verwijdert een formule uit de opslag. */
  function verwijderFormuleUitOpslag(outputField) {
    schrijfOpgeslagenVariabelen(leesOpgeslagenVariabelen().filter(item => item.veld !== outputField));
  }

  // ============================================================================
  // HOOFDFUNCTIE — Nieuwe berekende variabele aanmaken
  // ============================================================================

  /**
   * Berekent per feature de nieuwe waarde voor een formule en registreert het
   * resultaat als beschikbaar veld. Kern-logica, herbruikt door zowel de
   * "Maak nieuwe variabele"-knop als het automatisch herstellen vanuit een cookie.
   * @return {{ outputField: string, nullCount: number }|null}
   */
  function berekenEnRegistreerVariabele(fieldA, fieldB, op, outputFieldGewenst) {
    const fc = window.appData?.lastFC;
    if (!fc?.features?.length) return null;

    const outputField = outputFieldGewenst || ensureUniqueFieldName(
      buildDerivedFieldName(fieldA, fieldB, op),
      window.availableFields || []
    );

    // Bereken de nieuwe waarden (diepe kopie zodat de originele data intact blijft)
    const derivedFC = JSON.parse(JSON.stringify(fc));
    let nullCount = 0;

    derivedFC.features.forEach(feature => {
      if (!feature.properties) feature.properties = {};
      const props    = feature.properties;
      const numericA = toNumericOrNull(props[fieldA]);
      const numericB = toNumericOrNull(props[fieldB]);
      const result   = calculateValue(numericA, numericB, op);

      if (result === null) nullCount += 1;
      props[outputField] = result;
    });

    // Sla op in de globale state
    window.appData.lastFC = derivedFC;
    if (window.multiLoaderState) window.multiLoaderState.originalData = derivedFC;

    // Registreer het nieuwe veld
    window.customFieldNames = Array.from(new Set([...(window.customFieldNames || []), outputField]));
    window.availableFields  = Array.from(new Set([...(window.availableFields  || []), outputField]));

    return { outputField, nullCount };
  }

  /**
   * Leest de UI-waarden uit, berekent per feature de nieuwe waarde,
   * voegt het resultaat toe aan de dataset en herlaadt de visualisatie.
   * Onthoudt de formule ook in een cookie zodat de variabele terugkomt
   * bij een volgend bezoek.
   */
  function createDerivedVariable() {
    const fieldA = document.getElementById('formula-field-a')?.value;
    const fieldB = document.getElementById('formula-field-b')?.value;
    const op     = window.equationState?.operator || '+';

    // Validatie
    if (!fieldA || !fieldB) {
      setFormulaStatus('Kies eerst twee variabelen voor de berekening.', 'error');
      return;
    }
    if (!window.appData?.lastFC?.features?.length) {
      setFormulaStatus('Laad eerst een dataset voordat je een berekende variabele maakt.', 'error');
      return;
    }

    // Naam bepalen
    const requestedName      = document.getElementById('formula-name')?.value;
    const outputFieldGewenst = ensureUniqueFieldName(
      buildDerivedFieldName(fieldA, fieldB, op, requestedName),
      window.availableFields || []
    );
    window.derivedFieldCounter += 1;

    const resultaat = berekenEnRegistreerVariabele(fieldA, fieldB, op, outputFieldGewenst);
    if (!resultaat) {
      setFormulaStatus('Laad eerst een dataset voordat je een berekende variabele maakt.', 'error');
      return;
    }
    const { outputField, nullCount } = resultaat;

    // Onthoud de formule zodat de variabele terugkomt bij een volgend bezoek
    slaFormuleOp(outputField, fieldA, fieldB, op);

    // Vernieuw UI
    window.initFieldSelectors?.(window.availableFields);
    refreshEquationFieldOptions();

    // Selecteer het nieuwe veld in de eerste variabele-dropdown
    const firstSelector = document.querySelector('#selectors-div select.field-select-item');
    if (firstSelector) {
      firstSelector.value = outputField;
      window.vernieuwVeldPickerInhoud?.(firstSelector);
    }

    // Statusbericht
    const mooi     = window.mooieVeldnaam || (v => v);
    const opLabel  = op === '%' ? `% van` : getEquationOperatorLabel(op);
    const nullNote = nullCount > 0 ? ` (${nullCount} feature(s) hebben geen geldige waarde)` : '';
    setFormulaStatus(
      `Nieuwe variabele aangemaakt: "${mooi(outputField)}" (${mooi(fieldA)} ${opLabel} ${mooi(fieldB)})${nullNote}.`,
      'success'
    );

    window.herllaadVisualisatie?.();
  }

  /**
   * Herstelt eerder aangemaakte (via cookie onthouden) berekende variabelen
   * voor de zojuist geladen dataset. Formules waarvan de brongegevens niet
   * (meer) beschikbaar zijn, of die al bestaan, worden overgeslagen.
   * Wordt aangeroepen nadat een nieuwe dataset is geladen.
   */
  window.herstelAangemaakteVariabelen = function () {
    const opgeslagen = leesOpgeslagenVariabelen();
    if (!opgeslagen.length) return;

    opgeslagen.forEach(({ veld, a, b, op }) => {
      if (!veld || !a || !b) return;
      if ((window.availableFields || []).includes(veld)) return; // al aanwezig
      if (!(window.availableFields || []).includes(a)) return;   // brondata niet beschikbaar
      if (!(window.availableFields || []).includes(b)) return;
      berekenEnRegistreerVariabele(a, b, op, veld);
    });
  };

  /**
   * Verwijdert een zelfgemaakte variabele: haalt 'm uit de beschikbare velden,
   * favorieten en de cookie-opslag, en reset selectoren die er nog naar wijzen.
   * @param {string} veld
   */
  window.verwijderAangemaakteVariabele = function (veld) {
    if (!veld) return;

    window.customFieldNames = (window.customFieldNames || []).filter(v => v !== veld);
    window.availableFields  = (window.availableFields  || []).filter(v => v !== veld);

    if (window.favorieteVelden?.has(veld)) {
      window.favorieteVelden.delete(veld);
      window.zetCookie?.('atlas_favoriete_velden', Array.from(window.favorieteVelden).join(','));
    }

    verwijderFormuleUitOpslag(veld);

    // Selectoren die dit veld tonen terugzetten naar "-- geen --"
    document.querySelectorAll('#selectors-div select.field-select-item').forEach(sel => {
      if (sel.value === veld) sel.value = '';
    });
    [document.getElementById('formula-field-a'), document.getElementById('formula-field-b')].forEach(sel => {
      if (sel && sel.value === veld) sel.value = '';
    });

    window.vernieuwVeldSelecties?.();
    refreshEquationFieldOptions();
    updateFormulaPreview();
    window.herllaadVisualisatie?.();
  };

  // ============================================================================
  // EVENT-LISTENERS
  // ============================================================================

  function bindFormulaBuilderEvents() {
    // Operator-knoppen
    document.querySelectorAll('.formula-op')?.forEach(button => {
      button.addEventListener('click', () => {
        window.equationState.operator = button.dataset.op || '+';
        document.querySelectorAll('.formula-op').forEach(btn => {
          btn.classList.toggle('is-active', btn === button);
        });
        updateFormulaPreview();
      });
    });

    // Veld-dropdowns
    document.getElementById('formula-field-a')?.addEventListener('change', updateFormulaPreview);
    document.getElementById('formula-field-b')?.addEventListener('change', updateFormulaPreview);

    // Aanmaken-knop
    document.getElementById('create-formula-variable')?.addEventListener('click', createDerivedVariable);
  }

  // ============================================================================
  // PUBLIEKE API
  // ============================================================================

  window.refreshEquationFieldOptions = refreshEquationFieldOptions;
  window.createDerivedVariable       = createDerivedVariable;

  window.initFormulaBuilder = function () {
    bindFormulaBuilderEvents();
    refreshEquationFieldOptions();
  };

  // ============================================================================
  // INITIALISATIE
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initFormulaBuilder);
  } else {
    window.initFormulaBuilder();
  }

})();