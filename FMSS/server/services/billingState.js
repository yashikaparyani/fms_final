const Invoice = require("../models/Invoice");
// The date a load was settled is the date the money moved, which lives on the
// payments and not on the invoice — see the note at the top of models/Payment.js
// about why one check against three invoices has nowhere to put a `paidAt`.
const Payment = require("../models/Payment");

// ─── Has this load been billed? ───────────────────────────────────────────────
// One answer to that question, read from the invoice register, for every screen
// that asks it.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// The load carries `accounting.receivables.invoicedAt` — a date somebody types
// into the ledger form on the load's own accounting screen. It predates the
// invoice module and nothing in that module writes it: raising, sending, even
// fully paying an invoice leaves it untouched. Screens that read it therefore
// reported "NOT BILLED" against loads with a sent invoice sitting in the
// register, which is the single most expensive kind of wrong an accounting
// screen can be — it is the prompt to bill a customer twice.
//
// So the invoice register is the authority, and the typed date is kept only as a
// fallback for loads billed before the register existed. Those have a date and
// no document; dropping the fallback would flip them from INVOICED back to NOT
// BILLED, which is the same error pointing the other way.
//
// ── Void invoices ────────────────────────────────────────────────────────────
// Excluded. A voided invoice is a withdrawn claim — the load is unbilled again
// and belongs back in the queue, which is the whole point of voiding one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The AR billing state of these loads, keyed by loadId.
 *
 * One query for the whole page rather than one per row: the summary screen reads
 * every load in a month, and a lookup per row is the difference between one
 * round trip and four hundred.
 *
 * Loads with no invoice raised are absent from the map rather than present with
 * a false — `has` is then the question "was this ever billed", and the caller
 * cannot mistake a missing row for a negative answer it did not ask for.
 */
const arStateFor = async (loadIds = []) => {
  const ids = [...new Set(loadIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const invoices = await Invoice.find({
    direction: "AR",
    loadId: { $in: ids },
    status: { $ne: "VOID" },
  })
    .select("loadId invoiceNumber issueDate status balance")
    .sort({ issueDate: 1 })
    .lean();

  if (!invoices.length) return new Map();

  // The settled date is the last money in, so reversed payments are excluded:
  // a bounced check is not the day the customer paid.
  const payments = await Payment.find({
    invoice: { $in: invoices.map((invoice) => invoice._id) },
    reversedAt: { $exists: false },
  })
    .select("invoice paidOn")
    .lean();

  const lastPaymentByInvoice = new Map();
  payments.forEach(({ invoice, paidOn }) => {
    const key = String(invoice);
    const current = lastPaymentByInvoice.get(key);
    if (!current || (paidOn && paidOn > current)) lastPaymentByInvoice.set(key, paidOn);
  });

  const byLoad = new Map();

  invoices.forEach((invoice) => {
    const current = byLoad.get(invoice.loadId) || {
      invoiced: true,
      // Settled only when every claim against the load is settled. A load
      // carrying a paid invoice and an unpaid manual one has not been paid for,
      // and reporting it as PAID is how the unpaid half stops being chased.
      paid: true,
      invoiceNumber: "",
      invoicedAt: null,
      paidAt: null,
      balance: 0,
      count: 0,
    };

    current.count += 1;
    current.paid = current.paid && invoice.status === "PAID";
    current.balance += Number(invoice.balance || 0);

    // The latest of them: the load is settled on the day its last bill was.
    const settledOn = lastPaymentByInvoice.get(String(invoice._id)) || null;
    if (settledOn && (!current.paidAt || settledOn > current.paidAt)) {
      current.paidAt = settledOn;
    }

    // The first invoice raised names the load — a later manual one is an
    // addition to the bill, not a replacement for its number.
    if (!current.invoiceNumber) {
      current.invoiceNumber = invoice.invoiceNumber || "";
      current.invoicedAt = invoice.issueDate || null;
    }

    byLoad.set(invoice.loadId, current);
  });

  return byLoad;
};

/**
 * One load's billing state: the register's answer, or the typed date if the
 * register has never heard of this load.
 *
 * `raised` says which of the two answered, so a caller that needs to know
 * whether a real document exists — rather than merely that somebody once dated
 * the ledger — can still tell them apart.
 */
const stateOf = (load, byLoad) => {
  const registered = byLoad.get(load?.loadId);
  if (registered) return { ...registered, raised: true };

  const legacy = load?.accounting?.receivables || {};

  return {
    invoiced: !!legacy.invoicedAt,
    paid: !!legacy.paidAt,
    invoiceNumber: legacy.invoiceNumber || "",
    invoicedAt: legacy.invoicedAt || null,
    paidAt: legacy.paidAt || null,
    balance: 0,
    count: 0,
    raised: false,
  };
};

/**
 * Both of the above in one call, for the common case: a list of loads in, the
 * same list of states out, in the same order.
 */
const statesForLoads = async (loads = []) => {
  const byLoad = await arStateFor(loads.map((load) => load?.loadId));
  return loads.map((load) => stateOf(load, byLoad));
};

module.exports = { arStateFor, stateOf, statesForLoads };
