import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import MenuIcon from "@mui/icons-material/Menu";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import RvHookupOutlinedIcon from "@mui/icons-material/RvHookupOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import PeopleOutlineOutlinedIcon from "@mui/icons-material/PeopleOutlineOutlined";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";

// ─── Sidebar / mobile navigation ──────────────────────────────────────────────
// `visible` is the role gate — which portal an entry belongs to at all.
// `permission` is the second gate, applied on top for staff only: a key from
// server/config/permissions.js that the user must hold for the entry to render.
//
// An entry with no `permission` is visible to every role listed. That is right
// for the portal roles (a carrier's own screens are not permission-gated) and
// for Dashboard, which every back-office user needs a landing page for.
//
// Hiding an entry hides a link, nothing more — the route and the API behind it
// are both checked independently. See utils/permissions.js.
// ─────────────────────────────────────────────────────────────────────────────

export const navItems = [
  {
    label: "Dashboard",
    path: "dashboard",
    icon: DashboardOutlinedIcon,
    visible: ["admin", "staff", "client", "fleetOwner", "driver"],
  },

  // {
  //   label: "Analytics",
  //   path: "analytics",
  //   icon: TrendingUpOutlinedIcon,
  //   visible: ["admin", "staff"],
  // },
  {
    label: "Customer",
    path: "customers",
    icon: PeopleOutlineOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "customers.view",
  },
  {
    label: "Fleet Owners",
    path: "fleet-owners",
    icon: PersonOutlineOutlinedIcon,
    visible: ["staff","admin"],
    permission: "fleetOwners.view",
  },
  {
    label: "New Load",
    path: "create-load",
    icon: AddBoxOutlinedIcon,
    visible: ["staff", "client", "admin"],
    permission: "loads.create",
  },
  {
    label: "Loads",
    path: "read-load",
    icon: PendingActionsOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "loads.view",
  },
  {
    label: "Bids",
    path: "read-bids",
    icon: PendingActionsOutlinedIcon,
    visible: ["staff", "admin","fleetOwner"],
    permission: "bids.view",
  },
  // {
  //   label: "Pending Loads",
  //   path: "pending-loads",
  //   icon: PendingActionsOutlinedIcon,
  //   visible: ["staff", "admin"],
  // },
  // {
  //   label: "Verified Loads",
  //   path: "verified-loads",
  //   icon: VerifiedOutlinedIcon,
  //   visible: ["staff", "admin"],
  // },
  // {
  //   label: "Bidding Loads",
  //   path: "bidding-loads",
  //   icon: GavelOutlinedIcon,
  //   visible: ["staff", "admin"],
  //   description: "View all loads with bidding status"
  // },
  // {
  //   label: "Masters",
  //   path: "master",
  //   icon: SettingsOutlinedIcon,
  //   visible: ["admin", "staff"],
  // },
  {
    label: "My Loads",
    path: "my-loads",
    icon: AssignmentOutlinedIcon,
    visible: ["client"],
  },
  // {
  //   label: "My Active Bids",
  //   path: "my-loads-bidding",
  //   icon: GavelOutlinedIcon,
  //   visible: ["client"],
  //   description: "Track bids on your loads",
  // },
  // {
  //   label: "Active Bids",
  //   path: "available-bids",
  //   icon: GavelOutlinedIcon,
  //   visible: ["admin", "staff", "fleetOwner"],
  //   description: "Browse loads available for bidding",
  // },
  // {
  //   label: "My Bids",
  //   path: "my-bids",
  //   icon: GavelOutlinedIcon,
  //   visible: ["fleetOwner"],
  //   description: "View and track your placed bids",
  // },
  // {
  //   label: "Won Bids",
  //   path: "won-bids",
  //   icon: EmojiEventsOutlinedIcon,
  //   visible: ["fleetOwner"],
  //   description: "Bids you've won",
  // },
  {
    label: "Assigned Loads",
    path: "assigned-loads",
    icon: EmojiEventsOutlinedIcon,
    // A driver sees the same list as their carrier — it is the list of runs they
    // may be asked to make, narrowed to their own carrier server-side.
    visible: ["fleetOwner", "driver"],
    description: "Assigned loads",
  },
  {
    label: "Drivers",
    path: "drivers",
    icon: BadgeOutlinedIcon,
    visible: ["fleetOwner"],
    description: "Add your drivers and give them app logins",
  },
  {
    label: "Driver Locations",
    path: "driver-locations",
    icon: PlaceOutlinedIcon,
    visible: ["fleetOwner"],
    description: "Where your drivers are right now",
  },
  {
    label: "Onboarding",
    path: "onboarding",
    icon: FactCheckOutlinedIcon,
    visible: ["fleetOwner"],
    description: "Agreements, driver licences and insurance",
  },
  {
    label: "My Licence",
    path: "my-license",
    icon: BadgeOutlinedIcon,
    visible: ["driver"],
    description: "Upload your licence so you can update loads",
  },
  // {
  //   label: "Trips",
  //   path: "trips",
  //   icon: RouteOutlinedIcon,
  //   visible: ["fleetOwner"],
  // },
  // {
  //   label: "Vehicles",
  //   path: "vehicles",
  //   icon: DirectionsCarOutlinedIcon,
  //   visible: ["fleetOwner"],
  // },
  // {
  //   label: "Drivers",
  //   path: "drivers",
  //   icon: BadgeOutlinedIcon,
  //   visible: ["fleetOwner"],
  // },
    {
    label: "Reports",
    path: "reports",
    icon: AssessmentOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "reports.view",
  },
  {
    label: "Accounting",
    path: "accounting",
    icon: AccountBalanceWalletOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "reports.view",
    description: "Receivables, payables, margin and driver payroll",
  },
  {
    label: "Report Centre",
    path: "report-centre",
    icon: SummarizeOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "reports.view",
    description: "Financial, yard and exception reports with CSV export",
  },
  {
    label: "Staff",
    path: "staff",
    icon: GroupsOutlinedIcon,
    visible: ["admin"],
    permission: "staff.view",
    description: "Add staff — one at a time or a whole team",
  },
  {
    label: "Permissions",
    path: "permissions",
    icon: AdminPanelSettingsOutlinedIcon,
    visible: ["admin"],
    permission: "permissions.view",
    description: "Who may reach which module, and which locations",
  },
  {
    label: "WhatsApp",
    path: "whatsapp",
    icon: WhatsAppIcon,
    visible: ["admin", "staff"],
    permission: "settings.view",
    description: "Send announcements and load updates over WhatsApp",
  },
  {
    label: "WhatsApp Setup",
    path: "whatsapp-settings",
    icon: WhatsAppIcon,
    visible: ["admin"],
    permission: "settings.manage",
    description: "Meta Cloud API credentials and sending switches",
  },
  {
    label: "Locations",
    path: "locations",
    icon: PlaceOutlinedIcon,
    visible: ["admin"],
    permission: "locations.view",
    description: "Add and manage operating locations",
  },
  {
    label: "Shipping Lines",
    path: "shipping-lines",
    icon: DirectionsBoatOutlinedIcon,
    visible: ["admin"],
    permission: "masters.view",
    description: "Manage the shipping line master",
  },
  {
    label: "Delivery Partners",
    path: "delivery-partners",
    icon: HandshakeOutlinedIcon,
    visible: ["admin"],
    permission: "masters.view",
    description: "Manage the delivery partner master",
  },
  {
    label: "Chassis Companies",
    path: "chassis-companies",
    icon: RvHookupOutlinedIcon,
    visible: ["admin"],
    permission: "masters.view",
    description: "Manage the chassis company master",
  },
];

/**
 * The entries a user should actually see: role first, then permission.
 *
 * Exported so the sidebar and the mobile menu cannot drift apart — they were
 * filtering with two separate copies of the same condition before.
 */
export const visibleNavItems = (user) => {
  if (!user?.role) return [];

  return navItems.filter((item) => {
    if (!item.visible.includes(user.role)) return false;
    if (!item.permission) return true;
    if (user.role === "admin") return true;
    // Portal roles are bounded by their own screens, not by the staff
    // permission list — see utils/permissions.js.
    if (["client", "fleetOwner", "driver"].includes(user.role)) return true;
    return (user.permissions || []).includes(item.permission);
  });
};
