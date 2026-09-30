// Parade season: Event Studio parade + meeting link, Hub status, public cards, .ics.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

async function openEventStudio(page) {
  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.waitForSelector('[data-hub-goto="event-studio"]');
  await page.locator('[data-hub-goto="event-studio"]').click();
  await expect(page.locator("#hubEventStudio")).toBeVisible();
  await expect(page.locator("#hubEventForm")).toBeVisible();
}

test.describe("Event Studio parade season", () => {
  test("Parade type reveals meeting link and create-pair fields", async ({ page }) => {
    const report = watchPage(page);
    await openEventStudio(page);

    await expect(page.locator("#hubEventParadeBox")).toBeHidden();
    await page.locator("#hubEventType").selectOption("parade");
    await expect(page.locator("#hubEventParadeBox")).toBeVisible();
    await expect(page.locator("#hubEventLinkedMeeting")).toBeVisible();
    await expect(page.locator("#hubEventStudio")).toContainText("Mandatory meeting");
    await expect(page.locator("#hubEventStudio")).toContainText("Create a new mandatory meeting");
    await expect(page.locator("#hubEventCreateMeetingFields")).toBeHidden();
    await expect(page.locator("#hubEventMembersOnly")).toBeChecked();

    await page.locator("#hubEventCreateMeeting").check();
    await expect(page.locator("#hubEventCreateMeetingFields")).toBeVisible();
    await expect(page.locator("#hubEventCreateMeetingName")).toBeVisible();
    await expect(page.locator("#hubEventCreateMeetingStart")).toBeVisible();
    await expect(page.locator("#hubEventCreateMeetingMandatory")).toBeChecked();
    await expect(page.locator("#hubEventRoleNotes")).toBeVisible();
    await expect(page.locator("#hubEventStudio")).toContainText("Role notes");
    await expect(page.locator("#hubEventStudio")).toContainText("Muster / step-off start");
    await expect(page.locator("#hubEventStudio")).toContainText("parades.html");
    await expect(page.locator("#hubEventStudio")).toContainText("no public march RSVP");
    assertHealthy(expect, report, "event studio parade fields");
  });

  test("parade meeting fields remain usable on a phone-sized viewport", async ({ page }) => {
    const report = watchPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openEventStudio(page);
    await page.locator("#hubEventType").selectOption("parade");
    await expect(page.locator("#hubEventLinkedMeeting")).toBeVisible();
    await page.locator("#hubEventCreateMeeting").check();
    await expect(page.locator("#hubEventCreateMeetingName")).toBeVisible();
    assertHealthy(expect, report, "event studio parade fields mobile");
  });
});

test("Member Hub Events tab shows parade season status", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="events"]').click();
  await expect(page.locator("[data-hub-panel='events']")).toHaveClass(/hub-on/);
  await expect(page.locator("#hubParadeSeasonList")).toBeVisible();
  await expect(page.locator("#hubParadeSeasonEvents")).toContainText("Parade season");
  await page.waitForFunction(() => typeof window.__kosRenderParadeSeason === "function");
  await page.evaluate(() => {
    window.__kosParadeSeasonLocked = true;
    window.__kosRenderParadeSeason([{
      id: "parade-1",
      name: "Gasparilla Parade of Pirates",
      start_time: "2027-01-30T19:00:00.000Z",
      location: "Bayshore Boulevard, Tampa",
      members_only: true,
      parade_rsvpd: false,
      parade_checked_in: false,
      eligible: false,
      soft_gate_checkin: true,
      notes: "March the route; hospitality at the float.",
      meeting: {
        id: "meet-1",
        name: "Gasparilla briefing",
        start_time: "2027-01-28T23:00:00.000Z",
        location: "Members home, Tampa",
        rsvpd: false,
        checked_in: false
      }
    }]);
  });

  await expect(page.locator("#hubParadeSeasonList")).toContainText("Meeting not RSVP’d");
  await expect(page.locator("#hubParadeSeasonList")).toContainText("Not yet eligible");
  await expect(page.locator("#hubParadeSeasonList")).toContainText("Door Check-In");
  await expect(page.locator("#hubParadeSeasonList")).toContainText("Add parade to calendar");
  await expect(page.locator("#hubParadeSeasonList")).toContainText("Role notes");
  await expect(page.locator("#hubParadeSeasonList")).toContainText("hospitality");
  await expect(page.locator("#hubParadeSeasonList")).not.toContainText("123 Secret Staging");
  assertHealthy(expect, report, "hub parade season status");
});

test("Member desk includes the parade season card", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await expect(page.locator("#hubParadeSeasonCard")).toBeVisible();
  await expect(page.locator("#hubParadeSeasonDeskList")).toBeVisible();
  await expect(page.locator("#deskSeason")).toContainText("Parade season");
  assertHealthy(expect, report, "member desk parade season");
});

test("parades.html is a recruiting page with Join CTAs and no public march RSVP", async ({ page, request }) => {
  const report = watchPage(page);
  const html = await (await request.get("/parades.html")).text();
  expect(html, "Gasparilla dual-card spotlight should be gone").not.toContain('id="featured-parade"');
  expect(html).not.toContain("gas-spot");
  expect(html).not.toContain("gas-card");
  expect(html.indexOf('id="parade-season"')).toBeLessThan(html.indexOf('id="why-march"'));
  expect(html.indexOf('id="parade-season"')).toBeLessThan(html.indexOf('id="ikc-season"'));
  expect(html).toMatch(/Children'?s Gasparilla/);
  expect(html).toContain("Parade of Pirates");
  expect(html).toContain("St. Patrick's Day Parade");
  expect(html).not.toContain("Rough Riders");
  expect(html).toContain("March 2027 · date to be announced");
  expect(html).toContain("<b>Where:</b> Tampa</p>");
  expect(html).toContain("the parade where the Krewe of Shamrock was born in 1999");
  for (const file of [
    "santafest",
    "childrens-gasparilla",
    "gasparilla-pirates",
    "santyago-knight",
    "tampa-pride",
    "st-patricks"
  ]) {
    expect(html, "static march cards must include " + file).toContain("assets/img/parades/" + file);
  }

  await page.goto("/parades.html");
  const firstSection = page.locator("header.page-head + section");
  await expect(firstSection).toHaveAttribute("id", "parade-season");
  await expect(page.locator("#parade-season")).toBeVisible();
  const stPatricks = page.locator("#parade-season .parade-card", {
    has: page.getByRole("heading", { level: 3, name: "St. Patrick's Day Parade" })
  });
  await expect(stPatricks).toBeVisible();
  await expect(stPatricks).toContainText("March 2027");
  await expect(stPatricks).toContainText("date to be announced");
  await expect(stPatricks).toContainText("Tampa");
  await expect(stPatricks).toContainText("born in 1999");
  await expect(stPatricks).not.toContainText(/March \d{1,2}, 2027/);
  await expect(page.locator("#parade-season")).not.toContainText("Rough Riders");
  await expect(page.locator("header.page-head")).toContainText("Gasparilla");
  await expect(page.locator("#parade-season")).toContainText("Children's Gasparilla");
  await expect(page.locator("#parade-season")).toContainText("Parade of Pirates");
  const firstArt = page.locator("#parade-season .parade-media img").first();
  await expect(firstArt).toBeVisible();
  await expect.poll(async () => firstArt.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.locator("#featured-parade")).toHaveCount(0);
  await expect(page.locator("#why-march")).toBeVisible();
  await expect(page.locator("#why-march")).toContainText("Why March With Shamrock");
  await expect(page.locator("#why-march")).toContainText("join the krewe");
  await expect(page.locator("#why-march")).toContainText("A season of marches");
  await expect(page.locator("#why-march")).toContainText("Join");
  await expect(page.locator("#why-march")).toContainText("Member Login");
  await expect(page.locator("#why-march")).not.toContainText(/Gasparilla, twice/i);
  await expect(page.locator("#why-march")).not.toContainText(/RSVP|staging|Member Hub|\bHub\b|muster|mandatory meeting|Door Check-In/i);
  await expect(page.locator("body")).toContainText("See the season");
  await expect(page.locator("#ikc-season")).toBeVisible();
  await expect(page.locator("#ikcSeasonTable")).toBeVisible();
  await expect(page.locator("#ikcSeasonTable tr.ours")).toHaveCount(5);
  const cardsBox = await page.locator("#parade-season").boundingBox();
  const tableBox = await page.locator("#ikcSeasonTable").boundingBox();
  expect(cardsBox && tableBox, "march cards should sit above the IKC table").toBeTruthy();
  expect(tableBox.y).toBeGreaterThan(cardsBox.y);
  await expect(page.locator("body")).toContainText("Safety & Security");
  await expect(page.locator("body")).toContainText("Castle of Shenanigans");
  const cardActions = page.locator("#parade-season .parade-actions");
  await expect(cardActions.first()).toContainText("Join");
  await expect(cardActions.first()).toContainText("Member Login");
  await expect(cardActions.filter({ hasText: /Sign me up|Buy Tickets|march RSVP/i })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("member_address");
  await expect(page.locator("body")).not.toContainText(/staging on (4th|5th|Howard)/i);
  assertHealthy(expect, report, "public parades marketing");
});

test("parades.html march cards put the next upcoming parade first", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/parades.html");
  await page.waitForFunction(() => typeof window.__kosOrderMarchGrid === "function");

  const afterSantaFest = Date.parse("2027-01-10T12:00:00-05:00");
  await page.evaluate((now) => window.__kosOrderMarchGrid(now), afterSantaFest);
  await expect(page.locator("#parade-season .parade-card h3").first()).toHaveText("Children's Gasparilla");
  await expect(page.locator("#parade-season .parade-card h3").last()).toHaveText("SantaFest");

  const midJanuary = Date.parse("2027-01-25T12:00:00-05:00");
  await page.evaluate((now) => window.__kosOrderMarchGrid(now), midJanuary);
  await expect(page.locator("#parade-season .parade-card h3").first()).toHaveText("Gasparilla Parade of Pirates");

  const titles = await page.locator("#parade-season .parade-card h3").allTextContents();
  const starts = await page.locator("#parade-season .parade-card").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-start"))
  );
  const now = midJanuary;
  const items = titles.map((title, i) => {
    const ms = starts[i] ? Date.parse(starts[i]) : null;
    return { title, ms: Number.isNaN(ms) ? null : ms };
  });
  const expected = [...items].sort((a, b) => {
    const rank = (ms) => (ms == null ? 1 : ms >= now ? 0 : 2);
    const ra = rank(a.ms);
    const rb = rank(b.ms);
    if (ra !== rb) return ra - rb;
    if (a.ms != null && b.ms != null) return a.ms - b.ms;
    return 0;
  });
  expect(titles).toEqual(expected.map((item) => item.title));
  assertHealthy(expect, report, "parade cards upcoming-first");
});

test("calendar helper writes a teaser-only .ics", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");
  await page.waitForFunction(() => window.kosCalendar && typeof window.kosCalendar.buildIcs === "function");
  const ics = await page.evaluate(() => window.kosCalendar.buildIcs({
    id: "evt-1",
    name: "Gasparilla briefing",
    start_time: "2027-01-28T23:00:00.000Z",
    end_time: "2027-01-29T00:00:00.000Z",
    location: "Members home, Tampa",
    member_address: "123 Secret Staging Lane",
    description: "Briefing for the pirate parade."
  }));
  expect(ics).toMatch(/BEGIN:VCALENDAR/);
  expect(ics).toMatch(/BEGIN:VTIMEZONE/);
  expect(ics).toMatch(/TZID:America\/New_York/);
  expect(ics).toMatch(/DTSTART;TZID=America\/New_York:20270128T180000/);
  expect(ics).toMatch(/SUMMARY:Gasparilla briefing/);
  expect(ics).toMatch(/LOCATION:Members home\\, Tampa/);
  expect(ics).toMatch(/Member Hub/);
  expect(ics).not.toMatch(/123 Secret Staging/);
  expect(ics).not.toMatch(/member_address/);
  assertHealthy(expect, report, "ics teaser only");
});

test("public signup action matches published events, not drafts, past dates, or parades", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");
  await page.waitForFunction(() => window.kosCalendar && typeof window.kosCalendar.publicSignupAction === "function");
  const action = await page.evaluate(() => {
    const now = new Date("2026-09-30T22:00:00Z");
    const fn = window.kosCalendar.publicSignupAction;
    return {
      past: fn({ name: "Shamrock Book Club Night", source: "krewe", status: "published", event_type: "social", start_time: "2026-09-17T23:00:00Z", ticket_payment_url: "https://www.zeffy.com/en-US/ticketing/shamrock-book-club-night" }, now),
      draft: fn({ name: "Test", source: "krewe", status: "draft", event_type: "social", start_time: "2027-01-01T12:00:00Z", ticket_price_cents: 100 }, now),
      parade: fn({ name: "SantaFest", source: "krewe", status: "published", event_type: "parade", members_only: true, start_time: "2026-12-05T22:00:00Z" }, now),
      tickets: fn({ name: "Tartan Ball", source: "krewe", status: "published", event_type: "fundraiser", start_time: "2026-10-24T22:00:00Z", ticket_payment_url: "https://www.zeffy.com/ball" }, now),
      closed: fn({ name: "Mini Golf and Lunch", source: "krewe", status: "published", event_type: "social", start_time: "2026-10-01T14:00:00Z", registration_closes_at: "2026-09-18T03:59:00Z" }, now),
      members: fn({ name: "Tartan Ball Basket-Making Happy Hour", source: "krewe", status: "published", event_type: "social", members_only: true, start_time: "2026-10-03T19:00:00Z" }, now),
      rsvp: fn({ name: "Social", source: "krewe", status: "published", event_type: "social", start_time: "2026-10-03T19:00:00Z" }, now)
    };
  });
  expect(action.past).toBe("hide");
  expect(action.draft).toBe("hide");
  expect(action.parade).toBe("parade-members");
  expect(action.tickets).toBe("tickets");
  expect(action.closed).toBe("closed");
  expect(action.members).toBe("members");
  expect(action.rsvp).toBe("rsvp");
  assertHealthy(expect, report, "public signup action");
});

test("parade season shows Already RSVP'd instead of a fresh RSVP button", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="events"]').click();
  await page.waitForFunction(() => typeof window.__kosRenderParadeSeason === "function");
  await page.evaluate(() => {
    window.__kosParadeSeasonLocked = true;
    window.__kosRenderParadeSeason([{
      id: "parade-1",
      name: "Sant'Yago Knight Parade",
      start_time: "2027-02-13T23:00:00.000Z",
      location: "Ybor City, Tampa, FL",
      members_only: true,
      parade_rsvpd: true,
      parade_checked_in: false,
      eligible: true,
      soft_gate_checkin: false,
      meeting: null
    }, {
      id: "parade-2",
      name: "SantaFest",
      start_time: "2026-12-05T22:00:00.000Z",
      location: "Downtown Tampa, FL",
      members_only: true,
      parade_rsvpd: false,
      parade_rsvp_status: "registered",
      parade_checked_in: false,
      eligible: true,
      soft_gate_checkin: false,
      meeting: null
    }]);
  });
  const santyago = page.locator("#hubParadeSeasonList [data-parade-card='parade-1']");
  const santafest = page.locator("#hubParadeSeasonList [data-parade-card='parade-2']");
  await expect(santyago).toContainText("Already RSVP'd");
  await expect(santyago).toContainText("Cancel RSVP");
  await expect(santyago).toContainText("Parade RSVP’d");
  await expect(santafest).toContainText("Already RSVP'd");
  await expect(santafest).toContainText("Parade RSVP’d");
  await expect(santafest.locator("[data-hub-parade-rsvp]")).toHaveCount(0);
  await expect(page.locator("#hubParadeSeasonList [data-hub-parade-rsvp]")).toHaveCount(0);
  await expect(santyago.locator(".kos-cal-btn")).toHaveText("Add parade to calendar");
  await expect(santafest.locator(".kos-cal-btn")).toHaveText("Add parade to calendar");
  assertHealthy(expect, report, "parade already rsvpd");
});
