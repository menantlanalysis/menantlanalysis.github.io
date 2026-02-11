/* ============================================================
   stae Landing Page Controller
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {

    const COUNTRY_ORDER = ["syria", "lebanon", "yemen", "libya", "iran", "egypt"];

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
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

    // --- Load config ---
    let config;
    try {
        config = await stae.data.loadConfig();
    } catch (err) {
        console.error("Failed to load config:", err);
        document.getElementById("region-map").innerHTML =
            '<p style="text-align:center;padding:40px;color:#999;">Failed to load data.</p>';
        return;
    }

    // Footer
    const footerDate = document.getElementById("footer-last-run");
    if (footerDate && config.last_run_date) {
        footerDate.textContent = `Last updated: ${config.last_run_date}`;
    }

    // --- Build skeleton country cards ---
    const cardsContainer = document.getElementById("country-cards");
    const cardElements = {};

    for (const key of COUNTRY_ORDER) {
        const country = config.countries[key];
        if (!country) continue;

        const muniCount = Object.keys(country.municipalities).length;
        const card = document.createElement("a");
        card.className = "country-card";
        card.href = `country.html?country=${key}`;
        card.innerHTML = `
            <div class="country-card__name">${country.displayName}</div>
            <div class="country-card__sparkline skeleton skeleton--sparkline" id="spark-${key}"></div>
            <div class="country-card__stat" id="stat-${key}">
                <span class="skeleton skeleton--stat"></span>
            </div>
            <div class="country-card__meta">${muniCount} governorates tracked</div>
            <span class="country-card__link">Read analysis &rarr;</span>
        `;
        cardsContainer.appendChild(card);
        cardElements[key] = card;
    }

    // --- Fetch GeoJSON for all countries ---
    const geojsonByCountry = {};
    const geojsonPromises = COUNTRY_ORDER.map(async key => {
        const country = config.countries[key];
        if (!country || !country.map) return;
        try {
            geojsonByCountry[key] = await stae.data.fetchJSON(country.map);
        } catch (err) {
            console.warn(`Failed to load map for ${key}:`, err);
        }
    });
    await Promise.all(geojsonPromises);

    // --- Render map with neutral colors initially ---
    const yoyByCountry = {};
    COUNTRY_ORDER.forEach(k => yoyByCountry[k] = null);

    stae.map.renderRegionMap("region-map", geojsonByCountry, yoyByCountry, (countryKey) => {
        window.location.href = `country.html?country=${countryKey}`;
    });

    // --- Load municipality data per country and update cards + map ---
    const countryDataCache = {};

    async function loadCountryStats(key) {
        const country = config.countries[key];
        if (!country) return;

        try {
            const muniData = await stae.data.loadAllMuniData(country);
            const aggregated = stae.data.aggregateCountryData(muniData);
            countryDataCache[key] = { muniData, aggregated };

            // Compute stats
            const stats = stae.stats.computeCountryStats(aggregated);
            const yoy = stats ? stats.yoy : null;
            yoyByCountry[key] = yoy;

            // Update card stat
            const statEl = document.getElementById(`stat-${key}`);
            if (statEl) {
                const f = stae.stats.formatChange(yoy);
                const cls = f.cls === "positive" ? "stat-box__value--positive"
                    : f.cls === "negative" ? "stat-box__value--negative"
                    : "stat-box__value--neutral";
                statEl.innerHTML = `<span class="${cls}">${f.text}</span> YoY`;
            }

            // Render sparkline
            const sparkEl = document.getElementById(`spark-${key}`);
            if (sparkEl) {
                sparkEl.classList.remove("skeleton", "skeleton--sparkline");
                stae.charts.renderSparkline(`spark-${key}`, aggregated);
            }
        } catch (err) {
            console.warn(`Failed to load data for ${key}:`, err);
            const statEl = document.getElementById(`stat-${key}`);
            if (statEl) statEl.innerHTML = '<span class="stat-box__value--neutral">N/A</span>';
        }
    }

    // Load all countries in parallel, update map progressively
    const countryPromises = COUNTRY_ORDER.map(key =>
        loadCountryStats(key).then(() => {
            // Re-render map with updated YoY values
            stae.map.renderRegionMap("region-map", geojsonByCountry, yoyByCountry, (countryKey) => {
                window.location.href = `country.html?country=${countryKey}`;
            });
        })
    );

    await Promise.allSettled(countryPromises);
});
