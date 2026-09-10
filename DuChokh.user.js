// ==UserScript==
// @name         DuChokh VR
// @namespace    https://github.com/Sifat743/DuChokh
// @version      0.1
// @description  Turn HTML5 web videos into side-by-side phone VR
// @author       Sifat743
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    let overlay = null;
    let video = null;
    let canvas = null;
    let ctx = null;
    let animation = null;

    let mode = "2d";
    let zoom = 1;
    let gap = 0;

    // ---------- DUCHOKH BUTTON ----------

    const launcher = document.createElement("button");

    launcher.innerHTML = "👓 DuChokh";

    Object.assign(launcher.style, {
        position: "fixed",
        right: "15px",
        bottom: "80px",
        zIndex: "2147483647",
        background: "#111",
        color: "white",
        border: "2px solid white",
        borderRadius: "25px",
        padding: "12px 17px",
        fontSize: "15px",
        fontWeight: "bold"
    });

    document.documentElement.appendChild(launcher);

    // ---------- FIND VIDEO ----------

    function findVideo() {

        const videos = Array.from(
            document.querySelectorAll("video")
        );

        if (!videos.length) return null;

        // Prefer a video that is currently playing.
        const playing = videos.find(v =>
            !v.paused &&
            !v.ended &&
            v.readyState >= 2
        );

        if (playing) return playing;

        // Otherwise use the largest video on the page.
        videos.sort((a, b) => {

            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();

            return (br.width * br.height) -
                   (ar.width * ar.height);
        });

        return videos[0];
    }

    // ---------- CONTROLS ----------

    function addButton(parent, text, action) {

        const button = document.createElement("button");

        button.textContent = text;

        Object.assign(button.style, {
            background: "#222",
            color: "white",
            border: "1px solid #777",
            borderRadius: "6px",
            padding: "8px 10px",
            fontWeight: "bold"
        });

        button.addEventListener("click", action);

        parent.appendChild(button);
    }

    // ---------- ENTER VR ----------

    function enterVR() {

        video = findVideo();

        if (!video) {

            alert(
                "DuChokh couldn't find a video.\n\n" +
                "Start the video first and then press DuChokh."
            );

            return;
        }

        launcher.style.display = "none";

        overlay = document.createElement("div");

        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            width: "100vw",
            height: "100vh",
            background: "black",
            zIndex: "2147483647",
            overflow: "hidden"
        });

        canvas = document.createElement("canvas");

        Object.assign(canvas.style, {
            width: "100%",
            height: "100%",
            display: "block",
            background: "black"
        });

        overlay.appendChild(canvas);

        // Controls

        const controls = document.createElement("div");

        Object.assign(controls.style, {
            position: "absolute",
            top: "8px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "5px",
            zIndex: "2147483647",
            background: "rgba(0,0,0,.7)",
            padding: "5px",
            borderRadius: "8px"
        });

        addButton(controls, "2D", () => {
            mode = "2d";
        });

        addButton(controls, "SBS", () => {
            mode = "sbs";
        });

        addButton(controls, "−", () => {
            zoom = Math.max(0.5, zoom - 0.1);
        });

        addButton(controls, "+", () => {
            zoom = Math.min(3, zoom + 0.1);
        });

        addButton(controls, "Gap−", () => {
            gap -= 5;
        });

        addButton(controls, "Gap+", () => {
            gap += 5;
        });

        addButton(controls, "EXIT", exitVR);

        overlay.appendChild(controls);

        document.documentElement.appendChild(overlay);

        ctx = canvas.getContext("2d");

        resizeCanvas();

        window.addEventListener(
            "resize",
            resizeCanvas
        );

        // Try fullscreen.

        try {
            overlay.requestFullscreen();
        } catch (e) {}

        // Try landscape.

        try {

            screen.orientation
                .lock("landscape")
                .catch(() => {});

        } catch (e) {}

        render();
    }

    // ---------- CANVAS ----------

    function resizeCanvas() {

        if (!canvas) return;

        const ratio =
            window.devicePixelRatio || 1;

        canvas.width =
            window.innerWidth * ratio;

        canvas.height =
            window.innerHeight * ratio;
    }

    // ---------- DRAW ONE EYE ----------

    function drawEye(x, y, w, h, eye) {

        if (
            !video ||
            video.readyState < 2 ||
            !video.videoWidth
        ) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        let sx = 0;
        let sy = 0;

        let sw = vw;
        let sh = vh;

        // If original video is SBS,
        // divide source between eyes.

        if (mode === "sbs") {

            sw = vw / 2;

            sx =
                eye === 0
                    ? 0
                    : vw / 2;
        }

        const sourceAspect =
            sw / sh;

        const targetAspect =
            w / h;

        let rw;
        let rh;

        if (sourceAspect > targetAspect) {

            rw = w * zoom;
            rh = rw / sourceAspect;

        } else {

            rh = h * zoom;
            rw = rh * sourceAspect;
        }

        const px =
            x +
            (w - rw) / 2 +
            (eye === 0 ? -gap : gap);

        const py =
            y +
            (h - rh) / 2;

        try {

            ctx.drawImage(
                video,
                sx,
                sy,
                sw,
                sh,
                px,
                py,
                rw,
                rh
            );

        } catch (e) {}
    }

    // ---------- RENDER LOOP ----------

    function render() {

        if (!canvas || !ctx) return;

        ctx.fillStyle = "black";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const half =
            canvas.width / 2;

        // Left eye

        drawEye(
            0,
            0,
            half,
            canvas.height,
            0
        );

        // Right eye

        drawEye(
            half,
            0,
            half,
            canvas.height,
            1
        );

        // Centre divider

        ctx.fillStyle = "#222";

        ctx.fillRect(
            half - 1,
            0,
            2,
            canvas.height
        );

        animation =
            requestAnimationFrame(render);
    }

    // ---------- EXIT ----------

    function exitVR() {

        if (animation) {
            cancelAnimationFrame(animation);
        }

        try {
            document.exitFullscreen();
        } catch (e) {}

        window.removeEventListener(
            "resize",
            resizeCanvas
        );

        if (overlay) {
            overlay.remove();
        }

        overlay = null;
        canvas = null;
        ctx = null;

        launcher.style.display = "block";
    }

    launcher.addEventListener(
        "click",
        enterVR
    );

})();
