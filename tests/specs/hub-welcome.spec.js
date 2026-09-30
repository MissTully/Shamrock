// Hub welcome ("Fáilte, new friend!") is onboarding until My Krewe profile
// has any directory detail. Roster name, phone, and address do not count.
// Offline: this never signs in or writes to the live database.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const EMPTY = {
  user_id: "00000000-0000-4000-8000-000000000001",
  member_id: "00000000-0000-4000-8000-000000000002",
  email: "newmember@example.com",
  first_name: "New",
  last_name: "Member",
  display_name: "New Member",
  phone: "813-555-0100",
  street_address: "1 Bayshore Blvd",
  city: "Tampa",
  state: "FL",
  zip: "33606",
  profile_complete: true,
  profile_visible: true
};

async function ready(page) {
  await unlockMemberHub(page, { hash: "home" });
  await page.waitForFunction(() =>
    typeof window.kosShowLepWelcome === "function" &&
    typeof window.kosMemberHasProfileInfo === "function" &&
    typeof window.kosEditMyProfile === "function"
  );
}

async function showFor(page, profile) {
  await page.evaluate((p) => {
    localStorage.removeItem("kosLepWelcome");
    localStorage.removeItem("kosLepWelcomeSeen");
    sessionStorage.removeItem("kosLepWelcomeDismissed");
    window.kosProfile = p;
    const who = document.getElementById("memberWho");
    if (who) who.innerHTML = '<span class="hub-signed-label">Signed in as New Member</span>';
    window.kosShowLepWelcome();
  }, profile);
}

test.describe("Hub welcome until Krewe profile has info", () => {
  test("shows for an empty profile, links to My Krewe profile, and hides once any detail is saved", async ({ page }) => {
    const report = watchPage(page);
    await ready(page);

    const flags = await page.evaluate((base) => {
      const has = window.kosMemberHasProfileInfo;
      return {
        empty: has(base),
        phone: has(Object.assign({}, base, { phone: "813-555-0199" })),
        address: has(Object.assign({}, base, { street_address: "9 Oak St", city: "Tampa" })),
        blank: has(Object.assign({}, base, { bio: "   ", hometown: "" })),
        hometown: has(Object.assign({}, base, { hometown: "Ybor City" })),
        photo: has(Object.assign({}, base, { photo_url: "https://example.com/face.jpg" })),
        year: has(Object.assign({}, base, { parade_since: 2014 })),
        birthday: has(Object.assign({}, base, { birthday: "1990-03-17" })),
        fact: has(Object.assign({}, base, { fun_fact: "I march with a tin whistle." })),
        hiddenFlag: has(Object.assign({}, base, { profile_visible: false }))
      };
    }, EMPTY);
    expect(flags.empty).toBe(false);
    expect(flags.phone).toBe(false);
    expect(flags.address).toBe(false);
    expect(flags.blank).toBe(false);
    expect(flags.hiddenFlag).toBe(false);
    expect(flags.hometown).toBe(true);
    expect(flags.photo).toBe(true);
    expect(flags.year).toBe(true);
    expect(flags.birthday).toBe(true);
    expect(flags.fact).toBe(true);

    await showFor(page, EMPTY);
    const overlay = page.locator("#lepOverlay");
    await expect(overlay).toHaveClass(/open/);
    await expect(page.getByRole("heading", { name: "Fáilte, new friend!" })).toBeVisible();
    await expect(page.locator("#lepBody")).toContainText("Top o' the mornin', New!");
    const link = page.locator("#lepProfileLink");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /members\.html#krewe/);
    await expect(page.locator("#lepGoProfile")).toBeVisible();

    await page.screenshot({ path: "/opt/cursor/artifacts/welcome-empty-profile.png", fullPage: false });

    // An old "seen" flag must not hide the greeting while the profile is still empty.
    await page.evaluate(() => {
      localStorage.setItem("kosLepWelcomeSeen", "1");
      localStorage.removeItem("kosLepWelcome");
      sessionStorage.removeItem("kosLepWelcomeDismissed");
      window.kosShowLepWelcome();
    });
    await expect(overlay).toHaveClass(/open/);

    await page.locator("#lepProfileLink").click();
    await expect(overlay).not.toHaveClass(/open/);
    await expect(page.locator("#hubProfileCard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit my profile" })).toBeVisible();
    await expect(page.locator("[data-hub-panel='krewe']")).toHaveClass(/hub-on/);

    await page.screenshot({ path: "/opt/cursor/artifacts/welcome-opens-profile.png", fullPage: false });

    // localStorage cannot force the modal once the roster profile has any detail.
    await page.evaluate((base) => {
      localStorage.setItem("kosLepWelcome", "1");
      localStorage.removeItem("kosLepWelcomeSeen");
      sessionStorage.removeItem("kosLepWelcomeDismissed");
      window.kosProfile = Object.assign({}, base, { hometown: "Tampa" });
      window.kosShowLepWelcome();
    }, EMPTY);
    await expect(overlay).not.toHaveClass(/open/);
    await expect(overlay).toHaveAttribute("aria-hidden", "true");
    const stored = await page.evaluate(() => ({
      show: localStorage.getItem("kosLepWelcome"),
      seen: localStorage.getItem("kosLepWelcomeSeen")
    }));
    expect(stored.show).toBeNull();
    expect(stored.seen).toBe("1");

    await page.screenshot({ path: "/opt/cursor/artifacts/welcome-hidden-after-profile.png", fullPage: false });

    // The button CTA opens the same editor.
    await showFor(page, EMPTY);
    await expect(overlay).toHaveClass(/open/);
    await page.locator("#lepGoProfile").click();
    await expect(page.getByRole("heading", { name: "Edit my profile" })).toBeVisible();
    await expect(overlay).not.toHaveClass(/open/);

    assertHealthy(expect, report, "hub welcome");
  });
});
