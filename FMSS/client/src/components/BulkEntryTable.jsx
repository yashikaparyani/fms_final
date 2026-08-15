import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

// ─── BulkEntryTable ───────────────────────────────────────────────────────────
// A grid of blank rows for typing several records in one submission — staff on
// the admin side, drivers on the carrier side.
//
// The one behaviour worth explaining is paste. Both of these lists start life in
// a spreadsheet or an email, so pasting a block of tab- and newline-separated
// text into a cell spreads it across the columns to the right and the rows
// below, growing the table as needed. Typing over one cell at a time still works
// exactly as it looks like it should; the spreading only happens when the pasted
// text actually contains a tab or a newline.
//
// Errors are addressed per row and stay attached to the row that caused them, so
// a partly-successful submission can be corrected in place rather than retyped.
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

/** Split pasted clipboard text into a grid. Handles \r\n, \n and \t. */
const parsePastedGrid = (text) =>
  String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line, index, all) => line.trim() !== "" || index < all.length - 1)
    .map((line) => line.split("\t"));

const BulkEntryTable = ({
  columns,
  rows,
  onChange,
  blankRow,
  errors = {},
  maxRows = 50,
  addLabel = "Add row",
}) => {
  const setCell = (rowIndex, key, value) => {
    const next = rows.map((row, i) =>
      i === rowIndex ? { ...row, [key]: value } : row,
    );
    onChange(next);
  };

  const addRow = () => {
    if (rows.length >= maxRows) return;
    onChange([...rows, { ...blankRow }]);
  };

  const duplicateRow = (rowIndex) => {
    if (rows.length >= maxRows) return;
    const next = [...rows];
    next.splice(rowIndex + 1, 0, { ...rows[rowIndex] });
    onChange(next);
  };

  const removeRow = (rowIndex) => {
    // Never leave zero rows — an empty table gives the user nothing to type in
    // and no obvious way back.
    const next = rows.filter((_, i) => i !== rowIndex);
    onChange(next.length ? next : [{ ...blankRow }]);
  };

  const handlePaste = (event, rowIndex, colIndex) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!text.includes("\t") && !text.includes("\n")) return; // ordinary paste

    event.preventDefault();

    const grid = parsePastedGrid(text);
    const next = [...rows];

    grid.forEach((cells, r) => {
      const targetRow = rowIndex + r;
      if (targetRow >= maxRows) return;

      // Grow the table to fit what was pasted rather than silently truncating.
      if (!next[targetRow]) next[targetRow] = { ...blankRow };

      cells.forEach((cell, c) => {
        const column = columns[colIndex + c];
        if (!column || column.readOnly) return;
        next[targetRow] = { ...next[targetRow], [column.key]: cell.trim() };
      });
    });

    onChange(next);
  };

  return (
    <div>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-2 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  style={col.width ? { width: col.width, minWidth: col.width } : {}}
                >
                  {col.label}
                  {col.required && <span className="text-red-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const error = errors[rowIndex];
              return (
                <tr
                  key={rowIndex}
                  className={`border-b border-gray-100 last:border-b-0 ${
                    error ? "bg-red-50" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 text-xs text-gray-400 align-top pt-3">
                    {rowIndex + 1}
                  </td>

                  {columns.map((col, colIndex) => (
                    <td key={col.key} className="px-2 py-1.5 align-top">
                      {col.type === "select" ? (
                        <select
                          className={inputClass}
                          value={row[col.key] ?? ""}
                          onChange={(e) =>
                            setCell(rowIndex, col.key, e.target.value)
                          }
                        >
                          {(col.options || []).map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : col.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          className="mt-2 h-4 w-4 accent-indigo-600"
                          checked={!!row[col.key]}
                          onChange={(e) =>
                            setCell(rowIndex, col.key, e.target.checked)
                          }
                        />
                      ) : (
                        <input
                          className={inputClass}
                          type={col.type || "text"}
                          value={row[col.key] ?? ""}
                          placeholder={col.placeholder}
                          onChange={(e) =>
                            setCell(rowIndex, col.key, e.target.value)
                          }
                          onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                        />
                      )}

                      {/* The error sits under the first column so it reads as
                          belonging to the row, not to one field. */}
                      {error && colIndex === 0 && (
                        <p className="flex items-start gap-1 text-[11px] text-red-600 mt-1">
                          <ErrorOutlineIcon style={{ fontSize: 13 }} />
                          <span>{error}</span>
                        </p>
                      )}
                    </td>
                  ))}

                  <td className="px-2 py-1.5 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => duplicateRow(rowIndex)}
                        title="Duplicate this row"
                        className="p-1 text-gray-400 hover:text-indigo-600"
                      >
                        <ContentCopyIcon style={{ fontSize: 16 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        title="Remove this row"
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <DeleteOutlineIcon style={{ fontSize: 18 }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= maxRows}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        >
          <AddIcon fontSize="small" /> {addLabel}
        </button>
        <p className="text-[11px] text-gray-400">
          {rows.length} of {maxRows} rows · paste a block from a spreadsheet to
          fill several at once
        </p>
      </div>
    </div>
  );
};

export default BulkEntryTable;
