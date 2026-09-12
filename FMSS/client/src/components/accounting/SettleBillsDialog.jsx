import { useEffect, useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import PaymentsIcon from "@mui/icons-material/Payments";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { money, today, formatDate, errorFrom } from "./invoiceUi";

// ─── Paying several bills at once ─────────────────────────────────────────────
// A payment run: the office works down the payables register, ticks the carriers
// and drivers being paid this afternoon, and records the lot as one act.
//
// ── Why there is no amount field ─────────────────────────────────────────────
// Every bill ticked is settled in full. That is not a shortcut, it is what a
// payment run IS — nobody decides at the end of a list of forty bills that one
// of them gets 60%. A part payment is a deliberate, negotiated thing and belongs
// in the single-bill form on the invoice itself, where somebody has to type the
// figure and can be asked why.
//
// It also keeps this dialog honest: the total on the button is the sum of the
// balances listed, with no splitting rule in between that anybody has to trust.
//
// The same rules run again in settleBills on the server.
// ─────────────────────────────────────────────────────────────────────────────

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const SettleBillsDialog = ({ open, bills = [], onClose, onSettled }) => {
  const [methods, setMethods] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    paidOn: today(),
    method: "CHECK",
    documentNumber: "",
    bankName: "",
    note: "",
  });

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!open) return;
    set({ paidOn: today(), documentNumber: "", bankName: "", note: "" });
  }, [open]);

  useEffect(() => {
    api
      .get("/payments/methods")
      .then(({ data }) => setMethods(data.methods || []))
      .catch(() => {
        /* the picker degrades to whatever the server already accepts */
      });
  }, []);

  const spec = useMemo(
    () => methods.find((m) => m.key === form.method),
    [methods, form.method],
  );

  const total = round(bills.reduce((sum, bill) => sum + (Number(bill.balance) || 0), 0));

  // One cheque number cannot cover two payees — the server refuses it, so the
  // form says so before somebody types the number.
  const payees = useMemo(
    () => new Set(bills.map((bill) => bill.party?.name || "—")),
    [bills],
  );
  // Mirrors the guard in settleBills: a shared instrument number across payees
  // is refused whether the method demands one or somebody typed one anyway.
  const splitPayees =
    payees.size > 1 && (!!spec?.documentRequired || !!form.documentNumber.trim());

  if (!open) return null;

  const submit = async () => {
    try {
      setSaving(true);
      const { data } = await api.post("/payments/settle", {
        invoices: bills.map((bill) => ({ invoice: bill._id })),
        paidOn: form.paidOn,
        method: form.method,
        documentNumber: form.documentNumber,
        bankName: form.bankName,
        note: form.note,
      });
      notify.success(data.message);
      onSettled?.(data);
      onClose();
    } catch (err) {
      notify.error(errorFrom(err, "Could not record the payment run"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2">
            <PaymentsIcon className="text-fuel-600" fontSize="small" />
            <div>
              <p className="text-base font-bold text-ink-900">
                Mark {bills.length} bill{bills.length === 1 ? "" : "s"} paid
              </p>
              <p className="text-xs text-ink-500">
                Each settled in full — {money(total)} across {payees.size} payee
                {payees.size === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={uiStyles.label}>Paid on</label>
              <input
                type="date"
                className={uiStyles.input}
                value={form.paidOn}
                onChange={(e) => set({ paidOn: e.target.value })}
              />
            </div>

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
                {spec?.documentRequired ? " *" : ""}
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

          {splitPayees && (
            <p className="rounded-lg border border-warn-100 bg-warn-50 px-3 py-2 text-sm font-semibold text-warn-700">
              These bills are for {payees.size} different payees, so they cannot share
              one {(spec?.documentLabel || "reference").toLowerCase()} — it identifies a
              single cheque or transfer. Settle one payee at a time, or use a method
              that does not carry one.
            </p>
          )}

          <div className="max-h-60 overflow-y-auto rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="py-2 pl-3 pr-3 font-semibold">Bill</th>
                  <th className="py-2 pr-3 font-semibold">Payee</th>
                  <th className="py-2 pr-3 font-semibold">Due</th>
                  <th className="py-2 pr-3 text-right font-semibold">Paying</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill._id} className="border-b border-hairline/60">
                    <td className="py-1.5 pl-3 pr-3">
                      <p className="font-semibold text-ink-800">{bill.invoiceNumber}</p>
                      {bill.loadId && bill.loadId !== bill.invoiceNumber && (
                        <p className="text-[11px] text-ink-400">{bill.loadId}</p>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-700">{bill.party?.name || "—"}</td>
                    <td className="py-1.5 pr-3 text-ink-600">{formatDate(bill.dueDate)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-ink-900">
                      {money(bill.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className={uiStyles.label}>Note</label>
            <input
              className={uiStyles.input}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
          <div className="text-sm">
            <span className="text-ink-500">Paying out </span>
            <span className="font-bold tabular-nums text-ink-900">{money(total)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || splitPayees || !bills.length || total <= 0}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Recording…" : `Pay ${money(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettleBillsDialog;
