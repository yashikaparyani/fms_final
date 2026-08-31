// ─── Carrier agreement field schema ───────────────────────────────────────────
// Every blank on the documents a carrier has to sign, described once here so
// three things cannot drift apart: the form the carrier fills in, the validation
// on submit, and the PDF that gets generated from the answers.
//
// The documents:
//
//   broker     — S LINE BROKERAGE INC., Transportation Brokerage Agreement.
//                Between the broker and the CARRIER. 15 pages; the blanks are on
//                p1 (parties, DOT/MC), p12 (notice address), p13–14 (arbitration
//                and class-waiver initials) and p15 (execution).
//
//   contractor — S LINE TRANSPORTATION INC. (USDOT 1106322), Independent
//                Contractor Transportation Agreement, 49 CFR Part 376. Between
//                the carrier and the CONTRACTOR. Blanks on p1 (parties, date and
//                time), p13 (execution, SS#/EIN, driver licence) and Appendix A
//                (equipment: make/model/year and VIN).
//
//   einVerification — our own one-page taxpayer certification. Unlike the two
//                above there is no counterparty original behind it, so it is
//                generated rather than overlaid; see its entry below.
//
// The field sets overlap almost entirely — both want the legal name, the
// address, the signer. `sharedProfile` below is that common core, asked once and
// written into every document. Only the genuinely document-specific blanks are
// listed per agreement, which is why the carrier fills in one form and gets
// finished contracts rather than typing their address three times.
// ─────────────────────────────────────────────────────────────────────────────

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

/**
 * The core the carrier types once.
 *
 * `paper` on each field names where it lands on the printed agreements, so the
 * next person to touch the PDF generator can see what a field is for without
 * opening the originals.
 */
const SHARED_PROFILE = [
  {
    section: "Carrier identity",
    fields: [
      {
        key: "legalName",
        label: "Legal company name",
        type: "text",
        required: true,
        placeholder: "Swift Haulage LLC",
        help: "Exactly as it appears on your operating authority — this is the name that goes on both contracts.",
        paper: "Broker p1 (CARRIER) · Contractor p1 (CONTRACTOR)",
      },
      {
        key: "dba",
        label: "Doing business as (if different)",
        type: "text",
        paper: "Broker p1",
      },
      {
        key: "entityType",
        label: "Entity type",
        type: "select",
        required: true,
        options: [
          "Sole Proprietor",
          "Partnership",
          "LLC",
          "S Corporation",
          "C Corporation",
        ],
      },
      {
        key: "mcNumber",
        label: "MC number",
        type: "text",
        required: true,
        placeholder: "MC-123456",
        help: "Your FMCSA docket number. The broker agreement records it in Recital B.",
        paper: "Broker p1 recital B (DOT/MC #)",
      },
      {
        key: "dotNumber",
        label: "USDOT number",
        type: "text",
        required: true,
        placeholder: "1234567",
        paper: "Broker p1 recital B",
      },
      {
        key: "taxIdType",
        label: "Tax ID type",
        type: "select",
        required: true,
        options: ["EIN", "SSN"],
        help: "The contractor agreement asks for an SS# or EIN on the signature page.",
        paper: "Contractor p13",
      },
      {
        key: "taxId",
        label: "EIN / SSN",
        type: "text",
        required: true,
        sensitive: true,
        placeholder: "12-3456789",
        paper: "Contractor p13",
      },
      {
        key: "scac",
        label: "SCAC code",
        type: "text",
        help: "Optional. Only if you have been issued one.",
      },
    ],
  },
  {
    section: "Principal place of business",
    help: "The address printed on page 1 of both agreements.",
    fields: [
      { key: "street", label: "Street", type: "text", required: true, paper: "Both p1" },
      { key: "suite", label: "Suite / unit", type: "text" },
      { key: "city", label: "City", type: "text", required: true, paper: "Both p1" },
      {
        key: "state",
        label: "State",
        type: "select",
        required: true,
        options: US_STATES,
        paper: "Both p1",
      },
      { key: "zip", label: "ZIP", type: "text", required: true, paper: "Both p1" },
    ],
  },
  {
    section: "Notice address",
    // The broker agreement (p12) has its own notice block, because legal notice
    // often goes to a lawyer or a head office rather than the yard. Defaulting it
    // to the business address is right for most carriers and saves retyping.
    help: "Where formal legal notices should be sent. Leave blank to use the business address above.",
    fields: [
      { key: "noticeName", label: "Name", type: "text", paper: "Broker p12" },
      { key: "noticeAttn", label: "Attention", type: "text", paper: "Broker p12" },
      { key: "noticeStreet", label: "Street", type: "text", paper: "Broker p12" },
      { key: "noticeCity", label: "City", type: "text", paper: "Broker p12" },
      { key: "noticeState", label: "State", type: "select", options: US_STATES, paper: "Broker p12" },
      { key: "noticeZip", label: "ZIP", type: "text", paper: "Broker p12" },
    ],
  },
  {
    section: "Authorised signer",
    help: "The person signing on behalf of the carrier. Both agreements require them to confirm they are authorised to bind the company.",
    fields: [
      {
        key: "signerName",
        label: "Full name",
        type: "text",
        required: true,
        paper: "Broker p15 · Contractor p13",
      },
      {
        key: "signerTitle",
        label: "Title",
        type: "text",
        required: true,
        placeholder: "Owner / President",
        paper: "Broker p15 · Contractor p13",
      },
      { key: "signerEmail", label: "Email", type: "email", required: true },
      { key: "signerPhone", label: "Phone", type: "tel", required: true },
      {
        key: "signerLicenseNumber",
        label: "Driver licence number",
        type: "text",
        help: "The contractor agreement asks for the signer's licence number and a copy of the licence.",
        paper: "Contractor p13",
      },
      {
        key: "signerLicenseState",
        label: "Licence issuing state",
        type: "select",
        options: US_STATES,
        paper: "Contractor p13",
      },
    ],
  },
  {
    section: "Remittance",
    help: "Where settlements are paid. Not part of the signed agreements — held with them so the file is complete.",
    fields: [
      { key: "remitPayeeName", label: "Payee name", type: "text" },
      {
        key: "remitMethod",
        label: "Payment method",
        type: "select",
        options: ["ACH", "Check", "Wire", "Factoring company"],
      },
      { key: "factoringCompany", label: "Factoring company", type: "text" },
      { key: "remitEmail", label: "Remittance email", type: "email" },
    ],
  },
];

// ─── Per-document blanks ──────────────────────────────────────────────────────

const AGREEMENTS = [
  {
    key: "broker",
    title: "Transportation Brokerage Agreement",
    counterparty: "S LINE BROKERAGE, INC.",
    counterpartyAddress: "9972 Phoenician Way, Sacramento, CA 95829-8006",
    counterpartyDocket: "MC-1496045",
    pages: 15,
    summary:
      "The broker–carrier contract: who is liable for the cargo, what insurance you must carry, how you get paid, and the agreement to arbitrate rather than litigate.",
    // Blanks that are genuinely specific to this document — everything else is
    // filled from the shared profile above.
    fields: [
      {
        key: "arbitrationInitials",
        label: "Arbitration waiver — your initials",
        type: "initials",
        required: true,
        // ¶49 on p13: initialling is the act of agreeing to give up a jury
        // trial. It is deliberately separate from the signature, and separate
        // from the class waiver below, because the paper agreement treats them
        // as two distinct waivers.
        help: "By initialling you agree that disputes go to binding arbitration in Sacramento County, California, and that you are giving up the right to a jury trial (¶49).",
        paper: "p13",
      },
      {
        key: "classWaiverInitials",
        label: "Class action waiver — your initials",
        type: "initials",
        required: true,
        help: "By initialling you agree to bring any dispute individually rather than as part of a class or collective action (¶50).",
        paper: "p13",
      },
    ],
    acknowledgements: [
      "I have read the Transportation Brokerage Agreement in full.",
      "I confirm the carrier holds a satisfactory USDOT safety rating (¶22).",
      "I confirm I will not sub-contract, broker or re-tender freight arranged under this agreement (¶19).",
      "I am authorised to sign this agreement on behalf of the carrier.",
    ],
  },
  {
    key: "contractor",
    title: "Independent Contractor Transportation Agreement",
    counterparty: "S LINE TRANSPORTATION, INC. (USDOT 1106322)",
    counterpartyAddress: "780 B West Grand Ave, Oakland, CA 94612",
    pages: 15,
    summary:
      "The 49 CFR Part 376 equipment lease: the equipment you are putting into service, how compensation and charge-backs work, and your insurance obligations as an independent contractor.",
    fields: [
      {
        key: "arbitrationInitials",
        label: "Arbitration waiver — your initials",
        type: "initials",
        required: true,
        help: "Binding arbitration rather than a court, and no jury trial (¶40).",
        paper: "p10",
      },
      {
        key: "operatingLocation",
        label: "Operating location",
        type: "text",
        required: true,
        placeholder: "Long Beach, CA",
        help: "Which yard you run out of — it selects the Appendix B rate schedule that applies to you.",
        paper: "Appendix B",
      },
    ],
    // Appendix A is a repeating table, not a set of single blanks, so it gets
    // its own shape rather than being squeezed into `fields`.
    appendixA: {
      title: "Appendix A — Acknowledgement of Contractor's Equipment",
      help: "Every tractor and trailer you are putting into service under this agreement. Add as many rows as you need.",
      columns: [
        { key: "unitNumber", label: "Unit #", type: "text" },
        {
          key: "equipmentType",
          label: "Type",
          type: "select",
          required: true,
          options: ["Tractor", "Trailer", "Chassis", "Straight Truck"],
        },
        { key: "make", label: "Make", type: "text", required: true },
        { key: "model", label: "Model", type: "text", required: true },
        { key: "year", label: "Year", type: "number", required: true },
        {
          key: "vin",
          label: "VIN",
          type: "text",
          required: true,
          // A VIN is 17 characters and never contains I, O or Q — those were
          // excluded by the standard precisely because they are misread as 1 and
          // 0. Checking it here catches a transcription error while the truck is
          // still in front of the person typing.
          pattern: "^[A-HJ-NPR-Z0-9]{17}$",
          patternMessage: "A VIN is 17 characters and does not use the letters I, O or Q.",
        },
        { key: "plate", label: "Plate", type: "text" },
        { key: "plateState", label: "Plate state", type: "select", options: US_STATES },
      ],
    },
    acknowledgements: [
      "I have read the Independent Contractor Transportation Agreement in full.",
      "I confirm I hold title to, or exclusive use of, the equipment listed in Appendix A (¶2).",
      "I confirm I will maintain Workers' Compensation cover for myself and my employees (¶38).",
      "I understand I am an independent contractor and not an employee (¶6).",
      "I am authorised to sign this agreement on behalf of the contractor.",
    ],
  },
  {
    // ── EIN verification ────────────────────────────────────────────────────
    // Not a counterparty contract like the two above — there is no fifteen-page
    // original behind it, so it has no entry in config/agreementOverlay.js and
    // is generated from scratch by services/agreementDocumentService.js.
    //
    // Its job is to make the tax ID an attested fact rather than a typed field.
    // The number reaches settlements, 1099 filings and the carrier's remittance
    // detail, and a transposed digit is found months later by the IRS rather
    // than by anybody here. Asking the carrier to state it again and sign for it
    // catches the mistake at onboarding, and leaves a signed record of who said
    // it if the filing is ever questioned.
    key: "einVerification",
    title: "EIN Verification and Taxpayer Certification",
    counterparty: "S LINE BROKERAGE, INC.",
    counterpartyAddress: "9972 Phoenician Way, Sacramento, CA 95829-8006",
    counterpartyDocket: "MC-1496045",
    pages: 1,
    summary:
      "Confirms the Employer Identification Number we will report your settlements under, and certifies it is the number the IRS issued to the legal name on your operating authority.",
    fields: [
      {
        key: "einNumber",
        label: "EIN",
        type: "text",
        required: true,
        sensitive: true,
        placeholder: "12-3456789",
        // Nine digits, conventionally written XX-XXXXXXX. The hyphen is
        // optional on the way in and normalised on the way out.
        pattern: "^\\d{2}-?\\d{7}$",
        patternMessage: "An EIN is nine digits, written 12-3456789.",
        help: "Type it again from your IRS notice rather than copying it from the form above — retyping is what makes this a verification.",
      },
      {
        key: "einLegalName",
        label: "Name exactly as shown on your IRS notice",
        type: "text",
        required: true,
        placeholder: "SWIFT HAULAGE LLC",
        help: "From your CP 575 or 147C letter. It must be the name the EIN was issued to, which is not always the name you trade under.",
      },
      {
        key: "einCertificationInitials",
        label: "Taxpayer certification — your initials",
        type: "initials",
        required: true,
        help: "By initialling you certify, under penalty of perjury, that the number above is your correct taxpayer identification number and that you are not subject to backup withholding.",
      },
    ],
    acknowledgements: [
      "The EIN stated above is the number the IRS issued to the legal name shown, and I have read it from the IRS notice itself.",
      "I understand this number will be used to report payments made to me, including on any Form 1099 issued.",
      "I will notify the office in writing if this number or the legal name it was issued to changes.",
      "I am authorised to certify this on behalf of the carrier.",
    ],
  },
];

const AGREEMENT_BY_KEY = new Map(AGREEMENTS.map((a) => [a.key, a]));

const AGREEMENT_KEYS = AGREEMENTS.map((a) => a.key);

// ─── Appendix A equipment ─────────────────────────────────────────────────────

/** The equipment table's column spec, wherever it is rendered or checked. */
const EQUIPMENT_COLUMNS = AGREEMENT_BY_KEY.get("contractor").appendixA.columns;

const VIN_COLUMN = EQUIPMENT_COLUMNS.find((c) => c.key === "vin");
const VIN_PATTERN = new RegExp(VIN_COLUMN.pattern);

/** True for a VIN that is the right shape. Blank is not a valid VIN. */
const isValidVin = (value) => VIN_PATTERN.test(String(value || "").trim().toUpperCase());

/**
 * VIN problems across a set of Appendix A rows, as `{ index, message }`.
 *
 * `requireVin` separates the two moments this is asked. While the carrier is
 * still typing, a row they have not reached the VIN on yet is unfinished, not
 * wrong, and refusing to save it loses the rest of what they typed. At signing
 * the schedule is being executed, so a blank VIN is a blank in a contract and
 * has to be filled.
 */
const equipmentVinProblems = (rows = [], { requireVin = false } = {}) => {
  const problems = [];

  rows.forEach((row, index) => {
    const vin = String(row?.vin || "").trim();

    if (!vin) {
      if (requireVin) {
        problems.push({ index, message: `Row ${index + 1}: a VIN is required.` });
      }
      return;
    }

    if (!isValidVin(vin)) {
      // The count is the mistake nine times out of ten — a transposed or
      // dropped character — so it is named before the alphabet rule.
      const detail =
        vin.length === 17
          ? VIN_COLUMN.patternMessage
          : `it has ${vin.length} character${vin.length === 1 ? "" : "s"}, not 17.`;
      problems.push({ index, message: `Row ${index + 1}: ${detail}` });
    }
  });

  return problems;
};

/** Every required shared field, flattened — used by the completeness check. */
const requiredProfileFields = () =>
  SHARED_PROFILE.flatMap((section) =>
    section.fields.filter((f) => f.required).map((f) => ({ ...f, section: section.section })),
  );

/**
 * What is still missing before `profile` can produce a signable agreement.
 *
 * Returns labels rather than keys: this list is shown to the carrier, and
 * "Legal company name" is the only version of "legalName" they can act on.
 */
const profileGaps = (profile = {}) =>
  requiredProfileFields()
    .filter((field) => !String(profile[field.key] ?? "").trim())
    .map((field) => field.label);

/** The notice address, falling back to the business address when left blank. */
const noticeAddressFor = (profile = {}) => ({
  name: profile.noticeName || profile.legalName || "",
  attn: profile.noticeAttn || profile.signerName || "",
  street: profile.noticeStreet || profile.street || "",
  city: profile.noticeCity || profile.city || "",
  state: profile.noticeState || profile.state || "",
  zip: profile.noticeZip || profile.zip || "",
});

/** One-line business address, the form both agreements print it in. */
const businessAddressLine = (profile = {}) =>
  [
    [profile.street, profile.suite].filter(Boolean).join(" "),
    profile.city,
    profile.state,
    profile.zip,
  ]
    .filter(Boolean)
    .join(", ");

const catalog = () => ({
  sharedProfile: SHARED_PROFILE,
  agreements: AGREEMENTS,
  states: US_STATES,
});

module.exports = {
  SHARED_PROFILE,
  AGREEMENTS,
  AGREEMENT_BY_KEY,
  AGREEMENT_KEYS,
  EQUIPMENT_COLUMNS,
  VIN_COLUMN,
  isValidVin,
  equipmentVinProblems,
  US_STATES,
  requiredProfileFields,
  profileGaps,
  noticeAddressFor,
  businessAddressLine,
  catalog,
};
