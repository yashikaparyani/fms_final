// pages/BidDetails.jsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import { format } from "date-fns";
import Countdown from "react-countdown";
import PlaceIcon from "@mui/icons-material/Place";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import { RiLoader5Fill } from "react-icons/ri";
import SectionHeader from "../components/SectionHeader";
import Swal from "sweetalert2";
import { toast } from "react-toastify";

// ─── API layer ────────────────────────────────────────────────────────────────
const bidDetailsApi = {
  fetchLoad: (loadId) => api.get(`/loads/${loadId}`),
  fetchAllBids: (loadId) => api.get(`/bidRoutes/${loadId}/loadBids`), // staff/admin endpoint
  awardBid: (loadId, fleetOwnerId, bidAmount) => api.post(`/loads/${loadId}/award-bid`, { fleetOwnerId, bidAmount }),
  discardBid: (loadId, bidId) => api.post(`/loads/${loadId}/discard-bid`, { bidId }),
  reviseBid: (loadId, bidId, newAmount) => api.post(`/loads/${loadId}/revise-bid`, { bidId, newAmount }),
  sendAcceptanceMail: (loadId) => api.post(`/loads/${loadId}/send-acceptance-mail`),
};

// ─── Rank styling (mirrors LiveBidding) ──────────────────────────────────────
const rankStyle = (index) => {
  if (index === 0) return { bg: "bg-amber-100 text-amber-700",   label: "#1" };
  if (index === 1) return { bg: "bg-gray-100 text-gray-600",     label: "#2" };
  if (index === 2) return { bg: "bg-orange-100 text-orange-600", label: "#3" };
  return             { bg: "bg-gray-50 text-gray-500",           label: `#${index + 1}` };
};

const statusBadge = (status) => {
  const map = {
    WINNING:  "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-600",
    ACTIVE:   "bg-blue-100 text-blue-600",
  };
  return map[status] || "bg-gray-100 text-gray-500";
};

const bidStatusColor = (s) => {
  if (s === "OPEN")     return "bg-green-100 text-green-700 border-green-200";
  if (s === "CLOSED")   return "bg-red-100 text-red-600 border-red-200";
  if (s === "UPCOMING") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-gray-100 text-gray-500";
};

// ─── Countdown renderer ───────────────────────────────────────────────────────
const countdownRenderer = ({ days, hours, minutes, seconds, completed }) =>
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

// ─── Component ────────────────────────────────────────────────────────────────
const BidDetails = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();

  const [load, setLoad]           = useState(null);
  const [bids, setBids]           = useState([]);
  const [fetching, setFetching]   = useState(false);
  const [fetchingBids, setFetchingBids] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);

  // ─── Fetch load details ───────────────────────────────────────────────
  const fetchLoad = useCallback(async () => {
    if (!loadId) return;
    setFetching(true);
    try {
      const res = await bidDetailsApi.fetchLoad(loadId);
      setLoad(res.data);
    } catch (err) {
      console.error("Failed to fetch load:", err);
    } finally {
      setFetching(false);
    }
  }, [loadId]);

  // ─── Fetch all bids (scored + ranked, with fleetOwnerName) ───────────
  const fetchBids = useCallback(async () => {
    if (!loadId) return;
    setFetchingBids(true);
    try {
      const res = await bidDetailsApi.fetchAllBids(loadId);
      setBids(res.data);
    } catch (err) {
      console.error("Failed to fetch bids:", err);
    } finally {
      setFetchingBids(false);
    }
  }, [loadId]);

  useEffect(() => {
    fetchLoad();
    fetchBids();
  }, [fetchLoad, fetchBids]);

  // ─── Actions ─────────────────────────────────────────────────────────
  const handleAward = async (fleetOwnerId, fleetOwnerName, amount) => {
    const result = await Swal.fire({
      title: "Award this bid?",
      html: `Are you sure you want to award the load to <strong>${fleetOwnerName}</strong> for <strong>$${amount.toLocaleString()}</strong>?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Award Bid",
      confirmButtonColor: "#16a34a",
    });

    if (result.isConfirmed) {
      try {
        await bidDetailsApi.awardBid(loadId, fleetOwnerId, amount);
        toast.success("Bid awarded successfully!");
        fetchLoad();
        fetchBids();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to award bid");
      }
    }
  };

  const handleDiscard = async (bidId, fleetOwnerName) => {
    const result = await Swal.fire({
      title: "Discard Bid?",
      text: `Are you sure you want to discard the bid from ${fleetOwnerName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Discard",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      try {
        await bidDetailsApi.discardBid(loadId, bidId);
        toast.success("Bid discarded");
        fetchLoad();
        fetchBids();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to discard bid");
      }
    }
  };

  const handleRevise = async (bidId, currentAmount) => {
    const { value: newAmount } = await Swal.fire({
      title: "Revise Bid Amount",
      input: "number",
      inputLabel: "New Amount ($)",
      inputValue: currentAmount,
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value || value <= 0) return "Please enter a valid amount";
      }
    });

    if (newAmount) {
      try {
        await bidDetailsApi.reviseBid(loadId, bidId, Number(newAmount));
        toast.success("Bid revised successfully");
        fetchLoad();
        fetchBids();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to revise bid");
      }
    }
  };

  const handleSendAcceptanceMail = async () => {
    const result = await Swal.fire({
      title: "Send bid acceptance mail?",
      html: `Email the winning bidder <strong>${load?.winningBid?.fleetOwnerName || ""}</strong> to confirm they won this load?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Send Mail",
      confirmButtonColor: "#4f46e5",
    });

    if (!result.isConfirmed) return;

    setSendingMail(true);
    try {
      const res = await bidDetailsApi.sendAcceptanceMail(loadId);
      toast.success(res?.data?.message || "Acceptance mail sent");
      fetchLoad();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send acceptance mail");
    } finally {
      setSendingMail(false);
    }
  };

  // ─── Derived ─────────────────────────────────────────────────────────
  const lowestBid  = bids.length ? Math.min(...bids.map((b) => b.amount)) : null;
  const winningBid = bids.find((b) => b.status === "WINNING");

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-4">

      {/* Back + Header */}
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowBackIcon fontSize="small" />
          Back
        </button>
      </div>

      <SectionHeader
        title={`Bid Details — ${loadId}`}
        titleExtra={
          load && (
            <span className="flex items-center gap-1 text-gray-600 text-sm">
              <PlaceIcon fontSize="small" />
              {load.pickup?.city}
              <ArrowRightAltIcon fontSize="small" />
              {load.drop?.city}
            </span>
          )
        }
      />

      {/* ── Countdown + Lowest Bid banner ── */}
      <div className="flex gap-2 mb-4">
        <div className="p-4 w-full bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between">
          <div>
            <p className="text-xs text-gray-500">Bidding Ends In</p>
            {load?.bidEndTime && (
              <Countdown
                date={new Date(load.bidEndTime)}
                renderer={countdownRenderer}
              />
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">End Time</p>
            <p className="text-sm font-medium text-gray-700">
              {load?.bidEndTime
                ? new Date(load.bidEndTime).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>

        <div className="p-4 w-full bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col justify-center">
          <p className="text-xs text-gray-500 mb-1">
            {winningBid ? "Winning Bid" : "Lowest Bid"}
          </p>
          <p className="text-xl font-bold text-indigo-700">
            {winningBid 
              ? `$${winningBid.amount.toLocaleString()}` 
              : lowestBid != null ? `$${lowestBid.toLocaleString()}` : "—"}
          </p>
          {winningBid && (
            <p className="text-xs text-green-600 mt-0.5">
              Winner: {winningBid.fleetOwnerName}
            </p>
          )}

          {/* Send Bid Acceptance Mail — only once a winner has been awarded */}
          {load?.winningBid?.fleetOwnerId && (
            <button
              onClick={handleSendAcceptanceMail}
              disabled={sendingMail}
              className="mt-2 self-start flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {sendingMail
                ? "Sending…"
                : load.acceptanceMailSent
                ? "Resend Acceptance Mail"
                : "Send Bid Acceptance Mail"}
            </button>
          )}
          {load?.acceptanceMailSent && (
            <p className="text-[11px] text-green-600 mt-1">
              ✓ Acceptance mail sent
              {load.acceptanceMailSentAt
                ? ` on ${new Date(load.acceptanceMailSentAt).toLocaleString()}`
                : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── Load loading state ── */}
      {fetching ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
          <RiLoader5Fill className="animate-spin" />
          Fetching load details…
        </div>
      ) : load ? (
        <>
          {/* ── Load Info Grid ── */}
          <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ["Customer",    load.customerName],
              ["Material",    load.material],
              ["Source",      `${load.pickup?.city || "—"}, ${load.pickup?.state || ""}`],
              ["Destination", `${load.drop?.city   || "—"}, ${load.drop?.state   || ""}`],
              ["Truck Type",  load.truckType],
              ["Rate",        load.amount ? `$${load.amount.toLocaleString()}` : "—"],
              ["Load Status", load.status || load.transportStatus],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-gray-500 text-xs">{label}</span>
                <p className="font-medium text-sm text-gray-800">{value || "—"}</p>
              </div>
            ))}

            {/* Bid Status as badge */}
            <div>
              <span className="text-gray-500 text-xs">Bid Status</span>
              <div className="mt-0.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${bidStatusColor(load.bidStatus)}`}>
                  {load.bidStatus}
                </span>
              </div>
            </div>

            {/* Bidding Period */}
            <div className="col-span-2">
              <span className="text-gray-500 text-xs">Bidding Period</span>
              <p className="font-medium text-sm text-gray-800">
                {load.bidStartTime && load.bidEndTime
                  ? `${format(new Date(load.bidStartTime), "MMM dd, yyyy HH:mm")} → ${format(new Date(load.bidEndTime), "MMM dd, yyyy HH:mm")}`
                  : "—"}
              </p>
            </div>
          </div>

          {/* ── Bids Leaderboard ── */}
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                All Bids{" "}
                <span className="text-xs font-normal text-gray-400">
                  ({bids.length} received · ranked by score)
                </span>
              </p>
              <button
                onClick={fetchBids}
                disabled={fetchingBids}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
              >
                <RefreshIcon
                  fontSize="small"
                  className={fetchingBids ? "animate-spin" : ""}
                />
                {fetchingBids ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {fetchingBids && bids.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
                <RiLoader5Fill className="animate-spin" />
                Loading bids…
              </div>
            ) : bids.length === 0 ? (
              <p className="text-center py-6 text-sm text-gray-400">
                No bids received yet.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {bids.map((bid, index) => {
                  const { bg, label } = rankStyle(index);
                  const isWinner = bid.status === "WINNING";

                  return (
                    <div
                      key={bid._id}
                      className={`flex items-center justify-between py-3 px-2 rounded-lg ${isWinner ? "bg-green-50" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank badge */}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg}`}>
                          {label}
                        </span>

                        <div>
                          {/* Fleet owner name + status */}
                          <p className={`text-sm font-medium flex items-center gap-1.5 ${isWinner ? "text-green-700" : "text-gray-700"}`}>
                            {bid.fleetOwnerName || "Unknown"}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusBadge(bid.status)}`}>
                              {bid.status}
                            </span>
                          </p>

                          {/* Submitted time + score */}
                          <p className="text-xs text-gray-400">
                            {new Date(bid.submittedAt).toLocaleString()}
                            {bid.rating != null && (
                              <span className="ml-2 text-indigo-400">
                                ★ {bid.rating.toFixed(1)}
                              </span>
                            )}
                            {/* {bid.score != null && (
                              <span className="ml-2 text-gray-300">
                                score: {(bid.score * 100).toFixed(0)}
                              </span>
                            )} */}
                          </p>
                        </div>
                      </div>

                      {/* Amount and Actions */}
                      <div className="flex items-center gap-4">
                        <p className={`text-sm font-semibold ${isWinner ? "text-green-700" : "text-gray-800"}`}>
                          ${bid.amount.toLocaleString()}
                        </p>
                        
                        <div className="flex gap-1 border-l pl-4 border-gray-200">
                          {!isWinner && (!load.winningBid || !load.winningBid.fleetOwnerId) && (
                            <button
                              onClick={() => handleAward(bid.fleetOwnerId, bid.fleetOwnerName, bid.amount)}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors"
                            >
                              Award
                            </button>
                          )}
                            <button
                              onClick={() => handleRevise(bid._id, bid.amount)}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                            >
                              Revise
                            </button>
                            <button
                              onClick={() => handleDiscard(bid._id, bid.fleetOwnerName)}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                            >
                              Discard
                            </button>
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-10 text-gray-400 text-sm">
          Load not found.
        </div>
      )}
    </div>
  );
};

export default BidDetails;