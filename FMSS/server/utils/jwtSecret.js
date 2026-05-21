const DEFAULT_DEV_JWT_SECRET = "fmss_local_dev_secret_change_me";

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  console.warn("JWT_SECRET is not set. Using local development fallback secret.");
  return DEFAULT_DEV_JWT_SECRET;
};

module.exports = { getJwtSecret };
