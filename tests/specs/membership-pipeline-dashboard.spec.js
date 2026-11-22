// Pipeline dashboard screenshots. Fixture people only. No live roster data.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

async function artifactShot(locator, file) {
  try {
    await locator.screenshot({ path: file, animations: "disabled", timeout: 4000 });
  } catch (err) {
    // These files are local preview shots. A missing folder or a dialog that
    // is off screen must not fail the checks above.
  }
}

const PIPELINE = [
  {
    id: "app-nia",
    first_name: "Nia",
    last_name: "Byrne",
    membership_status: "pending-new",
    phone: "813-555-0148",
    application_fee_type: "single",
    membership_level: "full",
    street_address: "12 River Street",
    city: "Tampa",
    state: "FL",
    zip: "33602",
    notes: "Would like to march.",
    created_at: "2026-11-18T15:00:00.000Z",
    stage_at: "2026-11-18T15:00:00.000Z"
  },
  {
    id: "app-alex",
    first_name: "Alex",
    last_name: "Quinn",
    membership_status: "bg_paid",
    application_fee_type: "dual",
    membership_level: "full",
    partner_member_id: "app-jordan",
    partner_first_name: "Jordan",
    partner_last_name: "Quinn",
    background_check_paid: true,
    background_check_amount_cents: 7500,
    background_check_paid_at: "2026-10-31T19:00:00.000Z",
    background_check_couple: true,
    stage_at: "2026-10-31T19:00:00.000Z",
    created_at: "2026-10-20T15:00:00.000Z"
  },
  {
    id: "app-jordan",
    first_name: "Jordan",
    last_name: "Quinn",
    membership_status: "bg_paid",
    application_fee_type: "dual",
    membership_level: "full",
    partner_member_id: "app-alex",
    partner_first_name: "Alex",
    partner_last_name: "Quinn",
    background_check_paid: true,
    background_check_amount_cents: 7500,
    background_check_paid_at: "2026-10-31T19:00:00.000Z",
    background_check_couple: true,
    stage_at: "2026-10-31T19:00:00.000Z",
    created_at: "2026-10-20T16:00:00.000Z"
  },
  {
    id: "app-sam",
    first_name: "Sam",
    last_name: "Patel",
    membership_status: "background-check",
    application_fee_type: "single",
    membership_level: "associate",
    background_check_paid: false,
    dues_paid: false,
    stage_at: "2026-11-02T20:00:00.000Z",
    created_at: "2026-10-12T15:00:00.000Z"
  },
  {
    id: "app-riley",
    first_name: "Riley",
    last_name: "Chen",
    membership_status: "bg_in_process",
    application_fee_type: "single",
    membership_level: "full",
    background_check_paid: true,
    background_check_amount_cents: 5000,
    background_check_paid_at: "2026-10-20T19:00:00.000Z",
    dues_paid: false,
    stage_at: "2026-11-02T20:00:00.000Z",
    created_at: "2026-10-01T15:00:00.000Z"
  },
  {
    id: "app-drew",
    first_name: "Drew",
    last_name: "Hale",
    membership_status: "dues-pending",
    application_fee_type: "single",
    membership_level: "full",
    background_check_paid: true,
    background_check_amount_cents: 5000,
    background_check_paid_at: "2026-10-22T19:00:00.000Z",
    dues_paid: false,
    stage_at: "2026-11-05T20:00:00.000Z",
    created_at: "2026-10-08T15:00:00.000Z"
  },
  {
    id: "app-morgan",
    first_name: "Morgan",
    last_name: "Ellis",
    membership_status: "active",
    application_fee_type: "dual",
    membership_level: "full",
    partner_member_id: "app-avery",
    background_check_paid: true,
    background_check_amount_cents: 7500,
    background_check_paid_at: "2026-10-31T19:00:00.000Z",
    background_check_couple: true,
    dues_paid: true,
    dues_amount_cents: 37500,
    dues_paid_at: "2026-11-03T20:00:00.000Z",
    stage_at: "2026-11-04T20:00:00.000Z",
    created_at: "2026-10-18T15:00:00.000Z"
  },
  {
    id: "app-avery",
    first_name: "Avery",
    last_name: "Ellis",
    membership_status: "active",
    application_fee_type: "dual",
    membership_level: "full",
    partner_member_id: "app-morgan",
    background_check_paid: true,
    background_check_amount_cents: 7500,
    background_check_paid_at: "2026-10-31T19:00:00.000Z",
    background_check_couple: true,
    dues_paid: true,
    dues_amount_cents: 37500,
    dues_paid_at: "2026-11-03T20:00:00.000Z",
    stage_at: "2026-11-04T20:00:00.000Z",
    created_at: "2026-10-18T16:00:00.000Z"
  }
];

test("dashboard shows the pipeline with mock applicants", async ({ page }) => {
  test.setTimeout(60_000);
  const report = watchPage(page);
  await unlockMemberHub(page, {
    role: { officer: true, canReviewApplications: true, applications: PIPELINE }
  });
  await page.setViewportSize({ width: 1680, height: 1200 });
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubApplications"]').click();
  const tool = page.locator("#hubApplications");
  await expect(tool.locator("[data-pipe='new']")).toContainText("Nia Byrne");
  await expect(tool.locator("[data-pipe='new']")).toContainText("Called, send background check email");
  await expect(tool.locator("[data-app-id='app-nia'] a[href='tel:8135550148']")).toHaveText("813-555-0148");
  await expect(tool.locator("[data-pipe='new']")).toContainText("Call notes");
  await expect(tool.locator("[data-pipe='fee_pending']")).toContainText("Sam Patel");
  await expect(tool.locator("[data-app-id='app-sam']")).toContainText("Full application not submitted yet");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Alex Quinn and Jordan Quinn");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Applying as: Couple");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Background check paid $75 couple, Oct 31");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Dues not paid");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Start background check");
  await expect(tool.locator("[data-pipe='bg_process']")).toContainText("Proceed with induction, send dues link");
  await expect(tool.locator("[data-app-id='app-morgan']")).toContainText("Dues paid $375 each on Nov 3");
  await expect(tool.locator("[data-app-id='app-morgan']")).toContainText("Journey complete");
  await expect(tool.locator("[data-pipe='active']")).toContainText("Members (complete)");
  await expect(tool.locator("[data-app-id='app-jordan']")).toHaveCount(0);
  await expect(tool.locator("[data-app-id='app-avery']")).toHaveCount(0);
  await expect(tool).not.toContainText("@");
  await expect(tool).not.toContainText("—");

  const couple = tool.locator("[data-app-id='app-alex']");
  await expect(couple).toBeVisible();
  await artifactShot(couple, "/opt/cursor/artifacts/join-dashboard-couple-card.png");
  await page.evaluate(() => {
    document.querySelectorAll(".krewe-music, .krewe-nav").forEach((el) => { el.style.display = "none"; });
    const pipe = document.querySelector("#hubApplications .hub-pipeline");
    const full = pipe ? pipe.scrollWidth : 1800;
    let node = pipe;
    while (node) {
      node.style.overflow = "visible";
      node.style.maxWidth = "none";
      node = node.parentElement;
    }
    const card = document.getElementById("hubApplications");
    if (pipe) pipe.style.width = (full + 40) + "px";
    if (card) card.style.width = (full + 80) + "px";
  });
  await artifactShot(tool, "/opt/cursor/artifacts/membership-dashboard-desktop.png");

  await tool.locator("[data-app-dues='app-riley']").click();
  await expect(tool.locator("#hubAppConfirm")).toBeVisible();
  await expect(tool.locator("#hubAppConfirmBody")).toContainText("Riley Chen");
  await expect(tool.locator("#hubAppConfirmBody")).toContainText("Full Krewe");
  await tool.locator("#hubInductionWhen").fill("Tuesday, January 6, 2026 at 7:00 PM");
  await tool.locator("#hubInductionPlace").fill("Krewe hall");
  await expect(tool.locator("#hubInductionPreview")).toContainText("why you want to join the Krewe");
  await expect(tool.locator("#hubInductionPreview")).toContainText("Pay dues on Zeffy");
  await artifactShot(tool.locator("#hubAppConfirm"), "/opt/cursor/artifacts/membership-induction-confirm.png");
  await page.evaluate(() => {
    const box = document.getElementById("hubAppConfirm");
    if (box) box.hidden = true;
  });

  await tool.locator("[data-app-approve='app-drew']").click();
  await expect(tool.locator("#hubAppConfirm")).toBeVisible();
  await expect(tool.locator("#hubAppConfirmTitle")).toContainText("Approve membership (subject to Board ratification)");
  await expect(tool.locator("#hubAppConfirmBody")).toContainText("training video");
  await artifactShot(tool.locator("#hubAppConfirm"), "/opt/cursor/artifacts/membership-approve-confirm.png");
  await page.evaluate(() => {
    const box = document.getElementById("hubAppConfirm");
    if (box) box.hidden = true;
  });

  await page.setViewportSize({ width: 390, height: 1400 });
  await page.addStyleTag({ content: ".krewe-nav,.krewe-music,.hub-tabs{display:none !important}" });
  await tool.locator("[data-app-bucket='board']").click();
  await expect(tool.locator("#hubPipe-new")).toHaveAttribute("open", "");
  await expect(tool.locator("#hubPipe-bg_paid")).not.toHaveAttribute("open", "");
  const phoneCol = tool.locator("#hubPipe-new");
  await phoneCol.scrollIntoViewIfNeeded();
  await expect(phoneCol).toBeVisible();
  await artifactShot(phoneCol, "/opt/cursor/artifacts/membership-dashboard-phone.png");
  assertHealthy(expect, report, "pipeline dashboard");
});

test("linked partner card keeps applicant 2 ids from the primary record", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, {
    role: {
      officer: true,
      canReviewApplications: true,
      applications: [
        {
          id: "app-alex",
          first_name: "Alex",
          last_name: "Quinn",
          membership_status: "background-check",
          application_fee_type: "dual",
          partner_member_id: "app-jordan",
          partner_first_name: "Jordan",
          partner_last_name: "Quinn",
          partner_dl_last4: "4321",
          partner_ssn_last4: "9876",
          partner_birthday: "1990-04-02",
          has_partner_dl: true,
          has_partner_ssn: true,
          created_at: "2026-10-20T15:00:00.000Z"
        },
        {
          id: "app-jordan",
          first_name: "Jordan",
          last_name: "Quinn",
          membership_status: "pending-new",
          application_fee_type: "dual",
          partner_member_id: "app-alex",
          created_at: "2026-10-20T16:00:00.000Z"
        }
      ]
    }
  });
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubApplications"]').click();
  const card = page.locator("#hubApplications [data-app-id='app-alex']");
  await expect(card).toContainText("Alex Quinn and Jordan Quinn");
  await expect(card).toContainText("Partner driver's license on file, last 4 only: ••••4321");
  await expect(card).toContainText("Partner SSN on file, last 4 only: •••-••-9876");
  await expect(card).toContainText("Partner date of birth: 04/02/1990");
  await expect(page.locator("#hubApplications [data-app-id='app-jordan']")).toHaveCount(0);
  assertHealthy(expect, report, "applicant 2 ids stay visible");
});

test("approve on a couple card targets the partner who is still waiting", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, {
    role: {
      officer: true,
      canReviewApplications: true,
      applications: [
        {
          id: "app-alex",
          first_name: "Alex",
          last_name: "Quinn",
          membership_status: "active",
          application_fee_type: "dual",
          partner_member_id: "app-jordan",
          background_check_paid: true,
          background_check_amount_cents: 7500,
          dues_paid: true,
          dues_amount_cents: 37500,
          created_at: "2026-10-01T15:00:00.000Z"
        },
        {
          id: "app-jordan",
          first_name: "Jordan",
          last_name: "Quinn",
          membership_status: "dues-pending",
          application_fee_type: "dual",
          partner_member_id: "app-alex",
          background_check_paid: true,
          background_check_amount_cents: 7500,
          dues_paid: true,
          dues_amount_cents: 37500,
          created_at: "2026-10-02T15:00:00.000Z"
        }
      ]
    }
  });
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubApplications"]').click();
  const tool = page.locator("#hubApplications");
  await expect(tool.locator("[data-app-approve]")).toHaveAttribute("data-app-approve", "app-jordan");
  await tool.locator("[data-app-approve='app-jordan']").click();
  await tool.locator("#hubAppConfirmYes").click();
  await expect(tool.locator("[data-app-approve]")).toHaveCount(0);
  await expect(tool.locator("[data-app-history='approve']")).toContainText("Jordan Quinn");
  assertHealthy(expect, report, "couple approve target");
});

test("journey email samples use fictional names", async ({ page }) => {
  await page.goto("/previews/prospect-background-check-email.html");
  await expect(page.locator("body")).toContainText("Pay the individual fee");
  await expect(page.locator("body")).toContainText("Pay the couple fee");
  await expect(page.locator("body")).not.toContainText("Pay Full Krewe dues");
  await expect(page.locator("body")).not.toContainText("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/background-check-email-preview.png",
    fullPage: true
  });

  await page.goto("/previews/dues-after-check-email.html");
  await expect(page.locator("#emailBody")).toContainText("Dear Alex");
  await expect(page.locator("#emailBody")).toContainText("Tuesday, January 6, 2026 at 7:00 PM");
  await expect(page.locator("#emailBody")).toContainText("Krewe hall");
  await expect(page.locator("#emailBody")).toContainText("why you want to join the Krewe");
  await expect(page.locator("#emailBody")).toContainText("Pay dues on Zeffy");
  await expect(page.locator("body")).not.toContainText("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/induction-dues-email-preview.png",
    fullPage: true
  });

  await page.goto("/previews/background-check-paid-chair-email.html");
  await expect(page.locator("#emailBody")).toContainText("Alex Quinn paid the $75 background check fee.");
  await expect(page.locator("#emailBody")).toContainText("Background check fee paid");
  await expect(page.locator("#emailBody a")).toHaveAttribute(
    "href",
    "https://www.kreweofshamrock.com/members.html#applications"
  );
  await page.screenshot({
    path: "/opt/cursor/artifacts/chair-alert-email-preview.png",
    fullPage: true
  });

  await page.goto("/previews/welcome-member-email.html");
  await expect(page.locator("#emailBody")).toContainText("kreweofshamrock.com/members.html");
  await expect(page.locator("#emailBody a[href='https://youtu.be/TQq0DlRQjvM?si=VN7_9JIyuUbxenvR']")).toHaveText("Member Hub training");
  await expect(page.locator("body")).not.toContainText("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/welcome-email-preview.png",
    fullPage: true
  });

  await page.goto("/previews/membership-interest-chair-email.html");
  await expect(page.locator("#emailBody")).toContainText("Applying as:");
  await expect(page.locator("#emailBody")).toContainText("Couple");
  await expect(page.locator("#emailBody")).toContainText("Jordan Quinn");
  await expect(page.locator("#emailBody a[href='tel:8135550148']")).toHaveText("813-555-0148");
  await expect(page.locator("#emailBody a[href='tel:8135550199']")).toHaveText("813-555-0199");
  await expect(page.locator("body")).not.toContainText("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/join-interest-chair-email.png",
    fullPage: true
  });
});
