const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const path = require("path");

// Config DB
dotenv.config();
const connectDB = require("./config/db");
connectDB();

// Routes & Middleware
const authRoutes = require("./routes/authRoutes");
const signupRoutes = require("./routes/signupRoutes");
const loadRoutes = require("./routes/loadRoutes");
const bidRoutes = require("./routes/bidRoutes");
const configRoutes = require("./routes/configRoutes");
const fleetOwnerRoutes = require("./routes/fleetOwnerRoutes");
// Driver sub-accounts, added by the carrier who employs them.
const driverRoutes = require("./routes/driverRoutes");
const customerRoutes = require("./routes/customerRoutes");
// Staff accounts and the module/location permission grid — admin only.
const staffRoutes = require("./routes/staffRoutes");
// Carrier onboarding: the two signed agreements, drivers and their licences.
const onboardingRoutes = require("./routes/onboardingRoutes");
// Insurance certificates, including the carrier's agency filing them by link.
const insuranceRoutes = require("./routes/insuranceRoutes");
// Per-load receivables, payables, driver payroll and the reports built on them.
const accountingRoutes = require("./routes/accountingRoutes");
// Customer invoices and carrier bills — the documents raised off a load ledger.
const invoiceRoutes = require("./routes/invoiceRoutes");
// Money in and money out, each with the reference that proves it moved.
const paymentRoutes = require("./routes/paymentRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
// Cross-load audit views. A single load's trail lives under /api/loads/:id/audit.
const auditRoutes = require("./routes/auditRoutes");
// Operational and financial report generation, with CSV export.
const reportRoutes = require("./routes/reportRoutes");
const companyRoutes = require("./routes/companyRoutes");
const statsRoutes = require("./routes/statsRoutes");
const addressRoutes = require("./routes/addressRoutes");
const notificationRoutes = require("./routes/notificationRoute");
const announcementRoutes = require("./routes/announcementRoutes");
const locationRoutes = require("./routes/locationRoutes");
// Operating locations (branches) — the tenant. Mounted at /api/branches because
// /api/locations is already the state/city geography lookup.
const branchRoutes = require("./routes/branchRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const shippingLineRoutes = require("./routes/shippingLineRoutes");
const streetTurnPartnerRoutes = require("./routes/streetTurnPartnerRoutes");
const instantDispatchRoutes = require("./routes/instantDispatchRoutes");
const streetTurnRoutes = require("./routes/streetTurnRoutes");
const chassisCompanyRoutes = require("./routes/chassisCompanyRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const startCronJobs = require("./utils/cron");

const app = express();

// Deployed behind nginx, so every request arrives from the proxy. Without this
// `req.ip` is the proxy's address, which matters because that address is written
// onto signed documents as evidence — the two carrier agreements and the street
// turn acknowledgement all record the signer's IP. `1` because there is exactly
// one proxy in front of this; a larger number would trust hops that do not
// exist and let a client forge the address by sending its own
// X-Forwarded-For. It also lets express-rate-limit key on the real client.
app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(express.json());

// Express 5 leaves req.body undefined when a request arrives with no body or no
// content-type — which is exactly what a bodyless POST like "reset this user's
// password" looks like. Every handler that reaches for req.body.something then
// throws a TypeError and answers 500 instead of doing the job. One line here
// beats a `?.` on every read.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(helmet());
app.use(morgan("dev"));

// Rate Limiter
// Rate limiting disabled for demo mode
// const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
// app.use(limiter);

// Swagger Config
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Load Bidding API",
      version: "1.0.0",
    },
  },
  apis: ["./routes/*.js"],
};

const specs = swaggerJsdoc(options);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.get("/", (req, res) => {
  res.send("Load Bidding API Running...");
});


app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Also create the folder:
const fs = require("fs");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/signups", signupRoutes);
app.use("/api/loads", loadRoutes);
app.use("/api/bidRoutes", bidRoutes);
app.use("/api/config", configRoutes);
app.use("/api/fleet-owners", fleetOwnerRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/shipping-lines", shippingLineRoutes);
app.use("/api/instant-dispatch", instantDispatchRoutes);
app.use("/api/street-turn", streetTurnRoutes);
app.use("/api/street-turn-partners", streetTurnPartnerRoutes);
// Kept so a client that has not been redeployed alongside the server keeps
// working. Same router, old address.
app.use("/api/delivery-partners", streetTurnPartnerRoutes);
app.use("/api/chassis-companies", chassisCompanyRoutes);


// Error Middleware
app.use(notFound);
app.use(errorHandler);

// Start Cron Jobs and Server only if not in test environment
if (process.env.NODE_ENV !== "test") {
  startCronJobs();
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
