import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import BlockIcon from "@mui/icons-material/Block";
import { canAny } from "../utils/permissions";

/**
 * Shown instead of a redirect when the user is signed in and in the right
 * portal but lacks the module permission.
 *
 * Bouncing them to the dashboard would read as a broken link — they clicked
 * something and landed somewhere else with no explanation. Saying what is
 * missing is what lets them ask the right person for the right thing.
 */
const NoAccess = ({ permission }) => (
  <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
    <BlockIcon style={{ fontSize: 48 }} className="text-gray-300 mb-3" />
    <h2 className="text-lg font-semibold text-gray-800">
      You do not have access to this screen
    </h2>
    <p className="text-sm text-gray-500 mt-2 max-w-md">
      Your account has not been granted the{" "}
      <span className="font-mono text-gray-700">{permission}</span> permission.
      Ask an administrator to grant it from Permissions.
    </p>
  </div>
);

/**
 * Route guard.
 *
 * `allowedRole`  — which portal this route belongs to.
 * `permission`   — optional module permission key, or an array meaning "any of".
 *
 * The permission check is a convenience: the API behind every one of these
 * screens re-checks server-side, so removing this component would cost usability
 * and not safety.
 */
const ProtectedRoute = ({ children, allowedRole, permission }) => {
  const token = localStorage.getItem("api_token");
  const { user } = useSelector((state) => state.auth);
  // Optional fallback
  const localUser = JSON.parse(localStorage.getItem("user"));
  const currentUser = user || localUser;

  // Not logged in. One door serves every role, so there is nothing to look up
  // — and the old per-role map sent people to a page that would have rejected
  // them anyway if they picked the wrong portal.
  if (!token || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Role match — admin is a superset of staff, so an admin is allowed into
  // any staff-protected route (the admin & staff areas share the same pages).
  const roleMatches =
    currentUser.role === allowedRole ||
    (currentUser.role === "admin" && allowedRole === "staff");

  // Signed in, but this is not their portal — send them to their own rather
  // than back out to sign-in, which would look like being logged out.
  if (!roleMatches) {
    return <Navigate to={`/${currentUser.role}/dashboard`} replace />;
  }

  if (permission) {
    const keys = Array.isArray(permission) ? permission : [permission];
    if (!canAny(currentUser, keys)) {
      return <NoAccess permission={keys.join(" or ")} />;
    }
  }

  return children;
};

export default ProtectedRoute;
