import { useState, useEffect } from "react";
import api from "../api";
import { notify } from "../utils/swal";
import { uiStyles } from "../style/uiStyles";
import { CircularProgress } from "@mui/material";

const EMPTY_FORM = {
  bidStartTime: "",
  bidEndTime: "",
  targetRate: "",
  // Amount we pay the fleet owner (what the vendor sees). Margin is derived
  // from this on submit: margin = targetRate - fleetOwnerAmount.
  fleetOwnerAmount: "",
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (num) => String(num).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());

  return `${y}-${m}-${d}T${hh}:${mm}`;
};

const ScheduleBidding = ({ open, onClose, load, refreshLoads }) => {
  const [loadDetails, setLoadDetails] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  
  useEffect(() => {
    if (!open || !load?.loadId) return;

    let isCurrentRequest = true;

    // Seed from selected row immediately so reschedule modal opens with existing values.
    setLoadDetails(load);
    setFormData({
      bidStartTime: toLocalDateTimeInput(load.bidStartTime),
      bidEndTime: toLocalDateTimeInput(load.bidEndTime),
      targetRate: load.targetRate ?? load.amount ?? "",
      fleetOwnerAmount: load.vendorRate ?? load.targetRate ?? load.amount ?? "",
    });

    const fetchLoadDetails = async () => {
      setFetching(true);
      try {
        const res = await api.get(`/loads/${load.loadId}`);
        const data = res.data;
        if (!isCurrentRequest) return;
        setLoadDetails(data);

        // Pre-fill times if already scheduled
        setFormData({
          bidStartTime: toLocalDateTimeInput(data.bidStartTime),
          bidEndTime: toLocalDateTimeInput(data.bidEndTime),
          targetRate: data.targetRate || data.amount || "",
          fleetOwnerAmount: data.vendorRate ?? data.targetRate ?? data.amount ?? "",
        });
      } catch (err) {
        if (!isCurrentRequest) return;
        console.error("Failed to fetch load:", err);
        notify.error("Failed to load details");
      } finally {
        if (isCurrentRequest) {
          setFetching(false);
        }
      }
    };

    fetchLoadDetails();

    return () => {
      isCurrentRequest = false;
    };
  }, [open, load?.loadId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setLoadDetails(null);
      setFormData(EMPTY_FORM);
    }
  }, [open]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSchedule = async () => {
    if (!formData.bidStartTime || !formData.bidEndTime) {
      notify.error("Please select both start and end times");
      return;
    }

    const startTime = new Date(formData.bidStartTime);
    const endTime = new Date(formData.bidEndTime);

    if (endTime <= startTime) {
      notify.error("End time must be after start time");
      return;
    }

    setLoading(true);
    try {
      // Keep the existing calculation: vendorRate = targetRate - margin.
      // We collect the fleet-owner payout directly and derive the margin.
      const targetRate = Number(formData.targetRate);
      const fleetOwnerAmount = Number(formData.fleetOwnerAmount);
      await api.post(`/loads/${loadDetails.loadId}/schedule`, {
        bidStartTime: startTime.toISOString(),
        bidEndTime: endTime.toISOString(),
        targetRate,
        margin: targetRate - fleetOwnerAmount,
      });
      notify.success("Bidding scheduled! Fleet owners have been notified.");
      refreshLoads();
      onClose();
    } catch (err) {
      notify.error(err.response?.data?.message || "Failed to schedule bidding");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNow = async () => {
    if (!formData.bidEndTime) {
      notify.error("Please set an end time first");
      return;
    }

    const now = new Date();
    const endTime = new Date(formData.bidEndTime);

    if (endTime <= now) {
      notify.error("End time must be in the future");
      return;
    }

    setLoading(true);
    try {
      await api.put(`/loads/${loadDetails.loadId}/bidding`, {
        bidStatus: "OPEN",
        bidStartTime: now.toISOString(),
        bidEndTime: endTime.toISOString(),
      });
      notify.success("Bidding is now OPEN! Fleet owners notified.");
      refreshLoads();
      onClose();
    } catch (err) {
      notify.error(err.response?.data?.message || "Failed to open bidding");
    } finally {
      setLoading(false);
    }
  };

  if (!open || !load) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${uiStyles.card} w-full max-w-[580px] p-6 rounded-2xl bg-white shadow-2xl relative`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-800">
            Schedule Bid — <span className="text-indigo-600">#{load.loadId}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {fetching ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-xs">
            <CircularProgress size={24} thickness={5} className="mb-3" />
            <span className="font-semibold tracking-wide uppercase">Fetching load details...</span>
          </div>
        ) : loadDetails ? (
          <>
            {/* Load Info Strip - Ultra Compact */}
            <div className="mb-5 p-4 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-3 gap-y-3 gap-x-4">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Customer</span>
                <p className="font-bold text-xs text-slate-700 truncate">{loadDetails.customerName || "—"}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Material</span>
                <p className="font-bold text-xs text-slate-700">{loadDetails.material || "—"}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Truck</span>
                <p className="font-bold text-xs text-slate-700">{loadDetails.truckType || "—"}</p>
              </div>
              <div className="col-span-2 space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Route</span>
                <p className="font-bold text-xs text-slate-700 truncate">{loadDetails.pickup?.city} → {loadDetails.drop?.city}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase text-emerald-500">Rate</span>
                <p className="font-black text-xs text-emerald-600">${loadDetails.amount?.toLocaleString()}</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Bid Start</label>
                  <input
                    type="datetime-local"
                    name="bidStartTime"
                    value={formData.bidStartTime}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Bid End</label>
                  <input
                    type="datetime-local"
                    name="bidEndTime"
                    value={formData.bidEndTime}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Base Rate ($)</label>
                  <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500">
                    {Number(formData.targetRate || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Fleet Owner Amount ($)</label>
                  <input
                    type="number"
                    name="fleetOwnerAmount"
                    value={formData.fleetOwnerAmount}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Result Bar */}
            <div className="mt-5 p-3 bg-indigo-600 rounded-xl flex items-center justify-between shadow-lg shadow-indigo-200">
              <div className="text-white">
                <span className="text-[9px] font-black uppercase opacity-80">Fleet Owner Gets</span>
                <p className="text-[10px] opacity-90 leading-tight">Amount displayed to fleet owners</p>
              </div>
              <div className="text-xl font-black text-white tracking-tight">
                ${Number(formData.fleetOwnerAmount || 0).toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors" 
                onClick={onClose} 
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="px-8 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-black transition-all active:scale-95 disabled:opacity-50 shadow-md"
                onClick={handleSchedule}
                disabled={loading}
              >
                {loading ? "Saving..." : "Schedule Bid"}
              </button>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-sm text-red-500">
            Failed to load details. Please close and try again.
          </div>
        )}

      </div>
    </div>
  );
};

export default ScheduleBidding;