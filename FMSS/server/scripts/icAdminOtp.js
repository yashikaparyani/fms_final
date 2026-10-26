// Issue an IC admin panel login code from the shell, for when the admin mailbox
// is out of reach. Whoever can run this already has the server, so it opens
// nothing they could not open anyway; it does not exist as an HTTP route.
//
//   npm run ic-admin:otp -- onboard@empiretpt.com
//
// The code is valid for the usual 10 minutes and replaces any code already
// pending for that address. The address must be listed in IC_ADMIN_EMAILS.

require("dotenv").config();
const mongoose = require("mongoose");
const icAdmin = require("../utils/icAdmin");

(async () => {
  const email = icAdmin.normalizeEmail(process.argv[2] || icAdmin.allowedEmails()[0]);

  if (!email || !icAdmin.isAllowedEmail(email)) {
    console.error(
      `"${email || "(none)"}" is not in IC_ADMIN_EMAILS. Listed: ${icAdmin.allowedEmails().join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const code = await icAdmin.issueOtp(email);
  await mongoose.disconnect();

  console.log(`IC admin login code for ${email}: ${code}  (valid ${icAdmin.OTP_EXPIRY_MINUTES} minutes)`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
