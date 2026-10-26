const { resolveSession } = require("../utils/icAdmin");

// Guards the IC agreement admin endpoints. Separate from middleware/auth.js on
// purpose: an IC admin session is not an FMSS login and opens nothing else, and
// an FMSS login does not open the IC submissions.
const requireIcAdmin = async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const session = await resolveSession(token);
    if (!session) {
      return res.status(401).json({ message: "Your admin session has ended. Please sign in again." });
    }
    req.icAdmin = { email: session.email };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireIcAdmin };
