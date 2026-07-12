"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation Workflow

Purpose:
Owns Calculation Setup, Calculated Exposure editing, active Reference
editing, and explicit exit.

Table of Contents:
1. Module State
2. Workflow Status
3. Calculation Setup Entry
4. Initial Reference and Zone Selection
5. Confirmation and Cancellation
6. Calculated Exposure Controls
7. Active Reference Editing
8. Active Calculation Interaction
9. Active Calculation Exit
10. Module Initialization

Owns:
- dedicated Calculation button behavior
- Calculation Setup phase transitions
- draft Reference + Zone selection
- Calculation confirmation and cancellation
- S / A Calculated Exposure control mode
- Calculated ISO, shutter and aperture edits
- active Reference Spot Reading replacement
- active Reference Zone replacement
- active Calculation image-click feedback
- explicit exit back to Recording

Does NOT own:
- exposure mathematics
- generic picker positioning
- Spot Reading source measurements
- rendering internals

Dependencies:
- dom.js
- data.js
- exposure.js
- picker-core.js
- recording-pickers.js
- calculation-pickers.js
- calculation-ui.js
- notifications.js
- markers.js
- render.js
- header.js
==========================================================
*/

let calculationWorkflowInitialized = false;

/*
  Ephemeral active-edit state. It exists only while the Zone picker is
  open and never becomes project data.
*/
let calculationReferenceEdit = {
  markerId: null,
  mode: null
};


function isCalculationSetupActive() {
  return isWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION_SETUP
  );
}


function isCalculationActive() {
  return isWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION
  );
}


function clearCalculationReferenceEdit() {
  calculationReferenceEdit.markerId = null;
  calculationReferenceEdit.mode = null;
}


function beginCalculationSetup(event) {
  if (event) event.stopPropagation();

  if (
    !isWorkflowPhase(WORKFLOW_PHASES.RECORDING) ||
    !state.imageCanvas ||
    !hasInitialMeteringSetup() ||
    state.markers.length === 0
  ) {
    return;
  }

  closeHeaderMenus();
  hideMoveCursor();
  hidePicker();
  clearCalculationReferenceEdit();

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;

  const storedReferenceExists = state.markers.some(
    marker => marker.id === state.calculation.referenceSpotReadingId
  );

  if (
    storedReferenceExists &&
    state.calculation.referenceZone &&
    state.calculation.exposure
  ) {
    state.selectedId = state.calculation.referenceSpotReadingId;
    setWorkflowPhase(WORKFLOW_PHASES.CALCULATION);
    render();
    return;
  }

  resetCalculationDraft();
  setWorkflowPhase(
    WORKFLOW_PHASES.CALCULATION_SETUP
  );

  render();
}


function selectCalculationDraftReference(markerId) {
  if (!isCalculationSetupActive()) return;

  if (!setCalculationDraftReference(markerId)) {
    return;
  }

  state.selectedId = markerId;

  const marker = getSelectedMarker();
  if (!marker) return;

  render();
  showCalculationZonePicker(marker);
}


function handleCalculationDocumentClick(event) {
  const bubble = event.target.closest(".bubble");
  if (!bubble) return;

  if (isCalculationSetupActive()) {
    event.stopPropagation();
    selectCalculationDraftReference(
      bubble.dataset.id
    );
    return;
  }

  if (!isCalculationActive()) return;

  event.stopPropagation();

  selectMarker(bubble.dataset.id);
  showMarkerMenu(event, bubble.dataset.id);
  render();
}


function applyCalculationReferenceEdit(zone) {
  if (
    !isCalculationActive() ||
    !zone ||
    !calculationReferenceEdit.markerId
  ) {
    return false;
  }

  const marker = state.markers.find(
    item => item.id === calculationReferenceEdit.markerId
  );

  if (!marker) return false;

  state.calculation.referenceSpotReadingId = marker.id;
  state.calculation.referenceZone = {
    label: zone.label,
    ev: zone.ev
  };

  state.selectedId = marker.id;

  const recalculated = recalculateCalculatedExposure();

  clearCalculationReferenceEdit();
  hidePicker();
  render();

  if (!recalculated) {
    showAppNotification(
      "Calculation could not be updated",
      "The selected exposure value is outside the supported range."
    );
    return false;
  }

  return true;
}


function handleCalculationPickerClick(event) {
  if (isCalculationSetupActive()) {
    const zoneOption = event.target.closest(
      "[data-calculation-zone]"
    );

    if (!zoneOption) return;

    event.stopPropagation();

    const zone = ZONES.find(
      item =>
        item.label ===
        zoneOption.dataset.calculationZone
    );

    if (!zone) return;

    setCalculationDraftZone(zone);
    hidePicker();
    render();
    return;
  }

  if (!isCalculationActive()) return;

  const zoneOption = event.target.closest(
    "[data-calculation-zone]"
  );

  if (zoneOption && calculationReferenceEdit.markerId) {
    event.stopPropagation();

    const zone = ZONES.find(
      item => item.label === zoneOption.dataset.calculationZone
    );

    if (zone) applyCalculationReferenceEdit(zone);
    return;
  }

  const markerAction = event.target.closest(
    "[data-calculation-marker-action]"
  );

  if (markerAction) {
    event.stopPropagation();

    const action = markerAction.dataset.calculationMarkerAction;
    const marker = getSelectedMarker();

    if (!marker) return;

    if (action === "recording-action-unavailable") {
      hidePicker();
      showAppNotification(
        "Recording action is unavailable",
        "Exit Calculation Mode to move or delete Spot Readings."
      );
      return;
    }

    if (action === "make-reference") {
      if (
        state.calculation.referenceSpotReadingId === marker.id
      ) {
        hidePicker();
        showAppNotification(
          "Current Reference",
          `Spot Reading #${marker.number} is already the Reference.`
        );
        return;
      }

      calculationReferenceEdit.markerId = marker.id;
      calculationReferenceEdit.mode = "reference";
      showCalculationZonePicker(marker, null, {
        title: `Place new Reference #${marker.number}`
      });
      return;
    }

    if (action === "change-zone") {
      const isReference =
        state.calculation.referenceSpotReadingId === marker.id;

      if (!isReference) {
        hidePicker();
        showAppNotification(
          "Zone belongs to the Reference",
          "Use this Spot Reading as the Reference before changing its Zone."
        );
        return;
      }

      calculationReferenceEdit.markerId = marker.id;
      calculationReferenceEdit.mode = "zone";
      showCalculationZonePicker(
        marker,
        state.calculation.referenceZone,
        { title: `Change Zone for Reference #${marker.number}` }
      );
      return;
    }
  }

  const menuAction = event.target.closest(
    "[data-menu-action]"
  );

  if (menuAction) {
    event.stopPropagation();

    const action = menuAction.dataset.menuAction;

    if (["collapse", "expand", "collapse-all", "delete-all"].includes(action)) {
      handleMarkerMenuAction(action, event);
    }
    return;
  }

  const isoOption = event.target.closest(
    "[data-calculated-iso]"
  );

  if (isoOption) {
    state.calculation.exposure.iso = Number(
      isoOption.dataset.calculatedIso
    );

    recalculateCalculatedExposure();
    hidePicker();
    render();
    return;
  }

  const shutterOption = event.target.closest(
    "[data-calculated-shutter]"
  );

  if (
    shutterOption &&
    state.calculation.controlMode === "shutter"
  ) {
    state.calculation.exposure.shutter =
      shutterOption.dataset.calculatedShutter;

    recalculateCalculatedExposure();
    hidePicker();
    render();
    return;
  }

  const apertureOption = event.target.closest(
    "[data-calculated-aperture]"
  );

  if (
    apertureOption &&
    state.calculation.controlMode === "aperture"
  ) {
    state.calculation.exposure.aperture =
      apertureOption.dataset.calculatedAperture;

    recalculateCalculatedExposure();
    hidePicker();
    render();
  }
}


function startCalculation() {
  if (!isCalculationSetupActive()) return;

  if (!confirmCalculationDraft()) return;

  const exposure =
    createInitialCalculatedExposure();

  if (!exposure || !setCalculatedExposure(exposure)) {
    resetCalculation();
    setWorkflowPhase(WORKFLOW_PHASES.RECORDING);
    render();
    return;
  }

  state.selectedId =
    state.calculation.referenceSpotReadingId;

  hidePicker();
  render();
}


function cancelCalculationSetup() {
  if (!isCalculationSetupActive()) return;

  resetCalculationDraft();
  clearCalculationReferenceEdit();

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;

  hideMoveCursor();
  hidePicker();

  setWorkflowPhase(
    WORKFLOW_PHASES.RECORDING
  );

  render();
}


function handleCalculationControlModeClick(event) {
  event.stopPropagation();

  if (!isCalculationActive()) return;

  const nextMode =
    state.calculation.controlMode === "shutter"
      ? "aperture"
      : "shutter";

  setCalculationControlMode(nextMode);
  recalculateCalculatedExposure();

  hidePicker();
  render();
}


function handleCalculatedIsoClick(event) {
  event.stopPropagation();
  if (!isCalculationActive()) return;

  showCalculatedIsoPicker(
    calculatedIsoBtn
  );
}


function handleCalculatedShutterClick(event) {
  event.stopPropagation();
  if (!isCalculationActive()) return;

  if (state.calculation.controlMode !== "shutter") {
    showAppNotification(
      "Calculated value",
      "Switch to S control to edit shutter speed."
    );
    return;
  }

  showCalculatedShutterPicker(
    calculatedShutterBtn
  );
}


function handleCalculatedApertureClick(event) {
  event.stopPropagation();
  if (!isCalculationActive()) return;

  if (state.calculation.controlMode !== "aperture") {
    showAppNotification(
      "Calculated value",
      "Switch to A control to edit aperture."
    );
    return;
  }

  showCalculatedAperturePicker(
    calculatedApertureBtn
  );
}


function handleCalculationCanvasClick(event) {
  if (!isCalculationActive()) return;

  event.stopPropagation();

  const point = getCanvasPoint(event);
  const collapsedMarker = point
    ? getCollapsedMarkerAtPoint(point)
    : null;

  if (collapsedMarker) {
    collapsedMarker.collapsed = false;
    state.selectedId = collapsedMarker.id;
    hidePicker();
    render();
    return;
  }

  if (isPickerOpen()) {
    clearCalculationReferenceEdit();
    hidePicker();
    return;
  }

  showAppNotification(
    "Spot Reading recording is paused",
    "Exit Calculation Mode to record additional Spot Readings."
  );
}


function saveCalculatedExposureAsActual() {
  if (!isCalculationActive() || !state.calculation.exposure) return;

  if (typeof ensureActualExposureStructure === "function") {
    ensureActualExposureStructure();
  }

  const exposure = state.calculation.exposure;
  state.actualExposure.status = "exposed";
  state.actualExposure.iso = Number(exposure.iso);
  state.actualExposure.shutter = exposure.shutter;
  state.actualExposure.aperture = String(exposure.aperture);

  if (typeof updateActualExposureControls === "function") {
    updateActualExposureControls();
  }

  showAppNotification(
    "Actual Exposure saved",
    `ISO ${exposure.iso} · ${formatShutterLabel(exposure.shutter)} · f/${exposure.aperture}`
  );
}


function exitCalculation() {
  if (!isCalculationActive()) return;

  /*
    Leaving Calculation Mode changes only the active workflow phase.
    The confirmed reference, Zone and exposure remain project data so
    Recording and Export can continue to use the latest decision.
  */
  clearCalculationReferenceEdit();

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;

  hideMoveCursor();
  hidePicker();
  hideAppNotification();

  setWorkflowPhase(
    WORKFLOW_PHASES.RECORDING
  );

  render();
}


function initializeCalculationWorkflow() {
  if (calculationWorkflowInitialized) return;

  calculationWorkflowInitialized = true;

  calculationBtn?.addEventListener(
    "click",
    beginCalculationSetup
  );

  calculationSetupCancelBtn?.addEventListener(
    "click",
    cancelCalculationSetup
  );

  calculationSetupStartBtn?.addEventListener(
    "click",
    startCalculation
  );

  calculationControlModeBtn?.addEventListener(
    "click",
    handleCalculationControlModeClick
  );

  calculatedIsoBtn?.addEventListener(
    "click",
    handleCalculatedIsoClick
  );

  calculatedShutterBtn?.addEventListener(
    "click",
    handleCalculatedShutterClick
  );

  calculatedApertureBtn?.addEventListener(
    "click",
    handleCalculatedApertureClick
  );

  calculationSaveActualBtn?.addEventListener(
    "click",
    saveCalculatedExposureAsActual
  );

  calculationExitBtn?.addEventListener(
    "click",
    exitCalculation
  );

  picker.addEventListener(
    "click",
    handleCalculationPickerClick
  );

  document.addEventListener(
    "click",
    handleCalculationDocumentClick
  );

  canvas.addEventListener(
    "click",
    handleCalculationCanvasClick
  );

  updateCalculationUi();
}