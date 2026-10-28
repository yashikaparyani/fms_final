const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

// The phone app reports requests that failed on the device. A request that never
// reached us leaves nothing in any server log — the dashboard just shows zeros
// and the carrier rings the office — so the app tells us after the fact, once it
// can get through.
//
// Written to the process log, not the database: this is for support to grep
// while a carrier is on the phone, not a record anybody keeps.

const MAX_ENTRIES = 20;
const clip = (value, max = 300) => String(value ?? "").slice(0, max);

router.post("/", protect, (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [req.body];
  const who = req.user.email || String(req.user._id);

  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    console.warn(
      `[client-error] ${who} ${req.user.role} ` +
        `where=${clip(entry?.where, 60)} path=${clip(entry?.path, 120)} ` +
        `status=${clip(entry?.status, 10) || "-"} at=${clip(entry?.at, 40)} ` +
        `app=${clip(entry?.appVersion, 40)} msg=${clip(entry?.message)}`,
    );
  }

  res.status(204).end();
});

module.exports = router;
