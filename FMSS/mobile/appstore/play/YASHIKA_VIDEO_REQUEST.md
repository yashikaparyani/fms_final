Hi Yashika, please install the corrected Bestloaders FMS Android build 1.0.0 (6) and record a fresh Google Play background-location demo.

APK: https://expo.dev/artifacts/eas/jrjVAkvf3dnZy9_tqcyKypYaT4WGB7_mSeEvos9kQhw.apk

The previous video shows “foreground service permissions were not found in the manifest” around 51 seconds. The missing permissions are fixed in this build; please verify tracking works on the device before recording. If Android refuses the update because your older APK has a different signing key, uninstall that test app, then install this APK (local app data will be cleared).

Please show this sequence clearly:
1. Sign in, open an assigned load ready for pickup and tap Start live tracking.
2. Show the in-app background-location disclosure and tap Continue.
3. Show Android's permission flow, including Allow all the time. If permissions were already granted, reset them first so the recording shows the full flow.
4. Show the FMSS live tracking notification, with no error popup.
5. Background the app or lock the phone briefly, then demonstrate that shipment location updates continue (use the tracking view on another device if available).
6. Complete delivery OR sign out, and show that tracking/the notification stops. Use a test load if demonstrating delivery.

Keep it concise and avoid exposing passwords or unrelated private information in the recording. Export a browser-playable MP4 (H.264), upload to Drive with Anyone with the link viewing or unlisted YouTube, and send the new URL. The old video cannot be used for the permission review.
