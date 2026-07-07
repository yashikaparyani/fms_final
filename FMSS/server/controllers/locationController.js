// controllers/locationController.js
const LocationMaster = require("../models/LocationMaster");

/**
 * GET /api/locations/states
 * Returns all distinct states sorted alphabetically
 * Response: [{ stateAbbr, stateName }]
 */
const getStates = async (req, res) => {
  try {
    const states = await LocationMaster.aggregate([
      {
        $group: {
          _id: "$stateAbbr",
          stateName: { $first: "$stateName" },
        },
      },
      { $sort: { stateName: 1 } },
      {
        $project: {
          _id: 0,
          stateAbbr: "$_id",
          stateName: 1,
        },
      },
    ]);
    res.json(states);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/locations/cities?state=TX
 * Returns all cities for a given state abbreviation, sorted alphabetically
 * Response: [{ city, zip }]
 */
const getCities = async (req, res) => {
  const { state } = req.query;
  
  try {
    let query = {};
    if (state) {
      query.stateAbbr = state.toUpperCase();
    }
    
    // If state is not provided, fetch all cities across the US,
    // including their stateAbbr so the frontend can disambiguate (e.g. "Springfield, IL")
    const cities = await LocationMaster.find(
      query,
      { _id: 0, city: 1, zip: 1, stateAbbr: 1 }
    ).sort({ city: 1 });

    res.json(cities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/locations/zip?state=TX&city=Houston
 * Returns the default zip code for a city in a state
 * Response: { zip: "77001" }
 */
const getZip = async (req, res) => {
  const { state, city } = req.query;
  if (!state || !city) {
    return res.status(400).json({ message: "state and city query parameters are required" });
  }
  try {
    const record = await LocationMaster.findOne(
      { stateAbbr: state.toUpperCase(), city: new RegExp(`^${city}$`, "i") },
      { _id: 0, zip: 1 }
    );
    if (!record) {
      return res.json({ zip: "" });
    }
    res.json({ zip: record.zip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/locations/cities
 * Adds a user-supplied city to the location master so it becomes a
 * permanent option in the city dropdown for everyone.
 * Body: { stateAbbr, stateName, city, zip? }
 * Response: { city, stateAbbr, zip }  (the persisted record)
 */
const addCity = async (req, res) => {
  let { stateAbbr, stateName, city, zip } = req.body || {};

  if (!stateAbbr || !city || !city.trim()) {
    return res
      .status(400)
      .json({ message: "stateAbbr and city are required" });
  }

  stateAbbr = stateAbbr.trim().toUpperCase();
  city = city.trim();
  zip = (zip || "").trim();

  try {
    // Derive stateName if it wasn't supplied, using an existing entry for that state.
    if (!stateName) {
      const existing = await LocationMaster.findOne(
        { stateAbbr },
        { _id: 0, stateName: 1 }
      );
      stateName = existing?.stateName || stateAbbr;
    }

    // Idempotent: if the (state, city) pair already exists, return it as-is.
    const already = await LocationMaster.findOne({
      stateAbbr,
      city: new RegExp(`^${city}$`, "i"),
    });
    if (already) {
      return res.status(200).json({
        city: already.city,
        stateAbbr: already.stateAbbr,
        zip: already.zip,
      });
    }

    const record = await LocationMaster.create({
      stateAbbr,
      stateName,
      city,
      zip,
    });

    res.status(201).json({
      city: record.city,
      stateAbbr: record.stateAbbr,
      zip: record.zip,
    });
  } catch (err) {
    // Handle race on the unique (stateAbbr, city) index gracefully.
    if (err.code === 11000) {
      const record = await LocationMaster.findOne({
        stateAbbr,
        city: new RegExp(`^${city}$`, "i"),
      });
      if (record) {
        return res.status(200).json({
          city: record.city,
          stateAbbr: record.stateAbbr,
          zip: record.zip,
        });
      }
    }
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getStates, getCities, getZip, addCity };
