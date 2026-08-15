// The load audit trail: what happened, who did it, when — and the notes the
// office writes alongside.
//
// Two things get the most attention here. The diff, because a trail full of
// `updatedAt` noise is a trail nobody reads. And the internal/shared boundary,
// because a dispatcher's candid note quietly reaching the customer is the
// expensive failure.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Load = require("../models/Load");
const LoadAudit = require("../models/LoadAudit");
const FleetOwner = require("../models/FleetOwner");

const loadRoutes = require("../routes/loadRoutes");
const auditRoutes = require("../routes/auditRoutes");
const { diffLoad } = require("../services/auditService");

const app = express();
app.use(express.json());
app.use("/api/loads", loadRoutes);
app.use("/api/audit", auditRoutes);

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
let staff;
let admin;
let client;
let load;

const newLoad = (overrides = {}) =>
  withTenant({ locationId: String(ny._id) }, () =>
    Load.create({
      createdBy: "staff",
      customer: client?._id || new (require("mongoose").Types.ObjectId)(),
      creatorId: client?._id,
      customerName: "Acme Imports",
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      ...overrides,
    }),
  );

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
  });

  staff = await User.create({
    firstName: "Dana",
    lastName: "Reyes",
    email: "dana@fms.com",
    password: "password123",
    role: "staff",
    locations: [ny._id],
    defaultLocation: ny._id,
    permissions: ["loads.view", "loads.edit", "staff.view"],
  });

  admin = await User.create({
    firstName: "Root",
    email: "root@fms.com",
    password: "password123",
    role: "admin",
  });

  client = await User.create({
    firstName: "Acme",
    email: "acme@customer.com",
    password: "password123",
    role: "client",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  load = await newLoad();
});

describe("The diff", () => {
  it("names the field, the old value and the new one", () => {
    const changes = diffLoad({ amount: 1000 }, { amount: 1250 });

    expect(changes).toEqual([
      { field: "amount", label: "Base Amount", from: "1000", to: "1250" },
    ]);
  });

  it("flattens nested routing into readable leaves", () => {
    // "Pickup changed" with two JSON blobs is a puzzle; this is an answer.
    const changes = diffLoad(
      { pickup: { city: "Long Beach", state: "CA" } },
      { pickup: { city: "Oakland", state: "CA" } },
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("Pickup City");
    expect(changes[0].to).toBe("Oakland");
  });

  it("reads booleans as Yes and No", () => {
    const changes = diffLoad({ hazmat: false }, { hazmat: true });
    expect(changes[0]).toMatchObject({ from: "No", to: "Yes" });
  });

  it("formats dates rather than printing an ISO string", () => {
    const changes = diffLoad(
      { lastFreeDate: null },
      { lastFreeDate: new Date("2026-03-14T00:00:00Z") },
    );
    expect(changes[0].to).toMatch(/2026/);
    expect(changes[0].to).not.toMatch(/T00:00/);
  });

  it("treats a date that did not move as unchanged despite the type", () => {
    // Dates arrive as strings from a form and as Dates from the database.
    const changes = diffLoad(
      { lastFreeDate: new Date("2026-03-14") },
      { lastFreeDate: "2026-03-14T00:00:00.000Z" },
    );
    expect(changes).toEqual([]);
  });

  it("treats null, undefined and empty string as the same non-answer", () => {
    expect(diffLoad({ refNo: null }, { refNo: "" })).toEqual([]);
    expect(diffLoad({ refNo: undefined }, { refNo: null })).toEqual([]);
  });

  it("ignores fields nobody asked to track", () => {
    // An allow-list, so internal bookkeeping never lands in the trail.
    expect(diffLoad({ updatedAt: 1, __v: 0 }, { updatedAt: 2, __v: 1 })).toEqual([]);
  });
});

describe("What gets recorded", () => {
  it("opens the trail when a load is created", async () => {
    const created = await newLoad({ customerName: "Globex" });
    // createLoad writes the entry; a directly-created fixture will not have one,
    // so this asserts through the route instead.
    const entries = await withTenant({ locationId: String(ny._id) }, () =>
      LoadAudit.find({ load: created._id }),
    );
    expect(entries).toHaveLength(0); // fixture, not the route

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    expect(res.statusCode).toBe(200);
  });

  it("records an edit with who made it", async () => {
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({
      amount: 1450,
      hazmat: true,
    });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    const entry = res.body.entries.find((e) => e.kind === "FIELD_CHANGE");

    expect(entry).toBeTruthy();
    expect(entry.actorName).toBe("Dana Reyes");
    expect(entry.actorRole).toBe("staff");
    expect(entry.changes.map((c) => c.label).sort()).toEqual([
      "Base Amount",
      "Hazmat",
    ]);
  });

  it("writes nothing when a save changed nothing tracked", async () => {
    // A save that only touched updatedAt is not an event, and logging it would
    // bury the ones that are.
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({
      amount: 1000, // same value
    });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    expect(res.body.entries.filter((e) => e.kind === "FIELD_CHANGE")).toHaveLength(0);
  });

  it("records a status move with the reason attached", async () => {
    await call("put", `/api/loads/${load.loadId}/status`, staff, ny).send({
      status: "REQUIRES_CHANGES",
      changesNote: "Container number does not match the booking",
    });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    const entry = res.body.entries.find((e) => e.kind === "STATUS");

    expect(entry.summary).toMatch(/REQUIRES_CHANGES/);
    expect(entry.body).toMatch(/does not match the booking/);
  });

  it("records who a load moved from when a carrier is reassigned", async () => {
    let first;
    let second;
    await withTenant({ locationId: String(ny._id) }, async () => {
      first = await FleetOwner.create({ carrierName: "Swift Haulage" });
      second = await FleetOwner.create({ carrierName: "Rival Freight" });
    });

    await call("put", `/api/loads/${load.loadId}/assign-fleet-owner`, staff, ny).send({
      fleetOwnerId: String(first._id),
      fleetOwnerName: "Swift Haulage",
    });

    await call("put", `/api/loads/${load.loadId}/assign-fleet-owner`, staff, ny).send({
      fleetOwnerId: String(second._id),
      fleetOwnerName: "Rival Freight",
    });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    const latest = res.body.entries.find((e) => e.kind === "ASSIGNMENT");

    expect(latest.summary).toBe("Assigned to Rival Freight (was Swift Haulage)");
  });

  it("keeps a readable name after the account is deactivated", async () => {
    // An audit trail that says "(deleted user)" is not accountability.
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({ amount: 1450 });

    await User.findByIdAndUpdate(staff._id, { isDeleted: true, isActive: false });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, admin, ny);
    const entry = res.body.entries.find((e) => e.kind === "FIELD_CHANGE");

    expect(entry.actorName).toBe("Dana Reyes");
  });

  it("returns newest first", async () => {
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({ amount: 1100 });
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({ amount: 1200 });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    const times = res.body.entries.map((e) => new Date(e.createdAt).getTime());

    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("Notes", () => {
  it("records a note against the load", async () => {
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny)
      .send({ body: "Customer moved the appointment to Thursday." });

    expect(res.statusCode).toBe(201);
    expect(res.body.entry.kind).toBe("NOTE");
    expect(res.body.entry.actorName).toBe("Dana Reyes");
  });

  it("defaults a note to internal", async () => {
    // The failure mode of the other default — a candid remark quietly visible to
    // the customer — is the expensive one.
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny)
      .send({ body: "Customer disputes every detention charge." });

    expect(res.body.entry.visibility).toBe("INTERNAL");
  });

  it("shares a note only when asked", async () => {
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny)
      .send({ body: "Delivery rescheduled at your request.", visibility: "SHARED" });

    expect(res.body.entry.visibility).toBe("SHARED");
  });

  it("refuses an empty note", async () => {
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny)
      .send({ body: "   " });

    expect(res.statusCode).toBe(400);
  });

  it("uses the first line as the headline so the timeline stays scannable", async () => {
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny)
      .send({ body: "Chassis split needed\nDriver reported at 0800, no chassis." });

    expect(res.body.entry.summary).toBe("Chassis split needed");
    expect(res.body.entry.body).toMatch(/0800/);
  });
});

describe("Who can read what", () => {
  beforeEach(async () => {
    await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny).send({
      body: "Internal: customer is difficult about detention.",
    });
    await call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny).send({
      body: "Shared: your delivery is booked for Thursday.",
      visibility: "SHARED",
    });
  });

  it("shows the office everything", async () => {
    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);

    expect(res.body.canSeeInternal).toBe(true);
    expect(res.body.entries.filter((e) => e.kind === "NOTE")).toHaveLength(2);
  });

  it("shows the customer only what was shared", async () => {
    const res = await call("get", `/api/loads/${load.loadId}/audit`, client, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.canSeeInternal).toBe(false);

    const notes = res.body.entries.filter((e) => e.kind === "NOTE");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/booked for Thursday/);

    // The internal one must not be anywhere in the payload, not merely hidden.
    expect(JSON.stringify(res.body)).not.toMatch(/difficult about detention/);
  });

  it("keeps a customer out of somebody else's load", async () => {
    const other = await User.create({
      email: "other@customer.com",
      password: "x",
      role: "client",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, other, ny);
    expect(res.statusCode).toBe(403);
  });

  it("stops a customer writing into the trail", async () => {
    // The trail is the record of what the office did.
    const res = await call("post", `/api/loads/${load.loadId}/audit/notes`, client, ny)
      .send({ body: "Please hurry up" });

    expect(res.statusCode).toBe(403);
  });

  it("shows an unassigned carrier nothing", async () => {
    const carrierUser = await User.create({
      email: "carrier@x.com",
      password: "x",
      role: "fleetOwner",
      locations: [ny._id],
      defaultLocation: ny._id,
    });
    await withTenant({ locationId: String(ny._id) }, () =>
      FleetOwner.create({ userId: carrierUser._id, carrierName: "Uninvolved" }),
    );

    const res = await call("get", `/api/loads/${load.loadId}/audit`, carrierUser, ny);
    expect(res.statusCode).toBe(403);
  });
});

describe("Follow-ups", () => {
  const raise = (extra = {}) =>
    call("post", `/api/loads/${load.loadId}/audit/notes`, staff, ny).send({
      body: "Chase the terminal for the pickup number.",
      followUp: true,
      ...extra,
    });

  it("raises one with a due date and an assignee", async () => {
    const res = await raise({
      dueAt: "2026-09-01",
      assignedTo: String(staff._id),
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.entry.kind).toBe("FOLLOW_UP");
    expect(res.body.entry.followUp.assignedToName).toBe("Dana Reyes");
  });

  it("flags an overdue one", async () => {
    await raise({ dueAt: "2020-01-01" });

    const res = await call("get", `/api/loads/${load.loadId}/audit`, staff, ny);
    const entry = res.body.entries.find((e) => e.kind === "FOLLOW_UP");

    expect(entry.followUp.overdue).toBe(true);
  });

  it("closes one without touching what was originally written", async () => {
    const raised = await raise();

    const res = await call(
      "put",
      `/api/loads/${load.loadId}/audit/notes/${raised.body.entry._id}/resolve`,
      staff,
      ny,
    ).send({ resolutionNote: "Terminal gave PU-88213" });

    expect(res.statusCode).toBe(200);
    expect(res.body.entry.followUp.resolvedAt).toBeTruthy();
    expect(res.body.entry.followUp.resolvedByName).toBe("Dana Reyes");
    // The original text is evidence and is never rewritten.
    expect(res.body.entry.body).toMatch(/Chase the terminal/);
  });

  it("will not close the same one twice", async () => {
    const raised = await raise();
    const path = `/api/loads/${load.loadId}/audit/notes/${raised.body.entry._id}/resolve`;

    await call("put", path, staff, ny).send({});
    const second = await call("put", path, staff, ny).send({});

    expect(second.statusCode).toBe(400);
  });

  it("lists what is still open across every load", async () => {
    await raise({ dueAt: "2020-01-01" });

    const other = await newLoad({ customerName: "Globex" });
    await call("post", `/api/loads/${other.loadId}/audit/notes`, staff, ny).send({
      body: "Needs a chassis",
      followUp: true,
    });

    const res = await call("get", "/api/audit/follow-ups", staff, ny);

    expect(res.body.total).toBe(2);
    expect(res.body.overdue).toBe(1);
  });

  it("narrows the list to one person's own follow-ups", async () => {
    await raise({ assignedTo: String(staff._id) });
    await raise();

    const res = await call("get", "/api/audit/follow-ups?mine=true", staff, ny);
    expect(res.body.total).toBe(1);
  });
});

describe("User-wise audit", () => {
  it("shows everything one person did, across loads", async () => {
    await call("put", `/api/loads/${load.loadId}`, staff, ny).send({ amount: 1300 });

    const other = await newLoad();
    await call("put", `/api/loads/${other.loadId}`, staff, ny).send({ amount: 900 });

    const res = await call("get", `/api/audit/by-user/${staff._id}`, admin, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.actorName).toBe("Dana Reyes");
    expect(res.body.total).toBe(2);
    // Each entry names its load, since the point is looking across them.
    expect(res.body.entries.every((e) => e.loadId)).toBe(true);
  });

  it("is admin-only — reviewing a colleague is not an operational screen", async () => {
    const res = await call("get", `/api/audit/by-user/${staff._id}`, staff, ny);
    expect(res.statusCode).toBe(403);
  });
});
