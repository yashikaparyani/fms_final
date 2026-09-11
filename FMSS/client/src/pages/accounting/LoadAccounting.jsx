import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import api from "../../api";
import ChargeEditor, { money } from "../../components/accounting/ChargeEditor";
import LoadBillingPanel from "../../components/accounting/LoadBillingPanel";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import Swal from "sweetalert2";

// ─── A load's books ───────────────────────────────────────────────────────────
// Receivables against payables, and the margin between them.
//
// Invoice numbers and dates are NOT here. Whether a load has been billed is
// answered by the invoice register — see services/billingState.js for why the
// date fields on the load and the register disagreed, and which one won. Typing
// an invoice number into the load was the losing half of that.
//
// Nor is driver pay: a driver is paid out of the payables below, alongside the
// carrier and the vendors, rather than from a fourth ledger of its own.
//
// Back-office only, and deliberately not reachable by a customer or a carrier:
// the margin between what was billed and what was paid is the brokerage's
// business. That is enforced on the server — there is no filtered version of
// this endpoint for other roles, only no endpoint at all.
// ─────────────────────────────────────────────────────────────────────────────

const LoadAccounting = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();
  // Every role that can open this screen has its own /track-load route, so the
  // link is built under whoever is looking at it. Same derivation as
  // InvoiceDetail's.
  const role = JSON.parse(localStorage.getItem("user") || "{}")?.role || "admin";

  const [catalog, setCatalog] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);

  const load = useCallback(async () => {
    try {
      const [catalogRes, dataRes] = await Promise.all([
        api.get("/accounting/catalog"),
        api.get(`/accounting/loads/${loadId}`),
      ]);

      setCatalog(catalogRes.data);
      setData(dataRes.data);
      setReceivables(dataRes.data.receivables.lines);
      setPayables(dataRes.data.payables.lines);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not load the accounting");
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSide = async (side) => {
    const lines = side === "receivable" ? receivables : payables;

    try {
      setSaving(true);
      const { data: saved } = await api.put(
        `/accounting/loads/${loadId}/${side === "receivable" ? "receivables" : "payables"}`,
        { lines },
      );
      setData(saved.accounting);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // Settling one driver, not the whole ledger. Two drivers on the same load are
  // paid on their own days — see payDriver on the server, which moves every line
  // owed to that driver together so nobody is ever half-paid.
  const togglePaid = async (row) => {
    if (row.paid) {
      const { isConfirmed } = await Swal.fire({
        title: `Put ${row.driverName || "this driver"}'s pay back?`,
        text: "It goes back to outstanding and their lines become editable again.",
        showCancelButton: true,
        confirmButtonText: "Put it back",
        confirmButtonColor: "#b45309",
      });
      if (!isConfirmed) return;
    }

    setSaving(true);
    try {
      const { data: saved } = await api.put(
        `/accounting/loads/${loadId}/payables/drivers/${row.driverId}/pay`,
        { paid: !row.paid },
      );
      setData(saved.accounting);
      setPayables(saved.accounting.payables.lines);
      notify.success(saved.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update the payment");
    } finally {
      setSaving(false);
    }
  };

  // Start a driver off with a line of their own, already naming them, so the
  // office types an amount rather than picking a charge and then a person.
  const addDriverLine = (row) => {
    setPayables((lines) => [
      ...lines,
      {
        chargeType: "driverPay",
        amount: "",
        note: "",
        driverId: row.driverId,
        driverName: row.driverName || "",
      },
    ]);
  };

  // ── Who this load's payables are owed to ────────────────────────────────
  // The carriers first, because the base rate is theirs, then the drivers who
  // ran it. The editor groups its lines under these, so a load with two
  // carriers and three drivers reads as five short bills rather than one pile
  // of rows that all say "Charge" — see ChargeEditor.
  //
  // A load with one carrier has no legs to list, so its single carrier is named
  // from the load itself. Drivers are carried through whether or not anybody
  // has costed them: an empty group with an add button is how an uncosted
  // driver asks to be paid.
  const payees = useMemo(() => {
    if (!data) return [];

    const carriers = data.carrierPayables?.length
      ? data.carrierPayables.map((leg) => ({
          key: `carrier:${leg.fleetOwnerId}`,
          kind: "carrier",
          id: leg.fleetOwnerId,
          name: leg.fleetOwnerName || "Carrier",
          code: leg.fleetOwnerCode || "",
          from: leg.from || "",
          to: leg.to || "",
          agreed: leg.agreed,
        }))
      : data.carrierId
        ? [
            {
              key: `carrier:${data.carrierId}`,
              kind: "carrier",
              id: data.carrierId,
              name: data.carrierName || "Carrier",
              from: data.route?.from || "",
              to: data.route?.to || "",
            },
          ]
        : [];

    const drivers = (data.driverPayables || []).map((row) => ({
      key: `driver:${row.driverId}`,
      kind: "driver",
      id: row.driverId,
      name: row.driverName || "Unnamed driver",
      code: row.driverCode || "",
      from: row.from || "",
      to: row.to || "",
      fleetOwnerId: row.fleetOwnerId || undefined,
      hint: row.onLoad ? "" : "no longer assigned to this load",
    }));

    return [...carriers, ...drivers];
  }, [data]);

  if (loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  if (!data || !catalog) {
    return (
      <div className={uiStyles.card}>
        <p className="text-sm text-gray-600">This load's accounting could not be loaded.</p>
      </div>
    );
  }

  const profitable = data.profit.margin >= 0;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-1"
          >
            <ArrowBackIcon style={{ fontSize: 14 }} /> Back
          </button>
          {/* The load number opens the load. Everything on this screen is money
              about a job whose details — the container, the route, the dates,
              the documents — live somewhere else entirely, and reading the id
              off the header to go and search for it was the step everybody was
              doing by hand. Same link as the one on the invoice, so the load is
              one click away from both places its figures are read. */}
          <h1 className="page-title">
            Accounting ·{" "}
            <button
              type="button"
              onClick={() => navigate(`/${role}/track-load/${data.loadId}`)}
              className="text-accent-700 hover:underline"
              title="Open this load's details"
            >
              {data.loadId}
            </button>
          </h1>
          {/* The route, not the parties. This line used to read
              "customer → carrier", which looks exactly like a route and is not
              one — an arrow between two company names invites it to be read as
              a move from the first to the second. The move is what somebody
              recognises the job by, so that is what the arrow now describes.

              The customer and the carrier are still here, as labelled chips.
              Naming them is the point: a chip that says who is being billed
              cannot be mistaken for a place the freight went. */}
          <p className="page-subtitle">
            {data.route?.from || data.route?.to ? (
              <span className="font-semibold text-ink-700">
                {data.route.from || "—"}
                <span className="mx-1.5 text-ink-400">→</span>
                {data.route.to || "—"}
              </span>
            ) : (
              <span className="text-ink-400">Route not set</span>
            )}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {data.customerName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-700">
                <span className="font-normal opacity-70">Customer</span>
                {data.customerName}
              </span>
            )}
            {data.carrierName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-semibold text-ink-700">
                <span className="font-normal opacity-70">Carrier</span>
                {data.carrierName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── The answer, first ──────────────────────────────────────────── */}
      {/* Three, not four: driver pay used to sit here and is now one of the
          payables below, so a tile of its own would either double-count it or
          sit permanently at zero. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Revenue" value={data.profit.revenue.total} tone="indigo" />
        <Stat label="Expense" value={data.profit.expense.total} tone="slate" />
        <Stat
          label="Margin"
          value={data.profit.margin}
          tone={profitable ? "green" : "red"}
          icon={profitable ? TrendingUpIcon : TrendingDownIcon}
          suffix={`${data.profit.marginPercent}%`}
        />
      </div>

      {/* ── Billing ────────────────────────────────────────────────────── */}
      {/* Above the ledgers rather than below them: the figures underneath are
          working data that gets edited once and then rarely, while this is the
          part somebody comes back to the screen for — has the customer paid,
          has the carrier been paid. `refresh` re-reads the ledgers too, because
          raising an invoice can change what the load's own accounting says. */}
      <LoadBillingPanel loadId={loadId} onChanged={load} />

      {/* ── Receivables ────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-1">
          <ReceiptLongIcon className="text-indigo-600" fontSize="small" />
          <h2 className="text-base font-semibold text-gray-900">Receivables</h2>
          <span className="text-xs text-gray-500">— what the customer is billed</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          The total here is the load's base amount; changing it updates the figure
          on every other screen.
        </p>

        {/* A load nobody has itemised still has a value — its base amount. The
            line below is that figure shown as a charge, not something somebody
            typed, and saying so is the difference between "this is costed" and
            "this still needs breaking down". Saving replaces it for good. */}
        {data.receivables.derived && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Not itemised yet.</strong> This is the load's base amount shown
            as a single charge. Add the accessorials and save to replace it.
          </p>
        )}

        <ChargeEditor
          side="receivable"
          charges={catalog.receivable}
          lines={receivables}
          onChange={setReceivables}
          disabled={saving}
        />

        <div className="flex justify-end mt-4">
          <button
            onClick={() => saveSide("receivable")}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save receivables"}
          </button>
        </div>
      </div>

      {/* ── Payables ───────────────────────────────────────────────────── */}
      <div className={uiStyles.card}>
        <div className="flex items-center gap-2 mb-1">
          <PaymentsIcon className="text-slate-600" fontSize="small" />
          <h2 className="text-base font-semibold text-gray-900">Payables</h2>
          <span className="text-xs text-gray-500">
            — what the carrier and vendors are paid
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Never shown to the customer. The gap between this and the receivables is
          the margin above.
        </p>

        {data.payables.derived && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Not itemised yet.</strong> These are the carrier rates already
            agreed on this load, shown as charges. Add the accessorials and save to
            replace them.
          </p>
        )}

        {/* Split loads settle carrier by carrier: two carriers on one load are
            owed two different amounts, and one payable total cannot say who
            gets what. `agreed` is what the leg was assigned at, `booked` is
            what has actually been put on the ledger against that carrier. */}
        {data.carrierPayables?.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Owed per carrier
            </div>
            <div className="divide-y divide-gray-100">
              {data.carrierPayables.map((row) => {
                const short =
                  row.agreed != null && row.booked !== row.agreed;

                return (
                  <div
                    key={row.legId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {row.fleetOwnerName}
                        {row.fleetOwnerCode && (
                          <span className="ml-2 text-[11px] font-mono text-gray-400">
                            {row.fleetOwnerCode}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {row.lineCount
                          ? row.lineCount + " line" + (row.lineCount === 1 ? "" : "s") + " booked"
                          : "Nothing booked yet"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {money(row.booked)}
                      </p>
                      {row.agreed != null && (
                        <p
                          className={
                            short
                              ? "text-[11px] font-medium text-amber-700"
                              : "text-[11px] text-gray-500"
                          }
                        >
                          agreed {money(row.agreed)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Who drove it, and who has been paid ──────────────────────────
            A driver assigned to the load appears here whether or not anybody
            has costed them yet, so an uncosted driver reads as a gap to fill
            rather than as an absence nobody notices. Each is settled on their
            own — see payDriver on the server. */}
        {data.driverPayables?.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
              <BadgeOutlinedIcon className="text-amber-600" style={{ fontSize: 15 }} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Drivers on this load
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {data.driverPayables.map((row) => (
                <div
                  key={row.driverId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {row.driverName || "Unnamed driver"}
                      {row.driverCode ? (
                        <span className="text-xs font-normal text-gray-500">
                          {" "}
                          · {row.driverCode}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {row.uncosted
                        ? "Nothing booked against them yet"
                        : `${row.lineCount} line${row.lineCount === 1 ? "" : "s"}`}
                      {/* A driver costed but no longer on the load. The money is
                          real, so the row stays and says why it looks odd. */}
                      {!row.onLoad && " · no longer assigned to this load"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-gray-900">
                        {money(row.amount)}
                      </p>
                      {!row.uncosted && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            row.paid
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.paid ? "PAID" : "DUE"}
                        </span>
                      )}
                    </div>

                    {row.uncosted ? (
                      <button
                        type="button"
                        onClick={() => addDriverLine(row)}
                        disabled={saving}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        Add their pay
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => togglePaid(row)}
                        disabled={saving}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50 whitespace-nowrap ${
                          row.paid
                            ? "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                        }`}
                      >
                        {row.paid ? "Mark unpaid" : "Pay"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="border-t border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px] text-gray-500">
              Amounts come from the Driver Pay lines below. Save the payables
              first — a driver can only be paid once their figure is on the
              ledger.
            </p>
          </div>
        )}

        <ChargeEditor
          side="payable"
          charges={catalog.payable}
          lines={payables}
          onChange={setPayables}
          disabled={saving}
          drivers={data.driverPayables || []}
          payees={payees}
        />

        <div className="flex justify-end mt-4">
          <button
            onClick={() => saveSide("payable")}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save payables"}
          </button>
        </div>
      </div>

    </div>
  );
};

const TONES = {
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
  slate: "bg-slate-50 border-slate-200 text-slate-900",
  green: "bg-green-50 border-green-200 text-green-900",
  red: "bg-red-50 border-red-200 text-red-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
};

const Stat = ({ label, value, tone, icon: Icon, suffix }) => (
  <div className={`rounded-xl border p-3 ${TONES[tone] || TONES.slate}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
    <p className="text-xl font-bold tabular-nums mt-0.5 flex items-center gap-1">
      {Icon && <Icon style={{ fontSize: 18 }} />}
      {money(value)}
    </p>
    {suffix && <p className="text-[11px] opacity-70">{suffix}</p>}
  </div>
);

export default LoadAccounting;
