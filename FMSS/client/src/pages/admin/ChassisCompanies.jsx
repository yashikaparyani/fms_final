import MasterCrudPage from "../../components/admin/MasterCrudPage";

// Email is optional here: a chassis company is selectable on a load whether or
// not anyone needs to be notified about it.
const config = {
  singular: "Chassis Company",
  plural: "Chassis Companies",
  endpoint: "/chassis-companies",
  namePlaceholder: "e.g. TRAC Intermodal",
  fields: [
    { name: "code", label: "Code", placeholder: "e.g. TRAC" },
    {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "Optional",
      hint: "If set, notified when a street turn is confirmed.",
    },
    { name: "phone", label: "Phone", placeholder: "Optional" },
  ],
};

const ChassisCompanies = () => <MasterCrudPage config={config} />;

export default ChassisCompanies;
