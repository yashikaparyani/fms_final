// pages/LoadsWithBiddingTable.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { format } from "date-fns";
import LoadTable from "../components/LoadTable";
import { useSelector } from "react-redux";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import UnassignedNote from "../components/UnassignedNote";

const { LoadIdCell, CustomerCell, AddressCell, StatusBadge } = LoadTable;

const LoadsWithBiddingTable = ({ bidStatus = "OPEN" }) => {
  const userRole = useSelector((state) => state.auth.user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Why the board is empty. A carrier with every truck committed is served an
  // empty list by design, and an empty list on its own reads as "nothing on
  // offer today" — which is a different thing and leaves them waiting for loads
  // that will never appear.
  const [capacity, setCapacity] = useState(null);
  const navigate = useNavigate();

  // `silent` leaves the spinner alone so the background refresh is invisible.
  const fetchLoads = ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    return api
      .get(`/loads?bidStatus=${bidStatus}`)
      .then((res) => setRows(res.data))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    fetchLoads();

    if (userRole === "fleetOwner") {
      api
        .get("/loads/my-capacity")
        .then((res) => setCapacity(res.data))
        .catch(() => setCapacity(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidStatus, userRole]);

  useAutoRefresh(() => fetchLoads({ silent: true }));

  const fmtDT = (v) => (v ? format(new Date(v), "MMM dd, yyyy HH:mm") : "—");

  const getLowestBid = (bids) => {
    if (!bids || bids.length === 0) return "—";
    return `$${Math.min(...bids.map((b) => b.amount)).toLocaleString()}`;
  };

  const getWinningBid = (row) => {
    if (row.bidStatus !== "CLOSED") return "—";
    if (row.winningBid)
      return `$${row.winningBid.amount.toLocaleString()} (${row.winningBid.fleetOwnerName})`;
    if (row.bids?.length) {
      const lowest = Math.min(...row.bids.map((b) => b.amount));
      const winner = row.bids.find((b) => b.amount === lowest);
      return winner
        ? `$${lowest.toLocaleString()} (${winner.fleetOwnerName})`
        : "—";
    }
    return "—";
  };

  const money = (value) =>
    value === null || value === undefined
      ? "—"
      : `$${Number(value).toLocaleString()}`;

  const baseColumns = [
    {
      key: "load",
      header: "Load",
      width: "130px",
      render: (row) => (
        <div className="space-y-1">
          <LoadIdCell
            load={row}
            onClick={() => {
              const target = userRole === "fleetOwner" ? "open-available-bids" : "bids";
              navigate(`/${userRole}/${target}/${row.loadId}`);
            }}
          />
          <NegotiatedBadge row={row} />
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: "150px",
      render: (row) => <CustomerCell load={row} />,
    },
    {
      key: "origin",
      header: "Origin",
      render: (row) => <AddressCell data={row.pickup} />,
    },
    {
      key: "destination",
      header: "Destination",
      render: (row) => <AddressCell data={row.drop} />,
    },
    {
      key: "truckType",
      header: "Load Type",
      width: "110px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.truckType || "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Rate",
      width: "90px",
      render: (row) => (
        <span className="text-xs font-semibold text-gray-800">
          {row.amount ? `$${Number(row.amount).toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      key: "bidStatus",
      header: "Bid Status",
      width: "150px",
      render: (row) => (
        <div className="leading-tight">
          <StatusBadge value={row.bidStatus} />
          <UnassignedNote load={row} />
        </div>
      ),
    },
    {
      key: "bidTiming",
      header: "Bidding Period",
      width: "160px",
      render: (row) => (
        <div className="leading-tight">
          <div className="text-[11px] text-gray-600">
            <span className="font-medium">Start:</span>{" "}
            {fmtDT(row.bidStartTime)}
          </div>
          <div className="text-[11px] text-gray-600">
            <span className="font-medium">End:</span> {fmtDT(row.bidEndTime)}
          </div>
        </div>
      ),
    },
    {
      key: "bidCount",
      header: "Bids",
      width: "60px",
      render: (row) => (
        <span className="text-xs font-bold text-indigo-700">
          {row.bidCount ?? row.bids?.length ?? 0}
        </span>
      ),
    },
  ];

  const staffExtraColumns =
    userRole === "staff" || userRole === "admin"
      ? [
          {
            key: "lowestBid",
            header: "Lowest Bid",
            width: "110px",
            render: (row) => (
              <span className="text-xs font-semibold text-green-700">
                {getLowestBid(row.bids)}
              </span>
            ),
          },
          {
            key: "winningBid",
            header: "Winning Bid",
            width: "150px",
            render: (row) => (
              <span className="text-xs font-semibold text-emerald-700">
                {getWinningBid(row)}
              </span>
            ),
          },
        ]
      : [];

  const columns = [...baseColumns, ...staffExtraColumns];

  const actions = (row) => (
    <div className="flex flex-col gap-1.5">
      {(userRole === "staff" || userRole === "admin") && (
        <button
          onClick={() => navigate(`/${userRole}/bids/${row.loadId}`)}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          View Bids
        </button>
      )}
      {userRole === "client" && (
        <button
          onClick={() => navigate(`/${userRole}/bids/${row.loadId}`)}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          View Bids
        </button>
      )}
      {userRole === "fleetOwner" && row.bidStatus === "OPEN" && (
        <button
          onClick={() => {
            navigate(`/${userRole}/open-available-bids/${row.loadId}`);
          }}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded transition"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
            />
          </svg>
          Place Bid
        </button>
      )}
    </div>
  );

  // An offer the office has put to this carrier and not yet had an answer to.
  // It arrives on the same list as the open loads but is a different thing —
  // there is a specific number waiting on a yes or no — so it is marked as such
  // rather than left to look like another load to bid on.
  const NegotiatedBadge = ({ row }) => {
    if (!row.negotiation) return null;
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold"
        title={`Offered ${money(row.negotiation.amount)}${
          row.negotiation.previousAmount
            ? ` against your bid of ${money(row.negotiation.previousAmount)}`
            : ""
        }`}
      >
        NEGOTIATED {money(row.negotiation.amount)}
      </span>
    );
  };

  const META = {
    OPEN:     { subtitle: "Loads currently open for bidding",   empty: "No live bidding loads found."     },
    UPCOMING: { subtitle: "Loads with bidding scheduled ahead", empty: "No upcoming bidding loads found." },
    CLOSED:   { subtitle: "Loads whose bidding window has ended", empty: "No expired bidding loads found." },
  };
  const meta = META[bidStatus] ?? META.OPEN;

  return (
    <div className="p-5">
      {capacity?.atCapacity && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900">
            Bidding is paused while your {capacity.trucks === 1 ? "truck is" : "trucks are"} committed
          </p>
          <p className="text-xs text-amber-800 mt-0.5">{capacity.message}</p>
        </div>
      )}

      <LoadTable
        title="Loads with Bidding"
        subtitle={meta.subtitle}
        loads={rows}
        columns={columns}
        actions={actions}
        colorBy="bidStatus"
        loading={loading}
        emptyMessage={
          capacity?.atCapacity
            ? "Nothing to bid on until your current load is delivered."
            : meta.empty
        }
      />
    </div>
  );
};

export default LoadsWithBiddingTable;
