// Who's coming: Officer Desk RSVP list. Fixtures only. The SQL file is not applied.
const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");
const fs = require("fs");
const path = require("path");

const SHOTS = process.env.WHOS_COMING_SHOTS || "/opt/cursor/artifacts";

function etParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const map = {};
  fmt.formatToParts(date).forEach(function (part) { map[part.type] = part.value; });
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

function addDays(parts, days) {
  const utc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days, 17, 0, 0));
  return utc.toISOString();
}

function fixture() {
  const today = etParts(new Date());
  const basket = "ev-basket";
  return {
    events: [
      { id: basket, name: "Basket Social", start_time: addDays(today, 12), status: "published", source: "krewe" },
      { id: "ev-ikc", name: "Fill the Float Toy Drive", start_time: addDays(today, 16), status: "published", source: "ikc" },
      { id: "ev-quiz", name: "Pub quiz", start_time: addDays(today, 20), status: "published" },
      { id: "ev-meeting", name: "General meeting", start_time: addDays(today, -1), status: "published" },
      { id: "ev-golf", name: "Mini Golf and Lunch", start_time: addDays(today, -40), status: "published" }
    ],
    rosters: {
      "ev-basket": {
        rows: [
          {
            name: "Avery Quinn",
            audience: "Member",
            source: "Member RSVP",
            status: "registered",
            guests: 2,
            signed_up_at: addDays(today, -2),
            phone: "(813) 555-0142",
            email: "avery@example.com",
            counts: true
          },
          {
            name: "Riley <Hale>",
            audience: "Member",
            source: "Member RSVP",
            status: "attended",
            guests: 0,
            signed_up_at: addDays(today, -3),
            phone: "(813) 555-0160",
            email: "riley@example.com",
            counts: true
          },
          {
            name: "Jordan Blake",
            audience: "Guest/Public",
            source: "Public signup",
            status: "waitlisted",
            guests: 1,
            signed_up_at: addDays(today, -1),
            phone: "",
            email: "jordan@example.com",
            counts: false
          },
          {
            name: "Casey Ng",
            audience: "Guest/Public",
            source: "Parade guest",
            status: "paid",
            guests: null,
            signed_up_at: addDays(today, -1),
            phone: "(727) 555-0190",
            email: "casey@example.com",
            counts: true
          },
          {
            name: "Sam Ortiz",
            audience: "Guest/Public",
            source: "Zeffy ticket",
            status: "succeeded",
            guests: null,
            signed_up_at: addDays(today, -4),
            phone: "",
            email: "sam@example.com",
            counts: true
          }
        ]
      },
      "ev-golf": { rows: [] },
      "ev-ikc": {
        rows: [
          {
            name: "Nia Walsh",
            audience: "Member",
            source: "Member RSVP",
            status: "registered",
            guests: 3,
            signed_up_at: addDays(today, -1),
            phone: "(813) 555-0110",
            email: "nia@example.com",
            counts: true
          }
        ]
      }
    }
  };
}

async function shot(page, locator, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(function () {
    var css = document.getElementById("shotPrep");
    if (!css) {
      css = document.createElement("style");
      css.id = "shotPrep";
      document.head.appendChild(css);
    }
    css.textContent = [
      "#hubTabs, .app-header, #hubOfficerActiveBar, .kos-float, #kosTune { visibility: hidden !important; }",
      "body, #hubRoot, #memberContent, .hub-panel, #hubOfficer {",
      "overflow: visible !important; height: auto !important; max-height: none !important;",
      "}"
    ].join("");
    document.querySelectorAll("*").forEach(function (el) {
      if (el.scrollTop) el.scrollTop = 0;
    });
    window.scrollTo(0, 0);
  });
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: path.join(SHOTS, name) });
}

test.describe("Who's coming", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tile is visible for Event Studio access and hidden without it", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: { officer: true, toolKeys: ["event_studio", "qr_studio"] }
    });
    await page.locator('[data-hub-tab="officer"]').click();
    const events = page.locator("#deskOff-events");
    await expect(events.locator('[data-tool="tool:hubEventStudio"]')).toBeVisible();
    const tile = events.locator('[data-tool="tool:hubWhosComing"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Who's coming");
    const order = await events.locator(".hub-officer-tile").evaluateAll(function (els) {
      return els.map(function (el) { return el.getAttribute("data-tool"); });
    });
    expect(order.indexOf("tool:hubWhosComing")).toBe(order.indexOf("tool:hubEventStudio") + 1);
    const tileBox = await tile.boundingBox();
    expect(tileBox.height).toBeGreaterThanOrEqual(44);
    await shot(page, events, "whos-coming-events-390.png");
    assertHealthy(expect, report, "whos coming tile");
  });

  test("regular members and roles without Event Studio do not see the tile", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, {
      role: { officer: false, canManageEvents: false, canReviewHours: true }
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await expect(page.locator('[data-tool="tool:hubApprovals"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubWhosComing"]')).toHaveCount(0);
    await expect(page.locator('[data-tool="tool:hubEventStudio"]')).toHaveCount(0);

    await unlockMemberHub(page, {
      role: { officer: true, toolKeys: ["shop_studio", "member_contacts", "reports.merch"] }
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await expect(page.locator('[data-tool="tool:hubShopStudio"]')).toBeVisible();
    await expect(page.locator('[data-tool="tool:hubWhosComing"]')).toHaveCount(0);
    await expect(page.locator('[data-tool="tool:hubEventStudio"]')).toHaveCount(0);
    assertHealthy(expect, report, "whos coming hidden");
  });

  test("picker, list, headcount, search, and CSV", async ({ page }) => {
    const report = watchPage(page);
    const data = fixture();
    await unlockMemberHub(page, {
      role: { officer: true, canManageEvents: true, toolKeys: ["event_studio"] }
    });
    await page.locator('[data-hub-tab="officer"]').click();
    await page.evaluate((payload) => window.__kosHubSetWhosComing(payload), data);
    await page.locator('[data-tool="tool:hubWhosComing"]').click();

    const card = page.locator("#hubWhosComing");
    await expect(card).toBeVisible();
    await expect(card.locator("#kosWc")).toContainText("public signups");
    const text = await card.locator("#kosWc").innerText();
    expect(text).not.toMatch(/[—–]/);

    const picker = card.locator("#kosWcPicker");
    await expect(picker).toContainText("Basket Social");
    await expect(picker).toContainText("Fill the Float Toy Drive");
    await expect(picker).toContainText("IKC");
    await expect(picker).toContainText("Pub quiz");
    await expect(picker).toContainText("General meeting");
    await expect(picker).not.toContainText("Mini Golf");
    const labels = await picker.locator(".kos-wc-event").allInnerTexts();
    expect(labels[0]).toContain("Basket Social");
    expect(labels[1]).toContain("Fill the Float Toy Drive");
    expect(labels[1]).toContain("IKC");
    expect(labels[2]).toContain("Pub quiz");
    expect(labels[3]).toContain("General meeting");
    await expect(picker.locator('[aria-pressed="true"]')).toContainText("Basket Social");
    const eventBtn = picker.locator(".kos-wc-event").first();
    expect((await eventBtn.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const fit = await page.evaluate(function () {
      const vw = document.documentElement.clientWidth;
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const card = document.getElementById("hubWhosComing").getBoundingClientRect();
      return { vw: vw, sw: sw, right: card.right };
    });
    expect(fit.sw).toBeLessThanOrEqual(fit.vw + 1);
    expect(fit.right).toBeLessThanOrEqual(fit.vw + 1);
    await shot(page, card.locator("#kosWcPick"), "whos-coming-picker-390.png");

    await card.locator("#kosWcOlder").click();
    await expect(picker).toContainText("Mini Golf and Lunch");
    await card.locator("#kosWcOlder").click();
    await expect(picker).not.toContainText("Mini Golf");

    const list = card.locator("#kosWcList");
    await expect(list).toContainText("Avery Quinn");
    await expect(list).toContainText("Riley <Hale>");
    await expect(list).toContainText("Jordan Blake");
    await expect(list).toContainText("Casey Ng");
    await expect(list).toContainText("Sam Ortiz");
    await expect(list).toContainText("Member, Member RSVP");
    await expect(list).toContainText("Guest/Public, Public signup");
    await expect(list).toContainText("Guest/Public, Parade guest");
    await expect(list).toContainText("Guest/Public, Zeffy ticket");
    await expect(list).toContainText("Registered");
    await expect(list).toContainText("Waitlisted");
    await expect(list).toContainText("Paid");
    await expect(list).toContainText("Guests: 2");
    await expect(list).toContainText("Guests: 0");
    await expect(list).toContainText("Not in the headcount");
    await expect(list.locator('a[href="tel:8135550142"]')).toHaveText("(813) 555-0142");
    await expect(list.locator('a[href="mailto:avery@example.com"]')).toHaveText("avery@example.com");
    await expect(list.locator('a[href="tel:7275550190"]')).toHaveText("(727) 555-0190");
    const html = await list.innerHTML();
    expect(html).not.toContain("<Hale>");
    expect(html).toContain("Riley &lt;Hale&gt;");

    await expect(card.locator("#kosWcMembers")).toHaveText("4");
    await expect(card.locator("#kosWcPublic")).toHaveText("2");
    await expect(card.locator("#kosWcCombined")).toHaveText("6");

    const font = await card.locator("#kosWc").evaluate(function (el) {
      return parseFloat(getComputedStyle(el).fontSize);
    });
    expect(font).toBeGreaterThanOrEqual(16);
    expect(font).toBeLessThanOrEqual(16.5);
    expect((await card.locator("#kosWcSearch").boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await card.locator("#kosWcCsv").boundingBox()).height).toBeGreaterThanOrEqual(44);

    await card.locator("#kosWcSearch").fill("casey");
    await expect(list).toContainText("Casey Ng");
    await expect(list).not.toContainText("Avery Quinn");
    await expect(list).not.toContainText("Sam Ortiz");
    await expect(card.locator("#kosWcCombined")).toHaveText("6");
    await card.locator("#kosWcSearch").fill("QUINN");
    await expect(list).toContainText("Avery Quinn");
    await expect(list).not.toContainText("Casey Ng");
    await card.locator("#kosWcSearch").fill("");
    await expect(list).toContainText("Sam Ortiz");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.locator("#kosWcCsv").click()
    ]);
    expect(download.suggestedFilename()).toBe("whos-coming-basket-social.csv");
    const csv = fs.readFileSync(await download.path(), "utf8");
    expect(csv).toContain("Name,Kind,Source,Status,Guests,Signed up,Phone,Email");
    expect(csv).toContain("Avery Quinn,Member,Member RSVP,Registered,2");
    expect(csv).toContain("Jordan Blake,Guest/Public,Public signup,Waitlisted,1");
    expect(csv).toContain("Casey Ng,Guest/Public,Parade guest,Paid");
    expect(csv).toContain("Sam Ortiz,Guest/Public,Zeffy ticket,Paid");
    expect(csv).toContain("avery@example.com");
    expect(csv).not.toMatch(/[—–]/);

    await shot(page, card.locator("#kosWcRoster"), "whos-coming-list-390.png");
    await picker.getByRole("button", { name: /Fill the Float Toy Drive/ }).click();
    await expect(picker.locator('[aria-pressed="true"]')).toContainText("IKC");
    await expect(list).toContainText("Nia Walsh");
    await expect(list).toContainText("Guests: 3");
    await expect(card.locator("#kosWcMembers")).toHaveText("4");
    await expect(card.locator("#kosWcCombined")).toHaveText("4");
    const [ikcDownload] = await Promise.all([
      page.waitForEvent("download"),
      card.locator("#kosWcCsv").click()
    ]);
    expect(ikcDownload.suggestedFilename()).toBe("whos-coming-fill-the-float-toy-drive.csv");
    const ikcCsv = fs.readFileSync(await ikcDownload.path(), "utf8");
    expect(ikcCsv).toContain("Nia Walsh,Member,Member RSVP,Registered,3");
    assertHealthy(expect, report, "whos coming list");
  });
});
