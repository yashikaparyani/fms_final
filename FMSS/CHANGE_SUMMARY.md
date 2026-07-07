# FMSS — Change Summary

This document summarizes the changes made across the Freight Management System (FMSS) — covering the web app, the backend API, and the fleet-owner mobile app.

---

## 1. Load Creation & Editing

### 1.1 "Other" option in the City dropdown
- Every City dropdown now shows an **"Other (add a new city)"** option pinned at the top.
- Selecting it reveals an inline field to type a new city (with optional ZIP).
- The new city is **saved permanently** to the location master, so it appears for every user from then on.
- Backend: added `POST /api/locations/cities` (idempotent) and made ZIP optional.

### 1.2 New load checkboxes: Dry Van & Reefer
- Added **Dry Van** and **Reefer** checkboxes alongside Hazmat / Chassis Rent / Rail Container.
- Wired end-to-end (create form, edit form, database model, controller) so they save and reload correctly.

### 1.3 "No options" overlay fix on the Register Company popup
- Fixed a visual glitch where the company search dropdown ("No options") floated on top of the "Register New Company" modal.
- The dropdown now closes automatically when the modal opens.

---

## 2. Editing a Load

### 2.1 Edit Load from the Track Load page
- Added an **Edit Load** button on the Track Load page for Admin, Staff, and Customers.
- Customers can edit only before verification; Admin/Staff can edit at any time.
- Added the required routes and fixed post-save navigation (previously broke for Admin/Staff).

### 2.2 Admin edits apply directly (no re-verification)
- When an Admin/Staff edits a load, the change is applied **directly** without sending it back for verification.
- Customer edits still go back to "Pending Verification".
- The confirmation message and the final button label are role-aware to avoid confusion.

### 2.3 Multiple Origins & Destinations
- A load can now have **multiple pickup (origin) and drop (destination) stops**.
- The edit screen lets you add/remove origins and destinations.
- The Details page and documents display all stops; older single-stop loads keep working.

---

## 3. Load Management & Assignment

### 3.1 Verified Loads: new date columns
- Added **Pickup Date**, **Destination Date**, and **LFD (Last Free Date)** columns to the Verified Loads table (desktop and mobile).

### 3.2 Direct "Assign Driver" without bidding
- Added an **Assign Driver** action next to "Schedule Bid" to assign a fleet owner directly, skipping the bidding process.
- On direct assignment, the load's bidding window is cleared so the system does not re-open bidding or send bid emails for it.

---

## 4. Transport Status Rules

### 4.1 One-way status progression
- A transport status can now only move **forward** (e.g., after "Reached Destination", earlier stages are disabled).
- A status cannot be repeated or reverted.
- Enforced in the backend, the web status dialog, and the mobile app.

### 4.2 Multiple-origin pickup confirmation
- For a load with more than one origin, the driver may mark "Picked Up" once per origin.
- Before recording an extra pickup, the app asks: **"Is this the pickup for origin #N?"**

---

## 5. Proof of Delivery (POD) & Signatures

### 5.1 Mobile signature now visible
- The mobile signature pad now **crops to the actual strokes** and uses a **darker, bolder pen**, so the signature stays clear when placed on the POD.
- The POD signature box was enlarged so the signature is readable.
- Increased the upload field-size limit so large signatures are never truncated.

### 5.2 POD TIME IN / TIME OUT
- The POD now prints the **actual pickup time** (loading row) and **actual delivery time** (unloading row).
- TIME OUT mirrors TIME IN for each row.

### 5.3 POD "Total to Collect"
- The **amount is no longer printed** in the "Total to Collect" box on the POD.

---

## 6. Pricing & Amounts

### 6.1 "Fleet Owner Amount" when scheduling a bid
- The Schedule Bid form now asks for the **amount paid to the fleet owner** (what we give them) instead of the internal margin.
- The underlying calculation is unchanged — the margin is derived automatically.

### 6.2 Mobile shows the fleet-owner amount
- The mobile app now shows the **fleet-owner payout** (vendor rate) instead of the customer base rate.

---

## 7. Load Details Page

### 7.1 Receivables section
- Added a **Receivables** section to the load Details page showing Customer, Freight Charges (base), Fleet Owner Payout, Gross Margin, Accessorial Charges, Invoice No, and the Total Receivable from the customer.

---

## 8. Mobile App Configuration (Dev)
- Added a local `.env` so the mobile app can point to the local backend during testing.
- Documented that a physical phone must reach the PC over the same network (LAN IP), and how to handle firewall / network isolation.
