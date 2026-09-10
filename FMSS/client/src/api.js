import axios from "axios";
import { store } from "./redux/store";
import { getActiveLocation, clearActiveLocation } from "./utils/activeLocation";

const api = axios.create({
  baseURL: "/api", // Proxy to backend
});

// A load id contains a space — "LD 0014" — and it is interpolated straight into
// request paths all over the app. A literal space is not legal in a URL path, so
// it is percent-encoded here, once, rather than at each of the sixty-odd call
// sites that would otherwise have to remember. Only the path is touched;
// `params` is serialised (and encoded) by axios itself.
const encodePathSpaces = (url = "") => {
  const [path, ...rest] = String(url).split("?");
  return [path.replace(/ /g, "%20"), ...rest].join("?");
};

api.interceptors.request.use(
  (config) => {
    if (config.url) config.url = encodePathSpaces(config.url);

    const state = store.getState();
    const token = state.auth.api_token || localStorage.getItem("api_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Whether this request was made as somebody. The 401 handler below needs to
    // know: a 401 on a request that carried a token is an expired session, and a
    // 401 on one that did not is simply "no", answered by the screen that asked.
    config.hadToken = Boolean(token);

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
        // ── An expired session, not a refused one ─────────────────────────────
        // This bounce is for the case where somebody who WAS signed in makes a
        // request and the server no longer accepts their token. Sending them
        // back to the door is the right answer to that.
        //
        // It is the wrong answer to a failed sign-in. The login form posts
        // without a token and gets a 401 meaning "wrong email or password" —
        // and a full page navigation to /login reloads the app, throwing away
        // the React state holding the message the form had just set. The user
        // sees the page flash and come back blank, having been told nothing.
        //
        // So the redirect is skipped when the request carried no token: there
        // was no session to expire, and whichever screen asked is already the
        // one that should be showing the answer. Signing in is named outright as
        // well — a stale token left in storage would otherwise put a failed
        // sign-in straight back into the reload it is meant to avoid.
        const isSignIn = String(error.config?.url || "").includes("/auth/login");

        if (error.config?.hadToken && !isSignIn) {
          // Dispatch logout to clear state and local storage
          store.dispatch({ type: "auth/logout" });
          window.location.href = "/login";
        }
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