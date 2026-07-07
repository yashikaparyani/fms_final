// routes/locationRoutes.js
const express = require("express");
const router = express.Router();
const { getStates, getCities, getZip, addCity } = require("../controllers/locationController");

// Public routes - no auth needed (used in registration forms too)
router.get("/states", getStates);
router.get("/cities", getCities);
router.post("/cities", addCity); // add a user-supplied city to the master list
router.get("/zip", getZip);

module.exports = router;
