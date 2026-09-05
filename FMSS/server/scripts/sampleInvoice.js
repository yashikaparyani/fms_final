#!/usr/bin/env node
// ─── Sample invoices ──────────────────────────────────────────────────────────
// Renders one of each document the system produces — a customer invoice, a
// carrier bill and a driver settlement — using representative figures.
//
// It exists so the layout can be reviewed and argued about without a database,
// a load, or a customer who is about to receive it. An invoice is the piece of
// this system that leaves the building, and "let me raise a real one to see what
// it looks like" is how a test invoice ends up in somebody's inbox.
//
//   node scripts/sampleInvoice.js [output directory]
//
// No database connection, no tenant context, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { renderInvoicePdf } = require("../services/invoiceDocumentService");

const outDir = process.argv[2] || path.join(__dirname, "..", "uploads", "invoices");

const issuer = {
  name: "S Line Brokerage Inc.",
  code: "NY",
  address: "1200 Harbor Boulevard, Suite 400",
  city: "Newark",
  state: "NJ",
  zip: "07114",
  phone: "(201) 555-0142",
  email: "accounts@slinebrokerage.com",
  website: "SLINETRANSPORT.COM",
};

const daysFromNow = (days) => new Date(Date.now() + days * 86400000);

// ── 1. A customer invoice, part paid ──────────────────────────────────────────
// The common shape: a base rate, four accessorials the job turned out to need,
// an advance taken at booking and a part payment since. Deliberately not a
// single clean line — the layout has to hold up on the invoice that gets queried,
// not the one that does not.
const customerInvoice = {
  invoiceNumber: "LD 0014",
  direction: "AR",
  kind: "LOAD",
  loadId: "LD 0014",
  issuer,
  party: {
    kind: "CUSTOMER",
    name: "Kingsway Logistics LLC",
    code: "CUST-0042",
    address: "55 Dock Street, Elizabeth, NJ 07201",
    email: "ap@kingswaylogistics.com",
    phone: "(908) 555-0199",
  },
  shipTo: {
    name: "Allentown Distribution Center",
    address: "700 Nestle Way, Breinigsville, PA 18031",
  },
  references: [
    { label: "TRAILER #", value: "MSCU7784120" },
    { label: "Ref #", value: "KLG-88214" },
  ],
  issueDate: new Date(),
  dueDate: daysFromNow(30),
  terms: "NET_30",
  lines: [
    {
      label: "Gross Amount",
      kind: "linehaul",
      description: "Port Newark, NJ to Allentown, PA — 40HC MSCU7784120",
      amount: 1450,
    },
    { label: "Fuel Surcharges", kind: "accessorial", quantity: 1, rate: 217.5, amount: 217.5 },
    {
      label: "Detention Charges",
      kind: "accessorial",
      description: "2 hrs beyond the free window at delivery",
      quantity: 2,
      rate: 75,
      amount: 150,
    },
    {
      label: "Chassis Rent",
      kind: "accessorial",
      description: "3 days",
      quantity: 3,
      rate: 35,
      amount: 105,
    },
    { label: "Chassis Split Charges", kind: "accessorial", amount: 85 },
    { label: "Advance Received", kind: "settlement", amount: 500 },
  ],
  subtotal: 2007.5,
  advanceApplied: 500,
  total: 2007.5,
  amountPaid: 250,
  balance: 1257.5,
  status: "PARTIAL",
  memo: "Container MSCU7784120 · Booking KLG-88214 · PO 4471",
  notes: "Proof of delivery emailed separately on the day of delivery.",
};

// ── 2. A carrier bill on the same load ────────────────────────────────────────
const carrierBill = {
  invoiceNumber: "LD 0014-AP1",
  direction: "AP",
  kind: "LOAD",
  loadId: "LD 0014",
  issuer,
  party: {
    kind: "CARRIER",
    name: "Northline Trucking Co.",
    code: "SLINE 00318",
    address: "9 Industrial Way, Kearny, NJ 07032",
    email: "billing@northlinetrucking.com",
    phone: "(973) 555-0164",
  },
  shipTo: {
    name: "Allentown Distribution Center",
    address: "700 Nestle Way, Breinigsville, PA 18031",
  },
  references: [{ label: "TRAILER #", value: "MSCU7784120" }],
  issueDate: new Date(),
  dueDate: daysFromNow(15),
  terms: "NET_15",
  lines: [
    {
      label: "Charge",
      kind: "linehaul",
      description: "Port Newark, NJ to Allentown, PA",
      amount: 950,
    },
    { label: "Fuel Surcharges", kind: "accessorial", amount: 142.5 },
    {
      label: "Detention Charges",
      kind: "accessorial",
      description: "2 hrs at delivery",
      quantity: 2,
      rate: 50,
      amount: 100,
    },
    { label: "Advance Paid", kind: "settlement", amount: 300 },
  ],
  subtotal: 1192.5,
  advanceApplied: 300,
  total: 1192.5,
  amountPaid: 0,
  balance: 892.5,
  status: "SENT",
  memo: "Leg 1 of 1 · POD received",
};

// ── 3. A driver settlement ────────────────────────────────────────────────────
const driverSettlement = {
  invoiceNumber: "LD 0014-AP2",
  direction: "AP",
  kind: "LOAD",
  loadId: "LD 0014",
  issuer,
  party: {
    kind: "DRIVER",
    name: "Ray Mott",
    code: "NY-DR-0027",
    email: "r.mott@example.com",
    phone: "(201) 555-0177",
  },
  issueDate: new Date(),
  dueDate: daysFromNow(7),
  terms: "NET_7",
  lines: [
    {
      label: "Driver Pay",
      kind: "linehaul",
      description: "28% of load revenue — Port Newark to Allentown",
      rate: 28,
      amount: 562.1,
    },
  ],
  subtotal: 562.1,
  advanceApplied: 0,
  total: 562.1,
  amountPaid: 0,
  balance: 562.1,
  status: "DRAFT",
};

// ── 4. The document the layout was cut from ───────────────────────────────────
// Invoice 263710 as the office actually sent it, re-keyed here so the renderer
// can be held against the original page for page. When the layout is changed,
// this is the sample to open first: every measurement in
// services/invoiceDocumentService.js was taken off this bill, and anything that
// no longer lands where the original put it is a regression rather than a
// redesign.
//
// The line breaks inside the description and the billing address are the
// original's own, not the wrap — they are what makes the comparison exact.
const referenceInvoice = {
  invoiceNumber: "263710",
  direction: "AR",
  kind: "LOAD",
  loadId: "263710",
  issuer: {
    name: "S LINE TRANSPORTATION INC",
    address: "890 bridge way cir",
    city: "El Sobrante",
    state: "CA",
    zip: "94803",
    phone: "+1 (510) 701-2148",
    email: "laxport@slinetransport.com",
    website: "SLINETRANSPORT.COM",
  },
  party: {
    kind: "CUSTOMER",
    name: "MITSUBISHI LOGISTICS AMERICA CORPORATION",
    address:
      "1633 BAYSHORE HWY, SUITE 370\nBURLINGAME, CA\n94010, TEL: 650-697-0700",
  },
  shipTo: {
    name: "PRISIM LOGISTICS-",
    address: "18284 S HARLAN ROAD, LATHROP, CA, 95330",
  },
  references: [
    { label: "TRAILER #", value: "TCKU6245871" },
    { label: "Ref #", value: "SSFOSE26255224" },
  ],
  issueDate: new Date("2026-08-25T00:00:00Z"),
  dueDate: new Date("2026-09-24T00:00:00Z"),
  terms: "NET_30",
  lines: [
    {
      label: "PICK UP LOAD",
      kind: "linehaul",
      description:
        "PICK UP LOAD FROM PRISIM LOGISTICS-\n" +
        "18284 S HARLAN ROAD, LATHROP, CA, 95330 TO BEN E NUTTER TERMINAL.\n" +
        "5190 7TH STREET, OAKLAND,, CA, 94607",
      quantity: 1,
      rate: 700,
      amount: 700,
    },
    {
      label: "CHASSIS RENT",
      kind: "accessorial",
      description: "CHASSIS RENT",
      quantity: 1,
      rate: 35,
      amount: 35,
    },
    {
      label: "PRE PULL",
      kind: "accessorial",
      description: "PRE PULL",
      quantity: 1,
      rate: 50,
      amount: 50,
    },
  ],
  subtotal: 785,
  advanceApplied: 0,
  total: 785,
  amountPaid: 0,
  balance: 785,
  status: "SENT",
};

const SAMPLES = [
  ["sample-customer-invoice.pdf", customerInvoice],
  ["sample-carrier-bill.pdf", carrierBill],
  ["sample-driver-settlement.pdf", driverSettlement],
  ["sample-reference-263710.pdf", referenceInvoice],
];

const main = async () => {
  fs.mkdirSync(outDir, { recursive: true });

  for (const [fileName, invoice] of SAMPLES) {
    const buffer = await renderInvoicePdf(invoice);
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, buffer);
    console.log(`${filePath}  (${(buffer.length / 1024).toFixed(1)} kB)`);
  }

  console.log(`\n${SAMPLES.length} sample documents written.`);
};

main().catch((error) => {
  console.error("Could not render the samples:", error.message);
  process.exitCode = 1;
});
