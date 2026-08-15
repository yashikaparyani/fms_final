const mongoose = require("mongoose");
const User = require("../models/User");
const Branch = require("../models/Branch");
const {
  catalog,
  sanitizePermissions,
  expandTemplate,
} = require("../config/permissions");
const { sendStaffCredentials } = require("../services/emailService");
const {
  generatePassword,
  skippedManualEmailStatus,
} = require("../utils/credentials");

// ─── Staff & permission administration ────────────────────────────────────────
// Admin-only. Two jobs live here:
//
//   1. Getting people onto the system — one at a time, or a whole team in one
//      submission, because a new branch opening means eight or ten accounts and
//      doing that as eight round-trips through a single-record form is how half
//      of them end up with the wrong location.
//
//   2. Deciding what each of them can reach: which modules (config/permissions.js)
//      and which locations (User.locations, enforced by middleware/location.js).
//
// `User` is deliberately not tenant-scoped — staff can belong to several
// locations at once, so the collection cannot be partitioned by one — which is
// why these handlers query it directly with no runUnscoped() around them.
// ─────────────────────────────────────────────────────────────────────────────

const MANAGEABLE_ROLES = ["staff", "admin"];

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const trimmed = (value) => String(value ?? "").trim();

/**
 * Resolve the permissions to store from whatever the caller supplied.
 *
 * A template is expanded here and never remembered as a template: if we stored
 * "this user is a dispatcher", editing the dispatcher template later would
 * silently re-grant access an admin had deliberately taken away. Explicit
 * `permissions` win over a template so the UI can offer "start from dispatcher,
 * then untick two things".
 */
const resolvePermissions = ({ permissions, template }) => {
  if (Array.isArray(permissions)) return sanitizePermissions(permissions);
  if (template) return sanitizePermissions(expandTemplate(template));
  return [];
};

/**
 * Validate a set of location ids, returning the active ones.
 *
 * Inactive branches are rejected rather than quietly dropped: assigning
 * somebody to a closed location is a mistake worth hearing about, not a no-op.
 */
const resolveLocations = async (locationIds = []) => {
  const ids = [...new Set((locationIds || []).map(String).filter(Boolean))];

  if (!ids.length) return { ids: [], branches: [] };

  const bad = ids.filter((id) => !mongoose.isValidObjectId(id));
  if (bad.length) {
    throw Object.assign(new Error(`Not a valid location id: ${bad.join(", ")}`), {
      status: 400,
    });
  }

  const branches = await Branch.find({ _id: { $in: ids } })
    .select("_id name code active")
    .lean();

  const found = new Set(branches.map((b) => String(b._id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw Object.assign(
      new Error(`One or more of those locations does not exist.`),
      { status: 400 },
    );
  }

  const closed = branches.filter((b) => !b.active);
  if (closed.length) {
    throw Object.assign(
      new Error(
        `Cannot assign a deactivated location: ${closed.map((b) => b.name).join(", ")}.`,
      ),
      { status: 400 },
    );
  }

  return { ids, branches };
};

/** `defaultLocation` must be one of the assigned locations, or it means nothing. */
const resolveDefaultLocation = (locationIds, requested) => {
  const wanted = requested ? String(requested) : "";
  if (wanted && locationIds.includes(wanted)) return wanted;
  return locationIds[0] || undefined;
};

/** The shape the admin UI lists — never includes the password hash. */
const toListItem = (user) => ({
  _id: user._id,
  firstName: user.firstName || "",
  lastName: user.lastName || "",
  email: user.email,
  phone: user.phone || "",
  role: user.role,
  isActive: user.isActive !== false,
  isVerified: !!user.isVerified,
  lastLogin: user.lastLogin || null,
  permissions: user.permissions || [],
  locations: (user.locations || []).map((loc) =>
    loc && loc._id
      ? { _id: loc._id, name: loc.name, code: loc.code, active: loc.active }
      : { _id: loc },
  ),
  defaultLocation: user.defaultLocation || null,
  addedByName: user.addedByName || "",
  createdAt: user.createdAt,
});

// @desc    The permission catalog plus the locations that can be assigned
// @route   GET /api/staff/permission-catalog
// @access  Private (admin)
//
// One call rather than two: every screen that edits access needs both halves,
// and fetching them together means the module list and the location list can
// never be a render apart from each other.
const getPermissionCatalog = async (req, res) => {
  try {
    const branches = await Branch.find({ active: true })
      .select("_id name code city state")
      .sort({ name: 1 })
      .lean();

    res.json({ ...catalog(), locations: branches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    List staff (and fellow admins)
// @route   GET /api/staff
// @access  Private (admin)
const getStaff = async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const filter = {
      role: { $in: MANAGEABLE_ROLES },
      isDeleted: { $ne: true },
    };

    if (String(includeInactive) !== "true") {
      filter.isActive = { $ne: false };
    }

    const staff = await User.find(filter)
      .populate("locations", "name code active")
      .sort({ role: 1, firstName: 1, email: 1 })
      .lean();

    res.json(staff.map(toListItem));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    One staff member
// @route   GET /api/staff/:id
// @access  Private (admin)
const getStaffById = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      role: { $in: MANAGEABLE_ROLES },
      isDeleted: { $ne: true },
    })
      .populate("locations", "name code active")
      .lean();

    if (!user) return res.status(404).json({ message: "Staff member not found" });

    res.json(toListItem(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Create one staff account.
 *
 * Shared by the single-record route and the bulk route so both produce
 * identical accounts — the bulk path is not a second, looser implementation.
 * Throws with a `.status` on anything the caller can fix; the bulk caller turns
 * that into a per-row failure instead of aborting the whole submission.
 */
const createOneStaff = async ({
  input,
  defaults = {},
  actor,
  emailedFrom = "email",
}) => {
  const email = normalizeEmail(input.email);

  if (!email) {
    throw Object.assign(new Error("An email address is required."), { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error(`"${email}" is not a valid email address.`), {
      status: 400,
    });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    throw Object.assign(
      new Error(`An account already exists for ${email}.`),
      { status: 409 },
    );
  }

  const role = input.role === "admin" ? "admin" : "staff";

  // Per-row values win over the shared defaults, so a bulk submission can say
  // "everyone gets Chicago and the dispatcher template, except this one person".
  const requestedLocations =
    input.locations !== undefined ? input.locations : defaults.locations;

  const { ids: locationIds, branches } = await resolveLocations(requestedLocations);

  const permissions = resolvePermissions({
    permissions:
      input.permissions !== undefined ? input.permissions : defaults.permissions,
    template: input.template || defaults.template,
  });

  // Generated rather than chosen by the admin: it is mailed to its owner and
  // changed on first sign-in, and an admin inventing ten passwords in a bulk
  // form invents ten variations of the same one.
  const password = trimmed(input.password) || generatePassword();

  const user = await User.create({
    firstName: trimmed(input.firstName),
    lastName: trimmed(input.lastName),
    email,
    phone: trimmed(input.phone),
    // Hashed by the model's pre-save hook — see models/User.js.
    password,
    role,
    isVerified: true,
    isActive: true,
    permissions,
    locations: locationIds,
    defaultLocation: resolveDefaultLocation(
      locationIds,
      input.defaultLocation || defaults.defaultLocation,
    ),
    addedBy: actor?._id,
    addedByName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" "),
  });

  const emailStatus =
    emailedFrom === "email"
      ? await sendStaffCredentials({
          firstName: user.firstName,
          email: user.email,
          password,
          locationNames: branches.map((b) => b.name),
        })
      : skippedManualEmailStatus(emailedFrom);

  return { user, password, emailStatus, locationNames: branches.map((b) => b.name) };
};

// @desc    Create a staff account
// @route   POST /api/staff
// @access  Private (admin)
const createStaff = async (req, res) => {
  try {
    const body = req.body || {};
    const channel = body.channel || "email";

    const { user, password, emailStatus } = await createOneStaff({
      input: body,
      actor: req.user,
      emailedFrom: channel,
    });

    res.status(201).json({
      message: emailStatus.sent
        ? `${user.email} created — credentials emailed.`
        : `${user.email} created. Share the password shown here.`,
      staff: toListItem(user),
      // Returned in the clear once, at creation, so the admin can hand it over
      // when email is not configured or the new hire is standing next to them.
      password,
      emailStatus,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Create several staff accounts in one submission
// @route   POST /api/staff/bulk
// @access  Private (admin)
//
// Rows are processed independently and reported on individually. Deliberately
// NOT a transaction: a bulk add is usually somebody typing a team in from a
// list, and rolling back nine good rows because the tenth email is already
// taken means re-typing all ten. The response says exactly which rows landed and
// why the others did not.
const createStaffBulk = async (req, res) => {
  try {
    const { members, staff, locations, permissions, template, defaultLocation, channel } =
      req.body;

    const rows = Array.isArray(members) ? members : Array.isArray(staff) ? staff : [];

    if (!rows.length) {
      return res
        .status(400)
        .json({ message: "Add at least one staff member to create." });
    }

    if (rows.length > 50) {
      return res.status(400).json({
        message: `That is ${rows.length} accounts in one go — split it into batches of 50 or fewer.`,
      });
    }

    // Duplicates inside the submission itself. Caught up-front so the second
    // occurrence reads as "you typed this twice" rather than the confusing
    // "an account already exists" it would produce a moment later.
    const seen = new Map();
    const duplicateRows = new Set();
    rows.forEach((row, index) => {
      const email = normalizeEmail(row?.email);
      if (!email) return;
      if (seen.has(email)) duplicateRows.add(index);
      else seen.set(email, index);
    });

    const defaults = {
      locations,
      permissions,
      template,
      defaultLocation,
    };

    const created = [];
    const failed = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};

      if (duplicateRows.has(index)) {
        failed.push({
          index,
          email: normalizeEmail(row.email),
          message: "This email appears more than once in the list.",
        });
        continue;
      }

      try {
        const result = await createOneStaff({
          input: row,
          defaults,
          actor: req.user,
          emailedFrom: channel || "email",
        });

        created.push({
          index,
          staff: toListItem(result.user),
          password: result.password,
          emailStatus: result.emailStatus,
        });
      } catch (error) {
        failed.push({
          index,
          email: normalizeEmail(row.email),
          message: error.message,
        });
      }
    }

    // 207 when the outcome is mixed: a 201 would let a UI that only checks the
    // status code report ten successes when three rows were rejected.
    const status = failed.length === 0 ? 201 : created.length ? 207 : 400;

    res.status(status).json({
      message:
        failed.length === 0
          ? `${created.length} staff account(s) created.`
          : created.length
            ? `${created.length} created, ${failed.length} could not be created.`
            : `None of the ${failed.length} rows could be created.`,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Update a staff member's details
// @route   PUT /api/staff/:id
// @access  Private (admin)
const updateStaff = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      role: { $in: MANAGEABLE_ROLES },
      isDeleted: { $ne: true },
    });

    if (!user) return res.status(404).json({ message: "Staff member not found" });

    const isSelf = String(user._id) === String(req.user._id);

    for (const field of ["firstName", "lastName", "phone"]) {
      if (req.body[field] !== undefined) user[field] = trimmed(req.body[field]);
    }

    if (req.body.email !== undefined) {
      const email = normalizeEmail(req.body.email);
      if (email && email !== user.email) {
        const clash = await User.findOne({ email, _id: { $ne: user._id } });
        if (clash) {
          return res
            .status(409)
            .json({ message: `An account already exists for ${email}.` });
        }
        user.email = email;
      }
    }

    // An admin cannot demote or deactivate themselves. Not paternalism: an
    // install with one admin who locks themselves out has no way back in
    // through the UI at all.
    if (req.body.role !== undefined && MANAGEABLE_ROLES.includes(req.body.role)) {
      if (isSelf && req.body.role !== user.role) {
        return res
          .status(400)
          .json({ message: "You cannot change your own role." });
      }
      user.role = req.body.role;
    }

    if (req.body.isActive !== undefined) {
      if (isSelf && !req.body.isActive) {
        return res
          .status(400)
          .json({ message: "You cannot deactivate your own account." });
      }
      user.isActive = !!req.body.isActive;
    }

    if (req.body.permissions !== undefined || req.body.template !== undefined) {
      user.permissions = resolvePermissions({
        permissions: req.body.permissions,
        template: req.body.template,
      });
    }

    if (req.body.locations !== undefined) {
      const { ids } = await resolveLocations(req.body.locations);
      user.locations = ids;
      user.defaultLocation = resolveDefaultLocation(
        ids,
        req.body.defaultLocation ?? user.defaultLocation,
      );
    } else if (req.body.defaultLocation !== undefined) {
      user.defaultLocation = resolveDefaultLocation(
        (user.locations || []).map(String),
        req.body.defaultLocation,
      );
    }

    await user.save();
    await user.populate("locations", "name code active");

    res.json({
      message: `${user.email} updated.`,
      staff: toListItem(user),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/**
 * Apply one access change — locations, permissions, or both.
 *
 * Shared by the single-user route and the bulk matrix save for the same reason
 * createOneStaff is shared: one implementation means the matrix cannot drift
 * into validating less than the form does.
 */
const applyAccess = async ({ userId, locations, defaultLocation, permissions, template, actor }) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error("Not a valid user id."), { status: 400 });
  }

  const user = await User.findOne({
    _id: userId,
    role: { $in: MANAGEABLE_ROLES },
    isDeleted: { $ne: true },
  });

  if (!user) {
    throw Object.assign(new Error("Staff member not found."), { status: 404 });
  }

  // An admin reaches every active location by role (see allowedLocationsFor in
  // middleware/location.js), so scoping one is meaningless. Say so rather than
  // storing a list that has no effect.
  if (user.role === "admin" && locations !== undefined) {
    throw Object.assign(
      new Error(
        `${user.email} is an administrator and already reaches every location. Change their role to staff first to scope them.`,
      ),
      { status: 400 },
    );
  }

  if (
    user.role === "admin" &&
    String(user._id) === String(actor?._id) &&
    permissions !== undefined
  ) {
    throw Object.assign(
      new Error("You cannot change your own administrator permissions."),
      { status: 400 },
    );
  }

  if (locations !== undefined) {
    const { ids } = await resolveLocations(locations);
    user.locations = ids;
    user.defaultLocation = resolveDefaultLocation(
      ids,
      defaultLocation ?? user.defaultLocation,
    );
  } else if (defaultLocation !== undefined) {
    user.defaultLocation = resolveDefaultLocation(
      (user.locations || []).map(String),
      defaultLocation,
    );
  }

  if (permissions !== undefined || template !== undefined) {
    user.permissions = resolvePermissions({ permissions, template });
  }

  await user.save();
  await user.populate("locations", "name code active");

  return user;
};

// @desc    Set one staff member's modules and locations
// @route   PUT /api/staff/:id/access
// @access  Private (admin)
const setStaffAccess = async (req, res) => {
  try {
    const user = await applyAccess({
      userId: req.params.id,
      locations: req.body.locations,
      defaultLocation: req.body.defaultLocation,
      permissions: req.body.permissions,
      template: req.body.template,
      actor: req.user,
    });

    res.json({
      message: `Access updated for ${user.email}.`,
      staff: toListItem(user),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Save the whole who-sees-what grid in one request
// @route   PUT /api/staff/access
// @access  Private (admin)
//
// The permission screen is a grid of people against locations and modules, and
// an admin edits several rows before saving. Sending one request per changed row
// would leave the grid half-applied if the third of five failed; this reports
// per-row like the bulk create does, for the same reason.
const setStaffAccessBulk = async (req, res) => {
  try {
    const assignments = Array.isArray(req.body.assignments)
      ? req.body.assignments
      : [];

    if (!assignments.length) {
      return res.status(400).json({ message: "No changes to save." });
    }

    const updated = [];
    const failed = [];

    for (let index = 0; index < assignments.length; index += 1) {
      const row = assignments[index] || {};
      const userId = row.userId || row._id;

      try {
        const user = await applyAccess({
          userId,
          locations: row.locations,
          defaultLocation: row.defaultLocation,
          permissions: row.permissions,
          template: row.template,
          actor: req.user,
        });

        updated.push(toListItem(user));
      } catch (error) {
        failed.push({ index, userId: String(userId || ""), message: error.message });
      }
    }

    const status = failed.length === 0 ? 200 : updated.length ? 207 : 400;

    res.status(status).json({
      message:
        failed.length === 0
          ? `Access saved for ${updated.length} staff member(s).`
          : `${updated.length} saved, ${failed.length} failed.`,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Remove a staff account
// @route   DELETE /api/staff/:id
// @access  Private (admin)
//
// Soft delete. Staff ids are stamped onto loads, bids and tracking events as
// `addedBy` / `createdBy`, and a hard delete would turn all of that history into
// dangling references.
const deleteStaff = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      role: { $in: MANAGEABLE_ROLES },
      isDeleted: { $ne: true },
    });

    if (!user) return res.status(404).json({ message: "Staff member not found" });

    if (String(user._id) === String(req.user._id)) {
      return res
        .status(400)
        .json({ message: "You cannot remove your own account." });
    }

    user.isDeleted = true;
    user.isActive = false;
    // Access is revoked as part of removal rather than left behind: if the
    // account is ever restored it should come back with nothing granted.
    user.permissions = [];
    user.locations = [];
    user.defaultLocation = undefined;
    await user.save();

    res.json({ message: `${user.email} removed.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Issue a fresh password and mail it
// @route   POST /api/staff/:id/send-credentials
// @access  Private (admin)
const sendCredentialsToStaff = async (req, res) => {
  try {
    const channel = req.body?.channel || "email";
    if (!["email", "manual", "whatsapp"].includes(channel)) {
      return res
        .status(400)
        .json({ message: "Invalid credential sharing channel" });
    }

    const user = await User.findOne({
      _id: req.params.id,
      role: { $in: MANAGEABLE_ROLES },
      isDeleted: { $ne: true },
    }).populate("locations", "name");

    if (!user) return res.status(404).json({ message: "Staff member not found" });

    const password = generatePassword();
    user.password = password; // hashed by the model hook
    await user.save();

    const emailStatus =
      channel === "email"
        ? await sendStaffCredentials({
            firstName: user.firstName,
            email: user.email,
            password,
            locationNames: (user.locations || []).map((l) => l.name),
          })
        : skippedManualEmailStatus(channel);

    res.json({
      message: emailStatus.sent
        ? "Credentials sent successfully"
        : channel === "email"
          ? `Credentials generated (${emailStatus.message || "email not sent"})`
          : "Credentials generated for manual sharing",
      email: user.email,
      emailStatus,
      password,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPermissionCatalog,
  getStaff,
  getStaffById,
  createStaff,
  createStaffBulk,
  updateStaff,
  setStaffAccess,
  setStaffAccessBulk,
  deleteStaff,
  sendCredentialsToStaff,
  // exported for tests and for reuse by other creation paths
  createOneStaff,
};
