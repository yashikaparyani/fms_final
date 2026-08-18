const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");

const trackingEventSchema = new mongoose.Schema(
  {
    load: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
      required: true,
      index: true,
    },
    loadId: {
      type: String,
      required: true,
      index: true,
    },
    fleetOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetOwner",
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The person in the cab. A carrier does not drive — their drivers do — so a
    // position on a map belongs to a driver, and the carrier is only who that
    // driver works for. Left unset when the office or a carrier account records
    // a position administratively, which is exactly the case worth being able
    // to tell apart afterwards.
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      index: true,
    },
    driverName: { type: String, trim: true },
    coordinates: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      accuracy: Number,
      altitude: Number,
      heading: Number,
      speed: Number,
    },
    batteryLevel: Number,
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    source: {
      type: String,
      enum: ["mobile", "web", "server"],
      default: "mobile",
    },
  },
  { timestamps: true },
);

trackingEventSchema.index({ load: 1, recordedAt: -1 });


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
trackingEventSchema.plugin(tenantScope, { modelName: "TrackingEvent" });

module.exports = mongoose.model("TrackingEvent", trackingEventSchema);
