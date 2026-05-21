// routes/locationRoutes.js
const express = require("express");
const router = express.Router();
const { getStates, getCities, getZip } = require("../controllers/locationController");

// Public routes - no auth needed (used in registration forms too)
router.get("/states", getStates);
router.get("/cities", getCities);
router.get("/zip", getZip);

module.exports = router;
