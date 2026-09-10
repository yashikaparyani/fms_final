const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Load = require("./models/Load");
const User = require("./models/User");
const { runUnscoped } = require("./utils/tenantContext");

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/fms?directConnection=true";
const CUSTOMER_EMAIL = process.env.REFERENCE_LOAD_CUSTOMER || "client@fms.com";
const DEMO_MARKER = "REFERENCE_GROUPING_DEMO";

const seed = async () => {
  await mongoose.connect(MONGO_URI);

  const customer = await runUnscoped(() =>
    User.findOne({ email: CUSTOMER_EMAIL }).lean(),
  );
  if (!customer) {
    throw new Error(
      `Customer user ${CUSTOMER_EMAIL} was not found. Run seedTestData.js first or set REFERENCE_LOAD_CUSTOMER.`,
    );
  }

  await runUnscoped(() =>
    Load.deleteMany({ remarks: DEMO_MARKER, customer: customer._id }),
  );

  const sharedReference = "REF-GROUP-001";
  const loads = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const reference = number <= 5 ? sharedReference : `REF-SINGLE-${String(number - 5).padStart(3, "0")}`;

    return {
      customer: customer._id,
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email,
      createdBy: "staff",
      creatorId: customer._id,
      locationId: customer.defaultLocation || customer.locations?.[0],
      refNo: reference,
      remarks: DEMO_MARKER,
      truckType: "Container",
      material: `Reference grouping demo load ${String(number).padStart(2, "0")}`,
      amount: 1000 + number * 100,
      status: "ASSIGNED",
      transportStatus: "INVOICED",
      pickup: { city: "Oakland", state: "CA" },
      drop: { city: "Stockton", state: "CA" },
      accounting: {
        receivables: {
          currency: "USD",
          lines: [{ chargeType: "linehaul", amount: 1000 + number * 100 }],
        },
      },
    };
  });

  const created = await runUnscoped(() => Load.create(loads));
  console.log(`Created ${created.length} reference-grouping demo loads.`);
  console.log(`Shared reference: ${sharedReference} (${created.slice(0, 5).map((load) => load.loadId).join(", ")})`);
  console.log(`Distinct references: ${created.slice(5).map((load) => `${load.loadId}=${load.refNo}`).join(", ")}`);
};

seed()
  .catch((error) => {
    console.error(`Reference load seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
