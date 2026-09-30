# App Privacy Questionnaire Answers — Bestloaders FMS

Fill this into **App Store Connect → your app → App Privacy**. It must match `privacy-policy.html`.

**"Do you or your third-party partners collect data from this app?" → Yes**

The app has **no** third-party analytics, advertising, or tracking SDKs (only Expo, axios to bestloaders.com, expo-location, expo-image-picker/document-picker, expo-notifications). So for every item below: **Used for Tracking? → No.**

| Data type (Apple category) | In this app | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|---|
| Contact Info → **Email Address** | Login / account | Yes | Yes | No | App Functionality, Account Management |
| Location → **Precise Location** | Live GPS while a load is in transit (foreground + background) | Yes | Yes | No | App Functionality |
| User Content → **Photos or Videos** | Pickup/delivery proof, document uploads | Yes | Yes | No | App Functionality |
| User Content → **Other User Content** | Delivery signature | Yes | Yes | No | App Functionality |
| Identifiers → **Device ID** | Push notification token (instant dispatch) | Yes | Yes | No | App Functionality |

Notes for the reviewer-facing answers:
- **Tracking**: answer **"No, we do not use data for tracking"** for the whole app.
- **Precise Location** — when asked purposes, select **App Functionality** only (not Analytics/Product Personalization/Ads).
- Data is transmitted to the app's own backend (bestloaders.com) and tied to the carrier's account; it is not sold or shared with data brokers.
- Account & data deletion is offered — see privacy policy. (⚠️ Requires the in-app "Delete account" flow to actually exist — see README.)
