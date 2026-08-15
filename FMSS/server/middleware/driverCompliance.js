const Driver = require("../models/Driver");

// ─── Driver compliance gate ───────────────────────────────────────────────────
// A driver cannot move a load until a copy of their licence is on file.
//
// Both agreements the carrier signs warrant that every driver is "competent and
// properly licensed" (Brokerage Agreement ¶23; Independent Contractor Agreement
// ¶2). That warranty is worth nothing if the first anybody checks is after a
// claim, so it is enforced at the moment it matters: the driver's own account
// cannot report a pickup, a delivery or a GPS trip start without the licence
// being there.
//
// It does not matter who uploaded it. A carrier who added their whole roster
// with licences during onboarding has already satisfied this, and their drivers
// never see the gate at all — the check is on the record, not on who filled it.
//
// Only `driver` accounts are gated. A fleet owner updating a status from the
// office is the carrier itself acting, and staff and admins update
// administratively; neither is the person in the cab.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Must run after `protect` — Driver is tenant-scoped, so the active location has
 * to be resolved first.
 *
 * Populates `req.driver` on success, since every handler behind this gate wants
 * the record anyway and looking it up twice per request is waste.
 */
const requireDriverLicense = async (req, res, next) => {
  try {
    if (req.user?.role !== "driver") return next();

    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      // A driver account with no roster record behind it. Rare — it means the
      // Driver row was removed without disabling the login — but it must not
      // read as a licence problem, because uploading a licence would not fix it.
      return res.status(403).json({
        message:
          "Your driver record could not be found. Ask your carrier to check your account.",
        code: "NO_DRIVER_RECORD",
      });
    }

    if (!driver.licenseDocument?.filePath) {
      return res.status(403).json({
        message:
          "Upload a photo of your driver's licence before you can update a load. It only has to be done once.",
        code: "DRIVER_LICENSE_REQUIRED",
        // The apps route straight to the upload screen on this code, so the
        // driver is one tap from fixing it rather than reading an error.
        action: "UPLOAD_LICENSE",
      });
    }

    if (driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date()) {
      // The same problem as a missing licence, not a stricter one: a licence
      // that expired last year does not evidence a properly licensed driver.
      // Flagged well before it bites — an expiring licence shows up in red on
      // the carrier's onboarding page and on the driver's own account.
      return res.status(403).json({
        message:
          "Your licence on file has expired. Upload a current one before you can update a load.",
        code: "DRIVER_LICENSE_EXPIRED",
        action: "UPLOAD_LICENSE",
        expiredOn: driver.licenseExpiry,
      });
    }

    req.driver = driver;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireDriverLicense };
