// Capital One Nessie (mock banking API): Dolores's Merritt Bank card account.
// Ellio reads her real purchase history from Nessie to learn what "normal" looks like.
import { v } from "convex/values";
import { action, env, internalAction, internalMutation, internalQuery } from "./_generated/server";
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

// ---- the other sample cardholders (fictional), for the bank's Accounts page ----

const OTHERS: Array<{
  key: string; first: string; last: string; city: string; state: string; zip: string;
  history: Array<[number, string, number, string]>;
}> = [
  { key: "marcus", first: "Marcus", last: "Reed", city: "Austin", state: "TX", zip: "78701", history: [
    [60, "groceries", 92.4, "Groceries"], [52, "gas", 48.1, "Fuel"], [45, "dining", 64.0, "Dinner"], [38, "electronics", 129.99, "Phone charger and case"],
    [30, "groceries", 81.75, "Groceries"], [21, "gas", 52.3, "Fuel"], [12, "dining", 38.5, "Lunch"], [4, "groceries", 77.2, "Groceries"] ] },
  { key: "priya", first: "Priya", last: "Shah", city: "San Jose", state: "CA", zip: "95113", history: [
    [58, "groceries", 134.6, "Groceries"], [50, "dining", 88.0, "Dinner"], [41, "electronics", 249.0, "Wireless earbuds"], [35, "other", 112.4, "Home goods"],
    [27, "groceries", 121.9, "Groceries"], [18, "dining", 96.25, "Dinner"], [9, "other", 74.0, "Bookstore"], [2, "groceries", 118.3, "Groceries"] ] },
  { key: "james", first: "James", last: "Okafor", city: "Denver", state: "CO", zip: "80202", history: [
    [61, "gas", 71.2, "Fuel"], [53, "groceries", 104.5, "Groceries"], [44, "other", 136.0, "Hardware supplies"], [36, "dining", 58.75, "Dinner"],
    [28, "gas", 68.9, "Fuel"], [19, "groceries", 97.3, "Groceries"], [10, "other", 84.6, "Hardware supplies"], [3, "gas", 74.4, "Fuel"] ] },
  { key: "elena", first: "Elena", last: "Ruiz", city: "Miami", state: "FL", zip: "33130", history: [
    [59, "groceries", 82.1, "Groceries"], [51, "pharmacy", 34.5, "Pharmacy pickup"], [43, "utilities", 118.0, "Electric bill"], [34, "other", 66.2, "Household items"],
    [26, "groceries", 74.8, "Groceries"], [17, "pharmacy", 22.9, "Pharmacy pickup"], [8, "groceries", 69.4, "Groceries"], [1, "other", 58.0, "Gift"] ] },
  { key: "walter", first: "Walter", last: "Burke", city: "Tucson", state: "AZ", zip: "85701", history: [
    [62, "groceries", 66.3, "Groceries"], [54, "pharmacy", 28.0, "Prescription refill"], [46, "gas", 44.7, "Fuel"], [37, "utilities", 96.5, "Electric bill"],
    [29, "groceries", 58.9, "Groceries"], [20, "pharmacy", 28.0, "Prescription refill"], [11, "gas", 41.2, "Fuel"], [5, "groceries", 61.4, "Groceries"] ] },
];

const SHARED_MERCHANTS: Record<string, string> = {
  groceries: "Corner Market", gas: "Fuel Stop", dining: "Pizza Palace", electronics: "BestBye",
  pharmacy: "Main St Pharmacy", utilities: "City Electric", other: "Hardware Hub",
};

export const saveAccount = internalMutation({
  args: {
    key: v.string(), name: v.string(), home: v.string(),
    customerId: v.string(), accountId: v.string(), merchants: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("nessieAccounts").withIndex("by_key", (q) => q.eq("key", args.key)).collect();
    for (const doc of old) await ctx.db.delete(doc._id);
    await ctx.db.insert("nessieAccounts", args);
  },
});

export const listAccounts = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("nessieAccounts").collect(),
});

// Run once: `npx convex run nessie:seedOthers`
export const seedOthers = internalAction({
  args: {},
  handler: async (ctx) => {
    const merchants: Record<string, string> = {};
    for (const [category, name] of Object.entries(SHARED_MERCHANTS)) {
      merchants[category] = createdId(
        await call("POST", "/merchants", {
          name, category,
          address: { street_number: "100", street_name: "Main St", city: "Springfield", state: "IL", zip: "62701" },
          geocode: { lat: 39.7817, lng: -89.6501 },
        }),
      );
    }
    let purchases = 0;
    for (const o of OTHERS) {
      const customerId = createdId(await call("POST", "/customers", {
        first_name: o.first, last_name: o.last,
        address: { street_number: "200", street_name: "Main St", city: o.city, state: o.state, zip: o.zip },
      }));
      const accountId = createdId(await call("POST", `/customers/${customerId}/accounts`, {
        type: "Credit Card", nickname: "Merritt Bank Visa", rewards: 0, balance: 0,
      }));
      for (const [daysAgo, category, amount, description] of o.history) {
        await call("POST", `/accounts/${accountId}/purchases`, {
          merchant_id: merchants[category], medium: "balance", purchase_date: isoDaysAgo(daysAgo),
          amount, status: "completed", description: `${category}|${description}`,
        });
        purchases++;
      }
      await ctx.runMutation(internal.nessie.saveAccount, {
        key: o.key, name: `${o.first} ${o.last}`, home: `${o.city}, ${o.state}`, customerId, accountId, merchants,
      });
    }
    return { customers: OTHERS.length, purchases };
  },
});

// ---- public, read-only: every cardholder's account, live from Nessie ----

type AccountView = {
  name: string; home: string; accountId: string; customerId: string;
  count: number; total: number; median: number; categories: string[];
  recent: Array<{ date: string; merchant: string; category: string; description: string; amount: number }>;
  error?: string;
};

export const accounts = action({
  args: {},
  handler: async (ctx): Promise<AccountView[]> => {
    const dolores = await ctx.runQuery(internal.nessie.ids, {});
    const rows = [
      ...(dolores ? [{ name: "Dolores Whitcomb", home: "Hobbs, NM", customerId: dolores.customerId, accountId: dolores.accountId, merchants: dolores.merchants }] : []),
      ...(await ctx.runQuery(internal.nessie.listAccounts, {})).sort((a, b) => a.name.localeCompare(b.name)),
    ];
    const names: Record<string, string> = {
      ...SHARED_MERCHANTS,
      ...Object.fromEntries(MERCHANTS.map((m) => [m.category, m.name])),
    };
    return await Promise.all(rows.map(async (r): Promise<AccountView> => {
      const base = { name: r.name, home: r.home, accountId: r.accountId, customerId: r.customerId };
      try {
        const list = await call("GET", `/accounts/${r.accountId}/purchases`);
        const items = (Array.isArray(list) ? list : [])
          .filter((p: any) => typeof p?.amount === "number")
          .map((p: any) => {
            const [cat, desc] = typeof p.description === "string" && p.description.includes("|") ? p.description.split("|") : ["other", String(p.description ?? "")];
            const isDoloresRow = r.name.startsWith("Dolores");
            const merchant = isDoloresRow ? (MERCHANTS.find((m) => m.category === cat)?.name ?? "Merchant") : (SHARED_MERCHANTS[cat] ?? names[cat] ?? "Merchant");
            return { date: String(p.purchase_date ?? ""), merchant, category: cat, description: desc, amount: p.amount as number };
          })
          .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
        const amounts = items.map((i: any) => i.amount).sort((a: number, b: number) => a - b);
        const mid = Math.floor(amounts.length / 2);
        const median = amounts.length === 0 ? 0 : amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
        return {
          ...base,
          count: items.length,
          total: Math.round(amounts.reduce((a: number, b: number) => a + b, 0) * 100) / 100,
          median: Math.round(median * 100) / 100,
          categories: [...new Set(items.map((i: any) => i.category as string))],
          recent: items.slice(0, 8),
        };
      } catch (error) {
        return { ...base, count: 0, total: 0, median: 0, categories: [], recent: [], error: error instanceof Error ? error.message : String(error) };
      }
    }));
  },
});

// ---- more sample cardholders (fictional), staggered history sizes ----
// Run once: `npx convex run nessie:seedMore`

const MORE: Array<{ key: string; first: string; last: string; city: string; state: string; zip: string; typical: number; cats: string[]; count: number }> = [
  { key: "aisha", first: "Aisha", last: "Bello", city: "Atlanta", state: "GA", zip: "30303", typical: 55, cats: ["groceries", "dining", "other"], count: 3 },
  { key: "tom", first: "Tom", last: "Kowalski", city: "Chicago", state: "IL", zip: "60601", typical: 140, cats: ["electronics", "dining", "gas"], count: 5 },
  { key: "mei", first: "Mei", last: "Tanaka", city: "Seattle", state: "WA", zip: "98101", typical: 65, cats: ["groceries", "dining", "pharmacy"], count: 31 },
  { key: "carlos", first: "Carlos", last: "Mendez", city: "Phoenix", state: "AZ", zip: "85004", typical: 85, cats: ["gas", "groceries", "other"], count: 14 },
  { key: "grace", first: "Grace", last: "O'Neill", city: "Boston", state: "MA", zip: "02108", typical: 40, cats: ["groceries", "pharmacy", "utilities"], count: 42 },
  { key: "dev", first: "Dev", last: "Patel", city: "Jersey City", state: "NJ", zip: "07302", typical: 110, cats: ["dining", "electronics", "other"], count: 19 },
  { key: "ruth", first: "Ruth", last: "Lindgren", city: "Minneapolis", state: "MN", zip: "55401", typical: 45, cats: ["groceries", "pharmacy", "dining"], count: 27 },
  { key: "andre", first: "Andre", last: "Williams", city: "Houston", state: "TX", zip: "77002", typical: 95, cats: ["gas", "dining", "electronics"], count: 9 },
  { key: "sofia", first: "Sofia", last: "Rossi", city: "Philadelphia", state: "PA", zip: "19103", typical: 70, cats: ["groceries", "other", "dining"], count: 23 },
  { key: "hank", first: "Hank", last: "Duffy", city: "Boise", state: "ID", zip: "83702", typical: 75, cats: ["gas", "other", "groceries"], count: 6 },
  { key: "lena", first: "Lena", last: "Fischer", city: "Portland", state: "OR", zip: "97204", typical: 60, cats: ["groceries", "dining", "utilities"], count: 36 },
  { key: "omar", first: "Omar", last: "Haddad", city: "Dearborn", state: "MI", zip: "48126", typical: 90, cats: ["groceries", "gas", "utilities"], count: 12 },
  { key: "june", first: "June", last: "Park", city: "Los Angeles", state: "CA", zip: "90012", typical: 125, cats: ["dining", "electronics", "other"], count: 17 },
  { key: "frank", first: "Frank", last: "Morrison", city: "Albuquerque", state: "NM", zip: "87102", typical: 50, cats: ["pharmacy", "groceries", "utilities"], count: 29 },
  { key: "nia", first: "Nia", last: "Thompson", city: "Charlotte", state: "NC", zip: "28202", typical: 80, cats: ["groceries", "dining", "other"], count: 2 },
];

const DESCRIPTIONS: Record<string, string[]> = {
  groceries: ["Groceries", "Weekly groceries", "Market run"],
  dining: ["Dinner", "Lunch", "Coffee and pastry", "Takeout"],
  gas: ["Fuel", "Gas fill-up"],
  pharmacy: ["Prescription refill", "Pharmacy pickup", "Vitamins"],
  utilities: ["Electric bill", "Water bill", "Internet bill"],
  electronics: ["Phone accessories", "Headphones", "Cables and chargers"],
  other: ["Home goods", "Hardware supplies", "Bookstore", "Gift"],
};

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedMore = internalAction({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.runQuery(internal.nessie.listAccounts, {});
    let merchants: Record<string, string> = existing[0]?.merchants ?? {};
    if (Object.keys(merchants).length === 0) {
      for (const [category, name] of Object.entries(SHARED_MERCHANTS)) {
        merchants[category] = createdId(await call("POST", "/merchants", {
          name, category,
          address: { street_number: "100", street_name: "Main St", city: "Springfield", state: "IL", zip: "62701" },
          geocode: { lat: 39.7817, lng: -89.6501 },
        }));
      }
    }
    const seedOne = async (o: (typeof MORE)[number], i: number) => {
      const rand = rng(1000 + i);
      const customerId = createdId(await call("POST", "/customers", {
        first_name: o.first, last_name: o.last,
        address: { street_number: String(100 + i * 7), street_name: "Oak St", city: o.city, state: o.state, zip: o.zip },
      }));
      const accountId = createdId(await call("POST", `/customers/${customerId}/accounts`, {
        type: "Credit Card", nickname: "Merritt Bank Visa", rewards: 0, balance: 0,
      }));
      for (let n = 0; n < o.count; n++) {
        const cat = o.cats[Math.floor(rand() * o.cats.length)];
        const descs = DESCRIPTIONS[cat] ?? ["Purchase"];
        const amount = Math.round(o.typical * (0.45 + rand() * 1.1) * 100) / 100;
        const daysAgo = Math.floor(1 + rand() * 120);
        await call("POST", `/accounts/${accountId}/purchases`, {
          merchant_id: merchants[cat], medium: "balance", purchase_date: isoDaysAgo(daysAgo),
          amount, status: "completed", description: `${cat}|${descs[Math.floor(rand() * descs.length)]}`,
        });
      }
      await ctx.runMutation(internal.nessie.saveAccount, {
        key: o.key, name: `${o.first} ${o.last}`, home: `${o.city}, ${o.state}`, customerId, accountId, merchants,
      });
      return o.count;
    };
    let purchases = 0;
    for (let i = 0; i < MORE.length; i += 5) {
      const batch = MORE.slice(i, i + 5);
      const counts = await Promise.all(batch.map((o, j) => seedOne(o, i + j)));
      purchases += counts.reduce((a, b) => a + b, 0);
    }
    return { customers: MORE.length, purchases };
  },
});
