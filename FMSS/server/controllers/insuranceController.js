const fs = require("fs");
const CarrierOnboarding = require("../models/CarrierOnboarding");
const FleetOwner = require("../models/FleetOwner");
const { runUnscoped } = require("../utils/tenantContext");
const {
  catalog: insuranceCatalog,
  shortfallsFor,
  missingRequired,
  COVERAGE_BY_KEY,
} = require("../config/insuranceCoverages");
const {
  resolveCarrier,
  loadOrCreate,
  driversFor,
  toPayload,
} = require("./onboardingController");
const {
  sendInsuranceRequest,
  sendInsuranceFiled,
} = require("../services/emailService");

// ─── Insurance certificates ───────────────────────────────────────────────────
// The carrier does not fill this in — their insurance agency does. The carrier
// supplies an email address, the agency gets a one-off link, and what they file
// comes back visible to the carrier without either party needing an account
// here.
//
// The link is the whole security model, so it is built the way a password reset
// is: a long random token, only its hash stored, single carrier, dated
// expiry, and re-issuable (which invalidates whatever came before). An agent
// holding a link can file certificates for exactly one carrier and can read
// nothing else.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const { frontendUrl } = require("../utils/frontendUrl");

const insuranceLinkFor = (token) => `${frontendUrl()}/insurance/${token}`;

/** Normalise one submitted policy into the shape the schema stores. */
const normalizePolicy = (raw = {}) => ({
  coverage: trimmed(raw.coverage),
  insurerName: trimmed(raw.insurerName),
  amBestRating: trimmed(raw.amBestRating).toUpperCase(),
  policyNumber: trimmed(raw.policyNumber),
  limit: toNumberOrNull(raw.limit),
  aggregateLimit: toNumberOrNull(raw.aggregateLimit),
  deductible: toNumberOrNull(raw.deductible),
  effectiveDate: raw.effectiveDate || undefined,
  expiryDate: raw.expiryDate || undefined,
  namedInsured: trimmed(raw.namedInsured),
  additionalInsured: !!raw.additionalInsured,
  lossPayee: !!raw.lossPayee,
  waiverOfSubrogation: !!raw.waiverOfSubrogation,
  mcs90Attached: !!raw.mcs90Attached,
  noticeOfCancellationDays: toNumberOrNull(raw.noticeOfCancellationDays) ?? 30,
  notes: trimmed(raw.notes),
});

// ══ Carrier side ══════════════════════════════════════════════════════════════

// @desc    Ask an insurance agency to file this carrier's certificates
// @route   POST /api/insurance/invite
// @access  Private (own carrier, staff, admin)
const inviteInsuranceAgent = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);

    const agentEmail = trimmed(req.body.agentEmail).toLowerCase();

    if (!EMAIL_RE.test(agentEmail)) {
      return res
        .status(400)
        .json({ message: "Enter a valid email address for your insurance agent." });
    }

    onboarding.insurance = onboarding.insurance || {};
    onboarding.insurance.agencyName = trimmed(req.body.agencyName);
    onboarding.insurance.agentName = trimmed(req.body.agentName);
    onboarding.insurance.agentEmail = agentEmail;
    onboarding.insurance.agentPhone = trimmed(req.body.agentPhone);
    onboarding.insurance.invitedAt = new Date();
    onboarding.insurance.invitedBy = req.user._id;
    onboarding.insurance.reminderSentAt = undefined;

    // Returned once, here, and never recoverable from the document afterwards.
    const token = onboarding.issueInsuranceToken({ days: 30 });

    const drivers = await driversFor(carrier._id);
    onboarding.refreshStatus({ hasDrivers: drivers.length > 0 });
    await onboarding.save();

    const emailStatus = await sendInsuranceRequest({
      to: agentEmail,
      agentName: onboarding.insurance.agentName,
      agencyName: onboarding.insurance.agencyName,
      carrierName: onboarding.profile?.legalName || carrier.carrierName,
      mcNumber: onboarding.profile?.mcNumber,
      dotNumber: onboarding.profile?.dotNumber,
      link: insuranceLinkFor(token),
      expiresAt: onboarding.insurance.tokenExpiresAt,
    });

    res.status(201).json({
      message: emailStatus.sent
        ? `Request sent to ${agentEmail}.`
        : `Request prepared, but the email could not be sent (${emailStatus.message || "email not configured"}). Send them the link yourself.`,
      emailStatus,
      // Handed back so the carrier can forward it themselves when email is not
      // configured — otherwise a failed send is a dead end with no way forward.
      link: insuranceLinkFor(token),
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Nudge an agency that has not filed yet
// @route   POST /api/insurance/remind
// @access  Private (own carrier, staff, admin)
//
// Re-issues the token rather than resending the old one: the first link may
// have been forwarded on or gone stale, and one live link per carrier is easier
// to reason about than several.
const remindInsuranceAgent = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.body.fleetOwnerId);
    const onboarding = await loadOrCreate(carrier, req.user);

    const agentEmail = onboarding.insurance?.agentEmail;
    if (!agentEmail) {
      return res
        .status(400)
        .json({ message: "No insurance agent has been asked yet." });
    }

    if (onboarding.insurance?.submittedAt) {
      return res
        .status(400)
        .json({ message: "This agency has already filed the certificates." });
    }

    const token = onboarding.issueInsuranceToken({ days: 30 });
    onboarding.insurance.reminderSentAt = new Date();
    await onboarding.save();

    const emailStatus = await sendInsuranceRequest({
      to: agentEmail,
      agentName: onboarding.insurance.agentName,
      agencyName: onboarding.insurance.agencyName,
      carrierName: onboarding.profile?.legalName || carrier.carrierName,
      mcNumber: onboarding.profile?.mcNumber,
      dotNumber: onboarding.profile?.dotNumber,
      link: insuranceLinkFor(token),
      expiresAt: onboarding.insurance.tokenExpiresAt,
      isReminder: true,
    });

    const drivers = await driversFor(carrier._id);

    res.json({
      message: emailStatus.sent
        ? `Reminder sent to ${agentEmail}.`
        : `Reminder prepared but not emailed (${emailStatus.message || "email not configured"}).`,
      emailStatus,
      link: insuranceLinkFor(token),
      onboarding: toPayload(onboarding, { carrier, drivers }),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// ══ Agency side — public, token only ══════════════════════════════════════════

/**
 * Find the onboarding file a token belongs to.
 *
 * Unscoped by necessity: the agency is not signed in, so there is no active
 * location to scope by. The token itself is the authorisation, and it resolves
 * to exactly one carrier — which is why it is looked up by hash rather than
 * accepting any carrier id the caller names.
 */
const onboardingForToken = async (token) => {
  const raw = trimmed(token);
  if (!raw) return null;

  const tokenHash = CarrierOnboarding.hashInsuranceToken(raw);

  const onboarding = await runUnscoped(() =>
    CarrierOnboarding.findOne({ "insurance.tokenHash": tokenHash })
      .select("+insurance.tokenHash")
      .populate("fleetOwner", "carrierName fleetOwnerCode"),
  );

  if (!onboarding) return null;

  if (
    onboarding.insurance?.tokenExpiresAt &&
    onboarding.insurance.tokenExpiresAt < new Date()
  ) {
    return { expired: true, onboarding };
  }

  return { expired: false, onboarding };
};

// @desc    What the agency needs to fill in the form
// @route   GET /api/insurance/public/:token
// @access  Public (token)
//
// Deliberately narrow: the carrier's legal name, MC/DOT and address — the
// details an agency needs to match the request to a policy — plus the
// requirements and whatever has already been filed. Nothing about the carrier's
// loads, rates or drivers.
const getPublicInsuranceForm = async (req, res) => {
  try {
    const found = await onboardingForToken(req.params.token);

    if (!found) {
      return res.status(404).json({
        message:
          "This link is not valid. Ask the carrier to send you a fresh request.",
        code: "INVALID_TOKEN",
      });
    }

    if (found.expired) {
      return res.status(410).json({
        message:
          "This link has expired. Ask the carrier to send you a fresh request.",
        code: "EXPIRED_TOKEN",
      });
    }

    const { onboarding } = found;
    const profile = onboarding.profile || {};

    res.json({
      carrier: {
        legalName: profile.legalName || onboarding.fleetOwner?.carrierName || "",
        dba: profile.dba || "",
        mcNumber: profile.mcNumber || "",
        dotNumber: profile.dotNumber || "",
        address: [profile.street, profile.city, profile.state, profile.zip]
          .filter(Boolean)
          .join(", "),
        code: onboarding.fleetOwner?.fleetOwnerCode || "",
      },
      broker: {
        // The certificate holder / additional insured the agency has to name.
        // Spelled out because getting it wrong means a re-issue, and an agency
        // should not have to guess it from an email footer.
        name: "S LINE BROKERAGE, INC.",
        address: "9972 Phoenician Way, Sacramento, CA 95829-8006",
      },
      requirements: insuranceCatalog(),
      // Present so a returning agency edits what they filed rather than
      // duplicating it.
      policies: onboarding.insurance?.policies || [],
      submittedAt: onboarding.insurance?.submittedAt || null,
      expiresAt: onboarding.insurance?.tokenExpiresAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The agency files the certificates
// @route   POST /api/insurance/public/:token
// @access  Public (token)
const submitPublicInsurance = async (req, res) => {
  try {
    const found = await onboardingForToken(req.params.token);

    if (!found) {
      return res.status(404).json({ message: "This link is not valid.", code: "INVALID_TOKEN" });
    }
    if (found.expired) {
      return res.status(410).json({ message: "This link has expired.", code: "EXPIRED_TOKEN" });
    }

    const { onboarding } = found;

    const submitted = Array.isArray(req.body.policies) ? req.body.policies : [];

    if (!submitted.length) {
      return res.status(400).json({ message: "Add at least one policy." });
    }

    const policies = submitted
      .map(normalizePolicy)
      .filter((p) => COVERAGE_BY_KEY.has(p.coverage));

    if (!policies.length) {
      return res
        .status(400)
        .json({ message: "None of those coverage types are recognised." });
    }

    // One policy per coverage: a second entry for the same coverage is an edit
    // of the first, not an additional policy, and keeping both would leave the
    // office comparing two limits with no way to tell which is current.
    const byCoverage = new Map();
    policies.forEach((p) => byCoverage.set(p.coverage, p));
    const deduped = [...byCoverage.values()];

    // Shortfalls are recorded, not rejected. An agency filing a genuine policy
    // that happens to sit below the contractual limit needs the filing to land
    // so the office can see it and decide; blocking it means the office never
    // learns the limit is short.
    const shortfalls = [
      ...deduped.flatMap((p) => shortfallsFor(p)),
      ...missingRequired(deduped).map(
        (label) => `${label}: no policy has been filed for this required cover.`,
      ),
    ];

    onboarding.insurance = onboarding.insurance || {};
    onboarding.insurance.policies = deduped;
    onboarding.insurance.shortfalls = shortfalls;
    onboarding.insurance.submittedAt = new Date();
    onboarding.insurance.submittedByName = trimmed(req.body.submittedByName);
    onboarding.insurance.submittedByEmail = trimmed(req.body.submittedByEmail).toLowerCase();

    if (trimmed(req.body.agencyName)) {
      onboarding.insurance.agencyName = trimmed(req.body.agencyName);
    }

    const drivers = await runUnscoped(() => driversFor(onboarding.fleetOwner._id));
    onboarding.refreshStatus({ hasDrivers: drivers.length > 0 });

    await runUnscoped(() => onboarding.save());

    // Tell the carrier it landed. They asked for this and have been waiting on
    // it; finding out by checking the page every day is not a workflow.
    const carrierEmail =
      onboarding.profile?.signerEmail || onboarding.profile?.remitEmail;

    if (carrierEmail) {
      await sendInsuranceFiled({
        to: carrierEmail,
        carrierName: onboarding.profile?.legalName || onboarding.fleetOwner?.carrierName,
        agencyName: onboarding.insurance.agencyName,
        policyCount: deduped.length,
        shortfalls,
      });
    }

    res.status(201).json({
      message: shortfalls.length
        ? "Certificates filed. Some items fall short of the contractual requirements — the details are listed below and have been passed to the broker."
        : "Certificates filed. Everything meets the contractual requirements. Thank you.",
      policies: deduped,
      shortfalls,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Attach a certificate (ACORD) to a filed policy
// @route   POST /api/insurance/public/:token/certificate
// @access  Public (token)
const uploadPublicCertificate = async (req, res) => {
  try {
    const found = await onboardingForToken(req.params.token);

    if (!found || found.expired) {
      // Clean up whatever multer already wrote — an unreferenced upload from an
      // invalid token is just litter on disk.
      if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
      return res
        .status(found?.expired ? 410 : 404)
        .json({ message: "This link is not valid." });
    }

    const { onboarding } = found;
    const coverage = trimmed(req.body.coverage);

    if (!req.file) {
      return res.status(400).json({ message: "Attach the certificate file." });
    }

    const policy = (onboarding.insurance?.policies || []).find(
      (p) => p.coverage === coverage,
    );

    if (!policy) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(404).json({
        message: "File the policy details for that coverage before attaching a certificate.",
      });
    }

    const previous = policy.certificate?.filePath;

    policy.certificate = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    };

    onboarding.markModified("insurance.policies");
    await runUnscoped(() => onboarding.save());

    if (previous && previous !== policy.certificate.filePath) {
      fs.promises.unlink(previous).catch(() => {});
    }

    res.json({
      message: `Certificate attached for ${COVERAGE_BY_KEY.get(coverage)?.label || coverage}.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ══ Reading it back ═══════════════════════════════════════════════════════════

// @desc    Download a filed certificate
// @route   GET /api/insurance/certificate/:coverage
// @access  Private (own carrier, staff, admin)
const downloadCertificate = async (req, res) => {
  try {
    const carrier = await resolveCarrier(req, req.query.fleetOwnerId);
    const onboarding = await CarrierOnboarding.findOne({ fleetOwner: carrier._id });

    const policy = (onboarding?.insurance?.policies || []).find(
      (p) => p.coverage === req.params.coverage,
    );

    if (!policy?.certificate?.filePath) {
      return res
        .status(404)
        .json({ message: "No certificate has been filed for that coverage." });
    }

    if (!fs.existsSync(policy.certificate.filePath)) {
      return res.status(410).json({ message: "That file is no longer on the server." });
    }

    const label = COVERAGE_BY_KEY.get(policy.coverage)?.label || policy.coverage;
    res.download(
      policy.certificate.filePath,
      `${carrier.fleetOwnerCode || "carrier"} - ${label} certificate.pdf`,
    );
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Policies expiring soon, across the location
// @route   GET /api/insurance/expiring
// @access  Private (staff, admin)
//
// A lapsed certificate is the thing that grounds a carrier mid-load, so the
// office needs to see it coming rather than discover it at dispatch.
const getExpiringInsurance = async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const files = await CarrierOnboarding.find({
      "insurance.policies.expiryDate": { $lte: cutoff },
    })
      .populate("fleetOwner", "carrierName fleetOwnerCode phone")
      .lean();

    const rows = [];

    files.forEach((file) => {
      (file.insurance?.policies || []).forEach((policy) => {
        if (!policy.expiryDate || new Date(policy.expiryDate) > cutoff) return;

        rows.push({
          carrier: file.fleetOwner,
          coverage: policy.coverage,
          coverageLabel: COVERAGE_BY_KEY.get(policy.coverage)?.label || policy.coverage,
          insurerName: policy.insurerName,
          policyNumber: policy.policyNumber,
          expiryDate: policy.expiryDate,
          expired: new Date(policy.expiryDate) < new Date(),
          agentEmail: file.insurance?.agentEmail || "",
          agencyName: file.insurance?.agencyName || "",
        });
      });
    });

    rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  inviteInsuranceAgent,
  remindInsuranceAgent,
  getPublicInsuranceForm,
  submitPublicInsurance,
  uploadPublicCertificate,
  downloadCertificate,
  getExpiringInsurance,
};
