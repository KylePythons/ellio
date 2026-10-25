// Public CRS FraudFinder check for the bank's "Risk check" page.
// Only CRS sandbox test personas can be sent: anything else would go to the live vendor.
import { v } from "convex/values";
import { action } from "./_generated/server";
import { fraudFinder, type CrsResult } from "./crs";

export const PERSONAS = {
  P01: { label: "Margaret Okafor · prime, clean history", name: "MARGARET OKAFOR", email: "margaret.okafor@example.com", phone: "5550101001", ipAddress: "203.0.113.11", address: { addressLine1: "1420 WILLOW CREEK DR", city: "SAN JOSE", state: "CA", postalCode: "95125" } },
  P20: { label: "Dolores Whitcomb · retiree", name: "DOLORES WHITCOMB", email: "dolores.whitcomb@example.com", phone: "5550101020", ipAddress: "203.0.113.30", address: { addressLine1: "612 OCEAN VIEW DR", city: "SANTA BARBARA", state: "CA", postalCode: "93109" } },
  P12: { label: "Victor Anand · identity mismatch", name: "VICTOR ANAND", email: "v.anand.1968@example.com", phone: "5550101012", ipAddress: "198.51.100.12", address: { addressLine1: "55 WATER ST FL 20", city: "NEW YORK", state: "NY", postalCode: "10041" } },
  P13: { label: "Kayla Brennan · synthetic identity", name: "KAYLA BRENNAN", email: "kb.9921x@example.com", phone: "5550101013", ipAddress: "198.51.100.13", address: { addressLine1: "9021 KINGSTON PIKE", city: "KNOXVILLE", state: "TN", postalCode: "37923" } },
} as const;

export const check = action({
  args: { persona: v.union(v.literal("P01"), v.literal("P20"), v.literal("P12"), v.literal("P13")) },
  handler: async (_ctx, args): Promise<CrsResult & { persona: string }> => {
    const p = PERSONAS[args.persona];
    const result = await fraudFinder({
      name: p.name,
      email: p.email,
      phone: p.phone,
      ipAddress: p.ipAddress,
      address: { ...p.address },
    });
    return { ...result, persona: args.persona };
  },
});
