const User = require("../models/User");
const Customer = require("../models/Customer");
const Address = require("../models/common/Address");
const { sendCustomerCredentials } = require("../services/emailService");
const mongoose = require("mongoose");

// Generate random password
const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const skippedManualEmailStatus = (channel) => ({
  requested: false,
  attempted: false,
  sent: false,
  skipped: true,
  reason: "MANUAL_CHANNEL",
  message: `Email not requested for ${channel} credential sharing.`,
});

// @desc    Get all customers (clients)
// @route   GET /api/customers
// @access  Private (Staff/Admin)
// const getCustomers = async (req, res) => {
//   try {
//     // 1. Get all client users
//     const users = await User.find({ role: "client" }).sort({ createdAt: -1 }).lean();

//     if (!users.length) return res.json([]);

//     // 2. Get all customer records for these users in one query
//     const userIds = users.map((u) => u._id);
//     const customerProfiles = await Customer.find({ user: { $in: userIds } }).lean();

//     // 3. Map customer profiles by userId for quick lookup
//     const customerMap = {};
//     customerProfiles.forEach((c) => {
//       customerMap[c.user.toString()] = c;
//     });

//     // 4. Merge user + customer + addresses into one response
//     const result = users.map((user) => {
//       const profile = customerMap[user._id.toString()] || null;

//       return {
//         // User fields
//         _id:       user._id,
//         firstName: user.firstName,
//         lastName:  user.lastName,
//         email:     user.email,
//         phone:     user.phone,
//         isActive:  user.isActive,
//         isVerified: user.isVerified,
//         createdAt: user.createdAt,

//         // Customer fields
//         customerName: profile?.customerName || `${user.firstName} ${user.lastName}`,
//         active:       profile?.active ?? true,

//         // Contact
//         contact: profile?.contact || {},

//         // Emails
//         emails: profile?.emails || {},

//         // Preferences
//         preferences: profile?.preferences || {},

//         // Addresses (array)
//         addresses: profile?.addresses || [],

//         // Raw customer id for editing
//         customerId: profile?._id || null,
//       };
//     });

//     res.json(result);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

const getCustomers = async (req, res) => {
  try {
    // 1. Get all users
    const users = await User.find({ role: "client" })
      .sort({ createdAt: -1 })
      .lean();

    if (!users.length) return res.json([]);

    const userIds = users.map((u) => u._id);

    // 2. Get customers + populate addresses
    const customerProfiles = await Customer.find({
      user: { $in: userIds },
    })
      .populate({
        path: "addresses",
        options: { sort: { createdAt: -1 } }, // 🔥 latest first
      })
      .lean();

    // 3. Map customer by userId
    const customerMap = {};
    customerProfiles.forEach((c) => {
      customerMap[c.user.toString()] = c;
    });

    // 4. Merge data
    const result = users.map((user) => {
      const profile = customerMap[user._id.toString()] || null;

      // 🔥 Get top/latest address
      const topAddress = profile?.addresses?.[0] || null;

      return {
        // User
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        isVerified: user.isVerified,
        createdAt: user.createdAt,

        // Customer
        customerName:
          profile?.customerName || `${user.firstName} ${user.lastName}`,
        active: profile?.active ?? true,

        contact: profile?.contact || {},
        emails: profile?.emails || {},
        preferences: profile?.preferences || {},

        // 🔥 ALL addresses (optional)
        addresses: profile?.addresses || [],

        // 🔥 TOP address (main requirement)
        primaryAddress: topAddress,

        customerId: profile?._id || null,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("❌ GET CUSTOMERS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single customer by ID
// @route   GET /api/customers/:id
// @access  Private (Staff/Admin)
const getCustomerById = async (req, res) => {
  try {
    const userId = req.params.id;

    // ✅ 1. GET USER
    const user = await User.findOne({
      _id: userId,
      role: "client",
    }).lean();

    if (!user) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // ✅ 2. GET CUSTOMER + POPULATE ADDRESSES
    const customer = await Customer.findOne({ user: userId })
      .populate("addresses") // 🔥 populate address collection
      .lean();

    // ✅ 3. MERGE DATA (important for frontend)
    const response = {
      ...user,
      ...customer,
    };

    res.json(response);
  } catch (error) {
    console.error("❌ getCustomerById error:", error);
    res.status(500).json({ message: error.message });
  }
};

// // @desc    Create a new customer (by staff)
// // @route   POST /api/customers
// // @access  Private (Staff/Admin)
// const createCustomer = async (req, res) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       email,
//       customerName,
//       street,
//       suite,
//       city,
//       state,
//       zip,
//       phone,
//       sendCredentials
//     } = req.body;

//     // Check if user already exists
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res.status(400).json({ message: "User with this email already exists" });
//     }

//     const generatedPassword = generatePassword();

//     const customer = await User.create({
//       firstName: firstName || customerName || 'Customer',
//       lastName: lastName || '',
//       email,
//       password: generatedPassword,
//       role: 'client',
//       isVerified: true
//     });

//     // Send credentials if requested
//     if (sendCredentials && email) {
//       await sendEmail({
//         to: email,
//         subject: "FMS - Your Customer Portal Credentials",
//         html: `
//           <h3>Welcome ${firstName || customerName}!</h3>
//           <p>Your customer account has been created in the FMS system.</p>
//           <p><strong>Login URL:</strong> ${process.env.FRONTEND_URL || 'http://localhost:5173'}/client-login</p>
//           <p><strong>Email:</strong> ${email}</p>
//           <p><strong>Password:</strong> ${generatedPassword}</p>
//           <br/>
//           <p>Please login and change your password immediately.</p>
//           <p>You can now create transport orders and track their status.</p>
//         `
//       });
//     }

//     res.status(201).json({
//       customer: {
//         id: customer._id,
//         firstName: customer.firstName,
//         lastName: customer.lastName,
//         email: customer.email,
//         role: customer.role
//       },
//       credentialsGenerated: true,
//       password: generatedPassword,
//       message: `Customer created. Email: ${email}, Password: ${generatedPassword}`
//     });
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // @desc    Update customer
// // @route   PUT /api/customers/:id
// // @access  Private (Staff/Admin)
// const updateCustomer = async (req, res) => {
//   try {
//     const { password, ...updateData } = req.body;

//     const customer = await User.findOneAndUpdate(
//       { _id: req.params.id, role: 'client' },
//       updateData,
//       { new: true, runValidators: true }
//     );

//     if (!customer) {
//       return res.status(404).json({ message: "Customer not found" });
//     }

//     res.json(customer);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // @desc    Delete customer
// // @route   DELETE /api/customers/:id
// // @access  Private (Staff/Admin)
// const deleteCustomer = async (req, res) => {
//   try {
//     const customer = await User.findOneAndDelete({ _id: req.params.id, role: 'client' });

//     if (!customer) {
//       return res.status(404).json({ message: "Customer not found" });
//     }

//     res.json({ message: "Customer deleted" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// @desc    Send credentials to customer
// @route   POST /api/customers/:id/send-credentials
// @access  Private (Staff/Admin)

// const editCustomerByStaff = async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     session.startTransaction();

//     const { id } = req.params;

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

//     // ✅ FIND USER FIRST
//     const user = await User.findOne({ _id: id, role: "client" }).session(
//       session,
//     );
//     if (!user) throw new Error("User not found");

//     // ✅ FIND CUSTOMER VIA USER
//     const customer = await Customer.findOne({ user: id }).session(session);
//     if (!customer) throw new Error("Customer not found");

//     // ✅ EMAIL DUPLICATE CHECK (if changed)
//     if (email && email !== user.email) {
//       const exists = await User.findOne({ email }).session(session);
//       if (exists) throw new Error("Email already in use");
//     }

//     // ✅ UPDATE USER
//     user.firstName = firstName || user.firstName;
//     user.lastName = lastName || user.lastName;
//     user.email = email || user.email;
//     user.phone = phone || user.phone;

//     await user.save({ session });

//     // ✅ UPDATE CUSTOMER
//     customer.customerName =
//       customerName ||
//       (firstName && lastName ? `${firstName} ${lastName}` : null) ||
//       customer.customerName;

//     customer.contact = {
//       phone: phone || "",
//       fax: fax || "",
//       email: email || "",
//       website: website || "",
//     };

//     customer.emails = {
//       podEmail: podEmail || "",
//       accChargesEmail: accChargesEmail || "",
//       deliveryEmail: deliveryEmail || "",
//     };

//     customer.preferences = {
//       sendStatusEmails: !!sendStatusEmails,
//       sendInvoiceEmails: !!sendInvoiceEmails,
//       creditLimitExceeded: !!creditLimitExceeded,
//     };

//     await customer.save({ session });

//     // ✅ HANDLE ADDRESS (update first or create new)
//     let address;

//     if (customer.addresses.length > 0) {
//       address = await Address.findById(customer.addresses[0]).session(session);

//       if (address) {
//         address.street = street || address.street;
//         address.suite = suite || address.suite;
//         address.city = city || address.city;
//         address.state = state || address.state;
//         address.zip = zip || address.zip;
//         address.directions = directions || address.directions;

//         await address.save({ session });
//       }
//     } else {
//       const [newAddress] = await Address.create(
//         [
//           {
//             street,
//             suite,
//             city,
//             state,
//             zip,
//             directions,
//             customer: customer._id,
//           },
//         ],
//         { session },
//       );

//       customer.addresses.push(newAddress._id);
//       await customer.save({ session });

//       address = newAddress;
//     }

//     await session.commitTransaction();
//     session.endSession();

//     res.json({
//       message: "Customer updated successfully",
//       user,
//       customer,
//       address,
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();

//     res.status(500).json({ message: err.message });
//   }
// };

const editCustomerByStaff = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;

    const {
      firstName, lastName, email, phone, fax, website,
      customerName, street, suite, city, state, zip, directions,
      podEmail, accChargesEmail, deliveryEmail,
      sendStatusEmails, sendInvoiceEmails, creditLimitExceeded,
    } = req.body;

    // ✅ FIND USER FIRST (just to verify existence)
    const user = await User.findOne({ _id: id, role: "client" }).session(session);
    if (!user) throw new Error("User not found");

    // ✅ EMAIL DUPLICATE CHECK (if changed)
    if (email && email !== user.email) {
      const exists = await User.findOne({ email }).session(session);
      if (exists) throw new Error("Email already in use");
    }

    // ✅ UPDATE USER — no .save(), no pre-save hook triggered
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(firstName && { firstName }),
          ...(lastName  && { lastName }),
          ...(email     && { email }),
          ...(phone     && { phone }),
        },
      },
      { returnDocument: "after", session }
    );

    // ✅ FIND CUSTOMER VIA USER
    const customer = await Customer.findOne({ user: id }).session(session);
    if (!customer) throw new Error("Customer not found");

    // ✅ UPDATE CUSTOMER — no .save()
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customer._id,
      {
        $set: {
          customerName:
            customerName ||
            (firstName && lastName ? `${firstName} ${lastName}` : customer.customerName),
          contact:     { phone: phone || "", fax: fax || "", email: email || "", website: website || "" },
          emails:      { podEmail: podEmail || "", accChargesEmail: accChargesEmail || "", deliveryEmail: deliveryEmail || "" },
          preferences: {
            sendStatusEmails:    !!sendStatusEmails,
            sendInvoiceEmails:   !!sendInvoiceEmails,
            creditLimitExceeded: !!creditLimitExceeded,
          },
        },
      },
      { returnDocument: "after", session }
    );

    // ✅ HANDLE ADDRESS
    let address;

    if (customer.addresses.length > 0) {
      address = await Address.findByIdAndUpdate(
        customer.addresses[0],
        {
          $set: {
            ...(street     && { street }),
            ...(suite      && { suite }),
            ...(city       && { city }),
            ...(state      && { state }),
            ...(zip        && { zip }),
            ...(directions && { directions }),
          },
        },
        { returnDocument: "after", session }
      );
    } else {
      // Create new address if none exists
      const [newAddress] = await Address.create(
        [{ street, suite, city, state, zip, directions, customer: customer._id }],
        { session }
      );

      await Customer.findByIdAndUpdate(
        customer._id,
        { $push: { addresses: newAddress._id } },
        { session }
      );

      address = newAddress;
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Customer updated successfully",
      user: updatedUser,
      customer: updatedCustomer,
      address,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
};

const deleteCustomerByStaff = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params; // 👈 THIS IS USER ID

    // ✅ 1. Find customer using USER ID

    const user = await User.findOne({ _id: id, role: "client" });
    if (!user) throw new Error("User not found");

    const customer = await Customer.findOne({ user: id }).session(session);

    if (!customer) {
      throw new Error("Customer not found");
    }

    // ✅ 2. Delete addresses
    if (customer.addresses?.length > 0) {
      await Address.deleteMany({
        _id: { $in: customer.addresses },
      }).session(session);
    }

    // ✅ 3. Delete customer
    await Customer.findByIdAndDelete(customer._id).session(session);

    // ✅ 4. Delete user
    await User.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Customer deleted successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({ message: err.message });
  }
};
const sendCredentialsToCustomer = async (req, res) => {
  try {
    const channel = req.body?.channel || "email";
    if (!["email", "manual", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "Invalid credential sharing channel" });
    }

    const customer = await User.findOne({ _id: req.params.id, role: "client" });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const generatedPassword = generatePassword();
    customer.password = generatedPassword;
    await customer.save();

    const emailStatus =
      channel === "email"
        ? await sendCustomerCredentials({ customer, password: generatedPassword })
        : skippedManualEmailStatus(channel);

    res.json({
      message: emailStatus.sent
        ? "Credentials sent successfully"
        : channel === "email"
          ? `Credentials generated (${emailStatus.message || "email not sent"})`
          : "Credentials generated for manual sharing",
      email: customer.email,
      emailStatus,
      password: generatedPassword, // Return password so staff can share via WhatsApp if needed
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  // createCustomer,
  // updateCustomer,
  // deleteCustomer,
  editCustomerByStaff,
  deleteCustomerByStaff,
  sendCredentialsToCustomer,
};
