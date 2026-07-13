"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Mobile Project and Metadata Surfaces

Purpose:
Stabilizes the mobile editing experience for Project Manager, Gear
Settings, Location and the Add / Open / Save workflow.

Owns:
- mobile form focus and keyboard-aware scrolling
- mobile Project / Metadata surface state
- Add sheet project context
- mobile library-autocomplete repositioning
- presentation-only metadata input hints

Does NOT own:
- project or metadata persistence
- dirty-state decisions
- project-document schema
- desktop surface geometry
==========================================================
*/

let mobileProjectSurfacesInitialized = false;
let mobileProjectSurfaceObserver = null;
let mobileProjectSurfaceFrame = null;
let mobileFocusedFieldTimer = null;

const MOBILE_PROJECT_SURFACE_SELECTORS = Object.freeze({
  gear: "#projectInfoMenu",
  location: "#locationPanel",
  projectManager: "#projectManagerOverlay",
  add: "#addMenu"
});

function isMobileProjectSurfaceLayoutActive() {
  return Boolean(
    typeof isMobileApplicationShellActive === "function" &&
    isMobileApplicationShellActive()
  );
}

function isMobileProjectEditable(element) {
  return Boolean(
    element &&
    element.matches?.("input:not([type='checkbox']):not([type='radio']), textarea, select")
  );
}

function getMobileProjectSurfaceForElement(element) {
  if (!element) return null;

  return (
    element.closest("#projectInfoMenu") ||
    element.closest("#locationPanel") ||
    element.closest("#projectManagerOverlay") ||
    element.closest("#addMenu") ||
    element.closest("#dialogOverlay")
  );
}

function getOpenMobileProjectSurfaceName() {
  if (!isMobileProjectSurfaceLayoutActive()) return "none";

  for (const [name, selector] of Object.entries(MOBILE_PROJECT_SURFACE_SELECTORS)) {
    const element = document.querySelector(selector);
    if (element && !element.hidden) return name;
  }

  return "none";
}

function ensureMobileAddProjectContext() {
  const menu = document.getElementById("addMenu");
  if (!menu) return null;

  let context = document.getElementById("mobileAddProjectContext");
  if (context) return context;

  context = document.createElement("div");
  context.id = "mobileAddProjectContext";
  context.className = "mobile-add-project-context mobile-only";
  context.innerHTML = `
    <span class="mobile-add-context-label">Current project</span>
    <strong class="mobile-add-context-name">Untitled Project</strong>
    <small class="mobile-add-context-detail">1 Spot Sketch</small>
  `;

  const firstSection = menu.querySelector(".add-section");
  menu.insertBefore(context, firstSection || null);
  return context;
}

function updateMobileAddProjectContext() {
  const context = ensureMobileAddProjectContext();
  if (!context) return;

  const projectName = String(
    state?.projectSession?.name ||
    loadedProjectDocument?.project?.name ||
    "Untitled Project"
  ).trim() || "Untitled Project";

  const sketchCount = Math.max(
    1,
    Number(loadedProjectDocument?.spotSketches?.length || 1)
  );

  const identifier = String(state?.project?.imageIdentifier || "").trim();

  const name = context.querySelector(".mobile-add-context-name");
  const detail = context.querySelector(".mobile-add-context-detail");

  if (name) name.textContent = projectName;
  if (detail) {
    detail.textContent = [
      `${sketchCount} Spot Sketch${sketchCount === 1 ? "" : "es"}`,
      identifier ? `Image: ${identifier}` : "Image Identifier not set"
    ].join(" · ");
  }
}

function applyMobileMetadataInputHints() {
  const decimalIds = [
    "locationLatitudeInput",
    "locationLongitudeInput",
    "locationAltitudeInput",
    "locationAccuracyInput"
  ];

  for (const id of decimalIds) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.enterKeyHint = "next";
  }

  const projectName = document.getElementById("projectManagerNameInput");
  if (projectName) {
    projectName.autocapitalize = "words";
    projectName.enterKeyHint = "done";
  }

  for (const input of document.querySelectorAll(
    "#projectInfoMenu input[type='text'], #locationPanel input[type='text']"
  )) {
    input.autocapitalize = "words";
  }
}

function getMobileFieldScrollContainer(field) {
  return field?.closest(
    "#projectInfoMenu, #locationPanel, .project-manager, .add-menu, .dialog"
  ) || null;
}

function scrollMobileProjectFieldIntoView(field, behavior = "smooth") {
  if (!isMobileProjectSurfaceLayoutActive() || !isMobileProjectEditable(field)) {
    return;
  }

  window.clearTimeout(mobileFocusedFieldTimer);
  mobileFocusedFieldTimer = window.setTimeout(() => {
    if (document.activeElement !== field) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const rect = field.getBoundingClientRect();
    const container = getMobileFieldScrollContainer(field);
    const stickyHeader = container?.querySelector?.(
      ":scope > .mobile-surface-heading, :scope > .mobile-gear-heading, :scope > .location-panel-heading, :scope > .project-manager-header"
    );
    const headerBottom = stickyHeader?.getBoundingClientRect().bottom || viewportTop;
    const safeTop = Math.max(viewportTop + 8, headerBottom + 8);
    const safeBottom = viewportBottom - 12;

    let delta = 0;
    if (rect.bottom > safeBottom) {
      delta = rect.bottom - safeBottom;
    } else if (rect.top < safeTop) {
      delta = rect.top - safeTop;
    }

    if (
      Math.abs(delta) > 1 &&
      container &&
      container.scrollHeight > container.clientHeight
    ) {
      container.scrollBy({
        top: delta,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
          ? "auto"
          : behavior
      });
    }

    if (typeof repositionProjectLibraryAutocomplete === "function") {
      window.requestAnimationFrame(repositionProjectLibraryAutocomplete);
    }
  }, 180);
}

function activateMobileProjectEditing(field) {
  if (!isMobileProjectEditable(field) || !isMobileProjectSurfaceLayoutActive()) {
    return;
  }

  const surface = getMobileProjectSurfaceForElement(field);
  surface?.classList.add("mobile-form-editing");
  document.documentElement.dataset.mobileForm = "editing";
  scrollMobileProjectFieldIntoView(field);
}

function handleMobileProjectFocusIn(event) {
  activateMobileProjectEditing(event.target);
}

function handleMobileProjectPointerDown(event) {
  activateMobileProjectEditing(event.target);
}

function handleMobileProjectFocusOut(event) {
  const surface = getMobileProjectSurfaceForElement(event.target);

  window.setTimeout(() => {
    if (surface && !surface.contains(document.activeElement)) {
      surface.classList.remove("mobile-form-editing");
    }

    const activeSurface = getMobileProjectSurfaceForElement(document.activeElement);
    if (!activeSurface || !isMobileProjectEditable(document.activeElement)) {
      document.documentElement.dataset.mobileForm = "idle";
      window.requestAnimationFrame(() => {
        document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        if (typeof drawBubbles === "function") drawBubbles();
      });
    }
  }, 120);
}

function synchronizeMobileProjectSurfaceState() {
  const root = document.documentElement;
  const active = isMobileProjectSurfaceLayoutActive();
  const surface = active ? getOpenMobileProjectSurfaceName() : "none";

  root.dataset.mobileProjectSurface = surface;
  document.body.classList.toggle(
    "mobile-project-surface-open",
    active && surface !== "none"
  );

  updateMobileAddProjectContext();

  if (typeof repositionProjectLibraryAutocomplete === "function") {
    repositionProjectLibraryAutocomplete();
  }
}

function scheduleMobileProjectSurfaceSync() {
  if (mobileProjectSurfaceFrame !== null) return;

  mobileProjectSurfaceFrame = window.requestAnimationFrame(() => {
    mobileProjectSurfaceFrame = null;
    synchronizeMobileProjectSurfaceState();
  });
}

function initializeMobileProjectSurfaceObserver() {
  mobileProjectSurfaceObserver = new MutationObserver(
    scheduleMobileProjectSurfaceSync
  );

  for (const selector of Object.values(MOBILE_PROJECT_SURFACE_SELECTORS)) {
    const element = document.querySelector(selector);
    if (!element) continue;

    mobileProjectSurfaceObserver.observe(element, {
      attributes: true,
      attributeFilter: ["hidden", "class"],
      childList: selector === "#projectManagerOverlay",
      subtree: selector === "#projectManagerOverlay"
    });
  }
}

function initializeMobileProjectSurfaces() {
  if (mobileProjectSurfacesInitialized) return;
  mobileProjectSurfacesInitialized = true;

  ensureMobileAddProjectContext();
  applyMobileMetadataInputHints();
  initializeMobileProjectSurfaceObserver();

  document.addEventListener("focusin", handleMobileProjectFocusIn);
  document.addEventListener("focusout", handleMobileProjectFocusOut);
  document.addEventListener("pointerdown", handleMobileProjectPointerDown, true);

  document.getElementById("imageIdentifier")?.addEventListener("focusout", () => {
    window.setTimeout(() => {
      document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if (typeof drawBubbles === "function") drawBubbles();
    }, 160);
  });

  window.addEventListener(
    "spot-sketch:viewport-change",
    () => {
      scheduleMobileProjectSurfaceSync();
      if (isMobileProjectEditable(document.activeElement)) {
        scrollMobileProjectFieldIntoView(document.activeElement, "auto");
      }
    }
  );

  document.addEventListener("scroll", event => {
    if (
      isMobileProjectSurfaceLayoutActive() &&
      event.target?.closest?.(
        "#projectInfoMenu, #locationPanel, .project-manager-list"
      ) &&
      typeof repositionProjectLibraryAutocomplete === "function"
    ) {
      repositionProjectLibraryAutocomplete();
    }
  }, true);

  synchronizeMobileProjectSurfaceState();
}
