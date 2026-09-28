// Krewe Tidings announcements card and its full archive.
// The suite runs offline, so announcements are injected through the
// __kosHubSetAnnouncements test fixture (mirrors __kosHubSetRole); the
// archive's live fetch then falls back to the injected list gracefully.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const ANNOUNCEMENTS = [
  {
    id: "a1",
    subject: "Tartan Ball tickets are live",
    body_html: "<p>Buy your tickets and bring your friends.</p><p>Higgins Hall, October 24.</p>",
    created_at: "2026-09-18T21:00:00Z",
    sender_name: "Melissa Tully"
  },
  {
    id: "a2",
    subject: "Basket Social moved to October 3",
    body_html: "<p>New date! RSVP details are in your krewe email.</p>",
    created_at: "2026-09-10T18:30:00Z",
    sender_name: "Melissa Tully"
  },
  {
    id: "a3",
    subject: "Volunteer call: sign-in table and raffles",
    body_html: "<p>Reply if you can help before or during the ball.</p>",
    created_at: "2026-09-01T15:00:00Z",
    sender_name: null
  }
];

async function openHomeWithAnnouncements(page) {
  await unlockMemberHub(page);
  await page.waitForSelector('[data-hub-goto="directory"]');
  await page.evaluate((list) => window.__kosHubSetAnnouncements(list), ANNOUNCEMENTS);
}

test.describe("Krewe Tidings announcements", () => {
  test("card shows the latest announcement with older ones collapsed", async ({ page }) => {
    const report = watchPage(page);
    await openHomeWithAnnouncements(page);

    const card = page.locator(".hub-board");
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toHaveText(/Krewe Tidings/);
    await expect(card).toContainText("News from the Board");
    await expect(card.locator("h4").first()).toHaveText("Tartan Ball tickets are live");
    await expect(card).toContainText("from Melissa Tully");
    await expect(card.locator("details.hub-board-old summary").first())
      .toContainText("Basket Social moved to October 3");
    assertHealthy(expect, report, "board card");
  });

  test("See all announcements reveals the full archive (offline fallback)", async ({ page }) => {
    const report = watchPage(page);
    await openHomeWithAnnouncements(page);

    const btn = page.locator("#hubBoardArchiveBtn");
    await expect(btn).toBeVisible();
    await btn.click();

    const archive = page.locator("#hubBoardArchive");
    await expect(archive).toBeVisible();
    // Offline, the live archive call cannot succeed; the injected
    // announcements must still all be listed, without console errors.
    await expect(archive).toContainText("Tartan Ball tickets are live");
    await expect(archive).toContainText("Basket Social moved to October 3");
    await expect(archive).toContainText("Volunteer call: sign-in table and raffles");
    await expect(btn).toBeHidden();
    assertHealthy(expect, report, "board archive");
  });

  test("Home clamps the latest post and Read more returns to the same scroll", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await unlockMemberHub(page);
    await page.waitForSelector('[data-hub-goto="directory"]');
    const tail = "TAIL_MARKER_END";
    const longBody = "<p><strong>Toys</strong> for the flight are due this fall.</p><p>" +
      ("Bring a sturdy toy. ".repeat(40)) + tail + "</p>";
    await page.evaluate((body) => {
      window.__kosHubSetAnnouncements([
        {
          id: "toys",
          subject: "Toys for the Flight",
          body_html: body,
          created_at: "2026-09-20T15:00:00Z",
          sender_name: "Melissa Tully"
        },
        {
          id: "ball",
          subject: "Tartan Ball call to action",
          body_html: "<p>Tickets and volunteer shifts are in your krewe email.</p>",
          created_at: "2026-09-19T15:00:00Z",
          sender_name: "Melissa Tully"
        }
      ]);
    }, longBody);

    const card = page.locator(".hub-board");
    const preview = card.locator("#hubBoardLatest .hub-board-preview");
    await expect(preview).toBeVisible();
    await expect(card.locator("#hubBoardLatest h4")).toHaveText("Toys for the Flight");
    await expect(card.locator("#hubBoardLatest")).toContainText("from Melissa Tully");
    await expect(card.locator("#hubBoardLatest .hub-board-more")).toHaveText("Read more");
    await expect(card.locator("#hubBoardLatest p.dropcap")).toHaveCount(0);
    const previewText = await preview.textContent();
    expect(previewText).toContain("Toys");
    expect(previewText).not.toMatch(/<strong>|<p>/);
    const clamped = await preview.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        clamp: style.webkitLineClamp || style.lineClamp,
        overflow: el.scrollHeight > el.clientHeight + 1
      };
    });
    expect(String(clamped.clamp)).toBe("3");
    expect(clamped.overflow).toBe(true);

    const older = card.locator("details.hub-board-old").first();
    await expect(older.locator("summary")).toContainText("Tartan Ball call to action");
    await older.locator("summary").click();
    await expect(older.locator(".hub-board-more")).toHaveText("Read more");

    await page.evaluate(() => {
      const panel = document.querySelector('[data-hub-panel="hub"]');
      const spacer = document.createElement("div");
      spacer.id = "annScrollSpacer";
      spacer.style.height = "1600px";
      panel.appendChild(spacer);
      panel.scrollTop = 460;
    });
    const before = await page.evaluate(() => document.querySelector('[data-hub-panel="hub"]').scrollTop);
    expect(before).toBeGreaterThan(300);

    await card.locator("#hubBoardLatest .hub-board-more").click();
    const post = page.locator("#appAnn");
    await expect(post).toBeVisible();
    await expect(page.locator("#appBack")).toContainText("Back");
    await expect(post).toContainText("Toys for the Flight");
    await expect(post).toContainText(tail);
    await expect(page.locator("#appPageTitle")).toBeHidden();

    await page.locator("#appBack").click();
    await expect(page.locator("#appDrill")).toBeHidden();
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    await expect(page.locator(".hub-board")).toBeVisible();
    const after = await page.evaluate(() => document.querySelector('[data-hub-panel="hub"]').scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(48);

    await page.locator("#hubBoardArchiveBtn").click();
    const archive = page.locator("#hubBoardArchive");
    await expect(archive.locator(".hub-board-preview")).toHaveCount(2);
    await archive.locator(".hub-board-more").nth(1).click();
    await expect(page.locator("#appAnn")).toContainText("Tartan Ball call to action");
    await page.locator("#appBack").click();
    await expect(page.locator("#appPageTitle")).toHaveText("Home");
    assertHealthy(expect, report, "tidings preview");
  });

  test("card stays absent when there are no announcements", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.waitForSelector('[data-hub-goto="directory"]');
    await page.evaluate(() => window.__kosHubSetAnnouncements([]));
    await expect(page.locator(".hub-board")).toHaveCount(0);
    assertHealthy(expect, report, "no announcements");
  });
});
