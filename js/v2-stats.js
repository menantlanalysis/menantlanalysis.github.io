/* ============================================================
   stae.stats — Statistical utilities (LOESS, YoY, YtD, etc.)
   Extracted from v1 script.js statsUtil
   ============================================================ */
window.stae = window.stae || {};

stae.stats = (() => {
    const LOESS_BANDWIDTH = 0.25;

    function getSmoothedData(data) {
        if (data.length < 2) return [];
        const dates = data.map(d => new Date(d.date).getTime());
        const values = data.map(d => d.luminosity);
        const loess = science.stats.loess().bandwidth(LOESS_BANDWIDTH)(dates, values);
        return data.map((d, i) => ({ date: new Date(d.date), value: loess[i] }));
    }

    function getMonthlyAverage(data) {
        if (data.length === 0) return [];
        const buckets = new Map();
        for (const d of data) {
            const dt = new Date(d.date);
            const key = `${dt.getFullYear()}-${dt.getMonth()}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    sum: 0, count: 0,
                    mid: new Date(dt.getFullYear(), dt.getMonth(), 15)
                });
            }
            const b = buckets.get(key);
            b.sum += d.luminosity;
            b.count += 1;
        }
        return [...buckets.values()]
            .map(b => ({ date: b.mid, value: b.sum / b.count }))
            .sort((a, b) => a.date - b.date);
    }

    function getQuarterlyAverage(data) {
        if (data.length === 0) return [];
        const buckets = new Map();
        for (const d of data) {
            const dt = new Date(d.date);
            const q = Math.floor(dt.getMonth() / 3);
            const key = `${dt.getFullYear()}-Q${q}`;
            if (!buckets.has(key)) {
                buckets.set(key, {
                    sum: 0, count: 0,
                    mid: new Date(dt.getFullYear(), q * 3 + 1, 15)
                });
            }
            const b = buckets.get(key);
            b.sum += d.luminosity;
            b.count += 1;
        }
        return [...buckets.values()]
            .map(b => ({ date: b.mid, value: b.sum / b.count }))
            .sort((a, b) => a.date - b.date);
    }

    function getMaxForWindow(data, endDate, windowDays) {
        const endMs = new Date(endDate).getTime();
        const startMs = endMs - windowDays * 86400000;
        const pts = data.filter(d => {
            const t = new Date(d.date).getTime();
            return t >= startMs && t <= endMs;
        });
        if (pts.length === 0) return null;
        return pts.reduce((a, b) => b.value > a.value ? b : a);
    }

    function calculateChange(start, end) {
        if (!start || !end || start.value === 0 || start.date >= end.date) return null;
        return ((end.value - start.value) / start.value) * 100;
    }

    function findClosestPoint(targetDate, data) {
        return data.reduce((prev, curr) =>
            Math.abs(curr.date - targetDate) < Math.abs(prev.date - targetDate) ? curr : prev
        );
    }

    function formatChange(change) {
        if (change === null || change === undefined) return { text: "N/A", cls: "neutral" };
        const sign = change >= 0 ? "\u25B2" : "\u25BC";
        return {
            text: `${sign} ${Math.abs(change).toFixed(2)}%`,
            cls: change >= 0 ? "positive" : "negative"
        };
    }

    function formatChangeHTML(change) {
        const f = formatChange(change);
        if (f.cls === "neutral") return '<span class="stat-box__value stat-box__value--neutral">N/A</span>';
        const cls = f.cls === "positive" ? "stat-box__value--positive" : "stat-box__value--negative";
        return `<span class="stat-box__value ${cls}">${f.text}</span>`;
    }

    function computeCountryStats(data) {
        const smoothed = getSmoothedData(data);
        if (smoothed.length < 2) return null;

        const last = smoothed[smoothed.length - 1];
        const lastDate = last.date;

        const yoyDate = new Date(lastDate);
        yoyDate.setFullYear(lastDate.getFullYear() - 1);
        const ytdDate = new Date(lastDate.getFullYear(), 0, 1);
        const qtdDate = new Date(lastDate.getFullYear(), Math.floor(lastDate.getMonth() / 3) * 3, 1);

        const yoy = calculateChange(findClosestPoint(yoyDate, smoothed), last);
        const ytd = calculateChange(findClosestPoint(ytdDate, smoothed), last);
        const qtd = calculateChange(findClosestPoint(qtdDate, smoothed), last);

        const prevPeak = getMaxForWindow(smoothed, yoyDate, 60);
        const currPeak = getMaxForWindow(smoothed, lastDate, 60);
        const peak = calculateChange(prevPeak, currPeak);

        return { yoy, ytd, qtd, peak };
    }

    function computeMuniYoY(allMuniData) {
        const result = {};
        for (const [key, data] of Object.entries(allMuniData)) {
            if (data.length < 2) continue;
            const dates = data.map(d => new Date(d.date).getTime());
            const values = data.map(d => d.luminosity);

            // Try LOESS first, fall back to monthly averages for sparse data
            let smoothed;
            try {
                const loessValues = science.stats.loess().bandwidth(LOESS_BANDWIDTH)(dates, values);
                smoothed = data.map((d, i) => ({
                    date: new Date(d.date),
                    value: loessValues[i]
                })).sort((a, b) => a.date - b.date);
            } catch {
                // LOESS failed — fall back to monthly averages
                smoothed = getMonthlyAverage(data);
            }

            if (smoothed.length < 2) continue;

            const last = smoothed[smoothed.length - 1];
            const yoyDate = new Date(last.date);
            yoyDate.setFullYear(last.date.getFullYear() - 1);

            // Progressively widen window until we find data
            let prevPeak = null;
            for (const w of [60, 120, 180]) {
                prevPeak = getMaxForWindow(smoothed, yoyDate, w);
                if (prevPeak) break;
            }
            // Last resort: nearest point to yoyDate
            if (!prevPeak) prevPeak = findClosestPoint(yoyDate, smoothed);

            const currPeak = getMaxForWindow(smoothed, last.date, 60) || last;
            result[key] = calculateChange(prevPeak, currPeak);
        }
        return result;
    }

    return {
        LOESS_BANDWIDTH,
        getSmoothedData,
        getMonthlyAverage,
        getQuarterlyAverage,
        getMaxForWindow,
        calculateChange,
        findClosestPoint,
        formatChange,
        formatChangeHTML,
        computeCountryStats,
        computeMuniYoY
    };
})();
