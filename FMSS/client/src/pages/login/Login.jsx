import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginSuccess } from "../../redux/authSlice";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { notify } from "../../utils/swal";
import api from "../../api";

/**
 * The sign-in door.
 *
 * There is one for everybody. It used to be four — /admin-login, /staff-login,
 * /client-login, /vendor-login — which meant anyone arriving at the wrong one
 * was told their (correct) credentials were invalid. The account already knows
 * its own role, so the role is read from the response and the person is sent to
 * their own dashboard.
 *
 * `allowedRole` is still honoured when given, so a narrowed door can be kept
 * for a specific purpose; left out, every role may sign in.
 */
const Login = ({ allowedRole, showRegister = true, title }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const allowedRoles = allowedRole
    ? (Array.isArray(allowedRole) ? allowedRole : [allowedRole])
    : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const labelClass = "block text-sm font-semibold text-ink-700 mb-1.5";
  const inputClass =
    "w-full px-3 py-2.5 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600";

  // Each door is tinted for the role it serves, matching that portal's accent
  // on both web and mobile — you can tell which door you are at before reading
  // the heading.
  const doorAccent =
    {
      driver: "var(--color-good-600)",
      fleetOwner: "var(--color-accent-600)",
      client: "var(--color-aqua-600)",
      staff: "var(--color-brand-400)",
      admin: "var(--color-brand-800)",
    }[allowedRoles?.[0]] || "var(--color-accent-600)";

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", { email, password });
      const data = response.data;

      // Only enforced on a door that was deliberately narrowed. The shared
      // door accepts every role and routes on the one the account carries.
      if (allowedRoles && !allowedRoles.includes(data.user.role)) {
        setError("You are not allowed to login here");
        notify.warning("You are not allowed to login here");
        setLoading(false);
        return;
      }

      localStorage.setItem("api_token", data.api_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      dispatch(
        loginSuccess({
          user: data.user,
          api_token: data.api_token,
        })
      );

      notify.success(`Welcome back, ${data.user.firstName}!`);

      navigate(`/${data.user.role}/dashboard`);

    } catch (error) {
      const errorMessage = error.response?.data?.message || "Login failed. Please try again.";
      setError(errorMessage);
      notify.error(`${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen brand-gradient flex items-center justify-center p-4 overflow-hidden">
      {/* Two soft colour washes over the navy. Purely atmospheric, and cheap —
          no image to download on a depot's connection. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-30"
        style={{ background: doorAccent }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent-500 blur-3xl opacity-20"
      />

      <div className="relative w-full max-w-md">
        {/* Wordmark above the card, on the navy */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div
            className="p-3 rounded-2xl shadow-lg"
            style={{ background: doorAccent }}
          >
            <LocalShippingOutlinedIcon
              className="text-white"
              style={{ width: "32", height: "32" }}
            />
          </div>
          <h1 className="text-2xl font-extrabold tracking-wide text-white">
            S&nbsp;LINE&nbsp;<span className="text-accent-500">TRANSPORT</span>
          </h1>
          <p className="text-xs font-medium tracking-wide text-white/60">
            All Roads. One Connection.
          </p>
        </div>

        <div className="card-accent bg-surface rounded-2xl shadow-2xl p-8" style={{ "--accent": doorAccent }}>
          {/* Header */}
          <h2 className="text-xl font-extrabold text-center text-ink-900 mb-1">
            {title || (allowedRoles ? `${allowedRoles[0].toUpperCase()} LOGIN` : "Sign in")}
          </h2>
          <p className="text-sm text-center text-ink-500 mb-6">
            Sign in to continue.
          </p>

          {/* Form */}
          <div className="space-y-4">

            {/* Email Field */}
            <div>
              <label className={labelClass}>
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div>
              <label className={labelClass}>
                Password
              </label>
              <div className="relative">
                <input
                  placeholder="Enter your password"
                  className={inputClass}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-ink-400 hover:text-ink-600 transition-colors"
                  disabled={loading}
                >
                  {showPassword ? (
                    <VisibilityOffOutlinedIcon fontSize="small" />
                  ) : (
                    <VisibilityOutlinedIcon fontSize="small" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <p className="rounded-lg bg-bad-50 border border-bad-100 px-3 py-2 text-sm font-semibold text-bad-700 text-center">
                {error}
              </p>
            )}

            {/* Login Button */}
            <button
              className={`w-full px-4 py-2.5 text-white rounded-lg text-sm font-bold shadow-lg transition-all duration-200 hover:brightness-110 active:translate-y-px ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              style={{ background: doorAccent }}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>

            {/* Register Link — one form now serves shippers and carriers. */}
            {showRegister && (
              <div className="pt-3 border-t border-hairline text-center">
                <span className="text-sm text-ink-500">New here? </span>
                <Link
                  to="/register"
                  className="text-sm font-semibold hover:underline"
                  style={{ color: doorAccent }}
                >
                  Register as a customer or carrier
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;