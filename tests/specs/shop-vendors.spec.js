const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REDS = "https://kreweofshamrock2025.itemorder.com/shop/category/107919/";
const STUDIO = "https://studio19shop.com/shop/ols/categories/krewe-of-shamrock";
const PIN = "https://www.zeffy.com/en-US/ticketing/shamrock-pin";

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

async function mockShop(page, vendors, looks) {
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill(cors(null, 204));
      return;
    }
    const name = req.url().split("/rpc/")[1].split("?")[0];
    if (name === "list_public_shop_products") {
      await route.fulfill(cors([
        {
          id: "pin-1",
          name: "Shamrock Pin",
          description: "Picked up at a meeting.",
          price_cents: 1200,
          status: "live",
          sizes: ["One size"],
          zeffy_url: PIN,
          image_url: null,
        },
      ]));
      return;
    }
    if (name === "list_public_shop_vendors") {
      await route.fulfill(cors(vendors));
      return;
    }
    if (name === "list_public_shop_vendor_looks") {
      await route.fulfill(cors(looks));
      return;
    }
    await route.fulfill(cors([]));
  });
}

test("vendor apparel is links and photos, with Krewe Gear unchanged", async ({ page }) => {
  const vendors = [
    {
      id: "reds",
      name: "Red's Team Sports",
      short_name: "Red's",
      store_url: REDS,
      contact_email: "teamstores@redsteamsports.com",
      contact_phone: "813-612-5999",
      showcase_images: [
        "https://cdn.example.com/tee-1.jpg",
        "https://cdn.example.com/tee-2.jpg",
        "javascript:alert(1)",
        "https://cdn.example.com/tee-3.jpg",
        "https://cdn.example.com/tee-4.jpg",
        "https://cdn.example.com/tee-5.jpg",
      ],
      blurb: "Crest tees in green and gold. $15.99 should never show.",
      fulfillment_note: "Shipped to your home.",
      season_label: "2025–26",
      sort_order: 10,
      price_cents: 1599,
    },
    {
      id: "studio",
      name: "Studio 19",
      short_name: "Studio 19",
      store_url: STUDIO,
      blurb: "Tanks and jackets.",
      fulfillment_note: "Shipped to your home.",
      showcase_images: [
        "/assets/img/store/vendor-family-crest-ls.png",
        "../etc/passwd.png",
        "javascript:alert(1)",
      ],
      sort_order: 20,
    },
    {
      id: "bad",
      name: "<script>alert(1)</script>",
      short_name: "Nope",
      store_url: "javascript:alert(1)",
      blurb: "Do not link this.",
      sort_order: 30,
    },
  ];
  const looks = [
    {
      id: "look-1",
      vendor_id: "studio",
      name: "Parade jacket",
      image_url: "https://cdn.example.com/jacket.jpg",
      product_url: "javascript:alert(2)",
      outbound_url: "javascript:alert(2)",
      category: "outerwear",
      price_cents: 4200,
      sort_order: 1,
    },
    {
      id: "look-skip",
      vendor_id: "studio",
      name: "Missing photo",
      image_url: "",
      product_url: "https://studio19shop.com/shop/ols/products/missing",
      category: "womens",
      sort_order: 2,
    },
    {
      id: "look-2",
      vendor_id: "studio",
      name: "Green tank",
      image_url: "https://cdn.example.com/tank.jpg",
      product_url: "https://studio19shop.com/shop/ols/products/tank",
      category: "womens",
      sort_order: 3,
    },
  ];

  await mockShop(page, vendors, looks);
  await page.goto("/store.html");
  await expect(page.locator("#shopGrid .product")).toHaveCount(1);
  await expect(page.locator("#shopGrid")).toContainText("$12.00");
  await expect(page.locator("#shopGrid a.add")).toHaveAttribute("href", PIN);

  const vendorsSection = page.locator("#vendors");
  await expect(vendorsSection).toBeVisible();
  await expect(vendorsSection).toContainText("Apparel from our vendors");
  await expect(vendorsSection).toContainText("Prices are on their site.");
  await expect(vendorsSection).not.toContainText("$");
  await expect(vendorsSection).not.toContainText("Add to Cart");
  await expect(vendorsSection).not.toContainText("Buy now");
  await expect(vendorsSection.locator("select")).toHaveCount(0);
  await expect(vendorsSection.locator("[data-add]")).toHaveCount(0);
  await expect(vendorsSection.locator(".price")).toHaveCount(0);

  const reds = vendorsSection.locator("a.vendor-tile").first();
  await expect(reds).toHaveAttribute("href", REDS);
  await expect(reds).toHaveAttribute("target", "_blank");
  await expect(reds).toHaveAttribute("rel", "noopener noreferrer");
  await expect(reds).toContainText("Order from Red's");
  await expect(reds).toContainText("+2 more");
  await expect(reds.locator("img")).toHaveCount(3);
  await expect(vendorsSection.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(vendorsSection.locator('img[src^="javascript:"]')).toHaveCount(0);
  await expect(vendorsSection.locator('img[src="/assets/img/store/vendor-family-crest-ls.png"]')).toHaveCount(1);
  await expect(vendorsSection.locator('img[src*="passwd"]')).toHaveCount(0);

  const looksGrid = vendorsSection.locator(".vendor-look");
  await expect(looksGrid).toHaveCount(2);
  await expect(looksGrid.nth(0)).toContainText("Order from Studio 19");
  await expect(looksGrid.nth(0).locator("a")).toHaveAttribute("href", STUDIO);
  await expect(looksGrid.nth(1).locator("a")).toHaveAttribute("href", "https://studio19shop.com/shop/ols/products/tank");
  await expect(looksGrid.nth(1).locator("a")).toHaveAttribute("target", "_blank");
  await expect(vendorsSection.locator(".vendor-tile-plain")).toContainText("http:// or https://");
  await expect(vendorsSection.locator("h3", { hasText: "alert(1)" })).toBeVisible();
  await expect(vendorsSection.locator("script")).toHaveCount(0);

  const studioSrc = fs.readFileSync(path.join(__dirname, "../../assets/kos-shop-studio.js"), "utf8");
  const shopSql = fs.readFileSync(path.join(__dirname, "../../sql/kos_shop_studio.sql"), "utf8");
  expect(studioSrc).not.toMatch(/shop_vendor/);
  expect(shopSql).not.toMatch(/shop_vendor/);
});
