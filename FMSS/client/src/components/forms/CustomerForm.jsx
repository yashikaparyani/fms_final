import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { uiStyles } from "../../style/uiStyles";
import AddressFields from "../AddressFields";

const CustomerForm = ({
  onSubmit,
  initialData = {},
  isSelfRegister = false,
  title = "New Customer",
  submitButtonText = "Save Customer",
  showLoginLink = false,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const previousEmailRef = useRef("");

  const [formData, setFormData] = useState({
    customerName: "",
    firstName: "",
    lastName: "",
    password: "",
    street: "",
    suite: "",
    city: "",
    state: "",
    zip: "",
    directions: "",
    active: true,
    phone: "",
    fax: "",
    email: "",
    website: "",
    podEmail: "",
    accChargesEmail: "",
    deliveryEmail: "",
    sendStatusEmails: false,
    sendInvoiceEmails: false,
    creditLimitExceeded: false,
    ...initialData, // ✅ THIS IS KEY
  });

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
      }));
      previousEmailRef.current = initialData.email || "";
    }
  }, [initialData]);

  useEffect(() => {
    const email = formData.email?.trim();
    if (!email) {
      previousEmailRef.current = "";
      return;
    }

    setFormData((prev) => {
      const hasCustomNotificationEmails = [
        prev.podEmail,
        prev.accChargesEmail,
        prev.deliveryEmail,
      ].some((value) => value && value.trim() !== "" && value.trim() !== previousEmailRef.current);

      if (hasCustomNotificationEmails) {
        previousEmailRef.current = email;
        return prev;
      }

      const nextValue = {
        ...prev,
        podEmail: email,
        accChargesEmail: email,
        deliveryEmail: email,
      };
      previousEmailRef.current = email;
      return nextValue;
    });
  }, [formData.email]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => {
      const nextValue = type === "checkbox" ? checked : value;
      const next = { ...prev, [name]: nextValue };

      if (name === "email") {
        const previousEmail = previousEmailRef.current;
        const notificationEmails = [prev.podEmail, prev.accChargesEmail, prev.deliveryEmail];
        const shouldMirrorAll = notificationEmails.every(
          (item) => !item || item.trim() === "" || item.trim() === previousEmail,
        );

        if (shouldMirrorAll) {
          next.podEmail = nextValue;
          next.accChargesEmail = nextValue;
          next.deliveryEmail = nextValue;
        }

        previousEmailRef.current = nextValue;
      }

      return next;
    });
  };

  // ── Location cascade via AddressFields component ──────────────────────────────
  const handleAddressChange = ({ state, city, zip }) => {
    setFormData((prev) => ({ ...prev, state, city, zip }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error(error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isSelfRegister) {
      navigate("/client-login");
    } else {
      navigate("/staff/customers");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-0 md:px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            {isSelfRegister
              ? "Create your account to get started."
              : "Fill in the details below to register a new customer."}
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit}>
          <div className={uiStyles.card}>
            {/* ── Registration badge ────────────────────────────────────── */}
            {isSelfRegister && (
              <div className="flex items-center gap-2 mb-6 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <svg
                  className="w-4 h-4 text-indigo-500 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="text-sm font-semibold text-indigo-700">
                  Customer Self-Registration
                </span>
              </div>
            )}

            {/* ── Section: Account Info (self-register only) ─────────────── */}
            {isSelfRegister && (
              <>
                <h3 className="form-subtitle">Account Information</h3>
                <div className={uiStyles.grid2}>
                  <div className="relative">
                    <input
                      name="firstName"
                      type="text"
                      value={formData.firstName || ""}
                      className={uiStyles.input}
                      placeholder="First Name"
                      onChange={handleChange}
                      required
                      disabled={loading}
                    />
                    <label className="input-label">
                      First Name <span className="text-red-400">*</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      name="lastName"
                      type="text"
                      value={formData.lastName || ""}
                      className={uiStyles.input}
                      placeholder="Last Name"
                      onChange={handleChange}
                      required
                      disabled={loading}
                    />
                    <label className="input-label">
                      Last Name <span className="text-red-400">*</span>
                    </label>
                  </div>

                  <div className="relative ">
                    <input
                      name="password"
                      type="password"
                      value={formData.password || ""}
                      className={uiStyles.input}
                      placeholder="Password"
                      onChange={handleChange}
                      required
                      disabled={loading}
                    />
                    <label className="input-label">
                      Password <span className="text-red-400">*</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* ── Section: Address Details ───────────────────────────────── */}
            <h3 className="form-subtitle">Address Details</h3>
            <div className={uiStyles.grid2}>
              <div className="relative">
                <input
                  name="customerName"
                  type="text"
                  value={formData.customerName || ""}
                  className={uiStyles.input}
                  placeholder={
                    isSelfRegister ? "Company Name (Optional)" : "Customer Name"
                  }
                  onChange={handleChange}
                  required={!isSelfRegister}
                  disabled={loading}
                />
                <label className="input-label">
                  {isSelfRegister ? (
                    "Company Name (Optional)"
                  ) : (
                    <>
                      Customer Name <span className="text-red-400">*</span>
                    </>
                  )}
                </label>
              </div>

              <div className="relative">
                <input
                  name="street"
                  type="text"
                  value={formData.street || ""}
                  className={uiStyles.input}
                  placeholder="Street"
                  onChange={handleChange}
                  disabled={loading}
                />
                <label className="input-label">Street</label>
              </div>

              <div className="relative">
                <input
                  name="suite"
                  type="text"
                  value={formData.suite || ""}
                  className={uiStyles.input}
                  placeholder="Suite"
                  onChange={handleChange}
                  disabled={loading}
                />
                <label className="input-label">Suite</label>
              </div>

              {/* State → City → Zip — dynamic from backend master */}
            </div>
            <div className="mt-4">
              <AddressFields
                state={formData.state || ""}
                city={formData.city || ""}
                zip={formData.zip || ""}
                onChange={handleAddressChange}
                disabled={loading}
              />
            </div>
            <div className={uiStyles.grid2}>

              <div className="relative col-span-full mt-4">
                <textarea
                  name="directions"
                  type="text"
                  value={formData.directions || ""}
                  rows={2}
                  className={uiStyles.textarea}
                  placeholder="Directions..."
                  onChange={handleChange}
                  disabled={loading}
                />
                <label className="input-label">Directions</label>
              </div>
            </div>

            {/* ── Section: Contact Information ───────────────────────────── */}
            <h3 className="form-subtitle">Contact Information</h3>
            <div className={uiStyles.grid2}>
              {[
                {
                  name: "phone",
                  label: "Phone",
                  type: "tel",
                  required: isSelfRegister,
                },
                { name: "fax", label: "Fax", type: "tel", required: false },
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  required: true,
                },
                {
                  name: "website",
                  label: "Website URL",
                  type: "text",
                  required: false,
                },
                {
                  name: "podEmail",
                  label: "POD Email",
                  type: "email",
                  required: false,
                },
                {
                  name: "accChargesEmail",
                  label: "Accessorial Charges Email",
                  type: "email",
                  required: false,
                },
                {
                  name: "deliveryEmail",
                  label: "Delivery Email",
                  type: "email",
                  required: false,
                  span: true,
                },
              ].map(({ name, label, type, required, span }) => (
                <div key={name} className={"relative"}>
                  <input
                    name={name}
                    type={type}
                    value={formData[name] || ""}
                    className={uiStyles.input}
                    placeholder={label}
                    onChange={handleChange}
                    required={required}
                    disabled={loading}
                  />
                  <label className="input-label">
                    {label}{" "}
                    {required && <span className="text-red-400">*</span>}
                  </label>
                </div>
              ))}
            </div>

            {/* ── Section: Email Preferences ─────────────────────────────── */}
            <h3 className="form-subtitle">Email Preferences</h3>
            <div className="flex flex-col gap-3">
              {[
                {
                  name: "sendStatusEmails",
                  label: "Send Status Update Emails",
                },
                { name: "sendInvoiceEmails", label: "Send Invoice via Email" },
                ...(!isSelfRegister
                  ? [
                      {
                        name: "creditLimitExceeded",
                        label: "Credit Limit Exceeded",
                        danger: true,
                      },
                    ]
                  : []),
              ].map(({ name, label, danger }) => (
                <label
                  key={name}
                  className={`flex items-center gap-2 label cursor-pointer${danger ? " text-red-500" : ""}`}
                >
                  <input
                    type="checkbox"
                    name={name}
                    checked={!!formData[name]}
                    className="rounded"
                    onChange={handleChange}
                    disabled={loading}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
              <button
                type="button"
                className="btn-secondary disabled:opacity-50"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary disabled:opacity-50"
                disabled={loading}
              >
                {loading ? (
                  "Saving..."
                ) : (
                  <>
                    {submitButtonText}
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {/* ── Login link ─────────────────────────────────────────────── */}
            {showLoginLink && (
              <div className="flex justify-end border-t border-gray-100 pt-4 mt-2">
                <Link
                  to="/client-login"
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Already have an account? Login here
                </Link>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerForm;
