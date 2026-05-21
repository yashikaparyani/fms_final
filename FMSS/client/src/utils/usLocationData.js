/**
 * DEPRECATED - Use the useLocationData hook instead.
 * This file kept only for backward-compat. All data is now served
 * dynamically from the backend via /api/locations.
 *
 * Import hook instead:
 *   import { useStates, useCities } from "../hooks/useLocationData";
 */
export { useStates, useCities } from "../hooks/useLocationData";
