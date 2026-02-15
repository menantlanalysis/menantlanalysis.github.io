/* ============================================================
   stae.monthlySlider — Opacity-based image slider for monthly
   averaged satellite images.

   Supports smooth crossfade during drag (fractional slider values)
   and snap-to-month via prev/next buttons, tick clicks, and arrows.
   ============================================================ */
window.stae = window.stae || {};

stae.monthlySlider = (() => {

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const MONTH_SHORT = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    function formatMonth(monthStr) {
        const [y, m] = monthStr.split("-");
        return MONTH_NAMES[parseInt(m, 10) - 1] + " " + y;
    }

    function shortMonth(monthStr) {
        const m = parseInt(monthStr.split("-")[1], 10);
        return MONTH_SHORT[m - 1];
    }

    /**
     * Create a monthly image slider.
     *
     * @param {Object} opts
     * @param {Array<{month: string, path: string}>} opts.images
     * @param {string} opts.viewportId
     * @param {string} opts.rangeId
     * @param {string} opts.labelsId
     * @param {string} opts.labelId
     * @param {string} opts.prevId
     * @param {string} opts.nextId
     * @param {string} opts.baseUrl
     */
    function create(opts) {
        const { images, viewportId, rangeId, labelsId, labelId, prevId, nextId, baseUrl } = opts;

        if (!images || images.length === 0) return;

        const viewport = document.getElementById(viewportId);
        const range = document.getElementById(rangeId);
        const labels = document.getElementById(labelsId);
        const currentLabel = document.getElementById(labelId);
        const prevBtn = document.getElementById(prevId);
        const nextBtn = document.getElementById(nextId);

        if (!viewport || !range) return;

        // Set range bounds
        range.min = 0;
        range.max = images.length - 1;
        range.value = images.length - 1; // Start at most recent

        // Create stacked images
        const imgElements = [];
        images.forEach((img, i) => {
            const el = document.createElement("img");
            el.src = (baseUrl || "") + img.path;
            el.alt = "Satellite imagery for " + formatMonth(img.month);
            el.className = "monthly-slider__image";
            el.style.opacity = (i === images.length - 1) ? "1" : "0";
            el.draggable = false;
            viewport.appendChild(el);
            imgElements.push(el);
        });

        // Create tick labels
        if (labels) {
            images.forEach((img, i) => {
                const tick = document.createElement("span");
                tick.className = "monthly-slider__tick";
                tick.textContent = shortMonth(img.month);
                tick.addEventListener("click", () => {
                    range.value = i;
                    update(i);
                });
                labels.appendChild(tick);
            });
        }

        function update(value) {
            const idx = parseFloat(value);
            const lower = Math.floor(idx);
            const upper = Math.min(Math.ceil(idx), images.length - 1);
            const frac = idx - lower;

            imgElements.forEach((el, i) => {
                if (lower === upper) {
                    el.style.opacity = (i === lower) ? "1" : "0";
                } else if (i === lower) {
                    el.style.opacity = String(1 - frac);
                } else if (i === upper) {
                    el.style.opacity = String(frac);
                } else {
                    el.style.opacity = "0";
                }
            });

            // Update current label
            const nearest = Math.round(idx);
            if (currentLabel) {
                currentLabel.textContent = formatMonth(images[nearest].month);
            }

            // Update active tick
            if (labels) {
                labels.querySelectorAll(".monthly-slider__tick").forEach((tick, i) => {
                    tick.classList.toggle("active", i === nearest);
                });
            }
        }

        // Events
        range.addEventListener("input", () => update(range.value));

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                const current = Math.round(parseFloat(range.value));
                if (current > 0) {
                    range.value = current - 1;
                    update(current - 1);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                const current = Math.round(parseFloat(range.value));
                if (current < images.length - 1) {
                    range.value = current + 1;
                    update(current + 1);
                }
            });
        }

        // Keyboard support
        viewport.setAttribute("tabindex", "0");
        viewport.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") {
                if (prevBtn) prevBtn.click();
                e.preventDefault();
            }
            if (e.key === "ArrowRight") {
                if (nextBtn) nextBtn.click();
                e.preventDefault();
            }
        });

        // Initial render
        update(range.value);
    }

    return { create };
})();
