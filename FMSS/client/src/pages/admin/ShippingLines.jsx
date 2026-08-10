import MasterCrudPage from "../../components/admin/MasterCrudPage";

// Email is optional so lines added before street-turn notifications existed
// keep working; when set, the line is notified on a confirmed street turn.
const config = {
  singular: "Shipping Line",
  plural: "Shipping Lines",
  endpoint: "/shipping-lines",
  namePlaceholder: "e.g. Maersk",
  fields: [
    { name: "code", label: "Code", placeholder: "e.g. MAEU" },
    {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "Optional",
      hint: "If set, notified when a street turn is confirmed.",
    },
  ],
};

const ShippingLines = () => <MasterCrudPage config={config} />;

export default ShippingLines;
