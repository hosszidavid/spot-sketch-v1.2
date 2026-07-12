"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Data

Purpose:
Defines the central runtime state and basic Spot Reading state operations.

Table of Contents:
1. State Constants
2. App State
3. Workflow and Metering Setup Helpers
4. Spot Reading Creation
6. Spot Reading Selection
7. Spot Reading Deletion
8. Spot Reading Reset

Owns:
- central runtime state
- workflow phase constants
- interface mode constants
- Initial Metering Setup state
- project metadata default shape
- library default shape
- Spot Reading creation
- Spot Reading selection
- Spot Reading deletion
- Spot Reading reset

Does NOT own:
- rendering
- picker UI
- Spot Reading menu UI
- exposure calculations
- localStorage persistence
- project info form behavior

Dependencies:
- none
==========================================================
*/


/*
────────────────────────────────────────────
1. State Constants
────────────────────────────────────────────
*/

/*
  Explicit workflow phases provide stable integration points for:
  - the rebuilt Calculation Mode
  - future notification rules
  - mobile-specific presentation
  - future Simple Mode presentation
*/
const WORKFLOW_PHASES = Object.freeze({
  WELCOME: "welcome",
  METERING_SETUP: "metering-setup",
  RECORDING: "recording",
  CALCULATION_SETUP: "calculation-setup",
  CALCULATION: "calculation"
});


/*
  Interface modes are stored separately from workflow phases.

  Only Full Mode is currently active. Simple Mode will be introduced
  later without changing the underlying photographic workflow.
*/
const INTERFACE_MODES = Object.freeze({
  FULL: "full",
  SIMPLE: "simple"
});


/*
────────────────────────────────────────────
1.5. Shared Entity Identity
────────────────────────────────────────────
*/

/*
  Creates a stable unique ID for runtime and persisted Spot Sketch entities.
  crypto.randomUUID() is preferred where available, with a safe fallback for
  local-file, restricted, or older browser environments.
*/
function createSpotSketchEntityId(prefix = "entity") {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return (
    `${prefix}-${Date.now()}-` +
    `${Math.random().toString(16).slice(2)}`
  );
}


/*
────────────────────────────────────────────
2. App State
────────────────────────────────────────────
*/

/*
  Central runtime state for the whole app.

  The structure intentionally separates:
  - workflow state
  - fixed Initial Metering Setup
  - immutable Spot Reading source measurements
  - project metadata
  - eventual document / export information
*/
const state = {
  imageCanvas: null,

  /*
    Source metadata for the currently loaded image. The working image
    itself lives in imageCanvas and is embedded into .spotsketch files.
  */
  imageSource: {
    filename: "",
    mimeType: "",
    originalWidth: null,
    originalHeight: null
  },

  /*
    Runtime identity of the open project document. It is not a visual
    UI state and becomes part of the exported .spotsketch document.
  */
  projectSession: {
    id: null,
    name: "",
    createdAt: null,
    updatedAt: null,
    activeSpotSketchId: null
  },

  workflow: {
    phase: WORKFLOW_PHASES.WELCOME,

    /*
      Temporary Initial Metering Setup choices.

      Draft values remain separate from the confirmed setup until the
      user explicitly presses Start Metering.
    */
    meteringSetupDraft: {
      iso: null,
      shutter: null
    }
  },

  /*
    Temporary reference and Zone choices used only while the user is
    preparing Calculation Mode. Draft choices never affect the confirmed
    calculation until Start Calculation is pressed.
  */
  calculationDraft: {
    referenceSpotReadingId: null,
    referenceZone: null
  },

  /*
    Confirmed Calculation Mode state.

    Calculated Exposure remains null until Reference + Zone are confirmed.
    It is always stored separately from the original Spot Reading measurements.
  */
  calculation: {
    referenceSpotReadingId: null,
    referenceZone: null,

    /*
      Defines which exposure value is directly controlled by the user.

      shutter:
      ISO + shutter are editable; aperture is calculated.

      aperture:
      ISO + aperture are editable; shutter is calculated.
    */
    controlMode: "shutter",

    /*
      The active Calculated Exposure. This object is created only after
      Reference + Zone have been confirmed.
    */
    exposure: null
  },

  preferences: {
    interfaceMode: INTERFACE_MODES.FULL,

    /*
      Lightweight, device-local onboarding state. These flags are stored
      only in local preferences and never become part of a .spotsketch file.
    */
    calculationGuidance: {
      setupSeen: false,
      modeSeen: false
    }
  },

  initialMeteringSetup: {
    iso: null,
    shutter: null
  },

  markers: [],
  nextNumber: 1,
  selectedId: null,
  pendingPoint: null,
  moveMarkerId: null,

  theme: "light",

  /*
    Current project metadata.

    These values document the image and shooting setup, but they do not
    directly change exposure calculations.
  */
  project: {
    imageIdentifier: "",

    lens: {
      name: "",
      notes: "",

      warningLimits: {
        aperture: {
          min: "0.0",
          max: "F"
        },

        shutter: {
          min: "B",
          max: "0"
        }
      }
    },

    filter: {
      name: "",
      evCorrection: "",
      notes: ""
    },

    camera: {
      name: "",
      notes: ""
    },

    filmHolder: {
      name: "",
      notes: ""
    },

    film: {
      name: "",
      boxIso: "",
      notes: ""
    },

    lightMeter: {
      name: "",
      notes: ""
    },

    lighting: {
      description: ""
    },

    gearNotes: "",

    /*
      Reserved Spot Sketch location structure. The UI will be added near
      Image Identifier in a later package.
    */
    location: {
      name: "",
      latitude: null,
      longitude: null,
      altitude: null,
      accuracy: null,
      notes: ""
    }
  },

  library: {
    lenses: [],
    filters: [],
    cameras: [],
    filmHolders: [],
    films: [],
    lightMeters: []
  },

  /*
    Actual Exposure records what was really used when the photograph
    was exposed.

    This data currently lives in the Export Workspace, but it belongs to
    the Spot Sketch document model rather than to any one export format.
  */
  actualExposure: {
    status: "not-recorded",
    iso: null,
    shutter: null,
    aperture: null,

    /*
      Explains the photographic decision behind the recorded
      Actual Exposure.
    */
    notes: ""
  },

  /*
    Controls which major information groups appear in the future
    Spot Sketch Document.
  */
  exportOptions: {
    exportType: "quick",
    includeImageAndMarkers: true,
    includeMeteringInformation: true,
    includeActualExposure: true,
    includeGearSettings: true,
    includeDocumentNotes: true,
    includeDevelopmentNotes: true,
    documentScope: "current",
    documentFormat: "pdf",
    documentOrientation: "auto"
  },

  /*
    General notes about the photograph, scene, workflow,
    development plan or printing intention.
  */
  documentNotes: "",

  /*
    Dedicated darkroom / processing notes. This remains a separate
    document module and is always visible in the exported record.
  */
  developmentNotes: ""
};


/*
────────────────────────────────────────────
3. Workflow and Metering Setup Helpers
────────────────────────────────────────────
*/

/*
  Changes the active workflow phase only to a known phase value.
*/
function setWorkflowPhase(phase) {
  if (!Object.values(WORKFLOW_PHASES).includes(phase)) {
    return false;
  }

  state.workflow.phase = phase;
  return true;
}


/*
  Returns whether the app is currently in the requested workflow phase.
*/
function isWorkflowPhase(phase) {
  return state.workflow.phase === phase;
}


/*
  Returns whether the fixed Initial Metering Setup is complete.
*/
function hasInitialMeteringSetup() {
  return Boolean(
    state.initialMeteringSetup.iso &&
    state.initialMeteringSetup.shutter
  );
}


/*
  Returns whether both temporary setup values have been selected.
*/
function isMeteringSetupDraftComplete() {
  const draft =
    state.workflow.meteringSetupDraft;

  return Boolean(
    draft.iso &&
    draft.shutter
  );
}


/*
  Starts a fresh Initial Metering Setup.

  The previous confirmed setup is cleared immediately. The new choices
  remain drafts until Start Metering is explicitly confirmed.
*/
function beginMeteringSetup() {
  state.initialMeteringSetup.iso = null;
  state.initialMeteringSetup.shutter = null;

  state.workflow.meteringSetupDraft.iso = null;
  state.workflow.meteringSetupDraft.shutter = null;

  setWorkflowPhase(
    WORKFLOW_PHASES.METERING_SETUP
  );
}


/*
  Stores a temporary Metering ISO selection.
*/
function setMeteringSetupDraftIso(iso) {
  if (
    !isWorkflowPhase(
      WORKFLOW_PHASES.METERING_SETUP
    )
  ) {
    return;
  }

  state.workflow.meteringSetupDraft.iso =
    iso || null;
}


/*
  Stores a temporary Metering Shutter selection.
*/
function setMeteringSetupDraftShutter(shutter) {
  if (
    !isWorkflowPhase(
      WORKFLOW_PHASES.METERING_SETUP
    )
  ) {
    return;
  }

  state.workflow.meteringSetupDraft.shutter =
    shutter || null;
}


/*
  Confirms the temporary choices as the fixed Initial Metering Setup.

  Returns false when the draft is incomplete.
*/
function confirmMeteringSetup() {
  if (!isMeteringSetupDraftComplete()) {
    return false;
  }

  const draft =
    state.workflow.meteringSetupDraft;

  state.initialMeteringSetup.iso =
    draft.iso;

  state.initialMeteringSetup.shutter =
    draft.shutter;

  draft.iso = null;
  draft.shutter = null;

  setWorkflowPhase(
    WORKFLOW_PHASES.RECORDING
  );

  return true;
}


/*
────────────────────────────────────────────
4. Calculation Setup State
────────────────────────────────────────────
*/

/*
  Clears every unconfirmed Calculation Setup choice.
*/
function resetCalculationDraft() {
  state.calculationDraft.referenceSpotReadingId = null;
  state.calculationDraft.referenceZone = null;
}


/*
  Selects the draft Reference Spot Reading.

  Changing the draft reference also clears the previous draft Zone so the
  final confirmation can never combine unrelated choices accidentally.
*/
function setCalculationDraftReference(markerId) {
  const marker = state.markers.find(
    item => item.id === markerId
  );

  if (!marker) return false;

  state.calculationDraft.referenceSpotReadingId = marker.id;
  state.calculationDraft.referenceZone = null;
  return true;
}


/*
  Stores a draft Reference Zone. Zone V is a valid, explicit placement.
*/
function setCalculationDraftZone(zone) {
  if (!zone || !zone.label || typeof zone.ev !== "number") {
    return false;
  }

  state.calculationDraft.referenceZone = {
    label: zone.label,
    ev: zone.ev
  };

  return true;
}


/*
  Returns whether Calculation Setup has both required decisions.
*/
function isCalculationDraftComplete() {
  return Boolean(
    state.calculationDraft.referenceSpotReadingId &&
    state.calculationDraft.referenceZone
  );
}


/*
  Confirms the draft as the active Calculation Mode reference placement.
*/
function confirmCalculationDraft() {
  if (!isCalculationDraftComplete()) {
    return false;
  }

  state.calculation.referenceSpotReadingId =
    state.calculationDraft.referenceSpotReadingId;

  state.calculation.referenceZone = {
    label: state.calculationDraft.referenceZone.label,
    ev: state.calculationDraft.referenceZone.ev
  };

  state.calculation.controlMode = "shutter";
  state.calculation.exposure = null;

  resetCalculationDraft();
  setWorkflowPhase(WORKFLOW_PHASES.CALCULATION);
  return true;
}




/*
  Changes the Calculated Exposure control mode.
*/
function setCalculationControlMode(mode) {
  if (mode !== "shutter" && mode !== "aperture") {
    return false;
  }

  state.calculation.controlMode = mode;
  return true;
}


/*
  Stores a complete Calculated Exposure object.
*/
function setCalculatedExposure(exposure) {
  if (
    !exposure ||
    !exposure.iso ||
    !exposure.shutter ||
    !exposure.aperture
  ) {
    return false;
  }

  state.calculation.exposure = {
    iso: exposure.iso,
    shutter: exposure.shutter,
    aperture: exposure.aperture
  };

  return true;
}


/*
  Clears the complete confirmed Calculation Mode state.
*/
function resetCalculation() {
  state.calculation.referenceSpotReadingId = null;
  state.calculation.referenceZone = null;
  state.calculation.controlMode = "shutter";
  state.calculation.exposure = null;
  resetCalculationDraft();
}


/*
────────────────────────────────────────────
5. Spot Reading Creation
────────────────────────────────────────────
*/

/*
  Creates a new Spot Reading from a normalized image point and measured
  aperture.

  Every Spot Reading stores its original source measurement. Future
  Calculation Mode data must remain separate and must never overwrite it.
*/
function createMarker(point, measuredAperture) {
  if (!isWorkflowPhase(WORKFLOW_PHASES.RECORDING)) return;
  if (!hasInitialMeteringSetup()) return;
  if (!point || !measuredAperture) return;

  const marker = {
    id: createSpotSketchEntityId("reading"),
    number: state.nextNumber++,
    x: point.x,
    y: point.y,
    collapsed: false,

    measurement: {
      iso: state.initialMeteringSetup.iso,
      shutter: state.initialMeteringSetup.shutter,
      aperture: measuredAperture
    }
  };

  state.markers.push(marker);
  state.selectedId = marker.id;
}


/*
────────────────────────────────────────────
6. Spot Reading Selection
────────────────────────────────────────────
*/

/*
  Returns the currently selected Spot Reading, if there is one.
*/
function getSelectedMarker() {
  return state.markers.find(marker => marker.id === state.selectedId);
}


/*
  Selects a Spot Reading by id.
*/
function selectMarker(id) {
  state.selectedId = id;
}


/*
────────────────────────────────────────────
7. Spot Reading Deletion
────────────────────────────────────────────
*/

/*
  Deletes the currently selected Spot Reading.

  Deletion is intentionally available only through the Spot Reading menu.
*/
function deleteSelectedMarker() {
  if (!state.selectedId) return;

  const deletedId = state.selectedId;

  state.markers = state.markers.filter(
    marker => marker.id !== deletedId
  );

  if (state.calculation.referenceSpotReadingId === deletedId) {
    resetCalculation();
  }

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;
}


/*
────────────────────────────────────────────
8. Spot Reading Reset
────────────────────────────────────────────
*/

/*
  Removes all Spot Readings and clears Spot Reading-related temporary
  state.

  Used when a new image is loaded and later by Restart Metering.
*/
function resetMarkers() {
  state.markers = [];
  state.nextNumber = 1;
  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;
  resetCalculation();
}