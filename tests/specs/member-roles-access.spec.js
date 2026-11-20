// Member roles and access. Role fixtures drive the Hub offline.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");
const rules = require("../../assets/kos-roles-access-rules.js");

function member(partial) {
  return Object.assign({
    committees: [],
    membership_status: "active",
    grants: [],
    title_keys: [],
    officer_title: ""
  }, partial);
}

function model(extra) {
  const base = {
    sample: true,
    selectedId: "tammy",
    viewer: {
      id: "tim",
      name: "Tim Fitzpatrick",
      canChangeAnyTitle: true,
      canChangeChairTitles: true,
      isAdmin: true,
      isOfficerBoardOrChair: true,
      grantable: rules.TOOLS.map(function (tool) { return tool.key; })
    },
    members: [
      member({ id: "tim", first_name: "Tim", last_name: "Fitzpatrick", title_keys: ["president"], officer_title: "President" }),
      member({ id: "lisa", first_name: "Lisa", last_name: "Sugrue", title_keys: ["board_member", "chair_membership"], officer_title: "Board Member · Committee Chair of Membership", committees: ["Membership"] }),
      member({ id: "patrick", first_name: "Patrick", last_name: "Pustay", title_keys: ["treasurer", "chair_finance"], officer_title: "Treasurer · Committee Chair of Finance", committees: ["Finance"] }),
      member({
        id: "tammy",
        first_name: "Tammy",
        last_name: "Miller",
        title_keys: ["cochair_merchandise"],
        officer_title: "Co-Chair of Merchandise",
        committees: ["Merchandise"],
        grants: [{ tool_key: "email_members", ends_on: "2027-06-30", needs_review: true }]
      }),
      member({ id: "deb", first_name: "Deb", last_name: "Rutkowski", title_keys: ["cochair_merchandise"], officer_title: "Co-Chair of Merchandise", committees: ["Merchandise"] }),
      member({ id: "riley", first_name: "Riley", last_name: "Quinn", committees: ["Parade"] }),
      member({
        id: "jordan",
        first_name: "Jordan",
        last_name: "Hale",
        committees: ["Social"],
        membership_status: "lapsed",
        grants: [{ tool_key: "shop_studio", ends_on: "2027-06-30" }]
      })
    ],
    requests: [{
      id: "req-casey",
      member_id: "casey",
      first_name: "Casey",
      last_name: "Nolan",
      committee: "Parade",
      note: "I have helped build the float for three seasons."
    }],
    changes: [
      {
        id: "chg-new",
        summary: "Granted Shop Studio to Riley Quinn until June 30, 2027.",
        actor_name: "Tim Fitzpatrick",
        actor_member_id: "tim",
        created_at: "2026-11-12T15:00:00-05:00",
        undone: false,
        hasNewer: false
      },
      {
        id: "chg-old",
        summary: "Set Committee Chair of Social.",
        actor_name: "Lisa Sugrue",
        actor_member_id: "lisa",
        created_at: "2026-01-02T15:00:00-05:00",
        undone: false,
        hasNewer: false
      }
    ]
  };
  return Object.assign(base, extra || {});
}

async function openRoles(page, access) {
  await unlockMemberHub(page, {
    role: {
      officer: true,
      toolKeys: rules.toolsForTitles(["president"]),
      rolesAccess: access
    }
  });
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator('[data-tool="tool:hubRolesAccess"]').click();
  await expect(page.locator("#kosRolesRoot")).toBeVisible();
}

test.describe("Member roles and access", () => {
  test("the new screen replaces Committee chairs", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model());
    await expect(page.locator("#hubRolesAccess")).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubRolesAccess"]')).toHaveCount(1);
    await expect(page.locator('[data-tool="tool:hubChairDesk"]')).toHaveCount(0);
    await expect(page.locator("#kosRolesRoot")).toContainText("Casey Nolan");
    await expect(page.locator("#kosRolesRoot")).toContainText("Asked to chair Parade");
    await expect(page.locator("#kosRolesSample")).toBeVisible();
    assertHealthy(expect, report, "roles screen");
  });

  test("a member's title and tools show at a glance, and a new grant defaults to next June 30", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model({ selectedId: "riley" }));
    await expect(page.locator("#kosRolesMember")).toHaveText("Riley Quinn");
    const shop = page.locator('input[data-tool="shop_studio"]');
    await shop.check();
    await expect(page.locator('input[data-end="shop_studio"]')).toHaveValue("2027-06-30");
    await page.locator("#kosRolesReview").click();
    await expect(page.locator("#kosRolesConfirm")).toContainText("Shop Studio");
    await expect(page.locator("#kosRolesConfirm")).toContainText("June 30, 2027");
    assertHealthy(expect, report, "default end date");
  });

  test("nobody edits their own title or tools", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model({ selectedId: "tim" }));
    await expect(page.locator("#kosRolesRoot")).toContainText("You cannot change your own title or tools.");
    await expect(page.locator('input[data-title="president"]')).toBeDisabled();
    await expect(page.locator('input[data-tool="shop_studio"]')).toBeDisabled();
    assertHealthy(expect, report, "no self edit");
  });

  test("Membership Chair can set a chair title and not President", async ({ page }) => {
    const report = watchPage(page);
    const access = model({
      selectedId: "riley",
      viewer: {
        id: "lisa",
        name: "Lisa Sugrue",
        canChangeAnyTitle: false,
        canChangeChairTitles: true,
        isAdmin: false,
        isOfficerBoardOrChair: true,
        grantable: rules.toolsForTitles(["chair_membership", "board_member"])
      }
    });
    await openRoles(page, access);
    await expect(page.locator('input[data-title="president"]')).toBeDisabled();
    await expect(page.locator('input[data-title="chair_parade"]')).toBeEnabled();
    await page.locator('input[data-title="chair_parade"]').check();
    await expect(page.locator('input[data-tool="event_studio"]')).toBeChecked();
    await expect(page.locator('input[data-tool="event_studio"]')).toBeDisabled();
    assertHealthy(expect, report, "membership chair limits");
  });

  test("lapsed grants show as paused and resume copy is on the tool", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model({ selectedId: "jordan" }));
    await expect(page.locator("#kosRolesRoot")).toContainText("Paused until they are active again");
    assertHealthy(expect, report, "paused grant");
  });

  test("handover confirmation lists extra grants that stay", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model({
      handoverOpen: true,
      handoverTitle: "cochair_merchandise",
      handoverTo: "riley"
    }));
    const confirm = page.locator("#kosRolesConfirm");
    await expect(confirm).toContainText("Co-Chair of Merchandise");
    await expect(confirm).toContainText("moves from Tammy Miller");
    await expect(confirm).toContainText("Riley Quinn");
    await expect(confirm).toContainText("These extra grants stay with Tammy Miller");
    await expect(confirm).toContainText("Email members");
    await expect(confirm).toContainText("Shop Studio");
    assertHealthy(expect, report, "handover confirmation");
  });

  test("undo follows the 7 day window, and President can undo an older change", async ({ page }) => {
    const report = watchPage(page);
    await openRoles(page, model());
    await expect(page.locator('[data-undo="chg-new"]')).toBeVisible();
    await expect(page.locator('[data-undo="chg-old"]')).toBeVisible();

    const lisa = model({
      viewer: {
        id: "lisa",
        name: "Lisa Sugrue",
        canChangeAnyTitle: false,
        canChangeChairTitles: true,
        isAdmin: false,
        isOfficerBoardOrChair: true,
        grantable: rules.toolsForTitles(["chair_membership"])
      },
      changes: [
        {
          id: "chg-lisa",
          summary: "Added an extra grant.",
          actor_name: "Lisa Sugrue",
          actor_member_id: "lisa",
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          undone: false,
          hasNewer: false
        },
        {
          id: "chg-old",
          summary: "Older change by Lisa.",
          actor_name: "Lisa Sugrue",
          actor_member_id: "lisa",
          created_at: "2026-01-02T15:00:00-05:00",
          undone: false,
          hasNewer: false
        }
      ]
    });
    await page.evaluate((access) => window.__kosSetRolesAccess(access), lisa);
    await expect(page.locator('[data-undo="chg-lisa"]')).toBeVisible();
    await expect(page.locator('[data-undo="chg-old"]')).toHaveCount(0);
    assertHealthy(expect, report, "undo window");
  });

  test("desktop and mobile screenshots of the review screen", async ({ page }) => {
    const report = watchPage(page);
    const access = model({
      handoverOpen: true,
      handoverTitle: "cochair_merchandise",
      handoverTo: "riley"
    });
    await openRoles(page, access);
    await expect(page.locator("#kosRolesConfirm")).toBeVisible();
    const dir = "specs/../../docs/preview/member-roles-access";
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#kosRolesRoot").scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/desktop.png" });
    await page.locator("#kosRolesConfirm").scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/desktop-confirm.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    const search = page.locator("#kosRolesSearch");
    await expect(search).toBeVisible();
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/mobile.png" });
    await page.locator("#kosRolesConfirm").scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/mobile-confirm.png" });
    assertHealthy(expect, report, "screenshots");
  });

  test("search finds a later member by either name order and hides merged rows", async ({ page }) => {
    const report = watchPage(page);
    const people = [
      member({ id: "heather", first_name: "Heather", last_name: "Bauder" })
    ];
    for (let i = 0; i < 24; i += 1) {
      people.push(member({
        id: "early-" + i,
        first_name: "Pat",
        last_name: "Early" + String(i).padStart(2, "0")
      }));
    }
    people.push(member({ id: "anna", first_name: "Anna", last_name: "Peterson", email: "anna.peterson@example.test" }));
    people.push(member({ id: "merged", first_name: "Pat", last_name: "Merged", merged_into: "anna" }));
    await openRoles(page, model({ members: people, selectedId: "heather" }));
    const results = page.locator("#kosRolesResults");
    await expect(results).toContainText("Heather Bauder");
    await expect(results).not.toContainText("Anna Peterson");
    const search = page.locator("#kosRolesSearch");
    await search.fill("Peterson Anna");
    await expect(results).toContainText("Anna Peterson");
    await expect(results).not.toContainText("anna.peterson@example.test");
    await expect(results).not.toContainText("Pat Merged");
    await search.fill("ann pet");
    await expect(results).toContainText("Anna Peterson");
    await search.fill("PETERSON");
    await expect(results).toContainText("Anna Peterson");
    await search.fill("anna peterson");
    await expect(results).toContainText("Anna Peterson");
    await search.fill("Merged");
    await expect(results).toContainText("No matching member.");
    assertHealthy(expect, report, "name search");
  });

  test("a typed name searches past the first roster page", async ({ page }) => {
    const report = watchPage(page);
    const firstPage = [
      member({ id: "heather", first_name: "Heather", last_name: "Bauder", email: "heather@example.test" })
    ];
    for (let i = 0; i < 24; i += 1) {
      firstPage.push(member({
        id: "early-" + i,
        first_name: "Pat",
        last_name: "Early" + String(i).padStart(2, "0"),
        email: "early" + i + "@example.test"
      }));
    }
    const anna = member({
      id: "13630601-e76d-4948-b758-8985643be69d",
      first_name: "Anna",
      last_name: "Peterson",
      email: "anna.peterson@example.test",
      membership_status: "active"
    });
    await unlockMemberHub(page, {
      role: {
        officer: true,
        toolKeys: rules.toolsForTitles(["president"])
      }
    });
    await page.waitForFunction(() => window.__kosSb);
    await page.evaluate(({ firstPage, anna }) => {
      const calls = [];
      function query() {
        const result = Promise.resolve({ data: [], error: null });
        const b = {
          select: function () { return b; },
          eq: function () { return b; },
          neq: function () { return b; },
          in: function () { return b; },
          is: function () { return b; },
          order: function () { return b; },
          limit: function () { return b; },
          maybeSingle: function () { return result; },
          single: function () { return result; },
          then: function (resolve, reject) { return result.then(resolve, reject); }
        };
        return b;
      }
      const mock = {
        from: function () { return query(); },
        rpc: async function (name, args) {
          if (name === "search_member_access") {
            // Mimic the database function that is live today: one substring
            // over "first last", capped to a page that does not include Anna
            // until the query actually matches that string.
            const q = String((args && args.p_q) || "").trim().toLowerCase();
            calls.push(q);
            if (!q) return { data: firstPage, error: null };
            const blob = ("anna peterson " + String(anna.email || "")).toLowerCase();
            if (blob.indexOf(q) !== -1) return { data: [anna], error: null };
            return { data: [], error: null };
          }
          if (name === "get_member_access") {
            const id = args && args.p_member_id;
            if (id === anna.id) {
              await new Promise(function (resolve) { window.__kosReleaseAnna = resolve; });
            }
            const row = id === anna.id ? anna : firstPage[0];
            return {
              data: {
                ok: true,
                member: Object.assign({}, row, {
                  title_keys: id === anna.id ? ["chair_parade"] : [],
                  committees: id === anna.id ? ["Parade"] : (row.committees || [])
                }),
                tools: id === anna.id ? [{
                  key: "payments",
                  grant: { ends_at: "2027-06-30T04:00:00.000Z", expired: false, needs_review: false }
                }] : [],
                viewer: {
                  member_id: "heather",
                  is_admin: true,
                  can_change_any_title: true,
                  can_change_chair_titles: true,
                  grantable: []
                }
              },
              error: null
            };
          }
          if (name === "list_access_chair_requests" || name === "list_member_access_changes" || name === "list_my_hub_notices") {
            return { data: [], error: null };
          }
          return { data: [], error: null };
        }
      };
      window.__kosSearchCalls = calls;
      Object.defineProperty(window, "__kosSb", {
        configurable: true,
        get: function () { return mock; },
        set: function () {}
      });
      if (typeof window.__kosSetRolesAccess === "function") window.__kosSetRolesAccess(null);
    }, { firstPage, anna });
    await page.locator("[data-hub-tab='officer']").click();
    await page.locator('[data-tool="tool:hubRolesAccess"]').click();
    const results = page.locator("#kosRolesResults");
    await expect(results).toContainText("Heather Bauder");
    await expect(results).not.toContainText("Anna Peterson");
    await page.locator("#kosRolesSearch").fill("Peterson");
    await expect(results).toContainText("Anna Peterson");
    await expect(results).not.toContainText("anna.peterson@example.test");
    await page.locator("#kosRolesSearch").fill("Peterson Anna");
    await expect(results).toContainText("Anna Peterson");
    await page.locator("#kosRolesSearch").fill("ann pet");
    await expect(results).toContainText("Anna Peterson");
    await page.locator("#kosRolesSearch").fill("Anna");
    await expect(results).toContainText("Anna Peterson");
    const calls = await page.evaluate(() => window.__kosSearchCalls.slice());
    expect(calls).toContain("peterson");
    expect(calls).toContain("peterson anna");
    expect(calls).toContain("ann");
    expect(calls).toContain("pet");
    expect(calls).toContain("ann pet");
    expect(calls).toContain("anna");
    await results.locator("[data-member='13630601-e76d-4948-b758-8985643be69d']").click();
    await expect(page.locator("#kosRolesMember")).toHaveText("Anna Peterson");
    await expect(page.locator("#kosRolesOpening")).toContainText("Opening their titles and tools");
    await expect(page.locator("#kosRolesReview")).toHaveCount(0);
    await expect(page.locator("#kosRolesTitles")).toHaveCount(0);
    await page.evaluate(() => window.__kosReleaseAnna());
    await expect(page.locator("#kosRolesTitles")).toBeVisible();
    await expect(page.locator('input[data-title="chair_parade"]')).toBeChecked();
    await expect(page.locator('input[data-tool="payments"]')).toBeChecked();
    await expect(page.locator("#kosRolesRoot")).toContainText("Committees: Parade");
    await expect(page.locator("#kosRolesRoot")).toContainText("Extra grant");
    await expect(page.locator("#kosRolesRoot")).not.toContainText("anna.peterson@example.test");
    assertHealthy(expect, report, "server name search");
  });
});
