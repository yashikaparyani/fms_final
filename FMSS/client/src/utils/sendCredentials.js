import Swal from "sweetalert2";
import api from "../api";

/**
 * POST to a send-credentials route, asking before replacing a recent password.
 *
 * The server refuses a second send inside a few minutes of the last one
 * (CREDENTIALS_RECENTLY_SENT) — each send makes a new password, and two or
 * three clicks used to leave the person with two or three emails and no way to
 * tell which password works. Here the office is told it already went out and
 * has to say so on purpose to issue another.
 *
 * Resolves with the response data, or null when the office chose not to
 * resend. Any other failure is thrown as before.
 */
export const postCredentials = async (url, body = {}) => {
  try {
    const { data } = await api.post(url, body);
    return data;
  } catch (err) {
    const refused = err?.response?.data;
    if (err?.response?.status !== 409 || refused?.code !== "CREDENTIALS_RECENTLY_SENT") {
      throw err;
    }

    const { isConfirmed } = await Swal.fire({
      title: "Already sent",
      text: refused.message,
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Send a new password anyway",
      cancelButtonText: "Keep the one they have",
      confirmButtonColor: "#b45309",
      focusCancel: true,
    });
    if (!isConfirmed) return null;

    const { data } = await api.post(url, { ...body, force: true });
    return data;
  }
};
