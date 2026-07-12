"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation UI

Purpose:
Synchronizes Calculation Setup and active Calculated Exposure UI.

Owns:
- Calculation Setup overlay visibility and summary
- active Calculation panel content
- S/A control presentation
- workflow-specific body classes

Does NOT own:
- workflow transitions
- picker content
- exposure mathematics
- Spot Reading rendering internals

Dependencies:
- dom.js
- data.js
- exposure.js
==========================================================
*/


const CALCULATION_REFERENCE_ZONE_NOTE =
  "In Calculation Mode, the Reference Spot Reading will always stay in the selected Zone.";

function getCalculationSetupBaseInstruction() {
  return (
    "Select a Spot Reading on the image, then choose its reference Zone. " +
    CALCULATION_REFERENCE_ZONE_NOTE
  );
}

function getCalculationDraftReference() {
  return state.markers.find(
    marker =>
      marker.id ===
      state.calculationDraft.referenceSpotReadingId
  ) || null;
}


function getCalculationReference() {
  return state.markers.find(
    marker =>
      marker.id ===
      state.calculation.referenceSpotReadingId
  ) || null;
}


function updateCalculationUi() {
  const setupActive = isWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION_SETUP
  );

  const calculationActive = isWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION
  );

  document.body.classList.toggle(
    "calculation-setup-active",
    setupActive
  );

  document.body.classList.toggle(
    "calculation-active",
    calculationActive
  );

  calculationSetupOverlay.hidden = !setupActive;
  calculationStatus.hidden = !calculationActive;

  if (setupActive) {
    const reference = getCalculationDraftReference();
    const zone = state.calculationDraft.referenceZone;

    calculationSetupReference.textContent = reference
      ? `Spot Reading #${reference.number}`
      : "Not selected";

    calculationSetupZone.textContent = zone
      ? `Zone ${zone.label}`
      : "Not selected";

    calculationSetupHint.textContent = reference
      ? zone
        ? "Review the Reference Spot Reading and Zone, then start Calculation Mode."
        : "Choose the Zone for the selected Reference Spot Reading."
      : getCalculationSetupBaseInstruction();

    calculationSetupStartBtn.disabled =
      !isCalculationDraftComplete();
  }

  if (!calculationActive) return;

  const reference = getCalculationReference();
  const zone = state.calculation.referenceZone;
  const exposure = state.calculation.exposure;
  const shutterControl =
    state.calculation.controlMode === "shutter";

  calculationStatusReference.textContent =
    reference && zone
      ? `Reference Spot Reading #${reference.number} · Zone ${zone.label}`
      : "Reference unavailable";

  calculationControlModeBtn.classList.toggle(
    "is-shutter",
    shutterControl
  );

  calculationControlModeBtn.classList.toggle(
    "is-aperture",
    !shutterControl
  );

  calculationControlModeBtn.setAttribute(
    "aria-label",
    shutterControl
      ? "Switch to Aperture control"
      : "Switch to Shutter control"
  );

  calculationModeShutterLabel.classList.toggle(
    "active",
    shutterControl
  );

  calculationModeApertureLabel.classList.toggle(
    "active",
    !shutterControl
  );

  if (!exposure) {
    calculatedIsoBtn.textContent = "ISO —";
    calculatedShutterBtn.textContent = "Shutter —";
    calculatedApertureBtn.textContent = "Aperture —";
    calculatedApertureBtn.classList.remove("is-range-warning");
    calculatedShutterBtn.classList.remove("is-range-warning");
    const rangeWarning = document.getElementById("calculationRangeWarning");
    if (rangeWarning) rangeWarning.hidden = true;
    return;
  }

  calculatedIsoBtn.textContent =
    `ISO ${exposure.iso}`;

  calculatedShutterBtn.textContent =
    formatShutterLabel(exposure.shutter);

  calculatedApertureBtn.innerHTML =
    `<i>f</i>${exposure.aperture}`;

  calculatedShutterBtn.classList.toggle(
    "is-editable",
    shutterControl
  );

  calculatedShutterBtn.classList.toggle(
    "is-calculated",
    !shutterControl
  );

  calculatedApertureBtn.classList.toggle(
    "is-editable",
    !shutterControl
  );

  calculatedApertureBtn.classList.toggle(
    "is-calculated",
    shutterControl
  );

  calculatedExposureMessage.textContent = shutterControl
    ? "ISO and shutter are editable. Aperture is calculated automatically."
    : "ISO and aperture are editable. Shutter is calculated automatically.";
  const rangeWarnings = typeof getExposureRangeWarnings === "function"
    ? getExposureRangeWarnings(exposure)
    : [];
  const apertureWarning = rangeWarnings.some(item => item.field === "aperture");
  const shutterWarning = rangeWarnings.some(item => item.field === "shutter");

  calculatedApertureBtn.classList.toggle("is-range-warning", apertureWarning);
  calculatedShutterBtn.classList.toggle("is-range-warning", shutterWarning);

  const rangeWarning = document.getElementById("calculationRangeWarning");
  if (rangeWarning) {
    rangeWarning.hidden = rangeWarnings.length === 0;
    rangeWarning.textContent = rangeWarnings.map(item => item.message).join(" ");
  }

}


/*
  Restores context-sensitive Calculation Setup guidance as soon as any
  floating picker begins closing. The shared picker remains independent from
  Calculation state while every close path produces the same UI result.
*/
window.addEventListener("spot-sketch:picker-closed", () => {
  if (!isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)) {
    return;
  }

  updateCalculationUi();

  /*
    Closing the Zone picker without choosing a Zone returns the panel to its
    neutral instruction. The draft Reference remains selected, so reopening
    the picker continues the same setup decision.
  */
  if (
    getCalculationDraftReference() &&
    !state.calculationDraft.referenceZone
  ) {
    calculationSetupHint.textContent =
      getCalculationSetupBaseInstruction();
  }
});