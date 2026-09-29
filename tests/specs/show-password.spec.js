// Show / Hide on every password field. Desktop is the wide castle door.
// Phone width is the compact door. Nothing here signs in or writes to Supabase.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

function revealBtn(page, inputId) {
  return page.locator(".kos-reveal:has(#" + inputId + ") button.kos-reveal-btn");
}

async function expectConcealed(input, btn) {
  await expect(input).toHaveAttribute("type", "password");
  await expect(btn).toHaveAttribute("type", "button");
  await expect(btn).toHaveAttribute("aria-label", "Show password");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(btn).toContainText("Show");
}

async function cycleToggle(input, btn) {
  await input.fill("CastleDoor");
  await btn.scrollIntoViewIfNeeded();
  await input.evaluate((el) => {
    el.focus();
    el.setSelectionRange(3, 6);
  });
  const before = await input.boundingBox();

  await btn.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue("CastleDoor");
  await expect(btn).toHaveAttribute("aria-label", "Hide password");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(btn).toContainText("Hide");
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([3, 6]);

  const shown = await input.boundingBox();
  expect(Math.abs(shown.x - before.x)).toBeLessThan(1);
  expect(Math.abs(shown.y - before.y)).toBeLessThan(1);
  expect(Math.abs(shown.width - before.width)).toBeLessThan(1);
  expect(Math.abs(shown.height - before.height)).toBeLessThan(1);

  await btn.click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue("CastleDoor");
  await expect(btn).toHaveAttribute("aria-label", "Show password");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(btn).toContainText("Show");
  await expect(input).toBeFocused();
  const hidden = await input.boundingBox();
  expect(Math.abs(hidden.y - before.y)).toBeLessThan(1);
  expect(Math.abs(hidden.height - before.height)).toBeLessThan(1);
}

function describeViewport(label, width, height, phone) {
  test.describe("show password (" + label + ")", () => {
    test.use({ viewport: { width: width, height: height } });

    test("toggles each Hub password field without submitting", async ({ page }) => {
      const report = watchPage(page);
      await page.goto("/members.html");

      const signIn = page.locator("#siPassword");
      const signBtn = revealBtn(page, "siPassword");
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute("autocomplete", "current-password");
      await expectConcealed(signIn, signBtn);
      if (phone) {
        const box = await signBtn.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      await page.evaluate(() => {
        window.__kosPwSubmits = 0;
        document.getElementById("signinForm").addEventListener("submit", () => {
          window.__kosPwSubmits += 1;
        });
      });
      await signBtn.click();
      expect(await page.evaluate(() => window.__kosPwSubmits)).toBe(0);
      await expect(page.locator("#signinMsg")).toHaveText("");
      await signBtn.click();

      await cycleToggle(signIn, signBtn);
      expect(await page.evaluate(() => window.__kosPwSubmits)).toBe(0);

      await signIn.focus();
      await page.keyboard.press("Tab");
      await expect(signBtn).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(signIn).toHaveAttribute("type", "text");
      expect(await page.evaluate(() => window.__kosPwSubmits)).toBe(0);
      await page.keyboard.press("Tab");
      await expect(signBtn).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(signIn).toHaveAttribute("type", "password");

      await signBtn.click();
      await expect(signIn).toHaveAttribute("type", "text");
      await page.evaluate(() => {
        document.getElementById("signinForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect(signIn).toHaveAttribute("type", "password");
      await expect(signBtn).toHaveAttribute("aria-pressed", "false");
      await expect(signIn).toHaveValue("CastleDoor");

      await signBtn.click();
      await page.evaluate(() => {
        document.getElementById("authPanelSignin").style.display = "none";
      });
      await expect(signIn).toHaveAttribute("type", "password");
      await page.evaluate(() => {
        document.getElementById("authPanelSignin").style.display = "block";
      });
      await expect(signBtn).toHaveAttribute("aria-label", "Show password");

      await page.evaluate(() => {
        document.getElementById("authStage").style.display = "none";
        document.getElementById("setPasswordStage").style.display = "flex";
      });
      const next = page.locator("#newPassword");
      const nextBtn = revealBtn(page, "newPassword");
      await expect(next).toBeVisible();
      await expect(next).toHaveAttribute("autocomplete", "new-password");
      await expect(next).toHaveAttribute("minlength", "8");
      await expectConcealed(next, nextBtn);
      if (phone) {
        const box = await nextBtn.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await cycleToggle(next, nextBtn);
      await next.fill("short");
      await nextBtn.click();
      await expect(next).toHaveAttribute("type", "text");
      await page.evaluate(() => {
        document.getElementById("setPasswordForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect(next).toHaveAttribute("type", "password");
      await expect(nextBtn).toHaveAttribute("aria-label", "Show password");

      await page.evaluate(() => {
        document.getElementById("setPasswordStage").style.display = "none";
        const form = document.createElement("form");
        form.id = "dynPwForm";
        form.innerHTML = '<input id="dynPassword" type="password" autocomplete="new-password" />' +
          '<input id="dynConfirm" type="password" autocomplete="new-password" />' +
          '<button type="submit">Save</button>';
        form.style.cssText = "position:relative;z-index:10001;background:#fff;padding:12px;";
        document.body.appendChild(form);
      });
      const first = page.locator("#dynPassword");
      const second = page.locator("#dynConfirm");
      const firstBtn = revealBtn(page, "dynPassword");
      const secondBtn = revealBtn(page, "dynConfirm");
      await expectConcealed(first, firstBtn);
      await expectConcealed(second, secondBtn);
      await expect(first).toHaveAttribute("autocomplete", "new-password");
      await expect(second).toHaveAttribute("autocomplete", "new-password");
      await firstBtn.click();
      await expect(first).toHaveAttribute("type", "text");
      await expect(second).toHaveAttribute("type", "password");
      await secondBtn.click();
      await expect(second).toHaveAttribute("type", "text");
      await expect(first).toHaveAttribute("type", "text");
      await page.evaluate(() => {
        document.getElementById("dynPwForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect(first).toHaveAttribute("type", "password");
      await expect(second).toHaveAttribute("type", "password");
      await expect(firstBtn).toHaveAttribute("aria-pressed", "false");
      await expect(secondBtn).toHaveAttribute("aria-pressed", "false");

      assertHealthy(expect, report, "show password " + label);
    });
  });
}

describeViewport("desktop", 1280, 900, false);
describeViewport("phone", 390, 844, true);
