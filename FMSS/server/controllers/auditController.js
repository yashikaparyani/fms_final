const mongoose = require("mongoose");
const LoadAudit = require("../models/LoadAudit");
const Load = require("../models/Load");
const User = require("../models/User");
const { record, actorFrom } = require("../services/auditService");
const { findCarrierFor } = require("../utils/carrierAccount");

// ─── Audit trail & notes ──────────────────────────────────────────────────────
// Reading a load's history, and writing the notes that make up part of it.
//
// The one rule that shapes every handler here: an INTERNAL entry is internal.
// A dispatcher's note is candid precisely because the customer will not read it
// — "customer disputes every detention charge, get the timestamps in writing" is
// useful and is not something to show the customer. So a client or carrier
// reading a load's trail sees only what was deliberately marked SHARED, and the
// filter is applied in the query rather than after it, so an internal note is
// never loaded into a response object in the first place.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const isOffice = (user) => ["staff", "admin"].includes(user?.role);

/**
 * Find the load, and prove this caller is entitled to its history.
 *
 * Everybody who can see a load can see its shared trail; only the back office
 * sees the internal one. Returns both the load and the visibility the caller
 * gets, so the handler never has to re-derive it.
 */
const loadForAudit = async (req) => {
  const load = await Load.findOne({ loadId: req.params.loadId });

  if (!load) {
    throw Object.assign(new Error("Load not found"), { status: 404 });
  }

  if (isOffice(req.user)) return { load, internal: true };

  if (req.user.role === "client") {
    const owns =
      load.creatorId?.toString() === req.user._id.toString() ||
      load.customer?.toString() === req.user._id.toString();

    if (!owns) {
      throw Object.assign(new Error("Not authorized"), { status: 403 });
    }
    return { load, internal: false };
  }

  // Carrier side — the carrier a driver drives for, resolved off the account.
  const carrier = await findCarrierFor(req.user, "_id");
  const assigned =
    carrier &&
    load.assignedFleetOwner?.fleetOwnerId?.toString() === carrier._id.toString();

  if (!assigned) {
    throw Object.assign(new Error("Not authorized"), { status: 403 });
  }

  return { load, internal: false };
};

const presentEntry = (entry) => ({
  _id: entry._id,
  kind: entry.kind,
  action: entry.action,
  summary: entry.summary,
  body: entry.body || "",
  changes: entry.changes || [],
  actorName: entry.actorName || "System",
  actorRole: entry.actorRole || "system",
  visibility: entry.visibility,
  source: entry.source,
  // Keyed off the entry's kind, not off whether a due date happens to be set.
  // A follow-up raised with no deadline and nobody named is still a follow-up,
  // and gating this on those fields would leave it with no "mark done" control
  // and no way to tell whether it was ever closed.
  followUp:
    entry.kind === "FOLLOW_UP"
      ? {
          dueAt: entry.followUp?.dueAt || null,
          assignedToName: entry.followUp?.assignedToName || "",
          resolvedAt: entry.followUp?.resolvedAt || null,
          resolvedByName: entry.followUp?.resolvedByName || "",
          resolutionNote: entry.followUp?.resolutionNote || "",
          overdue:
            !entry.followUp?.resolvedAt &&
            !!entry.followUp?.dueAt &&
            new Date(entry.followUp.dueAt) < new Date(),
        }
      : null,
  createdAt: entry.createdAt,
});

// @desc    A load's history, newest first
// @route   GET /api/loads/:loadId/audit
// @access  Private (office sees everything; client/carrier see shared entries)
const getLoadAudit = async (req, res) => {
  try {
    const { load, internal } = await loadForAudit(req);

    const filter = { load: load._id };

    // Applied in the query rather than after it: an internal note should never
    // be loaded into a response object that somebody later forgets to strip.
    if (!internal) filter.visibility = "SHARED";

    if (req.query.kind) {
      const kinds = String(req.query.kind).split(",").filter(Boolean);
      if (kinds.length) filter.kind = { $in: kinds };
    }

    if (String(req.query.notesOnly) === "true") {
      filter.kind = { $in: ["NOTE", "FOLLOW_UP"] };
    }

    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const entries = await LoadAudit.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Counts come from the same filter, so the chips never offer a category
    // that would come back empty for this caller.
    const counts = entries.reduce((acc, entry) => {
      acc[entry.kind] = (acc[entry.kind] || 0) + 1;
      return acc;
    }, {});

    res.json({
      loadId: load.loadId,
      canSeeInternal: internal,
      counts,
      openFollowUps: entries.filter(
        (e) => e.kind === "FOLLOW_UP" && !e.followUp?.resolvedAt,
      ).length,
      entries: entries.map(presentEntry),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Write a note or raise a follow-up on a load
// @route   POST /api/loads/:loadId/audit/notes
// @access  Private (staff, admin)
//
// Office-only. A note is the dispatcher's and administrator's working record;
// letting a customer write into the same trail would mean the trail is no longer
// a record of what the office did.
const addNote = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const body = trimmed(req.body.body);
    if (!body) {
      return res.status(400).json({ message: "Write something first." });
    }

    const wantsFollowUp = !!req.body.followUp || !!req.body.dueAt;

    // SHARED has to be asked for. A note defaults to internal because that is
    // what a note is for, and the failure mode of the other default — a candid
    // remark quietly visible to the customer — is the expensive one.
    const visibility = req.body.visibility === "SHARED" ? "SHARED" : "INTERNAL";

    let followUp;
    if (wantsFollowUp) {
      let assignee = null;
      const assignedTo = trimmed(req.body.assignedTo);

      if (assignedTo) {
        if (!mongoose.isValidObjectId(assignedTo)) {
          return res.status(400).json({ message: "Not a valid user to assign to." });
        }
        assignee = await User.findOne({
          _id: assignedTo,
          role: { $in: ["staff", "admin"] },
          isDeleted: { $ne: true },
        });
        if (!assignee) {
          return res
            .status(404)
            .json({ message: "That staff member could not be found." });
        }
      }

      followUp = {
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
        assignedTo: assignee?._id,
        assignedToName: assignee
          ? [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") ||
            assignee.email
          : "",
      };
    }

    const entry = await record({
      load,
      kind: wantsFollowUp ? "FOLLOW_UP" : "NOTE",
      action: wantsFollowUp ? "load.follow_up" : "load.note",
      // The first line stands in as the headline so the timeline is scannable
      // without expanding every entry.
      summary: body.split("\n")[0].slice(0, 120),
      body,
      user: req.user,
      req,
      visibility,
      followUp,
    });

    if (!entry) {
      return res.status(500).json({ message: "The note could not be saved." });
    }

    res.status(201).json({
      message: wantsFollowUp ? "Follow-up raised." : "Note added.",
      entry: presentEntry(entry),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Close a follow-up
// @route   PUT /api/loads/:loadId/audit/notes/:entryId/resolve
// @access  Private (staff, admin)
//
// Resolved in place rather than by writing a second entry: "is this still
// outstanding" has to be answerable without replaying the whole trail. The
// original text is never touched — only the resolution is added.
const resolveFollowUp = async (req, res) => {
  try {
    const entry = await LoadAudit.findOne({
      _id: req.params.entryId,
      kind: "FOLLOW_UP",
    });

    if (!entry) {
      return res.status(404).json({ message: "Follow-up not found." });
    }

    if (entry.followUp?.resolvedAt) {
      return res.status(400).json({ message: "That follow-up is already closed." });
    }

    const { actorName } = actorFrom(req.user);

    entry.followUp.resolvedAt = new Date();
    entry.followUp.resolvedBy = req.user._id;
    entry.followUp.resolvedByName = actorName;
    entry.followUp.resolutionNote = trimmed(req.body.resolutionNote);

    await entry.save();

    res.json({
      message: "Follow-up closed.",
      entry: presentEntry(entry),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Everything one person did, across loads
// @route   GET /api/audit/by-user/:userId
// @access  Private (admin)
//
// The user-wise view. Separate from the per-load timeline because the question
// is different: not "what happened to this load" but "what has this person been
// doing", which is what an accountability review actually asks.
const getUserAudit = async (req, res) => {
  try {
    const filter = { actor: req.params.userId };

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (req.query.kind) {
      filter.kind = { $in: String(req.query.kind).split(",").filter(Boolean) };
    }

    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const entries = await LoadAudit.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      actorName: entries[0]?.actorName || "",
      total: entries.length,
      entries: entries.map((entry) => ({
        ...presentEntry(entry),
        loadId: entry.loadId,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Follow-ups still open, across every load
// @route   GET /api/audit/follow-ups
// @access  Private (staff, admin)
const getOpenFollowUps = async (req, res) => {
  try {
    const filter = {
      kind: "FOLLOW_UP",
      "followUp.resolvedAt": { $exists: false },
    };

    if (String(req.query.mine) === "true") {
      filter["followUp.assignedTo"] = req.user._id;
    }

    if (String(req.query.overdueOnly) === "true") {
      filter["followUp.dueAt"] = { $lt: new Date() };
    }

    const entries = await LoadAudit.find(filter)
      // Undated follow-ups sort last: something with a deadline is more urgent
      // than something without one, and ascending order would put nulls first.
      .sort({ "followUp.dueAt": 1, createdAt: -1 })
      .limit(300)
      .lean();

    const now = new Date();

    res.json({
      total: entries.length,
      overdue: entries.filter(
        (e) => e.followUp?.dueAt && new Date(e.followUp.dueAt) < now,
      ).length,
      entries: entries.map((entry) => ({
        ...presentEntry(entry),
        loadId: entry.loadId,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getLoadAudit,
  addNote,
  resolveFollowUp,
  getUserAudit,
  getOpenFollowUps,
};
