import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import api from "../../api";
import { notify } from "../../utils/swal";
import LoadTable from "../../components/LoadTable";
import OnboardingStatusBadge from "../../components/onboarding/OnboardingStatusBadge";
import { uiStyles } from "../../style/uiStyles";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { usePermissions } from "../../hooks/usePermissions";
import {
  ONBOARDING_STATUSES,
  onboardingRowColors,
  onboardingStatusMeta,
} from "../../utils/onboardingStatus";

// ─── Onboarding review queue ──────────────────────────────────────────────────
// The office side of carrier onboarding. A carrier finishes their paperwork and
// is told the office is reviewing it — this is where that review actually
// happens, and the file the carrier is waiting on is the first tab.
//
// Ordered by what needs a decision rather than by carrier name: "Needs review"
// is a work queue, everything else is a lookup. A file only reaches that tab
// once the agreements are signed, a driver is on the roster and the agency has
// filed, so anything sitting there can be decided on now.
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "UNDER_REVIEW", label: "Needs review" },
  { key: "AWAITING_INSURANCE", label: "Waiting on insurance" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "REJECTED", label: "Sent back" },
  { key: "APPROVED", label: "Approved" },
  { key: "ALL", label: "All carriers" },
];

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

/** Whole days since `value`, for "waiting 4 days" rather than a bare date. */
const daysSince = (value) => {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / (24 * 60 * 60 * 1000));
};

const CarrierOnboardingQueue = () => {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const base = role === "admin" ? "/admin" : "/staff";

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("UNDER_REVIEW");
  const [search, setSearch] = useState("");

  const fetchQueue = useCallback(async ({ silent = false } = {}) => {
    try {
      const { data } = await api.get("/onboarding/queue");
      setFiles(data);
    } catch (err) {
      if (!silent) {
        notify.error(err.response?.data?.message || "Could not load the queue");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // A carrier finishing their file, or an agency filing certificates, moves a
  // row into this queue without anybody here doing anything — so it refreshes
  // itself rather than waiting for somebody to reload the page.
  useAutoRefresh(() => fetchQueue({ silent: true }));

  const counts = useMemo(() => {
    const tally = { ALL: files.length };
    ONBOARDING_STATUSES.forEach((status) => {
      tally[status] = files.filter((f) => f.status === status).length;
    });
    return tally;
  }, [files]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return files
      .filter((file) => tab === "ALL" || file.status === tab)
      .filter((file) => {
        if (!term) return true;
        return [
          file.carrier?.carrierName,
          file.carrier?.fleetOwnerCode,
          file.legalName,
          file.mcNumber,
          file.insuranceAgent,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => {
        // Oldest first inside the review tab — a file that has been sitting for
        // a week is the one to open, and newest-first buries it.
        if (tab === "UNDER_REVIEW") {
          return new Date(a.submittedAt || a.updatedAt) - new Date(b.submittedAt || b.updatedAt);
        }
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
  }, [files, tab, search]);

  const openFile = (file) =>
    navigate(`${base}/onboarding-review/${file.carrier?._id}`);

  // ── Cells shared by both layouts ───────────────────────────────────────────
  const paperworkText = (file) =>
    `${file.signedCount}/${file.agreementCount} signed`;

  const driversText = (file) =>
    file.driverCount === 0
      ? "No drivers"
      : `${file.driverCount} driver${file.driverCount === 1 ? "" : "s"}${
          file.licencesMissing
            ? ` · ${file.licencesMissing} licence${file.licencesMissing === 1 ? "" : "s"} missing`
            : ""
        }`;

  const insuranceText = (file) =>
    file.insuranceSubmittedAt
      ? `${file.policyCount} polic${file.policyCount === 1 ? "y" : "ies"} filed ${fmtDate(file.insuranceSubmittedAt)}`
      : file.insuranceAgent
        ? `Waiting on ${file.insuranceAgent}`
        : "No agency asked yet";

  const columns = [
    {
      key: "carrier",
      header: "Carrier",
      render: (file) => (
        <div className="leading-tight">
          <button
            type="button"
            onClick={() => openFile(file)}
            className="text-sm font-semibold text-indigo-700 hover:underline text-left"
          >
            {file.carrier?.carrierName || file.legalName || "Unnamed carrier"}
          </button>
          <p className="text-[11px] font-mono text-gray-500 mt-0.5">
            {file.carrier?.fleetOwnerCode || "—"}
            {file.mcNumber ? ` · MC ${file.mcNumber}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "150px",
      render: (file) => (
        <div>
          <OnboardingStatusBadge status={file.status} />
          {file.outstandingCount > 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              {file.outstandingCount} item
              {file.outstandingCount === 1 ? "" : "s"} outstanding
            </p>
          )}
        </div>
      ),
    },
    {
      key: "paperwork",
      header: "Agreements",
      width: "110px",
      render: (file) => (
        <span
          className={`text-xs font-medium ${
            file.signedCount === file.agreementCount
              ? "text-green-700"
              : "text-amber-700"
          }`}
        >
          {paperworkText(file)}
        </span>
      ),
    },
    {
      key: "drivers",
      header: "Drivers",
      width: "170px",
      render: (file) => (
        <span
          className={`text-xs ${
            file.licencesMissing || !file.driverCount
              ? "text-amber-700"
              : "text-gray-700"
          }`}
        >
          {driversText(file)}
        </span>
      ),
    },
    {
      key: "insurance",
      header: "Insurance",
      render: (file) => (
        <div className="text-xs leading-tight">
          <p className={file.insuranceSubmittedAt ? "text-gray-700" : "text-amber-700"}>
            {insuranceText(file)}
          </p>
          {file.shortfalls > 0 && (
            <p className="text-[11px] font-semibold text-red-700 mt-0.5">
              {file.shortfalls} shortfall{file.shortfalls === 1 ? "" : "s"}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "waiting",
      header: "Waiting",
      width: "120px",
      render: (file) => {
        const days = daysSince(file.submittedAt || file.updatedAt);
        return (
          <div className="text-xs leading-tight">
            <p className={days >= 3 && file.status === "UNDER_REVIEW" ? "font-semibold text-red-700" : "text-gray-700"}>
              {days === null ? "—" : days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
            </p>
            <p className="text-[11px] text-gray-500">
              {fmtDate(file.submittedAt || file.updatedAt)}
            </p>
          </div>
        );
      },
    },
  ];

  const actions = (file) => (
    <button onClick={() => openFile(file)} className="btn-primary whitespace-nowrap py-1">
      Review file
    </button>
  );

  return (
    <div className={uiStyles.page}>
      <div>
        <h1 className="page-title">Carrier onboarding review</h1>
        <p className="page-subtitle">
          Every carrier's file, and the decision on it. A carrier who has
          finished their paperwork is told the office is reviewing it — this is
          that review.
        </p>
      </div>

      {counts.UNDER_REVIEW > 0 && tab !== "UNDER_REVIEW" && (
        <button
          onClick={() => setTab("UNDER_REVIEW")}
          className="w-full text-left rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 hover:border-indigo-300"
        >
          <FactCheckOutlinedIcon fontSize="small" className="mr-1.5 align-text-bottom" />
          <span className="font-semibold">
            {counts.UNDER_REVIEW} carrier{counts.UNDER_REVIEW === 1 ? " is" : "s are"} waiting on a decision.
          </span>{" "}
          Open the review queue →
        </button>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key] || 0;

          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-white/25" : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search carrier, code, MC number or agency…"
          className={`${uiStyles.input} max-w-md`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 📱 Mobile — a plain card rather than the shared MobileCard, whose
          title is wired to a load tracking link that means nothing here. */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading…</p>
        ) : rows.length ? (
          rows.map((file) => {
            const meta = onboardingStatusMeta(file.status);
            return (
              <button
                key={file._id}
                onClick={() => openFile(file)}
                className={`block w-full text-left rounded-xl border p-3.5 ${meta.tone}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {file.carrier?.carrierName || file.legalName || "Unnamed carrier"}
                    </p>
                    <p className="text-[11px] font-mono opacity-70 mt-0.5">
                      {file.carrier?.fleetOwnerCode || "—"}
                      {file.mcNumber ? ` · MC ${file.mcNumber}` : ""}
                    </p>
                  </div>
                  <OnboardingStatusBadge status={file.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Agreements", paperworkText(file)],
                    ["Drivers", driversText(file)],
                    ["Insurance", insuranceText(file)],
                    [
                      "Outstanding",
                      file.outstandingCount
                        ? `${file.outstandingCount} item${file.outstandingCount === 1 ? "" : "s"}`
                        : "Nothing",
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className={label === "Insurance" ? "col-span-2" : ""}>
                      <dt className="uppercase tracking-wide opacity-60">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            );
          })
        ) : (
          <p className="text-center text-gray-500 py-10">Nothing in this tab.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={rows}
          columns={columns}
          actions={actions}
          colorBy="status"
          colorMap={onboardingRowColors}
          loading={loading}
          emptyMessage={
            tab === "UNDER_REVIEW"
              ? "No carrier is waiting on a decision right now."
              : "Nothing in this tab."
          }
        />
      </div>

      {/* A quiet reminder of what approving actually does, for whoever is new
          to this screen. */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <CheckCircleIcon style={{ fontSize: 15 }} className="text-green-600 mr-1 align-text-bottom" />
        Approving clears the carrier to haul and locks their file from further
        edits on their side.
        <WarningAmberIcon style={{ fontSize: 15 }} className="text-amber-600 mx-1 align-text-bottom" />
        Sending it back reopens it with your note attached, which is the only
        thing the carrier sees telling them what to fix.
      </div>
    </div>
  );
};

export default CarrierOnboardingQueue;
