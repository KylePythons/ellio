import { v } from "convex/values";
import { internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function envValue(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

async function placeCartesiaCall(args: {
  caseId: Id<"cases">;
  item: string;
  amount: number;
  merchant: string;
  location: string;
  riskReasons: string[];
}): Promise<"skipped" | "placed" | "failed"> {
  const apiKey = envValue(env.CARTESIA_API_KEY);
  const fromNumberId = envValue(env.FROM_NUMBER_ID);
  const agentId = envValue(env.AGENT_ID);
  const grandmaPhone = envValue(env.GRANDMA_PHONE);
  const missing = [
    ["CARTESIA_API_KEY", apiKey],
    ["FROM_NUMBER_ID", fromNumberId],
    ["AGENT_ID", agentId],
    ["GRANDMA_PHONE", grandmaPhone],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0 || !apiKey || !fromNumberId || !agentId || !grandmaPhone) {
    console.warn(
      `Cartesia env vars missing (${missing.join(", ")}). Case left in calling status.`,
    );
    return "skipped";
  }

  try {
    const response = await fetch("https://api.cartesia.ai/agents/calls", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2026-03-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_number_id: fromNumberId,
        agent_id: agentId,
        outbound_calls: [
          {
            to_number: grandmaPhone,
            metadata: {
              case_id: args.caseId,
              customer_name: "Dolores",
              item: args.item,
              amount: args.amount,
              merchant: args.merchant,
              location: args.location,
              risk_reasons: args.riskReasons,
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      console.warn(
        `Cartesia call failed (${response.status}). Case left in calling status.`,
      );
      return "failed";
    }
    console.log(`cartesia.call placed → Dolores (case ${args.caseId})`);
    return "placed";
  } catch (error) {
    console.warn(
      `Cartesia call failed (${errorText(error)}). Case left in calling status.`,
    );
    return "failed";
  }
}

export const place = internalAction({
  args: {
    caseId: v.id("cases"),
    item: v.string(),
    amount: v.number(),
    merchant: v.string(),
    location: v.string(),
    riskReasons: v.array(v.string()),
  },
  returns: v.union(v.literal("skipped"), v.literal("placed"), v.literal("failed")),
  handler: async (ctx, args) => {
    const first = await ctx.runMutation(internal.cases.claimCall, { caseId: args.caseId });
    if (!first) {
      return "skipped";
    }
    return await placeCartesiaCall(args);
  },
});

// The bank desk calls this when Ellio reaches the "Call" step, so the phone rings
// exactly when the screen shows it. The purchase endpoint also schedules a backstop.
export const startNow = mutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c || c.callPlacedAt !== undefined || c.status !== "calling") {
      return null;
    }
    const t = await ctx.db.get("transactions", c.transactionId);
    if (!t) {
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.calls.place, {
      caseId: args.caseId,
      item: t.item,
      amount: t.amount,
      merchant: t.merchant,
      location: t.location,
      riskReasons: c.riskReasons,
    });
    return null;
  },
});
