import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import PaidIcon from "@mui/icons-material/Paid";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import Swal from "sweetalert2";
import { usePermissions } from "../../hooks/usePermissions";

// ─── Report centre ────────────────────────────────────────────────────────────
// One screen for every report, driven entirely by the catalog the server serves.
//
// Generic rather than eighteen hand-built pages: the reports differ only in which
// columns they show and which filters they accept, both of which the catalog
// already describes. So filtering, totals, grouping and export are written once
// and behave identically — and a report added on the server appears here with no
// frontend change at all.
// ─────────────────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const fmt = (value, type) => {
  if (value === null || value === undefined || value === "") return "—";

  switch (type) {
    case "money":
      return `$${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${Number(value)}%`;
    case "date":
      return new Date(value).toLocaleDateString("en-US");
    case "datetime":
      return new Date(value).toLocaleString("en-US");
    case "number":
      return Number(value).toLocaleString("en-US");
    default:
      return String(value);
  }
};

const ReportCentre = () => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canExport = can("reports.export");

  const [catalog, setCatalog] = useState(null);
  const [active, setActive] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    from: startOfMonth(),
    to: today(),
    customer: "",
    carrier: "",
    driver: "",
    shippingLine: "",
    status: "",
    invoiceState: "",
    settledState: "",
  });

  // Filter option sources, fetched once and reused across every report.
  const [options, setOptions] = useState({
    customers: [],
    carriers: [],
    drivers: [],
    shippingLines: [],
  });

  useEffect(() => {
    api
      .get("/reports/catalog")
      .then(({ data }) => {
        setCatalog(data);
        setActive(data.reports[0]?.key || null);
      })
      .catch((err) =>
        notify.error(err.response?.data?.message || "Could not load the reports"),
      );

    Promise.allSettled([
      api.get("/customers"),
      api.get("/fleet-owners"),
      api.get("/drivers"),
      api.get("/shipping-lines"),
    ]).then(([customers, carriers, drivers, lines]) => {
      const rows = (result) =>
        result.status === "fulfilled"
          ? Array.isArray(result.value.data)
            ? result.value.data
            : result.value.data?.data || []
          : [];

      setOptions({
        customers: rows(customers),
        carriers: rows(carriers),
        drivers: rows(drivers),
        shippingLines: rows(lines),
      });
    });
  }, []);

  const definition = useMemo(
    () => catalog?.reports.find((r) => r.key === active) || null,
    [catalog, active],
  );

  const queryFor = useCallback(() => {
    const accepted = definition?.filters || [];
    // The dates on the pickers are calendar days in the reader's zone. Sent so
    // the server resolves the boundaries the same way — without it a report run
    // in Los Angeles would be cut on UTC midnight.
    const params = {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };

    if (accepted.includes("dateRange")) {
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
    }
    ["customer", "carrier", "driver", "shippingLine", "status", "invoiceState", "settledState"]
      .filter((key) => accepted.includes(key) && filters[key])
      .forEach((key) => {
        params[key] = filters[key];
      });

    return params;
  }, [definition, filters]);

  const run = useCallback(async () => {
    if (!active) return;

    try {
      setLoading(true);
      const { data } = await api.get(`/reports/${active}`, { params: queryFor() });
      setReport(data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not run that report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [active, queryFor]);

  useEffect(() => {
    run();
  }, [run]);

  // The default range differs per report — a daily report wants today, a
  // financial one wants the month. Applied when the report changes rather than
  // leaving a month-wide "daily" report that reads as broken.
  useEffect(() => {
    if (definition?.defaultRange === "today") {
      setFilters((f) => ({ ...f, from: today(), to: today() }));
    }
  }, [definition?.key, definition?.defaultRange]);

  const exportCsv = async () => {
    try {
      const res = await api.get(`/reports/${active}/export`, {
        params: queryFor(),
        responseType: "blob",
      });

      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${active}-${today()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Could not export that report");
    }
  };

  // ── Paying a driver ────────────────────────────────────────────────────────
  const payDriver = async (group) => {
    const driverRow = group.rows.find((r) => r.driver);

    if (!driverRow?.driver) {
      notify.warning(
        "These loads are not linked to a driver record, so no statement can be sent.",
      );
      return;
    }

    const { isConfirmed, value } = await Swal.fire({
      title: `Pay ${group.name}?`,
      html:
        `<p style="font-size:14px">${group.count} load(s) · <strong>$${group.totals.payAmount.toLocaleString("en-US")}</strong></p>` +
        `<p style="font-size:12px;color:#6b7280">They will be emailed an itemised statement.</p>`,
      input: "text",
      inputLabel: "Payment reference (optional)",
      inputPlaceholder: "ACH 20260815",
      showCancelButton: true,
      confirmButtonText: "Mark paid & email",
      confirmButtonColor: "#4f46e5",
    });

    if (!isConfirmed) return;

    try {
      const { data } = await api.post("/reports/driver-payable/pay", {
        driver: driverRow.driver,
        loadIds: group.rows.map((r) => r.loadId),
        reference: value || undefined,
      });

      notify.success(data.message);
      run();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not record the payment");
    }
  };

  if (!catalog) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  const accepts = (key) => definition?.filters?.includes(key);

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Every figure is read live from the loads — nothing here is cached.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Report picker */}
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden max-h-[36rem] overflow-y-auto">
          {catalog.groups.map((group) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 pt-3 pb-1">
                {group}
              </p>
              {catalog.reports
                .filter((r) => r.group === group)
                .map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setActive(r.key)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-4 ${
                      r.key === active
                        ? "bg-indigo-50 border-l-indigo-600 text-indigo-900 font-medium"
                        : "border-l-transparent text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {/* Filters */}
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900">
              {definition?.label}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">
              {definition?.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {accepts("dateRange") && (
                <>
                  <Field label={`${definition.dateLabel} from`}>
                    <input
                      type="date"
                      className={uiStyles.input}
                      value={filters.from}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, from: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="To">
                    <input
                      type="date"
                      className={uiStyles.input}
                      value={filters.to}
                      onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    />
                  </Field>
                </>
              )}

              {accepts("customer") && (
                <Field label="Customer">
                  <select
                    className={uiStyles.select}
                    value={filters.customer}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, customer: e.target.value }))
                    }
                  >
                    <option value="">All customers</option>
                    {options.customers.map((c) => (
                      <option key={c._id} value={c.user || c._id}>
                        {c.customerName || c.email}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {accepts("carrier") && (
                <Field label="Carrier">
                  <select
                    className={uiStyles.select}
                    value={filters.carrier}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, carrier: e.target.value }))
                    }
                  >
                    <option value="">All carriers</option>
                    {options.carriers.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.carrierName}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {accepts("driver") && (
                <Field label="Driver">
                  <select
                    className={uiStyles.select}
                    value={filters.driver}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, driver: e.target.value }))
                    }
                  >
                    <option value="">All drivers</option>
                    {options.drivers.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {accepts("shippingLine") && (
                <Field label="Shipping line">
                  <select
                    className={uiStyles.select}
                    value={filters.shippingLine}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, shippingLine: e.target.value }))
                    }
                  >
                    <option value="">All lines</option>
                    {options.shippingLines.map((l) => (
                      <option key={l._id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {accepts("status") && (
                <Field label="Status">
                  <select
                    className={uiStyles.select}
                    value={filters.status}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <option value="">Any status</option>
                    {[
                      "NEW_LOAD", "ASSIGNED", "READY_TO_PICKUP", "PICKED_UP",
                      "IN_TRANSIT", "LOADED_IN_YARD", "EMPTY_IN_YARD",
                      "REACHED_DESTINATION", "DELIVERED", "PAPERWORK_PENDING",
                      "INVOICED",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {accepts("invoiceState") && (
                <Field label="Invoice state">
                  <select
                    className={uiStyles.select}
                    value={filters.invoiceState}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, invoiceState: e.target.value }))
                    }
                  >
                    <option value="">All</option>
                    <option value="uninvoiced">Not yet invoiced</option>
                    <option value="unpaid">Invoiced but unpaid</option>
                  </select>
                </Field>
              )}

              {accepts("settledState") && (
                <Field label="Payment state">
                  <select
                    className={uiStyles.select}
                    value={filters.settledState}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, settledState: e.target.value }))
                    }
                  >
                    <option value="">All</option>
                    <option value="unsettled">Not yet paid</option>
                    <option value="settled">Already paid</option>
                  </select>
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
              <p className="text-xs text-gray-500">
                {report
                  ? `${report.totals.count} row${report.totals.count === 1 ? "" : "s"} · generated ${new Date(report.generatedAt).toLocaleTimeString("en-US")}`
                  : ""}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={run} className="btn-secondary" disabled={loading}>
                  <RefreshIcon fontSize="small" /> {loading ? "Running…" : "Refresh"}
                </button>
                {canExport && (
                  <button
                    onClick={exportCsv}
                    className="btn-primary"
                    disabled={!report?.rows?.length}
                  >
                    <DownloadIcon fontSize="small" /> Export CSV
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <p className="text-center text-gray-400 py-16 text-sm">Running…</p>
          ) : !report || report.rows.length === 0 ? (
            <div className={uiStyles.card}>
              <p className="text-sm text-gray-600 text-center py-6">
                Nothing matches those filters.
              </p>
            </div>
          ) : report.groups ? (
            <div className="space-y-3">
              {report.groups.map((group) => (
                <div key={group.name} className={uiStyles.card}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {group.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {group.count} load{group.count === 1 ? "" : "s"}
                        {Object.entries(group.totals).map(([key, value]) => {
                          const col = report.columns.find((c) => c.key === key);
                          return col ? ` · ${col.label} ${fmt(value, col.type)}` : "";
                        })}
                      </p>
                    </div>

                    {/* Paying is only offered on the driver report, where it is
                        the action the report exists to lead to. */}
                    {report.key === "driverPayable" &&
                      group.rows.some((r) => !r.settledAt) && (
                        <button
                          onClick={() => payDriver(group)}
                          className="btn-primary whitespace-nowrap"
                        >
                          <PaidIcon fontSize="small" /> Mark paid &amp; email
                        </button>
                      )}
                  </div>

                  <Table report={report} rows={group.rows} navigate={navigate} />
                </div>
              ))}
            </div>
          ) : (
            <div className={uiStyles.card}>
              <Table
                report={report}
                rows={report.rows}
                navigate={navigate}
                showTotals
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
      {label}
    </label>
    {children}
  </div>
);

const Table = ({ report, rows, navigate, showTotals }) => (
  <div className="overflow-x-auto border border-gray-200 rounded-lg">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          {report.columns.map((col) => (
            <th
              key={col.key}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                ["money", "number", "percent"].includes(col.type)
                  ? "text-right"
                  : "text-left"
              }`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={`${row.loadId}-${index}`}
            className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
          >
            {report.columns.map((col) => (
              <td
                key={col.key}
                className={`px-3 py-2 whitespace-nowrap ${
                  ["money", "number", "percent"].includes(col.type)
                    ? "text-right tabular-nums"
                    : ""
                } ${
                  // A negative margin or an overdue LFD is the row somebody
                  // opened the report to find.
                  ["margin", "lfdDaysLeft"].includes(col.key) && Number(row[col.key]) < 0
                    ? "text-red-600 font-semibold"
                    : ""
                }`}
              >
                {col.key === "loadId" ? (
                  <button
                    onClick={() => navigate(`/admin/accounting/${row.loadId}`)}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    {row.loadId}
                  </button>
                ) : (
                  fmt(row[col.key], col.type)
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>

      {showTotals && Object.keys(report.totals).length > 1 && (
        <tfoot>
          <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
            {report.columns.map((col, index) => (
              <td
                key={col.key}
                className={`px-3 py-2 whitespace-nowrap ${
                  ["money", "number", "percent"].includes(col.type)
                    ? "text-right tabular-nums"
                    : ""
                }`}
              >
                {index === 0
                  ? `Total (${report.totals.count})`
                  : report.totals[col.key] !== undefined
                    ? fmt(report.totals[col.key], col.type)
                    : ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

export default ReportCentre;
