import { useState } from "react";
import api from "../api";
import { notify } from "../utils/swal";

// ─── Change your own password ─────────────────────────────────────────────────
// Available to every role, because every account in the system was created with
// a password somebody else chose: staff issue credentials to customers and
// carriers, admins issue them to staff, the seed issues them to admins. Until
// this existed there was no way for any of those people to stop the person who
// issued it from still knowing it.
//
// The current password is asked for even though the user is already signed in.
// A session left open on a shared machine is the case this is defending
// against, and the old password is what stops that becoming a takeover. The
// server enforces the same rule — this only saves a round trip.
// ─────────────────────────────────────────────────────────────────────────────

// Matches the server (MIN_PASSWORD_LENGTH in controllers/authController.js) and
// the signup validator. Asking for more here than signup did would reject the
// password the account was created with.
const MIN_LENGTH = 6;

const Field = ({ label, value, onChange, disabled, autoComplete }) => (
  <div>
    <label className="block text-xs font-semibold text-ink-600 mb-1">{label}</label>
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      autoComplete={autoComplete}
      className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-50"
    />
  </div>
);

const ChangePasswordDialog = ({ open, onClose }) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const close = () => {
    // Never leave a password sitting in state behind a closed dialog.
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (next.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    // Checked here rather than on the server: the server never sees the
    // confirmation, and a typo in it is the user's mistake to catch, not a
    // reason to change the password to something they did not mean.
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    if (next === current) {
      setError("Your new password must be different from your current one.");
      return;
    }

    setSaving(true);
    try {
      await api.put("/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      });
      notify.success("Your password has been changed.");
      close();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="bg-surface rounded-2xl shadow-card-hover w-full max-w-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-base font-bold text-ink-800">Change password</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            You will stay signed in on this device.
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          <Field
            label="Current password"
            value={current}
            onChange={setCurrent}
            disabled={saving}
            autoComplete="current-password"
          />
          <Field
            label="New password"
            value={next}
            onChange={setNext}
            disabled={saving}
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            disabled={saving}
            autoComplete="new-password"
          />

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
            disabled={saving || !current || !next || !confirm}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePasswordDialog;
