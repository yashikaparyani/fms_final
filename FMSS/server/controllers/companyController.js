const Company = require("../models/Company");
const Address = require("../models/common/Address");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all companies (optionally search by name)
// @route   GET /api/companies?search=<name>
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getCompanies = async (req, res) => {
  try {
    const filter = { active: true };

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    const companies = await Company.find(filter).sort({ name: 1 });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single company by ID (with its addresses populated)
// @route   GET /api/companies/:id
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate("addresses");
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a new company
// @route   POST /api/companies
// @access  Private (staff / admin)
// ─────────────────────────────────────────────────────────────────────────────
const createCompany = async (req, res) => {
  try {
    const { name, type, contactName, contactPhone, contactEmail, notes } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Company name is required" });
    }

    const company = await Company.create({
      name,
      type,
      contactName,
      contactPhone,
      contactEmail,
      notes,
    });

    res.status(201).json(company);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update a company
// @route   PUT /api/companies/:id
// @access  Private (staff / admin)
// ─────────────────────────────────────────────────────────────────────────────
const updateCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Soft-delete a company
// @route   DELETE /api/companies/:id
// @access  Private (admin only)
// ─────────────────────────────────────────────────────────────────────────────
const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json({ message: "Company deactivated", company });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all addresses for a specific company
// @route   GET /api/companies/:id/addresses
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ company: req.params.id }).sort({ createdAt: -1 });
    res.json(addresses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Add a new address to a company
// @route   POST /api/companies/:id/addresses
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const addCompanyAddress = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const { street, suite, city, state, zip, directions, lat, lng } = req.body;

    if (!street || !city || !state || !zip) {
      return res.status(400).json({ message: "Street, city, state, and zip are required" });
    }

    const address = await Address.create({
      street,
      suite,
      city,
      state,
      zip,
      directions,
      lat,
      lng,
      company: company._id,
    });

    res.status(201).json(address);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanyAddresses,
  addCompanyAddress,
};