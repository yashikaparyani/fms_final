import { useEffect, useState } from "react";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScienceIcon from "@mui/icons-material/Science";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── WhatsApp settings ────────────────────────────────────────────────────────
// Credentials for Meta's Cloud API, plus the two switches that decide whether
// anything actually leaves the building.
//
// The access token is write-only here: the server reports whether one is set and
// never returns it. Leaving the field blank keeps the stored one, so saving the
// form after changing the rate limit does not wipe the credentials.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK = {
  apiVersion: "v21.0",
  phoneNumberId: "",
  businessAccountId: "",
  accessToken: "",
  webhookVerifyToken: "",
  perMinuteLimit: 20,
};

const WhatsAppSettings = () => {
  const [form, setForm] = useState(BLANK);
  const [status, setStatus] = useState({ isEnabled: false, testMode: true });
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api
      .get("/whatsapp/config")
      .then(({ data }) => {
        setSaved(data);
        setStatus({ isEnabled: data.isEnabled, testMode: data.testMode });
        setForm((f) => ({
          ...f,
          apiVersion: data.apiVersion || "v21.0",
          phoneNumberId: data.phoneNumberId || "",
          businessAccountId: data.businessAccountId || "",
          perMinuteLimit: data.perMinuteLimit ?? 20,
          // Never populated from the server — it is not returned.
          accessToken: "",
          webhookVerifyToken: "",
        }));
      })
      .catch((err) =>
        notify.error(err.response?.data?.message || "Could not load the settings"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (patch = {}) => {
    setSaving(true);
    try {
      const { data } = await api.put("/whatsapp/config", { ...form, ...patch });
      setSaved(data);
      setStatus({ isEnabled: data.isEnabled, testMode: data.testMode });
      setForm((f) => ({ ...f, accessToken: "", webhookVerifyToken: "" }));
      notify.success("Settings saved.");
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save the settings");
    } finally {
      setSaving(false);
    }
  };

  const flush = async () => {
    try {
      const { data } = await api.post("/whatsapp/flush");
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not send the queue");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const ready = Boolean(saved?.phoneNumberId && saved?.hasAccessToken);

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">WhatsApp settings</h1>
        <p className="page-subtitle">
          Credentials for Meta&apos;s official Cloud API, and the switches that
          decide whether messages leave the building.
        </p>
      </div>

      {/* ── State at a glance ────────────────────────────────────────────── */}
      <div className={uiStyles.grid2}>
        <div
          className={`rounded-xl border p-4 ${
            status.isEnabled
              ? "border-green-200 bg-green-50"
              : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircleIcon
              fontSize="small"
              className={status.isEnabled ? "text-green-600" : "text-gray-400"}
            />
            <p className="font-semibold text-gray-900">
              {status.isEnabled ? "Sending is on" : "Sending is off"}
            </p>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {status.isEnabled
              ? "Queued messages are being processed every minute."
              : "Messages still queue, but nothing is processed until this is on."}
          </p>
          <button
            onClick={() => save({ isEnabled: !status.isEnabled })}
            disabled={saving}
            className="btn-secondary text-xs mt-3"
          >
            {status.isEnabled ? "Switch off" : "Switch on"}
          </button>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            status.testMode
              ? "border-purple-200 bg-purple-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <ScienceIcon
              fontSize="small"
              className={status.testMode ? "text-purple-600" : "text-amber-600"}
            />
            <p className="font-semibold text-gray-900">
              {status.testMode ? "Test mode" : "Live — reaching real numbers"}
            </p>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {status.testMode
              ? "Messages are rendered and logged as SIMULATED. Nothing reaches a handset."
              : "Every queued message is sent to the real number on the row."}
          </p>
          <button
            onClick={() => save({ testMode: !status.testMode })}
            disabled={saving || (status.testMode && !ready)}
            title={
              status.testMode && !ready
                ? "Add the phone number id and access token first"
                : undefined
            }
            className="btn-secondary text-xs mt-3 disabled:opacity-50"
          >
            {status.testMode ? "Go live" : "Back to test mode"}
          </button>
        </div>
      </div>

      {/* ── Credentials ──────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <h2 className="h4 mb-4 text-gray-500">Meta Cloud API credentials</h2>

        <div className={uiStyles.grid2}>
          <div>
            <label className="label block mb-1">Phone number ID</label>
            <input
              className={uiStyles.input}
              value={form.phoneNumberId}
              onChange={set("phoneNumberId")}
              placeholder="From the WhatsApp → API Setup page"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Meta&apos;s numeric id for the sending number — not the phone
              number itself.
            </p>
          </div>

          <div>
            <label className="label block mb-1">Business account ID</label>
            <input
              className={uiStyles.input}
              value={form.businessAccountId}
              onChange={set("businessAccountId")}
              placeholder="WABA id"
            />
          </div>

          <div>
            <label className="label block mb-1">
              Access token{" "}
              {saved?.hasAccessToken && (
                <span className="text-green-700 font-normal">· one is stored</span>
              )}
            </label>
            <input
              type="password"
              className={uiStyles.input}
              value={form.accessToken}
              onChange={set("accessToken")}
              placeholder={saved?.hasAccessToken ? "Leave blank to keep" : "System user token"}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Never shown again once saved. Use a long-lived system user token,
              not a temporary one.
            </p>
          </div>

          <div>
            <label className="label block mb-1">
              Webhook verify token{" "}
              {saved?.hasWebhookVerifyToken && (
                <span className="text-green-700 font-normal">· one is stored</span>
              )}
            </label>
            <input
              type="password"
              className={uiStyles.input}
              value={form.webhookVerifyToken}
              onChange={set("webhookVerifyToken")}
              placeholder={saved?.hasWebhookVerifyToken ? "Leave blank to keep" : "Any string you also give Meta"}
            />
          </div>

          <div>
            <label className="label block mb-1">Graph API version</label>
            <input
              className={uiStyles.input}
              value={form.apiVersion}
              onChange={set("apiVersion")}
            />
          </div>

          <div>
            <label className="label block mb-1">Messages per minute</label>
            <input
              type="number"
              min="1"
              max="600"
              className={uiStyles.input}
              value={form.perMinuteLimit}
              onChange={set("perMinuteLimit")}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Meta throttles per number. A burst that trips the quality rating
              costs sending capacity for days.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-gray-200">
          <button onClick={() => save()} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Save settings"}
          </button>
          <button onClick={flush} className="btn-secondary">
            Send queue now
          </button>
        </div>
      </div>

      {/* ── What still has to happen at Meta ─────────────────────────────── */}
      <div className={uiStyles.card}>
        <h2 className="h4 mb-3 text-gray-500">Before going live</h2>
        <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
          <li>
            A Meta Business account with the business verified, and a phone
            number dedicated to the API — it cannot be a number already signed in
            to the normal WhatsApp app.
          </li>
          <li>
            <span className="font-medium">Register all ten templates</span> in
            Business Manager. Their names and the order of their variables must
            match <code className="text-xs bg-gray-100 px-1 rounded">config/whatsappTemplates.js</code>{" "}
            exactly — Meta fills the slots positionally, so a reordering sends the
            load id where the date belongs and reports no error at all.
          </li>
          <li>Paste the phone number id, token and WABA id above, and save.</li>
          <li>
            Leave test mode on and send one message from the WhatsApp panel. The
            row should read <span className="font-mono text-xs">SIMULATED</span>.
          </li>
          <li>Only then switch to live.</li>
        </ol>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-semibold">Never use whatsapp-web.js, Baileys or venom-bot.</span>{" "}
          They drive a real WhatsApp account through the web client, break
          Meta&apos;s terms, and get the number permanently banned. This
          integration uses the official API for exactly that reason.
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500">
        <WhatsAppIcon fontSize="small" className="text-green-600 mt-0.5 shrink-0" />
        <p>
          Business-initiated WhatsApp messages must use templates Meta has
          approved. Free text is only allowed inside the 24-hour window that
          opens when somebody messages you first.
        </p>
      </div>
    </div>
  );
};

export default WhatsAppSettings;
