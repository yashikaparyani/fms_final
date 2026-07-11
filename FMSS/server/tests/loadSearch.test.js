const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const Load = require("../models/Load");
const Customer = require("../models/Customer");

const STAFF_ID = new mongoose.Types.ObjectId();
const CLIENT_ID = new mongoose.Types.ObjectId();

// Mock auth: the `role` header picks the caller, `userid` overrides the id.
jest.mock("../middleware/auth", () => {
  const mongoose = require("mongoose");
  return {
    protect: (req, res, next) => {
      req.user = {
        _id: req.headers.userid ? new mongoose.Types.ObjectId(req.headers.userid) : new mongoose.Types.ObjectId(),
        role: req.headers.role || "staff",
      };
      next();
    },
    authorizeRoles: (...roles) => (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      next();
    },
  };
});

const { getLoads } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use("/api/loads", (req, res, next) => {
  req.user = {
    _id: req.headers.userid ? new mongoose.Types.ObjectId(req.headers.userid) : STAFF_ID,
    role: req.headers.role || "staff",
  };
  next();
}, (req, res) => getLoads(req, res));

const baseLoad = (over = {}) => ({
  createdBy: "staff",
  creatorId: STAFF_ID,
  customer: new mongoose.Types.ObjectId(),
  truckType: "Flatbed",
  material: "Steel",
  amount: 1000,
  ...over,
});

const search = (q, headers = {}) => {
  const r = request(app).get(`/api/loads?q=${encodeURIComponent(q)}`);
  Object.entries(headers).forEach(([k, v]) => r.set(k, v));
  return r;
};

const ids = (res) => res.body.map((l) => l.loadId).sort();

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("GET /api/loads?q= — load search", () => {

  describe("spans the three tabs", () => {
    beforeEach(async () => {
      await Load.create([
        baseLoad({ loadId: "LD-0001", status: "PENDING_VERIFICATION", containerNo: "ABCD1234567" }),
        baseLoad({ loadId: "LD-0002", status: "VERIFIED", containerNo: "ABCD1234567" }),
        baseLoad({ loadId: "LD-0003", status: "ASSIGNED", containerNo: "ABCD1234567" }),
        baseLoad({ loadId: "LD-0004", status: "REJECTED", containerNo: "ABCD1234567" }),
        baseLoad({ loadId: "LD-0005", status: "DRAFT", containerNo: "ABCD1234567" }),
      ]);
    });

    it("returns matches from pending, verified and assigned together", async () => {
      const res = await search("ABCD1234567");
      expect(res.statusCode).toEqual(200);
      expect(ids(res)).toEqual(["LD-0001", "LD-0002", "LD-0003"]);
    });

    it("excludes statuses that have no tab (rejected, draft)", async () => {
      const res = await search("ABCD1234567");
      expect(ids(res)).not.toContain("LD-0004");
      expect(ids(res)).not.toContain("LD-0005");
    });

    it("still honours an explicit status filter alongside q", async () => {
      const res = await request(app).get("/api/loads?q=ABCD1234567&status=VERIFIED");
      expect(ids(res)).toEqual(["LD-0002"]);
    });
  });

  describe("matches across load fields", () => {
    beforeEach(async () => {
      await Load.create([
        baseLoad({ loadId: "LD-0010", status: "VERIFIED", refNo: "REF-777" }),
        baseLoad({ loadId: "LD-0011", status: "VERIFIED", bookingNo: "BK-999" }),
        baseLoad({ loadId: "LD-0012", status: "VERIFIED", sealNo: "SEAL-42" }),
        baseLoad({ loadId: "LD-0013", status: "VERIFIED", shippingLine: "Maersk" }),
        baseLoad({ loadId: "LD-0014", status: "VERIFIED", pickup: { city: "Houston", state: "TX" } }),
        baseLoad({ loadId: "LD-0015", status: "VERIFIED", drop: { city: "Chicago", state: "IL" } }),
        baseLoad({ loadId: "LD-0016", status: "VERIFIED", pickups: [{ city: "Dallas", state: "TX" }] }),
        baseLoad({ loadId: "LD-0017", status: "VERIFIED", drops: [{ company: "Acme Corp" }] }),
        baseLoad({ loadId: "LD-0018", status: "VERIFIED", amount: 4321 }),
        baseLoad({ loadId: "LD-0019", status: "VERIFIED", truckType: "Reefer" }),
      ]);
    });

    const cases = [
      ["load id",        "LD-0010", "LD-0010"],
      ["ref no",         "REF-777", "LD-0010"],
      ["booking no",     "BK-999",  "LD-0011"],
      ["seal no",        "SEAL-42", "LD-0012"],
      ["shipping line",  "maersk",  "LD-0013"],
      ["pickup city",    "houston", "LD-0014"],
      ["drop city",      "chicago", "LD-0015"],
      ["multi-stop pickup city", "dallas", "LD-0016"],
      ["multi-stop drop company", "acme", "LD-0017"],
      ["amount",         "4321",    "LD-0018"],
      ["truck type",     "reefer",  "LD-0019"],
    ];

    it.each(cases)("matches by %s", async (_label, term, expected) => {
      const res = await search(term);
      expect(res.statusCode).toEqual(200);
      expect(ids(res)).toContain(expected);
    });

    it("is case insensitive", async () => {
      expect(ids(await search("MAERSK"))).toContain("LD-0013");
      expect(ids(await search("mAeRsK"))).toContain("LD-0013");
    });

    it("matches on a partial substring", async () => {
      expect(ids(await search("aers"))).toContain("LD-0013");
    });

    it("returns an empty array when nothing matches", async () => {
      const res = await search("nothing-matches-this");
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual([]);
    });
  });

  it("matches by customer name", async () => {
    const customerUser = new mongoose.Types.ObjectId();
    await Customer.create({ user: customerUser, customerName: "Yashika Paryani" });
    await Load.create([
      baseLoad({ loadId: "LD-0020", status: "ASSIGNED", customer: customerUser }),
      baseLoad({ loadId: "LD-0021", status: "ASSIGNED" }),
    ]);

    const res = await search("yashika");
    expect(ids(res)).toEqual(["LD-0020"]);
    expect(res.body[0].customerName).toEqual("Yashika Paryani");
  });

  it("treats regex metacharacters as literal text", async () => {
    await Load.create([
      baseLoad({ loadId: "LD-0030", status: "VERIFIED", refNo: "A.C" }),
      baseLoad({ loadId: "LD-0031", status: "VERIFIED", refNo: "ABC" }),
    ]);

    // An unescaped "." would match the "B" in ABC too.
    const res = await search("A.C");
    expect(ids(res)).toEqual(["LD-0030"]);
  });

  it("ignores a blank or whitespace-only term and returns the unfiltered list", async () => {
    await Load.create([
      baseLoad({ loadId: "LD-0040", status: "REJECTED" }),
      baseLoad({ loadId: "LD-0041", status: "VERIFIED" }),
    ]);

    const res = await search("   ");
    // No search term means no tab restriction either, so REJECTED is included.
    expect(ids(res)).toEqual(["LD-0040", "LD-0041"]);
  });

  it("keeps a client scoped to their own loads while searching", async () => {
    await Load.create([
      baseLoad({ loadId: "LD-0050", status: "VERIFIED", shippingLine: "Maersk", creatorId: CLIENT_ID }),
      baseLoad({ loadId: "LD-0051", status: "VERIFIED", shippingLine: "Maersk", creatorId: STAFF_ID }),
    ]);

    const res = await search("maersk", { role: "client", userid: String(CLIENT_ID) });
    expect(ids(res)).toEqual(["LD-0050"]);
  });
});
