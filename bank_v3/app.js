// Merritt Bank staff portal: Fraud & risk, with the Ellio module.
// Each case is a folder: it arrives, opens, its papers come out, Ellio analyses
// them, calls the cardholder, stamps a decision and files a memo. All data is
// live from Convex (cases:list); only the demo controls are scripted.

const convexUrl = window.CONVEX_URL;
const siteUrl = (window.CONVEX_SITE_URL || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);

const views = { overview: $("view-overview"), ellio: $("view-ellio") };
const deskEl = $("desk");
const slotEl = $("folder-slot");
const cursorEl = $("cursor");
const activityEl = $("activity");
const sayEl = $("critter-say");
const inboxEl = $("inbox");
const inboxEmptyEl = $("inbox-empty");
const kpisEl = $("kpis");
const alertsEl = $("alerts");
const alertsEmptyEl = $("alerts-empty");
const countEl = $("ellio-count");
const toastEl = $("toast");
const connEl = $("conn");
const controlsEl = $("controls");
const toggleControlsBtn = $("toggle-controls");
const resetBtn = $("reset");
const simTargetEl = $("sim-target");
const simStatusEl = $("sim-status");
const toolButtons = document.querySelectorAll("[data-tool]");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIVE_WINDOW_MS = 20000; // cases newer than this play their animation

let client = null;
let cases = [];
let currentView = "overview";
let selectedId = null; // null = follow the newest case
let busy = false;
let view = null;
let knownIds = null; // ids seen so far, to spot brand-new cases
let activityTimer = null;

// ---------- helpers ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
const money = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const clock = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const caseNo = (c) => `Case ${String(c._id).slice(-4).toUpperCase()}`;
const firstName = (n) => String(n || "the cardholder").split(" ")[0];
const speaker = (role) =>
  ["customer", "user", "human", "callee"].includes(String(role || "").trim().toLowerCase()) ? "customer" : "ellio";
const statusLabel = (s) => ({ calling: "On call", pending: "Pending", approved: "Approved", escalated: "Escalated" })[s] || s;

const ACTION_VERBS = {
  "card frozen": "Freezing the card",
  "dispute filed": "Filing a dispute",
  "family notified": "Notifying the family contact",
};
const verbFor = (a) => ACTION_VERBS[String(a).toLowerCase()] || "Approving the purchase";

// Ellio's mood drives the critter's face and the header chip mirrors its speech.
function setMood(mood) {
  cursorEl.className = cursorEl.className.replace(/\bmood-\S+/g, "").trim() + ` mood-${mood}`;
}
function setActivity(text, { linger = false, mood } = {}) {
  clearTimeout(activityTimer);
  sayEl.textContent = text;
  sayEl.classList.remove("is-new");
  void sayEl.offsetWidth;
  sayEl.classList.add("is-new");
  if (mood) setMood(mood);
  if (linger) activityTimer = setTimeout(() => (sayEl.textContent = ""), 4000);
}
function restCritter() {
  // Sleeps in the corner of an empty desk.
  setMood("rest");
  sayEl.textContent = "";
  cursorEl.style.setProperty("--cx", "calc(100% - 0px)");
  const w = deskEl.clientWidth;
  cursorEl.style.setProperty("--cx", `${Math.max(16, w - 90)}px`);
  cursorEl.style.setProperty("--cy", `24px`);
}

// ---------- views ----------
function showView(name) {
  currentView = name;
  for (const [k, node] of Object.entries(views)) node.hidden = k !== name;
  for (const b of document.querySelectorAll(".subnav-item[data-view]")) {
    b.classList.toggle("is-current", b.dataset.view === name);
  }
}
for (const b of document.querySelectorAll("[data-view]")) {
  b.addEventListener("click", () => showView(b.dataset.view));
}

function toast(c) {
  toastEl.replaceChildren();
  const text = el("div");
  text.append(
    el("strong", null, `${money(c.transaction.amount)} flagged for ${c.transaction.customer}`),
    el("span", null, "Ellio picked up the case"),
  );
  const open = el("button", null, "Open case");
  open.type = "button";
  open.addEventListener("click", () => {
    toastEl.hidden = true;
    showView("ellio");
  });
  toastEl.append(text, open);
  toastEl.hidden = false;
  setTimeout(() => (toastEl.hidden = true), 6000);
}

// ---------- animation queue ----------
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
        try { await task(); } catch (e) { console.error(e); }
      });
      return chain;
    },
  };
}
const animating = () => Boolean(view && view.queue.animate && !reduceMotion && currentView === "ellio");
const pause = (ms) => (animating() ? sleep(ms) : Promise.resolve());

// ---------- cursor ----------
function moveCursorTo(target, dx = 0, dy = 0) {
  // Ellio stands just beside what it's working on, never on top of it.
  if (!target) return Promise.resolve();
  const d = deskEl.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const size = 76;
  const bubble = 240;
  let x = r.right - d.left + deskEl.scrollLeft + 8;
  if (x + size + bubble > deskEl.clientWidth + deskEl.scrollLeft) {
    x = r.left - d.left + deskEl.scrollLeft - size - 4;
    cursorEl.classList.add("say-left");
  } else {
    cursorEl.classList.remove("say-left");
  }
  x = Math.max(4, x);
  const y = r.top - d.top + deskEl.scrollTop + Math.min(r.height / 2, 40) - size / 2 + dy;
  cursorEl.style.setProperty("--cx", `${x + dx}px`);
  cursorEl.style.setProperty("--cy", `${Math.max(4, y)}px`);
  cursorEl.classList.add("is-visible");
  return animating() ? sleep(750) : Promise.resolve();
}
async function clickCursor() {
  if (!animating()) return;
  cursorEl.classList.remove("is-clicking");
  void cursorEl.offsetWidth;
  cursorEl.classList.add("is-clicking");
  await sleep(260);
}
function focusSheet(sheet) {
  for (const s of slotEl.querySelectorAll(".sheet")) s.classList.toggle("is-active", s === sheet);
}

// ---------- folder + sheets ----------
function buildFolder(c) {
  const folder = el("article", "folder");
  folder.setAttribute("aria-label", caseNo(c));
  const tab = el("div", "folder-tab", caseNo(c));
  const head = el("div", "folder-head");
  head.append(el("h2", null, c.transaction.customer), el("p", null, `Opened at ${clock(c.transaction.createdAt)}`));
  const sheets = el("div", "sheets");
  const cover = el("div", "folder-cover", caseNo(c));
  folder.append(tab, head, sheets, cover);
  Object.assign(folder, { sheetsEl: sheets, coverEl: cover });
  return folder;
}

function sheet(kind, title, meta) {
  const s = el("section", `sheet s-${kind}`);
  s.setAttribute("aria-label", title);
  const head = el("div", "sheet-head");
  const metaEl = el("span", null, meta || "");
  head.append(el("h3", null, title), metaEl);
  s.append(head);
  s.metaEl = metaEl;
  return s;
}
async function placeSheet(s) {
  if (animating()) {
    s.classList.add("is-out");
    s.addEventListener("animationend", () => s.classList.remove("is-out"), { once: true });
  }
  view.folder.sheetsEl.append(s);
  focusSheet(s);
  await moveCursorTo(s.querySelector(".sheet-head"), 60, 14);
  await clickCursor();
}

function buildSlip(c) {
  const s = sheet("slip", "Card transaction", c.transaction.merchant);
  const body = el("div", "sheet-body");
  body.append(el("p", "slip-amount", money(c.transaction.amount)), el("p", "slip-item", c.transaction.item));
  const facts = el("dl", "slip-facts");
  for (const [k, v] of [
    ["Cardholder", c.transaction.customer],
    ["Ships to", c.transaction.location],
    ["Time", clock(c.transaction.createdAt)],
  ]) facts.append(el("dt", null, k), el("dd", null, v));
  const findings = el("ul", "findings");
  findings.setAttribute("aria-label", "Why it was flagged");
  body.append(facts, findings);
  s.append(body);
  s.findingsEl = findings;
  return s;
}

function buildCall(c) {
  const name = firstName(c.transaction.customer);
  const s = sheet("call", "Call record", "Phone");
  const line = el("div", "call-line");
  const who = el("div", "call-who");
  const sub = el("span", null, "Ellio is calling");
  who.append(el("strong", null, c.transaction.customer), sub);
  const badge = el("span", "call-badge ringing", "Ringing");
  line.append(el("div", "ring", name.slice(0, 1)), who, badge);
  const log = el("div", "log");
  log.setAttribute("aria-live", "polite");
  const empty = el("p", "log-empty", "Waiting for the call to connect.");
  log.append(empty);
  s.append(line, log);
  Object.assign(s, { badgeEl: badge, subEl: sub, logEl: log, emptyEl: empty, messages: [], orphanFlags: null });
  s.dataset.phase = "ringing";
  return s;
}
function setPhase(s, phase, name) {
  if (!s || s.dataset.phase === phase) return;
  s.dataset.phase = phase;
  s.badgeEl.className = `call-badge ${phase}`;
  s.badgeEl.textContent = { ringing: "Ringing", live: "Live", ended: "Call ended" }[phase];
  s.subEl.textContent = { ringing: "Ellio is calling", live: `On the line with ${name}`, ended: "Ellio hung up" }[phase];
  s.metaEl.textContent = { ringing: "Dialing", live: "Connected", ended: "Finished" }[phase];
}

function buildDecision(c) {
  const name = firstName(c.transaction.customer);
  const esc = c.status === "escalated";
  const s = sheet("decision", "Decision", "");
  const body = el("div", "sheet-body");
  const verdict = el("p", `verdict ${c.status}`, esc ? "Stopped: likely fraud" : "Cleared: the cardholder made this purchase");
  const note = el(
    "p",
    "verdict-note",
    esc ? `${name} didn't recognise this purchase, so Ellio stopped it and protected the card.` : `${name} confirmed it on the call. No action needed.`,
  );
  const steps = el("ol", "steps");
  body.append(verdict, note, steps);
  s.append(body);
  s.stepsEl = steps;
  return s;
}
function stampSheet(s, status) {
  const stamp = el("div", `stamp ${status}${animating() ? " is-new" : ""}`, status === "escalated" ? "Escalated" : "Approved");
  s.append(stamp);
  if (animating()) s.classList.add("is-thumped");
}

function buildMemo(c) {
  const s = sheet("memo", "Case memo", `Filed by Ellio at ${clock(Date.now())}`);
  const body = el("div", "sheet-body memo");
  const left = el("div");
  left.append(el("h4", null, "What happened"), el("p", null, c.summary));
  const right = el("div");
  right.append(el("h4", null, "Evidence"));
  if (c.redFlags.length) {
    const list = el("ul", "evidence");
    for (const f of c.redFlags) {
      const li = el("li", null, f.flag);
      if (f.quote) li.append(el("q", null, f.quote));
      list.append(li);
    }
    right.append(list);
  } else {
    right.append(el("p", null, c.status === "approved" ? "The cardholder confirmed the purchase on the call." : "No warning signs were logged."));
  }
  body.append(left, right);
  s.append(body);
  return s;
}

function flagHome(s, flag) {
  const norm = (x) => String(x || "").replace(/\s+/g, " ").trim().toLowerCase();
  const q = norm(flag.quote);
  let host = null;
  for (const m of s.messages) {
    if (m.role !== "customer") continue;
    const t = norm(m.text);
    if (q && q.length >= 6 && (t.includes(q) || q.includes(t))) host = m;
  }
  if (!host) for (const m of s.messages) if (m.role === "customer" && m.at <= flag.at) host = m;
  if (host) return host.flagsEl;
  if (!s.orphanFlags) {
    s.orphanFlags = el("div", "flags");
    s.logEl.append(s.orphanFlags);
  }
  return s.orphanFlags;
}

// ---------- one case on the desk ----------
function newView(c, animate) {
  if (view) view.gen = -1;
  slotEl.replaceChildren();
  view = {
    caseId: c ? c._id : null,
    gen: Math.random(),
    queue: makeQueue(animate),
    folder: null,
    sheets: {},
    findings: 0,
    lines: 0,
    flags: 0,
    actions: 0,
    decided: false,
    memo: false,
  };
  deskEl.classList.toggle("has-case", Boolean(c));
  cursorEl.classList.add("is-visible");
  if (!c) {
    activityEl.hidden = true;
    restCritter();
  } else if (!animate) {
    setMood("happy");
    sayEl.textContent = "";
  }
}

function sync(c) {
  const q = view.queue;
  const start = q.count;
  const name = firstName(c.transaction.customer);
  const decided = c.status === "approved" || c.status === "escalated";
  const phase = decided || c.summary ? "ended" : c.transcript.length ? "live" : "ringing";

  // 1. The folder arrives and opens.
  if (!view.folder) {
    const folder = buildFolder(c);
    view.folder = folder;
    q.add(async () => {
      setActivity(`New case! Opening ${caseNo(c).toLowerCase()}`, { mood: "focus" });
      if (animating()) folder.classList.add("is-arriving");
      slotEl.append(folder);
      await pause(450);
      await moveCursorTo(folder.coverEl, folder.coverEl.offsetWidth / 2, 60);
      await clickCursor();
      if (animating()) {
        folder.coverEl.classList.add("is-opening");
        await sleep(650);
      }
      folder.coverEl.remove();
    });
  }

  // 2. Analyse the transaction.
  if (!view.sheets.slip) {
    const s = buildSlip(c);
    view.sheets.slip = s;
    q.add(async () => {
      setActivity("Let me look at this purchase", { mood: "think" });
      await placeSheet(s);
    });
  }
  for (; view.findings < c.riskReasons.length; view.findings++) {
    const reason = c.riskReasons[view.findings];
    q.add(async () => {
      const li = el("li", animating() ? "is-new" : null);
      li.append(el("mark", null, reason));
      view.sheets.slip.findingsEl.append(li);
      await moveCursorTo(li.querySelector("mark"));
      await pause(500);
    });
  }

  // 3. Call the cardholder.
  if (!view.sheets.call) {
    const s = buildCall(c);
    view.sheets.call = s;
    q.add(async () => {
      setActivity(`Calling ${name}`, { mood: "focus" });
      await placeSheet(s);
    });
  }
  q.add(async () => setPhase(view.sheets.call, phase, name), true);

  for (; view.lines < c.transcript.length; view.lines++) {
    const line = c.transcript[view.lines];
    q.add(async () => {
      const s = view.sheets.call;
      focusSheet(s);
      s.emptyEl.remove();
      const role = speaker(line.role);
      const msg = el("div", `msg ${role}${animating() ? " is-new" : ""}`);
      const flags = el("div", "flags");
      msg.append(el("span", "who", role === "ellio" ? "Ellio" : name), el("p", null, line.text), flags, el("time", null, clock(line.at)));
      s.logEl.insertBefore(msg, s.orphanFlags || null);
      s.messages.push({ role, text: line.text, at: line.at, flagsEl: flags });
      s.logEl.scrollTop = s.logEl.scrollHeight;
      setActivity(role === "ellio" ? `Talking with ${name}` : `Listening to ${name}`, { mood: role === "ellio" ? "talk" : "listen" });
      await moveCursorTo(msg.querySelector("p"), 30, 14);
    });
  }

  for (; view.flags < c.redFlags.length; view.flags++) {
    const flag = c.redFlags[view.flags];
    q.add(async () => {
      const s = view.sheets.call;
      const tag = el("span", `flag${animating() ? " is-new" : ""}`, flag.flag);
      flagHome(s, flag).append(tag);
      s.logEl.scrollTop = s.logEl.scrollHeight;
      setActivity(`Uh oh. ${flag.flag}`, { mood: "alarm" });
      await moveCursorTo(tag, 16, 10);
      await clickCursor();
      await pause(300);
    });
  }

  // 4. Decide, stamp, act.
  if (decided && !view.decided) {
    view.decided = true;
    const s = buildDecision(c);
    view.sheets.decision = s;
    q.add(async () => {
      setActivity(c.status === "escalated" ? "Stopping this purchase" : "All good, clearing it", { mood: c.status === "escalated" ? "focus" : "happy" });
      await placeSheet(s);
      await pause(200);
      stampSheet(s, c.status);
      await pause(600);
    });
  }
  if (view.decided) {
    for (; view.actions < c.actions.length; view.actions++) {
      const action = c.actions[view.actions];
      q.add(async () => {
        const s = view.sheets.decision;
        const done = action.replace(/^Approved:\s*/i, "Purchase approved: ");
        const step = el("li", "step is-working");
        const tick = el("span", "tick");
        tick.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
        const label = el("span", null, verbFor(action));
        step.append(tick, label);
        s.stepsEl.append(step);
        focusSheet(s);
        setActivity(verbFor(action), { mood: "focus" });
        await moveCursorTo(label);
        await clickCursor();
        await pause(650);
        step.className = "step is-done";
        label.textContent = done;
      });
    }
  }

  // 5. File the memo once the call wraps.
  if (c.summary && !view.memo) {
    view.memo = true;
    q.add(async () => {
      setActivity("Writing up the case memo", { mood: "think" });
      const s = buildMemo(c);
      view.sheets.memo = s;
      await placeSheet(s);
      s.scrollIntoView({ behavior: animating() ? "smooth" : "auto", block: "nearest" });
    });
  }

  if (q.count === start) return;
  q.add(async () => {
    if (c.summary || (decided && phase === "ended")) {
      setActivity(c.status === "escalated" ? `Done. ${name}'s card is safe.` : `Done. ${name}'s purchase went through.`, { linger: true, mood: "happy" });
      await pause(1400);
    } else if (phase === "live") {
      setActivity(`On the call with ${name}`, { mood: "listen" });
    } else if (phase === "ringing") {
      setActivity(`Calling ${name}`, { mood: "focus" });
    }
  }, true);
}

// ---------- lists ----------
function renderInbox() {
  inboxEl.replaceChildren();
  inboxEmptyEl.hidden = cases.length > 0;
  const shown = view && view.caseId;
  for (const c of cases) {
    const li = el("li");
    const b = el("button", `inbox-item${c._isNew ? " is-arriving" : ""}`);
    b.type = "button";
    b.setAttribute("aria-current", String(c._id === shown));
    const top = el("span", "i-top");
    top.append(el("span", "i-case", caseNo(c)), el("span", `pill pill-${c.status}`, statusLabel(c.status)));
    b.append(top, el("span", "i-line", `${c.transaction.customer}, ${money(c.transaction.amount)}`), el("span", "i-line", c.transaction.item));
    b.addEventListener("click", () => openCase(c._id));
    li.append(b);
    inboxEl.append(li);
  }
}

function renderOverview() {
  const n = (s) => cases.filter((c) => c.status === s).length;
  kpisEl.replaceChildren();
  for (const [value, label] of [
    [cases.length, "Purchases flagged"],
    [n("calling") + n("pending"), "Being handled by Ellio"],
    [n("escalated"), "Stopped as fraud"],
    [n("approved"), "Cleared by the cardholder"],
  ]) {
    const k = el("div", "kpi");
    k.append(el("strong", null, String(value)), el("span", null, label));
    kpisEl.append(k);
  }
  alertsEl.replaceChildren();
  alertsEmptyEl.hidden = cases.length > 0;
  for (const c of cases.slice(0, 12)) {
    const tr = el("tr");
    const status = el("td");
    status.append(el("span", `pill pill-${c.status}`, statusLabel(c.status)));
    tr.append(el("td", null, caseNo(c)), el("td", null, c.transaction.customer), el("td", null, c.transaction.item), el("td", null, money(c.transaction.amount)), status);
    tr.tabIndex = 0;
    tr.addEventListener("click", () => openCase(c._id));
    tr.addEventListener("keydown", (e) => e.key === "Enter" && openCase(c._id));
    alertsEl.append(tr);
  }
  const live = n("calling") + n("pending");
  countEl.hidden = live === 0;
  countEl.textContent = String(live);
}

function openCase(id) {
  selectedId = cases[0] && cases[0]._id === id ? null : id;
  showView("ellio");
  update();
}

function update() {
  const target = (selectedId && cases.find((c) => c._id === selectedId)) || cases[0] || null;
  if (!target) {
    if (!view || view.caseId !== null) newView(null, false);
  } else if (!view || view.caseId !== target._id) {
    newView(target, Date.now() - target.transaction.createdAt < LIVE_WINDOW_MS);
    sync(target);
  } else {
    sync(target);
  }
  renderInbox();
  renderOverview();
  simTargetEl.textContent = cases[0] ? `Acts on the newest case: ${caseNo(cases[0])}, ${money(cases[0].transaction.amount)}.` : "No case yet.";
  for (const b of toolButtons) b.disabled = busy || cases.length === 0;
}

// ---------- demo controls ----------
const demoLines = [
  { role: "Ellio", text: "Hi Dolores, this is Ellio from Merritt Bank. Did you just buy a TV from BestBye?" },
  { role: "Customer", text: "A TV? No, I didn't order anything. I live in Hobbs." },
  { role: "Ellio", text: "Thank you for telling me. I'm going to stop that charge and keep your card safe." },
];
let demoStep = 0;

async function postTool(path, body) {
  const res = await fetch(`${siteUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
      await postTool("/tools/red-flag", { case_id: c._id, flag: "Didn't recognise the purchase", quote: "I didn't order anything" });
      simStatusEl.textContent = "Added a warning sign.";
    } else if (tool === "transcript") {
      const line = demoLines[demoStep % demoLines.length];
      demoStep++;
      await postTool("/tools/transcript", { case_id: c._id, role: line.role, text: line.text });
      simStatusEl.textContent = "Added a call line.";
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
  if (e.key.toLowerCase() === "d" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault();
    toggleControlsBtn.click();
  }
});
resetBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear every case and purchase in this demo?") || !client) return;
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
showView("overview");
if (!convexUrl || !window.convex) {
  connEl.textContent = "Offline";
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
      const firstLoad = knownIds === null;
      const ids = new Set(rows.map((r) => r._id));
      for (const r of rows) r._isNew = !firstLoad && !knownIds.has(r._id);
      const arrived = rows.find((r) => r._isNew && Date.now() - r.transaction.createdAt < LIVE_WINDOW_MS);
      knownIds = ids;
      cases = rows;
      if (arrived) {
        selectedId = null;
        toast(arrived);
        // Take the manager straight to the case so the demo flows on its own.
        if (currentView !== "ellio") showView("ellio");
      }
      update();
    },
    (err) => {
      connEl.textContent = "Offline";
      simStatusEl.textContent = err.message;
    },
  );
}
update();
