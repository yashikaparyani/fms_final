const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Load = require("../models/Load");
const Customer = require("../models/Customer");
const User = require("../models/User");
const mail = require("../services/accountingMailService");
const { issuerFor } = require("../services/invoiceService");
const { totalsFor, money, labelFor, CHARGE_BY_KEY } = require("../config/chargeTypes");
// Loads carrying only a base amount still have a value — see
// services/ledgerFallback.js. Reading the stored lines directly would report $0
// revenue for every load nobody has itemised.
const ledger = require("../services/ledgerFallback");
// Calendar dates and instants are filtered differently — see utils/dates.js.
const {
  calendarRange,
  instantRange,
  daysBetween,
  todayKey,
} = require("../utils/dates");

// ─── Accounting reports ───────────────────────────────────────────────────────
// The three questions the office asks about money, each answered by one
// endpoint:
//
//   Load-wise    — for this job, what comes in, what goes out, what is the gap.
//   Customer-wise— for this account, what have they been billed and what do they
//                  still owe, oldest first.
//   Aging        — across everything, how old is the money we are waiting on.
//
// ── Invoiced against costed ──────────────────────────────────────────────────
// Every figure here is reported twice over: what the ledger says a load is worth
// and what has actually been invoiced for it. They differ constantly — a
// detention charge added on Friday that nobody has re-billed yet — and reporting
// only one of them hides the gap in whichever direction the report chose.
// Revenue that has been earned but not billed is the single most common way a
// brokerage loses money it already made, so it is a column, not a footnote.
//
// ── Computed in the application, not as aggregation pipelines ────────────────
// Same reason as getSummary in accountingController: the rule that an advance is
// not revenue lives in config/chargeTypes.js, and expressing it a second time in
// Mongo's expression language would be a second copy of the one piece of
// arithmetic that must never differ between two places.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const OPEN_STATUSES = ["DRAFT", "SENT", "PARTIAL"];

/** Days past due for a lean invoice row. */
const daysOverdueOf = (invoice) => {
  if (!invoice.dueDate) return 0;
  if (invoice.status === "PAID" || invoice.status === "VOID") return 0;
  if ((invoice.balance || 0) <= 0) return 0;

  // Whole calendar days, not a millisecond division: the latter reports a day
  // short across a DST change, and it calls an invoice due later today overdue.
  const days = daysBetween(invoice.dueDate, todayKey());
  return days > 0 ? days : 0;
};

const emptyAging = () => ({
  current: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90plus: 0,
  total: 0,
});

/**
 * Drop one invoice's balance into its age bucket.
 *
 * The 30/60/90 split is the shape every finance department already reads, and
 * the point of the buckets is that they escalate differently: 1–30 is a
 * reminder, 61–90 is a phone call, 90+ is a decision about the account.
 */
const addToAging = (bucket, invoice) => {
  const balance = money(invoice.balance || 0);
  if (balance <= 0) return bucket;

  const days = daysOverdueOf(invoice);

  if (days <= 0) bucket.current = money(bucket.current + balance);
  else if (days <= 30) bucket.d1_30 = money(bucket.d1_30 + balance);
  else if (days <= 60) bucket.d31_60 = money(bucket.d31_60 + balance);
  else if (days <= 90) bucket.d61_90 = money(bucket.d61_90 + balance);
  else bucket.d90plus = money(bucket.d90plus + balance);

  bucket.total = money(bucket.total + balance);
  return bucket;
};

// Two different filters, because the two fields are different kinds of value.
//
// `issueDate` is a calendar date stored at UTC midnight, so its window is bounded
// in UTC. `createdAt` is an instant, so its window is bounded by the business day
// — a report for March run from the Newark office must not sweep in a load
// created at 8pm on 28 February, which a UTC boundary would.
//
// Both ends are inclusive: "to 31 March" means the whole of the 31st.

// ─── Load-wise ────────────────────────────────────────────────────────────────

// @desc    Every load with what it earns, what it costs and what is outstanding
// @route   GET /api/accounting/reports/loads
// @access  Private (staff, admin) — reports.view
//
// The report the user asked for by name: load by load, how much is receivable,
// how much is payable, and every additional charge on top of the base rate shown
// rather than folded into a total.
const loadWiseReport = async (req, res) => {
  try {
    const filter = {};

    const range = instantRange(req.query.from, req.query.to);
    if (range) filter.createdAt = range;

    if (req.query.transportStatus) filter.transportStatus = req.query.transportStatus;
    if (req.query.customerId && mongoose.isValidObjectId(req.query.customerId)) {
      filter.customer = req.query.customerId;
    }
    if (trimmed(req.query.loadId)) filter.loadId = trimmed(req.query.loadId);

    const loads = await Load.find(filter)
      .select(
        // vendorRate and winningBid are here because ledgerFallback derives the
        // payable side from them on a load nobody has itemised. Leaving them out
        // does not error — the field is simply absent on the lean document and
        // every such load silently reports $0 cost and a 100% margin.
        "loadId customerName customer amount vendorRate winningBid transportStatus createdAt accounting assignedFleetOwner assignments locationId refNo",
      )
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 500, 2000))
      .lean();

    // One query for every load's invoices rather than one per load — a 500-load
    // report would otherwise be 500 round trips.
    const loadIds = loads.map((l) => l.loadId).filter(Boolean);
    const invoices = await Invoice.find({ loadId: { $in: loadIds } })
      .select("loadId direction status total amountPaid advanceApplied balance dueDate invoiceNumber party")
      .lean();

    const byLoad = new Map();
    invoices.forEach((invoice) => {
      if (!byLoad.has(invoice.loadId)) byLoad.set(invoice.loadId, []);
      byLoad.get(invoice.loadId).push(invoice);
    });

    const rows = loads.map((load) => {
      const receivableLines = ledger.receivableLinesFor(load);
      const payableLines = ledger.payableLinesFor(load);
      const driverPay = load.accounting?.payroll?.amount || 0;

      const revenue = totalsFor(receivableLines);
      const expense = totalsFor(payableLines);

      const mine = (byLoad.get(load.loadId) || []).filter((i) => i.status !== "VOID");
      const ar = mine.filter((i) => i.direction === "AR");
      const ap = mine.filter((i) => i.direction === "AP");

      const sum = (rows_, key) =>
        money(rows_.reduce((acc, r) => acc + (r[key] || 0), 0));

      // Accessorials itemised. The base rate is what was quoted; everything on
      // top of it is what the job actually turned out to involve, and that is
      // the list a customer queries and an operations manager learns from.
      const additionalCharges = receivableLines
        .filter((line) => CHARGE_BY_KEY.get(line.chargeType)?.kind === "accessorial")
        .map((line) => ({
          label: labelFor(line.chargeType, "receivable"),
          amount: money(line.amount),
          note: line.note || "",
        }));

      const additionalCosts = payableLines
        .filter((line) => CHARGE_BY_KEY.get(line.chargeType)?.kind === "accessorial")
        .map((line) => ({
          label: labelFor(line.chargeType, "payable"),
          amount: money(line.amount),
          note: line.note || "",
        }));

      const totalCost = money(expense.total + driverPay);

      return {
        loadId: load.loadId,
        refNo: load.refNo || "",
        customerId: load.customer ? String(load.customer) : null,
        customerName: load.customerName || "",
        carrierName: load.assignedFleetOwner?.fleetOwnerName || "",
        carrierCount: load.assignments?.length || (load.assignedFleetOwner ? 1 : 0),
        transportStatus: load.transportStatus,
        createdAt: load.createdAt,

        receivable: {
          baseRate: revenue.linehaul,
          additionalCharges,
          additionalTotal: revenue.accessorials,
          total: revenue.total,
          advance: revenue.settled,
          invoiced: sum(ar, "total"),
          // An invoice's own advance line is money already taken, so it counts
          // as received alongside the payments recorded against the document.
          received: money(sum(ar, "amountPaid") + sum(ar, "advanceApplied")),
          outstanding: sum(ar, "balance"),
          // The gap: earned, not yet billed. See the note at the top.
          uninvoiced: money(revenue.total - sum(ar, "total")),
          invoiceNumbers: ar.map((i) => i.invoiceNumber),
        },

        payable: {
          baseRate: expense.linehaul,
          additionalCharges: additionalCosts,
          additionalTotal: expense.accessorials,
          driverPay,
          total: totalCost,
          advance: expense.settled,
          billed: sum(ap, "total"),
          paid: money(sum(ap, "amountPaid") + sum(ap, "advanceApplied")),
          outstanding: sum(ap, "balance"),
          unbilled: money(totalCost - sum(ap, "total")),
          invoiceNumbers: ap.map((i) => i.invoiceNumber),
        },

        margin: money(revenue.total - totalCost),
        marginPercent:
          revenue.total > 0
            ? money(((revenue.total - totalCost) / revenue.total) * 100)
            : 0,
      };
    });

    const sumOf = (path) =>
      money(
        rows.reduce((acc, row) => {
          const [head, tail] = path.split(".");
          return acc + (tail ? row[head]?.[tail] || 0 : row[head] || 0);
        }, 0),
      );

    const revenueTotal = sumOf("receivable.total");
    const costTotal = sumOf("payable.total");

    res.json({
      totals: {
        loads: rows.length,
        revenue: revenueTotal,
        cost: costTotal,
        margin: money(revenueTotal - costTotal),
        marginPercent:
          revenueTotal > 0
            ? money(((revenueTotal - costTotal) / revenueTotal) * 100)
            : 0,
        invoiced: sumOf("receivable.invoiced"),
        received: sumOf("receivable.received"),
        receivableOutstanding: sumOf("receivable.outstanding"),
        uninvoiced: sumOf("receivable.uninvoiced"),
        billed: sumOf("payable.billed"),
        paid: sumOf("payable.paid"),
        payableOutstanding: sumOf("payable.outstanding"),
        unbilled: sumOf("payable.unbilled"),
        driverPay: sumOf("payable.driverPay"),
      },
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Customer-wise ────────────────────────────────────────────────────────────

// @desc    Every customer with what they have been billed and what they owe
// @route   GET /api/accounting/reports/customers
// @access  Private (staff, admin) — reports.view
const customerWiseReport = async (req, res) => {
  try {
    const filter = { direction: "AR", status: { $ne: "VOID" } };

    const range = calendarRange(req.query.from, req.query.to);
    if (range) filter.issueDate = range;

    const invoices = await Invoice.find(filter)
      .select("party loadId invoiceNumber total amountPaid advanceApplied balance status issueDate dueDate")
      .lean();

    // Grouped by the party id where there is one, and by name where there is
    // not — a manual invoice raised to somebody who is not on the customer
    // master yet still belongs on this report rather than vanishing from it.
    const byCustomer = new Map();

    invoices.forEach((invoice) => {
      const key = invoice.party?.id
        ? String(invoice.party.id)
        : `name:${trimmed(invoice.party?.name).toLowerCase()}`;

      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          customerId: invoice.party?.id ? String(invoice.party.id) : null,
          customerName: invoice.party?.name || "Unnamed",
          email: invoice.party?.email || "",
          invoiceCount: 0,
          openCount: 0,
          overdueCount: 0,
          loadIds: new Set(),
          billed: 0,
          received: 0,
          outstanding: 0,
          oldestDueDate: null,
          maxDaysOverdue: 0,
          aging: emptyAging(),
        });
      }

      const row = byCustomer.get(key);
      const days = daysOverdueOf(invoice);

      row.invoiceCount += 1;
      if (invoice.loadId) row.loadIds.add(invoice.loadId);
      row.billed = money(row.billed + (invoice.total || 0));
      row.received = money(
        row.received + (invoice.amountPaid || 0) + (invoice.advanceApplied || 0),
      );

      if (OPEN_STATUSES.includes(invoice.status) && (invoice.balance || 0) > 0) {
        row.openCount += 1;
        row.outstanding = money(row.outstanding + invoice.balance);
        addToAging(row.aging, invoice);

        if (days > 0) {
          row.overdueCount += 1;
          row.maxDaysOverdue = Math.max(row.maxDaysOverdue, days);
        }

        // The oldest unpaid due date is the one worth showing on a list: it says
        // how long this account has been a problem, which a total never does.
        if (
          invoice.dueDate &&
          (!row.oldestDueDate || new Date(invoice.dueDate) < new Date(row.oldestDueDate))
        ) {
          row.oldestDueDate = invoice.dueDate;
        }
      }
    });

    const rows = [...byCustomer.values()]
      .map((row) => ({ ...row, loadCount: row.loadIds.size, loadIds: undefined }))
      .sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);

    const sum = (key) => money(rows.reduce((acc, row) => acc + (row[key] || 0), 0));

    const aging = rows.reduce(
      (acc, row) => ({
        current: money(acc.current + row.aging.current),
        d1_30: money(acc.d1_30 + row.aging.d1_30),
        d31_60: money(acc.d31_60 + row.aging.d31_60),
        d61_90: money(acc.d61_90 + row.aging.d61_90),
        d90plus: money(acc.d90plus + row.aging.d90plus),
        total: money(acc.total + row.aging.total),
      }),
      emptyAging(),
    );

    res.json({
      totals: {
        customers: rows.length,
        invoices: rows.reduce((acc, row) => acc + row.invoiceCount, 0),
        billed: sum("billed"),
        received: sum("received"),
        outstanding: sum("outstanding"),
        overdueCustomers: rows.filter((row) => row.overdueCount > 0).length,
      },
      aging,
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    One customer's whole account — invoices, payments, loads
// @route   GET /api/accounting/reports/customers/:customerId
// @access  Private (staff, admin) — reports.view
const customerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: "Not a valid customer id." });
    }

    const [user, customer] = await Promise.all([
      User.findById(customerId).lean(),
      Customer.findOne({ user: customerId }).lean(),
    ]);

    if (!user && !customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const filter = { direction: "AR", "party.id": customerId };
    const range = calendarRange(req.query.from, req.query.to);
    if (range) filter.issueDate = range;

    const invoices = await Invoice.find(filter).sort({ issueDate: -1 }).lean();

    const payments = await Payment.find({
      "party.id": customerId,
      direction: "RECEIVED",
      reversedAt: { $exists: false },
    })
      .sort({ paidOn: -1 })
      .lean();

    const live = invoices.filter((i) => i.status !== "VOID");
    const open = live.filter(
      (i) => OPEN_STATUSES.includes(i.status) && (i.balance || 0) > 0,
    );

    const aging = open.reduce((bucket, invoice) => addToAging(bucket, invoice), emptyAging());

    const sum = (rows_, key) => money(rows_.reduce((acc, r) => acc + (r[key] || 0), 0));

    res.json({
      customer: {
        _id: customerId,
        name:
          customer?.customerName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.email ||
          "",
        email: user?.email || "",
        // Where a statement or an invoice would actually be sent, so the screen
        // can show it before somebody presses send.
        billingEmail:
          customer?.emails?.accChargesEmail || customer?.contact?.email || user?.email || "",
        phone: customer?.contact?.phone || user?.phone || "",
      },
      totals: {
        invoices: live.length,
        billed: sum(live, "total"),
        received: money(sum(live, "amountPaid") + sum(live, "advanceApplied")),
        outstanding: sum(open, "balance"),
        openCount: open.length,
        overdueCount: open.filter((i) => daysOverdueOf(i) > 0).length,
      },
      aging,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        _id: String(invoice._id),
        daysOverdue: daysOverdueOf(invoice),
      })),
      payments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Email a customer their statement of account
// @route   POST /api/accounting/reports/customers/:customerId/statement
// @access  Private (staff, admin) — reports.view
const emailCustomerStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: "Not a valid customer id." });
    }

    const [user, customer] = await Promise.all([
      User.findById(customerId).lean(),
      Customer.findOne({ user: customerId }).lean(),
    ]);

    const open = await Invoice.find({
      direction: "AR",
      "party.id": customerId,
      status: { $in: OPEN_STATUSES },
      balance: { $gt: 0 },
    })
      .sort({ dueDate: 1 })
      .lean();

    if (!open.length) {
      return res.status(400).json({
        message: "This customer has nothing outstanding — there is no statement to send.",
      });
    }

    const rows = open.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      balance: invoice.balance,
      daysOverdue: daysOverdueOf(invoice),
    }));

    const aging = open.reduce((bucket, invoice) => addToAging(bucket, invoice), emptyAging());

    const to =
      trimmed(req.body.to) ||
      customer?.emails?.accChargesEmail ||
      customer?.contact?.email ||
      user?.email ||
      "";

    const status = await mail.sendStatement({
      customerName:
        customer?.customerName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        "",
      rows,
      totals: { outstanding: aging.total },
      aging,
      // The letterhead of the branch these invoices were raised under, taken
      // from the invoices themselves rather than the sender's current location.
      issuer: open[0]?.issuer || (await issuerFor({ locationId: req.locationId })),
      to,
    });

    if (!status.sent) {
      return res.status(status.reason === "NO_RECIPIENT" ? 400 : 502).json({
        message: status.message || "The statement could not be sent.",
        emailStatus: status,
      });
    }

    res.json({
      message: `Statement for ${rows.length} open invoice${rows.length === 1 ? "" : "s"} sent to ${status.to}.`,
      emailStatus: status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Aging ────────────────────────────────────────────────────────────────────

// @desc    How old the outstanding money is, both directions
// @route   GET /api/accounting/reports/aging
// @access  Private (staff, admin) — reports.view
const agingReport = async (req, res) => {
  try {
    const direction = req.query.direction === "AP" ? "AP" : "AR";

    const open = await Invoice.find({
      direction,
      status: { $in: OPEN_STATUSES },
      balance: { $gt: 0 },
    })
      .sort({ dueDate: 1 })
      .lean();

    const buckets = emptyAging();
    const byParty = new Map();

    open.forEach((invoice) => {
      addToAging(buckets, invoice);

      const key = invoice.party?.id
        ? String(invoice.party.id)
        : `name:${trimmed(invoice.party?.name).toLowerCase()}`;

      if (!byParty.has(key)) {
        byParty.set(key, {
          partyId: invoice.party?.id ? String(invoice.party.id) : null,
          partyKind: invoice.party?.kind || "",
          partyName: invoice.party?.name || "Unnamed",
          email: invoice.party?.email || "",
          count: 0,
          outstanding: 0,
          maxDaysOverdue: 0,
          aging: emptyAging(),
        });
      }

      const row = byParty.get(key);
      row.count += 1;
      row.outstanding = money(row.outstanding + invoice.balance);
      row.maxDaysOverdue = Math.max(row.maxDaysOverdue, daysOverdueOf(invoice));
      addToAging(row.aging, invoice);
    });

    res.json({
      direction,
      buckets,
      totals: {
        invoices: open.length,
        outstanding: buckets.total,
        // Anything past 60 days is the part that needs a decision rather than a
        // reminder, so it is called out rather than left to be added up by eye.
        atRisk: money(buckets.d61_90 + buckets.d90plus),
      },
      rows: [...byParty.values()].sort((a, b) => b.outstanding - a.outstanding),
      invoices: open.map((invoice) => ({
        _id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        loadId: invoice.loadId || "",
        partyName: invoice.party?.name || "",
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        total: invoice.total,
        balance: invoice.balance,
        status: invoice.status,
        daysOverdue: daysOverdueOf(invoice),
        reminderCount: invoice.reminders?.length || 0,
        lastReminderAt: invoice.reminders?.length
          ? invoice.reminders[invoice.reminders.length - 1].sentAt
          : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Carrier and driver payables ──────────────────────────────────────────────

// @desc    What each carrier and driver is owed
// @route   GET /api/accounting/reports/payees
// @access  Private (staff, admin) — reports.view
const payeeReport = async (req, res) => {
  try {
    const filter = { direction: "AP", status: { $ne: "VOID" } };

    const range = calendarRange(req.query.from, req.query.to);
    if (range) filter.issueDate = range;
    if (req.query.partyKind) filter["party.kind"] = req.query.partyKind;

    const invoices = await Invoice.find(filter)
      .select("party loadId invoiceNumber total amountPaid advanceApplied balance status dueDate")
      .lean();

    const byPayee = new Map();

    invoices.forEach((invoice) => {
      const key = invoice.party?.id
        ? String(invoice.party.id)
        : `name:${trimmed(invoice.party?.name).toLowerCase()}`;

      if (!byPayee.has(key)) {
        byPayee.set(key, {
          partyId: invoice.party?.id ? String(invoice.party.id) : null,
          partyKind: invoice.party?.kind || "CARRIER",
          partyName: invoice.party?.name || "Unnamed",
          code: invoice.party?.code || "",
          email: invoice.party?.email || "",
          billCount: 0,
          loadIds: new Set(),
          billed: 0,
          paid: 0,
          outstanding: 0,
          overdueCount: 0,
        });
      }

      const row = byPayee.get(key);
      row.billCount += 1;
      if (invoice.loadId) row.loadIds.add(invoice.loadId);
      row.billed = money(row.billed + (invoice.total || 0));
      row.paid = money(
        row.paid + (invoice.amountPaid || 0) + (invoice.advanceApplied || 0),
      );

      if (OPEN_STATUSES.includes(invoice.status) && (invoice.balance || 0) > 0) {
        row.outstanding = money(row.outstanding + invoice.balance);
        if (daysOverdueOf(invoice) > 0) row.overdueCount += 1;
      }
    });

    const rows = [...byPayee.values()]
      .map((row) => ({ ...row, loadCount: row.loadIds.size, loadIds: undefined }))
      .sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);

    const sum = (key) => money(rows.reduce((acc, row) => acc + (row[key] || 0), 0));

    res.json({
      totals: {
        payees: rows.length,
        carriers: rows.filter((row) => row.partyKind === "CARRIER").length,
        drivers: rows.filter((row) => row.partyKind === "DRIVER").length,
        billed: sum("billed"),
        paid: sum("paid"),
        outstanding: sum("outstanding"),
      },
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  loadWiseReport,
  customerWiseReport,
  customerLedger,
  emailCustomerStatement,
  agingReport,
  payeeReport,
  daysOverdueOf,
  addToAging,
  emptyAging,
};
