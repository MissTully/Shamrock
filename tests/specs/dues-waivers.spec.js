// Officer desk Dues waivers (Phase 3): request, approve+apply, deny,
// elected-officer batch confirm, and paid cash rows left untouched.
const { test, expect } = require("@playwright/test");

const ADA = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";
const CAL = "33333333-3333-4333-8333-333333333333";
const DEE = "44444444-4444-4444-8444-444444444444";
const EVE = "55555555-5555-4555-8555-555555555555";
const FINN = "66666666-6666-4666-8666-666666666666";
const GINA = "77777777-7777-4777-8777-777777777777";
const HOLLY = "88888888-8888-4888-8888-888888888888";
const SAM = "99999999-9999-4999-8999-999999999999";

async function mountWaivers(page) {
  await page.goto("/raffle-qr-sheet.html");
  await page.evaluate(({ ada, bea, cal, dee, eve, finn, gina, holly, sam }) => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);

    const members = [
      { id: ada, first_name: "Ada", last_name: "Lane", email: "ada@example.com", membership_level: "full", officer_title: "", membership_status: "active" },
      { id: bea, first_name: "Bea", last_name: "Moss", email: "bea@example.com", membership_level: "associate", officer_title: "", membership_status: "active" },
      { id: cal, first_name: "Cal", last_name: "Pitt", email: "cal@example.com", membership_level: "full", officer_title: "", membership_status: "active" },
      { id: dee, first_name: "Dee", last_name: "Shaw", email: "dee@example.com", membership_level: "full", officer_title: "President", membership_status: "active" },
      { id: eve, first_name: "Eve", last_name: "Nash", email: "eve@example.com", membership_level: "loa", officer_title: "", membership_status: "active" },
      { id: finn, first_name: "Finn", last_name: "Chair", email: "finn@example.com", membership_level: "full", officer_title: "Committee Chair of Finance", membership_status: "active" },
      { id: gina, first_name: "Gina", last_name: "Cole", email: "gina@example.com", membership_level: "full", officer_title: "Treasurer · Committee Chair of Finance", membership_status: "active" },
      { id: holly, first_name: "Holly", last_name: "Cash", email: "holly@example.com", membership_level: "full", officer_title: "Vice President", membership_status: "active" },
      { id: sam, first_name: "Sam", last_name: "Service", email: "sam@example.com", membership_level: "full", officer_title: "Secretary", membership_status: "active" }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, active: true },
      { membership_year: 2026, level: "associate", amount: 450, active: true },
      { membership_year: 2026, level: "loa", amount: 100, active: true },
      { membership_year: 2026, level: "auxiliary", amount: 200, active: true }
    ];
    const dues = [
      { id: "d-ada", member_id: ada, membership_year: 2026, amount: 375, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-cal", member_id: cal, membership_year: 2026, amount: 375, paid: true, payment_method: "cash", notes: "Paid at the meeting.", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-dee", member_id: dee, membership_year: 2026, amount: 375, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-eve", member_id: eve, membership_year: 2026, amount: 100, paid: false, payment_method: null, notes: "Waiver requested (service_in_lieu): Float build hours", membership_level: "loa", standard_amount: 100, waiver_kind: "service_in_lieu", waiver_status: "requested", waiver_requested_by: "pat@example.com" },
      { id: "d-finn", member_id: finn, membership_year: 2026, amount: 375, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-holly", member_id: holly, membership_year: 2026, amount: 375, paid: true, payment_method: "cash", notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-sam", member_id: sam, membership_year: 2026, amount: 0, paid: true, payment_method: "waiver", notes: "Waiver applied (service_in_lieu).", membership_level: "full", standard_amount: 375, waiver_kind: "service_in_lieu", waiver_status: "applied", waiver_requested_by: "pat@example.com", waiver_approved_by: "treasurer@kreweofshamrock.com", waiver_approved_at: "2026-09-01T15:00:00.000Z" }
    ];
    const events = [
      { id: "e-eve", event_type: "waiver_requested", actor: "pat@example.com", member_id: eve, membership_year: 2026, payload: { reason: "Float build hours" }, created_at: "2026-09-10T15:00:00.000Z" },
      { id: "e-sam", event_type: "waiver_requested", actor: "pat@example.com", member_id: sam, membership_year: 2026, payload: { reason: "Parade weekend crew" }, created_at: "2026-08-20T15:00:00.000Z" }
    ];
    const tables = { members, kos_dues_catalog: catalog, dues_payments: dues, kos_dues_events: events };
    window.__kosWaiverTables = tables;

    function elected(title) {
      return String(title || "").split(/\s*·\s*/).some((part) =>
        /^(president|vice president|secretary|treasurer)$/i.test(part.trim())
      );
    }

    function catalogAmount(level, year) {
      const row = catalog.find((c) => c.membership_year === year && c.level === (level || "full") && c.active);
      if (!row) return 375;
      return Number(row.amount);
    }

    function findDues(memberId, year) {
      return dues.find((d) => d.member_id === memberId && d.membership_year === year);
    }

    function chain(table) {
      const filters = [];
      let range = null;
      const c = {
        select() { return c; },
        eq(col, val) { filters.push(["eq", col, val]); return c; },
        is(col, val) { filters.push(["is", col, val]); return c; },
        in(col, vals) { filters.push(["in", col, vals]); return c; },
        order() { return c; },
        range(from, to) { range = [from, to]; return c; },
        then(resolve, reject) {
          let rows = (tables[table] || []).slice();
          filters.forEach((f) => {
            if (f[0] === "eq") rows = rows.filter((r) => r[f[1]] === f[2]);
            if (f[0] === "is" && f[2] == null) rows = rows.filter((r) => r[f[1]] == null);
            if (f[0] === "in") rows = rows.filter((r) => (f[2] || []).indexOf(r[f[1]]) !== -1);
          });
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return c;
    }

    window.__kosWaiverCalls = [];
    window.__kosSb = {
      rpc: async (name, args) => {
        window.__kosWaiverCalls.push({ name, args: args || null });
        if (name === "is_krewe_officer") return { data: true };
        if (name === "kos_request_dues_waiver") {
          const member = members.find((m) => m.id === args.p_member_id);
          const row = findDues(args.p_member_id, args.p_year);
          if (row && row.paid && row.payment_method !== "waiver") {
            return { data: { ok: false, message: "This year is already paid. It was not changed." } };
          }
          if (row && (row.waiver_status === "applied" || (row.paid && row.payment_method === "waiver"))) {
            return { data: { ok: false, message: "A waiver is already applied for this year." } };
          }
          const line = "Waiver requested (" + args.p_kind + ")" + (args.p_reason ? ": " + args.p_reason : "");
          let target = row;
          if (!target) {
            target = {
              id: "d-new-" + args.p_member_id,
              member_id: args.p_member_id,
              membership_year: args.p_year,
              amount: catalogAmount(member && member.membership_level, args.p_year),
              paid: false,
              payment_method: null,
              notes: line,
              membership_level: member && member.membership_level,
              standard_amount: catalogAmount(member && member.membership_level, args.p_year),
              waiver_kind: args.p_kind,
              waiver_status: "requested",
              waiver_requested_by: "officer@kreweofshamrock.com"
            };
            dues.push(target);
          } else {
            target.waiver_kind = args.p_kind;
            target.waiver_status = "requested";
            target.waiver_requested_by = "officer@kreweofshamrock.com";
            target.notes = target.notes ? target.notes + "\n" + line : line;
            target.paid = false;
          }
          events.push({
            id: "e-req-" + events.length,
            event_type: "waiver_requested",
            actor: "officer@kreweofshamrock.com",
            member_id: args.p_member_id,
            membership_year: args.p_year,
            payload: { reason: args.p_reason || "" },
            created_at: "2026-09-30T18:00:00.000Z"
          });
          return {
            data: {
              ok: true,
              paid: false,
              waiver_status: "requested",
              waiver_kind: args.p_kind,
              message: "Waiver requested. The member is not marked paid."
            }
          };
        }
        if (name === "kos_decide_dues_waiver") {
          const row = findDues(args.p_member_id, args.p_year);
          const member = members.find((m) => m.id === args.p_member_id);
          if (!row) return { data: { ok: false, message: "No dues row for that member and year." } };
          if (row.paid && row.payment_method !== "waiver" && Number(row.amount) > 0) {
            return { data: { ok: false, message: "This year is already paid in money. It was not changed." } };
          }
          if (!args.p_approve) {
            row.waiver_status = "denied";
            events.push({
              id: "e-deny-" + events.length,
              event_type: "waiver_denied",
              actor: "treasurer@kreweofshamrock.com",
              member_id: args.p_member_id,
              membership_year: args.p_year,
              payload: { waiver_kind: row.waiver_kind },
              created_at: "2026-09-30T18:05:00.000Z"
            });
            return {
              data: {
                ok: true,
                waiver_status: "denied",
                paid: row.paid,
                message: "Waiver denied. The member was not marked paid."
              }
            };
          }
          const std = catalogAmount((row.membership_level || (member && member.membership_level)), args.p_year);
          if (args.p_apply !== false) {
            row.amount = 0;
            row.paid = true;
            row.payment_method = "waiver";
            row.standard_amount = std;
            row.waiver_status = "applied";
            row.waiver_approved_by = "treasurer@kreweofshamrock.com";
            row.waiver_approved_at = "2026-09-30T18:10:00.000Z";
            events.push({
              id: "e-apply-" + events.length,
              event_type: "waiver_applied",
              actor: "treasurer@kreweofshamrock.com",
              member_id: args.p_member_id,
              membership_year: args.p_year,
              payload: {},
              created_at: "2026-09-30T18:10:00.000Z"
            });
            return {
              data: {
                ok: true,
                waiver_status: "applied",
                amount: 0,
                standard_amount: std,
                paid: true,
                payment_method: "waiver",
                message: "Waiver applied. Amount due is $0.00. Standard amount kept for the books: $" + std.toFixed(2) + "."
              }
            };
          }
          row.waiver_status = "approved";
          return { data: { ok: true, waiver_status: "approved", paid: row.paid, message: "Waiver approved. It is not applied yet." } };
        }
        if (name === "kos_apply_elected_officer_exemptions") {
          let applied = 0;
          let skippedPaid = 0;
          let skippedOther = 0;
          members.forEach((m) => {
            if (!elected(m.officer_title)) return;
            const row = findDues(m.id, args.p_year);
            if (row && row.paid && row.payment_method !== "waiver" && Number(row.amount) > 0) {
              skippedPaid += 1;
              return;
            }
            if (row && row.waiver_status === "applied" && row.waiver_kind && row.waiver_kind !== "elected_officer") {
              skippedOther += 1;
              return;
            }
            const std = catalogAmount(m.membership_level, args.p_year);
            if (!row) {
              dues.push({
                id: "d-batch-" + m.id,
                member_id: m.id,
                membership_year: args.p_year,
                amount: 0,
                paid: true,
                payment_method: "waiver",
                notes: "",
                membership_level: m.membership_level,
                standard_amount: std,
                waiver_kind: "elected_officer",
                waiver_status: "applied",
                waiver_requested_by: "officer@kreweofshamrock.com",
                waiver_approved_by: "officer@kreweofshamrock.com",
                waiver_approved_at: "2026-09-30T18:20:00.000Z"
              });
            } else {
              row.amount = 0;
              row.paid = true;
              row.payment_method = "waiver";
              row.standard_amount = std;
              row.waiver_kind = "elected_officer";
              row.waiver_status = "applied";
              row.waiver_approved_by = row.waiver_approved_by || "officer@kreweofshamrock.com";
              row.waiver_approved_at = row.waiver_approved_at || "2026-09-30T18:20:00.000Z";
            }
            applied += 1;
          });
          return {
            data: {
              ok: true,
              year: args.p_year,
              applied,
              skipped_paid_cash: skippedPaid,
              skipped_other_waiver: skippedOther,
              message: "Applied elected-officer exemptions for " + applied +
                " member(s). Skipped " + skippedPaid +
                " already paid in money and " + skippedOther +
                " covered by another waiver."
            }
          };
        }
        return { data: null };
      },
      from(table) { return chain(table); }
    };
  }, {
    ada: ADA, bea: BEA, cal: CAL, dee: DEE, eve: EVE, finn: FINN, gina: GINA, holly: HOLLY, sam: SAM
  });
  await page.addScriptTag({ url: "/assets/kos-dues-waivers.js?v=20260930wav1" });
  await expect(page.locator("#hubDuesWaivers")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#hubWavQueue")).toContainText("Eve Nash", { timeout: 8000 });
}

async function duesRow(page, memberId) {
  return page.evaluate((id) => {
    return window.__kosWaiverTables.dues_payments.find((d) => d.member_id === id) || null;
  }, memberId);
}

test("request records a waiver without marking the member paid", async ({ page }) => {
  await mountWaivers(page);
  const card = page.locator("#hubDuesWaivers");

  await expect(card.locator("#hubWavYear")).toHaveValue("2026");
  await expect(card).not.toContainText("zeffy.com");
  const early = await page.evaluate(() => window.__kosWaiverCalls.map((c) => c.name));
  expect(early).not.toContain("kos_request_dues_waiver");
  expect(early).not.toContain("kos_decide_dues_waiver");
  expect(early).not.toContain("kos_apply_elected_officer_exemptions");

  await card.locator("#hubWavSearch").fill("Dee");
  await card.locator("#hubWavPick").getByRole("button", { name: "Dee Shaw" }).click();
  await expect(card.locator("#hubWavKind")).toHaveValue("elected_officer");
  await expect(card.locator("#hubWavSuggest")).toContainText("President");
  await card.locator("#hubWavReason").fill("Bylaws exemption");
  await card.getByRole("button", { name: "Request waiver" }).click();
  await expect(card.locator("#hubWavMsg")).toContainText("not marked paid");
  await expect(card.locator("#hubWavQueue")).toContainText("Dee Shaw");
  await expect(card.locator("#hubWavQueue")).toContainText("Elected officer exemption");
  await expect(card.locator("#hubWavQueue")).toContainText("Bylaws exemption");
  await expect(card.locator("#hubWavQueue")).toContainText("officer@kreweofshamrock.com");

  const calls = await page.evaluate(() => window.__kosWaiverCalls.filter((c) => c.name === "kos_request_dues_waiver"));
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toEqual({
    p_member_id: DEE,
    p_year: 2026,
    p_kind: "elected_officer",
    p_reason: "Bylaws exemption"
  });
  const dee = await duesRow(page, DEE);
  expect(dee.paid).toBe(false);
  expect(dee.amount).toBe(375);
  expect(dee.waiver_status).toBe("requested");
  expect(dee.payment_method).not.toBe("waiver");

  await card.locator("#hubWavSearch").fill("Ada");
  await card.locator("#hubWavPick").getByRole("button", { name: "Ada Lane" }).click();
  await expect(card.locator("#hubWavKind")).toHaveValue("");
  await card.locator("#hubWavKind").selectOption("service_in_lieu");
  await card.getByRole("button", { name: "Request waiver" }).click();
  await expect(card.locator("#hubWavMsg")).toContainText("Reason is required");
  const afterBlock = await page.evaluate(() => window.__kosWaiverCalls.filter((c) => c.name === "kos_request_dues_waiver"));
  expect(afterBlock).toHaveLength(1);

  await card.locator("#hubWavReason").fill("Float barn hours");
  await card.getByRole("button", { name: "Request waiver" }).click();
  await expect(card.locator("#hubWavQueue")).toContainText("Ada Lane");
  await expect(card.locator("#hubWavQueue")).toContainText("Float barn hours");
  const ada = await duesRow(page, ADA);
  expect(ada.paid).toBe(false);
  expect(ada.waiver_status).toBe("requested");
  expect(ada.waiver_kind).toBe("service_in_lieu");

  await card.locator("#hubWavSearch").fill("Bea");
  await card.locator("#hubWavPick").getByRole("button", { name: "Bea Moss" }).click();
  await expect(card.locator("#hubWavSelected")).toContainText("Associate · $450.00");
  await expect(card.locator("#hubWavSelected")).not.toContainText("zeffy.com");
});

test("approve applies the waiver and leaves a cash payment alone", async ({ page }) => {
  await mountWaivers(page);
  const card = page.locator("#hubDuesWaivers");
  const calBefore = await duesRow(page, CAL);

  await card.getByRole("button", { name: "Approve Eve Nash" }).click();
  await expect(card.locator("#hubWavQueueMsg")).toContainText("Waiver applied");
  await expect(card.locator("#hubWavQueue")).not.toContainText("Eve Nash");

  const calls = await page.evaluate(() => window.__kosWaiverCalls.filter((c) => c.name === "kos_decide_dues_waiver"));
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toEqual({
    p_member_id: EVE,
    p_year: 2026,
    p_approve: true,
    p_apply: true
  });

  await card.getByRole("button", { name: "Applied", exact: true }).click();
  const eveRow = card.locator("#hubWavHistory .hub-ei-item", { hasText: "Eve Nash" });
  await expect(eveRow).toContainText("Service in lieu");
  await expect(eveRow).toContainText("Waived value: $100.00");
  await expect(eveRow).toContainText("treasurer@kreweofshamrock.com");
  await expect(eveRow).toContainText("2026");
  await expect(eveRow).toContainText("pat@example.com");
  await expect(eveRow).toContainText("Float build hours");
  await expect(eveRow).toContainText("method waiver");

  const eve = await duesRow(page, EVE);
  expect(eve.paid).toBe(true);
  expect(eve.amount).toBe(0);
  expect(eve.payment_method).toBe("waiver");
  expect(eve.waiver_status).toBe("applied");
  expect(eve.standard_amount).toBe(100);

  const cal = await duesRow(page, CAL);
  expect(cal).toEqual(calBefore);
  await card.locator("#hubWavSearch").fill("Cal");
  await card.locator("#hubWavPick").getByRole("button", { name: "Cal Pitt" }).click();
  await expect(card.locator("#hubWavSelected")).toContainText("Paid in money · $375.00 · cash");
  await expect(card.locator("#hubWavRequest")).toBeDisabled();
  await expect(card.locator("#hubWavQueue")).not.toContainText("Cal Pitt");
});

test("deny leaves the dues unpaid", async ({ page }) => {
  await mountWaivers(page);
  const card = page.locator("#hubDuesWaivers");

  await card.getByRole("button", { name: "Deny Eve Nash" }).click();
  await expect(card.locator("#hubWavQueueMsg")).toContainText("not marked paid");
  await expect(card.locator("#hubWavQueue")).not.toContainText("Eve Nash");

  const calls = await page.evaluate(() => window.__kosWaiverCalls.filter((c) => c.name === "kos_decide_dues_waiver"));
  expect(calls).toHaveLength(1);
  expect(calls[0].args.p_member_id).toBe(EVE);
  expect(calls[0].args.p_year).toBe(2026);
  expect(calls[0].args.p_approve).toBe(false);

  const eve = await duesRow(page, EVE);
  expect(eve.paid).toBe(false);
  expect(eve.amount).toBe(100);
  expect(eve.waiver_status).toBe("denied");
  expect(eve.payment_method).not.toBe("waiver");

  await card.getByRole("button", { name: "Denied", exact: true }).click();
  const denied = card.locator("#hubWavHistory .hub-ei-item", { hasText: "Eve Nash" });
  await expect(denied).toContainText("Service in lieu");
  await expect(denied).toContainText("Denied by treasurer@kreweofshamrock.com");
  await expect(denied).toContainText("Still unpaid $100.00");
  await expect(denied).toContainText("Float build hours");

  await card.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(card.locator("#hubWavHistory")).not.toContainText("Eve Nash");

  const cal = await duesRow(page, CAL);
  expect(cal.paid).toBe(true);
  expect(cal.amount).toBe(375);
  expect(cal.payment_method).toBe("cash");
  expect(cal.waiver_status).toBeFalsy();
});

test("elected batch runs only after confirm and skips cash and other waivers", async ({ page }) => {
  await mountWaivers(page);
  const card = page.locator("#hubDuesWaivers");

  const onLoad = await page.evaluate(() => window.__kosWaiverCalls.map((c) => c.name));
  expect(onLoad).not.toContain("kos_apply_elected_officer_exemptions");

  await card.locator("#hubWavYear").fill("2027");
  await card.locator("#hubWavYear").dispatchEvent("change");
  await expect(card.locator("#hubWavQueue")).toContainText("No waiver requests waiting for 2027");
  const afterYear = await page.evaluate(() => window.__kosWaiverCalls.map((c) => c.name));
  expect(afterYear).not.toContain("kos_apply_elected_officer_exemptions");

  await card.locator("#hubWavYear").fill("2026");
  await card.locator("#hubWavYear").dispatchEvent("change");
  await expect(card.locator("#hubWavQueue")).toContainText("Eve Nash");

  let dismissed = "";
  page.once("dialog", async (dialog) => {
    dismissed = dialog.message();
    await dialog.dismiss();
  });
  await card.getByRole("button", { name: "Apply bylaws exemptions for season" }).click();
  expect(dismissed).toContain("Apply bylaws exemptions for the 2026 season?");
  expect(dismissed).toContain("President, Vice President, Secretary, and Treasurer only");
  expect(dismissed).toContain("Committee chairs and board members are not included");
  expect(dismissed).toContain("already paid in money");
  const afterDismiss = await page.evaluate(() => window.__kosWaiverCalls.map((c) => c.name));
  expect(afterDismiss).not.toContain("kos_apply_elected_officer_exemptions");

  let accepted = "";
  page.once("dialog", async (dialog) => {
    accepted = dialog.message();
    await dialog.accept();
  });
  await card.getByRole("button", { name: "Apply bylaws exemptions for season" }).click();
  await expect(card.locator("#hubWavBatchMsg")).toContainText("Applied elected-officer exemptions for 2 member(s).");
  await expect(card.locator("#hubWavBatchMsg")).toContainText("Skipped 1 already paid in money");
  await expect(card.locator("#hubWavBatchMsg")).toContainText("1 covered by another waiver");
  expect(accepted).toContain("Nothing is waived until you confirm.");

  const batchCalls = await page.evaluate(() => window.__kosWaiverCalls.filter((c) => c.name === "kos_apply_elected_officer_exemptions"));
  expect(batchCalls).toHaveLength(1);
  expect(batchCalls[0].args).toEqual({ p_year: 2026 });

  await card.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(card.locator("#hubWavHistory")).toContainText("Gina Cole");
  await expect(card.locator("#hubWavHistory")).toContainText("Dee Shaw");
  const gina = card.locator("#hubWavHistory .hub-ei-item", { hasText: "Gina Cole" });
  await expect(gina).toContainText("Elected officer exemption");
  await expect(gina).toContainText("Waived value: $375.00");
  await expect(gina).toContainText("officer@kreweofshamrock.com");

  const sam = card.locator("#hubWavHistory .hub-ei-item", { hasText: "Sam Service" });
  await expect(sam).toContainText("Service in lieu");
  await expect(sam).not.toContainText("Elected officer exemption");

  const holly = await duesRow(page, HOLLY);
  expect(holly.paid).toBe(true);
  expect(holly.amount).toBe(375);
  expect(holly.payment_method).toBe("cash");
  expect(holly.waiver_status).toBeFalsy();
  const cal = await duesRow(page, CAL);
  expect(cal.paid).toBe(true);
  expect(cal.amount).toBe(375);
  expect(cal.payment_method).toBe("cash");
  const finn = await duesRow(page, FINN);
  expect(finn.paid).toBe(false);
  expect(finn.amount).toBe(375);
  expect(finn.waiver_status).toBeFalsy();

  await card.locator("#hubWavSearch").fill("Holly");
  await card.locator("#hubWavPick").getByRole("button", { name: "Holly Cash" }).click();
  await expect(card.locator("#hubWavSelected")).toContainText("Paid in money · $375.00 · cash");
  await expect(card.locator("#hubWavRequest")).toBeDisabled();
});
