import { useCallback, useEffect, useState } from "react";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DashboardHeader from "../../components/DashboardHeader";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import api from "../../api";
import { formatDateNumeric } from "../../utils/dates";

/**
 * Where the office writes to everybody.
 *
 * Two deliveries, one composer: the marquee across the top of every portal, and
 * a one-off push into the notification bell. They are checkboxes rather than
 * two screens because "systems down 6–8pm tonight" is usually both, and asking
 * someone to write it twice is how the two end up saying different things.
 */

const ROLES = [
  { key: "client", label: "Customers" },
  { key: "fleetOwner", label: "Carriers" },
  { key: "driver", label: "Drivers" },
  { key: "staff", label: "Staff" },
  { key: "admin", label: "Admins" },
];

const TONES = [
  { key: "info", label: "Info", chip: "bg-accent-600" },
  { key: "success", label: "Good news", chip: "bg-good-600" },
  { key: "warning", label: "Warning", chip: "bg-warn-600" },
  { key: "danger", label: "Urgent", chip: "bg-bad-600" },
];

const labelClass = "block text-sm font-semibold text-ink-700 mb-1.5";

const emptyForm = {
  title: "",
  message: "",
  roles: [],
  tone: "info",
  marquee: true,
  notify: false,
  link: "",
  linkLabel: "",
  startsAt: "",
  endsAt: "",
};

const Announcements = () => {
  const [form, setForm] = useState(emptyForm);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/announcements");
      setList(data?.announcements || []);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load announcements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleRole = (role) =>
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role],
    }));

  const post = async () => {
    setError("");

    if (!form.message.trim()) return setError("Write a message first.");
    if (!form.marquee && !form.notify) {
      return setError("Pick at least one way to deliver it.");
    }

    try {
      setSaving(true);
      const { data } = await api.post("/announcements", form);
      notify.success(data?.message || "Posted");
      setForm(emptyForm);
      load();
    } catch (err) {
      const message = err.response?.data?.message || "Could not post this.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    try {
      await api.put(`/announcements/${item._id}`, { isActive: !item.isActive });
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update");
    }
  };

  const remove = async (item) => {
    if (!window.confirm("Remove this announcement?")) return;
    try {
      await api.delete(`/announcements/${item._id}`);
      notify.success("Removed");
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not remove");
    }
  };

  const liveCount = list.filter((i) => i.isActive && i.marquee).length;
  const tone = TONES.find((t) => t.key === form.tone) || TONES[0];

  return (
    <div className={uiStyles.page}>
      <DashboardHeader
        title="Notifications & announcements"
        subtitle="Post a marquee across every portal, send a notification, or both."
        stats={[
          { label: "Showing now", value: liveCount },
          { label: "Total posted", value: list.length },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Composer ── */}
        <div className="panel p-5">
          <h3 className="text-sm font-bold text-ink-800 mb-4">New announcement</h3>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Title (optional)</label>
              <input
                className={uiStyles.input}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Scheduled maintenance"
                maxLength={120}
              />
            </div>

            <div>
              <label className={labelClass}>
                Message <span className="text-bad-600">*</span>
              </label>
              <textarea
                rows={3}
                className={uiStyles.textarea}
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                placeholder="The system will be unavailable tonight from 6pm to 8pm Pacific."
                maxLength={500}
              />
              <p className="text-xs text-ink-400 mt-1">
                {form.message.length}/500
              </p>
            </div>

            <div>
              <label className={labelClass}>Who sees it</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => {
                  const on = form.roles.includes(role.key);
                  return (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => toggleRole(role.key)}
                      style={on ? { background: "var(--role-accent)" } : undefined}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        on
                          ? "text-white shadow-card"
                          : "bg-surface border border-hairline text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-ink-400 mt-1.5">
                {form.roles.length === 0
                  ? "Nothing selected — it goes to everybody."
                  : `Only ${form.roles.length} selected ${
                      form.roles.length === 1 ? "group" : "groups"
                    } will see it.`}
              </p>
            </div>

            <div>
              <label className={labelClass}>Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => set("tone", option.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      form.tone === option.key
                        ? "border-ink-400 bg-ink-50"
                        : "border-hairline hover:border-ink-300"
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${option.chip}`} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>How to deliver</label>
              <div className="space-y-2">
                <Check
                  checked={form.marquee}
                  onChange={(v) => set("marquee", v)}
                  icon={<CampaignOutlinedIcon fontSize="small" />}
                  title="Marquee"
                  hint="Shows across the top of every screen until dismissed or expired."
                />
                <Check
                  checked={form.notify}
                  onChange={(v) => set("notify", v)}
                  icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
                  title="Notification"
                  hint="Drops into the notification bell once. Cannot be un-sent."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Show from (optional)</label>
                <input
                  type="datetime-local"
                  className={uiStyles.input}
                  value={form.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Until (optional)</label>
                <input
                  type="datetime-local"
                  className={uiStyles.input}
                  value={form.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Link (optional)</label>
                <input
                  className={uiStyles.input}
                  value={form.link}
                  onChange={(e) => set("link", e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className={labelClass}>Link text</label>
                <input
                  className={uiStyles.input}
                  value={form.linkLabel}
                  onChange={(e) => set("linkLabel", e.target.value)}
                  placeholder="Read more"
                />
              </div>
            </div>

            {/* What it will actually look like. */}
            {form.message.trim() ? (
              <div>
                <label className={labelClass}>Preview</label>
                <div
                  className={`${tone.chip} text-white rounded-lg px-4 py-2 flex items-center gap-3`}
                >
                  <CampaignOutlinedIcon fontSize="small" />
                  <p className="text-sm font-semibold truncate">
                    {form.title ? <strong>{form.title} — </strong> : null}
                    {form.message}
                  </p>
                </div>
              </div>
            ) : null}

            {error && (
              <p className="rounded-lg bg-bad-50 border border-bad-100 px-3 py-2 text-sm font-semibold text-bad-700">
                {error}
              </p>
            )}

            <button
              onClick={post}
              disabled={saving}
              className={`btn-primary w-full justify-center ${saving ? "btn-disabled" : ""}`}
            >
              {saving ? "Posting…" : "Post announcement"}
            </button>
          </div>
        </div>

        {/* ── Posted ── */}
        <div className="panel p-5">
          <h3 className="text-sm font-bold text-ink-800 mb-4">Posted</h3>

          {loading ? (
            <p className="text-sm text-ink-500 text-center py-8">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-8">
              Nothing posted yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
              {list.map((item) => {
                const itemTone = TONES.find((t) => t.key === item.tone) || TONES[0];
                return (
                  <div
                    key={item._id}
                    className="rounded-xl border border-hairline p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${itemTone.chip}`}
                      />
                      <div className="min-w-0 flex-1">
                        {item.title ? (
                          <p className="text-sm font-bold text-ink-900">{item.title}</p>
                        ) : null}
                        <p className="text-sm text-ink-600 break-words">{item.message}</p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className={item.isActive ? "badge-green" : "badge-gray"}>
                            {item.isActive ? "Active" : "Off"}
                          </span>
                          {item.marquee ? <span className="badge-blue">Marquee</span> : null}
                          {item.notifiedAt ? (
                            <span className="badge-purple">
                              Notified {item.notifiedCount}
                            </span>
                          ) : null}
                          <span className="badge-gray">
                            {item.roles?.length
                              ? item.roles
                                  .map(
                                    (r) => ROLES.find((x) => x.key === r)?.label || r,
                                  )
                                  .join(", ")
                              : "Everyone"}
                          </span>
                          <span className="text-[11px] text-ink-400">
                            {formatDateNumeric(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          onClick={() => toggleActive(item)}
                          className="btn-secondary-small"
                        >
                          {item.isActive ? "Turn off" : "Turn on"}
                        </button>
                        <button
                          onClick={() => remove(item)}
                          className="btn-secondary-small bg-bad-600 hover:bg-bad-700"
                        >
                          <DeleteOutlineIcon style={{ fontSize: 14 }} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Check = ({ checked, onChange, icon, title, hint }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    style={checked ? { borderColor: "var(--role-accent)" } : undefined}
    className={`w-full text-left flex items-start gap-3 rounded-xl border-2 p-3 transition-all ${
      checked ? "bg-ink-50" : "border-hairline hover:border-ink-300"
    }`}
  >
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
        checked ? "text-white" : "bg-ink-100 text-ink-500"
      }`}
      style={checked ? { background: "var(--role-accent)" } : undefined}
    >
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-ink-900">{title}</span>
      <span className="block text-xs text-ink-500 leading-relaxed">{hint}</span>
    </span>
  </button>
);

export default Announcements;
