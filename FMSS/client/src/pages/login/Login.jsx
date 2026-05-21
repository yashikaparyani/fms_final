import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginSuccess } from "../../redux/authSlice";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { notify } from "../../utils/swal";
import api from "../../api";

const Login = ({ allowedRole, showRegister }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";
  const inputClass = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border-gray-300";

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", { email, password });
      const data = response.data;

      // ✅ Role Check
      if (data.user.role !== allowedRole) {
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
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* Logo Section */}
          <div className="flex items-center justify-center mb-8">
            <div className="bg-indigo-600 p-3 rounded-xl">
              <LocalShippingOutlinedIcon
                className="text-white"
                style={{ width: "32", height: "32" }}
              />
            </div>
          </div>

          {/* Header */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Welcome to Freight
          </h1>
          <h2 className="text-xl font-bold text-center text-gray-900 mb-6">
            {allowedRole.toUpperCase()} LOGIN
          </h2>

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
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
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
              <p className="text-sm font-medium text-red-500 text-center">
                {error}
              </p>
            )}

            {/* Login Button */}
            <button
              className={`w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>

            {/* Register Link */}
            {showRegister && (
              <div className="flex justify-end pt-2 border-t border-gray-300">
                <Link
                  to="/client/register"
                  className="text-indigo-600 text-sm border-b border-white hover:border-indigo-700"
                >
                  No account? Register here
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