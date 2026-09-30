// Event prospects audience inside Email members. Fixtures only — SQL is not
// applied in this environment, and nothing is sent.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

async function openEmailMembers(page) {
  await page.addInitScript(() => {
    let inner = null;
    window.__kosEmailCalls = [];
    Object.defineProperty(window, "__kosSb", {
      configurable: true,
      enumerable: true,
      get() { return inner; },
      set(client) {
        if (client && typeof client.rpc === "function" && !client.__kosEmailWrapped) {
          const orig = client.rpc.bind(client);
          client.rpc = async function (name, args) {
            window.__kosEmailCalls.push({ name: name, args: args || null });
            if (name === "is_krewe_officer") return { data: true, error: null };
            if (name === "officer_email_audience_counts") {
              return {
                data: {
                  ok: true,
                  active: 42,
                  officers: 8,
                  chairs: 11,
                  prospects: 17,
                  prospects_legacy: 23
                },
                error: null
              };
            }
            if (name === "officer_list_outreach_log") return { data: { items: [] }, error: null };
            if (name === "officer_send_member_email") {
              const aud = args && args.p_audience;
              return {
                data: {
                  ok: true,
                  recipient_count: aud === "prospects_legacy" ? 23 : 17,
                  skipped_opt_out: 1,
                  audience: aud
                },
                error: null
              };
            }
            try {
              return await orig(name, args);
            } catch (err) {
              return { data: null, error: { message: String(err && err.message || err) } };
            }
          };
          client.__kosEmailWrapped = true;
        }
        inner = client;
      }
    });
  });

  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.locator("[data-hub-tab='officer']").click();
  // Email members boots twice (page load and kosUnlock). Wait until the
  // second paint has replaced the card, then open the tool.
  await expect.poll(async () => page.evaluate(() =>
    window.__kosEmailCalls.filter((c) => c.name === "officer_email_audience_counts").length
  ), { timeout: 12000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.locator('[data-tool="tool:hubEmailMembers"]').click();
  await expect(page.locator("#hubEmAud_prospects")).toBeVisible();
}

test("officers can preview and queue an event-prospects blast without the active roster", async ({ page }) => {
  const report = watchPage(page);
  await openEmailMembers(page);

  const card = page.locator("#hubEmailMembers");
  await expect(card.locator("h2")).toHaveText("Email members");
  await card.locator("#hubEmAud_prospects").click();
  await expect(card.locator("#hubEmAud_prospects")).toHaveClass(/on/);
  await expect(card.locator("#hubEmLegacy")).not.toBeChecked();
  await expect(card.locator("#hubEmCountProspects")).toHaveText("(17)");
  await expect(card.locator("#hubEmProspectNote")).toContainText("Active members are not added");
  await expect(card.locator("#hubEmProspectNote")).toContainText("Duplicate emails are sent once");
  await expect(card.locator("#hubEmSubject")).toHaveAttribute("placeholder", /Tartan Ball/);

  await card.locator("#hubEmSubject").fill("Tartan Ball — save your seat");
  await card.locator("#hubEmBody").fill("You are on our event list. This note is only for prospects and unmatched Zeffy buyers.");
  await expect(card.locator("#hubEmPreview")).toContainText("Tartan Ball — save your seat");
  await expect(card.locator("#hubEmPreview")).toContainText("unmatched Zeffy buyers");

  await page.locator("#hubOfficer").screenshot({
    path: "/opt/cursor/artifacts/event-prospects-email-audience.png"
  });

  await card.locator("#hubEmConfirm").check();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("event prospects");
    expect(dialog.message()).not.toContain("ALL active members");
    await dialog.accept();
  });
  await card.locator("#hubEmSend").click();
  await expect(card.locator("#hubEmMsg")).toContainText("Queued for 17");
  await expect(card.locator("#hubEmMsg")).toContainText("Skipped 1 opted-out");

  const first = await page.evaluate(() =>
    window.__kosEmailCalls.filter((c) => c.name === "officer_send_member_email")
  );
  expect(first).toHaveLength(1);
  expect(first[0].args.p_audience).toBe("prospects");
  expect(first[0].args.p_member_ids).toBeNull();
  expect(first[0].args.p_subject).toBe("Tartan Ball — save your seat");

  await card.locator("#hubEmAud_prospects").click();
  await card.locator("#hubEmLegacy").check();
  await expect(card.locator("#hubEmCountProspects")).toHaveText("(23)");
  await card.locator("#hubEmSubject").fill("Tartan Ball — friends of the krewe");
  await card.locator("#hubEmBody").fill("Including legacy Wild Apricot addresses.");
  await card.locator("#hubEmConfirm").check();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("legacy Wild Apricot");
    expect(dialog.message()).not.toContain("ALL active members");
    await dialog.accept();
  });
  await card.locator("#hubEmSend").click();
  await expect(card.locator("#hubEmMsg")).toContainText("Queued for 23");

  const both = await page.evaluate(() =>
    window.__kosEmailCalls.filter((c) => c.name === "officer_send_member_email")
  );
  expect(both).toHaveLength(2);
  expect(both[1].args.p_audience).toBe("prospects_legacy");
  expect(both[1].args.p_member_ids).toBeNull();

  assertHealthy(expect, report, "event prospects email");
});
