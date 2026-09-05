import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SendIcon from "@mui/icons-material/Send";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PaymentsIcon from "@mui/icons-material/Payments";
import BlockIcon from "@mui/icons-material/Block";
import UndoIcon from "@mui/icons-material/Undo";
import api from "../../api";
import Swal, { notify } from "../../utils/swal";
import { uiStyles } from "../../style/uiStyles";
import RecordPaymentDialog from "../../components/accounting/RecordPaymentDialog";
import {
  money,
  formatDate,
  statusOf,
  documentNoun,
  errorFrom,
  PARTY_LABEL,
} from "../../components/accounting/invoiceUi";

// ─── One invoice ──────────────────────────────────────────────────────────────
// The document as the recipient will see it, and every action that can be taken
// on it.
//
// ── The page is laid out as the document ─────────────────────────────────────
// Issuer top left, recipient below it, the identity block top right, lines in
// the middle, amount due in a box. That is the same shape as the PDF on purpose:
// staff read this screen to answer a customer's question about a piece of paper
// in front of them, and a screen organised differently from the paper makes
// every one of those conversations slower.
//
// ── Actions the server can refuse ────────────────────────────────────────────
// Editing a sent invoice, voiding one with payments against it, chasing one that
// is already paid — all refused server-side, all hidden here too. The button is
// hidden rather than shown-and-then-rejected because a disabled action with a
// reason is information; an enabled action that fails is a mistake the user made
// on our behalf.
// ─────────────────────────────────────────────────────────────────────────────

const Row = ({ label, value, tone = "" }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-sm text-ink-500">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
  </div>
);

const InvoiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/invoices/${id}`);
      setInvoice(data);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load the invoice"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openPdf = async () => {
    try {
      setBusy("pdf");
      // Fetched as a blob rather than linked to directly: the endpoint is behind
      // the auth header, and a plain <a href> carries no headers at all.
      const { data } = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      // Revoked on a delay: revoking immediately races the new tab's own load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      notify.error(errorFrom(err, "Could not produce the PDF"));
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    const noun = documentNoun(invoice).toLowerCase();

    const { value, isConfirmed } = await Swal.fire({
      title: `Send ${invoice.invoiceNumber}`,
      html: `
        <p style="font-size:13px;color:#6b7280;margin-bottom:10px;text-align:left;">
          The ${noun} goes out with its PDF attached. Sending it freezes the document —
          it cannot be edited afterwards.
        </p>
      `,
      input: "email",
      inputValue: invoice.party?.email || "",
      inputPlaceholder: "Where to send it",
      showCancelButton: true,
      confirmButtonText: "Send",
      confirmButtonColor: "#1d4ed8",
      inputValidator: (v) => (!v ? "An email address is needed." : undefined),
    });

    if (!isConfirmed) return;

    try {
      setBusy("send");
      const { data } = await api.post(`/invoices/${id}/send`, { to: value });
      notify.success(data.message);
      setInvoice(data.invoice);
      load();
    } catch (err) {
      notify.error(errorFrom(err, "Could not send it"));
    } finally {
      setBusy("");
    }
  };

  const remind = async () => {
    const { isConfirmed } = await Swal.fire({
      title: "Send a reminder?",
      html: `
        <p style="font-size:13px;color:#6b7280;text-align:left;">
          ${
            invoice.daysOverdue > 0
              ? `${invoice.invoiceNumber} is <strong>${invoice.daysOverdue} days overdue</strong>.`
              : `${invoice.invoiceNumber} is not yet overdue.`
          }
          The chaser states the outstanding ${money(invoice.balance)} and attaches the
          invoice again.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: "Send reminder",
      confirmButtonColor: "#1d4ed8",
    });

    if (!isConfirmed) return;

    try {
      setBusy("remind");
      const { data } = await api.post(`/invoices/${id}/remind`, {});
      notify.success(data.message);
      load();
    } catch (err) {
      notify.error(errorFrom(err, "Could not send the reminder"));
      load(); // the attempt is recorded even when it fails
    } finally {
      setBusy("");
    }
  };

  const voidIt = async () => {
    const { value, isConfirmed } = await Swal.fire({
      title: `Void ${invoice.invoiceNumber}?`,
      html: `
        <p style="font-size:13px;color:#6b7280;text-align:left;">
          The document stays on the record and keeps its number — a gap in the
          invoice series is the first thing an auditor asks about. Say why.
        </p>
      `,
      input: "text",
      inputPlaceholder: "e.g. Billed to the wrong customer",
      showCancelButton: true,
      confirmButtonText: "Void it",
      confirmButtonColor: "#dc2626",
      inputValidator: (v) => (!v ? "A reason is needed." : undefined),
    });

    if (!isConfirmed) return;

    try {
      setBusy("void");
      const { data } = await api.put(`/invoices/${id}/void`, { reason: value });
      notify.success(data.message);
      load();
    } catch (err) {
      notify.error(errorFrom(err, "Could not void it"));
    } finally {
      setBusy("");
    }
  };

  const unvoid = async () => {
    try {
      setBusy("void");
      const { data } = await api.put(`/invoices/${id}/unvoid`, {});
      notify.success(data.message);
      load();
    } catch (err) {
      notify.error(errorFrom(err, "Could not reopen it"));
    } finally {
      setBusy("");
    }
  };

  const reversePayment = async (payment) => {
    const { value, isConfirmed } = await Swal.fire({
      title: `Reverse ${payment.paymentNumber}?`,
      html: `
        <p style="font-size:13px;color:#6b7280;text-align:left;">
          ${money(payment.amount)} goes back to outstanding. The payment stays on the
          record — a bounced cheque and a keying error read very differently later,
          so say which this is.
        </p>
      `,
      input: "text",
      inputPlaceholder: "e.g. Cheque returned unpaid",
      showCancelButton: true,
      confirmButtonText: "Reverse it",
      confirmButtonColor: "#dc2626",
      inputValidator: (v) => (!v ? "A reason is needed." : undefined),
    });

    if (!isConfirmed) return;

    try {
      const { data } = await api.put(`/payments/${payment._id}/reverse`, { reason: value });
      notify.success(data.message);
      load();
    } catch (err) {
      notify.error(errorFrom(err, "Could not reverse the payment"));
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-ink-400">Loading the invoice…</div>;
  }
  if (!invoice) return null;

  const status = statusOf(invoice);
  const noun = documentNoun(invoice);
  const isVoid = invoice.status === "VOID";
  const settled = invoice.status === "PAID";
  const charges = (invoice.lines || []).filter((l) => l.kind !== "settlement");
  const settlements = (invoice.lines || []).filter((l) => l.kind === "settlement");
  const livePayments = (invoice.payments || []).filter((p) => !p.reversed && !p.reversedAt);

  return (
    <div className={uiStyles.page}>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowBackIcon fontSize="small" /> Back
      </button>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>
            {noun} {invoice.invoiceNumber}
          </h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            {PARTY_LABEL[invoice.party?.kind] || ""} · {invoice.party?.name || "—"}
            {invoice.loadId && invoice.loadId !== invoice.invoiceNumber
              ? ` · Load ${invoice.loadId}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openPdf}
            disabled={busy === "pdf"}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
          >
            <PictureAsPdfIcon fontSize="small" /> PDF
          </button>

          {!isVoid && (
            <button
              onClick={send}
              disabled={busy === "send"}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
            >
              <SendIcon fontSize="small" />
              {invoice.sentAt ? "Send again" : "Send"}
            </button>
          )}

          {/* Chasing a paid or void invoice is refused server-side, so it is not
              offered here either. */}
          {!isVoid && !settled && (
            <button
              onClick={remind}
              disabled={busy === "remind"}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
            >
              <NotificationsActiveIcon fontSize="small" /> Remind
            </button>
          )}

          {!isVoid && invoice.balance > 0 && (
            <button
              onClick={() => setPayOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-bold text-accent-700 hover:bg-white/90"
            >
              <PaymentsIcon fontSize="small" /> Record payment
            </button>
          )}

          {isVoid ? (
            <button
              onClick={unvoid}
              disabled={busy === "void"}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
            >
              <UndoIcon fontSize="small" /> Reopen
            </button>
          ) : (
            <button
              onClick={voidIt}
              disabled={busy === "void"}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
            >
              <BlockIcon fontSize="small" /> Void
            </button>
          )}
        </div>
      </div>

      {isVoid && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">
            This {noun.toLowerCase()} was voided on {formatDate(invoice.voidedAt)}.
          </p>
          <p className="mt-0.5 text-sm text-red-700">{invoice.voidReason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── The document ──────────────────────────────────────────────────── */}
        <div className={`${uiStyles.card} lg:col-span-2`}>
          <div className="flex flex-wrap items-start justify-between gap-6 border-b border-hairline pb-5">
            <div>
              <p className="text-lg font-extrabold text-ink-800">
                {invoice.issuer?.name || "—"}
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-ink-500">
                {invoice.issuer?.address && <p>{invoice.issuer.address}</p>}
                <p>
                  {[invoice.issuer?.city, invoice.issuer?.state, invoice.issuer?.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {invoice.issuer?.phone && <p>Tel {invoice.issuer.phone}</p>}
                {invoice.issuer?.email && <p>{invoice.issuer.email}</p>}
              </div>
            </div>

            <div className="text-right">
              <p className="text-2xl font-extrabold uppercase tracking-tight text-accent-700">
                {noun}
              </p>
              <div className="mt-2 space-y-1 text-xs">
                {[
                  ["Invoice #", invoice.invoiceNumber],
                  ["Date", formatDate(invoice.issueDate)],
                  ["Terms", invoice.termsLabel],
                  ["Due", formatDate(invoice.dueDate)],
                  invoice.loadId && invoice.loadId !== invoice.invoiceNumber
                    ? ["Load #", invoice.loadId]
                    : null,
                ]
                  .filter(Boolean)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-end gap-3">
                      <span className="text-ink-400">{label}</span>
                      <span className="w-32 font-semibold text-ink-800">{value}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="py-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
              {invoice.direction === "AR" ? "Bill to" : "Pay to"}
            </p>
            <p className="mt-1 text-base font-bold text-ink-800">
              {invoice.party?.name || "—"}
            </p>
            <div className="mt-0.5 space-y-0.5 text-xs text-ink-500">
              {invoice.party?.code && <p>{invoice.party.code}</p>}
              {invoice.party?.address && <p>{invoice.party.address}</p>}
              {invoice.party?.email && <p>{invoice.party.email}</p>}
              {invoice.party?.phone && <p>{invoice.party.phone}</p>}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-hairline bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-2 py-2 font-semibold">Description</th>
                <th className="px-2 py-2 text-right font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">Rate</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((line, index) => (
                <tr key={index} className="border-b border-hairline/50">
                  <td className="px-2 py-2.5">
                    <p className="font-medium text-ink-800">{line.label}</p>
                    {line.description && (
                      <p className="text-xs text-ink-500">{line.description}</p>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-500">
                    {line.quantity ?? ""}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-500">
                    {line.rate ? money(line.rate) : ""}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                    {money(line.amount)}
                  </td>
                </tr>
              ))}
              {!charges.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-400">
                    No charges on this {noun.toLowerCase()}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="ml-auto mt-4 max-w-xs">
            <Row label="Subtotal" value={money(invoice.subtotal)} />
            {/* An advance is money that moved before the invoice existed. Shown
                as a deduction, never folded into the subtotal. */}
            {settlements.map((line, index) => (
              <Row
                key={index}
                label={line.label}
                value={`− ${money(line.amount)}`}
                tone="text-ink-500"
              />
            ))}
            {invoice.amountPaid > 0 && (
              <Row
                label="Payments received"
                value={`− ${money(invoice.amountPaid)}`}
                tone="text-good-600"
              />
            )}

            <div className="mt-2 flex items-center justify-between rounded-lg bg-accent-600 px-4 py-3 text-white">
              <span className="text-[11px] font-bold uppercase tracking-wide">
                {invoice.direction === "AR" ? "Amount due" : "Amount payable"}
              </span>
              <span className="text-xl font-extrabold tabular-nums">
                {money(invoice.balance)}
              </span>
            </div>
          </div>

          {(invoice.memo || invoice.notes) && (
            <div className="mt-5 space-y-2 border-t border-hairline pt-4 text-sm">
              {invoice.memo && (
                <p>
                  <span className="font-semibold text-ink-500">Memo: </span>
                  {invoice.memo}
                </p>
              )}
              {invoice.notes && (
                <p>
                  <span className="font-semibold text-ink-500">Notes: </span>
                  {invoice.notes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Its history ───────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className={uiStyles.card}>
            <div className="mb-3 flex items-center justify-between">
              <p className={uiStyles.title}>Status</p>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.chip}`}
              >
                {status.label}
              </span>
            </div>

            <Row label="Total" value={money(invoice.total)} />
            <Row
              label="Paid"
              value={money((invoice.amountPaid || 0) + (invoice.advanceApplied || 0))}
              tone="text-good-600"
            />
            <Row
              label="Outstanding"
              value={money(invoice.balance)}
              tone={invoice.balance > 0 ? "text-bad-600" : "text-good-600"}
            />

            <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-xs text-ink-500">
              <p>
                Sent:{" "}
                {invoice.sentAt
                  ? `${formatDate(invoice.sentAt)} to ${invoice.sentTo || "—"}`
                  : "Not sent yet"}
              </p>
              {invoice.frozen && (
                <p className="text-ink-400">
                  Frozen — edit by voiding and raising a new one.
                </p>
              )}
            </div>
          </div>

          <div className={uiStyles.card}>
            <p className={`${uiStyles.title} mb-3`}>
              Payments{" "}
              <span className="text-sm font-normal text-ink-400">
                ({livePayments.length})
              </span>
            </p>

            {!invoice.payments?.length && (
              <p className="py-4 text-center text-sm text-ink-400">
                Nothing recorded yet.
              </p>
            )}

            <div className="space-y-2">
              {(invoice.payments || []).map((payment) => (
                <div
                  key={payment._id}
                  className={`rounded-lg border p-3 text-sm ${
                    payment.reversedAt
                      ? "border-hairline bg-ink-50 opacity-60"
                      : "border-hairline bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={`font-bold tabular-nums ${
                          payment.reversedAt ? "text-ink-400 line-through" : "text-ink-800"
                        }`}
                      >
                        {money(payment.amount)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {payment.methodLabel || payment.method} ·{" "}
                        {formatDate(payment.paidOn)}
                      </p>
                    </div>
                    {!payment.reversedAt && (
                      <button
                        onClick={() => reversePayment(payment)}
                        className="text-xs font-semibold text-bad-600 hover:underline"
                      >
                        Reverse
                      </button>
                    )}
                  </div>

                  {payment.documentNumber && (
                    <p className="mt-1 text-xs text-ink-500">
                      <span className="font-semibold">
                        {payment.documentLabel || "Reference"}:
                      </span>{" "}
                      {payment.documentNumber}
                      {payment.bankName ? ` · ${payment.bankName}` : ""}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {payment.paymentNumber}
                    {payment.recordedByName ? ` · ${payment.recordedByName}` : ""}
                  </p>

                  {payment.reversedAt && (
                    <p className="mt-1 text-xs font-semibold text-bad-600">
                      Reversed {formatDate(payment.reversedAt)} — {payment.reversedReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {invoice.reminders?.length > 0 && (
            <div className={uiStyles.card}>
              <p className={`${uiStyles.title} mb-3`}>
                Reminders{" "}
                <span className="text-sm font-normal text-ink-400">
                  ({invoice.reminders.length})
                </span>
              </p>
              <div className="space-y-2">
                {[...invoice.reminders].reverse().map((reminder, index) => (
                  <div key={index} className="text-xs">
                    <p className="font-semibold text-ink-700">
                      {formatDate(reminder.sentAt)}
                      <span className="ml-1.5 font-normal text-ink-400">
                        {reminder.trigger === "AUTO" ? "automatic" : "sent by hand"}
                        {reminder.daysOverdue > 0
                          ? ` · ${reminder.daysOverdue}d overdue`
                          : ""}
                      </span>
                    </p>
                    <p className="text-ink-500">{reminder.to}</p>
                    {/* Failures are listed too — an address that bounces looks
                        exactly like an account nobody chased, otherwise. */}
                    {!reminder.sent && (
                      <p className="font-semibold text-bad-600">
                        Not delivered{reminder.note ? ` — ${reminder.note}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <RecordPaymentDialog
        invoice={invoice}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onRecorded={load}
      />
    </div>
  );
};

export default InvoiceDetail;
