/* ============================================================
   stae Country Page Controller
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {

    const API = stae.data.API_BASE_URL;

    // --- Get country key from URL ---
    const params = new URLSearchParams(window.location.search);
    const countryKey = params.get("country");
    if (!countryKey) {
        window.location.href = "index.html";
        return;
    }

    // --- Masthead scroll effect ---
    const masthead = document.getElementById("masthead");
    window.addEventListener("scroll", () => {
        masthead.classList.toggle("scrolled", window.scrollY > 10);
    }, { passive: true });

    // --- Mobile nav toggle ---
    const navToggle = document.getElementById("nav-toggle");
    const mainNav = document.getElementById("main-nav");
    if (navToggle) {
        navToggle.addEventListener("click", () => mainNav.classList.toggle("open"));
    }

    // --- Scroll reveal ---
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));

    // --- Load config ---
    let config;
    try {
        config = await stae.data.loadConfig();
    } catch (err) {
        console.error("Failed to load config:", err);
        document.getElementById("hero-title").textContent = "Error loading data";
        return;
    }

    const country = config.countries[countryKey];
    if (!country) {
        window.location.href = "index.html";
        return;
    }

    // --- Page title ---
    document.title = `${country.displayName} — Nighttime Lights`;

    // --- Footer ---
    const footerDate = document.getElementById("footer-last-run");
    if (footerDate && config.last_run_date) {
        footerDate.textContent = `Last updated: ${config.last_run_date}`;
    }

    // --- Hero ---
    const muniCount = Object.keys(country.municipalities).length;
    document.getElementById("hero-title").textContent = country.displayName;
    document.getElementById("hero-subtitle").textContent =
        `${muniCount} governorates tracked`;
    document.getElementById("hero-bg").style.backgroundImage =
        `url('${API}${country.diff}')`;

    // --- Satellite comparison (Juxtapose) ---
    if (country.lightbox) {
        const lb = country.lightbox;
        const datesEl = document.getElementById("comparison-dates");
        datesEl.textContent = `Drag the slider to compare satellite imagery from ${lb.earliest.date} to ${lb.latest.date}.`;

        new juxtapose.JXSlider("#juxtapose-container", [
            { src: API + lb.earliest.path, label: lb.earliest.date },
            { src: API + lb.latest.path, label: lb.latest.date }
        ], {
            animate: true, showLabels: true, showCredits: false,
            startingPosition: "50%", makeResponsive: true
        });
    }

    // --- Diff image ---
    document.getElementById("diff-image").src = API + country.diff;

    // --- Monthly Satellite Slider ---
    if (country.monthly && country.monthly.length > 0) {
        stae.monthlySlider.create({
            images: country.monthly,
            viewportId: "monthly-viewport",
            rangeId: "monthly-range",
            labelsId: "monthly-labels",
            labelId: "monthly-current-label",
            prevId: "monthly-prev",
            nextId: "monthly-next",
            baseUrl: API,
        });
    } else {
        const monthlySection = document.getElementById("monthly-section");
        if (monthlySection) monthlySection.style.display = "none";
    }

    // --- Load municipality data + GeoJSON ---
    let geojsonData, allMuniData, aggregated, countryStats, muniYoY;

    try {
        const [geo, muniData] = await Promise.all([
            stae.data.fetchJSON(country.map),
            stae.data.loadAllMuniData(country)
        ]);
        geojsonData = geo;
        allMuniData = muniData;
        aggregated = stae.data.aggregateCountryData(allMuniData);
        countryStats = stae.stats.computeCountryStats(aggregated);
        muniYoY = stae.stats.computeMuniYoY(allMuniData);
    } catch (err) {
        console.error("Failed to load country data:", err);
        return;
    }

    // --- Update hero subtitle with YoY ---
    if (countryStats && countryStats.yoy != null) {
        const f = stae.stats.formatChange(countryStats.yoy);
        const dir = countryStats.yoy >= 0 ? "increased" : "decreased";
        document.getElementById("hero-subtitle").textContent =
            `${muniCount} governorates tracked \u00B7 Luminosity has ${dir} ${Math.abs(countryStats.yoy).toFixed(1)}% year over year`;
    }

    // --- Time series chart ---
    const allEvents = (country.events || []).map(e => ({ ...e, color: "country" }));
    stae.charts.renderTimeSeries("country-chart", aggregated, allEvents,
        `Total Nighttime Luminosity: ${country.displayName}`);

    // --- Stat boxes ---
    function setStat(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        const f = stae.stats.formatChange(value);
        el.className = `stat-box__value stat-box__value--${f.cls}`;
        el.textContent = f.text;
    }
    if (countryStats) {
        setStat("stat-yoy", countryStats.yoy);
        setStat("stat-ytd", countryStats.ytd);
        setStat("stat-qtd", countryStats.qtd);
        setStat("stat-peak", countryStats.peak);
    }

    // --- Country choropleth map ---
    stae.map.renderCountryMap("country-map", muniYoY, geojsonData,
        "Year-over-Year Peak Regional Luminosity Shift", (muniKey) => {
            const card = document.getElementById(`muni-card-${muniKey}`);
            if (!card) return;
            card.setAttribute("open", "");
            card.scrollIntoView({ behavior: "smooth", block: "start" });
        });

    // --- Municipality cards ---
    const muniCardsEl = document.getElementById("muni-cards");
    const sanitize = name => name.replace(/\//g, "_").replace(/ /g, "_").trim().toLowerCase();
    const formatName = key => key.replace(/_\(.*\)|_/g, " ").replace(/\b\w/g, l => l.toUpperCase()).trim();

    // Sort municipalities by |YoY| descending
    const muniEntries = Object.entries(country.municipalities)
        .sort((a, b) => {
            const aYoY = muniYoY[a[0]] != null ? Math.abs(muniYoY[a[0]]) : 0;
            const bYoY = muniYoY[b[0]] != null ? Math.abs(muniYoY[b[0]]) : 0;
            return bYoY - aYoY;
        });

    // Collect all events relevant to each muni (country-wide + muni-specific)
    const countryEvents = (country.events || []).map(e => ({ ...e, scope: "Country-wide" }));

    for (const [muniKey, muni] of muniEntries) {
        const yoy = muniYoY[muniKey];
        const f = stae.stats.formatChange(yoy);
        const cls = f.cls === "positive" ? "stat-box__value--positive"
            : f.cls === "negative" ? "stat-box__value--negative"
            : "stat-box__value--neutral";

        const cardEvents = [
            ...countryEvents,
            ...(muni.events || []).map(e => ({ ...e, scope: formatName(muniKey) }))
        ].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        const card = document.createElement("details");
        card.className = "muni-card reveal";
        card.id = `muni-card-${muniKey}`;

        card.innerHTML = `
            <summary>
                <span class="muni-card__sparkline" id="muni-spark-${muniKey}"></span>
                <span class="muni-card__name">${formatName(muniKey)}</span>
                <span class="muni-card__stat ${cls}">${f.text}</span>
            </summary>
            <div class="muni-card__detail">
                <div class="muni-card__chart" id="muni-chart-${muniKey}"></div>
                ${cardEvents.length ? `<div class="muni-card__events"><h4 class="muni-card__events-title">Key Events</h4><div class="timeline" id="muni-timeline-${muniKey}"></div></div>` : ""}
                ${muni.csv ? `<a class="muni-card__download" href="${API}${muni.csv}" download="${muniKey}.csv">Download CSV &darr;</a>` : ""}
            </div>
        `;

        muniCardsEl.appendChild(card);

        // Render sparkline immediately (small, fast)
        const muniData = allMuniData[muniKey] || [];
        if (muniData.length >= 2) {
            stae.charts.renderSparkline(`muni-spark-${muniKey}`, muniData);
        }

        // Lazy render full chart + video player on expand
        let detailRendered = false;
        card.addEventListener("toggle", () => {
            // Close other open cards (accordion behavior)
            if (card.open) {
                muniCardsEl.querySelectorAll("details[open]").forEach(other => {
                    if (other !== card) other.removeAttribute("open");
                });
            }
            if (card.open && !detailRendered) {
                detailRendered = true;
                const data = allMuniData[muniKey] || [];
                if (data.length >= 2) {
                    const chartEvents = [
                        ...(country.events || []).map(e => ({ ...e, color: "country" })),
                        ...(muni.events || []).map(e => ({ ...e, color: "muni" }))
                    ];
                    stae.charts.renderTimeSeries(
                        `muni-chart-${muniKey}`, data, chartEvents,
                        `${formatName(muniKey)}, ${country.displayName}`
                    );
                }
                // Render event timeline (country-wide + muni-specific)
                const muniTimeline = document.getElementById(`muni-timeline-${muniKey}`);
                if (muniTimeline && cardEvents.length) {
                    const MS_DAY = 86400000;
                    cardEvents.forEach((evt, j) => {
                        const cId = `muni-evt-${muniKey}-${j}`;
                        const item = document.createElement("div");
                        item.className = "timeline__item";
                        item.innerHTML = `
                            <div class="timeline__dot"></div>
                            <div class="timeline__info">
                                <div class="timeline__date">${evt.start_date} &mdash; ${evt.end_date}</div>
                                <div class="timeline__title">${evt.name}</div>
                                <div class="timeline__scope">${evt.scope}</div>
                            </div>
                            <div class="timeline__chart" id="${cId}"></div>
                        `;
                        muniTimeline.appendChild(item);

                        const eStart = new Date(evt.start_date).getTime();
                        const eEnd = new Date(evt.end_date).getTime();
                        const slice = (data.length >= 2 ? data : []).filter(d => {
                            const t = new Date(d.date).getTime();
                            return t >= eStart - 90 * MS_DAY && t <= eEnd + 90 * MS_DAY;
                        });
                        if (slice.length >= 2) {
                            stae.charts.renderSparkline(cId, slice, { eventRange: { start: evt.start_date, end: evt.end_date } });
                        }
                    });
                }
            }
        });
    }

    // Observe new reveal elements (muni cards added dynamically)
    document.querySelectorAll(".muni-card.reveal").forEach(el => revealObserver.observe(el));

    // --- Events Timeline ---
    const rawEvents = country.events || [];
    if (rawEvents.length > 0) {
        document.getElementById("events-section").style.display = "";
        const timeline = document.getElementById("events-timeline");

        const allTimelineEvents = rawEvents
            .map(e => ({ ...e, scope: "Country-wide" }))
            .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        const MS_PER_DAY = 86400000;

        allTimelineEvents.forEach((evt, i) => {
            const chartId = `event-chart-${i}`;
            const item = document.createElement("div");
            item.className = "timeline__item";
            item.innerHTML = `
                <div class="timeline__dot"></div>
                <div class="timeline__info">
                    <div class="timeline__date">${evt.start_date} &mdash; ${evt.end_date}</div>
                    <div class="timeline__title">${evt.name}</div>
                    <div class="timeline__scope">${evt.scope}</div>
                </div>
                <div class="timeline__chart" id="${chartId}"></div>
            `;
            timeline.appendChild(item);

            // Slice: 3 months before → 3 months after
            const evtStart = new Date(evt.start_date).getTime();
            const evtEnd = new Date(evt.end_date).getTime();
            const slice = aggregated.filter(d => {
                const t = new Date(d.date).getTime();
                return t >= evtStart - 90 * MS_PER_DAY && t <= evtEnd + 90 * MS_PER_DAY;
            });

            if (slice.length >= 2) {
                stae.charts.renderSparkline(chartId, slice, { eventRange: { start: evt.start_date, end: evt.end_date } });
            }
        });
    }
});
