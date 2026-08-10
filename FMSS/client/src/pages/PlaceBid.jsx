// pages/PlaceBid.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import { Paper, Typography, Button, TextField } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { toast } from "react-toastify";

const PlaceBid = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState(null);
  const [bidAmount, setBidAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLoad = async () => {
      try {
        const res = await api.get(`/loads/${loadId}`);
        setLoad(res.data);
      } catch (error) {
        console.error("Error fetching load:", error);
        toast.error("Failed to fetch load details");
      }
    };

    fetchLoad();
  }, [loadId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const maxAllowed = load.vendorRate || load.amount;
    if (parseFloat(bidAmount) > maxAllowed) {
      toast.error(`Your bid cannot exceed the target rate of $${maxAllowed.toLocaleString()}`);
      return;
    }

    const user = JSON.parse(localStorage.getItem("user"));

    setLoading(true);
    try {
      await api.post(`/loads/${loadId}/bids`, {
        amount: Number(bidAmount),
      });

      toast.success("Bid placed successfully!");
      navigate("/fleetOwner/availableBookings");
    } catch (error) {
      console.error("Error placing bid:", error);
      toast.error(error.response?.data?.message || "Failed to place bid");
    } finally {
      setLoading(false);
    }
  };

  if (!load) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        Back
      </Button>

      <Paper className="p-6">
        <Typography variant="h5" className="mb-4">
          Place Bid - Load #{load.id}
        </Typography>

        <div className="mb-6 p-4 bg-gray-50 rounded">
          <Typography variant="subtitle1" className="font-semibold mb-2">
            Load Details
          </Typography>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p><span className="font-semibold">Customer:</span> {load.customerName}</p>
            <p><span className="font-semibold">Pickup:</span> {load.pickup.city}, {load.pickup.state}</p>
            <p><span className="font-semibold">Drop:</span> {load.drop.city}, {load.drop.state}</p>
            <p><span className="font-semibold">Load Type:</span> {load.truckType}</p>
            <p><span className="font-semibold">Team Required:</span> {load.driverRequirement}</p>
            <p><span className="font-semibold">Material:</span> {load.material}</p>
            <p><span className="font-semibold">Rate:</span> ${(load.vendorRate || load.amount).toLocaleString()}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Your Bid Amount ($)"
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            required
            disabled={loading}
            className="mb-4"
            helperText={`Enter amount less than $${(load.vendorRate || load.amount).toLocaleString()} to be competitive`}
          />

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading}
            >
              {loading ? "Placing Bid..." : "Place Bid"}
            </Button>
          </div>
        </form>
      </Paper>
    </div>
  );
};

export default PlaceBid;