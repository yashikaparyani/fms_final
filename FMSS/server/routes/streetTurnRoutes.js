const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  getPublicStreetTurn,
  signPublicStreetTurn,
} = require("../controllers/streetTurnController");

// ─── /api/street-turn ─────────────────────────────────────────────────────────
// One audience, and it is not signed in: the street turn partner holds a
// one-off link and acknowledges the handover from it. Everything the office
// does with a street turn lives on the load itself (/api/loads), so these are
// the only routes here.
//
// Rate limited for the same reason the insurance agency's routes are: the token
// is a 64-character hex string and brute forcing one is not feasible, but there
// is no reason to let anyone sit there trying, and an unthrottled public POST
// that writes to the database is an obvious thing to lean on.
// ─────────────────────────────────────────────────────────────────────────────

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Wait a few minutes and try again." },
});

router.get("/public/:token", publicLimiter, getPublicStreetTurn);
router.post("/public/:token/sign", publicLimiter, signPublicStreetTurn);

module.exports = router;
