// Officer desk Dues & Payments (Phase 4): season totals, waiver breakdown,
// aging buckets, and CSV field presence. Stubbed reads only.
const { test, expect } = require("@playwright/test");

const ADA = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";
const CAL = "33333333-3333-4333-8333-333333333333";
const DEE = "44444444-4444-4444-8444-444444444444";
const EVE = "55555555-5555-4555-8555-555555555555";
const FINN = "66666666-6666-4666-8666-666666666666";
const GINA = "77777777-7777-4777-8777-777777777777";
const HOLLY = "88888888-8888-4888-8888-888888888888";
const IRA = "99999999-9999-4999-8999-999999999999";
const JO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function isoOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

async function mountReporting(page, opts) {
  const allow = !opts || opts.allow !== false;
  const dates = {
    ada: isoOffset(-100),
    eve: isoOffset(-10),
    finn: isoOffset(-45),
    ken: isoOffset(-70),
    ira: isoOffset(20)
  };
  await page.goto("/raffle-qr-sheet.html");
  await page.evaluate(({ allow, dates, ids }) => {
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);

    const members = [
      { id: ids.ada, first_name: "Ada", last_name: "Lane", email: "ada@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.bea, first_name: "Bea", last_name: "Moss", email: "bea@example.com", membership_level: "associate", membership_status: "active" },
      { id: ids.cal, first_name: "Cal", last_name: "Pitt", email: "cal@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.dee, first_name: "Dee", last_name: "Shaw", email: "dee@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.eve, first_name: "Eve", last_name: "Nash", email: "eve@example.com", membership_level: "loa", membership_status: "active" },
      { id: ids.finn, first_name: "Finn", last_name: "Chair", email: "finn@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.gina, first_name: "Gina", last_name: "Cole", email: "gina@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.holly, first_name: "Holly", last_name: "Cash", email: "holly@example.com", membership_level: "auxiliary", membership_status: "active" },
      { id: ids.ira, first_name: "Ira", last_name: "Soon", email: "ira@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.jo, first_name: "Jo", last_name: "Blank", email: "jo@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.ken, first_name: "Ken", last_name: "Rowe", email: "ken@example.com", membership_level: "full", membership_status: "active" },
      { id: ids.pat, first_name: "Pat", last_name: "Legacy", email: "pat@example.com", membership_level: "full", membership_status: "active" }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, active: true },
      { membership_year: 2026, level: "associate", amount: 450, active: true },
      { membership_year: 2026, level: "loa", amount: 100, active: true },
      { membership_year: 2026, level: "auxiliary", amount: 200, active: true }
    ];
    const dues = [
      { id: "d-ada", member_id: ids.ada, membership_year: 2026, amount: 375, due_date: dates.ada, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-ada-old", member_id: ids.ada, membership_year: 2025, amount: 9999, due_date: "2025-01-01", paid: false, payment_method: null, notes: "prior year", membership_level: "full", standard_amount: 9999, waiver_kind: null, waiver_status: null },
      { id: "d-bea", member_id: ids.bea, membership_year: 2026, amount: 450, due_date: "2026-06-30", paid: true, paid_date: "2026-02-01", payment_method: "cash", notes: "Paid at the meeting.", membership_level: "associate", standard_amount: 450, waiver_kind: null, waiver_status: null },
      { id: "d-cal", member_id: ids.cal, membership_year: 2026, amount: 375, due_date: "2026-06-30", paid: true, paid_date: "2026-03-01", payment_method: "card", notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-dee", member_id: ids.dee, membership_year: 2026, amount: 0, due_date: "2026-06-30", paid: true, paid_date: "2026-01-15", payment_method: "waiver", notes: "Bylaws, elected", membership_level: "full", standard_amount: 375, waiver_kind: "elected_officer", waiver_status: "applied", waiver_approved_by: "treasurer@kreweofshamrock.com" },
      { id: "d-eve", member_id: ids.eve, membership_year: 2026, amount: 100, due_date: dates.eve, paid: false, payment_method: null, notes: "", membership_level: "loa", standard_amount: 100, waiver_kind: null, waiver_status: null },
      { id: "d-finn", member_id: ids.finn, membership_year: 2026, amount: 375, due_date: dates.finn, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-gina", member_id: ids.gina, membership_year: 2026, amount: 0, due_date: "2026-06-30", paid: true, paid_date: "2026-02-02", payment_method: "waiver", notes: "", membership_level: "full", standard_amount: 375, waiver_kind: "service_in_lieu", waiver_status: "applied", waiver_approved_by: "president@kreweofshamrock.com" },
      { id: "d-holly", member_id: ids.holly, membership_year: 2026, amount: 0, due_date: "2026-06-30", paid: true, paid_date: "2026-02-03", payment_method: "waiver", notes: "", membership_level: "auxiliary", standard_amount: 200, waiver_kind: "board_approved_other", waiver_status: "applied", waiver_approved_by: "board@kreweofshamrock.com" },
      { id: "d-ira", member_id: ids.ira, membership_year: 2026, amount: 375, due_date: dates.ira, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-jo", member_id: ids.jo, membership_year: 2026, amount: 200, due_date: null, paid: false, payment_method: null, notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null },
      { id: "d-ken", member_id: ids.ken, membership_year: 2026, amount: 375, due_date: dates.ken, paid: false, payment_method: null, notes: "Waiver requested (elected_officer): pending", membership_level: "full", standard_amount: 375, waiver_kind: "elected_officer", waiver_status: "requested", waiver_approved_by: null },
      { id: "d-pat", member_id: ids.pat, membership_year: 2026, amount: 0, due_date: "2026-06-30", paid: true, paid_date: "2026-01-01", payment_method: "waiver", notes: "", membership_level: "full", standard_amount: 375, waiver_kind: null, waiver_status: null, waiver_approved_by: null }
    ];
    const payments = [
      { id: "p-cal", created_at: "2026-03-01T15:00:00.000Z", amount_cents: 37500, product_kind: "dues", payer_name: "Cal Pitt", payer_email: "cal@example.com", description: "2026 membership", member_id: ids.cal, membership_year: 2026 },
      { id: "p-old", created_at: "2025-11-01T15:00:00.000Z", amount_cents: 1000, product_kind: "event", payer_name: "Old Event", payer_email: "old@example.com", description: "2025 social", member_id: null, membership_year: 2025 }
    ];
    const recent = [
      { when: "2026-03-02T12:00:00.000Z", amount_cents: 37500, kind: "dues", payer: "Cal Pitt", email: "cal@example.com", description: "2026 membership", matched: true },
      { when: "2026-04-01T12:00:00.000Z", amount_cents: 2500, kind: "donation", payer: "Guest Donor", email: "guest@example.com", description: "Donation", matched: false }
    ];
    const tables = { members, kos_dues_catalog: catalog, dues_payments: dues, payments };

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

    window.__kosDuesCalls = [];
    window.__kosDuesReads = [];
    window.__kosSb = {
      rpc: async (name, args) => {
        window.__kosDuesCalls.push({ name, args: args || null });
        if (name === "can_view_payments") return { data: allow };
        if (name === "list_recent_payments") return { data: recent };
        return { data: null };
      },
      from(table) {
        window.__kosDuesReads.push(table);
        return chain(table);
      }
    };
  }, {
    allow,
    dates,
    ids: { ada: ADA, bea: BEA, cal: CAL, dee: DEE, eve: EVE, finn: FINN, gina: GINA, holly: HOLLY, ira: IRA, jo: JO, ken: KEN, pat: PAT }
  });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20260930rep1" });
}

async function shown(page) {
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");
  await expect(page.locator("#hubPayments h2")).toHaveText("Dues & Payments");
}

test("season totals exclude waivers and the payments ledger", async ({ page }) => {
  await mountReporting(page);
  await shown(page);
  await page.getByRole("tab", { name: "Dues season" }).click();

  await expect(page.locator("#hubPayYear")).toHaveValue("2026");
  await expect(page.locator("#hubPayInvoiced")).toHaveText("12");
  await expect(page.locator("#hubPayCash")).toHaveText("$825.00");
  await expect(page.locator("#hubPayOutstanding")).toHaveText("$1,800.00");
  await expect(page.locator("#hubPayWaived")).toHaveText("$1,325.00");
  await expect(page.locator("#hubPayRate")).toHaveText("31.4%");
  await expect(page.locator("#hubPayments")).not.toContainText("zeffy.com");
  await expect(page.locator("#hubPayments")).not.toContainText("9,999");

  const full = page.locator("#hubPayLevels tr[data-level='full']");
  await expect(full).toContainText("Full");
  await expect(full).toContainText("9");
  await expect(full).toContainText("$375.00");
  await expect(full).toContainText("$1,125.00");
  await expect(full).toContainText("$1,700.00");
  const associate = page.locator("#hubPayLevels tr[data-level='associate']");
  await expect(associate).toContainText("$450.00");
  await expect(associate).toContainText("$0.00");
  const loa = page.locator("#hubPayLevels tr[data-level='loa']");
  await expect(loa).toContainText("$100.00");
  const auxiliary = page.locator("#hubPayLevels tr[data-level='auxiliary']");
  await expect(auxiliary).toContainText("$200.00");

  await page.locator("#hubPayStatus").selectOption("paid");
  await expect(page.locator("#hubPayMembers")).toContainText("Bea Moss");
  await expect(page.locator("#hubPayMembers")).toContainText("Cal Pitt");
  await expect(page.locator("#hubPayMembers")).not.toContainText("Ada Lane");
  await expect(page.locator("#hubPayMembers")).not.toContainText("Dee Shaw");

  await page.locator("#hubPayStatus").selectOption("unpaid");
  await expect(page.locator("#hubPayMembers")).toContainText("Ada Lane");
  await expect(page.locator("#hubPayMembers")).toContainText("Ken Rowe");
  await expect(page.locator("#hubPayMembers")).not.toContainText("Bea Moss");

  await page.locator("#hubPaySearch").fill("Eve");
  await expect(page.locator("#hubPayMembers")).toContainText("Eve Nash");
  await expect(page.locator("#hubPayMembers")).not.toContainText("Ada Lane");

  const aging = page.locator("#hubPayAging");
  await expect(page.locator("[data-bucket=over]")).toContainText("Ada Lane");
  await expect(page.locator("[data-bucket=d30]")).toContainText("Eve Nash");
  await expect(page.locator("[data-bucket=d60]")).toContainText("Finn Chair");
  await expect(page.locator("[data-bucket=d90]")).toContainText("Ken Rowe");
  await expect(page.locator("[data-bucket=future]")).toContainText("Ira Soon");
  await expect(page.locator("[data-bucket=none]")).toContainText("Jo Blank");
  await expect(aging).not.toContainText("Bea Moss");
  await expect(aging).not.toContainText("Dee Shaw");
  await expect(page.locator("#hubPayAging button")).toHaveCount(0);
  await expect(page.locator("#hubPayPanel_season")).toContainText("does not send email");

  await page.getByRole("tab", { name: "Cash ledger" }).click();
  await expect(page.locator("#hubPayPanel_ledger")).toBeVisible();
  await expect(page.locator("#hubPayPanel_ledger")).toContainText("Cal Pitt");
  await expect(page.locator("#hubPayPanel_ledger")).toContainText("Guest Donor");
  await expect(page.locator("#hubPayPanel_ledger")).toContainText("no roster match");
  await expect(page.locator("#hubPayPanel_ledger")).toContainText("$375.00");
  await expect(page.locator("#hubPayPanel_season")).toBeHidden();

  const names = await page.evaluate(() => window.__kosDuesCalls.map((c) => c.name));
  expect(names).toContain("can_view_payments");
  expect(names).toContain("list_recent_payments");
  expect(names).not.toContain("officer_send_member_email");
  expect(names).not.toContain("kos_request_dues_waiver");
  expect(names).not.toContain("kos_decide_dues_waiver");
  expect(names).not.toContain("kos_apply_elected_officer_exemptions");
  expect(names).not.toContain("kos_create_level_invoices");

  await page.locator("#hubPayYear").fill("2027");
  await page.locator("#hubPayYear").blur();
  await page.getByRole("tab", { name: "Dues season" }).click();
  await expect(page.locator("#hubPayInvoiced")).toHaveText("0", { timeout: 8000 });
  await expect(page.locator("#hubPayCash")).toHaveText("$0.00");
  await expect(page.locator("#hubPayRate")).toHaveText("—");
});

test("waiver report splits kinds and skips requests", async ({ page }) => {
  await mountReporting(page);
  await shown(page);
  await page.getByRole("tab", { name: "Waivers" }).click();

  const report = page.locator("#hubPayWaiverReport");
  const elected = report.locator("[data-kind=elected_officer]");
  await expect(elected).toContainText("Elected officer exemption");
  await expect(elected).toContainText("Dee Shaw");
  await expect(elected).toContainText("treasurer@kreweofshamrock.com");
  await expect(elected).toContainText("$375.00");
  await expect(elected).not.toContainText("Ken Rowe");

  const service = report.locator("[data-kind=service_in_lieu]");
  await expect(service).toContainText("Gina Cole");
  await expect(service).toContainText("president@kreweofshamrock.com");
  await expect(service).toContainText("$375.00");

  const other = report.locator("[data-kind=board_approved_other]");
  await expect(other).toContainText("Holly Cash");
  await expect(other).toContainText("board@kreweofshamrock.com");
  await expect(other).toContainText("$200.00");

  const unspecified = report.locator("[data-kind=unspecified]");
  await expect(unspecified).toContainText("Pat Legacy");
  await expect(unspecified).toContainText("not recorded");
  await expect(unspecified).toContainText("$375.00");

  await expect(report).not.toContainText("Ken Rowe");
  await expect(report).not.toContainText("Ada Lane");
  await expect(page.locator("#hubPayPanel_waivers")).toContainText("Dues waivers");
  await expect(page.locator("#hubPayPanel_waivers button")).toHaveCount(0);
});

test("CSV downloads include dues fields and respect the ledger date range", async ({ page }) => {
  await mountReporting(page);
  await shown(page);
  await page.getByRole("tab", { name: "Export" }).click();
  await expect(page.locator("#hubPayLedgerCount")).toHaveText("1 payment in this range.");

  await page.locator("#hubPayDuesCsv").click();
  const dues = await page.evaluate(() => window.__kosLastCsv);
  expect(dues.filename).toBe("kos-dues-2026.csv");
  const header = dues.text.split("\r\n")[0];
  expect(header).toBe("member_name,email,membership_level,amount,standard_amount,status,payment_method,paid,paid_date,due_date,waiver_kind,waiver_status,waiver_approved_by,notes");
  expect(dues.text).toContain("dee@example.com");
  expect(dues.text).toContain("elected_officer");
  expect(dues.text).toContain("waived");
  expect(dues.text).toContain("\"Bylaws, elected\"");
  expect(dues.text).toContain("treasurer@kreweofshamrock.com");
  expect(dues.text.split("\r\n").filter(Boolean)).toHaveLength(13);
  const dee = dues.text.split("\r\n").find((line) => line.indexOf("dee@example.com") !== -1);
  expect(dee).toContain("full,0.00,375.00,waived,waiver,true");

  await page.locator("#hubPayLedgerCsv").click();
  const ledger = await page.evaluate(() => window.__kosLastCsv);
  expect(ledger.filename).toContain("kos-payments-2026-01-01");
  expect(ledger.text.split("\r\n")[0]).toBe("when,payer_name,email,kind,description,amount,membership_year,matched");
  expect(ledger.text).toContain("Cal Pitt");
  expect(ledger.text).toContain("cal@example.com");
  expect(ledger.text).toContain("dues");
  expect(ledger.text).toContain("375.00");
  expect(ledger.text).toContain("yes");
  expect(ledger.text).not.toContain("Old Event");

  await page.locator("#hubPayFrom").fill("2026-06-01");
  await expect(page.locator("#hubPayLedgerCount")).toHaveText("0 payments in this range.");
  await page.locator("#hubPayLedgerCsv").click();
  const empty = await page.evaluate(() => window.__kosLastCsv.text);
  expect(empty).not.toContain("Cal Pitt");
  expect(empty).not.toContain("Old Event");
});

test("payments gate hides the report from other officers", async ({ page }) => {
  await mountReporting(page, { allow: false });
  await page.waitForFunction(() => window.__kosDuesReportingReady === "denied");
  await expect(page.locator("#hubPayments")).toHaveCount(0);
  const names = await page.evaluate(() => window.__kosDuesCalls.map((c) => c.name));
  expect(names).toContain("can_view_payments");
  const reads = await page.evaluate(() => window.__kosDuesReads);
  expect(reads).toEqual([]);
});
