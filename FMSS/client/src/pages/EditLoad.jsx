// pages/EditLoad.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { uiStyles } from "../style/uiStyles";
import api from "../api";
import AppSelect from "../components/AppSelect";
import AddressFields from "../components/AddressFields";

// ─── Add Company Modal ────────────────────────────────────────────────────────
const COMPANY_TYPES = ["Shipper", "Consignee", "Warehouse", "Terminal", "Other"];
const AddCompanyModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: "", type: "Other", contactName: "", contactPhone: "", contactEmail: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      const res = await api.post("/companies", form);
      toast.success(`Company "${res.data.name}" created!`);
      onSaved(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error creating company");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-800">Register New Company</h3>
          </div>
          {/* type="button" matters: these modals render inside the page form,
              where an untyped button submits it. */}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="relative">
            <input className={uiStyles.input} placeholder="Company Name *" value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving} autoFocus />
            <label className="input-label">Name <span className="text-red-400">*</span></label>
          </div>
          <div className="relative">
            <AppSelect options={COMPANY_TYPES.map((t) => ({ value: t, label: t }))} value={form.type} onChange={(val) => set("type", val)} isSearchable={false} isDisabled={saving} />
            <label className="input-label">Type</label>
          </div>
          <div className={uiStyles.grid2}>
            <div className="relative">
              <input className={uiStyles.input} placeholder="Contact Name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} disabled={saving} />
              <label className="input-label">Contact Name</label>
            </div>
            <div className="relative">
              <input className={uiStyles.input} placeholder="Phone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} disabled={saving} />
              <label className="input-label">Phone</label>
            </div>
          </div>
          <div className="relative">
            <input className={uiStyles.input} placeholder="Email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} disabled={saving} />
            <label className="input-label">Email</label>
          </div>
          <div className="relative">
            <textarea rows={2} className={uiStyles.textarea} placeholder="Notes (optional)" value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} />
            <label className="input-label">Notes</label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving..." : "Save Company"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add Address Modal ────────────────────────────────────────────────────────
const AddAddressModal = ({ company, onClose, onSaved }) => {
  const [form, setForm] = useState({ street: "", suite: "", city: "", state: "", zip: "", directions: "" });
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const handleAddrChange = ({ state, city, zip }) => setForm((prev) => ({ ...prev, state, city, zip }));

  const handleSave = async () => {
    if (!form.street || !form.city || !form.state || !form.zip) {
      toast.error("Street, City, State and Zip are required"); return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/companies/${company._id}/addresses`, form);
      toast.success("Address added!");
      onSaved(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error adding address");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-800">Add New Address</h3>
            <p className="text-xs text-gray-400">for <span className="font-semibold text-gray-600">{company.name}</span></p>
          </div>
          {/* type="button" matters: these modals render inside the page form,
              where an untyped button submits it. */}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="relative">
            <input className={uiStyles.input} placeholder="Street *" value={form.street} onChange={(e) => set("street", e.target.value)} disabled={saving} autoFocus />
            <label className="input-label">Street <span className="text-red-400">*</span></label>
          </div>
          <div className="relative">
            <input className={uiStyles.input} placeholder="Suite / Unit" value={form.suite} onChange={(e) => set("suite", e.target.value)} disabled={saving} />
            <label className="input-label">Suite / Unit</label>
          </div>
          <AddressFields state={form.state || ""} city={form.city || ""} zip={form.zip || ""} onChange={handleAddrChange} disabled={saving} required />
          <div className="relative mt-3">
            <textarea rows={2} className={uiStyles.textarea} placeholder="Directions (optional)" value={form.directions} onChange={(e) => set("directions", e.target.value)} disabled={saving} />
            <label className="input-label">Directions</label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving..." : "Save Address"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Zod Schema ───────────────────────────────────────────────────────────────
// A Drop moves two containers — one dropped, one taken away — so it exposes a
// second container/chassis pair. All four numbers are optional: they are often
// unknown at booking time and get filled in later.

// Loads created before the move types were reduced to Drop / Pick carry the
// old values. A rounded trip is the same two-container move as a Drop, and a
// "Delivery" is a drop-off, so both fold into Drop.
const toMoveType = (load) => {
  if (load.deliveryType === "ROUNDED") return "Drop";
  return ["Drop", "Delivery"].includes(load.singleType) ? "Drop" : "Pick";
};

const loadSchema = z.object({
  customer: z.string().min(1, "Please select a customer"),
  refNo: z.string().optional(),
  singleType: z.enum(["Drop", "Pick"]),
  truckType: z.string().min(1, "Load type is required"),
  material: z.string().min(1, "Material is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Amount must be a valid number",
    }),
  lastFreeDate:    z.string().optional(),
  orderBillDate:   z.string().optional(),
  containerType:   z.string().optional(),
  commodity:       z.string().optional(),
  bookingNo:       z.string().optional(),
  shippingLine:    z.string().optional(),
  containerNo:     z.string().optional(),
  chassisNo:       z.string().optional(),
  containerNo2:    z.string().optional(),
  chassisNo2:      z.string().optional(),
  chassisCompany:  z.string().optional(),
  pickupNo:        z.string().optional(),
  sealNo:          z.string().optional(),
  hazmat:          z.boolean(),
  chassisRent:     z.boolean(),
  railContainer:   z.boolean(),
  dryVan:          z.boolean(),
  reefer:          z.boolean(),
  isUrgent:        z.boolean(),
  accChargesEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid accessorial charges email" }),
  podEmail:        z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid POD email" }),
  deliveryEmail:   z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid delivery email" }),
  billingEmail:    z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid billing email" }),
  description:     z.string().optional(),
  remarks:         z.string().optional(),
  driverRequirement: z.enum(["Solo Driver", "Team Driver"]),
});

// ─── Stop Form (Pickup / Drop) ────────────────────────────────────────────────
const emptyStop = {
  selectedCompanyId: "",
  selectedAddressId: "",
  company: "",   // companyName resolved
  address: "", city: "", state: "", zip: "",
  pickupDate: "", deliveryDate: "",
};

// An <input type="date"> needs a bare YYYY-MM-DD; the API hands back an ISO
// timestamp. Read the local calendar parts rather than slicing the ISO string,
// so the date shown here matches the one the tables render via toLocaleDateString.
const toDateInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Keep only the editable stop fields (drops the server-generated _id).
const normalizeStop = (s = {}) => ({
  selectedCompanyId: "",
  selectedAddressId: "",
  company: s.company || "",
  address: s.address || "",
  city:    s.city    || "",
  state:   s.state   || "",
  zip:     s.zip     || "",
  pickupDate:   toDateInput(s.pickupDate),
  deliveryDate: toDateInput(s.deliveryDate),
});

// Shape a stop for the API.
const toStopPayload = (isPickup) => (s) => {
  const { pickupDate, deliveryDate, selectedCompanyId, selectedAddressId, ...rest } = s;
  const date = isPickup ? pickupDate : deliveryDate;
  return { ...rest, [isPickup ? "pickupDate" : "deliveryDate"]: date || null };
};

const StopForm = ({ data, onChange, loading, isPickup, allCompanies, setAllCompanies }) => {
  const set = (field, value) => onChange({ ...data, [field]: value });
  const dateField = isPickup ? "pickupDate" : "deliveryDate";

  const [addresses, setAddresses]           = useState([]);
  const [loadingAddr, setLoadingAddr]       = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);

  const closeMenus = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); };
  const openAddCompany = () => { closeMenus(); setShowAddCompany(true); };
  const openAddAddress = () => { closeMenus(); setShowAddAddress(true); };

  const fetchAddresses = useCallback(async (companyId) => {
    if (!companyId) { setAddresses([]); return; }
    setLoadingAddr(true);
    try {
      const res = await api.get(`/companies/${companyId}/addresses`);
      setAddresses(res.data);
    } catch { toast.error("Failed to load addresses"); }
    finally { setLoadingAddr(false); }
  }, []);

  useEffect(() => { fetchAddresses(data.selectedCompanyId); }, [data.selectedCompanyId, fetchAddresses]);

  const handleCompanyChange = (companyId) => {
    const c = allCompanies.find((c) => c._id === companyId);
    onChange({ ...data, selectedCompanyId: companyId, selectedAddressId: "", company: c?.name || "", address: "", city: "", state: "", zip: "" });
  };

  const handleAddressChange = (addressId) => {
    const a = addresses.find((a) => a._id === addressId);
    onChange({ ...data, selectedAddressId: addressId, address: a?.street || "", city: a?.city || "", state: a?.state || "", zip: a?.zip || "" });
  };

  const handleCompanySaved = (newCompany) => {
    setAllCompanies((prev) => [...prev, newCompany]);
    onChange({ ...data, selectedCompanyId: newCompany._id, selectedAddressId: "", company: newCompany.name || "", address: "", city: "", state: "", zip: "" });
    setShowAddCompany(false);
  };

  const handleAddressSaved = (newAddress) => {
    setAddresses((prev) => [...prev, newAddress]);
    onChange({ ...data, selectedAddressId: newAddress._id, address: newAddress.street || "", city: newAddress.city || "", state: newAddress.state || "", zip: newAddress.zip || "" });
    setShowAddAddress(false);
  };

  const selectedCompanyObj = allCompanies.find((c) => c._id === data.selectedCompanyId);

  return (
    <div className="space-y-4">

      {/* ── Company selector ── */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Company</h3>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <AppSelect
              options={allCompanies.map((c) => ({ value: c._id, label: c.name }))}
              value={data.selectedCompanyId}
              onChange={handleCompanyChange}
              placeholder="Search company..."
              isDisabled={loading}
            />
            <label className="input-label">Company</label>
          </div>
          <button
            type="button"
            onClick={openAddCompany}
            disabled={loading}
            className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-1.5 disabled:opacity-50"
            title="Register a new company"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* ── Address selector (visible once company chosen) ── */}
      {data.selectedCompanyId && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Address</h3>
          {loadingAddr ? (
            <p className="text-sm text-gray-400">Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 flex items-center gap-4">
              <p className="text-sm text-gray-500 flex-1">No addresses for this company.</p>
              <button type="button" onClick={openAddAddress} className="shrink-0 btn-primary text-sm">+ Add Address</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <AppSelect
                  options={addresses.map((a) => ({
                    value: a._id,
                    label: `${a.street}${a.suite ? `, ${a.suite}` : ""} - ${a.city}, ${a.state} ${a.zip}`,
                  }))}
                  value={data.selectedAddressId}
                  onChange={handleAddressChange}
                  placeholder="Search address..."
                  isDisabled={loading}
                />
                <label className="input-label">Address <span className="text-red-400">*</span></label>
              </div>
              <button
                type="button"
                onClick={openAddAddress}
                disabled={loading}
                className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Add a new address"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New
              </button>
            </div>
          )}
        </div>
      )}

      {/* If no company selected yet — show manual address fallback */}
      {!data.selectedCompanyId && (
        <div className="relative">
          <input className={uiStyles.input} value={data.address} onChange={(e) => onChange({ ...data, address: e.target.value })} disabled={loading} placeholder="Address *" />
          <label className="input-label">Address <span className="text-red-400">*</span></label>
        </div>
      )}

      {/* State → City → Zip cascade */}
      <AddressFields
        state={data.state || ""}
        city={data.city || ""}
        zip={data.zip || ""}
        onChange={({ state, city, zip }) => onChange({ ...data, state, city, zip })}
        disabled={loading}
        required
      />

      {/* Date */}
      <div className="relative">
        <input
          type="date"
          className={uiStyles.input}
          value={data[dateField] || ""}
          onChange={(e) => set(dateField, e.target.value)}
          disabled={loading}
        />
        <label className="input-label">
          {isPickup ? "Pickup Date" : "Delivery Date"}
        </label>
      </div>

      {/* Modals */}
      {showAddCompany && <AddCompanyModal onClose={() => setShowAddCompany(false)} onSaved={handleCompanySaved} />}
      {showAddAddress && selectedCompanyObj && (
        <AddAddressModal company={selectedCompanyObj} onClose={() => setShowAddAddress(false)} onSaved={handleAddressSaved} />
      )}
    </div>
  );
};

// ─── Repeatable list of stops (origins / destinations) ───────────────────────
const StopList = ({ singular, stops, setStops, loading, updateStop, addStop, removeStop, isPickup, allCompanies, setAllCompanies }) => (
  <div className="space-y-4">
    {stops.map((s, idx) => (
      <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-gray-700">{singular} {idx + 1}</h4>
          {stops.length > 1 && (
            <button
              type="button"
              onClick={() => removeStop(stops, setStops, idx)}
              disabled={loading}
              className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              ✕ Remove
            </button>
          )}
        </div>
        <StopForm
          data={s}
          onChange={(next) => updateStop(stops, setStops, idx, next)}
          loading={loading}
          isPickup={isPickup}
          allCompanies={allCompanies}
          setAllCompanies={setAllCompanies}
        />
      </div>
    ))}
    <button
      type="button"
      onClick={() => addStop(stops, setStops)}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-semibold text-gray-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition disabled:opacity-50"
    >
      + Add another {singular.toLowerCase()}
    </button>
  </div>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const PinIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ─── Address section info banner ────────────────────────────────────────────────
const AddressBanner = ({ color = "indigo", icon, title, note }) => {
  const palette = {
    indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
    amber:  "bg-amber-50  border-amber-100  text-amber-700",
  };
  return (
    <div className={`${palette[color]} border rounded-xl p-4 mb-5`}>
      <div className={`flex items-center gap-2 text-sm font-semibold mb-1`}>
        {icon} {title}
      </div>
      <p className="text-muted">
        Fields marked with <span className="text-red-500 font-bold">*</span> are required. {note}
      </p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const EditLoad = () => {
  const { loadId } = useParams();
  const navigate   = useNavigate();
  const user       = JSON.parse(localStorage.getItem("user"));
  const role       = user?.role;

  const [pageLoading, setPageLoading] = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [loadStatus,  setLoadStatus]  = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [customers,    setCustomers]    = useState([]);
  const [shippingLines, setShippingLines] = useState([]);
  const [chassisCompanies, setChassisCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [pickups,      setPickups]      = useState([{ ...emptyStop }]);
  const [drops,        setDrops]        = useState([{ ...emptyStop }]);

  // ── Multi-stop helpers (shared by origins & destinations) ────────────────
  const updateStop = (list, setList, index, next) =>
    setList(list.map((s, i) => (i === index ? next : s)));
  const addStop = (list, setList) => setList([...list, { ...emptyStop }]);
  const removeStop = (list, setList, index) =>
    setList(list.length > 1 ? list.filter((_, i) => i !== index) : list);

  const truckTypeOptions     = ["Container", "Flatbed", "Reefer", "Van", "Dry Van", "Open Truck", "Refrigerated", "Other"];
  const containerTypeOptions = ["40 Std", "40 HC", "45", "20"];
  const commodityOptions     = ["Chilled", "Dry", "Other", "Produce", "Frozen"];

  const { register, handleSubmit, watch, reset, control, formState: { errors } } = useForm({
    resolver: zodResolver(loadSchema),
    defaultValues: {
      customer: "", refNo: "", singleType: "Pick",
      truckType: "", material: "", amount: "", lastFreeDate: "", orderBillDate: "",
      containerType: "", commodity: "", bookingNo: "", shippingLine: "",
      containerNo: "", chassisNo: "", containerNo2: "", chassisNo2: "",
      chassisCompany: "", pickupNo: "", sealNo: "",
      hazmat: false, chassisRent: false, railContainer: false, dryVan: false, reefer: false, isUrgent: false,
      accChargesEmail: "", podEmail: "", deliveryEmail: "", billingEmail: "",
      description: "", remarks: "",
      driverRequirement: "Solo Driver",
    },
  });

  // A Drop carries a second container/chassis pair; a Pick does not.
  const singleType = watch("singleType");
  const isDrop = singleType === "Drop";
  const shippingLine = watch("shippingLine");
  const chassisCompany = watch("chassisCompany");

  // ── Error helper ────────────────────────────────────────────────────────
  const inputErrorClass = `${uiStyles.input} ${uiStyles.inputError}`;
  const cx = (name) => errors[name] ? inputErrorClass : uiStyles.input;

  // ── Fetch customers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (role === "admin" || role === "staff") {
      api.get("/customers").then((res) => setCustomers(res.data)).catch(() => {});
    }
  }, [role]);

  // ── Fetch companies (for stop company dropdowns) ─────────────────────────
  useEffect(() => {
    api.get("/companies").then((res) => setAllCompanies(res.data)).catch(() => {});
  }, []);

  // ── Fetch shipping line + chassis company masters ────────────────────────
  useEffect(() => {
    api
      .get("/shipping-lines", { params: { active: true } })
      .then((res) => setShippingLines(res.data))
      .catch(() => {});
    api
      .get("/chassis-companies", { params: { active: true } })
      .then((res) => setChassisCompanies(res.data))
      .catch(() => {});
  }, []);

  // A load saved before a master existed (or whose value was since removed or
  // deactivated) keeps its value as an extra option, so editing never blanks it.
  const buildMasterOptions = (rows, current) => {
    const options = rows.map((row) => ({
      value: row.name,
      label: row.code ? `${row.name} (${row.code})` : row.name,
    }));
    if (current && !options.some((o) => o.value === current)) {
      options.unshift({ value: current, label: `${current} (not in master)` });
    }
    return options;
  };

  const shippingLineOptions = buildMasterOptions(shippingLines, shippingLine);
  const chassisCompanyOptions = buildMasterOptions(chassisCompanies, chassisCompany);

  // ── Fetch & pre-populate ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchLoad = async () => {
      try {
        const res  = await api.get(`/loads/${loadId}`);
        const load = res.data;

        setLoadStatus(load.status);
        setChangesNote(load.changesNote || "");

        // Initialise origins from the pickups array, falling back to the
        // legacy single pickup, then to one empty stop.
        const initPickups =
          Array.isArray(load.pickups) && load.pickups.length
            ? load.pickups.map(normalizeStop)
            : load.pickup && (load.pickup.address || load.pickup.city)
              ? [normalizeStop(load.pickup)]
              : [{ ...emptyStop }];
        setPickups(initPickups);

        const initDrops =
          Array.isArray(load.drops) && load.drops.length
            ? load.drops.map(normalizeStop)
            : load.drop && (load.drop.address || load.drop.city)
              ? [normalizeStop(load.drop)]
              : [{ ...emptyStop }];
        setDrops(initDrops);

        reset({
          customer:        load.customer        || load.customerId || "",
          refNo:           load.refNo           || "",
          singleType:      toMoveType(load),
          truckType:       load.truckType       || "",
          material:        load.material        || "",
          amount:          load.amount          ? String(load.amount) : "",
          lastFreeDate:    load.lastFreeDate    ? load.lastFreeDate.slice(0, 10)    : "",
          orderBillDate:   load.orderBillDate   ? load.orderBillDate.slice(0, 10)   : "",
          containerType:   load.containerType   || "",
          commodity:       load.commodity       || "",
          bookingNo:       load.bookingNo       || "",
          shippingLine:    load.shippingLine    || "",
          containerNo:     load.containerNo     || "",
          chassisNo:       load.chassisNo       || "",
          containerNo2:    load.containerNo2    || "",
          chassisNo2:      load.chassisNo2      || "",
          chassisCompany:  load.chassisCompany  || "",
          pickupNo:        load.pickupNo        || "",
          sealNo:          load.sealNo          || "",
          hazmat:          load.hazmat          || false,
          chassisRent:     load.chassisRent     || false,
          railContainer:   load.railContainer   || false,
          dryVan:          load.dryVan          || false,
          reefer:          load.reefer          || false,
          isUrgent:        load.isUrgent        || false,
          accChargesEmail: load.accChargesEmail || "",
          podEmail:        load.podEmail        || "",
          deliveryEmail:   load.deliveryEmail   || "",
          billingEmail:    load.billingEmail    || "",
          description:     load.description     || "",
          remarks:         load.remarks         || "",
          driverRequirement: load.driverRequirement || "Solo Driver",
        });
      } catch {
        toast.error("Failed to load order details");
        navigate(-1);
      } finally {
        setPageLoading(false);
      }
    };
    fetchLoad();
  }, [loadId, navigate, role, reset]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  // Everything on the page saves in one request. The addresses are held in
  // component state rather than the form, so they are checked here — zod has
  // already passed by the time this runs.
  const onSubmit = async (data) => {
    const stopIsIncomplete = (s) => !s.address || !s.city || !s.state || !s.zip;

    if (pickups.some(stopIsIncomplete)) {
      toast.error("Please fill Address, City, State and Zip for every origin");
      return;
    }
    if (drops.some(stopIsIncomplete)) {
      toast.error("Please fill Address, City, State and Zip for every destination");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/loads/${loadId}`, {
        ...data,
        pickups: pickups.map(toStopPayload(true)),
        drops: drops.map(toStopPayload(false)),
      });
      const isInternal = role === "admin" || role === "staff";
      toast.success(
        isInternal
          ? "Load updated successfully!"
          : "Load updated and resubmitted for verification!"
      );
      navigate(`/${role}/track-load/${loadId}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update the load");
    } finally {
      setSubmitting(false);
    }
  };

  // Field errors sit next to their input, but the address sections are far
  // enough down the page that a failed submit needs pointing at.
  const onInvalid = () => {
    toast.error("Some fields need attention — check the highlighted inputs.");
  };

  if (pageLoading) {
    return (
      <div className={`min-h-screen bg-gray-50 ${uiStyles.flexCenter}`}>
        <p className={uiStyles.subtitle}>Loading load details…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-0 md:px-4">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="page-title">Edit Load — {loadId}</h1>
          <p className="page-subtitle">Update the fields below and resubmit for verification.</p>
        </div>

        {/* ── Changes Requested Banner ── */}
        {loadStatus === "REQUIRES_CHANGES" && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-sm font-bold text-orange-800 mb-1">⚠ Changes Requested by Staff</p>
            {changesNote
              ? <p className="text-sm text-orange-700 whitespace-pre-wrap">{changesNote}</p>
              : <p className="text-sm text-orange-600 italic">Please review and update the information below, then resubmit.</p>
            }
          </div>
        )}

        {/* ── Card ── */}
        {/* One page: load details, origins and destinations are all editable
            together and save in a single request. */}
        <div className={uiStyles.card}>

          <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
            <div>
              <h2 className="h4 mb-4">Load Details</h2>

              {/* Customer / Ref */}
              <div className={uiStyles.grid2}>
                {(role === "admin" || role === "staff") && (
                  <div className="relative">
                    <Controller
                      name="customer"
                      control={control}
                      render={({ field }) => (
                        <AppSelect
                          options={customers.map((c) => ({ value: c._id, label: `${c.firstName} ${c.lastName} (${c.email})` }))}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Search customer..."
                          error={!!errors.customer}
                          isDisabled={submitting}
                        />
                      )}
                    />
                    <label className="input-label">Customer</label>
                    {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer.message}</p>}
                  </div>
                )}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Ref #" {...register("refNo")} disabled={submitting} />
                  <label className="input-label">Ref #</label>
                </div>
              </div>

              {/* Delivery Modality */}
              <h3 className="form-subtitle">Delivery Modality</h3>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
                <div className="flex items-center gap-6">
                  {["Drop", "Pick"].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer label">
                      <input type="radio" value={val} {...register("singleType")} disabled={submitting} />
                      {val}
                    </label>
                  ))}
                </div>
                {isDrop && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 md:ml-auto w-full md:w-auto">
                    <span className="text-xs font-medium text-indigo-700">
                      A Drop moves 2 containers — a second container and chassis number can be entered below.
                    </span>
                  </div>
                )}
              </div>

              <h3 className="form-subtitle">Team Required</h3>
              <div className="flex items-center gap-8">
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Solo Driver" {...register("driverRequirement")} disabled={submitting} /> Solo Driver
                </label>
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Team Driver"  {...register("driverRequirement")} disabled={submitting} /> Team Driver
                </label>
              </div>

              {/* Details & Commodity */}
              <h3 className="form-subtitle">Details & Commodity</h3>
              <div className={uiStyles.grid2}>
                {/* Load Type */}
                <div className="relative">
                  <Controller
                    name="truckType"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={truckTypeOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select load type..."
                        error={!!errors.truckType}
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Load Type <span className="text-red-400">*</span></label>
                  {errors.truckType && <p className="text-xs text-red-500 mt-1">{errors.truckType.message}</p>}
                </div>

                {/* Material */}
                <div className="relative">
                  <input className={cx("material")} placeholder="e.g. Steel Coils" {...register("material")} disabled={submitting} />
                  <label className="input-label">Material <span className="text-red-400">*</span></label>
                  {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material.message}</p>}
                </div>

                {/* Amount */}
                <div className="relative">
                  <input type="number" className={cx("amount")} placeholder="0.00" {...register("amount")} disabled={submitting} />
                  <label className="input-label">Base Amount <span className="text-red-400">*</span></label>
                  {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
                </div>

                {/* Last Free Date */}
                <div className="relative">
                  <input type="date" className={uiStyles.input} {...register("lastFreeDate")} disabled={submitting} />
                  <label className="input-label">Last Free Date</label>
                </div>

                {/* Container Type */}
                <div className="relative">
                  <Controller
                    name="containerType"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={containerTypeOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select..."
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Container Type</label>
                </div>

                {/* Commodity */}
                <div className="relative">
                  <Controller
                    name="commodity"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={commodityOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select..."
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Commodity</label>
                </div>

                {/* Booking # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Booking #" {...register("bookingNo")} disabled={submitting} />
                  <label className="input-label">Booking #</label>
                </div>

                {/* Order Bill Date */}
                <div className="relative">
                  <input type="date" className={uiStyles.input} {...register("orderBillDate")} disabled={submitting} />
                  <label className="input-label">Order Bill Date</label>
                </div>

                {/* Shipping Line */}
                <div className="relative">
                  <Controller
                    name="shippingLine"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={shippingLineOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={shippingLineOptions.length ? "Select..." : "No shipping lines yet"}
                        noOptionsMessage={() => "No shipping lines. Add them under Admin → Shipping Lines."}
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Shipping Line</label>
                </div>

                {/* Chassis Company */}
                <div className="relative">
                  <Controller
                    name="chassisCompany"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={chassisCompanyOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={chassisCompanyOptions.length ? "Select..." : "No chassis companies yet"}
                        noOptionsMessage={() => "No chassis companies. Add them under Admin → Chassis Companies."}
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Chassis Company</label>
                </div>

                {/* Container / chassis numbers. The second pair only exists on
                    a Drop. All four numbers are optional. */}
                {[
                  { name: "containerNo",  label: "Container #"   },
                  { name: "chassisNo",    label: "Chassis #"     },
                  { name: "containerNo2", label: "Container #2", dropOnly: true },
                  { name: "chassisNo2",   label: "Chassis #2",   dropOnly: true },
                ]
                  .filter(({ dropOnly }) => !dropOnly || isDrop)
                  .map(({ name, label, required }) => (
                    <div key={name} className="relative">
                      <input className={cx(name)} placeholder={label} {...register(name)} disabled={submitting} />
                      <label className="input-label">
                        {label}
                        {required && <span className="text-red-400"> *</span>}
                      </label>
                      {errors[name] && (
                        <p className="text-xs text-red-500 mt-1">{errors[name].message}</p>
                      )}
                    </div>
                  ))}

                {/* Pickup # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Pickup #" {...register("pickupNo")} disabled={submitting} />
                  <label className="input-label">Pickup #</label>
                </div>

                {/* Seal # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Seal #" {...register("sealNo")} disabled={submitting} />
                  <label className="input-label">Seal #</label>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6 mt-4">
                {[
                  { name: "hazmat",        label: "Hazmat" },
                  { name: "chassisRent",   label: "Chassis Rent" },
                  { name: "railContainer", label: "Rail Container" },
                  { name: "dryVan",        label: "Dry Van" },
                  { name: "reefer",        label: "Reefer" },
                ].map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2 label cursor-pointer">
                    <input type="checkbox" className="rounded" {...register(name)} disabled={submitting} />
                    {label}
                  </label>
                ))}

                {/* Urgent — highlighted separately */}
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition">
                  <input type="checkbox" className="rounded accent-red-600" {...register("isUrgent")} disabled={submitting} />
                  🚨 Urgent
                </label>
              </div>

              {/* Emails */}
              <h3 className="form-subtitle">Emails</h3>
              <div className={uiStyles.grid2}>
                {[
                  { name: "accChargesEmail", label: "Accessorial Charges Email" },
                  { name: "podEmail",        label: "POD Email" },
                  { name: "deliveryEmail",   label: "Delivery Email" },
                  { name: "billingEmail",    label: "Billing Email" },
                ].map(({ name, label }) => (
                  <div key={name} className="relative">
                    <input className={cx(name)} placeholder={label} {...register(name)} disabled={submitting} />
                    <label className="input-label">{label}</label>
                    {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name].message}</p>}
                  </div>
                ))}
              </div>

              {/* Description & Remarks */}
              <h3 className="form-subtitle">Description & Remarks</h3>
              <div className="space-y-3">
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add description..." {...register("description")} disabled={submitting} />
                  <label className="input-label">Description</label>
                </div>
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add remarks..." {...register("remarks")} disabled={submitting} />
                  <label className="input-label">Remarks</label>
                </div>
              </div>

            </div>

            {/* ════════ Origins ════════ */}
            <div className="pt-8 mt-8 border-t border-gray-200">
              <div className="mb-5">
                <h2 className="h4">Pickup / Origin Address</h2>
                <p className="page-subtitle mt-0.5">Review and update the origin(s). Add more if the load has multiple pickups.</p>
              </div>

              <AddressBanner color="indigo" icon={<PinIcon />} title="Origin(s) / Pickup" />

              <StopList
                singular="Origin"
                stops={pickups}
                setStops={setPickups}
                loading={submitting}
                updateStop={updateStop}
                addStop={addStop}
                removeStop={removeStop}
                isPickup
                allCompanies={allCompanies}
                setAllCompanies={setAllCompanies}
              />
            </div>

            {/* ════════ Destinations ════════ */}
            <div className="pt-8 mt-8 border-t border-gray-200">
              <div className="mb-5">
                <h2 className="h4">Drop / Destination Address</h2>
                <p className="page-subtitle mt-0.5">Review and update the destination(s). Add more if the load has multiple drops.</p>
              </div>

              <AddressBanner color="amber" icon={<PinIcon />} title="Destination(s) / Drop" />

              <StopList
                singular="Destination"
                stops={drops}
                setStops={setDrops}
                loading={submitting}
                updateStop={updateStop}
                addStop={addStop}
                removeStop={removeStop}
                allCompanies={allCompanies}
                setAllCompanies={setAllCompanies}
              />
            </div>

            {/* ════════ One footer for the whole page ════════ */}
            <div className={`${uiStyles.flexBetween} gap-3 pt-6 border-t border-gray-200 mt-8`}>
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={submitting}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary !bg-green-600 !border-green-600 hover:!bg-green-700 disabled:opacity-50"
              >
                {submitting ? (
                  "Saving…"
                ) : role === "admin" || role === "staff" ? (
                  <> <CheckIcon /> Save Changes </>
                ) : (
                  <> <CheckIcon /> Save & Resubmit for Verification </>
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};

export default EditLoad;