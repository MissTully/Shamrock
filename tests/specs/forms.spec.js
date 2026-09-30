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

  await expect(page.locator("#appFeeBox")).toContainText("Application fee");
  await expect(page.locator("#appFeeBox")).toContainText("$50");
  await expect(page.locator("#appFeeBox")).toContainText("$75");
  await expect(page.locator("#appFeeBox")).toContainText("not membership dues");
  await expect(page.locator("#joinNextSteps")).toContainText("Someone from the Krewe will call you");
  await expect(page.locator("#joinNextSteps")).toContainText("does not ask for a Social Security number");
  await expect(page.locator("#duesFeeBox")).toContainText("Membership dues");
  await expect(page.locator("#duesFeeBox")).toContainText("$375");
  await expect(page.locator("#appSsn")).toHaveCount(0);
  await expect(page.locator("#partnerSsn")).toHaveCount(0);
  await expect(page.locator("#appForm")).not.toContainText("driver license is the old path");
  await expect(page.locator("#partnerFields")).toBeHidden();
  await page.locator("#feeDual").check();
  await expect(page.locator("#partnerFields")).toBeVisible();
  await expect(page.locator("#partnerFirst")).toHaveAttribute("required", /.*/);
  const html = await page.content();
  expect(html).not.toMatch(/\d{3}-\d{2}-\d{4}/);

  assertHealthy(expect, report, "membership form");
});

test("full application is token gated and checks driver's license above SSN", async ({ page }) => {
  const report = watchPage(page);
  const exact = "The board uses SSN and driver's license for the background check. Your information is held confidentially.";
  await page.goto("/membership-full-application.html");
  await expect(page.locator("#fullForm")).toBeHidden();
  await expect(page.locator("#linkGate")).toContainText("Membership Chair");
  await expect(page.locator("#idConfidentiality")).toHaveText(exact);
  await expect(page.locator("#dlState, #licenseState, [name='dl_state']")).toHaveCount(0);

  await page.goto("/membership-full-application.html?preview=couple");
  await expect(page.locator("#fullForm")).toBeVisible();
  await expect(page.locator("#applicant2")).toBeVisible();
  await expect(page.locator("#feeLine")).toContainText("$75");
  await expect(page.locator("#idConfidentiality")).toHaveText(exact);
  const order = await page.evaluate(() => {
    function follows(a, b) {
      const left = document.getElementById(a);
      const right = document.getElementById(b);
      return !!(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
    }
    return follows("dl1", "ssn1") && follows("dl2", "ssn2") && follows("ssn1", "dl2");
  });
  expect(order).toBe(true);

  await page.locator("#dl1").fill("A1");
  await page.locator("#ssn1").fill("123456789");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("letters and numbers");

  await page.locator("#dl1").fill("fl-12");
  await expect(page.locator("#dl1")).toHaveValue("FL12");
  await page.locator("#ssn1").fill("12345678");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("9 digit");
  await expect(page.locator("#ssn1")).not.toHaveValue(/123-45-6789/);

  await page.locator("#ssn1").fill("123456789");
  await expect(page.locator("#ssn1")).toHaveValue("•••-••-6789");
  await expect(page.locator("#ssn1")).toHaveAttribute("data-digits", "123456789");
  await page.locator("#dl2").fill("B0000000");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("Applicant 2");
  await expect(page.locator("#fullForm")).toBeVisible();

  assertHealthy(expect, report, "full application");
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
