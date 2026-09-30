// Shop Studio product actions must stay inside the card.
// Offline fixture rows only. This does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const ROW = (name, meta, badge, buttons) =>
  `<div class="hub-shop-row"><div class="hub-shop-meta"><b>${name}</b><div class="muted">${meta}</div><div class="muted"><span class="hub-shop-badge ${badge}">${badge}</span></div></div><div class="hub-shop-actions">${buttons}</div><div class="qr-slot" data-qr-slot="x" style="flex-basis:100%;margin-top:8px"></div></div>`;

const FOUR =
  '<button class="btn" type="button">Edit</button><button class="btn btn-primary" type="button">▦ Shop QR</button><button class="btn" type="button">Mark awaiting Zeffy</button><button class="btn btn-danger" type="button">Delete</button>';
const FIVE =
  FOUR.replace(
    "</button><button class=\"btn btn-danger\"",
    '</button><button class="btn" type="button">Attach Zeffy link</button><button class="btn btn-danger"'
  );

async function paintShop(page) {
  await unlockMemberHub(page);
  await page.waitForFunction(() => !!document.getElementById("kosShopStudioCss"));
  await page.evaluate(({ four, five }) => {
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      panel.classList.toggle("hub-on", panel.getAttribute("data-hub-panel") === "officer");
    });
    const host = document.getElementById("hubOfficer");
    const card = document.createElement("section");
    card.className = "app-card";
    card.id = "hubShopStudio";
    card.innerHTML =
      '<div class="app-head"><span class="ic">🛍️</span><div><h2>Shop Studio</h2><small>Create products — then make a Shop QR for the bar or float</small></div></div>' +
      '<div class="app-body"><div class="hub-shop-list"><h3>Products</h3><div id="hubShopList"></div></div>' +
      '<div class="hub-shop-form"><h3>Edit product</h3><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn btn-primary" type="button">☘ Save product</button>' +
      '<button class="btn" type="button">New / clear</button>' +
      '<button class="btn btn-danger" type="button">Delete product</button></div></div></div>';
    host.prepend(card);
    document.getElementById("hubShopList").innerHTML =
      four + five;
  }, {
    four: ROW("Lucky Leprechaun Tee", "$25.00 · S, M, L, XL, 2XL · Zeffy linked", "live", FOUR),
    five: ROW("Krewe of Shamrock Pin", "Price TBA · One size", "draft", FIVE),
  });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#hubShopStudio").scrollIntoViewIfNeeded();
}

async function buttonsOutsideCard(page) {
  return page.evaluate(() => {
    const card = document.getElementById("hubShopStudio").getBoundingClientRect();
    return [...document.querySelectorAll("#hubShopStudio .btn")].filter((button) => {
      const box = button.getBoundingClientRect();
      return box.width < 2 || box.left < card.left - 1 || box.right > card.right + 1;
    }).map((button) => button.textContent.trim());
  });
}

test.describe("Shop Studio action buttons stay inside the card", () => {
  test("desktop officer column keeps Edit, Shop QR, Zeffy, and Delete inside the row", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await paintShop(page);
    await expect(page.locator("#hubShopStudio .hub-shop-actions .btn")).toHaveCount(9);
    expect(await buttonsOutsideCard(page)).toEqual([]);
    const script = await page.locator('script[src*="kos-shop-studio.js"]').getAttribute("src");
    const source = await page.evaluate(async (src) => (await fetch(src)).text(), script);
    expect(source).toContain('class="hub-shop-meta"');
    expect(source).not.toContain("flex:none");
    assertHealthy(expect, report, "shop studio desktop layout");
  });

  test("Hub shell and a narrow phone wrap actions instead of clipping Delete", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 800, height: 1100 });
    await paintShop(page);
    expect(await buttonsOutsideCard(page)).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#hubShopStudio").scrollIntoViewIfNeeded();
    expect(await buttonsOutsideCard(page)).toEqual([]);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator("#hubShopStudio").scrollIntoViewIfNeeded();
    expect(await buttonsOutsideCard(page)).toEqual([]);
    assertHealthy(expect, report, "shop studio hub layout");
  });
});
