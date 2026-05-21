import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CustomerForm from "../../components/forms/CustomerForm";
import api from "../../api";
//import { toast } from "react-toastify";
import { notify } from "../../utils/swal";

const EditCustomerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);

  useEffect(() => {
    fetchCustomer();
  }, []);

  const fetchCustomer = async () => {
    try {
      const res = await api.get(`/customers/${id}`);
      const data = res.data;
      console.log("Fetched customer data:", data);

      const addr = data.addresses?.[0] || {};

      setInitialData({
        customerName: data.customerName,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        fax: data.contact?.fax,
        website: data.contact?.website,

        street: addr.street,
        suite: addr.suite,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        directions: addr.directions,

        podEmail: data.emails?.podEmail,
        accChargesEmail: data.emails?.accChargesEmail,
        deliveryEmail: data.emails?.deliveryEmail,

        sendStatusEmails: data.preferences?.sendStatusEmails,
        sendInvoiceEmails: data.preferences?.sendInvoiceEmails,
        creditLimitExceeded: data.preferences?.creditLimitExceeded,
      });
    } catch {
      notify.error("Failed to load customer");
    }
  };

  const handleUpdate = async (formData) => {
    try {
      await api.put(`/customers/${id}`, formData);
      notify.success("Customer updated");
      navigate("/staff/customers");
    } catch (err) {
      notify.error(err.response?.data?.message || "Update failed");
    }
  };

  if (!initialData) return <p className="p-4">Loading...</p>;

  return (
    <CustomerForm
      onSubmit={handleUpdate}
      title="Edit Customer"
      submitButtonText="Update Customer"
      initialData={initialData}
    />
  );
};

export default EditCustomerPage;