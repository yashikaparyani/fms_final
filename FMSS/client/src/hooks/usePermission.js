import { useSelector } from "react-redux";

export const usePermission = () => {
  const user = useSelector((state) => state.auth.user);

  const can = (permission) => {
    return user?.permissions?.includes(permission);
  };

  return { can };
};