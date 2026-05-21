import CustomerForm from "../components/forms/CustomerForm";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../api"; // Import your axios instance

const CustomerRegister = () => {
  const navigate = useNavigate();

  const handleRegister = async (data) => {
    try {
      const response = await api.post("/auth/customer/register", data);

      toast.success("✅ Registered successfully! Please check your email to verify your account.", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      setTimeout(() => {
        navigate("/client-login");
      }, 2000);

    } catch (error) {
      const errorMessage = error.response?.data?.message || "Registration failed. Please try again.";
      toast.error(`❌ ${errorMessage}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <CustomerForm
        onSubmit={handleRegister}
        isSelfRegister={true}
        title="Create Your Account"
        submitButtonText="Register"
        showLoginLink={true}
      />
    </div>
  );
};

export default CustomerRegister;