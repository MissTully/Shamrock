import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_v6_renewal_lapse.sql"), "utf8");
const renewal = readFileSync(join(root, "sql/kos_dues_renewal.sql"), "utf8");
const renewalsJs = readFileSync(join(root, "assets/kos-renewals.js"), "utf8");

const LIVE_ACTIONS = [
  "approve",
  "decline",
  "archive",
  "background_check",
  "background_check_paid",
  "start_background_check",
  "dues_pending",
  "dues_paid",
  "next_step_sent",
  "full_application_sent",
  "full_application_received",
  "id_revealed",
  "note",
  "renewed",
  "level_set",
  "background_check_fee_included"
];

function functionBody(source, name) {
  const start = source.indexOf("function public." + name);
  assert.notEqual(start, -1, name);
  const next = source.indexOf("\ncreate or replace function ", start + 10);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

test("pending-renewal approve is refused and changes nothing", () => {
  const decision = functionBody(sql, "_apply_membership_application_decision");
  assert.match(decision, /p_action = 'approve' and rec\.membership_status = 'pending-renewal'/);
  assert.match(
    decision,
    /Renewals are automatic when dues are paid\. For cash or check, use Officer desk, Renewals, Mark renewed\./
  );
  const refuseAt = decision.indexOf("pending-renewal' then");
  const updateAt = decision.indexOf("update public.members");
  assert.ok(refuseAt > -1 && refuseAt < updateAt);
  assert.match(decision, /p_action = 'approve' and rec\.membership_status not in \([\s\S]*'dues-pending', 'prospect'/);
  assert.doesNotMatch(
    decision.slice(decision.indexOf("p_action = 'approve' and rec.membership_status not in")),
    /'pending-renewal'/
  );
  assert.match(decision, /p_action = 'approve' and rec\.membership_status = 'dues-pending'/);
  assert.match(decision, /p_action = 'decline'/);
  assert.match(decision, /p_action = 'archive'/);
});

test("start background check waits for membership application ids", () => {
  const ready = functionBody(sql, "_kos_application_ids_ready");
  const decision = functionBody(sql, "_apply_membership_application_decision");
  assert.match(ready, /membership_application_ids/);
  assert.match(ready, /id_kind = 'ssn'/);
  assert.match(ready, /id_kind = 'dl'/);
  assert.match(ready, /person_slot = 'partner'/);
  assert.match(ready, /application_fee_type/);
  assert.match(decision, /p_action = 'start_background_check' and not public\._kos_application_ids_ready/);
  assert.match(
    decision,
    /The full application is not in yet\. Start the background check after they submit it\./
  );
});

test("action check keeps the 16 live values and adds lapsed and reactivation_sent", () => {
  const block = sql.slice(
    sql.indexOf("membership_application_actions_action_check"),
    sql.indexOf("create table if not exists public.kos_dues_settings")
  );
  LIVE_ACTIONS.forEach((action) => {
    assert.match(block, new RegExp("'" + action + "'"));
  });
  assert.match(block, /'lapsed'/);
  assert.match(block, /'reactivation_sent'/);
  assert.equal(LIVE_ACTIONS.length, 16);
});

test("dues event check adds member_lapsed and reactivation_started", () => {
  const block = sql.slice(
    sql.indexOf("kos_dues_events_event_type_check"),
    sql.indexOf("create table if not exists public.kos_dues_settings")
  );
  [
    "invoice_created",
    "invoice_emailed",
    "payment_recorded",
    "waiver_requested",
    "waiver_approved",
    "waiver_denied",
    "waiver_applied",
    "voided",
    "level_set",
    "officer_exemptions_batch"
  ].forEach((eventType) => {
    assert.match(block, new RegExp("'" + eventType + "'"));
  });
  assert.match(block, /'member_lapsed'/);
  assert.match(block, /'reactivation_started'/);
});

test("one dues exempt helper is used by renewals, candidates, and mark lapsed", () => {
  const exempt = functionBody(sql, "kos_is_dues_exempt");
  const rows = functionBody(sql, "kos_renewal_rows");
  const candidate = functionBody(sql, "_kos_is_lapse_candidate");
  const list = functionBody(sql, "kos_lapse_candidates");
  const mark = functionBody(sql, "kos_mark_lapsed");
  assert.match(exempt, /'officer', 'board', 'captain'/);
  assert.match(exempt, /BYLAWS: delete this one if/);
  assert.match(exempt, /kos_is_elected_officer_title/);
  assert.match(exempt, /d\.paid = true or coalesce\(d\.waiver_status, ''\) = 'applied'/);
  assert.match(rows, /not public\.kos_is_dues_exempt\(m\.id, v_year\)/);
  assert.match(candidate, /kos_is_dues_exempt/);
  assert.match(candidate, /join_date/);
  assert.match(candidate, /make_date\(p_year, 6, 1\)/);
  assert.match(list, /_kos_is_lapse_candidate/);
  assert.match(mark, /_kos_is_lapse_candidate/);
  assert.doesNotMatch(sql, /function public\._kos_lapse_exempt/);
  assert.match(list, /kos_can_manage_renewals\(\)/);
  assert.match(mark, /kos_can_manage_renewals\(\)/);
  assert.match(functionBody(sql, "kos_get_lapse_date"), /kos_can_manage_renewals\(\)/);
  assert.match(functionBody(sql, "kos_set_lapse_date"), /kos_can_manage_renewals\(\)/);
  assert.match(functionBody(sql, "kos_start_reactivation"), /kos_can_manage_renewals\(\)/);
  assert.match(functionBody(sql, "kos_default_lapse_date"), /make_date\(p_year, 8, 1\)/);
});

test("recorded Zeffy dues still activate lapsed and pending-renewal", () => {
  const payment = functionBody(renewal, "kos_record_payment");
  assert.match(payment, /'lapsed', 'pending-renewal'/);
  assert.match(payment, /Renewed via Zeffy dues payment/);
  assert.match(payment, /membership_status = 'active'/);
  const manage = functionBody(renewal, "kos_can_manage_renewals");
  assert.match(manage, /'treasurer'/);
});

test("renewals client hides the new buttons when the lapse RPCs are missing", () => {
  assert.match(renewalsJs, /PGRST202/);
  assert.match(renewalsJs, /Pending dues/);
  assert.match(renewalsJs, /lapseTools/);
  assert.match(renewalsJs, /kos_start_reactivation/);
  assert.match(renewalsJs, /I have checked this list/);
  assert.match(renewalsJs, /Your Krewe of Shamrock membership lapsed for the /);
});
