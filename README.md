# Opportunity Atlas — Heerlen

Een interactieve kaart van de buurten in Heerlen. De atlas laat zien hoe sociale en economische cijfers per buurt verschillen en hoe ze door de jaren heen veranderen, met de vraag *waar trek je de armoedegrens?* als rode draad.

**Live:** https://heerlenatlas.pages.dev (ook nog op https://martijnw29.github.io/Tom-Armoede-Heerlen/)

---

## Wat kun je ermee?

| | |
|---|---|
| **Introductie** | Een kort verhaal in vijf stappen: van één lijn door Heerlen tot de vraag waar je de armoedegrens trekt. |
| **Verken de data** | Kies een variabele voor de kaart en één voor het info-venster. Variabelen zijn ingedeeld in categorieën, doorzoekbaar en als favoriet te bewaren. |
| **Tijdlijn** | Buurtcijfers van **2013 tot en met 2025**. Kies één jaar of een periode; de trendgrafiek per buurt volgt mee. |
| **Kaartweergave** | Kleurpalet, dekking en ondergrond instellen via het tandwiel rechtsboven. |
| **Stories** | Verhalen die stap voor stap een onderwerp op de kaart uitleggen, zoals *Armoede in Heerlen*. Elke story heeft een eigen link (`index.html?story=…`). |
| **Story maker** | Zelf stories maken met de cijfers van de atlas (Meer → Story maken), bewaard in de browser en te exporteren als bestand. |
| **Zelf berekenen** | Maak een nieuwe variabele met een formule op bestaande variabelen. |
| **Splitscherm** | Twee kaarten naast elkaar die samen bewegen, elk met eigen instellingen. |
| **Heerlen in 3D** | Alle gebouwen van Heerlen op echt terrein, gekleurd naar buurtcijfers of gebouwtype. |
| **Eigen data** | Een eigen `.geojson`, `.json` of `.csv` op de kaart zetten. |

## Starten

De atlas is een statische website zonder build-stap. Hij moet wel via een webserver draaien, omdat de browser sommige bestanden niet via `file://` laadt.

```bash
cd Heerlen_Atlas
./start.sh
```

Of zelf met Python:

```bash
python -m http.server 8080 --directory Heerlen_Atlas
```

Open daarna http://localhost:8080.

## Online zetten

De site staat op twee plekken, allebei vanuit de branch `gh-pages`: elke push werkt ze allebei bij.

- **GitHub Pages:** bouwt de site zelf (Jekyll), ook de storylijst.
- **Cloudflare Pages** (`heerlenatlas.pages.dev`), project `heerlenatlas` met deze instellingen:

| Instelling | Waarde |
|---|---|
| Production branch | `gh-pages` |
| Framework preset | None |
| Build command | `node -e "const fs=require('fs'),d='Heerlen_Atlas/stories';if(fs.existsSync(d))fs.writeFileSync(d+'/lijst.json',JSON.stringify(fs.readdirSync(d).filter(f=>f.endsWith('.json')&&f!=='lijst.json').sort()))"` |
| Build output directory | `/` |

De bouwopdracht maakt de lijst met story-bestanden, omdat Cloudflare de storymap niet zelf kan lezen.

## Stories toevoegen

Elke story is een eigen `.json`-bestand in `Heerlen_Atlas/stories/`. Maak een story in de story maker, kies **Exporteren als bestand** en zet het bestand in die map: de site laadt alles wat in de map staat.

- **Lokaal** leest de site de mappenlijst van de webserver (`start.sh` en `python -m http.server` geven die).
- **Online** wordt de lijst `stories/lijst.json` bij elk bouwen gemaakt: door GitHub Pages (een Jekyll-sjabloon) en door de bouwopdracht van Cloudflare Pages. Er hoeft niets bijgehouden te worden.
- De bestandsnaam is ook de link: `stories/wonen-in-heerlen.json` opent met `index.html?story=wonen-in-heerlen`.

Een slide is één van vijf soorten: `titel` (grote titel over de kaart), `heerlen` (heel Heerlen met cijfers voor de stad), `buurt` (inzoomen op één buurt), `vergelijk` (twee tot zes buurten naast elkaar) of `tekst`. Buurten staan in het bestand als CBS-buurtcode; zelfgemaakte variabelen gaan mee als formule en worden bij de bezoeker tijdelijk aangemaakt.

## Databronnen

| Bron | Jaren | Waarvoor |
|---|---|---|
| [PDOK — CBS Wijken en Buurten](https://api.pdok.nl/cbs/) | 2023–2025 | buurtgrenzen en kerncijfers |
| [CBS StatLine — Kerncijfers wijken en buurten](https://opendata.cbs.nl/) | 2013–2022 | oudere jaren, op de vormen van de buurten van nu |
| [BAG](https://www.kadaster.nl/zakelijk/registraties/basisregistraties/bag) en [3D BAG](https://3dbag.nl/) | actueel | gebouwen en hoogtes in 3D |
| [AHN](https://www.ahn.nl/) via Terrarium-tegels | — | terreinhoogte in 3D |
| [OpenStreetMap](https://www.openstreetmap.org/) en PDOK BRT/Luchtfoto | — | ondergrondkaarten |

Alle cijfers worden live opgehaald; alleen de gebouwen voor de 3D-weergave staan als bestand in `data/`.

## Projectstructuur

```
index.html                    startpagina
Heerlen_Atlas/
├── index.html                de atlas
├── split-screen.html         twee kaarten naast elkaar
├── huisjes-3d.html           Heerlen in 3D (Three.js)
├── css/
│   ├── app.css               opmaak van de atlas
│   └── intro.css             opmaak van de introductie
├── js/
│   ├── app.js                kaart, kaartweergave, Verken de data, zijbalk
│   ├── map.js                kleuren, legenda, info-venster, trendgrafiek, gemeentegrens
│   ├── multi-loader.js       data laden en tijdlijn
│   ├── cbs-historie.js       jaren 2013–2022 uit CBS StatLine
│   ├── wiskunde.js           zelf een variabele berekenen
│   ├── importer.js           eigen bestanden inlezen
│   ├── stories.js            stories laden en afspelen
│   ├── storymaker.js         zelf stories maken
│   ├── intro.js              introductie "De armoedegrens trekken"
│   ├── rondleiding.js        rondleiding langs de bediening
│   └── vendor/d3.v7.min.js
├── stories/                één .json-bestand per story (plus lijst.json voor GitHub Pages)
├── data/
│   └── gebouwen_heerlen.bin  gebouwen voor de 3D-weergave
└── tools/
    └── bake-gebouwen.html    maakt gebouwen_heerlen.bin opnieuw aan uit BAG en 3D BAG
```

De code is in het Nederlands geschreven en per bestand in duidelijke secties ingedeeld. Instellingen staan bovenaan het bestand in een `..._CONFIG`-object (zoals `APP_CONFIG` en `KAART_CONFIG`) of een constante (zoals `SOORTEN` in `stories.js`).

## Gebruikte bibliotheken

[Leaflet](https://leafletjs.com/) 1.9.4 · [D3](https://d3js.org/) v7 · [proj4js](https://github.com/proj4js/proj4js) 2.9 · [Three.js](https://threejs.org/) 0.152

## Licentie

Dit project is **geen open source**: alle rechten voorbehouden. De website bekijken en de code lezen mag; kopiëren, aanpassen, verspreiden of ander gebruik alleen met schriftelijke toestemming van de makers. Zie [LICENSE](LICENSE). De gebruikte bibliotheken en open data houden hun eigen licentie.
