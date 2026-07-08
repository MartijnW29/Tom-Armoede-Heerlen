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
    const fieldA  = document.getElementById('formula-field-a')?.value || 'Variabele 1';
    const fieldB  = document.getElementById('formula-field-b')?.value || 'Variabele 2';
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
        opt.textContent = veld;
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
  // HOOFDFUNCTIE — Nieuwe berekende variabele aanmaken
  // ============================================================================

  /**
   * Leest de UI-waarden uit, berekent per feature de nieuwe waarde,
   * voegt het resultaat toe aan de dataset en herlaadt de visualisatie.
   */
  function createDerivedVariable() {
    const fieldA = document.getElementById('formula-field-a')?.value;
    const fieldB = document.getElementById('formula-field-b')?.value;
    const op     = window.equationState?.operator || '+';
    const fc     = window.appData?.lastFC;

    // Validatie
    if (!fieldA || !fieldB) {
      setFormulaStatus('Kies eerst twee variabelen voor de berekening.', 'error');
      return;
    }
    if (!fc?.features?.length) {
      setFormulaStatus('Laad eerst een dataset voordat je een berekende variabele maakt.', 'error');
      return;
    }

    // Naam bepalen
    const requestedName = document.getElementById('formula-name')?.value;
    const outputField   = ensureUniqueFieldName(
      buildDerivedFieldName(fieldA, fieldB, op, requestedName),
      window.availableFields || []
    );
    window.derivedFieldCounter += 1;

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

    // Vernieuw UI
    window.initFieldSelectors?.(window.availableFields);
    refreshEquationFieldOptions();

    // Selecteer het nieuwe veld in de eerste variabele-dropdown
    const firstSelector = document.querySelector('#selectors-div select.field-select-item');
    if (firstSelector) firstSelector.value = outputField;

    // Statusbericht
    const opLabel  = op === '%'
      ? `% van`
      : getEquationOperatorLabel(op);
    const nullNote = nullCount > 0 ? ` (${nullCount} feature(s) hebben geen geldige waarde)` : '';
    setFormulaStatus(
      `Nieuwe variabele aangemaakt: "${outputField}" (${fieldA} ${opLabel} ${fieldB})${nullNote}.`,
      'success'
    );

    window.herllaadVisualisatie?.();
  }

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