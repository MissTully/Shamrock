import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inferKind } from "../supabase/functions/zeffy-webhook/infer-kind.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = readFileSync(join(root, "sql/kos_membership_pipeline_dashboard.sql"), "utf8");
const backfill = readFileSync(join(root, "sql/kos_background_check_payment_backfill.sql"), "utf8");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");

const CAMPAIGNS = {
  individual: {
    url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-individual",
    description: "Krewe of Shamrock Background Check - Individual"
  },
  couple: {
    url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-background-check-couple",
    description: "Krewe of Shamrock Background Check - Couple"
  }
};

test("background check campaigns do not steal dues", () => {
  assert.equal(inferKind({}, {
    campaign_type: "ticketing",
    campaign_category: "membership",
    description: "Krewe of Shamrock Membership",
    url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership",
    items: [{ type: "ticket", name: "Full Membership", amount: 37500 }]
  }, [CAMPAIGNS.individual.url], CAMPAIGNS), "dues");
  assert.equal(inferKind({}, {
    description: "Krewe of Shamrock Background Check — Individual",
    amount: 5000
  }, [], CAMPAIGNS), "background_check");
  assert.equal(inferKind({}, { description: "2026 dues" }, [], CAMPAIGNS), "dues");
});

test("dashboard SQL adds the kind, stops the early dues invoice, and alerts only new applicants", () => {
  assert.match(dashboard, /background_check/);
  assert.match(dashboard, /'bg_paid'/);
  assert.match(dashboard, /kos_apply_background_check_payment/);
  assert.match(dashboard, /notify/);
  assert.match(dashboard, /paid the \$/);
  assert.match(dashboard, /Open Membership Applications/);
  assert.match(dashboard, /kos_pass_background_check/);
  assert.match(dashboard, /kos_queue_dues_choice_email/);
  assert.match(dashboard, /Your dues link comes after the background check passes/);
  assert.doesNotMatch(
    dashboard.slice(dashboard.indexOf("function public.submit_membership_full_application")),
    /kos_queue_level_dues_invoice/
  );
  assert.match(dashboard, /Active members are never emailed/);
  assert.match(dashboard, /coalesce\(\s*dues_row\.amount_cents/);
  assert.match(dashboard, /'note', 'renewed'/);
  const noteFn = dashboard.slice(
    dashboard.indexOf("function public.save_membership_application_note"),
    dashboard.indexOf("function public.kos_pass_background_check")
  );
  assert.match(noteFn, /'bg_paid'/);
  const paidFn = dashboard.slice(
    dashboard.indexOf("function public.kos_application_dues_already_paid"),
    dashboard.indexOf("function public.save_membership_application_note")
  );
  assert.match(paidFn, /p\.partner_member_id = p_member_id/);
  assert.doesNotMatch(paidFn, /m\.partner_member_id/);
});

test("backfill completes the known couple without mail or a status change", () => {
  assert.match(backfill, /NOT APPLIED/);
  assert.match(backfill, /8ebf108a-80c4-432a-9ce0-13ce7196d55c/);
  assert.match(backfill, /0faff37d-3794-47e6-a665-ae47f87a4e53/);
  assert.match(backfill, /6740f3b2-40ce-404d-9081-971d5f967752/);
  assert.match(backfill, /7500/);
  assert.match(backfill, /75000/);
  assert.match(backfill, /2026-10-31/);
  assert.match(backfill, /2026-11-03 10:01/);
  assert.doesNotMatch(backfill, /insert into public\.payments/i);
  assert.doesNotMatch(backfill, /37500/);
  assert.match(backfill, /background_check_paid/);
  assert.match(backfill, /dues_pending/);
  assert.match(backfill, /dues_paid/);
  assert.match(backfill, /Dues paid \$375/);
  assert.match(backfill, /Induction pending/);
  assert.match(backfill, /start_background_check/);
  assert.match(dashboard, /bg_in_process/);
  assert.match(dashboard, /youtu\.be\/TQq0DlRQjvM/);
  assert.match(dashboard, /href="tel:/);
  assert.match(backfill, /skipped_backfill/);
  assert.match(backfill, /does not change membership_status/);
  assert.doesNotMatch(backfill, /enqueue_email/);
  assert.doesNotMatch(backfill, /kos_queue_level_dues_invoice/);
  assert.doesNotMatch(backfill, /kos_pass_background_check/);
  assert.doesNotMatch(backfill, /kos_apply_background_check_payment/);
  assert.doesNotMatch(backfill, /set\s+membership_status/i);
});

test("webhook classifies background checks and asks SQL to link them", () => {
  assert.match(webhook, /background_check_payments/);
  assert.match(webhook, /inferKind\(metadata, payment, duesUrls, backgroundCampaigns\)/);
  assert.match(webhook, /kos_apply_background_check_payment/);
  assert.match(webhook, /notify: true/);
});
