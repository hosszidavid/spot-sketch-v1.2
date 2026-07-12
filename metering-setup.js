"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Metering Setup

Purpose:
Owns Initial Metering Setup selection, confirmation, and Restart Metering.

Table of Contents:
1. Module State and Elements
2. Workflow Presentation
3. Setup Option Rendering
4. Setup Interaction
5. Restart Metering
6. Module Initialization

Owns:
- temporary Initial Metering Setup choices
- setup overlay visibility and content
- explicit Start Metering confirmation
- Restart Metering confirmation and reset
- workflow phase data attributes on <body>

Does NOT own:
- image decoding
- Spot Reading creation internals
- Spot Reading picker rendering
- Calculation Mode
- project metadata
- export behavior

Dependencies:
- data.js
- exposure.js
- dialog.js
- markers.js
- picker-core.js
- render.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Module State and Elements
────────────────────────────────────────────
*/

let meteringSetupInitialized = false;
let meteringSetupListsCentered = false;

const meteringSetupOverlay =
  document.getElementById("meteringSetupOverlay");

const meteringSetupIsoValue =
  document.getElementById("meteringSetupIsoValue");

const meteringSetupShutterValue =
  document.getElementById("meteringSetupShutterValue");

const meteringSetupIsoOptions =
  document.getElementById("meteringSetupIsoOptions");

const meteringSetupShutterOptions =
  document.getElementById("meteringSetupShutterOptions");

const meteringSetupSummary =
  document.getElementById("meteringSetupSummary");

const meteringSetupStartBtn =
  document.getElementById("meteringSetupStartBtn");

const restartMeteringBtn =
  document.getElementById("restartMeteringBtn");


/*
────────────────────────────────────────────
2. Workflow Presentation
────────────────────────────────────────────
*/

/*
  Returns whether the Initial Metering Setup overlay currently owns
  interaction.
*/
function isMeteringSetupActive() {
  return Boolean(
    state.imageCanvas &&
    isWorkflowPhase(
      WORKFLOW_PHASES.METERING_SETUP
    )
  );
}


/*
  Synchronizes stable workflow attributes used by present and future UI.
*/
function syncWorkflowDomState() {
  document.body.dataset.workflowPhase =
    state.workflow.phase;

  document.body.dataset.interfaceMode =
    state.preferences.interfaceMode;

  document.body.classList.toggle(
    "metering-setup-active",
    isMeteringSetupActive()
  );
}


/*
  Updates setup overlay visibility, selected values, summary and button
  state without confirming any draft value.
*/
function updateMeteringSetupUi() {
  if (!state.imageCanvas) {
    setWorkflowPhase(
      WORKFLOW_PHASES.WELCOME
    );
  } else if (
    !hasInitialMeteringSetup() &&
    !isWorkflowPhase(
      WORKFLOW_PHASES.METERING_SETUP
    )
  ) {
    setWorkflowPhase(
      WORKFLOW_PHASES.METERING_SETUP
    );
  }

  const shouldShow =
    isMeteringSetupActive();

  if (meteringSetupOverlay) {
    meteringSetupOverlay.hidden =
      !shouldShow;
  }

  syncWorkflowDomState();

  if (!shouldShow) {
    meteringSetupListsCentered = false;
    return;
  }

  renderMeteringSetupOptions();

  if (!meteringSetupListsCentered) {
    meteringSetupListsCentered = true;
    centerInitialMeteringSetupLists();
  }

  const draft =
    state.workflow.meteringSetupDraft;

  if (meteringSetupIsoValue) {
    meteringSetupIsoValue.textContent =
      draft.iso
        ? `ISO ${draft.iso}`
        : "Not selected";
  }

  if (meteringSetupShutterValue) {
    meteringSetupShutterValue.textContent =
      draft.shutter
        ? formatShutterLabel(draft.shutter)
        : "Not selected";
  }

  const selectionComplete =
    isMeteringSetupDraftComplete();

  if (meteringSetupStartBtn) {
    meteringSetupStartBtn.disabled =
      !selectionComplete;
  }

  if (meteringSetupSummary) {
    const summaryValue =
      meteringSetupSummary.querySelector(
        "strong"
      );

    if (summaryValue) {
      summaryValue.textContent =
        selectionComplete
          ? `ISO ${draft.iso} · ${formatShutterLabel(draft.shutter)}`
          : "Select ISO and shutter speed";
    }
  }
}


/*
────────────────────────────────────────────
3. Setup Option Rendering
────────────────────────────────────────────
*/

/*
  Renders dedicated ISO and shutter lists for Initial Metering Setup.

  These controls are deliberately separate from floating pickers so both
  source values remain visible and reviewable before confirmation.
*/
function renderMeteringSetupOptions() {
  if (
    !meteringSetupIsoOptions ||
    !meteringSetupShutterOptions
  ) {
    return;
  }

  const draft =
    state.workflow.meteringSetupDraft;

  /*
    Re-rendering selected states must not reset either list to the top.
    Preserve the user's viewport before replacing the option markup.
  */
  const isoScrollTop = meteringSetupIsoOptions.scrollTop;
  const shutterScrollTop = meteringSetupShutterOptions.scrollTop;

  meteringSetupIsoOptions.innerHTML =
    ISO_VALUES.map(value => {
      const selected =
        String(draft.iso) ===
        String(value);

      return `
        <button
          class="metering-setup-option ${selected ? "is-selected" : ""}"
          type="button"
          data-metering-setup-iso="${value}"
          aria-pressed="${selected}">
          ISO ${value}
        </button>
      `;
    }).join("");

  meteringSetupShutterOptions.innerHTML =
    SHUTTER_VALUES
      .filter(value =>
        value !== "B" &&
        value !== "0"
      )
      .map(value => {
        const selected =
          String(draft.shutter) ===
          String(value);

        return `
          <button
            class="
              metering-setup-option
              ${FULL_STOP_SHUTTERS.has(value) ? "is-full-stop" : ""}
              ${selected ? "is-selected" : ""}
            "
            type="button"
            data-metering-setup-shutter="${value}"
            aria-pressed="${selected}">
            ${formatShutterLabel(value)}
          </button>
        `;
      }).join("");

  meteringSetupIsoOptions.scrollTop = isoScrollTop;
  meteringSetupShutterOptions.scrollTop = shutterScrollTop;
}




/*
  Initial Setup opens with the most common field values centered without
  selecting them. This keeps the smaller lists immediately useful.
*/
function centerInitialMeteringSetupLists() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      meteringSetupIsoOptions
        ?.querySelector('[data-metering-setup-iso="200"]')
        ?.scrollIntoView({
          block: "center",
          behavior: "auto"
        });

      meteringSetupShutterOptions
        ?.querySelector('[data-metering-setup-shutter="1/125"]')
        ?.scrollIntoView({
          block: "center",
          behavior: "auto"
        });
    });
  });
}


/*
────────────────────────────────────────────
4. Setup Interaction
────────────────────────────────────────────
*/

function handleMeteringSetupIsoClick(event) {
  const option = event.target.closest(
    "[data-metering-setup-iso]"
  );

  if (!option) return;

  const selectedValue =
    ISO_VALUES.find(value =>
      String(value) ===
      option.dataset.meteringSetupIso
    );

  if (selectedValue === undefined) {
    return;
  }

  setMeteringSetupDraftIso(
    selectedValue
  );

  updateMeteringSetupUi();
}


function handleMeteringSetupShutterClick(event) {
  const option = event.target.closest(
    "[data-metering-setup-shutter]"
  );

  if (!option) return;

  const selectedValue =
    SHUTTER_VALUES.find(value =>
      String(value) ===
      option.dataset.meteringSetupShutter
    );

  if (selectedValue === undefined) {
    return;
  }

  setMeteringSetupDraftShutter(
    selectedValue
  );

  updateMeteringSetupUi();
}


/*
  Confirms the draft and begins Spot Reading Recording.
*/
function handleStartMeteringClick() {
  if (!confirmMeteringSetup()) {
    return;
  }

  updateMeteringSetupUi();
  render();
}


/*
────────────────────────────────────────────
5. Restart Metering
────────────────────────────────────────────
*/

/*
  Clears the current Spot Reading set and opens a fresh Initial Metering
  Setup while preserving the image, Image Identifier and Gear Settings.
*/
function restartMetering() {
  hideMoveCursor();
  hidePicker();

  resetMarkers();
  beginMeteringSetup();

  updateMeteringSetupUi();
  render();
}


/*
  Requests explicit confirmation before deleting the current measurement
  set.
*/
function requestRestartMetering(event) {
  if (event) {
    event.stopPropagation();
  }

  if (
    !state.imageCanvas ||
    !hasInitialMeteringSetup() ||
    isMeteringSetupActive()
  ) {
    return;
  }

  closeHeaderMenus();
  hidePicker();

  const readingCount =
    state.markers.length;

  showDialog({
    title: "Restart Metering?",

    message:
      readingCount > 0
        ? `This will delete ${readingCount} Spot Reading${readingCount === 1 ? "" : "s"} and replace the Initial Metering Setup. Gear Settings and Image Identifier will remain.`
        : "This will replace the Initial Metering Setup. Gear Settings and Image Identifier will remain.",

    okText: "Restart Metering",
    cancelText: "Cancel",
    danger: readingCount > 0,

    onConfirm: () => {
      restartMetering();
    }
  });
}


/*
────────────────────────────────────────────
6. Module Initialization
────────────────────────────────────────────
*/

function initializeMeteringSetup() {
  if (meteringSetupInitialized) {
    return;
  }

  meteringSetupInitialized = true;

  if (meteringSetupIsoOptions) {
    meteringSetupIsoOptions.addEventListener(
      "click",
      handleMeteringSetupIsoClick
    );
  }

  if (meteringSetupShutterOptions) {
    meteringSetupShutterOptions.addEventListener(
      "click",
      handleMeteringSetupShutterClick
    );
  }

  if (meteringSetupStartBtn) {
    meteringSetupStartBtn.addEventListener(
      "click",
      handleStartMeteringClick
    );
  }

  if (restartMeteringBtn) {
    restartMeteringBtn.addEventListener("click", requestRestartMetering);
  }

  if (initialMeteringDisplay) {
    initialMeteringDisplay.addEventListener("click", event => {
      event.stopPropagation();
      if (initialMeteringDisplay.disabled) return;
      requestRestartMetering();
    });
  }

  updateMeteringSetupUi();
}