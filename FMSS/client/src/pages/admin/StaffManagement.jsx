import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AddIcon from "@mui/icons-material/Add";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EmailIcon from "@mui/icons-material/Email";
import DeleteIcon from "@mui/icons-material/Delete";
import TuneIcon from "@mui/icons-material/Tune";
import PlaceIcon from "@mui/icons-material/Place";
import Swal from "sweetalert2";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import BulkEntryTable from "../../components/BulkEntryTable";
import CredentialsPanel from "../../components/CredentialsPanel";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";

// ─── Staff ────────────────────────────────────────────────────────────────────
// Admin-only. Adding people to the system, one at a time or a whole team at
// once: opening a branch means eight or ten accounts, and doing that through a
// single-record form is how half of them end up on the wrong location.
//
// Everyone added here shares the location set and the permission template chosen
// at the top of the form, which is the normal case — a team hired for one branch
// does the same job. Fine-grained differences are then made per person on the
// Permissions screen, so this form stays quick.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_ROW = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "staff",
};

const COLUMNS = [
  { key: "firstName", label: "First name", placeholder: "Priya", width: "150px" },
  { key: "lastName", label: "Last name", placeholder: "Sharma", width: "150px" },
  {
    key: "email",
    label: "Email",
    placeholder: "priya@company.com",
    required: true,
    width: "230px",
  },
  { key: "phone", label: "Phone", placeholder: "+1 555 0100", width: "150px" },
  {
    key: "role",
    label: "Role",
    type: "select",
    width: "120px",
    options: [
      { value: "staff", label: "Staff" },
      { value: "admin", label: "Admin" },
    ],
  },
];

const StaffManagement = () => {
  const navigate = useNavigate();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [rows, setRows] = useState([{ ...BLANK_ROW }]);
  const [rowErrors, setRowErrors] = useState({});
  const [locationIds, setLocationIds] = useState([]);
  const [defaultLocation, setDefaultLocation] = useState("");
  const [template, setTemplate] = useState("dispatcher");
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reference data
  const [locations, setLocations] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [issued, setIssued] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const fetchStaff = async ({ silent = false } = {}) => {
    try {
      const { data } = await api.get("/staff", {
        params: showInactive ? { includeInactive: true } : {},
      });
      setStaff(data);
    } catch (err) {
      if (!silent)
        notify.error(err.response?.data?.message || "Failed to load staff");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  useEffect(() => {
    api
      .get("/staff/permission-catalog")
      .then(({ data }) => {
        setLocations(data.locations || []);
        setTemplates(data.templates || []);
      })
      .catch(() => {
        notify.error("Could not load locations and permission templates");
      });
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.key === template),
    [templates, template],
  );

  const toggleLocation = (id) => {
    setLocationIds((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];

      // The default has to stay inside the set, or it means nothing — see
      // resolveDefaultLocation on the server.
      if (!next.includes(defaultLocation)) setDefaultLocation(next[0] || "");
      return next;
    });
  };

  const resetForm = () => {
    setRows([{ ...BLANK_ROW }]);
    setRowErrors({});
    setLocationIds([]);
    setDefaultLocation("");
    setTemplate("dispatcher");
  };

  /**
   * Keep only the rows the server rejected, each tagged with its own reason.
   *
   * Rows are reported on individually: the good ones are created and the
   * failures come back addressed, so the form keeps only what still needs
   * fixing instead of making the admin retype everything.
   */
  const applyRowFailures = (data, submitted) => {
    const errors = {};
    const failedRows = [];

    (data.failed || []).forEach((failure) => {
      errors[failedRows.length] = failure.message;
      failedRows.push(submitted[failure.index] || { ...BLANK_ROW });
    });

    if (!failedRows.length) return;

    setRows(failedRows);
    setRowErrors(errors);
  };

  const submit = async (event) => {
    event.preventDefault();

    const filled = rows.filter((row) => String(row.email || "").trim());

    if (!filled.length) {
      notify.warning("Enter an email address for at least one person.");
      return;
    }

    if (!locationIds.length) {
      // Refused rather than defaulted: an account with no location cannot load a
      // single screen (see NO_LOCATION in middleware/location.js), and creating
      // ten of those silently is worse than asking.
      notify.warning(
        "Choose at least one location — staff with no location cannot use the system.",
      );
      return;
    }

    try {
      setSaving(true);
      setRowErrors({});

      const { data } = await api.post("/staff/bulk", {
        members: filled,
        locations: locationIds,
        defaultLocation: defaultLocation || locationIds[0],
        template,
        channel: sendEmail ? "email" : "manual",
      });

      if (data.failedCount) {
        applyRowFailures(data, filled);
        notify.warning(data.message);
      } else {
        resetForm();
        setShowForm(false);
        notify.success(data.message);
      }

      const credentials = (data.created || [])
        .filter((c) => c.password)
        .map((c) => ({
          name: [c.staff.firstName, c.staff.lastName].filter(Boolean).join(" "),
          email: c.staff.email,
          password: c.password,
          emailStatus: c.emailStatus,
        }));

      if (credentials.length) setIssued(credentials);

      fetchStaff({ silent: true });
    } catch (err) {
      // When every row fails the server answers 400, so axios throws and we land
      // here rather than in the branch above — but the body still addresses each
      // row. Without this, the one case where the admin most needs the reasons
      // ("none of the rows could be created") is the one case that hides them.
      const data = err.response?.data;
      if (data?.failedCount) applyRowFailures(data, filled);

      notify.error(data?.message || "Could not add staff");
    } finally {
      setSaving(false);
    }
  };

  const resendCredentials = async (member) => {
    const { isConfirmed } = await Swal.fire({
      title: `Issue a new password for ${member.email}?`,
      text: "Their current password stops working immediately.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Issue new password",
      confirmButtonColor: "#4f46e5",
    });
    if (!isConfirmed) return;

    try {
      setBusyId(member._id);
      const { data } = await api.post(`/staff/${member._id}/send-credentials`, {
        channel: "email",
      });
      setIssued([
        {
          name: [member.firstName, member.lastName].filter(Boolean).join(" "),
          email: data.email,
          password: data.password,
          emailStatus: data.emailStatus,
        },
      ]);
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not issue credentials");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (member) => {
    try {
      setBusyId(member._id);
      await api.put(`/staff/${member._id}`, { isActive: !member.isActive });
      notify.success(
        `${member.email} ${member.isActive ? "deactivated" : "reactivated"}.`,
      );
      fetchStaff({ silent: true });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update the account");
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member) => {
    const { isConfirmed } = await Swal.fire({
      title: `Remove ${member.email}?`,
      html:
        "They lose access immediately and their permissions and locations are cleared. " +
        "The work they created stays in the system with their name on it.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      setBusyId(member._id);
      await api.delete(`/staff/${member._id}`);
      notify.success(`${member.email} removed.`);
      fetchStaff({ silent: true });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not remove the account");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = staff.filter((member) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [member.firstName, member.lastName, member.email, member.phone]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(needle));
  });

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div>
          <p className="font-medium text-sm">
            {[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}
          </p>
          <p className="text-xs text-indigo-600">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      width: "90px",
      render: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            row.role === "admin"
              ? "bg-purple-100 text-purple-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {row.role === "admin" ? "ADMIN" : "STAFF"}
        </span>
      ),
    },
    {
      key: "locations",
      header: "Locations",
      render: (row) =>
        row.role === "admin" ? (
          <span className="text-xs text-gray-500 italic">All locations</span>
        ) : row.locations.length ? (
          <div className="flex flex-wrap gap-1">
            {row.locations.map((loc) => (
              <span
                key={loc._id}
                className="text-[10px] font-mono font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded"
                title={loc.name}
              >
                {loc.code || loc.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-red-600 font-medium">None assigned</span>
        ),
    },
    {
      key: "permissions",
      header: "Modules",
      width: "110px",
      render: (row) =>
        row.role === "admin" ? (
          <span className="text-xs text-gray-500 italic">Everything</span>
        ) : (
          <span
            className={`text-xs font-semibold tabular-nums ${
              row.permissions.length ? "text-gray-700" : "text-red-600"
            }`}
          >
            {row.permissions.length} granted
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      render: (row) => (
        <div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              row.isActive
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {row.isActive ? "Active" : "Inactive"}
          </span>
          <p className="text-[10px] text-gray-400 mt-1">
            {row.lastLogin
              ? `Seen ${LoadTable.fmtDate(row.lastLogin)}`
              : "Never signed in"}
          </p>
        </div>
      ),
    },
  ];

  const actions = (row) => (
    <div className="flex gap-1">
      <button
        onClick={() => navigate("/admin/permissions")}
        title="Edit access"
        className="btn-secondary p-1 text-white bg-slate-600 border-slate-600"
      >
        <TuneIcon fontSize="small" />
      </button>
      <button
        onClick={() => resendCredentials(row)}
        disabled={busyId === row._id}
        title="Issue a new password"
        className="btn-secondary p-1 text-white bg-blue-600 border-blue-600 disabled:opacity-50"
      >
        <EmailIcon fontSize="small" />
      </button>
      <button
        onClick={() => toggleActive(row)}
        disabled={busyId === row._id}
        title={row.isActive ? "Deactivate" : "Reactivate"}
        className={`btn-secondary p-1 text-white disabled:opacity-50 ${
          row.isActive
            ? "bg-amber-600 border-amber-600"
            : "bg-green-600 border-green-600"
        }`}
      >
        {row.isActive ? "Off" : "On"}
      </button>
      <button
        onClick={() => removeMember(row)}
        disabled={busyId === row._id}
        title="Remove"
        className="btn-delete p-1 text-white bg-red-600 border-red-600 disabled:opacity-50"
      >
        <DeleteIcon fontSize="small" />
      </button>
    </div>
  );

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-subtitle">
            Add back-office accounts and issue their credentials. What each of
            them can reach is set on the Permissions screen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/admin/permissions")}
            className="btn-secondary whitespace-nowrap"
          >
            <TuneIcon fontSize="small" /> Permissions
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary whitespace-nowrap"
          >
            <GroupAddIcon fontSize="small" />{" "}
            {showForm ? "Cancel" : "Add Staff"}
          </button>
        </div>
      </div>

      {issued.length > 0 && (
        <CredentialsPanel
          entries={issued}
          loginUrl={`${window.location.origin}/staff-login`}
          onDismiss={() => setIssued([])}
        />
      )}

      {showForm && (
        <form onSubmit={submit} className={uiStyles.card}>
          {/* ── Shared settings ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-5 mb-5 border-b border-gray-200">
            <div>
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                <PlaceIcon style={{ fontSize: 15 }} /> Locations they may work in
                <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                Everyone added below gets these. A staff member only ever sees the
                loads, customers and carriers of the locations ticked here.
              </p>

              {locations.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  No active locations yet — create one first.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {locations.map((loc) => (
                    <label
                      key={loc._id}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={locationIds.includes(loc._id)}
                        onChange={() => toggleLocation(loc._id)}
                      />
                      <span className="text-sm text-gray-800">{loc.name}</span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {loc.code}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {locationIds.length > 1 && (
                <div className="mt-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Opens on sign-in
                  </label>
                  <select
                    className={uiStyles.select}
                    value={defaultLocation}
                    onChange={(e) => setDefaultLocation(e.target.value)}
                  >
                    {locationIds.map((id) => {
                      const loc = locations.find((l) => l._id === id);
                      return (
                        <option key={id} value={id}>
                          {loc?.name || id}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">
                Starting permissions
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                A starting point, not a fixed role — adjust any individual
                afterwards on the Permissions screen.
              </p>
              <select
                className={uiStyles.select}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
                <option value="">Nothing — grant access later</option>
              </select>

              {selectedTemplate && (
                <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                  <p>{selectedTemplate.description}</p>
                  <p className="mt-1 text-gray-500">
                    {selectedTemplate.permissions.length} permissions
                  </p>
                </div>
              )}

              <label className="flex items-start gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                <span className="text-xs text-gray-700">
                  Email each person their password
                  <span className="block text-gray-500">
                    Untick to hand the passwords over yourself — they are shown on
                    screen either way.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* ── The people ───────────────────────────────────────────────── */}
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            People to add
          </label>

          <BulkEntryTable
            columns={COLUMNS}
            rows={rows}
            onChange={setRows}
            blankRow={BLANK_ROW}
            errors={rowErrors}
            addLabel="Add another person"
          />

          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary"
              disabled={saving}
            >
              Clear
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              <AddIcon fontSize="small" />
              {saving
                ? "Creating…"
                : `Create ${rows.filter((r) => r.email?.trim()).length || ""} account(s)`}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="text"
          placeholder="Search staff…"
          className={`${uiStyles.input} md:max-w-xs`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show deactivated accounts
        </label>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {filtered.map((member) => (
          <MobileCard
            key={member._id}
            statusKey={member.isActive ? "active" : "inactive"}
            title={
              [member.firstName, member.lastName].filter(Boolean).join(" ") ||
              member.email
            }
            subtitle={member.email}
            badge={{ label: member.role === "admin" ? "Admin" : "Staff" }}
            fields={[
              {
                label: "Locations",
                value:
                  member.role === "admin"
                    ? "All"
                    : member.locations.map((l) => l.code).join(", ") || "None",
              },
              {
                label: "Modules",
                value:
                  member.role === "admin"
                    ? "Everything"
                    : `${member.permissions.length} granted`,
              },
              { label: "Phone", value: member.phone },
              {
                label: "Last seen",
                value: member.lastLogin
                  ? LoadTable.fmtDate(member.lastLogin)
                  : "Never",
              },
            ]}
            actions={[
              {
                icon: <EmailIcon style={{ fontSize: 18 }} />,
                color: "#2563eb",
                onClick: () => resendCredentials(member),
                disabled: busyId === member._id,
              },
              {
                icon: <TuneIcon style={{ fontSize: 18 }} />,
                color: "#475569",
                onClick: () => navigate("/admin/permissions"),
              },
              {
                icon: <DeleteIcon style={{ fontSize: 18 }} />,
                color: "#dc2626",
                onClick: () => removeMember(member),
                disabled: busyId === member._id,
              },
            ]}
          />
        ))}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={filtered}
          columns={columns}
          actions={actions}
          loading={loading}
          colorBy="__none"
          emptyMessage="No staff accounts yet. Add your team to get started."
        />
      </div>
    </div>
  );
};

export default StaffManagement;
