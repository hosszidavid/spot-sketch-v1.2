"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation Pickers

Purpose:
Renders Zone and Calculated Exposure picker content.

Owns:
- Calculation Setup Zone picker
- Calculated ISO picker
- Calculated shutter picker
- Calculated aperture picker

Does NOT own:
- workflow transitions
- applying selected values
- generic picker positioning
- exposure mathematics

Dependencies:
- data.js
- exposure.js
- picker-core.js
==========================================================
*/


const ZONE_PICKER_DESCRIPTIONS = Object.freeze({
  "0": "Pure black",
  "I": "Near black",
  "II": "First texture",
  "III": "Textured shadows",
  "IV": "Dark midtones",
  "V": "Middle grey",
  "VI": "Light midtones",
  "VII": "Textured highlights",
  "VIII": "Pale highlights",
  "IX": "Near white",
  "X": "Pure white"
});

function showCalculationZonePicker(
  marker,
  currentZone = state.calculationDraft.referenceZone,
  options = {}
) {
  if (!marker) return;

  const title = options.title ||
    `Place Spot Reading #${marker.number}`;

  if (typeof calculationSetupHint !== "undefined" && calculationSetupHint) {
    calculationSetupHint.textContent =
      "Choose the Zone for the selected Reference Spot Reading.";
  }

  openCenteredPicker(`
    <div class="picker-title" title="Drag to move">
      <span>${title}</span>
      <small class="picker-drag-label">DRAG</small>
    </div>

    ${ZONES.map(zone => `
      <button
        class="picker-option ${
          currentZone && currentZone.label === zone.label
            ? "current"
            : ""
        }"
        type="button"
        data-calculation-zone="${zone.label}">
        <span>ZONE ${zone.label}</span>
        <small>${ZONE_PICKER_DESCRIPTIONS[zone.label] || ""}</small>
      </button>
    `).join("")}
  `, "calculation-zone", {
    scrollAttribute: "data-calculation-zone",
    scrollValue: "V",
    smooth: false,
    preferProvidedValue: true
  });
}


function showCalculatedIsoPicker(button) {
  if (!button || !state.calculation.exposure) return;

  const current = state.calculation.exposure.iso;

  openPickerFromButton(button, `
    <div class="picker-title">Calculated ISO</div>

    ${ISO_VALUES.map(value => `
      <button
        class="picker-option ${current === value ? "current" : ""}"
        type="button"
        data-calculated-iso="${value}">
        ISO ${value}
      </button>
    `).join("")}
  `, "calculated-iso", {
    scrollAttribute: "data-calculated-iso",
    scrollValue: String(current),
    smooth: false
  });
}


function showCalculatedShutterPicker(button) {
  if (!button || !state.calculation.exposure) return;

  const current = state.calculation.exposure.shutter;

  openPickerFromButton(button, `
    <div class="picker-title">Calculated Shutter</div>

    ${SHUTTER_VALUES
      .filter(value => value !== "B" && value !== "0")
      .map(value => `
        <button
          class="picker-option ${FULL_STOP_SHUTTERS.has(value) ? "full" : ""} ${current === value ? "current" : ""}"
          type="button"
          data-calculated-shutter="${value}">
          ${formatShutterLabel(value)}
        </button>
      `).join("")}
  `, "calculated-shutter", {
    scrollAttribute: "data-calculated-shutter",
    scrollValue: current,
    smooth: false
  });
}


function showCalculatedAperturePicker(button) {
  if (!button || !state.calculation.exposure) return;

  const current = state.calculation.exposure.aperture;

  openPickerFromButton(button, `
    <div class="picker-title">Calculated Aperture</div>

    ${APERTURES
      .filter(value => value !== "0.0" && value !== "F")
      .map(value => `
        <button
          class="picker-option aperture-option ${FULL_STOP_APERTURES.has(value) ? "full" : ""} ${current === value ? "current" : ""}"
          type="button"
          data-calculated-aperture="${value}">
          <span class="aperture-prefix">f</span><span class="aperture-number">${value}</span>
        </button>
      `).join("")}
  `, "calculated-aperture", {
    scrollAttribute: "data-calculated-aperture",
    scrollValue: current,
    smooth: false
  });
}