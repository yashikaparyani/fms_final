import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import BoltIcon from "@mui/icons-material/Bolt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import api from "../../api";
import Swal, { notify } from "../../utils/swal";
import { uiStyles } from "../../style/uiStyles";
import RecordPaymentDialog from "./RecordPaymentDialog";
import {
  money,
  formatDate,
  statusOf,
  documentNoun,
  errorFrom,
  PARTY_LABEL,
} from "./invoiceUi";

// ─── Billing on one load ──────────────────────────────────────────────────────
// The bridge between the load's working ledger above and the documents raised
// off it: the customer invoice, one bill per carrier leg, and the driver's
// settlement — each with what has been paid against it.
//
// ── Why the split shows here rather than only on the register ────────────────
// A load split between two carriers owes two different people two different
// amounts, and the person looking at this screen is the one deciding whether to
// pay them. Sending them to a separate register to find out who is still owed
// what makes the commonest question on the page a two-screen trip.
//
// ── Raising is one button for both sides ─────────────────────────────────────
// The customer invoice and every carrier bill come from the same ledger and are
// raised together, because a load billed out but never costed in is a margin
// figure that is wrong in the flattering direction. The server refreshes drafts
// rather than duplicating them, so pressing it again after fixing a charge is
// the expected workflow, not a mistake — see invoiceController.generateForLoad.
// ─────────────────────────────────────────────────────────────────────────────

const Figure = ({ label, value, tone = "text-ink-800", hint }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
      {label}
    </p>
    <p className={`text-lg font-bold tabular-nums ${tone}`}>{money(value)}</p>
    {hint && <p className="text-[11px] text-ink-400">{hint}</p>}
  </div>
);

/** One raised document, with its money and the action it is waiting for. */
const InvoiceRow = ({ invoice, onOpen, onPay }) => {
  const status = statusOf(invoice);
  const noun = documentNoun(invoice);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/60 px-3 py-2.5 last:border-0">
      <div className="min-w-0">
        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-sm font-bold text-accent-700 hover:underline"
        >
          {invoice.invoiceNumber}
          <OpenInNewIcon sx={{ fontSize: 13 }} />
        </button>
        <p className="truncate text-xs text-ink-500">
          {PARTY_LABEL[invoice.party?.kind] || noun} · {invoice.party?.name || "—"}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{money(invoice.total)}</p>
          <p className="text-[11px] text-ink-400">
            {invoice.balance > 0
              ? `${money(invoice.balance)} outstanding`
              : "Settled"}
          </p>
        </div>

        <span
          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.chip}`}
        >
          {status.label}
        </span>

        {invoice.status !== "VOID" && invoice.balance > 0 && (
          <button
            onClick={onPay}
            className="rounded-lg bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700 hover:bg-accent-100"
          >
            {invoice.direction === "AR" ? "Receive" : "Pay"}
          </button>
        )}
      </div>
    </div>
  );
};

const LoadBillingPanel = ({ loadId, onChanged }) => {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [payTarget, setPayTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get(`/invoices/loads/${loadId}`);
      setData(res);
    } catch (err) {
      notify.error(errorFrom(err, "Could not load the billing"));
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    load();
  }, [load]);

  const raise = async () => {
    const { value: terms, isConfirmed } = await Swal.fire({
      title: "Raise invoices",
      html: `
        <p style="font-size:13px;color:#6b7280;text-align:left;margin-bottom:8px;">
          Creates the customer invoice numbered <strong>${loadId}</strong>, plus one
          bill per carrier and for the driver. Drafts already raised are refreshed
          from the ledger; anything already sent is left alone.
        </p>
      `,
      input: "select",
      inputOptions: {
        DUE_ON_RECEIPT: "Due on receipt",
        NET_7: "Net 7",
        NET_15: "Net 15",
        NET_30: "Net 30",
        NET_45: "Net 45",
        NET_60: "Net 60",
      },
      inputValue: "NET_30",
      showCancelButton: true,
      confirmButtonText: "Raise",
      confirmButtonColor: "#1d4ed8",
    });

    if (!isConfirmed) return;

    try {
      setRaising(true);
      const { data: res } = await api.post(`/invoices/loads/${loadId}/generate`, {
        terms,
      });
      notify.success(res.message);

      // Partial success is normal — receivables raised, nothing costed on the
      // payable side yet. Saying so beats a silent half-result.
      (res.problems || []).forEach((problem) => notify.warning(problem));

      load();
      onChanged?.();
    } catch (err) {
      notify.error(errorFrom(err, "Could not raise the invoices"));
    } finally {
      setRaising(false);
    }
  };

  if (loading) {
    return (
      <div className={uiStyles.card}>
        <p className="py-6 text-center text-sm text-ink-400">Loading the billing…</p>
      </div>
    );
  }
  if (!data) return null;

  const ar = (data.invoices || []).filter(
    (i) => i.direction === "AR" && i.status !== "VOID",
  );
  const ap = (data.invoices || []).filter(
    (i) => i.direction === "AP" && i.status !== "VOID",
  );

  // Carrier legs with no bill raised yet. Shown rather than omitted: a leg
  // nobody has billed is exactly the gap the office is looking for, and an
  // absent row is an invisible one.
  const unbilledGroups = (data.payableGroups || []).filter(
    (group) =>
      !ap.some(
        (invoice) =>
          (group.legId && String(invoice.legId) === group.legId) ||
          (!group.legId && String(invoice.party?.id) === group.fleetOwnerId),
      ),
  );

  return (
    <div className={uiStyles.card}>
      <div className={uiStyles.cardHeader}>
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-ink-800">
            <ReceiptLongIcon fontSize="small" className="text-accent-600" />
            Billing &amp; payments
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            The documents raised from the ledgers below, and what has been settled
            against them.
          </p>
        </div>
        <button
          onClick={raise}
          disabled={raising}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          <BoltIcon fontSize="small" />
          {raising ? "Raising…" : "Raise invoices"}
        </button>
      </div>

      {/* ── The position, both sides ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-accent-50/40 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent-700">
            <ReceiptLongIcon sx={{ fontSize: 14 }} /> Receivable — money in
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Figure label="Invoiced" value={data.receivable.invoiced} />
            <Figure
              label="Received"
              value={data.receivable.paid}
              tone="text-good-600"
            />
            <Figure
              label="Outstanding"
              value={data.receivable.outstanding}
              tone="text-warn-600"
            />
          </div>
          {/* The gap between what the load is worth and what has been billed —
              revenue earned and never invoiced is the commonest quiet loss. */}
          {data.receivable.uninvoiced > 0 && (
            <p className="mt-3 rounded-md bg-bad-50 px-2.5 py-1.5 text-xs font-semibold text-bad-600">
              {money(data.receivable.uninvoiced)} on the ledger has not been invoiced
              yet.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-hairline bg-ink-50/60 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-600">
            <PaymentsIcon sx={{ fontSize: 14 }} /> Payable — money out
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Figure label="Billed" value={data.payable.invoiced} />
            <Figure label="Paid" value={data.payable.paid} tone="text-good-600" />
            <Figure
              label="Outstanding"
              value={data.payable.outstanding}
              tone="text-warn-600"
            />
          </div>
        </div>
      </div>

      {/* ── Customer invoice ─────────────────────────────────────────────── */}
      <div className="mt-5">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          Customer invoice
        </p>
        <div className="rounded-lg border border-hairline">
          {ar.length ? (
            ar.map((invoice) => (
              <InvoiceRow
                key={invoice._id}
                invoice={invoice}
                onOpen={() => navigate(`../accounting/invoices/${invoice._id}`)}
                onPay={() => setPayTarget(invoice)}
              />
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-ink-400">
              No invoice raised yet. The customer invoice will be numbered{" "}
              <span className="font-semibold text-ink-600">{loadId}</span>.
            </p>
          )}
        </div>
      </div>

      {/* ── Carrier and driver bills ─────────────────────────────────────── */}
      <div className="mt-5">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          Carrier &amp; driver bills
        </p>
        <div className="rounded-lg border border-hairline">
          {ap.map((invoice) => (
            <InvoiceRow
              key={invoice._id}
              invoice={invoice}
              onOpen={() => navigate(`../accounting/invoices/${invoice._id}`)}
              onPay={() => setPayTarget(invoice)}
            />
          ))}

          {unbilledGroups.map((group) => (
            <div
              key={group.legId || group.fleetOwnerId}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/60 px-3 py-2.5 last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-ink-700">
                  {group.name || "Unnamed carrier"}
                </p>
                <p className="text-xs text-ink-400">
                  {group.lineCount
                    ? `${group.lineCount} line${group.lineCount === 1 ? "" : "s"} costed`
                    : "Nothing costed yet"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {group.agreed != null && (
                  <span className="text-sm tabular-nums text-ink-500">
                    agreed {money(group.agreed)}
                  </span>
                )}
                <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                  Not billed
                </span>
              </div>
            </div>
          ))}

          {!ap.length && !unbilledGroups.length && (
            <p className="px-3 py-4 text-sm text-ink-400">
              No carrier assigned yet, so there is nothing to pay out.
            </p>
          )}
        </div>
      </div>

      {/* ── Payments on this load ────────────────────────────────────────── */}
      {data.payments?.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
            Payments on this load
          </p>
          <div className="divide-y divide-hairline/60 rounded-lg border border-hairline">
            {data.payments.map((payment) => (
              <div
                key={payment._id}
                className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm ${
                  payment.reversedAt ? "opacity-50" : ""
                }`}
              >
                <div>
                  <p
                    className={`font-semibold tabular-nums ${
                      payment.direction === "RECEIVED"
                        ? "text-good-600"
                        : "text-fuel-600"
                    } ${payment.reversedAt ? "line-through" : ""}`}
                  >
                    {payment.direction === "RECEIVED" ? "+" : "−"}
                    {money(payment.amount)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {payment.paymentNumber} · {payment.invoiceNumber}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-500">
                  <p className="font-semibold text-ink-700">
                    {formatDate(payment.paidOn)}
                  </p>
                  <p>
                    {payment.method}
                    {payment.documentNumber ? ` · ${payment.documentNumber}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <RecordPaymentDialog
        invoice={payTarget}
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        onRecorded={() => {
          load();
          onChanged?.();
        }}
      />
    </div>
  );
};

export default LoadBillingPanel;
