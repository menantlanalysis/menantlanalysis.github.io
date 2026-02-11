/* ============================================================
   stae.data — Data fetching, caching, CSV parsing, aggregation
   ============================================================ */
window.stae = window.stae || {};

stae.data = (() => {
    const API_BASE_URL = "https://menantlanalysis.github.io/";
    const _cache = {};

    async function fetchJSON(path) {
        const url = API_BASE_URL + path;
        if (!_cache[url]) {
            _cache[url] = fetch(url).then(r => {
                if (!r.ok) throw new Error(`Failed to fetch ${path}`);
                return r.json();
            });
        }
        return _cache[url];
    }

    async function fetchCSV(path) {
        const url = API_BASE_URL + path;
        if (!_cache[url]) {
            _cache[url] = fetch(url)
                .then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch ${path}`);
                    return r.text();
                })
                .then(text => new Promise((resolve, reject) => {
                    Papa.parse(text, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        complete: res => resolve(
                            res.data.filter(d => d.date && d.luminosity !== undefined)
                        ),
                        error: err => reject(new Error(`CSV parse error: ${err.message}`))
                    });
                }));
        }
        return _cache[url];
    }

    async function loadConfig() {
        const [config, events] = await Promise.all([
            fetchJSON("config.json"),
            fetchJSON("events.json")
        ]);
        // Merge events into config
        for (const cKey in events) {
            if (config.countries[cKey]) {
                config.countries[cKey].events = events[cKey].events || [];
                for (const mKey in events[cKey].municipalities || {}) {
                    if (config.countries[cKey].municipalities[mKey]) {
                        config.countries[cKey].municipalities[mKey].events =
                            events[cKey].municipalities[mKey].events || [];
                    }
                }
            }
        }
        return config;
    }

    async function loadAllMuniData(country) {
        const entries = Object.entries(country.municipalities);
        const results = await Promise.allSettled(
            entries.map(async ([key, muni]) => {
                if (!muni.csv) return [key, []];
                try {
                    return [key, await fetchCSV(muni.csv)];
                } catch {
                    return [key, []];
                }
            })
        );
        return Object.fromEntries(
            results
                .filter(r => r.status === "fulfilled")
                .map(r => r.value)
        );
    }

    function aggregateCountryData(allMuniData) {
        const allDates = [
            ...new Set(Object.values(allMuniData).flat().map(d => d.date))
        ].sort();

        const aggregated = allDates.map(date => ({ date, luminosity: 0 }));
        const muniArrays = Object.values(allMuniData);

        for (const muniData of muniArrays) {
            if (muniData.length === 0) continue;

            for (const agg of aggregated) {
                // Binary search for closest point <= agg.date
                let low = 0, high = muniData.length - 1, nearestIdx = -1;
                const targetTime = new Date(agg.date).getTime();
                while (low <= high) {
                    const mid = (low + high) >> 1;
                    if (new Date(muniData[mid].date).getTime() <= targetTime) {
                        nearestIdx = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }
                if (nearestIdx === -1) continue;

                if (muniData[nearestIdx].date === agg.date) {
                    agg.luminosity += muniData[nearestIdx].luminosity;
                } else {
                    const start = Math.max(0, nearestIdx - 3);
                    const window = muniData.slice(start, nearestIdx + 1);
                    const avg = window.reduce((s, p) => s + p.luminosity, 0) / window.length;
                    agg.luminosity += avg;
                }
            }
        }

        return aggregated;
    }

    return {
        API_BASE_URL,
        fetchJSON,
        fetchCSV,
        loadConfig,
        loadAllMuniData,
        aggregateCountryData
    };
})();
