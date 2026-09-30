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
    dl_last4: "9012",
    dl_full: "F123456789012",
    driver_license: "F123456789012",
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
    await expect(tool).toContainText("Call first");
    await expect(tool.locator(".hub-app-journey")).toContainText("Joining packet");
    await expect(tool).toContainText("Next step: call the prospect");
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
    await expect(tool).toContainText("Driver's license on file, last 4 only: ••••9012");
    await expect(tool).toContainText("SSN on file, last 4 only: •••-••-6789");
    await expect(tool).toContainText("Full application received. Lists show the last 4 only.");
    await expect(tool.locator("[data-app-bg='app-nia']")).toHaveText("Send joining packet");
    await expect(tool.locator("[data-app-send]")).toHaveCount(0);
    await expect(tool).not.toContainText("Send full application");
    await expect(tool).not.toContainText("Mark next step sent");
    await expect(tool).not.toContainText("123-45-6789");
    await expect(tool).not.toContainText("123456789");
    await expect(tool).not.toContainText("F123456789012");
    await expect(tool).not.toContainText("Rowan Hale");
    await expect(tool).not.toContainText("Casey Prospect");

    await tool.locator("[data-app-bucket='renewal']").click();
    await expect(tool).toContainText("Rowan Hale");
    await expect(tool).toContainText("renewals");
    await expect(tool).not.toContainText("Nia Byrne");

    await tool.locator("[data-app-bucket='new']").click();
    await expect(tool).toContainText("Nia Byrne");

    await tool.locator(".hub-app-other summary").first().click();
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
    let confirmMessage = "";
    page.on("dialog", (dialog) => {
      confirmMessage = dialog.message();
      dialog.accept();
    });
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
    expect(confirmMessage).toContain("finish the full application");
    expect(confirmMessage).toContain("$50");
    expect(confirmMessage).toContain("$75");
    expect(confirmMessage).toContain("paused");
    expect(confirmMessage).not.toContain("—");
    await expect(tool).toContainText("Moved to background check.");
    await expect(tool).toContainText("secure link");
    await expect(tool).toContainText("does not include a Social Security number");
    await expect(tool.locator("[data-app-id='app-nia']")).toHaveCount(0);

    await tool.locator("[data-app-bucket='background']").click();
    const card = tool.locator("[data-app-id='app-nia']");
    await expect(card).toContainText("Background check in progress");
    await expect(card).toContainText("Full application received. Lists show the last 4 only.");
    await expect(card).not.toContainText("123-45-6789");
    await expect(card.locator("[data-app-send]")).toHaveCount(0);
    await expect(card.locator("[data-app-bg]")).toHaveCount(0);
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Lisa Sugrue");
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Sent the background check form.");
    await expect(tool.locator("[data-app-history='full_application_sent']")).toContainText("Sent the background check form.");
    await expect(card).toHaveAttribute("data-app-status", "background-check");
    await expect(tool).not.toContainText("token=");

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

  test("chair copies a driver's license and SSN without showing the full numbers", async ({ page }) => {
    const report = watchPage(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const withPartner = APPLICATIONS.map((row) => row.id === "app-nia" ? {
      ...row,
      partner_first_name: "Maeve",
      partner_last_name: "Byrne",
      partner_dl_last4: "4321",
      partner_ssn_last4: "9876",
      partner_dl_full: "G987654321098",
      partner_ssn_full: "987-65-4321"
    } : row);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: withPartner
      }
    });
    await page.locator("#hubAppsHomeLink").click();
    const tool = page.locator("#hubApplications");
    const nia = tool.locator("[data-app-id='app-nia']");
    const owen = tool.locator("[data-app-id='app-owen']");
    await expect(nia.locator("[data-app-dl]").first()).toContainText("Driver's license on file, last 4 only: ••••9012");
    await expect(nia.locator("[data-app-ssn]").first()).toContainText("SSN on file, last 4 only: •••-••-6789");
    await expect(nia.locator("[data-app-copy-kind='dl']")).toHaveCount(2);
    await expect(nia.locator("[data-app-copy-kind='ssn']")).toHaveCount(2);
    await expect(owen.locator("[data-app-copy]")).toHaveCount(0);
    await expect(tool).not.toContainText("F123456789012");
    await expect(tool).not.toContainText("123-45-6789");
    await expect(tool).not.toContainText("G987654321098");
    await expect(tool).not.toContainText("987-65-4321");

    const dlRow = nia.locator("[data-app-dl]").first();
    const dlText = await dlRow.locator("span").boundingBox();
    const dlBtn = await dlRow.locator("[data-app-copy]").boundingBox();
    expect(dlBtn.x).toBeGreaterThan(dlText.x);
    expect(Math.abs((dlBtn.y + dlBtn.height / 2) - (dlText.y + dlText.height / 2))).toBeLessThan(24);
    await nia.screenshot({ path: "/opt/cursor/artifacts/screenshots/membership-chair-copy-dl-ssn.png" });

    await nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='dl']").click();
    await expect(nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='dl']")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("F123456789012");
    await nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='ssn']").click();
    await expect(nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='ssn']")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("123-45-6789");
    await nia.locator("[data-app-copy-slot='partner'][data-app-copy-kind='dl']").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("G987654321098");
    await nia.locator("[data-app-copy-slot='partner'][data-app-copy-kind='ssn']").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("987-65-4321");

    await expect(tool).not.toContainText("F123456789012");
    await expect(tool).not.toContainText("123-45-6789");
    await expect(tool).not.toContainText("G987654321098");
    await expect(tool).not.toContainText("987-65-4321");
    await expect(nia.locator("[data-app-dl]").first()).toContainText("••••9012");
    await expect(nia.locator("[data-app-ssn]").first()).toContainText("•••-••-6789");
    assertHealthy(expect, report, "copy background check ids");
  });

  test("copy uses the reviewer reveal when the full number is not on the card", async ({ page }) => {
    const report = watchPage(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const masked = APPLICATIONS.map((row) => {
      if (row.id !== "app-nia") return row;
      const copy = { ...row };
      delete copy.ssn_full;
      delete copy.ssn;
      delete copy.id_digits;
      delete copy.dl_full;
      delete copy.driver_license;
      delete copy.dl;
      return copy;
    });
    await unlockMemberHub(page, {
      role: { officer: true, canReviewApplications: true, applications: masked }
    });
    await page.evaluate(() => {
      function query() {
        const builder = {
          select: () => builder,
          eq: () => builder,
          neq: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve) => resolve({ data: [], error: null })
        };
        return builder;
      }
      window.__kosSb = {
        from: () => query(),
        rpc: async (name, args) => {
          window.__revealArgs = args;
          if (name !== "reveal_membership_application_id") return { data: { ok: false, message: "no" } };
          if (args.p_kind === "dl") return { data: { ok: true, dl: "F123456789012" } };
          return { data: { ok: true, ssn: "123456789" } };
        }
      };
    });
    await page.locator("#hubAppsHomeLink").click();
    const nia = page.locator("#hubApplications [data-app-id='app-nia']");
    await nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='ssn']").click();
    await expect(nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='ssn']")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("123-45-6789");
    expect(await page.evaluate(() => window.__revealArgs)).toMatchObject({
      p_member_id: "app-nia",
      p_slot: "applicant",
      p_kind: "ssn"
    });
    await expect(nia).not.toContainText("123-45-6789");
    await expect(nia).not.toContainText("123456789");
    assertHealthy(expect, report, "copy through reveal");
  });
});
