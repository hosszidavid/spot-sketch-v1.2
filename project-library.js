"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Project Library

Purpose:
Owns reusable Gear Settings library items and Project Info autocomplete.

Table of Contents:
1. Library Field Configuration
2. Library Autocomplete
3. Library Item Creation
4. Library Saving
5. Library Applying

Owns:
- independent Lens, Filter, Camera, Film Holder and Film libraries
- Project Info autocomplete lists
- library item creation, updating, applying and deletion
- recent-use ordering and duplicate-name normalization

Does NOT own:
- Project Info panel opening and closing
- Project Info Save / Cancel / Clear workflow
- warning limit editing UI
- exposure calculations
- canvas rendering
- image loading

Dependencies:
- data.js
- storage.js
- dialog.js
- render.js
- project.js
==========================================================
*/

/*
────────────────────────────────────────────
1. Library Field Configuration
────────────────────────────────────────────
*/

/*
  Autocomplete definitions for independent metadata libraries.
*/
const PROJECT_LIBRARY_AUTOCOMPLETE_FIELDS = [
  {
    inputId: "lensNameInput",
    collection: () => state.library.lenses,
    getLabel: item => item.name,
    apply: applyLensLibraryItem
  },

  {
    inputId: "filterNameInput",
    collection: () => state.library.filters,
    getLabel: item => item.name,
    apply: applyFilterLibraryItem
  },

  {
    inputId: "cameraNameInput",
    collection: () => state.library.cameras,
    getLabel: item => item.name,
    apply: applyCameraLibraryItem
  },

  {
    inputId: "filmHolderNameInput",
    collection: () => state.library.filmHolders,
    getLabel: item => item.name,
    apply: applyFilmHolderLibraryItem
  },

  {
    inputId: "filmNameInput",
    collection: () => state.library.films,
    getLabel: item => item.name,
    apply: applyFilmLibraryItem
  },

  {
    inputId: "lightMeterNameInput",
    collection: () => state.library.lightMeters,
    getLabel: item => item.name,
    apply: applyLightMeterLibraryItem
  }
];

/*
────────────────────────────────────────────
2. Library Autocomplete
────────────────────────────────────────────
*/

/*
  Connects library autocomplete to selected Project Info fields.

  The list only appears while the Project Info panel is open.
  Selecting a row loads only that specific metadata block.
*/
function bindProjectLibraryAutocomplete() {
  for (const config of PROJECT_LIBRARY_AUTOCOMPLETE_FIELDS) {
    const input = document.getElementById(config.inputId);
    if (!input) continue;

    input.addEventListener("input", () => {
      showProjectLibraryAutocomplete(input, config);
    });

    input.addEventListener("focus", () => {
      showProjectLibraryAutocomplete(input, config);
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeProjectLibraryAutocomplete();
      }
    });
  }

  document.addEventListener("click", event => {
    const clickedAutocomplete = event.target.closest(
      ".project-library-autocomplete"
    );

    const clickedConfiguredInput = PROJECT_LIBRARY_AUTOCOMPLETE_FIELDS.some(
      config => event.target.id === config.inputId
    );

    if (!clickedAutocomplete && !clickedConfiguredInput) {
      closeProjectLibraryAutocomplete();
    }
  });
}


/*
  Shows a compact name-only autocomplete list under the active field.
*/
function showProjectLibraryAutocomplete(input, config) {
  if (!isProjectInfoOpen()) return;

  const query = input.value.trim().toLowerCase();

closeProjectLibraryAutocomplete();

const matches = config
  .collection()
  .filter(item => {
    const label = config.getLabel(item);
    if (!label) return false;

    /*
      Empty query means:
      show recent saved items immediately on focus.
    */
    if (!query) return true;

    return label.toLowerCase().includes(query);
  })
  .sort(sortLibraryItemsByRecentUse)
  .slice(0, 8);

  if (!matches.length) return;

  const list = document.createElement("div");
  list.className = "project-library-autocomplete";
  list.dataset.anchorInputId = input.id;

  for (const item of matches) {
    list.appendChild(createProjectLibraryAutocompleteRow(input, config, item));
  }

  const mobileSurface =
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive();

  if (mobileSurface) {
    list.classList.add("project-library-autocomplete-mobile");
    document.body.appendChild(list);
    positionProjectLibraryAutocomplete(list, input);
  } else {
    input.parentElement.appendChild(list);
    positionProjectLibraryAutocomplete(list, input);
  }
}

function positionProjectLibraryAutocomplete(list, input) {
  if (!list || !input) return;

  if (!list.classList.contains("project-library-autocomplete-mobile")) {
    list.style.left = `${input.offsetLeft}px`;
    list.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
    list.style.width = `${input.offsetWidth}px`;
    return;
  }

  const rect = input.getBoundingClientRect();
  const viewportHeight = Number(
    getComputedStyle(document.documentElement)
      .getPropertyValue("--app-viewport-height")
      .replace("px", "")
  ) || window.innerHeight;
  const safeTop = 8;
  const margin = 8;
  const desiredHeight = Math.min(300, Math.max(52, list.scrollHeight));
  const roomBelow = viewportHeight - rect.bottom - margin;
  const showAbove = roomBelow < Math.min(desiredHeight, 190) && rect.top > roomBelow;

  list.style.position = "fixed";
  list.style.left = `${Math.max(margin, rect.left)}px`;
  list.style.width = `${Math.max(180, Math.min(rect.width, window.innerWidth - margin * 2))}px`;
  list.style.maxHeight = `${Math.max(96, Math.min(300, showAbove ? rect.top - safeTop - margin : roomBelow))}px`;
  list.style.top = showAbove ? "auto" : `${rect.bottom + 4}px`;
  list.style.bottom = showAbove ? `${Math.max(margin, viewportHeight - rect.top + 4)}px` : "auto";
}

function repositionProjectLibraryAutocomplete() {
  const list = document.querySelector(
    ".project-library-autocomplete.project-library-autocomplete-mobile"
  );
  if (!list) return;

  const input = document.getElementById(list.dataset.anchorInputId || "");
  if (!input || !isProjectInfoOpen()) {
    closeProjectLibraryAutocomplete();
    return;
  }

  positionProjectLibraryAutocomplete(list, input);
}


/*
  Creates one autocomplete row:
  - label button loads the saved item
  - x button deletes the saved library item
*/
function createProjectLibraryAutocompleteRow(input, config, item) {
  const row = document.createElement("div");
  row.className = "project-library-autocomplete-row";

  const labelButton = document.createElement("button");
  labelButton.type = "button";
  labelButton.className = "project-library-autocomplete-label";
  labelButton.textContent = config.getLabel(item);

  labelButton.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();

    config.apply(item);

    updateProjectFields();
    updateLimitButtons();
    markProjectInfoDirty();

    closeProjectLibraryAutocomplete();
    render();
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "project-library-autocomplete-delete";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", "Delete library item");

  deleteButton.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();

    requestDeleteProjectLibraryItem(input, config, item);
  });

  row.appendChild(labelButton);
  row.appendChild(deleteButton);

  return row;
}


/*
  Asks before deleting a saved library item.
*/
function requestDeleteProjectLibraryItem(input, config, item) {
  const label = config.getLabel(item);

  showDialog({
    title: "",
    message: `Delete "${label}"?\n\nThis cannot be undone.`,
    cancelText: "Cancel",
    okText: "Delete",
    danger: true,

    onConfirm: () => {
      deleteProjectLibraryItem(config, item);
      saveLocalAppData();

      window.setTimeout(() => {
        showProjectLibraryAutocomplete(input, config);
        input.focus();
      }, 0);
    }
  });
}


/*
  Deletes one item from its own library collection.
*/
function deleteProjectLibraryItem(config, itemToDelete) {
  const collection = config.collection();
  const deleteKey = normalizeLibraryKey(config.getLabel(itemToDelete));

  const index = collection.findIndex(
    item => normalizeLibraryKey(config.getLabel(item)) === deleteKey
  );

  if (index >= 0) {
    collection.splice(index, 1);
  }
}


/*
  Closes the currently open Project Library autocomplete list.
*/
function closeProjectLibraryAutocomplete() {
  const existing = document.querySelector(".project-library-autocomplete");

  if (existing) {
    existing.remove();
  }
}


/*
  Recent saved items appear first.

  Falls back to alphabetical order.
*/
function sortLibraryItemsByRecentUse(a, b) {
  const dateA = Date.parse(a.updatedAt || a.createdAt || "") || 0;
  const dateB = Date.parse(b.updatedAt || b.createdAt || "") || 0;

  if (dateA !== dateB) {
    return dateB - dateA;
  }

  return String(a.name || "").localeCompare(String(b.name || ""));
}

/*
────────────────────────────────────────────
3. Library Item Creation
────────────────────────────────────────────
*/

/*
  Library item builders.

  Each function creates a clean reusable library item from
  the current project metadata.

  These items are independent:
  - Lens does not include filter
  - Filter does not include lens
  - Camera does not include film holder
*/

function createLensLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.lens.name.trim(),
    notes: state.project.lens.notes.trim(),

    warningLimits: structuredClone(state.project.lens.warningLimits)
  };
}


function createFilterLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.filter.name.trim(),
    notes: state.project.filter.notes.trim(),
    evCorrection: state.project.filter.evCorrection.trim()
  };
}


function createCameraLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.camera.name.trim(),
    notes: state.project.camera.notes.trim()
  };
}


function createFilmHolderLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.filmHolder.name.trim(),
    notes: state.project.filmHolder.notes.trim()
  };
}


function createFilmLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.film.name.trim(),
    boxIso: state.project.film.boxIso.trim(),
    notes: state.project.film.notes.trim()
  };
}


function createLightMeterLibraryItem() {
  ensureProjectStructure();

  return {
    id: createSpotSketchEntityId("library"),
    name: state.project.lightMeter.name.trim(),
    notes: state.project.lightMeter.notes.trim()
  };
}


/*
────────────────────────────────────────────
4. Library Saving
────────────────────────────────────────────
*/

/*
  Library save helpers.

  These functions only save the current block into its own library.
  They do not affect any other metadata block.
*/

function saveCurrentLensToLibrary() {
  const item = createLensLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.lenses, item, "name");
  saveLocalAppData();
}


function saveCurrentFilterToLibrary() {
  const item = createFilterLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.filters, item, "name");
  saveLocalAppData();
}


function saveCurrentCameraToLibrary() {
  const item = createCameraLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.cameras, item, "name");
  saveLocalAppData();
}


function saveCurrentFilmHolderToLibrary() {
  const item = createFilmHolderLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.filmHolders, item, "name");
  saveLocalAppData();
}


function saveCurrentFilmToLibrary() {
  const item = createFilmLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.films, item, "name");
  saveLocalAppData();
}

function saveCurrentLightMeterToLibrary() {
  const item = createLightMeterLibraryItem();
  if (!item.name) return;

  upsertLibraryItem(state.library.lightMeters, item, "name");
  saveLocalAppData();
}


/*
  Inserts or updates a library item.

  If another item with the same key exists, it is updated.
  If it does not exist yet, it is created.

  Timestamps are useful later for:
  - sorting by recently edited
  - showing recently used items
  - future library management
*/
function upsertLibraryItem(collection, item, keyName) {
  const key = normalizeLibraryKey(item[keyName]);
  const now = new Date().toISOString();

  const existingIndex = collection.findIndex(
    existing => normalizeLibraryKey(existing[keyName]) === key
  );

  if (existingIndex >= 0) {
    collection[existingIndex] = {
      ...collection[existingIndex],
      ...item,

      // Keep the original creation date if it exists.
      createdAt: collection[existingIndex].createdAt || now,

      // Always refresh the edit date.
      updatedAt: now
    };

    return;
  }

  collection.push({
    ...item,
    createdAt: now,
    updatedAt: now
  });
}


/*
────────────────────────────────────────────
5. Library Applying
────────────────────────────────────────────
*/

/*
  Applies one saved lens item.

  Only the Lens block is changed.
*/
function applyLensLibraryItem(item) {
  ensureProjectStructure();

  state.project.lens.name = item.name || "";
  state.project.lens.notes = item.notes || "";

  if (item.warningLimits) {
    state.project.lens.warningLimits = structuredClone(item.warningLimits);
  }
}


/*
  Applies one saved filter item.

  Only the Filter block is changed.
*/
function applyFilterLibraryItem(item) {
  ensureProjectStructure();

  state.project.filter.name = item.name || "";
  state.project.filter.notes = item.notes || "";
  state.project.filter.evCorrection = item.evCorrection || "";
}


/*
  Applies one saved camera item.

  Only the Camera block is changed.
*/
function applyCameraLibraryItem(item) {
  ensureProjectStructure();

  state.project.camera.name = item.name || "";
  state.project.camera.notes = item.notes || "";
}


/*
  Applies one saved film holder item.

  Only the Film Holder block is changed.
*/
function applyFilmHolderLibraryItem(item) {
  ensureProjectStructure();

  state.project.filmHolder.name = item.name || "";
  state.project.filmHolder.notes = item.notes || "";
}


/*
  Applies one saved film item.

  Only the Film block is changed.
*/
function applyFilmLibraryItem(item) {
  ensureProjectStructure();

  state.project.film.name = item.name || "";
  state.project.film.boxIso = item.boxIso || "";
  state.project.film.notes = item.notes || "";
}


function applyLightMeterLibraryItem(item) {
  ensureProjectStructure();

  state.project.lightMeter.name = item.name || "";
  state.project.lightMeter.notes = item.notes || "";
}


/*
  Normalizes library names for duplicate detection.

  This makes matching case-insensitive and ignores extra spaces.

  Example:
  "Nikkor W 150" and " nikkor w 150 " are treated as the same item.
*/
function normalizeLibraryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}