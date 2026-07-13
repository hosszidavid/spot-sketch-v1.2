"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Mobile Guide

Purpose:
Provides a self-contained, bilingual onboarding presentation for the
mobile and tablet application shell.

Owns:
- Guide slide content in Hungarian and English
- Guide language preference
- First-run display preference
- Back / Next / Skip / Finish controls
- Swipe, keyboard and focus handling

Does NOT own:
- project state or .spotsketch files
- Recording, Calculation, Gear, Location or Export workflows
- application data persistence beyond its own local preference keys

Maintenance note:
The Guide is intentionally presentation-only. Do not make slides trigger
real workflow actions or mutate the central Spot Sketch state.
==========================================================
*/

(() => {
  const GUIDE_VERSION = "v1.3";
  const GUIDE_SEEN_KEY = `spotSketch.guide.${GUIDE_VERSION}.seen`;
  const GUIDE_LANGUAGE_KEY = "spotSketch.guide.language";
  const GUIDE_AUTO_DELAY_MS = 900;
  const GUIDE_SWIPE_THRESHOLD = 52;

  const GUIDE_COPY = {
    en: {
      guideLabel: "Spot Sketch Guide",
      languageLabel: "Guide language",
      closeLabel: "Close Guide",
      skip: "Skip Guide",
      back: "Back",
      next: "Next",
      finish: "Start using Spot Sketch",
      slideLabel(index, total) {
        return `Slide ${index} of ${total}`;
      }
    },
    hu: {
      guideLabel: "Spot Sketch útmutató",
      languageLabel: "Az útmutató nyelve",
      closeLabel: "Útmutató bezárása",
      skip: "Útmutató kihagyása",
      back: "Vissza",
      next: "Tovább",
      finish: "Spot Sketch használata",
      slideLabel(index, total) {
        return `${index}. dia / ${total}`;
      }
    }
  };

  const GUIDE_SLIDES = {
    en: [
      {
        visual: "welcome",
        eyebrow: "MOBILE GUIDE",
        title: "Welcome to Spot Sketch",
        paragraphs: [
          "Spot Sketch connects a reference image, spot-meter readings, exposure calculation and photographic notes in one editable project.",
          "This short guide introduces the complete mobile workflow."
        ],
        rule: "You can reopen the Guide later from the Welcome screen or the Add menu."
      },
      {
        visual: "image",
        eyebrow: "1 · REFERENCE",
        title: "Add an Image",
        paragraphs: [
          "Load a reference image, choose its aspect ratio and crop, then add an Image Identifier.",
          "Initial Metering starts only after the crop is confirmed."
        ],
        rule: "The image is the visual reference for every Spot Reading in the current sketch."
      },
      {
        visual: "metering",
        eyebrow: "2 · METERING",
        title: "Set Initial Metering",
        paragraphs: [
          "Choose the ISO and shutter speed used while taking the spot-meter readings.",
          "Every original Spot Reading is interpreted from this shared starting setup."
        ],
        rule: "Initial Metering should match the settings used while taking the readings."
      },
      {
        visual: "readings",
        eyebrow: "3 · RECORDING",
        title: "Add Spot Readings",
        paragraphs: [
          "Tap the image, then choose the aperture measured at that point. Markers can be collapsed, moved or deleted.",
          "Moving a marker changes its position—not its recorded measurement."
        ],
        rule: "Original Spot Reading values remain unchanged."
      },
      {
        visual: "calculation",
        eyebrow: "4 · CALCULATION",
        title: "Calculate the Exposure",
        paragraphs: [
          "Choose a Reference Spot Reading and assign its Zone. Then adjust ISO, shutter or aperture in S/A mode.",
          "Confirm Exposure copies the current recommendation to Actual Exposure."
        ],
        rule: "The Reference Spot Reading always remains in its selected Zone."
      },
      {
        visual: "actual",
        eyebrow: "5 · FINAL EXPOSURE",
        title: "Record the Actual Exposure",
        paragraphs: [
          "Calculated Exposure is the recommendation. Actual Exposure records the ISO, shutter and aperture that were really used.",
          "The two may differ; Actual Zones and Exposure Notes preserve the final decision."
        ],
        rule: "Actual Exposure is a record of what happened, not a replacement for the calculation."
      },
      {
        visual: "libraries",
        eyebrow: "6 · REUSE",
        title: "Reuse Gear with Libraries",
        paragraphs: [
          "Save frequently used cameras, lenses, films and meters to local libraries, then reuse them in later Spot Sketches.",
          "Save commits Gear edits; Cancel discards them. Deleting a library preset does not erase Gear already saved in a project."
        ],
        rule: "Libraries live on this device; selected Gear values are saved with the project."
      },
      {
        visual: "notes",
        eyebrow: "7 · DOCUMENTATION",
        title: "Add Documentation Notes",
        paragraphs: [
          "Exposure Notes explain the final exposure. Document Notes describe the photograph, scene or intention. Development Notes record processing and darkroom decisions.",
          "Gear Notes stay with the corresponding camera, lens, film or meter information."
        ],
        rule: "Notes are saved with the current Spot Sketch and can be included in its export."
      },
      {
        visual: "projects",
        eyebrow: "8 · PROJECTS",
        title: "Organize and Save Projects",
        paragraphs: [
          "One project can contain several Spot Sketches. Use Project Manager to open, reorder or remove them.",
          "Save Project creates a .spotsketch file. Merge Project adds Spot Sketches from another project to the current one."
        ],
        rule: "The .spotsketch file is the editable project record; an export is not a project backup."
      },
      {
        visual: "export",
        eyebrow: "9 · OUTPUT",
        title: "Export Your Record",
        paragraphs: [
          "On mobile, review Actual Exposure and Notes, then Save or Export PNG. The native share options depend on the device.",
          "Desktop also provides Quick Export and fixed A4 document options."
        ],
        rule: "Export creates a document or image but never changes or replaces the editable project."
      }
    ],
    hu: [
      {
        visual: "welcome",
        eyebrow: "MOBIL ÚTMUTATÓ",
        title: "Üdvözöl a Spot Sketch",
        paragraphs: [
          "A Spot Sketch egy szerkeszthető projektben kapcsolja össze a referenciafotót, a spotméréseket, az expozíciószámítást és a fotográfiai jegyzeteket.",
          "Ez a rövid útmutató bemutatja a teljes mobil munkafolyamatot."
        ],
        rule: "Az útmutató később újra megnyitható a kezdőképernyőről vagy az Add menüből."
      },
      {
        visual: "image",
        eyebrow: "1 · REFERENCIA",
        title: "Kép hozzáadása",
        paragraphs: [
          "Tölts be egy referenciafotót, válaszd ki a képarányt és a kivágást, majd adj meg egy Image Identifiert.",
          "Az Initial Metering csak a kivágás jóváhagyása után indul el."
        ],
        rule: "A kép az aktuális Spot Sketch minden mérési pontjának vizuális referenciája."
      },
      {
        visual: "metering",
        eyebrow: "2 · FÉNYMÉRÉS",
        title: "Initial Metering beállítása",
        paragraphs: [
          "Válaszd ki a spotmérések készítésekor használt ISO-t és záridőt.",
          "Minden eredeti Spot Reading ezt a közös kiinduló beállítást használja."
        ],
        rule: "Az Initial Metering egyezzen a mérések készítésekor használt beállításokkal."
      },
      {
        visual: "readings",
        eyebrow: "3 · RÖGZÍTÉS",
        title: "Spot Readingek hozzáadása",
        paragraphs: [
          "Érintsd meg a képet, majd válaszd ki az adott ponton mért rekeszértéket. A markerek összecsukhatók, mozgathatók és törölhetők.",
          "A marker mozgatása csak a helyét változtatja meg, a rögzített mérést nem."
        ],
        rule: "Az eredeti Spot Reading értékek a használat során változatlanok maradnak."
      },
      {
        visual: "calculation",
        eyebrow: "4 · SZÁMÍTÁS",
        title: "Expozíció számítása",
        paragraphs: [
          "Válassz Reference Spot Readinget, és rendelj hozzá egy Zone értéket. Ezután S/A módban módosíthatod az ISO-t, záridőt vagy rekeszt.",
          "A Confirm Exposure az aktuális ajánlást az Actual Exposure mezőibe másolja."
        ],
        rule: "A Reference Spot Reading mindig a kiválasztott Zone-ban marad."
      },
      {
        visual: "actual",
        eyebrow: "5 · VÉGLEGES EXPOZÍCIÓ",
        title: "Actual Exposure rögzítése",
        paragraphs: [
          "A Calculated Exposure az ajánlás. Az Actual Exposure azt az ISO-, záridő- és rekeszértéket rögzíti, amelyet ténylegesen használtál.",
          "A kettő eltérhet; az Actual Zones és az Exposure Notes megőrzi a végső döntést."
        ],
        rule: "Az Actual Exposure a megtörtént expozíció dokumentációja, nem a számítás helyettesítője."
      },
      {
        visual: "libraries",
        eyebrow: "6 · ÚJRAFELHASZNÁLÁS",
        title: "Gear Library használata",
        paragraphs: [
          "Mentsd el a gyakran használt kamerákat, objektíveket, filmeket és fénymérőket a helyi librarykbe, majd használd őket újra későbbi Spot Sketchekben.",
          "A Save rögzíti, a Cancel eldobja a Gear módosításait. Egy library preset törlése nem törli a projektbe korábban mentett Gear adatokat."
        ],
        rule: "A libraryk ezen az eszközön élnek; a kiválasztott Gear értékek a projektbe is bekerülnek."
      },
      {
        visual: "notes",
        eyebrow: "7 · DOKUMENTÁCIÓ",
        title: "Dokumentációs jegyzetek",
        paragraphs: [
          "Az Exposure Notes a végleges expozíciót magyarázza. A Document Notes a képet, a jelenetet vagy a szándékot írja le. A Development Notes a kidolgozási és sötétkamrai döntéseket rögzíti.",
          "A Gear Notes az adott kamera-, objektív-, film- vagy fénymérőadatokhoz tartozik."
        ],
        rule: "A jegyzetek az aktuális Spot Sketch-csel mentődnek, és az exportba is bekerülhetnek."
      },
      {
        visual: "projects",
        eyebrow: "8 · PROJEKTEK",
        title: "Projektek rendezése és mentése",
        paragraphs: [
          "Egy projekt több Spot Sketchet tartalmazhat. A Project Managerben megnyithatod, átrendezheted vagy eltávolíthatod őket.",
          "A Save Project .spotsketch fájlt készít. A Merge Project egy másik projekt Spot Sketch-eit hozzáadja az aktuálishoz."
        ],
        rule: "A .spotsketch fájl a szerkeszthető projekt; az export nem helyettesíti a projektmentést."
      },
      {
        visual: "export",
        eyebrow: "9 · KIMENET",
        title: "A dokumentáció exportálása",
        paragraphs: [
          "Mobilon ellenőrizd az Actual Exposure és Notes mezőket, majd használd a Save vagy Export PNG műveletet. A natív megosztási lehetőségek készülékfüggők.",
          "Desktopon Quick Export és rögzített A4 dokumentum is készíthető."
        ],
        rule: "Az export dokumentumot vagy képet készít, de nem módosítja és nem helyettesíti a szerkeszthető projektet."
      }
    ]
  };

  const GUIDE_VISUALS = {
    welcome: `
      <div class="guide-flow" aria-hidden="true">
        <span>IMAGE</span><i>→</i><span>READINGS</span><i>→</i><span>EXPOSURE</span><i>→</i><span>RECORD</span>
      </div>`,
    image: `
      <div class="guide-crop-visual" aria-hidden="true">
        <div class="guide-crop-photo"></div>
        <span class="guide-crop-corner is-a"></span><span class="guide-crop-corner is-b"></span>
        <span class="guide-crop-corner is-c"></span><span class="guide-crop-corner is-d"></span>
        <div class="guide-ratio-row"><b>ORIGINAL</b><span>1:1</span><span>3:2</span></div>
      </div>`,
    metering: `
      <div class="guide-metering-visual" aria-hidden="true">
        <div><small>ISO</small><strong>100</strong></div>
        <span>+</span>
        <div><small>SHUTTER</small><strong>1/125</strong></div>
      </div>`,
    readings: `
      <div class="guide-reading-visual" aria-hidden="true">
        <div class="guide-reading-image"></div>
        <div class="guide-reading-bubble"><small>#1</small><strong><i>f</i>8</strong></div>
        <span class="guide-reading-marker"></span>
      </div>`,
    calculation: `
      <div class="guide-calculation-visual" aria-hidden="true">
        <div class="guide-reference-chip"><small>REFERENCE</small><strong>#1 · ZONE IV</strong></div>
        <div class="guide-sa-switch"><b>S</b><span><i></i></span><b>A</b></div>
        <div class="guide-exposure-row"><span>ISO 100</span><span>1/125</span><span><i>f</i>8</span></div>
      </div>`,
    actual: `
      <div class="guide-actual-visual" aria-hidden="true">
        <div><small>CALCULATED</small><strong>100 · 1/125 · <i>f</i>8</strong></div>
        <span>↓</span>
        <div class="is-actual"><small>ACTUAL</small><strong>100 · 1/60 · <i>f</i>8</strong></div>
      </div>`,
    libraries: `
      <div class="guide-library-visual" aria-hidden="true">
        <div class="guide-library-card"><small>CAMERA</small><strong>Hasselblad 500 C/M</strong></div>
        <span>↓ SAVE TO LIBRARY ↓</span>
        <div class="guide-library-pills"><b>CAMERA</b><b>LENS</b><b>FILM</b><b>METER</b></div>
      </div>`,
    notes: `
      <div class="guide-notes-visual" aria-hidden="true">
        <div><b>EXPOSURE NOTES</b><span>Why this exposure was used</span></div>
        <div><b>DOCUMENT NOTES</b><span>Scene, intention and workflow</span></div>
        <div><b>DEVELOPMENT NOTES</b><span>Processing and darkroom decisions</span></div>
      </div>`,
    projects: `
      <div class="guide-project-visual" aria-hidden="true">
        <div class="guide-project-stack"><span>03</span><span>02</span><span>01</span></div>
        <div class="guide-project-file"><b>.spotsketch</b><small>COMPLETE EDITABLE PROJECT</small></div>
      </div>`,
    export: `
      <div class="guide-export-visual" aria-hidden="true">
        <div class="guide-export-sheet"><span></span><b>SPOT SKETCH</b><i></i><i></i><i></i></div>
        <div class="guide-export-actions"><b>SAVE</b><span>PNG</span><span>A4</span></div>
      </div>`
  };

  let initialized = false;
  let currentLanguage = "en";
  let currentSlideIndex = 0;
  let previousFocus = null;
  let autoTimer = null;
  let swipePointerId = null;
  let swipeStartX = 0;
  let swipeStartY = 0;

  const elements = {};

  function readPreference(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writePreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      /* The Guide still works when storage is unavailable. */
    }
  }

  function detectInitialLanguage() {
    const stored = readPreference(GUIDE_LANGUAGE_KEY);
    if (stored === "hu" || stored === "en") return stored;
    return String(navigator.language || "en").toLowerCase().startsWith("hu")
      ? "hu"
      : "en";
  }

  function isMobileGuideAvailable() {
    if (typeof globalThis.isMobileApplicationShellActive === "function") {
      return globalThis.isMobileApplicationShellActive();
    }

    return window.matchMedia("(max-width: 900px)").matches;
  }

  function isGuideOpen() {
    return Boolean(elements.overlay && !elements.overlay.hidden);
  }

  function hasSeenGuide() {
    return readPreference(GUIDE_SEEN_KEY) === "true";
  }

  function markGuideSeen() {
    writePreference(GUIDE_SEEN_KEY, "true");
  }

  function getSlides() {
    return GUIDE_SLIDES[currentLanguage];
  }

  function getUiCopy() {
    return GUIDE_COPY[currentLanguage];
  }

  function setLanguage(language) {
    if (language !== "hu" && language !== "en") return;

    currentLanguage = language;
    writePreference(GUIDE_LANGUAGE_KEY, language);
    renderGuide();
  }

  function renderProgress(total) {
    if (!elements.progressDots) return;

    elements.progressDots.replaceChildren();

    for (let index = 0; index < total; index += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "mobile-guide-progress-dot";
      dot.classList.toggle("is-active", index === currentSlideIndex);
      dot.setAttribute("aria-label", getUiCopy().slideLabel(index + 1, total));
      dot.setAttribute("aria-current", index === currentSlideIndex ? "step" : "false");
      dot.addEventListener("click", () => {
        const direction = index > currentSlideIndex ? "forward" : "backward";
        currentSlideIndex = index;
        renderGuide(direction);
      });
      elements.progressDots.append(dot);
    }
  }

  function restartSlideAnimation(direction = "forward") {
    if (!elements.slide) return;

    elements.slide.classList.remove("is-entering-forward", "is-entering-backward");
    void elements.slide.offsetWidth;
    elements.slide.classList.add(
      direction === "backward" ? "is-entering-backward" : "is-entering-forward"
    );
  }

  function renderGuide(direction = "forward") {
    if (!elements.overlay) return;

    const slides = getSlides();
    const ui = getUiCopy();
    const slide = slides[currentSlideIndex] || slides[0];
    const isFirst = currentSlideIndex === 0;
    const isLast = currentSlideIndex === slides.length - 1;

    elements.dialog.setAttribute("aria-label", ui.guideLabel);
    elements.dialog.setAttribute("lang", currentLanguage);
    elements.languageGroup.setAttribute("aria-label", ui.languageLabel);
    elements.closeButton.setAttribute("aria-label", ui.closeLabel);
    elements.closeButton.title = ui.closeLabel;

    for (const button of elements.languageButtons) {
      const active = button.dataset.guideLanguage === currentLanguage;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }

    elements.eyebrow.textContent = slide.eyebrow;
    elements.title.textContent = slide.title;
    elements.copy.replaceChildren();

    for (const paragraph of slide.paragraphs) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      elements.copy.append(p);
    }

    elements.rule.textContent = slide.rule;
    elements.visual.innerHTML = GUIDE_VISUALS[slide.visual] || "";

    elements.counter.textContent = ui.slideLabel(currentSlideIndex + 1, slides.length);
    elements.skipButton.textContent = ui.skip;
    elements.backButton.textContent = ui.back;
    elements.nextButton.textContent = isLast ? ui.finish : ui.next;
    elements.backButton.disabled = isFirst;
    elements.nextButton.classList.toggle("is-finish", isLast);

    renderProgress(slides.length);
    restartSlideAnimation(direction);
  }

  function goToSlide(index, direction) {
    const slides = getSlides();
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
    if (nextIndex === currentSlideIndex) return;

    const resolvedDirection = direction || (nextIndex > currentSlideIndex ? "forward" : "backward");
    currentSlideIndex = nextIndex;
    renderGuide(resolvedDirection);
  }

  function goNext() {
    const slides = getSlides();

    if (currentSlideIndex >= slides.length - 1) {
      closeGuide({ markSeen: true });
      return;
    }

    goToSlide(currentSlideIndex + 1, "forward");
  }

  function goBack() {
    goToSlide(currentSlideIndex - 1, "backward");
  }

  function setBackgroundInert(inert) {
    const app = document.getElementById("app");
    if (!app) return;

    if (inert) {
      app.inert = true;
      app.setAttribute("aria-hidden", "true");
    } else {
      app.inert = false;
      app.removeAttribute("aria-hidden");
    }
  }

  function openGuide(options = {}) {
    if (!initialized || !elements.overlay || !isMobileGuideAvailable()) return false;
    if (isGuideOpen()) return true;

    if (typeof globalThis.isDialogOpen === "function" && globalThis.isDialogOpen()) {
      return false;
    }

    if (typeof globalThis.hidePicker === "function") globalThis.hidePicker();
    if (typeof globalThis.closeHeaderMenus === "function") globalThis.closeHeaderMenus();

    currentLanguage = detectInitialLanguage();
    currentSlideIndex = 0;
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    renderGuide("forward");
    elements.overlay.hidden = false;
    document.body.classList.add("guide-open");
    setBackgroundInert(true);

    window.requestAnimationFrame(() => {
      elements.closeButton.focus({ preventScroll: true });
    });

    return true;
  }

  function closeGuide(options = {}) {
    if (!isGuideOpen()) return;

    if (options.markSeen) markGuideSeen();

    elements.overlay.hidden = true;
    document.body.classList.remove("guide-open");
    setBackgroundInert(false);

    if (
      previousFocus &&
      previousFocus.isConnected &&
      previousFocus.getClientRects().length > 0
    ) {
      previousFocus.focus({ preventScroll: true });
    } else {
      const fallbackFocus =
        document.getElementById("mobileAddAction") ||
        document.getElementById("welcomeGuideBtn") ||
        document.getElementById("addBtn");

      fallbackFocus?.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  function getFocusableElements() {
    if (!elements.overlay) return [];

    return Array.from(
      elements.overlay.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    ).filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function handleGuideKeydown(event) {
    if (!isGuideOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGuide();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = getFocusableElements();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePointerDown(event) {
    if (!isGuideOpen() || event.pointerType === "mouse") return;
    if (event.target.closest("button, input, select, textarea, a")) return;

    swipePointerId = event.pointerId;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
  }

  function handlePointerUp(event) {
    if (event.pointerId !== swipePointerId) return;

    const deltaX = event.clientX - swipeStartX;
    const deltaY = event.clientY - swipeStartY;
    swipePointerId = null;

    if (
      Math.abs(deltaX) < GUIDE_SWIPE_THRESHOLD ||
      Math.abs(deltaX) <= Math.abs(deltaY) * 1.2
    ) {
      return;
    }

    if (deltaX < 0) goNext();
    else goBack();
  }

  function scheduleAutomaticGuide() {
    window.clearTimeout(autoTimer);

    autoTimer = window.setTimeout(() => {
      if (hasSeenGuide() || !isMobileGuideAvailable()) return;
      if (document.visibilityState !== "visible") return;
      if (globalThis.state?.imageCanvas) return;

      const welcome = document.getElementById("welcome");
      if (!welcome || window.getComputedStyle(welcome).display === "none") return;

      openGuide({ automatic: true });
    }, GUIDE_AUTO_DELAY_MS);
  }

  function bindGuideTriggers() {
    document.querySelectorAll("[data-open-mobile-guide]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openGuide({ manual: true });
      });
    });
  }

  function cacheElements() {
    elements.overlay = document.getElementById("mobileGuideOverlay");
    elements.dialog = document.getElementById("mobileGuideDialog");
    elements.languageGroup = document.getElementById("mobileGuideLanguage");
    elements.languageButtons = Array.from(
      document.querySelectorAll("[data-guide-language]")
    );
    elements.closeButton = document.getElementById("mobileGuideCloseBtn");
    elements.slide = document.getElementById("mobileGuideSlide");
    elements.visual = document.getElementById("mobileGuideVisual");
    elements.eyebrow = document.getElementById("mobileGuideEyebrow");
    elements.title = document.getElementById("mobileGuideTitle");
    elements.copy = document.getElementById("mobileGuideCopy");
    elements.rule = document.getElementById("mobileGuideRule");
    elements.counter = document.getElementById("mobileGuideCounter");
    elements.progressDots = document.getElementById("mobileGuideProgressDots");
    elements.skipButton = document.getElementById("mobileGuideSkipBtn");
    elements.backButton = document.getElementById("mobileGuideBackBtn");
    elements.nextButton = document.getElementById("mobileGuideNextBtn");
  }

  function initializeMobileGuide() {
    if (initialized) return;
    initialized = true;

    cacheElements();
    if (!elements.overlay || !elements.dialog) return;

    currentLanguage = detectInitialLanguage();
    bindGuideTriggers();

    elements.languageButtons.forEach(button => {
      button.addEventListener("click", () => {
        setLanguage(button.dataset.guideLanguage);
      });
    });

    elements.closeButton.addEventListener("click", () => closeGuide());
    elements.skipButton.addEventListener("click", () => closeGuide({ markSeen: true }));
    elements.backButton.addEventListener("click", goBack);
    elements.nextButton.addEventListener("click", goNext);

    elements.dialog.addEventListener("pointerdown", handlePointerDown);
    elements.dialog.addEventListener("pointerup", handlePointerUp);
    elements.dialog.addEventListener("pointercancel", () => {
      swipePointerId = null;
    });

    document.addEventListener("keydown", handleGuideKeydown, true);

    window.addEventListener("spot-sketch:viewport-change", () => {
      if (isGuideOpen() && !isMobileGuideAvailable()) closeGuide();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !isGuideOpen() && !hasSeenGuide()) {
        scheduleAutomaticGuide();
      }
    });

    scheduleAutomaticGuide();
  }

  globalThis.initializeMobileGuide = initializeMobileGuide;
  globalThis.openSpotSketchGuide = openGuide;
  globalThis.closeSpotSketchGuide = closeGuide;
  globalThis.isSpotSketchGuideOpen = isGuideOpen;
})();
