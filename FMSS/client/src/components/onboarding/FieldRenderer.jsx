import { uiStyles } from "../../style/uiStyles";

// ─── FieldRenderer ────────────────────────────────────────────────────────────
// Draws one field from the schema the server serves
// (server/config/carrierAgreements.js).
//
// The form is generated rather than hand-written because the schema is already
// the authority on what the agreements ask for — hand-writing forty inputs would
// mean the form, the validation and the PDF each holding their own opinion about
// which fields exist, and one of them being wrong.
//
// Required is shown as a "Required" tag and an amber edge while the field is
// empty — a red asterisk was too easy to miss. When a submit is stopped, the
// page scrolls to the first empty field (see focusField) and it is marked with
// a red ring and a pointing hand saying what to do, instead of a popup.
// ─────────────────────────────────────────────────────────────────────────────

export const FillHint = ({ children = "Please fill this field" }) => (
  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-600" role="alert">
    <span className="inline-block animate-bounce text-lg leading-none" aria-hidden="true">
      👉
    </span>
    {children}
  </p>
);

const FieldRenderer = ({ field, value, onChange, error, disabled, autoFilled }) => {
  const id = `f-${field.key}`;
  const empty = value === undefined || value === null || String(value).trim() === "";
  const needs = field.required && empty && !disabled;

  // Error wins; otherwise an empty required field gets an amber edge so the
  // carrier can see at a glance what is still to do.
  const state = error
    ? "border-red-500 ring-2 ring-red-400/60 bg-red-50/40"
    : needs
      ? "border-amber-400 bg-amber-50/50"
      : "";

  const common = {
    id,
    disabled,
    value: value ?? "",
    onChange: (e) => onChange(field.key, e.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-required": field.required || undefined,
    className: `${uiStyles.input} ${state}`,
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-700">
        {field.label}
        {field.required && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              empty ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"
            }`}
          >
            {empty ? "Required" : "✓ Done"}
          </span>
        )}
        {autoFilled && !empty && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
            Auto-filled
          </span>
        )}
      </label>

      {field.type === "select" ? (
        <select {...common} className={`${uiStyles.select} ${state}`}>
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
          className={`${uiStyles.input} max-w-[7rem] text-center font-bold tracking-[0.3em] ${state}`}
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
        <p className="text-[13px] text-gray-500 mt-1 leading-snug">{field.help}</p>
      )}
      {error && <FillHint>{error}</FillHint>}
    </div>
  );
};

export default FieldRenderer;
