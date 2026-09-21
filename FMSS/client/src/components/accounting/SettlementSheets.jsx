import { useCallback, useEffect, useState } from "react";
import PrintIcon from "@mui/icons-material/Print";
import api from "../../api";
import { notify } from "../../utils/swal";
import { money, formatDate, errorFrom } from "./invoiceUi";

// ─── Settlement sheets ────────────────────────────────────────────────────────
// What the payables register turns into when "All drivers" is chosen: one sheet
// per driver, laid out as the paper settlement sheet the office already hands
// over with a cheque — the loads they ran, where each box went, what each paid,
// and a footer carrying the deduction and the cheque number.
//
// The figures come from the bills (see settlementSheets on the server). The
// deduction and cheque number are the only things typed here, and they are
// stored against the driver and the date window, so a sheet reprinted next
// month says what it said today. Without both dates there is no window for them
// to belong to, so they are read-only until the period is set.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_TONE = {
  Paid: "text-good-700",
  "Part paid": "text-warn-700",
  Pending: "text-bad-600",
  Void: "text-ink-400",
};

const Sheet = ({ sheet, period, editable, onSaved }) => {
  const [deduction, setDeduction] = useState(String(sheet.deduction || ""));
  const [checkNumber, setCheckNumber] = useState(sheet.checkNumber || "");
  const [saving, setSaving] = useState(false);

  // A refetch (new dates, a save elsewhere) replaces what is on the sheet.
  useEffect(() => {
    setDeduction(sheet.deduction ? String(sheet.deduction) : "");
    setCheckNumber(sheet.checkNumber || "");
  }, [sheet.deduction, sheet.checkNumber]);

  const dirty =
    Number(deduction || 0) !== Number(sheet.deduction || 0) ||
    checkNumber.trim() !== (sheet.checkNumber || "");

  const canEdit = editable && !!sheet.party.id;

  const save = async () => {
    try {
      setSaving(true);
      const { data } = await api.put("/accounting/reports/settlements", {
        partyId: sheet.party.id,
        partyKind: sheet.party.kind,
        partyName: sheet.party.name,
        partyCode: sheet.party.code,
        from: period.from,
        to: period.to,
        deduction: deduction || 0,
        checkNumber,
      });
      notify.success(data.message);
      onSaved?.();
    } catch (err) {
      notify.error(errorFrom(err, "Could not save the sheet"));
    } finally {
      setSaving(false);
    }
  };

  const heading = sheet.party.code
    ? `${sheet.party.code}-${sheet.party.name}`
    : sheet.party.name;

  return (
    <section className="settlement-sheet break-inside-avoid rounded-lg border border-hairline p-3">
      <p className="text-sm font-bold text-brand-700">Payment settlement Sheet</p>
      <p className="mt-1 text-xs font-semibold text-brand-600">
        From Date : {period.from ? formatDate(period.from) : "—"}
        <span className="mx-3">To Date : {period.to ? formatDate(period.to) : "—"}</span>
        {sheet.party.kind === "CARRIER" ? "Carrier name" : "Driver name"} : {heading}
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-accent-100 text-left text-ink-800">
              {[
                "Load",
                "Container",
                "Invoice/Tag",
                "Driver/Carrier Name",
                "Total",
                "Total Report",
                "From",
                "To",
                "QB Status",
              ].map((label) => (
                <th key={label} className="border border-hairline px-2 py-1.5 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.invoiceId} className="align-top">
                <td className="border border-hairline px-2 py-1.5 font-semibold text-bad-600">
                  {row.loadId || "—"}
                </td>
                <td className="border border-hairline px-2 py-1.5">{row.container || ""}</td>
                <td className="border border-hairline px-2 py-1.5">
                  {row.reference || row.invoiceNumber}
                </td>
                <td className="border border-hairline px-2 py-1.5">
                  {row.payeeCode ? `${row.payeeCode} ` : ""}
                  {row.payeeName}
                  <br />
                  <span className="text-ink-500">( {formatDate(row.issueDate)} )</span>
                </td>
                <td className="border border-hairline px-2 py-1.5 text-right tabular-nums text-bad-600">
                  {money(row.total)}
                </td>
                {/* Same breakdown as the Driver Payable Report, so the sheet
                    and the report never disagree about what a cell means. */}
                <td className="border border-hairline px-2 py-1.5">
                  <div className="min-w-[170px] leading-5 text-ink-700">
                    {(row.charges || []).map((charge, index) => (
                      <p key={index} className="flex justify-between gap-3">
                        <span>{charge.label}</span>
                        <span className="tabular-nums">{money(charge.amount)}</span>
                      </p>
                    ))}
                    <p className="flex justify-between gap-3">
                      <span>Check number</span>
                      <span>{row.checkNumber || "—"}</span>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span>Reason</span>
                      <span className="text-right">{row.reason || "—"}</span>
                    </p>
                    <p className="mt-0.5 flex justify-between gap-3 border-t border-hairline pt-0.5 font-bold text-ink-900">
                      <span>Total</span>
                      <span className="tabular-nums">{money(row.total)}</span>
                    </p>
                  </div>
                </td>
                <td className="whitespace-pre-line border border-hairline px-2 py-1.5">
                  {(row.from || []).join("\n")}
                </td>
                <td className="whitespace-pre-line border border-hairline px-2 py-1.5">
                  {(row.to || []).join("\n")}
                </td>
                <td
                  className={`border border-hairline px-2 py-1.5 font-semibold ${
                    STATE_TONE[row.status] || ""
                  }`}
                >
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 text-sm font-semibold text-bad-700">
          <label className="flex items-center gap-2">
            Total deduction $
            <input
              type="number"
              min="0"
              step="0.01"
              value={deduction}
              disabled={!canEdit}
              onChange={(e) => setDeduction(e.target.value)}
              className="w-40 border-0 border-b border-bad-600 bg-transparent px-1 py-0.5 text-ink-900 tabular-nums focus:outline-none disabled:text-ink-500"
            />
          </label>
          <label className="flex items-center gap-2">
            Paid check #
            <input
              value={checkNumber}
              disabled={!canEdit}
              onChange={(e) => setCheckNumber(e.target.value)}
              className="w-48 border-0 border-b border-bad-600 bg-transparent px-1 py-0.5 text-ink-900 focus:outline-none disabled:text-ink-500"
            />
          </label>
          <p>Total Loads on this sheet : {sheet.totals.loads}</p>

          {canEdit && dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="print:hidden rounded bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save sheet"}
            </button>
          )}
          {!editable && (
            <p className="print:hidden text-[13px] font-normal text-ink-500">
              Set both dates to record a deduction and cheque number for this period.
            </p>
          )}
        </div>

        <dl className="text-right text-xs font-semibold tabular-nums">
          <div className="text-brand-600">Total : {money(sheet.totals.total)}</div>
          <div className="text-good-700">Paid : {money(sheet.totals.paid)}</div>
          <div className="text-bad-600">Pending : {money(sheet.totals.pending)}</div>
          {sheet.deduction > 0 && (
            <div className="mt-1 text-ink-800">Net of deduction : {money(sheet.totals.net)}</div>
          )}
        </dl>
      </div>
    </section>
  );
};

const SettlementSheets = ({ from, to, partyKind = "DRIVER" }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get("/accounting/reports/settlements", {
        params: {
          partyKind,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      setData(res);
    } catch (err) {
      notify.error(errorFrom(err, "Could not build the settlement sheets"));
    } finally {
      setLoading(false);
    }
  }, [from, to, partyKind]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <p className="py-8 text-center text-ink-400">Building sheets…</p>;
  }

  if (!data?.sheets?.length) {
    return (
      <p className="py-10 text-center text-ink-400">
        No {partyKind === "CARRIER" ? "carrier" : "driver"} bills in this period.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          {data.totals.sheets} {partyKind === "CARRIER" ? "carrier" : "driver"}{data.totals.sheets === 1 ? "" : "s"} · {data.totals.loads}{" "}
          load{data.totals.loads === 1 ? "" : "s"} · {money(data.totals.total)} total ·{" "}
          {money(data.totals.pending)} pending
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-secondary flex items-center gap-1.5"
        >
          <PrintIcon fontSize="small" /> Print sheets
        </button>
      </div>

      {data.sheets.map((sheet) => (
        <Sheet
          key={sheet.key}
          sheet={sheet}
          period={data.period}
          editable={data.editable}
          onSaved={load}
        />
      ))}
    </div>
  );
};

export default SettlementSheets;
