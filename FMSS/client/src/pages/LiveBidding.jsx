import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Countdown from "react-countdown";
import api from "../api";
import PlaceIcon from "@mui/icons-material/Place";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import SectionHeader from "../components/SectionHeader";
import { RiLoader5Fill } from "react-icons/ri";
import RefreshIcon from "@mui/icons-material/Refresh";

const POLL_INTERVAL_MS = 15000;

// ─── API layer ────────────────────────────────────────────────────────────────
// All API calls live here. Components just call these functions.

const biddingApi = {
  fetchLoad: (id) => api.get(`/loads/${id}`),
  fetchAllBids: (id) => api.get(`/bidRoutes/${id}/bids`),
  fetchMyBid: (id) => api.get(`/bidRoutes/${id}/bids/my`),
  placeBid: (id, amount) => api.post(`/bidRoutes/${id}/bids`, { amount }),
};

// ─── Component ────────────────────────────────────────────────────────────────

const LiveBidding = () => {
  const { id } = useParams();

  const [loadDetails, setLoadDetails] = useState(null);
  const [bids, setBids] = useState([]);
  console.log("Bids", bids);
  const [myBid, setMyBid] = useState(null);

  const [fetching, setFetching] = useState(false);
  const [fetchingBids, setFetchingBids] = useState(false);

  const [bidAmount, setBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [refreshBid, setRefreshBid] = useState(false);

  // ─── Fetch everything in one shot on mount ──────────────────────────────
  // load details + bids + myBid all resolve in parallel.
  const fetchAll = useCallback(async () => {
    if (!id) return;
    setFetching(true);
    setFetchingBids(true);

    try {
      const [loadRes, allBidsRes, myBidRes] = await Promise.all([
        biddingApi.fetchLoad(id),
        biddingApi.fetchAllBids(id),
        biddingApi.fetchMyBid(id),
      ]);

      setLoadDetails(loadRes.data);
      setBids(allBidsRes.data);

      const existingBid = myBidRes.data?.myBid ?? null;
      setMyBid(existingBid);

      // Pre-fill input only on first load (don't overwrite while user is typing)
      if (existingBid?.amount) {
        setBidAmount((prev) => prev || String(existingBid.amount));
      }
    } catch (err) {
      console.error("Failed to fetch bidding data:", err);
    } finally {
      setFetching(false);
      setFetchingBids(false);
    }
  }, [id]);

  // ─── Refresh only bids (used for polling + post-submit refresh) ─────────
  const refreshBids = useCallback(async () => {
    if (!id) return;
    setFetchingBids(true);

    try {
      const [allBidsRes, myBidRes] = await Promise.all([
        biddingApi.fetchAllBids(id),
        biddingApi.fetchMyBid(id),
      ]);

      setBids(allBidsRes.data);

      const existingBid = myBidRes.data?.myBid ?? null;
      setMyBid(existingBid);
    } catch (err) {
      console.error("Failed to refresh bids:", err);
    } finally {
      setFetchingBids(false);
    }
  }, [id]);

  // Initial full fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll bids only (not load details) every 15s
  useEffect(() => {
    try {
      biddingApi.fetchAllBids(id);
      setBids(allBidsRes.data);
    } catch (error) {
      console.log(error);
    }
  }, [refreshBid]);

  // ─── Place / update bid ─────────────────────────────────────────────────
  const handlePlaceBid = useCallback(async () => {
    setSubmitError("");
    setSubmitSuccess("");

    const parsed = parseFloat(bidAmount);
    if (!bidAmount || isNaN(parsed) || parsed <= 0) {
      setSubmitError("Enter a valid bid amount.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await biddingApi.placeBid(id, parsed);

      setSubmitSuccess(res.data.message || "Bid placed successfully!");
      setMyBid(res.data.bid);

      // Refresh leaderboard immediately after placing bid
      await refreshBids();
    } catch (err) {
      setSubmitError(err.response?.data?.message || "Failed to place bid.");
    } finally {
      setSubmitting(false);
    }
  }, [id, bidAmount, refreshBids]);

  // ─── Derived state ──────────────────────────────────────────────────────
  const isBiddingOpen =
    loadDetails?.bidStatus === "OPEN" &&
    new Date() >= new Date(loadDetails?.bidStartTime) &&
    new Date() <= new Date(loadDetails?.bidEndTime);

  // ─── Helpers ────────────────────────────────────────────────────────────
  const getDisplayName = (bid, index) => {
    if (myBid && bid._id === myBid._id) return "You";
    const nonSelfBefore = bids
      .slice(0, index)
      .filter((b) => !myBid || b._id !== myBid._id).length;
    return `Bidder-${nonSelfBefore + 1}`;
  };

  const rankStyle = (index) => {
    if (index === 0) return { bg: "bg-amber-100 text-amber-700", label: "#1" };
    if (index === 1) return { bg: "bg-gray-100 text-gray-600", label: "#2" };
    if (index === 2)
      return { bg: "bg-orange-100 text-orange-600", label: "#3" };
    return { bg: "bg-gray-50 text-gray-500", label: `#${index + 1}` };
  };

  const renderer = ({ days, hours, minutes, seconds, completed }) =>
    completed ? (
      <span className="text-red-600 font-bold text-xl">Expired</span>
    ) : (
      <span className="text-indigo-700 font-bold text-xl">
        {days > 0 && `${days}d `}
        {hours > 0 && `${hours}h `}
        {minutes > 0 && `${minutes}m `}
        {seconds}s
      </span>
    );

  const getVendorRate = (load) => {
    if (!load) return null;
    if (typeof load.vendorRate === "number") return load.vendorRate;
    if (
      typeof load.targetRate === "number" &&
      typeof load.margin === "number"
    ) {
      return load.targetRate - load.margin;
    }
    return load.amount ?? null;
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4">
      <SectionHeader
        title={`LiveBidding-#${id || 1}`}
        titleExtra={
          <span className="flex items-center gap-1 text-gray-600 text-sm">
            <PlaceIcon fontSize="small" />
            {loadDetails?.pickup?.city}
            <ArrowRightAltIcon fontSize="small" />
            {loadDetails?.drop?.city}
          </span>
        }
      />

      {/* ── Countdown banner ── */}
      <div className="flex justify-between align-center gap-2">
        <div className="mb-4 p-4 w-full bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between ">
          <div>
            <p className="text-xs text-gray-500">Bidding Ends In</p>
            {loadDetails?.bidEndTime && (
              <Countdown
                date={new Date(loadDetails.bidEndTime)}
                renderer={renderer}
              />
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">End Time</p>
            <p className="text-sm font-medium text-gray-700">
              {loadDetails?.bidEndTime
                ? new Date(loadDetails.bidEndTime).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>

        <div className="mb-4 p-4 w-full bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500">Rate After Margin</p>
            <p className="text-lg font-bold text-gray-900">
              ${Number(getVendorRate(loadDetails) || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {fetching ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
          <RiLoader5Fill className="animate-spin" />
          Fetching load details…
        </div>
      ) : loadDetails ? (
        <>
          {/* ── Load Info Comprehensive ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            
            {/* Column 1: Order & Shipment */}
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Shipment Details</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  {[
                    ["Customer", loadDetails.customerName],
                    ["Material", loadDetails.material],
                    ["Container", loadDetails.containerType],
                    ["Commodity", loadDetails.commodity],
                    ["Load Type", loadDetails.truckType],
                    ["Team Req.", loadDetails.driverRequirement],
                    ["Rate After Margin", getVendorRate(loadDetails) ? `$${Number(getVendorRate(loadDetails)).toLocaleString()}` : "—"],
                    ["Hazmat", loadDetails.hazmat ? "Yes" : "No"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="text-gray-500 text-xs block">{label}</span>
                      <span className="font-medium text-gray-800">{value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Identification</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  {[
                    ["Booking #", loadDetails.bookingNo],
                    ["Shipping Line", loadDetails.shippingLine],
                    ["Container #", loadDetails.containerNo],
                    ["Seal #", loadDetails.sealNo],
                    ["Pickup #", loadDetails.pickupNo],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="text-gray-500 text-xs block">{label}</span>
                      <span className="font-medium text-gray-800">{value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Pickup & Drop */}
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Pickup Info</p>
                <div className="text-sm space-y-2">
                  <p className="font-semibold text-indigo-900">{loadDetails.pickup?.company || "—"}</p>
                  <p className="text-gray-600">{loadDetails.pickup?.address || ""}</p>
                  <p className="text-gray-600">
                    {loadDetails.pickup?.city}, {loadDetails.pickup?.state} {loadDetails.pickup?.zip}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Destination Info</p>
                <div className="text-sm space-y-2">
                  <p className="font-semibold text-emerald-900">{loadDetails.drop?.company || "—"}</p>
                  <p className="text-gray-600">{loadDetails.drop?.address || ""}</p>
                  <p className="text-gray-600">
                    {loadDetails.drop?.city}, {loadDetails.drop?.state} {loadDetails.drop?.zip}
                  </p>
                </div>
              </div>
            </div>

            {/* Remarks / Description (Full width) */}
            {(loadDetails.description || loadDetails.remarks) && (
              <div className="md:col-span-2 p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-3">Remarks & Description</p>
                {loadDetails.description && (
                  <div className="mb-3">
                    <span className="text-xs text-amber-600 block">Description</span>
                    <p className="text-sm text-gray-700">{loadDetails.description}</p>
                  </div>
                )}
                {loadDetails.remarks && (
                  <div>
                    <span className="text-xs text-amber-600 block">Remarks</span>
                    <p className="text-sm text-gray-700">{loadDetails.remarks}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Place / Update Bid ── */}
          {isBiddingOpen && (
            <div className="mb-5 p-4 bg-white border border-indigo-200 rounded-xl">
              <p className="text-sm font-semibold text-gray-700 mb-3">
                {myBid ? "Update Your Bid" : "Place a Bid"}
              </p>

              {myBid && (
                <p className="text-xs text-indigo-600 mb-2">
                  Your current bid: ${myBid.amount.toLocaleString()}
                </p>
              )}

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter amount"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <button
                  onClick={handlePlaceBid}
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {submitting
                    ? "Submitting…"
                    : myBid
                      ? "Update Bid"
                      : "Place Bid"}
                </button>
              </div>

              {submitError && (
                <p className="mt-2 text-xs text-red-600">{submitError}</p>
              )}
              {submitSuccess && (
                <p className="mt-2 text-xs text-green-600">{submitSuccess}</p>
              )}
            </div>
          )}

          {/* ── Bids Leaderboard ── */}
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                Live Bids{" "}
                <span className="text-xs font-normal text-gray-400">
                  (lowest first)
                </span>
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <button
                  onClick={() => setRefreshBid((prev) => !prev)}
                  className="flex items-center gap-1 hover:text-gray-600"
                >
                  <RefreshIcon
                    fontSize="small"
                    className={fetching ? "animate-spin" : ""}
                  />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {bids.length === 0 ? (
              <p className="text-center py-6 text-sm text-gray-400">
                No bids yet. Be the first!
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {bids.map((bid, index) => {
                  const isMe = myBid && bid._id === myBid._id;
                  const { bg, label } = rankStyle(index);
                  const displayName = getDisplayName(bid, index);

                  return (
                    <div
                      key={bid._id}
                      className={`flex items-center justify-between py-3 px-2 rounded-lg ${
                        isMe ? "bg-indigo-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg}`}
                        >
                          {label}
                        </span>
                        <div>
                          <p
                            className={`text-sm font-medium ${isMe ? "text-indigo-700" : "text-gray-700"}`}
                          >
                            {displayName}
                            {isMe && (
                              <span className="ml-1 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                                bid
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(bid.submittedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">
                        ${bid.amount.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-10 text-gray-400 text-sm">
          No load details found.
        </div>
      )}
    </div>
  );
};

export default LiveBidding;
