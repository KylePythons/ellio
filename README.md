# Ellio

A hackathon demo. BestBye is a small electronics shop. A risky checkout opens a fraud case at Merritt Bank, which can place a Cartesia verification call and shows the case live.

## Run and deploy

There is no build step. `store/` and `bank/` are static files. The backend is the Convex deployment named in `.env.local`.

### Convex

From the repo root, with the Convex CLI logged in:

```bash
npx convex dev
```

That pushes functions to the linked dev deployment and keeps them updated. To push once and exit:

```bash
npx convex dev --once
```

HTTP routes are served at `CONVEX_SITE_URL` (`https://<deployment>.convex.site`). The bank’s live query uses `CONVEX_URL` (`https://<deployment>.convex.cloud`). Both values are already in `.env.local`. `store/config.js` and `bank/config.js` copy the public URLs so the pages can be opened directly. If you link a different deployment, update those two files from `.env.local`. Do not put secrets in them.

Set the Cartesia values on the deployment before a real phone call. Names only; never commit the values:

```bash
npx convex env set CARTESIA_API_KEY <key>
npx convex env set FROM_NUMBER_ID <id>
npx convex env set AGENT_ID <id>
npx convex env set GRANDMA_PHONE <e164>
npx convex env set WEBHOOK_SECRET <secret>
```

If those Cartesia call variables are missing, a risky purchase still creates a case with status `calling` and logs a warning.

Point the Cartesia agent webhook at:

```text
https://<deployment>.convex.site/webhook/cartesia
```

Cartesia sends the same secret in the `x-webhook-secret` header. On a `call_completed` event, the handler stores `call.summary` on the case in `call.metadata.case_id`.

Production deploys are a separate step (`npx convex deploy`) and should only be run when you mean to update prod.

### Store

Open `store/index.html` in a browser. Checkout posts to `CONVEX_SITE_URL/purchase`. The $1,499 65" Horizon TV and the default shipping city, San Francisco, CA, are outside the card’s home city of Hobbs, NM, so the purchase is flagged.

### Bank

Open `bank/index.html` in a browser. It loads the Convex browser client from jsDelivr and subscribes to `cases:list`, newest first. Status badges: pending and calling are yellow, approved is green, escalated is red.

**Reset demo** deletes cases and transactions. **Simulate call result** posts to `/tools/approve`, `/tools/escalate`, `/tools/red-flag`, and `/tools/transcript` for the newest case, so the desk can be exercised before the phone agent is connected.

The tool routes are open on purpose for this demo. They are not an authentication model.
