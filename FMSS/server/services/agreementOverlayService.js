const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { AGREEMENT_BY_KEY, noticeAddressFor } = require("../config/carrierAgreements");
const { OVERLAYS, SIZE } = require("../config/agreementOverlay");

// ─── Filling the real agreement ───────────────────────────────────────────────
// The carrier downloads the counterparty's own fifteen-page document with its
// blanks filled in — the thing they actually agreed to — rather than a summary
// of it. The source files are pinned in assets/agreements/ and never modified;
// each signing loads one, draws the carrier's answers at the coordinates in
// config/agreementOverlay.js, and writes a new file.
//
// Nothing is redacted here on purpose: this is the executed contract, and the
// tax ID and signature belong on it. The download route is what keeps it
// private (it streams through the API rather than /uploads).
// ─────────────────────────────────────────────────────────────────────────────

const AGREEMENT_DIR = path.join(__dirname, "..", "uploads", "agreements");
const SOURCE_DIR = path.join(__dirname, "..", "assets", "agreements");

const ensureDir = () => fs.mkdirSync(AGREEMENT_DIR, { recursive: true });

const str = (value) => (value === undefined || value === null ? "" : String(value).trim());

const joinParts = (...parts) => parts.map(str).filter(Boolean).join(", ");

const ORDINAL = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  const s = ["th", "st", "nd", "rd"][((v % 100) - 20) % 10] || ["th", "st", "nd", "rd"][v % 100] || "th";
  return `${v}${s}`;
};

/**
 * Initials for the per-page footer. The carrier gives them explicitly on the
 * broker agreement; elsewhere they are derived from the signing name, because
 * every page of these documents carries an initials rule and leaving fourteen
 * of them blank makes the execution look unfinished.
 */
const initialsFrom = (signed, profile) => {
  const explicit = str(signed.values?.arbitrationInitials);
  if (explicit) return explicit.toUpperCase();

  const source = str(signed.signedName) || str(profile.signerName) || str(profile.legalName);
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
};

/** Everything a placement can ask for, assembled once per document. */
const buildContext = ({ profile, signed }) => {
  const when = signed.signedAt ? new Date(signed.signedAt) : new Date();
  const notice = noticeAddressFor(profile) || {};
  const initials = initialsFrom(signed, profile);

  return {
    legalName: str(profile.legalName),
    dba: str(profile.dba),

    businessStreet: joinParts(profile.street, profile.suite),
    businessCity: str(profile.city),
    businessState: str(profile.state),
    businessZip: str(profile.zip),
    businessCityStateZip: joinParts(profile.city, profile.state, profile.zip),
    businessAddress: joinParts(profile.street, profile.suite, profile.city, profile.state, profile.zip),

    mcDot: str(profile.mcNumber) || str(profile.dotNumber),

    noticeName: str(notice.name || profile.legalName),
    noticeStreet: str(notice.street || profile.street),
    noticeCityStateZip: joinParts(
      notice.city || profile.city,
      notice.state || profile.state,
      notice.zip || profile.zip,
    ),
    noticeAttn: str(notice.attn || signed.signedName),

    arbitrationInitials: str(signed.values?.arbitrationInitials).toUpperCase() || initials,
    // `classWaiverInitials` is the key in config/carrierAgreements.js — the
    // class-action waiver is initialled separately from the arbitration one.
    classWaiverInitials: str(signed.values?.classWaiverInitials).toUpperCase() || initials,
    initials,

    signature: str(signed.signedName),
    // The execution block prints "Name:" and "Title:" as labels with no rule,
    // so both are set beside them rather than on one.
    signerName: str(signed.signedName) || str(profile.signerName),
    signerTitle: str(signed.signedTitle) || str(profile.signerTitle),

    signedMonth: when.toLocaleDateString("en-US", { month: "long" }),
    signedDay: String(when.getDate()),
    signedDayNum: String(when.getDate()),
    signedMonthNum: String(when.getMonth() + 1),
    signedDayOrdinal: ORDINAL(when.getDate()),
    signedYear2: String(when.getFullYear()).slice(-2),
    // The contractor agreement prints the time as "____:____ (am/pm)", so the
    // hour and the minutes go either side of its own colon rather than as one
    // string across it.
    signedHour: String(when.getHours() % 12 || 12),
    signedMinute:
      String(when.getMinutes()).padStart(2, "0") + (when.getHours() < 12 ? " AM" : " PM"),
    signedDateShort: when.toLocaleDateString("en-US"),
  };
};

/**
 * Largest size at or below `size` that fits `max` points, down to a floor —
 * a long carrier name should shrink to fit its rule, not run across the printed
 * words after it.
 */
const fitSize = (font, text, size, max) => {
  if (!max) return size;
  let s = size;
  while (s > 6 && font.widthOfTextAtSize(text, s) > max) s -= 0.5;
  return s;
};

/** "2019 Freightliner Cascadia (Unit 104)" — how Appendix A asks for it. */
const equipmentDescription = (item = {}) => {
  const head = [item.year, item.make, item.model].map(str).filter(Boolean).join(" ");
  const unit = str(item.unitNumber);
  const base = head || str(item.equipmentType) || "Equipment";
  return unit ? `${base} (Unit ${unit})` : base;
};

const buildFilledAgreement = async ({
  agreementKey,
  profile = {},
  signed = {},
  equipment = [],
  carrierCode = "carrier",
}) => {
  const agreement = AGREEMENT_BY_KEY.get(agreementKey);
  if (!agreement) throw new Error(`Unknown agreement "${agreementKey}"`);

  const overlay = OVERLAYS[agreementKey];
  if (!overlay) throw new Error(`No overlay map for agreement "${agreementKey}"`);

  const sourcePath = path.join(SOURCE_DIR, overlay.file);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `The blank ${agreement.title} is missing from assets/agreements/${overlay.file}.`,
    );
  }

  ensureDir();

  const pdf = await PDFDocument.load(fs.readFileSync(sourcePath));
  const pages = pdf.getPages();

  if (pages.length !== overlay.pages) {
    throw new Error(
      `${overlay.file} has ${pages.length} pages, expected ${overlay.pages}. ` +
        `The pinned document changed — config/agreementOverlay.js must be re-measured.`,
    );
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const script = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.06, 0.09, 0.16);

  const context = buildContext({ profile, signed });

  const draw = (placement) => {
    const text = str(context[placement.value]);
    if (!text) return;

    const page = pages[placement.page - 1];
    if (!page) return;

    // A signature reads as a signature, not as another typed field.
    const face = placement.signature ? script : font;
    const size = fitSize(face, text, placement.size || SIZE, placement.max);

    page.drawText(text, {
      x: placement.x,
      y: placement.y,
      size,
      font: face,
      color: ink,
    });
  };

  overlay.fields.forEach(draw);

  // ── Appendix A equipment schedule ───────────────────────────────────────
  const table = overlay.equipmentTable;
  if (table && equipment.length) {
    const page = pages[table.page - 1];
    const shown = equipment.slice(0, table.maxRows);

    shown.forEach((item, i) => {
      const y = table.firstRowY - i * table.rowHeight;
      const cells = [
        [equipmentDescription(item), table.columns.description],
        [str(item.vin), table.columns.vin],
      ];

      cells.forEach(([text, col]) => {
        if (!text) return;
        page.drawText(text, {
          x: col.x,
          y,
          size: fitSize(font, text, table.size, col.max),
          font,
          color: ink,
        });
      });
    });

    // The form's own instruction is to use additional copies; saying how many
    // are outstanding is more use than silently dropping them.
    const rest = equipment.length - shown.length;
    if (rest > 0) {
      page.drawText(
        `+ ${rest} further unit${rest === 1 ? "" : "s"} listed on an additional copy of Appendix A.`,
        {
          x: table.columns.description.x,
          y: table.firstRowY - shown.length * table.rowHeight,
          size: table.size - 1,
          font: script,
          color: ink,
        },
      );
    }
  }

  // The initials rule that repeats on every page.
  if (overlay.initialsEveryPage) {
    for (let p = 1; p <= pages.length; p += 1) {
      draw({ ...overlay.initialsEveryPage, page: p });
    }
  }

  pdf.setTitle(`${agreement.title} — ${context.legalName || carrierCode}`);
  pdf.setSubject("Executed carrier agreement");
  pdf.setProducer("FMS");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${carrierCode}-${agreementKey}-agreement-${stamp}.pdf`;
  const filePath = path.join(AGREEMENT_DIR, fileName);

  fs.writeFileSync(filePath, await pdf.save());

  return { fileName, filePath };
};

module.exports = { buildFilledAgreement, buildContext };
