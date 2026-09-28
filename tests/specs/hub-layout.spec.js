// Computer Hub vs phone app, #get-app on both, and layout shift.
// Offline fixtures only. This does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const ANNOUNCEMENT = {
  id: "toys",
  subject: "Toys for the Flight",
  body_html: "<p>Bring a sturdy toy for the flight.</p><p>Higgins Hall, October 24.</p>",
  created_at: "2026-09-20T15:00:00Z",
  sender_name: "Melissa Tully"
};

async function installCls(page) {
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__clsAll = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = entry.value || 0;
        window.__clsAll += value;
        if (!entry.hadRecentInput) window.__cls += value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function clsNow(page) {
  return page.evaluate(() => ({
    cls: window.__cls || 0,
    all: window.__clsAll || 0
  }));
}

async function stepCls(page, run) {
  await page.evaluate(() => {
    window.__step = 0;
    window.__stepAll = 0;
    if (window.__stepObs) window.__stepObs.disconnect();
    window.__stepObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = entry.value || 0;
        window.__stepAll += value;
        if (!entry.hadRecentInput) window.__step += value;
      }
    });
    window.__stepObs.observe({ type: "layout-shift", buffered: false });
  });
  await run();
  await page.waitForTimeout(350);
  return page.evaluate(() => ({ cls: window.__step || 0, all: window.__stepAll || 0 }));
}

test.describe("Computer Hub on a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("signed-in home uses the browser hub, not the phone shell", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await expect(page.locator("body")).toHaveClass(/hub-desk/);
    await expect(page.locator("body")).not.toHaveClass(/hub-app/);
    await expect(page.locator("nav.krewe-nav")).toBeVisible();
    await expect(page.locator("header.page-head")).toBeVisible();
    await expect(page.locator("footer.krewe-foot")).toBeVisible();
    await expect(page.locator("#memberWho")).toBeVisible();
    await expect(page.locator("#appTop")).toBeHidden();
    await expect(page.locator("#appDash")).toHaveCount(0);
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    await expect(page.locator("#hubWelcomeCard")).toBeVisible();
    await expect(page.locator("#hubWelcomeCard")).toContainText("Welcome home");
    const card = page.locator("#hubDeskAppCard");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Get the Shamrock Hub mobile app");
    await expect(page.locator("#hubGetAppLink")).toHaveText("See how to install");
    await expect(page.locator("#hubGetAppQuick")).toHaveCount(0);
    await expect(page.locator('#hubTabs [data-hub-tab="hub"]')).toContainText("Home");
    await expect(page.locator('#hubTabs [data-hub-tab="fun"]')).toBeVisible();
    await expect(page.locator('#hubTabs .app-tab-ic').first()).toBeHidden();
    const tabs = await page.locator("#hubTabs").boundingBox();
    const welcome = await page.locator("#hubWelcomeCard").boundingBox();
    expect(tabs.y).toBeLessThan(welcome.y);
    assertHealthy(expect, report, "desktop hub home");
  });

  test("Read more opens the post in a panel and does not slide the phone screen", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.evaluate((row) => window.__kosHubSetAnnouncements([row]), ANNOUNCEMENT);
    const more = page.locator("#hubBoardLatest .hub-board-more");
    await more.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await more.evaluate((el) => el.click());
    const post = page.locator("#appAnn");
    await expect(post).toBeVisible();
    await expect(post).toContainText("Toys for the Flight");
    await expect(post).toContainText("Bring a sturdy toy");
    await expect(post).toContainText("Higgins Hall");
    await expect(page.locator("#appBack")).toBeVisible();
    await expect(page.locator("nav.krewe-nav")).toBeVisible();
    await expect(page.locator("body")).not.toHaveClass(/hub-app/);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(48);
    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator(".hub-board")).toBeVisible();
    await expect(page.locator("#hubWelcomeCard")).toBeVisible();
    assertHealthy(expect, report, "desktop read more");
  });

  test("#get-app opens the QR screen from the mobile app card", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { hash: "get-app" });
    await page.evaluate(() => {
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    });
    const screen = page.locator("#appGetApp");
    await expect(screen).toBeVisible();
    await expect(screen.locator(".app-qr img")).toBeVisible();
    await expect(screen).toContainText("Point your phone camera at this code");
    await expect(page.locator("#appBack")).toContainText("Back");
    await expect(page).toHaveURL(/#get-app/);
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    await expect(page.locator("#hubDeskAppCard")).toBeVisible();
    await expect(page.locator("#hubGetAppLink")).toBeVisible();
    assertHealthy(expect, report, "desktop get-app");
  });

  test("the mobile app card is above the fold at 1440x900", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.evaluate(() => {
      if (typeof window.kosShowHub === "function") window.kosShowHub("hub");
    });
    await page.waitForFunction(() => {
      const tabs = document.getElementById("hubTabs");
      return !!(tabs && tabs.getBoundingClientRect().top < 12);
    });
    const card = page.locator("#hubDeskAppCard");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Get the Shamrock Hub mobile app");
    await expect(card).toContainText("like an app, for iPhone and Android");
    await expect(card).toContainText("nothing to download from an app store");
    await expect(card).toContainText("You open it with one tap.");
    await expect(card).toContainText("Scan with your phone's camera");
    await expect(card.locator("img")).toBeVisible();
    await expect(card.locator("img")).toHaveAttribute("src", "/assets/img/hub-install-qr.svg");
    const copy = page.locator("#hubDeskAppCopy");
    await expect(copy).toHaveAttribute("data-hub-url", "https://kreweofshamrock.com/members.html#get-app");
    const text = await card.innerText();
    expect(text).not.toMatch(/[—–]/);
    const box = await card.boundingBox();
    const welcome = await page.locator("#hubWelcomeCard").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    expect(box.y).toBeGreaterThan(welcome.y);
    assertHealthy(expect, report, "desktop app card above the fold");
  });

  test("dismissing the card leaves a Get the mobile app row in quick links", async ({ page }) => {
    const report = watchPage(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await unlockMemberHub(page);
    const copy = page.locator("#hubDeskAppCopy");
    await copy.click();
    await expect(copy).toHaveText("Link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe("https://kreweofshamrock.com/members.html#get-app");

    await page.locator("#hubDeskAppDismiss").click();
    await expect(page.locator("#hubDeskAppCard")).toHaveCount(0);
    const row = page.locator("#hubGetAppQuick");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Get the mobile app");
    await expect(row.locator("svg")).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("kosHubGetAppDismissed"));
    expect(stored).toBe("1");

    await page.reload();
    await unlockMemberHub(page);
    await expect(page.locator("#hubDeskAppCard")).toHaveCount(0);
    await expect(page.locator("#hubGetAppQuick")).toBeVisible();
    await page.locator("#hubGetAppQuick").click();
    await expect(page.locator("#appGetApp")).toBeVisible();
    await expect(page.locator("#appGetApp .app-qr img")).toBeVisible();
    assertHealthy(expect, report, "dismiss desktop app card");
  });
});

test.describe("Phone Hub stays the app", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a narrow browser uses the app shell and the Home banner", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    await expect(page.locator("body")).not.toHaveClass(/hub-desk/);
    await expect(page.locator("nav.krewe-nav")).toBeHidden();
    await expect(page.locator("#appTop")).toBeVisible();
    await expect(page.locator("#appDash")).toBeVisible();
    await expect(page.locator("#hubGetAppBanner")).toBeVisible();
    await expect(page.locator("#hubGetAppBanner")).toContainText("Get the mobile app");
    await expect(page.locator("#hubDeskAppCard")).toHaveCount(0);
    await expect(page.locator("#hubGetAppLink")).toHaveCount(0);
    await expect(page.locator('#hubTabs [data-hub-tab="fun"]')).toBeHidden();
    const tabs = await page.locator("#hubTabs").boundingBox();
    const dash = await page.locator("#appDash").boundingBox();
    expect(tabs.y).toBeGreaterThan(dash.y);
    assertHealthy(expect, report, "phone hub home");
  });

  test("#get-app opens the install screen", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { hash: "get-app" });
    await page.evaluate(() => {
      if (typeof window.__kosHubSyncRoute === "function") window.__kosHubSyncRoute();
    });
    await expect(page.locator("#appGetApp")).toBeVisible();
    await expect(page.locator("#appBack")).toBeVisible();
    await expect(page).toHaveURL(/#get-app/);
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    assertHealthy(expect, report, "phone get-app");
  });
});

test.describe("Installed app keeps the phone shell on a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("display-mode standalone forces the app layout", async ({ page }) => {
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
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    await expect(page.locator("#appDash")).toBeVisible();
    await expect(page.locator("nav.krewe-nav")).toBeHidden();
    await expect(page.locator("#hubGetAppBanner")).toHaveCount(0);
    await expect(page.locator("#hubDeskAppCard")).toHaveCount(0);
    assertHealthy(expect, report, "standalone wide app");
  });
});

test.describe("Resizing across the breakpoint", () => {
  test("switching width keeps Home and does not trap the phone drill", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await unlockMemberHub(page);
    await expect(page.locator("body")).toHaveClass(/hub-desk/);
    await expect(page.locator("#hubWelcomeCard")).toBeVisible();
    await expect(page.locator("#hubDeskAppCard")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("body")).toHaveClass(/hub-app/);
    await expect(page.locator("#hubDeskAppCard")).toHaveCount(0);
    await expect(page.locator("#hubGetAppBanner")).toBeVisible();
    await expect(page.locator("#appDash")).toBeVisible();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("body")).toHaveClass(/hub-desk/);
    await expect(page.locator("#appDash")).toHaveCount(0);
    await expect(page.locator("#hubWelcomeCard")).toBeVisible();
    await expect(page.locator("#hubDeskAppCard")).toBeVisible();
    await expect(page.locator("nav.krewe-nav")).toBeVisible();
    assertHealthy(expect, report, "resize breakpoint");
  });
});

test.describe("Layout shift on the Member Hub", () => {
  test("phone load and main screens stay under 0.05", async ({ page }) => {
    const report = watchPage(page);
    await installCls(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await unlockMemberHub(page);
    await page.waitForTimeout(500);
    const loaded = await clsNow(page);
    expect(loaded.cls, "phone load CLS " + loaded.cls).toBeLessThan(0.05);

    const events = await stepCls(page, async () => {
      await page.locator('[data-hub-tab="events"]').click();
    });
    expect(events.cls, "phone events CLS " + events.cls).toBeLessThan(0.05);

    const parade = await stepCls(page, async () => {
      await page.locator('[data-hub-tab="parade"]').click();
    });
    expect(parade.cls, "phone parade CLS " + parade.cls).toBeLessThan(0.05);

    const me = await stepCls(page, async () => {
      await page.locator('[data-hub-tab="krewe"]').click();
    });
    expect(me.cls, "phone me CLS " + me.cls).toBeLessThan(0.05);

    await page.locator('[data-hub-tab="hub"]').click();
    await page.evaluate((row) => window.__kosHubSetAnnouncements([row]), ANNOUNCEMENT);
    const read = await stepCls(page, async () => {
      await page.locator("#hubBoardLatest .hub-board-more").click();
    });
    expect(read.cls, "phone read more CLS " + read.cls).toBeLessThan(0.05);

    await page.locator("#appBack").click();
    const getApp = await stepCls(page, async () => {
      await page.locator("#hubGetAppBanner [data-app-go='get-app']").click();
    });
    expect(getApp.cls, "phone get-app CLS " + getApp.cls).toBeLessThan(0.05);
    assertHealthy(expect, report, "phone cls");
  });

  test("desktop load and main screens stay under 0.05", async ({ page }) => {
    const report = watchPage(page);
    await installCls(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await unlockMemberHub(page);
    await page.waitForTimeout(500);
    const loaded = await clsNow(page);
    expect(loaded.cls, "desktop load CLS " + loaded.cls).toBeLessThan(0.05);

    const events = await stepCls(page, async () => {
      await page.locator('[data-hub-tab="events"]').click();
    });
    expect(events.cls, "desktop events CLS " + events.cls).toBeLessThan(0.05);

    const parade = await stepCls(page, async () => {
      await page.locator('[data-hub-tab="parade"]').click();
    });
    expect(parade.cls, "desktop parade CLS " + parade.cls).toBeLessThan(0.05);

    await page.locator('[data-hub-tab="hub"]').click();
    await page.evaluate((row) => window.__kosHubSetAnnouncements([row]), ANNOUNCEMENT);
    const read = await stepCls(page, async () => {
      await page.locator("#hubBoardLatest .hub-board-more").click();
    });
    expect(read.cls, "desktop read more CLS " + read.cls).toBeLessThan(0.05);

    await page.locator("#appBack").click();
    const getApp = await stepCls(page, async () => {
      await page.locator("#hubGetAppLink").click();
    });
    expect(getApp.cls, "desktop get-app CLS " + getApp.cls).toBeLessThan(0.05);
    assertHealthy(expect, report, "desktop cls");
  });
});
