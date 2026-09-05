# Accounting

Receivables, payables, invoices, payments and the reports built on them.

---

## The shape of it

There are two layers, and keeping them apart is what the whole design turns on.

**The ledger** lives on the load (`Load.accounting`). It is working data: staff edit
it as the job runs, add a detention charge on Tuesday, correct a chassis rate on
Thursday. It answers *what is this load worth*.

**The documents** live in their own collection (`Invoice`). An invoice is a
snapshot taken from the ledger and frozen, because once it has been sent to a
customer it is a claim on them and must say tomorrow exactly what it said when
they received it. It answers *what have we actually billed, and what came back*.

Reporting only one of those hides the gap between them — revenue earned but never
invoiced is the commonest way a brokerage loses money it already made — so every
report shows both.

```
Load.accounting.receivables ──raise──▶ Invoice (AR)  ◀──settles── Payment (RECEIVED)
Load.accounting.payables    ──raise──▶ Invoice (AP)  ◀──settles── Payment (PAID)
Load.accounting.payroll     ──raise──▶ Invoice (AP, DRIVER)
```

---

## Numbering

| Document | Number | Example |
|---|---|---|
| Customer invoice | The load number itself | `LD 0014` |
| Carrier bill | Load number + `-APn`, one per leg | `LD 0014-AP1`, `LD 0014-AP2` |
| Driver settlement | Same series as carrier bills | `LD 0014-AP3` |
| Manual invoice | Own branch series | `NY-MI-0001` |
| Receipt (money in) | Own branch series | `NY-RCP-0001` |
| Payment (money out) | Own branch series | `NY-PMT-0001` |

The customer invoice **is** the load number so nobody translates between two
schemes when a customer calls about a payment. Carrier bills hang off the same
number: a split load pays two carriers separately and each needs its own
document, but both stay one glance from the load they came off.

Manual invoices take their own series precisely so it is obvious on the register
that one was typed rather than derived.

---

## The arithmetic

One rule, in one file (`server/config/chargeTypes.js`), and nothing anywhere adds
up money by hand.

```
total   = linehaul + Σ accessorials
settled = Σ settlements          (advances — money that already moved)
balance = total − settled − payments recorded
```

**An advance is not a charge.** Adding it to the total either double-counts the
money or inflates revenue, depending on the sign somebody entered it with.
Getting this wrong makes margin, payroll and the P&L quietly incorrect, which is
why it is stated once and every caller defers to it.

Ledger lines look their kind up from the catalog by `chargeType`; invoice lines
carry their own `kind`, because a frozen document must not change its mind if the
catalog is edited next year — and a hand-typed line has no catalog entry at all.
Both routes end in `totalsByKind`, so there is still exactly one implementation.

---

## Raising invoices

From a load's accounting screen: **Raise invoices**. It creates, in one action:

- the customer invoice, from the receivable lines
- one carrier bill per leg, from that carrier's own payable lines
- the driver settlement, from the stored payroll figure

Payable lines each name the carrier they belong to, so a two-carrier load
produces two bills that add up to the ledger and neither carrier can see the
other's rate. A leg with an agreed rate but nothing costed yet is billed at the
agreed rate — a $0 bill on a leg everybody knows costs $900 is the number that
then flows into the margin on every report.

**Pressing it twice is the expected workflow.** Drafts are refreshed from the
ledger rather than duplicated, so generate → spot a missing charge → fix →
generate again does the right thing.

### What freezes

A **sent** or **part-paid** invoice is never rewritten. Editing it means voiding
it and raising another, which leaves both documents on the record. Voiding is
refused while payments stand against it — money is unwound first, or the payment
register and the invoice register stop reconciling.

Voiding is never a delete. The number stays in the series; a gap in invoice
numbers is the first thing an auditor asks about.

---

## Recording payments

Every payment carries the reference that proves it happened, and **what that
reference is called depends on the method**:

| Method | Document number | Required |
|---|---|---|
| Check | Check Number | yes |
| ACH / EFT | Trace Number | yes |
| Wire Transfer | Wire Reference / IMAD | yes |
| Credit / Debit Card | Authorisation Code | yes |
| Cash | Receipt Number | no |
| Other | Reference Number | yes |

Cash is the only exception — there is no third party issuing a number, and a
required field there produces an invented one. The rules live in
`server/config/paymentMethods.js`, so the form and the API refuse the same rows.

A payment row without its reference cannot be matched to a line on a bank
statement, which is the only reason to keep the row at all.

### Overpayments and reversals

An amount larger than the balance is **refused**: almost always a typo or a
payment applied to the wrong invoice, and accepting it creates a negative balance
every report then has to special-case.

A payment is **reversed, never deleted** — a bounced check, a recalled wire, a
keying error. The invoice goes from paid back to outstanding, and the only
acceptable answer to "why" is a row that says so. `amountPaid` is always re-added
from the payment collection rather than incremented, so a reversal lands on the
right number instead of drifting.

---

## Reminders

A nightly sweep at 09:00 chases unpaid **customer** invoices on a ladder measured
from the due date:

```
−3 days   courtesy note, about to fall due
+1 day    now late
+7 days   a week late
+15 days  escalated wording
+30 days  final reminder
then every 30 days
```

The wording escalates on its own — see `REMINDER_TONE`. At most one reminder per
invoice per day, however many times the sweep runs; getting that wrong does not
produce a bug report, it produces a customer receiving four identical demands in
one morning.

Staff can also send one by hand from any invoice. Every attempt is recorded
including the failures — an address that bounces otherwise looks exactly like an
account nobody chased.

Carrier bills are **not** auto-chased. Emailing a carrier a reminder that we have
not paid them is not a thing anybody wants automated; they surface on the
payables register for a human.

---

## Screens

| Screen | Path | What it answers |
|---|---|---|
| Load accounting | `accounting/:loadId` | This load's ledgers, its invoices and its payments |
| Invoices | `accounting/invoices` | Everything raised, AR and AP, filtered to what needs action |
| Invoice | `accounting/invoices/:id` | One document — send, chase, take payment, PDF, void |
| New invoice | `accounting/invoices/new` | Billing with no load behind it |
| Customer accounts | `accounting/customers` | Who owes what, how old it is, statements |
| Load ledger | `accounting/load-ledger` | Receivable against payable per load, every extra charge itemised |

All back office only. A customer must not see what the carrier was paid and a
carrier must not see what the customer was billed — the margin between those two
numbers is the brokerage's business. There is no filtered version of these
endpoints for other roles; there is no endpoint at all.

---

## The document

`server/services/invoiceDocumentService.js` renders the PDF. It is laid out the
way an accounts-payable clerk with forty others on their desk expects: everything
they key into their system — number, date, terms, total — in one block at the top
right, the load number repeated in the reference line because that is what their
PO is filed under, and the amount due in a box of its own.

To review the layout without a database, a load, or a customer about to receive
one:

```bash
node scripts/sampleInvoice.js [output directory]
```

Renders a customer invoice, a carrier bill and a driver settlement with
representative figures — deliberately not a single clean line, because the layout
has to hold up on the invoice that gets queried.

---

## Dates and timezones

Two kinds of value, handled differently, in `server/utils/dates.js` and its
mirror `client/src/utils/dates.js`.

**A calendar date** has no time and no timezone — an invoice date, a due date, a
payment date, a pickup date. "15 March" means 15 March in Newark, in Mumbai and
on a printed page. Stored at UTC midnight and read back in UTC.

**An instant** is a moment that happened — `createdAt`, `sentAt`, an audit entry,
a tracking ping. Rendered to everybody on the US business clock
(`America/New_York`) with the zone named: *Mar 15, 2026, 3:42 PM EDT*.

### The bug this replaced

A `<input type="date">` submits `"2026-03-15"`. `new Date("2026-03-15")` is UTC
midnight. `toLocaleDateString()` renders in the **viewer's** zone — so in New
York that instant is 8pm on the 14th, and an invoice dated the 15th printed as
the 14th. The same code on a machine in India shows the 15th, which is why the
fault survives development and appears only once somebody in the States looks at
it.

The mirror image was just as bad: `new Date().toISOString().slice(0, 10)`, the
usual way to put "today" into a date input, returns **tomorrow** for anyone east
of Greenwich in their evening and **yesterday** in the Americas after 7pm.

### The rules

| Need | Use |
|---|---|
| Fill a date input | `toDateKey(value)` / `toDateInput(value)` |
| Today, for a default | `todayKey()` |
| Send a date to the API | `calendarDate(value)` |
| Show a date | `formatDate(value)` → *Mar 15, 2026* |
| Show a timestamp | `formatDateTime(value)` → *Mar 15, 2026, 3:42 PM EDT* |
| Net terms, ages | `addDays`, `daysBetween` — never `± n * 86400000` |
| Filter a date field | `calendarRange(from, to)` — bounded in UTC |
| Filter a timestamp field | `instantRange(from, to)` — bounded by the business day |

Never `toISOString().slice(0, 10)`, never `toLocaleDateString()` on a raw value,
never millisecond division for a day count — all three drift across a daylight
saving change or a timezone boundary.

`server/tests/dates.test.js` pins the behaviour, including both US DST weekends
and the 23-hour day the clocks change on.

---

## API

```
GET    /api/accounting/catalog                       charge types
GET    /api/accounting/loads/:loadId                 one load's ledgers
PUT    /api/accounting/loads/:loadId/receivables     replace one side
PUT    /api/accounting/loads/:loadId/payables
PUT    /api/accounting/loads/:loadId/payroll         driver pay

GET    /api/accounting/reports/loads                 load-wise receivable/payable
GET    /api/accounting/reports/customers             customer-wise, with aging
GET    /api/accounting/reports/customers/:id         one account
POST   /api/accounting/reports/customers/:id/statement
GET    /api/accounting/reports/aging                 AR or AP, bucketed
GET    /api/accounting/reports/payees                carriers and drivers owed

GET    /api/invoices                                 the register
GET    /api/invoices/:id                             one invoice + its payments
GET    /api/invoices/:id/pdf
POST   /api/invoices/loads/:loadId/generate          raise from a load
GET    /api/invoices/loads/:loadId                   everything on one load
POST   /api/invoices/manual
PUT    /api/invoices/:id                             drafts only
POST   /api/invoices/:id/send                        emails it, then freezes it
POST   /api/invoices/:id/remind
PUT    /api/invoices/:id/void | /unvoid

GET    /api/payments/methods                         methods + their document labels
GET    /api/payments                                 the payment register
POST   /api/payments                                 record one
PUT    /api/payments/:id/reverse
POST   /api/payments/:id/receipt
```

Reading is gated on `reports.view`, writing on `loads.edit`.

---

## Tests

`server/tests/invoicing.test.js` — 35 cases covering numbering, the split-load
carrier bills, the snapshot rule, payment references, reversals, manual invoices,
the reports and the reminder ladder.

```bash
npx jest tests/invoicing.test.js tests/accounting.test.js
```
