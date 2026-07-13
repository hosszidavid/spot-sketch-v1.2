"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation Mobile Layout

Purpose:
Provides first-entry mobile guidance and one shared pull-up drawer contract
for Calculation Setup and active Calculation Mode.

Owns:
- mobile-only Calculation education dialog
- automatic guide dismissal and countdown
- device-local guide completion preferences
- Calculation drawer expansion / collapse state
- mobile control re-parenting for the drawer layout
- temporary drawer collapse while a Calculation picker is open

Does NOT own:
- Calculation mathematics
- workflow phase transitions
- picker content
- desktop Calculation presentation
- Spot Reading data

Dependencies:
- data.js
- storage.js
- responsive.js
- mobile-shell.js
==========================================================
*/

const CALCULATION_GUIDE_AUTO_DISMISS_MS = 10000;

let calculationMobileLayoutInitialized = false;
let calculationGuideTimeout = null;
let calculationGuideCountdownTimer = null;
let calculationGuideMutationObserver = null;
let calculationPickerMutationObserver = null;
let lastMobileCalculationPhase = "none";
let calculationMobileTopRow = null;
let calculationPickerWasOpen = false;
let calculationDrawerExpandedBeforePicker = true;
const calculationMobileControlOrigins = new Map();
const calculationDrawerExpanded = {
  setup: true,
  mode: true
};

const CALCULATION_MOBILE_GUIDES = Object.freeze({
  setup: {
    title: "Calculation Setup",
    body: [
      "Tap a Spot Reading on the image, then choose the Zone where it should be placed.",
      "In Calculation Mode, the Reference Spot Reading will always stay in the selected Zone.",
      "Spot meter readings are recorded as Zone V values before placement."
    ]
  },
  mode: {
    title: "Calculation Mode",
    body: [
      "Use S mode to choose ISO and shutter speed; aperture is calculated automatically.",
      "Use A mode to choose ISO and aperture; shutter speed is calculated automatically.",
      "Tap a Spot Reading to change the Reference or its Zone. CONFIRM saves the displayed values as Actual Exposure."
    ]
  }
});


function isMobileCalculationLayoutActive() {
  return Boolean(
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive()
  );
}


function rememberCalculationMobileControlOrigin(element) {
  if (!element || calculationMobileControlOrigins.has(element)) return;

  const marker = document.createComment(
    `spot-sketch-calculation-mobile-origin:${element.id || element.className}`
  );

  element.parentNode?.insertBefore(marker, element);
  calculationMobileControlOrigins.set(element, marker);
}


function restoreCalculationMobileControlOrigin(element) {
  const marker = calculationMobileControlOrigins.get(element);
  if (!element || !marker?.parentNode) return;
  marker.parentNode.insertBefore(element, marker.nextSibling);
}


function ensureCalculationMobileTopRow() {
  const row = document.querySelector(".calculated-exposure-row");
  if (!row) return null;

  if (!calculationMobileTopRow) {
    calculationMobileTopRow = document.createElement("div");
    calculationMobileTopRow.className = "calculation-mobile-primary-row";
    calculationMobileTopRow.setAttribute(
      "aria-label",
      "Calculation mode and confirmation"
    );
  }

  if (calculationMobileTopRow.parentElement !== row) {
    row.prepend(calculationMobileTopRow);
  }

  return calculationMobileTopRow;
}


function syncCalculationMobileControlLayout() {
  const modeButton = document.getElementById("calculationControlModeBtn");
  const confirmButton = document.getElementById("calculationSaveActualBtn");
  const exitButton = document.getElementById("calculationExitBtn");
  const setupExitButton = document.getElementById("calculationSetupCancelBtn");
  const modeHeading = document.querySelector(".calculation-status-heading");
  const setupHeading = document.querySelector(".calculation-setup-heading");

  const controls = [
    modeButton,
    confirmButton,
    exitButton,
    setupExitButton
  ].filter(Boolean);

  for (const control of controls) {
    rememberCalculationMobileControlOrigin(control);
  }

  if (isMobileCalculationLayoutActive()) {
    const topRow = ensureCalculationMobileTopRow();

    if (topRow) {
      if (modeButton) topRow.appendChild(modeButton);
      if (confirmButton) topRow.appendChild(confirmButton);
    }

    if (modeHeading && exitButton) {
      modeHeading.appendChild(exitButton);
    }

    if (setupHeading && setupExitButton) {
      setupHeading.appendChild(setupExitButton);
    }
  } else {
    for (const control of controls) {
      restoreCalculationMobileControlOrigin(control);
    }

    calculationMobileTopRow?.remove();
  }
}


function getMobileCalculationPhase() {
  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)) {
    return "setup";
  }

  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)) {
    return "mode";
  }

  return "none";
}


function getCalculationDrawerElement(type) {
  if (type === "setup") {
    return document.querySelector(".calculation-setup-panel");
  }

  if (type === "mode") {
    return document.getElementById("calculationStatus");
  }

  return null;
}


function getCalculationDrawerHandle(type) {
  if (type === "setup") {
    return document.querySelector(".calculation-setup-heading");
  }

  if (type === "mode") {
    return document.querySelector(".calculation-status-heading");
  }

  return null;
}


function setCalculationDrawerExpanded(type, expanded) {
  if (!Object.prototype.hasOwnProperty.call(calculationDrawerExpanded, type)) {
    return;
  }

  calculationDrawerExpanded[type] = Boolean(expanded);

  const drawer = getCalculationDrawerElement(type);
  const handle = getCalculationDrawerHandle(type);

  drawer?.classList.toggle(
    "is-collapsed",
    !calculationDrawerExpanded[type]
  );

  drawer?.classList.toggle(
    "is-expanded",
    calculationDrawerExpanded[type]
  );

  handle?.setAttribute(
    "aria-expanded",
    calculationDrawerExpanded[type] ? "true" : "false"
  );

  handle?.setAttribute(
    "aria-label",
    calculationDrawerExpanded[type]
      ? `Collapse Calculation ${type === "setup" ? "Setup" : "Mode"}`
      : `Expand Calculation ${type === "setup" ? "Setup" : "Mode"}`
  );
}


function syncCalculationDrawerPresentation() {
  if (!isMobileCalculationLayoutActive()) {
    for (const type of ["setup", "mode"]) {
      const drawer = getCalculationDrawerElement(type);
      const handle = getCalculationDrawerHandle(type);
      drawer?.classList.remove("is-collapsed", "is-expanded");
      handle?.removeAttribute("role");
      handle?.removeAttribute("tabindex");
      handle?.removeAttribute("aria-expanded");
      handle?.removeAttribute("aria-label");
    }
    return;
  }

  for (const type of ["setup", "mode"]) {
    const handle = getCalculationDrawerHandle(type);
    if (handle) {
      handle.setAttribute("role", "button");
      handle.setAttribute("tabindex", "0");
    }
    setCalculationDrawerExpanded(type, calculationDrawerExpanded[type]);
  }
}


function toggleCalculationDrawer(type) {
  if (!isMobileCalculationLayoutActive()) return;
  setCalculationDrawerExpanded(type, !calculationDrawerExpanded[type]);
}


function handleCalculationDrawerToggle(event, type) {
  if (!isMobileCalculationLayoutActive()) return;

  if (event.target.closest("button")) {
    return;
  }

  if (event.type === "keydown") {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
  }

  event.stopPropagation();
  toggleCalculationDrawer(type);
}


function bindCalculationDrawerHandles() {
  const setupHandle = getCalculationDrawerHandle("setup");
  const modeHandle = getCalculationDrawerHandle("mode");

  for (const [handle, type] of [
    [setupHandle, "setup"],
    [modeHandle, "mode"]
  ]) {
    if (!handle || handle.dataset.drawerToggleBound === "true") continue;

    handle.dataset.drawerToggleBound = "true";
    handle.addEventListener("click", event => {
      handleCalculationDrawerToggle(event, type);
    });
    handle.addEventListener("keydown", event => {
      handleCalculationDrawerToggle(event, type);
    });
  }
}


function isCalculationPickerVisible() {
  const picker = document.getElementById("picker");
  if (!picker || picker.hidden) return false;

  return Boolean(
    picker.classList.contains("picker-mobile-calculation") ||
    picker.classList.contains("picker-mobile-zone")
  );
}


function syncCalculationDrawerForPicker() {
  const pickerOpen = isCalculationPickerVisible();
  const phase = getMobileCalculationPhase();

  if (pickerOpen && !calculationPickerWasOpen && phase !== "none") {
    calculationDrawerExpandedBeforePicker = calculationDrawerExpanded[phase];
    setCalculationDrawerExpanded(phase, false);
  }

  if (!pickerOpen && calculationPickerWasOpen && phase !== "none") {
    setCalculationDrawerExpanded(
      phase,
      calculationDrawerExpandedBeforePicker
    );
  }

  calculationPickerWasOpen = pickerOpen;
}


function ensureCalculationGuidancePreferences() {
  if (!state.preferences || typeof state.preferences !== "object") {
    state.preferences = {
      interfaceMode: INTERFACE_MODES.FULL
    };
  }

  const stored = state.preferences.calculationGuidance;

  state.preferences.calculationGuidance = {
    setupSeen: Boolean(stored?.setupSeen),
    modeSeen: Boolean(stored?.modeSeen)
  };

  return state.preferences.calculationGuidance;
}


function hasSeenMobileCalculationGuide(type) {
  const preferences = ensureCalculationGuidancePreferences();
  return type === "setup"
    ? preferences.setupSeen
    : preferences.modeSeen;
}


function markMobileCalculationGuideSeen(type) {
  const preferences = ensureCalculationGuidancePreferences();

  if (type === "setup") {
    preferences.setupSeen = true;
  } else {
    preferences.modeSeen = true;
  }

  if (typeof saveLocalAppData === "function") {
    saveLocalAppData();
  }
}


function isMobileCalculationGuideOpen() {
  const overlay = document.getElementById("calculationGuideOverlay");
  return Boolean(overlay && !overlay.hidden);
}


function clearMobileCalculationGuideTimers() {
  window.clearTimeout(calculationGuideTimeout);
  window.clearInterval(calculationGuideCountdownTimer);

  calculationGuideTimeout = null;
  calculationGuideCountdownTimer = null;
}


function closeMobileCalculationGuide() {
  const overlay = document.getElementById("calculationGuideOverlay");
  if (!overlay) return;

  clearMobileCalculationGuideTimers();
  overlay.hidden = true;
  overlay.removeAttribute("data-guide-type");

  if (typeof scheduleMobileApplicationShellSync === "function") {
    scheduleMobileApplicationShellSync();
  }
}


function updateMobileCalculationGuideCountdown(seconds) {
  const countdown = document.getElementById("calculationGuideCountdown");
  const button = document.getElementById("calculationGuideOkBtn");

  if (countdown) {
    countdown.textContent = `Continuing automatically in ${seconds}s`;
  }

  if (button) {
    button.textContent = seconds > 0 ? `OK · ${seconds}` : "OK";
  }
}


function showMobileCalculationGuide(type) {
  if (!isMobileCalculationLayoutActive()) return false;
  if (!CALCULATION_MOBILE_GUIDES[type]) return false;
  if (hasSeenMobileCalculationGuide(type)) return false;

  const overlay = document.getElementById("calculationGuideOverlay");
  const title = document.getElementById("calculationGuideTitle");
  const message = document.getElementById("calculationGuideMessage");
  const button = document.getElementById("calculationGuideOkBtn");

  if (!overlay || !title || !message || !button) return false;

  clearMobileCalculationGuideTimers();

  const guide = CALCULATION_MOBILE_GUIDES[type];
  title.textContent = guide.title;
  message.innerHTML = guide.body
    .map(paragraph => `<p>${paragraph}</p>`)
    .join("");

  overlay.dataset.guideType = type;
  overlay.hidden = false;
  markMobileCalculationGuideSeen(type);

  const startedAt = Date.now();
  const totalSeconds = Math.ceil(
    CALCULATION_GUIDE_AUTO_DISMISS_MS / 1000
  );

  updateMobileCalculationGuideCountdown(totalSeconds);

  calculationGuideCountdownTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(
      0,
      Math.ceil((CALCULATION_GUIDE_AUTO_DISMISS_MS - elapsed) / 1000)
    );

    updateMobileCalculationGuideCountdown(remaining);
  }, 250);

  calculationGuideTimeout = window.setTimeout(
    closeMobileCalculationGuide,
    CALCULATION_GUIDE_AUTO_DISMISS_MS
  );

  window.requestAnimationFrame(() => {
    button.focus({ preventScroll: true });
  });

  if (typeof scheduleMobileApplicationShellSync === "function") {
    scheduleMobileApplicationShellSync();
  }

  return true;
}


function syncMobileCalculationGuide() {
  syncCalculationMobileControlLayout();
  bindCalculationDrawerHandles();
  syncCalculationDrawerPresentation();

  if (!isMobileCalculationLayoutActive()) {
    lastMobileCalculationPhase = "none";

    if (isMobileCalculationGuideOpen()) {
      closeMobileCalculationGuide();
    }

    return;
  }

  const phase = getMobileCalculationPhase();

  if (phase === "none") {
    lastMobileCalculationPhase = "none";
    return;
  }

  if (phase !== lastMobileCalculationPhase) {
    calculationDrawerExpanded[phase] = true;
    setCalculationDrawerExpanded(phase, true);
    lastMobileCalculationPhase = phase;
    showMobileCalculationGuide(phase);
  }
}


function initializeCalculationMobileLayout() {
  if (calculationMobileLayoutInitialized) return;
  calculationMobileLayoutInitialized = true;

  ensureCalculationGuidancePreferences();

  document
    .getElementById("calculationGuideOkBtn")
    ?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeMobileCalculationGuide();
    });

  document
    .getElementById("calculationGuideOverlay")
    ?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
    });

  calculationGuideMutationObserver = new MutationObserver(
    syncMobileCalculationGuide
  );

  calculationGuideMutationObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  const picker = document.getElementById("picker");
  if (picker) {
    calculationPickerMutationObserver = new MutationObserver(
      syncCalculationDrawerForPicker
    );

    calculationPickerMutationObserver.observe(picker, {
      attributes: true,
      attributeFilter: ["hidden", "class", "data-picker-owner"]
    });
  }

  window.addEventListener(
    "spot-sketch:viewport-change",
    syncMobileCalculationGuide
  );

  window.addEventListener(
    "spot-sketch:picker-closed",
    syncCalculationDrawerForPicker
  );

  syncCalculationMobileControlLayout();
  bindCalculationDrawerHandles();
  syncCalculationDrawerPresentation();
  syncMobileCalculationGuide();
}
