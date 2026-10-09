# Google Play — Data safety form

Must match https://bestloaders.com/privacy. The app has **no third-party analytics,
advertising or tracking SDKs** (only Expo, axios to our own API, expo-location,
expo-image-picker / document-picker, expo-notifications).

## Overview answers
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — in-app "Delete account", plus email request |

## Data types to declare
| Data type | Collected | Shared¹ | Processed ephemerally | Required | Purpose |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | **Yes** | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Phone number** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Address** | Yes | No | No | Optional | App functionality (carrier business address) |
| Location → **Precise location** | Yes | **Yes** | No | Required | App functionality |
| Photos and videos → **Photos** | Yes | **Yes** | No | Optional | App functionality (pickup/delivery proof) |
| Files and docs → **Files and docs** | Yes | **Yes** | No | Optional | App functionality (licence, insurance, POD) |
| App info and performance → **Crash logs** | No | – | – | – | – |
| Device or other IDs → **Device or other IDs** | Yes | No | No | Optional | App functionality (push notification token) |

**Do NOT tick**: Financial info, Health, Messages, Contacts, Calendar, Search history,
Installed apps, Web browsing, or anything under *Advertising or marketing*.

## ¹ The "Shared" decision — ✅ CONFIRMED: declare as Shared
Google defines **Shared** as transferring data to a *third party*. The broker is the app
operator, but **a load's customer/shipper is a separate company and can see that load's
live tracking and POD** — so that transfer is sharing.

**Tick "Shared" for:**

| Data type | Shared with | Purpose |
|---|---|---|
| Personal info → Name | the customer/shipper on that load | App functionality |
| Location → Precise location | the customer/shipper on that load | App functionality |
| Photos and videos → Photos | the customer/shipper on that load | App functionality |
| Files and docs | the customer/shipper on that load | App functionality |

**Leave "Shared" unticked for:** Email address, Phone number, Address, Device ID — these
stay with the operator and are not shown to the customer.

This matches the privacy policy, which already states: *"Load and tracking information is
shared with the parties to that shipment — the broker and the customer whose freight you
are moving."*

## Security practices
- ✅ Data is encrypted in transit
- ✅ Users can request data deletion (in-app Delete account → `POST /auth/delete-account`)
- Independent security review: No
