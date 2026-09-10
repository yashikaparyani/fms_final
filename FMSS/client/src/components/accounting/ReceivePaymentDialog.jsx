import { useEffect, useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import PaymentsIcon from "@mui/icons-material/Payments";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { money, today, formatDate, errorFrom } from "./invoiceUi";

// ─── Receiving one payment against several loads ──────────────────────────────
// A customer pays six loads with one transfer. This is where that gets recorded
// as the single event it was, rather than as six visits to six invoices.
//
// ── The preview is the point ─────────────────────────────────────────────────
// Money arrives as a lump and has to land on specific loads, and which loads it
// lands on decides which ones stop appearing on the aging report. So the split
// is shown before it is committed, per load, with the balance each will be left
// at. A dialog that took an amount and reported "$12,000 recorded" afterwards
// would be asking somebody to trust an allocation they never saw.
//
// ── Two ways to split it ─────────────────────────────────────────────────────
//   Oldest first   fills each load in due-date order until the money runs out.
//                  This CLEARS loads, which is what the office needs — whole
//                  invoices settled and at most one part-paid.
//   Proportional   gives every selected load its share by size. For when a
//                  customer has genuinely paid something off everything.
//
// Either can be overridden by typing amounts per load, because the remittance
// advice sometimes says exactly where the money goes and the office should not
// have to fight the form about it.
//
// The same rules run again on the server (see receivePayment) — this is the
// half that has to be legible, not the half that has to be right.
// ─────────────────────────────────────────────────────────────────────────────

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Fill each load to its balance, in the order given. */
const oldestFirst = (rows, amount) => {
  let left = round(amount);

  return rows.map((row) => {
    const take = round(Math.min(left, row.balance));
    left = round(left - take);
    return take;
  });
};

/** Give each load its share of the total by size. */
const proportional = (rows, amount) => {
  const outstanding = round(rows.reduce((sum, row) => sum + row.balance, 0));
  if (outstanding <= 0) return rows.map(() => 0);

  const shares = rows.map((row) => round((round(amount) * row.balance) / outstanding));

  // The rounding remainder goes on the largest row, where it cannot exceed that
  // load's balance — mirrors the server.
  const drift = round(round(amount) - shares.reduce((sum, v) => sum + v, 0));
  if (drift !== 0 && shares.length) {
    let biggest = 0;
    shares.forEach((value, index) => {
      if (value > shares[biggest]) biggest = index;
    });
    shares[biggest] = round(Math.min(shares[biggest] + drift, rows[biggest].balance));
  }

  return shares;
};

const ReceivePaymentDialog = ({ open, customerName, invoices = [], onClose, onRecorded }) => {
  const [methods, setMethods] = useState([]);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState({});
  const [manual, setManual] = useState({});

  const [form, setForm] = useState({
    amount: "",
    paidOn: today(),
    method: "CHECK",
    documentNumber: "",
    bankName: "",
    note: "",
    strategy: "OLDEST_FIRST",
  });

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  // Only what is actually owed. A settled load in the list would be a checkbox
  // that can only produce an error.
  const openRows = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status !== "VOID" && Number(invoice.balance) > 0)
        .map((invoice) => ({
          id: invoice._id,
          loadId: invoice.loadId || invoice.invoiceNumber,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          daysOverdue: invoice.daysOverdue || 0,
          total: Number(invoice.total) || 0,
          balance: round(invoice.balance),
        }))
        // Oldest debt first, which is the order it is normally settled in.
        .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)),
    [invoices],
  );

  useEffect(() => {
    if (!open) return;
    // Everything ticked, because a customer paying usually pays what they owe.
    setPicked(Object.fromEntries(openRows.map((row) => [row.id, true])));
    setManual({});
    set({
      amount: String(round(openRows.reduce((sum, row) => sum + row.balance, 0))),
      paidOn: today(),
      documentNumber: "",
      bankName: "",
      note: "",
      strategy: "OLDEST_FIRST",
    });
    // openRows is derived from the invoices prop; re-seeding on every identity
    // change would fight the user as they type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    api
      .get("/payments/methods")
      .then(({ data }) => setMethods(data.methods || []))
      .catch(() => {
        /* the picker degrades to whatever the server already accepts */
      });
  }, []);

  const spec = useMemo(() => methods.find((m) => m.key === form.method), [methods, form.method]);

  const selected = useMemo(
    () => openRows.filter((row) => picked[row.id]),
    [openRows, picked],
  );

  const selectedOutstanding = round(
    selected.reduce((sum, row) => sum + row.balance, 0),
  );

  const usingManual = Object.keys(manual).some(
    (id) => picked[id] && String(manual[id] ?? "").trim() !== "",
  );

  // What each selected load would take. Recomputed as the amount, the tick
  // boxes and the strategy change, so the split on screen is always the split
  // that would be sent.
  const allocation = useMemo(() => {
    if (!selected.length) return {};

    if (usingManual) {
      return Object.fromEntries(
        selected.map((row) => [row.id, round(manual[row.id] ?? 0)]),
      );
    }

    const amounts =
      form.strategy === "PROPORTIONAL"
        ? proportional(selected, form.amount)
        : oldestFirst(selected, form.amount);

    return Object.fromEntries(selected.map((row, index) => [row.id, amounts[index]]));
  }, [selected, form.amount, form.strategy, manual, usingManual]);

  const applying = round(
    selected.reduce((sum, row) => sum + (allocation[row.id] || 0), 0),
  );

  const overAllocated = selected.some(
    (row) => (allocation[row.id] || 0) > row.balance + 0.005,
  );

  if (!open) return null;

  const submit = async () => {
    if (!selected.length) return notify.error("Choose at least one load.");
    if (applying <= 0) return notify.error("Enter the amount that was received.");
    if (overAllocated) {
      return notify.error("One load is being paid more than it owes. Adjust the amounts.");
    }

    try {
      setSaving(true);
      const { data } = await api.post("/payments/receive", {
        // Explicit amounts either way: the preview on screen is what gets sent,
        // so nobody can be surprised by a different split arriving.
        invoices: selected.map((row) => ({
          invoice: row.id,
          amount: allocation[row.id] || 0,
        })),
        paidOn: form.paidOn,
        method: form.method,
        documentNumber: form.documentNumber,
        bankName: form.bankName,
        note: form.note,
      });
      notify.success(data.message);
      onRecorded?.(data);
      onClose();
    } catch (err) {
      notify.error(errorFrom(err, "Could not record the payment"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id) => setPicked((prev) => ({ ...prev, [id]: !prev[id] }));

  const allPicked = openRows.length > 0 && selected.length === openRows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2">
            <PaymentsIcon className="text-good-600" fontSize="small" />
            <div>
              <p className="text-base font-bold text-ink-900">Receive payment</p>
              <p className="text-xs text-ink-500">{customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!openRows.length ? (
            <p className="py-8 text-center text-sm text-ink-500">
              This customer has nothing outstanding.
            </p>
          ) : (
            <>
              {/* ── How much, and how it lands ── */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={uiStyles.label}>Amount received</label>
                  <input
                    type="number"
                    step="0.01"
                    className={uiStyles.input}
                    value={form.amount}
                    disabled={usingManual}
                    onChange={(e) => set({ amount: e.target.value })}
                  />
                  {usingManual && (
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      Set per load below
                    </p>
                  )}
                </div>

                <div>
                  <label className={uiStyles.label}>Received on</label>
                  <input
                    type="date"
                    className={uiStyles.input}
                    value={form.paidOn}
                    onChange={(e) => set({ paidOn: e.target.value })}
                  />
                </div>

                <div>
                  <label className={uiStyles.label}>Split</label>
                  <select
                    className={uiStyles.select}
                    value={form.strategy}
                    disabled={usingManual}
                    onChange={(e) => set({ strategy: e.target.value })}
                  >
                    <option value="OLDEST_FIRST">Oldest first — clears loads</option>
                    <option value="PROPORTIONAL">Proportional — across all</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={uiStyles.label}>Method</label>
                  <select
                    className={uiStyles.select}
                    value={form.method}
                    onChange={(e) => set({ method: e.target.value, documentNumber: "" })}
                  >
                    {methods.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={uiStyles.label}>
                    {spec?.documentLabel || "Reference"}
                    {spec?.requiresDocument ? " *" : ""}
                  </label>
                  <input
                    className={uiStyles.input}
                    placeholder={spec?.documentPlaceholder || ""}
                    value={form.documentNumber}
                    onChange={(e) => set({ documentNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className={uiStyles.label}>Bank</label>
                  <input
                    className={uiStyles.input}
                    value={form.bankName}
                    onChange={(e) => set({ bankName: e.target.value })}
                  />
                </div>
              </div>

              {/* ── Which loads ── */}
              <div className="rounded-lg border border-hairline">
                <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent-600"
                      checked={allPicked}
                      onChange={() =>
                        setPicked(
                          allPicked
                            ? {}
                            : Object.fromEntries(openRows.map((row) => [row.id, true])),
                        )
                      }
                    />
                    {selected.length} of {openRows.length} loads ·{" "}
                    {money(selectedOutstanding)} outstanding
                  </label>
                  {usingManual && (
                    <button
                      type="button"
                      onClick={() => setManual({})}
                      className="text-[11px] font-semibold text-accent-700 hover:underline"
                    >
                      Clear per-load amounts
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="py-2 pl-3 pr-2 font-semibold" />
                        <th className="py-2 pr-3 font-semibold">Load</th>
                        <th className="py-2 pr-3 font-semibold">Due</th>
                        <th className="py-2 pr-3 text-right font-semibold">Open</th>
                        <th className="py-2 pr-3 text-right font-semibold">Applying</th>
                        <th className="py-2 pr-3 text-right font-semibold">Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openRows.map((row) => {
                        const on = !!picked[row.id];
                        const applied = on ? allocation[row.id] || 0 : 0;
                        const left = round(row.balance - applied);

                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-hairline/60 ${on ? "" : "opacity-50"}`}
                          >
                            <td className="py-1.5 pl-3 pr-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-accent-600"
                                checked={on}
                                onChange={() => toggle(row.id)}
                              />
                            </td>
                            <td className="py-1.5 pr-3">
                              <p className="font-semibold text-ink-800">{row.loadId}</p>
                              <p className="text-[11px] text-ink-400">
                                {row.invoiceNumber}
                              </p>
                            </td>
                            <td className="py-1.5 pr-3">
                              <span
                                className={
                                  row.daysOverdue > 0
                                    ? "font-semibold text-bad-600"
                                    : "text-ink-600"
                                }
                              >
                                {formatDate(row.dueDate)}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-ink-600">
                              {money(row.balance)}
                            </td>
                            <td className="py-1.5 pr-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                disabled={!on}
                                placeholder={applied ? String(applied) : "0.00"}
                                value={manual[row.id] ?? ""}
                                onChange={(e) =>
                                  setManual((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                className={`w-24 rounded border px-2 py-1 text-right text-sm tabular-nums ${
                                  applied > row.balance + 0.005
                                    ? "border-bad-400 bg-bad-50"
                                    : "border-ink-300"
                                }`}
                              />
                            </td>
                            <td
                              className={`py-1.5 pr-3 text-right tabular-nums ${
                                on && left <= 0
                                  ? "font-semibold text-good-600"
                                  : "text-ink-600"
                              }`}
                            >
                              {on && left <= 0 ? "Cleared" : money(left)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className={uiStyles.label}>Note</label>
                <input
                  className={uiStyles.input}
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                />
              </div>

              {overAllocated && (
                <p className="rounded-lg border border-bad-200 bg-bad-50 px-3 py-2 text-sm font-semibold text-bad-700">
                  One load is being paid more than it owes. A genuine overpayment
                  is a credit, which is a different document.
                </p>
              )}
            </>
          )}
        </div>

        {openRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
            <div className="text-sm">
              <span className="text-ink-500">Applying </span>
              <span className="font-bold tabular-nums text-ink-900">{money(applying)}</span>
              <span className="text-ink-500">
                {" "}
                across {selected.length} load{selected.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || overAllocated || applying <= 0}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "Recording…" : `Receive ${money(applying)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceivePaymentDialog;
