// ==UserScript==
// @name         DuChokh VR
// @namespace    https://github.com/Sifat743/DuChokh
// @version      0.5
// @description  Phone VR viewer optimized for Shinecon/Cardboard headsets
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
const STORAGE_KEY = 'duchokh-v05';

let overlay = null;
let sourceVideo = null;
let leftVideo = null;
let rightVideo = null;
let stream = null;

let controls = null;
let controlTimer = null;
let syncTimer = null;
let uiTimer = null;

let mode = '3d';

let settings = {
  zoom: 0.90,

  // Headset alignment
  eyeGap: 0,
  horizontal: 0,
  vertical: 0,

  // Pseudo 3D
  depth: 5,
  convergence: 0,
  popout: 0,
  perspective: 1,

  // Safe optical compensation
  lensStrength: 3,
  lensScale: 1.04,

  // UI
  hideDelay: 5000
};


// ======================================================
// SETTINGS
// ======================================================

try {
  const saved =
    JSON.parse(
      localStorage.getItem(
        STORAGE_KEY
      )
    );

  if (saved) {
    settings = {
      ...settings,
      ...saved
    };
  }
} catch (_) {}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (_) {}
}


// ======================================================
// LAUNCHER
// ======================================================

const launcher =
  document.createElement('button');

launcher.textContent =
  '👓 DuChokh';

Object.assign(
  launcher.style,
  {
    position: 'fixed',
    right: '14px',
    bottom: '78px',
    zIndex: Z,

    padding: '11px 15px',

    background: '#111',
    color: '#fff',

    border:
      '1px solid #777',

    borderRadius:
      '24px',

    fontSize: '14px',
    fontWeight: '700'
  }
);

document.documentElement
  .appendChild(
    launcher
  );


// ======================================================
// VIDEO DETECTION
// ======================================================

function findVideo() {

  const videos =
    [...document.querySelectorAll(
      'video'
    )]
      .filter(v => {

        const r =
          v.getBoundingClientRect();

        return (
          r.width > 40 &&
          r.height > 40
        );
      });

  if (!videos.length) {
    return null;
  }

  const playing =
    videos.find(v =>
      !v.paused &&
      !v.ended &&
      v.readyState >= 2
    );

  if (playing) {
    return playing;
  }

  videos.sort(
    (a, b) => {

      const ar =
        a.getBoundingClientRect();

      const br =
        b.getBoundingClientRect();

      return (
        br.width *
        br.height
      ) - (
        ar.width *
        ar.height
      );
    }
  );

  return videos[0];
}


// ======================================================
// MIRROR VIDEO
// ======================================================

function makeMirrorVideo() {

  const v =
    document.createElement(
      'video'
    );

  v.autoplay = true;
  v.playsInline = true;
  v.muted = true;
  v.controls = false;

  v.disablePictureInPicture =
    true;

  v.setAttribute(
    'playsinline',
    ''
  );

  v.setAttribute(
    'webkit-playsinline',
    ''
  );

  Object.assign(
    v.style,
    {
      position: 'absolute',

      maxWidth: 'none',
      maxHeight: 'none',

      pointerEvents: 'none',

      backfaceVisibility:
        'hidden'
    }
  );

  return v;
}


function getStream(video) {

  try {

    if (
      typeof video.captureStream
      === 'function'
    ) {
      return video.captureStream();
    }

    if (
      typeof video.mozCaptureStream
      === 'function'
    ) {
      return video.mozCaptureStream();
    }

  } catch (_) {}

  return null;
}


async function attachMirror(
  mirror,
  original
) {

  if (stream) {

    try {

      mirror.srcObject =
        stream;

      await mirror
        .play()
        .catch(() => {});

      return true;

    } catch (_) {}
  }

  const url =
    original.currentSrc ||
    original.src;

  if (!url) {
    return false;
  }

  try {

    mirror.src =
      url;

    if (
      Number.isFinite(
        original.currentTime
      )
    ) {

      mirror.currentTime =
        original.currentTime;
    }

    await mirror
      .play()
      .catch(() => {});

    return true;

  } catch (_) {

    return false;
  }
}


// ======================================================
// EYE CONTAINER
// ======================================================

function makeEye(side) {

  const eye =
    document.createElement(
      'div'
    );

  Object.assign(
    eye.style,
    {
      position: 'absolute',

      top: '0',
      bottom: '0',

      width: '50%',

      overflow: 'hidden',

      background: '#000'
    }
  );

  eye.style.left =
    side === 'left'
      ? '0'
      : '50%';

  return eye;
}


// ======================================================
// SHINECON PRESETS
// ======================================================

function applyShineconPreset() {

  mode = '3d';

  settings.zoom =
    0.90;

  settings.eyeGap =
    0;

  settings.horizontal =
    0;

  settings.vertical =
    0;

  settings.depth =
    5;

  settings.convergence =
    0;

  settings.popout =
    0;

  settings.perspective =
    1;

  settings.lensStrength =
    3;

  settings.lensScale =
    1.04;

  saveSettings();
  applyLayout();
}


function comfortablePreset() {

  mode = '3d';

  settings.depth =
    3;

  settings.popout =
    0;

  settings.convergence =
    0;

  settings.perspective =
    0.5;

  settings.zoom =
    0.88;

  saveSettings();
  applyLayout();
}


function stronger3DPreset() {

  mode = '3d';

  settings.depth =
    8;

  settings.perspective =
    1.5;

  settings.popout =
    1;

  saveSettings();
  applyLayout();
}


// ======================================================
// LAYOUT
// ======================================================

function applyLayout() {

  if (
    !sourceVideo ||
    !leftVideo ||
    !rightVideo
  ) {
    return;
  }

  const vw =
    sourceVideo.videoWidth ||
    16;

  const vh =
    sourceVideo.videoHeight ||
    9;

  const screenW =
    window.innerWidth;

  const screenH =
    window.innerHeight;

  const eyeW =
    screenW / 2;

  const eyeH =
    screenH;


  // --------------------------------------------------
  // LENS COMPENSATION
  // --------------------------------------------------

  function lensTransform(
    side,
    extraRotation = 0,
    safetyScale = 1
  ) {

    const dir =
      side === 'left'
        ? -1
        : 1;

    const rotate =
      dir *
      (
        settings.lensStrength +
        extraRotation
      );

    const scale =
      settings.lensScale *
      safetyScale;

    return `
      perspective(900px)
      rotateY(${rotate}deg)
      scale(${scale})
    `;
  }


  // --------------------------------------------------
  // NORMAL VIDEO DIMENSIONS
  // --------------------------------------------------

  function normalDimensions() {

    const aspect =
      vw / vh;

    let w;
    let h;

    if (
      aspect >
      eyeW / eyeH
    ) {

      w =
        eyeW *
        settings.zoom;

      h =
        w /
        aspect;

    } else {

      h =
        eyeH *
        settings.zoom;

      w =
        h *
        aspect;
    }

    return {
      w,
      h
    };
  }


  // --------------------------------------------------
  // FLAT 2D
  // --------------------------------------------------

  function layout2D(
    video,
    side
  ) {

    const {w, h} =
      normalDimensions();

    const eyeShift =
      side === 'left'
        ? -settings.eyeGap
        : settings.eyeGap;

    video.style.width =
      `${w}px`;

    video.style.height =
      `${h}px`;

    video.style.left =
      `${
        (eyeW - w) / 2 +
        eyeShift +
        settings.horizontal
      }px`;

    video.style.top =
      `${
        (eyeH - h) / 2 +
        settings.vertical
      }px`;

    video.style.objectFit =
      'contain';

    video.style.transformOrigin =
      side === 'left'
        ? 'right center'
        : 'left center';

    video.style.transform =
      lensTransform(
        side
      );
  }


  // --------------------------------------------------
  // PSEUDO 3D
  // --------------------------------------------------

  function layout3D(
    video,
    side
  ) {

    const {w, h} =
      normalDimensions();

    const dir =
      side === 'left'
        ? -1
        : 1;

    /*
      Binocular disparity.

      Each eye gets a slightly
      different horizontal view.
    */

    const disparity =
      dir *
      (
        settings.depth +
        settings.popout
      );

    const convergence =
      dir *
      settings.convergence;

    const ipd =
      dir *
      settings.eyeGap;

    const x =
      (eyeW - w) / 2 +
      settings.horizontal +
      disparity +
      convergence +
      ipd;

    const y =
      (eyeH - h) / 2 +
      settings.vertical;

    video.style.width =
      `${w}px`;

    video.style.height =
      `${h}px`;

    video.style.left =
      `${x}px`;

    video.style.top =
      `${y}px`;

    video.style.objectFit =
      'contain';

    video.style.transformOrigin =
      side === 'left'
        ? 'right center'
        : 'left center';

    /*
      Perspective adds a slight
      per-eye viewpoint difference.
    */

    const additionalPerspective =
      side === 'left'
        ? settings.perspective
        : -settings.perspective;

    const edgeProtection =
      1 +
      Math.abs(
        settings.depth
      ) / 800;

    video.style.transform =
      lensTransform(
        side,
        additionalPerspective,
        edgeProtection
      );
  }


  // --------------------------------------------------
  // SBS
  // --------------------------------------------------

  function layoutSBS(
    video,
    side
  ) {

    const halfAspect =
      (vw / 2) /
      vh;

    let shownW;
    let shownH;

    if (
      halfAspect >
      eyeW / eyeH
    ) {

      shownW =
        eyeW *
        settings.zoom;

      shownH =
        shownW /
        halfAspect;

    } else {

      shownH =
        eyeH *
        settings.zoom;

      shownW =
        shownH *
        halfAspect;
    }

    const fullW =
      shownW * 2;

    const ipd =
      side === 'left'
        ? -settings.eyeGap
        : settings.eyeGap;

    const centre =
      (
        eyeW -
        shownW
      ) / 2 +
      ipd +
      settings.horizontal;

    video.style.width =
      `${fullW}px`;

    video.style.height =
      `${shownH}px`;

    video.style.top =
      `${
        (
          eyeH -
          shownH
        ) / 2 +
        settings.vertical
      }px`;

    video.style.left =
      side === 'left'
        ? `${centre}px`
        : `${centre - shownW}px`;

    video.style.objectFit =
      'fill';

    video.style.transformOrigin =
      side === 'left'
        ? 'right center'
        : 'left center';

    video.style.transform =
      lensTransform(
        side
      );
  }


  // --------------------------------------------------
  // OVER UNDER
  // --------------------------------------------------

  function layoutOU(
    video,
    side
  ) {

    const halfAspect =
      vw /
      (vh / 2);

    let shownW;
    let shownH;

    if (
      halfAspect >
      eyeW / eyeH
    ) {

      shownW =
        eyeW *
        settings.zoom;

      shownH =
        shownW /
        halfAspect;

    } else {

      shownH =
        eyeH *
        settings.zoom;

      shownW =
        shownH *
        halfAspect;
    }

    const fullH =
      shownH * 2;

    const ipd =
      side === 'left'
        ? -settings.eyeGap
        : settings.eyeGap;

    const x =
      (
        eyeW -
        shownW
      ) / 2 +
      ipd +
      settings.horizontal;

    let y =
      (
        eyeH -
        shownH
      ) / 2 +
      settings.vertical;

    if (
      side === 'right'
    ) {
      y -= shownH;
    }

    video.style.width =
      `${shownW}px`;

    video.style.height =
      `${fullH}px`;

    video.style.left =
      `${x}px`;

    video.style.top =
      `${y}px`;

    video.style.objectFit =
      'fill';

    video.style.transformOrigin =
      side === 'left'
        ? 'right center'
        : 'left center';

    video.style.transform =
      lensTransform(
        side
      );
  }


  // --------------------------------------------------
  // APPLY MODE
  // --------------------------------------------------

  if (
    mode === 'sbs'
  ) {

    layoutSBS(
      leftVideo,
      'left'
    );

    layoutSBS(
      rightVideo,
      'right'
    );

  } else if (
    mode === 'ou'
  ) {

    layoutOU(
      leftVideo,
      'left'
    );

    layoutOU(
      rightVideo,
      'right'
    );

  } else if (
    mode === '3d'
  ) {

    layout3D(
      leftVideo,
      'left'
    );

    layout3D(
      rightVideo,
      'right'
    );

  } else {

    layout2D(
      leftVideo,
      'left'
    );

    layout2D(
      rightVideo,
      'right'
    );
  }
}


// ======================================================
// UI FUNCTIONS
// ======================================================

function button(
  parent,
  text,
  callback
) {

  const b =
    document.createElement(
      'button'
    );

  b.textContent =
    text;

  Object.assign(
    b.style,
    {
      background: '#202020',
      color: '#fff',

      border:
        '1px solid #666',

      borderRadius:
        '6px',

      padding:
        '7px 9px',

      fontSize:
        '12px',

      fontWeight:
        '600'
    }
  );

  b.onclick =
    e => {

      e.stopPropagation();

      callback();

      showControls();
    };

  parent.appendChild(
    b
  );

  return b;
}


function slider(
  parent,
  label,
  min,
  max,
  step,
  value,
  callback
) {

  const row =
    document.createElement(
      'label'
    );

  Object.assign(
    row.style,
    {
      display:
        'flex',

      alignItems:
        'center',

      gap:
        '5px',

      color:
        '#fff',

      fontSize:
        '11px'
    }
  );

  const text =
    document.createElement(
      'span'
    );

  text.textContent =
    label;

  text.style.minWidth =
    '72px';


  const range =
    document.createElement(
      'input'
    );

  range.type =
    'range';

  range.min =
    min;

  range.max =
    max;

  range.step =
    step;

  range.value =
    value;

  range.style.flex =
    '1';


  const number =
    document.createElement(
      'span'
    );

  number.textContent =
    value;

  number.style.minWidth =
    '34px';


  range.oninput =
    e => {

      e.stopPropagation();

      const value =
        Number(
          range.value
        );

      number.textContent =
        value;

      callback(
        value
      );

      showControls();
    };


  row.appendChild(
    text
  );

  row.appendChild(
    range
  );

  row.appendChild(
    number
  );

  parent.appendChild(
    row
  );

  return range;
}


// ======================================================
// AUTO HIDE
// ======================================================

function showControls() {

  if (!controls) {
    return;
  }

  controls.style.opacity =
    '1';

  controls.style.pointerEvents =
    'auto';

  clearTimeout(
    controlTimer
  );

  controlTimer =
    setTimeout(
      hideControls,
      settings.hideDelay
    );
}


function hideControls() {

  if (!controls) {
    return;
  }

  controls.style.opacity =
    '0';

  controls.style.pointerEvents =
    'none';
}


// ======================================================
// TIME
// ======================================================

function formatTime(sec) {

  if (
    !Number.isFinite(sec)
  ) {
    return '0:00';
  }

  sec =
    Math.max(
      0,
      Math.floor(sec)
    );

  const h =
    Math.floor(
      sec / 3600
    );

  const m =
    Math.floor(
      (sec % 3600) /
      60
    );

  const s =
    sec % 60;

  if (h > 0) {

    return (
      `${h}:` +
      `${String(m)
        .padStart(2,'0')}:` +
      `${String(s)
        .padStart(2,'0')}`
    );
  }

  return (
    `${m}:` +
    `${String(s)
      .padStart(2,'0')}`
  );
}


// ======================================================
// ENTER VR
// ======================================================

async function enterVR() {

  sourceVideo =
    findVideo();

  if (!sourceVideo) {

    alert(
      'Start the video first, then tap DuChokh.'
    );

    return;
  }


  stream =
    getStream(
      sourceVideo
    );


  overlay =
    document.createElement(
      'div'
    );

  Object.assign(
    overlay.style,
    {
      position:
        'fixed',

      inset:
        '0',

      width:
        '100vw',

      height:
        '100vh',

      background:
        '#000',

      zIndex:
        Z,

      overflow:
        'hidden',

      touchAction:
        'manipulation'
    }
  );


  const leftEye =
    makeEye(
      'left'
    );

  const rightEye =
    makeEye(
      'right'
    );


  leftVideo =
    makeMirrorVideo();

  rightVideo =
    makeMirrorVideo();


  leftEye.appendChild(
    leftVideo
  );

  rightEye.appendChild(
    rightVideo
  );


  overlay.appendChild(
    leftEye
  );

  overlay.appendChild(
    rightEye
  );


  // CENTRE LINE

  const divider =
    document.createElement(
      'div'
    );

  Object.assign(
    divider.style,
    {
      position:
        'absolute',

      left:
        '50%',

      top:
        '0',

      bottom:
        '0',

      width:
        '2px',

      background:
        '#111',

      transform:
        'translateX(-1px)',

      zIndex:
        '3',

      pointerEvents:
        'none'
    }
  );

  overlay.appendChild(
    divider
  );


  // ==================================================
  // CONTROLS
  // ==================================================

  controls =
    document.createElement(
      'div'
    );

  Object.assign(
    controls.style,
    {
      position:
        'absolute',

      left:
        '50%',

      bottom:
        '4px',

      transform:
        'translateX(-50%)',

      width:
        '97%',

      maxHeight:
        '92vh',

      overflowY:
        'auto',

      padding:
        '8px',

      boxSizing:
        'border-box',

      background:
        'rgba(0,0,0,.86)',

      border:
        '1px solid #555',

      borderRadius:
        '10px',

      zIndex:
        '20',

      transition:
        'opacity .25s'
    }
  );


  // ==================================================
  // PLAYBACK
  // ==================================================

  const playback =
    document.createElement(
      'div'
    );

  Object.assign(
    playback.style,
    {
      display:
        'flex',

      flexWrap:
        'wrap',

      justifyContent:
        'center',

      gap:
        '5px',

      marginBottom:
        '7px'
    }
  );


  button(
    playback,
    '▶ / ❚❚',
    () => {

      if (
        sourceVideo.paused
      ) {

        sourceVideo
          .play()
          .catch(() => {});

      } else {

        sourceVideo.pause();
      }
    }
  );


  button(
    playback,
    '−10s',
    () => {

      sourceVideo.currentTime =
        Math.max(
          0,
          sourceVideo.currentTime -
          10
        );
    }
  );


  button(
    playback,
    '+10s',
    () => {

      sourceVideo.currentTime =
        Math.min(
          sourceVideo.duration ||
          Infinity,

          sourceVideo.currentTime +
          10
        );
    }
  );


  button(
    playback,
    '🔇',
    () => {

      sourceVideo.muted =
        !sourceVideo.muted;
    }
  );


  button(
    playback,
    '0.75×',
    () => {

      sourceVideo.playbackRate =
        0.75;
    }
  );


  button(
    playback,
    '1×',
    () => {

      sourceVideo.playbackRate =
        1;
    }
  );


  button(
    playback,
    '1.25×',
    () => {

      sourceVideo.playbackRate =
        1.25;
    }
  );


  button(
    playback,
    '1.5×',
    () => {

      sourceVideo.playbackRate =
        1.5;
    }
  );


  controls.appendChild(
    playback
  );


  // ==================================================
  // MODES
  // ==================================================

  const modes =
    document.createElement(
      'div'
    );

  Object.assign(
    modes.style,
    {
      display:
        'flex',

      justifyContent:
        'center',

      flexWrap:
        'wrap',

      gap:
        '5px',

      marginBottom:
        '7px'
    }
  );


  button(
    modes,
    '2D',
    () => {

      mode =
        '2d';

      applyLayout();
    }
  );


  button(
    modes,
    '✨ 3D',
    () => {

      mode =
        '3d';

      applyLayout();
    }
  );


  button(
    modes,
    'SBS',
    () => {

      mode =
        'sbs';

      applyLayout();
    }
  );


  button(
    modes,
    'OU',
    () => {

      mode =
        'ou';

      applyLayout();
    }
  );


  controls.appendChild(
    modes
  );


  // ==================================================
  // PRESETS
  // ==================================================

  const presets =
    document.createElement(
      'div'
    );

  Object.assign(
    presets.style,
    {
      display:
        'flex',

      justifyContent:
        'center',

      flexWrap:
        'wrap',

      gap:
        '5px',

      marginBottom:
        '8px'
    }
  );


  button(
    presets,
    '🥽 SHINECON',
    applyShineconPreset
  );


  button(
    presets,
    '😌 COMFORT',
    comfortablePreset
  );


  button(
    presets,
    '🔥 STRONG 3D',
    stronger3DPreset
  );


  controls.appendChild(
    presets
  );


  // ==================================================
  // SEEK BAR
  // ==================================================

  const seekRow =
    document.createElement(
      'div'
    );

  Object.assign(
    seekRow.style,
    {
      display:
        'flex',

      alignItems:
        'center',

      gap:
        '6px',

      marginBottom:
        '8px'
    }
  );


  const timeText =
    document.createElement(
      'span'
    );

  Object.assign(
    timeText.style,
    {
      color:
        '#fff',

      minWidth:
        '95px',

      fontSize:
        '11px'
    }
  );


  const seek =
    document.createElement(
      'input'
    );

  seek.type =
    'range';

  seek.min =
    0;

  seek.max =
    1000;

  seek.value =
    0;

  seek.style.flex =
    '1';


  let seeking =
    false;


  seek.onpointerdown =
    () => {

      seeking =
        true;
    };


  seek.onpointerup =
    () => {

      seeking =
        false;
    };


  seek.oninput =
    () => {

      if (
        Number.isFinite(
          sourceVideo.duration
        )
      ) {

        sourceVideo.currentTime =
          sourceVideo.duration *
          Number(
            seek.value
          ) /
          1000;
      }
    };


  seekRow.appendChild(
    timeText
  );

  seekRow.appendChild(
    seek
  );


  controls.appendChild(
    seekRow
  );


  // ==================================================
  // HEADSET ALIGNMENT
  // ==================================================

  const calibrationTitle =
    document.createElement(
      'div'
    );

  calibrationTitle.textContent =
    '🥽 Headset calibration';

  Object.assign(
    calibrationTitle.style,
    {
      color:
        '#fff',

      fontWeight:
        '700',

      textAlign:
        'center',

      marginBottom:
        '5px'
    }
  );


  controls.appendChild(
    calibrationTitle
  );


  const calibration =
    document.createElement(
      'div'
    );

  Object.assign(
    calibration.style,
    {
      display:
        'grid',

      gridTemplateColumns:
        'repeat(2,minmax(0,1fr))',

      gap:
        '6px',

      marginBottom:
        '8px'
    }
  );


  slider(
    calibration,
    'Zoom',
    0.60,
    1.50,
    0.01,
    settings.zoom,
    v => {

      settings.zoom =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    calibration,
    'Eye/IPD',
    -100,
    100,
    1,
    settings.eyeGap,
    v => {

      settings.eyeGap =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    calibration,
    'Vertical',
    -100,
    100,
    1,
    settings.vertical,
    v => {

      settings.vertical =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    calibration,
    'Horizontal',
    -100,
    100,
    1,
    settings.horizontal,
    v => {

      settings.horizontal =
        v;

      saveSettings();
      applyLayout();
    }
  );


  controls.appendChild(
    calibration
  );


  // ==================================================
  // 3D DEPTH
  // ==================================================

  const depthTitle =
    document.createElement(
      'div'
    );

  depthTitle.textContent =
    '✨ 3D depth';

  Object.assign(
    depthTitle.style,
    {
      color:
        '#fff',

      fontWeight:
        '700',

      textAlign:
        'center',

      marginBottom:
        '5px'
    }
  );


  controls.appendChild(
    depthTitle
  );


  const depthControls =
    document.createElement(
      'div'
    );

  Object.assign(
    depthControls.style,
    {
      display:
        'grid',

      gridTemplateColumns:
        'repeat(2,minmax(0,1fr))',

      gap:
        '6px',

      marginBottom:
        '8px'
    }
  );


  slider(
    depthControls,
    'Depth',
    -25,
    25,
    1,
    settings.depth,
    v => {

      settings.depth =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    depthControls,
    'Converge',
    -20,
    20,
    1,
    settings.convergence,
    v => {

      settings.convergence =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    depthControls,
    'Pop-out',
    -15,
    15,
    1,
    settings.popout,
    v => {

      settings.popout =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    depthControls,
    'Perspective',
    0,
    5,
    0.25,
    settings.perspective,
    v => {

      settings.perspective =
        v;

      saveSettings();
      applyLayout();
    }
  );


  controls.appendChild(
    depthControls
  );


  // ==================================================
  // LENS
  // ==================================================

  const lensTitle =
    document.createElement(
      'div'
    );

  lensTitle.textContent =
    '🔎 Shinecon lens compensation';

  Object.assign(
    lensTitle.style,
    {
      color:
        '#fff',

      fontWeight:
        '700',

      textAlign:
        'center',

      marginBottom:
        '5px'
    }
  );


  controls.appendChild(
    lensTitle
  );


  const lensControls =
    document.createElement(
      'div'
    );

  Object.assign(
    lensControls.style,
    {
      display:
        'grid',

      gridTemplateColumns:
        'repeat(2,minmax(0,1fr))',

      gap:
        '6px'
    }
  );


  slider(
    lensControls,
    'Lens',
    0,
    8,
    0.25,
    settings.lensStrength,
    v => {

      settings.lensStrength =
        v;

      saveSettings();
      applyLayout();
    }
  );


  slider(
    lensControls,
    'Lens Scale',
    1,
    1.15,
    0.01,
    settings.lensScale,
    v => {

      settings.lensScale =
        v;

      saveSettings();
      applyLayout();
    }
  );


  controls.appendChild(
    lensControls
  );


  // ==================================================
  // BOTTOM BUTTONS
  // ==================================================

  const bottom =
    document.createElement(
      'div'
    );

  Object.assign(
    bottom.style,
    {
      display:
        'flex',

      justifyContent:
        'center',

      flexWrap:
        'wrap',

      gap:
        '6px',

      marginTop:
        '9px'
    }
  );


  button(
    bottom,
    'RESET',
    () => {

      settings = {
        zoom: 0.90,

        eyeGap: 0,
        horizontal: 0,
        vertical: 0,

        depth: 5,
        convergence: 0,
        popout: 0,
        perspective: 1,

        lensStrength: 3,
        lensScale: 1.04,

        hideDelay: 5000
      };

      mode =
        '3d';

      saveSettings();
      applyLayout();
    }
  );


  button(
    bottom,
    'HIDE CONTROLS',
    hideControls
  );


  button(
    bottom,
    'EXIT VR',
    exitVR
  );


  controls.appendChild(
    bottom
  );


  overlay.appendChild(
    controls
  );


  document.documentElement
    .appendChild(
      overlay
    );


  launcher.style.display =
    'none';


  // ==================================================
  // ATTACH VIDEO
  // ==================================================

  await attachMirror(
    leftVideo,
    sourceVideo
  );

  await attachMirror(
    rightVideo,
    sourceVideo
  );


  // ==================================================
  // SYNC
  // ==================================================

  if (!stream) {

    syncTimer =
      setInterval(
        () => {

          if (
            !sourceVideo ||
            !leftVideo ||
            !rightVideo
          ) {
            return;
          }

          const t =
            sourceVideo.currentTime ||
            0;


          for (
            const mirror of
            [
              leftVideo,
              rightVideo
            ]
          ) {

            if (
              Math.abs(
                (
                  mirror.currentTime ||
                  0
                ) -
                t
              ) > 0.25
            ) {

              try {

                mirror.currentTime =
                  t;

              } catch (_) {}
            }


            mirror.playbackRate =
              sourceVideo.playbackRate ||
              1;


            if (
              sourceVideo.paused
            ) {

              if (
                !mirror.paused
              ) {
                mirror.pause();
              }

            } else {

              if (
                mirror.paused
              ) {

                mirror
                  .play()
                  .catch(() => {});
              }
            }
          }

        },
        300
      );
  }


  // ==================================================
  // UI UPDATE
  // ==================================================

  uiTimer =
    setInterval(
      () => {

        if (
          !sourceVideo
        ) {
          return;
        }

        const current =
          sourceVideo.currentTime ||
          0;

        const duration =
          sourceVideo.duration ||
          0;


        timeText.textContent =
          `${formatTime(current)} / ${formatTime(duration)}`;


        if (
          !seeking &&
          Number.isFinite(
            duration
          ) &&
          duration > 0
        ) {

          seek.value =
            Math.round(
              current /
              duration *
              1000
            );
        }

      },
      250
    );


  // ==================================================
  // TOUCH BEHAVIOUR
  // ==================================================

  overlay.addEventListener(
    'click',
    e => {

      if (
        controls.contains(
          e.target
        )
      ) {
        return;
      }

      showControls();
    }
  );


  // DOUBLE TAP = PLAY / PAUSE

  let lastTap =
    0;

  overlay.addEventListener(
    'touchend',
    e => {

      if (
        controls.contains(
          e.target
        )
      ) {
        return;
      }

      const now =
        Date.now();

      if (
        now -
        lastTap <
        350
      ) {

        if (
          sourceVideo.paused
        ) {

          sourceVideo
            .play()
            .catch(() => {});

        } else {

          sourceVideo.pause();
        }
      }

      lastTap =
        now;
    }
  );


  // ==================================================
  // START
  // ==================================================

  applyLayout();


  window.addEventListener(
    'resize',
    applyLayout
  );


  try {

    await overlay
      .requestFullscreen?.();

  } catch (_) {}


  try {

    await screen.orientation
      ?.lock?.(
        'landscape'
      );

  } catch (_) {}


  showControls();
}


// ======================================================
// EXIT
// ======================================================

function exitVR() {

  clearTimeout(
    controlTimer
  );

  clearInterval(
    syncTimer
  );

  clearInterval(
    uiTimer
  );


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
      leftVideo.srcObject =
        null;
    }

    if (rightVideo) {
      rightVideo.srcObject =
        null;
    }

  } catch (_) {}


  try {

    document
      .exitFullscreen?.();

  } catch (_) {}


  overlay?.remove();


  overlay =
    null;

  controls =
    null;

  leftVideo =
    null;

  rightVideo =
    null;

  stream =
    null;

  sourceVideo =
    null;


  launcher.style.display =
    'block';
}


// ======================================================
// GO
// ======================================================

launcher.addEventListener(
  'click',
  enterVR
);

})();
