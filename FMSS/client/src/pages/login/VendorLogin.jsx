import Login from "./Login";

// Carriers and their drivers share one door. A driver's sub-account is issued by
// their carrier and mailed with this URL on it, and sending them to a separate
// login page would mean explaining the difference to somebody who only wants to
// see today's trip.
// No self-registration: a carrier account is opened by the office, which then
// mails the credentials out. There is deliberately no sign-up link here.
export default function VendorLogin() {
  return <Login allowedRole={["fleetOwner", "driver"]} title="CARRIER LOGIN" />;
}