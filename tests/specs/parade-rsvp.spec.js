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
  await locator.screenshot({ path: path.join(SHOTS, name), animations: "disabled" });
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
  await expect(card.locator(".kos-pr-pay")).toHaveCount(0);
  await expect(page.locator("#pgForm")).not.toContainText("Pay guest fees on Zeffy");
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
    const card = document.querySelector("#hubParadeSeasonList [data-parade-card='parade-santa']");
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

const CUSTOM_PAY = "https://pay.example.test/santa-guests";
const FEE_COPY = "Guests are $25 per guest. Immediate family or under 12 are $10. Guest fees are paid on Zeffy.";

function hubSanta(extra) {
  return Object.assign({
    id: "parade-santa",
    name: "SantaFest",
    event_type: "parade",
    source: "krewe",
    start_time: "2026-12-05T18:00:00Z",
    end_time: "2026-12-05T22:00:00Z",
    location: "Downtown Tampa, FL",
    description: "Holiday parade.",
    status: "published",
    collect_guests: true,
    guest_payment_url: CUSTOM_PAY
  }, extra || {});
}

async function expectParadePay(card, href) {
  await expect(card.locator(".kos-pr-going")).toHaveText("Going");
  await expect(card.locator(".kos-pr-cant")).toHaveText("Can't go");
  await expect(card.locator(".kos-pr-count")).toBeVisible();
  await expect(card.locator(".kos-pr-pay")).toHaveText("Pay guest fees on Zeffy");
  await expect(card.locator(".kos-pr-pay")).toHaveAttribute("href", href);
  const widget = await card.locator(".kos-parade-rsvp").innerText();
  expect(widget).toContain(FEE_COPY);
  expect(widget).not.toMatch(/[—–]/);
  const text = await card.innerText();
  expect(text).not.toMatch(/@/);
}

test("member hub lists show the parade RSVP widget and the Zeffy pay button", async ({ page }) => {
  const report = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await unlockMemberHub(page);
  const future = "2027-02-13T18:00:00Z";
  await page.evaluate(({ santa, knight }) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Sample", last_name: "Member", email: "sample.member@example.com", member_id: "member-sample" },
      parades: [santa, knight],
      events: [santa, {
        id: "ikc-toy",
        name: "Fill the Float Toy Drive",
        event_type: "social",
        source: "ikc",
        start_time: santa.start_time,
        location: "Ruskin, FL",
        description: "Toy drive."
      }]
    });
  }, {
    santa: hubSanta(),
    knight: {
      id: "parade-knight",
      name: "Sant'Yago Knight Parade",
      event_type: "parade",
      source: "krewe",
      start_time: future,
      location: "Ybor City, FL",
      collect_guests: true
    }
  });

  const homeCard = page.locator("#hubHomeParadeList [data-parade-card='parade-santa']");
  await expect(page.locator("#hubHomeParadeList")).toContainText("Krewe parades");
  await expectParadePay(homeCard, CUSTOM_PAY);
  await expect(page.locator("#hubHomeParadeList [data-parade-card='parade-knight'] .kos-pr-pay")).toHaveAttribute("href", ZEFFY);
  await shot(page, homeCard, "hub-home-desk-santafest-pay.png");

  await page.locator('[data-hub-tab="events"]').click();
  const kreweCard = page.locator("#hubMemberEventList .hub-ev-card", { hasText: "SantaFest" });
  await expect(page.locator("#hubMemberEventList")).toContainText("Krewe of Shamrock Events");
  await expectParadePay(kreweCard, CUSTOM_PAY);
  const ikcCard = page.locator("#hubMemberEventList .hub-ev-card", { hasText: "Fill the Float Toy Drive" });
  await expect(ikcCard.locator(".kos-pr-going")).toHaveText("Going");
  await expect(ikcCard.locator(".kos-pr-pay")).toHaveCount(0);
  await expect(ikcCard).not.toContainText("$25 per guest");
  await shot(page, kreweCard, "hub-krewe-events-santafest-pay.png");

  const paradeCard = page.locator("#hubParadeSeasonList [data-parade-card='parade-santa']");
  await expectParadePay(paradeCard, CUSTOM_PAY);
  await shot(page, paradeCard, "hub-parades-santafest-pay.png");

  await page.locator('[data-hub-tab="parade"]').click();
  const deskCard = page.locator("#hubParadeSeasonDeskList [data-parade-card='parade-santa']");
  await expectParadePay(deskCard, CUSTOM_PAY);
  await shot(page, deskCard, "hub-desk-parades-santafest-pay.png");

  await page.locator('[data-hub-tab="krewe"]').click();
  const krewe = page.locator("[data-hub-panel='krewe']");
  await expect(krewe.locator(".kos-parade-rsvp, .kos-pr-going, .kos-pr-cant, .kos-pr-pay, .kos-pr-count")).toHaveCount(0);
  await expect(krewe.locator(".hub-krewe-parade-title")).toHaveCount(0);
  await expect(krewe.locator("[data-hub-open-parade-rsvp]")).toHaveCount(1);
  await expect(krewe.locator("[data-hub-open-parade-rsvp]")).toHaveText("Parade RSVPs are in Parades");
  await expect(krewe).not.toContainText("Guests you're bringing");
  await expect(krewe).not.toContainText("Pay guest fees on Zeffy");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-hub-tab="hub"]').click();
  const nextCard = page.locator("#appNextUp");
  await expect(nextCard).toContainText("SantaFest");
  await expectParadePay(nextCard, CUSTOM_PAY);
  await shot(page, nextCard, "hub-home-phone-santafest-pay.png");
  const phoneFit = await page.evaluate(() => {
    const card = document.querySelector("#appNextUp");
    const r = card.getBoundingClientRect();
    return { right: r.right, width: document.documentElement.clientWidth, extra: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(phoneFit.extra).toBeLessThanOrEqual(1);
  expect(phoneFit.right).toBeLessThanOrEqual(phoneFit.width + 1);

  await page.route("**/*supabase.co/**", (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const url = route.request().url();
    const body = /\/rest\/v1\/events(\?|$)/.test(url)
      ? JSON.stringify([hubSanta({ id: SANTA_ID })])
      : "[]";
    return route.fulfill({ status: 200, contentType: "application/json", headers, body });
  });
  await page.evaluate(() => {
    window.gameTab("events");
    window.openGame();
  });
  const cupCard = page.locator("#gameModal .cup-event", { hasText: "SantaFest" });
  await expectParadePay(cupCard, CUSTOM_PAY);
  await shot(page, cupCard, "hub-craic-events-santafest-pay.png");

  assertHealthy(expect, report, "hub parade pay button on every list");
});

test("a krewe parade with guest count off still offers Going and Can't go", async ({ page }) => {
  const report = watchPage(page);
  const pirates = {
    id: "parade-pirates",
    name: "Gasparilla Parade of Pirates",
    event_type: "parade",
    source: "krewe",
    start_time: "2027-01-30T19:00:00Z",
    end_time: "2027-01-30T23:00:00Z",
    location: "Bayshore Boulevard, Tampa",
    status: "published",
    collect_guests: false
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  await unlockMemberHub(page);
  await page.evaluate((row) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Sample", last_name: "Member", email: "sample.member@example.com", member_id: "member-sample" },
      parades: [row],
      events: [row]
    });
  }, pirates);

  async function expectMarchRsvp(card) {
    await expect(card).toContainText("Gasparilla Parade of Pirates");
    await expect(card.locator(".kos-pr-going")).toHaveText("Going");
    await expect(card.locator(".kos-pr-cant")).toHaveText("Can't go");
    await expect(card.locator(".kos-pr-pay")).toHaveCount(0);
    await expect(card.locator(".kos-pr-count")).toHaveCount(0);
    await expect(card).not.toContainText("$25 per guest");
    expect(await card.innerText()).not.toMatch(/[—–]/);
  }

  await expectMarchRsvp(page.locator("#hubHomeParadeList [data-parade-card='parade-pirates']"));
  await page.locator('[data-hub-tab="krewe"]').click();
  await expect(page.locator("#hubKreweParadeList .kos-pr-going, #hubKreweParadeList .kos-pr-cant, #hubKreweParadeList .kos-pr-pay")).toHaveCount(0);
  await expect(page.locator("#hubKreweParadeList")).not.toContainText("$25 per guest");
  await page.locator('[data-hub-tab="parade"]').click();
  await expectMarchRsvp(page.locator("#hubParadeSeasonDeskList [data-parade-card='parade-pirates']"));
  await expect(page.locator("#hubParadeSeasonDeskList [data-parade-card='parade-pirates'] .kos-parade-rsvp")).toHaveCount(1);
  await page.locator('[data-hub-tab="events"]').click();
  await expectMarchRsvp(page.locator("#hubMemberEventList .hub-ev-card", { hasText: "Gasparilla Parade of Pirates" }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-hub-tab="hub"]').click();
  await expectMarchRsvp(page.locator("#appNextUp"));
  assertHealthy(expect, report, "parade without guest count");
});

test("public event signup does not show the member Zeffy guest fee button", async ({ page }) => {
  const report = watchPage(page);
  await stubParades(page, [santaEvent()]);
  await page.goto("/event-signup.html");
  await expect(page.locator(".kos-pr-pay")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Pay guest fees on Zeffy");
  await expect(page.locator("body")).not.toContainText("$25 per guest");
  assertHealthy(expect, report, "public event signup stays quiet");
});

test("My Krewe has no parade RSVP controls and the Parade section has them once", async ({ page }) => {
  const report = watchPage(page);
  const previews = process.env.PARADE_RSVP_PREVIEWS
    ? path.resolve(process.env.PARADE_RSVP_PREVIEWS)
    : "";
  const santa = hubSanta({ guests_count: 2 });
  const childrens = {
    id: "parade-childrens",
    name: "Children's Gasparilla",
    event_type: "parade",
    source: "krewe",
    start_time: "2027-01-23T18:00:00Z",
    end_time: "2027-01-23T22:00:00Z",
    location: "Downtown Tampa, FL",
    description: "Children's parade.",
    status: "published",
    collect_guests: true,
    guests_count: 0
  };

  async function preview(locator, name) {
    if (!previews) return;
    fs.mkdirSync(previews, { recursive: true });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.evaluate(() => {
      ["#krewePlayer", ".krewe-music", "#kosTune"].forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => { el.style.display = "none"; });
      });
    });
    await locator.screenshot({ path: path.join(previews, name), animations: "disabled" });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await unlockMemberHub(page);
  await page.evaluate(({ profile, parades }) => {
    window.__kosChairRequestFixture = [];
    window.__kosHubSetFeed({
      profile: profile,
      parades: parades,
      events: parades
    });
  }, {
    profile: {
      first_name: "Sample",
      last_name: "Member",
      email: "sample.member@example.com",
      member_id: "member-sample",
      committee_interests: []
    },
    parades: [santa, childrens]
  });

  await page.locator('[data-hub-tab="krewe"]').click();
  const kreweCard = page.locator("#hubKrewe > .app-card").first();
  const krewe = page.locator("[data-hub-panel='krewe']");
  await expect(kreweCard).toContainText("My Krewe");
  await expect(kreweCard).toContainText("Profile and member directory");
  await expect(kreweCard.locator(".kos-parade-rsvp, .kos-pr-going, .kos-pr-cant, .kos-pr-pay, .kos-pr-count")).toHaveCount(0);
  await expect(kreweCard.locator("h3", { hasText: "Parade RSVPs" })).toHaveCount(0);
  await expect(krewe).not.toContainText("Guests you're bringing");
  await expect(krewe).not.toContainText("Pay guest fees on Zeffy");
  await expect(krewe).not.toContainText("$25 per guest");
  const jump = krewe.locator("[data-hub-open-parade-rsvp]");
  await expect(jump).toHaveCount(1);
  await expect(jump).toHaveText("Parade RSVPs are in Parades");
  expect(await kreweCard.innerText()).not.toMatch(/[—–]/);
  await expect(kreweCard).toContainText("sample.member@example.com");
  await preview(kreweCard, "01-my-krewe-without-the-block.png");

  await jump.click();
  await expect(page.locator("[data-hub-panel='parade']")).toHaveClass(/hub-on/);
  const section = page.locator("#hubParadeSeasonCard");
  const list = page.locator("#hubParadeSeasonDeskList");
  await expect(section).toBeVisible();
  await expect(list.locator(".kos-parade-rsvp")).toHaveCount(2);
  const santaCard = list.locator("[data-parade-card='parade-santa']");
  const childCard = list.locator("[data-parade-card='parade-childrens']");
  await expect(santaCard.locator(".kos-parade-rsvp")).toHaveCount(1);
  await expect(childCard.locator(".kos-parade-rsvp")).toHaveCount(1);
  await expectParadePay(santaCard, CUSTOM_PAY);
  await expect(santaCard.locator(".kos-pr-count")).toHaveValue("2");
  await expectParadePay(childCard, ZEFFY);
  await expect(list).toContainText("Children's Gasparilla");
  await expect(list).toContainText("Jan 23, 2027");
  await expect(list).toContainText("Dec 5, 2026");
  expect(await section.innerText()).not.toMatch(/[—–]/);
  await expect(section).not.toContainText("@");
  await preview(section, "02-hub-parades-rsvp.png");

  await page.locator('[data-hub-tab="krewe"]').click();
  await expect(page.locator("[data-hub-panel='krewe']")).toHaveClass(/hub-on/);
  await expect(page.locator("[data-hub-panel='parade']")).not.toHaveClass(/hub-on/);
  await expect(page.locator("#hubKreweParadeList [data-hub-open-parade-rsvp]")).toBeVisible();
  await page.locator('[data-hub-tab="parade"]').click();
  await expect(page.locator("[data-hub-panel='parade']")).toHaveClass(/hub-on/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveClass(/hub-app/);
  await expect(santaCard.locator(".kos-pr-pay")).toBeVisible();
  await expect(list.locator(".kos-parade-rsvp")).toHaveCount(2);
  const fit = await page.evaluate(() => {
    const card = document.querySelector("#hubParadeSeasonCard");
    const r = card.getBoundingClientRect();
    return {
      right: r.right,
      width: document.documentElement.clientWidth,
      extra: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(fit.extra).toBeLessThanOrEqual(1);
  expect(fit.right).toBeLessThanOrEqual(fit.width + 1);
  if (previews) {
    await page.evaluate(() => {
      document.querySelectorAll(".app-top, .hub-tabs").forEach((el) => { el.style.display = "none"; });
      ["#memberContent", "#hubRoot", "[data-hub-panel='parade']"].forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.overflow = "visible";
          el.style.height = "auto";
          el.style.maxHeight = "none";
        });
      });
      document.body.style.overflow = "visible";
      document.body.style.height = "auto";
    });
  }
  await preview(section, "03-hub-parades-mobile.png");
  assertHealthy(expect, report, "parade rsvp only on the parade section");
});
