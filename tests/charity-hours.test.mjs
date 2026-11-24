import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const hours = require("../assets/kos-charity-hours.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_charity_volunteer_hours.sql"), "utf8");
const desk = readFileSync(join(root, "assets/members-desk.js"), "utf8");

const roster = {
  season_year: 2027,
  seasons: [2027, 2026],
  members: [
    {
      member_id: "m-nia",
      first_name: "Nia",
      last_name: "Byrne",
      membership_level: "full",
      logs: [
        { id: "n1", season_year: 2027, worked_on: "2026-09-12", activity: "Basket packing", hours: 8, source: "manual", status: "approved", approved_by: "Moira Quinn" },
        { id: "n2", season_year: 2027, worked_on: "2026-10-01", activity: "Gift cards for the pantry", hours: 6, source: "in_kind", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-patrick",
      first_name: "Patrick",
      last_name: "Doyle",
      membership_level: "full",
      logs: [
        { id: "p-ok", season_year: 2027, worked_on: "2026-09-12", activity: "Basket packing", hours: 2, source: "manual", status: "approved", approved_by: "Moira Quinn" },
        { id: "p-shift", season_year: 2027, worked_on: "2026-10-04", activity: "Float work day", hours: 4, source: "event_signup", status: "approved", event_id: "e1", event_name: "Float work day", approved_by: "Moira Quinn" },
        { id: "p-dup", season_year: 2027, worked_on: "2026-10-04", activity: "Float work day", hours: 3, source: "manual", status: "pending", event_id: "e1", event_name: "Float work day", notes: "Entered again after signup." },
        { id: "p-no", season_year: 2027, worked_on: "2026-08-01", activity: "Gift cards for the food pantry", hours: 2, source: "in_kind", status: "rejected", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-aisling",
      first_name: "Aisling",
      last_name: "Kelly",
      membership_level: "associate",
      logs: [
        { id: "a1", season_year: 2027, worked_on: "2026-07-04", activity: "Parade staging", hours: 4, source: "manual", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-sean",
      first_name: "Sean",
      last_name: "Murphy",
      membership_level: "full",
      logs: [
        { id: "s1", season_year: 2027, worked_on: "2026-11-02", activity: "Parade security", hours: 8, source: "door_checkin", status: "pending" }
      ]
    },
    {
      member_id: "m-maeve",
      first_name: "Maeve",
      last_name: "Quinn",
      membership_level: "auxiliary",
      logs: [
        { id: "q1", season_year: 2027, worked_on: "2026-08-20", activity: "Season hours on file", hours: 2, source: "manual", notes: "One-time season balance entered in the Hub.", status: "approved", approved_by: "Moira Quinn" }
      ]
    },
    {
      member_id: "m-liam",
      first_name: "Liam",
      last_name: "Walsh",
      membership_level: "loa",
      logs: []
    }
  ]
};

function view(extra) {
  return hours.prepare(roster, Object.assign({ season: 2027, query: "", filter: "all", sort: "name" }, extra));
}

test("current season is June through May, labeled by the ending year", () => {
  assert.equal(hours.seasonYear(new Date("2026-11-24T15:00:00Z")), 2027);
  assert.equal(hours.seasonYear(new Date("2026-06-01T16:00:00Z")), 2027);
  assert.equal(hours.seasonYear(new Date("2026-05-31T16:00:00Z")), 2026);
  assert.equal(hours.seasonLabel(2027), "June 2026 through May 2027");
  assert.equal(hours.seasonLabel(2027).includes("\u2014"), false);
});

test("full members show hours still needed and the $12 buyout", () => {
  const prepared = view();
  const nia = prepared.members.find((row) => row.member_id === "m-nia");
  const patrick = prepared.members.find((row) => row.member_id === "m-patrick");
  const sean = prepared.members.find((row) => row.member_id === "m-sean");
  const aisling = prepared.members.find((row) => row.member_id === "m-aisling");
  const liam = prepared.members.find((row) => row.member_id === "m-liam");
  assert.equal(nia.hours_logged, 14);
  assert.equal(nia.hours_needed, 0);
  assert.equal(nia.buyout_estimate, 0);
  assert.equal(hours.needLine(nia), "12 hour goal met");
  assert.equal(patrick.hours_logged, 9);
  assert.equal(patrick.hours_pending, 0);
  assert.equal(patrick.log_count, 4);
  assert.equal(patrick.hours_needed, 3);
  assert.equal(patrick.buyout_estimate, 36);
  assert.equal(sean.hours_logged, 8);
  assert.equal(sean.hours_needed, 4);
  assert.equal(sean.buyout_estimate, 48);
  assert.equal(aisling.is_full, false);
  assert.equal(aisling.hours_needed, null);
  assert.equal(aisling.buyout_estimate, null);
  assert.equal(hours.needLine(aisling), "12 hour goal not required");
  assert.equal(hours.levelLabel("loa"), "LOA");
  assert.equal(liam.hours_approved, 0);
  assert.equal(liam.log_count, 0);
});

test("log type, filters, sort, and duplicate warning", () => {
  const prepared = view();
  const patrick = prepared.members.find((row) => row.member_id === "m-patrick");
  const dup = patrick.logs.find((log) => log.id === "p-dup");
  const shift = patrick.logs.find((log) => log.id === "p-shift");
  const gift = patrick.logs.find((log) => log.id === "p-no");
  assert.equal(dup.possible_duplicate, true);
  assert.equal(shift.possible_duplicate, true);
  assert.equal(hours.logType(shift), "Shift");
  assert.equal(hours.logType(gift), "In-kind");
  assert.equal(hours.logType({ activity: "Season hours on file", source: "manual" }), "Season hours on file");
  assert.equal(hours.statusLabel(dup), "Pending");
  assert.equal(hours.statusLabel(gift), "Rejected");
  assert.deepEqual(view({ filter: "met" }).members.map((row) => row.member_id), ["m-nia"]);
  assert.deepEqual(view({ filter: "under" }).members.map((row) => row.member_id), ["m-patrick", "m-sean"]);
  assert.deepEqual(view({ filter: "duplicate" }).members.map((row) => row.member_id), ["m-patrick"]);
  assert.deepEqual(view({ query: "mae" }).members.map((row) => row.name), ["Maeve Quinn"]);
  assert.deepEqual(view({ sort: "hours" }).members.map((row) => row.first_name), ["Nia", "Patrick", "Sean", "Aisling", "Maeve", "Liam"]);
  assert.equal(prepared.pending.length, 2);
  assert.equal(prepared.pending[0].possible_duplicate, true);
  assert.equal(prepared.pending[1].id, "s1");
  const prior = view({ season: 2026 });
  assert.equal(prior.members.every((row) => row.hours_approved === 0 && row.log_count === 0), true);
});

test("csv lists the buyout and does not use a long dash", () => {
  const prepared = view({ sort: "name" });
  const csv = hours.toCsv(prepared.members, prepared.seasonLabel);
  assert.match(csv.split("\r\n")[0], /Name,Membership,Logged hours/);
  assert.match(csv, /Nia Byrne","Full","14"/);
  assert.match(csv, /Aisling Kelly","Associate","4","Not required","Not required"/);
  assert.match(csv, /June 2026 through May 2027/);
  assert.equal(csv.includes("\u2014"), false);
  assert.equal(hours.DUPLICATE_NOTE.includes("\u2014"), false);
  assert.equal(hours.rosterLine(prepared.members[1]).includes("\u2014"), false);
});

test("sql gates the roster and keeps the clover bonus trigger", () => {
  assert.match(sql, /create or replace function public\.kos_can_review_charity_hours\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /You cannot view other members'' volunteer hours\./);
  assert.match(sql, /revoke all on function public\.list_charity_volunteer_hours\(integer\) from public, anon/);
  assert.match(sql, /grant execute on function public\.list_charity_volunteer_hours\(integer\) to authenticated/);
  assert.match(sql, /revoke all on function public\.kos_volunteer_hours_possible_duplicate\(uuid, uuid, date, text, uuid\) from public, anon, authenticated/);
  assert.match(sql, /r\.role = 'committee'/);
  assert.match(sql, /charit\|fundrais/);
  assert.match(sql, /has_tool\(\$1\)/);
  assert.match(sql, /can_review_volunteer_inquiries/);
  assert.match(sql, /kos_member_chairs_committee/);
  assert.match(sql, /lower\(btrim\(seg\)\) = 'president'/);
  assert.match(sql, /kos_is_site_admin/);
  assert.equal(sql.includes("committee_interests"), false);
  assert.match(sql, /public\.kos_can_review_charity_hours\(\)/);
  assert.match(sql, /status = case when coalesce\(p_approved, false\) then 'approved' else 'rejected' end/);
  const dropAt = sql.indexOf("drop trigger if exists kos_volunteer_hours_clover_bonus on public.volunteer_hours");
  const backfillAt = sql.indexOf("set approved = true");
  assert.ok(dropAt !== -1 && backfillAt !== -1 && dropAt < backfillAt, "drop the Clover trigger before approving pending logs");
  assert.match(sql, /where status = 'pending'/);
  assert.equal(sql.includes("delete from public.clover_ledger"), false);
  assert.equal(sql.includes("kos_remove_volunteer_bonus_rows"), false);
  const ui = desk.slice(desk.indexOf("function renderCharityHours"), desk.indexOf("function bindCharityHours"));
  assert.equal(ui.includes("data-charity-approve"), false);
  assert.equal(ui.includes("Pending approvals"), false);
  assert.match(ui, /Logged hours/);
  assert.equal(ui.includes("\u2014"), false);
});
