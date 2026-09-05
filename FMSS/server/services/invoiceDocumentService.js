const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
// Issue and due dates are calendar dates, rendered in UTC — see utils/dates.js.
// Rendering them in the server's own zone is how an invoice dated the 15th
// prints as the 14th on a host in the Americas.
//
// Numeric — "08/25/2026" — because that is the form the bill has always carried
// and the form the customer's own system expects to be keyed. `formatDate`'s
// "Aug 25, 2026" is for screens, where there is room for it.
const { formatDateNumeric: formatDate } = require("../utils/dates");

// ─── The invoice as a document ────────────────────────────────────────────────
// A printable, emailable PDF of one invoice, laid out to match the bill this
// office already sends — the same letterhead, the same tinted Bill to / Ship to
// band, the same six-column table, the same boxed total. Customers reconcile a
// new bill against the last one they filed; a document that arrives looking like
// a different company's paperwork gets queried before it gets paid.
//
// ── Coordinates ──────────────────────────────────────────────────────────────
// Everything below is expressed on an 816 × 1056 grid — US Letter at 96dpi,
// which is the grid the reference document was laid out on. `PT_PER_PX` scales
// the whole page down to PDF points once, in `withGrid`, so every measurement
// here can be read straight off the original rather than converted by hand and
// rounded twice.
//
// Text is positioned by BASELINE (`baseline: "alphabetic"`), not by the top of
// the line box. Baselines are what the reference records, and they are also what
// keeps two columns of different type sizes sitting on the same line — which the
// header row of the table depends on.
//
// ── Wrapping ─────────────────────────────────────────────────────────────────
// Wrapping is done here rather than by PDFKit's own flow. Under a scaled CTM
// PDFKit still measures the page bottom in unscaled points, so its automatic
// pagination fires around y=792 on a grid that runs to 1056 — half a page early.
// `wrapText` below measures with the real font and returns lines we place
// ourselves, which also lets a tall row decide for itself whether it fits.
//
// ── AR and AP from one function ──────────────────────────────────────────────
// The same renderer draws a customer invoice and a carrier settlement — they are
// the same document read from opposite ends, and the only differences are the
// title and the wording of the address block. Keeping them in one place is what
// stops the settlement statement drifting into looking like a different
// company's paperwork.
// ─────────────────────────────────────────────────────────────────────────────

const INVOICE_DIR = path.join(__dirname, "..", "uploads", "invoices");
const LOGO_PATH = path.join(__dirname, "..", "assets", "invoice-logo.jpg");

const ensureDir = () => fs.mkdirSync(INVOICE_DIR, { recursive: true });

// ── Palette ───────────────────────────────────────────────────────────────────
const BRAND = "#0077C5"; // the title, and nothing else
const INK = "#393A3D"; // all body copy
const BLACK = "#000000"; // the table's column headings only
const BAND = "#EBF4FA"; // the tint behind Bill to / Ship to / Invoice details
const DASH = "#D4D7DC"; // the dashed rule inside that band
const RULE = "#E3E5E8"; // the table's row rules
const VOID_RED = "#ef4444";

// ── The grid ──────────────────────────────────────────────────────────────────
const PT_PER_PX = 0.75; // 96dpi → 72dpi
const PAGE_W = 816;
const PAGE_H = 1056;

const LEFT = 43; // letterhead, address blocks, invoice details
const CONTACT_X = 232.5; // the letterhead's second column
const SHIP_X = 529.66; // the Ship to block
const REF_X = 286.33; // the reference numbers, beside Invoice details
const DASH_RIGHT = 767;

const LOGO = { x: 636, y: 30, size: 120 };

// The address blocks are 243 wide in the reference and 146 tall, which is six
// lines at the 18px step below plus room for the heading.
const BLOCK_W = 243;
const BLOCK_LINES = 6;
const BLOCK_STEP = 18;

const BAND_TOP = 170;
const BAND_BOTTOM = 480;
const DASH_Y = 338.5;

// ── The table ─────────────────────────────────────────────────────────────────
// Left-aligned columns carry an x; right-aligned ones carry the edge their text
// ends on. The amount column ends at 756, which is also where every row rule
// stops — that alignment is what makes the column of figures read as a column.
const TABLE_LEFT = 36;
const TABLE_RIGHT = 756;
const COL_NUM_X = 36;
const COL_DATE_X = 60;
const COL_ITEM_X = 136.55;
const COL_DESC_X = 331.42;
const COL_QTY_RIGHT = 602;
const COL_RATE_RIGHT = 679.5;
const COL_AMOUNT_RIGHT = TABLE_RIGHT;
// The one heading that is placed rather than right-aligned. In the original the
// Amount heading sits fractionally inside the edge its figures align to, and
// matching that is cheaper than explaining why our column looks a shade wider.
const COL_AMOUNT_HEAD_X = 712;
const COL_ITEM_W = 190;
const COL_DESC_W = 195;

const HEAD_BASELINE = 522;
const HEAD_RULE_Y = 536;
const ROW_TOP_GAP = 22; // rule → first baseline
const ROW_LINE_STEP = 16; // baseline → baseline within a row
const ROW_BOTTOM_GAP = 15; // last baseline → next rule

// The last y anything may be drawn on. Mirrors the 30px clear space above the
// letterhead, so a page that runs full does not look like it was cut.
const PAGE_BOTTOM = PAGE_H - 30;

// Where a row must stop and the rest go on a second page. Kept clear of
// PAGE_BOTTOM by the deepest totals block that can follow it, because the
// totals are never split from the lines they total.
const ROW_LIMIT = 900;
const CONTINUATION_TOP = 90;

// ── The totals block ──────────────────────────────────────────────────────────
const TOTALS_LEFT = 496;
const TOTALS_LABEL_X = 495.75;
const BIG_ROW_H = 45;
const SMALL_ROW_H = 30;

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const usd = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const TERM_LABELS = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET_7: "Net 7",
  NET_15: "Net 15",
  NET_30: "Net 30",
  NET_45: "Net 45",
  NET_60: "Net 60",
};

/** A word for the document that matches who is holding it. */
const titleFor = (invoice) => {
  if (invoice.direction === "AR") return "INVOICE";
  return invoice.party?.kind === "DRIVER" ? "DRIVER SETTLEMENT" : "CARRIER BILL";
};

const addressBlockFor = (invoice) =>
  invoice.direction === "AR" ? "Bill to" : "Pay to";

const trimmed = (value) => String(value ?? "").trim();

// ── Drawing helpers ───────────────────────────────────────────────────────────

/**
 * One run of text on a baseline.
 *
 * `right` right-aligns the run to that edge instead of starting it at `x`, which
 * is how the three money columns line up without a width per column.
 */
const say = (doc, text, { x, y, size, bold = false, color = INK, right } = {}) => {
  const value = String(text ?? "");
  if (!value) return;

  doc.font(bold ? FONT_BOLD : FONT).fontSize(size).fillColor(color);

  const startX = right === undefined ? x : right - doc.widthOfString(value);

  doc.text(value, startX, y, { lineBreak: false, baseline: "alphabetic" });
};

/** A filled rectangle — the tinted band, and every rule on the page. */
const box = (doc, x, y, w, h, color) => doc.rect(x, y, w, h).fillColor(color).fill();

const rule = (doc, x, y, w, color = RULE) => box(doc, x, y, w, 1, color);

/**
 * Break `text` into lines that fit `width` in the given font.
 *
 * A word longer than the column is left to overhang rather than broken mid-word:
 * container and booking numbers are the long tokens on this page, and a number
 * split across two lines is worse than one that runs slightly wide.
 */
const wrapText = (doc, text, width, size, bold = false) => {
  const value = trimmed(text);
  if (!value) return [];

  doc.font(bold ? FONT_BOLD : FONT).fontSize(size);

  const lines = [];

  value.split(/\n/).forEach((paragraph) => {
    let current = "";

    trimmed(paragraph)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (current && doc.widthOfString(candidate) > width) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });

    if (current) lines.push(current);
  });

  return lines;
};

/** The address lines of a party, in the order a postal address is read. */
const partyLinesFor = (party = {}) =>
  [party.name, party.address, party.email, party.phone].map(trimmed).filter(Boolean);

const shipToLinesFor = (invoice) => {
  const shipTo = invoice.shipTo || {};
  return [shipTo.name, shipTo.address].map(trimmed).filter(Boolean);
};

// ── The page ──────────────────────────────────────────────────────────────────

/**
 * The letterhead: who is billing, how to reach them, and the logo.
 *
 * The two contact columns share baselines rather than flowing independently, so
 * a branch with a one-line address does not leave its phone number floating
 * halfway up the page.
 */
const drawLetterhead = (doc, invoice) => {
  const issuer = invoice.issuer || {};

  say(doc, titleFor(invoice), {
    x: LEFT,
    y: 55,
    size: 16,
    bold: true,
    color: BRAND,
  });

  say(doc, issuer.name || "S Line Brokerage Inc.", {
    x: LEFT,
    y: 71,
    size: 10,
    bold: true,
  });

  // "El Sobrante, CA 94803" — the zip follows the state on a space, not a
  // comma, because that is how a US address is written and a postal clerk
  // reading it aloud is the test this line has to pass.
  const cityLine = [
    [issuer.city, issuer.state].map(trimmed).filter(Boolean).join(", "),
    trimmed(issuer.zip),
  ]
    .filter(Boolean)
    .join(" ");

  const addressLines = [trimmed(issuer.address), cityLine].filter(Boolean);

  addressLines.slice(0, 2).forEach((line, index) => {
    say(doc, line, { x: LEFT, y: 86 + index * 15, size: 10 });
  });

  const contactLines = [issuer.email, issuer.phone, issuer.website]
    .map(trimmed)
    .filter(Boolean);

  contactLines.slice(0, 3).forEach((line, index) => {
    say(doc, line, { x: CONTACT_X, y: 71 + index * 15, size: 10 });
  });

  // Absent in a checkout of the repo that has not pulled the asset; the document
  // is still correct without it, so a missing file must not fail the render.
  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, LOGO.x, LOGO.y, { fit: [LOGO.size, LOGO.size] });
    } catch {
      // A corrupt logo is not a reason to withhold an invoice.
    }
  }
};

/**
 * The tinted band: who it is addressed to, where the freight went, and the four
 * facts a clerk keys into their system.
 */
const drawBand = (doc, invoice) => {
  box(doc, 0, BAND_TOP, PAGE_W, BAND_BOTTOM - BAND_TOP, BAND);

  // ── Bill to / Ship to ───────────────────────────────────────────────────────
  const column = (heading, lines, x) => {
    say(doc, heading, { x, y: 197, size: 10, bold: true });

    const wrapped = lines.flatMap((line) => wrapText(doc, line, BLOCK_W, 12));

    wrapped.slice(0, BLOCK_LINES).forEach((line, index) => {
      say(doc, line, { x, y: 215 + index * BLOCK_STEP, size: 12 });
    });
  };

  column(addressBlockFor(invoice), partyLinesFor(invoice.party), LEFT);

  const shipTo = shipToLinesFor(invoice);
  if (shipTo.length) column("Ship to", shipTo, SHIP_X);

  // ── The dashed rule ─────────────────────────────────────────────────────────
  doc
    .moveTo(LEFT, DASH_Y)
    .lineTo(DASH_RIGHT, DASH_Y)
    .lineWidth(1)
    .strokeColor(DASH)
    .dash(3, { space: 2 })
    .stroke()
    .undash();

  // ── Invoice details ─────────────────────────────────────────────────────────
  say(doc, "Invoice details", { x: LEFT, y: 381, size: 12, bold: true });

  const details = [
    ["Invoice no.", invoice.invoiceNumber],
    ["Terms", TERM_LABELS[invoice.terms] || invoice.terms],
    ["Invoice date", formatDate(invoice.issueDate)],
    ["Due date", formatDate(invoice.dueDate)],
  ].filter(([, value]) => trimmed(value));

  details.forEach(([label, value], index) => {
    say(doc, `${label}: ${value}`, { x: LEFT, y: 401 + index * BLOCK_STEP, size: 12 });
  });

  // The load number earns a line only when it is not already the invoice number
  // — on a customer invoice the two are the same, and printing it twice invites
  // the reader to look for the difference.
  const references = [...(invoice.references || [])];
  if (invoice.loadId && invoice.loadId !== invoice.invoiceNumber) {
    references.unshift({ label: "Load #", value: invoice.loadId });
  }

  references
    .filter((ref) => trimmed(ref?.value))
    .slice(0, BLOCK_LINES)
    .forEach((ref, index) => {
      say(doc, `${trimmed(ref.label)} : ${trimmed(ref.value)}`, {
        x: REF_X,
        y: 382 + index * BLOCK_STEP,
        size: 12,
      });
    });
};

/** The table's column headings, and the rule beneath them. */
const drawTableHead = (doc, baseline = HEAD_BASELINE) => {
  const ruleY = baseline + (HEAD_RULE_Y - HEAD_BASELINE);

  say(doc, "#", { x: COL_NUM_X, y: baseline - 3, size: 10.66, color: BLACK });
  say(doc, "Date", { x: COL_DATE_X, y: baseline, size: 12, color: BLACK });
  say(doc, "Product or service", { x: COL_ITEM_X, y: baseline, size: 12, color: BLACK });
  say(doc, "Description", { x: COL_DESC_X, y: baseline, size: 12, color: BLACK });
  say(doc, "Qty", { right: COL_QTY_RIGHT, y: baseline, size: 12, color: BLACK });
  say(doc, "Rate", { right: COL_RATE_RIGHT, y: baseline, size: 12, color: BLACK });
  say(doc, "Amount", { x: COL_AMOUNT_HEAD_X, y: baseline, size: 12, color: BLACK });

  rule(doc, TABLE_LEFT, ruleY, TABLE_RIGHT - TABLE_LEFT);

  return ruleY;
};

/**
 * The line items.
 *
 * Quantity and rate print only where they exist. A detention charge billed as
 * "2 @ $75.00" tells the customer why the number is what it is and heads off the
 * query; a flat charge with "1 @ $450.00" against it tells them nothing and just
 * adds noise to a page that is skimmed.
 *
 * Advances are not drawn here. An advance is not a charge, and printing it
 * inline would make the column of figures fail to add up to the total beneath it
 * — the single fastest way to have an invoice queried.
 */
const drawLines = (doc, invoice, startRuleY, newPage) => {
  let ruleY = startRuleY;

  const charges = (invoice.lines || []).filter((line) => line.kind !== "settlement");

  if (!charges.length) {
    say(doc, "No charges recorded.", {
      x: COL_ITEM_X,
      y: ruleY + ROW_TOP_GAP,
      size: 10.66,
    });
    ruleY += ROW_TOP_GAP + ROW_BOTTOM_GAP;
    rule(doc, TABLE_LEFT, ruleY, TABLE_RIGHT - TABLE_LEFT);
    return ruleY;
  }

  charges.forEach((line, index) => {
    const itemLines = wrapText(doc, line.label, COL_ITEM_W, 10.66, true);
    const descLines = wrapText(doc, line.description, COL_DESC_W, 10.66);
    const rows = Math.max(itemLines.length, descLines.length, 1);

    const firstBaseline = ruleY + ROW_TOP_GAP;
    const lastBaseline = firstBaseline + (rows - 1) * ROW_LINE_STEP;

    // A row is never split across the fold: half a description on each page
    // reads as two charges.
    if (lastBaseline + ROW_BOTTOM_GAP > ROW_LIMIT) {
      ruleY = newPage();
    }

    const top = ruleY + ROW_TOP_GAP;

    say(doc, `${index + 1}.`, { x: COL_NUM_X, y: top, size: 10.66 });

    if (line.date) {
      say(doc, formatDate(line.date), { x: COL_DATE_X, y: top, size: 10.66 });
    }

    itemLines.forEach((text, i) => {
      say(doc, text, {
        x: COL_ITEM_X,
        y: top + i * ROW_LINE_STEP,
        size: 10.66,
        bold: true,
      });
    });

    descLines.forEach((text, i) => {
      say(doc, text, { x: COL_DESC_X, y: top + i * ROW_LINE_STEP, size: 10.66 });
    });

    if (line.quantity) {
      say(doc, String(line.quantity), {
        right: COL_QTY_RIGHT,
        y: top,
        size: 10.66,
      });
    }

    if (line.rate) {
      say(doc, usd(line.rate), { right: COL_RATE_RIGHT, y: top, size: 10.66 });
    }

    say(doc, usd(line.amount), { right: COL_AMOUNT_RIGHT, y: top, size: 10.66 });

    ruleY = top + (Math.max(rows, 1) - 1) * ROW_LINE_STEP + ROW_BOTTOM_GAP;
    rule(doc, TABLE_LEFT, ruleY, TABLE_RIGHT - TABLE_LEFT);
  });

  return ruleY;
};

/**
 * The total, and anything that has already come off it.
 *
 * A clean invoice prints one row — "Total" — exactly as the reference does. The
 * advance and payment rows appear only when there is money to account for,
 * because a bill that says "Total $785.00, Payments received $0.00, Balance due
 * $785.00" invites the reader to work out which of the three to pay.
 */
/**
 * What comes off the total, in the order it is deducted.
 *
 * `advanceApplied` IS the sum of the settlement lines — the model's own hook
 * derives it from them. Naming each one is the more useful of the two, so the
 * single rolled-up figure appears only when there are no lines behind it to
 * name; listing both would deduct the same money twice on the page while the
 * balance beneath deducted it once.
 */
const deductionsFor = (invoice) => {
  const settlements = (invoice.lines || []).filter((line) => line.kind === "settlement");
  const paid = Number(invoice.amountPaid || 0);
  const advance = Number(invoice.advanceApplied || 0);

  const rows = settlements.length
    ? settlements.map((line) => [line.label || "Deduction", line.amount])
    : advance > 0
      ? [["Advance applied", advance]]
      : [];

  if (paid > 0) rows.push(["Payments received", paid]);

  return rows;
};

/** How tall the totals block will be, before a line of it is drawn. */
const totalsHeight = (invoice) => {
  const deductions = deductionsFor(invoice);
  if (!deductions.length) return BIG_ROW_H;
  return BIG_ROW_H + deductions.length * SMALL_ROW_H + BIG_ROW_H;
};

const drawTotals = (doc, invoice, topRuleY) => {
  let y = topRuleY;

  const width = TABLE_RIGHT - TOTALS_LEFT;

  rule(doc, TOTALS_LEFT, y, width);

  const row = (label, value, big) => {
    const height = big ? BIG_ROW_H : SMALL_ROW_H;

    say(doc, label, {
      x: TOTALS_LABEL_X,
      y: y + (big ? 26 : 20),
      size: 10.66,
      bold: true,
    });

    say(doc, value, {
      right: COL_AMOUNT_RIGHT,
      y: y + (big ? 28 : 20),
      size: big ? 16 : 10.66,
      bold: true,
    });

    y += height;
    rule(doc, TOTALS_LEFT, y, width);
  };

  const deductions = deductionsFor(invoice);

  row("Total", usd(invoice.total), !deductions.length);

  if (deductions.length) {
    // A hyphen, not U+2212: the built-in fonts are WinAnsi-encoded and a true
    // minus sign is not in that character set — it prints as two stray glyphs.
    deductions.forEach(([label, amount]) => row(label, `- ${usd(amount)}`, false));

    row(
      invoice.direction === "AR" ? "Balance due" : "Amount payable",
      usd(invoice.balance),
      true,
    );
  }

  return y;
};

/** Memo and notes — the small print that prevents the phone call. */
const drawFooter = (doc, invoice, startY, newPage) => {
  let y = startY + 30;

  const blocks = [
    ["Memo", invoice.memo],
    ["Notes", invoice.notes],
  ].filter(([, value]) => trimmed(value));

  blocks.forEach(([label, value]) => {
    const lines = wrapText(doc, value, 440, 10);

    // A heading stranded at the foot of one page with its text on the next is
    // worse than a page break before the heading, so the block moves as a unit.
    if (y + 16 + lines.length * 14 > PAGE_BOTTOM) y = newPage() + 30;

    say(doc, label, { x: LEFT, y, size: 10, bold: true });
    y += 16;

    lines.forEach((line) => {
      say(doc, line, { x: LEFT, y, size: 10 });
      y += 14;
    });

    y += 10;
  });
};

/**
 * A voided invoice must never be mistaken for a live one, and the number stays
 * in circulation — somebody has a copy. The stamp is the only thing that travels
 * with a printout, and it goes on every sheet: a reader holding page two of a
 * three-page bill has to be able to tell it was withdrawn.
 */
const drawVoidStamp = (doc) => {
  doc.save();
  doc.rotate(-30, { origin: [PAGE_W / 2, 520] });
  doc.font(FONT_BOLD).fontSize(128).fillColor(VOID_RED).opacity(0.18);
  doc.text("VOID", 130, 460, {
    width: 560,
    align: "center",
    lineBreak: false,
    baseline: "alphabetic",
  });
  doc.restore();
  doc.opacity(1);
};

/**
 * Render one invoice into a PDF buffer.
 *
 * A buffer rather than a file, because the two things that happen to an invoice
 * — downloaded by staff, attached to an email — both want bytes, and writing it
 * to disk first would leave a directory of stale copies that disagree with the
 * record the moment anything is edited. `writeInvoicePdf` below is for the cases
 * that genuinely need a path.
 */
const renderInvoicePdf = (invoice) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 0,
        // So the VOID stamp can be laid over pages that are already written.
        bufferPages: true,
        info: {
          Title: `${titleFor(invoice)} ${invoice.invoiceNumber}`,
          Author: invoice.issuer?.name || "S Line Brokerage Inc.",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Everything after this point is drawn on the 816 × 1056 grid described at
      // the top of the file. The scale is re-applied per page, because a new
      // page starts a fresh content stream with an identity matrix.
      const enterGrid = () => {
        doc.save();
        doc.scale(PT_PER_PX);
      };

      const leaveGrid = () => doc.restore();

      /** Break to a second sheet and re-draw the column headings on it. */
      const newPage = () => {
        leaveGrid();
        doc.addPage();
        enterGrid();
        return drawTableHead(doc, CONTINUATION_TOP);
      };

      enterGrid();

      drawLetterhead(doc, invoice);
      drawBand(doc, invoice);

      const headRuleY = drawTableHead(doc);
      let lastRuleY = drawLines(doc, invoice, headRuleY, newPage);

      // The totals follow the last line on the same sheet unless they no longer
      // fit under it — a deep block of deductions on a table that ran to the
      // foot of the page is the case that would otherwise print off the paper.
      if (lastRuleY + totalsHeight(invoice) > PAGE_BOTTOM) lastRuleY = newPage();

      const totalsBottom = drawTotals(doc, invoice, lastRuleY);

      drawFooter(doc, invoice, totalsBottom, newPage);

      leaveGrid();

      if (invoice.status === "VOID") {
        const { count } = doc.bufferedPageRange();
        for (let page = 0; page < count; page += 1) {
          doc.switchToPage(page);
          enterGrid();
          drawVoidStamp(doc);
          leaveGrid();
        }
        doc.flushPages();
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

/** Same document, written to uploads/invoices and returned as a path. */
const writeInvoicePdf = async (invoice) => {
  ensureDir();

  const buffer = await renderInvoicePdf(invoice);
  const fileName = `${String(invoice.invoiceNumber).replace(/[^\w.-]+/g, "_")}.pdf`;
  const filePath = path.join(INVOICE_DIR, fileName);

  fs.writeFileSync(filePath, buffer);

  return { fileName, filePath };
};

module.exports = {
  renderInvoicePdf,
  writeInvoicePdf,
  titleFor,
  usd,
  formatDate,
  TERM_LABELS,
  INVOICE_DIR,
  PAGE_W,
  PAGE_H,
};
