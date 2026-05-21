const mongoose = require('mongoose');
const path = require('path');
const Load = require('../models/Load');
(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27018/fms?replicaSet=rs0');
    const rows = await Load.find({ $or: [{ pickup: { $exists: false } }, { drop: { $exists: false } }] }, { loadId: 1, refNo: 1, adressAdded: 1, pickup: 1, drop: 1 }).limit(200).lean();
    console.log(JSON.stringify(rows, null, 2));
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
