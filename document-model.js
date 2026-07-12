"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Document Model

Purpose:
Builds renderer-neutral data for both the A4 Document and Quick Export.
The model contains data and meaning, never page placement.
==========================================================
*/

function documentText(value, fallback = "Not recorded") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function documentExposure(iso, shutter, aperture) {
  return {
    iso: iso ? `ISO ${iso}` : "ISO —",
    shutter: shutter ? formatShutterLabel(shutter) : "Shutter —",
    aperture: aperture ? `f/${aperture}` : "Aperture —"
  };
}


/*
  Calculates LAT (scene luminance range) directly from a stored Spot Reading
  collection. Export models must not depend on whichever Spot Sketch happens
  to be active in the runtime state.
*/
function calculateDocumentLat(readings) {
  const indexes = (readings || [])
    .map(reading => APERTURES.indexOf(String(reading.measurement?.aperture || "")))
    .filter(index => index >= 0);

  if (indexes.length < 2) return "--";

  const range = Math.abs(Math.max(...indexes) - Math.min(...indexes)) / 3;
  return Math.round(range * 10) / 10;
}

function normalizeDocumentContentSettings(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    includeImageAndMarkers: source.includeImageAndMarkers !== false,
    includeMeteringInformation: source.includeMeteringInformation !== false,
    includeActualExposure: source.includeActualExposure !== false,
    includeGearSettings: source.includeGearSettings !== false,
    includeDocumentNotes: source.includeDocumentNotes !== false,
    includeDevelopmentNotes: source.includeDevelopmentNotes !== false
  };
}

function calculateStoredExposure(sketch) {
  const decision = sketch?.calculation;
  if (!decision) return null;

  const reference = (sketch.spotReadings || []).find(
    reading => reading.id === decision.referenceSpotReadingId
  );
  const zone = decision.referenceZone;
  const controlled = decision.controlledExposure || {};

  if (!reference || !zone || !controlled.iso) return null;

  const marker = {
    ...reference,
    measurement: {
      iso: reference.measurement?.iso,
      shutter: reference.measurement?.shutter,
      aperture: String(reference.measurement?.aperture || "")
    }
  };

  if (decision.controlMode === "aperture") {
    const aperture = String(controlled.aperture || "");
    const shutter = calculateShutterForReference(
      marker,
      zone,
      controlled.iso,
      aperture
    );

    return shutter
      ? { iso: controlled.iso, shutter, aperture }
      : null;
  }

  const shutter = controlled.shutter;
  const aperture = calculateApertureForReference(
    marker,
    zone,
    controlled.iso,
    shutter
  );

  return aperture
    ? { iso: controlled.iso, shutter, aperture }
    : null;
}

function buildDocumentReadingRowsFromRecord(sketch, calculatedExposure) {
  const referenceId = sketch.calculation?.referenceSpotReadingId || null;
  const actualExposure = sketch.actualExposure?.status === "exposed"
    ? sketch.actualExposure
    : null;

  return [...(sketch.spotReadings || [])]
    .sort((a, b) => a.number - b.number)
    .map(reading => {
      const marker = {
        ...reading,
        measurement: {
          iso: reading.measurement?.iso,
          shutter: reading.measurement?.shutter,
          aperture: String(reading.measurement?.aperture || "")
        }
      };

      const planned = calculatedExposure
        ? calculateSpotReadingZone(marker, calculatedExposure)
        : null;

      const actual = actualExposure
        ? calculateSpotReadingZone(marker, actualExposure)
        : null;

      return {
        number: reading.number,
        original: `f/${documentText(reading.measurement?.aperture, "—")}`,
        plannedZone: planned ? `Zone ${planned.label}` : "—",
        plannedEv: planned ? formatEV(planned.ev) : "—",
        actualZone: actual ? `Zone ${actual.label}` : "—",
        actualEv: actual ? formatEV(actual.ev) : "—",
        isReference: reading.id === referenceId
      };
    });
}

function buildDocumentGearUnitsFromRecord(sketch) {
  const gear = sketch.gear || {};

  return {
    camera: {
      label: "Camera",
      value: documentText(gear.camera?.name),
      notes: documentText(gear.camera?.notes, "")
    },
    lens: {
      label: "Lens",
      value: documentText(gear.lens?.name),
      notes: documentText(gear.lens?.notes, "")
    },
    filter: {
      label: "Filter",
      value: documentText(gear.filter?.name),
      secondary: gear.filter?.evCorrection
        ? `Correction ${gear.filter.evCorrection}`
        : "",
      notes: documentText(gear.filter?.notes, "")
    },
    film: {
      label: "Film",
      value: documentText(gear.film?.name),
      secondary: gear.film?.boxIso
        ? `Box ISO ${gear.film.boxIso}`
        : "Box ISO —",
      notes: documentText(gear.film?.notes, "")
    },
    filmHolder: {
      label: "Film Holder",
      value: documentText(gear.filmHolder?.name),
      notes: documentText(gear.filmHolder?.notes, "")
    },
    lightMeter: {
      label: "Light Meter",
      value: documentText(gear.lightMeter?.name),
      notes: documentText(gear.lightMeter?.notes, "")
    },
    lighting: {
      label: "Lighting",
      value: documentText(gear.lighting?.description),
      notes: ""
    },
    gearNotes: {
      label: "Gear Notes",
      value: documentText(gear.notes),
      notes: ""
    }
  };
}

function buildSpotSketchDocumentModelFromRecord(sketch, projectDocument = null) {
  const record = sketch || {};
  const calculation = record.calculation || null;
  const calculated = calculateStoredExposure(record);
  const reference = (record.spotReadings || []).find(
    reading => reading.id === calculation?.referenceSpotReadingId
  ) || null;
  const referenceZone = calculation?.referenceZone || null;
  const actual = record.actualExposure || {};
  const location = record.location || {};
  const content = normalizeDocumentContentSettings(record.exportSettings);

  return {
    type: "spot-sketch",
    content,

    identity: {
      brand: "Spot Sketch",
      strapline: "Recording photographic decisions.",
      projectName: documentText(projectDocument?.project?.name, "Untitled Project"),
      imageName: documentText(
        record.title,
        documentText(record.imageIdentifier, "Untitled Spot Sketch")
      ),
      identifier: documentText(record.imageIdentifier),
      location: documentText(location.name),
      coordinates: [location.latitude, location.longitude]
        .filter(value => value !== null && value !== "" && value !== undefined)
        .join(", ") || "Not recorded",
      generatedAt: new Date().toLocaleDateString()
    },

    image: {
      dataUrl: record.image?.dataUrl || "",
      width: record.image?.workingWidth || 1,
      height: record.image?.workingHeight || 1,
      readings: [...(record.spotReadings || [])]
        .sort((a, b) => a.number - b.number)
        .map(reading => ({
          number: reading.number,
          x: reading.x,
          y: reading.y,
          original: reading.measurement?.aperture
            ? `f/${reading.measurement.aperture}`
            : "f/—",
          isReference: reading.id === calculation?.referenceSpotReadingId
        }))
    },

    workflow: {
      lat: calculateDocumentLat(record.spotReadings || []),

      initialMetering: {
        title: "Initial Metering Setup",
        explanation: "The fixed sensitivity and shutter used while recording the original spot measurements.",
        exposure: documentExposure(
          record.initialMeteringSetup?.iso,
          record.initialMeteringSetup?.shutter,
          null
        )
      },
      measurementRecord: {
        title: "Measurement Record",
        explanation: "Original readings are measured apertures. Planned and Actual Zones remain traceable to the same numbered points on the image.",
        rows: buildDocumentReadingRowsFromRecord(record, calculated)
      },
      referencePlacement: {
        title: "Reference + Zone",
        reference: reference ? `Spot Reading #${reference.number}` : "Not selected",
        zone: referenceZone ? `Zone ${referenceZone.label}` : "Not selected",
        explanation: reference && referenceZone
          ? `Calculation is anchored to Spot Reading #${reference.number}, placed on Zone ${referenceZone.label}.`
          : "No Calculation reference has been recorded."
      },
      calculatedExposure: {
        title: "Calculated Exposure",
        exposure: documentExposure(
          calculated?.iso,
          calculated?.shutter,
          calculated?.aperture
        ),
        explanation: reference && referenceZone
          ? `Calculated from Spot Reading #${reference.number} placed on Zone ${referenceZone.label}.`
          : "Available after Reference and Zone placement."
      },
      actualExposure: {
        title: "Actual Exposure",
        status: actual.status === "exposed" ? "Exposed" : "Not recorded",
        exposure: documentExposure(actual.iso, actual.shutter, actual.aperture),
        notes: documentText(actual.notes, "No exposure notes recorded.")
      }
    },

    gear: {
      title: "Gear Settings",
      units: buildDocumentGearUnitsFromRecord(record)
    },

    documentNotes: {
      title: "Document Notes",
      value: documentText(record.imageNotes, "")
    },

    developmentNotes: {
      title: "Development Notes",
      value: documentText(record.developmentNotes, "")
    }
  };
}

function buildSpotSketchDocumentModel() {
  ensureActualExposureStructure();
  ensureExportDocumentStructure();
  ensureProjectStructure();

  const record = buildCurrentSpotSketchRecord();
  const projectDocument = loadedProjectDocument || {
    project: { name: state.projectSession?.name || "Untitled Project" }
  };

  return buildSpotSketchDocumentModelFromRecord(record, projectDocument);
}

function buildProjectCoverModel(projectDocument) {
  const documentData = projectDocument || {};
  const sketches = documentData.spotSketches || [];

  return {
    type: "project-cover",
    brand: "Spot Sketch",
    strapline: "Recording photographic decisions.",
    projectName: documentText(documentData.project?.name, "Untitled Project"),
    spotSketchCount: sketches.length,
    notes: documentText(documentData.project?.notes, ""),
    generatedAt: new Date().toLocaleDateString()
  };
}
