import { useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) =>
  `$${(Math.round((Number(value) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Mirrors totalsFor() on the server. Kept in step by the shared line `kind`. */
export const computeTotals = (lines, catalogBySide) => {
  let linehaul = 0;
  let accessorials = 0;
  let settled = 0;

  for (const line of lines) {
    const spec = catalogBySide.get(line.chargeType);
    if (!spec) continue;

    const amount = Number(line.amount) || 0;

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

const ChargeEditor = ({
  side, // "receivable" | "payable"
  charges = [], // catalog entries for this side
  lines = [],
  onChange,
  disabled,
  compact = false,
}) => {
  const bySide = useMemo(() => new Map(charges.map((c) => [c.key, c])), [charges]);
  const totals = useMemo(() => computeTotals(lines, bySide), [lines, bySide]);

  const setLine = (index, patch) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index));

  const addLine = (chargeType) => {
    if (!chargeType) return;
    onChange([...lines, { chargeType, amount: "", note: "" }]);
  };

  // A non-repeatable charge already on the ledger is dropped from the picker
  // rather than offered and then rejected on save — the server refuses a second
  // "Fuel Surcharge", so offering one is a trap.
  const available = charges.filter(
    (c) => c.repeatable || !lines.some((l) => l.chargeType === c.key),
  );

  const grouped = useMemo(() => {
    const map = new Map();
    available.forEach((c) => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group).push(c);
    });
    return [...map.entries()];
  }, [available]);

  const linehaulSpec = charges.find((c) => c.kind === "linehaul");
  const hasLinehaul = lines.some(
    (l) => bySide.get(l.chargeType)?.kind === "linehaul",
  );

  return (
    <div>
      {/* Lines */}
      {lines.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-300 rounded-lg">
          No charges yet. Start with{" "}
          <span className="font-medium">{linehaulSpec?.label || "the base charge"}</span>{" "}
          and add accessorials on top.
        </p>
      ) : (
        <div className="space-y-1.5">
          {/* Column headings — the inputs carry placeholders only, which
              disappear as soon as a value is typed. Hidden in compact mode,
              which has no note column. */}
          {!compact && (
            <div
              className="hidden md:grid gap-2 px-2.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
              style={{ gridTemplateColumns: "1fr 140px 1fr 32px" }}
            >
              <span>Charge</span>
              <span className="text-right">Amount</span>
              <span>Note</span>
              <span />
            </div>
          )}

          {lines.map((line, index) => {
            const spec = bySide.get(line.chargeType);
            const isSettlement = spec?.kind === "settlement";

            return (
              <div
                key={`${line.chargeType}-${index}`}
                className={`grid gap-2 items-start border rounded-lg px-2.5 py-2 ${
                  isSettlement
                    ? "border-blue-200 bg-blue-50/40"
                    : spec?.kind === "linehaul"
                      ? "border-indigo-200 bg-indigo-50/40"
                      : "border-gray-200"
                }`}
                style={{
                  gridTemplateColumns: compact
                    ? "1fr 110px 32px"
                    : "1fr 140px 1fr 32px",
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {spec?.label || line.chargeType}
                  </p>
                  {spec?.help && !compact && (
                    <p className="text-[11px] text-gray-500 leading-snug">{spec.help}</p>
                  )}
                  {isSettlement && (
                    <p className="text-[11px] text-blue-700 font-medium">
                      Comes off the balance — not added to the total
                    </p>
                  )}
                </div>

                {/* Quantity and rate used to be collected here and were never
                    used: nothing multiplies them, and `amount` is the only
                    figure any total reads. Three boxes for one number invited
                    the reader to type 2 and 75 and expect 150. The fields stay
                    on the schema so lines captured before this still render;
                    where the working is worth recording, it goes in the note. */}
                <input
                  type="number"
                  step="0.01"
                  className={`${uiStyles.input} text-sm font-semibold text-right`}
                  placeholder="0.00"
                  value={line.amount ?? ""}
                  disabled={disabled}
                  onChange={(e) => setLine(index, { amount: e.target.value })}
                />

                {!compact && (
                  <input
                    className={`${uiStyles.input} text-sm`}
                    placeholder={spec?.requiresNote ? "What is this for? *" : "Note"}
                    value={line.note ?? ""}
                    disabled={disabled}
                    onChange={(e) => setLine(index, { note: e.target.value })}
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={disabled}
                  title="Remove"
                  className="p-1 text-gray-400 hover:text-red-600 mt-1"
                >
                  <DeleteOutlineIcon style={{ fontSize: 18 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add */}
      <div className="mt-2.5 flex items-center gap-2">
        <AddIcon fontSize="small" className="text-indigo-600" />
        <select
          className={`${uiStyles.select} max-w-xs text-sm`}
          value=""
          disabled={disabled}
          onChange={(e) => {
            addLine(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Add a charge…</option>
          {grouped.map(([group, items]) => (
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
            onClick={() => addLine(linehaulSpec.key)}
            disabled={disabled}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            + {linehaulSpec.label}
          </button>
        )}
      </div>

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
