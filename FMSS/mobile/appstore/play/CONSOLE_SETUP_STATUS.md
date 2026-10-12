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
- Companion production-apk build requested for direct device installation.
  Its profile now uses autoIncrement:false to keep the same remote versionCode.

## Live legal pages

Privacy and support source updated and deployed on 12 October 2026. Live browser
readback verified the support email, EIN/SSN, account IDs, freight bid information,
signature/notes and actual tracking timing. Client production build passed.
The server web index rollback copy is /tmp/fmss-before-play-legal-20261012.html;
old web assets were preserved. Backend services were not restarted.

## Pending / blockers

- Content-rating category/contact prepared. Accepting the separate IARC Terms
  of Use requires user confirmation; question is pending in this chat.
- Background-location and foreground-service permission explanations prepared.
  Both require a replacement video link showing working background tracking.
- Supplied video:
  https://drive.google.com/file/d/1WX0pkj7mZ-MgJCQjLjpoFrmUAluJ5DZy/view
  Anyone with the link can view. It is a valid HEVC MP4, about 183 seconds.
  It shows the disclosure and Android permission flow, but at about 51 seconds
  displays the old error: foreground service permissions were not found in
  the manifest. It was excluded from reviewer instructions and not submitted
  as the location-permission video. Use corrected build 6 to record again.
- Initial release-country preference asked; United States is the stated default
  for this US freight service if the user does not choose broader availability.
- No production review submission or rollout has been performed.

Saved metadata awaits review. A release draft and accepted bundle do not mean
that the app is published or that on-device background tracking is verified.
