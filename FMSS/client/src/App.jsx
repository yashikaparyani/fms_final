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
import Locations from "./pages/admin/Locations";
import DeliveryPartners from "./pages/admin/DeliveryPartners";
import ChassisCompanies from "./pages/admin/ChassisCompanies";
import StaffManagement from "./pages/admin/StaffManagement";
import Permissions from "./pages/admin/Permissions";
import WhatsAppPanel from "./pages/admin/WhatsAppPanel";
import WhatsAppSettings from "./pages/admin/WhatsAppSettings";
import Drivers from "./pages/fleetOwner/Drivers";
import Onboarding from "./pages/fleetOwner/Onboarding";
import CarrierOnboardingGate from "./components/onboarding/CarrierOnboardingGate";
import CarrierOnboardingQueue from "./pages/staff/CarrierOnboardingQueue";
import CarrierOnboardingReview from "./pages/staff/CarrierOnboardingReview";
import DriverLocations from "./pages/fleetOwner/DriverLocations";
import MyLicense from "./pages/driver/MyLicense";
import AccountingSummary from "./pages/accounting/AccountingSummary";
import LoadAccounting from "./pages/accounting/LoadAccounting";
import ReportCentre from "./pages/reports/ReportCentre";
import InsuranceSubmission from "./pages/insurance/InsuranceSubmission";
import PermissionGate from "./components/PermissionGate";
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

        {/* PUBLIC — the carrier's insurance agency files certificates from a
            one-off emailed link. They have no account here; the token in the URL
            is the authorisation and the server checks it. */}
        <Route path="/insurance/:token" element={<InsuranceSubmission />} />

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
          {/* Staff & permission administration. Gated per screen because
              ProtectedRoute above guards the whole /admin area at once — see
              components/PermissionGate.jsx. */}
          <Route
            path="staff"
            element={
              <PermissionGate permission="staff.view">
                <StaffManagement />
              </PermissionGate>
            }
          />
          <Route
            path="permissions"
            element={
              <PermissionGate permission="permissions.view">
                <Permissions />
              </PermissionGate>
            }
          />
          <Route
            path="whatsapp"
            element={
              <PermissionGate permission="settings.view">
                <WhatsAppPanel />
              </PermissionGate>
            }
          />
          <Route
            path="whatsapp-settings"
            element={
              <PermissionGate permission="settings.manage">
                <WhatsAppSettings />
              </PermissionGate>
            }
          />
          <Route
            path="locations"
            element={
              <PermissionGate permission="locations.view">
                <Locations />
              </PermissionGate>
            }
          />
          <Route path="drivers" element={<Drivers />} />
          {/* The office completes onboarding on a carrier's behalf — a good half
              of these get finished over the phone. `?fleetOwnerId=` picks whose. */}
          <Route path="carrier-onboarding" element={<Onboarding />} />
          {/* …and reviews the finished article here. This is the screen behind
              "the office is reviewing your file" on the carrier's side. */}
          <Route
            path="onboarding-review"
            element={
              <PermissionGate permission="fleetOwners.view">
                <CarrierOnboardingQueue />
              </PermissionGate>
            }
          />
          <Route
            path="onboarding-review/:fleetOwnerId"
            element={
              <PermissionGate permission="fleetOwners.view">
                <CarrierOnboardingReview />
              </PermissionGate>
            }
          />
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
          {/* Per-load books and the summary built on them. Back office only —
              the margin between billed and paid is not the customer's or the
              carrier's business, which is why there is no filtered version. */}
          <Route path="accounting" element={<PermissionGate permission="reports.view"><AccountingSummary /></PermissionGate>} />
          <Route path="report-centre" element={<PermissionGate permission="reports.view"><ReportCentre /></PermissionGate>} />
          <Route path="accounting/:loadId" element={<PermissionGate permission="loads.view"><LoadAccounting /></PermissionGate>} />
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
          {/* The back office can see and manage any carrier's roster at their
              location — a carrier phoning in a new driver should not need to log
              in to do it. */}
          <Route path="drivers" element={<Drivers />} />
          {/* Same pair as the admin area: work a carrier's file with them on the
              phone, then review the finished one. */}
          <Route path="carrier-onboarding" element={<Onboarding />} />
          <Route
            path="onboarding-review"
            element={
              <PermissionGate permission="fleetOwners.view">
                <CarrierOnboardingQueue />
              </PermissionGate>
            }
          />
          <Route
            path="onboarding-review/:fleetOwnerId"
            element={
              <PermissionGate permission="fleetOwners.view">
                <CarrierOnboardingReview />
              </PermissionGate>
            }
          />
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
          {/* Per-load books and the summary built on them. Back office only —
              the margin between billed and paid is not the customer's or the
              carrier's business, which is why there is no filtered version. */}
          <Route path="accounting" element={<PermissionGate permission="reports.view"><AccountingSummary /></PermissionGate>} />
          <Route path="report-centre" element={<PermissionGate permission="reports.view"><ReportCentre /></PermissionGate>} />
          <Route path="accounting/:loadId" element={<PermissionGate permission="loads.view"><LoadAccounting /></PermissionGate>} />
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
              {/* Closed until both agreements are signed — see the gate. */}
              <CarrierOnboardingGate>
                <Dashboard />
              </CarrierOnboardingGate>
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
          <Route path="drivers" element={<Drivers />} />
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
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="driver-locations" element={<DriverLocations />} />

          <Route path="load/:loadId" element={<UpdateLoadStatusPage />} />
        </Route>

        {/* ================= DRIVER (sub-account of a fleet owner) ============
            Drivers live mostly in the mobile app; this is the small web surface
            they need — the trips assigned to their carrier, and the screens for
            updating one. Everything is resolved from their own account to their
            carrier server-side, so there is nothing here a driver can point at
            another carrier's loads. */}
        <Route
          path="/driver"
          element={
            <ProtectedRoute allowedRole="driver">
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AssignedLoad />} />
          <Route path="assigned-loads" element={<AssignedLoad />} />
          {/* The one screen a driver must be able to reach without a licence on
              file — it is where they fix exactly that. */}
          <Route path="my-license" element={<MyLicense />} />
          <Route path="load/:loadId" element={<UpdateLoadStatusPage />} />
          <Route path="track-load/:loadId" element={<TrackLoadPage />} />
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
