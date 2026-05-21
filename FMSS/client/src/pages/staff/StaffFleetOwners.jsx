import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { notify } from "../../utils/swal";
import Swal from "sweetalert2";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import { uiStyles } from "../../style/uiStyles";

const StaffFleetOwners = () => {
  const [fleetOwners, setFleetOwners] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingCredentials, setSendingCredentials] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFleetOwners();
  }, []);

  const fetchFleetOwners = async () => {
    try {
      const res = await api.get("/fleet-owners");
      setFleetOwners(res.data);
    } catch {
      notify.error("Failed to fetch fleet owners");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: "Delete Fleet Owner?",
      html: `Are you sure you want to delete <strong>${name}</strong>? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      try {
        await api.delete(`/fleet-owners/${id}`);
        notify.success("Deleted successfully");
        fetchFleetOwners();
      } catch {
        notify.error("Delete failed");
      }
    }
  };

  const handleSendCredentials = async (id) => {
    setSendingCredentials(id);
    try {
      const res = await api.post(`/fleet-owners/${id}/send-credentials`, {
        channel: "email",
      });
      notify.success(res.data.message || `Credentials processed for ${res.data.email}`);
    } catch {
      notify.error("Failed to send");
    } finally {
      setSendingCredentials(null);
    }
  };

  const handleShareWhatsApp = async (id) => {
    setSendingCredentials(id);
    try {
      const res = await api.post(`/fleet-owners/${id}/send-credentials`, {
        channel: "whatsapp",
      });
      const message = `Login: ${window.location.origin}/vendor-login\nEmail: ${res.data.email}\nPassword: ${res.data.password}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } catch {
      notify.error("Failed to share");
    } finally {
      setSendingCredentials(null);
    }
  };

  const filtered = fleetOwners.filter(
    (f) =>
      f.carrierName?.toLowerCase().includes(search.toLowerCase()) ||
      f.city?.toLowerCase().includes(search.toLowerCase()) ||
      f.phone?.includes(search)
  );

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "carrier",
      header: "Carrier",
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.carrierName}</p>
          {row.mcLicense && <p className="text-xs text-indigo-600">MC: {row.mcLicense}</p>}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <div className="text-xs">
          <p>{row.phone || "-"}</p>
          {row.email && <p className="text-gray-500">{row.email}</p>}
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (row) => (
        <div className="text-xs text-gray-600">
          <p>{row.city}, {row.state}</p>
        </div>
      ),
    },
  ];

  const desktopActions = (row) => (
    <div className="flex gap-2">
      <button onClick={() => handleSendCredentials(row._id)} className="btn-secondary p-1 text-white bg-blue-600 border-blue-600"><EmailIcon fontSize="small" /></button>
      <button onClick={() => handleShareWhatsApp(row._id)} className="btn-secondary p-1 text-white bg-green-600 border-green-600"><WhatsAppIcon fontSize="small" /></button>
      <button onClick={() => navigate(`/staff/fleet-owners/${row._id}/edit`)} className="btn-secondary p-1 text-white bg-cyan-600 border-cyan-600"><EditIcon fontSize="small" /></button>
      <button onClick={() => handleDelete(row._id, row.carrierName)} className="btn-delete p-1"><DeleteIcon fontSize="small" /></button>
    </div>
  );

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search fleet owners..."
            className={uiStyles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={() => navigate("/staff/create-fleet-owner")} className="btn-primary whitespace-nowrap">
            + New Fleet Owner
          </button>
        </div>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : filtered.length > 0 ? (
          filtered.map((f) => {
            const isActive = f.isActive !== false;
            return (
              <MobileCard
                key={f._id}
                statusKey={isActive ? "active" : "inactive"}
                title={f.carrierName}
                subtitle={f.mcLicense ? `MC: ${f.mcLicense}` : undefined}
                badge={{ label: isActive ? "Active" : "Inactive" }}
                fields={[
                  { label: "City",  value: f.city },
                  { label: "State", value: f.state },
                  { label: "Phone", value: f.phone },
                  { label: "Email", value: f.email, fullWidth: true },
                ]}
                actions={[
                  { icon: <EmailIcon style={{ fontSize: 18 }} />,    color: "#2563eb", onClick: () => handleSendCredentials(f._id), disabled: sendingCredentials === f._id },
                  { icon: <WhatsAppIcon style={{ fontSize: 18 }} />, color: "#16a34a", onClick: () => handleShareWhatsApp(f._id),  disabled: sendingCredentials === f._id },
                  { icon: <EditIcon style={{ fontSize: 18 }} />,     color: "#0891b2", onClick: () => navigate(`/staff/fleet-owners/${f._id}/edit`) },
                  { icon: <DeleteIcon style={{ fontSize: 18 }} />,   color: "#dc2626", onClick: () => handleDelete(f._id, f.carrierName) },
                ]}
              />
            );
          })
        ) : (
          <p className="text-center text-gray-500 py-10">No fleet owners found</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={filtered}
          columns={columns}
          actions={desktopActions}
          loading={loading}
          emptyMessage="No fleet owners found."
        />
      </div>
    </div>
  );
};

export default StaffFleetOwners;
