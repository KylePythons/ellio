// CRS FraudFinder (AtData) check on the buyer's contact details at checkout.
// Sandbox only: https://api-sandbox.stitchcredit.com/api. Test personas only.
import { env } from "./_generated/server";

const BASE_URL = "https://api-sandbox.stitchcredit.com/api";
const TIMEOUT_MS = 6000;

let cachedToken: string | null = null;
// Repeated failed logins lock the sandbox account, so stop after one failure.
let loginFailed = false;

export type CrsResult = {
  ok: boolean;
  score: number | null; // 0 low risk – 100 very high risk
  signals: string[]; // short human-readable findings
  details?: Record<string, string>;
  error?: string;
};

function value(v: string | undefined): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (loginFailed) throw new Error("CRS login failed earlier; not retrying");
  const username = value(env.CRS_USERNAME);
  const password = value(env.CRS_PASSWORD);
  if (!username || !password) throw new Error("CRS_USERNAME / CRS_PASSWORD not set");
  const res = await post("/users/login", { username, password });
  if (!res.ok) {
    loginFailed = true;
    throw new Error(`CRS login ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("CRS login returned no token");
  cachedToken = data.token;
  return cachedToken;
}

function findWith(x: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || typeof x !== "object" || x === null) return null;
  if (!Array.isArray(x) && key in (x as object)) return x as Record<string, unknown>;
  for (const v of Object.values(x as object)) {
    const hit = findWith(v, key, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function asRecord(x: unknown): Record<string, any> {
  return typeof x === "object" && x !== null ? (x as Record<string, any>) : {};
}

export async function fraudFinder(args: {
  name: string;
  email: string;
  phone?: string;
  ipAddress?: string;
  address?: { addressLine1: string; city: string; state: string; postalCode: string };
}): Promise<CrsResult> {
  const [firstName, ...rest] = args.name.trim().split(/\s+/);
  const body: Record<string, unknown> = {
    firstName: firstName?.toUpperCase(),
    lastName: rest.join(" ").toUpperCase() || undefined,
    email: args.email.trim(),
  };
  const digits = (args.phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length === 10) body.phoneNumber = digits;
  if (args.ipAddress) body.ipAddress = args.ipAddress;
  if (args.address) {
    body.address = {
      addressLine1: args.address.addressLine1.toUpperCase(),
      city: args.address.city.toUpperCase(),
      state: args.address.state.toUpperCase(),
      postalCode: args.address.postalCode,
    };
  }

  try {
    let token = await getToken();
    let res = await post("/fraud-finder/fraud-finder", body, token);
    if (res.status === 401) {
      cachedToken = null;
      token = await getToken();
      res = await post("/fraud-finder/fraud-finder", body, token);
    }
    if (!res.ok) {
      return { ok: false, score: null, signals: [], error: `FraudFinder ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const raw = await res.text();
    console.log(`crs.fraudFinder raw ${raw.slice(0, 1500)}`);
    let parsed: unknown = {};
    try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
    // The payload may be wrapped (e.g. { data: {...} } or { response: {...} }); find the object holding `risk`.
    const data = asRecord(findWith(parsed, "risk") ?? parsed);
    const risk = asRecord(data.risk);
    const phone = asRecord(risk.phone);
    const owner = asRecord(phone.owner);
    const eam = asRecord(data.eam);
    const rawScore = risk.score ?? risk.risk_score ?? risk.riskScore;
    const score = typeof rawScore === "number" ? rawScore : typeof rawScore === "string" && rawScore.trim() !== "" && Number.isFinite(Number(rawScore)) ? Number(rawScore) : null;

    const signals: string[] = [];
    const firstSeen = typeof eam.date_first_seen === "string" ? eam.date_first_seen : null;
    if (firstSeen === "now") signals.push("email never seen before");
    else if (firstSeen) {
      const days = Math.floor((Date.now() - Date.parse(firstSeen)) / 86400000);
      if (Number.isFinite(days) && days >= 0 && days < 30) signals.push(`email first seen ${days} day${days === 1 ? "" : "s"} ago`);
    }
    const ownerMatch = Object.values(owner).find((v) => v === "no_match");
    if (ownerMatch) signals.push("phone belongs to someone else");
    if (phone.prepaid === true) signals.push("prepaid phone");
    const ev = asRecord(data.email_validation ?? asRecord(parsed).email_validation);
    if (ev.status === "invalid") signals.push("email address fails validation");
    if (typeof phone.line_type === "string" && /voip/i.test(phone.line_type)) signals.push("VoIP phone line");

    const postal = asRecord(risk.postal);
    if (typeof postal.ip_postal_distance === "string" && postal.ip_postal_distance.includes(">")) signals.push(`IP ${postal.ip_postal_distance.replace(/>\s*1000/, "over 1,000")} from address`);
    const details: Record<string, string> = {};
    if (firstSeen) details["Email first seen"] = firstSeen;
    if (typeof ev.status === "string") details["Email validation"] = ev.status;
    if (typeof phone.line_type === "string") details["Phone line"] = `${phone.line_type}${phone.prepaid === true ? " · prepaid" : ""}`;
    if (Object.keys(owner).length) details["Phone owner"] = ownerMatch ? "no match" : "match";
    if (typeof postal.ip_postal_distance === "string") details["IP to address"] = postal.ip_postal_distance;
    if (typeof postal.deliverability === "string") details["Address"] = postal.deliverability;
    return { ok: true, score, signals, details };
  } catch (error) {
    return { ok: false, score: null, signals: [], error: error instanceof Error ? error.message : String(error) };
  }
}

// Turn a CRS result into risk points + a reason line for the case.
export function crsReason(r: CrsResult): [number, string] | null {
  if (!r.ok || r.score === null) return null;
  const detail = r.signals.length ? `: ${r.signals.join(", ")}` : "";
  if (r.score >= 70) return [25, `CRS FraudFinder rates the buyer's contact high risk (${r.score}/100)${detail}`];
  if (r.score >= 40) return [10, `CRS FraudFinder rates the buyer's contact medium risk (${r.score}/100)${detail}`];
  return null;
}
