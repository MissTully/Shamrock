// Associate intent on the public Join form. The route is aborted, so nothing
// is written to the live database. Fixture people and example.com only.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy } = require("./helpers");

const PREVIEW = path.join(__dirname, "../../docs/preview/membership-training-fixes");
fs.mkdirSync(PREVIEW, { recursive: true });

async function fillJane(page) {
  await page.fill("#firstName", "Jane");
  await page.fill("#lastName", "Sample");
  await page.fill("#email", "jane.sample@example.com");
  await page.fill("#phone", "813-555-0140");
  await page.fill("#street", "10 Sample Lane");
  await page.fill("#city", "Tampa");
  await page.fill("#state", "FL");
  await page.fill("#zip", "33602");
}

test("associate join link shows the level line and can clear it", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/membership-application.html?level=associate");
  const line = page.locator("#applyLevel");
  await expect(line).toBeVisible();
  await expect(line).toContainText("Applying for: Associate membership ($450, one year, two parades of your choice)");
  await expect(page.locator("#clearLevel")).toHaveText("Change to Full membership");
  await expect(page.locator("#applySingle")).toBeChecked();
  await expect(page.locator("#partnerFields")).toBeHidden();
  await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
  await page.locator(".form-card").screenshot({
    path: path.join(PREVIEW, "02-associate-join-line.png"),
    animations: "disabled"
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(line).toBeVisible();
  await page.locator(".form-card").screenshot({
    path: path.join(PREVIEW, "02-associate-join-line-phone.png"),
    animations: "disabled"
  });
  await page.locator("#clearLevel").click();
  await expect(line).toBeHidden();
  await expect(page).toHaveURL(/membership-application\.html$/);
  assertHealthy(expect, report, "associate join line");
});

test("associate join posts p_membership_level and a plain URL posts null", async ({ page }) => {
  const report = watchPage(page);
  let body = null;
  await page.route("**/rest/v1/rpc/submit_membership_application", async (route) => {
    body = route.request().postDataJSON();
    await route.abort();
  });
  await page.goto("/membership-application.html?level=associate");
  await fillJane(page);
  await page.locator("#submitBtn").click();
  await expect.poll(() => body && body.p_membership_level).toBe("associate");
  expect(body.p_fee_type).toBe("single");
  expect(body.p_email).toBe("jane.sample@example.com");
  expect(body.p_partner_first).toBeNull();

  body = null;
  await page.goto("/membership-application.html");
  await expect(page.locator("#applyLevel")).toBeHidden();
  await fillJane(page);
  await page.locator("#submitBtn").click();
  await expect.poll(() => body).not.toBeNull();
  expect(body.p_membership_level).toBeNull();
  expect(body.p_fee_type).toBe("single");
  assertHealthy(expect, report, "associate join payload");
});

test("couple Join flow is unchanged on a plain URL", async ({ page }) => {
  const report = watchPage(page);
  let body = null;
  await page.route("**/rest/v1/rpc/submit_membership_application", async (route) => {
    body = route.request().postDataJSON();
    await route.abort();
  });
  await page.goto("/membership-application.html");
  await expect(page.locator("#applyLevel")).toBeHidden();
  await page.locator("#applyCouple").check();
  await expect(page.locator("#partnerFields")).toBeVisible();
  await fillJane(page);
  await page.locator("#submitBtn").click();
  expect(body, "a couple without a partner name must not submit").toBeNull();
  await page.fill("#partnerFirst", "John");
  await page.fill("#partnerLast", "Sample");
  await page.fill("#partnerEmail", "john.sample@example.com");
  await page.fill("#partnerPhone", "813-555-0141");
  await page.locator("#submitBtn").click();
  await expect.poll(() => body).not.toBeNull();
  expect(body.p_fee_type).toBe("couple");
  expect(body.p_partner_first).toBe("John");
  expect(body.p_partner_last).toBe("Sample");
  expect(body.p_partner_email).toBe("john.sample@example.com");
  expect(body.p_partner_phone).toBe("813-555-0141");
  expect(body.p_membership_level).toBeNull();
  expect(body).not.toHaveProperty("p_ssn");
  expect(body).not.toHaveProperty("p_partner_ssn");
  assertHealthy(expect, report, "couple join unchanged");
});
