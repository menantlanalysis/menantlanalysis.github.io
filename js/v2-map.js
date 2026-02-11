/* ============================================================
   stae.map — Plotly choropleth map rendering
   ============================================================ */
window.stae = window.stae || {};

stae.map = (() => {

    const COUNTRY_KEYS = ["syria", "lebanon", "yemen", "libya", "iran", "egypt"];

    /**
     * Render the MENA region map on the landing page.
     * Shows all 6 countries as choropleth traces, colored by YoY change.
     *
     * @param {string} containerId
     * @param {Object} geojsonByCountry - { countryKey: geojsonFeatureCollection }
     * @param {Object} yoyByCountry - { countryKey: number|null }
     * @param {Function} onCountryClick - callback(countryKey)
     */
    function clearSkeleton(el) {
        el.querySelectorAll(".skeleton").forEach(s => s.remove());
    }

    function renderRegionMap(containerId, geojsonByCountry, _unused, onCountryClick) {
        const el = document.getElementById(containerId);
        if (!el) return;
        clearSkeleton(el);

        const traces = [];
        const countryOrder = []; // track which trace index = which country

        for (const key of COUNTRY_KEYS) {
            const geojson = geojsonByCountry[key];
            if (!geojson) continue;

            const locations = geojson.features.map(f => f.properties.name);
            const zValues = locations.map(() => 1);
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            const hoverTexts = locations.map(name => `<b>${label}</b><br>${name}`);

            const fillColor = "rgba(50, 104, 145, 0.45)";

            traces.push({
                type: "choroplethmap",
                geojson: geojson,
                locations: locations,
                z: zValues,
                featureidkey: "properties.name",
                colorscale: [[0, fillColor], [1, fillColor]],
                showscale: false,
                hoverinfo: "text",
                hovertext: hoverTexts,
                marker: { line: { color: "#ffffff", width: 1.5 } },
                name: key
            });
            countryOrder.push(key);
        }

        // Compute bounds for MENA region
        const layout = {
            height: 550,
            autosize: true,
            map: {
                style: "light",
                center: { lon: 40, lat: 27 },
                zoom: 3.2
            },
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: "rgba(0,0,0,0)",
            showlegend: false
        };

        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            layout.height = 400;
            layout.map.zoom = 2.2;
        }

        Plotly.newPlot(el, traces, layout, {
            responsive: true,
            displayModeBar: false,
            scrollZoom: false
        });

        // --- Pointer cursor on the map canvas ---
        const mapCanvas = el.querySelector(".maplibregl-canvas");
        if (mapCanvas) mapCanvas.style.cursor = "pointer";

        // --- Hover highlight: thicken border on hover ---
        let hoveredIdx = -1;

        el.on("plotly_hover", (eventData) => {
            if (!eventData.points || !eventData.points.length) return;
            const idx = eventData.points[0].curveNumber;
            if (idx >= countryOrder.length || idx === hoveredIdx) return;

            // Restore previous if any
            if (hoveredIdx >= 0 && hoveredIdx < countryOrder.length) {
                Plotly.restyle(el, { "marker.line.width": 1.5, "marker.line.color": "#ffffff" }, [hoveredIdx]);
            }
            hoveredIdx = idx;
            Plotly.restyle(el, { "marker.line.width": 2.5, "marker.line.color": "#326891" }, [idx]);
        });

        el.on("plotly_unhover", (eventData) => {
            if (!eventData.points || !eventData.points.length) return;
            const idx = eventData.points[0].curveNumber;
            if (idx < countryOrder.length) {
                Plotly.restyle(el, { "marker.line.width": 1.5, "marker.line.color": "#ffffff" }, [idx]);
            }
            if (idx === hoveredIdx) hoveredIdx = -1;
        });

        // Click handler
        el.on("plotly_click", (eventData) => {
            if (eventData.points && eventData.points.length > 0) {
                const traceIdx = eventData.points[0].curveNumber;
                if (traceIdx < countryOrder.length && onCountryClick) {
                    onCountryClick(countryOrder[traceIdx]);
                }
            }
        });
    }

    /**
     * Render per-municipality choropleth for the country page.
     * Ported from v1 drawMap.
     *
     * @param {string} containerId
     * @param {Object} muniYoY - { muniKey: number }
     * @param {Object} geojson - GeoJSON FeatureCollection
     * @param {string} title
     */
    function renderCountryMap(containerId, muniYoY, geojson, title) {
        const el = document.getElementById(containerId);
        if (!el) return;
        clearSkeleton(el);

        const sanitize = name => name.replace(/\//g, "_").replace(/ /g, "_").trim().toLowerCase();

        const locations = [];
        const zValues = [];
        const hoverTexts = [];

        geojson.features.forEach(feature => {
            const name = feature.properties.name;
            const id = sanitize(name);
            locations.push(name);

            const yoy = muniYoY[id];
            if (yoy != null) {
                zValues.push(yoy);
                const f = stae.stats.formatChange(yoy);
                hoverTexts.push(`${name}<br>YoY: ${f.text}`);
            } else {
                zValues.push(null);
                hoverTexts.push(`${name}<br>YoY: N/A`);
            }
        });

        const maxAbs = Math.max(...zValues.filter(v => v != null).map(v => Math.abs(v)), 1);

        // Compute center
        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
        geojson.features.forEach(feature => {
            if (!feature.geometry || !feature.geometry.coordinates) return;
            const coords = feature.geometry.coordinates.flat(3);
            for (let i = 0; i < coords.length; i += 2) {
                if (Number.isFinite(coords[i]) && Number.isFinite(coords[i+1])) {
                    minLon = Math.min(minLon, coords[i]);
                    maxLon = Math.max(maxLon, coords[i]);
                    // coords might be [lon, lat] pairs in nested arrays
                }
            }
            // Use proper traversal for nested geometry
            const walkCoords = (c) => {
                if (typeof c[0] === "number") {
                    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
                        minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0]);
                        minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
                    }
                } else {
                    c.forEach(walkCoords);
                }
            };
            walkCoords(feature.geometry.coordinates);
        });

        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        const span = Math.max(maxLon - minLon, maxLat - minLat);
        let zoom = span > 40 ? 2 : span > 20 ? 3 : span > 10 ? 4 : span > 5 ? 5 : span > 2 ? 6 : 7;

        const isMobile = window.innerWidth < 768;
        const choropleth = {
            type: "choroplethmap",
            geojson: geojson,
            locations: locations,
            z: zValues,
            zmin: -maxAbs,
            zmax: maxAbs,
            featureidkey: "properties.name",
            colorscale: [[0, "#cf222e"], [0.5, "#ffffff"], [1, "#1a7f37"]],
            autocolorscale: false,
            colorbar: {
                title: { text: "Peak YoY (%)" },
                titleside: "right"
            },
            hoverinfo: "text",
            hovertext: hoverTexts,
            marker: { line: { color: "white", width: 0.8 } },
            name: "YoY Change"
        };

        if (isMobile) {
            choropleth.colorbar = {
                title: { text: "Peak YoY (%)" },
                orientation: "h",
                y: 1, yanchor: "bottom",
                x: 0.5, xanchor: "center",
                len: 0.9, lenmode: "fraction"
            };
        }

        Plotly.newPlot(el, [choropleth], {
            title: title ? { text: title, font: { family: "Georgia, serif", size: 18 }, x: 0.5 } : undefined,
            height: 550,
            autosize: true,
            map: {
                style: "light",
                center: { lon: centerLon, lat: centerLat },
                zoom: zoom
            },
            margin: { l: 0, r: 0, t: title ? 60 : 0, b: 0 },
            paper_bgcolor: "rgba(0,0,0,0)"
        }, { responsive: true, displayModeBar: false });

        // Hide maplibre controls
        const ctrl = el.querySelector(".maplibregl-control-container");
        if (ctrl) ctrl.style.display = "none";
    }

    return { renderRegionMap, renderCountryMap };
})();
