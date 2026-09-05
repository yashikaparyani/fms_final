import { useEffect, useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import PaymentsIcon from "@mui/icons-material/Payments";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { money, today, errorFrom, documentNoun } from "./invoiceUi";

// ─── Recording a payment ──────────────────────────────────────────────────────
// The form that captures money moving, in or out.
//
// ── The document number is the point of this dialog ──────────────────────────
// A payment row with an amount and a date is almost useless: come month end,
// somebody has a bank statement with forty lines on it and no way to say which
// of these rows is which. What makes the row worth keeping is the reference the
// bank issued — the cheque number, the ACH trace, the wire IMAD.
//
// So the field is not labelled "Reference". It relabels itself the moment a
// method is chosen — "Cheque Number", "Authorisation Code" — because a field
// asking for a generic reference gets filled in generically. The labels, the
// placeholders and whether the field is required at all come from the server's
// own catalog (config/paymentMethods.js), so the form cannot drift from what the
// API will accept.
//
// Cash is the one method that does not demand a number, because there is no
// third party issuing one and a required field there would only produce an
// invented value.
// ─────────────────────────────────────────────────────────────────────────────

const RecordPaymentDialog = ({ invoice, open, onClose, onRecorded }) => {
  const [methods, setMethods] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    amount: "",
    paidOn: today(),
    method: "CHECK",
    documentNumber: "",
    bankName: "",
    note: "",
    sendReceipt: false,
  });

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!open) return;

    // Pre-filled with the whole balance: paying an invoice in full is the
    // overwhelmingly common case, and a part payment is a number somebody is
    // deliberately typing anyway.
    set({
      amount: invoice?.balance ? String(invoice.balance) : "",
      paidOn: today(),
      documentNumber: "",
      bankName: "",
      note: "",
    });
  }, [open, invoice?._id, invoice?.balance]);

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

  if (!open || !invoice) return null;

  const incoming = invoice.direction === "AR";
  const noun = documentNoun(invoice);

  const amount = Number(form.amount) || 0;
  const overpaying = amount > (invoice.balance || 0) + 0.005;
  const missingReference = spec?.documentRequired && !form.documentNumber.trim();

  const submit = async (event) => {
    event.preventDefault();

    if (amount <= 0) return notify.error("Enter the amount that was paid.");
    if (overpaying) {
      return notify.error(
        `That is more than the ${money(invoice.balance)} outstanding on ${invoice.invoiceNumber}.`,
      );
    }
    if (missingReference) {
      return notify.error(`${spec.documentLabel} is required for a ${spec.label} payment.`);
    }

    try {
      setSaving(true);
      const { data } = await api.post("/payments", {
        invoice: invoice._id,
        amount,
        paidOn: form.paidOn,
        method: form.method,
        documentNumber: form.documentNumber.trim(),
        bankName: form.bankName.trim(),
        note: form.note.trim(),
        sendReceipt: form.sendReceipt ? "true" : "false",
      });

      notify.success(data.message);

      // A receipt that did not send is worth saying out loud — the payment is
      // recorded either way, and silence here is how somebody assumes the
      // customer was told when they were not.
      if (form.sendReceipt && data.emailStatus && !data.emailStatus.sent) {
        notify.warning(
          `Payment recorded, but the receipt was not emailed: ${data.emailStatus.message || "email is unavailable"}`,
        );
      }

      onRecorded?.(data);
      onClose();
    } catch (err) {
      notify.error(errorFrom(err, "Could not record the payment"));
    } finally {
      setSaving(false);
    }
  };

  return (
    // z-[1000] is the house level for a dialog — the same one BaseAmountDialog
    // sits at. At z-50 this shared a layer with the sidebar and the sticky table
    // headers, which is how it came to be drawn tangled up in them.
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      {/* A column, not one long scrolling box: the heading says which invoice is
          being paid and the buttons commit the payment, so neither may scroll
          away. Only the fields between them move. `overflow-hidden` keeps that
          scrolling body inside the card's rounded corners. */}
      <div className="flex w-full max-w-lg max-h-[92vh] flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        <div className="flex shrink-0 items-start justify-between border-b border-hairline p-5">
          <div>
            <p className="flex items-center gap-2 text-lg font-bold text-ink-800">
              <PaymentsIcon fontSize="small" className="text-accent-600" />
              {incoming ? "Record payment received" : "Record payment made"}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              {noun} {invoice.invoiceNumber} · {invoice.party?.name || "—"}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-3 border-b border-hairline bg-ink-50 px-5 py-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-500">Total</p>
            <p className="text-sm font-bold tabular-nums">{money(invoice.total)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-500">Already paid</p>
            <p className="text-sm font-bold tabular-nums text-green-700">
              {money((invoice.amountPaid || 0) + (invoice.advanceApplied || 0))}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-500">Outstanding</p>
            <p className="text-sm font-bold tabular-nums text-red-700">
              {money(invoice.balance)}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          {/* min-h-0 on both this and the form above it: without it a flex child
              refuses to shrink below its content and the scrollbar never
              appears — the card just grows past the bottom of the screen. */}
          <div className="min-h-0 grow space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={uiStyles.label}>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className={`${uiStyles.input} ${overpaying ? uiStyles.inputError : ""} tabular-nums`}
                placeholder="0.00"
                autoFocus
              />
              {overpaying && (
                <p className="mt-1 text-xs text-bad-600">
                  More than the {money(invoice.balance)} outstanding.
                </p>
              )}
            </div>

            <div>
              <label className={uiStyles.label}>Payment date</label>
              <input
                type="date"
                value={form.paidOn}
                onChange={(e) => set({ paidOn: e.target.value })}
                className={uiStyles.input}
              />
              {/* When the money moved, not when the row was typed — a cheque
                  dated the 28th entered on the 2nd belongs in the 28th's month. */}
              <p className="mt-1 text-xs text-ink-400">When the money actually moved.</p>
            </div>
          </div>

          <div>
            <label className={uiStyles.label}>Method</label>
            <select
              value={form.method}
              onChange={(e) => set({ method: e.target.value, documentNumber: "" })}
              className={uiStyles.select}
            >
              {methods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            {spec?.help && <p className="mt-1 text-xs text-ink-400">{spec.help}</p>}
          </div>

          {/* The field that relabels itself. See the note at the top. */}
          <div>
            <label className={uiStyles.label}>
              {spec?.documentLabel || "Reference number"}
              {spec?.documentRequired ? (
                <span className="ml-1 text-bad-600">*</span>
              ) : (
                <span className="ml-1 font-normal text-ink-400">(optional)</span>
              )}
            </label>
            <input
              value={form.documentNumber}
              onChange={(e) => set({ documentNumber: e.target.value })}
              className={uiStyles.input}
              placeholder={spec?.documentPlaceholder || ""}
            />
            <p className="mt-1 text-xs text-ink-400">
              What this payment will be matched against on the bank statement.
            </p>
          </div>

          {spec?.asksBank && (
            <div>
              <label className={uiStyles.label}>
                Bank <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                value={form.bankName}
                onChange={(e) => set({ bankName: e.target.value })}
                className={uiStyles.input}
                placeholder="e.g. Chase"
              />
            </div>
          )}

          <div>
            <label className={uiStyles.label}>
              Note <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              className={uiStyles.input}
              placeholder="Anything worth knowing about this payment"
            />
          </div>

          {incoming && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-hairline bg-ink-50 p-3">
              <input
                type="checkbox"
                checked={form.sendReceipt}
                onChange={(e) => set({ sendReceipt: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-semibold text-ink-700">Email a receipt</span>
                <span className="block text-xs text-ink-500">
                  Confirms the amount received and states what is still outstanding.
                  Sent to {invoice.party?.email || "the address on their record"}.
                </span>
              </span>
            </label>
          )}

          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-hairline bg-surface p-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || amount <= 0 || overpaying || missingReference}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Recording…" : `Record ${money(amount)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordPaymentDialog;
