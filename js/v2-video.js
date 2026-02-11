/* ============================================================
   stae.video — Custom video player with styled controls
   ============================================================ */
window.stae = window.stae || {};

stae.video = (() => {

    /**
     * Wrap a <video> element with a custom player UI.
     * Call after the video element exists in the DOM.
     *
     * @param {string|HTMLVideoElement} target - ID or element
     * @param {Object} [opts]
     * @param {boolean} [opts.loop=true]
     */
    function create(target, opts) {
        const video = typeof target === "string"
            ? document.getElementById(target)
            : target;
        if (!video || video.dataset.staePlayer) return;
        video.dataset.staePlayer = "1";

        const o = Object.assign({ loop: true }, opts);
        video.loop = o.loop;
        video.removeAttribute("controls");

        // --- Build wrapper ---
        const wrapper = document.createElement("div");
        wrapper.className = "vp";
        video.parentNode.insertBefore(wrapper, video);
        wrapper.appendChild(video);

        // --- Big play overlay ---
        const overlay = document.createElement("button");
        overlay.className = "vp__overlay";
        overlay.setAttribute("aria-label", "Play");
        overlay.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="23" fill="rgba(0,0,0,0.55)" stroke="#fff" stroke-width="1.5"/><polygon points="19,14 19,34 36,24" fill="#fff"/></svg>`;
        wrapper.appendChild(overlay);

        // --- Control bar ---
        const bar = document.createElement("div");
        bar.className = "vp__bar";
        bar.innerHTML = `
            <button class="vp__btn vp__play" aria-label="Play">
                <svg class="vp__icon-play" viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
                <svg class="vp__icon-pause" viewBox="0 0 24 24" width="18" height="18" style="display:none"><rect x="5" y="3" width="4" height="18" fill="currentColor"/><rect x="15" y="3" width="4" height="18" fill="currentColor"/></svg>
            </button>
            <span class="vp__time">0:00</span>
            <div class="vp__track">
                <div class="vp__progress"></div>
                <input type="range" class="vp__slider" min="0" max="1000" value="0" aria-label="Seek">
            </div>
            <span class="vp__duration">0:00</span>
        `;
        wrapper.appendChild(bar);

        // --- References ---
        const playBtn = bar.querySelector(".vp__play");
        const iconPlay = bar.querySelector(".vp__icon-play");
        const iconPause = bar.querySelector(".vp__icon-pause");
        const timeEl = bar.querySelector(".vp__time");
        const durationEl = bar.querySelector(".vp__duration");
        const progress = bar.querySelector(".vp__progress");
        const slider = bar.querySelector(".vp__slider");
        let isSeeking = false;

        // --- Helpers ---
        function fmt(s) {
            if (!Number.isFinite(s)) return "0:00";
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec.toString().padStart(2, "0")}`;
        }

        function syncPlayIcon() {
            const paused = video.paused;
            iconPlay.style.display = paused ? "" : "none";
            iconPause.style.display = paused ? "none" : "";
            overlay.style.opacity = paused ? "1" : "0";
            overlay.style.pointerEvents = paused ? "auto" : "none";
        }

        // --- Events ---
        function togglePlay() {
            if (video.paused) video.play(); else video.pause();
        }

        overlay.addEventListener("click", togglePlay);
        playBtn.addEventListener("click", togglePlay);
        video.addEventListener("click", togglePlay);

        video.addEventListener("play", syncPlayIcon);
        video.addEventListener("pause", syncPlayIcon);

        video.addEventListener("loadedmetadata", () => {
            durationEl.textContent = fmt(video.duration);
        });

        video.addEventListener("timeupdate", () => {
            if (isSeeking) return;
            const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
            progress.style.width = pct + "%";
            slider.value = Math.round(pct * 10);
            timeEl.textContent = fmt(video.currentTime);
        });

        slider.addEventListener("input", () => {
            isSeeking = true;
            const pct = slider.value / 1000;
            progress.style.width = (pct * 100) + "%";
            if (video.duration) {
                video.currentTime = pct * video.duration;
                timeEl.textContent = fmt(video.currentTime);
            }
        });
        slider.addEventListener("change", () => { isSeeking = false; });

        // Init state
        syncPlayIcon();

        return wrapper;
    }

    return { create };
})();
