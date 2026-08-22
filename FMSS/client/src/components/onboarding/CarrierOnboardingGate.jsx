import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api from "../../api";

// ─── Carrier onboarding gate ─────────────────────────────────────────────────
// A carrier reaches this portal one of two ways: the office opens the account
// directly, or they apply at /register and the office approves it. Either way
// the credentials are mailed out and the first thing they do here is sign in —
// the public form collects who they are, never their paperwork. So the
// paperwork is collected on the way in, and the two agreements are the part
// that cannot wait: they are the contract under which any load could be
// dispatched at all.
//
// So the portal is closed until both are signed. Everything after that — driver
// licences, insurance — is chased from the dashboard rather than blocking it,
// because insurance depends on a third party (the carrier's agent) and holding
// the whole account hostage to somebody else's inbox strands a carrier who has
// done everything asked of them.
//
// `agreementsComplete` is computed server-side (controllers/onboardingController)
// from the model's own rule, so adding a third agreement moves this gate without
// touching this file.
// ─────────────────────────────────────────────────────────────────────────────

// The onboarding wizard itself, and sign-out, must stay reachable while the gate
// is closed — otherwise there is no way to satisfy it or to leave.
const ALWAYS_ALLOWED = ["/fleetOwner/onboarding"];

const CarrierOnboardingGate = ({ children }) => {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, complete: false });

  useEffect(() => {
    let cancelled = false;

    api
      .get("/onboarding")
      .then(({ data }) => {
        if (!cancelled) {
          setState({ loading: false, complete: !!data.agreementsComplete });
        }
      })
      .catch(() => {
        // The gate is a routing convenience, not the security boundary — every
        // carrier-facing API re-checks server-side. If the check itself fails
        // (offline, a 500), let them through rather than locking a carrier out
        // of the portal over a failed GET.
        if (!cancelled) setState({ loading: false, complete: true });
      });

    return () => {
      cancelled = true;
    };
    // Re-checked on navigation into a gated screen, so signing the second
    // agreement opens the portal without a reload.
  }, [location.pathname]);

  if (ALWAYS_ALLOWED.includes(location.pathname)) return children;

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!state.complete) {
    return <Navigate to="/fleetOwner/onboarding" replace />;
  }

  return children;
};

export default CarrierOnboardingGate;
