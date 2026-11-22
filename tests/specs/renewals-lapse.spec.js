// Officer desk Renewals and the member Renew card. Fixture data only.
// This file does not call the live Supabase project.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const V6 = path.join(__dirname, "../../previews/v6");
fs.mkdirSync(V6, { recursive: true });

const MEMBERS = [
  {
    id: "mem-jane",
    first_name: "Jane",
    last_name: "Sample",
    email: "jane.sample@example.com",
    membership_status: "pending-renewal",
    membership_level: "full",
    amount: 375,
    last_paid_year: 2025,
    zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership"
  },
  {
    id: "mem-alex",
    first_name: "Alex",
    last_name: "Example",
    email: "alex.example@example.com",
    membership_status: "lapsed",
    membership_level: "associate",
    amount: 450,
    last_paid_year: 2024,
    zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership"
  },
  {
    id: "mem-robin",
    first_name: "Robin",
    last_name: "Example",
    email: "robin.example@example.com",
    membership_status: "active",
    membership_level: "full",
    amount: 375,
    last_paid_year: 2024,
    zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership"
  }
];

function renewalsFixture(extra) {
  return Object.assign({
    year: 2026,
    season_label: "2026-27",
    members: MEMBERS,
    lapseTools: true,
    lapseOn: "2026-07-01",
    inactiveOn: "2026-07-16",
    canLapseToday: true,
    canMarkInactive: true,
    exemptionsMissing: 1,
    lapseCandidates: [{
      id: "mem-robin",
      first_name: "Robin",
      last_name: "Example",
      email: "robin.example@example.com",
      membership_status: "active",
      membership_level: "full"
    }]
  }, extra || {});
}

async function openRenewals(page, payload) {
  await page.evaluate((data) => {
    window.kosProfile = {
      first_name: "Pat",
      last_name: "Example",
      email: "pat.example@example.com",
      officer_title: "Treasurer",
      member_role: "officer"
    };
    window.__kosRenewalsFixture = data;
    if (document.getElementById("hubRenewals") && typeof window.kosLoadRenewals === "function") {
      window.kosLoadRenewals();
    }
  }, payload);
  await page.locator("[data-hub-tab='officer']").click();
  const tile = page.locator('[data-tool="tool:hubRenewals"]');
  if (await tile.isVisible()) await tile.click();
  return page.locator("#hubRenewals");
}

test.describe("Renewals lapse and reactivation", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("treasurer sees lapse tools, pending dues, and not an elected treasurer candidate", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: { officer: true, canReviewApplications: false, toolKeys: ["renewals"] }
    });
    await expect(page.locator('[data-tool="tool:hubApplications"]')).toHaveCount(0);

    let card = await openRenewals(page, renewalsFixture({
      lapseOn: "2026-12-01",
      canLapseToday: false
    }));
    await expect(card.locator("#kosRenLapse")).toBeDisabled();
    await expect(card.locator("#kosRenLapse")).toHaveText("Available on December 1, 2026");
    await expect(card.locator("#kosRenReactivate")).toBeVisible();

    card = await openRenewals(page, renewalsFixture());
    await expect(card).toContainText("Pending dues");
    await expect(card).toContainText("Jane Sample");
    await expect(card.locator("[data-ren-lapse-date]")).toHaveText("July 1, 2026");
    await expect(card.locator("[data-ren-inactive-date]")).toHaveText("July 16, 2026");
    await expect(card).toContainText("Elected officers are left off");
    await expect(card).not.toContainText("board are left off");
    await expect(card.locator("#kosRenLapse")).toBeEnabled();
    await expect(card.locator("#kosRenLapse")).toHaveText("Mark delinquent");
    await expect(card.locator("#kosRenReactivate")).toBeVisible();
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await card.screenshot({
      path: path.join(V6, "05-renewals-desk.png"),
      animations: "disabled"
    });

    await card.locator("#kosRenLapse").click();
    const lapse = card.locator("#kosRenLapsePreview");
    await expect(lapse).toContainText("1");
    await expect(lapse).toContainText("member would be marked delinquent");
    await expect(lapse).toContainText("Robin Example");
    await expect(lapse).not.toContainText("Pat Example");
    await expect(lapse.locator("[data-ren-exempt-warn]")).toContainText("1 elected officer");
    await expect(lapse.locator("#kosRenWaivers")).toHaveText("Open Dues waivers");
    await expect(lapse).toContainText("I have checked this list");
    await lapse.screenshot({
      path: path.join(V6, "06-mark-lapsed-preview.png"),
      animations: "disabled"
    });

    await card.locator("#kosRenInactive").click();
    const inactive = card.locator("#kosRenInactivePreview");
    await expect(inactive).toContainText("2");
    await expect(inactive).toContainText("members would be marked inactive");
    await expect(inactive).toContainText("They must submit a new application. No email is sent.");
    await expect(inactive).toContainText("Jane Sample");
    await expect(inactive).toContainText("jane.sample@example.com");
    await expect(inactive).toContainText("Alex Example");
    await expect(inactive).toContainText("alex.example@example.com");
    await expect(inactive).not.toContainText("Robin Example");
    await expect(inactive).toContainText("I have checked this list");
    await inactive.screenshot({
      path: path.join(V6, "10-mark-inactive-preview.png"),
      animations: "disabled"
    });

    await card.locator("[data-ren-id='mem-alex']").check();
    await card.locator("#kosRenReactivate").click();
    const letter = card.locator("#kosRenPreview");
    await expect(letter).toContainText("Your Krewe of Shamrock membership lapsed for the 2026-27 season. Pay your Associate dues on Zeffy to reactivate. Once your payment comes in you are active again.");
    await expect(letter).toContainText("Alex Example");
    await expect(letter).not.toContainText("Jane Sample");
    await letter.screenshot({
      path: path.join(V6, "07-reactivation-preview.png"),
      animations: "disabled"
    });
    assertHealthy(expect, report, "renewals lapse");
  });
});

test.describe("Member hub renew cards", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("lapsed and pending dues renew cards", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Jane",
          last_name: "Sample",
          email: "jane.sample@example.com",
          member_role: "member",
          officer_title: "",
          membership_status: "lapsed"
        },
        events: [],
        parades: [],
        paradeReady: { dues_paid: false, waiver_signed: false, meeting_attended: false, membership_status: "lapsed", membership_level: "full" },
        membershipStatus: "lapsed"
      });
      window.kosRenew.open({
        paid: false,
        membership_status: "lapsed",
        membership_level: "full",
        preview: true,
        holdNavigation: true
      });
    });
    const sheet = page.locator("#appSheet");
    await expect(sheet.locator("h2")).toHaveText("Your dues are past due. Pay by July 16, 2026 to stay a member.");
    await expect(sheet.locator("[data-renew-level='full']")).toBeVisible();
    await sheet.locator(".kos-renew").screenshot({
      path: path.join(V6, "08-hub-lapsed-renew.png"),
      animations: "disabled"
    });

    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Jane",
          last_name: "Sample",
          email: "jane.sample@example.com",
          member_role: "member",
          officer_title: "",
          membership_status: "pending-renewal"
        },
        paradeReady: { dues_paid: false, membership_status: "pending-renewal", membership_level: "full" },
        membershipStatus: "pending-renewal"
      });
      window.kosRenew.open({
        paid: false,
        membership_status: "pending-renewal",
        membership_level: "full",
        preview: true,
        holdNavigation: true
      });
    });
    await expect(sheet.locator("[data-renew-pending]")).toHaveText("Pending dues: your payment has not come in yet.");
    await expect(sheet.locator("[data-renew-level='auxiliary']")).toBeVisible();
    await sheet.locator(".kos-renew").screenshot({
      path: path.join(V6, "09-hub-pending-dues-renew.png"),
      animations: "disabled"
    });

    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Jane",
          last_name: "Sample",
          email: "jane.sample@example.com",
          member_role: "member",
          officer_title: "",
          membership_status: "inactive"
        },
        paradeReady: { dues_paid: false, membership_status: "inactive", membership_level: "full" },
        membershipStatus: "inactive"
      });
      window.kosRenew.open({
        paid: false,
        membership_status: "inactive",
        membership_level: "full",
        preview: true,
        holdNavigation: true
      });
    });
    await expect(sheet.locator("h2")).toHaveText("Your membership is inactive. To rejoin, submit a new membership application.");
    await expect(sheet.locator("a[href='membership-application.html']")).toHaveText("Open the Join page");
    await expect(sheet.locator("[data-renew-level]")).toHaveCount(0);
    await sheet.locator(".kos-renew").screenshot({
      path: path.join(V6, "11-hub-inactive-card.png"),
      animations: "disabled"
    });

    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Alex",
          last_name: "Example",
          email: "alex.example@example.com",
          member_role: "officer",
          officer_title: "Vice President",
          membership_status: "active"
        },
        paradeReady: { dues_paid: false, membership_status: "active" },
        membershipStatus: "active"
      });
      window.kosRenew.open({ preview: true, holdNavigation: true });
    });
    await expect(sheet.locator(".kos-renew")).toContainText("Elected officers (President, Vice President, Secretary, Treasurer) are exempt from dues under the bylaws.");
    await expect(sheet.locator("[data-renew-level]")).toHaveCount(0);
    await sheet.locator(".kos-renew").screenshot({
      path: path.join(V6, "12-hub-renew-exempt-note.png"),
      animations: "disabled"
    });
    assertHealthy(expect, report, "hub renew cards");
  });
});
