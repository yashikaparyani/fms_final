import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import BlockIcon from "@mui/icons-material/Block";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import Swal from "sweetalert2";

// ─── Operating locations ──────────────────────────────────────────────────────
// Admin-only. Each location is an independent set of loads, customers, carriers
// and reference data — adding one here is what creates a new operating site.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK = {
  name: "",
  code: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
};

const Locations = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchBranches = async () => {
    try {
      const { data } = await api.get("/branches");
      setBranches(data);
    } catch (err) {
      notify.error(err.response?.data?.message || "Failed to load locations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/branches", form);
      notify.success(`${form.name} created.`);
      setForm(BLANK);
      setShowForm(false);
      fetchBranches();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not create the location");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (branch) => {
    const { isConfirmed } = await Swal.fire({
      title: `Deactivate ${branch.name}?`,
      html:
        `Its ${branch.loadCount} load(s) stay in the system and remain readable — ` +
        `the location simply stops accepting new work and disappears from the switcher.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Deactivate",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      await api.delete(`/branches/${branch._id}`);
      notify.success(`${branch.name} deactivated.`);
      fetchBranches();
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not deactivate");
    }
  };

  const columns = [
    {
      key: "code",
      header: "Code",
      width: "90px",
      render: (row) => (
        <span className="text-xs font-mono font-bold text-indigo-700">{row.code}</span>
      ),
    },
    {
      key: "name",
      header: "Location",
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.name}</p>
          {(row.city || row.state) && (
            <p className="text-xs text-gray-500">
              {[row.city, row.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <div className="text-xs text-gray-600">
          <p>{row.phone || "—"}</p>
          {row.email && <p className="text-gray-500">{row.email}</p>}
        </div>
      ),
    },
    {
      key: "loads",
      header: "Loads",
      width: "80px",
      render: (row) => (
        <span className="text-xs font-semibold tabular-nums">{row.loadCount}</span>
      ),
    },
    {
      key: "users",
      header: "Users",
      width: "80px",
      render: (row) => (
        <span className="text-xs font-semibold tabular-nums">{row.userCount}</span>
      ),
    },
    {
      key: "active",
      header: "Status",
      width: "90px",
      render: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            row.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
          }`}
        >
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  const actions = (row) =>
    row.active ? (
      <button onClick={() => deactivate(row)} className="btn-delete p-1" title="Deactivate">
        <BlockIcon fontSize="small" />
      </button>
    ) : null;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Locations</h1>
          <p className="page-subtitle">
            Each location keeps its own loads, customers and carriers. Staff only
            see the locations they are assigned to.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary whitespace-nowrap">
          <AddIcon fontSize="small" /> {showForm ? "Cancel" : "New Location"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className={uiStyles.card}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Name *</label>
              <input
                className={uiStyles.input}
                value={form.name}
                onChange={set("name")}
                placeholder="New York"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Code *</label>
              <input
                className={uiStyles.input}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="NY"
                maxLength={5}
                required
              />
              <p className="text-[11px] text-gray-500 mt-1">
                2–5 letters/numbers. Goes into every ID this location issues
                (NY-LD-0001) and cannot be changed once loads exist.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Phone</label>
              <input className={uiStyles.input} value={form.phone} onChange={set("phone")} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Address</label>
              <input className={uiStyles.input} value={form.address} onChange={set("address")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Email</label>
              <input className={uiStyles.input} value={form.email} onChange={set("email")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">City</label>
              <input className={uiStyles.input} value={form.city} onChange={set("city")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">State</label>
              <input className={uiStyles.input} value={form.state} onChange={set("state")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">ZIP</label>
              <input className={uiStyles.input} value={form.zip} onChange={set("zip")} />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create Location"}
            </button>
          </div>
        </form>
      )}

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {branches.map((b) => (
          <MobileCard
            key={b._id}
            statusKey={b.active ? "active" : "inactive"}
            title={b.name}
            subtitle={b.code}
            badge={{ label: b.active ? "Active" : "Inactive" }}
            fields={[
              { label: "City", value: b.city },
              { label: "State", value: b.state },
              { label: "Loads", value: String(b.loadCount) },
              { label: "Users", value: String(b.userCount) },
            ]}
            actions={
              b.active
                ? [
                    {
                      icon: <BlockIcon style={{ fontSize: 18 }} />,
                      color: "#dc2626",
                      onClick: () => deactivate(b),
                    },
                  ]
                : []
            }
          />
        ))}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={branches}
          columns={columns}
          actions={actions}
          loading={loading}
          emptyMessage="No locations yet. Create one to get started."
        />
      </div>
    </div>
  );
};

export default Locations;
