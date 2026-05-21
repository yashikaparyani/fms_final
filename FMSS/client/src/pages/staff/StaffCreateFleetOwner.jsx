
import api from "../../api";
import { useNavigate } from "react-router-dom";
import FleetOwnerForm from "../../components/forms/FleetOwnerForm";
import { notify } from "../../utils/swal";

const StaffCreateFleetOwner = () => {
  const navigate = useNavigate();

  const handleSubmit = async (formData) => {
    const response = await api.post("/fleet-owners", {
      ...formData,
      sendCredentials: true,
      createUserAccount: true
    });

    // Show credentials if generated
    if (response.data.credentialsGenerated) {
      notify.info(`Credentials generated: ${response.data.message}`, 10000);
    }

    return response.data;
  };

  return (
    <div className="p-6">
      <FleetOwnerForm
        onSubmit={handleSubmit}
        title="Create Fleet Owner"
        submitButtonText="Create"
      />
    </div>
  );
};

export default StaffCreateFleetOwner;