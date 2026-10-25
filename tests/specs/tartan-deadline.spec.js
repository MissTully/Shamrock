// Tartan Ball reminders.
// The public ticket deadline badge and the gold Tickets button are retired
// now that the October 24, 2026 ball has passed.
// Member Hub (sign-in and both hubs) still shows a Saturday reminder through
// the end of October 24, then hides it. That badge is an event reminder, not a ticket sale.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const HUB_LABEL = "Tartan Ball is this Saturday, October 24!";
// Noon in New York on Oct 16: the old ticket deadline has passed, the ball has not.
const HUB_STILL_OPEN = "2026-10-16T16:00:00.000Z";

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

test("homepage no longer sells Tartan Ball tickets or shows the October 15 deadline", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/index.html");
  await expect(page.locator("a.nav-ball, .nav-ball-row, a.tartan-deadline, [data-tartan-deadline]")).toHaveCount(0);
  await expect(page.locator('a[href*="tampabaytartanball.com"]')).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/October 15/);
  expect(text.toLowerCase()).not.toContain("ticket deadline");
  expect(text.toLowerCase()).not.toContain("tartan ball tickets");
  assertHealthy(expect, report, "homepage after the ball");
});

test("October 15 cutoff helper still closes after that day in New York", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("[data-tartan-deadline]")).toHaveCount(0);
  const open = await page.evaluate(() => window.kosTartanDeadlineOpen(new Date("2026-10-16T03:59:00.000Z")));
  expect(open).toBe(true);
  const closed = await page.evaluate(() => window.kosTartanDeadlineOpen(new Date("2026-10-16T04:00:00.000Z")));
  expect(closed).toBe(false);
});

test.describe("signed-out hub", () => {
  test("phone and the castle door show the Saturday reminder", async ({ page }) => {
    await page.addInitScript(freezeClock(HUB_STILL_OPEN), { iso: HUB_STILL_OPEN });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/members.html");
    const badge = page.locator("#authStage a.tartan-deadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(HUB_LABEL);
    await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
    const box = await badge.boundingBox();
    expect(box.y).toBeLessThan(520);
    expect(box.width).toBeGreaterThan(200);
  });
});

test("member hub reminder hides after the end of October 24, 2026 New York", async ({ page }) => {
  await page.addInitScript(freezeClock("2026-10-25T04:00:00.000Z"), { iso: "2026-10-25T04:00:00.000Z" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/members.html");
  const gate = page.locator("#authStage [data-tartan-deadline]");
  await expect(gate).toBeAttached();
  await expect(gate).toBeHidden();
  const stillOpen = await page.evaluate(() => window.kosTartanBallOpen(new Date("2026-10-25T03:59:00.000Z")));
  expect(stillOpen).toBe(true);
  const closed = await page.evaluate(() => window.kosTartanBallOpen(new Date("2026-10-25T04:00:00.000Z")));
  expect(closed).toBe(false);
  await unlockMemberHub(page);
  await expect(page.locator("#hubTartanDeadline")).toHaveCount(0);
});

test.describe("signed-in hubs", () => {
  test("desktop hub shows the Saturday reminder under the tabs", async ({ page }) => {
    await page.addInitScript(freezeClock(HUB_STILL_OPEN), { iso: HUB_STILL_OPEN });
    await page.setViewportSize({ width: 1440, height: 900 });
    await unlockMemberHub(page);
    const badge = page.locator("#hubTartanDeadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(HUB_LABEL);
    await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
    await expect(page.locator("#appTartanDeadline")).toHaveCount(0);
    const welcome = await page.locator("#hubWelcomeCard").boundingBox();
    const box = await badge.boundingBox();
    expect(box.y).toBeLessThan(welcome.y);
  });

  test("phone app shell shows the Saturday reminder at the top of home", async ({ page }) => {
    await page.addInitScript(freezeClock(HUB_STILL_OPEN), { iso: HUB_STILL_OPEN });
    await page.setViewportSize({ width: 390, height: 844 });
    await unlockMemberHub(page);
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    const badge = page.locator("#appTartanDeadline");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(HUB_LABEL);
    await expect(badge).toHaveAttribute("href", "/tartan-ball.html");
    await expect(page.locator("#hubTartanDeadline")).toHaveCount(0);
    const top = await page.locator("#appTop").boundingBox();
    const box = await badge.boundingBox();
    expect(box.y).toBeGreaterThan(top.y);
    const banner = await page.locator("#hubGetAppBanner").boundingBox();
    expect(box.y).toBeLessThan(banner.y);
  });
});
