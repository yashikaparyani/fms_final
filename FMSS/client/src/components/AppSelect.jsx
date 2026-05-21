import ReactSelect from "react-select";

const buildStyles = (hasError, isDisabled) => ({
  control: (base, { isFocused }) => ({
    ...base,
    minHeight: "38px",
    fontSize: "0.875rem",
    backgroundColor: isDisabled ? "#f9fafb" : "#fff",
    borderRadius: "0.5rem",
    borderColor: hasError ? "#ef4444" : isFocused ? "#6366f1" : "#d1d5db",
    boxShadow: isFocused
      ? hasError
        ? "0 0 0 2px rgba(239,68,68,0.2)"
        : "0 0 0 2px rgba(99,102,241,0.25)"
      : "none",
    "&:hover": {
      borderColor: hasError ? "#ef4444" : isFocused ? "#6366f1" : "#9ca3af",
    },
    transition: "border-color 0.15s, box-shadow 0.15s",
    cursor: isDisabled ? "not-allowed" : "default",
  }),
  valueContainer: (base) => ({ ...base, padding: "1px 10px" }),
  indicatorsContainer: (base) => ({ ...base }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: "0 8px",
    color: "#9ca3af",
    "&:hover": { color: "#374151" },
  }),
  indicatorSeparator: () => ({ display: "none" }),
  clearIndicator: (base) => ({
    ...base,
    padding: "0 4px",
    color: "#9ca3af",
    "&:hover": { color: "#374151" },
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.5rem",
    border: "1px solid #e5e7eb",
    boxShadow:
      "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
    zIndex: 9999,
    overflow: "hidden",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, { isSelected, isFocused }) => ({
    ...base,
    fontSize: "0.875rem",
    padding: "8px 12px",
    backgroundColor: isSelected ? "#6366f1" : isFocused ? "#eef2ff" : "#fff",
    color: isSelected ? "#fff" : "#111827",
    cursor: "pointer",
    "&:active": { backgroundColor: "#4f46e5" },
  }),
  singleValue: (base) => ({ ...base, color: "#111827", fontSize: "0.875rem" }),
  placeholder: (base) => ({ ...base, color: "#9ca3af", fontSize: "0.875rem" }),
  noOptionsMessage: (base) => ({
    ...base,
    fontSize: "0.875rem",
    color: "#9ca3af",
  }),
  input: (base) => ({ ...base, fontSize: "0.875rem" }),
});

/**
 * Searchable select that matches the project's input design system.
 *
 * Props:
 *   options          [{ value, label }]
 *   value            string | null  (the raw value, not the option object)
 *   onChange(val)    called with the selected string value (or "" on clear)
 *   placeholder      string
 *   isSearchable     bool (default true)
 *   isDisabled       bool
 *   isClearable      bool
 *   error            bool  – red border when true
 *   formatOptionLabel  optional custom renderer for options
 *
 * For react-hook-form, wrap in <Controller> and pass field.value / field.onChange.
 */
const AppSelect = ({
  options = [],
  value,
  onChange,
  placeholder = "Select...",
  isSearchable = true,
  isDisabled = false,
  isClearable = false,
  error = false,
  formatOptionLabel,
  ...rest
}) => (
  <ReactSelect
    options={options}
    value={
      value != null && value !== ""
        ? (options.find((o) => o.value === value) ?? null)
        : null
    }
    onChange={(opt) => onChange(opt ? opt.value : "")}
    placeholder={placeholder}
    isSearchable={isSearchable}
    isDisabled={isDisabled}
    isClearable={isClearable}
    formatOptionLabel={formatOptionLabel}
    styles={buildStyles(error, isDisabled)}
    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
    menuPosition="fixed"
    {...rest}
  />
);

export default AppSelect;
