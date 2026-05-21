# Bid Management Architecture - Design Decisions

## 🏗️ System Architecture Overview

### **Before Implementation**
```
Load Created → Staff Verifies → Bid Window Opens → Bids Submitted → 
(AUTOMATED) Highest Bid Wins → Auto-Assign → Done
```

**Problem**: No manual control, no rate flexibility, no bid revisions

---

### **After Implementation**
```
Load Created → Staff Verifies → Schedule Bid (with Rate & Margin) → 
Bid Window Opens → Vendors Submit Bids & Can Revise → 
(MANUAL) Staff Awards Best Bid or Rescinds → 
Can Reschedule or Rebid Anytime → Assign Fleet Owner → Done
```

**Solution**: Full manual control, rate transparency, flexible bidding

---

## 🎯 Key Design Decisions

### **1. Manual Bid Allotment (No Automation)**

**Decision**: Remove auto-winner selection, implement `awardBid()` endpoint

**Why**:
- Staff needs flexibility to choose based on qualitative factors (ratings, feedback, etc.)
- May reject lowest bid if vendor has poor track record
- Allows negotiation before final award

**Implementation**:
```javascript
const awardBid = async (req, res) => {
  // Staff provides fleetOwnerId + amount
  // Automatically marks others as REJECTED
  // Sets status = ASSIGNED
  // Can be called multiple times (changes winning bid if needed)
}
```

**Data Flow**:
- Request: `{ fleetOwnerId, bidAmount }`
- Set: `load.winningBid = { fleetOwnerId, fleetOwnerName, amount, submittedAt }`
- Set: `load.status = "ASSIGNED"`
- Update: Bid collection status to "WINNING"/"REJECTED"

---

### **2. Rate & Margin Calculation**

**Decision**: Separate `targetRate` (staff cost) from `vendorRate` (what vendor sees)

**Why**:
- Staff controls profitability target (targetRate)
- Margin is the vendor's negotiable profit
- Transparency for both internal and external parties
- Audit trail of cost vs revenue

**Formula**:
```
vendorRate = targetRate + margin

Example:
- Staff's cost target: $20,000
- Vendor margin: $3,000
- Vendor sees/bids on: $23,000
```

**Implementation**:
```javascript
// In scheduleBidding()
if (targetRate !== undefined) {
  load.targetRate = targetRate;
  if (margin !== undefined) {
    load.margin = margin;
    load.vendorRate = targetRate + margin;
  } else {
    load.vendorRate = targetRate; // No margin = same as target
  }
}
```

**Database Schema**:
```javascript
// Load Model
targetRate: Number,    // What staff is willing to pay
margin: Number,        // What vendor earns
vendorRate: Number,    // What vendor sees: targetRate + margin
```

---

### **3. Reschedule vs Rebid**

**Decision**: Two separate operations for different use cases

#### **RESCHEDULE** (Keep existing bids)
```
Use Case: "Bids are slow, let's extend window by 2 hours"

Before:
- Bids: 2 active bids
- Start: 14:00, End: 18:00

After:
- Bids: 2 active bids (PRESERVED)
- Start: 14:00, End: 20:00 (extended)
```

#### **REBID** (Discard all, start fresh)
```
Use Case: "Wrong rate set, vendors submitted bad bids, start over"

Before:
- Bids: 3 bids (1 WINNING, 2 ACTIVE)
- Status: ASSIGNED
- winningBid: Set

After:
- Bids: [] (empty)
- Status: VERIFIED (reverted)
- winningBid: undefined
- assignedFleetOwner: undefined
```

**Implementation Details**:

**Reschedule**:
```javascript
// Keep load.bids, load.winningBid intact
load.bidStartTime = newStart;
load.bidEndTime = newEnd;
// Just update status based on new times
load.bidStatus = calculateStatus(now, newStart, newEnd);
```

**Rebid**:
```javascript
// Destroy everything
load.bids = [];
load.winningBid = undefined;
load.assignedFleetOwner = undefined;
load.status = "VERIFIED"; // Revert if ASSIGNED

// Delete from Bid collection too
await Bid.deleteMany({ loadId: load._id });
```

---

### **4. Bid Revision (Vendor Flexibility)**

**Decision**: Allow vendors to modify bid amount during OPEN/UPCOMING window

**Why**:
- Vendors can respond to market changes
- Encourages competitive bidding
- Flexibility without re-bidding entire load

**Implementation**:
```javascript
const reviseBid = async (req, res) => {
  // Only vendor who placed bid can revise (or staff override)
  // Can only revise if bidStatus is OPEN or UPCOMING
  // Update amount and set revisedAt timestamp
  
  bid.amount = newAmount;
  bid.revisedAt = new Date();
}
```

**Authorization**:
- Vendor: Can revise own bid only
- Staff/Admin: Can revise any bid

---

### **5. Discard Bid (Manual Removal)**

**Decision**: Allow staff to remove individual bids without rebidding

**Why**:
- Invalid bid (wrong format, rejected vendor)
- Duplicate submission
- Manual error correction
- Don't want to lose other good bids

**Implementation**:
```javascript
const discardBid = async (req, res) => {
  // Remove from embedded array
  load.bids = load.bids.filter(bid => bid._id !== bidId);
  
  // If it was winning bid, clear winning bid
  if (load.winningBid._id === bidId) {
    load.winningBid = undefined;
  }
  
  // Delete from Bid collection
  await Bid.findByIdAndDelete(bidId);
}
```

---

## 📊 Data Model Changes

### **Load Model**
```javascript
// SECTION 5: BID SCHEDULE (Enhanced)
bidStatus: String,        // UPCOMING | OPEN | CLOSED
bidStartTime: Date,       // When bidding opens
bidEndTime: Date,         // When bidding closes

// ✅ NEW FIELDS FOR RATE & MARGIN
targetRate: Number,       // Staff's cost target
margin: Number,           // Vendor's margin/profit
vendorRate: Number,       // Calculated: targetRate + margin

// SECTION 6: BID RESULT
winningBid: {
  fleetOwnerId: ObjectId,
  fleetOwnerName: String,
  amount: Number,         // Actual bid amount
  submittedAt: Date,
}

// Embedded array
bids: [
  {
    fleetOwnerId: ObjectId,
    fleetOwnerName: String,
    amount: Number,
    status: String,       // ACTIVE | WINNING | REJECTED
    submittedAt: Date,
    revisedAt: Date,      // ✅ NEW: Track revisions
  }
]
```

### **Bid Collection Model**
```javascript
{
  loadId: ObjectId,
  fleetOwnerId: ObjectId,
  amount: Number,
  status: String,         // ACTIVE | WINNING | REJECTED
  submittedAt: Date,
  revisedAt: Date,        // ✅ NEW: Track revisions
  timestamps: true
}
```

---

## 🔄 State Transitions

### **Load Status Flow**
```
PENDING_VERIFICATION → VERIFIED → UPCOMING (scheduling) 
  ↓
OPEN (bidding) → CLOSED (bids received)
  ↓
ASSIGNED (award bid) ↔ VERIFIED (rebid) [Can go back]
  ↓
IN_TRANSPORT (fleet owner accepts) → DELIVERED
```

### **Bid Status Flow**
```
[Bid Submitted]
  ↓
ACTIVE (in competition)
  ↓
├─→ WINNING (staff awards)
├─→ REJECTED (manually or after rebid)
└─→ [Deleted during rebid]
```

---

## 🔐 Security & Authorization

### **Role-Based Access**

**STAFF/ADMIN Only**:
- Schedule bids (with rate/margin)
- Award bids
- Reschedule bidding
- Rebid loads
- Discard bids
- Override bid revisions

**FLEET OWNER Only**:
- Submit bids (when bidStatus = OPEN)
- Revise own bids (when bidStatus = OPEN/UPCOMING)
- View load details and bid history

**CLIENT**:
- Create loads
- View bids received
- View awarded bid
- Cannot modify bid process

---

## 📝 Audit Trail

Every action logged in Load.remarks:
```
[RESCHEDULED] Old times: 2026-05-15T14:00:00Z - 2026-05-15T18:00:00Z 
             → New: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z

[REBID] Old bids discarded (was: 3 bids, winner: Vikram Logistics Pvt Ltd). 
        New bidding window: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z
```

---

## 🧮 Bid Amount Logic

### **How Vendors See Bid Amount**
```
Option 1: Using vendorRate (Recommended)
- Show vendorRate to vendor dashboard
- Vendor bids against vendorRate
- Actual bid = vendorRate (or less)

Option 2: Using amount field (Current)
- Vendors submit their desired amount
- Can be any price
- No rate guidance

Frontend Consideration:
- Should show [targetRate + margin = vendorRate] for transparency
- Vendor can bid BELOW vendorRate to be competitive
```

---

## 🚀 Future Enhancements

1. **Auto-Bid Reversion**: If no bid received within timeframe, auto-rebid
2. **Bid Analytics**: Track vendor bidding patterns, win rates
3. **Price History**: Historical rates for similar loads
4. **Automated Rate Suggestions**: ML-based targetRate recommendation
5. **Bid Notifications**: Real-time alerts when bids received/modified
6. **Bid Performance**: Dashboard showing bid-to-award-to-delivery metrics

---

## ✅ Testing Checklist

- [ ] Schedule bid with targetRate=20000, margin=3000 → vendorRate=23000 ✓
- [ ] Award bid to specific vendor → status becomes ASSIGNED ✓
- [ ] Reschedule bid times → existing bids preserved ✓
- [ ] Rebid load → all bids cleared, status reverted ✓
- [ ] Vendor revises bid → amount updated, revisedAt set ✓
- [ ] Staff discards bid → removed from both collections ✓
- [ ] Verify audit trail → remarks updated for each action ✓
- [ ] Test authorization → only staff can award/reschedule/rebid ✓
- [ ] Test data persistence → MongoDB updated correctly ✓

---

**Architecture Complete**: May 15, 2026
