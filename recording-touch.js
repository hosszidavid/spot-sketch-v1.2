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
let recordingTouchMovePreview = null;
let recordingTouchPickerGuardActive = false;



const scheduleRecordingTouchMovePreview = createFrameScheduler(() => {
  const preview = recordingTouchMovePreview;
  recordingTouchMovePreview = null;
  if (!preview) return;
  moveMarker(preview.markerId, preview.point);
  render();
});

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


function armRecordingTouchPickerGuard() {
  recordingTouchPickerGuardActive = true;
}

function releaseRecordingTouchPickerGuard() {
  recordingTouchPickerGuardActive = false;
}

function acceptNewRecordingPickerPointer(event) {
  if (!recordingTouchPickerGuardActive) return;
  if (!isRecordingTouchPointer(event)) return;
  if (!event.target.closest?.("#picker")) return;

  /* A pointerdown inside the already-open picker is necessarily a new
     interaction sequence. It may select an option normally. */
  recordingTouchPickerGuardActive = false;
  recordingTouchSuppressClickUntil = 0;
}

function consumeOpeningRecordingPickerClick(event) {
  if (!recordingTouchPickerGuardActive) return false;
  if (!event?.target?.closest?.("#picker")) return false;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  releaseRecordingTouchPickerGuard();
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


function getRecordingPointFromClient(clientX, clientY) {
  if (!state.imageCanvas || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function beginRecordingTouchMoveDrag(event, markerId) {
  const marker = state.markers.find(item => item.id === markerId);
  if (!marker || marker.id !== state.moveMarkerId) return false;

  const rect = canvas.getBoundingClientRect();
  recordingTouchGesture = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startTime: performance.now(),
    markerId,
    moveDrag: true,
    moved: false,
    cancelled: false,
    longPressed: false,
    markerOffsetX: event.clientX - (rect.left + marker.x * rect.width),
    markerOffsetY: event.clientY - (rect.top + marker.y * rect.height)
  };

  recordingTouchActivePointers.add(event.pointerId);
  document.body.classList.add("touch-marker-dragging");
  stopMoveCountdown();
  const label = moveCursor?.querySelector(".move-cursor-label");
  if (label) label.textContent = "Drag to move";
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function updateRecordingTouchMoveDrag(event, gesture) {
  const point = getRecordingPointFromClient(
    event.clientX - gesture.markerOffsetX,
    event.clientY - gesture.markerOffsetY
  );
  if (!point) return;

  recordingTouchMovePreview = { markerId: gesture.markerId, point };
  scheduleRecordingTouchMovePreview();
}

function finishRecordingTouchMoveDrag(event, gesture, cancelled = false) {
  if (!cancelled) {
    updateRecordingTouchMoveDrag(event, gesture);
  }

  state.moveMarkerId = null;
  recordingTouchActivePointers.delete(event.pointerId);
  document.body.classList.remove("touch-marker-dragging");
  hideMoveCursor();
  suppressNextRecordingCanvasClick(560);
  recordingTouchGesture = null;
  window.requestAnimationFrame(render);
}

function handleRecordingTouchPointerDown(event) {
  if (!isRecordingTouchPointer(event)) return;
  if (!isRecordingTouchEnvironment()) return;
  if (!isRecordingPhaseActive()) return;

  recordingTouchLastPointerTime = performance.now();

  const point = getCanvasPoint(event);
  if (!point) return;

  const marker = typeof getMarkerAtPoint === "function"
    ? getMarkerAtPoint(point, { inputMode: "touch" })
    : getCollapsedMarkerAtPoint(point);

  if (state.moveMarkerId) {
    if (marker?.id === state.moveMarkerId) {
      beginRecordingTouchMoveDrag(event, marker.id);
    } else {
      suppressNextRecordingCanvasClick(420);
      showAppNotification({
        type: "info",
        title: "Drag the Spot Reading",
        message: "Grab the selected marker or its bubble and drag it to the new position."
      });
    }
    return;
  }

  recordingTouchActivePointers.add(event.pointerId);

  if (!event.isPrimary || recordingTouchActivePointers.size > 1) {
    cancelRecordingTouchGesture({ suppressClick: true });
    return;
  }

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

  if (gesture.moveDrag) {
    gesture.moved = true;
    event.preventDefault();
    updateRecordingTouchMoveDrag(event, gesture);
    return;
  }

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

  if (gesture.moveDrag) {
    event.preventDefault();
    event.stopPropagation();
    finishRecordingTouchMoveDrag(event, gesture, false);
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
  const gesture = recordingTouchGesture;
  if (gesture?.moveDrag && gesture.pointerId === event.pointerId) {
    finishRecordingTouchMoveDrag(event, gesture, true);
    return;
  }

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
    { passive: false }
  );

  document.addEventListener("pointerdown", event => {
    if (!isRecordingTouchPointer(event) || !state.moveMarkerId) return;
    const bubble = event.target.closest?.(`.bubble[data-id="${state.moveMarkerId}"]`);
    if (!bubble) return;
    beginRecordingTouchMoveDrag(event, state.moveMarkerId);
  }, { capture: true, passive: false });

  document.addEventListener(
    "pointermove",
    handleRecordingTouchPointerMove,
    { passive: false }
  );

  canvas.addEventListener(
    "pointerup",
    handleRecordingTouchPointerUp,
    { passive: false }
  );

  document.addEventListener(
    "pointerup",
    event => {
      if (recordingTouchGesture?.moveDrag) {
        handleRecordingTouchPointerUp(event);
      }
    },
    { capture: true, passive: false }
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
  document.addEventListener("pointerdown", acceptNewRecordingPickerPointer, {
    capture: true,
    passive: true
  });

  document.addEventListener("click", event => {
    if (consumeOpeningRecordingPickerClick(event)) return;

    if (
      performance.now() <= recordingTouchSuppressClickUntil &&
      (event.target === canvas || event.target.closest?.("#picker, #bubbleLayer"))
    ) {
      consumeRecordingTouchClickSuppression(event);
    }
  }, true);

  window.addEventListener("blur", () => {
    recordingTouchActivePointers.clear();
    clearRecordingTouchGesture();
    releaseRecordingTouchPickerGuard();
  });
}
