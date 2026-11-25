import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules = require("../assets/kos-roles-access-rules.js");

const NOW = new Date("2026-11-14T18:00:00-05:00");

function viewer(extra) {
  return Object.assign({
    id: "tim",
    canChangeAnyTitle: false,
    canChangeChairTitles: false,
    isAdmin: false,
    isOfficerBoardOrChair: true,
    grantable: rules.toolsForTitles(["president"])
  }, extra);
}

test("next June 30 rolls forward after that day", () => {
  assert.equal(rules.nextGrantEnd(new Date("2026-11-14T12:00:00-05:00")), "2027-06-30");
  assert.equal(rules.nextGrantEnd(new Date("2026-06-29T12:00:00-04:00")), "2026-06-30");
  assert.equal(rules.nextGrantEnd(new Date("2026-06-30T12:00:00-04:00")), "2027-06-30");
  assert.equal(rules.nextGrantEnd(new Date("2026-07-01T12:00:00-04:00")), "2027-06-30");
});

test("nobody can grant a tool to themselves", () => {
  const self = viewer({ id: "tammy", grantable: ["shop_studio"] });
  assert.equal(rules.canGrantTool(self, "shop_studio", "tammy"), false);
  assert.equal(rules.canGrantTool(self, "shop_studio", "riley"), true);
  assert.equal(rules.canEditTitle(self, rules.titleByKey("cochair_merchandise"), "tammy"), false);
});

test("Membership Chair can change chair titles only", () => {
  const lisa = viewer({
    id: "lisa",
    canChangeAnyTitle: false,
    canChangeChairTitles: true,
    grantable: rules.toolsForTitles(["chair_membership"])
  });
  assert.equal(rules.canEditTitle(lisa, rules.titleByKey("president"), "riley"), false);
  assert.equal(rules.canEditTitle(lisa, rules.titleByKey("board_member"), "riley"), false);
  assert.equal(rules.canEditTitle(lisa, rules.titleByKey("chair_parade"), "riley"), true);
  assert.equal(rules.canEditTitle(lisa, rules.titleByKey("cochair_merchandise"), "riley"), true);
});

test("President can change any title", () => {
  const tim = viewer({ id: "tim", canChangeAnyTitle: true });
  assert.equal(rules.canEditTitle(tim, rules.titleByKey("treasurer"), "riley"), true);
  assert.equal(rules.canEditTitle(tim, rules.titleByKey("chair_finance"), "riley"), true);
});

test("a past end date does not allow the tool", () => {
  const grant = { ends_on: "2026-06-30" };
  assert.equal(rules.grantAllows(grant, "active", NOW), false);
  assert.equal(rules.grantState(grant, "active", NOW), "expired");
  const open = { ends_on: "2027-06-30" };
  assert.equal(rules.grantAllows(open, "active", NOW), true);
});

test("a lapsed member's unexpired grant pauses and resumes when active", () => {
  const grant = { ends_on: "2027-06-30" };
  assert.equal(rules.grantState(grant, "lapsed", NOW), "paused");
  assert.equal(rules.grantAllows(grant, "lapsed", NOW), false);
  assert.equal(rules.grantState(grant, "inactive", NOW), "paused");
  assert.equal(rules.grantState(grant, "active", NOW), "live");
  assert.equal(rules.grantAllows(grant, "active", NOW), true);
  assert.equal(rules.grantState(grant, "pending-renewal", NOW), "live");
});

test("a grant that needs review still works while the member is active", () => {
  const grant = { ends_on: "2027-06-30", needs_review: true };
  assert.equal(rules.grantState(grant, "active", NOW), "review");
  assert.equal(rules.grantAllows(grant, "active", NOW), true);
});

test("undo is 7 days for the officer who made the change, and always for President", () => {
  const recent = { actorId: "lisa", createdAt: "2026-11-10T15:00:00-05:00", undone: false, hasNewer: false };
  const old = { actorId: "lisa", createdAt: "2026-01-01T15:00:00-05:00", undone: false, hasNewer: false };
  const lisa = viewer({ id: "lisa", canChangeAnyTitle: false });
  const tim = viewer({ id: "tim", canChangeAnyTitle: true });
  assert.equal(rules.canUndo(recent, lisa, NOW), true);
  assert.equal(rules.canUndo(old, lisa, NOW), false);
  assert.equal(rules.canUndo(old, tim, NOW), true);
  assert.equal(rules.canUndo(recent, viewer({ id: "patrick" }), NOW), false);
  assert.equal(rules.canUndo(Object.assign({}, recent, { hasNewer: true }), tim, NOW), false);
});

test("handover keeps extra grants with the outgoing member", () => {
  const preview = rules.handoverPreview({
    fromTitles: ["cochair_merchandise"],
    titleKey: "cochair_merchandise",
    extras: ["email_members"],
    keepTools: ["shop_studio"]
  });
  assert.deepEqual(preview.stays, ["email_members"]);
  assert.ok(preview.lostUnlessKept.includes("shop_studio"));
  assert.ok(!preview.lostUnlessKept.includes("email_members"));
  assert.deepEqual(preview.kept, ["shop_studio"]);
  assert.deepEqual(preview.remaining, []);
});

test("tools that came only from a removed title drop unless kept", () => {
  const diff = rules.accessDiff({
    beforeTitles: ["cochair_merchandise"],
    afterTitles: [],
    beforeExtras: ["email_members"],
    afterExtras: ["email_members"],
    keepTools: ["shop_studio"]
  });
  assert.deepEqual(diff.removedTitles, ["cochair_merchandise"]);
  assert.ok(diff.onlyFromRemoved.includes("shop_studio"));
  assert.ok(!diff.onlyFromRemoved.includes("email_members"));
  assert.deepEqual(diff.kept, ["shop_studio"]);
  assert.ok(diff.droppedWithTitle.includes("reports.merch"));
  assert.ok(!diff.droppedWithTitle.includes("shop_studio"));
});

test("merchandise co-chairs include merchandise reports, and finance reports sit on treasurer", () => {
  const merch = rules.toolsForTitles(["cochair_merchandise"]);
  assert.ok(merch.includes("reports.merch"));
  assert.ok(merch.includes("shop_studio"));
  assert.ok(!merch.includes("reports.finance"));
  assert.ok(!merch.includes("reports"));
  const treasurer = rules.toolsForTitles(["treasurer"]);
  assert.ok(treasurer.includes("reports.finance"));
  assert.ok(treasurer.includes("payments"));
  assert.ok(treasurer.includes("renewals"));
  assert.ok(!treasurer.includes("applications"));
  const president = rules.toolsForTitles(["president"]);
  assert.ok(president.includes("reports.finance"));
  assert.ok(president.includes("applications"));
  assert.ok(president.includes("renewals"));
  assert.ok(rules.toolsForTitles(["chair_membership"]).includes("renewals"));
  assert.ok(!rules.toolsForTitles(["secretary"]).includes("renewals"));
  const finance = rules.toolsForTitles(["chair_finance"]);
  assert.ok(finance.includes("reports.finance"));
});
