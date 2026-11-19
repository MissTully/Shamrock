import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fn = readFileSync(join(root, "sql/kos_shop_backfill.sql"), "utf8");
const ready = readFileSync(join(root, "sql/kos_shop_backfill_kos_shop_nov2026.sql"), "utf8");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");

test("backfill function is idempotent and summary is opt-in", () => {
  assert.match(fn, /kos_backfill_shop_orders/);
  assert.match(fn, /already_recorded/);
  assert.match(fn, /chair_notice must be each or summary/);
  assert.match(fn, /kos_queue_shop_chair_summary/);
  assert.match(fn, /shop_receipt:/);
  assert.match(fn, /shop_po:/);
  assert.match(fn, /shop_po_summary:/);
  assert.match(fn, /kos_match_member_by_email/);
  assert.match(fn, /kos_match_member_by_name/);
  assert.match(fn, /revoke all on function public\.kos_backfill_shop_orders\(jsonb, text\) from public, anon, authenticated/);
  assert.doesNotMatch(fn, /tabirnley@gmail\.com/);
  assert.doesNotMatch(fn, /2d88980c-b0f9-474b-a8db-6f86a20b061d/);
});

test("ready-to-run list is the three KOS Shop orders and is not executed by the function file", () => {
  assert.match(ready, /NOT APPLIED/);
  assert.match(ready, /kos_backfill_shop_orders/);
  assert.match(ready, /'each'/);
  assert.match(ready, /summary/);
  assert.match(ready, /tabirnley@gmail\.com/);
  assert.match(ready, /kos-shop:2026-11-13T18:23Z:tabirnley@gmail\.com/);
  assert.match(ready, /tim\.dyn@verizon\.net/);
  assert.match(ready, /kos-shop:2026-11-15T17:00Z:tim\.dyn@verizon\.net/);
  assert.match(ready, /melissa@encountive\.com/);
  assert.match(ready, /2d88980c-b0f9-474b-a8db-6f86a20b061d/);
  assert.match(ready, /total_cents', 600/);
  assert.match(ready, /total_cents', 4500/);
  assert.match(ready, /total_cents', 2625/);
  assert.match(ready, /Krewe of Shamrock baseball cap/);
  assert.match(ready, /Zeffy tip/);
  assert.equal((ready.match(/kos_backfill_shop_orders/g) || []).length, 1);
});

test("webhook records shop payments that are not only payment.completed", () => {
  assert.match(webhook, /payment\.created/);
  assert.match(webhook, /payment\.updated/);
  assert.match(webhook, /order\.completed/);
  assert.match(webhook, /resolvePayment/);
  assert.match(webhook, /campaign_title/);
  assert.match(webhook, /loadedFromApi/);
  assert.match(webhook, /Shop \/ store before ticketing/);
});
