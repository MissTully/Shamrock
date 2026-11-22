// Treasurer ledger, receipt dialog, waiver gate, and invoice gate.
// Fixture people only. This file does not call the live Supabase project.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const V7 = path.join(__dirname, "../../previews/v7");
fs.mkdirSync(V7, { recursive: true });

const JANE = "22222222-2222-4222-8222-222222222221";
const QUINN = "22222222-2222-4222-8222-222222222222";
const NIA = "22222222-2222-4222-8222-222222222225";

function shot(name) {
  return path.join(V7, name);
}

async function boot(page, html, arg) {
  await page.goto("/raffle-qr-sheet.html");
  if (arg === undefined) await page.evaluate(html);
  else await page.evaluate(html, arg);
}

test("receipt dialog for a couple and an induction member", async ({ page }) => {
  await boot(page, () => {
    document.body.innerHTML = "<main id=\"hubOfficer\"></main>";
  });
  await page.addScriptTag({ url: "/assets/kos-dues-receipts.js?v=20261122ledger1" });
  await page.evaluate(({ jane, quinn }) => {
    window.KosDuesReceipts.open({
      member: {
        id: jane,
        first_name: "Jane",
        last_name: "Sample",
        membership_status: "Delinquent",
        amount: 375
      },
      partner: { id: quinn, name: "Quinn Example", amount: 375 },
      expected: 375,
      partnerExpected: 375
    });
  }, { jane: JANE, quinn: QUINN });
  const dialog = page.locator("#kosReceiptDialog");
  await expect(dialog).toContainText("Jane Sample");
  await expect(dialog).toContainText("Also covers Quinn Example");
  await dialog.locator("#kosReceiptPartner").check();
  await expect(dialog.locator("#kosReceiptAmount")).toHaveValue("750.00");
  await dialog.screenshot({ path: shot("01-receipt-couple.png"), animations: "disabled" });

  await page.evaluate((nia) => {
    window.KosDuesReceipts.open({
      member: {
        id: nia,
        first_name: "Nia",
        last_name: "Example",
        membership_status: "Induction pending",
        amount: 375
      },
      expected: 375
    });
  }, NIA);
  await expect(dialog).toContainText("Nia Example");
  await expect(dialog).toContainText("Induction pending");
  await expect(dialog.locator("#kosReceiptPartner")).toHaveCount(0);
  await dialog.screenshot({ path: shot("02-receipt-induction.png"), animations: "disabled" });
});

test("ledger, void, season counts, Zeffy check, history, and season report", async ({ page }) => {
  await boot(page, ({ jane, quinn, nia }) => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    const members = [
      { id: jane, first_name: "Jane", last_name: "Sample", email: "jane.sample@example.com", membership_level: "full", membership_status: "active", partner_member_id: quinn },
      { id: quinn, first_name: "Quinn", last_name: "Example", email: "quinn.example@example.com", membership_level: "full", membership_status: "active", partner_member_id: jane },
      { id: nia, first_name: "Nia", last_name: "Example", email: "nia.example@example.com", membership_level: "full", membership_status: "dues-pending", partner_member_id: null }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, active: true }
    ];
    const dues = [
      { id: "d-jane", member_id: jane, membership_year: 2026, amount: 375, due_date: "2026-12-22", paid: true, paid_date: "2026-11-02", payment_method: "check", notes: "Recorded by an officer (check #1001).", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-nia", member_id: nia, membership_year: 2026, amount: 375, due_date: "2026-12-22", paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null }
    ];
    const tables = { members, kos_dues_catalog: catalog, dues_payments: dues, payments: [] };
    function chain(table) {
      const filters = [];
      const c = {
        select() { return c; },
        eq(col, val) { filters.push(["eq", col, val]); return c; },
        is(col, val) { filters.push(["is", col, val]); return c; },
        in() { return c; },
        order() { return c; },
        range() { return c; },
        then(resolve, reject) {
          let rows = (tables[table] || []).slice();
          filters.forEach((f) => {
            if (f[0] === "eq") rows = rows.filter((r) => r[f[1]] === f[2]);
            if (f[0] === "is" && f[2] == null) rows = rows.filter((r) => r[f[1]] == null);
          });
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return c;
    }
    const ledger = {
      ok: true,
      from: "2026-06-01",
      to: "2027-05-31",
      deposit_total_cents: 75000,
      deposits_by_day: [{ day: "2026-11-02", cash_cents: 0, check_cents: 75000, total_cents: 75000 }],
      totals: [{ source: "check", count: 1, amount_cents: 75000 }],
      rows: [
        {
          source: "check",
          when: "2026-11-02",
          member_id: jane,
          name: "Jane Sample and Quinn Example",
          method: "check",
          amount: 750,
          amount_cents: 75000,
          check_number: "1001",
          voided: false,
          receipt_id: "receipt-1",
          kind: "dues"
        },
        {
          source: "zeffy",
          when: "2026-07-04",
          name: "Guest Example",
          method: "card",
          amount: 375,
          amount_cents: 37500,
          check_number: null,
          voided: false,
          receipt_id: null,
          kind: "event",
          note: "Dues"
        }
      ]
    };
    const season = {
      ok: true,
      year: 2026,
      owing_total: 5,
      owing_amount: 1875,
      renewal_rows: 5,
      invoiced_unpaid: {
        renewal: { count: 3, amount: 1125 },
        induction: { count: 1, amount: 375 }
      },
      not_invoiced: { count: 2, amount: 750 },
      waived: { count: 1, amount: 375 },
      voided: { count: 0, amount: 0 },
      collected: [{ method: "check", level: "full", count: 2, amount: 750 }],
      background_check_fees: { count: 1, amount_cents: 4500 }
    };
    const reconcile = {
      ok: true,
      possible_misfiled: [{ payer_name: "Guest Example", description: "Dues", amount_cents: 37500, product_kind: "event" }],
      amount_mismatch: [],
      level_mismatch: [],
      unmatched_dues_payer: [],
      card_paid_no_payment: [],
      dues_payment_no_row: []
    };
    const history = {
      ok: true,
      name: "Jane Sample",
      items: [
        { kind: "receipt", at: "2026-11-02", method: "check", amount: 375, check_number: "1001", voided: false },
        { kind: "event", at: "2026-11-02", event_type: "payment_recorded" }
      ]
    };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_view_payments") return { data: true };
        if (name === "kos_can_record_dues_cash") return { data: true };
        if (name === "kos_treasurer_ledger") return { data: ledger };
        if (name === "kos_dues_season_report") return { data: season };
        if (name === "kos_dues_reconcile") return { data: reconcile };
        if (name === "kos_member_dues_history") return { data: history };
        if (name === "list_recent_payments") return { data: [] };
        if (name === "kos_void_dues_receipt") return { data: { ok: true, message: "Receipt voided. No email was sent." } };
        return { data: null };
      },
      from(table) { return chain(table); }
    };
  }, { jane: JANE, quinn: QUINN, nia: NIA });
  await page.addScriptTag({ url: "/assets/kos-dues-receipts.js?v=20261122ledger1" });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261122ledger1" });
  await page.evaluate(() => window.kosRenderDuesPayments(window.__kosSb));
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");

  const card = page.locator("#hubPayments");
  await expect(card.locator("#hubPayDeposit")).toHaveText("$750.00");
  await expect(card).toContainText("Deposit total (cash and check)");
  await expect(card.locator("[data-void='receipt-1']")).toBeVisible();
  await expect(card.locator("[data-adjust='receipt-1']")).toBeVisible();
  await card.screenshot({ path: shot("03-ledger-deposit.png"), animations: "disabled" });

  await card.locator("[data-void='receipt-1']").click();
  const modal = page.locator("#hubPayModal");
  await expect(modal).toContainText("Void receipt");
  await expect(modal).toContainText("No email is sent.");
  await modal.screenshot({ path: shot("04-void-dialog.png"), animations: "disabled" });
  await modal.locator("#hubPayModalCancel").click();

  await card.getByRole("tab", { name: "Dues season" }).click();
  await expect(card.locator("#hubPayOwing")).toContainText("3 invoiced and unpaid + 2 not invoiced yet = 5 owing (matches Renewals)");
  await card.locator("#hubPayPanel_season").screenshot({ path: shot("05-season-owing.png"), animations: "disabled" });

  await card.getByRole("tab", { name: "Check Zeffy" }).click();
  await expect(card.locator("[data-flag=possible_misfiled]")).toContainText("Guest Example");
  await expect(card.locator("[data-flag=possible_misfiled]")).toContainText("Dues");
  await expect(card.locator("#hubPayPanel_zeffy button")).toHaveCount(0);
  await card.locator("#hubPayPanel_zeffy").screenshot({ path: shot("06-check-zeffy.png"), animations: "disabled" });

  await card.getByRole("tab", { name: "Dues season" }).click();
  await card.locator("[data-history='" + JANE + "']").click();
  const history = card.locator("#hubPayHistory");
  await expect(history).toContainText("Jane Sample");
  await expect(history).toContainText("check");
  await expect(history).toContainText("1001");
  await history.screenshot({ path: shot("07-history-drawer.png"), animations: "disabled" });

  await card.getByRole("tab", { name: "Export" }).click();
  await expect(card.locator("#hubPayFrom")).toHaveValue("2026-06-01");
  await expect(card.locator("#hubPayTo")).toHaveValue("2027-05-31");
  await expect(card.locator("#hubPaySeasonCards")).toContainText("People owing (matches Renewals)");
  await expect(card.locator("#hubPayCollected")).toContainText("check");
  await card.locator("#hubPaySeasonView").screenshot({ path: shot("08-season-report.png"), animations: "disabled" });
  await card.locator("#hubPayLedgerCsv").click();
  const csv = await page.evaluate(() => window.__kosLastCsv);
  expect(csv.filename).toContain("kos-payments-2026-06-01");
  expect(csv.text.split("\r\n")[0]).toBe("when,payer_name,source,method,check_number,amount,voided");
  expect(csv.text).toContain("1001");
  expect(csv.text).toContain("Jane Sample and Quinn Example");
});

test("secretary does not see void or adjust", async ({ page }) => {
  await boot(page, () => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    const ledger = {
      ok: true,
      deposit_total_cents: 37500,
      deposits_by_day: [],
      rows: [{
        source: "check",
        when: "2026-11-02",
        name: "Jane Sample",
        method: "check",
        amount: 375,
        check_number: "1001",
        voided: false,
        receipt_id: "receipt-1"
      }]
    };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_view_payments") return { data: true };
        if (name === "kos_can_record_dues_cash") return { data: false };
        if (name === "kos_treasurer_ledger") return { data: ledger };
        if (name === "list_recent_payments") return { data: [] };
        return { data: null };
      },
      from() {
        const c = {
          select() { return c; },
          eq() { return c; },
          is() { return c; },
          in() { return c; },
          order() { return c; },
          range() { return c; },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        return c;
      }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261122ledger1" });
  await page.evaluate(() => window.kosRenderDuesPayments(window.__kosSb));
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");
  await expect(page.locator("[data-void]")).toHaveCount(0);
  await expect(page.locator("[data-adjust]")).toHaveCount(0);
  await expect(page.locator("#hubPayDeposit")).toHaveText("$375.00");
});

test("membership chair sees the waiver approval message", async ({ page }) => {
  await boot(page, () => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    const members = [
      { id: "55555555-5555-4555-8555-555555555555", first_name: "Eve", last_name: "Nash", email: "eve.nash@example.com", membership_level: "full", officer_title: "", membership_status: "active" }
    ];
    const dues = [
      { id: "d-eve", member_id: members[0].id, membership_year: 2026, amount: 375, paid: false, payment_method: null, notes: "Waiver requested (service_in_lieu): Float build hours", membership_level: "full", standard_amount: 375, waiver_kind: "service_in_lieu", waiver_status: "requested", waiver_requested_by: "casey.example@example.com" }
    ];
    const tables = { members, dues_payments: dues, kos_dues_catalog: [], kos_dues_events: [] };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "is_krewe_officer") return { data: true };
        if (name === "kos_can_approve_dues_waivers") return { data: false };
        return { data: null };
      },
      from(table) {
        const filters = [];
        const c = {
          select() { return c; },
          eq(col, val) { filters.push([col, val]); return c; },
          is(col, val) { filters.push(["is", col, val]); return c; },
          in() { return c; },
          order() { return c; },
          range() { return c; },
          then(resolve, reject) {
            let rows = (tables[table] || []).slice();
            filters.forEach((f) => {
              if (f[0] === "is" && f[2] == null) rows = rows.filter((r) => r[f[1]] == null);
              else if (f[0] !== "is") rows = rows.filter((r) => r[f[0]] === f[1]);
            });
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
        };
        return c;
      }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-dues-waivers.js?v=20261122ledger1" });
  await expect(page.locator("#hubDuesWaivers")).toContainText("Only the President or Treasurer can approve waivers.", { timeout: 8000 });
  await expect(page.locator("#hubDuesWaivers")).toContainText("Request waiver");
  await expect(page.locator("[data-approve]")).toHaveCount(0);
  await expect(page.locator("#hubWavBatch")).toHaveCount(0);
  await page.locator("#hubDuesWaivers").screenshot({ path: shot("09-waivers-membership-chair.png"), animations: "disabled" });
});

test("secretary cannot create invoices", async ({ page }) => {
  await boot(page, () => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "is_krewe_officer") return { data: true };
        if (name === "kos_can_manage_invoices") return { data: false };
        if (name === "officer_email_audience_counts") return { data: { active: 1 } };
        if (name === "officer_list_outreach_log") return { data: { items: [] } };
        return { data: null };
      },
      from() {
        const c = {
          select() { return c; },
          eq() { return c; },
          is() { return c; },
          in() { return c; },
          order() { return c; },
          range() { return c; },
          then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
        };
        return c;
      }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-email-invoices.js?v=20261122ledger1" });
  await expect(page.locator("#hubInvLocked")).toContainText("Invoices are for the Treasurer, President, or Membership Chair.", { timeout: 8000 });
  await expect(page.locator("#hubInvSend")).toHaveCount(0);
  await page.locator("#hubSendInvoices").screenshot({ path: shot("10-invoices-secretary.png"), animations: "disabled" });
});

test("fundraising summary includes cash and check dues", async ({ page }) => {
  await boot(page, () => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_manage_events") return { data: true };
        if (name === "officer_report_options") return { data: { ok: true, events: [] } };
        if (name === "officer_fundraising_report") {
          return {
            data: {
              ok: true,
              total_cents: 79500,
              cash_check_cents: 75000,
              by_category: [
                { category: "Membership dues & applications", total_cents: 79500, payments: 2 }
              ],
              by_event: []
            }
          };
        }
        return { data: null };
      }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-reports.js?v=20261122ledger1" });
  await page.evaluate(() => window.__kosLoadReports(window.__kosSb));
  await page.locator("#hubReportMoneyRun").click();
  const out = page.locator("#hubReportMoneyOut");
  await expect(out).toContainText("Membership dues & applications");
  await expect(out.locator("#hubReportCashCheck")).toContainText("$750.00");
  await expect(out.locator("#hubReportCashCheck")).toContainText("cash and check dues");
  await page.locator("#hubReports").screenshot({ path: shot("11-fundraising-cash-check.png"), animations: "disabled" });
});
