const Branch = require("../models/Branch");
const User = require("../models/User");
const Load = require("../models/Load");
const { runUnscoped } = require("../utils/tenantContext");
const { allowedLocationsFor } = require("../middleware/location");

// ─── Locations (branches) ─────────────────────────────────────────────────────
// Branch itself is not tenant-scoped — it is the thing being scoped by — so
// these handlers query it directly. Anything here that reaches into per-location
// collections must say so with runUnscoped().
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Locations the signed-in user may work in (drives the UI switcher)
// @route   GET /api/branches/mine
// @access  Private (any authenticated role)
const getMyBranches = async (req, res) => {
  try {
    const allowed = await allowedLocationsFor(req.user);
    const branches = await Branch.find({ _id: { $in: allowed }, active: true })
      .sort({ name: 1 })
      .lean();

    res.json({
      branches,
      // Undefined when the caller has no location yet — this route runs before
      // the tenant context is established, by design.
      activeLocationId: req.locationId ?? null,
      allLocations: !!req.allLocations,
      // Only a member of more than one branch has anything to switch between.
      canSwitch: branches.length > 1,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Active locations, name + code only, for public signup forms
// @route   GET /api/branches/public
// @access  Public
const getPublicBranches = async (req, res) => {
  try {
    const branches = await Branch.find({ active: true })
      .select("name code city state")
      .sort({ name: 1 })
      .lean();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    All locations
// @route   GET /api/branches
// @access  Private (admin)
const getBranches = async (req, res) => {
  try {
    const branches = await Branch.find().sort({ name: 1 }).lean();

    // Load counts come from a tenant collection, so the scope has to be lifted
    // deliberately — an admin listing locations is exactly the cross-location
    // case the escape hatch exists for.
    const counts = await runUnscoped(() =>
      Load.aggregate([{ $group: { _id: "$locationId", count: { $sum: 1 } } }]),
    );
    const countBy = new Map(counts.map((c) => [String(c._id), c.count]));

    const staffCounts = await User.aggregate([
      { $unwind: "$locations" },
      { $group: { _id: "$locations", count: { $sum: 1 } } },
    ]);
    const usersBy = new Map(staffCounts.map((c) => [String(c._id), c.count]));

    res.json(
      branches.map((b) => ({
        ...b,
        loadCount: countBy.get(String(b._id)) || 0,
        userCount: usersBy.get(String(b._id)) || 0,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a location
// @route   POST /api/branches
// @access  Private (admin)
const createBranch = async (req, res) => {
  try {
    const { name, code, address, city, state, zip, phone, email } = req.body;

    if (!String(name || "").trim() || !String(code || "").trim()) {
      return res
        .status(400)
        .json({ message: "A location name and code are both required." });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    const clash = await Branch.findOne({ code: normalizedCode });
    if (clash) {
      return res.status(400).json({
        message: `Location code ${normalizedCode} is already used by ${clash.name}.`,
      });
    }

    const branch = await Branch.create({
      name: String(name).trim(),
      code: normalizedCode,
      address,
      city,
      state,
      zip,
      phone,
      email,
      createdBy: req.user._id,
    });

    res.status(201).json(branch);
  } catch (error) {
    // Surface the schema's own messages (code length/charset) rather than a 500.
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: Object.values(error.errors)
          .map((e) => e.message)
          .join(" "),
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a location
// @route   PUT /api/branches/:id
// @access  Private (admin)
const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: "Location not found" });

    // The code is baked into every ID this branch has issued (NY-LD-0001), so
    // it is fixed once anything exists under it.
    if (req.body.code && String(req.body.code).toUpperCase() !== branch.code) {
      const issued = await runUnscoped(() =>
        Load.countDocuments({ locationId: branch._id }),
      );
      if (issued > 0) {
        return res.status(400).json({
          message: `The code cannot be changed: ${issued} load(s) already carry the ${branch.code}- prefix.`,
        });
      }
      branch.code = String(req.body.code).toUpperCase();
    }

    for (const field of ["name", "address", "city", "state", "zip", "phone", "email"]) {
      if (req.body[field] !== undefined) branch[field] = req.body[field];
    }
    if (req.body.active !== undefined) branch.active = !!req.body.active;

    await branch.save();
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Deactivate a location (never a hard delete)
// @route   DELETE /api/branches/:id
// @access  Private (admin)
const deactivateBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: "Location not found" });

    // Deactivate rather than delete: the branch's loads, invoices and history
    // stay readable, and its IDs keep resolving.
    branch.active = false;
    await branch.save();

    res.json({ message: `${branch.name} deactivated.`, branch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Set which locations a user may work in
// @route   PUT /api/branches/users/:userId
// @access  Private (admin)
const setUserBranches = async (req, res) => {
  try {
    const { locations = [], defaultLocation } = req.body;

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await Branch.find({ _id: { $in: locations } })
      .select("_id")
      .lean();
    const validIds = valid.map((b) => String(b._id));

    if (validIds.length !== locations.length) {
      return res
        .status(400)
        .json({ message: "One or more of those locations does not exist." });
    }

    user.locations = validIds;
    user.defaultLocation =
      defaultLocation && validIds.includes(String(defaultLocation))
        ? defaultLocation
        : validIds[0] || undefined;

    await user.save();

    res.json({
      message: `${user.email} now has access to ${validIds.length} location(s).`,
      locations: user.locations,
      defaultLocation: user.defaultLocation,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBranches,
  getMyBranches,
  getPublicBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
  setUserBranches,
};
