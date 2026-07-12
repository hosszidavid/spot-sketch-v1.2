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
function showMoveCursor(event) {
  document.body.classList.add("move-marker");

  if (event) {
    moveCursor.style.left = `${event.clientX}px`;
    moveCursor.style.top = `${event.clientY}px`;
  }

  moveCursor.style.display = "flex";
  startMoveCountdown();
}


/*
  Hides the custom move cursor and stops the countdown.
*/
function hideMoveCursor() {
  document.body.classList.remove("move-marker");
  moveCursor.style.display = "none";

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
  Returns a collapsed marker near the given normalized image point.

  The hit radius is measured in canvas pixels so collapsed markers remain
  easy to tap/click at normal display sizes.
*/
function getCollapsedMarkerAtPoint(point) {
  const hitRadius = 14;

  for (const marker of state.markers) {
    if (!marker.collapsed) continue;

    const dx = (point.x - marker.x) * canvas.width;
    const dy = (point.y - marker.y) * canvas.height;
    const distance = Math.hypot(dx, dy);

    if (distance <= hitRadius) {
      return marker;
    }
  }

  return null;
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