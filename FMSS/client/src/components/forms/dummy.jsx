import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api";
import AddNewAddressModal from "./AddNewAddressModal";

const LoadForm = ({ onSubmit, title, submitButtonText }) => {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role;

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [addresses, setAddresses] = useState([]); // future use
  const [isShow, setIsShow] = useState(false);

  const [formData, setFormData] = useState({
    customer: role === "client" ? user._id : "",

    refNo: "",
    deliveryType: "ROUNDED",
    singleType: "Pick Up",

    truckType: "",
    material: "",
    amount: "",
    lastFreeDate: "",
    orderBillDate: "",

    containerType: "",
    commodity: "",
    bookingNo: "",
    shippingLine: "",
    containerNo: "",
    pickupNo: "",
    sealNo: "",

    hazmat: false,
    chassisRent: false,
    railContainer: false,

    accChargesEmail: "",
    podEmail: "",
    deliveryEmail: "",
    billingEmail: "",

    description: "",
    remarks: "",
  });

  const truckTypeOptions = ["Container", "Flatbed", "Reefer", "Van", "Other"];
  const containerTypeOptions = ["40 Std", "40 HC", "45", "20"];
  const commodityOptions = ["Chilled", "Dry", "Other", "Produce", "Frozen"];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e, status = null) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.customer) {
      toast.error("Please select a customer");
      setLoading(false);
      return;
    }

    try {
      await onSubmit({
        ...formData,
        status,
      });

      toast.success("Load Saved Successfully");
      navigate(`/${role}/dashboard`);
    } catch (err) {
      toast.error("Error creating load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin" || role === "staff") {
      api
        .get("/customers")
        .then((res) => {
          setCustomers(res.data);

          if (res.data.length > 0) {
            setFormData((prev) => ({
              ...prev,
              customer: res.data[0]._id,
            }));
          }
        })
        .catch(console.log);
    }

    // future use
    api.get("/addresses").then((res) => setAddresses(res.data)).catch(console.log);
  }, [role]);

  const labelClass = "block text-sm font-medium text-gray-700 mt-3 mb-1.5";
  const inputClass =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-200";
  const sectionTitle =
    "text-md font-semibold text-gray-800 mt-6 mb-3 pb-1 border-gray-200 border-b";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white shadow rounded-xl p-6 space-y-4 w-full max-w-5xl mx-auto"
    >
      <h2 className="text-xl font-bold border-b border-gray-300 pb-3">
        {title || "New Load"}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {(role === "admin" || role === "staff") && (
          <div>
            <label className={labelClass}>Customer</label>
            <select
              className={inputClass}
              value={formData.customer || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  customer: e.target.value,
                }))
              }
              disabled={loading}
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.firstName} {c.lastName} ({c.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>Ref #</label>
          <input
            name="refNo"
            value={formData.refNo}
            className={inputClass}
            onChange={handleChange}
          />
        </div>
      </div>

      <h3 className={sectionTitle}>Delivery Modality</h3>

      <div className="flex gap-6">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            value="ROUNDED"
            checked={formData.deliveryType === "ROUNDED"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                deliveryType: e.target.value,
              }))
            }
          />
          Rounded Trip
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            value="SINGLE"
            checked={formData.deliveryType === "SINGLE"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                deliveryType: e.target.value,
              }))
            }
          />
          Single Delivery
        </label>
      </div>

      {formData.deliveryType === "SINGLE" && (
        <select
          className={inputClass}
          value={formData.singleType}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              singleType: e.target.value,
            }))
          }
        >
          <option value="Pick Up">Pick Up</option>
          <option value="Delivery">Delivery</option>
          <option value="Drop">Drop</option>
        </select>
      )}

      {/* 🚫 Pickup/Drop will be added in next step */}

      <AddNewAddressModal
        isShow={isShow}
        setIsShow={setIsShow}
        onSuccess={(newAddress) => {
          setAddresses((prev) => [...prev, newAddress]);
        }}
      />

      <h3 className={sectionTitle}>Details & Commodity</h3>

      <div className="grid grid-cols-4 gap-4">
        <select
          name="truckType"
          className={inputClass}
          value={formData.truckType}
          onChange={handleChange}
        >
          <option value="">Load Type</option>
          {truckTypeOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <input
          name="material"
          placeholder="Material"
          value={formData.material}
          className={inputClass}
          onChange={handleChange}
        />

        <input
          name="amount"
          type="number"
          placeholder="Amount"
          value={formData.amount}
          className={inputClass}
          onChange={handleChange}
        />

        <input
          type="date"
          name="lastFreeDate"
          value={formData.lastFreeDate}
          className={inputClass}
          onChange={handleChange}
        />
      </div>

      <div className="flex gap-4">
        <label>
          <input type="checkbox" name="hazmat" onChange={handleChange} /> Hazmat
        </label>
        <label>
          <input type="checkbox" name="chassisRent" onChange={handleChange} /> Chassis
        </label>
        <label>
          <input type="checkbox" name="railContainer" onChange={handleChange} /> Rail
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={(e) => handleSubmit(e, "DRAFT")}
          className="px-4 py-2 border rounded"
        >
          Save Draft
        </button>

        <button
          type="button"
          onClick={(e) => handleSubmit(e, "PENDING_VERIFICATION")}
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          Submit
        </button>
      </div>
    </form>
  );
};

export default LoadForm;