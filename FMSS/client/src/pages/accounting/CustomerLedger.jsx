import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PaymentsIcon from "@mui/icons-material/Payments";
import api from "../../api";
import Swal, { notify } from "../../utils/swal";
import ReceivePaymentDialog from "../../components/accounting/ReceivePaymentDialog";
import PaymentHistory from "../../components/accounting/PaymentHistory";
import { uiStyles } from "../../style/uiStyles";
import {
  money,
  moneyShort,
  formatDate,
  errorFrom,
  AGING_BUCKETS,
} from "../../components/accounting/invoiceUi";

// ─── A/R Aging Summary ────────────────────────────────────────────────────────
// Who owes us what, and for how long — laid out as the aging summary every
// bookkeeper already knows, because they do.
//
// ── Why it looks like QuickBooks ─────────────────────────────────────────────
// This report is not read for pleasure. It is read next to the same report from
// somewhere else, printed for an owner, or worked through on a call with a
// customer, and the person doing it has read a thousand of them in exactly this
// shape: name down the left, age across the top, total on the right, a rule
// above the bottom line. Matching that shape is not decoration — it is what
// lets somebody scan it without being taught the layout first.
//
// So: a zero shows as an empty cell rather than $0.00, because a page of
// $0.00 is a page you have to read rather than glance at. The bottom row is the
// only bold one. The company name and the as-of date sit on top because the
// thing gets printed and has to say what it is a picture of, and of what day.
//
// ── Aging is the whole point ─────────────────────────────────────────────────
// A single "outstanding" column tells you the size of the problem and nothing
// about its shape. $40,000 spread across invoices raised last week is a healthy
// business; the same $40,000 sitting past ninety days is a write-off waiting to
// be admitted.
//
// ── The summary, then one account ────────────────────────────────────────────
// Clicking a customer's total opens their loads: every one they have been
// billed for, with its due date and what is still open on it. That is the drill
// somebody does mid-call when a customer says "which ones?", so it holds
// exactly the columns needed to answer that and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

/** A figure in an aging cell, or nothing at all when there is nothing to say. */
const Cell = ({ value, bold }) => (
  <td
    className={`py-1.5 pl-3 text-right tabular-nums ${
      bold ? "font-bold text-ink-900" : "text-ink-700"
    }`}
  >
    {Number(value) ? money(value) : ""}
  </td>
);

// Left to right, oldest last — the order every aging report is read in.
const AGING_COLUMNS = [
  { key: "current", label: "CURRENT" },
  { key: "d1_30", label: "1 - 30" },
  { key: "d31_60", label: "31 - 60" },
  { key: "d61_90", label: "61 - 90" },
  { key: "d90plus", label: "91 AND OVER" },
];

const Tile = ({ label, value, tone = "text-ink-800", hint }) => (
  <div className={uiStyles.card}>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
  </div>
);

/** The aging buckets as one strip of figures. */
const AgingStrip = ({ aging, compact = false }) => (
  <div className={`grid grid-cols-5 gap-2 ${compact ? "" : "mt-1"}`}>
    {AGING_BUCKETS.map((bucket) => (
      <div key={bucket.key} className={compact ? "" : "rounded-lg bg-ink-50 p-2"}>
        <p className="text-[10px] uppercase tracking-wide text-ink-400">{bucket.label}</p>
        <p className={`text-sm font-bold tabular-nums ${bucket.tone}`}>
          {moneyShort(aging?.[bucket.key])}
        </p>
      </div>
    ))}
  </div>
);

const CustomerLedger = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  // Bumped when money is recorded, so a search already on screen re-runs and
  // the payment somebody just entered is in it.
  const [paymentsKey, setPaymentsKey] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/accounting/reports/customers");
      setSummary(data);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load the customer report"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const openCustomer = async (row) => {
    if (!row.customerId) {
      // A manual invoice raised to somebody who is not on the customer master
      // has nothing to drill into. Saying so beats a spinner that never resolves.
      return notify.info(
        `${row.customerName} is not on the customer master — their invoices are on the register.`,
      );
    }

    setSelected(row);
    setLedger(null);

    try {
      const { data } = await api.get(`/accounting/reports/customers/${row.customerId}`);
      setLedger(data);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load that account"));
      setSelected(null);
    }
  };

  const emailStatement = async () => {
    const { value, isConfirmed } = await Swal.fire({
      title: "Email a statement",
      html: `
        <p style="font-size:13px;color:#6b7280;text-align:left;">
          Lists every open invoice with its age and the total outstanding, and
          attaches the same list as an Excel file they can sort, tick off and
          total. It is a summary of the account, not a demand for one invoice.
        </p>
      `,
      input: "email",
      inputValue: ledger?.customer?.billingEmail || "",
      showCancelButton: true,
      confirmButtonText: "Send statement",
      confirmButtonColor: "#1d4ed8",
      inputValidator: (v) => (!v ? "An email address is needed." : undefined),
    });

    if (!isConfirmed) return;

    try {
      setSending(true);
      const { data } = await api.post(
        `/accounting/reports/customers/${selected.customerId}/statement`,
        { to: value },
      );
      notify.success(data.message);
    } catch (err) {
      notify.error(errorFrom(err, "Could not send the statement"));
    } finally {
      setSending(false);
    }
  };

  // ── One customer's account ──────────────────────────────────────────────────
  if (selected) {
    return (
      <div className={uiStyles.page}>
        <button
          onClick={() => {
            setSelected(null);
            setLedger(null);
          }}
          className="flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-800"
        >
          <ArrowBackIcon fontSize="small" /> All customers
        </button>

        <div className={uiStyles.pageHeader}>
          <div>
            <h1 className={uiStyles.pageHeaderTitle}>
              {ledger?.customer?.name || selected.customerName}
            </h1>
            <p className={uiStyles.pageHeaderSubtitle}>
              {ledger?.customer?.billingEmail || "No billing email on file"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* One payment, however many loads it covers — see
                ReceivePaymentDialog. */}
            <button
              onClick={() => setReceiving(true)}
              disabled={!ledger?.totals?.outstanding}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
            >
              <PaymentsIcon fontSize="small" />
              Receive payment
            </button>
            <button
              onClick={emailStatement}
              disabled={sending || !ledger?.totals?.outstanding}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
            >
              <MailOutlineIcon fontSize="small" />
              {sending ? "Sending…" : "Email statement"}
            </button>
          </div>
        </div>

        {!ledger && <p className="p-10 text-center text-ink-400">Loading the account…</p>}

        {ledger && (
          <>
            <div className={uiStyles.grid4}>
              <Tile
                label="Billed"
                value={moneyShort(ledger.totals.billed)}
                hint={`${ledger.totals.invoices} invoices`}
              />
              <Tile
                label="Received"
                value={moneyShort(ledger.totals.received)}
                tone="text-good-600"
                // Credit is never netted off what they owe — see the note in
                // accountingReportsController. It is said here, next to the
                // money it came in with, because an advance nobody knows about
                // is an advance that never gets applied to their next load.
                hint={
                  ledger.totals.credit > 0
                    ? `${money(ledger.totals.credit)} held as advance`
                    : undefined
                }
              />
              <Tile
                label="Outstanding"
                value={moneyShort(ledger.totals.outstanding)}
                tone="text-warn-600"
                hint={`${ledger.totals.openCount} open`}
              />
              <Tile
                label="Overdue"
                value={String(ledger.totals.overdueCount)}
                tone={ledger.totals.overdueCount ? "text-bad-600" : "text-good-600"}
                hint={ledger.totals.overdueCount ? "invoices past due" : "nothing late"}
              />
            </div>

            <div className={uiStyles.card}>
              <p className={`${uiStyles.title} mb-2`}>How old the outstanding money is</p>
              <AgingStrip aging={ledger.aging} />
            </div>

            {/* ── This customer's loads ─────────────────────────────────
                Opened from their total on the summary, which is the moment
                somebody is asking "which ones?". One row per load billed, with
                what is still open on it — the six columns that answer the
                question and nothing that does not. */}
            <div className={uiStyles.card}>
              <p className={`${uiStyles.title} mb-3`}>Loads billed</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-300 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Load #</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Due date</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pl-3 text-right">Open balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledger.invoices.length && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-ink-400">
                          Nothing has been billed to this customer yet.
                        </td>
                      </tr>
                    )}

                    {ledger.invoices.map((invoice) => (
                      <tr
                        key={invoice._id}
                        onClick={() => navigate(`../accounting/invoices/${invoice._id}`)}
                        className="cursor-pointer border-b border-hairline/60 hover:bg-accent-50"
                      >
                        <td className="py-2 pr-3 text-ink-600">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="py-2 pr-3 font-bold text-accent-700">
                          {/* A manual invoice has no load behind it, so it says
                              so rather than showing an empty cell somebody has
                              to interpret. */}
                          {invoice.loadId || (
                            <span className="font-normal text-ink-400">
                              {invoice.invoiceNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-ink-700">
                          {ledger.customer?.name || selected.customerName}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={
                              invoice.daysOverdue > 0
                                ? "font-semibold text-bad-600"
                                : "text-ink-600"
                            }
                          >
                            {formatDate(invoice.dueDate)}
                            {invoice.daysOverdue > 0 ? ` · ${invoice.daysOverdue}d` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-700">
                          {money(invoice.total)}
                        </td>
                        <td className="py-2 pl-3 text-right font-bold tabular-nums">
                          {/* Settled loads read as blank rather than $0.00, so
                              the column scans as "what is still owed". */}
                          {Number(invoice.balance) ? (
                            money(invoice.balance)
                          ) : Number(invoice.overpaid) ? (
                            <span className="font-semibold text-accent-700">
                              {money(invoice.overpaid)} advance
                            </span>
                          ) : (
                            <span className="font-normal text-ink-300">Paid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {ledger.invoices.length ? (
                    <tfoot>
                      <tr className="border-t-2 border-ink-400">
                        <td className="py-2 pr-3 font-bold uppercase text-ink-900" colSpan={4}>
                          Total
                        </td>
                        <td className="py-2 pr-3 text-right font-bold tabular-nums text-ink-900">
                          {money(ledger.totals.billed)}
                        </td>
                        <td className="py-2 pl-3 text-right font-bold tabular-nums text-ink-900">
                          {money(ledger.totals.outstanding)}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>

            <PaymentHistory
              partyId={selected.customerId}
              refreshKey={paymentsKey}
            />
          </>
        )}

        <ReceivePaymentDialog
          open={receiving}
          customerName={ledger?.customer?.name || selected.customerName}
          invoices={ledger?.invoices || []}
          onClose={() => setReceiving(false)}
          onRecorded={async () => {
            setPaymentsKey((n) => n + 1);
            // Both views move: the account's own totals, and this customer's row
            // on the aging summary behind it.
            await openCustomer(selected);
            await loadSummary();
          }}
        />
      </div>
    );
  }

  // ── Every customer ──────────────────────────────────────────────────────────
  return (
    <div className={uiStyles.page}>
      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>Customer accounts</h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            What each customer still owes, and how old it is — click a total to
            see their loads
          </p>
        </div>
      </div>

      <div className={uiStyles.card}>
        {/* The report's own letterhead. It is printed and filed, so it says
            whose it is and which day it is true of. */}
        <div className="border-b border-hairline pb-4 text-center">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-ink-900">
            {summary?.issuer?.name || "—"}
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-ink-600">
            A/R Aging Summary Report
          </p>
          <p className="text-xs text-ink-500">
            As of {summary?.asOf ? formatDate(summary.asOf) : "—"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-300 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                <th className="py-2 pr-3 text-left" />
                {AGING_COLUMNS.map((column) => (
                  <th key={column.key} className="py-2 pl-3 text-right whitespace-nowrap">
                    {column.label}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-400">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && !summary?.rows?.length && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-ink-400">
                    No customer invoices have been raised yet.
                  </td>
                </tr>
              )}

              {(summary?.rows || []).map((row) => (
                <tr
                  key={row.customerId || row.customerName}
                  className="border-b border-hairline/50 hover:bg-accent-50/60"
                >
                  <td className="py-1.5 pr-3 pl-2 text-ink-800">{row.customerName}</td>

                  {AGING_COLUMNS.map((column) => (
                    <Cell key={column.key} value={row.aging?.[column.key]} />
                  ))}

                  {/* The total is the way in. A customer asking "which ones?"
                      is answered by their loads, and this is the figure the
                      question is about. */}
                  <td className="py-1.5 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => openCustomer(row)}
                      className="font-semibold tabular-nums text-accent-700 hover:underline"
                      title={`Show ${row.customerName}'s loads`}
                    >
                      {money(row.aging?.total || row.outstanding)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {!loading && summary?.rows?.length ? (
              <tfoot>
                <tr className="border-t-2 border-ink-400 text-[13px]">
                  <td className="py-2 pr-3 pl-2 font-bold uppercase text-ink-900">
                    Total
                  </td>
                  {AGING_COLUMNS.map((column) => (
                    <Cell key={column.key} value={summary.aging?.[column.key]} bold />
                  ))}
                  <Cell value={summary.aging?.total} bold />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {summary?.asOf && (
          <p className="border-t border-hairline pt-3 text-right text-[11px] text-ink-400">
            {new Date(summary.asOf).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default CustomerLedger;
