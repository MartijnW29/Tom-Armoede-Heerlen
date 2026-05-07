# 📋 Test Checklist — Opportunity Atlas Heerlen

## Vóór te testen
- [ ] `http-server` of Python server draait op poort 8080/8000
- [ ] Browser geopend op `http://localhost:8080` (of 8000)
- [ ] Console (F12) open voor foutmeldingen

---

## 1️⃣ Kaart & Basisfuncties

- [ ] Kaart laadt en toont OpenStreetMap
- [ ] Kaart is gecentreerd op Heerlen (ca. 50.89°N, 5.98°E)
- [ ] Zoom-buttons werken (+ / - op kaart)
- [ ] Scroll zoomen werkt
- [ ] Pan (klik+drag) werkt
- [ ] Kaart reactief op tablet/desktop

---

## 2️⃣ Data-import & Laadpunten

### 2A: PDOK API-knoppen
- [ ] Klik "Laad PDOK Buurten (Heerlen)" → dialoogvak bevestigt load
- [ ] Kaart zoomed automatisch naar Heerlen-buurten
- [ ] Klik "Laad PDOK Wijken (Heerlen)" → dialoogvak bevestigt load
- [ ] Sidebar "Selecteer variabele" dropdown toont numerieke velden

### 2B: GeoJSON-import
- [ ] Klik file-input, selecteer `data/heerlen_buurten.geojson`
- [ ] Alert bevestigt load met aantal features
- [ ] Gebieden verschijnen op kaart
- [ ] Veldenkeuze dropdown toont: `inwoners`, `huishoudens`, `werkloosheid_pct`, `inkomen_mediaan`

### 2C: CSV-import
- [ ] Klik file-input, selecteer `data/economic_indicators.csv`
- [ ] Alert bevestigt load met aantal features
- [ ] Punten verschijnen op kaart (lat/lon)
- [ ] Veldenkeuze dropdown toont: `bedrijven_count`, `bedrijven_groei_pct`, `werkgelegenheid`, etc.

### 2D: Custom API URL
- [ ] Vul `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=100&f=json` in
- [ ] Klik "Laad URL"
- [ ] Dataset laadt, kaart updated

---

## 3️⃣ Visualisatie & Legenda

### 3A: Basisorchestratie
- [ ] Laad PDOK Buurten
- [ ] Dropdown "Selecteer variabele": kies `inwoners`
- [ ] Kaart wordt gekleurd (choropleth)
- [ ] Legenda verschijnt rechtsboven met kleur-ranges

### 3B: Classificatiemethodes
- [ ] Dropdown "Classificatie" → Selecteer "Kwantiel" → kaart update
- [ ] Selecteer "Equal Interval" → kaart update met andere breekpunten
- [ ] Legenda-ranges veranderen

### 3C: Kleurschema's
- [ ] Dropdown "Palet" → probeer `Viridis`, `RdYlGn`, `Blues`, `Oranges`
- [ ] Kaart-kleuren veranderen voor elk palet

### 3D: Opacity
- [ ] Schuifknop "Dekking" naar 0.3 → polygonen bijna transparant
- [ ] Schuifknop naar 1.0 → polygonen volledig ondoorzichtig

---

## 4️⃣ Interactiviteit & Popups

### 4A: Klikken op gebieden
- [ ] Laad dataset, kies variabele
- [ ] Klik op een polygon in de kaart
- [ ] Popup verschijnt met:
  - Titel "Geselecteerd gebied"
  - Relevante properties (bijv. naam, waarde, etc.)
  - Groen (als binnen filter) of grijs (buiten filter)

### 4B: Legenda-feedback
- [ ] Hover boven legendakleur
- [ ] UI-feedback duidelijk (cursor change)

---

## 5️⃣ Filter & Outliers

### 5A: Min/Max-filter
- [ ] Laad dataset, kies variabele (bijv. `werkloosheid_pct`)
- [ ] Vul "Min: 5" en "Max: 6" in
- [ ] Klik "Pas filter toe"
- [ ] Kaart updated, gebieden buiten range grijs
- [ ] Legenda-bereiken aanpassen

### 5B: Percentielen-filter
- [ ] Vul "Trim percentielen: 10" (onder) en "90" (boven) in
- [ ] Klik "Pas filter toe"
- [ ] Onderste/bovenste 10% waarden buiten beschouwing

### 5C: Filter negatieven
- [ ] Laad CSV met gemengde waarden (positief/negatief)
- [ ] Klik "Filter negatieve waarden"
- [ ] Alleen data ≥ 0 zichtbaar

### 5D: Filter wissen
- [ ] Klik "Wis filter"
- [ ] Input-velden leeg
- [ ] Alle gebieden opnieuw gekleurd

---

## 6️⃣ Vergelijkmodus (Compare-mode)

### 6A: Setup
- [ ] Laad `data/heerlen_buurten.geojson`
- [ ] Kies variabele `inwoners`
- [ ] Klik "Start vergelijkmodus"
- [ ] Knop-tekst verandert naar "Upload vergelijkingsbestand"
- [ ] Alert zegt dat we bestand 2 kunnen uploaden

### 6B: Data 2 laden
- [ ] Laad `data/economic_indicators.csv` als bestand 2
- [ ] System detecteert compare-mode
- [ ] Dialoogvak zegt "Vergelijkmodus: bestand 2 geladen"

### 6C: Histogrammen
- [ ] Twee histogrammen verschijnen naast elkaar in "Charts" sectie
- [ ] Links: "Gegevensset A" (GeoJSON-waarden `inwoners`)
- [ ] Rechts: "Gegevensset B" (CSV-waarden `bedrijven_count`)
- [ ] X-as: waardebereik
- [ ] Y-as: frequentie
- [ ] Kleurverschil tussen A (blauw) en B (rood)

---

## 7️⃣ UI & Responsiviteit

### 7A: Desktop
- [ ] Kaart links (flex:1)
- [ ] Sidebar rechts (320px breed)
- [ ] Alle controls duidelijk leesbaar

### 7B: Tablet (iPad)
- [ ] Sidebar nog zichtbaar
- [ ] Text ook leesbaar op 768px
- [ ] Buttons clickable (niet te klein)

### 7C: Nederlands
- [ ] Alle labels, buttons, tooltips Nederlands
- [ ] Geen Engels door elkaar

---

## 8️⃣ Edge Cases & Error Handling

- [ ] Upload leeg bestand → Alert "Geen features"
- [ ] Upload bestand zonder lat/lon → Alert "CSV-bestand moet kolommen hebben"
- [ ] Upload ongeldige GeoJSON → Alert "Ongeldig GeoJSON"
- [ ] Custom API URL voert fout uit → Alert met fout
- [ ] Geen variabele geselecteerd, klik "Pas filter toe" → Geen crash
- [ ] Legenda voor dataset zonder numerieke velden → Alert "Geen numerieke waarden"

---

## 9️⃣ Performance

- [ ] Laad 5-buurt GeoJSON → < 1 seconde
- [ ] Laad 7-punt CSV → < 0.5 seconde
- [ ] Filter/reclassify → < 0.2 seconde (geen noticeable lag)
- [ ] Geen console-errors (F12)

---

## 🔟 Browser-compatibiliteit

- [ ] Chrome/Chromium: ✅
- [ ] Firefox: ✅
- [ ] Safari (macOS): ✅
- [ ] Edge: ✅
- [ ] Mobile Chrome (Android): ✅
- [ ] Mobile Safari (iOS): ✅

---

## 📝 Acceptatiecriteria (MVP)

- [✅] Kaart laadt, toont data voor Heerlen
- [✅] Gebruiker kan CSV (lat/lon) & GeoJSON laden
- [✅] Veld selecteren & choropleth updaten in real-time
- [✅] Legenda werkt, kleuren veranderen
- [✅] Menu werkt (classificatie, palet, dekkking)
- [✅] Filters (min/max/percentiel) werken
- [✅] Popups tonen attributen
- [✅] Alle code in `1e versie/`
- [✅] README beschrijft hoe lokaal te draaien
- [✅] Sample data beschikbaar

---

## 🐛 Bekende Beperkingen

1. **KML-import:** Niet geïmplementeerd (Nog te implementeren)
2. **Shapefile in ZIP:** Vereist shpjs CDN (niet ingebouwd)
3. **Backend:** Frontend-only; geen server-side processing
4. **Performance:** Bij >10K features kan rendering traag zijn
5. **Accessibility:** Geen volledige WCAG 2.1 AA audit

---

## 📞 Support & Feedback

Bij problemen:
1. Open Browser DevTools (F12) en check Console voor errors
2. Zorg server draait: `npx http-server . -p 8080`
3. Controleer sample data in `/data/` folder
4. Raadpleeg README.md voor troubleshooting

---

**Einde van test checklist** ✓
