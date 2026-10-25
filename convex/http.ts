import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CALL_THRESHOLD, scorePurchase } from "./risk";
import { crsReason, fraudFinder } from "./crs";

// The desk starts the call when Ellio reaches the "Call" step (calls.startNow).
// This is only a backstop in case no desk is open.
const CALL_DELAY_MS = 45000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredAmount(value: unknown): number | null {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return amount;
}

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

function toolFailure(error: unknown): Response {
  const message = errorText(error);
  if (
    message.includes("Case not found") ||
    message.includes("ArgumentValidationError") ||
    message.includes("does not match")
  ) {
    return json({ error: "Invalid or unknown case_id" }, 400);
  }
  console.error(message);
  return json({ error: "Could not update case" }, 500);
}


const purchase = httpAction(async (ctx, req) => {
  const body: unknown = await req.json().catch(() => undefined);
  if (!isRecord(body)) {
    return json({ error: "Expected a JSON object" }, 400);
  }

  const customer = requiredString(body, "customer");
  const merchant = requiredString(body, "merchant");
  const item = requiredString(body, "item");
  const location = requiredString(body, "location");
  const amount = requiredAmount(body.amount);
  if (!customer || !merchant || !item || !location || amount === null) {
    return json(
      {
        error:
          "customer, merchant, item, amount, and location are required",
      },
      400,
    );
  }

  const email = requiredString(body, "email");
  const phone = requiredString(body, "phone") ?? undefined;
  const contactRaw = isRecord(body.contact) ? body.contact.name : undefined;
  const contactName = typeof contactRaw === "string" && contactRaw.trim() !== "" ? contactRaw.trim() : undefined;
  const extra: Array<[number, string]> = [];
  let crs: Awaited<ReturnType<typeof fraudFinder>> | null = null;
  if (email) {
    const c = isRecord(body.contact) ? body.contact : {};
    const str = (k: string) => (typeof c[k] === "string" && (c[k] as string).trim() !== "" ? (c[k] as string).trim() : undefined);
    crs = await fraudFinder({
      name: str("name") ?? customer,
      email,
      phone,
      ipAddress: str("ipAddress"),
      address:
        str("street") && str("city") && str("state") && str("zip")
          ? { addressLine1: str("street")!, city: str("city")!, state: str("state")!, postalCode: str("zip")! }
          : undefined,
    });
    if (crs.ok) console.log(`crs.fraudFinder score ${crs.score} | ${crs.signals.join("; ")}`);
    else console.warn(`crs.fraudFinder skipped: ${crs.error}`);
    const r = crsReason(crs);
    if (r) extra.push(r);
  }

  const recent = await ctx.runQuery(internal.transactions.recentFor, { customer });
  const { score, reasons } = scorePurchase({
    extra,
    contactName,
    customer,
    item,
    amount,
    location,
    recent,
    now: Date.now(),
  });
  const transactionId = await ctx.runMutation(internal.transactions.record, {
    customer,
    merchant,
    item,
    amount,
    location,
    riskScore: score,
  });
  console.log(`risk.score ${score}/100 for ${item} $${amount} → ${score >= CALL_THRESHOLD ? "call" : "no call"} | ${reasons.join("; ")}`);
  if (score < CALL_THRESHOLD) {
    return json({
      ok: true,
      risky: false,
      transactionId,
      riskScore: score,
      riskReasons: reasons,
      crsScore: crs?.score ?? null,
    });
  }

  const caseId = await ctx.runMutation(internal.cases.open, {
    transactionId,
    riskReasons: reasons,
    riskScore: score,
  });
  await ctx.scheduler.runAfter(CALL_DELAY_MS, internal.calls.place, {
    caseId,
    item,
    amount,
    merchant,
    location,
    riskReasons: reasons,
  });
  const cartesia = "scheduled";
  console.log(`case ${caseId} opened · waiting for Ellio's review (backstop call in ${CALL_DELAY_MS / 1000}s)`);

  return json({
    ok: true,
    risky: true,
    transactionId,
    caseId,
    status: "calling",
    riskScore: score,
    riskReasons: reasons,
    crsScore: crs?.score ?? null,
    cartesia,
  });
});

const approve = httpAction(async (ctx, req) => {
  const parsed = await readToolBody(req, ["case_id", "reason"]);
  if (parsed instanceof Response) {
    return parsed;
  }
  try {
    const result = await ctx.runMutation(internal.cases.approve, {
      caseId: parsed.case_id as Id<"cases">,
      reason: parsed.reason,
    });
    return json({ ok: true, case_id: parsed.case_id, ...result });
  } catch (error) {
    return toolFailure(error);
  }
});

const escalate = httpAction(async (ctx, req) => {
  const parsed = await readToolBody(req, ["case_id", "reason"]);
  if (parsed instanceof Response) {
    return parsed;
  }
  console.log(`claude → escalate: ${parsed.reason}`);
  try {
    const result = await ctx.runMutation(internal.cases.escalate, {
      caseId: parsed.case_id as Id<"cases">,
      reason: parsed.reason,
    });
    return json({ ok: true, case_id: parsed.case_id, ...result });
  } catch (error) {
    return toolFailure(error);
  }
});

const redFlag = httpAction(async (ctx, req) => {
  const parsed = await readToolBody(req, ["case_id", "flag", "quote"], ["why"]);
  if (!(parsed instanceof Response)) console.log(`claude → report_red_flag "${parsed.flag}"`);
  if (parsed instanceof Response) {
    return parsed;
  }
  try {
    const result = await ctx.runMutation(internal.cases.addRedFlag, {
      caseId: parsed.case_id as Id<"cases">,
      flag: parsed.flag,
      quote: parsed.quote,
      ...(parsed.why ? { why: parsed.why } : {}),
    });
    return json({ ok: true, case_id: parsed.case_id, ...result });
  } catch (error) {
    return toolFailure(error);
  }
});

const transcript = httpAction(async (ctx, req) => {
  const parsed = await readToolBody(req, ["case_id", "role", "text"]);
  if (parsed instanceof Response) {
    return parsed;
  }
  try {
    const result = await ctx.runMutation(internal.cases.addTranscript, {
      caseId: parsed.case_id as Id<"cases">,
      role: parsed.role,
      text: parsed.text,
    });
    return json({ ok: true, case_id: parsed.case_id, ...result });
  } catch (error) {
    return toolFailure(error);
  }
});

async function readToolBody(
  req: Request,
  keys: string[],
  optional: string[] = [],
): Promise<Record<string, string> | Response> {
  const body: unknown = await req.json().catch(() => undefined);
  if (!isRecord(body)) {
    return json({ error: "Expected a JSON object" }, 400);
  }
  const parsed: Record<string, string> = {};
  for (const key of keys) {
    const value = requiredString(body, key);
    if (!value) {
      return json({ error: `${keys.join(", ")} are required` }, 400);
    }
    parsed[key] = value;
  }
  for (const key of optional) {
    const value = requiredString(body, key);
    if (value) {
      parsed[key] = value;
    }
  }
  return parsed;
}

const cartesiaWebhook = httpAction(async (ctx, req) => {
  const expected = envValue(env.WEBHOOK_SECRET);
  const provided = req.headers.get("x-webhook-secret");
  if (!expected || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body: unknown = await req.json().catch(() => undefined);
  if (!isRecord(body)) {
    return json({ error: "Expected a JSON object" }, 400);
  }
  if (body.type !== "call_completed") {
    return json({ ok: true, ignored: true });
  }
  if (!isRecord(body.call)) {
    return json({ error: "call_completed is missing call" }, 400);
  }
  const metadata = body.call.metadata;
  if (!isRecord(metadata) || typeof metadata.case_id !== "string") {
    return json({ error: "call.metadata.case_id is missing" }, 400);
  }
  const caseId = metadata.case_id.trim();
  if (caseId === "") {
    return json({ error: "call.metadata.case_id is missing" }, 400);
  }
  try {
    await ctx.runMutation(internal.cases.markEnded, {
      caseId: caseId as Id<"cases">,
    });
  } catch (error) {
    return toolFailure(error);
  }
  if (typeof body.call.summary !== "string" || body.call.summary.trim() === "") {
    return json({ ok: true, saved: false });
  }

  try {
    await ctx.runMutation(internal.cases.setSummary, {
      caseId: caseId as Id<"cases">,
      summary: body.call.summary.trim(),
    });
  } catch (error) {
    return toolFailure(error);
  }
  return json({ ok: true, saved: true, case_id: caseId });
});

const http = httpRouter();

const options = httpAction(async () => preflight());

const routes: Array<{ path: string; handler: typeof purchase }> = [
  { path: "/purchase", handler: purchase },
  { path: "/tools/approve", handler: approve },
  { path: "/tools/escalate", handler: escalate },
  { path: "/tools/red-flag", handler: redFlag },
  { path: "/tools/transcript", handler: transcript },
  { path: "/webhook/cartesia", handler: cartesiaWebhook },
];

for (const route of routes) {
  http.route({ path: route.path, method: "POST", handler: route.handler });
  http.route({ path: route.path, method: "OPTIONS", handler: options });
}

export default http;
