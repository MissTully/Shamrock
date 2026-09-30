// Event outreach officer tool. Role and row fixtures drive the Hub offline
// so this does not read or write the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const ROWS = [
  {
    name: "Niamh Kelly",
    email: "niamh.kelly@example.com",
    sources: ["Website RSVP"],
    source_keys: ["website_rsvp"],
    event_count: 2,
    last_event_name: "Craic and Baskets",
    last_event_at: "2026-10-03T22:00:00Z",
    membership_status: "prospect",
    on_roster: true,
    applied_to_join: false
  },
  {
    name: "Owen Byrne",
    email: "owen.byrne@example.com",
    sources: ["Zeffy"],
    source_keys: ["zeffy"],
    event_count: 1,
    last_event_name: "Mini Golf Social",
    last_event_at: "2026-09-12T23:00:00Z",
    membership_status: null,
    on_roster: false,
    applied_to_join: false
  },
  {
    name: "Siobhan Walsh",
    email: "siobhan.walsh@example.com",
    sources: ["Zeffy", "Legacy"],
    source_keys: ["zeffy", "legacy"],
    event_count: 4,
    last_event_name: "Tartan Ball",
    last_event_at: "2026-02-14T23:00:00Z",
    membership_status: null,
    on_roster: false,
    applied_to_join: false
  },
  {
    name: "Patrick Doyle",
    email: "patrick.doyle@example.com",
    sources: ["Website RSVP", "Zeffy"],
    source_keys: ["website_rsvp", "zeffy"],
    event_count: 3,
    last_event_name: "St. Patrick's Parade",
    last_event_at: "2026-03-14T16:00:00Z",
    membership_status: "prospect",
    on_roster: true,
    applied_to_join: false
  },
  {
    name: "Maeve Collins",
    email: "maeve.collins@example.com",
    sources: ["Zeffy"],
    source_keys: ["zeffy"],
    event_count: 2,
    last_event_name: "Pub Trivia",
    last_event_at: "2026-08-01T23:00:00Z",
    membership_status: "active",
    on_roster: true,
    applied_to_join: true
  }
];

async function openOutreach(page, role) {
  await unlockMemberHub(page, { role: role });
  await page.evaluate((flags) => window.__kosHubSetRole(flags), role);
  await page.evaluate((rows) => window.__kosHubSetEventOutreach(rows), ROWS);
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubEventOutreach"]').click();
  await expect(page.locator("#hubOutreachTable")).toBeVisible();
}

test.describe("Event outreach", () => {
  test("event managers see prospects, Zeffy buyers, and legacy emails, then filter and export", async ({ page }) => {
    const report = watchPage(page);
    await openOutreach(page, { officer: true, canManageEvents: true });

    const tool = page.locator("#hubEventOutreach");
    await expect(tool.locator("h2")).toHaveText("Event outreach");
    await expect(tool).toContainText("does not create members");
    await expect(tool).toContainText("Niamh Kelly");
    await expect(tool).toContainText("owen.byrne@example.com");
    await expect(tool).toContainText("Siobhan Walsh");
    await expect(tool).toContainText("Patrick Doyle");
    await expect(tool).not.toContainText("Maeve Collins");
    await expect(tool.locator(".hub-outreach-src-website").first()).toHaveText("Website RSVP");
    await expect(tool.locator(".hub-outreach-src-zeffy").first()).toBeVisible();
    await expect(tool.locator(".hub-outreach-src-legacy")).toHaveText("Legacy");
    await expect(tool).toContainText("Not on roster");
    await expect(tool).toContainText("Prospect");
    await expect(page.locator("[data-app-bucket='prospect']")).toHaveCount(0);
    await page.locator("#hubOfficer").screenshot({
      path: "/opt/cursor/artifacts/event-outreach-list.png"
    });

    await page.locator("#hubOutreachSource").selectOption("zeffy");
    await expect(tool).not.toContainText("Niamh Kelly");
    await expect(tool).toContainText("Owen Byrne");
    await expect(tool).toContainText("Siobhan Walsh");
    await expect(tool).toContainText("Patrick Doyle");

    await page.locator("#hubOutreachSource").selectOption("all");
    await page.locator("#hubOutreachMin").fill("4");
    await page.locator("#hubOutreachMin").dispatchEvent("change");
    await expect(tool).toContainText("Siobhan Walsh");
    await expect(tool).not.toContainText("Owen Byrne");
    await expect(tool).not.toContainText("Niamh Kelly");

    await page.locator("#hubOutreachMin").fill("0");
    await page.locator("#hubOutreachMin").dispatchEvent("change");
    await page.locator("#hubOutreachNever").uncheck();
    await expect(tool).toContainText("Maeve Collins");
    await expect(tool).toContainText("On roster · active");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#hubOutreachCsv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("kos-event-outreach.csv");
    const path = await download.path();
    expect(path).toBeTruthy();
    const text = require("node:fs").readFileSync(path, "utf8");
    expect(text).toContain("Name,Email,Sources,Event count,Last event,Last event date,Roster,Applied to join");
    expect(text).toContain("Maeve Collins,maeve.collins@example.com,Zeffy,2,Pub Trivia");
    expect(text).toContain("yes");
    assertHealthy(expect, report, "event outreach list");
  });

  test("application reviewers see the tool and Event prospects stays on Applications", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: false,
        canManageEvents: false,
        canReviewApplications: true,
        applications: [{
          id: "app-casey",
          first_name: "Casey",
          last_name: "Prospect",
          email: "casey.prospect@example.com",
          membership_status: "prospect",
          created_at: "2026-09-26T15:00:00.000Z"
        }]
      }
    });
    await page.evaluate(() => window.__kosHubSetRole({
      officer: false,
      canManageEvents: false,
      canReviewApplications: true,
      applications: [{
        id: "app-casey",
        first_name: "Casey",
        last_name: "Prospect",
        email: "casey.prospect@example.com",
        membership_status: "prospect",
        created_at: "2026-09-26T15:00:00.000Z"
      }]
    }));
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubEventOutreach"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubApplications"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubPayments"]')).toHaveCount(0);
    await page.locator('[data-tool="tool:hubApplications"]').click();
    await expect(page.locator("[data-app-bucket='prospect']")).toContainText("Event prospects");
    await page.locator("[data-app-bucket='prospect']").click();
    await expect(page.locator("#hubApplications")).toContainText("Casey Prospect");
    await expect(page.locator("#hubApplications")).toContainText("event RSVP prospects");
    assertHealthy(expect, report, "reviewer outreach");
  });

  test("shop-only and hours-only desks do not show the list", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canManageEvents: true, shopOnly: true } });
    await page.evaluate(() => window.__kosHubSetRole({ officer: true, canManageEvents: true, shopOnly: true }));
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubShopStudio"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubEventOutreach"]')).toHaveCount(0);
    await expect(page.locator('[data-tool="tool:hubReports"]')).toHaveCount(0);

    await page.evaluate(() => window.__kosHubSetRole({
      officer: false,
      canManageEvents: false,
      canReviewHours: true,
      shopOnly: false
    }));
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubApprovals"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubEventOutreach"]')).toHaveCount(0);
    assertHealthy(expect, report, "outreach hidden");
  });
});
