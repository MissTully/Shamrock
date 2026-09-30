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
    await page.locator("#kreweMenu").getByRole("link", { name: "Volunteer" }).click();
    await expect(page).toHaveURL(/volunteer\.html$/);
    await page.getByRole("link", { name: "Member Hub Login" }).click();
    await expect(page).toHaveURL(/members\.html$/);
    await expect(page).toHaveTitle(/Members/);
  });
});

test.describe("Member Hub Login header control", () => {
  test("sits in the top-left of the header on desktop and on a phone", async ({ page }) => {
    await page.goto("/index.html");
    const hub = page.locator("nav.krewe-nav a.nav-hub");
    const brand = page.locator("nav.krewe-nav .brand");
    await expect(hub).toBeVisible();
    await expect(hub).toHaveAttribute("href", "members.html");
    await expect(hub).toHaveText("Member Hub Login");
    await expect(page.locator("#kreweMenu").getByRole("link", { name: "Member Hub Login" })).toHaveCount(0);

    const desktop = await page.evaluate(() => {
      const hubEl = document.querySelector("nav.krewe-nav a.nav-hub");
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
      const hubEl = document.querySelector("nav.krewe-nav a.nav-hub");
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
    await expect(hero.getByRole("link", { name: "Buy Tartan Ball Tickets" })).toHaveCount(0);
    await expect(hero.getByRole("link", { name: "Become a Member" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "RSVP to an Event" })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Access previous site" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "TARTAN BALL tickets", exact: true })).toHaveCount(0);
    const headerTickets = page.locator("nav.krewe-nav > .nav-ball-row > a.nav-ball");
    await expect(headerTickets).toBeVisible();
    await expect(headerTickets).toHaveAttribute("aria-label", "Buy Tartan Ball Tickets");
  });
});

test.describe("header auth toggle", () => {
  const STORAGE_KEY = "sb-oazwkwflgbthojvnclfc-auth-token";

  test("logged out header stays Member Hub Login and opens Hub sign-in", async ({ page }) => {
    await page.goto("/index.html");
    const hub = page.locator("nav.krewe-nav a.nav-hub");
    await expect(hub).toHaveText("Member Hub Login");
    await expect(hub).toHaveAttribute("href", "members.html");
    await expect(hub).toHaveAttribute("data-kos-auth", "in");
    await hub.click();
    await expect(page).toHaveURL(/members\.html$/);
    await expect(page.locator("nav.krewe-nav a.nav-hub")).toHaveText("Member Hub Login");
  });

  test("an expired access token with a refresh token still shows Log out", async ({ page }) => {
    await page.addInitScript(({ key, expiresAt }) => {
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: expiresAt,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "melissa@example.com" }
      }));
    }, { key: STORAGE_KEY, expiresAt: Math.floor(Date.now() / 1000) - 120 });

    await page.goto("/index.html");
    const homeHub = page.locator("nav.krewe-nav a.nav-hub");
    await expect(homeHub).toHaveText("Log out");
    await expect(homeHub).toHaveAttribute("data-kos-auth", "out");

    await page.goto("/gallery.html");
    await expect(page.locator("nav.krewe-nav a.nav-hub")).toHaveText("Log out");
  });

  test("members.html header shows Log out while the Hub session exists", async ({ page }) => {
    await page.addInitScript(({ key, expiresAt }) => {
      localStorage.setItem("kosLepWelcomeSeen", "1");
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: expiresAt,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "melissa@example.com" }
      }));
    }, { key: STORAGE_KEY, expiresAt: Math.floor(Date.now() / 1000) + 3600 });

    await page.goto("/members.html#home");
    const hub = page.locator("nav.krewe-nav a.nav-hub");
    await expect(hub).toHaveText("Log out");
    await expect(hub).toHaveAttribute("data-kos-auth", "out");
    await page.waitForTimeout(1500);
    await expect(hub).toHaveText("Log out");
  });

  test("Log out on the home header clears the Hub session", async ({ page }) => {
    await page.addInitScript((key) => {
      if (sessionStorage.getItem("kosHeaderSeeded") === "1") return;
      sessionStorage.setItem("kosHeaderSeeded", "1");
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "melissa@example.com" }
      }));
      window.__kosSb = {
        auth: {
          getSession: function () {
            return Promise.resolve({ data: { session: { access_token: "test-access-token" } }, error: null });
          },
          onAuthStateChange: function () {
            return { data: { subscription: { unsubscribe: function () {} } } };
          },
          signOut: function () {
            localStorage.removeItem(key);
            return Promise.resolve({ error: null });
          }
        }
      };
    }, STORAGE_KEY);

    await page.goto("/index.html");
    const hub = page.locator("nav.krewe-nav a.nav-hub");
    await expect(hub).toHaveText("Log out");
    await hub.click();
    await expect(page).toHaveURL(/index\.html$/);
    await expect(page.locator("nav.krewe-nav a.nav-hub")).toHaveText("Member Hub Login");
    await expect(page.locator("nav.krewe-nav a.nav-hub-return")).toHaveCount(0);
    const stillStored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stillStored).toBeNull();
  });

  test("signed in, a Member Hub button sits under Log out and returns to the Hub", async ({ page }) => {
    await page.addInitScript(({ key, expiresAt }) => {
      localStorage.setItem("kosLepWelcomeSeen", "1");
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: expiresAt,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "melissa@example.com" }
      }));
    }, { key: STORAGE_KEY, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    await page.route("**/*supabase.co/**", (route) => route.fulfill({ status: 204, body: "" }));

    const stackPositions = () => page.evaluate(() => {
      const out = document.querySelector("nav.krewe-nav a.nav-hub").getBoundingClientRect();
      const back = document.querySelector("nav.krewe-nav a.nav-hub-return").getBoundingClientRect();
      return { outX: out.x, outBottom: out.bottom, backX: back.x, backTop: back.top, backHeight: back.height };
    });

    for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto("/gallery.html");
      const logout = page.locator("nav.krewe-nav a.nav-hub");
      const back = page.locator("nav.krewe-nav a.nav-hub-return");
      await expect(logout).toHaveText("Log out");
      await expect(back).toBeVisible();
      await expect(back).toHaveText("Member Hub");
      await expect(back).toHaveAttribute("href", "members.html");
      await expect(back).toHaveAccessibleName("Return to the Member Hub");
      const pos = await stackPositions();
      expect(pos.backTop).toBeGreaterThanOrEqual(pos.outBottom);
      expect(Math.abs(pos.backX - pos.outX)).toBeLessThan(2);
      expect(pos.backHeight).toBeGreaterThanOrEqual(24);
    }

    await page.locator("nav.krewe-nav a.nav-hub-return").click();
    await expect(page).toHaveURL(/members\.html$/);
    await expect(page.locator("nav.krewe-nav a.nav-hub")).toHaveText("Log out");
    await expect(page.locator("nav.krewe-nav a.nav-hub-return")).toHaveCount(0);
  });

  test("Log out on members.html uses the Hub sign-out path", async ({ page }) => {
    await page.addInitScript((key) => {
      if (sessionStorage.getItem("kosHeaderSeeded") === "1") return;
      sessionStorage.setItem("kosHeaderSeeded", "1");
      localStorage.setItem("kosLepWelcomeSeen", "1");
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "melissa@example.com" }
      }));
    }, STORAGE_KEY);
    await page.route("**/*supabase.co/**", (route) => route.fulfill({ status: 204, body: "" }));

    await page.goto("/members.html#home");
    const hub = page.locator("nav.krewe-nav a.nav-hub");
    await expect(hub).toHaveText("Log out");
    await hub.click();
    await expect(page.locator("nav.krewe-nav a.nav-hub")).toHaveText("Member Hub Login", { timeout: 15000 });
    const stillStored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stillStored).toBeNull();
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
