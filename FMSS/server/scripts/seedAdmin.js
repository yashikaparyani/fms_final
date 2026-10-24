/**
 * seedAdmin.js
 * 
 * Idempotent Admin Account Seeder for FMS.
 * Creates an initial Admin account if one does not already exist.
 * Reads credentials from environment variables (ADMIN_EMAIL, ADMIN_PASSWORD).
 * 
 * Run via npm:
 *   npm run seed:admin
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config(); // fallback to cwd

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Branch = require("../models/Branch");
const { runUnscoped } = require("../utils/tenantContext");

const seedAdmin = async () => {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/fms?directConnection=true";

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@fms.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  console.log("==================================================");
  console.log("🚀 Starting FMS Admin Seeder");
  console.log("==================================================");

  // Validate required configuration
  if (!adminPassword) {
    console.error("❌ Error: ADMIN_PASSWORD environment variable is required.");
    console.error("   Please set ADMIN_PASSWORD in your environment or server/.env file.");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    const dbName = mongoose.connection.name;
    const collectionName = User.collection.collectionName;

    console.log(`🔗 Connected to MongoDB database: "${dbName}"`);
    console.log(`📁 Target User collection: "${collectionName}"`);

    await runUnscoped(async () => {
      // 1. Ensure at least one active branch exists so multi-tenant queries resolve
      let activeBranch = await Branch.findOne({ active: true });
      if (!activeBranch) {
        activeBranch = await Branch.create({
          name: "Head Office",
          code: "HO",
          active: true,
        });
        console.log(`📍 Created default branch: "${activeBranch.name}" (${activeBranch.code})`);
      } else {
        console.log(`📍 Found active branch: "${activeBranch.name}" (${activeBranch.code})`);
      }

      // 2. Check for existing admin account (Idempotency)
      const existingUser = await User.findOne({ email: adminEmail }).select("+password");

      if (existingUser) {
        console.log(`ℹ️  Admin account already exists for: ${adminEmail}`);
        console.log(`   ID: ${existingUser._id}`);
        console.log(`   Role: ${existingUser.role}`);
        console.log(`   Active: ${existingUser.isActive !== false}`);
        console.log(`   Verified: ${existingUser.isVerified}`);

        if (existingUser.role !== "admin") {
          console.log(`⚠️  Existing account has role "${existingUser.role}". Promoting to "admin"...`);
          existingUser.role = "admin";
          existingUser.isActive = true;
          existingUser.isVerified = true;
          existingUser.isDeleted = false;
          await existingUser.save();
          console.log(`✅ Account promoted to "admin" successfully without altering password.`);
        } else {
          console.log(`✅ Admin account is already properly configured. No changes made.`);
        }

        console.log("\n✨ Idempotent check passed. Existing password was preserved.");
        return;
      }

      // 3. Hash password using bcrypt (cost factor 10, consistent with User model)
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // 4. Create new admin account
      const newAdmin = await User.create({
        firstName: process.env.ADMIN_FIRST_NAME || "System",
        lastName: process.env.ADMIN_LAST_NAME || "Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        isActive: true,
        isVerified: true,
        isDeleted: false,
      });

      console.log(`✅ Admin account created successfully!`);
      console.log(`   ID: ${newAdmin._id}`);
      console.log(`   Email: ${newAdmin.email}`);
      console.log(`   Role: ${newAdmin.role}`);
      console.log(`   Status: Active & Verified`);
    });

    console.log("==================================================");
    console.log("🎉 Seeding completed successfully.");
    console.log("==================================================");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed with error:", error.message);
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

seedAdmin();
