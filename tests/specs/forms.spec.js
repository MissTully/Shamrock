// Regression: form structure and client-side validation.
// These tests never submit valid data — the forms write to the production
// Supabase backend, so we only exercise the browser-side validation path.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

test("membership application: required fields block an empty submit", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/membership-application.html");

  const form = page.locator("#appForm");
  await expect(form).toBeVisible();
  for (const id of ["firstName", "lastName", "email"]) {
    await expect(page.locator("#" + id)).toHaveAttribute("required", /.*/);
  }
  expect(await form.evaluate((f) => f.checkValidity())).toBe(false);

  // a malformed email must also fail validation
  await page.fill("#firstName", "Test");
  await page.fill("#lastName", "Only");
  await page.fill("#email", "not-an-email");
  expect(await page.locator("#email").evaluate((el) => el.checkValidity())).toBe(false);

  assertHealthy(expect, report, "membership form");
});

test("event sign-up: form renders with event picker and required fields", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");

  await expect(page.locator("#event")).toBeVisible();
  for (const id of ["event", "firstName", "lastName", "email"]) {
    await expect(page.locator("#" + id)).toHaveAttribute("required", /.*/);
  }
  const form = page.locator("form").filter({ has: page.locator("#event") }).first();
  expect(await form.evaluate((f) => f.checkValidity())).toBe(false);

  // the calendar shell renders even before/without backend data
  await expect(page.locator("#krewe-calendar")).toBeAttached();

  assertHealthy(expect, report, "event sign-up form");
});

test("members area: shows the auth gate, never the private content", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/members.html");

  await expect(page.locator("#authStage")).toBeAttached();
  // No member-only section should be visible without signing in.
  await page.waitForTimeout(1500);
  const gateVisible = await page.locator("#authStage").isVisible();
  expect(gateVisible, "auth gate should be shown to anonymous visitors").toBe(true);
  assertHealthy(expect, report, "members gate");
});

test("store: cart opens and starts empty", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/store.html");

  await expect(page.locator("#shopGrid")).toBeAttached();
  const cartBtn = page.locator("#cartBtn");
  await expect(cartBtn).toBeVisible();
  await expect(page.locator("#cartCount")).toHaveText(/^0?$/);
  await cartBtn.click();
  await expect(page.locator("#cartPanel")).toBeVisible();
  assertHealthy(expect, report, "store cart");
});
