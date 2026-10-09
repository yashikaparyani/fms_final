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
> Location is shared only while a load you have picked up is in transit, and stops at
> delivery.
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

Location is collected ONLY while a load the driver has picked up is in transit. It starts
when the driver taps "Start live tracking" after pickup and stops automatically at
delivery. It is never collected before pickup, after delivery, or when the driver has no
active load.
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

Narrate that location is only shared while a picked-up load is in transit.

## 4. Also required
- Privacy policy must state background collection → ✅ https://bestloaders.com/privacy
- The foreground-service notification is already configured
  (`foregroundService: { notificationTitle: "FMSS live tracking", ... }`)
