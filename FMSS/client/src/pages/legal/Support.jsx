import LegalLayout from "./LegalLayout";

const SUPPORT_EMAIL = "support@bestloaders.com";

const FAQS = [
  {
    q: "How do I get an account?",
    a: "You need an approved carrier account. You can register from the sign-in screen in the FMSS Fleet app, or contact us and our office will set you up.",
  },
  {
    q: "Why does the app need my location?",
    a: "Live GPS is required from pickup through delivery so the office and the customer can see the freight’s position and ETA. Location is only shared while a load you have picked up is in transit — never before pickup or after delivery.",
  },
  {
    q: "How do I complete onboarding?",
    a: "In the app, add your driver licence and insurance and sign the carrier agreements. A driver cannot report a pickup or delivery until a licence is on file.",
  },
  {
    q: "How do I bid on a load?",
    a: "Open the Bids tab to see loads open for bidding, then place your bid. You can track everything you have bid on under My Bids.",
  },
  {
    q: "How do I delete my account?",
    a: "Open the menu in the app and choose “Delete account”. You can also email us and we will remove your account and personal data.",
  },
  {
    q: "A screen isn’t working",
    a: "Make sure you are on the latest version from the App Store, then restart the app. If it persists, email us with your device model and iOS version and we will investigate.",
  },
];

/**
 * Public support page. Apple requires a reachable Support URL for the listing,
 * and carriers are pointed here from the app.
 */
function Support() {
  return (
    <LegalLayout
      eyebrow="HELP"
      title="Support"
      intro="Help for carriers using the FMSS Fleet app and the Bestloaders platform — find and bid on loads, run them through pickup and delivery, share live GPS and capture proof of delivery."
    >
      <div className="legal-card">
        <h3>Contact us</h3>
        <p>We usually reply within one business day.</p>
        <a className="legal-contact-btn" href={`mailto:${SUPPORT_EMAIL}`}>
          Email support
        </a>
        <p style={{ marginTop: 12 }}>
          Or write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>

      <h2>Frequently asked questions</h2>
      {FAQS.map(({ q, a }) => (
        <div className="legal-card" key={q}>
          <h3>{q}</h3>
          <p style={{ marginBottom: 0 }}>{a}</p>
        </div>
      ))}

      <h2>Privacy</h2>
      <p>
        For what the app collects and how to delete your account, see our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalLayout>
  );
}

export default Support;
