const siteUrl = window.CONVEX_SITE_URL;

const FEATURED_SKU = "BB-500";

const CATALOG = [
  {
    sku: "BB-500",
    item: "BestBye gift cards",
    amount: 1500,
    category: "giftcards",
    categoryLabel: "Gift Cards",
    blurb: "Three $500 cards, emailed in minutes",
    details: "Three $500 BestBye gift cards. The card codes arrive by email within minutes.",
    rating: 4.9,
    reviews: 5120,
    specs: ["Three $500 cards", "Emailed in minutes", "Never expire"],
  },
  {
    sku: "BB-650",
    item: '65" Horizon TV',
    amount: 1499,
    category: "tvs",
    categoryLabel: "TVs & Home Theater",
    blurb: "4K panel, two HDMI inputs",
    details: "65-inch 4K panel with two HDMI inputs. The stand is in the box.",
    rating: 4.8,
    reviews: 2431,
    specs: ["65-inch 4K panel", "Two HDMI inputs", "Stand included"],
  },
  {
    sku: "BB-214",
    item: "Cedar Headphones",
    amount: 189,
    category: "audio",
    categoryLabel: "Audio",
    blurb: "Over-ear, wired",
    details: "Over-ear headphones with a wired cable. Folds flat.",
    rating: 4.6,
    reviews: 864,
    specs: ["Over-ear", "Wired", "Folds flat"],
  },
  {
    sku: "BB-140",
    item: "Field Notebook Laptop",
    amount: 899,
    category: "computers",
    categoryLabel: "Computers",
    blurb: "14-inch, two ports",
    details: "14-inch laptop with two ports. Charger included.",
    rating: 4.5,
    reviews: 1102,
    specs: ["14-inch display", "Two ports", "Charger included"],
  },
  {
    sku: "BB-088",
    item: "Porch Speaker",
    amount: 129,
    category: "audio",
    categoryLabel: "Audio",
    blurb: "One driver, volume knob",
    details: "One driver and a volume knob. Runs on the included cord.",
    rating: 4.4,
    reviews: 390,
    specs: ["One driver", "Volume knob", "Cord included"],
  },
  {
    sku: "BB-031",
    item: "Pocket Earbuds",
    amount: 79,
    category: "audio",
    categoryLabel: "Audio",
    blurb: "Case and a cable",
    details: "Earbuds with a charging case and a cable.",
    rating: 4.3,
    reviews: 2018,
    specs: ["Charging case", "Cable included", "Pocket size"],
  },
  {
    sku: "BB-412",
    item: "Kitchen Tablet",
    amount: 429,
    category: "tablets",
    categoryLabel: "Tablets",
    blurb: "Stand included",
    details: "Tablet with a stand in the box. Made to sit on a counter.",
    rating: 4.6,
    reviews: 640,
    specs: ["Stand included", "Counter height", "Charging cable"],
  },
];

const DEPARTMENTS = [
  { id: "tvs", label: "TVs & Home Theater", blurb: "Screens in stock today.", sku: "BB-650" },
  { id: "audio", label: "Audio", blurb: "Headphones, earbuds, and a speaker.", sku: "BB-214" },
  { id: "computers", label: "Computers", blurb: "Laptops ready to ship.", sku: "BB-140" },
  { id: "tablets", label: "Tablets", blurb: "A tablet with a stand in the box.", sku: "BB-412" },
  { id: "giftcards", label: "Gift Cards", blurb: "Emailed in minutes.", sku: "BB-500" },
  { id: "deals", label: "Deals", blurb: "In stock under $200.", sku: "BB-031" },
];

function productBySku(sku) {
  return CATALOG.find((product) => product.sku === sku) || null;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function art(sku) {
  const pictures = {
    "BB-500": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="44" ry="4" fill="#000" opacity=".08"/><g transform="rotate(-10 80 50)"><rect x="34" y="26" width="84" height="52" rx="6" fill="#1b232c"/></g><g transform="rotate(-3 80 50)"><rect x="38" y="24" width="84" height="52" rx="6" fill="#3a4450"/></g><g transform="rotate(5 80 50)"><rect x="42" y="22" width="84" height="52" rx="6" fill="#ffd84a"/><rect x="42" y="58" width="84" height="8" fill="#1b232c" opacity=".85"/><text x="52" y="44" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#1b232c">BestBye</text><text x="104" y="44" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#1b232c">$500</text></g></svg>`,
    "BB-650": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="92" rx="40" ry="4" fill="#000" opacity=".08"/><rect x="14" y="12" width="132" height="70" rx="2" fill="#1b232c"/><rect x="20" y="18" width="120" height="58" fill="#8eb4cc"/><rect x="20" y="18" width="120" height="20" fill="#c5dde8" opacity=".7"/><rect x="68" y="82" width="24" height="5" fill="#1b232c"/><rect x="52" y="87" width="56" height="4" rx="1" fill="#1b232c"/></svg>`,
    "BB-214": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="92" rx="36" ry="4" fill="#000" opacity=".08"/><path d="M42 58 V46 a38 38 0 0 1 76 0 v12" fill="none" stroke="#1b232c" stroke-width="4"/><rect x="30" y="50" width="22" height="34" rx="8" fill="#1b232c"/><rect x="108" y="50" width="22" height="34" rx="8" fill="#1b232c"/><rect x="34" y="58" width="14" height="18" rx="4" fill="#3a4450"/></svg>`,
    "BB-140": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="40" ry="4" fill="#000" opacity=".08"/><path d="M28 74 h104 l-8 8 H36 z" fill="#2a3138"/><rect x="40" y="16" width="80" height="54" rx="3" fill="#1b232c"/><rect x="46" y="22" width="68" height="42" fill="#d5e2ea"/></svg>`,
    "BB-088": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="92" rx="24" ry="4" fill="#000" opacity=".08"/><rect x="58" y="10" width="44" height="78" rx="8" fill="#1b232c"/><circle cx="80" cy="36" r="14" fill="#e7ebf0"/><circle cx="80" cy="36" r="6" fill="#1b232c"/><circle cx="80" cy="66" r="7" fill="#e7ebf0"/></svg>`,
    "BB-031": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="84" rx="34" ry="4" fill="#000" opacity=".08"/><rect x="46" y="28" width="68" height="44" rx="16" fill="#1b232c"/><circle cx="66" cy="50" r="9" fill="#e7ebf0"/><circle cx="94" cy="50" r="9" fill="#e7ebf0"/></svg>`,
    "BB-412": `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="94" rx="28" ry="3" fill="#000" opacity=".08"/><rect x="52" y="8" width="56" height="82" rx="5" fill="#1b232c"/><rect x="58" y="16" width="44" height="58" fill="#d7e4c8"/><circle cx="80" cy="82" r="2.5" fill="#e7ebf0"/></svg>`,
  };
  return pictures[sku] || pictures["BB-031"];
}

function money(amount) {
  return Number(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function priceHtml(amount, extraClass) {
  const [dollars, cents] = Number(amount).toFixed(2).split(".");
  const formatted = Number(dollars).toLocaleString("en-US");
  return `<p class="price ${extraClass || ""}"><sup>$</sup>${formatted}<sup>${cents}</sup></p>`;
}

function stars(rating, reviews) {
  const width = Math.max(0, Math.min(100, (rating / 5) * 100));
  const label = `${rating} out of 5 stars, ${reviews.toLocaleString("en-US")} reviews`;
  return `<span class="rating-line"><span class="star-row" role="img" aria-label="${label}"><span class="star-base">★★★★★</span><span class="star-fill" style="width:${width}%">★★★★★</span></span><span>${reviews.toLocaleString("en-US")}</span></span>`;
}

function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem("bestbye-cart") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((line) => productBySku(line.sku) && Number(line.qty) > 0)
      .map((line) => ({ sku: line.sku, qty: Math.min(3, Math.floor(Number(line.qty))) }));
  } catch {
    return [];
  }
}

function saveCart(lines) {
  localStorage.setItem("bestbye-cart", JSON.stringify(lines));
}

function cartCount() {
  return getCart().reduce((sum, line) => sum + line.qty, 0);
}

function getDirect() {
  try {
    const value = JSON.parse(sessionStorage.getItem("bestbye-direct") || "null");
    if (!value || !productBySku(value.sku)) return null;
    const qty = Math.min(3, Math.max(1, Math.floor(Number(value.qty) || 1)));
    return { sku: value.sku, qty };
  } catch {
    return null;
  }
}

function setDirect(sku, qty) {
  sessionStorage.setItem("bestbye-direct", JSON.stringify({ sku, qty }));
}

function clearDirect() {
  sessionStorage.removeItem("bestbye-direct");
}

function getLocation() {
  const value = (sessionStorage.getItem("bestbye-location") || "").trim();
  return value || "Hobbs, NM";
}

function getCustomer() {
  const value = (sessionStorage.getItem("bestbye-customer") || "").trim();
  return value || "Dolores";
}

function isDolores(name) {
  return String(name || "").trim().split(/\s+/)[0].toLowerCase() === "dolores";
}

function syncAccount() {
  const name = getCustomer();
  document.getElementById("hello-name").textContent = name;
  const photo = document.getElementById("account-photo");
  if (photo) photo.hidden = !isDolores(name);
}

function getOrders() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("bestbye-orders") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function remember(sku) {
  let list = [];
  try {
    const raw = JSON.parse(sessionStorage.getItem("bestbye-recent") || "[]");
    if (Array.isArray(raw)) list = raw.filter((id) => id !== sku);
  } catch {
    list = [];
  }
  list.unshift(sku);
  sessionStorage.setItem("bestbye-recent", JSON.stringify(list.slice(0, 4)));
}

function recentProducts() {
  try {
    const ids = JSON.parse(sessionStorage.getItem("bestbye-recent") || "[]");
    return ids.map(productBySku).filter(Boolean);
  } catch {
    return [];
  }
}

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, params: new URLSearchParams(query || "") };
}

function productsIn(deptId) {
  if (deptId === "deals") return CATALOG.filter((product) => product.amount <= 200);
  return CATALOG.filter((product) => product.category === deptId);
}

function sortProducts(list, sort) {
  const copy = [...list];
  if (sort === "price-asc") copy.sort((a, b) => a.amount - b.amount);
  else if (sort === "price-desc") copy.sort((a, b) => b.amount - a.amount);
  else if (sort === "rating") copy.sort((a, b) => b.rating - a.rating);
  return copy;
}

function searchProducts(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOG.filter((product) => {
    const hay = `${product.item} ${product.blurb} ${product.sku} ${product.categoryLabel}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

function lineTotal(lines) {
  return lines.reduce((sum, line) => sum + productBySku(line.sku).amount * line.qty, 0);
}

function itemCount(lines) {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

function qtyControl(sku, qty) {
  const options = [1, 2, 3]
    .map((value) => `<option value="${value}"${value === qty ? " selected" : ""}>${value}</option>`)
    .join("");
  return `<label class="qty-row">Qty <select class="qty" data-set-qty="${esc(sku)}">${options}</select></label>`;
}

function card(product) {
  return `<article class="card">
    <a class="card-media" href="#/p/${product.sku.toLowerCase()}">${art(product.sku)}</a>
    <a class="card-name" href="#/p/${product.sku.toLowerCase()}">${esc(product.item)}</a>
    ${stars(product.rating, product.reviews)}
    ${priceHtml(product.amount)}
    <p class="stock">In stock</p>
    <button type="button" class="btn btn-yellow btn-block" data-add="${product.sku}">Add to cart</button>
  </article>`;
}

function crumbs(items) {
  const html = items
    .map((item, index) => {
      if (index === items.length - 1) return `<span>${esc(item.label)}</span>`;
      return `<a href="${item.href}">${esc(item.label)}</a>`;
    })
    .join('<span class="crumb-sep" aria-hidden="true">›</span>');
  return `<nav class="crumbs" aria-label="Breadcrumb">${html}</nav>`;
}

function sortSelect(current) {
  const options = [
    ["featured", "Featured"],
    ["price-asc", "Price: Low to high"],
    ["price-desc", "Price: High to low"],
    ["rating", "Avg. customer review"],
  ];
  return `<label class="sort-label">Sort by
    <select id="sort">${options
      .map(([value, label]) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`)
      .join("")}</select>
  </label>`;
}

function renderHome() {
  document.title = "BestBye.com: TVs, Audio, Computers & Tablets";
  const tv = productBySku(FEATURED_SKU);
  const tiles = DEPARTMENTS.map(
    (dept) => `<a class="dept-tile" href="#/c/${dept.id}">
      <span class="dept-art">${art(dept.sku)}</span>
      <span>${esc(dept.label)}</span>
    </a>`,
  ).join("");
  const recent = recentProducts();
  const recentBlock = recent.length
    ? `<section class="sheet also"><h2>Recently viewed</h2><div class="product-grid">${recent.map(card).join("")}</div></section>`
    : "";
  return `<section class="hero">
      <div class="hero-copy">
        <p class="kicker">Featured</p>
        <h1>${esc(tv.item)}</h1>
        <p class="hero-blurb">${esc(tv.blurb)}</p>
        ${priceHtml(tv.amount)}
        <p class="stock">In stock</p>
        <div class="hero-actions">
          <button type="button" class="btn btn-yellow" data-add="${tv.sku}">Add to cart</button>
          <button type="button" class="btn btn-dark" data-buy="${tv.sku}">Buy now</button>
        </div>
      </div>
      <a class="hero-art" href="#/p/${tv.sku.toLowerCase()}" aria-label="${esc(tv.item)}"><span class="stage">${art(tv.sku)}</span></a>
    </section>
    <nav class="dept-grid" aria-label="Shop by department">${tiles}</nav>
    <section class="sheet">
      <div class="sheet-head"><h2>Top picks</h2></div>
      <div class="product-grid">${CATALOG.map(card).join("")}</div>
    </section>
    ${recentBlock}`;
}

function renderList(title, lede, products, sort) {
  document.title = `${title} — BestBye`;
  const sorted = sortProducts(products, sort);
  const grid = sorted.length
    ? `<div class="product-grid">${sorted.map(card).join("")}</div>`
    : `<div class="empty"><h1>No matches</h1><p>Try a department from the bar above.</p><a class="btn btn-yellow" href="#/">Continue shopping</a></div>`;
  return `${crumbs([{ href: "#/", label: "Home" }, { label: title }])}
    <div class="sheet">
      <div class="list-head">
        <div>
          <h1 class="page-title">${esc(title)}</h1>
          <p class="lede">${esc(lede)}</p>
          <p class="count">${sorted.length} result${sorted.length === 1 ? "" : "s"}</p>
        </div>
        ${sortSelect(sort)}
      </div>
      ${grid}
    </div>`;
}

function renderProduct(product) {
  document.title = `${product.item} — BestBye`;
  remember(product.sku);
  const others = CATALOG.filter((item) => item.sku !== product.sku).slice(0, 4);
  return `${crumbs([
    { href: "#/", label: "Home" },
    { href: `#/c/${product.category}`, label: product.categoryLabel },
    { label: product.item },
  ])}
  <div class="pdp">
    <article class="pdp-main">
      <div class="gallery">${art(product.sku)}</div>
      <h1>${esc(product.item)}</h1>
      <p class="sku-line">SKU ${esc(product.sku)}</p>
      ${stars(product.rating, product.reviews)}
      <p class="details">${esc(product.details)}</p>
      <ul class="specs">${product.specs.map((spec) => `<li>${esc(spec)}</li>`).join("")}</ul>
    </article>
    <aside class="buy-box">
      ${priceHtml(product.amount)}
      <p class="stock">In stock</p>
      <p class="ship-line">Delivery to <strong>${esc(getLocation())}</strong></p>
      <label class="qty-row">Qty
        <select class="qty" id="pdp-qty">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <button type="button" class="btn btn-yellow btn-block" data-add="${product.sku}">Add to cart</button>
      <button type="button" class="btn btn-dark btn-block" data-buy="${product.sku}">Buy now</button>
      <p class="sold-by">Sold by BestBye<br />Fulfilled from Hobbs, NM</p>
    </aside>
  </div>
  <section class="sheet also">
    <h2>Customers also viewed</h2>
    <div class="product-grid">${others.map(card).join("")}</div>
  </section>`;
}

function renderLines(lines) {
  return lines
    .map((line) => {
      const product = productBySku(line.sku);
      return `<article class="cart-line">
        <a class="thumb" href="#/p/${product.sku.toLowerCase()}">${art(product.sku)}</a>
        <div>
          <a class="line-name" href="#/p/${product.sku.toLowerCase()}">${esc(product.item)}</a>
          <p class="stock">In stock</p>
          <p class="line-meta">${esc(product.blurb)} · SKU ${esc(product.sku)}</p>
          <div class="line-actions">
            ${qtyControl(product.sku, line.qty)}
            <button type="button" class="linkish" data-remove="${product.sku}">Delete</button>
          </div>
        </div>
        <p class="line-price">${money(product.amount * line.qty)}</p>
      </article>`;
    })
    .join("");
}

function renderCart() {
  document.title = "Shopping Cart — BestBye";
  const lines = getCart();
  if (!lines.length) {
    return `<div class="empty">
      <h1>Your cart is empty</h1>
      <p>Browse a department and add something when you are ready.</p>
      <a class="btn btn-yellow" href="#/">Continue shopping</a>
    </div>`;
  }
  const count = itemCount(lines);
  return `<div class="cart-layout">
    <section class="sheet">
      <div class="cart-head">
        <h1>Shopping Cart</h1>
        <p class="cart-sub">Subtotal (${count} item${count === 1 ? "" : "s"}): <strong>${money(lineTotal(lines))}</strong></p>
      </div>
      ${renderLines(lines)}
    </section>
    <aside class="summary-card">
      <p class="summary-total">Subtotal (${count} item${count === 1 ? "" : "s"}): <strong>${money(lineTotal(lines))}</strong></p>
      <a class="btn btn-yellow btn-block" href="#/checkout" id="checkout-from-cart">Proceed to checkout</a>
    </aside>
  </div>`;
}

function renderCheckout() {
  document.title = "Checkout — BestBye";
  const lines = checkoutLines();
  if (!lines.length) {
    return `<div class="empty">
      <h1>Your cart is empty</h1>
      <p>Add something before you check out.</p>
      <a class="btn btn-yellow" href="#/">Continue shopping</a>
    </div>`;
  }
  const count = itemCount(lines);
  const total = lineTotal(lines);
  const buttonLabel = lines.length > 1 ? `Place ${lines.length} charges` : "Place your order";
  const mini = lines
    .map((line) => {
      const product = productBySku(line.sku);
      return `<div class="mini-line"><span>${line.qty} × ${esc(product.item)}</span><span>${money(product.amount * line.qty)}</span></div>`;
    })
    .join("");
  return `${crumbs([
    { href: "#/cart", label: "Cart" },
    { label: "Checkout" },
  ])}
  <form id="checkout" class="checkout-layout">
    <div class="checkout-copy">
      <h1>Checkout</h1>
      <section class="block">
        <h2>Buyer</h2>
        <label>Name on card
          <input name="customer" autocomplete="name" value="${esc(getCustomer())}" required />
        </label>
      </section>
      <section class="block">
        <h2>Contact for receipt</h2>
        <label>Contact name
          <input name="contactName" autocomplete="off" value="Kayla Brennan" required />
        </label>
        <label>Email
          <input name="email" type="email" autocomplete="off" value="kb.9921x@example.com" required />
        </label>
        <label>Phone
          <input name="phone" type="tel" autocomplete="off" value="(555) 010-1013" />
        </label>
        <label>Street
          <input name="street" autocomplete="off" value="9021 Kingston Pike" />
        </label>
        <label>City
          <input name="contactCity" autocomplete="off" value="Knoxville" />
        </label>
        <label>State
          <input name="contactState" autocomplete="off" value="TN" />
        </label>
        <label>ZIP
          <input name="zip" autocomplete="off" value="37923" />
        </label>
        <label>Device IP (checkout session)
          <input name="ipAddress" autocomplete="off" value="198.51.100.13" />
        </label>
      </section>
      <section class="block">
        <h2>Payment</h2>
        <label>Card number
          <input name="card" inputmode="numeric" autocomplete="off" value="4242 4242 4242 4242" required />
        </label>
        <p class="hint">The card number stays in this browser. This card is registered in Hobbs, NM.</p>
      </section>
      <section class="block">
        <h2>Shipping</h2>
        <label>Shipping city
          <input name="location" autocomplete="address-level2" value="${esc(getLocation())}" required />
        </label>
      </section>
    </div>
    <aside class="summary-card">
      <button type="submit" class="btn btn-yellow btn-block" id="submit">${buttonLabel}</button>
      <p class="fine">${
        lines.length > 1
          ? "Each item is its own card charge. An unusual charge can trigger a verification call."
          : "One card charge. An unusual charge can trigger a verification call."
      }</p>
      <div class="totals">
        <div><span>Items (${count}):</span><span>${money(total)}</span></div>
        <div><span>Shipping:</span><span>FREE</span></div>
        <div class="grand"><span>Order total:</span><span>${money(total)}</span></div>
      </div>
      ${mini}
      <p class="result" id="result" role="status"></p>
    </aside>
  </form>`;
}

function renderOrders(fresh) {
  document.title = fresh ? "Order placed — BestBye" : "Your Orders — BestBye";
  const orders = getOrders();
  if (!orders.length) {
    return `<div class="empty">
      <h1>Your Orders</h1>
      <p>You have no recent orders.</p>
      <a class="btn btn-yellow" href="#/">Continue shopping</a>
    </div>`;
  }
  const banner = fresh ? `<h1 class="orders-banner">Order placed.</h1>` : `<h1 class="orders-banner">Your Orders</h1>`;
  const cards = orders
    .map((order) => {
      const when = new Date(order.placedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const lines = order.lines
        .map((line) => {
          const product = productBySku(line.sku);
          const name = product ? product.item : line.item;
          const picture = product ? art(product.sku) : "";
          return `<div class="order-line">
            <span class="thumb">${picture}</span>
            <div>
              <a class="line-name" href="${product ? `#/p/${product.sku.toLowerCase()}` : "#/"}">${esc(name)}</a>
              <p class="line-meta">Qty ${line.qty}</p>
            </div>
            <p class="line-price">${money(line.amount)}</p>
          </div>`;
        })
        .join("");
      return `<article class="order">
        <header class="order-head">
          <div>ORDER PLACED<strong>${esc(when)}</strong></div>
          <div>TOTAL<strong>${money(order.total)}</strong></div>
          <div>SHIP TO<strong>${esc(order.customer)}</strong>${esc(order.location)}</div>
          <div>ORDER #<strong>${esc(order.id)}</strong></div>
        </header>
        <div class="order-body">
          <p class="notice ${order.risky ? "is-alert" : "is-ok"}">${esc(order.message)}</p>
          ${lines}
        </div>
      </article>`;
    })
    .join("");
  return `${banner}${cards}<a class="btn btn-dark" href="#/">Continue shopping</a>`;
}

function renderMissing() {
  document.title = "BestBye";
  return `<div class="empty">
    <h1>That page is not in the store</h1>
    <p>The departments are still open.</p>
    <a class="btn btn-yellow" href="#/">Continue shopping</a>
  </div>`;
}

function checkoutLines() {
  const direct = getDirect();
  if (direct) return [direct];
  return getCart();
}

function render(options) {
  const scroll = !options || options.scroll !== false;
  const route = parseRoute();
  const top = route.parts[0] || "";
  if (top !== "checkout") clearDirect();

  const view = document.getElementById("view");
  const sort = route.params.get("sort") || "featured";
  let html = "";

  if (!top) {
    html = renderHome();
  } else if (top === "c") {
    const dept = DEPARTMENTS.find((item) => item.id === route.parts[1]);
    html = dept
      ? renderList(dept.label, dept.blurb, productsIn(dept.id), sort)
      : renderMissing();
  } else if (top === "p") {
    const product = CATALOG.find((item) => item.sku.toLowerCase() === (route.parts[1] || "").toLowerCase());
    html = product ? renderProduct(product) : renderMissing();
  } else if (top === "cart") {
    html = renderCart();
  } else if (top === "checkout") {
    html = renderCheckout();
  } else if (top === "orders") {
    const fresh = sessionStorage.getItem("bestbye-fresh") === "1";
    sessionStorage.removeItem("bestbye-fresh");
    html = renderOrders(fresh);
  } else if (top === "search") {
    const query = (route.params.get("q") || "").trim();
    const input = document.getElementById("search-input");
    if (input && document.activeElement !== input) input.value = query;
    html = query
      ? renderList(`Results for “${query}”`, "Matches from the BestBye catalog.", searchProducts(query), sort)
      : renderList("Search", "Type a product in the search bar.", [], sort);
  } else {
    html = renderMissing();
  }

  view.innerHTML = html;
  updateChrome(false);
  const toast = document.getElementById("toast");
  if (toast) toast.hidden = true;
  const pop = document.getElementById("loc-pop");
  if (pop) pop.hidden = true;
  if (scroll) window.scrollTo(0, 0);
}

function updateChrome(bump) {
  const count = cartCount();
  const badge = document.getElementById("cart-count");
  badge.textContent = String(count);
  document.querySelector(".cart-link").setAttribute(
    "aria-label",
    `Cart, ${count} ${count === 1 ? "item" : "items"}`,
  );
  if (bump) {
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
  }
  syncAccount();
  document.getElementById("deliver-city").textContent = getLocation();
  const route = parseRoute();
  const dept = route.parts[0] === "c" ? route.parts[1] : "";
  const home = !route.parts[0];
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const on = link.dataset.nav === "" ? home : link.dataset.nav === dept;
    link.classList.toggle("is-current", on);
  });
  const search = document.getElementById("search-input");
  search.setAttribute("aria-label", "Search BestBye");
}

function qtyNear(node) {
  const scope = node.closest(".buy-box, .hero-copy, .card, .line-actions");
  const select = scope && scope.querySelector("select.qty, #pdp-qty");
  const qty = select ? Number(select.value) : 1;
  if (!Number.isFinite(qty) || qty < 1) return 1;
  return Math.min(3, Math.floor(qty));
}

function addToCart(sku, qty) {
  if (!productBySku(sku)) return;
  const cart = getCart();
  const existing = cart.find((line) => line.sku === sku);
  if (existing) existing.qty = Math.min(3, existing.qty + qty);
  else cart.push({ sku, qty: Math.min(3, qty) });
  saveCart(cart);
  updateChrome(true);
  const product = productBySku(sku);
  const toast = document.getElementById("toast");
  toast.hidden = false;
  toast.innerHTML = `<strong>Added to cart</strong><p>${esc(product.item)}</p><a href="#/cart">View cart</a>`;
  clearTimeout(addToCart.timer);
  addToCart.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function showResult(message, ok) {
  const result = document.getElementById("result");
  if (!result) return;
  result.className = ok ? "result is-ok" : "result is-error";
  result.textContent = message;
}

async function placeOrder(form) {
  const result = document.getElementById("result");
  const submit = document.getElementById("submit");
  if (result) {
    result.className = "result";
    result.textContent = "";
  }
  if (!siteUrl) {
    showResult("Missing CONVEX_SITE_URL in config.js.", false);
    return;
  }
  const lines = checkoutLines();
  if (!lines.length) {
    showResult("Your cart is empty.", false);
    return;
  }
  const data = new FormData(form);
  const customer = String(data.get("customer") || "").trim();
  const card = String(data.get("card") || "").trim();
  const location = String(data.get("location") || "").trim();
  const email = String(data.get("email") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const contact = {
    name: String(data.get("contactName") || "").trim(),
    street: String(data.get("street") || "").trim(),
    city: String(data.get("contactCity") || "").trim(),
    state: String(data.get("contactState") || "").trim(),
    zip: String(data.get("zip") || "").trim(),
    ipAddress: String(data.get("ipAddress") || "").trim(),
  };
  if (!customer || !card || !location) {
    showResult("Name, card, and shipping city are required.", false);
    return;
  }

  const buyingDirect = Boolean(getDirect());
  submit.disabled = true;
  submit.textContent = "Placing order…";
  const placed = [];
  try {
    for (const line of lines) {
      const product = productBySku(line.sku);
      const amount = product.amount * line.qty;
      const response = await fetch(`${siteUrl.replace(/\/$/, "")}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          merchant: "BestBye",
          item: product.item,
          amount,
          location,
          email,
          phone,
          contact,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "The order could not be placed.");
      }
      placed.push({
        sku: product.sku,
        item: product.item,
        qty: line.qty,
        amount,
        risky: Boolean(payload.risky),
      });
    }
  } catch (error) {
    const failed = lines[placed.length];
    const product = failed ? productBySku(failed.sku) : null;
    if (placed.length && !buyingDirect) {
      const remaining = getCart().filter((line) => !placed.some((done) => done.sku === line.sku));
      saveCart(remaining);
    }
    const reason = error instanceof Error ? error.message : "The order could not be placed.";
    const charged = placed.map((line) => line.item).join(", ");
    showResult(
      charged
        ? `${charged} went through. ${product ? product.item : "The rest"} did not: ${reason}`
        : reason,
      false,
    );
    submit.disabled = false;
    submit.textContent = lines.length > 1 ? `Place ${lines.length} charges` : "Place your order";
    return;
  }

  const risky = placed.some((line) => line.risky);
  const order = {
    id: "BB" + Date.now().toString().slice(-8),
    placedAt: Date.now(),
    customer,
    location,
    total: placed.reduce((sum, line) => sum + line.amount, 0),
    risky,
    message: risky
      ? "Order placed. Merritt Bank is calling to verify this purchase."
      : "Order placed. This charge matches the card’s usual pattern.",
    lines: placed,
  };
  const orders = getOrders();
  orders.unshift(order);
  sessionStorage.setItem("bestbye-orders", JSON.stringify(orders.slice(0, 6)));
  sessionStorage.setItem("bestbye-customer", customer);
  sessionStorage.setItem("bestbye-location", location);
  sessionStorage.setItem("bestbye-fresh", "1");
  if (buyingDirect) clearDirect();
  else saveCart([]);
  location.hash = "#/orders";
}

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.getElementById("search-input").value.trim();
  location.hash = query ? `#/search?q=${encodeURIComponent(query)}` : "#/";
});

document.getElementById("loc-pop").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = document.getElementById("loc-input").value.trim();
  if (!value) return;
  sessionStorage.setItem("bestbye-location", value);
  document.getElementById("loc-pop").hidden = true;
  document.getElementById("deliver").setAttribute("aria-expanded", "false");
  updateChrome(false);
  const city = document.querySelector('#checkout input[name="location"]');
  if (city) city.value = value;
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest("#deliver")) {
    const pop = document.getElementById("loc-pop");
    pop.hidden = !pop.hidden;
    document.getElementById("deliver").setAttribute("aria-expanded", String(!pop.hidden));
    if (!pop.hidden) {
      const input = document.getElementById("loc-input");
      input.value = getLocation();
      input.focus();
    }
    return;
  }

  const pop = document.getElementById("loc-pop");
  if (pop && !pop.hidden && !target.closest("#loc-pop")) {
    pop.hidden = true;
    document.getElementById("deliver").setAttribute("aria-expanded", "false");
  }

  if (target.closest("#back-top")) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (target.closest("#checkout-from-cart")) {
    event.preventDefault();
    clearDirect();
    location.hash = "#/checkout";
    return;
  }

  const add = target.closest("[data-add]");
  if (add) {
    event.preventDefault();
    addToCart(add.dataset.add, qtyNear(add));
    return;
  }

  const buy = target.closest("[data-buy]");
  if (buy) {
    event.preventDefault();
    setDirect(buy.dataset.buy, qtyNear(buy));
    if ((location.hash || "").startsWith("#/checkout")) render();
    else location.hash = "#/checkout";
    return;
  }

  const remove = target.closest("[data-remove]");
  if (remove) {
    saveCart(getCart().filter((line) => line.sku !== remove.dataset.remove));
    render({ scroll: false });
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.id === "sort") {
    const route = parseRoute();
    const params = new URLSearchParams(route.params);
    if (!target.value || target.value === "featured") params.delete("sort");
    else params.set("sort", target.value);
    const path = "/" + route.parts.join("/");
    const query = params.toString();
    location.hash = `#${path}${query ? `?${query}` : ""}`;
    return;
  }
  const sku = target.getAttribute("data-set-qty");
  if (sku) {
    const qty = Math.min(3, Math.max(1, Number(target.value) || 1));
    const cart = getCart().map((line) => (line.sku === sku ? { sku, qty } : line));
    saveCart(cart);
    render({ scroll: false });
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name === "customer") {
    sessionStorage.setItem("bestbye-customer", target.value);
    syncAccount();
  }
  if (target.name === "location") {
    sessionStorage.setItem("bestbye-location", target.value);
    document.getElementById("deliver-city").textContent = target.value.trim() || "Hobbs, NM";
  }
});

document.addEventListener("submit", (event) => {
  if (event.target instanceof HTMLFormElement && event.target.id === "checkout") {
    event.preventDefault();
    placeOrder(event.target);
  }
});

window.addEventListener("hashchange", () => render());

if (!location.hash) location.hash = "#/";
else render();
