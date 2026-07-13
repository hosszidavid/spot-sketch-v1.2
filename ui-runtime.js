"use strict";

/*
==========================================================
SPOT SKETCH

Module:
UI Runtime Coordinator

Purpose:
Provides the small, shared runtime primitives used by presentation modules:
- one-frame scheduling without duplicated requestAnimationFrame guards;
- reversible DOM relocation for mobile portals;
- one authoritative transient-surface priority and outside-click guard.

This module intentionally contains no application data or workflow logic.
==========================================================
*/

function createFrameScheduler(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("createFrameScheduler requires a callback.");
  }

  let frameId = null;

  function schedule() {
    if (frameId !== null) return;

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      callback();
    });
  }

  schedule.cancel = () => {
    if (frameId === null) return;
    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  schedule.flush = () => {
    schedule.cancel();
    callback();
  };

  schedule.isPending = () => frameId !== null;

  return schedule;
}

function createDomRelocator(namespace = "surface") {
  const origins = new Map();

  function remember(element) {
    if (!element || origins.has(element) || !element.parentNode) return;

    const label = element.id || element.className || "element";
    const marker = document.createComment(
      `spot-sketch-${namespace}-origin:${String(label)}`
    );

    element.parentNode.insertBefore(marker, element);
    origins.set(element, marker);
  }

  function move(element, destination) {
    if (!element || !destination) return false;

    remember(element);

    if (element.parentElement !== destination) {
      destination.appendChild(element);
    }

    return true;
  }

  function restore(element) {
    const marker = origins.get(element);
    if (!element || !marker?.parentNode) return false;

    marker.parentNode.insertBefore(element, marker.nextSibling);
    marker.remove();
    origins.delete(element);
    return true;
  }

  function restoreAll() {
    for (const element of [...origins.keys()]) {
      restore(element);
    }
  }

  function has(element) {
    return origins.has(element);
  }

  return Object.freeze({ remember, move, restore, restoreAll, has });
}

function getOpenTransientSurface() {
  if (typeof isDialogOpen === "function" && isDialogOpen()) {
    return null;
  }

  const addMenu = document.getElementById("addMenu");
  if (addMenu && !addMenu.hidden) {
    return {
      name: "add",
      element: addMenu,
      trigger: document.getElementById("addBtn"),
      close: closeHeaderMenus
    };
  }

  const addToProjectMenu = document.getElementById("addToProjectMenu");
  if (addToProjectMenu && !addToProjectMenu.hidden) {
    return {
      name: "add-to-project",
      element: addToProjectMenu,
      trigger: null,
      close: closeHeaderMenus
    };
  }

  /* A shared picker is always above the editor that opened it. */
  if (typeof isPickerOpen === "function" && isPickerOpen()) {
    return {
      name: "picker",
      element: document.getElementById("picker"),
      trigger: null,
      close: hidePicker
    };
  }

  if (typeof isProjectInfoOpen === "function" && isProjectInfoOpen()) {
    return {
      name: "gear",
      element: document.getElementById("projectInfoMenu"),
      trigger: document.getElementById("projectInfoBtn"),
      close: requestCancelProjectInfoPanel
    };
  }

  if (typeof isLocationPanelOpen === "function" && isLocationPanelOpen()) {
    return {
      name: "location",
      element: document.getElementById("locationPanel"),
      trigger: document.getElementById("locationBtn"),
      close: closeLocationPanel
    };
  }

  return null;
}

let transientSurfaceGuardBound = false;

function bindTransientSurfaceGuard() {
  if (transientSurfaceGuardBound) return;
  transientSurfaceGuardBound = true;

  document.addEventListener("click", event => {
    if (
      (typeof isDialogOpen === "function" && isDialogOpen()) ||
      event.target.closest?.("#dialogOverlay")
    ) {
      return;
    }

    const surface = getOpenTransientSurface();
    if (!surface?.element) return;

    if (surface.element.contains(event.target)) return;
    if (surface.trigger?.contains(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    surface.close("outside-click");
  }, true);
}
