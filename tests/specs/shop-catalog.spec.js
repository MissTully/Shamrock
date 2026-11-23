// Public shop catalog. Logged-out visitors see live items and open the
// shared KOS Shop in the same tab. No site cart.
const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy } = require("./helpers");

const KOS = "https://www.zeffy.com/en-US/ticketing/kos-shop";
const FLAG = "https://www.zeffy.com/en-US/ticketing/flagged-shop";

function cors(body, status) {
  return {
    status: status || 200,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

const LIVE = {
  id: "pin-live",
  name: "Krewe of Shamrock Tartan Ball Pin 2026",
  description: "Picked up at a meeting.",
  price_cents: 1000,
  status: "live",
  image_url: "https://cdn.example.com/tartan-pin.jpg",
};
const SOON = {
  id: "pin-soon",
  name: "Coming Soon Cap",
  description: "Not for sale yet.",
  price_cents: 1200,
  status: "coming_soon",
  image_url: null,
};
const DRAFT = {
  id: "pin-draft",
  name: "Draft Locker Special",
  price_cents: 500,
  status: "draft",
};
const WAITING = {
  id: "pin-wait",
  name: "Awaiting Hidden Mug",
  price_cents: 250,
  status: "awaiting_zeffy",
};

async function mockShop(page, checkout, products) {
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill(cors(null, 204));
      return;
    }
    const name = req.url().split("/rpc/")[1].split("?")[0];
    if (name === "list_public_shop_products") {
      await route.fulfill(cors(products || [LIVE, SOON, DRAFT, WAITING]));
      return;
    }
    if (name === "list_public_shop_checkout") {
      if (checkout === "error") {
        await route.fulfill(cors({ message: "missing" }, 404));
        return;
      }
      await route.fulfill(cors(checkout == null ? { zeffy_url: "" } : { zeffy_url: checkout }));
      return;
    }
    await route.fulfill(cors([]));
  });
  await page.route("https://www.zeffy.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>KOS Shop</title><p>zeffy shop</p>",
    })
  );
}

test("catalog renders live items logged out and opens the KOS Shop in this tab", async ({ page }) => {
  const report = watchPage(page);
  let popped = false;
  page.on("popup", () => { popped = true; });
  await page.addInitScript(() => localStorage.setItem("kosShopCartV1", "{\"old\":1}"));
  await mockShop(page, null);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/store.html");

  await expect(page.locator("#shopNote")).toContainText("Tap an in-stock item to open the Krewe shop on Zeffy, add everything you want, and check out once.");
  const grid = page.locator("#shopGrid");
  await expect(grid.locator(".product")).toHaveCount(2);
  await expect(grid).toContainText("Krewe of Shamrock Tartan Ball Pin 2026");
  await expect(grid).toContainText("$10.00");
  await expect(grid).toContainText("Coming Soon Cap");
  await expect(grid).toContainText("Coming soon");
  await expect(grid).not.toContainText("Draft Locker Special");
  await expect(grid).not.toContainText("Awaiting Hidden Mug");
  await expect(grid.locator("a")).toHaveCount(1);
  await expect(grid.locator("article.product-soon")).toHaveCount(1);
  await expect(grid.locator("article.product-soon a")).toHaveCount(0);

  const card = grid.locator("a.product");
  await expect(card).toHaveAttribute("href", KOS);
  expect(await card.getAttribute("target")).toBeNull();
  await expect(card.locator(".pimg")).toHaveAttribute("style", /tartan-pin\.jpg/);
  await expect(page.locator(".cartbar, #cartPanel, #navCartBtn, #cartBtn, [data-open-cart], button.add")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("kosShopCartV1"))).toBeNull();

  await card.click();
  await expect(page).toHaveURL(KOS);
  expect(popped).toBe(false);
  assertHealthy(expect, report, "shop catalog desktop");
});

test("uses the checkout flag when it is set, and the hardcoded shop when it is missing", async ({ page }) => {
  await mockShop(page, FLAG);
  await page.goto("/store.html");
  await expect(page.locator("#shopGrid a.product")).toHaveAttribute("href", FLAG);

  await mockShop(page, "error");
  await page.goto("/store.html");
  await expect(page.locator("#shopGrid a.product")).toHaveAttribute("href", KOS);
});

test("mobile catalog keeps the item tappable and does not cover the page", async ({ page }) => {
  const report = watchPage(page);
  await mockShop(page, null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/store.html");
  const card = page.locator("#shopGrid a.product");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
  const covered = await page.evaluate(() => {
    const el = document.querySelector("#shopGrid a.product h3");
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + r.height / 2);
    if (!top) return "no hit";
    if (el.contains(top) || top.contains(el)) return false;
    return top.tagName + "." + (top.className || "");
  });
  expect(covered).toBe(false);
  await expect(page.locator(".cartbar, #cartPanel")).toHaveCount(0);
  assertHealthy(expect, report, "shop catalog mobile");
});

test("sold out items are not linked and low stock is labeled", async ({ page }) => {
  const sold = Object.assign({}, LIVE, { id: "pin-sold", name: "Sold Out Pin", stock_on_hand: 0 });
  const low = Object.assign({}, LIVE, { id: "pin-low", name: "Low Stock Pin", stock_on_hand: 3 });
  const open = Object.assign({}, LIVE, { id: "pin-open", name: "Open Stock Pin", stock_on_hand: 12 });
  const untracked = Object.assign({}, LIVE, { id: "pin-free", name: "Untracked Pin", stock_on_hand: null });
  await mockShop(page, null, [sold, low, open, untracked, SOON]);
  await page.goto("/store.html");
  const grid = page.locator("#shopGrid");
  await expect(grid.locator(".product")).toHaveCount(5);
  await expect(grid).toContainText("Sold out");
  await expect(grid).toContainText("Only 3 left");
  await expect(grid).not.toContainText("Only 12 left");
  const soldCard = grid.locator("article.product-soldout");
  await expect(soldCard).toHaveCount(1);
  await expect(soldCard).toContainText("Sold Out Pin");
  await expect(soldCard.locator("a")).toHaveCount(0);
  await expect(grid.locator("a.product")).toHaveCount(3);
  await expect(grid.locator("a.product", { hasText: "Low Stock Pin" })).toHaveAttribute("href", KOS);
  await expect(page.locator("#shopNote")).toContainText("Tap an in-stock item to open the Krewe shop on Zeffy");
});

test("the shop note changes when every live item is sold out", async ({ page }) => {
  const sold = Object.assign({}, LIVE, { stock_on_hand: 0 });
  await mockShop(page, null, [sold, SOON]);
  await page.goto("/store.html");
  await expect(page.locator("#shopNote")).toContainText("listed below is sold out");
  await expect(page.locator("#shopGrid article.product-soldout")).toHaveCount(1);
  await expect(page.locator("#shopGrid a.product")).toHaveCount(0);
});
