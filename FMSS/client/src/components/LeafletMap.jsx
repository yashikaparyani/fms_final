import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let leafletPromise;

const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return leafletPromise;
};

const createBadgeIcon = (L, { text, background, border, textColor = "#fff", size = 34 }) =>
  L.divIcon({
    className: "fmss-map-badge-icon",
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${background};
        border:2px solid ${border};
        box-shadow:0 10px 20px rgba(15,23,42,0.18);
        display:flex;
        align-items:center;
        justify-content:center;
        color:${textColor};
        font:700 12px/1 Arial, sans-serif;
      ">${text}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });

const createTruckIcon = (L) =>
  L.divIcon({
    className: "fmss-map-truck-icon",
    html: `
      <div style="
        width:44px;
        height:44px;
        border-radius:9999px;
        background:linear-gradient(135deg, #2563eb, #1d4ed8);
        border:2px solid #dbeafe;
        box-shadow:0 12px 22px rgba(37,99,235,0.35);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3 7.5h10.2v7.2H3V7.5Z" fill="#fff" fill-opacity="0.95" />
          <path d="M13.2 9.3h3.9l2.4 2.4V14h-6.3V9.3Z" fill="#fff" fill-opacity="0.95" />
          <path d="M7 19a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 7 19Zm10.1 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" fill="#fff" />
          <path d="M3 15.3h16.8" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });

const createRoutePinIcon = (L, { background, border, text, size = 34 }) =>
  L.divIcon({
    className: "fmss-map-route-icon",
    html: `
      <div style="position:relative;width:${size}px;height:${size + 8}px;display:flex;align-items:flex-start;justify-content:center;">
        <div style="
          width:${size}px;
          height:${size}px;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:${background};
          border:2px solid ${border};
          box-shadow:0 10px 20px rgba(15,23,42,0.18);
          position:absolute;
          top:0;
          left:0;
        "></div>
        <div style="
          position:relative;
          z-index:1;
          width:${size}px;
          height:${size}px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#fff;
          font:700 12px/1 Arial, sans-serif;
          text-transform:uppercase;
        ">${text}</div>
      </div>
    `,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 4],
    popupAnchor: [0, -(size + 2)],
  });

const LeafletMap = ({ points = [], height = 280 }) => {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapRef.current) return;

        const validPoints = points.filter(
          (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
        );
        const center = validPoints[0] || { latitude: 39.5, longitude: -98.35 };
        const routePoints = validPoints.filter((point) => point.role !== "live");
        const polylinePoints = (routePoints.length >= 2 ? routePoints : validPoints)
          .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
          .map((point) => [point.latitude, point.longitude]);

        if (!instanceRef.current) {
          instanceRef.current = L.map(mapRef.current, {
            zoomControl: true,
            scrollWheelZoom: false,
          }).setView([center.latitude, center.longitude], validPoints.length ? 10 : 4);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
          }).addTo(instanceRef.current);
        }

        const map = instanceRef.current;
        map.eachLayer((layer) => {
          if (layer.options?.pane === "markerPane" || layer instanceof L.Polyline) {
            map.removeLayer(layer);
          }
        });

        validPoints.forEach((point, index) => {
          let icon;
          if (point.role === "live") {
            icon = createTruckIcon(L);
          } else if (point.role === "origin") {
            icon = createRoutePinIcon(L, {
              text: "O",
              background: "#16a34a",
              border: "#dcfce7",
            });
          } else if (point.role === "destination") {
            icon = createRoutePinIcon(L, {
              text: "D",
              background: "#dc2626",
              border: "#fee2e2",
            });
          } else {
            icon = createBadgeIcon(L, {
              text: point.label?.[0] || String(index + 1),
              background: "#334155",
              border: "#cbd5e1",
              size: 30,
            });
          }

          L.marker([point.latitude, point.longitude], { icon })
            .addTo(map)
            .bindPopup(
              `<strong>${point.label || "Status update"}</strong><br/>${point.note || ""}`,
            );
        });

        if (polylinePoints.length > 1) {
          L.polyline(polylinePoints, { color: "#2563eb", weight: 5, opacity: 0.9 }).addTo(map);
          map.fitBounds(polylinePoints, { padding: [28, 28] });
        } else if (polylinePoints.length === 1) {
          map.setView(polylinePoints[0], 12);
        }

        setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [points]);

  if (failed) {
    return (
      <div style={{ height, display: "grid", placeItems: "center", background: "#f9fafb", color: "#6b7280" }}>
        Map could not be loaded.
      </div>
    );
  }

  return <div ref={mapRef} style={{ height, width: "100%", borderRadius: 8 }} />;
};

export default LeafletMap;
