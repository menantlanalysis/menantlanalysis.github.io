/* ============================================================
   stae.charts — Plotly chart rendering (time series + sparkline)
   ============================================================ */
window.stae = window.stae || {};

stae.charts = (() => {

    function clearSkeleton(el) {
        el.querySelectorAll(".skeleton").forEach(s => s.remove());
    }

    function renderTimeSeries(containerId, data, events, title) {
        const el = document.getElementById(containerId);
        if (!el) return;
        clearSkeleton(el);

        const dates = data.map(d => d.date);
        const smoothed = stae.stats.getSmoothedData(data);
        const monthly = stae.stats.getMonthlyAverage(data);

        const eventShapes = (events || []).map(e => ({
            type: "rect", xref: "x", yref: "paper",
            x0: e.start_date, y0: 0, x1: e.end_date, y1: 1,
            fillcolor: e.color === "country"
                ? "rgba(211, 47, 47, 0.15)"
                : "rgba(25, 118, 210, 0.15)",
            line: { width: 0 }
        }));

        const eventAnnotations = (events || []).map(e => ({
            x: e.start_date,
            y: e.color === "country" ? 0.1 : 0.9,
            yref: "paper",
            text: e.name,
            showarrow: false,
            xanchor: e.color === "country" ? "left" : "right",
            textangle: -90,
            font: {
                color: e.color === "country" ? "#b71c1c" : "#0d47a1",
                size: 13
            }
        }));

        const isMobile = window.innerWidth < 768;
        const yearsToShow = isMobile ? 1 : 3;
        const latestDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
        const priorDate = new Date(latestDate);
        priorDate.setFullYear(priorDate.getFullYear() - yearsToShow);

        Plotly.newPlot(el, [
            {
                x: dates,
                y: data.map(d => d.luminosity),
                mode: "markers",
                type: "scatter",
                name: "Data Points",
                marker: { color: "#1a7f37", opacity: 0.5, size: 4 }
            },
            {
                x: smoothed.map(d => d.date),
                y: smoothed.map(d => d.value),
                mode: "lines",
                name: "LOESS Fit",
                line: { color: "#326891", width: 3 }
            },
            {
                x: monthly.map(d => d.date),
                y: monthly.map(d => d.value),
                type: "bar",
                name: "Monthly Avg",
                marker: { color: "rgba(50, 104, 145, 0.2)" }
            }
        ], {
            title: { text: title, font: { family: "Georgia, serif", size: 18 }, x: 0.5 },
            xaxis: {
                title: "Date",
                rangeslider: { visible: true },
                type: "date",
                range: [priorDate.toISOString().slice(0, 10), latestDate.toISOString().slice(0, 10)]
            },
            yaxis: { title: "Luminosity (nW/sr/cm\u00B2)" },
            shapes: eventShapes,
            annotations: eventAnnotations,
            showlegend: true,
            legend: { x: 1, xanchor: "right", y: 1 },
            margin: { l: 60, r: 20, t: 60, b: 50 },
            dragmode: "pan",
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { family: "Georgia, serif" }
        }, { responsive: true });
    }

    function renderSparkline(containerId, data, opts) {
        const el = document.getElementById(containerId);
        if (!el || data.length < 2) return;
        clearSkeleton(el);

        // Last 12 months of data
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const recent = data.filter(d => new Date(d.date) >= cutoff);
        const src = recent.length >= 2 ? recent : data;

        const dates = src.map(d => d.date);
        const values = src.map(d => d.luminosity);

        // Try LOESS smooth for sparkline, fallback to raw
        let yVals = values;
        try {
            const numDates = dates.map(d => new Date(d).getTime());
            yVals = science.stats.loess().bandwidth(0.3)(numDates, values);
        } catch { /* use raw */ }

        const color = opts && opts.color ? opts.color : "#326891";

        Plotly.newPlot(el, [{
            x: dates,
            y: yVals,
            mode: "lines",
            line: { color, width: 2 },
            fill: "tozeroy",
            fillcolor: color.replace(")", ", 0.1)").replace("rgb", "rgba"),
            hoverinfo: "skip"
        }], {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            xaxis: { visible: false },
            yaxis: { visible: false },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            showlegend: false
        }, {
            staticPlot: true,
            responsive: true,
            displayModeBar: false
        });
    }

    return { renderTimeSeries, renderSparkline };
})();
