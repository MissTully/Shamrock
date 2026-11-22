// Membership Applications officer tool. Role fixtures drive the Hub offline
// so this does not write to the live database.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const PREVIEW = path.join(__dirname, "../../docs/preview/membership-training-fixes");
fs.mkdirSync(PREVIEW, { recursive: true });

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

async function applicationsTile(page) {
  await expect(page.locator("#hubAppsHomeLink")).toHaveCount(0);
  await page.locator("[data-hub-tab='officer']").click();
  const tile = page.locator('[data-tool="tool:hubApplications"]');
  await expect(tile).toBeVisible();
  return tile;
}

async function openApplicationsTile(page) {
  const tile = await applicationsTile(page);
  await tile.click();
  return tile;
}

test.describe("Membership Applications", () => {
  test("officers who cannot review applications do not see the tool", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canReviewApplications: false } });
    await expect(page.locator("#hubAppsHomeLink")).toHaveCount(0);

    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubApprovals"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubApplications"]')).toHaveCount(0);
    await expect(page.locator("#hubEditJoiningPacket")).toHaveCount(0);
    assertHealthy(expect, report, "applications hidden");
  });

  test("reviewers open the list from home, see address and escaped notes, and approve", async ({ page }) => {
    const report = watchPage(page);
    const ready = APPLICATIONS.concat([{
      id: "app-riley",
      first_name: "Riley",
      last_name: "Chen",
      email: "riley.chen@example.com",
      phone: "813-555-0144",
      street_address: "8 Palm Way",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      notes: "Ready to approve.",
      membership_status: "dues-pending",
      membership_level: "full",
      application_fee_type: "single",
      background_check_paid: true,
      background_check_amount_cents: 5000,
      background_check_paid_at: "2026-10-31T19:00:00.000Z",
      dues_paid: true,
      dues_amount_cents: 37500,
      dues_paid_at: "2026-11-03T20:00:00.000Z",
      stage_at: "2026-11-03T20:00:00.000Z",
      created_at: "2026-10-01T15:00:00.000Z"
    }]);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: ready
      }
    });

    const tile = await applicationsTile(page);
    await expect(tile).toContainText("3 new applications");
    await tile.click();

    await expect(page.locator("[data-hub-panel='officer']")).toHaveClass(/hub-on/);
    const tool = page.locator("#hubApplications");
    await expect(tool).toBeVisible();
    await expect(tool.locator("h2")).toHaveText("Membership Applications");
    await expect(tool).toContainText("Call first");
    await expect(tool.locator("[data-pipe='fee_pending']")).toContainText("Background check fee pending");
    await expect(tool).toContainText("Call first. The card shows the phone number");
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
    await expect(tool).toContainText("Background check fee: $50 individual");
    await expect(tool).toContainText("not membership dues");
    await expect(tool).toContainText("Driver's license on file, last 4 only: ••••9012");
    await expect(tool).toContainText("SSN on file, last 4 only: •••-••-6789");
    await expect(tool).toContainText("Full application submitted. Lists show the last 4 only.");
    await expect(tool.locator("[data-app-bg='app-nia']")).toHaveText("Called, send background check email");
    await expect(tool.locator("[data-app-id='app-nia'] a[href='tel:8135550199']")).toHaveText("813-555-0199");
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
    await expect(tool).toContainText("Renewals");
    await expect(tool).not.toContainText("Nia Byrne");

    await tool.locator("[data-app-bucket='board']").click();
    await expect(tool).toContainText("Nia Byrne");

    await tool.locator("[data-app-approve='app-riley']").click();
    await expect(tool.locator("#hubAppConfirm")).toBeVisible();
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("voted them in at a general meeting");
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("training video");
    await tool.locator("#hubAppConfirmYes").click();
    await expect(tool).toContainText("Approved.");
    await expect(tool).toContainText("Create or reset your password");
    await expect(tool.locator("[data-app-id='app-riley']")).toHaveAttribute("data-app-status", "active");
    await expect(tool.locator("[data-app-history='approve']")).toContainText("Riley Chen");
    await expect(page.locator("#appOfficerBadge")).toHaveText("3");
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
        applications: APPLICATIONS.concat([{
          id: "app-sam",
          first_name: "Sam",
          last_name: "Patel",
          email: "sam.patel@example.com",
          membership_status: "bg_in_process",
          membership_level: "full",
          application_fee_type: "single",
          background_check_paid: true,
          background_check_amount_cents: 5000,
          background_check_paid_at: "2026-10-31T19:00:00.000Z",
          stage_at: "2026-10-31T19:00:00.000Z",
          created_at: "2026-10-12T15:00:00.000Z"
        }])
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
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await expect(tool.locator("[data-pipe='fee_pending']")).toContainText("Background check fee pending");
    await expect(tool.locator("[data-pipe='induction']")).toContainText("Induction pending");
    await expect(page.locator('[data-tool="tool:hubPayments"]')).toHaveCount(0);

    await tool.locator("#hubAppNote-app-nia").fill("Sent the background check form.");
    await tool.locator("[data-app-bg='app-nia']").click();
    expect(confirmMessage).toContain("full application");
    expect(confirmMessage).toContain("$50");
    expect(confirmMessage).toContain("$75");
    expect(confirmMessage).toContain("paused");
    expect(confirmMessage).toContain("does not include a dues link");
    expect(confirmMessage).not.toContain("—");
    await expect(tool).toContainText("Called.");
    await expect(tool).toContainText("a Social Security number");
    const card = tool.locator("[data-app-id='app-nia']");
    await expect(card).toContainText("Background check fee pending");
    await expect(card).toContainText("Full application submitted. Lists show the last 4 only.");
    await expect(card).not.toContainText("123-45-6789");
    await expect(card.locator("[data-app-send]")).toHaveCount(0);
    await expect(card.locator("[data-app-resend]")).toHaveText("Send background check email again");
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Lisa Sugrue");
    await expect(tool.locator("[data-app-history='background_check']")).toContainText("Sent the background check form.");
    await expect(tool.locator("[data-app-history='full_application_sent']")).toContainText("Sent the background check form.");
    await expect(card).toHaveAttribute("data-app-status", "background-check");
    await expect(tool).not.toContainText("token=");

    await tool.locator("[data-app-dues='app-sam']").click();
    await expect(tool.locator("#hubAppConfirm")).toBeVisible();
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("Full Krewe");
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("why they want to join");
    await expect(tool.locator("#hubAppConfirmBody")).not.toContainText("—");
    await tool.locator("#hubInductionWhen").fill("Tuesday, January 6, 2026 at 7:00 PM");
    await tool.locator("#hubInductionPlace").fill("Krewe hall");
    await expect(tool.locator("#hubInductionPreview")).toContainText("Tuesday, January 6, 2026 at 7:00 PM");
    await expect(tool.locator("#hubInductionPreview")).toContainText("Krewe hall");
    await expect(tool.locator("#hubInductionPreview")).toContainText("Pay dues on Zeffy");
    await tool.locator("#hubAppConfirmYes").click();
    await expect(tool).toContainText("Induction pending.");
    await expect(tool).toContainText("not the application fee");
    await expect(tool.locator("[data-app-id='app-sam']")).toHaveAttribute("data-app-status", "dues-pending");
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
      partner_ssn_full: "987-65-4321",
      application_fee_type: "dual",
      birthday: "1988-03-14",
      partner_birthday: "1991-07-22"
    } : row);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: withPartner
      }
    });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    const nia = tool.locator("[data-app-id='app-nia']");
    const owen = tool.locator("[data-app-id='app-owen']");
    await expect(nia.locator("[data-app-dl]").first()).toContainText("Driver's license on file, last 4 only: ••••9012");
    await expect(nia.locator("[data-app-ssn]").first()).toContainText("SSN on file, last 4 only: •••-••-6789");
    await expect(nia.locator("[data-app-dob][data-app-id-slot='applicant']")).toContainText("Date of birth: 03/14/1988");
    await expect(nia.locator("[data-app-dob][data-app-id-slot='partner']")).toContainText("Partner date of birth: 07/22/1991");
    await expect(nia.locator("[data-app-copy-kind='dl']")).toHaveCount(2);
    await expect(nia.locator("[data-app-copy-kind='ssn']")).toHaveCount(2);
    await expect(nia.locator("[data-app-copy-kind='dob']")).toHaveCount(2);
    await expect(nia).not.toContainText("1988-03-14");
    await expect(nia).not.toContainText("1991-07-22");
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
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await nia.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/membership-chair-copy-dl-ssn.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/membership_chair_dob_copy.png" });

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
    await nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='dob']").click();
    await expect(nia.locator("[data-app-copy-slot='applicant'][data-app-copy-kind='dob']")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("03/14/1988");
    await nia.locator("[data-app-copy-slot='partner'][data-app-copy-kind='dob']").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("07/22/1991");
    const dobRow = nia.locator("[data-app-dob][data-app-id-slot='applicant']");
    const dobText = await dobRow.locator("span").boundingBox();
    const dobBtn = await dobRow.locator("[data-app-copy]").boundingBox();
    expect(dobBtn.x).toBeGreaterThan(dobText.x);
    expect(Math.abs((dobBtn.y + dobBtn.height / 2) - (dobText.y + dobText.height / 2))).toBeLessThan(24);

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
    await openApplicationsTile(page);
    // The Hub module assigns window.__kosSb when it finishes loading. On a
    // slow runner that assignment lands after an earlier stub and the copy
    // never records the reveal call.
    await page.waitForFunction(() => !!(window.__kosSb && window.__kosSb.auth));
    await page.evaluate((role) => {
      if (typeof window.__kosHubSetRole === "function") window.__kosHubSetRole(role);
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
      const stub = {
        from: () => query(),
        rpc: async (name, args) => {
          window.__revealArgs = args;
          if (name !== "reveal_membership_application_id") return { data: { ok: false, message: "no" } };
          if (args.p_kind === "dl") return { data: { ok: true, dl: "F123456789012" } };
          return { data: { ok: true, ssn: "123456789" } };
        }
      };
      // A later Hub load used to replace this stub, so the copy succeeded
      // from a different client and __revealArgs stayed empty.
      Object.defineProperty(window, "__kosSb", {
        configurable: true,
        get: function () { return stub; },
        set: function () {}
      });
    }, { officer: true, canReviewApplications: true, applications: masked });
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

  test("reviewer previews and saves the joining packet draft", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: false,
        canReviewApplications: true,
        applications: APPLICATIONS
      }
    });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await expect(tool.locator("#hubEditJoiningPacket")).toHaveText("Edit joining packet email");
    await tool.locator("#hubEditJoiningPacket").click();

    await expect(tool.locator("h3")).toHaveText("Edit joining packet email");
    await expect(tool.locator("#hubPacketField-subject")).toHaveValue("We're glad you're joining the Krewe");
    await expect(tool.locator("#hubPacketField-greeting")).toHaveValue("Dear {{first_name}},");
    await expect(tool.locator("#hubPacketField-intro")).toHaveValue(/We're so glad you're joining the Krewe of Shamrock/);
    await expect(tool.locator("[data-packet-locked='finish']")).toContainText("Finish your application");
    await expect(tool.locator("[data-packet-locked='fees']")).toContainText("background check pay buttons");
    await expect(tool.locator("[data-packet-locked='dues']")).toContainText("No dues pay buttons");
    await expect(tool.locator("[data-packet-locked] input, [data-packet-locked] textarea")).toHaveCount(0);
    await expect(tool.locator("#hubPacketSave")).toBeDisabled();

    const fields = tool.locator("[data-packet-field]");
    const fieldCount = await fields.count();
    for (let i = 0; i < fieldCount; i++) {
      const value = await fields.nth(i).inputValue();
      expect(value).not.toMatch(/https?:\/\//i);
      expect(value).not.toContain("zeffy.com");
      expect(value).not.toContain("token=");
    }

    await tool.locator("#hubPacketField-greeting").fill("Hello {{first_name}}, welcome in.");
    await tool.locator("#hubPacketPreviewBtn").click();
    const preview = tool.locator("#hubPacketPreviewBody");
    await expect(preview).toContainText("Hello Nia, welcome in.");
    await expect(preview).toContainText("We're so glad you're joining the Krewe of Shamrock");
    await expect(preview.locator("h1")).toHaveText("We're glad you're joining the Krewe");
    const finish = preview.locator("a", { hasText: "Finish your application" });
    await expect(finish).toHaveAttribute(
      "href",
      "https://www.kreweofshamrock.com/membership-full-application.html?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    const html = await preview.innerHTML();
    expect(html.indexOf("Just you on the application.")).toBeGreaterThan(-1);
    expect(html.indexOf("Just you on the application.")).toBeLessThan(html.indexOf("Pay the individual fee"));
    expect(html.indexOf("Your dues link comes after the background check passes")).toBeGreaterThan(-1);
    expect(html).not.toContain("Pay Full Krewe dues");
    await expect(preview.locator("a", { hasText: "Pay the individual fee" })).toHaveAttribute(
      "href",
      "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-individual"
    );
    await expect(preview.locator("a", { hasText: "Pay the couple fee" })).toHaveAttribute(
      "href",
      "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-couple"
    );
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    await expect(tool).toContainText("This preview is not sent.");
    await expect(tool.locator("#hubPacketSave")).toBeEnabled();

    await page.screenshot({
      path: "/opt/cursor/artifacts/screenshots/joining-packet-editor.png",
      fullPage: true
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(tool.locator("#hubPacketSave")).toBeVisible();
    await expect(tool.locator("#hubPacketField-greeting")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await tool.locator("#hubPacketSave").click();
    await expect(tool.locator("#hubPacketFlash")).toContainText("Draft template saved");
    await expect(tool.locator("#hubPacketFlash")).toContainText("stay filled in automatically");
    await tool.screenshot({
      path: "/opt/cursor/artifacts/joining-packet-editor-saved.png",
      animations: "disabled"
    });

    await tool.locator("#hubPacketClose").click();
    await expect(tool.locator("#hubEditJoiningPacket")).toBeVisible();
    await expect(tool).toContainText("Nia Byrne");
    await tool.locator("#hubEditJoiningPacket").click();
    await expect(tool.locator("#hubPacketField-greeting")).toHaveValue("Hello {{first_name}}, welcome in.");

    await tool.locator("#hubPacketField-greeting").fill(
      "Pay at https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership"
    );
    await tool.locator("#hubPacketPreviewBtn").click();
    await expect(tool.locator("#hubPacketError")).toContainText("Payment links and web addresses");
    await expect(tool.locator("#hubPacketPreview")).toHaveCount(0);
    await expect(tool.locator("#hubPacketSave")).toBeDisabled();
    assertHealthy(expect, report, "joining packet editor");
  });

  test("chair saves a record note without sending the joining packet", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
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
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");

    await tool.locator("[data-app-bucket='prospect']").click();
    const casey = tool.locator("[data-app-id='app-casey']");
    await expect(casey).toContainText("Event prospect");
    await expect(casey).toContainText("Their note: Signed up for an event.");
    await expect(casey.locator("[data-app-save-note='app-casey']")).toHaveText("Save note");
    await expect(casey.locator("[data-app-bg='app-casey']")).toHaveText("Called, send background check email");
    await expect(casey).toContainText("leaves their stage as it is");

    await casey.locator("#hubAppNote-app-casey").fill("   ");
    const emptyDialog = new Promise((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.message());
        dialog.accept();
      });
    });
    await casey.locator("[data-app-save-note='app-casey']").click();
    expect(await emptyDialog).toContain("Write a note before saving.");
    await expect(tool.locator("[data-app-history='note']")).toHaveCount(0);
    await expect(casey).toHaveAttribute("data-app-status", "prospect");

    await casey.locator("#hubAppNote-app-casey").fill("Called about Tartan Ball. Badge 123456789");
    await casey.locator("[data-app-save-note='app-casey']").click();
    await expect(tool.locator("#hubAppFlash")).toContainText("Note saved on the record.");
    await expect(tool.locator("#hubAppFlash")).toContainText("background check email was not sent");
    await expect(casey).toHaveAttribute("data-app-status", "prospect");
    await expect(casey.locator("[data-app-record-note]")).toContainText("Record note:");
    await expect(casey.locator("[data-app-record-note]")).toContainText("Called about Tartan Ball.");
    await expect(casey.locator("[data-app-record-note]")).toContainText("[redacted]");
    await expect(casey.locator("[data-app-record-note]")).toContainText("Lisa Sugrue");
    await expect(casey).toContainText("Their note: Signed up for an event.");
    await expect(casey).not.toContainText("123456789");
    await expect(casey.locator("[data-app-bg='app-casey']")).toHaveText("Called, send background check email");
    await expect(tool.locator("[data-app-bucket='prospect']")).toContainText("Event prospects (1)");
    await expect(tool.locator("[data-app-history='note']")).toContainText("Casey Prospect");
    await expect(tool.locator("[data-app-history='note']")).toContainText("Called about Tartan Ball.");
    await expect(tool.locator("[data-app-history='note']")).toContainText("Event prospect");

    await page.screenshot({
      path: "/opt/cursor/artifacts/screenshots/event-prospect-save-note.png",
      fullPage: true
    });

    await tool.locator("[data-app-bucket='board']").click();
    const nia = tool.locator("[data-app-id='app-nia']");
    await expect(nia.locator("[data-app-save-note='app-nia']")).toBeVisible();
    await nia.locator("#hubAppNote-app-nia").fill("Left a voicemail.");
    await nia.locator("[data-app-save-note='app-nia']").click();
    await expect(nia).toHaveAttribute("data-app-status", "pending-new");
    await expect(nia.locator("[data-app-record-note]")).toContainText("Left a voicemail.");
    await expect(tool.locator("[data-pipe='new']")).toContainText("New interest");
    await expect(tool.locator("[data-pipe='new'] .hub-pipe-count")).toHaveText("3");
    await expect(page.locator("#appOfficerBadge")).toHaveText("3");

    await tool.locator("[data-app-bucket='renewal']").click();
    await expect(tool.locator("[data-app-save-note='app-rowan']")).toHaveText("Save note");
    assertHealthy(expect, report, "save record note");
  });

  test("renewal approval uses its own button and sends no welcome flash", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          {
            id: "app-john",
            first_name: "John",
            last_name: "Sample",
            email: "john.sample@example.com",
            membership_status: "pending-renewal",
            membership_level: "full",
            created_at: "2026-11-02T15:00:00.000Z"
          },
          {
            id: "app-nia",
            first_name: "Nia",
            last_name: "Test",
            email: "nia.test@example.com",
            membership_status: "dues-pending",
            membership_level: "full",
            dues_paid: true,
            created_at: "2026-11-03T15:00:00.000Z"
          }
        ]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await expect(tool.locator("[data-app-approve='app-nia']")).toHaveText("Approve membership (voted in at general meeting)");
    await tool.locator("[data-app-approve='app-nia']").click();
    await expect(tool.locator("#hubAppConfirmTitle")).toHaveText("Approve membership (voted in at general meeting)");
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("training video");
    await expect(tool.locator("#hubAppConfirmBody")).not.toContainText("Dues are not paid yet");
    await tool.locator("#hubAppConfirmNo").click();

    await tool.locator("[data-app-bucket='renewal']").click();
    await expect(tool.locator("[data-app-approve='app-john']")).toHaveText("Approve renewal");
    await tool.locator("[data-app-approve='app-john']").click();
    await expect(tool.locator("#hubAppConfirmTitle")).toHaveText("Approve renewal");
    await expect(tool.locator("#hubAppConfirmBody")).toHaveText("Make John Sample active again? No email is sent. They keep their current Member Hub login.");
    await expect(tool.locator("#hubAppConfirmYes")).toHaveText("Approve renewal");
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await tool.locator("#hubAppConfirm").screenshot({
      path: path.join(PREVIEW, "01-renewal-approve-dialog.png"),
      animations: "disabled"
    });
    await tool.locator("#hubAppConfirmYes").click();
    await expect(tool.locator("#hubAppFlash")).toHaveText("Renewed. They are active again and keep their current Member Hub login. No email was sent.");
    await expect(tool.locator("[data-app-id='app-john']")).toHaveCount(0);
    await tool.locator("[data-app-bucket='board']").click();
    await expect(tool.locator("[data-app-id='app-john']")).toHaveAttribute("data-app-status", "active");
    await expect(tool.locator("[data-app-approve='app-nia']")).toHaveText("Approve membership (voted in at general meeting)");
    assertHealthy(expect, report, "renewal approve");
  });

  test("induction approve warns when dues are unpaid and does not block", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          {
            id: "app-jane",
            first_name: "Jane",
            last_name: "Sample",
            email: "jane.sample@example.com",
            membership_status: "dues-pending",
            membership_level: "full",
            application_fee_type: "dual",
            partner_member_id: "app-john",
            partner_first_name: "John",
            partner_last_name: "Sample",
            dues_paid: false,
            created_at: "2026-11-01T15:00:00.000Z"
          },
          {
            id: "app-john",
            first_name: "John",
            last_name: "Sample",
            email: "john.sample@example.com",
            membership_status: "dues-pending",
            membership_level: "full",
            application_fee_type: "dual",
            partner_member_id: "app-jane",
            dues_paid: false,
            created_at: "2026-11-01T16:00:00.000Z"
          },
          {
            id: "app-nia",
            first_name: "Nia",
            last_name: "Test",
            email: "nia.test@example.com",
            membership_status: "dues-pending",
            membership_level: "full",
            dues_paid: true,
            created_at: "2026-11-04T15:00:00.000Z"
          }
        ]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await tool.locator("[data-app-approve='app-jane']").click();
    const body = tool.locator("#hubAppConfirmBody");
    await expect(body).toContainText("Dues are not paid yet for: Jane Sample and John Sample.");
    await expect(body).toContainText("You can still approve after the vote.");
    await expect(body).toContainText("voted them in at a general meeting");
    await expect(tool.locator("#hubAppConfirmYes")).toBeEnabled();
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await tool.locator("#hubAppConfirm").screenshot({
      path: path.join(PREVIEW, "04-approve-unpaid-warning.png"),
      animations: "disabled"
    });
    await tool.locator("#hubAppConfirmNo").click();
    await tool.locator("[data-app-approve='app-nia']").click();
    await expect(tool.locator("#hubAppConfirmBody")).not.toContainText("Dues are not paid yet");
    await expect(tool.locator("#hubAppConfirmBody")).toContainText("training video");
    await expect(tool.locator("#hubAppConfirmYes")).toBeEnabled();
    assertHealthy(expect, report, "unpaid dues warning");
  });

  test("couple induction preview shows one dues block per person", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          {
            id: "app-jane",
            first_name: "Jane",
            last_name: "Sample",
            email: "jane.sample@example.com",
            membership_status: "bg_in_process",
            membership_level: "full",
            application_fee_type: "dual",
            partner_member_id: "app-john",
            partner_first_name: "John",
            partner_last_name: "Sample",
            dues_paid: false,
            background_check_paid: true,
            created_at: "2026-11-01T15:00:00.000Z"
          },
          {
            id: "app-john",
            first_name: "John",
            last_name: "Sample",
            email: "john.sample@example.com",
            membership_status: "bg_in_process",
            membership_level: "full",
            application_fee_type: "dual",
            partner_member_id: "app-jane",
            dues_paid: false,
            background_check_paid: true,
            created_at: "2026-11-01T16:00:00.000Z"
          }
        ]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await tool.locator("[data-app-dues='app-jane']").click();
    await tool.locator("#hubInductionWhen").fill("Tuesday, January 6, 2026 at 7:00 PM");
    await tool.locator("#hubInductionPlace").fill("Krewe hall");
    const preview = tool.locator("#hubInductionPreview");
    await expect(preview).toContainText("Full Krewe");
    await expect(preview).toContainText("Jane Sample");
    await expect(preview).toContainText("John Sample");
    const html = await preview.innerHTML();
    expect(html.match(/\$375\.00/g)).toHaveLength(2);
    expect(html.match(/Pay dues on Zeffy/g)).toHaveLength(2);
    expect(html).toContain("On Zeffy, add one ticket for each person and put each person's name and email on their own ticket.");
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await tool.locator("#hubAppConfirm").screenshot({
      path: path.join(PREVIEW, "05-couple-induction-preview.png"),
      animations: "disabled"
    });
    assertHealthy(expect, report, "couple induction preview");
  });

  test("membership level select is hidden from induction and prices the preview", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          {
            id: "app-jane",
            first_name: "Jane",
            last_name: "Sample",
            email: "jane.sample@example.com",
            phone: "813-555-0140",
            membership_status: "pending-new",
            membership_level: "full",
            application_fee_type: "single",
            created_at: "2026-11-01T15:00:00.000Z"
          },
          {
            id: "app-john",
            first_name: "John",
            last_name: "Sample",
            email: "john.sample@example.com",
            membership_status: "bg_in_process",
            membership_level: "full",
            application_fee_type: "single",
            background_check_paid: true,
            dues_paid: false,
            created_at: "2026-11-02T15:00:00.000Z"
          },
          {
            id: "app-nia",
            first_name: "Nia",
            last_name: "Test",
            email: "nia.test@example.com",
            membership_status: "dues-pending",
            membership_level: "full",
            dues_paid: true,
            created_at: "2026-11-03T15:00:00.000Z"
          }
        ]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    const jane = tool.locator("[data-app-id='app-jane']");
    await expect(jane.locator("[data-app-level]")).toBeVisible();
    await expect(jane.locator("label[for='hubLevel-app-jane']")).toHaveText("Membership level");
    await expect(jane.locator("[data-app-level] option")).toHaveText([
      "Full Krewe, $375",
      "Associate, $450",
      "Auxiliary, $200",
      "Leave of absence, $100"
    ]);
    await expect(tool.locator("[data-app-id='app-john'] [data-app-level]")).toBeVisible();
    await expect(tool.locator("[data-app-id='app-nia'] [data-app-level]")).toHaveCount(0);
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await jane.screenshot({
      path: path.join(PREVIEW, "03-level-picker.png"),
      animations: "disabled"
    });
    await tool.locator("[data-app-id='app-john'] [data-app-level]").selectOption("associate");
    await tool.locator("[data-app-dues='app-john']").click();
    await expect(tool.locator("#hubInductionPreview")).toContainText("Associate");
    await expect(tool.locator("#hubInductionPreview")).toContainText("$450.00");
    await tool.locator("#hubAppConfirmNo").click();

    await page.setViewportSize({ width: 390, height: 844 });
    await tool.locator("[data-app-bucket='board']").click();
    const phoneCard = tool.locator("[data-app-id='app-jane']");
    await expect(phoneCard.locator("[data-app-level]")).toBeVisible();
    await phoneCard.screenshot({
      path: path.join(PREVIEW, "03-level-picker-phone.png"),
      animations: "disabled"
    });
    assertHealthy(expect, report, "membership level picker");
  });

  test("auxiliary fee included is only on an auxiliary fee-pending card", async ({ page }) => {
    const report = watchPage(page);
    let confirmMessage = "";
    page.on("dialog", (dialog) => {
      confirmMessage = dialog.message();
      dialog.accept();
    });
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [
          {
            id: "app-jane",
            first_name: "Jane",
            last_name: "Sample",
            email: "jane.sample@example.com",
            membership_status: "background-check",
            membership_level: "auxiliary",
            application_fee_type: "single",
            background_check_paid: false,
            created_at: "2026-11-01T15:00:00.000Z"
          },
          {
            id: "app-john",
            first_name: "John",
            last_name: "Sample",
            email: "john.sample@example.com",
            membership_status: "background-check",
            membership_level: "full",
            application_fee_type: "single",
            background_check_paid: false,
            created_at: "2026-11-02T15:00:00.000Z"
          },
          {
            id: "app-nia",
            first_name: "Nia",
            last_name: "Test",
            email: "nia.test@example.com",
            membership_status: "bg_paid",
            membership_level: "auxiliary",
            application_fee_type: "single",
            background_check_paid: false,
            created_at: "2026-11-03T15:00:00.000Z"
          }
        ]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    const jane = tool.locator("[data-app-id='app-jane']");
    await expect(jane.locator("[data-app-aux-fee]")).toHaveText("Auxiliary: fee included");
    await expect(jane).toContainText("Not paid yet");
    await expect(tool.locator("[data-app-id='app-john'] [data-app-aux-fee]")).toHaveCount(0);
    await expect(tool.locator("[data-app-id='app-nia'] [data-app-aux-fee]")).toHaveCount(0);
    await expect(tool.locator("[data-app-id='app-nia']")).toContainText("Included with Auxiliary");
    await expect(tool.locator("[data-app-start='app-nia']")).toHaveText("Start background check");
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await jane.screenshot({
      path: path.join(PREVIEW, "06-auxiliary-fee-included.png"),
      animations: "disabled"
    });
    await jane.locator("[data-app-aux-fee]").click();
    expect(confirmMessage).toBe("Auxiliary dues ($200) include the background check fee. Move Jane Sample to Background check fee paid without a fee payment? No email is sent.");
    await expect(tool.locator("[data-app-id='app-jane']")).toHaveAttribute("data-app-status", "bg_paid");
    await expect(tool.locator("[data-app-id='app-jane']")).toContainText("Included with Auxiliary");
    await expect(tool.locator("[data-app-start='app-jane']")).toHaveText("Start background check");
    await expect(tool.locator("[data-app-aux-fee='app-jane']")).toHaveCount(0);
    await expect(tool.locator("#hubAppFlash")).toContainText("No email was sent.");
    assertHealthy(expect, report, "auxiliary fee included");
  });

  test("joining packet preview shows the auxiliary background check line", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewApplications: true,
        applications: [{
          id: "app-nia",
          first_name: "Nia",
          last_name: "Test",
          email: "nia.test@example.com",
          membership_status: "pending-new",
          membership_level: "auxiliary",
          created_at: "2026-11-01T15:00:00.000Z"
        }]
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApplicationsTile(page);
    const tool = page.locator("#hubApplications");
    await tool.locator("#hubEditJoiningPacket").click();
    await tool.locator("#hubPacketPreviewBtn").click();
    const preview = tool.locator("#hubPacketPreview");
    await expect(preview).toContainText("You chose Auxiliary membership. Your $200 Auxiliary dues include the background check, so you do not pay this fee.");
    await expect(preview).toContainText("Nia");
    await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
    await preview.screenshot({
      path: path.join(PREVIEW, "07-bg-email-auxiliary.png"),
      animations: "disabled"
    });
    assertHealthy(expect, report, "auxiliary background email preview");
  });
});
