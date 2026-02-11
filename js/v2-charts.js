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
            shapes: [],
            annotations: [],
            showlegend: true,
            legend: { x: 1, xanchor: "right", y: 1 },
            margin: { l: 60, r: 20, t: 60, b: 50 },
            dragmode: "pan",
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { family: "Georgia, serif" }
        }, { responsive: true });

        // Toggle button for event overlays
        if (events && events.length > 0) {
            const btn = document.createElement("button");
            btn.className = "chart-events-toggle";
            btn.textContent = "Show Events";
            let visible = false;

            btn.addEventListener("click", () => {
                visible = !visible;
                Plotly.relayout(el, {
                    shapes: visible ? eventShapes : [],
                    annotations: visible ? eventAnnotations : []
                });
                btn.textContent = visible ? "Hide Events" : "Show Events";
                btn.classList.toggle("chart-events-toggle--active", visible);
            });

            el.insertAdjacentElement("beforebegin", btn);
        }
    }

    function renderSparkline(containerId, data, opts) {
        const el = document.getElementById(containerId);
        if (!el || data.length < 2) return;
        clearSkeleton(el);

        // Skip 12-month cutoff when data is pre-sliced (e.g. event sparklines)
        let src;
        if (opts && opts.eventRange) {
            src = data;
        } else {
            const cutoff = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 1);
            const recent = data.filter(d => new Date(d.date) >= cutoff);
            src = recent.length >= 2 ? recent : data;
        }

        const dates = src.map(d => d.date);
        const values = src.map(d => d.luminosity);

        // Try LOESS smooth for sparkline, fallback to raw
        let yVals = values;
        try {
            const numDates = dates.map(d => new Date(d).getTime());
            yVals = science.stats.loess().bandwidth(0.3)(numDates, values);
        } catch { /* use raw */ }

        const color = opts && opts.color ? opts.color : "#326891";

        // Optional shaded range (e.g. event period)
        const shapes = [];
        if (opts && opts.eventRange) {
            shapes.push({
                type: "rect", xref: "x", yref: "paper",
                x0: opts.eventRange.start, x1: opts.eventRange.end,
                y0: 0, y1: 1,
                fillcolor: "rgba(211, 47, 47, 0.45)",
                line: { width: 0 }
            });
        }

        // X-axis: show first/last date labels when eventRange is set
        const xaxis = { visible: false };
        if (opts && opts.eventRange && dates.length >= 2) {
            const first = dates[0];
            const last = dates[dates.length - 1];
            const fmtDate = d => {
                const dt = new Date(d);
                const mon = dt.toLocaleString("en", { month: "short" });
                return `${mon} ${dt.getFullYear()}`;
            };
            xaxis.visible = true;
            xaxis.showgrid = false;
            xaxis.showline = false;
            xaxis.zeroline = false;
            xaxis.tickmode = "array";
            xaxis.tickvals = [first, last];
            xaxis.ticktext = [fmtDate(first), fmtDate(last)];
            xaxis.tickfont = { size: 9, family: "Helvetica Neue, Arial, sans-serif", color: "#999" };
        }

        const h = el.clientHeight || 80;

        Plotly.newPlot(el, [{
            x: dates,
            y: yVals,
            mode: "lines",
            line: { color, width: 2 },
            fill: "tozeroy",
            fillcolor: color.replace(")", ", 0.1)").replace("rgb", "rgba"),
            hoverinfo: "skip"
        }], {
            height: h,
            margin: { l: 0, r: 0, t: 0, b: opts && opts.eventRange ? 18 : 0 },
            xaxis: xaxis,
            yaxis: { visible: false },
            shapes: shapes,
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
