// ─── One way of writing a location name ───────────────────────────────────────
// Locations were typed by hand in whatever style the person felt like —
// "Head Office", "OAKLAND-RAIL OPERATIONS", "long beach port work" — and every
// picker, header and invoice letterhead showed them side by side looking like
// three different systems. Names are now stored in Title Case whatever was
// typed, so the list reads as one thing.
//
// Abbreviations stay in capitals: "LA" and "NY" are what people call those
// places, and "La" or "Ny" would read as a mistake. Two-letter state codes that
// are also ordinary words (IN, OR, ME, OK, HI) are left out, or "Rail Yard In
// Oakland" would come out with a shouted "IN".
// ─────────────────────────────────────────────────────────────────────────────

const STATE_CODES =
  "AL AK AZ AR CA CO CT DC DE FL GA IA ID IL KS KY LA MA MD MI MN MO MS MT NC ND NE NH NJ NM NV NY OH PA RI SC SD TN TX UT VA VT WA WI WV WY";

const ABBREVIATIONS = new Set([
  ...STATE_CODES.split(" "),
  "USA",
  "US",
  "NYC",
  "SF",
  "LAX",
  "OAK",
  "HQ",
]);

// Lower case unless they open the name: "Port of Oakland", not "Port Of Oakland".
const SMALL_WORDS = new Set(["of", "and", "the", "at", "in", "on", "for", "to", "a", "an"]);

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

const formatWord = (word, isFirst) => {
  if (ABBREVIATIONS.has(word.toUpperCase())) return word.toUpperCase();
  if (!isFirst && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
  return capitalise(word);
};

/**
 * "RAIL OPERATIONAL -LA"   → "Rail Operational - LA"
 * "OAKLAND-RAIL OPERATIONS" → "Oakland-Rail Operations"
 * "long beach port work"    → "Long Beach Port Work"
 */
const normalizeLocationName = (value) => {
  if (typeof value !== "string") return value;

  const tidy = value
    .trim()
    .replace(/\s+/g, " ")
    // A dash with a space on either side is a separator: give it both. A dash
    // with none ("Oakland-Rail") is a hyphen and stays tight.
    .replace(/\s+-\s*|\s*-\s+/g, " - ");

  let first = true;
  return tidy.replace(/[A-Za-z0-9']+/g, (word) => {
    const out = formatWord(word, first);
    first = false;
    return out;
  });
};

module.exports = { normalizeLocationName };
