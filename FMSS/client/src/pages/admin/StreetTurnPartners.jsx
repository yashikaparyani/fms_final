import MasterCrudPage from "../../components/admin/MasterCrudPage";

// Email is required: this is the address notified when a street turn is
// confirmed, and the address the acknowledgement link is sent to — a partner
// without one could neither be told about the handover nor sign for it.
const config = {
  singular: "Street Turn Partner",
  plural: "Street Turn Partners",
  endpoint: "/street-turn-partners",
  namePlaceholder: "e.g. Acme Logistics",
  fields: [
    { name: "code", label: "Code", placeholder: "e.g. ACME" },
    {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "dispatch@acme.com",
      required: true,
      hint: "Notified when a street turn is confirmed, and sent the link to sign it.",
    },
    { name: "phone", label: "Phone", placeholder: "Optional" },
  ],
};

const StreetTurnPartners = () => <MasterCrudPage config={config} />;

export default StreetTurnPartners;
