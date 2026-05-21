//import { useEffect, useState } from "react";
import CustomerForm from "../components/forms/CustomerForm";
import LoadForm from "../components/forms/LoadForm";
import api from "../api";

const LoadCreationForm = () => {


  const handleCreate = async (data, status) => {
    try {
      await api.post("/loads", {
        ...data,
        status: status || "PENDING_VERIFICATION"
      });
      alert("Load created successfully");
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to create load");
    }
  };

  return (
    <>

      <div >
        <LoadForm
        onSubmit={handleCreate}
        isSelfRegister={false}
        title="Create New Load"
        submitButtonText="Save Load"
        showLoginLink={false}
      />
      </div>
    </>
  );
};

export default LoadCreationForm;
