# Google Play Release Kit — Bestloaders FMS

Play Console account: **slinetransport26@gmail.com** (organization, verified →
**exempt** from the 12-testers/14-day closed-testing requirement, so production is
available directly).

## Assets in this folder
| File | Use | Spec | Status |
|---|---|---|---|
| `app-icon-512.png` | Store icon | 512×512, no alpha | ✅ |
| `feature-graphic.png` | Feature graphic | 1024×500, no alpha | ✅ |
| `screenshots/01-06*.png` | Phone screenshots | 1080×1920, no alpha | ✅ 6 (min 2, max 8) |
| `listing.md` | Name, short + full description, declarations | — | ✅ |
| `data-safety.md` | Data safety form | — | ⚠️ confirm the "Shared" call |
| `background-location-declaration.md` | Sensitive-permission form + video script | — | ⚠️ video still to record |

> Screenshots are 1080×1920 (16:9). The iOS set in `../screenshots/` is 1320×2868
> (2.17:1) which **exceeds Play's 2:1 max aspect ratio** — do not reuse it here.

## Order of work
1. **Create app** — name `Bestloaders FMS`, package `com.bestloaders.fmssfleet`, App, Free.
2. **Store listing** — copy from `listing.md`, upload icon + feature graphic + screenshots.
3. **App content**:
   - Privacy policy → `https://bestloaders.com/privacy`
   - Ads → No · In-app purchases → No · Financial features → No
   - **App access** → Restricted; add the demo carrier login (it has live loads)
   - Content rating questionnaire → expect Everyone
   - Target audience → 18+
   - **Data safety** → `data-safety.md`
   - **Sensitive permissions** → background location → `background-location-declaration.md` + video
4. **Production release** — upload the AAB, add release notes, roll out.

## Build
```
cd FMSS/mobile
eas build --platform android --profile production      # AAB, versionCode auto-increments
```
`eas submit --platform android` needs a Google Play **service account JSON**
(Play Console → Setup → API access → link a Google Cloud project → create a service
account with "Release manager", download the JSON, then add `serviceAccountKeyPath`
under `submit.production.android` in `eas.json`). Until then, upload the AAB by hand.

## ⚠️ Signing — read once
EAS generated a **new Android keystore** for this project (first Android build here).
Keep it: `eas credentials -p android` can back it up. Enable **Play App Signing** when
you upload the first AAB so Google holds the app signing key — then the EAS keystore is
only an *upload* key and losing it is recoverable.

Note Yashika's own EAS project has a **different** keystore from her client-test APKs.
Do not mix them: once Play has accepted one upload key, uploads signed with the other
are rejected.
