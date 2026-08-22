import { useEffect } from "react";
import { useSelector } from "react-redux";

/**
 * Keeps `<body data-role>` in step with who is signed in.
 *
 * Every accent in the app — the rail's active state, card top-edges, focus
 * rings, dashboard headers — reads `--role-accent`, which index.css switches
 * on this attribute. Doing it once here means no component needs a
 * role-conditional of its own, and a driver's green portal and a broker's red
 * one are the same code path.
 *
 * Renders nothing.
 */
const RoleTheme = () => {
  const role = useSelector((state) => state.auth.user?.role);

  useEffect(() => {
    if (role) {
      document.body.dataset.role = role;
    } else {
      delete document.body.dataset.role;
    }
  }, [role]);

  return null;
};

export default RoleTheme;
