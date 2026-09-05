import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CertificatePreview from "../../components/insurance/CertificatePreview";
import DocumentPreview from "../../components/common/DocumentPreview";
import CarrierDriverLocations from "../../components/carrier/CarrierDriverLocations";
import api from "../../api";
import Swal, { notify } from "../../utils/swal";
import OnboardingStatusBadge from "../../components/onboarding/OnboardingStatusBadge";
import { uiStyles } from "../../style/uiStyles";
import { usePermissions } from "../../hooks/usePermissions";
import { onboardingStatusMeta } from "../../utils/onboardingStatus";
import { formatDateNumeric } from "../../utils/dates";

// ─── One carrier's file, as the office reviews it ─────────────────────────────
// Everything the carrier and their insurance agency handed over, on one page,
// with the decision at the bottom. This is the screen behind "the office is
// reviewing your file".
//
// Read-only by design. Corrections are made on the carrier's own form (there is
// a link to it in the header, which opens it against this carrier) so that
// there is exactly one place a value can be edited, and this page stays a
// record of what is on file rather than a second way to change it.
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `$${Number(value).toLocaleString("en-US")}`;

const fmtDate = (value) =>
  value ? formatDateNumeric(value) : "—";

const isPast = (value) => !!value && new Date(value) < new Date();

// ── Small presentational pieces ──────────────────────────────────────────────

const Section = ({ icon: Icon, title, subtitle, right, children }) => (
  <div className={uiStyles.card}>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5">
        {Icon && <Icon className="text-indigo-600 mt-0.5" fontSize="small" />}
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
    {children}
  </div>
);

const Detail = ({ label, value, missing }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
      {label}
    </p>
    <p
      className={`text-sm mt-0.5 break-words ${
        missing ? "text-amber-700 italic" : "text-gray-900"
      }`}
    >
      {missing ? "Not given" : value}
    </p>
  </div>
);

const Flag = ({ ok, children }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
      ok
        ? "bg-green-50 border-green-200 text-green-700"
        : "bg-gray-50 border-gray-200 text-gray-500"
    }`}
  >
    {ok ? "✓" : "✗"} {children}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────

const CarrierOnboardingReview = () => {
  const { fleetOwnerId } = useParams();
  const navigate = useNavigate();
  const { role, can } = usePermissions();
  const base = role === "admin" ? "/admin" : "/staff";
  // The same permission the server enforces on PUT /onboarding/review. Admins
  // pass by role — see utils/permissions.js.
  const mayDecide = can("fleetOwners.edit");

  const [catalog, setCatalog] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  // Which document is open, as one value rather than a set: these are full
  // PDFs and scans, and rendering every agreement and every licence at once
  // would fetch the lot on page load for no benefit.
  const [openDoc, setOpenDoc] = useState(null);

  const toggleDoc = (key) => setOpenDoc((current) => (current === key ? null : key));

  const load = useCallback(async () => {
    try {
      const [catalogRes, fileRes] = await Promise.all([
        api.get("/onboarding/catalog"),
        api.get("/onboarding", { params: { fleetOwnerId } }),
      ]);
      setCatalog(catalogRes.data);
      setFile(fileRes.data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load that file");
    } finally {
      setLoading(false);
    }
  }, [fleetOwnerId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── The decision ───────────────────────────────────────────────────────────
  const decide = async ({ decision, note, overrideOutstanding = false }) => {
    try {
      setDeciding(true);
      const { data } = await api.put("/onboarding/review", {
        fleetOwnerId,
        decision,
        note,
        overrideOutstanding,
      });
      setFile(data.onboarding);
      notify.success(data.message);
      return true;
    } catch (err) {
      const payload = err.response?.data;

      // The server refuses to approve an incomplete file unless told to
      // override. It genuinely happens — an agency that will not issue
      // certificates until the first load is booked — so offer the override
      // here rather than making somebody find the flag.
      if (payload?.outstanding?.length) {
        const confirmed = await Swal.fire({
          icon: "warning",
          title: "This file is not complete",
          html: `
            <p style="font-size:13px;text-align:left;margin-bottom:8px">
              Still outstanding:
            </p>
            <ul style="font-size:12px;text-align:left;padding-left:18px">
              ${payload.outstanding.map((o) => `<li>${o.message}</li>`).join("")}
            </ul>
            <p style="font-size:12px;text-align:left;margin-top:10px">
              Approving anyway clears the carrier to haul with these gaps on file.
            </p>`,
          showCancelButton: true,
          confirmButtonText: "Approve anyway",
          confirmButtonColor: "#16a34a",
          cancelButtonText: "Cancel",
        });

        if (confirmed.isConfirmed) {
          return decide({ decision, note, overrideOutstanding: true });
        }
        return false;
      }

      notify.error(payload?.message || "Could not record that decision");
      return false;
    } finally {
      setDeciding(false);
    }
  };

  const approve = async () => {
    const { isConfirmed, value } = await Swal.fire({
      icon: "question",
      title: `Approve ${file.carrier.carrierName}?`,
      text: "They will be cleared to haul, and their file locks from further edits on their side.",
      input: "textarea",
      inputLabel: "Note (optional) — kept on the file",
      inputPlaceholder: "Anything worth recording about this approval…",
      showCancelButton: true,
      confirmButtonText: "Approve",
      confirmButtonColor: "#16a34a",
    });

    if (isConfirmed) await decide({ decision: "APPROVED", note: value || "" });
  };

  const sendBack = async () => {
    const { isConfirmed, value } = await Swal.fire({
      icon: "warning",
      title: `Send ${file.carrier.carrierName}'s file back?`,
      input: "textarea",
      inputLabel: "What needs fixing — the carrier sees this",
      inputPlaceholder: "e.g. The cargo certificate names the wrong insured.",
      inputValidator: (v) =>
        String(v || "").trim() ? undefined : "Say what needs fixing.",
      showCancelButton: true,
      confirmButtonText: "Send back",
      confirmButtonColor: "#dc2626",
    });

    if (isConfirmed) await decide({ decision: "REJECTED", note: value });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const coverageByKey = useMemo(() => {
    const map = new Map();
    (catalog?.insurance?.coverages || []).forEach((c) => map.set(c.key, c));
    return map;
  }, [catalog]);

  const profileSections = catalog?.sharedProfile || [];

  if (loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  if (!file || !catalog) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-600">
          That carrier's file could not be loaded.{" "}
          <Link to={`${base}/onboarding-review`} className="text-indigo-600 hover:underline">
            Back to the queue
          </Link>
          .
        </p>
      </div>
    );
  }

  const meta = onboardingStatusMeta(file.status);
  const decided = ["APPROVED", "REJECTED"].includes(file.status);

  return (
    <div className={uiStyles.page}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate(`${base}/onboarding-review`)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 mb-1"
          >
            <ArrowBackIcon style={{ fontSize: 15 }} /> Review queue
          </button>
          <h1 className="page-title">{file.carrier.carrierName}</h1>
          <p className="page-subtitle">
            {file.carrier.fleetOwnerCode || "—"}
            {file.profile.mcNumber ? ` · MC ${file.profile.mcNumber}` : ""}
            {file.profile.dotNumber ? ` · DOT ${file.profile.dotNumber}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OnboardingStatusBadge status={file.status} className="px-3 py-1" />
          {/* Corrections happen on the carrier's own form, against this
              carrier — half of these files get finished over the phone. */}
          <Link
            to={`${base}/carrier-onboarding?fleetOwnerId=${fleetOwnerId}`}
            className="btn-secondary whitespace-nowrap"
          >
            <EditOutlinedIcon fontSize="small" /> Open their form
          </Link>
        </div>
      </div>

      <div className={`rounded-xl border p-3 text-sm ${meta.tone}`}>
        <span className="font-semibold">{meta.label}.</span> {meta.blurb}
        {decided && file.reviewedAt && (
          <>
            {" "}
            Decided {fmtDate(file.reviewedAt)}
            {file.reviewedByName ? ` by ${file.reviewedByName}` : ""}.
            {file.reviewNote ? ` “${file.reviewNote}”` : ""}
          </>
        )}
      </div>

      {/* ── What is still missing ────────────────────────────────────────── */}
      <Section
        icon={file.outstanding.length ? WarningAmberIcon : CheckCircleIcon}
        title="Checklist"
        subtitle="The same list the carrier sees on their own Review step."
      >
        {file.outstanding.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircleIcon fontSize="small" /> Nothing outstanding — every
            document below is on file.
          </p>
        ) : (
          <ul className="space-y-2">
            {file.outstanding.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700 border border-amber-200 bg-amber-50/50 rounded-lg px-3 py-2"
              >
                <WarningAmberIcon
                  style={{ fontSize: 17 }}
                  className="text-amber-600 shrink-0 mt-0.5"
                />
                <span className="flex-1">{item.message}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 whitespace-nowrap mt-0.5">
                  {item.step}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Company details ──────────────────────────────────────────────── */}
      <Section
        title="Company details"
        subtitle="What was typed into the agreements. Check the legal name and MC/DOT against the FMCSA record before approving."
      >
        {profileSections.map((section) => (
          <div key={section.section} className="mb-5 last:mb-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              {section.section}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {section.fields.map((field) => {
                const value = file.profile[field.key];
                const empty = value === undefined || value === null || value === "";
                return (
                  <Detail
                    key={field.key}
                    label={field.label}
                    // An empty optional field is a dash; an empty required one
                    // is called out, because that is the difference between
                    // "they had nothing to put here" and "this blocks signing".
                    value={empty ? "—" : String(value)}
                    missing={empty && field.required}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Agreements ───────────────────────────────────────────────────── */}
      <Section
        icon={DescriptionOutlinedIcon}
        title="Signed agreements"
        subtitle="Open each one and check the signature, the initials on the arbitration clauses, and Appendix A."
      >
        <div className="space-y-2">
          {catalog.agreements.map((agreement) => {
            const signed = file.agreements.find(
              (a) => a.key === agreement.key && a.signedAt,
            );

            const open = openDoc === `agreement:${agreement.key}`;

            return (
              <div
                key={agreement.key}
                className={`border rounded-lg px-3 py-2.5 ${
                  signed ? "border-gray-200" : "border-amber-200 bg-amber-50/40"
                }`}
              >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[15rem]">
                  <p className="text-sm font-medium text-gray-900">
                    {agreement.title}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    With {agreement.counterparty}
                  </p>
                  {signed ? (
                    <p className="text-xs text-gray-600 mt-1">
                      Signed by{" "}
                      <span className="font-medium">{signed.signedName}</span>
                      {signed.signedTitle ? `, ${signed.signedTitle}` : ""} on{" "}
                      {fmtDate(signed.signedAt)}
                      {Object.entries(signed.values || {}).length > 0 && (
                        <>
                          {" · "}
                          {Object.entries(signed.values)
                            .map(([key, value]) => {
                              const field = (agreement.fields || []).find(
                                (f) => f.key === key,
                              );
                              return `${field?.label || key}: ${value}`;
                            })
                            .join(" · ")}
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-amber-700 mt-1">
                      Not signed yet.
                    </p>
                  )}
                </div>

                {signed?.hasDocument && (
                  <button
                    onClick={() => toggleDoc(`agreement:${agreement.key}`)}
                    className="btn-secondary whitespace-nowrap"
                  >
                    <DescriptionOutlinedIcon fontSize="small" />
                    {open ? "Hide" : "Read"}
                  </button>
                )}
              </div>

              {/* Read on the page — checking a signature and the initials on
                  the arbitration clauses means looking at the document. One at
                  a time: these are full PDFs and rendering four at once buys
                  nobody anything. */}
              {open && signed?.hasDocument && (
                <div className="mt-3">
                  <DocumentPreview
                    url={`/onboarding/agreements/${agreement.key}/download`}
                    params={{ fleetOwnerId }}
                    name={agreement.title}
                    mimeType="application/pdf"
                    downloadName={`${file.carrier.fleetOwnerCode || "carrier"} - ${agreement.title}.pdf`}
                    height="34rem"
                  />
                </div>
              )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Equipment (Appendix A) ───────────────────────────────────────── */}
      <Section
        icon={LocalShippingOutlinedIcon}
        title="Equipment on Appendix A"
        subtitle="What the carrier is putting into service under the contractor agreement."
      >
        {file.equipment.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No equipment listed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  {["Unit", "Type", "Make", "Model", "Year", "VIN", "Plate"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {file.equipment.map((unit, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-3">{unit.unitNumber || "—"}</td>
                    <td className="py-2 pr-3">{unit.equipmentType || "—"}</td>
                    <td className="py-2 pr-3">{unit.make || "—"}</td>
                    <td className="py-2 pr-3">{unit.model || "—"}</td>
                    <td className="py-2 pr-3">{unit.year || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{unit.vin || "—"}</td>
                    <td className="py-2 pr-3">
                      {[unit.plate, unit.plateState].filter(Boolean).join(" ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Drivers and licences ─────────────────────────────────────────── */}
      <Section
        icon={BadgeOutlinedIcon}
        title="Drivers and licences"
        subtitle="Both agreements warrant every driver is competent and properly licensed (¶23). Open each licence and check it against the details typed here."
      >
        {file.drivers.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No drivers on the roster yet.
          </p>
        ) : (
          <div className="space-y-2">
            {file.drivers.map((driver) => {
              const onFile = !!driver.licenseDocument?.fileName;
              const expired = isPast(driver.licenseExpiry);
              const medicalExpired = isPast(driver.medicalCardExpiry);

              const open = openDoc === `licence:${driver._id}`;

              return (
                <div
                  key={driver._id}
                  className={`border rounded-lg px-3 py-2.5 ${
                    onFile && !expired
                      ? "border-gray-200"
                      : "border-amber-200 bg-amber-50/40"
                  }`}
                >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[14rem]">
                    <p className="text-sm font-medium text-gray-900">
                      {driver.name}
                      <span className="ml-2 text-[11px] font-mono text-gray-400">
                        {driver.driverCode}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        driver.licenseNumber,
                        driver.licenseState,
                        driver.licenseClass ? `Class ${driver.licenseClass}` : null,
                        driver.licenseExpiry
                          ? `expires ${fmtDate(driver.licenseExpiry)}`
                          : null,
                        driver.endorsements?.length
                          ? `endorsements ${driver.endorsements.join(", ")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No licence details on file"}
                    </p>
                    {driver.medicalCardExpiry && (
                      <p
                        className={`text-[11px] mt-0.5 ${
                          medicalExpired ? "text-red-700 font-semibold" : "text-gray-500"
                        }`}
                      >
                        Medical card {medicalExpired ? "expired" : "valid to"}{" "}
                        {fmtDate(driver.medicalCardExpiry)}
                      </p>
                    )}
                  </div>

                  {expired && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      <WarningAmberIcon style={{ fontSize: 13 }} /> Licence expired
                    </span>
                  )}

                  {onFile ? (
                    <button
                      onClick={() => toggleDoc(`licence:${driver._id}`)}
                      className="btn-secondary whitespace-nowrap"
                    >
                      <BadgeOutlinedIcon fontSize="small" />
                      {open ? "Hide licence" : "View licence"}
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      No copy on file
                    </span>
                  )}
                </div>

                {/* The scan itself. Checking a licence against the details
                    typed beside it is the whole point of this row, and
                    downloading it just leaves copies of somebody's licence on
                    an office laptop. */}
                {open && onFile && (
                  <div className="mt-3">
                    <DocumentPreview
                      url={`/onboarding/drivers/${driver._id}/license`}
                      params={{ fleetOwnerId }}
                      name={driver.licenseDocument.originalName || `${driver.name} - licence`}
                      mimeType={driver.licenseDocument.mimeType}
                      size={driver.licenseDocument.size}
                      uploadedAt={driver.licenseDocument.uploadedAt}
                      downloadName={`${driver.name} - licence`}
                      height="30rem"
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Where their drivers are ──────────────────────────────────────── */}
      <Section
        icon={PlaceOutlinedIcon}
        title="Driver locations"
        subtitle="The last position each of this carrier's drivers reported, from the phone app. The same view the carrier has of their own fleet."
      >
        <CarrierDriverLocations fleetOwnerId={fleetOwnerId} />
      </Section>

      {/* ── Insurance ────────────────────────────────────────────────────── */}
      <Section
        icon={ShieldOutlinedIcon}
        title="Insurance certificates"
        subtitle="Filed by the carrier's agency from a one-off link. Check the certificate holder reads S LINE BROKERAGE, INC. and that the limits match what is stated."
        right={
          <div className="text-right text-xs text-gray-500">
            <p className="font-medium text-gray-800">
              {file.insurance.agencyName || "Agency not named"}
            </p>
            <p>{file.insurance.agentName || file.insurance.agentEmail || "—"}</p>
            <p>{file.insurance.agentPhone}</p>
          </div>
        }
      >
        <p className="text-xs text-gray-500 mb-4">
          {file.insurance.invitedAt
            ? `Requested ${fmtDate(file.insurance.invitedAt)}`
            : "No agency has been asked yet"}
          {file.insurance.reminderSentAt
            ? ` · reminded ${fmtDate(file.insurance.reminderSentAt)}`
            : ""}
          {file.insurance.submittedAt
            ? ` · filed ${fmtDate(file.insurance.submittedAt)}${
                file.insurance.submittedByName
                  ? ` by ${file.insurance.submittedByName}`
                  : ""
              }`
            : " · nothing filed yet"}
        </p>

        {file.insurance.shortfalls?.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-red-900 mb-1">
              Flagged against the contractual minimums when it was filed
            </p>
            <ul className="text-xs text-red-800 list-disc pl-5 space-y-0.5">
              {file.insurance.shortfalls.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* The certificate itself, read on the page. One document for the whole
            filing — checking the holder and the limits means looking at it, so
            it sits above the keyed-in rows it is being checked against. */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
            Certificate of insurance
          </p>
          <CertificatePreview
            certificate={file.insurance.certificate}
            fleetOwnerId={fleetOwnerId}
            emptyMessage="The agency has not attached a certificate yet."
          />
        </div>

        <div className="space-y-2">
          {(catalog.insurance.coverages || []).map((coverage) => {
            const policy = file.insurance.policies.find(
              (p) => p.coverage === coverage.key,
            );
            const spec = coverageByKey.get(coverage.key);
            const expired = isPast(policy?.expiryDate);

            return (
              <div
                key={coverage.key}
                className={`border rounded-lg px-3 py-2.5 ${
                  policy && !expired
                    ? "border-green-200 bg-green-50/40"
                    : coverage.required
                      ? "border-amber-200 bg-amber-50/40"
                      : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[16rem]">
                    <p className="text-sm font-medium text-gray-900">
                      {coverage.label}
                      <span
                        className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          coverage.required
                            ? "text-red-700 bg-red-100"
                            : "text-gray-500 bg-gray-100"
                        }`}
                      >
                        {coverage.required ? "REQUIRED" : "OPTIONAL"}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{spec?.basis}</p>

                    {policy ? (
                      <>
                        <p className="text-xs text-gray-700 mt-1.5">
                          {policy.insurerName || "Insurer not named"}
                          {policy.amBestRating ? ` · AM Best ${policy.amBestRating}` : ""}
                          {policy.policyNumber ? ` · #${policy.policyNumber}` : ""}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Named insured: {policy.namedInsured || "—"}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Flag ok={policy.additionalInsured}>Additional insured</Flag>
                          <Flag ok={policy.waiverOfSubrogation}>Waiver of subrogation</Flag>
                          {coverage.key === "autoLiability" && (
                            <Flag ok={policy.mcs90Attached}>MCS-90</Flag>
                          )}
                          {spec?.needsLossPayee && (
                            <Flag ok={policy.lossPayee}>Loss payee</Flag>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs font-medium text-amber-700 mt-1.5">
                        Nothing filed for this coverage.
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {money(policy?.limit)}
                      {policy?.aggregateLimit
                        ? ` / ${money(policy.aggregateLimit)} agg.`
                        : ""}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Minimum{" "}
                      {coverage.statutory ? "statutory" : money(coverage.minLimit)}
                      {coverage.minAmBest ? ` · AM Best ${coverage.minAmBest}+` : ""}
                    </p>
                    {policy && (
                      <p
                        className={`text-[11px] mt-0.5 ${
                          expired ? "text-red-700 font-semibold" : "text-gray-600"
                        }`}
                      >
                        {fmtDate(policy.effectiveDate)} → {fmtDate(policy.expiryDate)}
                        {expired ? " (expired)" : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── The decision ─────────────────────────────────────────────────── */}
      <Section
        icon={CheckCircleIcon}
        title="Decision"
        subtitle={
          decided
            ? "This file has been decided. Deciding again replaces the previous outcome."
            : "The carrier is told the office is reviewing their file. This is where that ends."
        }
      >
        {file.reviewNote && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Note on file
            </p>
            <p className="text-sm text-gray-700">{file.reviewNote}</p>
            <p className="text-[11px] text-gray-500 mt-1">
              {fmtDate(file.reviewedAt)}
              {file.reviewedByName ? ` · ${file.reviewedByName}` : ""}
            </p>
          </div>
        )}

        {!mayDecide ? (
          <p className="text-sm text-gray-600">
            You can read this file but not decide on it. That needs the{" "}
            <span className="font-mono text-gray-800">fleetOwners.edit</span>{" "}
            permission.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={approve}
              disabled={deciding || file.status === "APPROVED"}
              className="btn-primary bg-green-600 border-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircleIcon fontSize="small" />
              {file.status === "APPROVED" ? "Already approved" : "Approve — cleared to haul"}
            </button>
            <button
              onClick={sendBack}
              disabled={deciding}
              className="btn-secondary text-red-700 border-red-200 hover:border-red-300 disabled:opacity-50"
            >
              <WarningAmberIcon fontSize="small" /> Send back for changes
            </button>
            {file.outstanding.length > 0 && (
              <span className="text-xs text-amber-700">
                {file.outstanding.length} item
                {file.outstanding.length === 1 ? "" : "s"} outstanding — you will
                be asked to confirm before approving.
              </span>
            )}
          </div>
        )}
      </Section>
    </div>
  );
};

export default CarrierOnboardingReview;
