import { useEffect, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Swal from "sweetalert2";
import { notify } from "../../utils/swal";
import api from "../../api";
import LoadTable from "../LoadTable";
import { uiStyles } from "../../style/uiStyles";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

// ─── Reusable admin master page ──────────────────────────────────────────────
// Shipping lines, delivery partners and chassis companies are the same master
// shape: a unique name plus a few optional text fields and an active flag,
// managed through identical add/edit/delete screens. This component holds that
// screen once; each master supplies only its labels, endpoint and fields.
//
// A `field` is { name, label, placeholder?, required?, type? }. `name` is
// always rendered first and is always required, so it must not be listed.
// ─────────────────────────────────────────────────────────────────────────────

const buildEmptyForm = (fields) => ({
  name: "",
  ...Object.fromEntries(fields.map((f) => [f.name, ""])),
  isActive: true,
});

const MasterModal = ({ isShow, initial, onClose, onSaved, config }) => {
  const { singular, endpoint, fields, namePlaceholder } = config;
  const [form, setForm] = useState(() => buildEmptyForm(fields));
  const [saving, setSaving] = useState(false);

  // Re-seed the fields every time the modal is opened for a different row.
  useEffect(() => {
    if (!isShow) return;
    const empty = buildEmptyForm(fields);
    setForm(initial ? { ...empty, ...initial } : empty);
  }, [isShow, initial, fields]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      notify.error(`${singular} name is required`);
      return;
    }

    const missing = fields.find((f) => f.required && !String(form[f.name] || "").trim());
    if (missing) {
      notify.error(`${missing.label} is required`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        isActive: form.isActive,
        ...Object.fromEntries(
          fields.map((f) => [f.name, String(form[f.name] || "").trim()]),
        ),
      };

      if (initial?._id) {
        await api.put(`${endpoint}/${initial._id}`, payload);
        notify.success(`${singular} updated`);
      } else {
        await api.post(endpoint, payload);
        notify.success(`${singular} added`);
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
            {initial?._id ? `Edit ${singular}` : `Add ${singular}`}
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
              placeholder={namePlaceholder}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={saving}
            />
          </div>

          {fields.map((field) => (
            <div key={field.name}>
              <label className={uiStyles.label}>
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>
              <input
                className={uiStyles.input}
                type={field.type || "text"}
                placeholder={field.placeholder || ""}
                value={form[field.name] || ""}
                onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                disabled={saving}
              />
              {field.hint && (
                <p className="text-[11px] text-gray-500 mt-1">{field.hint}</p>
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              disabled={saving}
            />
            Active (show in the dropdown)
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

const StatusPill = ({ active }) => (
  <span
    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
      active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
    }`}
  >
    {active ? "Active" : "Inactive"}
  </span>
);

const MasterCrudPage = ({ config }) => {
  const { singular, plural, endpoint, fields } = config;
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetchRows();
    // Each master page mounts against a fixed endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  // `silent` keeps the background refresh from toasting on a blip or touching
  // the spinner.
  const fetchRows = async ({ silent = false } = {}) => {
    try {
      const res = await api.get(endpoint);
      setRows(res.data);
    } catch {
      if (!silent) notify.error(`Failed to fetch ${plural.toLowerCase()}`);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Paused while the add/edit modal is open so the row behind it cannot change
  // under the form.
  useAutoRefresh(() => fetchRows({ silent: true }), { enabled: !showModal });

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
      title: `Delete ${singular}?`,
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
      await api.delete(`${endpoint}/${row._id}`);
      notify.success(`${singular} deleted`);
      fetchRows();
    } catch (err) {
      notify.error(err.response?.data?.message || "Delete failed");
    }
  };

  const term = search.toLowerCase();
  const filtered = rows.filter((row) =>
    [row.name, ...fields.map((f) => row[f.name])].some((value) =>
      String(value || "").toLowerCase().includes(term),
    ),
  );

  const columns = [
    {
      key: "name",
      header: singular,
      render: (row) => <p className="font-medium text-sm">{row.name}</p>,
    },
    ...fields.map((field) => ({
      key: field.name,
      header: field.label,
      render: (row) => (
        <p className="text-xs text-gray-600">{row[field.name] || "—"}</p>
      ),
    })),
    {
      key: "isActive",
      header: "Status",
      render: (row) => <StatusPill active={row.isActive} />,
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
            placeholder={`Search ${plural.toLowerCase()}...`}
            className={uiStyles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={openAdd} className="btn-primary whitespace-nowrap">
            + New {singular}
          </button>
        </div>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : filtered.length > 0 ? (
          filtered.map((row) => (
            <div
              key={row._id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{row.name}</p>
                {fields.map((field) => (
                  <p key={field.name} className="text-xs text-gray-500 truncate">
                    {row[field.name] || "—"}
                  </p>
                ))}
                <span className="inline-block mt-1">
                  <StatusPill active={row.isActive} />
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
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
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">
            No {plural.toLowerCase()} found
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
          emptyMessage={`No ${plural.toLowerCase()} yet. Click “+ New ${singular}” to add one.`}
        />
      </div>

      <MasterModal
        isShow={showModal}
        initial={editing}
        onClose={() => setShowModal(false)}
        onSaved={fetchRows}
        config={config}
      />
    </div>
  );
};

export default MasterCrudPage;
