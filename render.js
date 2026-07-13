"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Render

Purpose:
Renders the main canvas, marker pins, marker bubbles, and header display.

Table of Contents:
1. Main Render
2. Canvas Marker Pins
3. Image Fit
4. Marker Bubbles
5. Bubble Placement
6. Header Display
7. Render Helpers
8. Warning Limit Helpers

Owns:
- main canvas rendering
- marker pin rendering
- marker bubble DOM rendering
- bubble collision avoidance
- header display refresh
- warning-limit visual state

Does NOT own:
- marker creation
- marker interaction behavior
- picker UI
- exposure calculations
- project metadata editing
- image loading
- PNG export rendering

Dependencies:
- dom.js
- data.js
- exposure.js
- project.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Main Render
────────────────────────────────────────────
*/

/*
  Redraws the current image, markers, marker bubbles, and header state.
*/
function render() {
  if (stage) {
    stage.classList.toggle("has-image", Boolean(state.imageCanvas));
  }

  if (!state.imageCanvas) {
    updateHeader();
    return;
  }

  canvas.width = state.imageCanvas.width;
  canvas.height = state.imageCanvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.imageCanvas, 0, 0);

  drawMarkers();
  fitImage();
  drawBubbles();
  updateHeader();
  updateCalculationUi();
}


/*
────────────────────────────────────────────
2. Canvas Marker Pins
────────────────────────────────────────────
*/

/*
  Draws marker pins on the canvas.

  Collapsed markers are filled, while expanded markers remain as rings.
*/
function drawMarkers() {
  const defaultColor = "#0A84FF";

  for (const marker of state.markers) {
    const x = marker.x * canvas.width;
    const y = marker.y * canvas.height;

    const display = getDisplayedValue(marker);
    const isLimit = false;
    const markerColor = defaultColor;

    ctx.save();

    const touchMarker = Boolean(
      document.documentElement.dataset.touch === "true" &&
      typeof isMobileApplicationShellActive === "function" &&
      isMobileApplicationShellActive()
    );

    ctx.beginPath();
    ctx.arc(
      x,
      y,
      touchMarker ? 10.5 : 8,
      0,
      Math.PI * 2
    );

    ctx.lineWidth = touchMarker ? 3.4 : 2.4;
    ctx.strokeStyle = isLimit
      ? "#ff3b30"
      : markerColor;

    if (marker.collapsed) {
      ctx.fillStyle = isLimit
        ? "#ff3b30"
        : markerColor;

      ctx.fill();
    }

    ctx.stroke();
    ctx.restore();
  }
}


/*
────────────────────────────────────────────
3. Image Fit
────────────────────────────────────────────
*/

/*
  Fits the image wrapper inside the available stage while preserving
  the image aspect ratio.
*/
function fitImage() {
  if (!state.imageCanvas) return;

  const fitContainer = imageViewport || stage;
  const stageRect = fitContainer.getBoundingClientRect();

  const imageRatio = canvas.width / canvas.height;
  const stageRatio = stageRect.width / stageRect.height;

  let displayWidth;
  let displayHeight;

  if (imageRatio > stageRatio) {
    displayWidth = stageRect.width;
    displayHeight = displayWidth / imageRatio;
  } else {
    displayHeight = stageRect.height;
    displayWidth = displayHeight * imageRatio;
  }

  imageWrap.style.width = `${displayWidth}px`;
  imageWrap.style.height = `${displayHeight}px`;

  if (typeof syncMobileImageNavigationBaseLayout === "function") {
    syncMobileImageNavigationBaseLayout();
  }
}


/*
────────────────────────────────────────────
4. Marker Bubbles
────────────────────────────────────────────
*/

/*
  Rebuilds all expanded marker bubbles in the DOM.
*/
const bubblePlacementCache = new Map();

function drawBubbles() {
  bubbleLayer.innerHTML = "";

  const rect = {
    width: bubbleLayer.clientWidth,
    height: bubbleLayer.clientHeight
  };
  const placedBubbles = [];

  for (const marker of state.markers) {
    if (marker.collapsed) continue;

    const x = marker.x * rect.width;
    const y = marker.y * rect.height;

    const display = getDisplayedValue(marker);
    const calculationReferenceId =
      isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)
        ? state.calculation.referenceSpotReadingId
        : state.calculationDraft.referenceSpotReadingId;

    const isCalculationReference =
      calculationReferenceId === marker.id;

    const selectedReferenceZone =
      isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)
        ? state.calculation.referenceZone
        : state.calculationDraft.referenceZone;

    const displayedZone =
      isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)
        ? getSpotReadingDisplayedZone(marker)
        : isCalculationReference && selectedReferenceZone
          ? selectedReferenceZone
          : getSpotReadingDisplayedZone(marker);

    const isLimit = false;

    const bubble = document.createElement("button");

    const calculationActive = isWorkflowPhase(
      WORKFLOW_PHASES.CALCULATION
    );

    bubble.className = [
      "bubble",
      calculationActive ? "bubble-calculation" : "bubble-recording",
      isLimit ? "bubble-limit" : "",
      isCalculationReference ? "bubble-calculation-reference" : "",
      isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)
        ? "bubble-calculation-candidate"
        : ""
    ]
      .filter(Boolean)
      .join(" ");

    bubble.dataset.id = marker.id;
    bubble.dataset.placementKey = marker.id;
    bubble.style.setProperty(
      "--calculation-candidate-delay",
      `${((Math.max(1, marker.number) - 1) % 7) * 90}ms`
    );

    bubble.innerHTML = `
      <div class="bubble-identity">
        <span class="num">#${marker.number}</span>
        ${
          calculationActive
            ? isCalculationReference
              ? `<span class="reference-label">REFERENCE</span>`
              : `<span class="calculated-label">CALCULATED</span>`
            : ""
        }
      </div>

      ${
        calculationActive
          ? `
            <div class="topline">
              <span class="zone">
                ZONE ${displayedZone.label}
              </span>

            </div>
          `
          : `
            <div class="value">
              ${
                display.type === "aperture"
                  ? `<i>f</i>${display.value}`
                  : display.value
              }
            </div>
          `
      }
    `;

    bubbleLayer.appendChild(bubble);

    placeBubbleSafely(
      bubble,
      x,
      y,
      rect,
      placedBubbles
    );
  }
}


/*
────────────────────────────────────────────
5. Bubble Placement
────────────────────────────────────────────
*/



/*
  Places a marker bubble near its marker without leaving the image area
  and without overlapping already placed bubbles when possible.
*/
function placeBubbleSafely(bubble, x, y, rect, placedBubbles) {
  const gap = 7;
  const sideGap = 8;

  const bubbleWidth = bubble.offsetWidth;
  const bubbleHeight = bubble.offsetHeight;

  const isRightSide = x > rect.width / 2;

  const candidates = [
    {
      name: "top-center",
      left: x - bubbleWidth / 2,
      top: y - bubbleHeight - gap
    },

    isRightSide
      ? {
          name: "bottom-left",
          left: x - bubbleWidth,
          top: y + gap
        }
      : {
          name: "bottom-right",
          left: x,
          top: y + gap
        },

    {
      name: "right-center",
      left: x + sideGap,
      top: y - bubbleHeight / 2
    },

    {
      name: "right-top",
      left: x + sideGap,
      top: y - bubbleHeight - gap
    },

    {
      name: "right-bottom",
      left: x + sideGap,
      top: y + gap
    },

    {
      name: "left-center",
      left: x - bubbleWidth - sideGap,
      top: y - bubbleHeight / 2
    },

    {
      name: "left-top",
      left: x - bubbleWidth - sideGap,
      top: y - bubbleHeight - gap
    },

    {
      name: "left-bottom",
      left: x - bubbleWidth - sideGap,
      top: y + gap
    }
  ];

  const markerBox = {
    left: x - 10,
    top: y - 10,
    right: x + 10,
    bottom: y + 10
  };

  const placementKey = bubble.dataset.placementKey || bubble.dataset.id || "";
  const cachedPlacement = bubblePlacementCache.get(placementKey);
  const cachedName = typeof cachedPlacement === "string"
    ? cachedPlacement
    : cachedPlacement?.name;

  const calculationPlacementLocked = Boolean(
    placementKey &&
    typeof isWorkflowPhase === "function" &&
    isWorkflowPhase(WORKFLOW_PHASES.CALCULATION) &&
    !document.body.classList.contains("mobile-shell-active") &&
    cachedPlacement &&
    typeof cachedPlacement === "object" &&
    cachedPlacement.phase === WORKFLOW_PHASES.CALCULATION &&
    Math.abs(cachedPlacement.rectWidth - rect.width) < 0.5 &&
    Math.abs(cachedPlacement.rectHeight - rect.height) < 0.5 &&
    Math.abs(cachedPlacement.markerX - x) < 0.5 &&
    Math.abs(cachedPlacement.markerY - y) < 0.5
  );

  if (calculationPlacementLocked) {
    bubble.style.left = `${cachedPlacement.left}px`;
    bubble.style.top = `${cachedPlacement.top}px`;
    bubble.style.transform = "none";
    bubble.style.marginTop = "0";

    placedBubbles.push({
      left: cachedPlacement.left,
      top: cachedPlacement.top - 16,
      right: cachedPlacement.left + bubbleWidth,
      bottom: cachedPlacement.top + bubbleHeight
    });

    return;
  }

  const orderedCandidates = cachedName
    ? [
        ...candidates.filter(candidate => candidate.name === cachedName),
        ...candidates.filter(candidate => candidate.name !== cachedName)
      ]
    : candidates;

  const best = orderedCandidates.find(candidate => {
    const bubbleBox = {
      left: candidate.left,
      top: candidate.top - 16,
      right: candidate.left + bubbleWidth,
      bottom: candidate.top + bubbleHeight
    };

    return (
      isInsideRect(bubbleBox, rect) &&
      !boxesOverlap(bubbleBox, markerBox) &&
      !placedBubbles.some(existing => boxesOverlap(bubbleBox, existing))
    );
  }) || orderedCandidates[0];

  /*
    Small screens can run out of collision-free candidates. Clamp the chosen
    position to the visible image instead of allowing the fallback bubble to
    leave the canvas. The extra top inset keeps the reading number visible.
  */
  const compactViewport = ["mobile", "tablet"].includes(
    document.documentElement.dataset.viewportSize
  );
  const edgeInset = compactViewport ? 6 : 2;
  const numberInset = compactViewport ? 17 : 16;

  const safeLeft = Math.min(
    Math.max(edgeInset, rect.width - bubbleWidth - edgeInset),
    Math.max(edgeInset, best.left)
  );

  const safeTop = Math.min(
    Math.max(numberInset, rect.height - bubbleHeight - edgeInset),
    Math.max(numberInset, best.top)
  );

  bubble.style.left = `${safeLeft}px`;
  bubble.style.top = `${safeTop}px`;
  bubble.style.transform = "none";
  bubble.style.marginTop = "0";

  if (placementKey && best) {
    bubblePlacementCache.set(placementKey, {
      name: best.name,
      left: safeLeft,
      top: safeTop,
      rectWidth: rect.width,
      rectHeight: rect.height,
      markerX: x,
      markerY: y,
      phase: state.workflow?.phase || null
    });
  }

  placedBubbles.push({
    left: safeLeft,
    top: safeTop - numberInset,
    right: safeLeft + bubbleWidth,
    bottom: safeTop + bubbleHeight
  });
}

/*
────────────────────────────────────────────
6. Header Display
────────────────────────────────────────────
*/

/*
  Updates the Recording header labels and visual state.
*/
function updateHeader() {
  const hasSetup =
    hasInitialMeteringSetup();

  if (initialMeteringDisplay) {
    initialMeteringDisplay.hidden = !hasSetup;
    initialMeteringDisplay.disabled =
      !hasSetup || !isWorkflowPhase(WORKFLOW_PHASES.RECORDING);
    initialMeteringDisplay.title = initialMeteringDisplay.disabled
      ? "Initial Metering Setup"
      : "Restart Metering";
  }

  if (initialIsoDisplay) {
    initialIsoDisplay.textContent =
      hasSetup
        ? `ISO ${state.initialMeteringSetup.iso}`
        : "ISO —";
  }

  if (initialShutterDisplay) {
    initialShutterDisplay.textContent =
      hasSetup
        ? formatShutterLabel(
            state.initialMeteringSetup.shutter
          )
        : "Shutter —";
  }

  if (restartMeteringBtn) {
    restartMeteringBtn.hidden =
      !state.imageCanvas ||
      !hasSetup ||
      !isWorkflowPhase(
        WORKFLOW_PHASES.RECORDING
      );
  }

  if (calculationBtn) {
    const mobileCalculationPhase = Boolean(
      typeof isMobileCalculationLayoutActive === "function" &&
      isMobileCalculationLayoutActive() &&
      (
        isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP) ||
        isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)
      )
    );

    const calculationContextVisible = Boolean(
      state.imageCanvas &&
      hasSetup &&
      (
        isWorkflowPhase(WORKFLOW_PHASES.RECORDING) ||
        mobileCalculationPhase
      )
    );

    const canShowCalculation = Boolean(
      mobileCalculationPhase ||
      (calculationContextVisible && state.markers.length > 0)
    );

    const hasStoredCalculation = Boolean(
      state.calculation.referenceSpotReadingId &&
      state.calculation.referenceZone &&
      state.calculation.exposure
    );

    calculationBtn.hidden = !calculationContextVisible;
    calculationBtn.disabled = !canShowCalculation;
    calculationBtn.title = canShowCalculation
      ? hasStoredCalculation
        ? "Resume the saved Calculation"
        : "Prepare Calculation Mode"
      : "Record at least one Spot Reading first.";
    const calculationLabel = calculationBtn.querySelector("span:last-child");
    if (calculationLabel) {
      calculationLabel.textContent =
        isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)
          ? "CALCULATION SETUP"
          : isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)
            ? "CALCULATION MODE"
            : hasStoredCalculation
              ? "RESUME CALCULATION"
              : "CALCULATION";
    }
    calculationBtn.classList.toggle("has-saved-calculation", hasStoredCalculation);
    calculationBtn.classList.toggle("is-visible", canShowCalculation);
  }

  const dynamicRange = calculateDynamicRange();

  drBtn.textContent =
    dynamicRange === "--"
      ? "LAT --"
      : `LAT ${dynamicRange}`;

  drBtn.classList.remove(
    "lat-blue",
    "lat-green",
    "lat-yellow",
    "lat-red"
  );

  if (dynamicRange === "--" || dynamicRange <= 4) {
    drBtn.classList.add("lat-blue");
  } else if (dynamicRange <= 8) {
    drBtn.classList.add("lat-green");
  } else if (dynamicRange < 12) {
    drBtn.classList.add("lat-yellow");
  } else {
    drBtn.classList.add("lat-red");
  }

  themeBtn.innerHTML =
    state.theme === "dark"
      ? `
        <svg
          class="theme-icon"
          viewBox="0 0 16 16"
          aria-hidden="true">

          <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/>
        </svg>
      `
      : `
        <svg
          class="hold-icon"
          viewBox="0 0 24 24"
          aria-hidden="true">

          <g transform="translate(1.3 1.0)">
            <path
              d="M 10.76 0.3364 a 0.9317 0.9317 90 0 1 0.0968 1.0382 a 8.712 8.712 90 0 0 -1.0624 4.1866 c 0 4.8654 3.9664 8.8052 8.8548 8.8052 q 0.9583 -0.0012 1.8549 -0.1936 a 0.9559 0.9559 90 0 1 0.9801 0.3824 a 0.8833 0.8833 90 0 1 -0.0375 1.0805 A 10.1035 10.1035 90 0 1 13.5962 19.36 C 8.0181 19.36 3.5 14.8661 3.5 9.3291 C 3.5 5.1619 6.0579 1.5875 9.7 0.0726 A 0.9075 0.9075 90 0 1 10.76 0.3364"/>
          </g>
        </svg>
      `;

  if (typeof scheduleMobileApplicationShellSync === "function") {
    scheduleMobileApplicationShellSync();
  }
}


/*
────────────────────────────────────────────
7. Render Helpers
────────────────────────────────────────────
*/

/*
  Returns the visual class used for zone labels in marker bubbles.
*/

/*
  Checks whether a box is fully inside the visible image rectangle.
*/
function isInsideRect(box, rect) {
  return (
    box.left >= 0 &&
    box.top >= 0 &&
    box.right <= rect.width &&
    box.bottom <= rect.height
  );
}


/*
  Checks whether two boxes overlap.
*/
function boxesOverlap(a, b) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}


/*
────────────────────────────────────────────
8. Warning Limit Helpers
────────────────────────────────────────────
*/

/*
  Checks whether the displayed value is outside the current lens warning
  limits.

  This only controls the red warning UI. It does NOT affect exposure
  calculation.
*/
function getExposureRangeWarnings(exposure) {
  ensureProjectStructure();
  if (!exposure) return [];

  const warnings = [];
  const apertureDisplay = { type: "aperture", value: String(exposure.aperture || "") };
  const shutterDisplay = { type: "shutter", value: String(exposure.shutter || "") };

  if (apertureDisplay.value && isDisplayOutsideWarningLimits(apertureDisplay)) {
    const limits = state.project.lens.warningLimits.aperture;
    warnings.push({
      field: "aperture",
      message: `Aperture is outside the configured range (${formatLimitLabel(limits.min, "aperture")}–${formatLimitLabel(limits.max, "aperture")}).`
    });
  }

  if (shutterDisplay.value && isDisplayOutsideWarningLimits(shutterDisplay)) {
    const limits = state.project.lens.warningLimits.shutter;
    warnings.push({
      field: "shutter",
      message: `Shutter is outside the configured range (${formatLimitLabel(limits.min, "shutter")}–${formatLimitLabel(limits.max, "shutter")}).`
    });
  }

  return warnings;
}

function isDisplayOutsideWarningLimits(display) {
  ensureProjectStructure();

  if (display.type === "aperture") {
    const valueIndex = APERTURES.indexOf(display.value);
    const minIndex = APERTURES.indexOf(
      state.project.lens.warningLimits.aperture.min
    );
    const maxIndex = APERTURES.indexOf(
      state.project.lens.warningLimits.aperture.max
    );

    if (valueIndex === -1 || minIndex === -1 || maxIndex === -1) {
      return false;
    }

    return valueIndex < minIndex || valueIndex > maxIndex;
  }

  if (display.type === "shutter") {
    const valueIndex = SHUTTER_VALUES.indexOf(display.value);
    const minIndex = SHUTTER_VALUES.indexOf(
      state.project.lens.warningLimits.shutter.min
    );
    const maxIndex = SHUTTER_VALUES.indexOf(
      state.project.lens.warningLimits.shutter.max
    );

    if (valueIndex === -1 || minIndex === -1 || maxIndex === -1) {
      return false;
    }

    return valueIndex < minIndex || valueIndex > maxIndex;
  }

  return false;
}