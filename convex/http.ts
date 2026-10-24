import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const HOME_LOCATION = "Hobbs, NM";
const AMOUNT_LIMIT = 500;

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

function riskReasons(amount: number, location: string): string[] {
  const reasons: string[] = [];
  if (amount > AMOUNT_LIMIT) {
    reasons.push(`Amount $${amount} is over $${AMOUNT_LIMIT}`);
  }
  if (location !== HOME_LOCATION) {
    reasons.push(`Location ${location} is not ${HOME_LOCATION}`);
  }
  return reasons;
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
    return "placed";
  } catch (error) {
    console.warn(
      `Cartesia call failed (${errorText(error)}). Case left in calling status.`,
    );
    return "failed";
  }
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

  const transactionId = await ctx.runMutation(internal.transactions.record, {
    customer,
    merchant,
    item,
    amount,
    location,
  });
  const reasons = riskReasons(amount, location);
  if (reasons.length === 0) {
    return json({
      ok: true,
      risky: false,
      transactionId,
      riskReasons: reasons,
    });
  }

  const caseId = await ctx.runMutation(internal.cases.open, {
    transactionId,
    riskReasons: reasons,
  });
  const cartesia = await placeCartesiaCall({
    caseId,
    item,
    amount,
    merchant,
    location,
    riskReasons: reasons,
  });

  return json({
    ok: true,
    risky: true,
    transactionId,
    caseId,
    status: "calling",
    riskReasons: reasons,
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
  const parsed = await readToolBody(req, ["case_id", "flag", "quote"]);
  if (parsed instanceof Response) {
    return parsed;
  }
  try {
    const result = await ctx.runMutation(internal.cases.addRedFlag, {
      caseId: parsed.case_id as Id<"cases">,
      flag: parsed.flag,
      quote: parsed.quote,
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
