import CustomerForm from "../../components/forms/CustomerForm";
import { useNavigate } from "react-router-dom";
import { notify } from "../../utils/swal";
import api from "../../api";

const StaffCreateCustomer = () => {
  const navigate = useNavigate();

 const handleRegister = async (data) => {
  try {
    // 🔥 Clean payload (avoid empty strings breaking backend)
    const payload = {
      ...data,
      sendCredentials: true,

      // sanitize empty values
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      customerName: data.customerName?.trim(),

      street: data.street?.trim(),
      suite: data.suite?.trim(),
      city: data.city?.trim(),
      state: data.state?.trim(),
      zip: data.zip?.trim(),
      directions: data.directions?.trim(),

      phone: data.phone?.trim(),
      fax: data.fax?.trim(),
      email: data.email?.trim(),
      website: data.website?.trim(),

      podEmail: data.podEmail?.trim(),
      accChargesEmail: data.accChargesEmail?.trim(),
      deliveryEmail: data.deliveryEmail?.trim(),

      sendStatusEmails: !!data.sendStatusEmails,
      sendInvoiceEmails: !!data.sendInvoiceEmails,
      creditLimitExceeded: !!data.creditLimitExceeded,
    };

    console.log("📤 STAFF PAYLOAD:", payload); // DEBUG

    const response = await api.post("/auth/staff/create-customer", payload);

    if (response.data?.credentialsGenerated) {
      notify.info(
        `Customer created! Credentials: ${response.data.message}`,
        15000
      );
    } else {
      notify.success("Customer created successfully");
    }

    navigate("/staff/customers");

  } catch (error) {
    console.error("❌ CREATE CUSTOMER ERROR:", error);

    notify.error(
      error.response?.data?.message || "Failed to create customer"
    );

    throw error;
  }
};

  return (
    <>

      <div className="p-6">
        <CustomerForm
        onSubmit={handleRegister}
        isSelfRegister={false}
        title="Create New Customer"
        submitButtonText="Create"
        showLoginLink={false}
      />
      </div>
    </>
  );
};

export default StaffCreateCustomer;
