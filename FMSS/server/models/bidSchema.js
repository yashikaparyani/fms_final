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

}, { timestamps: true }); 

// prevent duplicate bids
bidSchema.index({ loadId: 1, fleetOwnerId: 1 }, { unique: true });

module.exports =
  mongoose.models.Bid || mongoose.model("Bid", bidSchema);