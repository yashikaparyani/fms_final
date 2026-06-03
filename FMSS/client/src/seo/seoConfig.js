// Central SEO config. Change SITE_NAME / SITE_URL here once and it applies everywhere.
export const SITE_NAME = "BestLoaders";
export const SITE_TAGLINE = "Freight Management System";
export const SITE_URL = "https://bestloaders.com";

const DEFAULT_DESCRIPTION =
  "BestLoaders is a complete freight management system to post loads, run live bidding, assign fleet owners, and track shipments in real time.";

// Exact-path overrides (mainly the public pages that search engines can see).
const PAGE_META = {
  "/": {
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
  },
  "/admin-login": {
    title: `Admin Login – ${SITE_NAME}`,
    description: "Secure admin login to the BestLoaders freight management dashboard.",
  },
  "/client-login": {
    title: `Customer Login – ${SITE_NAME}`,
    description: "Customer login to post loads and track shipments on BestLoaders.",
  },
  "/vendor-login": {
    title: `Fleet Owner Login – ${SITE_NAME}`,
    description: "Fleet owner login to bid on loads and manage assigned trips on BestLoaders.",
  },
  "/staff-login": {
    title: `Staff Login – ${SITE_NAME}`,
    description: "Staff login to manage loads, customers, and fleet owners on BestLoaders.",
  },
  "/client/register": {
    title: `Customer Registration – ${SITE_NAME}`,
    description: "Create a BestLoaders customer account to start shipping freight.",
  },
};

// Turn a url segment like "create-customer" into "Create Customer".
const prettify = (segment) =>
  segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Is this segment an id/param we should ignore for the title? (mongo id, number, LD-0009, etc.)
const isParam = (s) =>
  /^[0-9a-f]{12,}$/i.test(s) || /^\d+$/.test(s) || /^LD-/i.test(s);

export function getSeoForPath(pathname) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];

  // Derive a readable title from the last meaningful segment.
  const segments = pathname.split("/").filter(Boolean).filter((s) => !isParam(s));
  const last = segments[segments.length - 1];
  const title = last
    ? `${prettify(last)} – ${SITE_NAME}`
    : `${SITE_NAME} | ${SITE_TAGLINE}`;

  return { title, description: DEFAULT_DESCRIPTION };
}
