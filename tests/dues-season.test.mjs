import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { duesSeasonYear, membershipYearForPayment } from "../supabase/functions/zeffy-webhook/infer-kind.mjs";
import season from "../assets/kos-dues-season.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_dues_renewal.sql"), "utf8");
const jan1 = readFileSync(join(root, "sql/kos_dues_season_jan1_fix.sql"), "utf8");
const badgeSql = readFileSync(join(root, "sql/kos_badge_awards.sql"), "utf8");
const invoiceSql = readFileSync(join(root, "sql/kos_officer_email_and_invoices.sql"), "utf8");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");

const dates = [
  "2026-06-01T05:00:00Z", // June 1, 2026, 1:00 AM Eastern
  "2026-11-21T16:00:00Z",
  "2027-01-01T05:00:00Z", // January 1, 2027, midnight Eastern
  "2027-05-31T16:00:00Z",
  "2027-06-01T04:30:00Z", // still May 31 Eastern
  "2027-06-01T05:00:00Z", // June 1, 2027 Eastern
  "2026-05-31T16:00:00Z"
];

test("dues season year matches the browser helper and keeps 2026 through May 2027", () => {
  for (const iso of dates) {
    const when = new Date(iso);
    assert.equal(duesSeasonYear(when), season.duesSeasonYear(when), iso);
  }
  assert.equal(duesSeasonYear(new Date("2026-11-21T16:00:00Z")), 2026);
  assert.equal(duesSeasonYear(new Date("2027-01-01T05:00:00Z")), 2026);
  assert.equal(duesSeasonYear(new Date("2027-05-31T16:00:00Z")), 2026);
  assert.equal(duesSeasonYear(new Date("2027-06-01T05:00:00Z")), 2027);
  assert.equal(duesSeasonYear(new Date("2026-05-31T16:00:00Z")), 2025);
  assert.equal(season.seasonLabel(2026), "2026-27");
});

test("a missing payload year uses the dues season, and an explicit year wins", () => {
  const now = new Date("2027-01-15T16:00:00Z");
  assert.equal(membershipYearForPayment({}, { amount: 37500 }, now), 2026);
  assert.equal(membershipYearForPayment({ membership_year: 2024 }, {}, now), 2024);
  assert.equal(membershipYearForPayment({}, { membership_year: "2028" }, now), 2028);
});

test("invoice due date is 30 days out and replaces a past date", () => {
  const issued = new Date("2026-11-21T16:00:00Z");
  assert.equal(season.invoiceDueDate(issued), "2026-12-21");
  assert.equal(season.noticeDueDate("2026-06-30", issued), "2026-12-21");
  assert.equal(season.noticeDueDate("2026-12-31", issued), "2026-12-31");
  assert.equal(season.noticeDueDate("", issued), "2026-12-21");
});

test("renewal SQL is a file for the owner, not a live update", () => {
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /oazwkwflgbthojvnclfc/);
  assert.match(sql, /krewe_volunteer_season_year/);
  assert.match(sql, /kos_dues_season_year/);
  assert.match(sql, /- 1/);
  assert.match(sql, /Renewed via Zeffy dues payment/);
  assert.match(sql, /in \('active', 'lapsed', 'pending-renewal'\)/);
  assert.match(sql, /kos_dues_invoice_due_date/);
  assert.match(sql, /unpaid_season/);
  assert.match(sql, /kos_mark_renewal_paid/);
  assert.match(sql, /v_partner_id uuid/);
  assert.doesNotMatch(sql, /v_partner uuid;\n  v_partner jsonb/);
  assert.doesNotMatch(sql, /lower\(btrim\(p\.first_name\)\) = lower\(v_first\)/);
  assert.match(sql, /make_date\(public\.kos_dues_season_year\(\), 6, 1\)/);
  assert.doesNotMatch(sql, /enqueue_email\([\s\S]{0,80}renew/i);
  assert.match(webhook, /membershipYearForPayment/);
  assert.match(webhook, /membership_year: membershipYear/);
  assert.doesNotMatch(sql, /—|–/);
});

test("January 1 dues fix uses the June-May season and is a file for the owner", () => {
  assert.match(jan1, /NOT APPLIED/);
  assert.match(jan1, /oazwkwflgbthojvnclfc/);
  assert.match(jan1, /kos_dues_season_year/);
  assert.match(jan1, /create or replace function public\.kos_member_parade_ready/);
  assert.match(jan1, /d\.membership_year = public\.kos_dues_season_year\(\)/);
  assert.match(jan1, /w\.season_year = public\.kos_dues_season_year\(\)/);
  assert.match(jan1, /make_date\(public\.kos_dues_season_year\(\), 6, 1\)/);
  assert.match(jan1, /make_date\(public\.kos_dues_season_year\(\) \+ 1, 6, 1\)/);
  const jan1Code = jan1.replace(/^--.*$/mg, "");
  assert.doesNotMatch(jan1Code, /extract\(year from current_date\)/);
  assert.doesNotMatch(jan1Code, /date_trunc\('year'/);
  assert.match(jan1, /v_year integer := coalesce\(p_year, public\.kos_dues_season_year\(\)\);/);
  assert.match(jan1, /officer_list_invoice_targets/);
  assert.match(jan1, /officer_create_and_send_invoices/);
  assert.match(jan1, /has_tool\('send_invoices'\)/);
  assert.doesNotMatch(jan1, /—|–/);
  assert.match(badgeSql, /d\.membership_year = public\.kos_dues_season_year\(\)/);
  assert.doesNotMatch(badgeSql, /kos_member_parade_ready[\s\S]{0,1200}extract\(year from current_date\)/);
  assert.match(invoiceSql, /coalesce\(p_year, public\.kos_dues_season_year\(\)\)/);
  assert.doesNotMatch(invoiceSql, /coalesce\(p_year, extract\(year from current_date\)/);
});
