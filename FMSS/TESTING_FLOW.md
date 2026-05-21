![1778987199849](image/TESTING_FLOW/1778987199849.png)![1779100476069](image/TESTING_FLOW/1779100476069.png)![1779100492361](image/TESTING_FLOW/1779100492361.png)# Complete Testing Flow: Load Creation to Delivery with POD

**Date:** May 16, 2026  
**Scope:** REQ 14-21 - Bid Management, Document Types, POD Auto-Generation, Load Detail Page  
**Duration:** ~30-45 minutes for full testing

---

## Table of Contents
1. [Pre-Requisites](#pre-requisites)
2. [Test Data Preparation](#test-data-preparation)
3. [Phase 1: Create Load](#phase-1-create-load)
4. [Phase 2: Verify Load Details Page](#phase-2-verify-load-details-page)
5. [Phase 3: Document Type Restrictions (REQ 18-20)](#phase-3-document-type-restrictions)
6. [Phase 4: Bid Management (REQ 14-16)](#phase-4-bid-management)
7. [Phase 5: Transport Status Updates](#phase-5-transport-status-updates)
8. [Phase 6: POD Auto-Generation (REQ 19)](#phase-6-pod-auto-generation)
9. [Phase 7: Final Verification](#phase-7-final-verification)

---

## Pre-Requisites

### System Status Check
```bash
# Terminal 1: MongoDB
mongod --dbpath "D:\fms\FMSS\FMSS\mongo-rs\data"
# Expected: "waiting for connections on port 27017"

# Terminal 2: Backend Server
cd D:\fms\FMSS\FMSS\server
npm start
# Expected: "Server running on port 5001"

# Terminal 3: Frontend Dev Server
cd D:\fms\FMSS\FMSS\client
npm run dev
# Expected: "VITE v4.x.x  ready in xxx ms"
```

### Required User Accounts (Pre-create if needed)
- **Client User:** Email: `client@test.com` / Role: `client`
- **Staff User:** Email: `staff@test.com` / Role: `staff`
- **Fleet Owner:** Email: `fleet@test.com` / Role: `fleetOwner`
- **Admin:** Email: `admin@test.com` / Role: `admin`

### API Testing Tools
- **Postman** or VS Code REST Client for API calls
- **Browser DevTools** for UI testing
- **MongoDB Compass** for database verification (optional)

---

## Test Data Preparation

### Create Test Load via API (or UI Form)

**POST** `http://localhost:5001/loads`

**Headers:**
```
Authorization: Bearer {CLIENT_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "customer": "CLIENT_USER_ID",
  "refNo": "TEST-REF-001",
  "deliveryType": "ROUNDED",
  "singleType": "Pick Up",
  "truckType": "Container",
  "material": "Electronics",
  "amount": 5000,
  "containerType": "40 Std",
  "commodity": "Chilled",
  "bookingNo": "BOK-12345",
  "shippingLine": "Maersk",
  "containerNo": "CONT-98765",
  "pickupNo": "PU-001",
  "sealNo": "SEAL-123",
  "hazmat": false,
  "chassisRent": true,
  "railContainer": false,
  "accChargesEmail": "charges@test.com",
  "podEmail": "pod@test.com",
  "deliveryEmail": "delivery@test.com",
  "billingEmail": "billing@test.com",
  "description": "Test shipment with electronics",
  "remarks": "Handle with care",
  "lastFreeDate": "2026-05-25T00:00:00Z",
  "orderBillDate": "2026-05-16T00:00:00Z",
  "pickup": {
    "address": "123 Main St",
    "city": "Los Angeles",
    "state": "CA",
    "zip": "90001",
    "company": "ABC Shipping",
    "poNumber": "PO-001",
    "pieces": "100",
    "weight": "5000 lbs",
    "pickupDate": "2026-05-17T08:00:00Z",
    "fromTime": "08:00 AM",
    "toTime": "05:00 PM",
    "apptGivenBy": "John Doe",
    "apptNumber": "APT-001"
  },
  "drop": {
    "address": "456 Oak Ave",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "company": "XYZ Logistics",
    "poNumber": "PO-002",
    "pieces": "100",
    "weight": "5000 lbs",
    "deliveryDate": "2026-05-20T10:00:00Z",
    "fromTime": "09:00 AM",
    "toTime": "06:00 PM",
    "apptGivenBy": "Jane Smith",
    "apptNumber": "APT-002"
  },
  "status": "DRAFT"
}
```

**Expected Response:**
```json
{
  "_id": "MONGO_OBJECT_ID",
  "loadId": "LD-0001",
  "customerName": "Client Name",
  "status": "DRAFT",
  "transportStatus": "NEW_LOAD",
  "bidStatus": "UPCOMING",
  "createdAt": "2026-05-16T...",
  "updatedAt": "2026-05-16T..."
}
```

**Capture:** Note down `loadId` (e.g., "LD-0001") for subsequent tests

---

## Phase 1: Create Load

### Test Case 1.1: Load Creation Success
**Objective:** Verify load is created with all required fields

**Steps:**
1. Log in as Client
2. Navigate to `Create Load` page
3. Fill all required fields from Test Data Preparation
4. Click "Submit"

**Verification:**
- [ ] Load appears in My Loads list
- [ ] Load ID auto-generated (format: `LD-XXXX`)
- [ ] Status shows as "DRAFT" or "PENDING_VERIFICATION"
- [ ] All fields persist (refresh page to verify)
- [ ] Timestamp created correctly

**Pass Criteria:** Load ID visible, all fields saved

---

### Test Case 1.2: Address Completeness Flag
**Objective:** Verify pickup/drop addresses are marked as complete

**Steps:**
1. From load created in 1.1, view the load details
2. Verify both pickup and drop addresses populated

**Verification:**
- [ ] Backend flag `adressAdded` = true
- [ ] Both pickup and drop sections visible in API response

**Pass Criteria:** adressAdded = true in database

---

## Phase 2: Verify Load Details Page

### Test Case 2.1: All Detail Sections Display (REQ 21)
**Objective:** Verify complete load detail page layout with all sections

**Steps:**
1. Log in as Staff/Admin
2. Navigate to Loads List
3. Click on load "LD-0001" to open details page
4. Scroll through entire page

**Verification - Identification Section:**
- [ ] Ref # displays: "TEST-REF-001"
- [ ] Assigned To field editable
- [ ] Order Status shows: "DRAFT" or "PENDING_VERIFICATION"
- [ ] Container Size/Location field editable
- [ ] Order Bill Date shows: "5/16/2026"
- [ ] Person Bill field editable
- [ ] Checkbox: Booking Problem (unchecked)
- [ ] Checkbox: Put on Hold (unchecked)
- [ ] Checkbox: Hot Shipment (unchecked)
- [ ] Checkbox: Is Accessorial Charges (unchecked)

**Verification - Order Identification (Yellow Section):**
- [ ] Customer: "Client Name"
- [ ] Pickup #: "PO-001"
- [ ] Container #: "CONT-98765"
- [ ] Chassis #: "ABC Shipping"
- [ ] Pieces: "100"
- [ ] Weight: "5000 lbs"
- [ ] Commodity: "Chilled"
- [ ] Seal #: "SEAL-123"
- [ ] Booking #: "BOK-12345"
- [ ] Created By: "staff@test.com" (or client creator)
- [ ] Created On: Timestamp visible
- [ ] Updated On: Timestamp visible
- [ ] Description: "Test shipment with electronics"
- [ ] Remarks: "Handle with care"
- [ ] Last Free Date: "5/25/2026"

**Verification - Origin(s) Table (Orange):**
- [ ] S.No.: "1"
- [ ] Origin: "123 Main St, Los Angeles, CA"
- [ ] Pickup Date/Time: "5/17/2026 08:00 AM To 05:00 PM"
- [ ] Appt #: "APT-001"
- [ ] Appt. Given by: "John Doe"

**Verification - Destination(s) Table (Teal):**
- [ ] S.No.: "1"
- [ ] Destination: "456 Oak Ave, New York, NY"
- [ ] Appt. Date/Time: "5/20/2026 09:00 AM To 06:00 PM"
- [ ] Appt #: "APT-002"
- [ ] Appt. Given by: "Jane Smith"

**Verification - Load Status Information (Amber Table):**
- [ ] Name field shows: "Load Planner"
- [ ] Status dropdown populated with options: NEW_LOAD, ASSIGNED, PICKED_UP, IN_TRANSIT, REACHED_DESTINATION, DELIVERED, INVOICED
- [ ] Location field editable
- [ ] Date/Time field editable
- [ ] Comments/Notes field editable

**Verification - Routing Section:**
- [ ] Pier Termination / Empty Return field editable
- [ ] Contact Person(s) field editable

**Verification - Additional Info:**
- [ ] Invoice No field editable
- [ ] Carrier Name field editable
- [ ] Date/Time field editable

**Pass Criteria:** All 8 sections visible with correct data and editable fields

---

### Test Case 2.2: Update Detail Page Fields (REQ 21)
**Objective:** Verify editable fields can be updated

**Steps:**
1. In load details page, update fields:
   - Assigned To: "staff@test.com"
   - Person Bill: "BILL-001"
   - Container Location: "Pier A"
   - Pier Termination: "Port of Los Angeles"
   - Contact Person: "Contact: +1-555-0123"
2. Check checkbox: "Put on Hold"
3. Click "Save Details"

**Verification:**
- [ ] Toast notification: "Details updated"
- [ ] Page refreshes
- [ ] All changes persist after refresh
- [ ] Put on Hold checkbox checked in database

**Pass Criteria:** All changes saved and persistent

---

## Phase 3: Document Type Restrictions (REQ 18-20)

### Test Case 3.1: Verify Document Types Updated (REQ 18, 20)
**Objective:** Verify "Load Order" and "Accessorial Charges" are removed, "Invoice" renamed to "Carrier Invoice"

**Steps:**
1. In Load Details page, scroll to "Documents" section (or DocumentUpload component)
2. Click document type dropdown
3. Review available options

**Verification - Document Type Dropdown Should Have:**
- [x] Bare Chassis In-Gate/Out-Gate
- [x] Bill Of Lading
- [x] Out-Gate Interchange
- [x] In-Gate Interchange
- [x] Proof of Delivery
- [x] Scale Ticket
- [x] Lumper Receipt
- [x] Misc.
- [x] Carrier Invoice

**Verification - Should NOT Have:**
- [ ] Load Order ❌ (removed)
- [ ] Accessorial Charges ❌ (removed)
- [ ] Invoice ❌ (renamed to Carrier Invoice)

**Pass Criteria:** Exactly 9 document types visible, old types removed, "Carrier Invoice" present

---

### Test Case 3.2: Upload Non-POD Document
**Objective:** Verify non-POD documents can be uploaded normally

**Steps:**
1. In Load Details, Documents section
2. Select: "Bill Of Lading"
3. Choose a test file (e.g., test.pdf)
4. Click "Add" / Upload button

**Verification:**
- [ ] File upload succeeds
- [ ] Document appears in Documents table
- [ ] Columns: Document Type, File Name, Date Received, View link
- [ ] Date Received populated with current timestamp
- [ ] View link functional (opens file in new tab)
- [ ] Document can be deleted (select row, click Delete)

**Pass Criteria:** Non-POD document uploaded, visible in table, deletable

---

### Test Case 3.3: POD Manual Upload Disabled (REQ 19)
**Objective:** Verify POD cannot be manually uploaded, shows auto-generated badge

**Steps:**
1. In Load Details, Documents section
2. Select: "Proof of Delivery"
3. Try to browse/select a file
4. Try to click Upload button

**Verification:**
- [ ] File upload control disabled or hidden
- [ ] Message displayed: "Auto-generated" or similar badge shown
- [ ] No Upload button visible for POD
- [ ] Cannot manually upload POD document
- [ ] Other document types still have upload button

**Pass Criteria:** POD cannot be manually uploaded, badge visible

---

### Test Case 3.4: Upload Non-Removed Document Type (Carrier Invoice)
**Objective:** Verify renamed "Carrier Invoice" (formerly "Invoice") can be uploaded

**Steps:**
1. In Load Details, Documents section
2. Select: "Carrier Invoice"
3. Choose a test file
4. Click Upload

**Verification:**
- [ ] Upload succeeds
- [ ] Document appears as "Carrier Invoice" in table
- [ ] Not appearing as "Invoice" or any old name

**Pass Criteria:** "Carrier Invoice" uploads and displays correctly

---

## Phase 4: Bid Management (REQ 14-16)

### Test Case 4.1: Verify Load Status for Bidding
**Objective:** Ensure load is ready for bid scheduling

**Steps:**
1. Log in as Staff
2. Navigate to Load "LD-0001"
3. Verify load status is "VERIFIED" (required for bid scheduling)
4. If status is still "DRAFT" or "PENDING_VERIFICATION", verify/approve load

**Verification:**
- [ ] Load status is "VERIFIED" or "ASSIGNED"
- [ ] BidStatus shows "UPCOMING"

**Pass Criteria:** Load ready for bid scheduling

---

### Test Case 4.2: Schedule Bidding with Rate & Margin (REQ 15)
**Objective:** Test REQ 15 - Set target rate and margin for bid calculation

**Steps:**
1. Log in as Staff
2. Navigate to Load "LD-0001"
3. Call API to schedule bidding:

**POST** `http://localhost:5001/loads/LD-0001/schedule-bidding`

**Headers:**
```
Authorization: Bearer {STAFF_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "bidStartTime": "2026-05-16T14:00:00Z",
  "bidEndTime": "2026-05-16T18:00:00Z",
  "targetRate": 4000,
  "margin": 500
}
```

**Expected Response:**
```json
{
  "loadId": "LD-0001",
  "bidStatus": "OPEN",
  "bidStartTime": "2026-05-16T14:00:00Z",
  "bidEndTime": "2026-05-16T18:00:00Z",
  "targetRate": 4000,
  "margin": 500,
  "vendorRate": 4500,
  "message": "Bidding scheduled successfully"
}
```

**Verification:**
- [ ] Response includes `targetRate`: 4000
- [ ] Response includes `margin`: 500
- [ ] Response includes `vendorRate`: 4500 (calculated as targetRate + margin)
- [ ] BidStatus changes to "OPEN"
- [ ] Bid window timestamps set correctly

**Pass Criteria:** vendorRate calculated correctly (4000 + 500 = 4500)

---

### Test Case 4.3: Submit Multiple Bids
**Objective:** Simulate multiple fleet owners bidding

**Steps:**
1. Create 2-3 test Fleet Owner accounts if needed
2. Each logs in and submits bids on load "LD-0001"

**POST** `http://localhost:5001/loads/LD-0001/submit-bid`

**Request (Fleet Owner 1):**
```json
{
  "amount": 4200
}
```

**Request (Fleet Owner 2):**
```json
{
  "amount": 4100
}
```

**Request (Fleet Owner 3):**
```json
{
  "amount": 4300
}
```

**Verification (per each bid):**
- [ ] Response shows bid submitted successfully
- [ ] Bid appears in load's `bids` array
- [ ] Bid includes: fleetOwnerId, amount, submittedAt timestamp

**Capture:** Note down the 3 bidder Fleet Owner IDs and amounts for next test

**Pass Criteria:** 3 bids submitted, lowest bid = 4100 (Fleet Owner 2)

---

### Test Case 4.4: Award Bid Manually (REQ 14)
**Objective:** Test REQ 14 - Staff manually selects winning bid

**Steps:**
1. Log in as Staff
2. After bids are submitted, call award-bid endpoint to select Fleet Owner 2 (4100 bid)

**POST** `http://localhost:5001/loads/LD-0001/award-bid`

**Headers:**
```
Authorization: Bearer {STAFF_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "bidId": "BID_OBJECT_ID_OF_FLEET_OWNER_2",
  "fleetOwnerId": "FLEET_OWNER_2_ID"
}
```

**Expected Response:**
```json
{
  "loadId": "LD-0001",
  "winningBid": {
    "fleetOwnerId": "FLEET_OWNER_2_ID",
    "fleetOwnerName": "Fleet Owner 2",
    "amount": 4100,
    "submittedAt": "timestamp"
  },
  "bidStatus": "CLOSED",
  "assignedFleetOwner": {
    "fleetOwnerId": "FLEET_OWNER_2_ID",
    "fleetOwnerName": "Fleet Owner 2",
    "assignedAt": "timestamp"
  },
  "transportStatus": "ASSIGNED",
  "message": "Bid awarded successfully"
}
```

**Verification:**
- [ ] WinningBid correctly set to Fleet Owner 2's bid (4100)
- [ ] BidStatus changed to "CLOSED"
- [ ] AssignedFleetOwner populated with Fleet Owner 2
- [ ] TransportStatus changed to "ASSIGNED"
- [ ] Bid ID matches the selected bid

**Pass Criteria:** Correct bid awarded, load assigned to Fleet Owner 2

---

### Test Case 4.5: Discard Individual Bid (REQ 14)
**Objective:** Test REQ 14 - Staff can remove specific bids from a load

**Pre-condition:** Use a new load with multiple bids (don't award yet)

**Steps:**
1. Create new test load and schedule bidding with multiple bids
2. Call discard-bid endpoint to remove Fleet Owner 1's bid

**POST** `http://localhost:5001/loads/LD-0002/discard-bid`

**Request Body:**
```json
{
  "bidId": "BID_ID_OF_FLEET_OWNER_1"
}
```

**Expected Response:**
```json
{
  "loadId": "LD-0002",
  "bids": [
    { "fleetOwnerId": "FLEET_OWNER_2_ID", "amount": 4100 },
    { "fleetOwnerId": "FLEET_OWNER_3_ID", "amount": 4300 }
  ],
  "message": "Bid discarded successfully"
}
```

**Verification:**
- [ ] Fleet Owner 1's bid no longer in bids array
- [ ] Remaining bids (Fleet Owner 2 & 3) still present
- [ ] Bid count reduced from 3 to 2

**Pass Criteria:** Specific bid removed, other bids intact

---

### Test Case 4.6: Reschedule Bidding (REQ 16)
**Objective:** Test REQ 16 - Change bid times while keeping existing bids

**Pre-condition:** Load with existing bids but not yet awarded

**Steps:**
1. Create another test load with bids scheduled
2. Call reschedule-bidding endpoint to extend bid window

**POST** `http://localhost:5001/loads/LD-0003/reschedule-bidding`

**Request Body:**
```json
{
  "bidStartTime": "2026-05-17T10:00:00Z",
  "bidEndTime": "2026-05-17T18:00:00Z"
}
```

**Expected Response:**
```json
{
  "loadId": "LD-0003",
  "bidStatus": "OPEN",
  "bidStartTime": "2026-05-17T10:00:00Z",
  "bidEndTime": "2026-05-17T18:00:00Z",
  "bids": [
    { "fleetOwnerId": "FLEET_OWNER_1_ID", "amount": 4200 },
    { "fleetOwnerId": "FLEET_OWNER_2_ID", "amount": 4100 }
  ],
  "message": "Bidding rescheduled successfully"
}
```

**Verification:**
- [ ] New bidStartTime: "2026-05-17T10:00:00Z"
- [ ] New bidEndTime: "2026-05-17T18:00:00Z"
- [ ] BidStatus remains "OPEN"
- [ ] **Existing bids preserved** - both Fleet Owner 1 & 2 still have bids
- [ ] Bid count unchanged (still 2 bids)

**Pass Criteria:** Bid times changed, existing bids kept

---

### Test Case 4.7: Rebid Load (REQ 16)
**Objective:** Test REQ 16 - Reset load, clear all bids, restart bidding

**Pre-condition:** Load with awarded bid (use LD-0001 from Test 4.4)

**Steps:**
1. Verify load LD-0001 has winningBid and bidStatus="CLOSED"
2. Call rebid endpoint to clear all bids and restart

**POST** `http://localhost:5001/loads/LD-0001/rebid`

**Request Body:**
```json
{
  "newBidStartTime": "2026-05-17T14:00:00Z",
  "newBidEndTime": "2026-05-17T20:00:00Z"
}
```

**Expected Response:**
```json
{
  "loadId": "LD-0001",
  "bidStatus": "OPEN",
  "bids": [],
  "winningBid": null,
  "assignedFleetOwner": null,
  "bidStartTime": "2026-05-17T14:00:00Z",
  "bidEndTime": "2026-05-17T20:00:00Z",
  "message": "Load rebid successfully - all bids cleared"
}
```

**Verification:**
- [ ] WinningBid cleared (set to null)
- [ ] AssignedFleetOwner cleared (set to null)
- [ ] Bids array empty: `[]`
- [ ] BidStatus reset to "OPEN"
- [ ] New bid times set correctly
- [ ] Load ready for new bidding round

**Pass Criteria:** All bids cleared, winning bid removed, bidding restarted fresh

---

## Phase 5: Transport Status Updates

### Test Case 5.1: Change Transport Status to PICKED_UP
**Objective:** Advance load through shipping pipeline

**Steps:**
1. Log in as Fleet Owner or Driver
2. Use load LD-0001 (should be ASSIGNED from Test 4.4)
3. In Load Details, click Transport Status: "PICKED_UP"
4. Click "Save Details"

**Verification:**
- [ ] Toast: "Details updated"
- [ ] TransportStatus shows "PICKED_UP"
- [ ] Status persists after page refresh

**Pass Criteria:** TransportStatus = PICKED_UP

---

### Test Case 5.2: Change Transport Status to IN_TRANSIT
**Objective:** Continue status progression

**Steps:**
1. Click Transport Status: "IN_TRANSIT"
2. Click "Save Details"

**Verification:**
- [ ] TransportStatus = IN_TRANSIT
- [ ] Load Status Information shows current status

**Pass Criteria:** TransportStatus = IN_TRANSIT

---

### Test Case 5.3: Change Transport Status to REACHED_DESTINATION
**Objective:** Load nearing delivery

**Steps:**
1. Click Transport Status: "REACHED_DESTINATION"
2. Click "Save Details"

**Verification:**
- [ ] TransportStatus = REACHED_DESTINATION
- [ ] Document section still shows POD as "Auto-generated" (not yet available)

**Pass Criteria:** TransportStatus = REACHED_DESTINATION

---

## Phase 6: POD Auto-Generation (REQ 19)

### Test Case 6.1: POD Unavailable Before DELIVERED Status
**Objective:** Verify POD only available when status is DELIVERED

**Pre-condition:** Load at REACHED_DESTINATION status

**Steps:**
1. View Load Details page
2. Scroll to Documents section
3. Try to select "Proof of Delivery" from dropdown

**Verification:**
- [ ] "Proof of Delivery" option not visible in dropdown (or disabled)
- [ ] Only other document types available: Bill of Lading, Scale Ticket, etc.
- [ ] No POD row in documents table yet

**Pass Criteria:** POD not available before DELIVERED status

---

### Test Case 6.2: Trigger POD Auto-Generation on DELIVERED Status
**Objective:** Test POD auto-generation when load marked DELIVERED

**Steps:**
1. In Load Details, click Transport Status: "DELIVERED"
2. In Load Status Information table, select status "DELIVERED" (if separate dropdown)
3. Click "Save Details"

**Verification (UI):**
- [ ] Toast notification: "Details updated" or "Transport status updated"
- [ ] TransportStatus changes to "DELIVERED"
- [ ] Page may briefly show loading indicator

**Verification (Backend - Check API response):**
```json
{
  "loadId": "LD-0001",
  "transportStatus": "DELIVERED",
  "documents": [
    {
      "documentType": "Proof of Delivery",
      "fileName": "LD-0001-POD.pdf",
      "filePath": "uploads/pod/LD-0001-POD.pdf",
      "dateReceived": "2026-05-16T20:30:45.123Z"
    },
    ...
  ]
}
```

**Pass Criteria:** POD document auto-generated and added to documents array

---

### Test Case 6.3: Verify POD File Created in File System
**Objective:** Confirm PDF file exists at expected location

**Steps:**
1. In server terminal, verify file exists:

```bash
Test-Path "D:\fms\FMSS\FMSS\server\uploads\pod\LD-0001-POD.pdf"
# Expected: True
```

2. Optionally, check file size:
```bash
Get-Item "D:\fms\FMSS\FMSS\server\uploads\pod\LD-0001-POD.pdf" | Select-Object Length
# Expected: ~10-50 KB (PDF file with embedded data)
```

**Verification:**
- [ ] File exists at path: `server/uploads/pod/LD-0001-POD.pdf`
- [ ] File size > 0 KB (not empty)
- [ ] File is readable PDF (try opening in Adobe Reader or browser)

**Pass Criteria:** PDF file created and accessible

---

### Test Case 6.4: POD Now Visible in Documents Table
**Objective:** Verify POD appears in load's documents after generation

**Steps:**
1. Refresh Load Details page
2. Scroll to Documents section
3. Look for POD in documents table

**Verification:**
- [ ] POD appears as row in Documents table
- [ ] Document Type: "Proof of Delivery"
- [ ] File Name: "LD-0001-POD.pdf"
- [ ] Date Received: Current timestamp (or delivery timestamp)
- [ ] "View" link present
- [ ] No Delete button next to POD (cannot delete auto-generated)
- [ ] "Auto-generated" badge visible next to POD

**Pass Criteria:** POD row visible in documents table with auto-generated badge

---

### Test Case 6.5: POD View Functionality
**Objective:** Verify POD PDF can be viewed/downloaded

**Steps:**
1. Click "View" link next to POD document
2. PDF opens in new browser tab

**Verification:**
- [ ] New tab opens with PDF viewer
- [ ] PDF displays correctly (not corrupted)
- [ ] PDF contains load details:
  - Truck icon or header
  - Shipper details (pickup address, company)
  - Consignee details (drop address, company)
  - Commodity table (with 4 rows)
  - Loading/Unloading times table
  - Signature section (if signature data provided)
- [ ] Can download PDF
- [ ] File name: `LD-0001-POD.pdf`

**Pass Criteria:** PDF opens, displays correctly, contains expected load information

---

### Test Case 6.6: Cannot Manually Upload POD After Auto-Generation
**Objective:** Ensure POD cannot be manually overwritten after auto-generation

**Steps:**
1. In Load Details Documents section
2. Try to select "Proof of Delivery" from dropdown

**Verification:**
- [ ] POD not in dropdown list (only 8 other types)
- [ ] No upload option for POD available

**Pass Criteria:** POD remains auto-generated only, cannot be manually replaced

---

### Test Case 6.7: Non-POD Documents Still Uploadable After Delivery
**Objective:** Verify other documents can still be uploaded after POD generation

**Steps:**
1. Select "Carrier Invoice" from dropdown
2. Choose file, upload

**Verification:**
- [ ] Upload succeeds
- [ ] Document appears in table
- [ ] Now 2 documents in table: POD (auto-generated) + Carrier Invoice (uploaded)
- [ ] POD still shows "Auto-generated" badge
- [ ] Carrier Invoice shows normal (without badge)

**Pass Criteria:** Non-POD documents uploadable post-delivery, POD remains auto-generated

---

## Phase 7: Final Verification

### Test Case 7.1: Database Document Record Check
**Objective:** Verify all changes persisted in MongoDB

**Steps:**
1. Use MongoDB Compass or Postman to query load:

```
GET http://localhost:5001/loads/LD-0001
```

2. Review response JSON structure

**Verification:**
- [ ] Load document contains:
  ```json
  {
    "loadId": "LD-0001",
    "customerName": "Client Name",
    "refNo": "TEST-REF-001",
    "bidStatus": "CLOSED",
    "transportStatus": "DELIVERED",
    "winningBid": { "amount": 4100, "fleetOwnerId": "..." },
    "assignedFleetOwner": { "fleetOwnerId": "...", "assignedAt": "..." },
    "targetRate": 4000,
    "margin": 500,
    "vendorRate": 4500,
    "bookingProblem": false,
    "putOnHold": true,
    "hotShipment": false,
    "isAccessorialCharges": false,
    "documents": [
      {
        "documentType": "Proof of Delivery",
        "fileName": "LD-0001-POD.pdf",
        "filePath": "uploads/pod/LD-0001-POD.pdf",
        "dateReceived": "2026-05-16T..."
      },
      {
        "documentType": "Bill Of Lading",
        "fileName": "test.pdf",
        "dateReceived": "2026-05-16T..."
      }
    ],
    "pickup": {
      "address": "123 Main St",
      "city": "Los Angeles",
      "state": "CA",
      "apptNumber": "APT-001",
      "pickupDate": "2026-05-17T..."
    },
    "drop": {
      "address": "456 Oak Ave",
      "city": "New York",
      "state": "NY",
      "deliveryDate": "2026-05-20T..."
    }
  }
  ```

**Pass Criteria:** All fields present and correctly valued in database

---

### Test Case 7.2: Complete Load Details Page Review
**Objective:** Final verification that all page sections display correctly

**Steps:**
1. Open Load Details for LD-0001
2. Verify each section one more time

**Verification Checklist:**
- [ ] Identification: All fields + checkboxes visible
- [ ] Order Identification: Yellow background, all 14+ fields present
- [ ] Origin(s): Orange table with row data
- [ ] Destination(s): Teal table with row data
- [ ] Load Status Information: Amber table with status controls
- [ ] Routing: Pier Termination + Contact info
- [ ] Additional Info: Invoice#, Carrier, DateTime
- [ ] Documents: POD (auto-generated) + Bill of Lading (uploaded) visible
- [ ] Transport Status: Buttons show "DELIVERED" selected
- [ ] Save Details button present

**Pass Criteria:** All 8+ sections display with correct data

---

### Test Case 7.3: Regression Test - Original Functionality
**Objective:** Ensure no existing functionality was broken

**Steps:**
1. Create new client user
2. Create new load
3. Verify load creation still works
4. Verify staff can verify/approve load
5. Verify load appears in load lists
6. Verify load can be deleted (if allowed)

**Verification:**
- [ ] New load creation works without errors
- [ ] Load lists filter correctly (by status, customer, date)
- [ ] Load search/filter functional
- [ ] Load export (if available) works

**Pass Criteria:** No regressions, existing features work

---

### Test Case 7.4: Error Handling Verification
**Objective:** Test error cases and edge conditions

**Steps:**
1. Try to award non-existent bid ID
2. Try to submit bid on closed load
3. Try to upload invalid file format for document
4. Try to mark load as delivered without mandatory fields

**Expected Responses:**
- [ ] Invalid bid ID: `400 Bad Request - Bid not found`
- [ ] Closed bidding: `400 Bad Request - Bidding window closed`
- [ ] Invalid file: `400 Bad Request - Invalid file format`
- [ ] Missing fields: `400 Bad Request - Required fields missing`

**Pass Criteria:** Appropriate error messages returned

---

## Summary Checklist

### REQ 14 (Bid Management) ✓
- [ ] Award Bid - Staff manually selects winning bid
- [ ] Discard Bid - Individual bids can be removed
- [ ] Multiple bids submitted correctly

### REQ 15 (Rate & Margin) ✓
- [ ] targetRate: 4000
- [ ] margin: 500
- [ ] vendorRate calculated: 4500

### REQ 16 (Reschedule & Rebid) ✓
- [ ] Reschedule Bidding - Times changed, bids kept
- [ ] Rebid Load - All bids cleared, fresh start

### REQ 18 (Document Type Removal) ✓
- [ ] Load Order removed from dropdown
- [ ] Accessorial Charges removed from dropdown

### REQ 19 (POD Restrictions) ✓
- [ ] POD not available before DELIVERED
- [ ] POD cannot be manually uploaded
- [ ] POD shows "Auto-generated" badge

### REQ 20 (Invoice Rename) ✓
- [ ] Invoice renamed to "Carrier Invoice"
- [ ] Carrier Invoice uploadable normally

### POD Auto-Generation ✓
- [ ] PDF generated on DELIVERED status
- [ ] File created at: `server/uploads/pod/LD-0001-POD.pdf`
- [ ] Document added to load.documents array
- [ ] POD viewable/downloadable

### REQ 21 (Load Detail Page) ✓
- [ ] Identification section with checkboxes
- [ ] Order Identification (yellow) with all fields
- [ ] Origin(s) table (orange)
- [ ] Destination(s) table (teal)
- [ ] Load Status Information (amber)
- [ ] Routing section
- [ ] Additional Info fields
- [ ] All fields editable and persistent

---

## Test Execution Notes

**Tester:** _______________  
**Date:** _______________  
**Environment:** Development (localhost)  
**Total Duration:** ~45 minutes  

### Issues Found:
```
1. 
2. 
3. 
```

### Pass/Fail: _______________

---

## Rollback Instructions (if needed)

```bash
# Reset test load data
db.loads.deleteOne({ loadId: "LD-0001" })
db.loads.deleteOne({ loadId: "LD-0002" })
db.loads.deleteOne({ loadId: "LD-0003" })

# Clear POD files
Remove-Item "D:\fms\FMSS\FMSS\server\uploads\pod\*" -Force

# Clear document uploads
Remove-Item "D:\fms\FMSS\FMSS\server\uploads\*" -Force -Exclude pod
```

---

**End of Testing Flow**
