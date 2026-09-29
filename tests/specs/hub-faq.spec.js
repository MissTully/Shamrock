// Member FAQ lives on the Member desk, not on the public site.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const FACTS = [
  "Please register for all upcoming events",
  "12 volunteer hours are required per member or $12 per hour",
  "This does change year to year",
  "No More Umbrellas",
  "New Life Warehouse",
  "CDC Tampa",
  "60 dozen of the standard 33' beads",
  "We will be participating unless the parade is cancelled",
  "THESE ARE NOT SHIPPED",
  "No smoking on the float"
];

async function faqText(page) {
  return page.locator("#hubFaq").evaluate((el) => el.textContent || "");
}

async function unlockOnFaq(page, hash) {
  await page.goto("/members.html#" + hash);
  await page.evaluate(() => {
    const auth = document.getElementById("authStage");
    if (auth) auth.style.display = "none";
    const content = document.getElementById("memberContent");
    if (content) content.style.display = "block";
    if (window.kosUnlock) window.kosUnlock();
  });
  await page.waitForSelector("#hubRoot");
  await expect(page.locator("#hubFaq")).toBeVisible();
  await expect(page.locator("[data-hub-panel='parade']")).toHaveClass(/hub-on/);
  await expect(page.locator("[data-hub-panel='parade']")).toHaveClass(/desk-faq-on/);
}

test.describe("Member desk FAQ", () => {
  test("FAQ chip opens the tab and topic pills swap sections without scrolling", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.locator('[data-hub-tab="parade"]').click();
    await expect(page.locator("#deskHero")).toBeVisible();
    await expect(page.locator('#deskHero [data-desk-goto="deskFaq"]')).toBeVisible();
    await expect(page.locator("#hubFaq")).toBeHidden();

    await page.locator('#deskHero [data-desk-goto="deskFaq"]').click();
    await expect(page.locator("#hubFaq")).toBeVisible();
    await expect(page.locator("#hubFaq h3.faq-title")).toHaveText("Frequently Asked Questions");
    await expect(page.locator('[data-faq-section="events"]')).toBeVisible();
    await expect(page.locator('[data-faq-section="beads"]')).toBeHidden();
    await expect(page.locator('[data-faq-pill="events"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/#faq$/);

    const before = await page.evaluate(() => ({
      y: window.scrollY,
      panel: (document.querySelector("[data-hub-panel='parade']") || {}).scrollTop || 0
    }));
    await page.locator('[data-faq-pill="beads"]').click();
    await expect(page.locator('[data-faq-section="beads"]')).toBeVisible();
    await expect(page.locator('[data-faq-section="events"]')).toBeHidden();
    await expect(page.locator('[data-faq-pill="beads"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/#faq-beads$/);
    const after = await page.evaluate(() => ({
      y: window.scrollY,
      panel: (document.querySelector("[data-hub-panel='parade']") || {}).scrollTop || 0
    }));
    expect(after.y).toBe(before.y);
    expect(after.panel).toBe(before.panel);

    await page.locator('[data-faq-pill="guests"]').click();
    await expect(page.locator('[data-faq-section="guests"]')).toBeVisible();
    await expect(page.locator('[data-faq-section="guests"] h2')).toHaveText("Guests, conduct, and security");
    await expect(page).toHaveURL(/#faq-guests$/);

    const text = await faqText(page);
    for (const fact of FACTS) expect(text).toContain(fact);
    expect(text).not.toContain("Toys for the Flight");
    expect(text).not.toContain("please log in for full access");
    expect(text).not.toContain("\u2014");
    await expect(page.locator('#hubFaq a[href="https://kreweofshamrock2025.itemorder.com/shop/home/"]')).toBeAttached();
    await expect(page.locator('#hubFaq a[href="https://studio19shop.com/shop/ols/categories/krewe-of-shamrock"]')).toBeAttached();
    await expect(page.locator('#hubFaq a[href="http://www.buccaneerbeads.net"]')).toBeAttached();
    assertHealthy(expect, report, "faq tab");
  });

  test("Home quick link opens the FAQ tab", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page);
    await page.locator('[data-hub-goto="faq"]').click();
    await expect(page.locator("#hubFaq")).toBeVisible();
    await expect(page.locator('[data-faq-section="events"]')).toContainText("Please register for all upcoming events");
    assertHealthy(expect, report, "faq quick link");
  });

  test("#faq and #faq-beads land on the FAQ tab after the hub opens", async ({ page }) => {
    const report = watchPage(page);
    await page.goto("/members.html#faq");
    await expect(page.locator("#authStage")).toBeVisible();
    await expect(page.locator("#hubFaq")).toBeHidden();

    await unlockOnFaq(page, "faq");
    await expect(page).toHaveURL(/members\.html#faq$/);
    await expect(page.locator('[data-faq-section="events"]')).toBeVisible();
    await expect(page.locator('[data-faq-section="beads"]')).toBeHidden();

    await unlockOnFaq(page, "faq-beads");
    await expect(page).toHaveURL(/#faq-beads$/);
    await expect(page.locator('[data-faq-section="beads"]')).toBeVisible();
    await expect(page.locator('[data-faq-section="beads"]')).toContainText("Buccaneer Beads");
    await expect(page.locator('[data-faq-section="events"]')).toBeHidden();
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBe(0);
    assertHealthy(expect, report, "faq deep link");
  });

  test("faq.html redirects to the hub FAQ and public pages no longer link it", async ({ page, request }) => {
    const report = watchPage(page);
    const html = await (await request.get("/faq.html")).text();
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('content="0; url=members.html#faq"');
    expect(html).toContain('location.replace("members.html#faq")');
    expect(html).toContain('href="members.html#faq"');
    expect(html).not.toContain("please log in for full access");
    expect(html).not.toContain("No More Umbrellas");

    await page.goto("/faq.html");
    await expect(page).toHaveURL(/\/members\.html#faq$/);
    await expect(page.locator("#authStage")).toBeVisible();

    const home = await (await request.get("/index.html")).text();
    expect(home).not.toContain("faq.html");
    const learn = await (await request.get("/learn.html")).text();
    expect(learn).toContain('href="members.html#faq"');
    expect(learn).not.toContain("faq.html");
    assertHealthy(expect, report, "faq redirect");
  });
});
