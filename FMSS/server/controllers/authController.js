const User = require("../models/User");
const Customer = require("../models/Customer");
const Address = require("../models/common/Address");
const FleetOwner = require("../models/FleetOwner");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { getJwtSecret } = require("../utils/jwtSecret");


// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, getJwtSecret(), {
    expiresIn: "30d",
  });
};

// @desc Admin creates staff
// @route POST /api/auth/admin/create-staff
// @access Private (admin only)
const createStaff = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { firstName, lastName, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create(
      {
        firstName,
        lastName,
        email,
        password,
        role: "staff",
        isVerified: true,
      },
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    res.status(201).json({
      message: "Staff created successfully",
      user,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

// @desc Customer self register
// @route POST /api/auth/customer/register
// @access Public
const registerCustomer = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      fax,
      website,
      customerName,
      street,
      suite,
      city,
      state,
      zip,
      directions,
      podEmail,
      accChargesEmail,
      deliveryEmail,
      sendStatusEmails,
      sendInvoiceEmails,
      creditLimitExceeded,
    } = req.body;

    // 1. Check duplicate
    const exists = await User.findOne({ email }).session(session);
    if (exists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. Create User — pass session correctly inside array syntax
    const [createdUser] = await User.create(
      [
        {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          phone,
          role: "client",
          isVerified: false,
        },
      ],
      { session }
    );

    // 3. Create Customer — map ALL fields from frontend
   const [createdCustomer] = await Customer.create(
  [
    {
      user: createdUser._id,
      customerName: customerName || `${firstName} ${lastName}`,
      contact: {
        phone,
        fax,
        email,
        website,
      },
      emails: {
        podEmail,
        accChargesEmail,
        deliveryEmail,
      },
      preferences: {
        sendStatusEmails: sendStatusEmails || false,
        sendInvoiceEmails: sendInvoiceEmails || false,
        creditLimitExceeded: creditLimitExceeded || false,
      },
      addresses: [], // 👈 important
    },
  ],
  { session }
);

        // ✅ 3. CREATE ADDRESS (SEPARATE COLLECTION)
    const [createdAddress] = await Address.create(
      [
        {
          street: street || "",
          suite: suite || "",
          city: city || "",
          state: state || "",
          zip: zip || "",
          directions: directions || "",
          customer: createdCustomer._id, // 🔥 relation
        },
      ],
      { session }
    );

    // ✅ 4. LINK ADDRESS TO CUSTOMER
    createdCustomer.addresses.push(createdAddress._id);
    await createdCustomer.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Registered successfully! Please verify your email.",
      user: createdUser,
      api_token: generateToken(createdUser._id),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

// @desc Staff creates customer
// @route POST /api/auth/staff/create-customer
// @access Private (staff)


// const createCustomerByStaff = async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     session.startTransaction();

//     const {
//       firstName,
//       lastName,
//       email,
//       phone,
//       fax,
//       website,
//       customerName,
//       street,
//       suite,
//       city,
//       state,
//       zip,
//       directions,
//       podEmail,
//       accChargesEmail,
//       deliveryEmail,
//       sendStatusEmails,
//       sendInvoiceEmails,
//       creditLimitExceeded,
//     } = req.body;

//     // 🔥 VALIDATION (IMPORTANT)
//     if (!email || !phone) {
//       throw new Error("Email and phone are required");
//     }

//     // 1. Check duplicate
//     const exists = await User.findOne({ email }).session(session);
//     if (exists) {
//       throw new Error("User already exists");
//     }

//     // 2. Generate safe password
//     const tempPassword = "Client@123"; // NOT empty

//     // 3. Create User
//     const [createdUser] = await User.create(
//       [
//         {
//           firstName: firstName || "N/A",
//           lastName: lastName || "N/A",
//           email: email || "N/A",
//           password: tempPassword,
//           phone: phone || "N/A",
//           role: "client",
//           isVerified: true,
//           addedBy: req.user._id,
//           addedByName: `${req.user.firstName} ${req.user.lastName}`,
//         },
//       ],
//       { session }
//     );

//     // 🔥 ADDRESS FIX (avoid empty object issues)
//     const addressObj = {
//       street: street || "",
//       suite: suite || "",
//       city: city || "",
//       state: state || "",
//       zip: zip || "",
//       directions: directions || "",
//     };

//     // 4. Create Customer
//     const [createdCustomer] = await Customer.create(
//       [
//         {
//           user: createdUser._id,
//           customerName: customerName || `${firstName} ${lastName}`,

//           addresses: [addressObj], // ✅ ALWAYS ARRAY

//           contact: {
//             phone: phone || "",
//             fax: fax || "",
//             email: email || "",
//             website: website || "",
//           },

//           emails: {
//             podEmail: podEmail || "",
//             accChargesEmail: accChargesEmail || "",
//             deliveryEmail: deliveryEmail || "",
//           },

//           preferences: {
//             sendStatusEmails: !!sendStatusEmails,
//             sendInvoiceEmails: !!sendInvoiceEmails,
//             creditLimitExceeded: !!creditLimitExceeded,
//           },
//         },
//       ],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(201).json({
//       message: "Customer created successfully",
//       user: createdUser,
//       customer: createdCustomer,
//       tempPassword,
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();

//     console.error("❌ ERROR:", err);

//     return res.status(500).json({
//       message: err.message,
//     });
//   }
// };

const createCustomerByStaff = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      firstName, lastName, email, phone, fax, website,
      customerName, street, suite, city, state, zip, directions,
      podEmail, accChargesEmail, deliveryEmail,
      sendStatusEmails, sendInvoiceEmails, creditLimitExceeded,
    } = req.body;

    // ✅ VALIDATION
    if (!email || !phone) throw new Error("Email and phone are required");

    // ✅ DUPLICATE CHECK
    const exists = await User.findOne({ email }).session(session);
    if (exists) throw new Error("User already exists");

    // ✅ 1. HASH PASSWORD MANUALLY (bypass pre-save hook issue)
    const tempPassword = "Client@123";
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // ✅ 2. CREATE USER with pre-hashed password
    const [createdUser] = await User.create(
      [
        {
          firstName: firstName || "N/A",
          lastName:  lastName  || "N/A",
          email,
          password: hashedPassword,
          phone,
          role: "client",
          isVerified: true,
          addedBy:     req.user._id,
          addedByName: `${req.user.firstName} ${req.user.lastName}`,
        },
      ],
      { session }
    );

    // ✅ 3. CREATE CUSTOMER
    const [createdCustomer] = await Customer.create(
      [
        {
          user: createdUser._id,
          customerName: customerName || `${firstName} ${lastName}`,
          addresses: [],
          contact: {
            phone:   phone   || "",
            fax:     fax     || "",
            email:   email   || "",
            website: website || "",
          },
          emails: {
            podEmail:        podEmail        || "",
            accChargesEmail: accChargesEmail || "",
            deliveryEmail:   deliveryEmail   || "",
          },
          preferences: {
            sendStatusEmails:    !!sendStatusEmails,
            sendInvoiceEmails:   !!sendInvoiceEmails,
            creditLimitExceeded: !!creditLimitExceeded,
          },
        },
      ],
      { session }
    );

    // ✅ 4. CREATE ADDRESS
    const [createdAddress] = await Address.create(
      [
        {
          street:     street     || "",
          suite:      suite      || "",
          city:       city       || "",
          state:      state      || "",
          zip:        zip        || "",
          directions: directions || "",
          customer:   createdCustomer._id,
        },
      ],
      { session }
    );

    // ✅ 5. LINK ADDRESS TO CUSTOMER — use findByIdAndUpdate, NOT .save()
    await Customer.findByIdAndUpdate(
      createdCustomer._id,
      { $push: { addresses: createdAddress._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Customer created successfully",
      user: createdUser,
      customer: createdCustomer,
      address: createdAddress,
      tempPassword, // plain text so staff can share it
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ CREATE CUSTOMER ERROR:", err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc Staff creates fleet owner
// @route POST /api/auth/staff/create-fleet-owner
// @access Private (staff only)
const createFleetOwnerByStaff = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const {
      carrierName,
      phone,
      email,
      mcLicense,
      dotLicense,
      street,
      city,
      state,
      zip,
      contactPersons,
    } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User exists" });
    }

    const user = await User.create({
      email,
      phone,
      role: "fleetOwner",
      isVerified: true,
      address: { street, city, state, zip },
      fleetProfile: {
        carrierName,
        mcLicense,
        dotLicense,
        contactPersons,
      },
      createdBy: req.user._id,
    }, { session });

    const createdUser = Array.isArray(user) ? user[0] : user;

    await FleetOwner.create([{
      userId: createdUser._id,
      carrierName: carrierName || email.split("@")[0],
      phone,
      mcLicense,
      dotLicense,
      addresses: [{ street, city, state, zip }],
      contactPersons: contactPersons || []
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Fleet owner created",
      user: createdUser,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      user,
      api_token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      access: user.access,
      isVerified: user.isVerified,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createStaff,
  registerCustomer,
  createCustomerByStaff,
  createFleetOwnerByStaff,
  loginUser,
  getMe,
};
