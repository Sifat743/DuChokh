// ==UserScript==
// @name         DuChokh VR
// @namespace    https://github.com/Sifat743/DuChokh
// @version      0.2
// @description  Turn HTML5 web videos into side-by-side phone VR without canvas copying
// @author       Sifat743
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Sifat743/DuChokh/refs/heads/main/DuChokh.user.js
// @downloadURL  https://raw.githubusercontent.com/Sifat743/DuChokh/refs/heads/main/DuChokh.user.js
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;

  const Z = '2147483647';

  let overlay = null;
  let sourceVideo = null;
  let leftVideo = null;
  let rightVideo = null;
  let stream = null;

  let mode = '2d';
  let zoom = 1;
  let gap = 0;
  let controlsHidden = false;

  const launcher = document.createElement('button');

  launcher.textContent = '👓 DuChokh';

  Object.assign(launcher.style, {
    position: 'fixed',
    right: '14px',
    bottom: '78px',
    zIndex: Z,
    padding: '11px 15px',
    border: '1px solid #777',
    borderRadius: '24px',
    background: '#111',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700'
  });

  document.documentElement.appendChild(launcher);

  function findVideo() {
    const videos = [...document.querySelectorAll('video')].filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 40 && r.height > 40;
    });

    if (!videos.length) return null;

    const playing = videos.find(v =>
      !v.paused &&
      !v.ended &&
      v.readyState >= 2
    );

    if (playing) return playing;

    return videos.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      return (br.width * br.height) -
             (ar.width * ar.height);
    })[0];
  }

  function makeMirrorVideo() {
    const v = document.createElement('video');

    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.controls = false;
    v.disablePictureInPicture = true;

    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');

    Object.assign(v.style, {
      position: 'absolute',
      maxWidth: 'none',
      maxHeight: 'none',
      pointerEvents: 'none'
    });

    return v;
  }

  function tryCaptureStream(src) {
    try {
      if (typeof src.captureStream === 'function') {
        return src.captureStream();
      }

      if (typeof src.mozCaptureStream === 'function') {
        return src.mozCaptureStream();
      }
    } catch (_) {}

    return null;
  }

  async function attachMirror(v, src) {
    if (stream) {
      try {
        v.srcObject = stream;
        await v.play().catch(() => {});
        return true;
      } catch (_) {}
    }

    const url = src.currentSrc || src.src;

    if (url) {
      try {
        v.src = url;
        v.currentTime = src.currentTime || 0;

        await v.play().catch(() => {});

        return true;
      } catch (_) {}
    }

    return false;
  }

  function makeEye(side) {
    const eye = document.createElement('div');

    eye.dataset.eye = side;

    Object.assign(eye.style, {
      position: 'absolute',
      top: '0',
      bottom: '0',
      width: '50%',
      overflow: 'hidden',
      background: '#000'
    });

    eye.style.left =
      side === 'left'
        ? '0'
        : '50%';

    return eye;
  }

  function applyLayout() {
    if (
      !overlay ||
      !leftVideo ||
      !rightVideo
    ) {
      return;
    }

    const vw =
      sourceVideo?.videoWidth || 16;

    const vh =
      sourceVideo?.videoHeight || 9;

    const aspect = vw / vh;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const eyeW = screenW / 2;
    const eyeH = screenH;

    function sizeNormal(v, side) {
      let w;
      let h;

      if (aspect > eyeW / eyeH) {
        w = eyeW * zoom;
        h = w / aspect;
      } else {
        h = eyeH * zoom;
        w = h * aspect;
      }

      v.style.width = `${w}px`;
      v.style.height = `${h}px`;

      v.style.top =
        `${(eyeH - h) / 2}px`;

      v.style.left =
        `${
          (eyeW - w) / 2 +
          (
            side === 'left'
              ? -gap
              : gap
          )
        }px`;

      v.style.objectFit = 'contain';
      v.style.transform = '';
      v.style.transformOrigin = '';
    }

    function sizeSBS(v, side) {
      const halfAspect =
        (vw / 2) / vh;

      let shownW;
      let shownH;

      if (halfAspect > eyeW / eyeH) {
        shownW = eyeW * zoom;
        shownH = shownW / halfAspect;
      } else {
        shownH = eyeH * zoom;
        shownW = shownH * halfAspect;
      }

      const fullW = shownW * 2;
      const fullH = shownH;

      v.style.width = `${fullW}px`;
      v.style.height = `${fullH}px`;

      v.style.top =
        `${(eyeH - fullH) / 2}px`;

      const centerOffset =
        (eyeW - shownW) / 2 +
        (
          side === 'left'
            ? -gap
            : gap
        );

      v.style.left =
        `${
          side === 'left'
            ? centerOffset
            : centerOffset - shownW
        }px`;

      v.style.objectFit = 'fill';
      v.style.transform = '';
      v.style.transformOrigin = '';
    }

    if (mode === 'sbs') {
      sizeSBS(leftVideo, 'left');
      sizeSBS(rightVideo, 'right');
    } else {
      sizeNormal(leftVideo, 'left');
      sizeNormal(rightVideo, 'right');
    }
  }

  function mkButton(parent, text, fn) {
    const b =
      document.createElement('button');

    b.textContent = text;

    Object.assign(b.style, {
      padding: '8px 9px',
      color: '#fff',
      background: '#222',
      border: '1px solid #777',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '700'
    });

    b.addEventListener('click', e => {
      e.stopPropagation();
      fn();
    });

    parent.appendChild(b);

    return b;
  }

  async function enterVR() {
    sourceVideo = findVideo();

    if (!sourceVideo) {
      alert(
        'DuChokh could not find a visible HTML5 video. ' +
        'Start the video first, then tap DuChokh.'
      );

      return;
    }

    stream =
      tryCaptureStream(sourceVideo);

    overlay =
      document.createElement('div');

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      background: '#000',
      zIndex: Z,
      overflow: 'hidden',
      touchAction: 'manipulation'
    });

    const leftEye =
      makeEye('left');

    const rightEye =
      makeEye('right');

    leftVideo =
      makeMirrorVideo();

    rightVideo =
      makeMirrorVideo();

    leftEye.appendChild(leftVideo);
    rightEye.appendChild(rightVideo);

    overlay.appendChild(leftEye);
    overlay.appendChild(rightEye);

    const divider =
      document.createElement('div');

    Object.assign(divider.style, {
      position: 'absolute',
      left: '50%',
      top: '0',
      bottom: '0',
      width: '2px',
      transform: 'translateX(-1px)',
      background: '#151515',
      zIndex: '5',
      pointerEvents: 'none'
    });

    overlay.appendChild(divider);

    const controls =
      document.createElement('div');

    Object.assign(controls.style, {
      position: 'absolute',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10',
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: '4px',
      padding: '5px',
      borderRadius: '8px',
      background: 'rgba(0,0,0,.68)'
    });

    mkButton(
      controls,
      '2D',
      () => {
        mode = '2d';
        applyLayout();
      }
    );

    mkButton(
      controls,
      'SBS',
      () => {
        mode = 'sbs';
        applyLayout();
      }
    );

    mkButton(
      controls,
      '−',
      () => {
        zoom =
          Math.max(
            0.5,
            zoom - 0.1
          );

        applyLayout();
      }
    );

    mkButton(
      controls,
      '+',
      () => {
        zoom =
          Math.min(
            3,
            zoom + 0.1
          );

        applyLayout();
      }
    );

    mkButton(
      controls,
      'Gap−',
      () => {
        gap =
          Math.max(
            -200,
            gap - 5
          );

        applyLayout();
      }
    );

    mkButton(
      controls,
      'Gap+',
      () => {
        gap =
          Math.min(
            200,
            gap + 5
          );

        applyLayout();
      }
    );

    mkButton(
      controls,
      'Hide',
      () => {
        controlsHidden =
          !controlsHidden;

        controls.style.opacity =
          controlsHidden
            ? '0.06'
            : '1';
      }
    );

    mkButton(
      controls,
      'EXIT',
      exitVR
    );

    overlay.appendChild(controls);

    document.documentElement.appendChild(
      overlay
    );

    launcher.style.display = 'none';

    const okL =
      await attachMirror(
        leftVideo,
        sourceVideo
      );

    const okR =
      await attachMirror(
        rightVideo,
        sourceVideo
      );

    if (!stream) {
      const sync = () => {
        if (
          !sourceVideo ||
          !leftVideo ||
          !rightVideo
        ) {
          return;
        }

        const t =
          sourceVideo.currentTime || 0;

        for (
          const v of
          [leftVideo, rightVideo]
        ) {
          if (
            Number.isFinite(t) &&
            Math.abs(
              (v.currentTime || 0) - t
            ) > 0.35
          ) {
            try {
              v.currentTime = t;
            } catch (_) {}
          }

          if (
            sourceVideo.paused &&
            !v.paused
          ) {
            v.pause();
          }

          if (
            !sourceVideo.paused &&
            v.paused
          ) {
            v.play().catch(() => {});
          }

          v.playbackRate =
            sourceVideo.playbackRate || 1;
        }
      };

      overlay._syncTimer =
        setInterval(
          sync,
          500
        );
    }

    if (!okL || !okR) {
      alert(
        'DuChokh started, but this site did not expose a reusable video stream. ' +
        'This can happen with DRM/protected or unusual embedded players.'
      );
    }

    applyLayout();

    window.addEventListener(
      'resize',
      applyLayout
    );

    try {
      await overlay.requestFullscreen?.();
    } catch (_) {}

    try {
      await screen.orientation
        ?.lock?.('landscape');
    } catch (_) {}
  }

  function exitVR() {
    if (!overlay) return;

    if (overlay._syncTimer) {
      clearInterval(
        overlay._syncTimer
      );
    }

    window.removeEventListener(
      'resize',
      applyLayout
    );

    try {
      leftVideo?.pause();
    } catch (_) {}

    try {
      rightVideo?.pause();
    } catch (_) {}

    try {
      if (leftVideo) {
        leftVideo.srcObject = null;
      }

      if (rightVideo) {
        rightVideo.srcObject = null;
      }
    } catch (_) {}

    try {
      document.exitFullscreen?.();
    } catch (_) {}

    overlay.remove();

    overlay = null;
    leftVideo = null;
    rightVideo = null;
    stream = null;
    sourceVideo = null;

    launcher.style.display = 'block';
  }

  launcher.addEventListener(
    'click',
    enterVR
  );
})();
