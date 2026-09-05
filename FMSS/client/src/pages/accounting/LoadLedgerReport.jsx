import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import api from "../../api";
import { notify } from "../../utils/swal";
import { uiStyles } from "../../style/uiStyles";
import {
  money,
  moneyShort,
  formatDate,
  errorFrom,
  startOfMonth,
  today,
} from "../../components/accounting/invoiceUi";

// ─── Load-wise receivables and payables ───────────────────────────────────────
// One row per load: what comes in, what goes out, and the gap between them.
//
// ── Two numbers per side, not one ────────────────────────────────────────────
// Every load reports what it is WORTH (the ledger) and what has been INVOICED.
// They differ constantly — a detention charge added on Friday that nobody
// re-billed — and reporting one figure hides the gap in whichever direction the
// report happened to pick. Revenue earned but never billed is the commonest way
// a brokerage loses money it already made, so "Uninvoiced" is a column with its
// own colour rather than something you work out by subtracting two others.
//
// ── Additional charges are itemised, not totalled ────────────────────────────
// The base rate is what was quoted. Everything on top is what the job turned out
// to involve, and that list is what a customer queries and an operations manager
// learns from. Expanding a row shows it line by line, both sides.
// ─────────────────────────────────────────────────────────────────────────────

const Tile = ({ label, value, tone = "text-ink-800", hint }) => (
  <div className={uiStyles.card}>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
  </div>
);

/** Itemised accessorials on one side of a load. */
const ChargeList = ({ title, baseRate, charges, extra }) => (
  <div>
    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
      {title}
    </p>
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-ink-600">Base rate</span>
        <span className="font-semibold tabular-nums">{money(baseRate)}</span>
      </div>

      {charges.map((charge, index) => (
        <div key={index} className="flex justify-between gap-3">
          <span className="text-ink-600">
            {charge.label}
            {charge.note && (
              <span className="block text-xs text-ink-400">{charge.note}</span>
            )}
          </span>
          <span className="tabular-nums">{money(charge.amount)}</span>
        </div>
      ))}

      {!charges.length && (
        <p className="text-xs italic text-ink-400">No additional charges.</p>
      )}

      {extra}
    </div>
  </div>
);

const LoadLedgerReport = () => {
  const navigate = useNavigate();

  const [range, setRange] = useState({ from: startOfMonth(), to: today() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get("/accounting/reports/loads", { params: range });
      setData(res);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load the report"));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * CSV of what is on screen.
   *
   * Built client-side from the rows already fetched rather than by a second API
   * call, so the file can never disagree with the table it was exported from.
   */
  const exportCsv = () => {
    const rows = data?.rows || [];
    if (!rows.length) return notify.info("Nothing to export.");

    const header = [
      "Load",
      "Customer",
      "Carrier",
      "Status",
      "Created",
      "Base rate",
      "Additional charges",
      "Receivable total",
      "Invoiced",
      "Received",
      "Outstanding",
      "Uninvoiced",
      "Carrier cost",
      "Additional costs",
      "Driver pay",
      "Payable total",
      "Paid",
      "Payable outstanding",
      "Margin",
      "Margin %",
    ];

    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const lines = rows.map((row) =>
      [
        row.loadId,
        row.customerName,
        row.carrierName,
        row.transportStatus,
        formatDate(row.createdAt),
        row.receivable.baseRate,
        row.receivable.additionalTotal,
        row.receivable.total,
        row.receivable.invoiced,
        row.receivable.received,
        row.receivable.outstanding,
        row.receivable.uninvoiced,
        row.payable.baseRate,
        row.payable.additionalTotal,
        row.payable.driverPay,
        row.payable.total,
        row.payable.paid,
        row.payable.outstanding,
        row.margin,
        row.marginPercent,
      ]
        .map(escape)
        .join(","),
    );

    const blob = new Blob([[header.map(escape).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `load-ledger-${range.from}-to-${range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rows = data?.rows || [];
  const totals = data?.totals;

  return (
    <div className={uiStyles.page}>
      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>Load ledger</h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            Receivable against payable, load by load, with every additional charge
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
        >
          <DownloadIcon fontSize="small" /> CSV
        </button>
      </div>

      <div className={uiStyles.card}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={uiStyles.label}>From</label>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className={`${uiStyles.input} w-[160px]`}
            />
          </div>
          <div>
            <label className={uiStyles.label}>To</label>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className={`${uiStyles.input} w-[160px]`}
            />
          </div>
        </div>
      </div>

      {totals && (
        <>
          <div className={uiStyles.grid4}>
            <Tile
              label="Revenue"
              value={moneyShort(totals.revenue)}
              hint={`${totals.loads} loads`}
            />
            <Tile label="Cost" value={moneyShort(totals.cost)} tone="text-fuel-600" />
            <Tile
              label="Margin"
              value={moneyShort(totals.margin)}
              tone={totals.margin >= 0 ? "text-good-600" : "text-bad-600"}
              hint={`${totals.marginPercent}%`}
            />
            <Tile
              label="Uninvoiced"
              value={moneyShort(totals.uninvoiced)}
              tone={totals.uninvoiced > 0 ? "text-bad-600" : "text-good-600"}
              hint="Earned but not billed"
            />
          </div>

          <div className={uiStyles.grid4}>
            <Tile label="Invoiced" value={moneyShort(totals.invoiced)} />
            <Tile
              label="Received"
              value={moneyShort(totals.received)}
              tone="text-good-600"
            />
            <Tile
              label="Owed to us"
              value={moneyShort(totals.receivableOutstanding)}
              tone="text-warn-600"
            />
            <Tile
              label="We owe"
              value={moneyShort(totals.payableOutstanding)}
              tone="text-warn-600"
              hint={
                totals.unbilled > 0
                  ? `${moneyShort(totals.unbilled)} not yet billed to us`
                  : undefined
              }
            />
          </div>
        </>
      )}

      <div className={uiStyles.card}>
        <div className={uiStyles.cardHeader}>
          <p className="flex items-center gap-2 text-lg font-bold text-ink-800">
            <LocalShippingIcon fontSize="small" className="text-accent-600" />
            Loads
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="w-8 pb-2" />
                <th className="pb-2 pr-3 font-semibold">Load</th>
                <th className="pb-2 pr-3 text-right font-semibold">Receivable</th>
                <th className="pb-2 pr-3 text-right font-semibold">Received</th>
                <th className="pb-2 pr-3 text-right font-semibold">Owed to us</th>
                <th className="pb-2 pr-3 text-right font-semibold">Payable</th>
                <th className="pb-2 pr-3 text-right font-semibold">We owe</th>
                <th className="pb-2 text-right font-semibold">Margin</th>
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
                    No loads in this range.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const open = expanded === row.loadId;

                return [
                  <tr
                    key={row.loadId}
                    onClick={() => setExpanded(open ? null : row.loadId)}
                    className="cursor-pointer border-b border-hairline/60 hover:bg-accent-50"
                  >
                    <td className="py-2.5 text-ink-400">
                      {open ? (
                        <ExpandMoreIcon fontSize="small" />
                      ) : (
                        <ChevronRightIcon fontSize="small" />
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-accent-700">{row.loadId}</p>
                      <p className="text-xs text-ink-500">{row.customerName || "—"}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <p className="font-semibold tabular-nums">
                        {money(row.receivable.total)}
                      </p>
                      {row.receivable.uninvoiced > 0 && (
                        <p className="text-[11px] font-semibold text-bad-600">
                          {money(row.receivable.uninvoiced)} unbilled
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-good-600">
                      {money(row.receivable.received)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-warn-600">
                      {money(row.receivable.outstanding)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {money(row.payable.total)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-warn-600">
                      {money(row.payable.outstanding)}
                    </td>
                    <td className="py-2.5 text-right">
                      <p
                        className={`font-bold tabular-nums ${
                          row.margin >= 0 ? "text-good-600" : "text-bad-600"
                        }`}
                      >
                        {money(row.margin)}
                      </p>
                      <p className="text-[11px] text-ink-400">{row.marginPercent}%</p>
                    </td>
                  </tr>,

                  open && (
                    <tr key={`${row.loadId}-detail`} className="bg-ink-50/60">
                      <td />
                      <td colSpan={7} className="px-3 py-4">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <ChargeList
                            title="Billed to the customer"
                            baseRate={row.receivable.baseRate}
                            charges={row.receivable.additionalCharges}
                            extra={
                              <div className="mt-2 space-y-1 border-t border-hairline pt-2">
                                <div className="flex justify-between font-bold">
                                  <span>Total</span>
                                  <span className="tabular-nums">
                                    {money(row.receivable.total)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs text-ink-500">
                                  <span>
                                    Invoiced
                                    {row.receivable.invoiceNumbers.length
                                      ? ` (${row.receivable.invoiceNumbers.join(", ")})`
                                      : ""}
                                  </span>
                                  <span className="tabular-nums">
                                    {money(row.receivable.invoiced)}
                                  </span>
                                </div>
                              </div>
                            }
                          />

                          <ChargeList
                            title="Paid to carriers and drivers"
                            baseRate={row.payable.baseRate}
                            charges={row.payable.additionalCharges}
                            extra={
                              <div className="mt-2 space-y-1 border-t border-hairline pt-2">
                                {row.payable.driverPay > 0 && (
                                  <div className="flex justify-between text-ink-600">
                                    <span>Driver pay</span>
                                    <span className="tabular-nums">
                                      {money(row.payable.driverPay)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold">
                                  <span>Total</span>
                                  <span className="tabular-nums">
                                    {money(row.payable.total)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs text-ink-500">
                                  <span>
                                    Billed to us
                                    {row.payable.invoiceNumbers.length
                                      ? ` (${row.payable.invoiceNumbers.join(", ")})`
                                      : ""}
                                  </span>
                                  <span className="tabular-nums">
                                    {money(row.payable.billed)}
                                  </span>
                                </div>
                              </div>
                            }
                          />
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`../accounting/${row.loadId}`);
                          }}
                          className="mt-4 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700"
                        >
                          Open {row.loadId}
                        </button>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LoadLedgerReport;
