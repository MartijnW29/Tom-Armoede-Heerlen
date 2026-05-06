APIs
- In de sidebar zijn knoppen toegevoegd om direct PDOK Buurten en Wijken voor Heerlen te laden.
- Je kunt ook een willekeurige GeoJSON/JSON API-URL invoeren en laden; de frontend probeert automatisch te detecteren of reprojection van RD (EPSG:28992) nodig is.
Backend (optioneel)
1. Ga naar de folder `1e versie`.
2. Installeer dependencies en start de server:
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
- D3 wordt gebruikt voor grafieken en histogrammen (`js/d3_charts.js`).
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
3. Klik op `Toon histogram` om de verdeling met D3 te bekijken.
4. Voor compare-mode: klik `Start compare-mode`, upload het tweede bestand, en kies het veld.

Library-overzicht:
- Leaflet — kaart
- D3 — grafieken en histogrammen
- proj4js — reprojectie (origineel opgenomen)

Aannames en opties:
- De MVP is frontend-first. Een kleine Node backend kan toegevoegd worden voor zware verwerking of shapefile-extractie.
Zie `prompt-for-agent.md` voor de volledige opdracht, acceptatiecriteria en verdere taken.

Backend (optioneel)
1. Ga naar de folder `1e versie`.
2. Installeer dependencies en start de server:

```bash
npm install
npm start
```

3. De backend luistert standaard op poort 3000 en accepteert `POST /upload` met form field `file` (shapefile zip). Het antwoord is GeoJSON.

Frontend controls
- `Classificatie`: keuze tussen `Quantile`, `Equal interval`, en `Jenks` (natural breaks).
- `Palet`: kleurpalet voor de choropleth (Viridis/RdYlGn/Blues/Oranges).
- `Opacity`: regelt de fill-opacity van de polygonlagen.

Alles is in het Nederlands gedocumenteerd en modulair gehouden voor onderhoud.
