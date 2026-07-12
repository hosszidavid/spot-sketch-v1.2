"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Calculation Mobile Layout

Purpose:
Provides first-entry mobile guidance and a compact responsive presentation
contract for Calculation Setup and active Calculation Mode.

Owns:
- mobile-only Calculation education dialog
- automatic guide dismissal and countdown
- device-local guide completion preferences
- Calculation phase observation for mobile entry

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
let lastMobileCalculationPhase = "none";

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


function getMobileCalculationPhase() {
  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION_SETUP)) {
    return "setup";
  }

  if (isWorkflowPhase(WORKFLOW_PHASES.CALCULATION)) {
    return "mode";
  }

  return "none";
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

  if (phase === lastMobileCalculationPhase) return;

  lastMobileCalculationPhase = phase;
  showMobileCalculationGuide(phase);
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
      /* The education dialog is intentionally closed only by OK or timeout. */
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

  window.addEventListener(
    "spot-sketch:viewport-change",
    syncMobileCalculationGuide
  );

  syncMobileCalculationGuide();
}
