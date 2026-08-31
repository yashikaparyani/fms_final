/**
 * seedTestData.js — Quick idempotent seed for essential test accounts.
 *
 * Skips records that already exist (safe to run repeatedly).
 * For a full data reset use: node seedComprehensive.js
 */

const mongoose = require("mongoose");
const bcrypt    = require("bcryptjs");
const User      = require("./models/User");
const Customer  = require("./models/Customer");
const FleetOwner = require("./models/FleetOwner");
const Load      = require("./models/Load");
const Counter   = require("./models/Counter.model");

mongoose.connect("mongodb://127.0.0.1:27017/fms")
  .then(async () => {
    console.log("Connected to MongoDB...");

    const hash = await bcrypt.hash("password123", 10);

    // ── Client user ─────────────────────────────────────────────
    let clientUser = await User.findOne({ email: "client@fms.com" });
    if (!clientUser) {
      clientUser = await User.create({
        firstName: "Test", lastName: "Client",
        email: "client@fms.com", password: hash,
        role: "client", isVerified: true,
      });
      console.log("✅ Client user seeded: client@fms.com / password123");
    } else {
      console.log("⏭️  Client user already exists.");
    }

    // ── Customer record for the client ──────────────────────────
    const existingCust = await Customer.findOne({ user: clientUser._id });
    if (!existingCust) {
      await Customer.create({
        user: clientUser._id,
        customerName: "Test Client",
        contact: { phone: "5550001000", email: "client@fms.com" },
        preferences: { sendStatusEmails: false, sendInvoiceEmails: false, creditLimitExceeded: false },
        active: true,
      });
      console.log("✅ Customer record seeded for Test Client");
    } else {
      console.log("⏭️  Customer record already exists.");
    }

    // ── Fleet owner user ────────────────────────────────────────
    let vendorUser = await User.findOne({ email: "vendor@fms.com" });
    if (!vendorUser) {
      vendorUser = await User.create({
        firstName: "Test", lastName: "Vendor",
        email: "vendor@fms.com", password: hash,
        role: "fleetOwner", isVerified: true,
      });
      console.log("✅ Fleet owner user seeded: vendor@fms.com / password123");
    } else {
      console.log("⏭️  Fleet owner user already exists.");
    }

    // ── Fleet owner company record ───────────────────────────────
    // FleetOwner has no city/state/zip fields — only userId, carrierName,
    // phone, mcLicense, dotLicense, taxId, addresses (refs), contactPersons.
    const existingFO = await FleetOwner.findOne({ carrierName: "Test Fleet Co" });
    if (!existingFO) {
      await FleetOwner.create({
        userId: vendorUser._id,
        carrierName: "Test Fleet Co",
        phone: "555-123-4567",
        mcLicense: "MC123456",
        dotLicense: "DOT789012",
        taxId: "TAX-TFC-001",
        contactPersons: [{
          name: "Test Vendor",
          phone: "555-123-4567",
          email: "vendor@fms.com",
          isPrimary: true,
        }],
        status: "ACTIVE",
      });
      console.log("✅ Fleet owner company seeded: Test Fleet Co");
    } else {
      console.log("⏭️  Fleet owner company already exists.");
    }

    // ── Sample loads ─────────────────────────────────────────────
    // customer field requires an ObjectId — use clientUser._id.
    // Let the Load pre-save hook auto-generate loadId ("LD 0001").
    const now = new Date();
    const T   = (h) => new Date(now.getTime() + h * 60 * 60 * 1000);

    const loadSeeds = [
      {
        _checkField: "PENDING_VERIFICATION_test",
        doc: {
          customer:  clientUser._id,
          createdBy: "client",
          creatorId: clientUser._id,
          truckType: "Flatbed",
          material:  "Steel Coils",
          amount:    5000,
          status:    "PENDING_VERIFICATION",
          bidStatus: "UPCOMING",
          pickup: { city: "Houston",     state: "TX" },
          drop:   { city: "Dallas",      state: "TX" },
        },
        label: "PENDING_VERIFICATION",
      },
      {
        _checkField: "VERIFIED_upcoming_test",
        doc: {
          customer:  clientUser._id,
          createdBy: "staff",
          creatorId: clientUser._id,
          truckType: "Refrigerated",
          material:  "Frozen Foods",
          amount:    8000,
          status:    "VERIFIED",
          bidStatus: "UPCOMING",
          bidStartTime: T(2),
          bidEndTime:   T(6),
          pickup: { city: "Los Angeles", state: "CA" },
          drop:   { city: "Phoenix",     state: "AZ" },
        },
        label: "VERIFIED/UPCOMING",
      },
      {
        _checkField: "VERIFIED_open_test",
        doc: {
          customer:  clientUser._id,
          createdBy: "staff",
          creatorId: clientUser._id,
          truckType: "Dry Van",
          material:  "Electronics",
          amount:    6500,
          status:    "VERIFIED",
          bidStatus: "OPEN",
          bidStartTime: T(-1),
          bidEndTime:   T(2),
          pickup: { city: "Chicago",     state: "IL" },
          drop:   { city: "Detroit",     state: "MI" },
        },
        label: "VERIFIED/OPEN",
      },
    ];

    for (const seed of loadSeeds) {
      // Use material+status as a soft uniqueness check
      const existing = await Load.findOne({
        customer:  clientUser._id,
        material:  seed.doc.material,
        status:    seed.doc.status,
      });
      if (!existing) {
        const load = await new Load(seed.doc).save();
        console.log(`✅ Sample load ${load.loadId} seeded (${seed.label})`);
      } else {
        console.log(`⏭️  Load already exists (${seed.label}).`);
      }
    }

    console.log("\n🎉 Test data seeding complete!");
    console.log("\n📋 Credentials (password: password123)");
    console.log("  client@fms.com   — role: client");
    console.log("  vendor@fms.com   — role: fleetOwner");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error seeding data:", err.message);
    console.error(err);
    process.exit(1);
  });
