import { useState } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import api from "../../api";
import Card from "./Card";
import SectionHeader from "./SectionHeader";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { formatDateTime } from "../../utils/dates";
import { isPaperworkLocked, missingPaperwork } from "../../utils/paperwork";

// ─── Paperwork review ─────────────────────────────────────────────────────────
// The office's half of the Paperwork Pending workflow, and the driver's view of
// it, on one card.
//
// Both sides read the same card deliberately. The driver has to be able to see
// the exact wording of what was wrong with their document — a "changes
// requested" badge with the reason only visible to the office is how a load
// goes round the loop four times over a photo nobody explained.
//
// The office's controls (Approve, Request Changes, Send Reminder) are the only
// part that is staff-only. Approve stays live while a required document is
// missing: the office is the authority on whether a load can be billed, and a
// load held out of accounting over a Bill of Lading the customer kept is money
// nobody is chasing. What the missing list buys is the warning — the
// confirmation names what is not there and makes somebody say yes to it, and
// the approval carries that on the record afterwards.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_STYLE = {
  AWAITING_DOCUMENTS: {
    label: "Awaiting documents",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    accent: "#d97706",
  },
  IN_REVIEW: {
    label: "Waiting on the office",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    accent: "#2563eb",
  },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    accent: "#e11d48",
  },
  APPROVED: {
    label: "Approved — locked",
    pill: "bg-green-50 text-green-700 border-green-200",
    accent: "#16a34a",
  },
};

const FALLBACK_STYLE = {
  label: "Not started",
  pill: "bg-gray-50 text-gray-600 border-gray-200",
  accent: "#6b7280",
};

const Stamp = ({ label, at }) =>
  at ? (
    <p className="text-[13px] text-gray-500">
      {label} {formatDateTime(at)}
    </p>
  ) : null;

const PaperworkReviewCard = ({ load, isStaff, refresh }) => {
  const [busy, setBusy] = useState(null);

  const paperwork = load?.paperwork || {};
  const state = paperwork.state;
  const style = STATE_STYLE[state] || FALLBACK_STYLE;

  // The server is the authority on what is missing (see config/paperwork.js);
  // it rides along on the load so this does not have to keep its own copy of
  // the required list and drift from it.
  const missing = missingPaperwork(load);
  const locked = isPaperworkLocked(load);

  // Nothing to review until a load has been delivered. Shown from DELIVERED
  // rather than only from PAPERWORK_PENDING so the office can chase a driver
  // for the Bill of Lading before they have moved the load on.
  const relevant = ["DELIVERED", "PAPERWORK_PENDING", "INVOICED"].includes(
    load?.transportStatus,
  );
  if (!relevant) return null;

  const inQueue = load.transportStatus === "PAPERWORK_PENDING";

  // Approving is reachable from Delivered too, not only from the queue: the
  // documents on the load are the same either way, and the server opens the
  // review on its way past (see reviewPaperwork). Sending documents back still
  // needs the queue — it is a conversation about a review that is open.
  const canApprove = ["DELIVERED", "PAPERWORK_PENDING"].includes(
    load.transportStatus,
  );

  const post = async (path, body, label) => {
    setBusy(label);
    try {
      const res = await api.post(`/loads/${load.loadId}/${path}`, body);
      // The reminder endpoint answers 200 with success:false when there was
      // nobody to reach — a fact for the office, not a failure to retry.
      if (res.data?.success === false) toast.warn(res.data.message);
      else toast.success(res.data?.message || "Done");
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    // Approving a load that is short of a document is allowed, and it is the
    // one place the wording changes: the dialog names what is not there, so
    // nobody waives a Bill of Lading without having been told that is what they
    // are doing. The server writes the same list onto the approval — see
    // reviewPaperwork.
    const short = missing.length > 0;

    const { isConfirmed, value } = await Swal.fire({
      title: short ? "Approve without every document?" : "Approve this paperwork?",
      icon: short ? "warning" : undefined,
      html:
        (short
          ? `<p style="font-size:13px;color:#b91c1c;text-align:left;margin:0 0 10px">` +
            `Still missing: <b>${missing.join(", ")}</b>. Approving anyway is ` +
            `recorded against the load.</p>`
          : "") +
        `<p style="font-size:13px;color:#4b5563;text-align:left;margin:0 0 10px">` +
        `The load moves to <b>Invoiceable</b> and its documents are locked — the ` +
        `driver will not be able to change or replace them.</p>` +
        (inQueue
          ? ""
          : `<p style="font-size:13px;color:#4b5563;text-align:left;margin:0 0 10px">` +
            `It has not been moved to Paperwork Pending, so approving it now is ` +
            `what opens and closes its review.</p>`),
      input: "textarea",
      inputPlaceholder: "Optional note for the record…",
      inputAttributes: { rows: 3 },
      showCancelButton: true,
      confirmButtonText: short ? "Approve anyway" : "Approve",
      confirmButtonColor: short ? "#d97706" : "#16a34a",
    });

    if (isConfirmed) {
      await post(
        "paperwork/review",
        // `override` is the office saying yes to the list above. The server
        // refuses a short load without it, so a screen that has not refreshed
        // cannot approve one by accident.
        { decision: "APPROVE", note: value || "", override: short },
        "Approve",
      );
    }
  };

  const requestChanges = async () => {
    const { isConfirmed, value } = await Swal.fire({
      title: "Request changes",
      html:
        `<p style="font-size:13px;color:#4b5563;text-align:left;margin:0 0 10px">` +
        `Say what is wrong with the document. This is the text the driver is ` +
        `shown, so name the document and the problem.</p>`,
      input: "textarea",
      inputPlaceholder: "e.g. The Bill of Lading photo is cut off — resend the full page.",
      inputAttributes: { rows: 4 },
      showCancelButton: true,
      confirmButtonText: "Send back",
      confirmButtonColor: "#e11d48",
      preConfirm: (note) => {
        if (!String(note || "").trim()) {
          Swal.showValidationMessage("Say what needs correcting.");
          return false;
        }
        return note.trim();
      },
    });

    if (isConfirmed) {
      await post(
        "paperwork/review",
        { decision: "REQUEST_CHANGES", note: value },
        "Request changes",
      );
    }
  };

  const remind = async () => {
    const { isConfirmed, value } = await Swal.fire({
      title: "Send a document reminder",
      html:
        `<p style="font-size:13px;color:#4b5563;text-align:left;margin:0 0 10px">` +
        `Notifies the carrier and every driver on this load, in the app and on ` +
        `their phone.</p>`,
      input: "textarea",
      inputPlaceholder: "Optional note…",
      inputAttributes: { rows: 3 },
      showCancelButton: true,
      confirmButtonText: "Send reminder",
      confirmButtonColor: "#4338ca",
    });

    if (isConfirmed) {
      await post("paperwork/remind", { note: value || "" }, "Reminder");
    }
  };

  const reminders = paperwork.reminders || [];
  const chases = reminders.filter((r) => r.kind === "DOCUMENTS");

  return (
    <Card>
      <SectionHeader label="Paperwork Review" accent={style.accent}>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${style.pill}`}
        >
          {locked && <LockOutlinedIcon style={{ fontSize: 14 }} />}
          {style.label}
        </span>
      </SectionHeader>

      <div className="p-4 md:p-5 space-y-4">
        {/* ── Where this load is in the workflow ── */}
        {!state && (
          <p className="text-sm text-gray-600">
            This load has been delivered but has not been moved to Paperwork
            Pending yet. Move it there to start collecting and checking its
            documents — or approve it straight from here if there is nothing
            left to wait for.
          </p>
        )}

        {/* ── What is still missing ── */}
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
            Required documents
          </p>
          {missing.length === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircleOutlineIcon style={{ fontSize: 18 }} />
              All required documents are on file.
            </p>
          ) : (
            <p className="inline-flex items-start gap-1.5 text-sm font-medium text-rose-700">
              <ErrorOutlineIcon style={{ fontSize: 18, marginTop: 1 }} />
              <span>Still missing: {missing.join(", ")}</span>
            </p>
          )}
        </div>

        {/* ── What the office asked to be fixed ──
            Kept on screen after the driver re-uploads: it is the record of what
            was wrong, and it is what a support call weeks later is answered
            with. */}
        {paperwork.changesNote && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
            <p className="text-[13px] font-bold uppercase tracking-wide text-rose-700 mb-1">
              {state === "CHANGES_REQUESTED"
                ? "Changes requested by the office"
                : "Previously sent back for"}
            </p>
            <p className="text-sm text-rose-900 leading-snug">
              {paperwork.changesNote}
            </p>
            <Stamp label="Sent" at={paperwork.changesRequestedAt} />
            {paperwork.changeRequestCount > 1 && (
              <p className="text-[13px] font-semibold text-rose-700 mt-0.5">
                Sent back {paperwork.changeRequestCount} times.
              </p>
            )}
          </div>
        )}

        {locked && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-3">
            <p className="text-sm font-semibold text-green-800">
              Approved — the documents on this load are locked.
            </p>
            <Stamp label="Approved" at={paperwork.approvedAt} />
            {paperwork.approvalNote && (
              <p className="text-sm text-green-900 mt-1">{paperwork.approvalNote}</p>
            )}
          </div>
        )}

        {/* ── Chasers already sent ──
            "We have asked four times" is a fact somebody can act on; a card that
            only ever shows the latest state is not. */}
        {isStaff && chases.length > 0 && (
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-gray-400 mb-1">
              Reminders sent
            </p>
            <ul className="space-y-0.5">
              {chases.slice(-3).map((reminder, idx) => (
                <li key={idx} className="text-[13px] text-gray-500">
                  {formatDateTime(reminder.sentAt)} —{" "}
                  {reminder.sent
                    ? `${reminder.recipients} contact(s) notified`
                    : `not delivered: ${reminder.reason}`}
                </li>
              ))}
            </ul>
            {chases.length > 3 && (
              <p className="text-[13px] text-gray-400 mt-0.5">
                {chases.length} reminders in total.
              </p>
            )}
          </div>
        )}

        {/* ── The office's controls ── */}
        {isStaff && !locked && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={approve}
              disabled={!!busy || !canApprove}
              title={
                missing.length
                  ? `Still missing: ${missing.join(", ")} — approving anyway is recorded on the load.`
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircleOutlineIcon style={{ fontSize: 17 }} />
              {busy === "Approve" ? "Approving…" : "Approve → Invoiceable"}
            </button>

            <button
              type="button"
              onClick={requestChanges}
              disabled={!!busy || !inQueue}
              title={inQueue ? undefined : "Move the load to Paperwork Pending first."}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ErrorOutlineIcon style={{ fontSize: 17 }} />
              {busy === "Request changes" ? "Sending…" : "Request changes"}
            </button>

            <button
              type="button"
              onClick={remind}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <NotificationsActiveOutlinedIcon style={{ fontSize: 17 }} />
              {busy === "Reminder" ? "Sending…" : "Send document reminder"}
            </button>
          </div>
        )}

        {/* ── The driver's side ── */}
        {!isStaff && state === "CHANGES_REQUESTED" && (
          <p className="text-sm text-gray-600">
            Upload the corrected document below. It goes back to the office for
            review as soon as you do.
          </p>
        )}
        {!isStaff && state === "IN_REVIEW" && (
          <p className="text-sm text-gray-600">
            Your documents are with the office. Nothing more is needed unless
            they ask for a change.
          </p>
        )}
      </div>
    </Card>
  );
};

export default PaperworkReviewCard;
