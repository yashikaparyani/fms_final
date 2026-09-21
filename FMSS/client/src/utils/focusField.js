/**
 * Scroll to a form field by key and put the cursor in it.
 *
 * Fields are found by the `f-<key>` id FieldRenderer (and the onboarding
 * signing panel) gives them. Used instead of a popup when a submit is stopped:
 * the carrier lands on the empty field rather than reading a list of labels.
 */
export const focusField = (key) => {
  const el = document.getElementById(`f-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // After the scroll starts, so the browser does not jump straight there.
  setTimeout(() => el.focus({ preventScroll: true }), 350);
};
