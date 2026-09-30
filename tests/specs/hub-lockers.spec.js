const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range"
};

async function fulfillJson(route, body) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: CORS,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

test("Member desk locker card shows your locker and open lockers", async ({ page }) => {
  const report = watchPage(page);
  await page.route("**/rest/v1/rpc/my_locker_board", (route) => fulfillJson(route, {
    ok: true,
    mine: [{ code: "RS1", size: "small", owner_name: "Tim Fitz", cost_cents: 7500, paid: true, status: "assigned" }],
    open: [
      { code: "LL2", size: "large", cost_cents: 20000 },
      { code: "RS10", size: "small", cost_cents: 7500 },
      { code: "RS14", size: "small", cost_cents: 0 }
    ]
  }));

  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await expect(page.locator("#lockerCard")).toBeVisible();
  await expect(page.locator("#lockerForm")).toHaveCount(0);
  await expect(page.locator("#lockerBody")).toContainText("Your locker");
  await expect(page.locator("#lockerBody")).toContainText("RS1");
  await expect(page.locator("#lockerBody")).toContainText("Paid");
  await expect(page.locator("#lockerBody")).toContainText("LL2");
  await expect(page.locator("#lockerBody")).toContainText("RS14");
  await expect(page.locator("#lockerBody")).not.toContainText("Chuck Powers");
  assertHealthy(expect, report, "member locker card");
});

test("Officer desk includes the locker board", async ({ page }) => {
  const report = watchPage(page);
  await page.route("**/rest/v1/rpc/is_krewe_officer", (route) => fulfillJson(route, true));
  await page.route("**/rest/v1/locker_units*", (route) => fulfillJson(route, [
    { code: "LL1", size: "large", owner_name: "Lisa & Stephanie", member_id: null, co_member_id: null, cost_cents: 20000, paid: false, status: "assigned", notes: "Unmatched on purpose.", sort_key: 1001 },
    { code: "LL2", size: "large", owner_name: null, member_id: null, co_member_id: null, cost_cents: 20000, paid: false, status: "open", notes: null, sort_key: 1002 },
    { code: "RS1", size: "small", owner_name: "Tim Fitz", member_id: "f552c5a0-c1dc-48c3-942f-cfbb99d95dbc", co_member_id: null, cost_cents: 7500, paid: true, status: "assigned", notes: null, sort_key: 3001 }
  ]));
  await page.route("**/rest/v1/rpc/officer_locker_requests", (route) => fulfillJson(route, [
    { id: "4f4f4bdc-4488-47d5-958e-e1230f25feb6", size: "large", holder_name: "Kelly Kelly", holder_email: "kellykmk8@gmail.com", notes: "I had paid for a large locker a couple of months ago", status: "requested", created_at: "2026-09-15T18:27:43Z" }
  ]));
  await page.route("**/rest/v1/rpc/officer_locker_roster", (route) => fulfillJson(route, [
    { id: "f552c5a0-c1dc-48c3-942f-cfbb99d95dbc", first_name: "Tim", last_name: "Fitzpatrick", membership_status: "active" },
    { id: "11fd6285-7ead-4790-b573-db2744742ecd", first_name: "Douglas", last_name: "Tully", membership_status: "active" }
  ]));

  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.locator('[data-hub-tab="officer"]').click();
  await expect(page.locator("#deskOff-lockers")).toBeAttached();
  await page.locator('#deskOff-lockers [data-tool="tool:hubLockers"]').click();
  await expect(page.locator("#hubLockers")).toBeVisible();
  await expect(page.locator("#hubLockerList")).toContainText("LL1");
  await expect(page.locator("#hubLockerList")).toContainText("Lisa & Stephanie");
  await expect(page.locator("#hubLockerList")).toContainText("Requests still waiting");
  await expect(page.locator("#hubLockerList")).toContainText("large locker");
  assertHealthy(expect, report, "officer locker board");
});
