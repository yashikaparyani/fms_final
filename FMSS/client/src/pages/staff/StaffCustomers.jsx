import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import CircularProgress from "@mui/material/CircularProgress";
import { displayName } from "../../utils/displayName";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { notify } from "../../utils/swal";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import { uiStyles } from "../../style/uiStyles";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

const StaffCustomers = () => {
  const [customers, setCustomers] = useState([]);
  console.log("Customers:", customers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingCredentials, setSendingCredentials] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

  useAutoRefresh(() => fetchCustomers({ silent: true }));

  // `silent` keeps the background refresh from toasting on a blip or touching
  // the spinner.
  const fetchCustomers = async ({ silent = false } = {}) => {
    try {
      const res = await api.get("/customers");
      setCustomers(res.data);
    } catch {
      if (!silent) notify.error("Failed to fetch customers");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSendCredentials = async (id) => {
    // A second press while the first is in flight would issue a second password
    // and invalidate the one already on its way. The disabled button stops this
    // for a mouse; the guard stops it for a double-click that lands in the same
    // tick, and for the keyboard.
    if (sendingCredentials) return;

    setSendingCredentials(id);
    try {
      const res = await api.post(`/customers/${id}/send-credentials`, {
        channel: "email",
      });
      notify.success(res.data.message || `Credentials processed for ${res.data.email}`);
    } catch {
      notify.error("Failed to send credentials");
    } finally {
      setSendingCredentials(null);
    }
  };

  const handleShareWhatsApp = async (id) => {
    if (sendingCredentials) return;

    setSendingCredentials(id);
    try {
      const res = await api.post(`/customers/${id}/send-credentials`, {
        channel: "whatsapp",
      });
      const message = `Login: ${window.location.origin}/client-login\nEmail: ${res.data.email}\nPassword: ${res.data.password}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } catch {
      notify.error("Failed to share credentials");
    } finally {
      setSendingCredentials(null);
    }
  };

  const handleDelete = async (id) => {
  const confirm = await notify.info("Delete this customer?");
  if (!confirm) return;

  try {
    await api.delete(`/customers/${id}`);
    notify.success("Customer deleted");
    fetchCustomers(); // refresh list
  } catch {
    notify.error("Delete failed");
  }
};

  const filteredCustomers = customers.filter(
    (c) =>
      c.customerName?.toLowerCase()
        .includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div>
          <p className="font-medium text-sm">
            {row.customerName}
          </p>
          <p className="text-xs text-indigo-600">{row.email}</p>
        </div>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (row) => {
        // Support both merged top-level fields and addresses array
        const addr = row.addresses?.[0];
        const street = addr?.street || row.street;
        const city = addr?.city || row.city;
        const state = addr?.state || row.state;
        const zip = addr?.zip || row.zip;

        return (
          <div className="text-xs text-gray-600">
            {street ? (
              <p>
                {street}
                {addr?.suite ? `, ${addr.suite}` : ""}
              </p>
            ) : null}
            {city || state ? (
              <p>{[city, state, zip].filter(Boolean).join(", ")}</p>
            ) : (
              <p className="text-gray-400 italic">No address</p>
            )}
          </div>
        );
      },
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <div className="text-xs">
          <p>{row.phone || "-"}</p>
        </div>
      ),
    },
  ];

  // ── Why these two buttons show their working ────────────────────────────────
  // Sending credentials waits on an SMTP round trip, which is slow enough that a
  // button which does not visibly change reads as a button that did not fire. It
  // was being clicked two or three times, and every click issues a NEW password
  // — so the mail the customer eventually opens holds a password that has
  // already been replaced by the next click, and they cannot log in.
  //
  // So the row goes busy the instant it is pressed: the icon becomes a spinner
  // and both buttons refuse further presses until the request settles.
  const desktopActions = (row) => {
    const busy = sendingCredentials === row._id;

    return (
    <div className="flex gap-2">
      <button
        onClick={() => handleSendCredentials(row._id)}
        disabled={busy}
        title={busy ? "Sending credentials…" : "Email login credentials"}
        aria-busy={busy}
        className="btn-secondary p-1 text-white bg-blue-600 border-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? (
          <CircularProgress size={18} thickness={5} sx={{ color: "#fff" }} />
        ) : (
          <EmailIcon fontSize="small" />
        )}
      </button>
      <button
        onClick={() => handleShareWhatsApp(row._id)}
        disabled={busy}
        title={busy ? "Preparing credentials…" : "Share login credentials on WhatsApp"}
        className="btn-secondary p-1 text-white bg-green-600 border-green-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <WhatsAppIcon fontSize="small" />
      </button>
      <button
        onClick={() => navigate(`${row._id}/edit`)}
        className="btn-secondary p-1 text-white bg-cyan-600 border-cyan-600"
      >
        <EditIcon fontSize="small" />
      </button>
      <button   onClick={() => handleDelete(row._id)} className="btn-delete p-1 text-white bg-red-600 border-red-600">
        <DeleteIcon fontSize="small" />
      </button>
    </div>
    );
  };

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search customers..."
            className={uiStyles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => navigate("/staff/create-customer")}
            className="btn-primary whitespace-nowrap"
          >
            + New Customer
          </button>
        </div>
      </div>

      {/* 📱 Mobile */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.map((customer) => {
            const isActive = customer.isActive !== false;
            return (
              <MobileCard
                key={customer._id}
                statusKey={isActive ? "active" : "inactive"}
                // `companyName` is not a field /customers returns — it is
                // `customerName` — so this always fell through to the names, and
                // an account created without a contact name is "N/A N/A" there.
                // displayName walks customerName → email and treats the
                // placeholder as absent.
                title={displayName(customer, "Unnamed customer")}
                subtitle={customer.email}
                badge={{ label: isActive ? "Active" : "Inactive" }}
                fields={[
                  {
                    label: "City",
                    value: customer.addresses?.[0]?.city || customer.city,
                  },
                  {
                    label: "State",
                    value: customer.addresses?.[0]?.state || customer.state,
                  },
                  { label: "Phone", value: customer.phone },
                  {
                    label: "Street",
                    value: customer.addresses?.[0]?.street || customer.street,
                    fullWidth: true,
                  },
                ]}
                actions={[
                  {
                    icon: <EmailIcon style={{ fontSize: 18 }} />,
                    color: "#2563eb",
                    onClick: () => handleSendCredentials(customer._id),
                    disabled: sendingCredentials === customer._id,
                  },
                  {
                    icon: <WhatsAppIcon style={{ fontSize: 18 }} />,
                    color: "#16a34a",
                    onClick: () => handleShareWhatsApp(customer._id),
                    disabled: sendingCredentials === customer._id,
                  },
                  {
                    icon: <EditIcon style={{ fontSize: 18 }} />,
                    color: "#0891b2",
                    onClick: () =>
                      navigate(`/staff/customers/${customer._id}/edit`),
                  },
                  {
                    icon: <DeleteIcon style={{ fontSize: 18 }} />,
                    color: "#dc2626",
                    onClick: () => handleDelete(customer._id),
                  },
                ]}
              />
            );
          })
        ) : (
          <p className="text-center text-gray-500 py-10">No customers found</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden md:block">
        <LoadTable
          loads={filteredCustomers}
          columns={columns}
          actions={desktopActions}
          loading={loading}
          emptyMessage="No customers found."
        />
      </div>
    </div>
  );
};

export default StaffCustomers;
