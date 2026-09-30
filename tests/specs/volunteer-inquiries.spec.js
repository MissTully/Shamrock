// Public volunteer interest form and the Charity inbox on the Officer desk.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const SHOTS = "/opt/cursor/artifacts/screenshots";

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

const INQUIRIES = [
  {
    id: "vol-nia",
    created_at: "2026-09-28T15:04:00.000Z",
    full_name: "Nia Byrne",
    email: "nia.byrne@example.com",
    phone: "813-555-0142",
    affiliation: "other_krewe",
    other_krewe_name: "Ye Mystic Krewe",
    interests: "Warehouse move on a Saturday morning.",
    notes: "I can lift furniture.",
    status: "new"
  },
  {
    id: "vol-pat",
    created_at: "2026-09-20T15:04:00.000Z",
    full_name: "Pat Neighbor",
    email: "pat.neighbor@example.com",
    phone: "813-555-0177",
    affiliation: "neither",
    interests: "Charity partner day.",
    status: "contacted",
    officer_note: "Called Tuesday."
  }
];

test.describe("Volunteer interest", () => {
  test("the public page asks for interest and still links hours to the Hub", async ({ page }) => {
    const report = watchPage(page);
    let posted = null;
    await page.route("**/rest/v1/rpc/submit_volunteer_inquiry", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "Thank you. The Charity committee will follow up." })
      });
    });

    await page.goto("/volunteer.html");
    const band = page.locator("#lendAHand");
    await expect(band.locator("h2")).toHaveText("Lend a Hand");
    await expect(band).toContainText("Members, friends from other krewes, and neighbors who want to help Tampa Bay kids and families.");
    await expect(band).toContainText("The Krewe welcomes volunteers for charity partner days, warehouse moves, drives, and event help.");
    await expect(band).toContainText("Tell us you\u2019re interested and the Charity committee will follow up.");
    await expect(band).toContainText("Krewe members who already have Hub access can log completed hours below.");
    await expect(band.locator("a[href^='mailto:']")).toHaveCount(0);
    const hours = band.locator("#volunteerHoursLink");
    await expect(hours).toHaveText("Log volunteer hours");
    await expect(hours).toHaveAttribute("href", "members.html?hub=hours#hours");
    await expect(page.locator("#charity-grid, .charity-card").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "This Season's Core Charities" })).toBeVisible();
    await band.locator("#volunteerHoursLink").scrollIntoViewIfNeeded();
    await shot(page, "volunteer-cta.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await band.locator("#volunteerHoursLink").evaluate(function (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect(band.locator("#volunteerOpen")).toBeInViewport();
    await expect(band.locator("#volunteerHoursLink")).toBeInViewport();
    await shot(page, "volunteer-cta-mobile.png");
    await page.setViewportSize({ width: 1280, height: 900 });

    await band.getByRole("button", { name: "I\u2019d like to volunteer" }).click();
    const dialog = page.locator("#volunteerDialog");
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.locator("#volunteerSubmit").evaluate(function (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect(dialog.locator("#volunteerSubmit")).toBeInViewport();
    await shot(page, "volunteer-form-mobile.png");
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(dialog.locator("#volOtherWrap")).toBeHidden();
    await dialog.locator("#volAffiliation").selectOption("other_krewe");
    await expect(dialog.locator("#volOtherWrap")).toBeVisible();
    await dialog.locator("#volName").fill("Nia Byrne");
    await dialog.locator("#volEmail").fill("nia.byrne@example.com");
    await dialog.locator("#volPhone").fill("813-555-0142");
    await dialog.locator("#volOtherKrewe").fill("Ye Mystic Krewe");
    await dialog.locator("#volInterests").fill("Warehouse move on a Saturday morning.");
    await dialog.locator("#volNotes").fill("I can lift furniture.");
    const trapLeft = await dialog.locator(".vol-trap").evaluate(function (el) { return el.getBoundingClientRect().left; });
    expect(trapLeft).toBeLessThan(-1000);
    await shot(page, "volunteer-form.png");
    await dialog.locator("#volunteerSubmit").click();
    await expect(dialog.locator("#volunteerMessage")).toContainText("Thank you. The Charity committee will follow up.");
    expect(posted).toMatchObject({
      p_full_name: "Nia Byrne",
      p_email: "nia.byrne@example.com",
      p_phone: "813-555-0142",
      p_affiliation: "other_krewe",
      p_other_krewe_name: "Ye Mystic Krewe",
      p_interests: "Warehouse move on a Saturday morning.",
      p_notes: "I can lift furniture.",
      p_company_website: null
    });
    const html = await page.content();
    expect(html.toLowerCase()).not.toContain("jcarney");
    expect(html).not.toContain("Jeff Carney");
    assertHealthy(expect, report, "volunteer interest form");
  });
});

test.describe("Charity volunteer inbox", () => {
  test("officers who cannot review inquiries do not see the tool", async ({ page }) => {
    const report = watchPage(page);
    await unlockMemberHub(page, { role: { officer: true, canReviewVolunteerInquiries: false } });
    await expect(page.locator("#hubVolunteerHomeLink")).toHaveCount(0);
    await page.locator("[data-hub-tab='officer']").click();
    await expect(page.locator('[data-tool="tool:hubVolunteerInbox"]')).toHaveCount(0);
    assertHealthy(expect, report, "volunteer inbox hidden");
  });

  test("Charity Chair marks an inquiry contacted and done", async ({ page }) => {
    const report = watchPage(page);
    page.on("dialog", (dialog) => dialog.accept());
    await unlockMemberHub(page, {
      role: {
        officer: true,
        canReviewVolunteerInquiries: true,
        volunteerInquiries: INQUIRIES
      }
    });

    const home = page.locator("#hubVolunteerHomeLink");
    await expect(home).toBeVisible();
    await expect(home).toContainText("1 new volunteer inquiry");

    await page.locator("[data-hub-tab='officer']").click();
    // The desk rebuilds its tiles once after the tab opens.
    await page.waitForTimeout(200);
    const section = page.locator("#deskOff-charity");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Volunteer inquiries");
    await expect(section).toContainText("1 new person asked to help");
    await section.scrollIntoViewIfNeeded();
    await shot(page, "volunteer-inbox-section.png");
    await page.locator('#deskOff-charity [data-tool="tool:hubVolunteerInbox"]').click();

    const tool = page.locator("#hubVolunteerInbox");
    await expect(tool).toBeVisible();
    await expect(tool.locator("h2")).toHaveText("Volunteer inquiries");
    await expect(tool).toContainText("Nia Byrne");
    await expect(tool).toContainText("nia.byrne@example.com");
    await expect(tool).toContainText("813-555-0142");
    await expect(tool).toContainText("Friend from another krewe (Ye Mystic Krewe)");
    await expect(tool).toContainText("Warehouse move on a Saturday morning.");
    await expect(tool).toContainText("I can lift furniture.");
    await expect(tool).not.toContainText("Pat Neighbor");
    await shot(page, "volunteer-inbox-new.png");

    await tool.locator("[data-vol-contacted='vol-nia']").click();
    await expect(tool).toContainText("Marked contacted.");
    await expect(tool.locator("[data-vol-id='vol-nia']")).toHaveCount(0);
    await expect(page.locator("#hubVolunteerHomeLink")).toContainText("No new volunteer inquiries");

    await tool.locator("[data-vol-status='contacted']").click();
    await expect(tool).toContainText("Nia Byrne");
    await expect(tool).toContainText("Pat Neighbor");
    await tool.locator("#hubVolNote-vol-nia").fill("Left a voicemail.");
    await tool.locator("[data-vol-done='vol-nia']").click();
    await expect(tool).toContainText("Marked done.");
    await expect(tool.locator("[data-vol-id='vol-nia']")).toHaveCount(0);

    await tool.locator("[data-vol-status='done']").click();
    await expect(tool).toContainText("Nia Byrne");
    await expect(tool).toContainText("Left a voicemail.");
    await expect(tool).toContainText("Done");
    await shot(page, "volunteer-inbox-done.png");
    assertHealthy(expect, report, "volunteer inbox");
  });
});
