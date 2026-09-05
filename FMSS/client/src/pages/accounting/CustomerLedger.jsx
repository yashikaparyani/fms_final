import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import api from "../../api";
import Swal, { notify } from "../../utils/swal";
import { uiStyles } from "../../style/uiStyles";
import {
  money,
  moneyShort,
  formatDate,
  statusOf,
  errorFrom,
  AGING_BUCKETS,
} from "../../components/accounting/invoiceUi";

// ─── Customer-wise receivables ────────────────────────────────────────────────
// Who owes us what, and for how long.
//
// ── Aging is the whole point ─────────────────────────────────────────────────
// A single "outstanding" column tells you the size of the problem and nothing
// about its shape. $40,000 spread across invoices raised last week is a healthy
// business; the same $40,000 sitting past ninety days is a write-off waiting to
// be admitted. The buckets are the difference between those two readings, so
// they are on the summary row rather than hidden a click away.
//
// ── The list, then one account ───────────────────────────────────────────────
// Two views in one screen: every customer ranked by what they owe, and — on
// click — that customer's own invoices and payments with a button to email them
// a statement. The drill-in is where the actual conversation with a customer
// happens, so it holds everything that conversation needs.
// ─────────────────────────────────────────────────────────────────────────────

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
          Lists every open invoice with its age and the total outstanding.
          Nothing is attached — it is a summary, not a demand for one invoice.
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
          <button
            onClick={emailStatement}
            disabled={sending || !ledger?.totals?.outstanding}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
          >
            <MailOutlineIcon fontSize="small" />
            {sending ? "Sending…" : "Email statement"}
          </button>
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

            <div className={uiStyles.card}>
              <p className={`${uiStyles.title} mb-3`}>Invoices</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="pb-2 pr-3 font-semibold">Invoice</th>
                      <th className="pb-2 pr-3 font-semibold">Issued</th>
                      <th className="pb-2 pr-3 font-semibold">Due</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Total</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Outstanding</th>
                      <th className="pb-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.invoices.map((invoice) => {
                      const status = statusOf(invoice);
                      return (
                        <tr
                          key={invoice._id}
                          onClick={() =>
                            navigate(`../accounting/invoices/${invoice._id}`)
                          }
                          className="cursor-pointer border-b border-hairline/60 hover:bg-accent-50"
                        >
                          <td className="py-2.5 pr-3 font-bold text-accent-700">
                            {invoice.invoiceNumber}
                          </td>
                          <td className="py-2.5 pr-3 text-ink-600">
                            {formatDate(invoice.issueDate)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={
                                invoice.daysOverdue > 0
                                  ? "font-semibold text-bad-600"
                                  : "text-ink-600"
                              }
                            >
                              {formatDate(invoice.dueDate)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {money(invoice.total)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                            {money(invoice.balance)}
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.chip}`}
                            >
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!ledger.invoices.length && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-ink-400">
                          Nothing raised for this customer yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={uiStyles.card}>
              <p className={`${uiStyles.title} mb-3`}>Payments received</p>
              {!ledger.payments.length && (
                <p className="py-6 text-center text-ink-400">Nothing recorded yet.</p>
              )}
              <div className="space-y-2">
                {ledger.payments.map((payment) => (
                  <div
                    key={payment._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline p-3 text-sm"
                  >
                    <div>
                      <p className="font-bold tabular-nums text-good-700">
                        {money(payment.amount)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {payment.paymentNumber} · against {payment.invoiceNumber}
                      </p>
                    </div>
                    <div className="text-right text-xs text-ink-500">
                      <p className="font-semibold text-ink-700">
                        {formatDate(payment.paidOn)}
                      </p>
                      <p>
                        {payment.method}
                        {payment.documentNumber ? ` · ${payment.documentNumber}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
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
            What each customer has been billed, paid and still owes
          </p>
        </div>
      </div>

      {summary && (
        <>
          <div className={uiStyles.grid4}>
            <Tile
              label="Customers"
              value={String(summary.totals.customers)}
              hint={`${summary.totals.invoices} invoices`}
            />
            <Tile label="Billed" value={moneyShort(summary.totals.billed)} />
            <Tile
              label="Received"
              value={moneyShort(summary.totals.received)}
              tone="text-good-600"
            />
            <Tile
              label="Outstanding"
              value={moneyShort(summary.totals.outstanding)}
              tone="text-warn-600"
              hint={
                summary.totals.overdueCustomers
                  ? `${summary.totals.overdueCustomers} accounts overdue`
                  : "Nothing overdue"
              }
            />
          </div>

          <div className={uiStyles.card}>
            <p className={`${uiStyles.title} mb-2`}>
              How old the outstanding money is
            </p>
            <AgingStrip aging={summary.aging} />
          </div>
        </>
      )}

      <div className={uiStyles.card}>
        <div className={uiStyles.cardHeader}>
          <p className="flex items-center gap-2 text-lg font-bold text-ink-800">
            <PeopleAltIcon fontSize="small" className="text-accent-600" />
            By customer
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="pb-2 pr-3 font-semibold">Customer</th>
                <th className="pb-2 pr-3 text-right font-semibold">Loads</th>
                <th className="pb-2 pr-3 text-right font-semibold">Billed</th>
                <th className="pb-2 pr-3 text-right font-semibold">Received</th>
                <th className="pb-2 pr-3 text-right font-semibold">Outstanding</th>
                <th className="pb-2 pr-3 font-semibold">Oldest due</th>
                <th className="pb-2 font-semibold">Aging</th>
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
                  onClick={() => openCustomer(row)}
                  className="cursor-pointer border-b border-hairline/60 hover:bg-accent-50"
                >
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-ink-800">{row.customerName}</p>
                    <p className="text-xs text-ink-400">
                      {row.invoiceCount} invoice{row.invoiceCount === 1 ? "" : "s"}
                      {row.openCount ? ` · ${row.openCount} open` : ""}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink-600">
                    {row.loadCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {money(row.billed)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-good-600">
                    {money(row.received)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                    {money(row.outstanding)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.oldestDueDate ? (
                      <span
                        className={
                          row.maxDaysOverdue > 0
                            ? "flex items-center gap-1 font-semibold text-bad-600"
                            : "text-ink-600"
                        }
                      >
                        {row.maxDaysOverdue > 0 && (
                          <WarningAmberIcon sx={{ fontSize: 13 }} />
                        )}
                        {formatDate(row.oldestDueDate)}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <div className="w-56">
                      <AgingStrip aging={row.aging} compact />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CustomerLedger;
