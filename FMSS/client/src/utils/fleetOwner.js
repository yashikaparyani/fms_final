// Fleet owners carry a permanent human-readable code ("FO-0001") alongside the
// carrier name, because carrier names are neither unique nor stable — two
// carriers can trade under similar names, and a rename must not change who a
// load was given to. The code is what staff quote to each other.

/** The code, or a dash for owners created before codes existed. */
export const fleetOwnerCode = (fleetOwner) => fleetOwner?.fleetOwnerCode || "—";

/**
 * One-line identity for pickers and lists: "FO-0001 · Acme Trucking (555-0100)".
 * The code leads so a staff member scanning the list can match on it directly.
 */
export const fleetOwnerLabel = (fleetOwner) => {
  if (!fleetOwner) return "";

  const name = fleetOwner.carrierName || "Unnamed carrier";
  const withCode = fleetOwner.fleetOwnerCode
    ? `${fleetOwner.fleetOwnerCode} · ${name}`
    : name;

  return fleetOwner.phone ? `${withCode} (${fleetOwner.phone})` : withCode;
};
