/**
 * AddressFields.jsx
 * Reusable State → City → Zip cascade component backed by live API data.
 * Drop-in for any form that has state/city/zip fields.
 *
 * Props:
 *   state    {string}   - current state abbreviation value
 *   city     {string}   - current city value
 *   zip      {string}   - current zip value
 *   onChange {function} - called with { state, city, zip } on any change
 *   disabled {boolean}  - disables all fields
 *   required {boolean}  - shows * on labels
 */
import { useStates, useCities } from "../hooks/useLocationData";
import AppSelect from "./AppSelect";
import { uiStyles } from "../style/uiStyles";

const AddressFields = ({ state, city, zip, onChange, disabled = false, required = false }) => {
  const { options: stateOptions, loading: statesLoading } = useStates();
  const { options: cityOptions, loading: citiesLoading, getCityData } = useCities(state);

  const handleStateChange = (abbr) => {
    // If state is cleared or changed, clear city and zip
    onChange({ state: abbr, city: "", zip: "" });
  };

  const handleCityChange = (jsonValue) => {
    if (!jsonValue) {
      onChange({ state, city: "", zip: "" });
      return;
    }
    const data = getCityData(jsonValue);
    if (data) {
      // Auto-fill state and zip if city is selected
      onChange({ state: data.state, city: data.city, zip: data.zip });
    }
  };

  // Find the exact JSON value for the current city + state combo
  const currentCityValue = cityOptions.find(o => {
    const data = getCityData(o.value);
    return data?.city?.toLowerCase() === city?.toLowerCase() && data?.state === state;
  })?.value || "";

  const handleZipChange = (e) => {
    onChange({ state, city, zip: e.target.value });
  };

  const req = required ? <span className="text-red-400"> *</span> : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* State */}
      <div className="relative md:col-span-12">
        <AppSelect
          options={stateOptions}
          value={state || ""}
          onChange={handleStateChange}
          placeholder={statesLoading ? "Loading..." : "State..."}
          isDisabled={disabled || statesLoading}
        />
        <label className="input-label">State{req}</label>
      </div>

      {/* City */}
      <div className="relative md:col-span-7">
        <AppSelect
          options={cityOptions}
          value={currentCityValue}
          onChange={handleCityChange}
          placeholder={citiesLoading ? "Loading..." : "City..."}
          isDisabled={disabled || citiesLoading}
        />
        <label className="input-label">City{req}</label>
      </div>

      {/* Zip */}
      <div className="relative md:col-span-5">
        <input
          className={uiStyles.input}
          placeholder="Zip"
          value={zip || ""}
          onChange={handleZipChange}
          disabled={disabled}
        />
        <label className="input-label">Zip{req}</label>
      </div>
    </div>
  );
};

export default AddressFields;
