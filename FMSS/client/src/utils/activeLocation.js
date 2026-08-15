// The location the user is currently working in.
//
// Kept in localStorage rather than Redux so the axios interceptor can read it
// synchronously on every request without importing the store into a cycle, and
// so a page refresh lands the user back where they were.
//
// The value is only ever a hint: the server re-checks membership on every
// request and rejects a location the user does not belong to. Tampering with it
// in devtools gets a 403, not somebody else's data.

const KEY = "fmss_active_location";
const ALL = "all";

export const ACTIVE_LOCATION_EVENT = "fmss:location-changed";

export const getActiveLocation = () => localStorage.getItem(KEY) || "";

export const setActiveLocation = (locationId) => {
  if (locationId) localStorage.setItem(KEY, locationId);
  else localStorage.removeItem(KEY);

  // Lets any mounted screen refetch without a full page reload.
  window.dispatchEvent(new CustomEvent(ACTIVE_LOCATION_EVENT, { detail: locationId }));
};

export const clearActiveLocation = () => localStorage.removeItem(KEY);

export const isAllLocations = (value = getActiveLocation()) => value === ALL;

export const ALL_LOCATIONS = ALL;
