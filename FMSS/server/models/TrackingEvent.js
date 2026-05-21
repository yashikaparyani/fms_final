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

module.exports = mongoose.model("TrackingEvent", trackingEventSchema);
