const TrackingEvent = require("../models/TrackingEvent");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");

/**
 * Which trucks are near a pickup, and who they work for.
 *
 * Positions come from the reports drivers' phones already send while running a
 * trip — the same feed behind the Driver Locations map. Nothing new is asked of
 * a driver to make instant dispatch work.
 *
 * Distance is computed in JS rather than with a $near query. The positions live
 * on TrackingEvent as plain lat/lng numbers with no 2dsphere index, and adding
 * one would mean reshaping every stored coordinate into GeoJSON and migrating
 * the collection. A branch has tens of drivers, not tens of thousands, so the
 * arithmetic is not what makes this slow — and the "latest event per driver"
 * grouping has to happen either way.
 */

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in miles.
 *
 * Haversine rather than a flat-earth approximation: at a 100-mile radius across
 * the continental US the two disagree by enough to include or exclude a truck,
 * and "the system said he was in range" is not a conversation worth having.
 */
const distanceMiles = (a, b) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Drivers within `radiusMiles` of a point, nearest first, with their carrier.
 *
 * Only positions newer than `maxAgeHours` count. An older one is not evidence
 * of where a truck is now — a driver who finished a run last week is not "near"
 * anything, and offering their carrier a load on that basis wastes everybody's
 * time and teaches them to ignore the messages.
 *
 * @returns {Promise<Array<{driver, fleetOwner, distanceMiles, recordedAt, isLive}>>}
 */
const findNearbyDrivers = async ({
  latitude,
  longitude,
  radiusMiles,
  maxAgeHours,
  excludeFleetOwnerIds = [],
}) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [];
  }

  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  // Latest position per driver, within the age cutoff. Sorting before grouping
  // and taking $first is the standard "latest per key" shape — the same one
  // getDriverLocations uses.
  const latest = await TrackingEvent.aggregate([
    { $match: { driver: { $ne: null }, recordedAt: { $gte: since } } },
    { $sort: { recordedAt: -1 } },
    {
      $group: {
        _id: "$driver",
        coordinates: { $first: "$coordinates" },
        recordedAt: { $first: "$recordedAt" },
        load: { $first: "$load" },
      },
    },
  ]);

  if (!latest.length) return [];

  const inRange = latest
    .map((row) => ({
      driverId: row._id,
      recordedAt: row.recordedAt,
      distanceMiles: distanceMiles(
        { latitude, longitude },
        { latitude: row.coordinates.latitude, longitude: row.coordinates.longitude },
      ),
    }))
    .filter((row) => row.distanceMiles <= radiusMiles);

  if (!inRange.length) return [];

  // Only active drivers, and only ones who belong to a carrier — a position
  // with no carrier behind it is nobody we can offer a load to.
  const drivers = await Driver.find({
    _id: { $in: inRange.map((r) => r.driverId) },
    active: { $ne: false },
    fleetOwner: { $ne: null },
  })
    .select("name driverCode phone email fleetOwner")
    .lean();

  const driverById = new Map(drivers.map((d) => [String(d._id), d]));

  const excluded = new Set(excludeFleetOwnerIds.map(String));

  const carrierIds = [
    ...new Set(
      drivers
        .map((d) => String(d.fleetOwner))
        .filter((id) => !excluded.has(id)),
    ),
  ];

  if (!carrierIds.length) return [];

  const carriers = await FleetOwner.find({
    _id: { $in: carrierIds },
    isActive: { $ne: false },
  })
    .select("carrierName fleetOwnerCode email phone userId")
    .lean();

  const carrierById = new Map(carriers.map((c) => [String(c._id), c]));

  return inRange
    .map((row) => {
      const driver = driverById.get(String(row.driverId));
      if (!driver) return null;

      const fleetOwner = carrierById.get(String(driver.fleetOwner));
      if (!fleetOwner) return null;

      return {
        driver,
        fleetOwner,
        distanceMiles: Math.round(row.distanceMiles * 10) / 10,
        recordedAt: row.recordedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
};

/**
 * The same search, collapsed to one row per carrier.
 *
 * A carrier with four trucks near the pickup is still one dispatcher reading
 * one message, so they are offered the load once — represented by their closest
 * driver, since that is the truck they would most likely send.
 */
const findNearbyCarriers = async (options) => {
  const nearby = await findNearbyDrivers(options);

  const byCarrier = new Map();

  nearby.forEach((row) => {
    const key = String(row.fleetOwner._id);
    // Already sorted nearest-first, so the first entry per carrier is their
    // closest truck and later ones are further away.
    if (!byCarrier.has(key)) {
      byCarrier.set(key, { ...row, driverCount: 1 });
    } else {
      byCarrier.get(key).driverCount += 1;
    }
  });

  return [...byCarrier.values()];
};

module.exports = { findNearbyDrivers, findNearbyCarriers, distanceMiles };
