"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Project Document

Purpose:
Builds, validates, downloads, opens, and restores the versioned
.spotsketch project document.

Project document scope:
- schema v1 validation
- embedded image decoding
- active Spot Sketch restore
- Recording and Calculation state restore
- preservation of additional Spot Sketch records in the project file
- safe rejection of invalid or unsupported files

Dependencies:
- data.js
- exposure.js
- image.js
- project.js
- export-workspace.js
- metering-setup.js
- picker-core.js
- markers.js
- render.js
- dialog.js
- notifications.js
==========================================================
*/

const SPOT_SKETCH_PROJECT_FORMAT = "spot-sketch-project";
const SPOT_SKETCH_PROJECT_SCHEMA_VERSION = 1;
const SPOT_SKETCH_APP_VERSION = "1.3";
const SPOT_SKETCH_MIME_TYPE = "application/x-spotsketch+json";

/*
  Keeps the complete currently opened project document in memory.
  Only one Spot Sketch is edited at a time, but Save must preserve every
  other Spot Sketch record already stored in the project container.
*/
let loadedProjectDocument = null;
let lastDownloadedProjectSnapshot = null;


function createProjectEntityId(prefix) {
  if (typeof createSpotSketchEntityId === "function") {
    return createSpotSketchEntityId(prefix);
  }

  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


function normalizeImageIdentifier(value) {
  return String(value || "").trim().toLocaleLowerCase();
}


function sanitizeProjectFileName(value) {
  const safe = String(value || "Untitled Project")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120);

  return safe || "Untitled Project";
}


function resetLoadedProjectDocumentContext() {
  loadedProjectDocument = null;
  lastDownloadedProjectSnapshot = null;

  state.projectSession = {
    id: null,
    name: "",
    createdAt: null,
    updatedAt: null,
    activeSpotSketchId: null
  };
}


function ensureProjectSessionIdentity() {
  const now = new Date().toISOString();
  const identifier = String(state.project.imageIdentifier || "").trim();

  if (!state.projectSession || typeof state.projectSession !== "object") {
    state.projectSession = {};
  }

  if (!state.projectSession.id) {
    state.projectSession.id = createProjectEntityId("project");
  }

  if (!state.projectSession.activeSpotSketchId) {
    state.projectSession.activeSpotSketchId = createProjectEntityId("spot-sketch");
  }

  if (!state.projectSession.createdAt) {
    state.projectSession.createdAt = now;
  }

  state.projectSession.updatedAt = now;

  if (!String(state.projectSession.name || "").trim()) {
    state.projectSession.name = identifier || "Untitled Project";
  }
}


function serializeWorkingImage() {
  if (!state.imageCanvas) return null;

  return {
    filename: state.imageSource?.filename || "spot-sketch-image.png",
    sourceMimeType: state.imageSource?.mimeType || "",
    embeddedMimeType: "image/png",
    dataUrl: state.imageCanvas.toDataURL("image/png"),
    workingWidth: state.imageCanvas.width,
    workingHeight: state.imageCanvas.height,
    originalWidth: state.imageSource?.originalWidth ?? null,
    originalHeight: state.imageSource?.originalHeight ?? null
  };
}


function serializeSpotReadings() {
  return state.markers.map(marker => ({
    id: marker.id,
    number: marker.number,
    x: marker.x,
    y: marker.y,
    collapsed: Boolean(marker.collapsed),
    measurement: {
      iso: marker.measurement?.iso ?? null,
      shutter: marker.measurement?.shutter ?? null,
      aperture: marker.measurement?.aperture ?? null
    }
  }));
}


function serializeCalculationDecision() {
  if (!state.calculation?.referenceSpotReadingId || !state.calculation?.referenceZone) {
    return null;
  }

  const mode = state.calculation.controlMode === "aperture"
    ? "aperture"
    : "shutter";

  const exposure = state.calculation.exposure || {};

  return {
    referenceSpotReadingId: state.calculation.referenceSpotReadingId,
    referenceZone: {
      label: state.calculation.referenceZone.label,
      ev: state.calculation.referenceZone.ev
    },
    controlMode: mode,
    controlledExposure: mode === "aperture"
      ? {
          iso: exposure.iso ?? null,
          aperture: exposure.aperture ?? null
        }
      : {
          iso: exposure.iso ?? null,
          shutter: exposure.shutter ?? null
        }
  };
}


function serializeGearSettings() {
  ensureProjectStructure();

  return {
    camera: structuredClone(state.project.camera),
    lens: structuredClone(state.project.lens),
    filter: structuredClone(state.project.filter),
    film: structuredClone(state.project.film),
    filmHolder: structuredClone(state.project.filmHolder),
    lightMeter: structuredClone(state.project.lightMeter),
    lighting: structuredClone(state.project.lighting),
    notes: state.project.gearNotes || ""
  };
}


function buildCurrentSpotSketchRecord() {
  ensureProjectSessionIdentity();

  const identifier = String(state.project.imageIdentifier || "").trim();

  return {
    id: state.projectSession.activeSpotSketchId,
    title: identifier || "Untitled Spot Sketch",
    imageIdentifier: identifier,
    image: serializeWorkingImage(),
    location: structuredClone(state.project.location),
    gear: serializeGearSettings(),
    initialMeteringSetup: structuredClone(state.initialMeteringSetup),
    spotReadings: serializeSpotReadings(),
    calculation: serializeCalculationDecision(),
    actualExposure: structuredClone(state.actualExposure),
    imageNotes: state.documentNotes || "",
    developmentNotes: state.developmentNotes || "",
    exportSettings: structuredClone(state.exportOptions)
  };
}


function buildCurrentProjectDocument() {
  ensureProjectSessionIdentity();

  const activeSpotSketch = buildCurrentSpotSketchRecord();
  const now = state.projectSession.updatedAt;

  if (loadedProjectDocument) {
    const documentData = structuredClone(loadedProjectDocument);
    const existingIndex = documentData.spotSketches.findIndex(
      sketch => sketch.id === activeSpotSketch.id
    );

    if (existingIndex >= 0) {
      activeSpotSketch.title =
        documentData.spotSketches[existingIndex].title ||
        activeSpotSketch.title;
      documentData.spotSketches[existingIndex] = activeSpotSketch;
    } else {
      documentData.spotSketches.push(activeSpotSketch);
    }

    documentData.format = SPOT_SKETCH_PROJECT_FORMAT;
    documentData.schemaVersion = SPOT_SKETCH_PROJECT_SCHEMA_VERSION;
    documentData.appVersion = SPOT_SKETCH_APP_VERSION;
    documentData.activeSpotSketchId = activeSpotSketch.id;

    documentData.project = {
      ...(documentData.project || {}),
      id: state.projectSession.id,
      name: state.projectSession.name,
      createdAt: state.projectSession.createdAt,
      updatedAt: now,
      notes: documentData.project?.notes || "",
      spotSketchOrder: normalizeSpotSketchOrder(
        documentData.project?.spotSketchOrder,
        documentData.spotSketches
      )
    };

    return documentData;
  }

  return {
    format: SPOT_SKETCH_PROJECT_FORMAT,
    schemaVersion: SPOT_SKETCH_PROJECT_SCHEMA_VERSION,
    appVersion: SPOT_SKETCH_APP_VERSION,
    project: {
      id: state.projectSession.id,
      name: state.projectSession.name,
      createdAt: state.projectSession.createdAt,
      updatedAt: now,
      notes: "",
      spotSketchOrder: [activeSpotSketch.id]
    },
    spotSketches: [activeSpotSketch],
    activeSpotSketchId: activeSpotSketch.id
  };
}


function normalizeSpotSketchOrder(order, spotSketches) {
  const ids = spotSketches.map(sketch => sketch.id);
  const validOrder = Array.isArray(order)
    ? order.filter((id, index) => ids.includes(id) && order.indexOf(id) === index)
    : [];

  for (const id of ids) {
    if (!validOrder.includes(id)) validOrder.push(id);
  }

  return validOrder;
}


function validateProjectDocument(documentData) {
  const errors = [];

  if (!documentData || typeof documentData !== "object") {
    return {
      valid: false,
      errors: ["The selected file does not contain a Spot Sketch project."]
    };
  }

  if (documentData.format !== SPOT_SKETCH_PROJECT_FORMAT) {
    errors.push("Invalid Spot Sketch project format.");
  }

  if (documentData.schemaVersion !== SPOT_SKETCH_PROJECT_SCHEMA_VERSION) {
    errors.push("Unsupported Spot Sketch project schema.");
  }

  if (!documentData.project || typeof documentData.project !== "object") {
    errors.push("Project metadata is missing.");
  }

  const spotSketches = Array.isArray(documentData.spotSketches)
    ? documentData.spotSketches
    : [];

  if (spotSketches.length === 0) {
    errors.push("The project must contain at least one Spot Sketch.");
  }

  const sketchIds = new Set();
  const identifiers = new Map();

  for (const sketch of spotSketches) {
    if (!sketch || typeof sketch !== "object") {
      errors.push("The project contains an invalid Spot Sketch record.");
      continue;
    }

    if (!sketch.id || typeof sketch.id !== "string") {
      errors.push("A Spot Sketch is missing its internal ID.");
    } else if (sketchIds.has(sketch.id)) {
      errors.push(`Duplicate Spot Sketch ID: ${sketch.id}`);
    } else {
      sketchIds.add(sketch.id);
    }

    const hasEmbeddedImage = Boolean(
      sketch.image &&
      typeof sketch.image.dataUrl === "string" &&
      sketch.image.dataUrl.startsWith("data:image/")
    );

    const requiresImage = Boolean(
      (Array.isArray(sketch.spotReadings) && sketch.spotReadings.length) ||
      sketch.calculation ||
      sketch.initialMeteringSetup?.iso != null ||
      sketch.initialMeteringSetup?.shutter != null
    );

    if (!hasEmbeddedImage && requiresImage) {
      errors.push(`Spot Sketch ${sketch.title || sketch.id || ""} requires a valid embedded image.`);
    }

    const normalizedIdentifier = normalizeImageIdentifier(sketch.imageIdentifier);
    if (normalizedIdentifier) {
      if (identifiers.has(normalizedIdentifier)) {
        errors.push(`Duplicate Image Identifier: ${sketch.imageIdentifier}`);
      } else {
        identifiers.set(normalizedIdentifier, sketch.id);
      }
    }

    validateSpotSketchMeteringSetup(sketch, errors);
    validateSpotSketchReadings(sketch, errors);
    validateSpotSketchCalculation(sketch, errors);
  }

  if (
    documentData.activeSpotSketchId &&
    !sketchIds.has(documentData.activeSpotSketchId)
  ) {
    errors.push("The active Spot Sketch does not exist in this project.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}


function validateSpotSketchMeteringSetup(sketch, errors) {
  const setup = sketch.initialMeteringSetup || {};
  const hasReadings = Array.isArray(sketch.spotReadings) && sketch.spotReadings.length > 0;
  const hasCalculation = Boolean(sketch.calculation);
  const hasAnySetupValue = setup.iso != null || setup.shutter != null;

  if (!hasAnySetupValue && !hasReadings && !hasCalculation) return;

  if (!ISO_VALUES.includes(setup.iso)) {
    errors.push(`Spot Sketch ${sketch.title || sketch.id} has an unsupported Initial ISO.`);
  }

  if (!SHUTTER_VALUES.includes(setup.shutter)) {
    errors.push(`Spot Sketch ${sketch.title || sketch.id} has an unsupported Initial shutter speed.`);
  }
}


function validateSpotSketchReadings(sketch, errors) {
  if (!Array.isArray(sketch.spotReadings)) {
    errors.push(`Spot Sketch ${sketch.title || sketch.id} has invalid Spot Reading data.`);
    return;
  }

  const markerIds = new Set();
  const markerNumbers = new Set();

  for (const reading of sketch.spotReadings) {
    if (!reading?.id || typeof reading.id !== "string") {
      errors.push("A Spot Reading is missing its internal ID.");
      continue;
    }

    if (markerIds.has(reading.id)) {
      errors.push(`Duplicate Spot Reading ID: ${reading.id}`);
    }
    markerIds.add(reading.id);

    if (!Number.isInteger(reading.number) || reading.number < 1) {
      errors.push(`Spot Reading ${reading.id} has an invalid number.`);
    } else if (markerNumbers.has(reading.number)) {
      errors.push(`Duplicate Spot Reading number: #${reading.number}`);
    }
    markerNumbers.add(reading.number);

    if (
      typeof reading.x !== "number" ||
      typeof reading.y !== "number" ||
      reading.x < 0 || reading.x > 1 ||
      reading.y < 0 || reading.y > 1
    ) {
      errors.push(`Spot Reading #${reading.number || "?"} has an invalid image position.`);
    }

    const measurement = reading.measurement || {};

    if (!ISO_VALUES.includes(measurement.iso)) {
      errors.push(`Spot Reading #${reading.number || "?"} has an unsupported ISO value.`);
    }

    if (!SHUTTER_VALUES.includes(measurement.shutter)) {
      errors.push(`Spot Reading #${reading.number || "?"} has an unsupported shutter value.`);
    }

    if (!APERTURES.includes(String(measurement.aperture))) {
      errors.push(`Spot Reading #${reading.number || "?"} has an unsupported aperture value.`);
    }
  }
}


function validateSpotSketchCalculation(sketch, errors) {
  const calculation = sketch.calculation;
  if (!calculation) return;

  if (!Array.isArray(sketch.spotReadings)) {
    errors.push("Calculation cannot be validated without Spot Reading data.");
    return;
  }

  const markerIds = new Set(sketch.spotReadings.map(reading => reading.id));

  if (!markerIds.has(calculation.referenceSpotReadingId)) {
    errors.push("Calculation references a missing Spot Reading.");
  }

  const zone = ZONES.find(item => item.label === calculation.referenceZone?.label);
  if (!zone || zone.ev !== calculation.referenceZone?.ev) {
    errors.push("Calculation contains an invalid reference Zone.");
  }

  if (calculation.controlMode !== "shutter" && calculation.controlMode !== "aperture") {
    errors.push("Calculation contains an invalid control mode.");
    return;
  }

  const controlled = calculation.controlledExposure || {};

  if (!ISO_VALUES.includes(controlled.iso)) {
    errors.push("Calculation contains an unsupported ISO value.");
  }

  if (
    calculation.controlMode === "shutter" &&
    !SHUTTER_VALUES.includes(controlled.shutter)
  ) {
    errors.push("Calculation contains an unsupported shutter value.");
  }

  if (
    calculation.controlMode === "aperture" &&
    !APERTURES.includes(String(controlled.aperture))
  ) {
    errors.push("Calculation contains an unsupported aperture value.");
  }
}


function downloadProjectDocument(documentData) {
  const json = JSON.stringify(documentData, null, 2);
  const blob = new Blob([json], { type: SPOT_SKETCH_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const name = sanitizeProjectFileName(documentData.project?.name);

  link.href = url;
  link.download = `${name}.spotsketch`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function saveCurrentSpotSketchProject() {
  readProjectFieldsFromUI();

  const projectDocument = buildCurrentProjectDocument();
  const validation = validateProjectDocument(projectDocument);

  if (!validation.valid) {
    showDialog({
      title: "Project could not be saved",
      message: validation.errors.join("\n"),
      okText: "OK",
      showCancel: false,
      danger: true
    });
    return false;
  }

  loadedProjectDocument = structuredClone(projectDocument);
  lastDownloadedProjectSnapshot = JSON.stringify(projectDocument);
  downloadProjectDocument(projectDocument);
  saveLocalAppData();

  showAppNotification(
    "Project saved",
    `${projectDocument.project.name}.spotsketch was created.`
  );

  return true;
}


async function openSpotSketchProjectFile(file) {
  if (!file) return false;

  let documentData;

  try {
    const text = await file.text();
    documentData = JSON.parse(text);
  } catch (error) {
    showProjectOpenError([
      "The selected file could not be read as a Spot Sketch project."
    ]);
    return false;
  }

  const validation = validateProjectDocument(documentData);

  if (!validation.valid) {
    showProjectOpenError(validation.errors);
    return false;
  }

  const activeSpotSketch = getActiveSpotSketchRecord(documentData);

  if (!activeSpotSketch) {
    showProjectOpenError(["The project does not contain an active Spot Sketch."]);
    return false;
  }

  let decodedImage = null;

  if (activeSpotSketch.image) {
    try {
      decodedImage = await decodeEmbeddedProjectImage(activeSpotSketch.image);
    } catch (error) {
      showProjectOpenError(["The embedded project image could not be decoded."]);
      return false;
    }
  }

  const snapshot = captureRuntimeProjectSnapshot();

  try {
    if (decodedImage) {
      applyProjectDocumentToRuntime(
        documentData,
        activeSpotSketch,
        decodedImage
      );
    } else if (typeof applyBlankSpotSketchToRuntime === "function") {
      applyBlankSpotSketchToRuntime(documentData, activeSpotSketch);
    } else {
      throw new Error("This empty Spot Sketch requires the Project Manager module.");
    }
  } catch (error) {
    console.error("Could not restore Spot Sketch project.", error);
    restoreRuntimeProjectSnapshot(snapshot);
    showProjectOpenError([
      error?.message || "The project could not be restored safely."
    ]);
    return false;
  }

  loadedProjectDocument = structuredClone(documentData);
  lastDownloadedProjectSnapshot = JSON.stringify(documentData);

  showAppNotification(
    "Project opened",
    `${documentData.project?.name || "Spot Sketch Project"} was restored.`
  );

  return true;
}


function getActiveSpotSketchRecord(documentData) {
  const requestedId = documentData.activeSpotSketchId;

  return documentData.spotSketches.find(sketch => sketch.id === requestedId) ||
    documentData.spotSketches[0] ||
    null;
}


function decodeEmbeddedProjectImage(imageRecord) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvasImage = document.createElement("canvas");
      canvasImage.width = imageRecord.workingWidth || image.naturalWidth || image.width;
      canvasImage.height = imageRecord.workingHeight || image.naturalHeight || image.height;

      const context = canvasImage.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvasImage.width, canvasImage.height);

      resolve(canvasImage);
    };

    image.onerror = () => reject(new Error("Image decode failed."));
    image.src = imageRecord.dataUrl;
  });
}


function captureRuntimeProjectSnapshot() {
  return {
    imageCanvas: state.imageCanvas,
    imageSource: structuredClone(state.imageSource),
    projectSession: structuredClone(state.projectSession),
    workflow: structuredClone(state.workflow),
    calculationDraft: structuredClone(state.calculationDraft),
    calculation: structuredClone(state.calculation),
    initialMeteringSetup: structuredClone(state.initialMeteringSetup),
    markers: structuredClone(state.markers),
    nextNumber: state.nextNumber,
    selectedId: state.selectedId,
    pendingPoint: structuredClone(state.pendingPoint),
    moveMarkerId: state.moveMarkerId,
    project: structuredClone(
      typeof getCommittedProjectInfoState === "function"
        ? getCommittedProjectInfoState()
        : state.project
    ),
    actualExposure: structuredClone(state.actualExposure),
    exportOptions: structuredClone(state.exportOptions),
    documentNotes: state.documentNotes,
    developmentNotes: state.developmentNotes,
    loadedProjectDocument: loadedProjectDocument
      ? structuredClone(loadedProjectDocument)
      : null
  };
}


function restoreRuntimeProjectSnapshot(snapshot) {
  state.imageCanvas = snapshot.imageCanvas;
  state.imageSource = snapshot.imageSource;
  state.projectSession = snapshot.projectSession;
  state.workflow = snapshot.workflow;
  state.calculationDraft = snapshot.calculationDraft;
  state.calculation = snapshot.calculation;
  state.initialMeteringSetup = snapshot.initialMeteringSetup;
  state.markers = snapshot.markers;
  state.nextNumber = snapshot.nextNumber;
  state.selectedId = snapshot.selectedId;
  state.pendingPoint = snapshot.pendingPoint;
  state.moveMarkerId = snapshot.moveMarkerId;
  state.project = snapshot.project;
  state.actualExposure = snapshot.actualExposure;
  state.exportOptions = snapshot.exportOptions;
  state.documentNotes = snapshot.documentNotes;
  state.developmentNotes = snapshot.developmentNotes || "";
  loadedProjectDocument = snapshot.loadedProjectDocument;

  synchronizeRestoredProjectUi();
}


function applyProjectDocumentToRuntime(documentData, sketch, decodedImage) {
  closeProjectSurfacesBeforeRestore();

  state.imageCanvas = decodedImage;
  state.imageSource = {
    filename: sketch.image.filename || "",
    mimeType: sketch.image.sourceMimeType || sketch.image.embeddedMimeType || "",
    originalWidth: sketch.image.originalWidth ?? sketch.image.workingWidth ?? null,
    originalHeight: sketch.image.originalHeight ?? sketch.image.workingHeight ?? null
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

  state.initialMeteringSetup = {
    iso: sketch.initialMeteringSetup?.iso ?? null,
    shutter: sketch.initialMeteringSetup?.shutter ?? null
  };

  state.workflow.meteringSetupDraft = {
    iso: null,
    shutter: null
  };

  state.markers = sketch.spotReadings.map(reading => ({
    id: reading.id,
    number: reading.number,
    x: reading.x,
    y: reading.y,
    collapsed: Boolean(reading.collapsed),
    measurement: {
      iso: reading.measurement.iso,
      shutter: reading.measurement.shutter,
      aperture: String(reading.measurement.aperture)
    }
  }));

  state.nextNumber = state.markers.reduce(
    (maximum, marker) => Math.max(maximum, marker.number + 1),
    1
  );

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;

  resetCalculation();
  restoreCalculationDecision(sketch.calculation);

  state.actualExposure = normalizeActualExposureRecord(sketch.actualExposure);
  state.exportOptions = normalizeExportSettingsRecord(sketch.exportSettings);
  state.documentNotes = typeof sketch.imageNotes === "string"
    ? sketch.imageNotes
    : "";

  state.developmentNotes = typeof sketch.developmentNotes === "string"
    ? sketch.developmentNotes
    : "";

  if (state.calculation.exposure) {
    setWorkflowPhase(WORKFLOW_PHASES.CALCULATION);
  } else if (hasInitialMeteringSetup()) {
    setWorkflowPhase(WORKFLOW_PHASES.RECORDING);
  } else {
    beginMeteringSetup();
  }

  synchronizeRestoredProjectUi();
}


function buildProjectStateFromSpotSketch(sketch) {
  const gear = sketch.gear || {};

  return {
    imageIdentifier: String(sketch.imageIdentifier || ""),
    lens: structuredClone(gear.lens || {}),
    filter: structuredClone(gear.filter || {}),
    camera: structuredClone(gear.camera || {}),
    filmHolder: structuredClone(gear.filmHolder || {}),
    film: structuredClone(gear.film || {}),
    lightMeter: structuredClone(gear.lightMeter || {}),
    lighting: structuredClone(gear.lighting || {}),
    gearNotes: typeof gear.notes === "string" ? gear.notes : "",
    location: structuredClone(sketch.location || {})
  };
}


function restoreCalculationDecision(calculation) {
  if (!calculation) return;

  state.calculation.referenceSpotReadingId = calculation.referenceSpotReadingId;
  state.calculation.referenceZone = {
    label: calculation.referenceZone.label,
    ev: calculation.referenceZone.ev
  };
  state.calculation.controlMode = calculation.controlMode;

  const initialExposure = createInitialCalculatedExposure();

  if (!initialExposure) {
    throw new Error("The saved Calculation could not be reconstructed.");
  }

  state.calculation.exposure = initialExposure;

  const controlled = calculation.controlledExposure;
  state.calculation.exposure.iso = controlled.iso;

  if (calculation.controlMode === "aperture") {
    state.calculation.exposure.aperture = String(controlled.aperture);
  } else {
    state.calculation.exposure.shutter = controlled.shutter;
  }

  if (!recalculateCalculatedExposure()) {
    throw new Error("The saved Calculated Exposure is outside the supported range.");
  }
}


function normalizeActualExposureRecord(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    status: source.status === "exposed" ? "exposed" : "not-recorded",
    iso: ISO_VALUES.includes(source.iso) ? source.iso : null,
    shutter: SHUTTER_VALUES.includes(source.shutter) ? source.shutter : null,
    aperture: APERTURES.includes(String(source.aperture))
      ? String(source.aperture)
      : null,
    notes: typeof source.notes === "string" ? source.notes : ""
  };
}


function normalizeExportSettingsRecord(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    exportType: source.exportType === "document" ? "document" : "quick",
    includeImageAndMarkers: source.includeImageAndMarkers !== false,
    includeMeteringInformation: source.includeMeteringInformation !== false,
    includeActualExposure: source.includeActualExposure !== false,
    includeGearSettings: source.includeGearSettings !== false,
    includeDocumentNotes: source.includeDocumentNotes !== false,
    includeDevelopmentNotes: source.includeDevelopmentNotes !== false,
    documentScope: source.documentScope === "project" ? "project" : "current",
    documentFormat: source.documentFormat === "png" ? "png" : "pdf",
    documentOrientation: ["portrait", "landscape"].includes(
      source.documentOrientation
    )
      ? source.documentOrientation
      : "auto"
  };
}


function closeProjectSurfacesBeforeRestore() {
  closeHeaderMenus();
  hidePicker();
  hideMoveCursor();

  if (isProjectInfoOpen()) {
    closeProjectInfoPanel();
  }

  if (isExportWorkspaceOpen()) {
    closeExportWorkspace();
  }
}


function synchronizeRestoredProjectUi() {
  welcome.style.display = state.imageCanvas ? "none" : "";
  imageWrap.style.display = state.imageCanvas ? "block" : "none";

  const imageIdentifierInput = document.getElementById("imageIdentifier");
  if (imageIdentifierInput) {
    imageIdentifierInput.value = state.project.imageIdentifier || "";
  }

  updateProjectFields();

  if (typeof commitProjectInfoBaseline === "function") {
    commitProjectInfoBaseline();
  }

  updateLimitButtons();
  updateMeteringSetupUi();
  updateCalculationUi();

  if (typeof ensureActualExposureStructure === "function") {
    ensureActualExposureStructure();
  }

  if (typeof ensureExportDocumentStructure === "function") {
    ensureExportDocumentStructure();
  }

  render();
}


function showProjectOpenError(errors) {
  showDialog({
    title: "Project could not be opened",
    message: errors.join("\n"),
    okText: "OK",
    showCancel: false,
    danger: true
  });
}