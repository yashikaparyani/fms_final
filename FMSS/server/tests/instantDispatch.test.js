const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");

// ─── Instant dispatch ─────────────────────────────────────────────────────────
// The two things here that are genuinely hard to get right, and that a reader
// six months from now will want proof of:
//
//   · Two carriers accepting the same load in the same instant. Only one may
//     win, and the loser has to be told which of "gone" and "not yours" applies.
//   · The commission split, and the fact that a carrier never sees the
//     customer's figure — the whole commercial premise rests on that holding.
//
// The settings layering is tested too, because "this branch inherits 20% but
// that one is on 15%" is exactly the kind of thing that silently regresses.
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "fleetOwner" }),
);

// A carrier is resolved from the account. The suite drives who that is per
// request through a header, which keeps the two-carrier race readable.
// The `mock` prefix is required: jest.mock factories are hoisted above every
// other binding, and only mock-prefixed names are allowed to be referenced.
let mockCarrierForRequest = null;
jest.mock("../utils/carrierAccount", () => ({
  findCarrierFor: jest.fn(async () => mockCarrierForRequest),
}));

// Nothing here should send a real email or reach Expo.
jest.mock("../services/emailService", () => ({
  sendInstantDispatchOffer: jest.fn(async () => ({ sent: true })),
}));
jest.mock("../services/pushService", () => ({
  sendPush: jest.fn(async () => ({ sent: false, reason: "no device registered" })),
}));

const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const TrackingEvent = require("../models/TrackingEvent");
const Address = require("../models/common/Address");
const { DispatchSettings } = require("../models/DispatchSettings");
const { settingsFor, saveSettings } = require("../services/dispatchSettingsService");
const { splitAmount } = require("../services/commissionService");
const { maskLoadForViewer } = require("../utils/loadVisibility");
const { findNearbyCarriers } = require("../services/nearbyDriversService");
const { requestInstantDispatch } = require("../services/instantDispatchService");

const instantDispatchRoutes = require("../routes/instantDispatchRoutes");

const app = express();
app.use(express.json());
app.use("/api/instant-dispatch", instantDispatchRoutes);

beforeAll(async () => await connect());
afterEach(async () => {
  mockCarrierForRequest = null;
  await clearDatabase();
});
afterAll(async () => await closeDatabase());

// Los Angeles, and a point ~20 miles away in Long Beach.
const LA = { lat: 34.0522, lng: -118.2437 };
const LONG_BEACH = { latitude: 33.7701, longitude: -118.1937 };
const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };

/** A carrier with one driver, whose last position is wherever you put it. */
const makeCarrier = async ({ name, position, minutesAgo = 5 }) =>
  seed(async () => {
    const carrier = await FleetOwner.create({
      carrierName: name,
      userId: new mongoose.Types.ObjectId(),
      email: `${name.toLowerCase().replace(/\s/g, "")}@example.com`,
    });

    const driver = await Driver.create({
      name: `${name} Driver`,
      fleetOwner: carrier._id,
      driverCode: `${name.slice(0, 3).toUpperCase()}-1`,
      userId: new mongoose.Types.ObjectId(),
    });

    if (position) {
      await TrackingEvent.create({
        load: new mongoose.Types.ObjectId(),
        loadId: "SEED-1",
        user: driver.userId,
        driver: driver._id,
        driverName: driver.name,
        coordinates: position,
        recordedAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      });
    }

    return { carrier, driver };
  });

/** A load whose pickup is pinned in LA. */
const makeLoad = async (amount = 1000) =>
  seed(async () => {
    const address = await Address.create({
      street: "1 Dock Rd",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      lat: LA.lat,
      lng: LA.lng,
    });

    return Load.create({
      customer: new mongoose.Types.ObjectId(),
      customerName: "Acme",
      amount,
      truckType: "Container",
      material: "Dry",
      creatorId: new mongoose.Types.ObjectId(),
      createdBy: "client",
      pickup: { addressId: address._id, city: "Los Angeles", state: "CA" },
      drop: { city: "Phoenix", state: "AZ" },
    });
  });

describe("commission split", () => {
  it("splits the customer amount and always adds back up", () => {
    expect(splitAmount(1000, 20)).toMatchObject({
      customerAmount: 1000,
      commissionAmount: 200,
      carrierAmount: 800,
    });

    // The awkward one: a third of a cent has to land somewhere, and the two
    // halves still have to reconstitute the whole.
    const odd = splitAmount(1000.01, 33.33);
    expect(odd.commissionAmount + odd.carrierAmount).toBeCloseTo(1000.01, 2);
  });

  it("refuses a rate that would produce a negative payout", () => {
    expect(() => splitAmount(1000, 120)).toThrow(/percentage/i);
  });
});

describe("what a carrier is allowed to see", () => {
  it("shows the payout and removes every trace of the customer's price", () => {
    const load = {
      dispatchMode: "INSTANT",
      amount: 1000,
      accounting: { receivables: { lines: [{ amount: 1000 }] } },
      vendorRate: 950,
      commission: {
        customerAmount: 1000,
        commissionPercent: 20,
        commissionAmount: 200,
        carrierAmount: 800,
      },
    };

    const seen = maskLoadForViewer(load, "fleetOwner");

    expect(seen.amount).toBe(800);
    expect(seen.commission).toEqual({ carrierAmount: 800 });
    expect(seen.accounting).toBeUndefined();
    expect(seen.vendorRate).toBeUndefined();
    // The rate is withheld too: payout plus rate is the gross by arithmetic.
    expect(seen.commission.commissionPercent).toBeUndefined();
  });

  it("leaves the office's view alone, and leaves bid loads alone entirely", () => {
    const instant = {
      dispatchMode: "INSTANT",
      amount: 1000,
      commission: { customerAmount: 1000, carrierAmount: 800 },
    };
    expect(maskLoadForViewer(instant, "admin").amount).toBe(1000);

    const bid = { dispatchMode: "BID", amount: 1000, vendorRate: 900 };
    expect(maskLoadForViewer(bid, "fleetOwner")).toEqual(bid);
  });
});

describe("settings layering", () => {
  it("falls back to the house default, then to the built-in default", async () => {
    const branch = new mongoose.Types.ObjectId();

    // Nothing set anywhere.
    expect((await settingsFor(branch)).commissionPercent).toBe(20);

    // House default moves everybody who has not set their own.
    await saveSettings(null, { commissionPercent: 25 }, new mongoose.Types.ObjectId());
    expect((await settingsFor(branch)).commissionPercent).toBe(25);

    // A branch overrides it.
    await saveSettings(branch, { commissionPercent: 15 }, new mongoose.Types.ObjectId());
    expect((await settingsFor(branch)).commissionPercent).toBe(15);
    // …without touching anyone else.
    expect((await settingsFor(new mongoose.Types.ObjectId())).commissionPercent).toBe(25);

    // Clearing it goes back to inheriting.
    await saveSettings(branch, { commissionPercent: "" }, new mongoose.Types.ObjectId());
    expect((await settingsFor(branch)).commissionPercent).toBe(25);
  });

  it("treats a genuine 0% as set, not as unset", async () => {
    const branch = new mongoose.Types.ObjectId();
    await saveSettings(null, { commissionPercent: 20 }, new mongoose.Types.ObjectId());
    await saveSettings(branch, { commissionPercent: 0 }, new mongoose.Types.ObjectId());

    expect((await settingsFor(branch)).commissionPercent).toBe(0);
  });

  it("refuses a commission above 100", async () => {
    await expect(
      saveSettings(null, { commissionPercent: 250 }, new mongoose.Types.ObjectId()),
    ).rejects.toThrow();
  });
});

describe("finding trucks near a pickup", () => {
  it("includes a nearby driver and excludes a far one", async () => {
    await makeCarrier({ name: "Near Co", position: LONG_BEACH });
    await makeCarrier({ name: "Far Co", position: NEW_YORK });

    const found = await seed(() =>
      findNearbyCarriers({
        latitude: LA.lat,
        longitude: LA.lng,
        radiusMiles: 100,
        maxAgeHours: 24,
      }),
    );

    expect(found).toHaveLength(1);
    expect(found[0].fleetOwner.carrierName).toBe("Near Co");
    expect(found[0].distanceMiles).toBeGreaterThan(15);
    expect(found[0].distanceMiles).toBeLessThan(25);
  });

  it("ignores a driver whose position is too old to mean anything", async () => {
    await makeCarrier({ name: "Stale Co", position: LONG_BEACH, minutesAgo: 60 * 48 });

    const found = await seed(() =>
      findNearbyCarriers({
        latitude: LA.lat,
        longitude: LA.lng,
        radiusMiles: 100,
        maxAgeHours: 24,
      }),
    );

    expect(found).toHaveLength(0);
  });
});

describe("offering a load", () => {
  it("stamps the split and offers it to the carriers in range", async () => {
    const { carrier } = await makeCarrier({ name: "Near Co", position: LONG_BEACH });
    const load = await makeLoad(1000);

    const result = await seed(() =>
      requestInstantDispatch(load, {
        requestedBy: new mongoose.Types.ObjectId(),
        branchId: TEST_LOCATION_ID,
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.offered).toBe(1);

    const saved = await seed(() => Load.findById(load._id).lean());
    expect(saved.dispatchMode).toBe("INSTANT");
    expect(saved.commission.carrierAmount).toBe(800);
    expect(saved.commission.commissionAmount).toBe(200);
    expect(saved.instantDispatch.status).toBe("PENDING");
    expect(String(saved.instantDispatch.offers[0].fleetOwnerId)).toBe(
      String(carrier._id),
    );
  });

  it("refuses, without touching the load, when the pickup has no map pin", async () => {
    await makeCarrier({ name: "Near Co", position: LONG_BEACH });

    const load = await seed(() =>
      Load.create({
        customer: new mongoose.Types.ObjectId(),
        customerName: "Acme",
        amount: 1000,
        truckType: "Container",
        material: "Dry",
        creatorId: new mongoose.Types.ObjectId(),
        createdBy: "client",
        pickup: { city: "Los Angeles", state: "CA" },
      }),
    );

    const result = await seed(() =>
      requestInstantDispatch(load, { branchId: TEST_LOCATION_ID }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/map pin/i);

    const saved = await seed(() => Load.findById(load._id).lean());
    expect(saved.instantDispatch?.status).toBeUndefined();
  });

  it("refuses when nobody is in range", async () => {
    await makeCarrier({ name: "Far Co", position: NEW_YORK });
    const load = await makeLoad();

    const result = await seed(() =>
      requestInstantDispatch(load, { branchId: TEST_LOCATION_ID }),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/within/i);
  });
});

describe("accepting — only one carrier can win", () => {
  const offerTo = async (carriers) => {
    const load = await makeLoad(1000);
    await seed(() =>
      requestInstantDispatch(load, { branchId: TEST_LOCATION_ID }),
    );
    return seed(() => Load.findById(load._id));
  };

  it("gives the load to the first accepter and tells the second it has gone", async () => {
    const a = await makeCarrier({ name: "Alpha Co", position: LONG_BEACH });
    const b = await makeCarrier({ name: "Bravo Co", position: LONG_BEACH });

    const load = await offerTo();

    mockCarrierForRequest = a.carrier;
    const first = await request(app)
      .post(`/api/instant-dispatch/${load.loadId}/accept`)
      .set("role", "fleetOwner");

    expect(first.statusCode).toBe(200);
    expect(first.body.payout).toBe(800);

    mockCarrierForRequest = b.carrier;
    const second = await request(app)
      .post(`/api/instant-dispatch/${load.loadId}/accept`)
      .set("role", "fleetOwner");

    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("ALREADY_TAKEN");

    const saved = await seed(() => Load.findById(load._id).lean());
    expect(String(saved.assignedFleetOwner.fleetOwnerId)).toBe(String(a.carrier._id));
    expect(saved.status).toBe("ASSIGNED");
    expect(saved.transportStatus).toBe("ASSIGNED");
  });

  it("refuses a carrier who was never offered the load", async () => {
    await makeCarrier({ name: "Alpha Co", position: LONG_BEACH });
    const outsider = await makeCarrier({ name: "Outsider Co", position: NEW_YORK });

    const load = await offerTo();

    mockCarrierForRequest = outsider.carrier;
    const res = await request(app)
      .post(`/api/instant-dispatch/${load.loadId}/accept`)
      .set("role", "fleetOwner");

    expect(res.statusCode).toBe(403);
  });

  it("refuses once the window has closed", async () => {
    const a = await makeCarrier({ name: "Alpha Co", position: LONG_BEACH });
    const load = await offerTo();

    await seed(() =>
      Load.updateOne(
        { _id: load._id },
        { $set: { "instantDispatch.expiresAt": new Date(Date.now() - 1000) } },
      ),
    );

    mockCarrierForRequest = a.carrier;
    const res = await request(app)
      .post(`/api/instant-dispatch/${load.loadId}/accept`)
      .set("role", "fleetOwner");

    expect(res.statusCode).toBe(410);
    expect(res.body.code).toBe("OFFER_EXPIRED");
  });

  it("falls back to bidding once every carrier has declined", async () => {
    const a = await makeCarrier({ name: "Alpha Co", position: LONG_BEACH });
    const load = await offerTo();

    mockCarrierForRequest = a.carrier;
    const res = await request(app)
      .post(`/api/instant-dispatch/${load.loadId}/decline`)
      .set("role", "fleetOwner")
      .send({ reason: "No truck free" });

    expect(res.statusCode).toBe(200);

    const saved = await seed(() => Load.findById(load._id).lean());
    expect(saved.dispatchMode).toBe("BID");
    expect(saved.status).toBe("PENDING_VERIFICATION");
    expect(saved.instantDispatch.status).toBe("EXPIRED");
    // The split goes with it — the bid flow prices loads its own way.
    expect(saved.commission?.carrierAmount).toBeUndefined();
  });
});
