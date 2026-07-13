"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Project

Purpose:
Owns the Project Info panel, project metadata fields, warning limits,
and the Save / Cancel / Clear workflow.

Table of Contents:
1. Project Field Configuration
2. Project Panel Initialization
3. Project Entry and Limit Controls
4. Field Binding
5. Project State Helpers
6. Structure Migration / Defaults
7. Notes Panels
8. Warning Limits
9. Project Info Panel Workflow
10. Dirty State

Owns:
- Project Info opening and closing
- Project Info panel fields
- Save / Cancel / Clear workflow
- project metadata persistence trigger
- lens warning limits
- Project Info dirty state

Does NOT own:
- independent metadata libraries
- library autocomplete
- exposure calculations
- canvas rendering
- image loading
- Spot Reading interaction
- picker positioning

Dependencies:
- data.js
- storage.js
- dialog.js
- exposure.js
- picker-core.js
- render.js
- header.js
- recording-workflow.js
- project-library.js
==========================================================
*/

/*
────────────────────────────────────────────
1. Project Field Configuration
────────────────────────────────────────────
*/

/*
  Text and textarea fields connected directly to state.project.
*/
const PROJECT_TEXT_FIELDS = [
  { id: "cameraNameInput", path: ["camera", "name"] },
  { id: "cameraNotesInput", path: ["camera", "notes"] },
  { id: "lensNameInput", path: ["lens", "name"] },
  { id: "lensNotesInput", path: ["lens", "notes"] },
  { id: "filterNameInput", path: ["filter", "name"] },
  { id: "filterEvInput", path: ["filter", "evCorrection"] },
  { id: "filterNotesInput", path: ["filter", "notes"] },
  { id: "filmNameInput", path: ["film", "name"] },
  { id: "filmBoxIsoInput", path: ["film", "boxIso"] },
  { id: "filmNotesInput", path: ["film", "notes"] },
  { id: "filmHolderNameInput", path: ["filmHolder", "name"] },
  { id: "filmHolderNotesInput", path: ["filmHolder", "notes"] },
  { id: "lightMeterNameInput", path: ["lightMeter", "name"] },
  { id: "lightMeterNotesInput", path: ["lightMeter", "notes"] },
  { id: "lightingInput", path: ["lighting", "description"] },
  { id: "gearNotesInput", path: ["gearNotes"] }
];

let projectSavedState = null;
let projectInfoDirty = false;
let projectInfoTransaction = null;

/*
  There are no boolean Gear fields in the v1.2 baseline. An empty
  Filter field now means that no filter was recorded.
*/
const PROJECT_CHECK_FIELDS = [];

const PROJECT_NOTES_TOGGLES = [
  { buttonId: "cameraNotesBtn", panelId: "cameraNotesPopover" },
  { buttonId: "lensNotesBtn", panelId: "lensNotesPopover" },
  { buttonId: "filterNotesBtn", panelId: "filterNotesPopover" },
  { buttonId: "filmNotesBtn", panelId: "filmNotesPopover" },
  { buttonId: "filmHolderNotesBtn", panelId: "filmHolderNotesPopover" },
  { buttonId: "lightMeterNotesBtn", panelId: "lightMeterNotesPopover" },
  { buttonId: "gearNotesBtn", panelId: "gearNotesPopover" }
];

/*
────────────────────────────────────────────
2. Project Panel Initialization
────────────────────────────────────────────
*/

/*
  Initializes all project metadata UI behavior.

  Called once from app.js after local data has been loaded.
*/
function initializeProjectPanel() {
  ensureProjectStructure();

  const projectInfoMenu = document.getElementById("projectInfoMenu");
  const projectInfoOverlay = document.getElementById("projectInfoOverlay");

  /*
    Startup must always begin with the Gear Workspace fully closed.
    Keeping the DOM visibility and the body state synchronized prevents a
    visually hidden workspace from blocking Recording interaction.
  */
  document.body.classList.remove("project-info-open");

  if (projectInfoMenu) {
    projectInfoMenu.hidden = true;
  }

  if (projectInfoOverlay) {
    projectInfoOverlay.hidden = true;
  }

  bindProjectEntryControls();
  bindProjectTextFields();
  bindProjectCheckFields();
  bindProjectNotesToggles();
  bindProjectInfoActions();
  bindProjectLibraryAutocomplete();
  initializeLocationPanel();

  updateProjectFields();
  projectSavedState = structuredClone(state.project);

  ensureProjectInfoDropdownAnchor();
}


/*
────────────────────────────────────────────
3. Project Entry and Limit Controls
────────────────────────────────────────────
*/

/*
  Returns whether the Project Info panel is currently open.

  This shared query lives with the panel that owns the state, while
  Header and Recording modules may use it to block conflicting actions.
*/
function isProjectInfoOpen() {
  const menu = document.getElementById("projectInfoMenu");
  const overlay = document.getElementById("projectInfoOverlay");

  return Boolean(
    document.body.classList.contains("project-info-open") &&
    menu &&
    !menu.hidden
  );
}


/*
  Connects the Project Info entry button and the four warning-limit
  controls to their panel-owned actions.

  These bindings previously lived in app.js. Keeping them here means
  the Project module now owns its complete opening and editing workflow.
*/
function bindProjectEntryControls() {
  const projectInfoBtn =
    document.getElementById("projectInfoBtn");

  const limitControls = [
    {
      id: "apertureMinBtn",
      limitKey: "apertureMin"
    },
    {
      id: "apertureMaxBtn",
      limitKey: "apertureMax"
    },
    {
      id: "shutterMinBtn",
      limitKey: "shutterMin"
    },
    {
      id: "shutterMaxBtn",
      limitKey: "shutterMax"
    }
  ];

  for (const control of limitControls) {
    const button =
      document.getElementById(control.id);

    if (!button) continue;

    button.addEventListener("click", event => {
      event.stopPropagation();
      openLimitSelector(control.limitKey, button);
    });
  }

  if (!projectInfoBtn) return;

  projectInfoBtn.addEventListener("click", event => {
    event.stopPropagation();

    if (isMeteringSetupActive()) return;
    if (isProjectInfoOpen()) return;

    hidePicker();
    closeHeaderMenus();
    closeLocationPanel();

    openProjectInfoPanel();
  });

  picker?.addEventListener("click", event => {
    const option = event.target.closest("[data-gear-limit-key][data-gear-limit-value]");
    if (!option) return;

    event.stopPropagation();
    setLimitValue(option.dataset.gearLimitKey, option.dataset.gearLimitValue);
    markProjectInfoDirty();
    updateLimitButtons();
    hidePicker();
    render();
  });
}

/*
────────────────────────────────────────────
4. Field Binding
────────────────────────────────────────────
*/

/*
  Connects all text inputs / textareas to state.project.
*/
function bindProjectTextFields() {
  for (const field of PROJECT_TEXT_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    input.value = getProjectValue(field.path, "");

    input.addEventListener("input", () => {
      setProjectValue(field.path, input.value);
      markProjectInfoDirty();
    });
  }
}


/*
  Connects all checkboxes to state.project.
*/
function bindProjectCheckFields() {
  for (const field of PROJECT_CHECK_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    input.checked = Boolean(getProjectValue(field.path, false));

    input.addEventListener("change", () => {
      setProjectValue(field.path, input.checked);
      markProjectInfoDirty();
    });
  }
}


/*
  Connects each notes icon to its matching notes panel.

  Uses event delegation on the whole Project Info menu,
  so future notes buttons will work automatically as long as
  they are listed in PROJECT_NOTES_TOGGLES.
*/
function bindProjectNotesToggles() {
  const menu = document.getElementById("projectInfoMenu");
  if (!menu) return;

  menu.addEventListener("click", event => {
    const button = event.target.closest(".notes-button");
    if (!button) return;

    event.stopPropagation();

    const item = PROJECT_NOTES_TOGGLES.find(
      toggle => toggle.buttonId === button.id
    );

    if (!item) return;

    const panel = document.getElementById(item.panelId);
    if (!panel) return;

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    panel.classList.toggle("is-open", willOpen);
  });
}

/*
────────────────────────────────────────────
5. Project State Helpers
────────────────────────────────────────────
*/

/*
  Refreshes all project metadata UI fields from state.project.

  Useful after loading local data or later after loading a preset.
*/
function updateProjectFields() {
  ensureProjectStructure();
  if (typeof updateLocationButtonState === "function") {
    updateLocationButtonState();
  }

  for (const field of PROJECT_TEXT_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    input.value = getProjectValue(field.path, "");
  }

  for (const field of PROJECT_CHECK_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    input.checked = Boolean(getProjectValue(field.path, false));
  }
}


/*
  Starts an isolated Gear editing transaction.

  The committed metadata object is retained while state.project points to a
  cloned draft. Existing field, range-picker and library-apply code can keep
  using the central project shape without mutating the committed object.
*/
function beginProjectInfoTransaction() {
  ensureProjectStructure();

  const committed = structuredClone(state.project);
  const draft = structuredClone(committed);

  projectInfoTransaction = { committed, draft };
  projectSavedState = structuredClone(committed);
  state.project = draft;
  projectInfoDirty = false;
}


function commitProjectInfoTransaction() {
  const committed = structuredClone(state.project);

  state.project = committed;
  projectSavedState = structuredClone(committed);
  projectInfoTransaction = null;
  projectInfoDirty = false;
}


function rollbackProjectInfoTransaction(options = {}) {
  const restoreCommitted = options.restoreCommitted !== false;

  if (
    restoreCommitted &&
    projectInfoTransaction?.committed
  ) {
    state.project = structuredClone(projectInfoTransaction.committed);
  }

  projectInfoTransaction = null;
  projectInfoDirty = false;
}


function isProjectInfoTransactionActive() {
  return Boolean(projectInfoTransaction);
}


function getCommittedProjectInfoState() {
  return projectInfoTransaction?.committed || state.project;
}


/*
  Accepts the current project state as the new clean Project Info baseline.

  Project document restore uses this after replacing state.project so a later
  Cancel action can never restore metadata from the previously open project.
*/
function commitProjectInfoBaseline() {
  ensureProjectStructure();
  projectInfoTransaction = null;
  projectSavedState = structuredClone(state.project);
  projectInfoDirty = false;
}


/*
  Reads the current Project Info UI fields into state.project.

  Save uses this explicitly so it never depends on whether
  input/change events have already fired.
*/
function readProjectFieldsFromUI() {
  ensureProjectStructure();

  for (const field of PROJECT_TEXT_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    setProjectValue(field.path, input.value);
  }

  for (const field of PROJECT_CHECK_FIELDS) {
    const input = document.getElementById(field.id);
    if (!input) continue;

    setProjectValue(field.path, input.checked);
  }
}


/*
  Safely reads a nested value from state.project.

  Example path: ["lens", "name"]
*/
function getProjectValue(path, fallback = "") {
  let value = state.project;

  for (const key of path) {
    if (!value || typeof value !== "object" || !(key in value)) {
      return fallback;
    }

    value = value[key];
  }

  return value ?? fallback;
}


/*
  Safely writes a nested value into state.project.

  Missing parent objects are created automatically.
*/
function setProjectValue(path, value) {
  let target = state.project;

  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];

    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }

    target = target[key];
  }

  target[path[path.length - 1]] = value;
}


/*
────────────────────────────────────────────
6. Structure Migration / Defaults
────────────────────────────────────────────
*/

/*
  Makes sure project metadata has the current structure.

  This protects the app from:
  - older localStorage data
  - partially missing project objects
  - future structure changes
*/
function ensureProjectStructure() {
  if (!state.project) {
    state.project = {};
  }

  if (typeof state.project.imageIdentifier !== "string") {
    state.project.imageIdentifier = "";
  }

  if (!state.project.lens) {
    state.project.lens = {};
  }

  if (typeof state.project.lens.name !== "string") {
    state.project.lens.name = "";
  }

  if (typeof state.project.lens.notes !== "string") {
    state.project.lens.notes = "";
  }

  if (!state.project.lens.warningLimits) {
    state.project.lens.warningLimits = {};
  }

  if (!state.project.lens.warningLimits.aperture) {
    state.project.lens.warningLimits.aperture = {};
  }

  if (typeof state.project.lens.warningLimits.aperture.min !== "string") {
    state.project.lens.warningLimits.aperture.min = "0.0";
  }

  if (typeof state.project.lens.warningLimits.aperture.max !== "string") {
    state.project.lens.warningLimits.aperture.max = "F";
  }

  if (!state.project.lens.warningLimits.shutter) {
    state.project.lens.warningLimits.shutter = {};
  }

  if (typeof state.project.lens.warningLimits.shutter.min !== "string") {
    state.project.lens.warningLimits.shutter.min = "B";
  }

  if (typeof state.project.lens.warningLimits.shutter.max !== "string") {
    state.project.lens.warningLimits.shutter.max = "0";
  }

  if (!state.project.filter) {
    state.project.filter = {};
  }

  if (typeof state.project.filter.name !== "string") {
    state.project.filter.name = "";
  }

  if (typeof state.project.filter.evCorrection !== "string") {
    state.project.filter.evCorrection = "";
  }

  if (typeof state.project.filter.notes !== "string") {
    state.project.filter.notes = "";
  }

  delete state.project.filter.enabled;

  if (!state.project.camera) {
    state.project.camera = {};
  }

  if (typeof state.project.camera.name !== "string") {
    state.project.camera.name = "";
  }

  if (typeof state.project.camera.notes !== "string") {
    state.project.camera.notes = "";
  }

  if (!state.project.filmHolder) {
    state.project.filmHolder = {};
  }

  /*
    Migrate the early two-name Film Holder shape into the single current
    name field without discarding existing localStorage data.
  */
  if (typeof state.project.filmHolder.name !== "string") {
    const legacyNames = [
      state.project.filmHolder.primaryName,
      state.project.filmHolder.secondaryName
    ]
      .filter(value => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean);

    state.project.filmHolder.name =
      legacyNames.join(" / ");
  }

  if (typeof state.project.filmHolder.notes !== "string") {
    state.project.filmHolder.notes = "";
  }

  delete state.project.filmHolder.primaryName;
  delete state.project.filmHolder.secondaryName;

  if (!state.project.film) {
    state.project.film = {};
  }

  if (typeof state.project.film.name !== "string") {
    state.project.film.name = "";
  }

  if (typeof state.project.film.notes !== "string") {
    state.project.film.notes = "";
  }

  if (typeof state.project.film.boxIso !== "string") {
    state.project.film.boxIso = state.project.film.boxIso == null
      ? ""
      : String(state.project.film.boxIso);
  }

  if (!state.project.lightMeter) {
    state.project.lightMeter = {};
  }

  if (typeof state.project.lightMeter.name !== "string") {
    state.project.lightMeter.name = "";
  }

  if (typeof state.project.lightMeter.notes !== "string") {
    state.project.lightMeter.notes = "";
  }

  if (!state.project.lighting) {
    state.project.lighting = {};
  }

  if (typeof state.project.lighting.description !== "string") {
    state.project.lighting.description = "";
  }

  if (typeof state.project.gearNotes !== "string") {
    state.project.gearNotes = "";
  }

  if (!state.project.location) {
    state.project.location = {};
  }

  if (typeof state.project.location.name !== "string") {
    state.project.location.name = "";
  }

  for (const key of ["latitude", "longitude", "altitude", "accuracy"]) {
    const value = state.project.location[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      state.project.location[key] = null;
    }
  }

  if (typeof state.project.location.notes !== "string") {
    state.project.location.notes = "";
  }

  if (!state.library) {
    state.library = {};
  }

  if (!Array.isArray(state.library.lenses)) {
    state.library.lenses = [];
  }

  if (!Array.isArray(state.library.filters)) {
    state.library.filters = [];
  }

  if (!Array.isArray(state.library.cameras)) {
    state.library.cameras = [];
  }

  if (!Array.isArray(state.library.filmHolders)) {
    state.library.filmHolders = [];
  }

  if (!Array.isArray(state.library.films)) {
    state.library.films = [];
  }

  if (!Array.isArray(state.library.lightMeters)) {
    state.library.lightMeters = [];
  }
}


/*
────────────────────────────────────────────
7. Notes Panels
────────────────────────────────────────────
*/

/*
  Closes every open notes panel in the Project Info menu.

  Used when the user clicks outside the Project Info panel.
*/
function closeProjectNotesPanels() {
  for (const item of PROJECT_NOTES_TOGGLES) {
    const panel = document.getElementById(item.panelId);

    if (panel) {
      panel.hidden = true;
    panel.classList.remove("is-open");
    }
  }
}


/*
────────────────────────────────────────────
8. Warning Limits
────────────────────────────────────────────
*/

/*
  Cycles through available warning limit values.

  These values only affect red warning states.
  They do NOT affect exposure calculations.
*/
function openLimitSelector(limitKey, button = null) {
  ensureProjectStructure();

  const isAperture = limitKey.startsWith("aperture");
  const values = (isAperture ? APERTURES : SHUTTER_VALUES).filter(value => {
    if (isAperture) return value !== "0.0" && value !== "F";
    return value !== "B" && value !== "0";
  });

  const currentValue = getLimitValue(limitKey);
  const titleByLimit = {
    apertureMin: "Maximum Aperture",
    apertureMax: "Minimum Aperture",
    shutterMax: "Shortest Shutter",
    shutterMin: "Longest Shutter"
  };
  const title = titleByLimit[limitKey] ||
    (isAperture ? "Aperture Range" : "Shutter Range");
  const html = `
    <div class="picker-title">${title}</div>
    ${values.map(value => `
      <button
        class="picker-option ${String(value) === String(currentValue) ? "current" : ""}"
        type="button"
        data-gear-limit-key="${limitKey}"
        data-gear-limit-value="${value}">
        ${isAperture ? `f/${value}` : formatShutterLabel(value)}
      </button>
    `).join("")}
  `;

  openPickerFromButton(
    button || document.getElementById(`${limitKey}Btn`),
    html,
    "gear-range",
    {
      scrollAttribute: "data-gear-limit-value",
      scrollValue: currentValue,
      smooth: false
    }
  );
}


/*
  Reads one warning limit value from the current lens metadata.
*/
function getLimitValue(limitKey) {
  ensureProjectStructure();

  const limits = state.project.lens.warningLimits;

  if (limitKey === "apertureMin") return limits.aperture.min;
  if (limitKey === "apertureMax") return limits.aperture.max;
  if (limitKey === "shutterMin") return limits.shutter.min;
  if (limitKey === "shutterMax") return limits.shutter.max;

  return null;
}


/*
  Writes one warning limit value into the current lens metadata.
*/
function setLimitValue(limitKey, value) {
  ensureProjectStructure();

  const limits = state.project.lens.warningLimits;

  if (limitKey === "apertureMin") limits.aperture.min = value;
  if (limitKey === "apertureMax") limits.aperture.max = value;
  if (limitKey === "shutterMin") limits.shutter.min = value;
  if (limitKey === "shutterMax") limits.shutter.max = value;
}


/*
  Updates the visible warning limit labels in the Project Info panel.
*/
function updateLimitButtons() {
  ensureProjectStructure();

  const limits = state.project.lens.warningLimits;

  const apertureMinButton = document.getElementById("apertureMinBtn");
  const apertureMaxButton = document.getElementById("apertureMaxBtn");
  const shutterMinButton = document.getElementById("shutterMinBtn");
  const shutterMaxButton = document.getElementById("shutterMaxBtn");

  if (apertureMinButton) {
    apertureMinButton.textContent = formatLimitLabel(
      limits.aperture.min,
      "aperture"
    );
  }

  if (apertureMaxButton) {
    apertureMaxButton.textContent = formatLimitLabel(
      limits.aperture.max,
      "aperture"
    );
  }

  if (shutterMinButton) {
    shutterMinButton.textContent = formatLimitLabel(
      limits.shutter.min,
      "shutter"
    );
  }

  if (shutterMaxButton) {
    shutterMaxButton.textContent = formatLimitLabel(
      limits.shutter.max,
      "shutter"
    );
  }
}


/*
  Formats warning limit values for compact display.
*/
function formatLimitLabel(value, type) {
  if (type === "aperture") {
    if (value === "0.0") return "0";
    if (value === "F") return "F";

    return `f ${value}`;
  }

  return value;
}

/*
────────────────────────────────────────────
9. Project Info Panel Workflow
────────────────────────────────────────────
*/

/*
  Opens the Project Info panel.

  When opened, the panel starts clean:
  - no unsaved changes yet
  - current saved project state is shown in the UI
*/


function ensureProjectInfoDropdownAnchor() {
  const menu = document.getElementById("projectInfoMenu");
  const button = document.getElementById("projectInfoBtn");
  const wrap = button?.closest(".project-info-wrap");
  if (!menu || !wrap) return false;

  const mobileShellActive =
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive();

  if (mobileShellActive) {
    const portal =
      typeof getMobileSurfacePortal === "function"
        ? getMobileSurfacePortal()
        : document.getElementById("mobileSurfacePortal");

    if (portal && menu.parentElement !== portal) {
      portal.appendChild(menu);
    }
  } else if (menu.parentElement !== wrap) {
    wrap.appendChild(menu);
  }

  menu.style.removeProperty("top");
  menu.style.removeProperty("left");
  menu.style.removeProperty("right");
  menu.style.removeProperty("position");
  return true;
}

function positionProjectInfoDropdown() {
  ensureProjectInfoDropdownAnchor();
}

function openProjectInfoPanel() {
  if (isProjectInfoOpen()) return;

  ensureProjectStructure();
  beginProjectInfoTransaction();

  document.body.classList.add("project-info-open");

  const overlay = document.getElementById("projectInfoOverlay");
  const menu = document.getElementById("projectInfoMenu");

  if (overlay) {
    const mobileShellActive =
      typeof isMobileApplicationShellActive === "function" &&
      isMobileApplicationShellActive();

    overlay.hidden = !mobileShellActive;
  }
  ensureProjectInfoDropdownAnchor();
  if (menu) menu.hidden = false;

  positionProjectInfoDropdown();

  updateProjectFields();
  updateLimitButtons();

  const mobileSurfaceActive =
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive();

  if (!mobileSurfaceActive) {
    window.setTimeout(() => {
      document.getElementById("cameraNameInput")?.focus({ preventScroll: true });
    }, 0);
  }
}


/*
  Closes Project Info without changing state.
*/
function closeProjectInfoPanel(options = {}) {
  if (projectInfoTransaction) {
    rollbackProjectInfoTransaction({
      restoreCommitted: options.restore !== false
    });
  }

  document.body.classList.remove("project-info-open");

  const overlay = document.getElementById("projectInfoOverlay");
  const menu = document.getElementById("projectInfoMenu");

  if (overlay) overlay.hidden = true;
  if (menu) menu.hidden = true;

  closeProjectNotesPanels();
  closeProjectLibraryAutocomplete();

  if (
    typeof isPickerOpen === "function" &&
    isPickerOpen() &&
    picker?.dataset?.pickerOwner === "gear-range"
  ) {
    hidePicker();
  }
}


/*
  Saves current Project Info fields.

  This writes:
  - current project metadata to localStorage
  - named metadata blocks into their independent libraries
*/
function saveProjectInfoPanel() {
  if (!isProjectInfoTransactionActive()) return;

  readProjectFieldsFromUI();
  ensureProjectStructure();

  saveCurrentLensToLibrary();
  saveCurrentFilterToLibrary();
  saveCurrentCameraToLibrary();
  saveCurrentFilmHolderToLibrary();
  saveCurrentFilmToLibrary();
  saveCurrentLightMeterToLibrary();

  commitProjectInfoTransaction();
  saveLocalAppData();

  closeProjectInfoPanel({ restore: false });
  render();
}


/*
  Requests cancellation of Project Info edits.

  If there are unsaved changes, a custom Spot Sketch dialog asks
  for confirmation first.
*/
function requestCancelProjectInfoPanel() {
  if (!isProjectInfoOpen()) return;
  if (typeof isDialogOpen === "function" && isDialogOpen()) return;

  if (!projectInfoDirty) {
    cancelProjectInfoPanel();
    return;
  }

  showDialog({
    title: "",
    message:
      "Discard current changes?\n\nChanges since the last Save will be lost.",

    cancelText: "Cancel",
    okText: "Discard",

    danger: true,

    onConfirm: cancelProjectInfoPanel
  });
}


/*
  Cancels current Project Info edits.

  Restores the last saved Project Info state.
  Nothing is written to localStorage or Library.
*/
function cancelProjectInfoPanel() {
  rollbackProjectInfoTransaction({ restoreCommitted: true });

  updateProjectFields();
  updateLimitButtons();

  closeProjectInfoPanel({ restore: false });
  render();
}


/*
  Requests clearing Project Info fields.

  Library items are not deleted.
  The cleared state is only committed if the user presses Save.
*/
function requestClearProjectInfoPanel() {
  if (!isProjectInfoOpen()) return;
  if (typeof isDialogOpen === "function" && isDialogOpen()) return;

  showDialog({
    title: "",
    message:
      "Clear all gear settings?\n\nLibrary items will not be deleted.",

    cancelText: "Cancel",
    okText: "Clear",

    danger: true,

    onConfirm: clearProjectInfoPanel
  });
}


/*
  Clears only the current Project Info fields.

  This does not delete anything from the Library.
  This does not save automatically.
*/
function clearProjectInfoPanel() {
  ensureProjectStructure();

  state.project.lens.name = "";
  state.project.lens.notes = "";
  state.project.lens.warningLimits.aperture.min = "0.0";
  state.project.lens.warningLimits.aperture.max = "F";
  state.project.lens.warningLimits.shutter.min = "B";
  state.project.lens.warningLimits.shutter.max = "0";

  state.project.filter.name = "";
  state.project.filter.evCorrection = "";
  state.project.filter.notes = "";

  state.project.camera.name = "";
  state.project.camera.notes = "";

  state.project.filmHolder.name = "";
  state.project.filmHolder.notes = "";

  state.project.film.name = "";
  state.project.film.boxIso = "";
  state.project.film.notes = "";

  state.project.lightMeter.name = "";
  state.project.lightMeter.notes = "";

  state.project.lighting.description = "";
  state.project.gearNotes = "";

  updateProjectFields();
  updateLimitButtons();

  markProjectInfoDirty();
}


/*
  Connects Project Info footer actions.

  Clear and Cancel use the custom Spot Sketch dialog.
  Save commits immediately.
*/
function bindProjectInfoActions() {
  const clearBtn = document.getElementById("projectInfoClearBtn");
  const cancelBtn = document.getElementById("projectInfoCancelBtn");
  const saveBtn = document.getElementById("projectInfoSaveBtn");
  const closeBtn = document.getElementById("projectInfoCloseBtn");
  const overlay = document.getElementById("projectInfoOverlay");

  if (clearBtn) {
    clearBtn.addEventListener("click", event => {
      event.stopPropagation();
      requestClearProjectInfoPanel();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", event => {
      event.stopPropagation();
      requestCancelProjectInfoPanel();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", event => {
      event.stopPropagation();
      saveProjectInfoPanel();
    });
  }

  closeBtn?.addEventListener("click", event => {
    event.stopPropagation();
    requestCancelProjectInfoPanel();
  });

  overlay?.addEventListener("click", event => {
    if (event.target === overlay) requestCancelProjectInfoPanel();
  });
}


/*
────────────────────────────────────────────
10. Dirty State
────────────────────────────────────────────
*/

/*
  Marks Project Info as changed.

  The dirty state controls whether Cancel should ask before discarding edits.
*/
function markProjectInfoDirty() {
  projectInfoDirty = true;
}

/*
────────────────────────────────────────────
11. Location Panel
────────────────────────────────────────────
*/

let locationPanelInitialized = false;
let locationPanelDraft = null;

function isLocationPanelOpen() {
  const panel = document.getElementById("locationPanel");
  return Boolean(panel && !panel.hidden);
}

function createLocationDraft() {
  ensureProjectStructure();
  return structuredClone(state.project.location);
}

function closeLocationPanel(options = {}) {
  const panel = document.getElementById("locationPanel");
  if (!panel) return;

  panel.hidden = true;
  locationPanelDraft = null;
  updateLocationButtonState();
}

function initializeLocationPanel() {
  if (locationPanelInitialized) return;
  locationPanelInitialized = true;

  const button = document.getElementById("locationBtn");
  const panel = document.getElementById("locationPanel");
  const closeButton = document.getElementById("locationPanelCloseBtn");
  const cancelButton = document.getElementById("locationCancelBtn");
  const saveButton = document.getElementById("locationSaveBtn");
  const clearButton = document.getElementById("locationClearBtn");

  if (!button || !panel) return;

  const fields = [
    { id: "locationNameInput", key: "name", numeric: false },
    { id: "locationLatitudeInput", key: "latitude", numeric: true },
    { id: "locationLongitudeInput", key: "longitude", numeric: true },
    { id: "locationAltitudeInput", key: "altitude", numeric: true },
    { id: "locationAccuracyInput", key: "accuracy", numeric: true },
    { id: "locationNotesInput", key: "notes", numeric: false }
  ];

  const syncFields = () => {
    if (!locationPanelDraft) {
      locationPanelDraft = createLocationDraft();
    }

    for (const field of fields) {
      const input = document.getElementById(field.id);
      if (!input) continue;
      const value = locationPanelDraft[field.key];
      input.value = value == null ? "" : String(value);
    }
  };

  const cancel = () => closeLocationPanel();

  const save = () => {
    if (!locationPanelDraft) return closeLocationPanel();
    state.project.location = structuredClone(locationPanelDraft);
    closeLocationPanel();
    showAppNotification({ type: "success", title: "Location saved", message: "Location data was saved to this Spot Sketch." });
  };

  button.addEventListener("click", event => {
    event.stopPropagation();
    closeHeaderMenus();
    hidePicker();

    if (isLocationPanelOpen()) {
      cancel();
      return;
    }

    locationPanelDraft = createLocationDraft();
    syncFields();
    panel.hidden = false;
  });

  closeButton?.addEventListener("click", cancel);
  cancelButton?.addEventListener("click", cancel);
  saveButton?.addEventListener("click", save);

  clearButton?.addEventListener("click", () => {
    locationPanelDraft = {
      name: "",
      latitude: null,
      longitude: null,
      altitude: null,
      accuracy: null,
      notes: ""
    };
    syncFields();
  });

  for (const field of fields) {
    const input = document.getElementById(field.id);
    if (!input) continue;
    input.addEventListener("input", () => {
      if (!locationPanelDraft) return;

      if (field.numeric) {
        const raw = input.value.trim();
        const parsed = raw === "" ? null : Number(raw);
        locationPanelDraft[field.key] = Number.isFinite(parsed) ? parsed : null;
      } else {
        locationPanelDraft[field.key] = input.value;
      }
    });
  }
}

function updateLocationButtonState() {
  const button = document.getElementById("locationBtn");
  if (!button) return;
  const location = state.project?.location || {};
  const hasLocation = Boolean(
    String(location.name || "").trim() ||
    Number.isFinite(location.latitude) ||
    Number.isFinite(location.longitude) ||
    Number.isFinite(location.altitude) ||
    String(location.notes || "").trim()
  );
  button.classList.toggle("has-location", hasLocation);
  button.title = hasLocation ? "Edit Location" : "Add Location";
}