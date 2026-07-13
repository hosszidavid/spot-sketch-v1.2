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
let calculationGuideCountdownTimer = null;
let calculationGuideRemainingMs = CALCULATION_GUIDE_AUTO_DISMISS_MS;
let calculationGuideLastTick = 0;
let calculationGuideHeld = false;
let calculationGuideCycle = { setupSeen: false, modeSeen: false };
let calculationGuideMutationObserver = null;
let calculationPickerMutationObserver = null;
let calculationShellResizeObserver = null;
let lastMobileCalculationPhase = "none";
let calculationMobilePrimaryRow = null;
let calculationMobileCloseHost = null;
let calculationPickerWasOpen = false;
let calculationShellExpandedBeforePicker = true;
let calculationShellExpanded = true;
const calculationMobileControlRelocator = createDomRelocator("calculation-mobile");

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
  calculationMobileControlRelocator.remember(element);
}

function restoreCalculationMobileControlOrigin(element) {
  calculationMobileControlRelocator.restore(element);
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
  const panel = getMobileCalculationPanel();
  const height = panel?.offsetHeight || 0;
  document.documentElement.style.setProperty(
    "--mobile-calculation-panel-height",
    `${Math.ceil(height)}px`
  );
}

const scheduleMobileCalculationShellMeasure = createFrameScheduler(measureMobileCalculationShell);

function setMobileCalculationShellExpanded(expanded, options = {}) {
  const phase = getMobileCalculationPhase();
  calculationShellExpanded = phase === "setup" ? true : Boolean(expanded);

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
    phase === "setup"
      ? "Calculation Setup is open"
      : calculationShellExpanded
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
  if (getMobileCalculationPhase() !== "mode") return false;
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

  /* Fine-adjustment baseline: pickers no longer collapse the Calculation
     panel. The workflow trigger remains the sole collapse control in active
     Calculation Mode. */
  calculationPickerWasOpen = pickerOpen;
  scheduleMobileCalculationShellMeasure();
}

function resetMobileCalculationGuidance() {
  calculationGuideCycle = { setupSeen: false, modeSeen: false };
  if (isMobileCalculationGuideOpen()) closeMobileCalculationGuide();
}

function hasSeenMobileCalculationGuide(type) {
  return type === "setup"
    ? calculationGuideCycle.setupSeen
    : calculationGuideCycle.modeSeen;
}

function markMobileCalculationGuideSeen(type) {
  if (type === "setup") calculationGuideCycle.setupSeen = true;
  else calculationGuideCycle.modeSeen = true;
}

function isMobileCalculationGuideOpen() {
  const overlay = document.getElementById("calculationGuideOverlay");
  return Boolean(overlay && !overlay.hidden);
}

function clearMobileCalculationGuideTimers() {
  window.clearInterval(calculationGuideCountdownTimer);
  calculationGuideCountdownTimer = null;
  calculationGuideHeld = false;
  calculationGuideLastTick = 0;
}

function closeMobileCalculationGuide() {
  const overlay = document.getElementById("calculationGuideOverlay");
  if (!overlay) return;
  clearMobileCalculationGuideTimers();
  overlay.hidden = true;
  overlay.classList.remove("is-held");
  overlay.removeAttribute("data-guide-type");
  document.getElementById("calculationGuideHoldBtn")?.setAttribute("aria-pressed", "false");
  scheduleMobileApplicationShellSync?.();
}

function updateMobileCalculationGuideCountdown() {
  const countdown = document.getElementById("calculationGuideCountdown");
  const button = document.getElementById("calculationGuideOkBtn");
  const progress = document.querySelector(".calculation-guide-progress span");
  const seconds = Math.max(0, Math.ceil(calculationGuideRemainingMs / 1000));
  if (countdown) {
    countdown.textContent = calculationGuideHeld
      ? `Paused · ${seconds}s remaining`
      : `Continuing automatically in ${seconds}s`;
  }
  if (button) button.textContent = seconds > 0 ? `OK · ${seconds}` : "OK";
  if (progress) {
    const ratio = Math.max(0, Math.min(1,
      calculationGuideRemainingMs / CALCULATION_GUIDE_AUTO_DISMISS_MS
    ));
    progress.style.transform = `scaleX(${ratio})`;
  }
}

function setMobileCalculationGuideHeld(held) {
  if (!isMobileCalculationGuideOpen()) return;
  calculationGuideHeld = Boolean(held);
  const overlay = document.getElementById("calculationGuideOverlay");
  const holdButton = document.getElementById("calculationGuideHoldBtn");
  overlay?.classList.toggle("is-held", calculationGuideHeld);
  holdButton?.setAttribute("aria-pressed", calculationGuideHeld ? "true" : "false");
  calculationGuideLastTick = performance.now();
  updateMobileCalculationGuideCountdown();
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

  calculationGuideRemainingMs = CALCULATION_GUIDE_AUTO_DISMISS_MS;
  calculationGuideHeld = false;
  calculationGuideLastTick = performance.now();
  updateMobileCalculationGuideCountdown();
  calculationGuideCountdownTimer = window.setInterval(() => {
    const now = performance.now();
    const elapsed = now - calculationGuideLastTick;
    calculationGuideLastTick = now;
    if (!calculationGuideHeld) {
      calculationGuideRemainingMs = Math.max(0, calculationGuideRemainingMs - elapsed);
    }
    updateMobileCalculationGuideCountdown();
    if (calculationGuideRemainingMs <= 0) closeMobileCalculationGuide();
  }, 100);

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
    calculationShellExpanded = true;
    document.body.classList.remove(
      "mobile-calculation-shell-expanded",
      "mobile-calculation-shell-collapsed",
      "calculation-mobile-panel-visible"
    );
    ensureCalculationMobileCloseHost().hidden = true;
    document.documentElement.style.setProperty("--mobile-calculation-panel-height", "0px");
    return;
  }

  if (phase !== lastMobileCalculationPhase) {
    calculationShellExpanded = true;
    lastMobileCalculationPhase = phase;
    showMobileCalculationGuide(phase);
  }

  document.body.classList.add("calculation-mobile-panel-visible");
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

  ensureCalculationMobileCloseHost();

  document.getElementById("calculationGuideOkBtn")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeMobileCalculationGuide();
  });

  const guideHoldButton = document.getElementById("calculationGuideHoldBtn");
  guideHoldButton?.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    guideHoldButton.setPointerCapture?.(event.pointerId);
    setMobileCalculationGuideHeld(true);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    guideHoldButton?.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      setMobileCalculationGuideHeld(false);
    });
  }
  guideHoldButton?.addEventListener("keydown", event => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      setMobileCalculationGuideHeld(true);
    }
  });
  guideHoldButton?.addEventListener("keyup", event => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      setMobileCalculationGuideHeld(false);
    }
  });

  window.addEventListener("spot-sketch:calculation-guidance-reset", resetMobileCalculationGuidance);

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


globalThis.resetMobileCalculationGuidance = resetMobileCalculationGuidance;
