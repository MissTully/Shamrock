// Membership Applications officer tool. Role fixtures drive the Hub offline
// so this does not write to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const APPLICATIONS = [
  {
    id: "app-nia",
    first_name: "Nia",
    last_name: "Byrne",
    email: "nia.byrne@example.com",
    phone: "813-555-0199",
    street_address: "12 River Street",
    city: "Tampa",
    state: "FL",
    zip: "33602",
    notes: "I would like to march. <img src=x onerror=alert(1)>",
    interests: "Parades and music",
    membership_status: "pending-new",
    application_fee_type: "single",
    ssn_last4: "6789",
    ssn_full: "123-45-6789",
    id_digits: "123456789",
    created_at: "2026-09-28T15:04:00.000Z"
  },
  {
    id: "app-owen",
    first_name: "Owen",
    last_name: "Kelly",
    email: "owen.kelly@example.com",
    phone: "813-555-0101",
    street_address: "4 Oak Lane",
    city: "Tampa",
    state: "FL",
    zip: "33606",
    notes: "Friend of the krewe.",
    interests: "",
    membership_status: "pending-new",
    created_at: "2026-09-20T15:00:00.000Z"
  },
  {
    id: "app-aoife",
    first_name: "Aoife",
    last_name: "Walsh",
    email: "aoife.walsh@example.com",
    phone: "813-555-0102",
    street_address: "9 Bay Street",
    city: "Tampa",
    state: "FL",
    zip: "33609",
    notes: "Ready for the parade.",
    membership_status: "pending-new",
    created_at: "2026-09-10T15:00:00.000Z"
  },
  {
    id: "app-rowan",
    first_name: "Rowan",
    last_name: "Hale",
    email: "rowan.hale@example.com",
    phone: "813-555-0177",
    street_address: "80 Palm Court",
    city: "Tampa",
    state: "FL",
    zip: "33611",
    notes: "Renewing dues.",
    membership_status: "pending-renewal",
    created_at: "2026-09-27T15:00:00.000Z"
  },
  {
    id: "app-casey",
    first_name: "Casey",
    last_name: "Prospect",
    email: "casey.prospect@example.com",
    notes: "Signed up for an event.",
    membership_status: "prospect",
    created_at: "2026-09-26T15:00:00.000Z"
  }
];

test.describe("Membership Applications", () => {
  test("officers who cannot review applications do not see the tool", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canReviewApplications: false } });
    await expect(page.locator("#hubAppsHomeLink")).toHaveCount(0);

    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubApprovals"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubApplications"]')).toHaveCount(0);
    assertHealthy(expect, report, "applications hidden");
  });

  test("reviewers open the list from home, see address and escaped notes, and approve", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: APPLICATIONS
      }
    });

    const home = page.locator("#hubAppsHomeLink");
    await expect(home).toBeVisible();
    await expect(home).toContainText("3 new applications");
    await home.click();

    await expect(page.locator("[data-hub-panel='officer']")).toHaveClass(/hub-on/);
    const tool = page.locator("#hubApplications");
    await expect(tool).toBeVisible();
    await expect(tool.locator("h2")).toHaveText("Membership Applications");
    await expect(tool).toContainText("Nia Byrne");
    await expect(tool).toContainText("nia.byrne@example.com");
    await expect(tool).toContainText("813-555-0199");
    await expect(tool).toContainText("12 River Street, Tampa, FL 33602");
    await expect(tool).toContainText("Parades and music");
    await expect(tool).toContainText("Sep 28, 2026, 11:04 AM ET");
    await expect(tool).toContainText("I would like to march.");
    await expect(tool.locator("img")).toHaveCount(0);
    await expect(tool).toContainText("<img src=x onerror=alert(1)>");
    await expect(tool.locator("[data-app-status='pending-new']").first()).toContainText("New");
    await expect(tool).toContainText("Application fee: single applicant, $50");
    await expect(tool).toContainText("not membership dues");
    await expect(tool).toContainText("SSN on file, last 4 only: •••-••-6789");
    await expect(tool).not.toContainText("123-45-6789");
    await expect(tool).not.toContainText("123456789");
    await expect(tool).not.toContainText("Rowan Hale");
    await expect(tool).not.toContainText("Casey Prospect");

    await tool.locator("[data-app-bucket='renewal']").click();
    await expect(tool).toContainText("Rowan Hale");
    await expect(tool).toContainText("renewals");
    await expect(tool).not.toContainText("Nia Byrne");

    await tool.locator("[data-app-bucket='new']").click();
    await expect(tool).toContainText("Nia Byrne");

    page.once("dialog", (dialog) => dialog.accept());
    await tool.locator("[data-app-approve='app-nia']").click();
    await expect(tool).toContainText("Approved.");
    await expect(tool).toContainText("Create or reset your password");
    await expect(tool.locator("[data-app-id='app-nia']")).toHaveCount(0);
    await expect(tool.locator("[data-app-history='approve']")).toContainText("Nia Byrne");
    await expect(page.locator("#hubAppsHomeLink")).toContainText("2 new applications");
    assertHealthy(expect, report, "applications review");
  });

  test("chair moves an application through background check and dues pending", async ({ page }) => {
    const report = watchPage(page);
    page.on("dialog", (dialog) => dialog.accept());
    await unlockMemberHub(page, {
      role: {
        officer: false,
        canReviewApplications: true,
        canViewPayments: false,
        applications: APPLICATIONS
      }
    });
    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Lisa",
          last_name: "Sugrue",
          display_name: "Lisa Sugrue",
          email: "lsugrue99@gmail.com",
          officer_title: "Board Member · Committee Chair of Membership",
          member_role: "board"
        }
      });
    });
    await page.locator("#hubAppsHomeLink").click();
    const tool = page.locator("#hubApplications");
    await expect(tool.locator("[data-app-bucket='background']")).toContainText("Background check");
    await expect(tool.locator("[data-app-bucket='dues']")).toContainText("Dues pending");
    await expect(page.locator('[data-tool="tool:hubPayments"]')).toHaveCount(0);

    await tool.locator("#hubAppNote-app-nia").fill("Sent the background check form.");
    await tool.locator("[data-app-bg='app-nia']").click();
    await expect(tool).toContainText("Moved to background check in progress.");
    await expect(tool.locator("[data-app-id='app-nia']")).toHaveCount(0);

    await tool.locator("[data-app-bucket='background']").click();
    const card = tool.locator("[data-app-id='app-nia']");
    await expect(card).toContainText("Background check in progress");
    await expect(card).not.toContainText("123-45-6789");
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Lisa Sugrue");
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Sent the background check form.");

    await tool.locator("#hubAppNote-app-nia").fill("Asked them to pay membership dues.");
    await tool.locator("[data-app-next='app-nia']").click();
    await expect(tool).toContainText("Next step sent.");
    await expect(card).toHaveAttribute("data-app-status", "background-check");
    await expect(tool.locator("[data-app-history='next_step_sent']")).toContainText("Asked them to pay membership dues.");

    await tool.locator("[data-app-dues='app-nia']").click();
    await expect(tool).toContainText("Moved to dues pending.");
    await tool.locator("[data-app-bucket='dues']").click();
    await expect(tool.locator("[data-app-id='app-nia']")).toContainText("Dues pending");
    await expect(tool.locator("[data-app-id='app-nia']")).toContainText("not the application fee");
    await expect(tool).not.toContainText("123456789");
    assertHealthy(expect, report, "application stages");
  });

  test("officer without payments rights still opens Membership Applications", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        canViewPayments: false,
        applications: APPLICATIONS
      }
    });
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubApplications"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubPayments"]')).toHaveCount(0);
    await page.locator('[data-tool="tool:hubApplications"]').click();
    await expect(page.locator("#hubApplications")).toContainText("Nia Byrne");
    await expect(page.locator("#hubApplications")).toContainText("New");
    assertHealthy(expect, report, "officer without payments");
  });
});
