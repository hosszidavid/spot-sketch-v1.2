"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Notifications 2.0

Purpose:
Provides stacked, typed, non-blocking application notifications and
central explanations for temporarily unavailable controls.
==========================================================
*/

const DEFAULT_NOTIFICATION_DURATION = 5600;
const NOTIFICATION_EXIT_DURATION = 220;
const MAX_VISIBLE_NOTIFICATIONS = 4;

const UNAVAILABLE_REASONS = Object.freeze({
  calculationNeedsReading: {
    title: "Calculation is not ready",
    message: "Record at least one Spot Reading before starting Calculation."
  },
  calculationRecordingAction: {
    title: "Recording action is unavailable",
    message: "Exit Calculation Mode to move or delete Spot Readings."
  },
  referenceZoneOnly: {
    title: "Zone belongs to the Reference",
    message: "Use this Spot Reading as the Reference before changing its Zone."
  },
  currentReference: {
    title: "Current Reference",
    message: "This Spot Reading is already the Calculation Reference."
  },
  lastProjectSketch: {
    title: "Spot Sketch cannot be deleted",
    message: "A Project must contain at least one Spot Sketch."
  },
  generic: {
    title: "This action is unavailable",
    message: "The action cannot be used in the current workflow state."
  }
});

let notificationSequence = 0;

function captureNotificationPositions(stack) {
  return new Map(
    [...stack.children].map(item => [item, item.getBoundingClientRect().top])
  );
}

function animateNotificationReflow(previousPositions) {
  for (const [item, previousTop] of previousPositions) {
    if (!item.isConnected) continue;
    const nextTop = item.getBoundingClientRect().top;
    const delta = previousTop - nextTop;
    if (Math.abs(delta) < 1) continue;

    item.animate(
      [
        { transform: `translateY(${delta}px) scale(1)` },
        { transform: "translateY(0) scale(1)" }
      ],
      {
        duration: 240,
        easing: "cubic-bezier(.2,.8,.2,1)"
      }
    );
  }
}

function notificationIcon(type) {
  if (type === "success") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`;
  if (type === "error") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`;
  if (type === "warning") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16.5h.01"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></svg>`;
}

function normalizeNotificationArguments(titleOrOptions, message, duration) {
  if (titleOrOptions && typeof titleOrOptions === "object") {
    return {
      type: titleOrOptions.type || "info",
      title: titleOrOptions.title || "",
      message: titleOrOptions.message || "",
      duration: titleOrOptions.duration ?? DEFAULT_NOTIFICATION_DURATION
    };
  }

  return {
    type: "info",
    title: titleOrOptions || "",
    message: message || "",
    duration: duration ?? DEFAULT_NOTIFICATION_DURATION
  };
}

function showAppNotification(titleOrOptions, message, duration) {
  const stack = document.getElementById("appNotificationStack");
  if (!stack) return null;

  const options = normalizeNotificationArguments(titleOrOptions, message, duration);
  const item = document.createElement("article");
  const id = `notification-${++notificationSequence}`;

  item.id = id;
  item.className = `app-notification app-notification-${options.type}`;
  item.setAttribute("role", options.type === "error" ? "alert" : "status");
  item.innerHTML = `
    <span class="app-notification-icon">${notificationIcon(options.type)}</span>
    <span class="app-notification-copy">
      <strong class="app-notification-title"></strong>
      <span class="app-notification-message"></span>
    </span>
    <button class="app-notification-close" type="button" aria-label="Dismiss notification">×</button>
  `;

  item.querySelector(".app-notification-title").textContent = options.title;
  item.querySelector(".app-notification-message").textContent = options.message;
  const previousPositions = captureNotificationPositions(stack);
  stack.appendChild(item);
  requestAnimationFrame(() => animateNotificationReflow(previousPositions));

  const closeButton = item.querySelector(".app-notification-close");
  closeButton.addEventListener("click", () => dismissNotification(item));

  item.addEventListener("mouseenter", () => {
    window.clearTimeout(item._notificationTimer);
  });

  item.addEventListener("mouseleave", () => {
    if (options.duration > 0 && item.isConnected) {
      item._notificationTimer = window.setTimeout(
        () => dismissNotification(item),
        Math.min(options.duration, 2400)
      );
    }
  });

  requestAnimationFrame(() => item.classList.add("is-visible"));

  while (stack.children.length > MAX_VISIBLE_NOTIFICATIONS) {
    dismissNotification(stack.firstElementChild, true);
  }

  if (options.duration > 0) {
    item._notificationTimer = window.setTimeout(
      () => dismissNotification(item),
      options.duration
    );
  }

  return id;
}

function dismissNotification(item, immediate = false) {
  if (!item || !item.isConnected) return;
  window.clearTimeout(item._notificationTimer);
  const stack = item.parentElement;
  const previousPositions = stack ? captureNotificationPositions(stack) : new Map();

  const remove = () => {
    if (!item.isConnected) return;
    item.remove();
    if (stack) requestAnimationFrame(() => animateNotificationReflow(previousPositions));
  };

  if (immediate) {
    remove();
    return;
  }

  item.classList.remove("is-visible");
  item.classList.add("is-leaving");
  window.setTimeout(remove, NOTIFICATION_EXIT_DURATION);
}

function hideAppNotification() {
  const stack = document.getElementById("appNotificationStack");
  if (!stack) return;
  [...stack.children].forEach(item => dismissNotification(item));
}

function showUnavailableFeatureReason(reasonKey = "generic", custom = null) {
  const reason = custom || UNAVAILABLE_REASONS[reasonKey] || UNAVAILABLE_REASONS.generic;
  showAppNotification({
    type: "info",
    title: reason.title,
    message: reason.message
  });
}

function initializeUnavailableInteractions() {
  document.addEventListener("click", event => {
    const target = event.target.closest(
      '[data-unavailable-reason], [aria-disabled="true"], .unavailable, .is-unavailable'
    );
    if (!target) return;

    /*
      Some active Calculation menu items retain a reason key so the same
      markup can explain their disabled state later. The reason metadata alone
      must not turn a usable action into an unavailable one.
    */
    const unavailable =
      target.getAttribute("aria-disabled") === "true" ||
      target.classList.contains("unavailable") ||
      target.classList.contains("is-unavailable");

    if (!unavailable) return;

    event.preventDefault();
    event.stopPropagation();

    const reasonKey = target.dataset.unavailableReason || "generic";
    showUnavailableFeatureReason(reasonKey);
  }, true);
}
