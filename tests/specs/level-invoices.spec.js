// Officer desk Send invoices (Phase 2): catalog quotes, level changes,
// preview counts, and kos_create_level_invoices plus outbound email.
const { test, expect } = require("@playwright/test");

const ADA = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";
const CAL = "33333333-3333-4333-8333-333333333333";
const DEE = "44444444-4444-4444-8444-444444444444";
const EVE = "55555555-5555-4555-8555-555555555555";
const FINN = "66666666-6666-4666-8666-666666666666";
const GINA = "77777777-7777-4777-8777-777777777777";

const FULL_URL = "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership";
const LOA_URL = "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2";

async function mountInvoices(page) {
  await page.goto("/raffle-qr-sheet.html");
  await page.evaluate(({ ada, bea, cal, dee, eve, finn, gina, fullUrl, loaUrl }) => {
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
      { id: gina, first_name: "Gina", last_name: "Cole", email: "gina@example.com", membership_level: "full", officer_title: "Treasurer · Committee Chair of Finance", membership_status: "active" }
    ];
    const catalog = [
      { membership_year: 2026, level: "full", amount: 375, zeffy_url: fullUrl, active: true },
      { membership_year: 2026, level: "associate", amount: 450, zeffy_url: null, active: true },
      { membership_year: 2026, level: "loa", amount: 100, zeffy_url: loaUrl, active: true },
      { membership_year: 2026, level: "auxiliary", amount: 200, zeffy_url: null, active: true }
    ];
    const dues = [
      { id: "d-ada", member_id: ada, membership_year: 2026, amount: 375, paid: false, due_date: "2026-06-30", waiver_status: null, membership_level: "full" },
      { id: "d-cal", member_id: cal, membership_year: 2026, amount: 375, paid: true, due_date: "2026-06-30", waiver_status: null, membership_level: "full" },
      { id: "d-eve", member_id: eve, membership_year: 2026, amount: 100, paid: false, due_date: "2026-06-30", waiver_status: null, membership_level: "loa" },
      { id: "d-gina", member_id: gina, membership_year: 2026, amount: 375, paid: false, due_date: "2026-06-30", waiver_status: null, membership_level: "full" }
    ];
    const tables = { members, kos_dues_catalog: catalog, dues_payments: dues };

    function chain(table) {
      const filters = [];
      const c = {
        select() { return c; },
        eq(col, val) { filters.push([col, val]); return c; },
        is() { return c; },
        in() { return c; },
        order() { return c; },
        range() { return c; },
        then(resolve, reject) {
          let rows = (tables[table] || []).slice();
          filters.forEach(([col, val]) => {
            rows = rows.filter((r) => r[col] === val);
          });
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return c;
    }

    window.__kosInvoiceCalls = [];
    window.__kosInvoiceLogs = [];
    window.__kosSb = {
      rpc: async (name, args) => {
        window.__kosInvoiceCalls.push({ name, args: args || null });
        if (name === "is_krewe_officer") return { data: true };
        if (name === "officer_email_audience_counts") return { data: { active: 7, officers: 2, chairs: 2 } };
        if (name === "officer_list_outreach_log") return { data: { items: [] } };
        if (name === "kos_set_membership_level") {
          const member = members.find((m) => m.id === args.p_member_id);
          if (member) member.membership_level = args.p_level;
          return {
            data: {
              ok: true,
              membership_level: args.p_level,
              message: (member ? member.first_name : "Member") + " is now " + args.p_level + "."
            }
          };
        }
        if (name === "kos_create_level_invoices") {
          const details = (args.p_member_ids || []).map((id) => {
            const member = members.find((m) => m.id === id);
            const row = dues.find((d) => d.member_id === id && d.membership_year === args.p_year);
            if (!member) return { member_id: id, result: "skipped_missing" };
            if (row && row.waiver_status === "applied") return { member_id: id, result: "skipped_waiver" };
            if (row && row.paid) return { member_id: id, result: "skipped_paid" };
            const elected = String(member.officer_title || "").split(/\s*·\s*/).some((part) =>
              /^(president|vice president|secretary|treasurer)$/i.test(part.trim())
            );
            if (args.p_exclude_elected_officers !== false && elected) {
              return { member_id: id, result: "skipped_officer" };
            }
            const cat = catalog.find((c) => c.membership_year === args.p_year && c.level === member.membership_level && c.active);
            if (!cat) return { member_id: id, result: "skipped_no_catalog", level: member.membership_level };
            return {
              member_id: id,
              result: row ? "updated" : "created",
              membership_level: member.membership_level,
              amount: Number(cat.amount)
            };
          });
          const count = (result) => details.filter((d) => d.result === result).length;
          return {
            data: {
              ok: true,
              year: args.p_year,
              created: count("created"),
              updated: count("updated"),
              skipped_paid: count("skipped_paid"),
              skipped_waiver: count("skipped_waiver"),
              skipped_officer: count("skipped_officer"),
              skipped_no_catalog: count("skipped_no_catalog"),
              skipped_missing: count("skipped_missing"),
              details,
              message: "Created " + count("created") + " invoice(s), updated " + count("updated") + "."
            }
          };
        }
        if (name === "officer_send_member_email") {
          return { data: { ok: true, recipient_count: (args.p_member_ids || []).length } };
        }
        return { data: null };
      },
      from(table) {
        if (table === "officer_outreach_log") {
          return {
            insert(row) {
              window.__kosInvoiceLogs.push(row);
              return Promise.resolve({ error: null });
            }
          };
        }
        return chain(table);
      }
    };
  }, {
    ada: ADA, bea: BEA, cal: CAL, dee: DEE, eve: EVE, finn: FINN, gina: GINA,
    fullUrl: FULL_URL, loaUrl: LOA_URL
  });
  await page.addScriptTag({ url: "/assets/kos-email-invoices.js?v=20260930inv1" });
  await expect(page.locator("#hubSendInvoices")).toBeVisible({ timeout: 8000 });
}

test("Send invoices quotes the catalog, changes level, and previews skips", async ({ page }) => {
  await mountInvoices(page);
  const card = page.locator("#hubSendInvoices");

  await expect(card.locator("#hubInvYear")).toHaveValue("2026");
  await expect(card.locator("#hubInvExclude")).toBeChecked();
  await expect(card.locator("#hubInvCatalog")).toContainText("Full · $375.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Associate · $450.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Leave of absence · $100.00");
  await expect(card.locator("#hubInvCatalog")).toContainText("Auxiliary · $200.00");
  await expect(card.locator("#hubInvUrlWarn")).toContainText("Associate and Auxiliary have no Zeffy link yet");
  await expect(card.locator("#hubInvAmount")).toHaveCount(0);

  await expect(card.locator(".hub-ei-item", { hasText: "Ada Lane" })).toContainText("Quote: Full · $375.00");
  await expect(card.locator(".hub-ei-item", { hasText: "Ada Lane" })).toContainText("Will update");
  await expect(card.locator(".hub-ei-item", { hasText: "Eve Nash" })).toContainText("Quote: Leave of absence · $100.00");
  await expect(card.locator(".hub-ei-item", { hasText: "Gina Cole" })).toContainText("Skip: elected officer");
  await expect(card.getByText("Bea Moss")).toHaveCount(0);
  await expect(card.getByText("Cal Pitt")).toHaveCount(0);

  await card.getByRole("button", { name: "No dues row" }).click();
  const dee = card.locator(".hub-ei-item", { hasText: "Dee Shaw" });
  const finn = card.locator(".hub-ei-item", { hasText: "Finn Chair" });
  const bea = card.locator(".hub-ei-item", { hasText: "Bea Moss" });
  await expect(dee).toContainText("Skip: elected officer");
  await expect(finn).toContainText("Will create");
  await expect(bea).toContainText("Quote: Associate · $450.00");
  await expect(bea).toContainText("No Zeffy link yet");

  await bea.locator("select").selectOption("loa");
  await expect(card.locator("#hubInvMsg")).toContainText("Bea is now loa");
  await expect(bea).toContainText("Quote: Leave of absence · $100.00");
  await expect(bea.locator("a")).toHaveAttribute("href", LOA_URL);

  await card.locator("#hubInvExclude").uncheck();
  await expect(dee).toContainText("Will create");
  await card.locator("#hubInvExclude").check();
  await expect(dee).toContainText("Skip: elected officer");

  await card.getByRole("button", { name: "Select shown" }).click();
  await expect(card.locator("#hubInvPreview")).toContainText("create 2");
  await expect(card.locator("#hubInvPreview")).toContainText("elected officer 1");

  await card.getByRole("button", { name: "By level" }).click();
  await card.locator("#hubInvLevel").selectOption("loa");
  await expect(card.getByText("Eve Nash")).toBeVisible();
  await expect(card.getByText("Bea Moss")).toBeVisible();
  await expect(card.getByText("Ada Lane")).toHaveCount(0);

  await card.getByRole("button", { name: "Roster pick" }).click();
  await card.locator("#hubInvSearch").fill("Cal");
  const cal = card.locator(".hub-ei-item", { hasText: "Cal Pitt" });
  await expect(cal).toContainText("Skip: paid");
  await expect(cal).toContainText("Quote: Full · $375.00");
});

test("Create invoices calls the level RPC and does not email paid or elected officers", async ({ page }) => {
  await mountInvoices(page);
  const card = page.locator("#hubSendInvoices");

  await card.getByRole("button", { name: "No dues row" }).click();
  await card.getByRole("button", { name: "Select shown" }).click();
  await card.getByRole("button", { name: "Roster pick" }).click();
  await card.locator("#hubInvSearch").fill("Cal");
  await card.getByRole("checkbox", { name: "Cal Pitt" }).check();

  await card.getByRole("button", { name: "Create invoices" }).click();
  await expect(card.locator("#hubInvMsg")).toContainText("Please confirm");
  const early = await page.evaluate(() => window.__kosInvoiceCalls.map((c) => c.name));
  expect(early).not.toContain("kos_create_level_invoices");

  await card.locator("#hubInvConfirm").check();
  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await card.getByRole("button", { name: "Create invoices" }).click();
  await expect(card.locator("#hubInvMsg")).toContainText("Queued 2 email notice(s).");
  expect(dialogMessage).toContain("Some associate or auxiliary invoices have no Zeffy link");

  const calls = await page.evaluate(() => window.__kosInvoiceCalls);
  const created = calls.filter((c) => c.name === "kos_create_level_invoices");
  expect(created).toHaveLength(1);
  expect(created[0].args.p_year).toBe(2026);
  expect(created[0].args.p_exclude_elected_officers).toBe(true);
  expect(created[0].args.p_member_ids.sort()).toEqual([BEA, CAL, DEE, FINN].sort());

  const emails = calls.filter((c) => c.name === "officer_send_member_email");
  expect(emails).toHaveLength(2);
  const emailedIds = emails.flatMap((c) => c.args.p_member_ids);
  expect(emailedIds.sort()).toEqual([BEA, FINN].sort());
  expect(emailedIds).not.toContain(CAL);
  expect(emailedIds).not.toContain(DEE);

  const beaMail = emails.find((c) => c.args.p_member_ids.includes(BEA));
  const finnMail = emails.find((c) => c.args.p_member_ids.includes(FINN));
  expect(beaMail.args.p_audience).toBe("selected");
  expect(beaMail.args.p_subject).toBe("Krewe of Shamrock dues invoice (2026)");
  expect(beaMail.args.p_body_html).toContain("Associate");
  expect(beaMail.args.p_body_html).toContain("$450.00");
  expect(beaMail.args.p_body_html).toContain("June 30, 2026");
  expect(beaMail.args.p_body_html).toContain("treasurer@kreweofshamrock.com");
  expect(beaMail.args.p_body_html).not.toContain("zeffy.com");
  expect(finnMail.args.p_body_html).toContain("Full");
  expect(finnMail.args.p_body_html).toContain("$375.00");
  expect(finnMail.args.p_body_html).toContain("June 30, 2026");
  expect(finnMail.args.p_body_html).toContain(FULL_URL);
  expect(finnMail.args.p_body_html).not.toContain(LOA_URL);

  const logs = await page.evaluate(() => window.__kosInvoiceLogs);
  expect(logs).toHaveLength(1);
  expect(logs[0].kind).toBe("invoice");
  expect(logs[0].meta.created).toBe(2);
  expect(logs[0].meta.skipped_paid).toBe(1);
  expect(logs[0].meta.skipped_officer).toBe(1);
  expect(logs[0].meta.emailed).toBe(2);
});

test("Create invoices can skip email", async ({ page }) => {
  await mountInvoices(page);
  const card = page.locator("#hubSendInvoices");
  await card.getByRole("button", { name: "Unpaid" }).click();
  await card.getByRole("checkbox", { name: "Ada Lane" }).check();
  await card.locator("#hubInvEmail").uncheck();
  await card.locator("#hubInvConfirm").check();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Create invoices" }).click();
  await expect(card.locator("#hubInvMsg")).toContainText("updated 1");
  await expect(card.locator("#hubInvMsg")).not.toContainText("Queued");
  const names = await page.evaluate(() => window.__kosInvoiceCalls.map((c) => c.name));
  expect(names).toContain("kos_create_level_invoices");
  expect(names).not.toContain("officer_send_member_email");
});
