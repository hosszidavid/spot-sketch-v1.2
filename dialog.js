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
function showDialog(options = {}) {
  const overlay = document.getElementById("dialogOverlay");
  const title = document.getElementById("dialogTitle");
  const message = document.getElementById("dialogMessage");
  const cancelButton = document.getElementById("dialogCancelBtn");
  const okButton = document.getElementById("dialogOkBtn");

  if (!overlay || !title || !message || !cancelButton || !okButton) return;

  /*
  ────────────────────────────────────────
  Dialog Content
  ────────────────────────────────────────
  */

  title.textContent = options.title ?? "";
  message.textContent = options.message ?? "";

  /*
  ────────────────────────────────────────
  Button Labels
  ────────────────────────────────────────
  */

  cancelButton.textContent = options.cancelText ?? "Cancel";
  okButton.textContent = options.okText ?? "OK";

  /*
  ────────────────────────────────────────
  Cancel Button

  Visible by default.

  Set:
    showCancel: false

  for simple information dialogs.
  ────────────────────────────────────────
  */

  cancelButton.hidden = options.showCancel === false;

  /*
  ────────────────────────────────────────
  Confirm Button Style

  Supported styles:

  - default
  - danger
  - success
  ────────────────────────────────────────
  */

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

  /*
  ────────────────────────────────────────
  Callbacks
  ────────────────────────────────────────
  */

  dialogConfirmCallback = options.onConfirm ?? null;
  dialogCancelCallback = options.onCancel ?? null;

  /*
  ────────────────────────────────────────
  Show Dialog
  ────────────────────────────────────────
  */

  overlay.hidden = false;
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

  if (overlay) {
    overlay.hidden = true;
  }

  dialogConfirmCallback = null;
  dialogCancelCallback = null;
}


/*
────────────────────────────────────────────
4. Dialog Button Binding
────────────────────────────────────────────
*/

/*
  Cancel closes the dialog first, then runs the optional cancel callback.
*/
document
  .getElementById("dialogCancelBtn")
  .addEventListener("click", () => {
    const callback = dialogCancelCallback;

    closeDialog();

    if (callback) {
      callback();
    }
  });


/*
  OK closes the dialog first, then runs the optional confirm callback.
*/
document
  .getElementById("dialogOkBtn")
  .addEventListener("click", () => {
    const callback = dialogConfirmCallback;

    closeDialog();

    if (callback) {
      callback();
    }
  });