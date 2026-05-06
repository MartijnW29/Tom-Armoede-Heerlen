Doel:
- Bouw een eenvoudige, self-contained webapp die de functionaliteit van Opportunity Atlas nabootst, maar specifiek voor Heerlen. Focus op interactieve kaartvisualisatie, duidelijke legenda/menu en makkelijke data-import voor verschillende datatypen.

Invoerbronnen:
- Gebruik de bestanden in de map Voor Martijn als startpunt (bijv. `KADASTER_TEST.html`, `js/kadaster.js`, `proj4.js`, `style/kadaster_style.css`). Plaats alle opgeleverde bestanden in de map `1e versie`.

Belangrijkste requirements:
- Kaart:
  - Centraal geschaald en gecentreerd op Heerlen.
  - Pannend/zoomend, met standaard basemap (OpenStreetMap of vergelijkbaar).
  - Visualiseer raster- of gebiedsdata (choropleth) op basis van ingeladen datasets.
- Legenda & menu:
  - Dynamische legenda die kleuren en dataklassen toont.
  - Menu (linker of rechter paneel) om datasets te kiezen, symbologie (kleurenschema), classificatiemethode (equal interval, quantile, jenks), en waardeveld te selecteren.
  - Mogelijkheid om lagen aan/uit te zetten en opacity te regelen.
- Data-import:
  - Eenvoudige upload/import UI die ten minste CSV (met lat/lon of id+join), GeoJSON en GeoJSON-in-zip accepteert. (Optioneel: Shapefile in zip — als je dat niet wilt ondersteunen, noem dat expliciet.)
  - Bij import: preview van attributen (eerste 100 rijen), mogelijkheid om welk veld gebruikt wordt voor visualisatie te kiezen en optionele join op ID.
  - Automatisch reprojeceren indien nodig (gebruik `proj4` indien aanwezig).
- Interactie:
  - Tooltip/popup bij klikken met geselecteerde attributen.
  - Mogelijkheid om een gebied te selecteren en onderliggende attributen te exporteren als CSV.
- UI/UX:
  - Nederlands als standaard taal.
  - Responsief (desktop + tablet).
  - Toegankelijk eenvoudige styling; neem bestaande `kader_style.css` uit Voor Martijn waar relevant.
- Technisch:
  - Frontend-first oplossing (static site) zonder verplicht backend; als backend nodig is (grootere shapefiles), geef een optionele minimale Node.js API aan.
  - Gebruik open-source libs (Leaflet of MapLibre GL/Mapbox GL JS, D3 for scales, proj4js, shpjs or jszip if needed).
  - Houd code modulair en goed gedocumenteerd.

Op te leveren in `1e versie`:
- `index.html` + `css/` + `js/` (gestructureerd, min. `app.js`, `map.js`, `importer.js`).
- `data/` met geuploade voorbeeldbestanden (gebruik de twee bronnen uit Voor Martijn als voorbeelden).
- `README.md` met: installatie/serve-stappen (bijv. `npx http-server .`), gebruikte libraries, designkeuzes en hoe extra data te importeren.
- Korte testchecklist (manuele stappen om te verifiëren).
- Optioneel: kleine set unit/integration tests of linting config.

Acceptatiecriteria (hoe verifiëren):
- Kaart laadt en toont data voor Heerlen.
- Een gebruiker kan inlezen: CSV met lat/lon en GeoJSON; kan veld kiezen en de choropleth updaten.
- Legenda en menu werken; kleuren en classificatie veranderen de kaart realtime.
- Popups tonen attributen; exportfunctie werkt voor geselecteerde features.
- Alle code staat in `1e versie` en `README.md` beschrijft hoe lokaal te draaien.

Extra aanwijzingen voor de agent:
- Inspecteer eerst de code in `Voor Martijn` en hergebruik nuttige functies (bijv. reprojection code in `proj4.js`).
- Prioriteit: functionele MVP vóór fancy styling.
- Schrijf heldere commits / snapshots (indien git beschikbaar).
- Documenteer aannames en beperkingen in `README.md`.

Kort takenplan (te volgen door jou als agent):
1. Verken `Voor Martijn`.
2. Scaffold `1e versie`.
3. Bouw kaart + legenda + menu.
4. Bouw import/preview/visualisatie pipeline.
5. Test en documenteer.

Vragen voor de gebruiker:
- Welke twee bestanden precies bedoel je in `Voor Martijn` als "de 2 bronnen"? (noem bestandsnamen)
- Wil je strikt een frontend-only oplossing of is een klein backend (Node) acceptabel voor grotere data/import processing?
- Welke bestandsformaten moeten absoluut ondersteund worden (CSV, GeoJSON, Shapefile, KML)? Prioriteer ze.
- Wil je een interactieve legenda met meerdere variabelen tegelijk (compare-mode) of volstaat 1 variabele tegelijk?
- Zijn er kleur/paletten voorkeuren (bv. ColorBrewer/Diverging)?
