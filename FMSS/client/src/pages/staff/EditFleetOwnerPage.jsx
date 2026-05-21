import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import FleetOwnerForm from "../../components/forms/FleetOwnerForm";
import api from "../../api";
import { notify } from "../../utils/swal";

const EditFleetOwnerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);

  useEffect(() => {
    fetchFleetOwner();
  }, []);

  const fetchFleetOwner = async () => {
    try {
      const res = await api.get(`/fleet-owners/${id}`);
      const data = res.data;
      console.log("Fetched fleet owner data:", data);

      setInitialData({
        carrierName: data.carrierName,
        phone:       data.phone,
        fax:         data.fax,
        mcLicense:   data.mcLicense,
        dotLicense:  data.dotLicense,
        taxId:       data.taxId,
        websiteUrl:  data.websiteUrl,
        notes:       data.notes,
        active:      data.active ?? true,

        street: data.street,
        suite:  data.suite,
        city:   data.city,
        state:  data.state,
        zip:    data.zip,

        contactPersons:
          data.contactPersons?.length > 0
            ? data.contactPersons
            : [{ name: "", phone: "", email: "", isPrimary: false }],
      });
    } catch {
      notify.error("Failed to load fleet owner");
    }
  };

  const handleUpdate = async (formData) => {
    try {
      await api.put(`/fleet-owners/${id}`, formData);
      notify.success("Fleet owner updated");
      navigate("/staff/fleet-owners");
    } catch (err) {
      notify.error(err.response?.data?.message || "Update failed");
    }
  };

  if (!initialData) return <p className="p-4">Loading...</p>;

  return (
    <FleetOwnerForm
      onSubmit={handleUpdate}
      title="Edit Fleet Owner"
      submitButtonText="Update Fleet Owner"
      initialData={initialData}
    />
  );
};

export default EditFleetOwnerPage;