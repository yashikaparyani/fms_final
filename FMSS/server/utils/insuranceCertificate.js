/**
 * The carrier's certificate of insurance — one document for the whole filing.
 *
 * An agency issues a single ACORD 25 listing every coverage, so the certificate
 * is filed once at `CarrierOnboarding.insurance.certificate` rather than once
 * per policy. Both the office's review screen and the carrier's own onboarding
 * page read it back, and the agency's public form reports what it already has.
 *
 * It lives here rather than on either controller because insuranceController
 * already requires onboardingController — putting it on one and importing from
 * the other would close a require cycle, and a half-initialised export is a
 * thing that fails at runtime rather than at load.
 */

/**
 * The certificate on file, if there is one.
 *
 * Filings made before the single-certificate change attached a certificate per
 * policy, so those are read as a fallback — the first one on file — rather than
 * showing an already-approved carrier as having filed nothing because the shape
 * moved underneath them. Nothing writes the per-policy field any more.
 */
const resolveCertificate = (insurance = {}) => {
  if (insurance?.certificate?.filePath) return insurance.certificate;

  const legacy = (insurance?.policies || []).find((p) => p.certificate?.filePath);
  return legacy?.certificate || null;
};

/**
 * What a client is told about the certificate.
 *
 * Metadata only — the stored path never leaves the server, and
 * GET /api/insurance/certificate is the only way to the file. The same
 * convention the signed agreements use with `hasDocument`.
 */
const certificateMeta = (insurance = {}) => {
  const certificate = resolveCertificate(insurance);
  if (!certificate) return null;

  return {
    originalName: certificate.originalName || certificate.fileName || "certificate",
    mimeType: certificate.mimeType || "",
    size: certificate.size || 0,
    uploadedAt: certificate.uploadedAt || null,
    // True when it came off a pre-change filing, so the office can tell a
    // certificate that was filed as one from one salvaged out of the old
    // per-policy shape — the latter may only cover a single coverage.
    legacy: !insurance?.certificate?.filePath,
  };
};

module.exports = { resolveCertificate, certificateMeta };
