"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Document Layout

Purpose:
Defines fixed A4 page geometry and density thresholds for the one-page
per Spot Sketch document. It contains sizing decisions only.
==========================================================
*/

const SPOT_SKETCH_DOCUMENT_LAYOUT = Object.freeze({
  page: {
    portrait: {
      width: 794,
      height: 1123
    },
    landscape: {
      width: 1123,
      height: 794
    },
    padding: 28,
    gap: 14
  },

  singlePage: {
    density: {
      portrait: {
        compactReadings: 6,
        denseReadings: 11,
        compactNotes: 520,
        denseNotes: 1250,
        compactGear: 620,
        denseGear: 1250
      },
      landscape: {
        compactReadings: 8,
        denseReadings: 15,
        compactNotes: 700,
        denseNotes: 1550,
        compactGear: 780,
        denseGear: 1500
      }
    }
  }
});
