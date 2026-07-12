"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Markers

Purpose:
Handles marker interaction behavior.

Table of Contents:
1. Move State
2. Marker Menu Actions
3. Marker Movement
4. Move Cursor Countdown
5. Marker Collapse
6. Collapsed Marker Hit Testing
7. Move Cursor Tracking

Owns:
- marker move timer state
- marker menu actions
- marker movement
- marker collapse
- collapsed marker hit testing
- move cursor countdown
- move cursor tracking

Does NOT own:
- marker creation
- marker selection state
- canvas rendering
- exposure calculations
- project metadata
- image loading

Dependencies:
- dom.js
- data.js
- picker-core.js
- render.js
- notifications.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Move State
────────────────────────────────────────────
*/

/*
  Timer state belongs to the Spot Reading movement module.
*/
let moveTimer = null;
let moveTimeLeft = 5;


/*
────────────────────────────────────────────
2. Marker Menu Actions
────────────────────────────────────────────
*/

/*
  Handles actions selected from a Spot Reading's floating menu.
*/
function handleMarkerMenuAction(action, event) {
  if (action === "zone-unavailable") {
    hidePicker();
    showAppNotification(
      "Zone placement is unavailable",
      "Start Calculation Mode to place a Spot Reading on a Zone."
    );
    return;
  }

  if (action === "delete") {
    deleteSelectedMarker();
    hidePicker();
    render();
    return;
  }

  if (action === "delete-all") {
    requestDeleteAllMarkers();
    return;
  }

  if (action === "expand") {
    const marker = getSelectedMarker();
    if (!marker) return;

    marker.collapsed = false;
    hidePicker();
    render();
    return;
  }

  if (action === "collapse") {
    collapseSelectedMarker();
    return;
  }

  if (action === "collapse-all") {
    collapseAllMarkers();
    return;
  }

  if (action === "move") {
    const marker = getSelectedMarker();
    if (!marker) return;

    state.moveMarkerId = marker.id;

    hidePicker();
    showMoveCursor(event);
    render();
  }
}



/*
  Deletes the complete Spot Reading set only after explicit confirmation.
  Image, Initial Metering Setup, Gear Settings and Image Identifier remain.
*/
function requestDeleteAllMarkers() {
  const readingCount = state.markers.length;
  if (!readingCount) return;

  hidePicker();

  showDialog({
    title: "Delete All Spot Readings?",
    message:
      `This will delete all ${readingCount} Spot Reading${readingCount === 1 ? "" : "s"}. ` +
      "Initial Metering Setup, image, Gear Settings and Image Identifier will remain.",
    okText: "Delete All",
    cancelText: "Cancel",
    danger: true,
    onConfirm: () => {
      if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)) {
        resetCalculation();
        setWorkflowPhase(WORKFLOW_PHASES.RECORDING);
      }

      resetMarkers();
      hideAppNotification();
      render();
    }
  });
}

/*
────────────────────────────────────────────
3. Marker Movement
────────────────────────────────────────────
*/

/*
  Moves an existing marker to a new normalized image point.
*/
function moveMarker(markerId, point) {
  const marker = state.markers.find(item => item.id === markerId);
  if (!marker) return;

  marker.x = point.x;
  marker.y = point.y;
  state.selectedId = marker.id;
}


/*
  Shows the custom move cursor while move mode is active.
*/
function isTouchMarkerMovePresentation() {
  return Boolean(
    document.documentElement.dataset.touch === "true" &&
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive()
  );
}


function showMoveCursor(event) {
  document.body.classList.add("move-marker");

  if (isTouchMarkerMovePresentation()) {
    document.body.classList.add("touch-marker-move-active");
    moveCursor.style.removeProperty("left");
    moveCursor.style.removeProperty("top");

    const label = moveCursor.querySelector(".move-cursor-label");
    if (label) label.textContent = "Tap the new position";
  } else {
    document.body.classList.remove("touch-marker-move-active");

    if (event) {
      moveCursor.style.left = `${event.clientX}px`;
      moveCursor.style.top = `${event.clientY}px`;
    }

    const label = moveCursor.querySelector(".move-cursor-label");
    if (label) label.textContent = "move here";
  }

  moveCursor.style.display = "flex";
  startMoveCountdown();
}


/*
  Hides the custom move cursor and stops the countdown.
*/
function hideMoveCursor() {
  document.body.classList.remove(
    "move-marker",
    "touch-marker-move-active"
  );

  moveCursor.style.display = "none";
  moveCursor.style.removeProperty("left");
  moveCursor.style.removeProperty("top");

  const label = moveCursor.querySelector(".move-cursor-label");
  if (label) label.textContent = "move here";

  stopMoveCountdown();
}


/*
────────────────────────────────────────────
4. Move Cursor Countdown
────────────────────────────────────────────
*/

/*
  Starts the temporary move-mode countdown.

  If the user does not place the marker within the time limit,
  move mode is cancelled automatically.
*/
function startMoveCountdown() {
  stopMoveCountdown();

  moveTimeLeft = 5;
  moveCountdown.textContent = moveTimeLeft;

  moveTimer = window.setInterval(() => {
    moveTimeLeft -= 1;
    moveCountdown.textContent = moveTimeLeft;

    if (moveTimeLeft <= 0) {
      state.moveMarkerId = null;

      hideMoveCursor();
      render();
    }
  }, 1000);
}


/*
  Stops and resets the move-mode countdown.
*/
function stopMoveCountdown() {
  if (moveTimer) {
    window.clearInterval(moveTimer);
    moveTimer = null;
  }

  moveTimeLeft = 5;

  if (moveCountdown) {
    moveCountdown.textContent = "5";
  }
}


/*
────────────────────────────────────────────
5. Marker Collapse
────────────────────────────────────────────
*/

/*
  Collapses the selected marker bubble.

  If the bubble exists in the DOM, the visual collapse animation is played
  before the marker state is updated.
*/
function collapseSelectedMarker() {
  const marker = getSelectedMarker();
  if (!marker) return;

  const bubble = document.querySelector(`.bubble[data-id="${marker.id}"]`);

  hidePicker();

  if (bubble) {
    bubble.classList.add("is-collapsing");

    window.setTimeout(() => {
      marker.collapsed = true;
      render();
    }, 180);

    return;
  }

  marker.collapsed = true;
  render();
}


/*
  Collapses every marker bubble in the current image.
*/
function collapseAllMarkers() {
  for (const marker of state.markers) {
    marker.collapsed = true;
  }

  hidePicker();
  render();
}

/*
────────────────────────────────────────────
6. Collapsed Marker Hit Testing
────────────────────────────────────────────
*/

/*
  Returns the CSS-pixel radius used for invisible marker hit testing.
  Source-canvas pixels are intentionally avoided because a 1500 px image can
  be displayed only 300 px wide on a phone, making a source-pixel radius far
  too small for touch.
*/
function getMarkerHitRadius(options = {}) {
  const pointerMode = document.documentElement.dataset.pointer || "fine";
  const touchInput = options.inputMode === "touch";
  const coarsePointer = pointerMode === "coarse" || pointerMode === "hybrid";

  if (touchInput || coarsePointer) return 30;
  return 18;
}


/*
  Returns the nearest marker inside an invisible CSS-pixel hit circle.
  By default every marker is eligible, allowing the small pin itself to open
  the existing marker menu even when the visible bubble is not tapped.
*/
function getMarkerAtPoint(point, options = {}) {
  if (!point || !state.imageCanvas) return null;

  const rect = imageWrap.getBoundingClientRect();
  const width = rect.width || canvas.getBoundingClientRect().width;
  const height = rect.height || canvas.getBoundingClientRect().height;
  if (!width || !height) return null;

  const hitRadius = Number(options.hitRadius || getMarkerHitRadius(options));
  const collapsedOnly = options.collapsedOnly === true;

  let nearest = null;
  let nearestDistance = Infinity;

  for (const marker of state.markers) {
    if (collapsedOnly && !marker.collapsed) continue;

    const dx = (point.x - marker.x) * width;
    const dy = (point.y - marker.y) * height;
    const distance = Math.hypot(dx, dy);

    if (distance <= hitRadius && distance < nearestDistance) {
      nearest = marker;
      nearestDistance = distance;
    }
  }

  return nearest;
}


function getCollapsedMarkerAtPoint(point, options = {}) {
  return getMarkerAtPoint(point, {
    ...options,
    collapsedOnly: true
  });
}


/*
────────────────────────────────────────────
7. Move Cursor Tracking
────────────────────────────────────────────
*/

/*
  Keeps the custom move cursor attached to the pointer while marker
  move mode is active.
*/
document.addEventListener("mousemove", event => {
  if (!state.moveMarkerId) return;

  moveCursor.style.left = `${event.clientX}px`;
  moveCursor.style.top = `${event.clientY}px`;
});