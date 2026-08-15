const FleetOwner = require("../models/FleetOwner");
const Customer = require("../models/Customer");
const Driver = require("../models/Driver");
const { enqueue } = require("./whatsappService");
const { accountPersonFor } = require("../utils/carrierAccount");

// ─── Operational WhatsApp alerts ──────────────────────────────────────────────
// One function per event the business cares about. Each works out who should
// hear about it and puts a templated message on the outbox.
//
// Nothing here throws into its caller. A driver assignment must not fail because
// WhatsApp is misconfigured, so every hook is fire-and-forget and any problem
// ends up on the outbox row instead of in the operator's face.
//
// Who gets told is a judgement per event, not a broadcast to everyone attached
// to the load:
//   the customer   hears about milestones they are waiting on — picked up,
//                  delivered, delayed, completed.
//   the carrier    hears about work and money — assignment, schedule, payment.
//   the driver     hears only what they personally have to act on.
// Copying all three on everything is how people mute the channel.
// ─────────────────────────────────────────────────────────────────────────────

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const cityOf = (stop) =>
  [stop?.city, stop?.state].filter(Boolean).join(", ") || "—";

/** The customer's contact number and name for a load, or null. */
const customerContactFor = async (load) => {
  if (!load?.customer) return null;

  const customer = await Customer.findOne({ user: load.customer })
    .select("customerName contact")
    .lean();

  const phone = customer?.contact?.phone;
  if (!phone) return null;

  return { phone, name: customer.customerName || "Customer" };
};

/** The carrier's account person — the one contact for a load. */
const carrierContactFor = async (load) => {
  const id = load?.assignedFleetOwner?.fleetOwnerId;
  if (!id) return null;

  const carrier = await FleetOwner.findById(id)
    .select("carrierName phone contactPersons")
    .lean();
  if (!carrier) return null;

  const person = accountPersonFor(carrier);
  const phone = person?.phone || carrier.phone;
  if (!phone) return null;

  return { phone, name: person?.name || carrier.carrierName };
};

const common = (load) => ({
  load: load?._id,
  loadId: load?.loadId,
  locationId: load?.locationId,
});

// ── Pickup ────────────────────────────────────────────────────────────────────
const onPickupConfirmed = async (load, actor) => {
  const customer = await customerContactFor(load);
  if (!customer) return;

  await enqueue({
    ...common(load),
    to: customer.phone,
    recipientName: customer.name,
    recipientRole: "client",
    templateKey: "pickup_confirmation",
    variables: {
      loadId: load.loadId,
      pickupCity: cityOf(load.pickup),
      pickedUpAt: fmtDateTime(new Date()),
    },
    createdBy: actor?._id,
  });
};

// ── Delivery ──────────────────────────────────────────────────────────────────
const onDelivered = async (load, actor) => {
  const customer = await customerContactFor(load);
  if (!customer) return;

  await enqueue({
    ...common(load),
    to: customer.phone,
    recipientName: customer.name,
    recipientRole: "client",
    templateKey: "delivery_confirmation",
    variables: {
      loadId: load.loadId,
      dropCity: cityOf(load.drop),
      deliveredAt: fmtDateTime(new Date()),
    },
    createdBy: actor?._id,
  });
};

// ── Driver assignment ─────────────────────────────────────────────────────────
// Straight to the driver: this is the one message they personally must act on.
const onDriversAssigned = async (load, assignments = [], actor) => {
  const ids = assignments.map((a) => a.driver).filter(Boolean);
  if (!ids.length) return;

  const drivers = await Driver.find({ _id: { $in: ids } })
    .select("_id name phone")
    .lean();
  const byId = new Map(drivers.map((d) => [String(d._id), d]));

  for (const assignment of assignments) {
    const driver = byId.get(String(assignment.driver));
    if (!driver?.phone) continue;

    await enqueue({
      ...common(load),
      to: driver.phone,
      recipientName: driver.name,
      recipientRole: "driver",
      recipientRef: driver._id,
      templateKey: "driver_assignment",
      variables: {
        driverName: driver.name,
        loadId: load.loadId,
        // Their own leg where they have one — a driver told the load's overall
        // origin when they are running the second half is being misinformed.
        pickupCity: cityOf(assignment.pickup?.city ? assignment.pickup : load.pickup),
        dropCity: cityOf(assignment.drop?.city ? assignment.drop : load.drop),
      },
      createdBy: actor?._id,
    });
  }
};

// ── Status change ─────────────────────────────────────────────────────────────
// The carrier's contact, not the customer: most transport statuses are internal
// movements a customer has no use for. Delivery and pickup have their own hooks.
const onStatusChanged = async (load, status, actor) => {
  const carrier = await carrierContactFor(load);
  if (!carrier) return;

  await enqueue({
    ...common(load),
    to: carrier.phone,
    recipientName: carrier.name,
    recipientRole: "fleetOwner",
    templateKey: "status_change",
    variables: {
      loadId: load.loadId,
      status: String(status || "").replace(/_/g, " "),
    },
    createdBy: actor?._id,
  });
};

// ── Schedule / delay / completion / payment ───────────────────────────────────
const onScheduleUpdated = async (load, { what, newTime }, actor) => {
  const carrier = await carrierContactFor(load);
  if (!carrier) return;

  await enqueue({
    ...common(load),
    to: carrier.phone,
    recipientName: carrier.name,
    recipientRole: "fleetOwner",
    templateKey: "schedule_update",
    variables: { loadId: load.loadId, what, newTime: fmtDateTime(newTime) },
    createdBy: actor?._id,
  });
};

const onDelayed = async (load, { reason, newEta }, actor) => {
  const customer = await customerContactFor(load);
  if (!customer) return;

  await enqueue({
    ...common(load),
    to: customer.phone,
    recipientName: customer.name,
    recipientRole: "client",
    templateKey: "delay_notification",
    variables: { loadId: load.loadId, reason, newEta: fmtDateTime(newEta) },
    createdBy: actor?._id,
  });
};

const onLoadCompleted = async (load, actor) => {
  const customer = await customerContactFor(load);
  if (!customer) return;

  await enqueue({
    ...common(load),
    to: customer.phone,
    recipientName: customer.name,
    recipientRole: "client",
    templateKey: "load_completion",
    variables: { loadId: load.loadId, completedAt: fmtDateTime(new Date()) },
    createdBy: actor?._id,
  });
};

const onPaymentUpdate = async (load, { detail, amount }, actor) => {
  const carrier = await carrierContactFor(load);
  if (!carrier) return;

  await enqueue({
    ...common(load),
    to: carrier.phone,
    recipientName: carrier.name,
    recipientRole: "fleetOwner",
    templateKey: "payment_update",
    variables: { loadId: load.loadId, detail, amount },
    createdBy: actor?._id,
  });
};

const onAppointmentReminder = async (load, { what, when, where }, actor) => {
  const carrier = await carrierContactFor(load);
  if (!carrier) return;

  await enqueue({
    ...common(load),
    to: carrier.phone,
    recipientName: carrier.name,
    recipientRole: "fleetOwner",
    templateKey: "appointment_reminder",
    variables: { loadId: load.loadId, what, when: fmtDateTime(when), where },
    createdBy: actor?._id,
  });
};

/**
 * Every hook wrapped so a messaging failure can never break the operation that
 * triggered it. Callers use these, not the raw functions above.
 */
const safe =
  (fn) =>
  (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch((error) => console.error("WhatsApp event failed:", error.message));

module.exports = {
  onPickupConfirmed: safe(onPickupConfirmed),
  onDelivered: safe(onDelivered),
  onDriversAssigned: safe(onDriversAssigned),
  onStatusChanged: safe(onStatusChanged),
  onScheduleUpdated: safe(onScheduleUpdated),
  onDelayed: safe(onDelayed),
  onLoadCompleted: safe(onLoadCompleted),
  onPaymentUpdate: safe(onPaymentUpdate),
  onAppointmentReminder: safe(onAppointmentReminder),
};
