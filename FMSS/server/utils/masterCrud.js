// utils/masterCrud.js
//
// Several masters (shipping lines, delivery partners, chassis companies) are
// the same shape: a unique display name plus a few optional string fields and
// an isActive flag, with loads referencing the entry by name rather than id.
// This factory builds the CRUD handlers for one of them so each master needs
// only its model and a label.

// Names are matched case-insensitively, so user input must be escaped before
// it is used to build the lookup RegExp.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {object}   options
 * @param {mongoose.Model} options.Model
 * @param {string}   options.label          Human name used in messages, e.g. "Delivery partner"
 * @param {string[]} options.textFields     Optional trimmed string fields, e.g. ["code", "email"]
 * @param {string[]} options.requiredFields Subset of textFields that may not be blank
 */
const createMasterController = ({
  Model,
  label,
  textFields = [],
  requiredFields = [],
}) => {
  const findByName = (name, excludeId) => {
    const query = { name: new RegExp(`^${escapeRegex(name)}$`, "i") };
    if (excludeId) query._id = { $ne: excludeId };
    return Model.findOne(query);
  };

  // Returns an error message, or null when every required field is present.
  const missingRequired = (body, { partial }) => {
    for (const field of requiredFields) {
      // On an update, a field the caller did not send keeps its stored value.
      if (partial && body[field] === undefined) continue;
      if (!String(body[field] || "").trim()) {
        return `${label} ${field} is required`;
      }
    }
    return null;
  };

  /**
   * GET /            → every entry
   * GET /?active=true → only entries available for selection
   */
  const list = async (req, res) => {
    try {
      const query = req.query.active === "true" ? { isActive: true } : {};
      // Collation keeps the sort naturally alphabetical; the default byte
      // order would put "MSC" before "Maersk".
      const rows = await Model.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort({ name: 1 });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };

  const create = async (req, res) => {
    const body = req.body || {};
    const { name, isActive } = body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: `${label} name is required` });
    }

    const missing = missingRequired(body, { partial: false });
    if (missing) return res.status(400).json({ message: missing });

    try {
      const trimmed = name.trim();

      if (await findByName(trimmed)) {
        return res.status(409).json({ message: `"${trimmed}" already exists` });
      }

      const doc = { name: trimmed, isActive: isActive !== false };
      for (const field of textFields) {
        doc[field] = String(body[field] || "").trim();
      }

      res.status(201).json(await Model.create(doc));
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: `${label} already exists` });
      }
      res.status(500).json({ message: err.message });
    }
  };

  const update = async (req, res) => {
    const body = req.body || {};
    const { name, isActive } = body;

    const missing = missingRequired(body, { partial: true });
    if (missing) return res.status(400).json({ message: missing });

    try {
      const row = await Model.findById(req.params.id);
      if (!row) return res.status(404).json({ message: `${label} not found` });

      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) {
          return res.status(400).json({ message: `${label} name is required` });
        }
        if (await findByName(trimmed, row._id)) {
          return res.status(409).json({ message: `"${trimmed}" already exists` });
        }
        row.name = trimmed;
      }

      for (const field of textFields) {
        if (body[field] !== undefined) {
          row[field] = String(body[field] || "").trim();
        }
      }
      if (isActive !== undefined) row.isActive = Boolean(isActive);

      await row.save();
      res.json(row);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: `${label} already exists` });
      }
      res.status(500).json({ message: err.message });
    }
  };

  /**
   * Loads store the master value as a plain string, so removing an entry only
   * takes it out of the dropdown — existing loads keep their value.
   */
  const remove = async (req, res) => {
    try {
      const row = await Model.findByIdAndDelete(req.params.id);
      if (!row) return res.status(404).json({ message: `${label} not found` });
      res.json({ message: `${label} deleted` });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };

  return { list, create, update, remove };
};

module.exports = { createMasterController, escapeRegex };
