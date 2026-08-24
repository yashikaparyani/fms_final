import { useCallback, useEffect, useState } from "react";
import BoltIcon from "@mui/icons-material/Bolt";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── Instant dispatch settings ────────────────────────────────────────────────
// The commercial and operational dials behind the "find me a truck now" route:
// what the business keeps, how far out to look, and how long a carrier has to
// take a load before it goes back out for bidding.
//
// Two layers. The default row every location inherits, and a per-location
// override. A location that has never been touched follows the default, and
// clearing a field puts it back to following it — so raising the house rate
// moves everyone except the locations that deliberately set their own.
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  {
    key: "commissionPercent",
    label: "Commission",
    suffix: "%",
    hint: "What the business keeps of the customer's amount. The carrier is shown, and paid, the rest — they never see the customer's figure.",
    min: 0,
    max: 100,
  },
  {
    key: "searchRadiusMiles",
    label: "Search radius",
    suffix: "miles",
    hint: "How far from the pickup to look for a truck. Too wide and carriers get offers they will not take; too narrow and loads fall through to bidding.",
    min: 1,
    max: 2000,
  },
  {
    key: "positionMaxAgeHours",
    label: "Position freshness",
    suffix: "hours",
    hint: "Ignore drivers whose last reported position is older than this. An old position is not evidence of where a truck is now.",
    min: 1,
    max: 720,
  },
  {
    key: "offerWindowMinutes",
    label: "Offer window",
    suffix: "minutes",
    hint: "How long carriers have to accept. When it runs out the load goes back out for bidding automatically.",
    min: 1,
    max: 1440,
  },
];

const DispatchSettings = () => {
  const [branches, setBranches] = useState([]);
  // "" is the house default row that every location inherits from.
  const [branch, setBranch] = useState("");
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/branches")
      .then(({ data }) => setBranches(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/instant-dispatch/settings", {
        params: branch ? { branch } : undefined,
      });
      setSettings(data);
      setForm({
        commissionPercent: data.commissionPercent ?? "",
        searchRadiusMiles: data.searchRadiusMiles ?? "",
        positionMaxAgeHours: data.positionMaxAgeHours ?? "",
        offerWindowMinutes: data.offerWindowMinutes ?? "",
        instantDispatchEnabled: data.instantDispatchEnabled,
      });
    } catch (err) {
      notify.error(err?.response?.data?.message || "Could not load the settings");
    }
  }, [branch]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      setSaving(true);
      const { data } = await api.put("/instant-dispatch/settings", {
        branch: branch || null,
        ...form,
      });
      setSettings(data);
      notify.success(data.message);
    } catch (err) {
      notify.error(err?.response?.data?.message || "Could not save the settings");
    } finally {
      setSaving(false);
    }
  };

  // A location following the default should say so rather than show a number
  // that looks like somebody set it here.
  const inherited = !!branch && !settings?.source?.branch;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BoltIcon className="text-amber-500" /> Instant dispatch
          </h1>
          <p className="page-subtitle">
            What the business keeps, and how loads find the nearest truck.
          </p>
        </div>

        <select
          className={uiStyles.input}
          style={{ maxWidth: 280 }}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          <option value="">Default — all locations</option>
          {branches.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>

      {settings === null ? (
        <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>
      ) : (
        <>
          {inherited && (
            <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-4">
              This location follows the default settings. Change anything below and it
              stops following them; clear a field to start following it again.
            </p>
          )}

          <div className={uiStyles.card}>
            <label className="flex items-start gap-3 cursor-pointer mb-5 pb-5 border-b border-gray-100">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-indigo-600"
                checked={!!form.instantDispatchEnabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instantDispatchEnabled: e.target.checked }))
                }
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-semibold text-gray-900">
                  Offer instant dispatch to customers
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Turn this off and customers here only see the bidding option. Loads
                  already out to carriers are not affected.
                </span>
              </span>
            </label>

            <div className="space-y-5">
              {FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      className={uiStyles.input}
                      style={{ maxWidth: 160 }}
                      value={form[field.key] ?? ""}
                      placeholder={branch ? "Inherited" : ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [field.key]: e.target.value }))
                      }
                      disabled={saving}
                    />
                    <span className="text-sm text-gray-500">{field.suffix}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug max-w-2xl">
                    {field.hint}
                  </p>
                </div>
              ))}
            </div>

            {/* The rate only ever applies to loads offered from now on — a load
                a carrier already accepted keeps the split it was agreed at. */}
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-6">
              Changing the commission affects loads offered from now on. A load a
              carrier has already accepted keeps the rate it was agreed at.
            </p>

            <div className="flex justify-end mt-4">
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>

          {/* What this location actually runs on once the layers are resolved. */}
          <div className={uiStyles.card}>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              In effect {branch ? "for this location" : "everywhere by default"}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {FIELDS.map((field) => (
                <div key={field.key}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {field.label}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {settings[field.key]} {field.suffix}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DispatchSettings;
