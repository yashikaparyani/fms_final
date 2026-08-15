const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const CarrierOnboarding = require("../models/CarrierOnboarding");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const { findCarrierFor } = require("../utils/carrierAccount");
const {
  catalog: agreementCatalog,
  AGREEMENT_BY_KEY,
  AGREEMENT_KEYS,
  profileGaps,
} = require("../config/carrierAgreements");
const {
  catalog: insuranceCatalog,
  missingRequired,
} = require("../config/insuranceCoverages");
// The carrier gets the counterparty's own fifteen-page document with its
// blanks filled, not a summary of it — see services/agreementOverlayService.
const { buildFilledAgreement } = require("../services/agreementOverlayService");

// ─── Carrier onboarding ───────────────────────────────────────────────────────
// The paperwork a carrier completes after the short signup form: the two
// agreements, the drivers who will actually be moving the freight, and the
// insurance their agent files on their behalf.
//
// A carrier drives their own onboarding; the office can see and complete it on
// their behalf, because half of these get finished over the phone with somebody
// reading their MC number off a card.
//
// Scope is resolved the same way it is everywhere else on the carrier side —
// off the account, never off the request. See utils/carrierAccount.js.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const isOffice = (user) => ["staff", "admin"].includes(user?.role);

/**
 * The carrier whose onboarding this request may touch.
 *
 * A carrier gets their own and cannot ask for another. The office must name one,
 * and the tenant scope on FleetOwner means they can only name one at their own
 * active location.
 */
const resolveCarrier = async (req, requestedId) => {
  if (["fleetOwner", "driver"].includes(req.user.role)) {
    const carrier = await findCarrierFor(req.user, "_id carrierName fleetOwnerCode userId");
    if (!carrier) {
      throw Object.assign(
        new Error(
          "No carrier profile is linked to your account. Ask the office to finish setting it up.",
        ),
        { status: 404 },
      );
    }
    return carrier;
  }

  const id = trimmed(requestedId);
  if (!id) {
    throw Object.assign(
      new Error("Name the carrier (fleetOwnerId) whose onboarding you are working on."),
      { status: 400 },
    );
  }
  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error("Not a valid carrier id."), { status: 400 });
  }

  const carrier = await FleetOwner.findById(id).select(
    "_id carrierName fleetOwnerCode userId",
  );
  if (!carrier) {
    throw Object.assign(new Error("Carrier not found at this location."), { status: 404 });
  }
  return carrier;
};

/**
 * The carrier's onboarding document, created empty on first touch.
 *
 * Created lazily rather than alongside the FleetOwner: carriers that predate
 * this feature have no document, and making every read handle "might not exist"
 * would spread that check across every handler here.
 */
const loadOrCreate = async (carrier, user) => {
  let onboarding = await CarrierOnboarding.findOne({ fleetOwner: carrier._id });

  if (!onboarding) {
    onboarding = await CarrierOnboarding.create({
      fleetOwner: carrier._id,
      userId: carrier.userId,
      // Seeded from what the carrier already gave at signup so the first screen
      // is half-filled rather than blank — they should not have to retype their
      // own company name three minutes after entering it.
      profile: {
        legalName: carrier.carrierName || "",
      },
    });
  }

  return onboarding;
};

/** Roster snapshot in the shape the agreement document and the UI both want. */
const driversFor = async (carrierId) =>
  Driver.find({ fleetOwner: carrierId, active: { $ne: false } })
    .select(
      "name phone email driverCode licenseNumber licenseState licenseClass licenseExpiry licenseDocument endorsements medicalCardExpiry userId",
    )
    .sort({ name: 1 })
    .lean();

/** What the carrier still has to do, in the order the wizard asks for it. */
const outstandingFor = (onboarding, drivers) => {
  const outstanding = [];

  const gaps = profileGaps(onboarding.profile);
  if (gaps.length) {
    outstanding.push({
      step: "agreements",
      message: `Company details still needed: ${gaps.join(", ")}.`,
    });
  }

  AGREEMENT_KEYS.forEach((key) => {
    const signed = (onboarding.agreements || []).find((a) => a.key === key && a.signedAt);
    if (!signed) {
      outstanding.push({
        step: "agreements",
        message: `${AGREEMENT_BY_KEY.get(key).title} has not been signed.`,
      });
    }
  });

  if (!drivers.length) {
    outstanding.push({
      step: "drivers",
      message: "Add at least one driver before you can be dispatched.",
    });
  }

  // A driver with no licence on file is the specific gap the agreements'
  // "competent and properly licensed" warranty (¶23) turns on, so it is called
  // out by name rather than folded into a count.
  const noLicence = drivers.filter((d) => !d.licenseDocument?.filePath);
  if (drivers.length && noLicence.length) {
    outstanding.push({
      step: "drivers",
      message: `Licence copy missing for ${noLicence.map((d) => d.name).join(", ")}.`,
    });
  }

  const expiredLicences = drivers.filter(
    (d) => d.licenseExpiry && new Date(d.licenseExpiry) < new Date(),
  );
  if (expiredLicences.length) {
    outstanding.push({
      step: "drivers",
      message: `Licence has expired for ${expiredLicences.map((d) => d.name).join(", ")}.`,
    });
  }

  if (!onboarding.insurance?.invitedAt) {
    outstanding.push({
      step: "insurance",
      message: "Send your insurance agent the request for certificates.",
    });
  } else if (!onboarding.insurance?.submittedAt) {
    outstanding.push({
      step: "insurance",
      message: `Waiting on ${onboarding.insurance.agencyName || onboarding.insurance.agentEmail} to file your certificates.`,
    });
  } else {
    const missing = missingRequired(onboarding.insurance.policies);
    if (missing.length) {
      outstanding.push({
        step: "insurance",
        message: `Required cover not yet filed: ${missing.join(", ")}.`,
      });
    }
  }

  return outstanding;
};

/**
 * The full onboarding payload.
 *
 * The token hash is `select: false` on the schema so it never reaches here, but
 * the agent's email and the invite dates do — the carrier needs to see who was
 * asked and when, which is the whole answer to "why is my insurance not done".
 */
const toPayload = (onboarding, { carrier, drivers }) => ({
  _id: onboarding._id,
  status: onboarding.status,
  currentStep: onboarding.currentStep,
  // Both agreements signed. This is the gate the carrier portal opens the rest
  // of the app on, so it is derived here from the model's own rule rather than
  // recounted in the browser — a client-side copy would drift the first time a
  // third agreement is added to config/carrierAgreements.js.
  agreementsComplete: onboarding.agreementsComplete(),
  insuranceComplete: onboarding.insuranceComplete(),
  carrier: {
    _id: carrier._id,
    carrierName: carrier.carrierName,
    fleetOwnerCode: carrier.fleetOwnerCode,
  },
  profile: onboarding.profile || {},
  equipment: onboarding.equipment || [],
  agreements: (onboarding.agreements || []).map((a) => ({
    key: a.key,
    values: a.values || {},
    acknowledgements: a.acknowledgements || [],
    signedName: a.signedName,
    signedTitle: a.signedTitle,
    signedAt: a.signedAt,
    version: a.version,
    // The path is never exposed; the download route is the only way to the file.
    hasDocument: !!a.document?.filePath,
    documentName: a.document?.fileName || null,
  })),
  drivers,
  insurance: {
    agencyName: onboarding.insurance?.agencyName || "",
    agentName: onboarding.insurance?.agentName || "",
    agentEmail: onboarding.insurance?.agentEmail || "",
    agentPhone: onboarding.insurance?.agentPhone || "",
    invitedAt: onboarding.insurance?.invitedAt || null,
    reminderSentAt: onboarding.insurance?.reminderSentAt || null,
    tokenExpiresAt: onboarding.insurance?.tokenExpiresAt || null,
    submittedAt: onboarding.insurance?.submittedAt || null,
    submittedByName: onboarding.insurance?.submittedByName || "",
    policies: onboarding.insurance?.policies || [],
    shortfalls: onboarding.insurance?.shortfalls || [],
  },
  reviewedAt: onboarding.reviewedAt,
  reviewNote: onboarding.reviewNote,
  submittedAt: onboarding.submittedAt,
  outstanding: outstandingFor(onboarding, drivers),
});

// @desc    The field schema for the whole wizard
// @route   GET /api/onboarding/catalog
// @access  Private (fleetOwner, staff, admin)
//
// One call: the agreement fields, the insurance requirements and the states
// list. The wizard needs all three before it can render its first step, and
// three round-trips to draw one form is three chances to render half of it.
const getCatalog = async (req, res) => {
  try {
    res.json({
      ...agreementCatalog(),
      insurance: insuranceCatalog(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    A carrier's onboarding file
// @route   GET /api/onboarding
// @access  Private (own carrier; office via ?fleetOwnerId)
const getOnboarding = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.query.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);
    const drivers = await driversFor(carrier._id);

    res.json(toPayload(onboarding, { carrier, drivers }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Save the company details and equipment (autosaves as they type)
// @route   PUT /api/onboarding/profile
// @access  Private (own carrier, staff, admin)
//
// Saves whatever is present without requiring the form to be complete: this is
// a long form that gets filled over more than one sitting, and refusing to
// remember a half-finished one is how people give up on it. Completeness is
// enforced at signing instead, where it actually matters.
const saveProfile = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);

    if (onboarding.status === "APPROVED" && !isOffice(req.user)) {
      return res.status(409).json({
        message:
          "Your onboarding has been approved and can no longer be edited. Contact the office to make a change.",
      });
    }

    if (req.body.profile && typeof req.body.profile === "object") {
      onboarding.profile = { ...(onboarding.profile || {}), ...req.body.profile };
      onboarding.markModified("profile");
    }

    if (Array.isArray(req.body.equipment)) {
      onboarding.equipment = req.body.equipment.map((row) => ({
        unitNumber: trimmed(row.unitNumber),
        equipmentType: trimmed(row.equipmentType),
        make: trimmed(row.make),
        model: trimmed(row.model),
        year: row.year ? Number(row.year) : undefined,
        vin: trimmed(row.vin).toUpperCase(),
        plate: trimmed(row.plate),
        plateState: trimmed(row.plateState).toUpperCase(),
      }));
    }

    if (req.body.currentStep && CarrierOnboarding.STEPS.includes(req.body.currentStep)) {
      onboarding.currentStep = req.body.currentStep;
    }

    const drivers = await driversFor(carrier._id);
    onboarding.refreshStatus({ hasDrivers: drivers.length > 0 });
    await onboarding.save();

    res.json({
      message: "Saved.",
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Sign one of the agreements
// @route   POST /api/onboarding/agreements/:key/sign
// @access  Private (own carrier, staff, admin)
const signAgreement = async (req, res) => {
  try {
    const agreement = AGREEMENT_BY_KEY.get(req.params.key);
    if (!agreement) {
      return res.status(404).json({ message: "Unknown agreement." });
    }

    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);

    // Merge any last edits from the signing screen before validating, so a
    // carrier who fixes their MC number on the signature page does not get told
    // it is missing.
    if (req.body.profile && typeof req.body.profile === "object") {
      onboarding.profile = { ...(onboarding.profile || {}), ...req.body.profile };
      onboarding.markModified("profile");
    }

    // Completeness IS enforced here — a contract with blanks in it is not a
    // contract, and this is the last point before one is produced.
    const gaps = profileGaps(onboarding.profile);
    if (gaps.length) {
      return res.status(400).json({
        message: `These details are needed before you can sign: ${gaps.join(", ")}.`,
        gaps,
      });
    }

    const values = req.body.values || {};

    const missingFields = (agreement.fields || [])
      .filter((f) => f.required && !trimmed(values[f.key]))
      .map((f) => f.label);

    if (missingFields.length) {
      return res.status(400).json({
        message: `Still needed: ${missingFields.join(", ")}.`,
        gaps: missingFields,
      });
    }

    const signedName = trimmed(req.body.signedName) || trimmed(onboarding.profile.signerName);
    const signedTitle = trimmed(req.body.signedTitle) || trimmed(onboarding.profile.signerTitle);

    if (!signedName || !signedTitle) {
      return res
        .status(400)
        .json({ message: "The signer's name and title are both required." });
    }

    // Every acknowledgement has to be ticked. They are individual
    // representations — safety rating, no re-brokering, authority to sign — and
    // accepting a partial set would record the carrier as having confirmed
    // things they did not.
    const accepted = Array.isArray(req.body.acknowledgements)
      ? req.body.acknowledgements
      : [];

    if (accepted.length !== agreement.acknowledgements.length) {
      return res.status(400).json({
        message: "Every acknowledgement must be confirmed before signing.",
      });
    }

    if (agreement.key === "contractor" && !(onboarding.equipment || []).length) {
      return res.status(400).json({
        message:
          "Appendix A needs at least one piece of equipment before this agreement can be signed.",
      });
    }

    const signed = {
      key: agreement.key,
      values,
      acknowledgements: agreement.acknowledgements,
      signedName,
      signedTitle,
      signatureData: req.body.signatureData || "",
      signedAt: new Date(),
      // Kept so a later dispute can be answered with where the signature came
      // from. Behind a proxy Express only reports the real client IP when
      // `trust proxy` is set — the value is evidence, not identification.
      signedIp: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "",
      signedUserAgent: String(req.headers["user-agent"] || "").slice(0, 200),
      version: 1,
    };

    const drivers = await driversFor(carrier._id);

    const document = await buildFilledAgreement({
      agreementKey: agreement.key,
      profile: onboarding.profile,
      signed,
      // Fills Appendix A on the contractor agreement; ignored by the broker one.
      equipment: onboarding.equipment || [],
      carrierCode: carrier.fleetOwnerCode || String(carrier._id).slice(-6),
    });

    signed.document = {
      fileName: document.fileName,
      originalName: `${agreement.title}.pdf`,
      filePath: document.filePath,
      mimeType: "application/pdf",
      size: fs.statSync(document.filePath).size,
      uploadedAt: new Date(),
      uploadedBy: req.user._id,
    };

    // Re-signing replaces the previous execution rather than appending: the
    // current agreement is one document, and a list of three would leave "which
    // one is in force?" for the reader to work out.
    onboarding.agreements = [
      ...(onboarding.agreements || []).filter((a) => a.key !== agreement.key),
      signed,
    ];

    onboarding.refreshStatus({ hasDrivers: drivers.length > 0 });
    await onboarding.save();

    res.status(201).json({
      message: `${agreement.title} signed. Your copy is ready to download.`,
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Download a signed agreement
// @route   GET /api/onboarding/agreements/:key/download
// @access  Private (own carrier, staff, admin)
//
// Streamed through the API rather than served from /uploads: the static mount
// has no idea who is asking, and these documents carry a carrier's tax ID and
// signature.
const downloadAgreement = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.query.fleetOwnerId);
    const onboarding = await CarrierOnboarding.findOne({ fleetOwner: carrier._id });

    const signed = (onboarding?.agreements || []).find((a) => a.key === req.params.key);

    if (!signed?.document?.filePath) {
      return res
        .status(404)
        .json({ message: "That agreement has not been signed yet." });
    }

    if (!fs.existsSync(signed.document.filePath)) {
      return res.status(410).json({
        message:
          "The signed copy is no longer on file. Sign the agreement again to produce a fresh one.",
      });
    }

    const agreement = AGREEMENT_BY_KEY.get(req.params.key);
    const downloadName = `${carrier.fleetOwnerCode || "carrier"} - ${agreement.title}.pdf`;

    res.download(signed.document.filePath, downloadName);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Attach a driver's licence scan
// @route   POST /api/onboarding/drivers/:driverId/license
// @access  Private (own carrier, staff, admin)
const uploadDriverLicense = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);

    const driver = await Driver.findOne({
      _id: req.params.driverId,
      fleetOwner: carrier._id,
    });

    if (!driver) {
      return res.status(404).json({ message: "That driver is not on your roster." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Attach a scan or photo of the licence." });
    }

    // Replacing a licence removes the old scan: a driver has one current
    // licence, and leaving superseded copies on disk means a renewal quietly
    // doubles what a breach would expose.
    const previous = driver.licenseDocument?.filePath;

    driver.licenseDocument = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    };

    for (const field of ["licenseNumber", "licenseState", "licenseClass"]) {
      if (req.body[field] !== undefined) {
        driver[field] = trimmed(req.body[field]).toUpperCase();
      }
    }
    // The number is not an uppercase-only value the way a state code is.
    if (req.body.licenseNumber !== undefined) {
      driver.licenseNumber = trimmed(req.body.licenseNumber);
    }
    if (req.body.licenseExpiry) driver.licenseExpiry = req.body.licenseExpiry;
    if (req.body.medicalCardExpiry) driver.medicalCardExpiry = req.body.medicalCardExpiry;

    if (req.body.endorsements !== undefined) {
      const list = Array.isArray(req.body.endorsements)
        ? req.body.endorsements
        : String(req.body.endorsements).split(",");
      driver.endorsements = list
        .map((e) => trimmed(e).toUpperCase())
        .filter((e) => ["H", "N", "T", "P", "S", "X"].includes(e));
    }

    await driver.save();

    if (previous && previous !== driver.licenseDocument.filePath) {
      fs.promises.unlink(previous).catch(() => {
        /* already gone, or never written — nothing to recover from */
      });
    }

    const drivers = await driversFor(carrier._id);
    const onboarding = await loadOrCreate(carrier, req.user);
    onboarding.refreshStatus({ hasDrivers: drivers.length > 0 });
    await onboarding.save();

    res.json({
      message: `Licence saved for ${driver.name}.`,
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Download a driver's licence scan
// @route   GET /api/onboarding/drivers/:driverId/license
// @access  Private (own carrier, staff, admin)
const downloadDriverLicense = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.query.fleetOwnerId);

    const driver = await Driver.findOne({
      _id: req.params.driverId,
      fleetOwner: carrier._id,
    }).lean();

    if (!driver?.licenseDocument?.filePath) {
      return res.status(404).json({ message: "No licence is on file for that driver." });
    }

    if (!fs.existsSync(driver.licenseDocument.filePath)) {
      return res.status(410).json({ message: "That file is no longer on the server." });
    }

    const ext = path.extname(driver.licenseDocument.originalName || "") || ".pdf";
    res.download(driver.licenseDocument.filePath, `${driver.name} - licence${ext}`);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Office decision on a completed onboarding
// @route   PUT /api/onboarding/review
// @access  Private (staff, admin)
const reviewOnboarding = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);
    const drivers = await driversFor(carrier._id);

    const decision = trimmed(req.body.decision).toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return res
        .status(400)
        .json({ message: "The decision must be APPROVED or REJECTED." });
    }

    if (decision === "REJECTED" && !trimmed(req.body.note)) {
      // A rejection with no reason gives the carrier nothing to fix, so they
      // resubmit the same file and the loop repeats.
      return res
        .status(400)
        .json({ message: "Say what needs fixing when rejecting." });
    }

    if (decision === "APPROVED") {
      const outstanding = outstandingFor(onboarding, drivers);
      if (outstanding.length && !req.body.overrideOutstanding) {
        return res.status(400).json({
          message: "This onboarding is not complete yet.",
          outstanding,
          // The office genuinely does approve incomplete files sometimes — a
          // carrier whose agent will not file until the first load is booked.
          // Make it a deliberate act rather than an accident.
          hint: "Send overrideOutstanding: true to approve anyway.",
        });
      }
    }

    onboarding.status = decision;
    onboarding.reviewedAt = new Date();
    onboarding.reviewedBy = req.user._id;
    onboarding.reviewNote = trimmed(req.body.note);
    await onboarding.save();

    res.json({
      message:
        decision === "APPROVED"
          ? `${carrier.carrierName} approved and cleared to haul.`
          : `${carrier.carrierName} sent back for changes.`,
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Onboarding status for every carrier at this location
// @route   GET /api/onboarding/queue
// @access  Private (staff, admin)
const getOnboardingQueue = async (req, res) => {
  try {
    const files = await CarrierOnboarding.find()
      .populate("fleetOwner", "carrierName fleetOwnerCode phone")
      .sort({ updatedAt: -1 })
      .lean();

    res.json(
      files.map((file) => ({
        _id: file._id,
        status: file.status,
        carrier: file.fleetOwner,
        legalName: file.profile?.legalName || "",
        mcNumber: file.profile?.mcNumber || "",
        signedCount: (file.agreements || []).filter((a) => a.signedAt).length,
        agreementCount: AGREEMENT_KEYS.length,
        insuranceSubmittedAt: file.insurance?.submittedAt || null,
        insuranceAgent: file.insurance?.agencyName || file.insurance?.agentEmail || "",
        policyCount: (file.insurance?.policies || []).length,
        shortfalls: (file.insurance?.shortfalls || []).length,
        submittedAt: file.submittedAt,
        updatedAt: file.updatedAt,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCatalog,
  getOnboarding,
  saveProfile,
  signAgreement,
  downloadAgreement,
  uploadDriverLicense,
  downloadDriverLicense,
  reviewOnboarding,
  getOnboardingQueue,
  // shared with the insurance controller
  resolveCarrier,
  loadOrCreate,
  driversFor,
  toPayload,
};
