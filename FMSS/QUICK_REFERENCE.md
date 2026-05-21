# Quick Reference - Bid Management Implementation

## 📍 Where Everything Is

### **Model Files**
- [server/models/Load.js](server/models/Load.js) - Added targetRate, margin, vendorRate fields
- [server/models/bidSchema.js](server/models/bidSchema.js) - Added revisedAt field

### **Controller File**
- [server/controllers/loadController.js](server/controllers/loadController.js) - **5 NEW FUNCTIONS**:
  - `awardBid()` - Line 976
  - `rescheduleBidding()` - Line 1036
  - `rebidLoad()` - Line 1086
  - `discardBid()` - Line 1127
  - `reviseBid()` - Line 1175

### **Routes File**
- [server/routes/loadRoutes.js](server/routes/loadRoutes.js) - **5 NEW ROUTES**:
  - POST `/:loadId/award-bid`
  - POST `/:loadId/reschedule-bidding`
  - POST `/:loadId/rebid`
  - POST `/:loadId/discard-bid`
  - POST `/:loadId/revise-bid`

### **Seed Data**
- [server/seedComprehensive.js](server/seedComprehensive.js) - Updated LD-0004 and LD-0005 with margin examples

---

## 🎯 Quick Feature Guide

### **1. Schedule Bid with Rate & Margin**
**File**: loadController.js, line 739  
**Route**: `POST /api/loads/:loadId/schedule`  
**Input**:
```json
{
  "bidStartTime": "2026-05-15T14:00:00Z",
  "bidEndTime": "2026-05-15T18:00:00Z",
  "targetRate": 22000,
  "margin": 2500
}
```

---

### **2. Manual Bid Award**
**File**: loadController.js, line 976  
**Route**: `POST /api/loads/:loadId/award-bid`  
**Input**:
```json
{
  "fleetOwnerId": "...",
  "bidAmount": 18500
}
```

---

### **3. Reschedule Bid Window**
**File**: loadController.js, line 1036  
**Route**: `POST /api/loads/:loadId/reschedule-bidding`  
**Input**:
```json
{
  "bidStartTime": "2026-05-16T10:00:00Z",
  "bidEndTime": "2026-05-16T14:00:00Z"
}
```

---

### **4. Rebid Load (Reset)**
**File**: loadController.js, line 1086  
**Route**: `POST /api/loads/:loadId/rebid`  
**Input**:
```json
{
  "bidStartTime": "2026-05-16T10:00:00Z",
  "bidEndTime": "2026-05-16T14:00:00Z"
}
```

---

### **5. Vendor Revises Bid**
**File**: loadController.js, line 1175  
**Route**: `POST /api/loads/:loadId/revise-bid`  
**Input**:
```json
{
  "bidId": "...",
  "newAmount": 22500
}
```

---

### **6. Discard Bid**
**File**: loadController.js, line 1127  
**Route**: `POST /api/loads/:loadId/discard-bid`  
**Input**:
```json
{
  "bidId": "..."
}
```

---

## 📋 Database Changes

### **Load Model**
```javascript
// New fields in Load schema:
targetRate: Number        // Staff's cost budget
margin: Number           // Vendor's profit margin
vendorRate: Number       // Calculated: targetRate + margin
```

### **Bid Model**
```javascript
// New field in Bid schema:
revisedAt: Date          // When bid was last revised
```

---

## 🔑 Key Variables

### **Rate Calculation**
```javascript
vendorRate = targetRate + margin

Example:
targetRate = 22000    // What we budget to pay
margin = 2500         // What vendor profits
vendorRate = 24500    // What vendor sees
```

---

## 🎭 Roles & Permissions

| Operation | Staff | Admin | FleetOwner | Client |
|-----------|-------|-------|-----------|--------|
| Schedule Bid | ✅ | ✅ | ❌ | ❌ |
| Award Bid | ✅ | ✅ | ❌ | ❌ |
| Reschedule | ✅ | ✅ | ❌ | ❌ |
| Rebid Load | ✅ | ✅ | ❌ | ❌ |
| Revise Bid | ❌ | ✅ | ✅ | ❌ |
| Discard Bid | ✅ | ✅ | ❌ | ❌ |

---

## 📊 Status Progression

### **Before Bid Management v2.0**
```
VERIFIED → OPEN (auto) → CLOSED (auto) → ASSIGNED (auto)
```

### **After Bid Management v2.0**
```
VERIFIED → OPEN (manual) → CLOSED (manual) → ASSIGNED (manual)
        ↕ Reschedule (keep bids)
        ↕ Rebid (reset to VERIFIED)
```

---

## 🧪 Test Commands (cURL)

### **Schedule**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"bidStartTime":"2026-05-15T14:00:00Z","bidEndTime":"2026-05-15T18:00:00Z","targetRate":22000,"margin":2500}'
```

### **Award**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/award-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"fleetOwnerId":"66a1b2c3d4e5f6g7h8i9j0k1","bidAmount":18500}'
```

### **Reschedule**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/reschedule-bidding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"bidStartTime":"2026-05-16T10:00:00Z","bidEndTime":"2026-05-16T14:00:00Z"}'
```

### **Rebid**
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/rebid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"bidStartTime":"2026-05-16T10:00:00Z","bidEndTime":"2026-05-16T14:00:00Z"}'
```

---

## 📚 Documentation Map

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | High-level overview |
| [BID_MANAGEMENT_IMPLEMENTATION.md](BID_MANAGEMENT_IMPLEMENTATION.md) | Detailed implementation guide |
| [BID_ARCHITECTURE_DESIGN.md](BID_ARCHITECTURE_DESIGN.md) | System architecture & design decisions |
| [API_REFERENCE_BID_MANAGEMENT.md](API_REFERENCE_BID_MANAGEMENT.md) | API endpoints reference |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | This file |

---

## ⚡ Critical Points

1. **Manual Award**: Highest bid NO LONGER automatically wins
2. **Rate Transparency**: targetRate (cost) vs margin (profit) clearly separated
3. **Flexible Rebidding**: Can reschedule (keep bids) or rebid (reset)
4. **Vendor Revisions**: Vendors can modify bid amounts during bidding window
5. **Audit Trail**: All actions logged in load.remarks for compliance
6. **Role-Based**: Only staff/admin can manage bid process

---

## 🚀 Startup Command

```bash
# Terminal 1: Start MongoDB
mongod --dbpath "mongo-rs\data" --bind_ip 127.0.0.1 --port 27017

# Terminal 2: Start Server
cd server
npm start

# Terminal 3: Seed Data (optional)
cd server
node seedComprehensive.js
```

---

## ✅ Verification Checklist

- [x] All 5 new functions implemented
- [x] All 5 new routes added
- [x] Model fields added (targetRate, margin, vendorRate)
- [x] Authorization checks implemented
- [x] Error handling complete
- [x] Audit trail logging added
- [x] Seed data updated with examples
- [x] No syntax errors
- [x] Documentation complete

---

**Quick Reference**: May 15, 2026 ✅ COMPLETE
