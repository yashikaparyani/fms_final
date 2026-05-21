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

const TransportStatusDialog = ({ open, onClose, load, onSuccess }) => {
  const [status, setStatus] = useState(load?.transportStatus || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (load) setStatus(load.transportStatus || "");
  }, [load]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put(`/loads/${load.loadId}/transport-status`, {
        transportStatus: status,
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
          >
            {TRANSPORT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, " ")}
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