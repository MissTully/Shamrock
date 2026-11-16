const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

test("home page highlights a live featured event and skips one that has ended", async ({ page }) => {
  const report = watchPage(page);
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await page.route("**/storage/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
    });
  });
  await page.route("**/rest/v1/v_public_events*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Past Ceili",
          event_type: "social",
          start_time: past,
          end_time: past,
          location: "Old hall",
          status: "published",
          is_public: true,
          is_featured: true
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Shamrock Social",
          event_type: "social",
          start_time: future,
          end_time: null,
          location: "Tampa",
          status: "published",
          is_public: true,
          is_featured: true,
          members_only: false,
          flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/shamrock-social.png"
        }
      ])
    });
  });
  await page.goto("/index.html");
  await expect(page.locator("#featuredEventBand")).toBeVisible();
  await expect(page.locator("#featuredEventCard")).toContainText("Shamrock Social");
  await expect(page.locator("#featuredEventCard")).toContainText("Featured event");
  await expect(page.locator("#featuredEventCard")).not.toContainText("Past Ceili");
  const flyer = page.locator("#featuredEventCard img.featured-flyer");
  await expect(flyer).toBeVisible();
  await expect(flyer).toHaveAttribute("alt", "Flyer for Shamrock Social");
  await expect(flyer).toHaveAttribute("src", /\/storage\/v1\/render\/image\/public\/event-flyers\/shamrock-social\.png\?width=800&height=1600&resize=contain&quality=60&format=webp/);
  await expect(flyer).toHaveAttribute("data-full", /\/storage\/v1\/object\/public\/event-flyers\/shamrock-social\.png$/);
  await expect(page.locator("#eventList")).toContainText("Shamrock Social");
  await expect(page.locator("#eventList .event-card.is-featured")).toContainText("Shamrock Social");
  await expect(page.locator("#eventList")).not.toContainText("Past Ceili");
  assertHealthy(expect, report, "home featured event card");
});
