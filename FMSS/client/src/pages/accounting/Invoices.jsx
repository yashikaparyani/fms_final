import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import api from "../../api";
import SettleBillsDialog from "../../components/accounting/SettleBillsDialog";
import SettlementSheets from "../../components/accounting/SettlementSheets";
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
// ── One component, two screens ───────────────────────────────────────────────
// Receivables and payables are the same table read from opposite ends, so they
// share this file. They do not share a page: AR and AP are separate entries on
// the rail, because "what do customers owe us" and "what do we owe carriers" are
// two different jobs done by two different people, and burying one as a tab
// inside the other hid it from whoever was looking for it.
//
// `direction` is fixed by the route. Mounted without it the screen keeps the
// in-page switch, so an existing /accounting/invoices link still works.
//
// ── Why the default filter is "open" ─────────────────────────────────────────
// Nobody opens this screen to browse. They open it because they are chasing
// money or about to pay somebody, and a register that leads with three years of
// settled invoices buries the twelve rows that need action. Everything else is
// one filter away.
// ─────────────────────────────────────────────────────────────────────────────

// Named groups so the dropdown reads "Drivers" / "Carriers" rather than listing
// forty names with no indication of which is which.
const PAYEE_GROUPS = [
  { kind: "DRIVER", label: "Drivers" },
  { kind: "CARRIER", label: "Carriers" },
];

const FILTERS = [
  { key: "open", label: "Open", params: { open: "true" } },
  { key: "overdue", label: "Overdue", params: { overdue: "true" } },
  // Stored as DRAFT, shown as "Invoiced" — see STATUS in invoiceUi.js. What the
  // filter actually picks out is everything that has not been emailed yet, so
  // that is what it is called.
  { key: "draft", label: "Not sent", params: { status: "DRAFT" } },
  { key: "paid", label: "Paid", params: { status: "PAID" } },
  { key: "all", label: "All", params: {} },
];

const Tile = ({ label, value, tone = "text-ink-800", hint }) => (
  <div className={uiStyles.card}>
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
      {label}
    </p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
  </div>
);

const Invoices = ({ direction: fixedDirection }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [chosenDirection, setDirection] = useState(
    params.get("direction") || "AR",
  );
  const direction = fixedDirection || chosenDirection;
  const [filter, setFilter] = useState(params.get("filter") || "open");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });

  // Payables only: whose bills to show. One control rather than two, because
  // "all drivers" and "this driver" are the same question at two depths and
  // splitting them into a kind picker plus a name picker makes the common case
  // two clicks. Encoded as "kind:DRIVER" or "id:<party>" — see `query`.
  const [payee, setPayee] = useState("");
  const [payees, setPayees] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Payables only: which bills the next payment run covers. Held by id rather
  // than by row so it survives the list reloading underneath it.
  const [picked, setPicked] = useState({});
  const [settling, setSettling] = useState(false);

  const query = useMemo(() => {
    const chosen = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    const [scope, value] = payee.split(":");

    return {
      direction,
      ...chosen.params,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
      ...(direction === "AP" && scope === "kind" ? { partyKind: value } : {}),
      ...(direction === "AP" && scope === "id" ? { partyId: value } : {}),
    };
  }, [direction, filter, search, range, payee]);

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
    setParams(fixedDirection ? { filter } : { direction, filter }, {
      replace: true,
    });
  }, [direction, fixedDirection, filter, setParams]);

  useEffect(() => {
    if (direction !== "AP") return;
    api
      .get("/invoices/payees", { params: { direction: "AP" } })
      .then(({ data }) => setPayees(data.payees || []))
      .catch(() => {
        /* the dropdown degrades to "everyone" */
      });
  }, [direction]);

  // A payee chosen on one side means nothing on the other.
  useEffect(() => {
    setPayee("");
  }, [direction]);

  // Memoised because the selection below derives from it: a fresh [] on every
  // render would rebuild the selection on every render too.
  const rows = useMemo(() => data?.rows || [], [data]);
  // "All drivers" or "All carriers" — both read as one settlement sheet per payee.
  const sheetKind =
    direction === "AP" && (payee === "kind:DRIVER" || payee === "kind:CARRIER")
      ? payee.split(":")[1]
      : null;
  const showSheets = !!sheetKind;
  const totals = data?.totals;
  const incoming = direction === "AR";

  // ── The payment run ────────────────────────────────────────────────────────
  // Ticking bills off the register and settling them together, rather than
  // opening each one and typing the same cheque details five times.
  //
  // Only on payables, and only on rows that can actually be paid: a void or
  // already-settled bill would be a tick box whose only possible outcome is an
  // error from the server.
  const payable = (row) => row.status !== "VOID" && Number(row.balance) > 0;
  const selectable = useMemo(
    () => (incoming ? [] : rows.filter(payable)),
    [incoming, rows],
  );

  const selected = useMemo(
    () => selectable.filter((row) => picked[row._id]),
    [selectable, picked],
  );

  const selectedTotal = selected.reduce(
    (sum, row) => sum + (Number(row.balance) || 0),
    0,
  );
  const allPicked =
    selectable.length > 0 && selected.length === selectable.length;

  // A selection is about the rows in front of you. Switching side or filter puts
  // different rows there, and carrying ticks across would mean paying a bill
  // somebody can no longer see.
  useEffect(() => {
    setPicked({});
  }, [direction, filter]);

  return (
    <div className={uiStyles.page}>
      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>{incoming ? "AR" : "AP"}</h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            {incoming
              ? "What customers owe us, and the payments against it"
              : "What we owe carriers and drivers, and what has been paid out"}
          </p>
        </div>
        <button
          onClick={() => navigate("../accounting/invoices/new")}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
        >
          <AddIcon fontSize="small" /> {incoming ? "New invoice" : "New bill"}
        </button>
      </div>

      {/* Only when the route has not already answered it. */}
      {!fixedDirection && (
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
                  <ReceiptLongIcon
                    fontSize="small"
                    className="text-accent-600"
                  />
                ) : (
                  <PaymentsIcon fontSize="small" className="text-fuel-600" />
                )}
                {side.label}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{side.hint}</p>
            </button>
          ))}
        </div>
      )}

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

          {!incoming && (
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-ink-500">
                Driver / carrier
              </label>
              <select
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className={`${uiStyles.select} w-[210px]`}
              >
                <option value="">All payees</option>
                <option value="kind:DRIVER">All drivers</option>
                <option value="kind:CARRIER">All carriers</option>
                {PAYEE_GROUPS.map((group) => {
                  const members = payees.filter(
                    (p) => p.kind === group.kind && p.id,
                  );
                  if (!members.length) return null;
                  return (
                    <optgroup key={group.kind} label={group.label}>
                      {members.map((p) => (
                        <option key={p.id} value={`id:${p.id}`}>
                          {p.code ? `${p.code} — ${p.name}` : p.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-ink-500">
                From
              </label>
              <input
                type="date"
                value={range.from}
                onChange={(e) =>
                  setRange((r) => ({ ...r, from: e.target.value }))
                }
                className={`${uiStyles.input} w-[145px]`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-ink-500">
                To
              </label>
              <input
                type="date"
                value={range.to}
                onChange={(e) =>
                  setRange((r) => ({ ...r, to: e.target.value }))
                }
                className={`${uiStyles.input} w-[145px]`}
              />
            </div>
            {(range.from || range.to || payee) && (
              <button
                onClick={() => {
                  setRange({ from: "", to: "" });
                  setPayee("");
                }}
                className="pb-2 text-xs font-semibold text-ink-500 hover:text-ink-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* "All drivers" is not a filter on the list, it is a different
            document: one settlement sheet per driver, the way the office
            prints them. The period above still applies; the status chips and
            search do not, because a sheet is every bill in the window. */}
        {showSheets ? (
          <SettlementSheets
            from={range.from}
            to={range.to}
            partyKind={sheetKind}
          />
        ) : (
          <>
            {/* Only once something is ticked — an always-present bar reading "0
            selected" is a permanent instruction nobody needs. */}
            {selected.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent-100 bg-accent-50 px-3 py-2">
                <p className="text-sm font-semibold text-ink-800">
                  {selected.length} bill{selected.length === 1 ? "" : "s"}{" "}
                  selected ·{" "}
                  <span className="tabular-nums">{money(selectedTotal)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setPicked({})}
                  className="text-xs font-semibold text-ink-500 hover:text-ink-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setSettling(true)}
                  className="ml-auto rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700"
                >
                  Mark paid
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-[13px] uppercase tracking-wide text-ink-500">
                    {!incoming && (
                      <th className="pb-2 pr-2 font-semibold">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-accent-600"
                          title="Select every bill that can be paid"
                          disabled={!selectable.length}
                          checked={allPicked}
                          onChange={() =>
                            setPicked(
                              allPicked
                                ? {}
                                : Object.fromEntries(
                                    selectable.map((row) => [row._id, true]),
                                  ),
                            )
                          }
                        />
                      </th>
                    )}
                    <th className="pb-2 pr-3 font-semibold">Invoice</th>
                    <th className="pb-2 pr-3 font-semibold">
                      {incoming ? "Customer" : "Payee"}
                    </th>
                    <th className="pb-2 pr-3 font-semibold">Issued</th>
                    <th className="pb-2 pr-3 font-semibold">Due</th>
                    <th className="pb-2 pr-3 text-right font-semibold">
                      Total
                    </th>
                    <th className="pb-2 pr-3 text-right font-semibold">Paid</th>
                    <th className="pb-2 pr-3 text-right font-semibold">
                      Outstanding
                    </th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={incoming ? 8 : 9}
                        className="py-8 text-center text-ink-400"
                      >
                        Loading…
                      </td>
                    </tr>
                  )}

                  {!loading && !rows.length && (
                    <tr>
                      <td
                        colSpan={incoming ? 8 : 9}
                        className="py-10 text-center text-ink-400"
                      >
                        Nothing here.
                        {filter === "open" &&
                          " Every invoice on this side is settled."}
                      </td>
                    </tr>
                  )}

                  {rows.map((row) => {
                    const status = statusOf(row);
                    return (
                      <tr
                        key={row._id}
                        onClick={() =>
                          navigate(`../accounting/invoices/${row._id}`)
                        }
                        className="cursor-pointer border-b border-hairline/60 transition-colors hover:bg-accent-50"
                      >
                        {!incoming && (
                          // Stops the row's own click, or ticking a box would
                          // navigate away from the list being ticked.
                          <td
                            className="py-2.5 pr-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-accent-600"
                              disabled={!payable(row)}
                              title={
                                payable(row)
                                  ? ""
                                  : "Nothing outstanding on this bill"
                              }
                              checked={!!picked[row._id]}
                              onChange={() =>
                                setPicked((prev) => ({
                                  ...prev,
                                  [row._id]: !prev[row._id],
                                }))
                              }
                            />
                          </td>
                        )}
                        <td className="py-2.5 pr-3">
                          <p className="font-bold text-accent-700">
                            {row.invoiceNumber}
                          </p>
                          {row.kind === "MANUAL" && (
                            <span className="text-[12px] font-semibold uppercase text-ink-400">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-ink-800">
                            {row.party?.name || "—"}
                          </p>
                          {row.loadId && row.loadId !== row.invoiceNumber && (
                            <p className="text-xs text-ink-400">{row.loadId}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-ink-600">
                          {formatDate(row.issueDate)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              row.overdue
                                ? "font-semibold text-bad-600"
                                : "text-ink-600"
                            }
                          >
                            {formatDate(row.dueDate)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                          {money(row.total)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-good-600">
                          {money(
                            (row.amountPaid || 0) + (row.advanceApplied || 0),
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                          {money(row.balance)}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold ${status.chip}`}
                          >
                            {row.overdue && (
                              <WarningAmberIcon sx={{ fontSize: 14 }} />
                            )}
                            {status.label}
                          </span>
                          {row.reminders?.length > 0 && (
                            <p className="mt-0.5 text-[12px] text-ink-400">
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
          </>
        )}
      </div>

      <SettleBillsDialog
        open={settling}
        bills={selected}
        onClose={() => setSettling(false)}
        onSettled={() => {
          setPicked({});
          load();
        }}
      />
    </div>
  );
};

export default Invoices;
