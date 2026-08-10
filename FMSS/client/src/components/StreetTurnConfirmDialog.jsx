import { useEffect, useState } from "react";
import api from "../api";
import AppSelect from "./AppSelect";
import { uiStyles } from "../style/uiStyles";

// ─── Street Turn confirmation ────────────────────────────────────────────────
// Setting a load to STREET_TURN hands the container to a delivery partner, so
// the server refuses the status change unless these details come with it and
// emails every party once it is saved. This dialog collects them.
//
// It resolves with the payload rather than saving itself, so the caller keeps
// ownership of the status write (each screen posts to it differently).
// ─────────────────────────────────────────────────────────────────────────────

const toOptions = (rows) =>
  rows.map((row) => ({
    value: row.name,
    label: row.code ? `${row.name} (${row.code})` : row.name,
  }));

const StreetTurnConfirmDialog = ({ isShow, load, onCancel, onConfirm, saving }) => {
  const [partners, setPartners] = useState([]);
  const [lines, setLines] = useState([]);
  const [chassisCompanies, setChassisCompanies] = useState([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  const [deliveryPartner, setDeliveryPartner] = useState("");
  const [shippingLine, setShippingLine] = useState("");
  const [chassisCompany, setChassisCompany] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isShow) return;

    setError("");
    setNote("");
    // Pre-fill from the load so the common case is one click.
    setShippingLine(load?.shippingLine || "");
    setChassisCompany(load?.chassisCompany || "");
    setDeliveryPartner("");

    setLoadingMasters(true);
    Promise.all([
      api.get("/delivery-partners", { params: { active: true } }).catch(() => ({ data: [] })),
      api.get("/shipping-lines", { params: { active: true } }).catch(() => ({ data: [] })),
      api.get("/chassis-companies", { params: { active: true } }).catch(() => ({ data: [] })),
    ])
      .then(([p, l, c]) => {
        setPartners(p.data || []);
        setLines(l.data || []);
        setChassisCompanies(c.data || []);
      })
      .finally(() => setLoadingMasters(false));
  }, [isShow, load]);

  if (!isShow) return null;

  const partnerRow = partners.find((p) => p.name === deliveryPartner);
  const lineRow = lines.find((l) => l.name === shippingLine);
  const chassisRow = chassisCompanies.find((c) => c.name === chassisCompany);

  // A shipping line stored on the load but missing from the master cannot be
  // confirmed — the server validates against the master and would reject it.
  const staleShippingLine = shippingLine && !lineRow && !loadingMasters;
  const staleChassisCompany = chassisCompany && !chassisRow && !loadingMasters;

  const handleConfirm = () => {
    if (!deliveryPartner) {
      setError("Select the delivery partner this load is being handed to.");
      return;
    }
    setError("");
    onConfirm({ deliveryPartner, shippingLine, chassisCompany, note });
  };

  const recipients = [
    partnerRow && { label: "Delivery Partner", email: partnerRow.email },
    lineRow?.email && { label: "Shipping Line", email: lineRow.email },
    chassisRow?.email && { label: "Chassis Company", email: chassisRow.email },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">Confirm Street Turn</h3>
          <p className="text-xs text-gray-400">
            Load <span className="font-semibold text-gray-600">{load?.loadId}</span> — all
            parties below are emailed once you confirm.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="relative">
            <AppSelect
              options={toOptions(partners)}
              value={deliveryPartner}
              onChange={setDeliveryPartner}
              placeholder={
                loadingMasters
                  ? "Loading…"
                  : partners.length
                    ? "Select…"
                    : "No delivery partners yet"
              }
              noOptionsMessage={() =>
                "No delivery partners. Add them under Admin → Delivery Partners."
              }
              isDisabled={saving || loadingMasters}
            />
            <label className="input-label">
              Delivery Partner <span className="text-red-400">*</span>
            </label>
          </div>

          <div className="relative">
            <AppSelect
              options={toOptions(lines)}
              value={shippingLine}
              onChange={setShippingLine}
              placeholder={loadingMasters ? "Loading…" : "Select…"}
              noOptionsMessage={() =>
                "No shipping lines. Add them under Admin → Shipping Lines."
              }
              isClearable
              isDisabled={saving || loadingMasters}
            />
            <label className="input-label">Shipping Line</label>
          </div>

          <div className="relative">
            <AppSelect
              options={toOptions(chassisCompanies)}
              value={chassisCompany}
              onChange={setChassisCompany}
              placeholder={loadingMasters ? "Loading…" : "Select…"}
              noOptionsMessage={() =>
                "No chassis companies. Add them under Admin → Chassis Companies."
              }
              isClearable
              isDisabled={saving || loadingMasters}
            />
            <label className="input-label">Chassis Company</label>
          </div>

          <div className="relative">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={uiStyles.input}
              placeholder="Optional note included in the emails"
              disabled={saving}
            />
            <label className="input-label">Note</label>
          </div>

          {(staleShippingLine || staleChassisCompany) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {staleShippingLine && `"${shippingLine}" is not in the shipping line master. `}
              {staleChassisCompany && `"${chassisCompany}" is not in the chassis company master. `}
              Pick a listed value or clear the field before confirming.
            </p>
          )}

          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <p className="font-semibold text-gray-600 mb-1">Will be emailed:</p>
            {recipients.length === 0 && !deliveryPartner ? (
              <p>Select a delivery partner to see the recipients.</p>
            ) : (
              <ul className="space-y-0.5">
                {recipients.map((r) => (
                  <li key={r.label}>
                    {r.label}: <span className="text-gray-700">{r.email}</span>
                  </li>
                ))}
                <li>Assigned carrier / driver, and all admins</li>
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || loadingMasters || staleShippingLine || staleChassisCompany}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Confirming…" : "Confirm & Send Emails"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StreetTurnConfirmDialog;
