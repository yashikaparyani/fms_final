const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const TrackingEvent = require("../models/TrackingEvent");
const {
  publishTrackingUpdate,
  subscribeToLoadTracking,
} = require("../services/trackingBroadcaster");

const ACTIVE_TRACKING_STATUSES = new Set([
  "READY_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DRIVER_ON_WAITING",
  "DROP_IN_WAREHOUSE",
]);

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLocationPayload = (body = {}) => {
  const source = body.coords || body.location || body;
  const latitude = toNumberOrNull(source.latitude ?? source.lat);
  const longitude = toNumberOrNull(source.longitude ?? source.lng ?? source.lon);

  if (latitude === null || longitude === null) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: toNumberOrNull(source.accuracy),
    altitude: toNumberOrNull(source.altitude),
    heading: toNumberOrNull(source.heading),
    speed: toNumberOrNull(source.speed),
    recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    source: body.source || "mobile",
    batteryLevel: toNumberOrNull(body.batteryLevel),
  };
};

const publicLocation = (event) => ({
  id: event._id,
  latitude: event.coordinates.latitude,
  longitude: event.coordinates.longitude,
  accuracy: event.coordinates.accuracy,
  altitude: event.coordinates.altitude,
  heading: event.coordinates.heading,
  speed: event.coordinates.speed,
  batteryLevel: event.batteryLevel,
  recordedAt: event.recordedAt,
  source: event.source,
});

const getAssignedFleetOwner = async (req, load) => {
  const fleetOwner = await FleetOwner.findOne({ userId: req.user._id }).select(
    "_id carrierName",
  );

  if (!fleetOwner) return null;

  const assignedId = load.assignedFleetOwner?.fleetOwnerId;
  if (!assignedId || assignedId.toString() !== fleetOwner._id.toString()) {
    return null;
  }

  return fleetOwner;
};

const canViewTracking = async (req, load) => {
  if (["staff", "admin"].includes(req.user.role)) return true;

  if (req.user.role === "client") {
    return (
      load.creatorId?.toString() === req.user._id.toString() ||
      load.customer?.toString() === req.user._id.toString()
    );
  }

  if (req.user.role === "fleetOwner") {
    return Boolean(await getAssignedFleetOwner(req, load));
  }

  return false;
};

const createTrackingEvent = async ({ load, fleetOwner, req, location }) => {
  const event = await TrackingEvent.create({
    load: load._id,
    loadId: load.loadId,
    fleetOwner: fleetOwner?._id || load.assignedFleetOwner?.fleetOwnerId,
    user: req.user._id,
    coordinates: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      altitude: location.altitude,
      heading: location.heading,
      speed: location.speed,
    },
    batteryLevel: location.batteryLevel,
    recordedAt: location.recordedAt,
    source: location.source,
  });

  return event;
};

const applyLiveLocationToLoad = (load, location, req, overrides = {}) => {
  load.liveTracking = load.liveTracking || {};
  load.liveTracking.status = overrides.status || "ACTIVE";
  load.liveTracking.lastHeartbeatAt = new Date();
  load.liveTracking.lastLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    altitude: location.altitude,
    heading: location.heading,
    speed: location.speed,
    recordedAt: location.recordedAt,
    source: location.source,
  };

  if (!load.liveTracking.startedAt) {
    load.liveTracking.startedAt = new Date();
  }
  if (!load.liveTracking.startedBy) {
    load.liveTracking.startedBy = req.user._id;
  }
};

const getTrackingSnapshotPayload = async (load, limit = 100) => {
  const events = await TrackingEvent.find({ load: load._id })
    .sort({ recordedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();

  return {
    loadId: load.loadId,
    status: load.liveTracking?.status || "NOT_STARTED",
    required: Boolean(load.liveTracking?.isRequired),
    startedAt: load.liveTracking?.startedAt,
    stoppedAt: load.liveTracking?.stoppedAt,
    lastHeartbeatAt: load.liveTracking?.lastHeartbeatAt,
    lastLocation: load.liveTracking?.lastLocation || null,
    recentLocations: events.reverse().map(publicLocation),
  };
};

const startTracking = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const fleetOwner = await getAssignedFleetOwner(req, load);
    if (!fleetOwner) {
      return res.status(403).json({
        message: "Only the assigned fleet owner can start live tracking",
      });
    }

    if (!ACTIVE_TRACKING_STATUSES.has(load.transportStatus)) {
      return res.status(400).json({
        message:
          "Live tracking can start only after the assigned load is confirmed.",
      });
    }

    const location = normalizeLocationPayload(req.body);
    if (!location) {
      return res.status(400).json({
        message: "Live tracking requires a valid current GPS location.",
      });
    }

    load.liveTracking = load.liveTracking || {};
    load.liveTracking.status = "ACTIVE";
    load.liveTracking.isRequired = true;
    load.liveTracking.startedAt = load.liveTracking.startedAt || new Date();
    load.liveTracking.startedBy = req.user._id;
    load.liveTracking.stoppedAt = undefined;
    load.liveTracking.stoppedBy = undefined;
    load.liveTracking.consent = {
      grantedAt: new Date(),
      platform: req.body.platform || "mobile",
    };
    applyLiveLocationToLoad(load, location, req);

    await load.save();
    const event = await createTrackingEvent({ load, fleetOwner, req, location });
    const payload = publicLocation(event);

    publishTrackingUpdate(load.loadId, "tracking_started", {
      status: load.liveTracking.status,
      location: payload,
    });
    publishTrackingUpdate(load.loadId, "location", payload);

    res.status(200).json({
      success: true,
      message: "Live tracking started",
      data: await getTrackingSnapshotPayload(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateLocation = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const fleetOwner = await getAssignedFleetOwner(req, load);
    if (!fleetOwner) {
      return res.status(403).json({
        message: "Only the assigned fleet owner can update live location",
      });
    }

    if (load.liveTracking?.status !== "ACTIVE") {
      return res.status(409).json({
        message: "Live tracking is not active for this load",
      });
    }

    const location = normalizeLocationPayload(req.body);
    if (!location) {
      return res.status(400).json({
        message: "A valid latitude and longitude are required.",
      });
    }

    applyLiveLocationToLoad(load, location, req);
    await load.save();

    const event = await createTrackingEvent({ load, fleetOwner, req, location });
    const payload = publicLocation(event);
    publishTrackingUpdate(load.loadId, "location", payload);

    res.status(200).json({
      success: true,
      message: "Location synced",
      data: payload,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const stopTracking = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const fleetOwner = await getAssignedFleetOwner(req, load);
    if (!fleetOwner) {
      return res.status(403).json({
        message: "Only the assigned fleet owner can stop live tracking",
      });
    }

    load.liveTracking = load.liveTracking || {};
    load.liveTracking.status = "STOPPED";
    load.liveTracking.stoppedAt = new Date();
    load.liveTracking.stoppedBy = req.user._id;
    await load.save();

    const snapshot = await getTrackingSnapshotPayload(load);
    publishTrackingUpdate(load.loadId, "tracking_stopped", snapshot);

    res.status(200).json({
      success: true,
      message: "Live tracking stopped",
      data: snapshot,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTrackingSnapshot = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    if (!(await canViewTracking(req, load))) {
      return res.status(403).json({ message: "Not authorized to track this load" });
    }

    res.json(await getTrackingSnapshotPayload(load, req.query.limit));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const streamTracking = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    if (!(await canViewTracking(req, load))) {
      return res.status(403).json({ message: "Not authorized to track this load" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const snapshot = await getTrackingSnapshotPayload(load);
    res.write(
      `data: ${JSON.stringify({
        type: "snapshot",
        data: snapshot,
        sentAt: new Date().toISOString(),
      })}\n\n`,
    );

    const unsubscribe = subscribeToLoadTracking(load.loadId, res);
    req.on("close", unsubscribe);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
    res.end();
  }
};

module.exports = {
  startTracking,
  updateLocation,
  stopTracking,
  getTrackingSnapshot,
  streamTracking,
  normalizeLocationPayload,
};
