// The "delivered" good news: the office and the customer each get an in-app
// notification and an email, and the customer's email carries the POD.

const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
require("../models/Load");
const Notification = require("../models/Notification");
const User = require("../models/User");

jest.mock("../utils/mailer", () => ({
  sendEmail: jest.fn().mockResolvedValue({ sent: true }),
}));
const { sendEmail } = require("../utils/mailer");
const deliveryNotice = require("../services/deliveryNotice");

const LOCATION = new mongoose.Types.ObjectId(TEST_LOCATION_ID);
const OTHER_LOCATION = new mongoose.Types.ObjectId();

beforeAll(connect);
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(closeDatabase);

const user = (fields) =>
  User.create({ password: "secret123", isActive: true, ...fields });

const setup = async () => {
  const admin = await user({ role: "admin", email: "admin@x.com", name: "Admin" });
  const staff = await user({ role: "staff", email: "staff@x.com", name: "Staff", locations: [LOCATION] });
  const elsewhere = await user({ role: "staff", email: "far@x.com", name: "Far", locations: [OTHER_LOCATION] });
  const client = await user({ role: "client", email: "client@x.com", name: "Client", locations: [LOCATION] });
  return { admin, staff, elsewhere, client };
};

const podFile = () => {
  const file = path.join(os.tmpdir(), `pod-test-${Date.now()}.pdf`);
  fs.writeFileSync(file, "%PDF-1.4 test");
  return file;
};

it("notifies the office at the branch and the customer, and attaches the POD for the customer", async () => {
  const { staff, elsewhere, client } = await setup();
  const load = {
    _id: new mongoose.Types.ObjectId(),
    loadId: "LD 0009",
    locationId: LOCATION,
    customer: client._id,
    pickup: { city: "Oakland", state: "CA" },
    drop: { city: "Modesto", state: "CA" },
    documents: [],
  };
  const pod = podFile();

  await withTenant({ locationId: TEST_LOCATION_ID }, () =>
    deliveryNotice.onDelivered(load, null, { filePath: pod }),
  );

  const notes = await Notification.find({ type: "LOAD_DELIVERED" })
    .setOptions({ skipTenantScope: true })
    .lean();
  const recipients = notes.map((n) => String(n.recipient));
  expect(recipients).toEqual(expect.arrayContaining([String(staff._id), String(client._id)]));
  // Staff at another branch have nothing to do with this load.
  expect(recipients).not.toContain(String(elsewhere._id));
  expect(notes.some((n) => /delivered/i.test(n.title))).toBe(true);

  expect(sendEmail).toHaveBeenCalledTimes(2);
  const [officeMail, customerMail] = sendEmail.mock.calls.map((c) => c[0]);
  expect(officeMail.to).toContain("admin@x.com");
  expect(officeMail.to).toContain("staff@x.com");
  expect(officeMail.to).not.toContain("far@x.com");
  expect(officeMail.attachments).toBeUndefined();

  expect(customerMail.to).toBe("client@x.com");
  expect(customerMail.subject).toMatch(/Delivered/);
  expect(customerMail.attachments[0].filename).toBe("POD-LD0009.pdf");

  fs.unlinkSync(pod);
});

it("still tells everybody when there is no POD file to attach", async () => {
  const { client } = await setup();
  const load = {
    _id: new mongoose.Types.ObjectId(),
    loadId: "LD 0010",
    locationId: LOCATION,
    customer: client._id,
    documents: [],
  };

  await withTenant({ locationId: TEST_LOCATION_ID }, () => deliveryNotice.onDelivered(load, null, null));

  const customerMail = sendEmail.mock.calls.map((c) => c[0]).find((m) => m.to === "client@x.com");
  expect(customerMail).toBeTruthy();
  expect(customerMail.attachments).toBeUndefined();
});
