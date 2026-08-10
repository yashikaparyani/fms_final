const Load = require("../models/Load");
const User = require("../models/User");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");
const Address = require("../models/common/Address");
const Bid = require("../models/bidSchema");
const TrackingEvent = require("../models/TrackingEvent");
const fs = require("fs");
const DeliveryPartner = require("../models/DeliveryPartner");
const ChassisCompany = require("../models/ChassisCompany");
const ShippingLine = require("../models/ShippingLine");
const {
  sendLoadRequiresChanges,
  sendBidWon,
  sendBiddingScheduled,
  sendStreetTurnNotifications,
} = require("../services/emailService");

// Resolve a fleet owner's primary contact email (falls back to first contact)
const getFleetOwnerEmail = (fleetOwner) =>
  fleetOwner?.contactPersons?.find((c) => c.isPrimary)?.email ||
  fleetOwner?.contactPersons?.[0]?.email ||
  null;

// The transport-status route accepts multipart (mobile sends proof images
// alongside), which flattens nested objects into JSON strings.
const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Validates the street-turn confirmation payload and resolves each party
 * against its master. Emails always come from the master rather than the
 * request, so a client cannot redirect a notification to an arbitrary address.
 *
 * @returns {Promise<{error?: string, streetTurn?: object}>}
 */
const resolveStreetTurn = async (rawPayload) => {
  const payload = parseJsonField(rawPayload);

  if (!payload) {
    return { error: "Street turn confirmation details are required." };
  }

  const partnerName = String(payload.deliveryPartner || "").trim();
  if (!partnerName) {
    return { error: "A delivery partner must be selected to confirm a street turn." };
  }

  const partner = await DeliveryPartner.findOne({ name: partnerName });
  if (!partner) {
    return { error: `Delivery partner "${partnerName}" is not in the master list.` };
  }

  // Shipping line and chassis company are optional on the load, so they are
  // only resolved when the confirmation actually names one.
  const lineName = String(payload.shippingLine || "").trim();
  const line = lineName ? await ShippingLine.findOne({ name: lineName }) : null;
  if (lineName && !line) {
    return { error: `Shipping line "${lineName}" is not in the master list.` };
  }

  const chassisName = String(payload.chassisCompany || "").trim();
  const chassis = chassisName
    ? await ChassisCompany.findOne({ name: chassisName })
    : null;
  if (chassisName && !chassis) {
    return { error: `Chassis company "${chassisName}" is not in the master list.` };
  }

  return {
    streetTurn: {
      deliveryPartner: partner.name,
      deliveryPartnerEmail: partner.email || "",
      shippingLine: line?.name || "",
      shippingLineEmail: line?.email || "",
      chassisCompany: chassis?.name || "",
      chassisCompanyEmail: chassis?.email || "",
      note: String(payload.note || "").trim(),
    },
  };
};

/**
 * Builds the recipient list for a confirmed street turn and sends to each.
 * The carrier's primary contact stands in for the assigned driver: the system
 * has no driver records, so the carrier forwards it on.
 */
const notifyStreetTurn = async (load, streetTurn) => {
  const recipients = [
    { party: "Delivery Partner", email: streetTurn.deliveryPartnerEmail },
    { party: "Shipping Line", email: streetTurn.shippingLineEmail },
    { party: "Chassis Company", email: streetTurn.chassisCompanyEmail },
  ];

  const fleetOwnerId = load.assignedFleetOwner?.fleetOwnerId;
  if (fleetOwnerId) {
    const fleetOwner = await FleetOwner.findById(fleetOwnerId).lean();
    const carrierEmail = getFleetOwnerEmail(fleetOwner);
    if (carrierEmail) {
      recipients.push({ party: "Assigned Carrier / Driver", email: carrierEmail });
    }
  }

  const admins = await User.find({ role: "admin", isActive: true })
    .select("email")
    .lean();
  for (const admin of admins) {
    recipients.push({ party: "Admin", email: admin.email });
  }

  return sendStreetTurnNotifications({ load, streetTurn, recipients });
};
const { buildPodDocument } = require("../services/podDocumentService");
const { publishTrackingUpdate } = require("../services/trackingBroadcaster");
const {
  notifyLoadCreated,
  notifyBiddingScheduled,
  notifyLoadStatusChanged,
} = require("../services/NotificationService");
const mongoose = require("mongoose");

const POD_DOCUMENT_TYPE = "Proof of Delivery";
const LEGACY_DOCUMENT_TYPE_ALIASES = {
  Invoice: "Carrier Invoice",
};
const ALLOWED_DOCUMENT_TYPES = new Set([
  "Bare Chassis In-Gate/Out-Gate",
  "Bill Of Lading",
  "Out-Gate Interchange",
  "In-Gate Interchange",
  POD_DOCUMENT_TYPE,
  "Scale Ticket",
  "Lumper Receipt",
  "Misc.",
  "Carrier Invoice",
]);

const normalizeStopInput = (stop) => {
  if (!stop || typeof stop !== "object") return null;

  const normalized = {
    addressId: stop.addressId,
    address: stop.address || stop.street || "",
    city: stop.city || "",
    state: stop.state || "",
    zip: stop.zip || "",
    company: stop.company || stop.companyName || "",
    poNumber: stop.poNumber || "",
    pieces: stop.pieces || "",
    weight: stop.weight || "",
    fromTime: stop.fromTime || "",
    toTime: stop.toTime || "",
    apptGivenBy: stop.apptGivenBy || "",
    apptNumber: stop.apptNumber || "",
  };

  if (stop.pickupDate) normalized.pickupDate = stop.pickupDate;
  if (stop.deliveryDate) normalized.deliveryDate = stop.deliveryDate;

  return normalized;
};

const hasStopData = (stop) =>
  !!(
    stop &&
    (stop.addressId || stop.address || stop.city || stop.state || stop.zip || stop.company)
  );

const hydrateStopFromAddressMap = (stop, addressMap) => {
  if (!stop || typeof stop !== "object") return stop || null;

  const hydrated = { ...stop };
  const addressId = stop.addressId?.toString?.() || "";
  if (!addressId) return hydrated;

  const address = addressMap.get(addressId);
  if (!address) return hydrated;

  hydrated.address = hydrated.address || address.street || "";
  hydrated.city = hydrated.city || address.city || "";
  hydrated.state = hydrated.state || address.state || "";
  hydrated.zip = hydrated.zip || address.zip || "";

  return hydrated;
};

// ========================= 📥 Create / Insert =========================

// Create Load
const createLoad = async (req, res) => {
  try {
    const {
      customer,
      refNo,
      deliveryType,
      singleType,
      truckType,
      material,
      amount,
      lastFreeDate,
      orderBillDate,
      containerType,
      commodity,
      bookingNo,
      shippingLine,
      containerNo,
      chassisNo,
      pickupNo,
      sealNo,
      hazmat,
      chassisRent,
      railContainer,
      dryVan,
      reefer,
      isUrgent,
      accChargesEmail,
      podEmail,
      deliveryEmail,
      billingEmail,
      description,
      remarks,
      status,
      pickup,
      drop,
    } = req.body;

    let customerName = "";
    if (customer) {
      const findCustomer = await User.findById(customer);
      if (!findCustomer) {
        return res
          .status(400)
          .json({ message: "Customer does not exist", success: false });
      }
      customerName = `${findCustomer.firstName} ${findCustomer.lastName}`;
    } else {
      return res
        .status(400)
        .json({ message: "Customer is required", success: false });
    }

    const normalizedPickup = normalizeStopInput(pickup);
    const normalizedDrop = normalizeStopInput(drop);

    const newLoad = {
      customer,
      customerName,
      refNo,
      deliveryType,
      singleType,
      truckType,
      material,
      amount,
      lastFreeDate,
      orderBillDate,
      containerType,
      commodity,
      bookingNo,
      shippingLine,
      containerNo,
      chassisNo,
      pickupNo,
      sealNo,
      hazmat,
      chassisRent,
      railContainer,
      dryVan,
      reefer,
      isUrgent: !!isUrgent,
      accChargesEmail,
      podEmail,
      deliveryEmail,
      billingEmail,
      description,
      remarks,
      ...(hasStopData(normalizedPickup) ? { pickup: normalizedPickup } : {}),
      ...(hasStopData(normalizedDrop) ? { drop: normalizedDrop } : {}),
      adressAdded: !!(
        normalizedPickup?.city &&
        normalizedPickup?.address &&
        normalizedDrop?.city &&
        normalizedDrop?.address
      ),
      status:
        status ||
        (req.user.role === "staff" ? "VERIFIED" : "PENDING_VERIFICATION"),
      transportStatus: "LOAD_PLANNER",
      createdBy: req.user.role,
      creatorId: req.user._id,
    };

    const load = await Load.create(newLoad);

    // Notify staff and admin about the new load
    if (load.status === "PENDING_VERIFICATION") {
      try {
        console.log(`📦 Load created:`, {
          _id: load._id,
          loadId: load.loadId,
          customerName: customerName,
          status: load.status,
        });

        await notifyLoadCreated({ load, customerName });
        console.log(`✅ Notifications sent for load ${load.loadId}`);
      } catch (notifyError) {
        console.error(
          `❌ Failed to send notifications for load ${load.loadId}:`,
          notifyError.message,
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "Load created successfully",
      data: load,
    });
  } catch (error) {
    res.status(400).json({ message: error.message, success: false });
  }
};

// Upload Document
const uploadDocument = async (req, res) => {
  try {
    const { documentType } = req.body;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    if (!documentType)
      return res.status(400).json({ message: "Document type is required" });

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const normalizedDocumentType =
      LEGACY_DOCUMENT_TYPE_ALIASES[documentType] || documentType;

    if (normalizedDocumentType === POD_DOCUMENT_TYPE) {
      return res.status(400).json({
        message: "Proof of Delivery is auto-generated after delivered status",
      });
    }

    if (!ALLOWED_DOCUMENT_TYPES.has(normalizedDocumentType)) {
      return res.status(400).json({
        message: "Unsupported document type",
      });
    }

    load.documents.push({
      documentType: normalizedDocumentType,
      fileName: req.file.originalname,
      filePath: req.file.path,
      dateReceived: new Date(),
    });

    await load.save();

    res.json({
      success: true,
      message: "Document uploaded",
      data: load.documents,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ========================= 📤 Read / Fetch =========================

// Get Loads
// const getLoads = async (req, res) => {
//   try {
//     const query = {};

//     if (req.user.role === "client") {
//       query.creatorId = req.user._id;
//     }

//     if (req.user.role === "fleetOwner") {
//       query.status = "VERIFIED";
//       query.bidStatus = req.query.bidStatus
//         ? req.query.bidStatus
//         : { $in: ["OPEN", "UPCOMING"] };
//     }

//     if (req.query.status && req.user.role !== "fleetOwner") {
//       query.status = req.query.status;
//     }

//     if (req.query.bidStatus && req.user.role !== "fleetOwner") {
//       query.bidStatus = req.query.bidStatus;
//     }

//     if (
//       req.query.transportStatus &&
//       req.query.transportStatus.trim() !== "All"
//     ) {
//       query.transportStatus = req.query.transportStatus;
//     }

//     const loads = await Load.find(query)
//       .populate("customer", "firstName lastName email")
//       .sort({ createdAt: -1 });
//     res.json(loads);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// The three tabs of the Load Management screen. A free-text search spans them
// so one query surfaces a match wherever the load currently sits.
const SEARCHABLE_TAB_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "ASSIGNED"];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every load field a user could plausibly recall and type into the search box.
const SEARCH_FIELDS = [
  "loadId",
  "refNo",
  "bookingNo",
  "containerNo",
  "chassisNo",
  "pickupNo",
  "sealNo",
  "shippingLine",
  "containerType",
  "commodity",
  "truckType",
  "material",
  "description",
  "remarks",
  "status",
  "transportStatus",
  // Legacy single stop, kept in sync with the first element of each array.
  "pickup.company", "pickup.address", "pickup.city", "pickup.state", "pickup.zip",
  "drop.company",   "drop.address",   "drop.city",   "drop.state",   "drop.zip",
  // Multi-stop arrays: a dotted path matches any element.
  "pickups.company", "pickups.address", "pickups.city", "pickups.state", "pickups.zip",
  "drops.company",   "drops.address",   "drops.city",   "drops.state",   "drops.zip",
];

/**
 * Build the `$or` clause for a free-text load search. Customer name lives on a
 * separate collection, so it is resolved to user ids first.
 */
const buildSearchClause = async (term) => {
  const rx = new RegExp(escapeRegex(term), "i");
  const or = SEARCH_FIELDS.map((field) => ({ [field]: rx }));

  const customers = await Customer.find({ customerName: rx }, { user: 1 }).lean();
  const customerUserIds = customers.map((c) => c.user).filter(Boolean);
  if (customerUserIds.length) {
    or.push({ customer: { $in: customerUserIds } });
  }

  // A bare number should also match the freight amount.
  if (!Number.isNaN(Number(term))) {
    or.push({ amount: Number(term) });
  }

  return or;
};

const getLoads = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === "client") {
      query.creatorId = req.user._id;
    }

    if (req.user.role === "fleetOwner") {
      query.status = "VERIFIED";
      query.bidStatus = req.query.bidStatus
        ? req.query.bidStatus
        : { $in: ["OPEN", "UPCOMING"] };
    }

    if (req.query.status && req.user.role !== "fleetOwner") {
      query.status = req.query.status;
    }

    if (req.query.bidStatus && req.user.role !== "fleetOwner") {
      query.bidStatus = req.query.bidStatus;
    }

    if (
      req.query.transportStatus &&
      req.query.transportStatus.trim() !== "All"
    ) {
      query.transportStatus = req.query.transportStatus;
    }

    const term = (req.query.q || "").trim();
    if (term) {
      query.$or = await buildSearchClause(term);
      // With no explicit status, a search spans the three tabs at once. The
      // role scoping above still applies on top of this.
      if (!req.query.status && req.user.role !== "fleetOwner") {
        query.status = { $in: SEARCHABLE_TAB_STATUSES };
      }
    }

    const loads = await Load.find(query).sort({ createdAt: -1 }).lean();

    const bidCounts = loads.length
      ? await Bid.aggregate([
          { $match: { loadId: { $in: loads.map((load) => load._id) } } },
          { $group: { _id: "$loadId", count: { $sum: 1 } } },
        ])
      : [];
    const bidCountMap = new Map(
      bidCounts.map((entry) => [String(entry._id), entry.count]),
    );

    const addressIds = new Set();
    for (const load of loads) {
      const pickupAddressId = load.pickup?.addressId;
      const dropAddressId = load.drop?.addressId;

      if (pickupAddressId && mongoose.isValidObjectId(pickupAddressId)) {
        addressIds.add(String(pickupAddressId));
      }
      if (dropAddressId && mongoose.isValidObjectId(dropAddressId)) {
        addressIds.add(String(dropAddressId));
      }
    }

    let addressMap = new Map();
    if (addressIds.size > 0) {
      const addresses = await Address.find(
        { _id: { $in: Array.from(addressIds) } },
        { street: 1, city: 1, state: 1, zip: 1 },
      ).lean();
      addressMap = new Map(addresses.map((address) => [String(address._id), address]));
    }

    const enriched = await Promise.all(
      loads.map(async (load) => {
        let customerName = "—";
        if (load.customer && mongoose.isValidObjectId(load.customer)) {
          const customerRecord = await Customer.findOne({
            user: load.customer,
          });
          customerName = customerRecord?.customerName || "—";
        }

        return {
          ...load,
          customerName,
          bidCount: bidCountMap.get(String(load._id)) || load.bids?.length || 0,
          pickup: hydrateStopFromAddressMap(load.pickup, addressMap),
          drop: hydrateStopFromAddressMap(load.drop, addressMap),
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLoadById = async (req, res) => {
  try {
    const load = await Load.findOne({
      loadId: req.params.loadId,
    }).lean();

    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    // Customer name
    let customerName = "—";

    if (load.customer && mongoose.isValidObjectId(load.customer)) {
      const customerRecord = await Customer.findOne({
        user: load.customer,
      }).select("customerName");

      customerName = customerRecord?.customerName || "—";
    }

    const loadAddressIds = [];
    if (load.pickup?.addressId && mongoose.isValidObjectId(load.pickup.addressId)) {
      loadAddressIds.push(String(load.pickup.addressId));
    }
    if (load.drop?.addressId && mongoose.isValidObjectId(load.drop.addressId)) {
      loadAddressIds.push(String(load.drop.addressId));
    }

    let loadAddressMap = new Map();
    if (loadAddressIds.length > 0) {
      const addresses = await Address.find(
        { _id: { $in: loadAddressIds } },
        { street: 1, city: 1, state: 1, zip: 1 },
      ).lean();
      loadAddressMap = new Map(addresses.map((address) => [String(address._id), address]));
    }

    // Transport history trail
    const transportHistory = (load.transportStatusHistory || []).map(
      (item) => ({
        status: item.status,
        note: item.note || "",
        changedAt: item.changedAt,

        // send location properly
        location: {
          latitude: item.location?.latitude || null,
          longitude: item.location?.longitude || null,
          address: item.location?.address || "",
          city: item.location?.city || "",
          state: item.location?.state || "",
        },
      })
    );

    const responsePayload = {
      ...load,
      customerName,
      bidCount:
        (await Bid.countDocuments({ loadId: load._id })) || load.bids?.length || 0,
      pickup: hydrateStopFromAddressMap(load.pickup, loadAddressMap),
      drop: hydrateStopFromAddressMap(load.drop, loadAddressMap),
      transportStatusHistory: transportHistory,
    };

    // 🔒 Customers (clients) must NOT see bid status/amounts — only the
    // assigned bidder (allotment) and transit updates. Strip bid financials.
    if (req.user?.role === "client") {
      delete responsePayload.winningBid;
      delete responsePayload.targetRate;
      delete responsePayload.margin;
      delete responsePayload.vendorRate;
      delete responsePayload.bidCount;
    }

    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ========================= ✏️ Update =========================

// Update Load
const updateLoad = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    // ── Client permission gate ──────────────────────────────────────────────
    if (req.user.role === "client") {
      // Must own the load
      if (load.creatorId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Client can only edit loads in these statuses
      const editableStatuses = [
        "DRAFT",
        "REQUIRES_CHANGES",
        "PENDING_VERIFICATION",
      ];
      if (!editableStatuses.includes(load.status)) {
        return res.status(400).json({
          message: `Cannot edit a load with status "${load.status}". Only DRAFT, REQUIRES_CHANGES or PENDING_VERIFICATION loads can be updated.`,
        });
      }
    }

    // ── Apply all field updates (exclude internal/system fields) ───────────
    const protectedFields = [
      "_id",
      "loadId",
      "creatorId",
      "createdAt",
      "updatedAt",
      "status",
      "transportStatus",
      "transportStatusHistory",
      // Written only by the street-turn confirmation flow, which validates the
      // parties against their masters and emails them. A plain load edit must
      // not be able to rewrite what was confirmed.
      "streetTurn",
    ];

    for (const [key, value] of Object.entries(req.body)) {
      if (!protectedFields.includes(key) && value !== undefined) {
        load[key] = value;
      }
    }

    // Ensure nested date fields are preserved correctly
    if (req.body.pickup) {
      load.pickup = {
        ...req.body.pickup,
        pickupDate: req.body.pickup.pickupDate,
      };
    }

    if (req.body.drop) {
      load.drop = {
        ...req.body.drop,
        deliveryDate: req.body.drop.deliveryDate,
      };
    }

    // ── Multiple origins / destinations ─────────────────────────────────────
    // Persist the full arrays and keep the legacy single pickup/drop in sync
    // with the first element so existing displays keep working.
    if (Array.isArray(req.body.pickups)) {
      load.pickups = req.body.pickups;
      if (req.body.pickups[0]) load.pickup = req.body.pickups[0];
    }
    if (Array.isArray(req.body.drops)) {
      load.drops = req.body.drops;
      if (req.body.drops[0]) load.drop = req.body.drops[0];
    }

    // ── Address completeness flag ───────────────────────────────────────────
    const pickupList = load.pickups?.length ? load.pickups : [load.pickup];
    const dropList = load.drops?.length ? load.drops : [load.drop];
    const pickupDone = pickupList.some((p) => p?.city && p?.address);
    const dropDone = dropList.some((d) => d?.city && d?.address);
    load.adressAdded = !!(pickupDone && dropDone);

    // ── Status transitions ──────────────────────────────────────────────────
    if (req.user.role === "client") {
      // Submitting → always moves back to PENDING_VERIFICATION for re-review
      load.status = "PENDING_VERIFICATION";
      // Reset transport status so staff reviews the fresh submission
      load.transportStatus = "NEW_LOAD";
    }

    if (["staff", "admin"].includes(req.user.role)) {
      // Staff / admin may set any explicit status sent in the body
      if (req.body.status) load.status = req.body.status;
      if (req.body.transportStatus)
        load.transportStatus = req.body.transportStatus;
    }

    await load.save();
    res.json(load);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// Update Load Status
// const updateLoadStatus = async (req, res) => {
//   try {
//     const { status } = req.body;

//     const load = await Load.findOneAndUpdate(
//       { loadId: req.params.loadId },
//       { status },
//       { new: true, runValidators: true }
//     );

//     if (!load) return res.status(404).json({ message: "Load not found" });

//     if (status === "REQUIRES_CHANGES" && load.creatorId) {
//       const client = await User.findById(load.creatorId);
//       if (client) {
//         await sendEmail({
//           to: client.email,
//           subject: `Updates Required for Load ${load.loadId}`,
//           html: `<p>Hello ${client.firstName},</p><p>Your load requires changes.</p>`,
//         });
//       }
//     }

//     res.json(load);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const updateLoadStatus = async (req, res) => {
  try {
    const { status, changesNote } = req.body;

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    load.status = status;

    // Store the changes note on the load so the client can see it in their dashboard
    if (status === "REQUIRES_CHANGES") {
      if (!changesNote?.trim()) {
        return res.status(400).json({
          message: "Please provide details about what changes are required.",
        });
      }
      load.changesNote = changesNote.trim();
    } else {
      // Clear stale note when status moves on
      load.changesNote = undefined;
    }

    await load.save();

    let notificationStatus = { created: false };
    try {
      await notifyLoadStatusChanged({ load, status, changesNote: load.changesNote });
      notificationStatus = { created: true };
    } catch (notificationError) {
      notificationStatus = { created: false, error: notificationError.message };
      console.error(`Failed to create status notification for ${load.loadId}:`, notificationError.message);
    }

    let emailStatus = null;
    if (status === "REQUIRES_CHANGES" && load.creatorId) {
      const client = await User.findById(load.creatorId);
      if (client) {
        emailStatus = await sendLoadRequiresChanges({
          load,
          client,
          changesNote: changesNote.trim(),
        });
      }
    }

    res.json({
      ...load.toObject(),
      notificationStatus,
      emailStatus,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update Bidding Status
const updateBiddingStatus = async (req, res) => {
  try {
    const { bidStatus, bidStartTime, bidEndTime } = req.body;

    const update = { bidStatus };
    if (bidStartTime) update.bidStartTime = bidStartTime;
    if (bidEndTime) update.bidEndTime = bidEndTime;

    const load = await Load.findOneAndUpdate(
      { loadId: req.params.loadId },
      update,
      { returnDocument: "after", runValidators: true },
    );

    if (!load) return res.status(404).json({ message: "Load not found" });

    res.json(load);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update Transport Status
// const updateTransportStatus = async (req, res) => {
//   try {
//     const { transportStatus, note } = req.body;

//     const load = await Load.findOne({ loadId: req.params.loadId });
//     if (!load) return res.status(404).json({ message: "Load not found" });

//     if (load.transportStatus !== transportStatus) {
//       load.transportStatus = transportStatus;
//       load.transportStatusHistory.push({
//         status: transportStatus,
//         changedAt: new Date(),
//         changedBy: req.user._id,
//         note: note || "",
//       });
//     }

//     await load.save();

//     res.json({
//       success: true,
//       message: "Transport status updated",
//       data: load,
//     });
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// Update Transport Status
const updateTransportStatus = async (req, res) => {
  let generatedPodDocument = null;

  try {
    const { transportStatus, note, latitude, longitude, signatureData } = req.body;
    const role = req.user.role;

    const load = await Load.findOne({
      loadId: req.params.loadId,
    });

    if (!load) {
      return res.status(404).json({
        message: "Load not found",
      });
    }

    // ─────────────────────────────────────────────
    // STATUSES THAT REQUIRE LIVE LOCATION
    // ─────────────────────────────────────────────
    const locationRequiredStatuses = [
      "PICKED_UP",
      "IN_TRANSIT",
      "REACHED_DESTINATION",
      "DELIVERED",
      "DROP_IN_WAREHOUSE",
      "DRIVER_ON_WAITING",
    ];
    const liveTrackingRequiredStatuses = ["PICKED_UP", "IN_TRANSIT"];

    let parsedLat = null;
    let parsedLng = null;

    // ─────────────────────────────────────────────
    // REQUIRE GPS FOR MOVEMENT STATUSES
    // Staff / admin web updates are exempt — they update administratively.
    // ─────────────────────────────────────────────
    if (locationRequiredStatuses.includes(transportStatus) && !["staff", "admin"].includes(role)) {
      parsedLat = parseFloat(latitude);
      parsedLng = parseFloat(longitude);

      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({
          success: false,
          message:
            "Current location is mandatory for this transport status.",
        });
      }
    }

    // Web updates capture the current location at submit time, so the live
    // GPS session (mobile-only) is not required for them. Mobile updates still
    // require an active live-tracking session.
    const isWebUpdate = req.body.source === "web";

    if (
      ["fleetOwner", "driver"].includes(role) &&
      liveTrackingRequiredStatuses.includes(transportStatus) &&
      load.liveTracking?.status !== "ACTIVE" &&
      !isWebUpdate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Live tracking must be started before marking this load picked up or in transit.",
      });
    }

    // ─────────────────────────────────────────────
    // PICKUP PROOF REQUIRED
    // ─────────────────────────────────────────────
    if (
      transportStatus === "PICKED_UP" &&
      ["fleetOwner", "driver"].includes(role)
    ) {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Pickup proof image is required when marking PICKED_UP.",
        });
      }

      load.pickupProof = {
        images: req.files.map((f) => ({
          fileName: f.originalname,
          filePath: f.path,
          uploadedAt: new Date(),
        })),

        location: {
          latitude: parsedLat,
          longitude: parsedLng,
        },

        submittedBy: req.user._id,
        submittedAt: new Date(),
      };
    }

    // ─────────────────────────────────────────────
    // ONE-WAY STATUS PROGRESSION
    // A status can only move forward — never back to an earlier stage.
    // Exception: a load with multiple origins may be marked PICKED_UP once
    // per origin (the client asks the driver to confirm which origin).
    // ─────────────────────────────────────────────
    const STATUS_ORDER = [
      "ASSIGNED",
      "READY_TO_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
      "REACHED_DESTINATION",
      "DELIVERED",
    ];

    const originCount =
      Array.isArray(load.pickups) && load.pickups.length
        ? load.pickups.length
        : 1;
    const pickedUpCount = (load.transportStatusHistory || []).filter(
      (h) => h.status === "PICKED_UP",
    ).length;
    const isExtraOriginPickup =
      transportStatus === "PICKED_UP" &&
      originCount >= 2 &&
      pickedUpCount < originCount;

    if (load.transportStatus === transportStatus && !isExtraOriginPickup) {
      return res.status(400).json({
        success: false,
        message: "Load is already in this status.",
      });
    }

    const currentIdx = STATUS_ORDER.indexOf(load.transportStatus);
    const nextIdx = STATUS_ORDER.indexOf(transportStatus);
    if (
      currentIdx !== -1 &&
      nextIdx !== -1 &&
      nextIdx < currentIdx &&
      !isExtraOriginPickup
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot move status back to "${transportStatus.replace(
          /_/g,
          " ",
        )}" — the load is already at "${load.transportStatus.replace(
          /_/g,
          " ",
        )}".`,
      });
    }

    if (transportStatus === "DELIVERED") {
      if (!signatureData) {
        return res.status(400).json({
          success: false,
          message: "Delivery signature is required when marking DELIVERED.",
        });
      }

      generatedPodDocument = await buildPodDocument({
        load,
        signatureData,
      });
    }

    // ─────────────────────────────────────────────
    // STREET TURN REQUIRES A CONFIRMATION
    // Resolved before anything is mutated so a bad payload leaves the load
    // untouched rather than half-updated.
    // ─────────────────────────────────────────────
    let confirmedStreetTurn = null;
    if (transportStatus === "STREET_TURN") {
      const { error, streetTurn } = await resolveStreetTurn(req.body.streetTurn);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }
      confirmedStreetTurn = {
        ...streetTurn,
        confirmedBy: req.user._id,
        confirmedAt: new Date(),
      };
    }

    // ─────────────────────────────────────────────
    // UPDATE CURRENT STATUS
    // ─────────────────────────────────────────────
    load.transportStatus = transportStatus;

    if (confirmedStreetTurn) {
      load.streetTurn = confirmedStreetTurn;
      // Keep the load's own chassis company in step with what was agreed.
      if (confirmedStreetTurn.chassisCompany) {
        load.chassisCompany = confirmedStreetTurn.chassisCompany;
      }
    }

    // ─── Capture Pickup/Delivery Details ───
    if (transportStatus === "PICKED_UP") {
      load.pickedUpAt = new Date();
      load.pickedUpCity = load.pickup?.city || "—";
      load.pickedUpState = load.pickup?.state || "—";
    } else if (transportStatus === "DELIVERED") {
      load.deliveredAt = new Date();
      load.deliveredCity = load.drop?.city || "—";
      load.deliveredState = load.drop?.state || "—";
    }

    // ─────────────────────────────────────────────
    // PUSH HISTORY WITH LOCATION
    // ─────────────────────────────────────────────
    const hasValidLocation =
      Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
    const locationRecordedAt = new Date();

    if (hasValidLocation) {
      load.liveTracking = load.liveTracking || {};
      if (load.liveTracking.status === "ACTIVE") {
        load.liveTracking.lastHeartbeatAt = locationRecordedAt;
      }
      load.liveTracking.lastLocation = {
        latitude: parsedLat,
        longitude: parsedLng,
        recordedAt: locationRecordedAt,
        source:
          isWebUpdate
            ? "web"
            : role === "fleetOwner" || role === "driver"
              ? "mobile"
              : "web",
      };
    }

    if (
      transportStatus === "DELIVERED" &&
      load.liveTracking?.status === "ACTIVE"
    ) {
      load.liveTracking.status = "STOPPED";
      load.liveTracking.stoppedAt = locationRecordedAt;
      load.liveTracking.stoppedBy = req.user._id;
    }

    load.transportStatusHistory.push({
      status: transportStatus,
      changedAt: new Date(),
      changedBy: req.user._id,
      note: note || "",

      location:
        hasValidLocation
          ? {
              latitude: parsedLat,
              longitude: parsedLng,
            }
          : undefined,
    });

    await load.save();

    if (hasValidLocation) {
      TrackingEvent.create({
        load: load._id,
        loadId: load.loadId,
        fleetOwner: load.assignedFleetOwner?.fleetOwnerId,
        user: req.user._id,
        coordinates: {
          latitude: parsedLat,
          longitude: parsedLng,
        },
        recordedAt: locationRecordedAt,
        source: role === "fleetOwner" || role === "driver" ? "mobile" : "web",
      })
        .then((event) => {
          publishTrackingUpdate(load.loadId, "location", {
            id: event._id,
            latitude: parsedLat,
            longitude: parsedLng,
            recordedAt: locationRecordedAt,
            source:
              role === "fleetOwner" || role === "driver" ? "mobile" : "web",
          });
        })
        .catch((err) => console.error("Tracking event save failed:", err));
    }

    publishTrackingUpdate(load.loadId, "transport_status", {
      transportStatus: load.transportStatus,
      liveTrackingStatus: load.liveTracking?.status || "NOT_STARTED",
      changedAt: locationRecordedAt,
    });

    if (generatedPodDocument) {
      const podIndex = load.documents.findIndex(
        (doc) => doc.documentType === POD_DOCUMENT_TYPE,
      );

      const podEntry = {
        documentType: POD_DOCUMENT_TYPE,
        fileName: generatedPodDocument.fileName,
        filePath: `uploads/pod/${generatedPodDocument.fileName}`,
        dateReceived: new Date(),
      };

      if (podIndex >= 0) {
        load.documents[podIndex] = podEntry;
      } else {
        load.documents.push(podEntry);
      }

      await load.save();
    }

    // ─────────────────────────────────────────────
    // STREET TURN NOTIFICATIONS
    // Sent after the status is safely persisted. A mail failure must not undo
    // a confirmed street turn, so the outcome is recorded on the load instead
    // of thrown — the caller sees which parties were reached.
    // ─────────────────────────────────────────────
    let streetTurnNotifications = null;
    if (confirmedStreetTurn) {
      try {
        streetTurnNotifications = await notifyStreetTurn(load, confirmedStreetTurn);
      } catch (err) {
        console.error("Street turn notifications failed:", err);
        streetTurnNotifications = [];
      }

      load.streetTurn.notifications = streetTurnNotifications;
      await load.save();
    }

    return res.json({
      success: true,
      message: "Transport status updated successfully",
      data: load,
      ...(streetTurnNotifications
        ? { streetTurnNotifications }
        : {}),
    });
  } catch (error) {
    if (generatedPodDocument?.filePath) {
      fs.rmSync(generatedPodDocument.filePath, { force: true });
    }
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Schedule Bidding
const scheduleBidding = async (req, res) => {
  try {
    const { bidStartTime, bidEndTime, targetRate, margin } = req.body;

    if (!bidStartTime || !bidEndTime) {
      return res.status(400).json({
        message: "Both start time and end time are required",
      });
    }

    const start = new Date(bidStartTime);
    const end = new Date(bidEndTime);
    const now = new Date();

    if (start >= end) {
      return res.status(400).json({
        message: "Bid end time must be after start time",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });

    if (!load) {
      return res.status(404).json({
        message: "Load not found",
      });
    }

    load.bidStartTime = start;
    load.bidEndTime = end;

    // ✅ MARGIN CALCULATION: Apply margin to targetRate for vendor pricing
    if (targetRate !== undefined) {
      load.targetRate = targetRate;
      if (margin !== undefined) {
        load.margin = margin;
        // Vendor sees: targetRate - margin
        load.vendorRate = targetRate - margin;
      } else {
        load.vendorRate = targetRate; // If no margin, vendor rate = target rate
      }
    }

    // ✅ Correct live status logic
    let notificationType;
    if (now < start) {
      load.bidStatus = "UPCOMING";
      notificationType = "BIDDING_SCHEDULED";
    } else if (now >= start && now <= end) {
      load.bidStatus = "OPEN";
      notificationType = "BIDDING_OPENED";
    } else {
      load.bidStatus = "CLOSED";
    }

    await load.save();

    if (notificationType) {
      notifyBiddingScheduled({ load, type: notificationType }).catch(
        console.error,
      );

      // 📧 Push email to all active fleet owners about the scheduled bidding
      // (fire-and-forget so it doesn't block the response)
      FleetOwner.find({ status: "ACTIVE" })
        .then((fleetOwners) => {
          for (const owner of fleetOwners) {
            const email = getFleetOwnerEmail(owner);
            if (email) {
              sendBiddingScheduled({ load, email }).catch(console.error);
            }
          }
        })
        .catch(console.error);
    }

    res.status(200).json({
      success: true,
      message: "Bidding scheduled successfully",
      data: load,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

const getOpenForBid = async (req, res) => {
  try {
    const now = new Date();

    await Load.updateMany(
      {
        bidStatus: { $in: ["OPEN", "UPCOMING"] },
        bidEndTime: { $lt: now },
      },
      {
        $set: { bidStatus: "CLOSED" },
      },
    );

    await Load.updateMany(
      {
        status: "VERIFIED",
        bidStatus: "UPCOMING",
        bidStartTime: { $lte: now },
        bidEndTime: { $gte: now },
      },
      {
        $set: { bidStatus: "OPEN" },
      },
    );

    const loads = await Load.find({
      status: "VERIFIED",
      bidStatus: "OPEN",
      //bidStartTime: { $lte: now },
      //bidEndTime: { $gte: now },
    });
    //.sort({ bidEndTime: 1 });

    res.status(200).json(loads);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ========================= ❌ Delete =========================

// Delete Document
const deleteDocument = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    load.documents = load.documents.filter(
      (doc) => doc._id.toString() !== req.params.docId,
    );

    await load.save();
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ========================= 🔗 Assignment / Business Logic =========================

// Assign Fleet Owner
const assignFleetOwner = async (req, res) => {
  try {
    const { fleetOwnerId, fleetOwnerName } = req.body;

    const load = await Load.findOneAndUpdate(
      { loadId: req.params.loadId },
      {
        $set: {
          status: "ASSIGNED",
          "assignedFleetOwner.fleetOwnerId": fleetOwnerId,
          "assignedFleetOwner.fleetOwnerName": fleetOwnerName,
          "assignedFleetOwner.assignedAt": new Date(),
          transportStatus: "ASSIGNED",
          // Direct assignment bypasses bidding entirely. Neutralise the bid
          // window so the cron never re-opens/closes it or mails a "bid won".
          // A later re-bid (on reject/terminate) resets these via rebidLoad.
          bidStatus: "CLOSED",
        },
        $unset: {
          bidStartTime: "",
          bidEndTime: "",
          winningBid: "",
        },
      },
      { returnDocument: "after" },
    );

    if (!load) return res.status(404).json({ message: "Load not found" });

    res.json(load);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Re-bid Load (Reset to VERIFIED and clear assignment)
const rebidLoad = async (req, res) => {
  try {
    const load = await Load.findOneAndUpdate(
      { loadId: req.params.loadId },
      {
        $set: {
          status: "VERIFIED",
          transportStatus: "NEW_LOAD",
          bidStatus: "UPCOMING",
        },
        $unset: {
          bidStartTime: "",
          bidEndTime: "",
          winningBid: "",
          assignedFleetOwner: "",
        },
      },
      { new: true, runValidators: true }
    );

    if (!load) return res.status(404).json({ message: "Load not found" });

    // Delete old bids from Bid collection for a fresh start
    const Bid = require("../models/bidSchema");
    await Bid.deleteMany({ loadId: load._id });

    res.json({
      success: true,
      message: "Load reset to verified status. Previous bids discarded. You can now schedule a new bid.",
      data: load,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CONTROLLER
const confirmAssignedLoadByFleetOwner = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find logged-in fleet owner
    const fleetOwner = await FleetOwner.findOne({ userId });

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    // Find load
    const load = await Load.findOne({
      loadId: req.params.loadId,
      "assignedFleetOwner.fleetOwnerId": fleetOwner._id,
    });

    if (!load) {
      return res.status(404).json({
        message: "Assigned load not found for this fleet owner",
      });
    }

    // Already confirmed
    if (load.transportStatus === "READY_TO_PICKUP") {
      return res.status(400).json({
        message: "Load already confirmed",
      });
    }

    // Update status
    load.transportStatus = "READY_TO_PICKUP";
    load.liveTracking = load.liveTracking || {};
    load.liveTracking.isRequired = true;
    load.liveTracking.status = load.liveTracking.status || "NOT_STARTED";

    load.transportStatusHistory.push({
      status: "READY_TO_PICKUP",
      changedAt: new Date(),
      changedBy: req.user._id,
      note: "Fleet owner accepted ride",
    });

    await load.save();

    publishTrackingUpdate(load.loadId, "transport_status", {
      transportStatus: load.transportStatus,
      liveTrackingStatus: load.liveTracking?.status || "NOT_STARTED",
      changedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Ride accepted successfully",
      data: load,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const rateCompletedLoad = async (req, res) => {
  try {
    const { score, remark } = req.body;
    const numericScore = Number(score);

    if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 5) {
      return res.status(400).json({ message: "Rating score must be between 1 and 5" });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    if (req.user.role === "client" && load.creatorId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to rate this load" });
    }

    if (load.transportStatus !== "DELIVERED") {
      return res.status(400).json({ message: "Only delivered loads can be rated" });
    }

    const fleetOwnerId = load.assignedFleetOwner?.fleetOwnerId;
    if (!fleetOwnerId) {
      return res.status(400).json({ message: "No fleet owner is assigned to this load" });
    }

    const fleetOwner = await FleetOwner.findById(fleetOwnerId);
    if (!fleetOwner) return res.status(404).json({ message: "Fleet owner not found" });

    // ✅ Ensure ratings array exists
    if (!Array.isArray(fleetOwner.ratings)) {
      fleetOwner.ratings = [];
    }

    const ratingPayload = {
      load: load._id,
      loadId: load.loadId,
      score: numericScore,
      remark,
      ratedBy: req.user._id,
      ratedAt: new Date(),
    };

    const existingIndex = fleetOwner.ratings.findIndex(
      (rating) => rating.loadId === load.loadId,
    );

    if (existingIndex >= 0) {
      fleetOwner.ratings[existingIndex] = ratingPayload;
    } else {
      fleetOwner.ratings.push(ratingPayload);
    }

    const total = fleetOwner.ratings.reduce((sum, rating) => sum + Number(rating.score || 0), 0);
    fleetOwner.ratingCount = fleetOwner.ratings.length;
    fleetOwner.ratingAverage = fleetOwner.ratingCount ? total / fleetOwner.ratingCount : 0;

    load.staffRating = {
      score: numericScore,
      remark,
      ratedBy: req.user._id,
      ratedAt: new Date(),
    };

    await Promise.all([fleetOwner.save(), load.save()]);

    res.json({
      success: true,
      message: "Rating saved",
      data: {
        load,
        fleetOwnerRating: fleetOwner.ratingAverage,
        ratingCount: fleetOwner.ratingCount,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// ═══════════════════════════════════════════════════════════════════════════════
// ✅ REQ 14: Manual Bid Allotment - Award Bid Manually (NOT AUTOMATED)
// ═══════════════════════════════════════════════════════════════════════════════
const awardBid = async (req, res) => {
  try {
    const { fleetOwnerId, bidAmount } = req.body;

    if (!fleetOwnerId || bidAmount === undefined) {
      return res.status(400).json({
        message: "Fleet owner ID and bid amount are required",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    // Only staff/admin can award bids
    if (!["staff", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Load must be in OPEN or CLOSED bidding status
    if (!["OPEN", "CLOSED", "UPCOMING"].includes(load.bidStatus)) {
      return res.status(400).json({
        message: `Cannot award bid. Load bidStatus must be OPEN/CLOSED/UPCOMING, currently: ${load.bidStatus}`,
      });
    }

    // Find the fleet owner
    const fleetOwner = await FleetOwner.findById(fleetOwnerId);
    if (!fleetOwner) return res.status(404).json({ message: "Fleet owner not found" });

    // Set winning bid
    load.winningBid = {
      fleetOwnerId: fleetOwnerId,
      fleetOwnerName: fleetOwner.carrierName,
      amount: bidAmount,
      submittedAt: new Date(),
    };

    // Set bidding status to CLOSED (bid window closed after manual award)
    load.bidStatus = "CLOSED";

    // Auto-assign the fleet owner (REQUIREMENT: Manual award, but can also auto-assign)
    load.assignedFleetOwner = {
      fleetOwnerId: fleetOwnerId,
      fleetOwnerName: fleetOwner.carrierName,
      assignedAt: new Date(),
    };
    load.status = "ASSIGNED";
    load.transportStatus = "ASSIGNED";

    await load.save();

    // Update Bid collection to mark this bid as WINNING
    await Bid.updateOne(
      { loadId: load._id, fleetOwnerId: fleetOwnerId },
      { $set: { status: "WINNING" } }
    );

    // Mark other bids as REJECTED
    await Bid.updateMany(
      { loadId: load._id, fleetOwnerId: { $ne: fleetOwnerId } },
      { $set: { status: "REJECTED" } }
    );

    res.status(200).json({
      success: true,
      message: `Bid awarded to ${fleetOwner.carrierName} for $${bidAmount}`,
      data: load,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📧 Send Bid Acceptance Mail to the awarded winner (manual staff/admin action)
//    Requires a winner to already be awarded (load.winningBid set).
// ═══════════════════════════════════════════════════════════════════════════════
const sendBidAcceptanceMail = async (req, res) => {
  try {
    if (!["staff", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const winnerId = load.winningBid?.fleetOwnerId;
    if (!winnerId) {
      return res.status(400).json({
        message: "No winner has been awarded yet. Award a bid before sending the acceptance mail.",
      });
    }

    const fleetOwner = await FleetOwner.findById(winnerId);
    if (!fleetOwner) {
      return res.status(404).json({ message: "Winning fleet owner not found" });
    }

    const email = getFleetOwnerEmail(fleetOwner);
    if (!email) {
      return res.status(400).json({
        message: "Winning fleet owner has no contact email on file.",
      });
    }

    const emailStatus = await sendBidWon({
      load,
      fleetOwner,
      winningBid: load.winningBid,
      email,
    });

    load.acceptanceMailSent = true;
    load.acceptanceMailSentAt = new Date();
    await load.save();

    res.status(200).json({
      success: true,
      message: `Bid acceptance email sent to ${fleetOwner.carrierName} (${email})`,
      emailStatus,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ REQ 16: Reschedule Bidding - Change Bid Start/End Times
// ═══════════════════════════════════════════════════════════════════════════════
const rescheduleBidding = async (req, res) => {
  try {
    const { bidStartTime, bidEndTime } = req.body;

    if (!bidStartTime || !bidEndTime) {
      return res.status(400).json({
        message: "Both new start time and end time are required",
      });
    }

    const newStart = new Date(bidStartTime);
    const newEnd = new Date(bidEndTime);
    const now = new Date();

    if (newStart >= newEnd) {
      return res.status(400).json({
        message: "New end time must be after start time",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    // Only staff/admin can reschedule
    if (!["staff", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Can reschedule if bid is UPCOMING, OPEN, or already CLOSED
    if (!["UPCOMING", "OPEN", "CLOSED"].includes(load.bidStatus)) {
      return res.status(400).json({
        message: `Cannot reschedule. Load bidStatus must be UPCOMING/OPEN/CLOSED, currently: ${load.bidStatus}`,
      });
    }

    // Store old times for history
    const oldStart = load.bidStartTime;
    const oldEnd = load.bidEndTime;

    // Update bid times
    load.bidStartTime = newStart;
    load.bidEndTime = newEnd;

    // Update status based on new times
    if (now < newStart) {
      load.bidStatus = "UPCOMING";
    } else if (now >= newStart && now <= newEnd) {
      load.bidStatus = "OPEN";
    } else {
      load.bidStatus = "CLOSED";
    }

    // Add to history/notes
    load.remarks = (load.remarks || "") +
      `\n[RESCHEDULED] Old times: ${oldStart?.toISOString()} - ${oldEnd?.toISOString()} → New: ${newStart.toISOString()} - ${newEnd.toISOString()}`;

    await load.save();

    res.status(200).json({
      success: true,
      message: "Bidding rescheduled successfully",
      data: load,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// ✅ REQ 14: Discard Bid - Remove a Single Bid (Vendor Revision Support)
// ═══════════════════════════════════════════════════════════════════════════════
const discardBid = async (req, res) => {
  try {
    const { bidId } = req.body;

    if (!bidId) {
      return res.status(400).json({
        message: "Bid ID is required",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    // Only staff/admin can discard bids
    if (!["staff", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Find the bid in Bid collection
    const bidDoc = await Bid.findById(bidId);
    if (!bidDoc) {
      return res.status(404).json({ message: "Bid not found in system" });
    }
    const fleetOwnerIdStr = bidDoc.fleetOwnerId.toString();

    // If this was the winning bid, clear winning bid and un-assign
    if (load.winningBid?.fleetOwnerId?.toString() === fleetOwnerIdStr) {
      load.winningBid = undefined;
      load.assignedFleetOwner = undefined;
      load.status = "VERIFIED";
      load.transportStatus = "LOAD_PLANNER";
    }

    await load.save();

    // Instead of deleting, mark it as REJECTED
    bidDoc.status = "REJECTED";
    await bidDoc.save();

    res.status(200).json({
      success: true,
      message: "Bid discarded successfully",
      data: load,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ✅ REQ 14: Revise Bid - Allow Vendors to Modify Their Bid Amount
// ════════════════════════════════════════════════════════════════════════════════
const reviseBid = async (req, res) => {
  try {
    const { bidId, newAmount } = req.body;

    if (!bidId || newAmount === undefined) {
      return res.status(400).json({
        message: "Bid ID and new amount are required",
      });
    }

    if (newAmount <= 0) {
      return res.status(400).json({
        message: "Bid amount must be greater than 0",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    // Find the bid in the Bid collection first
    const bidDoc = await Bid.findById(bidId);
    if (!bidDoc) return res.status(404).json({ message: "Bid not found in system" });
    const fleetOwnerIdStr = bidDoc.fleetOwnerId.toString();

    // Only bid owner (fleetOwner) or staff can revise
    const userFleetOwner = await FleetOwner.findOne({ userId: req.user._id });
    if (req.user.role === "fleetOwner" && fleetOwnerIdStr !== userFleetOwner?._id?.toString()) {
      return res.status(403).json({ message: "Cannot revise bid of other vendors" });
    }

    // Bidding must still be OPEN or UPCOMING for vendors, but staff/admin can revise anytime
    if (req.user.role === "fleetOwner" && !["OPEN", "UPCOMING"].includes(load.bidStatus)) {
      return res.status(400).json({
        message: `Cannot revise bid. Bidding window is ${load.bidStatus}`,
      });
    }

    // Update the bid amount in the Bid collection
    bidDoc.amount = newAmount;
    bidDoc.revisedAt = new Date();
    await bidDoc.save();

    // If this bid is the winning bid, update the winning amount too
    if (load.winningBid?.fleetOwnerId?.toString() === fleetOwnerIdStr) {
      load.winningBid.amount = newAmount;
      await load.save();
    }

    res.status(200).json({
      success: true,
      message: "Bid revised successfully",
      data: load,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================= UNASSIGN LOAD =========================
// Removes the fleet owner assignment and resets the load back to
// NEW_LOAD so it re-appears in Dispatch Management.
const unassignLoad = async (req, res) => {
  try {
    const { loadId } = req.params;
    const load = await Load.findOne({ loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const updated = await Load.findOneAndUpdate(
      { loadId },
      {
        $unset: { assignedFleetOwner: "" },
        $set: {
          transportStatus: "NEW_LOAD",
          status: "VERIFIED",
        },
        $push: {
          transportStatusHistory: {
            status: "NEW_LOAD",
            updatedBy: req.user._id,
            updatedAt: new Date(),
            note: "Unassigned by staff/admin — returned to Dispatch Management",
          },
        },
      },
      { new: true }
    );

    res.json({ message: "Load unassigned successfully", load: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ========================= EXPORT =========================

module.exports = {
  getLoads,
  getLoadById,
  createLoad,
  updateLoad,
  updateLoadStatus,
  updateBiddingStatus,
  scheduleBidding,
  getOpenForBid,
  updateTransportStatus,
  uploadDocument,
  deleteDocument,
  assignFleetOwner,
  confirmAssignedLoadByFleetOwner,
  rateCompletedLoad,
  awardBid,
  sendBidAcceptanceMail,
  rescheduleBidding,
  rebidLoad,
  discardBid,
  reviseBid,
  unassignLoad,
};
