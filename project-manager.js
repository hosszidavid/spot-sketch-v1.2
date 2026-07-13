"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Project Manager

Purpose:
Owns the multi-Spot-Sketch project lifecycle interface.

Project Manager scope:
- Project Manager overlay
- project naming
- Spot Sketch list and switching
- new Spot Sketch creation with explicit data-group copying
- Spot Sketch renaming and deletion
- New Project workflow
- in-memory preservation of edits while switching
- unsaved project status

Dependencies:
- data.js
- project-document.js
- dialog.js
- notifications.js
- render.js
==========================================================
*/

let projectManagerInitialized = false;
let pendingSpotSketchSourceId = null;
let pendingMergeProjectDocument = null;

function isProjectManagerOpen() {
  const overlay = document.getElementById("projectManagerOverlay");
  return Boolean(overlay && !overlay.hidden);
}

function initializeProjectManager() {
  if (projectManagerInitialized) return;
  projectManagerInitialized = true;

  const closeButton = document.getElementById("projectManagerCloseBtn");
  const doneButton = document.getElementById("projectManagerDoneBtn");
  const newProjectButton = document.getElementById("projectManagerNewProjectBtn");
  const mergeButton = document.getElementById("projectManagerMergeBtn");
  const newSketchButton = document.getElementById("projectManagerNewSketchBtn");
  const projectNameInput = document.getElementById("projectManagerNameInput");
  const list = document.getElementById("projectManagerList");
  const copyCancel = document.getElementById("spotSketchCopyCancelBtn");
  const copyCreate = document.getElementById("spotSketchCopyCreateBtn");
  const copySource = document.getElementById("spotSketchCopySource");
  const copyPanel = document.getElementById("spotSketchCopyPanel");
  const imageIdentifierInput = document.getElementById("imageIdentifier");
  const mergeFileInput = document.getElementById("projectMergeFileInput");
  const mergeCancelButton = document.getElementById("projectMergeCancelBtn");
  const mergeConfirmButton = document.getElementById("projectMergeConfirmBtn");
  const mergeNameInput = document.getElementById("projectMergeNameInput");
  const headerManagerButton = document.getElementById("projectManagerBtn");
  const headerNewProjectButton = document.getElementById("newProjectBtn");

  headerManagerButton?.addEventListener("click", event => {
    event.stopPropagation();
    openProjectManager();
  });

  headerNewProjectButton?.addEventListener("click", event => {
    event.stopPropagation();
    closeHeaderMenus();
    requestNewProject();
  });

  closeButton?.addEventListener("click", closeProjectManager);
  doneButton?.addEventListener("click", closeProjectManager);

  newProjectButton?.addEventListener("click", requestNewProject);
  mergeButton?.addEventListener("click", beginProjectMerge);
  newSketchButton?.addEventListener("click", openSpotSketchCopyPanel);

  mergeFileInput?.addEventListener("change", handleProjectMergeFileSelection);
  mergeCancelButton?.addEventListener("click", closeProjectMergePanel);
  mergeConfirmButton?.addEventListener("click", confirmProjectMerge);
  mergeNameInput?.addEventListener("input", updateProjectMergeConfirmState);

  projectNameInput?.addEventListener("input", () => {
    const documentData = ensureInMemoryProjectDocument();
    documentData.project.name = projectNameInput.value;
    state.projectSession.name = projectNameInput.value;
    documentData.project.updatedAt = new Date().toISOString();
    updateProjectManagerStatus();
  });

  list?.addEventListener("click", handleProjectManagerListClick);
  list?.addEventListener("change", handleProjectManagerListChange);
  list?.addEventListener("dragstart", handleProjectManagerDragStart);
  list?.addEventListener("dragover", handleProjectManagerDragOver);
  list?.addEventListener("drop", handleProjectManagerDrop);
  list?.addEventListener("dragend", handleProjectManagerDragEnd);

  copyCancel?.addEventListener("click", closeSpotSketchCopyPanel);
  copyCreate?.addEventListener("click", createSpotSketchFromCopyPanel);
  copySource?.addEventListener("change", updateCopyPanelAvailability);
  copyPanel?.addEventListener("change", event => {
    if (event.target.matches("input[data-copy-group]")) {
      synchronizeCopyDependencies(event.target);
    }
  });

  imageIdentifierInput?.addEventListener("input", () => {
    updateCurrentImageIdentifier(imageIdentifierInput.value);
  });

  imageIdentifierInput?.addEventListener("change", () => {
    updateCurrentImageIdentifier(imageIdentifierInput.value);
    enforceUniqueCurrentImageIdentifier(imageIdentifierInput);
  });

  document
    .getElementById("projectManagerOverlay")
    ?.addEventListener("click", event => {
      if (event.target.id === "projectManagerOverlay") {
        closeProjectManager();
      }
    });
}

function openProjectManager() {
  closeHeaderMenus();
  hidePicker();

  ensureInMemoryProjectDocument();

  const overlay = document.getElementById("projectManagerOverlay");
  if (!overlay) return;

  overlay.hidden = false;
  document.body.classList.add("project-manager-open");
  renderProjectManager();
}

function closeProjectManager() {
  closeSpotSketchCopyPanel();
  closeProjectMergePanel();

  const overlay = document.getElementById("projectManagerOverlay");
  if (overlay) overlay.hidden = true;

  document.body.classList.remove("project-manager-open");
}

function ensureInMemoryProjectDocument() {
  if (loadedProjectDocument) {
    commitCurrentSpotSketchToMemory();
    return loadedProjectDocument;
  }

  ensureProjectSessionIdentity();
  const now = new Date().toISOString();

  const activeRecord = state.imageCanvas
    ? buildCurrentSpotSketchRecord()
    : createBlankSpotSketchRecord(
        state.projectSession.activeSpotSketchId,
        "Untitled Spot Sketch"
      );

  loadedProjectDocument = {
    format: SPOT_SKETCH_PROJECT_FORMAT,
    schemaVersion: SPOT_SKETCH_PROJECT_SCHEMA_VERSION,
    appVersion: SPOT_SKETCH_APP_VERSION,
    project: {
      id: state.projectSession.id,
      name: state.projectSession.name || "Untitled Project",
      createdAt: state.projectSession.createdAt || now,
      updatedAt: now,
      notes: "",
      spotSketchOrder: [activeRecord.id]
    },
    spotSketches: [activeRecord],
    activeSpotSketchId: activeRecord.id
  };

  return loadedProjectDocument;
}

function commitCurrentSpotSketchToMemory() {
  if (!loadedProjectDocument || !state.projectSession?.activeSpotSketchId) {
    return;
  }

  const currentId = state.projectSession.activeSpotSketchId;
  const existingIndex = loadedProjectDocument.spotSketches.findIndex(
    sketch => sketch.id === currentId
  );

  const previous = existingIndex >= 0
    ? loadedProjectDocument.spotSketches[existingIndex]
    : null;

  const record = state.imageCanvas
    ? buildCurrentSpotSketchRecord()
    : {
        ...createBlankSpotSketchRecord(
          currentId,
          previous?.title || "Untitled Spot Sketch"
        ),
        imageIdentifier: String(state.project.imageIdentifier || "").trim(),
        gear: serializeGearSettings(),
        location: structuredClone(state.project.location || {}),
        actualExposure: structuredClone(state.actualExposure),
        imageNotes: state.documentNotes || "",
        developmentNotes: state.developmentNotes || "",
        exportSettings: structuredClone(state.exportOptions)
      };

  record.title = previous?.title || record.title;

  if (existingIndex >= 0) {
    loadedProjectDocument.spotSketches[existingIndex] = record;
  } else {
    loadedProjectDocument.spotSketches.push(record);
  }

  loadedProjectDocument.activeSpotSketchId = currentId;
  loadedProjectDocument.project.updatedAt = new Date().toISOString();
  loadedProjectDocument.project.spotSketchOrder = normalizeSpotSketchOrder(
    loadedProjectDocument.project.spotSketchOrder,
    loadedProjectDocument.spotSketches
  );
}

function createBlankSpotSketchRecord(id, title) {
  return {
    id: id || createProjectEntityId("spot-sketch"),
    title: title || "Untitled Spot Sketch",
    imageIdentifier: "",
    image: null,
    location: {
      name: "",
      latitude: null,
      longitude: null,
      altitude: null,
      accuracy: null,
      notes: ""
    },
    gear: {
      camera: { name: "", notes: "" },
      lens: {
        name: "",
        notes: "",
        warningLimits: {
          aperture: { min: "0.0", max: "F" },
          shutter: { min: "B", max: "0" }
        }
      },
      filter: { name: "", evCorrection: "", notes: "" },
      film: { name: "", boxIso: "", notes: "" },
      filmHolder: { name: "", notes: "" },
      lightMeter: { name: "", notes: "" },
      lighting: { description: "" },
      notes: ""
    },
    initialMeteringSetup: { iso: null, shutter: null },
    spotReadings: [],
    calculation: null,
    actualExposure: {
      status: "not-recorded",
      iso: null,
      shutter: null,
      aperture: null,
      notes: ""
    },
    imageNotes: "",
    developmentNotes: "",
    exportSettings: {
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
    }
  };
}

function renderProjectManager() {
  const documentData = ensureInMemoryProjectDocument();
  const nameInput = document.getElementById("projectManagerNameInput");
  const list = document.getElementById("projectManagerList");

  if (nameInput) nameInput.value = documentData.project.name || "";
  if (!list) return;

  const orderedIds = normalizeSpotSketchOrder(
    documentData.project.spotSketchOrder,
    documentData.spotSketches
  );

  list.innerHTML = orderedIds
    .map(id => documentData.spotSketches.find(sketch => sketch.id === id))
    .filter(Boolean)
    .map((sketch, index) => createProjectManagerRow(sketch, index))
    .join("");

  updateProjectManagerStatus();
  populateCopySourceOptions();
}

function createProjectManagerRow(sketch, index) {
  const active = sketch.id === loadedProjectDocument.activeSpotSketchId;
  const readingCount = Array.isArray(sketch.spotReadings)
    ? sketch.spotReadings.length
    : 0;
  const identifier = String(sketch.imageIdentifier || "").trim();
  const meta = createSpotSketchMetadataItems(sketch, identifier, readingCount);
  const onlySketch = loadedProjectDocument.spotSketches.length <= 1;
  const firstSketch = index === 0;
  const lastSketch = index === loadedProjectDocument.project.spotSketchOrder.length - 1;

  return `
    <article class="project-manager-row ${active ? "is-active" : ""}" data-sketch-id="${escapeProjectHtml(sketch.id)}">
      <button class="project-manager-drag-handle" type="button" draggable="true" aria-label="Reorder Spot Sketch" title="Drag to reorder">
        <span></span><span></span><span></span>
      </button>

      <div class="project-manager-mobile-order mobile-only" aria-label="Reorder Spot Sketch">
        <button
          class="project-manager-order-button ${firstSketch ? "is-unavailable" : ""}"
          type="button"
          data-project-action="move-up"
          aria-label="Move Spot Sketch up"
          aria-disabled="${firstSketch ? "true" : "false"}">↑</button>
        <button
          class="project-manager-order-button ${lastSketch ? "is-unavailable" : ""}"
          type="button"
          data-project-action="move-down"
          aria-label="Move Spot Sketch down"
          aria-disabled="${lastSketch ? "true" : "false"}">↓</button>
      </div>

      <div class="project-manager-row-index">${index + 1}</div>

      <div class="project-manager-row-main">
        <div class="project-manager-row-title-line">
          <input
            class="project-manager-sketch-title"
            type="text"
            value="${escapeProjectHtml(sketch.title || "Untitled Spot Sketch")}" 
            aria-label="Spot Sketch title">
          ${active ? '<span class="project-manager-active-badge">Active</span>' : ""}
        </div>

        <dl class="project-manager-row-meta">
          ${meta.map(item => `<div><dt>${escapeProjectHtml(item.label)}</dt><dd>${escapeProjectHtml(item.value)}</dd></div>`).join("")}
        </dl>
      </div>

      <div class="project-manager-row-actions">
        <button
          class="project-manager-row-button"
          type="button"
          data-project-action="switch">
          Open
        </button>

        <button
          class="project-manager-row-button project-manager-row-button-danger ${onlySketch ? "is-unavailable" : ""}"
          type="button"
          data-project-action="delete"
          aria-disabled="${onlySketch ? "true" : "false"}"
          data-unavailable-reason="lastProjectSketch">
          Delete
        </button>
      </div>
    </article>
  `;
}

function createSpotSketchMetadataItems(sketch, identifier, readingCount) {
  const items = [];
  const add = (label, value) => {
    const text = String(value ?? "").trim();
    if (text) items.push({ label, value: text });
  };

  add("Image Identifier", identifier || "Not set");
  add("Location", sketch.location?.name);
  add("Image", sketch.image?.filename || (sketch.image ? "Embedded image" : "No image"));
  add("Spot Readings", `${readingCount}`);

  const setup = sketch.initialMeteringSetup || {};
  if (setup.iso && setup.shutter) add("Initial Metering", `ISO ${setup.iso} · ${setup.shutter}`);

  const calculation = sketch.calculation;
  if (calculation?.referenceZone) {
    add("Calculation", `Zone ${calculation.referenceZone.label} · ${calculation.controlMode === "aperture" ? "A" : "S"} mode`);
  }

  const gear = sketch.gear || {};
  add("Camera", gear.camera?.name);
  add("Lens", gear.lens?.name);
  add("Filter", gear.filter?.name);
  add("Film", gear.film?.name);
  add("Box ISO", gear.film?.boxIso);
  add("Film Holder", gear.filmHolder?.name);
  add("Light Meter", gear.lightMeter?.name);
  add("Lighting", gear.lighting?.description);

  const actual = sketch.actualExposure || {};
  if (actual.status === "exposed") {
    add("Actual Exposure", `ISO ${actual.iso ?? "—"} · ${actual.shutter ?? "—"} · f/${actual.aperture ?? "—"}`);
  }

  return items;
}

function handleProjectManagerListChange(event) {
  const titleInput = event.target.closest(".project-manager-sketch-title");
  if (!titleInput) return;

  const row = titleInput.closest("[data-sketch-id]");
  const sketch = loadedProjectDocument?.spotSketches.find(
    item => item.id === row?.dataset.sketchId
  );

  if (!sketch) return;

  sketch.title = titleInput.value.trim() || "Untitled Spot Sketch";
  titleInput.value = sketch.title;
  loadedProjectDocument.project.updatedAt = new Date().toISOString();
  updateProjectManagerStatus();
}

async function handleProjectManagerListClick(event) {
  const actionButton = event.target.closest("[data-project-action]");
  if (!actionButton) return;

  const row = actionButton.closest("[data-sketch-id]");
  const sketchId = row?.dataset.sketchId;
  if (!sketchId) return;

  if (actionButton.dataset.projectAction === "switch") {
    const opened = await switchActiveSpotSketch(sketchId);
    if (opened) closeProjectManager();
  }

  if (actionButton.dataset.projectAction === "delete") {
    if (loadedProjectDocument?.spotSketches.length <= 1) {
      showAppNotification(
        "Spot Sketch cannot be deleted",
        "A project must contain at least one Spot Sketch."
      );
      return;
    }
    requestDeleteSpotSketch(sketchId);
  }

  if (actionButton.dataset.projectAction === "move-up") {
    moveProjectManagerSketch(sketchId, -1);
  }

  if (actionButton.dataset.projectAction === "move-down") {
    moveProjectManagerSketch(sketchId, 1);
  }
}

function moveProjectManagerSketch(sketchId, delta) {
  const documentData = ensureInMemoryProjectDocument();
  const order = normalizeSpotSketchOrder(
    documentData.project.spotSketchOrder,
    documentData.spotSketches
  );

  const currentIndex = order.indexOf(sketchId);
  const targetIndex = currentIndex + delta;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) {
    return false;
  }

  [order[currentIndex], order[targetIndex]] = [
    order[targetIndex],
    order[currentIndex]
  ];

  documentData.project.spotSketchOrder = order;
  documentData.project.updatedAt = new Date().toISOString();
  renderProjectManager();

  const movedRow = document.querySelector(
    `.project-manager-row[data-sketch-id="${CSS.escape(sketchId)}"]`
  );
  movedRow?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}

async function switchActiveSpotSketch(sketchId) {
  const documentData = ensureInMemoryProjectDocument();
  if (documentData.activeSpotSketchId === sketchId) return true;

  commitCurrentSpotSketchToMemory();

  const sketch = documentData.spotSketches.find(item => item.id === sketchId);
  if (!sketch) return false;

  try {
    if (sketch.image) {
      const decoded = await decodeEmbeddedProjectImage(sketch.image);
      applyProjectDocumentToRuntime(documentData, sketch, decoded);
    } else {
      applyBlankSpotSketchToRuntime(documentData, sketch);
    }
  } catch (error) {
    showProjectOpenError([
      error?.message || "The selected Spot Sketch could not be opened."
    ]);
    return false;
  }

  documentData.activeSpotSketchId = sketch.id;
  state.projectSession.activeSpotSketchId = sketch.id;
  renderProjectManager();

  showAppNotification(
    "Spot Sketch opened",
    sketch.title || "Untitled Spot Sketch"
  );

  return true;
}

function applyBlankSpotSketchToRuntime(documentData, sketch) {
  closeProjectSurfacesBeforeRestore();

  state.imageCanvas = null;
  state.imageSource = {
    filename: "",
    mimeType: "",
    originalWidth: null,
    originalHeight: null
  };

  state.projectSession = {
    id: documentData.project.id,
    name: documentData.project.name || "Untitled Project",
    createdAt: documentData.project.createdAt || new Date().toISOString(),
    updatedAt: documentData.project.updatedAt || new Date().toISOString(),
    activeSpotSketchId: sketch.id
  };

  state.project = buildProjectStateFromSpotSketch(sketch);
  ensureProjectStructure();
  state.initialMeteringSetup = { iso: null, shutter: null };
  state.workflow.meteringSetupDraft = { iso: null, shutter: null };
  state.markers = [];
  state.nextNumber = 1;
  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;
  resetCalculation();
  state.actualExposure = normalizeActualExposureRecord(sketch.actualExposure);
  state.exportOptions = normalizeExportSettingsRecord(sketch.exportSettings);
  state.documentNotes = typeof sketch.imageNotes === "string" ? sketch.imageNotes : "";
  state.developmentNotes = typeof sketch.developmentNotes === "string" ? sketch.developmentNotes : "";
  setWorkflowPhase(WORKFLOW_PHASES.WELCOME);
  synchronizeRestoredProjectUi();
}

function openSpotSketchCopyPanel() {
  const documentData = ensureInMemoryProjectDocument();
  commitCurrentSpotSketchToMemory();

  const panel = document.getElementById("spotSketchCopyPanel");
  if (!panel) return;

  pendingSpotSketchSourceId = documentData.activeSpotSketchId || null;
  populateCopySourceOptions();

  const sourceSelect = document.getElementById("spotSketchCopySource");
  if (sourceSelect) sourceSelect.value = pendingSpotSketchSourceId || "";

  for (const input of panel.querySelectorAll("input[type='checkbox']")) {
    input.checked = ["gear", "image", "setup"].includes(input.dataset.copyGroup);
  }

  panel.hidden = false;
  updateCopyPanelAvailability();
}

function closeSpotSketchCopyPanel() {
  const panel = document.getElementById("spotSketchCopyPanel");
  if (panel) panel.hidden = true;
  pendingSpotSketchSourceId = null;
}

function populateCopySourceOptions() {
  const select = document.getElementById("spotSketchCopySource");
  if (!select || !loadedProjectDocument) return;

  const previous = select.value;

  select.innerHTML = `
    <option value="">Start empty</option>
    ${loadedProjectDocument.spotSketches.map(sketch => `
      <option value="${escapeProjectHtml(sketch.id)}">
        ${escapeProjectHtml(sketch.title || "Untitled Spot Sketch")}
      </option>
    `).join("")}
  `;

  if ([...select.options].some(option => option.value === previous)) {
    select.value = previous;
  }
}

function updateCopyPanelAvailability() {
  const panel = document.getElementById("spotSketchCopyPanel");
  const sourceSelect = document.getElementById("spotSketchCopySource");
  if (!panel || !sourceSelect) return;

  const hasSource = Boolean(sourceSelect.value);

  for (const input of panel.querySelectorAll("input[type='checkbox']")) {
    input.disabled = !hasSource;
    input.closest("label")?.classList.toggle("is-disabled", !hasSource);
  }
}

function synchronizeCopyDependencies(changedInput) {
  const panel = document.getElementById("spotSketchCopyPanel");
  if (!panel || !changedInput.checked) return;

  const require = group => {
    const input = panel.querySelector(`[data-copy-group="${group}"]`);
    if (input && !input.disabled) input.checked = true;
  };

  if (changedInput.dataset.copyGroup === "readings") {
    require("image");
    require("setup");
  }

  if (changedInput.dataset.copyGroup === "calculation") {
    require("image");
    require("setup");
    require("readings");
  }
}

function updateCurrentImageIdentifier(value) {
  const identifier = String(value || "");

  state.project.imageIdentifier = identifier;

  if (!loadedProjectDocument) {
    return;
  }

  const currentId = state.projectSession?.activeSpotSketchId;
  if (!currentId) return;

  const current = loadedProjectDocument.spotSketches.find(
    sketch => sketch.id === currentId
  );

  if (current) {
    current.imageIdentifier = identifier.trim();
  }

  loadedProjectDocument.project.updatedAt = new Date().toISOString();
  updateProjectManagerStatus();
}


function enforceUniqueCurrentImageIdentifier(input) {
  if (!input || !loadedProjectDocument) return true;

  commitCurrentSpotSketchToMemory();

  const currentId = state.projectSession.activeSpotSketchId;
  const normalized = normalizeImageIdentifier(input.value);
  if (!normalized) return true;

  const duplicate = loadedProjectDocument.spotSketches.find(sketch =>
    sketch.id !== currentId &&
    normalizeImageIdentifier(sketch.imageIdentifier) === normalized
  );

  if (!duplicate) return true;

  input.value = "";
  state.project.imageIdentifier = "";

  const current = loadedProjectDocument.spotSketches.find(
    sketch => sketch.id === currentId
  );
  if (current) current.imageIdentifier = "";

  showAppNotification(
    "Image Identifier already in use",
    `“${duplicate.imageIdentifier}” belongs to ${duplicate.title || "another Spot Sketch"}.`
  );

  return false;
}

function getSelectedCopyGroups() {
  const panel = document.getElementById("spotSketchCopyPanel");
  const selected = new Set();
  if (!panel) return selected;

  for (const input of panel.querySelectorAll("input[data-copy-group]")) {
    if (input.checked && !input.disabled) selected.add(input.dataset.copyGroup);
  }

  if (selected.has("calculation")) {
    selected.add("readings");
    selected.add("setup");
    selected.add("image");
  }

  if (selected.has("readings")) {
    selected.add("setup");
    selected.add("image");
  }

  return selected;
}

async function createSpotSketchFromCopyPanel() {
  const sourceId = document.getElementById("spotSketchCopySource")?.value || "";
  const groups = getSelectedCopyGroups();
  const documentData = ensureInMemoryProjectDocument();
  const source = sourceId
    ? documentData.spotSketches.find(sketch => sketch.id === sourceId)
    : null;

  const sketch = createBlankSpotSketchRecord(
    createProjectEntityId("spot-sketch"),
    `Spot Sketch ${documentData.spotSketches.length + 1}`
  );

  if (source) {
    if (groups.has("gear")) sketch.gear = structuredClone(source.gear);
    if (groups.has("image")) sketch.image = structuredClone(source.image);
    if (groups.has("setup")) {
      sketch.initialMeteringSetup = structuredClone(source.initialMeteringSetup);
    }
    if (groups.has("readings")) {
      sketch.spotReadings = structuredClone(source.spotReadings);
    }
    if (groups.has("calculation")) {
      sketch.calculation = structuredClone(source.calculation);
    }
    if (groups.has("actualExposure")) {
      sketch.actualExposure = structuredClone(source.actualExposure);
    }
    if (groups.has("imageNotes")) {
      sketch.imageNotes = source.imageNotes || "";
      sketch.developmentNotes = source.developmentNotes || "";
    }
    if (groups.has("exportSettings")) {
      sketch.exportSettings = structuredClone(source.exportSettings);
    }
  }

  /* Image Identifier is intentionally never copied. */
  sketch.imageIdentifier = "";

  documentData.spotSketches.push(sketch);
  documentData.project.spotSketchOrder.push(sketch.id);
  documentData.project.updatedAt = new Date().toISOString();

  closeSpotSketchCopyPanel();
  await switchActiveSpotSketch(sketch.id);
  closeProjectManager();
}

function requestDeleteSpotSketch(sketchId) {
  const documentData = ensureInMemoryProjectDocument();
  const sketch = documentData.spotSketches.find(item => item.id === sketchId);
  if (!sketch || documentData.spotSketches.length <= 1) return;

  showDialog({
    title: "Delete Spot Sketch?",
    message: `“${sketch.title || "Untitled Spot Sketch"}” will be removed from this project.`,
    okText: "Delete",
    cancelText: "Cancel",
    danger: true,
    onConfirm: async () => {
      const wasActive = documentData.activeSpotSketchId === sketchId;
      documentData.spotSketches = documentData.spotSketches.filter(
        item => item.id !== sketchId
      );
      documentData.project.spotSketchOrder = documentData.project.spotSketchOrder.filter(
        id => id !== sketchId
      );
      documentData.project.updatedAt = new Date().toISOString();

      if (wasActive) {
        const nextId = documentData.project.spotSketchOrder[0];
        await switchActiveSpotSketch(nextId);
      }

      renderProjectManager();
    }
  });
}

function requestNewProject() {
  const proceed = () => {
    closeProjectManager();
    startNewProject();
  };

  if (!hasUnsavedProjectChanges()) {
    proceed();
    return;
  }

  showDialog({
    title: "Start New Project?",
    message: "Unsaved project changes will be left behind. Save the current project first if you want to keep them.",
    okText: "New Project",
    cancelText: "Cancel",
    danger: true,
    onConfirm: proceed
  });
}

function startNewProject() {
  resetLoadedProjectDocumentContext();

  state.imageCanvas = null;
  state.imageSource = {
    filename: "",
    mimeType: "",
    originalWidth: null,
    originalHeight: null
  };

  state.project = buildProjectStateFromSpotSketch(
    createBlankSpotSketchRecord("temporary", "Untitled Spot Sketch")
  );
  ensureProjectStructure();

  state.initialMeteringSetup = { iso: null, shutter: null };
  state.workflow.meteringSetupDraft = { iso: null, shutter: null };
  state.markers = [];
  state.nextNumber = 1;
  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;
  resetCalculation();
  state.actualExposure = normalizeActualExposureRecord(null);
  state.exportOptions = normalizeExportSettingsRecord(null);
  state.documentNotes = "";
  setWorkflowPhase(WORKFLOW_PHASES.WELCOME);

  ensureProjectSessionIdentity();
  state.projectSession.name = "Untitled Project";
  synchronizeRestoredProjectUi();

  showAppNotification(
    "New project",
    "A new empty Spot Sketch project is ready."
  );
}

function hasUnsavedProjectChanges() {
  if (!loadedProjectDocument) {
    return Boolean(
      state.imageCanvas ||
      state.markers.length ||
      String(state.project.imageIdentifier || "").trim()
    );
  }

  commitCurrentSpotSketchToMemory();

  if (!lastDownloadedProjectSnapshot) {
    return true;
  }

  return createComparableProjectSnapshot(loadedProjectDocument) !==
    createComparableProjectSnapshot(JSON.parse(lastDownloadedProjectSnapshot));
}

function createComparableProjectSnapshot(documentData) {
  const copy = structuredClone(documentData);
  if (copy.project) delete copy.project.updatedAt;
  return JSON.stringify(copy);
}

function updateProjectManagerStatus() {
  const status = document.getElementById("projectManagerStatus");
  const count = document.getElementById("projectManagerCount");
  if (!loadedProjectDocument) return;

  if (count) {
    const total = loadedProjectDocument.spotSketches.length;
    count.textContent = `${total} Spot Sketch${total === 1 ? "" : "es"}`;
  }

  if (status) {
    status.textContent = "Changes are kept in this project until you download Save Project.";
  }
}

function escapeProjectHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/*
────────────────────────────────────────────
Project Merge
────────────────────────────────────────────
*/

function beginProjectMerge() {
  commitCurrentSpotSketchToMemory();
  const input = document.getElementById("projectMergeFileInput");
  if (!input) return;

  input.value = "";
  input.click();
}

async function handleProjectMergeFileSelection() {
  const input = document.getElementById("projectMergeFileInput");
  const file = input?.files?.[0] || null;
  if (input) input.value = "";
  if (!file) return;

  let documentData;

  try {
    documentData = JSON.parse(await file.text());
  } catch (error) {
    showDialog({
      title: "Project could not be merged",
      message: "The selected file could not be read as a Spot Sketch project.",
      okText: "OK",
      showCancel: false,
      danger: true
    });
    return;
  }

  const validation = validateProjectDocument(documentData);
  if (!validation.valid) {
    showDialog({
      title: "Project could not be merged",
      message: (validation.errors || ["The selected project is invalid."]).join("\n"),
      okText: "OK",
      showCancel: false,
      danger: true
    });
    return;
  }

  pendingMergeProjectDocument = structuredClone(documentData);
  openProjectMergePanel();
}

function openProjectMergePanel() {
  const panel = document.getElementById("projectMergePanel");
  const nameInput = document.getElementById("projectMergeNameInput");
  const summary = document.getElementById("projectMergeSummary");
  if (!panel || !pendingMergeProjectDocument) return;

  const current = ensureInMemoryProjectDocument();
  const incoming = pendingMergeProjectDocument;
  const currentName = current.project?.name || "Untitled Project";
  const incomingName = incoming.project?.name || "Untitled Project";

  if (nameInput) {
    nameInput.value = `${currentName} + ${incomingName}`.slice(0, 120);
  }

  if (summary) {
    const currentCount = current.spotSketches.length;
    const incomingCount = incoming.spotSketches.length;
    summary.textContent =
      `${currentName} (${currentCount}) and ${incomingName} (${incomingCount}) ` +
      `will become a new project with ${currentCount + incomingCount} Spot Sketches.`;
  }

  renderProjectMergeConflicts();
  panel.hidden = false;
  updateProjectMergeConfirmState();
  nameInput?.focus();
  nameInput?.select();
}

function closeProjectMergePanel() {
  const panel = document.getElementById("projectMergePanel");
  if (panel) panel.hidden = true;
  pendingMergeProjectDocument = null;
}

function getProjectMergeIdentifierConflicts() {
  if (!pendingMergeProjectDocument) return [];

  const current = ensureInMemoryProjectDocument();
  const used = new Set(
    current.spotSketches
      .map(sketch => normalizeImageIdentifier(sketch.imageIdentifier))
      .filter(Boolean)
  );

  return pendingMergeProjectDocument.spotSketches
    .map(sketch => ({
      sketch,
      normalized: normalizeImageIdentifier(sketch.imageIdentifier)
    }))
    .filter(item => item.normalized && used.has(item.normalized));
}

function renderProjectMergeConflicts() {
  const container = document.getElementById("projectMergeConflicts");
  if (!container) return;

  const conflicts = getProjectMergeIdentifierConflicts();
  container.hidden = conflicts.length === 0;

  if (!conflicts.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="project-merge-conflict-heading">
      <strong>Image Identifier conflicts</strong>
      <small>Enter a new unique identifier for every imported Spot Sketch listed below.</small>
    </div>
    ${conflicts.map(({ sketch }) => `
      <label class="project-merge-conflict-field">
        <span>${escapeProjectHtml(sketch.title || "Untitled Spot Sketch")}</span>
        <input
          type="text"
          maxlength="120"
          data-merge-sketch-id="${escapeProjectHtml(sketch.id)}"
          value="${escapeProjectHtml(createSuggestedMergedIdentifier(sketch.imageIdentifier))}">
      </label>
    `).join("")}
  `;

  container.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", updateProjectMergeConfirmState);
  });
}

function createSuggestedMergedIdentifier(identifier) {
  const base = String(identifier || "").trim() || "IMAGE";
  const current = ensureInMemoryProjectDocument();
  const pending = pendingMergeProjectDocument;
  const used = new Set([
    ...current.spotSketches.map(sketch => normalizeImageIdentifier(sketch.imageIdentifier)),
    ...pending.spotSketches.map(sketch => normalizeImageIdentifier(sketch.imageIdentifier))
  ].filter(Boolean));

  let index = 2;
  let candidate = `${base}-${index}`;
  while (used.has(normalizeImageIdentifier(candidate))) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

function getResolvedMergeIdentifiers() {
  const values = new Map();
  const container = document.getElementById("projectMergeConflicts");
  if (!container) return values;

  container.querySelectorAll("[data-merge-sketch-id]").forEach(input => {
    values.set(input.dataset.mergeSketchId, String(input.value || "").trim());
  });

  return values;
}

function validateMergeIdentifiers() {
  if (!pendingMergeProjectDocument) return false;

  const current = ensureInMemoryProjectDocument();
  const replacements = getResolvedMergeIdentifiers();
  const used = new Set();

  for (const sketch of current.spotSketches) {
    const value = normalizeImageIdentifier(sketch.imageIdentifier);
    if (value) used.add(value);
  }

  for (const sketch of pendingMergeProjectDocument.spotSketches) {
    const raw = replacements.has(sketch.id)
      ? replacements.get(sketch.id)
      : sketch.imageIdentifier;
    const value = normalizeImageIdentifier(raw);

    if (!value) continue;
    if (used.has(value)) return false;
    used.add(value);
  }

  return true;
}

function updateProjectMergeConfirmState() {
  const button = document.getElementById("projectMergeConfirmBtn");
  const name = document.getElementById("projectMergeNameInput")?.value.trim() || "";
  if (!button) return;
  button.disabled = !pendingMergeProjectDocument || !name || !validateMergeIdentifiers();
}

function createUniqueMergedTitle(title, usedTitles) {
  const base = String(title || "Untitled Spot Sketch").trim() || "Untitled Spot Sketch";
  const normalizedBase = base.toLocaleLowerCase();

  if (!usedTitles.has(normalizedBase)) {
    usedTitles.add(normalizedBase);
    return base;
  }

  let number = 2;
  let candidate = `${base} (${number})`;
  while (usedTitles.has(candidate.toLocaleLowerCase())) {
    number += 1;
    candidate = `${base} (${number})`;
  }

  usedTitles.add(candidate.toLocaleLowerCase());
  return candidate;
}

function cloneImportedSketchForMerge(sketch, usedTitles, identifierReplacements) {
  const copy = structuredClone(sketch);
  const readingIdMap = new Map();

  copy.id = createProjectEntityId("spot-sketch");
  copy.title = createUniqueMergedTitle(copy.title, usedTitles);

  if (identifierReplacements.has(sketch.id)) {
    copy.imageIdentifier = identifierReplacements.get(sketch.id);
  }

  copy.spotReadings = Array.isArray(copy.spotReadings)
    ? copy.spotReadings.map(reading => {
        const newId = createProjectEntityId("spot-reading");
        readingIdMap.set(reading.id, newId);
        return { ...reading, id: newId };
      })
    : [];

  if (copy.calculation?.referenceSpotReadingId) {
    copy.calculation.referenceSpotReadingId =
      readingIdMap.get(copy.calculation.referenceSpotReadingId) || null;
  }

  return copy;
}

async function confirmProjectMerge() {
  if (!pendingMergeProjectDocument || !validateMergeIdentifiers()) return;

  const name = document.getElementById("projectMergeNameInput")?.value.trim() || "";
  if (!name) return;

  commitCurrentSpotSketchToMemory();

  const current = ensureInMemoryProjectDocument();
  const incoming = pendingMergeProjectDocument;
  const identifierReplacements = getResolvedMergeIdentifiers();
  const usedTitles = new Set(
    current.spotSketches.map(sketch =>
      String(sketch.title || "Untitled Spot Sketch").trim().toLocaleLowerCase()
    )
  );

  const importedSketches = incoming.spotSketches.map(sketch =>
    cloneImportedSketchForMerge(sketch, usedTitles, identifierReplacements)
  );

  const now = new Date().toISOString();
  const currentName = current.project?.name || "Untitled Project";
  const incomingName = incoming.project?.name || "Untitled Project";
  const mergeNote = `Merged from “${currentName}” and “${incomingName}” on ${new Date().toLocaleDateString()}.`;
  const currentNotes = String(current.project?.notes || "").trim();
  const incomingNotes = String(incoming.project?.notes || "").trim();
  const sourceNotes = [
    currentNotes ? `Source notes — ${currentName}:
${currentNotes}` : "",
    incomingNotes ? `Source notes — ${incomingName}:
${incomingNotes}` : ""
  ].filter(Boolean);

  const merged = {
    format: SPOT_SKETCH_PROJECT_FORMAT,
    schemaVersion: SPOT_SKETCH_PROJECT_SCHEMA_VERSION,
    appVersion: SPOT_SKETCH_APP_VERSION,
    project: {
      id: createProjectEntityId("project"),
      name,
      createdAt: now,
      updatedAt: now,
      notes: [mergeNote, ...sourceNotes].filter(Boolean).join("\n\n"),
      spotSketchOrder: [
        ...normalizeSpotSketchOrder(current.project.spotSketchOrder, current.spotSketches),
        ...importedSketches.map(sketch => sketch.id)
      ]
    },
    spotSketches: [
      ...structuredClone(current.spotSketches),
      ...importedSketches
    ],
    activeSpotSketchId: current.activeSpotSketchId
  };

  const validation = validateProjectDocument(merged);
  if (!validation.valid) {
    showDialog({
      title: "Projects could not be merged",
      message: (validation.errors || ["The merged project is invalid."]).join("\n"),
      okText: "OK",
      showCancel: false,
      danger: true
    });
    return;
  }

  loadedProjectDocument = merged;
  lastDownloadedProjectSnapshot = null;
  state.projectSession.id = merged.project.id;
  state.projectSession.name = merged.project.name;
  state.projectSession.createdAt = merged.project.createdAt;
  state.projectSession.activeSpotSketchId = merged.activeSpotSketchId;

  pendingMergeProjectDocument = null;
  document.getElementById("projectMergePanel").hidden = true;
  renderProjectManager();

  showAppNotification(
    "Projects merged",
    `${merged.project.name} now contains ${merged.spotSketches.length} Spot Sketches. Save Project to create the new file.`
  );
}


let draggedProjectSketchId = null;

function handleProjectManagerDragStart(event) {
  const handle = event.target.closest(".project-manager-drag-handle");
  if (!handle) return;
  const row = handle.closest("[data-sketch-id]");
  draggedProjectSketchId = row?.dataset.sketchId || null;
  if (!draggedProjectSketchId) return;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedProjectSketchId);
}

function handleProjectManagerDragOver(event) {
  if (!draggedProjectSketchId) return;
  const row = event.target.closest("[data-sketch-id]");
  if (!row || row.dataset.sketchId === draggedProjectSketchId) return;
  event.preventDefault();
  document.querySelectorAll(".project-manager-row.is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
  row.classList.add("is-drop-target");
}

function handleProjectManagerDrop(event) {
  if (!draggedProjectSketchId) return;
  const targetRow = event.target.closest("[data-sketch-id]");
  if (!targetRow) return;
  event.preventDefault();

  const documentData = ensureInMemoryProjectDocument();
  const order = normalizeSpotSketchOrder(documentData.project.spotSketchOrder, documentData.spotSketches);
  const from = order.indexOf(draggedProjectSketchId);
  const to = order.indexOf(targetRow.dataset.sketchId);
  if (from < 0 || to < 0 || from === to) return;

  order.splice(from, 1);
  order.splice(to, 0, draggedProjectSketchId);
  documentData.project.spotSketchOrder = order;
  documentData.project.updatedAt = new Date().toISOString();
  renderProjectManager();
}

function handleProjectManagerDragEnd() {
  draggedProjectSketchId = null;
  document.querySelectorAll(".project-manager-row.is-dragging, .project-manager-row.is-drop-target").forEach(item => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
}