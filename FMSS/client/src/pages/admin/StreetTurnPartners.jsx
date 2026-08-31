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
    // The SCAC, not a code of our own. It is the transferee's identifier on the
    // Street Turn Container and Chassis Transfer Agreement — it is what the
    // terminal and the shipping line recognise them by — and until this field
    // was surfaced there was nowhere in the UI to enter it, so every agreement
    // printed with the SCAC line blank.
    {
      name: "scac",
      label: "SCAC Code",
      placeholder: "e.g. ACME",
      hint: "Printed on the transfer agreement as the transferee's identifier.",
    },
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
