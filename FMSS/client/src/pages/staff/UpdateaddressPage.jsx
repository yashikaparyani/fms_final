import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../api";
import LoadTable from "../../components/LoadTable";

const { LoadIdCell, CustomerCell, AddressCell, StatusBadge } = LoadTable;

const emptyStop = {
  company: "", address: "", city: "", state: "", zip: "",
};

// ── Stop Form Section ─────────────────────────────────────────
const StopFormSection = ({ title, loadId, data, onChange }) => {
  const ic = "w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const set = (field, value) => onChange({ ...data, [field]: value });

  return (
    <div className="mb-6">
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-4 py-2 rounded-t text-sm font-semibold">
        {title} ( Load: {loadId} )
      </div>
      <div className="border border-t-0 border-gray-300 rounded-b p-3 space-y-3 bg-white">
        {/* Company & Address */}
        {[
          { label: "Company", field: "company", placeholder: "Enter company name" },
          { label: "Address", field: "address", placeholder: "Street / Address" },
        ].map(({ label, field, placeholder }) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">{label}</label>
            <input className={ic} value={data[field]} onChange={(e) => set(field, e.target.value)} placeholder={placeholder} />
          </div>
        ))}

        {/* City / State / Zip */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">City / State / Zip</label>
          <div className="grid grid-cols-3 gap-2">
            <input className={ic} placeholder="City"  value={data.city}  onChange={(e) => set("city", e.target.value)} />
            <input className={ic} placeholder="State" value={data.state} onChange={(e) => set("state", e.target.value)} />
            <input className={ic} placeholder="Zip"   value={data.zip}   onChange={(e) => set("zip", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Update Dialog ─────────────────────────────────────────────
const UpdateAddressDialog = ({ open, onClose, load, onSuccess }) => {
  const [origin, setOrigin] = useState(emptyStop);
  const [destination, setDestination] = useState(emptyStop);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (load) {
      const p = load.pickup || {};
      const d = load.drop || {};
      setOrigin({
        company: p.company || "", address: p.address || "",
        city: p.city || "", state: p.state || "", zip: p.zip || "",
      });
      setDestination({
        company: d.company || "", address: d.address || "",
        city: d.city || "", state: d.state || "", zip: d.zip || "",
      });
    }
  }, [load]);

  const handleSave = async () => {
    if (!origin.address || !origin.city || !origin.state || !origin.zip)
      return toast.error("Please fill all origin address fields");
    if (!destination.address || !destination.city || !destination.state || !destination.zip)
      return toast.error("Please fill all destination address fields");
    try {
      setSaving(true);
      await api.put(`/loads/${load.loadId}`, {
        pickup: { 
          company: origin.company,
          address: origin.address,
          city: origin.city,
          state: origin.state,
          zip: origin.zip,
        },
        drop: { 
          company: destination.company,
          address: destination.address,
          city: destination.city,
          state: destination.state,
          zip: destination.zip,
        },
      });
      toast.success(`Address updated for ${load.loadId}`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !load) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center z-50 overflow-y-auto py-4 px-3">
      <div className="bg-gray-50 rounded-xl w-full max-w-2xl shadow-xl mx-auto my-4 h-fit">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white rounded-t-xl">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Add Origin &amp; Destination</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Load: <span className="font-semibold text-indigo-600">{load.loadId}</span>
              {load.customerName && <> — {load.customerName}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1">✕</button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 overflow-y-auto">
          <StopFormSection title="New Origin"      loadId={load.loadId} data={origin}      onChange={setOrigin} />
          <StopFormSection title="New Destination" loadId={load.loadId} data={destination} onChange={setDestination} />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-white rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 hover:bg-gray-100 rounded transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded transition">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Mobile Card ───────────────────────────────────────────────
const MobileAddressCard = ({ row, onEdit }) => {
  const isUpdated = row.adressAdded;

  return (
    <div style={{
      boxSizing: "border-box",
      width: "100%",
      backgroundColor: isUpdated ? "#edf9ee" : "#fffbeb",
      border: `1px solid ${isUpdated ? "#b5e8b7" : "#fde68a"}`,
      borderLeft: `4px solid ${isUpdated ? "#b5e8b7" : "#fcd34d"}`,
      borderRadius: "10px",
      padding: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#111827", margin: 0 }}>{row.loadId}</p>
          <p style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.customerName || "—"}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <span style={{
            backgroundColor: isUpdated ? "#dcfce7" : "#fef3c7",
            color: isUpdated ? "#166534" : "#92400e",
            fontSize: "11px", fontWeight: 700,
            padding: "3px 9px", borderRadius: "6px", whiteSpace: "nowrap",
          }}>
            {isUpdated ? "✓ Updated" : "⏳ Pending"}
          </span>
          <span style={{
            fontSize: "10px", fontWeight: 600, color: "#6b7280",
            backgroundColor: "#f3f4f6", padding: "2px 7px", borderRadius: "4px",
          }}>
            {row.status || "—"}
          </span>
        </div>
      </div>

      {/* Pickup / Drop */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {[
          { label: "Pickup", data: row.pickup },
          { label: "Drop",   data: row.drop },
        ].map(({ label, data }) => (
          <div key={label} style={{ minWidth: 0 }}>
            <p style={{ fontSize: "10px", color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            <p style={{ fontSize: "12px", color: "#111827", fontWeight: 500, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data?.company || data?.address || "—"}
            </p>
            <p style={{ fontSize: "11px", color: "#6b7280", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[data?.city, data?.state].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
        ))}
      </div>

      {/* Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        {[
          { label: "Load Type", value: row.truckType },
          { label: "Created",    value: row.createdAt
              ? new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : null },
        ].map(({ label, value }) =>
          value ? (
            <div key={label} style={{ minWidth: 0 }}>
              <p style={{ fontSize: "10px", color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
              <p style={{ fontSize: "12px", color: "#111827", fontWeight: 500, margin: "1px 0 0" }}>{value}</p>
            </div>
          ) : null
        )}
      </div>

      {/* Action */}
      <button
        onClick={onEdit}
        style={{
          boxSizing: "border-box",
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          padding: "8px 0", borderRadius: "7px",
          border: "none", backgroundColor: "#2563eb", color: "#fff",
          fontSize: "12px", fontWeight: 600, cursor: "pointer",
        }}
      >
        <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Edit Location
      </button>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────
const UpdateAddressPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const res = await api.get("/loads");
      setRows([...res.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch {
      toast.error("Failed to fetch loads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLoads(); }, []);

  const handleOpenDialog = (load) => { setSelectedLoad(load); setDialogOpen(true); };

  const columns = [
    { key: "load",          header: "Load",           width: "130px", render: (row) => <LoadIdCell load={row} /> },
    { key: "customer",      header: "Customer",        width: "150px", render: (row) => <CustomerCell load={row} /> },
    { key: "pickup",        header: "Pickup",                          render: (row) => <AddressCell data={row.pickup} /> },
    { key: "drop",          header: "Drop",                            render: (row) => <AddressCell data={row.drop} /> },
    { key: "truckType",     header: "Load Type",      width: "110px", render: (row) => <span className="text-xs text-gray-700">{row.truckType || "—"}</span> },
    { key: "status",        header: "Load Status",     width: "140px", render: (row) => <StatusBadge value={row.status} /> },
    {
      key: "addressStatus", header: "Address Status",  width: "110px",
      render: (row) => row.adressAdded ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-800 border border-green-300">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
          Updated
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
          Pending
        </span>
      ),
    },
    { key: "created", header: "Created", width: "100px", render: (row) => (
      <span className="text-xs text-gray-600">
        {row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
      </span>
    )},
  ];

  const actions = (row) => (
    <button onClick={() => handleOpenDialog(row)} className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Edit Location
    </button>
  );

  return (
    <div className="w-full max-w-full overflow-hidden p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Update Address</h2>
        <p className="text-sm text-gray-500">Manage pickup and drop addresses for all loads. Sorted newest first.</p>
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden w-full space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : rows.length > 0 ? (
          rows.map((row) => (
            <MobileAddressCard key={row.loadId} row={row} onEdit={() => handleOpenDialog(row)} />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No loads found.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={rows} columns={columns} actions={actions}
          colorBy="status" loading={loading} emptyMessage="No loads found."
        />
      </div>

      <UpdateAddressDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        load={selectedLoad}
        onSuccess={fetchLoads}
      />
    </div>
  );
};

export default UpdateAddressPage;
