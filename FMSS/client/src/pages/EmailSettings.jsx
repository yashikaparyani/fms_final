import React, { useEffect, useRef, useState } from "react";
import { notify } from "../utils/swal";
import api from "../api";

/* ─── icons ──────────────────────────────────────────────────────────────── */
const IconMail = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconSend = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);
const IconEye = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);
const IconClose = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ─── trigger badge colours ───────────────────────────────────────────────── */
const TRIGGER_COLOURS = {
  "New customer registered": "bg-blue-50 text-blue-700 border-blue-200",
  "New fleet owner created": "bg-purple-50 text-purple-700 border-purple-200",
  "Staff clicks 'Request Changes'": "bg-orange-50 text-orange-700 border-orange-200",
  "Load verified & bidding starts": "bg-green-50 text-green-700 border-green-200",
  "Bid winner assigned": "bg-yellow-50 text-yellow-700 border-yellow-200",
};

/* ─── Email Preview Modal ─────────────────────────────────────────────────── */
const PreviewModal = ({ template, onClose }) => {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    setLoadingPreview(true);
    setSendResult(null);
    api
      .get(`/config/email/preview/${template.key}`)
      .then(({ data }) => setPreview(data))
      .catch(() => notify.error("Failed to load preview"))
      .finally(() => setLoadingPreview(false));
  }, [template.key]);

  // Write HTML into iframe once loaded so styles are scoped
  useEffect(() => {
    if (!preview?.html || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               font-size: 14px; color: #111827; padding: 24px; margin: 0; line-height: 1.6; }
        h3 { color: #1e1b4b; }
        p { margin: 8px 0; }
        blockquote { margin: 16px 0; padding: 12px 16px; background: #fff7ed;
                     border-left: 4px solid #f97316; border-radius: 4px; }
      </style>
    </head><body>${preview.html}</body></html>`);
    doc.close();
  }, [preview]);

  const handleSend = async () => {
    if (!testEmail.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const { data } = await api.post("/config/email/test", { templateKey: template.key, to: testEmail.trim() });
      setSendResult(data);
      if (data.sent) notify.success(`Test email sent to ${testEmail}`);
      else notify.error(data.message || "Email not sent");
    } catch {
      notify.error("Failed to send test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{template.label}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5 transition-colors">
            <IconClose />
          </button>
        </div>

        {/* Subject line */}
        {preview && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Subject</span>
            <span className="text-sm font-medium text-gray-800">{preview.subject}</span>
          </div>
        )}

        {/* HTML Preview */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          {loadingPreview ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading preview…</div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden h-64">
              <iframe
                ref={iframeRef}
                title="email-preview"
                className="w-full h-full"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>

        {/* Send Test */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Send Test Email</p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="recipient@example.com"
              value={testEmail}
              onChange={(e) => { setTestEmail(e.target.value); setSendResult(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !testEmail.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <IconSend />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {sendResult && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${sendResult.sent ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              <span>{sendResult.sent ? "✓" : "✗"}</span>
              <span>{sendResult.message}</span>
              {sendResult.reason && <span className="opacity-60">({sendResult.reason})</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Email Preview Tester ────────────────────────────────────────────────── */
const EmailPreviewTester = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .get("/config/email/templates")
      .then(({ data }) => setTemplates(data))
      .catch(() => notify.error("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Email Template Previews</h2>
        <p className="text-sm text-gray-500 mt-1">
          Preview every system email with sample data, then send a live test to any address.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading templates…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelected(t)}
              className="text-left bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <IconMail />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{t.description}</p>
                  <span className={`inline-block mt-2 text-[11px] font-medium border rounded-full px-2 py-0.5 ${TRIGGER_COLOURS[t.trigger] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                    {t.trigger}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                <IconEye /> Preview & Test
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <PreviewModal template={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

/* ─── Main EmailSettings page ─────────────────────────────────────────────── */
const EmailSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    host: "smtp.gmail.com",
    port: 587,
    email: "",
    password: "",
    isEmailEnabled: false,
  });
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/config/email");
      setConfig({ host: data.host, port: data.port, email: data.email, password: "", isEmailEnabled: data.isEmailEnabled });
      setHasPassword(data.hasPassword);
    } catch {
      notify.error("Failed to load email config");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/config/email", config);
      notify.success("Email configuration updated successfully");
      await fetchConfig();
    } catch {
      notify.error("Failed to update email config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Email Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Configure SMTP credentials and preview / test all system email templates.</p>

      {loading ? (
        <div className="text-sm text-gray-400">Loading configuration…</div>
      ) : (
        <>
          {/* ── SMTP Config Form ───────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-2xl text-left space-y-4">

            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div>
                <span className="font-semibold text-gray-800">Enable Automated Emails</span>
                <p className="text-xs text-gray-400 mt-0.5">System will send emails for credentials, bids, and load updates.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="isEmailEnabled" checked={config.isEmailEnabled} onChange={handleChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                <input name="host" value={config.host} onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="smtp.gmail.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                <input name="port" type="number" value={config.port} onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="587" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input name="email" type="email" value={config.email} onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password / App Password{" "}
                  {hasPassword && <span className="text-green-600 text-xs ml-1">(currently set)</span>}
                </label>
                <input name="password" type="password" value={config.password} onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder={hasPassword ? "Enter new password to override…" : "Enter password"} />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button type="submit" disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save Configuration"}
              </button>
            </div>
          </form>

          {/* ── Template Preview & Tester ──────────────────────────────────── */}
          <EmailPreviewTester />
        </>
      )}
    </div>
  );
};

export default EmailSettings;
