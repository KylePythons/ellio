// SAMPLE TRAFFIC: a stream of everyday purchases by fictional cardholders, so the
// bank's main page shows Ellio scoring card activity live. Every row is scored by
// the real risk engine in ./risk.ts. Samples never open a case or place a call.
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { CALL_THRESHOLD, scorePurchase } from "./risk";
import { insertScored } from "./transactions";

const RUN_MS = 10 * 60 * 1000; // stop on its own 10 minutes after the page was last opened
const EVERY_MS = 1500;

const PEOPLE = [
  { name: "Marcus Reed", home: "Austin, TX" },
  { name: "Priya Shah", home: "San Jose, CA" },
  { name: "James Okafor", home: "Denver, CO" },
  { name: "Elena Ruiz", home: "Miami, FL" },
  { name: "Walter Burke", home: "Tucson, AZ" },
];
const ITEMS = [
  { merchant: "Corner Market", item: "Groceries", min: 18, max: 140 },
  { merchant: "Fuel Stop", item: "Gas", min: 30, max: 75 },
  { merchant: "Main St Pharmacy", item: "Pharmacy pickup", min: 8, max: 60 },
  { merchant: "Bean There Cafe", item: "Coffee", min: 4, max: 14 },
  { merchant: "City Electric", item: "Electric bill", min: 60, max: 180 },
  { merchant: "Pizza Palace", item: "Pizza delivery", min: 18, max: 45 },
  { merchant: "BestBye", item: "Wireless headphones", min: 120, max: 250 },
  { merchant: "BestBye", item: "Laptop", min: 650, max: 1200 },
  { merchant: "Hardware Hub", item: "Hardware supplies", min: 20, max: 160 },
];
const AWAY = ["Dallas, TX", "Las Vegas, NV", "Chicago, IL", "Seattle, WA"];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export const start = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db.query("traffic").first();
    if (!state) {
      await ctx.db.insert("traffic", { runUntil: now + RUN_MS, scored: 0 });
      await ctx.scheduler.runAfter(0, internal.traffic.tick, {});
      return null;
    }
    const running = state.runUntil > now;
    await ctx.db.patch("traffic", state._id, { runUntil: now + RUN_MS });
    if (!running) {
      await ctx.scheduler.runAfter(0, internal.traffic.tick, {});
    }
    return null;
  },
});

export const tick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ctx.db.query("traffic").first();
    if (!state || Date.now() > state.runUntil) {
      return null;
    }
    for (let i = 0; i < 6; i++) {
      const person = pick(PEOPLE);
      const it = pick(ITEMS);
      const amount = Math.round((it.min + Math.random() * (it.max - it.min)) * 100) / 100;
      const location = Math.random() < 0.15 ? pick(AWAY) : person.home;
      const { score } = scorePurchase({
        customer: person.name,
        item: it.item,
        amount,
        location,
        recent: [],
        now: Date.now(),
      });
      if (score >= CALL_THRESHOLD) continue; // only real checkouts escalate
      await insertScored(ctx, {
        customer: person.name,
        merchant: it.merchant,
        item: it.item,
        amount,
        location,
        riskScore: score,
        sample: true,
      });
      break;
    }
    await ctx.scheduler.runAfter(EVERY_MS, internal.traffic.tick, {});
    return null;
  },
});
