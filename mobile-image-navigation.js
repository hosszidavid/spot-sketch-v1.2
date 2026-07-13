"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Mobile Image Navigation

Purpose:
Provides application-owned pinch zoom and pan for the image, canvas markers,
and Spot Reading bubbles as one synchronized visual surface.

Owns:
- transient mobile zoom scale and translation
- two-finger pinch zoom
- one-finger pan while zoomed
- transform clamping and reset control
- protection against browser page zoom during image gestures

Does NOT own:
- source image pixels
- marker coordinates
- project persistence
- crop decisions
- Recording or Calculation workflow state

Dependencies:
- responsive.js
- mobile-shell.js
- dom.js
- recording-touch.js (optional cancellation hook)
==========================================================
*/

const MOBILE_IMAGE_NAVIGATION = Object.freeze({
  minScale: 1,
  maxScale: 4,
  panThreshold: 7
});

let mobileImageNavigationInitialized = false;
let mobileImageScale = 1;
let mobileImageTranslateX = 0;
let mobileImageTranslateY = 0;
let mobileImagePointers = new Map();
let mobileImagePinch = null;
let mobileImagePan = null;
let mobileImageGestureActive = false;
let mobileImageApplyFrame = null;

function isMobileImageNavigationAvailable() {
  return Boolean(
    state.imageCanvas &&
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive()
  );
}


function getMobileImageViewport() {
  return document.getElementById("imageViewport");
}

function getMobileImageResetButton() {
  return document.getElementById("mobileImageResetBtn");
}

function getMobileImageBaseGeometry() {
  const viewport = getMobileImageViewport();
  if (!viewport || !imageWrap) return null;

  const width = imageWrap.offsetWidth;
  const height = imageWrap.offsetHeight;
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;

  if (!width || !height || !viewportWidth || !viewportHeight) return null;

  return {
    width,
    height,
    viewportWidth,
    viewportHeight,
    left: imageWrap.offsetLeft,
    top: imageWrap.offsetTop,
    centerX: imageWrap.offsetLeft + width / 2,
    centerY: imageWrap.offsetTop + height / 2
  };
}

function clampMobileImageTransform() {
  const geometry = getMobileImageBaseGeometry();
  if (!geometry) return;

  mobileImageScale = Math.min(
    MOBILE_IMAGE_NAVIGATION.maxScale,
    Math.max(MOBILE_IMAGE_NAVIGATION.minScale, mobileImageScale)
  );

  if (mobileImageScale <= 1.001) {
    mobileImageScale = 1;
    mobileImageTranslateX = 0;
    mobileImageTranslateY = 0;
    return;
  }

  const halfGrowthX = (mobileImageScale - 1) * geometry.width / 2;
  const halfGrowthY = (mobileImageScale - 1) * geometry.height / 2;

  const transformedWidth = geometry.width * mobileImageScale;
  const transformedHeight = geometry.height * mobileImageScale;

  if (transformedWidth <= geometry.viewportWidth) {
    mobileImageTranslateX = 0;
  } else {
    const minX =
      geometry.viewportWidth - geometry.left - geometry.width - halfGrowthX;
    const maxX = -geometry.left + halfGrowthX;
    mobileImageTranslateX = Math.min(maxX, Math.max(minX, mobileImageTranslateX));
  }

  if (transformedHeight <= geometry.viewportHeight) {
    mobileImageTranslateY = 0;
  } else {
    const minY =
      geometry.viewportHeight - geometry.top - geometry.height - halfGrowthY;
    const maxY = -geometry.top + halfGrowthY;
    mobileImageTranslateY = Math.min(maxY, Math.max(minY, mobileImageTranslateY));
  }
}

function applyMobileImageTransformImmediately() {
  mobileImageApplyFrame = null;

  const resetButton = getMobileImageResetButton();
  const active = isMobileImageNavigationAvailable();

  document.body.classList.toggle(
    "mobile-image-navigation-ready",
    active
  );

  if (!active) {
    imageWrap?.style.removeProperty("transform");
    imageWrap?.style.removeProperty("transform-origin");
    document.body.classList.remove("mobile-image-zoomed", "mobile-image-panning");
    if (resetButton) resetButton.hidden = true;
    return;
  }

  clampMobileImageTransform();

  imageWrap.style.transformOrigin = "50% 50%";
  imageWrap.style.transform =
    `translate3d(${mobileImageTranslateX}px, ${mobileImageTranslateY}px, 0) ` +
    `scale(${mobileImageScale})`;

  const zoomed = mobileImageScale > 1.001;
  document.body.classList.toggle("mobile-image-zoomed", zoomed);
  if (resetButton) resetButton.hidden = !zoomed;
}

function scheduleMobileImageTransform() {
  if (mobileImageApplyFrame !== null) return;
  mobileImageApplyFrame = window.requestAnimationFrame(
    applyMobileImageTransformImmediately
  );
}

function resetMobileImageNavigation(options = {}) {
  mobileImageScale = 1;
  mobileImageTranslateX = 0;
  mobileImageTranslateY = 0;
  mobileImagePointers.clear();
  mobileImagePinch = null;
  mobileImagePan = null;
  mobileImageGestureActive = false;
  document.body.classList.remove("mobile-image-panning");

  if (options.immediate) {
    applyMobileImageTransformImmediately();
  } else {
    scheduleMobileImageTransform();
  }
}

function syncMobileImageNavigationBaseLayout(options = {}) {
  if (!isMobileImageNavigationAvailable()) {
    resetMobileImageNavigation({ immediate: true });
    return;
  }

  if (options.reset === true) {
    resetMobileImageNavigation({ immediate: true });
    return;
  }

  clampMobileImageTransform();
  scheduleMobileImageTransform();
}

function getMobileImagePointerPair() {
  const points = [...mobileImagePointers.values()];
  return points.length >= 2 ? [points[0], points[1]] : null;
}

function getPointerDistance(pair) {
  return Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
}

function getPointerCenter(pair) {
  return {
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2
  };
}

function cancelRecordingForImageNavigation() {
  if (typeof cancelRecordingTouchGesture === "function") {
    cancelRecordingTouchGesture({ suppressClick: true });
  }
}

function beginMobileImagePinch() {
  const pair = getMobileImagePointerPair();
  const viewport = getMobileImageViewport();
  const geometry = getMobileImageBaseGeometry();
  if (!pair || !viewport || !geometry) return;

  const viewportRect = viewport.getBoundingClientRect();
  const centerClient = getPointerCenter(pair);
  const center = {
    x: centerClient.x - viewportRect.left,
    y: centerClient.y - viewportRect.top
  };

  mobileImagePinch = {
    startDistance: Math.max(1, getPointerDistance(pair)),
    startScale: mobileImageScale,
    anchorX:
      (center.x - geometry.centerX - mobileImageTranslateX) / mobileImageScale,
    anchorY:
      (center.y - geometry.centerY - mobileImageTranslateY) / mobileImageScale
  };

  mobileImagePan = null;
  mobileImageGestureActive = true;
  cancelRecordingForImageNavigation();
  document.body.classList.add("mobile-image-panning");
}

function updateMobileImagePinch(event) {
  const pair = getMobileImagePointerPair();
  const viewport = getMobileImageViewport();
  const geometry = getMobileImageBaseGeometry();
  if (!pair || !viewport || !geometry || !mobileImagePinch) return;

  const viewportRect = viewport.getBoundingClientRect();
  const centerClient = getPointerCenter(pair);
  const center = {
    x: centerClient.x - viewportRect.left,
    y: centerClient.y - viewportRect.top
  };

  const ratio = getPointerDistance(pair) / mobileImagePinch.startDistance;
  const nextScale = Math.min(
    MOBILE_IMAGE_NAVIGATION.maxScale,
    Math.max(MOBILE_IMAGE_NAVIGATION.minScale, mobileImagePinch.startScale * ratio)
  );

  mobileImageScale = nextScale;
  mobileImageTranslateX =
    center.x - geometry.centerX - mobileImagePinch.anchorX * nextScale;
  mobileImageTranslateY =
    center.y - geometry.centerY - mobileImagePinch.anchorY * nextScale;

  clampMobileImageTransform();
  scheduleMobileImageTransform();

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function beginMobileImagePanCandidate(event) {
  if (mobileImageScale <= 1.001) return;

  mobileImagePan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTranslateX: mobileImageTranslateX,
    startTranslateY: mobileImageTranslateY,
    active: false
  };
}

function updateMobileImagePan(event) {
  if (!mobileImagePan || mobileImagePan.pointerId !== event.pointerId) return;

  const dx = event.clientX - mobileImagePan.startX;
  const dy = event.clientY - mobileImagePan.startY;

  if (!mobileImagePan.active) {
    if (Math.hypot(dx, dy) < MOBILE_IMAGE_NAVIGATION.panThreshold) return;
    mobileImagePan.active = true;
    mobileImageGestureActive = true;
    cancelRecordingForImageNavigation();
    document.body.classList.add("mobile-image-panning");
  }

  mobileImageTranslateX = mobileImagePan.startTranslateX + dx;
  mobileImageTranslateY = mobileImagePan.startTranslateY + dy;
  clampMobileImageTransform();
  scheduleMobileImageTransform();

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function handleMobileImagePointerDown(event) {
  if (!isMobileImageNavigationAvailable()) return;
  if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
  if (state.moveMarkerId) return;

  mobileImagePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch (error) {
    /* Synthetic tests and older embedded browsers may not expose an active pointer capture target. */
  }

  if (mobileImagePointers.size >= 2) {
    beginMobileImagePinch();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return;
  }

  beginMobileImagePanCandidate(event);
}

function handleMobileImagePointerMove(event) {
  if (!mobileImagePointers.has(event.pointerId)) return;

  mobileImagePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (mobileImagePinch && mobileImagePointers.size >= 2) {
    updateMobileImagePinch(event);
    return;
  }

  if (mobileImageScale > 1.001) {
    updateMobileImagePan(event);
  }
}

function finishMobileImagePointer(event, cancelled = false) {
  const wasPinching = Boolean(mobileImagePinch);
  const wasPanning = Boolean(mobileImagePan?.active);

  mobileImagePointers.delete(event.pointerId);

  if (wasPinching) {
    mobileImagePinch = null;
    mobileImagePan = null;
    mobileImageGestureActive = false;
    document.body.classList.remove("mobile-image-panning");
    clampMobileImageTransform();
    scheduleMobileImageTransform();
    suppressNextRecordingCanvasClick?.(620);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return;
  }

  if (wasPanning) {
    mobileImagePan = null;
    mobileImageGestureActive = false;
    document.body.classList.remove("mobile-image-panning");
    suppressNextRecordingCanvasClick?.(520);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return;
  }

  mobileImagePan = null;
  mobileImageGestureActive = false;

  if (cancelled) {
    document.body.classList.remove("mobile-image-panning");
  }
}

function initializeMobileImageNavigation() {
  if (mobileImageNavigationInitialized) return;
  mobileImageNavigationInitialized = true;

  const viewport = getMobileImageViewport();
  if (!viewport) return;

  viewport.addEventListener("pointerdown", handleMobileImagePointerDown, true);
  viewport.addEventListener("pointermove", handleMobileImagePointerMove, true);
  viewport.addEventListener("pointerup", event => finishMobileImagePointer(event), true);
  viewport.addEventListener("pointercancel", event => finishMobileImagePointer(event, true), true);

  getMobileImageResetButton()?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    resetMobileImageNavigation();
  });

  window.addEventListener("spot-sketch:viewport-change", () => {
    resetMobileImageNavigation({ immediate: true });
  });

  syncMobileImageNavigationBaseLayout({ reset: true });
}
