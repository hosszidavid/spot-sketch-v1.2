"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Document Renderer

Purpose:
Renders one fixed A4 page for each Spot Sketch from the shared Document
Model. The renderer owns document markup; layout geometry remains in
document-layout.js and file generation remains in document-export.js.
==========================================================
*/

function escapeDocumentHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveSpotSketchDocumentOrientation(model, requested = "auto") {
  if (requested === "portrait" || requested === "landscape") {
    return requested;
  }

  return Number(model?.image?.width || 1) >= Number(model?.image?.height || 1)
    ? "landscape"
    : "portrait";
}

function documentPageStyle(layout, orientation) {
  const geometry = layout.page[orientation];

  return [
    `--ssd-page-width:${geometry.width}px`,
    `--ssd-page-height:${geometry.height}px`,
    `--ssd-page-padding:${layout.page.padding}px`,
    `--ssd-page-gap:${layout.page.gap}px`
  ].join(";");
}

function getDocumentTextLoad(model) {
  const notesLength =
    String(model.documentNotes?.value || "").length +
    String(model.developmentNotes?.value || "").length +
    String(model.workflow?.actualExposure?.notes || "").length;

  const gearUnitLengths = Object.values(model.gear?.units || {}).map(
    unit =>
      String(unit?.value || "").length +
      String(unit?.secondary || "").length +
      String(unit?.notes || "").length
  );
  const gearLength = gearUnitLengths.reduce((total, length) => total + length, 0);

  return {
    readings: model.workflow?.measurementRecord?.rows?.length || 0,
    notesLength,
    gearLength,
    maxGearUnitLength: Math.max(0, ...gearUnitLengths)
  };
}

function resolveDocumentDensity(model, layout, orientation) {
  const load = getDocumentTextLoad(model);
  const limits = layout.singlePage?.density?.[orientation] || {};

  if (
    load.readings > (limits.denseReadings || 14) ||
    load.notesLength > (limits.denseNotes || 1500) ||
    load.gearLength > (limits.denseGear || 1400)
  ) {
    return "dense";
  }

  if (
    load.readings > (limits.compactReadings || 7) ||
    load.notesLength > (limits.compactNotes || 600) ||
    load.gearLength > (limits.compactGear || 650)
  ) {
    return "compact";
  }

  return "normal";
}


function resolveDocumentContentScale(model, orientation, density) {
  if (density === "normal") return 1;

  const load = getDocumentTextLoad(model);
  const capacities = orientation === "landscape"
    ? { readings: 18, notes: 1900, gear: 1700 }
    : { readings: 14, notes: 1450, gear: 1350 };
  const pressure = Math.max(
    1,
    load.readings / capacities.readings,
    load.notesLength / capacities.notes,
    load.gearLength / capacities.gear,
    load.maxGearUnitLength / 240
  );
  const base = density === "dense" ? 0.82 : 0.92;
  const scale = Math.max(0.30, base / Math.sqrt(pressure));

  return Math.round(scale * 1000) / 1000;
}

function renderDocumentBrand(identity) {
  return `
    <div class="ssd-brand">
      <span class="ssd-logo-dot"><span></span></span>
      <div>
        <strong>${escapeDocumentHtml(identity.brand)}</strong>
        <small>${escapeDocumentHtml(identity.strapline)}</small>
      </div>
    </div>
  `;
}

function renderDocumentIdentity(identity) {
  return `
    <div class="ssd-identity">
      <div><span>Project</span><strong>${escapeDocumentHtml(identity.projectName)}</strong></div>
      <div><span>Image</span><strong>${escapeDocumentHtml(identity.imageName)}</strong></div>
      <div><span>Identifier</span><strong>${escapeDocumentHtml(identity.identifier)}</strong></div>
      <div><span>Location</span><strong>${escapeDocumentHtml(identity.location)}</strong><small>${escapeDocumentHtml(identity.coordinates)}</small></div>
    </div>
  `;
}

function renderA4Header(identity) {
  return `
    <header class="ssd-header">
      ${renderDocumentBrand(identity)}
      ${renderDocumentIdentity(identity)}
    </header>
  `;
}

function renderA4Footer(model, label = "Spot Sketch Document") {
  return `
    <footer class="ssd-footer">
      <span>${escapeDocumentHtml(label)}</span>
      <span>${escapeDocumentHtml(model.identity.identifier)} · Page 1 of 1</span>
    </footer>
  `;
}

function renderExposureValues(exposure) {
  return `
    <div class="ssd-exposure-values">
      <strong>${escapeDocumentHtml(exposure.iso)}</strong>
      <strong>${escapeDocumentHtml(exposure.shutter)}</strong>
      <strong>${escapeDocumentHtml(exposure.aperture)}</strong>
    </div>
  `;
}

function renderInitialMeteringUnit(unit) {
  return `
    <section class="ssd-workflow-unit ssd-initial">
      <div class="ssd-unit-kicker">${escapeDocumentHtml(unit.title)}</div>
      <div class="ssd-initial-values">
        <div><span>ISO</span><strong>${escapeDocumentHtml(unit.exposure.iso)}</strong></div>
        <div><span>Shutter</span><strong>${escapeDocumentHtml(unit.exposure.shutter)}</strong></div>
      </div>
    </section>
  `;
}

function renderReferenceUnit(unit) {
  return `
    <section class="ssd-workflow-unit ssd-reference">
      <div class="ssd-unit-kicker">${escapeDocumentHtml(unit.title)}</div>
      <div class="ssd-reference-values">
        <strong>${escapeDocumentHtml(unit.reference)}</strong>
        <strong>${escapeDocumentHtml(unit.zone)}</strong>
      </div>
    </section>
  `;
}

function renderCalculatedUnit(unit) {
  return `
    <section class="ssd-workflow-unit ssd-calculated">
      <div class="ssd-unit-kicker">${escapeDocumentHtml(unit.title)}</div>
      ${renderExposureValues(unit.exposure)}
    </section>
  `;
}

function renderActualUnit(unit) {
  return `
    <section class="ssd-workflow-unit ssd-actual ${unit.status === "Exposed" ? "is-exposed" : "is-empty"}">
      <div class="ssd-unit-heading-row">
        <div class="ssd-unit-kicker">${escapeDocumentHtml(unit.title)}</div>
        <span class="ssd-status">${escapeDocumentHtml(unit.status)}</span>
      </div>
      ${renderExposureValues(unit.exposure)}
      <p class="ssd-actual-notes">${escapeDocumentHtml(unit.notes)}</p>
    </section>
  `;
}

function renderSpotSketchImageModule(model) {
  const markers = model.image.readings.map(reading => `
    <span
      class="ssd-image-marker ${reading.isReference ? "is-reference" : ""}"
      style="left:${reading.x * 100}%;top:${reading.y * 100}%">
      ${reading.number}
    </span>
  `).join("");

  return `
    <section class="ssd-module ssd-image-module">
      <div class="ssd-module-heading">Image + Spot Readings</div>
      <div class="ssd-image-frame">
        ${model.image.dataUrl
          ? `<img src="${model.image.dataUrl}" alt="Spot Sketch image">`
          : `<div class="ssd-image-empty">No image loaded</div>`}
        ${markers}
      </div>
      <div class="ssd-image-caption">Numbered points correspond directly to the Measurement Record.</div>
    </section>
  `;
}

function renderMeasurementTable(rows) {
  const content = rows.length
    ? rows.map(row => `
        <div class="ssd-reading-row ${row.isReference ? "is-reference" : ""}">
          <span class="ssd-reading-number">#${row.number}${row.isReference ? `<small>REF</small>` : ""}</span>
          <span>${escapeDocumentHtml(row.original)}</span>
          <span><strong>${escapeDocumentHtml(row.plannedZone)}</strong><small>EV ${escapeDocumentHtml(row.plannedEv)}</small></span>
          <span><strong>${escapeDocumentHtml(row.actualZone)}</strong><small>EV ${escapeDocumentHtml(row.actualEv)}</small></span>
        </div>
      `).join("")
    : `<div class="ssd-reading-empty">No Spot Readings recorded.</div>`;

  return `
    <div class="ssd-reading-table ssd-reading-table-single">
      <div class="ssd-reading-head">
        <span>#</span><span>Original</span><span>Planned</span><span>Actual</span>
      </div>
      ${content}
    </div>
  `;
}

function renderSinglePageWorkflow(model) {
  const units = [];

  if (model.content.includeMeteringInformation) {
    units.push(renderInitialMeteringUnit(model.workflow.initialMetering));
    units.push(`
      <section class="ssd-workflow-unit ssd-measurement-unit">
        <div class="ssd-unit-kicker">${escapeDocumentHtml(model.workflow.measurementRecord.title)}</div>
        ${renderMeasurementTable(model.workflow.measurementRecord.rows)}
      </section>
    `);
    units.push(`
      <div class="ssd-workflow-pair">
        ${renderReferenceUnit(model.workflow.referencePlacement)}
        ${renderCalculatedUnit(model.workflow.calculatedExposure)}
      </div>
    `);
  }

  if (model.content.includeActualExposure) {
    units.push(renderActualUnit(model.workflow.actualExposure));
  }

  if (!units.length) return "";

  return `
    <section class="ssd-module ssd-workflow-module ssd-workflow-single">
      <div class="ssd-module-heading">Exposure Workflow</div>
      <div class="ssd-workflow-grid">${units.join("")}</div>
    </section>
  `;
}

function buildGearEntries(model) {
  const order = [
    "camera",
    "lens",
    "filter",
    "film",
    "filmHolder",
    "lightMeter",
    "lighting",
    "gearNotes"
  ];

  return order.map(key => {
    const unit = model.gear.units[key];
    return {
      label: unit.label,
      value: unit.value,
      secondary: unit.secondary || "",
      notes: unit.notes || ""
    };
  });
}

function renderSinglePageGear(model) {
  if (!model.content.includeGearSettings) return "";

  return `
    <section class="ssd-module ssd-gear-module ssd-gear-single">
      <div class="ssd-module-heading">Gear Settings</div>
      <div class="ssd-gear-grid">
        ${buildGearEntries(model).map(unit => `
          <article class="ssd-gear-unit">
            <div class="ssd-gear-label">${escapeDocumentHtml(unit.label)}</div>
            <strong>${escapeDocumentHtml(unit.value || "Not recorded")}</strong>
            ${unit.secondary ? `<span class="ssd-gear-secondary">${escapeDocumentHtml(unit.secondary)}</span>` : ""}
            ${unit.notes ? `<p>${escapeDocumentHtml(unit.notes)}</p>` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSinglePageNotes(model) {
  const notes = [];

  if (model.content.includeDocumentNotes) {
    notes.push(model.documentNotes);
  }

  if (model.content.includeDevelopmentNotes) {
    notes.push(model.developmentNotes);
  }

  if (!notes.length) return "";

  return `
    <div class="ssd-single-notes-grid ssd-note-count-${notes.length}">
      ${notes.map(unit => {
        const value = String(unit.value || "").trim();
        return `
          <section class="ssd-module ssd-notes-module ${value ? "" : "is-empty"}">
            <div class="ssd-module-heading">${escapeDocumentHtml(unit.title)}</div>
            <div class="ssd-notes-area">${escapeDocumentHtml(value || "Not recorded")}</div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderSinglePageContent(model) {
  const includeImage = model.content.includeImageAndMarkers;
  const workflow = renderSinglePageWorkflow(model);
  const gear = renderSinglePageGear(model);
  const notes = renderSinglePageNotes(model);
  const hasSide = Boolean(workflow || gear);

  if (!includeImage && !hasSide && !notes) {
    return `
      <section class="ssd-empty-document-state">
        <strong>No content modules selected</strong>
        <p>The identity header remains part of every Spot Sketch document.</p>
      </section>
    `;
  }

  return `
    <div class="ssd-single-page-grid ${includeImage ? "has-image" : ""} ${hasSide ? "has-side" : ""} ${notes ? "has-notes" : ""}">
      ${includeImage ? renderSpotSketchImageModule(model) : ""}
      ${hasSide ? `<div class="ssd-single-side">${workflow}${gear}</div>` : ""}
      ${notes}
    </div>
  `;
}

function createSpotSketchDocumentElements(
  model,
  layout = SPOT_SKETCH_DOCUMENT_LAYOUT,
  requestedOrientation = "auto"
) {
  const orientation = resolveSpotSketchDocumentOrientation(
    model,
    requestedOrientation
  );
  const density = resolveDocumentDensity(model, layout, orientation);
  const contentScale = resolveDocumentContentScale(model, orientation, density);
  const host = document.createElement("div");

  host.innerHTML = `
    <article
      class="ssd-page ssd-a4-page ssd-orientation-${orientation} ssd-page-single ssd-density-${density}"
      data-document-orientation="${orientation}"
      data-document-density="${density}"
      style="${documentPageStyle(layout, orientation)};--ssd-content-scale:${contentScale}">
      ${renderA4Header(model.identity)}
      <main class="ssd-page-content">
        <div class="ssd-page-fit-content">
          ${renderSinglePageContent(model)}
        </div>
      </main>
      ${renderA4Footer(model)}
    </article>
  `;

  return [host.firstElementChild];
}

function renderSpotSketchDocument(
  target,
  model,
  layout = SPOT_SKETCH_DOCUMENT_LAYOUT,
  options = {}
) {
  if (!target || !model || !layout) return;

  const pages = createSpotSketchDocumentElements(
    model,
    layout,
    options.orientation || "auto"
  );

  target.innerHTML = "";
  pages.forEach(page => target.appendChild(page));

  if (typeof fitSpotSketchDocumentPage === "function") {
    pages.forEach(page => fitSpotSketchDocumentPage(page));
  }
}

function createProjectCoverElement(model) {
  const host = document.createElement("div");
  host.innerHTML = `
    <article
      class="ssd-page ssd-a4-page ssd-project-cover ssd-orientation-portrait"
      data-document-orientation="portrait"
      style="${documentPageStyle(SPOT_SKETCH_DOCUMENT_LAYOUT, "portrait")}">
      <div class="ssd-cover-brand">
        <span class="ssd-logo-dot"><span></span></span>
        <div>
          <strong>${escapeDocumentHtml(model.brand)}</strong>
          <small>${escapeDocumentHtml(model.strapline)}</small>
        </div>
      </div>

      <div class="ssd-cover-content">
        <span class="ssd-cover-kicker">Project Document</span>
        <h1>${escapeDocumentHtml(model.projectName)}</h1>
        <p>${model.spotSketchCount} Spot Sketch${model.spotSketchCount === 1 ? "" : "es"}</p>
      </div>

      <div class="ssd-cover-notes ${model.notes ? "" : "is-empty"}">
        <span>Project Notes</span>
        <p>${escapeDocumentHtml(model.notes)}</p>
      </div>

      <footer class="ssd-cover-footer">
        <span>Spot Sketch Project Document</span>
        <span>${escapeDocumentHtml(model.generatedAt)}</span>
      </footer>
    </article>
  `;

  return host.firstElementChild;
}
