"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Dialog

Purpose:
Provides the reusable modal confirmation dialog.

Table of Contents:
1. Dialog State
2. Public Dialog API
3. Dialog Closing
4. Dialog Button Binding

Owns:
- modal confirmation dialog behavior
- OK / Cancel button callbacks
- dialog danger styling
- modal overlay visibility

Does NOT own:
- notifications
- project logic
- storage
- form validation
- browser alert behavior

Dependencies:
- index.html
==========================================================
*/


/*
────────────────────────────────────────────
1. Dialog State
────────────────────────────────────────────
*/

/*
  Stored callbacks for the currently open dialog.

  They are cleared every time the dialog closes to avoid accidentally
  reusing an old action.
*/
let dialogConfirmCallback = null;
let dialogCancelCallback = null;
let dialogActionInProgress = false;


/*
────────────────────────────────────────────
2. Public Dialog API
────────────────────────────────────────────
*/

/*
  Opens the reusable modal dialog.

  Supported options:
  - title
  - message
  - okText
  - cancelText
  - showCancel
  - danger
  - success
  - onConfirm
  - onCancel
*/
function isDialogOpen() {
  const overlay = document.getElementById("dialogOverlay");
  return Boolean(overlay && !overlay.hidden);
}


function showDialog(options = {}) {
  const overlay = document.getElementById("dialogOverlay");
  const title = document.getElementById("dialogTitle");
  const message = document.getElementById("dialogMessage");
  const cancelButton = document.getElementById("dialogCancelBtn");
  const okButton = document.getElementById("dialogOkBtn");

  if (!overlay || !title || !message || !cancelButton || !okButton) {
    return false;
  }

  /*
    The reusable dialog is intentionally single-instance. Refusing a second
    open request protects the active callbacks from being overwritten by an
    underlying surface guard or a duplicated destructive action.
  */
  if (isDialogOpen() || dialogActionInProgress) {
    return false;
  }

  title.textContent = options.title ?? "";
  message.textContent = options.message ?? "";

  cancelButton.textContent = options.cancelText ?? "Cancel";
  okButton.textContent = options.okText ?? "OK";
  cancelButton.hidden = options.showCancel === false;

  okButton.classList.remove(
    "dialog-button-danger",
    "dialog-button-success"
  );

  if (options.danger) {
    okButton.classList.add("dialog-button-danger");
  }

  if (options.success) {
    okButton.classList.add("dialog-button-success");
  }

  cancelButton.disabled = false;
  okButton.disabled = false;
  dialogActionInProgress = false;
  dialogConfirmCallback = options.onConfirm ?? null;
  dialogCancelCallback = options.onCancel ?? null;

  overlay.hidden = false;
  overlay.dataset.dialogOpen = "true";
  return true;
}


/*
────────────────────────────────────────────
3. Dialog Closing
────────────────────────────────────────────
*/

/*
  Closes the current dialog and clears stored callbacks.
*/
function closeDialog() {
  const overlay = document.getElementById("dialogOverlay");
  const cancelButton = document.getElementById("dialogCancelBtn");
  const okButton = document.getElementById("dialogOkBtn");

  if (overlay) {
    overlay.hidden = true;
    delete overlay.dataset.dialogOpen;
  }

  if (cancelButton) cancelButton.disabled = false;
  if (okButton) okButton.disabled = false;

  dialogConfirmCallback = null;
  dialogCancelCallback = null;
  dialogActionInProgress = false;
}


function resolveDialog(action) {
  if (!isDialogOpen() || dialogActionInProgress) return false;

  dialogActionInProgress = true;

  const cancelButton = document.getElementById("dialogCancelBtn");
  const okButton = document.getElementById("dialogOkBtn");
  if (cancelButton) cancelButton.disabled = true;
  if (okButton) okButton.disabled = true;

  const callback = action === "confirm"
    ? dialogConfirmCallback
    : dialogCancelCallback;

  closeDialog();

  if (typeof callback === "function") {
    callback();
  }

  return true;
}


function cancelDialog() {
  return resolveDialog("cancel");
}


function confirmDialog() {
  return resolveDialog("confirm");
}


/*
────────────────────────────────────────────
4. Dialog Button Binding
────────────────────────────────────────────
*/

const dialogOverlayElement = document.getElementById("dialogOverlay");
const dialogCancelButtonElement = document.getElementById("dialogCancelBtn");
const dialogOkButtonElement = document.getElementById("dialogOkBtn");

/*
  Keep modal pointer events inside the dialog layer. This is deliberately
  separate from the transient-surface guard so modal priority remains stable
  even if more surfaces are added later.
*/
dialogOverlayElement?.addEventListener("pointerdown", event => {
  event.stopPropagation();
});

dialogOverlayElement?.addEventListener("click", event => {
  event.stopPropagation();
});

dialogCancelButtonElement?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  cancelDialog();
});

dialogOkButtonElement?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  confirmDialog();
});
