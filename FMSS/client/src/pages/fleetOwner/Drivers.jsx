import { useEffect, useState } from "react";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/Key";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import Swal from "sweetalert2";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import BulkEntryTable from "../../components/BulkEntryTable";
import CredentialsPanel from "../../components/CredentialsPanel";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { usePermissions } from "../../hooks/usePermissions";

// ─── Drivers ──────────────────────────────────────────────────────────────────
// The carrier's own roster. They add drivers themselves because they are the only
// party who knows who is on the truck this week, and each driver given an email
// gets their own app login — a sub-account under this carrier — so pickup and
// delivery updates carry the name of the person who actually made the run
// instead of the carrier's single shared account.
//
// A driver with no email is still a useful record (licence, phone, who is on
// today) and simply has no login. That is the common case for a two-truck
// carrier, so the email column is optional and the app-login column follows it.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_ROW = {
  name: "",
  phone: "",
  email: "",
  licenseNumber: "",
  licenseExpiry: "",
};

const COLUMNS = [
  { key: "name", label: "Driver name", placeholder: "Ravi Kumar", required: true, width: "170px" },
  { key: "phone", label: "Phone", placeholder: "+1 555 0100", width: "140px" },
  {
    key: "email",
    label: "Email (for app login)",
    placeholder: "ravi@example.com",
    width: "210px",
  },
  { key: "licenseNumber", label: "Licence no.", placeholder: "DL-99881", width: "140px" },
  { key: "licenseExpiry", label: "Licence expiry", type: "date", width: "150px" },
];

const Drivers = () => {
  const { role } = usePermissions();
  const isOffice = ["staff", "admin"].includes(role);

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [rows, setRows] = useState([{ ...BLANK_ROW }]);
  const [rowErrors, setRowErrors] = useState({});
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  const [issued, setIssued] = useState([]);
  const [busyId, setBusyId] = useState(null);

  // Staff and admins manage any carrier's roster, so they have to say whose.
  const [carriers, setCarriers] = useState([]);
  const [carrierId, setCarrierId] = useState("");

  const fetchDrivers = async ({ silent = false } = {}) => {
    try {
      const params = {};
      if (showInactive) params.includeInactive = true;
      if (isOffice && carrierId) params.fleetOwnerId = carrierId;

      const { data } = await api.get("/drivers", { params });
      setDrivers(data);
    } catch (err) {
      if (!silent)
        notify.error(err.response?.data?.message || "Failed to load drivers");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive, carrierId]);

  useEffect(() => {
    if (!isOffice) return;
    api
      .get("/fleet-owners")
      .then(({ data }) => setCarriers(Array.isArray(data) ? data : data.data || []))
      .catch(() => {
        /* the picker is optional — without it the office sees every driver */
      });
  }, [isOffice]);

  /**
   * Keep only the rows the server rejected, each tagged with its own reason.
   * The good rows are saved server-side, so only what still needs fixing stays
   * in the form. See createDriversBulk.
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

  const resetForm = () => {
    setRows([{ ...BLANK_ROW }]);
    setRowErrors({});
  };

  const submit = async (event) => {
    event.preventDefault();

    const filled = rows.filter((row) => String(row.name || "").trim());

    if (!filled.length) {
      notify.warning("Enter a name for at least one driver.");
      return;
    }

    if (isOffice && !carrierId) {
      notify.warning("Choose which carrier these drivers belong to.");
      return;
    }

    try {
      setSaving(true);
      setRowErrors({});

      const { data } = await api.post("/drivers/bulk", {
        drivers: filled,
        fleetOwnerId: isOffice ? carrierId : undefined,
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
          name: c.driver.name,
          email: c.driver.loginEmail || c.driver.email,
          password: c.password,
          emailStatus: c.emailStatus,
        }));

      if (credentials.length) setIssued(credentials);

      fetchDrivers({ silent: true });
    } catch (err) {
      // When every row fails the server answers 400, so axios throws and we
      // land here rather than in the branch above — but the body still says
      // what was wrong with each row. Without this, "none of the rows could be
      // added" is all the carrier ever sees, and the actual reason (usually a
      // duplicate email) is thrown away.
      const data = err.response?.data;
      if (data?.failedCount) applyRowFailures(data, filled);

      notify.error(data?.message || "Could not add drivers");
    } finally {
      setSaving(false);
    }
  };

  const issueLogin = async (driver) => {
    const hasLogin = driver.hasLogin;

    const { isConfirmed, value } = await Swal.fire({
      title: hasLogin
        ? `New password for ${driver.name}?`
        : `Give ${driver.name} an app login?`,
      html: hasLogin
        ? "Their current password stops working immediately."
        : "They will be able to sign in to the driver app and update the trips assigned to you.",
      input: driver.email ? undefined : "email",
      inputLabel: driver.email ? undefined : "Their email address",
      inputPlaceholder: "driver@example.com",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: hasLogin ? "Issue new password" : "Create login",
      confirmButtonColor: "#4f46e5",
      inputValidator: (entered) =>
        driver.email || entered ? undefined : "An email address is required",
    });

    if (!isConfirmed) return;

    try {
      setBusyId(driver._id);
      const { data } = await api.post(`/drivers/${driver._id}/send-credentials`, {
        channel: sendEmail ? "email" : "manual",
        email: driver.email || value,
      });

      setIssued([
        {
          name: driver.name,
          email: data.email,
          password: data.password,
          emailStatus: data.emailStatus,
        },
      ]);
      notify.success(data.message);
      fetchDrivers({ silent: true });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not issue the login");
    } finally {
      setBusyId(null);
    }
  };

  const editDriver = async (driver) => {
    const { isConfirmed, value } = await Swal.fire({
      title: `Edit ${driver.name}`,
      html: `
        <input id="d-name" class="swal2-input" placeholder="Name" value="${driver.name || ""}">
        <input id="d-phone" class="swal2-input" placeholder="Phone" value="${driver.phone || ""}">
        <input id="d-licence" class="swal2-input" placeholder="Licence no." value="${driver.licenseNumber || ""}">
      `,
      showCancelButton: true,
      confirmButtonText: "Save",
      confirmButtonColor: "#4f46e5",
      preConfirm: () => ({
        name: document.getElementById("d-name").value.trim(),
        phone: document.getElementById("d-phone").value.trim(),
        licenseNumber: document.getElementById("d-licence").value.trim(),
      }),
    });

    if (!isConfirmed) return;

    if (!value.name) {
      notify.warning("A driver name is required.");
      return;
    }

    try {
      setBusyId(driver._id);
      await api.put(`/drivers/${driver._id}`, value);
      notify.success(`${value.name} updated.`);
      fetchDrivers({ silent: true });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update the driver");
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (driver) => {
    const { isConfirmed } = await Swal.fire({
      title: `Take ${driver.name} off the roster?`,
      html: driver.hasLogin
        ? "Their app login is disabled at the same time. Their past trips and delivery proof stay in the system."
        : "Their past trips and delivery proof stay in the system.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove from roster",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      setBusyId(driver._id);
      const { data } = await api.delete(`/drivers/${driver._id}`);
      notify.success(data.message);
      fetchDrivers({ silent: true });
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not remove the driver");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = drivers.filter((driver) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [driver.name, driver.email, driver.phone, driver.driverCode, driver.licenseNumber]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(needle));
  });

  const columns = [
    {
      key: "code",
      header: "Code",
      width: "110px",
      render: (row) => (
        <span className="text-xs font-mono font-bold text-indigo-700">
          {row.driverCode || "—"}
        </span>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.name}</p>
          {row.email && <p className="text-xs text-indigo-600">{row.email}</p>}
          {isOffice && row.carrierName && (
            <p className="text-[11px] text-gray-500">{row.carrierName}</p>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Phone",
      width: "130px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.phone || "—"}</span>
      ),
    },
    {
      key: "licence",
      header: "Licence",
      render: (row) => (
        <div className="text-xs text-gray-600">
          <p>{row.licenseNumber || "—"}</p>
          {row.licenseExpiry && (
            <LoadTable.DateCell value={row.licenseExpiry} showExpiry />
          )}
        </div>
      ),
    },
    {
      key: "login",
      header: "App login",
      width: "120px",
      render: (row) =>
        !row.hasLogin ? (
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            No login
          </span>
        ) : (
          <div>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                row.loginActive
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              <PhoneIphoneIcon style={{ fontSize: 11 }} />
              {row.loginActive ? "Active" : "Disabled"}
            </span>
            <p className="text-[10px] text-gray-400 mt-1">
              {row.lastLogin
                ? `Seen ${LoadTable.fmtDate(row.lastLogin)}`
                : "Never signed in"}
            </p>
          </div>
        ),
    },
    {
      key: "status",
      header: "Roster",
      width: "90px",
      render: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            row.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
          }`}
        >
          {row.active ? "On" : "Off"}
        </span>
      ),
    },
  ];

  const actions = (row) => (
    <div className="flex gap-1">
      <button
        onClick={() => editDriver(row)}
        disabled={busyId === row._id}
        title="Edit"
        className="btn-secondary p-1 text-white bg-cyan-600 border-cyan-600 disabled:opacity-50"
      >
        <EditIcon fontSize="small" />
      </button>
      <button
        onClick={() => issueLogin(row)}
        disabled={busyId === row._id}
        title={row.hasLogin ? "Issue a new password" : "Create an app login"}
        className="btn-secondary p-1 text-white bg-blue-600 border-blue-600 disabled:opacity-50"
      >
        <KeyIcon fontSize="small" />
      </button>
      {row.active && (
        <button
          onClick={() => deactivate(row)}
          disabled={busyId === row._id}
          title="Remove from roster"
          className="btn-delete p-1 text-white bg-red-600 border-red-600 disabled:opacity-50"
        >
          <DeleteIcon fontSize="small" />
        </button>
      )}
    </div>
  );

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="page-subtitle">
            Your roster. Give a driver an email address and they get their own
            login to the driver app, so their trip updates carry their name.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary whitespace-nowrap"
        >
          <GroupAddIcon fontSize="small" />{" "}
          {showForm ? "Cancel" : "Add Drivers"}
        </button>
      </div>

      {issued.length > 0 && (
        <CredentialsPanel
          entries={issued}
          loginUrl={`${window.location.origin}/login`}
          title={`${issued.length} driver login${issued.length > 1 ? "s" : ""} issued`}
          onDismiss={() => setIssued([])}
        />
      )}

      {showForm && (
        <form onSubmit={submit} className={uiStyles.card}>
          {isOffice && (
            <div className="mb-4 max-w-sm">
              <label className="text-xs font-semibold text-gray-600">
                Carrier <span className="text-red-500">*</span>
              </label>
              <select
                className={uiStyles.select}
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
              >
                <option value="">Choose a carrier…</option>
                {carriers.map((carrier) => (
                  <option key={carrier._id} value={carrier._id}>
                    {carrier.carrierName}
                    {carrier.fleetOwnerCode ? ` · ${carrier.fleetOwnerCode}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="text-xs font-semibold text-gray-600 block mb-1">
            Drivers to add
          </label>
          <p className="text-[11px] text-gray-500 mb-2">
            Only the name is required. Leave the email blank for a driver who does
            not need the app — you can give them a login later.
          </p>

          <BulkEntryTable
            columns={COLUMNS}
            rows={rows}
            onChange={setRows}
            blankRow={BLANK_ROW}
            errors={rowErrors}
            addLabel="Add another driver"
          />

          <label className="flex items-start gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-indigo-600"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span className="text-xs text-gray-700">
              Email each driver their login details
              <span className="block text-gray-500">
                Untick to read the passwords out yourself — they are shown on
                screen either way.
              </span>
            </span>
          </label>

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
                ? "Adding…"
                : `Add ${rows.filter((r) => r.name?.trim()).length || ""} driver(s)`}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="text"
          placeholder="Search drivers…"
          className={`${uiStyles.input} md:max-w-xs`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isOffice && (
          <select
            className={`${uiStyles.select} md:max-w-xs`}
            value={carrierId}
            onChange={(e) => setCarrierId(e.target.value)}
          >
            <option value="">All carriers at this location</option>
            {carriers.map((carrier) => (
              <option key={carrier._id} value={carrier._id}>
                {carrier.carrierName}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show removed drivers
        </label>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {filtered.map((driver) => (
          <MobileCard
            key={driver._id}
            statusKey={driver.active ? "active" : "inactive"}
            title={driver.name}
            subtitle={driver.driverCode}
            badge={{
              label: !driver.hasLogin
                ? "No login"
                : driver.loginActive
                  ? "App active"
                  : "App disabled",
            }}
            fields={[
              { label: "Phone", value: driver.phone },
              { label: "Email", value: driver.email },
              { label: "Licence", value: driver.licenseNumber },
              {
                label: "Expiry",
                value: driver.licenseExpiry
                  ? LoadTable.fmtDate(driver.licenseExpiry)
                  : "",
              },
            ]}
            actions={[
              {
                icon: <EditIcon style={{ fontSize: 18 }} />,
                color: "#0891b2",
                onClick: () => editDriver(driver),
                disabled: busyId === driver._id,
              },
              {
                icon: <KeyIcon style={{ fontSize: 18 }} />,
                color: "#2563eb",
                onClick: () => issueLogin(driver),
                disabled: busyId === driver._id,
              },
              {
                icon: <DeleteIcon style={{ fontSize: 18 }} />,
                color: "#dc2626",
                onClick: () => deactivate(driver),
                disabled: busyId === driver._id,
              },
            ]}
          />
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-gray-500 py-10">No drivers yet.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={filtered}
          columns={columns}
          actions={actions}
          loading={loading}
          colorBy="__none"
          emptyMessage="No drivers on the roster yet. Add your drivers to give them app logins."
        />
      </div>
    </div>
  );
};

export default Drivers;
