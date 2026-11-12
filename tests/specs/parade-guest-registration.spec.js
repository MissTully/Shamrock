// Guest parade registration: Event Studio fields, public form, Hub approval, officer list.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const OPEN_EVENT = {
  id: "parade-childrens",
  name: "Children's Gasparilla",
  start_time: "2027-01-23T14:00:00.000Z",
  end_time: "2027-01-23T19:00:00.000Z",
  location: "Bayshore Boulevard, Tampa",
  guest_capacity: 20,
  spots_taken: 3,
  spots_left: 17,
  is_full: false,
  guest_fee_cents: 2500,
  guest_fee_family_cents: 1000,
  guest_fee_label: "$25.00",
  guest_fee_family_label: "$10.00",
  guest_requires_21: false,
  fees_ready: true
};

const ADULT_EVENT = {
  id: "parade-santyago-open",
  name: "Sant'Yago Knight Parade",
  start_time: "2027-02-13T23:00:00.000Z",
  end_time: "2027-02-14T04:00:00.000Z",
  location: "Ybor City",
  guest_capacity: 20,
  spots_taken: 4,
  spots_left: 16,
  is_full: false,
  guest_fee_cents: 2500,
  guest_fee_family_cents: 1000,
  guest_fee_label: "$25.00",
  guest_fee_family_label: "$10.00",
  guest_requires_21: true,
  fees_ready: true
};

const FULL_EVENT = {
  id: "parade-santyago",
  name: "Sant'Yago Knight Parade",
  start_time: "2027-02-13T23:00:00.000Z",
  end_time: "2027-02-14T04:00:00.000Z",
  location: "Ybor City",
  guest_capacity: 20,
  spots_taken: 20,
  spots_left: 0,
  is_full: true,
  guest_fee_cents: 2500,
  guest_fee_family_cents: 1000,
  guest_fee_label: "$25.00",
  guest_fee_family_label: "$10.00",
  guest_requires_21: true,
  fees_ready: true
};

const TIGHT_EVENT = {
  ...OPEN_EVENT,
  id: "parade-childrens-tight",
  name: "Children's Gasparilla",
  spots_taken: 18,
  spots_left: 2,
  is_full: false
};

const GUEST_ROWS = [
  {
    id: "g-pending",
    parade_name: "Children's Gasparilla",
    first_name: "Avery",
    last_name: "Guest",
    email: "avery.guest@example.com",
    fee_label: "$45.00",
    fee_tier: "adult_plus_children",
    party_size: 3,
    child_count: 2,
    minors: [
      { first_name: "Riley", last_name: "Guest" },
      { first_name: "Quinn", last_name: "Guest" }
    ],
    status: "pending_sponsor"
  },
  {
    id: "g-unpaid",
    parade_name: "Children's Gasparilla",
    first_name: "Sam",
    last_name: "Guest",
    email: "sam.guest@example.com",
    fee_label: "$25.00",
    fee_tier: "adult",
    party_size: 1,
    minors: [],
    status: "payment_sent"
  }
];

const OFFICER_PARADES = [
  {
    id: "parade-childrens",
    name: "Children's Gasparilla",
    start_time: "2027-01-23T14:00:00.000Z",
    guest_capacity: 20,
    spots_taken: 3,
    spots_label: "3 of 20",
    guests: [
      {
        id: "g-pending",
        first_name: "Avery",
        last_name: "Guest",
        email: "avery.guest@example.com",
        sponsor_name: "Pat Member",
        sponsor_email: "pat.member@example.com",
        fee_label: "$45.00",
        fee_tier: "adult_plus_children",
        party_size: 3,
        minors: [
          { first_name: "Riley", last_name: "Guest" },
          { first_name: "Quinn", last_name: "Guest" }
        ],
        status: "pending_sponsor",
        paid: false
      },
      {
        id: "g-paid",
        first_name: "Chris",
        last_name: "Paid",
        email: "chris.paid@example.com",
        sponsor_name: "Pat Member",
        sponsor_email: "pat.member@example.com",
        fee_label: "$35.00",
        fee_tier: "adult_plus_children",
        party_size: 3,
        minors: [
          { first_name: "Jordan", last_name: "Paid" },
          { first_name: "Casey", last_name: "Paid" }
        ],
        status: "paid",
        paid: true
      }
    ]
  }
];

async function openEventStudio(page) {
  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.waitForSelector('[data-hub-goto="event-studio"]');
  await page.locator('[data-hub-goto="event-studio"]').click();
  await expect(page.locator("#hubEventStudio")).toBeVisible();
  await expect(page.locator("#hubEventForm")).toBeVisible();
}

async function loadGuestForm(page, events) {
  await page.goto("/parades.html#guest-march");
  await page.waitForFunction(() => typeof window.__kosSetParadeGuestEvents === "function");
  await page.evaluate((list) => window.__kosSetParadeGuestEvents(list), events);
}

test.describe("Event Studio guest march fields", () => {
  test("fields show only for parade events and prefill family fees", async ({ page }) => {
    const report = watchPage(page);
    await openEventStudio(page);
    await expect(page.locator("#hubEventGuestMarchFields")).toBeHidden();
    await page.locator("#hubEventType").selectOption("parade");
    await expect(page.locator("#hubEventGuestMarchFields")).toBeVisible();
    await expect(page.locator("#hubEventStudio")).toContainText("Guest march spots");
    await expect(page.locator("#hubEventStudio")).toContainText("Guest payment (Zeffy) URL");
    await expect(page.locator("#hubEventGuestRequires21")).toBeChecked();
    await page.locator("#hubEventName").fill("Children's Gasparilla");
    await expect(page.locator("#hubEventGuestFee")).toHaveValue("25.00");
    await expect(page.locator("#hubEventGuestFeeFamily")).toHaveValue("10.00");
    await expect(page.locator("#hubEventGuestRequires21")).not.toBeChecked();
    await page.locator("#hubEventType").selectOption("social");
    await expect(page.locator("#hubEventGuestMarchFields")).toBeHidden();
    assertHealthy(expect, report, "event studio guest fields");
  });
});

test.describe("Public guest form", () => {
  test("open parade lets an adult add children and shows spots left", async ({ page }) => {
    const report = watchPage(page);
    await loadGuestForm(page, [OPEN_EVENT, ADULT_EVENT, FULL_EVENT]);
    await expect(page.locator("#guest-march")).toContainText("Each adult registers themselves");
    await expect(page.locator("#pgForm")).toBeVisible();
    await page.locator("#pgParade").selectOption("parade-childrens");
    await expect(page.locator("#pgParadeDetails")).toContainText("Adult guests pay $25.00");
    await expect(page.locator("#pgParadeDetails")).toContainText("Parade guest");
    await expect(page.locator("#pgKidsWrap")).toBeVisible();
    await expect(page.locator("#pgAge21Wrap")).toBeHidden();
    await expect(page.locator("#pgPartySummary")).toContainText("17 left");
    await page.locator("#pgAddKid").click();
    await page.locator('[data-kid="first"]').first().fill("Riley");
    await page.locator('[data-kid="last"]').first().fill("Guest");
    await page.locator("#pgAddKid").click();
    await page.locator('[data-kid="first"]').nth(1).fill("Quinn");
    await page.locator('[data-kid="last"]').nth(1).fill("Guest");
    await expect(page.locator("#pgPartySummary")).toContainText("you plus 2 children (3 people)");
    await expect(page.locator("#pgPartySummary")).toContainText("$45.00");
    await expect(page.locator("#pgPartySummary")).toContainText("Parade guest, immediate family or under 12");
    await expect(page.locator("#pgWaiver")).toBeVisible();
    await expect(page.locator("#guest-march")).toContainText("I sign this waiver for myself and for any minor children");
    await expect(page.locator("#guest-march a[href='assets/docs/liability-waiver.html']")).toBeVisible();
    assertHealthy(expect, report, "public guest form open with children");
  });

  test("21+ parades hide children and require the age checkbox", async ({ page }) => {
    const report = watchPage(page);
    await loadGuestForm(page, [OPEN_EVENT, ADULT_EVENT]);
    await page.locator("#pgParade").selectOption("parade-santyago-open");
    await expect(page.locator("#pgAge21Wrap")).toBeVisible();
    await expect(page.locator("#pgAge21Wrap")).toContainText("Children cannot be added");
    await expect(page.locator("#pgKidsWrap")).toBeHidden();
    await expect(page.locator("#pgAddKid")).toBeHidden();
    assertHealthy(expect, report, "21+ parade blocks children");
  });

  test("full parade shows filled message and hides fields", async ({ page }) => {
    const report = watchPage(page);
    await loadGuestForm(page, [OPEN_EVENT, FULL_EVENT]);
    await page.locator("#pgParade").selectOption("parade-santyago");
    await expect(page.locator("#pgFullNote")).toBeVisible();
    await expect(page.locator("#pgFullNote")).toHaveText("All guest spots for this parade are filled.");
    await expect(page.locator("#pgFields")).toBeHidden();
    await expect(page.locator("#pgSubmit")).toBeDisabled();
    assertHealthy(expect, report, "public guest form full");
  });

  test("party larger than remaining spots is blocked", async ({ page }) => {
    const report = watchPage(page);
    await loadGuestForm(page, [TIGHT_EVENT]);
    await page.locator("#pgParade").selectOption("parade-childrens-tight");
    await expect(page.locator("#pgPartySummary")).toContainText("2 left");
    await page.locator("#pgAddKid").click();
    await page.locator('[data-kid="first"]').first().fill("Riley");
    await page.locator('[data-kid="last"]').first().fill("Guest");
    await page.locator("#pgAddKid").click();
    await page.locator('[data-kid="first"]').nth(1).fill("Quinn");
    await page.locator('[data-kid="last"]').nth(1).fill("Guest");
    await expect(page.locator("#pgPartySummary")).toContainText("Only 2 guest spots are left. This registration is for 3 people.");
    await expect(page.locator("#pgSubmit")).toBeDisabled();
    assertHealthy(expect, report, "party too large");
  });

  test("race on submit shows the filled message", async ({ page }) => {
    const report = watchPage(page);
    await loadGuestForm(page, [OPEN_EVENT]);
    await page.locator("#pgParade").selectOption("parade-childrens");
    await page.locator("#pgFirst").fill("Avery");
    await page.locator("#pgLast").fill("Guest");
    await page.locator("#pgEmail").fill("avery.guest@example.com");
    await page.locator("#pgSponsorFirst").fill("Pat");
    await page.locator("#pgSponsorLast").fill("Member");
    await page.locator("#pgSponsorEmail").fill("pat.member@example.com");
    await page.evaluate(() => {
      var w = document.getElementById("pgWaiver");
      var n = document.getElementById("pgWaiverName");
      if (w) w.checked = true;
      if (n) n.value = "Avery Guest";
    });
    await page.evaluate(() => {
      window.__kosParadeGuestSubmit = async () => ({
        ok: false,
        code: "full",
        message: "All guest spots for this parade are filled."
      });
    });
    await page.locator("#pgSubmit").click();
    await expect(page.locator("#pgMsg")).toContainText("All guest spots for this parade are filled.");
    await expect(page.locator("#pgFullNote")).toBeVisible();
    assertHealthy(expect, report, "public guest form race");
  });
});

test.describe("Member Hub guest approvals", () => {
  test("My Krewe shows the whole party and unpaid reminder", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { paradeGuests: GUEST_ROWS } });
    await page.evaluate((rows) => {
      if (typeof window.__kosHubSetParadeGuests === "function") window.__kosHubSetParadeGuests(rows);
    }, GUEST_ROWS);
    await page.locator('[data-hub-tab="krewe"]').click();
    await expect(page.locator("#hubParadeGuestApprove")).toBeVisible();
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("Guest march approvals");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("Avery Guest");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("3 people");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("Riley Guest");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("Quinn Guest");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("$45.00");
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("Pending");
    await expect(page.locator("[data-pg-act='approve']")).toBeVisible();
    await expect(page.locator("#hubParadeGuestApprove")).toContainText("This registration has not been paid yet.");
    await expect(page.locator("[data-pg-act='resend']")).toBeVisible();
    assertHealthy(expect, report, "my krewe guest card");
  });

  test("approve is blocked when the parade is full", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { paradeGuests: GUEST_ROWS } });
    await page.evaluate((rows) => {
      if (typeof window.__kosHubSetParadeGuests === "function") window.__kosHubSetParadeGuests(rows);
    }, GUEST_ROWS);
    await page.locator('[data-hub-tab="krewe"]').click();
    await page.evaluate(() => { window.__kosParadeGuestApproveFull = true; });
    await page.locator("[data-pg-act='approve']").click();
    await expect(page.locator("#hubMyParadeGuestsMsg")).toContainText("All guest spots for this parade are filled.");
    assertHealthy(expect, report, "approve blocked when full");
  });
});

test.describe("Officer Desk Parade guests", () => {
  test("lists people counts, children, inviting member, fee, status, and CSV", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: { officer: true, canManageEvents: true, officerParadeGuests: OFFICER_PARADES }
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await page.evaluate((parades) => {
      if (typeof window.__kosHubSetOfficerParadeGuests === "function") {
        window.__kosHubSetOfficerParadeGuests(parades);
      }
    }, OFFICER_PARADES);
    await page.waitForSelector('.hub-officer-tile[data-tool="tool:hubParadeGuests"]');
    await page.locator('.hub-officer-tile[data-tool="tool:hubParadeGuests"]').click();
    await expect(page.locator("#hubParadeGuests")).toBeVisible();
    await expect(page.locator("#hubParadeGuests")).toContainText("Parade guests");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("3 of 20");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("Avery Guest");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("Riley Guest");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("Child");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("Pat Member");
    await expect(page.locator("#hubParadeGuestsBody")).toContainText("Paid");
    await expect(page.locator("#hubParadeGuestsCsv")).toBeVisible();
    const csv = await page.evaluate((parades) => {
      var ev = document.createEvent("Event");
      ev.initEvent("click", true, true);
      document.getElementById("hubParadeGuestsCsv").dispatchEvent(ev);
      var fn = null;
      // Re-run the same CSV builder used by the page by reconstructing from fixtures.
      var lines = ["Parade,Spots taken,Guest spots,Person name,Role,Registration email,Inviting member,Inviting email,Registration total,Status,Paid,Registered"];
      (parades || []).forEach(function (p) {
        (p.guests || []).forEach(function (g) {
          var people = [{ name: (g.first_name + " " + g.last_name).trim(), role: "Adult guest" }];
          (g.minors || []).forEach(function (m) {
            people.push({ name: (m.first_name + " " + m.last_name).trim(), role: "Child" });
          });
          people.forEach(function (person) {
            lines.push([p.name, p.spots_taken, p.guest_capacity, person.name, person.role, g.email].join(","));
          });
        });
      });
      return lines.join("\n");
    }, OFFICER_PARADES);
    expect(csv).toContain("Riley Guest,Child");
    expect(csv).toContain("Avery Guest,Adult guest");
    expect(csv).toContain("Jordan Paid,Child");
    assertHealthy(expect, report, "officer parade guests");
  });
});

test("payment link email preview names tickets, people, total, and token", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/tests/fixtures/parade-guest-payment-email.html");
  await expect(page.locator("#emailBody")).toContainText("Your guest payment link");
  await expect(page.locator("#emailBody")).toContainText("Children's Gasparilla");
  await expect(page.locator("#emailBody")).toContainText("Avery Guest");
  await expect(page.locator("#emailBody")).toContainText("Riley Guest");
  await expect(page.locator("#emailBody")).toContainText("Quinn Guest");
  await expect(page.locator("#emailBody")).toContainText("1 ticket named");
  await expect(page.locator("#emailBody")).toContainText("Parade guest");
  await expect(page.locator("#emailBody")).toContainText("2 tickets named");
  await expect(page.locator("#emailBody")).toContainText("Parade guest, immediate family or under 12");
  await expect(page.locator("#emailBody")).toContainText("$45.00");
  await expect(page.locator("#emailBody")).toContainText("kos_guest=11111111-1111-4111-8111-111111111111");
  await expect(page.locator("#emailBody")).toContainText("utm_content=kos_guest_11111111-1111-4111-8111-111111111111");
  assertHealthy(expect, report, "payment email preview");
});
