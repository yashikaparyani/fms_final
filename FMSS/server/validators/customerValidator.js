const { z } = require("zod");

const optionalString = z.string().optional().or(z.literal(""));
const optionalEmail = z.string().email().optional().or(z.literal(""));

exports.customerSchemaZod = z.object({
  customerName: optionalString,

  street: optionalString,
  suite: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  directions: optionalString,

  phone: optionalString,
  fax: optionalString,
  website: optionalString,

  podEmail: optionalEmail,
  accChargesEmail: optionalEmail,
  deliveryEmail: optionalEmail,

  sendStatusEmails: z.boolean().optional(),
  sendInvoiceEmails: z.boolean().optional(),
  creditLimitExceeded: z.boolean().optional(),
});