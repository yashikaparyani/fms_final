const { z } = require("zod");
const { addressZod } = require("./customerValidator");

const contactPersonZod = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional(),
});

exports.fleetOwnerSchemaZod = z.object({
  carrierName: z.string().min(1),

  phone: z.string().optional(),
  fax: z.string().optional(),

  mcLicense: z.string().optional(),
  dotLicense: z.string().optional(),
  taxId: z.string().optional(),

  websiteUrl: z.string().optional(),
  notes: z.string().optional(),

  addresses: z.array(addressZod).min(1),

  contactPersons: z.array(contactPersonZod).min(1),
});