# FMSS Fleet Mobile

React Native/Expo app for fleet owners.

## What is included

- Fleet-owner login using the existing `/api/auth/login` endpoint.
- Open bid list and bid submission.
- Assigned-load confirmation.
- Compulsory live GPS tracking from pickup through delivery.
- Foreground and background location task wiring for locked-screen tracking.
- Pickup proof capture, delivery signature, and document upload.

## Run locally

```bash
cd mobile
npm install
npm start
```

Set the backend URL when testing on a real phone:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:5001/api npm start
```

`localhost` points to the phone itself, so use your machine's LAN IP for device testing.

For production builds, configure native background-location review text and test on a real device. Background tracking is limited in Expo Go.
