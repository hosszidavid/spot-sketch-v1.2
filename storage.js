"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Storage

Purpose:
Handles persistent local browser storage and lightweight schema migration.

Table of Contents:
1. Storage Constants
2. Save Local App Data
3. Load Local App Data
4. Stored Preference Normalization

Owns:
- saving persistent app data to localStorage
- loading persistent app data from localStorage
- local storage schema version
- persistent interface preference normalization

Does NOT own:
- UI
- rendering
- project editing logic
- image or Spot Reading project persistence

Dependencies:
- data.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Storage Constants
────────────────────────────────────────────
*/

/*
  Main localStorage key for Spot Sketch.
*/
const SPOT_SKETCH_STORAGE_KEY = "spotSketchData";


/*
  Version of the small local-preferences storage schema.

  Project content is stored separately in the versioned .spotsketch document.
  This schema is intentionally limited to lightweight local preferences.
*/
const SPOT_SKETCH_STORAGE_SCHEMA_VERSION = 1;


/*
────────────────────────────────────────────
2. Save Local App Data
────────────────────────────────────────────
*/

/*
  Saves persistent app data to localStorage.

  Spot Reading and image data are intentionally not included here. They
  belong to the versioned .spotsketch project document.
*/
function saveLocalAppData() {
  const data = {
    schemaVersion: SPOT_SKETCH_STORAGE_SCHEMA_VERSION,
    library: state.library,
    preferences: state.preferences
  };

  try {
    localStorage.setItem(
      SPOT_SKETCH_STORAGE_KEY,
      JSON.stringify(data)
    );
    return true;
  } catch (error) {
    console.warn("Could not save Spot Sketch local data.", error);
    return false;
  }
}


/*
────────────────────────────────────────────
3. Load Local App Data
────────────────────────────────────────────
*/

/*
  Loads persistent app data from localStorage.

  If the stored data is missing or invalid, the app continues with the
  defaults from data.js. Existing unversioned data remains supported.
*/
function loadLocalAppData() {
  try {
    const raw = localStorage.getItem(SPOT_SKETCH_STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);

    if (data.library) {
      state.library = data.library;
    }

    if (data.preferences) {
      state.preferences = {
        ...state.preferences,
        ...data.preferences
      };
    }

    normalizeStoredPreferences();
    return true;
  } catch (error) {
    console.warn(
      "Could not load Spot Sketch local data.",
      error
    );
    return false;
  }
}


/*
────────────────────────────────────────────
4. Stored Preference Normalization
────────────────────────────────────────────
*/

/*
  Keeps stored interface preferences inside the supported value set.
*/
function normalizeStoredPreferences() {
  if (!state.preferences) {
    state.preferences = {
      interfaceMode: INTERFACE_MODES.FULL,
      calculationGuidance: {
        setupSeen: false,
        modeSeen: false
      }
    };

    return;
  }

  if (
    !Object.values(INTERFACE_MODES).includes(
      state.preferences.interfaceMode
    )
  ) {
    state.preferences.interfaceMode =
      INTERFACE_MODES.FULL;
  }

  const guidance = state.preferences.calculationGuidance;

  state.preferences.calculationGuidance = {
    setupSeen: Boolean(guidance?.setupSeen),
    modeSeen: Boolean(guidance?.modeSeen)
  };
}