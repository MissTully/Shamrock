// The history-page secondary CTA used the dark-band outline style, so
// "Service & Charity" rendered as white underlined text on cream.
const { test, expect } = require("./kos-fixtures");

const DARK_SURFACE = ".hero, .band-green, .page-head, .photo-band, .krewe-foot";

function contrastAgainst(color, background) {
  function channel(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  function lum(rgb) {
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }
  const L1 = lum(color);
  const L2 = lum(background);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("history Service & Charity is a readable secondary button", async ({ page }) => {
  await page.goto("/krewe-history.html");
  const charity = page.getByRole("link", { name: "Service & Charity" });
  const join = page.getByRole("link", { name: "Become a Member" });
  await expect(charity).toBeVisible();
  await expect(join).toBeVisible();
  await expect(charity).toHaveAttribute("href", "volunteer.html");
  await expect(charity).toHaveClass(/btn-outline-light/);
  await expect(charity).not.toHaveClass(/btn-outline(?!-light)/);
  await expect(join).toHaveClass(/btn-primary/);

  const measured = await charity.evaluate((el) => {
    const s = getComputedStyle(el);
    const pick = (value) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      const p = m[1].split(",").map((n) => parseFloat(n));
      return { r: p[0], g: p[1], b: p[2] };
    };
    let node = el;
    let background = null;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(",").map((n) => parseFloat(n));
        const alpha = p.length > 3 ? p[3] : 1;
        if (alpha >= 0.99) {
          background = { r: p[0], g: p[1], b: p[2] };
          break;
        }
      }
      node = node.parentElement;
    }
    return {
      color: pick(s.color),
      background,
      textDecorationLine: s.textDecorationLine,
      borderTopWidth: s.borderTopWidth,
      borderTopStyle: s.borderTopStyle,
      borderTopColor: pick(s.borderTopColor),
    };
  });

  expect(measured.background, "cream page background").toBeTruthy();
  expect(contrastAgainst(measured.color, measured.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrastAgainst(measured.borderTopColor, measured.background)).toBeGreaterThanOrEqual(3);
  expect(measured.textDecorationLine).not.toContain("underline");
  expect(parseFloat(measured.borderTopWidth)).toBeGreaterThanOrEqual(2);
  expect(measured.borderTopStyle).toBe("solid");
});

const OUTLINE_PAGES = [
  "index.html",
  "volunteer.html",
  "tartan-ball.html",
  "tartan-ball-sponsors.html",
  "parades.html",
];

for (const file of OUTLINE_PAGES) {
  test(`${file} keeps white outline buttons on dark surfaces`, async ({ page }) => {
    await page.goto("/" + file);
    const misplaced = await page.locator("a.btn-outline").evaluateAll((els, dark) => {
      return els
        .filter((el) => !el.closest(dark))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
    }, DARK_SURFACE);
    expect(misplaced, "btn-outline on a light section").toEqual([]);
  });
}
