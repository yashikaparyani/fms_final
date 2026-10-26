const crypto = require("crypto");
const IcAgreement = require("../models/IcAgreement");
const { sendAgreementCopies } = require("../services/icAgreementMail");

// ─── IC agreement submissions ─────────────────────────────────────────────────
// POST is public: whoever fills the form saves it, signed in or not. Everything
// else is for IC admins only (middleware/icAdminAuth.js).
//
// The public POST is the one route here a stranger can write through, so it
// keeps only the fields the form has, caps every length, and accepts nothing
// but a PNG data URL as a signature — that value ends up in an <img src>.
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_MAX = 200;
const MAX_ROWS = 50;
const MAX_CELLS = 5;
const SIG_MAX_LENGTH = 1024 * 1024;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const PDF_MAX_BYTES = 5 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXT_FIELDS = [
  "name", "street", "city", "state", "zip", "ein", "dl", "initials",
  "signerName", "signerTitle", "carrierName", "carrierTitle", "carrierInitials",
  "effDate", "effTime", "exeDate", "exeTime", "ackDate", "ackTime",
  "rateLocation", "rateEffective", "fileName",
];

const text = (value) => String(value ?? "").trim().slice(0, TEXT_MAX);

const rows = (value) =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_ROWS)
    .map((row) => (Array.isArray(row) ? row : []).slice(0, MAX_CELLS).map(text))
    .filter((row) => row.some(Boolean));

const signature = (value) =>
  typeof value === "string" && value.length <= SIG_MAX_LENGTH && PNG_DATA_URL.test(value)
    ? value
    : undefined;

const sigMode = (value) => (value === "type" ? "type" : "draw");

const email = (value) => {
  const e = text(value).toLowerCase();
  return EMAIL.test(e) ? e : undefined;
};

// The PDF the form built, base64 encoded, to attach to the emailed copies. It
// is mailed, not stored. Anything that is not a PDF is dropped, not attached.
const pdfAttachment = (value) => {
  if (typeof value !== "string" || value.length > (PDF_MAX_BYTES * 4) / 3 + 4) return null;
  const buf = Buffer.from(value, "base64");
  return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
};

const newAgreementId = () =>
  "ICA-" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();

// The id the form and the panel use is the readable agreementId, not _id.
const byId = (id) => ({ agreementId: String(id) });

// List rows carry whether each signature exists, not the images themselves.
const toListItem = (doc) => {
  const { sigs, _id, __v, ...rest } = doc;
  return {
    ...rest,
    id: doc.agreementId,
    hasSig: { contractor: !!sigs?.contractor, carrier: !!sigs?.carrier },
  };
};

const toDetail = (doc) => {
  const { _id, __v, ...rest } = doc;
  return { ...rest, id: doc.agreementId };
};

// @route POST /api/ic-agreements   (public)
const createAgreement = async (req, res) => {
  try {
    const body = req.body || {};
    const data = {};
    TEXT_FIELDS.forEach((field) => { data[field] = text(body[field]); });

    if (!data.name) {
      return res.status(400).json({ message: "Contractor legal name is required." });
    }

    const agreement = await IcAgreement.create({
      ...data,
      contractorEmail: email(body.email),
      agreementId: newAgreementId(),
      sameExec: !!body.sameExec,
      sameAck: !!body.sameAck,
      equipment: rows(body.equipment),
      rates: rows(body.rates),
      sigModes: { contractor: sigMode(body.sigModes?.contractor), carrier: sigMode(body.sigModes?.carrier) },
      sigs: { contractor: signature(body.sigs?.contractor), carrier: signature(body.sigs?.carrier) },
      submittedIp: req.ip,
      userAgent: text(req.headers["user-agent"]),
    });

    res.status(201).json({
      id: agreement.agreementId,
      createdAt: agreement.createdAt,
      emailed: !!agreement.contractorEmail,
      message: `Agreement saved for ${agreement.name}.`,
    });

    // After answering: the agreement is safe whatever the mail server does.
    sendAgreementCopies(agreement, pdfAttachment(body.pdf));
  } catch (error) {
    console.error("[IC Agreement] create failed:", error);
    res.status(500).json({ message: "Could not save the agreement. Please try again." });
  }
};

// @route GET /api/ic-agreements   (IC admin)
const listAgreements = async (req, res) => {
  try {
    const docs = await IcAgreement.find().sort({ createdAt: -1 }).lean();
    res.json({ agreements: docs.map(toListItem) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route GET /api/ic-agreements/:id   (IC admin)
const getAgreement = async (req, res) => {
  try {
    const doc = await IcAgreement.findOne(byId(req.params.id)).lean();
    if (!doc) return res.status(404).json({ message: "Agreement not found." });
    res.json({ agreement: toDetail(doc) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route DELETE /api/ic-agreements/:id   (IC admin)
const deleteAgreement = async (req, res) => {
  try {
    const doc = await IcAgreement.findOneAndDelete(byId(req.params.id));
    if (!doc) return res.status(404).json({ message: "Agreement not found." });
    console.log(`[IC Agreement] ${doc.agreementId} (${doc.name}) deleted by ${req.icAdmin.email}`);
    res.json({ message: "Agreement deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAgreement,
  listAgreements,
  getAgreement,
  deleteAgreement,
};
