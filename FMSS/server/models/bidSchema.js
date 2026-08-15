const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");

const bidSchema = new mongoose.Schema({
  loadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Load",
    required: true,
  },
  fleetOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FleetOwner",
    required: true,
  },
  deliveryDate: {          
    type: Date,
    //required:true
  },
  amount: Number,
  status: {
    type: String,
    enum: ["ACTIVE", "WINNING", "REJECTED"],
    default: "ACTIVE",
  },
  submittedAt: {          
    type: Date,
    default: Date.now,
  },
  revisedAt: Date, // ✅ Track when bid was revised

  // Staff counter-offer. The proposed amount sits here until the fleet owner
  // answers — `amount` above is only rewritten once they accept, so a bid never
  // changes under the bidder. Accepting awards the load automatically.
  negotiation: {
    amount: Number,
    status: {
      type: String,
      enum: ["NONE", "PENDING", "ACCEPTED", "DECLINED"],
      default: "NONE",
    },
    // What the bid stood at when the offer was made, for an audit trail.
    previousAmount: Number,
    offeredAt: Date,
    respondedAt: Date,
  },

}, { timestamps: true });

// prevent duplicate bids
bidSchema.index({ loadId: 1, fleetOwnerId: 1 }, { unique: true });


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
bidSchema.plugin(tenantScope, { modelName: "Bid" });

module.exports =
  mongoose.models.Bid || mongoose.model("Bid", bidSchema);