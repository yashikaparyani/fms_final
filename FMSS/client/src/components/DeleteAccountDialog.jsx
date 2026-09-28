import { useState } from "react";
import api from "../api";
import { notify } from "../utils/swal";

// ─── Delete your own account ──────────────────────────────────────────────────
// Offered to customers, carriers and drivers. Staff and admins are removed by an
// administrator instead, and the server refuses them here too.
//
// Deletion anonymizes rather than erases — see services/accountDeletion.js on
// the server. The login stops working and personal details are wiped; loads,
// invoices and payments stay in the books. The dialog says so plainly, because
// "will my invoices disappear" is the question a customer asks first.
//
// It asks for the password (a session left open on a shared machine must not be
// enough) and for the word DELETE (so it cannot happen by a stray click).
// ─────────────────────────────────────────────────────────────────────────────

const SELF_DELETABLE_ROLES = ["client", "fleetOwner", "driver"];

export const canDeleteOwnAccount = (role) => SELF_DELETABLE_ROLES.includes(role);

const DeleteAccountDialog = ({ open, onClose, role, onDeleted }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const close = () => {
    setPassword("");
    setConfirm("");
    setError("");
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { data } = await api.post("/auth/delete-account", { password, confirm });
      notify.success(data?.message || "Your account has been deleted.");
      setPassword("");
      setConfirm("");
      onDeleted();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete your account.");
    } finally {
      setSaving(false);
    }
  };

  const ready = password && confirm.trim().toUpperCase() === "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="bg-surface rounded-2xl shadow-card-hover w-full max-w-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-base font-bold text-bad-700">Delete your account</h3>
          <p className="text-xs text-ink-500 mt-0.5">This cannot be undone.</p>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm text-ink-700">
          <ul className="list-disc pl-5 space-y-1 text-[13px]">
            <li>You will be signed out and will not be able to sign in again.</li>
            <li>Your name, email, phone and contact details are removed.</li>
            {role === "fleetOwner" && (
              <li>Your drivers' logins are closed too, and any open bids are withdrawn.</li>
            )}
            <li>
              Past loads, invoices and payments are kept in our records, as the law
              requires, but are no longer linked to a usable account.
            </li>
            <li>
              If a load is still in progress, finish it first — the account cannot be
              deleted mid-job.
            </li>
          </ul>

          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1">Your password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              autoComplete="current-password"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-bad-300 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </label>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
              autoComplete="off"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-bad-300 disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-bad-600 bg-bad-50 border border-bad-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-hairline bg-ink-50">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !ready}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DeleteAccountDialog;
