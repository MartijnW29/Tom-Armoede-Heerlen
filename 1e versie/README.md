Korte handleiding (Nederlands) — MVP Opportunity Atlas voor Heerlen

Wat staat in deze map:
- `index.html` — startpagina (MVP)
- `css/` — stijlen
- `js/` — applicatielogica (o.a. `app.js`, `map.js`, `importer.js`, `d3_charts.js`)
- `originals/` — originele referentiebestanden uit `Voor Martijn`

Snelle start (lokaal):
1. Open een terminal in deze map.
2. Start een simpele static server (bijv. met `http-server`):

```bash
npx http-server . -o
```

Belangrijke onderdelen en onderhoudsrichtlijnen:
- D3 wordt gebruikt voor compare-mode visualisaties (`js/d3_charts.js`).
- Leaflet verzorgt de kaartrendering (`index.html`, `js/map.js`).
- `js/importer.js` handelt CSV en GeoJSON af en koppelt datasets aan de chart-module.

Onderhoudsvriendelijkheid (hoe de code georganiseerd is):
- `app.js`: initialisatie van kaart en UI-events; korte, duidelijke functies.
- `map.js`: kaart-hulpfuncties (choropleth helper-stubs).
- `d3_charts.js`: alle D3-visualisaties (Nederlands gelabeld, goed te vervangen of uit te breiden).
- `importer.js`: parsing en conversie van bestanden; houdt `window.appData` bij (state).

Gebruik (kort):
1. Upload een GeoJSON of CSV via de uploader in de sidebar.
2. Kies in het dropdown-menu een numeriek veld.
3. Voor compare-mode: klik `Start compare-mode`, upload het tweede bestand, en kies het veld.

Library-overzicht:
- Leaflet — kaart
- D3 — grafieken en histogrammen
- proj4js — reprojectie (origineel opgenomen)

 Aannames en opties:
- De MVP is frontend-first en werkt zonder backend.
Zie `prompt-for-agent.md` voor de volledige opdracht, acceptatiecriteria en verdere taken.

Frontend controls
- `Classificatie`: vast op `Quantile`.
- `Palet`: kleurpalet voor de choropleth (Viridis/RdYlGn/Blues/Oranges).
- `Opacity`: regelt de fill-opacity van de polygonlagen.

Filter & outliers
- Gebruik het filterpaneel in de sidebar om extremes te dempen: je kunt een absolute `Min`/`Max` instellen of percentielen clippen (bijv. 1%–99%) om outliers buiten beschouwing te laten.
- Gefilterde gebieden worden lichtgekleurd op de kaart en uitgesloten van de classificatie en histogramberekening.

Alles is in het Nederlands gedocumenteerd en modulair gehouden voor onderhoud.

Voorbeelddata
- Voeg GeoJSON- of CSV-voorbeelden toe in `1e versie/data/` om snel demo's te draaien. Een `README.md` is aanwezig in die map.
