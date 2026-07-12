"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Recording Touch Workflow

Purpose:
Adds touch-safe Recording interaction without duplicating the desktop
Recording workflow. It recognizes deliberate taps, rejects scroll/pinch
and drag gestures, enlarges marker hit areas in CSS pixels, and provides
long-press access to the existing Spot Reading menu.

Owns:
- touch pointer gesture classification on the image canvas
- synthetic click suppression after handled touch gestures
- long-press marker menu access
- accidental Spot Reading prevention during movement / multi-touch
- touch interaction state exposed to presentation CSS

Does NOT own:
- marker data creation
- marker menu contents
- picker rendering or value application
- Calculation interaction
- project persistence

Dependencies:
- responsive.js
- data.js
- image.js
- markers.js
- recording-workflow.js
- recording-pickers.js
==========================================================
*/

const RECORDING_TOUCH_CONFIG = Object.freeze({
  tapMovementTolerance: 12,
  tapMaximumDuration: 520,
  longPressDelay: 560,
  longPressMovementTolerance: 9,
  syntheticClickSuppression: 760
});

let recordingTouchWorkflowInitialized = false;
let recordingTouchGesture = null;
let recordingTouchLongPressTimer = null;
let recordingTouchActivePointers = new Set();
let recordingTouchSuppressClickUntil = 0;
let recordingTouchLastPointerTime = 0;


function isRecordingTouchPointer(event) {
  return Boolean(
    event &&
    (event.pointerType === "touch" || event.pointerType === "pen")
  );
}


function isRecordingTouchEnvironment() {
  return Boolean(
    document.documentElement.dataset.touch === "true" ||
    document.documentElement.dataset.pointer === "coarse" ||
    document.documentElement.dataset.pointer === "hybrid"
  );
}


function clearRecordingTouchLongPress() {
  if (recordingTouchLongPressTimer !== null) {
    window.clearTimeout(recordingTouchLongPressTimer);
    recordingTouchLongPressTimer = null;
  }
}


function clearRecordingTouchGesture() {
  clearRecordingTouchLongPress();
  recordingTouchGesture = null;
  document.body.classList.remove("recording-touch-press");
}


function suppressNextRecordingCanvasClick(
  duration = RECORDING_TOUCH_CONFIG.syntheticClickSuppression
) {
  recordingTouchSuppressClickUntil = Math.max(
    recordingTouchSuppressClickUntil,
    performance.now() + duration
  );
}


/*
  Called by recording-workflow.js before normal click processing. Pointer
  browsers emit a synthetic click after pointerup; that click must not close
  the picker or repeat the already handled touch action.
*/
function consumeRecordingTouchClickSuppression(event) {
  if (performance.now() > recordingTouchSuppressClickUntil) {
    return false;
  }

  if (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  recordingTouchSuppressClickUntil = 0;
  return true;
}


function cancelRecordingTouchGesture(options = {}) {
  if (recordingTouchGesture) {
    recordingTouchGesture.cancelled = true;
  }

  clearRecordingTouchLongPress();
  document.body.classList.remove("recording-touch-press");

  if (options.suppressClick) {
    suppressNextRecordingCanvasClick();
  }
}


function getRecordingTouchDistance(event, gesture = recordingTouchGesture) {
  if (!gesture) return Infinity;

  return Math.hypot(
    event.clientX - gesture.startClientX,
    event.clientY - gesture.startClientY
  );
}


function openRecordingMarkerMenuFromTouch(marker, event) {
  if (!marker) return;

  state.selectedId = marker.id;

  showMarkerMenu(
    {
      clientX: event.clientX,
      clientY: event.clientY,
      stopPropagation() {},
      preventDefault() {}
    },
    marker.id
  );

  render();
  suppressNextRecordingCanvasClick();

  if (navigator.vibrate) {
    navigator.vibrate(8);
  }
}


function scheduleRecordingTouchLongPress(event, marker) {
  clearRecordingTouchLongPress();
  if (!marker || state.moveMarkerId) return;

  recordingTouchLongPressTimer = window.setTimeout(() => {
    const gesture = recordingTouchGesture;

    if (
      !gesture ||
      gesture.cancelled ||
      gesture.moved ||
      gesture.pointerId !== event.pointerId ||
      recordingTouchActivePointers.size !== 1
    ) {
      return;
    }

    gesture.longPressed = true;
    document.body.classList.remove("recording-touch-press");
    openRecordingMarkerMenuFromTouch(marker, event);
  }, RECORDING_TOUCH_CONFIG.longPressDelay);
}


function handleRecordingTouchPointerDown(event) {
  if (!isRecordingTouchPointer(event)) return;
  if (!isRecordingTouchEnvironment()) return;
  if (!isRecordingPhaseActive()) return;

  recordingTouchLastPointerTime = performance.now();
  recordingTouchActivePointers.add(event.pointerId);

  if (!event.isPrimary || recordingTouchActivePointers.size > 1) {
    cancelRecordingTouchGesture({ suppressClick: true });
    return;
  }

  const point = getCanvasPoint(event);
  if (!point) return;

  const marker = typeof getMarkerAtPoint === "function"
    ? getMarkerAtPoint(point, { inputMode: "touch" })
    : getCollapsedMarkerAtPoint(point);

  recordingTouchGesture = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startTime: performance.now(),
    startPoint: point,
    markerId: marker?.id || null,
    moved: false,
    cancelled: false,
    longPressed: false
  };

  document.body.classList.add("recording-touch-press");
  scheduleRecordingTouchLongPress(event, marker);
}


function handleRecordingTouchPointerMove(event) {
  const gesture = recordingTouchGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;

  const distance = getRecordingTouchDistance(event, gesture);

  if (distance > RECORDING_TOUCH_CONFIG.longPressMovementTolerance) {
    clearRecordingTouchLongPress();
    document.body.classList.remove("recording-touch-press");
  }

  if (distance > RECORDING_TOUCH_CONFIG.tapMovementTolerance) {
    gesture.moved = true;
  }
}


function handleRecordingTouchPointerUp(event) {
  if (!isRecordingTouchPointer(event)) return;

  recordingTouchActivePointers.delete(event.pointerId);

  const gesture = recordingTouchGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }

  clearRecordingTouchLongPress();
  document.body.classList.remove("recording-touch-press");

  const elapsed = performance.now() - gesture.startTime;
  const distance = getRecordingTouchDistance(event, gesture);

  const deliberateTap = Boolean(
    !gesture.cancelled &&
    !gesture.longPressed &&
    !gesture.moved &&
    recordingTouchActivePointers.size === 0 &&
    distance <= RECORDING_TOUCH_CONFIG.tapMovementTolerance &&
    elapsed <= RECORDING_TOUCH_CONFIG.tapMaximumDuration
  );

  recordingTouchGesture = null;

  if (!deliberateTap) {
    if (gesture.longPressed || gesture.cancelled || distance > 0) {
      suppressNextRecordingCanvasClick();
    }
    return;
  }

  const point = getCanvasPoint(event);
  if (!point) return;

  event.preventDefault();
  event.stopPropagation();
  suppressNextRecordingCanvasClick();

  handleRecordingCanvasPoint(event, point, {
    inputMode: "touch"
  });
}


function handleRecordingTouchPointerCancel(event) {
  recordingTouchActivePointers.delete(event.pointerId);
  cancelRecordingTouchGesture({ suppressClick: true });
  clearRecordingTouchGesture();
}


function handleRecordingTouchContextMenu(event) {
  const causedByTouch = Boolean(
    event.sourceCapabilities?.firesTouchEvents ||
    performance.now() - recordingTouchLastPointerTime < 1200
  );

  if (!isRecordingTouchEnvironment() || !causedByTouch) return;

  /*
    Long-press is owned by the Spot Sketch marker interaction. Prevent only
    touch-generated context menus; mouse right-click remains available on
    hybrid devices.
  */
  event.preventDefault();
}


function initializeRecordingTouchWorkflow() {
  if (recordingTouchWorkflowInitialized || !canvas) return;
  recordingTouchWorkflowInitialized = true;

  canvas.addEventListener(
    "pointerdown",
    handleRecordingTouchPointerDown,
    { passive: true }
  );

  canvas.addEventListener(
    "pointermove",
    handleRecordingTouchPointerMove,
    { passive: true }
  );

  canvas.addEventListener(
    "pointerup",
    handleRecordingTouchPointerUp,
    { passive: false }
  );

  canvas.addEventListener(
    "pointercancel",
    handleRecordingTouchPointerCancel,
    { passive: true }
  );

  canvas.addEventListener(
    "contextmenu",
    handleRecordingTouchContextMenu
  );

  /*
    Synthetic touch clicks are captured before the generic transient-surface
    guard. Otherwise that guard would close the picker before the canvas click
    handler gets a chance to consume the duplicate event.
  */
  document.addEventListener("click", event => {
    if (event.target === canvas) {
      consumeRecordingTouchClickSuppression(event);
    }
  }, true);

  window.addEventListener("blur", () => {
    recordingTouchActivePointers.clear();
    clearRecordingTouchGesture();
  });
}
