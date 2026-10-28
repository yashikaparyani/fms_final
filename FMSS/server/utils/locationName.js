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

/**
 * A short code made from a location's name, so nobody has to invent one.
 *
 * Codes were typed by hand and came out meaning nothing ("LA" for Oakland).
 * Initials of each word for a longer name, the first three letters for a
 * single word; an abbreviation already in the name is kept whole.
 *
 *   "Oakland-Rail Operations" → "ORO"
 *   "Rail Operational - LA"   → "ROLA"
 *   "Oakland"                 → "OAK"
 *
 * Uniqueness is the caller's job — see uniqueLocationCode.
 */
const codeFromName = (name) => {
  const words = String(name || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (!words.length) return "LOC";
  if (words.length === 1) return words[0].slice(0, 3).padEnd(2, "X");

  const code = words
    .map((word) => (ABBREVIATIONS.has(word) ? word : word[0]))
    .join("")
    .slice(0, 5);

  return code.length >= 2 ? code : (words[0] + words[1]).slice(0, 3);
};

/**
 * The code for a new location, numbered when its natural code is taken:
 * a second "Oakland" becomes OAK2. `isTaken` is an async (code) => boolean.
 */
const uniqueLocationCode = async (name, isTaken) => {
  const base = codeFromName(name);
  if (!(await isTaken(base))) return base;

  for (let n = 2; n < 100; n += 1) {
    const suffix = String(n);
    const candidate = base.slice(0, 5 - suffix.length) + suffix;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free location code for ${name}.`);
};

module.exports = { normalizeLocationName, codeFromName, uniqueLocationCode };
