const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const {
  AGREEMENT_BY_KEY,
  noticeAddressFor,
  businessAddressLine,
} = require("../config/carrierAgreements");

// ─── Signed agreement documents ───────────────────────────────────────────────
// Renders the carrier's answers into a finished, downloadable contract.
//
// What this produces is an *execution record*, not a re-typesetting of the
// fifteen-page original. It carries the identifying blanks the carrier filled
// in, the clauses they specifically initialled, the acknowledgements they
// ticked, their signature, and — for the contractor agreement — the Appendix A
// equipment schedule. The full body text of the agreement is the counterparty's
// document and is referenced by title, paragraph and page rather than
// reproduced, so this file can never drift out of step with the legal text
// somebody else maintains.
//
// The output is written once, at signing, and kept. It is deliberately not
// regenerated on download: what was signed is a fact about a moment, and
// re-rendering it later from a since-edited profile would hand the carrier a
// different document from the one they agreed to.
// ─────────────────────────────────────────────────────────────────────────────

const AGREEMENT_DIR = path.join(__dirname, "..", "uploads", "agreements");

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const ACCENT = "#4338ca";

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const ensureDir = () => fs.mkdirSync(AGREEMENT_DIR, { recursive: true });

const safe = (value) =>
  value === undefined || value === null || value === "" ? "—" : String(value);

const trimmed = (value) => String(value ?? "").trim();

const formatDate = (value) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.toLocaleDateString("en-US")} at ${date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
};

/** A tax ID is masked in the generated copy — see maskTaxId's note. */
const maskTaxId = (value) => {
  const raw = String(value || "").replace(/\D/g, "");
  if (!raw) return "—";
  // The document gets emailed, downloaded and forwarded. The office already
  // holds the full number; printing it again on every copy multiplies the
  // number of places it can leak from, for no gain to the reader.
  return `•••-••-${raw.slice(-4)}`;
};

// ── Drawing helpers ──────────────────────────────────────────────────────────

const heading = (doc, text) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(ACCENT)
    .text(text.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
    .lineWidth(0.8)
    .strokeColor(RULE)
    .stroke();
  doc.moveDown(0.6);
};

const paragraph = (doc, text, { size = 8.5, color = MUTED } = {}) => {
  doc.font("Helvetica").fontSize(size).fillColor(color).text(text, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
    align: "left",
    lineGap: 1.5,
  });
  doc.moveDown(0.5);
};

/** A label/value pair in a two-column grid. */
const field = (doc, label, value, { column = 0, columns = 2 } = {}) => {
  const colWidth = CONTENT_WIDTH / columns;
  const x = MARGIN + column * colWidth;
  const y = doc.y;

  doc.font("Helvetica").fontSize(7).fillColor(MUTED);
  doc.text(label.toUpperCase(), x, y, { width: colWidth - 12, characterSpacing: 0.4 });

  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  doc.text(safe(value), x, y + 10, { width: colWidth - 12, ellipsis: true });
};

/**
 * Lay out fields in rows of `columns`, advancing `doc.y` once per row.
 *
 * pdfkit tracks a single cursor, so drawing two columns means both cells are
 * placed from the same starting y and the cursor is moved on manually
 * afterwards — otherwise the second column starts below the first.
 */
const fieldGrid = (doc, entries, columns = 2) => {
  for (let i = 0; i < entries.length; i += columns) {
    const row = entries.slice(i, i + columns);
    const rowY = doc.y;

    row.forEach(([label, value], column) => {
      doc.y = rowY;
      field(doc, label, value, { column, columns });
    });

    doc.y = rowY + 26;
  }
  doc.moveDown(0.4);
};

const tickList = (doc, items) => {
  items.forEach((item) => {
    const y = doc.y;
    doc
      .rect(MARGIN + 1, y + 1, 7, 7)
      .lineWidth(0.7)
      .strokeColor(INK)
      .stroke();
    // A tick rather than a filled box: it reads as "confirmed by a person" at a
    // glance, which is what the acknowledgement is.
    doc
      .moveTo(MARGIN + 2.5, y + 4.5)
      .lineTo(MARGIN + 4, y + 6.5)
      .lineTo(MARGIN + 7, y + 2)
      .lineWidth(1)
      .strokeColor(ACCENT)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(INK)
      .text(item, MARGIN + 15, y, { width: CONTENT_WIDTH - 15, lineGap: 1 });

    doc.moveDown(0.45);
  });
  doc.moveDown(0.3);
};

const table = (doc, columns, rows) => {
  const widths = columns.map((c) => (c.width / 100) * CONTENT_WIDTH);

  const headerY = doc.y;
  doc.rect(MARGIN, headerY, CONTENT_WIDTH, 18).fill("#f3f4f6");

  let x = MARGIN;
  columns.forEach((col, i) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(MUTED)
      .text(col.label.toUpperCase(), x + 5, headerY + 6, {
        width: widths[i] - 10,
        ellipsis: true,
      });
    x += widths[i];
  });

  doc.y = headerY + 18;

  rows.forEach((row) => {
    const rowY = doc.y;
    let cellX = MARGIN;

    columns.forEach((col, i) => {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(INK)
        .text(safe(row[col.key]), cellX + 5, rowY + 5, {
          width: widths[i] - 10,
          ellipsis: true,
        });
      cellX += widths[i];
    });

    doc.y = rowY + 18;
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
      .lineWidth(0.4)
      .strokeColor(RULE)
      .stroke();
  });

  doc.moveDown(0.8);
};

/**
 * The signature block: drawn signature if one was captured, typed name either
 * way, plus the audit trail.
 */
const signatureBlock = (doc, signed) => {
  heading(doc, "Execution");

  const boxY = doc.y;
  const boxHeight = 86;

  doc
    .rect(MARGIN, boxY, CONTENT_WIDTH, boxHeight)
    .lineWidth(0.8)
    .strokeColor(RULE)
    .stroke();

  if (signed.signatureData) {
    try {
      // pdfkit takes a data-URL's base64 payload directly as a buffer.
      const base64 = String(signed.signatureData).split(",").pop();
      doc.image(Buffer.from(base64, "base64"), MARGIN + 14, boxY + 10, {
        fit: [200, 46],
        align: "left",
      });
    } catch {
      // A corrupt signature must not cost the carrier their whole document —
      // the typed name and the audit trail below still evidence the signing.
    }
  }

  doc
    .moveTo(MARGIN + 14, boxY + 60)
    .lineTo(MARGIN + 234, boxY + 60)
    .lineWidth(0.7)
    .strokeColor(INK)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(MUTED)
    .text("SIGNATURE OF AUTHORISED REPRESENTATIVE", MARGIN + 14, boxY + 64);

  const rightX = MARGIN + 264;
  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("NAME", rightX, boxY + 12);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(INK)
    .text(safe(signed.signedName), rightX, boxY + 22, { width: 220, ellipsis: true });

  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("TITLE", rightX, boxY + 40);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(INK)
    .text(safe(signed.signedTitle), rightX, boxY + 50, { width: 220, ellipsis: true });

  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("SIGNED", rightX, boxY + 66);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(INK)
    .text(formatDateTime(signed.signedAt), rightX, boxY + 75, { width: 220 });

  doc.y = boxY + boxHeight + 10;

  // The audit trail is what makes this an execution record rather than a form.
  paragraph(
    doc,
    `Executed electronically. Recorded from IP ${safe(signed.signedIp)} using ${safe(
      signed.signedUserAgent,
    )}. The signatory confirmed they are authorised to bind the carrier.`,
    { size: 7 },
  );
};

const pageFurniture = (doc, agreement, profile) => {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    // Writing inside the bottom margin is exactly what pdfkit treats as
    // overflow, so it helpfully starts a new page — and that new page gets a
    // footer too, and so on. Dropping the bottom margin for the duration of the
    // write is the standard way to tell it this text is furniture, not content.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `${agreement.title} · ${safe(profile.legalName)}`,
        MARGIN,
        doc.page.height - 32,
        { width: CONTENT_WIDTH - 70, lineBreak: false, ellipsis: true },
      )
      .text(
        `Page ${i - range.start + 1} of ${range.count}`,
        MARGIN + CONTENT_WIDTH - 70,
        doc.page.height - 32,
        { width: 70, align: "right", lineBreak: false },
      );

    doc.page.margins.bottom = bottomMargin;
  }
};

// ── Generation ───────────────────────────────────────────────────────────────

/**
 * Render the signed agreement to a PDF on disk.
 *
 * Used for documents with no counterparty original to fill in — see
 * documentBuilderFor in controllers/onboardingController.js.
 *
 * @param {object}  args.agreementKey  a key from config/carrierAgreements.js
 * @param {object}  args.profile       shared answers (config/carrierAgreements)
 * @param {object}  args.signed        the signedAgreement sub-document
 * @param {array}   args.equipment     Appendix A rows (contractor only)
 * @param {array}   args.drivers       roster snapshot, for the ¶23 warranty
 * @param {string}  args.carrierCode   FO-0001, for the filename
 */
const buildAgreementDocument = async ({
  agreementKey,
  profile = {},
  signed = {},
  equipment = [],
  drivers = [],
  carrierCode = "carrier",
}) => {
  const agreement = AGREEMENT_BY_KEY.get(agreementKey);
  if (!agreement) throw new Error(`Unknown agreement "${agreementKey}"`);

  ensureDir();

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${carrierCode}-${agreementKey}-agreement-${stamp}.pdf`;
  const filePath = path.join(AGREEMENT_DIR, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true, // page N of M needs the total, known only at the end
    info: {
      Title: `${agreement.title} — ${profile.legalName || carrierCode}`,
      Author: agreement.counterparty,
      Subject: "Executed carrier agreement",
    },
  });

  const writeStream = fs.createWriteStream(filePath);
  const completion = new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve({ fileName, filePath }));
    writeStream.on("error", reject);
    doc.on("error", reject);
  });

  doc.pipe(writeStream);

  // ── Title ────────────────────────────────────────────────────────────────
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(INK)
    .text(agreement.counterparty, MARGIN, MARGIN);

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(ACCENT)
    .text(agreement.title, { width: CONTENT_WIDTH });

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(agreement.counterpartyAddress, { width: CONTENT_WIDTH });

  if (agreement.counterpartyDocket) {
    doc.text(`Docket ${agreement.counterpartyDocket}`, { width: CONTENT_WIDTH });
  }

  doc.moveDown(1);

  // A document we author is complete in itself; one that stands in for a
  // counterparty's contract has to say so and point at the original, or it reads
  // as though these three pages were the whole agreement.
  const standsInForAnOriginal = agreement.pages > 1;

  paragraph(
    doc,
    `This is the executed record of the ${agreement.title} between ${agreement.counterparty} and the carrier identified below. ` +
      `It records the particulars supplied by the carrier, the clauses they separately initialled, the acknowledgements they confirmed, and their signature.` +
      (standsInForAnOriginal
        ? ` The full ${agreement.pages}-page terms are those of the ${agreement.title} as furnished by ${agreement.counterparty}; paragraph and page references below point into that document.`
        : ""),
    { size: 8 },
  );

  // ── Parties ──────────────────────────────────────────────────────────────
  heading(doc, "The parties");

  fieldGrid(doc, [
    ["Carrier legal name", profile.legalName],
    ["Doing business as", profile.dba],
    ["Entity type", profile.entityType],
    ["Principal place of business", businessAddressLine(profile)],
    ["MC number", profile.mcNumber],
    ["USDOT number", profile.dotNumber],
    [`${profile.taxIdType || "Tax ID"}`, maskTaxId(profile.taxId)],
    ["SCAC", profile.scac],
  ]);

  // ── Notice address (broker agreement p12) ────────────────────────────────
  if (agreementKey === "broker") {
    const notice = noticeAddressFor(profile);
    heading(doc, "Address for notices (¶44, p12)");
    fieldGrid(doc, [
      ["Name", notice.name],
      ["Attention", notice.attn],
      ["Street", notice.street],
      ["City, state, ZIP", [notice.city, notice.state, notice.zip].filter(Boolean).join(", ")],
    ]);
  }

  if (agreementKey === "contractor" && signed.values?.operatingLocation) {
    heading(doc, "Operating location (Appendix B rate schedule)");
    fieldGrid(doc, [["Location", signed.values.operatingLocation]], 1);
  }

  // ── The document's own answers ───────────────────────────────────────────
  // Everything the agreement asked for that is not an initial and not already
  // printed above. Rendered from the schema rather than named field by field,
  // so a document authored here (the EIN certification) states what it recorded
  // without this file needing a branch per document.
  //
  // Nothing is masked. The two counterparty contracts are produced by the
  // overlay service, so what reaches here is a document whose purpose is to
  // record the values themselves — an EIN certification with the EIN starred
  // out certifies nothing. Access is controlled by the download route, which
  // streams through the API rather than /uploads.
  const answered = (agreement.fields || []).filter(
    (f) =>
      f.type !== "initials" &&
      f.key !== "operatingLocation" &&
      trimmed(signed.values?.[f.key]),
  );

  if (answered.length) {
    heading(doc, "Certified particulars");
    fieldGrid(
      doc,
      answered.map((f) => [f.label, signed.values[f.key]]),
    );
  }

  // ── Separately initialled clauses ────────────────────────────────────────
  const initialled = (agreement.fields || []).filter((f) => f.type === "initials");

  if (initialled.length) {
    heading(doc, "Separately initialled clauses");
    paragraph(
      doc,
      "The agreement requires these clauses to be initialled separately from the signature. The carrier's initials are recorded against each.",
      { size: 7.5 },
    );

    initialled.forEach((f) => {
      const y = doc.y;

      doc
        .rect(MARGIN, y, 62, 26)
        .lineWidth(0.8)
        .strokeColor(ACCENT)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(ACCENT)
        .text(safe(signed.values?.[f.key]).toUpperCase(), MARGIN, y + 7, {
          width: 62,
          align: "center",
        });

      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(INK)
        .text(f.label.replace(" — your initials", ""), MARGIN + 74, y + 2, {
          width: CONTENT_WIDTH - 74,
        });

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(f.help || "", MARGIN + 74, doc.y, { width: CONTENT_WIDTH - 74, lineGap: 1 });

      doc.y = Math.max(doc.y, y + 26) + 8;
    });

    doc.moveDown(0.4);
  }

  // ── Appendix A — equipment (contractor agreement) ────────────────────────
  if (agreementKey === "contractor") {
    if (doc.y > 560) doc.addPage();

    heading(doc, "Appendix A — acknowledgement of contractor's equipment");

    if (equipment.length) {
      table(
        doc,
        [
          { key: "unitNumber", label: "Unit #", width: 11 },
          { key: "equipmentType", label: "Type", width: 14 },
          { key: "make", label: "Make", width: 15 },
          { key: "model", label: "Model", width: 15 },
          { key: "year", label: "Year", width: 9 },
          { key: "vin", label: "VIN", width: 24 },
          { key: "plate", label: "Plate", width: 12 },
        ],
        equipment,
      );
    } else {
      paragraph(doc, "No equipment was listed at the time of signing.", { size: 8 });
    }
  }

  // ── Drivers ──────────────────────────────────────────────────────────────
  // ¶23 of the brokerage agreement is a warranty that every driver is competent
  // and properly licensed. Listing the roster as signed makes that warranty
  // refer to specific, named people rather than to nobody in particular.
  if (drivers.length) {
    if (doc.y > 560) doc.addPage();

    heading(doc, "Drivers declared at signing (¶23 — competent and properly licensed)");
    table(
      doc,
      [
        { key: "name", label: "Driver", width: 28 },
        { key: "licenseNumber", label: "Licence no.", width: 20 },
        { key: "licenseState", label: "State", width: 10 },
        { key: "licenseClass", label: "Class", width: 10 },
        { key: "licenseExpiryText", label: "Expires", width: 17 },
        { key: "licenceOnFile", label: "Copy on file", width: 15 },
      ],
      drivers.map((d) => ({
        ...d,
        licenseExpiryText: d.licenseExpiry ? formatDate(d.licenseExpiry) : "—",
        licenceOnFile: d.licenseDocument?.filePath ? "Yes" : "No",
      })),
    );
  }

  // ── Acknowledgements ─────────────────────────────────────────────────────
  if (doc.y > 520) doc.addPage();

  heading(doc, "Carrier acknowledgements");
  tickList(doc, signed.acknowledgements?.length ? signed.acknowledgements : agreement.acknowledgements);

  // ── Signature ────────────────────────────────────────────────────────────
  if (doc.y > 600) doc.addPage();
  signatureBlock(doc, signed);

  pageFurniture(doc, agreement, profile);

  doc.end();
  return completion;
};

module.exports = {
  buildAgreementDocument,
  AGREEMENT_DIR,
};
