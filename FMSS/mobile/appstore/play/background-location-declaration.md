# Google Play — Background location permission declaration

`ACCESS_BACKGROUND_LOCATION` is a **sensitive permission**. Play Console requires a
declaration form *and* a demo video. This is the most common rejection for driver apps,
so it is worth getting right first time.

## 1. In-app prominent disclosure — ✅ implemented
Shown **before** the system permission prompt, requiring an affirmative tap
(`confirmBackgroundLocationDisclosure` in `mobile/App.js`):

> **Share your location in the background?**
> FMSS Fleet collects location data to show the office and the customer where this load
> is, and to record where it was picked up and delivered — even when the app is closed
> or not in use.
>
> Location sharing starts when you tap Start live tracking for an assigned load that
> is ready for pickup, continues during transport, and stops when you complete delivery
> or sign out.
>
> [ Not now ]   [ Continue ]

"Not now" leaves the system prompt unasked and foreground tracking still working.

## 2. Declaration form answers

**Which feature requires background location?**
```
Live shipment tracking during freight transport.
```

**Why does the feature need background location (and not foreground-only)?**
```
Bestloaders FMS is used by truck drivers hauling freight. While a load is in transit the
app must report the truck's position so the broker and the customer can see where the
freight is and estimate arrival. A driver is actively driving for hours at a time and
cannot keep the app in the foreground — the phone is mounted, locked, or being used for
navigation. Foreground-only location would produce a tracking record with multi-hour gaps,
which defeats the feature and breaks the delivery record we are contractually required to
keep.

Location starts when the driver taps "Start live tracking" for an assigned load that
is ready for pickup. It continues during pickup and transport, and stops when the
driver completes delivery or signs out in the app. It is not enabled for loads
that are not assigned to the signed-in carrier or driver.
```

**Is there a less intrusive alternative?**
```
No. Periodic manual check-ins were considered but leave gaps of hours and depend on the
driver stopping to use the phone while working. Continuous background location while a
load is in transit is the minimum that satisfies the use case.
```

**User-facing benefit**
```
Drivers stop fielding "where is my load?" calls, and the office and customer get an
accurate ETA. The same trail records where the freight was picked up and delivered,
which backs the proof-of-delivery record the carrier is paid against.
```

## 3. The demo video (required)
Google wants a short, unlisted YouTube (or Drive) link showing the feature **and** the
disclosure. Suggested script (~60–90 s):

1. Launch the app and sign in as a carrier.
2. Open an assigned load and tap **Track and update**.
3. Tap **Start live tracking** → **show the prominent disclosure dialog on screen, and
   read it aloud or leave it visible for several seconds**.
4. Tap **Continue** → show the Android system location prompt → choose **Allow all the time**.
5. Show the "Sharing your location with the office" state and the live coordinates updating.
6. Background the app (home button) and show the persistent tracking notification.
7. Change status to **Delivered** and show that tracking stops.

Narrate that tracking starts for an assigned load ready for pickup and continues
through transport until delivery or sign-out.

## 4. Also required
- Privacy policy must state background collection → ✅ https://bestloaders.com/privacy
- The foreground-service notification is already configured
  (`foregroundService: { notificationTitle: "FMSS live tracking", ... }`)

## Supplied video — 12 October 2026

https://drive.google.com/file/d/1WX0pkj7mZ-MgJCQjLjpoFrmUAluJ5DZy/view

Drive shows anyone with the link can view. The MP4 is HEVC, 1080×2406, about
183 seconds. Local inspection confirms the disclosure and Android permission
flow are shown. However, at approximately 51 seconds it displays:

> Couldn’t start the foreground service. Foreground service permissions were not found in the manifest.

The recording therefore demonstrates the old background-tracking failure. It
should be replaced using corrected build 1.0.0 (6). Show the foreground-service
notification, background the app and demonstrate continued updates, then
complete delivery and show that tracking stops. The old link has been removed
from reviewer instructions; it has not been submitted as the permission video.
