const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SignupRequest = require("../models/SignupRequest");
const User = require("../models/User");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");
const Branch = require("../models/Branch");
const Address = require("../models/common/Address");
const { generatePassword } = require("../utils/credentials");
const {
  sendCustomerCredentials,
  sendFleetOwnerCredentials,
} = require("../services/emailService");

/**
 * Public sign-up, and the office review that turns it into an account.
 *
 * The rule the whole file exists to enforce: submitting a form creates nothing
 * anyone can sign in with. A SignupRequest is inert. Only `approveSignup`
 * builds a User, and only it hands out a password.
 */

// Customers and carriers each belong to one operating location. A public form
// carries no tenant context, so the branch is either named or — when the
// install has exactly one — inferred. Mirrors resolveSignupBranch in
// authController; kept separate so a change to sign-up cannot silently alter
// the existing customer registration path.
const resolveBranch = async (locationId) => {
  if (locationId && mongoose.isValidObjectId(locationId)) {
    return Branch.findOne({ _id: locationId, active: true });
  }

  const active = await Branch.find({ active: true }).limit(2);
  return active.length === 1 ? active[0] : null;
};

// @desc    Submit a public registration for office approval
// @route   POST /api/signups
// @access  Public
const submitSignup = async (req, res) => {
  try {
    const {
      role,
      email,
      phone,
      firstName,
      lastName,
      customerName,
      carrierName,
      mcLicense,
      dotLicense,
      street,
      suite,
      city,
      state,
      zip,
      note,
      locationId,
    } = req.body;

    if (!["client", "fleetOwner"].includes(role)) {
      return res
        .status(400)
        .json({ message: "Choose whether you are registering as a customer or a carrier." });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required." });
    }

    if (role === "fleetOwner" && !String(carrierName || "").trim()) {
      return res.status(400).json({ message: "Carrier name is required." });
    }

    if (role === "client" && !String(firstName || "").trim()) {
      return res.status(400).json({ message: "First name is required." });
    }

    // An address that already has an account is not a new applicant. Answered
    // the same way as a duplicate application so this endpoint cannot be used
    // to enumerate which addresses hold accounts.
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    const existingPending = await SignupRequest.findOne({
      email: normalizedEmail,
      status: "PENDING",
    }).lean();

    if (existingUser || existingPending) {
      return res.status(409).json({
        message:
          "There is already a registration or an account for this email. " +
          "If you are waiting on approval, the office will be in touch.",
        code: "ALREADY_REGISTERED",
      });
    }

    const branch = await resolveBranch(locationId);
    if (!branch) {
      return res.status(400).json({
        message: "Choose a valid location to register under.",
        code: "LOCATION_REQUIRED",
      });
    }

    const request = await SignupRequest.create({
      role,
      email: normalizedEmail,
      phone,
      locationId: branch._id,
      address: { street, suite, city, state, zip },
      firstName,
      lastName,
      customerName,
      carrierName,
      mcLicense,
      dotLicense,
      note,
    });

    res.status(201).json({
      message:
        "Registration received. The office will review it and email your sign-in " +
        "details once your account is approved.",
      request: {
        id: request._id,
        role: request.role,
        email: request.email,
        status: request.status,
      },
    });
  } catch (error) {
    // The partial unique index can still lose a race with a simultaneous
    // submission; report it as the duplicate it is rather than as a 500.
    if (error.code === 11000) {
      return res.status(409).json({
        message: "There is already a pending registration for this email.",
        code: "ALREADY_REGISTERED",
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    List sign-up requests for review
// @route   GET /api/signups?status=PENDING&role=fleetOwner
// @access  Private (staff, admin)
const listSignups = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    const requests = await SignupRequest.find(filter)
      .populate("locationId", "name code")
      .populate("reviewedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(500);

    // The count the review screen badges its nav entry with, so it does not
    // have to fetch the list twice to know whether anything is waiting.
    const pendingCount = await SignupRequest.countDocuments({ status: "PENDING" });

    res.json({ requests, pendingCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Builds the shipper account an approved `client` request describes. */
const createClientAccount = async (request, password, session) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  const [user] = await User.create(
    [
      {
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        password: hashedPassword,
        phone: request.phone,
        role: "client",
        // Approved by a human, which is the verification this flow provides.
        isVerified: true,
        locations: [request.locationId],
        defaultLocation: request.locationId,
      },
    ],
    { session },
  );

  const [customer] = await Customer.create(
    [
      {
        user: user._id,
        customerName:
          request.customerName ||
          [request.firstName, request.lastName].filter(Boolean).join(" ") ||
          request.email,
        contact: { phone: request.phone, email: request.email },
        locationId: request.locationId,
        addresses: [],
      },
    ],
    { session },
  );

  const [address] = await Address.create(
    [
      {
        street: request.address?.street || "",
        suite: request.address?.suite || "",
        city: request.address?.city || "",
        state: request.address?.state || "",
        zip: request.address?.zip || "",
        customer: customer._id,
        locationId: request.locationId,
      },
    ],
    { session },
  );

  customer.addresses.push(address._id);
  await customer.save({ session });

  return user;
};

/** Builds the carrier account an approved `fleetOwner` request describes. */
const createCarrierAccount = async (request, password, session) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const address = request.address || {};

  const [user] = await User.create(
    [
      {
        email: request.email,
        password: hashedPassword,
        phone: request.phone,
        role: "fleetOwner",
        isVerified: true,
        locations: [request.locationId],
        defaultLocation: request.locationId,
        address: {
          street: address.street,
          city: address.city,
          state: address.state,
          zip: address.zip,
        },
        fleetProfile: {
          carrierName: request.carrierName,
          mcLicense: request.mcLicense,
          dotLicense: request.dotLicense,
        },
      },
    ],
    { session },
  );

  await FleetOwner.create(
    [
      {
        userId: user._id,
        carrierName: request.carrierName || request.email.split("@")[0],
        phone: request.phone,
        mcLicense: request.mcLicense,
        dotLicense: request.dotLicense,
        addresses: [
          {
            street: address.street,
            city: address.city,
            state: address.state,
            zip: address.zip,
          },
        ],
        contactPersons: [],
      },
    ],
    { session },
  );

  return user;
};

// @desc    Approve a sign-up: create the account and mail its credentials
// @route   POST /api/signups/:id/approve
// @access  Private (staff, admin)
const approveSignup = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const request = await SignupRequest.findById(req.params.id).session(session);

    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Registration not found" });
    }

    if (request.status !== "PENDING") {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: `This registration was already ${request.status.toLowerCase()}.`,
      });
    }

    // Someone may have been given an account by hand between submission and
    // review; approving would then collide on the unique email.
    const clash = await User.findOne({ email: request.email }).session(session);
    if (clash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "An account already exists for this email. Reject this registration instead.",
      });
    }

    const password = generatePassword();

    const user =
      request.role === "fleetOwner"
        ? await createCarrierAccount(request, password, session)
        : await createClientAccount(request, password, session);

    request.status = "APPROVED";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.createdUserId = user._id;
    await request.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Mailed after the commit. A mail server being down must not roll back an
    // account that was approved — the office can re-send from the review list.
    let emailStatus = { sent: false, message: "not attempted" };
    try {
      emailStatus =
        request.role === "fleetOwner"
          ? await sendFleetOwnerCredentials({
              carrierName: request.carrierName,
              email: request.email,
              loginEmail: request.email,
              password,
              includeBiddingAccess: true,
            })
          : await sendCustomerCredentials({
              customer: { email: request.email, firstName: request.firstName },
              password,
            });
    } catch (mailError) {
      emailStatus = { sent: false, message: mailError.message };
    }

    if (emailStatus?.sent) {
      await SignupRequest.updateOne(
        { _id: request._id },
        { credentialsEmailed: true },
      );
    }

    res.json({
      message: emailStatus?.sent
        ? "Approved. Sign-in details have been emailed."
        : `Approved, but the email did not go out (${emailStatus?.message || "unknown error"}). Share the password below.`,
      user: { id: user._id, email: user.email, role: user.role },
      emailStatus,
      // Returned so the office can pass it on by phone or WhatsApp when the
      // mail fails. It is not stored anywhere in plain text.
      password,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reject a sign-up
// @route   POST /api/signups/:id/reject
// @access  Private (staff, admin)
const rejectSignup = async (req, res) => {
  try {
    const request = await SignupRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Registration not found" });
    }

    if (request.status !== "PENDING") {
      return res.status(409).json({
        message: `This registration was already ${request.status.toLowerCase()}.`,
      });
    }

    request.status = "REJECTED";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.rejectionReason = req.body?.reason || "";
    await request.save();

    res.json({ message: "Registration rejected", request });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  submitSignup,
  listSignups,
  approveSignup,
  rejectSignup,
};
