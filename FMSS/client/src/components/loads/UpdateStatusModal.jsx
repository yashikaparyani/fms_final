import { useState } from "react";
import api from "../../api";
import AppSelect from "../AppSelect";
import StreetTurnConfirmDialog from "../StreetTurnConfirmDialog";
import { notify } from "../../utils/swal";
import {
  TRANSPORT_STATUS_OPTIONS,
  transportStatusLabel,
} from "../../utils/transportStatus";

// ─── Update Status ────────────────────────────────────────────────────────────
// The office's status control, shared by All Transit and Over. Both tabs move
// loads between the same set of statuses — a finished load being reopened for
// paperwork is the same action as a moving one being marked delivered — so
// there is one dialog rather than one per tab.
//
// The options come from utils/transportStatus.js, which leaves out the
// pre-dispatch pair: those are written by the system, never chosen.
// ─────────────────────────────────────────────────────────────────────────────

const UpdateStatusModal = ({ load, onClose, onSaved }) => {
  const [status, setStatus] = useState(load.transportStatus || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // A street turn needs the handover details before it can be saved.
  const [showStreetTurn, setShowStreetTurn] = useState(false);

  const save = async (streetTurn) => {
    setSaving(true);
    try {
      await api.put(`/loads/${load.loadId}/transport-status`, {
        transportStatus: status,
        note,
        source: "web",
        ...(streetTurn ? { streetTurn } : {}),
      });
      notify.success(`Status updated to "${transportStatusLabel(status)}"`);
      setShowStreetTurn(false);
      onSaved();
    } catch (err) {
      notify.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!status) { notify.error("Please select a status"); return; }
    if (status === "STREET_TURN") { setShowStreetTurn(true); return; }
    save(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Update Status</h3>
              <p className="text-xs text-gray-400">Load <span className="font-semibold text-gray-600">{load.loadId}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="relative">
            <AppSelect
              options={TRANSPORT_STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              placeholder="Select new status…"
              isDisabled={saving}
            />
            <label className="input-label">Status <span className="text-red-400">*</span></label>
          </div>
          <div className="relative">
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 pt-5 pb-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Optional note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
            />
            <label className="input-label">Note (optional)</label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Update Status"}
          </button>
        </div>
      </div>

      <StreetTurnConfirmDialog
        isShow={showStreetTurn}
        load={load}
        saving={saving}
        onCancel={() => setShowStreetTurn(false)}
        onConfirm={save}
      />
    </div>
  );
};

export default UpdateStatusModal;
