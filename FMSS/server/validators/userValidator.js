const { z } = require("zod");

const optionalString = z.string().optional().or(z.literal(""));

exports.userSchemaZod = z.object({
  firstName: optionalString,
  lastName: optionalString,
  email: z.string().email(),
  password: z.string().min(6).optional(), // ✅ FIXED
  phone: optionalString,
});