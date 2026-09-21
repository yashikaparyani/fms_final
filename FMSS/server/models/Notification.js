const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Role-based targeting (optional, for bulk sends)
    recipientRole: {
      type: String,
      enum: ["admin", "staff", "client", "fleetOwner", "driver"],
    },

    type: {
      type: String,
      enum: [
        "LOAD_CREATED",           
        "BIDDING_SCHEDULED",      
        "BIDDING_OPENED",        
        "BIDDING_CLOSED",         
        "BID_WON",                
        "BID_LOST",               
        "BID_NOT_PLACED",         
        "LOAD_STATUS_CHANGED",    
        "LOAD_REQUIRES_CHANGES",  
        "LOAD_VERIFIED",
        // A load marked delivered — to the office and the customer.
        "LOAD_DELIVERED",
        // Sent by the office from the announcements screen rather than raised
        // by something happening to a load, so it carries no load reference.
        "ANNOUNCEMENT",
        // Instant dispatch: a load offered to the carriers near its pickup, and
        // the answer once one of them takes it.
        "INSTANT_DISPATCH_OFFERED",
        "INSTANT_DISPATCH_TAKEN",
        "INSTANT_DISPATCH_ACCEPTED",
        "INSTANT_DISPATCH_EXPIRED",
        // Paperwork review — see config/paperwork.js. The first is the office
        // reminding itself that a delivered load has not been moved on; the
        // rest travel between the office and the carrier side.
        "PAPERWORK_DUE",
        "PAPERWORK_REMINDER",
        "PAPERWORK_SUBMITTED",
        "PAPERWORK_CHANGES_REQUESTED",
        "PAPERWORK_APPROVED",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    // The load this notification is about (if any)
    load: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
    },

    loadId: String, // human-readable "LD-0001"

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: Date,
  },
  { timestamps: true }
);

// Index for fast queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });


// ── A notification about a load lives where the load lives ─────────────────
// Registered before the tenant plugin so these run first. Without them the
// location came from whatever the acting user had selected in the header, which
// was wrong twice over: an admin viewing "All locations" could not change a
// load's status without the notification being refused, and one viewing
// Los Angeles while acting on a New York load would file the alert under
// Los Angeles, where New York's staff never see it.
//
// Looked up with skipTenantScope because the load is identified by id and the
// acting user's own location is exactly what must not decide the answer.
const loadLocations = async (loadIds) => {
  const ids = [...new Set(loadIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();

  const loads = await mongoose
    .model("Load")
    .find({ _id: { $in: ids } })
    .select("locationId")
    .setOptions({ skipTenantScope: true })
    .lean();

  return new Map(
    loads.filter((l) => l.locationId).map((l) => [String(l._id), l.locationId]),
  );
};

notificationSchema.pre("validate", async function locateByLoad() {
  if (this.locationId || !this.load) return;
  const found = await loadLocations([this.load]);
  const locationId = found.get(String(this.load));
  if (locationId) this.locationId = locationId;
});

notificationSchema.pre("insertMany", async function locateManyByLoad(docs) {
  const pending = (docs || []).filter((doc) => !doc.locationId && doc.load);
  if (!pending.length) return;

  const found = await loadLocations(pending.map((doc) => doc.load));
  for (const doc of pending) {
    const locationId = found.get(String(doc.load));
    if (locationId) doc.locationId = locationId;
  }
});

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
notificationSchema.plugin(tenantScope, { modelName: "Notification" });

module.exports = mongoose.model("Notification", notificationSchema);