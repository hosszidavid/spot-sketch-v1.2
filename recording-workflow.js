"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Recording Workflow

Purpose:
Owns image-entry controls and the active Spot Reading Recording phase.

Table of Contents:
1. Workflow State
2. Image Loading Controls
3. Shared Header Controls
4. Canvas Recording Interaction
5. Picker Selection Routing
6. Spot Reading Menu Interaction
7. Workflow Initialization

Owns:
- image file-picker and drag-and-drop bindings
- theme and Export Workspace header controls
- Spot Reading creation flow during Recording
- Recording picker selection routing
- Spot Reading bubble menu opening during Recording
- outside-click picker closing

Does NOT own:
- Initial Metering Setup or Restart Metering
- shared DOM reference creation
- image decoding / resizing
- picker rendering and positioning
- Spot Reading data creation internals
- Spot Reading movement internals
- Project Info internals
- Export Workspace internals
- Calculation Mode interaction
- rendering internals

Dependencies:
- shared DOM references from dom.js
- data.js
- metering-setup.js
- picker-core.js
- recording-pickers.js
- render.js
- markers.js
- image.js
- header.js
- export-workspace.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Workflow State
────────────────────────────────────────────
*/

let recordingWorkflowInitialized = false;


/*
  Returns whether Spot Reading Recording currently owns image and bubble
  interaction.
*/
function isRecordingPhaseActive() {
  return Boolean(
    state.imageCanvas &&
    hasInitialMeteringSetup() &&
    isWorkflowPhase(
      WORKFLOW_PHASES.RECORDING
    )
  );
}


/*
────────────────────────────────────────────
2. Image Loading Controls
────────────────────────────────────────────
*/

/*
  Opens the browser image picker.
*/
function openImagePicker() {
  if (isProjectInfoOpen()) return;

  fileInput.click();
}


function handleWelcomeLoadClick() {
  openImagePicker();
}


async function handleFileInputChange() {
  const file = fileInput.files[0];

  if (file) {
    await requestImageLoad(file);
  }

  fileInput.value = "";
}


function handleStageDragOver(event) {
  event.preventDefault();
}


async function handleStageDrop(event) {
  event.preventDefault();

  if (isProjectInfoOpen()) return;
  if (isMeteringSetupActive()) return;

  const file = event.dataTransfer.files[0];

  if (file) {
    await requestImageLoad(file);
  }
}


/*
────────────────────────────────────────────
3. Shared Header Controls
────────────────────────────────────────────
*/

function handleThemeButtonClick(event) {
  event.stopPropagation();

  if (isMeteringSetupActive()) return;
  if (isProjectInfoOpen()) return;

  state.theme =
    state.theme === "light"
      ? "dark"
      : "light";

  document.body.classList.toggle(
    "dark",
    state.theme === "dark"
  );

  render();
}


function handleExportButtonClick(event) {
  event.stopPropagation();

  if (isMeteringSetupActive()) return;
  if (isProjectInfoOpen()) return;
  if (isExportWorkspaceOpen()) return;

  if (typeof closeLocationPanel === "function") {
    closeLocationPanel();
  }
  openExportWorkspace();
}


/*
────────────────────────────────────────────
4. Canvas Recording Interaction
────────────────────────────────────────────
*/

/*
  Handles main canvas clicks during Spot Reading Recording:
  - reopen collapsed Spot Readings
  - place moved Spot Readings
  - close an open picker
  - start a new Spot Reading measurement
*/
function handleCanvasClick(event) {
  if (isProjectInfoOpen()) {
    event.stopPropagation();
    return;
  }

  if (!isRecordingPhaseActive()) {
    event.stopPropagation();
    return;
  }

  event.stopPropagation();

  const menuWasOpen =
    isAddMenuOpen() ||
    isAddToProjectMenuOpen();

  closeHeaderMenus();

  if (menuWasOpen) {
    return;
  }

  const point = getCanvasPoint(event);
  if (!point) return;

  const collapsedMarker =
    getCollapsedMarkerAtPoint(point);

  if (collapsedMarker) {
    collapsedMarker.collapsed = false;
    state.selectedId = collapsedMarker.id;

    render();
    return;
  }

  if (state.moveMarkerId) {
    moveMarker(
      state.moveMarkerId,
      point
    );

    state.moveMarkerId = null;

    hideMoveCursor();
    hidePicker();
    render();

    return;
  }

  if (isPickerOpen()) {
    hidePicker();
    return;
  }

  state.pendingPoint = point;
  showValuePicker(event);
}


/*
────────────────────────────────────────────
5. Picker Selection Routing
────────────────────────────────────────────
*/

/*
  Applies selectable Recording picker options.

  Picker rendering remains in picker.js. This module owns only the
  Recording workflow effects of selected values and menu actions.
*/
function handleRecordingPickerClick(event) {
  if (!isRecordingPhaseActive()) {
    return;
  }

  event.stopPropagation();

  const apertureOption =
    event.target.closest("[data-aperture]");

  if (apertureOption) {
    createMarker(
      state.pendingPoint,
      apertureOption.dataset.aperture
    );

    hidePicker();
    render();

    return;
  }

  const menuAction =
    event.target.closest(
      "[data-menu-action]"
    );

  if (menuAction) {
    if (menuAction.disabled) return;

    handleMarkerMenuAction(
      menuAction.dataset.menuAction,
      event
    );
  }
}


/*
────────────────────────────────────────────
6. Spot Reading Menu Interaction
────────────────────────────────────────────
*/

/*
  Opens a Spot Reading menu during Recording or closes the picker after
  an outside click.
*/
function handleRecordingDocumentClick(event) {
  const bubble =
    event.target.closest(".bubble");

  if (bubble) {
    if (!isRecordingPhaseActive()) return;
    if (isProjectInfoOpen()) return;

    event.stopPropagation();

    selectMarker(
      bubble.dataset.id
    );

    showMarkerMenu(
      event,
      bubble.dataset.id
    );

    render();
    return;
  }

  if (!event.target.closest("#picker")) {
    hidePicker();
  }
}


/*
────────────────────────────────────────────
7. Workflow Initialization
────────────────────────────────────────────
*/

/*
  Binds the Recording workflow exactly once.

  Centralized initialization prevents accidental duplicate canvas and
  document listeners during later architectural work.
*/
function initializeRecordingWorkflow() {
  if (recordingWorkflowInitialized) {
    return;
  }

  recordingWorkflowInitialized = true;

  welcomeLoad.onclick =
    handleWelcomeLoadClick;

  fileInput.onchange =
    handleFileInputChange;

  stage.addEventListener(
    "dragover",
    handleStageDragOver
  );

  stage.addEventListener(
    "drop",
    handleStageDrop
  );

  themeBtn.onclick =
    handleThemeButtonClick;

  exportBtn.onclick =
    handleExportButtonClick;

  canvas.addEventListener(
    "click",
    handleCanvasClick
  );

  picker.addEventListener(
    "click",
    handleRecordingPickerClick
  );

  document.addEventListener(
    "click",
    handleRecordingDocumentClick
  );
}