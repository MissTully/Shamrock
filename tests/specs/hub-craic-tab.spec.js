// Craic Cup is a real hub tab. Its pill uses the same dark-green active
// state as Home, Events, and My Krewe, including deep links and in-hub jumps.
// Offline fixtures only. This does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const GREEN = "rgb(20, 83, 45)";
const CREAM = "rgb(246, 239, 220)";

async function tabState(page) {
  return page.locator("#hubTabs [data-hub-tab]").evaluateAll((btns) => btns.map((btn) => {
    const style = getComputedStyle(btn);
    const label = btn.querySelector(".app-tab-tx");
    return {
      id: btn.getAttribute("data-hub-tab"),
      label: label ? label.textContent : "",
      on: btn.classList.contains("on"),
      selected: btn.getAttribute("aria-selected"),
      current: btn.getAttribute("aria-current"),
      bg: style.backgroundColor,
      color: style.color
    };
  }));
}

function expectOnly(rows, id) {
  const active = rows.find((row) => row.id === id);
  expect(active, id + " pill").toBeTruthy();
  expect(active.on, id + " has .on").toBe(true);
  expect(active.selected, id + " aria-selected").toBe("true");
  expect(active.current, id + " aria-current").toBe("page");
  expect(active.bg, id + " background").toBe(GREEN);
  expect(active.color, id + " text").toBe(CREAM);
  rows.filter((row) => row.id !== id).forEach((row) => {
    expect(row.on, row.id + " cleared").toBe(false);
    expect(row.selected, row.id + " aria-selected").toBe("false");
    expect(row.current, row.id + " aria-current").toBeNull();
    expect(row.bg, row.id + " background").not.toBe(GREEN);
  });
}

async function showMemberHub(page) {
  await page.evaluate(() => {
    window.kosProfile = {
      first_name: "Maeve",
      last_name: "Kelly",
      display_name: "Maeve Kelly",
      email: "maeve@example.com"
    };
    const auth = document.getElementById("authStage");
    if (auth) auth.style.display = "none";
    const content = document.getElementById("memberContent");
    if (content) content.style.display = "block";
    if (typeof window.kosUnlock === "function") window.kosUnlock();
  });
  await page.waitForSelector("#hubTabs [data-hub-tab='fun']");
}

test.describe("Craic Cup tab active state", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Home, Events, and My Krewe go dark green, and Craic Cup does too", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.evaluate(() => {
      window.kosProfile = {
        first_name: "Maeve",
        last_name: "Kelly",
        display_name: "Maeve Kelly",
        email: "maeve@example.com"
      };
      if (typeof window.__kosHubSetFeed === "function") {
        window.__kosHubSetFeed({
          profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com", parade_since: "2014" },
          events: [{
            id: "evt-cup",
            name: "Craic Cup Social",
            event_type: "social",
            start_time: "2026-11-14T18:00:00.000Z",
            location: "Higgins Hall",
            members_only: true,
            status: "published",
            source: "krewe"
          }],
          paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
          membershipStatus: "active"
        });
      }
    });

    await page.locator('#hubTabs [data-hub-tab="events"]').click();
    await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
    expectOnly(await tabState(page), "events");

    await page.locator('#hubTabs [data-hub-tab="krewe"]').click();
    await expect(page.locator("[data-hub-panel='krewe']")).toHaveClass(/hub-on/);
    expectOnly(await tabState(page), "krewe");

    await page.locator('#hubTabs [data-hub-tab="hub"]').click();
    await expect(page.locator("[data-hub-panel='hub']")).toHaveClass(/hub-on/);
    expectOnly(await tabState(page), "hub");

    await page.locator('#hubTabs [data-hub-tab="fun"]').click();
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);
    await expect(page.locator("[data-hub-panel='fun']")).toContainText("The Craic Cup");
    await expect(page.locator("#hubClaimCard")).toBeVisible();
    expectOnly(await tabState(page), "fun");
    await expect(page).toHaveURL(/#fun$/);
    assertHealthy(expect, report, "craic cup pill click");
  });

  test("deep link and in-hub links select Craic Cup and clear the other pills", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/members.html#fun");
    await showMemberHub(page);
    await expect.poll(async () => {
      const fun = (await tabState(page)).find((row) => row.id === "fun");
      return !!(fun && fun.on && fun.selected === "true" && fun.current === "page");
    }).toBe(true);
    expectOnly(await tabState(page), "fun");
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);

    await page.locator('#hubTabs [data-hub-tab="events"]').click();
    expectOnly(await tabState(page), "events");
    await page.evaluate(() => { location.hash = "fun"; });
    await expect.poll(async () => {
      const fun = (await tabState(page)).find((row) => row.id === "fun");
      return !!(fun && fun.on && fun.selected === "true");
    }).toBe(true);
    expectOnly(await tabState(page), "fun");
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);

    await page.locator('#hubTabs [data-hub-tab="hub"]').click();
    const quick = page.locator('[data-hub-goto="fun"]');
    await quick.scrollIntoViewIfNeeded();
    await quick.click();
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);
    expectOnly(await tabState(page), "fun");

    await page.locator('#hubTabs [data-hub-tab="hub"]').click();
    const claim = page.locator("#hubClaimClovers");
    await claim.scrollIntoViewIfNeeded();
    await claim.click();
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);
    await expect(page.locator("#hubClaimCard")).toBeVisible();
    expectOnly(await tabState(page), "fun");

    await page.locator('#hubTabs [data-hub-tab="krewe"]').click();
    expectOnly(await tabState(page), "krewe");
    const openCup = page.locator('[data-app-go="fun"]');
    await openCup.scrollIntoViewIfNeeded();
    await openCup.click();
    await expect(page.locator("[data-hub-panel='fun']")).toHaveClass(/hub-on/);
    expectOnly(await tabState(page), "fun");
    assertHealthy(expect, report, "craic cup links");
  });
});
