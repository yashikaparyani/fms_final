// mocks/db.js

let users = [
  {
    id: "1",
    firstName: "Akash",
    lastName: "User",
    email: "admin@test.com",
    password: "123456",
    role: "admin",
    permissions: [
      "load.view",
      "customer.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "2",
    firstName: "Vinod",
    lastName: "User",
    email: "staff@test.com",
    password: "123456",
    role: "staff",
    permissions: [
      "load.create",
      "load.verify",
      "customer.create",
      "customer.edit",
      "bidding.setDuration",
      "bidding.close"
    ],
    isVerified: true,
  },
  {
    id: "3",
    firstName: "Rajesh",
    lastName: "User",
    email: "customer@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "4",
    firstName: "Majesh",
    lastName: "User",
    email: "customer2@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "5",
    firstName: "Pajesh",
    lastName: "User",
    email: "customer3@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "6",
    firstName: "Kajesh",
    lastName: "User",
    email: "customer4@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "7",
    firstName: "Eajesh",
    lastName: "User",
    email: "customer5@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "8",
    firstName: "Fajesh",
    lastName: "User",
    email: "customer6@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "3",
    firstName: "Rajesh",
    lastName: "User",
    email: "customer@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "4",
    firstName: "Majesh",
    lastName: "User",
    email: "customer2@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "5",
    firstName: "Pajesh",
    lastName: "User",
    email: "customer3@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "6",
    firstName: "Kajesh",
    lastName: "User",
    email: "customer4@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "7",
    firstName: "Eajesh",
    lastName: "User",
    email: "customer5@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "8",
    firstName: "Fajesh",
    lastName: "User",
    email: "customer6@test.com",
    password: "123456",
    role: "client",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
  {
    id: "9",
    firstName: "Fajesh",
    lastName: "User",
    email: "fleetOwner@test.com",
    password: "123456",
    role: "fleetOwner",
    permissions: [
      "load.create",
      "load.view",
      "bidding.view"
    ],
    isVerified: true,
  },
];

let otpStore = {};
let resetTokens = {}; 
let loads = [
  {
    id: "LD1001",
    customer: "ABC Textiles",
    pickup: {
      city: "Mumbai",
      state: "MH"
    },
    drop: {
      city: "Delhi",
      state: "DL"
    },
    truckType: "32 ft Container",
    material: "Cotton Fabric Rolls",
    amount: 65000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-15T09:00:00Z",
    bidEndTime: "2026-03-20T17:00:00Z",
    date: "2026-02-05",
    bids: []
  },
  {
    id: "LD1006",
    customer: "Global Pharma",
    pickup: {
      city: "Hyderabad",
      state: "TS"
    },
    drop: {
      city: "Mumbai",
      state: "MH"
    },
    truckType: "Refrigerated 20 ft",
    material: "Pharmaceuticals",
    amount: 125000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-18T10:00:00Z",
    bidEndTime: "2026-03-23T18:00:00Z",
    date: "2026-03-10",
    bids: []
  },
  {
    id: "LD1007",
    customer: "Bharat Construction",
    pickup: {
      city: "Surat",
      state: "GJ"
    },
    drop: {
      city: "Ahmedabad",
      state: "GJ"
    },
    truckType: "24 ft Open Body",
    material: "Construction Steel",
    amount: 45000,
    createdBy: "staff",
    status: "PENDING_VERIFICATION",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-20T08:00:00Z",
    bidEndTime: "2026-03-25T17:00:00Z",
    date: "2026-03-12",
    bids: []
  },
  {
    id: "LD1008",
    customer: "Fresh Farm Produce",
    pickup: {
      city: "Nagpur",
      state: "MH"
    },
    drop: {
      city: "Pune",
      state: "MH"
    },
    truckType: "Refrigerated 32 ft",
    material: "Fruits & Vegetables",
    amount: 58000,
    createdBy: "client",
    status: "PENDING_VERIFICATION",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-22T09:30:00Z",
    bidEndTime: "2026-03-27T17:30:00Z",
    date: "2026-03-14",
    bids: []
  },
  {
    id: "LD1009",
    customer: "Farm Produce",
    pickup: {
      city: "Mumbai",
      state: "MH"
    },
    drop: {
      city: "Pune",
      state: "MH"
    },
    truckType: "Refrigerated 32 ft",
    material: "Fruits & Vegetables",
    amount: 75000,
    createdBy: "client",
    status: "PENDING_VERIFICATION",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-22T09:30:00Z",
    bidEndTime: "2026-03-27T17:30:00Z",
    date: "2026-03-14",
    bids: []
  },
  {
    id: "LD1010",
    customer: "Fresh Produce",
    pickup: {
      city: "Nasik",
      state: "MH"
    },
    drop: {
      city: "Pune",
      state: "MH"
    },
    truckType: "Refrigerated 32 ft",
    material: "Fruits & Vegetables",
    amount: 68000,
    createdBy: "client",
    status: "PENDING_VERIFICATION",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-22T09:30:00Z",
    bidEndTime: "2026-03-27T17:30:00Z",
    date: "2026-03-14",
    bids: []
  },
  {
    id: "LD1009",
    customer: "MetalCraft Industries",
    pickup: {
      city: "Jamshedpur",
      state: "JH"
    },
    drop: {
      city: "Kolkata",
      state: "WB"
    },
    truckType: "32 ft Container",
    material: "Metal Sheets",
    amount: 72000,
    createdBy: "staff",
    status: "VERIFIED",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-25T11:00:00Z",
    bidEndTime: "2026-03-30T17:00:00Z",
    date: "2026-03-16",
    bids: []
  },
  {
    id: "LD1002",
    customer: "ElectroWorld",
    pickup: {
      city: "Pune",
      state: "MH"
    },
    drop: {
      city: "Bangalore",
      state: "KA"
    },
    truckType: "20 ft Container",
    material: "Electronics",
    amount: 85000,
    createdBy: "staff",
    status: "VERIFIED",
    bidStatus: "OPEN",
    bidStartTime: "2026-03-01T09:00:00Z",
    bidEndTime: "2026-03-10T17:00:00Z",
    date: "2026-02-06",
    bids: [
      {
        id: "bid1",
        fleetOwnerId: "1",
        fleetOwnerName: "Swift Transport",
        amount: 78000,
        submittedAt: "2026-03-05T10:30:00Z"
      },
      {
        id: "bid2",
        fleetOwnerId: "2",
        fleetOwnerName: "Midwest Logistics",
        amount: 76500,
        submittedAt: "2026-03-06T14:20:00Z"
      }
    ]
  },
  {
    id: "LD1003",
    customer: "AutoParts Ltd",
    pickup: {
      city: "Chennai",
      state: "TN"
    },
    drop: {
      city: "Hyderabad",
      state: "TS"
    },
    truckType: "32 ft Container",
    material: "Auto Parts",
    amount: 72000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "CLOSED",
    bidStartTime: "2026-02-20T09:00:00Z",
    bidEndTime: "2026-02-28T17:00:00Z",
    date: "2026-02-04",
    winningBid: {
      id: "bid5",
      fleetOwnerId: "3",
      fleetOwnerName: "Express Trucking",
      amount: 69000,
      submittedAt: "2026-02-25T11:45:00Z"
    },
    bids: [
      {
        id: "bid3",
        fleetOwnerId: "1",
        fleetOwnerName: "Swift Transport",
        amount: 71000,
        submittedAt: "2026-02-24T09:15:00Z"
      },
      {
        id: "bid4",
        fleetOwnerId: "4",
        fleetOwnerName: "Coast to Coast Carriers",
        amount: 70500,
        submittedAt: "2026-02-25T10:30:00Z"
      },
      {
        id: "bid5",
        fleetOwnerId: "3",
        fleetOwnerName: "Express Trucking",
        amount: 69000,
        submittedAt: "2026-02-25T11:45:00Z"
      }
    ]
  },
  {
    id: "LD1004",
    customer: "Fresh Foods Inc",
    pickup: {
      city: "Chicago",
      state: "IL"
    },
    drop: {
      city: "New York",
      state: "NY"
    },
    truckType: "Refrigerated 40 ft",
    material: "Perishable Goods",
    amount: 95000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-25T09:00:00Z",
    bidEndTime: "2026-03-30T17:00:00Z",
    date: "2026-03-01",
    bids: []
  },
  {
    id: "LD1005",
    customer: "Steel Industries",
    pickup: {
      city: "Pittsburgh",
      state: "PA"
    },
    drop: {
      city: "Detroit",
      state: "MI"
    },
    truckType: "Flatbed 48 ft",
    material: "Steel Coils",
    amount: 88000,
    createdBy: "staff",
    status: "VERIFIED",
    bidStatus: "OPEN",
    bidStartTime: "2026-03-08T09:00:00Z",
    bidEndTime: "2026-03-15T17:00:00Z",
    date: "2026-03-05",
    bids: [
      {
        id: "bid6",
        fleetOwnerId: "5",
        fleetOwnerName: "Lone Star Freight",
        amount: 82000,
        submittedAt: "2026-03-09T13:20:00Z"
      }
    ]
  },
  {
    id: "LD1013",
    customer: "ABC Textiles",
    pickup: {
      city: "Mumbai",
      state: "MH"
    },
    drop: {
      city: "Delhi",
      state: "DL"
    },
    truckType: "32 ft Container",
    material: "Textiles",
    amount: 65000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "UPCOMING", // UPCOMING, OPEN, CLOSED
    bidStartTime: "2026-03-15T09:00:00Z",
    bidEndTime: "2026-03-20T17:00:00Z",
    date: "2026-02-05",
    bids: [] // Array to store bids
  },
  {
    id: "LD1002",
    customer: "ElectroWorld",
    pickup: {
      city: "Pune",
      state: "MH"
    },
    drop: {
      city: "Bangalore",
      state: "KA"
    },
    truckType: "20 ft Container",
    material: "Electronics",
    amount: 85000,
    createdBy: "staff",
    status: "VERIFIED",
    bidStatus: "OPEN",
    bidStartTime: "2026-03-01T09:00:00Z",
    bidEndTime: "2026-03-10T17:00:00Z",
    date: "2026-02-06",
    bids: [
      {
        id: "bid1",
        fleetOwnerId: "1",
        fleetOwnerName: "Swift Transport",
        amount: 78000,
        submittedAt: "2026-03-05T10:30:00Z"
      },
      {
        id: "bid2",
        fleetOwnerId: "2",
        fleetOwnerName: "Midwest Logistics",
        amount: 76500,
        submittedAt: "2026-03-06T14:20:00Z"
      }
    ]
  },
  {
    id: "LD1003",
    customer: "AutoParts Ltd",
    pickup: {
      city: "Chennai",
      state: "TN"
    },
    drop: {
      city: "Hyderabad",
      state: "TS"
    },
    truckType: "32 ft Container",
    material: "Auto Parts",
    amount: 72000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "CLOSED",
    bidStartTime: "2026-02-20T09:00:00Z",
    bidEndTime: "2026-02-28T17:00:00Z",
    date: "2026-02-04",
    winningBid: {
      id: "bid5",
      fleetOwnerId: "3",
      fleetOwnerName: "Express Trucking",
      amount: 69000,
      submittedAt: "2026-02-25T11:45:00Z"
    },
    bids: [
      {
        id: "bid3",
        fleetOwnerId: "1",
        fleetOwnerName: "Swift Transport",
        amount: 71000,
        submittedAt: "2026-02-24T09:15:00Z"
      },
      {
        id: "bid4",
        fleetOwnerId: "4",
        fleetOwnerName: "Coast to Coast Carriers",
        amount: 70500,
        submittedAt: "2026-02-25T10:30:00Z"
      },
      {
        id: "bid5",
        fleetOwnerId: "3",
        fleetOwnerName: "Express Trucking",
        amount: 69000,
        submittedAt: "2026-02-25T11:45:00Z"
      }
    ]
  },
  {
    id: "LD1004",
    customer: "Fresh Foods Inc",
    pickup: {
      city: "Chicago",
      state: "IL"
    },
    drop: {
      city: "New York",
      state: "NY"
    },
    truckType: "Refrigerated 40 ft",
    material: "Perishable Goods",
    amount: 95000,
    createdBy: "client",
    status: "VERIFIED",
    bidStatus: "UPCOMING",
    bidStartTime: "2026-03-25T09:00:00Z",
    bidEndTime: "2026-03-30T17:00:00Z",
    date: "2026-03-01",
    bids: []
  },
  {
    id: "LD1005",
    customer: "Steel Industries",
    pickup: {
      city: "Pittsburgh",
      state: "PA"
    },
    drop: {
      city: "Detroit",
      state: "MI"
    },
    truckType: "Flatbed 48 ft",
    material: "Steel Coils",
    amount: 88000,
    createdBy: "staff",
    status: "VERIFIED",
    bidStatus: "OPEN",
    bidStartTime: "2026-03-08T09:00:00Z",
    bidEndTime: "2026-03-15T17:00:00Z",
    date: "2026-03-05",
    bids: [
      {
        id: "bid6",
        fleetOwnerId: "5",
        fleetOwnerName: "Lone Star Freight",
        amount: 82000,
        submittedAt: "2026-03-09T13:20:00Z"
      }
    ]
  }
];

let fleetOwners = [
  {
    id: "1",
    carrierName: "Swift Transport",
    phone: "312-555-0123",
    fax: "312-555-0124",
    mcLicense: "MC-123456",
    dotLicense: "DOT-789012",
    taxId: "12-3456789",
    websiteUrl: "www.swifttransport.com",
    notes: "Reliable carrier, specializes in refrigerated loads",
    active: true,
    street: "123 Industrial Dr",
    suite: "Suite 100",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    contactPersons: [
      {
        name: "John Smith",
        phone: "312-555-0101",
        email: "john@swifttransport.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-01-15T10:30:00Z",
    updatedAt: "2024-01-15T10:30:00Z",
    status: "ACTIVE"
  },
  {
    id: "2",
    carrierName: "Midwest Logistics",
    phone: "630-555-0456",
    fax: "630-555-0457",
    mcLicense: "MC-789012",
    dotLicense: "DOT-345678",
    taxId: "98-7654321",
    websiteUrl: "www.midwestlogistics.com",
    notes: "Great with flatbed loads, 20+ years experience",
    active: true,
    street: "456 Oak Ave",
    suite: "",
    city: "Naperville",
    state: "IL",
    zip: "60540",
    contactPersons: [
      {
        name: "Sarah Johnson",
        phone: "630-555-0202",
        email: "sarah@midwestlogistics.com",
        isPrimary: true
      },
      {
        name: "Mike Wilson",
        phone: "630-555-0203",
        email: "mike@midwestlogistics.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-02-20T14:45:00Z",
    updatedAt: "2024-02-20T14:45:00Z",
    status: "ACTIVE"
  },
  {
    id: "3",
    carrierName: "Express Trucking",
    phone: "847-555-0789",
    fax: "847-555-0790",
    mcLicense: "MC-345678",
    dotLicense: "DOT-901234",
    taxId: "45-6789123",
    websiteUrl: "www.expresstrucking.com",
    notes: "Expedited services available 24/7",
    active: false,
    street: "789高速路",
    suite: "Unit B",
    city: "Elk Grove Village",
    state: "IL",
    zip: "60007",
    contactPersons: [
      {
        name: "Robert Chen",
        phone: "847-555-0303",
        email: "robert@expresstrucking.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-03-10T09:15:00Z",
    updatedAt: "2024-03-10T09:15:00Z",
    status: "INACTIVE"
  },
  {
    id: "4",
    carrierName: "Coast to Coast Carriers",
    phone: "213-555-1234",
    fax: "213-555-1235",
    mcLicense: "MC-901234",
    dotLicense: "DOT-567890",
    taxId: "23-4567890",
    websiteUrl: "www.coasttocoast.com",
    notes: "Nationwide coverage, 500+ trucks",
    active: true,
    street: "4567 Wilshire Blvd",
    suite: "Suite 200",
    city: "Los Angeles",
    state: "CA",
    zip: "90010",
    contactPersons: [
      {
        name: "Maria Garcia",
        phone: "213-555-0404",
        email: "maria@coasttocoast.com",
        isPrimary: true
      },
      {
        name: "David Kim",
        phone: "213-555-0405",
        email: "david@coasttocoast.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-01-05T08:20:00Z",
    updatedAt: "2024-01-05T08:20:00Z",
    status: "ACTIVE"
  },
  {
    id: "5",
    carrierName: "Lone Star Freight",
    phone: "214-555-6789",
    fax: "214-555-6790",
    mcLicense: "MC-567890",
    dotLicense: "DOT-123456",
    taxId: "34-5678901",
    websiteUrl: "www.lonestarfreight.com",
    notes: "Specializes in oil field equipment",
    active: true,
    street: "8901 Stemmons Fwy",
    suite: "",
    city: "Dallas",
    state: "TX",
    zip: "75247",
    contactPersons: [
      {
        name: "Billy Bob Thornton",
        phone: "214-555-0505",
        email: "billy@lonestarfreight.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-02-28T11:30:00Z",
    updatedAt: "2024-02-28T11:30:00Z",
    status: "ACTIVE"
  },
  {
    id: "6",
    carrierName: "Empire State Transport",
    phone: "718-555-2345",
    fax: "718-555-2346",
    mcLicense: "MC-234567",
    dotLicense: "DOT-890123",
    taxId: "56-7890123",
    websiteUrl: "www.empirestatetransport.com",
    notes: "East coast specialist, LTL and FTL",
    active: true,
    street: "1234 5th Ave",
    suite: "Floor 3",
    city: "Brooklyn",
    state: "NY",
    zip: "11215",
    contactPersons: [
      {
        name: "Patricia Murphy",
        phone: "718-555-0606",
        email: "patricia@empirestatetransport.com",
        isPrimary: true
      },
      {
        name: "Sean O'Brien",
        phone: "718-555-0607",
        email: "sean@empirestatetransport.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-03-15T13:45:00Z",
    updatedAt: "2024-03-15T13:45:00Z",
    status: "ACTIVE"
  },
  {
    id: "7",
    carrierName: "Sunshine Trucking",
    phone: "305-555-7890",
    fax: "305-555-7891",
    mcLicense: "MC-678901",
    dotLicense: "DOT-234567",
    taxId: "67-8901234",
    websiteUrl: "www.sunshinetrucking.com",
    notes: "Florida and Southeast regional",
    active: true,
    street: "5678 Biscayne Blvd",
    suite: "Suite 150",
    city: "Miami",
    state: "FL",
    zip: "33137",
    contactPersons: [
      {
        name: "Carlos Rodriguez",
        phone: "305-555-0707",
        email: "carlos@sunshinetrucking.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-01-22T09:00:00Z",
    updatedAt: "2024-01-22T09:00:00Z",
    status: "ACTIVE"
  },
  {
    id: "8",
    carrierName: "Pacific Northwest Logistics",
    phone: "206-555-3456",
    fax: "206-555-3457",
    mcLicense: "MC-345678",
    dotLicense: "DOT-789012",
    taxId: "78-9012345",
    websiteUrl: "www.pnwlogistics.com",
    notes: "Specializes in produce and perishables",
    active: true,
    street: "9012 4th Ave",
    suite: "",
    city: "Seattle",
    state: "WA",
    zip: "98101",
    contactPersons: [
      {
        name: "Jennifer Lee",
        phone: "206-555-0808",
        email: "jennifer@pnwlogistics.com",
        isPrimary: true
      },
      {
        name: "Michael Brown",
        phone: "206-555-0809",
        email: "michael@pnwlogistics.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-02-10T15:20:00Z",
    updatedAt: "2024-02-10T15:20:00Z",
    status: "ACTIVE"
  },
  {
    id: "9",
    carrierName: "Rocky Mountain Express",
    phone: "303-555-9012",
    fax: "303-555-9013",
    mcLicense: "MC-890123",
    dotLicense: "DOT-456789",
    taxId: "89-0123456",
    websiteUrl: "www.rockymountainexpress.com",
    notes: "Mountain routes specialist",
    active: true,
    street: "3456 Speer Blvd",
    suite: "Suite 50",
    city: "Denver",
    state: "CO",
    zip: "80202",
    contactPersons: [
      {
        name: "Tom Anderson",
        phone: "303-555-0909",
        email: "tom@rockymountainexpress.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-03-05T10:10:00Z",
    updatedAt: "2024-03-05T10:10:00Z",
    status: "ACTIVE"
  },
  {
    id: "10",
    carrierName: "Great Lakes Carriers",
    phone: "216-555-4567",
    fax: "216-555-4568",
    mcLicense: "MC-456789",
    dotLicense: "DOT-890123",
    taxId: "90-1234567",
    websiteUrl: "www.greatlakescarriers.com",
    notes: "Regional carrier, specializing in automotive parts",
    active: false,
    street: "7890 Euclid Ave",
    suite: "",
    city: "Cleveland",
    state: "OH",
    zip: "44115",
    contactPersons: [
      {
        name: "Robert Johnson",
        phone: "216-555-1010",
        email: "robert@greatlakescarriers.com",
        isPrimary: true
      },
      {
        name: "Lisa Williams",
        phone: "216-555-1011",
        email: "lisa@greatlakescarriers.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-01-30T12:30:00Z",
    updatedAt: "2024-01-30T12:30:00Z",
    status: "INACTIVE"
  },
  {
    id: "11",
    carrierName: "Desert Wind Transport",
    phone: "602-555-5678",
    fax: "602-555-5679",
    mcLicense: "MC-567890",
    dotLicense: "DOT-123456",
    taxId: "12-3456780",
    websiteUrl: "www.desertwindtransport.com",
    notes: "Southwest regional, hazardous materials certified",
    active: true,
    street: "1234 Camelback Rd",
    suite: "Suite 300",
    city: "Phoenix",
    state: "AZ",
    zip: "85014",
    contactPersons: [
      {
        name: "Maria Sanchez",
        phone: "602-555-1111",
        email: "maria@desertwindtransport.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-02-18T14:15:00Z",
    updatedAt: "2024-02-18T14:15:00Z",
    status: "ACTIVE"
  },
  {
    id: "12",
    carrierName: "Atlantic Coast Freight",
    phone: "404-555-6789",
    fax: "404-555-6790",
    mcLicense: "MC-678901",
    dotLicense: "DOT-234567",
    taxId: "23-4567891",
    websiteUrl: "www.atlanticcoastfreight.com",
    notes: "Southeast regional, LTL specialist",
    active: true,
    street: "5678 Peachtree St",
    suite: "Suite 75",
    city: "Atlanta",
    state: "GA",
    zip: "30303",
    contactPersons: [
      {
        name: "James Davis",
        phone: "404-555-1212",
        email: "james@atlanticcoastfreight.com",
        isPrimary: true
      },
      {
        name: "Patricia Taylor",
        phone: "404-555-1213",
        email: "patricia@atlanticcoastfreight.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-03-20T09:45:00Z",
    updatedAt: "2024-03-20T09:45:00Z",
    status: "ACTIVE"
  },
  {
    id: "13",
    carrierName: "Heartland Express",
    phone: "816-555-7890",
    fax: "816-555-7891",
    mcLicense: "MC-789012",
    dotLicense: "DOT-345678",
    taxId: "34-5678902",
    websiteUrl: "www.heartlandexpress.com",
    notes: "Midwest regional, grain and agricultural products",
    active: true,
    street: "9012 Main St",
    suite: "",
    city: "Kansas City",
    state: "MO",
    zip: "64105",
    contactPersons: [
      {
        name: "William Clark",
        phone: "816-555-1313",
        email: "william@heartlandexpress.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-01-08T11:20:00Z",
    updatedAt: "2024-01-08T11:20:00Z",
    status: "ACTIVE"
  },
  {
    id: "14",
    carrierName: "Bay Area Logistics",
    phone: "510-555-8901",
    fax: "510-555-8902",
    mcLicense: "MC-890123",
    dotLicense: "DOT-456789",
    taxId: "45-6789013",
    websiteUrl: "www.bayarealogistics.com",
    notes: "Technology and electronics specialist",
    active: true,
    street: "1234 Broadway",
    suite: "Suite 125",
    city: "Oakland",
    state: "CA",
    zip: "94612",
    contactPersons: [
      {
        name: "Jennifer Wong",
        phone: "510-555-1414",
        email: "jennifer@bayarealogistics.com",
        isPrimary: true
      },
      {
        name: "Kevin Chen",
        phone: "510-555-1415",
        email: "kevin@bayarealogistics.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-02-25T16:30:00Z",
    updatedAt: "2024-02-25T16:30:00Z",
    status: "ACTIVE"
  },
  {
    id: "15",
    carrierName: "Music City Transport",
    phone: "615-555-9012",
    fax: "615-555-9013",
    mcLicense: "MC-901234",
    dotLicense: "DOT-567890",
    taxId: "56-7890124",
    websiteUrl: "www.musiccitytransport.com",
    notes: "Entertainment industry equipment specialist",
    active: false,
    street: "5678 Demonbreun St",
    suite: "",
    city: "Nashville",
    state: "TN",
    zip: "37203",
    contactPersons: [
      {
        name: "Johnny Cash",
        phone: "615-555-1515",
        email: "johnny@musiccitytransport.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-03-12T10:00:00Z",
    updatedAt: "2024-03-12T10:00:00Z",
    status: "INACTIVE"
  },
  {
    id: "16",
    carrierName: "Big Apple Carriers",
    phone: "212-555-0123",
    fax: "212-555-0124",
    mcLicense: "MC-123450",
    dotLicense: "DOT-678901",
    taxId: "67-8901235",
    websiteUrl: "www.bigapplecarriers.com",
    notes: "NYC metro area specialist, last mile delivery",
    active: true,
    street: "1234 8th Ave",
    suite: "Floor 12",
    city: "New York",
    state: "NY",
    zip: "10019",
    contactPersons: [
      {
        name: "Anthony Russo",
        phone: "212-555-1616",
        email: "anthony@bigapplecarriers.com",
        isPrimary: true
      },
      {
        name: "Francesca Romano",
        phone: "212-555-1617",
        email: "francesca@bigapplecarriers.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-01-18T13:15:00Z",
    updatedAt: "2024-01-18T13:15:00Z",
    status: "ACTIVE"
  },
  {
    id: "17",
    carrierName: "Crescent City Freight",
    phone: "504-555-1234",
    fax: "504-555-1235",
    mcLicense: "MC-234561",
    dotLicense: "DOT-789012",
    taxId: "78-9012346",
    websiteUrl: "www.crescentcityfreight.com",
    notes: "Gulf Coast specialist, chemical transport certified",
    active: true,
    street: "7890 Canal St",
    suite: "Suite 50",
    city: "New Orleans",
    state: "LA",
    zip: "70115",
    contactPersons: [
      {
        name: "Andre LeBlanc",
        phone: "504-555-1717",
        email: "andre@crescentcityfreight.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-02-05T08:45:00Z",
    updatedAt: "2024-02-05T08:45:00Z",
    status: "ACTIVE"
  },
  {
    id: "18",
    carrierName: "Silicon Valley Transport",
    phone: "408-555-2345",
    fax: "408-555-2346",
    mcLicense: "MC-345672",
    dotLicense: "DOT-890123",
    taxId: "89-0123457",
    websiteUrl: "www.svtransport.com",
    notes: "High-value electronics, temperature controlled",
    active: true,
    street: "1234 Innovation Dr",
    suite: "Building C",
    city: "San Jose",
    state: "CA",
    zip: "95110",
    contactPersons: [
      {
        name: "Neha Patel",
        phone: "408-555-1818",
        email: "neha@svtransport.com",
        isPrimary: true
      },
      {
        name: "Alex Zhang",
        phone: "408-555-1819",
        email: "alex@svtransport.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-03-18T14:30:00Z",
    updatedAt: "2024-03-18T14:30:00Z",
    status: "ACTIVE"
  },
  {
    id: "19",
    carrierName: "Motor City Express",
    phone: "313-555-3456",
    fax: "313-555-3457",
    mcLicense: "MC-456783",
    dotLicense: "DOT-901234",
    taxId: "90-1234568",
    websiteUrl: "www.motorcityexpress.com",
    notes: "Automotive industry specialist, just-in-time delivery",
    active: true,
    street: "5678 Woodward Ave",
    suite: "",
    city: "Detroit",
    state: "MI",
    zip: "48202",
    contactPersons: [
      {
        name: "Henry Ford II",
        phone: "313-555-1919",
        email: "henry@motorcityexpress.com",
        isPrimary: true
      }
    ],
    createdAt: "2024-01-25T11:45:00Z",
    updatedAt: "2024-01-25T11:45:00Z",
    status: "ACTIVE"
  },
  {
    id: "20",
    carrierName: "Aloha Freight Systems",
    phone: "808-555-4567",
    fax: "808-555-4568",
    mcLicense: "MC-567894",
    dotLicense: "DOT-123457",
    taxId: "12-3456781",
    websiteUrl: "www.alohafreight.com",
    notes: "Inter-island and mainland-Hawaii specialist",
    active: true,
    street: "1234 Ala Moana Blvd",
    suite: "Suite 400",
    city: "Honolulu",
    state: "HI",
    zip: "96814",
    contactPersons: [
      {
        name: "Keoni Kalani",
        phone: "808-555-2020",
        email: "keoni@alohafreight.com",
        isPrimary: true
      },
      {
        name: "Leilani Wong",
        phone: "808-555-2021",
        email: "leilani@alohafreight.com",
        isPrimary: false
      }
    ],
    createdAt: "2024-02-22T09:30:00Z",
    updatedAt: "2024-02-22T09:30:00Z",
    status: "ACTIVE"
  }
];

export { users, otpStore, resetTokens, loads,fleetOwners };