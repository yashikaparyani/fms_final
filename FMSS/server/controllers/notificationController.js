const Notification = require("../models/Notification");
const {
  registerPushToken,
  forgetPushToken,
} = require("../services/pushService");

// @route   GET /api/notifications
// @desc    Get user's notifications with pagination
// @access  Private
const getMyNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: req.user._id })
      .populate("load", "loadId status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ recipient: req.user._id });
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// @route   GET /api/notifications/unread-count
// @desc    Get count of unread notifications for the current user
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// @route   PUT /api/notifications/:id/read
// @desc    Mark a single notification as read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true, readAt: new Date() },
      { returnDocument: "after" }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found", success: false });
    }

    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read for current user
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// @route   DELETE /api/notifications/:id
// @desc    Delete a single notification
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found", success: false });
    }

    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// @route   DELETE /api/notifications/clear-read
// @desc    Delete all read notifications for current user
// @access  Private
const clearReadNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id,
      isRead: true,
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} read notifications`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// ─── Push devices ─────────────────────────────────────────────────────────────
// The phone app registers the device it is signed in on, so instant-dispatch
// offers reach a dispatcher who is not sitting at a laptop. Everything about
// how a push is actually delivered lives in services/pushService.js.
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Register this device for push notifications
// @route   POST /api/notifications/push-token
// @access  Private
const registerDevice = async (req, res) => {
  try {
    await registerPushToken(req.user._id, req.body.token, req.body.platform);
    res.json({ message: "Device registered for notifications." });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Stop pushing to this device
// @route   DELETE /api/notifications/push-token
// @access  Private
//
// Called on sign-out. A token identifies a device, not a person, and the next
// person to sign in on it must not inherit the last one's load offers.
const forgetDevice = async (req, res) => {
  try {
    await forgetPushToken(req.user._id, req.body.token);
    res.json({ message: "Device removed." });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  registerDevice,
  forgetDevice,
};
