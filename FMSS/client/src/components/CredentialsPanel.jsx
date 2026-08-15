import { useState } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";

// ─── CredentialsPanel ─────────────────────────────────────────────────────────
// Shown once, right after accounts are created, listing each new sign-in.
//
// The passwords are on screen because they are frequently the only copy that
// will ever exist: email is not configured on every install, and a carrier
// adding drivers is usually standing next to them. The panel says so plainly and
// has to be dismissed by hand rather than fading, so nobody loses a password to
// a toast timeout. Whether the email actually went is shown per row, because
// "emailed" and "generated but not emailed" call for completely different next
// actions.
// ─────────────────────────────────────────────────────────────────────────────

const CopyButton = ({ text, label = "Copy" }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure origin) — the value is on screen to read */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
    >
      {copied ? (
        <>
          <CheckIcon style={{ fontSize: 14 }} /> Copied
        </>
      ) : (
        <>
          <ContentCopyIcon style={{ fontSize: 13 }} /> {label}
        </>
      )}
    </button>
  );
};

/**
 * `entries` — [{ name, email, password, emailStatus }]
 * `loginUrl` — where these credentials are used, included in the copy-all text.
 */
const CredentialsPanel = ({ entries = [], loginUrl, onDismiss, title }) => {
  if (!entries.length) return null;

  const allAsText = entries
    .map(
      (e) =>
        `${e.name || e.email}\n  Login: ${loginUrl}\n  Email: ${e.email}\n  Password: ${e.password}`,
    )
    .join("\n\n");

  const unsent = entries.filter((e) => e.emailStatus && !e.emailStatus.sent);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            {title || `${entries.length} new sign-in${entries.length > 1 ? "s" : ""}`}
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            These passwords are shown once and cannot be retrieved later — copy
            them now if you need to hand them over yourself. You can always issue
            a fresh one from the list below.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <CopyButton text={allAsText} label="Copy all" />
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              title="Dismiss"
              className="text-amber-700 hover:text-amber-900"
            >
              <CloseIcon fontSize="small" />
            </button>
          )}
        </div>
      </div>

      {unsent.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-900 bg-amber-100 rounded-md px-2 py-1.5 mb-3">
          <WarningAmberIcon style={{ fontSize: 15 }} />
          <span>
            {unsent.length} of these could not be emailed
            {unsent[0].emailStatus?.message
              ? ` (${unsent[0].emailStatus.message})`
              : ""}
            . Share those by hand.
          </span>
        </p>
      )}

      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div
            key={entry.email}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white rounded-lg border border-amber-200 px-3 py-2"
          >
            <div className="min-w-[10rem] flex-1">
              <p className="text-sm font-medium text-gray-900">
                {entry.name || entry.email}
              </p>
              <p className="text-xs text-gray-500">{entry.email}</p>
            </div>

            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-semibold text-gray-900 bg-gray-100 rounded px-2 py-0.5">
                {entry.password}
              </code>
              <CopyButton text={entry.password} />
            </div>

            {entry.emailStatus?.sent && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700"
                title="Credentials were emailed to this address"
              >
                <MarkEmailReadIcon style={{ fontSize: 14 }} /> Emailed
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CredentialsPanel;
