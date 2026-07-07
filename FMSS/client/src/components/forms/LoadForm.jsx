import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import AppSelect from "../AppSelect";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { uiStyles } from "../../style/uiStyles";
import api from "../../api";
import AddressFields from "../AddressFields";
import MapPicker from "../MapPicker";


const loadSchema = z.object({
  customer: z.string().min(1, "Please select a customer"),
  refNo: z.string().optional(),
  deliveryType: z.enum(["ROUNDED", "SINGLE"]),
  singleType: z.enum(["Pick Up", "Delivery", "Drop"]).optional(),
  truckType: z.string().min(1, "Truck type is required"),
  material: z.string().min(1, "Material is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Amount must be a valid number",
    }),
  lastFreeDate: z.string().optional(),
  orderBillDate: z.string().optional(),
  containerType: z.string().optional(),
  commodity: z.string().optional(),
  bookingNo: z.string().optional(),
  shippingLine: z.string().optional(),
  containerNo: z.string().optional(),
  pickupNo: z.string().optional(),
  sealNo: z.string().optional(),
  hazmat: z.boolean(),
  chassisRent: z.boolean(),
  railContainer: z.boolean(),
  dryVan: z.boolean(),
  reefer: z.boolean(),
  accChargesEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid accessorial charges email" }),
  podEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid POD email" }),
  deliveryEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid delivery email" }),
  billingEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid billing email" }),
  description: z.string().optional(),
  remarks: z.string().optional(),
  driverRequirement: z.enum(["Solo Driver", "Team Driver"]),
});

const StepIndicator = ({ step, savedLoadId }) => {
  const steps = [
    { num: 1, label: "Load Details" },
    { num: 2, label: "Pickup Address" },
    { num: 3, label: "Drop Address" },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${step > s.num ? "bg-green-500 border-green-500 text-white" : step === s.num ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-200 text-gray-400"}`}>
              {step > s.num ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : s.num}
            </div>
            <span className={`hidden md:block text-xs mt-1.5 font-semibold whitespace-nowrap ${step >= s.num ? "text-gray-800" : "text-gray-400"}`}>{s.label}</span>
            {s.num === 1 && savedLoadId && <span className="text-[10px] text-indigo-500 font-bold mt-0.5">{savedLoadId}</span>}
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-5 transition-all duration-500 ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
};


// Creates a new Company master (name + metadata only).
// Addresses are added separately after the company exists.
const COMPANY_TYPES = ["Shipper", "Consignee", "Warehouse", "Terminal", "Other"];

const AddCompanyModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: "", type: "Other", contactName: "", contactPhone: "", contactEmail: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/companies", form);
      toast.success(`Company "${res.data.name}" created!`);
      onSaved(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error creating company");
    } finally {
      setSaving(false);
    }
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="relative">
            <input
              className={uiStyles.input}
              placeholder="Company Name *"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={saving}
              autoFocus
            />
            <label className="input-label">Name <span className="text-red-400">*</span></label>
          </div>

          <div className="relative">
            <AppSelect
              options={COMPANY_TYPES.map((t) => ({ value: t, label: t }))}
              value={form.type}
              onChange={(val) => set("type", val)}
              isSearchable={false}
              isDisabled={saving}
            />
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

// ΓöÇΓöÇΓöÇ Add Address Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Adds an address to an existing company via POST /companies/:id/addresses
const AddAddressModal = ({ company, onClose, onSaved }) => {
  const [form, setForm] = useState({ street: "", suite: "", city: "", state: "", zip: "", directions: "", lat: null, lng: null });
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // ── Location cascade via AddressFields ───────────────────────────────────────
  const handleAddressChange = ({ state, city, zip }) => {
    setForm((prev) => ({ ...prev, state, city, zip }));
  };

  const handleLocationSelect = (address) => {
    setForm((prev) => ({
      ...prev,
      street: address.street || prev.street,
      city: address.city || prev.city,
      state: address.state || prev.state,
      zip: address.zip || prev.zip,
      lat: address.lat || prev.lat,
      lng: address.lng || prev.lng,
    }));
    setShowMap(false);
  };

  const handleSave = async () => {
    if (!form.street || !form.city || !form.state || !form.zip) {
      toast.error("Street, City, State and Zip are required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/companies/${company._id}/addresses`, form);
      toast.success("Address added!");
      onSaved(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error adding address");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Add New Address</h3>
              <p className="text-xs text-gray-400">for <span className="font-semibold text-gray-600">{company.name}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {!showMap ? (
            <button
              onClick={() => setShowMap(true)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-200 py-2 rounded-lg font-medium hover:bg-indigo-100 transition mb-2 shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pinpoint on Map
            </button>
          ) : (
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-700">Pick a location</span>
                <button onClick={() => setShowMap(false)} className="text-indigo-600 hover:underline">Cancel Map</button>
              </div>
              <MapPicker onLocationSelect={handleLocationSelect} height={250} />
            </div>
          )}

          <div className="relative">
            <input className={uiStyles.input} placeholder="Street *" value={form.street} onChange={(e) => set("street", e.target.value)} disabled={saving} autoFocus={!showMap} />
            <label className="input-label">Street <span className="text-red-400">*</span></label>
          </div>
          <div className="relative">
            <input className={uiStyles.input} placeholder="Suite / Unit" value={form.suite} onChange={(e) => set("suite", e.target.value)} disabled={saving} />
            <label className="input-label">Suite / Unit</label>
          </div>
          {/* State → City → Zip cascade */}
          <AddressFields
            state={form.state || ""}
            city={form.city || ""}
            zip={form.zip || ""}
            onChange={handleAddressChange}
            disabled={saving}
            required
          />
          <div className="relative mt-3">
            <textarea rows={2} className={uiStyles.textarea} placeholder="Directions / Notes (optional)" value={form.directions} onChange={(e) => set("directions", e.target.value)} disabled={saving} />
            <label className="input-label">Directions</label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 mt-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving..." : "Save Address"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ΓöÇΓöÇΓöÇ Stop Form ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const emptyStop = {
  selectedCompanyId: "",
  selectedAddressId: "",
  // resolved display values (sent to backend)
  companyName: "", address: "", city: "", state: "", zip: "",
};

const StopForm = ({ title, data, onChange, loading, allCompanies, setAllCompanies }) => {
  const isPickup = title.includes("Pickup");
  const accent = isPickup ? "indigo" : "amber";

  const [addresses, setAddresses]           = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);

  // Before opening a modal, blur whatever is focused so any open react-select
  // menu closes. Its menu is portalled to <body> at z-index 9999 (above the
  // modal's z-50), so a menu left open would float on top of the modal.
  const closeOpenMenus = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  const openAddCompany = () => { closeOpenMenus(); setShowAddCompany(true); };
  const openAddAddress = () => { closeOpenMenus(); setShowAddAddress(true); };

  const set = (field, value) => onChange({ ...data, [field]: value });

  // ΓöÇΓöÇ fetch addresses for selected company ΓöÇΓöÇ
  const fetchAddresses = useCallback(async (companyId) => {
    if (!companyId) { setAddresses([]); return; }
    setLoadingAddresses(true);
    try {
      const res = await api.get(`/companies/${companyId}/addresses`);
      setAddresses(res.data);
    } catch {
      toast.error("Failed to load addresses");
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses(data.selectedCompanyId);
  }, [data.selectedCompanyId, fetchAddresses]);

  // ΓöÇΓöÇ handlers ΓöÇΓöÇ
  const handleCompanyChange = (companyId) => {
    const c = allCompanies.find((c) => c._id === companyId);
    onChange({
      ...data,
      selectedCompanyId: companyId,
      selectedAddressId: "",
      companyName: c?.name || "",
      address: "", city: "", state: "", zip: "",
    });
  };

  const handleAddressChange = (addressId) => {
    const a = addresses.find((a) => a._id === addressId);
    onChange({
      ...data,
      selectedAddressId: addressId,
      address: a?.street || "",
      city:    a?.city   || "",
      state:   a?.state  || "",
      zip:     a?.zip    || "",
    });
  };

  const handleCompanySaved = (newCompany) => {
    setAllCompanies((prev) => [...prev, newCompany]);
    // Use newCompany directly - allCompanies closure is stale here.
    onChange({
      ...data,
      selectedCompanyId: newCompany._id,
      selectedAddressId: "",
      companyName: newCompany.name || "",
      address: "", city: "", state: "", zip: "",
    });
    setShowAddCompany(false);
  };

  const handleAddressSaved = (newAddress) => {
    setAddresses((prev) => [...prev, newAddress]);
    // Use newAddress directly - calling handleAddressChange here would read the
    // stale pre-update `addresses` closure and return undefined from find().
    onChange({
      ...data,
      selectedAddressId: newAddress._id,
      address: newAddress.street || "",
      city:    newAddress.city   || "",
      state:   newAddress.state  || "",
      zip:     newAddress.zip    || "",
    });
    setShowAddAddress(false);
  };

  const selectedCompanyObj = allCompanies.find((c) => c._id === data.selectedCompanyId);

  return (
    <div className="space-y-5">

      {/* ΓöÇΓöÇ Company selector ΓöÇΓöÇ */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Company</h3>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <AppSelect
              options={allCompanies.map((c) => ({ value: c._id, label: c.name }))}
              value={data.selectedCompanyId}
              onChange={handleCompanyChange}
              placeholder="Search company..."
              isDisabled={loading}
            />
            <label className="input-label">Company <span className="text-red-400">*</span></label>
          </div>

          {/* Register new company */}
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

        {/* No companies empty state */}
        {allCompanies.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
            <p className="text-sm text-gray-400 mb-2">No companies registered yet.</p>
            <button type="button" onClick={openAddCompany} className="btn-primary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Register First Company
            </button>
          </div>
        )}
      </div>

      {/* ΓöÇΓöÇ Address selector (visible once company chosen) ΓöÇΓöÇ */}
      {data.selectedCompanyId && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Address</h3>

          {loadingAddresses ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading addressesΓÇª
            </div>
          ) : addresses.length === 0 ? (
            /* No addresses yet for this company */
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">No addresses for this company</p>
                <p className="text-xs text-gray-400">Add a branch / location to continue.</p>
              </div>
              <button type="button" onClick={openAddAddress} className="shrink-0 btn-primary text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Address
              </button>
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

              {/* Add another address for this company */}
              <button
                type="button"
                onClick={openAddAddress}
                disabled={loading}
                className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Add a new address for this company"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New
              </button>
            </div>
          )}

          {/* Selected address pill */}
          {data.selectedAddressId && data.address && (
            <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-${accent}-50 border border-${accent}-100`}>
              <svg className={`w-4 h-4 text-${accent}-500 mt-0.5 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className={`text-xs text-${accent}-700 font-medium`}>
                {data.address}, {data.city}, {data.state} {data.zip}
              </p>
            </div>
          )}

          {/* Stop Details (PO#, Pieces, Weight, Dates, Times, Appointment) */}
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Stop Details</h3>
            <div className={uiStyles.grid2}>
              <div className="relative">
                <input className={uiStyles.input} placeholder="P.O. #" value={data.poNumber || ''} onChange={(e) => set('poNumber', e.target.value)} disabled={loading} />
                <label className="input-label">P.O. #</label>
              </div>
              <div className="relative">
                <input className={uiStyles.input} placeholder="Pieces" value={data.pieces || ''} onChange={(e) => set('pieces', e.target.value)} disabled={loading} />
                <label className="input-label">Pieces</label>
              </div>
            </div>

            <div className="relative mt-3">
              <input className={uiStyles.input} placeholder="Weight" value={data.weight || ''} onChange={(e) => set('weight', e.target.value)} disabled={loading} />
              <label className="input-label">Weight</label>
            </div>

            <div className={`${uiStyles.grid2} mt-3`}>
              <div className="relative">
                <input type="date" className={uiStyles.input} value={data[isPickup ? 'pickupDate' : 'deliveryDate'] ? (new Date(data[isPickup ? 'pickupDate' : 'deliveryDate']).toISOString().slice(0,10)) : ''} onChange={(e) => set(isPickup ? 'pickupDate' : 'deliveryDate', e.target.value)} disabled={loading} />
                <label className="input-label">{isPickup ? 'Pickup Date' : 'Delivery Date'}</label>
              </div>
              <div className="relative">
                <input type="time" className={uiStyles.input} value={data.fromTime || ''} onChange={(e) => set('fromTime', e.target.value)} disabled={loading} />
                <label className="input-label">From Time</label>
              </div>
            </div>

            <div className={`${uiStyles.grid2} mt-3`}>
              <div className="relative">
                <input type="time" className={uiStyles.input} value={data.toTime || ''} onChange={(e) => set('toTime', e.target.value)} disabled={loading} />
                <label className="input-label">To Time</label>
              </div>
              <div className="relative">
                <input className={uiStyles.input} placeholder="Appt. Given By" value={data.apptGivenBy || ''} onChange={(e) => set('apptGivenBy', e.target.value)} disabled={loading} />
                <label className="input-label">Appt. Given By</label>
              </div>
            </div>

            <div className="relative mt-3">
              <input className={uiStyles.input} placeholder="Appt. #" value={data.apptNumber || ''} onChange={(e) => set('apptNumber', e.target.value)} disabled={loading} />
              <label className="input-label">Appt. #</label>
            </div>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Modals ΓöÇΓöÇ */}
      {showAddCompany && (
        <AddCompanyModal onClose={() => setShowAddCompany(false)} onSaved={handleCompanySaved} />
      )}
      {showAddAddress && selectedCompanyObj && (
        <AddAddressModal
          company={selectedCompanyObj}
          onClose={() => setShowAddAddress(false)}
          onSaved={handleAddressSaved}
        />
      )}
    </div>
  );
};

// ΓöÇΓöÇΓöÇ Main Wizard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const LoadForm = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);     // for Step 1 customer dropdown
  const [allCompanies, setAllCompanies] = useState([]); // shared across both StopForms
  const [savedLoadId, setSavedLoadId] = useState(null);
  const [savedLoadLabel, setSavedLoadLabel] = useState(null);

  const [pickup, setPickup] = useState({ ...emptyStop });
  const [drop,   setDrop  ] = useState({ ...emptyStop });

  const {
    register, handleSubmit, watch, setValue, control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loadSchema),
    defaultValues: {
      customer: role === "client" ? user._id : "",
      refNo: "", deliveryType: "ROUNDED", singleType: "Pick Up",
      truckType: "", material: "", amount: "",
      lastFreeDate: "", orderBillDate: "",
      containerType: "", commodity: "",
      bookingNo: "", shippingLine: "", containerNo: "", pickupNo: "", sealNo: "",
      hazmat: false, chassisRent: false, railContainer: false, dryVan: false, reefer: false,
      accChargesEmail: "", podEmail: "", deliveryEmail: "", billingEmail: "",
      description: "", remarks: "",
      driverRequirement: "Solo Driver",
    },
  });

  const deliveryType = watch("deliveryType");

  const truckTypeOptions     = ["Container", "Flatbed", "Reefer", "Van", "Dry Van", "Open Truck", "Refrigerated", "Other"];
  const containerTypeOptions = ["40 Std", "40 HC", "45", "20"];
  const commodityOptions     = ["Chilled", "Dry", "Other", "Produce", "Frozen"];

  useEffect(() => {
    // Step 1: load customers (admin/staff only)
    if (role === "admin" || role === "staff") {
      api.get("/customers").then((res) => {
        setCustomers(res.data);
      });
    }
    // Steps 2 & 3: load companies master
    api.get("/companies").then((res) => setAllCompanies(res.data)).catch(() => {});
  }, [role, setValue]);

  // ΓöÇΓöÇ Step 1 Submit ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const onStep1Submit = async (data, status = "PENDING_VERIFICATION") => {
    setLoading(true);
    try {
      const res = await api.post("/loads", { ...data, status });
      const load = res.data.data;
      setSavedLoadId(load.loadId);
      setSavedLoadLabel(load.loadId);
      toast.success(`Load ${load.loadId} created! Now add the pickup address.`);
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error creating load");
    } finally {
      setLoading(false);
    }
  };

  const handleStep1WithStatus = (status) =>
    handleSubmit((data) => onStep1Submit(data, status));

  // ΓöÇΓöÇ Step 2 Submit ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const onStep2Submit = async () => {
    if (!pickup.selectedCompanyId) {
      toast.error("Please select a company for the pickup location");
      return;
    }
    if (!pickup.selectedAddressId) {
      toast.error("Please select an address for the pickup location");
      return;
    }
    setLoading(true);
    try {
      await api.put(`/loads/${savedLoadId}`, {
        pickup: {
          company:    pickup.companyName,
          address:    pickup.address,
          city:       pickup.city,
          state:      pickup.state,
          zip:        pickup.zip,
          poNumber:   pickup.poNumber || "",
          pieces:     pickup.pieces || "",
          weight:     pickup.weight || "",
          pickupDate: pickup.pickupDate || null,
          fromTime:   pickup.fromTime || "",
          toTime:     pickup.toTime || "",
          apptGivenBy: pickup.apptGivenBy || "",
          apptNumber: pickup.apptNumber || "",
        },
      });
      toast.success("Pickup saved! Now add the drop address.");
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error saving pickup address");
    } finally {
      setLoading(false);
    }
  };

  // ΓöÇΓöÇ Step 3 Submit ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const onStep3Submit = async () => {
    if (!drop.selectedCompanyId) {
      toast.error("Please select a company for the drop location");
      return;
    }
    if (!drop.selectedAddressId) {
      toast.error("Please select an address for the drop location");
      return;
    }
    setLoading(true);
    try {
      await api.put(`/loads/${savedLoadId}`, {
        drop: {
          company:      drop.companyName,
          address:      drop.address,
          city:         drop.city,
          state:        drop.state,
          zip:          drop.zip,
          poNumber:     drop.poNumber || "",
          pieces:       drop.pieces || "",
          weight:       drop.weight || "",
          deliveryDate: drop.deliveryDate || null,
          fromTime:     drop.fromTime || "",
          toTime:       drop.toTime || "",
          apptGivenBy:  drop.apptGivenBy || "",
          apptNumber:   drop.apptNumber || "",
        },
      });
      toast.success("Load fully created!");
      navigate(`/${role}/dashboard`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error saving drop address");
    } finally {
      setLoading(false);
    }
  };

  const inputErrorClass = `${uiStyles.input} ${uiStyles.inputError}`;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-0 md:px-4">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6">
          <h1 className="page-title px-0">Create New Load</h1>
          <p className="page-subtitle">Complete all three steps to set up your load.</p>
        </div>

        <StepIndicator step={step} savedLoadId={savedLoadLabel} />

        <div className={uiStyles.card}>

          {/* ΓöÇΓöÇ STEP 1 ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
          {step === 1 && (
            <form onSubmit={(e) => e.preventDefault()}>
              <h2 className="h4 mb-4">Load Details</h2>

              <div className={uiStyles.grid2}>
                {(role === "admin" || role === "staff") && (
                  <div className="relative">
                    <Controller
                      name="customer"
                      control={control}
                      render={({ field }) => (
                        <AppSelect
                          options={customers.map((c) => ({ value: c._id, label: `${c.customerName} (${c.email})` }))}
                          value={field.value}
                          onChange={(val) => {
                            field.onChange(val);
                            const selectedCustomer = customers.find((c) => c._id === val);
                            if (selectedCustomer && selectedCustomer.email) {
                              setValue("accChargesEmail", selectedCustomer.email);
                              setValue("podEmail", selectedCustomer.email);
                              setValue("deliveryEmail", selectedCustomer.email);
                              setValue("billingEmail", selectedCustomer.email);
                            }
                          }}
                          placeholder="Search customer..."
                          error={!!errors.customer}
                          isDisabled={loading}
                        />
                      )}
                    />
                    <label className="input-label">Customer</label>
                    {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer.message}</p>}
                  </div>
                )}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Ref #" {...register("refNo")} disabled={loading} />
                  <label className="input-label">Ref #</label>
                </div>
              </div>

              <h3 className="form-subtitle">Delivery Modality</h3>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer label">
                    <input type="radio" value="ROUNDED" {...register("deliveryType")} disabled={loading} /> Rounded Trip
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer label">
                    <input type="radio" value="SINGLE"  {...register("deliveryType")} disabled={loading} /> Single Delivery
                  </label>
                </div>
                {deliveryType === "SINGLE" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 md:ml-auto w-full md:w-auto">
                    <label className="label whitespace-nowrap !mb-0">Type:</label>
                    <select className="text-sm border-none bg-transparent focus:outline-none text-indigo-700 font-medium w-full md:w-auto" {...register("singleType")} disabled={loading}>
                      <option value="Pick Up">Pick Up</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Drop">Drop</option>
                    </select>
                  </div>
                )}
              </div>

              <h3 className="form-subtitle">Team Required</h3>
              <div className="flex items-center gap-8">
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Solo Driver" {...register("driverRequirement")} disabled={loading} /> Solo Driver
                </label>
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Team Driver"  {...register("driverRequirement")} disabled={loading} /> Team Driver
                </label>
              </div>

              <h3 className="form-subtitle">Details & Commodity</h3>
              <div className={uiStyles.grid2}>
                <div className="relative">
                  <Controller
                    name="truckType"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={truckTypeOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select truck type..."
                        error={!!errors.truckType}
                        isDisabled={loading}
                      />
                    )}
                  />
                  <label className="input-label">Truck Type <span className="text-red-400">*</span></label>
                  {errors.truckType && <p className="text-xs text-red-500 mt-1">{errors.truckType.message}</p>}
                </div>

                <div className="relative">
                  <input className={errors.material ? inputErrorClass : uiStyles.input} placeholder="e.g. Steel Coils" {...register("material")} disabled={loading} />
                  <label className="input-label">Material <span className="text-red-400">*</span></label>
                  {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material.message}</p>}
                </div>

                <div className="relative">
                  <input type="number" className={errors.amount ? inputErrorClass : uiStyles.input} placeholder="0.00" {...register("amount")} disabled={loading} />
                  <label className="input-label">Base Amount <span className="text-red-400">*</span></label>
                  {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
                </div>

                <div className="relative">
                  <input type="date" className={uiStyles.input} {...register("lastFreeDate")} disabled={loading} />
                  <label className="input-label">Last Free Date</label>
                </div>

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
                        isDisabled={loading}
                      />
                    )}
                  />
                  <label className="input-label">Container Type</label>
                </div>

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
                        isDisabled={loading}
                      />
                    )}
                  />
                  <label className="input-label">Commodity</label>
                </div>

                {[
                  { name: "bookingNo",   label: "Booking #"     },
                  { name: "orderBillDate", label: "Order Bill Date", type: "date" },
                  { name: "shippingLine", label: "Shipping Line" },
                  { name: "containerNo", label: "Container #"   },
                  { name: "pickupNo",    label: "Pickup #"      },
                  { name: "sealNo",      label: "Seal #"        },
                ].map(({ name, label, type }) => (
                  <div key={name} className="relative">
                    <input type={type || "text"} className={uiStyles.input} placeholder={type ? undefined : label} {...register(name)} disabled={loading} />
                    <label className="input-label">{label}</label>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-6 mt-4">
                {[{ name: "hazmat", label: "Hazmat" }, { name: "chassisRent", label: "Chassis Rent" }, { name: "railContainer", label: "Rail Container" }, { name: "dryVan", label: "Dry Van" }, { name: "reefer", label: "Reefer" }].map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2 label cursor-pointer">
                    <input type="checkbox" className="rounded" {...register(name)} disabled={loading} /> {label}
                  </label>
                ))}
              </div>

              <h3 className="form-subtitle">Emails</h3>
              <div className={uiStyles.grid2}>
                {[
                  { name: "accChargesEmail", label: "Accessorial Charges Email" },
                  { name: "podEmail",        label: "POD Email"                 },
                  { name: "deliveryEmail",   label: "Delivery Email"            },
                  { name: "billingEmail",    label: "Billing Email"             },
                ].map(({ name, label }) => (
                  <div key={name} className="relative">
                    <input className={errors[name] ? inputErrorClass : uiStyles.input} placeholder={label} {...register(name)} disabled={loading} />
                    <label className="input-label">{label}</label>
                    {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name].message}</p>}
                  </div>
                ))}
              </div>

              <h3 className="form-subtitle">Description & Remarks</h3>
              <div className="space-y-3">
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add description..." {...register("description")} disabled={loading} />
                  <label className="input-label">Description</label>
                </div>
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add remarks..." {...register("remarks")} disabled={loading} />
                  <label className="input-label">Remarks</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                {role === "client" && (
                  <button type="button" onClick={handleStep1WithStatus("DRAFT")} disabled={loading} className="btn-secondary disabled:opacity-50">
                    {loading ? "Saving..." : "Save as Draft"}
                  </button>
                )}
                <button type="button" onClick={handleStep1WithStatus("PENDING_VERIFICATION")} disabled={loading} className="btn-primary disabled:opacity-50">
                  {loading ? "Saving..." : (
                    <>
                      {role === "client" ? "Submit to Staff" : "Save & Continue"}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ΓöÇΓöÇ STEP 2 ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
          {step === 2 && (
            <div>
              <div className={`${uiStyles.flexBetween} mb-5`}>
                <div>
                  <h2 className="h4">Pickup / Origin</h2>
                  <p className="page-subtitle mt-0.5">
                    Load <span className="font-semibold text-indigo-600">{savedLoadLabel}</span> saved. Add the pickup company & address.
                  </p>
                </div>
                <span className="badge-green">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Load Saved
                </span>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5">
                <div className="flex items-center gap-2 text-indigo-700 text-sm font-semibold mb-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Origin / Pickup
                </div>
                <p className="text-muted text-xs">Select a company, then choose its branch address. Use the <strong>New</strong> buttons to register on the fly.</p>
              </div>

              <StopForm
                title="Pickup"
                data={pickup}
                onChange={setPickup}
                loading={loading}
                allCompanies={allCompanies}
                setAllCompanies={setAllCompanies}
              />

              <div className={`${uiStyles.flexBetween} gap-3 pt-6 border-t border-gray-200 mt-6`}>
                <button type="button" onClick={() => setStep(1)} disabled={loading} className="btn-secondary disabled:opacity-50">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button type="button" onClick={onStep2Submit} disabled={loading} className="btn-primary disabled:opacity-50">
                  {loading ? "Saving..." : (
                    <>
                      Save Pickup & Continue
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ΓöÇΓöÇ STEP 3 ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
          {step === 3 && (
            <div>
              <div className={`${uiStyles.flexBetween} mb-5`}>
                <div>
                  <h2 className="h4">Drop / Destination</h2>
                  <p className="page-subtitle mt-0.5">
                    Load <span className="font-semibold text-indigo-600">{savedLoadLabel}</span> - final step!
                  </p>
                </div>
                <span className="badge-green">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Pickup Saved
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
                <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold mb-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Destination / Drop
                </div>
                <p className="text-muted text-xs">Select the destination company and its branch address.</p>
              </div>

              <StopForm
                title="Drop"
                data={drop}
                onChange={setDrop}
                loading={loading}
                allCompanies={allCompanies}
                setAllCompanies={setAllCompanies}
              />

              <div className={`${uiStyles.flexBetween} gap-3 pt-6 border-t border-gray-200 mt-6`}>
                <button type="button" onClick={() => setStep(2)} disabled={loading} className="btn-secondary disabled:opacity-50">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button type="button" onClick={onStep3Submit} disabled={loading} className="btn-primary disabled:opacity-50 !bg-green-600 !border-green-600 hover:!bg-green-700">
                  {loading ? "Saving..." : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save & Complete Load
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LoadForm;
