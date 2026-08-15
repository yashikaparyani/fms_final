import { unassignedReason } from "../utils/bidStatus";

/**
 * Amber note sitting under a CLOSED bid-status badge, naming the step that is
 * holding the load up. Renders nothing when a carrier is already assigned or
 * bidding has not closed, so it is safe to drop beside any status badge.
 */
const UnassignedNote = ({ load, className = "" }) => {
  const reason = unassignedReason(load);
  if (!reason) return null;

  return (
    <div className={`text-[10px] text-amber-700 leading-tight mt-0.5 ${className}`}>
      {reason}
    </div>
  );
};

export default UnassignedNote;
