// Hub-native volunteer hours: no Track It Forward instructions, Approvals
// queue, host confirm, Event Studio cap, and volunteer signup pending hours.
const { test, expect } = require("./kos-fixtures");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub, openHomeShortcut } = require("./helpers");

const SHOTS = "/opt/cursor/artifacts/screenshots";
const ARTIFACTS = "/opt/cursor/artifacts";
fs.mkdirSync(ARTIFACTS, { recursive: true });

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

function daysFromNow(days, hourUtc) {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + days);
  when.setUTCHours(hourUtc, 0, 0, 0);
  return when.toISOString();
}

const OPEN_EVENT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Float work day",
  source: "krewe",
  status: "published",
  start_time: daysFromNow(14, 18),
  end_time: daysFromNow(14, 21),
  location: "Krewe float barn",
  event_type: "volunteer",
  is_public: true,
  volunteer_cap: 4,
  volunteer_slots_used: 1
};

const FULL_EVENT = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Parade security",
  source: "krewe",
  status: "published",
  start_time: daysFromNow(21, 16),
  location: "Bayshore",
  event_type: "volunteer",
  is_public: true,
  volunteer_cap: 1,
  volunteer_slots_used: 1
};

async function openHomeHours(page) {
  await unlockMemberHub(page);
  const card = page.locator("#hubHome #hubHoursCard");
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  return card;
}

test.describe("Hub volunteer hours", () => {
  test("member hours form does not send people to Track It Forward", async ({ page }) => {
    const report = watchPage(page);
    const card = await openHomeHours(page);
    await expect(card).toContainText("Log hours for this season");
    await expect(card.locator("#vhKind")).toBeVisible();
    await expect(card.locator("#vhActivity")).toBeVisible();
    await expect(card.locator("#vhHours")).toBeVisible();
    await expect(card.locator('button[type="submit"]')).toHaveText(/Save hours/);
    const text = await card.innerText();
    expect(text).toContain("June through May");
    expect(text).toContain("12 hours");
    expect(text).toContain("$12");
    expect(text).toContain("In-kind");
    expect(text).toContain("Season hours on file");
    expect(text.toLowerCase()).not.toContain("trackitforward");
    expect(text.toLowerCase()).not.toContain("track it forward");
    expect(text.toLowerCase()).not.toContain("separate login");
    expect(text).not.toContain("awaiting officer review");
    expect(text.toLowerCase()).not.toContain("officer confirms");
    expect(text.toLowerCase()).not.toContain("double hours");
    expect(text.toLowerCase()).not.toContain("alcohol parade");
    expect(text).toContain("Signing up to volunteer at an event logs those hours when a slot is open.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await card.locator("#vhForm p").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ARTIFACTS, "volunteer-hours-card-desktop.png"), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await card.locator("#vhForm p").evaluate(function (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await page.screenshot({ path: path.join(ARTIFACTS, "volunteer-hours-card-phone.png"), fullPage: false });
    assertHealthy(expect, report, "hours form");
  });

  test("FAQ tells members to log hours in the Hub", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.locator('#homeDeskHero [data-desk-goto="deskFaq"]').click();
    await page.locator('[data-faq-pill="charities"]').click();
    const block = page.locator('[data-faq-section="charities"]');
    await expect(block).toBeVisible();
    await expect(block).toContainText("How to record volunteer hours");
    await expect(block).toContainText("Log hours only in the Member Hub");
    await expect(block.locator('a[href="members.html?hub=hours#hours"]')).toBeVisible();
    const text = await block.innerText();
    expect(text.toLowerCase()).not.toContain("trackitforward");
    expect(text.toLowerCase()).not.toContain("separate login");
    expect(text).not.toContain("\u2014");
    expect(text.toLowerCase()).not.toContain("officer confirms");
    expect(text).toContain("as soon as you save them");
    expect(text).toContain("Parade Security");
    expect(text.toLowerCase()).not.toContain("double hours");
    expect(text.toLowerCase()).not.toContain("alcohol parade");
    await page.setViewportSize({ width: 1280, height: 900 });
    await block.locator("h3", { hasText: "Ways to earn volunteer hours" }).evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await page.screenshot({ path: path.join(ARTIFACTS, "faq-hours-desktop.png"), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await block.locator("h3", { hasText: "Ways to earn volunteer hours" }).evaluate(function (el) {
      el.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await page.screenshot({ path: path.join(ARTIFACTS, "faq-hours-phone.png"), fullPage: false });
    assertHealthy(expect, report, "faq hours");
  });

  test("officer Approvals lists pending hours", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canReviewHours: true } });
    await page.evaluate(() => {
      window.__kosHubSetHourApprovals([
        {
          id: "h-manual",
          member_name: "Nia Byrne",
          hours: 6,
          activity: "Season hours on file",
          worked_on: "2026-09-01",
          source: "manual",
          notes: "Balance from earlier this season."
        },
        {
          id: "h-signup",
          member_name: "Patrick Doyle",
          hours: 3,
          activity: "Float work day volunteer",
          worked_on: "2026-10-04",
          event_name: "Float work day",
          source: "event_signup"
        }
      ], { officer: true });
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await page.locator('[data-tool="tool:hubApprovals"]').click();
    const queue = page.locator("#hubApprovals");
    await expect(queue).toBeVisible();
    await expect(queue).toContainText("Volunteer hours");
    await expect(queue).toContainText("Nia Byrne");
    await expect(queue).toContainText("Season hours on file");
    await expect(queue).toContainText("Logged in the Hub");
    await expect(queue).toContainText("Patrick Doyle");
    await expect(queue).toContainText("Event signup");
    await expect(queue).toContainText("Float work day");
    await shot(page, "approvals-pending-hours.png");
    assertHealthy(expect, report, "officer hours queue");
  });

  test("host approves pending hours for their event", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: false, canManageEvents: false, canReviewHours: true } });
    await page.evaluate(() => {
      window.__kosHubSetHourApprovals([
        {
          id: "h-host",
          member_name: "Aisling Byrne",
          hours: 4,
          activity: "Parade security",
          worked_on: "2026-10-11",
          event_name: "Gasparilla security",
          source: "event_signup",
          notes: "Signed up for the security slot."
        }
      ], { officer: false, host: true });
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await expect(page.locator('[data-tool="tool:hubApprovals"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubEventStudio"]')).toHaveCount(0);
    await page.locator('[data-tool="tool:hubApprovals"]').click();
    const queue = page.locator("#hubApprovals");
    await expect(queue).toContainText("events you host");
    await expect(queue).toContainText("Aisling Byrne");
    await expect(queue).toContainText("Gasparilla security");
    await expect(queue).not.toContainText("@");
    await queue.locator("#hubHoursNote-h-host").fill("Saw them on the line.");
    await queue.locator("[data-hours-approve='h-host']").click();
    await expect(queue).toContainText("Approved Aisling Byrne. Note saved.");
    await expect(queue).not.toContainText("Saw them on the line.");
    await shot(page, "host-approve-hours.png");
    assertHealthy(expect, report, "host approve hours");
  });
});

test.describe("Event Studio volunteer cap", () => {
  test("cap hint says a full roster will not overbook", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
    await openHomeShortcut(page, "event-studio");
    await expect(page.locator("#hubEventVolunteerCap")).toBeVisible();
    await expect(page.locator("#hubEventVolunteerCapHint")).toContainText("logs those hours");
    await page.locator("#hubEventVolunteerCap").fill("2");
    await expect(page.locator("#hubEventVolunteerCapHint")).toContainText("stops after 2 members");
    await expect(page.locator("#hubEventVolunteerCapHint")).toContainText("will not overbook");
    await page.locator("#hubEventVolunteerCap").scrollIntoViewIfNeeded();
    await shot(page, "event-studio-volunteer-cap.png");
    assertHealthy(expect, report, "volunteer cap hint");
  });
});

test.describe("Volunteer signup hours", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/rest/v1/v_public_events**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([OPEN_EVENT, FULL_EVENT])
      })
    );
    await page.route("**/rest/v1/rpc/volunteer_slot_summary**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { event_id: OPEN_EVENT.id, volunteer_cap: 4, slots_used: 1 },
          { event_id: FULL_EVENT.id, volunteer_cap: 1, slots_used: 1 }
        ])
      })
    );
  });

  test("a full volunteer cap blocks another volunteer signup", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/event-signup.html");
    await page.locator("#event").selectOption(FULL_EVENT.id);
    await page.locator("#role").selectOption("volunteer");
    await expect(page.locator("#submitBtn")).toBeDisabled();
    await expect(page.locator("#submitBtn")).toHaveText(/Volunteer slots are full/);
    await expect(page.locator("#message")).toContainText("Volunteer slots are full for this event");
    assertHealthy(expect, report, "volunteer cap full");
  });

  test("volunteer signup says pending hours were logged", async ({ page }) => {
    const report = watchPage(page);
    await page.route("**/rest/v1/rpc/rsvp_to_event**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "registered",
          message: "You're signed up for Float work day.",
          volunteer_hours_pending: 3
        })
      })
    );
    await page.goto("/event-signup.html");
    await page.locator("#event").selectOption(OPEN_EVENT.id);
    await page.locator("#role").selectOption("volunteer");
    await expect(page.locator("#message")).toContainText("3 volunteer slots left");
    await expect(page.locator("#message")).toContainText("logs your hours");
    await page.locator("#firstName").fill("Nia");
    await page.locator("#lastName").fill("Byrne");
    await page.locator("#email").fill("nia.byrne@example.com");
    await page.locator("#plannedHours").fill("3");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#message")).toContainText("3 volunteer hours were logged.");
    assertHealthy(expect, report, "volunteer signup pending hours");
  });
});
