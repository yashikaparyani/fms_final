import React, { useState } from "react";
import api from "../../api";
import { toast } from "react-toastify";
import AddressFields from "../AddressFields";
import MapPicker from "../MapPicker";

const AddNewAddressModal = ({ isShow, setIsShow, onSuccess }) => {
  const [form, setForm] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    directions: "",
    lat: null,
    lng: null,
  });
  const [showMap, setShowMap] = useState(false);

  const inputClass =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none border-gray-200";

  // ── Location cascade via AddressFields ────────────────────────────────────
  const handleAddressChange = ({ state, city, zip }) => {
    setForm((prev) => ({ ...prev, state, city, zip }));
  };

  const handleLocationSelect = (address) => {
    setForm((prev) => ({
      ...prev,
      street: address.street || prev.street,
      city: address.city || prev.city,
      state: address.state || prev.state,
      zip: address.zip || prev.zip,
      lat: address.lat || prev.lat,
      lng: address.lng || prev.lng,
    }));
    setShowMap(false);
  };

  const handleSubmit = async () => {
    if (!form.street || !form.city || !form.state || !form.zip) {
      toast.error("Please fill all required fields (Street, City, State, Zip).");
      return;
    }

    try {
      const res = await api.post("/addresses", form);

      toast.success("Address added");

      onSuccess(res.data); // send back to parent
      setIsShow(false);

      setForm({
        street: "",
        city: "",
        state: "",
        zip: "",
        directions: "",
        lat: null,
        lng: null,
      });
      setShowMap(false);
    } catch (err) {
      console.log(err);
      toast.error("Failed to add address");
    }
  };

  if (!isShow) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-5 rounded-xl w-[480px] max-w-[95vw] space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-1">
          <h2 className="font-semibold text-lg">Add New Address</h2>
          <button onClick={() => setIsShow(false)} className="text-gray-500 hover:text-gray-800">✖</button>
        </div>

        {!showMap ? (
            <button
              onClick={() => setShowMap(true)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-200 py-2 rounded-lg font-medium hover:bg-indigo-100 transition mb-2 shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pinpoint on Map
            </button>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-gray-700">Pick a location</span>
              <button onClick={() => setShowMap(false)} className="text-indigo-600 hover:underline">Cancel Map</button>
            </div>
            <MapPicker onLocationSelect={handleLocationSelect} height={250} />
          </div>
        )}

        <div className="space-y-3">
          <input
            placeholder="Street *"
            className={inputClass}
            value={form.street}
            onChange={(e) => setForm({ ...form, street: e.target.value })}
          />

          <AddressFields
            state={form.state || ""}
            city={form.city || ""}
            zip={form.zip || ""}
            onChange={handleAddressChange}
            required
          />

          <input
            placeholder="Directions (Optional)"
            className={inputClass}
            value={form.directions}
            onChange={(e) => setForm({ ...form, directions: e.target.value })}
          />
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-700 transition text-white py-2.5 rounded-lg font-medium mt-2"
        >
          Save Address
        </button>
      </div>
    </div>
  );
};

export default AddNewAddressModal;