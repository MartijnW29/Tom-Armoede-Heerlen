// ============================================================================
// WISKUNDE.JS — Formulebuilder voor berekende variabelen
// ============================================================================

(function () {
  window.equationState = window.equationState || { operator: '+' };
  window.derivedFieldCounter = window.derivedFieldCounter || 0;

  /** Geef de visuele operator terug die in de UI wordt getoond. */
  function getEquationOperatorLabel(op) {
    return op === '+' ? '+' : op === '-' ? '−' : op === '*' ? '×' : '÷';
  }

  /** Normaliseert een naam voor een nieuwe berekende variabele. */
  function sanitizeDerivedFieldName(base) {
    const safe = String(base || 'berekend')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    return safe || 'berekend';
  }

  /** Bepaalt een duidelijke standaardnaam voor een nieuwe berekende variabele. */
  function buildDerivedFieldName(fieldA, fieldB, op, requestedName) {
    const cleanedRequested = String(requestedName || '').trim();
    if (cleanedRequested) return sanitizeDerivedFieldName(cleanedRequested);

    const opWord = op === '+' ? 'plus' : op === '-' ? 'min' : op === '*' ? 'maal' : 'gedeeld_door';
    return sanitizeDerivedFieldName(`${fieldA}_${opWord}_${fieldB}`);
  }

  /** Zorgt ervoor dat de nieuwe variabele-naam uniek blijft in de dataset. */
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

  /** Werk de voorbeeldtekst van de formulebuilder bij. */
  function updateFormulaPreview() {
    const fieldA = document.getElementById('formula-field-a')?.value || 'Variabele 1';
    const fieldB = document.getElementById('formula-field-b')?.value || 'Variabele 2';
    const op = window.equationState?.operator || '+';
    const preview = document.getElementById('formula-preview');
    if (preview) preview.textContent = `Voorbeeld: ${fieldA} ${getEquationOperatorLabel(op)} ${fieldB}`;
  }

  /** Vult de dropdowns van de formulebuilder opnieuw met de huidige velden. */
  function refreshEquationFieldOptions() {
    const fieldA = document.getElementById('formula-field-a');
    const fieldB = document.getElementById('formula-field-b');
    if (!fieldA || !fieldB) return;

    const currentA = fieldA.value;
    const currentB = fieldB.value;
    const groupedFields = typeof window.getFieldGroupsForUi === 'function'
      ? window.getFieldGroupsForUi()
      : { custom: [], standard: [...new Set((window.availableFields || []).filter(Boolean))] };

    const buildOptions = (select, currentValue) => {
      const previousValue = select.value;
      select.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- kies variabele --';
      select.appendChild(placeholder);

      const addGroup = (label, fields) => {
        const group = document.createElement('optgroup');
        group.label = label;
        fields.forEach(veld => {
          const opt = document.createElement('option');
          opt.value = veld;
          opt.textContent = veld;
          if (veld === currentValue || veld === previousValue) opt.selected = true;
          group.appendChild(opt);
        });
        if (group.children.length) select.appendChild(group);
      };

      addGroup('Zelfgemaakte variabelen', groupedFields.custom || []);
      addGroup('Basisvariabelen', groupedFields.standard || []);

      if (!select.value && currentValue) select.value = currentValue;
    };

    buildOptions(fieldA, currentA);
    buildOptions(fieldB, currentB);
    updateFormulaPreview();
  }

  /** Toont een statusbericht onder de formulebuilder. */
  function setFormulaStatus(message, type) {
    const status = document.getElementById('formula-status');
    if (!status) return;
    status.textContent = message;
    status.className = 'formula-status';
    if (type === 'success') status.classList.add('is-success');
    if (type === 'error') status.classList.add('is-error');
  }

  /** Maakt een nieuwe variabele aan op basis van twee bestaande velden. */
  function createDerivedVariable() {
    const fieldA = document.getElementById('formula-field-a')?.value;
    const fieldB = document.getElementById('formula-field-b')?.value;
    const op = window.equationState?.operator || '+';
    const fc = window.appData?.lastFC;

    if (!fieldA || !fieldB) {
      setFormulaStatus('Kies eerst twee variabelen voor de berekening.', 'error');
      return;
    }

    if (!fc?.features?.length) {
      setFormulaStatus('Laad eerst een dataset voordat je een berekende variabele maakt.', 'error');
      return;
    }

    const operatorLabel = getEquationOperatorLabel(op);
    const requestedName = document.getElementById('formula-name')?.value;
    const outputField = ensureUniqueFieldName(
      buildDerivedFieldName(fieldA, fieldB, op, requestedName),
      window.availableFields || []
    );
    window.derivedFieldCounter += 1;

    const derivedFC = JSON.parse(JSON.stringify(fc));
    derivedFC.features.forEach(feature => {
      const props = feature.properties || {};
      const a = props[fieldA];
      const b = props[fieldB];
      const numericA = (a === null || a === undefined || a === '') ? null : Number(a);
      const numericB = (b === null || b === undefined || b === '') ? null : Number(b);

      let result = null;
      if (numericA !== null && numericB !== null && Number.isFinite(numericA) && Number.isFinite(numericB)) {
        if (op === '+') result = numericA + numericB;
        if (op === '-') result = numericA - numericB;
        if (op === '*') result = numericA * numericB;
        if (op === '/' && numericB !== 0) result = numericA / numericB;
      }

      if (!feature.properties) feature.properties = {};
      feature.properties[outputField] = result;
    });

    window.appData.lastFC = derivedFC;
    if (window.multiLoaderState) window.multiLoaderState.originalData = derivedFC;

    window.customFieldNames = Array.from(new Set([...(window.customFieldNames || []), outputField]));
    window.availableFields = Array.from(new Set([...(window.availableFields || []), outputField]));
    window.initFieldSelectors?.(window.availableFields);
    refreshEquationFieldOptions();

    setFormulaStatus(`Nieuwe variabele aangemaakt: ${outputField} (${fieldA} ${operatorLabel} ${fieldB}).`, 'success');
    const firstSelector = document.querySelector('#selectors-div select.field-select-item');
    if (firstSelector) firstSelector.value = outputField;
    window.herllaadVisualisatie?.();
  }

  function bindFormulaBuilderEvents() {
    document.querySelectorAll('.formula-op')?.forEach(button => {
      button.addEventListener('click', () => {
        window.equationState.operator = button.dataset.op || '+';
        document.querySelectorAll('.formula-op').forEach(btn => btn.classList.toggle('is-active', btn === button));
        updateFormulaPreview();
      });
    });

    document.getElementById('formula-field-a')?.addEventListener('change', updateFormulaPreview);
    document.getElementById('formula-field-b')?.addEventListener('change', updateFormulaPreview);
    document.getElementById('create-formula-variable')?.addEventListener('click', createDerivedVariable);
  }

  window.refreshEquationFieldOptions = refreshEquationFieldOptions;
  window.createDerivedVariable = createDerivedVariable;

  window.initFormulaBuilder = function () {
    bindFormulaBuilderEvents();
    refreshEquationFieldOptions();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initFormulaBuilder);
  } else {
    window.initFormulaBuilder();
  }
})();
