const express = require("express");
const router = express.Router();
const { getStats, getWeeklyStats, downloadReport } = require("../controllers/statsController");
const { protect, authorizeRoles } = require("../middleware/auth");

router.get("/", protect, getStats);
router.get("/weekly", protect, getWeeklyStats);
router.get("/reports/download", protect, authorizeRoles("staff", "admin"), downloadReport);

module.exports = router;
