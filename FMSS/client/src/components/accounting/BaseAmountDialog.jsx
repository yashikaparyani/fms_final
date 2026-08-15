import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import api from "../../api";
import ChargeEditor, { computeTotals, money } from "./ChargeEditor";
import { notify } from "../../utils/swal";

// ─── BaseAmountDialog ─────────────────────────────────────────────────────────
// The breakdown behind a load's base amount, opened from the amount field on the
// load form.
//
// The base amount is not typed in and then reconciled with an invoice later — it
// IS the receivables total. Building it here means the figure on the board, the
// figure the customer is billed and the figure every margin is measured against
// are the same number by construction rather than by discipline.
//
// The lines are handed back to the form and saved with the load, so a load
// created through this dialog arrives with its receivables ledger already
// populated. Typing straight into the amount field still works for a quick
// quote — the breakdown is an upgrade, not a gate.
// ─────────────────────────────────────────────────────────────────────────────

const BaseAmountDialog = ({ open, onClose, onApply, initialLines = [] }) => {
  const [charges, setCharges] = useState([]);
  const [lines, setLines] = useState(initialLines);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    setLines(initialLines.length ? initialLines : []);

    api
      .get("/accounting/catalog")
      .then(({ data }) => {
        setCharges(data.receivable || []);

        // A fresh breakdown opens with the base line already there — it is the
        // one charge every load has, and making the user pick it from a dropdown
        // first is a step with no decision in it.
        if (!initialLines.length) {
          const linehaul = (data.receivable || []).find((c) => c.kind === "linehaul");
          if (linehaul) {
            setLines([{ chargeType: linehaul.key, amount: "", note: "" }]);
          }
        }
      })
      .catch(() => notify.error("Could not load the charge list"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const bySide = new Map(charges.map((c) => [c.key, c]));
  const totals = computeTotals(lines, bySide);

  const apply = () => {
    const filled = lines.filter(
      (line) => Number(line.amount) !== 0 || String(line.note || "").trim(),
    );

    if (!filled.length) {
      notify.warning("Add at least one charge.");
      return;
    }

    const missingNote = filled.find(
      (line) => bySide.get(line.chargeType)?.requiresNote && !String(line.note || "").trim(),
    );
    if (missingNote) {
      notify.warning(
        `${bySide.get(missingNote.chargeType).label}: say what the charge is for.`,
      );
      return;
    }

    onApply({ lines: filled, total: totals.total });
    onClose();
  };

  // Rendered into <body> rather than in place. The dialog lives inside the
  // dashboard's scrolling content column, and `position: fixed` resolves against
  // the nearest ancestor that establishes a containing block — so in place it
  // covered the content area only, tucking under the sidebar and topbar instead
  // of over them. A portal puts it back on the viewport where it belongs.
  return createPortal(
    // Column layout with a capped height: the header and the footer holding the
    // total stay put and only the charge list scrolls, so the running total and
    // the Use button are reachable however many lines are added.
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ReceiptLongIcon className="text-white" fontSize="small" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Base amount breakdown
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                What the customer is billed. The base amount on the load is this
                total, so the board and the invoice always agree.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grow">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : (
            <ChargeEditor
              side="receivable"
              charges={charges}
              lines={lines}
              onChange={setLines}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Base amount
            </p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {money(totals.total)}
            </p>
            {totals.settled > 0 && (
              <p className="text-xs text-blue-700">
                {money(totals.settled)} already received · {money(totals.balance)} due
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={apply} className="btn-primary">
              Use {money(totals.total)}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BaseAmountDialog;
