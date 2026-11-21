// Sample-data preview of Renew my membership and the Officer Desk renewals list.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

test("sample renewal preview shows one member, a couple, paid, the list, and a reminder", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/previews/renewal-flow.html");
  const single = page.locator("#shot-single");
  await expect(single).toContainText("Renew my membership");
  await expect(single).toContainText("Full");
  await expect(single).toContainText("$375");
  await expect(single).toContainText("Associate");
  await expect(single).toContainText("Auxiliary");
  await expect(single).toContainText("Leave of absence");
  await expect(single).toContainText("treasurer@kreweofshamrock.com");
  await expect(single).not.toContainText("Renew for both of us");

  const couple = page.locator("#shot-couple");
  await expect(couple).toContainText("Renew for both of us");
  await expect(couple).toContainText("Sage Harper");
  await expect(couple).toContainText("two tickets");

  await expect(page.locator("#shot-paid")).toContainText("paid for the");
  await expect(page.locator("#shot-paid")).toContainText("Full");

  const list = page.locator("#shot-list");
  await expect(list).toContainText("Rowan Blake");
  await expect(list).toContainText("Quinn Harper");
  await expect(list).toContainText("Lane Moss");
  await expect(list).toContainText("Mark renewed");
  await expect(list).toContainText("Download CSV");

  const reminder = page.locator("#shot-reminder");
  await expect(reminder).toContainText("This reminder would go to");
  await expect(reminder).toContainText("2");
  await expect(reminder).toContainText("Pay Full dues on Zeffy");
  await expect(reminder).toContainText("Pay Leave of absence dues on Zeffy");
  await expect(reminder.locator("#kosRenSend")).toBeVisible();

  const grouped = await page.evaluate(() => window.kosRenewalReminderHtml([
    { id: "a", first_name: "Rowan", last_name: "Blake", membership_level: "full", amount: 375, zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership" },
    { id: "b", first_name: "Lane", last_name: "Moss", membership_level: "full", amount: 375, zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership" }
  ], "2026-27"));
  expect(grouped).toContain("$375");
  expect(grouped).toContain("https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership");
  expect(grouped).toContain("Pay Full dues on Zeffy");
  expect(grouped).not.toContain("$0");
  expect(grouped).toContain("Hi friend");

  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[—–]/);
  assertHealthy(expect, report, "renewal preview");
});

test.describe("desktop renew link", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("home quick link opens the same renew card", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.evaluate(() => {
      window.__kosHubSetFeed({
        profile: {
          first_name: "Rowan",
          last_name: "Blake",
          email: "rowan.blake@example.com",
          member_role: "member",
          officer_title: ""
        },
        events: [],
        parades: [],
        paradeReady: { dues_paid: false, waiver_signed: false, meeting_attended: false },
        membershipStatus: "active"
      });
    });
    const link = page.locator("[data-hub-goto='renew']");
    await expect(link).toContainText("Renew my membership");
    await link.click();
    await expect(page.locator("#appSheet")).toBeVisible();
    await expect(page.locator("#appSheet")).toContainText("Renew my membership");
    await expect(page.locator("#appSheet")).toContainText("$375");
    assertHealthy(expect, report, "desktop renew link");
  });
});
