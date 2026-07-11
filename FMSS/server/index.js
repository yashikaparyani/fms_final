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
const loadRoutes = require("./routes/loadRoutes");
const bidRoutes = require("./routes/bidRoutes");
const configRoutes = require("./routes/configRoutes");
const fleetOwnerRoutes = require("./routes/fleetOwnerRoutes");
const customerRoutes = require("./routes/customerRoutes");
const companyRoutes = require("./routes/companyRoutes");
const statsRoutes = require("./routes/statsRoutes");
const addressRoutes = require("./routes/addressRoutes");
const notificationRoutes = require("./routes/notificationRoute");
const locationRoutes = require("./routes/locationRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const shippingLineRoutes = require("./routes/shippingLineRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const startCronJobs = require("./utils/cron");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
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
app.use("/api/loads", loadRoutes);
app.use("/api/bidRoutes", bidRoutes);
app.use("/api/config", configRoutes);
app.use("/api/fleet-owners", fleetOwnerRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/shipping-lines", shippingLineRoutes);


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
