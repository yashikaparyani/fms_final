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
| Personal info → **Name** | Yes | See ¹ | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | See ¹ | No | Required | App functionality, Account management |
| Personal info → **Phone number** | Yes | See ¹ | No | Required | App functionality, Account management |
| Personal info → **Address** | Yes | See ¹ | No | Optional | App functionality (carrier business address) |
| Location → **Precise location** | Yes | See ¹ | No | Required | App functionality |
| Photos and videos → **Photos** | Yes | See ¹ | No | Optional | App functionality (pickup/delivery proof) |
| Files and docs → **Files and docs** | Yes | See ¹ | No | Optional | App functionality (licence, insurance, POD) |
| App info and performance → **Crash logs** | No | – | – | – | – |
| Device or other IDs → **Device or other IDs** | Yes | No | No | Optional | App functionality (push notification token) |

**Do NOT tick**: Financial info, Health, Messages, Contacts, Calendar, Search history,
Installed apps, Web browsing, or anything under *Advertising or marketing*.

## ¹ The "Shared" decision — confirm this one
Google defines **Shared** as transferring data to a *third party*. In this app the
broker is the app operator (collection, not sharing), **but a load's customer/shipper
is a separate company and can see that load's live tracking and POD**.

- The conservative, defensible answer is to mark **Location, Name, Photos and Files as
  "Shared"**, purpose **App functionality**, with the recipient being the customer whose
  freight is being moved.
- Marking them "collected only" is arguably defensible if you treat the customer as a
  user of your own platform rather than a third party.

Misdeclaring here is a policy violation, so pick deliberately. **I recommend declaring
them Shared** — it matches what the privacy policy already says ("Load and tracking
information is shared with the parties to that shipment").

## Security practices
- ✅ Data is encrypted in transit
- ✅ Users can request data deletion (in-app Delete account → `POST /auth/delete-account`)
- Independent security review: No
