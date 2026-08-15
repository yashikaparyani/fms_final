// A driver cannot move a load until their licence is on file — and it does not
// matter whether they uploaded it or their carrier did.
//
// Also covers the carrier seeing where their own drivers are, since both rest on
// the same rule: a carrier's drivers, and nobody else's.

const fs = require("fs");
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Load = require("../models/Load");
const TrackingEvent = require("../models/TrackingEvent");

const driverRoutes = require("../routes/driverRoutes");
const { requireDriverLicense } = require("../middleware/driverCompliance");
const { protect, authorizeRoles } = require("../middleware/auth");

const app = express();
app.use(express.json());
app.use("/api/drivers", driverRoutes);

// A stand-in for the real status route: same middleware chain, no 900-line
// controller behind it. What is under test is the gate, not the update.
app.put(
  "/api/loads/:loadId/transport-status",
  protect,
  authorizeRoles("staff", "admin", "fleetOwner", "driver"),
  requireDriverLicense,
  (req, res) => res.json({ ok: true, updatedBy: req.user.role }),
);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

const call = (method, path, user, branch) => {
  const req = request(app)[method](path);
  if (user) req.set("Authorization", `Bearer ${tokenFor(user)}`);
  if (branch) req.set("x-location-id", String(branch._id));
  return req;
};

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
});
afterAll(async () => await closeDatabase());

let ny;
let carrierUser;
let carrier;
let rivalUser;
let rival;
let staffUser;
let driver;
let driverUser;

const uploadedFiles = [];

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
  });

  carrierUser = await User.create({
    firstName: "Swift Haulage",
    email: "swift@carrier.com",
    password: "password123",
    role: "fleetOwner",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  rivalUser = await User.create({
    firstName: "Rival Freight",
    email: "rival@carrier.com",
    password: "password123",
    role: "fleetOwner",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  staffUser = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "staff",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  await withTenant({ locationId: String(ny._id) }, async () => {
    carrier = await FleetOwner.create({
      userId: carrierUser._id,
      carrierName: "Swift Haulage",
    });
    rival = await FleetOwner.create({
      userId: rivalUser._id,
      carrierName: "Rival Freight",
    });
  });

  await call("post", "/api/drivers/bulk", carrierUser, ny).send({
    drivers: [{ name: "Ravi Kumar", email: "ravi@swift.com" }],
  });

  driver = await withTenant({ locationId: String(ny._id) }, () => Driver.findOne());
  driverUser = await User.findById(driver.userId);
});

afterEach(async () => {
  await Promise.all(
    uploadedFiles.splice(0).map((p) => fs.promises.unlink(p).catch(() => {})),
  );
});

/** Put a licence on the record the way the carrier's onboarding would. */
const putLicenceOnFile = async ({ expiry } = {}) => {
  await withTenant({ locationId: String(ny._id) }, async () => {
    const record = await Driver.findById(driver._id);
    record.licenseDocument = {
      fileName: "licence.png",
      filePath: "/tmp/licence.png",
      uploadedAt: new Date(),
    };
    if (expiry) record.licenseExpiry = expiry;
    await record.save();
  });
};

describe("The gate", () => {
  it("blocks a driver with no licence, and says how to fix it", async () => {
    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("DRIVER_LICENSE_REQUIRED");
    // The apps route straight to the upload screen off this.
    expect(res.body.action).toBe("UPLOAD_LICENSE");
  });

  it("lets the same driver through once a licence is on file", async () => {
    await putLicenceOnFile();

    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(200);
  });

  it("does not care who uploaded it — the carrier's copy counts", async () => {
    // The whole point: a carrier who added their roster with licences during
    // onboarding has already satisfied this, and their drivers never see it.
    await putLicenceOnFile();

    const res = await call("get", "/api/drivers/me", driverUser, ny);
    expect(res.body.compliance.canUpdateLoads).toBe(true);
  });

  it("blocks an expired licence the same as a missing one", async () => {
    await putLicenceOnFile({ expiry: new Date("2020-01-01") });

    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("DRIVER_LICENSE_EXPIRED");
  });

  it("accepts a licence that has not expired yet", async () => {
    await putLicenceOnFile({ expiry: new Date("2099-01-01") });

    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(200);
  });

  it("does not gate a fleet owner updating from the office", async () => {
    // The carrier acting as itself is not the person in the cab, and staff and
    // admins update administratively.
    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      carrierUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(200);
    expect(res.body.updatedBy).toBe("fleetOwner");
  });

  it("does not gate staff", async () => {
    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      staffUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(200);
  });

  it("distinguishes a missing driver record from a missing licence", async () => {
    // Uploading a licence would not fix an orphaned account, so it must not read
    // as a licence problem.
    await withTenant({ locationId: String(ny._id) }, () =>
      Driver.deleteOne({ _id: driver._id }),
    );

    const res = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("NO_DRIVER_RECORD");
  });
});

describe("A driver uploading their own licence", () => {
  it("is reachable without a licence — it is how they get one", async () => {
    const res = await call("get", "/api/drivers/me", driverUser, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.compliance.canUpdateLoads).toBe(false);
    expect(res.body.compliance.code).toBe("DRIVER_LICENSE_REQUIRED");
  });

  it("clears the block in one action", async () => {
    const upload = await call("post", "/api/drivers/me/license", driverUser, ny)
      .field("licenseNumber", "D1234567")
      .field("licenseState", "ca")
      .field("licenseExpiry", "2099-04-01")
      .attach("license", Buffer.from("fake-licence"), "licence.png");

    expect(upload.statusCode).toBe(200);
    expect(upload.body.compliance.canUpdateLoads).toBe(true);

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findById(driver._id),
    );
    expect(saved.licenseState).toBe("CA"); // normalised
    uploadedFiles.push(saved.licenseDocument.filePath);

    const update = await call(
      "put",
      "/api/loads/NY-LD-0001/transport-status",
      driverUser,
      ny,
    ).send({ transportStatus: "PICKED_UP" });

    expect(update.statusCode).toBe(200);
  });

  it("refuses an upload with no file attached", async () => {
    const res = await call("post", "/api/drivers/me/license", driverUser, ny).field(
      "licenseNumber",
      "D1234567",
    );

    expect(res.statusCode).toBe(400);
  });

  it("never exposes where the scan sits on disk", async () => {
    const res = await call("post", "/api/drivers/me/license", driverUser, ny).attach(
      "license",
      Buffer.from("fake-licence"),
      "licence.png",
    );

    expect(res.body.driver.hasLicenseOnFile).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/uploads[\\/]/);

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findById(driver._id),
    );
    uploadedFiles.push(saved.licenseDocument.filePath);
  });

  it("keeps a carrier out of the driver-only routes", async () => {
    const res = await call("get", "/api/drivers/me", carrierUser, ny);
    expect(res.statusCode).toBe(403);
  });
});

describe("A carrier watching their drivers", () => {
  const position = (user, load, when, coords = { latitude: 33.77, longitude: -118.19 }) =>
    withTenant({ locationId: String(ny._id) }, () =>
      TrackingEvent.create({
        load: load._id,
        loadId: load.loadId,
        fleetOwner: carrier._id,
        user: user._id,
        coordinates: coords,
        recordedAt: when,
      }),
    );

  const newLoad = (overrides = {}) =>
    withTenant({ locationId: String(ny._id) }, () =>
      Load.create({
        createdBy: "staff",
        customer: new (require("mongoose").Types.ObjectId)(),
        truckType: "Container",
        material: "Boxes",
        amount: 100,
        ...overrides,
      }),
    );

  it("lists a driver with no reported position rather than hiding them", async () => {
    const res = await call("get", "/api/drivers/locations", carrierUser, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].driver.name).toBe("Ravi Kumar");
    // Null, not an invented position — "we do not know" is the honest answer.
    expect(res.body[0].location).toBeNull();
    expect(res.body[0].isLive).toBe(false);
  });

  it("returns the latest position, not an older one", async () => {
    const load = await newLoad();

    await position(driverUser, load, new Date("2026-01-01T10:00:00Z"), {
      latitude: 10,
      longitude: 10,
    });
    await position(driverUser, load, new Date("2026-01-02T10:00:00Z"), {
      latitude: 20,
      longitude: 20,
    });

    const res = await call("get", "/api/drivers/locations", carrierUser, ny);

    expect(res.body[0].location.latitude).toBe(20);
    expect(res.body[0].load.loadId).toBe(load.loadId);
  });

  it("marks a stopped trip as not live", async () => {
    // A position from a finished trip is a last-known location, not a live one —
    // showing them the same way is how a dispatcher routes to a truck that left.
    const load = await newLoad({ liveTracking: { status: "STOPPED" } });
    await position(driverUser, load, new Date());

    const res = await call("get", "/api/drivers/locations", carrierUser, ny);
    expect(res.body[0].location).not.toBeNull();
    expect(res.body[0].isLive).toBe(false);
  });

  it("marks a running trip as live", async () => {
    const load = await newLoad({ liveTracking: { status: "ACTIVE" } });
    await position(driverUser, load, new Date());

    const res = await call("get", "/api/drivers/locations", carrierUser, ny);
    expect(res.body[0].isLive).toBe(true);
  });

  it("shows a carrier only their own drivers", async () => {
    await call("post", "/api/drivers/bulk", rivalUser, ny).send({
      drivers: [{ name: "Rival Driver", email: "rd@rival.com" }],
    });

    const ours = await call("get", "/api/drivers/locations", carrierUser, ny);
    expect(ours.body.map((r) => r.driver.name)).toEqual(["Ravi Kumar"]);

    const theirs = await call("get", "/api/drivers/locations", rivalUser, ny);
    expect(theirs.body.map((r) => r.driver.name)).toEqual(["Rival Driver"]);
  });

  it("does not let a carrier ask for a rival's fleet", async () => {
    const res = await call(
      "get",
      `/api/drivers/locations?fleetOwnerId=${rival._id}`,
      carrierUser,
      ny,
    );

    // The carrier is read off the account, so naming another one changes nothing.
    expect(res.statusCode).toBe(200);
    expect(res.body.map((r) => r.driver.name)).toEqual(["Ravi Kumar"]);
  });
});
