"use strict";

/*
==========================================================
SPOT SKETCH

Module:
App

Purpose:
Initializes top-level modules and owns application-wide events that do
not belong to a specific workflow.

Table of Contents:
1. Shared App Helpers
2. Keyboard Handling
3. Resize Handling
4. Application Startup

Owns:
- startup sequence
- application-wide Escape handling
- resize handling
- shared editable-target helper

Does NOT own:
- shared DOM reference creation
- Recording workflow and Initial Metering Setup
- file loading events
- header controls
- canvas recording interactions
- picker selection routing
- Export Workspace internals
- Project Info or Gear Library internals
- picker rendering
- Spot Reading movement internals
- image loading internals
- storage internals
- rendering internals

Dependencies:
- responsive.js
- mobile-shell.js
- dom.js
- data.js
- picker-core.js
- storage.js
- render.js
- markers.js
- project.js
- project-library.js
- project-document.js
- header.js
- welcome.js
- export-workspace.js
- metering-setup.js
- recording-workflow.js
- recording-touch.js
- image-crop.js
- calculation-workflow.js
- calculation-ui.js
- calculation-mobile.js
- notifications.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Shared App Helpers
────────────────────────────────────────────
*/

/*
  Returns whether a keyboard event started from an editable field.

  Editable fields keep ownership of their normal keyboard behavior.
*/
function isEditableEventTarget(event) {
  const target = event.target;

  return Boolean(
    target &&
    (
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("[contenteditable='true']")
    )
  );
}


/*
────────────────────────────────────────────
2. Keyboard Handling
────────────────────────────────────────────
*/

/*
  Global keyboard shortcuts.

  Escape:
  - clear selection
  - cancel Spot Reading move mode
  - close picker
*/
document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    typeof isProjectInfoOpen === "function" &&
    isProjectInfoOpen()
  ) {
    requestCancelProjectInfoPanel();
    return;
  }

  /*
    Escape closes the Export Workspace before any canvas-related
    keyboard action is processed.
  */
  if (
    event.key === "Escape" &&
    typeof isProjectManagerOpen === "function" &&
    isProjectManagerOpen()
  ) {
    closeProjectManager();
    return;
  }

  if (
    event.key === "Escape" &&
    isExportWorkspaceOpen()
  ) {
    closeExportWorkspace();
    return;
  }

  /*
    No global keyboard shortcut should affect the canvas while
    the Export Workspace is open.
  */
  if (isExportWorkspaceOpen()) {
    return;
  }

  if (isEditableEventTarget(event)) return;

  if (event.key === "Escape" && typeof getOpenTransientSurface === "function") {
    const surface = getOpenTransientSurface();
    if (surface) {
      event.preventDefault();
      surface.close();
      return;
    }
  }

  if (
    event.key === "Escape" &&
    isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)
  ) {
    cancelCalculationSetup();
    return;
  }

  if (event.key === "Escape") {
    state.selectedId = null;
    state.moveMarkerId = null;

    hideMoveCursor();
    hidePicker();
    render();
  }
});


/*
────────────────────────────────────────────
3. Resize Handling
────────────────────────────────────────────
*/

/*
  Keeps the image, Spot Reading bubbles and an open picker aligned after
  the Responsive Foundation commits a new visual viewport state.

  The responsive module also observes VisualViewport changes caused by
  mobile browser chrome and the software keyboard, so application modules
  no longer need separate resize and orientation listeners.
*/
window.addEventListener("spot-sketch:viewport-change", () => {
  fitImage();
  drawBubbles();

  if (typeof isPickerOpen === "function" && isPickerOpen()) {
    if (picker.classList.contains("picker-centered")) {
      centerPickerInStage();
    } else if (!picker.classList.contains("picker-viewport-fixed")) {
      keepPickerInside();
    }
  }
});


/*
────────────────────────────────────────────
4. Application Startup
────────────────────────────────────────────
*/

/*
  Startup order matters:
  1. initialize responsive viewport contracts
  2. load saved local data
  3. initialize Project Info and Metering Setup
  4. initialize Recording Workflow and Header menus
  5. refresh project and workflow UI
  6. start welcome animation
*/
initializeResponsiveFoundation();
loadLocalAppData();

initializeUnavailableInteractions();
initializeProjectPanel();
initializeMeteringSetup();
initializeRecordingWorkflow();
initializeRecordingTouchWorkflow();
initializeImageCropWorkflow();
initializeImageReplacement();
initializeCalculationWorkflow();
initializeCalculationMobileLayout();
initializeHeaderMenus();
initializeProjectManager();
initializeMobileApplicationShell();
initializeMobileProjectSurfaces();

updateLimitButtons();
updateMeteringSetupUi();
updateCalculationUi();
render();

animateWelcomeLogo();