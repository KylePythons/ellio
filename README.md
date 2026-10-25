# Ellio

**▶ [Watch the 2-minute demo](https://youtu.be/8RfVdj1htYs)** · Built at Cal Hacks 13.0

A hackathon demo. BestBye is a small electronics shop. A risky checkout opens a fraud case at Merritt Bank, which can place a Cartesia verification call and shows the case live.

Ellio is built for cardholders like Dolores, a 78-year-old retiree, who are often the target of card scams. It judges each purchase against her own normal life, checks who is really on the other end of the order, and calls her in a natural voice before the money moves.

## How Ellio decides

Every checkout is scored in `convex/risk.ts` (0 to 100; Ellio calls at 60+). Each finding is shown on the bank case with its points.

| Signal | Source | Points |
|---|---|---|
| Purchase is many times her usual size | Capital One Nessie account history (median of her purchases) | +10 / +20 / +30 |
| First purchase in this category | Capital One Nessie account history | +15 |
| Buyer's contact is high or medium risk | CRS FraudFinder (email, phone, address, IP) | +25 / +10 |
| Receipt contact is not the cardholder | Ellio rule | +15 |
| Ships to an unfamiliar address | Ellio rule | +25 |
| Gift cards or other scam payments | Ellio rule | +30 |
| Several large purchases within an hour | Ellio rule | +15 |
| Cardholder is 65+ | Ellio rule | +10 |

If a case opens, the Cartesia voice agent (`agent/`, Cartesia Line with Claude) calls her, asks about the purchase, and reports back through tool calls: approve, escalate, red flag, and live transcript. The Merritt Bank desk shows all of it live through a Convex query.

## Sponsor tech

- **Cartesia**: the verification call. Voice is the product: the agent speaks to the cardholder, listens for scam red flags, and approves or escalates. Code: `agent/main.py`, `convex/calls.ts`.
- **Convex**: the whole backend. HTTP actions for checkout, agent tools and the Cartesia webhook; scheduled functions for the backstop call; a live query that drives the bank desk; typed env vars. Code: `convex/`.
- **CRS Credit API**: FraudFinder (AtData) scores the receipt contact entered at checkout. In the demo the contact belongs to a synthetic identity, and CRS returns 88/100: an email first seen days ago and a prepaid VoIP phone registered to someone else. Code: `convex/crs.ts`.
- **Capital One Nessie**: Dolores's Merritt Bank Visa lives in Nessie with three months of everyday purchases. Ellio reads that history to learn her usual purchase size and categories, and writes ordinary (unflagged) purchases back to the account. Code: `convex/nessie.ts`.

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

### CRS and Nessie setup

Set the credentials on the deployment (names only; never commit the values). If a value has special characters, copy it and use the clipboard:

```bash
npx convex env set CRS_USERNAME "$(pbpaste)"
npx convex env set CRS_PASSWORD "$(pbpaste)"
npx convex env set NESSIE_API_KEY "$(pbpaste)"
```

Seed Dolores's Nessie account once (customer, card account, four local merchants, 24 purchases over three months):

```bash
npx convex run nessie:seed
```

Each checkout logs `crs.fraudFinder score …`, `nessie.history …` and `risk.score …` in `npx convex logs`. If CRS or Nessie is unreachable, Ellio logs a warning and scores without that signal, so checkout still works.

## Known limitations

- **CRS sandbox personas only.** The sandbox returns a real FraudFinder result only for CRS test personas, so the checkout's contact section is pre-filled with persona P13 (Kayla Brennan). Do not change those values: requests that don't match a persona go to the live vendor.
- **Nessie is a mock bank.** Dolores's account history is seeded sample data.
- **Sample data.** Dolores and the sample-traffic cardholders are fictional.
- **No authentication.** The `/tools/*` routes are open on purpose for the demo.
- **Contact rule is name-based.** A receipt contact is treated as family if it shares a name with the cardholder.
