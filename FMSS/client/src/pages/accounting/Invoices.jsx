import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import {
  money,
  moneyShort,
  formatDate,
  statusOf,
  errorFrom,
} from "../../components/accounting/invoiceUi";

// ─── The invoice register ─────────────────────────────────────────────────────
// Everything raised, in either direction, with what is still owed on it.
//
// ── Two tabs, not two screens ────────────────────────────────────────────────
// Receivables and payables are the same table read from opposite ends, and the
// person closing a month looks at both within a minute of each other. Splitting
// them into separate pages would double the navigation to answer one question —
// "where does this month actually stand".
//
// ── Why the default filter is "open" ─────────────────────────────────────────
// Nobody opens this screen to browse. They open it because they are chasing
// money or about to pay somebody, and a register that leads with three years of
// settled invoices buries the twelve rows that need action. Everything else is
// one filter away.
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "open", label: "Open", params: { open: "true" } },
  { key: "overdue", label: "Overdue", params: { overdue: "true" } },
  { key: "draft", label: "Drafts", params: { status: "DRAFT" } },
  { key: "paid", label: "Paid", params: { status: "PAID" } },
  { key: "all", label: "All", params: {} },
];

const Tile = ({ label, value, tone = "text-ink-800", hint }) => (
  <div className={uiStyles.card}>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
  </div>
);

const Invoices = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [direction, setDirection] = useState(params.get("direction") || "AR");
  const [filter, setFilter] = useState(params.get("filter") || "open");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const chosen = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    return {
      direction,
      ...chosen.params,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
    };
  }, [direction, filter, search, range]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get("/invoices", { params: query });
      setData(res);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load the invoices"));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // Debounced only because of the search box — every other control is a click
    // and would be fine firing immediately.
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    setParams({ direction, filter }, { replace: true });
  }, [direction, filter, setParams]);

  const rows = data?.rows || [];
  const totals = data?.totals;
  const incoming = direction === "AR";

  return (
    <div className={uiStyles.page}>
      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>Invoices</h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            What customers owe us, and what we owe carriers and drivers
          </p>
        </div>
        <button
          onClick={() => navigate("../accounting/invoices/new")}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
        >
          <AddIcon fontSize="small" /> New invoice
        </button>
      </div>

      {/* Direction — the top-level question this screen answers. */}
      <div className="flex gap-2">
        {[
          { key: "AR", label: "Receivables", hint: "Money in" },
          { key: "AP", label: "Payables", hint: "Money out" },
        ].map((side) => (
          <button
            key={side.key}
            onClick={() => setDirection(side.key)}
            className={`flex-1 rounded-card border p-4 text-left transition-all ${
              direction === side.key
                ? "border-accent-600 bg-accent-50 shadow-card"
                : "border-hairline bg-surface hover:border-accent-200"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-ink-800">
              {side.key === "AR" ? (
                <ReceiptLongIcon fontSize="small" className="text-accent-600" />
              ) : (
                <PaymentsIcon fontSize="small" className="text-fuel-600" />
              )}
              {side.label}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">{side.hint}</p>
          </button>
        ))}
      </div>

      {totals && (
        <div className={uiStyles.grid4}>
          <Tile
            label={incoming ? "Invoiced" : "Billed"}
            value={moneyShort(totals.invoiced)}
            hint={`${totals.count} document${totals.count === 1 ? "" : "s"}`}
          />
          <Tile
            label={incoming ? "Received" : "Paid"}
            value={moneyShort(totals.paid)}
            tone="text-good-600"
          />
          <Tile
            label="Outstanding"
            value={moneyShort(totals.outstanding)}
            tone="text-warn-600"
          />
          <Tile
            label="Overdue"
            value={moneyShort(totals.overdue)}
            tone="text-bad-600"
            hint={
              totals.overdueCount
                ? `${totals.overdueCount} past due`
                : "Nothing past due"
            }
          />
        </div>
      )}

      <div className={uiStyles.card}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? "bg-accent-600 text-white"
                    : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto min-w-[220px] flex-1 max-w-xs">
            <SearchIcon
              fontSize="small"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice, load, customer, carrier…"
              className={`${uiStyles.input} pl-9`}
            />
          </div>

          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-500">
                From
              </label>
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className={`${uiStyles.input} w-[145px]`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink-500">
                To
              </label>
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className={`${uiStyles.input} w-[145px]`}
              />
            </div>
            {(range.from || range.to) && (
              <button
                onClick={() => setRange({ from: "", to: "" })}
                className="pb-2 text-xs font-semibold text-ink-500 hover:text-ink-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="pb-2 pr-3 font-semibold">Invoice</th>
                <th className="pb-2 pr-3 font-semibold">
                  {incoming ? "Customer" : "Payee"}
                </th>
                <th className="pb-2 pr-3 font-semibold">Issued</th>
                <th className="pb-2 pr-3 font-semibold">Due</th>
                <th className="pb-2 pr-3 text-right font-semibold">Total</th>
                <th className="pb-2 pr-3 text-right font-semibold">Paid</th>
                <th className="pb-2 pr-3 text-right font-semibold">Outstanding</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-400">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && !rows.length && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-400">
                    Nothing here.
                    {filter === "open" && " Every invoice on this side is settled."}
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const status = statusOf(row);
                return (
                  <tr
                    key={row._id}
                    onClick={() => navigate(`../accounting/invoices/${row._id}`)}
                    className="cursor-pointer border-b border-hairline/60 transition-colors hover:bg-accent-50"
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-accent-700">{row.invoiceNumber}</p>
                      {row.kind === "MANUAL" && (
                        <span className="text-[10px] font-semibold uppercase text-ink-400">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-ink-800">{row.party?.name || "—"}</p>
                      {row.loadId && row.loadId !== row.invoiceNumber && (
                        <p className="text-xs text-ink-400">{row.loadId}</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-600">{formatDate(row.issueDate)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={row.overdue ? "font-semibold text-bad-600" : "text-ink-600"}>
                        {formatDate(row.dueDate)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                      {money(row.total)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-good-600">
                      {money((row.amountPaid || 0) + (row.advanceApplied || 0))}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                      {money(row.balance)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.chip}`}
                      >
                        {row.overdue && <WarningAmberIcon sx={{ fontSize: 12 }} />}
                        {status.label}
                      </span>
                      {row.reminders?.length > 0 && (
                        <p className="mt-0.5 text-[10px] text-ink-400">
                          {row.reminders.length} reminder
                          {row.reminders.length === 1 ? "" : "s"} sent
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
