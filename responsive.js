"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Responsive Foundation

Purpose:
Provides one stable runtime description of the current viewport, pointer
capabilities, orientation, dynamic visual viewport and software-keyboard
state. Presentation modules can consume HTML data attributes and CSS
custom properties without duplicating media-query decisions in JavaScript.

Table of Contents:
1. Responsive Constants
2. Responsive Runtime State
3. Viewport Measurement
4. DOM Synchronization
5. Event Scheduling
6. Initialization

Owns:
- responsive breakpoint classification
- dynamic viewport CSS variables
- orientation and pointer capability attributes
- software-keyboard visibility estimate
- responsive viewport change events

Does NOT own:
- mobile header layout
- touch marker interaction
- panel-specific responsive rendering
- workflow transitions
- application data

Dependencies:
- none
==========================================================
*/


/*
────────────────────────────────────────────
1. Responsive Constants
────────────────────────────────────────────
*/

const RESPONSIVE_BREAKPOINTS = Object.freeze({
  mobile: 620,
  tablet: 900,
  laptop: 1280
});

const RESPONSIVE_KEYBOARD_THRESHOLD = 140;


/*
────────────────────────────────────────────
2. Responsive Runtime State
────────────────────────────────────────────
*/

let responsiveFoundationInitialized = false;
let responsiveFrameRequest = null;
let responsiveState = null;
let responsiveStableWorkspaceHeight = 0;


/*
────────────────────────────────────────────
3. Viewport Measurement
────────────────────────────────────────────
*/

function getResponsiveViewportSource() {
  return window.visualViewport || null;
}

function getResponsiveViewportClass(width) {
  if (width <= RESPONSIVE_BREAKPOINTS.mobile) return "mobile";
  if (width <= RESPONSIVE_BREAKPOINTS.tablet) return "tablet";
  if (width <= RESPONSIVE_BREAKPOINTS.laptop) return "laptop";
  return "desktop";
}

function getResponsivePointerMode() {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
  const fine = window.matchMedia?.("(pointer: fine)")?.matches === true;
  const anyCoarse = window.matchMedia?.("(any-pointer: coarse)")?.matches === true;
  const anyFine = window.matchMedia?.("(any-pointer: fine)")?.matches === true;

  if ((coarse || anyCoarse) && (fine || anyFine)) return "hybrid";
  if (coarse || anyCoarse) return "coarse";
  return "fine";
}

function isResponsiveEditableTarget(target = document.activeElement) {
  return Boolean(
    target &&
    (
      target.matches?.("input, textarea, select") ||
      target.closest?.("[contenteditable='true']")
    )
  );
}

function measureResponsiveState() {
  const viewport = getResponsiveViewportSource();

  const layoutWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const layoutHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

  const viewportScale = Number(viewport?.scale || 1);
  const useVisualGeometry = Boolean(viewport && viewportScale <= 1.01);

  /*
    Pinch zoom changes VisualViewport dimensions. Those changes must not
    resize the application shell, so visual geometry is used only at the
    normal page scale. Browser chrome and software-keyboard changes still
    arrive through VisualViewport while scale remains 1.
  */
  const visualWidth = Math.max(
    1,
    useVisualGeometry ? viewport.width : layoutWidth
  );
  const visualHeight = Math.max(
    1,
    useVisualGeometry ? viewport.height : layoutHeight
  );
  const offsetTop = Math.max(
    0,
    useVisualGeometry ? viewport.offsetTop || 0 : 0
  );
  const offsetLeft = Math.max(
    0,
    useVisualGeometry ? viewport.offsetLeft || 0 : 0
  );

  const keyboardInset = Math.max(0, layoutHeight - visualHeight - offsetTop);
  const keyboardVisible =
    keyboardInset >= RESPONSIVE_KEYBOARD_THRESHOLD &&
    isResponsiveEditableTarget();

  const pointer = getResponsivePointerMode();
  const viewportClass = getResponsiveViewportClass(visualWidth);
  const orientation = visualWidth >= visualHeight ? "landscape" : "portrait";
  const touchAvailable = navigator.maxTouchPoints > 0 || pointer !== "fine";

  return {
    viewportClass,
    orientation,
    pointer,
    touchAvailable,
    keyboardVisible,
    keyboardInset: Math.round(keyboardInset),
    width: Math.round(visualWidth),
    height: Math.round(visualHeight),
    layoutWidth: Math.round(layoutWidth),
    layoutHeight: Math.round(layoutHeight),
    offsetTop: Math.round(offsetTop),
    offsetLeft: Math.round(offsetLeft),
    viewportScale,
    devicePixelRatio: Number(window.devicePixelRatio || 1)
  };
}


/*
────────────────────────────────────────────
4. DOM Synchronization
────────────────────────────────────────────
*/

function responsiveStateChanged(previous, next) {
  if (!previous) return true;

  return (
    previous.viewportClass !== next.viewportClass ||
    previous.orientation !== next.orientation ||
    previous.pointer !== next.pointer ||
    previous.touchAvailable !== next.touchAvailable ||
    previous.keyboardVisible !== next.keyboardVisible ||
    previous.keyboardInset !== next.keyboardInset ||
    previous.width !== next.width ||
    previous.height !== next.height ||
    previous.offsetTop !== next.offsetTop ||
    previous.offsetLeft !== next.offsetLeft ||
    previous.viewportScale !== next.viewportScale
  );
}

function syncResponsiveDomState(nextState) {
  const root = document.documentElement;

  root.dataset.viewportSize = nextState.viewportClass;
  root.dataset.orientation = nextState.orientation;
  root.dataset.pointer = nextState.pointer;
  root.dataset.touch = nextState.touchAvailable ? "true" : "false";
  root.dataset.keyboard = nextState.keyboardVisible ? "visible" : "hidden";

  if (!nextState.keyboardVisible) {
    responsiveStableWorkspaceHeight = Math.max(
      nextState.height,
      nextState.layoutHeight
    );
  }

  const workspaceHeight = nextState.keyboardVisible
    ? Math.max(
        responsiveStableWorkspaceHeight || nextState.layoutHeight,
        nextState.layoutHeight
      )
    : nextState.height;

  root.style.setProperty("--app-viewport-width", `${nextState.width}px`);
  root.style.setProperty("--app-visual-viewport-height", `${nextState.height}px`);
  root.style.setProperty("--app-viewport-height", `${workspaceHeight}px`);
  root.style.setProperty("--app-layout-viewport-width", `${nextState.layoutWidth}px`);
  root.style.setProperty("--app-layout-viewport-height", `${nextState.layoutHeight}px`);
  root.style.setProperty("--app-viewport-offset-top", `${nextState.offsetTop}px`);
  root.style.setProperty("--app-viewport-offset-left", `${nextState.offsetLeft}px`);
  root.style.setProperty("--app-keyboard-inset", `${nextState.keyboardInset}px`);
  root.style.setProperty("--app-viewport-scale", String(nextState.viewportScale));
  root.style.setProperty("--app-device-pixel-ratio", String(nextState.devicePixelRatio));
}

function commitResponsiveState() {
  const nextState = measureResponsiveState();
  const changed = responsiveStateChanged(responsiveState, nextState);

  responsiveState = nextState;
  syncResponsiveDomState(nextState);

  if (changed) {
    window.dispatchEvent(new CustomEvent("spot-sketch:viewport-change", {
      detail: { ...nextState }
    }));
  }
}


/*
────────────────────────────────────────────
5. Event Scheduling
────────────────────────────────────────────
*/

function scheduleResponsiveStateSync() {
  if (responsiveFrameRequest !== null) return;

  responsiveFrameRequest = window.requestAnimationFrame(() => {
    responsiveFrameRequest = null;
    commitResponsiveState();
  });
}

function bindResponsiveMediaQuery(query) {
  const media = window.matchMedia?.(query);
  if (!media) return;

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", scheduleResponsiveStateSync);
  } else if (typeof media.addListener === "function") {
    media.addListener(scheduleResponsiveStateSync);
  }
}


/*
────────────────────────────────────────────
6. Initialization
────────────────────────────────────────────
*/

function initializeResponsiveFoundation() {
  if (responsiveFoundationInitialized) return;
  responsiveFoundationInitialized = true;

  commitResponsiveState();

  window.addEventListener("resize", scheduleResponsiveStateSync, { passive: true });
  window.addEventListener("orientationchange", scheduleResponsiveStateSync, { passive: true });
  window.addEventListener("focusin", scheduleResponsiveStateSync, { passive: true });
  window.addEventListener("focusout", scheduleResponsiveStateSync, { passive: true });

  const viewport = getResponsiveViewportSource();
  viewport?.addEventListener("resize", scheduleResponsiveStateSync, { passive: true });
  viewport?.addEventListener("scroll", scheduleResponsiveStateSync, { passive: true });

  bindResponsiveMediaQuery("(pointer: coarse)");
  bindResponsiveMediaQuery("(pointer: fine)");
  bindResponsiveMediaQuery("(any-pointer: coarse)");
  bindResponsiveMediaQuery("(any-pointer: fine)");
}
