import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/dashboard/Dashboard";
import AdminLogin from "./pages/login/AdminLogin";
import CustomerLogin from "./pages/login/CustomerLogin";
import VendorLogin from "./pages/login/VendorLogin";
import StaffLogin from "./pages/login/StaffLogin";
import CustomerRegister from "./pages/CustomerRegister";
import StaffCreateCustomer from "./pages/staff/StaffCreateCustomer";
import StaffCustomers from "./pages/staff/StaffCustomers";
import LoadCreationForm from "./pages/LoadCreationForm";
import PendingLoadsTable from "./pages/staff/PendingLoadsTable";
import VerifiedLoadsTable from "./pages/staff/VerifiedLoadsTable";
import StaffCreateFleetOwner from "./pages/staff/StaffCreateFleetOwner";
import StaffFleetOwners from "./pages/staff/StaffFleetOwners";
import LoadsWithBiddingTable from "./pages/LoadsWithBiddingTable";
import BidDetails from "./pages/BidDetails";
import PlaceBid from "./pages/PlaceBid";
import EmailSettings from "./pages/EmailSettings";
import ClientLoads from "./pages/ClientLoads";
import EditLoad from "./pages/EditLoad";
import ScheduleBidding from "./pages/ScheduleBidding";
import ClientDashboard from "./pages/dashboard/ClientDashboard";
import StaffDashboard from "./pages/dashboard/StaffDashboard";
import FleetOwnerDashboard from "./pages/dashboard/FleetOwnerDashboard";
import "./style/global.css";

import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import api from "./api";
import { loginSuccess, logout } from "./redux/authSlice";
import StaffLoadsPage from "./pages/StaffLoadsPage";
import UpdateLoadStatusPage from "./pages/fleetOwner/UpdateLoadStatusPage";
import StaffLoadDetails from "./pages/StaffLoadDetails";
import UpdateAddressPage from "./pages/staff/UpdateaddressPage";
import TrackLoadPage from "./pages/TrackLoadPage";
import Load from "./pages/Load";
import EditCustomerPage from "./pages/staff/StaffEditCustomerPage";
import EditFleetOwnerPage from "./pages/staff/EditFleetOwnerPage";
import AssignedLoad from "./pages/fleetOwner/AssignedLoad";
import LiveBidding from "./pages/LiveBidding";
import WonBids from "./pages/fleetOwner/WonBids";
import MyBids from "./pages/fleetOwner/MyBids";
import ReportsPage from "./pages/staff/ReportsPage";
import Bids from "./pages/Bids";
import ShippingLines from "./pages/admin/ShippingLines";
import DeliveryPartners from "./pages/admin/DeliveryPartners";
import ChassisCompanies from "./pages/admin/ChassisCompanies";
import Seo from "./components/Seo";

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state) => state.auth);

  useEffect(() => {
    const token = localStorage.getItem("api_token");
    if (token && !isAuthenticated) {
      api
        .get("/auth/me")
        .then(() => {
          // Sync state with local storage
          const storedUser = JSON.parse(localStorage.getItem("user"));
          if (storedUser) {
            dispatch(loginSuccess({ user: storedUser, api_token: token }));
          }
        })
        .catch(() => {
          dispatch(logout());
        });
    }
  }, [dispatch, isAuthenticated]);

  return (
    <>
      <Seo />
      <Routes>
        {/* Default Route */}
        <Route
          path="/"
          element={<LandingPage />}
        />

        {/* LOGIN ROUTES */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/client-login" element={<CustomerLogin />} />
        <Route path="/vendor-login" element={<VendorLogin />} />
        <Route path="/staff-login" element={<StaffLogin />} />
        <Route path="/client/register" element={<CustomerRegister />} />

        {/* ================= ADMIN ================= */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<StaffDashboard />} />
          <Route path="analytics" element={<h1>Analytics Page</h1>} />
          <Route path="shipping-lines" element={<ShippingLines />} />
          <Route path="delivery-partners" element={<DeliveryPartners />} />
          <Route path="chassis-companies" element={<ChassisCompanies />} />
          <Route path="customers/:id/edit" element={<EditCustomerPage />} />
          <Route
            path="fleet-owners/:id/edit"
            element={<EditFleetOwnerPage />}
          />
          <Route path="master" element={<h1>Master Page</h1>} />
          <Route path="email-config" element={<EmailSettings />} />
          <Route path="customers" element={<StaffCustomers />} />
          <Route path="create-customer" element={<StaffCreateCustomer />} />
          <Route path="create-load" element={<LoadCreationForm />} />
          <Route path="read-load" element={<Load />} />
          <Route path="read-bids" element={<Bids />} />

          <Route path="verified-loads" element={<VerifiedLoadsTable />} />
          <Route path="pending-loads" element={<PendingLoadsTable />} />
          <Route path="fleet-owners" element={<StaffFleetOwners />} />
          <Route path="loads" element={<StaffLoadsPage />} />
          <Route path="load/:loadId" element={<UpdateLoadStatusPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route
            path="create-fleet-owner"
            element={<StaffCreateFleetOwner />}
          />
          <Route
            path="schedule-bidding/:loadId"
            element={<ScheduleBidding />}
          />
          <Route
            path="available-bids"
            element={<LoadsWithBiddingTable userRole="admin" />}
          />

          <Route path="open-available-bids/:id" element={<LiveBidding />} />
          <Route path="load/status/:loadId" element={<StaffLoadDetails />} />
          <Route path="update-address" element={<UpdateAddressPage />} />
          <Route path="track-load/:loadId" element={<TrackLoadPage />} />
          <Route path="edit-load/:loadId" element={<EditLoad />} />
          <Route path="bids/:loadId" element={<BidDetails />} />
        </Route>

        {/* ================= Staff ================= */}

        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRole="staff">
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<StaffDashboard />} />
          <Route path="analytics" element={<h1>Analytics Page</h1>} />
          <Route path="customers/:id/edit" element={<EditCustomerPage />} />
          <Route
            path="fleet-owners/:id/edit"
            element={<EditFleetOwnerPage />}
          />
          <Route path="master" element={<h1>Master Page</h1>} />
          <Route path="email-config" element={<EmailSettings />} />
          <Route path="customers" element={<StaffCustomers />} />
          <Route path="create-customer" element={<StaffCreateCustomer />} />
          <Route path="create-load" element={<LoadCreationForm />} />
          <Route path="read-load" element={<Load />} />
          <Route path="read-bids" element={<Bids />} />

          <Route path="verified-loads" element={<VerifiedLoadsTable />} />
          <Route path="pending-loads" element={<PendingLoadsTable />} />
          <Route path="fleet-owners" element={<StaffFleetOwners />} />
          <Route path="loads" element={<StaffLoadsPage />} />
          <Route path="load/:loadId" element={<UpdateLoadStatusPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route
            path="create-fleet-owner"
            element={<StaffCreateFleetOwner />}
          />
          <Route
            path="schedule-bidding/:loadId"
            element={<ScheduleBidding />}
          />
          <Route
            path="available-bids"
            element={<LoadsWithBiddingTable userRole="staff" />}
          />

          <Route path="open-available-bids/:id" element={<LiveBidding />} />
          <Route path="load/status/:loadId" element={<StaffLoadDetails />} />
          <Route path="update-address" element={<UpdateAddressPage />} />
          <Route path="track-load/:loadId" element={<TrackLoadPage />} />
          <Route path="edit-load/:loadId" element={<EditLoad />} />
          <Route path="bids/:loadId" element={<BidDetails />} />
        </Route>

        {/* ================= CLIENT ================= */}
        <Route
          path="/client"
          element={
            <ProtectedRoute allowedRole="client">
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<ClientDashboard />} />
          <Route path="bookings" element={<h1>Bookings Page</h1>} />
          <Route path="biddings" element={<h1>Biddings Page</h1>} />
          <Route path="create-load" element={<LoadCreationForm />} />
          <Route path="my-loads" element={<ClientLoads />} />
          <Route path="edit-load/:loadId" element={<EditLoad />} />
          <Route
            path="my-loads-bidding"
            element={<LoadsWithBiddingTable userRole="client" />}
          />
          <Route path="track-load/:loadId" element={<TrackLoadPage />} />
          <Route path="open-available-bids/:id" element={<LiveBidding />} />
          <Route path="bids/:loadId" element={<BidDetails />} />
        </Route>

        {/* ================= FLEET OWNER ================= */}
        <Route
          path="/fleetOwner"
          element={
            <ProtectedRoute allowedRole="fleetOwner">
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<FleetOwnerDashboard />} />
          <Route
            path="availableBookings"
            element={<h1>Available Bookings</h1>}
          />
          <Route path="trips" element={<h1>Trips</h1>} />
          <Route path="vehicles" element={<h1>Vehicles</h1>} />
          <Route path="drivers" element={<h1>Drivers</h1>} />
          <Route
            path="available-bids"
            element={<LoadsWithBiddingTable userRole="fleetOwner" />}
          />
          <Route path="read-bids" element={<Bids />} />
          <Route path="won-bids" element={<WonBids userRole="fleetOwner" />} />
          <Route path="my-bids" element={<MyBids userRole="fleetOwner" />} />
          <Route path="track-load/:loadId" element={<TrackLoadPage />} />
          <Route path="open-available-bids/:id" element={<LiveBidding />} />
          <Route path="place-bid/:loadId" element={<PlaceBid />} />
          <Route path="assigned-loads" element={<AssignedLoad />} />

          <Route path="load/:loadId" element={<UpdateLoadStatusPage />} />
        </Route>

        <Route path="loads" element={<StaffLoadsPage />} />

        <Route path="create-fleet-owner" element={<StaffCreateFleetOwner />} />
        <Route path="schedule-bidding/:loadId" element={<ScheduleBidding />} />
        <Route
          path="bidding-loads"
          element={<LoadsWithBiddingTable userRole="staff" />}
        />

        <Route path="load/status/:loadId" element={<StaffLoadDetails />} />
        <Route path="update-address" element={<UpdateAddressPage />} />
        <Route path="track-load/:loadId" element={<TrackLoadPage />} />

        <Route path="*" element={<h1>404 Not Found</h1>} />
      </Routes>
    </>
  );
}

export default App;
