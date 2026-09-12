import { useCallback, useEffect, useMemo, useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { money, formatDate, errorFrom } from "./invoiceUi";

// ─── Finding one payment ──────────────────────────────────────────────────────
// This replaced a plain list of every payment on the account, which was the
// wrong shape for the question people actually bring to it. Nobody reads a
// payment register top to bottom. They arrive holding one fact — a cheque
// number off a bank statement, a wire reference a customer read out on the
// phone — and need the row it belongs to.
//
// A list answers that only by eye, and only while it is short. So the card asks
// for the fact instead, and the whole list is one click away for the times
// somebody genuinely wants to scan it.
//
// The matching is the server's (see listPayments): cheque and reference numbers,
// payment numbers, invoice and load numbers, and the payee's name all go through
// the same box, because somebody holding a number rarely knows which kind it is.
// ─────────────────────────────────────────────────────────────────────────────

const PaymentHistory = ({ partyId, refreshKey }) => {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [methods, setMethods] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => search.trim(), [search]);

  // Nothing asked, nothing fetched — until somebody asks for the lot.
  const active = !!query || !!method || showAll;

  useEffect(() => {
    api
      .get("/payments/methods")
      .then(({ data }) => setMethods(data.methods || []))
      .catch(() => {
        /* the filter degrades to "any method" */
      });
  }, []);

  const load = useCallback(async () => {
    if (!active) {
      setRows([]);
      setTotals(null);
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.get("/payments", {
        params: {
          ...(partyId ? { partyId } : {}),
          ...(query ? { search: query } : {}),
          ...(method ? { method } : {}),
          // A reversed cheque is exactly the kind of thing somebody is looking
          // for when they search a number, so the register shows them here and
          // marks them, rather than hiding them as the default register does.
          includeReversed: "true",
        },
      });
      setRows(data.rows || []);
      setTotals(data.totals || null);
    } catch (err) {
      notify.error(errorFrom(err, "Could not search the payments"));
    } finally {
      setLoading(false);
    }
  }, [active, partyId, query, method]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query, refreshKey]);

  return (
    <div className={uiStyles.card}>
      <p className={`${uiStyles.title} mb-3`}>Find a payment</p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon
            fontSize="small"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cheque number, reference, receipt or load number…"
            className={`${uiStyles.input} pl-9`}
          />
        </div>

        <div className="min-w-[160px]">
          <select
            className={uiStyles.select}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">Any method</option>
            {methods.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {active && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setMethod("");
              setShowAll(false);
            }}
            className="pb-2 text-xs font-semibold text-ink-500 hover:text-ink-800"
          >
            Clear
          </button>
        )}
      </div>

      {!active && (
        <div className="py-6 text-center">
          <p className="text-sm text-ink-500">
            Search by the number on the cheque, the wire reference, or the receipt.
          </p>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-2 text-xs font-semibold text-accent-700 hover:underline"
          >
            Or show every payment on this account
          </button>
        </div>
      )}

      {active && loading && <p className="py-6 text-center text-ink-400">Searching…</p>}

      {active && !loading && !rows.length && (
        <p className="py-6 text-center text-ink-400">
          No payment matches that.
        </p>
      )}

      {active && !loading && rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-ink-500">
            {rows.length} payment{rows.length === 1 ? "" : "s"}
            {totals ? ` · ${money(totals.received)} received` : ""}
          </p>

          <div className="space-y-2">
            {rows.map((payment) => (
              <div
                key={payment._id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                  payment.reversed
                    ? "border-bad-100 bg-bad-50"
                    : "border-hairline"
                }`}
              >
                <div>
                  <p
                    className={`font-bold tabular-nums ${
                      payment.reversed ? "text-ink-400 line-through" : "text-good-700"
                    }`}
                  >
                    {money(payment.amount)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {payment.paymentNumber} · against {payment.invoiceNumber}
                    {payment.loadId && payment.loadId !== payment.invoiceNumber
                      ? ` · ${payment.loadId}`
                      : ""}
                  </p>
                  {payment.reversed && (
                    <p className="text-[11px] font-semibold text-bad-600">
                      Reversed — this money did not stay
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-ink-500">
                  <p className="font-semibold text-ink-700">{formatDate(payment.paidOn)}</p>
                  <p>
                    {payment.methodLabel || payment.method}
                    {payment.documentNumber
                      ? ` · ${payment.documentLabel || "Ref"} ${payment.documentNumber}`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PaymentHistory;
