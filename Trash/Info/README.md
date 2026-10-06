# Opportunity Atlas — Heerlen

Een interactieve webapplicatie voor het visualiseren en verkennen van ruimtelijke data voor Heerlen. Gebouwd met Leaflet, D3.js en open-source libraries.

## Snelle start

### Vereisten
- Node.js (voor `http-server`)
- Moderne webbrowser (Chrome, Firefox, Safari, Edge)

### Installatie & Starten

1. **Start een local server:**
   ```bash
   npx http-server . -p 8080 -o
   ```
   Of met Python:
   ```bash
   python -m http.server 8000
   ```

2. **Open de browser:**
   - `http://localhost:8080` (http-server) of `http://localhost:8000` (Python)

## Functies

### Basisgebruik
1. **Laad een dataset** → Klik PDOK-knop of upload GeoJSON/CSV/ZIP
2. **Kies een numerieke variabele** → Dropdown
3. **Pas visualisatie aan** → Classificatie, kleurenpalet, dekking
4. **Klik gebieden** → Details popup
5. **Filter outliers** → Min/Max of percentielen
6. **Vergelijk datasets** → Compare-mode histogrammen

### Ondersteunde bestandsformaten

| Format | Status | Notities |
|--------|--------|----------|
| GeoJSON | ✅ | `FeatureCollection` met geometrieën |
| CSV | ✅ | Moet kolommen `lat` en `lon` hebben |
| ZIP | ✅ | GeoJSON in ZIP |
| KML | 🔄 | TODO |

## Projectstructuur

```
1e versie/
├── index.html
└── css/
    └── app.css
└── js/
    ├── app.js           # Initialisatie, UI-events
    ├── map.js           # Choropleth-visualisatie
    ├── importer.js      # Data-import
    └── d3_charts.js     # Compare-mode grafieken
└── data/
    ├── heerlen_buurten.geojson
    └── economic_indicators.csv
└── README.md
```

## Libraries

- **Leaflet 1.9.4** (CDN): Interactieve kaarten
- **D3.js 7** (CDN): Schalen, kleuren, grafieken
- **proj4js 2.9** (CDN): Coördinaatreprojection
- **JSZip 3.10** (on-demand): ZIP-bestanden

## Gebruiksvoorbeelden

### 1. Werkloosheid verkennen
```
Laad PDOK Wijken → Selecteer "werkloosheid_pct" → Paletten: RdYlGn
```

### 2.Twee datasets vergelijken
```
Dataset 1 laden → Compare-mode starten → Dataset 2 laden → Veld kiezen
```

### 3. Outliers dempen
```
Trim percentielen: 1% – 99% → Filter toepassen
```

## API-bronnen (Heerlen)

**PDOK bijken-en-buurten:**
- `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&f=json`
- `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&f=json`

Gemeentecode Heerlen: **GM0917**

## Troubleshooting

| Probleem | Oplossing |
|---|---|
| Server aanvaarden niet | Zorg dat `http-server` / Python draait |
| CSV-import faalt | Controleer `lat` en `lon` kolommen |
| Coördinaten zien er raar uit | Automatische RD→WGS84-conversie via proj4 |

## Toekomstige verbeteringen

- [ ] KML-import
- [ ] Shapefile-import
- [ ] Time-series animatie
- [ ] Backend API
- [ ] Unit-tests

## Licentie

- Leaflet: BSD 2-Clause
- D3.js: ISC
- OpenStreetMap: ODbL 1.0

**Versie:** 1.0 (MVP) | **Taal:** Nederlands | **Mei 2026**

Alles is in het Nederlands gedocumenteerd en modulair gehouden voor onderhoud.

Voorbeelddata
- Voeg GeoJSON- of CSV-voorbeelden toe in `1e versie/data/` om snel demo's te draaien. Een `README.md` is aanwezig in die map.
