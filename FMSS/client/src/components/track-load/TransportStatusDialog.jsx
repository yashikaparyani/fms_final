import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../api";
import StreetTurnConfirmDialog from "../StreetTurnConfirmDialog";
import {
  SELECTABLE_TRANSPORT_STATUSES,
  transportStatusLabel,
} from "../../utils/transportStatus";
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
  OutlinedInput,
} from "@mui/material";

// The list lives in utils/transportStatus.js, which leaves out Load Planner and
// New Load: those are written by the system before a load is dispatched, never
// chosen by anyone.
const TRANSPORT_STATUSES = SELECTABLE_TRANSPORT_STATUSES;


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
  // A street turn needs the handover details before it can be saved.
  const [showStreetTurn, setShowStreetTurn] = useState(false);

  useEffect(() => {
    // Start blank so the user must pick the next stage explicitly.
    setStatus("");
    setShowStreetTurn(false);
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

  const save = async (streetTurn) => {
    try {
      setSaving(true);
      await api.put(`/loads/${load.loadId}/transport-status`, {
        transportStatus: status,
        source: "web",
        ...(streetTurn ? { streetTurn } : {}),
      });
      toast.success("Status updated");
      setShowStreetTurn(false);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!status) {
      toast.error("Please select a status");
      return;
    }
    // Multi-origin pickup confirmation.
    if (status === "PICKED_UP" && canExtraPickup && pickedUpCount >= 1) {
      const originNo = pickedUpCount + 1;
      if (!window.confirm(`Is this the pickup for origin #${originNo}?`)) return;
    }
    // A street turn needs the handover details before it can be saved.
    if (status === "STREET_TURN") {
      setShowStreetTurn(true);
      return;
    }
    save(null);
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
        Update Status
      </DialogTitle>

      <DialogContent style={{ paddingTop: 8 }}>
        <FormControl fullWidth size="small">
          {/* shrink + notched: the label must stay floated because displayEmpty
              always renders placeholder content inside the field */}
          <InputLabel shrink>Status</InputLabel>
          <Select
            value={status}
            input={<OutlinedInput notched label="Status" />}
            onChange={(e) => setStatus(e.target.value)}
            style={{ borderRadius: 8 }}
            displayEmpty
            renderValue={(v) =>
              v ? transportStatusLabel(v) : (
                <span style={{ color: "#9ca3af" }}>Select next status…</span>
              )
            }
          >
            {TRANSPORT_STATUSES.map((s) => (
              <MenuItem key={s} value={s} disabled={isDisabledOption(s)}>
                {transportStatusLabel(s)}
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

      <StreetTurnConfirmDialog
        isShow={showStreetTurn}
        load={load}
        saving={saving}
        onCancel={() => setShowStreetTurn(false)}
        onConfirm={save}
      />
    </Dialog>
  );
};

export default TransportStatusDialog;