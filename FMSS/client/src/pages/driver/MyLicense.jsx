import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { formatDateNumeric } from "../../utils/dates";

// ─── My licence ───────────────────────────────────────────────────────────────
// The one screen a driver has to visit before they can work.
//
// Both agreements the carrier signed warrant that every driver is competent and
// properly licensed, so the server refuses a status update from a driver with no
// licence on file. This is where they fix that — and if their carrier already
// uploaded one during onboarding, they land here to a green tick and nothing to
// do.
// ─────────────────────────────────────────────────────────────────────────────

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

const fmtDate = (value) =>
  value ? formatDateNumeric(value) : "—";

const MyLicense = () => {
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [state, setState] = useState({ loading: true, driver: null, compliance: null });
  const [form, setForm] = useState({
    licenseNumber: "",
    licenseState: "",
    licenseClass: "A",
    licenseExpiry: "",
    medicalCardExpiry: "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/drivers/me");
      setState({ loading: false, driver: data.driver, compliance: data.compliance });
      setForm({
        licenseNumber: data.driver.licenseNumber || "",
        licenseState: data.driver.licenseState || "",
        licenseClass: data.driver.licenseClass || "A",
        licenseExpiry: data.driver.licenseExpiry
          ? String(data.driver.licenseExpiry).slice(0, 10)
          : "",
        medicalCardExpiry: data.driver.medicalCardExpiry
          ? String(data.driver.medicalCardExpiry).slice(0, 10)
          : "",
      });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load your details");
      setState({ loading: false, driver: null, compliance: null });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!file) {
      notify.warning("Choose a photo or scan of your licence first.");
      return;
    }

    const body = new FormData();
    body.append("license", file);
    Object.entries(form).forEach(([key, value]) => {
      if (value) body.append(key, value);
    });

    try {
      setSaving(true);
      const { data } = await api.post("/drivers/me/license", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setState((s) => ({ ...s, driver: data.driver, compliance: data.compliance }));
      setFile(null);
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not upload your licence");
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  if (!state.driver) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-600">
          Your driver record could not be found. Ask your carrier to check your
          account.
        </p>
      </div>
    );
  }

  const { driver, compliance } = state;
  const onFile = driver.hasLicenseOnFile;

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">My licence</h1>
        <p className="page-subtitle">
          {driver.name}
          {driver.driverCode ? ` · ${driver.driverCode}` : ""}
        </p>
      </div>

      {/* The answer to "can I work?", first thing on the page. */}
      {compliance?.canUpdateLoads ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircleIcon className="text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-900">
              You are cleared to update your loads
            </p>
            <p className="text-xs text-green-800 mt-0.5">
              Your licence is on file
              {driver.licenseExpiry ? ` and valid until ${fmtDate(driver.licenseExpiry)}` : ""}.
              Nothing further is needed.
            </p>
            <button
              onClick={() => navigate("/driver/assigned-loads")}
              className="text-xs font-medium text-green-800 underline mt-2"
            >
              Go to my loads →
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <WarningAmberIcon className="text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              You cannot update loads yet
            </p>
            <p className="text-xs text-amber-800 mt-0.5">{compliance?.message}</p>
          </div>
        </div>
      )}

      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-4">
          <BadgeOutlinedIcon className="text-indigo-600" />
          <h2 className="text-base font-semibold text-gray-900">
            {onFile ? "Replace your licence" : "Upload your licence"}
          </h2>
        </div>

        {onFile && (
          <p className="text-xs text-gray-500 mb-4">
            A copy is already on file
            {driver.licenseNumber ? ` (${driver.licenseNumber})` : ""}. You only
            need to do this again when you renew.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Licence number
            </label>
            <input
              className={uiStyles.input}
              value={form.licenseNumber}
              onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Issuing state
            </label>
            <select
              className={uiStyles.select}
              value={form.licenseState}
              onChange={(e) => setForm((f) => ({ ...f, licenseState: e.target.value }))}
            >
              <option value="">Choose…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Class
            </label>
            <select
              className={uiStyles.select}
              value={form.licenseClass}
              onChange={(e) => setForm((f) => ({ ...f, licenseClass: e.target.value }))}
            >
              {["A", "B", "C"].map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Expiry date
            </label>
            <input
              type="date"
              className={uiStyles.input}
              value={form.licenseExpiry}
              onChange={(e) => setForm((f) => ({ ...f, licenseExpiry: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              DOT medical card expiry
            </label>
            <input
              type="date"
              className={uiStyles.input}
              value={form.medicalCardExpiry}
              onChange={(e) =>
                setForm((f) => ({ ...f, medicalCardExpiry: e.target.value }))
              }
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Optional — it expires on its own schedule, separately from the licence.
            </p>
          </div>
        </div>

        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          ref={fileInput}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-center hover:border-indigo-400 transition-colors"
        >
          <UploadFileIcon className="text-gray-400" />
          <p className="text-sm font-medium text-gray-700 mt-1">
            {file ? file.name : "Take a photo or choose a file"}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            A clear photo of the front of your licence is fine
          </p>
        </button>

        <div className="flex justify-end mt-4">
          <button onClick={submit} disabled={saving || !file} className="btn-primary">
            {saving ? "Uploading…" : "Save licence"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MyLicense;
