// ─── Charge catalog ───────────────────────────────────────────────────────────
// Every line that can appear on a load's receivables (what the customer is
// billed) or payables (what the carrier and vendors are paid).
//
// One catalog rather than two, because the two lists are the same accessorials
// seen from opposite sides: a detention charge billed out and a detention charge
// paid in are the same event. `sides` says which side a line may appear on.
//
// ── The distinction the whole module turns on ────────────────────────────────
// A line is one of three `kind`s, and they do NOT sum together:
//
//   linehaul   — the base transport charge. Exactly one per side.
//   accessorial— everything added on top: fuel, detention, chassis, lumper…
//   settlement — money that has already changed hands (an advance).
//
// An advance is not a charge. It is a payment against the balance, and adding it
// to the total would either double-count the money or inflate the revenue
// figure, depending on the sign somebody happened to enter it with. So:
//
//   total   = linehaul + Σ accessorials
//   settled = Σ settlements
//   balance = total − settled
//
// Getting this wrong is the single easiest way to make every downstream number —
// margin, payroll, the P&L — quietly incorrect, which is why it is spelled out
// here rather than left to each caller.
// ─────────────────────────────────────────────────────────────────────────────

const BOTH = ["receivable", "payable"];

const CHARGE_TYPES = [
  // ── The base ──────────────────────────────────────────────────────────────
  {
    key: "linehaul",
    kind: "linehaul",
    sides: BOTH,
    group: "Base",
    label: { receivable: "Gross Amount", payable: "Charge" },
    help: {
      receivable: "The base transport charge billed to the customer.",
      payable: "The base amount paid to the carrier for the move.",
    },
  },

  // ── Already settled ───────────────────────────────────────────────────────
  {
    key: "advance",
    kind: "settlement",
    sides: BOTH,
    group: "Settlement",
    label: { receivable: "Advance Received", payable: "Advance Paid" },
    help: {
      receivable:
        "Money already collected from the customer. Reduces what is still owed — it is not added to the total.",
      payable:
        "Money already advanced to the carrier or driver. Reduces what is still due — it is not added to the total.",
    },
  },

  // ── Accessorials ──────────────────────────────────────────────────────────
  {
    key: "dryRun",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Dry Run Charges",
    help: "The trip was made but no freight moved — bad appointment, container not ready.",
  },
  {
    key: "fuelSurcharge",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Fuel Surcharges",
    help: "Fuel adjustment, usually a percentage of linehaul or a rate per mile.",
  },
  {
    key: "pierTermination",
    kind: "accessorial",
    sides: BOTH,
    group: "Port",
    label: "Pier Termination Charges",
  },
  {
    key: "extraStops",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Extra Stops",
    help: "Stops beyond the first pickup and last delivery.",
    // Several stops on one load are several lines, each with its own note.
    repeatable: true,
  },
  {
    key: "lumper",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Lumper Charges",
    help: "Third-party loading or unloading labour at the dock.",
  },
  {
    key: "detention",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Detention Charges",
    help: "Time held at a stop beyond the free window.",
    repeatable: true,
  },
  {
    key: "chassisSplit",
    kind: "accessorial",
    sides: BOTH,
    group: "Chassis",
    label: "Chassis Split Charges",
    help: "The chassis had to be collected separately from the container.",
  },
  {
    key: "chassisRent",
    kind: "accessorial",
    sides: BOTH,
    group: "Chassis",
    label: "Chassis Rent",
    help: "Daily rental on the chassis.",
  },
  {
    key: "pallet",
    kind: "accessorial",
    sides: BOTH,
    group: "Equipment",
    label: "Pallet Charges",
  },
  {
    key: "containerWashOut",
    kind: "accessorial",
    sides: BOTH,
    group: "Equipment",
    label: "Container Wash Out Charges",
  },
  {
    key: "yardStorage",
    kind: "accessorial",
    sides: BOTH,
    group: "Port",
    label: "Yard Storage Charges",
    help: "Storage while the container sat in a yard.",
  },
  {
    key: "rampPull",
    kind: "accessorial",
    sides: BOTH,
    group: "Port",
    label: "Ramp Pull Charges",
  },
  {
    key: "triaxle",
    kind: "accessorial",
    sides: BOTH,
    group: "Equipment",
    label: "Triaxle Charges",
    help: "Heavy-weight container requiring a triaxle chassis.",
  },
  {
    key: "transload",
    kind: "accessorial",
    sides: BOTH,
    group: "Operations",
    label: "Trans Load Charges",
    help: "Freight moved from one trailer or container to another.",
  },
  {
    key: "other",
    kind: "accessorial",
    sides: BOTH,
    group: "Other",
    label: "Other Miscellaneous Charges",
    help: "Anything not covered above. Add a note saying what it is.",
    repeatable: true,
    // The only line where a free-text description is genuinely load-specific,
    // so it is the only one where the note is required.
    requiresNote: true,
  },
];

const CHARGE_BY_KEY = new Map(CHARGE_TYPES.map((c) => [c.key, c]));

const SIDES = ["receivable", "payable"];

/** The label for a charge on a given side — some differ (Gross Amount / Charge). */
const labelFor = (key, side) => {
  const spec = CHARGE_BY_KEY.get(key);
  if (!spec) return key;
  return typeof spec.label === "string" ? spec.label : spec.label[side] || key;
};

const helpFor = (key, side) => {
  const spec = CHARGE_BY_KEY.get(key);
  if (!spec?.help) return "";
  return typeof spec.help === "string" ? spec.help : spec.help[side] || "";
};

/** Charges valid on one side, in the order the form should show them. */
const chargesFor = (side) =>
  CHARGE_TYPES.filter((c) => c.sides.includes(side)).map((c) => ({
    key: c.key,
    kind: c.kind,
    group: c.group,
    label: labelFor(c.key, side),
    help: helpFor(c.key, side),
    repeatable: !!c.repeatable,
    requiresNote: !!c.requiresNote,
  }));

/**
 * Round to cents.
 *
 * Money in JavaScript is a float, and 0.1 + 0.2 is famously not 0.3 — summing
 * twenty accessorials without rounding produces totals that are a hundredth of a
 * cent out and print as 1234.5600000000001. Rounding at each total keeps the
 * arithmetic honest without reaching for a decimal library.
 */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Total one side's lines.
 *
 * Returns the three figures that are meaningful, never a single "sum" — see the
 * note at the top of this file for why an advance must not land in `total`.
 */
const totalsFor = (lines = []) => {
  let linehaul = 0;
  let accessorials = 0;
  let settled = 0;

  for (const line of lines) {
    const spec = CHARGE_BY_KEY.get(line?.chargeType);
    if (!spec) continue; // unknown key contributes nothing rather than NaN

    const amount = Number(line.amount) || 0;

    if (spec.kind === "linehaul") linehaul += amount;
    else if (spec.kind === "settlement") settled += amount;
    else accessorials += amount;
  }

  const total = money(linehaul + accessorials);

  return {
    linehaul: money(linehaul),
    accessorials: money(accessorials),
    total,
    settled: money(settled),
    balance: money(total - settled),
  };
};

/**
 * Profit and loss for one load.
 *
 * Margin is computed from `total` on both sides — what was billed against what
 * was incurred — not from the balances. Advances are cash-flow timing; they say
 * nothing about whether the load made money.
 */
const profitFor = ({ receivableLines = [], payableLines = [] } = {}) => {
  const revenue = totalsFor(receivableLines);
  const expense = totalsFor(payableLines);

  const margin = money(revenue.total - expense.total);

  return {
    revenue,
    expense,
    margin,
    // Guarded: a load with nothing billed yet would otherwise report Infinity or
    // NaN, which then propagates into every average on the summary screen.
    marginPercent: revenue.total > 0 ? money((margin / revenue.total) * 100) : 0,
  };
};

/** Reject anything that is not a real charge on that side. */
const isValidCharge = (key, side) => {
  const spec = CHARGE_BY_KEY.get(key);
  return !!spec && spec.sides.includes(side);
};

const catalog = () => ({
  sides: SIDES,
  receivable: chargesFor("receivable"),
  payable: chargesFor("payable"),
  groups: [...new Set(CHARGE_TYPES.map((c) => c.group))],
});

module.exports = {
  CHARGE_TYPES,
  CHARGE_BY_KEY,
  SIDES,
  labelFor,
  helpFor,
  chargesFor,
  totalsFor,
  profitFor,
  isValidCharge,
  money,
  catalog,
};
