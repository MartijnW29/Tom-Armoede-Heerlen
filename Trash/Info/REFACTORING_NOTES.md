# REFACTORING SAMENVATTING — Heerlen Opportunity Atlas

## Datum
Gecompliteerde refactoring voor verbeterde maintainability en Nederlandse lokalisatie

## Overzicht van wijzigingen

Alle 4 JavaScript-modules zijn volledig herstructureerd voor:
- ✅ **Nederlandse syntaxis en comments**
- ✅ **CONFIG-secties aan top van elk bestand**
- ✅ **Duidelijke functie-organisatie (helpers → main → event-listeners)**
- ✅ **Gedetailleerde JSDoc-comments voor alle functies**
- ✅ **Eenvoudige onderhoudsbaarheid**

---

## 1. MAP.JS — Kaartvisualisatie & Choropleth

### Wat veranderde:
- **CONFIG-sectie** (`KAART_CONFIG`) bovenaan met alle aanpasbare instellingen
- Functies hernoemd naar Nederlands:
  - `getNumericValues()` → `haalNumeriekeWaarden()`
  - `valuePassesFilter()` → `waardePasseertFilter()`
  - `buildFeaturePopup()` → `bouwFeaturePopup()`
  - `applyChoropleth()` → `toonChoropleth()` (alias behouden)

### Configureerbare variabelen:
```javascript
KAART_CONFIG = {
  standaardKleurPalet: 'viridis',      // Wijzig hier
  standaardTransparantie: 0.8,         // 0.0–1.0
  standaardAantalKlassen: 5,           // Aantal kleurstappen
  standaardClassificatie: 'quantile',  // quantile | equal
  randKleur: '#333',                   // Grenzen-kleur
  gefilterdFillKleur: '#e8e8e8',       // Grijze gefilterde gebieden
  voorkeurvelden: [...]                // Popup-velden
};
```

### Functies georganiseerd in secties:
1. **HULPFUNCTIES** — Basis data-operaties
2. **KLEURSCHEMA'S** — D3 ColorBrewer integratie
3. **KLASSIFICATIE** — Break-berekening (Quantile/Equal Interval)
4. **LEGENDA** — Visual legends
5. **HOOFD-FUNCTIE** — `toonChoropleth()` voorkant-API
6. **REPROJECTION** — RD→WGS84 herprojectie

### Hoe aan te passen:
- Wijzig kleuren in `KAART_CONFIG`
- Pas classificatie-methode aan voor andere data
- Voeg voorkeurvelden toe voor je eigen datasets

---

## 2. APP.JS — Initialisatie & Event-listeners

### Wat veranderde:
- **APP_CONFIG** bovenaan met alle kaart-instellingen
- Instellingen uit hardcoding naar CONFIG gehaald
- Alle event-listeners gehergroepeerd

### Configureerbare variabelen:
```javascript
APP_CONFIG = {
  kaartCentrum: [50.8889, 5.9794],     // Heerlen (wijzig voor ander gebied)
  standaardZoom: 12,
  maxZoom: 19,
  pdokBuurtenUrl: '...',               // PDOK-endpoints
  pdokWijkenUrl: '...',
};
```

### Functies:
- `herllaadVisualisatie()` — Visualisatie opnieuw tekenen
- `pasFilterToe()` — Apply/save filter
- `wisFilter()` — Clear all filters
- `laadVanApi()` — Fetch data from URL

### Hoe aan te passen:
- Wijzig `kaartCentrum` voor ander gebied
- Update PDOK-URLs voor andere gemeentes
- Voeg extra event-listeners toe als nodig

---

## 3. IMPORTER.JS — CSV & GeoJSON import

### Wat veranderde:
- **IMPORTER_CONFIG** met ondersteunde veldnamen
- Functienamen naar Nederlands
- Betere error-handling

### Configureerbare variabelen:
```javascript
IMPORTER_CONFIG = {
  breedtevelden: ['lat', 'latitude', 'breedtegraad'],
  lengdevelden: ['lon', 'lng', 'longitude', 'lengtegraad'],
  geprojecteeerdBoven: 1000,  // RD-detectie threshold
};
```

### Ondersteunde formaten:
- ✅ **GeoJSON** (.geojson, .json) — Volledig
- ✅ **CSV** (.csv, .txt) — Met lat/lon-kolommen
- ⏳ **ZIP** — Toekomstige uitbreiding

### Hoe aan te passen:
- Voeg meer veldnamen toe aan `breedtevelden`/`lengdevelden` voor custom CSV-headers
- Wijzig `geprojecteeerdBoven` voor andere projecties

---

## 4. D3_CHARTS.JS — Vergelijkmodus & Histogrammen

### Wat veranderde:
- **CHARTS_CONFIG** met grafiek-instellingen
- Functies hernoemd naar Nederlands
- D3 scheiding van concerns

### Configureerbare variabelen:
```javascript
CHARTS_CONFIG = {
  grafiiekBreedte: 300,        // Pixels (beide grafieken)
  grafiiekHoogte: 200,         // Pixels
  aantalBakken: 15,            // Histogram bins
  kleurDatasetA: '#4c78a8',    // Blauw
  kleurDatasetB: '#e45756',    // Rood
};
```

### Functies:
- `vindNumeriekeVelden()` — Vind alle numerieke kolommen
- `haalWaarden()` — Extract + apply filter
- `tekenHistogram()` — Draw single D3 histogram
- `createCompareCharts()` — Main compare-mode API

### Hoe aan te passen:
- Wijzig `aantalBakken` voor meer/minder histogram divisions
- Update kleuren voor branding
- Pas grafiek-afmetingen aan voor responsief design

---

## Onderhoudstips

### 1. Nederlandse naamgeving volgen:
- `get` → `haal` or `vind`
- `set` → (via globals)
- `apply` → `pas...toe`
- `create` → `teken`
- `clear` → `wis`

### 2. CONFIG-object uitbreiden:
Voor nieuwe instellingen:
1. Voeg toe aan relevant `XXXXX_CONFIG`
2. Plaats comments boven (wat en waarom)
3. Bewerk alleen top-level CONFIG, niet hardcoded waarden

### 3. Functies-hiërarchie:
```
CONFIG
↓
HULPFUNCTIES (helpers)
↓
UI-FUNCTIES (DOM manipulatie)
↓
HOOFD-FUNCTIE (public API)
↓
EVENEMENTEN (event-listeners)
```

### 4. Test na wijzigingen:
1. Map-laadtests (OpenStreetMap basemap)
2. CSV/GeoJSON import
3. Filtering (min/max, percentiles)
4. Vergelijkmodus
5. XSSreflectie (browser console controleren)

---

## Bestand-structuur

```
js/
  ├─ app.js           (Initialisatie & events → APP_CONFIG)
  ├─ map.js           (Choropleth & visualisatie → KAART_CONFIG)
  ├─ importer.js      (CSV/GeoJSON import → IMPORTER_CONFIG)
  └─ d3_charts.js     (Grafieken → CHARTS_CONFIG)

index.html          (Geen wijzigingen)
css/app.css         (Geen wijzigingen)
data/               (Sample data, ongewijzigd)
```

---

## Snelle referentie — Waar wijzigingen aanbrengen

| Wil je... | Bewerk... | Locatie |
|-----------|-----------|---------|
| Kaartcentrum veranderen | `APP_CONFIG.kaartCentrum` | app.js regel 18 |
| Standaard kleur aanpassen | `KAART_CONFIG.standaardKleurPalet` | map.js regel 21 |
| Transparantie wijzigen | `KAART_CONFIG.standaardTransparantie` | map.js regel 22 |
| PDOK-gemeente wijzigen | `APP_CONFIG.pdokBuurtenUrl` | app.js regel 32-33 |
| Histogram-bins wijzigen | `CHARTS_CONFIG.aantalBakken` | d3_charts.js regel 19 |

---

## Volgende stappen (optioneel)

- [ ] CSS custom properties toevoegen voor themeing
- [ ] Unit-tests schrijven (Jest)
- [ ] KML-import implementeren (importer.js)
- [ ] Backend-API koppeling (Node.js, optioneel)
- [ ] WCAG 2.1 AA accessibility audit

---

## Veelgestelde vragen

**V: Waar trekt de app data vandaan?**
A: Opgeladen via UI (file upload, PDOK API, custom URL) → `window.appData.lastFC`

**V: Hoe voeg ik meer kleuren-schema's toe?**
A: In `haalKleurSchema()` in map.js, voeg case toe:
```javascript
case 'mijnpalet': return d3.quantize(d3.interpolateMijnPalet, aantal);
```

**V: Kan ik aangepaste filters toevoegen?**
A: Bewerk `pasFilterToe()` in app.js en `waardePasseertFilter()` in map.js

**V: Hoe werkt RD-projectie?**
A: `coorsDinatenZijnGeprojecteerd()` detecteerd grote waarden (>1000) → herprojecteert naar WGS84

---

**Documentatie datum:** [Vandaag]
**Versie:** 1.0 (Refactored + Dutchified)
**Auteur:** GitHub Copilot + developer
