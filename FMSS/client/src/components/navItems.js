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
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";

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
    // Where the office writes to everybody — the marquee across every portal
    // and the one-off push into the notification bell.
    label: "Announcements",
    path: "announcements",
    icon: CampaignOutlinedIcon,
    visible: ["staff", "admin"],
    description: "Post a marquee or send a notification",
  },
  {
    // Public sign-ups waiting on a decision. Sits above the directories it
    // feeds: nothing reaches Customer or Fleet Owners without passing here
    // first, because approving is what creates the account.
    label: "Registrations",
    path: "signup-approvals",
    icon: HowToRegOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "customers.view",
    description: "Approve customer and carrier sign-ups",
  },
  {
    label: "Fleet Owners",
    path: "fleet-owners",
    icon: PersonOutlineOutlinedIcon,
    visible: ["staff","admin"],
    permission: "fleetOwners.view",
  },
  {
    // The office end of carrier onboarding: the queue of files waiting on a
    // decision, and the screen the documents are actually verified on. Sits
    // next to Fleet Owners because it is the same directory read a different
    // way — "who can we dispatch to" rather than "who exists".
    label: "Onboarding Review",
    path: "onboarding-review",
    icon: FactCheckOutlinedIcon,
    visible: ["staff", "admin"],
    permission: "fleetOwners.view",
    description: "Verify carrier agreements, licences and insurance",
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
    label: "Loads Near You",
    path: "instant-offers",
    icon: BoltOutlinedIcon,
    visible: ["fleetOwner"],
    description: "Loads offered because a driver of yours is close by",
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
    label: "Administration",
    icon: AdminPanelSettingsOutlinedIcon,
    description: "Who works here and what they may reach",
    children: [
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
    ],
  },
  // ── Grouped entries ────────────────────────────────────────────────────────
  // Three clusters that used to be nine separate rows. They are all low-traffic
  // screens — a master list is edited when a new shipping line appears, not
  // daily — and spreading them down the rail pushed the work people actually do
  // below the fold.
  //
  // A group is not a screen and has no `path` of its own: it opens to show its
  // children. Role and permission are still decided per child, so a staff member
  // granted one of them sees a group holding exactly that one, and somebody
  // granted none never sees the group at all.
  {
    label: "Accounting",
    icon: AccountBalanceWalletOutlinedIcon,
    description: "Receivables, payables, margin and the report centre",
    children: [
      {
        label: "Accounting",
        path: "accounting",
        icon: AccountBalanceWalletOutlinedIcon,
        visible: ["staff", "admin"],
        permission: "reports.view",
        description: "Receivables, payables, margin and driver payroll",
      },
      {
        label: "Invoices",
        path: "accounting/invoices",
        icon: ReceiptLongOutlinedIcon,
        visible: ["staff", "admin"],
        permission: "reports.view",
        description: "Customer invoices, carrier bills and the payments against them",
      },
      {
        label: "Customer Accounts",
        path: "accounting/customers",
        icon: PeopleAltOutlinedIcon,
        visible: ["staff", "admin"],
        permission: "reports.view",
        description: "What each customer owes, how old it is, and their statement",
      },
      {
        label: "Load Ledger",
        path: "accounting/load-ledger",
        icon: PaymentsOutlinedIcon,
        visible: ["staff", "admin"],
        permission: "reports.view",
        description: "Receivable against payable per load, with every extra charge",
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
        label: "Reports",
        path: "reports",
        icon: AssessmentOutlinedIcon,
        visible: ["staff", "admin"],
        permission: "reports.view",
      },
    ],
  },
  {
    label: "WhatsApp",
    icon: WhatsAppIcon,
    description: "Announcements, load updates and the Cloud API setup",
    children: [
      {
        label: "Send & History",
        path: "whatsapp",
        icon: WhatsAppIcon,
        visible: ["admin", "staff"],
        permission: "settings.view",
        description: "Send announcements and load updates over WhatsApp",
      },
      {
        label: "WhatsApp Setup",
        path: "whatsapp-settings",
        icon: SettingsOutlinedIcon,
        visible: ["admin"],
        permission: "settings.manage",
        description: "Meta Cloud API credentials and sending switches",
      },
    ],
  },
  {
    label: "Masters",
    icon: SettingsOutlinedIcon,
    description: "Shipping lines, partners, chassis companies and locations",
    children: [
      {
        label: "Shipping Lines",
        path: "shipping-lines",
        icon: DirectionsBoatOutlinedIcon,
        visible: ["admin"],
        permission: "masters.view",
        description: "Manage the shipping line master",
      },
      {
        label: "Instant Dispatch",
        path: "dispatch-settings",
        icon: BoltOutlinedIcon,
        visible: ["admin"],
        permission: "masters.view",
        description: "Commission rate and nearest-driver settings",
      },
      {
        label: "Street Turn Partners",
        path: "street-turn-partners",
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
      {
        label: "Locations",
        path: "locations",
        icon: PlaceOutlinedIcon,
        visible: ["admin"],
        permission: "locations.view",
        description: "Add and manage operating locations",
      },
    ],
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

  const allowed = (item) => {
    if (!item.visible.includes(user.role)) return false;
    if (!item.permission) return true;
    if (user.role === "admin") return true;
    // Portal roles are bounded by their own screens, not by the staff
    // permission list — see utils/permissions.js.
    if (["client", "fleetOwner", "driver"].includes(user.role)) return true;
    return (user.permissions || []).includes(item.permission);
  };

  return navItems
    .map((item) => {
      if (!item.children) return allowed(item) ? item : null;

      // A group is only as visible as its contents. It carries no permission of
      // its own, so it survives exactly when something inside it does —
      // otherwise a staff member with no master data would get a Masters entry
      // that opens onto nothing.
      const children = item.children.filter(allowed);
      return children.length ? { ...item, children } : null;
    })
    .filter(Boolean);
};

/** Every reachable screen, groups flattened — for callers that want paths. */
export const flatNavItems = (user) =>
  visibleNavItems(user).flatMap((item) => item.children || [item]);
