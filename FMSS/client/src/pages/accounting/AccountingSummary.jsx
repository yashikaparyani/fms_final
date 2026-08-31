import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import { money } from "../../components/accounting/ChargeEditor";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── Financial summary ────────────────────────────────────────────────────────
// Revenue against expense across loads, and what each driver is owed.
//
// Three tabs rather than three screens, because they answer the same question
// from three directions — "what still has to be billed", "did this period make
// money" and "who do we still have to pay" — and an accountant closing a month
// looks at all of them.
//
// The first of those is the queue. A load marked invoiceable leaves dispatch's
// All Transit tab and arrives here (see ACCOUNTING_TRANSPORT_STATUSES in
// server/controllers/loadController.js); it is the only tab that ignores the
// date range, because a load that has been waiting to be billed since last month
// is precisely the one that must not fall off the screen.
// ─────────────────────────────────────────────────────────────────────────────

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

const AccountingSummary = () => {
  const navigate = useNavigate();

  const [tab, setTab] = useState("invoiceable");
  const [range, setRange] = useState({ from: startOfMonth(), to: today() });
  const [summary, setSummary] = useState(null);
  const [invoiceable, setInvoiceable] = useState(null);
  const [payroll, setPayroll] = useState(null);
  const [unsettledOnly, setUnsettledOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, invoiceableRes, payrollRes] = await Promise.all([
        api.get("/accounting/summary", { params: range }),
        // Deliberately unranged — see the note at the top of the file.
        api.get("/accounting/summary", {
          params: { transportStatus: "INVOICED" },
        }),
        api.get("/accounting/payroll", { params: { ...range, unsettledOnly } }),
      ]);
      setSummary(summaryRes.data);
      setInvoiceable(invoiceableRes.data);
      setPayroll(payrollRes.data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load the figures");
    } finally {
      setLoading(false);
    }
  }, [range, unsettledOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "load",
      header: "Load",
      render: (row) => (
        <button
          onClick={() => navigate(`/admin/accounting/${row.loadId}`)}
          className="text-left"
        >
          <p className="font-bold text-indigo-700 text-sm hover:underline">
            {row.loadId}
          </p>
          <p className="text-xs text-gray-500">{row.customerName || "—"}</p>
        </button>
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
      key: "driverPay",
      header: "Driver pay",
      width: "100px",
      render: (row) => (
        <span className="text-sm tabular-nums text-gray-700">{money(row.driverPay)}</span>
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
          <h1 className="page-title">Accounting</h1>
          <p className="page-subtitle">
            Revenue against expense per load, and what each driver is owed.
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          <Stat
            label="Driver pay"
            value={totals.driverPay}
            tone="slate"
            suffix={payroll ? `${money(payroll.totals.unsettled)} unsettled` : ""}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          {
            key: "invoiceable",
            label: "Awaiting invoice",
            icon: ReceiptLongOutlinedIcon,
            count: invoiceable?.rows?.length || 0,
          },
          { key: "loads", label: "Per load", icon: AssessmentOutlinedIcon },
          { key: "payroll", label: "Payroll", icon: BadgeOutlinedIcon },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon fontSize="small" /> {label}
            {count > 0 && (
              <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "invoiceable" ? (
        <>
          <p className="text-sm text-gray-500">
            Loads dispatch has marked invoiceable. They have left All Transit and
            are waiting to be billed — the date range above does not apply here.
          </p>
          <LoadTable
            loads={invoiceable?.rows || []}
            columns={columns}
            loading={loading}
            colorBy="__none"
            pageSize={20}
            emptyMessage="Nothing waiting to be invoiced."
          />
        </>
      ) : tab === "loads" ? (
        <LoadTable
          loads={summary?.rows || []}
          columns={columns}
          loading={loading}
          colorBy="__none"
          pageSize={20}
          emptyMessage="No loads in this period."
        />
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={unsettledOnly}
              onChange={(e) => setUnsettledOnly(e.target.checked)}
            />
            Only show pay that has not been settled
          </label>

          {loading ? (
            <p className="text-center text-gray-400 py-16 text-sm">Loading…</p>
          ) : payroll?.drivers?.length ? (
            <div className="space-y-3">
              {payroll.drivers.map((driver) => (
                <div key={driver.driverName} className={uiStyles.card}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {driver.driverName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {driver.loads.length} load
                        {driver.loads.length === 1 ? "" : "s"} in this period
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900 tabular-nums">
                        {money(driver.total)}
                      </p>
                      {driver.unsettled > 0 && (
                        <p className="text-xs text-amber-700 font-medium">
                          {money(driver.unsettled)} unsettled
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {driver.loads.map((row) => (
                      <div
                        key={row.loadId}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs border border-gray-200 rounded px-2.5 py-1.5"
                      >
                        <button
                          onClick={() => navigate(`/admin/accounting/${row.loadId}`)}
                          className="font-semibold text-indigo-700 hover:underline"
                        >
                          {row.loadId}
                        </button>
                        <span className="text-gray-500 flex-1 min-w-[8rem]">
                          {row.customerName}
                        </span>
                        <span className="text-gray-600">
                          {row.payType === "PERCENTAGE"
                            ? `${row.rate}%`
                            : row.payType === "PER_MILE"
                              ? `${row.miles} mi × $${row.rate}`
                              : row.payType === "HOURLY"
                                ? `${row.hours} h × $${row.rate}`
                                : "Flat"}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {money(row.amount)}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            row.settledAt
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.settledAt ? "SETTLED" : "DUE"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={uiStyles.card}>
              <p className="text-sm text-gray-600">
                No driver pay recorded in this period. Set it from a load's
                accounting screen.
              </p>
            </div>
          )}
        </>
      )}
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
