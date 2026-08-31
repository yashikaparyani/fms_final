const User = require("../models/User");
const Customer = require("../models/Customer");
const Address = require("../models/common/Address");
const FleetOwner = require("../models/FleetOwner");
const Branch = require("../models/Branch");
const SignupRequest = require("../models/SignupRequest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { getJwtSecret } = require("../utils/jwtSecret");
const { createOneStaff } = require("./staffController");


// Generate JWT
/**
 * The branch a public signup should be filed under.
 *
 * Public routes have no tenant context to inherit, so the location has to come
 * from the form. When only one branch exists the choice is unambiguous and the
 * field is optional — that keeps single-location installs from having to show a
 * picker with one entry in it.
 */
const resolveSignupBranch = async (locationId) => {
  if (locationId) {
    return Branch.findOne({ _id: locationId, active: true });
  }

  const active = await Branch.find({ active: true }).limit(2);
  return active.length === 1 ? active[0] : null;
};

const generateToken = (id) => {
  return jwt.sign({ id }, getJwtSecret(), {
    expiresIn: "30d",
  });
};

// @desc Admin creates staff
// @route POST /api/auth/admin/create-staff
// @access Private (admin only)
//
// Kept for the callers that already point here; the account it produces is the
// same one /api/staff produces, because it is the same function underneath.
// Staff administration proper — bulk adds, permissions, locations — lives in
// controllers/staffController.js.
const createStaff = async (req, res) => {
  try {
    const { user, password, emailStatus } = await createOneStaff({
      input: req.body,
      actor: req.user,
      emailedFrom: req.body.channel || "email",
    });

    res.status(201).json({
      message: "Staff created successfully",
      user,
      password,
      emailStatus,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
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

    // Customers belong to one operating location. A public form carries no
    // tenant context, so the branch has to be named (or inferred when the
    // install has only one).
    const branch = await resolveSignupBranch(req.body.locationId);
    if (!branch) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Choose a valid location to register under.",
        code: "LOCATION_REQUIRED",
      });
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
          locations: [branch._id],
          defaultLocation: branch._id,
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
      locationId: branch._id,
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
          locationId: branch._id,
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
    // A duplicate email is something the caller can fix, so it is reported as a
    // bad request rather than a server fault — a 500 sends staff to the logs
    // looking for an outage that is not there.
    const isCallerFixable = /already exists|are required|is required/i.test(
      err.message || "",
    );
    return res.status(isCallerFixable ? 400 : 500).json({ message: err.message });
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

    // Normalised before the lookup. Accounts are created with a lowercased
    // address, but the sign-in form passed whatever was typed straight through —
    // so a capitalised address, or one pasted from an email with a trailing
    // space, found nothing and reported "Invalid credentials" even when the
    // password was right.
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      // Someone who registered and is waiting on the office would otherwise be
      // told their credentials are wrong, and would keep trying. They submitted
      // this address themselves, so naming its state tells them nothing they
      // did not already know.
      const pending = await SignupRequest.findOne({
        email: normalizedEmail,
        status: "PENDING",
      }).lean();

      if (pending) {
        return res.status(403).json({
          message:
            "Your registration is still waiting on approval. We will email your " +
            "sign-in details once it is approved.",
          code: "REGISTRATION_PENDING",
        });
      }

      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Checked after the password so a wrong guess cannot be used to find out
    // which accounts exist and have been disabled. Removing a staff member or
    // taking a driver off a roster has to stop them signing in, or the removal
    // is cosmetic.
    if (user.isDeleted) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "This account has been deactivated. Contact your administrator.",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    user.lastLogin = new Date();
    await user.save();

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

// The shortest password the system accepts, matching validators/userValidator.js.
// Kept in step with it deliberately: a change-password screen that demands more
// than signup did would reject a password the account was created with.
const MIN_PASSWORD_LENGTH = 6;

// @desc    Change your own password
// @route   PUT /api/auth/change-password
// @access  Private (every role)
//
// Every account in the system is created with a password somebody else chose —
// staff issue credentials to customers and carriers, admins issue them to staff,
// and the seed issues them to admins. Until this existed there was no way for
// any of those people to stop the person who issued it from still knowing it,
// which is the whole reason a password is worth having.
//
// The current password is required even though the caller is already
// authenticated. A token in a borrowed browser is exactly the case this is
// defending against, and asking for the old password is what stops a session
// left open from becoming a permanent account takeover.
const changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Your current password and a new password are both required.",
      });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        message: "Your new password must be different from your current one.",
      });
    }

    // `password` is select:false on the schema, so it has to be asked for.
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const matches = await user.matchPassword(currentPassword);
    if (!matches) {
      // Deliberately not "that password is wrong" versus anything else — the
      // only thing worth telling the caller is that it did not work.
      return res.status(401).json({
        message: "That is not your current password.",
      });
    }

    // Assigned in the clear; the pre-save hook on the model hashes it, and
    // hashing here as well would double-hash and lock the account out.
    user.password = newPassword;
    await user.save();

    res.json({ message: "Your password has been changed." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("locations", "name code")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      // The client hides nav entries and buttons from these; the server still
      // re-checks every request, so this is a courtesy to the UI and never the
      // thing that keeps anyone out.
      permissions: user.permissions || [],
      locations: user.locations || [],
      defaultLocation: user.defaultLocation || null,
      // Set on driver sub-accounts: the carrier they drive for.
      parentAccount: user.parentAccount || null,
      isActive: user.isActive !== false,
      isVerified: user.isVerified,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  changePassword,
  createStaff,
  registerCustomer,
  createCustomerByStaff,
  createFleetOwnerByStaff,
  loginUser,
  getMe,
};
