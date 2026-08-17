# iOS App Store Submission Notes — Bestloaders FMS

Reference for submitting the FMSS fleet-owner app to the App Store. TestFlight
testing does **not** require the App Privacy / reviewer sections below — those are
needed only when submitting for **App Store review**. Keep this for that step.

## App identifiers

| Item | Value |
|------|-------|
| App Store name | Bestloaders FMS |
| Bundle ID | `com.bestloaders.fmssfleet` |
| Apple Developer Team | Ravi Sher — Team ID `J8X2QY2435` |
| SKU | `fmss-fleet-ios` |
| EAS project ID | `f61bdd54-9435-4a8f-a592-a2c2799dff39` |
| Backend API | https://bestloaders.com/api |

## Build & submit

```bash
cd FMSS/mobile
eas build --platform ios     # builds .ipa on EAS (logs into Apple team J8X2QY2435)
eas submit --platform ios    # uploads to App Store Connect -> TestFlight
```

After ~5–15 min of Apple processing the build appears under
**Bestloaders FMS → TestFlight**. Add internal testers there to test now.

---

## App Privacy questionnaire (needed before App Store review, not TestFlight)

**"Do you collect data from this app?" → Yes**

All items are **Linked to the user's identity**, used **only for App Functionality**,
and **NOT used for tracking** (no analytics/ad SDKs in the app).

| Data type (Apple category) | What it is | Purpose | Linked? | Tracking? |
|---|---|---|---|---|
| Contact Info → Email Address | Login credential | App Functionality, Account | Linked | No |
| Location → Precise Location | GPS during in-transit load tracking | App Functionality | Linked | No |
| User Content → Photos or Videos | Pickup-proof photos, delivery documents | App Functionality | Linked | No |
| User Content → Other User Content | Delivery signature | App Functionality | Linked | No |
| Identifiers → User ID | Account / fleet-owner ID | App Functionality | Linked | No |

"Is this data used to track you?" → **No** for every item.

> Requires a hosted **Privacy Policy URL** in the listing that matches the above.

---

## App Review notes (App Store Connect → App Review Information → Notes)

```
DEMO ACCOUNT (required — app is login-only for fleet owners/carriers):
  Email:    <demo fleet-owner email>
  Password: <demo password>

ABOUT THE APP:
Bestloaders FMS is a B2B tool for freight carriers (fleet owners). After
signing in, a fleet owner views open loads, submits/revises bids, and once a
load is awarded, confirms it and manages it through pickup -> in-transit ->
delivery.

BACKGROUND LOCATION JUSTIFICATION:
Location (including background mode) is used ONLY while a load the driver has
picked up is actively in transit. It powers real-time shipment tracking shown
to the broker and customer so they know the freight's live position and ETA.
Tracking is not active before pickup or after delivery. The user grants
location permission and the in-app usage strings explain this.

CAMERA / PHOTOS:
Used to capture proof-of-pickup photos and delivery documents (e.g. proof of
delivery), and to capture the recipient's delivery signature.

TEST FLOW FOR REVIEWER:
1. Log in with the demo account above.
2. Open the list of available loads and place a bid.
3. (If a load is pre-assigned to the demo account) open it, confirm pickup,
   and observe the live-tracking + proof-of-delivery screens.
```

## Most common rejection causes (address before submitting for review)

1. **No demo account** — fill in the two `<...>` placeholders above with a working,
   persistent fleet-owner login. The API must be publicly reachable (it is:
   `https://bestloaders.com/api`).
2. **Background location** — justified in the review notes above; keep it concise.
3. **Missing Privacy Policy URL** — required in the listing.
4. **Missing screenshots** — 6.7" iPhone screenshots required at minimum.
