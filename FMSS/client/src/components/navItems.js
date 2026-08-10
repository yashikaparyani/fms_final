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

export const navItems = [
  {
    label: "Dashboard",
    path: "dashboard",
    icon: DashboardOutlinedIcon,
    visible: ["admin", "staff", "client", "fleetOwner"],
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
  },
  {
    label: "Fleet Owners",
    path: "fleet-owners",
    icon: PersonOutlineOutlinedIcon,
    visible: ["staff","admin"],
  },
  {
    label: "New Load",
    path: "create-load",
    icon: AddBoxOutlinedIcon,
    visible: ["staff", "client", "admin"],
  },
  {
    label: "Loads",
    path: "read-load",
    icon: PendingActionsOutlinedIcon,
    visible: ["staff", "admin"],
  },
  {
    label: "Bids",
    path: "read-bids",
    icon: PendingActionsOutlinedIcon,
    visible: ["staff", "admin","fleetOwner"],
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
    visible: ["fleetOwner"],
    description: "Assigned loads",
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
  },
  {
    label: "Shipping Lines",
    path: "shipping-lines",
    icon: DirectionsBoatOutlinedIcon,
    visible: ["admin"],
    description: "Manage the shipping line master",
  },
  {
    label: "Delivery Partners",
    path: "delivery-partners",
    icon: HandshakeOutlinedIcon,
    visible: ["admin"],
    description: "Manage the delivery partner master",
  },
  {
    label: "Chassis Companies",
    path: "chassis-companies",
    icon: RvHookupOutlinedIcon,
    visible: ["admin"],
    description: "Manage the chassis company master",
  },
];
