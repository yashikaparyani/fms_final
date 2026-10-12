# Google Play Data safety — saved 12 October 2026

These answers are saved in Play Console for Bestloaders FMS. Changes await review.
The declaration must stay consistent with https://bestloaders.com/privacy and all
versions distributed on Play. No analytics, advertising, or cross-app tracking is used.

## Account and security

- Collects or shares required user-data types: Yes.
- Encrypted in transit: Yes (HTTPS).
- Account creation: Username and password; carrier sign-up is approved by the office.
- Account-deletion resource: https://bestloaders.com/privacy.
- Optional separate data-deletion answer: left unanswered.

## Saved data types

All listed data is collected and retained (not processed ephemerally).
Shared data is used for App functionality by shipment parties. Shared does not
mean advertising tracking. Google has sharing exemptions; this declaration
conservatively includes shipment-party transfers.

| Data type | Shared | Required / optional | Collection purposes |
|---|---|---|---|
| Name | Yes | Required | App functionality, Account management |
| Email address | No | Required | App functionality, Account management |
| User IDs | No | Required | App functionality, Account management |
| Address | No | Optional | App functionality, Account management |
| Phone number | No | Required | App functionality, Account management |
| Other personal info (EIN/SSN) | No | Required | App functionality, Account management, Fraud prevention/security/compliance |
| Other financial info (freight bids/rates) | No | Optional | App functionality |
| Approximate location | Yes | Optional | App functionality |
| Precise location | Yes | Optional | App functionality |
| Photos | Yes | Optional | App functionality |
| Files and docs | Yes | Optional | App functionality |
| Other user-generated content (signatures/notes) | Yes | Optional | App functionality |
| Device or other IDs (push token) | No | Optional | App functionality |

Location is optional for general app use; pickup and tracking features require it.
Approximate permission grants are accepted by the current app. Onboarding collects
tax identifiers, and bids submitted from the phone carry financial amounts.
The earlier blanket instruction to exclude all financial information was removed.

No independent security-review or UPI badge was claimed. No health, advertising,
contacts, calendar, audio, browsing, or analytics data was selected.

## Release checks

- Public support email: ravi@slinetransport.com.
- Local privacy/support source updated to this email, the collected data above,
  and actual tracking timing. Deployed and verified on 12 October 2026.
- Background-location demo link supplied by user:
  https://drive.google.com/file/d/1WX0pkj7mZ-MgJCQjLjpoFrmUAluJ5DZy/view
  Drive confirms anyone with the link can view. Local inspection shows the old
  missing-foreground-service-permissions failure at about 51 seconds. Record
  the demonstration again on corrected build 1.0.0 (6) before submission.
