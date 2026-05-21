# FMS (Freight Management System) - User Manual

## Table of Contents
1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [Login Credentials](#login-credentials)
4. [User Roles & Workflows](#user-roles--workflows)
5. [Client Workflow](#client-workflow)
6. [Staff Workflow](#staff-workflow)
7. [Fleet Owner Workflow](#fleet-owner-workflow)
8. [API Endpoints](#api-endpoints)

---

## System Overview

FMS is a comprehensive freight management system that connects clients (shippers) with fleet owners (carriers) through a competitive bidding process. The system manages the entire lifecycle from load creation to bid selection.

### Key Features
- **Load Management**: Create, verify, and track transport loads
- **Bidding System**: Automated bidding with scheduled open/close times
- **Auto-Selection**: Automatic selection of lowest bid when bidding closes
- **Role-Based Dashboards**: Customized dashboards for each user type
- **Real-time Stats**: Live statistics and countdown timers

---

## Getting Started

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd server
   PORT=5001 node index.js
   ```
   Server runs at: `http://localhost:5001`

2. **Start the Frontend Development Server**
   ```bash
   cd client
   npm run dev
   ```
   Frontend runs at: `http://localhost:5173` (or 5174 if 5173 is busy)

3. **MongoDB Connection**
   - Default: `mongodb://127.0.0.1:27018/fms?replicaSet=rs0`
   - Start the local replica set with `mongod --dbpath "mongo-rs/data" --replSet rs0 --bind_ip 127.0.0.1 --port 27018 --logpath "mongo-rs/log/mongod.log" --logappend`

---

## Login Credentials

### Staff/Admin Users
| Email | Password | Role | Description |
|-------|----------|------|-------------|
| `admin@fms.com` | `password123` | staff | System Administrator |

### Client Users
| Email | Password | Role | Description |
|-------|----------|------|-------------|
| `client@fms.com` | `password123` | client | Test Client Account |
| `rajesh@example.com` | `password123` | client | Rajesh Kumar |
| `priya@example.com` | `password123` | client | Priya Sharma |
| `amit@example.com` | `password123` | client | Amit Patel |

### Fleet Owner Users
| Email | Password | Role | Company |
|-------|----------|------|---------|
| `vendor@fms.com` | `password123` | fleetOwner | Test Fleet Co |
| `suresh@logistics.com` | `password123` | fleetOwner | Suresh Express Cargo |
| `quick@transport.com` | `password123` | fleetOwner | Quick Transport Solutions |
| `safe@carriers.com` | `password123` | fleetOwner | Safe & Secure Carriers |

---

## User Roles & Workflows

### Business Flow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CLIENT    │     │    STAFF    │     │  BIDDING    │     │ FLEET OWNER │
│  Creates    │────▶│  Verifies   │────▶│  Opens at   │────▶│   Places    │
│   Load      │     │   Load      │     │ Scheduled   │     │    Bid      │
│             │     │             │     │   Time      │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                                                                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   TRIP      │◀────│  BIDDING    │◀────│ System Auto-Selects         │
│  ASSIGNED   │     │   CLOSES    │     │ Lowest Bid When Timer Ends  │
└─────────────┘     └─────────────┘     └─────────────────────────────┘
```

### Load Status Flow
1. **PENDING_VERIFICATION** - Load created by client, awaiting staff review
2. **REQUIRES_CHANGES** - Staff requested modifications
3. **VERIFIED** - Approved by staff, ready for bidding

### Bid Status Flow
1. **UPCOMING** - Verified load, bidding not yet started
2. **OPEN** - Bidding window is active
3. **CLOSED** - Bidding ended, winner selected

---

## Client Workflow

### Login URL
`http://localhost:5174/client-login`

### Dashboard Features
- **Total Loads**: All loads created by the client
- **Pending Verification**: Loads awaiting staff approval
- **Verified Loads**: Approved loads
- **Requires Changes**: Loads needing modifications
- **Active Bidding**: Loads with open bidding
- **Completed Bidding**: Loads with awarded bids

### Creating a New Load

1. Login as a client user
2. Click **"New Load"** in the sidebar or **"Create New Load"** button on dashboard
3. Fill in the load details:
   - **Customer Name**: Shipper name
   - **Pickup Location**: City, State
   - **Drop Location**: City, State
   - **Truck Type**: Flatbed, Container, Refrigerated, etc.
   - **Material**: Type of goods being transported
   - **Amount/Rate**: Expected transportation cost
4. Submit the form
5. Load status becomes **PENDING_VERIFICATION**

### Viewing Load Status
- Navigate to **"My Loads"** to see all your loads
- Check **"Active Bids"** to see live bidding status

---

## Staff Workflow

### Login URL
`http://localhost:5174/staff-login`

### Dashboard Features
- **Total Customers**: Number of registered clients
- **Fleet Owners**: Number of registered carriers
- **Total Loads**: System-wide load count
- **Pending Verification**: Loads awaiting review
- **Verified Loads**: Approved loads
- **Requires Changes**: Loads sent back for modifications
- **Upcoming Bidding**: Verified loads ready for scheduling
- **Active Bidding**: Currently open bids

### Main Tasks

#### 1. Managing Customers
- Navigate to **"Customer"** in sidebar
- View all registered clients
- Click **"Add Customer"** to create new client accounts

#### 2. Managing Fleet Owners
- Navigate to **"Fleet Owners"** in sidebar
- View all registered carriers
- Click **"Add Fleet Owner"** to create new carrier accounts

#### 3. Verifying Loads (Critical Task)
1. Navigate to **"Pending Loads"**
2. Review load details in the table
3. Click **"Verify"** to approve the load
   - Load status changes to **VERIFIED**
   - Bid status becomes **UPCOMING**
4. OR Click **"Request Changes"** if modifications needed
   - Load status changes to **REQUIRES_CHANGES**

#### 4. Scheduling Bidding
1. Navigate to **"Bidding Loads"**
2. Find loads with **UPCOMING** bid status
3. Click **"Schedule Bidding"** button
4. Set the bidding window:
   - **Start Time**: When bidding opens
   - **End Time**: When bidding closes (winner auto-selected)
5. When start time arrives, bid status changes to **OPEN**

#### 5. Email Configuration
- Navigate to **"Masters" → "Email Settings"**
- Configure SMTP settings for notifications

---

## Fleet Owner Workflow

### Login URL
`http://localhost:5174/vendor-login`

### Dashboard Features
- **Available Loads**: Loads with open bidding
- **Upcoming Bidding**: Loads scheduled to open soon
- **Total Bids Placed**: Your bid count
- **Won Bids**: Bids you've won

### Live Bidding Section
The dashboard shows real-time bidding information:
- Load ID and route
- Customer name
- Current rate
- Number of bids placed
- **Countdown timer** showing time remaining

### Main Tasks

#### 1. Viewing Available Loads
- Navigate to **"Available Bookings"** or click **"Available Loads"** quick action
- See all loads with open bidding

#### 2. Placing a Bid
1. Click on a load from the Live Bidding section
2. OR Navigate directly to `/fleetOwner/place-bid/LD-XXX`
3. Review load details:
   - Customer name
   - Pickup and drop locations
   - Truck type required
   - Material type
   - Base rate
4. Enter your competitive bid amount
5. Click **"Place Bid"**

**Tip**: Enter an amount **less than** the base rate to be competitive. The lowest bid wins when the timer expires.

#### 3. Tracking Your Bids
- Navigate to **"My Bids"** to see all your placed bids
- Navigate to **"Won Bids"** to see awarded contracts

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |

### Loads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads` | Get all loads |
| GET | `/api/loads?status=PENDING_VERIFICATION` | Get pending loads |
| GET | `/api/loads?status=VERIFIED` | Get verified loads |
| GET | `/api/loads?bidStatus=OPEN` | Get loads with open bidding |
| POST | `/api/loads` | Create new load |
| PUT | `/api/loads/:loadId/status` | Update load status |
| PUT | `/api/loads/:loadId/bidding` | Schedule bidding |

### Bids
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads/:loadId/bids` | Get bids for a load |
| POST | `/api/loads/:loadId/bids` | Place a bid |
| PUT | `/api/loads/:loadId/bids/:bidId/accept` | Accept a bid |

### Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Get role-based dashboard stats |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/email` | Get email configuration |
| PUT | `/api/config/email` | Update email configuration |

---

## Automated Features

### Cron Jobs
The system runs automated tasks:

1. **Auto-Open Bids**: When scheduled start time arrives, bid status changes from UPCOMING to OPEN
2. **Auto-Close Bids**: When end time arrives, bid status changes to CLOSED and the lowest bid is automatically selected as the winner

### Winner Selection Logic
When bidding closes:
1. System finds all bids for the load
2. Selects the bid with the **lowest amount**
3. Updates the load with `winningBid` information
4. Bid status changes to **CLOSED**

---

## Sample Test Data

### Pre-seeded Loads
| Load ID | Customer | Route | Status | Bid Status |
|---------|----------|-------|--------|------------|
| LD-001 | Rajesh Kumar | Mumbai → Pune | VERIFIED | UPCOMING |
| LD-002 | Priya Sharma | Delhi → Jaipur | PENDING | - |
| LD-003 | Amit Patel | Chennai → Bangalore | REQUIRES_CHANGES | - |
| LD-004 | Test Client | Bangalore → Hyderabad | VERIFIED | UPCOMING |
| LD-005 | Rajesh Kumar | Chennai → Coimbatore | VERIFIED | UPCOMING |
| LD-006 | Priya Sharma | Kolkata → Bhubaneswar | VERIFIED | OPEN |
| LD-007 | Test Client | Lucknow → Kanpur | VERIFIED | OPEN |
| LD-008 | Amit Patel | Indore → Bhopal | VERIFIED | OPEN |

---

## Troubleshooting

### Common Issues

1. **"Not authorized, no token"**
   - Make sure you're logged in
   - Token may have expired, log in again

2. **Stats showing 0**
   - Refresh the page
   - Check if backend server is running

3. **Bid not submitting**
   - Ensure bidding is OPEN (not UPCOMING or CLOSED)
   - Check browser console for errors

4. **Database connection errors**
   - Verify MongoDB is running on port `27018`
   - Check connection string in `server/.env`

### Support
For technical issues, check:
- Backend logs in terminal
- Browser developer console (F12)
- Network tab for API responses

---

## Quick Reference

### URL Summary
| Portal | URL |
|--------|-----|
| Client Login | `/client-login` |
| Client Dashboard | `/client/dashboard` |
| Staff Login | `/staff-login` |
| Staff Dashboard | `/staff/dashboard` |
| Fleet Owner Login | `/vendor-login` |
| Fleet Owner Dashboard | `/fleetOwner/dashboard` |
| API Documentation | `/api-docs` (Swagger) |

### Default Password
All test accounts use: `password123`
