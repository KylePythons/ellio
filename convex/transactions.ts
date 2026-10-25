import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const FEED_SIZE = 14;

// Insert a purchase that has already been scored, and count it.
export async function insertScored(
  ctx: MutationCtx,
  doc: {
    customer: string;
    merchant: string;
    item: string;
    amount: number;
    location: string;
    riskScore?: number;
    sample?: boolean;
  },
): Promise<Id<"transactions">> {
  const id = await ctx.db.insert("transactions", {
    customer: doc.customer,
    merchant: doc.merchant,
    item: doc.item,
    amount: doc.amount,
    location: doc.location,
    createdAt: Date.now(),
    ...(doc.riskScore !== undefined ? { riskScore: doc.riskScore } : {}),
    ...(doc.sample ? { sample: true } : {}),
  });
  const state = await ctx.db.query("traffic").first();
  if (state) {
    await ctx.db.patch("traffic", state._id, { scored: state.scored + 1 });
  } else {
    await ctx.db.insert("traffic", { runUntil: 0, scored: 1 });
  }
  return id;
}

export const record = internalMutation({
  args: {
    customer: v.string(),
    merchant: v.string(),
    item: v.string(),
    amount: v.number(),
    location: v.string(),
    riskScore: v.optional(v.number()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    return await insertScored(ctx, args);
  },
});

export const recentFor = internalQuery({
  args: { customer: v.string(), excludeId: v.optional(v.id("transactions")) },
  returns: v.array(v.object({ amount: v.number(), createdAt: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("transactions").order("desc").take(50);
    return rows
      .filter((r) => r.customer === args.customer && r._id !== args.excludeId)
      .map((r) => ({ amount: r.amount, createdAt: r.createdAt }));
  },
});

// Live card activity for the bank's main page: newest purchases with their scores.
export const feed = query({
  args: {},
  returns: v.object({
    rows: v.array(
      v.object({
        _id: v.id("transactions"),
        customer: v.string(),
        merchant: v.string(),
        item: v.string(),
        amount: v.number(),
        location: v.string(),
        createdAt: v.number(),
        riskScore: v.optional(v.number()),
        sample: v.optional(v.boolean()),
      }),
    ),
    scored: v.number(),
  }),
  handler: async (ctx) => {
    const recent = await ctx.db.query("transactions").order("desc").take(FEED_SIZE);
    const state = await ctx.db.query("traffic").first();
    return {
      rows: recent.map((r) => ({
        _id: r._id,
        customer: r.customer,
        merchant: r.merchant,
        item: r.item,
        amount: r.amount,
        location: r.location,
        createdAt: r.createdAt,
        riskScore: r.riskScore,
        sample: r.sample,
      })),
      scored: state ? state.scored : 0,
    };
  },
});
