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
          created_at: "2026-11-13T15:00:00-05:00",
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
    await page.locator("#kosRolesSearch").scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/mobile.png" });
    await page.locator("#kosRolesConfirm").scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/mobile-confirm.png" });
    assertHealthy(expect, report, "screenshots");
  });
});
