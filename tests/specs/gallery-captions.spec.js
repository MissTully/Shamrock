// Member photos lead the public gallery, with no section label.
// The Hub photo form keeps an optional caption under the picker.
const { test, expect } = require("@playwright/test");

test("gallery leads with member photos and has no submissions heading", async ({ page }) => {
  await page.goto("/gallery.html");
  await expect(page.getByRole("heading", { name: "Member submissions" })).toHaveCount(0);
  await expect(page.getByText("Photos shared by the krewe", { exact: false })).toHaveCount(0);
  const order = await page.evaluate(() => {
    const member = document.getElementById("memberGallery");
    const krewe = document.querySelector("main h2");
    if (!member || !krewe) return "missing";
    return member.compareDocumentPosition(krewe) & Node.DOCUMENT_POSITION_FOLLOWING ? "member-first" : "krewe-first";
  });
  expect(order).toBe("member-first");
  await expect(page.getByRole("heading", { name: "From the Krewe" })).toBeVisible();
});

test("photo form places an optional caption under the picker", async ({ page }) => {
  await page.goto("/share.html?type=photo");
  await page.evaluate(() => {
    const gate = document.getElementById("gate");
    if (gate) gate.style.display = "none";
    const main = document.getElementById("mainContent");
    if (main) main.style.display = "block";
  });
  const caption = page.locator("#pCaption");
  await expect(caption).toBeVisible();
  await expect(page.locator("label[for='pCaption']")).toHaveText(/Caption \(optional\)/i);
  await expect(caption).toHaveAttribute("maxlength", "240");
  const order = await page.evaluate(() => {
    const file = document.getElementById("dropPhoto");
    const preview = document.getElementById("photoPreviewWrap");
    const field = document.getElementById("pCaption");
    const fileBeforePreview = file.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING;
    const previewBeforeCaption = preview.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING;
    return !!(fileBeforePreview && previewBeforeCaption);
  });
  expect(order).toBe(true);
});
