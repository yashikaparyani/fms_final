// ─── WhatsApp message templates ───────────────────────────────────────────────
// Every business-initiated WhatsApp message must use a template Meta has already
// approved. Free text is only allowed inside the 24-hour service window that
// opens when the recipient messages you first — which, for operational alerts
// nobody replies to, is almost never. So each event below is a template.
//
// This file is a MIRROR of what is registered in the Meta Business Manager, not
// the source of truth. `name` and `language` must match the approved template
// exactly, and `variables` must be in the same order as the {{1}} {{2}} slots in
// the approved body — Meta fills them positionally, so a reordering here sends
// the load id where the date should be with no error at all.
//
// Category matters for billing and for what Meta allows:
//   utility  — about an existing transaction (a load). Cheap, and the right
//              category for nearly everything here.
//   marketing— promotional. More expensive, easier to get flagged, and needs
//              the recipient's marketing opt-in.
// Miscategorising a marketing blast as utility is the fastest way to lose
// sending quality, so `custom_broadcast` is declared marketing deliberately.
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    key: "pickup_confirmation",
    name: "load_pickup_confirmed",
    language: "en",
    category: "utility",
    label: "Pickup confirmation",
    description: "Sent when a driver marks a load picked up.",
    variables: ["loadId", "pickupCity", "pickedUpAt"],
    sample: "Load {{1}} has been picked up from {{2}} at {{3}}.",
  },
  {
    key: "delivery_confirmation",
    name: "load_delivered",
    language: "en",
    category: "utility",
    label: "Delivery confirmation",
    description: "Sent when a load is marked delivered.",
    variables: ["loadId", "dropCity", "deliveredAt"],
    sample: "Load {{1}} was delivered to {{2}} at {{3}}. POD is on its way.",
  },
  {
    key: "driver_assignment",
    name: "driver_assigned",
    language: "en",
    category: "utility",
    label: "Driver assignment",
    description: "Sent to a driver when they are put on a load.",
    variables: ["driverName", "loadId", "pickupCity", "dropCity"],
    sample: "Hi {{1}}, you are assigned to load {{2}}: {{3}} to {{4}}.",
  },
  {
    key: "schedule_update",
    name: "load_schedule_updated",
    language: "en",
    category: "utility",
    label: "Schedule update",
    description: "Sent when a pickup or delivery window moves.",
    variables: ["loadId", "what", "newTime"],
    sample: "Load {{1}}: {{2}} has moved to {{3}}.",
  },
  {
    key: "status_change",
    name: "load_status_changed",
    language: "en",
    category: "utility",
    label: "Status change",
    description: "Sent on a transport status change.",
    variables: ["loadId", "status"],
    sample: "Load {{1}} is now {{2}}.",
  },
  {
    key: "appointment_reminder",
    name: "appointment_reminder",
    language: "en",
    category: "utility",
    label: "Appointment reminder",
    description: "Sent ahead of a booked pickup or delivery appointment.",
    variables: ["loadId", "what", "when", "where"],
    sample: "Reminder — load {{1}}: {{2}} at {{3}}, {{4}}.",
  },
  {
    key: "delay_notification",
    name: "load_delayed",
    language: "en",
    category: "utility",
    label: "Delay notification",
    description: "Sent when a load is running behind.",
    variables: ["loadId", "reason", "newEta"],
    sample: "Load {{1}} is delayed ({{2}}). Revised ETA {{3}}.",
  },
  {
    key: "load_completion",
    name: "load_completed",
    language: "en",
    category: "utility",
    label: "Load completion",
    description: "Sent when paperwork is done and the load is closed.",
    variables: ["loadId", "completedAt"],
    sample: "Load {{1}} is complete as of {{2}}. Thank you.",
  },
  {
    key: "payment_update",
    name: "payment_update",
    language: "en",
    category: "utility",
    label: "Payment update",
    description: "Sent on an invoice or settlement change.",
    variables: ["loadId", "detail", "amount"],
    sample: "Load {{1}}: {{2}}. Amount {{3}}.",
  },
  {
    key: "custom_broadcast",
    name: "operational_announcement",
    language: "en",
    category: "marketing",
    label: "Custom announcement",
    description:
      "The free-text-shaped one, for announcements from the messaging panel. " +
      "The body is still a single approved template with one variable — Meta " +
      "will not accept arbitrary text outside the 24-hour service window.",
    variables: ["message"],
    sample: "{{1}}",
  },
];

const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);

/**
 * Positional parameters for Meta, in the order the approved body expects.
 * Missing values become "—" rather than being dropped: Meta rejects a send whose
 * parameter count does not match the template, so a blank is far better than a
 * failure the operator cannot see the cause of.
 */
const buildParameters = (templateKey, values = {}) => {
  const template = TEMPLATE_BY_KEY.get(templateKey);
  if (!template) return null;

  return template.variables.map((name) => {
    const value = values[name];
    const text = value === undefined || value === null ? "" : String(value).trim();
    return { type: "text", text: text || "—" };
  });
};

/** What the recipient will actually read — for the panel's preview. */
const renderPreview = (templateKey, values = {}) => {
  const template = TEMPLATE_BY_KEY.get(templateKey);
  if (!template) return "";

  return template.variables.reduce(
    (body, name, index) =>
      body.replace(
        new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"),
        String(values[name] ?? "—"),
      ),
    template.sample,
  );
};

/** The catalog in the shape the settings and messaging screens want. */
const catalog = () =>
  TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    language: t.language,
    category: t.category,
    label: t.label,
    description: t.description,
    variables: t.variables,
    sample: t.sample,
  }));

module.exports = {
  TEMPLATES,
  TEMPLATE_BY_KEY,
  TEMPLATE_KEYS,
  buildParameters,
  renderPreview,
  catalog,
};
