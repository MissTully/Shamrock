// Guided home-screen install inside the signed-in Member Hub.
// Offline only. This does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.99 Mobile Safari/537.36";
const FACEBOOK_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.34.107;]";

async function mockInstallPrompt(page) {
  await page.evaluate(() => {
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    ev.platforms = ["web"];
    ev.prompt = () => {
      window.dispatchEvent(new Event("appinstalled"));
      return Promise.resolve();
    };
    ev.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    window.dispatchEvent(ev);
  });
}

test.describe("Get the App on Home", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("banner shows when the hub is not installed, above the parade hero", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    const banner = page.locator("#hubGetAppBanner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Get the App");
    await expect(banner).toContainText("Add Shamrock to your home screen.");
    const bannerBox = await banner.boundingBox();
    const heroBox = await page.locator(".app-hero").boundingBox();
    expect(bannerBox.y).toBeLessThan(heroBox.y);
    assertHealthy(expect, report, "get app banner");
  });

  test("dismissing the Home banner sticks, and the Me row stays", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.locator("#hubGetAppDismiss").click();
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem("kosHubGetAppDismissed"));
    expect(stored).toBe("1");

    await page.reload();
    await unlockMemberHub(page);
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    await page.locator('[data-hub-tab="krewe"]').click();
    await expect(page.locator("#hubInstallMe")).toBeVisible();
    await expect(page.locator("#hubInstallMe")).toContainText("Install the app");
    await page.locator("#hubInstallMe").click();
    await expect(page.locator("#appGetApp")).toBeVisible();
    await expect(page.locator("#appBackTitle")).toHaveText("Get the App");
    await page.locator("#appBack").click();
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator("#appDrill")).toBeHidden();
    assertHealthy(expect, report, "dismiss get app banner");
  });

  test("hides the Home banner when the hub is already installed", async ({ page }) => {
    const report = watchPage(page);
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const text = String(query);
        if (text.indexOf("display-mode") !== -1 && text.indexOf("standalone") !== -1) {
          return {
            matches: true,
            media: text,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; }
          };
        }
        return orig(query);
      };
    });
    await unlockMemberHub(page);
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    await page.locator('[data-hub-tab="krewe"]').click();
    const row = page.locator("#hubInstallMe");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator("#appGetApp")).toBeVisible();
    await expect(page.locator("#appGetApp")).toContainText("You're all set");
    await expect(page.locator("#appGetApp")).toContainText("Shamrock icon");
    assertHealthy(expect, report, "standalone hides banner");
  });
});

test.describe("Get the App deep link", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("#get-app opens the screen and Back returns Home", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { hash: "get-app" });
    await page.evaluate(() => {
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    });
    await expect(page.locator("#appGetApp")).toBeVisible();
    await expect(page.locator("#appBack")).toBeVisible();
    await expect(page.locator("#appBack")).toContainText("Back");
    await expect(page.locator("#appBackTitle")).toHaveText("Get the App");
    await expect(page).toHaveURL(/#get-app/);
    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator("#hubGetAppBanner")).toBeVisible();
    assertHealthy(expect, report, "get-app deep link");
  });
});

test.describe("iPhone Safari install steps", () => {
  test.use({ userAgent: IPHONE_SAFARI, viewport: { width: 390, height: 844 } });

  test("shows numbered Share steps and no one-tap install button", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.locator("#hubGetAppBanner [data-app-go='get-app']").click();
    const screen = page.locator("#appGetApp");
    await expect(screen).toBeVisible();
    await expect(screen).toContainText("Tap the Share button.");
    await expect(screen).toContainText("Scroll and tap Add to Home Screen.");
    await expect(screen).toContainText("Tap Add.");
    await expect(screen).toContainText("On iPad, the Share button is at the top.");
    await expect(screen).toContainText("You sign in once the first time.");
    await expect(screen.locator(".app-steps svg")).toHaveCount(3);
    await expect(page.locator("#appInstallBtn")).toHaveCount(0);
    const text = await screen.innerText();
    expect(text).not.toMatch(/[—–]/);
    assertHealthy(expect, report, "ios safari steps");
  });
});

test.describe("Android Chrome install prompt", () => {
  test.use({ userAgent: ANDROID_CHROME, viewport: { width: 390, height: 844 } });

  test("uses a mocked beforeinstallprompt and shows success after install", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await mockInstallPrompt(page);
    await page.locator("#hubGetAppBanner [data-app-go='get-app']").click();
    const button = page.locator("#appInstallBtn");
    await expect(button).toBeVisible();
    await expect(button).toHaveText("Install Shamrock Hub");
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(226, 193, 90)");
    await button.click();
    await expect(page.locator("#appGetApp")).toContainText("You're all set");
    await expect(page.locator("#appGetApp")).toContainText("Shamrock icon");
    await expect(page.locator("#appGetApp")).toContainText("You sign in once the first time.");
    assertHealthy(expect, report, "android install prompt");
  });
});

test.describe("Facebook in-app browser", () => {
  test.use({ userAgent: FACEBOOK_IOS, viewport: { width: 390, height: 844 } });

  test("explains install will not work there and offers Copy link", async ({ page }) => {
    const report = watchPage(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await unlockMemberHub(page);
    await page.locator("#hubGetAppBanner [data-app-go='get-app']").click();
    const screen = page.locator("#appGetApp");
    await expect(screen).toBeVisible();
    await expect(screen).toContainText("Install does not work inside Facebook.");
    await expect(screen).toContainText("Open in Safari");
    const copy = page.locator("#appCopyLink");
    await expect(copy).toBeVisible();
    await expect(copy).toHaveText("Copy link");
    await expect(copy).toHaveAttribute("data-hub-url", "https://kreweofshamrock.com/members.html");
    await expect(page.locator("#appInstallBtn")).toHaveCount(0);
    await copy.click();
    await expect(copy).toHaveText("Link copied");
    assertHealthy(expect, report, "facebook in-app install");
  });
});

test("install QR svg is served from the site", async ({ request }) => {
  const res = await request.get("/assets/img/hub-install-qr.svg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] || "").toMatch(/svg/);
  const text = await res.text();
  expect(text).toMatch(/<svg/i);
  expect(text).toMatch(/kreweofshamrock\.com\/members\.html/);
});
