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
        // Sent by the office from the announcements screen rather than raised
        // by something happening to a load, so it carries no load reference.
        "ANNOUNCEMENT",
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


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
notificationSchema.plugin(tenantScope, { modelName: "Notification" });

module.exports = mongoose.model("Notification", notificationSchema);