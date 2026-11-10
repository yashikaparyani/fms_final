/**
 * True when the "Available at locations" picker is showing and nothing is
 * ticked — forms use it to stop a save the server would refuse anyway. An
 * undefined value means the picker is hidden (single-location user), which is
 * fine: the server files the record under the active location.
 */
export const noLocationPicked = (value) => Array.isArray(value) && value.length === 0;
