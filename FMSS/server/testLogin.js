const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect("mongodb://localhost:27017/fms")
  .then(async () => {
    console.log("Connected to MongoDB...");

    // Find user with password field
    const user = await User.findOne({ email: "client@fms.com" }).select("+password");

    if (!user) {
      console.log("❌ User not found");
      process.exit(1);
    }

    console.log("User found:", user.email);
    console.log("Password hash:", user.password);

    // Test matchPassword method
    const isMatch = await user.matchPassword("password123");
    console.log("Password match:", isMatch);

    process.exit(0);
  })
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
