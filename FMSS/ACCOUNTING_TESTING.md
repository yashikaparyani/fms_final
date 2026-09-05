# Testing the accounting module

Manual test pass for invoices, payments, reminders and the reports.
**~35 minutes** for everything, or take one phase at a time.

The automated suite (`server/tests/invoicing.test.js`, 35 cases) already covers
the arithmetic and the API rules. What follows is what a machine cannot check:
that the screens say the right thing, that the PDF is something you would send a
customer, and that the flow makes sense end to end.

---

## 0. Setup — 5 minutes

### Start the stack

```bash
# Terminal 1 — MongoDB (replica set, port 27018 per server/.env)
mongod --dbpath "D:\fms_working\FMSS\FMSS\mongo-rs\data" --port 27018 --replSet rs0

# Terminal 2 — API
cd D:\fms_working\FMSS\FMSS\server
npm run dev                      # http://localhost:5001

# Terminal 3 — UI
cd D:\fms_working\FMSS\FMSS\client
npm run dev                      # http://localhost:5173
```

### Seed the test data

```bash
cd D:\fms_working\FMSS\FMSS\server
node scripts/seedAccountingDemo.js
```

It creates a branch, a staff login, a customer with a billing address, two
carriers, a driver, and **four loads parked at different points of the billing
cycle** — because the interesting behaviour is at the transitions, and four
identical fresh loads exercise none of them.

| Load | State | What it is for |
|---|---|---|
| **A** | Costed both sides, nothing raised | Raising invoices |
| **B** | Split across 2 carriers + a driver | One bill per leg |
| **C** | Invoiced, part paid by check | Balances, reversal |
| **D** | Sent, 45 days overdue, 4 reminders | Aging, chasing |

The script prints the load numbers it created — **write them down**, the rest of
this guide refers to them as A, B, C and D.

```
Staff (back office)   accounts@fms.test   / password123
Customer (portal)     ap@kingsway.test    / password123
```

Run it again for a fresh set of four loads. `--reset` deletes every demo load,
invoice and payment first and leaves everything else alone.

### Email

Most of this works without email configured — the app tells you when a send
fails instead of pretending it worked, which is itself worth confirming. To test
the mails properly, set SMTP under **Settings → Email** and switch email on.

> If you have no SMTP handy, [Mailtrap](https://mailtrap.io) or
> [Ethereal](https://ethereal.email) give you a free inbox that catches
> everything without delivering it. Point the config at one of those rather than
> at a real mailbox — the reminder ladder is not something to test against a
> customer's actual address.

---

## Phase 1 — Raising invoices — 6 minutes

Sign in as **accounts@fms.test**. Go to **Accounting → Accounting**, open **load
A**.

You will see the ledgers you already know, and above them a new
**Billing & payments** panel.

### 1.1 The uninvoiced gap

- [ ] Receivable shows **Invoiced $0.00** and a red line: *"$1,922.50 on the
      ledger has not been invoiced yet."*
- [ ] Customer invoice section says the invoice *will* be numbered as the load

> This gap is the whole reason the panel reports two numbers per side. Revenue
> earned but never billed is the commonest way a brokerage loses money it already
> made, so it gets its own red line rather than being something you work out by
> subtracting two columns.

### 1.2 Raise

Press **Raise invoices** → choose **Net 30** → Raise.

- [ ] Toast: *"2 invoices raised for LD xxxx."*
- [ ] Customer invoice appears, numbered **exactly the load number**
- [ ] A carrier bill appears, numbered **load number + `-AP1`**
- [ ] The red uninvoiced line is gone; Invoiced now matches the ledger
- [ ] Both show status **Draft**

### 1.3 Pressing it twice is not a mistake

Scroll to **Receivables**, add a line — *Detention Charges, $150* — and **Save
receivables**. Then press **Raise invoices** again.

- [ ] Still **one** customer invoice, not two
- [ ] Its total has gone **up by $150**
- [ ] No `-AP2` appeared

> Generate → spot a missing charge → fix → generate again is the natural
> workflow. A system that answered that with a second invoice would leave the
> office deciding by hand which one is real.

---

## Phase 2 — The split load — 5 minutes

Open **load B**. Two carriers, one driver.

Press **Raise invoices** → Net 30.

- [ ] **Three** payable documents: `-AP1`, `-AP2`, `-AP3`
- [ ] `-AP1` → Northline Trucking, `-AP2` → Southbound Freight, `-AP3` → Ray Mott
- [ ] Northline's bill totals **$660** (600 linehaul + 60 yard storage)
- [ ] Southbound's totals **$525** (450 linehaul + 75 detention)
- [ ] The driver's is a **Driver Settlement**, not an invoice, and its line reads
      *"28% of load revenue"*

Open Northline's bill.

- [ ] It contains **only Northline's lines** — no sign of Southbound's rate

> A carrier must never see what another carrier on the same load was paid. That
> is why the bills are separate documents rather than one payables page with a
> filter on it.

### 2.1 The bug this used to hit

Go back to load B → **Payables**. Note it holds **two** base charge lines, one
per carrier. Add another charge to one of them and save.

- [ ] It saves

> Until this change the validator enforced "one base charge per side" across the
> whole ledger, so **every split load's payables silently refused to save** and
> the system quietly fell back to the agreed leg rate — losing every accessorial
> anybody had costed. The rule is now scoped per carrier. Single-carrier loads
> behave exactly as before.

---

## Phase 3 — The document — 5 minutes

Open **load C** → click its customer invoice.

### 3.1 The page

- [ ] Laid out as the document: issuer top left, *Bill To* below, the identity
      block (number / date / terms / due) top right
- [ ] The **advance of $500** shows as a deduction, **not** added to the subtotal
- [ ] The check payment of **$800** shows as a second deduction
- [ ] Amount due box reads **$1,115.00**
- [ ] Status chip: **Part paid**

> Subtotal $2,415, less $500 taken at booking, less $800 paid by check. An
> advance summed into the total would over-bill the customer by money they had
> already handed over.

### 3.2 The PDF

Press **PDF**.

- [ ] Opens in a new tab
- [ ] Everything a clerk keys — number, date, terms, due date — is in one block
      top right
- [ ] The load number appears in the reference line
- [ ] Amount due is in a box on its own
- [ ] Columns add up to the subtotal printed beneath them

Sample documents without touching the database:

```bash
node scripts/sampleInvoice.js
```

Writes a customer invoice, a carrier bill and a driver settlement to
`server/uploads/invoices/`, with deliberately messy figures — the layout has to
hold up on the invoice that gets queried, not the one that does not.

### 3.3 Sending freezes it

Press **Send** → confirm the address → Send.

- [ ] Status becomes **Awaiting payment** (or stays *Part paid* on load C)
- [ ] The panel says *"Frozen — edit by voiding and raising a new one."*
- [ ] The email arrives with the **PDF attached**

Now go back to the load, change a receivable line, save, and press **Raise
invoices** again.

- [ ] The sent invoice's total is **unchanged**

> An invoice somebody is holding a copy of must not change under them. That is
> the difference between a ledger and a document, and it is the reason invoices
> are their own collection rather than a view over the load.

---

## Phase 4 — Payments — 8 minutes

Open any invoice with a balance. Press **Record payment**.

### 4.1 The document number relabels itself

Change the **Method** dropdown and watch the field beneath it:

| Method | Field should read | Required |
|---|---|---|
| Check | Check Number | yes |
| ACH / EFT | Trace Number | yes |
| Wire Transfer | Wire Reference / IMAD | yes |
| Credit / Debit Card | Authorisation Code | yes |
| Cash | Receipt Number | **no** |

- [ ] The label changes with the method
- [ ] The placeholder changes too
- [ ] Cash shows *(optional)*; the others show a red `*`
- [ ] A **Bank** field appears for Check, ACH and Wire, and not for Card or Cash

> A column full of numbers under a heading called "Reference" cannot be matched
> against a bank statement, which is the only reason to keep the row. Cash is the
> exception because no third party issues a number, and a required field there
> would only ever produce an invented one.

### 4.2 What it refuses

- [ ] Method **Check**, leave the number blank → *"Check Number is required for a
      check payment."*, button disabled
- [ ] Enter **more than the balance** → the amount field goes red and says so
- [ ] Method **Cash**, no reference → **accepted**

> An overpayment is almost always a typo or a payment applied to the wrong
> invoice. Accepting it creates a negative balance that every report then has to
> special-case.

### 4.3 Record one

Amount = half the balance, method **Check**, number `100999`, bank `Chase`, tick
**Email a receipt**.

- [ ] Toast names the receipt number and what is still outstanding
- [ ] The payment appears in the right-hand list with *Check Number: 100999*
- [ ] Balance halves; status becomes **Part paid**
- [ ] The receipt email arrives stating the remaining balance
- [ ] If email is off, the payment is **still recorded** and a warning says the
      receipt did not send

Pay the rest.

- [ ] Balance **$0.00**, status **Paid**
- [ ] The Record payment button is gone

### 4.4 Reversal

Press **Reverse** on the first payment. Try confirming with an empty reason
first.

- [ ] Refuses without a reason
- [ ] With *"Check returned unpaid"*: the balance goes back up, status returns to
      **Part paid**
- [ ] The reversed payment is **still listed**, struck through, with its reason
- [ ] The remaining live payment still counts

> A bounced check, a recalled wire and a keying error all read differently later.
> The row survives because the only acceptable answer to "why did this go from
> paid back to outstanding" is a record that says so.

### 4.5 Voiding

With a live payment still on the invoice, press **Void**.

- [ ] Refused: *"…has N payments recorded against it. Reverse them before
      voiding."*

Reverse the payments, then void with a reason.

- [ ] Status **Void**, red banner with the reason
- [ ] The PDF is stamped **VOID**
- [ ] **Reopen** puts it back

> Never a delete. A gap in the invoice numbers is the first thing an auditor asks
> about, and somebody outside this system is holding a copy.

---

## Phase 5 — Chasing — 4 minutes

Open **load D** — 45 days overdue.

- [ ] Chip reads **45d overdue** in red, not "Awaiting payment"
- [ ] The **Reminders** panel lists 4, three marked *automatic*, one *sent by
      hand*

Press **Remind**.

- [ ] The dialog states the days overdue and the outstanding amount
- [ ] The mail is headed **Overdue invoice** (not "Payment reminder") and has the
      PDF attached
- [ ] A fifth reminder appears, marked *sent by hand*

Now break it on purpose: clear the customer's billing email
(**Customers → Kingsway → accounts email**), reopen the invoice and press
**Remind** again.

- [ ] It fails with a message naming the fix
- [ ] The **failed attempt is still recorded**, in red

> An address that bounces otherwise looks exactly like an account nobody chased.

### 5.1 The automatic ladder

The nightly sweep runs at **09:00** server time. To fire it now:

```bash
node -e "require('dotenv').config();const m=require('mongoose');\
m.connect(process.env.MONGO_URI).then(async()=>{\
const r=await require('./services/reminderService').sendDueReminders({dryRun:true});\
console.log(JSON.stringify(r,null,2));await m.disconnect();})"
```

- [ ] Reports what it *would* send, sends nothing
- [ ] Load D is **not** in the list

Load D being absent is the correct answer, for two reasons at once, and it is
worth understanding which is which:

1. It is **45 days** overdue, and 45 is not a rung. The ladder is −3, +1, +7,
   +15, +30 days from the due date and then monthly, so this invoice fired at 30
   and fires again at 60. Nothing is due today.
2. Even on a rung it would be skipped, because you chased it by hand in the step
   above and an invoice is chased **at most once a day** however many times the
   sweep runs.

To watch it actually fire, move the due date onto a rung — 7 days back — and run
the dry run again:

```bash
node -e "require('dotenv').config();const m=require('mongoose');\
m.connect(process.env.MONGO_URI).then(async()=>{\
const {runUnscoped}=require('./utils/tenantContext');\
await runUnscoped(async()=>{const I=require('./models/Invoice');\
const i=await I.findOne({loadId:'LD 0012'});\
i.dueDate=new Date(Date.now()-7*864e5);i.reminders=[];await i.save();\
console.log('due date moved to 7 days ago, reminders cleared');});\
await m.disconnect();})"
```

*(swap `LD 0012` for your load D)*

- [ ] The dry run now lists it, at **7 days overdue**
- [ ] Run it a second time — still listed, because a dry run records nothing
- [ ] Drop `{dryRun:true}` to send for real; the mail is headed **Payment
      reminder** at 7 days, and **Overdue invoice** past 15
- [ ] Run the real sweep **again immediately** — it is now skipped

> That last check is the one that matters. Getting it wrong does not produce a
> bug report; it produces a customer receiving four identical demands in one
> morning, which costs the relationship the reminders existed to protect.

Carrier bills are deliberately **not** auto-chased: emailing a carrier a reminder
that we have not paid them is not something to automate.

---

## Phase 6 — The registers and reports — 6 minutes

### 6.1 Invoices — `Accounting → Invoices`

- [ ] Opens on **Receivables / Open** — not a browse view
- [ ] Four tiles: Invoiced, Received, Outstanding, Overdue
- [ ] Switching to **Payables** shows the carrier and driver bills
- [ ] **Overdue** filter isolates load D
- [ ] Search finds by invoice number, load number and customer name
- [ ] Clicking a row opens it

### 6.2 Customer accounts — `Accounting → Customer Accounts`

- [ ] Kingsway listed with billed / received / outstanding
- [ ] Aging strip: **Current / 1–30 / 31–60 / 61–90 / 90+**
- [ ] Load D's balance sits in **31–60**, not Current
- [ ] Oldest due date shows in red with a warning triangle

Click the row.

- [ ] Their invoices and payments, with the billing email shown
- [ ] **Email statement** lists every open invoice with its age

> A single "outstanding" number tells you the size of the problem and nothing
> about its shape. $40,000 raised last week is a healthy business; the same
> $40,000 past ninety days is a write-off waiting to be admitted.

### 6.3 Load ledger — `Accounting → Load Ledger`

Set the date range wide enough to include the demo loads.

- [ ] One row per load, receivable against payable, margin on the right
- [ ] Load A shows an **unbilled** figure in red if you left charges unraised
- [ ] Expanding a row **itemises every additional charge** on both sides, with
      notes
- [ ] Driver pay appears on the payable side
- [ ] **CSV** downloads and matches what is on screen

---

## Phase 7 — Manual invoices — 3 minutes

**Accounting → Invoices → New invoice**.

- [ ] Switching direction to **Payable** flips the party picker to carriers
- [ ] Picking a customer fills in their email
- [ ] Line *Storage*, qty `5`, rate `40` → the amount placeholder shows **200.00**
- [ ] A line marked **Already paid / advance** is **deducted**, not added
- [ ] Balance updates live

Create it.

- [ ] Numbered **`NY-MI-0001`**, not a load number
- [ ] Tagged **Manual** on the register

> Obvious at a glance that this one was typed rather than derived from a load.

Also try:

- [ ] A line with a label that matches nothing in the charge catalog —
      *"Consulting on customs paperwork", $300* — **counts toward the total**

> Invoice lines total by their own kind rather than by looking a charge type up
> in the catalog, precisely so a hand-typed line is not silently valued at zero.

- [ ] Leaving the name blank → *"Say who this invoice is addressed to."*

---

## Phase 8 — Permissions — 2 minutes

As **admin**, create a staff user with `loads.view` and `reports.view` but
**not** `loads.edit`. Sign in as them.

- [ ] Invoices, Customer Accounts and Load Ledger all open
- [ ] **Raise invoices**, **Record payment**, **Send** and **Void** are refused
      by the API

Sign in as **ap@kingsway.test** (the customer).

- [ ] No accounting screens in the sidebar
- [ ] `/api/invoices` returns **403**

> A customer must not see what the carrier was paid and a carrier must not see
> what the customer was billed. The margin between those two numbers is the
> brokerage's business, which is why there is no filtered version of these
> endpoints — there is no endpoint at all.

---

## Running the automated suite

```bash
cd D:\fms_working\FMSS\FMSS\server
npx jest tests/invoicing.test.js tests/accounting.test.js    # 64 cases
npm test                                                      # all 432
```

No database needed — it spins up its own in memory.

---

## If something is wrong

| Symptom | Look at |
|---|---|
| "Tenant scope missing" | No location header — sign out and back in |
| "Your account is not assigned to any location" | `node scripts/bootstrapAccess.js you@email --location "New York" NY` |
| Invoice raises with $0 lines | The ledger saved? Check the toast on **Save receivables** |
| Email silently does nothing | Settings → Email → is it switched on? The API returns the reason |
| Seed script cannot connect | `MONGO_URI` in `server/.env` — port **27018**, replica set `rs0` |
| PDF is blank | `server/uploads/invoices/` writable? Try `node scripts/sampleInvoice.js` |

Design decisions and the reasoning behind them: [ACCOUNTING.md](ACCOUNTING.md).
