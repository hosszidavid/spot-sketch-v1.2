"use strict";

globalThis.__spotSketchModuleStatus =
  globalThis.__spotSketchModuleStatus || {};

globalThis.__spotSketchModuleStatus.documentExport = "executing";

/*
==========================================================
SPOT SKETCH

Module:
Document Export

Purpose:
Exports fixed A4 document pages to PNG/PDF and the image-led Quick Export
to PNG. Preview and files use the same DOM renderers.
==========================================================
*/

const DOCUMENT_EXPORT_PORTRAIT_RASTER_WIDTH = 1800;
const DOCUMENT_EXPORT_LANDSCAPE_RASTER_WIDTH = 2546;
const QUICK_EXPORT_RASTER_WIDTH = 1800;
const DOCUMENT_EXPORT_JPEG_QUALITY = 0.94;

function getCurrentExportProjectDocument() {
  if (typeof commitCurrentSpotSketchToMemory === "function") {
    commitCurrentSpotSketchToMemory();
  }

  if (loadedProjectDocument) {
    return structuredClone(loadedProjectDocument);
  }

  return buildCurrentProjectDocument();
}

function getDocumentExportModels(scope = "current") {
  const projectDocument = getCurrentExportProjectDocument();

  if (scope === "project") {
    const orderedIds = projectDocument.project?.spotSketchOrder || [];
    const byId = new Map(
      (projectDocument.spotSketches || []).map(sketch => [sketch.id, sketch])
    );

    const orderedSketches = [
      ...orderedIds.map(id => byId.get(id)).filter(Boolean),
      ...(projectDocument.spotSketches || []).filter(
        sketch => !orderedIds.includes(sketch.id)
      )
    ];

    return [
      { type: "project-cover", model: buildProjectCoverModel(projectDocument) },
      ...orderedSketches.map(sketch => ({
        type: "spot-sketch",
        model: buildSpotSketchDocumentModelFromRecord(sketch, projectDocument)
      }))
    ];
  }

  return [{ type: "spot-sketch", model: buildSpotSketchDocumentModel() }];
}

function createDocumentExportPages(entry, orientation = "auto") {
  if (entry.type === "project-cover") {
    return [createProjectCoverElement(entry.model)];
  }

  return createSpotSketchDocumentElements(
    entry.model,
    SPOT_SKETCH_DOCUMENT_LAYOUT,
    orientation
  );
}

function waitForExportImages(root) {
  const images = [...root.querySelectorAll("img")];

  return Promise.all(images.map(image => {
    if (image.complete) return Promise.resolve();

    return new Promise(resolve => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

function getRasterTargetWidth(element) {
  if (element.classList.contains("ssq-export")) {
    return QUICK_EXPORT_RASTER_WIDTH;
  }

  return element.dataset.documentOrientation === "landscape"
    ? DOCUMENT_EXPORT_LANDSCAPE_RASTER_WIDTH
    : DOCUMENT_EXPORT_PORTRAIT_RASTER_WIDTH;
}

async function rasterizeExportElement(element) {
  if (typeof globalThis.html2canvas !== "function") {
    throw new Error(
      "The local document rasterizer is unavailable. Make sure html2canvas.js is loaded before document-export.js."
    );
  }

  const sandbox = document.createElement("div");
  sandbox.className = "document-export-sandbox";
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.opacity = "1";
  sandbox.style.pointerEvents = "none";
  sandbox.style.zIndex = "-1";
  sandbox.appendChild(element);
  document.body.appendChild(sandbox);

  try {
    await waitForExportImages(element);
    await document.fonts?.ready;
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

    const rect = element.getBoundingClientRect();
    const sourceWidth = Math.max(1, Math.ceil(rect.width));
    const sourceHeight = Math.max(1, Math.ceil(rect.height));
    const scale = getRasterTargetWidth(element) / sourceWidth;

    return await globalThis.html2canvas(element, {
      backgroundColor: "#f7f7f5",
      scale,
      width: sourceWidth,
      height: sourceHeight,
      windowWidth: sourceWidth,
      windowHeight: sourceHeight,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 0,
      logging: false,
      removeContainer: true,
      scrollX: 0,
      scrollY: 0
    });
  } finally {
    sandbox.remove();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("The exported image could not be created."));
    }, type, quality);
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function asciiBytes(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function getPdfPageGeometry(page) {
  return page.orientation === "landscape"
    ? { width: 841.89, height: 595.28 }
    : { width: 595.28, height: 841.89 };
}

function buildRasterPdf(jpegPages) {
  const objects = [];
  const pageObjectNumbers = [];

  const addObject = body => {
    objects.push(body);
    return objects.length;
  };

  const catalogObject = addObject(null);
  const pagesObject = addObject(null);

  for (const page of jpegPages) {
    const imageObject = addObject({ type: "image", page });
    const contentObject = addObject({ type: "content", page, imageObject });
    const pageObject = addObject({ type: "page", page, imageObject, contentObject });
    pageObjectNumbers.push(pageObject);
  }

  objects[catalogObject - 1] =
    `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  const chunks = [asciiBytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let byteLength = chunks[0].length;

  objects.forEach((object, index) => {
    const objectNumber = index + 1;
    offsets[objectNumber] = byteLength;
    let bodyParts;

    if (object?.type === "image") {
      const { page } = object;
      const header = asciiBytes(
        `${objectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
      );
      const footer = asciiBytes("\nendstream\nendobj\n");
      bodyParts = [header, page.bytes, footer];
    } else if (object?.type === "content") {
      const { page, imageObject } = object;
      const geometry = getPdfPageGeometry(page);
      const stream =
        `q\n${geometry.width.toFixed(3)} 0 0 ${geometry.height.toFixed(3)} 0 0 cm\n/Im${imageObject} Do\nQ\n`;

      bodyParts = [asciiBytes(
        `${objectNumber} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`
      )];
    } else if (object?.type === "page") {
      const { page, imageObject, contentObject } = object;
      const geometry = getPdfPageGeometry(page);

      bodyParts = [asciiBytes(
        `${objectNumber} 0 obj\n<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${geometry.width} ${geometry.height}] /Resources << /XObject << /Im${imageObject} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\nendobj\n`
      )];
    } else {
      bodyParts = [asciiBytes(`${objectNumber} 0 obj\n${object}\nendobj\n`)];
    }

    for (const part of bodyParts) {
      chunks.push(part);
      byteLength += part.length;
    }
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let number = 1; number <= objects.length; number += 1) {
    xref += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }

  xref +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(asciiBytes(xref));

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

async function exportQuickSpotSketch() {
  const model = buildSpotSketchDocumentModel();
  const element = createQuickExportElement(model);
  const canvas = await rasterizeExportElement(element);
  const blob = await canvasToBlob(canvas, "image/png");
  const identifier = sanitizeProjectFileName(
    state.project.imageIdentifier || "Spot Sketch"
  );

  downloadBlob(blob, `${identifier}-Spot-Sketch-Quick.png`);
}

async function exportA4Document(options) {
  const scope = options.scope === "project" ? "project" : "current";
  const format = scope === "project"
    ? "pdf"
    : (options.format === "png" ? "png" : "pdf");
  const orientation = ["portrait", "landscape"].includes(options.orientation)
    ? options.orientation
    : "auto";
  const entries = getDocumentExportModels(scope);
  const projectName = sanitizeProjectFileName(
    state.projectSession?.name || "Spot Sketch"
  );
  const pages = entries.flatMap(entry =>
    createDocumentExportPages(entry, orientation)
  );

  if (format === "png") {
    const identifier = sanitizeProjectFileName(
      state.project.imageIdentifier || "Spot Sketch"
    );

    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await rasterizeExportElement(pages[index]);
      const blob = await canvasToBlob(canvas, "image/png");
      const pageSuffix = pages.length > 1
        ? `-page-${String(index + 1).padStart(2, "0")}`
        : "";
      downloadBlob(
        blob,
        `${identifier}-Spot-Sketch-Document${pageSuffix}.png`
      );
      await new Promise(resolve => window.setTimeout(resolve, 120));
    }

    return { pageCount: pages.length, format: "png", type: "document" };
  }

  const jpegPages = [];

  for (const page of pages) {
    const canvas = await rasterizeExportElement(page);
    const dataUrl = canvas.toDataURL(
      "image/jpeg",
      DOCUMENT_EXPORT_JPEG_QUALITY
    );

    jpegPages.push({
      width: canvas.width,
      height: canvas.height,
      orientation: page.dataset.documentOrientation === "landscape"
        ? "landscape"
        : "portrait",
      bytes: dataUrlToBytes(dataUrl)
    });
  }

  const pdf = buildRasterPdf(jpegPages);
  const suffix = scope === "project" ? "Project" : "Spot-Sketch-Document";
  downloadBlob(pdf, `${projectName}-${suffix}.pdf`);

  return { pageCount: pages.length, format: "pdf", type: "document" };
}

async function exportSpotSketchDocument(options = {}) {
  const type = options.type === "quick" ? "quick" : "document";

  if (type === "quick") {
    await exportQuickSpotSketch();
    return { pageCount: 1, format: "png", type: "quick" };
  }

  return exportA4Document(options);
}

globalThis.exportSpotSketchDocument = exportSpotSketchDocument;
globalThis.__spotSketchModuleStatus.documentExport = "ready";
