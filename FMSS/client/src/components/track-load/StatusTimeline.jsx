import { useState } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Swal from "sweetalert2";
import api from "../../api";
import { notify } from "../../utils/swal";
import { STATUS_BADGE_COLORS } from "../../utils/loadColorMode";
import { transportStatusLabel } from "../../utils/transportStatus";

// ─── Status timeline ──────────────────────────────────────────────────────────
// What happened to this load and when, in order.
//
// Admins can correct it. The timeline is read as evidence — by the customer
// chasing a delivery, by accounting working out detention, by anybody arguing
// about a late arrival — and it is also, unavoidably, sometimes wrong: a driver
// marks a load picked up an hour after they actually loaded, or taps the wrong
// status and immediately taps the right one, leaving a step that never happened.
//
// Correcting the *time* is the common case and the reason the editor leads with
// it. Deleting an entry is the rarer one and is refused on the latest entry,
// because that is what the load's current status rests on — the server enforces
// both rules; this only offers what it will accept.
// ─────────────────────────────────────────────────────────────────────────────

const fmtFull = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const formatDuration = (ms) => {
  if (ms < 0) return "—";
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

/**
 * A Date as `datetime-local` wants it: local wall-clock, no zone, no seconds.
 * `toISOString` would shift the value by the offset and show the wrong time.
 */
const toLocalInput = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const EntryEditor = ({ entry, onCancel, onSave, saving }) => {
  const [changedAt, setChangedAt] = useState(toLocalInput(entry.changedAt));
  const [note, setNote] = useState(entry.note || "");

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
          When this actually happened
        </label>
        <input
          type="datetime-local"
          value={changedAt}
          max={toLocalInput(new Date())}
          onChange={(e) => setChangedAt(e.target.value)}
          disabled={saving}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
          Note
        </label>
        <input
          type="text"
          value={note}
          placeholder="Optional"
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className="btn-secondary text-xs py-1">
          Cancel
        </button>
        <button
          onClick={() => onSave({ changedAt, note })}
          disabled={saving || !changedAt}
          className="btn-primary text-xs py-1 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save correction"}
        </button>
      </div>
    </div>
  );
};

const StatusTimeline = ({ history = [], loadId, canEdit = false, onChanged }) => {
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!history.length) {
    return (
      <p className="px-5 py-5 text-sm text-gray-400 italic">
        No status history recorded yet.
      </p>
    );
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
  );

  const rows = sorted.map((entry, idx) => {
    const next = sorted[idx + 1];
    const from = new Date(entry.changedAt);
    const to = next ? new Date(next.changedAt) : null;
    const duration = to ? formatDuration(to - from) : null;
    const isCurrent = idx === sorted.length - 1;
    const colors = STATUS_BADGE_COLORS[entry.status] || {
      bg: "#f3f4f6",
      color: "#6b7280",
      border: "#e5e7eb",
    };
    return { ...entry, duration, isCurrent, colors, from, to };
  });

  const saveEntry = async (entry, { changedAt, note }) => {
    setSaving(true);
    try {
      // Sent as an ISO instant: the input is local wall-clock, and letting the
      // server parse a zoneless string would file the correction in whatever
      // zone the server happens to run in.
      await api.patch(`/loads/${loadId}/status-history/${entry._id}`, {
        changedAt: new Date(changedAt).toISOString(),
        note,
      });
      notify.success("Timeline entry updated.");
      setEditingId(null);
      onChanged?.();
    } catch (err) {
      notify.error(err?.response?.data?.message || "Could not update that entry.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry) => {
    const result = await Swal.fire({
      title: "Delete this timeline entry?",
      html:
        `<strong>${transportStatusLabel(entry.status)}</strong> at ` +
        `${fmtFull(entry.changedAt)} will be removed from the load's history.` +
        "<br/><br/>The deletion itself is recorded in the audit trail.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      await api.delete(`/loads/${loadId}/status-history/${entry._id}`);
      notify.success("Timeline entry removed.");
      onChanged?.();
    } catch (err) {
      notify.error(err?.response?.data?.message || "Could not delete that entry.");
    } finally {
      setSaving(false);
    }
  };

  // Corrections need the entry's own id, which older history rows predate.
  const editable = (row) => canEdit && loadId && row._id;

  return (
    <div className="px-5 py-4">
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200 z-0" />

        {rows.map((row, idx) => (
          <div
            key={row._id || idx}
            className="flex items-start gap-4 relative z-10"
            style={{ marginBottom: idx < rows.length - 1 ? 20 : 0 }}
          >
            {/* Dot */}
            <div
              className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: row.isCurrent ? row.colors.bg : "#f9fafb",
                border: `2px solid ${row.isCurrent ? row.colors.color : "#d1d5db"}`,
                boxShadow: row.isCurrent ? `0 0 0 3px ${row.colors.bg}` : "none",
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: row.isCurrent ? row.colors.color : "#9ca3af",
                }}
              />
            </div>

            {/* Card */}
            <div
              className="flex-1 rounded-xl p-3"
              style={{
                backgroundColor: "#fff",
                border: `1px solid ${row.isCurrent ? row.colors.border : "#f3f4f6"}`,
                boxShadow: row.isCurrent ? `0 0 0 2px ${row.colors.bg}` : "none",
              }}
            >
              {/* Top row: chip + duration */}
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: row.colors.bg,
                    color: row.colors.color,
                    border: `1px solid ${row.colors.border}`,
                  }}
                >
                  {transportStatusLabel(row.status)}
                  {row.isCurrent && (
                    <span
                      className="ml-1.5 text-[9px] font-extrabold px-1 py-px rounded-full text-white"
                      style={{ backgroundColor: row.colors.color }}
                    >
                      CURRENT
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-1.5">
                  {row.duration ? (
                    <span className="badge-gray text-[11px]">⏱ {row.duration}</span>
                  ) : (
                    <span
                      className="text-[11px] font-semibold px-2 py-px rounded-full border"
                      style={{
                        color: row.colors.color,
                        backgroundColor: row.colors.bg,
                        borderColor: row.colors.border,
                      }}
                    >
                      ⏳ In progress
                    </span>
                  )}

                  {editable(row) && (
                    <>
                      <button
                        onClick={() =>
                          setEditingId(editingId === row._id ? null : row._id)
                        }
                        disabled={saving}
                        title="Correct the time or note on this entry"
                        className="text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-40"
                      >
                        <EditOutlinedIcon style={{ fontSize: 15 }} />
                      </button>
                      {/* The latest entry is what the load's current status
                          rests on, so it cannot be removed — set the right
                          status instead and the timeline follows. */}
                      {!row.isCurrent && (
                        <button
                          onClick={() => deleteEntry(row)}
                          disabled={saving}
                          title="Delete this entry"
                          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          <DeleteOutlineIcon style={{ fontSize: 15 }} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <p className="mt-1.5 text-[11px] text-gray-400">
                Changed at:{" "}
                <span className="text-gray-600 font-semibold">{fmtFull(row.changedAt)}</span>
                {row.to && (
                  <span className="ml-2">
                    → <span className="text-gray-600 font-semibold">{fmtFull(row.to)}</span>
                  </span>
                )}
              </p>

              {/* Note */}
              {row.note && (
                <p className="mt-1.5 text-xs text-gray-700 bg-gray-50 rounded-md px-2 py-1 border-l-2 border-gray-300">
                  {row.note}
                </p>
              )}

              {editingId === row._id && (
                <EntryEditor
                  entry={row}
                  saving={saving}
                  onCancel={() => setEditingId(null)}
                  onSave={(values) => saveEntry(row, values)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusTimeline;
