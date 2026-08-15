import axios from "axios";
import { store } from "./redux/store";
import { getActiveLocation, clearActiveLocation } from "./utils/activeLocation";

const api = axios.create({
  baseURL: "/api", // Proxy to backend
});

api.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.auth.api_token || localStorage.getItem("api_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Which location this request operates on. Omitted on first load, in which
    // case the server falls back to the user's default branch and tells us
    // which one it picked via /branches/mine.
    const location = getActiveLocation();
    if (location) {
      config.headers["x-location-id"] = location;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Dispatch logout to clear state and local storage
        store.dispatch({ type: "auth/logout" });
        window.location.href = "/client-login";
      } else if (error.response.status === 403) {
        const code = error.response.data?.code;

        // A stored location the user no longer belongs to (revoked access, or a
        // stale value after switching accounts). Drop it and let the next
        // request fall back to their default rather than looping on 403s.
        if (code === "LOCATION_FORBIDDEN") {
          clearActiveLocation();
          window.location.reload();
          return Promise.reject(error);
        }

        import("react-toastify").then(({ toast }) => {
          toast.error(
            code === "NO_LOCATION"
              ? error.response.data.message
              : "Not Authorized to perform this action",
          );
        });
      }
    }
    return Promise.reject(error);
  }
);

export default api;