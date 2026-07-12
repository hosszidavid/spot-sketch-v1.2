"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Exposure

Purpose:
Defines exposure value tables and recording / Actual Exposure calculations.

Table of Contents:
1. Exposure Constants
2. Zone Constants
3. Shared Exposure Helpers
4. Calculated Exposure
5. Recording Display Values
6. ISO Step Calculation
7. Dynamic Range
8. Formatting Helpers

Owns:
- ISO values
- shutter values
- aperture values
- full-stop exposure markers
- zone values
- Recording Mode display values
- Actual Zone calculations
- dynamic range calculation
- exposure label formatting

Does NOT own:
- picker UI
- marker creation
- marker rendering
- header UI
- project metadata
- warning limit UI

Dependencies:
- data.js
==========================================================
*/


/*
────────────────────────────────────────────
1. Exposure Constants
────────────────────────────────────────────
*/

/*
  Maximum working image size used when resizing loaded images.
*/
const MAX_IMAGE_SIZE = 1500;


/*
  ISO values shown in the ISO picker.
*/
const ISO_VALUES = [
  12,
  25,
  50,
  100,
  200,
  400,
  800,
  1600,
  3200,
  6400,
  12800
];


/*
  Shutter values in third-stop order.

  B and 0 are boundary values used for warning / out-of-range display.
*/
const SHUTTER_VALUES = [
  "B",

  "30s", "25s", "20s", "15s", "13s", "10s", "8s", "6s", "5s",
  "4s", "3.2s", "2.5s", "2s", "1.6s", "1.3s", "1s",

  "0.8s", "0.6s", "0.5s", "0.4s", "1/3", "1/4", "1/5", "1/6",
  "1/8", "1/10", "1/13", "1/15", "1/20", "1/25", "1/30",
  "1/40", "1/50", "1/60", "1/80", "1/100", "1/125",

  "1/160", "1/200", "1/250", "1/320", "1/400", "1/500",
  "1/640", "1/800", "1/1000",

  "0"
];


/*
  Aperture values in third-stop order.

  0.0 and F are boundary values used for warning / out-of-range display.
*/
const APERTURES = [
  "0.0",

  "0.7", "0.8", "0.9", "1", "1.1", "1.2", "1.4", "1.6",
  "1.8", "2", "2.2", "2.5", "2.8", "3.2", "3.5", "4",
  "4.5", "5", "5.6", "6.3", "7.1", "8", "9", "10",

  "11", "13", "14", "16", "18", "20", "22", "25", "29",
  "32", "36", "40", "45", "51", "57", "64", "72", "80",
  "90", "102", "114", "128", "144", "161", "180", "204",
  "228", "256",

  "F"
];


/*
  Values visually emphasized in aperture pickers.
*/
const FULL_STOP_APERTURES = new Set([
  "1",
  "1.4",
  "2",
  "2.8",
  "4",
  "5.6",
  "8",
  "11",
  "16",
  "22",
  "32",
  "45",
  "64",
  "90",
  "128",
  "180",
  "256"
]);


/*
  Values visually emphasized in shutter pickers.
*/
const FULL_STOP_SHUTTERS = new Set([
  "30s",
  "15s",
  "8s",
  "4s",
  "2s",
  "1s",
  "0.5s",
  "1/4",
  "1/8",
  "1/15",
  "1/30",
  "1/60",
  "1/125",
  "1/250",
  "1/500",
  "1/1000"
]);


/*
────────────────────────────────────────────
2. Zone Constants
────────────────────────────────────────────
*/

/*
  Zone System labels and their EV offsets from Zone V.
*/
const ZONES = [
  { label: "0", ev: -5 },
  { label: "I", ev: -4 },
  { label: "II", ev: -3 },
  { label: "III", ev: -2 },
  { label: "IV", ev: -1 },
  { label: "V", ev: 0 },
  { label: "VI", ev: 1 },
  { label: "VII", ev: 2 },
  { label: "VIII", ev: 3 },
  { label: "IX", ev: 4 },
  { label: "X", ev: 5 }
];

/*
────────────────────────────────────────────
3. Shared Exposure Helpers
────────────────────────────────────────────
*/

/*
  Returns the original measured aperture stored by a Spot Reading.
*/
function getMarkerMeasuredAperture(marker) {
  if (!marker || !marker.measurement) return null;

  return marker.measurement.aperture || null;
}


/*
  Returns the nearest standard Zone System label for an EV offset.
*/
function getNearestZoneLabel(ev) {
  const nearestZone = ZONES.reduce((nearest, zone) => {
    const nearestDistance = Math.abs(nearest.ev - ev);
    const currentDistance = Math.abs(zone.ev - ev);

    return currentDistance < nearestDistance
      ? zone
      : nearest;
  }, ZONES[0]);

  return nearestZone.label;
}


/*
  Returns the zone currently displayed for a Spot Reading.

  Recording and Calculation Setup display the neutral source reading as
  Zone V. Active Calculation Mode derives the zone from the immutable
  Spot Reading measurement and the current Calculated Exposure.
*/
function getSpotReadingDisplayedZone(marker) {
  if (!marker) {
    return {
      label: "V",
      ev: 0
    };
  }

  if (
    isWorkflowPhase(WORKFLOW_PHASES.CALCULATION) &&
    state.calculation.exposure
  ) {
    return calculateSpotReadingZone(
      marker,
      state.calculation.exposure
    ) || {
      label: "V",
      ev: 0
    };
  }

  return {
    label: "V",
    ev: 0
  };
}


/*
  Converts an exposure difference in third-stop steps into EV.
*/
function thirdStopStepsToEv(steps) {
  return Math.round(steps) / 3;
}


/*
  Returns the shutter difference between two settings in third-stop steps.

  A positive result means the second shutter gives more exposure.
*/
function getShutterDifferenceSteps(fromShutter, toShutter) {
  const fromIndex = SHUTTER_VALUES.indexOf(fromShutter);
  const toIndex = SHUTTER_VALUES.indexOf(toShutter);

  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }

  return fromIndex - toIndex;
}


/*
  Returns the aperture difference between two settings in third-stop steps.

  A positive result means the second aperture gives more exposure.
*/
function getApertureDifferenceSteps(fromAperture, toAperture) {
  const fromIndex = APERTURES.indexOf(fromAperture);
  const toIndex = APERTURES.indexOf(toAperture);

  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }

  return fromIndex - toIndex;
}


/*
  Returns a display label for an Actual Zone EV value.
*/
function getActualZoneLabel(ev) {
  if (ev < ZONES[0].ev) {
    return "<0";
  }

  if (ev > ZONES[ZONES.length - 1].ev) {
    return ">X";
  }

  return getNearestZoneLabel(ev);
}


/*
  Calculates the Actual Zone of one Spot Reading from its original
  measurement and the recorded Actual Exposure.
*/
function getMarkerActualZone(marker) {
  if (
    !marker ||
    !marker.measurement ||
    !state.actualExposure ||
    state.actualExposure.status !== "exposed" ||
    !state.actualExposure.iso ||
    !state.actualExposure.shutter ||
    !state.actualExposure.aperture
  ) {
    return null;
  }

  const measuredIso = marker.measurement.iso;
  const measuredShutter = marker.measurement.shutter;
  const measuredAperture = getMarkerMeasuredAperture(marker);

  if (!measuredIso || !measuredShutter || !measuredAperture) {
    return null;
  }

  const isoDifferenceSteps = getIsoThirdStopDelta(
    measuredIso,
    state.actualExposure.iso
  );

  const shutterDifferenceSteps = getShutterDifferenceSteps(
    measuredShutter,
    state.actualExposure.shutter
  );

  const apertureDifferenceSteps = getApertureDifferenceSteps(
    measuredAperture,
    state.actualExposure.aperture
  );

  if (
    shutterDifferenceSteps === null ||
    apertureDifferenceSteps === null
  ) {
    return null;
  }

  const totalDifferenceSteps =
    isoDifferenceSteps +
    shutterDifferenceSteps +
    apertureDifferenceSteps;

  const zoneEv = thirdStopStepsToEv(totalDifferenceSteps);

  return {
    label: getActualZoneLabel(zoneEv),
    ev: zoneEv,
    totalDifferenceSteps,
    isoDifferenceSteps,
    shutterDifferenceSteps,
    apertureDifferenceSteps,
    isoDifferenceEv: thirdStopStepsToEv(isoDifferenceSteps),
    shutterDifferenceEv: thirdStopStepsToEv(shutterDifferenceSteps),
    apertureDifferenceEv: thirdStopStepsToEv(apertureDifferenceSteps),
    meteringExposure: {
      iso: measuredIso,
      shutter: measuredShutter,
      aperture: measuredAperture
    },
    actualExposure: {
      iso: state.actualExposure.iso,
      shutter: state.actualExposure.shutter,
      aperture: state.actualExposure.aperture
    }
  };
}


/*
  Returns Actual Zone calculation data for every valid Spot Reading.
*/
function getAllMarkerActualZones() {
  if (
    !state.actualExposure ||
    state.actualExposure.status !== "exposed"
  ) {
    return [];
  }

  return state.markers
    .map(marker => {
      const actualZone = getMarkerActualZone(marker);

      if (!actualZone) return null;

      return { marker, actualZone };
    })
    .filter(Boolean)
    .sort((a, b) => a.marker.number - b.marker.number);
}



/*
────────────────────────────────────────────
4. Calculated Exposure
────────────────────────────────────────────
*/

/*
  Returns the confirmed Calculation Reference Spot Reading.
*/
function getCalculationReferenceMarker() {
  return state.markers.find(
    marker =>
      marker.id ===
      state.calculation.referenceSpotReadingId
  ) || null;
}


/*
  Converts a table index into a valid aperture value, including boundary
  labels when the result falls outside the supported range.
*/
function getApertureAtIndex(index) {
  if (index <= 0) return "0.0";
  if (index >= APERTURES.length - 1) return "F";

  return APERTURES[Math.round(index)];
}


/*
  Converts a table index into a valid shutter value, including boundary
  labels when the result falls outside the supported range.
*/
function getShutterAtIndex(index) {
  if (index <= 0) return "B";
  if (index >= SHUTTER_VALUES.length - 1) return "0";

  return SHUTTER_VALUES[Math.round(index)];
}


/*
  Calculates the aperture required to keep the confirmed Reference Spot
  Reading on its selected Zone for a given ISO and shutter.
*/
function calculateApertureForReference(
  referenceMarker,
  referenceZone,
  iso,
  shutter
) {
  if (
    !referenceMarker ||
    !referenceZone ||
    !iso ||
    !shutter
  ) {
    return null;
  }

  const measuredAperture =
    getMarkerMeasuredAperture(referenceMarker);

  const measuredShutter =
    referenceMarker.measurement.shutter;

  const measuredApertureIndex =
    APERTURES.indexOf(measuredAperture);

  const measuredShutterIndex =
    SHUTTER_VALUES.indexOf(measuredShutter);

  const targetShutterIndex =
    SHUTTER_VALUES.indexOf(shutter);

  if (
    measuredApertureIndex < 0 ||
    measuredShutterIndex < 0 ||
    targetShutterIndex < 0
  ) {
    return null;
  }

  const isoSteps = getIsoThirdStopDelta(
    referenceMarker.measurement.iso,
    iso
  );

  const shutterSteps =
    measuredShutterIndex - targetShutterIndex;

  const zoneSteps = referenceZone.ev * 3;

  const apertureDifferenceSteps =
    zoneSteps - isoSteps - shutterSteps;

  const targetApertureIndex =
    measuredApertureIndex - apertureDifferenceSteps;

  return getApertureAtIndex(targetApertureIndex);
}


/*
  Calculates the shutter required to keep the confirmed Reference Spot
  Reading on its selected Zone for a given ISO and aperture.
*/
function calculateShutterForReference(
  referenceMarker,
  referenceZone,
  iso,
  aperture
) {
  if (
    !referenceMarker ||
    !referenceZone ||
    !iso ||
    !aperture
  ) {
    return null;
  }

  const measuredAperture =
    getMarkerMeasuredAperture(referenceMarker);

  const measuredShutter =
    referenceMarker.measurement.shutter;

  const measuredApertureIndex =
    APERTURES.indexOf(measuredAperture);

  const targetApertureIndex =
    APERTURES.indexOf(aperture);

  const measuredShutterIndex =
    SHUTTER_VALUES.indexOf(measuredShutter);

  if (
    measuredApertureIndex < 0 ||
    targetApertureIndex < 0 ||
    measuredShutterIndex < 0
  ) {
    return null;
  }

  const isoSteps = getIsoThirdStopDelta(
    referenceMarker.measurement.iso,
    iso
  );

  const apertureSteps =
    measuredApertureIndex - targetApertureIndex;

  const zoneSteps = referenceZone.ev * 3;

  const shutterDifferenceSteps =
    zoneSteps - isoSteps - apertureSteps;

  const targetShutterIndex =
    measuredShutterIndex - shutterDifferenceSteps;

  return getShutterAtIndex(targetShutterIndex);
}


/*
  Builds the first Calculated Exposure from the confirmed Reference and
  Zone. Calculation starts in S control mode and preserves the Initial ISO
  and shutter, calculating the required aperture.
*/
function createInitialCalculatedExposure() {
  const referenceMarker =
    getCalculationReferenceMarker();

  const referenceZone =
    state.calculation.referenceZone;

  if (
    !referenceMarker ||
    !referenceZone ||
    !hasInitialMeteringSetup()
  ) {
    return null;
  }

  const iso = state.initialMeteringSetup.iso;
  const shutter = state.initialMeteringSetup.shutter;

  const aperture = calculateApertureForReference(
    referenceMarker,
    referenceZone,
    iso,
    shutter
  );

  if (!aperture) return null;

  return {
    iso,
    shutter,
    aperture
  };
}


/*
  Recalculates the dependent exposure value after an editable value or
  the S/A control mode changes.
*/
function recalculateCalculatedExposure() {
  const referenceMarker =
    getCalculationReferenceMarker();

  const referenceZone =
    state.calculation.referenceZone;

  const exposure =
    state.calculation.exposure;

  if (
    !referenceMarker ||
    !referenceZone ||
    !exposure
  ) {
    return false;
  }

  if (state.calculation.controlMode === "shutter") {
    const aperture = calculateApertureForReference(
      referenceMarker,
      referenceZone,
      exposure.iso,
      exposure.shutter
    );

    if (!aperture) return false;

    exposure.aperture = aperture;
    return true;
  }

  const shutter = calculateShutterForReference(
    referenceMarker,
    referenceZone,
    exposure.iso,
    exposure.aperture
  );

  if (!shutter) return false;

  exposure.shutter = shutter;
  return true;
}


/*
  Calculates the Zone of one Spot Reading under an arbitrary exposure.
*/
function calculateSpotReadingZone(marker, exposure) {
  if (
    !marker ||
    !marker.measurement ||
    !exposure ||
    !exposure.iso ||
    !exposure.shutter ||
    !exposure.aperture
  ) {
    return null;
  }

  const isoDifferenceSteps = getIsoThirdStopDelta(
    marker.measurement.iso,
    exposure.iso
  );

  const shutterDifferenceSteps = getShutterDifferenceSteps(
    marker.measurement.shutter,
    exposure.shutter
  );

  const apertureDifferenceSteps = getApertureDifferenceSteps(
    marker.measurement.aperture,
    exposure.aperture
  );

  if (
    shutterDifferenceSteps === null ||
    apertureDifferenceSteps === null
  ) {
    return null;
  }

  const totalDifferenceSteps =
    isoDifferenceSteps +
    shutterDifferenceSteps +
    apertureDifferenceSteps;

  const zoneEv = thirdStopStepsToEv(
    totalDifferenceSteps
  );

  return {
    label: getActualZoneLabel(zoneEv),
    ev: zoneEv,
    totalDifferenceSteps
  };
}


/*
────────────────────────────────────────────
5. Recording Display Values
────────────────────────────────────────────
*/

/*
  Returns the value displayed in a Recording Mode Spot Reading bubble.

  The displayed value is always the immutable measured aperture. Future
  Calculated Exposure values will be rendered by the Calculation workflow
  instead of mutating the source measurement.
*/
function getDisplayedValue(marker) {
  return {
    type: "aperture",
    value: getMarkerMeasuredAperture(marker)
  };
}


/*
────────────────────────────────────────────
6. ISO Step Calculation
────────────────────────────────────────────
*/

/*
  Returns the ISO difference in third-stop steps.
*/
function getIsoThirdStopDelta(fromISO, toISO) {
  return Math.round(Math.log2(toISO / fromISO) * 3);
}


/*
────────────────────────────────────────────
7. Dynamic Range
────────────────────────────────────────────
*/

/*
  Calculates scene dynamic range from marker measurement spread.

  The result is measured in stops and rounded to one decimal place.
*/
function calculateDynamicRange() {
  if (state.markers.length < 2) return "--";

  const indexes = state.markers
    .map(marker =>
      APERTURES.indexOf(
        getMarkerMeasuredAperture(marker)
      )
    )
    .filter(index => index >= 0);

  if (indexes.length < 2) return "--";

  const range = Math.abs(Math.max(...indexes) - Math.min(...indexes)) / 3;

  return Math.round(range * 10) / 10;
}


/*
────────────────────────────────────────────
8. Formatting Helpers
────────────────────────────────────────────
*/

/*
  Formats EV values as signed mixed thirds instead of decimal values.

  Examples:
  0        → 0
  0.333    → +⅓
  -0.667   → −⅔
  1.667    → +1 ⅔
*/
function formatEV(value) {
  const roundedThirds = Math.round(Number(value) * 3);

  if (!Number.isFinite(roundedThirds) || roundedThirds === 0) {
    return "0";
  }

  const sign = roundedThirds > 0 ? "+" : "−";
  const absoluteThirds = Math.abs(roundedThirds);
  const whole = Math.floor(absoluteThirds / 3);
  const remainder = absoluteThirds % 3;
  const fraction = remainder === 1
    ? "⅓"
    : remainder === 2
      ? "⅔"
      : "";

  const magnitude = whole && fraction
    ? `${whole} ${fraction}`
    : whole
      ? `${whole}`
      : fraction;

  return `${sign}${magnitude}`;
}

/*
  Formats an EV value with third-stop friendly fractions.

  Examples:
  0       → 0 EV
  0.333   → +⅓ EV
  -0.667  → −⅔ EV
  1.333   → +1⅓ EV
*/
function formatExposureDifferenceEv(value) {
  const roundedThirds = Math.round(value * 3);
  const sign =
    roundedThirds > 0
      ? "+"
      : roundedThirds < 0
        ? "−"
        : "";

  const absoluteThirds = Math.abs(roundedThirds);
  const whole = Math.floor(absoluteThirds / 3);
  const remainder = absoluteThirds % 3;

  let fraction = "";

  if (remainder === 1) {
    fraction = "⅓";
  }

  if (remainder === 2) {
    fraction = "⅔";
  }

  const number =
    whole > 0
      ? `${whole}${fraction}`
      : fraction || "0";

  return `${sign}${number} EV`;
}

/*
  Formats shutter values for labels where the unit should be visible.
*/
function formatShutterLabel(value) {
  if (!value) return "";

  if (value === "B" || value === "0") return value;

  if (value.endsWith("s")) {
    return value.replace("s", " s");
  }

  return `${value} s`;
}