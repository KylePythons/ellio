# Devpost write-up for Ellio

Copy each section into the matching Devpost field.

## Tagline

Ellio catches the scam before the money moves, then calls Grandma to make sure.

## Inspiration

Card scams hit older adults hard. A scammer gets a card number, places a big order, and has the receipt sent to their own email. Banks flag "unusual" charges with blunt rules, and the follow-up is often a robotic text the cardholder doesn't understand. We wanted a fraud desk that knows what normal looks like for one specific person, and that picks up the phone and talks to her like a person would.

## What it does

Dolores, 78, has a Merritt Bank Visa. Someone uses it at BestBye to buy a $1,499 TV.

1. **Ellio scores the purchase against her life, not a dollar limit.** It reads her Capital One Nessie account history: a median purchase of $47.50 across 24 purchases, all groceries, pharmacy, dining and utilities. A TV is 32× her usual and her first electronics purchase ever.
2. **It checks who is really on the other end.** The card says Dolores, but the receipt goes to someone else. CRS FraudFinder rates that contact 88/100: an email first seen 10 days ago and a prepaid VoIP phone registered to someone else.
3. **It calls her.** At 95/100, Ellio opens a case and a Cartesia voice agent calls Dolores. It asks about the purchase in plain, patient language, listens for scam red flags ("someone from tech support asked for my card"), and approves or freezes the card.
4. **The bank desk sees it all live:** every finding with its points, the live transcript, red flags, and the outcome.

## How we built it

- **Convex** is the whole backend: HTTP actions for checkout, agent tools and the Cartesia webhook; scheduled functions for the backstop call; and a live query that updates the bank desk the moment anything changes.
- **Cartesia** (Line) runs the voice agent, with Claude as its brain. It reports back to Convex through tool calls: approve, escalate, report red flag, and transcript.
- **CRS Credit API** (FraudFinder) scores the buyer's email, phone, address and IP at checkout.
- **Capital One Nessie** holds Dolores's account and transaction history. Ellio computes her baseline from it, and writes ordinary purchases back.
- The store and bank desk are plain HTML, CSS and JavaScript.

## Challenges we ran into

- Getting CRS sandbox matches right: the sandbox only returns a full fraud score when a request carries every field of a test persona, including the IP.
- Nessie's API only answers over HTTPS, which surfaced as a vague connection error from the backend.
- Making the voice agent sound calm and clear for an older listener: short sentences, no rushing, and no false reassurance.

## Accomplishments that we're proud of

- One checkout pulls together three live data sources (Nessie history, CRS fraud scoring and Ellio's own rules) into a single, explainable score.
- Every finding on the bank desk says why it counted and where it came from.
- If CRS or Nessie goes down, checkout still works: Ellio scores without that signal and logs it.

## What we learned

- Explainable beats clever: a list of plain-language reasons with points is easier to trust than a single score.
- Voice is the right channel for this user. A phone call reaches someone a push notification never would.

## What's next for Ellio

- Real cardholder history from a bank's own systems, in place of seeded data.
- Letting the cardholder name a trusted family contact who gets looped in on escalation.
- Authentication on the agent tool routes, and stronger family matching than shared names.

## Built with

Cartesia, Convex, CRS Credit API, Capital One Nessie, Claude, TypeScript, Python, JavaScript, HTML, CSS
