// Capital One Nessie (mock banking API): Dolores's Merritt Bank card account.
// Ellio reads her real purchase history from Nessie to learn what "normal" looks like.
import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

const BASE = "https://api.nessieisreal.com";
const TIMEOUT_MS = 6000;

function key(): string {
  const k = typeof env.NESSIE_API_KEY === "string" ? env.NESSIE_API_KEY.trim() : "";
  if (!k) throw new Error("NESSIE_API_KEY not set");
  return k;
}

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key())}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Nessie ${method} ${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

function createdId(resp: any): string {
  const id = resp?.objectCreated?._id ?? resp?._id;
  if (typeof id !== "string") throw new Error(`Nessie create returned no id: ${JSON.stringify(resp).slice(0, 200)}`);
  return id;
}

// ---- stored ids ----

export const ids = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("nessie").first(),
});

export const saveIds = internalMutation({
  args: { customerId: v.string(), accountId: v.string(), merchants: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    for (const doc of await ctx.db.query("nessie").collect()) await ctx.db.delete(doc._id);
    await ctx.db.insert("nessie", args);
  },
});

// ---- seed: run once with `npx convex run nessie:seed` ----

const HOBBS = { street_number: "412", street_name: "W Bender Blvd", city: "Hobbs", state: "NM", zip: "88240" };

const MERCHANTS: Array<{ category: string; name: string }> = [
  { category: "pharmacy", name: "Hobbs Family Pharmacy" },
  { category: "groceries", name: "Lea County Market" },
  { category: "dining", name: "Bender Blvd Diner" },
  { category: "utilities", name: "Xcel Energy" },
];

// ~3 months of ordinary life (fictional sample data).
const HISTORY: Array<[number, string, number, string]> = [
  // [days ago, category, amount, description]
  [88, "groceries", 62.4, "Weekly groceries"], [85, "pharmacy", 18.5, "Prescription refill"],
  [81, "dining", 14.25, "Lunch with Ruth"], [78, "groceries", 55.1, "Weekly groceries"],
  [74, "utilities", 84.0, "Electric bill"], [71, "groceries", 48.9, "Weekly groceries"],
  [67, "pharmacy", 22.0, "Vitamins"], [64, "groceries", 51.3, "Weekly groceries"],
  [60, "dining", 17.8, "Sunday breakfast"], [57, "groceries", 44.75, "Weekly groceries"],
  [55, "pharmacy", 18.5, "Prescription refill"], [50, "groceries", 58.2, "Weekly groceries"],
  [45, "utilities", 79.5, "Electric bill"], [43, "groceries", 46.6, "Weekly groceries"],
  [39, "dining", 21.4, "Dinner with daughter"], [36, "groceries", 52.0, "Weekly groceries"],
  [30, "pharmacy", 18.5, "Prescription refill"], [29, "groceries", 49.8, "Weekly groceries"],
  [22, "groceries", 61.15, "Weekly groceries"], [17, "dining", 15.6, "Lunch with Ruth"],
  [15, "utilities", 81.25, "Electric bill"], [15, "groceries", 47.3, "Weekly groceries"],
  [8, "groceries", 53.9, "Weekly groceries"], [3, "pharmacy", 18.5, "Prescription refill"],
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    const customerId = createdId(
      await call("POST", "/customers", { first_name: "Dolores", last_name: "Whitcomb", address: HOBBS }),
    );
    const accountId = createdId(
      await call("POST", `/customers/${customerId}/accounts`, {
        type: "Credit Card",
        nickname: "Merritt Bank Visa",
        rewards: 0,
        balance: 0,
      }),
    );
    const merchants: Record<string, string> = {};
    for (const m of MERCHANTS) {
      merchants[m.category] = createdId(
        await call("POST", "/merchants", {
          name: m.name,
          category: m.category,
          address: HOBBS,
          geocode: { lat: 32.7026, lng: -103.136 },
        }),
      );
    }
    for (const [daysAgo, category, amount, description] of HISTORY) {
      await call("POST", `/accounts/${accountId}/purchases`, {
        merchant_id: merchants[category],
        medium: "balance",
        purchase_date: isoDaysAgo(daysAgo),
        amount,
        status: "completed",
        description: `${category}|${description}`,
      });
    }
    await ctx.runMutation(internal.nessie.saveIds, { customerId, accountId, merchants });
    return { customerId, accountId, purchases: HISTORY.length };
  },
});

// ---- read her history ----

export type NessieHistory = {
  count: number;
  typicalAmount: number; // median purchase
  categories: string[];
};

export async function historyFor(ctx: ActionCtx): Promise<NessieHistory | null> {
  const stored = await ctx.runQuery(internal.nessie.ids, {});
  if (!stored) return null;
  const purchases = await call("GET", `/accounts/${stored.accountId}/purchases`);
  if (!Array.isArray(purchases) || purchases.length === 0) return null;
  const byMerchant = Object.fromEntries(Object.entries(stored.merchants).map(([cat, id]) => [id, cat]));
  const amounts: number[] = [];
  const cats = new Set<string>();
  for (const p of purchases) {
    if (typeof p?.amount !== "number") continue;
    amounts.push(p.amount);
    const fromDesc = typeof p.description === "string" && p.description.includes("|") ? p.description.split("|")[0] : null;
    const cat = fromDesc ?? byMerchant[p.merchant_id];
    if (cat) cats.add(cat);
  }
  if (amounts.length === 0) return null;
  amounts.sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  const median = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
  return { count: amounts.length, typicalAmount: Math.round(median * 100) / 100, categories: [...cats] };
}

// ---- record an everyday (non-flagged) purchase back to her account ----

export const recordPurchase = internalAction({
  args: { amount: v.number(), category: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    const stored = await ctx.runQuery(internal.nessie.ids, {});
    if (!stored) return;
    const merchantId = stored.merchants[args.category] ?? Object.values(stored.merchants)[0];
    if (!merchantId) return;
    try {
      await call("POST", `/accounts/${stored.accountId}/purchases`, {
        merchant_id: merchantId,
        medium: "balance",
        purchase_date: new Date().toISOString().slice(0, 10),
        amount: args.amount,
        status: "completed",
        description: `${args.category}|${args.description}`,
      });
    } catch (error) {
      console.warn(`nessie.recordPurchase failed: ${error instanceof Error ? error.message : error}`);
    }
  },
});
