/**
 * useLocationData.js
 * React hook for dynamic US location data fetched from backend master.
 * Caches results in module-level Maps to avoid repeat API calls.
 */
import { useState, useEffect } from "react";
import api from "../api";

// Module-level cache
const statesCache = { data: null, loading: false, callbacks: [] };
const citiesCache = new Map(); // stateAbbr -> { data, loading, callbacks }

/** Fetches all states once and caches them */
export function useStates() {
  const [states, setStates] = useState(statesCache.data || []);
  const [loading, setLoading] = useState(!statesCache.data);

  useEffect(() => {
    if (statesCache.data) {
      setStates(statesCache.data);
      setLoading(false);
      return;
    }
    if (statesCache.loading) {
      statesCache.callbacks.push((data) => { setStates(data); setLoading(false); });
      return;
    }
    statesCache.loading = true;
    api.get("/locations/states")
      .then((res) => {
        statesCache.data = res.data;
        statesCache.loading = false;
        setStates(res.data);
        setLoading(false);
        statesCache.callbacks.forEach((cb) => cb(res.data));
        statesCache.callbacks = [];
      })
      .catch(() => { setLoading(false); statesCache.loading = false; });
  }, []);

  // Convert to AppSelect options format
  const options = states.map(({ stateAbbr, stateName }) => ({
    value: stateAbbr,
    label: stateName,
  }));

  return { options, loading };
}

/** Fetches cities for a given state abbreviation, cached per state */
export function useCities(stateAbbr) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If no state is provided, we fetch ALL cities (cached under 'ALL')
    const fetchKey = stateAbbr || "ALL";
    const endpoint = stateAbbr ? `/locations/cities?state=${stateAbbr}` : `/locations/cities`;

    const cached = citiesCache.get(fetchKey);
    if (cached?.data) {
      setCities(cached.data);
      return;
    }
    if (cached?.loading) {
      cached.callbacks.push((data) => setCities(data));
      return;
    }

    const entry = { data: null, loading: true, callbacks: [] };
    citiesCache.set(fetchKey, entry);
    setLoading(true);

    api.get(endpoint)
      .then((res) => {
        entry.data = res.data;
        entry.loading = false;
        setCities(res.data);
        setLoading(false);
        entry.callbacks.forEach((cb) => cb(res.data));
        entry.callbacks = [];
      })
      .catch(() => { setLoading(false); entry.loading = false; });
  }, [stateAbbr]);

  // Convert to AppSelect options format
  // For 'ALL' cities, append the state to disambiguate. For a specific state, just the city name.
  const options = cities.map((c) => ({
    value: JSON.stringify({ city: c.city, state: c.stateAbbr, zip: c.zip }), // Store full object in value
    label: stateAbbr ? c.city : `${c.city}, ${c.stateAbbr}`
  }));

  /** Returns full city data by its JSON stringified value */
  const getCityData = (jsonValue) => {
    if (!jsonValue) return null;
    try {
      return JSON.parse(jsonValue);
    } catch {
      return null;
    }
  };

  return { options, loading, getCityData, rawCities: cities };
}
