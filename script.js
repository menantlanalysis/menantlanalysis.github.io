document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "https://menantlanalysis.github.io/";
    const LOESS_BANDWIDTH = 0.25;
    let appData = {};

    const elements = {
        body: document.body,
        menuToggle: document.getElementById('menu-toggle'),
        menu: document.getElementById('menu'),
        menuOverlay: document.getElementById('menu-overlay'),
        mainHeader: document.getElementById('main-header'),
        locationList: document.getElementById('location-list'),
        videoContainer: document.getElementById('video-container'),
        videoTitle: document.getElementById('video-title'),
        videoPlayer: document.getElementById('video-player'),
        chartWrapper: document.getElementById('chart-wrapper'),
        chartContainer: document.getElementById('chart-container'),
        lightBoxContainer: document.getElementById('lightbox-container'),
        lightBoxContent: document.getElementById('lightbox-content'),
        mainFooter: document.getElementById('main-footer'),
        downloadCsvLink: document.getElementById('download-csv-link'),
        statsContainer: document.getElementById('stats-summary'),
        mapContainer: document.getElementById('stats-map'),
        chartLoader: document.getElementById('chart-loader'),
        yoyCell: document.getElementById('yoy-change'),
        ytdCell: document.getElementById('ytd-change'),
        qtdCell: document.getElementById('qtd-change'),
    };

    const statsUtil = {
        getSmoothedData: (data) => {
            if (data.length < 2) return [];
            const dates = data.map(d => new Date(d.date).getTime());
            const values = data.map(d => d.luminosity);
            const loess = science.stats.loess().bandwidth(LOESS_BANDWIDTH)(dates, values);
            return data.map((d, i) => ({ date: new Date(d.date), value: loess[i] }));
        },
        calculateChange: (start, end) => {
            if (!start || !end || start.value === 0 || start.date >= end.date) return null;
            return ((end.value - start.value) / start.value) * 100;
        },
        findClosestPoint: (targetDate, data) => data.reduce((prev, curr) =>
            Math.abs(curr.date - targetDate) < Math.abs(prev.date - targetDate) ? curr : prev
        ),
        formatChange: (change) => {
            if (change === null) return 'N/A';
            const color = change >= 0 ? 'green' : 'red';
            const sign = change >= 0 ? '▲' : '▼';
            return `<span style="color: ${color};">${sign} ${Math.abs(change).toFixed(2)}%</span>`;
        }
    };

    const ui = {
        toggleMenu: () => {
            elements.body.classList.toggle('menu-is-open');
            elements.menu.classList.toggle('open');
        },
        setLoading: (isLoading) => {
            elements.chartLoader.style.display = isLoading ? 'block' : 'none';
        },
        showError: (error, target = elements.chartContainer) => {
            console.error(error);
            target.innerHTML = `<div class="error-message">${error.message}</div>`;
            ui.setLoading(false);
        },
        updateStats: (data) => {
            const smoothed = statsUtil.getSmoothedData(data);
            if (smoothed.length < 2) {
                elements.statsContainer.style.display = 'none';
                return;
            }
            const lastPoint = smoothed[smoothed.length - 1];
            const lastDate = lastPoint.date;
            const yoyDate = new Date(lastDate); yoyDate.setFullYear(lastDate.getFullYear() - 1);
            const ytdDate = new Date(lastDate.getFullYear(), 0, 1);
            const qtdDate = new Date(lastDate.getFullYear(), Math.floor(lastDate.getMonth() / 3) * 3, 1);

            elements.yoyCell.innerHTML = statsUtil.formatChange(statsUtil.calculateChange(statsUtil.findClosestPoint(yoyDate, smoothed), lastPoint));
            elements.ytdCell.innerHTML = statsUtil.formatChange(statsUtil.calculateChange(statsUtil.findClosestPoint(ytdDate, smoothed), lastPoint));
            elements.qtdCell.innerHTML = statsUtil.formatChange(statsUtil.calculateChange(statsUtil.findClosestPoint(qtdDate, smoothed), lastPoint));
            elements.statsContainer.style.display = 'block';
        },
        updateFooter: (lastRunDate) => {
            elements.mainFooter.innerHTML = `&copy; ${new Date().getFullYear()} All rights reserved. Last run: ${lastRunDate}. Contact: <a href="mailto:menantlanalysis@gmail.com">menantlanalysis@gmail.com</a>. Source: <a href="https://eogdata.mines.edu/products/vnl">EOG/VIIRS</a>`;
        },
        hideMapLibreControls: () => {
            const controlContainer = document.querySelector('.maplibregl-control-container');
            if (controlContainer) {
                controlContainer.style.display = 'none';
            }
        }
    };

    const geoUtil = {
        getBounds: (geojson) => {
            let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
            const coords = geojson.features.flatMap(f => f.geometry.coordinates.flat(2));
            for (let i = 0; i < coords.length; i += 2) {
                if (Number.isFinite(coords[i]) && Number.isFinite(coords[i+1])) {
                    minLon = Math.min(minLon, coords[i]);
                    maxLon = Math.max(maxLon, coords[i]);
                    minLat = Math.min(minLat, coords[i+1]);
                    maxLat = Math.max(maxLat, coords[i+1]);
                }
            }
            return { minLon, maxLon, minLat, maxLat };
        },
        estimateZoom: (bounds) => {
            const maxDiff = Math.max(bounds.maxLon - bounds.minLon, bounds.maxLat - bounds.minLat);
            const zoom = -1.446 * Math.log(maxDiff) + 8.274;
            return Math.max(1, zoom);
        }
    };

    const fetchData = async (url) => {
        const response = await fetch(API_BASE_URL + url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        return url.endsWith('.csv') ? response.text() : response.json();
    };

    const parseCsv = (text) => new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: res => resolve(res.data.filter(d => d.date && d.luminosity !== undefined)),
            error: err => reject(new Error(`CSV Parsing Error: ${err.message}`))
        });
    });

    const updateUrl = (countryKey, muniKey = null) => {
        const url = new URL(window.location);
        url.searchParams.set('view', muniKey ? `${countryKey},${muniKey}` : countryKey);
        history.pushState({ view: url.search }, '', url);
    };

    const buildNavigation = (data) => {
        const fragment = document.createDocumentFragment();
        for (const [countryKey, country] of Object.entries(data.countries)) {
            const countryDiv = document.createElement('div');
            const countryNameH3 = document.createElement('h3');
            countryNameH3.className = 'country-name';
            countryNameH3.textContent = country.displayName;
            countryNameH3.dataset.countryKey = countryKey;
            
            const muniList = document.createElement('ul');
            muniList.className = 'muni-list';
            for (const muniKey in country.municipalities) {
                const muniItem = document.createElement('li');
                muniItem.className = 'muni-item';
                muniItem.textContent = muniKey.replace(/_\(.*\)|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
                muniItem.dataset.countryKey = countryKey;
                muniItem.dataset.muniKey = muniKey;
                muniList.appendChild(muniItem);
            }
            countryDiv.append(countryNameH3, muniList);
            fragment.appendChild(countryDiv);
        }
        elements.locationList.innerHTML = '';
        elements.locationList.appendChild(fragment);
    };

    const drawChart = (data, events, title) => {
        const dates = data.map(d => d.date);
        const smoothed = statsUtil.getSmoothedData(data);
        const eventShapes = events.map(e => ({
            type: 'rect', xref: 'x', yref: 'paper', x0: e.start_date, y0: 0, x1: e.end_date, y1: 1,
            fillcolor: e.color === 'country' ? 'rgba(211, 47, 47, 0.2)' : 'rgba(25, 118, 210, 0.2)', line: { width: 0 }
        }));
        const eventAnnotations = events.map(e => ({
            x: e.start_date, y: 0.1, yref: 'paper', text: e.name, showarrow: false, xanchor: 'left', textangle: -90,
            font: { color: e.color === 'country' ? '#b71c1c' : '#0d47a1', size: 13 }
        }));

        const isMobile = window.innerWidth < 768;
        const yearsToShow = isMobile ? 1 : 3;
        const latestDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
        const priorDate = new Date(latestDate);
        priorDate.setFullYear(priorDate.getFullYear() - yearsToShow);

        Plotly.newPlot(elements.chartContainer, [
            { x: dates, y: data.map(d => d.luminosity), mode: 'markers', type: 'scatter', name: 'Data Points', marker: { color: 'grey', opacity: 0.7 } },
            { x: smoothed.map(d => d.date), y: smoothed.map(d => d.value), mode: 'lines', name: `LOESS Fit`, line: { color: '#0056b3', width: 3 } }
        ], {
            title: { text: `Total Nighttime Luminosity: ${title}`, font: { size: 20 }, x: 0.5 },
            xaxis: { title: 'Date', rangeslider: { visible: true }, type: 'date', range: [priorDate.toISOString().slice(0, 10), latestDate.toISOString().slice(0, 10)] },
            yaxis: { title: 'Luminosity (nW/sr/cm²)' },
            shapes: eventShapes, annotations: eventAnnotations, showlegend: true, legend: { x: 1, xanchor: 'right', y: 1 }, margin: { l: 60, r: 20, t: 80, b: 50 }, dragmode: 'pan'
        }, { responsive: true });
        
        ui.updateStats(data);
        ui.setLoading(false);
    };

    const drawMap = (muniData, geojson, title) => {
        elements.mapContainer.style.display = 'block';

        const muniYoYChanges = {};
        Object.entries(muniData).forEach(([key, data]) => {
            const dates = data.map(row => row.date);
            const values = data.map(row => row.luminosity);

            const numericDates = dates.map(d => new Date(d).getTime());
            const loessGenerator = science.stats.loess().bandwidth(LOESS_BANDWIDTH);
            const loessValues = loessGenerator(numericDates, values);

            const smoothedData = dates.map((date, i) => ({
                date: new Date(date),
                value: loessValues[i]
            })).sort((a, b) => a.date - b.date);

            if (smoothedData.length < 2) {
                return;
            }

            const lastPoint = smoothedData[smoothedData.length - 1];
            const lastDate = lastPoint.date;

            const findClosestPoint = (targetDate) => {
                return smoothedData.reduce((prev, curr) => {
                    return (Math.abs(curr.date - targetDate) < Math.abs(prev.date - targetDate) ? curr : prev);
                });
            };

            const calculateChange = (startPoint, endPoint) => {
                if (!startPoint || !endPoint || startPoint.value === 0 || startPoint.date >= endPoint.date) {
                    return null;
                }
                const change = ((endPoint.value - startPoint.value) / startPoint.value) * 100;
                return change;
            };

            const oneYearAgoDate = new Date(lastDate);
            oneYearAgoDate.setFullYear(lastDate.getFullYear() - 1);
            const oneYearAgoPoint = findClosestPoint(oneYearAgoDate);
            muniYoYChanges[key] = calculateChange(oneYearAgoPoint, lastPoint);
        });

        const locations = [];
        const zValues = [];
        const hoverTexts = [];

        const sanitizeName = (name) => name.replace(/\//g, "_").replace(/ /g, "_").trim().toLowerCase();

        geojson.features.forEach(feature => {
            const muniName = feature.properties['name'];
            const muniId = sanitizeName(feature.properties['name']);
            if (muniId !== undefined) {
                locations.push(muniName);
                const yoyChange = muniYoYChanges[muniId];

                if (yoyChange !== null && yoyChange !== undefined) {
                    zValues.push(yoyChange);
                    const color = yoyChange >= 0 ? 'green' : 'red';
                    const sign = yoyChange >= 0 ? '▲' : '▼';
                    hoverTexts.push(`${muniName}<br>YoY Change: <span style="color: ${color};">${sign} ${Math.abs(yoyChange).toFixed(2)}%</span>`);
                } else {
                    zValues.push(null);
                    hoverTexts.push(`${muniName}<br>YoY Change: N/A`);
                }
            } else {
                console.warn(`GeoJSON feature missing 'name' property:`, feature);
            }
        });

        const maxAbs = Math.max(...zValues.map(v => Math.abs(v) || 0));
        const choroplethTrace = {
            type: 'choroplethmap',
            geojson: geojson,
            locations: locations,
            z: zValues,
            zmin: -maxAbs,
            zmax: maxAbs,
            featureidkey: `properties.name`,
            colorscale: [
                [0, 'red'],
                [0.5, 'white'],
                [1, 'green']
            ],
            autocolorscale: false,
            reversescale: false,
            colorbar: {
                title: { text: 'YoY (%)' },
                titleside: 'right'
            },
            hoverinfo: 'text',
            hovertext: hoverTexts,
            marker: {
                line: {
                    color: 'white',
                    width: 0.8
                }
            },
            name: 'YoY Change'
        };

        // Calculate center
        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
        geojson.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates.forEach(polygon => {
                    polygon.forEach(coord => {
                        if (Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
                            minLon = Math.min(minLon, coord[0]);
                            maxLon = Math.max(maxLon, coord[0]);
                            minLat = Math.min(minLat, coord[1]);
                            maxLat = Math.max(maxLat, coord[1]);
                        }
                    });
                });
            }
        });
        
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        
        function estimateZoom(minLon, maxLon, minLat, maxLat) {
            const lonSpan = maxLon - minLon;
            const latSpan = maxLat - minLat;
            const maxSpan = Math.max(lonSpan, latSpan);

            if (maxSpan > 40) return 2;
            if (maxSpan > 20) return 3;
            if (maxSpan > 10) return 4;
            if (maxSpan > 5) return 5;
            if (maxSpan > 2) return 6;
            return 7;
        }

        const zoomLevel = estimateZoom(minLon, maxLon, minLat, maxLat);

        const layout = {
            title: {
                text: title,
                font: { size: 20 },
                xref: 'paper',
                x: 0.5
            },
            height: 600,
            autosize: true,
            map: {
                style: 'light',
                center: { lon: centerLon, lat: centerLat },
                zoom: zoomLevel
            },
            margin: { l: 0, r: 0, t: 80, b: 0 }
        };

        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            choroplethTrace.colorbar = {
                title: { text: 'YoY (%)' },
                orientation: 'h',      
                y: 1,                 
                yanchor: 'bottom',     
                x: 0.5,                
                xanchor: 'center',
                len: 0.9,             
                lenmode: 'fraction'
            };
            layout.margin.t = 120;
        }

        Plotly.newPlot(elements.mapContainer, [choroplethTrace], layout, { responsive: true });
        ui.hideMapLibreControls()
    };

    const displayMunicipality = async (countryKey, muniKey, shouldUpdateUrl = true) => {
        ui.setLoading(true);
        elements.videoContainer.style.display = 'block';
        elements.chartWrapper.style.display = 'block';
        elements.statsContainer.style.display = 'none';
        elements.mapContainer.style.display = 'none';
        elements.lightBoxContainer.style.display = 'none';

        try {
            if (shouldUpdateUrl) updateUrl(countryKey, muniKey);
            const country = appData.countries[countryKey];
            const muni = country.municipalities[muniKey];
            const title = `${muniKey.replace(/_\(.*\)|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim()}, ${country.displayName}`;

            elements.videoTitle.textContent = `Timelapse: ${title}`;
            elements.videoPlayer.src = API_BASE_URL + muni.video;
            elements.downloadCsvLink.href = API_BASE_URL + muni.csv;
            elements.downloadCsvLink.download = `${muniKey}.csv`;
            elements.downloadCsvLink.style.display = 'inline-block';
            
            const csvText = await fetchData(muni.csv);
            const data = await parseCsv(csvText);
            const allEvents = [...(country.events || []).map(e => ({...e, color: 'country'})), ...(muni.events || []).map(e => ({...e, color: 'muni'}))];
            drawChart(data, allEvents, title);
            elements.statsContainer.style.display = 'none';
        } catch (error) {
            ui.showError(error);
        }
    };

    const createJuxtaposeSlider = (containerSelector, image1, image2) => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.innerHTML = ''; // Clear existing slider, if any

        new juxtapose.JXSlider(containerSelector, [
            { src: image1.path, label: image1.date },
            { src: image2.path, label: image2.date }
        ], {
            animate: true,
            showLabels: true,
            showCredits: false,
            startingPosition: "50%",
            makeResponsive: true
        });
    };
    
    const displayCountry = async (countryKey, shouldUpdateUrl = true) => {
        ui.setLoading(true);
        elements.videoContainer.style.display = 'block';
        elements.chartWrapper.style.display = 'block';
        elements.lightBoxContainer.style.display = 'block';
        
        try {
            if (shouldUpdateUrl) updateUrl(countryKey);
            const country = appData.countries[countryKey];

            elements.videoTitle.textContent = `Timelapse: ${country.displayName}`;
            elements.videoPlayer.src = API_BASE_URL + country.video;

            const muniDataPromises = Object.entries(country.municipalities).map(async ([key, muni]) => {
                if (!muni.csv) return [key, []];
                try {
                    const text = await fetchData(muni.csv);
                    return [key, await parseCsv(text)];
                } catch { return [key, []]; }
            });
            const [geojsonData, ...muniResults] = await Promise.all([fetchData(country.map), ...muniDataPromises]);
            const allMuniData = Object.fromEntries(muniResults);
            
            const allDates = [...new Set(Object.values(allMuniData).flat().map(d => d.date))].sort();
            const aggregated = allDates.map(date => ({ date, luminosity: 0 }));
            
            Object.values(allMuniData).forEach(muniData => {
                if (muniData.length === 0) return;
                const dataMap = new Map(muniData.map(d => [d.date, d.luminosity]));
                aggregated.forEach((agg, i) => {
                    agg.luminosity += dataMap.get(agg.date) ?? (dataMap.get(aggregated[i-1]?.date) ?? 0);
                });
            });

            const allEvents = (country.events || []).map(e => ({...e, color: 'country'}));
            drawChart(aggregated, allEvents, country.displayName);
            drawMap(allMuniData, geojsonData, "Year-over-year Regional Luminosity Shift");

            createJuxtaposeSlider('#lightbox-content', country.lightbox.earliest,  country.lightbox.latest);
        } catch (error) {
            ui.showError(error);
        }
    };

    const handleLocationClick = (e) => {
        const { countryKey, muniKey } = e.target.dataset;
        if (e.target.classList.contains('country-name')) {
            e.target.classList.toggle('open');
            e.target.nextElementSibling.classList.toggle('open');
            displayCountry(countryKey);
        } else if (e.target.classList.contains('muni-item')) {
            displayMunicipality(countryKey, muniKey);
            if (window.innerWidth <= 768) ui.toggleMenu();
        }
    };
    
    const handleUrlOnLoad = () => {
        const view = new URLSearchParams(window.location.search).get('view');
        if (!view) return;
        const [countryKey, muniKey] = view.split(',');
        if (appData.countries?.[countryKey]) {
            const header = document.querySelector(`.country-name[data-country-key="${countryKey}"]`);
            if (header) {
                header.classList.add('open');
                header.nextElementSibling.classList.add('open');
            }
            if (muniKey && appData.countries[countryKey].municipalities?.[muniKey]) {
                displayMunicipality(countryKey, muniKey, false);
            } else {
                displayCountry(countryKey, false);
            }
        }
    };

    const initialize = async () => {
        elements.mainHeader.querySelector('h1').textContent = document.title;
        elements.menuToggle.addEventListener('click', ui.toggleMenu);
        elements.menuOverlay.addEventListener('click', ui.toggleMenu);
        elements.locationList.addEventListener('click', handleLocationClick);

        try {
            const [config, events] = await Promise.all([fetchData('config.json'), fetchData('events.json')]);
            for (const cKey in events) {
                if (config.countries[cKey]) {
                    config.countries[cKey].events = events[cKey].events || [];
                    for (const mKey in events[cKey].municipalities) {
                        if (config.countries[cKey].municipalities[mKey]) {
                            config.countries[cKey].municipalities[mKey].events = events[cKey].municipalities[mKey].events || [];
                        }
                    }
                }
            }
            appData = config;
            buildNavigation(appData);
            handleUrlOnLoad();
            ui.updateFooter(appData.last_run_date);
        } catch (error) {
            ui.showError(error, elements.locationList);
        }
    };

    initialize();
});