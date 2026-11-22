// Pipeline dashboard screenshots. Fixture people only. No live roster data.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const PIPELINE = [
  {
    id: "app-nia",
    first_name: "Nia",
    last_name: "Byrne",
    membership_status: "pending-new",
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
    membership_status: "dues-pending",
    application_fee_type: "single",
    membership_level: "associate",
    background_check_paid: true,
    background_check_amount_cents: 5000,
    background_check_paid_at: "2026-10-28T19:00:00.000Z",
    dues_paid: false,
    stage_at: "2026-11-02T20:00:00.000Z",
    created_at: "2026-10-12T15:00:00.000Z"
  },
  {
    id: "app-riley",
    first_name: "Riley",
    last_name: "Chen",
    membership_status: "dues-pending",
    application_fee_type: "single",
    membership_level: "full",
    background_check_paid: true,
    background_check_amount_cents: 5000,
    background_check_paid_at: "2026-10-20T19:00:00.000Z",
    dues_paid: true,
    dues_amount_cents: 37500,
    dues_paid_at: "2026-11-03T20:00:00.000Z",
    stage_at: "2026-11-03T20:00:00.000Z",
    created_at: "2026-10-01T15:00:00.000Z"
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
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubApplications"]').click();
  const tool = page.locator("#hubApplications");
  await expect(tool.locator("[data-pipe='new']")).toContainText("Nia Byrne");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Alex Quinn and Jordan Quinn");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Background check paid $75 couple, Oct 31");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Dues not paid");
  await expect(tool.locator("[data-app-id='app-alex']")).toContainText("Passed background check, send dues link");
  await expect(tool.locator("[data-app-id='app-morgan']")).toContainText("Dues paid $375 each on Nov 3");
  await expect(tool.locator("[data-app-id='app-morgan']")).toContainText("Journey complete");
  await expect(tool.locator("[data-app-id='app-jordan']")).toHaveCount(0);
  await expect(tool.locator("[data-app-id='app-avery']")).toHaveCount(0);
  await expect(tool).not.toContainText("@");
  await expect(tool).not.toContainText("—");

  const couple = tool.locator("[data-app-id='app-alex']");
  await expect(couple).toBeVisible();
  await couple.screenshot({
    path: "/opt/cursor/artifacts/membership-couple-bg-paid.png",
    animations: "disabled"
  });
  await tool.screenshot({
    path: "/opt/cursor/artifacts/membership-dashboard-desktop.png",
    animations: "disabled"
  });

  await tool.locator("[data-app-dues='app-alex']").click();
  await expect(tool.locator("#hubAppConfirm")).toBeVisible();
  await expect(tool.locator("#hubAppConfirmBody")).toContainText("Alex Quinn and Jordan Quinn");
  await expect(tool.locator("#hubAppConfirmBody")).toContainText("Full Krewe");
  await tool.locator("#hubAppConfirm").screenshot({
    path: "/opt/cursor/artifacts/membership-passed-confirm.png",
    animations: "disabled"
  });
  await page.evaluate(() => {
    const box = document.getElementById("hubAppConfirm");
    if (box) box.hidden = true;
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: ".krewe-nav,.krewe-music,.app-tabbar{display:none !important}" });
  await tool.locator("[data-app-bucket='board']").click();
  await expect(tool.locator("#hubPipe-new")).toHaveAttribute("open", "");
  await expect(tool.locator("#hubPipe-bg_paid")).not.toHaveAttribute("open", "");
  const stack = tool.locator(".hub-pipeline");
  await stack.scrollIntoViewIfNeeded();
  await expect(stack).toBeVisible();
  await stack.screenshot({
    path: "/opt/cursor/artifacts/membership-dashboard-phone.png"
  });
  assertHealthy(expect, report, "pipeline dashboard");
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
  page.once("dialog", (dialog) => dialog.accept());
  await tool.locator("[data-app-approve='app-jordan']").click();
  await expect(tool.locator("[data-app-approve]")).toHaveCount(0);
  await expect(tool.locator("[data-app-history='approve']")).toContainText("Jordan Quinn");
  assertHealthy(expect, report, "couple approve target");
});

test("dues and chair alert samples use fictional names", async ({ page }) => {
  await page.goto("/previews/dues-after-check-email.html");
  await expect(page.locator("#emailBody")).toContainText("Dear Alex");
  await expect(page.locator("#emailBody")).toContainText("Pay Full Krewe dues");
  await expect(page.locator("#emailChoices")).toContainText("No membership level is on your application yet");
  await expect(page.locator("body")).not.toContainText("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/dues-email-preview.png",
    fullPage: true
  });

  await page.goto("/previews/background-check-paid-chair-email.html");
  await expect(page.locator("#emailBody")).toContainText("Alex Quinn paid the $75 background check fee.");
  await expect(page.locator("#emailBody a")).toHaveAttribute(
    "href",
    "https://www.kreweofshamrock.com/members.html#applications"
  );
  await page.screenshot({
    path: "/opt/cursor/artifacts/chair-alert-email-preview.png",
    fullPage: true
  });
});
