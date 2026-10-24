import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const record = internalMutation({
  args: {
    customer: v.string(),
    merchant: v.string(),
    item: v.string(),
    amount: v.number(),
    location: v.string(),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("transactions", {
      customer: args.customer,
      merchant: args.merchant,
      item: args.item,
      amount: args.amount,
      location: args.location,
      createdAt: Date.now(),
    });
  },
});
