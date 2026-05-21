const Notification = require("../models/Notification");
const User = require("../models/User");
const FleetOwner = require("../models/FleetOwner");
const Bid = require("../models/bidSchema");

// ─── Low-level: create a single notification ──────────────────────────────────
const createNotification = async ({ recipient, recipientRole, type, title, message, load, loadId }) => {
  return Notification.create({ recipient, recipientRole, type, title, message, load, loadId });
};

// ─── Bulk: create one notification per recipient ─────────────────────────────
const createBulkNotifications = async (recipientIds, payload) => {
  if (!recipientIds.length) return;
  const docs = recipientIds.map((recipient) => ({ ...payload, recipient }));
  return Notification.insertMany(docs);
};

// ─── Get all staff + admin user IDs ──────────────────────────────────────────
const getStaffAndAdminIds = async () => {
  // Try to find active staff/admin first, then fall back to all staff/admin if none found
  let users = await User.find({ role: { $in: ["staff", "admin"] }, isActive: true }).select("_id").lean();
  console.log(`🔍 Active staff/admin found: ${users.length}`);
  
  if (!users.length) {
    users = await User.find({ role: { $in: ["staff", "admin"] } }).select("_id").lean();
    console.log(`🔄 Falling back to all staff/admin (including inactive): ${users.length}`);
  }
  
  return users.map((u) => u._id);
};

// ─── Get all active fleet owner user IDs ─────────────────────────────────────
const getAllFleetOwnerUserIds = async () => {
  const fleetOwners = await FleetOwner.find().select("userId").lean();
  const userIds = fleetOwners.map((fo) => fo.userId).filter(Boolean);
  return userIds;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Client creates a load → notify staff + admin
// ═══════════════════════════════════════════════════════════════════════════════
const notifyLoadCreated = async ({ load, customerName }) => {
  try {
    const staffAdminIds = await getStaffAndAdminIds();
    console.log(`📢 Found ${staffAdminIds.length} staff/admin users to notify`);

    if (!staffAdminIds.length) {
      console.warn(`⚠️  No staff/admin users found to notify for load ${load.loadId}`);
      return;
    }

    const notificationPayload = {
      type: "LOAD_CREATED",
      recipientRole: "staff",
      title: "New load submitted",
      message: `A new load (${load.loadId}) has been submitted by ${customerName} and is awaiting verification.`,
      load: load._id,
      loadId: load.loadId,
    };

    console.log(`📝 Notification payload:`, notificationPayload);

    const result = await createBulkNotifications(staffAdminIds, notificationPayload);

    console.log(`✅ Created ${result.length || 0} notifications for load ${load.loadId}`);
  } catch (error) {
    console.error(`❌ Error in notifyLoadCreated for load ${load.loadId}:`, error.message);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Staff/Admin schedules or opens bidding → notify all fleet owners + client
// ═══════════════════════════════════════════════════════════════════════════════
const notifyBiddingScheduled = async ({ load, type = "BIDDING_SCHEDULED" }) => {
  const [fleetOwnerUserIds, staffAdminIds] = await Promise.all([
    getAllFleetOwnerUserIds(),
    getStaffAndAdminIds(),
  ]);

  const isOpen = type === "BIDDING_OPENED";

  const foPayload = {
    type,
    recipientRole: "fleetOwner",
    title: isOpen ? "Bidding is now open!" : "Bidding scheduled for a load",
    message: isOpen
      ? `Bidding on load ${load.loadId} is now live. Place your bid before ${new Date(load.bidEndTime).toLocaleString()}.`
      : `Bidding on load ${load.loadId} has been scheduled from ${new Date(load.bidStartTime).toLocaleString()} to ${new Date(load.bidEndTime).toLocaleString()}.`,
    load: load._id,
    loadId: load.loadId,
  };

  const clientPayload = {
    type,
    recipientRole: "client",
    title: isOpen ? "Bidding is live for your load" : "Bidding scheduled for your load",
    message: isOpen
      ? `Bidding is now open for your load ${load.loadId}. Fleet owners are placing bids.`
      : `Bidding has been scheduled for your load ${load.loadId} from ${new Date(load.bidStartTime).toLocaleString()} to ${new Date(load.bidEndTime).toLocaleString()}.`,
    load: load._id,
    loadId: load.loadId,
  };

  const recipientsToExclude = new Set(staffAdminIds.map(String));
  const filteredFoIds = fleetOwnerUserIds.filter((id) => !recipientsToExclude.has(String(id)));

  await Promise.all([
    createBulkNotifications(filteredFoIds, foPayload),
    load.creatorId ? createNotification({ recipient: load.creatorId, ...clientPayload }) : null,
  ]);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Bidding window closes → notify all fleet owners based on their bid status
// ═══════════════════════════════════════════════════════════════════════════════
const notifyBiddingClosed = async ({ load, winnerFleetOwnerId }) => {
  const allFleetOwners = await FleetOwner.find().select("_id userId").lean();

  // Get all bids for this load
  const bids = await Bid.find({ loadId: load._id }).select("fleetOwnerId").lean();
  const biddersSet = new Set(bids.map((b) => String(b.fleetOwnerId)));

  const notifications = [];

  for (const fo of allFleetOwners) {
    if (!fo.userId) continue;

    const foId = String(fo._id);
    const isWinner = String(winnerFleetOwnerId) === foId;
    const hasBid = biddersSet.has(foId);

    let type, title, message;

    if (isWinner) {
      type = "BID_WON";
      title = "🎉 You won the bid!";
      message = `Congratulations! You won the bid for load ${load.loadId}. Please confirm the assignment in your dashboard.`;
    } else if (hasBid) {
      type = "BID_LOST";
      title = "Bid result — not selected";
      message = `The bidding for load ${load.loadId} has closed. Your bid was not selected this time.`;
    } else {
      type = "BID_NOT_PLACED";
      title = "Bidding closed";
      message = `The bidding window for load ${load.loadId} has closed. You did not place a bid.`;
    }

    notifications.push({
      recipient: fo.userId,
      recipientRole: "fleetOwner",
      type,
      title,
      message,
      load: load._id,
      loadId: load.loadId,
    });
  }

  if (notifications.length) {
    await Notification.insertMany(notifications);
  }

  // Also notify the client that a winner was assigned
  if (load.creatorId) {
    await createNotification({
      recipient: load.creatorId,
      recipientRole: "client",
      type: "BIDDING_CLOSED",
      title: "A fleet owner has been assigned to your load",
      message: `Bidding for load ${load.loadId} is complete. A fleet owner has been assigned and will confirm shortly.`,
      load: load._id,
      loadId: load.loadId,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Load status changes (REQUIRES_CHANGES, VERIFIED, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
const notifyLoadStatusChanged = async ({ load, status, changesNote }) => {
  if (!load.creatorId) return;

  let type, title, message;

  switch (status) {
    case "REQUIRES_CHANGES":
      type = "LOAD_REQUIRES_CHANGES";
      title = "Action required on your load";
      message = `Your load ${load.loadId} requires changes: "${changesNote || "Please review and update."}"`;
      break;
    case "VERIFIED":
      type = "LOAD_VERIFIED";
      title = "Your load has been verified";
      message = `Your load ${load.loadId} has been verified and is now eligible for bidding.`;
      break;
    default:
      type = "LOAD_STATUS_CHANGED";
      title = "Your load status has been updated";
      message = `Your load ${load.loadId} status has been updated to ${status}.`;
  }

  await createNotification({
    recipient: load.creatorId,
    recipientRole: "client",
    type,
    title,
    message,
    load: load._id,
    loadId: load.loadId,
  });
};

module.exports = {
  notifyLoadCreated,
  notifyBiddingScheduled,
  notifyBiddingClosed,
  notifyLoadStatusChanged,
};