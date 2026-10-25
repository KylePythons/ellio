// Merritt Bank fraud desk — Ellio's workspace.
// Ellio's work on a case plays out as windows opening on a desktop, with an
// "Ellio" cursor moving to whatever it is acting on. All data comes live from
// Convex (cases:list); nothing here is scripted except the demo controls.

const convexUrl = window.CONVEX_URL;
const siteUrl = (window.CONVEX_SITE_URL || "").replace(/\/$/, "");

const $ = (id) => document.getElementById(id);
const desktopEl = $("desktop");
const windowsEl = $("windows");
const cursorEl = $("cursor");
const narrationEl = $("narration");
const dotEl = $("ellio-dot");
const queueEl = $("queue");
const queueEmptyEl = $("queue-empty");
const connEl = $("conn");
const controlsEl = $("controls");
const toggleControlsBtn = $("toggle-controls");
const resetBtn = $("reset");
const simTargetEl = $("sim-target");
const simStatusEl = $("sim-status");
const toolButtons = document.querySelectorAll("[data-tool]");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIVE_WINDOW_MS = 20000; // a case newer than this replays with animation

let client = null;
let cases = [];
let selectedId = null; // null = follow the newest case
let busy = false;
let view = null;

// ---------- helpers ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
const money = (n) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const clock = (t) =>
  new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const speaker = (role) =>
  ["customer", "user", "human", "callee"].includes(String(role || "").trim().toLowerCase())
    ? "customer"
    : "ellio";
const firstName = (name) => String(name || "the customer").split(" ")[0];

const ACTION_VERBS = {
  "card frozen": "Freezing the card",
  "dispute filed": "Filing a dispute",
  "family notified": "Notifying the family contact",
};
const verbFor = (action) =>
  ACTION_VERBS[String(action).toLowerCase()] || action.replace(/^Approved:\s*/i, "Approving the purchase");

function narrate(text, working = true) {
  narrationEl.textContent = text;
  dotEl.classList.toggle("is-working", working);
}

// ---------- animation queue ----------
// Every visible step is a task, so Ellio's actions play one at a time and in order.
function makeQueue(animate) {
  let chain = Promise.resolve();
  return {
    animate,
    count: 0,
    add(task, quiet = false) {
      if (!quiet) this.count++;
      const gen = view && view.gen;
      chain = chain.then(async () => {
        if (!view || view.gen !== gen) return;
        try {
          await task();
        } catch (e) {
          console.error(e);
        }
      });
      return chain;
    },
  };
}
const pause = (ms) => (view && view.queue.animate && !reduceMotion ? sleep(ms) : Promise.resolve());

// ---------- cursor ----------
function moveCursorTo(target, dx = 28, dy = 22) {
  if (!target) return Promise.resolve();
  const d = desktopEl.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const x = r.left - d.left + desktopEl.scrollLeft + Math.min(dx, r.width - 10);
  const y = r.top - d.top + desktopEl.scrollTop + Math.min(dy, r.height - 6);
  cursorEl.style.setProperty("--cx", `${x}px`);
  cursorEl.style.setProperty("--cy", `${y}px`);
  cursorEl.classList.add("is-visible");
  return pause(720);
}
async function clickCursor() {
  cursorEl.classList.remove("is-clicking");
  void cursorEl.offsetWidth;
  cursorEl.classList.add("is-clicking");
  await pause(260);
}
function setActive(win) {
  for (const w of windowsEl.querySelectorAll(".win")) w.classList.toggle("is-active", w === win);
}

// ---------- windows ----------
function makeWindow(kind, title) {
  const win = el("section", `win w-${kind}`);
  win.setAttribute("aria-label", title);
  const bar = el("div", "win-bar");
  const lights = el("div", "lights");
  lights.append(el("i"), el("i"), el("i"));
  const state = el("span", "win-state");
  bar.append(lights, el("h3", "win-title", title), state);
  win.append(bar);
  win.stateEl = state;
  return win;
}
async function openWindow(win, animate) {
  if (animate && !reduceMotion) {
    // Open from where the Ellio cursor is, like a window launching from a click.
    win.classList.add("is-opening");
    win.addEventListener("animationend", () => win.classList.remove("is-opening"), { once: true });
  }
  windowsEl.append(win);
  desktopEl.classList.add("has-case");
  setActive(win);
  if (animate) {
    await pause(120);
    await moveCursorTo(win.querySelector(".win-bar"), 70, 16);
    await clickCursor();
  }
}

function buildReview(c) {
  const win = makeWindow("review", "Purchase review");
  const body = el("div", "win-body");
  body.append(el("p", "amount", money(c.transaction.amount)));
  body.append(el("p", "item", `${c.transaction.item} from ${c.transaction.merchant}`));
  const facts = el("dl", "facts");
  for (const [k, v] of [
    ["Cardholder", c.transaction.customer],
    ["Shipping to", c.transaction.location],
    ["Placed at", clock(c.transaction.createdAt)],
  ]) {
    facts.append(el("dt", null, k), el("dd", null, v));
  }
  body.append(facts);
  const reasons = el("ul", "reasons");
  reasons.setAttribute("aria-label", "Why it was flagged");
  body.append(reasons);
  win.append(body);
  win.reasonsEl = reasons;
  win.stateEl.textContent = "Flagged";
  return win;
}

function buildCall(c) {
  const win = makeWindow("call", `Call with ${firstName(c.transaction.customer)}`);
  const head = el("div", "call-head");
  const avatar = el("div", "avatar", firstName(c.transaction.customer).slice(0, 1));
  const who = el("div", "call-who");
  who.append(el("strong", null, c.transaction.customer), el("span", null, "Ellio is calling from Merritt Bank"));
  const badge = el("span", "call-badge ringing", "Ringing");
  head.append(avatar, who, badge);
  const log = el("div", "log");
  log.setAttribute("aria-live", "polite");
  const empty = el("p", "log-empty", "Waiting for the call to connect.");
  log.append(empty);
  win.append(head, log);
  win.badgeEl = badge;
  win.whoEl = who.querySelector("span");
  win.logEl = log;
  win.emptyEl = empty;
  win.messages = [];
  win.orphanFlags = null;
  win.dataset.phase = "ringing";
  return win;
}

function setCallPhase(win, phase, name) {
  if (!win || win.dataset.phase === phase) return;
  win.dataset.phase = phase;
  const badge = win.badgeEl;
  badge.className = `call-badge ${phase === "live" ? "live" : phase === "ended" ? "ended" : "ringing"}`;
  badge.textContent = phase === "live" ? "Live" : phase === "ended" ? "Call ended" : "Ringing";
  win.whoEl.textContent =
    phase === "live" ? `On the line with ${name}` : phase === "ended" ? "Ellio hung up" : "Ellio is calling from Merritt Bank";
  win.stateEl.textContent = phase === "live" ? "Connected" : phase === "ended" ? "Finished" : "Dialing";
}

function buildActions() {
  const win = makeWindow("actions", "Ellio's decision");
  const body = el("div", "win-body");
  const decision = el("p", "decision");
  const note = el("p", "decision-note");
  const steps = el("ol", "steps");
  body.append(decision, note, steps);
  win.append(body);
  Object.assign(win, { decisionEl: decision, noteEl: note, stepsEl: steps, stepNodes: [] });
  return win;
}

function buildReport(c) {
  const win = makeWindow("report", "Case report");
  const body = el("div", "win-body report");
  const left = el("div");
  left.append(el("h3", null, "What happened"), el("p", null, c.summary));
  const right = el("div");
  right.append(el("h3", null, "Evidence"));
  if (c.redFlags.length) {
    const list = el("ul", "evidence");
    for (const f of c.redFlags) {
      const li = el("li", null, f.flag);
      if (f.quote) li.append(el("q", null, f.quote));
      list.append(li);
    }
    right.append(list);
  } else {
    right.append(el("p", null, c.status === "approved" ? "The customer confirmed the purchase." : "No warning signs were logged."));
  }
  body.append(left, right);
  win.append(body);
  win.stateEl.textContent = c.status === "escalated" ? "Escalated" : c.status === "approved" ? "Approved" : "Closed";
  return win;
}

// ---------- the case view ----------
function newView(c, animate) {
  if (view) view.gen = -1;
  windowsEl.replaceChildren();
  cursorEl.classList.remove("is-visible");
  view = {
    caseId: c ? c._id : null,
    gen: Math.random(),
    queue: null,
    wins: {},
    reasons: 0,
    lines: 0,
    flags: 0,
    actions: 0,
    decided: false,
    reported: false,
  };
  view.queue = makeQueue(animate);
  if (!c) {
    desktopEl.classList.remove("has-case");
    narrate("Ellio is waiting for a flagged purchase.", false);
  }
}

function flagHome(win, flag) {
  // Attach a warning sign under the customer line it came from.
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const q = norm(flag.quote);
  let host = null;
  for (const m of win.messages) {
    if (m.role !== "customer") continue;
    const t = norm(m.text);
    if (q && q.length >= 6 && (t.includes(q) || q.includes(t))) host = m;
  }
  if (!host) {
    for (const m of win.messages) if (m.role === "customer" && m.at <= flag.at) host = m;
  }
  if (host) return host.flagsEl;
  if (!win.orphanFlags) {
    win.orphanFlags = el("div", "flags");
    win.logEl.append(win.orphanFlags);
  }
  return win.orphanFlags;
}

function sync(c) {
  const q = view.queue;
  const startCount = q.count;
  const name = firstName(c.transaction.customer);
  const decided = c.status === "approved" || c.status === "escalated";

  // 1. Review the purchase.
  if (!view.wins.review) {
    const win = buildReview(c);
    view.wins.review = win;
    q.add(async () => {
      narrate(`Reviewing a ${money(c.transaction.amount)} purchase`);
      await openWindow(win, q.animate);
    });
  }
  for (; view.reasons < c.riskReasons.length; view.reasons++) {
    const reason = c.riskReasons[view.reasons];
    q.add(async () => {
      const li = el("li", null, reason);
      view.wins.review.reasonsEl.append(li);
      await moveCursorTo(li, 14, 14);
      await pause(380);
    });
  }

  // 2. Call the customer.
  if (!view.wins.call) {
    const win = buildCall(c);
    view.wins.call = win;
    q.add(async () => {
      narrate(`Calling ${name}`);
      await openWindow(win, q.animate);
      await pause(500);
    });
  }
  const phase = decided || c.summary ? "ended" : c.transcript.length ? "live" : "ringing";
  q.add(async () => setCallPhase(view.wins.call, phase, name), true);

  // 3. The conversation, as it happens.
  for (; view.lines < c.transcript.length; view.lines++) {
    const line = c.transcript[view.lines];
    q.add(async () => {
      const win = view.wins.call;
      setActive(win);
      win.emptyEl.remove();
      const role = speaker(line.role);
      const msg = el("div", `msg ${role}${q.animate ? " is-new" : ""}`);
      msg.append(el("span", "who", role === "ellio" ? "Ellio" : name), el("p", null, line.text));
      const flags = el("div", "flags");
      const time = el("time", null, clock(line.at));
      msg.append(flags, time);
      win.logEl.insertBefore(msg, win.orphanFlags || null);
      win.messages.push({ role, text: line.text, at: line.at, flagsEl: flags });
      win.logEl.scrollTop = win.logEl.scrollHeight;
      narrate(role === "ellio" ? `Talking with ${name}` : `Listening to ${name}`);
      if (q.animate) await moveCursorTo(msg.querySelector("p"), 30, 14);
    });
  }

  // 4. Warning signs, pinned to what was said.
  for (; view.flags < c.redFlags.length; view.flags++) {
    const flag = c.redFlags[view.flags];
    q.add(async () => {
      const win = view.wins.call;
      const tag = el("span", `flag${q.animate ? " is-new" : ""}`, flag.flag);
      flagHome(win, flag).append(tag);
      win.logEl.scrollTop = win.logEl.scrollHeight;
      narrate(`Logging a warning sign: ${flag.flag.toLowerCase()}`);
      if (q.animate) {
        await moveCursorTo(tag, 16, 10);
        await clickCursor();
        await pause(300);
      }
    });
  }

  // 5. Decide and act.
  if (decided && !view.decided) {
    view.decided = true;
    const win = buildActions();
    view.wins.actions = win;
    q.add(async () => {
      narrate(c.status === "escalated" ? "Escalating to fraud" : "Approving the purchase");
      const esc = c.status === "escalated";
      win.decisionEl.className = `decision ${c.status}`;
      win.decisionEl.textContent = esc ? "Escalated: likely fraud" : "Approved: the customer made this purchase";
      win.noteEl.textContent = esc
        ? `${name} didn't recognise this purchase, so Ellio stopped it.`
        : `${name} confirmed it on the call. Nothing else to do.`;
      win.stateEl.textContent = esc ? "Escalated" : "Approved";
      await openWindow(win, q.animate);
    });
  }
  if (view.decided) {
    for (; view.actions < c.actions.length; view.actions++) {
      const action = c.actions[view.actions];
      q.add(async () => {
        const win = view.wins.actions;
        const done = action.replace(/^Approved:\s*/i, "Purchase approved: ");
        const step = el("li", "step is-working");
        const tick = el("span", "tick");
        tick.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
        const label = el("span", null, verbFor(action));
        step.append(tick, label);
        win.stepsEl.append(step);
        setActive(win);
        narrate(verbFor(action));
        if (q.animate) {
          await moveCursorTo(step, 20, 18);
          await clickCursor();
          await pause(650);
        }
        step.className = "step is-done";
        label.textContent = done;
      });
    }
  }

  // 6. Write it up when the call wraps.
  if (c.summary && !view.reported) {
    view.reported = true;
    q.add(async () => {
      narrate("Writing the case report");
      const win = buildReport(c);
      view.wins.report = win;
      await openWindow(win, q.animate);
      win.scrollIntoView({ behavior: q.animate && !reduceMotion ? "smooth" : "auto", block: "nearest" });
    });
  }

  // Idle line once the queue drains (only after new work was queued).
  if (q.count === startCount) return;
  q.add(async () => {
    if (c.summary || (decided && phase === "ended")) {
      narrate(
        c.status === "escalated"
          ? `Case closed. ${name}'s card is safe.`
          : c.status === "approved"
            ? `Case closed. ${name}'s purchase went through.`
            : "Case closed.",
        false,
      );
      await pause(1200);
      cursorEl.classList.remove("is-visible");
    } else if (phase === "live") {
      narrate(`On the call with ${name}`);
    } else if (phase === "ringing") {
      narrate(`Calling ${name}`);
    }
  }, true);
}

// ---------- queue sidebar ----------
function renderQueue() {
  queueEl.replaceChildren();
  queueEmptyEl.hidden = cases.length > 0;
  const shown = view && view.caseId;
  for (const c of cases) {
    const li = el("li");
    const b = el("button", "queue-item");
    b.type = "button";
    b.setAttribute("aria-current", String(c._id === shown));
    b.append(
      el("span", "q-item", c.transaction.item),
      el("span", `pill pill-${c.status}`, c.status === "calling" ? "On call" : c.status[0].toUpperCase() + c.status.slice(1)),
      el("span", "q-who", c.transaction.customer),
      el("span", "q-amount", money(c.transaction.amount)),
    );
    b.addEventListener("click", () => {
      selectedId = c === cases[0] ? null : c._id;
      update();
    });
    li.append(b);
    queueEl.append(li);
  }
}

function update() {
  const target = (selectedId && cases.find((c) => c._id === selectedId)) || cases[0] || null;
  if (!target) {
    if (!view || view.caseId !== null) newView(null, false);
  } else if (!view || view.caseId !== target._id) {
    const fresh = Date.now() - target.transaction.createdAt < LIVE_WINDOW_MS;
    newView(target, fresh);
    sync(target);
  } else {
    sync(target);
  }
  renderQueue();
  simTargetEl.textContent = cases[0]
    ? `Acts on the newest case: ${cases[0].transaction.item}, ${money(cases[0].transaction.amount)}.`
    : "No case yet.";
  for (const b of toolButtons) b.disabled = busy || cases.length === 0;
}

// ---------- demo controls (no phone call needed) ----------
const demoLines = [
  { role: "Ellio", text: "Hi Dolores, this is Ellio from Merritt Bank. Did you just buy a TV from BestBye?" },
  { role: "Customer", text: "A TV? No, I didn't order anything. I live in Hobbs." },
  { role: "Ellio", text: "Thank you for telling me. I'm going to stop that charge and keep your card safe." },
];
let demoStep = 0;

async function postTool(path, body) {
  const res = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "That didn't go through. Check the Convex logs.");
  return payload;
}

async function simulate(tool) {
  const c = cases[0];
  if (!c || busy) return;
  busy = true;
  update();
  try {
    if (tool === "approve") {
      await postTool("/tools/approve", { case_id: c._id, reason: "Customer confirmed the purchase" });
      simStatusEl.textContent = "Approved the newest case.";
    } else if (tool === "escalate") {
      await postTool("/tools/escalate", { case_id: c._id, reason: "Customer did not recognise the charge" });
      simStatusEl.textContent = "Escalated the newest case.";
    } else if (tool === "red-flag") {
      await postTool("/tools/red-flag", {
        case_id: c._id,
        flag: "Didn't recognise the purchase",
        quote: "I didn't order anything",
      });
      simStatusEl.textContent = "Added a warning sign.";
    } else if (tool === "transcript") {
      const line = demoLines[demoStep % demoLines.length];
      demoStep++;
      await postTool("/tools/transcript", { case_id: c._id, role: line.role, text: line.text });
      simStatusEl.textContent = "Added a transcript line.";
    }
  } catch (e) {
    simStatusEl.textContent = e.message;
  } finally {
    busy = false;
    update();
  }
}
for (const b of toolButtons) b.addEventListener("click", () => simulate(b.dataset.tool));

toggleControlsBtn.addEventListener("click", () => {
  controlsEl.hidden = !controlsEl.hidden;
  toggleControlsBtn.setAttribute("aria-expanded", String(!controlsEl.hidden));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "d" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault();
    toggleControlsBtn.click();
  }
});

resetBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear every case and purchase in this demo?")) return;
  if (!client) return;
  resetBtn.disabled = true;
  try {
    await client.mutation(convex.anyApi.cases.reset, {});
    demoStep = 0;
    selectedId = null;
    simStatusEl.textContent = "Demo cleared.";
  } catch (e) {
    simStatusEl.textContent = e.message;
  } finally {
    resetBtn.disabled = false;
  }
});

// ---------- live data ----------
if (!convexUrl || !window.convex) {
  connEl.textContent = "Offline";
  narrate("Can't reach the bank backend. Check config.js.", false);
} else {
  client = new convex.ConvexClient(convexUrl);
  client.subscribeToConnectionState((s) => {
    connEl.textContent = s.isWebSocketConnected ? "Live" : "Reconnecting";
    connEl.classList.toggle("is-on", s.isWebSocketConnected);
  });
  client.onUpdate(
    convex.anyApi.cases.list,
    {},
    (rows) => {
      cases = rows;
      update();
    },
    (err) => {
      connEl.textContent = "Offline";
      simStatusEl.textContent = err.message;
    },
  );
}
update();
