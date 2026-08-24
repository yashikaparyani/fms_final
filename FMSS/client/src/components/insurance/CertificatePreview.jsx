import DocumentPreview from "../common/DocumentPreview";

// ─── The certificate of insurance, on the page ────────────────────────────────
// One certificate for the whole filing, read by both the office and the carrier
// — the question either opens it to answer (does the holder read S LINE
// BROKERAGE, INC., do the limits match what was keyed in) is answered by looking
// at the document.
//
// A thin wrapper over DocumentPreview: it knows the certificate route and the
// one thing specific to certificates, which is the warning on a filing salvaged
// out of the old per-policy shape.
// ─────────────────────────────────────────────────────────────────────────────

const CertificatePreview = ({ certificate, fleetOwnerId, emptyMessage }) => (
  <DocumentPreview
    url={certificate ? "/insurance/certificate" : null}
    params={fleetOwnerId ? { fleetOwnerId } : undefined}
    name={certificate?.originalName}
    mimeType={certificate?.mimeType}
    size={certificate?.size}
    uploadedAt={certificate?.uploadedAt}
    downloadName={certificate?.originalName || "certificate-of-insurance"}
    emptyMessage={emptyMessage || "No certificate of insurance has been filed yet."}
    banner={
      // Salvaged out of the old per-policy shape, which means it may only cover
      // the one coverage it was attached to. Worth saying rather than letting
      // somebody assume it covers everything.
      certificate?.legacy ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200 px-3 py-1.5">
          Filed before certificates were consolidated — this was attached to a
          single coverage and may not list the others.
        </p>
      ) : null
    }
  />
);

export default CertificatePreview;
