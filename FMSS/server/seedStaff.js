const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect("mongodb://localhost:27017/fms")
  .then(async () => {
    const existing = await User.findOne({ email: "admin@fms.com" });
    if (!existing) {
      await User.create({
        firstName: "System",
        lastName: "Admin",
        email: "admin@fms.com",
        password: "password123",
        role: "staff"
      });
      console.log("Staff seeded.");
    } else {
      console.log("Staff already exists.");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
