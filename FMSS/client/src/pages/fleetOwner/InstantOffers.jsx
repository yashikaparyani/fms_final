import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BoltIcon from "@mui/icons-material/Bolt";
import PlaceIcon from "@mui/icons-material/Place";
import RefreshIcon from "@mui/icons-material/Refresh";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

// ─── Loads offered to me right now ────────────────────────────────────────────
// A customer asked for the fast route and one of my drivers is near their
// pickup. First carrier to accept has the load.
//
// Everything on this page is time-limited, so the countdown is the loudest
// thing on each card. An offer list that does not visibly expire is one people
// check twice a day, which is the opposite of the point.
//
// The figure shown is what this carrier is paid. The customer's price is not
// on this screen and never comes down the wire — see utils/loadVisibility.js
// on the server.
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) =>
  value === null || value === undefined
    ? "—"
    : `$${Number(value).toLocaleString("en-US")}`;

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

/** Minutes and seconds left, or null once it has run out. */
const timeLeft = (expiresAt) => {
  if (!expiresAt) return null;

  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const InstantOffers = () => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState(null);
  const [acting, setActing] = useState(null);
  // Ticks once a second purely to redraw the countdowns.
  const [, setTick] = useState(0);

  const fetchOffers = useCallback(async ({ silent = false } = {}) => {
    try {
      const { data } = await api.get("/instant-dispatch/offers");
      setOffers(data);
    } catch (err) {
      if (!silent) {
        notify.error(err?.response?.data?.message || "Could not load your offers");
      }
      setOffers((current) => current || []);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Offers expire on their own, so the list has to go stale on its own too.
  useAutoRefresh(() => fetchOffers({ silent: true }));

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const accept = async (offer) => {
    try {
      setActing(offer.loadId);
      const { data } = await api.post(`/instant-dispatch/${offer.loadId}/accept`);
      notify.success(data.message);
      // Straight to the load: the next thing they have to do is put a driver on
      // it, and making them find it again is a step for nothing.
      navigate(`/fleetOwner/assigned-loads`);
    } catch (err) {
      const code = err?.response?.data?.code;
      notify.error(
        err?.response?.data?.message ||
          (code === "ALREADY_TAKEN"
            ? "Another carrier took this load first."
            : "Could not accept that load"),
      );
      // Whatever went wrong, this carrier's list is out of date.
      fetchOffers({ silent: true });
    } finally {
      setActing(null);
    }
  };

  const decline = async (offer) => {
    try {
      setActing(offer.loadId);
      await api.post(`/instant-dispatch/${offer.loadId}/decline`);
      setOffers((current) => (current || []).filter((o) => o.loadId !== offer.loadId));
    } catch (err) {
      notify.error(err?.response?.data?.message || "Could not decline that load");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BoltIcon className="text-amber-500" /> Loads near your drivers
          </h1>
          <p className="page-subtitle">
            Offered to you because one of your trucks is close by. First carrier to
            accept takes the load.
          </p>
        </div>
        <button onClick={() => fetchOffers()} className="btn-secondary whitespace-nowrap">
          <RefreshIcon fontSize="small" /> Refresh
        </button>
      </div>

      {offers === null ? (
        <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>
      ) : offers.length === 0 ? (
        <div className={uiStyles.card}>
          <p className="text-sm text-gray-600">
            Nothing on offer right now. Loads appear here when a customer asks for the
            nearest truck and one of your drivers is in range — so keep your drivers
            tracking from the app while they run.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const left = timeLeft(offer.expiresAt);
            const busy = acting === offer.loadId;

            return (
              <div
                key={offer.loadId}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  left ? "border-amber-300" : "border-gray-200 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[16rem] flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">
                        {offer.loadId}
                      </span>
                      {offer.isUrgent && (
                        <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                          URGENT
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                        <PlaceIcon style={{ fontSize: 12 }} />
                        {offer.distanceMiles} mi away
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 mt-1.5">
                      {[offer.pickup.city, offer.pickup.state].filter(Boolean).join(", ") ||
                        "Pickup"}
                      {" → "}
                      {[offer.drop.city, offer.drop.state].filter(Boolean).join(", ") ||
                        "Delivery"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        offer.truckType,
                        offer.material,
                        offer.containerType,
                        offer.pickup.pickupDate
                          ? `pick up ${fmtDate(offer.pickup.pickupDate)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    {offer.nearestDriver && (
                      <p className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <LocalShippingOutlinedIcon style={{ fontSize: 14 }} />
                        Nearest: {offer.nearestDriver}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    {/* What this carrier is paid. The customer's price is not on
                        this screen and never reaches the browser. */}
                    <p className="text-xl font-extrabold text-gray-900">
                      {money(offer.payout)}
                    </p>
                    <p className="text-[11px] text-gray-500">to you</p>

                    <p
                      className={`text-[11px] font-bold mt-1.5 ${
                        left ? "text-amber-700" : "text-gray-400"
                      }`}
                    >
                      {left ? `${left} left` : "Expired"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => decline(offer)}
                    disabled={busy || !left}
                    className="btn-secondary disabled:opacity-40"
                  >
                    Not this one
                  </button>
                  <button
                    onClick={() => accept(offer)}
                    disabled={busy || !left}
                    className="btn-primary disabled:opacity-40"
                  >
                    {busy ? "Accepting…" : `Accept ${money(offer.payout)}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InstantOffers;
