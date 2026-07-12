"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Picker Core

Purpose:
Provides reusable picker opening, closing, scrolling, snapping, and
positioning infrastructure without owning workflow-specific picker content.

Table of Contents:
1. Picker State
2. Picker Status
3. Picker Opening / Closing
4. Picker Scrolling / Snapping
5. Picker Dragging
6. Picker Positioning

Owns:
- shared picker visibility state
- reusable picker opening around a point or Spot Reading
- closing animation and timeout safety
- picker scrolling and snapping
- picker positioning inside the stage and image

Does NOT own:
- Recording picker content
- Calculation picker content
- applying selected picker values
- Spot Reading creation or movement
- exposure calculations
- project metadata

Dependencies:
- dom.js
- data.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Picker State
────────────────────────────────────────────
*/

let snapTimeout = null;
let pickerCloseTimeout = null;
let pickerDragState = null;


/*
────────────────────────────────────────────
2. Picker Status
────────────────────────────────────────────
*/

function isPickerOpen() {
  return !picker.hidden;
}


/*
────────────────────────────────────────────
3. Picker Opening / Closing
────────────────────────────────────────────
*/

/*
  Cancels an unfinished close animation before the shared picker is reused.
*/
function preparePickerForOpen(html) {
  window.clearTimeout(
    pickerCloseTimeout
  );

  pickerCloseTimeout = null;

  picker.classList.remove(
    "closing"
  );

  picker.hidden = false;
  picker.classList.remove(
    "picker-centered",
    "picker-zone",
    "picker-marker-menu",
    "picker-viewport-fixed"
  );
  picker.removeAttribute("data-picker-owner");
  picker.innerHTML = html;
}


/*
  Opens a picker at a pointer location inside the stage.
*/
function openPickerFromPoint(
  event,
  html,
  scrollOptions = null
) {
  const stageRect =
    stage.getBoundingClientRect();

  preparePickerForOpen(html);

  picker.style.left =
    `${event.clientX - stageRect.left}px`;

  picker.style.top =
    `${event.clientY - stageRect.top}px`;

  keepPickerInside();
  scrollPickerAfterOpen(
    scrollOptions
  );
}


/*
  Opens a picker below a control button.

  Calculation Mode uses this shared positioning path for ISO, shutter,
  and aperture controls without coupling picker-core.js to their content.
*/
function openPickerFromButton(
  button,
  html,
  owner = null,
  scrollOptions = null
) {
  if (!button) return;

  const stageRect =
    stage.getBoundingClientRect();

  const buttonRect =
    button.getBoundingClientRect();

  preparePickerForOpen(html);

  if (owner === "gear-range") {
    picker.classList.add("picker-viewport-fixed");
    picker.dataset.pickerOwner = owner;

    const margin = 12;
    const preferredLeft =
      buttonRect.left + buttonRect.width / 2 - picker.offsetWidth / 2;

    const left = Math.min(
      window.innerWidth - picker.offsetWidth - margin,
      Math.max(margin, preferredLeft)
    );

    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const top = spaceBelow >= picker.offsetHeight + 18
      ? buttonRect.bottom + 8
      : Math.max(margin, buttonRect.top - picker.offsetHeight - 8);

    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    scrollPickerAfterOpen(scrollOptions);
    return;
  }

  const left =
    buttonRect.left -
    stageRect.left +
    buttonRect.width / 2 -
    picker.offsetWidth / 2;

  const top =
    buttonRect.top -
    stageRect.top -
    picker.offsetHeight -
    10;

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;

  keepPickerInside();
  scrollPickerAfterOpen(scrollOptions);
}




/*
  Opens a centered floating picker. Zone selection uses this path so the
  control never competes with the Calculation panels or the selected bubble.
*/
function openCenteredPicker(
  html,
  owner = null,
  scrollOptions = null
) {
  preparePickerForOpen(html);
  picker.scrollTop = 0;

  picker.classList.add("picker-centered");

  if (owner) {
    picker.dataset.pickerOwner = owner;
  }

  if (owner === "calculation-zone") {
    picker.classList.add("picker-zone");
  }

  centerPickerInStage();
  scrollPickerAfterOpen(scrollOptions);
}


function centerPickerInStage() {
  const stageRect = stage.getBoundingClientRect();

  const left = Math.max(
    12,
    (stageRect.width - picker.offsetWidth) / 2
  );

  const top = Math.max(
    12,
    (stageRect.height - picker.offsetHeight) / 2
  );

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}


/*
  Opens a picker around a Spot Reading position.
*/
function openPickerFromMarker(marker, html) {
  const stageRect =
    stage.getBoundingClientRect();

  const layerRect =
    bubbleLayer.getBoundingClientRect();

  preparePickerForOpen(html);

  const markerX =
    layerRect.left -
    stageRect.left +
    marker.x * layerRect.width;

  const markerY =
    layerRect.top -
    stageRect.top +
    marker.y * layerRect.height;

  placePickerAroundMarker(
    markerX,
    markerY
  );

  scrollCurrentOptionIntoView();
}


/*
  Hides the picker with the existing closing animation.

  A pending close timer is cancelled before a new one is created so an old
  animation cannot later hide newly opened picker content.
*/
function dispatchPickerClosed() {
  window.dispatchEvent(
    new CustomEvent("spot-sketch:picker-closed")
  );
}


function hidePicker() {
  window.clearTimeout(pickerCloseTimeout);
  window.clearTimeout(snapTimeout);

  pickerCloseTimeout = null;
  snapTimeout = null;
  state.pendingPoint = null;

  if (picker.hidden) {
    return;
  }

  /*
    Notify workflow UI at the moment closing begins. This keeps contextual
    instructions correct even when the user closes a picker by clicking a
    panel rather than selecting an option.
  */
  dispatchPickerClosed();

  picker.classList.add("closing");

  pickerCloseTimeout = window.setTimeout(() => {
    picker.hidden = true;
    picker.classList.remove("closing");
    picker.classList.remove("is-dragging");
    picker.removeAttribute("data-picker-owner");
    picker.innerHTML = "";
    pickerDragState = null;
    pickerCloseTimeout = null;
  }, 160);
}


/*
────────────────────────────────────────────
4. Picker Scrolling / Snapping
────────────────────────────────────────────
*/

/*
  Scrolls the picker after opening.

  Priority:
  1. If there is a current option, center it immediately.
  2. Otherwise, scroll to the provided default value.
*/
function scrollPickerAfterOpen(
  scrollOptions = null
) {
  const current =
    picker.querySelector(".current");

  if (
    current &&
    !(scrollOptions && scrollOptions.preferProvidedValue)
  ) {
    scrollCurrentOptionIntoView();
    return;
  }

  if (
    scrollOptions &&
    scrollOptions.scrollAttribute &&
    scrollOptions.scrollValue
  ) {
    scrollPickerToValue(
      scrollOptions.scrollAttribute,
      scrollOptions.scrollValue,
      scrollOptions.smooth === true
    );
  }
}


/*
  Scrolls the currently selected option into view.
*/
function scrollCurrentOptionIntoView() {
  requestAnimationFrame(() => {
    const current =
      picker.querySelector(".current");

    if (current) {
      current.scrollIntoView({
        block: "center",
        behavior: "auto"
      });
    }
  });
}


/*
  Scrolls the picker to a specific option value.
*/
function scrollPickerToValue(
  attributeName,
  value,
  smooth = false
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = picker.querySelector(
        `[${attributeName}="${value}"]`
      );

      if (target) {
        if (picker.classList.contains("picker-centered")) {
          const title = picker.querySelector(".picker-title");
          const titleHeight = title ? title.offsetHeight : 0;
          const usableHeight = Math.max(0, picker.clientHeight - titleHeight);
          const targetCenter = target.offsetTop + target.offsetHeight / 2;
          const desiredCenter = titleHeight + usableHeight / 2;
          const nextScrollTop = Math.max(0, targetCenter - desiredCenter);

          picker.scrollTo({
            top: nextScrollTop,
            behavior: smooth ? "smooth" : "auto"
          });
        } else {
          target.scrollIntoView({
            block: "center",
            behavior: smooth
              ? "smooth"
              : "auto"
          });
        }
      }
    });
  });
}


/*
  Snaps scrolling picker lists to the nearest option.
*/
picker.addEventListener("scroll", () => {
  if (picker.classList.contains("picker-zone")) return;

  window.clearTimeout(snapTimeout);

  snapTimeout = window.setTimeout(() => {
    snapToNearestPickerOption();
  }, 90);
});


/*
  Centers the picker option nearest to the picker viewport center.
*/
function snapToNearestPickerOption() {
  if (picker.hidden || picker.classList.contains("picker-zone")) return;

  const options = Array.from(
    picker.querySelectorAll(
      ".picker-option"
    )
  );

  if (!options.length) return;

  const pickerRect =
    picker.getBoundingClientRect();

  const title = picker.classList.contains("picker-centered")
    ? picker.querySelector(".picker-title")
    : null;

  const titleHeight = title
    ? title.getBoundingClientRect().height
    : 0;

  const pickerCenter =
    pickerRect.top +
    titleHeight +
    (pickerRect.height - titleHeight) / 2;

  let nearest = options[0];
  let nearestDistance = Infinity;

  for (const option of options) {
    const rect =
      option.getBoundingClientRect();

    const optionCenter =
      rect.top +
      rect.height / 2;

    const distance =
      Math.abs(
        optionCenter - pickerCenter
      );

    if (distance < nearestDistance) {
      nearest = option;
      nearestDistance = distance;
    }
  }

  nearest.scrollIntoView({
    block: "center",
    behavior: "smooth"
  });
}




/*
────────────────────────────────────────────
5. Picker Dragging
────────────────────────────────────────────
*/

/*
  Centered Zone pickers can be moved by dragging their title. Their position
  intentionally resets on every new opening.
*/
function beginPickerDrag(event) {
  if (
    !picker.classList.contains("picker-centered") ||
    !event.target.closest(".picker-title")
  ) {
    return;
  }

  event.preventDefault();

  const stageRect = stage.getBoundingClientRect();

  pickerDragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - picker.getBoundingClientRect().left,
    offsetY: event.clientY - picker.getBoundingClientRect().top,
    stageLeft: stageRect.left,
    stageTop: stageRect.top
  };

  picker.classList.add("is-dragging");
  picker.setPointerCapture?.(event.pointerId);
}


function movePickerDrag(event) {
  if (
    !pickerDragState ||
    pickerDragState.pointerId !== event.pointerId
  ) {
    return;
  }

  const left =
    event.clientX -
    pickerDragState.stageLeft -
    pickerDragState.offsetX;

  const top =
    event.clientY -
    pickerDragState.stageTop -
    pickerDragState.offsetY;

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  keepPickerInside();
}


function endPickerDrag(event) {
  if (
    !pickerDragState ||
    pickerDragState.pointerId !== event.pointerId
  ) {
    return;
  }

  picker.releasePointerCapture?.(event.pointerId);
  picker.classList.remove("is-dragging");
  pickerDragState = null;
}


picker.addEventListener("pointerdown", beginPickerDrag);
picker.addEventListener("pointermove", movePickerDrag);
picker.addEventListener("pointerup", endPickerDrag);
picker.addEventListener("pointercancel", endPickerDrag);


/*
────────────────────────────────────────────
6. Picker Positioning
────────────────────────────────────────────
*/

/*
  Keeps the picker inside the stage after opening.
*/
function keepPickerInside() {
  const pickerRect =
    picker.getBoundingClientRect();

  const stageRect =
    stage.getBoundingClientRect();

  let left = picker.offsetLeft;
  let top = picker.offsetTop;

  if (pickerRect.right > stageRect.right) {
    left -=
      pickerRect.right -
      stageRect.right +
      12;
  }

  if (pickerRect.bottom > stageRect.bottom) {
    top -=
      pickerRect.bottom -
      stageRect.bottom +
      12;
  }

  if (left < 12) {
    left = 12;
  }

  if (top < 2) {
    top = 2;
  }

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}


/*
  Chooses a picker location around a Spot Reading without leaving the image.
*/
function placePickerAroundMarker(
  markerX,
  markerY
) {
  const imageRect =
    bubbleLayer.getBoundingClientRect();

  const stageRect =
    stage.getBoundingClientRect();

  const pickerWidth = picker.offsetWidth;
  const pickerHeight = picker.offsetHeight;

  const imageLeft =
    imageRect.left - stageRect.left;

  const imageTop =
    imageRect.top - stageRect.top;

  const imageRight =
    imageLeft + imageRect.width;

  const imageBottom =
    imageTop + imageRect.height;

  const gap = 18;

  const positions = [
    {
      left: markerX - pickerWidth / 2,
      top: markerY + gap
    },
    {
      left: markerX + gap,
      top: markerY + gap
    },
    {
      left: markerX + gap,
      top: markerY - pickerHeight / 2
    },
    {
      left: markerX + gap,
      top: markerY - pickerHeight - gap
    },
    {
      left: markerX - pickerWidth / 2,
      top: markerY - pickerHeight - gap
    },
    {
      left: markerX - pickerWidth - gap,
      top: markerY - pickerHeight - gap
    },
    {
      left: markerX - pickerWidth - gap,
      top: markerY - pickerHeight / 2
    },
    {
      left: markerX - pickerWidth - gap,
      top: markerY + gap
    }
  ];

  const best = positions.find(position =>
    position.left >= imageLeft &&
    position.top >= imageTop &&
    position.left + pickerWidth <= imageRight &&
    position.top + pickerHeight <= imageBottom
  ) || positions[0];

  picker.style.left = `${best.left}px`;
  picker.style.top = `${best.top}px`;
}