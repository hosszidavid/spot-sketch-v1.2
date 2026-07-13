"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Header

Purpose:
Handles header menu interactions.

Table of Contents:
1. Header Elements
2. Header Menu Helpers
3. Header Menu Initialization
4. Add Menu
5. Add to Project Menu
6. Outside Click Handling

Owns:
- Add dropdown menu
- Add to Project dropdown placeholder
- header menu open / close behavior

Does NOT own:
- Project Info panel internals
- image loading logic
- marker interaction
- exposure calculations
- picker rendering

Dependencies:
- picker-core.js
- project.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Header Elements
────────────────────────────────────────────
*/

const headerFileInput = document.getElementById("fileInput");
const headerProjectFileInput = document.getElementById("projectFileInput");

const headerAddBtn = document.getElementById("addBtn");
const headerAddMenu = document.getElementById("addMenu");
const headerOpenImageBtn = document.getElementById("openImageBtn");
const headerOpenProjectBtn = document.getElementById("openProjectBtn");
const headerSaveProjectBtn = document.getElementById("saveProjectBtn");
const headerProjectManagerBtn = document.getElementById("projectManagerBtn");
const headerNewProjectBtn = document.getElementById("newProjectBtn");

const headerAddToProjectMenu = document.getElementById("addToProjectMenu");
const headerAddToNewProjectBtn = document.getElementById("addToNewProjectBtn");
const headerAddToExistingProjectBtn = document.getElementById("addToExistingProjectBtn");

let headerMenusInitialized = false;


/*
────────────────────────────────────────────
2. Header Menu Helpers
────────────────────────────────────────────
*/

/*
  Closes all header dropdown menus.
*/
function closeHeaderMenus() {
  if (headerAddMenu) {
    headerAddMenu.hidden = true;
  }

  if (headerAddToProjectMenu) {
    headerAddToProjectMenu.hidden = true;
  }
}


/*
  Opens or closes a header dropdown.

  Before opening a new menu, every other header menu and picker is closed
  so only one floating panel can be visible at a time.
*/
function toggleHeaderMenu(menu) {
  if (!menu) return;

  const willOpen = menu.hidden;

  closeHeaderMenus();
  hidePicker();
  if (typeof closeLocationPanel === "function") {
    closeLocationPanel();
  }

  menu.hidden = !willOpen;
}


/*
────────────────────────────────────────────
3. Header Menu Initialization
────────────────────────────────────────────
*/

/*
  Initializes every header menu and shared click handler.

  Called once during application startup.
*/
function initializeHeaderMenus() {
  if (headerMenusInitialized) {
    return;
  }

  headerMenusInitialized = true;

  bindAddMenu();
  bindAddToProjectMenu();
  bindHeaderOutsideClick();
  bindTransientSurfaceGuard();
}


/*
────────────────────────────────────────────
4. Add Menu
────────────────────────────────────────────
*/

/*
  Binds the + Add dropdown and its current menu actions.
*/
function bindAddMenu() {
  if (headerAddBtn) {
    headerAddBtn.addEventListener("click", event => {
      event.stopPropagation();

      if (isProjectInfoOpen()) return;

      toggleHeaderMenu(headerAddMenu);
    });
  }

  if (headerOpenImageBtn) {
    headerOpenImageBtn.addEventListener("click", event => {
      event.stopPropagation();

      if (isProjectInfoOpen()) return;

      closeHeaderMenus();

      if (headerFileInput) {
        headerFileInput.click();
      }
    });
  }

  if (headerOpenProjectBtn) {
    headerOpenProjectBtn.addEventListener("click", event => {
      event.stopPropagation();

      if (isProjectInfoOpen()) return;

      closeHeaderMenus();

      if (headerProjectFileInput) {
        headerProjectFileInput.click();
      }
    });
  }

  if (headerProjectFileInput) {
    headerProjectFileInput.addEventListener("change", async () => {
      const file = headerProjectFileInput.files?.[0] || null;
      headerProjectFileInput.value = "";

      if (file) {
        await openSpotSketchProjectFile(file);
      }
    });
  }

  if (headerSaveProjectBtn) {
    headerSaveProjectBtn.addEventListener("click", event => {
      event.stopPropagation();

      if (isProjectInfoOpen()) return;

      closeHeaderMenus();
      saveCurrentSpotSketchProject();
    });
  }

  if (headerProjectManagerBtn) {
    headerProjectManagerBtn.addEventListener("click", event => {
      event.stopPropagation();
      if (isProjectInfoOpen()) return;
      closeHeaderMenus();
      openProjectManager();
    });
  }

  if (headerNewProjectBtn) {
    headerNewProjectBtn.addEventListener("click", event => {
      event.stopPropagation();
      closeHeaderMenus();
      requestNewProject();
    });
  }
}


/*
────────────────────────────────────────────
5. Add to Project Menu
────────────────────────────────────────────
*/

/*
  Binds the placeholder Add to Project menu.

  The menu is already wired for opening and closing, while the actual
  project system can later attach behavior to the individual actions.
*/
function bindAddToProjectMenu() {
  document.addEventListener("click", event => {
    const button = event.target.closest("#addToProjectBtn");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    if (isProjectInfoOpen()) return;

    closeHeaderMenus();
    openProjectManager();
  });

  if (headerAddToNewProjectBtn) {
    headerAddToNewProjectBtn.addEventListener("click", event => {
      event.stopPropagation();
      closeHeaderMenus();
    });
  }

  if (headerAddToExistingProjectBtn) {
    headerAddToExistingProjectBtn.addEventListener("click", event => {
      event.stopPropagation();
      closeHeaderMenus();
    });
  }
}


/*
────────────────────────────────────────────
6. Outside Click Handling
────────────────────────────────────────────
*/

/*
  Closes header menus when clicking outside the header menu area.
*/
function bindHeaderOutsideClick() {
  document.addEventListener("click", event => {
    if (isProjectInfoOpen()) return;

    const clickedHeaderMenu =
      event.target.closest(".add-wrap") ||
      event.target.closest(".image-identifier-wrap") ||
      event.target.closest("#picker");

    if (!clickedHeaderMenu) {
      closeHeaderMenus();
    }
  });
}


/*
  Transient-surface priority and the capture guard are owned by
  ui-runtime.js. Header initialization only binds the shared guard.
*/

