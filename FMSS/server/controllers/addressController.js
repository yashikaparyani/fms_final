const Address = require("../models/common/Address");

// @desc    Get all addresses (optionally filter by customer)
// @route   GET /api/addresses?customer=<customerId>
// @access  Private
const getAllAddresses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.customer) {
      filter.customer = req.query.customer;
    }
    const addresses = await Address.find(filter).sort({ createdAt: -1 });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a new address (linked to a customer)
// @route   POST /api/addresses
// @access  Private
const addAddress = async (req, res) => {
  try {
    const { street, suite, city, state, zip, directions, customer, lat, lng } = req.body;

    if (!street || !city || !state || !zip) {
      return res
        .status(400)
        .json({ message: "Please provide street, city, state, and zip" });
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
      customer: customer || undefined,
    });

    res.status(201).json(address);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getAllAddresses,
  addAddress,
};