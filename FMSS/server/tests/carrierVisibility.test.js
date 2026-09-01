// What a carrier is still shown once a load stops being their business.
//
// "Finished" is not one question. A delivered load is finished and the carrier
// still needs it — the POD is on it and that is what they invoice against. An
// invoiced, warehoused or terminated load has nothing left on it for them, so
// it leaves their board rather than sitting there being scrolled past.

const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed } = require("./helpers/tenantTestContext");
const Load = require("../models/Load");
const {
  carrierLoadFilter,
  carrierVisibleLoadFilter,
  CARRIER_HIDDEN_TRANSPORT_STATUSES,
} = require("../utils/carrierAccount");

const CARRIER = new mongoose.Types.ObjectId();
const STAFF = new mongoose.Types.ObjectId();

const load = (loadId, transportStatus, over = {}) => ({
  loadId,
  createdBy: "staff",
  creatorId: STAFF,
  customer: new mongoose.Types.ObjectId(),
  truckType: "Container",
  material: "Boxes",
  amount: 1000,
  status: "ASSIGNED",
  transportStatus,
  assignedFleetOwner: { fleetOwnerId: CARRIER, fleetOwnerName: "Swift" },
  ...over,
});

const visible = () =>
  seed(() => Load.find(carrierVisibleLoadFilter(CARRIER)).lean()).then((rows) =>
    rows.map((r) => r.loadId).sort(),
  );

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  await seed(() =>
    Load.create([
      load("RUNNING", "IN_TRANSIT"),
      load("LANDED", "DELIVERED"),
      load("YARD", "EMPTY_IN_YARD"),
      load("BILLED", "INVOICED"),
      load("WAREHOUSE", "DROP_IN_WAREHOUSE"),
      load("OFF", "TERMINATED"),
    ]),
  );
});

describe("A carrier's board", () => {
  it("drops the loads that have stopped being theirs", async () => {
    expect(await visible()).toEqual(["LANDED", "RUNNING", "YARD"]);
  });

  it.each(CARRIER_HIDDEN_TRANSPORT_STATUSES)("hides %s", async (status) => {
    // Asserted against the whole visible set rather than by adding
    // `transportStatus` to the filter: that key already holds the $nin, and
    // spreading a second one over it silently removes the very rule under test.
    const rows = await seed(() => Load.find(carrierVisibleLoadFilter(CARRIER)).lean());
    expect(rows.map((r) => r.transportStatus)).not.toContain(status);
  });

  it("keeps a delivered load, which is what the POD hangs off", async () => {
    expect(await visible()).toContain("LANDED");
  });

  it("still owns them — hidden is not unassigned", async () => {
    // The narrower filter is for lists. Ownership does not lapse, or the office
    // would lose who ran the load the moment it was billed.
    const owned = await seed(() => Load.find(carrierLoadFilter(CARRIER)).lean());
    expect(owned).toHaveLength(6);
  });

  it("shows a load run as one leg of a split", async () => {
    await seed(() =>
      Load.create(
        load("LEG", "IN_TRANSIT", {
          assignedFleetOwner: undefined,
          assignments: [{ fleetOwnerId: CARRIER, fleetOwnerName: "Swift" }],
        }),
      ),
    );
    expect(await visible()).toContain("LEG");
  });
});
