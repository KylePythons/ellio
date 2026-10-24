import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { caseStatus, redFlag, transcriptEntry } from "./schema";

const CASE_LIMIT = 50;
const DELETE_BATCH = 100;

const transactionView = v.object({
  _id: v.id("transactions"),
  customer: v.string(),
  merchant: v.string(),
  item: v.string(),
  amount: v.number(),
  location: v.string(),
  createdAt: v.number(),
});

const caseView = v.object({
  _id: v.id("cases"),
  status: caseStatus,
  riskReasons: v.array(v.string()),
  transcript: v.array(transcriptEntry),
  redFlags: v.array(redFlag),
  summary: v.union(v.string(), v.null()),
  actions: v.array(v.string()),
  updatedAt: v.number(),
  transaction: transactionView,
});

const ESCALATION_ACTIONS = [
  "Card frozen",
  "Dispute filed",
  "Family notified",
];

async function requireCase(ctx: MutationCtx, caseId: Id<"cases">) {
  const existing = await ctx.db.get("cases", caseId);
  if (!existing) {
    throw new Error("Case not found");
  }
  return existing;
}

export const list = query({
  args: {},
  returns: v.array(caseView),
  handler: async (ctx) => {
    const cases = await ctx.db.query("cases").order("desc").take(CASE_LIMIT);
    const rows = [];
    for (const caseDoc of cases) {
      const transaction = await ctx.db.get(
        "transactions",
        caseDoc.transactionId,
      );
      if (!transaction) {
        continue;
      }
      rows.push({
        _id: caseDoc._id,
        status: caseDoc.status,
        riskReasons: caseDoc.riskReasons,
        transcript: caseDoc.transcript,
        redFlags: caseDoc.redFlags,
        summary: caseDoc.summary,
        actions: caseDoc.actions,
        updatedAt: caseDoc.updatedAt,
        transaction: {
          _id: transaction._id,
          customer: transaction.customer,
          merchant: transaction.merchant,
          item: transaction.item,
          amount: transaction.amount,
          location: transaction.location,
          createdAt: transaction.createdAt,
        },
      });
    }
    return rows;
  },
});

export const reset = mutation({
  args: {},
  returns: v.object({
    casesDeleted: v.number(),
    transactionsDeleted: v.number(),
  }),
  handler: async (ctx) => {
    let casesDeleted = 0;
    for (let batch = 0; batch < 5; batch++) {
      const cases = await ctx.db.query("cases").take(DELETE_BATCH);
      if (cases.length === 0) {
        break;
      }
      for (const caseDoc of cases) {
        await ctx.db.delete("cases", caseDoc._id);
        casesDeleted += 1;
      }
    }

    let transactionsDeleted = 0;
    for (let batch = 0; batch < 5; batch++) {
      const transactions = await ctx.db.query("transactions").take(DELETE_BATCH);
      if (transactions.length === 0) {
        break;
      }
      for (const transaction of transactions) {
        await ctx.db.delete("transactions", transaction._id);
        transactionsDeleted += 1;
      }
    }

    return { casesDeleted, transactionsDeleted };
  },
});

export const open = internalMutation({
  args: {
    transactionId: v.id("transactions"),
    riskReasons: v.array(v.string()),
  },
  returns: v.id("cases"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("cases", {
      transactionId: args.transactionId,
      status: "calling",
      riskReasons: args.riskReasons,
      transcript: [],
      redFlags: [],
      summary: null,
      actions: [],
      updatedAt: Date.now(),
    });
  },
});

export const approve = internalMutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
  },
  returns: v.object({
    status: caseStatus,
    actions: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const existing = await requireCase(ctx, args.caseId);
    const actions = [...existing.actions, `Approved: ${args.reason}`];
    await ctx.db.patch("cases", args.caseId, {
      status: "approved",
      actions,
      updatedAt: Date.now(),
    });
    return { status: "approved" as const, actions };
  },
});

export const escalate = internalMutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
  },
  returns: v.object({
    status: caseStatus,
    actions: v.array(v.string()),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireCase(ctx, args.caseId);
    const actions = [...ESCALATION_ACTIONS];
    await ctx.db.patch("cases", args.caseId, {
      status: "escalated",
      actions,
      updatedAt: Date.now(),
    });
    return { status: "escalated" as const, actions, reason: args.reason };
  },
});

export const addRedFlag = internalMutation({
  args: {
    caseId: v.id("cases"),
    flag: v.string(),
    quote: v.string(),
  },
  returns: v.object({ redFlags: v.array(redFlag) }),
  handler: async (ctx, args) => {
    const existing = await requireCase(ctx, args.caseId);
    const redFlags = [
      ...existing.redFlags,
      { flag: args.flag, quote: args.quote, at: Date.now() },
    ];
    await ctx.db.patch("cases", args.caseId, {
      redFlags,
      updatedAt: Date.now(),
    });
    return { redFlags };
  },
});

export const addTranscript = internalMutation({
  args: {
    caseId: v.id("cases"),
    role: v.string(),
    text: v.string(),
  },
  returns: v.object({ transcript: v.array(transcriptEntry) }),
  handler: async (ctx, args) => {
    const existing = await requireCase(ctx, args.caseId);
    const transcript = [
      ...existing.transcript,
      { role: args.role, text: args.text, at: Date.now() },
    ];
    await ctx.db.patch("cases", args.caseId, {
      transcript,
      updatedAt: Date.now(),
    });
    return { transcript };
  },
});

export const setSummary = internalMutation({
  args: {
    caseId: v.id("cases"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCase(ctx, args.caseId);
    await ctx.db.patch("cases", args.caseId, {
      summary: args.summary,
      updatedAt: Date.now(),
    });
    return null;
  },
});
