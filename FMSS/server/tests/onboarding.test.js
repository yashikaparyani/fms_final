// Carrier onboarding: the two signed agreements, driver licences, and the
// insurance an outside agency files through a one-off link.
//
// The insurance half gets the most attention here because it is the only
// unauthenticated write surface in the system — a token in a URL is the entire
// authorisation, so what a token can and cannot reach is worth pinning down.

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
const CarrierOnboarding = require("../models/CarrierOnboarding");

const onboardingRoutes = require("../routes/onboardingRoutes");
const insuranceRoutes = require("../routes/insuranceRoutes");
const driverRoutes = require("../routes/driverRoutes");

const { shortfallsFor, missingRequired } = require("../config/insuranceCoverages");
const { profileGaps } = require("../config/carrierAgreements");

const app = express();
app.use(express.json());
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/drivers", driverRoutes);

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
let staff;

const FULL_PROFILE = {
  legalName: "Swift Haulage LLC",
  entityType: "LLC",
  mcNumber: "MC-778899",
  dotNumber: "3344556",
  taxIdType: "EIN",
  taxId: "12-3456789",
  street: "1400 Dock Rd",
  city: "Long Beach",
  state: "CA",
  zip: "90802",
  signerName: "Ravi Kumar",
  signerTitle: "Owner",
  signerEmail: "ravi@swift.com",
  signerPhone: "555-0100",
};

const EQUIPMENT = [
  {
    unitNumber: "T-101",
    equipmentType: "Tractor",
    make: "Freightliner",
    model: "Cascadia",
    year: 2021,
    vin: "1FUJGLDR9CLBP8834",
  },
];

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

  staff = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "staff",
    locations: [ny._id],
    defaultLocation: ny._id,
    permissions: ["fleetOwners.view", "fleetOwners.edit"],
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
});

/** Get to a signed contractor agreement in one call, for tests that need one. */
const signContractor = async () => {
  await call("put", "/api/onboarding/profile", carrierUser, ny).send({
    profile: FULL_PROFILE,
    equipment: EQUIPMENT,
  });

  return call(
    "post",
    "/api/onboarding/agreements/contractor/sign",
    carrierUser,
    ny,
  ).send({
    values: { arbitrationInitials: "RK", operatingLocation: "Long Beach, CA" },
    acknowledgements: [1, 2, 3, 4, 5], // length is what the server checks
    signedName: "Ravi Kumar",
    signedTitle: "Owner",
  });
};

describe("Catalog", () => {
  it("serves the agreement schema and the insurance requirements together", async () => {
    const res = await call("get", "/api/onboarding/catalog", carrierUser, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.sharedProfile.length).toBeGreaterThan(0);
    expect(res.body.agreements.map((a) => a.key).sort()).toEqual([
      "broker",
      "contractor",
    ]);
    expect(res.body.insurance.coverages.length).toBeGreaterThan(0);
    expect(res.body.insurance.requiredKeys).toContain("cargo");
  });
});

describe("Profile", () => {
  it("creates the file on first read, seeded from the carrier's name", async () => {
    const res = await call("get", "/api/onboarding", carrierUser, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.profile.legalName).toBe("Swift Haulage");
    expect(res.body.outstanding.length).toBeGreaterThan(0);
  });

  it("saves a half-finished form rather than rejecting it", async () => {
    // This is a long form filled over several sittings — refusing to remember an
    // incomplete one is how people abandon it.
    const res = await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: { legalName: "Swift Haulage LLC", mcNumber: "MC-778899" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.onboarding.profile.mcNumber).toBe("MC-778899");
  });

  it("reports which required details are still missing", () => {
    expect(profileGaps({})).toContain("Legal company name");
    expect(profileGaps(FULL_PROFILE)).toEqual([]);
  });

  it("gives each carrier their own file", async () => {
    await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: { legalName: "Swift Haulage LLC" },
    });

    const rivalView = await call("get", "/api/onboarding", rivalUser, ny);
    expect(rivalView.body.profile.legalName).toBe("Rival Freight");
  });
});

describe("Signing", () => {
  it("refuses to sign while required company details are blank", async () => {
    const res = await call(
      "post",
      "/api/onboarding/agreements/broker/sign",
      carrierUser,
      ny,
    ).send({
      values: { arbitrationInitials: "RK", classWaiverInitials: "RK" },
      acknowledgements: [1, 2, 3, 4],
      signedName: "Ravi Kumar",
      signedTitle: "Owner",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.gaps.length).toBeGreaterThan(0);
  });

  it("refuses to sign the contractor agreement with an empty Appendix A", async () => {
    await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: FULL_PROFILE,
    });

    const res = await call(
      "post",
      "/api/onboarding/agreements/contractor/sign",
      carrierUser,
      ny,
    ).send({
      values: { arbitrationInitials: "RK", operatingLocation: "Long Beach, CA" },
      acknowledgements: [1, 2, 3, 4, 5],
      signedName: "Ravi Kumar",
      signedTitle: "Owner",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Appendix A/i);
  });

  it("refuses a partial set of acknowledgements", async () => {
    await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: FULL_PROFILE,
      equipment: EQUIPMENT,
    });

    const res = await call(
      "post",
      "/api/onboarding/agreements/contractor/sign",
      carrierUser,
      ny,
    ).send({
      values: { arbitrationInitials: "RK", operatingLocation: "Long Beach, CA" },
      acknowledgements: [1, 2], // fewer than the agreement requires
      signedName: "Ravi Kumar",
      signedTitle: "Owner",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/every acknowledgement/i);
  });

  it("refuses to sign without the separately initialled waivers", async () => {
    await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: FULL_PROFILE,
      equipment: EQUIPMENT,
    });

    const res = await call(
      "post",
      "/api/onboarding/agreements/broker/sign",
      carrierUser,
      ny,
    ).send({
      values: { arbitrationInitials: "RK" }, // class waiver missing
      acknowledgements: [1, 2, 3, 4],
      signedName: "Ravi Kumar",
      signedTitle: "Owner",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.gaps.join(" ")).toMatch(/class action/i);
  });

  it("produces a downloadable PDF once signed", async () => {
    const signRes = await signContractor();
    expect(signRes.statusCode).toBe(201);

    const signed = signRes.body.onboarding.agreements.find(
      (a) => a.key === "contractor",
    );
    expect(signed.signedAt).toBeTruthy();
    expect(signed.hasDocument).toBe(true);

    const download = await call(
      "get",
      "/api/onboarding/agreements/contractor/download",
      carrierUser,
      ny,
    );

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toMatch(/pdf/);
    // A real PDF, not an error page rendered as one.
    expect(download.body.slice(0, 4).toString()).toBe("%PDF");
  });

  it("keeps one current signature rather than a pile of them", async () => {
    await signContractor();
    const second = await signContractor();

    const contractorSignatures = second.body.onboarding.agreements.filter(
      (a) => a.key === "contractor",
    );
    expect(contractorSignatures).toHaveLength(1);
  });

  it("404s a download before anything is signed", async () => {
    const res = await call(
      "get",
      "/api/onboarding/agreements/broker/download",
      carrierUser,
      ny,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("Driver licences", () => {
  let driver;

  beforeEach(async () => {
    await call("post", "/api/drivers/bulk", carrierUser, ny).send({
      drivers: [{ name: "Meera Nair", phone: "555-0102" }],
    });
    [driver] = await withTenant({ locationId: String(ny._id) }, () => Driver.find());
  });

  it("names the drivers whose licence is still missing", async () => {
    const res = await call("get", "/api/onboarding", carrierUser, ny);

    const licenceGap = res.body.outstanding.find((o) =>
      /Licence copy missing/i.test(o.message),
    );
    expect(licenceGap.message).toMatch(/Meera Nair/);
  });

  it("stores the scan and the licence details together", async () => {
    const res = await call(
      "post",
      `/api/onboarding/drivers/${driver._id}/license`,
      carrierUser,
      ny,
    )
      .field("licenseNumber", "D1234567")
      .field("licenseState", "ca")
      .field("licenseClass", "a")
      .field("licenseExpiry", "2030-04-01")
      .attach("license", Buffer.from("fake-licence-scan"), "licence.png");

    expect(res.statusCode).toBe(200);

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findById(driver._id),
    );
    expect(saved.licenseNumber).toBe("D1234567");
    expect(saved.licenseState).toBe("CA"); // normalised
    expect(saved.licenseClass).toBe("A");
    expect(saved.licenseDocument.filePath).toBeTruthy();

    // Clean up what multer wrote so the repo's uploads dir is not littered.
    fs.promises.unlink(saved.licenseDocument.filePath).catch(() => {});
  });

  it("stops a carrier attaching a licence to another carrier's driver", async () => {
    const res = await call(
      "post",
      `/api/onboarding/drivers/${driver._id}/license`,
      rivalUser,
      ny,
    ).attach("license", Buffer.from("x"), "licence.png");

    expect(res.statusCode).toBe(404);
  });
});

describe("Insurance — the invite", () => {
  it("issues a link and records who was asked", async () => {
    const res = await call("post", "/api/insurance/invite", carrierUser, ny).send({
      agencyName: "Coastal Insurance",
      agentName: "Dana Reyes",
      agentEmail: "dana@coastal.com",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.link).toMatch(/\/insurance\/[a-f0-9]{64}$/);
    expect(res.body.onboarding.insurance.agentEmail).toBe("dana@coastal.com");
    expect(res.body.onboarding.insurance.invitedAt).toBeTruthy();
  });

  it("stores only the hash of the token, never the token", async () => {
    const res = await call("post", "/api/insurance/invite", carrierUser, ny).send({
      agentEmail: "dana@coastal.com",
    });

    const token = res.body.link.split("/").pop();

    const stored = await withTenant({ locationId: String(ny._id) }, () =>
      CarrierOnboarding.findOne({ fleetOwner: carrier._id }).select(
        "+insurance.tokenHash",
      ),
    );

    expect(stored.insurance.tokenHash).toBeTruthy();
    expect(stored.insurance.tokenHash).not.toBe(token);
    expect(stored.insurance.tokenHash).toBe(
      CarrierOnboarding.hashInsuranceToken(token),
    );
  });

  it("rejects an invite with no usable email", async () => {
    const res = await call("post", "/api/insurance/invite", carrierUser, ny).send({
      agentEmail: "not-an-email",
    });
    expect(res.statusCode).toBe(400);
  });

  it("invalidates the old link when a new one is issued", async () => {
    const first = await call("post", "/api/insurance/invite", carrierUser, ny).send({
      agentEmail: "dana@coastal.com",
    });
    const firstToken = first.body.link.split("/").pop();

    await call("post", "/api/insurance/remind", carrierUser, ny).send({});

    const stale = await request(app).get(`/api/insurance/public/${firstToken}`);
    expect(stale.statusCode).toBe(404);
  });
});

describe("Insurance — the agency's link", () => {
  let token;

  beforeEach(async () => {
    await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: FULL_PROFILE,
    });

    const invite = await call("post", "/api/insurance/invite", carrierUser, ny).send({
      agencyName: "Coastal Insurance",
      agentEmail: "dana@coastal.com",
    });

    token = invite.body.link.split("/").pop();
  });

  it("opens with no account and no session at all", async () => {
    const res = await request(app).get(`/api/insurance/public/${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.carrier.legalName).toBe("Swift Haulage LLC");
    expect(res.body.carrier.mcNumber).toBe("MC-778899");
    expect(res.body.broker.name).toMatch(/S LINE BROKERAGE/);
    expect(res.body.requirements.coverages.length).toBeGreaterThan(0);
  });

  it("shows the agency the carrier's identity and nothing operational", async () => {
    const res = await request(app).get(`/api/insurance/public/${token}`);

    // An agency needs to match the request to a policy. It has no business
    // seeing the carrier's tax ID, loads, rates or drivers.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/12-3456789/); // taxId
    expect(res.body.carrier.taxId).toBeUndefined();
    expect(res.body.drivers).toBeUndefined();
    expect(res.body.profile).toBeUndefined();
  });

  it("rejects a token that was never issued", async () => {
    const res = await request(app).get(`/api/insurance/public/${"0".repeat(64)}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("rejects an expired token and says so distinctly", async () => {
    await withTenant({ locationId: String(ny._id) }, async () => {
      const file = await CarrierOnboarding.findOne({ fleetOwner: carrier._id });
      file.insurance.tokenExpiresAt = new Date(Date.now() - 1000);
      await file.save();
    });

    const res = await request(app).get(`/api/insurance/public/${token}`);
    expect(res.statusCode).toBe(410);
    expect(res.body.code).toBe("EXPIRED_TOKEN");
  });

  it("files the certificates and shows them back to the carrier", async () => {
    const res = await request(app)
      .post(`/api/insurance/public/${token}`)
      .send({
        submittedByName: "Dana Reyes",
        policies: [
          {
            coverage: "autoLiability",
            insurerName: "Great West",
            amBestRating: "A",
            policyNumber: "AL-99",
            limit: 1000000,
            additionalInsured: true,
            expiryDate: "2030-01-01",
          },
          {
            coverage: "cargo",
            insurerName: "Great West",
            amBestRating: "A",
            limit: 100000,
            lossPayee: true,
            expiryDate: "2030-01-01",
          },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.policies).toHaveLength(2);

    const carrierView = await call("get", "/api/onboarding", carrierUser, ny);
    expect(carrierView.body.insurance.submittedAt).toBeTruthy();
    expect(carrierView.body.insurance.submittedByName).toBe("Dana Reyes");
    expect(carrierView.body.insurance.policies).toHaveLength(2);
  });

  it("records a shortfall instead of rejecting the filing", async () => {
    // An agency filing a real policy below the contractual limit must land, so
    // the office learns the limit is short. Blocking it means nobody finds out.
    const res = await request(app)
      .post(`/api/insurance/public/${token}`)
      .send({
        policies: [
          {
            coverage: "cargo",
            insurerName: "Budget Mutual",
            amBestRating: "B",
            limit: 50000,
            expiryDate: "2030-01-01",
          },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.shortfalls.join(" ")).toMatch(/limit is \$50,000/);
    expect(res.body.shortfalls.join(" ")).toMatch(/rated B/);
    expect(res.body.shortfalls.join(" ")).toMatch(/loss payee/);
  });

  it("treats a second entry for one coverage as an edit, not a duplicate", async () => {
    const res = await request(app)
      .post(`/api/insurance/public/${token}`)
      .send({
        policies: [
          { coverage: "cargo", insurerName: "First Try", limit: 100000 },
          { coverage: "cargo", insurerName: "Corrected", limit: 250000 },
        ],
      });

    expect(res.body.policies).toHaveLength(1);
    expect(res.body.policies[0].insurerName).toBe("Corrected");
  });

  it("ignores coverage types it does not recognise", async () => {
    const res = await request(app)
      .post(`/api/insurance/public/${token}`)
      .send({
        policies: [{ coverage: "spaceDebris", insurerName: "Nope", limit: 1 }],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/none of those coverage types are recognised/i);
  });

  it("cannot file against a different carrier by naming one", async () => {
    // The token resolves to exactly one carrier; there is no carrier id in the
    // request for an agency to change.
    await request(app)
      .post(`/api/insurance/public/${token}`)
      .send({
        fleetOwnerId: String(rival._id),
        policies: [{ coverage: "cargo", insurerName: "Great West", limit: 100000 }],
      });

    const rivalFile = await withTenant({ locationId: String(ny._id) }, () =>
      CarrierOnboarding.findOne({ fleetOwner: rival._id }),
    );
    expect(rivalFile).toBeNull();

    const ourFile = await withTenant({ locationId: String(ny._id) }, () =>
      CarrierOnboarding.findOne({ fleetOwner: carrier._id }),
    );
    expect(ourFile.insurance.policies).toHaveLength(1);
  });
});

describe("Requirement checks", () => {
  it("flags every way a policy can fall short at once", () => {
    const problems = shortfallsFor({
      coverage: "generalLiability",
      limit: 500000,
      aggregateLimit: 1000000,
      amBestRating: "B",
      additionalInsured: false,
    });

    expect(problems).toHaveLength(4); // limit, aggregate, rating, additional insured
  });

  it("accepts a policy that meets the agreement", () => {
    expect(
      shortfallsFor({
        coverage: "generalLiability",
        limit: 1000000,
        aggregateLimit: 2000000,
        amBestRating: "A+",
        additionalInsured: true,
        expiryDate: "2099-01-01",
      }),
    ).toEqual([]);
  });

  it("names the required cover that has not been filed at all", () => {
    expect(missingRequired([{ coverage: "cargo" }])).toEqual(
      expect.arrayContaining(["Auto / Trucking Liability", "Workers' Compensation"]),
    );
  });
});

describe("Office review", () => {
  it("will not approve an incomplete file by accident", async () => {
    const res = await call("put", "/api/onboarding/review", staff, ny).send({
      fleetOwnerId: String(carrier._id),
      decision: "APPROVED",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.outstanding.length).toBeGreaterThan(0);
    expect(res.body.hint).toMatch(/overrideOutstanding/);
  });

  it("approves anyway when the office says so deliberately", async () => {
    const res = await call("put", "/api/onboarding/review", staff, ny).send({
      fleetOwnerId: String(carrier._id),
      decision: "APPROVED",
      overrideOutstanding: true,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.onboarding.status).toBe("APPROVED");
  });

  it("requires a reason when sending a file back", async () => {
    const res = await call("put", "/api/onboarding/review", staff, ny).send({
      fleetOwnerId: String(carrier._id),
      decision: "REJECTED",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/what needs fixing/i);
  });

  it("stops a carrier reviewing their own file", async () => {
    const res = await call("put", "/api/onboarding/review", carrierUser, ny).send({
      decision: "APPROVED",
      overrideOutstanding: true,
    });

    expect(res.statusCode).toBe(403);
  });

  it("locks the file to the carrier once approved", async () => {
    await call("put", "/api/onboarding/review", staff, ny).send({
      fleetOwnerId: String(carrier._id),
      decision: "APPROVED",
      overrideOutstanding: true,
    });

    const res = await call("put", "/api/onboarding/profile", carrierUser, ny).send({
      profile: { legalName: "Something Else LLC" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("lists the queue for the office", async () => {
    await call("get", "/api/onboarding", carrierUser, ny);

    const res = await call("get", "/api/onboarding/queue", staff, ny);
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].agreementCount).toBe(2);
  });

  it("summarises the roster on each queue row", async () => {
    // The office triages this list without opening every file, so the counts a
    // row is filtered and sorted on have to come back with it.
    await signContractor();
    await call("post", "/api/drivers/bulk", carrierUser, ny).send({
      drivers: [{ name: "Ajay Singh" }, { name: "Marcus Webb" }],
    });

    const res = await call("get", "/api/onboarding/queue", staff, ny);
    const row = res.body.find((r) => r.carrier?._id === String(carrier._id));

    expect(row.driverCount).toBe(2);
    // Neither has a licence scan attached yet.
    expect(row.licencesMissing).toBe(2);
    expect(row.signedCount).toBe(1);
    expect(row.outstandingCount).toBeGreaterThan(0);
  });

  it("names who made the decision", async () => {
    await call("put", "/api/onboarding/review", staff, ny).send({
      fleetOwnerId: String(carrier._id),
      decision: "REJECTED",
      note: "The cargo certificate names the wrong insured.",
    });

    const res = await call("get", "/api/onboarding", staff, ny).query({
      fleetOwnerId: String(carrier._id),
    });

    expect(res.body.status).toBe("REJECTED");
    expect(res.body.reviewedByName).toBe("office@fms.com");
    expect(res.body.reviewNote).toMatch(/wrong insured/);
  });
});
