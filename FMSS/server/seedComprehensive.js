const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User        = require("./models/User");
const Customer    = require("./models/Customer");
const FleetOwner  = require("./models/FleetOwner");
const Company     = require("./models/Company");
const Address     = require("./models/common/Address");
const Load        = require("./models/Load");
const Bid         = require("./models/bidSchema");
const Counter     = require("./models/Counter.model");
const EmailConfig = require("./models/EmailConfig");

const seed = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/fms");
    console.log("🔗 Connected to MongoDB\n");

    // ─── CLEAR ALL COLLECTIONS ────────────────────────────────
    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      User.deleteMany({}),
      Customer.deleteMany({}),
      FleetOwner.deleteMany({}),
      Company.deleteMany({}),
      Address.deleteMany({}),
      Load.deleteMany({}),
      Bid.deleteMany({}),
      Counter.deleteMany({}),
      EmailConfig.deleteMany({}),
    ]);
    console.log("   Done.\n");

    // ─── USERS ────────────────────────────────────────────────
    // Pre-save hash hook is commented out in User.js — must hash manually.
    console.log("👤 Seeding Users...");
    const hash = await bcrypt.hash("password123", 10);

    const [
      admin, staff,
      rajesh, priya, amit,
      vikramUser, sureshUser, quickUser, safeUser,
    ] = await User.insertMany([
      { firstName: "System",  lastName: "Admin",     email: "admin@fms.com",       password: hash, role: "staff",      isVerified: true },
      { firstName: "FMS",     lastName: "Staff",     email: "staff@fms.com",       password: hash, role: "staff",      isVerified: true },
      { firstName: "Rajesh",  lastName: "Kumar",     email: "rajesh@example.com",  password: hash, role: "client",     isVerified: true },
      { firstName: "Priya",   lastName: "Sharma",    email: "priya@example.com",   password: hash, role: "client",     isVerified: true },
      { firstName: "Amit",    lastName: "Patel",     email: "amit@example.com",    password: hash, role: "client",     isVerified: true },
      { firstName: "Vikram",  lastName: "Singh",     email: "vendor@fms.com",      password: hash, role: "fleetOwner", isVerified: true },
      { firstName: "Suresh",  lastName: "Rao",       email: "suresh@logistics.com",password: hash, role: "fleetOwner", isVerified: true },
      { firstName: "Rohit",   lastName: "Verma",     email: "quick@transport.com", password: hash, role: "fleetOwner", isVerified: true },
      { firstName: "Kavita",  lastName: "Mehta",     email: "safe@carriers.com",   password: hash, role: "fleetOwner", isVerified: true },
    ]);
    console.log("   9 users created.\n");

    // ─── CUSTOMERS ────────────────────────────────────────────
    console.log("🏢 Seeding Customers...");
    await Customer.insertMany([
      {
        user: rajesh._id,
        customerName: "Rajesh Kumar",
        contact: { phone: "9810001001", email: "rajesh@example.com" },
        emails: {
          podEmail:        "pod@rajesh-co.com",
          accChargesEmail: "acc@rajesh-co.com",
          deliveryEmail:   "delivery@rajesh-co.com",
        },
        preferences: { sendStatusEmails: true, sendInvoiceEmails: true, creditLimitExceeded: false },
        active: true,
      },
      {
        user: priya._id,
        customerName: "Priya Sharma",
        contact: { phone: "9820001002", email: "priya@example.com" },
        emails: {
          podEmail:        "pod@priya-co.com",
          accChargesEmail: "acc@priya-co.com",
          deliveryEmail:   "delivery@priya-co.com",
        },
        preferences: { sendStatusEmails: true, sendInvoiceEmails: false, creditLimitExceeded: false },
        active: true,
      },
      {
        user: amit._id,
        customerName: "Amit Patel",
        contact: { phone: "9830001003", email: "amit@example.com" },
        emails: {
          podEmail:      "pod@amit-co.com",
          deliveryEmail: "delivery@amit-co.com",
        },
        preferences: { sendStatusEmails: false, sendInvoiceEmails: true, creditLimitExceeded: false },
        active: true,
      },
    ]);
    console.log("   3 customers created.\n");

    // ─── FLEET OWNERS ─────────────────────────────────────────
    // FleetOwner has NO city/state/email fields — only userId, carrierName,
    // phone, mcLicense, dotLicense, taxId, addresses (refs), contactPersons.
    console.log("🚚 Seeding Fleet Owners...");
    const [foVikram, foSuresh, foQuick, foSafe] = await FleetOwner.insertMany([
      {
        userId: vikramUser._id,
        carrierName: "Vikram Logistics Pvt Ltd",
        phone: "9876541001",
        mcLicense: "MC-VL-001",
        dotLicense: "DOT-VL-001",
        taxId: "TAX-VL-001",
        contactPersons: [{ name: "Vikram Singh",  phone: "9876541001", email: "vendor@fms.com",        isPrimary: true }],
        status: "ACTIVE",
      },
      {
        userId: sureshUser._id,
        carrierName: "Suresh Express Cargo",
        phone: "9876541002",
        mcLicense: "MC-SE-002",
        dotLicense: "DOT-SE-002",
        taxId: "TAX-SE-002",
        contactPersons: [{ name: "Suresh Rao",    phone: "9876541002", email: "suresh@logistics.com",  isPrimary: true }],
        status: "ACTIVE",
      },
      {
        userId: quickUser._id,
        carrierName: "Quick Transport Solutions",
        phone: "9876541003",
        mcLicense: "MC-QT-003",
        dotLicense: "DOT-QT-003",
        taxId: "TAX-QT-003",
        contactPersons: [{ name: "Rohit Verma",   phone: "9876541003", email: "quick@transport.com",   isPrimary: true }],
        status: "ACTIVE",
      },
      {
        userId: safeUser._id,
        carrierName: "Safe & Secure Carriers",
        phone: "9876541004",
        mcLicense: "MC-SS-004",
        dotLicense: "DOT-SS-004",
        taxId: "TAX-SS-004",
        contactPersons: [{ name: "Kavita Mehta",  phone: "9876541004", email: "safe@carriers.com",     isPrimary: true }],
        status: "ACTIVE",
      },
    ]);
    console.log("   4 fleet owners created.\n");

    // ─── COMPANIES & ADDRESSES ────────────────────────────────
    // Address.company references Company._id; Load.pickup.company stores the
    // company name string (denormalised for display without populate).
    console.log("🏭 Seeding Companies & Addresses...");
    const [coOakland, coLA, coChicago, coHouston] = await Company.insertMany([
      { name: "Oakland Container Depot",  type: "Shipper",   contactName: "John Park",     contactPhone: "5101001001", contactEmail: "ops@oaklanddepot.com" },
      { name: "LA Distribution Center",   type: "Consignee", contactName: "Maria Lopez",   contactPhone: "3101001002", contactEmail: "ops@ladistrib.com"    },
      { name: "Chicago Midwest Terminal", type: "Terminal",  contactName: "David Chen",    contactPhone: "3121001003", contactEmail: "ops@chimidwest.com"   },
      { name: "Houston Port Logistics",   type: "Shipper",   contactName: "Carlos Rivera", contactPhone: "7131001004", contactEmail: "ops@houstonport.com"  },
    ]);

    const [addrOakland, addrLA, addrChicago, addrHouston] = await Address.insertMany([
      { street: "1234 Harbor Way",     city: "Oakland",     state: "CA", zip: "94607", company: coOakland._id  },
      { street: "5678 Commerce Blvd",  city: "Los Angeles", state: "CA", zip: "90001", company: coLA._id       },
      { street: "900 Industrial Pkwy", city: "Chicago",     state: "IL", zip: "60601", company: coChicago._id  },
      { street: "200 Port Ave",        city: "Houston",     state: "TX", zip: "77001", company: coHouston._id  },
    ]);
    console.log("   4 companies + 4 addresses created.\n");

    // ─── LOADS ────────────────────────────────────────────────
    // Counter is cleared above so auto-ID starts at LD-0001.
    // adressAdded: true tells the UI the address fields are populated.
    // customerName is NOT stored — getLoads enriches it from Customer collection.
    console.log("📦 Seeding Loads...");
    const now = new Date();
    const T = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000);

    const mkStop = (addrDoc, companyDoc, extra = {}) => ({
      addressId:    addrDoc._id,
      address:      addrDoc.street,
      city:         addrDoc.city,
      state:        addrDoc.state,
      zip:          addrDoc.zip,
      company:      companyDoc.name,
      fromTime:     "08:00",
      toTime:       "17:00",
      ...extra,
    });

    const loadDefs = [
      // ── LD-0001  PENDING_VERIFICATION ───────────────────────
      {
        createdBy: "client",
        creatorId: rajesh._id,
        customer:  rajesh._id,
        truckType: "Flatbed",
        material:  "Steel Coils",
        amount:    15000,
        status:    "PENDING_VERIFICATION",
        bidStatus: "UPCOMING",
        adressAdded: true,
        pickup: mkStop(addrOakland, coOakland, { pickupDate: T(24),  weight: "40000 lbs", pieces: "1" }),
        drop:   mkStop(addrLA,      coLA,      { deliveryDate: T(48) }),
      },
      // ── LD-0002  PENDING_VERIFICATION ───────────────────────
      {
        createdBy: "client",
        creatorId: priya._id,
        customer:  priya._id,
        truckType: "Container",
        material:  "Garments",
        amount:    12000,
        status:    "PENDING_VERIFICATION",
        bidStatus: "UPCOMING",
        adressAdded: true,
        pickup: mkStop(addrChicago, coChicago, { pickupDate: T(24), pieces: "200", weight: "15000 lbs" }),
        drop:   mkStop(addrHouston, coHouston, { deliveryDate: T(72) }),
      },
      // ── LD-0003  REQUIRES_CHANGES ────────────────────────────
      {
        createdBy:   "client",
        creatorId:   amit._id,
        customer:    amit._id,
        truckType:   "Open Truck",
        material:    "Textiles",
        amount:      8000,
        status:      "REQUIRES_CHANGES",
        bidStatus:   "UPCOMING",
        changesNote: "Please provide container number and seal number before verification.",
        adressAdded: true,
        pickup: mkStop(addrOakland, coOakland, { pickupDate: T(48) }),
        drop:   mkStop(addrChicago, coChicago, { deliveryDate: T(120) }),
      },
      // ── LD-0004  VERIFIED / UPCOMING (bid opens in 2h) ───────
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     rajesh._id,
        truckType:    "Refrigerated",
        material:     "Pharmaceuticals",
        amount:       25000,
        status:       "VERIFIED",
        bidStatus:    "UPCOMING",
        bidStartTime: T(2),
        bidEndTime:   T(6),
        targetRate:   22000,  // ✅ Rate defined by staff
        margin:       2500,   // ✅ Vendor margin (vendors see: 22000 + 2500 = 24500)
        vendorRate:   24500,  // ✅ Calculated rate for vendor display
        adressAdded:  true,
        pickup: mkStop(addrLA,      coLA,      { pickupDate: T(72) }),
        drop:   mkStop(addrHouston, coHouston, { deliveryDate: T(96) }),
      },
      // ── LD-0005  VERIFIED / UPCOMING (bid opens in 4h) ───────
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     priya._id,
        truckType:    "Dry Van",
        material:     "Auto Parts",
        amount:       18000,
        status:       "VERIFIED",
        bidStatus:    "UPCOMING",
        bidStartTime: T(4),
        bidEndTime:   T(8),
        targetRate:   16000,  // ✅ Rate defined by staff
        margin:       1200,   // ✅ Vendor margin (vendors see: 16000 + 1200 = 17200)
        vendorRate:   17200,  // ✅ Calculated rate for vendor display
        adressAdded:  true,
        pickup: mkStop(addrHouston, coHouston, { pickupDate: T(96) }),
        drop:   mkStop(addrOakland, coOakland, { deliveryDate: T(144) }),
      },
      // ── LD-0006  VERIFIED / OPEN — no bids yet ───────────────
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     amit._id,
        truckType:    "Container",
        material:     "Machinery",
        amount:       35000,
        status:       "VERIFIED",
        bidStatus:    "OPEN",
        bidStartTime: T(-1),
        bidEndTime:   T(3),
        adressAdded:  true,
        pickup: mkStop(addrChicago, coChicago, { pickupDate: T(48) }),
        drop:   mkStop(addrLA,      coLA,      { deliveryDate: T(72) }),
        bids: [],
      },
      // ── LD-0007  VERIFIED / OPEN — 2 bids ────────────────────
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     rajesh._id,
        truckType:    "Flatbed",
        material:     "Electronics",
        amount:       22000,
        status:       "VERIFIED",
        bidStatus:    "OPEN",
        bidStartTime: T(-2),
        bidEndTime:   T(2),
        adressAdded:  true,
        pickup: mkStop(addrOakland, coOakland, { pickupDate: T(24) }),
        drop:   mkStop(addrChicago, coChicago, { deliveryDate: T(72) }),
        bids: [
          { fleetOwnerId: foVikram._id, fleetOwnerName: "Vikram Logistics Pvt Ltd", amount: 20500, submittedAt: T(-1.5), status: "ACTIVE"  },
          { fleetOwnerId: foSuresh._id, fleetOwnerName: "Suresh Express Cargo",     amount: 21000, submittedAt: T(-1),   status: "ACTIVE"  },
        ],
      },
      // ── LD-0008  VERIFIED / OPEN — 3 bids ────────────────────
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     priya._id,
        truckType:    "Van",
        material:     "FMCG Goods",
        amount:       19000,
        status:       "VERIFIED",
        bidStatus:    "OPEN",
        bidStartTime: T(-3),
        bidEndTime:   T(1),
        adressAdded:  true,
        pickup: mkStop(addrHouston, coHouston, { pickupDate: T(24) }),
        drop:   mkStop(addrLA,      coLA,      { deliveryDate: T(48) }),
        bids: [
          { fleetOwnerId: foQuick._id,  fleetOwnerName: "Quick Transport Solutions", amount: 17500, submittedAt: T(-2.5), status: "ACTIVE"  },
          { fleetOwnerId: foSafe._id,   fleetOwnerName: "Safe & Secure Carriers",    amount: 18000, submittedAt: T(-2),   status: "ACTIVE"  },
          { fleetOwnerId: foVikram._id, fleetOwnerName: "Vikram Logistics Pvt Ltd",  amount: 16800, submittedAt: T(-1.5), status: "WINNING" },
        ],
      },
      // ── LD-0009  ASSIGNED / CLOSED — fully delivered & invoiced
      {
        createdBy:    "staff",
        creatorId:    staff._id,
        customer:     amit._id,
        truckType:    "Container",
        material:     "Construction Material",
        amount:       28000,
        bookingNo:    "BK-2025-0042",
        containerNo:  "CMAU3456789",
        sealNo:       "SL-99821",
        status:       "ASSIGNED",
        bidStatus:    "CLOSED",
        bidStartTime: T(-96),
        bidEndTime:   T(-72),
        adressAdded:  true,
        pickup: mkStop(addrLA,      coLA,      { pickupDate: T(-66), weight: "38000 lbs", pieces: "1", poNumber: "PO-LA-2025" }),
        drop:   mkStop(addrHouston, coHouston, { deliveryDate: T(-30) }),
        bids: [
          { fleetOwnerId: foVikram._id, fleetOwnerName: "Vikram Logistics Pvt Ltd",  amount: 26000, submittedAt: T(-80), status: "WINNING"  },
          { fleetOwnerId: foSuresh._id, fleetOwnerName: "Suresh Express Cargo",      amount: 27500, submittedAt: T(-79), status: "REJECTED" },
          { fleetOwnerId: foQuick._id,  fleetOwnerName: "Quick Transport Solutions", amount: 27000, submittedAt: T(-78), status: "REJECTED" },
        ],
        winningBid: {
          fleetOwnerId:    foVikram._id,
          fleetOwnerName:  "Vikram Logistics Pvt Ltd",
          amount:          26000,
          submittedAt:     T(-80),
        },
        assignedFleetOwner: {
          fleetOwnerId:   foVikram._id,
          fleetOwnerName: "Vikram Logistics Pvt Ltd",
          assignedAt:     T(-70),
        },
        transportStatus: "INVOICED",
        completedAt:     T(-10),
        staffRating: {
          score:   5,
          remark:  "On-time delivery, no damage. Excellent communication throughout.",
          ratedBy: staff._id,
          ratedAt: T(-8),
        },
        transportStatusHistory: [
          {
            status: "NEW_LOAD",
            changedAt: T(-96), changedBy: staff._id,
            note: "Load created and pending bidding",
          },
          {
            status: "ASSIGNED",
            changedAt: T(-70), changedBy: staff._id,
            note: "Vikram Logistics Pvt Ltd assigned after winning bid at $26,000",
          },
          {
            status: "READY_TO_PICKUP",
            changedAt: T(-68), changedBy: vikramUser._id,
            note: "Driver dispatched — ETA at LA Distribution Center in 2 hours",
            location: { address: "Truck Yard, Compton, CA 90220", latitude: 33.8958, longitude: -118.2201 },
          },
          {
            status: "PICKED_UP",
            changedAt: T(-66), changedBy: vikramUser._id,
            note: "Container CMAU3456789 picked up. Seal verified. Departing LA.",
            location: { address: "5678 Commerce Blvd, Los Angeles, CA 90001", latitude: 34.0522, longitude: -118.2437 },
          },
          {
            status: "IN_TRANSIT",
            changedAt: T(-60), changedBy: vikramUser._id,
            note: "Cleared LA metro, heading east on I-10",
            location: { address: "I-10 E, Pomona, CA 91766", latitude: 34.0550, longitude: -117.7498 },
          },
          {
            status: "IN_TRANSIT",
            changedAt: T(-52), changedBy: vikramUser._id,
            note: "Rest stop — driver change at Phoenix",
            location: { address: "Flying J Travel Center, Phoenix, AZ 85034", latitude: 33.4484, longitude: -112.0740 },
          },
          {
            status: "IN_TRANSIT",
            changedAt: T(-44), changedBy: vikramUser._id,
            note: "Passed El Paso weigh station — all clear",
            location: { address: "I-10 E, El Paso, TX 79901", latitude: 31.7619, longitude: -106.4850 },
          },
          {
            status: "IN_TRANSIT",
            changedAt: T(-36), changedBy: vikramUser._id,
            note: "Fuel stop in San Antonio, back on road",
            location: { address: "Pilot Travel Center, San Antonio, TX 78224", latitude: 29.4241, longitude: -98.4936 },
          },
          {
            status: "REACHED_DESTINATION",
            changedAt: T(-30), changedBy: vikramUser._id,
            note: "Arrived at Houston Port Logistics. Waiting for dock assignment.",
            location: { address: "200 Port Ave, Houston, TX 77001", latitude: 29.7604, longitude: -95.3698 },
          },
          {
            status: "DELIVERED",
            changedAt: T(-28), changedBy: vikramUser._id,
            note: "Container unloaded and handed over. POD signed by Carlos Rivera.",
            location: { address: "200 Port Ave, Houston, TX 77001", latitude: 29.7604, longitude: -95.3698 },
          },
          {
            status: "PAPERWORK_PENDING",
            changedAt: T(-20), changedBy: staff._id,
            note: "Awaiting signed BOL and scale ticket from driver",
          },
          {
            status: "INVOICED",
            changedAt: T(-10), changedBy: staff._id,
            note: "Invoice #INV-2025-0042 raised for $28,000. All documents received.",
          },
        ],
      },
    ];

    const loads = [];
    for (const def of loadDefs) {
      const load = await new Load(def).save();
      loads.push(load);
      console.log(`   ✅ ${load.loadId} — ${def.status}/${def.bidStatus} — ${def.material}`);
    }
    console.log();

    // ─── BID COLLECTION ENTRIES ────────────────────────────────
    // Bid collection uses Load._id (ObjectId), not loadId string.
    // Keep in sync with Load.bids embedded array above.
    console.log("💰 Seeding Bid Collection...");

    // LD-0007 (index 6) — 2 bids
    await Bid.insertMany([
      { loadId: loads[6]._id, fleetOwnerId: foVikram._id, amount: 20500, status: "ACTIVE",  submittedAt: T(-1.5), deliveryDate: T(72) },
      { loadId: loads[6]._id, fleetOwnerId: foSuresh._id, amount: 21000, status: "ACTIVE",  submittedAt: T(-1),   deliveryDate: T(72) },
    ]);
    console.log(`   ✅ 2 bids for ${loads[6].loadId}`);

    // LD-0008 (index 7) — 3 bids
    await Bid.insertMany([
      { loadId: loads[7]._id, fleetOwnerId: foQuick._id,  amount: 17500, status: "ACTIVE",   submittedAt: T(-2.5), deliveryDate: T(48) },
      { loadId: loads[7]._id, fleetOwnerId: foSafe._id,   amount: 18000, status: "ACTIVE",   submittedAt: T(-2),   deliveryDate: T(48) },
      { loadId: loads[7]._id, fleetOwnerId: foVikram._id, amount: 16800, status: "WINNING",  submittedAt: T(-1.5), deliveryDate: T(48) },
    ]);
    console.log(`   ✅ 3 bids for ${loads[7].loadId}`);

    // LD-0009 (index 8) — 3 bids (closed, winner known)
    await Bid.insertMany([
      { loadId: loads[8]._id, fleetOwnerId: foVikram._id, amount: 26000, status: "WINNING",  submittedAt: T(-80), deliveryDate: T(-30) },
      { loadId: loads[8]._id, fleetOwnerId: foSuresh._id, amount: 27500, status: "REJECTED", submittedAt: T(-79), deliveryDate: T(-30) },
      { loadId: loads[8]._id, fleetOwnerId: foQuick._id,  amount: 27000, status: "REJECTED", submittedAt: T(-78), deliveryDate: T(-30) },
    ]);
    console.log(`   ✅ 3 bids for ${loads[8].loadId}`);
    console.log();

    // ─── EMAIL CONFIG ─────────────────────────────────────────
    await EmailConfig.create({ host: "smtp.gmail.com", port: 587, email: "", password: "", isEmailEnabled: false });
    console.log("📧 EmailConfig initialized.\n");

    // ─── SUMMARY ──────────────────────────────────────────────
    console.log("=".repeat(55));
    console.log("🎉  SEED COMPLETE");
    console.log("=".repeat(55));
    console.log("\n📋 Credentials (all use: password123)");
    console.log("  admin      admin@fms.com");
    console.log("  staff      staff@fms.com");
    console.log("  client     rajesh@example.com");
    console.log("  client     priya@example.com");
    console.log("  client     amit@example.com");
    console.log("  fleetOwner vendor@fms.com");
    console.log("  fleetOwner suresh@logistics.com");
    console.log("  fleetOwner quick@transport.com");
    console.log("  fleetOwner safe@carriers.com");
    console.log("\n📊 Counts:");
    console.log(`  Users:            ${await User.countDocuments()}`);
    console.log(`  Customers:        ${await Customer.countDocuments()}`);
    console.log(`  Fleet Owners:     ${await FleetOwner.countDocuments()}`);
    console.log(`  Companies:        ${await Company.countDocuments()}`);
    console.log(`  Addresses:        ${await Address.countDocuments()}`);
    console.log(`  Loads:            ${await Load.countDocuments()}`);
    console.log(`    PENDING_VERIF:  ${await Load.countDocuments({ status: "PENDING_VERIFICATION" })}`);
    console.log(`    REQUIRES_CHG:   ${await Load.countDocuments({ status: "REQUIRES_CHANGES" })}`);
    console.log(`    VERIFIED/UPCM:  ${await Load.countDocuments({ status: "VERIFIED", bidStatus: "UPCOMING" })}`);
    console.log(`    VERIFIED/OPEN:  ${await Load.countDocuments({ status: "VERIFIED", bidStatus: "OPEN" })}`);
    console.log(`    ASSIGNED/CLSD:  ${await Load.countDocuments({ status: "ASSIGNED", bidStatus: "CLOSED" })}`);
    console.log(`  Bids (collection):${await Bid.countDocuments()}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    console.error(err);
    process.exit(1);
  }
};

seed();
