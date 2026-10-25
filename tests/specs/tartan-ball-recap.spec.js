// After October 24, 2026 the public Tartan Ball page is a recap.
// No ticket purchase language, and Melissa's two 2026 photos sit with the older ones.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

test("tartan ball page celebrates the night and does not sell tickets", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tartan-ball.html");

  await expect(page.getByRole("heading", { name: "The Tartan Ball" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Night We Gathered" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From the Floor" })).toBeVisible();
  await expect(page.getByText("Saturday, October 24, 2026").first()).toBeVisible();
  await expect(page.getByText("Higgins Hall").first()).toBeVisible();
  await expect(page.getByText("secretary@kreweofshamrock.com").first()).toBeVisible();

  const text = await page.locator("body").innerText();
  expect(text.toLowerCase()).not.toContain("buy ticket");
  expect(text.toLowerCase()).not.toContain("purchase");
  expect(text).not.toContain("October 15");
  expect(text.toLowerCase()).not.toContain("last day");
  expect(text.toLowerCase()).not.toContain("cordially invited");
  expect(text.toLowerCase()).not.toContain("seats are limited");
  await expect(page.locator('a[href*="tampabaytartanball.com"]')).toHaveCount(0);
  await expect(page.locator('a[href*="zeffy.com"]')).toHaveCount(0);

  const dance = page.locator('img[src*="ball-2026-dance-floor.jpg"]');
  const stage = page.locator('img[src*="ball-2026-stage.jpg"]');
  await expect(dance).toBeVisible();
  await expect(stage).toBeVisible();
  await expect(page.locator('img[src*="ball-couple.jpg"]')).toBeVisible();
  await expect(page.locator('img[src*="ball-dining.jpg"]')).toBeVisible();
  await expect(page.locator('img[src*="ball-ballroom.jpg"]')).toHaveCount(1);
  await expect(page.locator('img[src*="FB_IMG_1780505403465.jpg"]')).toBeVisible();

  const danceBox = await dance.boundingBox();
  const stageBox = await stage.boundingBox();
  expect(danceBox.width).toBeGreaterThan(280);
  expect(stageBox.width).toBeGreaterThan(200);
  expect(danceBox.height).toBeGreaterThan(160);
  expect(stageBox.height).toBeGreaterThan(200);

  assertHealthy(expect, report, "tartan ball recap");
});

test("tartan ball recap stacks the new photos on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tartan-ball.html");
  const dance = page.locator('img[src*="ball-2026-dance-floor.jpg"]');
  const stage = page.locator('img[src*="ball-2026-stage.jpg"]');
  await dance.scrollIntoViewIfNeeded();
  await expect(dance).toBeVisible();
  await expect(stage).toBeVisible();
  const danceBox = await dance.boundingBox();
  const stageBox = await stage.boundingBox();
  expect(danceBox.width).toBeGreaterThan(300);
  expect(stageBox.width).toBeGreaterThan(300);
  expect(stageBox.y).toBeGreaterThan(danceBox.y + danceBox.height - 4);
  const text = await page.locator("body").innerText();
  expect(text.toLowerCase()).not.toContain("buy ticket");
  expect(text).not.toContain("October 15");
});
