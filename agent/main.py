import asyncio
import os
import re
from typing import Annotated

import httpx
from loguru import logger

from line.events import AgentSendText, UserTurnEnded
from line.llm_agent import LlmAgent, LlmConfig, end_call, loopback_tool
from line.voice_agent_app import AgentEnv, CallRequest, VoiceAgentApp

# Your Convex HTTP actions URL (the ...convex.site one).
# Set with: cartesia env set CONVEX_SITE_URL=https://deafening-herring-377.convex.site
CONVEX_SITE_URL = os.getenv("CONVEX_SITE_URL", "https://deafening-herring-377.convex.site").rstrip("/")


async def _post(path: str, payload: dict) -> str:
    """Send a tool result to the Convex backend. Never crash the call if it fails."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{CONVEX_SITE_URL}{path}", json=payload)
            r.raise_for_status()
        return "ok"
    except Exception as e:
        logger.warning(f"POST {path} failed: {e}")
        return "The bank system didn't respond, but continue the conversation normally."


# ---------- Tools Ellio can use during the call ----------

@loopback_tool
async def approve_transaction(
    ctx,
    case_id: Annotated[str, "The case ID for this call"],
    reason: Annotated[str, "Short reason, e.g. 'Customer bought it for themselves'"],
):
    """Approve the purchase after the customer clearly confirms they made it."""
    await _post("/tools/approve", {"case_id": case_id, "reason": reason})
    return (
        "Purchase approved. Tell them the purchase will go through. "
        "Ask if that is all they needed. Do not thank them, praise them, or say goodbye. "
        "Do not end the call in this turn."
    )


@loopback_tool
async def escalate_fraud(
    ctx,
    case_id: Annotated[str, "The case ID for this call"],
    reason: Annotated[str, "Short reason, e.g. 'Customer did not make this purchase'"],
):
    """Escalate to fraud when the customer did not make the purchase, or is unsure or confused about it."""
    await _post("/tools/escalate", {"case_id": case_id, "reason": reason})
    return (
        "Escalated. Tell them only these facts, in short sentences: the purchase is stopped, "
        "the card is frozen so nobody else can use it, a new card will come in the mail, "
        "and the family contact on the account has been told. "
        "Do not thank them. Do not praise them for being careful. Do not say goodbye. Do not use their name. "
        "Ask once whether they want any of that repeated. Do not end the call in this turn."
    )


@loopback_tool
async def pause_possible_scam(
    ctx,
    case_id: Annotated[str, "The case ID for this call"],
    reason: Annotated[str, "Short reason, e.g. 'Grandson in jail story, told to keep it secret'"],
):
    """Pause the purchase when the customer made it but warning signs show someone may be scamming them.
    Only call this after the customer agrees to pause it, or still wants to go ahead despite the warning signs."""
    await _post("/tools/escalate", {"case_id": case_id, "reason": f"Possible scam: {reason}"})
    return (
        "Paused. Say exactly this, and nothing else: "
        "'Okay. The purchase is on hold, the gift cards won't be sent, and your family has been told. "
        "Is there anything else I can help with?' "
        "Do not end the call in this turn."
    )


@loopback_tool
async def report_red_flag(
    ctx,
    case_id: Annotated[str, "The case ID for this call"],
    flag: Annotated[str, "Short label, e.g. 'Did not recognize purchase' or 'Unfamiliar shipping address'"],
    quote: Annotated[str, "The customer's words that raised the flag, briefly"],
    why: Annotated[str, "One short sentence on why this matters, e.g. 'Jail and bail money is a classic grandparent scam'"],
):
    """Record a warning sign as soon as you notice it, so the bank's dashboard shows it live."""
    await _post("/tools/red-flag", {"case_id": case_id, "flag": flag, "quote": quote, "why": why})
    return "Recorded. Continue the conversation."


# ---------- Prompt ----------

SYSTEM_PROMPT = """You are Ellio, a fraud protection assistant calling on behalf of Merritt Bank.
You are speaking on the phone with an older customer who may not use apps or the internet.
Your brain is Claude, made by Anthropic. If asked what you are, say you're an automated
assistant from Merritt Bank's fraud team.

# How you speak
- Slowly, warmly, and clearly. One question at a time.
- Keep every reply to one or two short sentences, under 25 words. Never give a speech.
- Plain words. No jargon like "transaction ID", "authorization", or "merchant category".
- Never rush or pressure. If they seem confused, repeat simply and patiently.
- Never use lists or formatting. This is a spoken phone call.

# Safety rules (never break these)
- NEVER ask for a PIN, password, full card number, Social Security number, or any code.
- NEVER ask them to move, send, or transfer money, or to buy anything.
- NEVER ask them to hang up, call someone else, or leave the call to check something.
  You stay on the line and handle it: offer to pause the purchase and tell their family yourself.
- If they offer sensitive information, stop them kindly: "Please don't share that with me, I don't need it."
- If they are worried this call is a scam, tell them that's smart, and that they can hang up
  and call the number on the back of their card instead.

# Your job on this call
Confirm whether the customer made the purchase described below.
The introduction in the "Already spoken" section was already said out loud. Never say it again.
Never introduce yourself again. Never say "thanks for picking up." Never restate the purchase, the price,
or the store unless they ask you to repeat it.
1. Answer the words they just said.
   If they only greet you or say they can talk, ask one short question: whether they made this purchase.
   If they already said they did or did not make it, respond to that. Do not ask the question again.
2. If they clearly say YES, ask ONE short question about what it's for, unless they already told you.
   Do not keep probing for details. One answer is enough to decide. Then:
   - If it makes sense and nobody asked them to buy it (for example, a gift they chose themselves):
     call approve_transaction, tell them the purchase will go through, and ask if that is all they needed.
   - If there are scam warning signs (see "Scam warning signs"), follow "If it sounds like a scam".
3. If they say NO, don't recognize it, or don't know the shipping address:
   call report_red_flag for each warning sign you notice, then call escalate_fraud.
   Explain only what the bank will do. Do not compliment them, thank them, or say they did the right thing.
   Ask if they want any of that repeated.
4. If they are unsure or confused after you've explained it simply once or twice:
   do not guess. Call escalate_fraud with the reason that the customer was unsure,
   and tell them a person from the bank will follow up to help. Then ask if they want that repeated.
5. End the call only after they say they understand or have nothing else to ask.
   Close with one plain sentence, such as "Alright. We'll take care of it from here."
   Do not say "Goodbye" and do not say their name in the closing. Do not thank them for being careful.
Always pass the case ID below to every tool.

# Scam warning signs
Scammers often talk older people into making a purchase themselves. Warning signs include:
- Someone called, texted, or messaged them and asked them to buy it.
- A grandchild or relative "in trouble": jail, bail, an accident, a hospital, stuck abroad.
- Someone claiming to be the government, IRS, police, Social Security, tech support, a utility, or their bank.
- Paying with gift cards, wire transfers, or crypto, or being asked to read card numbers over the phone.
- Being told to hurry, or to keep it secret from family.
- A prize, lottery, or online romance.

# If it sounds like a scam
- Call report_red_flag for each warning sign as soon as you hear it, with their words as the quote
  and one short sentence on why it matters. The bank staff see that sentence as your reasoning.
- As soon as you hear a scam warning sign, do all of this in ONE short turn:
  a few kind words, one sentence that this is a common scam (real family or police never ask for gift cards),
  and the permission question below. Do not ask follow-up questions about the story first.
- Never call them foolish, and never lecture. They did nothing wrong.
- Ask permission: "Would it be okay if I put this purchase on hold and let your family contact know,
  so you can check together?"
- If they agree, call pause_possible_scam.
- If they still want to go ahead, respect them, but say you'll hold it for a short review and a person
  from the bank will call them back. Then call pause_possible_scam with a reason that says the customer
  wanted to proceed.
- Never approve a purchase that has scam warning signs.
"""


def build_case_context(m: dict) -> str:
    reasons = ", ".join(m.get("risk_reasons", []) or []) or "unusual purchase"
    return f"""
# This call
Customer: {m.get('customer_name', 'the cardholder')}
Purchase: {m.get('item', 'an item')} for ${m.get('amount', '?')} from {m.get('merchant', 'an online store')}
Shipping / location: {m.get('location', 'unknown')}
Why it was flagged: {reasons}
Case ID: {m.get('case_id', 'unknown')}
"""


# ---------- Live transcript relay ----------
# Wraps the LlmAgent: copies each user turn and each full agent reply to the
# bank dashboard (POST /tools/transcript) while passing every event through unchanged.

def _user_text(event) -> str:
    content = getattr(event, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, (list, tuple)):
        parts = [getattr(c, "content", None) or getattr(c, "text", None) or "" for c in content]
        return " ".join(p for p in parts if p).strip()
    return str(content)


_BARE_GREETING = {
    "hey",
    "hey there",
    "hi",
    "hi there",
    "hello",
    "hello there",
    "yeah",
    "yes",
    "yep",
    "yup",
    "speaking",
    "this is she",
    "this is her",
    "uh hey",
    "uh hi",
    "uh hello",
    "um hey",
    "um hi",
    "um hello",
    "yes hello",
    "hello yes",
    "hi yes",
    "yeah hello",
    "hey yes",
}


def _bare_greeting(text: str) -> bool:
    cleaned = re.sub(r"[^a-z' ]", " ", (text or "").lower())
    cleaned = " ".join(cleaned.split())
    return cleaned in _BARE_GREETING


class LiveTranscriptRelay:
    def __init__(self, inner, case_id: str, item: str):
        self.inner = inner
        self.case_id = case_id
        self.item = item or "this purchase"
        self._answered = False

    def __getattr__(self, name):
        # Pass through anything else the SDK looks for (filters, config, ...)
        return getattr(self.inner, name)

    def _send(self, role: str, text: str):
        text = (text or "").strip()
        if not text or not self.case_id:
            return
        # fire-and-forget so the call never waits on the dashboard
        asyncio.create_task(_post("/tools/transcript", {"case_id": self.case_id, "role": role, "text": text}))

    async def process(self, env, event, *args, **kwargs):
        user_text = _user_text(event) if isinstance(event, UserTurnEnded) else ""
        if user_text:
            self._send("Customer", user_text)
            # A hello while the introduction is still playing used to make the model
            # deliver the whole pitch again. Answer a bare greeting directly.
            if not self._answered and _bare_greeting(user_text):
                self._answered = True
                line = f"Hi. Did you buy the {self.item}?"
                self._send("Ellio", line)
                yield AgentSendText(text=line)
                return
        spoken = []
        try:
            async for out in self.inner.process(env, event, *args, **kwargs):
                if isinstance(out, AgentSendText):
                    spoken.append(out.text or "")
                yield out
        finally:
            # one line per agent reply (also flushes if Ellio was interrupted)
            reply = "".join(spoken).strip()
            if reply:
                if isinstance(event, UserTurnEnded):
                    self._answered = True
                self._send("Ellio", reply)


async def get_agent(env: AgentEnv, call_request: CallRequest):
    m = call_request.metadata or {}
    logger.info(f"Call {call_request.call_id} metadata: {m}")

    name = m.get("customer_name", "there")
    intro = (
        f"Hi {name}, this is Ellio from Merritt Bank. "
        f"Did you just buy {m.get('amount', '')} dollars of {m.get('item', 'something')}?"
    )

    agent = LlmAgent(
        model="anthropic/claude-haiku-4-5-20251001",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        tools=[
            approve_transaction,
            escalate_fraud,
            pause_possible_scam,
            report_red_flag,
            end_call(
                description=(
                    "End the call only after the customer has said they understand "
                    "or have nothing else to ask. Never use this in the same turn as "
                    "the explanation of what the bank will do."
                )
            ),
        ],
        config=LlmConfig.from_call_request(
            call_request,
            fallback_system_prompt=(
                SYSTEM_PROMPT
                + "\n# Already spoken\n"
                + intro
                + "\n"
                + build_case_context(m)
            ),
            fallback_introduction=intro,
        ),
    )
    return LiveTranscriptRelay(agent, m.get("case_id", ""), m.get("item", ""))


app = VoiceAgentApp(get_agent=get_agent)

if __name__ == "__main__":
    app.run()
