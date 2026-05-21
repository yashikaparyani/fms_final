import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { uiStyles } from "../../style/uiStyles";
import AddressFields from "../AddressFields";

const FleetOwnerForm = ({
  onSubmit,
  initialData = {},
  title = "New Fleet Owner",
  submitButtonText = "Save Fleet Owner",
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    carrierName: "",
    phone: "",
    fax: "",
    mcLicense: "",
    dotLicense: "",
    taxId: "",
    websiteUrl: "",
    notes: "",
    active: true,
    street: "",
    suite: "",
    city: "",
    state: "",
    zip: "",
    contactPersons: [{ name: "", phone: "", email: "", isPrimary: false }],
    ...initialData,
  });

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setFormData((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === "checkbox" ? checked : value });
  };

  const handleContactPersonChange = (index, field, value) => {
    const updated = [...formData.contactPersons];
    updated[index][field] = value;
    setFormData({ ...formData, contactPersons: updated });
  };

  const addContactPerson = () => {
    setFormData({
      ...formData,
      contactPersons: [
        ...formData.contactPersons,
        { name: "", phone: "", email: "", isPrimary: false },
      ],
    });
  };

  const removeContactPerson = (index) => {
    if (formData.contactPersons.length > 1) {
      setFormData({
        ...formData,
        contactPersons: formData.contactPersons.filter((_, i) => i !== index),
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      toast.success("Fleet owner saved successfully!");
      navigate("/staff/fleet-owners");
    } catch (error) {
      console.error(error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Location helpers ──────────────────────────────────────────────────────
  const handleAddressChange = ({ state, city, zip }) => {
    setFormData((prev) => ({ ...prev, state, city, zip }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-0 md:px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Fill in the carrier details, payment address, and contact persons.</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit}>
          <div className={uiStyles.card}>

            {/* ── Section: Carrier Details ───────────────────────────────── */}
            <h2 className="h4 mb-4">Carrier Details</h2>

            <div>
              <div className={uiStyles.grid2}>
                <div className="relative">
                  <input
                    name="carrierName"
                    className={uiStyles.input}
                    placeholder="Carrier Name"
                    value={formData.carrierName}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Carrier Name</label>
                </div>

                <div className="relative">
                  <input
                    name="phone"
                    className={uiStyles.input}
                    placeholder="Phone"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Phone</label>
                </div>

                <div className="relative">
                  <input
                    name="fax"
                    className={uiStyles.input}
                    placeholder="Fax"
                    value={formData.fax}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Fax</label>
                </div>

                <div className="relative">
                  <input
                    name="mcLicense"
                    className={uiStyles.input}
                    placeholder="MC Lic. #"
                    value={formData.mcLicense}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">MC Lic. #</label>
                </div>

                <div className="relative">
                  <input
                    name="dotLicense"
                    className={uiStyles.input}
                    placeholder="DOT Lic. #"
                    value={formData.dotLicense}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">DOT Lic. #</label>
                </div>

                <div className="relative">
                  <input
                    name="taxId"
                    className={uiStyles.input}
                    placeholder="Tax ID"
                    value={formData.taxId}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Tax ID</label>
                </div>

                <div className="relative">
                  <input
                    name="websiteUrl"
                    className={uiStyles.input}
                    placeholder="Website URL"
                    value={formData.websiteUrl}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Website URL</label>
                </div>

                <div className="relative">
                  <textarea
                    name="notes"
                    rows={2}
                    className={uiStyles.textarea}
                    placeholder="Notes..."
                    value={formData.notes}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="input-label">Notes</label>
                </div>
              </div>

              {/* Active toggle */}
              <div className="mt-4">
                <label className="flex items-center gap-2 label cursor-pointer">
                  <input
                    type="checkbox"
                    name="active"
                    className="rounded"
                    checked={formData.active}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  Active
                </label>
              </div>
            </div>

            {/* ── Section: Payment Address ───────────────────────────────── */}
            <h3 className="form-subtitle">Payment Address</h3>
            <div className={uiStyles.grid2}>
              <div className="relative">
                <input
                  name="street"
                  className={uiStyles.input}
                  placeholder="Street"
                  value={formData.street}
                  onChange={handleChange}
                  disabled={loading}
                />
                <label className="input-label">Street</label>
              </div>

              <div className="relative">
                <input
                  name="suite"
                  className={uiStyles.input}
                  placeholder="Suite #"
                  value={formData.suite}
                  onChange={handleChange}
                  disabled={loading}
                />
                <label className="input-label">Suite #</label>
              </div>

              <div className="col-span-full">
                <AddressFields
                  state={formData.state || ""}
                  city={formData.city || ""}
                  zip={formData.zip || ""}
                  onChange={handleAddressChange}
                  disabled={loading}
                />
              </div>
            </div>

            {/* ── Section: Contact Persons ───────────────────────────────── */}
            <div className={`${uiStyles.flexBetween} mt-6 mb-1 border-b border-gray-200`}>
              <h3 className="form-subtitle border-0 !mb-0">Contact Persons</h3>
              <button
                type="button"
                onClick={addContactPerson}
                disabled={loading}
                className={`${uiStyles.flexBetween} link`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Contact
              </button>
            </div>

            <div className="space-y-3 mt-3">
              {formData.contactPersons.map((contact, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50/50"
                >
                  <div className={`${uiStyles.flexBetween} mb-3`}>
                    <span className="text-sm font-semibold text-gray-600">
                      Contact #{index + 1}
                      {contact.isPrimary && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          Primary
                        </span>
                      )}
                    </span>
                    {formData.contactPersons.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContactPerson(index)}
                        disabled={loading}
                        className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className={uiStyles.grid2}>
                    {[
                      { field: "name",  label: "Name",  type: "text"  },
                      { field: "phone", label: "Phone", type: "tel"   },
                      { field: "email", label: "Email", type: "email" },
                    ].map(({ field, label, type }) => (
                      <div key={field} className="relative">
                        <input
                          type={type}
                          className={uiStyles.input}
                          placeholder={label}
                          value={contact[field]}
                          onChange={(e) => handleContactPersonChange(index, field, e.target.value)}
                          disabled={loading}
                        />
                        <label className="input-label">{label}</label>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <label className="flex items-center gap-2 label cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={contact.isPrimary}
                        onChange={(e) => handleContactPersonChange(index, "isPrimary", e.target.checked)}
                        disabled={loading}
                      />
                      Primary Contact
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
              <button
                type="button"
                className="btn-secondary disabled:opacity-50"
                onClick={() => navigate("/staff/fleet-owners")}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Saving..." : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {submitButtonText}
                  </>
                )}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
};

export default FleetOwnerForm;