const Load = require("../models/Load");
const { runUnscoped } = require("../utils/tenantContext");
const { recordCommunication } = require("../services/auditService");
const { sendStreetTurnSigned } = require("../services/emailService");
const {
  buildStreetTurnAgreement,
} = require("../services/streetTurnAgreementService");
const User = require("../models/User");

/**
 * The street turn partner's side of a handover.
 *
 * Confirming a street turn tells the partner it is happening. It does not prove
 * they accepted the container — and on a street turn the container leaves our
 * driver's custody, so "we emailed them" is not a record anyone wants to rely
 * on in a dispute. The partner signs it back from a one-off emailed link.
 *
 * They have no account here, so every route in this file is public and the
 * token is the whole authorisation. It is looked up by hash, unscoped by
 * necessity — an unauthenticated caller has no active location to scope by, and
 * the token resolves to exactly one load.
 */

const trimmed = (value) => String(value || "").trim();

/**
 * The signer's address, as evidence rather than as identification.
 *
 * `x-forwarded-for` is read first and `req.ip` is the fallback: behind nginx
 * Express only reports the real client on `req.ip` once `trust proxy` is set
 * (it is — see index.js), and the header is what a proxy that does not set it
 * leaves behind.
 */
const clientIp = (req) =>
  trimmed(req.headers["x-forwarded-for"]?.split(",")[0]) || trimmed(req.ip);

const clientUserAgent = (req) => String(req.headers["user-agent"] || "").slice(0, 200);

/** Resolves the load a signing token belongs to, or why it cannot be used. */
const loadForToken = async (token) => {
  const raw = trimmed(token);
  if (!raw) return { error: "NOT_FOUND" };

  const tokenHash = Load.hashStreetTurnToken(raw);

  const load = await runUnscoped(() =>
    Load.findOne({ "streetTurn.confirmationTokenHash": tokenHash }).select(
      "+streetTurn.confirmationTokenHash",
    ),
  );

  if (!load) return { error: "NOT_FOUND" };

  const expiresAt = load.streetTurn?.confirmationTokenExpiresAt;
  if (expiresAt && expiresAt < new Date()) {
    return { error: "EXPIRED", load };
  }

  return { load };
};

/**
 * What the partner sees before signing.
 *
 * The whole agreement, because that is what they are signing — a page that
 * showed a summary and a signature box would be asking someone to execute a
 * document they were never shown. Built by the same service that builds the
 * emailed copy, so the two cannot say different things.
 *
 * Deliberately narrow on everything else: the container, the equipment and the
 * two parties. No customer, no rate, none of the load's commercial detail.
 */
const publicView = (load) => {
  const streetTurn = load.streetTurn || {};
  const signature = streetTurn.partnerSignature || {};

  return {
    loadId: load.loadId,
    agreement: buildStreetTurnAgreement({ load, streetTurn }),
    note: streetTurn.note || "",
    confirmedAt: streetTurn.confirmedAt || null,
    alreadySigned: !!signature.signedAt,
    signedAt: signature.signedAt || null,
    signedName: signature.signedName || "",
    signedTitle: signature.signedTitle || "",
  };
};

// @desc    The street turn a partner has been asked to acknowledge
// @route   GET /api/street-turn/public/:token
// @access  Public (token)
const getPublicStreetTurn = async (req, res) => {
  try {
    const { load, error } = await loadForToken(req.params.token);

    if (error === "NOT_FOUND") {
      return res.status(404).json({
        message: "This link is not valid. Ask the office to send a new one.",
        code: "INVALID_TOKEN",
      });
    }

    if (error === "EXPIRED") {
      return res.status(410).json({
        message: "This link has expired. Ask the office to send a new one.",
        code: "TOKEN_EXPIRED",
      });
    }

    res.json(publicView(load));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Record the partner's signature on a street turn
// @route   POST /api/street-turn/public/:token/sign
// @access  Public (token)
const signPublicStreetTurn = async (req, res) => {
  try {
    const { load, error } = await loadForToken(req.params.token);

    if (error === "NOT_FOUND") {
      return res.status(404).json({
        message: "This link is not valid. Ask the office to send a new one.",
        code: "INVALID_TOKEN",
      });
    }

    if (error === "EXPIRED") {
      return res.status(410).json({
        message: "This link has expired. Ask the office to send a new one.",
        code: "TOKEN_EXPIRED",
      });
    }

    // Signing twice would overwrite the first execution with a second one and
    // leave no trace of the first. One signature, and re-opening the link shows
    // it rather than inviting another.
    if (load.streetTurn?.partnerSignature?.signedAt) {
      return res.status(409).json({
        message: "This street turn has already been signed.",
        code: "ALREADY_SIGNED",
        ...publicView(load),
      });
    }

    const signedName = trimmed(req.body.signedName);
    const signedTitle = trimmed(req.body.signedTitle);
    const signatureData = trimmed(req.body.signatureData);

    if (!signedName || !signedTitle) {
      return res
        .status(400)
        .json({ message: "Your name and title are both required." });
    }

    if (!signatureData) {
      return res.status(400).json({ message: "A signature is required." });
    }

    load.streetTurn.partnerSignature = {
      signedName,
      signedTitle,
      company: trimmed(req.body.company) || load.streetTurn.deliveryPartner || "",
      signatureData,
      signedAt: new Date(),
      note: trimmed(req.body.note),
      signedIp: clientIp(req),
      signedUserAgent: clientUserAgent(req),
    };

    // Spent on use. The link acknowledged this handover and nothing else.
    load.streetTurn.confirmationTokenHash = undefined;
    load.streetTurn.confirmationTokenExpiresAt = undefined;

    await runUnscoped(() => load.save());

    // The signature is the answer to "did they take it?", so it belongs in the
    // load's own history, not only in this document.
    await recordCommunication({
      load,
      summary: `Street turn signed by ${signedName} (${load.streetTurn.deliveryPartner || "street turn partner"})`,
      body:
        `Signed by ${signedName}, ${signedTitle}` +
        (load.streetTurn.partnerSignature.company
          ? ` of ${load.streetTurn.partnerSignature.company}`
          : "") +
        `. Recorded from IP ${load.streetTurn.partnerSignature.signedIp || "unknown"}.` +
        (load.streetTurn.partnerSignature.note
          ? `\nPartner note: ${load.streetTurn.partnerSignature.note}`
          : ""),
      user: null,
      req,
    });

    // The office asked for this signature; they should not have to poll for it.
    try {
      const admins = await runUnscoped(() =>
        User.find({ role: "admin", isActive: true }).select("email").lean(),
      );

      await sendStreetTurnSigned({
        load,
        streetTurn: load.streetTurn,
        signature: load.streetTurn.partnerSignature,
        recipients: admins.map((admin) => admin.email).filter(Boolean),
      });
    } catch {
      // A failed notification must not undo a signature that was given.
    }

    res.json({
      message: "Thank you — your acknowledgement has been recorded.",
      ...publicView(load),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getPublicStreetTurn,
  signPublicStreetTurn,
  loadForToken,
  clientIp,
  clientUserAgent,
};
