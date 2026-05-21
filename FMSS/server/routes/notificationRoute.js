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
} = require("../controllers/notificationController");

// All routes are protected
router.use(protect);

router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadCount);

router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);

router.delete("/clear-read", clearReadNotifications);
router.delete("/:id", deleteNotification);

module.exports = router;