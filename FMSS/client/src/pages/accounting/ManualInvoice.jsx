import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import api from "../../api";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { money, today, errorFrom } from "../../components/accounting/invoiceUi";

// ─── An invoice typed by hand ─────────────────────────────────────────────────
// For the billing that has no load behind it: a re-bill, a storage charge agreed
// after the fact, an administration fee, a one-off to somebody who is not on the
// customer master yet.
//
// ── Free-text lines, on purpose ──────────────────────────────────────────────
// The load ledger is driven by a fixed catalog because consistency across
// thousands of loads is what makes the reports mean anything. This screen is the
// opposite case — it exists precisely for the charge that does not fit the
// catalog — so a line here is a label and an amount, and the catalog is offered
// as a convenience rather than imposed as a constraint.
//
// Because those lines have no catalog entry, they carry their own `kind`, and
// that is what the totals turn on. See totalsByKind in config/chargeTypes.js.
//
// ── Quantity × rate ──────────────────────────────────────────────────────────
// Done for the user, live, so the arithmetic on a "5 days @ $40" line is never
// something somebody works out in their head and mistypes.
// ─────────────────────────────────────────────────────────────────────────────

const KINDS = [
  { value: "linehaul", label: "Base charge", help: "One per invoice." },
  { value: "accessorial", label: "Additional charge", help: "Added to the total." },
  {
    value: "settlement",
    label: "Already paid / advance",
    help: "Deducted from the balance, not added to the total.",
  },
];

const blankLine = () => ({
  label: "",
  kind: "accessorial",
  description: "",
  quantity: "",
  rate: "",
  amount: "",
});

/** What one line comes to, mirroring normalizeLine on the server. */
const lineAmount = (line) => {
  const explicit = line.amount === "" ? null : Number(line.amount);
  if (explicit !== null && Number.isFinite(explicit)) return explicit;

  const quantity = Number(line.quantity);
  const rate = Number(line.rate);
  if (line.quantity !== "" && line.rate !== "" && Number.isFinite(quantity) && Number.isFinite(rate)) {
    return quantity * rate;
  }
  return 0;
};

const ManualInvoice = () => {
  const navigate = useNavigate();

  const [direction, setDirection] = useState("AR");
  const [terms, setTerms] = useState("NET_30");
  const [termOptions, setTermOptions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState({
    kind: "CUSTOMER",
    id: "",
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [meta, setMeta] = useState({
    issueDate: today(),
    dueDate: "",
    loadId: "",
    memo: "",
    notes: "",
  });

  const [lines, setLines] = useState([blankLine()]);

  useEffect(() => {
    api
      .get("/invoices/terms")
      .then(({ data }) => setTermOptions(data.terms || []))
      .catch(() => {
        /* the picker falls back to the server default of Net 30 */
      });

    // Both directories are loaded so the party picker can switch without a
    // second round trip. Failures are silent — the name can always be typed.
    api.get("/customers").then(({ data }) => setCustomers(data || [])).catch(() => {});
    api.get("/fleet-owners").then(({ data }) => setCarriers(data || [])).catch(() => {});
  }, []);

  const directory = useMemo(() => {
    if (party.kind === "CUSTOMER") {
      return (Array.isArray(customers) ? customers : []).map((c) => ({
        id: String(c.user?._id || c.user || c._id),
        name: c.customerName || c.contact?.name || "Unnamed",
        email: c.emails?.accChargesEmail || c.contact?.email || "",
        phone: c.contact?.phone || "",
      }));
    }
    return (Array.isArray(carriers) ? carriers : []).map((c) => ({
      id: String(c._id),
      name: c.carrierName || "Unnamed",
      code: c.fleetOwnerCode || "",
      email: c.contactPersons?.find((p) => p.isPrimary)?.email || c.contactPersons?.[0]?.email || "",
      phone: c.phone || "",
    }));
  }, [party.kind, customers, carriers]);

  const totals = useMemo(() => {
    let charges = 0;
    let settled = 0;

    lines.forEach((line) => {
      const amount = lineAmount(line);
      if (line.kind === "settlement") settled += amount;
      else charges += amount;
    });

    const round = (v) => Math.round(v * 100) / 100;
    return {
      total: round(charges),
      settled: round(settled),
      balance: round(charges - settled),
    };
  }, [lines]);

  const setLine = (index, patch) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const pickFromDirectory = (id) => {
    const found = directory.find((row) => row.id === id);
    setParty((prev) => ({
      ...prev,
      id,
      name: found?.name || prev.name,
      email: found?.email || "",
      phone: found?.phone || "",
      code: found?.code || "",
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const filled = lines.filter((line) => line.label.trim());
    if (!filled.length) return notify.error("Add at least one line to the invoice.");
    if (!party.name.trim()) return notify.error("Say who this invoice is addressed to.");

    const linehauls = filled.filter((l) => l.kind === "linehaul");
    if (linehauls.length > 1) {
      return notify.error("Only one base charge line is allowed.");
    }

    try {
      setSaving(true);
      const { data } = await api.post("/invoices/manual", {
        direction,
        party: {
          kind: party.kind,
          id: party.id || undefined,
          name: party.name.trim(),
          email: party.email.trim(),
          phone: party.phone.trim(),
          address: party.address.trim(),
          code: party.code || "",
        },
        lines: filled.map((line) => ({
          label: line.label.trim(),
          kind: line.kind,
          description: line.description.trim(),
          quantity: line.quantity === "" ? undefined : line.quantity,
          rate: line.rate === "" ? undefined : line.rate,
          amount: line.amount === "" ? undefined : line.amount,
        })),
        terms,
        issueDate: meta.issueDate || undefined,
        dueDate: meta.dueDate || undefined,
        loadId: meta.loadId.trim() || undefined,
        memo: meta.memo.trim(),
        notes: meta.notes.trim(),
      });

      notify.success(data.message);
      navigate(`../accounting/invoices/${data.invoice._id}`);
    } catch (err) {
      notify.error(errorFrom(err, "Could not create the invoice"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={uiStyles.page}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowBackIcon fontSize="small" /> Back
      </button>

      <div className={uiStyles.pageHeader}>
        <div>
          <h1 className={uiStyles.pageHeaderTitle}>New invoice</h1>
          <p className={uiStyles.pageHeaderSubtitle}>
            For billing with no load behind it. A load's own invoice is raised from
            the load itself.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-white/70">Balance</p>
          <p className="text-2xl font-extrabold tabular-nums">{money(totals.balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={`${uiStyles.card} lg:col-span-2 space-y-5`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={uiStyles.label}>Direction</label>
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  // The party kind follows the direction: an AR invoice goes to
                  // a customer, an AP bill to a carrier. Leaving the old kind
                  // selected offers a picker full of the wrong people.
                  setParty((p) => ({
                    ...p,
                    kind: e.target.value === "AR" ? "CUSTOMER" : "CARRIER",
                    id: "",
                  }));
                }}
                className={uiStyles.select}
              >
                <option value="AR">Receivable — bill a customer</option>
                <option value="AP">Payable — a bill we owe</option>
              </select>
            </div>

            <div>
              <label className={uiStyles.label}>Addressed to</label>
              <select
                value={party.kind}
                onChange={(e) => setParty((p) => ({ ...p, kind: e.target.value, id: "" }))}
                className={uiStyles.select}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="CARRIER">Carrier</option>
                <option value="DRIVER">Driver</option>
              </select>
            </div>
          </div>

          {directory.length > 0 && (
            <div>
              <label className={uiStyles.label}>
                Pick from the directory{" "}
                <span className="font-normal text-ink-400">(or type below)</span>
              </label>
              <select
                value={party.id}
                onChange={(e) => pickFromDirectory(e.target.value)}
                className={uiStyles.select}
              >
                <option value="">— not on file —</option>
                {directory.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.code ? ` (${row.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={uiStyles.label}>Name</label>
              <input
                value={party.name}
                onChange={(e) => setParty((p) => ({ ...p, name: e.target.value }))}
                className={uiStyles.input}
                placeholder="Who is being billed"
              />
            </div>
            <div>
              <label className={uiStyles.label}>Email</label>
              <input
                type="email"
                value={party.email}
                onChange={(e) => setParty((p) => ({ ...p, email: e.target.value }))}
                className={uiStyles.input}
                placeholder="Where the invoice is sent"
              />
            </div>
          </div>

          <div>
            <label className={uiStyles.label}>Address</label>
            <input
              value={party.address}
              onChange={(e) => setParty((p) => ({ ...p, address: e.target.value }))}
              className={uiStyles.input}
              placeholder="Printed on the invoice"
            />
          </div>

          {/* ── Lines ───────────────────────────────────────────────────────── */}
          <div className="border-t border-hairline pt-5">
            <div className={uiStyles.cardHeader}>
              <p className={uiStyles.title}>Lines</p>
              <button
                type="button"
                onClick={() => setLines([...lines, blankLine()])}
                className="flex items-center gap-1 rounded-lg bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-700 hover:bg-accent-100"
              >
                <AddIcon sx={{ fontSize: 15 }} /> Add line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-hairline bg-ink-50/50 p-3"
                >
                  <div className="flex gap-2">
                    <input
                      value={line.label}
                      onChange={(e) => setLine(index, { label: e.target.value })}
                      className={`${uiStyles.input} flex-1`}
                      placeholder="What is this charge for?"
                    />
                    <select
                      value={line.kind}
                      onChange={(e) => setLine(index, { kind: e.target.value })}
                      className={`${uiStyles.select} w-52`}
                    >
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                        className="px-2 text-ink-400 hover:text-bad-600"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <input
                      value={line.description}
                      onChange={(e) => setLine(index, { description: e.target.value })}
                      className={uiStyles.input}
                      placeholder="Detail (optional)"
                    />
                    <input
                      type="number"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => setLine(index, { quantity: e.target.value })}
                      className={`${uiStyles.input} tabular-nums`}
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={line.rate}
                      onChange={(e) => setLine(index, { rate: e.target.value })}
                      className={`${uiStyles.input} tabular-nums`}
                      placeholder="Rate"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => setLine(index, { amount: e.target.value })}
                      className={`${uiStyles.input} tabular-nums font-semibold`}
                      // Qty × rate is filled in live below when the amount is
                      // left blank, so the placeholder shows what it will be.
                      placeholder={
                        line.quantity && line.rate
                          ? money(lineAmount(line)).replace("$", "")
                          : "Amount"
                      }
                    />
                  </div>

                  {line.kind === "settlement" && (
                    <p className="mt-1.5 text-xs text-ink-400">
                      Deducted from the balance — not added to the total.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Terms and totals ───────────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className={`${uiStyles.card} space-y-4`}>
            <p className={uiStyles.title}>Terms</p>

            <div>
              <label className={uiStyles.label}>Invoice date</label>
              <input
                type="date"
                value={meta.issueDate}
                onChange={(e) => setMeta((m) => ({ ...m, issueDate: e.target.value }))}
                className={uiStyles.input}
              />
            </div>

            <div>
              <label className={uiStyles.label}>Payment terms</label>
              <select
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className={uiStyles.select}
              >
                {(termOptions.length
                  ? termOptions
                  : [{ key: "NET_30", label: "Net 30" }]
                ).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={uiStyles.label}>
                Due date <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                type="date"
                value={meta.dueDate}
                onChange={(e) => setMeta((m) => ({ ...m, dueDate: e.target.value }))}
                className={uiStyles.input}
              />
              <p className="mt-1 text-xs text-ink-400">
                Left blank, it follows the terms above.
              </p>
            </div>

            <div>
              <label className={uiStyles.label}>
                Load reference{" "}
                <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                value={meta.loadId}
                onChange={(e) => setMeta((m) => ({ ...m, loadId: e.target.value }))}
                className={uiStyles.input}
                placeholder="e.g. LD 0014"
              />
              <p className="mt-1 text-xs text-ink-400">
                Links this invoice to a load without taking its number.
              </p>
            </div>

            <div>
              <label className={uiStyles.label}>Memo</label>
              <input
                value={meta.memo}
                onChange={(e) => setMeta((m) => ({ ...m, memo: e.target.value }))}
                className={uiStyles.input}
                placeholder="Shown on the invoice"
              />
            </div>

            <div>
              <label className={uiStyles.label}>Notes</label>
              <textarea
                rows={3}
                value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
                className={uiStyles.textarea}
                placeholder="Anything else printed at the foot"
              />
            </div>
          </div>

          <div className={uiStyles.card}>
            <p className={`${uiStyles.title} mb-3`}>Totals</p>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-ink-500">Charges</span>
              <span className="font-semibold tabular-nums">{money(totals.total)}</span>
            </div>
            {totals.settled > 0 && (
              <div className="flex justify-between py-1 text-sm">
                <span className="text-ink-500">Already paid</span>
                <span className="font-semibold tabular-nums text-ink-500">
                  − {money(totals.settled)}
                </span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between rounded-lg bg-accent-600 px-3 py-2.5 text-white">
              <span className="text-[11px] font-bold uppercase tracking-wide">
                Balance
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {money(totals.balance)}
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create invoice"}
            </button>
            <p className="mt-2 text-center text-xs text-ink-400">
              Created as a draft. Nothing is sent until you send it.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default ManualInvoice;
