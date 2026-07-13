
"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Export Workspace

Purpose:
Owns the Export Workspace interface, Actual Exposure controls,
document content options, notes, and temporary PNG export action.

Table of Contents:
1. DOM References
2. Export Workspace State
3. Export Workspace Controls

Owns:
- Export Workspace open / close state
- Actual Exposure UI state synchronization
- Actual Zone preview
- export content options
- document notes controls
- Export Workspace event handlers

Does NOT own:
- the final Spot Sketch Document renderer
- PNG drawing internals
- original Spot Reading measurements
- Calculation Mode
- project metadata internals

Dependencies:
- dom.js
- data.js
- exposure.js
- export.js
- dialog.js
- picker-core.js
- header.js
==========================================================
*/


/*
────────────────────────────────────────────
1. DOM References
────────────────────────────────────────────
*/

/*
  Export Workspace controls.
*/
const exportWorkspaceOverlay =
  document.getElementById("exportWorkspaceOverlay");

const exportWorkspace =
  document.getElementById("exportWorkspace");

const exportWorkspaceSettings =
  document.querySelector(".export-workspace-settings");

const exportWorkspaceCloseBtn =
  document.getElementById("exportWorkspaceCloseBtn");

const exportWorkspaceCancelBtn =
  document.getElementById("exportWorkspaceCancelBtn");

const exportWorkspaceExportBtn =
  document.getElementById("exportWorkspaceExportBtn");

const exportWorkspaceJpegBtn =
  document.getElementById("exportWorkspaceJpegBtn");


/*
  Actual Exposure controls.
*/
const actualExposureStatusBadge =
  document.getElementById("actualExposureStatusBadge");

const actualExposureDifferenceIndicator =
  document.getElementById("actualExposureDifferenceIndicator");

const actualExposureNotRecordedBtn =
  document.getElementById("actualExposureNotRecordedBtn");

const actualExposureExposedBtn =
  document.getElementById("actualExposureExposedBtn");

const actualExposureFields =
  document.getElementById("actualExposureFields");

const actualExposureIsoSelect =
  document.getElementById("actualExposureIsoSelect");

const actualExposureShutterSelect =
  document.getElementById("actualExposureShutterSelect");

const actualExposureApertureSelect =
  document.getElementById("actualExposureApertureSelect");

const actualExposureSummary =
  document.getElementById("actualExposureSummary");

const actualExposureComparison =
  document.getElementById("actualExposureComparison");

const actualExposureNotesField =
  document.getElementById("actualExposureNotesField");

const actualExposureNotesInput =
  document.getElementById("actualExposureNotesInput");

const actualExposureNotesCount =
  document.getElementById("actualExposureNotesCount");

const actualZonePreview =
  document.getElementById("actualZonePreview");

const actualZonePreviewCount =
  document.getElementById("actualZonePreviewCount");

const actualZoneTableBody =
  document.getElementById("actualZoneTableBody");


/*
  Document Content controls.
*/
const exportIncludeImageInput =
  document.getElementById("exportIncludeImageInput");

const exportIncludeMeteringInput =
  document.getElementById("exportIncludeMeteringInput");

const exportIncludeActualInput =
  document.getElementById("exportIncludeActualInput");

const exportIncludeGearInput =
  document.getElementById("exportIncludeGearInput");

const exportIncludeDocumentNotesInput =
  document.getElementById("exportIncludeDocumentNotesInput");

const exportIncludeDevelopmentNotesInput =
  document.getElementById("exportIncludeDevelopmentNotesInput");


/*
  Document Notes controls.
*/
const documentNotesInput =
  document.getElementById("documentNotesInput");

const documentNotesCount =
  document.getElementById("documentNotesCount");

const documentNotesStatusBadge =
  document.getElementById("documentNotesStatusBadge");

const developmentNotesInput =
  document.getElementById("developmentNotesInput");

const developmentNotesCount =
  document.getElementById("developmentNotesCount");

const developmentNotesStatusBadge =
  document.getElementById("developmentNotesStatusBadge");

const documentPreviewRoot =
  document.getElementById("documentPreviewRoot");

const documentExportType =
  document.getElementById("documentExportType");

const documentExportScope =
  document.getElementById("documentExportScope");

const documentExportFormat =
  document.getElementById("documentExportFormat");

const documentExportOrientation =
  document.getElementById("documentExportOrientation");

const documentExportHint =
  document.getElementById("documentExportHint");

const exportPreviewLabel =
  document.getElementById("exportPreviewLabel");

const exportPreviewCaption =
  document.getElementById("exportPreviewCaption");


/*
────────────────────────────────────────────
2. Export Workspace State
────────────────────────────────────────────
*/

/*
  Returns whether the Export Workspace is currently open.
*/

function isMobileExportWorkflowActive() {
  return document.body.classList.contains("mobile-shell-active");
}

function applyMobileExportWorkflowDefaults() {
  if (!isMobileExportWorkflowActive()) return;

  ensureExportDocumentStructure();
  state.exportOptions.exportType = "quick";
  state.exportOptions.documentScope = "current";
  state.exportOptions.documentFormat = "png";
}

function isExportWorkspaceOpen() {
  return Boolean(
    exportWorkspaceOverlay &&
    !exportWorkspaceOverlay.hidden
  );
}

/*
  Makes sure Actual Exposure always has the expected structure.

  This protects future project loading and older saved data from
  missing Actual Exposure properties.
*/
function ensureActualExposureStructure() {
  if (!state.actualExposure) {
    state.actualExposure = {};
  }

  if (
    state.actualExposure.status !== "not-recorded" &&
    state.actualExposure.status !== "exposed"
  ) {
    state.actualExposure.status = "not-recorded";
  }

  if (
    typeof state.actualExposure.iso !== "number" &&
    state.actualExposure.iso !== null
  ) {
    state.actualExposure.iso = null;
  }

  if (
    typeof state.actualExposure.shutter !== "string" &&
    state.actualExposure.shutter !== null
  ) {
    state.actualExposure.shutter = null;
  }

  if (
    typeof state.actualExposure.aperture !== "string" &&
    state.actualExposure.aperture !== null
  ) {
    state.actualExposure.aperture = null;
  }

  if (typeof state.actualExposure.notes !== "string") {
    state.actualExposure.notes = "";
  }
}


/*
  Makes sure export options and Document Notes always have
  the expected structure.
*/
function ensureExportDocumentStructure() {
  if (!state.exportOptions) {
    state.exportOptions = {};
  }

  if (!["quick", "document"].includes(state.exportOptions.exportType)) {
    state.exportOptions.exportType = "quick";
  }

  const contentDefaults = {
    includeImageAndMarkers: true,
    includeMeteringInformation: true,
    includeActualExposure: true,
    includeGearSettings: true,
    includeDocumentNotes: true,
    includeDevelopmentNotes: true
  };

  for (const [key, fallback] of Object.entries(contentDefaults)) {
    if (typeof state.exportOptions[key] !== "boolean") {
      state.exportOptions[key] = fallback;
    }
  }

  if (typeof state.documentNotes !== "string") {
    state.documentNotes = "";
  }

  if (typeof state.developmentNotes !== "string") {
    state.developmentNotes = "";
  }

  if (state.exportOptions.documentScope !== "project") {
    state.exportOptions.documentScope = "current";
  }

  if (state.exportOptions.documentFormat !== "png") {
    state.exportOptions.documentFormat = "pdf";
  }

  if (!["portrait", "landscape"].includes(
    state.exportOptions.documentOrientation
  )) {
    state.exportOptions.documentOrientation = "auto";
  }

  if (state.exportOptions.exportType === "quick") {
    state.exportOptions.documentScope = "current";
    state.exportOptions.documentFormat = "png";
  }

  if (state.exportOptions.documentScope === "project") {
    state.exportOptions.exportType = "document";
    state.exportOptions.documentFormat = "pdf";
  }
}


/*
  Updates a text counter from the current value and maxlength.
*/
function updateNotesCounter(input, counter) {
  if (!input || !counter) return;

  const maximum =
    Number(input.getAttribute("maxlength")) || 0;

  const currentLength =
    input.value.length;

  counter.textContent =
    maximum > 0
      ? `${currentLength} / ${maximum}`
      : `${currentLength}`;
}


/*
  Refreshes the three Document Content controls from state.
*/
function updateExportContentControls() {
  ensureExportDocumentStructure();

  const controls = [
    [exportIncludeImageInput, "includeImageAndMarkers"],
    [exportIncludeMeteringInput, "includeMeteringInformation"],
    [exportIncludeActualInput, "includeActualExposure"],
    [exportIncludeGearInput, "includeGearSettings"],
    [exportIncludeDocumentNotesInput, "includeDocumentNotes"],
    [exportIncludeDevelopmentNotesInput, "includeDevelopmentNotes"]
  ];

  for (const [input, key] of controls) {
    if (input) input.checked = state.exportOptions[key];
  }
}



function updateDocumentExportControls() {
  ensureExportDocumentStructure();

  const quickExport = state.exportOptions.exportType === "quick";
  const projectScope = state.exportOptions.documentScope === "project";

  if (documentExportType) {
    documentExportType.value = state.exportOptions.exportType;
  }

  if (documentExportScope) {
    documentExportScope.disabled = quickExport;
    documentExportScope.value = quickExport
      ? "current"
      : state.exportOptions.documentScope;
  }

  if (documentExportFormat) {
    documentExportFormat.disabled = quickExport || projectScope;
    documentExportFormat.value = quickExport || projectScope
      ? (quickExport ? "png" : "pdf")
      : state.exportOptions.documentFormat;
  }

  if (documentExportOrientation) {
    documentExportOrientation.disabled = quickExport;
    documentExportOrientation.value =
      state.exportOptions.documentOrientation;
  }

  if (documentExportHint) {
    if (quickExport) {
      documentExportHint.textContent =
        "Quick Export creates one image-led PNG at the source image ratio. Selected data follows the photographic workflow below the image.";
    } else if (projectScope) {
      documentExportHint.textContent =
        "Full Project export creates an A4 cover and exactly one A4 page for every Spot Sketch.";
    } else if (state.exportOptions.documentFormat === "png") {
      documentExportHint.textContent =
        "A4 PNG export creates one fixed A4 image for the current Spot Sketch.";
    } else {
      documentExportHint.textContent =
        "A4 PDF keeps every Spot Sketch on one fixed physical page. Dense records use a compact document density.";
    }
  }

  if (exportWorkspaceExportBtn) {
    exportWorkspaceExportBtn.textContent = isMobileExportWorkflowActive()
      ? "Export PNG"
      : quickExport
        ? "Export Quick PNG"
        : "Export Document";
  }

  if (exportWorkspaceJpegBtn) {
    exportWorkspaceJpegBtn.hidden = !isMobileExportWorkflowActive();
    exportWorkspaceJpegBtn.textContent = "Save";
  }

  if (exportPreviewLabel) {
    exportPreviewLabel.textContent = quickExport
      ? "Quick Export Preview"
      : "A4 Document Preview";
  }

  if (exportPreviewCaption) {
    exportPreviewCaption.textContent = quickExport
      ? "Image-led layout · source aspect ratio"
      : "One A4 page per Spot Sketch";
  }
}

/*
  Refreshes Document Notes from state.
*/
function updateDocumentNotesControls() {
  ensureExportDocumentStructure();

  if (documentNotesInput) {
    documentNotesInput.value = state.documentNotes;
    updateNotesCounter(documentNotesInput, documentNotesCount);
  }

  if (documentNotesStatusBadge) {
    const selected = state.exportOptions.includeDocumentNotes;
    const hasNotes = state.documentNotes.trim().length > 0;

    documentNotesStatusBadge.textContent = !selected
      ? "Excluded"
      : hasNotes
        ? "Included"
        : "Empty";

    documentNotesStatusBadge.classList.toggle(
      "is-complete",
      selected && hasNotes
    );
  }
}

function updateDevelopmentNotesControls() {
  ensureExportDocumentStructure();

  if (developmentNotesInput) {
    developmentNotesInput.value = state.developmentNotes;
    updateNotesCounter(developmentNotesInput, developmentNotesCount);
  }

  if (developmentNotesStatusBadge) {
    const selected = state.exportOptions.includeDevelopmentNotes;
    const hasNotes = state.developmentNotes.trim().length > 0;

    developmentNotesStatusBadge.textContent = !selected
      ? "Excluded"
      : hasNotes
        ? "Included"
        : "Empty";

    developmentNotesStatusBadge.classList.toggle(
      "is-complete",
      selected && hasNotes
    );
  }
}

function refreshSpotSketchDocumentPreview() {
  if (!documentPreviewRoot) return;
  if (typeof buildSpotSketchDocumentModel !== "function") return;

  ensureExportDocumentStructure();
  const model = buildSpotSketchDocumentModel();

  if (state.exportOptions.exportType === "quick") {
    if (typeof renderQuickExport !== "function") return;
    renderQuickExport(documentPreviewRoot, model);
  } else {
    if (typeof renderSpotSketchDocument !== "function") return;
    renderSpotSketchDocument(
      documentPreviewRoot,
      model,
      SPOT_SKETCH_DOCUMENT_LAYOUT,
      { orientation: state.exportOptions.documentOrientation }
    );
  }

}


/*
  Populates Actual Exposure selectors from the central exposure tables.

  Existing options are replaced so this function remains safe to call
  more than once.
*/
function populateActualExposureSelectors() {
  if (
    !actualExposureIsoSelect ||
    !actualExposureShutterSelect ||
    !actualExposureApertureSelect
  ) {
    return;
  }

  actualExposureIsoSelect.innerHTML = `
    <option value="">Select ISO</option>

    ${ISO_VALUES.map(value => `
      <option value="${value}">
        ISO ${value}
      </option>
    `).join("")}
  `;

  actualExposureShutterSelect.innerHTML = `
    <option value="">Select shutter</option>

    ${SHUTTER_VALUES
      .filter(value => value !== "B" && value !== "0")
      .map(value => `
        <option value="${value}">
          ${formatShutterLabel(value)}
        </option>
      `)
      .join("")}
  `;

  actualExposureApertureSelect.innerHTML = `
    <option value="">Select aperture</option>

    ${APERTURES
      .filter(value => value !== "0.0" && value !== "F")
      .map(value => `
        <option value="${value}">
          f ${value}
        </option>
      `)
      .join("")}
  `;
}


/*
  Provides sensible starting values when Actual Exposure is activated
  for the first time.

  ISO and shutter inherit the current recording values. Aperture remains
  an explicit user choice until the new Calculation workflow is built.
*/
function applyActualExposureDefaults() {
  ensureActualExposureStructure();

  if (
    !state.actualExposure.iso &&
    state.initialMeteringSetup.iso
  ) {
    state.actualExposure.iso =
      state.initialMeteringSetup.iso;
  }

  if (
    !state.actualExposure.shutter &&
    state.initialMeteringSetup.shutter
  ) {
    state.actualExposure.shutter =
      state.initialMeteringSetup.shutter;
  }
}


/*
  Returns whether all required Actual Exposure values are present.
*/
function isActualExposureComplete() {
  ensureActualExposureStructure();

  return Boolean(
    state.actualExposure.status === "exposed" &&
    state.actualExposure.iso &&
    state.actualExposure.shutter &&
    state.actualExposure.aperture
  );
}


/*
  Clears the Planned / Actual comparison area.

  The comparison will return with the rebuilt Calculation workflow.
*/
function updateActualExposureComparison() {
  if (!actualExposureComparison) return;

  const calculatedExposure = state.calculation?.exposure;
  const hasCalculatedExposure = Boolean(
    calculatedExposure &&
    calculatedExposure.iso &&
    calculatedExposure.shutter &&
    calculatedExposure.aperture
  );

  actualExposureComparison.classList.remove(
    "is-exact",
    "is-equivalent",
    "is-different",
    "is-calculated-reference"
  );

  const actualComplete = isActualExposureComplete();
  const differsFromCalculated = Boolean(
    actualComplete &&
    hasCalculatedExposure &&
    (
      Number(state.actualExposure.iso) !== Number(calculatedExposure.iso) ||
      String(state.actualExposure.shutter) !== String(calculatedExposure.shutter) ||
      String(state.actualExposure.aperture) !== String(calculatedExposure.aperture)
    )
  );

  if (actualExposureDifferenceIndicator) {
    actualExposureDifferenceIndicator.hidden = !differsFromCalculated;
  }

  if (!hasCalculatedExposure) {
    actualExposureComparison.hidden = true;
    actualExposureComparison.innerHTML = "";
    return;
  }

  actualExposureComparison.innerHTML = `
    <span class="actual-exposure-comparison-label">
      Calculated Exposure
    </span>
    <strong>
      ISO ${calculatedExposure.iso}
      · ${formatShutterLabel(calculatedExposure.shutter)}
      · <i>f</i>${calculatedExposure.aperture}
    </strong>
  `;

  actualExposureComparison.classList.add(
    "is-calculated-reference"
  );
  actualExposureComparison.hidden = false;
}

/*
  Refreshes the Actual Zone marker table.

  Actual Zone calculation only requires:
  - original marker measurements
  - complete Actual Exposure
*/
function updateActualZonePreview() {
  if (!actualZonePreview || !actualZonePreviewCount || !actualZoneTableBody) {
    return;
  }

  actualZonePreview.hidden = true;
  actualZoneTableBody.innerHTML = "";
  actualZonePreviewCount.textContent = "0 markers";

  if (!isActualExposureComplete()) return;

  const markerZones = getAllMarkerActualZones();
  if (!markerZones.length) return;

  const calculatedExposure = state.calculation?.exposure || null;
  const hasCalculatedExposure = Boolean(
    calculatedExposure?.iso && calculatedExposure?.shutter && calculatedExposure?.aperture
  );
  const exposuresMatch = hasCalculatedExposure &&
    Number(state.actualExposure.iso) === Number(calculatedExposure.iso) &&
    String(state.actualExposure.shutter) === String(calculatedExposure.shutter) &&
    String(state.actualExposure.aperture) === String(calculatedExposure.aperture);

  actualZonePreviewCount.textContent = markerZones.length === 1
    ? "1 marker"
    : `${markerZones.length} markers`;

  actualZoneTableBody.innerHTML = markerZones.map(({ marker, actualZone }) => {
    const calculatedZone = hasCalculatedExposure
      ? calculateSpotReadingZone(marker, calculatedExposure)
      : null;
    const zonesMatch = Boolean(
      calculatedZone && String(calculatedZone.label) === String(actualZone.label)
    );
    const statusClass = !calculatedZone
      ? "is-neutral"
      : !zonesMatch
        ? "is-zone-different"
        : exposuresMatch
          ? "is-full-match"
          : "is-zone-match";

    return `
      <div class="actual-zone-table-row">
        <span class="actual-zone-marker-number">#${marker.number}</span>
        <span class="actual-zone-metering-reading"><i>f</i>${actualZone.meteringExposure.aperture}</span>
        <span class="actual-zone-calculated">${calculatedZone ? `Zone ${calculatedZone.label}` : "—"}</span>
        <strong class="actual-zone-result ${statusClass}">Zone ${actualZone.label}</strong>
      </div>
    `;
  }).join("");

  actualZonePreview.hidden = false;
}
/*
  Refreshes the complete Actual Exposure interface from app state.
*/
function updateActualExposureControls() {
  ensureActualExposureStructure();

  const isExposed =
    state.actualExposure.status === "exposed";

  if (actualExposureNotRecordedBtn) {
    actualExposureNotRecordedBtn.classList.toggle(
      "is-active",
      !isExposed
    );
  }

  if (actualExposureExposedBtn) {
    actualExposureExposedBtn.classList.toggle(
      "is-active",
      isExposed
    );
  }

  if (actualExposureFields) {
    actualExposureFields.hidden = !isExposed;
  }

  if (actualExposureNotesField) {
    actualExposureNotesField.hidden = !isExposed;
  }

  const actualExposureComplete =
    isActualExposureComplete();

  if (actualExposureStatusBadge) {
    actualExposureStatusBadge.textContent =
      isExposed
        ? actualExposureComplete
          ? "Recorded"
          : "Incomplete"
        : "Not recorded";

    actualExposureStatusBadge.classList.toggle(
      "is-complete",
      isExposed && actualExposureComplete
    );

    actualExposureStatusBadge.classList.toggle(
      "is-incomplete",
      isExposed && !actualExposureComplete
    );
  }

  if (actualExposureIsoSelect) {
    actualExposureIsoSelect.value =
      state.actualExposure.iso
        ? String(state.actualExposure.iso)
        : "";
  }

  if (actualExposureShutterSelect) {
    actualExposureShutterSelect.value =
      state.actualExposure.shutter || "";
  }

  if (actualExposureApertureSelect) {
    actualExposureApertureSelect.value =
      state.actualExposure.aperture || "";
  }

  if (actualExposureNotesInput) {
    actualExposureNotesInput.value =
      state.actualExposure.notes;

    updateNotesCounter(
      actualExposureNotesInput,
      actualExposureNotesCount
    );
  }

  if (actualExposureSummary) {
    if (!isExposed) {
      actualExposureSummary.textContent =
        "No Actual Exposure has been recorded.";

      actualExposureSummary.classList.remove(
        "is-complete",
        "is-incomplete"
      );
    } else if (!actualExposureComplete) {
      actualExposureSummary.textContent =
        "Select ISO, shutter and aperture to complete the Actual Exposure.";

      actualExposureSummary.classList.remove(
        "is-complete"
      );

      actualExposureSummary.classList.add(
        "is-incomplete"
      );
    } else {
      actualExposureSummary.innerHTML = `
        <span>Actual Exposure</span>

        <strong>
          ISO ${state.actualExposure.iso}
          · ${formatShutterLabel(state.actualExposure.shutter)}
          · <i>f</i>${state.actualExposure.aperture}
        </strong>
      `;

      actualExposureSummary.classList.remove(
        "is-incomplete"
      );

      actualExposureSummary.classList.add(
        "is-complete"
      );
    }
  }

  updateActualExposureComparison();
  updateActualZonePreview();
}

/*
  Changes the current Actual Exposure status.
*/
function setActualExposureStatus(status) {
  ensureActualExposureStructure();

  if (
    status !== "not-recorded" &&
    status !== "exposed"
  ) {
    return;
  }

  state.actualExposure.status = status;

  if (status === "exposed") {
    applyActualExposureDefaults();
  }

  updateActualExposureControls();
}


/*
  Opens the Export Workspace.

  The workspace is only available after an image has been loaded.
*/
function openExportWorkspace() {
  if (!state.imageCanvas) {
    showDialog({
      title: "",
      message: "Add an image first.",
      okText: "Add Image",
      cancelText: "Cancel",
      success: true,

      onConfirm() {
        if (!fileInput) return;

        fileInput.value = "";
        fileInput.click();
      }
    });

    return;
  }

  if (!exportWorkspaceOverlay) return;

  hidePicker();
  closeHeaderMenus();

  ensureActualExposureStructure();
  ensureExportDocumentStructure();
  applyMobileExportWorkflowDefaults();

  populateActualExposureSelectors();

  updateActualExposureControls();
  updateExportContentControls();
  updateDocumentExportControls();
  updateDocumentNotesControls();
  updateDevelopmentNotesControls();
  refreshSpotSketchDocumentPreview();

  /*
    Reset any scroll position that may have been created by browser
    focus handling during a previous Export Workspace session.
  */
  if (exportWorkspace) {
    exportWorkspace.scrollTop = 0;
    exportWorkspace.scrollLeft = 0;
  }

  if (exportWorkspaceSettings) {
    exportWorkspaceSettings.scrollTop = 0;
  }

  exportWorkspaceOverlay.hidden = false;
  document.body.classList.add("export-workspace-open");
}


/*
  Closes the Export Workspace without exporting.
*/
function closeExportWorkspace() {
  if (!exportWorkspaceOverlay) return;

  exportWorkspaceOverlay.hidden = true;
  document.body.classList.remove("export-workspace-open");
}

/*
────────────────────────────────────────────
3. Export Workspace Controls
────────────────────────────────────────────
*/

/*
  Close button.
*/
if (exportWorkspaceCloseBtn) {
  exportWorkspaceCloseBtn.addEventListener("click", event => {
    event.stopPropagation();
    closeExportWorkspace();
  });
}


/*
  Footer Cancel button.
*/
if (exportWorkspaceCancelBtn) {
  exportWorkspaceCancelBtn.addEventListener("click", event => {
    event.stopPropagation();
    closeExportWorkspace();
  });
}


/*
  Exports the same renderer that is shown in the preview.
*/
function hasSelectedExportContent() {
  ensureExportDocumentStructure();

  return [
    "includeImageAndMarkers",
    "includeMeteringInformation",
    "includeActualExposure",
    "includeGearSettings",
    "includeDocumentNotes",
    "includeDevelopmentNotes"
  ].some(key => state.exportOptions[key]);
}

if (exportWorkspaceJpegBtn) {
  exportWorkspaceJpegBtn.addEventListener("click", async event => {
    event.stopPropagation();

    const exportDocument = globalThis.exportSpotSketchDocument;
    if (typeof exportDocument !== "function") return;

    exportWorkspaceJpegBtn.disabled = true;
    exportWorkspaceJpegBtn.textContent = "Preparing…";

    try {
      const result = await exportDocument({
        type: "quick",
        scope: "current",
        format: "jpeg",
        delivery: "share"
      });

      if (result?.delivery === "cancelled") return;

      showAppNotification({
        type: "success",
        title: result?.delivery === "share" ? "Ready to share" : "JPEG saved",
        message: result?.delivery === "share"
          ? "The JPEG export was sent to the device sharing panel."
          : "A compatible JPEG copy was downloaded."
      });
    } catch (error) {
      showAppNotification({
        type: "error",
        title: "JPEG export failed",
        message: error?.message || "The JPEG copy could not be created."
      });
    } finally {
      exportWorkspaceJpegBtn.disabled = false;
      exportWorkspaceJpegBtn.textContent = "Save";
    }
  });
}


if (exportWorkspaceExportBtn) {
  exportWorkspaceExportBtn.addEventListener("click", async event => {
    event.stopPropagation();

    const exportDocument = globalThis.exportSpotSketchDocument;

    if (!hasSelectedExportContent()) {
      showDialog({
        title: "Nothing selected",
        message: "Select at least one content group before exporting.",
        okText: "OK",
        showCancel: false,
        danger: true
      });
      return;
    }

    if (typeof exportDocument !== "function") {
      const status =
        globalThis.__spotSketchModuleStatus?.documentExport ||
        "not loaded";

      const rasterizerStatus =
        typeof globalThis.html2canvas === "function"
          ? "ready"
          : "missing";

      showDialog({
        title: "Export is unavailable",
        message:
          "The Document Export module is not ready.\n\n" +
          `Document Export: ${status}\n` +
          `Offline rasterizer: ${rasterizerStatus}\n\n` +
          "Replace the complete Export Stabilization file set and reload the page with cache disabled.",
        okText: "OK",
        showCancel: false,
        danger: true
      });
      return;
    }

    exportWorkspaceExportBtn.disabled = true;
    exportWorkspaceExportBtn.textContent = "Preparing…";

    try {
      const exportRequest = isMobileExportWorkflowActive()
        ? {
            type: "quick",
            scope: "current",
            format: "png",
            delivery: "download",
            orientation: state.exportOptions.documentOrientation
          }
        : {
            type: state.exportOptions.exportType,
            scope: state.exportOptions.documentScope,
            format: state.exportOptions.documentFormat,
            orientation: state.exportOptions.documentOrientation
          };

      const result = await exportDocument(exportRequest);

      const pageCount = result?.pageCount || 1;
      if (result?.delivery === "cancelled") {
        return;
      }

      const message = result?.type === "quick"
        ? result?.delivery === "share"
          ? "The Quick Export was sent to the device sharing panel."
          : `The image-led Quick Export ${String(result?.format || "png").toUpperCase()} was created.`
        : state.exportOptions.documentScope === "project"
          ? `The complete Project PDF was created with ${pageCount} A4 page${pageCount === 1 ? "" : "s"}.`
          : `The ${String(result?.format || state.exportOptions.documentFormat).toUpperCase()} document was created with ${pageCount} A4 page${pageCount === 1 ? "" : "s"}.`;

      showAppNotification("Export complete", message);
    } catch (error) {
      console.error("Spot Sketch export failed.", error);
      showDialog({
        title: "Document could not be exported",
        message: error?.message || "An unexpected export error occurred.",
        okText: "OK",
        showCancel: false,
        danger: true
      });
    } finally {
      exportWorkspaceExportBtn.disabled = false;
      updateDocumentExportControls();
    }
  });
}

if (documentExportType) {
  documentExportType.addEventListener("change", () => {
    state.exportOptions.exportType = documentExportType.value === "quick"
      ? "quick"
      : "document";

    if (state.exportOptions.exportType === "quick") {
      state.exportOptions.documentScope = "current";
      state.exportOptions.documentFormat = "png";
    }

    updateDocumentExportControls();
    refreshSpotSketchDocumentPreview();
  });
}

if (documentExportScope) {
  documentExportScope.addEventListener("change", () => {
    state.exportOptions.documentScope = documentExportScope.value === "project"
      ? "project"
      : "current";

    if (state.exportOptions.documentScope === "project") {
      state.exportOptions.exportType = "document";
      state.exportOptions.documentFormat = "pdf";
    }

    updateDocumentExportControls();
    refreshSpotSketchDocumentPreview();
  });
}

if (documentExportFormat) {
  documentExportFormat.addEventListener("change", () => {
    state.exportOptions.documentFormat = documentExportFormat.value === "png"
      ? "png"
      : "pdf";
    updateDocumentExportControls();
  });
}

if (documentExportOrientation) {
  documentExportOrientation.addEventListener("change", () => {
    const value = documentExportOrientation.value;
    state.exportOptions.documentOrientation = ["portrait", "landscape"].includes(value)
      ? value
      : "auto";
    updateDocumentExportControls();
    refreshSpotSketchDocumentPreview();
  });
}

/*
  Actual Exposure status controls.
*/
if (actualExposureNotRecordedBtn) {
  actualExposureNotRecordedBtn.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      setActualExposureStatus("not-recorded");
      refreshSpotSketchDocumentPreview();
    }
  );
}


if (actualExposureExposedBtn) {
  actualExposureExposedBtn.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      setActualExposureStatus("exposed");
      refreshSpotSketchDocumentPreview();
    }
  );
}


/*
  Actual ISO selection.
*/
if (actualExposureIsoSelect) {
  actualExposureIsoSelect.addEventListener(
    "change",
    () => {
      const value = Number(
        actualExposureIsoSelect.value
      );

      state.actualExposure.iso =
        Number.isFinite(value) && value > 0
          ? value
          : null;

      updateActualExposureControls();
    }
  );
}


/*
  Actual shutter selection.
*/
if (actualExposureShutterSelect) {
  actualExposureShutterSelect.addEventListener(
    "change",
    () => {
      state.actualExposure.shutter =
        actualExposureShutterSelect.value || null;

      updateActualExposureControls();
    }
  );
}


/*
  Actual aperture selection.
*/
if (actualExposureApertureSelect) {
  actualExposureApertureSelect.addEventListener(
    "change",
    () => {
      state.actualExposure.aperture =
        actualExposureApertureSelect.value || null;

      updateActualExposureControls();
    }
  );
}


/*
  Exposure Notes.

  The text is saved continuously into the current Spot Sketch state.
*/
if (actualExposureNotesInput) {
  actualExposureNotesInput.addEventListener(
    "input",
    () => {
      ensureActualExposureStructure();

      state.actualExposure.notes =
        actualExposureNotesInput.value;

      updateNotesCounter(
        actualExposureNotesInput,
        actualExposureNotesCount
      );
    }
  );
}


/*
  Document Content options.
*/
const exportContentBindings = [
  [exportIncludeImageInput, "includeImageAndMarkers"],
  [exportIncludeMeteringInput, "includeMeteringInformation"],
  [exportIncludeActualInput, "includeActualExposure"],
  [exportIncludeGearInput, "includeGearSettings"],
  [exportIncludeDocumentNotesInput, "includeDocumentNotes"],
  [exportIncludeDevelopmentNotesInput, "includeDevelopmentNotes"]
];

for (const [input, key] of exportContentBindings) {
  if (!input) continue;

  input.addEventListener("change", () => {
    ensureExportDocumentStructure();
    state.exportOptions[key] = input.checked;
    updateDocumentNotesControls();
    updateDevelopmentNotesControls();
    });
}


/*
  General Document Notes.

  Empty notes are simply omitted from the future export document.
*/
if (documentNotesInput) {
  documentNotesInput.addEventListener(
    "input",
    () => {
      ensureExportDocumentStructure();

      state.documentNotes =
        documentNotesInput.value;

      updateDocumentNotesControls();
    }
  );
}


if (developmentNotesInput) {
  developmentNotesInput.addEventListener("input", () => {
    ensureExportDocumentStructure();
    state.developmentNotes = developmentNotesInput.value;
    updateDevelopmentNotesControls();
    refreshSpotSketchDocumentPreview();
  });
}

/*
  One shared preview refresh path keeps rendering centralized. Every
  stateful control inside the workspace may trigger the same renderer.
*/
if (exportWorkspace) {
  exportWorkspace.addEventListener("input", refreshSpotSketchDocumentPreview);
  exportWorkspace.addEventListener("change", refreshSpotSketchDocumentPreview);
  exportWorkspace.addEventListener("click", event => {
    if (event.target.closest("button, input, select, textarea")) {
      window.requestAnimationFrame(refreshSpotSketchDocumentPreview);
    }
  });
}



/*
  Prevent clicks inside the workspace from reaching the overlay.
*/
if (exportWorkspace) {
  exportWorkspace.addEventListener("click", event => {
    event.stopPropagation();
  });
}
