// Castle door: first-time helper wrap, sign-in errors, and the reset-mail note.
// Roster and password calls are stubbed. Nothing here writes to Supabase.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

const NOT_ON_ROSTER =
  "That email is not on the krewe roster. Use the address the krewe has for you, apply on the Join page, or write digital@kreweofshamrock.com.";
const WRONG_PASSWORD =
  "That password is wrong. Old Wild Apricot passwords do not work here. Tap Create or reset your password to get a new link.";
const MAILED_AFTER_OLD_PASSWORD =
  "That password will not work. Old Wild Apricot passwords do not work here. We emailed a link to create your Hub password. Check spam or junk. It can take a few minutes.";
const MAIL_NOTE =
  "Password emails can take a few minutes. If you do not see one, check spam or junk.";

function revealBtn(page, inputId) {
  return page.locator(".kos-reveal:has(#" + inputId + ") button.kos-reveal-btn");
}

async function openGuide(page) {
  await page.goto("/members.html");
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  await expect(page.locator("#authStage")).toBeVisible();
  const guide = page.locator("#castleGuide");
  await guide.evaluate((el) => {
    el.open = true;
  });
  await expect(page.locator("#castleGuide .guide-label")).toBeVisible();
  await expect(guide).toContainText("First time at the castle door? Start here");
  await expect(guide).toContainText("Use your roster email");
  await expect(guide).toContainText("Need a password?");
  await expect(guide).toContainText("digital@kreweofshamrock.com");
  return guide;
}

async function guideWrapIssues(page) {
  return page.locator("#castleGuide").evaluate((guide) => {
    const issues = [];
    const guideRect = guide.getBoundingClientRect();
    if (guide.scrollWidth > guide.clientWidth + 2) {
      issues.push("guide overflows by " + (guide.scrollWidth - guide.clientWidth) + "px");
    }
    const checked = guide.querySelectorAll(
      "summary, .guide-label, .guide-copy, .guide-step p, .guide-step h3, .guide-inside, .guide-help, .guide-cta"
    );
    checked.forEach((node) => {
      const style = getComputedStyle(node);
      const name = node.className || node.tagName;
      if (style.textAlign === "justify") issues.push("justified " + name);
      if (style.wordBreak === "break-all") issues.push("break-all " + name);
      if (style.hyphens === "auto") issues.push("auto hyphens " + name);
      if (node.scrollWidth > node.clientWidth + 2) {
        issues.push("overflow " + name + " +" + (node.scrollWidth - node.clientWidth));
      }
    });

    const roots = guide.querySelectorAll(".guide-label, .guide-copy, .guide-inside, .guide-help");
    roots.forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const words = [];
      let n;
      while ((n = walker.nextNode())) {
        const text = n.textContent || "";
        const re = /\S+/g;
        let m;
        while ((m = re.exec(text))) {
          const range = document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
          if (!rects.length) continue;
          if (rects.length > 1) {
            const wordWidth = rects.reduce((sum, r) => sum + r.width, 0);
            const parent = n.parentElement;
            const parentWidth = parent ? parent.clientWidth : root.clientWidth;
            if (parentWidth > 0 && wordWidth + 8 < parentWidth) issues.push("mid-word break: " + m[0]);
          }
          rects.forEach((r) => {
            if (r.right > guideRect.right + 2 || r.left < guideRect.left - 2) {
              issues.push("clipped word: " + m[0]);
            }
          });
          const box = rects[0];
          words.push({ text: m[0], top: box.top, left: box.left, right: box.right });
        }
      }
      let prev = null;
      words.forEach((word) => {
        if (prev && Math.abs(word.top - prev.top) < 8 && word.left + 1 >= prev.left) {
          const gap = word.left - prev.right;
          if (gap > 18) {
            issues.push("wide gap " + Math.round(gap) + "px: " + prev.text + " | " + word.text);
          }
        }
        prev = word;
      });
    });
    return issues;
  });
}

function describeDoor(label, width, height) {
  test.describe("castle door (" + label + ")", () => {
    test.use({ viewport: { width: width, height: height } });

    test("first-time helper wraps cleanly", async ({ page }) => {
      const report = watchPage(page);
      await openGuide(page);
      const issues = await guideWrapIssues(page);
      expect(issues, "wrap issues at " + width).toEqual([]);
      const labelBox = await page.locator(".guide-label").boundingBox();
      const guideBox = await page.locator("#castleGuide").boundingBox();
      expect(labelBox.width).toBeLessThanOrEqual(guideBox.width);
      expect(labelBox.x).toBeGreaterThanOrEqual(guideBox.x - 1);
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(guideBox.x + guideBox.width + 1);
      assertHealthy(expect, report, "castle guide " + label);
    });

    test("create or reset password screen shows the delay and spam note", async ({ page }) => {
      const report = watchPage(page);
      await page.goto("/members.html");
      await page.locator("#showResetBtn").click();
      const note = page.locator("#resetMailNote");
      await expect(page.locator("#authPanelReset")).toBeVisible();
      await expect(page.locator("#authPanelSignin")).toBeHidden();
      await expect(note).toBeVisible();
      await expect(note).toHaveText(MAIL_NOTE);
      await expect(note).not.toContainText("\u2014");
      const noteBox = await note.boundingBox();
      const cardBox = await page.locator("#authStage .auth-card").boundingBox();
      expect(noteBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      assertHealthy(expect, report, "reset mail note " + label);
    });
  });
}

describeDoor("phone", 390, 844);
describeDoor("desktop", 1280, 900);

test("show password still toggles the sign-in and new-password fields", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/members.html");
  const signIn = page.locator("#siPassword");
  const signBtn = revealBtn(page, "siPassword");
  await expect(signIn).toBeVisible();
  await signIn.fill("CastleDoor");
  await signBtn.click();
  await expect(signIn).toHaveAttribute("type", "text");
  await expect(signIn).toHaveValue("CastleDoor");
  await expect(signBtn).toHaveAttribute("aria-label", "Hide password");
  await signBtn.click();
  await expect(signIn).toHaveAttribute("type", "password");

  await page.evaluate(() => {
    document.getElementById("authStage").style.display = "none";
    document.getElementById("setPasswordStage").style.display = "flex";
  });
  const next = page.locator("#newPassword");
  const nextBtn = revealBtn(page, "newPassword");
  await expect(next).toBeVisible();
  await next.fill("CastleDoor");
  await nextBtn.click();
  await expect(next).toHaveAttribute("type", "text");
  await expect(next).toHaveValue("CastleDoor");
  await expect(nextBtn).toHaveAttribute("aria-label", "Hide password");
  await nextBtn.click();
  await expect(next).toHaveAttribute("type", "password");
  assertHealthy(expect, report, "show password still works");
});

async function stubSupabase(page, opts) {
  await page.route("**/*supabase.co/**", (route) => route.abort());
  await page.route("**/rest/v1/rpc/hub_door_status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts.door),
    })
  );
  if (opts.auth) {
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({
        status: opts.auth.status,
        contentType: "application/json",
        body: JSON.stringify(opts.auth.body),
      })
    );
  }
  if (opts.mail) {
    await page.route("**/functions/v1/hub-password-mail", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    );
  }
}

async function submitSignIn(page, email, password) {
  await page.goto("/members.html");
  await page.waitForFunction(() => window.__kosSb);
  await page.fill("#siEmail", email);
  if (password) await page.fill("#siPassword", password);
  await page.locator("#signinForm button[type=submit]").click();
}

test("sign-in says when the email is not on the krewe roster", async ({ page }) => {
  const report = watchPage(page);
  await stubSupabase(page, {
    door: { status: "not_on_roster", message: "nope" },
  });
  await submitSignIn(page, "missing@example.com", "saved-password");
  const msg = page.locator("#signinMsg");
  await expect(msg).toHaveText(NOT_ON_ROSTER);
  await expect(msg).not.toContainText("password is wrong");
  await expect(msg).not.toContainText("Wild Apricot");
  await expect(msg).not.toContainText("\u2014");
  assertHealthy(expect, report, "not on roster");
});

test("sign-in says the password is wrong and that old Wild Apricot passwords do not work", async ({ page }) => {
  const report = watchPage(page);
  await stubSupabase(page, {
    door: { status: "ready" },
    auth: {
      status: 400,
      body: { error_code: "invalid_credentials", msg: "Invalid login credentials" },
    },
  });
  await submitSignIn(page, "member@example.com", "old-wild-apricot");
  const msg = page.locator("#signinMsg");
  await expect(msg).toHaveText(WRONG_PASSWORD);
  await expect(msg).toContainText("Old Wild Apricot passwords do not work here");
  await expect(msg).not.toContainText("not on the krewe roster");
  await expect(msg).not.toContainText("\u2014");
  assertHealthy(expect, report, "wrong password");
});

test("a roster email with no Hub login yet explains that the typed password will not work", async ({ page }) => {
  const report = watchPage(page);
  await stubSupabase(page, {
    door: { status: "needs_invite" },
    mail: true,
  });
  await submitSignIn(page, "newmember@example.com", "old-wild-apricot");
  const msg = page.locator("#signinMsg");
  await expect(msg).toHaveText(MAILED_AFTER_OLD_PASSWORD);
  await expect(msg).toContainText("Old Wild Apricot passwords do not work here");
  await expect(msg).not.toContainText("not on the krewe roster");
  assertHealthy(expect, report, "needs invite password");
});

test("a different sign-in failure does not claim the email is missing", async ({ page }) => {
  const report = watchPage(page);
  await stubSupabase(page, {
    door: { status: "ready" },
    auth: {
      status: 400,
      body: { error_code: "email_not_confirmed", msg: "Email not confirmed" },
    },
  });
  await submitSignIn(page, "member@example.com", "hub-password");
  const msg = page.locator("#signinMsg");
  await expect(msg).toContainText("confirmed email");
  await expect(msg).not.toContainText("not on the krewe roster");
  await expect(msg).not.toContainText("password is wrong");
  await expect(msg).not.toContainText("Wild Apricot");
  assertHealthy(expect, report, "email not confirmed");
});

test("the reset screen uses the same roster message", async ({ page }) => {
  const report = watchPage(page);
  await stubSupabase(page, {
    door: { status: "not_on_roster", message: "That email is not on the member list." },
  });
  await page.goto("/members.html");
  await page.waitForFunction(() => window.__kosSb);
  await page.locator("#showResetBtn").click();
  await page.fill("#rpEmail", "missing@example.com");
  await page.locator("#resetForm button[type=submit]").click();
  await expect(page.locator("#resetMsg")).toHaveText(NOT_ON_ROSTER);
  await expect(page.locator("#resetMailNote")).toHaveText(MAIL_NOTE);
  assertHealthy(expect, report, "reset roster message");
});
