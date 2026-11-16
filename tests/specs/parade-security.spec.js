// Parade security sign-up: member empty state, sample shifts, officer roster, public CTA.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");
const fs = require("fs");
const path = require("path");

const SHOTS = process.env.PARADE_SECURITY_SHOTS || "";

const MEMBER_SHIFTS = {
  phone: "(813) 555-0148",
  parades: [
    {
      event_id: "santa",
      name: "SantaFest",
      start_time: "2026-12-05T18:00:00.000Z",
      shifts: [
        {
          id: "shift-stage",
          label: "Staging detail",
          starts_at: "2026-12-05T16:00:00.000Z",
          ends_at: "2026-12-05T18:00:00.000Z",
          capacity: 6,
          spots_left: 2,
          notes: "Meet at the castle float for vest pickup.",
          my_status: "signed_up",
          my_phone: "(813) 555-0148"
        },
        {
          id: "shift-route",
          label: "Route walk",
          starts_at: "2026-12-05T18:00:00.000Z",
          ends_at: "2026-12-05T22:00:00.000Z",
          capacity: 10,
          spots_left: 4,
          notes: "Walk the curb from step-off to the end of the route.",
          my_status: null
        }
      ]
    },
    {
      event_id: "child",
      name: "Children's Gasparilla",
      start_time: "2027-01-23T14:00:00.000Z",
      shifts: [
        {
          id: "shift-front",
          label: "Front of the float",
          starts_at: "2027-01-23T13:00:00.000Z",
          ends_at: "2027-01-23T19:00:00.000Z",
          capacity: 8,
          spots_left: 8,
          notes: "",
          my_status: null
        }
      ]
    }
  ]
};

const OFFICER_ROSTER = {
  parade_choices: [
    { event_id: "santa", name: "SantaFest", start_time: "2026-12-05T18:00:00.000Z" },
    { event_id: "child", name: "Children's Gasparilla", start_time: "2027-01-23T14:00:00.000Z" }
  ],
  parades: [
    {
      event_id: "santa",
      name: "SantaFest",
      start_time: "2026-12-05T18:00:00.000Z",
      shifts: [
        {
          id: "shift-stage",
          label: "Staging detail",
          starts_at: "2026-12-05T16:00:00.000Z",
          ends_at: "2026-12-05T18:00:00.000Z",
          capacity: 6,
          notes: "Meet at the castle float. Vest pickup is here.",
          signups: [
            { id: "su1", name: "Avery Quinn", phone: "(813) 555-0142", email: "avery@example.com", status: "signed_up" },
            { id: "su2", name: "Riley Hale", phone: "(813) 555-0177", email: "riley@example.com", status: "cancelled" }
          ]
        },
        {
          id: "shift-route",
          label: "Route walk",
          starts_at: "2026-12-05T18:00:00.000Z",
          ends_at: "2026-12-05T22:00:00.000Z",
          capacity: 10,
          notes: "Walk the curb line. No drinking on duty.",
          signups: [
            { id: "su3", name: "Pat Member", phone: "(727) 555-0199", email: "pat@example.com", status: "signed_up" }
          ]
        }
      ]
    }
  ]
};

async function prepShot(page) {
  await page.evaluate(() => {
    var css = document.getElementById("shotPrep");
    if (!css) {
      css = document.createElement("style");
      css.id = "shotPrep";
      document.head.appendChild(css);
    }
    css.textContent = [
      "#hubTabs, .kos-float, #kosTune { visibility: hidden !important; }",
      "body, #hubRoot, #memberContent, .hub-panel, #hubOfficer, #hubParade {",
      "overflow: visible !important; height: auto !important; max-height: none !important;",
      "}"
    ].join("");
    document.querySelectorAll("*").forEach(function (el) {
      if (el.scrollTop) el.scrollTop = 0;
    });
    window.scrollTo(0, 0);
  });
}

async function shot(page, locator, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await prepShot(page);
  await locator.screenshot({ path: path.join(SHOTS, name) });
}

test("Member Hub parade tab explains the empty security list", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await page.evaluate(() => {
    window.__kosHubSetParadeSecurity({ phone: "", parades: [] });
  });
  const card = page.locator("#hubParadeSecurityCard");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Parade security sign-up");
  await expect(card).toContainText("The krewe provides a vest, and there is a briefing before each parade. No drinking while you are on duty.");
  await expect(card).toContainText("Security shifts are coming soon. Check back once the parade chairs post times.");
  await expect(card.locator("#psPhone")).toHaveCount(0);
  await shot(page, card, "parade-security-empty-desktop.png");
  assertHealthy(expect, report, "parade security empty");
});

test("Member Hub security sign-up lists shifts, spots, and the member phone", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await page.evaluate((data) => window.__kosHubSetParadeSecurity(data), MEMBER_SHIFTS);
  const card = page.locator("#hubParadeSecurityCard");
  await expect(card).toContainText("Your shifts");
  await expect(card).toContainText("Staging detail");
  await expect(card).toContainText("4 spots left");
  await expect(card.locator("#psPhone")).toHaveValue("(813) 555-0148");
  await expect(card.locator("#psSignup")).toHaveText("Sign up");
  await expect(card).toContainText("No drinking while you are on duty.");
  await page.waitForTimeout(400);
  await expect(card).toContainText("4 spots left");
  await shot(page, card, "parade-security-shifts-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await shot(page, card, "parade-security-shifts-mobile.png");
  await expect(card.locator("#psSignup")).toBeVisible();
  assertHealthy(expect, report, "parade security shifts");
});

test("Officer Desk parade security shows the roster and a tap-to-call phone", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, {
    role: {
      officer: true,
      toolKeys: ["parade_security", "parade_guests"],
      officerParadeSecurity: OFFICER_ROSTER
    }
  });
  await page.locator('[data-hub-tab="officer"]').click();
  await page.evaluate((data) => window.__kosHubSetOfficerParadeSecurity(data), OFFICER_ROSTER);
  await page.waitForSelector('.hub-officer-tile[data-tool="tool:hubParadeSecurity"]');
  const guests = page.locator('.hub-officer-tile[data-tool="tool:hubParadeGuests"]');
  const security = page.locator('.hub-officer-tile[data-tool="tool:hubParadeSecurity"]');
  await expect(guests).toBeVisible();
  await expect(security).toBeVisible();
  const tileOrder = await page.locator(".hub-officer-tile").evaluateAll(function (els) {
    return els.map(function (el) { return el.getAttribute("data-tool"); });
  });
  expect(tileOrder.indexOf("tool:hubParadeSecurity")).toBe(tileOrder.indexOf("tool:hubParadeGuests") + 1);
  await security.click();
  const card = page.locator("#hubParadeSecurity");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Add a shift");
  await expect(card.locator("#psOffParade")).toContainText("SantaFest");
  await expect(card.locator("#psOffLabel")).toBeVisible();
  await expect(card.locator("#psOffStart")).toBeVisible();
  await expect(card.locator("#psOffEnd")).toBeVisible();
  await expect(card.locator("#psOffCap")).toBeVisible();
  await expect(card.locator("#psOffNotes")).toBeVisible();
  await expect(card).toContainText("Avery Quinn");
  await expect(card).toContainText("Pat Member");
  await expect(card).toContainText("Signed up");
  await expect(card).toContainText("Cancelled");
  await expect(card.locator('a.ps-tel[href="tel:8135550142"]')).toHaveText("(813) 555-0142");
  await expect(card.locator("#psOffCsv")).toHaveText("Export CSV");
  const desk = page.locator("#hubParadeSecurityDesk");
  await shot(page, desk, "parade-security-officer-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await desk.scrollIntoViewIfNeeded();
  await shot(page, desk, "parade-security-officer-mobile.png");
  await expect(card.locator("#psOffSave")).toBeVisible();
  assertHealthy(expect, report, "parade security officer");
});

test("parades.html invites members to sign up and shows the SantaFest time", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/parades.html");
  const cta = page.locator("#paradeSecurityCta");
  await expect(cta).toContainText("Want to work security? Sign in to the Member Hub to pick your parade and shift.");
  await expect(cta.getByRole("link", { name: "Member Login" })).toHaveAttribute("href", "members.html");
  await expect(page.locator("#paradeSecurityCta form")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("(813)");
  const santa = page.locator("#parade-season .parade-card", {
    has: page.getByRole("heading", { level: 3, name: "SantaFest" })
  });
  await expect(santa).toContainText("1:00 to 5:00 PM ET");
  await expect(santa).toContainText("Morgan and Madison");
  await expect(santa).toContainText("Ashley and Cass");
  await expect(santa).toContainText("Krewe staging time is still to be announced");
  await expect(santa).not.toContainText("9:00");
  await expect(santa).not.toContainText("about 5:00");
  await expect(page.locator("#ikcSeasonTable")).toContainText("Saturday, December 5, 2026, 1:00 to 5:00 PM ET");
  await shot(page, cta, "parades-security-cta-desktop.png");
  await shot(page, santa, "santafest-time-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await cta.scrollIntoViewIfNeeded();
  await shot(page, cta, "parades-security-cta-mobile.png");
  await santa.scrollIntoViewIfNeeded();
  await shot(page, santa, "santafest-time-mobile.png");
  assertHealthy(expect, report, "parades security cta");
});
