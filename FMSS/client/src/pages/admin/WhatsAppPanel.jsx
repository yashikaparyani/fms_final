import { useEffect, useMemo, useState } from "react";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import SendIcon from "@mui/icons-material/Send";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

// ─── WhatsApp messaging panel ─────────────────────────────────────────────────
// Compose an approved template, pick who gets it, send. The message is queued
// rather than sent on the button press — Meta rate-limits per number, and a
// burst that trips the quality rating costs sending capacity for days.
//
// Why templates and not a free-text box: WhatsApp only allows free text inside
// the 24-hour window that opens when somebody messages you first. Every
// business-initiated message must be a template Meta has already approved. The
// panel is honest about that rather than offering a textarea that would fail on
// send for most recipients.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE = {
  QUEUED: "bg-gray-100 text-gray-700",
  SENDING: "bg-blue-100 text-blue-700",
  SENT: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  READ: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-amber-100 text-amber-800",
  SIMULATED: "bg-purple-100 text-purple-700",
};

const GROUPS = [
  { key: "drivers", label: "Drivers", role: "driver" },
  { key: "carriers", label: "Carriers", role: "fleetOwner" },
  { key: "customers", label: "Customers", role: "client" },
];

const WhatsAppPanel = () => {
  const [templates, setTemplates] = useState([]);
  const [book, setBook] = useState({ drivers: [], carriers: [], customers: [] });
  const [messages, setMessages] = useState([]);

  const [templateKey, setTemplateKey] = useState("custom_broadcast");
  const [variables, setVariables] = useState({});
  const [loadId, setLoadId] = useState("");
  const [group, setGroup] = useState("drivers");
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  const template = useMemo(
    () => templates.find((t) => t.key === templateKey),
    [templates, templateKey],
  );

  const loadHistory = () =>
    api
      .get("/whatsapp/messages", { params: { limit: 50 } })
      .then(({ data }) => setMessages(data))
      .catch(() => {});

  useEffect(() => {
    api.get("/whatsapp/templates").then(({ data }) => setTemplates(data)).catch(() => {});
    api.get("/whatsapp/recipients").then(({ data }) => setBook(data)).catch(() => {});
    loadHistory();
  }, []);

  useAutoRefresh(loadHistory, { enabled: !sending });

  const people = book[group] || [];
  const visible = people.filter((p) =>
    `${p.name} ${p.phone} ${p.code || ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  const chosen = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => {
      for (const g of GROUPS) {
        const hit = (book[g.key] || []).find((p) => String(p.id) === id);
        if (hit) return { ...hit, role: g.role };
      }
      return null;
    })
    .filter(Boolean);

  // The preview is rendered locally from the template's own sample, which is the
  // same string the server fills — no round trip per keystroke.
  const preview = useMemo(() => {
    if (!template) return "";
    return template.variables.reduce(
      (body, name, i) =>
        body.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), variables[name] || "—"),
      template.sample,
    );
  }, [template, variables]);

  const toggleAll = (on) => {
    const next = { ...selected };
    visible.forEach((p) => {
      // An opted-out number is never bulk-selected. Somebody who asked to stop
      // hearing from us should not be swept back in by a "select all".
      if (!p.optedOut) next[String(p.id)] = on;
    });
    setSelected(next);
  };

  const send = async () => {
    if (!chosen.length) {
      notify.warning("Choose at least one recipient.");
      return;
    }

    const missing = (template?.variables || []).filter((v) => !String(variables[v] || "").trim());
    if (missing.length) {
      notify.warning(`Fill in: ${missing.join(", ")}`);
      return;
    }

    setSending(true);
    try {
      const { data } = await api.post("/whatsapp/send", {
        templateKey,
        variables,
        loadId: loadId.trim() || undefined,
        recipients: chosen.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          role: c.role,
        })),
      });
      notify.success(data.message);
      setSelected({});
      loadHistory();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not queue the messages");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">WhatsApp</h1>
        <p className="page-subtitle">
          Send an approved template to drivers, carriers or customers. Messages
          are queued and sent at a safe rate.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Compose ────────────────────────────────────────────────────── */}
        <div className={uiStyles.card}>
          <h2 className="h4 mb-4 text-gray-500">Message</h2>

          <label className="label block mb-1.5">Template</label>
          <select
            className={uiStyles.input}
            value={templateKey}
            onChange={(e) => {
              setTemplateKey(e.target.value);
              setVariables({});
            }}
          >
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
                {t.category === "marketing" ? " (marketing)" : ""}
              </option>
            ))}
          </select>

          {template && (
            <p className="text-xs text-gray-500 mt-1.5">{template.description}</p>
          )}

          <div className="mt-4 space-y-3">
            {(template?.variables || []).map((name) => (
              <div key={name}>
                <label className="label block mb-1">{name}</label>
                {name === "message" ? (
                  <textarea
                    rows={4}
                    className={uiStyles.textarea}
                    value={variables[name] || ""}
                    onChange={(e) =>
                      setVariables((v) => ({ ...v, [name]: e.target.value }))
                    }
                    placeholder="What you want to tell them"
                  />
                ) : (
                  <input
                    className={uiStyles.input}
                    value={variables[name] || ""}
                    onChange={(e) =>
                      setVariables((v) => ({ ...v, [name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            <div>
              <label className="label block mb-1">Load ID (optional)</label>
              <input
                className={uiStyles.input}
                value={loadId}
                onChange={(e) => setLoadId(e.target.value)}
                placeholder="Ties the messages to a load in the history"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700 mb-1">
              Preview
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{preview}</p>
          </div>
        </div>

        {/* ── Recipients ─────────────────────────────────────────────────── */}
        <div className={uiStyles.card}>
          <div className={uiStyles.flexBetween}>
            <h2 className="h4 mb-4 text-gray-500">Recipients</h2>
            <span className="text-xs text-gray-500">{chosen.length} selected</span>
          </div>

          <div className="flex gap-2 mb-3">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => setGroup(g.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  group === g.key
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {g.label} ({(book[g.key] || []).length})
              </button>
            ))}
          </div>

          <input
            className={`${uiStyles.input} mb-2`}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex gap-3 mb-2 text-xs">
            <button className="link" onClick={() => toggleAll(true)}>
              Select all shown
            </button>
            <button className="link" onClick={() => toggleAll(false)}>
              Clear
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {visible.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nobody here with a phone number.
              </p>
            ) : (
              visible.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2.5 px-3 py-2 ${
                    p.optedOut ? "opacity-60" : "hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={p.optedOut}
                    checked={!!selected[String(p.id)]}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [String(p.id)]: e.target.checked }))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {p.phone}
                      {p.code ? ` · ${p.code}` : ""}
                      {p.optedOut ? " · opted out" : ""}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          <button
            onClick={send}
            disabled={sending || !chosen.length}
            className="btn-primary w-full mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? (
              "Queueing…"
            ) : (
              <>
                <SendIcon fontSize="small" /> Send to {chosen.length} recipient
                {chosen.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── History ──────────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <h2 className="h4 mb-4 text-gray-500">Recent messages</h2>

        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Nothing sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Message</th>
                  <th className="py-2 pr-3">Load</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {messages.map((m) => (
                  <tr key={m._id}>
                    <td className="py-2 pr-3">
                      <div className="text-gray-800">{m.recipientName || "—"}</div>
                      <div className="text-[11px] text-gray-500">{m.to || "no number"}</div>
                    </td>
                    <td className="py-2 pr-3 max-w-md">
                      <span className="text-gray-700 line-clamp-2">{m.preview}</span>
                      {m.lastError && (
                        <span className="block text-[11px] text-red-600">{m.lastError}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{m.loadId || "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          STATUS_TONE[m.status] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500">
        <WhatsAppIcon fontSize="small" className="text-green-600 mt-0.5 shrink-0" />
        <p>
          Messages use templates approved by Meta. While test mode is on in
          settings, nothing reaches a real number — rows are marked SIMULATED so
          the whole flow can be checked first.
        </p>
      </div>
    </div>
  );
};

export default WhatsAppPanel;
