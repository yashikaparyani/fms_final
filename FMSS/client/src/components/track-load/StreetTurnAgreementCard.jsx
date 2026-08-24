import { useEffect, useState } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Card from "./Card";
import SectionHeader from "./SectionHeader";
import StreetTurnAgreementDocument, {
  Section,
} from "../street-turn/StreetTurnAgreementDocument";
import api from "../../api";

// ─── The office's copy of the transfer agreement ──────────────────────────────
// Every party is emailed the agreement when a street turn is confirmed, and the
// transferee reads it on their signing page — but until this card the office
// had to go digging through email to see what was actually sent, and had no way
// at all to see the signature that came back.
//
// Fetched from the server rather than rebuilt here: the agreement is assembled
// once, from what was frozen onto the load at confirmation time, so this cannot
// drift from the copy the transferee signed.
//
// Renders nothing at all unless the load was street turned.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/**
 * Whether the transferee has actually accepted the container.
 *
 * The first question anyone opens this card to answer, so it is the banner
 * rather than something to scroll for: confirming a street turn only says we
 * told them it was happening.
 */
const SignatureBanner = ({ signature, linkExpiresAt }) => {
  if (signature) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-good-100 bg-good-50 px-3 py-2.5">
        <CheckCircleIcon fontSize="small" className="text-good-600 mt-px" />
        <div className="text-sm">
          <p className="font-bold text-good-700">Signed by the transferee</p>
          <p className="text-ink-600">
            {signature.signedName}
            {signature.signedTitle ? `, ${signature.signedTitle}` : ""}
            {signature.company ? ` — ${signature.company}` : ""} on{" "}
            {fmt(signature.signedAt)}
          </p>
        </div>
      </div>
    );
  }

  const expired = linkExpiresAt && new Date(linkExpiresAt) < new Date();

  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn-100 bg-warn-50 px-3 py-2.5">
      <HourglassEmptyIcon fontSize="small" className="text-warn-700 mt-px" />
      <div className="text-sm">
        <p className="font-bold text-warn-700">Awaiting the transferee's signature</p>
        <p className="text-ink-600">
          {expired
            ? "Their signing link has expired — re-confirm the street turn to send a fresh one."
            : linkExpiresAt
              ? `Their signing link is valid until ${fmt(linkExpiresAt)}.`
              : "No signing link was issued — the partner has no email on file."}
        </p>
      </div>
    </div>
  );
};

/**
 * The signature as evidence rather than as decoration: who signed, from where,
 * and on what. A dispute over whether the box changed hands is answered here.
 */
const SignatureBlock = ({ signature }) => (
  <Section title="Transferee signature">
    <div className="rounded-xl border border-hairline bg-ink-50 p-4">
      {signature.signatureData ? (
        <img
          src={signature.signatureData}
          alt={`Signature of ${signature.signedName}`}
          className="h-20 object-contain bg-surface rounded-lg border border-hairline p-2"
        />
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
            Signed by
          </dt>
          <dd className="text-sm font-semibold text-ink-800 break-words">
            {signature.signedName}
            {signature.signedTitle ? `, ${signature.signedTitle}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
            Signed at
          </dt>
          <dd className="text-sm font-semibold text-ink-800">{fmt(signature.signedAt)}</dd>
        </div>
        {signature.company ? (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
              Company
            </dt>
            <dd className="text-sm font-semibold text-ink-800 break-words">
              {signature.company}
            </dd>
          </div>
        ) : null}
        {signature.signedIp ? (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
              Recorded from IP
            </dt>
            <dd className="text-sm font-semibold text-ink-800">{signature.signedIp}</dd>
          </div>
        ) : null}
        {signature.note ? (
          <div className="col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
              Partner note
            </dt>
            <dd className="text-sm font-semibold text-ink-800 break-words">
              {signature.note}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  </Section>
);

/**
 * Who was told, and who could not be reached. A send that failed is only worth
 * recording if somebody can see that it failed.
 */
const NotificationList = ({ notifications }) => {
  if (!notifications.length) return null;

  return (
    <Section title="Confirmation emails">
      <ul className="space-y-1.5">
        {notifications.map((entry, i) => (
          <li
            key={`${entry.party}-${entry.email}-${i}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="text-ink-600">
              <span className="font-semibold text-ink-800">{entry.party}</span>
              {entry.email ? ` — ${entry.email}` : ""}
            </span>
            <span
              className={`shrink-0 text-xs font-bold ${
                entry.sent ? "text-good-600" : "text-bad-600"
              }`}
              title={entry.reason || undefined}
            >
              {entry.sent ? "Sent" : entry.reason || "Failed"}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

const StreetTurnAgreementCard = ({ load }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const loadId = load?.loadId;
  // A load that was never street turned has no agreement to fetch.
  const confirmedAt = load?.streetTurn?.confirmedAt;

  // Nothing here resets this state when the page switches to another load —
  // the caller keys the card by loadId, so a different load remounts it fresh
  // rather than showing the previous load's agreement while the next fetches.

  useEffect(() => {
    if (!loadId || !confirmedAt) return;

    let cancelled = false;

    api
      .get(`/loads/${loadId}/street-turn-agreement`)
      .then(({ data }) => !cancelled && setDetail(data))
      .catch(
        (err) =>
          !cancelled &&
          setError(
            err?.response?.data?.message || "Could not load the transfer agreement.",
          ),
      )
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [loadId, confirmedAt]);

  if (!confirmedAt) return null;

  return (
    <Card>
      <SectionHeader label="Street Turn Transfer Agreement" accent="#84cc16">
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-secondary flex items-center gap-1 text-xs"
        >
          {open ? "Hide" : "View"}
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </button>
      </SectionHeader>

      <div className="p-4 md:p-5">
        {loading && <p className="text-sm text-ink-500">Opening the agreement…</p>}

        {!loading && error && (
          <p className="text-sm font-semibold text-bad-600">{error}</p>
        )}

        {!loading && !error && detail?.confirmed && (
          <>
            {/* Always visible: the answer to "did they take it?", plus who on
                our side put their name to it. */}
            <SignatureBanner
              signature={detail.signature}
              linkExpiresAt={detail.signatureLinkExpiresAt}
            />
            <p className="text-xs text-ink-500 mt-2">
              Confirmed {fmt(detail.confirmedAt)}
              {detail.confirmedByName ? ` by ${detail.confirmedByName}` : ""} · handed to{" "}
              <span className="font-semibold text-ink-700">
                {detail.agreement?.transferee?.name || "—"}
              </span>
            </p>

            {/* The document itself is long, so it opens on request rather than
                pushing the rest of the load's details off the screen. */}
            {open && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StreetTurnAgreementDocument
                  agreement={detail.agreement}
                  loadId={detail.loadId}
                  note={detail.note}
                />
                {detail.signature && <SignatureBlock signature={detail.signature} />}
                <NotificationList notifications={detail.notifications || []} />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export default StreetTurnAgreementCard;
