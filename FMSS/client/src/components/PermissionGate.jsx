import BlockIcon from "@mui/icons-material/Block";
import { usePermissions } from "../hooks/usePermissions";

/**
 * Gate a single screen inside an already role-protected area.
 *
 * ProtectedRoute wraps a whole portal (`/admin`, `/staff`) because that is where
 * the shared layout lives, so it cannot express "this one child route needs
 * loads.edit". This does, one route at a time:
 *
 *   <Route path="staff" element={
 *     <PermissionGate permission="staff.view"><StaffManagement /></PermissionGate>
 *   } />
 *
 * Like every other client-side check, this hides a screen rather than securing
 * it — see utils/permissions.js.
 */
const PermissionGate = ({ permission, children, fallback }) => {
  const { canAny } = usePermissions();
  const keys = Array.isArray(permission) ? permission : [permission];

  if (canAny(keys)) return children;
  if (fallback) return fallback;

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <BlockIcon style={{ fontSize: 48 }} className="text-gray-300 mb-3" />
      <h2 className="text-lg font-semibold text-gray-800">
        You do not have access to this screen
      </h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md">
        Your account has not been granted the{" "}
        <span className="font-mono text-gray-700">{keys.join(" or ")}</span>{" "}
        permission. Ask an administrator to grant it from Permissions.
      </p>
    </div>
  );
};

export default PermissionGate;
