import { useSelector } from "react-redux";
import { can, canAny, canAll } from "../utils/permissions";

/**
 * Permission checks for the signed-in user.
 *
 *   const { can } = usePermissions();
 *   {can("loads.create") && <NewLoadButton />}
 *
 * Reads Redux first and falls back to localStorage, because a hard refresh
 * populates localStorage before the /auth/me round-trip re-hydrates the store,
 * and a nav bar that flickers empty for a moment on every reload looks broken.
 */
export const usePermissions = () => {
  const reduxUser = useSelector((state) => state.auth.user);

  let user = reduxUser;
  if (!user) {
    try {
      user = JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      user = null;
    }
  }

  return {
    user,
    role: user?.role,
    isAdmin: user?.role === "admin",
    permissions: user?.permissions || [],
    can: (key) => can(user, key),
    canAny: (keys) => canAny(user, keys),
    canAll: (keys) => canAll(user, keys),
  };
};

export default usePermissions;
