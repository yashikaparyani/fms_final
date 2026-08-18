import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadIcon from "@mui/icons-material/Download";
import SendIcon from "@mui/icons-material/Send";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import BulkEntryTable from "../../components/BulkEntryTable";
import FieldRenderer from "../../components/onboarding/FieldRenderer";
import SignaturePad from "../../components/onboarding/SignaturePad";
import { usePermissions } from "../../hooks/usePermissions";

// ─── Carrier onboarding ───────────────────────────────────────────────────────
// Everything after the short signup: the two agreements, the drivers and their
// licences, and the insurance the carrier's own agency files on their behalf.
//
// Four steps, all reachable at any time rather than locked behind each other.
// The insurance step ends in an email to somebody else and then waits — gating
// the later steps behind it would leave a carrier who is ready to add drivers
// staring at a page they cannot use while an agency takes three days to reply.
// `outstanding`, computed server-side, is what actually says whether they are
// finished.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "agreements", label: "Agreements", icon: DescriptionOutlinedIcon },
  { key: "drivers", label: "Drivers & licences", icon: BadgeOutlinedIcon },
  { key: "insurance", label: "Insurance", icon: ShieldOutlinedIcon },
  { key: "review", label: "Review", icon: FactCheckOutlinedIcon },
];

const EQUIPMENT_BLANK = {
  unitNumber: "",
  equipmentType: "Tractor",
  make: "",
  model: "",
  year: "",
  vin: "",
  plate: "",
  plateState: "",
};

const DRIVER_BLANK = {
  name: "",
  phone: "",
  email: "",
  licenseNumber: "",
  licenseState: "",
  licenseClass: "A",
  licenseExpiry: "",
};

const money = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `$${Number(value).toLocaleString("en-US")}`;

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

const Onboarding = () => {
  const { role } = usePermissions();
  const isOffice = ["staff", "admin"].includes(role);

  // A carrier's own file resolves from their account and needs no id. The
  // office has no carrier of their own, so every call they make has to name
  // one — it comes off the URL, which is what the review screen links with.
  const [searchParams] = useSearchParams();
  const fleetOwnerId = searchParams.get("fleetOwnerId") || "";
  // Sent on every request rather than only where it is strictly required: the
  // server ignores it for a carrier, so one spread keeps the two cases from
  // needing two versions of each call.
  const forCarrier = fleetOwnerId ? { fleetOwnerId } : {};

  const [catalog, setCatalog] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("agreements");
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({});
  const [equipment, setEquipment] = useState([{ ...EQUIPMENT_BLANK }]);
  const [errors, setErrors] = useState({});

  const [driverRows, setDriverRows] = useState([{ ...DRIVER_BLANK }]);
  const [driverErrors, setDriverErrors] = useState({});

  const [insuranceForm, setInsuranceForm] = useState({
    agencyName: "",
    agentName: "",
    agentEmail: "",
    agentPhone: "",
  });
  const [insuranceLink, setInsuranceLink] = useState("");

  const [signing, setSigning] = useState(null); // agreement key being signed
  const [signState, setSignState] = useState({});

  const licenceInput = useRef({});

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [catalogRes, dataRes] = await Promise.all([
        api.get("/onboarding/catalog"),
        api.get("/onboarding", {
          params: fleetOwnerId ? { fleetOwnerId } : {},
        }),
      ]);

      setCatalog(catalogRes.data);
      setData(dataRes.data);
      setProfile(dataRes.data.profile || {});
      setStep(dataRes.data.currentStep || "agreements");

      if (dataRes.data.equipment?.length) {
        setEquipment(dataRes.data.equipment.map((e) => ({ ...EQUIPMENT_BLANK, ...e })));
      }

      setInsuranceForm({
        agencyName: dataRes.data.insurance?.agencyName || "",
        agentName: dataRes.data.insurance?.agentName || "",
        agentEmail: dataRes.data.insurance?.agentEmail || "",
        agentPhone: dataRes.data.insurance?.agentPhone || "",
      });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load your onboarding");
    } finally {
      setLoading(false);
    }
  }, [fleetOwnerId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const saveProgress = async ({ silent = false, nextStep } = {}) => {
    try {
      setSaving(true);
      const { data: saved } = await api.put("/onboarding/profile", {
        ...forCarrier,
        profile,
        equipment: equipment.filter((e) => e.vin || e.make || e.unitNumber),
        currentStep: nextStep || step,
      });
      setData(saved.onboarding);
      if (!silent) notify.success("Saved.");
      return true;
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goToStep = async (key) => {
    // Saved on the way out rather than on a timer: a carrier who fills a page
    // and clicks the next tab expects what they typed to still be there when
    // they come back, and an autosave interval either fires too often or loses
    // the last few seconds.
    if (step === "agreements") await saveProgress({ silent: true, nextStep: key });
    setStep(key);
  };

  // ── Sign ───────────────────────────────────────────────────────────────────
  const beginSigning = (agreement) => {
    const existing = data.agreements.find((a) => a.key === agreement.key);

    setSignState({
      values: existing?.values || {},
      acknowledgements: [],
      signedName: profile.signerName || "",
      signedTitle: profile.signerTitle || "",
      signatureData: "",
    });
    setSigning(agreement.key);
  };

  const submitSignature = async (agreement) => {
    const missing = (agreement.fields || [])
      .filter((f) => f.required && !String(signState.values?.[f.key] || "").trim())
      .map((f) => f.label);

    if (missing.length) {
      notify.warning(`Still needed: ${missing.join(", ")}`);
      return;
    }

    if (signState.acknowledgements.length !== agreement.acknowledgements.length) {
      notify.warning("Confirm every acknowledgement before signing.");
      return;
    }

    if (!signState.signatureData) {
      notify.warning("Draw your signature before submitting.");
      return;
    }

    try {
      setSaving(true);
      const { data: saved } = await api.post(
        `/onboarding/agreements/${agreement.key}/sign`,
        {
          ...forCarrier,
          profile,
          values: signState.values,
          acknowledgements: signState.acknowledgements,
          signedName: signState.signedName,
          signedTitle: signState.signedTitle,
          signatureData: signState.signatureData,
        },
      );

      setData(saved.onboarding);
      setSigning(null);
      notify.success(saved.message);
    } catch (err) {
      const payload = err.response?.data;
      if (payload?.gaps?.length) {
        // Server-side gaps are company details, which live on the step behind
        // this dialog — send them back rather than showing an error they cannot
        // act on from here.
        notify.error(payload.message);
        setSigning(null);
        setStep("agreements");
      } else {
        notify.error(payload?.message || "Could not sign");
      }
    } finally {
      setSaving(false);
    }
  };

  const downloadAgreement = async (agreement) => {
    try {
      const res = await api.get(`/onboarding/agreements/${agreement.key}/download`, {
        params: forCarrier,
        responseType: "blob",
      });

      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${agreement.title}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Could not download that agreement");
    }
  };

  // ── Drivers ────────────────────────────────────────────────────────────────
  const addDrivers = async () => {
    const filled = driverRows.filter((row) => String(row.name || "").trim());

    if (!filled.length) {
      notify.warning("Enter a name for at least one driver.");
      return;
    }

    try {
      setSaving(true);
      setDriverErrors({});

      const { data: result } = await api.post("/drivers/bulk", {
        ...forCarrier,
        drivers: filled,
      });

      if (result.failedCount) {
        applyDriverFailures(result, filled);
        notify.warning(result.message);
      } else {
        setDriverRows([{ ...DRIVER_BLANK }]);
        notify.success(result.message);
      }

      await load();
    } catch (err) {
      // A submission where every row fails comes back 400, so axios throws past
      // the branch above — the per-row reasons are in the body either way.
      const data = err.response?.data;
      if (data?.failedCount) applyDriverFailures(data, filled);

      notify.error(data?.message || "Could not add drivers");
    } finally {
      setSaving(false);
    }
  };

  /** Keep only the rejected rows, each tagged with the server's reason. */
  const applyDriverFailures = (result, submitted) => {
    const errs = {};
    const failedRows = [];

    (result.failed || []).forEach((failure) => {
      errs[failedRows.length] = failure.message;
      failedRows.push(submitted[failure.index] || { ...DRIVER_BLANK });
    });

    if (!failedRows.length) return;

    setDriverRows(failedRows);
    setDriverErrors(errs);
  };

  const uploadLicence = async (driver, file) => {
    if (!file) return;

    const body = new FormData();
    body.append("license", file);
    if (fleetOwnerId) body.append("fleetOwnerId", fleetOwnerId);
    // Sent alongside so a carrier who has not typed the licence details yet can
    // do it in one action rather than two.
    if (driver.licenseNumber) body.append("licenseNumber", driver.licenseNumber);
    if (driver.licenseState) body.append("licenseState", driver.licenseState);
    if (driver.licenseClass) body.append("licenseClass", driver.licenseClass);
    if (driver.licenseExpiry) body.append("licenseExpiry", driver.licenseExpiry);

    try {
      setSaving(true);
      const { data: saved } = await api.post(
        `/onboarding/drivers/${driver._id}/license`,
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setData(saved.onboarding);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not upload the licence");
    } finally {
      setSaving(false);
    }
  };

  // ── Insurance ──────────────────────────────────────────────────────────────
  const inviteAgent = async () => {
    if (!insuranceForm.agentEmail.trim()) {
      notify.warning("Enter your insurance agent's email address.");
      return;
    }

    try {
      setSaving(true);
      const { data: result } = await api.post("/insurance/invite", {
        ...forCarrier,
        ...insuranceForm,
      });
      setData(result.onboarding);
      setInsuranceLink(result.link || "");
      notify.success(result.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not send the request");
    } finally {
      setSaving(false);
    }
  };

  const remindAgent = async () => {
    try {
      setSaving(true);
      const { data: result } = await api.post("/insurance/remind", { ...forCarrier });
      setData(result.onboarding);
      setInsuranceLink(result.link || "");
      notify.success(result.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not send the reminder");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const outstandingByStep = useMemo(() => {
    const grouped = {};
    (data?.outstanding || []).forEach((item) => {
      grouped[item.step] = grouped[item.step] || [];
      grouped[item.step].push(item.message);
    });
    return grouped;
  }, [data]);

  const equipmentColumns = useMemo(() => {
    const appendix = catalog?.agreements?.find((a) => a.key === "contractor")?.appendixA;
    if (!appendix) return [];

    return appendix.columns.map((col) => ({
      key: col.key,
      label: col.label,
      type: col.type === "select" ? "select" : col.type,
      required: col.required,
      width: col.key === "vin" ? "190px" : "120px",
      options: col.options?.map((o) => ({ value: o, label: o })),
    }));
  }, [catalog]);

  const driverColumns = useMemo(
    () => [
      { key: "name", label: "Driver name", required: true, width: "160px" },
      { key: "phone", label: "Phone", width: "130px" },
      { key: "email", label: "Email (for app login)", width: "190px" },
      { key: "licenseNumber", label: "Licence no.", width: "130px" },
      {
        key: "licenseState",
        label: "State",
        type: "select",
        width: "90px",
        options: [{ value: "", label: "—" }].concat(
          (catalog?.states || []).map((s) => ({ value: s, label: s })),
        ),
      },
      {
        key: "licenseClass",
        label: "Class",
        type: "select",
        width: "80px",
        options: ["A", "B", "C"].map((c) => ({ value: c, label: c })),
      },
      { key: "licenseExpiry", label: "Expires", type: "date", width: "140px" },
    ],
    [catalog],
  );

  if (loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  if (!data || !catalog) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-600">
          Your onboarding file could not be loaded. Refresh, or contact the office
          if this keeps happening.
        </p>
      </div>
    );
  }

  const statusBanner = {
    IN_PROGRESS: {
      tone: "bg-blue-50 border-blue-200 text-blue-900",
      text: "Your paperwork is in progress. Finish the steps below to be cleared to haul.",
    },
    AWAITING_INSURANCE: {
      tone: "bg-amber-50 border-amber-200 text-amber-900",
      text: `Waiting on ${data.insurance.agencyName || data.insurance.agentEmail} to file your certificates. Everything else is done.`,
    },
    UNDER_REVIEW: {
      tone: "bg-indigo-50 border-indigo-200 text-indigo-900",
      text: "Everything is in. The office is reviewing your file and will confirm shortly.",
    },
    APPROVED: {
      tone: "bg-green-50 border-green-200 text-green-900",
      text: "Approved — you are cleared to haul.",
    },
    REJECTED: {
      tone: "bg-red-50 border-red-200 text-red-900",
      text: data.reviewNote || "The office has sent your file back for changes.",
    },
  }[data.status];

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">Carrier onboarding</h1>
        <p className="page-subtitle">
          {data.carrier.carrierName}
          {data.carrier.fleetOwnerCode ? ` · ${data.carrier.fleetOwnerCode}` : ""}
        </p>
      </div>

      {/* The office working a carrier's file for them. Said plainly, because
          every action on this page then lands on somebody else's record. */}
      {isOffice && fleetOwnerId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
          <span>
            You are completing this file <strong>on behalf of the carrier</strong>.
            Everything you sign or upload here is recorded against them.
          </span>
          <Link
            to={`../onboarding-review/${fleetOwnerId}`}
            relative="path"
            className="btn-secondary whitespace-nowrap"
          >
            Back to review
          </Link>
        </div>
      )}

      {statusBanner && (
        <div className={`rounded-xl border p-3 text-sm ${statusBanner.tone}`}>
          {statusBanner.text}
        </div>
      )}

      {/* Why this screen is the first thing they see. Shown only while the gate
          is actually closed — see components/onboarding/CarrierOnboardingGate. */}
      {!data.agreementsComplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-semibold">
            Sign both agreements to open your dashboard.
          </span>{" "}
          They are the contract we dispatch loads under, so they come first. Your
          driver licences and insurance can be added afterwards — you will not be
          locked out while you gather them.
        </div>
      )}

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const problems = outstandingByStep[s.key]?.length || 0;
          const active = step === s.key;

          return (
            <button
              key={s.key}
              onClick={() => goToStep(s.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300"
              }`}
            >
              <Icon fontSize="small" />
              {s.label}
              {problems > 0 ? (
                <span
                  className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                    active ? "bg-white/25" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {problems}
                </span>
              ) : (
                s.key !== "review" && (
                  <CheckCircleIcon
                    style={{ fontSize: 16 }}
                    className={active ? "text-white" : "text-green-600"}
                  />
                )
              )}
            </button>
          );
        })}
      </div>

      {/* ══ Step 1 — agreements ═══════════════════════════════════════════ */}
      {step === "agreements" && (
        <>
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Company details
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Asked once and used to fill in both agreements — you will not have to
              type this twice.
            </p>

            {catalog.sharedProfile.map((section) => (
              <div key={section.section} className="mb-6 last:mb-0">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  {section.section}
                </h3>
                {section.help && (
                  <p className="text-[11px] text-gray-500 mb-2">{section.help}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {section.fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={profile[field.key]}
                      error={errors[field.key]}
                      onChange={setField}
                      disabled={data.status === "APPROVED" && !isOffice}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => saveProgress()}
                disabled={saving}
                className="btn-secondary"
              >
                {saving ? "Saving…" : "Save details"}
              </button>
            </div>
          </div>

          {/* Appendix A */}
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Your equipment
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Appendix A of the Independent Contractor agreement — every tractor,
              trailer and chassis you are putting into service. You must list at
              least one before that agreement can be signed.
            </p>

            {equipmentColumns.length > 0 && (
              <BulkEntryTable
                columns={equipmentColumns}
                rows={equipment}
                onChange={setEquipment}
                blankRow={EQUIPMENT_BLANK}
                addLabel="Add equipment"
              />
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => saveProgress()}
                disabled={saving}
                className="btn-secondary"
              >
                {saving ? "Saving…" : "Save equipment"}
              </button>
            </div>
          </div>

          {/* The two agreements */}
          {catalog.agreements.map((agreement) => {
            const signed = data.agreements.find(
              (a) => a.key === agreement.key && a.signedAt,
            );

            return (
              <div key={agreement.key} className={uiStyles.card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[16rem]">
                    <h2 className="text-base font-semibold text-gray-900">
                      {agreement.title}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      With {agreement.counterparty} · {agreement.pages} pages
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{agreement.summary}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {signed ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                          <CheckCircleIcon style={{ fontSize: 14 }} />
                          Signed {fmtDate(signed.signedAt)}
                        </span>
                        <button
                          onClick={() => downloadAgreement(agreement)}
                          className="btn-secondary whitespace-nowrap"
                        >
                          <DownloadIcon fontSize="small" /> Download
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => beginSigning(agreement)}
                        className="btn-primary whitespace-nowrap"
                      >
                        Read &amp; sign
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Signing panel ────────────────────────────────────── */}
                {signing === agreement.key && (
                  <div className="mt-5 pt-5 border-t border-gray-200">
                    {(agreement.fields || []).length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                        {agreement.fields.map((field) => (
                          <FieldRenderer
                            key={field.key}
                            field={field}
                            value={signState.values?.[field.key]}
                            onChange={(key, value) =>
                              setSignState((s) => ({
                                ...s,
                                values: { ...s.values, [key]: value },
                              }))
                            }
                          />
                        ))}
                      </div>
                    )}

                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Confirm each of these
                    </h3>
                    <div className="space-y-2 mb-5">
                      {agreement.acknowledgements.map((ack) => {
                        const checked = signState.acknowledgements.includes(ack);
                        return (
                          <label
                            key={ack}
                            className="flex items-start gap-2 cursor-pointer text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 accent-indigo-600"
                              checked={checked}
                              onChange={() =>
                                setSignState((s) => ({
                                  ...s,
                                  acknowledgements: checked
                                    ? s.acknowledgements.filter((a) => a !== ack)
                                    : [...s.acknowledgements, ack],
                                }))
                              }
                            />
                            <span>{ack}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">
                          Signer's full name <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={uiStyles.input}
                          value={signState.signedName}
                          onChange={(e) =>
                            setSignState((s) => ({ ...s, signedName: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">
                          Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={uiStyles.input}
                          value={signState.signedTitle}
                          onChange={(e) =>
                            setSignState((s) => ({ ...s, signedTitle: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <SignaturePad
                      onChange={(signatureData) =>
                        setSignState((s) => ({ ...s, signatureData }))
                      }
                    />

                    <div className="flex justify-end gap-2 mt-5">
                      <button
                        onClick={() => setSigning(null)}
                        className="btn-secondary"
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => submitSignature(agreement)}
                        className="btn-primary"
                        disabled={saving}
                      >
                        {saving ? "Signing…" : "Sign agreement"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ══ Step 2 — drivers ══════════════════════════════════════════════ */}
      {step === "drivers" && (
        <>
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Add your drivers
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Both agreements warrant that every driver is competent and properly
              licensed, so we hold a copy of each licence on file. Give a driver an
              email and they also get their own login to the driver app.
            </p>

            <BulkEntryTable
              columns={driverColumns}
              rows={driverRows}
              onChange={setDriverRows}
              blankRow={DRIVER_BLANK}
              errors={driverErrors}
              addLabel="Add another driver"
            />

            <div className="flex justify-end mt-4">
              <button onClick={addDrivers} disabled={saving} className="btn-primary">
                {saving ? "Adding…" : "Add drivers"}
              </button>
            </div>
          </div>

          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Licences on file
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a photo or scan of each driver's licence.
            </p>

            {data.drivers.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No drivers yet — add them above.
              </p>
            ) : (
              <div className="space-y-2">
                {data.drivers.map((driver) => {
                  const onFile = !!driver.licenseDocument?.fileName;
                  const expired =
                    driver.licenseExpiry &&
                    new Date(driver.licenseExpiry) < new Date();

                  return (
                    <div
                      key={driver._id}
                      className="flex flex-wrap items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-[12rem]">
                        <p className="text-sm font-medium text-gray-900">
                          {driver.name}
                          <span className="ml-2 text-[11px] font-mono text-gray-400">
                            {driver.driverCode}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {[
                            driver.licenseNumber,
                            driver.licenseState,
                            driver.licenseClass ? `Class ${driver.licenseClass}` : null,
                            driver.licenseExpiry
                              ? `expires ${fmtDate(driver.licenseExpiry)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No licence details yet"}
                        </p>
                      </div>

                      {expired && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                          <WarningAmberIcon style={{ fontSize: 13 }} /> Expired
                        </span>
                      )}

                      {onFile ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <CheckCircleIcon style={{ fontSize: 13 }} /> Licence on file
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          No copy yet
                        </span>
                      )}

                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        ref={(el) => {
                          licenceInput.current[driver._id] = el;
                        }}
                        onChange={(e) => {
                          uploadLicence(driver, e.target.files?.[0]);
                          e.target.value = ""; // let the same file be picked again
                        }}
                      />
                      <button
                        onClick={() => licenceInput.current[driver._id]?.click()}
                        disabled={saving}
                        className="btn-secondary whitespace-nowrap"
                      >
                        <UploadFileIcon fontSize="small" />
                        {onFile ? "Replace" : "Upload licence"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Step 3 — insurance ════════════════════════════════════════════ */}
      {step === "insurance" && (
        <>
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Your insurance agent
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              You do not fill this in — your agency does. Give us their email and
              they get a link that opens the certificate form directly. No account,
              no password. What they file appears here as soon as they submit it.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "agencyName", label: "Agency name", placeholder: "Coastal Insurance Services" },
                { key: "agentName", label: "Agent name", placeholder: "Dana Reyes" },
                { key: "agentEmail", label: "Agent email", required: true, type: "email" },
                { key: "agentPhone", label: "Agent phone", type: "tel" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type={f.type || "text"}
                    className={uiStyles.input}
                    placeholder={f.placeholder}
                    value={insuranceForm[f.key]}
                    onChange={(e) =>
                      setInsuranceForm((s) => ({ ...s, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
              {data.insurance.invitedAt && !data.insurance.submittedAt && (
                <button onClick={remindAgent} disabled={saving} className="btn-secondary">
                  Send a reminder
                </button>
              )}
              <button onClick={inviteAgent} disabled={saving} className="btn-primary">
                <SendIcon fontSize="small" />
                {data.insurance.invitedAt ? "Send again" : "Send the request"}
              </button>
            </div>

            {data.insurance.invitedAt && (
              <p className="text-xs text-gray-500 mt-3">
                Requested {fmtDate(data.insurance.invitedAt)}
                {data.insurance.reminderSentAt
                  ? ` · reminded ${fmtDate(data.insurance.reminderSentAt)}`
                  : ""}
                {data.insurance.submittedAt
                  ? ` · filed ${fmtDate(data.insurance.submittedAt)}`
                  : " · not filed yet"}
              </p>
            )}

            {insuranceLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <code className="text-[11px] text-gray-700 break-all flex-1">
                  {insuranceLink}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(insuranceLink);
                    notify.success("Link copied");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                >
                  <ContentCopyIcon style={{ fontSize: 13 }} /> Copy link
                </button>
              </div>
            )}
          </div>

          {/* What is required */}
          <div className={uiStyles.card}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              What your agency has to file
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Drawn from the agreements you signed and the FMCSA rules. Your agency
              sees this same list on their form.
            </p>

            <div className="space-y-2">
              {catalog.insurance.coverages.map((coverage) => {
                const filed = data.insurance.policies.find(
                  (p) => p.coverage === coverage.key,
                );

                return (
                  <div
                    key={coverage.key}
                    className={`border rounded-lg px-3 py-2.5 ${
                      filed
                        ? "border-green-200 bg-green-50/40"
                        : coverage.required
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-gray-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex-1 min-w-[14rem]">
                        <p className="text-sm font-medium text-gray-900">
                          {coverage.label}
                          {coverage.required ? (
                            <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                              REQUIRED
                            </span>
                          ) : (
                            <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              OPTIONAL
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                          {coverage.description}
                        </p>
                      </div>

                      <div className="text-right">
                        {filed ? (
                          <>
                            <p className="text-xs font-semibold text-green-700">
                              {filed.insurerName || "Filed"}
                            </p>
                            <p className="text-[11px] text-gray-600">
                              {money(filed.limit)}
                              {filed.expiryDate
                                ? ` · to ${fmtDate(filed.expiryDate)}`
                                : ""}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-500">
                            {coverage.statutory
                              ? "Statutory limits"
                              : coverage.minLimit
                                ? `Min ${money(coverage.minLimit)}`
                                : "No minimum set"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!data.insurance.submittedAt && data.insurance.invitedAt && (
              <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
                <HourglassEmptyIcon fontSize="small" />
                Waiting on {data.insurance.agencyName || data.insurance.agentEmail}.
              </p>
            )}

            {data.insurance.shortfalls?.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-900 mb-1">
                  These fall short of what the agreements require
                </p>
                <ul className="text-xs text-red-800 list-disc pl-5 space-y-0.5">
                  {data.insurance.shortfalls.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-800 mt-2">
                  Ask your agency to correct these — your file cannot be approved
                  until they are resolved.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Step 4 — review ═══════════════════════════════════════════════ */}
      {step === "review" && (
        <div className={uiStyles.card}>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Where you are
          </h2>

          {data.outstanding.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircleIcon style={{ fontSize: 44 }} className="text-green-500" />
              <p className="text-sm font-medium text-gray-900 mt-2">
                Everything is in.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.status === "APPROVED"
                  ? "Your file has been approved — you are cleared to haul."
                  : "The office is reviewing your file and will confirm shortly."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {data.outstanding.length} item
                {data.outstanding.length === 1 ? "" : "s"} still to finish.
              </p>
              <ul className="space-y-2">
                {data.outstanding.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-700 border border-amber-200 bg-amber-50/50 rounded-lg px-3 py-2"
                  >
                    <WarningAmberIcon
                      style={{ fontSize: 17 }}
                      className="text-amber-600 shrink-0 mt-0.5"
                    />
                    <span className="flex-1">{item.message}</span>
                    <button
                      onClick={() => goToStep(item.step)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                    >
                      Go there →
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Signed copies, always reachable from one place */}
          <div className="mt-6 pt-5 border-t border-gray-200">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Your signed agreements
            </h3>
            <div className="space-y-2">
              {catalog.agreements.map((agreement) => {
                const signed = data.agreements.find(
                  (a) => a.key === agreement.key && a.signedAt,
                );
                return (
                  <div
                    key={agreement.key}
                    className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {agreement.title}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {signed
                          ? `Signed by ${signed.signedName} on ${fmtDate(signed.signedAt)}`
                          : "Not signed yet"}
                      </p>
                    </div>
                    {signed && (
                      <button
                        onClick={() => downloadAgreement(agreement)}
                        className="btn-secondary whitespace-nowrap"
                      >
                        <DownloadIcon fontSize="small" /> Download
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
