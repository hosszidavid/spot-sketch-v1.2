"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Quick Export

Purpose:
Renders a compact, image-led, non-A4 Spot Sketch export. The shared
Document Model supplies all data; this module owns only Quick Export markup.

Owns:
- Quick Export structure
- compact workflow grouping
- Quick Export image markers

Does NOT own:
- exposure calculations
- project persistence
- A4 Document layout
- rasterization or file download
==========================================================
*/

function escapeQuickExportHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuickExposureLine(exposure) {
  return [exposure.iso, exposure.shutter, exposure.aperture]
    .filter(value => value && !String(value).endsWith("—"))
    .map(escapeQuickExportHtml)
    .join(" · ") || "Not recorded";
}

function renderQuickSpotReadingRows(model) {
  const rows = model.workflow.measurementRecord.rows;

  if (!rows.length) {
    return `<p class="ssq-empty">No Spot Readings recorded.</p>`;
  }

  return `
    <div class="ssq-reading-list">
      ${rows.map(row => `
        <div class="ssq-reading-row ${row.isReference ? "is-reference" : ""}">
          <strong>#${row.number}${row.isReference ? " · REF" : ""}</strong>
          <span>${escapeQuickExportHtml(row.original)}</span>
          <span>${escapeQuickExportHtml(row.plannedZone)}</span>
          <span>${escapeQuickExportHtml(row.actualZone)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderQuickGearRows(model) {
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

  return `
    <div class="ssq-gear-grid">
      ${order.map(key => {
        const unit = model.gear.units[key];
        const name = unit.value || "Not recorded";
        const details = [unit.secondary, unit.notes]
          .filter(Boolean)
          .join(" · ");

        return `
          <div class="ssq-gear-row">
            <span class="ssq-gear-label">${escapeQuickExportHtml(unit.label)}</span>
            <strong class="ssq-gear-name">${escapeQuickExportHtml(name)}</strong>
            ${details
              ? `<small>${escapeQuickExportHtml(details)}</small>`
              : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getQuickReadingAnnotationPlacement(reading) {
  const x = Number(reading?.x ?? 0.5);
  const y = Number(reading?.y ?? 0.5);
  const horizontal = x < 0.13 ? "near-left" : x > 0.87 ? "near-right" : "center";
  const vertical = y < 0.16 ? "near-top" : y > 0.84 ? "near-bottom" : "middle";
  return `is-${horizontal} is-${vertical}`;
}


function renderQuickImage(model) {
  const markers = model.image.readings.map(reading => `
    <span
      class="ssq-reading-annotation ${reading.isReference ? "is-reference" : ""} ${getQuickReadingAnnotationPlacement(reading)}"
      style="left:${reading.x * 100}%;top:${reading.y * 100}%">
      <span class="ssq-reading-pin"></span>
      <span class="ssq-reading-bubble">
        <strong>#${reading.number}</strong>
        <span>${escapeQuickExportHtml(reading.original || "f/—")}</span>
      </span>
    </span>
  `).join("");

  return `
    <figure class="ssq-image-block">
      <div class="ssq-image-frame">
        ${model.image.dataUrl
          ? `<img src="${model.image.dataUrl}" alt="Spot Sketch image">`
          : `<div class="ssq-image-empty">No image loaded</div>`}
        ${markers}
      </div>
    </figure>
  `;
}

function renderQuickRecordingSection(model) {
  const workflow = model.workflow;

  return `
    <section class="ssq-section ssq-recording-section">
      <h2>Recording</h2>
      <div class="ssq-key-value-list ssq-key-value-list-single">
        <div><strong>Initial Metering</strong><span>${escapeQuickExportHtml(workflow.initialMetering.exposure.iso)} · ${escapeQuickExportHtml(workflow.initialMetering.exposure.shutter)}</span></div>
        <div><strong>LAT</strong><span>${workflow.lat === "--" ? "—" : `${escapeQuickExportHtml(workflow.lat)} stops`}</span></div>
        <div><strong>Reference</strong><span>${escapeQuickExportHtml(workflow.referencePlacement.reference)} · ${escapeQuickExportHtml(workflow.referencePlacement.zone)}</span></div>
        <div><strong>Calculation</strong><span>${renderQuickExposureLine(workflow.calculatedExposure.exposure)}</span></div>
      </div>
    </section>
  `;
}

function renderQuickReadingsSection(model) {
  return `
    <section class="ssq-section ssq-readings-section">
      <h2>Spot Readings</h2>
      <p class="ssq-reading-guide">Number · Original metered aperture · Calculated Zone · Actual Zone</p>
      ${renderQuickSpotReadingRows(model)}
    </section>
  `;
}

function renderQuickActualSection(model) {
  const actual = model.workflow.actualExposure;

  return `
    <section class="ssq-section ssq-actual-section">
      <h2>Exposure</h2>
      <div class="ssq-key-value-list ssq-key-value-list-single">
        <div class="ssq-actual-exposure-row"><strong>Actual Exposure</strong><span>${escapeQuickExportHtml(actual.status)} · ${renderQuickExposureLine(actual.exposure)}</span></div>
        <div class="ssq-exposure-notes-row"><strong>Exposure Notes</strong><span>${escapeQuickExportHtml(actual.notes)}</span></div>
      </div>
    </section>
  `;
}

function renderQuickNotesSection(title, value, className) {
  return `
    <section class="ssq-section ${className}">
      <h2>${escapeQuickExportHtml(title)}</h2>
      <p class="ssq-notes">${escapeQuickExportHtml(value || "")}</p>
    </section>
  `;
}

function renderQuickWorkflow(model) {
  const rows = [];

  if (model.content.includeMeteringInformation) {
    rows.push(`
      <div class="ssq-module-grid ssq-module-grid-primary">
        ${renderQuickRecordingSection(model)}
        ${renderQuickReadingsSection(model)}
      </div>
    `);
  }

  const secondarySections = [];

  if (model.content.includeActualExposure) {
    secondarySections.push(renderQuickActualSection(model));
  }

  if (model.content.includeGearSettings) {
    secondarySections.push(`
      <section class="ssq-section ssq-gear-section">
        <h2>Gear</h2>
        ${renderQuickGearRows(model)}
      </section>
    `);
  }

  if (secondarySections.length) {
    rows.push(`
      <div class="ssq-module-grid ssq-module-grid-secondary ssq-module-count-${secondarySections.length}">
        ${secondarySections.join("")}
      </div>
    `);
  }

  const noteSections = [];

  if (model.content.includeDocumentNotes) {
    noteSections.push(
      renderQuickNotesSection(
        model.documentNotes.title,
        model.documentNotes.value,
        "ssq-document-notes-section"
      )
    );
  }

  if (model.content.includeDevelopmentNotes) {
    noteSections.push(
      renderQuickNotesSection(
        model.developmentNotes.title,
        model.developmentNotes.value,
        "ssq-development-notes-section"
      )
    );
  }

  if (noteSections.length) {
    rows.push(`
      <div class="ssq-module-grid ssq-module-grid-notes ssq-module-count-${noteSections.length}">
        ${noteSections.join("")}
      </div>
    `);
  }

  return rows.join("");
}

function createQuickExportElement(model) {
  const host = document.createElement("div");

  host.innerHTML = `
    <article class="ssq-export">
      <header class="ssq-header">
        <div class="ssq-brand">
          <span class="ssq-logo-dot" aria-hidden="true"></span>
          <div>
            <h1>Spot Sketch</h1>
            <strong>${escapeQuickExportHtml(model.identity.projectName)}</strong>
          </div>
        </div>

        <div class="ssq-header-meta">
          <span><small>Image Identifier</small>${escapeQuickExportHtml(model.identity.identifier)}</span>
          <span><small>Location</small>${escapeQuickExportHtml(model.identity.location)}</span>
          <span><small>Exported</small>${escapeQuickExportHtml(model.identity.generatedAt)}</span>
        </div>
      </header>

      ${model.content.includeImageAndMarkers ? renderQuickImage(model) : ""}

      <main class="ssq-content">
        ${renderQuickWorkflow(model)}
      </main>

      <footer class="ssq-footer">
        <span>Spot Sketch Quick Export</span>
        <span>${escapeQuickExportHtml(model.identity.identifier)}</span>
      </footer>
    </article>
  `;

  return host.firstElementChild;
}

function renderQuickExport(target, model) {
  if (!target || !model) return;

  target.innerHTML = "";
  target.appendChild(createQuickExportElement(model));
}


