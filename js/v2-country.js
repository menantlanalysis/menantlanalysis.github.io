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

    // --- Video ---
    const countryVideo = document.getElementById("country-video");
    countryVideo.src = API + country.video;
    stae.video.create(countryVideo);

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
        "Year-over-Year Peak Regional Luminosity Shift");

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

    for (const [muniKey, muni] of muniEntries) {
        const yoy = muniYoY[muniKey];
        const f = stae.stats.formatChange(yoy);
        const cls = f.cls === "positive" ? "stat-box__value--positive"
            : f.cls === "negative" ? "stat-box__value--negative"
            : "stat-box__value--neutral";

        const card = document.createElement("details");
        card.className = "muni-card reveal";

        card.innerHTML = `
            <summary>
                <span class="muni-card__sparkline" id="muni-spark-${muniKey}"></span>
                <span>${formatName(muniKey)}</span>
                <span class="muni-card__stat ${cls}">${f.text}</span>
            </summary>
            <div class="muni-card__detail">
                <div class="muni-card__chart" id="muni-chart-${muniKey}"></div>
                ${muni.video ? `<div class="muni-card__video-wrap"><video class="muni-card__video" muted playsinline src="${API}${muni.video}"></video></div>` : ""}
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
            if (card.open && !detailRendered) {
                detailRendered = true;
                const data = allMuniData[muniKey] || [];
                if (data.length >= 2) {
                    const muniEvents = [
                        ...(country.events || []).map(e => ({ ...e, color: "country" })),
                        ...(muni.events || []).map(e => ({ ...e, color: "muni" }))
                    ];
                    stae.charts.renderTimeSeries(
                        `muni-chart-${muniKey}`, data, muniEvents,
                        `${formatName(muniKey)}, ${country.displayName}`
                    );
                }
                // Init custom video player for this card
                const vid = card.querySelector(".muni-card__video");
                if (vid) stae.video.create(vid);
            }
        });
    }

    // Observe new reveal elements (muni cards added dynamically)
    document.querySelectorAll(".muni-card.reveal").forEach(el => revealObserver.observe(el));

    // --- Events Timeline ---
    const events = country.events || [];
    if (events.length > 0) {
        document.getElementById("events-section").style.display = "";
        const timeline = document.getElementById("events-timeline");

        // Collect all events (country + municipality level)
        const allTimelineEvents = [
            ...events.map(e => ({ ...e, scope: "Country-wide" }))
        ];
        // Add municipality events
        for (const [mKey, muni] of Object.entries(country.municipalities)) {
            if (muni.events) {
                for (const e of muni.events) {
                    allTimelineEvents.push({ ...e, scope: formatName(mKey) });
                }
            }
        }

        // Sort by start_date
        allTimelineEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        for (const evt of allTimelineEvents) {
            const item = document.createElement("div");
            item.className = "timeline__item";
            item.innerHTML = `
                <div class="timeline__dot"></div>
                <div class="timeline__date">${evt.start_date} &mdash; ${evt.end_date}</div>
                <div class="timeline__title">${evt.name}</div>
                <div class="timeline__scope">${evt.scope}</div>
            `;
            timeline.appendChild(item);
        }
    }
});
