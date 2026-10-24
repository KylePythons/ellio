const siteUrl = window.CONVEX_SITE_URL;
const products = document.querySelectorAll(".product");
const chosen = document.getElementById("chosen");
const form = document.getElementById("checkout");
const result = document.getElementById("result");
const submit = document.getElementById("submit");

let selected = document.querySelector(".product.is-selected");

function money(amount) {
  return Number(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function showChosen(product) {
  chosen.textContent = `${product.dataset.item} · ${money(product.dataset.amount)}`;
}

for (const product of products) {
  product.addEventListener("click", () => {
    for (const other of products) {
      other.classList.remove("is-selected");
    }
    product.classList.add("is-selected");
    selected = product;
    showChosen(product);
    result.textContent = "";
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.className = "result";
  if (!siteUrl) {
    result.textContent = "Missing CONVEX_SITE_URL in config.js.";
    result.classList.add("is-error");
    return;
  }
  if (!selected) {
    result.textContent = "Choose a product first.";
    result.classList.add("is-error");
    return;
  }

  const data = new FormData(form);
  const customer = String(data.get("customer") || "").trim();
  const card = String(data.get("card") || "").trim();
  const location = String(data.get("location") || "").trim();
  if (!customer || !card || !location) {
    result.textContent = "Name, card, and shipping city are required.";
    result.classList.add("is-error");
    return;
  }

  submit.disabled = true;
  submit.textContent = "Placing order…";
  try {
    const response = await fetch(`${siteUrl.replace(/\/$/, "")}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        merchant: "BestBye",
        item: selected.dataset.item,
        amount: Number(selected.dataset.amount),
        location,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The order could not be placed.");
    }
    result.classList.add("is-ok");
    result.textContent = payload.risky
      ? "Order placed. Merritt Bank is calling to verify this purchase."
      : "Order placed. This charge matches the card’s usual pattern.";
  } catch (error) {
    result.classList.add("is-error");
    result.textContent =
      error instanceof Error ? error.message : "The order could not be placed.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Place order";
  }
});
