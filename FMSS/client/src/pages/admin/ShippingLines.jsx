import { useEffect, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Swal from "sweetalert2";
import { notify } from "../../utils/swal";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import { uiStyles } from "../../style/uiStyles";

const emptyForm = { name: "", code: "", isActive: true };

// ─── Add / Edit modal ────────────────────────────────────────────────────────
const ShippingLineModal = ({ isShow, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Re-seed the fields every time the modal is opened for a different row.
  useEffect(() => {
    if (isShow) setForm(initial ? { ...initial } : emptyForm);
  }, [isShow, initial]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      notify.error("Shipping line name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        isActive: form.isActive,
      };

      if (initial?._id) {
        await api.put(`/shipping-lines/${initial._id}`, payload);
        notify.success("Shipping line updated");
      } else {
        await api.post("/shipping-lines", payload);
        notify.success("Shipping line added");
      }

      onSaved();
      onClose();
    } catch (err) {
      notify.error(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!isShow) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-5 rounded-xl w-[420px] max-w-[95vw] space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg">
            {initial?._id ? "Edit Shipping Line" : "Add Shipping Line"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            ✖
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={uiStyles.label}>
              Name <span className="text-red-500">*</span>
            </label>
            <input
              className={uiStyles.input}
              placeholder="e.g. Maersk"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={saving}
            />
          </div>

          <div>
            <label className={uiStyles.label}>Code</label>
            <input
              className={uiStyles.input}
              placeholder="e.g. MAEU"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={saving}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              disabled={saving}
            />
            Active (show in the load form dropdown)
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 transition text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

// ─── Main page ───────────────────────────────────────────────────────────────
const ShippingLines = () => {
  const [shippingLines, setShippingLines] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetchShippingLines();
  }, []);

  const fetchShippingLines = async () => {
    try {
      const res = await api.get("/shipping-lines");
      setShippingLines(res.data);
    } catch {
      notify.error("Failed to fetch shipping lines");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setShowModal(true);
  };

  const handleDelete = async (row) => {
    const result = await Swal.fire({
      title: "Delete Shipping Line?",
      html: `Remove <strong>${row.name}</strong> from the master? Existing loads keep their value, but it will no longer be selectable.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete(`/shipping-lines/${row._id}`);
      notify.success("Shipping line deleted");
      fetchShippingLines();
    } catch (err) {
      notify.error(err.response?.data?.message || "Delete failed");
    }
  };

  const filtered = shippingLines.filter(
    (l) =>
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.code?.toLowerCase().includes(search.toLowerCase()),
  );

  const columns = [
    {
      key: "name",
      header: "Shipping Line",
      render: (row) => <p className="font-medium text-sm">{row.name}</p>,
    },
    {
      key: "code",
      header: "Code",
      render: (row) => (
        <p className="text-xs text-gray-600">{row.code || "—"}</p>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (row) => (
        <span
          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
            row.isActive
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {row.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  const desktopActions = (row) => (
    <div className="flex gap-2">
      <button
        onClick={() => openEdit(row)}
        className="btn-secondary p-1 text-white bg-cyan-600 border-cyan-600"
      >
        <EditIcon fontSize="small" />
      </button>
      <button
        onClick={() => handleDelete(row)}
        className="btn-delete p-1 text-white bg-red-600 border-red-600"
      >
        <DeleteIcon fontSize="small" />
      </button>
    </div>
  );

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search shipping lines..."
            className={uiStyles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={openAdd} className="btn-primary whitespace-nowrap">
            + New Shipping Line
          </button>
        </div>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : filtered.length > 0 ? (
          filtered.map((line) => (
            <div
              key={line._id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{line.name}</p>
                <p className="text-xs text-gray-500">{line.code || "—"}</p>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                    line.isActive
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {line.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEdit(line)}
                  className="btn-secondary p-1 text-white bg-cyan-600 border-cyan-600"
                >
                  <EditIcon fontSize="small" />
                </button>
                <button
                  onClick={() => handleDelete(line)}
                  className="btn-delete p-1 text-white bg-red-600 border-red-600"
                >
                  <DeleteIcon fontSize="small" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">
            No shipping lines found
          </p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={filtered}
          columns={columns}
          actions={desktopActions}
          loading={loading}
          emptyMessage="No shipping lines yet. Click “+ New Shipping Line” to add one."
        />
      </div>

      <ShippingLineModal
        isShow={showModal}
        initial={editing}
        onClose={() => setShowModal(false)}
        onSaved={fetchShippingLines}
      />
    </div>
  );
};

export default ShippingLines;
