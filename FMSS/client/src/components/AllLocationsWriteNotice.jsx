import PlaceIcon from "@mui/icons-material/Place";
import { isAllLocations } from "../utils/activeLocation";

/**
 * Shown on create/edit forms while the user is viewing "All locations".
 *
 * That mode spans several branches, so there is no single one to file a new
 * record under and the server refuses the write (ALL_LOCATIONS_READ_ONLY in
 * plugins/tenantScope.js). Letting the form submit anyway means the user fills
 * in a long form, presses Create, and gets an error for a reason that has
 * nothing to do with what they typed — so it is said up front instead, next to
 * the disabled button.
 *
 * Reads are unaffected: "All locations" remains a perfectly good way to look at
 * the whole business at once.
 */
const AllLocationsWriteNotice = ({ what = "create anything" }) => {
  if (!isAllLocations()) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <PlaceIcon fontSize="small" className="mt-0.5 shrink-0" />
      <div>
        <span className="font-semibold">
          You are viewing all locations.
        </span>{" "}
        Pick a single location from the switcher at the top of the page before
        you {what} — a new record has to belong to one location.
      </div>
    </div>
  );
};

/** Whether writes are currently possible. Pairs with the notice above. */
export const writesBlocked = () => isAllLocations();

export default AllLocationsWriteNotice;
