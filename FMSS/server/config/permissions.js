// ─── Permission catalog ───────────────────────────────────────────────────────
// The single source of truth for what a staff member can be granted. The admin
// UI renders this list, the middleware validates against it, and the User model
// stores nothing but keys from it.
//
// A permission key is "<module>.<action>" — "loads.edit", "customers.view".
// Keys are strings rather than a nested boolean schema (which is what the old
// `access` sub-document was) because adding a module then costs one line here
// instead of a schema migration on every existing user.
//
// Roles still exist and still come first: `admin` bypasses every check, and
// `client` / `fleetOwner` / `driver` are portal roles whose access is defined by
// their own routes, not by this list. Permissions only refine what `staff` can
// reach.
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    group: "Operations",
    description: "Landing page, KPI tiles and weekly summary",
    actions: ["view"],
  },
  {
    key: "loads",
    label: "Loads",
    group: "Operations",
    description: "Load register, creation and editing",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "tracking",
    label: "Tracking",
    group: "Operations",
    description: "Live tracking timeline and transport status updates",
    actions: ["view", "update"],
  },
  {
    key: "bids",
    label: "Bids",
    group: "Operations",
    description: "Bid rounds, negotiation and awarding carriers",
    actions: ["view", "manage"],
  },
  {
    key: "customers",
    label: "Customers",
    group: "Directory",
    description: "Customer records, addresses and portal credentials",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "fleetOwners",
    label: "Fleet Owners",
    group: "Directory",
    description: "Carrier records, documents and portal credentials",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "reports",
    label: "Reports",
    group: "Insight",
    description: "Operational and financial reporting",
    actions: ["view", "export"],
  },
  {
    key: "masters",
    label: "Master Data",
    group: "Administration",
    description: "Shipping lines, delivery partners and chassis companies",
    actions: ["view", "manage"],
  },
  {
    key: "locations",
    label: "Locations",
    group: "Administration",
    description: "Create and deactivate operating locations",
    actions: ["view", "manage"],
  },
  {
    key: "staff",
    label: "Staff",
    group: "Administration",
    description: "Add staff accounts and issue their credentials",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "permissions",
    label: "Permissions",
    group: "Administration",
    description: "Decide who may reach which module and which location",
    actions: ["view", "manage"],
  },
  {
    key: "settings",
    label: "Settings",
    group: "Administration",
    description: "Email configuration and system preferences",
    actions: ["view", "manage"],
  },
];

/** Human labels for the actions, so the UI does not hard-code them. */
const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  manage: "Manage",
  update: "Update",
  export: "Export",
};

const permissionKey = (moduleKey, action) => `${moduleKey}.${action}`;

/** Every grantable key, e.g. ["dashboard.view", "loads.view", …]. */
const ALL_PERMISSIONS = MODULES.flatMap((m) =>
  m.actions.map((action) => permissionKey(m.key, action)),
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

/** Read-only keys — the "view"-ish half of every module. */
const READ_PERMISSIONS = ALL_PERMISSIONS.filter((key) => key.endsWith(".view"));

const forModules = (...moduleKeys) =>
  ALL_PERMISSIONS.filter((key) => moduleKeys.includes(key.split(".")[0]));

// ─── Templates ────────────────────────────────────────────────────────────────
// A named starting point, so adding six dispatchers does not mean ticking the
// same forty boxes six times. A template is expanded to plain keys the moment it
// is applied — nothing stores "this user is a dispatcher", because then editing
// the template later would silently re-grant access somebody had removed.
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {
  manager: {
    label: "Branch Manager",
    description:
      "Everything operational plus master data and reports. Cannot manage staff, permissions or locations.",
    permissions: forModules(
      "dashboard",
      "loads",
      "tracking",
      "bids",
      "customers",
      "fleetOwners",
      "reports",
      "masters",
      "settings",
    ),
  },
  dispatcher: {
    label: "Dispatcher",
    description:
      "Runs the board: creates and edits loads, updates tracking, works the bids.",
    permissions: [
      "dashboard.view",
      ...forModules("loads", "tracking", "bids"),
      "customers.view",
      "fleetOwners.view",
      "reports.view",
    ].filter((key) => key !== "loads.delete"),
  },
  backOffice: {
    label: "Back Office",
    description:
      "Maintains the customer and carrier directory and pulls reports. Read-only on loads.",
    permissions: [
      "dashboard.view",
      "loads.view",
      "tracking.view",
      ...forModules("customers", "fleetOwners"),
      ...forModules("reports"),
    ].filter((key) => !key.endsWith(".delete")),
  },
  viewer: {
    label: "Read Only",
    description: "Can see the operational screens and change nothing.",
    permissions: READ_PERMISSIONS.filter(
      (key) => !["staff", "permissions", "settings"].includes(key.split(".")[0]),
    ),
  },
};

/**
 * Keep only keys this build actually knows about, de-duplicated.
 *
 * Unknown keys are dropped rather than rejected: a permission removed in a
 * later release would otherwise make every existing user un-saveable, and a
 * stale key grants nothing anyway because every check looks it up here.
 */
const sanitizePermissions = (input) => {
  const list = Array.isArray(input) ? input : [];
  const kept = new Set();

  for (const raw of list) {
    const key = String(raw || "").trim();
    if (PERMISSION_SET.has(key)) kept.add(key);
  }

  return [...kept];
};

/** Names that were passed but are not grantable — surfaced so a typo is visible. */
const unknownPermissions = (input) => {
  const list = Array.isArray(input) ? input : [];
  return [
    ...new Set(
      list
        .map((raw) => String(raw || "").trim())
        .filter((key) => key && !PERMISSION_SET.has(key)),
    ),
  ];
};

/** The permissions a template stands for, or [] when the name is unknown. */
const expandTemplate = (name) =>
  TEMPLATES[String(name || "").trim()]?.permissions?.slice() || [];

/**
 * The catalog in the shape the admin UI wants: modules with labelled actions,
 * grouped, plus the templates it can offer as one-click starting points.
 */
const catalog = () => ({
  modules: MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    group: m.group,
    description: m.description,
    actions: m.actions.map((action) => ({
      action,
      key: permissionKey(m.key, action),
      label: ACTION_LABELS[action] || action,
    })),
  })),
  groups: [...new Set(MODULES.map((m) => m.group))],
  templates: Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    label: t.label,
    description: t.description,
    permissions: t.permissions,
  })),
});

module.exports = {
  MODULES,
  ACTION_LABELS,
  ALL_PERMISSIONS,
  READ_PERMISSIONS,
  TEMPLATES,
  permissionKey,
  sanitizePermissions,
  unknownPermissions,
  expandTemplate,
  catalog,
};
