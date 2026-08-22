const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { runUnscoped } = require("../utils/tenantContext");

/**
 * Office announcements: the notification blast and the marquee.
 *
 * See models/Announcement.js for why both live on one record.
 */

const ROLES = ["admin", "staff", "client", "fleetOwner", "driver"];

const trimmed = (value) => String(value ?? "").trim();

const cleanRoles = (roles) => {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.filter((role) => ROLES.includes(role)))];
};

/**
 * Creates one Notification per targeted user.
 *
 * Written in bulk rather than one save per user: a blast to every client on a
 * busy install is thousands of rows, and issuing thousands of round trips to
 * announce scheduled maintenance is how the announcement becomes the outage.
 *
 * Unscoped because the audience is a role, not a branch — see the model.
 */
const fanOutNotifications = async (announcement) => {
  const roles = announcement.roles?.length ? announcement.roles : ROLES;

  const recipients = await runUnscoped(() =>
    User.find({ role: { $in: roles }, isActive: { $ne: false }, isDeleted: { $ne: true } })
      .select("_id role")
      .lean(),
  );

  if (!recipients.length) return 0;

  const rows = recipients.map((user) => ({
    recipient: user._id,
    recipientRole: user.role,
    type: "ANNOUNCEMENT",
    title: announcement.title || "Announcement",
    message: announcement.message,
  }));

  await runUnscoped(() => Notification.insertMany(rows, { ordered: false }));

  return rows.length;
};

// @desc    Everything the office has posted
// @route   GET /api/announcements
// @access  Private (staff, admin)
const listAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Post an announcement — marquee, notification, or both
// @route   POST /api/announcements
// @access  Private (staff, admin)
const createAnnouncement = async (req, res) => {
  try {
    const message = trimmed(req.body.message);
    if (!message) {
      return res.status(400).json({ message: "A message is required." });
    }

    const marquee = req.body.marquee !== false;
    const notify = !!req.body.notify;

    if (!marquee && !notify) {
      return res.status(400).json({
        message:
          "Choose at least one way to deliver this — the marquee, a notification, or both.",
      });
    }

    const announcement = await Announcement.create({
      title: trimmed(req.body.title),
      message,
      roles: cleanRoles(req.body.roles),
      marquee,
      notify,
      tone: ["info", "success", "warning", "danger"].includes(req.body.tone)
        ? req.body.tone
        : "info",
      link: trimmed(req.body.link),
      linkLabel: trimmed(req.body.linkLabel),
      isActive: req.body.isActive !== false,
      startsAt: req.body.startsAt || undefined,
      endsAt: req.body.endsAt || undefined,
      createdBy: req.user._id,
    });

    // The blast happens once, at creation. A failure here must not lose the
    // announcement itself — the marquee is still up, and the office can see
    // that nobody was notified and post again.
    let notifiedCount = 0;
    let notifyError = null;

    if (notify) {
      try {
        notifiedCount = await fanOutNotifications(announcement);
        announcement.notifiedAt = new Date();
        announcement.notifiedCount = notifiedCount;
        await announcement.save();
      } catch (error) {
        notifyError = error.message;
      }
    }

    res.status(201).json({
      message: notifyError
        ? `Posted, but the notification did not go out (${notifyError}).`
        : notify
          ? `Posted and sent to ${notifiedCount} ${notifiedCount === 1 ? "person" : "people"}.`
          : "Posted.",
      announcement,
      notifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Edit an announcement
// @route   PUT /api/announcements/:id
// @access  Private (staff, admin)
//
// Editing never re-notifies. The notification was a moment that already
// happened; changing the wording afterwards cannot un-send it, and re-sending
// on every edit would punish anyone fixing a typo.
const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const fields = ["title", "message", "link", "linkLabel", "tone"];
    for (const field of fields) {
      if (req.body[field] !== undefined) announcement[field] = trimmed(req.body[field]);
    }

    if (req.body.roles !== undefined) announcement.roles = cleanRoles(req.body.roles);
    if (req.body.isActive !== undefined) announcement.isActive = !!req.body.isActive;
    if (req.body.marquee !== undefined) announcement.marquee = !!req.body.marquee;
    if (req.body.startsAt !== undefined) announcement.startsAt = req.body.startsAt || undefined;
    if (req.body.endsAt !== undefined) announcement.endsAt = req.body.endsAt || undefined;

    if (!trimmed(announcement.message)) {
      return res.status(400).json({ message: "A message is required." });
    }

    await announcement.save();
    res.json({ message: "Announcement updated", announcement });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove an announcement
// @route   DELETE /api/announcements/:id
// @access  Private (staff, admin)
const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    res.json({ message: "Announcement removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The marquee for whoever is asking
// @route   GET /api/announcements/marquee
// @access  Private (any signed-in user)
const getMarquee = async (req, res) => {
  try {
    const announcements = await Announcement.find(
      Announcement.liveFilter(req.user.role),
    )
      .select("title message tone link linkLabel createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ announcements });
  } catch (error) {
    // The marquee is decoration on top of the app, not the app. A failure here
    // must not take a dashboard down with it.
    res.json({ announcements: [], error: error.message });
  }
};

module.exports = {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getMarquee,
};
