const fs = require("fs");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Customer = require("../models/Customer");
const { sendEmail } = require("../utils/mailer");
const templates = require("./emailTemplates");

// ─── "Delivered" — the good-news message ─────────────────────────────────────
// When a load is marked delivered, everybody who cares hears about it: the
// office (admins, and staff at the load's branch) and the customer. In the app
// as a notification, and by email. The customer's email carries the Proof of
// Delivery generated at the door, so they have the signed document without
// having to log in for it.
//
// Fire-and-forget from the status route, and never able to throw: a driver
// marking a load delivered must not see an error because the mail server is
// down. Each channel fails on its own.
// ─────────────────────────────────────────────────────────────────────────────

const clean = (list) => [...new Set(list.filter(Boolean).map((e) => String(e).trim().toLowerCase()))];

/** Admins, plus staff who work at the load's branch. */
const officeUsers = async (load) => {
  const filter = {
    isActive: { $ne: false },
    $or: [
      { role: "admin" },
      load.locationId
        ? { role: "staff", locations: load.locationId }
        : { role: "staff" },
    ],
  };
  return User.find(filter).select("_id email role").lean();
};

/** The customer's login plus any delivery / POD addresses on their profile. */
const customerContacts = async (load) => {
  if (!load.customer) return { user: null, emails: [] };

  const user = await User.findById(load.customer).select("_id email name firstName").lean();
  const profile = await Customer.findOne({ user: load.customer })
    .select("customerName emails")
    .setOptions({ skipTenantScope: true })
    .lean()
    .catch(() => null);

  return {
    user,
    name: profile?.customerName || user?.name || user?.firstName || "",
    emails: clean([user?.email, profile?.emails?.deliveryEmail, profile?.emails?.podEmail]),
  };
};

const podAttachment = (load, generatedPod) => {
  const filePath =
    generatedPod?.filePath ||
    (load.documents || []).find((d) => d.documentType === "Proof of Delivery")?.filePath;
  if (!filePath || !fs.existsSync(filePath)) return null;
  return {
    filename: `POD-${String(load.loadId).replace(/\s+/g, "")}.pdf`,
    content: fs.readFileSync(filePath),
    contentType: "application/pdf",
  };
};

const onDelivered = async (load, actor, generatedPod) => {
  const [office, customer] = await Promise.all([officeUsers(load), customerContacts(load)]);

  // ── In the app ────────────────────────────────────────────────────────────
  const base = {
    type: "LOAD_DELIVERED",
    load: load._id,
    loadId: load.loadId,
    // Filed under the load's branch, which is already in hand.
    ...(load.locationId ? { locationId: load.locationId } : {}),
  };
  const notices = office.map((u) => ({
    ...base,
    recipient: u._id,
    recipientRole: u.role,
    title: `🎉 Load ${load.loadId} delivered`,
    message: `Congratulations! Load ${load.loadId} to ${load.drop?.city || "its destination"} was delivered successfully.`,
  }));
  if (customer.user) {
    notices.push({
      ...base,
      recipient: customer.user._id,
      recipientRole: "client",
      title: `🎉 Your load ${load.loadId} has been delivered`,
      message: `Great news — load ${load.loadId} was delivered successfully. The Proof of Delivery is on the load and in your email.`,
    });
  }
  if (notices.length) {
    await Notification.insertMany(notices).catch((err) =>
      console.error(`Delivered notification failed for ${load.loadId}:`, err.message),
    );
  }

  // ── By email ──────────────────────────────────────────────────────────────
  const officeEmails = clean(office.map((u) => u.email));
  if (officeEmails.length) {
    const template = templates.loadDelivered({ load, audience: "office" });
    await sendEmail({ to: officeEmails.join(","), ...template }).catch((err) =>
      console.error(`Delivered email (office) failed for ${load.loadId}:`, err.message),
    );
  }

  if (customer.emails.length) {
    const pod = podAttachment(load, generatedPod);
    const template = templates.loadDelivered({
      load,
      audience: "customer",
      customerName: customer.name,
      hasPod: !!pod,
    });
    await sendEmail({
      to: customer.emails.join(","),
      ...template,
      attachments: pod ? [pod] : undefined,
    }).catch((err) =>
      console.error(`Delivered email (customer) failed for ${load.loadId}:`, err.message),
    );
  }
};

module.exports = {
  onDelivered: (...args) =>
    onDelivered(...args).catch((err) =>
      console.error("Delivered notice failed:", err.message),
    ),
};
