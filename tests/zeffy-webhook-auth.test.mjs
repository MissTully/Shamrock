import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inferKind, ledgerProductKind } from "../supabase/functions/zeffy-webhook/infer-kind.mjs";
import { webhookAccess } from "../supabase/functions/zeffy-webhook/webhook-auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");
const receipts = readFileSync(join(root, "sql/kos_zeffy_webhook_receipts.sql"), "utf8");
const backfill = readFileSync(join(root, "sql/kos_zeffy_backfill_missed_nov2026.sql"), "utf8");
const docs = readFileSync(join(root, "PAYMENTS_SETUP.md"), "utf8");

test("header token or query token is accepted", () => {
  assert.deepEqual(webhookAccess("secret-value", "secret-value", null), {
    status: 200,
    error: null,
  });
  assert.deepEqual(webhookAccess("secret-value", null, "secret-value"), {
    status: 200,
    error: null,
  });
  assert.deepEqual(webhookAccess("secret-value", "secret-value", "wrong"), {
    status: 200,
    error: null,
  });
  assert.deepEqual(webhookAccess("secret-value", "wrong", "secret-value"), {
    status: 200,
    error: null,
  });
  assert.equal(webhookAccess("secret-value", "  secret-value  ", "").status, 200);
  assert.equal(webhookAccess("secret-value", "nope", "also-nope").status, 401);
  assert.equal(webhookAccess("secret-value", "", "").status, 401);
  assert.equal(webhookAccess("secret-value", null, null).status, 401);
  assert.equal(webhookAccess("", "secret-value", null).status, 500);
  assert.equal(webhookAccess(undefined, null, "secret-value").status, 500);
  assert.match(webhook, /x-zeffy-token/);
  assert.match(webhook, /ZEFFY_WEBHOOK_TOKEN/);
  assert.match(webhook, /searchParams\.get\("token"\)/);
  assert.match(webhook, /webhookAccess\(/);
});

test("a campaign name containing locker classifies as locker and stores as other", () => {
  const large = inferKind({}, {
    campaign_name: "Krewe locker rental - Large",
    description: "Krewe locker rental - Large",
    payer_email: "buyer@example.com",
  }, []);
  assert.equal(large, "locker");
  assert.equal(ledgerProductKind(large), "other");

  assert.equal(inferKind({}, {
    description: "Krewe locker rental - Small",
  }, []), "locker");
  assert.equal(inferKind({}, {
    campaign_name: "Parade locker hold",
    url: "https://example.com/events/parade",
  }, []), "locker");
  assert.equal(inferKind({}, {
    description: "Krewe Of Shamrock Membership",
    payer_email: "member@example.com",
  }, []), "dues");
  assert.equal(ledgerProductKind("dues"), "dues");
  assert.equal(ledgerProductKind("donation"), "donation");
  assert.equal(ledgerProductKind("locker"), "other");

  assert.match(webhook, /logicalKind === "locker"/);
  assert.match(webhook, /kos_claim_locker_from_payment/);
  assert.match(webhook, /ledgerProductKind\(logicalKind\)/);
  assert.match(webhook, /product_kind: productKind/);
  assert.match(webhook, /payment\.created/);
  assert.match(webhook, /payment\.updated/);
  assert.match(webhook, /payment\.completed/);
});

test("webhook receipts are service-role only", () => {
  assert.match(receipts, /NOT APPLIED/);
  assert.match(receipts, /create table if not exists public\.zeffy_webhook_receipts/);
  assert.match(receipts, /received_at/);
  assert.match(receipts, /event_type/);
  assert.match(receipts, /provider_event_id/);
  assert.match(receipts, /http_status/);
  assert.match(receipts, /error text/);
  assert.match(receipts, /payload jsonb/);
  assert.match(receipts, /enable row level security/);
  assert.match(receipts, /revoke all on table public\.zeffy_webhook_receipts from public, anon, authenticated/);
  assert.match(receipts, /grant all on table public\.zeffy_webhook_receipts to service_role/);
  assert.doesNotMatch(receipts, /create policy/i);
  assert.match(webhook, /zeffy_webhook_receipts/);
  assert.doesNotMatch(receipts, /\u2014/);
});

test("missed November backfill is idempotent and does not email", () => {
  assert.match(backfill, /NOT APPLIED/);
  assert.match(backfill, /on conflict \(provider_event_id\) do nothing/i);
  assert.match(backfill, /zeffy-backfill:2026-11-11:charles-powers:37500/);
  assert.match(backfill, /zeffy-backfill:2026-11-11:charles-powers:10000/);
  assert.match(backfill, /zeffy-backfill:2026-11-11:robyn-thornburg:7500/);
  assert.match(backfill, /zeffy-backfill:2026-11-12T07:53:gerry-logan:37500/);
  assert.match(backfill, /zeffy-backfill:2026-11-12T07:57:gerry-logan:37500/);
  assert.match(backfill, /zeffy-backfill:2026-11-15:tim-dyn:20000/);
  assert.match(backfill, /zeffy-backfill:2026-11-16:charles-bauder:20000/);
  assert.match(backfill, /zeffy-backfill:2026-11-17:charles-bauder:37500/);
  assert.match(backfill, /zeffy-backfill:2026-09-06:patrick-pustay:100/);
  assert.match(backfill, /Purpose to confirm/);
  assert.match(backfill, /RS1/);
  assert.match(backfill, /donation/);
  assert.match(backfill, /kos_payments_shop_order_emails/);
  assert.match(backfill, /shop test pencil/);
  assert.doesNotMatch(backfill, /kos_claim_locker_from_payment\s*\(/);
  assert.doesNotMatch(backfill, /@/);
  assert.doesNotMatch(backfill, /\u2014/);
  assert.match(docs, /Rotate the webhook token/);
  assert.match(docs, /ZEFFY_WEBHOOK_TOKEN/);
  assert.match(docs, /x-zeffy-token/);
  assert.match(docs, /Weekly reconcile/);
  assert.match(docs, /zeffy_webhook_receipts/);
  assert.doesNotMatch(docs.slice(docs.indexOf("## Rotate the webhook token")), /\u2014/);
});
