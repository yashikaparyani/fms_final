// pages/EditLoad.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { uiStyles } from "../style/uiStyles";
import api from "../api";
import AppSelect from "../components/AppSelect";
import AddressFields from "../components/AddressFields";

// ─── Zod Schema ───────────────────────────────────────────────────────────────
const loadSchema = z.object({
  customer: z.string().min(1, "Please select a customer"),
  refNo: z.string().optional(),
  deliveryType: z.enum(["ROUNDED", "SINGLE"]),
  singleType: z.enum(["Pick Up", "Delivery", "Drop"]).optional(),
  truckType: z.string().min(1, "Truck type is required"),
  material: z.string().min(1, "Material is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Amount must be a valid number",
    }),
  lastFreeDate:    z.string().optional(),
  orderBillDate:   z.string().optional(),
  containerType:   z.string().optional(),
  commodity:       z.string().optional(),
  bookingNo:       z.string().optional(),
  shippingLine:    z.string().optional(),
  containerNo:     z.string().optional(),
  pickupNo:        z.string().optional(),
  sealNo:          z.string().optional(),
  hazmat:          z.boolean(),
  chassisRent:     z.boolean(),
  railContainer:   z.boolean(),
  dryVan:          z.boolean(),
  reefer:          z.boolean(),
  accChargesEmail: z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid accessorial charges email" }),
  podEmail:        z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid POD email" }),
  deliveryEmail:   z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid delivery email" }),
  billingEmail:    z.string().optional().refine((val) => !val || z.string().email().safeParse(val).success, { message: "Invalid billing email" }),
  description:     z.string().optional(),
  remarks:         z.string().optional(),
  driverRequirement: z.enum(["Solo Driver", "Team Driver"]),
});

// ─── Step Indicator ───────────────────────────────────────────────────────────
const StepIndicator = ({ step }) => {
  const steps = [
    { num: 1, label: "Load Details" },
    { num: 2, label: "Pickup Address" },
    { num: 3, label: "Drop Address" },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${
              step > s.num ? "bg-green-500 border-green-500 text-white"
              : step === s.num ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-white border-gray-200 text-gray-400"
            }`}>
              {step > s.num ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : s.num}
            </div>
            <span className={`hidden md:block text-xs mt-1.5 font-semibold whitespace-nowrap ${step >= s.num ? "text-gray-800" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-5 transition-all duration-500 ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Stop Form (Pickup / Drop) ────────────────────────────────────────────────
const emptyStop = {
  company: "", address: "", city: "", state: "", zip: "", pickupDate: "", deliveryDate: "",
};

// An <input type="date"> needs a bare YYYY-MM-DD; the API hands back an ISO
// timestamp. Read the local calendar parts rather than slicing the ISO string,
// so the date shown here matches the one the tables render via toLocaleDateString.
const toDateInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Keep only the editable stop fields (drops the server-generated _id).
// The dates must survive this round-trip: the update controller replaces
// `pickups`/`drops` wholesale, so anything omitted here is erased on save.
const normalizeStop = (s = {}) => ({
  company: s.company || "",
  address: s.address || "",
  city:    s.city    || "",
  state:   s.state   || "",
  zip:     s.zip     || "",
  pickupDate:   toDateInput(s.pickupDate),
  deliveryDate: toDateInput(s.deliveryDate),
});

// Shape a stop for the API. Only the date that belongs to this kind of stop is
// sent, and a blank one goes as null — Mongoose cannot cast "" to a Date.
const toStopPayload = (isPickup) => (s) => {
  const { pickupDate, deliveryDate, ...rest } = s;
  const date = isPickup ? pickupDate : deliveryDate;
  return { ...rest, [isPickup ? "pickupDate" : "deliveryDate"]: date || null };
};

const StopForm = ({ data, onChange, loading, isPickup }) => {
  const set = (field, value) => onChange({ ...data, [field]: value });

  // ── Location cascade via AddressFields ───────────────────────────────────────
  const handleAddressChange = ({ state, city, zip }) => {
    onChange({ ...data, state, city, zip });
  };

  const dateField = isPickup ? "pickupDate" : "deliveryDate";

  return (
    <div className="space-y-4">
      <div className="relative">
        <input className={uiStyles.input} value={data.company} onChange={(e) => set("company", e.target.value)} disabled={loading} placeholder="Company" />
        <label className="input-label">Company</label>
      </div>

      <div className="relative">
        <input className={uiStyles.input} value={data.address} onChange={(e) => set("address", e.target.value)} disabled={loading} placeholder="Address *" />
        <label className="input-label">Address <span className="text-red-400">*</span></label>
      </div>

      {/* State → City → Zip cascade */}
      <AddressFields
        state={data.state || ""}
        city={data.city || ""}
        zip={data.zip || ""}
        onChange={handleAddressChange}
        disabled={loading}
        required
      />

      <div className="relative">
        <input
          type="date"
          className={uiStyles.input}
          value={data[dateField] || ""}
          onChange={(e) => set(dateField, e.target.value)}
          disabled={loading}
        />
        <label className="input-label">
          {isPickup ? "Pickup Date" : "Delivery Date"}
          {isPickup && <span className="text-red-400"> *</span>}
        </label>
      </div>
    </div>
  );
};

// ─── Repeatable list of stops (origins / destinations) ───────────────────────
const StopList = ({ singular, stops, setStops, loading, updateStop, addStop, removeStop, isPickup }) => (
  <div className="space-y-4">
    {stops.map((s, idx) => (
      <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-gray-700">{singular} {idx + 1}</h4>
          {stops.length > 1 && (
            <button
              type="button"
              onClick={() => removeStop(stops, setStops, idx)}
              disabled={loading}
              className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              ✕ Remove
            </button>
          )}
        </div>
        <StopForm data={s} onChange={(next) => updateStop(stops, setStops, idx, next)} loading={loading} isPickup={isPickup} />
      </div>
    ))}
    <button
      type="button"
      onClick={() => addStop(stops, setStops)}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-semibold text-gray-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition disabled:opacity-50"
    >
      + Add another {singular.toLowerCase()}
    </button>
  </div>
);

// ─── Chevron SVGs ─────────────────────────────────────────────────────────────
const ChevronRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
const ChevronLeft = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const PinIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ─── Step nav footer ─────────────────────────────────────────────────────────
const StepFooter = ({ onBack, onNext, nextLabel, nextClass = "btn-primary", submitting, backLabel = "Back" }) => (
  <div className={`${uiStyles.flexBetween} gap-3 pt-6 border-t border-gray-200 mt-6`}>
    <button type="button" onClick={onBack} disabled={submitting} className="btn-secondary disabled:opacity-50">
      <ChevronLeft /> {backLabel}
    </button>
    <button type="button" onClick={onNext} disabled={submitting} className={`${nextClass} disabled:opacity-50`}>
      {submitting ? "Saving…" : <>{nextLabel}</>}
    </button>
  </div>
);

// ─── Address step info banner ────────────────────────────────────────────────
const AddressBanner = ({ color = "indigo", icon, title, note }) => {
  const palette = {
    indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
    amber:  "bg-amber-50  border-amber-100  text-amber-700",
  };
  return (
    <div className={`${palette[color]} border rounded-xl p-4 mb-5`}>
      <div className={`flex items-center gap-2 text-sm font-semibold mb-1`}>
        {icon} {title}
      </div>
      <p className="text-muted">
        Fields marked with <span className="text-red-500 font-bold">*</span> are required. {note}
      </p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const EditLoad = () => {
  const { loadId } = useParams();
  const navigate   = useNavigate();
  const user       = JSON.parse(localStorage.getItem("user"));
  const role       = user?.role;

  const [step,        setStep]        = useState(1);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [loadStatus,  setLoadStatus]  = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [customers,   setCustomers]   = useState([]);
  const [shippingLines, setShippingLines] = useState([]);
  const [pickups,     setPickups]     = useState([{ ...emptyStop }]);
  const [drops,       setDrops]       = useState([{ ...emptyStop }]);

  // ── Multi-stop helpers (shared by origins & destinations) ────────────────
  const updateStop = (list, setList, index, next) =>
    setList(list.map((s, i) => (i === index ? next : s)));
  const addStop = (list, setList) => setList([...list, { ...emptyStop }]);
  const removeStop = (list, setList, index) =>
    setList(list.length > 1 ? list.filter((_, i) => i !== index) : list);

  const truckTypeOptions     = ["Container", "Flatbed", "Reefer", "Van", "Dry Van", "Open Truck", "Refrigerated", "Other"];
  const containerTypeOptions = ["40 Std", "40 HC", "45", "20"];
  const commodityOptions     = ["Chilled", "Dry", "Other", "Produce", "Frozen"];

  const { register, handleSubmit, watch, reset, control, formState: { errors } } = useForm({
    resolver: zodResolver(loadSchema),
    defaultValues: {
      customer: "", refNo: "", deliveryType: "ROUNDED", singleType: "Pick Up",
      truckType: "", material: "", amount: "", lastFreeDate: "", orderBillDate: "",
      containerType: "", commodity: "", bookingNo: "", shippingLine: "",
      containerNo: "", pickupNo: "", sealNo: "",
      hazmat: false, chassisRent: false, railContainer: false, dryVan: false, reefer: false,
      accChargesEmail: "", podEmail: "", deliveryEmail: "", billingEmail: "",
      description: "", remarks: "",
      driverRequirement: "Solo Driver",
    },
  });

  const deliveryType = watch("deliveryType");
  const shippingLine = watch("shippingLine");

  // ── Error helper ────────────────────────────────────────────────────────
  const inputErrorClass = `${uiStyles.input} ${uiStyles.inputError}`;
  const cx = (name) => errors[name] ? inputErrorClass : uiStyles.input;

  // ── Fetch customers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (role === "admin" || role === "staff") {
      api.get("/customers").then((res) => setCustomers(res.data)).catch(() => {});
    }
  }, [role]);

  // ── Fetch shipping line master ───────────────────────────────────────────
  useEffect(() => {
    api
      .get("/shipping-lines", { params: { active: true } })
      .then((res) => setShippingLines(res.data))
      .catch(() => {});
  }, []);

  // A load saved before this master existed (or whose line was since removed or
  // deactivated) keeps its value as an extra option, so editing never blanks it.
  const shippingLineOptions = (() => {
    const options = shippingLines.map((l) => ({
      value: l.name,
      label: l.code ? `${l.name} (${l.code})` : l.name,
    }));
    if (shippingLine && !options.some((o) => o.value === shippingLine)) {
      options.unshift({ value: shippingLine, label: `${shippingLine} (not in master)` });
    }
    return options;
  })();

  // ── Fetch & pre-populate ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchLoad = async () => {
      try {
        const res  = await api.get(`/loads/${loadId}`);
        const load = res.data;

        setLoadStatus(load.status);
        setChangesNote(load.changesNote || "");

        // Initialise origins from the pickups array, falling back to the
        // legacy single pickup, then to one empty stop.
        const initPickups =
          Array.isArray(load.pickups) && load.pickups.length
            ? load.pickups.map(normalizeStop)
            : load.pickup && (load.pickup.address || load.pickup.city)
              ? [normalizeStop(load.pickup)]
              : [{ ...emptyStop }];
        setPickups(initPickups);

        const initDrops =
          Array.isArray(load.drops) && load.drops.length
            ? load.drops.map(normalizeStop)
            : load.drop && (load.drop.address || load.drop.city)
              ? [normalizeStop(load.drop)]
              : [{ ...emptyStop }];
        setDrops(initDrops);

        reset({
          customer:        load.customer        || load.customerId || "",
          refNo:           load.refNo           || "",
          deliveryType:    load.deliveryType    || "ROUNDED",
          singleType:      load.singleType      || "Pick Up",
          truckType:       load.truckType       || "",
          material:        load.material        || "",
          amount:          load.amount          ? String(load.amount) : "",
          lastFreeDate:    load.lastFreeDate    ? load.lastFreeDate.slice(0, 10)    : "",
          orderBillDate:   load.orderBillDate   ? load.orderBillDate.slice(0, 10)   : "",
          containerType:   load.containerType   || "",
          commodity:       load.commodity       || "",
          bookingNo:       load.bookingNo       || "",
          shippingLine:    load.shippingLine    || "",
          containerNo:     load.containerNo     || "",
          pickupNo:        load.pickupNo        || "",
          sealNo:          load.sealNo          || "",
          hazmat:          load.hazmat          || false,
          chassisRent:     load.chassisRent     || false,
          railContainer:   load.railContainer   || false,
          dryVan:          load.dryVan          || false,
          reefer:          load.reefer          || false,
          accChargesEmail: load.accChargesEmail || "",
          podEmail:        load.podEmail        || "",
          deliveryEmail:   load.deliveryEmail   || "",
          billingEmail:    load.billingEmail    || "",
          description:     load.description     || "",
          remarks:         load.remarks         || "",
          driverRequirement: load.driverRequirement || "Solo Driver",
        });
      } catch {
        toast.error("Failed to load order details");
        navigate(-1);
      } finally {
        setPageLoading(false);
      }
    };
    fetchLoad();
  }, [loadId, navigate, role, reset]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const onStep1Submit = async (data) => {
    setSubmitting(true);
    try {
      await api.put(`/loads/${loadId}`, data);
      toast.success("Load details updated! Now review the pickup address.");
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update load details");
    } finally {
      setSubmitting(false);
    }
  };

  const onStep2Submit = async () => {
    const invalid = pickups.some((p) => !p.address || !p.city || !p.state || !p.zip);
    if (invalid) {
      toast.error("Please fill all required fields (Address, City, State, Zip) for every origin");
      return;
    }
    if (pickups.some((p) => !p.pickupDate)) {
      toast.error("Pickup date is required for every origin");
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/loads/${loadId}`, {
        pickups: pickups.map(toStopPayload(true)),
      });
      toast.success("Origins saved! Now review the destinations.");
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error saving pickup address");
    } finally {
      setSubmitting(false);
    }
  };

  const onStep3Submit = async () => {
    const invalid = drops.some((d) => !d.address || !d.city || !d.state || !d.zip);
    if (invalid) {
      toast.error("Please fill all required fields (Address, City, State, Zip) for every destination");
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/loads/${loadId}`, {
        drops: drops.map(toStopPayload(false)),
      });
      const isInternal = role === "admin" || role === "staff";
      toast.success(
        isInternal
          ? "Load updated successfully!"
          : "Load updated and resubmitted for verification!"
      );
      navigate(`/${role}/track-load/${loadId}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error saving drop address");
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <div className={`min-h-screen bg-gray-50 ${uiStyles.flexCenter}`}>
        <p className={uiStyles.subtitle}>Loading load details…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-0 md:px-4">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="page-title">Edit Load — {loadId}</h1>
          <p className="page-subtitle">Update the fields below and resubmit for verification.</p>
        </div>

        {/* ── Changes Requested Banner ── */}
        {loadStatus === "REQUIRES_CHANGES" && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-sm font-bold text-orange-800 mb-1">⚠ Changes Requested by Staff</p>
            {changesNote
              ? <p className="text-sm text-orange-700 whitespace-pre-wrap">{changesNote}</p>
              : <p className="text-sm text-orange-600 italic">Please review and update the information below, then resubmit.</p>
            }
          </div>
        )}

        {/* ── Step Indicator ── */}
        <StepIndicator step={step} />

        {/* ── Card ── */}
        <div className={uiStyles.card}>

          {/* ════════ STEP 1: Load Details ════════ */}
          {step === 1 && (
            <form onSubmit={(e) => e.preventDefault()}>
              <h2 className="h4 mb-4">Load Details</h2>

              {/* Customer / Ref */}
              <div className={uiStyles.grid2}>
                {(role === "admin" || role === "staff") && (
                  <div className="relative">
                    <Controller
                      name="customer"
                      control={control}
                      render={({ field }) => (
                        <AppSelect
                          options={customers.map((c) => ({ value: c._id, label: `${c.firstName} ${c.lastName} (${c.email})` }))}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Search customer..."
                          error={!!errors.customer}
                          isDisabled={submitting}
                        />
                      )}
                    />
                    <label className="input-label">Customer</label>
                    {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer.message}</p>}
                  </div>
                )}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Ref #" {...register("refNo")} disabled={submitting} />
                  <label className="input-label">Ref #</label>
                </div>
              </div>

              {/* Delivery Modality */}
              <h3 className="form-subtitle">Delivery Modality</h3>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
                <div className="flex items-center gap-6">
                  {["ROUNDED", "SINGLE"].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer label">
                      <input type="radio" value={val} {...register("deliveryType")} disabled={submitting} />
                      {val === "ROUNDED" ? "Rounded Trip" : "Single Delivery"}
                    </label>
                  ))}
                </div>
                {deliveryType === "SINGLE" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 md:ml-auto w-full md:w-auto">
                    <label className="label whitespace-nowrap !mb-0">Type:</label>
                    <select
                      className="text-sm border-none bg-transparent focus:outline-none text-indigo-700 font-medium w-full md:w-auto"
                      {...register("singleType")} disabled={submitting}
                    >
                      <option value="Pick Up">Pick Up</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Drop">Drop</option>
                    </select>
                  </div>
                )}
              </div>

              <h3 className="form-subtitle">Team Required</h3>
              <div className="flex items-center gap-8">
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Solo Driver" {...register("driverRequirement")} disabled={submitting} /> Solo Driver
                </label>
                <label className="flex items-center gap-2 cursor-pointer label">
                  <input type="radio" value="Team Driver"  {...register("driverRequirement")} disabled={submitting} /> Team Driver
                </label>
              </div>

              {/* Details & Commodity */}
              <h3 className="form-subtitle">Details & Commodity</h3>
              <div className={uiStyles.grid2}>
                {/* Truck Type */}
                <div className="relative">
                  <Controller
                    name="truckType"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={truckTypeOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select truck type..."
                        error={!!errors.truckType}
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Truck Type <span className="text-red-400">*</span></label>
                  {errors.truckType && <p className="text-xs text-red-500 mt-1">{errors.truckType.message}</p>}
                </div>

                {/* Material */}
                <div className="relative">
                  <input className={cx("material")} placeholder="e.g. Steel Coils" {...register("material")} disabled={submitting} />
                  <label className="input-label">Material <span className="text-red-400">*</span></label>
                  {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material.message}</p>}
                </div>

                {/* Amount */}
                <div className="relative">
                  <input type="number" className={cx("amount")} placeholder="0.00" {...register("amount")} disabled={submitting} />
                  <label className="input-label">Base Amount <span className="text-red-400">*</span></label>
                  {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
                </div>

                {/* Last Free Date */}
                <div className="relative">
                  <input type="date" className={uiStyles.input} {...register("lastFreeDate")} disabled={submitting} />
                  <label className="input-label">Last Free Date</label>
                </div>

                {/* Container Type */}
                <div className="relative">
                  <Controller
                    name="containerType"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={containerTypeOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select..."
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Container Type</label>
                </div>

                {/* Commodity */}
                <div className="relative">
                  <Controller
                    name="commodity"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={commodityOptions.map((t) => ({ value: t, label: t }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select..."
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Commodity</label>
                </div>

                {/* Booking # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Booking #" {...register("bookingNo")} disabled={submitting} />
                  <label className="input-label">Booking #</label>
                </div>

                {/* Order Bill Date */}
                <div className="relative">
                  <input type="date" className={uiStyles.input} {...register("orderBillDate")} disabled={submitting} />
                  <label className="input-label">Order Bill Date</label>
                </div>

                {/* Shipping Line */}
                <div className="relative">
                  <Controller
                    name="shippingLine"
                    control={control}
                    render={({ field }) => (
                      <AppSelect
                        options={shippingLineOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={shippingLineOptions.length ? "Select..." : "No shipping lines yet"}
                        noOptionsMessage={() => "No shipping lines. Add them under Admin → Shipping Lines."}
                        isClearable
                        isDisabled={submitting}
                      />
                    )}
                  />
                  <label className="input-label">Shipping Line</label>
                </div>

                {/* Container # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Container #" {...register("containerNo")} disabled={submitting} />
                  <label className="input-label">Container #</label>
                </div>

                {/* Pickup # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Pickup #" {...register("pickupNo")} disabled={submitting} />
                  <label className="input-label">Pickup #</label>
                </div>

                {/* Seal # */}
                <div className="relative">
                  <input className={uiStyles.input} placeholder="Seal #" {...register("sealNo")} disabled={submitting} />
                  <label className="input-label">Seal #</label>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6 mt-4">
                {[
                  { name: "hazmat",        label: "Hazmat" },
                  { name: "chassisRent",   label: "Chassis Rent" },
                  { name: "railContainer", label: "Rail Container" },
                  { name: "dryVan",        label: "Dry Van" },
                  { name: "reefer",        label: "Reefer" },
                ].map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2 label cursor-pointer">
                    <input type="checkbox" className="rounded" {...register(name)} disabled={submitting} />
                    {label}
                  </label>
                ))}
              </div>

              {/* Emails */}
              <h3 className="form-subtitle">Emails</h3>
              <div className={uiStyles.grid2}>
                {[
                  { name: "accChargesEmail", label: "Accessorial Charges Email" },
                  { name: "podEmail",        label: "POD Email" },
                  { name: "deliveryEmail",   label: "Delivery Email" },
                  { name: "billingEmail",    label: "Billing Email" },
                ].map(({ name, label }) => (
                  <div key={name} className="relative">
                    <input className={cx(name)} placeholder={label} {...register(name)} disabled={submitting} />
                    <label className="input-label">{label}</label>
                    {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name].message}</p>}
                  </div>
                ))}
              </div>

              {/* Description & Remarks */}
              <h3 className="form-subtitle">Description & Remarks</h3>
              <div className="space-y-3">
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add description..." {...register("description")} disabled={submitting} />
                  <label className="input-label">Description</label>
                </div>
                <div className="relative">
                  <textarea rows={2} className={uiStyles.textarea} placeholder="Add remarks..." {...register("remarks")} disabled={submitting} />
                  <label className="input-label">Remarks</label>
                </div>
              </div>

              {/* Footer */}
              <div className={`${uiStyles.flexBetween} gap-3 pt-6 border-t border-gray-200 mt-6`}>
                <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="button" onClick={handleSubmit(onStep1Submit)} disabled={submitting} className="btn-primary disabled:opacity-50">
                  {submitting ? "Saving…" : <> Save & Continue <ChevronRight /> </>}
                </button>
              </div>
            </form>
          )}

          {/* ════════ STEP 2: Pickup Address ════════ */}
          {step === 2 && (
            <div>
              <div className={`${uiStyles.flexBetween} mb-5`}>
                <div>
                  <h2 className="h4">Pickup / Origin Address</h2>
                  <p className="page-subtitle mt-0.5">Review and update the origin(s). Add more if the load has multiple pickups.</p>
                </div>
                <span className="badge-green">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Details Saved
                </span>
              </div>

              <AddressBanner color="indigo" icon={<PinIcon />} title="Origin(s) / Pickup" />

              <StopList
                singular="Origin"
                stops={pickups}
                setStops={setPickups}
                loading={submitting}
                updateStop={updateStop}
                addStop={addStop}
                removeStop={removeStop}
                isPickup
              />

              <StepFooter
                onBack={() => setStep(1)}
                onNext={onStep2Submit}
                nextLabel={<> Save Origins & Continue <ChevronRight /></>}
                submitting={submitting}
              />
            </div>
          )}

          {/* ════════ STEP 3: Drop Address ════════ */}
          {step === 3 && (
            <div>
              <div className={`${uiStyles.flexBetween} mb-5`}>
                <div>
                  <h2 className="h4">Drop / Destination Address</h2>
                  <p className="page-subtitle mt-0.5">Final step — review the destination(s). Add more if the load has multiple drops.</p>
                </div>
                <span className="badge-green">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Origins Saved
                </span>
              </div>

              <AddressBanner color="amber" icon={<PinIcon />} title="Destination(s) / Drop" />

              <StopList
                singular="Destination"
                stops={drops}
                setStops={setDrops}
                loading={submitting}
                updateStop={updateStop}
                addStop={addStop}
                removeStop={removeStop}
              />

              <StepFooter
                onBack={() => setStep(2)}
                onNext={onStep3Submit}
                nextLabel={
                  role === "admin" || role === "staff"
                    ? <> <CheckIcon /> Save Changes </>
                    : <> <CheckIcon /> Save & Resubmit for Verification </>
                }
                nextClass="btn-primary !bg-green-600 !border-green-600 hover:!bg-green-700"
                submitting={submitting}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default EditLoad;