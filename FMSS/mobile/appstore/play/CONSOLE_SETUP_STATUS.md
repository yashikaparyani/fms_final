# Google Play setup status — 12 October 2026

## App

- Name: Bestloaders FMS
- Package: com.bestloaders.fmssfleet
- Default language: English (United States)
- Type: App; pricing: Free
- Developer account: Neetesh Kuchya organization
- Developer account ID: 5759682789419001427
- Play Console app ID: 4974934056111934130
- Dashboard: https://play.google.com/console/u/0/developers/5759682789419001427/app/4974934056111934130/app-dashboard

## Saved in Play Console

- Default listing, icon, feature graphic and six screenshots.
- No AI visual labels, explicitly confirmed by the user.
- Category: Business; tags: Business, Productivity.
- Public support email: ravi@slinetransport.com.
- Website: https://bestloaders.com.
- Privacy policy/account-deletion URL: https://bestloaders.com/privacy.
- Restricted sign-in with user-supplied demo carrier credentials. Password is
  stored only in Play Console, not in this repository.
- Optional Google partner-device testing disabled.
- Target audience: 18 and over.
- Data safety: completed and saved; see data-safety.md for exact selections.
- No ads, government, financial-service or health features.
- No Advertising ID use; permission is absent from the compiled AAB.
- Production draft named 1.0.0 (6), with English release notes and accepted AAB.

## Corrected Android build

- EAS build ID: 3adaba12-5fdb-4d59-a4f4-1dd9f6aeee27.
- Build: https://expo.dev/accounts/bestloaders/projects/bestloaders-fms/builds/3adaba12-5fdb-4d59-a4f4-1dd9f6aeee27
- AAB: https://expo.dev/artifacts/eas/WAlLM-f01d3E6OHRNoUqSqexwCFxkvYCE-gXYhiT6vw.aab
- Version: 1.0.0; versionCode: 6; target SDK: 36.
- Keystore: existing EAS configuration KnUGAm0vIq.
- Expo location plugin now enables Android background location and foreground
  service permissions explicitly.
- Generated config and downloaded AAB checked for ACCESS_BACKGROUND_LOCATION,
  FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION and package ID.
- ZIP integrity verified; mobile source compiles through the Expo Babel preset.
- App disclosure and iOS usage strings corrected to match ready-for-pickup
  tracking timing. Background sharing stops when delivery is completed or the
  user signs out in the app.
- Companion APK build ID: b386604f-bcea-4f5b-b7a9-e56e1fce8b67.
  https://expo.dev/accounts/bestloaders/projects/bestloaders-fms/builds/b386604f-bcea-4f5b-b7a9-e56e1fce8b67
  Finished successfully with versionCode 6. Its profile uses autoIncrement:false.
- Installable APK: https://expo.dev/artifacts/eas/jrjVAkvf3dnZy9_tqcyKypYaT4WGB7_mSeEvos9kQhw.apk
  Install this corrected build to record the replacement demonstration. APK ZIP
  integrity, package ID and all three background/foreground-service permissions
  were verified in the compiled manifest.

## Live legal pages

Privacy and support source updated and deployed on 12 October 2026. Live browser
readback verified the support email, EIN/SSN, account IDs, freight bid information,
signature/notes and actual tracking timing. Client production build passed.
The server web index rollback copy is /tmp/fmss-before-play-legal-20261012.html;
old web assets were preserved. Backend services were not restarted.

All initial app setup declarations are saved. The dashboard now shows the
release/test tasks instead of the initial setup checklist. Content ratings saved:
ESRB Everyone, PEGI 3, USK 16+, IARC 3+; interactive elements Users Interact
and Shares Location. The separate target audience remains 18 and over.

## Pending / blockers

- IARC Terms accepted by the user on 12 October 2026; questionnaire completed
  and final ratings saved. Online freight listings, user content sharing and
  precise location sharing declared. No adult/violent/substance content, digital
  purchases or reward features declared.
- Background-location and foreground-service permission explanations prepared.
  Both require a replacement video link showing working background tracking.
- Supplied video:
  https://drive.google.com/file/d/1WX0pkj7mZ-MgJCQjLjpoFrmUAluJ5DZy/view
  Anyone with the link can view. It is a valid HEVC MP4, about 183 seconds.
  It shows the disclosure and Android permission flow, but at about 51 seconds
  displays the old error: foreground service permissions were not found in
  the manifest. It was excluded from reviewer instructions and not submitted
  as the location-permission video. Use corrected build 6 to record again.
- Initial availability saved: United States (the stated default for the US
  freight service; broader preference was not supplied).
- No production review submission or rollout has been performed.
- Demo login and read-only assigned-load/onboarding endpoints verified; three
  assigned loads are accessible (IN_TRANSIT / DELIVERED).
- Release-source commit e330384 pushed to the existing project branch and
  fast-forwarded on the server without changing its pre-existing deploy-script
  edits or backup files.

Saved metadata awaits review. A release draft and accepted bundle do not mean
that the app is published or that on-device background tracking is verified.

## Replacement video handoff

Recording instructions for Yashika are in YASHIKA_VIDEO_REQUEST.md. Use the
corrected installable APK, not the AAB or the earlier client-test APK.

## Replacement video checklist

Use the corrected APK above. Show the in-app location disclosure, Android
permission choice, working FMSS tracking notification, location updates while
the app is backgrounded/phone locked, then delivery or sign-out stopping
tracking. Avoid presenting the old error recording as proof of background
functionality. A browser-compatible MP4 or unlisted YouTube link is easier
for reviewers to play than the supplied HEVC file.
