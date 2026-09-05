import { useCallback, useEffect, useMemo, useState } from "react";
import HistoryIcon from "@mui/icons-material/History";
import AddCommentIcon from "@mui/icons-material/AddComment";
import EditNoteIcon from "@mui/icons-material/EditNote";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PaymentsIcon from "@mui/icons-material/Payments";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PublicIcon from "@mui/icons-material/Public";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { usePermissions } from "../../hooks/usePermissions";
import { formatDateNumeric, formatDateTime } from "../../utils/dates";

// ─── Load audit trail & notes ─────────────────────────────────────────────────
// Everything that happened to a load, in one chronological list: field edits,
// status moves, carrier assignments, money changes, and the notes the office
// wrote along the way.
//
// One timeline rather than a "history" tab and a separate "notes" tab, because
// the question people actually bring to this screen — "why is this load like
// this?" — is answered by the interleaving. A note saying "customer moved the
// appointment" is only useful next to the date change it explains.
//
// Internal entries carry a lock badge. A client or carrier viewing the same load
// is served only the shared ones by the server, so the badge is a reminder to
// the writer rather than the thing enforcing it.
// ─────────────────────────────────────────────────────────────────────────────

const KIND_STYLE = {
  CREATED: { icon: AddCircleOutlineIcon, tone: "text-indigo-600 bg-indigo-50", label: "Created" },
  FIELD_CHANGE: { icon: EditNoteIcon, tone: "text-slate-600 bg-slate-100", label: "Edits" },
  STATUS: { icon: SwapHorizIcon, tone: "text-blue-600 bg-blue-50", label: "Status" },
  ASSIGNMENT: { icon: LocalShippingOutlinedIcon, tone: "text-purple-600 bg-purple-50", label: "Assignment" },
  FINANCIAL: { icon: PaymentsIcon, tone: "text-green-700 bg-green-50", label: "Money" },
  DOCUMENT: { icon: DescriptionOutlinedIcon, tone: "text-amber-700 bg-amber-50", label: "Documents" },
  NOTE: { icon: StickyNote2OutlinedIcon, tone: "text-gray-700 bg-gray-100", label: "Notes" },
  FOLLOW_UP: { icon: FlagOutlinedIcon, tone: "text-red-600 bg-red-50", label: "Follow-ups" },
  COMMUNICATION: { icon: MailOutlineIcon, tone: "text-cyan-700 bg-cyan-50", label: "Emails" },
  SYSTEM: { icon: SettingsSuggestOutlinedIcon, tone: "text-gray-500 bg-gray-100", label: "System" },
};

const relativeTime = (value) => {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return formatDateNumeric(value);
};

const fullTime = (value) =>
  formatDateTime(value);

const LoadAuditTrail = ({ loadId }) => {
  const { role } = usePermissions();
  const isOffice = ["staff", "admin"].includes(role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);

  const [composer, setComposer] = useState({
    open: false,
    body: "",
    visibility: "INTERNAL",
    followUp: false,
    dueAt: "",
    assignedTo: "",
  });

  const [staff, setStaff] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data: result } = await api.get(`/loads/${loadId}/audit`);
      setData(result);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load the history");
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Only admins can list staff; a dispatcher just gets no assignee picker,
    // which is a smaller loss than a failed request on every open.
    if (role !== "admin") return;
    api
      .get("/staff")
      .then(({ data: rows }) => setStaff(rows))
      .catch(() => {});
  }, [role]);

  const submitNote = async () => {
    const body = composer.body.trim();
    if (!body) {
      notify.warning("Write something first.");
      return;
    }

    try {
      setSaving(true);
      const { data: result } = await api.post(`/loads/${loadId}/audit/notes`, {
        body,
        visibility: composer.visibility,
        followUp: composer.followUp,
        dueAt: composer.followUp ? composer.dueAt || undefined : undefined,
        assignedTo: composer.followUp ? composer.assignedTo || undefined : undefined,
      });

      notify.success(result.message);
      setComposer({
        open: false,
        body: "",
        visibility: "INTERNAL",
        followUp: false,
        dueAt: "",
        assignedTo: "",
      });
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save the note");
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (entry) => {
    try {
      await api.put(`/loads/${loadId}/audit/notes/${entry._id}/resolve`, {});
      notify.success("Follow-up closed.");
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not close it");
    }
  };

  const entries = useMemo(() => {
    if (!data) return [];
    if (filter === "ALL") return data.entries;
    if (filter === "NOTES")
      return data.entries.filter((e) => ["NOTE", "FOLLOW_UP"].includes(e.kind));
    return data.entries.filter((e) => e.kind === filter);
  }, [data, filter]);

  const chips = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.counts)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({ kind, count, ...KIND_STYLE[kind] }));
  }, [data]);

  if (loading) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-400 text-center py-6">Loading history…</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={uiStyles.card}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <HistoryIcon className="text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Audit &amp; notes
            </h2>
            <p className="text-xs text-gray-500">
              {data.entries.length} entr{data.entries.length === 1 ? "y" : "ies"}
              {data.openFollowUps > 0 && (
                <span className="text-red-600 font-medium">
                  {" "}
                  · {data.openFollowUps} follow-up
                  {data.openFollowUps === 1 ? "" : "s"} open
                </span>
              )}
              {!data.canSeeInternal && " · shared entries only"}
            </p>
          </div>
        </div>

        {isOffice && (
          <button
            onClick={() => setComposer((c) => ({ ...c, open: !c.open }))}
            className="btn-primary whitespace-nowrap"
          >
            <AddCommentIcon fontSize="small" /> {composer.open ? "Cancel" : "Add note"}
          </button>
        )}
      </div>

      {/* ── Composer ──────────────────────────────────────────────────── */}
      {composer.open && (
        <div className="border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50">
          <textarea
            className={uiStyles.textarea}
            rows={3}
            placeholder="What happened? Anything the next person on this load needs to know."
            value={composer.body}
            onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
          />

          <div className="flex flex-wrap items-center gap-4 mt-3">
            {/* Internal is the default and is stated plainly, because the
                failure mode of the other default — a candid remark quietly
                visible to the customer — is the expensive one. */}
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={composer.visibility === "SHARED"}
                onChange={(e) =>
                  setComposer((c) => ({
                    ...c,
                    visibility: e.target.checked ? "SHARED" : "INTERNAL",
                  }))
                }
              />
              <span className="text-gray-700">
                Share with the customer and carrier
                <span className="block text-[11px] text-gray-500">
                  Off by default — notes are internal unless you say otherwise.
                </span>
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={composer.followUp}
                onChange={(e) =>
                  setComposer((c) => ({ ...c, followUp: e.target.checked }))
                }
              />
              <span className="text-gray-700">Needs a follow-up</span>
            </label>
          </div>

          {composer.followUp && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                  Due by
                </label>
                <input
                  type="date"
                  className={uiStyles.input}
                  value={composer.dueAt}
                  onChange={(e) =>
                    setComposer((c) => ({ ...c, dueAt: e.target.value }))
                  }
                />
              </div>
              {staff.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    Assign to
                  </label>
                  <select
                    className={uiStyles.select}
                    value={composer.assignedTo}
                    onChange={(e) =>
                      setComposer((c) => ({ ...c, assignedTo: e.target.value }))
                    }
                  >
                    <option value="">Nobody in particular</option>
                    {staff.map((s) => (
                      <option key={s._id} value={s._id}>
                        {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-3">
            <button onClick={submitNote} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : composer.followUp ? "Raise follow-up" : "Add note"}
            </button>
          </div>
        </div>
      )}

      {/* ── Filter chips ──────────────────────────────────────────────── */}
      {chips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Chip
            active={filter === "ALL"}
            onClick={() => setFilter("ALL")}
            label="Everything"
            count={data.entries.length}
          />
          {chips.map((chip) => (
            <Chip
              key={chip.kind}
              active={filter === chip.kind}
              onClick={() => setFilter(chip.kind)}
              label={chip.label}
              count={chip.count}
            />
          ))}
        </div>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          Nothing recorded yet.
        </p>
      ) : (
        <ol className="relative space-y-0">
          {entries.map((entry, index) => {
            const style = KIND_STYLE[entry.kind] || KIND_STYLE.SYSTEM;
            const Icon = style.icon;
            const isLast = index === entries.length - 1;

            return (
              <li key={entry._id} className="relative flex gap-3 pb-4">
                {/* The connecting rail, stopped short on the last entry so the
                    list does not appear to continue past its end. */}
                {!isLast && (
                  <span className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-200" />
                )}

                <span
                  className={`relative z-10 shrink-0 w-8 h-8 rounded-full grid place-items-center ${style.tone}`}
                >
                  <Icon style={{ fontSize: 17 }} />
                </span>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium text-gray-900">{entry.summary}</p>

                    {entry.visibility === "INTERNAL" ? (
                      <span
                        title="Internal — not visible to the customer or carrier"
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-500"
                      >
                        <LockOutlinedIcon style={{ fontSize: 11 }} /> INTERNAL
                      </span>
                    ) : (
                      <span
                        title="Visible to the customer and carrier"
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-cyan-700"
                      >
                        <PublicIcon style={{ fontSize: 11 }} /> SHARED
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-500">
                    {entry.actorName}
                    {entry.actorRole ? ` · ${entry.actorRole}` : ""} ·{" "}
                    <span title={fullTime(entry.createdAt)}>
                      {relativeTime(entry.createdAt)}
                    </span>
                    {entry.source === "mobile" && " · from the app"}
                  </p>

                  {entry.body && (
                    <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2">
                      {entry.body}
                    </p>
                  )}

                  {/* The diff. Shown inline because "which field, from what, to
                      what" is the whole content of a field-change entry. */}
                  {entry.changes?.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {entry.changes.map((change) => (
                        <p key={change.field} className="text-xs text-gray-600">
                          <span className="font-medium">{change.label}</span>
                          {": "}
                          <span className="line-through text-gray-400">
                            {change.from}
                          </span>
                          {" → "}
                          <span className="font-semibold text-gray-900">
                            {change.to}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  {entry.followUp && (
                    <div
                      className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        entry.followUp.resolvedAt
                          ? "border-green-200 bg-green-50 text-green-800"
                          : entry.followUp.overdue
                            ? "border-red-300 bg-red-50 text-red-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {entry.followUp.resolvedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircleIcon style={{ fontSize: 14 }} />
                          Closed by {entry.followUp.resolvedByName} on{" "}
                          {formatDateNumeric(entry.followUp.resolvedAt)}
                          {entry.followUp.resolutionNote
                            ? ` — ${entry.followUp.resolutionNote}`
                            : ""}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {entry.followUp.overdue ? "Overdue" : "Due"}
                            {entry.followUp.dueAt
                              ? ` ${formatDateNumeric(entry.followUp.dueAt)}`
                              : ""}
                            {entry.followUp.assignedToName
                              ? ` · ${entry.followUp.assignedToName}`
                              : ""}
                          </span>
                          {isOffice && (
                            <button
                              onClick={() => resolve(entry)}
                              className="font-semibold underline"
                            >
                              Mark done
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

const Chip = ({ active, onClick, label, count }) => (
  <button
    onClick={onClick}
    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
      active
        ? "bg-indigo-600 border-indigo-600 text-white"
        : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
    }`}
  >
    {label} <span className="opacity-70">{count}</span>
  </button>
);

export default LoadAuditTrail;
