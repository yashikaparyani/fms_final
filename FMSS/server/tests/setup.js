const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.setTimeout(120000); // 120 seconds timeout for slower machines

let mongoServer;

const connect = async () => {
  // Increase instance timeout for slower machines
  mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 60000, // 60 seconds for instance startup
    }
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

const closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

const clearDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
};

module.exports = {
  connect,
  closeDatabase,
  clearDatabase
};
