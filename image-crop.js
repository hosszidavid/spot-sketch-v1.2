"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Image Crop Workflow

Purpose:
Places a deliberate crop/aspect-ratio step between image decoding and the
Initial Metering Setup or image replacement workflow.
==========================================================
*/

let imageCropInitialized = false;
let imageCropSession = null;
let imageCropResizeObserver = null;

function initializeImageCropWorkflow() {
  if (imageCropInitialized) return;
  imageCropInitialized = true;

  document.getElementById("imageCropCancelBtn")?.addEventListener("click", cancelImageCrop);
  document.getElementById("imageCropCloseBtn")?.addEventListener("click", cancelImageCrop);
  document.getElementById("imageCropConfirmBtn")?.addEventListener("click", confirmImageCrop);
  document.getElementById("imageCropZoom")?.addEventListener("input", event => {
    if (!imageCropSession) return;
    imageCropSession.zoom = Number(event.target.value) || 1;
    clampImageCropOffset();
    drawImageCropPreview();
  });

  document.getElementById("imageCropOverlay")?.addEventListener("click", event => {
    /* A loaded image is a deliberate decision; outside click never dismisses it. */
    event.stopPropagation();
  });

  document.querySelectorAll("[data-crop-ratio]").forEach(button => {
    button.addEventListener("click", () => {
      if (!imageCropSession) return;
      imageCropSession.ratioKey = button.dataset.cropRatio || "original";
      imageCropSession.zoom = 1;
      imageCropSession.offsetX = 0;
      imageCropSession.offsetY = 0;
      const slider = document.getElementById("imageCropZoom");
      if (slider) slider.value = "1";
      syncImageCropRatioButtons();
      drawImageCropPreview();
    });
  });

  const canvas = document.getElementById("imageCropCanvas");
  canvas?.addEventListener("pointerdown", beginImageCropDrag);
  canvas?.addEventListener("pointermove", moveImageCropDrag);
  canvas?.addEventListener("pointerup", endImageCropDrag);
  canvas?.addEventListener("pointercancel", endImageCropDrag);

  if (typeof ResizeObserver === "function") {
    imageCropResizeObserver = new ResizeObserver(drawImageCropPreview);
    const stage = document.getElementById("imageCropStage");
    if (stage) imageCropResizeObserver.observe(stage);
  }
}

function openImageCropEditor(decoded) {
  if (!decoded?.canvas) return Promise.resolve(decoded || null);

  if (!imageCropInitialized) initializeImageCropWorkflow();

  return new Promise(resolve => {
    imageCropSession = {
      decoded,
      resolve,
      ratioKey: "original",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      cropRect: null,
      drawRect: null,
      dragging: false,
      pointerId: null,
      lastX: 0,
      lastY: 0
    };

    const zoom = document.getElementById("imageCropZoom");
    if (zoom) zoom.value = "1";

    syncImageCropRatioButtons();
    const overlay = document.getElementById("imageCropOverlay");
    if (overlay) overlay.hidden = false;
    document.body.classList.add("image-crop-open");
    closeHeaderMenus?.();
    hidePicker?.();

    window.requestAnimationFrame(drawImageCropPreview);
    if (typeof scheduleMobileApplicationShellSync === "function") {
      scheduleMobileApplicationShellSync();
    }
  });
}

function closeImageCropEditor(result) {
  const session = imageCropSession;
  imageCropSession = null;

  const overlay = document.getElementById("imageCropOverlay");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("image-crop-open");

  if (session?.resolve) session.resolve(result || null);
  if (typeof scheduleMobileApplicationShellSync === "function") {
    scheduleMobileApplicationShellSync();
  }
}

function cancelImageCrop() {
  closeImageCropEditor(null);
}

function getImageCropRatio() {
  if (!imageCropSession) return 1;
  const source = imageCropSession.decoded.canvas;
  const original = source.width / source.height;
  if (imageCropSession.ratioKey === "original") return original;

  const numeric = Number(imageCropSession.ratioKey) || original;
  return original < 1 ? 1 / numeric : numeric;
}

function syncImageCropRatioButtons() {
  document.querySelectorAll("[data-crop-ratio]").forEach(button => {
    button.classList.toggle(
      "is-active",
      button.dataset.cropRatio === imageCropSession?.ratioKey
    );
  });
}

function getImageCropGeometry() {
  const stage = document.getElementById("imageCropStage");
  if (!stage || !imageCropSession) return null;

  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const ratio = getImageCropRatio();
  const maxWidth = width * .9;
  const maxHeight = height * .82;

  let cropWidth = maxWidth;
  let cropHeight = cropWidth / ratio;
  if (cropHeight > maxHeight) {
    cropHeight = maxHeight;
    cropWidth = cropHeight * ratio;
  }

  return {
    width,
    height,
    crop: {
      x: (width - cropWidth) / 2,
      y: (height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight
    }
  };
}

function clampImageCropOffset() {
  if (!imageCropSession) return;
  const geometry = getImageCropGeometry();
  if (!geometry) return;

  const source = imageCropSession.decoded.canvas;
  const crop = geometry.crop;
  const baseScale = Math.max(crop.width / source.width, crop.height / source.height);
  const scale = baseScale * imageCropSession.zoom;
  const drawnWidth = source.width * scale;
  const drawnHeight = source.height * scale;
  const maxX = Math.max(0, (drawnWidth - crop.width) / 2);
  const maxY = Math.max(0, (drawnHeight - crop.height) / 2);

  imageCropSession.offsetX = Math.max(-maxX, Math.min(maxX, imageCropSession.offsetX));
  imageCropSession.offsetY = Math.max(-maxY, Math.min(maxY, imageCropSession.offsetY));
}

function drawImageCropPreview() {
  if (!imageCropSession) return;
  const canvas = document.getElementById("imageCropCanvas");
  const geometry = getImageCropGeometry();
  if (!canvas || !geometry) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(geometry.width * dpr);
  canvas.height = Math.round(geometry.height * dpr);
  canvas.style.width = `${geometry.width}px`;
  canvas.style.height = `${geometry.height}px`;

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, geometry.width, geometry.height);

  const source = imageCropSession.decoded.canvas;
  const crop = geometry.crop;
  const baseScale = Math.max(crop.width / source.width, crop.height / source.height);
  const scale = baseScale * imageCropSession.zoom;
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  const drawX = geometry.width / 2 - drawWidth / 2 + imageCropSession.offsetX;
  const drawY = geometry.height / 2 - drawHeight / 2 + imageCropSession.offsetY;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);

  context.fillStyle = "rgba(0,0,0,.56)";
  context.fillRect(0, 0, geometry.width, crop.y);
  context.fillRect(0, crop.y + crop.height, geometry.width, geometry.height - crop.y - crop.height);
  context.fillRect(0, crop.y, crop.x, crop.height);
  context.fillRect(crop.x + crop.width, crop.y, geometry.width - crop.x - crop.width, crop.height);

  context.strokeStyle = "rgba(255,255,255,.96)";
  context.lineWidth = 2;
  context.strokeRect(crop.x + 1, crop.y + 1, crop.width - 2, crop.height - 2);

  context.strokeStyle = "rgba(255,255,255,.42)";
  context.lineWidth = 1;
  for (let i = 1; i < 3; i += 1) {
    const gx = crop.x + crop.width * i / 3;
    const gy = crop.y + crop.height * i / 3;
    context.beginPath(); context.moveTo(gx, crop.y); context.lineTo(gx, crop.y + crop.height); context.stroke();
    context.beginPath(); context.moveTo(crop.x, gy); context.lineTo(crop.x + crop.width, gy); context.stroke();
  }

  imageCropSession.cropRect = crop;
  imageCropSession.drawRect = { x: drawX, y: drawY, width: drawWidth, height: drawHeight, scale };
}

function beginImageCropDrag(event) {
  if (!imageCropSession) return;
  imageCropSession.dragging = true;
  imageCropSession.pointerId = event.pointerId;
  imageCropSession.lastX = event.clientX;
  imageCropSession.lastY = event.clientY;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveImageCropDrag(event) {
  if (!imageCropSession?.dragging || imageCropSession.pointerId !== event.pointerId) return;
  imageCropSession.offsetX += event.clientX - imageCropSession.lastX;
  imageCropSession.offsetY += event.clientY - imageCropSession.lastY;
  imageCropSession.lastX = event.clientX;
  imageCropSession.lastY = event.clientY;
  clampImageCropOffset();
  drawImageCropPreview();
}

function endImageCropDrag(event) {
  if (!imageCropSession || imageCropSession.pointerId !== event.pointerId) return;
  imageCropSession.dragging = false;
  imageCropSession.pointerId = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
}

function confirmImageCrop() {
  if (!imageCropSession?.cropRect || !imageCropSession?.drawRect) return;

  const source = imageCropSession.decoded.canvas;
  const crop = imageCropSession.cropRect;
  const draw = imageCropSession.drawRect;

  const sx = Math.max(0, (crop.x - draw.x) / draw.scale);
  const sy = Math.max(0, (crop.y - draw.y) / draw.scale);
  const sw = Math.min(source.width - sx, crop.width / draw.scale);
  const sh = Math.min(source.height - sy, crop.height / draw.scale);
  const target = getTargetSize(Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)));

  const cropped = document.createElement("canvas");
  cropped.width = target.width;
  cropped.height = target.height;
  const context = cropped.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, target.width, target.height);

  closeImageCropEditor({
    canvas: cropped,
    source: {
      ...imageCropSession.decoded.source,
      cropRatio: imageCropSession.ratioKey
    }
  });
}
