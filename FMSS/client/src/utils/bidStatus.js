// ─── Why a closed load still has nobody driving it ───────────────────────────
// Closing is automatic: the cron shuts the window at bidEndTime whether or not
// anybody bid. Awarding a winner and assigning the carrier are both manual.
//
// So a load can sit at CLOSED for three quite different reasons, and the bare
// "CLOSED" badge tells staff none of them — a load nobody bid on looks exactly
// like one that is waiting on staff to press the button. Each reason below
// names the step that is actually outstanding.
//
// Rendered by <UnassignedNote>, in components/UnassignedNote.jsx.

/**
 * A short explanation of why a CLOSED load has no carrier assigned, or null
 * when there is nothing to explain (bidding still live, or already assigned).
 */
export const unassignedReason = (load) => {
  if (!load || load.bidStatus !== "CLOSED") return null;

  // Somebody is on it — nothing to explain.
  if (load.assignedFleetOwner?.fleetOwnerId) return null;

  // A winner was picked but the assignment never completed.
  if (load.winningBid?.fleetOwnerId) return "Winner awarded — driver not assigned yet";

  const bidCount = load.bidCount ?? load.bids?.length ?? 0;
  if (bidCount === 0) return "No bids received — no driver assigned";

  return "No winner awarded — no driver assigned";
};
