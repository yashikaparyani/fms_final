# App Store Release Assets — Bestloaders FMS

Everything you need to submit the iOS app, generated for App Store Connect app
**Apple ID 6785472723**, bundle **com.bestloaders.fmssfleet**.

## ✅ Fill these placeholders first (search for `<<PLACEHOLDER`)
- [x] ~~**Support URL**~~ — **LIVE: https://bestloaders.com/support**
- [x] ~~**Privacy Policy URL**~~ — **LIVE: https://bestloaders.com/privacy**
- [x] ~~**Demo carrier account**~~ — `demo.fleetowner@bestloaders.com`, seeded 2026-09-30 with
      LD 0015 (IN_TRANSIT), LD 0016 (READY_TO_PICKUP), LD 0017 (DELIVERED + POD)
- [ ] ⚠️ **Create the `support@bestloaders.com` mailbox** — the live pages point at it
- [ ] **Legal entity name** — the pages currently say "S Line Transport"; confirm the
      registered entity (e.g. S Line Brokerage Inc.) for the copyright + privacy policy
- [ ] **Reviewer contact** name / phone / email (in `review-notes.md`)
- [ ] **Demo account password** to paste into App Review Information

> Note: the hosted pages are React routes (`client/src/pages/legal/`), not the
> `privacy-policy.html` / `support.html` drafts in this folder — those remain as
> standalone copies if you ever want to host them elsewhere.

## Files
| File | What it is | Where it goes |
|---|---|---|
| `metadata.md` | Name, subtitle, description, keywords, category, copyright | App Store Connect → App Information + the version page |
| `privacy-policy.html` | Hostable privacy policy | Host it, put the URL in App Information → Privacy Policy URL |
| `support.html` | Hostable support page | Host it, put the URL in the version → Support URL |
| `app-privacy.md` | App Privacy questionnaire answers | App Store Connect → App Privacy |
| `review-notes.md` | Reviewer notes + demo account | Version → App Review Information |
| `screenshots/captions.md` | Screenshot list + caption copy | reference |
| `screenshots/template.html` | 1320×2868 frame template + export command | to render screenshots |

## Screenshots (6.9", 1320×2868 PNG, no alpha) — the one manual step
**Best (real screens):** boot the 6.9" simulator, run the app, log in, capture:
```
xcrun simctl boot "iPhone 16 Pro Max"
cd FMSS/mobile && npx expo run:ios --device "iPhone 16 Pro Max"   # needs CocoaPods working
# sign in with the demo account, navigate to each screen, then:
xcrun simctl io booted screenshot appstore/screenshots/shot-1.png   # repeat per screen
```
These come out at exactly 1320×2868. Capture the 5 screens in `captions.md`.

**Fallback (framed mockups):** open/export `screenshots/template.html` (it has a Puppeteer
one-liner that writes `shot-1.png`…`shot-5.png` at 1320×2868). Replace the placeholder slots
with real captures when you can — Apple prefers actual app screens.

## Order of operations in App Store Connect
1. Fill App Information (name, subtitle, category, privacy policy URL).
2. Create the version → paste description/keywords/promo, add support URL, upload screenshots, pick the build (see note below).
3. Complete **App Privacy** (`app-privacy.md`), **Age rating** (4+), **Pricing** (Free) + Availability.
4. Fill **App Review Information** (`review-notes.md`) with the demo account.
5. Export compliance is auto-cleared (`ITSAppUsesNonExemptEncryption: false`).
6. Submit for review.

## App icon
1024×1024, no alpha — already compliant at `FMSS/mobile/assets/icon.png`. It's pulled from the build; nothing to upload separately.

## Version / build
Marketing version is currently `0.1.1`. For a public launch, consider bumping to `1.0.0`
(reads as a real release, not a beta) — that needs a new build with the version bumped.
Latest TestFlight build is **#13** (includes the load-detail crash fix).

## ⚠️ RELEASE BLOCKER — in-app account deletion (code change, not an asset)
The app supports **self-registration** (carrier sign-up from the sign-in screen), so Apple
**Guideline 5.1.1(v)** requires an in-app way to **delete your account**. I checked the code
(`FMSS/mobile/App.js`, `src/`) and found **no delete-account flow** — Apple will reject without it.

To add it (dev task): put a "Delete account" action in the profile/settings area that calls a
backend endpoint to delete the carrier's account + personal data (or opens a confirmation and
submits the request), then signs the user out. It can require confirmation, but it must be
initiated inside the app. Once added, it also satisfies the deletion promise in the privacy policy.
