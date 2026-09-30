# App Review Information — Bestloaders FMS

Paste into **App Store Connect → your version → App Review Information → Notes**, and fill the demo account. This is the #1 thing reviewers need for a login-gated app.

## Sign-In Required → provide a demo account
```
Username: <<PLACEHOLDER: demo carrier email>>
Password: <<PLACEHOLDER: demo password>>
```
The account must stay active for the whole review, be a real working carrier login, and have at least one **assigned load** so the reviewer can open it. The backend (https://bestloaders.com) is publicly reachable, so no VPN/allowlisting is needed.

## Contact
```
First/Last name: <<PLACEHOLDER>>
Phone: <<PLACEHOLDER>>
Email: <<PLACEHOLDER>>
```

## Notes to the reviewer (paste as-is, then adjust)
```
ABOUT THE APP
Bestloaders FMS is a B2B tool for approved freight carriers (fleet owners / drivers).
After signing in, a carrier views available loads, bids on them, and once a load is
assigned, manages it through pickup, transit and delivery.

BACKGROUND LOCATION JUSTIFICATION (UIBackgroundModes: location)
Location, including background, is used ONLY while a load the driver has picked up is
actively in transit. It powers real-time shipment tracking shown to the broker and the
customer so they know the freight's live position and ETA. Tracking is not active before
pickup or after delivery. The user grants permission and the in-app usage strings
explain this.

PUSH NOTIFICATIONS
Used to alert a carrier the moment a load is offered near them (offers expire quickly).

CAMERA / PHOTOS
Used to capture proof-of-pickup and proof-of-delivery photos, delivery documents, and
onboarding documents (license, insurance).

HOW TO TEST
1. Sign in with the demo account above.
2. Open the list of available loads and place a bid.
3. Open an assigned load, tap "View full details" and "Track and update".
4. Tap "Start live tracking" (allow location), then change status to Picked Up with a
   proof photo. Optionally continue to Delivered to see the signature + POD flow.
```

## Export Compliance
Already handled — `app.json` sets `ITSAppUsesNonExemptEncryption: false`, so no encryption questionnaire appears.
