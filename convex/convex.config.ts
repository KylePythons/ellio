import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CARTESIA_API_KEY: v.optional(v.string()),
    FROM_NUMBER_ID: v.optional(v.string()),
    AGENT_ID: v.optional(v.string()),
    GRANDMA_PHONE: v.optional(v.string()),
    WEBHOOK_SECRET: v.optional(v.string()),
  },
});

export default app;
