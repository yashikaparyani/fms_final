import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import api from "../../api";
import AppSelect from "../AppSelect";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── Assign drivers to a load ─────────────────────────────────────────────────
// A load is awarded to the carrier; the carrier says who actually drives it.
// More than one is normal — a long move is handed over partway — so each driver
// gets their own leg with its own pickup and destination rather than sharing the
// load's own stops. A handover happens at a yard or a truck stop that is nobody's
// consignee and appears nowhere on the load, which is why these are typed rather
// than picked from it.
//
// The whole list is sent on save, replacing what was there: dispatch is a
// decision about who is on the load now, and merging would leave a driver who
// was swapped out still attached.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK = {
  driver: "",
  pickup: { address: "", city: "", state: "", zip: "" },
  drop: { address: "", city: "", state: "", zip: "" },
  note: "",
};

const StopFields = ({ label, value, onChange, disabled }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
      {label}
    </p>
    <div className="grid grid-cols-2 gap-2">
      <input
        className={`${uiStyles.input} text-sm col-span-2`}
        placeholder="Street"
        value={value.address}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
      />
      <input
        className={`${uiStyles.input} text-sm`}
        placeholder="City"
        value={value.city}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={`${uiStyles.input} text-sm`}
          placeholder="State"
          value={value.state}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, state: e.target.value })}
        />
        <input
          className={`${uiStyles.input} text-sm`}
          placeholder="ZIP"
          value={value.zip}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, zip: e.target.value })}
        />
      </div>
    </div>
  </div>
);

// `fleetOwnerId` is for the office, who have no roster of their own: it names
// whose drivers to offer. A carrier opening this omits it and gets theirs.
const AssignDriversDialog = ({ open, onClose, load, onSaved, fleetOwnerId }) => {
  const [drivers, setDrivers] = useState([]);
  const [rows, setRows] = useState([{ ...BLANK }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setLoading(true);

    // Seeded from what is already on the load, so opening this to change one
    // driver's leg does not silently drop the others on save.
    const existing = (load?.driverAssignments || []).map((a) => ({
      driver: String(a.driver?._id || a.driver || ""),
      pickup: { ...BLANK.pickup, ...(a.pickup || {}) },
      drop: { ...BLANK.drop, ...(a.drop || {}) },
      note: a.note || "",
    }));
    setRows(existing.length ? existing : [{ ...BLANK }]);

    api
      .get("/drivers", { params: fleetOwnerId ? { fleetOwnerId } : {} })
      .then(({ data }) => setDrivers(data.drivers || data || []))
      .catch(() => notify.error("Could not load the driver roster"))
      .finally(() => setLoading(false));
  }, [open, load, fleetOwnerId]);

  if (!open) return null;

  const setRow = (index, patch) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const save = async () => {
    const filled = rows.filter((row) => row.driver);

    if (rows.some((row) => !row.driver)) {
      notify.warning("Choose a driver on every row, or remove the empty ones.");
      return;
    }

    const ids = filled.map((r) => r.driver);
    if (new Set(ids).size !== ids.length) {
      notify.warning("The same driver is on this load twice.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.put(`/loads/${load.loadId}/drivers`, {
        drivers: filled,
      });
      notify.success(data.message);
      onSaved?.(data.driverAssignments);
      onClose();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save the drivers");
    } finally {
      setSaving(false);
    }
  };

  const options = drivers.map((d) => ({
    value: d._id,
    label: d.driverCode ? `${d.driverCode} · ${d.name}` : d.name,
  }));

  // Portalled: rendered in place this covers only the dashboard's content
  // column and tucks under the sidebar. See BaseAmountDialog.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <LocalShippingIcon className="text-white" fontSize="small" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Drivers on {load?.loadId}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Add a driver for each leg. Where a driver hands over partway,
                give each of them their own pickup and destination.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grow space-y-3">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : !drivers.length ? (
            <p className="text-sm text-gray-500 text-center py-8 border border-dashed border-gray-300 rounded-lg">
              No drivers on your roster yet. Add them from the Drivers screen
              first.
            </p>
          ) : (
            rows.map((row, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 w-12 shrink-0">
                    Leg {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <AppSelect
                      options={options}
                      value={row.driver}
                      onChange={(value) => setRow(index, { driver: value })}
                      placeholder="Choose a driver…"
                    />
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      title="Remove this leg"
                      onClick={() =>
                        setRows((c) => c.filter((_, i) => i !== index))
                      }
                      className="text-gray-400 hover:text-red-600 shrink-0"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StopFields
                    label="Their pickup"
                    value={row.pickup}
                    disabled={saving}
                    onChange={(pickup) => setRow(index, { pickup })}
                  />
                  <StopFields
                    label="Their destination"
                    value={row.drop}
                    disabled={saving}
                    onChange={(drop) => setRow(index, { drop })}
                  />
                </div>

                <input
                  className={`${uiStyles.input} text-sm`}
                  placeholder="Note for this leg (optional)"
                  value={row.note}
                  disabled={saving}
                  onChange={(e) => setRow(index, { note: e.target.value })}
                />
              </div>
            ))
          )}

          {!loading && drivers.length > 0 && rows.length < 10 && (
            <button
              type="button"
              onClick={() => setRows((c) => [...c, { ...BLANK }])}
              className="link text-sm"
            >
              + Add another driver
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
          <p className="text-xs text-gray-500 max-w-sm">
            Your account contact stays the name shown against this load —
            drivers are not shown to the customer.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading || !drivers.length}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save drivers"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AssignDriversDialog;
