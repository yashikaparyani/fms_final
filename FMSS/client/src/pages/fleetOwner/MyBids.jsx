import React, { useState, useEffect } from "react";
import LoadTable from "../../components/LoadTable";
import api from "../../api";
import { useNavigate } from "react-router-dom";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, StatusBadge } = LoadTable;

const MyBids = ({userRole}) => {
  const [data, setData]       = useState([]);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  console.log("MyBids component rendered", data);

  // `silent` keeps the background refresh from touching the spinner or raising
  // an error banner over data that is still on screen.
  const fetchMyBids = async ({ silent = false } = {}) => {
    try {
      const res = await api.get("/bidRoutes/MyBids");
      setData(res.data);
    } catch (err) {
      if (!silent) setError(err.response?.data?.message || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyBids();
  }, []);

  useAutoRefresh(() => fetchMyBids({ silent: true }));

    const confirmRide = async (loadId) => {
    try {
      await api.put(`/loads/assignedLoad/${loadId}/confirm`);

      fetchMyBids();
    } catch (error) {
      alert(error.response?.data?.message || error.message);
    }
  };

 const columns = [
{
  key: "load",
  header: "Load",
  width: "8%",
  render: (row) => {
    const isClickable = row.result === "WON";

    return (
      <div
        className={`${
          isClickable
            ? "cursor-pointer text-blue-600 hover:underline"
            : "cursor-not-allowed text-gray-600"
        }`}
        onClick={() => {
          if (!isClickable) return;
          navigate(`/${userRole}/track-load/${row.loadId}`);
        }}
      >
        {row.loadId}
      </div>
    );
  },
},

    {
      key: "customer",
      header: "Customer",
      width: "12%",
      render: () => <span className="text-xs text-gray-500">—</span>, // not returned from API
    },

    {
      key: "pickup",
      header: "Pickup",
      width: "14%",
      render: (row) => <AddressCell data={row.pickup} />,
    },

    {
      key: "drop",
      header: "Drop",
      width: "14%",
      render: (row) => <AddressCell data={row.drop} />,
    },

    {
      key: "truckType",
      header: "Truck",
      width: "8%",
      render: (row) => (
        <span className="text-xs font-medium">
          {row.truckType || "-"}
        </span>
      ),
    },

    // ✅ YOUR BID AMOUNT
    {
      key: "amount",
      header: "My Bid",
      width: "10%",
      render: (row) => (
        <span className="text-xs font-semibold text-green-700">
          $ {row.amount?.toLocaleString()}
        </span>
      ),
    },

    {
      key: "bidClosedAt",
      header: "Closed At",
      width: "10%",
      render: (row) => <DateCell value={row.bidClosedAt} />,
    },

    // ✅ RESULT (WON / LOST)
    {
      key: "result",
      header: "Result",
      width: "7%",
      render: (row) => (
        <StatusBadge value={row.result} />
      ),
    },

    // ✅ ACTION FIXED
    {
      key: "action",
      header: "Action",
      width: "10%",
      render: (row) => {
        if (row.result !== "WON") {
          return <span className="text-gray-400 text-xs">—</span>;
        }

        if (!row.accepted) {
          return (
            <button
              onClick={() => confirmRide(row.loadId)}
              className="bg-green-800 hover:bg-green-900 text-white px-2 py-1 rounded text-xs font-semibold"
            >
              Confirm
            </button>
          );
        }

        return (
          <span className="text-green-700 text-xs font-semibold">
            Confirmed
          </span>
        );
      },
    },
  ];

  if (error) {
    return (
      <div className="p-5 text-red-600 font-medium">
        {error}
      </div>
    );
  }

  return (
    <div className="p-4">
      <LoadTable
        loads={data}
        columns={columns}
        loading={loading}
        colorBy="result" // ✅ FIXED (not transportStatus)
        emptyMessage="You haven't placed any bids yet."
        title="My Bids"
        subtitle="All bids placed by you with result and acceptance status"
      />
    </div>
  );
};

export default MyBids;
