import { useCallback, useEffect, useState } from "react";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DashboardHeader from "../../components/DashboardHeader";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import api from "../../api";

/**
 * The office side of public registration.
 *
 * Approving here is what actually creates the account and mails its password —
 * nothing a member of the public submits can sign in until someone on this
 * screen says so. When the credentials email fails the generated password is
 * shown once so it can be passed on by phone, because an approval that silently
 * strands somebody is worse than one that asks for a phone call.
 */

const STATUSES = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const roleMeta = {
  fleetOwner: {
    label: "Carrier",
    Icon: LocalShippingOutlinedIcon,
    badge: "badge-blue",
  },
  client: {
    label: "Customer",
    Icon: Inventory2OutlinedIcon,
    badge: "badge-teal",
  },
};

const SignupApprovals = () => {
  const [status, setStatus] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // Passwords for approvals whose email did not go out, kept only in memory
  // and only until the page is left.
  const [handoff, setHandoff] = useState({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/signups", { params: { status } });
      setRequests(res.data?.requests || []);
      setPendingCount(res.data?.pendingCount || 0);
    } catch (error) {
      notify.error(error.response?.data?.message || "Could not load registrations");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (request) => {
    try {
      setBusyId(request._id);
      const res = await api.post(`/signups/${request._id}/approve`);
      notify.success(res.data?.message || "Approved");

      // Only surfaced when the email did not land; otherwise the password has
      // already reached them and does not belong on screen.
      if (!res.data?.emailStatus?.sent && res.data?.password) {
        setHandoff((current) => ({ ...current, [request._id]: res.data.password }));
      }
      load();
    } catch (error) {
      notify.error(error.response?.data?.message || "Approval failed");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (request) => {
    const reason = window.prompt(`Reject ${request.email}? Reason (optional):`);
    if (reason === null) return;

    try {
      setBusyId(request._id);
      await api.post(`/signups/${request._id}/reject`, { reason });
      notify.success("Registration rejected");
      load();
    } catch (error) {
      notify.error(error.response?.data?.message || "Could not reject");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={uiStyles.page}>
      <DashboardHeader
        title="Registration approvals"
        subtitle="Public sign-ups from customers and carriers. Approving creates the account and emails its credentials."
        stats={[{ label: "Waiting on review", value: pendingCount }]}
      />

      {/* Status filter */}
      <div className="flex gap-2">
        {STATUSES.map((option) => (
          <button
            key={option.key}
            onClick={() => setStatus(option.key)}
            style={status === option.key ? { background: "var(--role-accent)" } : undefined}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              status === option.key
                ? "text-white shadow-card"
                : "bg-surface border border-hairline text-ink-600 hover:border-ink-300"
            }`}
          >
            {option.label}
            {option.key === "PENDING" && pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-white/25 px-1.5 text-[11px]">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center text-ink-500 text-sm">Loading registrations…</div>
      ) : requests.length === 0 ? (
        <div className="card text-center">
          <p className="text-sm font-semibold text-ink-700">
            Nothing {status.toLowerCase()}.
          </p>
          <p className="text-xs text-ink-400 mt-1">
            New public registrations land here for review.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {requests.map((request) => {
            const meta = roleMeta[request.role] || roleMeta.client;
            const { Icon } = meta;
            const password = handoff[request._id];

            return (
              <div key={request._id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
                      <Icon fontSize="small" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-ink-900 truncate">
                        {request.displayName || request.email}
                      </p>
                      <p className="text-xs text-ink-500 truncate">{request.email}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={meta.badge}>{meta.label}</span>
                        {request.locationId?.name && (
                          <span className="badge-gray">{request.locationId.name}</span>
                        )}
                        <span className="text-[11px] text-ink-400">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {request.status === "PENDING" ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => approve(request)}
                        disabled={busyId === request._id}
                        className={`btn-success ${busyId === request._id ? "btn-disabled" : ""}`}
                      >
                        <CheckIcon fontSize="small" /> Approve
                      </button>
                      <button
                        onClick={() => reject(request)}
                        disabled={busyId === request._id}
                        className={`btn-secondary ${busyId === request._id ? "btn-disabled" : ""}`}
                      >
                        <CloseIcon fontSize="small" />
                      </button>
                    </div>
                  ) : (
                    <span
                      className={request.status === "APPROVED" ? "badge-green" : "badge-red"}
                    >
                      {request.status}
                    </span>
                  )}
                </div>

                {/* Details worth seeing before deciding. */}
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {request.phone && <Detail label="Phone" value={request.phone} />}
                  {request.role === "fleetOwner" && (
                    <>
                      <Detail label="MC" value={request.mcLicense} />
                      <Detail label="DOT" value={request.dotLicense} />
                    </>
                  )}
                  {request.address?.city && (
                    <Detail
                      label="Address"
                      value={[request.address.street, request.address.city, request.address.state, request.address.zip]
                        .filter(Boolean)
                        .join(", ")}
                    />
                  )}
                </dl>

                {request.note && (
                  <p className="mt-3 rounded-lg bg-ink-50 border border-hairline p-3 text-xs text-ink-600 leading-relaxed">
                    {request.note}
                  </p>
                )}

                {request.rejectionReason && (
                  <p className="mt-3 rounded-lg bg-bad-50 border border-bad-100 p-3 text-xs text-bad-700">
                    Rejected: {request.rejectionReason}
                  </p>
                )}

                {password && (
                  <div className="mt-3 rounded-lg bg-warn-50 border border-warn-100 p-3">
                    <p className="text-xs font-bold text-warn-700">
                      The credentials email did not go out — share these by hand.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded bg-surface border border-hairline px-2 py-1 text-sm font-mono text-ink-900">
                        {password}
                      </code>
                      <button
                        className="btn-secondary-small"
                        onClick={() => {
                          navigator.clipboard?.writeText(password);
                          notify.success("Password copied");
                        }}
                      >
                        <ContentCopyIcon style={{ fontSize: 14 }} /> Copy
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-warn-700/80">
                      Shown once. It is not stored anywhere in plain text.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Detail = ({ label, value }) =>
  value ? (
    <div>
      <dt className="font-semibold text-ink-400 uppercase tracking-wide text-[10px]">
        {label}
      </dt>
      <dd className="text-ink-700 font-medium">{value}</dd>
    </div>
  ) : null;

export default SignupApprovals;
