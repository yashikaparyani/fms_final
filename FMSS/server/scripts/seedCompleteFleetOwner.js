// Create one fleet owner whose onboarding is already finished, so the account
// can be signed into and used straight away without the paperwork wizard.
//
//   node scripts/seedCompleteFleetOwner.js
//   node scripts/seedCompleteFleetOwner.js --email x@y.com --password Secret@123
//
// Everything the carrier would normally hand over is filled in: the company
// profile, Appendix A equipment, all three signed agreements (real PDFs, built
// by the same services the signing endpoint uses), two drivers with licence
// copies, every insurance coverage with a certificate, and an office approval.
// Refuses to run if the email is already taken — it never edits an existing
// account.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const mongoose = require("mongoose");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { withTenant, runUnscoped } = require("../utils/tenantContext");

const User = require("../models/User");
const Branch = require("../models/Branch");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const CarrierOnboarding = require("../models/CarrierOnboarding");
const { AGREEMENTS } = require("../config/carrierAgreements");
const { COVERAGES, shortfallsFor, missingRequired } = require("../config/insuranceCoverages");
const { OVERLAYS } = require("../config/agreementOverlay");
const { buildFilledAgreement } = require("../services/agreementOverlayService");
const { buildAgreementDocument } = require("../services/agreementDocumentService");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const EMAIL = String(arg("email", "demo.fleetowner@bestloaders.com")).toLowerCase();
const PASSWORD = arg("password", "Fleet@12345");
const UPLOADS = path.join(__dirname, "..", "uploads");

// ── small generated files ─────────────────────────────────────────────────────

/** A one-page PDF with a few lines of text, written under uploads/. */
const writePdf = async (fileName, title, lines) => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText(title, { x: 50, y: 730, size: 18, font: bold });
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 690 - i * 20, size: 11, font }));
  fs.mkdirSync(UPLOADS, { recursive: true });
  const filePath = path.join(UPLOADS, fileName);
  fs.writeFileSync(filePath, await pdf.save());
  return {
    fileName,
    originalName: fileName,
    filePath: path.join("uploads", fileName),
    mimeType: "application/pdf",
    size: fs.statSync(filePath).size,
    uploadedAt: new Date(),
  };
};

/** A drawn-looking signature as a PNG data URL, the shape the signing pad sends. */
const signaturePng = () => {
  const w = 300, h = 80;
  const px = Buffer.alloc(w * h * 4, 0);
  const dot = (x, y) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const o = (yy * w + xx) * 4;
      px[o] = 20; px[o + 1] = 30; px[o + 2] = 90; px[o + 3] = 255;
    }
  };
  for (let t = 0; t <= 1; t += 0.0005) {
    const x = 15 + t * 270;
    dot(x, 40 + Math.sin(t * 18) * 18 * (1 - t * 0.6) + Math.cos(t * 7) * 6);
  }
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
};

// ── the carrier ───────────────────────────────────────────────────────────────

const CARRIER = "Demo Freight Lines LLC";
const TAX_ID = "84-1234567";
const SIGNER = "Alex Morgan";

const PROFILE = {
  legalName: CARRIER,
  dba: "Demo Freight",
  entityType: "LLC",
  mcNumber: "MC-998877",
  dotNumber: "3456789",
  taxIdType: "EIN",
  taxId: TAX_ID,
  scac: "DMFL",
  street: "1200 Harbor Blvd",
  suite: "Suite 210",
  city: "Long Beach",
  state: "CA",
  zip: "90802",
  noticeName: CARRIER,
  noticeAttn: SIGNER,
  noticeStreet: "1200 Harbor Blvd",
  noticeCity: "Long Beach",
  noticeState: "CA",
  noticeZip: "90802",
  signerName: SIGNER,
  signerTitle: "Owner / President",
  signerEmail: EMAIL,
  signerPhone: "5625550101",
  signerLicenseNumber: "D1234567",
  signerLicenseState: "CA",
  remitPayeeName: CARRIER,
  remitMethod: "ACH",
  factoringCompany: "",
  remitEmail: EMAIL,
};

const EQUIPMENT = [
  { unitNumber: "T-101", equipmentType: "Tractor", make: "Freightliner", model: "Cascadia", year: 2021, vin: "1FUJHHDR1MLMA1234", plate: "8ABC123", plateState: "CA" },
  { unitNumber: "C-201", equipmentType: "Chassis", make: "Hyundai Translead", model: "40ft Gooseneck", year: 2020, vin: "3H3C402C2LT000123", plate: "4XYZ789", plateState: "CA" },
];

const AGREEMENT_VALUES = {
  broker: { arbitrationInitials: "AM", classWaiverInitials: "AM" },
  contractor: { arbitrationInitials: "AM", operatingLocation: "Long Beach, CA" },
  einVerification: { einNumber: TAX_ID, einLegalName: CARRIER.toUpperCase(), einCertificationInitials: "AM" },
};

const inYears = (n) => new Date(Date.now() + n * 365 * 24 * 60 * 60 * 1000);

/** A policy for each coverage that meets or beats every contractual minimum. */
const policies = () =>
  COVERAGES.map((c, i) => ({
    coverage: c.key,
    insurerName: "Progressive Commercial",
    amBestRating: "A+",
    policyNumber: `PC-${2026}${String(i + 1).padStart(4, "0")}`,
    limit: c.statutory ? undefined : Math.max(c.minLimit || 0, 1000000),
    aggregateLimit: Math.max(c.minAggregate || 0, 2000000),
    deductible: 2500,
    effectiveDate: new Date(),
    expiryDate: inYears(1),
    namedInsured: CARRIER,
    additionalInsured: true,
    lossPayee: true,
    waiverOfSubrogation: true,
    mcs90Attached: c.key === "autoLiability" || c.key === "pollutionLiability",
    noticeOfCancellationDays: 30,
    notes: "",
  }));

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");
  await mongoose.connect(uri);

  const { branch, reviewer } = await runUnscoped(async () => {
    if (await User.exists({ email: EMAIL })) {
      throw new Error(`${EMAIL} already has an account — nothing was changed.`);
    }
    const branch = await Branch.findOne({ active: true }).sort({ createdAt: 1 });
    if (!branch) throw new Error("No active location to file the carrier under.");
    const reviewer = await User.findOne({ role: "admin", locations: branch._id });
    return { branch, reviewer };
  });

  await withTenant({ locationId: branch._id }, async () => {
    const fleetOwner = await FleetOwner.create({
      carrierName: CARRIER,
      phone: PROFILE.signerPhone,
      mcLicense: PROFILE.mcNumber,
      dotLicense: PROFILE.dotNumber,
      taxId: TAX_ID,
      contactPersons: [
        { name: SIGNER, phone: PROFILE.signerPhone, email: EMAIL, isPrimary: true },
        { name: "Jamie Lee (Dispatch)", phone: "5625550102", email: "dispatch.demo@bestloaders.com", isPrimary: false },
      ],
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: CARRIER,
      lastName: "Fleet",
      email: EMAIL,
      password: PASSWORD,
      phone: PROFILE.signerPhone,
      role: "fleetOwner",
      isVerified: true,
      locations: [branch._id],
      defaultLocation: branch._id,
    });
    fleetOwner.userId = user._id;
    await fleetOwner.save();

    const code = fleetOwner.fleetOwnerCode;

    for (const [i, d] of [
      { name: "Carlos Rivera", phone: "5625550111", email: "driver1.demo@bestloaders.com", licenseNumber: "C7654321" },
      { name: "Priya Shah", phone: "5625550112", email: "driver2.demo@bestloaders.com", licenseNumber: "C2468013" },
    ].entries()) {
      const licenseDocument = await writePdf(`${code}-driver${i + 1}-licence.pdf`, "Commercial Driver Licence (copy)", [
        `Name: ${d.name}`, `Licence #: ${d.licenseNumber}`, "State: CA  Class: A", "Endorsements: H, N, T, X",
        `Expires: ${inYears(3).toISOString().slice(0, 10)}`,
      ]);
      await Driver.create({
        ...d,
        fleetOwner: fleetOwner._id,
        licenseState: "CA",
        licenseClass: "A",
        licenseExpiry: inYears(3),
        licenseDocument,
        endorsements: ["H", "N", "T", "X"],
        medicalCardExpiry: inYears(2),
        payType: "PERCENTAGE",
        payRate: 75,
        notes: "Demo driver",
        createdBy: reviewer?._id,
      });
    }

    const onboarding = new CarrierOnboarding({
      fleetOwner: fleetOwner._id,
      userId: user._id,
      profile: PROFILE,
      equipment: EQUIPMENT,
      currentStep: "review",
    });

    const signatureData = signaturePng();
    for (const agreement of AGREEMENTS) {
      const signed = {
        key: agreement.key,
        values: AGREEMENT_VALUES[agreement.key],
        acknowledgements: agreement.acknowledgements,
        signedName: SIGNER,
        signedTitle: PROFILE.signerTitle,
        signatureData,
        signedAt: new Date(),
        signedIp: "127.0.0.1",
        signedUserAgent: "seedCompleteFleetOwner",
        version: 1,
      };
      const build = OVERLAYS[agreement.key] ? buildFilledAgreement : buildAgreementDocument;
      const doc = await build({
        agreementKey: agreement.key,
        profile: PROFILE,
        signed,
        equipment: EQUIPMENT,
        carrierCode: code,
      });
      signed.document = {
        fileName: doc.fileName,
        originalName: `${agreement.title}.pdf`,
        filePath: doc.filePath,
        mimeType: "application/pdf",
        size: fs.statSync(doc.filePath).size,
        uploadedAt: new Date(),
        uploadedBy: user._id,
      };
      onboarding.agreements.push(signed);
    }

    const filed = policies();
    const certificate = await writePdf(`${code}-certificate-of-insurance.pdf`, "Certificate of Liability Insurance (ACORD 25)", [
      `Insured: ${CARRIER}`, "Producer: Harbor Insurance Agency", "Certificate holder: S LINE BROKERAGE, INC.",
      ...filed.map((p) => `${p.coverage}: ${p.policyNumber}  limit ${p.limit ?? "statutory"}`),
    ]);
    onboarding.insurance = {
      agencyName: "Harbor Insurance Agency",
      agentName: "Morgan Blake",
      agentEmail: "agent.demo@bestloaders.com",
      agentPhone: "5625550199",
      invitedAt: new Date(),
      invitedBy: user._id,
      submittedAt: new Date(),
      submittedByName: "Morgan Blake",
      submittedByEmail: "agent.demo@bestloaders.com",
      policies: filed,
      certificate: { ...certificate, uploadedBy: user._id },
      shortfalls: [...filed.flatMap((p) => shortfallsFor(p)), ...missingRequired(filed)],
    };

    onboarding.submittedAt = new Date();
    onboarding.status = "APPROVED";
    onboarding.reviewedAt = new Date();
    onboarding.reviewedBy = reviewer?._id;
    onboarding.reviewNote = "All documents on file.";
    await onboarding.save();

    console.log(JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      fleetOwnerCode: code,
      location: branch.name,
      agreementsSigned: onboarding.agreements.length,
      agreementsComplete: onboarding.agreementsComplete(),
      insuranceComplete: onboarding.insuranceComplete(),
      policies: filed.length,
      shortfalls: onboarding.insurance.shortfalls,
      status: onboarding.status,
    }, null, 2));
  });

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
