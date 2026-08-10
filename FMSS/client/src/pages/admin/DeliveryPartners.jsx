import MasterCrudPage from "../../components/admin/MasterCrudPage";

// Email is required: this is the address notified when a street turn is
// confirmed, so a partner without one could never be told about the handover.
const config = {
  singular: "Delivery Partner",
  plural: "Delivery Partners",
  endpoint: "/delivery-partners",
  namePlaceholder: "e.g. Acme Logistics",
  fields: [
    { name: "code", label: "Code", placeholder: "e.g. ACME" },
    {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "dispatch@acme.com",
      required: true,
      hint: "Notified automatically when a street turn is confirmed.",
    },
    { name: "phone", label: "Phone", placeholder: "Optional" },
  ],
};

const DeliveryPartners = () => <MasterCrudPage config={config} />;

export default DeliveryPartners;
