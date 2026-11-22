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
  ["Finish your application", "membership-full-application.html?token="],
  ["Pay the individual fee", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-individual"],
  ["Pay the couple fee", "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-couple"]
];

const EXPLAINERS = [
  ["Just you on the application.", "Pay the individual fee"],
  ["The two of you, applying together.", "Pay the couple fee"]
];

test("prospect email sample shows an explainer before each pay link", async ({ page }) => {
  await page.goto("/previews/prospect-background-check-email.html");
  const body = page.locator("#emailBody");
  await expect(body).toContainText("We're so glad you're joining the Krewe of Shamrock");
  await expect(body).toContainText("Let's finish your application");
  await expect(body).toContainText("Your background check fee");
  await expect(body).toContainText("Membership dues come later");
  await expect(body).toContainText("Your dues link comes after the background check passes");
  await expect(body).not.toContainText("Pay Full Krewe dues");
  await expect(body).toContainText("treasurer@kreweofshamrock.com");
  await expect(body).toContainText("Welcome to the Krewe. We can't wait to have you with us.");
  await expect(body).not.toContainText("If you didn't ask to join");
  await expect(body).toContainText("Sláinte");
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
  expect(html).not.toContain("Pay Full Krewe dues");
  expect(html).not.toContain("Pay Associate dues");
  expect(html).not.toContain("zeffy.com/en-US/ticketing/krewe-of-shamrock-membership");
  await page.screenshot({
    path: "/opt/cursor/artifacts/background-check-email.png",
    fullPage: true
  });
});

test("prospect email SQL stores links outside the letter and does not turn the pause on", async () => {
  expect(SQL).toContain("kos_prospect_background_check_email_html");
  expect(SQL).toContain("background_check_payments");
  expect(SQL).toContain("explainer");
  for (const [, href] of LINKS.slice(1)) expect(SQL).toContain(href);
  for (const [note] of EXPLAINERS) expect(SQL).toContain(note.replaceAll("'", "''"));
  expect(SQL).toContain("We''re so glad you''re joining the Krewe of Shamrock");
  expect(SQL).toContain("We''re glad you''re joining the Krewe");
  expect(SQL).toContain("Welcome to the Krewe. We can''t wait to have you with us.");
  expect(SQL).not.toContain("didn''t ask to join");
  expect(SQL).toContain("kos_membership_prospect_emails_enabled");
  expect(SQL).not.toMatch(/membership_prospect_emails'[\s\S]{0,200}'enabled',\s*true/);
  expect(SQL).not.toContain("update public.kos_runtime_flags");
  expect(SQL).toContain("kos_prospect_background_check_email_html(text,text,jsonb)");
  expect(SQL).toContain("kos_joining_packet_email_subject");
});

test("joining packet template SQL keeps payment links out of the editable letter", () => {
  const templateSql = fs.readFileSync(
    path.join(__dirname, "../../sql/kos_joining_packet_email_template.sql"),
    "utf8"
  );
  expect(templateSql).toContain("kos_joining_packet_template");
  expect(templateSql).toContain("on conflict (id) do nothing");
  expect(templateSql).toContain("save_joining_packet_email_template");
  expect(templateSql).toContain("preview_joining_packet_email");
  expect(templateSql).toContain("get_joining_packet_email_template");
  expect(templateSql).toContain("can_review_applications");
  expect(templateSql).toContain("{{first_name}}");
  expect(templateSql).toContain("background_check_payments");
  expect(templateSql).toContain("kos_dues_catalog");
  expect(templateSql).toContain("kos_joining_packet_email_subject");
  expect(templateSql).toContain("repeat('a', 64)");
  expect(templateSql).not.toContain("zeffy.com");
  expect(templateSql).not.toMatch(/membership_prospect_emails'[\s\S]{0,200}'enabled',\s*true/);
  expect(templateSql).not.toContain("update public.kos_runtime_flags");
  const previewFn = templateSql.slice(
    templateSql.indexOf("function public.preview_joining_packet_email"),
    templateSql.indexOf("function public.save_joining_packet_email_template")
  );
  const saveFn = templateSql.slice(
    templateSql.indexOf("function public.save_joining_packet_email_template"),
    templateSql.indexOf("function public.send_membership_full_application")
  );
  expect(previewFn).not.toContain("enqueue_email");
  expect(saveFn).not.toContain("enqueue_email");
  expect(templateSql).toContain("v_subject");
  const defaults = templateSql.slice(
    templateSql.indexOf("kos_joining_packet_email_defaults"),
    templateSql.indexOf("revoke all on function public.kos_joining_packet_email_defaults")
  );
  expect(defaults).toContain("We're glad you're joining the Krewe");
  expect(defaults).toContain("We're so glad you're joining the Krewe of Shamrock");
  expect(defaults).toContain("Membership dues come later");
  expect(defaults).toContain("Your dues link comes after the background check passes");
  expect(defaults).toContain("The rest of this note is simply how to finish joining");
  expect(defaults).not.toContain("The Membership Chair has opened the background check");
  expect(defaults).not.toContain("does not include a dues pay button");
  expect(defaults).not.toMatch(/https?:\/\//);
  expect(defaults).not.toContain("—");
  expect(templateSql).not.toContain("Pay Full Krewe dues");

  const seedSql = fs.readFileSync(
    path.join(__dirname, "../../sql/kos_joining_packet_template_seed.sql"),
    "utf8"
  );
  expect(seedSql).toContain("create table if not exists public.kos_joining_packet_template");
  expect(seedSql).toContain("on conflict (id) do nothing");
  expect(seedSql).toContain("kos_prospect_background_check_email_html(text, text, jsonb)");
  expect(seedSql).toContain("jsonb_build_object('fee_type', coalesce(rec.application_fee_type, ''))");
  expect(seedSql).toContain("Membership dues come later");
  expect(seedSql).toContain("The rest of this note is simply how to finish joining");
  expect(seedSql).not.toContain("The Membership Chair has opened the background check");
  expect(seedSql).not.toContain("does not include a dues pay button");
  expect(seedSql).not.toContain("Pay Full Krewe dues");
  expect(seedSql).not.toContain("update public.kos_runtime_flags");
  expect(seedSql).not.toMatch(/membership_prospect_emails'[\s\S]{0,200}'enabled',\s*true/);

  const invoiceSql = fs.readFileSync(
    path.join(__dirname, "../../sql/kos_membership_background_check_invoice.sql"),
    "utf8"
  );
  const sendFn = invoiceSql.slice(
    invoiceSql.indexOf("function public.send_membership_full_application"),
    invoiceSql.indexOf("function public.submit_membership_full_application")
  );
  expect(sendFn).toContain("kos_prospect_background_check_email_html(text,text,jsonb)");
  expect(sendFn).toContain("jsonb_build_object('fee_type', coalesce(rec.application_fee_type, ''))");
  expect(sendFn).not.toContain("Pay Full Krewe dues");
  expect(sendFn).toContain("does not include a dues link");
});
