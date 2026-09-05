const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const User = require("../models/User");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Address = require("../models/common/Address");
const {
  labelFor,
  CHARGE_BY_KEY,
  totalsFor,
  money,
} = require("../config/chargeTypes");
const { nextSequence } = require("../utils/sequence");
// A load that nobody has itemised still has a base amount and carrier rates.
// See services/ledgerFallback.js — without this, raising an invoice for one of
// them produces a document for $0.
const ledger = require("./ledgerFallback");

// ─── Turning a load's ledger into documents ───────────────────────────────────
// The load carries working figures — receivables and payables, edited as the job
// runs. This module freezes them into the things you can actually send someone:
// one customer invoice, and one bill per carrier leg and per driver.
//
// ── Numbering ────────────────────────────────────────────────────────────────
// The customer invoice IS the load number. "LD 0014" on the board, "LD 0014" on
// the bill, "LD 0014" quoted on the remittance — nobody has to translate between
// two numbering schemes when a customer calls about a payment, which is the
// entire reason for the rule.
//
// Carrier bills hang off the same number: "LD 0014-AP1", "LD 0014-AP2". A split
// load pays two carriers separately and each needs its own document, but both
// stay one glance away from the load they came off.
//
// ── Splitting the payables ───────────────────────────────────────────────────
// The load's payable lines each name the carrier they belong to (fleetOwnerId).
// A bill is built from one carrier's own lines, so a two-carrier load produces
// two bills that add up to the ledger and neither can see the other's rate.
// Lines naming nobody land on the primary carrier's bill — on a single-carrier
// load that is every line, which is the common case and needs no ceremony.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const oneLineAddress = (address) => {
  if (!address) return "";
  return [address.street, address.suite, address.city, address.state, address.zip]
    .map(trimmed)
    .filter(Boolean)
    .join(", ");
};

/**
 * The letterhead: the branch the load belongs to.
 *
 * Snapshotted onto the invoice rather than joined on read, because a branch that
 * moves office has not moved the address a bill was already sent under.
 */
const HOUSE_NAME = "S Line Brokerage Inc.";

// The letterhead falls back to the house web address rather than printing a gap:
// a branch record created before the field existed still bills under a document
// the customer recognises.
const HOUSE_WEBSITE = "SLINETRANSPORT.COM";

const issuerFor = async (load) => {
  if (!load?.locationId) return { name: HOUSE_NAME, website: HOUSE_WEBSITE };

  const branch = await Branch.findById(load.locationId).lean();
  if (!branch) return { name: HOUSE_NAME, website: HOUSE_WEBSITE };

  return {
    name: branch.name || HOUSE_NAME,
    code: branch.code || "",
    address: branch.address || "",
    city: branch.city || "",
    state: branch.state || "",
    zip: branch.zip || "",
    phone: branch.phone || "",
    email: branch.email || "",
    website: branch.website || HOUSE_WEBSITE,
  };
};

/**
 * Where the freight was collected, for the Ship to block.
 *
 * The pickup rather than the drop, deliberately: on a drayage bill the customer
 * is matching this document against the booking they gave us, and the booking is
 * filed under the shipper it came from. Both ends of the move are still spelled
 * out in the line description, so nothing is lost by naming the origin here.
 */
const shipToFor = (load) => {
  const stop = load?.pickups?.[0] || load?.pickup;
  if (!stop) return undefined;

  const address = [stop.address, stop.city, stop.state, stop.zip]
    .map(trimmed)
    .filter(Boolean)
    .join(", ");

  const name = trimmed(stop.company);
  if (!name && !address) return undefined;

  return { name, address };
};

/**
 * The numbers the customer files the bill under.
 *
 * Blank fields are dropped rather than printed empty — "Ref # :" with nothing
 * after it reads as a mistake on our side and invites the phone call the
 * reference block exists to prevent.
 */
const referencesFor = (load) =>
  [
    { label: "TRAILER #", value: trimmed(load?.containerNo) },
    { label: "Ref #", value: trimmed(load?.bookingNo) },
  ].filter((ref) => ref.value);

/**
 * Who the customer invoice is addressed to.
 *
 * The load holds a User id; the billing address and the accounts-payable email
 * live on the Customer record beside it. Both are looked up, and every one of
 * them is allowed to be missing — a load created before the customer master was
 * filled in still has to be billable, so a blank field is a blank line on the
 * document rather than a refusal to produce one.
 */
const customerPartyFor = async (load) => {
  const party = {
    kind: "CUSTOMER",
    id: load.customer || undefined,
    name: load.customerName || "",
    email: "",
    phone: "",
    address: "",
  };

  if (!load.customer) return party;

  const user = await User.findById(load.customer).lean();
  if (user) {
    party.name =
      party.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "";
    party.email = user.email || "";
    party.phone = user.phone || "";
  }

  const customer = await Customer.findOne({ user: load.customer }).lean();
  if (customer) {
    party.name = customer.customerName || party.name;
    party.phone = customer.contact?.phone || party.phone;

    // Invoices go to the accounts address when the customer has named one. A
    // bill sent to the operations contact sits in the inbox of somebody with no
    // authority to pay it.
    party.email =
      customer.emails?.accChargesEmail || customer.contact?.email || party.email;

    const addressId = customer.addresses?.[0];
    if (addressId) {
      const address = await Address.findById(addressId).lean();
      party.address = oneLineAddress(address);
    }
  }

  return party;
};

/** Who a carrier bill is addressed to. */
const carrierPartyFor = async (fleetOwnerId, fallbackName = "") => {
  const party = {
    kind: "CARRIER",
    id: fleetOwnerId || undefined,
    name: fallbackName,
    code: "",
    email: "",
    phone: "",
    address: "",
  };

  if (!fleetOwnerId || !mongoose.isValidObjectId(fleetOwnerId)) return party;

  const carrier = await FleetOwner.findById(fleetOwnerId).lean();
  if (!carrier) return party;

  const contact =
    carrier.contactPersons?.find((c) => c.isPrimary) || carrier.contactPersons?.[0];

  party.name = carrier.carrierName || fallbackName;
  party.code = carrier.fleetOwnerCode || "";
  party.email = contact?.email || "";
  party.phone = contact?.phone || carrier.phone || "";

  if (carrier.addresses?.[0]) {
    const address = await Address.findById(carrier.addresses[0]).lean();
    party.address = oneLineAddress(address);
  }

  return party;
};

/** Who a driver settlement is addressed to. */
const driverPartyFor = async (driverId, fallbackName = "") => {
  const party = {
    kind: "DRIVER",
    id: driverId || undefined,
    name: fallbackName,
    code: "",
    email: "",
    phone: "",
  };

  if (!driverId || !mongoose.isValidObjectId(driverId)) return party;

  const driver = await Driver.findById(driverId).lean();
  if (!driver) return party;

  party.name = driver.name || fallbackName;
  party.code = driver.driverCode || "";
  party.email = driver.email || "";
  party.phone = driver.phone || "";

  return party;
};

/**
 * Ledger lines in invoice shape.
 *
 * The label is resolved once, here, and stored — see the note on the schema
 * about why an invoice must not re-read the catalog when it is displayed.
 */
const toInvoiceLines = (ledgerLines = [], side) =>
  ledgerLines.map((line) => ({
    chargeType: line.chargeType,
    label: labelFor(line.chargeType, side),
    kind: CHARGE_BY_KEY.get(line.chargeType)?.kind || "accessorial",
    description: line.note || "",
    quantity: line.quantity ?? undefined,
    rate: line.rate ?? undefined,
    amount: money(line.amount),
  }));

/**
 * The next free "LD 0014-APn" for a load.
 *
 * Counted from what already exists rather than from a counter, because the
 * suffix is meaningful only within one load and a global counter would produce
 * LD 0014-AP1 and LD 0021-AP2 as the first bill on each of two loads.
 */
const nextApNumber = async (loadId) => {
  const existing = await Invoice.find({ loadId, direction: "AP" })
    .select("invoiceNumber")
    .lean();

  const used = existing
    .map((inv) => Number(String(inv.invoiceNumber).match(/-AP(\d+)$/)?.[1]))
    .filter(Number.isFinite);

  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${loadId}-AP${next}`;
};

/**
 * Re-add this invoice's live payments and re-derive its status.
 *
 * Called after any payment is recorded or reversed. Summed from the Payment
 * collection rather than incremented on the invoice, so a reversal, a correction
 * or a double-submitted form all land on the same right answer instead of
 * drifting a little further from it each time.
 */
const syncInvoicePayments = async (invoice) => {
  const payments = await Payment.find({
    invoice: invoice._id,
    reversedAt: { $exists: false },
  })
    .select("amount")
    .lean();

  invoice.amountPaid = money(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
  await invoice.save();

  return invoice;
};

/**
 * The customer invoice for a load — created if it does not exist, refreshed from
 * the ledger if it does and is still a draft.
 *
 * A sent or part-paid invoice is NOT refreshed. It is a claim on somebody who is
 * holding a copy of it, and quietly changing the amount under them is how a
 * customer pays $1,200 against a bill that now says $1,475. Staff who genuinely
 * need to re-bill void this one and raise another, which leaves both documents
 * on the record.
 */
const buildCustomerInvoice = async ({ load, user, terms, issueDate, memo }) => {
  const receivableLines = ledger.receivableLinesFor(load);

  if (!receivableLines.length) {
    throw new Error(
      "There is nothing to bill — this load has no amount and no receivable charges.",
    );
  }

  let invoice = await Invoice.findOne({ loadId: load.loadId, direction: "AR" });

  if (invoice && invoice.status === "VOID") {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} was voided. Un-void it or raise a manual invoice instead.`,
    );
  }

  if (invoice?.isFrozen()) {
    return { invoice, created: false, refreshed: false };
  }

  const [issuer, party] = await Promise.all([issuerFor(load), customerPartyFor(load)]);

  const created = !invoice;

  if (!invoice) {
    invoice = new Invoice({
      // The load number IS the invoice number. See the note at the top.
      invoiceNumber: load.loadId,
      direction: "AR",
      kind: "LOAD",
      load: load._id,
      loadId: load.loadId,
      createdBy: user?._id,
    });
  }

  invoice.party = party;
  invoice.issuer = issuer;
  invoice.shipTo = shipToFor(load);
  invoice.references = referencesFor(load);
  invoice.lines = toInvoiceLines(receivableLines, "receivable");
  invoice.currency = load.accounting?.receivables?.currency || "USD";
  if (terms) invoice.terms = terms;
  if (issueDate) invoice.issueDate = new Date(issueDate);
  if (memo !== undefined) invoice.memo = trimmed(memo);
  invoice.notes = load.accounting?.receivables?.notes || invoice.notes;
  invoice.updatedBy = user?._id;

  // Terms may have changed the window; let the hook recompute from them.
  if (terms) invoice.dueDate = undefined;

  await invoice.save();

  return { invoice, created, refreshed: !created };
};

/**
 * Group a load's payable lines by who they are owed to.
 *
 * Returns one entry per payee that has either lines or an agreed rate — a
 * carrier assigned but not yet costed produces an entry with no lines rather
 * than no entry, because a bill for $0 is the visible version of "nobody has
 * priced this leg yet" and a missing bill is the invisible version.
 */
const payableGroups = (load) => {
  const lines = ledger.payableLinesFor(load);
  const legs = load.assignments || [];

  const groups = [];

  if (legs.length) {
    legs.forEach((leg) => {
      groups.push({
        legId: leg._id,
        fleetOwnerId: leg.fleetOwnerId,
        name: leg.fleetOwnerName || "",
        agreed: leg.carrierRate ?? null,
        lines: lines.filter(
          (line) => String(line.fleetOwnerId || "") === String(leg.fleetOwnerId),
        ),
      });
    });

    // Lines nobody claimed. On a split load these are genuinely ambiguous, so
    // they go to the first leg rather than being silently dropped from the
    // books — an over-billed carrier complains, a lost cost never surfaces.
    const orphans = lines.filter(
      (line) =>
        !line.fleetOwnerId ||
        !legs.some((leg) => String(leg.fleetOwnerId) === String(line.fleetOwnerId)),
    );
    if (orphans.length && groups.length) {
      groups[0].lines = [...groups[0].lines, ...orphans];
    }
  } else if (load.assignedFleetOwner?.fleetOwnerId) {
    // Single carrier: every line is theirs, named or not.
    groups.push({
      legId: null,
      fleetOwnerId: load.assignedFleetOwner.fleetOwnerId,
      name: load.assignedFleetOwner.fleetOwnerName || "",
      agreed: load.vendorRate ?? null,
      lines,
    });
  }

  return groups;
};

/**
 * Every carrier bill on a load — created or refreshed, one per leg.
 *
 * Frozen bills are left exactly as they are and reported back as skipped, for
 * the same reason a sent customer invoice is: a carrier holding a settlement
 * statement must not find it says something different next week.
 */
const buildCarrierBills = async ({ load, user, terms }) => {
  const groups = payableGroups(load);
  if (!groups.length) return [];

  const issuer = await issuerFor(load);
  const results = [];

  for (const group of groups) {
    // One bill per leg on a split load; per carrier on a single-carrier one.
    const query = group.legId
      ? { loadId: load.loadId, direction: "AP", legId: group.legId }
      : {
          loadId: load.loadId,
          direction: "AP",
          "party.kind": "CARRIER",
          "party.id": group.fleetOwnerId,
        };

    let invoice = await Invoice.findOne(query);

    if (invoice?.status === "VOID") {
      results.push({ invoice, created: false, refreshed: false, skipped: "void" });
      continue;
    }

    if (invoice?.isFrozen()) {
      results.push({ invoice, created: false, refreshed: false, skipped: "frozen" });
      continue;
    }

    let lines = toInvoiceLines(group.lines, "payable");

    // Nothing costed but a rate was agreed on the leg: bill the agreed figure.
    // The alternative is a $0 bill on a leg everybody knows costs $900, which is
    // the number that then flows into the margin on every report.
    if (!lines.length && group.agreed) {
      lines = [
        {
          chargeType: "linehaul",
          label: labelFor("linehaul", "payable"),
          kind: "linehaul",
          description: "Agreed carrier rate for this leg",
          amount: money(group.agreed),
        },
      ];
    }

    const created = !invoice;

    if (!invoice) {
      invoice = new Invoice({
        invoiceNumber: await nextApNumber(load.loadId),
        direction: "AP",
        kind: "LOAD",
        load: load._id,
        loadId: load.loadId,
        legId: group.legId || undefined,
        createdBy: user?._id,
      });
    }

    invoice.party = await carrierPartyFor(group.fleetOwnerId, group.name);
    invoice.issuer = issuer;
    invoice.shipTo = shipToFor(load);
    invoice.references = referencesFor(load);
    invoice.lines = lines;
    invoice.currency = load.accounting?.payables?.currency || "USD";
    if (terms) {
      invoice.terms = terms;
      invoice.dueDate = undefined;
    }
    invoice.updatedBy = user?._id;

    await invoice.save();

    results.push({ invoice, created, refreshed: !created });
  }

  return results;
};

/**
 * The driver's settlement for a load, as its own bill.
 *
 * Driver pay is already computed and stored on the load by the payroll screen —
 * this only turns that one figure into a payable document so it is chased,
 * recorded and reported through exactly the same machinery as a carrier bill.
 * Two parallel ways of paying people is how one of them stops being reconciled.
 */
const buildDriverBill = async ({ load, user, terms }) => {
  const payroll = load.accounting?.payroll;
  if (!payroll?.amount) return null;

  let invoice = await Invoice.findOne({
    loadId: load.loadId,
    direction: "AP",
    "party.kind": "DRIVER",
  });

  if (invoice?.status === "VOID") return { invoice, skipped: "void" };
  if (invoice?.isFrozen()) return { invoice, created: false, skipped: "frozen" };

  const created = !invoice;

  if (!invoice) {
    invoice = new Invoice({
      invoiceNumber: await nextApNumber(load.loadId),
      direction: "AP",
      kind: "LOAD",
      load: load._id,
      loadId: load.loadId,
      createdBy: user?._id,
    });
  }

  // How the figure was arrived at, on the document. A driver querying their
  // settlement is asking about the rate, not the total.
  const basis = {
    PERCENTAGE: `${payroll.rate}% of load revenue`,
    FLAT: "Flat rate for this load",
    PER_MILE: `${payroll.miles || 0} miles @ $${payroll.rate}/mi`,
    HOURLY: `${payroll.hours || 0} hours @ $${payroll.rate}/hr`,
  }[payroll.payType] || "Driver pay for this load";

  invoice.party = await driverPartyFor(payroll.driver, payroll.driverName);
  invoice.issuer = await issuerFor(load);
  invoice.lines = [
    {
      chargeType: "linehaul",
      label: "Driver Pay",
      kind: "linehaul",
      description: [basis, payroll.note].filter(Boolean).join(" — "),
      quantity: payroll.miles || payroll.hours || undefined,
      rate: payroll.rate ?? undefined,
      amount: money(payroll.amount),
    },
  ];
  if (terms) {
    invoice.terms = terms;
    invoice.dueDate = undefined;
  }
  invoice.updatedBy = user?._id;

  await invoice.save();

  return { invoice, created, refreshed: !created };
};

/**
 * Raise everything a load owes and is owed, in one call.
 *
 * The button the office actually presses. Each side is independent: a load with
 * receivables but no carrier costed yet still produces its customer invoice, and
 * says so, rather than failing because half the picture is missing.
 */
const generateForLoad = async ({ load, user, terms, issueDate, memo, sides }) => {
  const want = sides || ["AR", "AP"];
  const out = { customerInvoice: null, carrierBills: [], driverBill: null, problems: [] };

  if (want.includes("AR")) {
    try {
      const { invoice, created, refreshed } = await buildCustomerInvoice({
        load,
        user,
        terms,
        issueDate,
        memo,
      });
      out.customerInvoice = { invoice, created, refreshed };
    } catch (error) {
      out.problems.push(error.message);
    }
  }

  if (want.includes("AP")) {
    try {
      out.carrierBills = await buildCarrierBills({ load, user, terms });
      out.driverBill = await buildDriverBill({ load, user, terms });
    } catch (error) {
      out.problems.push(error.message);
    }
  }

  return out;
};

/**
 * A load's whole financial position: both sides, what is invoiced, what is paid.
 *
 * One shape read by the load's accounting screen, the load-wise report and the
 * customer ledger, so all three agree on what "outstanding" means.
 */
const positionForLoad = async (load) => {
  const invoices = await Invoice.find({ loadId: load.loadId })
    .sort({ direction: 1, invoiceNumber: 1 })
    .lean();

  const ar = invoices.filter((i) => i.direction === "AR" && i.status !== "VOID");
  const ap = invoices.filter((i) => i.direction === "AP" && i.status !== "VOID");

  const sum = (rows, key) => money(rows.reduce((acc, r) => acc + (r[key] || 0), 0));

  // The ledger figures, for the gap between "costed" and "billed" — a load can
  // carry charges nobody has raised a document for yet, and that gap is the
  // thing the office needs to see, not something to hide by reporting one number.
  const ledgerRevenue = totalsFor(ledger.receivableLinesFor(load)).total;
  const ledgerExpense = totalsFor(ledger.payableLinesFor(load)).total;

  return {
    invoices,
    receivable: {
      ledgerTotal: ledgerRevenue,
      invoiced: sum(ar, "total"),
      paid: sum(ar, "amountPaid") + sum(ar, "advanceApplied"),
      outstanding: sum(ar, "balance"),
      uninvoiced: money(ledgerRevenue - sum(ar, "total")),
    },
    payable: {
      ledgerTotal: money(ledgerExpense + (load.accounting?.payroll?.amount || 0)),
      invoiced: sum(ap, "total"),
      paid: sum(ap, "amountPaid") + sum(ap, "advanceApplied"),
      outstanding: sum(ap, "balance"),
    },
    margin: money(sum(ar, "total") - sum(ap, "total")),
  };
};

module.exports = {
  issuerFor,
  customerPartyFor,
  carrierPartyFor,
  driverPartyFor,
  toInvoiceLines,
  payableGroups,
  nextApNumber,
  syncInvoicePayments,
  buildCustomerInvoice,
  buildCarrierBills,
  buildDriverBill,
  generateForLoad,
  positionForLoad,
  nextManualNumber: (locationId) => nextSequence("manualInvoice", locationId),
};
