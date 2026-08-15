import { uiStyles } from "../../style/uiStyles";

// ─── FieldRenderer ────────────────────────────────────────────────────────────
// Draws one field from the schema the server serves
// (server/config/carrierAgreements.js).
//
// The form is generated rather than hand-written because the schema is already
// the authority on what the agreements ask for — hand-writing forty inputs would
// mean the form, the validation and the PDF each holding their own opinion about
// which fields exist, and one of them being wrong.
// ─────────────────────────────────────────────────────────────────────────────

const FieldRenderer = ({ field, value, onChange, error, disabled }) => {
  const id = `f-${field.key}`;

  const common = {
    id,
    disabled,
    value: value ?? "",
    onChange: (e) => onChange(field.key, e.target.value),
    className: `${uiStyles.input} ${error ? uiStyles.inputError : ""}`,
  };

  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-gray-600 block mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {field.type === "select" ? (
        <select {...common} className={`${uiStyles.select} ${error ? uiStyles.inputError : ""}`}>
          <option value="">Choose…</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "initials" ? (
        <input
          {...common}
          maxLength={4}
          placeholder="RK"
          // Initials are printed into the agreement exactly as typed, and a
          // lowercase pair next to a signature reads as unfinished.
          onChange={(e) => onChange(field.key, e.target.value.toUpperCase())}
          className={`${uiStyles.input} max-w-[7rem] text-center font-bold tracking-[0.3em] ${
            error ? uiStyles.inputError : ""
          }`}
        />
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type || "text"}
          placeholder={field.placeholder}
          autoComplete={field.sensitive ? "off" : undefined}
        />
      )}

      {field.help && !error && (
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">{field.help}</p>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
};

export default FieldRenderer;
