// Same contract as setup.js, but backed by a single-node replica set.
//
// Registration runs inside a mongoose transaction (as does registerCustomer),
// and MongoDB only permits transactions on a replica set or mongos. The default
// standalone in-memory server fails them with "Transaction numbers are only
// allowed on a replica set member or mongos", so any suite that exercises a
// transactional path has to use this harness instead.

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

jest.setTimeout(120000);

let replSet;

const connect = async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(replSet.getUri());
};

const closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (replSet) await replSet.stop();
};

const clearDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
};

module.exports = { connect, closeDatabase, clearDatabase };
