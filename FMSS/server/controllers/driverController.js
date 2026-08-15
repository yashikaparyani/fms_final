const fs = require("fs");
const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");
const Load = require("../models/Load");
const TrackingEvent = require("../models/TrackingEvent");
const { findCarrierFor } = require("../utils/carrierAccount");
const { sendDriverCredentials } = require("../services/emailService");
const {
  generatePassword,
  skippedManualEmailStatus,
} = require("../utils/credentials");

// ─── Drivers & their sub-accounts ─────────────────────────────────────────────
// A fleet owner manages their own drivers here; staff and admins can see and
// manage the drivers of any carrier at their location.
//
// Giving a driver a login creates a User with role "driver" whose
// `parentAccount` is the carrier's own user — see utils/carrierAccount.js for
// what that buys: the driver reaches exactly the carrier's assigned loads,
// resolved from their account rather than from anything they send.
//
// Driver is tenant-scoped, so every query here is already narrowed to the active
// location by plugins/tenantScope.js.
// ─────────────────────────────────────────────────────────────────────────────

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const trimmed = (value) => String(value ?? "").trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toListItem = (driver, { carrierName } = {}) => {
  // `userId` arrives populated from the list queries but as a bare id straight
  // after a create, so the account fields are read only when they are really
  // there. Reading them off an ObjectId would silently produce undefined and
  // report a working login as disabled.
  const account =
    driver.userId && typeof driver.userId === "object" && driver.userId.email
      ? driver.userId
      : null;

  return {
    _id: driver._id,
    driverCode: driver.driverCode,
    name: driver.name,
    phone: driver.phone || "",
    email: driver.email || "",
    licenseNumber: driver.licenseNumber || "",
    licenseState: driver.licenseState || "",
    licenseClass: driver.licenseClass || "",
    licenseExpiry: driver.licenseExpiry || null,
    medicalCardExpiry: driver.medicalCardExpiry || null,
    endorsements: driver.endorsements || [],
    // A boolean, never the path — the scan is served through a route that
    // checks who is asking, and handing out its location on disk would go
    // around that.
    hasLicenseOnFile: !!driver.licenseDocument?.filePath,
    licenseUploadedAt: driver.licenseDocument?.uploadedAt || null,
    notes: driver.notes || "",
    active: driver.active !== false,
    // What the UI actually needs to know: is there an account behind this row,
    // and is it usable? A deactivated sub-account is not the same as none.
    hasLogin: !!driver.userId,
    loginActive: driver.userId ? account?.isActive !== false : false,
    loginEmail: account?.email || driver.email || "",
    lastLogin: account?.lastLogin || null,
    fleetOwner: driver.fleetOwner?._id || driver.fleetOwner || null,
    carrierName: carrierName || driver.fleetOwner?.carrierName || "",
    createdAt: driver.createdAt,
  };
};

/**
 * The carrier whose drivers this request may touch.
 *
 * A fleet owner (or one of their drivers) gets their own carrier and cannot ask
 * for another — the id is read off their account, never off the request. Staff
 * and admins must name one, because they work across carriers.
 */
const resolveCarrierScope = async (req, { requestedId } = {}) => {
  if (["fleetOwner", "driver"].includes(req.user.role)) {
    const carrier = await findCarrierFor(req.user, "_id carrierName userId");

    if (!carrier) {
      throw Object.assign(
        new Error(
          "No carrier profile is linked to your account. Ask the office to finish setting it up.",
        ),
        { status: 404 },
      );
    }

    return carrier;
  }

  const id = requestedId ? String(requestedId) : "";

  if (!id) {
    throw Object.assign(
      new Error("Name the carrier (fleetOwnerId) whose drivers you are managing."),
      { status: 400 },
    );
  }

  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error("Not a valid carrier id."), { status: 400 });
  }

  // Tenant-scoped, so this also proves the carrier belongs to the active
  // location — a staff member cannot manage another branch's carrier.
  const carrier = await FleetOwner.findById(id).select("_id carrierName userId");

  if (!carrier) {
    throw Object.assign(new Error("Carrier not found at this location."), {
      status: 404,
    });
  }

  return carrier;
};

/** Only the owning carrier, or back-office staff, may touch a driver record. */
const loadDriverForRequest = async (req) => {
  const driver = await Driver.findById(req.params.id)
    .populate("userId", "email isActive lastLogin")
    .populate("fleetOwner", "carrierName userId");

  if (!driver) {
    throw Object.assign(new Error("Driver not found."), { status: 404 });
  }

  if (["fleetOwner", "driver"].includes(req.user.role)) {
    const carrier = await findCarrierFor(req.user, "_id");
    const owns =
      carrier &&
      String(driver.fleetOwner?._id || driver.fleetOwner) === String(carrier._id);

    if (!owns) {
      throw Object.assign(new Error("That driver is not on your roster."), {
        status: 403,
      });
    }
  }

  return driver;
};

/**
 * Create one driver, and a sub-account for them when asked.
 *
 * Shared by the single and bulk routes so a bulk-added driver is identical to a
 * singly-added one. Throws with `.status` on anything the caller can fix; the
 * bulk caller turns that into a per-row failure.
 */
const createOneDriver = async ({ input, carrier, actor, channel = "email" }) => {
  const name = trimmed(input.name);

  if (!name) {
    throw Object.assign(new Error("A driver name is required."), { status: 400 });
  }

  const email = normalizeEmail(input.email);
  // Default to issuing a login when an email was given — that is what an email
  // in a driver row means — but let a caller say otherwise explicitly.
  const wantsLogin =
    input.createLogin === undefined ? !!email : !!input.createLogin;

  if (wantsLogin && !email) {
    throw Object.assign(
      new Error(`${name} needs an email address to be given an app login.`),
      { status: 400 },
    );
  }

  if (email && !EMAIL_RE.test(email)) {
    throw Object.assign(new Error(`"${email}" is not a valid email address.`), {
      status: 400,
    });
  }

  if (email) {
    const clash = await Driver.findOne({ fleetOwner: carrier._id, email });
    if (clash) {
      throw Object.assign(
        new Error(`${email} is already on this carrier's driver roster.`),
        { status: 409 },
      );
    }
  }

  if (wantsLogin) {
    // Checked against every account, not just drivers: emails are the login
    // identity system-wide, so a clash with a customer is just as fatal.
    const taken = await User.findOne({ email });
    if (taken) {
      throw Object.assign(new Error(`An account already exists for ${email}.`), {
        status: 409,
      });
    }
  }

  const driver = await Driver.create({
    fleetOwner: carrier._id,
    name,
    phone: trimmed(input.phone),
    email: email || undefined,
    licenseNumber: trimmed(input.licenseNumber),
    licenseExpiry: input.licenseExpiry || undefined,
    notes: trimmed(input.notes),
    createdBy: actor?._id,
  });

  if (!wantsLogin) {
    return { driver, password: null, emailStatus: null };
  }

  const password = trimmed(input.password) || generatePassword();

  // The sub-account. `parentAccount` is the carrier's user, which is what every
  // carrier-scoped lookup resolves through — a driver with no parent would see
  // nothing at all, so the carrier's own userId is required to issue a login.
  if (!carrier.userId) {
    // Roll the Driver back: leaving the record without the login the caller
    // asked for would read as success in the list.
    await Driver.deleteOne({ _id: driver._id });
    throw Object.assign(
      new Error(
        `${carrier.carrierName || "This carrier"} has no portal account yet, so drivers cannot be given logins under it. Ask the office to issue the carrier's credentials first.`,
      ),
      { status: 400 },
    );
  }

  let account;
  try {
    account = await User.create({
      firstName: name,
      lastName: "",
      email,
      phone: trimmed(input.phone),
      // Hashed by the model's pre-save hook — see models/User.js.
      password,
      role: "driver",
      isVerified: true,
      isActive: true,
      parentAccount: carrier.userId,
      // A driver works the location their carrier belongs to. Read off the
      // tenant context rather than the request so it cannot disagree with the
      // Driver record that was just stamped with the same value.
      locations: driver.locationId ? [driver.locationId] : [],
      defaultLocation: driver.locationId || undefined,
      addedBy: actor?._id,
      addedByName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" "),
    });
  } catch (error) {
    await Driver.deleteOne({ _id: driver._id });
    throw error;
  }

  driver.userId = account._id;
  await driver.save();

  const emailStatus =
    channel === "email"
      ? await sendDriverCredentials({
          driverName: name,
          email,
          password,
          carrierName: carrier.carrierName,
        })
      : skippedManualEmailStatus(channel);

  return { driver, account, password, emailStatus };
};

// ─── A driver's own record ────────────────────────────────────────────────────
// Separate from the roster routes because the driver is not managing anybody —
// they are looking at themselves and fixing the one thing that stands between
// them and working. Keyed off their own account, so the apps never have to know
// a driver id.
// ─────────────────────────────────────────────────────────────────────────────

/** Whether this driver may currently move a load, and why not if not. */
const complianceFor = (driver) => {
  if (!driver?.licenseDocument?.filePath) {
    return {
      canUpdateLoads: false,
      code: "DRIVER_LICENSE_REQUIRED",
      message:
        "Upload a photo of your driver's licence before you can update a load. It only has to be done once.",
    };
  }

  if (driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date()) {
    return {
      canUpdateLoads: false,
      code: "DRIVER_LICENSE_EXPIRED",
      message:
        "Your licence on file has expired. Upload a current one before you can update a load.",
    };
  }

  return { canUpdateLoads: true, code: null, message: "" };
};

// @desc    The signed-in driver's own record and compliance state
// @route   GET /api/drivers/me
// @access  Private (driver)
const getMyDriverRecord = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id })
      .populate("userId", "email isActive lastLogin")
      .populate("fleetOwner", "carrierName");

    if (!driver) {
      return res.status(404).json({
        message:
          "Your driver record could not be found. Ask your carrier to check your account.",
        code: "NO_DRIVER_RECORD",
      });
    }

    res.json({
      driver: toListItem(driver),
      compliance: complianceFor(driver),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    A driver uploads their own licence
// @route   POST /api/drivers/me/license
// @access  Private (driver)
//
// The same record the carrier can fill in during onboarding — whoever gets there
// first satisfies the requirement, and a driver whose carrier already uploaded
// one never sees this at all.
const uploadMyLicense = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      return res.status(404).json({
        message:
          "Your driver record could not be found. Ask your carrier to check your account.",
        code: "NO_DRIVER_RECORD",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Attach a photo or scan of your licence." });
    }

    const previous = driver.licenseDocument?.filePath;

    driver.licenseDocument = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    };

    if (req.body.licenseNumber !== undefined) {
      driver.licenseNumber = trimmed(req.body.licenseNumber);
    }
    if (req.body.licenseState !== undefined) {
      driver.licenseState = trimmed(req.body.licenseState).toUpperCase();
    }
    if (req.body.licenseClass !== undefined) {
      driver.licenseClass = trimmed(req.body.licenseClass).toUpperCase();
    }
    if (req.body.licenseExpiry) driver.licenseExpiry = req.body.licenseExpiry;
    if (req.body.medicalCardExpiry) {
      driver.medicalCardExpiry = req.body.medicalCardExpiry;
    }

    await driver.save();

    // A driver has one current licence. Keeping superseded scans means a renewal
    // quietly doubles what a breach would expose.
    if (previous && previous !== driver.licenseDocument.filePath) {
      fs.promises.unlink(previous).catch(() => {});
    }

    const compliance = complianceFor(driver);

    res.json({
      message: compliance.canUpdateLoads
        ? "Licence saved — you can now update your loads."
        : compliance.message,
      driver: toListItem(driver),
      compliance,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Drivers on a roster
// @route   GET /api/drivers
// @access  Private (fleetOwner — own roster; staff/admin — any carrier via ?fleetOwnerId)
const getDrivers = async (req, res) => {
  try {
    const filter = {};

    if (["fleetOwner", "driver"].includes(req.user.role)) {
      const carrier = await resolveCarrierScope(req);
      filter.fleetOwner = carrier._id;
    } else if (req.query.fleetOwnerId) {
      const carrier = await resolveCarrierScope(req, {
        requestedId: req.query.fleetOwnerId,
      });
      filter.fleetOwner = carrier._id;
    }
    // Staff with no carrier named: every driver at the active location. Useful
    // for the back office answering "who is driving for us today".

    if (String(req.query.includeInactive) !== "true") {
      filter.active = { $ne: false };
    }

    const drivers = await Driver.find(filter)
      .populate("userId", "email isActive lastLogin")
      .populate("fleetOwner", "carrierName")
      .sort({ createdAt: -1 });

    res.json(drivers.map((d) => toListItem(d)));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Where each of a carrier's drivers last reported from
// @route   GET /api/drivers/locations
// @access  Private (fleetOwner — own roster; staff/admin — any carrier)
//
// Built from the tracking events the drivers' own phones already send, rather
// than from a second location feed: a driver's position is a fact about the trip
// they are running, and deriving it from the trip means there is nothing extra
// to keep in step, and no way for a driver to appear somewhere they were not
// actually reporting from.
//
// A carrier sees only their own drivers. Nobody is tracked while not on a trip —
// the phone reports during an active load and stops when the trip stops, so the
// worst case is a stale last-known position, which is labelled as such rather
// than presented as live.
const getDriverLocations = async (req, res) => {
  try {
    const carrier = await resolveCarrierScope(req, {
      requestedId: req.query.fleetOwnerId,
    });

    const drivers = await Driver.find({
      fleetOwner: carrier._id,
      active: { $ne: false },
      userId: { $exists: true, $ne: null },
    })
      .populate("userId", "email lastLogin")
      .lean();

    const userIds = drivers
      .map((d) => d.userId?._id)
      .filter(Boolean);

    if (!userIds.length) return res.json([]);

    // Latest event per driver. Sorting before grouping and taking $first is the
    // standard "latest per key" shape — the index on { load, recordedAt } does
    // not cover this, but a carrier's roster is tens of drivers, not thousands.
    const latest = await TrackingEvent.aggregate([
      { $match: { user: { $in: userIds } } },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: "$user", event: { $first: "$$ROOT" } } },
    ]);

    const eventByUser = new Map(latest.map((row) => [String(row._id), row.event]));

    // The loads those events belong to, for the trip context and to tell a live
    // position from a stale one.
    const loadIds = [...new Set(latest.map((row) => row.event.load).filter(Boolean))];

    const loads = loadIds.length
      ? await Load.find({ _id: { $in: loadIds } })
          .select("loadId containerNo transportStatus liveTracking pickup drop")
          .lean()
      : [];

    const loadById = new Map(loads.map((l) => [String(l._id), l]));

    const rows = drivers.map((driver) => {
      const event = eventByUser.get(String(driver.userId._id));
      const load = event ? loadById.get(String(event.load)) : null;

      return {
        driver: {
          _id: driver._id,
          name: driver.name,
          driverCode: driver.driverCode,
          phone: driver.phone,
          email: driver.userId?.email || driver.email || "",
        },
        // Null rather than an invented position: "we do not know where this
        // driver is" is the honest answer for somebody who has never run a trip.
        location: event
          ? {
              latitude: event.coordinates.latitude,
              longitude: event.coordinates.longitude,
              accuracy: event.coordinates.accuracy,
              heading: event.coordinates.heading,
              speed: event.coordinates.speed,
              batteryLevel: event.batteryLevel,
              recordedAt: event.recordedAt,
            }
          : null,
        // Live means the trip is still running. Anything else is a last-known
        // position, and showing the two the same way is how a dispatcher ends up
        // routing to a truck that left yesterday.
        isLive: load?.liveTracking?.status === "ACTIVE",
        load: load
          ? {
              loadId: load.loadId,
              containerNo: load.containerNo,
              transportStatus: load.transportStatus,
              pickupCity: load.pickup?.city || "",
              dropCity: load.drop?.city || "",
            }
          : null,
      };
    });

    // Live drivers first, then the most recently seen — which is the order a
    // dispatcher scans the list in.
    rows.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      const aTime = a.location?.recordedAt ? new Date(a.location.recordedAt) : 0;
      const bTime = b.location?.recordedAt ? new Date(b.location.recordedAt) : 0;
      return bTime - aTime;
    });

    res.json(rows);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Add one driver
// @route   POST /api/drivers
// @access  Private (fleetOwner, staff, admin)
const createDriver = async (req, res) => {
  try {
    const carrier = await resolveCarrierScope(req, {
      requestedId: req.body.fleetOwnerId,
    });

    const { driver, password, emailStatus } = await createOneDriver({
      input: req.body,
      carrier,
      actor: req.user,
      channel: req.body.channel || "email",
    });

    await driver.populate("userId", "email isActive lastLogin");

    res.status(201).json({
      message: password
        ? emailStatus?.sent
          ? `${driver.name} added — login details emailed.`
          : `${driver.name} added. Share the password shown here.`
        : `${driver.name} added.`,
      driver: toListItem(driver, { carrierName: carrier.carrierName }),
      // Shown once, at creation, so the carrier can hand it to the driver in
      // person — which is how it usually happens.
      password,
      emailStatus,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Add several drivers in one submission
// @route   POST /api/drivers/bulk
// @access  Private (fleetOwner, staff, admin)
//
// Rows are independent and reported on individually, and deliberately not
// transactional: a carrier typing in their six drivers should not lose the five
// good rows because the sixth reused an email. See the same reasoning in
// staffController.createStaffBulk.
const createDriversBulk = async (req, res) => {
  try {
    const carrier = await resolveCarrierScope(req, {
      requestedId: req.body.fleetOwnerId,
    });

    const rows = Array.isArray(req.body.drivers) ? req.body.drivers : [];

    if (!rows.length) {
      return res.status(400).json({ message: "Add at least one driver." });
    }

    if (rows.length > 50) {
      return res.status(400).json({
        message: `That is ${rows.length} drivers in one go — split it into batches of 50 or fewer.`,
      });
    }

    // Emails repeated inside the submission itself, caught up-front so the
    // second one reads as "you typed this twice".
    const seen = new Set();
    const duplicateRows = new Set();
    rows.forEach((row, index) => {
      const email = normalizeEmail(row?.email);
      if (!email) return;
      if (seen.has(email)) duplicateRows.add(index);
      else seen.add(email);
    });

    const created = [];
    const failed = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};

      if (duplicateRows.has(index)) {
        failed.push({
          index,
          name: trimmed(row.name),
          message: "This email appears more than once in the list.",
        });
        continue;
      }

      try {
        const result = await createOneDriver({
          input: row,
          carrier,
          actor: req.user,
          channel: req.body.channel || "email",
        });

        created.push({
          index,
          driver: toListItem(result.driver, { carrierName: carrier.carrierName }),
          password: result.password,
          emailStatus: result.emailStatus,
        });
      } catch (error) {
        failed.push({
          index,
          name: trimmed(row.name),
          message: error.message,
        });
      }
    }

    const status = failed.length === 0 ? 201 : created.length ? 207 : 400;

    const withLogins = created.filter((c) => c.password).length;

    res.status(status).json({
      message:
        failed.length === 0
          ? `${created.length} driver(s) added${withLogins ? `, ${withLogins} with app logins` : ""}.`
          : created.length
            ? `${created.length} added, ${failed.length} could not be added.`
            : `None of the ${failed.length} rows could be added.`,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Update a driver
// @route   PUT /api/drivers/:id
// @access  Private (owning fleetOwner, staff, admin)
const updateDriver = async (req, res) => {
  try {
    const driver = await loadDriverForRequest(req);

    for (const field of ["name", "phone", "licenseNumber", "notes"]) {
      if (req.body[field] !== undefined) driver[field] = trimmed(req.body[field]);
    }

    if (req.body.licenseExpiry !== undefined) {
      driver.licenseExpiry = req.body.licenseExpiry || undefined;
    }

    if (req.body.email !== undefined) {
      const email = normalizeEmail(req.body.email);

      if (email && !EMAIL_RE.test(email)) {
        return res
          .status(400)
          .json({ message: `"${email}" is not a valid email address.` });
      }

      // The sub-account's login email moves with the driver record — leaving the
      // two disagreeing would mean mailing credentials to an address that cannot
      // sign in.
      if (driver.userId && !email) {
        return res.status(400).json({
          message:
            "This driver has an app login, so their email cannot be cleared. Remove the login first.",
        });
      }

      if (email && email !== driver.email) {
        const clash = await Driver.findOne({
          fleetOwner: driver.fleetOwner?._id || driver.fleetOwner,
          email,
          _id: { $ne: driver._id },
        });
        if (clash) {
          return res.status(409).json({
            message: `${email} is already on this carrier's driver roster.`,
          });
        }

        if (driver.userId) {
          const taken = await User.findOne({
            email,
            _id: { $ne: driver.userId._id || driver.userId },
          });
          if (taken) {
            return res
              .status(409)
              .json({ message: `An account already exists for ${email}.` });
          }

          await User.findByIdAndUpdate(driver.userId._id || driver.userId, {
            email,
          });
        }

        driver.email = email;
      }
    }

    if (req.body.active !== undefined) {
      driver.active = !!req.body.active;

      // A driver taken off the roster must stop being able to sign in. Doing
      // only one of the two is the gap that leaves a former driver still
      // updating loads from their phone.
      if (driver.userId) {
        await User.findByIdAndUpdate(driver.userId._id || driver.userId, {
          isActive: driver.active,
        });
      }
    }

    // Renaming the driver renames the account, so tracking events and proof
    // uploads keep showing the name the carrier actually uses.
    if (req.body.name !== undefined && driver.userId) {
      await User.findByIdAndUpdate(driver.userId._id || driver.userId, {
        firstName: driver.name,
      });
    }

    await driver.save();
    await driver.populate("userId", "email isActive lastLogin");

    res.json({
      message: `${driver.name} updated.`,
      driver: toListItem(driver),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Take a driver off the roster
// @route   DELETE /api/drivers/:id
// @access  Private (owning fleetOwner, staff, admin)
//
// Deactivates rather than deletes: the driver's name is on the tracking events
// and delivery proof of every run they made, and their sub-account is stamped on
// those records as the uploader.
const deactivateDriver = async (req, res) => {
  try {
    const driver = await loadDriverForRequest(req);

    driver.active = false;
    await driver.save();

    if (driver.userId) {
      await User.findByIdAndUpdate(driver.userId._id || driver.userId, {
        isActive: false,
      });
    }

    res.json({
      message: `${driver.name} deactivated${driver.userId ? " and their login disabled" : ""}.`,
      driver: toListItem(driver),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Issue or reset a driver's app login
// @route   POST /api/drivers/:id/send-credentials
// @access  Private (owning fleetOwner, staff, admin)
//
// Doubles as "give this existing driver a login": a carrier who added a driver
// without one, then bought them a phone, should not have to delete and re-add.
const sendCredentialsToDriver = async (req, res) => {
  try {
    // "Reset the password of the driver as they stand" is a bodyless POST, and
    // express.json() leaves req.body undefined when no content-type arrives.
    const body = req.body || {};

    const channel = body.channel || "email";
    if (!["email", "manual", "whatsapp"].includes(channel)) {
      return res
        .status(400)
        .json({ message: "Invalid credential sharing channel" });
    }

    const driver = await loadDriverForRequest(req);

    const email = normalizeEmail(body.email || driver.email);

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({
        message: `${driver.name} needs a valid email address before a login can be issued.`,
      });
    }

    const password = generatePassword();
    const carrier = await FleetOwner.findById(
      driver.fleetOwner?._id || driver.fleetOwner,
    ).select("carrierName userId");

    if (driver.userId) {
      const account = await User.findById(driver.userId._id || driver.userId);
      if (!account) {
        return res
          .status(404)
          .json({ message: "This driver's login account is missing." });
      }

      account.email = email;
      account.password = password; // hashed by the model hook
      // Re-issuing credentials is how a suspended driver is let back in.
      account.isActive = true;
      await account.save();
    } else {
      if (!carrier?.userId) {
        return res.status(400).json({
          message: `${carrier?.carrierName || "This carrier"} has no portal account yet, so drivers cannot be given logins under it.`,
        });
      }

      const taken = await User.findOne({ email });
      if (taken) {
        return res
          .status(409)
          .json({ message: `An account already exists for ${email}.` });
      }

      const account = await User.create({
        firstName: driver.name,
        lastName: "",
        email,
        phone: driver.phone,
        password,
        role: "driver",
        isVerified: true,
        isActive: true,
        parentAccount: carrier.userId,
        locations: driver.locationId ? [driver.locationId] : [],
        defaultLocation: driver.locationId || undefined,
        addedBy: req.user._id,
      });

      driver.userId = account._id;
    }

    if (driver.email !== email) driver.email = email;
    await driver.save();

    const emailStatus =
      channel === "email"
        ? await sendDriverCredentials({
            driverName: driver.name,
            email,
            password,
            carrierName: carrier?.carrierName,
          })
        : skippedManualEmailStatus(channel);

    await driver.populate("userId", "email isActive lastLogin");

    res.json({
      message: emailStatus.sent
        ? "Login details sent successfully"
        : channel === "email"
          ? `Login details generated (${emailStatus.message || "email not sent"})`
          : "Login details generated for manual sharing",
      email,
      password,
      emailStatus,
      driver: toListItem(driver),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getDrivers,
  getDriverLocations,
  getMyDriverRecord,
  uploadMyLicense,
  createDriver,
  createDriversBulk,
  updateDriver,
  deactivateDriver,
  sendCredentialsToDriver,
  createOneDriver,
  complianceFor,
};
