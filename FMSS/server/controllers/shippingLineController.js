// controllers/shippingLineController.js
const ShippingLine = require("../models/ShippingLine");

// Names are matched case-insensitively, so user input must be escaped before
// it is used to build the lookup RegExp.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findByName = (name, excludeId) => {
  const query = { name: new RegExp(`^${escapeRegex(name)}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  return ShippingLine.findOne(query);
};

/**
 * GET /api/shipping-lines
 * GET /api/shipping-lines?active=true   → only lines available for selection
 * Response: [{ _id, name, code, isActive }]
 */
const getShippingLines = async (req, res) => {
  try {
    const query = req.query.active === "true" ? { isActive: true } : {};
    // Collation keeps the sort naturally alphabetical; the default byte order
    // would put "MSC" before "Maersk".
    const lines = await ShippingLine.find(query)
      .collation({ locale: "en", strength: 2 })
      .sort({ name: 1 });
    res.json(lines);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/shipping-lines
 * Body: { name, code?, isActive? }
 */
const createShippingLine = async (req, res) => {
  const { name, code, email, isActive } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Shipping line name is required" });
  }

  try {
    const trimmed = name.trim();

    if (await findByName(trimmed)) {
      return res.status(409).json({ message: `"${trimmed}" already exists` });
    }

    const line = await ShippingLine.create({
      name: trimmed,
      code: (code || "").trim(),
      email: (email || "").trim(),
      isActive: isActive !== false,
    });

    res.status(201).json(line);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Shipping line already exists" });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/shipping-lines/:id
 * Body: { name?, code?, isActive? }
 */
const updateShippingLine = async (req, res) => {
  const { name, code, email, isActive } = req.body || {};

  try {
    const line = await ShippingLine.findById(req.params.id);
    if (!line) {
      return res.status(404).json({ message: "Shipping line not found" });
    }

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Shipping line name is required" });
      }
      if (await findByName(trimmed, line._id)) {
        return res.status(409).json({ message: `"${trimmed}" already exists` });
      }
      line.name = trimmed;
    }

    if (code !== undefined) line.code = (code || "").trim();
    if (email !== undefined) line.email = (email || "").trim();
    if (isActive !== undefined) line.isActive = Boolean(isActive);

    await line.save();
    res.json(line);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Shipping line already exists" });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /api/shipping-lines/:id
 * Loads store the shipping line as a plain string, so removing a master entry
 * only takes it out of the dropdown — existing loads keep their value.
 */
const deleteShippingLine = async (req, res) => {
  try {
    const line = await ShippingLine.findByIdAndDelete(req.params.id);
    if (!line) {
      return res.status(404).json({ message: "Shipping line not found" });
    }
    res.json({ message: "Shipping line deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getShippingLines,
  createShippingLine,
  updateShippingLine,
  deleteShippingLine,
};
