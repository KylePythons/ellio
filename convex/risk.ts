// Ellio's risk score: judges a purchase against THIS cardholder's normal life,
// not a single dollar limit. SAMPLE DATA: the profiles below are fictional.

type Profile = {
  age: number | null;
  home: string;
  familyAddresses: string[];
  categories: string[]; // kinds of purchases she normally makes
  typicalAmount: number; // her usual purchase size
};

const PROFILES: Record<string, Profile> = {
  dolores: {
    age: 78,
    home: "Hobbs, NM",
    familyAddresses: ["Albuquerque, NM"], // her daughter
    categories: ["pharmacy", "groceries", "dining", "utilities"],
    typicalAmount: 50,
  },
  // Sample-traffic cardholders (fictional).
  marcus: { age: 34, home: "Austin, TX", familyAddresses: [], categories: ["groceries", "gas", "electronics", "dining"], typicalAmount: 80 },
  priya: { age: 29, home: "San Jose, CA", familyAddresses: [], categories: ["groceries", "dining", "electronics", "other"], typicalAmount: 120 },
  james: { age: 52, home: "Denver, CO", familyAddresses: [], categories: ["gas", "groceries", "other", "dining"], typicalAmount: 90 },
  elena: { age: 41, home: "Miami, FL", familyAddresses: [], categories: ["groceries", "pharmacy", "other", "utilities"], typicalAmount: 70 },
  walter: { age: 69, home: "Tucson, AZ", familyAddresses: [], categories: ["groceries", "pharmacy", "gas", "utilities"], typicalAmount: 60 },
};

const DEFAULT_PROFILE: Profile = {
  age: null,
  home: "Hobbs, NM",
  familyAddresses: [],
  categories: ["groceries", "electronics"],
  typicalAmount: 200,
};

export const CALL_THRESHOLD = 60;

const SCAM_PAYMENTS = /gift\s*card|wire|western union|money\s*order|crypto|bitcoin/i;

export function categoryOf(item: string): string {
  const s = item.toLowerCase();
  if (/gift\s*card/.test(s)) return "gift cards";
  if (/tv|laptop|tablet|headphone|earbud|speaker|phone|camera/.test(s)) return "electronics";
  if (/grocer|market/.test(s)) return "groceries";
  if (/\bgas\b|fuel/.test(s)) return "gas";
  if (/pharmacy/.test(s)) return "pharmacy";
  if (/coffee|pizza|diner|restaurant|cafe/.test(s)) return "dining";
  if (/electric|water|utility|bill/.test(s)) return "utilities";
  return "other";
}

export type RecentPurchase = { amount: number; createdAt: number };

export function scorePurchase(args: {
  customer: string;
  item: string;
  amount: number;
  location: string;
  recent: RecentPurchase[]; // her other purchases, newest first
  now: number;
  contactName?: string; // name on the receipt contact, if given
  history?: { count: number; typicalAmount: number; categories: string[] }; // from Capital One Nessie
  extra?: Array<[number, string]>; // outside signals, e.g. CRS FraudFinder
}): { score: number; reasons: string[] } {
  const key = args.customer.trim().split(/\s+/)[0].toLowerCase();
  const base = PROFILES[key] ?? DEFAULT_PROFILE;
  const h = args.history;
  const p: Profile = h
    ? { ...base, typicalAmount: h.typicalAmount, categories: h.categories.length ? h.categories : base.categories }
    : base;
  const src = h ? ` (Nessie: median $${h.typicalAmount.toFixed(2)} over ${h.count} purchases)` : "";
  const catSrc = h ? ` in ${h.count} Nessie purchases` : " on record";
  const parts: Array<[number, string]> = [];

  const ratio = args.amount / p.typicalAmount;
  if (ratio >= 10) parts.push([30, `${Math.round(ratio)}× her usual purchase${src}`]);
  else if (ratio >= 5) parts.push([20, `${Math.round(ratio)}× her usual purchase${src}`]);
  else if (ratio >= 2) parts.push([10, `About ${Math.round(ratio)}× her usual purchase${src}`]);

  const category = categoryOf(args.item);
  if (!p.categories.includes(category)) parts.push([15, `First ${category} purchase${catSrc}`]);

  if (SCAM_PAYMENTS.test(args.item)) parts.push([30, "Gift cards are a common scam payment"]);

  if (args.location === p.home) {
    // Her own address: no added risk.
  } else if (p.familyAddresses.includes(args.location)) {
    // A known family address: no added risk.
  } else {
    parts.push([25, `Ships to ${args.location}, an unfamiliar address`]);
  }

  if (p.age !== null && p.age >= 65) parts.push([10, "Cardholder is 65+, more often targeted by scams"]);

  const hourAgo = args.now - 60 * 60 * 1000;
  const bigRecent = args.recent.filter((r) => r.createdAt >= hourAgo && r.amount >= 200).length;
  if (bigRecent > 0) parts.push([15, `${bigRecent + 1} large purchases within an hour`]);

  // Receipt contact vs cardholder: no shared name part (a relative usually shares a surname).
  if (args.contactName) {
    const words = (n: string) => new Set(n.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1));
    const card = words(args.customer);
    const shared = [...words(args.contactName)].some((w) => card.has(w));
    if (!shared) parts.push([15, `Receipt contact is ${args.contactName}, not the cardholder`]);
  }

  for (const e of args.extra ?? []) parts.push(e);

  const score = Math.min(100, parts.reduce((a, [pts]) => a + pts, 0));
  const reasons = parts
    .sort((a, b) => b[0] - a[0])
    .map(([pts, text]) => `${text} (+${pts})`);
  return { score, reasons };
}
