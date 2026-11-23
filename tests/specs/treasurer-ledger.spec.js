// Treasurer ledger, receipt dialog, waiver gate, and invoice gate.
// Fixture people only. This file does not call the live Supabase project.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { unlockMemberHub } = require("./helpers");

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

const HUB_CARD_CSS = [
  "body{background:#f6efdd;}",
  "#memberContent{display:block;max-width:980px;margin:28px auto;padding:12px 16px 48px;font-size:17px;}",
  ".app-card{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:18px;box-shadow:0 4px 16px rgba(12,59,33,.10);overflow:hidden;}",
  ".app-card>.app-head{background:linear-gradient(180deg,#1b6b39,#14532d);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:12px;}",
  ".app-head .ic{font-size:26px;}",
  ".app-head h2{margin:0;font-family:var(--display),Georgia,serif;font-size:22px;}",
  ".app-head small{display:block;font-family:var(--fancy),Georgia,serif;font-style:italic;color:#ecd07e;font-size:16px;}",
  ".app-body{padding:20px 22px;}",
  "#memberContent .app-body input,#memberContent .app-body select,#memberContent .app-body textarea{font-size:16px;min-height:48px;padding:12px;border-radius:10px;border:1px solid rgba(168,128,28,.35);background:#fff;font-family:inherit;width:auto;max-width:100%;}",
  "#memberContent .btn{min-height:44px;}"
].join("");

async function useHubChrome(page) {
  await page.goto("/raffle-qr-sheet.html");
  await page.evaluate(() => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.id = "memberContent";
    const officer = document.createElement("div");
    officer.id = "hubOfficer";
    wrap.appendChild(officer);
    document.body.appendChild(wrap);
  });
  await page.addStyleTag({
    url: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:ital,wght@0,600;1,500&family=EB+Garamond:ital@0;1&display=swap"
  });
  await page.addStyleTag({ content: HUB_CARD_CSS });
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
  await useHubChrome(page);
  await page.evaluate(({ jane, quinn, robin, lane, morgan }) => {
    const panel = document.getElementById("hubOfficer");
    const members = [
      { id: jane, first_name: "Jane", last_name: "Sample", email: "jane.sample@example.com", membership_level: "full", membership_status: "active", partner_member_id: quinn },
      { id: quinn, first_name: "Quinn", last_name: "Example", email: "quinn.example@example.com", membership_level: "full", membership_status: "active", partner_member_id: jane },
      { id: robin, first_name: "Robin", last_name: "Example", email: "robin.example@example.com", membership_level: "full", membership_status: "active", partner_member_id: null },
      { id: lane, first_name: "Lane", last_name: "Example", email: "lane.example@example.com", membership_level: "full", membership_status: "active", partner_member_id: null },
      { id: morgan, first_name: "Morgan", last_name: "Example", email: "morgan.example@example.com", membership_level: "full", membership_status: "active", partner_member_id: null }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, active: true },
      { membership_year: 2026, level: "associate", amount: 450, active: true },
      { membership_year: 2026, level: "auxiliary", amount: 200, active: true },
      { membership_year: 2026, level: "loa", amount: 100, active: true }
    ];
    const dues = [jane, quinn, robin].map((id) => ({
      id: "d-" + id,
      member_id: id,
      membership_year: 2026,
      amount: 375,
      due_date: "2026-12-22",
      paid: false,
      payment_method: null,
      notes: "",
      membership_level: "full",
      standard_amount: 375,
      waiver_kind: null,
      waiver_status: null
    }));
    const renewal = members.filter((m) => ["active", "lapsed", "pending-renewal"].indexOf(m.membership_status) !== -1);
    const withRow = {};
    dues.forEach((d) => { if (d.membership_year === 2026) withRow[d.member_id] = true; });
    const invoicedUnpaid = renewal.filter((m) => dues.some((d) => d.member_id === m.id && d.membership_year === 2026 && !d.paid));
    const notInvoiced = renewal.filter((m) => !withRow[m.id]);
    const season = {
      ok: true,
      year: 2026,
      owing_total: invoicedUnpaid.length + notInvoiced.length,
      owing_amount: (invoicedUnpaid.length + notInvoiced.length) * 375,
      renewal_rows: invoicedUnpaid.length + notInvoiced.length,
      invoiced_unpaid: {
        renewal: { count: invoicedUnpaid.length, amount: invoicedUnpaid.length * 375 },
        induction: { count: 0, amount: 0 }
      },
      not_invoiced: { count: notInvoiced.length, amount: notInvoiced.length * 375 },
      waived: { count: 0, amount: 0 },
      voided: { count: 0, amount: 0 },
      collected: [{ method: "check", level: "full", count: 1, amount: 750 }],
      background_check_fees: { count: 0, amount_cents: 0 }
    };
    window.__kosSeasonFixture = { invoicedUnpaid: invoicedUnpaid.length, notInvoiced: notInvoiced.length };
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
  }, {
    jane: JANE,
    quinn: QUINN,
    robin: "22222222-2222-4222-8222-222222222223",
    lane: "22222222-2222-4222-8222-222222222229",
    morgan: "22222222-2222-4222-8222-22222222222a"
  });
  await page.addScriptTag({ url: "/assets/kos-dues-receipts.js?v=20261122ledger2" });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261122ledger2" });
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
  const counts = await page.evaluate(() => window.__kosSeasonFixture);
  const headline = await card.locator("#hubPayOwing").innerText();
  const parsed = headline.match(/(\d+) invoiced and unpaid \+ (\d+) not invoiced yet = (\d+) owing/);
  expect(parsed, headline).toBeTruthy();
  const invoicedUnpaid = Number(parsed[1]);
  const notInvoiced = Number(parsed[2]);
  const owing = Number(parsed[3]);
  expect(invoicedUnpaid + notInvoiced).toBe(owing);
  expect(invoicedUnpaid).toBe(counts.invoicedUnpaid);
  expect(notInvoiced).toBe(counts.notInvoiced);
  await expect(card.locator("#hubPayInvoiced")).toHaveText(String(invoicedUnpaid));
  await expect(card.locator("#hubPayOutstanding")).toHaveText("$1,125.00");
  await expect(card.locator("#hubPayMembers tbody tr")).toHaveCount(invoicedUnpaid);
  await expect(card.locator("#hubPayMembers")).toContainText("Jane Sample");
  await expect(card.locator("#hubPayMembers")).toContainText("Quinn Example");
  await expect(card.locator("#hubPayMembers")).toContainText("Robin Example");
  await expect(card.locator("#hubPayMembers")).not.toContainText("Lane Example");
  await expect(card.locator("#hubPayPanel_season")).not.toContainText("DUES_REMINDER_AUTOMATION.md");
  await expect(card.locator("#hubPayPanel_season")).toContainText("Reminders go out from Send invoices.");
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

test("wild apricot dues count as paid cash and show on the cash ledger", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(() => {
    const nia = "22222222-2222-4222-8222-222222222225";
    const quinn = "22222222-2222-4222-8222-222222222222";
    const robin = "22222222-2222-4222-8222-222222222223";
    const lane = "22222222-2222-4222-8222-222222222229";
    const morgan = "22222222-2222-4222-8222-22222222222a";
    const pat = "22222222-2222-4222-8222-22222222222b";
    const ada = "22222222-2222-4222-8222-22222222222c";
    const members = [
      { id: nia, first_name: "Nia", last_name: "Sample", email: "nia.sample@example.com", membership_level: "full", membership_status: "active" },
      { id: quinn, first_name: "Quinn", last_name: "Example", email: "quinn.example@example.com", membership_level: "associate", membership_status: "active" },
      { id: robin, first_name: "Robin", last_name: "Moss", email: "robin.moss@example.com", membership_level: "full", membership_status: "active" },
      { id: lane, first_name: "Lane", last_name: "Check", email: "lane.check@example.com", membership_level: "full", membership_status: "active" },
      { id: morgan, first_name: "Morgan", last_name: "Card", email: "morgan.card@example.com", membership_level: "full", membership_status: "active" },
      { id: pat, first_name: "Pat", last_name: "Waiver", email: "pat.waiver@example.com", membership_level: "full", membership_status: "active" },
      { id: ada, first_name: "Ada", last_name: "Lane", email: "ada.lane@example.com", membership_level: "full", membership_status: "active" }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, active: true },
      { membership_year: 2026, level: "associate", amount: 450, active: true }
    ];
    const waNote = "Paid on Wild Apricot (legacy import). Invoice 100001. Full Krewe Membership.";
    const dues = [
      { id: "d-nia", member_id: nia, membership_year: 2026, amount: 375, due_date: "2026-06-30", paid: true, paid_date: "2026-07-12", payment_method: "other", notes: waNote, membership_level: "full", standard_amount: 375 },
      { id: "d-quinn", member_id: quinn, membership_year: 2026, amount: 337.5, due_date: "2026-06-30", paid: true, paid_date: "2026-08-02", payment_method: "other", notes: "Paid on Wild Apricot (legacy import). Invoice 100002. Associate.", membership_level: "associate", standard_amount: 450 },
      { id: "d-robin", member_id: robin, membership_year: 2026, amount: 100, due_date: "2026-06-30", paid: true, paid_date: "2026-06-20", payment_method: "other", notes: "Money order at the meeting.", membership_level: "full", standard_amount: 375 },
      { id: "d-lane", member_id: lane, membership_year: 2026, amount: 200, due_date: "2026-06-30", paid: true, paid_date: "2026-11-02", payment_method: "check", notes: "Check 1008", membership_level: "full", standard_amount: 375 },
      { id: "d-morgan", member_id: morgan, membership_year: 2026, amount: 375, due_date: "2026-06-30", paid: true, paid_date: "2026-07-04", payment_method: "card", notes: "", membership_level: "full", standard_amount: 375 },
      { id: "d-pat", member_id: pat, membership_year: 2026, amount: 0, due_date: "2026-06-30", paid: true, paid_date: "2026-06-01", payment_method: "waiver", notes: "", membership_level: "full", standard_amount: 375, waiver_kind: "elected_officer", waiver_status: "applied" },
      { id: "d-ada", member_id: ada, membership_year: 2026, amount: 375, due_date: "2026-12-01", paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375 }
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
      deposit_total_cents: 20000,
      deposits_by_day: [{ day: "2026-11-02", cash_cents: 0, check_cents: 20000, total_cents: 20000 }],
      rows: [
        { source: "Wild Apricot", when: "2026-07-12", name: "Nia Sample", method: "other", amount: 375, amount_cents: 37500, check_number: null, voided: false, receipt_id: null },
        { source: "Wild Apricot", when: "2026-08-02", name: "Quinn Example", method: "other", amount: 337.5, amount_cents: 33750, check_number: null, voided: false, receipt_id: null },
        { source: "check", when: "2026-11-02", name: "Lane Check", method: "check", amount: 200, amount_cents: 20000, check_number: "1008", voided: false, receipt_id: "receipt-lane" },
        { source: "zeffy", when: "2026-07-04", name: "Morgan Card", method: "card", amount: 375, amount_cents: 37500, check_number: null, voided: false, receipt_id: null },
        { source: "waiver", when: "2026-06-01", name: "Pat Waiver", method: "waiver", amount: 0, amount_cents: 0, check_number: null, voided: false, receipt_id: null }
      ]
    };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_view_payments") return { data: true };
        if (name === "kos_can_record_dues_cash") return { data: true };
        if (name === "kos_treasurer_ledger") return { data: ledger };
        if (name === "list_recent_payments") {
          return { data: [{ when: "2026-07-04", amount_cents: 37500, kind: "dues", payer: "Morgan Card", email: "morgan.card@example.com", description: "2026 membership", matched: true }] };
        }
        return { data: null };
      },
      from(table) { return chain(table); }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261123wa1" });
  await page.evaluate(() => window.kosRenderDuesPayments(window.__kosSb));
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");

  const card = page.locator("#hubPayments");
  const ledger = card.locator("#hubPayPanel_ledger");
  await expect(ledger.locator("#hubPayDeposit")).toHaveText("$200.00");
  await expect(ledger.locator("#hubPayApricotLedger")).toHaveText("$712.50");
  await expect(ledger.locator(".hub-pay-src")).toHaveCount(2);
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).toContainText("Wild Apricot");
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).toContainText("2026-07-12");
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).toContainText("$375.00");
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).not.toContainText("other");
  await expect(ledger.getByRole("row", { name: /Quinn Example/ })).toContainText("$337.50");
  await expect(ledger.getByRole("row", { name: /Lane Check/ })).toContainText("1008");
  await expect(ledger.getByRole("row", { name: /Morgan Card/ })).toHaveCount(1);
  await expect(ledger.locator("[data-void]")).toHaveCount(1);
  await expect(ledger.locator("[data-void='receipt-lane']")).toBeVisible();

  await ledger.locator("#hubPayMethod").selectOption("Wild Apricot");
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).toBeVisible();
  await expect(ledger.getByRole("row", { name: /Lane Check/ })).toHaveCount(0);
  await expect(ledger.getByRole("row", { name: /Morgan Card/ })).toHaveCount(0);
  await expect(ledger.getByRole("row", { name: /Pat Waiver/ })).toHaveCount(0);
  await expect(ledger.locator("#hubPayDeposit")).toHaveText("$200.00");
  await expect(ledger.locator("#hubPayApricotLedger")).toHaveText("$712.50");

  await card.getByRole("tab", { name: "Dues season" }).click();
  const season = card.locator("#hubPayPanel_season");
  await expect(season.locator("#hubPayCash")).toHaveText("$1,387.50");
  await expect(season.locator("#hubPayApricot")).toHaveText("$712.50");
  await expect(season.locator("#hubPayLevelCash")).toHaveText("$1,387.50");
  await expect(season.locator("#hubPayOutstanding")).toHaveText("$375.00");
  await expect(season.locator("#hubPayLevelDue")).toHaveText("$375.00");
  await expect(season.locator("#hubPayWaived")).toHaveText("$375.00");
  await expect(season.locator("#hubPayLevelWaived")).toHaveText("$375.00");
  await expect(season.locator("#hubPayInvoiced")).toHaveText("7");
  await expect(season.locator("#hubPayLevelInvoiced")).toHaveText("7");
  const nia = season.getByRole("row", { name: /Nia Sample/ });
  await expect(nia).toContainText("Paid");
  await expect(nia).toContainText("Wild Apricot");
  await expect(nia).toContainText("$0.00");
  await expect(nia).not.toContainText("other");
  await expect(season.getByRole("row", { name: /Robin Moss/ })).toContainText("Other");
  await expect(season.getByRole("row", { name: /Robin Moss/ })).not.toContainText("Wild Apricot");
  await expect(season.getByRole("row", { name: /Pat Waiver/ })).toContainText("Waived");
  await expect(season.locator("#hubPayApricot")).not.toHaveText("$1,387.50");
});

test("cash ledger fallback lists wild apricot once and skips cash, check, and waivers", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(() => {
    const nia = "22222222-2222-4222-8222-222222222225";
    const morgan = "22222222-2222-4222-8222-22222222222a";
    const lane = "22222222-2222-4222-8222-222222222229";
    const pat = "22222222-2222-4222-8222-22222222222b";
    const members = [
      { id: nia, first_name: "Nia", last_name: "Sample", email: "nia.sample@example.com", membership_level: "full", membership_status: "active" },
      { id: morgan, first_name: "Morgan", last_name: "Card", email: "morgan.card@example.com", membership_level: "full", membership_status: "active" },
      { id: lane, first_name: "Lane", last_name: "Check", email: "lane.check@example.com", membership_level: "full", membership_status: "active" },
      { id: pat, first_name: "Pat", last_name: "Waiver", email: "pat.waiver@example.com", membership_level: "full", membership_status: "active" }
    ];
    const dues = [
      { id: "d-nia", member_id: nia, membership_year: 2026, amount: 375, paid: true, paid_date: "2026-07-12", payment_method: "other", notes: "Paid on Wild Apricot (legacy import). Invoice 100001.", membership_level: "full", standard_amount: 375 },
      { id: "d-morgan", member_id: morgan, membership_year: 2026, amount: 375, paid: true, paid_date: "2026-07-04", payment_method: "other", notes: "Paid on Wild Apricot (legacy import). Invoice 100009.", membership_level: "full", standard_amount: 375 },
      { id: "d-lane", member_id: lane, membership_year: 2026, amount: 200, paid: true, paid_date: "2026-11-02", payment_method: "check", notes: "Check 1008", membership_level: "full", standard_amount: 375 },
      { id: "d-pat", member_id: pat, membership_year: 2026, amount: 0, paid: true, paid_date: "2026-06-01", payment_method: "waiver", notes: "", membership_level: "full", standard_amount: 375, waiver_status: "applied" }
    ];
    const tables = { members, dues_payments: dues, kos_dues_catalog: [], payments: [] };
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
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_view_payments") return { data: true };
        if (name === "kos_can_record_dues_cash") return { data: false };
        if (name === "kos_treasurer_ledger") return { data: null };
        if (name === "list_recent_payments") {
          return {
            data: [
              { when: "2026-07-04T12:00:00.000Z", amount_cents: 37500, kind: "dues", payer: "Morgan Card", email: "morgan.card@example.com", description: "2026 membership", matched: true },
              { when: "2026-04-01T12:00:00.000Z", amount_cents: 2500, kind: "donation", payer: "Guest Donor", email: "guest.donor@example.com", description: "Donation", matched: false }
            ]
          };
        }
        return { data: null };
      },
      from(table) { return chain(table); }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261123wa1" });
  await page.evaluate(() => window.kosRenderDuesPayments(window.__kosSb));
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");
  const ledger = page.locator("#hubPayPanel_ledger");
  await expect(ledger.locator("#hubPayApricotLedger")).toHaveText("$375.00");
  await expect(ledger.getByRole("row", { name: /Nia Sample/ })).toContainText("Wild Apricot");
  await expect(ledger.getByRole("row", { name: /Morgan Card/ })).toHaveCount(1);
  await expect(ledger.getByRole("row", { name: /Morgan Card/ })).toContainText("Zeffy");
  await expect(ledger.getByRole("row", { name: /Morgan Card/ })).not.toContainText("Wild Apricot");
  await expect(ledger.getByRole("row", { name: /Guest Donor/ })).toContainText("no roster match");
  await expect(ledger.getByRole("row", { name: /Lane Check/ })).toHaveCount(0);
  await expect(ledger.getByRole("row", { name: /Pat Waiver/ })).toHaveCount(0);
});

function waiverClient(canApprove) {
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
      if (name === "kos_can_approve_dues_waivers") return { data: canApprove };
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
}

test("membership chair sees the waiver approval message", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(waiverClient, false);
  await page.addScriptTag({ url: "/assets/kos-dues-waivers.js?v=20261122ledger2" });
  const card = page.locator("#hubDuesWaivers");
  await expect(card).toContainText("Any officer can request a waiver.", { timeout: 8000 });
  await expect(card).toContainText("Only the President or Treasurer can approve waivers.");
  await expect(card).toContainText("Request waiver");
  await expect(card).not.toContainText("database check");
  await expect(card).not.toContainText("President-only switch");
  await expect(page.locator("[data-approve]")).toHaveCount(0);
  await expect(page.locator("#hubWavBatch")).toHaveCount(0);
  await card.screenshot({ path: shot("09-waivers-membership-chair.png"), animations: "disabled" });
});

test("treasurer can approve a pending waiver", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(waiverClient, true);
  await page.addScriptTag({ url: "/assets/kos-dues-waivers.js?v=20261122ledger2" });
  const card = page.locator("#hubDuesWaivers");
  await expect(card.getByRole("button", { name: "Approve Eve Nash" })).toBeVisible({ timeout: 8000 });
  await expect(card.getByRole("button", { name: "Deny Eve Nash" })).toBeVisible();
  await expect(card.locator("#hubWavBatch")).toBeVisible();
  await card.screenshot({ path: shot("09b-waivers-treasurer.png"), animations: "disabled" });
});

test("secretary cannot create invoices", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(() => {
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, zeffy_url: "https://www.zeffy.com/en-US/ticketing/example-full", active: true },
      { membership_year: 2026, level: "associate", amount: 450, zeffy_url: "https://www.zeffy.com/en-US/ticketing/example-associate", active: true },
      { membership_year: 2026, level: "auxiliary", amount: 200, zeffy_url: "https://www.zeffy.com/en-US/ticketing/example-auxiliary", active: true },
      { membership_year: 2026, level: "loa", amount: 100, zeffy_url: "https://www.zeffy.com/en-US/ticketing/example-loa", active: true }
    ];
    const members = [
      { id: "22222222-2222-4222-8222-222222222221", first_name: "Jane", last_name: "Sample", email: "jane.sample@example.com", membership_level: "full", officer_title: "", membership_status: "active" }
    ];
    const dues = [
      { id: "d-jane", member_id: members[0].id, membership_year: 2026, amount: 375, paid: false, due_date: "2026-12-22", waiver_status: null, membership_level: "full" }
    ];
    const tables = { kos_dues_catalog: catalog, members, dues_payments: dues };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "is_krewe_officer") return { data: true };
        if (name === "kos_can_manage_invoices") return { data: false };
        if (name === "officer_email_audience_counts") return { data: { active: 1 } };
        if (name === "officer_list_outreach_log") return { data: { items: [] } };
        return { data: null };
      },
      from(table) {
        const filters = [];
        const c = {
          select() { return c; },
          eq(col, val) { filters.push(["eq", col, val]); return c; },
          is(col, val) { filters.push(["is", col, val]); return c; },
          in(col, vals) { filters.push(["in", col, vals]); return c; },
          order() { return c; },
          range() { return c; },
          then(resolve, reject) {
            let rows = (tables[table] || []).slice();
            filters.forEach((f) => {
              if (f[0] === "eq") rows = rows.filter((r) => r[f[1]] === f[2]);
              if (f[0] === "is" && f[2] == null) rows = rows.filter((r) => r[f[1]] == null);
              if (f[0] === "in") rows = rows.filter((r) => (f[2] || []).indexOf(r[f[1]]) !== -1);
            });
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
        };
        return c;
      }
    };
  });
  await page.addScriptTag({ url: "/assets/kos-email-invoices.js?v=20261122ledger2" });
  const card = page.locator("#hubSendInvoices");
  await expect(card.locator("#hubInvLocked")).toContainText("Invoices are for the Treasurer, President, or Membership Chair.", { timeout: 8000 });
  await expect(card.locator("#hubInvCatalog")).toContainText("Full · $375.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Associate · $450.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Auxiliary · $200.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Leave of absence · $100.00");
  await expect(card.locator("#hubInvCatalog")).not.toContainText("No catalog row");
  await expect(card.locator("#hubInvSend")).toHaveCount(0);
  await card.screenshot({ path: shot("10-invoices-secretary.png"), animations: "disabled" });
});

test("fundraising summary includes cash and check dues", async ({ page }) => {
  await useHubChrome(page);
  await page.evaluate(() => {
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
  await page.addScriptTag({ url: "/assets/kos-reports.js?v=20261122ledger2" });
  await page.evaluate(() => window.__kosLoadReports(window.__kosSb));
  await page.locator("#hubReportMoneyRun").click();
  const out = page.locator("#hubReportMoneyOut");
  await expect(out).toContainText("Membership dues & applications");
  await expect(out.locator("#hubReportCashCheck")).toContainText("$750.00");
  await expect(out.locator("#hubReportCashCheck")).toContainText("cash and check dues");
  await page.locator("#hubReports").screenshot({ path: shot("11-fundraising-cash-check.png"), animations: "disabled" });
});

test("approve membership says Board ratification", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1200 });
  await unlockMemberHub(page, {
    role: {
      officer: false,
      canReviewApplications: true,
      applications: [{
        id: "app-jane",
        first_name: "Jane",
        last_name: "Sample",
        email: "jane.sample@example.com",
        phone: "555-0100",
        membership_status: "dues-pending",
        membership_level: "full",
        application_fee_type: "single",
        dues_paid: true,
        created_at: "2026-11-01T15:00:00.000Z"
      }]
    }
  });
  await page.locator("[data-hub-tab='officer']").click();
  const tile = page.locator('[data-tool="tool:hubApplications"]');
  await expect(tile).toBeVisible();
  await tile.click();
  const tool = page.locator("#hubApplications");
  await expect(tool).toContainText("Approval is subject to final ratification by the Board of Directors.");
  await expect(tool.locator("[data-app-approve='app-jane']")).toHaveText("Approve membership (subject to Board ratification)");
  await expect(tool).not.toContainText("general meeting");
  await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important} .app-card{overflow:visible !important}" });
  await page.evaluate(() => {
    document.querySelectorAll(".hub-pipe-col").forEach((col) => {
      if (!col.querySelector("[data-app-approve]")) col.style.display = "none";
    });
  });
  await tool.screenshot({ path: shot("12-approve-ratification.png"), animations: "disabled" });
});
