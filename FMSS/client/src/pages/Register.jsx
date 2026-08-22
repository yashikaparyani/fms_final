import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { notify } from "../utils/swal";
import api from "../api";

/**
 * Public registration for both audiences.
 *
 * Submitting this does not create an account and does not sign anybody in — it
 * files a request the office reviews (POST /api/signups). That is the whole
 * point: carrier sign-up was removed once because it let anyone into the
 * carrier portal unvetted, and an approval step is what makes it safe to offer
 * again. Approval is what mints the account and mails the password.
 */

const ROLES = [
  {
    key: "client",
    label: "I ship freight",
    sub: "Customer / Shipper",
    blurb: "Post loads, collect quotes from carriers and track every shipment.",
    icon: Inventory2OutlinedIcon,
    accent: "var(--color-aqua-600)",
  },
  {
    key: "fleetOwner",
    label: "I move freight",
    sub: "Carrier / Owner-Operator",
    blurb: "Bid on loads, run your drivers and get paid.",
    icon: LocalShippingOutlinedIcon,
    accent: "var(--color-accent-600)",
  },
];

const labelClass = "block text-sm font-semibold text-ink-700 mb-1.5";
const inputClass =
  "w-full px-3 py-2.5 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600";

const Register = () => {
  const navigate = useNavigate();

  const [role, setRole] = useState("client");
  const [form, setForm] = useState({
    email: "",
    phone: "",
    firstName: "",
    lastName: "",
    customerName: "",
    carrierName: "",
    mcLicense: "",
    dotLicense: "",
    street: "",
    suite: "",
    city: "",
    state: "",
    zip: "",
    note: "",
    locationId: "",
  });
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const accent = ROLES.find((r) => r.key === role)?.accent;
  const isCarrier = role === "fleetOwner";

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  // Multi-location installs need the applicant to say which branch they are
  // registering under; single-location ones infer it server-side, so the field
  // is only shown when there is genuinely a choice to make.
  useEffect(() => {
    api
      .get("/branches/public")
      .then((res) => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocations([]));
  }, []);

  const submit = async () => {
    setError("");

    if (!form.email.trim()) return setError("Email is required.");
    if (isCarrier && !form.carrierName.trim())
      return setError("Carrier name is required.");
    if (!isCarrier && !form.firstName.trim())
      return setError("First name is required.");

    try {
      setLoading(true);
      await api.post("/signups", { ...form, role });
      setSubmitted(true);
      notify.success("Registration submitted for approval");
    } catch (err) {
      const message =
        err.response?.data?.message || "Could not submit your registration.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Shell accent={accent}>
        <div className="text-center">
          <CheckCircleOutlineIcon style={{ fontSize: 56, color: accent }} />
          <h2 className="text-xl font-extrabold text-ink-900 mt-3">
            Registration received
          </h2>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            Our office will review your details. Once approved we will email your
            sign-in credentials to <strong className="text-ink-800">{form.email}</strong>.
            {isCarrier
              ? " After you sign in, you will be asked to complete your carrier documentation."
              : ""}
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-6 w-full px-4 py-2.5 text-white rounded-lg text-sm font-bold shadow-lg transition-all hover:brightness-110"
            style={{ background: accent }}
          >
            Back to sign in
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell accent={accent} wide>
      <h2 className="text-xl font-extrabold text-center text-ink-900 mb-1">
        Create an account
      </h2>
      <p className="text-sm text-center text-ink-500 mb-6">
        Tell us who you are. Accounts are activated by our office.
      </p>

      {/* Role choice — the one decision that changes the rest of the form. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {ROLES.map((option) => {
          const Icon = option.icon;
          const on = option.key === role;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setRole(option.key)}
              style={on ? { borderColor: option.accent, background: "var(--color-ink-50)" } : undefined}
              className={`text-left rounded-xl border-2 p-4 transition-all duration-200 ${
                on ? "shadow-card" : "border-hairline hover:border-ink-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: on ? option.accent : "var(--color-ink-400)" }}
                >
                  <Icon fontSize="small" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-ink-900 leading-tight">
                    {option.label}
                  </p>
                  <p className="text-[11px] font-semibold text-ink-500">{option.sub}</p>
                </div>
              </div>
              <p className="text-xs text-ink-500 mt-2 leading-relaxed">{option.blurb}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isCarrier ? (
          <>
            <Field className="sm:col-span-2" label="Carrier / company name" required>
              <input className={inputClass} value={form.carrierName} onChange={set("carrierName")} placeholder="S Line Carriers LLC" />
            </Field>
            <Field label="MC number">
              <input className={inputClass} value={form.mcLicense} onChange={set("mcLicense")} placeholder="MC-123456" />
            </Field>
            <Field label="DOT number">
              <input className={inputClass} value={form.dotLicense} onChange={set("dotLicense")} placeholder="DOT-7654321" />
            </Field>
          </>
        ) : (
          <>
            <Field label="First name" required>
              <input className={inputClass} value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
            </Field>
            <Field label="Last name">
              <input className={inputClass} value={form.lastName} onChange={set("lastName")} placeholder="Doe" />
            </Field>
            <Field className="sm:col-span-2" label="Company name">
              <input className={inputClass} value={form.customerName} onChange={set("customerName")} placeholder="Acme Foods Inc." />
            </Field>
          </>
        )}

        <Field label="Email" required>
          <input type="email" className={inputClass} value={form.email} onChange={set("email")} placeholder="you@example.com" />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={form.phone} onChange={set("phone")} placeholder="(555) 010-2030" />
        </Field>

        <Field className="sm:col-span-2" label="Street">
          <input className={inputClass} value={form.street} onChange={set("street")} placeholder="1200 Commerce St" />
        </Field>
        <Field label="City">
          <input className={inputClass} value={form.city} onChange={set("city")} placeholder="Dallas" />
        </Field>
        <Field label="State">
          <input className={inputClass} value={form.state} onChange={set("state")} placeholder="TX" />
        </Field>
        <Field label="ZIP">
          <input className={inputClass} value={form.zip} onChange={set("zip")} placeholder="75201" />
        </Field>

        {locations.length > 1 && (
          <Field label="Operating location" required>
            <select className={inputClass} value={form.locationId} onChange={set("locationId")}>
              <option value="">Select a location</option>
              {locations.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field className="sm:col-span-2" label="Anything we should know?">
          <textarea
            rows={3}
            className={inputClass}
            value={form.note}
            onChange={set("note")}
            placeholder={
              isCarrier
                ? "Fleet size, equipment types, lanes you run…"
                : "What you ship, typical lanes and volumes…"
            }
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-bad-50 border border-bad-100 px-3 py-2 text-sm font-semibold text-bad-700 text-center">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={loading}
        className={`mt-6 w-full px-4 py-2.5 text-white rounded-lg text-sm font-bold shadow-lg transition-all duration-200 hover:brightness-110 active:translate-y-px ${
          loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
        style={{ background: accent }}
      >
        {loading ? "Submitting…" : "Submit for approval"}
      </button>

      <p className="mt-3 text-center text-xs text-ink-400 leading-relaxed">
        You will not be able to sign in until our office approves your account and
        emails your credentials.
      </p>

      <div className="mt-4 pt-3 border-t border-hairline text-center">
        <span className="text-sm text-ink-500">Already have an account? </span>
        <Link to="/login" className="text-sm font-semibold hover:underline" style={{ color: accent }}>
          Sign in
        </Link>
      </div>
    </Shell>
  );
};

/** Shared navy page frame, so this matches the sign-in door it links to. */
const Shell = ({ accent, wide, children }) => (
  <div className="relative min-h-screen brand-gradient flex items-center justify-center p-4 overflow-hidden">
    <div
      aria-hidden
      className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-30"
      style={{ background: accent }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent-500 blur-3xl opacity-20"
    />

    <div className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} py-8`}>
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="p-3 rounded-2xl shadow-lg" style={{ background: accent }}>
          <LocalShippingOutlinedIcon className="text-white" style={{ width: "32", height: "32" }} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-wide text-white">
          S&nbsp;LINE&nbsp;<span className="text-accent-500">TRANSPORT</span>
        </h1>
        <p className="text-xs font-medium tracking-wide text-white/60">
          All Roads. One Connection.
        </p>
      </div>

      <div className="card-accent bg-surface rounded-2xl shadow-2xl p-6 sm:p-8" style={{ "--accent": accent }}>
        {children}
      </div>
    </div>
  </div>
);

const Field = ({ label, required, className = "", children }) => (
  <div className={className}>
    <label className={labelClass}>
      {label}
      {required && <span className="text-bad-600"> *</span>}
    </label>
    {children}
  </div>
);

export default Register;
