# MAINTENANCE GUIDE — Heerlen Opportunity Atlas

Quick reference voor het onderhouden en uitbreiden van de applicatie.

---

## 1. ARCHITECTUUR OVERZICHT

```
┌──────────────────────────────────────┐
│         INDEX.HTML                   │
│  (Leaflet map + sidebar controls)    │
└────────────┬─────────────────────────┘
             │
     ┌───────┴────────┬────────────┬──────────────┐
     │                │            │              │
  APP.JS          MAP.JS       IMPORTER.JS    D3_CHARTS.JS
  (Init &          (Visual)      (Import)      (Compare)
   Events)

     ↓
GLOBALSTATE: window.appData {
  map,         // Leaflet kaart-object
  dataLayer,   // L.layerGroup container
  lastFC,      // GeoJSON FeatureCollection
  filter,      // Actief filter
  compareMode, // Bool voor vergelijking
  compareFC    // 2de dataset
}
```

---

## 2. DATA-FLOW

### Normal mode (1 dataset):
```
1. User uploads/loads data → IMPORTER.JS
2. Data parsed → window.appData.lastFC
3. User selects field → APP.JS calls toonChoropleth()
4. MAP.JS bereikt waarden, breaks, kleuren
5. Legend rendered, map updated
6. User filters → APP.JS calls pasFilterToe()
7. toonChoropleth() re-run met filter
```

### Compare mode (2 datasets):
```
1. Click "Start vergelijking" → compareMode=true
2. Upload 2nd file → compareFC set
3. Select field → createCompareCharts()
4. D3_CHARTS.JS renders 2 histograms
```

---

## 3. GLOBALE STATUS OBJECT

```javascript
window.appData = {
  map,                      // L.Map instance
  dataLayer,               // L.LayerGroup
  lastFC,                  // GeoJSON FeatureCollection
  choroplethLayer,         // Current L.GeoJSON layer
  filter: {
    min,                   // Min value
    max,                   // Max value
    lowPct,                // Percentiel laag (%)
    highPct                // Percentiel hoog (%)
  },
  compareMode,             // Boolean
  compareFC                // 2nd FeatureCollection
}
```

**Wijzig dit via functie's uit app.js:**
- `pasFilterToe()` — Set filter
- `wisFilter()` — Clear filter
- `herllaadVisualisatie()` — Redraw choropleth

---

## 4. FUNCTIE-REFERENCE

### [MAP.JS] — Kernisualisaties

**Public API (global):**
```javascript
window.toonChoropleth(fc, field, opties)
  Opties: {method, palette, opacity, classes}
  
window.herprojecteerAlsNodig(fc)
  Herprojecteer RD→WGS84 automatically
```

**Key private functies:**
```javascript
haalNumeriekeWaarden(fc, veld)
  → Array of numbers or null

waardePasseertFilter(waarde, alleWaarden, filter)
  → boolean

filtreerdFeatures(fc, veld, filter)
  → Array of Features

bouwFeaturePopup(feature, veld, activeFilter, alleWaarden)
  → HTML string

berekenBreaksQuantile(waarden, aantalKlassen)
berekenBreaksEqualInterval(waarden, aantalKlassen)
  → Array of break values

tekenLegenda(breuken, kleuren, veldnaam)
  → Draws legend to #legend div
```

### [APP.JS] — Orchestration

**Key functions you'll use:**
```javascript
herllaadVisualisatie()
  Re-draw choropleth with current UI settings

pasFilterToe()
  Apply min/max/percentile filter

wisFilter()
  Clear all filters

laadVanApi(url, label)
  Fetch GeoJSON from API
```

### [IMPORTER.JS] — Data handling

**Public API:**
```javascript
window.handleImportFile(file, context)
  Auto-detect format and import
  Formats: .geojson, .json, .csv
```

### [D3_CHARTS.JS] — Graphs

**Public API:**
```javascript
window.populateFieldSelect(fc)
  Fill #field-select with numeric fields

window.createCompareCharts(fcA, fcB, field)
  Draw side-by-side histograms
```

---

## 5. COMMON CUSTOMIZATIONS

### Change default zoomniveau

**File:** app.js
**Line:** 16
```javascript
APP_CONFIG = {
  standaardZoom: 13,  // Was 12
};
```

### Change map center location

**File:** app.js
**Line:** 15
```javascript
kaartCentrum: [50.8889, 5.9794],  // [lat, lon]
// Bijv. Amsterdam: [52.3676, 4.9041]
```

### Add more color palettes

**File:** map.js
```javascript
function haalKleurSchema(naam, aantal) {
  switch(...) {
    case 'meinpalet': 
      return d3.quantize(d3.interpolateSpectral, aantal);
    // etc.
  }
}
```
D3 ingebouwde: Viridis, Blues, Reds, RdYlGn, Spectral, etc.

### Change classification method default

**File:** app.js
**Line:** 29
```javascript
standaardMethode: 'equal',  // Was 'quantile'
```

### Add more PDOK datasets

**File:** app.js
**Lines:** 32-33
```javascript
// Add new buttons to index.html first:
// <button id="load-hoogte">PDOK Hoogte</button>

// Then in app.js:
document.getElementById('load-hoogte')?.addEventListener('click', () =>
  laadVanApi('https://api.pdok.nl/[...hoogte-url...]', 'PDOK Hoogte')
);
```

### Modify filter UI

**File:** index.html
Change inputs in #filter-controls section, then update app.js:
```javascript
function pasFilterToe() {
  const myNewFilter = document.getElementById('my-new-filter')?.value;
  // Add to filter object
  window.appData.filter = { ..., myNewFilter };
}
```

---

## 6. DEBUGGING TIPS

### Check JS console for errors
```javascript
// Browser F12 → Console tab
// Common issues:
// - Missing #field-select element
// - toonChoropleth undefined
// - Empty FeatureCollection
```

### Debug filter not working
```javascript
// In console:
console.log(window.appData.filter);
console.log(window.appData.lastFC.features.length);

// Check if map.js has correct function names
```

### Test data loading
```javascript
// In console:
window.appData.lastFC.features[0]  // Check first feature

// Check properties
Object.keys(window.appData.lastFC.features[0].properties)
```

### Verify reprojection
```javascript
// Check if coords detected as projected:
const geom = window.appData.lastFC.features[0].geometry;
console.log(Math.abs(geom.coordinates[0]));  // Zou lat/lon ~52/5 moeten tonen

// If > 1000, likely RD/meters
```

---

## 7. TESTING CHECKLIST

After making changes:

- [ ] Map loads (OpenStreetMap visible)
- [ ] PDOK buttons work (Buurten/Wijken load)
- [ ] CSV import works
- [ ] GeoJSON import works
- [ ] Field selection dropdown populates
- [ ] Choropleth renders with colors
- [ ] Min/max filter works
- [ ] Percentile filter works
- [ ] "Filter negative" works
- [ ] Clear filter works
- [ ] Compare mode loads 2nd dataset
- [ ] No console errors (F12)

---

## 8. FILE STRUCTURE REFERENCE

```
1e versie/
├── index.html                (Leaflet map + UI skeleton)
├── css/
│   └── app.css              (Responsive styling)
├── js/
│   ├── app.js               (165 lines, ~20KB)
│   ├── map.js               (335 lines, ~16KB)
│   ├── importer.js          (155 lines, ~10KB)
│   └── d3_charts.js         (220 lines, ~13KB)
├── data/
│   ├── heerlen_buurten.geojson
│   └── economic_indicators.csv
├── README.md                (User guide)
├── BUILD_SUMMARY.md         (Tech overview)
├── TEST_CHECKLIST.md        (Manual QA)
└── REFACTORING_NOTES.md     (This file)
```

---

## 9. QUICK REFERENCE — Where is X?

| What | File | Line/Section |
|------|------|--------------|
| Kaart-initialisatie | app.js | 39-64 |
| Config voor map | map.js | 21-49 |
| Config voor app | app.js | 14-37 |
| Colorschema's | map.js | 262-278 |
| Filter-logica | map.js | 75-112 |
| CSV parsing | importer.js | 42-92 |
| API loading | app.js | 176-202 |
| Compare charts | d3_charts.js | 185-235 |
| Event listeners | app.js | 147-242 |
| Choropleth render | map.js | 323-441 |

---

## 10. VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Today | Initial refactor: Dutch + CONFIG sections + maintainability |

---

## Supportbronnen

- **Leaflet docs:** https://leafletjs.com/
- **D3.js docs:** https://d3js.org/
- **GeoJSON spec:** https://geojson.org/
- **ColorBrewer:** https://colorbrewer2.org/
- **PDOK API:** https://www.pdok.nl/

---

**Last updated:** Today
**Maintainer:** Developer team
**Questions?** Check REFACTORING_NOTES.md or code comments
