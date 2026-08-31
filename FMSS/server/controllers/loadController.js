const Load = require("../models/Load");
const User = require("../models/User");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");
const Address = require("../models/common/Address");
const Bid = require("../models/bidSchema");
const TrackingEvent = require("../models/TrackingEvent");
const fs = require("fs");
const StreetTurnPartner = require("../models/StreetTurnPartner");
const {
  buildStreetTurnAgreement,
} = require("../services/streetTurnAgreementService");
const ChassisCompany = require("../models/ChassisCompany");
const ShippingLine = require("../models/ShippingLine");
const Driver = require("../models/Driver");
const { resolveTimeZone, dayRangeInTz } = require("../utils/timezone");
const { LFD_BUCKETS, lfdFilter } = require("../utils/lfdBuckets");
const {
  PICKUP_DAYS,
  pickupDayFilter,
  accessorialFilter,
  unassignedFilter,
} = require("../utils/dashboardBuckets");
const {
  carrierAvailability,
  atCapacityMessage,
} = require("../utils/carrierCapacity");
const {
  sendLoadRequiresChanges,
  sendBidWon,
  sendBiddingScheduled,
  sendStreetTurnNotifications,
  streetTurnSignLink,
} = require("../services/emailService");

const { sendEmail, EMAIL_STATUS } = require("../utils/mailer");
const {
  findCarrierFor,
  accountPersonFor,
  carrierLoadFilter,
} = require("../utils/carrierAccount");
const whatsapp = require("../services/whatsappEvents");
const { isValidCharge, money } = require("../config/chargeTypes");
const audit = require("../services/auditService");

/**
 * The receivables ledger a load was created with, if the form built one.
 *
 * The base amount on a load IS its receivables total — see the
 * syncAmountWithReceivables hook on the Load model — so accepting these lines at
 * creation is what lets a load arrive with its books already open rather than
 * needing a second visit to the accounting screen.
 *
 * Unknown charge types are dropped rather than stored: a line the catalog does
 * not recognise contributes nothing to any total, and keeping it would show a
 * charge on the invoice that no report can account for.
 */
const receivableLinesFrom = (body, user) => {
  // Office work. What the customer is billed is built from the charge master by
  // staff, not stated by the party being billed — and the charge master is not
  // readable by a customer in the first place, so a breakdown arriving from one
  // did not come from the form.
  if (!["staff", "admin"].includes(user?.role)) return null;

  const submitted = body?.accounting?.receivables?.lines;
  if (!Array.isArray(submitted) || !submitted.length) return null;

  const lines = submitted
    .filter((line) => isValidCharge(line?.chargeType, "receivable"))
    .map((line) => ({
      chargeType: line.chargeType,
      amount: money(Number(line.amount) || 0),
      quantity: Number(line.quantity) || undefined,
      rate: Number(line.rate) || undefined,
      note: String(line.note || "").trim(),
      addedBy: user?._id,
      addedAt: new Date(),
    }))
    .filter((line) => line.amount !== 0 || line.note);

  if (!lines.length) return null;

  return {
    accounting: { receivables: { lines, currency: "USD", updatedBy: user?._id } },
  };
};

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

  // `streetTurnPartner` is the current name; `deliveryPartner` is still accepted
  // because the mobile app and any browser tab open across the deploy will keep
  // sending it for a while.
  const partnerName = String(
    payload.streetTurnPartner || payload.deliveryPartner || "",
  ).trim();
  if (!partnerName) {
    return { error: "A street turn partner must be selected to confirm a street turn." };
  }

  const partner = await StreetTurnPartner.findOne({ name: partnerName });
  if (!partner) {
    return { error: `Street turn partner "${partnerName}" is not in the master list.` };
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

      // Particulars for the transfer agreement. The SCAC comes from the master
      // rather than the request for the same reason the email does: it
      // identifies the transferee on a contract, and a caller must not be able
      // to put another carrier's code on it.
      transfereeScac: partner.scac || "",
      transferLocation: String(payload.transferLocation || "").trim(),
      returnLocation: String(payload.returnLocation || "").trim(),
      // Blank means "nothing noted", which the agreement states as "None" —
      // resolved here so the stored record and the document agree.
      equipmentCondition: String(payload.equipmentCondition || "").trim() || "None",
      governingLawState: String(payload.governingLawState || "").trim(),
    },
  };
};

/**
 * Builds the recipient list for a confirmed street turn and sends to each.
 *
 * Four parties have to hear about a street turn the moment it is confirmed: the
 * driver making the handover, the street turn partner receiving the container,
 * and the shipping line and chassis company whose equipment is changing hands.
 * The carrier and the office are copied because they answer for it.
 *
 * The driver used to be reached only through the carrier's account address —
 * the system had no driver records when this was written. It does now, so the
 * drivers actually assigned to the load are written to directly, and the
 * carrier contact is copied rather than standing in for them.
 */
const notifyStreetTurn = async (load, streetTurn, actor) => {
  const recipients = [
    { party: "Street Turn Partner", email: streetTurn.deliveryPartnerEmail },
    { party: "Shipping Line", email: streetTurn.shippingLineEmail },
    { party: "Chassis Company", email: streetTurn.chassisCompanyEmail },
  ];

  // The drivers on this load, by name where we have one — a driver reading
  // "you are receiving this as the Driver" should see their own handover.
  const driverIds = (load.driverAssignments || [])
    .map((assignment) => assignment.driver)
    .filter(Boolean);

  if (driverIds.length) {
    const drivers = await Driver.find({ _id: { $in: driverIds } })
      .select("name email")
      .lean();

    for (const driver of drivers) {
      if (driver.email) {
        recipients.push({
          party: driver.name ? `Driver (${driver.name})` : "Driver",
          email: driver.email,
        });
      }
    }
  }

  const fleetOwnerId = load.assignedFleetOwner?.fleetOwnerId;
  if (fleetOwnerId) {
    const fleetOwner = await FleetOwner.findById(fleetOwnerId).lean();
    const carrierEmail = getFleetOwnerEmail(fleetOwner);
    if (carrierEmail) {
      recipients.push({ party: "Assigned Carrier", email: carrierEmail });
    }
  }

  const admins = await User.find({ role: "admin", isActive: true })
    .select("email")
    .lean();
  for (const admin of admins) {
    recipients.push({ party: "Admin", email: admin.email });
  }

  // The partner is asked to sign the handover back, so their copy carries a
  // single-use link. Minted here rather than at confirmation time so that
  // re-sending a confirmation always issues a fresh, unexpired link.
  const signLink = streetTurn.deliveryPartnerEmail
    ? streetTurnSignLink(load.issueStreetTurnToken({ days: 14 }))
    : null;

  // Built once and passed to every recipient, so the copy the transferee signs
  // is word for word the copy the shipping line was sent.
  const agreement = buildStreetTurnAgreement({
    load,
    streetTurn,
    signerName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" "),
    signerTitle: actor?.role === "driver" ? "Driver" : "Authorised Representative",
  });

  return sendStreetTurnNotifications({
    load,
    streetTurn,
    recipients,
    signLink,
    agreement,
  });
};
const { buildPodDocument } = require("../services/podDocumentService");
const { publishTrackingUpdate } = require("../services/trackingBroadcaster");
const {
  notifyLoadCreated,
  notifyBiddingScheduled,
  notifyLoadStatusChanged,
} = require("../services/NotificationService");
const mongoose = require("mongoose");
const {
  requestInstantDispatch,
} = require("../services/instantDispatchService");
const {
  maskLoadForViewer,
  maskLoadsForViewer,
} = require("../utils/loadVisibility");

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
  // Office-side paperwork, hidden from the driver app.
  "Load Document",
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
      containerNo2,
      chassisNo2,
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

    // A Drop moves two containers, so it carries a second container/chassis
    // pair. All four numbers are optional — they are frequently unknown at
    // booking time and get filled in later. A Pick only carries the first pair.

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

    // A customer flagged over their credit limit is frozen: no new work goes on
    // the books until that flag is cleared on the customer record. Enforced for
    // every role — a client cannot raise the load itself, and staff cannot
    // raise one on the customer's behalf either.
    const customerAccount = await Customer.findOne({ user: customer })
      .select("preferences customerName")
      .lean();

    if (customerAccount?.preferences?.creditLimitExceeded) {
      return res.status(403).json({
        success: false,
        message: `${customerAccount.customerName || customerName} has exceeded their credit limit. No new loads can be created for this customer until the credit limit is cleared.`,
      });
    }

    const normalizedPickup = normalizeStopInput(pickup);
    const normalizedDrop = normalizeStopInput(drop);

    const newLoad = {
      customer,
      customerName,
      // Which route the customer chose. Recorded here even when the offer
      // cannot go out yet — the load form creates the load before its pickup
      // address exists, and instant dispatch needs the pickup's map pin to know
      // which drivers are near it. Persisting the choice is what lets the offer
      // be raised once the address lands.
      dispatchMode:
        String(req.body.dispatchMode || "").toUpperCase() === "INSTANT"
          ? "INSTANT"
          : "BID",
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
      containerNo2,
      chassisNo2,
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
      // Office-created loads are trusted; a customer's go to the queue. Admin
      // counts as office — an admin is a superset of staff, so their load must
      // not need somebody else to verify it.
      status:
        status ||
        (["staff", "admin"].includes(req.user.role)
          ? "VERIFIED"
          : "PENDING_VERIFICATION"),
      transportStatus: "LOAD_PLANNER",
      createdBy: req.user.role,
      creatorId: req.user._id,
      // The receivables breakdown behind the base amount, when the load form's
      // breakdown dialog was used. Sanitised rather than trusted: the lines come
      // from a form, and an unknown charge type would total to nothing and drag
      // every downstream figure with it.
      ...(receivableLinesFrom(req.body, req.user) || {}),
    };

    const load = await Load.create(newLoad);

    // Opens the trail. Awaited rather than fired and forgotten so the first
    // entry is on file before the response returns — a client that immediately
    // reloads the load should not see an empty history.
    await audit.recordCreated(load, req.user, req);

    // ─────────────────────────────────────────────
    // INSTANT DISPATCH
    // The customer asked for the fast route: offer it straight to the carriers
    // whose drivers are near the pickup instead of putting it in the office's
    // verification queue.
    //
    // A refusal here is not an error. No map pin on the pickup, nobody in
    // range, the branch has it switched off — all of them mean the same thing
    // in practice: this load goes the ordinary way. It is created either way,
    // and the response says which route it took so the customer is not left
    // thinking a truck is on the way when one is not.
    // ─────────────────────────────────────────────
    // Attempted here only when the pickup came in with the load — an API caller
    // posting a complete load, rather than the wizard, which saves the pickup on
    // a later step and raises the offer itself once it has.
    let instantResult = null;
    if (load.dispatchMode === "INSTANT" && load.pickup?.addressId) {
      try {
        instantResult = await requestInstantDispatch(load, {
          requestedBy: req.user._id,
          branchId: load.locationId,
        });
      } catch (dispatchError) {
        instantResult = { ok: false, reason: dispatchError.message };
      }
    }

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
      message: instantResult?.ok
        ? `Load created and offered to ${instantResult.offered} carrier${instantResult.offered === 1 ? "" : "s"} near the pickup.`
        : "Load created successfully",
      data: load,
      // Present only when instant dispatch was asked for, so the client can say
      // what happened — offered to N carriers, or why it fell back to bidding.
      ...(instantResult ? { instantDispatch: instantResult } : {}),
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

// Transport statuses that mean the load's journey is over. They are not a
// workflow `status` of their own — a delivered load is still ASSIGNED — so the
// Over tab is carved out of the same set All Transit reads, by transport status.
//
// Defined here rather than in the browser so the two halves of the split cannot
// drift: All Transit asks for everything but these, the Over tab asks for
// exactly these, and adding a terminal status moves loads between the two tabs
// from one edit. The phone app keeps its own copy of this list (mobile/App.js)
// because it filters a different endpoint client-side.
//
// "Over" means the truck has finished with it, not that the box has been
// emptied: a container loaded in the yard or dropped at a warehouse is sitting
// somewhere waiting on somebody else, and dispatch has nothing left to do about
// it. Both used to sit in All Transit indefinitely, which is why that tab filled
// up with loads nobody was moving.
const COMPLETED_TRANSPORT_STATUSES = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
];

// Transport statuses that hand the load to the back office. An invoiceable load
// is finished as far as dispatch is concerned — nothing about it will move
// again — but it is not finished as a piece of work: somebody still has to bill
// it. So it leaves All Transit without landing in Over, and turns up in
// Accounting instead, which is where the person who has to act on it is sitting.
//
// Kept separate from COMPLETED_TRANSPORT_STATUSES rather than added to it: the
// Over tab is the archive of journeys that ended, and a load waiting to be
// invoiced filed under "done" is exactly how it stops being invoiced.
const ACCOUNTING_TRANSPORT_STATUSES = ["INVOICED"];

// Everything that has left dispatch's hands, by one route or the other.
const OFF_TRANSIT_TRANSPORT_STATUSES = [
  ...COMPLETED_TRANSPORT_STATUSES,
  ...ACCOUNTING_TRANSPORT_STATUSES,
];

/** Trimmed string, or "" — multipart bodies arrive as strings either way. */
const trimmedText = (value) => String(value ?? "").trim();

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

    // The carrier's own bids on whatever comes back, resolved once and attached
    // to the payload below. Populated only for a fleet owner.
    let bidsByLoad = null;

    if (req.user.role === "fleetOwner") {
      const carrier = await findCarrierFor(req.user, "_id");

      // A counter-offer the office has put to this carrier and not yet had an
      // answer to. It belongs on their board whatever the bid window is doing —
      // the window has usually closed by the time an offer is made, and an
      // offer nobody can see is an offer nobody answers.
      const negotiatingLoadIds = carrier
        ? (
            await Bid.find({
              fleetOwnerId: carrier._id,
              "negotiation.status": "PENDING",
            })
              .select("loadId")
              .lean()
          ).map((bid) => bid.loadId)
        : [];

      // ─── One truck, one load ───────────────────────────────────────────────
      // A carrier with every truck already committed is not shown the board at
      // all. Browsing loads they are not allowed to accept wastes their time
      // and produces bids the office then has to unpick — see
      // utils/carrierCapacity.js. Their open negotiations are the one exception:
      // an offer already made to them is theirs to answer, and hiding it would
      // strand a live negotiation with no way to decline it.
      const availability = await carrierAvailability(carrier?._id);

      if (availability.atCapacity) {
        if (!negotiatingLoadIds.length) return res.json([]);
        query._id = { $in: negotiatingLoadIds };
      } else if (negotiatingLoadIds.length) {
        query.$or = [
          {
            status: "VERIFIED",
            bidStatus: req.query.bidStatus
              ? req.query.bidStatus
              : { $in: ["OPEN", "UPCOMING"] },
          },
          { _id: { $in: negotiatingLoadIds } },
        ];
      }

      // Only applied as plain fields when the `$or` above did not already say
      // it — the two forms cannot both be present or they would intersect and
      // drop the negotiated loads straight back out.
      if (!query.$or) {
        query.status = "VERIFIED";
        query.bidStatus = req.query.bidStatus
          ? req.query.bidStatus
          : { $in: ["OPEN", "UPCOMING"] };
      }

      bidsByLoad = new Map(
        carrier
          ? (await Bid.find({ fleetOwnerId: carrier._id }).lean()).map((bid) => [
              String(bid.loadId),
              bid,
            ])
          : [],
      );
    }

    if (req.query.status && req.user.role !== "fleetOwner") {
      query.status = req.query.status;
    }

    if (req.query.bidStatus && req.user.role !== "fleetOwner") {
      query.bidStatus = req.query.bidStatus;
    }

    // `?completed=true` is the Over tab, `?completed=false` is everything still
    // running, and `?accounting=true` is the loads waiting to be invoiced.
    // Skipped when the caller named a transport status outright — the status
    // dropdown is more specific than the tab split and must win, or filtering
    // for Delivered would come back empty.
    //
    // All Transit excludes both terminal sets, so an invoiceable load drops out
    // of it without turning up in Over.
    if (req.query.accounting === "true" && !req.query.transportStatus) {
      query.transportStatus = { $in: ACCOUNTING_TRANSPORT_STATUSES };
    } else if (req.query.completed !== undefined && !req.query.transportStatus) {
      query.transportStatus =
        req.query.completed === "true"
          ? { $in: COMPLETED_TRANSPORT_STATUSES }
          : { $nin: OFF_TRANSIT_TRANSPORT_STATUSES };
    }

    if (
      req.query.transportStatus &&
      req.query.transportStatus.trim() !== "All"
    ) {
      query.transportStatus = req.query.transportStatus;
    }

    // `?lfd=expired|today|upcoming` opens the loads behind a dashboard LFD tile.
    // It carries its own status scoping, so it replaces whatever the caller
    // passed rather than intersecting with it — otherwise the list would be a
    // subset of the tile it was opened from.
    if (req.query.lfd && req.user.role !== "fleetOwner") {
      const tz = resolveTimeZone(req.query.tz);
      const bucket = lfdFilter(req.query.lfd, dayRangeInTz(tz, 0));
      if (!bucket) {
        return res.status(400).json({
          message: `Unknown lfd filter "${req.query.lfd}". Expected one of: ${LFD_BUCKETS.join(", ")}.`,
        });
      }
      Object.assign(query, bucket);
    }

    // `?pickupDay=today|tomorrow` and `?accessorial=true` open the loads behind
    // the Same Day / Next Day / Accessorial Charges dashboard tiles. Like the
    // LFD buckets they carry their own status scoping, so they replace what the
    // caller passed rather than narrowing it.
    if (req.query.pickupDay && req.user.role !== "fleetOwner") {
      const tz = resolveTimeZone(req.query.tz);
      const bucket = pickupDayFilter(req.query.pickupDay, (offset) =>
        dayRangeInTz(tz, offset),
      );
      if (!bucket) {
        return res.status(400).json({
          message: `Unknown pickupDay filter "${req.query.pickupDay}". Expected one of: ${Object.keys(PICKUP_DAYS).join(", ")}.`,
        });
      }
      Object.assign(query, bucket);
    }

    if (req.query.accessorial === "true" && req.user.role !== "fleetOwner") {
      Object.assign(query, accessorialFilter());
    }

    // `?unassigned=true` opens the loads behind the Unassigned tile — verified
    // work nobody is carrying, whose status is locked until somebody is.
    if (req.query.unassigned === "true" && req.user.role !== "fleetOwner") {
      Object.assign(query, unassignedFilter());
    }

    const term = (req.query.q || "").trim();
    if (term) {
      // Nested under `$and` rather than assigned to `query.$or`: the carrier
      // visibility scope above may already own the top-level `$or`, and one
      // silently overwriting the other returns the wrong loads rather than
      // failing.
      (query.$and = query.$and || []).push({
        $or: await buildSearchClause(term),
      });
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

        // The carrier's own bid on this load, and any counter-offer waiting on
        // them. Attached here so the board can mark a negotiated load as such
        // rather than showing it as an ordinary open one — the difference is
        // the whole point of the offer.
        const myBid = bidsByLoad?.get(String(load._id));

        return {
          ...load,
          customerName,
          bidCount: bidCountMap.get(String(load._id)) || load.bids?.length || 0,
          pickup: hydrateStopFromAddressMap(load.pickup, addressMap),
          drop: hydrateStopFromAddressMap(load.drop, addressMap),
          ...(bidsByLoad
            ? {
                myBid: myBid
                  ? { amount: myBid.amount, status: myBid.status }
                  : null,
                // Only a still-open offer. Once answered, `amount` above
                // already reflects the outcome — the same shape /bidRoutes/myBids
                // returns, so the two screens read it the same way.
                negotiation:
                  myBid?.negotiation?.status === "PENDING"
                    ? {
                        // Carried so the board can answer the offer in place —
                        // /negotiation/respond identifies the bid, not the load.
                        bidId: myBid._id,
                        amount: myBid.negotiation.amount,
                        previousAmount: myBid.negotiation.previousAmount,
                        offeredAt: myBid.negotiation.offeredAt,
                      }
                    : null,
              }
            : {}),
        };
      }),
    );

    // A carrier is shown their payout, not what the customer pays — see
    // utils/loadVisibility.js. A no-op for the office and for every load that
    // did not come through instant dispatch.
    res.json(maskLoadsForViewer(enriched, req.user.role));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * The street turn transfer agreement, as the office sees it.
 *
 * The partner reads the agreement on their signing page and every party was
 * emailed a copy, but until now nobody inside the system could open the
 * document that was actually sent — the office had to go and find the email.
 * This serves the same document from the same builder, so what an admin reads
 * here is word for word what the transferee signed.
 *
 * Rendered from what was frozen onto the load at confirmation time, never from
 * today's masters, so a partner renamed or an email changed since does not
 * quietly rewrite an executed agreement.
 *
 * @desc    The transfer agreement for a confirmed street turn
 * @route   GET /api/loads/:loadId/street-turn-agreement
 * @access  Private (staff, admin)
 */
const getStreetTurnAgreement = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId })
      .populate("streetTurn.confirmedBy", "firstName lastName role")
      .lean();

    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    const streetTurn = load.streetTurn || {};

    // No agreement exists until the street turn was confirmed. A 200 saying so
    // rather than a 404: the load is real, it simply has not been street
    // turned, and the caller renders that differently from a broken request.
    if (!streetTurn.confirmedAt) {
      return res.json({ confirmed: false, loadId: load.loadId });
    }

    // Who signed on our side. The emailed copy named whoever confirmed it, so
    // the re-rendered copy has to name the same person rather than leaving the
    // transferor block blank.
    const confirmer = streetTurn.confirmedBy;
    const signerName = confirmer
      ? [confirmer.firstName, confirmer.lastName].filter(Boolean).join(" ")
      : "";

    const signature = streetTurn.partnerSignature || {};

    res.json({
      confirmed: true,
      loadId: load.loadId,
      agreement: buildStreetTurnAgreement({
        load,
        streetTurn,
        signerName,
        signerTitle:
          confirmer?.role === "driver" ? "Driver" : "Authorised Representative",
      }),
      note: streetTurn.note || "",
      confirmedAt: streetTurn.confirmedAt,
      confirmedByName: signerName,
      // Whether the transferee has actually accepted the container, which is
      // the question the office opens this to answer.
      signature: signature.signedAt
        ? {
            signedName: signature.signedName || "",
            signedTitle: signature.signedTitle || "",
            company: signature.company || "",
            signatureData: signature.signatureData || "",
            signedAt: signature.signedAt,
            note: signature.note || "",
            signedIp: signature.signedIp || "",
            signedUserAgent: signature.signedUserAgent || "",
          }
        : null,
      // Still outstanding, and until when the emailed link works — the office
      // needs to know whether to chase the partner or re-send.
      signatureLinkExpiresAt: signature.signedAt
        ? null
        : streetTurn.confirmationTokenExpiresAt || null,
      // A send that failed is only useful if someone can see it failed.
      notifications: (streetTurn.notifications || []).map((entry) => ({
        party: entry.party || "",
        email: entry.email || "",
        sent: !!entry.sent,
        reason: entry.reason || "",
        attemptedAt: entry.attemptedAt || null,
      })),
    });
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

    // Who to contact about this load. A load can carry several drivers, and none
    // of them is that person — see accountPersonFor in utils/carrierAccount.js.
    if (load.assignedFleetOwner?.fleetOwnerId) {
      const carrier = await FleetOwner.findById(load.assignedFleetOwner.fleetOwnerId)
        .select("contactPersons")
        .lean();
      responsePayload.accountPerson = accountPersonFor(carrier);
    }

    // 🔒 Customers (clients) must NOT see bid status/amounts — only the
    // assigned bidder (allotment) and transit updates. Strip bid financials.
    if (req.user?.role === "client") {
      delete responsePayload.winningBid;
      delete responsePayload.targetRate;
      delete responsePayload.margin;
      delete responsePayload.vendorRate;
      delete responsePayload.bidCount;
      // Who is driving is between the office and the carrier. A customer with
      // driver names on screen rings a driver mid-run about a booking question.
      delete responsePayload.driverAssignments;
    }

    // Same rule as the list: a carrier is shown their payout, never what the
    // customer pays — see utils/loadVisibility.js.
    res.json(maskLoadForViewer(responsePayload, req.user.role));
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

    // The pre-image the audit diff is taken against. A plain object rather than
    // the document: Mongoose hands out live references into the document, so
    // holding the document itself would give us a "before" that mutates into the
    // "after" as the fields below are assigned, and every diff would come out
    // empty.
    const beforeEdit = load.toObject();

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
      // The note described the submission being replaced. Leaving it behind
      // keeps the "changes requested" banner and the Changes Note column
      // showing on a load that has already been resubmitted.
      load.changesNote = undefined;
    }

    if (["staff", "admin"].includes(req.user.role)) {
      // Staff / admin may set any explicit status sent in the body
      if (req.body.status) {
        load.status = req.body.status;
        // Same reasoning as above — a note only belongs on a load that is
        // actually waiting for changes.
        if (req.body.status !== "REQUIRES_CHANGES") load.changesNote = undefined;
      }
      // Same rule the dedicated status endpoint enforces — see the note there.
      // An edit screen is not a way around it.
      if (req.body.transportStatus) {
        if (!load.hasCarrier()) {
          return res.status(409).json({
            code: "LOAD_NOT_ASSIGNED",
            message:
              "This load has not been assigned to a carrier yet, so its transport status cannot be set.",
          });
        }
        load.transportStatus = req.body.transportStatus;
      }
    }

    await load.save();

    // Writes nothing when nothing tracked actually moved — a save that only
    // touched `updatedAt` is not an event, and logging it would bury the ones
    // that are. `changesNote` carries the reason when staff asked for changes.
    await audit.recordFieldChanges({
      load,
      before: beforeEdit,
      after: load.toObject(),
      user: req.user,
      req,
      note: req.body.auditNote || undefined,
    });

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

    const previousStatus = load.status;

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

    // The reason travels with the entry, so "why was this sent back?" is
    // answerable from the trail rather than only from the client's dashboard.
    if (previousStatus !== load.status) {
      await audit.recordStatusChange({
        load,
        field: "status",
        from: previousStatus,
        to: load.status,
        note: load.changesNote,
        user: req.user,
        req,
      });
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
    // NOTHING TO REPORT UNTIL SOMEBODY IS CARRYING IT
    // ─────────────────────────────────────────────
    // Every transport status is a statement about a carrier — ready to pick up,
    // picked up, in transit, delivered. On an unassigned load there is nobody
    // those statements could be about, so setting one records a movement that
    // did not happen and then drives the dashboards, the customer's tracking
    // page and the LFD alarms off it. The status stays locked until the load is
    // assigned; assignment itself sets ASSIGNED, which is the first honest value
    // it can have.
    if (!load.hasCarrier()) {
      return res.status(409).json({
        success: false,
        code: "LOAD_NOT_ASSIGNED",
        message:
          "This load has not been assigned to a carrier yet. Assign it first — its status cannot be updated before then.",
      });
    }

    // ─────────────────────────────────────────────
    // WHICH LEG IS THIS UPDATE ABOUT
    // ─────────────────────────────────────────────
    // A load split between carriers has one status per leg, so an update has to
    // land on a leg rather than on the load. The load-level status is then
    // re-derived from all of them — see rollupTransportStatus.
    //
    // The caller never has to say which leg: a carrier or their driver can only
    // be on their own, and it is resolved from the account rather than from
    // anything they send. The office can name one with `legId`, and without it
    // gets the leg the load is actually waiting on, which is the one somebody
    // ringing the office is asking about.
    let activeLeg = null;

    if (load.hasLegs()) {
      if (["fleetOwner", "driver"].includes(role)) {
        const carrier = await findCarrierFor(req.user, "_id");
        activeLeg = carrier ? load.legFor(carrier._id) : null;

        if (!activeLeg) {
          return res.status(403).json({
            success: false,
            message: "You do not have a leg of this load to update.",
          });
        }
      } else if (req.body.legId) {
        activeLeg = load.assignments.id(req.body.legId);
        if (!activeLeg) {
          return res.status(404).json({
            success: false,
            message: "That leg is not on this load.",
          });
        }
      } else {
        const waiting = load.assignments.filter(
          (leg) => !Load.LEG_FINISHED.includes(leg.transportStatus),
        );
        activeLeg = waiting.length
          ? waiting.reduce((least, leg) =>
              Load.LEG_ORDER.indexOf(leg.transportStatus) <
              Load.LEG_ORDER.indexOf(least.transportStatus)
                ? leg
                : least,
            )
          : load.assignments[load.assignments.length - 1];
      }
    }

    // What the one-way progression rules below are measured against: this leg
    // if the load has legs, the load itself if it does not.
    const currentStatus = activeLeg ? activeLeg.transportStatus : load.transportStatus;

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

    if (currentStatus === transportStatus && !isExtraOriginPickup) {
      return res.status(400).json({
        success: false,
        message: "Load is already in this status.",
      });
    }

    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
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
        )}" — the load is already at "${currentStatus.replace(
          /_/g,
          " ",
        )}".`,
      });
    }

    if (transportStatus === "DELIVERED") {
      // ─────────────────────────────────────────────
      // DELIVERY PROOF REQUIRED
      // ─────────────────────────────────────────────
      // A photo of the container actually being dropped, not just a signature.
      // The signature proves somebody signed; the picture proves the box went
      // where it was meant to, which is the thing a customer disputes weeks
      // later when nobody can remember the stop.
      //
      // Carrier-side only, matching the pickup-proof rule above. Staff and admin
      // marking a load delivered are correcting the record from the office —
      // they were not at the warehouse and have no photo to give, and blocking
      // them would leave the load stuck at the previous status instead.
      if (["fleetOwner", "driver"].includes(role)) {
        const hasNewProof = req.files && req.files.length > 0;
        const hasExistingProof = (load.deliveryProof?.images || []).length > 0;

        if (!hasNewProof && !hasExistingProof) {
          return res.status(400).json({
            success: false,
            message:
              "A photo of the container at the drop is required before you can complete this delivery.",
          });
        }

        if (hasNewProof) {
          load.deliveryProof = {
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
      }

      if (!signatureData) {
        return res.status(400).json({
          success: false,
          message: "Delivery signature is required when marking DELIVERED.",
        });
      }

      // Who took it. Required of the carrier side for the same reason the photo
      // is: a signature says somebody signed, not who, and "who signed for it"
      // is the first question asked when a delivery is disputed. The office
      // marking a load delivered from their desk was not at the door, so they
      // are asked for it but not held to it.
      const receivedByName = trimmedText(req.body.receivedByName);

      if (!receivedByName && ["fleetOwner", "driver"].includes(role)) {
        return res.status(400).json({
          success: false,
          message:
            "The name of the person who took the delivery is required when marking DELIVERED.",
        });
      }

      if (receivedByName) {
        load.receivedBy = {
          name: receivedByName,
          title: trimmedText(req.body.receivedByTitle),
          capturedAt: new Date(),
        };
      }

      generatedPodDocument = await buildPodDocument({
        load,
        signatureData,
        // Passed rather than read off `load` inside the builder so the POD is
        // stamped with the name given at this delivery even on a re-delivery.
        receivedBy: load.receivedBy,
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
    const previousTransportStatus = currentStatus;

    if (activeLeg) {
      activeLeg.transportStatus = transportStatus;
      activeLeg.transportStatusHistory.push({
        status: transportStatus,
        changedAt: new Date(),
        changedBy: req.user._id,
        note: note || "",
      });
      // The load is only as far along as its least advanced leg.
      load.rollupTransportStatus();
    } else {
      load.transportStatus = transportStatus;
    }

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

    // `transportStatusHistory` on the load already records the sequence for the
    // tracking timeline; this puts the same event on the audit trail alongside
    // the edits, notes and financial changes, so one screen answers "what
    // happened to this load" rather than three.
    if (previousTransportStatus !== transportStatus) {
      await audit.recordStatusChange({
        load,
        field: "transportStatus",
        from: previousTransportStatus,
        to: transportStatus,
        note,
        user: req.user,
        req,
      });

      // WhatsApp alerts. Not awaited into the response and never able to throw
      // — a driver marking a load delivered must not see an error because the
      // messaging integration is misconfigured. See services/whatsappEvents.js.
      //
      // Pickup and delivery go to the customer and have their own wording; every
      // other move is an internal one the carrier's contact gets.
      if (transportStatus === "PICKED_UP") {
        whatsapp.onPickupConfirmed(load, req.user);
      } else if (transportStatus === "DELIVERED") {
        whatsapp.onDelivered(load, req.user);
      } else if (transportStatus === "INVOICED") {
        whatsapp.onLoadCompleted(load, req.user);
      } else {
        whatsapp.onStatusChanged(load, transportStatus, req.user);
      }
    }

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
        streetTurnNotifications = await notifyStreetTurn(
          load,
          confirmedStreetTurn,
          req.user,
        );
      } catch (err) {
        console.error("Street turn notifications failed:", err);
        streetTurnNotifications = [];
      }

      load.streetTurn.notifications = streetTurnNotifications;
      await load.save();

      // Written into the load's own history, not just onto the streetTurn
      // subdocument. "Who was told, at what address, and did it actually go?"
      // is the question asked weeks later when a container is disputed, and the
      // audit trail is where anyone thinks to look for it. Failures are named
      // rather than omitted — a silent gap reads as "nobody was told".
      try {
        const sent = (streetTurnNotifications || []).filter((n) => n.sent);
        const failed = (streetTurnNotifications || []).filter((n) => !n.sent);

        const describe = (list) =>
          list.map((n) => `${n.party} <${n.email}>`).join(", ") || "none";

        await audit.recordCommunication({
          load,
          summary:
            `Street turn confirmed with ${confirmedStreetTurn.deliveryPartner}` +
            ` — notified ${sent.length} of ${(streetTurnNotifications || []).length} parties`,
          body:
            `Sent to: ${describe(sent)}` +
            (failed.length
              ? `\nNot sent: ${failed
                  .map((n) => `${n.party} <${n.email}> (${n.reason || "unknown error"})`)
                  .join(", ")}`
              : "") +
            (confirmedStreetTurn.shippingLine
              ? `\nShipping line: ${confirmedStreetTurn.shippingLine}`
              : "") +
            (confirmedStreetTurn.chassisCompany
              ? `\nChassis company: ${confirmedStreetTurn.chassisCompany}`
              : "") +
            `\nThe street turn partner was sent a link to sign their acknowledgement.`,
          user: req.user,
          req,
        });
      } catch (err) {
        // The note is a record of the send, not part of it.
        console.error("Street turn audit note failed:", err);
      }
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


// ═══════════════════════════════════════════════════════════════════════════════
// Carrier legs — more than one carrier on the same load
//
// A load that changes hands part way (port → yard with one carrier, yard →
// consignee with another) is described by a list of legs rather than by a
// second fleet-owner field. Each leg names its carrier and its own two ends,
// and carries its own progress.
//
// The whole list is replaced on every call rather than patched leg by leg. A
// dispatcher works out the split as one decision — "these two carriers, this
// handover point" — and a set of add/remove/reorder calls would let a load sit
// in a half-edited state between them, visible to both carriers.
// ═══════════════════════════════════════════════════════════════════════════════

const trimmed = (value) => String(value ?? "").trim();

/** One end of a leg, from either a stop on the load or something typed in. */
const normalizeLegPoint = (raw, load, kind) => {
  const point = raw || {};

  // A stop reference is resolved here rather than trusted from the browser:
  // the client sends which stop was picked, and the address is copied off the
  // load itself so a leg can never quietly disagree with the stop it names.
  if (point.source === "STOP") {
    const stops =
      kind === "origin"
        ? load.pickups?.length
          ? load.pickups
          : [load.pickup]
        : load.drops?.length
          ? load.drops
          : [load.drop];

    const index = Number(point.stopIndex);
    const stop = stops?.[index];

    if (stop) {
      return {
        source: "STOP",
        stopIndex: index,
        company: stop.company || "",
        address: stop.address || "",
        city: stop.city || "",
        state: stop.state || "",
        zip: stop.zip || "",
      };
    }
    // A stop that no longer exists (the load was edited down) falls through to
    // being kept as typed, rather than silently emptying the leg.
  }

  return {
    source: "CUSTOM",
    company: trimmed(point.company),
    address: trimmed(point.address),
    city: trimmed(point.city),
    state: trimmed(point.state),
    zip: trimmed(point.zip),
  };
};

const legPointIsEmpty = (point) =>
  !point.company && !point.address && !point.city && !point.state && !point.zip;

// @desc    Set every carrier leg on a load at once
// @route   PUT /api/loads/:loadId/assignments
// @access  Private (staff, admin)
const setLoadAssignments = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const submitted = Array.isArray(req.body.assignments)
      ? req.body.assignments
      : [];

    if (!submitted.length) {
      return res.status(400).json({
        message: "Name at least one carrier. To clear the load instead, re-bid it.",
      });
    }

    // Resolved in one query, and scoped: FleetOwner is tenant-scoped, so a
    // carrier at another location cannot be assigned by naming their id.
    const ids = submitted.map((row) => row.fleetOwnerId).filter(Boolean);
    if (ids.length !== submitted.length) {
      return res.status(400).json({ message: "Every leg needs a carrier." });
    }

    const carriers = await FleetOwner.find({ _id: { $in: ids } })
      .select("_id carrierName fleetOwnerCode")
      .lean();
    const carrierById = new Map(carriers.map((c) => [String(c._id), c]));

    const unknown = ids.filter((id) => !carrierById.has(String(id)));
    if (unknown.length) {
      return res.status(404).json({
        message: "One of those carriers was not found at this location.",
      });
    }

    // Progress already made is kept when a leg survives the edit. Adding a
    // third carrier must not send the first one's in-transit leg back to
    // ASSIGNED — the truck is where it is regardless of the paperwork.
    const existingById = new Map(
      (load.assignments || []).map((leg) => [String(leg._id), leg]),
    );

    const legs = submitted.map((row) => {
      const carrier = carrierById.get(String(row.fleetOwnerId));
      const previous = row._id ? existingById.get(String(row._id)) : null;

      const origin = normalizeLegPoint(row.origin, load, "origin");
      const destination = normalizeLegPoint(row.destination, load, "destination");

      return {
        ...(previous ? { _id: previous._id } : {}),
        fleetOwnerId: carrier._id,
        fleetOwnerName: carrier.carrierName,
        fleetOwnerCode: carrier.fleetOwnerCode,
        origin,
        destination,
        transportStatus: previous?.transportStatus || "ASSIGNED",
        transportStatusHistory: previous?.transportStatusHistory || [],
        carrierRate:
          row.carrierRate === "" || row.carrierRate === undefined
            ? previous?.carrierRate
            : Number(row.carrierRate),
        note: trimmed(row.note),
        assignedAt: previous?.assignedAt || new Date(),
        assignedBy: previous?.assignedBy || req.user._id,
      };
    });

    const missingEnds = legs
      .map((leg, i) =>
        legPointIsEmpty(leg.origin) || legPointIsEmpty(leg.destination) ? i + 1 : null,
      )
      .filter(Boolean);

    if (missingEnds.length) {
      return res.status(400).json({
        message: `Leg ${missingEnds.join(", ")} needs both an origin and a destination.`,
      });
    }

    const previousNames = (load.assignments || [])
      .map((leg) => leg.fleetOwnerName)
      .join(", ");

    load.assignments = legs;

    // The first leg is the primary carrier. Everything written before legs
    // existed — reports, stats, ratings, the carrier's own load list — reads
    // this field, and on a single-carrier load it means exactly what it always
    // did.
    load.assignedFleetOwner = {
      fleetOwnerId: legs[0].fleetOwnerId,
      fleetOwnerName: legs[0].fleetOwnerName,
      assignedAt: legs[0].assignedAt,
    };

    load.status = "ASSIGNED";
    load.rollupTransportStatus();

    // Direct assignment bypasses bidding, exactly as the single-carrier assign
    // does — otherwise the cron would re-open a bid window on a load that is
    // already out with two carriers.
    load.bidStatus = "CLOSED";
    load.bidStartTime = undefined;
    load.bidEndTime = undefined;
    load.winningBid = undefined;

    await load.save();

    await audit.recordAssignment({
      load,
      carrierName: legs.map((leg) => leg.fleetOwnerName).join(" → "),
      previousName: previousNames || undefined,
      user: req.user,
      req,
    });

    res.json({
      message:
        legs.length === 1
          ? `Load ${load.loadId} assigned to ${legs[0].fleetOwnerName}.`
          : `Load ${load.loadId} split across ${legs.length} carriers.`,
      load,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Assign Fleet Owner
const assignFleetOwner = async (req, res) => {
  try {
    const { fleetOwnerId, fleetOwnerName } = req.body;

    // ─── One truck, one load ─────────────────────────────────────────────────
    // Checked here as well as on the carrier's own screens, because this is the
    // office assigning directly and never goes near them. Reassigning a load to
    // the carrier who already holds it is not a second load, so it is allowed —
    // otherwise correcting a typo in a carrier name would be blocked by the
    // load being corrected.
    const availability = await carrierAvailability(fleetOwnerId);
    if (
      availability.atCapacity &&
      availability.blockingLoad?.loadId !== req.params.loadId
    ) {
      return res.status(409).json({
        code: "CARRIER_AT_CAPACITY",
        message:
          `${fleetOwnerName || "That carrier"} has no truck free — ` +
          `${availability.running} of ${availability.trucks} already running, ` +
          `including load ${availability.blockingLoad?.loadId || "in progress"}. ` +
          "Pick another carrier, or wait until that load is delivered.",
      });
    }

    // Read before the update so the trail can say who the load moved *from* —
    // a reassignment is exactly the change somebody later asks about, and
    // findOneAndUpdate only hands back one side of it.
    const previous = await Load.findOne({ loadId: req.params.loadId })
      .select("assignedFleetOwner")
      .lean();

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

    await audit.recordAssignment({
      load,
      carrierName: fleetOwnerName,
      previousName: previous?.assignedFleetOwner?.fleetOwnerName,
      user: req.user,
      req,
    });

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
// @desc    Set which of the carrier's drivers run this load
// @route   PUT /api/loads/:loadId/drivers
// @access  Private (the assigned carrier; staff/admin on their behalf)
//
// A load is awarded to a carrier, and the carrier decides who drives it. More
// than one driver is normal: a long move gets handed over partway, so each
// assignment carries its own pickup and its own destination rather than sharing
// the load's.
//
// The whole list is replaced rather than appended to. Dispatch is a decision
// about who is on the load right now, and merging would leave a driver who was
// swapped out still attached with no way to say so.
const setLoadDrivers = async (req, res) => {
  try {
    const office = ["staff", "admin"].includes(req.user.role);

    // The carrier is read off the account for a carrier-side caller so a driver
    // sub-account can only ever touch their own carrier's load. The office has
    // to name one, and tenant scope keeps that to their own location.
    const carrier = office
      ? null
      : await findCarrierFor(req.user, "_id carrierName contactPersons");

    if (!office && !carrier) {
      return res.status(404).json({ message: "No carrier is linked to your account." });
    }

    const query = { loadId: req.params.loadId };
    // Their own load, or their own leg of one split between carriers.
    if (carrier) Object.assign(query, carrierLoadFilter(carrier._id));

    const load = await Load.findOne(query);
    if (!load) {
      return res.status(404).json({
        message: office
          ? "Load not found at this location."
          : "That load is not assigned to you.",
      });
    }

    const rows = Array.isArray(req.body.drivers) ? req.body.drivers : [];

    if (rows.length > 10) {
      return res.status(400).json({
        message: `That is ${rows.length} drivers on one load — check the list.`,
      });
    }

    // Every driver must belong to the carrier the load is assigned to. Checked
    // against the roster rather than trusted from the request, or a carrier
    // could attach somebody else's driver to their load.
    const carrierId = carrier?._id || load.assignedFleetOwner?.fleetOwnerId;
    if (rows.length && !carrierId) {
      return res.status(400).json({
        message: "Assign the load to a carrier before naming drivers.",
      });
    }

    const ids = rows.map((r) => String(r.driver || r.driverId || "")).filter(Boolean);

    if (ids.length !== rows.length) {
      return res.status(400).json({ message: "Every row needs a driver." });
    }

    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ message: "The same driver is listed twice." });
    }

    const roster = ids.length
      ? await Driver.find({ _id: { $in: ids }, fleetOwner: carrierId })
          .select("_id name driverCode")
          .lean()
      : [];

    if (roster.length !== ids.length) {
      return res.status(400).json({
        message: "One or more of those drivers is not on this carrier's roster.",
      });
    }

    const byId = new Map(roster.map((d) => [String(d._id), d]));
    const stop = (raw = {}) => ({
      address: String(raw.address || "").trim(),
      city: String(raw.city || "").trim(),
      state: String(raw.state || "").trim(),
      zip: String(raw.zip || "").trim(),
    });

    const previous = new Map(
      (load.driverAssignments || []).map((a) => [String(a.driver), a]),
    );

    const mine = rows.map((row) => {
      const id = String(row.driver || row.driverId);
      const driver = byId.get(id);
      const before = previous.get(id);

      return {
        driver: driver._id,
        fleetOwnerId: carrierId,
        driverName: driver.name,
        driverCode: driver.driverCode || "",
        pickup: stop(row.pickup),
        drop: stop(row.drop),
        note: String(row.note || "").trim(),
        // A driver who was already on the load keeps their original timestamp —
        // editing another driver's leg is not a re-assignment of this one.
        assignedAt: before?.assignedAt || new Date(),
        assignedBy: before?.assignedBy || req.user._id,
      };
    });

    // Only this carrier's own rows are replaced. On a load split between
    // carriers each one names their own drivers, and a straight overwrite would
    // mean the second carrier to save wiped the first carrier's drivers off the
    // load — the office would see a load with half its drivers missing and no
    // trace of what removed them.
    //
    // The office, working on the whole load rather than as a carrier, is scoped
    // to the carrier they are acting for, which is the primary one unless the
    // request names another.
    const others = (load.driverAssignments || []).filter(
      (a) => String(a.fleetOwnerId || "") !== String(carrierId),
    );

    load.driverAssignments = [...others, ...mine];

    await load.save();

    // Tells each driver about their own leg. Fire-and-forget.
    if (mine.length) {
      whatsapp.onDriversAssigned(load, mine, req.user);
    }

    res.json({
      message: mine.length
        ? `${mine.length} driver(s) on load ${load.loadId}.`
        : `Drivers cleared from load ${load.loadId}.`,
      driverAssignments: load.driverAssignments,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const confirmAssignedLoadByFleetOwner = async (req, res) => {
  try {
    // Resolved from the account so a driver sub-account confirms on behalf of
    // their own carrier and nobody else's — see utils/carrierAccount.js.
    const fleetOwner = await findCarrierFor(req.user);

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    // Find load
    const load = await Load.findOne({
      loadId: req.params.loadId,
      ...carrierLoadFilter(fleetOwner._id),
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


// @desc    Email the customer directly about one load, from the tracking page
// @route   POST /api/loads/:loadId/email-customer
// @access  Private (staff/admin)
//
// Every other mail the system sends is triggered by an event. This one is
// composed by a staff member, so the body is theirs — the load reference is
// prepended as a header block so the customer always knows which move the note
// is about, and the reply-to is the sender's own address.
const emailCustomer = async (req, res) => {
  try {
    const { subject, message, cc } = req.body;

    if (!String(subject || "").trim() || !String(message || "").trim()) {
      return res
        .status(400)
        .json({ message: "Both a subject and a message are required." });
    }

    const load = await Load.findOne({ loadId: req.params.loadId }).lean();
    if (!load) return res.status(404).json({ message: "Load not found" });

    // The customer's login address is the reliable one; the Customer record's
    // per-purpose addresses (POD, delivery) are optional extras.
    const customerUser = load.customer
      ? await User.findById(load.customer).select("email firstName lastName").lean()
      : null;

    const customerRecord = load.customer
      ? await Customer.findOne({ user: load.customer })
          .select("customerName emails")
          .lean()
      : null;

    const to = customerUser?.email || customerRecord?.emails?.deliveryEmail;
    if (!to) {
      return res.status(400).json({
        message:
          "This customer has no email address on record, so the message cannot be sent.",
      });
    }

    const origin = [load.pickup?.city, load.pickup?.state].filter(Boolean).join(", ");
    const destination = [load.drop?.city, load.drop?.state].filter(Boolean).join(", ");

    const reference = [
      ["Load", load.loadId],
      ["Reference", load.refNo],
      ["Container", load.containerNo],
      ["Route", origin && destination ? `${origin} → ${destination}` : null],
      ["Status", load.transportStatus?.replace(/_/g, " ")],
    ].filter(([, value]) => value);

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <table style="border-collapse:collapse;margin-bottom:16px">
          ${reference
            .map(
              ([label, value]) =>
                `<tr><td style="padding:2px 12px 2px 0;color:#666">${label}</td><td style="padding:2px 0;font-weight:600">${value}</td></tr>`,
            )
            .join("")}
        </table>
        <div style="white-space:pre-wrap;line-height:1.5">${String(message)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</div>
      </div>
    `;

    const text = `${reference.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\n${message}`;

    const result = await sendEmail({
      to: cc ? `${to}, ${cc}` : to,
      subject,
      text,
      html,
    });

    // sendEmail never throws — it reports. A disabled or misconfigured mail
    // setup must not read as a successful send on the staff member's screen.
    if (!result.sent) {
      return res.status(502).json({
        success: false,
        reason: result.reason,
        message:
          result.reason === EMAIL_STATUS.DISABLED
            ? "Email is switched off in Email Settings, so nothing was sent."
            : result.message || "The message could not be sent.",
      });
    }

    res.json({ success: true, message: `Message sent to ${to}.`, to });
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
// Award a load to a fleet owner at a settled amount.
//
// Shared by the manual award and by the auto-award that fires when a fleet
// owner accepts a negotiated amount, so both routes leave the load in exactly
// the same state — including `vendorRate`, which is rewritten to the agreed
// amount. That matters: the apps show `vendorRate` as the carrier payout, so
// leaving the pre-bid target rate there would display a number the parties
// never agreed on. `targetRate` and `margin` still hold the original figures.
// ═══════════════════════════════════════════════════════════════════════════════
const applyBidAward = async (load, { fleetOwner, amount, bidId }) => {
  const settledAmount = Number(amount);

  load.winningBid = {
    ...(bidId ? { id: bidId } : {}),
    fleetOwnerId: fleetOwner._id,
    fleetOwnerName: fleetOwner.carrierName,
    amount: settledAmount,
    submittedAt: new Date(),
  };

  // Single source of truth for "what this carrier is paid".
  load.vendorRate = settledAmount;

  load.bidStatus = "CLOSED";
  load.assignedFleetOwner = {
    fleetOwnerId: fleetOwner._id,
    fleetOwnerName: fleetOwner.carrierName,
    assignedAt: new Date(),
  };
  load.status = "ASSIGNED";
  load.transportStatus = "ASSIGNED";

  await load.save();

  await Bid.updateOne(
    { loadId: load._id, fleetOwnerId: fleetOwner._id },
    { $set: { status: "WINNING" } },
  );
  await Bid.updateMany(
    { loadId: load._id, fleetOwnerId: { $ne: fleetOwner._id } },
    { $set: { status: "REJECTED" } },
  );

  return load;
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

    // Awarding is an assignment by another name, so it answers to the same
    // capacity rule — see utils/carrierCapacity.js. A carrier whose bid was
    // placed before their truck was committed can still be sitting on the list.
    const availability = await carrierAvailability(fleetOwner._id);
    if (
      availability.atCapacity &&
      availability.blockingLoad?.loadId !== load.loadId
    ) {
      return res.status(409).json({
        code: "CARRIER_AT_CAPACITY",
        message:
          `${fleetOwner.carrierName || "That carrier"} has no truck free — ` +
          `${availability.running} of ${availability.trucks} already running, ` +
          `including load ${availability.blockingLoad?.loadId || "in progress"}. ` +
          "Award it to another bidder, or wait until that load is delivered.",
      });
    }

    await applyBidAward(load, { fleetOwner, amount: bidAmount });

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

    // A fleet owner revising their own bid is just a new bid — it takes effect
    // straight away, and supersedes any offer they had not answered yet.
    if (req.user.role === "fleetOwner") {
      bidDoc.amount = newAmount;
      bidDoc.revisedAt = new Date();
      bidDoc.negotiation = { status: "NONE" };
      await bidDoc.save();

      if (load.winningBid?.fleetOwnerId?.toString() === fleetOwnerIdStr) {
        load.winningBid.amount = newAmount;
        load.vendorRate = newAmount;
        await load.save();
      }

      return res.status(200).json({
        success: true,
        message: "Bid revised successfully",
        data: load,
        bid: bidDoc,
      });
    }

    // Staff/admin are negotiating, not editing someone else's bid. The offer
    // waits for the fleet owner; accepting it awards the load automatically.
    bidDoc.negotiation = {
      amount: newAmount,
      status: "PENDING",
      previousAmount: bidDoc.amount,
      offeredAt: new Date(),
      respondedAt: undefined,
    };
    await bidDoc.save();

    res.status(200).json({
      success: true,
      message: `Offer of $${newAmount} sent to the carrier for acceptance`,
      data: load,
      bid: bidDoc,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Fleet owner answers a negotiated amount.
//
// Accepting settles the bid at the offered amount and awards the load then and
// there — no second manual step — so the carrier who agreed to the reduced
// figure is the one who gets it.
// ═══════════════════════════════════════════════════════════════════════════════
const respondToNegotiation = async (req, res) => {
  try {
    const { bidId, accept } = req.body;

    if (!bidId || typeof accept !== "boolean") {
      return res.status(400).json({
        message: "Bid ID and an accept flag (true/false) are required",
      });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const bidDoc = await Bid.findById(bidId);
    if (!bidDoc || bidDoc.loadId.toString() !== load._id.toString()) {
      return res.status(404).json({ message: "Bid not found for this load" });
    }

    // Only the carrier who owns the bid may answer it.
    const fleetOwner = await FleetOwner.findOne({ userId: req.user._id });
    if (!fleetOwner || bidDoc.fleetOwnerId.toString() !== fleetOwner._id.toString()) {
      return res.status(403).json({ message: "Cannot respond to another carrier's bid" });
    }

    if (bidDoc.negotiation?.status !== "PENDING") {
      return res.status(400).json({
        message: "There is no offer awaiting your response on this bid",
      });
    }

    // Guard the race where the load was awarded elsewhere while the offer sat
    // unanswered — accepting must not reassign a load already given away.
    const alreadyAwardedToSomeoneElse =
      load.winningBid?.fleetOwnerId &&
      load.winningBid.fleetOwnerId.toString() !== fleetOwner._id.toString();

    if (accept && alreadyAwardedToSomeoneElse) {
      return res.status(409).json({
        message: "This load has already been awarded to another carrier",
      });
    }

    const offeredAmount = bidDoc.negotiation.amount;

    if (!accept) {
      bidDoc.negotiation.status = "DECLINED";
      bidDoc.negotiation.respondedAt = new Date();
      await bidDoc.save();

      return res.status(200).json({
        success: true,
        message: "Offer declined",
        data: load,
        bid: bidDoc,
      });
    }

    bidDoc.amount = offeredAmount;
    bidDoc.revisedAt = new Date();
    bidDoc.negotiation.status = "ACCEPTED";
    bidDoc.negotiation.respondedAt = new Date();
    await bidDoc.save();

    // applyBidAward re-stamps bid statuses, so save the acceptance first.
    await applyBidAward(load, {
      fleetOwner,
      amount: offeredAmount,
      bidId: bidDoc._id,
    });

    res.status(200).json({
      success: true,
      message: `Offer accepted — load awarded at $${offeredAmount}`,
      data: load,
      bid: bidDoc,
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


// ═══════════════════════════════════════════════════════════════════════════
// STATUS TIMELINE CORRECTIONS
// ═══════════════════════════════════════════════════════════════════════════
// The timeline is a record of what happened and when, and it is read as one —
// by the customer chasing a delivery, by accounting working out detention, by
// anybody arguing about a late arrival. It is also, unavoidably, sometimes
// wrong: a driver marks a load picked up an hour after they actually loaded, or
// taps the wrong status and immediately taps the right one, leaving a step in
// the history that never happened.
//
// So the timeline can be corrected — but only by an admin, and every correction
// is written to the audit trail with what it used to say. An editable history
// with no record of the edit is not a record at all.
// ═══════════════════════════════════════════════════════════════════════════

/** The load and the one history entry named by the route, or an error to send. */
const findHistoryEntry = async (loadId, entryId) => {
  const load = await Load.findOne({ loadId });
  if (!load) return { error: { status: 404, message: "Load not found" } };

  const entry = load.transportStatusHistory?.id(entryId);
  if (!entry) {
    return {
      error: { status: 404, message: "That entry is not on this load's timeline." },
    };
  }

  return { load, entry };
};

// @desc    Correct the time or note on one timeline entry
// @route   PATCH /api/loads/:loadId/status-history/:entryId
// @access  Private (admin)
const updateStatusHistoryEntry = async (req, res) => {
  try {
    const { load, entry, error } = await findHistoryEntry(
      req.params.loadId,
      req.params.entryId,
    );
    if (error) return res.status(error.status).json({ message: error.message });

    const changes = [];

    if (req.body.changedAt !== undefined) {
      const when = new Date(req.body.changedAt);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ message: "That is not a valid date and time." });
      }
      // A status dated into the future reads as a typo rather than a record.
      if (when > new Date()) {
        return res.status(400).json({
          message: "A status cannot be recorded as happening in the future.",
        });
      }

      if (new Date(entry.changedAt).getTime() !== when.getTime()) {
        changes.push({
          field: "changedAt",
          label: "Status time",
          from: entry.changedAt ? new Date(entry.changedAt).toISOString() : "—",
          to: when.toISOString(),
        });
        entry.changedAt = when;
      }
    }

    if (req.body.note !== undefined) {
      const note = trimmedText(req.body.note);
      if (note !== (entry.note || "")) {
        changes.push({
          field: "note",
          label: "Status note",
          from: entry.note || "—",
          to: note || "—",
        });
        entry.note = note;
      }
    }

    if (!changes.length) {
      return res.status(400).json({ message: "Nothing was changed." });
    }

    // The load's own `transportStatus` is deliberately untouched: this corrects
    // the record of a step, not which step the load is on. Re-ordering is left
    // to the reader — StatusTimeline sorts by `changedAt` on every render, so a
    // corrected time moves the entry to where it belongs on its own.
    load.markModified("transportStatusHistory");
    await load.save();

    await audit.record({
      load,
      kind: "STATUS",
      action: "load.status_history_edited",
      summary: `Timeline entry "${entry.status}" corrected`,
      changes,
      user: req.user,
      req,
    });

    res.json({
      message: "Timeline entry updated.",
      transportStatusHistory: load.transportStatusHistory,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Remove one entry from the status timeline
// @route   DELETE /api/loads/:loadId/status-history/:entryId
// @access  Private (admin)
const deleteStatusHistoryEntry = async (req, res) => {
  try {
    const { load, entry, error } = await findHistoryEntry(
      req.params.loadId,
      req.params.entryId,
    );
    if (error) return res.status(error.status).json({ message: error.message });

    // The latest entry is what the load's current status rests on. Deleting it
    // would leave the load claiming a status nothing in its history accounts
    // for, so the way to undo a wrong current status is to set the right one —
    // which is what the status control is already for.
    const latest = [...load.transportStatusHistory]
      .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
      .at(-1);

    if (String(latest?._id) === String(entry._id)) {
      return res.status(409).json({
        code: "CANNOT_DELETE_CURRENT_STATUS",
        message:
          "This is the load's current status and cannot be deleted. Set the correct status instead — the timeline will follow.",
      });
    }

    const removed = { status: entry.status, changedAt: entry.changedAt };
    load.transportStatusHistory.pull({ _id: entry._id });
    await load.save();

    await audit.record({
      load,
      kind: "STATUS",
      action: "load.status_history_deleted",
      summary: `Timeline entry "${removed.status}" removed`,
      changes: [
        {
          field: "transportStatusHistory",
          label: "Timeline entry",
          from: `${removed.status} at ${new Date(removed.changedAt).toISOString()}`,
          to: "removed",
        },
      ],
      user: req.user,
      req,
    });

    res.json({
      message: "Timeline entry removed.",
      transportStatusHistory: load.transportStatusHistory,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a load outright
// @route   DELETE /api/loads/:loadId
// @access  Private (admin)
//
// Deliberately narrow. Almost every real "delete this load" is "this should
// never have been created" — a duplicate, a test row, a mistyped submission.
// A load that has actually run has documents, an audit trail, accounting lines
// and a carrier's settlement hanging off it, so one that got as far as being
// assigned is refused; the way to end those is to terminate them, which keeps
// the record.
const deleteLoad = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    if (load.hasCarrier()) {
      return res.status(409).json({
        code: "LOAD_HAS_CARRIER",
        message:
          "This load has been assigned to a carrier and cannot be deleted — its history, documents and settlement would go with it. Terminate it instead.",
      });
    }

    const lines =
      (load.accounting?.receivables?.lines?.length || 0) +
      (load.accounting?.payables?.lines?.length || 0);

    if (lines > 0) {
      return res.status(409).json({
        code: "LOAD_HAS_ACCOUNTING",
        message:
          "This load carries accounting lines and cannot be deleted. Clear them first, or terminate the load instead.",
      });
    }

    // Written before the delete. The audit row copies the load id and location
    // it needs, so it outlives the row it describes.
    await audit.record({
      load,
      kind: "SYSTEM",
      action: "load.deleted",
      summary: `Load ${load.loadId} deleted`,
      body: trimmedText(req.body?.reason) || undefined,
      user: req.user,
      req,
    });

    await Load.deleteOne({ _id: load._id });

    res.json({ message: `Load ${load.loadId} deleted.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Whether this carrier has room for another load
// @route   GET /api/loads/my-capacity
// @access  Private (fleetOwner, driver)
//
// The board returns an empty list to a carrier who is at capacity, and an empty
// list on its own is indistinguishable from "nothing is on offer today". This
// is what lets their screens say which of the two it is — being told you cannot
// bid is workable; silence is not.
const getMyCapacity = async (req, res) => {
  try {
    const carrier = await findCarrierFor(req.user, "_id");
    const availability = await carrierAvailability(carrier?._id);

    res.json({
      ...availability,
      message: atCapacityMessage(availability),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  setLoadDrivers,
  getLoads,
  getLoadById,
  getStreetTurnAgreement,
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
  setLoadAssignments,
  confirmAssignedLoadByFleetOwner,
  rateCompletedLoad,
  awardBid,
  sendBidAcceptanceMail,
  rescheduleBidding,
  rebidLoad,
  discardBid,
  reviseBid,
  respondToNegotiation,
  unassignLoad,
  emailCustomer,
  getMyCapacity,
  updateStatusHistoryEntry,
  deleteStatusHistoryEntry,
  deleteLoad,
};
