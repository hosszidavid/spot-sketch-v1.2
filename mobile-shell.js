"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Mobile Application Shell

Purpose:
Provides the responsive application chrome used on tablet and mobile:
- compact top identity/status header
- persistent bottom primary-action bar
- mobile surface portal for bottom sheets and fullscreen editors
- orientation-aware shell state

Owns:
- mobile shell activation
- mobile proxy action buttons
- mobile surface re-parenting
- shell suppression while modal workflows or the software keyboard are open
- mobile action state synchronization

Does NOT own:
- the underlying Add, Gear, Location, Export or Theme actions
- workflow calculations
- panel data or dirty-state logic
- marker touch interaction

Dependencies:
- responsive.js
- header.js
- project.js
- recording-workflow.js
- export-workspace.js
==========================================================
*/

const MOBILE_SHELL_VIEWPORTS = new Set(["mobile", "tablet"]);

let mobileApplicationShellInitialized = false;
let mobileShellSyncFrame = null;
let mobileShellObserver = null;
let mobileShellBarHeight = 0;
let mobileActionBarExpanded = true;
let mobileActionBarTimer = null;

const mobileSurfaceOrigins = new Map();


/*
────────────────────────────────────────────
1. Shell Status
────────────────────────────────────────────
*/

function isMobileApplicationShellActive() {
  return MOBILE_SHELL_VIEWPORTS.has(
    document.documentElement.dataset.viewportSize
  );
}

function getMobileSurfacePortal() {
  return document.getElementById("mobileSurfacePortal");
}

function isMobileShellElementOpen(id) {
  const element = document.getElementById(id);
  return Boolean(element && !element.hidden);
}

function getMobileShellSurfaceName() {
  if (isMobileShellElementOpen("addMenu")) return "add";
  if (typeof isProjectInfoOpen === "function" && isProjectInfoOpen()) return "gear";
  if (typeof isLocationPanelOpen === "function" && isLocationPanelOpen()) return "location";
  if (typeof isExportWorkspaceOpen === "function" && isExportWorkspaceOpen()) return "export";
  if (typeof isProjectManagerOpen === "function" && isProjectManagerOpen()) return "project-manager";
  if (isMobileShellElementOpen("meteringSetupOverlay")) return "metering-setup";
  if (isMobileShellElementOpen("calculationGuideOverlay")) return "calculation-guide";
  if (isMobileShellElementOpen("calculationSetupOverlay")) return "calculation-setup";
  if (isMobileShellElementOpen("calculationStatus")) return "calculation";
  if (isMobileShellElementOpen("imageCropOverlay")) return "image-crop";
  if (isMobileShellElementOpen("replaceImageOverlay")) return "replace-image";
  if (isMobileShellElementOpen("dialogOverlay")) return "dialog";
  return "none";
}

function isMobileShellModalSurfaceOpen(surfaceName) {
  return [
    "add",
    "gear",
    "location",
    "export",
    "project-manager",
    "metering-setup",
    "calculation-guide",
    "image-crop",
    "replace-image",
    "dialog"
  ].includes(surfaceName);
}


/*
────────────────────────────────────────────
2. Mobile Surface Portal
────────────────────────────────────────────
*/

function rememberMobileSurfaceOrigin(element) {
  if (!element || mobileSurfaceOrigins.has(element)) return;

  const marker = document.createComment(
    `spot-sketch-mobile-origin:${element.id || element.className || "surface"}`
  );

  element.parentNode?.insertBefore(marker, element);
  mobileSurfaceOrigins.set(element, marker);
}

function moveMobileSurfaceToPortal(element) {
  const portal = getMobileSurfacePortal();
  if (!element || !portal) return;

  rememberMobileSurfaceOrigin(element);

  if (element.parentElement !== portal) {
    portal.appendChild(element);
  }
}

function restoreMobileSurfaceOrigin(element) {
  const marker = mobileSurfaceOrigins.get(element);
  if (!element || !marker?.parentNode) return;

  marker.parentNode.insertBefore(element, marker.nextSibling);
}

function relocateMobileShellSurfaces(active) {
  const surfaceIds = [
    "addMenu",
    "locationPanel",
    "projectInfoMenu"
  ];

  for (const id of surfaceIds) {
    const element = document.getElementById(id);
    if (!element) continue;

    if (active) {
      moveMobileSurfaceToPortal(element);
    } else {
      restoreMobileSurfaceOrigin(element);
    }
  }
}


/*
────────────────────────────────────────────
3. Proxy Actions
────────────────────────────────────────────
*/

function mobileShellForwardAction(sourceId, fallbackMessage) {
  const source = document.getElementById(sourceId);
  if (!source) return;

  const unavailable =
    source.disabled ||
    source.getAttribute("aria-disabled") === "true";

  if (unavailable) {
    if (typeof showAppNotification === "function") {
      showAppNotification({
        type: "info",
        title: "Action unavailable",
        message: fallbackMessage || source.title || "This action is not available right now."
      });
    }
    return;
  }

  source.click();
  setMobileActionBarExpanded();
  scheduleMobileApplicationShellSync();
}

function bindMobileShellAction(buttonId, sourceId, fallbackMessage) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    mobileShellForwardAction(sourceId, fallbackMessage);
  });
}

function clearMobileActionBarTimer() {
  window.clearTimeout(mobileActionBarTimer);
  mobileActionBarTimer = null;
}

function setMobileActionBarExpanded() {
  mobileActionBarExpanded = true;

  const root = document.documentElement;
  const bar = document.getElementById("mobileActionBar");
  const handle = document.getElementById("mobileActionHandle");

  root.classList.add("mobile-action-bar-open");
  bar?.classList.add("is-expanded");
  handle?.setAttribute("aria-expanded", "true");
  handle?.setAttribute("aria-label", "Application menu");

  clearMobileActionBarTimer();
}

function keepMobileActionBarOpen() {
  setMobileActionBarExpanded();
}

function bindMobileShellActions() {
  document.getElementById("mobileActionBar")?.addEventListener("pointerdown", keepMobileActionBarOpen);

  bindMobileShellAction("mobileAddAction", "addBtn");
  bindMobileShellAction("mobileGearAction", "projectInfoBtn");
  bindMobileShellAction("mobileLocationAction", "locationBtn");
  bindMobileShellAction(
    "mobileExportAction",
    "exportBtn",
    "Add an image before opening Export."
  );
  bindMobileShellAction("mobileThemeAction", "themeBtn");

  document
    .getElementById("mobileAddMenuCloseBtn")
    ?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeHeaderMenus();
      scheduleMobileApplicationShellSync();
    });

  document
    .getElementById("mobileGearCloseBtn")
    ?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (typeof requestCancelProjectInfoPanel === "function") {
        requestCancelProjectInfoPanel();
      } else if (typeof closeProjectInfoPanel === "function") {
        closeProjectInfoPanel();
      }

      scheduleMobileApplicationShellSync();
    });
}


/*
────────────────────────────────────────────
4. Visual Synchronization
────────────────────────────────────────────
*/

function setMobileActionState(buttonId, options = {}) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.disabled = Boolean(options.disabled);
  button.classList.toggle("is-active", Boolean(options.active));

  if (options.label) {
    const label = button.querySelector(".mobile-action-label");
    if (label) label.textContent = options.label;
  }
}

function syncMobileThemeAction() {
  const button = document.getElementById("mobileThemeAction");
  if (!button) return;

  const dark = document.body.classList.contains("dark");
  button.setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
  button.title = dark ? "Light mode" : "Dark mode";
  button.classList.toggle("is-dark-active", dark);

  const label = button.querySelector(".mobile-action-label");
  if (label) label.textContent = dark ? "Light" : "Dark";
}

function syncMobileShellBarHeight() {
  const bar = document.getElementById("mobileActionBar");
  if (!bar || bar.hidden) return;

  const height = Math.ceil(bar.getBoundingClientRect().height);
  if (!height || height === mobileShellBarHeight) return;

  mobileShellBarHeight = height;
  document.documentElement.style.setProperty(
    "--mobile-action-bar-height",
    `${height}px`
  );

  window.requestAnimationFrame(() => {
    if (typeof fitImage === "function") fitImage();
    if (typeof drawBubbles === "function") drawBubbles();
  });
}

function syncMobileApplicationShell() {
  const root = document.documentElement;
  const body = document.body;
  const bar = document.getElementById("mobileActionBar");
  if (!bar) return;

  const active = isMobileApplicationShellActive();

  body.classList.toggle("mobile-shell-active", active);
  bar.hidden = !active;

  relocateMobileShellSurfaces(active);

  if (!active) {
    root.dataset.mobileSurface = "none";
    root.classList.remove("mobile-shell-surface-open", "mobile-action-bar-open");
    clearMobileActionBarTimer();
    mobileActionBarExpanded = true;
    return;
  }

  setMobileActionBarExpanded();

  const surfaceName = getMobileShellSurfaceName();
  const keyboardVisible = root.dataset.keyboard === "visible";
  const modalSurfaceOpen = isMobileShellModalSurfaceOpen(surfaceName);
  const suppressBar = keyboardVisible || modalSurfaceOpen;

  root.dataset.mobileSurface = surfaceName;
  root.classList.toggle("mobile-shell-surface-open", surfaceName !== "none");
  bar.classList.toggle("is-suppressed", suppressBar);
  bar.setAttribute("aria-hidden", suppressBar ? "true" : "false");

  if (suppressBar && mobileActionBarExpanded) {
    setMobileActionBarExpanded();
  } else {
    bar.classList.toggle("is-expanded", mobileActionBarExpanded);
    root.classList.toggle("mobile-action-bar-open", mobileActionBarExpanded);
  }

  const addMenuOpen = surfaceName === "add";
  const gearOpen = surfaceName === "gear";
  const locationOpen = surfaceName === "location";
  const exportOpen = surfaceName === "export";

  setMobileActionState("mobileAddAction", {
    active: addMenuOpen
  });
  setMobileActionState("mobileGearAction", {
    active: gearOpen
  });
  setMobileActionState("mobileLocationAction", {
    active: locationOpen
  });
  setMobileActionState("mobileExportAction", {
    active: exportOpen,
    disabled: false
  });

  syncMobileThemeAction();

  const hasMetering = Boolean(
    typeof hasInitialMeteringSetup === "function" &&
    hasInitialMeteringSetup()
  );
  root.dataset.meteringReady = hasMetering ? "true" : "false";

  window.requestAnimationFrame(syncMobileShellBarHeight);
}

function scheduleMobileApplicationShellSync() {
  if (mobileShellSyncFrame !== null) return;

  mobileShellSyncFrame = window.requestAnimationFrame(() => {
    mobileShellSyncFrame = null;
    syncMobileApplicationShell();
  });
}


/*
────────────────────────────────────────────
5. Observation and Initialization
────────────────────────────────────────────
*/

function observeMobileShellElement(id) {
  const element = document.getElementById(id);
  if (!element || !mobileShellObserver) return;

  mobileShellObserver.observe(element, {
    attributes: true,
    attributeFilter: ["hidden", "disabled", "aria-disabled", "class"]
  });
}

function initializeMobileShellObserver() {
  mobileShellObserver = new MutationObserver(
    scheduleMobileApplicationShellSync
  );

  mobileShellObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  [
    "addMenu",
    "projectInfoMenu",
    "locationPanel",
    "exportWorkspaceOverlay",
    "projectManagerOverlay",
    "meteringSetupOverlay",
    "calculationGuideOverlay",
    "calculationSetupOverlay",
    "calculationStatus",
    "imageCropOverlay",
    "replaceImageOverlay",
    "dialogOverlay",
    "initialMeteringDisplay",
    "calculationBtn",
    "exportBtn"
  ].forEach(observeMobileShellElement);
}

function initializeMobileApplicationShell() {
  if (mobileApplicationShellInitialized) return;
  mobileApplicationShellInitialized = true;

  bindMobileShellActions();
  initializeMobileShellObserver();

  window.addEventListener(
    "spot-sketch:viewport-change",
    scheduleMobileApplicationShellSync
  );

  window.addEventListener(
    "spot-sketch:picker-closed",
    scheduleMobileApplicationShellSync
  );

  syncMobileApplicationShell();
}
