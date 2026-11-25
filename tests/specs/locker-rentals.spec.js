// Locker rentals: Zeffy pay links, FCFS form, and the officer queue shell.
// Does not submit a real reservation. The live database is not mutated.
const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SMALL_URL = "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small";
const LARGE_URL = "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large";

test("Reserve a locker shows Tim's open counts and the real Zeffy pay links", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  const card = page.locator("#deskTravel #lockerCard");
  await expect(card).toBeVisible();
  await expect(card.locator("h2")).toHaveText("Locker Rentals");
  await expect(card.locator("#lkSize option")).toHaveCount(2);
  await expect(card.locator("#lkSize")).not.toContainText("medium");
  await expect(card.locator("#lockerIntro")).toContainText("Large lockers are $200 and small lockers are $75 for the season.");
  await expect(card.locator("#lockerIntro")).toContainText("Join the list below");
  await expect(card.locator("#lockerIntro")).toContainText("let you know your number");
  await expect(card.locator("#lockerIntro")).not.toContainText("LL, RL, or RS");
  await expect(card.locator("#lockerIntro")).not.toContainText("\u2014");

  await page.evaluate(() => {
    window.__kosSb = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from() {
        function query(rows) {
            const builder = {
              order() { return builder; },
              eq() { return builder; },
              in() { return builder; },
              gte() { return builder; },
              lte() { return builder; },
              limit() { return builder; },
              or() { return builder; },
              then(onFulfilled, onRejected) {
                return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
              }
            };
            return builder;
          }
          return { select() { return query([]); } };
      },
      rpc: async (name) => {
        if (name === "locker_availability") return { data: { small: 5, large: 8 }, error: null };
        if (name === "my_locker_reservations") return { data: [], error: null };
        if (name === "is_krewe_officer") return { data: false, error: null };
        return { data: null, error: null };
      }
    };
    return window.kosLoadLockers();
  });

  await expect(page.locator("#lockerLargeCount")).toHaveText("8");
  await expect(page.locator("#lockerSmallCount")).toHaveText("5");
  const small = page.locator("#lockerPaySmall");
  const large = page.locator("#lockerPayLarge");
  await expect(small).toHaveAttribute("href", SMALL_URL);
  await expect(large).toHaveAttribute("href", LARGE_URL);
  await expect(small).toHaveText("Pay Small locker $75");
  await expect(large).toHaveText("Pay Large locker $200");
  await expect(small).toHaveAttribute("title", "Krewe locker rental – Small");
  await expect(large).toHaveAttribute("title", "Krewe locker rental – Large");
  await expect(small).not.toHaveAttribute("aria-disabled", "true");
  await expect(large).not.toHaveAttribute("aria-disabled", "true");
  const payTone = await small.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, opacity: cs.opacity, backgroundImage: cs.backgroundImage };
  });
  expect(payTone.color, "Pay label must be white on the green button").toBe("rgb(255, 255, 255)");
  expect(Number(payTone.opacity)).toBe(1);
  expect(payTone.backgroundImage).toContain("rgb(43, 139, 81)");
  await small.hover();
  const hovered = await small.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, backgroundImage: cs.backgroundImage };
  });
  expect(hovered.color, "Hover must keep the white Pay label").toBe("rgb(255, 255, 255)");
  expect(hovered.backgroundImage).toContain("rgb(27, 107, 57)");
  await page.evaluate(() => {
    document.getElementById("lockerPayLarge").setAttribute("aria-disabled", "true");
  });
  const disabledTone = await large.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, opacity: cs.opacity, backgroundImage: cs.backgroundImage };
  });
  expect(disabledTone.color, "Disabled Pay label must stay white").toBe("rgb(255, 255, 255)");
  expect(Number(disabledTone.opacity), "Disabled Pay link must not fade below readable contrast").toBe(1);
  expect(disabledTone.backgroundImage).toContain("rgb(12, 59, 33)");
  await page.evaluate(() => {
    document.getElementById("lockerPayLarge").removeAttribute("aria-disabled");
  });
  await expect(page.locator("#lockerMine")).toContainText("You're not on the list yet. Join above to save your spot.");
  await expect(page.locator("#lockerHeld")).toBeHidden();
  await expect(page.locator("#lockerCard").locator("button", { hasText: "Free" })).toHaveCount(0);
  await expect(page.locator("#lockerCard [data-free]")).toHaveCount(0);
  assertHealthy(expect, report, "locker pay links");
});

test("Joining the locker list inserts a reservation, not a locker row", async ({ page }) => {
  const report = watchPage(page);
  let inserted = null;
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await page.evaluate(() => {
    window.__kosInserted = null;
    window.__kosSb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "member-1" } } } }) },
      from(table) {
        function query(data) {
          const builder = {
            order() { return builder; },
            eq() { return builder; },
            in() { return builder; },
            gte() { return builder; },
            lte() { return builder; },
            limit() { return builder; },
            or() { return builder; },
            then(onFulfilled, onRejected) {
              return Promise.resolve({ data: data, error: null }).then(onFulfilled, onRejected);
            }
          };
          return builder;
        }
        return {
          select() { return query([]); },
          insert: async (payload) => {
            window.__kosInserted = { table: table, payload: payload };
            return { error: null };
          }
        };
      },
      rpc: async (name) => {
        if (name === "locker_availability") return { data: { small: 5, large: 8 }, error: null };
        if (name === "my_locker_reservations") {
          return {
            data: [{ id: "r1", size: "small", status: "queued", paid_at: null, queue_position: 1, locker_number: null, created_at: "2026-09-30T00:00:00Z" }],
            error: null
          };
        }
        return { data: false, error: null };
      }
    };
  });
  await page.fill("#lkName", "Test Member");
  await page.fill("#lkEmail", "test.member@example.com");
  await page.selectOption("#lkSize", "large");
  await page.fill("#lkNotes", "Near the door");
  await page.locator("#lockerForm button[type=submit]").click();
  await expect.poll(async () => page.evaluate(() => window.__kosInserted && window.__kosInserted.table)).toBe("locker_reservations");
  inserted = await page.evaluate(() => window.__kosInserted);
  expect(inserted.payload.size).toBe("large");
  expect(inserted.payload.status).toBe("queued");
  expect(inserted.payload.requester_name).toBe("Test Member");
  expect(inserted.payload.requester_email).toBe("test.member@example.com");
  expect(inserted.payload.notes).toBe("Near the door");
  expect(inserted.payload).not.toHaveProperty("holder_name");
  await expect(page.locator("#lkMsg")).toContainText("You are on the list");
  await expect(page.locator("#lockerMine")).toContainText("number 1");
  assertHealthy(expect, report, "locker join");
});

function lockerDeskFixture() {
  return {
    urls: {
      small: SMALL_URL,
      large: LARGE_URL,
      smallCampaign: "Krewe locker rental – Small",
      largeCampaign: "Krewe locker rental – Large"
    },
    roster: [
      { id: "mem-avery", first_name: "Avery", last_name: "Quinn" },
      { id: "mem-casey", first_name: "Casey", last_name: "Morgan" }
    ],
    payments: [],
    lockers: [
      { id: "ll1", locker_number: "LL1", size: "large", holder_name: "Avery Quinn", member_id: "mem-avery", status: "assigned", paid: true, paid_at: "2026-10-02T16:00:00.000Z", amount_cents: 20000, payment_id: "11111111-1111-4111-8111-111111111111", source: "Zeffy", assigned_at: "2026-09-12T15:00:00.000Z" },
      { id: "ll2", locker_number: "LL2", size: "large", holder_name: null, status: "available", paid: false },
      { id: "ll4", locker_number: "LL4", size: "large", holder_name: "Parade Comp", status: "comp", paid: false },
      { id: "rl3", locker_number: "RL3", size: "large", holder_name: "Jordan Blake", member_id: "mem-jordan", status: "pending_payment", paid: false, unverified: true },
      { id: "rl5", locker_number: "RL5", size: "large", holder_name: "Morgan Ellis", member_id: "mem-morgan", status: "pending_payment", paid: false, size_mismatch: true, reserved_size: "small" },
      { id: "rs1", locker_number: "RS1", size: "small", holder_name: null, status: "available", paid: false },
      { id: "rs7", locker_number: "RS7", size: "small", holder_name: "Riley Chen", status: "assigned", paid: true, paid_at: "2026-10-04T16:00:00.000Z", amount_cents: 7500, payment_id: "22222222-2222-4222-8222-222222222222", source: "Off Zeffy", assigned_at: "2026-10-01T16:00:00.000Z" }
    ],
    waiting: [
      { id: "wait-casey", member_id: "mem-casey", holder_name: "Casey Morgan", size: "small", status: "waiting", paid: true, paid_at: "2026-10-06T16:00:00.000Z", amount_cents: 7500, payment_id: "33333333-3333-4333-8333-333333333333", source: "Zeffy" },
      { id: "wait-quinn", holder_name: "Quinn Harper", size: "large", status: "waiting", paid: false }
    ]
  };
}

test("Officer locker desk is one list with payment facts", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.locator('[data-hub-tab="officer"]').click();
  await expect(page.locator("#hubLockers")).toBeAttached();
  const fixture = lockerDeskFixture();
  await page.evaluate((fx) => { window.kosPaintLockerOfficer(fx); }, fixture);
  await page.locator('#deskOff-gear [data-tool="tool:hubLockers"]').click();
  const desk = page.locator("#hubLockers");
  await expect(desk).toBeVisible();
  await expect(desk).toContainText("Each locker is listed once");
  await expect(desk.locator(".locker-subhead")).toHaveText("Waiting list");
  await expect(page.locator("#hubLockerSmallUrl")).toHaveValue(SMALL_URL);
  await expect(desk).not.toContainText("Add existing paid locker");
  await expect(desk).not.toContainText("Reservation list");
  await expect(desk).not.toContainText("Inventory");
  await expect(desk).not.toContainText("Mark paid");
  await expect(desk.locator("#hubLockerTable")).toContainText("Payment source");
  await expect(desk.locator("#hubLockerTable")).not.toContainText("Email");
  const large = desk.locator(".locker-desk-card").first();
  await expect(large).toContainText("Large");
  await expect(large.locator(".locker-desk-stat").nth(0)).toContainText("5");
  await expect(large.locator(".locker-desk-stat").nth(1)).toContainText("3");
  await expect(large.locator(".locker-desk-stat").nth(2)).toContainText("1");
  await expect(large.locator(".locker-desk-stat").nth(3)).toContainText("1");
  await expect(large.locator(".locker-desk-stat").nth(4)).toContainText("2");
  await expect(large.locator(".locker-desk-stat").nth(5)).toContainText("1");
  await expect(large.locator(".locker-desk-stat").nth(6)).toContainText("1");
  const avery = desk.locator("#hubLockerRows tr").filter({ hasText: "Avery Quinn" });
  await expect(avery).toContainText("Oct 2, 2026");
  await expect(avery).toContainText("200.00");
  await expect(avery).toContainText("Zeffy");
  await expect(avery).not.toContainText("Sep 30");
  const comp = desk.locator("#hubLockerRows tr").filter({ hasText: "Parade Comp" });
  await expect(comp).toContainText("Comp");
  await expect(comp.locator("td").nth(4)).toHaveText("");
  await expect(comp.locator("td").nth(5)).toHaveText("");
  const jordan = desk.locator("#hubLockerRows tr").filter({ hasText: "Jordan Blake" });
  await expect(jordan).toContainText("Pending payment, unverified");
  await expect(desk.locator("#hubLockerRows")).toContainText("Asked for small");
  const casey = desk.locator("#hubLockerWaiting tr").filter({ hasText: "Casey Morgan" });
  await expect(casey).toContainText("Yes");
  await expect(casey).toContainText("75.00");
  await expect(page.locator("#hubLockerSettings")).toBeVisible();
  expect(await page.locator("#hubLockerSettings").evaluate((el) => el.open)).toBe(false);
  await expect(desk).not.toContainText("\u2014");
  await expect(page.locator("#lockerCard").locator("button", { hasText: "Free" })).toHaveCount(0);
  expect(await page.content()).not.toContain("locker_report");
  expect(await page.content()).not.toContain("Locker Assignments");
  await page.evaluate(() => {
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest && el.closest("#hubLockers")) return;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.visibility = "hidden";
    });
  });
  await page.locator("#hubLockers").screenshot({ path: "/opt/cursor/artifacts/locker-desk-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#hubLockers").screenshot({ path: "/opt/cursor/artifacts/locker-desk-phone.png" });
  assertHealthy(expect, report, "locker desk");
});

test("Officer can assign, warn on size, record a payment, and download the CSV", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.locator('[data-hub-tab="officer"]').click();
  await expect(page.locator("#hubLockers")).toBeAttached();
  await page.evaluate((fx) => { window.kosPaintLockerOfficer(fx); }, lockerDeskFixture());
  await page.locator('#deskOff-gear [data-tool="tool:hubLockers"]').click();
  const desk = page.locator("#hubLockers");
  await desk.locator("#hubLockerAssign").click();
  await expect(desk.locator("#hubLockerPanel")).toBeVisible();
  await desk.locator("#hubLockerWaitPick").selectOption("wait-casey");
  await desk.locator("#hubLockerNumber").selectOption("LL2");
  await expect(desk.locator("#hubLockerPanelWarn")).toContainText("asked for a small locker");
  await expect(desk.locator("#hubLockerPanelWarn")).toContainText("LL2 is large");
  await desk.locator("#hubLockerPanelSave").click();
  await expect(desk.locator("#hubLockerMsg")).toContainText("Check the box");
  await desk.locator("#hubLockerPanelConfirm").check();
  await desk.locator("#hubLockerPanelSave").click();
  await expect(desk.locator("#hubLockerMsg")).toContainText("Assigned LL2 to Casey Morgan");
  const casey = desk.locator("#hubLockerRows tr").filter({ hasText: "Casey Morgan" });
  await expect(casey).toContainText("Pending payment");
  await expect(casey).toContainText("Asked for small");
  await expect(desk.locator("#hubLockerWaiting")).not.toContainText("Casey Morgan");
  await expect(desk.locator("#hubLockerRows")).toContainText("RS1");

  await desk.locator("#hubLockerRows tr").filter({ hasText: "Jordan Blake" }).locator("button", { hasText: "Payment" }).click();
  await desk.locator("#hubLockerPanelSave").click();
  await expect(desk.locator("#hubLockerMsg")).toContainText("note is required");
  await desk.locator("#hubLockerPaidOn").fill("2026-10-08");
  await desk.locator("#hubLockerAmount").fill("200");
  await desk.locator("#hubLockerPayNote").fill("Check received at the barn");
  await desk.locator("#hubLockerPanelSave").click();
  const jordan = desk.locator("#hubLockerRows tr").filter({ hasText: "Jordan Blake" });
  await expect(jordan).toContainText("Assigned");
  await expect(jordan).toContainText("Off Zeffy");
  await expect(jordan).toContainText("200.00");
  await expect(jordan).not.toContainText("unverified");

  page.once("dialog", (dialog) => dialog.accept());
  await desk.locator("#hubLockerRows tr").filter({ hasText: "Parade Comp" }).locator("button", { hasText: "Free" }).click();
  await expect(desk.locator("#hubLockerRows tr").filter({ hasText: "LL4" })).toContainText("Open");

  await desk.locator("#hubLockerCsv").click();
  const csv = await page.evaluate(() => window.__kosLastLockerCsv || "");
  expect(csv.split("\n")[0]).toBe("Locker,Member,Size,Status,Assigned date,Paid date,Amount,Payment id,Source");
  expect(csv).toContain("Avery Quinn");
  expect(csv).toContain("11111111-1111-4111-8111-111111111111");
  expect(csv).toContain("Casey Morgan");
  expect(csv).toContain("Quinn Harper");
  expect(csv).not.toContain("@");
  expect(csv).not.toContain("Sep 30");
  expect(csv).not.toContain("\u2014");
  await expect(desk).not.toContainText("\u2014");
  assertHealthy(expect, report, "locker officer actions");
});

test("A member who holds lockers can renew them on the matching Zeffy link", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await page.evaluate(() => {
    window.__kosRenewal = null;
    window.__kosOpened = null;
    window.open = function () {
      var loc = {};
      var popup = {
        location: loc,
        close: function () { window.__kosClosed = true; }
      };
      Object.defineProperty(loc, "href", {
        set: function (v) { window.__kosOpened = v; },
        get: function () { return window.__kosOpened; }
      });
      return popup;
    };
    const held = [
      { id: "rs1", locker_number: "RS1", size: "small", status: "paid", holder_name: "Tim Fitz", renewal_open: false, renewal_paid: false },
      { id: "rs2", locker_number: "RS2", size: "small", status: "paid", holder_name: "Debbie Fitz", renewal_open: false, renewal_paid: false }
    ];
    const numbers = { rs1: "RS1", rs2: "RS2" };
    window.__kosSb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "tim" } } } }) },
      from() {
        function query(rows) {
            const builder = {
              order() { return builder; },
              eq() { return builder; },
              in() { return builder; },
              gte() { return builder; },
              lte() { return builder; },
              limit() { return builder; },
              or() { return builder; },
              then(onFulfilled, onRejected) {
                return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
              }
            };
            return builder;
          }
          return { select() { return query([]); } };
      },
      rpc: async (name, args) => {
        if (name === "locker_availability") return { data: { small: 5, large: 8 }, error: null };
        if (name === "my_locker_reservations") return { data: [], error: null };
        if (name === "my_held_lockers") return { data: held, error: null };
        if (name === "is_krewe_officer") return { data: false, error: null };
        if (name === "member_request_locker_renewal") {
          window.__kosRenewal = args;
          return {
            data: {
              ok: true,
              locker_numbers: (args.p_locker_ids || []).map((id) => numbers[id])
            },
            error: null
          };
        }
        return { data: null, error: null };
      }
    };
    return window.kosLoadLockers();
  });

  const card = page.locator("#deskTravel #lockerCard");
  const held = card.locator("#lockerHeld");
  await expect(held).toBeVisible();
  await expect(held.locator("h3")).toHaveText("My lockers");
  await expect(held).toContainText("Locker RS1");
  await expect(held).toContainText("Locker RS2");
  await expect(held).toContainText("Small");
  await expect(held).toContainText("Tim Fitz");
  await expect(held).toContainText("Debbie Fitz");
  await expect(held.locator("#lockerHeldQty")).toHaveText("You have 2 small lockers. You can pay for all of them in one checkout. On the Zeffy page, set the quantity to 2.");
  await expect(held).not.toContainText("\u2014");
  await expect(held.locator("button", { hasText: "Renew for next season" })).toHaveCount(2);
  await expect(card.locator("button", { hasText: "Free" })).toHaveCount(0);
  await expect(card.locator("[data-free]")).toHaveCount(0);
  await expect(card.locator("#lkSize")).not.toContainText("available");
  await expect(card.locator("#lockerMine")).toContainText("Use My lockers above to renew one you already have.");

  const renew = held.locator("button", { hasText: "Renew for next season" }).first();
  const tone = await renew.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, opacity: cs.opacity, backgroundImage: cs.backgroundImage };
  });
  expect(tone.color, "Renew label must be white on the green button").toBe("rgb(255, 255, 255)");
  expect(Number(tone.opacity)).toBe(1);
  expect(tone.backgroundImage).toContain("rgb(43, 139, 81)");

  await held.locator('button[aria-label="Renew locker RS2 for next season"]').click();
  await expect.poll(async () => page.evaluate(() => window.__kosRenewal && window.__kosRenewal.p_locker_ids)).toEqual(["rs2", "rs1"]);
  await expect.poll(async () => page.evaluate(() => window.__kosOpened)).toBe(SMALL_URL);
  await expect(held.locator("#lockerRenewMsg")).toContainText("Renewal saved for RS2 and RS1.");
  await expect(held.locator("#lockerRenewMsg")).toContainText("Set the quantity to 2");
  await expect(held.locator("#lockerRenewMsg")).toContainText("RS2 is marked paid first.");
  await expect(held.locator("#lockerRenewMsg")).not.toContainText("\u2014");
  assertHealthy(expect, report, "renew held lockers");
});

test("One large locker renews on the large Zeffy link, and a paid renewal cannot be bought again", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page);
  await page.locator('[data-hub-tab="parade"]').click();
  await page.evaluate(() => {
    window.__kosRenewal = null;
    window.__kosOpened = null;
    window.open = function () {
      var loc = {};
      Object.defineProperty(loc, "href", {
        set: function (v) { window.__kosOpened = v; }
      });
      return { location: loc, close: function () {} };
    };
    window.__kosSb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "doug" } } } }) },
      from() {
        function query(rows) {
            const builder = {
              order() { return builder; },
              eq() { return builder; },
              in() { return builder; },
              gte() { return builder; },
              lte() { return builder; },
              limit() { return builder; },
              or() { return builder; },
              then(onFulfilled, onRejected) {
                return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
              }
            };
            return builder;
          }
          return { select() { return query([]); } };
      },
      rpc: async (name, args) => {
        if (name === "locker_availability") return { data: { small: 1, large: 1 }, error: null };
        if (name === "my_locker_reservations") return { data: [], error: null };
        if (name === "my_held_lockers") {
          return {
            data: [
              { id: "rl7", locker_number: "RL7", size: "large", status: "paid", holder_name: "Doug Tully", renewal_open: false, renewal_paid: false },
              { id: "rs4", locker_number: "RS4", size: "small", status: "assigned", holder_name: "Perkins", renewal_open: false, renewal_paid: true }
            ],
            error: null
          };
        }
        if (name === "member_request_locker_renewal") {
          window.__kosRenewal = args;
          return { data: { ok: true, locker_numbers: ["RL7"] }, error: null };
        }
        return { data: false, error: null };
      }
    };
    return window.kosLoadLockers();
  });

  const held = page.locator("#lockerHeld");
  await expect(held).toBeVisible();
  await expect(held.locator("#lockerHeldQty")).toBeEmpty();
  await expect(held.locator('button[aria-label="Renew locker RL7 for next season"]')).toBeVisible();
  const paid = held.locator("button", { hasText: "Paid for next season" });
  await expect(paid).toBeDisabled();
  await expect(paid).not.toHaveAttribute("data-renew-locker", /.+/);
  const paidTone = await paid.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, opacity: cs.opacity };
  });
  expect(paidTone.color).toBe("rgb(255, 255, 255)");
  expect(Number(paidTone.opacity)).toBe(1);

  await held.locator('button[aria-label="Renew locker RL7 for next season"]').click();
  await expect.poll(async () => page.evaluate(() => window.__kosRenewal && window.__kosRenewal.p_locker_ids)).toEqual(["rl7"]);
  await expect.poll(async () => page.evaluate(() => window.__kosOpened)).toBe(LARGE_URL);
  await expect(held.locator("#lockerRenewMsg")).toContainText("Renewal saved for RL7.");
  await expect(held.locator("#lockerRenewMsg")).not.toContainText("quantity");
  assertHealthy(expect, report, "single locker renewal");
});

test("An open renewal stays on the locker row and is not marked paid by itself", async ({ page }) => {
  const report = watchPage(page);
  await unlockMemberHub(page, { role: { officer: true, canManageEvents: true } });
  await page.locator('[data-hub-tab="officer"]').click();
  await expect(page.locator("#hubLockers")).toBeAttached();
  await page.evaluate(() => {
    window.kosPaintLockerOfficer({
      urls: {
        small: "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small",
        large: "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large",
        smallCampaign: "Krewe locker rental – Small",
        largeCampaign: "Krewe locker rental – Large"
      },
      lockers: [
        { id: "rs1", locker_number: "RS1", size: "small", holder_name: "Riley Chen", status: "assigned", paid: true, paid_at: "2026-10-04T16:00:00.000Z", amount_cents: 7500, payment_id: "22222222-2222-4222-8222-222222222222", source: "Zeffy", renewal_open: true },
        { id: "rs10", locker_number: "RS10", size: "small", holder_name: null, status: "available", paid: false }
      ],
      waiting: []
    });
  });
  await page.locator('#deskOff-gear [data-tool="tool:hubLockers"]').click();
  const row = page.locator("#hubLockerRows tr").filter({ hasText: "Riley Chen" });
  await expect(row).toContainText("Assigned, renewal open");
  await expect(row).toContainText("Oct 4, 2026");
  await expect(row.locator("button", { hasText: "Mark paid" })).toHaveCount(0);
  await expect(page.locator("#hubLockerWaiting")).toContainText("Nobody is waiting");
  await expect(page.locator("#hubLockers")).not.toContainText("\u2014");
  assertHealthy(expect, report, "renewal stays on the locker");
});
