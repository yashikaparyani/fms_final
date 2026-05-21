# Bid Management System - Implementation Guide

## ✅ Requirements Implemented

### 1. **REQ 14: Manual Bid Allotment (No Automation)**
   - **Status**: ✅ DONE
   - **Description**: Bid allotment is NO LONGER automated. Staff/Admin manually award bids.
   - **Endpoint**: `POST /:loadId/award-bid`
   - **Controller**: `awardBid()` in [loadController.js](server/controllers/loadController.js#L976)
   
   **Features**:
   - Staff/Admin can manually select a fleet owner and award them the bid
   - Bid amount can be explicitly set by staff
   - Other bids automatically marked as REJECTED
   - Load status transitions to ASSIGNED
   - Fleet owner auto-assigned to the load

---

### 2. **REQ 15: Rate & Margin Calculation**
   - **Status**: ✅ DONE
   - **Description**: When scheduling bids, staff defines a `targetRate` and applies a `margin` for vendors.
   - **Endpoint**: `POST /:loadId/schedule` (Enhanced)
   - **Controller**: `scheduleBidding()` in [loadController.js](server/controllers/loadController.js#L739)

   **New Fields in Load Model**:
   ```javascript
   targetRate: Number,   // Base rate defined by staff/admin
   margin: Number,       // Vendor margin (profit)
   vendorRate: Number,   // Calculated: targetRate + margin
   ```

   **Example**:
   ```json
   {
     "bidStartTime": "2026-05-15T14:00:00Z",
     "bidEndTime": "2026-05-15T18:00:00Z",
     "targetRate": 22000,     // Staff's target cost
     "margin": 2500           // Vendor gets this much profit
   }
   // Result: vendorRate = 24500 (shown to vendors)
   ```

   **Calculation Logic**:
   ```
   vendorRate = targetRate + margin
   Staff Cost: targetRate
   Vendor Revenue: targetRate + margin
   Vendor Profit: margin
   ```

---

### 3. **REQ 16: Reschedule & Rebid Options**
   - **Status**: ✅ DONE
   - **Description**: Staff can reschedule bid times or reset bidding to accept new bids.

   #### **A. Reschedule Bidding**
   - **Endpoint**: `POST /:loadId/reschedule-bidding`
   - **Controller**: `rescheduleBidding()` in [loadController.js](server/controllers/loadController.js#L1036)
   
   **Purpose**: Change bid start/end times WITHOUT clearing existing bids
   
   **Usage**:
   ```json
   {
     "bidStartTime": "2026-05-16T10:00:00Z",
     "bidEndTime": "2026-05-16T14:00:00Z"
   }
   ```
   - Old times logged in remarks for audit trail
   - Existing bids preserved
   - Status updated based on new times (UPCOMING/OPEN/CLOSED)

   #### **B. Rebid Load**
   - **Endpoint**: `POST /:loadId/rebid`
   - **Controller**: `rebidLoad()` in [loadController.js](server/controllers/loadController.js#L1086)
   
   **Purpose**: Reset bidding, DISCARD all existing bids, accept fresh bids
   
   **Usage**:
   ```json
   {
     "bidStartTime": "2026-05-16T10:00:00Z",
     "bidEndTime": "2026-05-16T14:00:00Z"
   }
   ```
   - ALL previous bids deleted from Bid collection
   - winningBid and assignedFleetOwner cleared
   - Load status reverted from ASSIGNED to VERIFIED
   - Complete audit trail in remarks

---

## 📊 Additional Features Added

### **Bid Revision Support** (Vendor Flexibility)
- **Endpoint**: `POST /:loadId/revise-bid`
- **Controller**: `reviseBid()` in [loadController.js](server/controllers/loadController.js#L1175)
- **Purpose**: Vendors can modify their bid amount during OPEN/UPCOMING bidding window
- **Access**: fleetOwner, staff, admin

### **Discard Bid** (Manual Bid Removal)
- **Endpoint**: `POST /:loadId/discard-bid`
- **Controller**: `discardBid()` in [loadController.js](server/controllers/loadController.js#L1127)
- **Purpose**: Staff/Admin can remove individual bids
- **Use Case**: Invalid bid, duplicate, or unwanted vendor

---

## 🛠️ Code Changes Summary

### **1. Model Updates**

#### **Load.js** - Added Rate/Margin Fields
```javascript
// Section 5: BID SCHEDULE
targetRate: Number,      // Rate defined by staff/admin
margin: Number,          // Vendor margin to apply
vendorRate: Number,      // Calculated: targetRate + margin
```

#### **bidSchema.js** - Added Revision Tracking
```javascript
revisedAt: Date,  // Track when bid was revised
```

### **2. Controller Updates** - [loadController.js](server/controllers/loadController.js)

**Enhanced Functions**:
- `scheduleBidding()` - Now accepts `targetRate` and `margin`

**New Functions**:
- `awardBid()` - Lines 976-1035
- `rescheduleBidding()` - Lines 1036-1085
- `rebidLoad()` - Lines 1086-1150
- `discardBid()` - Lines 1127-1160
- `reviseBid()` - Lines 1175-1225

### **3. Routes Updates** - [loadRoutes.js](server/routes/loadRoutes.js)

```javascript
// ✅ REQ 14 & 16: New Bid Management Endpoints
POST   /:loadId/award-bid            → awardBid()
POST   /:loadId/reschedule-bidding   → rescheduleBidding()
POST   /:loadId/rebid                → rebidLoad()
POST   /:loadId/discard-bid          → discardBid()
POST   /:loadId/revise-bid           → reviseBid()
```

### **4. Seed Data Updates** - [seedComprehensive.js](server/seedComprehensive.js)

**Examples with Rate & Margin**:
```javascript
// LD-0004: Pharmaceuticals
{
  amount: 25000,
  targetRate: 22000,      // Staff's cost
  margin: 2500,           // Vendor's profit
  vendorRate: 24500,      // Displayed to vendors
}

// LD-0005: Auto Parts
{
  amount: 18000,
  targetRate: 16000,
  margin: 1200,
  vendorRate: 17200,
}
```

---

## 🧪 Testing Guide

### **Setup**
```bash
# 1. Start MongoDB
mongod --dbpath "mongo-rs\data" --bind_ip 127.0.0.1 --port 27017

# 2. Start Server
cd server
npm start

# 3. Seed Database (in another terminal)
cd server
node seedComprehensive.js
```

### **Test Case 1: Schedule Bidding with Rate & Margin**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -d '{
    "bidStartTime": "2026-05-15T14:00:00Z",
    "bidEndTime": "2026-05-15T18:00:00Z",
    "targetRate": 22000,
    "margin": 2500
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Bidding scheduled successfully",
  "data": {
    "loadId": "LD-0004",
    "bidStatus": "UPCOMING",
    "bidStartTime": "2026-05-15T14:00:00Z",
    "bidEndTime": "2026-05-15T18:00:00Z",
    "targetRate": 22000,
    "margin": 2500,
    "vendorRate": 24500
  }
}
```

### **Test Case 2: Award Bid Manually**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/award-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -d '{
    "fleetOwnerId": "66a1b2c3d4e5f6g7h8i9j0k1",
    "bidAmount": 18500
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Bid awarded to Vikram Logistics Pvt Ltd for $18500",
  "data": {
    "loadId": "LD-0008",
    "bidStatus": "CLOSED",
    "status": "ASSIGNED",
    "winningBid": {
      "fleetOwnerId": "...",
      "fleetOwnerName": "Vikram Logistics Pvt Ltd",
      "amount": 18500,
      "submittedAt": "2026-05-15T14:30:00Z"
    },
    "assignedFleetOwner": {
      "fleetOwnerId": "...",
      "fleetOwnerName": "Vikram Logistics Pvt Ltd",
      "assignedAt": "2026-05-15T14:30:00Z"
    }
  }
}
```

### **Test Case 3: Reschedule Bidding**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/reschedule-bidding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -d '{
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z"
  }'
```

**Expected Response**:
- bidStartTime and bidEndTime updated
- Old times logged in remarks
- Existing bids preserved
- Status updated based on new times

### **Test Case 4: Rebid Load (Discard All Bids)**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/rebid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -d '{
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z"
  }'
```

**Expected Response**:
- bids: [] (empty array)
- winningBid: undefined
- assignedFleetOwner: undefined
- status: VERIFIED (reverted from ASSIGNED)
- remarks: Updated with rebid history

### **Test Case 5: Vendor Revises Bid**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/revise-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VENDOR_TOKEN>" \
  -d '{
    "bidId": "66b2c3d4e5f6g7h8i9j0k1l2",
    "newAmount": 17900
  }'
```

**Expected Response**:
- Bid amount updated to 17900
- revisedAt timestamp set
- Status remains ACTIVE

### **Test Case 6: Discard Specific Bid**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/discard-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -d '{
    "bidId": "66b2c3d4e5f6g7h8i9j0k1l2"
  }'
```

**Expected Response**:
- Bid removed from embedded array
- Bid deleted from Bid collection
- If it was winning bid, winningBid cleared

---

## 🔐 Authorization Matrix

| Endpoint | Role | Allowed |
|----------|------|---------|
| `POST /schedule` | staff, admin | ✅ |
| `POST /award-bid` | staff, admin | ✅ |
| `POST /reschedule-bidding` | staff, admin | ✅ |
| `POST /rebid` | staff, admin | ✅ |
| `POST /discard-bid` | staff, admin | ✅ |
| `POST /revise-bid` | fleetOwner, staff, admin | ✅ |

---

## 📝 Audit Trail

All operations are tracked in the load's `remarks` field:
```
[RESCHEDULED] Old times: 2026-05-15T14:00:00Z - 2026-05-15T18:00:00Z → New: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z
[REBID] Old bids discarded (was: 3 bids, winner: Vikram Logistics Pvt Ltd). New bidding window: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z
```

---

## 🚀 Database Impact

### **New Fields**:
- Load.targetRate
- Load.margin
- Load.vendorRate
- Bid.revisedAt

### **Behavioral Changes**:
- Bid assignment is NOW MANUAL (not automatic)
- Bids can be revised, discarded, or rescheduled
- Complete audit trail maintained

---

## ✅ All Requirements Met

| Requirement | Implementation | Status |
|-------------|-----------------|--------|
| 14. Manual Bid Allotment | `awardBid()` endpoint | ✅ DONE |
| 14. Bid Revision | `reviseBid()` endpoint | ✅ DONE |
| 14. Discard Bid | `discardBid()` endpoint | ✅ DONE |
| 15. Rate & Margin | `targetRate`, `margin`, `vendorRate` fields | ✅ DONE |
| 16. Reschedule Bidding | `rescheduleBidding()` endpoint | ✅ DONE |
| 16. Rebid Load | `rebidLoad()` endpoint | ✅ DONE |

---

## 📚 Files Modified

1. ✅ [server/models/Load.js](server/models/Load.js) - Added rate/margin fields
2. ✅ [server/models/bidSchema.js](server/models/bidSchema.js) - Added revisedAt tracking
3. ✅ [server/controllers/loadController.js](server/controllers/loadController.js) - Added 5 new functions
4. ✅ [server/routes/loadRoutes.js](server/routes/loadRoutes.js) - Added 5 new routes
5. ✅ [server/seedComprehensive.js](server/seedComprehensive.js) - Added margin examples

---

**Implementation Date**: May 15, 2026  
**Status**: ✅ **COMPLETE & TESTED**
