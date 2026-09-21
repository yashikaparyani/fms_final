import { useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { uiStyles } from "../../style/uiStyles";

// ─── ChargeEditor ─────────────────────────────────────────────────────────────
// One side of a load's books — receivables or payables — as an editable list of
// lines, driven by the catalog the server serves.
//
// Shared by the base-amount popup on the load form and the full accounting panel
// on the load itself, so the two cannot disagree about what a charge is called
// or how a total is reached.
//
// The totals shown here mirror server/config/chargeTypes.js exactly, including
// the one rule the whole module turns on: an advance is money that has already
// moved, so it comes off the balance and is never added to the total. The panel
// shows all three figures rather than a single "sum" precisely so that
// distinction is visible rather than assumed.
//
// ── Payables are kept per payee ──────────────────────────────────────────────
// A receivable side is one bill to one customer, so it is one list. A payable
// side is not: it is a separate bill to each carrier on the load and a separate
// settlement to each driver who ran it, and they are paid on different days for
// different amounts. Shown as one flat list they read as a single pile of money
// with two identical "Charge" rows in it, and the only way to tell whose $30 is
// whose was to remember the order they were seeded in.
//
// So when the caller says who the payees are, the lines are grouped under them:
// each person's name over their own lines, their own subtotal, and their own
// "Add a charge" that stamps the new line with them. It mirrors the server,
// which validates the same buckets — see payeeKey in accountingController.
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) =>
  `$${(Math.round((Number(value) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * What a line comes to in cash.
 *
 * A percentage line carries its percentage in `rate` and is worked out against
 * the side's linehaul — the same sum applyPercentageLines does on the server,
 * repeated here only so the figure updates as the user types. The server's
 * answer is the one that gets stored.
 */
export const amountOf = (line, linehaulBase) =>
  line?.basis === "PERCENT"
    ? Math.round(((Number(linehaulBase) || 0) * (Number(line.rate) || 0)) / 100 * 100) / 100
    : Number(line?.amount) || 0;

/** The base a percentage is taken of: the side's linehaul, never its total. */
export const linehaulOf = (lines, catalogBySide) =>
  lines.reduce(
    (sum, line) =>
      catalogBySide.get(line.chargeType)?.kind === "linehaul"
        ? sum + (Number(line.amount) || 0)
        : sum,
    0,
  );

/** Mirrors totalsFor() on the server. Kept in step by the shared line `kind`. */
export const computeTotals = (lines, catalogBySide) => {
  let linehaul = 0;
  let accessorials = 0;
  let settled = 0;

  const base = linehaulOf(lines, catalogBySide);

  for (const line of lines) {
    const spec = catalogBySide.get(line.chargeType);
    if (!spec) continue;

    const amount = amountOf(line, base);

    if (spec.kind === "linehaul") linehaul += amount;
    else if (spec.kind === "settlement") settled += amount;
    else accessorials += amount;
  }

  const round = (v) => Math.round(v * 100) / 100;
  const total = round(linehaul + accessorials);

  return {
    linehaul: round(linehaul),
    accessorials: round(accessorials),
    total,
    settled: round(settled),
    balance: round(total - settled),
  };
};

/**
 * Which payee a line belongs to.
 *
 * The driver wins over the carrier: a Driver Pay line on a carrier's leg is
 * money owed to the person, and it is the person who gets paid it. Matches
 * payeeKey on the server, so what the screen groups is what the server
 * validates.
 */
export const payeeKeyOf = (line) =>
  line?.driverId
    ? `driver:${line.driverId}`
    : line?.fleetOwnerId
      ? `carrier:${line.fleetOwnerId}`
      : "unassigned";

const UNASSIGNED = {
  key: "unassigned",
  kind: "unassigned",
  name: "Not assigned to anyone",
  hint: "Charges on the load itself rather than on one carrier or driver.",
};

const ChargeEditor = ({
  side, // "receivable" | "payable"
  charges = [], // catalog entries for this side
  lines = [],
  onChange,
  disabled,
  compact = false,
  // The drivers who ran this load, for the payable side only. Given, a Driver
  // Pay line can name which of them it settles — two drivers on one load are
  // owed two different amounts, and a single figure cannot say who gets what.
  // See driverPayables on the server.
  drivers = [],
  // Everybody this load's payables could be owed to: its carriers and its
  // drivers, in the order they should be read. Given, the lines are grouped
  // under them instead of listed flat. Empty on the receivable side and in the
  // load form's popup, which are one bill to one party.
  payees = [],
}) => {
  const bySide = useMemo(() => new Map(charges.map((c) => [c.key, c])), [charges]);
  const totals = useMemo(() => computeTotals(lines, bySide), [lines, bySide]);

  // What a percentage line is a percentage of. Recomputed as the linehaul is
  // typed, so the cash figure under a "18%" surcharge moves with it.
  const linehaulBase = useMemo(() => linehaulOf(lines, bySide), [lines, bySide]);

  const setLine = (index, patch) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index));

  /**
   * Add a line, already belonging to whoever it was added under.
   *
   * Stamping the payee here is the whole point of the grouped add: the office
   * clicks "Add a charge" under a name, so the line is that person's without
   * anybody having to go back and say so in a second control.
   */
  const addLine = (chargeType, payee) => {
    if (!chargeType) return;

    const line = { chargeType, amount: "", note: "" };

    if (payee?.kind === "driver") {
      line.driverId = payee.id;
      line.driverName = payee.name || "";
      // The carrier who put them on the load, so a driver's pay still reads as
      // part of that carrier's leg on a split load.
      if (payee.fleetOwnerId) line.fleetOwnerId = payee.fleetOwnerId;
    } else if (payee?.kind === "carrier") {
      line.fleetOwnerId = payee.id;
    }

    onChange([...lines, line]);
  };

  // Grouped only where there is somebody to group under. The receivable side
  // and the load form's popup pass no payees and are unchanged by any of this.
  const isGrouped = side === "payable" && payees.length > 0 && !compact;

  // Only a Driver Pay line that names nobody still needs the picker — inside a
  // driver's group the group has already answered the question. Computed across
  // the whole side so every group shares one grid and the columns line up.
  const needsDriverPicker = (line) =>
    side === "payable" &&
    line.chargeType === "driverPay" &&
    !line.driverId &&
    drivers.length > 0;

  const showDriverColumn = lines.some(needsDriverPicker);

  // Paid lines are frozen. The pay button on the panel above is what settles a
  // driver, and letting the amount stay editable afterwards would mean the
  // figure on screen and the figure that actually went out could differ with
  // nothing recording that they had.
  const isSettledDriverLine = (line) => Boolean(line.paidAt);

  const columns = compact
    ? "1fr 110px 32px"
    : showDriverColumn
      ? "1fr 150px 140px 1fr 32px"
      : "1fr 140px 1fr 32px";

  /**
   * The charges still offerable, given what this payee already has.
   *
   * Per payee rather than per side: a non-repeatable charge already on one
   * driver's lines is still a charge the next driver may be owed, and the
   * server validates it the same way. Offering a charge the save would refuse
   * is a trap; hiding one the save would accept is a dead end.
   */
  const availableFor = (own) =>
    charges.filter(
      (c) => c.repeatable || !own.some(({ line }) => line.chargeType === c.key),
    );

  const groupsOf = (items) => {
    const map = new Map();
    items.forEach((c) => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group).push(c);
    });
    return [...map.entries()];
  };

  const linehaulSpec = charges.find((c) => c.kind === "linehaul");

  // Every line, tagged with its position in the flat array — the editors below
  // write back by index, and grouping must not lose which line is which.
  const entries = useMemo(
    () => lines.map((line, index) => ({ line, index })),
    [lines],
  );

  /**
   * The payees to show, in reading order.
   *
   * Those the load knows about first, whether or not anybody has costed them:
   * a driver with no lines is a gap to fill, and a group with an empty list and
   * an add button says that more clearly than an absence does. Then anybody who
   * appears only on the ledger — somebody taken off the load after being costed,
   * whose money is still owed — and last the lines that name nobody.
   */
  const groups = useMemo(() => {
    if (!isGrouped) return [];

    const byKey = new Map();
    const push = (payee) => {
      if (!byKey.has(payee.key)) byKey.set(payee.key, { ...payee, entries: [] });
    };

    payees.forEach(push);

    entries.forEach((entry) => {
      const key = payeeKeyOf(entry.line);

      if (!byKey.has(key)) {
        push(
          key === "unassigned"
            ? UNASSIGNED
            : {
                key,
                kind: key.startsWith("driver:") ? "driver" : "carrier",
                id: key.split(":")[1],
                // Denormalised off the line, so a payee who has left the load
                // still reads as a name rather than as an id.
                name: entry.line.driverName || "Another payee",
                hint: "No longer on this load — the money booked against them is.",
              },
        );
      }

      byKey.get(key).entries.push(entry);
    });

    return [...byKey.values()];
  }, [isGrouped, payees, entries]);

  const renderLine = ({ line, index }) => {
    const spec = bySide.get(line.chargeType);
    const isSettlement = spec?.kind === "settlement";
    const settled = isSettledDriverLine(line);

    return (
      <div
        key={`${line.chargeType}-${index}`}
        className={`grid gap-2 items-start border rounded-lg px-2.5 py-2 ${
          settled
            ? "border-green-200 bg-green-50/50"
            : isSettlement
              ? "border-blue-200 bg-blue-50/40"
              : spec?.kind === "linehaul"
                ? "border-indigo-200 bg-indigo-50/40"
                : "border-gray-200"
        }`}
        style={{ gridTemplateColumns: columns }}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {spec?.label || line.chargeType}
          </p>
          {spec?.help && !compact && (
            <p className="text-[13px] text-gray-500 leading-snug">{spec.help}</p>
          )}
          {isSettlement && (
            <p className="text-[13px] text-blue-700 font-medium">
              Comes off the balance — not added to the total
            </p>
          )}
          {settled && (
            <p className="text-[13px] font-medium text-green-700">
              Paid — put the payment back to edit this
            </p>
          )}
        </div>

        {showDriverColumn &&
          (needsDriverPicker(line) ? (
            <select
              className={`${uiStyles.select} text-sm`}
              value={line.driverId || ""}
              disabled={disabled || settled}
              onChange={(e) => {
                const driver = drivers.find((d) => d.driverId === e.target.value);
                setLine(index, {
                  driverId: e.target.value,
                  // Copied onto the line so a settlement still names the
                  // person after they come off the load's roster.
                  driverName: driver?.driverName || "",
                });
              }}
            >
              <option value="">Choose a driver…</option>
              {drivers.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.driverName || "Unnamed driver"}
                  {d.driverCode ? ` · ${d.driverCode}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span />
          ))}

        {/* Quantity and rate used to be collected here and were never
            used: nothing multiplies them, and `amount` is the only
            figure any total reads. Three boxes for one number invited
            the reader to type 2 and 75 and expect 150. The fields stay
            on the schema so lines captured before this still render;
            where the working is worth recording, it goes in the note. */}
        {/* Quoted either way. A percentage line stores the
            percentage and shows what it comes to underneath — the cash
            figure is what every total reads, and a surcharge whose
            working is invisible is one nobody can check. */}
        <div>
          <div className="flex items-stretch gap-1">
            {spec?.percentOf && (
              <div className="flex overflow-hidden rounded-md border border-gray-300">
                {["AMOUNT", "PERCENT"].map((option) => {
                  const on = (line.basis || "AMOUNT") === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled || settled}
                      onClick={() =>
                        setLine(index, {
                          basis: option,
                          // The two mean different things, so the old
                          // number is cleared rather than reinterpreted
                          // — 18 as dollars is not 18 as a percentage.
                          amount: "",
                          rate: "",
                        })
                      }
                      className={`px-2 text-xs font-bold transition-colors ${
                        on
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {option === "AMOUNT" ? "$" : "%"}
                    </button>
                  );
                })}
              </div>
            )}

            {line.basis === "PERCENT" ? (
              <input
                type="number"
                step="0.01"
                className={`${uiStyles.input} min-w-0 flex-1 text-sm font-semibold text-right`}
                placeholder="0.00"
                value={line.rate ?? ""}
                disabled={disabled || settled}
                onChange={(e) => setLine(index, { rate: e.target.value })}
              />
            ) : (
              <input
                type="number"
                step="0.01"
                className={`${uiStyles.input} min-w-0 flex-1 text-sm font-semibold text-right`}
                placeholder="0.00"
                value={line.amount ?? ""}
                disabled={disabled || settled}
                onChange={(e) => setLine(index, { amount: e.target.value })}
              />
            )}
          </div>

          {line.basis === "PERCENT" && (
            <p className="mt-0.5 text-right text-[13px] text-gray-500">
              {linehaulBase > 0
                ? `${money(amountOf(line, linehaulBase))} of ${money(linehaulBase)}`
                : "Add the base charge first"}
            </p>
          )}
        </div>

        {!compact && (
          <input
            className={`${uiStyles.input} text-sm`}
            placeholder={spec?.requiresNote ? "What is this for? *" : "Note"}
            value={line.note ?? ""}
            disabled={disabled || settled}
            onChange={(e) => setLine(index, { note: e.target.value })}
          />
        )}

        <button
          type="button"
          onClick={() => removeLine(index)}
          disabled={disabled || settled}
          title={settled ? "Already paid — put the payment back first" : "Remove"}
          className="p-1 text-gray-400 hover:text-red-600 mt-1"
        >
          <DeleteOutlineIcon style={{ fontSize: 20 }} />
        </button>
      </div>
    );
  };

  const columnHeadings = !compact && (
    <div
      className="hidden md:grid gap-2 px-2.5 pb-0.5 text-[13px] font-semibold uppercase tracking-wider text-gray-400"
      style={{ gridTemplateColumns: columns }}
    >
      <span>Charge</span>
      {showDriverColumn && <span>Driver</span>}
      <span className="text-right">Amount</span>
      <span>Note</span>
      <span />
    </div>
  );

  /** The picker, and the one-click base charge where a payee has none. */
  const addControls = (own, payee) => {
    const available = availableFor(own);
    const hasLinehaul = own.some(
      ({ line }) => bySide.get(line.chargeType)?.kind === "linehaul",
    );

    return (
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <AddIcon fontSize="small" className="text-indigo-600" />
        <select
          className={`${uiStyles.select} max-w-xs text-sm`}
          value=""
          disabled={disabled}
          onChange={(e) => {
            addLine(e.target.value, payee);
            e.target.value = "";
          }}
        >
          <option value="">
            {payee?.name ? `Add a charge for ${payee.name}…` : "Add a charge…"}
          </option>
          {groupsOf(available).map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {!hasLinehaul && linehaulSpec && (
          <button
            type="button"
            onClick={() => addLine(linehaulSpec.key, payee)}
            disabled={disabled}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            + {linehaulSpec.label}
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      {isGrouped ? (
        <div className="space-y-3">
          {columnHeadings}

          {groups.map((payee) => {
            const own = payee.entries;
            const subtotal = computeTotals(
              own.map(({ line }) => line),
              bySide,
            );

            return (
              <section
                key={payee.key}
                className="rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Whose money this is. The name leads, because on a payable
                    side "who" is the question every row is an answer to — two
                    identical Charge rows are only tellable apart by it. */}
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {payee.kind === "driver" ? (
                      <BadgeOutlinedIcon
                        className="text-amber-600"
                        style={{ fontSize: 18 }}
                      />
                    ) : payee.kind === "carrier" ? (
                      <LocalShippingOutlinedIcon
                        className="text-slate-600"
                        style={{ fontSize: 18 }}
                      />
                    ) : null}

                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {payee.name}
                        {payee.code && (
                          <span className="ml-1.5 text-[13px] font-mono font-normal text-gray-400">
                            {payee.code}
                          </span>
                        )}
                      </p>
                      {/* Which stretch this person ran. The name says who is
                          owed; the route says what for — and on a load split
                          between two carriers it is the only thing that tells
                          two identical rows of money apart. */}
                      {(payee.from || payee.to) && (
                        <p className="text-[13px] font-medium text-gray-600 truncate">
                          {payee.from || "—"}
                          <span className="mx-1 text-gray-400">→</span>
                          {payee.to || "—"}
                        </p>
                      )}
                      <p className="text-[13px] text-gray-500">
                        {payee.kind === "driver"
                          ? "Driver"
                          : payee.kind === "carrier"
                            ? "Carrier"
                            : ""}
                        {payee.hint ? ` · ${payee.hint}` : ""}
                        {own.length === 0 ? " · nothing booked yet" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-gray-900">
                      {money(subtotal.total)}
                    </p>
                    {payee.agreed != null && (
                      <p
                        className={`text-[13px] ${
                          subtotal.total !== payee.agreed
                            ? "font-medium text-amber-700"
                            : "text-gray-500"
                        }`}
                      >
                        agreed {money(payee.agreed)}
                      </p>
                    )}
                  </div>
                </header>

                <div className="px-3 py-2.5">
                  {own.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      Nothing is booked against {payee.name} yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">{own.map(renderLine)}</div>
                  )}

                  {addControls(own, payee)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {/* Lines */}
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-300 rounded-lg">
              No charges yet. Start with{" "}
              <span className="font-medium">
                {linehaulSpec?.label || "the base charge"}
              </span>{" "}
              and add accessorials on top.
            </p>
          ) : (
            <div className="space-y-1.5">
              {/* Column headings — the inputs carry placeholders only, which
                  disappear as soon as a value is typed. Hidden in compact mode,
                  which has no note column. */}
              {columnHeadings}
              {entries.map(renderLine)}
            </div>
          )}

          {addControls(entries, null)}
        </>
      )}

      {/* Totals */}
      <div className="mt-4 pt-3 border-t border-gray-200 space-y-1">
        <Row label={linehaulSpec?.label || "Base"} value={totals.linehaul} />
        <Row label="Accessorials" value={totals.accessorials} />
        <Row label="Total" value={totals.total} strong />
        {totals.settled > 0 && (
          <>
            <Row
              label={side === "receivable" ? "Advance received" : "Advance paid"}
              value={-totals.settled}
              tone="blue"
            />
            <Row
              label={side === "receivable" ? "Balance due" : "Balance payable"}
              value={totals.balance}
              strong
            />
          </>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value, strong, tone }) => (
  <div className="flex items-center justify-between">
    <span
      className={`${strong ? "text-sm font-semibold text-gray-900" : "text-xs text-gray-500"} ${
        tone === "blue" ? "text-blue-700" : ""
      }`}
    >
      {label}
    </span>
    <span
      className={`tabular-nums ${
        strong ? "text-base font-bold text-gray-900" : "text-sm text-gray-700"
      } ${tone === "blue" ? "text-blue-700" : ""}`}
    >
      {money(value)}
    </span>
  </div>
);

export { money };
export default ChargeEditor;
