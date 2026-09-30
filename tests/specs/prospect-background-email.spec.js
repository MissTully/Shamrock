// Sample of the Move to background check prospect email.
// The live letter is built in SQL. This checks the rendered sample and that
// the SQL keeps the pause off and stores the payment links outside the HTML.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SQL = fs.readFileSync(
  path.join(__dirname, "../../sql/kos_prospect_background_check_email.sql"),
  "utf8"
);

const LINKS = [
  ["Complete the full application", "membership-full-application.html?token="],
  ["Pay the individual background check", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-individual"],
  ["Pay the couple background check", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-couple"],
  ["Pay Full Krewe Membership", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership"],
  ["Pay Associate membership", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership"],
  ["Pay Auxiliary membership", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership"],
  ["Pay Leave of Absence", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2"]
];

const EXPLAINERS = [
  ["One person on the application.", "Pay the individual background check"],
  ["Two people applying together.", "Pay the couple background check"],
  ["Voting membership. You march in all parades", "Pay Full Krewe Membership"],
  ["Associate membership does not include a vote", "Pay Associate membership"],
  ["This fee includes the background check and the membership portion.", "Pay Auxiliary membership"],
  ["This is leave of absence status.", "Pay Leave of Absence"]
];

test("prospect email sample shows an explainer before each pay link", async ({ page }) => {
  await page.goto("/previews/prospect-background-check-email.html");
  const body = page.locator("#emailBody");
  await expect(body).toContainText("Complete the full application");
  await expect(body).toContainText("Pay the background check");
  await expect(body).toContainText("Choose your membership");
  for (const [label, href] of LINKS) {
    const link = body.locator("a", { hasText: label });
    await expect(link).toHaveAttribute("href", new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const html = await body.innerHTML();
  for (const [note, label] of EXPLAINERS) {
    expect(html.indexOf(note)).toBeGreaterThan(-1);
    expect(html.indexOf(note)).toBeLessThan(html.indexOf(label));
  }
  expect(html).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  expect(html).not.toContain("—");
  await page.screenshot({
    path: "/opt/cursor/artifacts/screenshots/prospect-background-check-email.png",
    fullPage: true
  });
});

test("prospect email SQL stores links outside the letter and does not turn the pause on", async () => {
  expect(SQL).toContain("kos_prospect_background_check_email_html");
  expect(SQL).toContain("background_check_payments");
  expect(SQL).toContain("explainer");
  for (const [, href] of LINKS.slice(1)) expect(SQL).toContain(href);
  for (const [note] of EXPLAINERS) expect(SQL).toContain(note);
  expect(SQL).toContain("kos_membership_prospect_emails_enabled");
  expect(SQL).not.toMatch(/membership_prospect_emails'[\s\S]{0,200}'enabled',\s*true/);
  expect(SQL).not.toContain("update public.kos_runtime_flags");
});
