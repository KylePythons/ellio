import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const caseStatus = v.union(
  v.literal("pending"),
  v.literal("calling"),
  v.literal("approved"),
  v.literal("escalated"),
);

export const transcriptEntry = v.object({
  role: v.string(),
  text: v.string(),
  at: v.number(),
});

export const redFlag = v.object({
  flag: v.string(),
  quote: v.string(),
  why: v.optional(v.string()),
  at: v.number(),
});

export default defineSchema({
  transactions: defineTable({
    customer: v.string(),
    merchant: v.string(),
    item: v.string(),
    amount: v.number(),
    location: v.string(),
    createdAt: v.number(),
    riskScore: v.optional(v.number()),
    sample: v.optional(v.boolean()),
  }),
  traffic: defineTable({
    runUntil: v.number(),
    scored: v.number(),
  }),
  cases: defineTable({
    transactionId: v.id("transactions"),
    status: caseStatus,
    riskReasons: v.array(v.string()),
    riskScore: v.optional(v.number()),
    transcript: v.array(transcriptEntry),
    redFlags: v.array(redFlag),
    summary: v.union(v.string(), v.null()),
    actions: v.array(v.string()),
    reason: v.optional(v.string()),
    endedAt: v.optional(v.number()),
    callPlacedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }),
});
