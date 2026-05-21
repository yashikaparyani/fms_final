import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

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

const MapPicker = ({ onLocationSelect, height = 300 }) => {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const markerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapRef.current) return;

        if (!instanceRef.current) {
          // Default center (USA)
          instanceRef.current = L.map(mapRef.current).setView([39.8283, -98.5795], 4);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
          }).addTo(instanceRef.current);

          // Attempt geolocation - DISABLED to prevent snapping to developer's physical location (India)
          // instanceRef.current.locate({ setView: true, maxZoom: 14 });

          instanceRef.current.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            
            if (markerRef.current) {
              markerRef.current.setLatLng(e.latlng);
            } else {
              markerRef.current = L.marker(e.latlng).addTo(instanceRef.current);
            }

            try {
              setIsLoading(true);
              let data = null;
              
              // Try exact street (18), then suburb/town (14), then city/county (10)
              const zoomLevels = [18, 14, 10];
              
              for (const zoom of zoomLevels) {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&accept-language=en-US&email=contact@fms-system.com`);
                const result = await response.json();
                
                if (result && result.address) {
                  data = result;
                  break; // Found a valid location!
                }
              }
              
              if (data && data.address) {
                const stateMap = {
                  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
                  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
                  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
                  "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
                  "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO",
                  "montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
                  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH",
                  "oklahoma":"OK","oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC",
                  "south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT",
                  "virginia":"VA","washington":"WA","west virginia":"WV","wisconsin":"WI","wyoming":"WY",
                  "district of columbia":"DC","puerto rico":"PR"
                };

                const iso = data.address["ISO3166-2-lvl4"] || data.address["ISO3166-2-lvl6"];
                let stateAbbr = data.address.state || "";
                
                if (iso && iso.includes("-")) {
                  stateAbbr = iso.split("-")[1];
                } else if (stateAbbr && stateMap[stateAbbr.toLowerCase()]) {
                  stateAbbr = stateMap[stateAbbr.toLowerCase()];
                }

                const address = {
                  street: [data.address.house_number, data.address.road].filter(Boolean).join(" ") || data.address.neighbourhood || "",
                  city: data.address.city || data.address.town || data.address.village || data.address.municipality || data.address.borough || data.address.suburb || data.address.hamlet || data.address.county || "",
                  state: stateAbbr,
                  zip: data.address.postcode || "",
                  lat: lat,
                  lng: lng
                };
                onLocationSelect(address);
                toast.success("Location captured!");
              } else {
                toast.error("Could not get address details for this location.");
              }
            } catch (err) {
              console.error(err);
              toast.error("Failed to fetch address details.");
            } finally {
              setIsLoading(false);
            }
          });
        }
        setTimeout(() => {
          if (instanceRef.current) {
            instanceRef.current.invalidateSize();
          }
        }, 100);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [onLocationSelect]);

  if (failed) {
    return (
      <div className="flex items-center justify-center bg-gray-50 text-gray-500 rounded-lg border border-gray-200" style={{ height }}>
        Map could not be loaded.
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-gray-200">
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 z-[1000] flex items-center justify-center">
          <span className="font-semibold text-indigo-600">Fetching address...</span>
        </div>
      )}
      <div ref={mapRef} style={{ height, width: "100%" }} />
      <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow text-xs font-semibold z-[400] pointer-events-none">
        Click on the map to drop a pin
      </div>
    </div>
  );
};

export default MapPicker;
