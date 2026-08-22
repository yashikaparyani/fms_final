const mongoose = require("mongoose");

/**
 * A message the office puts in front of users.
 *
 * Two things share this model because they are the same editorial act with two
 * deliveries: a one-off push into everyone's notification bell, and a standing
 * marquee across the top of the app. Writing "systems down 6–8pm" should not
 * mean composing it twice.
 *
 *   `notify: true`  — fans out a Notification row per targeted user, once, when
 *                     the announcement is created. It is a moment, not a state.
 *   `marquee: true` — shown live to every targeted user while it is active and
 *                     inside its date window. It is a state, not a moment.
 *
 * Deliberately NOT tenant-scoped. An announcement is addressed to people by
 * role, and the office writing one is telling everybody — scoping it to the
 * author's active branch would silently narrow "all drivers" to "the drivers at
 * the branch I happened to have selected", which is the opposite of what
 * somebody writing an announcement means.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 120 },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // Who it is addressed to. Empty means everybody — an announcement with no
    // audience would be pointless, so absence reads as "all" rather than "none".
    roles: [
      {
        type: String,
        enum: ["admin", "staff", "client", "fleetOwner", "driver"],
      },
    ],

    // Delivery
    notify: { type: Boolean, default: false },
    marquee: { type: Boolean, default: true },

    // Colours the marquee. Not decoration — an outage and a policy note should
    // not look identical when someone is scanning past them.
    tone: {
      type: String,
      enum: ["info", "success", "warning", "danger"],
      default: "info",
    },

    // Optional call to action.
    link: { type: String, trim: true },
    linkLabel: { type: String, trim: true },

    isActive: { type: Boolean, default: true },

    // Optional window. A marquee people cannot turn off is one they stop
    // reading, so an announcement can be given an expiry when it is written
    // rather than relying on somebody remembering to take it down.
    startsAt: Date,
    endsAt: Date,

    // Set once the notification fan-out has run, so editing an announcement
    // later can never re-notify everybody.
    notifiedAt: Date,
    notifiedCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

announcementSchema.index({ isActive: 1, marquee: 1, startsAt: 1, endsAt: 1 });

/** Whether this should be on screen right now. */
announcementSchema.methods.isLive = function isLive(now = new Date()) {
  if (!this.isActive || !this.marquee) return false;
  if (this.startsAt && this.startsAt > now) return false;
  if (this.endsAt && this.endsAt < now) return false;
  return true;
};

/** The query for everything a given role should currently see. */
announcementSchema.statics.liveFilter = (role, now = new Date()) => ({
  isActive: true,
  marquee: true,
  $and: [
    { $or: [{ roles: { $size: 0 } }, { roles: role }] },
    { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
  ],
});

module.exports = mongoose.model("Announcement", announcementSchema);
