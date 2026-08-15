// ─── Where each answer goes on the printed agreement ──────────────────────────
// The carrier signs the counterparty's own fifteen-page document, so what they
// download is that document with its blanks filled — not a summary of it. This
// file is the map from a value to the spot on the page it belongs in.
//
// Coordinates are PDF user space: origin bottom-left, points (72 = 1 inch). Each
// one was measured from the pinned files in assets/agreements/ by reading the
// text items off the page and finding where the run of underscores actually
// begins — NOT by eye. Where a whole line is a single text item, the start of
// the blank is derived from the item's width divided by its character count.
// `x` is the left edge of the blank and `y` is the baseline of the printed rule;
// values are drawn `LIFT` above it so they sit on the line rather than through
// it, and `max` is the blank's width so a long value shrinks instead of running
// across the printed words that follow it.
//
// IMPORTANT: these numbers belong to the exact PDFs in assets/agreements/. That
// is why those files are pinned in the repo rather than read from wherever the
// original was downloaded to — if the counterparty issues a new revision, the
// file AND this map have to be re-measured together.
// ─────────────────────────────────────────────────────────────────────────────

// How far above the underscore rule the value sits.
const LIFT = 3;

const SIZE = 10;

/**
 * A field placement.
 *   page   1-based page number
 *   x, y   left edge / baseline of the blank, in points
 *   value  picks the string out of the assembled context
 *   size   optional font size override
 *   max    the blank's width in points
 */
const BROKER = {
  file: "broker.pdf",
  pages: 15,
  anchor: { page: 1, text: "TRANSPORTATION BROKERAGE AGREEMENT" },

  // "Initials Carrier Representative: ___________________" — x72-... on every
  // page; the label runs to about x228.
  initialsEveryPage: { x: 232, y: 72 + LIFT, value: "initials", size: 9, max: 90 },

  fields: [
    // ── Page 1 — the parties ────────────────────────────────────────────────
    // Line ends "...is made as of" at x447; the blank "______Mo____," is x460-540.
    { page: 1, x: 462, y: 604 + LIFT, value: "signedMonth", max: 34, size: 8 },
    // "Day____, 20______, between..." — one item x72-540, ~5.92pt per character.
    { page: 1, x: 92, y: 590 + LIFT, value: "signedDay", max: 21 },
    { page: 1, x: 140, y: 590 + LIFT, value: "signedYear2", max: 31 },
    // "“Broker”), and ____…, with its principal place of" — blank starts x153.
    { page: 1, x: 153, y: 549 + LIFT, value: "legalName", max: 228 },
    // The full-width street/city/state/zip rule, x72-462.
    { page: 1, x: 74, y: 521 + LIFT, value: "businessAddress", max: 385 },
    // "...pursuant to DOT/MC # _______" — blank starts x321.
    { page: 1, x: 322, y: 340 + LIFT, value: "mcDot", max: 36, size: 8 },

    // ── Page 12 — address for notices (¶44) ─────────────────────────────────
    // Labels sit at x108; every rule is x216-438.
    { page: 12, x: 218, y: 709 + LIFT, value: "noticeName", max: 218 },
    { page: 12, x: 218, y: 695 + LIFT, value: "noticeStreet", max: 218 },
    { page: 12, x: 218, y: 681 + LIFT, value: "noticeCityStateZip", max: 218 },
    { page: 12, x: 218, y: 667 + LIFT, value: "noticeAttn", max: 218 },

    // ── Page 13 — the two separately-initialled waivers ─────────────────────
    { page: 13, x: 454, y: 421 + LIFT, value: "arbitrationInitials", max: 45 },
    { page: 13, x: 492, y: 170 + LIFT, value: "classWaiverInitials", max: 45 },

    // ── Page 14 — "Initials: ____" twice, x72-172 and x432-532 ──────────────
    { page: 14, x: 124, y: 256 + LIFT, value: "initials", max: 45 },
    { page: 14, x: 484, y: 256 + LIFT, value: "initials", max: 45 },

    // ── Page 15 — execution block (carrier is the right-hand column) ────────
    // "[________________________(CARRIER)]" x324-540; blank starts after "[".
    { page: 15, x: 332, y: 276 + LIFT, value: "legalName", max: 140 },
    // "By: ____" x324-530; blank starts after "By: ".
    { page: 15, x: 349, y: 243 + LIFT, value: "signature", max: 175, signature: true },
    // "Name:" x324-356 and "Title:" x360-386 — printed labels, no rule.
    { page: 15, x: 362, y: 201 + LIFT, value: "signerName", max: 170 },
    { page: 15, x: 392, y: 174 + LIFT, value: "signerTitle", max: 140 },
    // "Date: _____/____/20__" — rule x360-445, split at the printed slashes.
    { page: 15, x: 363, y: 146 + LIFT, value: "signedMonthNum", max: 22, size: 9 },
    { page: 15, x: 397, y: 146 + LIFT, value: "signedDayNum", max: 18, size: 9 },
    { page: 15, x: 435, y: 146 + LIFT, value: "signedYear2", max: 11, size: 9 },
  ],
};

const CONTRACTOR = {
  file: "contractor.pdf",
  pages: 15,
  anchor: { page: 9, text: "OAKLAND" },

  // "Initials CONTRACTOR_____________" — label runs to about x165.
  initialsEveryPage: { x: 168, y: 73 + LIFT, value: "initials", size: 9, max: 70 },

  fields: [
    // ── Page 1 — effective date and the parties ─────────────────────────────
    // One item x70-512, ~4.75pt per character.
    // "...effective as of this ____" — blank starts x252.
    { page: 1, x: 252, y: 584 + LIFT, value: "signedDayOrdinal", max: 76 },
    // "day of ____," — blank starts x366.
    { page: 1, x: 366, y: 584 + LIFT, value: "signedMonth", max: 132 },
    // "20____ , at ____:____ (am/pm) by and between ,____" — item x70-501.
    { page: 1, x: 82, y: 563 + LIFT, value: "signedYear2", max: 30 },
    // "at _______:__________" — the hour and minutes straddle the printed colon
    // at x179, so they are placed as two values rather than one.
    { page: 1, x: 148, y: 563 + LIFT, value: "signedHour", max: 28, size: 8 },
    { page: 1, x: 186, y: 563 + LIFT, value: "signedMinute", max: 44, size: 8 },
    { page: 1, x: 359, y: 563 + LIFT, value: "legalName", max: 140 },
    // "...located at ____" — blank starts x325.
    { page: 1, x: 325, y: 550 + LIFT, value: "businessStreet", max: 180 },
    // Full-width rule above "(Street)(City)(State)(Zip)".
    { page: 1, x: 72, y: 537 + LIFT, value: "businessCityStateZip", max: 293 },

    // ── Page 9 — the contractor's own address block ─────────────────────────
    // "CONTRACTOR____…" x70-277; blank starts after the word.
    { page: 9, x: 131, y: 536 + LIFT, value: "legalName", max: 143 },
    // Labels at x70; every rule is x105-250.
    { page: 9, x: 107, y: 515 + LIFT, value: "businessStreet", max: 141 },
    { page: 9, x: 107, y: 493 + LIFT, value: "businessCity", max: 141 },
    { page: 9, x: 107, y: 472 + LIFT, value: "businessState", max: 141 },
    { page: 9, x: 107, y: 451 + LIFT, value: "businessZip", max: 141 },
    // "CONTRACTOR's Initials: ____" x70-267 — ours is the left-hand one only.
    { page: 9, x: 191, y: 409 + LIFT, value: "initials", max: 74 },

    // ── Page 10 — waiver initials ───────────────────────────────────────────
    { page: 10, x: 370, y: 384 + LIFT, value: "arbitrationInitials", max: 58 },

    // ── Page 13 — execution ─────────────────────────────────────────────────
    // "...this __day of________" — the day blank is barely nine points wide.
    { page: 13, x: 418, y: 464 + LIFT, value: "signedDayNum", max: 9, size: 7 },
    { page: 13, x: 457, y: 464 + LIFT, value: "signedMonth", max: 36, size: 7 },
    // ", 20__, at" x105-145.
    { page: 13, x: 122, y: 450 + LIFT, value: "signedYear2", max: 8, size: 7 },
    // "Contractor's signature____…" x70-293; blank starts after the label.
    { page: 13, x: 178, y: 278 + LIFT, value: "signature", max: 113, signature: true },

    // ── Page 14 — contractor acknowledgement line ───────────────────────────
    { page: 14, x: 128, y: 374 + LIFT, value: "legalName", max: 260 },
  ],

  // ── Appendix A — acknowledgement of contractor's equipment (page 14) ──────
  // The printed table sits between its header rule (y=535) and the carrier's
  // signature block (y=492) — about forty points, which is two rows plus a
  // continuation line. The form itself says "USE ADDITIONAL COPIES AS NECESSARY
  // TO ACCOMMODATE ALL EQUIPMENT", so a longer fleet is reported as a count on
  // that line rather than printed over the signature block.
  equipmentTable: {
    page: 14,
    firstRowY: 523,
    rowHeight: 12,
    maxRows: 2,
    size: 9,
    columns: {
      description: { x: 72, max: 290 },
      vin: { x: 372, max: 160 },
    },
  },
};

const OVERLAYS = { broker: BROKER, contractor: CONTRACTOR };

module.exports = { OVERLAYS, LIFT, SIZE };
