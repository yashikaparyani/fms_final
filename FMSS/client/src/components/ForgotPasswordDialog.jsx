import { useState } from "react";
import api from "../api";
import { notify } from "../utils/swal";

// ─── Forgot password ──────────────────────────────────────────────────────────
// Two steps: ask for a 6-digit code by email, then enter it with a new password.
// The phone app does exactly the same against the same two endpoints — see
// forgotPassword / resetPassword in server/controllers/authController.js.
// ─────────────────────────────────────────────────────────────────────────────

// Matches MIN_PASSWORD_LENGTH on the server.
const MIN_LENGTH = 6;

const inputClass =
  "w-full px-3 py-2.5 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600 disabled:opacity-50";

const ForgotPasswordDialog = ({ open, initialEmail = "", onClose }) => {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [seededFrom, setSeededFrom] = useState(null);

  // Take the address from the sign-in form each time the dialog opens.
  if (open && seededFrom !== initialEmail) {
    setSeededFrom(initialEmail);
    setEmail(initialEmail);
  }

  if (!open) return null;

  const close = () => {
    setStep("email");
    setCode("");
    setPassword("");
    setConfirm("");
    setError("");
    setInfo("");
    setSeededFrom(null);
    onClose();
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setInfo(data.message);
      setStep("code");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        email,
        code: code.trim(),
        newPassword: password,
      });
      notify.success(data.message);
      close();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <form
        onSubmit={step === "email" ? sendCode : reset}
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-base font-bold text-ink-800">Forgot password</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {step === "email"
              ? "We will email you a 6-digit code."
              : "Enter the code from the email and choose a new password."}
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {step === "email" ? (
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">Email</label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="The email you sign in with"
                autoComplete="email"
                disabled={busy}
                autoFocus
              />
            </div>
          ) : (
            <>
              {info && (
                <p className="text-xs text-good-700 bg-good-50 border border-good-100 rounded-lg px-3 py-2">
                  {info}
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">6-digit code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  className={`${inputClass} tracking-[0.4em] font-mono text-center text-lg`}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoComplete="one-time-code"
                  disabled={busy}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">New password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-1">Confirm new password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="text-xs font-semibold text-accent-600 hover:underline disabled:opacity-50"
              >
                Didn't get it? Send a new code
              </button>
            </>
          )}

          {error && (
            <p className="text-xs font-semibold text-bad-600 bg-bad-50 border border-bad-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-hairline bg-ink-50">
          <button type="button" onClick={close} disabled={busy} className="btn-secondary disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              (step === "email" ? !email.trim() : code.length !== 6 || !password || !confirm)
            }
            className="btn-primary disabled:opacity-50"
          >
            {busy ? "Please wait…" : step === "email" ? "Send code" : "Reset password"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ForgotPasswordDialog;
