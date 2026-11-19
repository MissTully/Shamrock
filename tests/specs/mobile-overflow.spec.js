// Narrow phones and the Galaxy Fold inner glass must not scroll sideways.
// The phone Hub used to sit in a 460px column, so a wider layout viewport
// left a dark gutter and clipped the announcements card and the bottom nav.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, PAGES, unlockMemberHub } = require("./helpers");

const WIDTHS = [344, 360, 390, 412, 673, 884];

const ANNOUNCEMENT = {
  id: "feztival",
  subject: "Thursday Morning at the FEZtival of Trees!",
  body_html: "<p>Hey, Shamrock Krewe! We've got some exciting news! Charley Belcher will be broadcasting from the Shriners FEZtival of Trees.</p>",
  created_at: "2026-11-18T15:00:00Z",
  sender_name: "Debbie Fitzpatrick"
};

function fits(box, vw) {
  return !!box && box.left >= -1 && box.right <= vw + 1 && box.width > 0;
}

function measure() {
  function boxOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  }
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const hubFont = document.getElementById("hubRoot");
  const tab = document.querySelector("#hubTabs button");
  const title = document.querySelector("#hubBoardLatest h4");
  const date = document.querySelector("#hubBoardLatest .hub-board-date");
  return {
    vw,
    sw,
    shell: boxOf(document.getElementById("memberContent")),
    board: boxOf(document.querySelector(".hub-board")),
    tabs: boxOf(document.getElementById("hubTabs")),
    titleFits: !title || title.scrollWidth <= title.clientWidth + 1,
    dateFits: !date || date.scrollWidth <= date.clientWidth + 1,
    font: hubFont ? parseFloat(getComputedStyle(hubFont).fontSize) : null,
    tabH: tab ? tab.getBoundingClientRect().height : null,
    bodyFont: parseFloat(getComputedStyle(document.body).fontSize)
  };
}

for (const width of WIDTHS) {
  test.describe("viewport " + width, () => {
    test.use({ viewport: { width, height: 800 } });

    test("hub home and public pages stay inside the viewport", async ({ page }) => {
      test.setTimeout(90_000);
      const report = watchPage(page);
      await unlockMemberHub(page);
      await page.evaluate((row) => {
        if (typeof window.__kosHubSetAnnouncements === "function") window.__kosHubSetAnnouncements([row]);
      }, ANNOUNCEMENT);
      await page.locator(".hub-board").waitFor({ state: "visible" });
      const hub = await page.evaluate(measure);
      expect(hub.sw, "hub scrollWidth at " + width).toBeLessThanOrEqual(hub.vw + 1);
      expect(fits(hub.shell, hub.vw), "hub shell at " + width).toBe(true);
      expect(hub.shell.width, "hub shell fills the glass").toBeGreaterThanOrEqual(hub.vw - 2);
      expect(fits(hub.board, hub.vw), "announcements card at " + width).toBe(true);
      expect(fits(hub.tabs, hub.vw), "bottom nav at " + width).toBe(true);
      expect(hub.titleFits, "announcement title wraps at " + width).toBe(true);
      expect(hub.dateFits, "date line wraps at " + width).toBe(true);
      expect(hub.font, "hub body size").toBeLessThanOrEqual(16.5);
      expect(hub.tabH, "nav tap target").toBeGreaterThanOrEqual(44);

      for (const entry of PAGES) {
        await page.goto("/" + entry.file, { waitUntil: "domcontentloaded" });
        await page.locator("body").waitFor({ state: "visible" });
        const pub = await page.evaluate(measure);
        expect(pub.sw, entry.file + " scrollWidth at " + width).toBeLessThanOrEqual(pub.vw + 1);
        expect(pub.bodyFont, entry.file + " body size").toBeLessThanOrEqual(16.5);
      }
      assertHealthy(expect, report, "mobile overflow " + width);
    });
  });
}
