import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../api";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";

export const TRANSPORT_STATUSES = [
  "LOAD_PLANNER",
  "NEW_LOAD",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
  "TERMINATED",
  "PAPERWORK_PENDING",
  "INVOICED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DRIVER_ON_WAITING",
  "DROP_IN_WAREHOUSE",
];

// Forward-only progression. A status already reached can't be re-selected,
// except PICKED_UP on a multi-origin load (one pickup per origin).
const MAIN_ORDER = [
  "ASSIGNED",
  "READY_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
];

const TransportStatusDialog = ({ open, onClose, load, onSuccess }) => {
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Start blank so the user must pick the next stage explicitly.
    setStatus("");
  }, [load]);

  const originCount = load?.pickups?.length || 1;
  const pickedUpCount = (load?.transportStatusHistory || []).filter(
    (h) => h.status === "PICKED_UP",
  ).length;
  const canExtraPickup = originCount >= 2 && pickedUpCount < originCount;
  const currentIdx = MAIN_ORDER.indexOf(load?.transportStatus);

  // A status option is disabled if it's an already-reached / past stage,
  // unless it's an allowed repeat pickup for another origin.
  const isDisabledOption = (s) => {
    const idx = MAIN_ORDER.indexOf(s);
    if (idx === -1) return false; // side statuses (TERMINATED, etc.) stay available
    if (s === "PICKED_UP" && canExtraPickup) return false;
    return idx <= currentIdx;
  };

  const handleSave = async () => {
    if (!status) {
      toast.error("Please select a status");
      return;
    }
    // Multi-origin pickup confirmation.
    if (status === "PICKED_UP" && canExtraPickup && pickedUpCount >= 1) {
      const originNo = pickedUpCount + 1;
      if (!window.confirm(`Is this the pickup for origin #${originNo}?`)) return;
    }
    try {
      setSaving(true);
      await api.put(`/loads/${load.loadId}/transport-status`, {
        transportStatus: status,
        source: "web",
      });
      toast.success("Transport status updated");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ style: { borderRadius: 12 } }}
    >
      <DialogTitle
        style={{ fontWeight: 700, fontSize: 15, color: "#1f2937", paddingBottom: 8 }}
      >
        Update Transport Status
      </DialogTitle>

      <DialogContent style={{ paddingTop: 8 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Transport Status</InputLabel>
          <Select
            value={status}
            label="Transport Status"
            onChange={(e) => setStatus(e.target.value)}
            style={{ borderRadius: 8 }}
            displayEmpty
            renderValue={(v) =>
              v ? v.replace(/_/g, " ") : (
                <span style={{ color: "#9ca3af" }}>Select next status…</span>
              )
            }
          >
            {TRANSPORT_STATUSES.map((s) => (
              <MenuItem key={s} value={s} disabled={isDisabledOption(s)}>
                {s.replace(/_/g, " ")}
                {isDisabledOption(s) && MAIN_ORDER.indexOf(s) <= currentIdx
                  ? "  ✓"
                  : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>

      <DialogActions style={{ padding: "12px 20px" }}>
        <Button
          onClick={onClose}
          style={{ color: "#6b7280", textTransform: "none", fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          style={{
            backgroundColor: "#4f46e5",
            borderRadius: 8,
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TransportStatusDialog;