import { onboardingStatusMeta } from "../../utils/onboardingStatus";

/** The one rendering of a carrier onboarding status, used by every screen. */
const OnboardingStatusBadge = ({ status, className = "" }) => {
  const meta = onboardingStatusMeta(status);

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.badge} ${className}`}
    >
      {meta.label}
    </span>
  );
};

export default OnboardingStatusBadge;
