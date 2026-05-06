// =======================
// 📡 URLS
// =======================
const buurtenUrl =
    "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?gemeentecode=GM0917&limit=1000&f=json";

const wijkenUrl =
    "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/wijken/items?gemeentecode=GM0917&limit=1000&f=json";

// =======================
// 🧭 PROJ4
// =======================
proj4.defs("EPSG:28992",
    "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 " +
    "+k=0.9999079 +x_0=155000 +y_0=463000 " +
    "+ellps=bessel +units=m +no_defs"
);

// =======================
// 🔧 HELPERS
// =======================
function transformCoords(coords) {
    return proj4("EPSG:28992", "EPSG:4326", coords);
}

function transformGeometry(geom) {
    if (geom.type === "Polygon") {
        geom.coordinates = geom.coordinates.map(r => r.map(transformCoords));
    }
    if (geom.type === "MultiPolygon") {
        geom.coordinates = geom.coordinates.map(p =>
            p.map(r => r.map(transformCoords))
        );
    }
    return geom;
}

function transformFC(fc) {
    fc.features.forEach(f => {
        f.geometry = transformGeometry(f.geometry);
    });
    return fc;
}

// 🔥 HELPER (GEEN ENRICH)
function getWijkCode(d) {
    return d.properties.wijkcode ?? d.properties.wk_code;
}

// =======================
// 🎨 D3 SETUP
// =======================
const svg = d3.select("svg");
const g = svg.append("g");
const tooltip = d3.select(".tooltip");

const projection = d3.geoMercator();
const path = d3.geoPath().projection(projection);

// zoom
svg.call(
    d3.zoom()
        .scaleExtent([1, 12])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        })
);

// =======================
// 📥 DATA
// =======================
Promise.all([
    d3.json(wijkenUrl),
    d3.json(buurtenUrl)
]).then(([wijken, buurten]) => {

    wijken = transformFC(wijken);
    buurten = transformFC(buurten);

    // =======================
    // 🗺️ WIJK MAP
    // =======================
    const wijkMap = new Map();

    wijken.features.forEach(w => {
        wijkMap.set(
            getWijkCode(w),
            w.properties.wijknaam || w.properties.naam
        );
    });

    // =======================
    // 📊 COLOR SCALE
    // =======================
    const inwonersArray = buurten.features.map(d =>
        d.properties.aantal_inwoners ??
        d.properties.aantal_inwoners_tot ?? 0
    );

    const min = d3.min(inwonersArray);
    const max = d3.max(inwonersArray);

    const colorScale = d3.scaleQuantize()
        .domain([min, max])
        .range(d3.quantize(d3.interpolateRdYlGn, 20));

    // =======================
    // 📐 PROJECTIE
    // =======================
    const combined = {
        type: "FeatureCollection",
        features: [...wijken.features, ...buurten.features]
    };

    const padding = 40;

    projection.fitExtent(
        [
            [padding, padding],
            [window.innerWidth - padding, window.innerHeight - padding]
        ],
        combined
    );

    // =======================
    // 🟦 BUURTEN
    // =======================
    g.selectAll(".buurt")
        .data(buurten.features)
        .enter()
        .append("path")
        .attr("class", "buurt")
        .attr("d", path)
        .attr("fill", d => {
            const inwoners =
                d.properties.aantal_inwoners ??
                d.properties.aantal_inwoners_tot ?? 0;
            return colorScale(inwoners);
        })

        .on("mousemove", function (event, d) {

            const wijkCode = getWijkCode(d);

            // highlight buurten
            g.selectAll(".buurt")
                .attr("fill-opacity", b =>
                    getWijkCode(b) === wijkCode ? 1 : 0.1
                );

            // highlight wijken
            g.selectAll(".wijk")
                .attr("stroke-width", w =>
                    getWijkCode(w) === wijkCode ? 3 : 1
                )
                .attr("opacity", w =>
                    getWijkCode(w) === wijkCode ? 1 : 0.1
                );

            const p = d.properties;

            const wijkNaam = wijkMap.get(wijkCode) || "Onbekend";

            const inwoners =
                p.aantal_inwoners ??
                p.aantal_inwoners_tot;

            tooltip
                .style("opacity", 1)
                .html(`
          <strong>${p.buurtnaam || p.naam}</strong> - <i>${wijkNaam.slice(8)}</i><br/>
          👥 Inwoners: ${inwoners}<br/>
          🏠 Huishoudens: ${p.aantal_huishoudens}<br/>
          💍 Precentage gehuwd: ${p.percentage_gehuwd}%<br>
          🎒 Leerlingen primair onderwijs: ${p.aantal_leerlingen_primair_onderwijs}<br>
          🏫 Leerlingen voortgezet onderwijs: ${p.aantal_leerlingen_voortgezet_onderwijs}
        `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");

        })

        .on("mouseout", function () {

            g.selectAll(".buurt")
                .attr("fill-opacity", 0.7);

            g.selectAll(".wijk")
                .attr("stroke-width", 2)
                .attr("opacity", 1);

            tooltip.style("opacity", 0);
        });

    // =======================
    // ⬛ WIJKEN
    // =======================
    g.selectAll(".wijk")
        .data(wijken.features)
        .enter()
        .append("path")
        .attr("class", "wijk")
        .attr("d", path);

    // =======================
    //  LEGENDA
    // =======================

    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", "translate(20, 20)");

    const colors = colorScale.range();

    const legendData = colors.map(color => {
        const [minVal, maxVal] = colorScale.invertExtent(color);
        return { color, minVal, maxVal };
    });

    legend.selectAll("rect")
        .data(legendData)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 10)
        .attr("width", 10)
        .attr("height", 9)
        .attr("fill", d => d.color);

    legend.selectAll("text")
        .data(legendData)
        .enter()
        .append("text")
        .attr("x", 15)
        .attr("y", (d, i) => i * 10 + 8)
        .text(d => Math.round(d.minVal))
        .attr("font-size", "11px");

    legend.append("text")
        .attr("x", 0)
        .attr("y", -5)
        .text("Aantal inwoners")
        .attr("font-weight", "bold")
        .style("font-size", "14px");


});

// =======================
// RESPONSIVE
// =======================
window.addEventListener("resize", () => location.reload());