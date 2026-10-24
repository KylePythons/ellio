const convexUrl = window.CONVEX_URL;
const siteUrl = (window.CONVEX_SITE_URL || "").replace(/\/$/, "");
const casesEl = document.getElementById("cases");
const countEl = document.getElementById("count");
const liveEl = document.getElementById("live");
const targetEl = document.getElementById("sim-target");
const statusEl = document.getElementById("sim-status");
const resetButton = document.getElementById("reset");
const toolButtons = document.querySelectorAll("[data-tool]");

const transcriptLines = [
  {
    role: "agent",
    text: "Hi Dolores, this is Merritt Bank. Did you buy a television from BestBye today?",
  },
  {
    role: "customer",
    text: "A television? I didn't order anything. I live in Hobbs.",
  },
  {
    role: "agent",
    text: "The charge is $1,499 in San Francisco. I'm going to hold the card while we sort this out.",
  },
];

let cases = [];
let transcriptStep = 0;
let busy = false;
let client = null;
let shownCaseId = null;

function money(amount) {
  return Number(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function when(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function listBlock(title, nodes, emptyText) {
  const block = el("section", "block");
  block.append(el("h3", "section-label", title));
  if (nodes.length === 0) {
    block.append(el("p", "quiet", emptyText));
  } else {
    for (const node of nodes) {
      block.append(node);
    }
  }
  return block;
}

function renderCase(caseDoc, index) {
  const card = el("article", index === 0 ? "case is-newest" : "case");
  const top = el("div", "case-top");
  const identity = el("div");
  identity.append(
    el(
      "p",
      "who",
      `${caseDoc.transaction.customer} · ${caseDoc.transaction.merchant}`,
    ),
  );
  identity.append(el("p", "amount", money(caseDoc.transaction.amount)));
  identity.append(
    el(
      "p",
      "meta",
      `${caseDoc.transaction.item} · ${caseDoc.transaction.location} · ${when(caseDoc.transaction.createdAt)}`,
    ),
  );
  top.append(identity);
  top.append(el("span", `badge badge-${caseDoc.status}`, caseDoc.status));
  card.append(top);

  card.append(
    listBlock(
      "Risk reasons",
      caseDoc.riskReasons.map((reason) => el("p", "reason", reason)),
      "No risk reasons recorded.",
    ),
  );

  card.append(
    listBlock(
      "Live transcript",
      caseDoc.transcript.map((line) => {
        const row = el("div", "line");
        row.append(el("span", "role", `${line.role} · ${when(line.at)}`));
        row.append(el("p", "quote", line.text));
        return row;
      }),
      "Waiting for the call.",
    ),
  );

  card.append(
    listBlock(
      "Red flags",
      caseDoc.redFlags.map((flag) => {
        const row = el("div", "flag");
        row.append(el("strong", null, flag.flag));
        row.append(el("p", "quote", `“${flag.quote}”`));
        return row;
      }),
      "None yet.",
    ),
  );

  const summary = el("section", "block");
  summary.append(el("h3", "section-label", "Final summary"));
  summary.append(
    caseDoc.summary
      ? el("p", "summary", caseDoc.summary)
      : el("p", "quiet", "The call summary will appear here when the call ends."),
  );
  card.append(summary);

  card.append(
    listBlock(
      "Actions taken",
      caseDoc.actions.map((action) => el("p", "action", action)),
      "None yet.",
    ),
  );
  return card;
}

function render() {
  const nextId = cases.length > 0 ? cases[0]._id : null;
  if (!busy && shownCaseId && nextId && nextId !== shownCaseId) {
    statusEl.textContent = "";
    statusEl.style.color = "";
  }
  shownCaseId = nextId;

  casesEl.replaceChildren();
  if (cases.length === 0) {
    countEl.textContent = "No open cases.";
    const empty = el(
      "p",
      "empty",
      "Buy the $1,499 TV on BestBye from outside Hobbs, NM. The case shows up here without a refresh.",
    );
    casesEl.append(empty);
    targetEl.textContent = "No case yet.";
  } else {
    countEl.textContent =
      cases.length === 1 ? "1 case, newest first." : `${cases.length} cases, newest first.`;
    for (let index = 0; index < cases.length; index += 1) {
      casesEl.append(renderCase(cases[index], index));
    }
    const newest = cases[0];
    targetEl.textContent = `Newest case: ${newest.transaction.customer}, ${newest.transaction.item}, ${money(newest.transaction.amount)}.`;
  }
  for (const button of toolButtons) {
    button.disabled = busy || cases.length === 0;
  }
}

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9d2430" : "";
}

async function postTool(path, body) {
  const response = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "The tool call failed.");
  }
  return payload;
}

async function simulate(tool) {
  const newest = cases[0];
  if (!newest || busy) {
    return;
  }
  if (!siteUrl) {
    setStatus("Missing CONVEX_SITE_URL in config.js.", true);
    return;
  }
  const caseId = newest._id;
  busy = true;
  render();
  try {
    if (tool === "approve") {
      await postTool("/tools/approve", {
        case_id: caseId,
        reason: "Customer confirmed the purchase",
      });
      setStatus("Marked the newest case approved.");
    } else if (tool === "escalate") {
      await postTool("/tools/escalate", {
        case_id: caseId,
        reason: "Customer did not recognize the charge",
      });
      setStatus("Escalated the newest case.");
    } else if (tool === "red-flag") {
      await postTool("/tools/red-flag", {
        case_id: caseId,
        flag: "Unrecognized charge",
        quote: "I didn't order anything. I live in Hobbs.",
      });
      setStatus("Added a red flag to the newest case.");
    } else if (tool === "transcript") {
      const line = transcriptLines[transcriptStep % transcriptLines.length];
      transcriptStep += 1;
      await postTool("/tools/transcript", {
        case_id: caseId,
        role: line.role,
        text: line.text,
      });
      setStatus("Added a transcript line.");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The tool call failed.", true);
  } finally {
    busy = false;
    render();
  }
}

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    simulate(button.dataset.tool);
  });
}

resetButton.addEventListener("click", async () => {
  if (!window.confirm("Clear every case and transaction in this demo?")) {
    return;
  }
  if (!client) {
    setStatus("The live client is not connected.", true);
    return;
  }
  resetButton.disabled = true;
  try {
    await client.mutation(convex.anyApi.cases.reset, {});
    transcriptStep = 0;
    setStatus("Demo data cleared.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Reset failed.", true);
  } finally {
    resetButton.disabled = false;
  }
});

if (!convexUrl || !window.convex) {
  liveEl.textContent = "Offline";
  countEl.textContent = "The Convex client or CONVEX_URL is missing.";
} else {
  client = new convex.ConvexClient(convexUrl);
  client.subscribeToConnectionState((state) => {
    const connected = state.isWebSocketConnected;
    liveEl.textContent = connected ? "Live" : "Connecting";
    liveEl.classList.toggle("is-on", connected);
  });
  client.onUpdate(
    convex.anyApi.cases.list,
    {},
    (rows) => {
      cases = rows;
      render();
    },
    (error) => {
      liveEl.textContent = "Offline";
      liveEl.classList.remove("is-on");
      setStatus(error.message, true);
    },
  );
}

render();
