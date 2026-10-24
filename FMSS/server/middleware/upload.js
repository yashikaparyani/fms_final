const multer = require("multer");
const path = require("path");
const { runWithTenant } = require("../utils/tenantContext");

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const rawMulter = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    // Base64 signatures are sent as a text field; the busboy default is only
    // 1MB which can truncate a high-res signature and blank it in the POD.
    fieldSize: 15 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|doc|docx/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error("Only images, PDFs, and Word docs allowed"));
  },
});

// Multer processes streams asynchronously, which unwinds the execution stack
// and breaks Node's AsyncLocalStorage context before calling next().
// This wrapper re-enters the active tenant context so downstream controllers
// and Mongoose queries run with tenant isolation intact.
const wrapWithTenantContext = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) return next(err);

    const ctx =
      req.tenantContext ||
      (req.locationId || req.locationIds?.length || req.allLocations || req.noLocations
        ? {
            locationId: req.locationId,
            locationIds: req.locationIds,
            allLocations: req.allLocations,
            noLocations: req.noLocations,
          }
        : null);

    if (ctx) {
      return runWithTenant(ctx, () => next());
    }

    next();
  });
};

const upload = new Proxy(rawMulter, {
  get(target, prop) {
    const val = target[prop];
    if (typeof val === "function" && ["single", "array", "fields", "none", "any"].includes(prop)) {
      return (...args) => wrapWithTenantContext(val.apply(target, args));
    }
    return val;
  },
  apply(target, thisArg, args) {
    return wrapWithTenantContext(target(...args));
  },
});

module.exports = upload;