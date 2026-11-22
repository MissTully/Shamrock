import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_v7_treasurer_ledger.sql"), "utf8");
const v6 = readFileSync(join(root, "sql/kos_v6_renewal_lapse.sql"), "utf8");

function functionBody(source, name) {
  const start = source.indexOf("function public." + name);
  assert.notEqual(start, -1, name);
  const next = source.indexOf("\ncreate or replace function ", start + 10);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function quoted(block) {
  return Array.from(block.matchAll(/'([a-z_]+)'/g)).map((match) => match[1]);
}

test("v7 drops the officer write policy and revokes direct writes", () => {
  assert.match(sql, /drop policy if exists "dues_officer_write" on public\.dues_payments/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on table public\.dues_payments from anon, authenticated/);
  assert.match(sql, /revoke select on table public\.dues_payments from anon/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on table public\.payments from anon, authenticated/);
  assert.match(sql, /revoke select on table public\.payments from anon/);
  assert.match(
    sql,
    /revoke execute on function public\.kos_log_dues_event\(text, uuid, integer, jsonb\) from public, anon, authenticated/
  );
  assert.doesNotMatch(sql, /function public\.kos_record_payment/);
  assert.doesNotMatch(sql, /function public\.kos_is_dues_exempt/);
});

test("helpers use the decided title keys and site admin", () => {
  const cash = functionBody(sql, "kos_can_record_dues_cash");
  const waivers = functionBody(sql, "kos_can_approve_dues_waivers");
  const invoices = functionBody(sql, "kos_can_manage_invoices");
  for (const body of [cash, waivers, invoices]) {
    assert.match(body, /kos_is_site_admin\(\)/);
    assert.match(body, /kos_title_keys_in/);
  }
  assert.match(cash, /'treasurer', 'president', 'chair_membership'/);
  assert.match(waivers, /'president', 'treasurer'/);
  assert.doesNotMatch(waivers, /chair_membership/);
  assert.match(invoices, /'treasurer', 'president', 'chair_membership'/);
});

test("event check keeps every v6 value and adds payment_adjusted", () => {
  const v6Block = v6.slice(
    v6.indexOf("kos_dues_events_event_type_check"),
    v6.indexOf("create table if not exists public.kos_dues_settings")
  );
  const v7Block = sql.slice(
    sql.indexOf("kos_dues_events_event_type_check"),
    sql.indexOf("create or replace function public.kos_record_dues_receipt")
  );
  const v6Types = quoted(v6Block);
  assert.ok(v6Types.includes("member_lapsed"));
  assert.ok(v6Types.includes("reactivation_started"));
  v6Types.forEach((eventType) => {
    assert.match(v7Block, new RegExp("'" + eventType + "'"));
  });
  assert.match(v7Block, /'payment_adjusted'/);
});

test("guard patches raise when the live string is missing", () => {
  const patch = sql.slice(sql.indexOf("$patch_guards$"));
  assert.match(patch, /raise exception 'Guard patch: % is missing\.'/);
  assert.match(patch, /raise exception 'Guard patch: expected guard is missing in %\.'/);
  assert.match(patch, /if not public\.kos_can_approve_dues_waivers\(\) then/);
  assert.match(patch, /if not public\.kos_can_manage_invoices\(\) then/);
  assert.match(patch, /has_tool\(''dues_waivers''\)/);
  assert.match(patch, /has_tool\(''send_invoices''\)/);
  assert.match(patch, /if not public\.is_krewe_officer\(\) then/);
  assert.doesNotMatch(functionBody(sql, "kos_record_dues_receipt"), /kos_request_dues_waiver/);
  const welcome = sql.slice(sql.indexOf("$patch_welcome$"));
  assert.match(welcome, /raise exception 'Welcome copy patch: % is missing\.'/);
  assert.match(welcome, /raise exception 'Welcome copy patch: expected sentence is missing in %\.'/);
  assert.match(welcome, /final ratification by the Board of Directors/);
});

test("season owing uses kos_renewal_rows and not a role check", () => {
  const report = functionBody(sql, "kos_dues_season_report");
  assert.match(report, /kos_renewal_rows\(v_year\)/);
  assert.match(report, /owing_total/);
  assert.doesNotMatch(report, /member_role/);
  assert.match(sql, /Does not replace kos_is_dues_exempt|does not replace kos_is_dues_exempt|not replace kos_is_dues_exempt/i);
});
