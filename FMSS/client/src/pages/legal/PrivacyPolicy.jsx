import LegalLayout from "./LegalLayout";

const SUPPORT_EMAIL = "support@bestloaders.com";

/**
 * Public privacy policy. Apple requires a reachable Privacy Policy URL for the
 * App Store listing, and what it says has to match the App Privacy answers
 * declared in App Store Connect (see FMSS/mobile/appstore/app-privacy.md).
 */
function PrivacyPolicy() {
  return (
    <LegalLayout
      eyebrow="LEGAL"
      title="Privacy Policy"
      intro="How S Line Brokerage Inc. (Bestloaders) and the FMSS Fleet mobile app collect and use information."
      updated="30 September 2026"
    >
      <p>
        This policy covers the Bestloaders web platform at{" "}
        <a href="https://bestloaders.com">bestloaders.com</a> and the{" "}
        <strong>FMSS Fleet</strong> mobile app for carriers. Questions? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email address, phone number and
          company details, used to sign you in and identify your carrier account.
        </li>
        <li>
          <strong>Precise location</strong> — GPS location, including in the background, but{" "}
          <strong>only while a load you have picked up is in transit</strong>. It powers live
          shipment tracking for the broker and the customer. Tracking is not active before
          pickup or after delivery.
        </li>
        <li>
          <strong>Photos and documents</strong> — pickup and delivery proof photos, proof of
          delivery, and onboarding documents such as driver licence and insurance certificates
          that you choose to capture or upload.
        </li>
        <li>
          <strong>Delivery signature</strong> — a signature captured on your device from the
          person receiving the freight.
        </li>
        <li>
          <strong>Push notification token</strong> — a device identifier used to alert you when
          a load is offered near you.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use this information solely to operate the service: authentication, posting and
        bidding on loads, live shipment tracking, proof of pickup and delivery, document
        handling, settlements and notifications. We do not use it for advertising or profiling.
      </p>

      <h2>Tracking and third parties</h2>
      <p>
        The mobile app contains <strong>no third-party analytics, advertising or tracking
        SDKs</strong>. We do not track you across other companies’ apps or websites, and we do
        not sell your data or share it with data brokers. Data is transmitted to our own
        servers to provide the service. Push notifications are delivered through Apple Push
        Notification service and Expo’s push service.
      </p>

      <h2>Sharing</h2>
      <p>
        Load and tracking information is shared with the parties to that shipment — the broker
        and the customer whose freight you are moving — so they can see its status and
        location. We may disclose information where required by law or to meet freight
        recordkeeping obligations.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep your account and load records for as long as your account is active and as
        needed to provide the service and meet legal, tax and freight recordkeeping
        obligations.
      </p>

      <h2>Your choices and account deletion</h2>
      <ul>
        <li>
          You control location, camera, photo and notification permissions in your device
          settings at any time. Declining location will prevent pickup and tracking, which the
          service requires.
        </li>
        <li>
          You can <strong>delete your account from inside the app</strong> — open the menu and
          choose <em>Delete account</em>. You can also request deletion by emailing{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We delete personal data
          except records we are required to retain by law.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Traffic is encrypted in transit over HTTPS, passwords are stored hashed, and access to
        production data is restricted to authorised staff.
      </p>

      <h2>Children</h2>
      <p>The service is a business tool and is not directed to children under 13.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy. Material changes will be reflected by the “Last updated”
        date above.
      </p>

      <h2>Contact</h2>
      <p>
        S Line Brokerage Inc. · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalLayout>
  );
}

export default PrivacyPolicy;
