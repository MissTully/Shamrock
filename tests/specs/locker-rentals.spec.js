// Locker rentals: Zeffy pay links, FCFS form, and the officer queue shell.
// Does not submit a real reservation. The live database is not mutated.
const { test, expect } = require("@playwright/test");
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
  await expect(card.locator("#lockerIntro")).toContainText("Join the list first");
  await expect(card.locator("#lockerIntro")).not.toContainText("\u2014");

  await page.evaluate(() => {
    window.__kosSb = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from() {
        return { select: async () => ({ data: [], error: null }) };
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
  await expect(page.locator("#lockerMine")).toContainText("You are not on the list yet.");
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
        return {
          select: async () => ({ data: [], error: null }),
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

test("Officer locker desk lists the queue and the Zeffy links", async ({ page }) => {
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
      inventory: [
        { id: "a", locker_number: "LL2", size: "large", holder_name: null, status: "available" },
        { id: "b", locker_number: "LL1", size: "large", holder_name: "Lisa & Stephanie", status: "assigned" },
        { id: "c", locker_number: "RS10", size: "small", holder_name: null, status: "available" },
        { id: "d", locker_number: "RS1", size: "small", holder_name: "Tim Fitz", status: "paid" }
      ],
      reservations: [
        {
          id: "q1",
          requester_name: "Queue Member",
          requester_email: "queue.member@example.com",
          size: "small",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-30T12:00:00Z"
        }
      ]
    });
  });
  await page.locator('#deskOff-gear [data-tool="tool:hubLockers"]').click();
  await expect(page.locator("#hubLockers")).toBeVisible();
  await expect(page.locator("#hubLockerSmallUrl")).toHaveValue(SMALL_URL);
  await expect(page.locator("#hubLockerLargeUrl")).toHaveValue(LARGE_URL);
  await expect(page.locator("#hubLockerCampaigns")).toContainText("Krewe locker rental – Small");
  await expect(page.locator("#hubLockerCounts")).toHaveText("1 large available, 1 small available.");
  await expect(page.locator("#hubLockerQueue")).toContainText("Queue Member");
  await expect(page.locator("#hubLockerQueue")).toContainText("Assign");
  await expect(page.locator("#hubLockerInventory")).toContainText("LL2");
  await expect(page.locator("#hubLockerInventory")).toContainText("Open");
  await expect(page.locator("#hubLockerInventory")).toContainText("Tim Fitz");
  assertHealthy(expect, report, "officer locker queue");
});

test("Reservation names come from the roster, and paid inventory hides the waiting actions", async ({ page }) => {
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
      members: [
        { id: "doug", first_name: "Douglas", last_name: "Tully", email: "Dougtully@protonmail.com" },
        { id: "jim", first_name: "Jim", last_name: "Sugrue", email: "jimsugruemtm@gmail.com" },
        { id: "kim", first_name: "Kim", last_name: "Kelly", email: "kellykmk8@gmail.com" },
        { id: "chuck", first_name: "Chuck", last_name: "Powers", email: "chuckpowers11@aol.com" }
      ],
      profiles: [
        { member_id: "doug", full_name: null, first_name: "Douglas", last_name: "Tully" },
        { member_id: "kim", full_name: "kellykmk8@gmail.com", first_name: null, last_name: null }
      ],
      inventory: [
        { id: "ll1", locker_number: "LL1", size: "large", holder_name: "Lisa & Stephanie", status: "assigned" },
        { id: "ll2", locker_number: "LL2", size: "large", holder_name: null, status: "available" },
        { id: "rl7", locker_number: "RL7", size: "large", holder_name: "Doug Tully", status: "paid" },
        { id: "rl4", locker_number: "RL4", size: "large", holder_name: "Chuck Powers", status: "assigned" },
        { id: "rs6", locker_number: "RS6", size: "small", holder_name: "Jim & Lisa Sugrue", status: "paid" },
        { id: "rs10", locker_number: "RS10", size: "small", holder_name: null, status: "available" }
      ],
      reservations: [
        {
          id: "doug",
          requester_name: "dougtully@protonmail.com",
          requester_email: "dougtully@protonmail.com",
          member_id: "doug",
          size: "small",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-13T01:17:08Z"
        },
        {
          id: "jim",
          requester_name: "jimsugruemtm@gmail.com",
          requester_email: "jimsugruemtm@gmail.com",
          member_id: "jim",
          size: "small",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-14T23:18:08Z"
        },
        {
          id: "kim",
          requester_name: "kellykmk8@gmail.com",
          requester_email: "kellykmk8@gmail.com",
          member_id: "kim",
          size: "large",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-15T18:27:43Z"
        },
        {
          id: "chuck",
          requester_name: "chuckpowers11@aol.com",
          requester_email: "chuckpowers11@aol.com",
          member_id: "chuck",
          size: "large",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-12T12:00:00Z"
        },
        {
          id: "noname",
          requester_name: "noname@example.com",
          requester_email: "noname@example.com",
          member_id: null,
          size: "small",
          status: "queued",
          paid_at: null,
          locker_id: null,
          created_at: "2026-09-16T00:00:00Z"
        }
      ]
    });
  });
  await page.locator('#deskOff-gear [data-tool="tool:hubLockers"]').click();
  const row = (email) => page.locator("#hubLockerQueue tr").filter({ hasText: email });
  const doug = row("dougtully@protonmail.com");
  await expect(doug.locator("td").nth(1)).toHaveText("Douglas Tully");
  await expect(doug.locator("td").nth(0)).toHaveText("");
  await expect(doug.locator("td").nth(4)).toHaveText("Yes");
  await expect(doug.locator("td").nth(5)).toHaveText("RL7");
  await expect(doug.locator("button")).toHaveCount(0);
  await expect(doug.locator("select")).toHaveCount(0);

  const jim = row("jimsugruemtm@gmail.com");
  await expect(jim.locator("td").nth(1)).toHaveText("Jim Sugrue");
  await expect(jim.locator("td").nth(4)).toHaveText("Yes");
  await expect(jim.locator("td").nth(5)).toHaveText("RS6");
  await expect(jim.locator("button")).toHaveCount(0);

  const kim = row("kellykmk8@gmail.com");
  await expect(kim.locator("td").nth(1)).toHaveText("Kim Kelly");
  await expect(kim.locator("td").nth(0)).toHaveText("1");
  await expect(kim.locator("td").nth(4)).toHaveText("No");
  await expect(kim.locator("td").nth(5)).toHaveText("");
  await expect(kim.locator("button", { hasText: "Mark paid" })).toBeVisible();
  await expect(kim.locator("button", { hasText: "Assign" })).toBeVisible();
  await expect(kim.locator("select")).toContainText("LL2");
  await expect(kim.locator("select")).not.toContainText("LL1");
  await expect(kim.locator("select")).not.toContainText("RL7");

  const chuck = row("chuckpowers11@aol.com");
  await expect(chuck.locator("td").nth(1)).toHaveText("Chuck Powers");
  await expect(chuck.locator("td").nth(0)).toHaveText("");
  await expect(chuck.locator("td").nth(4)).toHaveText("No");
  await expect(chuck.locator("td").nth(5)).toHaveText("RL4");
  await expect(chuck.locator("button", { hasText: "Mark paid" })).toHaveAttribute("data-mark-locker", "rl4");
  await expect(chuck.locator("button", { hasText: "Assign" })).toHaveCount(0);
  await expect(chuck.locator("select")).toHaveCount(0);

  const noname = row("noname@example.com");
  await expect(noname.locator("td").nth(1)).toHaveText("noname@example.com");
  await expect(noname.locator("td").nth(0)).toHaveText("1");
  await expect(noname.locator("td").nth(4)).toHaveText("No");
  await expect(noname.locator("button", { hasText: "Assign" })).toBeVisible();

  await expect(page.locator("#hubLockerInventory")).toContainText("Lisa & Stephanie");
  await expect(page.locator("#hubLockerInventory")).toContainText("Doug Tully");
  await expect(page.locator("#hubLockerQueue")).not.toContainText("\u2014");
  assertHealthy(expect, report, "reservation name and inventory sync");
});
