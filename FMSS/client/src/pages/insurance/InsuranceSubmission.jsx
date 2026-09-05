import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { formatDateTime } from "../../utils/dates";

// ─── Insurance certificate filing ─────────────────────────────────────────────
// The carrier's own insurance agency lands here from a one-off link in an email.
// They have no account and will most likely visit exactly once.
//
// That shapes everything about the page: the carrier being insured is stated at
// the top so the agency can match it to a policy without phoning anyone, the
// certificate holder is spelled out rather than implied, and each coverage
// carries the contractual minimum next to the field so a shortfall is visible
// while it can still be fixed rather than after submission.
//
// Deliberately not behind the app's auth: `api` attaches a bearer token when one
// happens to be in localStorage, which is harmless here — the server
// authenticates the token in the URL and ignores everything else.
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) =>
  value === null || value === undefined || value === ""
    ? ""
    : `$${Number(value).toLocaleString("en-US")}`;

const BLANK_POLICY = {
  insurerName: "",
  amBestRating: "",
  policyNumber: "",
  limit: "",
  aggregateLimit: "",
  deductible: "",
  effectiveDate: "",
  expiryDate: "",
  namedInsured: "",
  additionalInsured: false,
  lossPayee: false,
  waiverOfSubrogation: false,
  mcs90Attached: false,
  noticeOfCancellationDays: 30,
  notes: "",
};

const InsuranceSubmission = () => {
  const { token } = useParams();

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [policies, setPolicies] = useState({});
  const [included, setIncluded] = useState(new Set());
  const [submitter, setSubmitter] = useState({ name: "", email: "", agencyName: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  // The one certificate for this filing, as the server has it. An ACORD 25
  // lists every coverage on a single page, so it is attached once here rather
  // than once per policy row.
  const [certificate, setCertificate] = useState(null);
  const [uploading, setUploading] = useState(false);

  const certInput = useRef(null);

  useEffect(() => {
    api
      .get(`/insurance/public/${token}`)
      .then(({ data }) => {
        setState({ loading: false, error: null, data });
        setSubmitter((s) => ({ ...s, agencyName: data.agencyName || "" }));
        // So a returning agent sees the certificate they already attached
        // rather than wondering whether the first upload landed.
        setCertificate(data.certificate || null);

        // Pre-open every required coverage, plus anything already filed. An
        // agency should not have to hunt for the rows they are obliged to fill.
        const open = new Set(data.requirements.requiredKeys);
        const seeded = {};

        (data.policies || []).forEach((p) => {
          open.add(p.coverage);
          seeded[p.coverage] = {
            ...BLANK_POLICY,
            ...p,
            effectiveDate: p.effectiveDate ? p.effectiveDate.slice(0, 10) : "",
            expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
          };
        });

        setPolicies(seeded);
        setIncluded(open);
      })
      .catch((err) => {
        setState({
          loading: false,
          error:
            err.response?.data?.message ||
            "This link could not be opened. Ask the carrier to send a fresh request.",
          data: null,
        });
      });
  }, [token]);

  const setPolicyField = (coverage, key, value) =>
    setPolicies((current) => ({
      ...current,
      [coverage]: { ...BLANK_POLICY, ...current[coverage], [key]: value },
    }));

  const toggleCoverage = (coverage, required) => {
    if (required) return; // required rows cannot be closed
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(coverage)) next.delete(coverage);
      else next.add(coverage);
      return next;
    });
  };

  /** Live check against the contractual minimum, shown while they type. */
  const warningFor = (coverage) => {
    const policy = policies[coverage.key];
    if (!policy) return null;

    const problems = [];

    if (coverage.minLimit && policy.limit && Number(policy.limit) < coverage.minLimit) {
      problems.push(`below the required ${money(coverage.minLimit)}`);
    }
    if (
      coverage.minAggregate &&
      policy.aggregateLimit &&
      Number(policy.aggregateLimit) < coverage.minAggregate
    ) {
      problems.push(`aggregate below ${money(coverage.minAggregate)}`);
    }
    if (coverage.needsAdditionalInsured && !policy.additionalInsured) {
      problems.push("additional insured not ticked");
    }
    if (coverage.needsLossPayee && !policy.lossPayee) {
      problems.push("loss payee not ticked");
    }
    if (policy.expiryDate && new Date(policy.expiryDate) < new Date()) {
      problems.push("policy has already expired");
    }

    return problems.length ? problems.join(" · ") : null;
  };

  const submit = async () => {
    const payload = [...included]
      .map((coverage) => ({ coverage, ...(policies[coverage] || BLANK_POLICY) }))
      .filter((p) => p.insurerName || p.policyNumber || p.limit);

    if (!payload.length) {
      notify.warning("Fill in at least one policy before submitting.");
      return;
    }

    try {
      setSaving(true);
      const { data } = await api.post(`/insurance/public/${token}`, {
        policies: payload,
        submittedByName: submitter.name,
        submittedByEmail: submitter.email,
        agencyName: submitter.agencyName,
      });
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not file the certificates");
    } finally {
      setSaving(false);
    }
  };

  const uploadCertificate = async (file) => {
    if (!file) return;

    const body = new FormData();
    body.append("certificate", file);

    try {
      setUploading(true);
      const { data } = await api.post(
        `/insurance/public/${token}/certificate`,
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setCertificate(data.certificate || null);
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not attach the certificate");
    } finally {
      setUploading(false);
    }
  };

  const coverages = useMemo(
    () => state.data?.requirements?.coverages || [],
    [state.data],
  );

  // ── Shell states ───────────────────────────────────────────────────────────
  if (state.loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <LinkOffIcon style={{ fontSize: 48 }} className="text-gray-300" />
          <h1 className="text-lg font-semibold text-gray-900 mt-3">
            This link cannot be opened
          </h1>
          <p className="text-sm text-gray-600 mt-2">{state.error}</p>
        </div>
      </div>
    );
  }

  const { carrier, broker } = state.data;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl">
              <ShieldOutlinedIcon className="text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                Certificates of insurance
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Filed on behalf of your client. No account or password is needed —
                this link is all you need.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-200">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Insured
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {carrier.legalName}
                {carrier.dba ? ` (dba ${carrier.dba})` : ""}
              </p>
              <p className="text-xs text-gray-600">
                {[carrier.mcNumber && `MC ${carrier.mcNumber}`, carrier.dotNumber && `USDOT ${carrier.dotNumber}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {carrier.address && (
                <p className="text-xs text-gray-500 mt-0.5">{carrier.address}</p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Certificate holder / additional insured
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{broker.name}</p>
              <p className="text-xs text-gray-600">{broker.address}</p>
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div
            className={`rounded-2xl border p-5 ${
              result.shortfalls?.length
                ? "bg-amber-50 border-amber-300"
                : "bg-green-50 border-green-300"
            }`}
          >
            <div className="flex items-start gap-2">
              {result.shortfalls?.length ? (
                <WarningAmberIcon className="text-amber-600" />
              ) : (
                <CheckCircleIcon className="text-green-600" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{result.message}</p>
                {result.shortfalls?.length > 0 && (
                  <ul className="text-xs text-amber-900 list-disc pl-5 mt-2 space-y-0.5">
                    {result.shortfalls.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-600 mt-2">
                  You can keep this page open and submit again if anything needs
                  correcting.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Policies */}
        {coverages.map((coverage) => {
          const isIncluded = included.has(coverage.key);
          const policy = { ...BLANK_POLICY, ...(policies[coverage.key] || {}) };
          const warning = isIncluded ? warningFor(coverage) : null;

          return (
            <div
              key={coverage.key}
              className={`bg-white rounded-2xl shadow-sm border p-5 ${
                warning ? "border-amber-300" : "border-gray-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-[16rem]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-indigo-600"
                    checked={isIncluded}
                    disabled={coverage.required}
                    onChange={() => toggleCoverage(coverage.key, coverage.required)}
                  />
                  <span>
                    <span className="text-sm font-semibold text-gray-900">
                      {coverage.label}
                    </span>
                    {coverage.required ? (
                      <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                        REQUIRED
                      </span>
                    ) : (
                      <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        OPTIONAL
                      </span>
                    )}
                    <span className="block text-[11px] text-gray-500 mt-1 leading-snug">
                      {coverage.description}
                    </span>
                    <span className="block text-[10px] text-gray-400 mt-0.5 italic">
                      {coverage.basis}
                    </span>
                  </span>
                </label>

                <div className="text-right text-[11px] text-gray-500 shrink-0">
                  {coverage.statutory && <p>Statutory limits</p>}
                  {coverage.minLimit && <p>Min limit {money(coverage.minLimit)}</p>}
                  {coverage.minAggregate && (
                    <p>Min aggregate {money(coverage.minAggregate)}</p>
                  )}
                  {coverage.minAmBest && <p>AM Best {coverage.minAmBest} or better</p>}
                </div>
              </div>

              {isIncluded && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      label="Insurer / underwriter"
                      value={policy.insurerName}
                      onChange={(v) => setPolicyField(coverage.key, "insurerName", v)}
                    />
                    <Select
                      label="AM Best rating"
                      value={policy.amBestRating}
                      options={state.data.requirements.amBestRatings}
                      onChange={(v) => setPolicyField(coverage.key, "amBestRating", v)}
                    />
                    <Input
                      label="Policy number"
                      value={policy.policyNumber}
                      onChange={(v) => setPolicyField(coverage.key, "policyNumber", v)}
                    />

                    <Input
                      label={coverage.statutory ? "Employers' liability limit" : "Limit ($)"}
                      type="number"
                      value={policy.limit}
                      onChange={(v) => setPolicyField(coverage.key, "limit", v)}
                    />
                    <Input
                      label="Aggregate limit ($)"
                      type="number"
                      value={policy.aggregateLimit}
                      onChange={(v) => setPolicyField(coverage.key, "aggregateLimit", v)}
                    />
                    <Input
                      label="Deductible ($)"
                      type="number"
                      value={policy.deductible}
                      onChange={(v) => setPolicyField(coverage.key, "deductible", v)}
                    />

                    <Input
                      label="Effective date"
                      type="date"
                      value={policy.effectiveDate}
                      onChange={(v) => setPolicyField(coverage.key, "effectiveDate", v)}
                    />
                    <Input
                      label="Expiry date"
                      type="date"
                      value={policy.expiryDate}
                      onChange={(v) => setPolicyField(coverage.key, "expiryDate", v)}
                    />
                    <Input
                      label="Notice of cancellation (days)"
                      type="number"
                      value={policy.noticeOfCancellationDays}
                      onChange={(v) =>
                        setPolicyField(coverage.key, "noticeOfCancellationDays", v)
                      }
                    />

                    <div className="md:col-span-3">
                      <Input
                        label="Named insured (if different from the carrier above)"
                        value={policy.namedInsured}
                        onChange={(v) => setPolicyField(coverage.key, "namedInsured", v)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3">
                    {[
                      {
                        key: "additionalInsured",
                        label: `${broker.name} named as additional insured`,
                        highlight: coverage.needsAdditionalInsured,
                      },
                      {
                        key: "lossPayee",
                        label: `${broker.name} named as loss payee`,
                        highlight: coverage.needsLossPayee,
                      },
                      { key: "waiverOfSubrogation", label: "Waiver of subrogation" },
                      {
                        key: "mcs90Attached",
                        label: "MCS-90 endorsement attached",
                        // Only meaningful on the auto liability and pollution
                        // rows — it is an endorsement to the liability policy.
                        only: ["autoLiability", "pollutionLiability"],
                      },
                    ]
                      .filter((c) => !c.only || c.only.includes(coverage.key))
                      .map((c) => (
                        <label
                          key={c.key}
                          className="flex items-center gap-2 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-indigo-600"
                            checked={!!policy[c.key]}
                            onChange={(e) =>
                              setPolicyField(coverage.key, c.key, e.target.checked)
                            }
                          />
                          <span
                            className={
                              c.highlight ? "text-gray-900 font-medium" : "text-gray-600"
                            }
                          >
                            {c.label}
                            {c.highlight && <span className="text-red-500 ml-0.5">*</span>}
                          </span>
                        </label>
                      ))}
                  </div>

                  {warning && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-3">
                      <WarningAmberIcon style={{ fontSize: 14 }} />
                      <span>
                        {warning}. You can still file it — the broker will be shown
                        the shortfall.
                      </span>
                    </p>
                  )}

                </div>
              )}
            </div>
          );
        })}

        {/* ── The certificate ──────────────────────────────────────────────
            One document for the whole filing. An ACORD 25 already lists every
            coverage, so this replaces the old attach-per-policy control that
            had agencies uploading the same page four times. Not gated on the
            policy details being filed first — the certificate is the thing the
            agency has in hand. */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            Certificate of insurance
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Attach one certificate covering everything you have filed above —
            the ACORD 25 as issued. The carrier and the broker both read it from
            here, so make sure the holder reads {broker.name}.
          </p>

          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            ref={certInput}
            onChange={(e) => {
              uploadCertificate(e.target.files?.[0]);
              e.target.value = ""; // let the same file be picked again
            }}
          />

          {certificate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-green-200 bg-green-50/50 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <DescriptionOutlinedIcon fontSize="small" className="text-green-700" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {certificate.originalName}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Attached{" "}
                    {certificate.uploadedAt
                      ? formatDateTime(certificate.uploadedAt)
                      : "just now"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => certInput.current?.click()}
                disabled={uploading}
                className="btn-secondary whitespace-nowrap disabled:opacity-40"
              >
                <UploadFileIcon fontSize="small" />
                {uploading ? "Uploading…" : "Replace"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => certInput.current?.click()}
              disabled={uploading}
              className="btn-secondary disabled:opacity-40"
            >
              <UploadFileIcon fontSize="small" />
              {uploading ? "Uploading…" : "Attach certificate"}
            </button>
          )}
        </div>

        {/* Submit */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Who is filing this?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="Your name"
              value={submitter.name}
              onChange={(v) => setSubmitter((s) => ({ ...s, name: v }))}
            />
            <Input
              label="Your email"
              type="email"
              value={submitter.email}
              onChange={(v) => setSubmitter((s) => ({ ...s, email: v }))}
            />
            <Input
              label="Agency name"
              value={submitter.agencyName}
              onChange={(v) => setSubmitter((s) => ({ ...s, agencyName: v }))}
            />
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={submit} disabled={saving} className="btn-primary">
              {saving ? "Filing…" : result ? "Update filing" : "File certificates"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 text-center pb-4">
          This link is specific to one carrier and grants no other access. If you
          were not expecting it, you can safely ignore it.
        </p>
      </div>
    </div>
  );
};

// ── Small inputs, local to this page ─────────────────────────────────────────
const Input = ({ label, value, onChange, type = "text" }) => (
  <div>
    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
      {label}
    </label>
    <input
      type={type}
      className={uiStyles.input}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const Select = ({ label, value, options, onChange }) => (
  <div>
    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
      {label}
    </label>
    <select
      className={uiStyles.select}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

export default InsuranceSubmission;
