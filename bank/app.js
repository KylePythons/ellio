// Merritt Bank staff portal: Fraud & risk, with the Ellio module.
// Each case is a folder: it arrives, opens, its papers come out, Ellio analyses
// them, calls the cardholder, stamps a decision and files a memo. All data is
// live from Convex (cases:list); only the demo controls are scripted.

const convexUrl = window.CONVEX_URL;
const siteUrl = (window.CONVEX_SITE_URL || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);

const views = { overview: $("view-overview"), ellio: $("view-ellio"), accounts: $("view-accounts"), riskcheck: $("view-riskcheck") };
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
let holdUntil = 0; // while > now, the desk waits so the escalation plays on the main page
let feedSeen = null;

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
const isDolores = (n) => firstName(n).toLowerCase() === "dolores";
const PORTRAIT = "../assets/dolores.jpg";
function portrait(className) {
  const img = document.createElement("img");
  img.className = className || "portrait";
  img.src = PORTRAIT;
  img.alt = "";
  return img;
}
const speaker = (role) =>
  ["customer", "user", "human", "callee"].includes(String(role || "").trim().toLowerCase()) ? "customer" : "ellio";
const statusLabel = (s) => ({ calling: "On call", pending: "Pending", approved: "Approved", escalated: "Escalated", ended: "Call ended" })[s] || s;
// A call is over when Cartesia says so, or when nothing has happened on it for a minute (hung up).
const STALE_MS = 60000;
const isDecided = (c) => c.status === "approved" || c.status === "escalated";
const callOver = (c) => Boolean(c.endedAt) || (!isDecided(c) && Date.now() - c.updatedAt > STALE_MS);
const shownStatus = (c) => (!isDecided(c) && callOver(c) ? "ended" : c.status);

const ACTION_VERBS = {
  "card frozen": "Freezing the card",
  "dispute filed": "Filing a dispute",
  "family notified": "Notifying the family contact",
  "purchase paused": "Pausing the purchase",
  "gift cards not sent": "Holding the gift cards",
};
const verbFor = (a) => ACTION_VERBS[String(a).toLowerCase()] || "Approving the purchase";

// SAMPLE DATA: the cardholder's recent card history Ellio reviews (fictional).
const HOME_CITY = "Hobbs, NM";
const DEMO_HISTORY = [
  { what: "Pharmacy", amount: 23.4 },
  { what: "Grocery store", amount: 61.15 },
  { what: "Diner", amount: 18.75 },
  { what: "Electric bill", amount: 94.0 },
];

const STEPS = [
  ["review", "Review"],
  ["call", "Call"],
  ["listen", "Listen"],
  ["decide", "Decide"],
  ["act", "Act"],
];
function setStep(key) {
  const tr = view && view.folder && view.folder.trackerEl;
  if (!tr) return;
  const idx = key === "done" ? STEPS.length : STEPS.findIndex(([k]) => k === key);
  if (idx < 0 || idx < (view.stepIdx ?? -1)) return;
  view.stepIdx = idx;
  [...tr.children].forEach((li, i) => {
    li.className = i < idx ? "is-done" : i === idx ? "is-current" : "";
  });
}
const thoughtFromReason = (r) => String(r || "").replace(/^possible scam:\s*/i, "").trim();

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
function bindPanel(button, collapsedClass, target, storageKey) {
  const apply = (open) => {
    target.classList.toggle(collapsedClass, !open);
    button.setAttribute("aria-expanded", String(open));
    const label = button.querySelector(".panel-toggle-name");
    button.setAttribute("aria-label", `${open ? "Hide" : "Show"} ${label ? label.textContent : "panel"}`);
    sessionStorage.setItem(storageKey, open ? "1" : "0");
  };
  apply(sessionStorage.getItem(storageKey) === "1");
  button.addEventListener("click", () => apply(button.getAttribute("aria-expanded") !== "true"));
}
bindPanel($("toggle-nav"), "is-nav-collapsed", document.querySelector(".shell"), "merritt-nav-open");
bindPanel($("toggle-cases"), "is-cases-collapsed", document.querySelector(".ellio-body"), "merritt-cases-open");

function showView(name) {
  currentView = name;
  if (window.__walker) window.__walker.hide();
  if (name === "accounts") loadAccounts();
  if (name === "riskcheck" && typeof rcEllioRun === "function") setTimeout(rcEllioRun, 350);
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
    el("strong", null, `New flag · ${c.transaction.customer} · ${money(c.transaction.amount)}`),
    el("span", null, c.transaction.item),
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
// PACE slows every beat so people watching can follow Ellio. 1 = original speed.
const PACE = 1.8;
const pause = (ms) => (animating() ? sleep(ms * PACE) : Promise.resolve());

// ---------- cursor ----------
function moveCursorTo(target, dx = 0, dy = 0) {
  // Ellio stands just beside what it's working on, never on top of it.
  if (!target) return Promise.resolve();
  const d = deskEl.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const size = 86;
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
  if (!animating()) return Promise.resolve();
  cursorEl.classList.add("is-walking");
  return sleep(750).then(() => cursorEl.classList.remove("is-walking"));
}
async function clickCursor() {
  if (!animating()) return;
  cursorEl.classList.remove("is-clicking");
  void cursorEl.offsetWidth;
  cursorEl.classList.add("is-clicking");
  await sleep(260);
}
function focusSheet(sheet) {
  const changed = sheet && !sheet.classList.contains("is-active");
  for (const s of slotEl.querySelectorAll(".sheet")) s.classList.toggle("is-active", s === sheet);
  // Glide the sheet Ellio is working on to the middle of the screen (top, if it's taller than the view).
  if (changed && animating()) {
    const tall = sheet.offsetHeight > deskEl.clientHeight * 0.8;
    sheet.scrollIntoView({ behavior: "smooth", block: tall ? "start" : "center" });
  }
}

// ---------- folder + sheets ----------
function buildFolder(c) {
  const folder = el("article", "folder");
  folder.setAttribute("aria-label", caseNo(c));
  const tab = el("div", "folder-tab", caseNo(c));
  const badge = el("span", "new-badge", "NEW");
  tab.append(badge);
  const head = el("div", "folder-head");
  const tracker = el("ol", "tracker");
  for (const [, label] of STEPS) tracker.append(el("li", null, label));
  const who = el("div", "folder-who");
  if (isDolores(c.transaction.customer)) who.append(portrait());
  who.append(el("h2", null, c.transaction.customer));
  head.append(who, el("p", null, `Opened at ${clock(c.transaction.createdAt)}`), tracker);
  const sheets = el("div", "sheets");
  const cover = el("div", "folder-cover", caseNo(c));
  folder.append(tab, head, sheets, cover);
  Object.assign(folder, { sheetsEl: sheets, coverEl: cover, trackerEl: tracker, badgeEl: badge });
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
  if (typeof c.riskScore === "number") {
    const meter = el("div", "risk");
    const bar = el("div", "risk-bar");
    const fill = el("span");
    fill.style.width = `${c.riskScore}%`;
    bar.append(fill);
    meter.append(el("strong", null, `Risk ${c.riskScore} / 100`), bar, el("small", null, "Ellio calls at 60+"));
    body.append(meter);
  }
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

function buildReview(c) {
  const s = sheet("review", "Ellio's review", "");
  const body = el("div", "sheet-body");
  const hist = el("ul", "history");
  for (const h of DEMO_HISTORY) {
    const li = el("li");
    li.append(el("span", null, h.what), el("span", null, money(h.amount)));
    hist.append(li);
  }
  const checks = el("ul", "checks");
  body.append(el("h4", null, "Last 90 days"), hist, checks);
  s.append(body);
  const avg = DEMO_HISTORY.reduce((a, h) => a + h.amount, 0) / DEMO_HISTORY.length;
  const times = Math.round(c.transaction.amount / avg);
  const home = c.transaction.location === HOME_CITY;
  const gift = /gift\s*card/i.test(c.transaction.item);
  const list = [
    times >= 5
      ? ["warn", `${times}× her usual purchase. She's never bought gift cards.`]
      : ["ok", "In line with her usual spending."],
    home
      ? ["ok", `Bought from home (${HOME_CITY}). The card isn't stolen.`]
      : ["warn", `Shipping to ${c.transaction.location}, not her home.`],
  ];
  if (gift) list.push(["warn", "Gift cards are a common way scammers get paid."]);
  const plan = gift && home
    ? "She likely bought this herself. I'll call to make sure no one is pressuring her."
    : home
      ? "I'll call to confirm she meant to buy this."
      : "This may not be her. I'll call to check.";
  Object.assign(s, { checksEl: checks, checkList: list, plan });
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
  const mark = el("div", "ring", isDolores(c.transaction.customer) ? null : name.slice(0, 1));
  if (isDolores(c.transaction.customer)) mark.append(portrait("portrait"));
  line.append(mark, who, badge);
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
  const scam = esc && c.actions.some((a) => /purchase paused/i.test(a));
  const verdict = el(
    "p",
    `verdict ${c.status}`,
    scam ? "Stopped: likely scam" : esc ? "Stopped: likely fraud" : "Cleared: the cardholder made this purchase",
  );
  const note = el(
    "p",
    "verdict-note",
    scam
      ? `${name} was being pressured into this purchase, so Ellio paused it and told the family.`
      : esc
        ? `${name} didn't recognise this purchase, so Ellio stopped it and protected the card.`
        : `${name} confirmed it on the call. No action needed.`,
  );
  const steps = el("ol", "steps");
  body.append(verdict, note, steps);
  s.append(body);
  s.stepsEl = steps;
  return s;
}
function stampSheet(s, status) {
  const stamp = el("div", `stamp ${status}${animating() ? " is-new" : ""}`, status === "escalated" ? "Stopped" : "Cleared");
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
  const phase = decided || c.summary || callOver(c) ? "ended" : c.transcript.length ? "live" : "ringing";

  // 1. The folder arrives and opens.
  if (!view.folder) {
    const folder = buildFolder(c);
    view.folder = folder;
    q.add(async () => {
      setActivity(`New case! Opening ${caseNo(c).toLowerCase()}`, { mood: "wave" });
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
      folder.badgeEl.remove();
      setStep("review");
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

  // 2b. Review her history before deciding to call.
  if (!view.sheets.review) {
    const s = buildReview(c);
    view.sheets.review = s;
    q.add(async () => {
      setActivity(`Checking ${name}'s history`, { mood: "think" });
      await placeSheet(s);
      for (const [kind, text] of s.checkList) {
        const li = el("li", `check ${kind}${animating() ? " is-new" : ""}`);
        li.append(el("span", "mark", kind === "ok" ? "✓" : "!"), el("span", null, text));
        s.checksEl.append(li);
        await moveCursorTo(li);
        await pause(700);
      }
      const plan = el("p", `thought${animating() ? " is-new" : ""}`, s.plan);
      s.querySelector(".sheet-body").append(plan);
      setActivity(s.plan, { mood: "think" });
      await moveCursorTo(plan);
      await pause(1500);
    });
  }

  // 3. Call the cardholder.
  if (!view.sheets.call) {
    const s = buildCall(c);
    view.sheets.call = s;
    q.add(async () => {
      setStep("call");
      setActivity(`Calling ${name}`, { mood: "focus" });
      await placeSheet(s);
      // Ring the phone now, in sync with the screen.
      if (animating() && client && c.status === "calling" && !c.transcript.length) {
        client.mutation(convex.anyApi.calls.startNow, { caseId: c._id }).catch((err) => console.warn(err));
      }
    });
  }
  q.add(async () => {
    setPhase(view.sheets.call, phase, name);
    if (phase === "ended" && !decided && view.sheets.call && !view.endedNoted) {
      view.endedNoted = true;
      setActivity(`The call ended before ${name} decided`, { mood: "think" });
    }
  }, true);

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
      if (animating()) msg.scrollIntoView({ behavior: "smooth", block: "center" });
      if (role === "customer") setStep("listen");
      setActivity(role === "ellio" ? `Talking with ${name}` : `Listening to ${name}`, { mood: role === "ellio" ? "talk" : "listen" });
      await moveCursorTo(msg.querySelector("p"), 30, 14);
    });
  }

  for (; view.flags < c.redFlags.length; view.flags++) {
    const flag = c.redFlags[view.flags];
    q.add(async () => {
      const s = view.sheets.call;
      const tag = el("span", `flag${animating() ? " is-new" : ""}`, flag.flag);
      const home = flagHome(s, flag);
      home.append(tag);
      if (flag.why) home.append(el("p", `thought${animating() ? " is-new" : ""}`, flag.why));
      s.logEl.scrollTop = s.logEl.scrollHeight;
      if (animating()) tag.scrollIntoView({ behavior: "smooth", block: "center" });
      setActivity(flag.why || `Uh oh. ${flag.flag}`, { mood: "alarm" });
      await moveCursorTo(tag, 16, 10);
      await clickCursor();
      await pause(flag.why ? 1200 : 300);
    });
  }

  // 4. Decide, stamp, act.
  if (decided && !view.decided) {
    view.decided = true;
    const s = buildDecision(c);
    view.sheets.decision = s;
    q.add(async () => {
      setStep("decide");
      const why = thoughtFromReason(c.reason);
      setActivity(why || (c.status === "escalated" ? "Stopping this purchase" : "All good, clearing it"), { mood: c.status === "escalated" ? "focus" : "happy" });
      await placeSheet(s);
      if (why) {
        s.querySelector(".sheet-body").insertBefore(el("p", "thought", why), s.stepsEl);
        await pause(1200);
      }
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
        setStep("act");
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
      setStep("done");
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
    if (c._id === shown) b.setAttribute("aria-current", "true");
    const meta = el("span", "i-meta");
    meta.append(el("span", "i-amt", money(c.transaction.amount)), el("span", `pill pill-${shownStatus(c)}`, statusLabel(shownStatus(c))));
    b.append(el("span", "i-item", c.transaction.item), meta);
    b.setAttribute("aria-label", `${c.transaction.item}, ${money(c.transaction.amount)}, ${statusLabel(shownStatus(c))}`);
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
    status.append(el("span", `pill pill-${shownStatus(c)}`, statusLabel(shownStatus(c))));
    const holder = el("td");
    const person = el("span", "holder");
    if (isDolores(c.transaction.customer)) person.append(portrait("portrait portrait-sm"));
    person.append(document.createTextNode(c.transaction.customer));
    holder.append(person);
    tr.append(el("td", null, caseNo(c)), holder, el("td", null, c.transaction.item), el("td", null, money(c.transaction.amount)), status);
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

// ---------- timed purchase (record without switching to the store) ----------
let fuseTimer = null;
function armFuse() {
  const btn = $("fuse-buy");
  const status = $("fuse-status");
  if (fuseTimer) {
    clearInterval(fuseTimer);
    fuseTimer = null;
    btn.textContent = "Queue $1,500 gift card purchase";
    status.textContent = "Cancelled.";
    return;
  }
  let left = Number($("fuse-delay").value) || 10;
  const show = () => {
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    status.textContent = `Purchase goes in at ${m}:${s}. You can close this panel.`;
  };
  btn.textContent = "Cancel";
  show();
  fuseTimer = setInterval(async () => {
    left -= 1;
    if (left > 0) return show();
    clearInterval(fuseTimer);
    fuseTimer = null;
    btn.textContent = "Queue $1,500 gift card purchase";
    status.textContent = "Placing the purchase…";
    try {
      const res = await fetch(`${siteUrl}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: "Dolores",
          merchant: "BestBye",
          item: "BestBye gift cards",
          amount: 1500,
          location: "Hobbs, NM",
        }),
      });
      status.textContent = res.ok ? "Purchase placed." : `Purchase failed (${res.status}).`;
    } catch (err) {
      status.textContent = `Purchase failed: ${err.message}`;
    }
  }, 1000);
}
$("fuse-buy").addEventListener("click", armFuse);
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
        if (currentView !== "ellio") {
          // Let the escalation land on the live feed first, then open the desk.
          holdUntil = Date.now() + 2800;
          const w = $("watcher");
          w.classList.add("is-alert");
          $("watch-line").textContent = `Escalating: ${arrived.transaction.customer} · risk ${arrived.riskScore ?? "high"} / 100`;
          setTimeout(() => {
            holdUntil = 0;
            w.classList.remove("is-alert");
            $("watch-line").textContent = "Ellio is watching card activity";
            showView("ellio");
            toast(arrived);
            update();
          }, 2800);
          return;
        }
        toast(arrived);
      }
      if (Date.now() < holdUntil) return;
      update();
    },
    (err) => {
      connEl.textContent = "Offline";
      simStatusEl.textContent = err.message;
    },
  );
  client.onUpdate(convex.anyApi.transactions.feed, {}, renderFeed, (err) => console.warn(err));
  client.mutation(convex.anyApi.traffic.start, {}).catch((err) => console.warn(err));
}

function renderFeed(data) {
  const body = $("feed");
  if (!body) return;
  const first = feedSeen === null;
  const seen = feedSeen || new Set();
  body.replaceChildren();
  for (const r of data.rows) {
    const s = r.riskScore;
    const lvl = typeof s !== "number" ? "none" : s >= 60 ? "high" : s >= 30 ? "mid" : "low";
    const tr = el("tr", `lvl-${lvl}${!first && !seen.has(r._id) ? " is-new" : ""}`);
    const risk = el("td", "risk-cell");
    const pill = el("span", `risk-pill ${lvl}`, typeof s === "number" ? String(s) : "–");
    const bar = el("span", "risk-mini");
    const fill = el("span");
    fill.style.width = `${typeof s === "number" ? s : 0}%`;
    bar.append(fill);
    risk.append(pill, bar);
    tr.append(
      el("td", "t", clock(r.createdAt)),
      el("td", null, r.customer),
      el("td", null, `${r.item} · ${r.merchant}`),
      el("td", null, r.location),
      el("td", "num", money(r.amount)),
      risk,
    );
    body.append(tr);
  }
  feedSeen = new Set(data.rows.map((r) => r._id));
  $("watch-count").textContent = `Scored ${data.scored.toLocaleString("en-US")} purchases`;
}
update();
// Re-check every 15s so a hung-up call stops showing as live.
setInterval(() => { if (cases.length) update(); }, 15000);



// ---------- Ellio walker (Accounts + Risk check animations) ----------
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const walker = (() => {
  const node = el("div", "walker");
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = '<svg viewBox="0 0 150 190"><ellipse cx="75" cy="182" rx="44" ry="6" fill="rgba(0,0,0,.18)"/><g class="w-body"><circle cx="56" cy="168" r="11" fill="#3e6fe0"/><circle cx="94" cy="168" r="11" fill="#3e6fe0"/><rect x="25" y="40" width="100" height="118" rx="28" fill="#3e6fe0"/><rect x="50" y="70" width="16" height="26" rx="6" fill="#0d1512"/><rect x="84" y="70" width="16" height="26" rx="6" fill="#0d1512"/><path d="M67 113h16l-4 9h-8z" fill="#0d1512"/><path d="M72.5 124h5l5.5 21-8 7-8-7z" fill="#0d1512"/><circle cx="14" cy="112" r="11" fill="#3e6fe0"/><circle cx="136" cy="112" r="11" fill="#3e6fe0"/></g></svg>';
  document.body.append(node);
  let shown = false;
  const place = (x, y, ms) => {
    node.style.transitionDuration = REDUCED ? "0ms" : `${ms}ms`;
    node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  return {
    async to(target, { dx = 0, dy = 0, ms = 650, side = "left" } = {}) {
      const r = target.getBoundingClientRect();
      const w = 46, h = 58;
      const x = side === "left" ? r.left - w - 10 + dx : side === "right" ? r.right + 10 + dx : r.left + r.width / 2 - w / 2 + dx;
      const y = side === "above" ? r.top - h + 6 + dy : r.top + r.height / 2 - h / 2 + dy;
      if (!shown) {
        place(x, y + 30, 0);
        node.classList.add("is-on");
        shown = true;
        await sleep(30);
      }
      node.classList.add("is-walking");
      place(x, y, ms);
      await sleep(REDUCED ? 0 : ms);
      node.classList.remove("is-walking");
    },
    async press() {
      node.classList.add("is-press");
      await sleep(REDUCED ? 0 : 180);
      node.classList.remove("is-press");
    },
    hide() {
      node.classList.remove("is-on");
      shown = false;
    },
  };
})();
window.__walker = walker;

// ---------- Accounts (Capital One Nessie) ----------
let accountsLoading = false;
async function loadAccounts() {
  if (!client || accountsLoading) return;
  accountsLoading = true;
  const status = $("accounts-status");
  status.hidden = false;
  status.textContent = "Loading accounts from Nessie…";
  try {
    const rows = await client.action(convex.anyApi.nessie.accounts, {});
    renderAccounts(rows);
    status.hidden = rows.length > 0;
    scanAccounts();
    if (!rows.length) status.textContent = "No Nessie accounts yet. Run npx convex run nessie:seed.";
  } catch (err) {
    status.textContent = `Could not reach Nessie: ${err.message}`;
  } finally {
    accountsLoading = false;
  }
}

let openAccount = null;
let scanRun = 0;
async function scanAccounts() {
  const run = ++scanRun;
  const rowsEls = [...document.querySelectorAll("#accounts .acct-row")];
  rowsEls.forEach((r, i) => { r.style.animationDelay = `${Math.min(i, 20) * 35}ms`; r.classList.add("is-enter"); });
  if (REDUCED || !rowsEls.length) return;
  await sleep(rowsEls.length * 35 + 250);
  for (const r of rowsEls) {
    if (run !== scanRun || currentView !== "accounts") return;
    await walker.to(r.querySelector(".acct-name"), { ms: 150, dx: 4 });
    r.classList.add("is-scan");
    setTimeout(() => r.classList.remove("is-scan"), 260);
  }
  const focus = rowsEls.find((r) => r.classList.contains("is-focus")) || rowsEls[0];
  if (run !== scanRun || currentView !== "accounts") return;
  await walker.to(focus.querySelector(".acct-name"), { ms: 600, dx: 4 });
  await walker.press();
  if (!focus.classList.contains("is-open")) focus.click();
}
function renderAccounts(rows) {
  const body = $("accounts");
  body.replaceChildren();
  const short = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  for (const a of rows) {
    const tr = el("tr", "acct-row" + (isDolores(a.name) ? " is-focus" : "") + (openAccount === a.accountId ? " is-open" : ""));
    const name = el("td", "acct-name");
    name.append(el("span", "acct-caret", "›"), document.createTextNode(a.name));
    const catText = a.categories.join(", ");
    const cats = el("td", "muted", catText.charAt(0).toUpperCase() + catText.slice(1));
    tr.append(
      name,
      el("td", "muted", a.home),
      el("td", null, ""),
      el("td", "num", String(a.count)),
      el("td", "num", money(a.median)),
      el("td", "num", money(a.total)),
      cats,
    );
    tr.children[2].className = "muted acct-id-plain";
    tr.children[2].textContent = String(a.accountId).slice(0, 8);
    body.append(tr);

    const detail = el("tr", "acct-detail");
    detail.hidden = openAccount !== a.accountId;
    const td = el("td");
    td.colSpan = 7;
    if (a.error) td.append(el("p", "acct-err", a.error));
    const inner = el("table", "acct-table");
    for (const p of a.recent) {
      const r = el("tr");
      r.append(el("td", "t", short(p.date)), el("td", null, p.merchant), el("td", "muted", p.description), el("td", "num", money(p.amount)));
      inner.append(r);
    }
    td.append(el("p", "acct-detail-title", `Recent purchases · ${a.recent.length} of ${a.count}`), inner);
    detail.append(td);
    body.append(detail);

    tr.addEventListener("click", () => {
      const open = detail.hidden;
      for (const d of body.querySelectorAll(".acct-detail")) d.hidden = true;
      for (const r of body.querySelectorAll(".acct-row")) r.classList.remove("is-open");
      detail.hidden = !open;
      tr.classList.toggle("is-open", open);
      openAccount = open ? a.accountId : null;
    });
  }
}

// ---------- Risk check (CRS FraudFinder) ----------
const RC_PERSONAS = {
  P13: { label: "Kayla Brennan", name: "Kayla Brennan", email: "kb.9921x@example.com", phone: "(555) 010-1013", address: "9021 Kingston Pike, Knoxville, TN 37923", ip: "198.51.100.13" },
  P12: { label: "Victor Anand", name: "Victor Anand", email: "v.anand.1968@example.com", phone: "(555) 010-1012", address: "55 Water St Fl 20, New York, NY 10041", ip: "198.51.100.12" },
  P20: { label: "Dolores Whitcomb", name: "Dolores Whitcomb", email: "dolores.whitcomb@example.com", phone: "(555) 010-1020", address: "612 Ocean View Dr, Santa Barbara, CA 93109", ip: "203.0.113.30" },
  P01: { label: "Margaret Okafor", name: "Margaret Okafor", email: "margaret.okafor@example.com", phone: "(555) 010-1001", address: "1420 Willow Creek Dr, San Jose, CA 95125", ip: "203.0.113.11" },
};
const RC_R = 70;
const RC_C = 2 * Math.PI * RC_R;
function rcRing(score, level) {
  const NS = "http://www.w3.org/2000/svg";
  const wrap = el("div", `rc-ring lvl-${level || "none"}`);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 180 180");
  const track = document.createElementNS(NS, "circle");
  const bar = document.createElementNS(NS, "circle");
  for (const c of [track, bar]) {
    c.setAttribute("cx", "90"); c.setAttribute("cy", "90"); c.setAttribute("r", String(RC_R));
  }
  track.setAttribute("class", "rc-track");
  bar.setAttribute("class", "rc-bar");
  bar.style.strokeDasharray = String(RC_C);
  bar.style.strokeDashoffset = String(RC_C);
  svg.append(track, bar);
  const mid = el("div", "rc-mid");
  mid.append(el("strong", null, score == null ? "–" : String(score)), el("span", null, level || "risk"));
  wrap.append(svg, mid);
  if (score != null) requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.strokeDashoffset = String(RC_C * (1 - Math.max(0, Math.min(100, score)) / 100));
  }));
  return wrap;
}
function rcIdle(text) {
  const out = $("rc-result");
  out.replaceChildren(rcRing(null, null));
  if (text) out.append(el("p", "rc-idle", text));
}

const rcSelect = $("rc-persona");
for (const [id, p] of Object.entries(RC_PERSONAS)) {
  const o = el("option", null, `${id} · ${p.label}`);
  o.value = id;
  rcSelect.append(o);
}
function rcShowFields() {
  const p = RC_PERSONAS[rcSelect.value];
  const dl = $("rc-fields");
  dl.replaceChildren();
  for (const [k, v] of [["Email", p.email], ["Phone", p.phone], ["Address", p.address], ["IP", p.ip]]) {
    dl.append(el("dt", null, k), el("dd", null, v));
  }
  rcIdle();
}
rcSelect.addEventListener("change", rcShowFields);
rcShowFields();

let rcBusy = false;
async function rcEllioRun() {
  if (rcBusy) return;
  const btn = $("rc-run");
  await walker.to(btn, { side: "left", ms: 700 });
  await walker.press();
  btn.classList.add("is-pressed");
  setTimeout(() => btn.classList.remove("is-pressed"), 160);
  rcRunCheck();
}
rcSelect.addEventListener("change", () => { if (currentView === "riskcheck") rcEllioRun(); });
$("rc-run").addEventListener("click", rcRunCheck);
async function rcRunCheck() {
  if (!client || rcBusy) return;
  rcBusy = true;
  const btn = $("rc-run");
  btn.disabled = true;
  btn.textContent = "Checking…";
  rcIdle("Checking with CRS…");
  try {
    const r = await client.action(convex.anyApi.crsCheck.check, { persona: rcSelect.value });
    const out = $("rc-result");
    if (!r.ok || r.score == null) {
      rcIdle(r.error || "CRS returned no score.");
      return;
    }
    const level = r.score >= 70 ? "high" : r.score >= 40 ? "medium" : "low";
    const ring = rcRing(r.score, level);
    out.replaceChildren(ring);
    // count the number up with the ring
    const num = ring.querySelector("strong");
    const t0 = performance.now(), dur = REDUCED ? 0 : 1000;
    const tick = (t) => {
      const k = dur ? Math.min(1, (t - t0) / dur) : 1;
      num.textContent = String(Math.round(r.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (!REDUCED) await sleep(900);
    if (r.signals.length) {
      const ul = el("ul", "rc-signals");
      r.signals.forEach((sgl, i) => {
        const li = el("li", "rc-in", sgl.charAt(0).toUpperCase() + sgl.slice(1));
        li.style.animationDelay = `${i * 140}ms`;
        ul.append(li);
      });
      out.append(ul);
    } else {
      out.append(el("p", "rc-clean rc-in", "No warning signs"));
    }
  } catch (err) {
    rcIdle(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Run check";
    rcBusy = false;
  }
}
