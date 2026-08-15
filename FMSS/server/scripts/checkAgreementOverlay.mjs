import fs from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Regression check for config/agreementOverlay.js.
//
//   node scripts/checkAgreementOverlay.mjs assets/agreements/broker.pdf <filled.pdf>
//
// Run this after re-measuring the overlay map, or after replacing a pinned
// agreement with a new revision from the counterparty. A value landing on the
// printed text instead of its blank is the failure mode this catches, and it is
// not obvious from the file size or from the text extracting correctly — the
// words are all present either way, just printed on top of each other.
//
// Compares a filled PDF against its blank original. Every text item in the
// filled file that is not in the original is a value we drew; for each, work out
// which characters of the printed line sit underneath it. Landing on underscores
// or spaces is correct — that is the blank. Landing on letters is the bug.
const [, , originalPath, filledPath] = process.argv;

const itemsOf = async (p) => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(p)),
    useSystemFonts: true,
  }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    for (const i of c.items) {
      if (!i.str.trim()) continue;
      out.push({
        page: n,
        y: Math.round(i.transform[5]),
        x: i.transform[4],
        w: i.width,
        s: i.str,
      });
    }
  }
  return out;
};

const orig = await itemsOf(originalPath);
const filled = await itemsOf(filledPath);

const key = (i) => `${i.page}|${i.y}|${Math.round(i.x)}|${i.s}`;
const origKeys = new Set(orig.map(key));
const drawn = filled.filter((i) => !origKeys.has(key(i)));

console.log(`values drawn: ${drawn.length}`);

let bad = 0;
for (const d of drawn) {
  const dEnd = d.x + d.w;
  for (const o of orig) {
    if (o.page !== d.page || Math.abs(o.y - d.y) > 4) continue;
    const oEnd = o.x + o.w;
    if (Math.min(dEnd, oEnd) - Math.max(d.x, o.x) <= 1) continue;

    // Uniform character width is an approximation, but these are monospaced
    // runs of underscores in a serif body face — close enough to tell a letter
    // from a rule.
    const per = o.w / o.s.length;
    const from = Math.max(0, Math.floor((Math.max(d.x, o.x) - o.x) / per));
    const to = Math.min(o.s.length, Math.ceil((Math.min(dEnd, oEnd) - o.x) / per));
    const under = o.s.slice(from, to);

    if (/[^_\s.,]/.test(under)) {
      console.log(
        `  ON TEXT p${d.page} y${d.y}: ${JSON.stringify(d.s)} sits over ${JSON.stringify(under)}`,
      );
      bad += 1;
      break;
    }
  }
}

console.log(bad ? `\n${bad} value(s) printed over text.` : "\nClean — every value sits on a blank.");
