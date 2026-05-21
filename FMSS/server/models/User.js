const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const accessSchema = new mongoose.Schema(
  {
    dashboard: { type: Boolean, default: false },
    users: { type: Boolean, default: false },
    loads: { type: Boolean, default: false },
    fleet: { type: Boolean, default: false },
    bids: { type: Boolean, default: false },
    settings: { type: Boolean, default: false },
    reports: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: false,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "staff", "client", "fleetOwner"],
      required: true,
    },

    phone: String,

    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },

    lastLogin: Date,

    timezone: {
      type: String,
      default: "Asia/Kolkata",
      enum: ["Asia/Kolkata", "UTC", "America/New_York"],
    },

    access: {
      type: accessSchema,
      default: () => ({}),
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    addedByName: String,
  },
  { timestamps: true }
);

// 🔐 Hash Password
// ✅ UPDATED pre-save hook in User.js
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
  
//   // ✅ Skip if already hashed (bcrypt hashes start with $2b$)
//   if (this.password && this.password.startsWith("$2b$")) return next();
  
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });

// 🔑 Compare Password
userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// 👀 Hide sensitive fields
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema); 



// // Hash password before saving
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) {
//     next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
// });

// // Method to verify password
// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// const User = mongoose.model("User", userSchema);

// module.exports = User;
