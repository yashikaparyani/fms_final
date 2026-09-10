import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import { money } from "../../components/accounting/ChargeEditor";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { todayKey as today, startOfMonthKey as startOfMonth } from "../../utils/dates";

// ─── The invoicing queue ──────────────────────────────────────────────────────
// The loads waiting to be billed, and the period's headline figures above them.
//
// One list, not a set of tabs. It used to carry two more — a per-load breakdown
// and a payroll run — and both have gone rather than been hidden:
//
//   Per load  is the Load Ledger, which does the same job with filters and an
//             export. Two screens answering one question means two screens to
//             keep in step, and the one nobody maintains is the one somebody
//             quotes a figure from.
//   Payroll   read a driver-pay ledger that no longer exists. A driver is now
//             paid out of a load's payables alongside the carrier — see
//             LoadAccounting — so there is nothing here for it to total.
//
// What is left is the queue. A load marked invoiceable leaves dispatch's All
// Transit tab and arrives here (see ACCOUNTING_TRANSPORT_STATUSES on the
// server), and leaves again once an invoice is raised against it. It ignores
// the date range on purpose: a load that has been waiting to be billed since
// last month is precisely the one that must not fall off the screen.
// ─────────────────────────────────────────────────────────────────────────────

// From utils/dates.js rather than built here: `new Date().toISOString()` returns
// tomorrow's date for anyone east of Greenwich in their evening, so a date range
// defaulted that way starts a day out for half the world.

const AccountingSummary = () => {
  const navigate = useNavigate();

  const [range, setRange] = useState({ from: startOfMonth(), to: today() });
  const [summary, setSummary] = useState(null);
  const [invoiceable, setInvoiceable] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, invoiceableRes] = await Promise.all([
        // Still fetched: the headline figures above the list are the period's,
        // even though the list itself is not.
        api.get("/accounting/summary", { params: range }),
        // Deliberately unranged — see the note at the top of the file.
        // `awaitingInvoice` rather than a transport status: the server drops the
        // ones already billed, which it can only know by reading the invoice
        // register. See server/services/billingState.js.
        api.get("/accounting/summary", { params: { awaitingInvoice: true } }),
      ]);
      setSummary(summaryRes.data);
      setInvoiceable(invoiceableRes.data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load the figures");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "load",
      header: "Load",
      width: "120px",
      render: (row) => (
        <button
          onClick={() => navigate(`/admin/accounting/${row.loadId}`)}
          className="text-left"
        >
          <p className="font-bold text-indigo-700 text-sm hover:underline">
            {row.loadId}
          </p>
        </button>
      ),
    },
    // Its own column rather than a second line under the load id. This list is
    // read by customer at least as often as by load — "what is outstanding on
    // Hub Intermodal" — and a value tucked under another one cannot be scanned
    // down, or sorted on, or lined up against the row above it.
    {
      key: "customer",
      header: "Customer",
      width: "180px",
      render: (row) => (
        <span className="text-sm text-gray-800">{row.customerName || "—"}</span>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      width: "110px",
      render: (row) => (
        <span className="text-sm font-semibold tabular-nums">{money(row.revenue)}</span>
      ),
    },
    {
      key: "expense",
      header: "Expense",
      width: "110px",
      render: (row) => (
        <span className="text-sm tabular-nums text-gray-700">{money(row.expense)}</span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      width: "130px",
      render: (row) => (
        <div>
          <p
            className={`text-sm font-bold tabular-nums ${
              row.margin >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {money(row.margin)}
          </p>
          <p className="text-[11px] text-gray-500">{row.marginPercent}%</p>
        </div>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      width: "110px",
      render: (row) => (
        <span
          className={`text-sm tabular-nums ${
            row.outstanding > 0 ? "text-amber-700 font-semibold" : "text-gray-400"
          }`}
        >
          {money(row.outstanding)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Invoice",
      width: "100px",
      render: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            row.paid
              ? "bg-green-100 text-green-700"
              : row.invoiced
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-200 text-gray-600"
          }`}
        >
          {row.paid ? "PAID" : row.invoiced ? "INVOICED" : "NOT BILLED"}
        </span>
      ),
    },
  ];

  const totals = summary?.totals;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Invoiced Loads</h1>
          <p className="page-subtitle">
            The loads waiting to be invoiced, and how the period has run.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              From
            </label>
            <input
              type="date"
              className={uiStyles.input}
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              To
            </label>
            <input
              type="date"
              className={uiStyles.input}
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Headline figures */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Revenue" value={totals.revenue} tone="indigo" />
          <Stat label="Expense" value={totals.expense} tone="slate" />
          <Stat
            label="Margin"
            value={totals.margin}
            tone={totals.margin >= 0 ? "green" : "red"}
            suffix={`${totals.marginPercent}% overall`}
          />
          <Stat
            label="Owed to us"
            value={totals.outstandingReceivable}
            tone="amber"
            suffix={`${totals.billedLoads} of ${totals.loads} billed`}
          />
        </div>
      )}

      <p className="text-sm text-gray-500">
        Loads dispatch has marked invoiceable. They have left All Transit and are
        waiting to be billed — the date range above does not apply here.
      </p>
      <LoadTable
        loads={invoiceable?.rows || []}
        columns={columns}
        loading={loading}
        colorBy="__none"
        pageSize={20}
        emptyMessage="Nothing waiting to be invoiced."
      />
    </div>
  );
};

const TONES = {
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
  slate: "bg-slate-50 border-slate-200 text-slate-900",
  green: "bg-green-50 border-green-200 text-green-900",
  red: "bg-red-50 border-red-200 text-red-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
};

const Stat = ({ label, value, tone, suffix }) => (
  <div className={`rounded-xl border p-3 ${TONES[tone] || TONES.slate}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
    <p className="text-xl font-bold tabular-nums mt-0.5">{money(value)}</p>
    {suffix && <p className="text-[11px] opacity-70 mt-0.5">{suffix}</p>}
  </div>
);

export default AccountingSummary;
