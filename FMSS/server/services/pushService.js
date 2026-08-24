const User = require("../models/User");
const { runUnscoped } = require("../utils/tenantContext");

/**
 * Push notifications to the phone app, over Expo.
 *
 * Instant dispatch is the reason this exists: a carrier who finds out about a
 * load when they next open their laptop is not a carrier who is going to take
 * it inside the offer window. An in-app notification and an email cover the
 * office; a push covers the dispatcher who is not at a desk.
 *
 * Expo's push service needs no API key to send — a token identifies the device
 * and Expo routes it to APNs or FCM. So the server half works as soon as tokens
 * start arriving.
 *
 * ── What is still needed on the phone ─────────────────────────────────────────
 * The mobile app does not yet register for push. It needs `expo-notifications`
 * added, permission requested at login, and the resulting token POSTed to
 * /api/users/push-token. Until that lands, `sendPush` finds no tokens, reports
 * `sent: false, reason: "no device registered"` for every recipient, and the
 * other two channels carry the message. Nothing here fails or blocks because of
 * it — the seam is deliberate, so the app change is additive.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo takes at most 100 messages per request.
const CHUNK = 100;

/** Expo tokens look like ExponentPushToken[xxxx] or ExpoPushToken[xxxx]. */
const isExpoToken = (token) =>
  typeof token === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

const chunked = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Push to a set of users, by user id.
 *
 * Best effort by design. A push that does not land must never take down the
 * thing that raised it — a load offer still went out by email and in-app, and
 * failing the request because a device is unreachable would be worse than the
 * missed notification.
 *
 * @returns {Promise<{sent: boolean, reason?: string, devices: number}>}
 */
const sendPush = async ({ userIds = [], title, body, data = {} }) => {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return { sent: false, reason: "no recipients", devices: 0 };

  let tokens = [];

  try {
    const users = await runUnscoped(() =>
      User.find({ _id: { $in: ids } })
        .select("pushTokens")
        .lean(),
    );

    tokens = [
      ...new Set(
        users.flatMap((user) => (user.pushTokens || []).map((entry) => entry.token)),
      ),
    ].filter(isExpoToken);
  } catch (error) {
    return { sent: false, reason: error.message, devices: 0 };
  }

  if (!tokens.length) {
    return { sent: false, reason: "no device registered", devices: 0 };
  }

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default",
    // Instant dispatch offers expire. A notification that arrives after the
    // window has closed is worse than one that never arrives, because it sends
    // somebody to a load they cannot take.
    priority: "high",
    ttl: 60 * 30,
  }));

  const failures = [];

  for (const batch of chunked(messages, CHUNK)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        failures.push(`Expo returned ${response.status}`);
        continue;
      }

      const payload = await response.json();

      // Expo answers per message. A DeviceNotRegistered ticket means the app was
      // uninstalled or the token rotated, so the token is dropped rather than
      // retried forever.
      const tickets = Array.isArray(payload?.data) ? payload.data : [];

      const dead = tickets
        .map((ticket, i) =>
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered"
            ? batch[i].to
            : null,
        )
        .filter(Boolean);

      if (dead.length) {
        await runUnscoped(() =>
          User.updateMany(
            { "pushTokens.token": { $in: dead } },
            { $pull: { pushTokens: { token: { $in: dead } } } },
          ),
        ).catch(() => {
          /* pruning is housekeeping — never worth failing a send over */
        });
      }

      tickets
        .filter((t) => t?.status === "error" && t?.details?.error !== "DeviceNotRegistered")
        .forEach((t) => failures.push(t.message || "push rejected"));
    } catch (error) {
      failures.push(error.message);
    }
  }

  return failures.length
    ? { sent: false, reason: failures[0], devices: tokens.length }
    : { sent: true, devices: tokens.length };
};

/** Record a device so it can be pushed to. Idempotent per token. */
const registerPushToken = async (userId, token, platform = "") => {
  if (!isExpoToken(token)) {
    throw Object.assign(new Error("That is not a valid Expo push token."), {
      status: 400,
    });
  }

  // A token identifies a device, and a device can change hands between logins.
  // Detaching it from whoever held it before is what stops one driver's offers
  // going to another driver's phone.
  await runUnscoped(() =>
    User.updateMany(
      { "pushTokens.token": token },
      { $pull: { pushTokens: { token } } },
    ),
  );

  await runUnscoped(() =>
    User.updateOne(
      { _id: userId },
      { $push: { pushTokens: { token, platform, registeredAt: new Date() } } },
    ),
  );
};

module.exports = { sendPush, registerPushToken, isExpoToken };
