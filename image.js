"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Image

Purpose:
Handles first image loading, safe image replacement, resizing, and
pointer-to-canvas coordinate conversion.

Owns:
- loading and decoding image files
- first-image workflow entry
- replacing an existing Spot Sketch image without deleting readings
- preserving or arranging normalized Spot Reading positions
- image aspect-ratio warning
- resizing source images
- storing source image metadata
- converting pointer events into normalized canvas points

Dependencies:
- dom.js
- data.js
- markers.js
- render.js
- metering-setup.js
- notifications.js
==========================================================
*/

let pendingImageReplacement = null;
let imageReplacementInitialized = false;

function initializeImageReplacement() {
  if (imageReplacementInitialized) return;
  imageReplacementInitialized = true;

  document
    .getElementById("replaceImageCancelBtn")
    ?.addEventListener("click", cancelImageReplacement);

  document
    .getElementById("replaceImageConfirmBtn")
    ?.addEventListener("click", confirmImageReplacement);

  /*
    Image replacement is a deliberate modal decision. Clicking the dimmed
    overlay must never cancel it accidentally; only the explicit Cancel
    button may dismiss this surface.
  */
  document
    .getElementById("replaceImageOverlay")
    ?.addEventListener("click", event => {
      event.stopPropagation();
    });
}

async function requestImageLoad(file) {
  if (!file) return false;

  let decoded;

  try {
    decoded = await decodeImageFile(file);
  } catch (error) {
    showDialog({
      title: "Image could not be opened",
      message: "The selected file is not a supported or readable image.",
      okText: "OK",
      showCancel: false,
      danger: true
    });
    return false;
  }

  if (typeof openImageCropEditor === "function") {
    decoded = await openImageCropEditor(decoded);
    if (!decoded) return false;
  }

  if (!state.imageCanvas) {
    applyFirstImage(decoded);
    return true;
  }

  if (!state.markers.length) {
    applyReplacementImage(decoded, "preserve");
    showAppNotification(
      "Image replaced",
      "The Spot Sketch image was replaced. Existing metadata and metering setup were preserved."
    );
    return true;
  }

  openImageReplacementDialog(decoded);
  return true;
}

/* Compatibility entry point used by existing modules. */
function loadImage(file) {
  return requestImageLoad(file);
}

function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Unsupported image type."));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Image file could not be read."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image data could not be decoded."));
      img.onload = () => {
        resolve({
          canvas: resizeImage(img),
          source: {
            filename: file.name || "",
            mimeType: file.type || "",
            originalWidth: img.naturalWidth || img.width || null,
            originalHeight: img.naturalHeight || img.height || null
          }
        });
      };
      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function applyFirstImage(decoded) {
  state.imageSource = decoded.source;
  state.imageCanvas = decoded.canvas;

  if (typeof resetMobileImageNavigation === "function") {
    resetMobileImageNavigation({ immediate: true });
  }

  resetMarkers();
  beginMeteringSetup();

  welcome.style.display = "none";
  imageWrap.style.display = "block";

  render();
  updateMeteringSetupUi();
}

function openImageReplacementDialog(decoded) {
  pendingImageReplacement = decoded;

  const overlay = document.getElementById("replaceImageOverlay");
  const message = document.getElementById("replaceImageMessage");
  if (!overlay) return;

  const currentRatio = state.imageCanvas.width / state.imageCanvas.height;
  const nextRatio = decoded.canvas.width / decoded.canvas.height;
  const ratioDifference = Math.abs(Math.log(nextRatio / currentRatio));
  const significantlyDifferent = ratioDifference > 0.16;

  if (message) {
    message.textContent = significantlyDifferent
      ? "Spot Reading measurements, Calculation and exposure data will remain. The new image has a noticeably different aspect ratio, so positions may shift."
      : "Spot Reading measurements, Calculation and exposure data will remain. Relative positions should remain close when the crop and orientation match.";
  }

  const preserve = overlay.querySelector(
    'input[name="replaceImagePositionMode"][value="preserve"]'
  );
  if (preserve) preserve.checked = true;

  closeHeaderMenus();
  hidePicker();
  setImageReplacementDialogVisible(true);
}

function setImageReplacementDialogVisible(visible) {
  const overlay = document.getElementById("replaceImageOverlay");
  if (overlay) overlay.hidden = !visible;
  document.body.classList.toggle("replace-image-open", visible);
}

function cancelImageReplacement() {
  pendingImageReplacement = null;
  setImageReplacementDialogVisible(false);
}

function confirmImageReplacement() {
  if (!pendingImageReplacement) {
    cancelImageReplacement();
    return;
  }

  const selected = document.querySelector(
    'input[name="replaceImagePositionMode"]:checked'
  );
  const mode = ["arrange", "delete"].includes(selected?.value)
    ? selected.value
    : "preserve";
  const decoded = pendingImageReplacement;

  if (mode === "delete") {
    /*
      Temporarily hide the first modal before opening the destructive
      confirmation. This guarantees that the reusable dialog can never be
      rendered behind the image-replacement surface in any stacking context.
      Cancelling the confirmation returns the user to the original decision.
    */
    setImageReplacementDialogVisible(false);

    showDialog({
      title: "Replace Image and Delete Spot Readings?",
      message:
        `This will permanently delete all ${state.markers.length} Spot Reading${state.markers.length === 1 ? "" : "s"} and clear Calculation. ` +
        "Initial Metering Setup, Image Identifier, Location, Gear Settings, Actual Exposure and Notes will remain.",
      okText: "Delete and Replace",
      cancelText: "Cancel",
      danger: true,
      onCancel: () => {
        if (pendingImageReplacement) {
          setImageReplacementDialogVisible(true);
        }
      },
      onConfirm: () => {
        cancelImageReplacement();
        applyReplacementImage(decoded, "delete");
        showAppNotification({
          type: "success",
          title: "Image replaced",
          message: "Spot Readings and Calculation were deleted."
        });
      }
    });
    return;
  }

  cancelImageReplacement();
  applyReplacementImage(decoded, mode);

  showAppNotification(
    "Image replaced",
    mode === "arrange"
      ? "Spot Readings were arranged along the top for manual repositioning."
      : "Spot Reading measurements and normalized positions were preserved."
  );
}

function applyReplacementImage(decoded, positionMode) {
  state.imageSource = decoded.source;
  state.imageCanvas = decoded.canvas;

  if (typeof resetMobileImageNavigation === "function") {
    resetMobileImageNavigation({ immediate: true });
  }

  if (positionMode === "arrange") {
    arrangeSpotReadingsAlongTop();
  }

  if (positionMode === "delete") {
    resetMarkers();
    resetCalculation();
    setWorkflowPhase(WORKFLOW_PHASES.RECORDING);
  }

  state.selectedId = null;
  state.pendingPoint = null;
  state.moveMarkerId = null;

  hideMoveCursor();
  hidePicker();

  welcome.style.display = "none";
  imageWrap.style.display = "block";

  render();
  updateMeteringSetupUi();

  if (typeof commitCurrentSpotSketchToMemory === "function") {
    commitCurrentSpotSketchToMemory();
  }
}

function arrangeSpotReadingsAlongTop() {
  const ordered = [...state.markers].sort((a, b) => a.number - b.number);
  const count = ordered.length;
  if (!count) return;

  ordered.forEach((marker, index) => {
    marker.x = (index + 1) / (count + 1);
    marker.y = 0.08;
  });
}

function resizeImage(img) {
  const size = getTargetSize(img.width, img.height);
  const resizedCanvas = document.createElement("canvas");
  resizedCanvas.width = size.width;
  resizedCanvas.height = size.height;

  const resizedContext = resizedCanvas.getContext("2d");
  resizedContext.imageSmoothingEnabled = true;
  resizedContext.imageSmoothingQuality = "high";
  resizedContext.drawImage(img, 0, 0, size.width, size.height);

  return resizedCanvas;
}

function getTargetSize(width, height) {
  if (width <= MAX_IMAGE_SIZE && height <= MAX_IMAGE_SIZE) {
    return { width, height };
  }

  if (width >= height) {
    const ratio = MAX_IMAGE_SIZE / width;
    return { width: MAX_IMAGE_SIZE, height: Math.round(height * ratio) };
  }

  const ratio = MAX_IMAGE_SIZE / height;
  return { width: Math.round(width * ratio), height: MAX_IMAGE_SIZE };
}

function getCanvasPoint(event) {
  if (!state.imageCanvas) return null;

  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}