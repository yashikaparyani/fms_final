import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import api from "../../api";
import ChargeEditor, { money } from "../../components/accounting/ChargeEditor";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── A load's books ───────────────────────────────────────────────────────────
// Receivables against payables, with the margin between them and the driver's
// pay for the run.
//
// Back-office only, and deliberately not reachable by a customer or a carrier:
// the margin between what was billed and what was paid is the brokerage's
// business. That is enforced on the server — there is no filtered version of
// this endpoint for other roles, only no endpoint at all.
// ─────────────────────────────────────────────────────────────────────────────

const PAY_TYPES = [
  { value: "PERCENTAGE", label: "Percentage of revenue", unit: "%" },
  { value: "FLAT", label: "Flat rate per load", unit: "$" },
  { value: "PER_MILE", label: "Per mile", unit: "$/mi" },
  { value: "HOURLY", label: "Hourly", unit: "$/hr" },
];

const LoadAccounting = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [invoice, setInvoice] = useState({ invoiceNumber: "", invoicedAt: "", dueDate: "", paidAt: "" });

  const [drivers, setDrivers] = useState([]);
  const [payroll, setPayroll] = useState({
    driver: "",
    payType: "",
    rate: "",
    miles: "",
    hours: "",
    note: "",
  });
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    try {
      const [catalogRes, dataRes] = await Promise.all([
        api.get("/accounting/catalog"),
        api.get(`/accounting/loads/${loadId}`),
      ]);

      setCatalog(catalogRes.data);
      setData(dataRes.data);
      setReceivables(dataRes.data.receivables.lines);
      setPayables(dataRes.data.payables.lines);
      setInvoice({
        invoiceNumber: dataRes.data.receivables.invoiceNumber || "",
        invoicedAt: dataRes.data.receivables.invoicedAt?.slice(0, 10) || "",
        dueDate: dataRes.data.receivables.dueDate?.slice(0, 10) || "",
        paidAt: dataRes.data.receivables.paidAt?.slice(0, 10) || "",
      });

      if (dataRes.data.payroll) {
        setPayroll({
          driver: dataRes.data.payroll.driver || "",
          payType: dataRes.data.payroll.payType || "",
          rate: dataRes.data.payroll.rate ?? "",
          miles: dataRes.data.payroll.miles ?? "",
          hours: dataRes.data.payroll.hours ?? "",
          note: dataRes.data.payroll.note || "",
        });
      }
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load the accounting");
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/drivers")
      .then(({ data: rows }) => setDrivers(rows))
      .catch(() => {
        /* the driver picker is a convenience — the pay can still be typed in */
      });
  }, []);

  const saveSide = async (side) => {
    const lines = side === "receivable" ? receivables : payables;

    try {
      setSaving(true);
      const { data: saved } = await api.put(
        `/accounting/loads/${loadId}/${side === "receivable" ? "receivables" : "payables"}`,
        side === "receivable" ? { lines, ...invoice } : { lines },
      );
      setData(saved.accounting);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // Previewed before it is committed: a percentage driver's pay moves whenever
  // the receivables move, and showing the figure first is what stops somebody
  // saving a number they have not looked at.
  const runPreview = async () => {
    try {
      const { data: result } = await api.post(
        `/accounting/loads/${loadId}/payroll/preview`,
        payroll,
      );
      setPreview(result);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not work that out");
    }
  };

  const savePayroll = async () => {
    try {
      setSaving(true);
      const { data: saved } = await api.put(
        `/accounting/loads/${loadId}/payroll`,
        payroll,
      );
      setData(saved.accounting);
      setPreview(null);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save the driver pay");
    } finally {
      setSaving(false);
    }
  };

  const toggleSettled = async () => {
    try {
      const { data: saved } = await api.put(
        `/accounting/loads/${loadId}/payroll/settle`,
        { settledAt: data.payroll?.settledAt ? null : new Date().toISOString() },
      );
      setData(saved.accounting);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update");
    }
  };

  if (loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  if (!data || !catalog) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-600">This load's accounting could not be loaded.</p>
      </div>
    );
  }

  const selectedPayType = PAY_TYPES.find((p) => p.value === payroll.payType);
  const profitable = data.profit.margin >= 0;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-1"
          >
            <ArrowBackIcon style={{ fontSize: 14 }} /> Back
          </button>
          <h1 className="page-title">Accounting · {data.loadId}</h1>
          <p className="page-subtitle">
            {[data.customerName, data.carrierName].filter(Boolean).join(" → ") || "—"}
          </p>
        </div>
      </div>

      {/* ── The answer, first ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Revenue" value={data.profit.revenue.total} tone="indigo" />
        <Stat label="Expense" value={data.profit.expense.total} tone="slate" />
        <Stat
          label="Margin"
          value={data.profit.margin}
          tone={profitable ? "green" : "red"}
          icon={profitable ? TrendingUpIcon : TrendingDownIcon}
          suffix={`${data.profit.marginPercent}%`}
        />
        <Stat label="Driver pay" value={data.payroll?.amount || 0} tone="amber" />
      </div>

      {/* ── Receivables ────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-1">
          <ReceiptLongIcon className="text-indigo-600" fontSize="small" />
          <h2 className="text-base font-semibold text-gray-900">Receivables</h2>
          <span className="text-xs text-gray-500">— what the customer is billed</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          The total here is the load's base amount; changing it updates the figure
          on every other screen.
        </p>

        <ChargeEditor
          side="receivable"
          charges={catalog.receivable}
          lines={receivables}
          onChange={setReceivables}
          disabled={saving}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-200">
          {[
            { key: "invoiceNumber", label: "Invoice #", type: "text" },
            { key: "invoicedAt", label: "Invoiced", type: "date" },
            { key: "dueDate", label: "Due", type: "date" },
            { key: "paidAt", label: "Paid", type: "date" },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                {f.label}
              </label>
              <input
                type={f.type}
                className={uiStyles.input}
                value={invoice[f.key]}
                onChange={(e) => setInvoice((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => saveSide("receivable")}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save receivables"}
          </button>
        </div>
      </div>

      {/* ── Payables ───────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-1">
          <PaymentsIcon className="text-slate-600" fontSize="small" />
          <h2 className="text-base font-semibold text-gray-900">Payables</h2>
          <span className="text-xs text-gray-500">
            — what the carrier and vendors are paid
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Never shown to the customer. The gap between this and the receivables is
          the margin above.
        </p>

        <ChargeEditor
          side="payable"
          charges={catalog.payable}
          lines={payables}
          onChange={setPayables}
          disabled={saving}
        />

        <div className="flex justify-end mt-4">
          <button
            onClick={() => saveSide("payable")}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save payables"}
          </button>
        </div>
      </div>

      {/* ── Payroll ────────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-1">
          <BadgeOutlinedIcon className="text-amber-600" fontSize="small" />
          <h2 className="text-base font-semibold text-gray-900">Driver pay</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Worked out from the driver's own rate. The figure is stored on the load,
          so changing a driver's rate later never rewrites what they were already
          paid.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              Driver
            </label>
            <select
              className={uiStyles.select}
              value={payroll.driver}
              onChange={(e) => {
                const driver = drivers.find((d) => d._id === e.target.value);
                setPayroll((s) => ({
                  ...s,
                  driver: e.target.value,
                  // Their standing rate fills in, and stays editable — a one-off
                  // arrangement on one load should not mean editing their record.
                  payType: driver?.payType || s.payType,
                  rate: driver?.payRate ?? s.rate,
                }));
                setPreview(null);
              }}
            >
              <option value="">Choose a driver…</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                  {d.driverCode ? ` · ${d.driverCode}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              Pay type
            </label>
            <select
              className={uiStyles.select}
              value={payroll.payType}
              onChange={(e) => {
                setPayroll((s) => ({ ...s, payType: e.target.value }));
                setPreview(null);
              }}
            >
              <option value="">Choose…</option>
              {PAY_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              Rate {selectedPayType ? `(${selectedPayType.unit})` : ""}
            </label>
            <input
              type="number"
              step="0.01"
              className={uiStyles.input}
              value={payroll.rate}
              onChange={(e) => {
                setPayroll((s) => ({ ...s, rate: e.target.value }));
                setPreview(null);
              }}
            />
          </div>

          {payroll.payType === "PER_MILE" && (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                Miles
              </label>
              <input
                type="number"
                className={uiStyles.input}
                value={payroll.miles}
                onChange={(e) => {
                  setPayroll((s) => ({ ...s, miles: e.target.value }));
                  setPreview(null);
                }}
              />
            </div>
          )}

          {payroll.payType === "HOURLY" && (
            <div>
              <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                Hours
              </label>
              <input
                type="number"
                step="0.25"
                className={uiStyles.input}
                value={payroll.hours}
                onChange={(e) => {
                  setPayroll((s) => ({ ...s, hours: e.target.value }));
                  setPreview(null);
                }}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-gray-600 block mb-1">
              Note
            </label>
            <input
              className={uiStyles.input}
              value={payroll.note}
              onChange={(e) => setPayroll((s) => ({ ...s, note: e.target.value }))}
            />
          </div>
        </div>

        {preview && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-900">
              {preview.payType === "PERCENTAGE"
                ? `${preview.rate}% of ${money(preview.revenueTotal)} revenue`
                : selectedPayType?.label}{" "}
              = <span className="font-bold">{money(preview.amount)}</span>
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <div>
            {data.payroll?.amount ? (
              <p className="text-xs text-gray-600">
                Currently {money(data.payroll.amount)} for{" "}
                {data.payroll.driverName || "the driver"}
                {data.payroll.settledAt ? " · settled" : " · not settled"}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {data.payroll?.amount > 0 && (
              <button onClick={toggleSettled} className="btn-secondary">
                {data.payroll.settledAt ? "Reopen" : "Mark settled"}
              </button>
            )}
            <button onClick={runPreview} className="btn-secondary">
              Work it out
            </button>
            <button onClick={savePayroll} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save driver pay"}
            </button>
          </div>
        </div>
      </div>
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

const Stat = ({ label, value, tone, icon: Icon, suffix }) => (
  <div className={`rounded-xl border p-3 ${TONES[tone] || TONES.slate}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
    <p className="text-xl font-bold tabular-nums mt-0.5 flex items-center gap-1">
      {Icon && <Icon style={{ fontSize: 18 }} />}
      {money(value)}
    </p>
    {suffix && <p className="text-[11px] opacity-70">{suffix}</p>}
  </div>
);

export default LoadAccounting;
