import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/dashboard/Dashboard";
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
import StreetTurnPartners from "./pages/admin/StreetTurnPartners";
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
import DispatchSettings from "./pages/admin/DispatchSettings";
import InstantOffers from "./pages/fleetOwner/InstantOffers";
import DriverLocations from "./pages/fleetOwner/DriverLocations";
import MyLicense from "./pages/driver/MyLicense";
import DriverDashboard from "./pages/driver/DriverDashboard";
import AccountingSummary from "./pages/accounting/AccountingSummary";
import LoadAccounting from "./pages/accounting/LoadAccounting";
import Invoices from "./pages/accounting/Invoices";
import InvoiceDetail from "./pages/accounting/InvoiceDetail";
import ManualInvoice from "./pages/accounting/ManualInvoice";
import CustomerLedger from "./pages/accounting/CustomerLedger";
import LoadLedgerReport from "./pages/accounting/LoadLedgerReport";
import ReportCentre from "./pages/reports/ReportCentre";
import InsuranceSubmission from "./pages/insurance/InsuranceSubmission";
import PermissionGate from "./components/PermissionGate";
import Seo from "./components/Seo";
import Login from "./pages/login/Login";
import Register from "./pages/Register";
import StreetTurnSign from "./pages/StreetTurnSign";
import SignupApprovals from "./pages/admin/SignupApprovals";
import Announcements from "./pages/admin/Announcements";
import RoleTheme from "./components/RoleTheme";

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
      <RoleTheme />
      <Routes>
        {/* Default Route */}
        <Route
          path="/"
          element={<LandingPage />}
        />

        {/* ONE SIGN-IN DOOR.
            There were four, one per role, and anyone who picked the wrong one
            was told their correct credentials were invalid. The account carries
            its own role, so /login accepts everybody and routes on the response.
            The old addresses are kept as redirects — they are in bookmarks, old
            emails and the mobile app's links. */}
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<Navigate to="/login" replace />} />
        <Route path="/client-login" element={<Navigate to="/login" replace />} />
        <Route path="/vendor-login" element={<Navigate to="/login" replace />} />
        <Route path="/staff-login" element={<Navigate to="/login" replace />} />
        <Route path="/driver-login" element={<Navigate to="/login" replace />} />
        <Route path="/fleetOwner-login" element={<Navigate to="/login" replace />} />

        {/* PUBLIC REGISTRATION — customer or carrier, both awaiting approval. */}
        <Route path="/register" element={<Register />} />
        <Route path="/client/register" element={<Navigate to="/register" replace />} />

        {/* PUBLIC — the carrier's insurance agency files certificates from a
            one-off emailed link. They have no account here; the token in the URL
            is the authorisation and the server checks it. */}
        <Route path="/insurance/:token" element={<InsuranceSubmission />} />

        {/* PUBLIC — the street turn partner signs the handover from a one-off
            emailed link. Like the insurance route above, the token in the URL is
            the authorisation and the server checks it; there is no account. */}
        <Route path="/street-turn/:token" element={<StreetTurnSign />} />

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
          <Route
            path="signup-approvals"
            element={
              <PermissionGate permission="customers.view">
                <SignupApprovals />
              </PermissionGate>
            }
          />
          <Route path="announcements" element={<Announcements />} />
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
          {/* The commission rate and the instant-dispatch dials. Admin only —
              this is what the business earns per load. */}
          <Route path="dispatch-settings" element={<DispatchSettings />} />
          <Route path="street-turn-partners" element={<StreetTurnPartners />} />
          {/* Renamed from Delivery Partners; the old path is in bookmarks. */}
          <Route path="delivery-partners" element={<StreetTurnPartners />} />
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
          {/* Mounted before "accounting/:loadId", or every one of these paths
              is read as a load id and resolves to a load that does not exist. */}
          <Route path="accounting/invoices" element={<PermissionGate permission="reports.view"><Invoices /></PermissionGate>} />
          <Route path="accounting/invoices/new" element={<PermissionGate permission="loads.edit"><ManualInvoice /></PermissionGate>} />
          <Route path="accounting/invoices/:id" element={<PermissionGate permission="reports.view"><InvoiceDetail /></PermissionGate>} />
          <Route path="accounting/customers" element={<PermissionGate permission="reports.view"><CustomerLedger /></PermissionGate>} />
          <Route path="accounting/load-ledger" element={<PermissionGate permission="reports.view"><LoadLedgerReport /></PermissionGate>} />
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
          <Route
            path="signup-approvals"
            element={
              <PermissionGate permission="customers.view">
                <SignupApprovals />
              </PermissionGate>
            }
          />
          <Route path="announcements" element={<Announcements />} />
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
          {/* Mounted before "accounting/:loadId", or every one of these paths
              is read as a load id and resolves to a load that does not exist. */}
          <Route path="accounting/invoices" element={<PermissionGate permission="reports.view"><Invoices /></PermissionGate>} />
          <Route path="accounting/invoices/new" element={<PermissionGate permission="loads.edit"><ManualInvoice /></PermissionGate>} />
          <Route path="accounting/invoices/:id" element={<PermissionGate permission="reports.view"><InvoiceDetail /></PermissionGate>} />
          <Route path="accounting/customers" element={<PermissionGate permission="reports.view"><CustomerLedger /></PermissionGate>} />
          <Route path="accounting/load-ledger" element={<PermissionGate permission="reports.view"><LoadLedgerReport /></PermissionGate>} />
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
          {/* Loads offered because one of their drivers is near the pickup. */}
          <Route path="instant-offers" element={<InstantOffers />} />

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
          {/* Their own runs, not their carrier board — see DriverDashboard. */}
          <Route path="dashboard" element={<DriverDashboard />} />
          <Route path="my-loads" element={<DriverDashboard />} />
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
