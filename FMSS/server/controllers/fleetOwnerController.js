const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");
const Load = require("../models/Load")
const { sendFleetOwnerCredentials } = require("../services/emailService");
const { findCarrierFor } = require("../utils/carrierAccount");
const mongoose = require("mongoose");

// Generate random password
const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
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

// @desc    Get all fleet owners
// @route   GET /api/fleet-owners
// @access  Private (Staff/Admin)
const getFleetOwners = async (req, res) => {
  try {
    const fleetOwners = await FleetOwner.find().sort({ createdAt: -1 });
    res.json(fleetOwners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single fleet owner by ID
// @route   GET /api/fleet-owners/:id
// @access  Private (Staff/Admin)
const getFleetOwnerById = async (req, res) => {
  try {
    const fleetOwner = await FleetOwner.findById(req.params.id);
    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }
    res.json(fleetOwner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new fleet owner (and optionally a user account)
// @route   POST /api/fleet-owners
// @access  Private (Staff/Admin)
const createFleetOwner = async (req, res) => {
  try {
    const {
      carrierName,
      phone,
      fax,
      mcLicense,
      dotLicense,
      taxId,
      websiteUrl,
      notes,
      street,
      suite,
      city,
      state,
      zip,
      contactPersons,
      createUserAccount,
      sendCredentials
    } = req.body;

    // Create Fleet Owner
    const fleetOwner = await FleetOwner.create({
      carrierName,
      phone,
      fax,
      mcLicense,
      dotLicense,
      taxId,
      websiteUrl,
      notes,
      street,
      suite,
      city,
      state,
      zip,
      contactPersons: contactPersons || [],
      status: 'ACTIVE'
    });

    let userAccount = null;
    let generatedPassword = null;
    let emailStatus = null;

    // If createUserAccount is true or sendCredentials is true, create a user account
    if (createUserAccount || sendCredentials) {
      // Get primary contact email
      const primaryContact = contactPersons?.find(c => c.isPrimary) || contactPersons?.[0];
      const email = primaryContact?.email;

      if (email) {
        // Check if user already exists
        const existingUser = await User.findOne({ email });

        if (!existingUser) {
          generatedPassword = generatePassword();

          userAccount = await User.create({
            firstName: carrierName,
            lastName: 'Fleet',
            email,
            password: generatedPassword,
            role: 'fleetOwner',
            isVerified: true,
            // The carrier has to be a member of the location its record was
            // filed under. Without this the account authenticates but cannot
            // resolve a location, so every request after sign-in comes back
            // 403 NO_LOCATION — an account that exists and cannot be used.
            locations: [fleetOwner.locationId],
            defaultLocation: fleetOwner.locationId,
          });

          // Link user to fleet owner
          fleetOwner.userId = userAccount._id;
          await fleetOwner.save();

          // Send credentials if requested
          if (sendCredentials) {
            emailStatus = await sendFleetOwnerCredentials({
              carrierName,
              email,
              loginEmail: userAccount.email,
              password: generatedPassword,
              includeBiddingAccess: true,
            });
          }
        } else {
          // Link existing user
          fleetOwner.userId = existingUser._id;
          await fleetOwner.save();

          // Same membership rule as above. An account that already existed may
          // have been created before this location did, or by a path that did
          // not grant one — so it is added rather than assumed.
          const has = (existingUser.locations || []).map(String);
          if (!has.includes(String(fleetOwner.locationId))) {
            existingUser.locations = [...has, fleetOwner.locationId];
            existingUser.defaultLocation =
              existingUser.defaultLocation || fleetOwner.locationId;
            await existingUser.save();
          }
        }
      }
    }

    res.status(201).json({
      fleetOwner,
      userCreated: !!userAccount,
      credentialsGenerated: !!generatedPassword,
      emailStatus,
      message: generatedPassword
        ? `Fleet owner created. Credentials: Email: ${userAccount.email}, Password: ${generatedPassword}`
        : 'Fleet owner created successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update fleet owner
// @route   PUT /api/fleet-owners/:id
// @access  Private (Staff/Admin)
const primaryEmailOf = (fleetOwner) => {
  const contacts = fleetOwner?.contactPersons || [];
  const contact = contacts.find((c) => c.isPrimary) || contacts[0];
  return String(contact?.email || "").trim().toLowerCase();
};

const updateFleetOwner = async (req, res) => {
  try {
    // Read the contact address before the edit, so a change to it can be
    // detected below.
    const before = await FleetOwner.findById(req.params.id).select("contactPersons userId").lean();

    const fleetOwner = await FleetOwner.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after", runValidators: true }
    );

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    // ─── Keep the sign-in address with the contact address ──────────────────
    // The carrier's login is created from the primary contact's email. Editing
    // that contact afterwards used to leave the account on the old address, so
    // credentials were mailed to one address while the account answered to
    // another — and the carrier was told to sign in with an address that has no
    // account. Correcting a typo in the contact was enough to cause it.
    //
    // Only moved when the two were in step beforehand. A login that was already
    // deliberately different from the contact is somebody's decision, and is
    // left alone rather than silently reassigned.
    const oldEmail = primaryEmailOf(before);
    const newEmail = primaryEmailOf(fleetOwner);

    let loginNotice = null;

    if (fleetOwner.userId && newEmail && newEmail !== oldEmail) {
      const account = await User.findById(fleetOwner.userId);

      if (account && String(account.email || "").trim().toLowerCase() === oldEmail) {
        const clash = await User.findOne({ email: newEmail, _id: { $ne: account._id } });

        if (clash) {
          // Said out loud rather than skipped quietly. The address now shown on
          // the carrier belongs to somebody else's account, so the sign-in
          // address stays where it was — and staff need to know that before they
          // mail credentials that name the wrong one.
          loginNotice =
            `Contact address updated, but the sign-in address is still ${account.email} — ` +
            `${newEmail} already belongs to a ${clash.role} account.`;
        } else {
          account.email = newEmail;
          await account.save();
          loginNotice = `Sign-in address moved to ${newEmail}.`;
        }
      } else if (account) {
        loginNotice = `Contact address updated. The sign-in address is unchanged at ${account.email}.`;
      }
    }

    res.json(loginNotice ? { ...fleetOwner.toObject(), loginNotice } : fleetOwner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete fleet owner
// @route   DELETE /api/fleet-owners/:id
// @access  Private (Staff/Admin)
const deleteFleetOwner = async (req, res) => {
  try {
    const fleetOwner = await FleetOwner.findByIdAndDelete(req.params.id);

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    res.json({ message: "Fleet owner deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send credentials to fleet owner
// @route   POST /api/fleet-owners/:id/send-credentials
// @access  Private (Staff/Admin)
const sendCredentialsToFleetOwner = async (req, res) => {
  try {
    const channel = req.body?.channel || "email";
    if (!["email", "manual", "whatsapp"].includes(channel)) {
      return res.status(400).json({ message: "Invalid credential sharing channel" });
    }

    const fleetOwner = await FleetOwner.findById(req.params.id);

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    const primaryContact = fleetOwner.contactPersons?.find(c => c.isPrimary) || fleetOwner.contactPersons?.[0];
    const email = primaryContact?.email;

    if (!email) {
      return res.status(400).json({ message: "No email found for this fleet owner" });
    }

    // Only ever a carrier account. A stale or mislinked `userId` can point at
    // somebody else entirely — a customer who happens to share the contact
    // email — and resetting that person's password from the Fleet Owners screen
    // would lock a customer out of their own portal.
    const linked = fleetOwner.userId
      ? await User.findOne({ _id: fleetOwner.userId })
      : null;

    let user = linked && linked.role === "fleetOwner" ? linked : null;

    if (!user) {
      const byEmail = await User.findOne({ email });
      if (byEmail && byEmail.role !== "fleetOwner") {
        return res.status(409).json({
          message:
            `${email} already belongs to a ${byEmail.role} account. ` +
            `Give this carrier a different contact email, or remove that account first.`,
        });
      }
      user = byEmail || null;
    }

    const generatedPassword = generatePassword();

    if (!user) {
      // Create user account
      user = await User.create({
        firstName: fleetOwner.carrierName,
        lastName: 'Fleet',
        email,
        password: generatedPassword,
        role: 'fleetOwner',
        isVerified: true,
        // Without membership the account authenticates and then 403s on every
        // request — see resolveLocation. Same rule as createFleetOwner.
        locations: [fleetOwner.locationId],
        defaultLocation: fleetOwner.locationId,
      });

      fleetOwner.userId = user._id;
      await fleetOwner.save();
    } else {
      // Reset password
      user.password = generatedPassword;

      // Repair membership on the way past: an account issued before locations
      // existed would otherwise get a working password and still not load.
      if (!(user.locations || []).length && fleetOwner.locationId) {
        user.locations = [fleetOwner.locationId];
        user.defaultLocation = fleetOwner.locationId;
      }

      await user.save();

      if (String(fleetOwner.userId) !== String(user._id)) {
        fleetOwner.userId = user._id;
        await fleetOwner.save();
      }
    }

    const emailStatus =
      channel === "email"
        ? await sendFleetOwnerCredentials({
            carrierName: fleetOwner.carrierName,
            email,
            loginEmail: user.email,
            password: generatedPassword,
          })
        : skippedManualEmailStatus(channel);

    res.json({
      message: emailStatus.sent
        ? "Credentials sent successfully"
        : channel === "email"
          ? `Credentials generated (${emailStatus.message || "email not sent"})`
          : "Credentials generated for manual sharing",
      // Where it was sent, and what to actually type at the sign-in screen.
      // These differ whenever the carrier's paperwork contact is not the person
      // the account was opened under, and staff reading the password out need
      // to quote the right one.
      email,
      loginEmail: user.email,
      emailStatus,
      password: generatedPassword // Return password so staff can share via WhatsApp if needed
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAssignedLoadToConfirm = async (req, res) => {
  try {
    // Resolved from the account rather than from the request, so a driver
    // sub-account lands on their own carrier's roster and nobody else's — see
    // utils/carrierAccount.js.
    const fleetOwner = await findCarrierFor(req.user);

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }
     const fleetOwnerId = new mongoose.Types.ObjectId(fleetOwner._id);

    // Find assigned loads using fleet owner name
   const assignedLoads = await Load.find({
      "assignedFleetOwner.fleetOwnerId": fleetOwnerId
    }).sort({ createdAt: -1 });

    res.status(200).json(assignedLoads);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getFleetOwners,
  getFleetOwnerById,
  createFleetOwner,
  updateFleetOwner,
  deleteFleetOwner,
  sendCredentialsToFleetOwner,getAssignedLoadToConfirm
};
