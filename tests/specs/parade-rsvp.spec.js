const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");
const fs = require("fs");
const path = require("path");

const SHOTS = process.env.PARADE_RSVP_SHOTS || "/opt/cursor/artifacts";
const SANTA_ID = "6918ff19-f232-4ddf-83d7-82f0a141eb95";
const ZEFFY = "https://www.zeffy.com/en-US/ticketing/kos-parade-guest-fee-2026--2027";

function santaEvent() {
  return {
    id: SANTA_ID,
    name: "SantaFest",
    description: "Tampa's downtown holiday kickoff parade. The parade steps off at 1:00 PM.",
    event_type: "parade",
    start_time: "2026-12-05T18:00:00Z",
    end_time: "2026-12-05T22:00:00Z",
    location: "Downtown Tampa, FL",
    source: "krewe",
    status: "published",
    is_public: true,
    members_only: false,
    external_url: "https://www.friendsoftamparec.org/santa-fest--tree-lighting.html",
    flyer_url: "assets/flyers/santafest-2026.jpg",
    collect_guests: true
  };
}

async function stubParades(page, rows) {
  await page.route("**/rest/v1/v_public_events**", (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, OPTIONS"
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify(rows)
    });
  });
}

async function shot(page, locator, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => {
    ["#krewePlayer", ".krewe-music", "#kosTune"].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => { el.style.display = "none"; });
    });
  });
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: path.join(SHOTS, name) });
}

test("public parade card offers a quiet guest RSVP and keeps contact details off the page", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubParades(page, [santaEvent()]);
  await page.goto("/parades.html");
  const card = page.locator("#parade-season .parade-card", {
    has: page.getByRole("heading", { level: 3, name: "SantaFest" })
  });
  const link = card.locator("a.kos-quiet-rsvp");
  await expect(link).toHaveText("RSVP");
  await expect(link).toHaveAttribute("href", "/event-signup.html?event=" + SANTA_ID + "#rsvpForm");
  await expect(card.locator(".kos-pr-going")).toHaveCount(0);
  await expect(card).not.toContainText("Sign in to RSVP");
  await expect(card).not.toContainText("Share in our Krewe group");
  await expect(card).not.toContainText("maeve@example.com");
  await expect(card).not.toContainText("$25");
  const text = await card.innerText();
  expect(text).not.toMatch(/[—–]/);
  await shot(page, card, "parade-rsvp-public-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, card, "parade-rsvp-public-phone.png");
  assertHealthy(expect, report, "public parade guest rsvp");
});

test("hub parade cards and event cards offer Going and Can't go", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await unlockMemberHub(page);
  const future = "2026-12-05T18:00:00Z";
  const started = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await page.evaluate((rows) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com", member_id: "member-maeve" },
      parades: rows.parades,
      events: rows.events
    });
  }, {
    parades: [
      { id: "parade-santa", name: "SantaFest", event_type: "parade", start_time: future, location: "Downtown Tampa, FL", parade_rsvpd: false },
      { id: "parade-old", name: "Started Parade", event_type: "parade", start_time: started, location: "Ybor City", parade_rsvpd: false }
    ],
    events: [
      { id: "parade-santa", name: "SantaFest", event_type: "parade", source: "krewe", start_time: future, location: "Downtown Tampa, FL", description: "Holiday parade." },
      { id: "ikc-toy", name: "Fill the Float Toy Drive", event_type: "social", source: "ikc", start_time: future, location: "Ruskin, FL", description: "Toy drive.", ticket_payment_url: "https://example.test/tickets", ticket_price_cents: 0 }
    ]
  });
  await page.locator('[data-hub-tab="events"]').click();
  const paradeCard = page.locator("#hubParadeSeasonList [data-parade-card='parade-santa']");
  const eventCard = page.locator("#hubMemberEventList .hub-ev-card", { hasText: "SantaFest" });
  const ikcCard = page.locator("#hubMemberEventList .hub-ev-card", { hasText: "Fill the Float Toy Drive" });
  await expect(page.locator("#hubMemberEventList")).toContainText("Krewe of Shamrock Events");
  await expect(page.locator("#hubMemberEventList")).toContainText("IKC Events");
  await expect(ikcCard.locator(".kos-pr-going")).toHaveText("Going");
  await expect(ikcCard.locator(".kos-pr-cant")).toHaveText("Can't go");
  await expect(paradeCard.locator(".kos-pr-going")).toHaveText("Going");
  await expect(paradeCard.locator(".kos-pr-cant")).toHaveText("Can't go");
  await expect(paradeCard).toContainText("$25 per guest");
  await expect(paradeCard.locator(".kos-pr-pay")).toHaveAttribute("href", ZEFFY);
  await expect(eventCard.locator(".kos-pr-going")).toHaveText("Going");
  await expect(page.locator("#hubParadeSeasonList [data-parade-card='parade-old']")).toContainText("Registration is closed. This parade has already started.");
  await expect(paradeCard).not.toContainText("maeve@example.com");
  const text = await paradeCard.innerText();
  expect(text).not.toMatch(/[—–]/);
  await shot(page, paradeCard, "parade-rsvp-hub-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, paradeCard, "parade-rsvp-hub-phone.png");
  const fit = await page.evaluate(() => {
    const card = document.querySelector("[data-parade-card='parade-santa']");
    const r = card.getBoundingClientRect();
    return { right: r.right, width: document.documentElement.clientWidth, extra: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(fit.extra).toBeLessThanOrEqual(1);
  expect(fit.right).toBeLessThanOrEqual(fit.width + 1);
  assertHealthy(expect, report, "hub parade rsvp");
});

test("officer who's coming lists a parade RSVP without putting contact details in the shot", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const start = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
  await unlockMemberHub(page, {
    role: { officer: true, canManageEvents: true, toolKeys: ["event_studio"] }
  });
  await page.locator('[data-hub-tab="officer"]').click();
  await page.evaluate((startTime) => {
    window.__kosHubSetWhosComing({
      events: [{ id: "parade-santa", name: "SantaFest", start_time: startTime, status: "published" }],
      rosters: {
        "parade-santa": {
          rows: [{
            name: "Maeve Kelly",
            audience: "Member",
            source: "Member RSVP",
            status: "registered",
            guests: 2,
            signed_up_at: "2026-11-01T15:00:00Z",
            phone: "(813) 555-0199",
            email: "maeve@example.com",
            counts: true
          }]
        }
      }
    });
  }, start);
  await page.locator('[data-tool="tool:hubWhosComing"]').click();
  const card = page.locator("#hubWhosComing");
  await expect(card).toContainText("SantaFest");
  await expect(card).toContainText("Maeve Kelly");
  await expect(card).toContainText("Member RSVP");
  await expect(card).toContainText("Guests: 2");
  await expect(card.locator("#kosWcMembers")).toHaveText("3");
  await expect(card.locator('a[href="mailto:maeve@example.com"]')).toHaveText("maeve@example.com");
  await page.evaluate(() => {
    document.querySelectorAll(".kos-wc-links").forEach((el) => { el.style.display = "none"; });
  });
  const visibleList = await card.locator("#kosWcList").evaluate((el) => el.innerText);
  expect(visibleList).not.toContain("maeve@example.com");
  expect(visibleList).not.toContain("555-0199");
  await shot(page, card.locator("#kosWc"), "parade-rsvp-whos-coming.png");
  assertHealthy(expect, report, "parade who's coming");
});
