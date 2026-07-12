"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Recording Pickers

Purpose:
Defines picker content used by Spot Reading Recording and the shared
Spot Reading action menu.

Table of Contents:
1. Measurement Value Picker
2. Spot Reading Menu Picker

Owns:
- measured aperture picker content
- workflow-aware Spot Reading action menu content

Does NOT own:
- picker opening, closing, scrolling, or positioning infrastructure
- applying selected picker values
- Spot Reading creation internals
- Spot Reading movement internals
- Calculation Zone picker content
- exposure calculations

Dependencies:
- data.js
- exposure.js
- picker-core.js
- markers.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Measurement Value Picker
────────────────────────────────────────────
*/

function showValuePicker(event) {
  showAperturePicker(event);
}


function showAperturePicker(event) {
  openPickerFromPoint(event, `
    <div class="picker-title">
      Aperture
    </div>

    ${APERTURES
      .filter(value =>
        value !== "0.0" &&
        value !== "F"
      )
      .map(value => `
        <button
          class="picker-option aperture-option ${FULL_STOP_APERTURES.has(value) ? "full" : ""}"
          data-aperture="${value}">
          f ${value}
        </button>
      `)
      .join("")}
  `, {
    scrollAttribute: "data-aperture",
    scrollValue: "5.6",
    smooth: false
  });
}


/*
────────────────────────────────────────────
2. Spot Reading Menu Picker
────────────────────────────────────────────
*/

function showMarkerMenu(event, markerId) {
  selectMarker(markerId);

  const marker = getSelectedMarker();
  if (!marker) return;

  const calculationActive = isWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION
  );

  const isReference = calculationActive &&
    state.calculation.referenceSpotReadingId === marker.id;

  const zoneAction = calculationActive
    ? `
      <button
        class="picker-option ${isReference ? "" : "unavailable"}"
        data-unavailable-reason="referenceZoneOnly"
        data-calculation-marker-action="change-zone"
        aria-disabled="${isReference ? "false" : "true"}">
        Change Zone
      </button>
    `
    : `
      <button
        class="picker-option unavailable"
        data-unavailable-reason="calculationNeedsReading"
        data-menu-action="zone-unavailable"
        aria-disabled="true">
        Change Zone
      </button>
    `;

  const referenceAction = calculationActive
    ? `
      <button
        class="picker-option ${isReference ? "current-reference-muted unavailable" : ""}"
        data-unavailable-reason="currentReference"
        data-calculation-marker-action="make-reference"
        aria-disabled="${isReference ? "true" : "false"}">
        ${isReference ? "Current Reference" : "Use as Reference"}
      </button>
    `
    : "";

  const moveAction = calculationActive
    ? `
      <button
        class="picker-option unavailable"
        data-unavailable-reason="calculationRecordingAction"
        data-calculation-marker-action="recording-action-unavailable">
        Move Spot Reading
      </button>
    `
    : `
      <button
        class="picker-option"
        data-menu-action="move">
        Move Spot Reading
      </button>
    `;

  const deleteAction = calculationActive
    ? `
      <button
        class="picker-option unavailable"
        data-unavailable-reason="calculationRecordingAction"
        data-calculation-marker-action="recording-action-unavailable">
        Delete Spot Reading
      </button>
    `
    : `
      <button
        class="picker-option danger"
        data-menu-action="delete">
        Delete Spot Reading
      </button>
    `;

  openPickerFromMarker(marker, `
    <div class="picker-title">
      Spot Reading #${marker.number}
    </div>

    ${zoneAction}
    ${referenceAction}
    ${moveAction}

    <button
      class="picker-option"
      data-menu-action="${marker.collapsed ? "expand" : "collapse"}">
      ${marker.collapsed ? "Expand" : "Collapse"}
    </button>

    <button
      class="picker-option"
      data-menu-action="collapse-all">
      Collapse All
    </button>

    ${deleteAction}

    <button
      class="picker-option danger"
      data-menu-action="delete-all">
      Delete All Spot Readings
    </button>
  `);

  picker.classList.add("picker-marker-menu");
}