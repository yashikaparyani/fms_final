// ─── Reading a load's paperwork review ────────────────────────────────────────
// The browser's half of config/paperwork.js on the server. Only the questions a
// screen actually asks — what the review means is decided server-side, and the
// list of required documents is never rebuilt here: it arrives on the load as
// `paperwork.missingDocuments`, so a screen cannot approve a load against a
// stale idea of what it needs.
//
// The lock is derived from the state rather than read from `paperwork.locked`,
// which only the single-load endpoint fills in. A load that arrived from a list
// screen would otherwise read as unlocked and offer an upload the server is
// about to refuse.
// ─────────────────────────────────────────────────────────────────────────────

/** Approved paperwork is sealed — no more uploads, replacements or deletes. */
export const isPaperworkLocked = (load) =>
  load?.paperwork?.state === "APPROVED";

/** Required documents this load is still missing, newest answer from the server. */
export const missingPaperwork = (load) => load?.paperwork?.missingDocuments || [];
