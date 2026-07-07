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
import { useState } from "react";
import { useStates, useCities } from "../hooks/useLocationData";
import AppSelect from "./AppSelect";
import { uiStyles } from "../style/uiStyles";

// Sentinel value for the "Other" option pinned at the top of the city dropdown.
const OTHER_CITY = "__ADD_OTHER_CITY__";

const AddressFields = ({ state, city, zip, onChange, disabled = false, required = false }) => {
  const { options: stateOptions, loading: statesLoading } = useStates();
  const { options: cityOptions, loading: citiesLoading, getCityData, addCity } = useCities(state);

  // Inline "add a new city" panel state
  const [addingCity, setAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newCityZip, setNewCityZip] = useState("");
  const [savingCity, setSavingCity] = useState(false);
  const [addError, setAddError] = useState("");

  // Pin "Other" to the top of the city options.
  const cityOptionsWithOther = [
    { value: OTHER_CITY, label: "➕ Other (add a new city)" },
    ...cityOptions,
  ];

  const handleStateChange = (abbr) => {
    // If state is cleared or changed, clear city and zip
    onChange({ state: abbr, city: "", zip: "" });
    // Reset any in-progress "add city" panel since it was tied to the old state
    setAddingCity(false);
    setNewCityName("");
    setNewCityZip("");
    setAddError("");
  };

  const handleCityChange = (jsonValue) => {
    if (jsonValue === OTHER_CITY) {
      // Open the inline add-city panel instead of selecting a value
      setAddError("");
      setNewCityName("");
      setNewCityZip(zip || "");
      setAddingCity(true);
      return;
    }
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

  const handleSaveNewCity = async () => {
    const trimmed = newCityName.trim();
    if (!state) {
      setAddError("Please select a state first.");
      return;
    }
    if (!trimmed) {
      setAddError("Please enter a city name.");
      return;
    }
    setSavingCity(true);
    setAddError("");
    try {
      const stateName = stateOptions.find((o) => o.value === state)?.label;
      const created = await addCity({
        city: trimmed,
        stateAbbr: state,
        stateName,
        zip: newCityZip.trim(),
      });
      // Select the newly added city
      onChange({ state: created.stateAbbr, city: created.city, zip: created.zip });
      setAddingCity(false);
      setNewCityName("");
      setNewCityZip("");
    } catch (err) {
      setAddError(err?.response?.data?.message || "Could not add the city. Please try again.");
    } finally {
      setSavingCity(false);
    }
  };

  const handleCancelNewCity = () => {
    setAddingCity(false);
    setNewCityName("");
    setNewCityZip("");
    setAddError("");
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
          options={cityOptionsWithOther}
          value={currentCityValue}
          onChange={handleCityChange}
          placeholder={citiesLoading ? "Loading..." : "City..."}
          isDisabled={disabled || citiesLoading}
        />
        <label className="input-label">City{req}</label>
      </div>

      {/* Inline "add a new city" panel — shown when the user picks "Other" */}
      {addingCity && (
        <div className="md:col-span-12 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Add a new city{state ? "" : " (select a state first)"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <input
                className={uiStyles.input}
                placeholder="City name"
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveNewCity();
                  }
                }}
                disabled={savingCity}
                autoFocus
              />
            </div>
            <div className="md:col-span-5">
              <input
                className={uiStyles.input}
                placeholder="Zip (optional)"
                value={newCityZip}
                onChange={(e) => setNewCityZip(e.target.value)}
                disabled={savingCity}
              />
            </div>
          </div>
          {addError && <p className="mt-2 text-sm text-red-500">{addError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSaveNewCity}
              disabled={savingCity}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingCity ? "Adding..." : "Add city"}
            </button>
            <button
              type="button"
              onClick={handleCancelNewCity}
              disabled={savingCity}
              className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
