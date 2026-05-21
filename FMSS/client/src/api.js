import axios from "axios";
import { store } from "./redux/store";

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
        // Handle unauthorized role access
        import("react-toastify").then(({ toast }) => {
          toast.error("Not Authorized to perform this action");
        });
      }
    }
    return Promise.reject(error);
  }
);

export default api;