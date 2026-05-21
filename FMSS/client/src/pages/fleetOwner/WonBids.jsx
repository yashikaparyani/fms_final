import React, { useState, useEffect } from "react";
import LoadTable from "../../components/LoadTable";
import api from "../../api";
import { useNavigate } from "react-router-dom";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, StatusBadge } = LoadTable;

const WonBids = ({userRole}) => {
  const [data, setData]       = useState([]);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  console.log("WonBids component rendered", data);

  const fetchWonBids = async () => {
    try {
      const res = await api.get("/bidRoutes/wonBids");
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWonBids();
  }, []);

    const confirmRide = async (loadId) => {
    try {
      await api.put(`/loads/assignedLoad/${loadId}/confirm`);

      fetchWonBids();
    } catch (error) {
      alert(error.response?.data?.message || error.message);
    }
  };

const columns = [
  {
    key: "load",
    header: "Load",
    width: "8%",
    render: (row) => <LoadIdCell load={row}  onClick={() => {
            navigate(`/${userRole}/open-available-bids/${row.loadId}`);
          }} />,
  },
  {
    key: "customer",
    header: "Customer",
    width: "12%",
    render: (row) => <CustomerCell load={row} />,
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
      <span className="text-xs font-medium truncate block">
        {row.truckType || "-"}
      </span>
    ),
  },
  {
    key: "winningAmount",
    header: "Won At",
    width: "10%",
    render: (row) => (
      <span className="text-xs font-semibold text-green-700 whitespace-nowrap">
        $ {row.winningBid?.amount?.toLocaleString() || "-"}
      </span>
    ),
  },
  {
    key: "bidEndTime",
    header: "Closed At",
    width: "10%",
    render: (row) => <DateCell value={row.bidEndTime} />,
  },
  {
    key: "lastFreeDate",
    header: "Last Free Date",
    width: "10%",
    render: (row) => <DateCell value={row.lastFreeDate} />,
  },
  {
    key: "status",
    header: "Bid Status",
    width: "7%",
    render: (row) => <StatusBadge value={row.bidStatus} />,
  },

  {
    key: "action",
    header: "Action",
    width: "10%",
    render: (row) =>
      row.transportStatus === "ASSIGNED" ? (
        <button
          onClick={() => confirmRide(row.loadId)}
          className="bg-green-800 hover:bg-green-900 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap"
        >
          Confirm
        </button>
      ) : (
        <span className="text-green-700 text-xs font-semibold whitespace-nowrap">
          Confirmed
        </span>
      ),
  },
];

  if (error) {
    return <div className="p-5 text-red-600 font-medium">{error}</div>;
  }

  return (
    <div className="p-4">
      <LoadTable
        loads={data}
        columns={columns}
        loading={loading}
        colorBy="transportStatus"
        emptyMessage="You haven't won any bids yet."
        title="Won Bids"
        subtitle="Loads where your bid was selected as the winner"
      />
    </div>
  );
};

export default WonBids;