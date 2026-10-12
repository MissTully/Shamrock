// Tartan Ball ticket deadline badge: homepage, sign-in, and both hubs.
// Hides after the end of October 15, 2026 America/New_York.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const LABEL = "Tartan Ball ticket deadline of October 15!";

function freezeClock(iso) {
  return ({ iso }) => {
    const RealDate = Date;
    const fixed = new RealDate(iso).getTime();
    function MockDate() {
      if (!(this instanceof MockDate)) {
        return RealDate.apply(null, arguments).toString();
      }
      if (arguments.length === 0) return new RealDate(fixed);
      return new RealDate(...arguments);
    }
    MockDate.now = function () { return fixed; };
    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    MockDate.prototype = RealDate.prototype;
    window.Date = MockDate;
  };
}

test("homepage shows the deadline in the hero, clear of the gold tickets control", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/index.html");
  const badge = page.locator("header.hero a.tartan-deadline");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(LABEL);
  await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
  await expect(page.locator("nav.krewe-nav a.tartan-deadline")).toHaveCount(0);
  const tickets = page.locator("nav.krewe-nav > .nav-ball-row > a.nav-ball");
  await expect(tickets).toBeVisible();
  const gap = await page.evaluate(() => {
    const goldEl = document.querySelector("nav.krewe-nav > .nav-ball-row > a.nav-ball");
    const link = document.querySelector("header.hero a.tartan-deadline");
    const gold = goldEl.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    const hero = document.querySelector("header.hero").getBoundingClientRect();
    return {
      gap: box.top - gold.bottom,
      badgeTop: box.top,
      heroTop: hero.top,
      weight: getComputedStyle(link).fontWeight
    };
  });
  expect(gap.gap).toBeGreaterThanOrEqual(12);
  expect(gap.badgeTop).toBeLessThan(gap.heroTop + 160);
  expect(Number(gap.weight)).toBeGreaterThanOrEqual(700);
  await badge.click();
  await expect(page).toHaveURL(/\/tartan-ball\.html$/);
  assertHealthy(expect, report, "homepage deadline badge");
});

test("deadline badge hides after the end of October 15, 2026 New York", async ({ page }) => {
  await page.addInitScript(freezeClock("2026-10-16T04:00:00.000Z"), { iso: "2026-10-16T04:00:00.000Z" });
  await page.goto("/index.html");
  const badge = page.locator("[data-tartan-deadline]");
  await expect(badge).toBeAttached();
  await expect(badge).toBeHidden();
  const open = await page.evaluate(() => window.kosTartanDeadlineOpen(new Date("2026-10-16T03:59:00.000Z")));
  expect(open).toBe(true);
  const closed = await page.evaluate(() => window.kosTartanDeadlineOpen(new Date("2026-10-16T04:00:00.000Z")));
  expect(closed).toBe(false);
});

test.describe("signed-out hub", () => {
  test("phone and the castle door show the deadline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/members.html");
    const badge = page.locator("#authStage a.tartan-deadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(LABEL);
    await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
    const box = await badge.boundingBox();
    expect(box.y).toBeLessThan(520);
    expect(box.width).toBeGreaterThan(200);
  });
});

test.describe("signed-in hubs", () => {
  test("desktop hub shows the deadline under the tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await unlockMemberHub(page);
    const badge = page.locator("#hubTartanDeadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(LABEL);
    await expect(page.locator("#appTartanDeadline")).toHaveCount(0);
    const welcome = await page.locator("#hubWelcomeCard").boundingBox();
    const box = await badge.boundingBox();
    expect(box.y).toBeLessThan(welcome.y);
  });

  test("phone app shell shows the deadline at the top of home", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await unlockMemberHub(page);
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    const badge = page.locator("#appTartanDeadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(LABEL);
    await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
    await expect(page.locator("#hubTartanDeadline")).toHaveCount(0);
    const top = await page.locator("#appTop").boundingBox();
    const box = await badge.boundingBox();
    expect(box.y).toBeGreaterThan(top.y);
    const banner = await page.locator("#hubGetAppBanner").boundingBox();
    expect(box.y).toBeLessThan(banner.y);
  });
});
