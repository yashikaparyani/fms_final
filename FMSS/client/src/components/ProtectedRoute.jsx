import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

const roleLoginMap = {
  admin: "/admin-login",
  staff: "/staff-login",
  client: "/client-login",
  fleetOwner: "/vendor-login",
};

const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem("api_token");
  const { user } = useSelector((state) => state.auth);
  // Optional fallback
  const localUser = JSON.parse(localStorage.getItem("user"));
  const currentUser = user || localUser;

  // Not logged in
  if (!token || !currentUser) {
    return <Navigate to={roleLoginMap[allowedRole]} replace />;
  }

  // Wrong role
  if (currentUser.role !== allowedRole) {
    return <Navigate to={roleLoginMap[currentUser.role]} replace />;
  }

  return children;
};

export default ProtectedRoute;