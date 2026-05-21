# Bid Management API Reference

## Base URL
```
http://localhost:5001/api/loads
```

---

## 1. Schedule Bidding with Rate & Margin

**Endpoint**: `POST /:loadId/schedule`

**Authorization**: staff, admin

**Request Body**:
```json
{
  "bidStartTime": "2026-05-15T14:00:00Z",
  "bidEndTime": "2026-05-15T18:00:00Z",
  "targetRate": 22000,
  "margin": 2500
}
```

**Required Fields**:
- `bidStartTime` (Date) - When bidding opens
- `bidEndTime` (Date) - When bidding closes

**Optional Fields**:
- `targetRate` (Number) - Staff's cost target
- `margin` (Number) - Vendor margin

**Response** (Success):
```json
{
  "success": true,
  "message": "Bidding scheduled successfully",
  "data": {
    "_id": "...",
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

**Status Codes**:
- 200: Bidding scheduled successfully
- 400: Invalid date range or missing fields
- 404: Load not found
- 403: Unauthorized

---

## 2. Award Bid (Manual Allotment)

**Endpoint**: `POST /:loadId/award-bid`

**Authorization**: staff, admin

**Request Body**:
```json
{
  "fleetOwnerId": "66a1b2c3d4e5f6g7h8i9j0k1",
  "bidAmount": 18500
}
```

**Required Fields**:
- `fleetOwnerId` (ObjectId) - ID of fleet owner to award
- `bidAmount` (Number) - Amount to award

**Response** (Success):
```json
{
  "success": true,
  "message": "Bid awarded to Vikram Logistics Pvt Ltd for $18500",
  "data": {
    "_id": "...",
    "loadId": "LD-0008",
    "status": "ASSIGNED",
    "bidStatus": "CLOSED",
    "winningBid": {
      "fleetOwnerId": "66a1b2c3d4e5f6g7h8i9j0k1",
      "fleetOwnerName": "Vikram Logistics Pvt Ltd",
      "amount": 18500,
      "submittedAt": "2026-05-15T14:30:00Z"
    },
    "assignedFleetOwner": {
      "fleetOwnerId": "66a1b2c3d4e5f6g7h8i9j0k1",
      "fleetOwnerName": "Vikram Logistics Pvt Ltd",
      "assignedAt": "2026-05-15T14:30:00Z"
    }
  }
}
```

**Status Codes**:
- 200: Bid awarded successfully
- 400: Invalid fleetOwnerId or bidAmount
- 403: Not authorized
- 404: Load or Fleet Owner not found

**Behavior**:
- Sets `load.status = "ASSIGNED"`
- Sets `load.bidStatus = "CLOSED"`
- Marks bid as "WINNING" in Bid collection
- Marks all other bids as "REJECTED"
- Can be called multiple times (changes winner)

---

## 3. Reschedule Bidding

**Endpoint**: `POST /:loadId/reschedule-bidding`

**Authorization**: staff, admin

**Request Body**:
```json
{
  "bidStartTime": "2026-05-16T10:00:00Z",
  "bidEndTime": "2026-05-16T14:00:00Z"
}
```

**Required Fields**:
- `bidStartTime` (Date) - New start time
- `bidEndTime` (Date) - New end time

**Response** (Success):
```json
{
  "success": true,
  "message": "Bidding rescheduled successfully",
  "data": {
    "_id": "...",
    "loadId": "LD-0004",
    "bidStatus": "UPCOMING",
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z",
    "bids": [
      { "fleetOwnerId": "...", "amount": 23100, "status": "ACTIVE" },
      { "fleetOwnerId": "...", "amount": 24000, "status": "ACTIVE" }
    ],
    "remarks": "[RESCHEDULED] Old times: 2026-05-15T14:00:00Z - 2026-05-15T18:00:00Z → New: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z"
  }
}
```

**Status Codes**:
- 200: Bidding rescheduled
- 400: Invalid date range or wrong bidStatus
- 403: Not authorized
- 404: Load not found

**Behavior**:
- Preserves all existing bids
- Updates bid times
- Recalculates bidStatus (UPCOMING/OPEN/CLOSED based on current time)
- Logs old times in remarks for audit

---

## 4. Rebid Load (Discard All Bids)

**Endpoint**: `POST /:loadId/rebid`

**Authorization**: staff, admin

**Request Body**:
```json
{
  "bidStartTime": "2026-05-16T10:00:00Z",
  "bidEndTime": "2026-05-16T14:00:00Z"
}
```

**Required Fields**:
- `bidStartTime` (Date) - New start time
- `bidEndTime` (Date) - New end time

**Response** (Success):
```json
{
  "success": true,
  "message": "Load reset for re-bidding. Previous bids discarded.",
  "data": {
    "_id": "...",
    "loadId": "LD-0008",
    "status": "VERIFIED",
    "bidStatus": "UPCOMING",
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z",
    "bids": [],
    "winningBid": null,
    "assignedFleetOwner": null,
    "remarks": "[REBID] Old bids discarded (was: 3 bids, winner: Vikram Logistics Pvt Ltd). New bidding window: 2026-05-16T10:00:00Z - 2026-05-16T14:00:00Z"
  }
}
```

**Status Codes**:
- 200: Load reset successfully
- 400: Invalid date range or wrong bidStatus
- 403: Not authorized
- 404: Load not found

**Behavior**:
- Clears `load.bids = []`
- Clears `load.winningBid`
- Clears `load.assignedFleetOwner`
- Reverts `load.status` to "VERIFIED" if it was "ASSIGNED"
- Deletes all bids from Bid collection
- Logs action in remarks for audit
- New bidding window open for fresh bids

---

## 5. Revise Bid (Vendor Can Change Amount)

**Endpoint**: `POST /:loadId/revise-bid`

**Authorization**: fleetOwner, staff, admin

**Request Body**:
```json
{
  "bidId": "66b2c3d4e5f6g7h8i9j0k1l2",
  "newAmount": 22500
}
```

**Required Fields**:
- `bidId` (ObjectId) - ID of bid to revise
- `newAmount` (Number) - New bid amount (must be > 0)

**Response** (Success):
```json
{
  "success": true,
  "message": "Bid revised successfully",
  "data": {
    "_id": "...",
    "loadId": "LD-0008",
    "bidStatus": "OPEN",
    "bids": [
      {
        "_id": "66b2c3d4e5f6g7h8i9j0k1l2",
        "fleetOwnerId": "...",
        "amount": 22500,
        "status": "ACTIVE",
        "revisedAt": "2026-05-15T14:45:00Z"
      }
    ]
  }
}
```

**Status Codes**:
- 200: Bid revised successfully
- 400: Invalid bidAmount or wrong bidStatus
- 403: Not authorized (vendor can only revise own bid)
- 404: Bid or Load not found

**Behavior**:
- Updates bid amount
- Sets `revisedAt` timestamp
- Only works if bidStatus is "OPEN" or "UPCOMING"
- Vendor can only revise own bids (unless staff override)
- Both Load.bids and Bid collection updated

---

## 6. Discard Bid (Remove Single Bid)

**Endpoint**: `POST /:loadId/discard-bid`

**Authorization**: staff, admin

**Request Body**:
```json
{
  "bidId": "66b2c3d4e5f6g7h8i9j0k1l2"
}
```

**Required Fields**:
- `bidId` (ObjectId) - ID of bid to remove

**Response** (Success):
```json
{
  "success": true,
  "message": "Bid discarded successfully",
  "data": {
    "_id": "...",
    "loadId": "LD-0008",
    "bids": [
      { "_id": "...", "fleetOwnerId": "...", "amount": 23100, "status": "ACTIVE" }
    ]
  }
}
```

**Status Codes**:
- 200: Bid discarded successfully
- 403: Not authorized
- 404: Bid or Load not found

**Behavior**:
- Removes bid from embedded `load.bids` array
- Deletes bid from Bid collection
- If it was winning bid, clears `load.winningBid`
- Does not trigger rebid, other bids remain active

---

## Header Format

All requests should include:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

---

## Error Response Format

```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Examples Using cURL

### Schedule with Margin
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "bidStartTime": "2026-05-15T14:00:00Z",
    "bidEndTime": "2026-05-15T18:00:00Z",
    "targetRate": 22000,
    "margin": 2500
  }'
```

### Award Bid
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/award-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "fleetOwnerId": "66a1b2c3d4e5f6g7h8i9j0k1",
    "bidAmount": 18500
  }'
```

### Reschedule
```bash
curl -X POST http://localhost:5001/api/loads/LD-0004/reschedule-bidding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z"
  }'
```

### Rebid
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/rebid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "bidStartTime": "2026-05-16T10:00:00Z",
    "bidEndTime": "2026-05-16T14:00:00Z"
  }'
```

### Revise Bid (as Vendor)
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/revise-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VENDOR_TOKEN>" \
  -d '{
    "bidId": "66b2c3d4e5f6g7h8i9j0k1l2",
    "newAmount": 22500
  }'
```

### Discard Bid
```bash
curl -X POST http://localhost:5001/api/loads/LD-0008/discard-bid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "bidId": "66b2c3d4e5f6g7h8i9j0k1l2"
  }'
```

---

**API Documentation**: May 15, 2026
