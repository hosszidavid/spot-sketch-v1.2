"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation Mobile Shell

Purpose:
Provides a headerless, animated mobile shell shared by Calculation Setup,
active Calculation Mode and resumed Calculation.

Owns:
- first-entry mobile guidance
- expanded / collapsed mobile Calculation shell state
- Calculation trigger positioning above the shell
- floating red exit action while expanded
- mobile-only control re-parenting
- temporary collapse while a Calculation picker is open

Does NOT own:
- Calculation mathematics
- workflow phase transitions
- picker content
- desktop Calculation presentation
==========================================================
*/

const CALCULATION_GUIDE_AUTO_DISMISS_MS = 10000;

let calculationMobileLayoutInitialized = false;
let calculationGuideTimeout = null;
let calculationGuideCountdownTimer = null;
let calculationGuideMutationObserver = null;
let calculationPickerMutationObserver = null;
let calculationShellResizeObserver = null;
let calculationShellFrame = null;
let lastMobileCalculationPhase = "none";
let calculationMobilePrimaryRow = null;
let calculationMobileCloseHost = null;
let calculationPickerWasOpen = false;
let calculationShellExpandedBeforePicker = true;
let calculationShellExpanded = true;
const calculationMobileControlOrigins = new Map();

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
      "Tap a Spot Reading to change the Reference or its Zone. Confirm Exposure copies the displayed values to Actual Exposure."
    ]
  }
});

function isMobileCalculationLayoutActive() {
  return Boolean(
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive()
  );
}

function getMobileCalculationPhase() {
  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)) return "setup";
  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)) return "mode";
  return "none";
}

function getMobileCalculationPanel(phase = getMobileCalculationPhase()) {
  if (phase === "setup") return document.querySelector(".calculation-setup-panel");
  if (phase === "mode") return document.getElementById("calculationStatus");
  return null;
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

function ensureCalculationMobilePrimaryRow() {
  const row = document.querySelector(".calculated-exposure-row");
  if (!row) return null;

  if (!calculationMobilePrimaryRow) {
    calculationMobilePrimaryRow = document.createElement("div");
    calculationMobilePrimaryRow.className = "calculation-mobile-primary-row";
  }

  if (calculationMobilePrimaryRow.parentElement !== row) {
    row.prepend(calculationMobilePrimaryRow);
  }

  return calculationMobilePrimaryRow;
}

function ensureCalculationMobileCloseHost() {
  if (calculationMobileCloseHost) return calculationMobileCloseHost;

  calculationMobileCloseHost = document.createElement("div");
  calculationMobileCloseHost.id = "mobileCalculationCloseHost";
  calculationMobileCloseHost.className = "mobile-calculation-close-host";
  calculationMobileCloseHost.hidden = true;
  document.body.appendChild(calculationMobileCloseHost);
  return calculationMobileCloseHost;
}

function syncCalculationMobileControlLayout() {
  const phase = getMobileCalculationPhase();
  const modeButton = document.getElementById("calculationControlModeBtn");
  const confirmButton = document.getElementById("calculationSaveActualBtn");
  const modeExitButton = document.getElementById("calculationExitBtn");
  const setupExitButton = document.getElementById("calculationSetupCancelBtn");
  const confirmLabel = confirmButton?.querySelector(".calculation-confirm-label");

  const controls = [
    modeButton,
    confirmButton,
    modeExitButton,
    setupExitButton
  ].filter(Boolean);

  for (const control of controls) rememberCalculationMobileControlOrigin(control);

  if (!isMobileCalculationLayoutActive()) {
    for (const control of controls) restoreCalculationMobileControlOrigin(control);
    calculationMobilePrimaryRow?.remove();
    const closeHost = ensureCalculationMobileCloseHost();
    closeHost.hidden = true;
    calculationBtn?.style.removeProperty("display");
    if (confirmLabel) confirmLabel.textContent = "CONFIRM";
    document.body.classList.remove(
      "mobile-calculation-shell-v2",
      "mobile-calculation-shell-expanded",
      "mobile-calculation-shell-collapsed"
    );
    return;
  }

  document.body.classList.add("mobile-calculation-shell-v2");

  if (phase === "none") {
    calculationBtn?.style.removeProperty("display");
  } else {
    calculationBtn?.style.setProperty("display", "inline-flex", "important");
  }

  if (phase === "mode") {
    const primaryRow = ensureCalculationMobilePrimaryRow();
    if (primaryRow && modeButton) primaryRow.appendChild(modeButton);
    if (primaryRow && confirmButton) primaryRow.appendChild(confirmButton);
    if (confirmLabel) confirmLabel.textContent = "Confirm Exposure";
  }

  const closeHost = ensureCalculationMobileCloseHost();
  const activeExit = phase === "setup" ? setupExitButton : phase === "mode" ? modeExitButton : null;

  for (const exitButton of [setupExitButton, modeExitButton]) {
    if (exitButton && exitButton !== activeExit) {
      restoreCalculationMobileControlOrigin(exitButton);
    }
  }

  if (activeExit) closeHost.appendChild(activeExit);
  closeHost.hidden = phase === "none" || !calculationShellExpanded;
}

function measureMobileCalculationShell() {
  calculationShellFrame = null;
  const panel = getMobileCalculationPanel();
  const height = panel?.offsetHeight || 0;
  document.documentElement.style.setProperty(
    "--mobile-calculation-panel-height",
    `${Math.ceil(height)}px`
  );
}

function scheduleMobileCalculationShellMeasure() {
  if (calculationShellFrame !== null) return;
  calculationShellFrame = window.requestAnimationFrame(measureMobileCalculationShell);
}

function setMobileCalculationShellExpanded(expanded, options = {}) {
  calculationShellExpanded = Boolean(expanded);

  const body = document.body;
  const panel = getMobileCalculationPanel();
  const closeHost = ensureCalculationMobileCloseHost();

  body.classList.toggle("mobile-calculation-shell-expanded", calculationShellExpanded);
  body.classList.toggle("mobile-calculation-shell-collapsed", !calculationShellExpanded);

  panel?.classList.toggle("is-mobile-shell-expanded", calculationShellExpanded);
  panel?.classList.toggle("is-mobile-shell-collapsed", !calculationShellExpanded);
  panel?.classList.remove("is-collapsed", "is-expanded");

  closeHost.hidden = getMobileCalculationPhase() === "none" || !calculationShellExpanded;

  calculationBtn?.setAttribute(
    "aria-expanded",
    calculationShellExpanded ? "true" : "false"
  );

  calculationBtn?.setAttribute(
    "aria-label",
    calculationShellExpanded
      ? "Collapse Calculation controls"
      : "Expand Calculation controls"
  );

  if (options.focusTrigger) {
    calculationBtn?.focus({ preventScroll: true });
  }

  scheduleMobileCalculationShellMeasure();
}

function toggleMobileCalculationShell() {
  if (!isMobileCalculationLayoutActive()) return false;
  if (getMobileCalculationPhase() === "none") return false;
  setMobileCalculationShellExpanded(!calculationShellExpanded);
  return true;
}

function isCalculationPickerVisible() {
  const picker = document.getElementById("picker");
  if (!picker || picker.hidden) return false;
  return Boolean(
    picker.classList.contains("picker-mobile-calculation") ||
    picker.classList.contains("picker-mobile-zone")
  );
}

function syncCalculationShellForPicker() {
  const pickerOpen = isCalculationPickerVisible();
  const phase = getMobileCalculationPhase();

  if (!isMobileCalculationLayoutActive() || phase === "none") {
    calculationPickerWasOpen = pickerOpen;
    return;
  }

  if (pickerOpen && !calculationPickerWasOpen) {
    calculationShellExpandedBeforePicker = calculationShellExpanded;
    setMobileCalculationShellExpanded(false);
  }

  if (!pickerOpen && calculationPickerWasOpen) {
    setMobileCalculationShellExpanded(calculationShellExpandedBeforePicker);
  }

  calculationPickerWasOpen = pickerOpen;
}

function ensureCalculationGuidancePreferences() {
  if (!state.preferences || typeof state.preferences !== "object") {
    state.preferences = { interfaceMode: INTERFACE_MODES.FULL };
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
  return type === "setup" ? preferences.setupSeen : preferences.modeSeen;
}

function markMobileCalculationGuideSeen(type) {
  const preferences = ensureCalculationGuidancePreferences();
  if (type === "setup") preferences.setupSeen = true;
  else preferences.modeSeen = true;
  if (typeof saveLocalAppData === "function") saveLocalAppData();
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
  scheduleMobileApplicationShellSync?.();
}

function updateMobileCalculationGuideCountdown(seconds) {
  const countdown = document.getElementById("calculationGuideCountdown");
  const button = document.getElementById("calculationGuideOkBtn");
  if (countdown) countdown.textContent = `Continuing automatically in ${seconds}s`;
  if (button) button.textContent = seconds > 0 ? `OK · ${seconds}` : "OK";
}

function showMobileCalculationGuide(type) {
  if (!isMobileCalculationLayoutActive()) return false;
  if (!CALCULATION_MOBILE_GUIDES[type] || hasSeenMobileCalculationGuide(type)) return false;

  const overlay = document.getElementById("calculationGuideOverlay");
  const title = document.getElementById("calculationGuideTitle");
  const message = document.getElementById("calculationGuideMessage");
  const button = document.getElementById("calculationGuideOkBtn");
  if (!overlay || !title || !message || !button) return false;

  clearMobileCalculationGuideTimers();
  const guide = CALCULATION_MOBILE_GUIDES[type];
  title.textContent = guide.title;
  message.innerHTML = guide.body.map(item => `<p>${item}</p>`).join("");
  overlay.dataset.guideType = type;
  overlay.hidden = false;
  markMobileCalculationGuideSeen(type);

  const startedAt = Date.now();
  updateMobileCalculationGuideCountdown(10);
  calculationGuideCountdownTimer = window.setInterval(() => {
    const remaining = Math.max(
      0,
      Math.ceil((CALCULATION_GUIDE_AUTO_DISMISS_MS - (Date.now() - startedAt)) / 1000)
    );
    updateMobileCalculationGuideCountdown(remaining);
  }, 250);

  calculationGuideTimeout = window.setTimeout(
    closeMobileCalculationGuide,
    CALCULATION_GUIDE_AUTO_DISMISS_MS
  );

  window.requestAnimationFrame(() => button.focus({ preventScroll: true }));
  scheduleMobileApplicationShellSync?.();
  return true;
}

function syncMobileCalculationShell() {
  syncCalculationMobileControlLayout();

  if (!isMobileCalculationLayoutActive()) {
    lastMobileCalculationPhase = "none";
    if (isMobileCalculationGuideOpen()) closeMobileCalculationGuide();
    return;
  }

  const phase = getMobileCalculationPhase();

  if (phase === "none") {
    lastMobileCalculationPhase = "none";
    document.body.classList.remove(
      "mobile-calculation-shell-expanded",
      "mobile-calculation-shell-collapsed"
    );
    ensureCalculationMobileCloseHost().hidden = true;
    return;
  }

  if (phase !== lastMobileCalculationPhase) {
    calculationShellExpanded = true;
    lastMobileCalculationPhase = phase;
    showMobileCalculationGuide(phase);
  }

  setMobileCalculationShellExpanded(calculationShellExpanded);
  scheduleMobileCalculationShellMeasure();

  const panel = getMobileCalculationPanel(phase);
  if (panel && calculationShellResizeObserver) {
    calculationShellResizeObserver.disconnect();
    calculationShellResizeObserver.observe(panel);
  }
}

function initializeCalculationMobileLayout() {
  if (calculationMobileLayoutInitialized) return;
  calculationMobileLayoutInitialized = true;

  ensureCalculationGuidancePreferences();
  ensureCalculationMobileCloseHost();

  document.getElementById("calculationGuideOkBtn")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeMobileCalculationGuide();
  });

  document.getElementById("calculationGuideOverlay")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
  });

  calculationGuideMutationObserver = new MutationObserver(syncMobileCalculationShell);

  for (const element of [calculationSetupOverlay, calculationStatus]) {
    if (!element) continue;
    calculationGuideMutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  calculationShellResizeObserver = new ResizeObserver(
    scheduleMobileCalculationShellMeasure
  );

  const picker = document.getElementById("picker");
  if (picker) {
    calculationPickerMutationObserver = new MutationObserver(syncCalculationShellForPicker);
    calculationPickerMutationObserver.observe(picker, {
      attributes: true,
      attributeFilter: ["hidden", "class", "data-picker-owner"]
    });
  }

  window.addEventListener("spot-sketch:viewport-change", syncMobileCalculationShell);
  window.addEventListener("spot-sketch:picker-closed", syncCalculationShellForPicker);

  syncMobileCalculationShell();
}
