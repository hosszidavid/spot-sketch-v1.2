"use strict";

/*
==========================================================
SPOT SKETCH

Module:
DOM Registry

Purpose:
Creates the shared DOM references used across application modules.

Table of Contents:
1. File Loading
2. Main Stage and Image Layers
3. Spot Reading Move Cursor
4. Header Controls

Owns:
- shared application DOM references
- main canvas 2D rendering context

Does NOT own:
- event listeners
- workflow state
- rendering logic
- picker behavior
- image loading
- project metadata

Dependencies:
- index.html
==========================================================
*/


/*
────────────────────────────────────────────
1. File Loading
────────────────────────────────────────────
*/

const fileInput =
  document.getElementById("fileInput");

const welcomeLoad =
  document.getElementById("welcomeLoad");


/*
────────────────────────────────────────────
2. Main Stage and Image Layers
────────────────────────────────────────────
*/

const stage =
  document.getElementById("stage");

const welcome =
  document.getElementById("welcome");

const imageViewport =
  document.getElementById("imageViewport");

const imageWrap =
  document.getElementById("imageWrap");

const canvas =
  document.getElementById("photoCanvas");

const ctx =
  canvas.getContext("2d");

const bubbleLayer =
  document.getElementById("bubbleLayer");

const mobileImageResetBtn =
  document.getElementById("mobileImageResetBtn");

const picker =
  document.getElementById("picker");


/*
────────────────────────────────────────────
3. Spot Reading Move Cursor
────────────────────────────────────────────
*/

const moveCursor =
  document.getElementById("moveCursor");

const moveCountdown =
  document.getElementById("moveCountdown");


/*
────────────────────────────────────────────
4. Header Controls
────────────────────────────────────────────
*/

const initialMeteringDisplay =
  document.getElementById("initialMeteringDisplay");

const initialIsoDisplay =
  document.getElementById("initialIsoDisplay");

const initialShutterDisplay =
  document.getElementById("initialShutterDisplay");

const drBtn =
  document.getElementById("drBtn");

const exportBtn =
  document.getElementById("exportBtn");

const calculationBtn =
  document.getElementById("calculationBtn");

const themeBtn =
  document.getElementById("themeBtn");


/*
────────────────────────────────────────────
5. Calculation Mode Controls
────────────────────────────────────────────
*/

const calculationSetupOverlay =
  document.getElementById("calculationSetupOverlay");

const calculationSetupReference =
  document.getElementById("calculationSetupReference");

const calculationSetupZone =
  document.getElementById("calculationSetupZone");

const calculationSetupHint =
  document.getElementById("calculationSetupHint");

const calculationSetupCancelBtn =
  document.getElementById("calculationSetupCancelBtn");

const calculationSetupStartBtn =
  document.getElementById("calculationSetupStartBtn");

const calculationStatus =
  document.getElementById("calculationStatus");

const calculationStatusReference =
  document.getElementById("calculationStatusReference");

const calculationControlModeBtn =
  document.getElementById("calculationControlModeBtn");

const calculationModeShutterLabel =
  document.getElementById("calculationModeShutterLabel");

const calculationModeApertureLabel =
  document.getElementById("calculationModeApertureLabel");

const calculatedIsoBtn =
  document.getElementById("calculatedIsoBtn");

const calculatedShutterBtn =
  document.getElementById("calculatedShutterBtn");

const calculatedApertureBtn =
  document.getElementById("calculatedApertureBtn");

const calculatedExposureMessage =
  document.getElementById("calculatedExposureMessage");

const calculationSaveActualBtn =
  document.getElementById("calculationSaveActualBtn");

const calculationExitBtn =
  document.getElementById("calculationExitBtn");


/*
────────────────────────────────────────────
6. Application Notification
────────────────────────────────────────────
*/

const appNotificationStack =
  document.getElementById("appNotificationStack");

/* Legacy aliases retained for modules that only check their existence. */
const appNotification = null;
const appNotificationTitle = null;
const appNotificationMessage = null;