import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataGrid } from "@mui/x-data-grid";
import { Chip } from "@mui/material";
import api from "../api";
import { toast } from "react-toastify";
import DocumentUpload from "../components/DocumentUpload";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  isAssignedToCarrier,
  STATUS_LOCKED_REASON,
} from "../utils/loadAssignment";
import {
  SELECTABLE_TRANSPORT_STATUSES,
  transportStatusLabel,
} from "../utils/transportStatus";
import { formatDateNumeric, formatDateTime } from "../utils/dates";

const DOCUMENT_TYPES = [
  "Load Document",
  "Bare Chassis In-Gate/Out-Gate",
  "Bill Of Lading",
  "Out-Gate Interchange",
  "In-Gate Interchange",
  "Proof of Delivery",
  "Scale Ticket",
  "Lumper Receipt",
  "Misc.",
  "Carrier Invoice",
];

const StaffLoadDetails = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();

  const [load, setLoad] = useState(null);
  console.log("Load from URL:", load); 
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedLoadStatus, setSelectedLoadStatus] = useState("");
  const [selectedLoadLocation, setSelectedLoadLocation] = useState("");
  const [loadStatusComment, setLoadStatusComment] = useState("");
  const [extraData, setExtraData] = useState({
    invoiceNo: "",
    assignedTo: "",
    carrierName: "",
    dateTime: "",
    containerLocation: "",
    personBill: "",
    bookingProblem: false,
    putOnHold: false,
    hotShipment: false,
    isAccessorialCharges: false,
    pierTermination: "",
    emptyReturn: "",
    contactPerson: "",
  });

 

  // Document upload state
  const [selectedDocType, setSelectedDocType] = useState(DOCUMENT_TYPES[0]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDocRow, setSelectedDocRow] = useState(null);

  useEffect(() => {
    if (loadId) fetchLoad();
  }, [loadId]);

  // The form below keeps its own state, so refreshing the load underneath it
  // does not disturb anything the user has typed. Held while a save or upload
  // is in flight.
  useAutoRefresh(() => fetchLoad({ silent: true }), {
    enabled: !loading && !uploading,
  });

  // `silent` keeps the background refresh from toasting on a blip.
  const fetchLoad = async ({ silent = false } = {}) => {
    try {
      const res = await api.get(`/loads/${loadId}`);
      setLoad(res.data);
    } catch (err) {
      console.error(err);
      if (!silent) toast.error("Failed to fetch load");
    }
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setExtraData((prev) => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSaveExtra = async () => {
    setLoading(true);
    try {
      await api.put(`/loads/${loadId}`, extraData);
      if (selectedStatus) {
        await api.put(`/loads/${loadId}/transport-status`, {
          transportStatus: selectedStatus,
        });
      }
      toast.success("Details updated");
      fetchLoad();
      setLoading(false);
    } catch (err) {
      toast.error("Failed to update");
      setLoading(false);
    }
  };

  // ── Document Handlers ──────────────────────────────────────
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0] || null);
  };

  const handleUploadDocument = async () => {
    if (!selectedFile) return toast.error("Please choose a file");
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("documentType", selectedDocType);

    try {
      setUploading(true);
      await api.post(`/loads/${loadId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      setSelectedFile(null);
      // reset file input
      document.getElementById("doc-file-input").value = "";
      fetchLoad();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!selectedDocRow) return toast.error("Select a document row to delete");
    try {
      await api.delete(`/loads/${loadId}/documents/${selectedDocRow}`);
      toast.success("Document deleted");
      setSelectedDocRow(null);
      fetchLoad();
    } catch (err) {
      toast.error("Delete failed");
    }
  };
  // ──────────────────────────────────────────────────────────

  if (!load) return <div className="p-6">Loading...</div>;

  const statusUnlocked = isAssignedToCarrier(load);

  const rows = [load];

  // ── Column Definitions ─────────────────────────────────────
  const basicColumns = [
    { field: "loadId", headerName: "Load ID", flex: 1 },
    { field: "customerName", headerName: "Customer", flex: 1 },
    { field: "refNo", headerName: "Ref No", flex: 1 },
    { field: "truckType", headerName: "Load Type", flex: 1 },
    { field: "material", headerName: "Material", flex: 1 },
    { field: "driverRequirement", headerName: "Team Required", flex: 1 },
    { field: "amount", headerName: "Amount", flex: 1 },
  ];

  const containerColumns = [
    { field: "containerType", headerName: "Container Type", flex: 1 },
    { field: "containerNo", headerName: "Container No", flex: 1 },
    // Populated only on a Drop, which moves two containers.
    { field: "containerNo2", headerName: "Container No 2", flex: 1 },
    { field: "chassisCompany", headerName: "Chassis Company", flex: 1 },
    { field: "bookingNo", headerName: "Booking No", flex: 1 },
    { field: "shippingLine", headerName: "Shipping Line", flex: 1 },
    { field: "sealNo", headerName: "Seal No", flex: 1 },
    { field: "pickupNo", headerName: "Pickup No", flex: 1 },
    { field: "singleType", headerName: "Type", flex: 1 },
  ];

  const routeColumns = [
  {
    field: "origin",
    headerName: "Origin",
    flex: 1,
    renderCell: (p) =>
      `${p.row.pickup?.city || "-"}, ${p.row.pickup?.state || ""}`,
  },
  {
    field: "destination",
    headerName: "Destination",
    flex: 1,
    renderCell: (p) =>
      `${p.row.drop?.city || "-"}, ${p.row.drop?.state || ""}`,
  },
];

  const statusColumns = [
    {
      field: "hazmat",
      headerName: "Hazmat",
      flex: 0.7,
      renderCell: (p) => (
        <Chip
          label={p.value ? "Yes" : "No"}
          color={p.value ? "error" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "chassisRent",
      headerName: "Chassis",
      flex: 0.7,
      renderCell: (p) => (
        <Chip
          label={p.value ? "Yes" : "No"}
          color={p.value ? "primary" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "railContainer",
      headerName: "Rail",
      flex: 0.7,
      renderCell: (p) => (
        <Chip
          label={p.value ? "Yes" : "No"}
          color={p.value ? "secondary" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "bidStatus",
      headerName: "Bid Status",
      flex: 1,
      renderCell: (p) => (
        <Chip
          label={p.value || "UPCOMING"}
          color={
            p.value === "OPEN"
              ? "success"
              : p.value === "CLOSED"
                ? "error"
                : "default"
          }
          size="small"
        />
      ),
    },
    { field: "status", headerName: "Load Status", flex: 1 },
    { field: "transportStatus", headerName: "Status", flex: 1 },
    { field: "accChargesEmail", headerName: "Acc Charges Email", flex: 1.5 },
    { field: "billingEmail", headerName: "Billing Email", flex: 1.5 },
    { field: "deliveryEmail", headerName: "Delivery Email", flex: 1.5 },
    { field: "podEmail", headerName: "POD Email", flex: 1.5 },
    {
      field: "orderBillDate",
      headerName: "Order Bill Date",
      flex: 1,
      renderCell: (p) =>
        p.value ? formatDateNumeric(p.value) : "-",
    },
    {
      field: "lastFreeDate",
      headerName: "Last Free Date",
      flex: 1,
      renderCell: (p) =>
        p.value ? formatDateNumeric(p.value) : "-",
    },
    { field: "description", headerName: "Description", flex: 2 },
    { field: "remarks", headerName: "Remarks", flex: 2 },
  ];

  // Document table rows
  const docRows = (load.documents || []).map((doc) => ({
    id: doc._id,
    documentType: doc.documentType,
    fileName: doc.fileName,
    dateReceived: doc.dateReceived
      ? formatDateNumeric(doc.dateReceived)
      : "-",
    filePath: doc.filePath,
  }));

  const docColumns = [
    { field: "documentType", headerName: "Document Type", flex: 1.5 },
    { field: "fileName", headerName: "File Name", flex: 1.5 },
    { field: "dateReceived", headerName: "Date Received", flex: 1 },
    {
      field: "view",
      headerName: "View",
      flex: 0.7,
      renderCell: (p) => (
        <a
          href={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/${p.row.filePath}`}
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 underline text-sm"
        >
          View
        </a>
      ),
    },
  ];
  // ──────────────────────────────────────────────────────────

  const inputClass =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border-gray-200";
  const labelClass = "block text-xs font-semibold text-gray-700 mb-1";
  const checkboxClass = "w-4 h-4 accent-indigo-600 cursor-pointer";

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold mb-6">Load Details - {load?.loadId}</h2>

      {/* IDENTIFICATION SECTION */}
      <div className="bg-white p-4 rounded shadow">
        <h3 className="font-semibold text-gray-700 mb-4">Identification</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Ref #</label>
            <div className="px-3 py-2 text-sm bg-gray-50 rounded border">{load?.refNo || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Assigned To</label>
            <input
              className={inputClass}
              name="assignedTo"
              placeholder="Assign To"
              value={extraData.assignedTo}
              onChange={handleChange}
            />
            {/* Who to actually call at the carrier. Drivers are on the load's
                driverAssignments and are deliberately not listed — the office
                deals with the account person, not whoever is behind the wheel. */}
            {load?.accountPerson?.name && (
              <p className="text-[11px] text-gray-500 mt-1">
                Contact: {load.accountPerson.name}
                {load.accountPerson.phone ? ` · ${load.accountPerson.phone}` : ""}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Order Status</label>
            <div className="px-3 py-2 text-sm bg-gray-50 rounded border">{load?.status || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Container Size/Location</label>
            <input
              className={inputClass}
              name="containerLocation"
              placeholder="Container Location"
              value={extraData.containerLocation}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className={labelClass}>Order Bill Date</label>
            <div className="px-3 py-2 text-sm bg-gray-50 rounded border">
              {load?.orderBillDate ? formatDateNumeric(load.orderBillDate) : "-"}
            </div>
          </div>
          <div>
            <label className={labelClass}>Person Bill</label>
            <input
              className={inputClass}
              name="personBill"
              placeholder="Person Bill"
              value={extraData.personBill}
              onChange={handleChange}
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="bookingProblem"
                checked={extraData.bookingProblem}
                onChange={handleChange}
                className={checkboxClass}
              />
              <span className="text-sm font-medium text-gray-700">Booking Problem</span>
            </label>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="putOnHold"
                checked={extraData.putOnHold}
                onChange={handleChange}
                className={checkboxClass}
              />
              <span className="text-sm font-medium text-gray-700">Put on Hold</span>
            </label>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="hotShipment"
                checked={extraData.hotShipment}
                onChange={handleChange}
                className={checkboxClass}
              />
              <span className="text-sm font-medium text-gray-700">Hot Shipment</span>
            </label>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isAccessorialCharges"
                checked={extraData.isAccessorialCharges}
                onChange={handleChange}
                className={checkboxClass}
              />
              <span className="text-sm font-medium text-gray-700">Is Accessorial Charges</span>
            </label>
          </div>
        </div>
      </div>

      {/* ORDER IDENTIFICATION SECTION */}
      <div className="bg-yellow-50 p-4 rounded shadow border border-yellow-200">
        <h3 className="font-semibold text-gray-700 mb-4">Order Identification</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Customer</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.customerName || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Pickup #</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.pickup?.poNumber || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Container #</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.containerNo || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Chassis #</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.pickup?.company || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Pieces</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.pickup?.pieces || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Weight</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.pickup?.weight || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Commodity</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.commodity || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Seal #</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.sealNo || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Booking #</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.bookingNo || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Created By</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.createdBy || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Created On</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">
              {load?.createdAt ? formatDateTime(load.createdAt) : "-"}
            </div>
          </div>
          <div>
            <label className={labelClass}>Updated On</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">
              {load?.updatedAt ? formatDateTime(load.updatedAt) : "-"}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Description</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.description || "-"}</div>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Remarks</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">{load?.remarks || "-"}</div>
          </div>
          <div>
            <label className={labelClass}>Last Free Date</label>
            <div className="px-3 py-2 text-sm bg-white rounded border">
              {load?.lastFreeDate ? formatDateNumeric(load.lastFreeDate) : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* ORIGINS SECTION */}
      <div className="bg-orange-50 p-4 rounded shadow border border-orange-200">
        <h3 className="font-semibold text-gray-700 mb-4">Origin(s)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-orange-100">
              <th className="border p-2 text-left">S.No.</th>
              <th className="border p-2 text-left">Origin</th>
              <th className="border p-2 text-left">Pickup Date/Time</th>
              <th className="border p-2 text-left">Appt #</th>
              <th className="border p-2 text-left">Appt. Given by</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2">1</td>
              <td className="border p-2">
                {load?.pickup ? `${load.pickup.address || ""}, ${load.pickup.city || ""}, ${load.pickup.state || ""}` : "-"}
              </td>
              <td className="border p-2">
                {load?.pickup?.pickupDate
                  ? `${formatDateNumeric(load.pickup.pickupDate)} ${load.pickup.fromTime || ""} To ${load.pickup.toTime || ""}`
                  : "-"}
              </td>
              <td className="border p-2">{load?.pickup?.apptNumber || "-"}</td>
              <td className="border p-2">{load?.pickup?.apptGivenBy || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DESTINATIONS SECTION */}
      <div className="bg-teal-50 p-4 rounded shadow border border-teal-200">
        <h3 className="font-semibold text-gray-700 mb-4">Destination(s)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-teal-200">
              <th className="border p-2 text-left">S.No.</th>
              <th className="border p-2 text-left">Destination(s)</th>
              <th className="border p-2 text-left">Appt. Date/Time</th>
              <th className="border p-2 text-left">Appt #</th>
              <th className="border p-2 text-left">Appt. Given by</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2">1</td>
              <td className="border p-2">
                {load?.drop ? `${load.drop.address || ""}, ${load.drop.city || ""}, ${load.drop.state || ""}` : "-"}
              </td>
              <td className="border p-2">
                {load?.drop?.deliveryDate
                  ? `${formatDateNumeric(load.drop.deliveryDate)} ${load.drop.fromTime || ""} To ${load.drop.toTime || ""}`
                  : "-"}
              </td>
              <td className="border p-2">{load?.drop?.apptNumber || "-"}</td>
              <td className="border p-2">{load?.drop?.apptGivenBy || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* LOAD STATUS INFORMATION SECTION */}
      <div className="bg-amber-50 p-4 rounded shadow border border-amber-200">
        <h3 className="font-semibold text-gray-700 mb-4">Load Status Information</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-amber-200">
              <th className="border p-2 text-left">Name</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-left">Location</th>
              <th className="border p-2 text-left">Date/Time</th>
              <th className="border p-2 text-left">Comments/Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2">
                <div className="px-2 py-1 bg-white rounded text-sm">Load Planner</div>
              </td>
              <td className="border p-2">
                <select
                  value={selectedLoadStatus}
                  onChange={(e) => setSelectedLoadStatus(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded"
                >
                  <option value="">{load?.transportStatus || "Select..."}</option>
                  <option value="NEW_LOAD">New Load</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="PICKED_UP">Picked Up</option>
                  <option value="IN_TRANSIT">In Transit</option>
                  <option value="REACHED_DESTINATION">Reached Destination</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="INVOICED">Invoiced</option>
                </select>
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={selectedLoadLocation}
                  onChange={(e) => setSelectedLoadLocation(e.target.value)}
                  placeholder="Location"
                  className="w-full px-2 py-1 text-sm border rounded"
                />
              </td>
              <td className="border p-2">
                <input
                  type="datetime-local"
                  className="w-full px-2 py-1 text-sm border rounded"
                />
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={loadStatusComment}
                  onChange={(e) => setLoadStatusComment(e.target.value)}
                  placeholder="Comments/Notes"
                  className="w-full px-2 py-1 text-sm border rounded"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ROUTING SECTION */}
      <div className="bg-gray-50 p-4 rounded shadow border">
        <h3 className="font-semibold text-gray-700 mb-4">Routing</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Pier Termination / Empty Return</label>
            <input
              className={inputClass}
              name="pierTermination"
              placeholder="Pier Termination / Empty Return"
              value={extraData.pierTermination}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className={labelClass}>Contact Person(s)</label>
            <input
              className={inputClass}
              name="contactPerson"
              placeholder="Contact Person(s)"
              value={extraData.contactPerson}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {/* ADDITIONAL FIELDS SECTION */}
      <div className="bg-white p-4 rounded shadow">
        <h3 className="font-semibold text-gray-700 mb-4">Additional Info</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Invoice No</label>
            <input
              className={inputClass}
              name="invoiceNo"
              placeholder="Invoice No"
              value={extraData.invoiceNo}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className={labelClass}>Carrier Name</label>
            <input
              className={inputClass}
              name="carrierName"
              placeholder="Carrier Name"
              value={extraData.carrierName}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className={labelClass}>Date/Time</label>
            <input
              className={inputClass}
              type="datetime-local"
              name="dateTime"
              value={extraData.dateTime}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {/* DOCUMENT UPLOAD SECTION */}
      <DocumentUpload
        loadId={loadId}
        transportStatus={load.transportStatus}
        documents={load.documents}
        refresh={fetchLoad}
      />

      {/* TRANSPORT STATUS */}
      {/* Locked until a carrier has the load — every value below is a statement
          about a carrier, and there is nobody for it to be about until then. */}
      <div className="bg-white p-4 rounded shadow">
        <h3 className="font-semibold text-gray-700 mb-4">Status</h3>
        {!statusUnlocked && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            {STATUS_LOCKED_REASON}
          </p>
        )}
        {/* The same list every other status control offers — see
            utils/transportStatus.js. It was a hand-picked seven that included
            New Load and left out most of the yard and paperwork statuses, so a
            load could reach a state this screen could not put it back into. */}
        <div className="flex gap-2 flex-wrap">
          {SELECTABLE_TRANSPORT_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              disabled={!statusUnlocked}
              title={statusUnlocked ? undefined : STATUS_LOCKED_REASON}
              className={`px-4 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedStatus === status
                  ? "btn-primary"
                  : "btn-secondary"
              }`}
            >
              {transportStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex gap-4">
        <button
          onClick={() => navigate(-1)}
          className={`px-6 py-2 rounded font-medium btn-secondary ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Cancel
        </button>
        <button
          onClick={handleSaveExtra}
          className={`px-6 py-2 rounded font-medium btn-primary ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {loading ? "Saving..." : "Save Details"}
        </button>
      </div>
    </div>
  );
};

export default StaffLoadDetails;
