const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  registerDevice,
  forgetDevice,
} = require("../controllers/notificationController");

// All routes are protected
router.use(protect);

// The phone registers the device it is signed in on. DELETE on sign-out, so
// the next person to use that handset does not inherit these notifications.
router.post("/push-token", registerDevice);
router.delete("/push-token", forgetDevice);

router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadCount);

router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);

router.delete("/clear-read", clearReadNotifications);
router.delete("/:id", deleteNotification);

module.exports = router;