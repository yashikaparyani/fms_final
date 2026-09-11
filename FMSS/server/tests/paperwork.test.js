// The Paperwork Pending workflow.
//
// A delivered load is not a billable load. Between the two sits a review: the
// driver uploads what the delivery produced, the office reads it, and either
// signs it off — which is what makes the load invoiceable — or sends it back
// with a reason. What is being protected here is the invoice: a load that
// reaches Invoiced without anybody reading its documents is a load somebody
// bills against a Bill of Lading that turns out to be the wrong one.
//
// The other half is that the review has to be visible. A paperwork-pending load
// belongs in the Over tab's own sub-tab and nowhere else — it fell through the
// gap between All Transit and Over once before (see config/transportStatuses.js)
// and to the office that looks exactly like the load being deleted.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");
const Notification = require("../models/Notification");
const User = require("../models/User");

const STAFF_ID = new mongoose.Types.ObjectId();
const CARRIER_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

// Nothing in this suite is about whether a push actually reaches a handset, and
// a real one would try to call Expo.
jest.mock("../services/pushService", () => ({
  sendPush: jest.fn().mockResolvedValue({ sent: 0, reason: "mocked" }),
  registerPushToken: jest.fn(),
  forgetPushToken: jest.fn(),
  isExpoToken: () => true,
}));

// Same for the WhatsApp side — approving a load fires the completed alert.
jest.mock("../services/whatsappEvents", () => ({
  onPickupConfirmed: jest.fn(),
  onDelivered: jest.fn(),
  onLoadCompleted: jest.fn(),
  onStatusChanged: jest.fn(),
}));

const {
  getLoads,
  getLoadById,
  uploadDocument,
  deleteDocument,
  reviewPaperwork,
  remindPaperwork,
  updateTransportStatus,
} = require("../controllers/loadController");
const { remindDeliveredLoads } = require("../services/paperworkService");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = {
    _id: req.headers.role === "driver" ? CARRIER_ID : STAFF_ID,
    role: req.headers.role || "staff",
  };
  req.user.id = req.user._id.toString();
  next();
});

const scoped = (handler) => (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => handler(req, res));

// multer is not in the chain here, so the file it would have parsed is faked.
// The suite is about what the handler does with an upload, not about parsing one.
app.post(
  "/api/loads/:loadId/documents",
  (req, res, next) => {
    req.file = {
      originalname: req.body.fileName || "bol.pdf",
      path: `uploads/${req.body.fileName || "bol.pdf"}`,
    };
    next();
  },
  scoped(uploadDocument),
);
app.delete("/api/loads/:loadId/documents/:docId", scoped(deleteDocument));
app.post("/api/loads/:loadId/paperwork/review", scoped(reviewPaperwork));
app.post("/api/loads/:loadId/paperwork/remind", scoped(remindPaperwork));
app.put("/api/loads/:loadId/transport-status", scoped(updateTransportStatus));
app.get("/api/loads/:loadId", scoped(getLoadById));
app.get("/api/loads", scoped(getLoads));

const POD = { documentType: "Proof of Delivery", fileName: "pod.pdf", filePath: "uploads/pod.pdf" };
const BOL = { documentType: "Bill Of Lading", fileName: "bol.pdf", filePath: "uploads/bol.pdf" };

const makeLoad = (over = {}) =>
  seed(() =>
    Load.create({
      loadId: over.loadId || "LD 0001",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "ASSIGNED",
      transportStatus: "PAPERWORK_PENDING",
      // Every transport status is a statement about a carrier, and the handler
      // refuses to record one without.
      assignedFleetOwner: {
        fleetOwnerId: new mongoose.Types.ObjectId(),
        fleetOwnerName: "Swift Haulage",
      },
      paperwork: { state: "AWAITING_DOCUMENTS", startedAt: new Date() },
      documents: [POD],
      ...over,
    }),
  );

const reload = (loadId = "LD 0001") => seed(() => Load.findOne({ loadId }));

/**
 * Poll until a fire-and-forget write lands.
 *
 * The upload handler answers the driver before its notification to the office
 * has finished — deliberately, so a slow notification cannot make an upload
 * look failed. That leaves nothing to await here.
 */
const eventually = async (read, attempts = 20) => {
  for (let i = 0; i < attempts; i += 1) {
    const rows = await read();
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return read();
};

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

// ─────────────────────────────────────────────────────────────────────────────

describe("Where a paperwork-pending load is listed", () => {
  beforeEach(async () => {
    await makeLoad({ loadId: "PAPER-1" });
    await makeLoad({
      loadId: "MOVING-1",
      transportStatus: "IN_TRANSIT",
      paperwork: undefined,
      documents: [],
    });
    await makeLoad({
      loadId: "OVER-1",
      transportStatus: "DELIVERED",
      paperwork: undefined,
    });
  });

  const ids = (res) => res.body.map((l) => l.loadId).sort();

  it("puts it in the Over tab, alongside the ended journeys", async () => {
    const res = await request(app).get("/api/loads?completed=true");
    expect(ids(res)).toEqual(["OVER-1", "PAPER-1"]);
  });

  it("keeps it out of All Transit — dispatch has nothing left to arrange", async () => {
    const res = await request(app).get("/api/loads?completed=false");
    expect(ids(res)).toEqual(["MOVING-1"]);
  });

  it("still answers a direct filter on the status", async () => {
    const res = await request(app).get("/api/loads?transportStatus=PAPERWORK_PENDING");
    expect(ids(res)).toEqual(["PAPER-1"]);
  });
});

describe("Approving the paperwork", () => {
  it("refuses while a required document is missing, and says which", async () => {
    await makeLoad(); // POD only — no Bill of Lading

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOCUMENTS_MISSING");
    expect(res.body.missingDocuments).toEqual(["Bill Of Lading"]);

    const load = await reload();
    expect(load.transportStatus).toBe("PAPERWORK_PENDING");
    expect(load.paperwork.state).toBe("AWAITING_DOCUMENTS");
  });

  // The office decides whether a load can be billed. What the refusal above
  // buys is that somebody has to have been shown the list and said yes to it —
  // not that the load is stuck until a document that may not exist turns up.
  it("lets the office approve without it once they have said so", async () => {
    await makeLoad();

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE", override: true, note: "Customer kept the BOL." });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/without Bill Of Lading/);

    const load = await reload();
    expect(load.transportStatus).toBe("INVOICED");
    expect(load.paperwork.state).toBe("APPROVED");
    // What was waived is on the load, not only in somebody's memory.
    expect(load.paperwork.approvedWithMissing).toEqual(["Bill Of Lading"]);
    expect(load.paperwork.approvalNote).toMatch(/Approved without: Bill Of Lading/);
    expect(load.transportStatusHistory.at(-1).note).toMatch(/Bill Of Lading/);
  });

  it("moves the load to Invoiceable and locks it once everything is there", async () => {
    await makeLoad({ documents: [POD, BOL], paperwork: { state: "IN_REVIEW" } });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE", note: "Checked against the booking." });

    expect(res.status).toBe(200);

    const load = await reload();
    expect(load.paperwork.state).toBe("APPROVED");
    expect(load.paperwork.approvedAt).toBeTruthy();
    expect(load.paperwork.approvalNote).toBe("Checked against the booking.");
    // Invoiceable is INVOICED on the model — see ACCOUNTING_TRANSPORT_STATUSES.
    expect(load.transportStatus).toBe("INVOICED");
    expect(load.transportStatusHistory.at(-1).status).toBe("INVOICED");
  });

  it("sends the approved load to Accounting rather than back to Over", async () => {
    await makeLoad({ documents: [POD, BOL] });
    await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE" });

    const accounting = await request(app).get("/api/loads?accounting=true");
    expect(accounting.body.map((l) => l.loadId)).toEqual(["LD 0001"]);

    const over = await request(app).get("/api/loads?completed=true");
    expect(over.body).toHaveLength(0);
  });

  // A delivered load carries the same documents it would carry a minute later
  // in the queue, so the office does not have to move it there first purely to
  // be allowed to do the thing they were already doing.
  it("approves a delivered load, opening and closing its review on the way", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      documents: [POD, BOL],
      paperwork: {},
    });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE" });

    expect(res.status).toBe(200);

    const load = await reload();
    expect(load.transportStatus).toBe("INVOICED");
    expect(load.paperwork.state).toBe("APPROVED");
    // Opened as well as closed — a signed-off load with a blank start on it is
    // a review nobody can account for afterwards.
    expect(load.paperwork.startedAt).toBeTruthy();
  });

  it("will not approve a load that has not been delivered", async () => {
    await makeLoad({ transportStatus: "IN_TRANSIT", documents: [POD, BOL] });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "APPROVE" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_IN_PAPERWORK");
  });

  // Sending documents back is a conversation about a review that is open, so it
  // still needs the load in the queue.
  it("will not send a delivered load's documents back before it is in the queue", async () => {
    await makeLoad({ transportStatus: "DELIVERED", documents: [POD], paperwork: {} });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "REQUEST_CHANGES", note: "Send the BOL." });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_IN_PAPERWORK");
  });
});

describe("Sending the documents back", () => {
  it("insists on a reason — it is the only thing the driver is shown", async () => {
    await makeLoad({ documents: [POD, BOL], paperwork: { state: "IN_REVIEW" } });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "REQUEST_CHANGES", note: "   " });

    expect(res.status).toBe(400);
    expect((await reload()).paperwork.state).toBe("IN_REVIEW");
  });

  it("records the reason and notifies nobody it cannot reach", async () => {
    await makeLoad({ documents: [POD, BOL], paperwork: { state: "IN_REVIEW" } });

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/review")
      .send({ decision: "REQUEST_CHANGES", note: "The BOL photo is cut off." });

    expect(res.status).toBe(200);

    const load = await reload();
    expect(load.paperwork.state).toBe("CHANGES_REQUESTED");
    expect(load.paperwork.changesNote).toBe("The BOL photo is cut off.");
    expect(load.paperwork.changeRequestCount).toBe(1);
  });

  it("hands the load back to the office as soon as the driver re-uploads", async () => {
    await makeLoad({
      documents: [POD, BOL],
      paperwork: { state: "CHANGES_REQUESTED", changesNote: "Unreadable." },
    });

    const res = await request(app)
      .post("/api/loads/LD 0001/documents")
      .set("role", "driver")
      .send({ documentType: "Bill Of Lading", fileName: "bol-v2.pdf" });

    expect(res.status).toBe(200);

    const load = await reload();
    expect(load.paperwork.state).toBe("IN_REVIEW");
    expect(load.paperwork.submittedAt).toBeTruthy();
    // The reason stays on the record. A support call six weeks later is
    // answered by what was wrong with it, not by the fact that a second file
    // exists.
    expect(load.paperwork.changesNote).toBe("Unreadable.");
  });

  it("tells the office there is something to look at", async () => {
    await seed(() =>
      User.create({
        name: "Office",
        email: "office@example.com",
        password: "hashed-not-used",
        role: "staff",
        isActive: true,
      }),
    );
    await makeLoad({ documents: [POD], paperwork: { state: "AWAITING_DOCUMENTS" } });

    await request(app)
      .post("/api/loads/LD 0001/documents")
      .set("role", "driver")
      .send({ documentType: "Bill Of Lading" });

    // The notice is fired without being awaited, so give it a moment to land.
    const notices = await eventually(() =>
      seed(() => Notification.find({ type: "PAPERWORK_SUBMITTED" }).lean()),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].loadId).toBe("LD 0001");
  });
});

describe("Approved documents are sealed", () => {
  const approved = () =>
    makeLoad({
      transportStatus: "INVOICED",
      documents: [POD, BOL],
      paperwork: { state: "APPROVED", approvedAt: new Date() },
    });

  it("refuses a carrier-side upload", async () => {
    await approved();

    const res = await request(app)
      .post("/api/loads/LD 0001/documents")
      .set("role", "driver")
      .send({ documentType: "Bill Of Lading" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAPERWORK_LOCKED");
    expect((await reload()).documents).toHaveLength(2);
  });

  it("refuses a carrier-side delete", async () => {
    await approved();
    const load = await reload();
    const docId = load.documents.find((d) => d.documentType === "Bill Of Lading")._id;

    const res = await request(app)
      .delete(`/api/loads/LD 0001/documents/${docId}`)
      .set("role", "driver");

    expect(res.status).toBe(409);
    expect((await reload()).documents).toHaveLength(2);
  });

  it("still lets the office correct it — they are the ones who approved it", async () => {
    await approved();

    const res = await request(app)
      .post("/api/loads/LD 0001/documents")
      .send({ documentType: "Misc.", fileName: "correction.pdf" });

    expect(res.status).toBe(200);
    expect((await reload()).documents).toHaveLength(3);
  });
});

describe("Invoicing waits for the review", () => {
  it("refuses a straight move to Invoiced from the paperwork queue", async () => {
    await makeLoad({ documents: [POD, BOL], paperwork: { state: "IN_REVIEW" } });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "INVOICED" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USE_PAPERWORK_APPROVAL");
    expect((await reload()).transportStatus).toBe("PAPERWORK_PENDING");
  });

  // The route is closed rather than conditioned. Two ways to reach Invoiceable
  // would mean the one that skips the document check quietly becomes the one
  // people use.
  it("refuses it even on a load whose paperwork is already approved", async () => {
    await makeLoad({
      documents: [POD, BOL],
      paperwork: { state: "APPROVED", approvedAt: new Date() },
    });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "INVOICED" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USE_PAPERWORK_APPROVAL");
    expect(res.body.message).toMatch(/Transfer to Invoiceable/);
  });

  it("will not drag an invoiced load back to delivered", async () => {
    await makeLoad({
      transportStatus: "INVOICED",
      documents: [POD, BOL],
      paperwork: { state: "APPROVED" },
    });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "DELIVERED" });

    expect(res.status).toBe(400);
    expect((await reload()).transportStatus).toBe("INVOICED");
  });
});

// An admin is the person who fixes the load somebody else got wrong, and the
// only way to fix one is to put it back where it should be. The rules above
// stop a load drifting out of step with reality on its way forward; for an
// admin putting it back in step they are the thing in the way.
describe("An admin correcting the record", () => {
  it("may set a load to Invoiceable from the status update", async () => {
    await makeLoad({ documents: [POD, BOL], paperwork: { state: "IN_REVIEW" } });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .set("role", "admin")
      .send({ transportStatus: "INVOICED", note: "Billed by hand." });

    expect(res.status).toBe(200);

    // Recorded as the approval it is, so accounting does not end up holding a
    // load whose review reads as never started and whose documents are still
    // open to being replaced underneath the invoice.
    const load = await reload();
    expect(load.transportStatus).toBe("INVOICED");
    expect(load.paperwork.state).toBe("APPROVED");
    expect(load.paperwork.approvedAt).toBeTruthy();
    expect(load.paperwork.approvalNote).toBe("Billed by hand.");
  });

  it("may pull one back out, which reopens the review it was approved on", async () => {
    await makeLoad({
      transportStatus: "INVOICED",
      documents: [POD, BOL],
      paperwork: { state: "APPROVED", approvedAt: new Date() },
    });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .set("role", "admin")
      .send({ transportStatus: "DELIVERED", note: "Approved against the wrong BOL." });

    expect(res.status).toBe(200);

    const load = await reload();
    expect(load.transportStatus).toBe("DELIVERED");
    // Unlocked, or the driver could not replace the document the load went back
    // for — see isPaperworkLocked.
    expect(load.paperwork.state).toBe("IN_REVIEW");
    // ...and the move is on the load's own history like any other.
    expect(load.transportStatusHistory.at(-1).status).toBe("DELIVERED");
  });

  it("leaves staff where they were", async () => {
    await makeLoad({ transportStatus: "INVOICED", paperwork: { state: "APPROVED" } });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "DELIVERED" });

    expect(res.status).toBe(400);
    expect((await reload()).transportStatus).toBe("INVOICED");
  });
});

describe("Opening the queue", () => {
  it("starts the review waiting on the driver when documents are missing", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      paperwork: undefined,
      documents: [POD],
    });

    await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "PAPERWORK_PENDING" });

    const load = await reload();
    expect(load.paperwork.state).toBe("AWAITING_DOCUMENTS");
    expect(load.paperwork.startedAt).toBeTruthy();
  });

  it("starts it in the office's queue when the driver already uploaded", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      paperwork: undefined,
      documents: [POD, BOL],
    });

    await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "PAPERWORK_PENDING" });

    expect((await reload()).paperwork.state).toBe("IN_REVIEW");
  });
});

describe("Chasing the driver for documents", () => {
  it("records the chase even when there is nobody to reach", async () => {
    await makeLoad();

    const res = await request(app)
      .post("/api/loads/LD 0001/paperwork/remind")
      .send({ note: "Customer is asking." });

    expect(res.status).toBe(200);
    // Nobody on this fixture's carrier has a login, so this is the honest
    // answer — and the attempt is still on the record, which is what tells
    // somebody the carrier has no working account.
    expect(res.body.success).toBe(false);

    const reminders = (await reload()).paperwork.reminders;
    expect(reminders).toHaveLength(1);
    expect(reminders[0].kind).toBe("DOCUMENTS");
    expect(reminders[0].note).toBe("Customer is asking.");
    expect(reminders[0].sent).toBe(false);
  });

  it("can be sent before the load has been moved to the queue", async () => {
    await makeLoad({ transportStatus: "DELIVERED", paperwork: undefined });

    const res = await request(app).post("/api/loads/LD 0001/paperwork/remind").send({});
    expect(res.status).toBe(200);
    expect((await reload()).paperwork.reminders).toHaveLength(1);
  });

  it("is refused once the paperwork has been approved", async () => {
    await makeLoad({ paperwork: { state: "APPROVED" }, documents: [POD, BOL] });

    const res = await request(app).post("/api/loads/LD 0001/paperwork/remind").send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAPERWORK_LOCKED");
  });
});

describe("Reminding the office to move a delivered load on", () => {
  const DAY = 86400000;

  beforeEach(async () => {
    await seed(() =>
      User.create({
        name: "Office",
        email: "office@example.com",
        password: "hashed-not-used",
        role: "staff",
        isActive: true,
      }),
    );
  });

  it("chases a load that has sat at Delivered", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      deliveredAt: new Date(Date.now() - DAY),
      paperwork: undefined,
    });

    const result = await remindDeliveredLoads();
    expect(result.sent).toBe(1);

    const notices = await seed(() => Notification.find({ type: "PAPERWORK_DUE" }).lean());
    expect(notices).toHaveLength(1);
    expect(notices[0].loadId).toBe("LD 0001");
  });

  it("leaves a load that was only just delivered alone", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      deliveredAt: new Date(),
      paperwork: undefined,
    });

    const result = await remindDeliveredLoads();
    expect(result.considered).toBe(0);
    expect(result.sent).toBe(0);
  });

  it("does not chase the same load twice in a day", async () => {
    await makeLoad({
      transportStatus: "DELIVERED",
      deliveredAt: new Date(Date.now() - DAY),
      paperwork: undefined,
    });

    await remindDeliveredLoads();
    const second = await remindDeliveredLoads();

    expect(second.skipped).toBe(1);
    expect(second.sent).toBe(0);
    const notices = await seed(() => Notification.find({ type: "PAPERWORK_DUE" }).lean());
    expect(notices).toHaveLength(1);
  });

  it("stops once the load has been moved on", async () => {
    await makeLoad({
      transportStatus: "PAPERWORK_PENDING",
      deliveredAt: new Date(Date.now() - DAY),
    });

    const result = await remindDeliveredLoads();
    expect(result.considered).toBe(0);
  });
});
