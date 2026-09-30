// Regression: interactive behavior — navigation dropdowns, the mobile
// drawer, and the music player toggle.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

test.describe("desktop navigation", () => {
  test("dropdown opens on click, closes on Escape and outside click", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/index.html");

    const events = page.locator(".nav-group", { has: page.getByRole("button", { name: /Events/ }) }).first();
    const btn = events.locator(".nav-group-btn");
    await btn.click();
    await expect(events).toHaveClass(/open/);
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(events.getByRole("link", { name: "Parades" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(events).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute("aria-expanded", "false");

    // opening one group then clicking another closes the first
    await btn.click();
    const about = page.locator(".nav-group", { has: page.getByRole("button", { name: /About/ }) }).first();
    await about.locator(".nav-group-btn").click();
    await expect(about).toHaveClass(/open/);
    await expect(events).not.toHaveClass(/open/);

    await page.locator("h1").click(); // outside click closes
    await expect(about).not.toHaveClass(/open/);
    assertHealthy(expect, report, "desktop nav");
  });

  test("dropdown links navigate to the right page", async ({ page }) => {
    await page.goto("/index.html");
    await page.getByRole("button", { name: /Get Involved/ }).click();
    await page.getByRole("link", { name: "Volunteer" }).click();
    await expect(page).toHaveURL(/volunteer\.html$/);
    await page.getByRole("link", { name: "Member Hub Login" }).click();
    await expect(page).toHaveURL(/members\.html$/);
    await expect(page).toHaveTitle(/Members/);
  });
});

test.describe("Member Hub Login header control", () => {
  test("sits in the top-left of the header on desktop and on a phone", async ({ page }) => {
    await page.goto("/index.html");
    const hub = page.locator("nav.krewe-nav > a.nav-hub");
    const brand = page.locator("nav.krewe-nav .brand");
    await expect(hub).toBeVisible();
    await expect(hub).toHaveAttribute("href", "members.html");
    await expect(hub).toHaveText("Member Hub Login");
    await expect(page.locator("#kreweMenu").getByRole("link", { name: "Member Hub Login" })).toHaveCount(0);

    const desktop = await page.evaluate(() => {
      const hubEl = document.querySelector("nav.krewe-nav > a.nav-hub");
      const brandEl = document.querySelector("nav.krewe-nav .brand");
      const hb = hubEl.getBoundingClientRect();
      const bb = brandEl.getBoundingClientRect();
      return { hx: hb.x, hy: hb.y, bx: bb.x, by: bb.y };
    });
    expect(desktop.hx).toBeLessThan(desktop.bx);
    expect(Math.abs(desktop.hy - desktop.by)).toBeLessThan(20);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hub).toBeVisible();
    await expect(page.locator("#kreweNavToggle")).toBeVisible();
    const phone = await page.evaluate(() => {
      const hubEl = document.querySelector("nav.krewe-nav > a.nav-hub");
      const brandEl = document.querySelector("nav.krewe-nav .brand");
      const navEl = document.querySelector("nav.krewe-nav");
      const hb = hubEl.getBoundingClientRect();
      const bb = brandEl.getBoundingClientRect();
      const nb = navEl.getBoundingClientRect();
      return { hx: hb.x, hy: hb.y, bx: bb.x, by: bb.y, ny: nb.y, height: hb.height };
    });
    expect(phone.hx).toBeLessThan(40);
    expect(phone.hy).toBeLessThan(phone.by);
    expect(phone.hy).toBeLessThan(phone.ny + 24);
    expect(phone.height).toBeGreaterThanOrEqual(44);

    const hero = page.locator("header.hero");
    await expect(hero.getByRole("link", { name: "Buy Tartan Ball Tickets" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Become a Member" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "RSVP to an Event" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Access previous site" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "TARTAN BALL tickets", exact: true })).toBeVisible();
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 400, height: 800 } });

  test("hamburger opens the drawer; backdrop closes it", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/index.html");

    const nav = page.locator("nav.krewe-nav");
    const toggle = page.locator("#kreweNavToggle");
    await expect(toggle).toBeVisible();
    await expect(page.locator("#kreweMenu")).not.toBeInViewport();

    await toggle.click();
    await expect(nav).toHaveClass(/open/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#kreweMenu")).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains("nav-open"))).toBe(true);

    await page.locator(".nav-backdrop").click({ position: { x: 5, y: 400 }, force: true });
    await expect(nav).not.toHaveClass(/open/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    assertHealthy(expect, report, "mobile nav");
  });

  test("choosing a link closes the drawer and navigates", async ({ page }) => {
    await page.goto("/index.html");
    await page.locator("#kreweNavToggle").click();
    await page.locator("#kreweMenu").getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/index\.html$/);
    await expect(page.locator("nav.krewe-nav")).not.toHaveClass(/open/);
  });
});

test.describe("music player", () => {
  test("toggle keeps aria state consistent with the audio element", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/index.html");
    const btn = page.locator("#kreweMusicBtn");
    const audio = page.locator("#kreweAudio");

    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    // Playback may be denied in some environments; the invariant is that the
    // UI state always matches the element state, in both outcomes.
    await page.waitForTimeout(1000);
    const paused = await audio.evaluate((a) => a.paused);
    await expect(btn).toHaveAttribute("aria-pressed", paused ? "false" : "true");

    if (!paused) {
      expect(await audio.evaluate((a) => a.loop)).toBe(true);
      expect(await audio.evaluate((a) => Math.round(a.volume * 100))).toBe(18);
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "false");
      expect(await audio.evaluate((a) => a.paused)).toBe(true);
    }
    assertHealthy(expect, report, "music player");
  });
});
